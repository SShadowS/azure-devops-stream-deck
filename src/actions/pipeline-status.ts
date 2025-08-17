import streamDeck, { action, SingletonAction, WillAppearEvent, KeyDownEvent, DidReceiveSettingsEvent, WillDisappearEvent, SendToPluginEvent, JsonValue } from '@elgato/streamdeck';
import { AzureDevOpsClient, AzureDevOpsConfig } from '../services/azure-devops-client';
import { AzureDevOpsConnectionPool } from '../services/connection-pool';
import { ProfileManager } from '../services/profile-manager';
import { ErrorRecoveryService } from '../services/error-recovery';
import { PipelineService, PipelineStatus, PipelineInfo } from '../services/pipeline-service';
import { StatusDisplayManager, DisplayOptions } from '../utils/status-display';
import { ActionStateManager } from '../utils/action-state-manager';
import { SettingsManager } from '../utils/settings-manager';
import { visualFeedback } from '../utils/visual-feedback';
import { PipelineStatusSettings } from '../types/settings';
import { 
    ConnectionResultMessage
} from '../types/property-inspector';

// PipelineStatusSettings is now imported from '../types/settings'

@action({ UUID: 'com.sshadows.azure-devops-info.pipelinestatus' })
export class PipelineStatusAction extends SingletonAction<PipelineStatusSettings> {
    private connectionPool: AzureDevOpsConnectionPool;
    private profileManager: ProfileManager;
    private errorRecovery: ErrorRecoveryService;
    private stateManager: ActionStateManager;
    private settingsManager: SettingsManager;
    private displayManager: StatusDisplayManager;
    private logger = streamDeck.logger.createScope('PipelineStatusAction');
    private pipelineServices = new Map<string, PipelineService>();
    private readonly MAX_CONNECTION_ATTEMPTS = 3;
    private readonly DEFAULT_REFRESH_INTERVAL = 30; // seconds
    private initializationInProgress = new Set<string>();
    private settingsDebounceTimeouts = new Map<string, NodeJS.Timeout>();

    constructor() {
        super();
        this.connectionPool = AzureDevOpsConnectionPool.getInstance();
        this.profileManager = ProfileManager.getInstance();
        this.errorRecovery = new ErrorRecoveryService();
        this.stateManager = new ActionStateManager();
        this.settingsManager = new SettingsManager();
        this.displayManager = new StatusDisplayManager();
    }

    override async onWillAppear(ev: WillAppearEvent<PipelineStatusSettings>): Promise<void> {
        this.logger.debug('Pipeline status action appearing', { action: ev.action.id });
        
        // Initialize ProfileManager
        await this.profileManager.initialize();
        
        // Check for legacy settings and migrate if necessary
        const settings = await this.migrateSettingsIfNeeded(ev.action, ev.payload.settings);
        
        // Initialize state for this action
        this.stateManager.resetConnectionAttempts(ev.action.id);
        
        // Store initial settings in state manager
        this.stateManager.getState(ev.action.id).lastSettings = settings;
        
        await this.initializeAction(ev.action.id, settings);
    }

    override async onWillDisappear(ev: WillDisappearEvent<PipelineStatusSettings>): Promise<void> {
        this.logger.debug('Pipeline status action disappearing', { action: ev.action.id });
        
        // Stop any active animations
        visualFeedback.stopAnimation(ev.action.id);
        
        // Stop polling
        this.stateManager.stopPolling(ev.action.id);
        
        // Release connection from pool
        const settings = ev.payload.settings;
        if (settings.profileId) {
            this.connectionPool.releaseProfileConnection(settings.profileId);
        } else if (this.isConfigured(settings)) {
            // Legacy connection release
            const config = this.createConfig(settings);
            this.connectionPool.releaseConnection(config);
        }
        
        // Remove pipeline service
        this.pipelineServices.delete(ev.action.id);
        
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
        
        // Clear any existing debounce timeout for this action
        const existingTimeout = this.settingsDebounceTimeouts.get(ev.action.id);
        if (existingTimeout) {
            clearTimeout(existingTimeout);
            this.logger.debug('Cleared existing settings timeout', { actionId: ev.action.id });
        }
        
        // Debounce settings changes to prevent rapid successive calls
        const timeout = setTimeout(async () => {
            try {
                await this.processSettingsChange(ev.action.id, ev.payload.settings);
            } catch (error) {
                this.logger.error('Error processing settings change', error);
            } finally {
                // Clean up timeout reference
                this.settingsDebounceTimeouts.delete(ev.action.id);
            }
        }, 500); // 500ms debounce
        
        this.settingsDebounceTimeouts.set(ev.action.id, timeout);
        this.logger.debug('Settings change debounced', { actionId: ev.action.id });
    }

    private async processSettingsChange(actionId: string, settings: PipelineStatusSettings): Promise<void> {
        this.logger.debug('Processing settings change', { actionId, settings });
        
        // Stop current polling immediately
        this.stateManager.stopPolling(actionId);
        
        // Get action reference
        const action = streamDeck.actions.getActionById(actionId);
        if (!action) return;
        
        // Use the state manager to track old settings instead of calling action.getSettings()
        // which triggers another didReceiveSettings event
        const state = this.stateManager.getState(actionId);
        const oldSettings = state.lastSettings as PipelineStatusSettings || {};
        
        // Validate new settings before doing anything else
        const validation = this.settingsManager.validatePipelineSettings(settings);
        if (!validation.isValid) {
            this.logger.debug('Received invalid settings, stopping all processes', {
                actionId: actionId,
                errors: validation.errors
            });
            
            // Clean up any existing connections and services
            this.pipelineServices.delete(actionId);
            
            // Release any existing connection
            if (this.isConfigured(oldSettings)) {
                const oldConfig = this.createConfig(oldSettings);
                this.connectionPool.releaseConnection(oldConfig);
            }
            
            // Show configuration required and exit - don't attempt any connections
            if (action) {
                await this.showConfigurationRequired(action);
            }
            return;
        }
        
        // Release old connection if config changed
        if (this.hasConfigChanged(oldSettings, settings)) {
            if (this.isConfigured(oldSettings)) {
                const oldConfig = this.createConfig(oldSettings);
                this.connectionPool.releaseConnection(oldConfig);
            }
        }
        
        // Store new settings in state manager for future reference
        this.stateManager.getState(actionId).lastSettings = settings;
        
        // Reset state and reinitialize
        this.stateManager.resetConnectionAttempts(actionId);
        await this.initializeAction(actionId, settings);
    }

    override async onSendToPlugin(ev: SendToPluginEvent<JsonValue, PipelineStatusSettings>): Promise<void> {
        const payload = ev.payload as any;
        this.logger.trace('Pipeline status received message from PI', { 
            actionId: ev.action.id, 
            payload: payload
        });
        
        if (!payload?.event) {
            return;
        }

        switch (payload.event) {
            case 'getProfiles':
                await this.sendProfileList();
                break;
                
            case 'openConfigManager':
                // Open the configuration manager (could open Stream Deck app or show a message)
                this.logger.info('User requested to open Configuration Manager');
                await ev.action.showAlert();
                break;
                
            default:
                this.logger.debug('Unknown event from Property Inspector', { event: payload.event });
        }
    }


    private async initializeAction(actionId: string, settings: PipelineStatusSettings): Promise<void> {
        // Prevent multiple simultaneous initializations for the same action
        if (this.initializationInProgress.has(actionId)) {
            this.logger.debug('Initialization already in progress, skipping', { actionId });
            return;
        }
        
        this.initializationInProgress.add(actionId);
        
        try {
            const action = streamDeck.actions.getActionById(actionId);
            if (!action) {
                this.initializationInProgress.delete(actionId);
                return;
            }

            // Validate settings first - if invalid, show config message and exit immediately
            const validation = this.settingsManager.validatePipelineSettings(settings);
            if (!validation.isValid) {
                this.logger.debug('Pipeline settings validation failed', { 
                    actionId, 
                    errors: validation.errors 
                });
                await this.showConfigurationRequired(action);
                // Stop any existing polling to prevent loops
                this.stateManager.stopPolling(actionId);
                this.initializationInProgress.delete(actionId);
                return;
            }

            // Show connecting animation
            await visualFeedback.showConnecting(action, 1, this.MAX_CONNECTION_ATTEMPTS);

            // Connect to Azure DevOps first
            await this.connectToAzureDevOps(actionId, settings);
            
            // Start polling only after successful connection
            await this.startPolling(actionId, settings);
            
            // Clear loading animation on success
            visualFeedback.stopAnimation(actionId);
            
        } catch (error) {
            this.logger.error('Failed to initialize Pipeline Status action', error);
            const action = streamDeck.actions.getActionById(actionId);
            if (action) {
                await visualFeedback.showError(action, 'Connection Failed');
            }
        } finally {
            // Always remove from initialization set when done
            this.initializationInProgress.delete(actionId);
        }
    }

    private async connectToAzureDevOps(actionId: string, settings: PipelineStatusSettings): Promise<void> {
        let client: AzureDevOpsClient | null = null;
        
        if (settings.profileId) {
            // Use profile-based connection
            client = await this.connectionPool.getConnectionByProfile(settings.profileId);
            if (!client) {
                throw new Error('Failed to get connection from profile');
            }
        } else if (this.isConfigured(settings)) {
            // Use legacy connection for backward compatibility
            const config = this.createConfig(settings);
            client = await this.connectionPool.getConnection(config);
        } else {
            throw new Error('No valid connection configuration');
        }
        
        // Create pipeline service for this action
        const pipelineService = new PipelineService(client);
        this.pipelineServices.set(actionId, pipelineService);
        
        this.logger.info('Connected to Azure DevOps', { actionId, usingProfile: !!settings.profileId });
    }

    private async startPolling(actionId: string, settings: PipelineStatusSettings): Promise<void> {
        // Ensure any existing polling is stopped first
        this.stateManager.stopPolling(actionId);
        
        this.logger.debug('Starting polling for pipeline status', { 
            actionId, 
            interval: settings.refreshInterval || this.DEFAULT_REFRESH_INTERVAL 
        });
        
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
        
        // Validate settings before attempting any API calls
        const validation = this.settingsManager.validatePipelineSettings(settings);
        if (!action || !pipelineService || !validation.isValid) {
            this.logger.debug('Skipping status update due to invalid settings or missing components', {
                actionId,
                hasAction: !!action,
                hasService: !!pipelineService,
                isValid: validation.isValid,
                errors: validation.errors
            });
            return;
        }

        try {
            const pipelineInfo = await pipelineService.getPipelineStatus(settings.pipelineId!, settings.branchName);
            
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
        // Check if profile changed
        if (oldSettings.profileId !== newSettings.profileId) {
            return true;
        }
        
        // Check legacy config changes
        return this.settingsManager.requiresReconnection(oldSettings, newSettings);
    }

    /**
     * Migrate legacy settings to use profiles if needed
     */
    private async migrateSettingsIfNeeded(action: any, settings: PipelineStatusSettings): Promise<PipelineStatusSettings> {
        // If already using profile, no migration needed
        if (settings.profileId) {
            return settings;
        }
        
        // Check if we have legacy settings to migrate
        if (settings.organizationUrl && settings.personalAccessToken) {
            this.logger.info('Migrating legacy settings to profile', { actionId: action.id });
            
            try {
                const migrationResult = await this.profileManager.migrateFromLegacySettings({
                    organizationUrl: settings.organizationUrl,
                    projectName: settings.projectName,
                    personalAccessToken: settings.personalAccessToken
                });
                
                // Update settings to use the profile
                const newSettings: PipelineStatusSettings = {
                    ...settings,
                    profileId: migrationResult.profileId,
                    // Clear legacy fields
                    organizationUrl: undefined,
                    projectName: undefined,
                    personalAccessToken: undefined
                };
                
                // Save the updated settings
                await action.setSettings(newSettings);
                
                this.logger.info('Successfully migrated to profile', { 
                    profileId: migrationResult.profileId,
                    profileName: migrationResult.profileName
                });
                
                return newSettings;
            } catch (error) {
                this.logger.error('Failed to migrate settings', error);
                // Return original settings if migration fails
                return settings;
            }
        }
        
        return settings;
    }

    /**
     * Send profile list to Property Inspector
     */
    private async sendProfileList(): Promise<void> {
        try {
            const profiles = await this.profileManager.getAllProfiles();
            const defaultProfile = await this.profileManager.getDefaultProfile();
            
            const profileList = profiles.map(profile => ({
                id: profile.id,
                name: profile.name,
                isDefault: profile.id === defaultProfile?.id
            }));
            
            await streamDeck.ui.current?.sendToPropertyInspector({
                event: 'profileList',
                profiles: profileList
            });
            
            this.logger.debug(`Sent ${profileList.length} profiles to Property Inspector`);
        } catch (error) {
            this.logger.error('Failed to send profile list', error);
        }
    }

}