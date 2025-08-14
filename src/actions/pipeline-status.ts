import streamDeck, { action, SingletonAction, WillAppearEvent, KeyDownEvent, DidReceiveSettingsEvent, WillDisappearEvent, SendToPluginEvent } from '@elgato/streamdeck';
import { AzureDevOpsClient, AzureDevOpsConfig } from '../services/azure-devops-client';
import { PipelineService, PipelineStatus, PipelineInfo } from '../services/pipeline-service';
import { StatusDisplayManager, DisplayOptions } from '../utils/status-display';

type PipelineStatusSettings = {
    organizationUrl?: string;
    projectName?: string;
    pipelineId?: number;
    personalAccessToken?: string;
    branchName?: string; // Optional branch filter (e.g., 'main', 'develop', 'refs/heads/main')
    refreshInterval?: number; // in seconds
    displayFormat?: 'icon' | 'text' | 'both';
    showBuildNumber?: boolean;
    showDuration?: boolean;
};

@action({ UUID: 'com.sshadows.azure-devops-info.pipelinestatus' })
export class PipelineStatusAction extends SingletonAction<PipelineStatusSettings> {
    private client: AzureDevOpsClient;
    private pipelineService: PipelineService | null = null;
    private displayManager: StatusDisplayManager;
    private logger = streamDeck.logger.createScope('PipelineStatusAction');
    private pollingIntervals = new Map<string, NodeJS.Timeout>();
    private lastStatus = new Map<string, PipelineStatus>();
    private connectionAttempts = new Map<string, number>();
    private readonly MAX_CONNECTION_ATTEMPTS = 3;
    private readonly DEFAULT_REFRESH_INTERVAL = 30; // seconds

    constructor() {
        super();
        this.client = new AzureDevOpsClient();
        this.displayManager = new StatusDisplayManager();
    }

    override async onWillAppear(ev: WillAppearEvent<PipelineStatusSettings>): Promise<void> {
        this.logger.debug('Pipeline status action appearing', { action: ev.action.id });
        
        await this.initializeAction(ev.action.id, ev.payload.settings);
    }

    override async onWillDisappear(ev: WillDisappearEvent<PipelineStatusSettings>): Promise<void> {
        this.logger.debug('Pipeline status action disappearing', { action: ev.action.id });
        
        this.stopPolling(ev.action.id);
        this.connectionAttempts.delete(ev.action.id);
        this.lastStatus.delete(ev.action.id);
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
        if (this.pipelineService) {
            try {
                const pipelineInfo = await this.pipelineService.getPipelineStatus(settings.pipelineId!);
                
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
        this.stopPolling(ev.action.id);
        
        // Reinitialize with new settings
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
            await (action as any).sendToPropertyInspector({
                event: 'debugLog',
                message: `Plugin received message: ${JSON.stringify(ev.payload)}`,
                data: {
                    payload: ev.payload,
                    keys: ev.payload ? Object.keys(ev.payload) : [],
                    type: typeof ev.payload
                }
            });
        }
        
        // Handle both old and new message formats
        if (ev.payload?.event === 'testConnection') {
            this.logger.info('Handling testConnection event');
            // New format from sdpi-components
            await this.handleTestConnection(ev.action.id, ev.payload.payload || ev.payload);
        } else if (ev.payload && !ev.payload.event) {
            // Direct payload format (might be from sdpi-components)
            // Check if this looks like a test connection request
            if ('organizationUrl' in ev.payload && 'personalAccessToken' in ev.payload) {
                this.logger.info('Handling direct test connection format');
                await this.handleTestConnection(ev.action.id, ev.payload);
            } else {
                this.logger.warn('Unknown message format', { payload: ev.payload });
            }
        } else {
            this.logger.warn('Unhandled message event', { event: ev.payload?.event });
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
            if (settings.pipelineId) {
                this.logger.info('Testing pipeline fetch', { pipelineId: settings.pipelineId });
                const testService = new PipelineService(testClient);
                const pipelineInfo = await testService.getPipelineStatus(settings.pipelineId, settings.branchName);
                this.logger.info('Pipeline fetched successfully', { 
                    pipelineName: pipelineInfo.name,
                    status: pipelineInfo.status 
                });
            }

            // Send success response to Property Inspector
            await (action as any).sendToPropertyInspector({
                event: 'testConnectionResult',
                success: true,
                message: 'Connection successful! Pipeline found.'
            });

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

            await (action as any).sendToPropertyInspector({
                event: 'testConnectionResult',
                success: false,
                message: errorMessage
            });
        }
    }

    private async initializeAction(actionId: string, settings: PipelineStatusSettings): Promise<void> {
        const action = streamDeck.actions.getActionById(actionId);
        if (!action) return;

        if (!this.isConfigured(settings)) {
            await this.showConfigurationRequired(action);
            return;
        }

        try {
            await this.connectToAzureDevOps(settings);
            await this.startPolling(actionId, settings);
        } catch (error) {
            this.logger.error('Failed to initialize action', error);
            await this.showError(action, 'Connection Failed');
        }
    }

    private async connectToAzureDevOps(settings: PipelineStatusSettings): Promise<void> {
        const config: AzureDevOpsConfig = {
            organizationUrl: settings.organizationUrl!,
            personalAccessToken: settings.personalAccessToken!,
            projectName: settings.projectName!
        };

        if (!this.client.isConnected()) {
            await this.client.connect(config);
            this.pipelineService = new PipelineService(this.client);
        }
    }

    private async startPolling(actionId: string, settings: PipelineStatusSettings): Promise<void> {
        // Initial update
        await this.updateStatus(actionId, settings);
        
        // Set up polling
        const interval = (settings.refreshInterval || this.DEFAULT_REFRESH_INTERVAL) * 1000;
        
        const intervalId = setInterval(async () => {
            await this.updateStatus(actionId, settings);
        }, interval);
        
        this.pollingIntervals.set(actionId, intervalId);
    }

    private stopPolling(actionId: string): void {
        const intervalId = this.pollingIntervals.get(actionId);
        if (intervalId) {
            clearInterval(intervalId);
            this.pollingIntervals.delete(actionId);
        }
    }

    private async updateStatus(actionId: string, settings: PipelineStatusSettings): Promise<void> {
        const action = streamDeck.actions.getActionById(actionId);
        if (!action || !this.pipelineService || !settings.pipelineId) {
            return;
        }

        try {
            const pipelineInfo = await this.pipelineService.getPipelineStatus(settings.pipelineId, settings.branchName);
            
            // Check if status changed
            const previousStatus = this.lastStatus.get(actionId);
            if (previousStatus !== pipelineInfo.status) {
                this.lastStatus.set(actionId, pipelineInfo.status);
                
                // Show notification on status change (except on first update)
                if (previousStatus !== undefined) {
                    await this.showStatusNotification(action, pipelineInfo);
                }
            }
            
            // Update display
            await this.updateDisplay(action, pipelineInfo, settings);
            
            // Reset connection attempts on success
            this.connectionAttempts.set(actionId, 0);
            
        } catch (error) {
            this.logger.error('Failed to update status', error);
            
            // Handle connection failures with retry logic
            const attempts = (this.connectionAttempts.get(actionId) || 0) + 1;
            this.connectionAttempts.set(actionId, attempts);
            
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
            await action.showAlert();
        } else if (pipelineInfo.status === PipelineStatus.Succeeded) {
            await action.showOk();
        }
    }

    private async showConfigurationRequired(action: any): Promise<void> {
        await action.setTitle('Configure →');
        await action.setState(0);
    }

    private async showError(action: any, message: string): Promise<void> {
        await action.setTitle(message);
        await action.showAlert();
    }

    private isConfigured(settings: PipelineStatusSettings): boolean {
        return !!(
            settings.organizationUrl &&
            settings.projectName &&
            settings.pipelineId &&
            settings.personalAccessToken
        );
    }
}