/**
 * Tests for ActionStateManager.
 * Verifies WeakMap usage, state management, and memory safety.
 */

import { ActionStateManager } from '../action-state-manager';
import { PipelineStatus } from '../../services/pipeline-service';

describe('ActionStateManager', () => {
    let manager: ActionStateManager;

    beforeEach(() => {
        manager = new ActionStateManager();
        jest.useFakeTimers();
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    describe('State Management', () => {
        it('should initialize empty state for new action', () => {
            const actionId = 'test-action-1';
            const state = manager.getState(actionId);
            
            expect(state).toEqual({
                connectionAttempts: 0,
                rotationIndex: 0
            });
        });

        it('should maintain separate states for different actions', () => {
            const action1 = 'action-1';
            const action2 = 'action-2';
            
            manager.setLastStatus(action1, PipelineStatus.Succeeded);
            manager.setLastStatus(action2, PipelineStatus.Failed);
            
            expect(manager.getState(action1).lastStatus).toBe(PipelineStatus.Succeeded);
            expect(manager.getState(action2).lastStatus).toBe(PipelineStatus.Failed);
        });

        it('should update state properties independently', () => {
            const actionId = 'test-action';
            
            manager.setLastStatus(actionId, PipelineStatus.Running);
            manager.updateState(actionId, { lastError: new Error('Test error') });
            manager.updateState(actionId, { lastUpdate: new Date('2024-01-01') });
            
            const state = manager.getState(actionId);
            expect(state.lastStatus).toBe(PipelineStatus.Running);
            expect(state.lastError?.message).toBe('Test error');
            expect(state.lastUpdate).toEqual(new Date('2024-01-01'));
        });
    });

    describe('Polling Management', () => {
        it('should set and clear polling intervals', () => {
            const actionId = 'test-action';
            const intervalId = setInterval(() => {}, 1000) as NodeJS.Timeout;
            
            manager.setPollingInterval(actionId, intervalId);
            expect(manager.getState(actionId).pollingInterval).toBe(intervalId);
            
            manager.stopPolling(actionId);
            expect(manager.getState(actionId).pollingInterval).toBeUndefined();
            
            clearInterval(intervalId);
        });

        it('should clear existing interval when setting new one', () => {
            const actionId = 'test-action';
            const interval1 = setInterval(() => {}, 1000) as NodeJS.Timeout;
            const interval2 = setInterval(() => {}, 1000) as NodeJS.Timeout;
            
            const clearIntervalSpy = jest.spyOn(global, 'clearInterval');
            
            manager.setPollingInterval(actionId, interval1);
            manager.setPollingInterval(actionId, interval2);
            
            expect(clearIntervalSpy).toHaveBeenCalledWith(interval1);
            expect(manager.getState(actionId).pollingInterval).toBe(interval2);
            
            clearInterval(interval1);
            clearInterval(interval2);
        });

        it('should handle stopping polling when no interval exists', () => {
            const actionId = 'test-action';
            
            // Should not throw
            expect(() => manager.stopPolling(actionId)).not.toThrow();
            expect(manager.getState(actionId).pollingInterval).toBeUndefined();
        });
    });

    describe('Connection Attempts', () => {
        it('should increment connection attempts', () => {
            const actionId = 'test-action';
            
            expect(manager.incrementConnectionAttempts(actionId)).toBe(1);
            expect(manager.incrementConnectionAttempts(actionId)).toBe(2);
            expect(manager.incrementConnectionAttempts(actionId)).toBe(3);
            
            expect(manager.getState(actionId).connectionAttempts).toBe(3);
        });

        it('should reset connection attempts', () => {
            const actionId = 'test-action';
            
            manager.incrementConnectionAttempts(actionId);
            manager.incrementConnectionAttempts(actionId);
            manager.resetConnectionAttempts(actionId);
            
            expect(manager.getState(actionId).connectionAttempts).toBe(0);
        });

        it('should track attempts per action independently', () => {
            const action1 = 'action-1';
            const action2 = 'action-2';
            
            manager.incrementConnectionAttempts(action1);
            manager.incrementConnectionAttempts(action1);
            manager.incrementConnectionAttempts(action2);
            
            expect(manager.getState(action1).connectionAttempts).toBe(2);
            expect(manager.getState(action2).connectionAttempts).toBe(1);
        });
    });

    describe('State Clearing', () => {
        it('should clear all state for an action', () => {
            const actionId = 'test-action';
            const intervalId = setInterval(() => {}, 1000) as NodeJS.Timeout;
            
            // Set various state properties
            manager.setPollingInterval(actionId, intervalId);
            manager.setLastStatus(actionId, PipelineStatus.Succeeded);
            manager.updateState(actionId, { lastError: new Error('Test') });
            manager.incrementConnectionAttempts(actionId);
            
            // Clear state
            manager.clearState(actionId);
            
            // Should have fresh state
            const state = manager.getState(actionId);
            expect(state).toEqual({
                connectionAttempts: 0,
                rotationIndex: 0
            });
            
            clearInterval(intervalId);
        });

        it('should clear polling interval when clearing state', () => {
            const actionId = 'test-action';
            const intervalId = setInterval(() => {}, 1000) as NodeJS.Timeout;
            const clearIntervalSpy = jest.spyOn(global, 'clearInterval');
            
            manager.setPollingInterval(actionId, intervalId);
            manager.clearState(actionId);
            
            expect(clearIntervalSpy).toHaveBeenCalledWith(intervalId);
            
            clearInterval(intervalId);
        });
    });

    describe('Error Management', () => {
        it('should set and retrieve last error', () => {
            const actionId = 'test-action';
            const error = new Error('Test error');
            
            manager.updateState(actionId, { lastError: error });
            expect(manager.getState(actionId).lastError).toBe(error);
        });

        it('should clear error when setting null', () => {
            const actionId = 'test-action';
            const error = new Error('Test error');
            
            manager.updateState(actionId, { lastError: error });
            manager.updateState(actionId, { lastError: undefined });
            
            expect(manager.getState(actionId).lastError).toBeUndefined();
        });
    });

    describe('Update Tracking', () => {
        it('should track last update time', () => {
            const actionId = 'test-action';
            const now = new Date('2024-01-01T12:00:00Z');
            
            manager.updateState(actionId, { lastUpdate: now });
            expect(manager.getState(actionId).lastUpdate).toEqual(now);
        });

        it('should allow null update time', () => {
            const actionId = 'test-action';
            
            manager.updateState(actionId, { lastUpdate: new Date() });
            manager.updateState(actionId, { lastUpdate: undefined });
            
            expect(manager.getState(actionId).lastUpdate).toBeUndefined();
        });
    });

    describe('WeakMap Behavior', () => {
        it('should use action ID as key consistently', () => {
            const actionId = 'consistent-key';
            
            // Multiple operations on same ID
            manager.setLastStatus(actionId, PipelineStatus.Succeeded);
            manager.incrementConnectionAttempts(actionId);
            manager.updateState(actionId, { lastError: new Error('error') });
            
            // Should all affect the same state
            const state = manager.getState(actionId);
            expect(state.lastStatus).toBe(PipelineStatus.Succeeded);
            expect(state.connectionAttempts).toBe(1);
            expect(state.lastError?.message).toBe('error');
        });

        it('should handle string action IDs', () => {
            // WeakMap typically requires objects, but our implementation
            // should handle string IDs by maintaining an internal map
            const stringId = 'string-action-id';
            
            manager.setLastStatus(stringId, PipelineStatus.Unknown);
            expect(manager.getState(stringId).lastStatus).toBe(PipelineStatus.Unknown);
        });

        it('should create new state objects for each action', () => {
            const action1 = 'action-1';
            const action2 = 'action-2';
            
            const state1 = manager.getState(action1);
            const state2 = manager.getState(action2);
            
            expect(state1).not.toBe(state2);
        });
    });

    describe('Thread Safety', () => {
        it('should handle concurrent operations on same action', async () => {
            const actionId = 'concurrent-test';
            
            // Simulate concurrent operations
            await Promise.all([
                Promise.resolve().then(() => manager.incrementConnectionAttempts(actionId)),
                Promise.resolve().then(() => manager.setLastStatus(actionId, PipelineStatus.Succeeded)),
                Promise.resolve().then(() => manager.updateState(actionId, { lastError: new Error('error1') }))
            ]);
            
            // Final state should be consistent
            const state = manager.getState(actionId);
            expect(state.connectionAttempts).toBeGreaterThan(0);
            expect(state.lastStatus).toBeDefined();
            expect(state.lastError).toBeDefined();
        });
    });

    describe('Rotation Index', () => {
        it('should get rotation index', () => {
            const actionId = 'test-action';
            
            // Initial index should be 0
            expect(manager.getRotationIndex(actionId)).toBe(0);
        });

        it('should increment rotation index with wrapping', () => {
            const actionId = 'test-action';
            const maxIndex = 3;
            
            expect(manager.incrementRotationIndex(actionId, maxIndex)).toBe(1);
            expect(manager.incrementRotationIndex(actionId, maxIndex)).toBe(2);
            expect(manager.incrementRotationIndex(actionId, maxIndex)).toBe(0); // Wraps at maxIndex
            expect(manager.incrementRotationIndex(actionId, maxIndex)).toBe(1);
            expect(manager.incrementRotationIndex(actionId, maxIndex)).toBe(2);
        });

        it('should maintain separate rotation indices for different actions', () => {
            const action1 = 'action-1';
            const action2 = 'action-2';
            
            manager.incrementRotationIndex(action1, 5);
            manager.incrementRotationIndex(action1, 5);
            manager.incrementRotationIndex(action2, 5);
            
            expect(manager.getRotationIndex(action1)).toBe(2);
            expect(manager.getRotationIndex(action2)).toBe(1);
        });
    });

    describe('State Existence', () => {
        it('should check if state exists', () => {
            const actionId = 'test-action';
            
            // Initially no state
            expect(manager.hasState(actionId)).toBe(false);
            
            // After accessing state, it exists
            manager.getState(actionId);
            expect(manager.hasState(actionId)).toBe(true);
        });

        it('should report state exists after any operation', () => {
            const actionId = 'test-action';
            
            manager.setLastStatus(actionId, PipelineStatus.Running);
            expect(manager.hasState(actionId)).toBe(true);
        });

        it('should report no state after clearing', () => {
            const actionId = 'test-action';
            
            manager.setLastStatus(actionId, PipelineStatus.Running);
            manager.clearState(actionId);
            
            // After clearing, hasState should return false
            expect(manager.hasState(actionId)).toBe(false);
        });
    });

    describe('Statistics', () => {
        it('should get statistics about active states', () => {
            // Initially no states
            let stats = manager.getStats();
            expect(stats.activeStates).toBe(0);
            expect(stats.message).toContain('Managing 0 action states');
            
            // Add some states
            manager.getState('action-1');
            manager.getState('action-2');
            manager.setLastStatus('action-3', PipelineStatus.Running);
            
            stats = manager.getStats();
            expect(stats.activeStates).toBe(3);
            expect(stats.message).toContain('Managing 3 action states');
        });

        it('should update stats after clearing states', () => {
            manager.getState('action-1');
            manager.getState('action-2');
            
            let stats = manager.getStats();
            expect(stats.activeStates).toBe(2);
            
            manager.clearState('action-1');
            
            stats = manager.getStats();
            expect(stats.activeStates).toBe(1);
        });
    });

    describe('Last Status Management', () => {
        it('should get and set last status', () => {
            const actionId = 'test-action';
            
            // Initially undefined
            expect(manager.getLastStatus(actionId)).toBeUndefined();
            
            // Set and retrieve status
            manager.setLastStatus(actionId, PipelineStatus.Failed);
            expect(manager.getLastStatus(actionId)).toBe(PipelineStatus.Failed);
        });

        it('should handle PR array status', () => {
            const actionId = 'test-action';
            const prStatus = [
                { id: 1, title: 'PR 1' },
                { id: 2, title: 'PR 2' }
            ];
            
            manager.setLastStatus(actionId, prStatus as any);
            expect(manager.getLastStatus(actionId)).toEqual(prStatus);
        });
    });

    describe('Complex State Updates', () => {
        it('should handle multiple simultaneous updates', () => {
            const actionId = 'test-action';
            const now = new Date();
            const error = new Error('Test error');
            
            manager.updateState(actionId, {
                lastUpdate: now,
                lastError: error,
                connectionAttempts: 5,
                rotationIndex: 2
            });
            
            const state = manager.getState(actionId);
            expect(state.lastUpdate).toEqual(now);
            expect(state.lastError).toBe(error);
            expect(state.connectionAttempts).toBe(5);
            expect(state.rotationIndex).toBe(2);
        });

        it('should preserve existing state when updating partial fields', () => {
            const actionId = 'test-action';
            
            manager.setLastStatus(actionId, PipelineStatus.Running);
            manager.updateState(actionId, { connectionAttempts: 3 });
            manager.updateState(actionId, { lastError: new Error('error') });
            
            const state = manager.getState(actionId);
            expect(state.lastStatus).toBe(PipelineStatus.Running);
            expect(state.connectionAttempts).toBe(3);
            expect(state.lastError?.message).toBe('error');
        });
    });

    describe('Action ID with Object Keys', () => {
        it('should handle action objects with id property', () => {
            const action = { id: 'object-action', otherProp: 'value' };
            
            manager.setLastStatus(action, PipelineStatus.Succeeded);
            expect(manager.getState(action).lastStatus).toBe(PipelineStatus.Succeeded);
        });

        it('should use toString for objects without id', () => {
            const action = { toString: () => 'custom-string' };
            
            manager.setLastStatus(action, PipelineStatus.Running);
            expect(manager.getState(action).lastStatus).toBe(PipelineStatus.Running);
        });
    });
});