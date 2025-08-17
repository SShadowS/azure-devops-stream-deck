import { action, DidReceiveSettingsEvent, KeyDownEvent, SendToPluginEvent, SingletonAction, WillAppearEvent, WillDisappearEvent } from '@elgato/streamdeck';
import { RepositoryStatsService, RepositoryMetrics, RepositorySettings } from '../services/repository-stats-service';
import { CredentialManager } from '../utils/credential-manager';
import { ActionStateManager } from '../utils/action-state-manager';
import streamDeck from '@elgato/streamdeck';

// Settings interface with index signature for SDK compatibility
interface RepositoryStatsSettings {
    // Connection settings
    orgUrl?: string;
    projectName?: string;
    repositoryName?: string;
    pat?: string;
    
    // Repository settings
    branch?: string; // Optional specific branch, otherwise default
    
    // Display settings
    refreshInterval?: number;
    displayMode?: 'commits' | 'contributors' | 'activity' | 'prs' | 'detailed';
    timeRange?: 'today' | 'week' | 'month';
    showTrend?: boolean;
    
    // Index signature for Stream Deck SDK compatibility
    [key: string]: any;
}

@action({ UUID: 'com.sshadows.azure-devops-info.repositorystats' })
export class RepositoryStatsAction extends SingletonAction<RepositoryStatsSettings> {
    private repositoryStatsService: RepositoryStatsService;
    private credentialManager: CredentialManager;
    private stateManager: ActionStateManager;
    private settingsDebounceTimeouts = new Map<string, NodeJS.Timeout>();

    constructor() {
        super();
        this.repositoryStatsService = new RepositoryStatsService(streamDeck.logger);
        this.credentialManager = new CredentialManager(streamDeck.logger);
        this.stateManager = new ActionStateManager();
    }

    override async onWillAppear(ev: WillAppearEvent<RepositoryStatsSettings>): Promise<void> {
        streamDeck.logger.info(`Repository Stats action will appear: ${ev.action.id}`);
        
        const state = this.stateManager.getState(ev.action.id) as any;
        state.lastSettings = ev.payload.settings;
        
        await this.initializeAction(ev.action.id, ev.payload.settings);
    }

    override async onWillDisappear(ev: WillDisappearEvent<RepositoryStatsSettings>): Promise<void> {
        streamDeck.logger.info(`Repository Stats action will disappear: ${ev.action.id}`);
        
        const state = this.stateManager.getState(ev.action.id) as any;
        if (state.intervalId) {
            clearInterval(state.intervalId);
            state.intervalId = undefined;
        }
        
        const debounceTimeout = this.settingsDebounceTimeouts.get(ev.action.id);
        if (debounceTimeout) {
            clearTimeout(debounceTimeout);
            this.settingsDebounceTimeouts.delete(ev.action.id);
        }
    }

    override async onKeyDown(ev: KeyDownEvent<RepositoryStatsSettings>): Promise<void> {
        const state = this.stateManager.getState(ev.action.id) as any;
        
        if (ev.payload.settings?.orgUrl && ev.payload.settings?.projectName && ev.payload.settings?.repositoryName) {
            // Open repository in browser
            const repoUrl = `${ev.payload.settings.orgUrl}/${ev.payload.settings.projectName}/_git/${ev.payload.settings.repositoryName}`;
            streamDeck.system.openUrl(repoUrl);
        }
    }

    override async onDidReceiveSettings(ev: DidReceiveSettingsEvent<RepositoryStatsSettings>): Promise<void> {
        streamDeck.logger.info(`Repository Stats settings updated for action: ${ev.action.id}`);
        
        const existingTimeout = this.settingsDebounceTimeouts.get(ev.action.id);
        if (existingTimeout) {
            clearTimeout(existingTimeout);
        }
        
        const timeout = setTimeout(async () => {
            await this.processSettingsChange(ev.action.id, ev.payload.settings);
            this.settingsDebounceTimeouts.delete(ev.action.id);
        }, 500);
        
        this.settingsDebounceTimeouts.set(ev.action.id, timeout);
    }

    override async onSendToPlugin(ev: SendToPluginEvent<any, RepositoryStatsSettings>): Promise<void> {
        if (ev.payload instanceof Object && 'event' in ev.payload) {
            const currentSettings = await ev.action.getSettings();
            
            switch (ev.payload.event) {
                case 'testConnection':
                    await this.testConnection(ev.action, currentSettings);
                    break;
                case 'getRepositories':
                    await this.sendRepositoryList(ev.action, currentSettings);
                    break;
                case 'getBranches':
                    await this.sendBranchList(ev.action, currentSettings);
                    break;
            }
        }
    }

    private async processSettingsChange(actionId: string, settings: RepositoryStatsSettings): Promise<void> {
        const state = this.stateManager.getState(actionId) as any;
        const oldSettings = state.lastSettings || {};
        state.lastSettings = settings;
        
        const needsRestart = 
            oldSettings.orgUrl !== settings.orgUrl ||
            oldSettings.projectName !== settings.projectName ||
            oldSettings.repositoryName !== settings.repositoryName ||
            oldSettings.pat !== settings.pat ||
            oldSettings.branch !== settings.branch ||
            oldSettings.refreshInterval !== settings.refreshInterval;
        
        if (needsRestart) {
            if (state.intervalId) {
                clearInterval(state.intervalId);
                state.intervalId = undefined;
            }
            
            const action = this.getActionById(actionId);
            if (action) {
                await this.initializeAction(actionId, settings);
            }
        } else {
            // Just update display mode
            const action = this.getActionById(actionId);
            if (action && state.lastMetrics) {
                await this.updateDisplay(action, state.lastMetrics, settings);
            }
        }
    }

    private async initializeAction(actionId: string, settings: RepositoryStatsSettings): Promise<void> {
        const action = this.getActionById(actionId);
        if (!action) return;
        
        if (!this.validateSettings(settings)) {
            await action.setTitle('Configure\nRepository');
            await action.setState(2); // Warning state
            return;
        }
        
        if (settings.pat) {
            settings.pat = this.credentialManager.decrypt(settings.pat);
        }
        
        await this.updateRepositoryStats(actionId, settings);
        
        const state = this.stateManager.getState(actionId) as any;
        const refreshInterval = (settings.refreshInterval || 300) * 1000; // Default 5 minutes
        
        if (state.intervalId) {
            clearInterval(state.intervalId);
        }
        
        state.intervalId = setInterval(async () => {
            await this.updateRepositoryStats(actionId, settings);
        }, refreshInterval);
    }

    private async updateRepositoryStats(actionId: string, settings: RepositoryStatsSettings): Promise<void> {
        const action = this.getActionById(actionId);
        if (!action) return;
        
        const state = this.stateManager.getState(actionId) as any;
        
        try {
            streamDeck.logger.debug(`Fetching repository metrics for action ${actionId}`);
            
            const metrics = await this.repositoryStatsService.getRepositoryMetrics({
                orgUrl: settings.orgUrl!,
                projectName: settings.projectName!,
                repositoryName: settings.repositoryName!,
                pat: settings.pat!,
                branch: settings.branch
            });
            
            state.lastMetrics = metrics;
            state.lastError = undefined;
            
            await this.updateDisplay(action, metrics, settings);
            
        } catch (error) {
            streamDeck.logger.error(`Error fetching repository metrics: ${error}`);
            state.lastError = error instanceof Error ? error.message : 'Unknown error';
            
            await action.setTitle('Error\nFetching\nStats');
            await action.setState(1); // Error state
        }
    }

    private async updateDisplay(action: any, metrics: RepositoryMetrics, settings: RepositoryStatsSettings): Promise<void> {
        const displayMode = settings.displayMode || 'commits';
        
        // Set state based on activity trend
        switch (metrics.activity.trend) {
            case 'increasing':
                await action.setState(0); // Active state (green)
                break;
            case 'stable':
                await action.setState(2); // Normal state (blue)
                break;
            case 'decreasing':
                await action.setState(1); // Low activity state (yellow)
                break;
        }
        
        switch (displayMode) {
            case 'commits':
                await this.displayCommits(action, metrics, settings);
                break;
            case 'contributors':
                await this.displayContributors(action, metrics);
                break;
            case 'activity':
                await this.displayActivity(action, metrics);
                break;
            case 'prs':
                await this.displayPullRequests(action, metrics);
                break;
            case 'detailed':
                await this.displayDetailed(action, metrics);
                break;
            default:
                await this.displayCommits(action, metrics, settings);
        }
    }

    private async displayCommits(action: any, metrics: RepositoryMetrics, settings: RepositoryStatsSettings): Promise<void> {
        const timeRange = settings.timeRange || 'week';
        let count: number;
        let label: string;
        
        switch (timeRange) {
            case 'today':
                count = metrics.commits.todayCount;
                label = 'Today';
                break;
            case 'week':
                count = metrics.commits.weekCount;
                label = 'This Week';
                break;
            case 'month':
                count = metrics.commits.monthCount;
                label = 'This Month';
                break;
            default:
                count = metrics.commits.weekCount;
                label = 'This Week';
        }
        
        const trendIcon = settings.showTrend ? this.getTrendIcon(metrics.activity.trend) : '';
        
        const title = [
            `${count} Commits`,
            label,
            trendIcon ? `${trendIcon} ${metrics.activity.trend}` : metrics.repositoryName
        ].filter(s => s).join('\n');
        
        await action.setTitle(title);
    }

    private async displayContributors(action: any, metrics: RepositoryMetrics): Promise<void> {
        const topContributor = metrics.contributors.topContributors[0];
        const title = [
            `${metrics.contributors.activeContributors} Active`,
            'Contributors',
            topContributor ? `👑 ${topContributor.name.split(' ')[0]}` : ''
        ].filter(s => s).join('\n');
        
        await action.setTitle(title);
    }

    private async displayActivity(action: any, metrics: RepositoryMetrics): Promise<void> {
        const trendIcon = this.getTrendIcon(metrics.activity.trend);
        const title = [
            `${trendIcon} ${metrics.activity.trend}`,
            `${metrics.activity.activeBranches} Branches`,
            metrics.repositoryName
        ].join('\n');
        
        await action.setTitle(title);
    }

    private async displayPullRequests(action: any, metrics: RepositoryMetrics): Promise<void> {
        const title = [
            `${metrics.pullRequests.openCount} Open PRs`,
            `${metrics.pullRequests.mergedThisWeek} Merged`,
            `~${metrics.pullRequests.averageMergeTime}h to merge`
        ].join('\n');
        
        await action.setTitle(title);
    }

    private async displayDetailed(action: any, metrics: RepositoryMetrics): Promise<void> {
        const title = [
            metrics.repositoryName.substring(0, 12),
            `${metrics.commits.weekCount}c ${metrics.pullRequests.openCount}pr`,
            `${metrics.contributors.activeContributors} contributors`,
            metrics.activity.trend
        ].join('\n');
        
        await action.setTitle(title);
    }

    private getTrendIcon(trend: string): string {
        switch (trend) {
            case 'increasing': return '📈';
            case 'stable': return '➡️';
            case 'decreasing': return '📉';
            default: return '';
        }
    }

    private async testConnection(action: any, settings: RepositoryStatsSettings): Promise<void> {
        try {
            if (!this.validateSettings(settings)) {
                await streamDeck.ui.current?.sendToPropertyInspector({
                    event: 'testConnectionResult',
                    status: 'error',
                    message: 'Please fill in all required fields'
                });
                return;
            }
            
            const decryptedSettings = { ...settings };
            if (decryptedSettings.pat) {
                decryptedSettings.pat = this.credentialManager.decrypt(decryptedSettings.pat);
            }
            
            const metrics = await this.repositoryStatsService.getRepositoryMetrics({
                orgUrl: decryptedSettings.orgUrl!,
                projectName: decryptedSettings.projectName!,
                repositoryName: decryptedSettings.repositoryName!,
                pat: decryptedSettings.pat!,
                branch: decryptedSettings.branch
            });
            
            await streamDeck.ui.current?.sendToPropertyInspector({
                event: 'testConnectionResult',
                status: 'success',
                message: `Connected! ${metrics.commits.weekCount} commits this week`
            });
            
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            await streamDeck.ui.current?.sendToPropertyInspector({
                event: 'testConnectionResult',
                status: 'error',
                message: errorMessage
            });
        }
    }

    private async sendRepositoryList(action: any, settings: RepositoryStatsSettings): Promise<void> {
        // For now, send placeholder repositories
        // In a full implementation, fetch actual repositories from Azure DevOps
        const repositories = [
            { label: 'Main Repository', value: 'main-repo' },
            { label: 'Frontend', value: 'frontend' },
            { label: 'Backend', value: 'backend' },
            { label: 'Documentation', value: 'docs' }
        ];
        
        await streamDeck.ui.current?.sendToPropertyInspector({
            event: 'didReceiveRepositories',
            repositories: repositories
        });
    }

    private async sendBranchList(action: any, settings: RepositoryStatsSettings): Promise<void> {
        // For now, send placeholder branches
        const branches = [
            { label: 'Default Branch', value: '' },
            { label: 'main', value: 'main' },
            { label: 'develop', value: 'develop' },
            { label: 'master', value: 'master' }
        ];
        
        await streamDeck.ui.current?.sendToPropertyInspector({
            event: 'didReceiveBranches',
            branches: branches
        });
    }

    private validateSettings(settings: RepositoryStatsSettings): boolean {
        return !!(settings?.orgUrl && settings?.projectName && settings?.repositoryName && settings?.pat);
    }

    private getActionById(actionId: string): any {
        return streamDeck.actions.getActionById(actionId);
    }
}