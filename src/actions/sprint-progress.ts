import { action, DidReceiveSettingsEvent, KeyDownEvent, SendToPluginEvent, SingletonAction, WillAppearEvent, WillDisappearEvent } from '@elgato/streamdeck';
import { SprintService, SprintMetrics, SprintSettings } from '../services/sprint-service';
import { CredentialManager } from '../utils/credential-manager';
import { ActionStateManager } from '../utils/action-state-manager';
import { ISprintService, ICredentialManager, IActionStateManager, ILogger } from '../interfaces';
import streamDeck from '@elgato/streamdeck';

// Settings interface with index signature for SDK compatibility
interface SprintProgressSettings {
    // Connection settings
    orgUrl?: string;
    projectName?: string;
    teamName?: string;
    pat?: string;
    
    // Sprint settings
    sprintPath?: string; // Optional specific sprint, otherwise current
    
    // Display settings
    refreshInterval?: number;
    displayMode?: 'progress' | 'burndown' | 'velocity' | 'days' | 'detailed';
    showTrend?: boolean;
    alertThreshold?: number; // Alert when behind by this percentage
    
    // Index signature for Stream Deck SDK compatibility
    [key: string]: any;
}

@action({ UUID: 'com.sshadows.azure-devops-info.sprintprogress' })
export class SprintProgressAction extends SingletonAction<SprintProgressSettings> {
    private sprintService: ISprintService;
    private credentialManager: ICredentialManager;
    private stateManager: IActionStateManager;
    private settingsDebounceTimeouts = new Map<string, NodeJS.Timeout>();

    constructor(
        sprintService?: ISprintService,
        credentialManager?: ICredentialManager,
        stateManager?: IActionStateManager,
        logger?: ILogger
    ) {
        super();
        const actualLogger = logger || streamDeck.logger;
        this.sprintService = sprintService || new SprintService(actualLogger as any);
        this.credentialManager = credentialManager || new CredentialManager(actualLogger as any);
        this.stateManager = stateManager || new ActionStateManager();
    }

    override async onWillAppear(ev: WillAppearEvent<SprintProgressSettings>): Promise<void> {
        streamDeck.logger.info(`Sprint Progress action will appear: ${ev.action.id}`);
        
        const state = this.stateManager.getState(ev.action.id) as any;
        state.lastSettings = ev.payload.settings;
        
        await this.initializeAction(ev.action.id, ev.payload.settings);
    }

    override async onWillDisappear(ev: WillDisappearEvent<SprintProgressSettings>): Promise<void> {
        streamDeck.logger.info(`Sprint Progress action will disappear: ${ev.action.id}`);
        
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

    override async onKeyDown(ev: KeyDownEvent<SprintProgressSettings>): Promise<void> {
        const state = this.stateManager.getState(ev.action.id) as any;
        
        if (ev.payload.settings?.orgUrl && ev.payload.settings?.projectName) {
            // Open sprint board in browser
            const sprintUrl = `${ev.payload.settings.orgUrl}/${ev.payload.settings.projectName}/_sprints/taskboard`;
            streamDeck.system.openUrl(sprintUrl);
        }
    }

    override async onDidReceiveSettings(ev: DidReceiveSettingsEvent<SprintProgressSettings>): Promise<void> {
        streamDeck.logger.info(`Sprint Progress settings updated for action: ${ev.action.id}`);
        
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

    override async onSendToPlugin(ev: SendToPluginEvent<any, SprintProgressSettings>): Promise<void> {
        if (ev.payload instanceof Object && 'event' in ev.payload) {
            const currentSettings = await ev.action.getSettings();
            
            switch (ev.payload.event) {
                case 'testConnection':
                    await this.testConnection(ev.action, currentSettings);
                    break;
                case 'getTeams':
                    await this.sendTeamsList(ev.action, currentSettings);
                    break;
                case 'getSprints':
                    await this.sendSprintsList(ev.action, currentSettings);
                    break;
            }
        }
    }

    private async processSettingsChange(actionId: string, settings: SprintProgressSettings): Promise<void> {
        const state = this.stateManager.getState(actionId) as any;
        const oldSettings = state.lastSettings || {};
        state.lastSettings = settings;
        
        const needsRestart = 
            oldSettings.orgUrl !== settings.orgUrl ||
            oldSettings.projectName !== settings.projectName ||
            oldSettings.teamName !== settings.teamName ||
            oldSettings.pat !== settings.pat ||
            oldSettings.sprintPath !== settings.sprintPath ||
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
        }
    }

    private async initializeAction(actionId: string, settings: SprintProgressSettings): Promise<void> {
        const action = this.getActionById(actionId);
        if (!action) return;
        
        if (!this.validateSettings(settings)) {
            await action.setTitle('Configure\nSprint');
            await action.setState(2); // Warning state
            return;
        }
        
        // Create a copy to avoid mutating the original settings
        const decryptedSettings = { ...settings };
        if (decryptedSettings.pat) {
            decryptedSettings.pat = this.credentialManager.decrypt(decryptedSettings.pat);
        }
        
        await this.updateSprintProgress(actionId, decryptedSettings);
        
        const state = this.stateManager.getState(actionId) as any;
        const refreshInterval = (settings.refreshInterval || 300) * 1000; // Default 5 minutes
        
        if (state.intervalId) {
            clearInterval(state.intervalId);
        }
        
        state.intervalId = setInterval(async () => {
            await this.updateSprintProgress(actionId, decryptedSettings);
        }, refreshInterval);
    }

    private async updateSprintProgress(actionId: string, settings: SprintProgressSettings): Promise<void> {
        const action = this.getActionById(actionId);
        if (!action) return;
        
        const state = this.stateManager.getState(actionId) as any;
        
        try {
            streamDeck.logger.debug(`Fetching sprint metrics for action ${actionId}`);
            
            const metrics = await this.sprintService.getCurrentSprintMetrics({
                orgUrl: settings.orgUrl!,
                projectName: settings.projectName!,
                teamName: settings.teamName!,
                pat: settings.pat!,
                sprintPath: settings.sprintPath
            });
            
            state.lastMetrics = metrics;
            state.lastError = undefined;
            
            await this.updateDisplay(action, metrics, settings);
            
        } catch (error) {
            streamDeck.logger.error(`Error fetching sprint metrics: ${error}`);
            state.lastError = error instanceof Error ? error.message : 'Unknown error';
            
            await action.setTitle('Error\nFetching\nSprint');
            await action.setState(1); // Error state
        }
    }

    private async updateDisplay(action: any, metrics: SprintMetrics, settings: SprintProgressSettings): Promise<void> {
        const displayMode = settings.displayMode || 'progress';
        
        // Set state based on burndown trend
        switch (metrics.burndownTrend) {
            case 'complete':
                await action.setState(0); // Success state (green)
                break;
            case 'on-track':
                await action.setState(0); // Normal state (blue)
                break;
            case 'ahead':
                await action.setState(0); // Good state (blue)
                break;
            case 'behind':
                const threshold = settings.alertThreshold || 20;
                const expectedProgress = ((metrics.totalDays - metrics.daysRemaining) / metrics.totalDays) * 100;
                const behindBy = expectedProgress - metrics.percentComplete;
                
                if (behindBy > threshold) {
                    await action.setState(1); // Alert state (red)
                } else {
                    await action.setState(2); // Warning state (yellow)
                }
                break;
        }
        
        switch (displayMode) {
            case 'progress':
                await this.displayProgress(action, metrics);
                break;
            case 'burndown':
                await this.displayBurndown(action, metrics);
                break;
            case 'velocity':
                await this.displayVelocity(action, metrics);
                break;
            case 'days':
                await this.displayDays(action, metrics);
                break;
            case 'detailed':
                await this.displayDetailed(action, metrics);
                break;
            default:
                await this.displayProgress(action, metrics);
        }
    }

    private async displayProgress(action: any, metrics: SprintMetrics): Promise<void> {
        const title = [
            `${metrics.percentComplete}%`,
            `${metrics.completedPoints}/${metrics.totalPoints} pts`,
            metrics.name
        ].join('\n');
        
        await action.setTitle(title);
    }

    private async displayBurndown(action: any, metrics: SprintMetrics): Promise<void> {
        const trendIcon = this.getTrendIcon(metrics.burndownTrend);
        const title = [
            `${trendIcon} ${metrics.burndownTrend}`,
            `${metrics.remainingPoints} pts left`,
            `${metrics.daysRemaining} days`
        ].join('\n');
        
        await action.setTitle(title);
    }

    private async displayVelocity(action: any, metrics: SprintMetrics): Promise<void> {
        const velocity = metrics.velocity || 0;
        const currentRate = metrics.daysRemaining > 0 
            ? Math.round(metrics.completedPoints / (metrics.totalDays - metrics.daysRemaining))
            : metrics.completedPoints;
        
        const title = [
            `Velocity: ${velocity}`,
            `Current: ${currentRate}`,
            `${metrics.percentComplete}%`
        ].join('\n');
        
        await action.setTitle(title);
    }

    private async displayDays(action: any, metrics: SprintMetrics): Promise<void> {
        const title = [
            `${metrics.daysRemaining} days`,
            `${metrics.percentComplete}%`,
            metrics.name
        ].join('\n');
        
        await action.setTitle(title);
    }

    private async displayDetailed(action: any, metrics: SprintMetrics): Promise<void> {
        const title = [
            metrics.name.substring(0, 12),
            `${metrics.completedItems}/${metrics.totalItems}`,
            `${metrics.percentComplete}%`,
            `${metrics.daysRemaining}d`
        ].join('\n');
        
        await action.setTitle(title);
    }

    private getTrendIcon(trend: string): string {
        switch (trend) {
            case 'complete': return '✓';
            case 'ahead': return '↑';
            case 'on-track': return '→';
            case 'behind': return '↓';
            default: return '';
        }
    }

    private async testConnection(action: any, settings: SprintProgressSettings): Promise<void> {
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
                decryptedSettings.pat = await this.credentialManager.decrypt(decryptedSettings.pat);
            }
            
            const metrics = await this.sprintService.getCurrentSprintMetrics({
                orgUrl: decryptedSettings.orgUrl!,
                projectName: decryptedSettings.projectName!,
                teamName: decryptedSettings.teamName!,
                pat: decryptedSettings.pat!,
                sprintPath: decryptedSettings.sprintPath
            });
            
            await streamDeck.ui.current?.sendToPropertyInspector({
                event: 'testConnectionResult',
                status: 'success',
                message: `Connected! Sprint: ${metrics.name} (${metrics.percentComplete}% complete)`
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

    private async sendTeamsList(action: any, settings: SprintProgressSettings): Promise<void> {
        // For now, send placeholder teams
        // In a full implementation, fetch actual teams from Azure DevOps
        const teams = [
            { label: 'Default Team', value: 'Default Team' },
            { label: 'Development Team', value: 'Development Team' },
            { label: 'QA Team', value: 'QA Team' }
        ];
        
        await streamDeck.ui.current?.sendToPropertyInspector({
            event: 'didReceiveTeams',
            teams: teams
        });
    }

    private async sendSprintsList(action: any, settings: SprintProgressSettings): Promise<void> {
        // For now, send placeholder sprints
        const sprints = [
            { label: 'Current Sprint', value: '' },
            { label: 'Previous Sprint', value: 'previous' }
        ];
        
        await streamDeck.ui.current?.sendToPropertyInspector({
            event: 'didReceiveSprints',
            sprints: sprints
        });
    }

    private validateSettings(settings: SprintProgressSettings): boolean {
        return !!(settings?.orgUrl && settings?.projectName && settings?.teamName && settings?.pat);
    }

    private getActionById(actionId: string): any {
        return streamDeck.actions.getActionById(actionId);
    }
}