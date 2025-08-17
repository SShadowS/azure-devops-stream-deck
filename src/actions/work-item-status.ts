import { action, DidReceiveSettingsEvent, KeyDownEvent, SendToPluginEvent, SingletonAction, WillAppearEvent, WillDisappearEvent } from '@elgato/streamdeck';
import { WorkItemService, WorkItemSummary, WorkItemQuerySettings } from '../services/work-item-service';
import { CredentialManager } from '../utils/credential-manager';
import { ActionStateManager } from '../utils/action-state-manager';
import streamDeck from '@elgato/streamdeck';

// Settings interface with index signature for SDK compatibility
interface WorkItemStatusSettings {
    // Connection settings
    orgUrl?: string;
    projectName?: string;
    pat?: string;
    
    // Query settings
    queryType?: 'assigned' | 'created' | 'mentioned' | 'query';
    assignedTo?: string;
    states?: string[];
    workItemTypes?: string[];
    customQuery?: string;
    maxItems?: number;
    includeCompleted?: boolean;
    
    // Display settings
    refreshInterval?: number;
    displayMode?: 'count' | 'list' | 'detailed';
    showPriority?: boolean;
    
    // Index signature for Stream Deck SDK compatibility
    [key: string]: any;
}

@action({ UUID: 'com.sshadows.azure-devops-info.workitemstatus' })
export class WorkItemStatusAction extends SingletonAction<WorkItemStatusSettings> {
    private workItemService: WorkItemService;
    private credentialManager: CredentialManager;
    private stateManager: ActionStateManager;
    private settingsDebounceTimeouts = new Map<string, NodeJS.Timeout>();

    constructor() {
        super();
        this.workItemService = new WorkItemService(streamDeck.logger);
        this.credentialManager = new CredentialManager(streamDeck.logger);
        this.stateManager = new ActionStateManager();
    }

    override async onWillAppear(ev: WillAppearEvent<WorkItemStatusSettings>): Promise<void> {
        streamDeck.logger.info(`Work Item Status action will appear: ${ev.action.id}`);
        
        const state = this.stateManager.getState(ev.action.id) as any;
        state.lastSettings = ev.payload.settings;
        
        await this.initializeAction(ev.action.id, ev.payload.settings);
    }

    override async onWillDisappear(ev: WillDisappearEvent<WorkItemStatusSettings>): Promise<void> {
        streamDeck.logger.info(`Work Item Status action will disappear: ${ev.action.id}`);
        
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
        
        // Clear state for this action
    }

    override async onKeyDown(ev: KeyDownEvent<WorkItemStatusSettings>): Promise<void> {
        const state = this.stateManager.getState(ev.action.id) as any;
        
        if (state.lastWorkItems && state.lastWorkItems.length > 0) {
            const firstItem = state.lastWorkItems[0];
            streamDeck.system.openUrl(firstItem.url);
        } else if (ev.payload.settings?.orgUrl && ev.payload.settings?.projectName) {
            const workItemsUrl = `${ev.payload.settings.orgUrl}/${ev.payload.settings.projectName}/_workitems`;
            streamDeck.system.openUrl(workItemsUrl);
        }
    }

    override async onDidReceiveSettings(ev: DidReceiveSettingsEvent<WorkItemStatusSettings>): Promise<void> {
        streamDeck.logger.info(`Work Item Status settings updated for action: ${ev.action.id}`);
        
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

    override async onSendToPlugin(ev: SendToPluginEvent<any, WorkItemStatusSettings>): Promise<void> {
        if (ev.payload instanceof Object && 'event' in ev.payload) {
            const currentSettings = await ev.action.getSettings();
            
            switch (ev.payload.event) {
                case 'testConnection':
                    await this.testConnection(ev.action, currentSettings);
                    break;
                case 'getWorkItemTypes':
                    await this.sendWorkItemTypes(ev.action, currentSettings);
                    break;
                case 'getIterations':
                    await this.sendIterations(ev.action, currentSettings);
                    break;
            }
        }
    }

    private async processSettingsChange(actionId: string, settings: WorkItemStatusSettings): Promise<void> {
        const state = this.stateManager.getState(actionId) as any;
        const oldSettings = state.lastSettings || {};
        state.lastSettings = settings;
        
        const needsRestart = 
            oldSettings.orgUrl !== settings.orgUrl ||
            oldSettings.projectName !== settings.projectName ||
            oldSettings.pat !== settings.pat ||
            oldSettings.queryType !== settings.queryType ||
            oldSettings.assignedTo !== settings.assignedTo ||
            JSON.stringify(oldSettings.states) !== JSON.stringify(settings.states) ||
            JSON.stringify(oldSettings.workItemTypes) !== JSON.stringify(settings.workItemTypes) ||
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

    private async initializeAction(actionId: string, settings: WorkItemStatusSettings): Promise<void> {
        const action = this.getActionById(actionId);
        if (!action) return;
        
        if (!this.validateSettings(settings)) {
            await action.setTitle('Configure\nWork Items');
            await action.setState(1); // Error state
            return;
        }
        
        if (settings.pat) {
            settings.pat = this.credentialManager.decrypt(settings.pat);
        }
        
        await this.updateWorkItemStatus(actionId, settings);
        
        const state = this.stateManager.getState(actionId) as any;
        const refreshInterval = (settings.refreshInterval || 60) * 1000;
        
        if (state.intervalId) {
            clearInterval(state.intervalId);
        }
        
        state.intervalId = setInterval(async () => {
            await this.updateWorkItemStatus(actionId, settings);
        }, refreshInterval);
    }

    private async updateWorkItemStatus(actionId: string, settings: WorkItemStatusSettings): Promise<void> {
        const action = this.getActionById(actionId);
        if (!action) return;
        
        const state = this.stateManager.getState(actionId) as any;
        
        try {
            streamDeck.logger.debug(`Fetching work items for action ${actionId}`);
            
            const workItems = await this.workItemService.getWorkItems(settings as WorkItemQuerySettings);
            state.lastWorkItems = workItems;
            state.lastError = undefined;
            
            await this.updateDisplay(action, workItems, settings);
            
        } catch (error) {
            streamDeck.logger.error(`Error fetching work items: ${error}`);
            state.lastError = error instanceof Error ? error.message : 'Unknown error';
            
            await action.setTitle('Error\nFetching\nItems');
            await action.setState(1); // Error state
        }
    }

    private async updateDisplay(action: any, workItems: WorkItemSummary[], settings: WorkItemStatusSettings): Promise<void> {
        const displayMode = settings.displayMode || 'count';
        
        if (workItems.length === 0) {
            await action.setTitle('No Work\nItems');
            await action.setState(0); // Normal state
            return;
        }
        
        // Color based on priority of highest priority item
        const highestPriority = Math.min(...workItems.map(wi => wi.priority || 4));
        if (highestPriority <= 1) {
            await action.setState(1); // Critical/High priority - red
        } else if (highestPriority === 2) {
            await action.setState(2); // Medium priority - yellow
        } else {
            await action.setState(0); // Low/Normal priority - blue
        }
        
        switch (displayMode) {
            case 'count':
                await this.displayCount(action, workItems, settings);
                break;
            case 'list':
                await this.displayList(action, workItems);
                break;
            case 'detailed':
                await this.displayDetailed(action, workItems);
                break;
            default:
                await this.displayCount(action, workItems, settings);
        }
    }

    private async displayCount(action: any, workItems: WorkItemSummary[], settings: WorkItemStatusSettings): Promise<void> {
        const count = workItems.length;
        const types = new Map<string, number>();
        
        workItems.forEach(wi => {
            const type = wi.type;
            types.set(type, (types.get(type) || 0) + 1);
        });
        
        let title = `${count}\nWork Item${count !== 1 ? 's' : ''}`;
        
        if (types.size === 1) {
            const [type, typeCount] = Array.from(types.entries())[0];
            title = `${typeCount}\n${type}${typeCount !== 1 ? 's' : ''}`;
        } else if (types.size > 1 && count <= 3) {
            const typeList = Array.from(types.entries())
                .map(([type, cnt]) => `${cnt} ${type}${cnt !== 1 ? 's' : ''}`)
                .join('\n');
            title = typeList;
        }
        
        await action.setTitle(title);
    }

    private async displayList(action: any, workItems: WorkItemSummary[]): Promise<void> {
        const titles = workItems
            .slice(0, 3)
            .map(wi => {
                const title = wi.title.length > 20 
                    ? wi.title.substring(0, 17) + '...' 
                    : wi.title;
                return title;
            })
            .join('\n');
        
        await action.setTitle(titles);
    }

    private async displayDetailed(action: any, workItems: WorkItemSummary[]): Promise<void> {
        const firstItem = workItems[0];
        const title = firstItem.title.length > 15 
            ? firstItem.title.substring(0, 12) + '...' 
            : firstItem.title;
        
        const priority = firstItem.priority ? `P${firstItem.priority}` : '';
        const remaining = workItems.length > 1 ? `+${workItems.length - 1} more` : '';
        
        const display = [title, firstItem.state, priority, remaining]
            .filter(s => s)
            .join('\n');
        
        await action.setTitle(display);
    }

    private async testConnection(action: any, settings: WorkItemStatusSettings): Promise<void> {
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
            
            const workItems = await this.workItemService.getWorkItems(decryptedSettings as WorkItemQuerySettings);
            
            await streamDeck.ui.current?.sendToPropertyInspector({
                event: 'testConnectionResult',
                status: 'success',
                message: `Connected! Found ${workItems.length} work item${workItems.length !== 1 ? 's' : ''}`
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

    private async sendWorkItemTypes(action: any, settings: WorkItemStatusSettings): Promise<void> {
        // For now, send common work item types
        // In a full implementation, we'd fetch these from Azure DevOps
        const types = [
            { label: 'All Types', value: '' },
            { label: 'Bug', value: 'Bug' },
            { label: 'Task', value: 'Task' },
            { label: 'User Story', value: 'User Story' },
            { label: 'Feature', value: 'Feature' },
            { label: 'Epic', value: 'Epic' },
            { label: 'Issue', value: 'Issue' }
        ];
        
        await streamDeck.ui.current?.sendToPropertyInspector({
            event: 'didReceiveWorkItemTypes',
            types: types
        });
    }

    private async sendIterations(action: any, settings: WorkItemStatusSettings): Promise<void> {
        // Placeholder for iteration paths
        // In a full implementation, we'd fetch these from Azure DevOps
        const iterations = [
            { label: 'All Iterations', value: '' },
            { label: 'Current Iteration', value: '@CurrentIteration' }
        ];
        
        await streamDeck.ui.current?.sendToPropertyInspector({
            event: 'didReceiveIterations',
            iterations: iterations
        });
    }

    private validateSettings(settings: WorkItemStatusSettings): boolean {
        return !!(settings?.orgUrl && settings?.projectName && settings?.pat);
    }

    private getActionById(actionId: string): any {
        return streamDeck.actions.getActionById(actionId);
    }
}