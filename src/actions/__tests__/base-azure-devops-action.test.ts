/**
 * Comprehensive tests for BaseAzureDevOpsAction
 * Tests common functionality, lifecycle methods, dependency injection, and error handling
 */

import { jest } from '@jest/globals';
import { BaseAzureDevOpsAction, BaseAzureDevOpsSettings, DisplayData } from '../base-azure-devops-action';
import { 
    createMockLogger,
    createMockConnectionPool,
    createMockProfileManager,
    createMockErrorRecoveryService,
    createMockStateManager,
    createMockAction,
    createMockEvent,
    resetAllMocks
} from '../../test-utils/mock-factories';
import { WillAppearEvent, WillDisappearEvent, DidReceiveSettingsEvent, SendToPluginEvent, KeyDownEvent } from '@elgato/streamdeck';

// Test settings interface
interface TestSettings extends BaseAzureDevOpsSettings {
    testProperty?: string;
    orgUrl?: string;
    pat?: string;
}

// Concrete implementation for testing
class TestAction extends BaseAzureDevOpsAction<TestSettings> {
    protected readonly actionName = 'TestAction';
    protected readonly defaultRefreshInterval = 30000;
    protected readonly minRefreshInterval = 10000;
    protected readonly maxRefreshInterval = 300000;

    protected async fetchData(settings: TestSettings): Promise<any> {
        return { status: 'success', data: 'test-data' };
    }

    protected async formatDisplay(data: any): Promise<DisplayData> {
        return {
            title: data.status,
            state: 0
        };
    }

    protected async handleKeyPress(action: any, settings: TestSettings): Promise<void> {
        await action.showOk();
    }

    protected async handlePropertyInspectorEvent(ev: any): Promise<void> {
        // Mock implementation
    }

    protected async cleanup(actionId: string, settings: TestSettings): Promise<void> {
        // Mock implementation
    }
}

describe('BaseAzureDevOpsAction', () => {
    let testAction: TestAction;
    let mockLogger: any;
    let mockConnectionPool: any;
    let mockProfileManager: any;
    let mockErrorRecovery: any;
    let mockStateManager: any;
    let mockSettingsManager: any;
    let mockAction: any;

    beforeEach(() => {
        // Create all mocks
        mockLogger = createMockLogger();
        mockConnectionPool = createMockConnectionPool();
        mockProfileManager = createMockProfileManager();
        mockErrorRecovery = createMockErrorRecoveryService();
        mockStateManager = createMockStateManager();
        mockSettingsManager = { validateSettings: jest.fn().mockReturnValue({ isValid: true, errors: [] }) };
        mockAction = createMockAction();

        // Create test action with injected dependencies
        testAction = new TestAction(
            mockLogger,
            mockConnectionPool,
            mockProfileManager,
            mockErrorRecovery,
            mockStateManager,
            mockSettingsManager
        );
    });

    afterEach(() => {
        resetAllMocks(
            mockLogger,
            mockConnectionPool,
            mockProfileManager,
            mockErrorRecovery,
            mockStateManager,
            mockSettingsManager,
            mockAction
        );
        jest.clearAllTimers();
    });

    describe('Constructor and Dependency Injection', () => {
        it('should initialize with injected dependencies', () => {
            expect(testAction['logger']).toBe(mockLogger);
            expect(testAction['connectionPool']).toBe(mockConnectionPool);
            expect(testAction['profileManager']).toBe(mockProfileManager);
            expect(testAction['errorRecovery']).toBe(mockErrorRecovery);
            expect(testAction['stateManager']).toBe(mockStateManager);
            expect(testAction['settingsManager']).toBe(mockSettingsManager);
        });

        it('should create action with default dependencies when none provided', () => {
            const defaultAction = new TestAction();
            expect(defaultAction['logger']).toBeDefined();
            expect(defaultAction['connectionPool']).toBeDefined();
            expect(defaultAction['profileManager']).toBeDefined();
            expect(defaultAction['errorRecovery']).toBeDefined();
            expect(defaultAction['stateManager']).toBeDefined();
            expect(defaultAction['settingsManager']).toBeDefined();
        });

        it('should have correct action properties', () => {
            expect(testAction['actionName']).toBe('TestAction');
            expect(testAction['defaultRefreshInterval']).toBe(30000);
            expect(testAction['minRefreshInterval']).toBe(10000);
            expect(testAction['maxRefreshInterval']).toBe(300000);
        });
    });

    describe('Lifecycle Methods', () => {
        describe('onWillAppear', () => {
            it('should initialize action on appear', async () => {
                const settings: TestSettings = { testProperty: 'test', refreshInterval: 30000 };
                const event = createMockEvent(settings, mockAction, 'willAppear') as unknown as WillAppearEvent<TestSettings>;

                await testAction.onWillAppear(event);

                expect(mockLogger.info).toHaveBeenCalledWith(
                    'TestAction appearing',
                    { actionId: mockAction.id }
                );
                expect(mockProfileManager.initialize).toHaveBeenCalled();
                expect(mockStateManager.getState).toHaveBeenCalledWith(mockAction.id);
            });

            it('should store initial settings in state', async () => {
                const settings: TestSettings = { testProperty: 'test' };
                const event = createMockEvent(settings, mockAction, 'willAppear') as unknown as WillAppearEvent<TestSettings>;
                const mockState = { lastSettings: {}, action: null };
                mockStateManager.getState.mockReturnValue(mockState);

                await testAction.onWillAppear(event);

                expect(mockState.lastSettings).toBe(settings);
                expect(mockState.action).toBe(mockAction);
            });

            it('should handle initialization errors gracefully', async () => {
                const settings: TestSettings = {};
                const event = createMockEvent(settings, mockAction, 'willAppear') as unknown as WillAppearEvent<TestSettings>;
                mockProfileManager.initialize.mockRejectedValue(new Error('Init failed'));

                await expect(testAction.onWillAppear(event)).rejects.toThrow('Init failed');
                expect(mockLogger.info).toHaveBeenCalled();
            });
        });

        describe('onWillDisappear', () => {
            it('should cleanup resources on disappear', async () => {
                const event = createMockEvent({}, mockAction, 'willDisappear') as unknown as WillDisappearEvent<TestSettings>;
                const mockState = { 
                    pollingInterval: setTimeout(() => {}, 1000),
                    intervalId: setTimeout(() => {}, 1000)
                };
                mockStateManager.getState.mockReturnValue(mockState);

                await testAction.onWillDisappear(event);

                expect(mockLogger.info).toHaveBeenCalledWith(
                    'TestAction disappearing',
                    { actionId: mockAction.id }
                );
                expect(mockStateManager.clearState).toHaveBeenCalledWith(mockAction.id);
            });

            it('should handle missing state gracefully', async () => {
                const event = createMockEvent({}, mockAction, 'willDisappear') as unknown as WillDisappearEvent<TestSettings>;
                mockStateManager.getState.mockReturnValue({});

                await testAction.onWillDisappear(event);

                expect(mockStateManager.clearState).toHaveBeenCalledWith(mockAction.id);
            });
        });

        describe('onDidReceiveSettings', () => {
            beforeEach(() => {
                jest.useFakeTimers();
            });

            afterEach(() => {
                jest.useRealTimers();
            });

            it('should debounce settings changes', async () => {
                const settings: TestSettings = { refreshInterval: 60000 };
                const event = createMockEvent(settings, mockAction, 'didReceiveSettings') as unknown as DidReceiveSettingsEvent<TestSettings>;

                // Call multiple times rapidly
                testAction.onDidReceiveSettings(event);
                testAction.onDidReceiveSettings(event);
                testAction.onDidReceiveSettings(event);

                // Advance timers but not enough to trigger debounce
                jest.advanceTimersByTime(400);
                expect(mockLogger.debug).not.toHaveBeenCalledWith(
                    expect.stringContaining('Settings changed')
                );

                // Advance to trigger debounce
                jest.advanceTimersByTime(200);
                expect(mockLogger.debug).toHaveBeenCalledWith(
                    'Settings changed for TestAction',
                    expect.any(Object)
                );
            });

            it('should validate settings changes', async () => {
                const settings: TestSettings = { refreshInterval: 60000 };
                const event = createMockEvent(settings, mockAction, 'didReceiveSettings') as unknown as DidReceiveSettingsEvent<TestSettings>;
                mockSettingsManager.validateSettings.mockReturnValue({ 
                    isValid: false, 
                    errors: ['Invalid refresh interval'] 
                });

                testAction.onDidReceiveSettings(event);
                jest.advanceTimersByTime(600);

                expect(mockSettingsManager.validateSettings).toHaveBeenCalledWith(settings);
                expect(mockAction.showAlert).toHaveBeenCalled();
            });

            it('should handle valid settings changes', async () => {
                const oldSettings: TestSettings = { refreshInterval: 30000 };
                const newSettings: TestSettings = { refreshInterval: 60000 };
                const event = createMockEvent(newSettings, mockAction, 'didReceiveSettings') as unknown as DidReceiveSettingsEvent<TestSettings>;
                
                const mockState = { lastSettings: oldSettings };
                mockStateManager.getState.mockReturnValue(mockState);

                testAction.onDidReceiveSettings(event);
                jest.advanceTimersByTime(600);

                expect(mockState.lastSettings).toBe(newSettings);
            });
        });

        describe('onKeyDown', () => {
            it('should handle key press', async () => {
                const event = createMockEvent({}, mockAction, 'keyDown') as unknown as KeyDownEvent<TestSettings>;

                await testAction.onKeyDown(event);

                expect(mockLogger.debug).toHaveBeenCalledWith(
                    'Key pressed for TestAction',
                    { actionId: mockAction.id }
                );
            });

            it('should show visual feedback on key press', async () => {
                const event = createMockEvent({}, mockAction, 'keyDown') as unknown as KeyDownEvent<TestSettings>;

                await testAction.onKeyDown(event);

                expect(mockAction.showOk).toHaveBeenCalled();
            });
        });

        describe('onSendToPlugin', () => {
            it('should handle data source requests', async () => {
                const event = {
                    action: mockAction,
                    payload: { event: 'testDataSource' }
                } as SendToPluginEvent<any, TestSettings>;

                await testAction.onSendToPlugin(event);

                expect(mockLogger.debug).toHaveBeenCalledWith(
                    'Received plugin message for TestAction',
                    expect.objectContaining({ actionId: mockAction.id })
                );
            });
        });
    });

    describe('Settings Management', () => {
        it('should have defined refresh interval properties', () => {
            expect(testAction['defaultRefreshInterval']).toBe(30000);
            expect(testAction['minRefreshInterval']).toBe(10000);
            expect(testAction['maxRefreshInterval']).toBe(300000);
        });
    });

    describe('Error Handling', () => {
        it('should handle errors gracefully', async () => {
            const error = new Error('Test error');
            const settings: TestSettings = {};
            
            await testAction['handleError']('test-action', error, settings);

            expect(mockErrorRecovery.handleError).toHaveBeenCalled();
        });

        it('should show error state when handling errors', async () => {
            const error = new Error('Test error');
            const settings: TestSettings = {};
            const state = { action: mockAction };
            mockStateManager.getState.mockReturnValue(state);

            await testAction['handleError']('test-action', error, settings);

            expect(mockStateManager.getState).toHaveBeenCalledWith('test-action');
        });
    });

    describe('Display Updates', () => {
        it('should format display data correctly', async () => {
            const data = { status: 'success', data: 'test' };
            
            const result = await testAction['formatDisplay'](data);

            expect(result).toEqual({ title: 'success', state: 0 });
        });

        it('should handle key press correctly', async () => {
            const settings: TestSettings = {};
            
            await testAction['handleKeyPress'](mockAction, settings);

            expect(mockAction.showOk).toHaveBeenCalled();
        });
    });

    describe('Polling Management', () => {
        beforeEach(() => {
            jest.useFakeTimers();
        });

        afterEach(() => {
            jest.useRealTimers();
        });

        it('should access state manager for polling', () => {
            expect(testAction['stateManager']).toBeDefined();
            expect(testAction['stateManager']).toBe(mockStateManager);
        });
    });

    describe('Abstract Method Implementation', () => {
        it('should implement required abstract methods', () => {
            expect(typeof testAction['fetchData']).toBe('function');
            expect(typeof testAction['formatDisplay']).toBe('function');
            expect(typeof testAction['handleKeyPress']).toBe('function');
            expect(typeof testAction['handlePropertyInspectorEvent']).toBe('function');
            expect(typeof testAction['cleanup']).toBe('function');
        });

        it('should return expected data from fetchData', async () => {
            const result = await testAction['fetchData']({});
            expect(result).toEqual({ status: 'success', data: 'test-data' });
        });

        it('should return expected display data', async () => {
            const data = { status: 'success' };
            const result = await testAction['formatDisplay'](data);
            expect(result).toEqual({ title: 'success', state: 0 });
        });
    });

    describe('Performance and Memory', () => {
        it('should have settings debounce management', () => {
            expect(testAction['settingsDebounceTimeouts']).toBeDefined();
            expect(testAction['settingsDebounceTimeouts'] instanceof Map).toBe(true);
        });
    });

    describe('Integration Scenarios', () => {
        it('should handle complete lifecycle flow', async () => {
            const settings: TestSettings = { refreshInterval: 30000 };
            
            // Appear
            const appearEvent = createMockEvent(settings, mockAction, 'willAppear') as unknown as WillAppearEvent<TestSettings>;
            await testAction.onWillAppear(appearEvent);

            // Settings change
            const newSettings: TestSettings = { refreshInterval: 60000 };
            const settingsEvent = createMockEvent(newSettings, mockAction, 'didReceiveSettings') as unknown as DidReceiveSettingsEvent<TestSettings>;
            testAction.onDidReceiveSettings(settingsEvent);

            // Key press
            const keyEvent = createMockEvent(newSettings, mockAction, 'keyDown') as unknown as KeyDownEvent<TestSettings>;
            await testAction.onKeyDown(keyEvent);

            // Disappear
            const disappearEvent = createMockEvent(newSettings, mockAction, 'willDisappear') as unknown as WillDisappearEvent<TestSettings>;
            await testAction.onWillDisappear(disappearEvent);

            expect(mockProfileManager.initialize).toHaveBeenCalled();
            expect(mockStateManager.getState).toHaveBeenCalled();
            expect(mockStateManager.clearState).toHaveBeenCalled();
        });
    });
});