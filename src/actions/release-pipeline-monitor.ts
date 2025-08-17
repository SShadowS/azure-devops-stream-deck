import { action, DidReceiveSettingsEvent, KeyDownEvent, SendToPluginEvent, SingletonAction, WillAppearEvent, WillDisappearEvent } from '@elgato/streamdeck';
import { ReleasePipelineService, ReleaseMetrics, ReleaseSettings } from '../services/release-pipeline-service';
import { CredentialManager } from '../utils/credential-manager';
import { ActionStateManager } from '../utils/action-state-manager';
import { IReleasePipelineService, ICredentialManager, IActionStateManager, ILogger } from '../interfaces';
import streamDeck from '@elgato/streamdeck';

// Settings interface with index signature for SDK compatibility
interface ReleasePipelineSettings {
    // Connection settings
    orgUrl?: string;
    projectName?: string;
    releaseDefinitionName?: string;
    releaseDefinitionId?: number;
    pat?: string;
    
    // Display settings
    displayMode?: 'grid' | 'latest' | 'production' | 'approvals' | 'detailed';
    environmentFilter?: string; // Comma-separated list of environments
    refreshInterval?: number;
    showApprovals?: boolean;
    showDuration?: boolean;
    
    // Index signature for Stream Deck SDK compatibility
    [key: string]: any;
}

@action({ UUID: 'com.sshadows.azure-devops-info.releasepipeline' })
export class ReleasePipelineMonitorAction extends SingletonAction<ReleasePipelineSettings> {
    private releasePipelineService: IReleasePipelineService;
    private credentialManager: ICredentialManager;
    private stateManager: IActionStateManager;
    private settingsDebounceTimeouts = new Map<string, NodeJS.Timeout>();

    constructor(
        releasePipelineService?: IReleasePipelineService,
        credentialManager?: ICredentialManager,
        stateManager?: IActionStateManager,
        logger?: ILogger
    ) {
        super();
        const actualLogger = logger || streamDeck.logger;
        this.releasePipelineService = releasePipelineService || new ReleasePipelineService(actualLogger as any);
        this.credentialManager = credentialManager || new CredentialManager(actualLogger as any);
        this.stateManager = stateManager || new ActionStateManager();
    }

    override async onWillAppear(ev: WillAppearEvent<ReleasePipelineSettings>): Promise<void> {
        streamDeck.logger.info(`Release Pipeline Monitor action will appear: ${ev.action.id}`);
        
        const state = this.stateManager.getState(ev.action.id) as any;
        state.lastSettings = ev.payload.settings;
        
        await this.initializeAction(ev.action.id, ev.payload.settings);
    }

    override async onWillDisappear(ev: WillDisappearEvent<ReleasePipelineSettings>): Promise<void> {
        streamDeck.logger.info(`Release Pipeline Monitor action will disappear: ${ev.action.id}`);
        
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

    override async onKeyDown(ev: KeyDownEvent<ReleasePipelineSettings>): Promise<void> {
        const state = this.stateManager.getState(ev.action.id) as any;
        
        if (ev.payload.settings?.orgUrl && ev.payload.settings?.projectName) {
            // Open release pipeline in browser
            let url = `${ev.payload.settings.orgUrl}/${ev.payload.settings.projectName}/_release`;
            
            if (state.lastMetrics?.latestRelease) {
                // Open specific release if available
                url = `${ev.payload.settings.orgUrl}/${ev.payload.settings.projectName}/_releaseProgress?releaseId=${state.lastMetrics.latestRelease.id}`;
            }
            
            streamDeck.system.openUrl(url);
        }
    }

    override async onDidReceiveSettings(ev: DidReceiveSettingsEvent<ReleasePipelineSettings>): Promise<void> {
        streamDeck.logger.info(`Release Pipeline settings updated for action: ${ev.action.id}`);
        
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

    override async onSendToPlugin(ev: SendToPluginEvent<any, ReleasePipelineSettings>): Promise<void> {
        if (ev.payload instanceof Object && 'event' in ev.payload) {
            const currentSettings = await ev.action.getSettings();
            
            switch (ev.payload.event) {
                case 'testConnection':
                    await this.testConnection(ev.action, currentSettings);
                    break;
                case 'getReleaseDefinitions':
                    await this.sendReleaseDefinitionList(ev.action, currentSettings);
                    break;
                case 'getEnvironments':
                    await this.sendEnvironmentList(ev.action, currentSettings);
                    break;
            }
        }
    }

    private async processSettingsChange(actionId: string, settings: ReleasePipelineSettings): Promise<void> {
        const state = this.stateManager.getState(actionId) as any;
        const oldSettings = state.lastSettings || {};
        state.lastSettings = settings;
        
        const needsRestart = 
            oldSettings.orgUrl !== settings.orgUrl ||
            oldSettings.projectName !== settings.projectName ||
            oldSettings.releaseDefinitionName !== settings.releaseDefinitionName ||
            oldSettings.releaseDefinitionId !== settings.releaseDefinitionId ||
            oldSettings.pat !== settings.pat ||
            oldSettings.environmentFilter !== settings.environmentFilter ||
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

    private async initializeAction(actionId: string, settings: ReleasePipelineSettings): Promise<void> {
        const action = this.getActionById(actionId);
        if (!action) return;
        
        if (!this.validateSettings(settings)) {
            await action.setTitle('Configure\nRelease');
            await action.setState(5); // Warning state
            return;
        }
        
        // Create a copy to avoid mutating the original settings
        const decryptedSettings = { ...settings };
        if (decryptedSettings.pat) {
            decryptedSettings.pat = this.credentialManager.decrypt(decryptedSettings.pat);
        }
        
        await this.updateReleaseMetrics(actionId, decryptedSettings);
        
        const state = this.stateManager.getState(actionId) as any;
        const refreshInterval = (settings.refreshInterval || 60) * 1000; // Default 60 seconds
        
        if (state.intervalId) {
            clearInterval(state.intervalId);
        }
        
        state.intervalId = setInterval(async () => {
            await this.updateReleaseMetrics(actionId, decryptedSettings);
        }, refreshInterval);
    }

    private async updateReleaseMetrics(actionId: string, settings: ReleasePipelineSettings): Promise<void> {
        const action = this.getActionById(actionId);
        if (!action) return;
        
        const state = this.stateManager.getState(actionId) as any;
        
        try {
            streamDeck.logger.debug(`Fetching release metrics for action ${actionId}`);
            
            const environmentFilter = settings.environmentFilter 
                ? settings.environmentFilter.split(',').map(e => e.trim())
                : undefined;
            
            const metrics = await this.releasePipelineService.getReleaseMetrics({
                orgUrl: settings.orgUrl!,
                projectName: settings.projectName!,
                pat: settings.pat!,
                definitionId: settings.releaseDefinitionId || 0
            } as any);
            
            state.lastMetrics = metrics;
            state.lastError = undefined;
            
            await this.updateDisplay(action, metrics, settings);
            
        } catch (error) {
            streamDeck.logger.error(`Error fetching release metrics: ${error}`);
            state.lastError = error instanceof Error ? error.message : 'Unknown error';
            
            await action.setTitle('Error\nFetching\nRelease');
            await action.setState(2); // Error state
        }
    }

    private async updateDisplay(action: any, metrics: ReleaseMetrics, settings: ReleasePipelineSettings): Promise<void> {
        const displayMode = settings.displayMode || 'grid';
        
        // Set state based on overall status
        switch (metrics.overallStatus) {
            case 'success':
                await action.setState(0); // Green - all succeeded
                break;
            case 'inprogress':
                await action.setState(1); // Blue - in progress
                break;
            case 'failed':
                await action.setState(2); // Red - failed
                break;
            case 'partial':
                await action.setState(3); // Yellow - partial success
                break;
            case 'notdeployed':
                await action.setState(4); // Gray - not deployed
                break;
            default:
                await action.setState(5); // Unknown
        }
        
        switch (displayMode) {
            case 'grid':
                await this.displayEnvironmentGrid(action, metrics);
                break;
            case 'latest':
                await this.displayLatestRelease(action, metrics);
                break;
            case 'production':
                await this.displayProductionFocus(action, metrics);
                break;
            case 'approvals':
                await this.displayApprovals(action, metrics);
                break;
            case 'detailed':
                await this.displayDetailed(action, metrics);
                break;
            default:
                await this.displayEnvironmentGrid(action, metrics);
        }
    }

    private async displayEnvironmentGrid(action: any, metrics: ReleaseMetrics): Promise<void> {
        if (!metrics.latestRelease) {
            await action.setTitle('No Releases\nFound');
            return;
        }

        const envStatus = metrics.environments
            .slice(0, 4) // Show up to 4 environments
            .map(env => {
                const statusIcon = this.getStatusIcon(env.status);
                return `${statusIcon} ${env.name.substring(0, 8)}`;
            })
            .join('\n');

        const title = [
            metrics.latestRelease.name,
            envStatus
        ].filter(s => s).join('\n');

        await action.setTitle(title);
    }

    private async displayLatestRelease(action: any, metrics: ReleaseMetrics): Promise<void> {
        if (!metrics.latestRelease) {
            await action.setTitle('No Releases\nFound');
            return;
        }

        const timeSinceRelease = this.getTimeSince(metrics.latestRelease.createdOn);
        const statusIcon = this.getOverallStatusIcon(metrics.overallStatus);

        const title = [
            metrics.latestRelease.name,
            `${statusIcon} ${metrics.overallStatus}`,
            timeSinceRelease,
            `by ${metrics.latestRelease.createdBy.split(' ')[0]}`
        ].join('\n');

        await action.setTitle(title);
    }

    private async displayProductionFocus(action: any, metrics: ReleaseMetrics): Promise<void> {
        // Find production environment (usually last in pipeline)
        const prodEnv = metrics.environments.find(e => 
            e.name.toLowerCase().includes('prod') || 
            e.name.toLowerCase().includes('production')
        ) || metrics.environments[metrics.environments.length - 1];

        if (!prodEnv) {
            await action.setTitle('No Production\nEnvironment');
            return;
        }

        const statusIcon = this.getStatusIcon(prodEnv.status);
        const deployTime = prodEnv.deployedOn 
            ? this.getTimeSince(prodEnv.deployedOn)
            : 'Not Deployed';

        const title = [
            'Production',
            prodEnv.deployedVersion || 'No Version',
            `${statusIcon} ${prodEnv.status}`,
            deployTime
        ].join('\n');

        await action.setTitle(title);
    }

    private async displayApprovals(action: any, metrics: ReleaseMetrics): Promise<void> {
        if (metrics.pendingApprovals.length === 0) {
            const title = [
                '✅ No Pending',
                'Approvals',
                '',
                metrics.latestRelease?.name || ''
            ].join('\n');
            await action.setTitle(title);
            return;
        }

        const approval = metrics.pendingApprovals[0];
        const waitTime = this.getTimeSince(approval.createdOn);

        const title = [
            `⏳ ${metrics.pendingApprovals.length} Pending`,
            approval.environmentName,
            waitTime,
            approval.releaseName
        ].join('\n');

        await action.setTitle(title);
    }

    private async displayDetailed(action: any, metrics: ReleaseMetrics): Promise<void> {
        if (!metrics.latestRelease) {
            await action.setTitle('No Releases');
            return;
        }

        const deployedEnvs = metrics.environments.filter(e => 
            e.status === 'Succeeded' || e.status === 'Partially Succeeded'
        ).length;
        const totalEnvs = metrics.environments.length;
        const pendingCount = metrics.pendingApprovals.length;

        const title = [
            metrics.latestRelease.name.substring(0, 15),
            `${deployedEnvs}/${totalEnvs} Deployed`,
            pendingCount > 0 ? `${pendingCount} Approvals` : `${this.getOverallStatusIcon(metrics.overallStatus)} ${metrics.overallStatus}`,
            this.getTimeSince(metrics.latestRelease.createdOn)
        ].join('\n');

        await action.setTitle(title);
    }

    private getStatusIcon(status: string): string {
        switch (status.toLowerCase()) {
            case 'succeeded': return '✅';
            case 'in progress': return '🔄';
            case 'failed': return '❌';
            case 'rejected': return '🚫';
            case 'partially succeeded': return '⚠️';
            case 'canceled': return '⭕';
            case 'queued': return '⏳';
            case 'not started': return '⬜';
            default: return '❓';
        }
    }

    private getOverallStatusIcon(status: string): string {
        switch (status) {
            case 'success': return '✅';
            case 'inprogress': return '🔄';
            case 'failed': return '❌';
            case 'partial': return '⚠️';
            case 'notdeployed': return '⬜';
            default: return '❓';
        }
    }

    private getTimeSince(date: Date): string {
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMins / 60);
        const diffDays = Math.floor(diffHours / 24);

        if (diffDays > 0) {
            return `${diffDays}d ago`;
        } else if (diffHours > 0) {
            return `${diffHours}h ago`;
        } else if (diffMins > 0) {
            return `${diffMins}m ago`;
        } else {
            return 'Just now';
        }
    }

    private async testConnection(action: any, settings: ReleasePipelineSettings): Promise<void> {
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
            
            const environmentFilter = decryptedSettings.environmentFilter 
                ? decryptedSettings.environmentFilter.split(',').map(e => e.trim())
                : undefined;
            
            const metrics = await this.releasePipelineService.getReleaseMetrics({
                orgUrl: decryptedSettings.orgUrl!,
                projectName: decryptedSettings.projectName!,
                pat: decryptedSettings.pat!,
                definitionId: decryptedSettings.releaseDefinitionId || 0
            } as any);
            
            const envCount = metrics.environments.length;
            const message = metrics.latestRelease 
                ? `Connected! Latest: ${metrics.latestRelease.name} (${envCount} environments)`
                : 'Connected! No releases found';
            
            await streamDeck.ui.current?.sendToPropertyInspector({
                event: 'testConnectionResult',
                status: 'success',
                message
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

    private async sendReleaseDefinitionList(action: any, settings: ReleasePipelineSettings): Promise<void> {
        // For now, send placeholder definitions
        // In a full implementation, fetch actual release definitions from Azure DevOps
        const definitions = [
            { label: 'Main Release Pipeline', value: 'main-release' },
            { label: 'Feature Release', value: 'feature-release' },
            { label: 'Hotfix Pipeline', value: 'hotfix' }
        ];
        
        await streamDeck.ui.current?.sendToPropertyInspector({
            event: 'didReceiveReleaseDefinitions',
            definitions: definitions
        });
    }

    private async sendEnvironmentList(action: any, settings: ReleasePipelineSettings): Promise<void> {
        // Common environment names
        const environments = [
            { label: 'Development', value: 'Development' },
            { label: 'Test', value: 'Test' },
            { label: 'UAT', value: 'UAT' },
            { label: 'Staging', value: 'Staging' },
            { label: 'Production', value: 'Production' }
        ];
        
        await streamDeck.ui.current?.sendToPropertyInspector({
            event: 'didReceiveEnvironments',
            environments: environments
        });
    }

    private validateSettings(settings: ReleasePipelineSettings): boolean {
        return !!(settings?.orgUrl && settings?.projectName && 
                 (settings?.releaseDefinitionName || settings?.releaseDefinitionId) && 
                 settings?.pat);
    }

    private getActionById(actionId: string): any {
        return streamDeck.actions.getActionById(actionId);
    }
}