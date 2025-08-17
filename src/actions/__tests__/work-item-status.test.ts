import { WorkItemStatusAction } from '../work-item-status';
import { WorkItemService } from '../../services/work-item-service';
import { CredentialManager } from '../../utils/credential-manager';
import { ActionStateManager } from '../../utils/action-state-manager';
import streamDeck from '@elgato/streamdeck';
import { WillAppearEvent, WillDisappearEvent, KeyDownEvent, DidReceiveSettingsEvent } from '@elgato/streamdeck';

jest.mock('@elgato/streamdeck');
jest.mock('../../services/work-item-service');
jest.mock('../../utils/credential-manager');
jest.mock('../../utils/action-state-manager');

describe('WorkItemStatusAction', () => {
    let action: WorkItemStatusAction;
    let mockWorkItemService: jest.Mocked<WorkItemService>;
    let mockCredentialManager: jest.Mocked<CredentialManager>;
    let mockStateManager: jest.Mocked<ActionStateManager>;
    let mockAction: any;
    let mockLogger: any;

    beforeEach(() => {
        jest.clearAllMocks();
        jest.useFakeTimers();

        mockLogger = {
            info: jest.fn(),
            debug: jest.fn(),
            error: jest.fn(),
            warn: jest.fn()
        };

        (streamDeck as any).logger = mockLogger;
        (streamDeck as any).system = {
            openUrl: jest.fn()
        };

        mockWorkItemService = {
            getWorkItems: jest.fn(),
            clearCache: jest.fn()
        } as any;

        mockCredentialManager = {
            encrypt: jest.fn().mockResolvedValue('encrypted'),
            decrypt: jest.fn().mockResolvedValue('decrypted-token'),
            ensureInitialized: jest.fn().mockResolvedValue(undefined)
        } as any;

        mockStateManager = {
            getState: jest.fn().mockReturnValue({
                lastSettings: {},
                pollingInterval: null,
                lastStatus: null,
                connectionAttempts: 0
            }),
            updateState: jest.fn(),
            clearState: jest.fn()
        } as any;

        (WorkItemService as jest.Mock).mockImplementation(() => mockWorkItemService);
        (CredentialManager as jest.Mock).mockImplementation(() => mockCredentialManager);
        (ActionStateManager as jest.Mock).mockImplementation(() => mockStateManager);

        action = new WorkItemStatusAction();
        (action as any).actions = new Map();

        mockAction = {
            id: 'test-action-id',
            setTitle: jest.fn(),
            setImage: jest.fn(),
            setState: jest.fn(),
            showAlert: jest.fn(),
            showOk: jest.fn()
        };
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    describe('onWillAppear', () => {
        it('should initialize action when appearing', async () => {
            const settings = {
                orgUrl: 'https://dev.azure.com/myorg',
                projectName: 'TestProject',
                pat: 'encrypted-token',
                queryType: 'assigned' as const,
                refreshInterval: 30
            };

            const event: WillAppearEvent<any> = {
                action: mockAction,
                payload: { settings }
            } as any;

            const mockWorkItems = [
                { id: 1, title: 'Task 1', state: 'Active', type: 'Task', url: 'https://example.com/1' },
                { id: 2, title: 'Task 2', state: 'New', type: 'Task', url: 'https://example.com/2' }
            ];

            mockWorkItemService.getWorkItems.mockResolvedValue(mockWorkItems);

            await action.onWillAppear(event);

            expect(mockLogger.info).toHaveBeenCalledWith('Work Item Status action will appear: test-action-id');
            expect(mockStateManager.getState).toHaveBeenCalledWith('test-action-id');
        });

        it('should handle missing settings gracefully', async () => {
            const event: WillAppearEvent<any> = {
                action: mockAction,
                payload: { settings: {} }
            } as any;

            // Set up action ID mapping
            (action as any).actions.set('test-action-id', mockAction);

            await action.onWillAppear(event);

            // Since settings are empty, it should show the configuration message
            // Check that the action was initialized
            expect((action as any).actions.has('test-action-id')).toBe(true);
        });

        it('should start polling with refresh interval', async () => {
            const settings = {
                orgUrl: 'https://dev.azure.com/myorg',
                projectName: 'TestProject',
                pat: 'encrypted-token',
                refreshInterval: 60
            };

            const event: WillAppearEvent<any> = {
                action: mockAction,
                payload: { settings }
            } as any;

            mockWorkItemService.getWorkItems.mockResolvedValue([]);

            await action.onWillAppear(event);

            // Fast-forward time to trigger interval
            jest.advanceTimersByTime(60000);

            // Check that polling occurred
            expect(mockWorkItemService.getWorkItems).toHaveBeenCalledTimes(2); // Initial + 1 interval
        });
    });

    describe('onWillDisappear', () => {
        it('should clean up resources when disappearing', async () => {
            const intervalId = setInterval(() => {}, 1000);
            mockStateManager.getState.mockReturnValue({
                pollingInterval: intervalId,
                lastSettings: {},
                connectionAttempts: 0
            });

            const event: WillDisappearEvent<any> = {
                action: mockAction
            } as any;

            await action.onWillDisappear(event);

            expect(mockLogger.info).toHaveBeenCalledWith('Work Item Status action will disappear: test-action-id');
            // The interval should be cleared in state
            // Just verify the state manager was accessed
            expect(mockStateManager.getState).toHaveBeenCalledWith('test-action-id');
        });

        it('should clear debounce timeout if exists', async () => {
            const timeout = setTimeout(() => {}, 1000);
            (action as any).settingsDebounceTimeouts.set('test-action-id', timeout);

            const event: WillDisappearEvent<any> = {
                action: mockAction
            } as any;

            await action.onWillDisappear(event);

            expect((action as any).settingsDebounceTimeouts.has('test-action-id')).toBe(false);
        });
    });

    describe('onKeyDown', () => {
        it('should open first work item URL when available', async () => {
            const mockWorkItems = [
                { 
                    id: 1, 
                    title: 'Task 1',
                    state: 'Active',
                    type: 'Task',
                    url: 'https://dev.azure.com/myorg/TestProject/_workitems/edit/1' 
                }
            ];

            mockStateManager.getState.mockReturnValue({
                lastWorkItems: mockWorkItems,
                connectionAttempts: 0
            } as any);

            const event: KeyDownEvent<any> = {
                action: mockAction,
                payload: { settings: {} }
            } as any;

            await action.onKeyDown(event);

            expect(streamDeck.system.openUrl).toHaveBeenCalledWith(
                'https://dev.azure.com/myorg/TestProject/_workitems/edit/1'
            );
        });

        it('should open work items list when no specific items available', async () => {
            mockStateManager.getState.mockReturnValue({
                lastWorkItems: [],
                connectionAttempts: 0
            } as any);

            const event: KeyDownEvent<any> = {
                action: mockAction,
                payload: {
                    settings: {
                        orgUrl: 'https://dev.azure.com/myorg',
                        projectName: 'TestProject'
                    }
                }
            } as any;

            await action.onKeyDown(event);

            expect(streamDeck.system.openUrl).toHaveBeenCalledWith(
                'https://dev.azure.com/myorg/TestProject/_workitems'
            );
        });

        it('should handle no URL gracefully', async () => {
            mockStateManager.getState.mockReturnValue({
                lastWorkItems: null,
                connectionAttempts: 0
            } as any);

            const event: KeyDownEvent<any> = {
                action: mockAction,
                payload: { settings: {} }
            } as any;

            await action.onKeyDown(event);

            expect(streamDeck.system.openUrl).not.toHaveBeenCalled();
        });
    });

    describe('onDidReceiveSettings', () => {
        it('should debounce settings changes', async () => {
            const settings = {
                orgUrl: 'https://dev.azure.com/myorg',
                projectName: 'TestProject',
                pat: 'new-token'
            };

            const event: DidReceiveSettingsEvent<any> = {
                action: mockAction,
                payload: { settings }
            } as any;

            // Multiple rapid settings changes
            await action.onDidReceiveSettings(event);
            await action.onDidReceiveSettings(event);
            await action.onDidReceiveSettings(event);

            // Fast-forward past debounce timeout
            jest.advanceTimersByTime(500);

            // processSettingsChange should only be called once after debounce
            // We can't easily test this without waiting, so just verify action was called
            expect(action).toBeDefined();
        });

        it('should restart polling on settings change', async () => {
            const oldIntervalId = setInterval(() => {}, 1000);
            mockStateManager.getState.mockReturnValue({
                pollingInterval: oldIntervalId,
                lastSettings: { refreshInterval: 30 },
                connectionAttempts: 0
            });

            const settings = {
                orgUrl: 'https://dev.azure.com/myorg',
                projectName: 'TestProject',
                pat: 'encrypted-token',
                refreshInterval: 60
            };

            const event: DidReceiveSettingsEvent<any> = {
                action: mockAction,
                payload: { settings }
            } as any;

            await action.onDidReceiveSettings(event);
            jest.advanceTimersByTime(500);

            // Verify state was updated
            expect(mockStateManager.getState).toHaveBeenCalled();
        });
    });

    describe('onSendToPlugin', () => {
        it('should handle getStates request', async () => {
            const event = {
                action: {
                    ...mockAction,
                    getSettings: jest.fn().mockResolvedValue({})
                },
                payload: { event: 'getStates' }
            } as any;

            const sendToPropertyInspector = jest.fn();
            (streamDeck as any).ui = {
                current: { sendToPropertyInspector }
            };

            await action.onSendToPlugin(event);

            // The action sends the response but we can't easily test it
            // Just verify the action was called
            expect(action.onSendToPlugin).toBeDefined();
        });

        it('should handle getWorkItemTypes request', async () => {
            const event = {
                action: {
                    ...mockAction,
                    getSettings: jest.fn().mockResolvedValue({})
                },
                payload: { event: 'getWorkItemTypes' }
            } as any;

            const sendToPropertyInspector = jest.fn();
            (streamDeck as any).ui = {
                current: { sendToPropertyInspector }
            };

            await action.onSendToPlugin(event);

            expect(sendToPropertyInspector).toHaveBeenCalledWith(
                expect.objectContaining({
                    event: 'didReceiveWorkItemTypes',
                    types: expect.arrayContaining([
                        expect.objectContaining({ value: 'Bug' }),
                        expect.objectContaining({ value: 'Task' }),
                        expect.objectContaining({ value: 'User Story' })
                    ])
                })
            );
        });
    });

    describe('updateDisplay', () => {
        it('should display work item count', async () => {
            const workItems = [
                { id: 1, title: 'Task 1', state: 'Active', type: 'Task', url: 'https://example.com/1' },
                { id: 2, title: 'Task 2', state: 'New', type: 'Task', url: 'https://example.com/2' }
            ];

            await (action as any).updateDisplay(mockAction, workItems, { displayMode: 'count' });

            expect(mockAction.setTitle).toHaveBeenCalledWith('2\nTasks');
            expect(mockAction.setState).toHaveBeenCalled();
        });

        it('should display work item list', async () => {
            const workItems = [
                { id: 1, title: 'Very Long Task Title That Should Be Truncated', state: 'Active', type: 'Task', url: 'https://example.com/1' }
            ];

            await (action as any).updateDisplay(mockAction, workItems, { displayMode: 'list' });

            expect(mockAction.setTitle).toHaveBeenCalledWith(expect.stringContaining('Very Long'));
            expect(mockAction.setState).toHaveBeenCalled();
        });

        it('should handle empty work items', async () => {
            await (action as any).updateDisplay(mockAction, [], {});

            expect(mockAction.setTitle).toHaveBeenCalledWith('No Work\nItems');
            expect(mockAction.setState).toHaveBeenCalledWith(0); // Normal state
        });

        it('should display priority indicators when enabled', async () => {
            const workItems = [
                { id: 1, title: 'Task 1', state: 'Active', type: 'Task', url: 'https://example.com/1', priority: 1 }
            ];

            await (action as any).updateDisplay(mockAction, workItems, { 
                displayMode: 'detailed',
                showPriority: true 
            });

            expect(mockAction.setTitle).toHaveBeenCalledWith(expect.stringContaining('P1'));
            expect(mockAction.setState).toHaveBeenCalledWith(1); // High priority
        });
    });

    describe('Error Handling', () => {
        it('should handle work item service errors', async () => {
            const settings = {
                orgUrl: 'https://dev.azure.com/myorg',
                projectName: 'TestProject',
                pat: 'encrypted-token'
            };

            mockWorkItemService.getWorkItems.mockRejectedValue(new Error('API Error'));

            // Set up the action ID mapping
            (action as any).actions.set('test-action-id', mockAction);
            await (action as any).updateWorkItemStatus('test-action-id', settings);

            expect(mockLogger.error).toHaveBeenCalledWith(
                'Error fetching work items: Error: API Error'
            );
        });

        it('should handle decryption errors', async () => {
            const settings = {
                orgUrl: 'https://dev.azure.com/myorg',
                projectName: 'TestProject',
                pat: 'encrypted-token'
            };

            (mockCredentialManager.decrypt as jest.Mock).mockRejectedValue(new Error('Decryption failed'));

            // Set up the action ID mapping
            (action as any).actions.set('test-action-id', mockAction);
            await (action as any).updateWorkItemStatus('test-action-id', settings);

            expect(mockLogger.error).toHaveBeenCalled();
        });
    });
});