import streamDeck from '@elgato/streamdeck';
import { PipelineStatus } from '../services/pipeline-service';
import { PullRequest } from '../services/pr-service';

/**
 * Represents the state of an action instance.
 */
export interface ActionState {
    pollingInterval?: NodeJS.Timeout;
    lastStatus?: PipelineStatus | PullRequest[];
    connectionAttempts: number;
    lastUpdate?: Date;
    lastError?: Error;
    isConnecting?: boolean;
    rotationIndex?: number; // For PR status rotation
    lastSettings?: any; // Store last settings to avoid getSettings() feedback loops
}

/**
 * Manages state for Stream Deck action instances.
 * Uses WeakMap to prevent memory leaks when actions are removed.
 */
export class ActionStateManager {
    private states = new Map<string, ActionState>();
    private logger = streamDeck.logger.createScope('ActionStateManager');

    /**
     * Gets or creates state for an action.
     */
    getState(actionId: string | any): ActionState {
        // Convert to string ID for consistent keying
        const key = typeof actionId === 'string' ? actionId : actionId.id;
        
        if (!this.states.has(key)) {
            this.logger.debug('Creating new state', { actionId: key });
            
            this.states.set(key, {
                connectionAttempts: 0,
                rotationIndex: 0
            });
        }
        
        return this.states.get(key)!;
    }

    /**
     * Updates state for an action.
     */
    updateState(actionId: string | any, updates: Partial<ActionState>): void {
        const state = this.getState(actionId);
        Object.assign(state, updates);
        
        const key = typeof actionId === 'string' ? actionId : actionId.id;
        this.logger.debug('State updated', { 
            actionId: key,
            updates: Object.keys(updates)
        });
    }

    /**
     * Sets the polling interval for an action.
     * Clears any existing interval before setting the new one.
     */
    setPollingInterval(actionId: string | any, interval: NodeJS.Timeout): void {
        const state = this.getState(actionId);
        
        if (state.pollingInterval) {
            clearInterval(state.pollingInterval);
            const key = typeof actionId === 'string' ? actionId : actionId.id;
            this.logger.debug('Cleared existing polling interval', { actionId: key });
        }
        
        state.pollingInterval = interval;
        const key = typeof actionId === 'string' ? actionId : actionId.id;
        this.logger.debug('Set new polling interval', { actionId: key });
    }

    /**
     * Stops polling for an action.
     */
    stopPolling(actionId: string | any): void {
        const state = this.getState(actionId);
        
        if (state.pollingInterval) {
            clearInterval(state.pollingInterval);
            state.pollingInterval = undefined;
            
            const key = typeof actionId === 'string' ? actionId : actionId.id;
            this.logger.debug('Stopped polling', { actionId: key });
        }
    }

    /**
     * Increments the connection attempt counter.
     */
    incrementConnectionAttempts(actionId: string | any): number {
        const state = this.getState(actionId);
        state.connectionAttempts++;
        
        const key = typeof actionId === 'string' ? actionId : actionId.id;
        this.logger.debug('Incremented connection attempts', { 
            actionId: key,
            attempts: state.connectionAttempts
        });
        
        return state.connectionAttempts;
    }

    /**
     * Resets the connection attempt counter.
     */
    resetConnectionAttempts(actionId: string | any): void {
        const state = this.getState(actionId);
        state.connectionAttempts = 0;
        
        const key = typeof actionId === 'string' ? actionId : actionId.id;
        this.logger.debug('Reset connection attempts', { actionId: key });
    }

    /**
     * Gets the last status for an action.
     */
    getLastStatus(actionId: string | any): PipelineStatus | PullRequest[] | undefined {
        return this.getState(actionId).lastStatus;
    }

    /**
     * Sets the last status for an action.
     */
    setLastStatus(actionId: string | any, status: PipelineStatus | PullRequest[]): void {
        const state = this.getState(actionId);
        state.lastStatus = status;
        state.lastUpdate = new Date();
        
        const key = typeof actionId === 'string' ? actionId : actionId.id;
        this.logger.debug('Set last status', { 
            actionId: key,
            statusType: typeof status === 'object' && status !== null && 'status' in status ? 'PipelineStatus' : 'PullRequestSummary'
        });
    }

    /**
     * Gets the rotation index for PR status display.
     */
    getRotationIndex(actionId: string | any): number {
        return this.getState(actionId).rotationIndex || 0;
    }

    /**
     * Increments and returns the rotation index.
     */
    incrementRotationIndex(actionId: string | any, maxIndex: number): number {
        const state = this.getState(actionId);
        state.rotationIndex = ((state.rotationIndex || 0) + 1) % maxIndex;
        return state.rotationIndex;
    }

    /**
     * Clears all state for an action.
     * Should be called when an action is removed.
     */
    clearState(actionId: string | any): void {
        const key = typeof actionId === 'string' ? actionId : actionId.id;
        const state = this.states.get(key);
        
        if (state) {
            // Clear any intervals
            if (state.pollingInterval) {
                clearInterval(state.pollingInterval);
            }
            
            // Remove from Map
            this.states.delete(key);
            
            this.logger.info('Cleared state', { actionId: key });
        }
    }

    /**
     * Checks if an action has state.
     */
    hasState(actionId: string | any): boolean {
        const key = typeof actionId === 'string' ? actionId : actionId.id;
        return this.states.has(key);
    }

    /**
     * Gets statistics about managed states.
     */
    getStats(): { activeStates: number; message: string } {
        return {
            activeStates: this.states.size,
            message: `Managing ${this.states.size} action states`
        };
    }
}