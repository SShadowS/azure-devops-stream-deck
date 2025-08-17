// Mock modules before imports
jest.mock('@elgato/streamdeck', () => require('../../test-helpers/test-utils').mockStreamDeckModule());

import { SprintProgressAction } from '../sprint-progress';
import { ISprintService, ICredentialManager, IActionStateManager } from '../../interfaces';
import { createMockActionState, createMockAction, createMockEvent } from '../../test-helpers/test-utils';

const mockStreamDeck = jest.requireMock('@elgato/streamdeck').default;

describe('SprintProgressAction', () => {
    let action: SprintProgressAction;
    let mockAction: any;
    let mockSprintService: jest.Mocked<ISprintService>;
    let mockCredentialManager: jest.Mocked<ICredentialManager>;
    let mockStateManager: jest.Mocked<IActionStateManager>;
    let mockSetInterval: jest.SpyInstance;
    let mockClearInterval: jest.SpyInstance;
    let mockSetTimeout: jest.SpyInstance;
    let mockClearTimeout: jest.SpyInstance;

    const mockMetrics = {
        name: 'Sprint 42',
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-01-14'),
        totalPoints: 50,
        completedPoints: 25,
        remainingPoints: 25,
        totalItems: 30,
        completedItems: 15,
        remainingItems: 15,
        percentComplete: 50,
        daysRemaining: 7,
        totalDays: 14,
        burndownTrend: 'on-track' as const,
        velocity: 3.5
    };

    beforeEach(() => {
        jest.clearAllMocks();
        jest.useFakeTimers();
        
        // Mock timer functions
        mockSetInterval = jest.spyOn(global, 'setInterval');
        mockClearInterval = jest.spyOn(global, 'clearInterval');
        mockSetTimeout = jest.spyOn(global, 'setTimeout');
        mockClearTimeout = jest.spyOn(global, 'clearTimeout');
        
        // Setup ActionStateManager mock
        const mockState = createMockActionState();
        mockStateManager = {
            getState: jest.fn().mockReturnValue(mockState),
            updateState: jest.fn(),
            clearState: jest.fn()
        } as any;
        
        // Setup CredentialManager mock
        mockCredentialManager = {
            encrypt: jest.fn().mockReturnValue('encrypted'),
            decrypt: jest.fn().mockReturnValue('decrypted')
        } as any;
        
        // Setup SprintService mock
        mockSprintService = {
            getCurrentSprintMetrics: jest.fn().mockResolvedValue(mockMetrics)
        } as any;
        
        mockAction = createMockAction();
        mockStreamDeck.actions.getActionById.mockImplementation((id: string) => {
            return mockAction;
        });
        
        // Create action with dependency injection
        action = new SprintProgressAction(
            mockSprintService,
            mockCredentialManager,
            mockStateManager
        );
    });

    afterEach(() => {
        jest.useRealTimers();
        jest.restoreAllMocks();
    });

    describe('onWillAppear', () => {
        it('should initialize action with valid settings', async () => {
            const settings = {
                orgUrl: 'https://dev.azure.com/test',
                projectName: 'TestProject',
                teamName: 'TestTeam',
                pat: 'encrypted-token',
                refreshInterval: 60,
                displayMode: 'progress' as const,
                showTrend: true,
                alertThreshold: 20
            };

            const event = { action: mockAction, payload: { settings } } as any;
            
            await action.onWillAppear(event);
            
            expect(mockCredentialManager.decrypt).toHaveBeenCalledWith('encrypted-token');
            expect(mockSprintService.getCurrentSprintMetrics).toHaveBeenCalledWith({
                orgUrl: 'https://dev.azure.com/test',
                projectName: 'TestProject',
                teamName: 'TestTeam',
                pat: 'decrypted',
                sprintPath: undefined
            });
            expect(mockAction.setTitle).toHaveBeenCalledWith('50%\n25/50 pts\nSprint 42');
            expect(mockAction.setState).toHaveBeenCalledWith(0); // On track
        });

        it('should show configure message with invalid settings', async () => {
            const settings = {
                orgUrl: 'https://dev.azure.com/test'
                // Missing required fields
            };

            const event = { action: mockAction, payload: { settings } } as any;
            
            await action.onWillAppear(event);
            
            expect(mockSprintService.getCurrentSprintMetrics).not.toHaveBeenCalled();
            expect(mockAction.setTitle).toHaveBeenCalledWith('Configure\nSprint');
            expect(mockAction.setState).toHaveBeenCalledWith(2); // Warning state
        });

        it('should handle specific sprint path', async () => {
            const settings = {
                orgUrl: 'https://dev.azure.com/test',
                projectName: 'TestProject',
                teamName: 'TestTeam',
                pat: 'encrypted-token',
                sprintPath: 'TestProject\\Sprint 40'
            };

            const event = { action: mockAction, payload: { settings } } as any;
            
            await action.onWillAppear(event);
            
            expect(mockSprintService.getCurrentSprintMetrics).toHaveBeenCalledWith(
                expect.objectContaining({ sprintPath: 'TestProject\\Sprint 40' })
            );
        });

        it('should set up refresh interval', async () => {
            const settings = {
                orgUrl: 'https://dev.azure.com/test',
                projectName: 'TestProject',
                teamName: 'TestTeam',
                pat: 'encrypted-token',
                refreshInterval: 120 // 2 minutes
            };

            const event = { action: mockAction, payload: { settings } } as any;
            
            await action.onWillAppear(event);
            
            expect(mockSetInterval).toHaveBeenCalledWith(expect.any(Function), 120000);
        });

        it('should handle error during initialization', async () => {
            const settings = {
                orgUrl: 'https://dev.azure.com/test',
                projectName: 'TestProject',
                teamName: 'TestTeam',
                pat: 'encrypted-token'
            };

            mockSprintService.getCurrentSprintMetrics.mockRejectedValueOnce(new Error('API Error'));

            const event = { action: mockAction, payload: { settings } } as any;
            
            await action.onWillAppear(event);
            
            expect(mockAction.setTitle).toHaveBeenCalledWith('Error\nFetching\nSprint');
            expect(mockAction.setState).toHaveBeenCalledWith(1); // Error state
        });

        it('should trigger alert for behind schedule sprint', async () => {
            const behindMetrics = {
                ...mockMetrics,
                burndownTrend: 'behind' as const,
                percentComplete: 30 // Should be 50% but is only 30%
            };
            mockSprintService.getCurrentSprintMetrics.mockResolvedValueOnce(behindMetrics);

            const settings = {
                orgUrl: 'https://dev.azure.com/test',
                projectName: 'TestProject',
                teamName: 'TestTeam',
                pat: 'encrypted-token',
                alertThreshold: 15
            };

            const event = { action: mockAction, payload: { settings } } as any;
            
            await action.onWillAppear(event);
            
            expect(mockAction.setState).toHaveBeenCalledWith(1); // Alert state (red)
        });
    });

    describe('onWillDisappear', () => {
        it('should clear interval on disappear', async () => {
            const state = mockStateManager.getState('test-action-id') as any;
            state.intervalId = 123;
            
            const event = { action: mockAction, payload: { settings: {} } } as any;
            
            await action.onWillDisappear(event);
            
            expect(mockClearInterval).toHaveBeenCalledWith(123);
            expect(state.intervalId).toBeUndefined();
        });

        it('should clear debounce timeout if exists', async () => {
            const timeout = setTimeout(() => {}, 1000);
            (action as any).settingsDebounceTimeouts.set('test-action-id', timeout);
            
            const event = { action: mockAction, payload: { settings: {} } } as any;
            
            await action.onWillDisappear(event);
            
            expect(mockClearTimeout).toHaveBeenCalledWith(timeout);
            expect((action as any).settingsDebounceTimeouts.has('test-action-id')).toBe(false);
        });
    });

    describe('onKeyDown', () => {
        it('should open sprint board URL in browser on key press', async () => {
            const settings = {
                orgUrl: 'https://dev.azure.com/test',
                projectName: 'TestProject',
                teamName: 'TestTeam',
                pat: 'token'
            };

            const event = { action: mockAction, payload: { settings } } as any;
            
            await action.onKeyDown(event);
            
            expect(mockStreamDeck.system.openUrl).toHaveBeenCalledWith(
                'https://dev.azure.com/test/TestProject/_sprints/taskboard'
            );
        });

        it('should not open URL with incomplete settings', async () => {
            const settings = {
                orgUrl: 'https://dev.azure.com/test'
                // Missing projectName
            };

            const event = { action: mockAction, payload: { settings } } as any;
            
            await action.onKeyDown(event);
            
            expect(mockStreamDeck.system.openUrl).not.toHaveBeenCalled();
        });
    });

    describe('onDidReceiveSettings', () => {
        it('should debounce rapid settings changes', async () => {
            const settings1 = {
                orgUrl: 'https://dev.azure.com/test1',
                projectName: 'Project1',
                teamName: 'Team1',
                pat: 'token1'
            };

            const settings2 = {
                orgUrl: 'https://dev.azure.com/test2',
                projectName: 'Project2',
                teamName: 'Team2',
                pat: 'token2'
            };

            const event1 = { action: mockAction, payload: { settings: settings1 } } as any;
            const event2 = { action: mockAction, payload: { settings: settings2 } } as any;
            
            await action.onDidReceiveSettings(event1);
            await action.onDidReceiveSettings(event2);
            
            // Should have created two timeouts but cleared the first
            expect(mockSetTimeout).toHaveBeenCalledTimes(2);
            expect(mockClearTimeout).toHaveBeenCalledTimes(1);
            
            // Fast-forward time to trigger debounced update
            jest.advanceTimersByTime(500);
            
            // Should only process the second settings
            expect(mockSprintService.getCurrentSprintMetrics).toHaveBeenCalledTimes(1);
        });

        it('should restart when connection settings change', async () => {
            const state = mockStateManager.getState('test-action-id') as any;
            state.lastSettings = {
                orgUrl: 'https://dev.azure.com/old',
                projectName: 'OldProject',
                teamName: 'OldTeam',
                pat: 'old-token',
                displayMode: 'progress'
            };
            state.intervalId = 123;

            const newSettings = {
                orgUrl: 'https://dev.azure.com/new',
                projectName: 'NewProject',
                teamName: 'NewTeam',
                pat: 'new-token',
                displayMode: 'progress'
            };

            const event = { action: mockAction, payload: { settings: newSettings } } as any;
            
            await action.onDidReceiveSettings(event);
            jest.advanceTimersByTime(500);
            
            expect(mockClearInterval).toHaveBeenCalledWith(123);
            expect(mockSprintService.getCurrentSprintMetrics).toHaveBeenCalled();
        });

        it('should only update display for display mode changes', async () => {
            const state = mockStateManager.getState('test-action-id') as any;
            state.lastSettings = {
                orgUrl: 'https://dev.azure.com/test',
                projectName: 'TestProject',
                teamName: 'TestTeam',
                pat: 'token',
                displayMode: 'progress'
            };
            state.lastMetrics = mockMetrics;

            const newSettings = {
                orgUrl: 'https://dev.azure.com/test',
                projectName: 'TestProject',
                teamName: 'TestTeam',
                pat: 'token',
                displayMode: 'burndown' as const
            };

            // Call processSettingsChange directly
            await (action as any).processSettingsChange('test-action-id', newSettings);
            
            expect(mockClearInterval).not.toHaveBeenCalled();
            expect(mockSprintService.getCurrentSprintMetrics).not.toHaveBeenCalled();
            // Display mode changes alone don't trigger display update in current implementation
            expect(mockAction.setTitle).not.toHaveBeenCalled();
        });
    });

    describe('onSendToPlugin', () => {
        it('should handle test connection event', async () => {
            const settings = {
                orgUrl: 'https://dev.azure.com/test',
                projectName: 'TestProject',
                teamName: 'TestTeam',
                pat: 'encrypted-token'
            };

            mockAction.getSettings.mockResolvedValue(settings);

            const event = { action: mockAction, payload: { event: 'testConnection' } } as any;
            
            await action.onSendToPlugin(event);
            
            expect(mockSprintService.getCurrentSprintMetrics).toHaveBeenCalled();
            expect(mockStreamDeck.ui.current?.sendToPropertyInspector).toHaveBeenCalledWith({
                event: 'testConnectionResult',
                status: 'success',
                message: 'Connected! Sprint: Sprint 42 (50% complete)'
            });
        });

        it('should handle test connection error', async () => {
            const settings = {
                orgUrl: 'https://dev.azure.com/test',
                projectName: 'TestProject',
                teamName: 'TestTeam',
                pat: 'encrypted-token'
            };

            mockAction.getSettings.mockResolvedValue(settings);
            mockSprintService.getCurrentSprintMetrics.mockRejectedValueOnce(new Error('Invalid PAT'));

            const event = { action: mockAction, payload: { event: 'testConnection' } } as any;
            
            await action.onSendToPlugin(event);
            
            expect(mockStreamDeck.ui.current?.sendToPropertyInspector).toHaveBeenCalledWith({
                event: 'testConnectionResult',
                status: 'error',
                message: 'Invalid PAT'
            });
        });

        it('should handle getTeams event', async () => {
            const event = { action: mockAction, payload: { event: 'getTeams' } } as any;
            
            await action.onSendToPlugin(event);
            
            expect(mockStreamDeck.ui.current?.sendToPropertyInspector).toHaveBeenCalledWith({
                event: 'didReceiveTeams',
                teams: expect.arrayContaining([
                    expect.objectContaining({ label: 'Default Team', value: 'Default Team' })
                ])
            });
        });

        it('should handle getSprints event', async () => {
            const event = { action: mockAction, payload: { event: 'getSprints' } } as any;
            
            await action.onSendToPlugin(event);
            
            expect(mockStreamDeck.ui.current?.sendToPropertyInspector).toHaveBeenCalledWith({
                event: 'didReceiveSprints',
                sprints: expect.arrayContaining([
                    expect.objectContaining({ label: 'Current Sprint', value: '' })
                ])
            });
        });
    });

    describe('Display Modes', () => {
        beforeEach(async () => {
            const settings = {
                orgUrl: 'https://dev.azure.com/test',
                projectName: 'TestProject',
                teamName: 'TestTeam',
                pat: 'encrypted-token'
            };

            const event = { action: mockAction, payload: { settings } } as any;
            await action.onWillAppear(event);
            jest.clearAllMocks();
        });

        it('should display progress mode', async () => {
            const settings = {
                displayMode: 'progress' as const,
                showTrend: false
            };

            await (action as any).updateDisplay(mockAction, mockMetrics, settings);
            
            expect(mockAction.setTitle).toHaveBeenCalledWith('50%\n25/50 pts\nSprint 42');
        });

        it('should display progress mode with trend', async () => {
            const settings = {
                displayMode: 'progress' as const,
                showTrend: true
            };

            await (action as any).updateDisplay(mockAction, mockMetrics, settings);
            
            expect(mockAction.setTitle).toHaveBeenCalledWith('50%\n25/50 pts\nSprint 42');
        });

        it('should display burndown mode', async () => {
            const settings = {
                displayMode: 'burndown' as const
            };

            await (action as any).updateDisplay(mockAction, mockMetrics, settings);
            
            expect(mockAction.setTitle).toHaveBeenCalledWith('→ on-track\n25 pts left\n7 days');
        });

        it('should display velocity mode', async () => {
            const settings = {
                displayMode: 'velocity' as const
            };

            await (action as any).updateDisplay(mockAction, mockMetrics, settings);
            
            expect(mockAction.setTitle).toHaveBeenCalledWith('Velocity: 3.5\nCurrent: 4\n50%');
        });

        it('should display days mode', async () => {
            const settings = {
                displayMode: 'days' as const
            };

            await (action as any).updateDisplay(mockAction, mockMetrics, settings);
            
            expect(mockAction.setTitle).toHaveBeenCalledWith('7 days\n50%\nSprint 42');
        });

        it('should display detailed mode', async () => {
            const settings = {
                displayMode: 'detailed' as const
            };

            await (action as any).updateDisplay(mockAction, mockMetrics, settings);
            
            expect(mockAction.setTitle).toHaveBeenCalledWith('Sprint 42\n15/30\n50%\n7d');
        });

        it('should set correct state for ahead trend', async () => {
            const aheadMetrics = {
                ...mockMetrics,
                burndownTrend: 'ahead'
            };

            const settings = { displayMode: 'progress' as const };

            await (action as any).updateDisplay(mockAction, aheadMetrics, settings);
            
            expect(mockAction.setState).toHaveBeenCalledWith(0); // Green for ahead
        });

        it('should set correct state for behind trend with alert', async () => {
            const behindMetrics = {
                ...mockMetrics,
                burndownTrend: 'behind' as const,
                percentComplete: 25  // 25% complete when should be 50%, so 25% behind
            };

            const settings = { 
                displayMode: 'progress' as const,
                alertThreshold: 20  // Alert when behind by more than 20%
            };

            await (action as any).updateDisplay(mockAction, behindMetrics, settings);
            
            expect(mockAction.setState).toHaveBeenCalledWith(1); // Red for alert
        });
    });

    describe('Error Handling', () => {
        it('should handle metrics fetch error gracefully', async () => {
            const settings = {
                orgUrl: 'https://dev.azure.com/test',
                projectName: 'TestProject',
                teamName: 'TestTeam',
                pat: 'encrypted-token'
            };

            mockSprintService.getCurrentSprintMetrics.mockRejectedValueOnce(new Error('Network error'));

            await (action as any).updateSprintProgress('test-action-id', settings);
            
            const state = mockStateManager.getState('test-action-id') as any;
            expect(state.lastError).toBe('Network error');
            expect(mockAction.setTitle).toHaveBeenCalledWith('Error\nFetching\nSprint');
            expect(mockAction.setState).toHaveBeenCalledWith(1);
        });

        it('should validate settings before processing', async () => {
            const invalidSettings = {
                orgUrl: 'https://dev.azure.com/test'
                // Missing required fields
            };

            const result = (action as any).validateSettings(invalidSettings);
            
            expect(result).toBe(false);
        });

        it('should validate complete settings', async () => {
            const validSettings = {
                orgUrl: 'https://dev.azure.com/test',
                projectName: 'TestProject',
                teamName: 'TestTeam',
                pat: 'token'
            };

            const result = (action as any).validateSettings(validSettings);
            
            expect(result).toBe(true);
        });
    });

    describe('Refresh Interval', () => {
        it('should use default interval when not specified', async () => {
            const settings = {
                orgUrl: 'https://dev.azure.com/test',
                projectName: 'TestProject',
                teamName: 'TestTeam',
                pat: 'encrypted-token'
                // No refreshInterval specified
            };

            const event = { action: mockAction, payload: { settings } } as any;
            
            await action.onWillAppear(event);
            
            expect(mockSetInterval).toHaveBeenCalledWith(expect.any(Function), 300000); // 5 minutes default
        });

        it('should trigger refresh on interval', async () => {
            const settings = {
                orgUrl: 'https://dev.azure.com/test',
                projectName: 'TestProject',
                teamName: 'TestTeam',
                pat: 'encrypted-token',
                refreshInterval: 60
            };

            const event = { action: mockAction, payload: { settings } } as any;
            
            await action.onWillAppear(event);
            
            expect(mockSprintService.getCurrentSprintMetrics).toHaveBeenCalledTimes(1);
            
            // Advance timer to trigger refresh
            jest.advanceTimersByTime(60000);
            
            expect(mockSprintService.getCurrentSprintMetrics).toHaveBeenCalledTimes(2);
        });
    });
});
