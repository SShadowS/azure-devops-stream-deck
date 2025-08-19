import { 
    SingletonAction, 
    WillAppearEvent, 
    WillDisappearEvent, 
    KeyDownEvent, 
    DidReceiveSettingsEvent,
    SendToPluginEvent,
    Action,
    JsonValue
} from '@elgato/streamdeck';
import streamDeck from '@elgato/streamdeck';
import { AzureDevOpsConnectionPool } from '../services/connection-pool';
import { ProfileManager } from '../services/profile-manager';
import { ErrorRecoveryService } from '../services/error-recovery';
import { ActionStateManager } from '../utils/action-state-manager';
import { SettingsManager } from '../utils/settings-manager';
import { visualFeedback } from '../utils/visual-feedback';
import { performanceOptimizer } from '../utils/performance-optimizer';
import { ILogger } from '../interfaces';

/**
 * Base settings interface that all Azure DevOps actions must extend
 */
export interface BaseAzureDevOpsSettings {
    profileId?: string;
    refreshInterval?: number;
    [key: string]: any; // For SDK compatibility
}

/**
 * Display data structure for updating Stream Deck button
 */
export interface DisplayData {
    title?: string;
    image?: string;
    state?: number;
    alert?: boolean;
}

/**
 * Abstract base class for all Azure DevOps Stream Deck actions.
 * Provides common functionality for polling, error handling, state management, and display updates.
 */
export abstract class BaseAzureDevOpsAction<T extends BaseAzureDevOpsSettings> extends SingletonAction<T> {
    // Abstract properties that must be defined by subclasses
    protected abstract readonly actionName: string;
    protected abstract readonly defaultRefreshInterval: number;
    protected abstract readonly minRefreshInterval: number;
    protected abstract readonly maxRefreshInterval: number;
    
    // Common services injected via constructor
    protected readonly logger: ILogger;
    protected readonly connectionPool: AzureDevOpsConnectionPool;
    protected readonly profileManager: ProfileManager;
    protected readonly errorRecovery: ErrorRecoveryService;
    protected readonly stateManager: ActionStateManager;
    protected readonly settingsManager: SettingsManager;
    
    // Debounce and polling management
    private settingsDebounceTimeouts = new Map<string, NodeJS.Timeout>();
    private readonly SETTINGS_DEBOUNCE_MS = 500;
    
    constructor(
        logger?: ILogger,
        connectionPool?: AzureDevOpsConnectionPool,
        profileManager?: ProfileManager,
        errorRecovery?: ErrorRecoveryService,
        stateManager?: ActionStateManager,
        settingsManager?: SettingsManager
    ) {
        super();
        
        // Use injected dependencies or defaults
        // Note: Can't use this.actionName in constructor, so use a generic scope
        this.logger = logger || streamDeck.logger.createScope('AzureDevOpsAction');
        this.connectionPool = connectionPool || AzureDevOpsConnectionPool.getInstance();
        this.profileManager = profileManager || ProfileManager.getInstance();
        this.errorRecovery = errorRecovery || new ErrorRecoveryService();
        this.stateManager = stateManager || new ActionStateManager();
        this.settingsManager = settingsManager || new SettingsManager();
    }
    
    // Lifecycle methods
    
    override async onWillAppear(ev: WillAppearEvent<T>): Promise<void> {
        this.logger.info(`${this.actionName} appearing`, { actionId: ev.action.id });
        
        // Initialize ProfileManager if needed
        await this.profileManager.initialize();
        
        // Store initial settings and action reference in state
        const state = this.stateManager.getState(ev.action.id);
        state.lastSettings = ev.payload.settings;
        state.action = ev.action;
        
        // Initialize the action
        await this.initializeAction(ev.action.id, ev.payload.settings);
    }
    
    override async onWillDisappear(ev: WillDisappearEvent<T>): Promise<void> {
        this.logger.info(`${this.actionName} disappearing`, { actionId: ev.action.id });
        
        // Stop any animations
        visualFeedback.stopAnimation(ev.action.id);
        
        // Stop polling
        this.stopPolling(ev.action.id);
        
        // Clean up settings debounce
        const debounceTimeout = this.settingsDebounceTimeouts.get(ev.action.id);
        if (debounceTimeout) {
            clearTimeout(debounceTimeout);
            this.settingsDebounceTimeouts.delete(ev.action.id);
        }
        
        // Allow subclasses to perform cleanup
        await this.cleanup(ev.action.id, ev.payload.settings);
        
        // Clear state
        this.stateManager.clearState(ev.action.id);
    }
    
    override async onKeyDown(ev: KeyDownEvent<T>): Promise<void> {
        this.logger.debug(`${this.actionName} key pressed`, { actionId: ev.action.id });
        
        const settings = ev.payload.settings;
        
        if (!this.isConfigured(settings)) {
            await ev.action.showAlert();
            return;
        }
        
        // Call subclass implementation
        await this.handleKeyPress(ev.action, settings);
    }
    
    override async onDidReceiveSettings(ev: DidReceiveSettingsEvent<T>): Promise<void> {
        this.logger.info(`${this.actionName} settings updated`, { actionId: ev.action.id });
        
        // Debounce rapid settings changes
        const existingTimeout = this.settingsDebounceTimeouts.get(ev.action.id);
        if (existingTimeout) {
            clearTimeout(existingTimeout);
        }
        
        const timeout = setTimeout(async () => {
            await this.processSettingsChange(ev.action.id, ev.payload.settings);
            this.settingsDebounceTimeouts.delete(ev.action.id);
        }, this.SETTINGS_DEBOUNCE_MS);
        
        this.settingsDebounceTimeouts.set(ev.action.id, timeout);
    }
    
    override async onSendToPlugin(ev: SendToPluginEvent<JsonValue, T>): Promise<void> {
        // Allow subclasses to handle custom events
        await this.handlePropertyInspectorEvent(ev);
    }
    
    // Protected methods for subclasses
    
    /**
     * Initializes the action when it appears
     */
    protected async initializeAction(actionId: string, settings: T): Promise<void> {
        if (!this.isConfigured(settings)) {
            await this.showConfigurationRequired(actionId);
            return;
        }
        
        // Start polling
        await this.startPolling(actionId, settings);
    }
    
    /**
     * Starts polling for data updates
     */
    protected async startPolling(actionId: string, settings: T): Promise<void> {
        // Stop any existing polling
        this.stopPolling(actionId);
        
        // Initial update
        await this.updateData(actionId, settings);
        
        // Set up polling interval
        const refreshInterval = this.getRefreshInterval(settings);
        const intervalId = setInterval(async () => {
            await this.updateData(actionId, settings);
        }, refreshInterval * 1000);
        
        // Store interval ID in state
        const state = this.stateManager.getState(actionId);
        state.intervalId = intervalId;
    }
    
    /**
     * Stops polling for the action
     */
    protected stopPolling(actionId: string): void {
        const state = this.stateManager.getState(actionId);
        if (state.intervalId) {
            clearInterval(state.intervalId);
            state.intervalId = undefined;
        }
    }
    
    /**
     * Updates data for the action
     */
    protected async updateData(actionId: string, settings: T): Promise<void> {
        try {
            // Get action from state
            const state = this.stateManager.getState(actionId);
            const action = state.action;
            
            if (action) {
                // Show loading state
                await visualFeedback.showLoading(action);
            }
            
            // Fetch data using subclass implementation
            const data = await this.fetchData(settings);
            
            // Format display data
            const displayData = await this.formatDisplay(data);
            
            // Update display
            await this.updateDisplay(actionId, displayData);
            
            // Clear loading state
            visualFeedback.stopAnimation(actionId);
            
            // Reset error count on success
            this.errorRecovery.clearErrors(actionId);
            
        } catch (error) {
            await this.handleError(actionId, error as Error, settings);
        }
    }
    
    /**
     * Handles errors with retry logic
     */
    protected async handleError(actionId: string, error: Error, settings: T): Promise<void> {
        this.logger.error(`${this.actionName} error`, { actionId, error });
        
        // Get action from state
        const state = this.stateManager.getState(actionId);
        const action = state.action;
        
        if (action) {
            // Show error state
            await visualFeedback.showError(action);
        }
        
        // Use error recovery service
        const shouldRetry = await this.errorRecovery.handleError(actionId, error);
        
        if (shouldRetry) {
            // Retry after delay
            setTimeout(() => {
                this.updateData(actionId, settings);
            }, this.errorRecovery.getRetryDelay(actionId));
        } else {
            // Show persistent error
            if (action) {
                await action.setTitle('Error');
                await action.showAlert();
            }
        }
    }
    
    /**
     * Updates the Stream Deck button display
     */
    protected async updateDisplay(actionId: string, displayData: DisplayData): Promise<void> {
        const state = this.stateManager.getState(actionId);
        const action = state.action;
        
        if (!action) {
            this.logger.warn('No action found for display update', { actionId });
            return;
        }
        
        if (displayData.title !== undefined) {
            await action.setTitle(displayData.title);
        }
        
        if (displayData.image !== undefined) {
            await action.setImage(displayData.image);
        }
        
        if (displayData.state !== undefined) {
            await action.setState(displayData.state);
        }
        
        if (displayData.alert) {
            await action.showAlert();
        }
    }
    
    /**
     * Processes settings changes
     */
    protected async processSettingsChange(actionId: string, newSettings: T): Promise<void> {
        const state = this.stateManager.getState(actionId);
        const oldSettings = state.lastSettings as T;
        
        // Check if critical settings changed
        const needsReinitialization = this.requiresReinitialization(oldSettings, newSettings);
        
        // Store new settings
        state.lastSettings = newSettings;
        
        if (needsReinitialization) {
            // Reinitialize with new settings
            await this.initializeAction(actionId, newSettings);
        } else {
            // Just update refresh interval if needed
            const oldInterval = this.getRefreshInterval(oldSettings);
            const newInterval = this.getRefreshInterval(newSettings);
            
            if (oldInterval !== newInterval) {
                await this.startPolling(actionId, newSettings);
            }
        }
    }
    
    /**
     * Shows configuration required message
     */
    protected async showConfigurationRequired(actionId: string): Promise<void> {
        const state = this.stateManager.getState(actionId);
        const action = state.action;
        
        if (action) {
            await action.setTitle('Setup\nRequired');
            await action.showAlert();
        }
    }
    
    /**
     * Gets the refresh interval from settings
     */
    protected getRefreshInterval(settings: T): number {
        const interval = settings.refreshInterval || this.defaultRefreshInterval;
        return Math.max(this.minRefreshInterval, Math.min(this.maxRefreshInterval, interval));
    }
    
    /**
     * Checks if the action is properly configured
     */
    protected isConfigured(settings: T): boolean {
        // Profile-based configuration check
        return !!settings.profileId;
    }
    
    /**
     * Determines if settings change requires reinitialization
     */
    protected requiresReinitialization(oldSettings: T | undefined, newSettings: T): boolean {
        if (!oldSettings) return true;
        
        // Profile change always requires reinitialization
        return oldSettings.profileId !== newSettings.profileId;
    }
    
    // Abstract methods that subclasses must implement
    
    /**
     * Fetches data from Azure DevOps
     */
    protected abstract fetchData(settings: T): Promise<any>;
    
    /**
     * Formats data for display
     */
    protected abstract formatDisplay(data: any): Promise<DisplayData>;
    
    /**
     * Handles key press events
     */
    protected abstract handleKeyPress(action: Action, settings: T): Promise<void>;
    
    /**
     * Handles Property Inspector events
     */
    protected abstract handlePropertyInspectorEvent(ev: SendToPluginEvent<JsonValue, T>): Promise<void>;
    
    /**
     * Performs cleanup when action disappears
     */
    protected abstract cleanup(actionId: string, settings: T): Promise<void>;
}