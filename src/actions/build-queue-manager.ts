import { action, DidReceiveSettingsEvent, KeyDownEvent, SendToPluginEvent, SingletonAction, WillAppearEvent, WillDisappearEvent } from '@elgato/streamdeck';
import { BuildQueueService, BuildQueueMetrics, BuildQueueSettings } from '../services/build-queue-service';
import { CredentialManager } from '../utils/credential-manager';
import { ActionStateManager } from '../utils/action-state-manager';
import { IBuildQueueService, ICredentialManager, IActionStateManager, ILogger } from '../interfaces';
import streamDeck from '@elgato/streamdeck';

// Settings interface with index signature for SDK compatibility
interface BuildQueueManagerSettings {
    // Connection settings
    orgUrl?: string;
    projectName?: string;
    buildDefinitionName?: string;
    buildDefinitionId?: number;
    pat?: string;
    
    // Queue settings
    poolName?: string;
    branch?: string;
    
    // Display settings
    displayMode?: 'queue' | 'active' | 'agents' | 'quick' | 'detailed';
    refreshInterval?: number;
    showEstimates?: boolean;
    autoQueue?: boolean;
    
    // Quick action settings
    quickAction?: 'queue' | 'cancel' | 'retry';
    
    // Index signature for Stream Deck SDK compatibility
    [key: string]: any;
}

@action({ UUID: 'com.sshadows.azure-devops-info.buildqueue' })
export class BuildQueueManagerAction extends SingletonAction<BuildQueueManagerSettings> {
    private buildQueueService: IBuildQueueService;
    private credentialManager: ICredentialManager;
    private stateManager: IActionStateManager;
    private settingsDebounceTimeouts = new Map<string, NodeJS.Timeout>();

    constructor(
        buildQueueService?: IBuildQueueService,
        credentialManager?: ICredentialManager,
        stateManager?: IActionStateManager,
        logger?: ILogger
    ) {
        super();
        const actualLogger = logger || streamDeck.logger;
        this.buildQueueService = buildQueueService || new BuildQueueService(actualLogger as any);
        this.credentialManager = credentialManager || new CredentialManager(actualLogger as any);
        this.stateManager = stateManager || new ActionStateManager();
    }

    override async onWillAppear(ev: WillAppearEvent<BuildQueueManagerSettings>): Promise<void> {
        streamDeck.logger.info(`Build Queue Manager action will appear: ${ev.action.id}`);
        
        const state = this.stateManager.getState(ev.action.id) as any;
        state.lastSettings = ev.payload.settings;
        
        await this.initializeAction(ev.action.id, ev.payload.settings);
    }

    override async onWillDisappear(ev: WillDisappearEvent<BuildQueueManagerSettings>): Promise<void> {
        streamDeck.logger.info(`Build Queue Manager action will disappear: ${ev.action.id}`);
        
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

    override async onKeyDown(ev: KeyDownEvent<BuildQueueManagerSettings>): Promise<void> {
        const state = this.stateManager.getState(ev.action.id) as any;
        const settings = ev.payload.settings;
        
        if (!this.validateSettings(settings)) {
            return;
        }

        // Handle quick actions
        const quickAction = settings.quickAction || 'queue';
        
        try {
            switch (quickAction) {
                case 'queue':
                    await this.queueNewBuild(ev.action.id, settings);
                    break;
                    
                case 'cancel':
                    await this.cancelLatestBuild(ev.action.id, settings);
                    break;
                    
                case 'retry':
                    await this.retryFailedBuild(ev.action.id, settings);
                    break;
                    
                default:
                    // Open builds page in browser
                    if (settings.orgUrl && settings.projectName) {
                        const url = `${settings.orgUrl}/${settings.projectName}/_build`;
                        streamDeck.system.openUrl(url);
                    }
            }
        } catch (error) {
            streamDeck.logger.error('Error handling quick action:', error);
            await ev.action.showAlert();
        }
    }

    override async onDidReceiveSettings(ev: DidReceiveSettingsEvent<BuildQueueManagerSettings>): Promise<void> {
        streamDeck.logger.info(`Build Queue settings updated for action: ${ev.action.id}`);
        
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

    override async onSendToPlugin(ev: SendToPluginEvent<any, BuildQueueManagerSettings>): Promise<void> {
        if (ev.payload instanceof Object && 'event' in ev.payload) {
            const currentSettings = await ev.action.getSettings();
            
            switch (ev.payload.event) {
                case 'testConnection':
                    await this.testConnection(ev.action, currentSettings);
                    break;
                case 'getBuildDefinitions':
                    await this.sendBuildDefinitionList(ev.action, currentSettings);
                    break;
                case 'getAgentPools':
                    await this.sendAgentPoolList(ev.action, currentSettings);
                    break;
                case 'queueBuild':
                    await this.queueNewBuild(ev.action.id, currentSettings);
                    break;
                case 'cancelAllBuilds':
                    await this.cancelAllQueuedBuilds(ev.action.id, currentSettings);
                    break;
            }
        }
    }

    private async processSettingsChange(actionId: string, settings: BuildQueueManagerSettings): Promise<void> {
        const state = this.stateManager.getState(actionId) as any;
        const oldSettings = state.lastSettings || {};
        state.lastSettings = settings;
        
        const needsRestart = 
            oldSettings.orgUrl !== settings.orgUrl ||
            oldSettings.projectName !== settings.projectName ||
            oldSettings.buildDefinitionName !== settings.buildDefinitionName ||
            oldSettings.buildDefinitionId !== settings.buildDefinitionId ||
            oldSettings.pat !== settings.pat ||
            oldSettings.poolName !== settings.poolName ||
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
            // Just update display
            const action = this.getActionById(actionId);
            if (action && state.lastMetrics) {
                await this.updateDisplay(action, state.lastMetrics, settings);
            }
        }
    }

    private async initializeAction(actionId: string, settings: BuildQueueManagerSettings): Promise<void> {
        const action = this.getActionById(actionId);
        if (!action) return;
        
        if (!this.validateSettings(settings)) {
            await action.setTitle('Configure\nBuild Queue');
            await action.setState(3); // Warning state
            return;
        }
        
        // Create a copy to avoid mutating the original settings
        const decryptedSettings = { ...settings };
        if (decryptedSettings.pat) {
            decryptedSettings.pat = this.credentialManager.decrypt(decryptedSettings.pat);
        }
        
        await this.updateQueueMetrics(actionId, decryptedSettings);
        
        const state = this.stateManager.getState(actionId) as any;
        const refreshInterval = (settings.refreshInterval || 30) * 1000; // Default 30 seconds
        
        if (state.intervalId) {
            clearInterval(state.intervalId);
        }
        
        state.intervalId = setInterval(async () => {
            await this.updateQueueMetrics(actionId, decryptedSettings);
        }, refreshInterval);
    }

    private async updateQueueMetrics(actionId: string, settings: BuildQueueManagerSettings): Promise<void> {
        const action = this.getActionById(actionId);
        if (!action) return;
        
        const state = this.stateManager.getState(actionId) as any;
        
        try {
            streamDeck.logger.debug(`Fetching build queue metrics for action ${actionId}`);
            
            const metrics = await this.buildQueueService.getQueueMetrics({
                orgUrl: settings.orgUrl!,
                projectName: settings.projectName!,
                pat: settings.pat!,
                poolId: settings.poolId,
                definitionId: settings.buildDefinitionId,
                buildDefinitionName: settings.buildDefinitionName,
                buildDefinitionId: settings.buildDefinitionId,
                poolName: settings.poolName,
                branch: settings.branch
            } as any);
            
            state.lastMetrics = metrics;
            state.lastError = undefined;
            
            await this.updateDisplay(action, metrics, settings);
            
        } catch (error) {
            streamDeck.logger.error(`Error fetching build queue metrics: ${error}`);
            state.lastError = error instanceof Error ? error.message : 'Unknown error';
            
            await action.setTitle('Error\nFetching\nQueue');
            await action.setState(2); // Error state
        }
    }

    private async updateDisplay(action: any, metrics: BuildQueueMetrics, settings: BuildQueueManagerSettings): Promise<void> {
        const displayMode = settings.displayMode || 'queue';
        
        // Set state based on queue status
        if (metrics.queueLength === 0 && metrics.runningBuilds.length === 0) {
            await action.setState(0); // Idle (green)
        } else if (metrics.queueLength > 5 || metrics.estimatedWaitTime > 60) {
            await action.setState(2); // Busy (red)
        } else if (metrics.runningBuilds.length > 0) {
            await action.setState(1); // Active (blue)
        } else {
            await action.setState(3); // Normal (gray)
        }
        
        switch (displayMode) {
            case 'queue':
                await this.displayQueueStatus(action, metrics);
                break;
            case 'active':
                await this.displayActiveBuilds(action, metrics);
                break;
            case 'agents':
                await this.displayAgentStatus(action, metrics);
                break;
            case 'quick':
                await this.displayQuickActions(action, metrics, settings);
                break;
            case 'detailed':
                await this.displayDetailed(action, metrics);
                break;
            default:
                await this.displayQueueStatus(action, metrics);
        }
    }

    private async displayQueueStatus(action: any, metrics: BuildQueueMetrics): Promise<void> {
        const waitTime = metrics.estimatedWaitTime > 0 
            ? `~${metrics.estimatedWaitTime}m wait`
            : 'Ready';

        const title = [
            `${metrics.queueLength} Queued`,
            `${metrics.runningBuilds.length} Running`,
            waitTime,
            `${metrics.agentStatus.availableAgents}/${metrics.agentStatus.totalAgents} agents`
        ].join('\n');

        await action.setTitle(title);
    }

    private async displayActiveBuilds(action: any, metrics: BuildQueueMetrics): Promise<void> {
        if (metrics.runningBuilds.length === 0) {
            await action.setTitle('No Active\nBuilds');
            return;
        }

        const build = metrics.runningBuilds[0];
        const duration = build.startTime 
            ? Math.round((Date.now() - new Date(build.startTime).getTime()) / 60000)
            : 0;

        const title = [
            build.buildNumber,
            `${duration}m running`,
            build.requestedBy.split(' ')[0],
            build.sourceBranch.replace('refs/heads/', '')
        ].join('\n');

        await action.setTitle(title);
    }

    private async displayAgentStatus(action: any, metrics: BuildQueueMetrics): Promise<void> {
        const agentStatus = metrics.agentStatus;
        
        const title = [
            agentStatus.poolName,
            `${agentStatus.onlineAgents}/${agentStatus.totalAgents} Online`,
            `${agentStatus.busyAgents} Busy`,
            `${agentStatus.availableAgents} Available`
        ].join('\n');

        await action.setTitle(title);
    }

    private async displayQuickActions(action: any, metrics: BuildQueueMetrics, settings: BuildQueueManagerSettings): Promise<void> {
        const quickAction = settings.quickAction || 'queue';
        let actionText = '';
        
        switch (quickAction) {
            case 'queue':
                actionText = '🚀 Queue Build';
                break;
            case 'cancel':
                actionText = '❌ Cancel Build';
                break;
            case 'retry':
                actionText = '🔄 Retry Failed';
                break;
        }

        const title = [
            actionText,
            `${metrics.queueLength} in queue`,
            `${metrics.runningBuilds.length} running`
        ].join('\n');

        await action.setTitle(title);
    }

    private async displayDetailed(action: any, metrics: BuildQueueMetrics): Promise<void> {
        const title = [
            `Q:${metrics.queueLength} R:${metrics.runningBuilds.length}`,
            `Wait: ~${metrics.estimatedWaitTime}m`,
            `Agents: ${metrics.agentStatus.availableAgents}/${metrics.agentStatus.totalAgents}`,
            `Avg: ${metrics.averageBuildTime}m`
        ].join('\n');

        await action.setTitle(title);
    }

    private async queueNewBuild(actionId: string, settings: BuildQueueManagerSettings): Promise<void> {
        try {
            if (!this.validateSettings(settings)) {
                throw new Error('Invalid settings');
            }

            const decryptedSettings = { ...settings };
            if (decryptedSettings.pat) {
                decryptedSettings.pat = this.credentialManager.decrypt(decryptedSettings.pat);
            }

            // Use the interface signature for now to avoid TypeScript issues
            const definitionId = decryptedSettings.buildDefinitionId || 0;
            const queuedBuild = await this.buildQueueService.queueBuild(
                {
                    orgUrl: decryptedSettings.orgUrl!,
                    projectName: decryptedSettings.projectName!,
                    pat: decryptedSettings.pat!
                },
                definitionId,
                decryptedSettings.branch
            );

            streamDeck.logger.info(`Build queued: ${queuedBuild.buildNumber}`);
            
            const action = this.getActionById(actionId);
            if (action) {
                await action.showOk();
                // Refresh metrics
                await this.updateQueueMetrics(actionId, settings);
            }
        } catch (error) {
            streamDeck.logger.error('Error queuing build:', error);
            const action = this.getActionById(actionId);
            if (action) {
                await action.showAlert();
            }
        }
    }

    private async cancelLatestBuild(actionId: string, settings: BuildQueueManagerSettings): Promise<void> {
        try {
            const state = this.stateManager.getState(actionId) as any;
            const metrics = state.lastMetrics as BuildQueueMetrics;
            
            if (!metrics || metrics.runningBuilds.length === 0) {
                throw new Error('No running builds to cancel');
            }

            const decryptedSettings = { ...settings };
            if (decryptedSettings.pat) {
                decryptedSettings.pat = this.credentialManager.decrypt(decryptedSettings.pat);
            }

            const buildToCancel = metrics.runningBuilds[0];
            await this.buildQueueService.cancelBuild({
                orgUrl: decryptedSettings.orgUrl!,
                projectName: decryptedSettings.projectName!,
                pat: decryptedSettings.pat!
            }, buildToCancel.id);

            streamDeck.logger.info(`Build cancelled: ${buildToCancel.buildNumber}`);
            
            const action = this.getActionById(actionId);
            if (action) {
                await action.showOk();
                // Refresh metrics
                await this.updateQueueMetrics(actionId, settings);
            }
        } catch (error) {
            streamDeck.logger.error('Error cancelling build:', error);
            const action = this.getActionById(actionId);
            if (action) {
                await action.showAlert();
            }
        }
    }

    private async retryFailedBuild(actionId: string, settings: BuildQueueManagerSettings): Promise<void> {
        try {
            const state = this.stateManager.getState(actionId) as any;
            const metrics = state.lastMetrics as BuildQueueMetrics;
            
            if (!metrics || !metrics.recentBuilds) {
                throw new Error('No recent builds to retry');
            }

            // Find the most recent failed build
            const failedBuild = metrics.recentBuilds.find(b => b.result === 'Failed');
            if (!failedBuild) {
                throw new Error('No failed builds to retry');
            }

            const decryptedSettings = { ...settings };
            if (decryptedSettings.pat) {
                decryptedSettings.pat = this.credentialManager.decrypt(decryptedSettings.pat);
            }

            const retriedBuild = await this.buildQueueService.retryBuild({
                orgUrl: decryptedSettings.orgUrl!,
                projectName: decryptedSettings.projectName!,
                pat: decryptedSettings.pat!
            }, failedBuild.id);

            streamDeck.logger.info(`Build retried: ${retriedBuild.buildNumber}`);
            
            const action = this.getActionById(actionId);
            if (action) {
                await action.showOk();
                // Refresh metrics
                await this.updateQueueMetrics(actionId, settings);
            }
        } catch (error) {
            streamDeck.logger.error('Error retrying build:', error);
            const action = this.getActionById(actionId);
            if (action) {
                await action.showAlert();
            }
        }
    }

    private async cancelAllQueuedBuilds(actionId: string, settings: BuildQueueManagerSettings): Promise<void> {
        try {
            const state = this.stateManager.getState(actionId) as any;
            const metrics = state.lastMetrics as BuildQueueMetrics;
            
            if (!metrics || metrics.queuedBuilds.length === 0) {
                throw new Error('No queued builds to cancel');
            }

            const decryptedSettings = { ...settings };
            if (decryptedSettings.pat) {
                decryptedSettings.pat = this.credentialManager.decrypt(decryptedSettings.pat);
            }

            // Cancel all queued builds
            for (const build of metrics.queuedBuilds) {
                await this.buildQueueService.cancelBuild({
                    orgUrl: decryptedSettings.orgUrl!,
                    projectName: decryptedSettings.projectName!,
                    pat: decryptedSettings.pat!
                }, build.id);
            }

            streamDeck.logger.info(`Cancelled ${metrics.queuedBuilds.length} queued builds`);
            
            // Refresh metrics
            await this.updateQueueMetrics(actionId, settings);
        } catch (error) {
            streamDeck.logger.error('Error cancelling queued builds:', error);
        }
    }

    private async testConnection(action: any, settings: BuildQueueManagerSettings): Promise<void> {
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
            
            const metrics = await this.buildQueueService.getQueueMetrics({
                orgUrl: decryptedSettings.orgUrl!,
                projectName: decryptedSettings.projectName!,
                pat: decryptedSettings.pat!,
                poolId: decryptedSettings.poolId,
                definitionId: decryptedSettings.buildDefinitionId,
                buildDefinitionName: decryptedSettings.buildDefinitionName,
                buildDefinitionId: decryptedSettings.buildDefinitionId,
                poolName: decryptedSettings.poolName
            } as any);
            
            await streamDeck.ui.current?.sendToPropertyInspector({
                event: 'testConnectionResult',
                status: 'success',
                message: `Connected! ${metrics.queueLength} builds in queue, ${metrics.agentStatus.availableAgents} agents available`
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

    private async sendBuildDefinitionList(action: any, settings: BuildQueueManagerSettings): Promise<void> {
        // For now, send placeholder definitions
        const definitions = [
            { label: 'Main Build', value: 'main-build' },
            { label: 'CI Build', value: 'ci-build' },
            { label: 'PR Validation', value: 'pr-validation' },
            { label: 'Nightly Build', value: 'nightly' }
        ];
        
        await streamDeck.ui.current?.sendToPropertyInspector({
            event: 'didReceiveBuildDefinitions',
            definitions: definitions
        });
    }

    private async sendAgentPoolList(action: any, settings: BuildQueueManagerSettings): Promise<void> {
        // Common agent pool names
        const pools = [
            { label: 'Default', value: 'Default' },
            { label: 'Azure Pipelines', value: 'Azure Pipelines' },
            { label: 'Hosted Ubuntu', value: 'Hosted Ubuntu' },
            { label: 'Hosted Windows', value: 'Hosted Windows' },
            { label: 'Self-Hosted', value: 'Self-Hosted' }
        ];
        
        await streamDeck.ui.current?.sendToPropertyInspector({
            event: 'didReceiveAgentPools',
            pools: pools
        });
    }

    private validateSettings(settings: BuildQueueManagerSettings): boolean {
        return !!(settings?.orgUrl && settings?.projectName && settings?.pat);
    }

    private getActionById(actionId: string): any {
        return streamDeck.actions.getActionById(actionId);
    }
}