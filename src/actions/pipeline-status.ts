import streamDeck, { action, SingletonAction, WillAppearEvent, KeyDownEvent, DidReceiveSettingsEvent, WillDisappearEvent, SendToPluginEvent } from '@elgato/streamdeck';
import { AzureDevOpsClient, AzureDevOpsConfig } from '../services/azure-devops-client';
import { AzureDevOpsConnectionPool } from '../services/connection-pool';
import { ErrorRecoveryService } from '../services/error-recovery';
import { PipelineService, PipelineStatus, PipelineInfo } from '../services/pipeline-service';
import { StatusDisplayManager, DisplayOptions } from '../utils/status-display';
import { ActionStateManager } from '../utils/action-state-manager';
import { SettingsManager } from '../utils/settings-manager';
import { visualFeedback } from '../utils/visual-feedback';
import { PipelineStatusSettings } from '../types/settings';
import { 
    ConnectionResultMessage, 
    isTestConnectionMessage,
    extractMessagePayload 
} from '../types/property-inspector';

// PipelineStatusSettings is now imported from '../types/settings'

@action({ UUID: 'com.sshadows.azure-devops-info.pipelinestatus' })
export class PipelineStatusAction extends SingletonAction<PipelineStatusSettings> {
    private connectionPool: AzureDevOpsConnectionPool;
    private errorRecovery: ErrorRecoveryService;
    private stateManager: ActionStateManager;
    private settingsManager: SettingsManager;
    private displayManager: StatusDisplayManager;
    private logger = streamDeck.logger.createScope('PipelineStatusAction');
    private pipelineServices = new Map<string, PipelineService>();
    private readonly MAX_CONNECTION_ATTEMPTS = 3;
    private readonly DEFAULT_REFRESH_INTERVAL = 30; // seconds

    constructor() {
        super();
        this.connectionPool = AzureDevOpsConnectionPool.getInstance();
        this.errorRecovery = new ErrorRecoveryService();
        this.stateManager = new ActionStateManager();
        this.settingsManager = new SettingsManager();
        this.displayManager = new StatusDisplayManager();
    }

    override async onWillAppear(ev: WillAppearEvent<PipelineStatusSettings>): Promise<void> {
        this.logger.debug('Pipeline status action appearing', { action: ev.action.id });
        
        // Initialize state for this action
        this.stateManager.resetConnectionAttempts(ev.action.id);
        
        await this.initializeAction(ev.action.id, ev.payload.settings);
    }

    override async onWillDisappear(ev: WillDisappearEvent<PipelineStatusSettings>): Promise<void> {
        this.logger.debug('Pipeline status action disappearing', { action: ev.action.id });
        
        // Stop any active animations
        visualFeedback.stopAnimation(ev.action.id);
        
        // Stop polling
        this.stateManager.stopPolling(ev.action.id);
        
        // Release connection from pool
        const settings = ev.payload.settings;
        if (this.isConfigured(settings)) {
            const config = this.createConfig(settings);
            this.connectionPool.releaseConnection(config);
            
            // Remove pipeline service
            this.pipelineServices.delete(ev.action.id);
        }
        
        // Clear all state for this action
        this.stateManager.clearState(ev.action.id);
    }

    override async onKeyDown(ev: KeyDownEvent<PipelineStatusSettings>): Promise<void> {
        this.logger.debug('Key pressed', { action: ev.action.id });
        
        const settings = ev.payload.settings;
        
        if (!this.isConfigured(settings)) {
            // Show alert animation
            await ev.action.showAlert();
            return;
        }

        // Get the latest pipeline info to get the URL
        const pipelineService = this.pipelineServices.get(ev.action.id);
        if (pipelineService) {
            try {
                const pipelineInfo = await pipelineService.getPipelineStatus(settings.pipelineId!, settings.branchName);
                
                if (pipelineInfo.url) {
                    await streamDeck.system.openUrl(pipelineInfo.url);
                } else {
                    // Construct URL manually if not available
                    const url = `${settings.organizationUrl}/${settings.projectName}/_build?definitionId=${settings.pipelineId}`;
                    await streamDeck.system.openUrl(url);
                }
            } catch (error) {
                this.logger.error('Failed to open pipeline URL', error);
                await ev.action.showAlert();
            }
        }
    }

    override async onDidReceiveSettings(ev: DidReceiveSettingsEvent<PipelineStatusSettings>): Promise<void> {
        this.logger.debug('Settings received', { action: ev.action.id, settings: ev.payload.settings });
        
        // Stop current polling
        this.stateManager.stopPolling(ev.action.id);
        
        // Release old connection if config changed
        const oldSettings = await ev.action.getSettings();
        if (this.hasConfigChanged(oldSettings, ev.payload.settings)) {
            if (this.isConfigured(oldSettings)) {
                const oldConfig = this.createConfig(oldSettings);
                this.connectionPool.releaseConnection(oldConfig);
            }
        }
        
        // Reset state and reinitialize
        this.stateManager.resetConnectionAttempts(ev.action.id);
        await this.initializeAction(ev.action.id, ev.payload.settings);
    }

    override async onSendToPlugin(ev: SendToPluginEvent<any, PipelineStatusSettings>): Promise<void> {
        this.logger.info('Message from Property Inspector', { 
            actionId: ev.action.id, 
            payload: ev.payload,
            payloadKeys: ev.payload ? Object.keys(ev.payload) : [],
            payloadType: typeof ev.payload 
        });
        
        // Send debug info back to Property Inspector
        const action = streamDeck.actions.getActionById(ev.action.id);
        if (action) {
            streamDeck.ui.current?.sendToPropertyInspector({
                event: 'debugLog',
                message: `Plugin received message: ${JSON.stringify(ev.payload)}`,
                data: {
                    payload: ev.payload,
                    keys: ev.payload ? Object.keys(ev.payload) : [],
                    type: typeof ev.payload
                }
            });
        }
        
        // Extract the actual payload from various formats
        const actualPayload = extractMessagePayload(ev.payload);
        
        // Handle test connection request with type safety
        if (isTestConnectionMessage(actualPayload)) {
            this.logger.info('Handling testConnection event');
            await this.handleTestConnection(ev.action.id, actualPayload);
        } else {
            this.logger.warn('Unhandled message event', { 
                event: actualPayload?.event,
                payload: this.settingsManager.sanitize(actualPayload || {})
            });
        }
    }

    private async handleTestConnection(actionId: string, settings: PipelineStatusSettings): Promise<void> {
        const action = streamDeck.actions.getActionById(actionId);
        if (!action) {
            this.logger.error('Action not found for test connection', { actionId });
            return;
        }

        this.logger.info('Starting test connection', { 
            actionId,
            hasOrgUrl: !!settings.organizationUrl,
            hasProject: !!settings.projectName,
            hasPipelineId: !!settings.pipelineId,
            hasPAT: !!settings.personalAccessToken
        });

        try {
            // Test the connection with provided settings
            const config: AzureDevOpsConfig = {
                organizationUrl: settings.organizationUrl!,
                personalAccessToken: settings.personalAccessToken!,
                projectName: settings.projectName!
            };

            this.logger.info('Creating test client with config', { 
                organizationUrl: config.organizationUrl,
                projectName: config.projectName
            });

            // Create a temporary client for testing
            const testClient = new AzureDevOpsClient();
            await testClient.connect(config);
            
            this.logger.info('Client connected successfully');
            
            // Test fetching pipeline info
            let pipelineInfo = undefined;
            if (settings.pipelineId) {
                this.logger.info('Testing pipeline fetch', { pipelineId: settings.pipelineId });
                const testService = new PipelineService(testClient);
                pipelineInfo = await testService.getPipelineStatus(settings.pipelineId, settings.branchName);
                this.logger.info('Pipeline fetched successfully', { 
                    pipelineName: pipelineInfo.name,
                    status: pipelineInfo.status 
                });
            }

            // Send success response to Property Inspector
            const successMessage: ConnectionResultMessage = {
                event: 'connectionResult',
                success: true,
                message: pipelineInfo ? 'Connection successful! Pipeline found.' : 'Connection successful!',
                details: pipelineInfo ? {
                    pipelineInfo: pipelineInfo
                } : undefined
            };
            streamDeck.ui.current?.sendToPropertyInspector(successMessage);

            this.logger.info('Test connection successful', { actionId });
        } catch (error: any) {
            this.logger.error('Test connection failed', { 
                actionId, 
                error: error.message,
                stack: error.stack,
                statusCode: error.statusCode,
                response: error.response
            });
            
            // Send error response to Property Inspector
            let errorMessage = 'Connection failed: ';
            if (error.message?.includes('401') || error.statusCode === 401) {
                errorMessage += 'Invalid Personal Access Token';
            } else if (error.message?.includes('404') || error.statusCode === 404) {
                errorMessage += 'Pipeline or project not found';
            } else if (error.message?.includes('ENOTFOUND')) {
                errorMessage += 'Invalid organization URL';
            } else if (error.message?.includes('ECONNREFUSED')) {
                errorMessage += 'Connection refused - check organization URL';
            } else {
                errorMessage += error.message || 'Unknown error';
            }

            const errorResponse: ConnectionResultMessage = {
                event: 'connectionResult',
                success: false,
                message: errorMessage
            };
            streamDeck.ui.current?.sendToPropertyInspector(errorResponse);
        }
    }

    private async initializeAction(actionId: string, settings: PipelineStatusSettings): Promise<void> {
        const action = streamDeck.actions.getActionById(actionId);
        if (!action) return;

        if (!this.isConfigured(settings)) {
            await this.showConfigurationRequired(action);
            return;
        }

        // Show connecting animation
        await visualFeedback.showConnecting(action, 1, this.MAX_CONNECTION_ATTEMPTS);

        // Use error recovery service for initialization
        const result = await this.errorRecovery.tryWithRetry(
            async () => {
                await this.connectToAzureDevOps(actionId, settings);
                await this.startPolling(actionId, settings);
            },
            {
                maxAttempts: this.MAX_CONNECTION_ATTEMPTS,
                shouldRetry: (error) => {
                    // Don't retry on authentication errors
                    if (error.message?.includes('401') || error.message?.includes('403')) {
                        return false;
                    }
                    return true;
                }
            },
            (error, attempt, nextDelay) => {
                this.logger.warn('Retrying initialization', { actionId, attempt, nextDelay });
                visualFeedback.showConnecting(action, attempt + 1, this.MAX_CONNECTION_ATTEMPTS);
            }
        );

        if (!result.success) {
            this.logger.error('Failed to initialize action after retries', result.error);
            const errorMessage = this.errorRecovery.formatErrorMessage(result.error!);
            await visualFeedback.showError(action, errorMessage);
        } else {
            // Clear loading animation on success
            visualFeedback.stopAnimation(actionId);
        }
    }

    private async connectToAzureDevOps(actionId: string, settings: PipelineStatusSettings): Promise<void> {
        const config = this.createConfig(settings);
        
        // Get connection from pool
        const client = await this.connectionPool.getConnection(config);
        
        // Create pipeline service for this action
        const pipelineService = new PipelineService(client);
        this.pipelineServices.set(actionId, pipelineService);
        
        this.logger.info('Connected to Azure DevOps', { actionId });
    }

    private async startPolling(actionId: string, settings: PipelineStatusSettings): Promise<void> {
        // Initial update
        await this.updateStatus(actionId, settings);
        
        // Set up polling
        const interval = (settings.refreshInterval || this.DEFAULT_REFRESH_INTERVAL) * 1000;
        
        const intervalId = setInterval(async () => {
            await this.updateStatus(actionId, settings);
        }, interval);
        
        // Store interval in state manager
        this.stateManager.setPollingInterval(actionId, intervalId);
    }

    // This method is no longer needed as state manager handles it
    // Keeping for compatibility but delegating to state manager
    private stopPolling(actionId: string): void {
        this.stateManager.stopPolling(actionId);
    }

    private async updateStatus(actionId: string, settings: PipelineStatusSettings): Promise<void> {
        const action = streamDeck.actions.getActionById(actionId);
        const pipelineService = this.pipelineServices.get(actionId);
        
        if (!action || !pipelineService || !settings.pipelineId) {
            return;
        }

        try {
            const pipelineInfo = await pipelineService.getPipelineStatus(settings.pipelineId, settings.branchName);
            
            // Check if status changed
            const state = this.stateManager.getState(actionId);
            const previousStatus = state.lastStatus as PipelineStatus | undefined;
            
            if (previousStatus !== pipelineInfo.status) {
                this.stateManager.setLastStatus(actionId, pipelineInfo.status);
                
                // Show notification on status change (except on first update)
                if (previousStatus !== undefined) {
                    await this.showStatusNotification(action, pipelineInfo);
                }
            }
            
            // Update display
            await this.updateDisplay(action, pipelineInfo, settings);
            
            // Reset connection attempts on success
            this.stateManager.resetConnectionAttempts(actionId);
            
        } catch (error) {
            this.logger.error('Failed to update status', error);
            
            // Handle connection failures with retry logic
            const attempts = this.stateManager.incrementConnectionAttempts(actionId);
            
            if (attempts >= this.MAX_CONNECTION_ATTEMPTS) {
                await this.showError(action, 'Connection Lost');
                this.stopPolling(actionId);
            } else {
                await this.showError(action, 'Retrying...');
            }
        }
    }

    private async updateDisplay(action: any, pipelineInfo: PipelineInfo, settings: PipelineStatusSettings): Promise<void> {
        const displayOptions: DisplayOptions = {
            format: settings.displayFormat || 'both',
            showBuildNumber: settings.showBuildNumber ?? true,
            showDuration: settings.showDuration ?? false
        };
        
        const title = this.displayManager.formatStatusText(pipelineInfo, displayOptions);
        
        await action.setTitle(title);
        
        // Set state based on status for visual feedback
        const stateMap: Record<PipelineStatus, number> = {
            [PipelineStatus.Succeeded]: 0,
            [PipelineStatus.Failed]: 1,
            [PipelineStatus.Running]: 2,
            [PipelineStatus.PartiallySucceeded]: 3,
            [PipelineStatus.Canceled]: 4,
            [PipelineStatus.Unknown]: 5,
            [PipelineStatus.NotStarted]: 6
        };
        
        const state = stateMap[pipelineInfo.status] ?? 5;
        await action.setState(state);
    }

    private async showStatusNotification(action: any, pipelineInfo: PipelineInfo): Promise<void> {
        const statusLabel = this.displayManager.getStatusLabel(pipelineInfo.status);
        const message = `Pipeline ${pipelineInfo.name}: ${statusLabel}`;
        
        if (pipelineInfo.status === PipelineStatus.Failed) {
            await visualFeedback.flash(action, 3, 200);
            await action.showAlert();
        } else if (pipelineInfo.status === PipelineStatus.Succeeded) {
            await action.showOk();
        }
    }

    private async showConfigurationRequired(action: any): Promise<void> {
        await visualFeedback.showWarning(action, 'Configure →', {
            duration: 0,  // Keep showing until configured
            pulseInterval: 2000
        });
    }

    private async showError(action: any, message: string): Promise<void> {
        await visualFeedback.showError(action, message, {
            duration: 0,  // Keep showing error
            showAlert: true
        });
    }

    private isConfigured(settings: PipelineStatusSettings): boolean {
        const validation = this.settingsManager.validatePipelineSettings(settings);
        return validation.isValid;
    }

    private createConfig(settings: PipelineStatusSettings): AzureDevOpsConfig {
        return {
            organizationUrl: settings.organizationUrl!,
            personalAccessToken: settings.personalAccessToken!,
            projectName: settings.projectName!
        };
    }

    private hasConfigChanged(oldSettings: PipelineStatusSettings, newSettings: PipelineStatusSettings): boolean {
        return this.settingsManager.requiresReconnection(oldSettings, newSettings);
    }
}