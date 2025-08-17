// Mock modules before imports
jest.mock('@elgato/streamdeck', () => require('../../test-helpers/test-utils').mockStreamDeckModule());

import { TestResultsSummaryAction } from '../test-results-summary';
import { TestRunSummary } from '../../services/test-results-service';
import { ITestResultsService, ICredentialManager, IActionStateManager } from '../../interfaces';
import { createMockActionState, createMockAction } from '../../test-helpers/test-utils';

const mockStreamDeck = jest.requireMock('@elgato/streamdeck').default;

describe('TestResultsSummaryAction', () => {
    let action: TestResultsSummaryAction;
    let mockAction: any;
    let mockTestResultsService: jest.Mocked<ITestResultsService>;
    let mockCredentialManager: jest.Mocked<ICredentialManager>;
    let mockStateManager: jest.Mocked<IActionStateManager>;
    let mockSetInterval: jest.SpyInstance;
    let mockClearInterval: jest.SpyInstance;
    let mockSetTimeout: jest.SpyInstance;
    let mockClearTimeout: jest.SpyInstance;

    const mockTestSummary: TestRunSummary = {
        id: 1,
        name: 'Test Run #123',
        buildNumber: '20240101.1',
        state: 'Completed',
        startedDate: new Date(),
        completedDate: new Date(),
        totalTests: 500,
        passedTests: 450,
        failedTests: 30,
        passRate: 90,
        duration: 300,
        url: 'https://dev.azure.com/test/project/_build/results?buildId=123'
    };

    const mockMetrics = {
        summary: mockTestSummary,
        testRuns: [],
        totalTests: 500,
        passedTests: 450,
        failedTests: 30,
        skippedTests: 20,
        passRate: 90,
        trend: {
            direction: 'stable' as const,
            passRateChange: 0,
            recentPassRates: [90, 89, 91, 88, 90],
            durationChange: 0
        },
        coverage: {
            lineCoverage: 80,
            branchCoverage: 75,
            trend: 'improving' as const
        },
        performance: {
            averageDuration: 5,
            trend: 'stable' as const,
            slowestTests: []
        },
        totalDuration: 300,
        averageDuration: 5,
        failedTestDetails: [],
        flakyTests: []
    };

    const mockTestRuns: TestRunSummary[] = [
        {
            id: 1,
            name: 'Unit Tests',
            state: 'Completed',
            totalTests: 300,
            passedTests: 280,
            failedTests: 15,
            passRate: 93.33,
            duration: 180,
            startedDate: new Date(),
            completedDate: new Date()
        },
        {
            id: 2,
            name: 'Integration Tests',
            state: 'Completed',
            totalTests: 200,
            passedTests: 170,
            failedTests: 15,
            passRate: 85,
            duration: 120,
            startedDate: new Date(),
            completedDate: new Date()
        }
    ];

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
        
        // Setup TestResultsService mock
        mockTestResultsService = {
            getTestMetrics: jest.fn().mockResolvedValue(mockMetrics)
        } as any;
        
        mockAction = createMockAction();
        mockStreamDeck.actions.getActionById.mockImplementation((id: string) => {
            return mockAction;
        });
        
        // Create action with dependency injection
        action = new TestResultsSummaryAction(
            mockTestResultsService,
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
                pat: 'encrypted-token',
                pipelineId: 123,
                refreshInterval: 60,
                displayMode: 'summary' as const,
                showTrend: true,
                failureThreshold: 10
            };

            const event = { action: mockAction, payload: { settings } } as any;
            
            await action.onWillAppear(event);
            
            expect(mockCredentialManager.decrypt).toHaveBeenCalledWith('encrypted-token');
            expect(mockTestResultsService.getTestMetrics).toHaveBeenCalledWith({
                orgUrl: 'https://dev.azure.com/test',
                projectName: 'TestProject',
                pat: 'decrypted',
                pipelineId: 123,
                maxRuns: 10
            });
            expect(mockAction.setTitle).toHaveBeenCalled();
            expect(mockAction.setState).toHaveBeenCalled();
        });

        it('should show configure message with invalid settings', async () => {
            const settings = {
                orgUrl: 'https://dev.azure.com/test'
                // Missing required fields
            };

            const event = { action: mockAction, payload: { settings } } as any;
            
            await action.onWillAppear(event);
            
            expect(mockTestResultsService.getTestMetrics).not.toHaveBeenCalled();
            expect(mockAction.setTitle).toHaveBeenCalledWith('Configure\nTest Results');
            expect(mockAction.setState).toHaveBeenCalledWith(2); // Warning state
        });

        it('should set up refresh interval', async () => {
            const settings = {
                orgUrl: 'https://dev.azure.com/test',
                projectName: 'TestProject',
                pat: 'encrypted-token',
                pipelineId: 123,
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
                pat: 'encrypted-token',
                pipelineId: 123
            };

            mockTestResultsService.getTestMetrics.mockRejectedValueOnce(new Error('API Error'));

            const event = { action: mockAction, payload: { settings } } as any;
            
            await action.onWillAppear(event);
            
            expect(mockAction.setTitle).toHaveBeenCalledWith('Error\nFetching\nTests');
            expect(mockAction.setState).toHaveBeenCalledWith(2); // Error state
        });

        it('should trigger alert for high failure rate', async () => {
            const failingSummary = {
                ...mockTestSummary,
                passRate: 70,
                failedTests: 150
            };
            mockTestResultsService.getTestMetrics.mockResolvedValueOnce({
                ...mockMetrics,
                summary: failingSummary,
                totalTests: failingSummary.totalTests,
                passedTests: failingSummary.passedTests,
                failedTests: failingSummary.failedTests,
                skippedTests: 0,
                passRate: failingSummary.passRate
            });

            const settings = {
                orgUrl: 'https://dev.azure.com/test',
                projectName: 'TestProject',
                pat: 'encrypted-token',
                pipelineId: 123,
                failureThreshold: 20
            };

            const event = { action: mockAction, payload: { settings } } as any;
            
            await action.onWillAppear(event);
            
            expect(mockAction.setState).toHaveBeenCalledWith(2); // Error state
        });
    });

    describe('onWillDisappear', () => {
        it('should clear interval on disappear', async () => {
            const state = mockStateManager.getState('test-action-id') as any;
            state.intervalId = 123;
            
            const event = { action: mockAction, payload: {} } as any;
            
            await action.onWillDisappear(event);
            
            expect(mockClearInterval).toHaveBeenCalledWith(123);
            expect(state.intervalId).toBeUndefined();
        });

        it('should clear debounce timeout if exists', async () => {
            const timeout = setTimeout(() => {}, 1000);
            (action as any).settingsDebounceTimeouts.set('test-action-id', timeout);
            
            const event = { action: mockAction, payload: {} } as any;
            
            await action.onWillDisappear(event);
            
            expect(mockClearTimeout).toHaveBeenCalledWith(timeout);
            expect((action as any).settingsDebounceTimeouts.has('test-action-id')).toBe(false);
        });
    });

    describe('onKeyDown', () => {
        it('should open test results URL in browser on key press', async () => {
            const settings = {
                orgUrl: 'https://dev.azure.com/test',
                projectName: 'TestProject',
                pipelineId: 123,
                pat: 'token'
            };

            const state = mockStateManager.getState('test-action') as any;
            state.lastTestRunId = 456;

            const event = { action: mockAction, payload: { settings } } as any;
            
            await action.onKeyDown(event);
            
            expect(mockStreamDeck.system.openUrl).toHaveBeenCalledWith(
                'https://dev.azure.com/test/TestProject/_test/runs'
            );
        });

        it('should not open URL with incomplete settings', async () => {
            const settings = {
                orgUrl: 'https://dev.azure.com/test'
                // Missing projectName and pipelineId
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
                pipelineId: 111,
                pat: 'token1'
            };

            const settings2 = {
                orgUrl: 'https://dev.azure.com/test2',
                projectName: 'Project2',
                pipelineId: 222,
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
            expect(mockTestResultsService.getTestMetrics).toHaveBeenCalledTimes(1);
        });
    });

    describe('onSendToPlugin', () => {
        it('should handle test connection event', async () => {
            const settings = {
                orgUrl: 'https://dev.azure.com/test',
                projectName: 'TestProject',
                pipelineId: 123,
                pat: 'encrypted-token'
            };

            mockAction.getSettings.mockResolvedValue(settings);

            const event = { action: mockAction, payload: { event: 'testConnection' } } as any;
            
            await action.onSendToPlugin(event);
            
            expect(mockTestResultsService.getTestMetrics).toHaveBeenCalled();
            expect(mockStreamDeck.ui.current?.sendToPropertyInspector).toHaveBeenCalledWith({
                event: 'testConnectionResult',
                status: 'success',
                message: 'Connected! 500 tests, 90.0% pass rate'
            });
        });

        it('should handle test connection error', async () => {
            const settings = {
                orgUrl: 'https://dev.azure.com/test',
                projectName: 'TestProject',
                pipelineId: 123,
                pat: 'encrypted-token'
            };

            mockAction.getSettings.mockResolvedValue(settings);
            mockTestResultsService.getTestMetrics.mockRejectedValueOnce(new Error('Invalid PAT'));

            const event = { action: mockAction, payload: { event: 'testConnection' } } as any;
            
            await action.onSendToPlugin(event);
            
            expect(mockStreamDeck.ui.current?.sendToPropertyInspector).toHaveBeenCalledWith({
                event: 'testConnectionResult',
                status: 'error',
                message: 'Invalid PAT'
            });
        });

        it('should handle getTestPlans event', async () => {
            const event = { action: mockAction, payload: { event: 'getTestPlans' } } as any;
            
            await action.onSendToPlugin(event);
            
            expect(mockStreamDeck.ui.current?.sendToPropertyInspector).toHaveBeenCalledWith({
                event: 'didReceiveTestPlans',
                plans: expect.arrayContaining([
                    expect.objectContaining({ label: expect.any(String), value: expect.any(String) })
                ])
            });
        });
    });

    describe('Display Modes', () => {
        beforeEach(async () => {
            const settings = {
                orgUrl: 'https://dev.azure.com/test',
                projectName: 'TestProject',
                pipelineId: 123,
                pat: 'encrypted-token'
            };

            const event = { action: mockAction, payload: { settings } } as any;
            await action.onWillAppear(event);
            jest.clearAllMocks();
        });

        it('should display summary mode', async () => {
            const settings = {
                displayMode: 'summary' as const,
                showTrend: false
            };

            await (action as any).updateDisplay(mockAction, mockMetrics, settings);
            
            expect(mockAction.setTitle).toHaveBeenCalledWith('⚠️ 90.0%\n450/500\n30 failed\n➡️');
        });

        it('should display summary mode with trend', async () => {
            const settings = {
                displayMode: 'summary' as const,
                showTrend: true
            };

            await (action as any).updateDisplay(mockAction, mockMetrics, settings);
            
            expect(mockAction.setTitle).toHaveBeenCalledWith(expect.stringContaining('90.0%'));
        });

        it('should display failed mode', async () => {
            const settings = {
                displayMode: 'failures' as const
            };

            await (action as any).updateDisplay(mockAction, mockMetrics, settings);
            
            expect(mockAction.setTitle).toHaveBeenCalledWith('✅ No\nFailures');  // No failedTestDetails in mock
        });

        it('should display trend mode', async () => {
            const settings = {
                displayMode: 'trend' as const
            };

            await (action as any).updateDisplay(mockAction, mockMetrics, settings);
            
            expect(mockAction.setTitle).toHaveBeenCalled();
        });

        it('should display duration mode', async () => {
            const settings = {
                displayMode: 'performance' as const
            };

            await (action as any).updateDisplay(mockAction, mockMetrics, settings);
            
            expect(mockAction.setTitle).toHaveBeenCalled();
        });

        it('should display detailed mode', async () => {
            const settings = {
                displayMode: 'coverage' as const
            };

            await (action as any).updateDisplay(mockAction, mockMetrics, settings);
            
            expect(mockAction.setTitle).toHaveBeenCalled();
        });

        it('should set correct state for excellent pass rate', async () => {
            const excellentMetrics = {
                ...mockMetrics,
                passRate: 95
            };

            const settings = { displayMode: 'summary' as const };

            await (action as any).updateDisplay(mockAction, excellentMetrics, settings);
            
            expect(mockAction.setState).toHaveBeenCalledWith(0); // Green for excellent
        });

        it('should set correct state for warning pass rate', async () => {
            const warningMetrics = {
                ...mockMetrics,
                passRate: 82
            };

            const settings = { 
                displayMode: 'summary' as const,
                failureThreshold: 15
            };

            await (action as any).updateDisplay(mockAction, warningMetrics, settings);
            
            expect(mockAction.setState).toHaveBeenCalledWith(1); // Warning state
        });

        it('should set correct state for failure pass rate', async () => {
            const failureMetrics = {
                ...mockMetrics,
                passRate: 60
            };

            const settings = { 
                displayMode: 'summary' as const,
                failureThreshold: 30
            };

            await (action as any).updateDisplay(mockAction, failureMetrics, settings);
            
            expect(mockAction.setState).toHaveBeenCalledWith(2); // Failure (orange)
        });
    });

    describe('Error Handling', () => {
        it('should handle test results fetch error gracefully', async () => {
            const settings = {
                orgUrl: 'https://dev.azure.com/test',
                projectName: 'TestProject',
                pipelineId: 123,
                pat: 'encrypted-token'
            };

            mockTestResultsService.getTestMetrics.mockRejectedValueOnce(new Error('Network error'));

            await (action as any).updateTestMetrics('test-action-id', settings);
            
            const state = mockStateManager.getState('test-action-id') as any;
            expect(state.lastError).toBe('Network error');
            expect(mockAction.setTitle).toHaveBeenCalledWith('Error\nFetching\nTests');
            expect(mockAction.setState).toHaveBeenCalledWith(2); // Error state
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
                pipelineId: 123,
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
                pipelineId: 123,
                pat: 'encrypted-token'
                // No refreshInterval specified
            };

            const event = { action: mockAction, payload: { settings } } as any;
            
            await action.onWillAppear(event);
            
            expect(mockSetInterval).toHaveBeenCalledWith(expect.any(Function), 60000); // 60 seconds default
        });

        it('should trigger refresh on interval', async () => {
            const settings = {
                orgUrl: 'https://dev.azure.com/test',
                projectName: 'TestProject',
                pipelineId: 123,
                pat: 'encrypted-token',
                refreshInterval: 60
            };

            const event = { action: mockAction, payload: { settings } } as any;
            
            await action.onWillAppear(event);
            
            expect(mockTestResultsService.getTestMetrics).toHaveBeenCalledTimes(1);
            
            // Advance timer to trigger refresh
            jest.advanceTimersByTime(60000);
            
            expect(mockTestResultsService.getTestMetrics).toHaveBeenCalledTimes(2);
        });
    });

    // Duration formatting is internal to displayPerformance method
});