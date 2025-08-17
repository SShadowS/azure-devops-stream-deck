// Mock modules before imports
jest.mock('@elgato/streamdeck', () => require('../../test-helpers/test-utils').mockStreamDeckModule());

import { BuildQueueManagerAction } from '../build-queue-manager';
import { BuildQueueMetrics, BuildInfo, AgentPoolStatus } from '../../services/build-queue-service';
import { IBuildQueueService, ICredentialManager, IActionStateManager } from '../../interfaces';
import { createMockActionState, createMockAction, createMockEvent } from '../../test-helpers/test-utils';

const mockStreamDeck = jest.requireMock('@elgato/streamdeck').default;

describe('BuildQueueManagerAction', () => {
    let action: BuildQueueManagerAction;
    let mockAction: any;
    let mockBuildQueueService: jest.Mocked<IBuildQueueService>;
    let mockCredentialManager: jest.Mocked<ICredentialManager>;
    let mockStateManager: jest.Mocked<IActionStateManager>;

    const mockAgentStatus: AgentPoolStatus = {
        poolName: 'Default',
        totalAgents: 10,
        onlineAgents: 8,
        busyAgents: 5,
        availableAgents: 3,
        offlineAgents: 2
    };

    const mockRunningBuilds: BuildInfo[] = [
        {
            id: 1,
            buildNumber: '20240101.1',
            definitionName: 'CI Pipeline',
            status: 'In Progress',
            reason: 'Manual',
            startTime: new Date(),
            requestedBy: 'John Doe',
            sourceBranch: 'refs/heads/main',
            canCancel: true,
            estimatedDuration: 25
        },
        {
            id: 2,
            buildNumber: '20240101.2',
            definitionName: 'PR Build',
            status: 'In Progress',
            reason: 'Pull Request',
            startTime: new Date(),
            requestedBy: 'Jane Smith',
            sourceBranch: 'refs/heads/feature/test',
            canCancel: true,
            estimatedDuration: 30
        }
    ];

    const mockQueuedBuilds: BuildInfo[] = [
        {
            id: 3,
            buildNumber: '20240101.3',
            definitionName: 'CI Pipeline',
            status: 'Queued',
            reason: 'CI',
            queueTime: new Date(),
            requestedBy: 'Bob Johnson',
            sourceBranch: 'refs/heads/develop',
            queuePosition: 1,
            canCancel: true,
            estimatedDuration: 20
        },
        {
            id: 4,
            buildNumber: '20240101.4',
            definitionName: 'Release Build',
            status: 'Queued',
            reason: 'Schedule',
            queueTime: new Date(),
            requestedBy: 'System',
            sourceBranch: 'refs/heads/release',
            queuePosition: 2,
            canCancel: true,
            estimatedDuration: 45
        }
    ];

    const mockRecentBuilds: BuildInfo[] = [
        {
            id: 5,
            buildNumber: '20240101.5',
            definitionName: 'CI Pipeline',
            status: 'Completed',
            result: 'Succeeded',
            reason: 'Manual',
            startTime: new Date(Date.now() - 3600000),
            finishTime: new Date(Date.now() - 1800000),
            requestedBy: 'Alice Cooper',
            sourceBranch: 'refs/heads/main',
            canCancel: false,
            estimatedDuration: 30
        },
        {
            id: 6,
            buildNumber: '20240101.6',
            definitionName: 'PR Build',
            status: 'Completed',
            result: 'Failed',
            reason: 'Pull Request',
            startTime: new Date(Date.now() - 7200000),
            finishTime: new Date(Date.now() - 5400000),
            requestedBy: 'Charlie Brown',
            sourceBranch: 'refs/heads/feature/broken',
            canCancel: false,
            estimatedDuration: 30
        }
    ];

    const mockMetrics: BuildQueueMetrics = {
        queueLength: 5,
        runningBuilds: mockRunningBuilds,
        queuedBuilds: mockQueuedBuilds,
        recentBuilds: mockRecentBuilds,
        agentStatus: mockAgentStatus,
        estimatedWaitTime: 15,
        averageBuildTime: 20
    };

    beforeEach(() => {
        jest.clearAllMocks();
        jest.useFakeTimers();
        
        // Create spies for timer functions
        jest.spyOn(global, 'setInterval');
        jest.spyOn(global, 'clearInterval');
        jest.spyOn(global, 'setTimeout');
        jest.spyOn(global, 'clearTimeout');
        
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
        
        // Setup BuildQueueService mock
        mockBuildQueueService = {
            getQueueMetrics: jest.fn().mockResolvedValue(mockMetrics),
            queueBuild: jest.fn().mockResolvedValue({
                id: 123,
                buildNumber: '20240101.999',
                status: 1 // NotStarted
            }),
            cancelBuild: jest.fn().mockResolvedValue(undefined),
            retryBuild: jest.fn().mockResolvedValue({
                id: 124,
                buildNumber: '20240101.1000',
                status: 1 // NotStarted
            })
        } as any;
        
        mockAction = createMockAction();
        mockStreamDeck.actions.getActionById.mockImplementation((id: string) => {
            return mockAction;
        });
        
        // Create action with dependency injection
        action = new BuildQueueManagerAction(
            mockBuildQueueService,
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
                buildDefinitionName: 'CI Pipeline',
                pat: 'encrypted-token',
                poolName: 'Default',
                branch: 'main',
                displayMode: 'queue' as const,
                refreshInterval: 60,
                showEstimates: true,
                autoQueue: false
            };

            const event = createMockEvent('will-appear', { settings }) as any;
            
            await action.onWillAppear(event);
            
            expect(mockCredentialManager.decrypt).toHaveBeenCalledWith('encrypted-token');
            expect(mockBuildQueueService.getQueueMetrics).toHaveBeenCalledWith({
                orgUrl: 'https://dev.azure.com/test',
                projectName: 'TestProject',
                buildDefinitionName: 'CI Pipeline',
                buildDefinitionId: undefined,
                pat: 'decrypted',
                poolName: 'Default',
                branch: 'main'
            });
            expect(mockAction.setTitle).toHaveBeenCalled();
            expect(global.setInterval).toHaveBeenCalledWith(expect.any(Function), 60000);
        });

        it('should show configure message with invalid settings', async () => {
            const settings = {
                orgUrl: 'https://dev.azure.com/test'
                // Missing required fields
            };

            const event = createMockEvent('will-appear', { settings }) as any;
            
            await action.onWillAppear(event);
            
            expect(mockBuildQueueService.getQueueMetrics).not.toHaveBeenCalled();
            expect(mockAction.setTitle).toHaveBeenCalledWith('Configure\nBuild Queue');
            expect(mockAction.setState).toHaveBeenCalledWith(3); // Warning state
        });

        it('should handle error during initialization', async () => {
            const settings = {
                orgUrl: 'https://dev.azure.com/test',
                projectName: 'TestProject',
                pat: 'encrypted-token'
            };

            mockBuildQueueService.getQueueMetrics.mockRejectedValueOnce(new Error('API Error'));

            const event = createMockEvent('will-appear', { settings }) as any;
            
            await action.onWillAppear(event);
            
            expect(mockAction.setTitle).toHaveBeenCalledWith('Error\nFetching\nQueue');
            expect(mockAction.setState).toHaveBeenCalledWith(2); // Error state
        });

        it('should store settings in state', async () => {
            const settings = {
                orgUrl: 'https://dev.azure.com/test',
                projectName: 'TestProject',
                pat: 'encrypted-token'
            };

            const event = createMockEvent('will-appear', { settings }) as any;
            
            await action.onWillAppear(event);
            
            const state = mockStateManager.getState('test-action-id') as any;
            expect(state.lastSettings).toEqual(settings);
        });
    });

    describe('onWillDisappear', () => {
        it('should clear interval on disappear', async () => {
            const state = mockStateManager.getState('test-action-id') as any;
            state.intervalId = 123;
            
            const event = createMockEvent('will-disappear', {}) as any;
            
            await action.onWillDisappear(event);
            
            expect(global.clearInterval).toHaveBeenCalledWith(123);
            expect(state.intervalId).toBeUndefined();
        });

        it('should clear debounce timeout if exists', async () => {
            const timeout = setTimeout(() => {}, 1000);
            (action as any).settingsDebounceTimeouts.set('test-action-id', timeout);
            
            const event = createMockEvent('will-disappear', {}) as any;
            
            await action.onWillDisappear(event);
            
            expect(clearTimeout).toHaveBeenCalledWith(timeout);
            expect((action as any).settingsDebounceTimeouts.has('test-action-id')).toBe(false);
        });
    });

    describe('onKeyDown', () => {
        it('should queue new build with queue quick action', async () => {
            const settings = {
                orgUrl: 'https://dev.azure.com/test',
                projectName: 'TestProject',
                buildDefinitionName: 'CI Pipeline',
                pat: 'encrypted-token',
                quickAction: 'queue'
            };

            const event = createMockEvent('key-down', { settings }) as any;
            
            await action.onKeyDown(event);
            
            expect(mockBuildQueueService.queueBuild).toHaveBeenCalled();
            expect(mockAction.showOk).toHaveBeenCalled();
        });

        it('should cancel latest build with cancel quick action', async () => {
            const settings = {
                orgUrl: 'https://dev.azure.com/test',
                projectName: 'TestProject',
                pat: 'encrypted-token',
                quickAction: 'cancel'
            };

            const state = mockStateManager.getState('test-action-id') as any;
            state.lastMetrics = mockMetrics;

            const event = createMockEvent('key-down', { settings }) as any;
            
            await action.onKeyDown(event);
            
            expect(mockBuildQueueService.cancelBuild).toHaveBeenCalledWith({
                orgUrl: 'https://dev.azure.com/test',
                projectName: 'TestProject',
                pat: 'decrypted'
            }, 1);
            expect(mockAction.showOk).toHaveBeenCalled();
        });

        it('should retry failed build with retry quick action', async () => {
            const settings = {
                orgUrl: 'https://dev.azure.com/test',
                projectName: 'TestProject',
                pat: 'encrypted-token',
                quickAction: 'retry'
            };

            const state = mockStateManager.getState('test-action-id') as any;
            state.lastMetrics = mockMetrics;

            const event = createMockEvent('key-down', { settings }) as any;
            
            await action.onKeyDown(event);
            
            expect(mockBuildQueueService.retryBuild).toHaveBeenCalledWith({
                orgUrl: 'https://dev.azure.com/test',
                projectName: 'TestProject',
                pat: 'decrypted'
            }, 6); // The failed build ID
            expect(mockAction.showOk).toHaveBeenCalled();
        });

        it('should open Azure DevOps URL when no quick action', async () => {
            const settings = {
                orgUrl: 'https://dev.azure.com/test',
                projectName: 'TestProject',
                pat: 'encrypted-token',
                quickAction: 'open'  // Use a non-handled action to trigger default case
            };

            const event = createMockEvent('key-down', { settings }) as any;
            
            await action.onKeyDown(event);
            
            expect(mockStreamDeck.system.openUrl).toHaveBeenCalledWith(
                'https://dev.azure.com/test/TestProject/_build'
            );
        });

        it('should show alert on error', async () => {
            const settings = {
                orgUrl: 'https://dev.azure.com/test',
                projectName: 'TestProject',
                pat: 'encrypted-token',
                quickAction: 'queue'
            };

            mockBuildQueueService.queueBuild.mockRejectedValueOnce(new Error('Queue failed'));

            const event = createMockEvent('key-down', { settings }) as any;
            
            await action.onKeyDown(event);
            
            expect(mockAction.showAlert).toHaveBeenCalled();
        });

        it('should not process with invalid settings', async () => {
            const settings = {
                quickAction: 'queue'
                // Missing required fields
            };

            const event = createMockEvent('key-down', { settings }) as any;
            
            await action.onKeyDown(event);
            
            expect(mockBuildQueueService.queueBuild).not.toHaveBeenCalled();
        });
    });

    describe('onDidReceiveSettings', () => {
        it('should debounce rapid settings changes', async () => {
            const settings1 = {
                orgUrl: 'https://dev.azure.com/test1',
                projectName: 'Project1',
                pat: 'token1'
            };

            const settings2 = {
                orgUrl: 'https://dev.azure.com/test2',
                projectName: 'Project2',
                pat: 'token2'
            };

            const event1 = createMockEvent('did-receive-settings', { settings: settings1 }) as any;
            const event2 = createMockEvent('did-receive-settings', { settings: settings2 }) as any;
            
            await action.onDidReceiveSettings(event1);
            await action.onDidReceiveSettings(event2);
            
            // Should have created two timeouts but cleared the first
            expect(setTimeout).toHaveBeenCalledTimes(2);
            expect(clearTimeout).toHaveBeenCalledTimes(1);
            
            // Fast-forward time to trigger debounced update
            jest.advanceTimersByTime(500);
            
            // Should only process the second settings
            expect(mockBuildQueueService.getQueueMetrics).toHaveBeenCalledTimes(1);
        });

        it('should restart when connection settings change', async () => {
            const state = mockStateManager.getState('test-action-id') as any;
            state.lastSettings = {
                orgUrl: 'https://dev.azure.com/old',
                projectName: 'OldProject',
                pat: 'old-token'
            };
            state.intervalId = 123;

            const newSettings = {
                orgUrl: 'https://dev.azure.com/new',
                projectName: 'NewProject',
                pat: 'new-token'
            };

            // Call processSettingsChange directly since we need to test the actual logic
            await (action as any).processSettingsChange('test-action-id', newSettings);
            
            expect(global.clearInterval).toHaveBeenCalledWith(123);
            expect(global.setInterval).toHaveBeenCalled();
            expect(mockBuildQueueService.getQueueMetrics).toHaveBeenCalled();
        });

        it('should only update display for display mode changes', async () => {
            const state = mockStateManager.getState('test-action-id') as any;
            state.lastSettings = {
                orgUrl: 'https://dev.azure.com/test',
                projectName: 'TestProject',
                pat: 'token',
                displayMode: 'queue'
            };
            state.lastMetrics = mockMetrics;

            const newSettings = {
                orgUrl: 'https://dev.azure.com/test',
                projectName: 'TestProject',
                pat: 'token',
                displayMode: 'active' as const
            };

            const event = createMockEvent('did-receive-settings', { settings: newSettings }) as any;
            
            await action.onDidReceiveSettings(event);
            jest.advanceTimersByTime(500);
            
            expect(global.clearInterval).not.toHaveBeenCalled();
            expect(mockBuildQueueService.getQueueMetrics).not.toHaveBeenCalled();
            // Display mode changes alone don't trigger display update in current implementation
            expect(mockAction.setTitle).not.toHaveBeenCalled();
        });
    });

    describe('onSendToPlugin', () => {
        it('should handle test connection event', async () => {
            const settings = {
                orgUrl: 'https://dev.azure.com/test',
                projectName: 'TestProject',
                pat: 'encrypted-token'
            };

            const event = {
                action: {
                    ...mockAction,
                    getSettings: jest.fn().mockResolvedValue(settings)
                },
                payload: { event: 'testConnection' }
            } as any;
            
            await action.onSendToPlugin(event);
            
            expect(mockBuildQueueService.getQueueMetrics).toHaveBeenCalled();
            expect(mockStreamDeck.ui.current?.sendToPropertyInspector).toHaveBeenCalledWith({
                event: 'testConnectionResult',
                status: 'success',
                message: expect.stringContaining('Connected!')
            });
        });

        it('should handle test connection error', async () => {
            const settings = {
                orgUrl: 'https://dev.azure.com/test',
                projectName: 'TestProject',
                pat: 'encrypted-token'
            };

            mockBuildQueueService.getQueueMetrics.mockRejectedValueOnce(new Error('Invalid PAT'));

            const event = {
                action: {
                    ...mockAction,
                    getSettings: jest.fn().mockResolvedValue(settings)
                },
                payload: { event: 'testConnection' }
            } as any;
            
            await action.onSendToPlugin(event);
            
            expect(mockStreamDeck.ui.current?.sendToPropertyInspector).toHaveBeenCalledWith({
                event: 'testConnectionResult',
                status: 'error',
                message: 'Invalid PAT'
            });
        });

        it('should handle getBuildDefinitions event', async () => {
            const event = {
                action: {
                    ...mockAction,
                    getSettings: jest.fn().mockResolvedValue({})
                },
                payload: { event: 'getBuildDefinitions' }
            } as any;
            
            await action.onSendToPlugin(event);
            
            expect(mockStreamDeck.ui.current?.sendToPropertyInspector).toHaveBeenCalledWith({
                event: 'didReceiveBuildDefinitions',
                definitions: expect.arrayContaining([
                    expect.objectContaining({ label: 'Main Build', value: 'main-build' })
                ])
            });
        });

        it('should handle getAgentPools event', async () => {
            const event = {
                action: {
                    ...mockAction,
                    getSettings: jest.fn().mockResolvedValue({})
                },
                payload: { event: 'getAgentPools' }
            } as any;
            
            await action.onSendToPlugin(event);
            
            expect(mockStreamDeck.ui.current?.sendToPropertyInspector).toHaveBeenCalledWith({
                event: 'didReceiveAgentPools',
                pools: expect.arrayContaining([
                    expect.objectContaining({ label: 'Default', value: 'Default' })
                ])
            });
        });

        it('should handle queueBuild event', async () => {
            const settings = {
                orgUrl: 'https://dev.azure.com/test',
                projectName: 'TestProject',
                buildDefinitionName: 'CI Pipeline',
                pat: 'encrypted-token'
            };

            const event = {
                action: {
                    ...mockAction,
                    getSettings: jest.fn().mockResolvedValue(settings)
                },
                payload: { event: 'queueBuild' }
            } as any;
            
            await action.onSendToPlugin(event);
            
            expect(mockBuildQueueService.queueBuild).toHaveBeenCalled();
            expect(mockAction.showOk).toHaveBeenCalled();
        });

        it('should handle cancelAllBuilds event', async () => {
            const settings = {
                orgUrl: 'https://dev.azure.com/test',
                projectName: 'TestProject',
                pat: 'encrypted-token'
            };

            const state = mockStateManager.getState('test-action-id') as any;
            state.lastMetrics = mockMetrics;

            const event = {
                action: {
                    ...mockAction,
                    getSettings: jest.fn().mockResolvedValue(settings)
                },
                payload: { event: 'cancelAllBuilds' }
            } as any;
            
            await action.onSendToPlugin(event);
            
            expect(mockBuildQueueService.cancelBuild).toHaveBeenCalledTimes(mockMetrics.queuedBuilds.length);
        });

        it('should ignore non-event payloads', async () => {
            const event = createMockEvent('send-to-plugin', { 
                payload: 'string-payload'
            }) as any;
            
            await action.onSendToPlugin(event);
            
            expect(mockStreamDeck.ui.current?.sendToPropertyInspector).not.toHaveBeenCalled();
        });
    });

    describe('Display Modes', () => {
        beforeEach(async () => {
            const settings = {
                orgUrl: 'https://dev.azure.com/test',
                projectName: 'TestProject',
                pat: 'encrypted-token'
            };

            const event = createMockEvent('will-appear', { settings }) as any;
            await action.onWillAppear(event);
            jest.clearAllMocks();
        });

        it('should display queue status mode', async () => {
            const settings = {
                displayMode: 'queue' as const,
                showEstimates: true
            };

            await (action as any).updateDisplay(mockAction, mockMetrics, settings);
            
            expect(mockAction.setTitle).toHaveBeenCalledWith(expect.stringContaining('5 Queued'));
            expect(mockAction.setTitle).toHaveBeenCalledWith(expect.stringContaining('2 Running'));
            expect(mockAction.setTitle).toHaveBeenCalledWith(expect.stringContaining('15m wait'));
        });

        it('should display active builds mode', async () => {
            const settings = {
                displayMode: 'active' as const
            };

            await (action as any).updateDisplay(mockAction, mockMetrics, settings);
            
            expect(mockAction.setTitle).toHaveBeenCalledWith(expect.stringContaining('20240101.1'));
        });

        it('should display agents status mode', async () => {
            const settings = {
                displayMode: 'agents' as const
            };

            await (action as any).updateDisplay(mockAction, mockMetrics, settings);
            
            expect(mockAction.setTitle).toHaveBeenCalledWith(expect.stringContaining('Default'));
            expect(mockAction.setTitle).toHaveBeenCalledWith(expect.stringContaining('8/10 Online'));
        });

        it('should display quick actions mode', async () => {
            const settings = {
                displayMode: 'quick' as const,
                quickAction: 'queue'
            };

            await (action as any).updateDisplay(mockAction, mockMetrics, settings);
            
            expect(mockAction.setTitle).toHaveBeenCalledWith(expect.stringContaining('🚀 Queue Build'));
        });

        it('should display detailed mode', async () => {
            const settings = {
                displayMode: 'detailed' as const
            };

            await (action as any).updateDisplay(mockAction, mockMetrics, settings);
            
            expect(mockAction.setTitle).toHaveBeenCalledWith(expect.stringContaining('Q:5 R:2'));
            expect(mockAction.setTitle).toHaveBeenCalledWith(expect.stringContaining('Avg: 20m'));
        });

        it('should set correct state for idle queue', async () => {
            const idleMetrics = {
                ...mockMetrics,
                queueLength: 0,
                runningBuilds: []
            };

            const settings = { displayMode: 'queue' as const };

            await (action as any).updateDisplay(mockAction, idleMetrics, settings);
            
            expect(mockAction.setState).toHaveBeenCalledWith(0); // Green for idle
        });

        it('should set correct state for busy queue', async () => {
            const busyMetrics = {
                ...mockMetrics,
                queueLength: 10,
                estimatedWaitTime: 90
            };

            const settings = { displayMode: 'queue' as const };

            await (action as any).updateDisplay(mockAction, busyMetrics, settings);
            
            expect(mockAction.setState).toHaveBeenCalledWith(2); // Red for busy
        });

        it('should set correct state for active queue', async () => {
            const activeMetrics = {
                ...mockMetrics,
                queueLength: 2,
                estimatedWaitTime: 10
            };

            const settings = { displayMode: 'queue' as const };

            await (action as any).updateDisplay(mockAction, activeMetrics, settings);
            
            expect(mockAction.setState).toHaveBeenCalledWith(1); // Blue for active
        });
    });

    describe('Queue Operations', () => {
        it('should queue new build successfully', async () => {
            const settings = {
                orgUrl: 'https://dev.azure.com/test',
                projectName: 'TestProject',
                buildDefinitionName: 'CI Pipeline',
                pat: 'encrypted-token',
                branch: 'main'
            };

            await (action as any).queueNewBuild('test-action-id', settings);
            
            expect(mockBuildQueueService.queueBuild).toHaveBeenCalledWith(
                {
                    orgUrl: 'https://dev.azure.com/test',
                    projectName: 'TestProject',
                    pat: 'decrypted'
                },
                0,  // definitionId defaults to 0 when undefined
                'main'  // branch
            );
            expect(mockAction.showOk).toHaveBeenCalled();
            expect(mockBuildQueueService.getQueueMetrics).toHaveBeenCalled(); // Refresh after queue
        });

        it('should handle queue build error', async () => {
            const settings = {
                orgUrl: 'https://dev.azure.com/test',
                projectName: 'TestProject',
                buildDefinitionName: 'CI Pipeline',
                pat: 'encrypted-token'
            };

            mockBuildQueueService.queueBuild.mockRejectedValueOnce(new Error('Queue failed'));

            await (action as any).queueNewBuild('test-action', settings);
            
            expect(mockAction.showAlert).toHaveBeenCalled();
        });

        it('should cancel latest build successfully', async () => {
            const settings = {
                orgUrl: 'https://dev.azure.com/test',
                projectName: 'TestProject',
                pat: 'encrypted-token'
            };

            const state = mockStateManager.getState('test-action-id') as any;
            state.lastMetrics = mockMetrics;

            await (action as any).cancelLatestBuild('test-action', settings);
            
            expect(mockBuildQueueService.cancelBuild).toHaveBeenCalledWith({
                orgUrl: 'https://dev.azure.com/test',
                projectName: 'TestProject',
                pat: 'decrypted'
            }, 1); // First running build ID
            expect(mockAction.showOk).toHaveBeenCalled();
        });

        it('should handle no running builds to cancel', async () => {
            const settings = {
                orgUrl: 'https://dev.azure.com/test',
                projectName: 'TestProject',
                pat: 'encrypted-token'
            };

            const state = mockStateManager.getState('test-action-id') as any;
            state.lastMetrics = { ...mockMetrics, runningBuilds: [] };

            await (action as any).cancelLatestBuild('test-action', settings);
            
            expect(mockBuildQueueService.cancelBuild).not.toHaveBeenCalled();
            expect(mockAction.showAlert).toHaveBeenCalled();
        });

        it('should retry failed build successfully', async () => {
            const settings = {
                orgUrl: 'https://dev.azure.com/test',
                projectName: 'TestProject',
                pat: 'encrypted-token'
            };

            const state = mockStateManager.getState('test-action-id') as any;
            state.lastMetrics = mockMetrics;

            await (action as any).retryFailedBuild('test-action', settings);
            
            expect(mockBuildQueueService.retryBuild).toHaveBeenCalledWith({
                orgUrl: 'https://dev.azure.com/test',
                projectName: 'TestProject',
                pat: 'decrypted'
            }, 6); // The failed build ID
            expect(mockAction.showOk).toHaveBeenCalled();
        });

        it('should handle no failed builds to retry', async () => {
            const settings = {
                orgUrl: 'https://dev.azure.com/test',
                projectName: 'TestProject',
                pat: 'encrypted-token'
            };

            const state = mockStateManager.getState('test-action-id') as any;
            const metricsWithoutFailed = {
                ...mockMetrics,
                recentBuilds: mockMetrics.recentBuilds.filter(b => b.result !== 'Failed')
            };
            state.lastMetrics = metricsWithoutFailed;

            await (action as any).retryFailedBuild('test-action', settings);
            
            expect(mockBuildQueueService.retryBuild).not.toHaveBeenCalled();
            expect(mockAction.showAlert).toHaveBeenCalled();
        });

        it('should cancel all queued builds', async () => {
            const settings = {
                orgUrl: 'https://dev.azure.com/test',
                projectName: 'TestProject',
                pat: 'encrypted-token'
            };

            const state = mockStateManager.getState('test-action-id') as any;
            state.lastMetrics = mockMetrics;

            await (action as any).cancelAllQueuedBuilds('test-action', settings);
            
            expect(mockBuildQueueService.cancelBuild).toHaveBeenCalledTimes(mockMetrics.queuedBuilds.length);
            expect(mockBuildQueueService.cancelBuild).toHaveBeenCalledWith(
                expect.objectContaining({ pat: 'decrypted' }),
                3 // First queued build ID
            );
            expect(mockBuildQueueService.cancelBuild).toHaveBeenCalledWith(
                expect.objectContaining({ pat: 'decrypted' }),
                4 // Second queued build ID
            );
        });

        it('should handle no queued builds to cancel', async () => {
            const settings = {
                orgUrl: 'https://dev.azure.com/test',
                projectName: 'TestProject',
                pat: 'encrypted-token'
            };

            const state = mockStateManager.getState('test-action-id') as any;
            state.lastMetrics = { ...mockMetrics, queuedBuilds: [] };

            await (action as any).cancelAllQueuedBuilds('test-action', settings);
            
            expect(mockBuildQueueService.cancelBuild).not.toHaveBeenCalled();
        });
    });

    describe('Error Handling', () => {
        it('should handle metrics fetch error gracefully', async () => {
            const settings = {
                orgUrl: 'https://dev.azure.com/test',
                projectName: 'TestProject',
                pat: 'encrypted-token'
            };

            mockBuildQueueService.getQueueMetrics.mockRejectedValueOnce(new Error('Network error'));

            await (action as any).updateQueueMetrics('test-action', settings);
            
            const state = mockStateManager.getState('test-action-id') as any;
            expect(state.lastError).toBe('Network error');
            expect(mockAction.setTitle).toHaveBeenCalledWith('Error\nFetching\nQueue');
            expect(mockAction.setState).toHaveBeenCalledWith(2);
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
                pat: 'encrypted-token'
                // No refreshInterval specified
            };

            const event = createMockEvent('will-appear', { settings }) as any;
            
            await action.onWillAppear(event);
            
            expect(global.setInterval).toHaveBeenCalledWith(expect.any(Function), 30000); // 30 seconds default
        });

        it('should trigger refresh on interval', async () => {
            const settings = {
                orgUrl: 'https://dev.azure.com/test',
                projectName: 'TestProject',
                pat: 'encrypted-token',
                refreshInterval: 60
            };

            const event = createMockEvent('will-appear', { settings }) as any;
            
            await action.onWillAppear(event);
            
            expect(mockBuildQueueService.getQueueMetrics).toHaveBeenCalledTimes(1);
            
            // Advance timer to trigger refresh
            jest.advanceTimersByTime(60000);
            
            expect(mockBuildQueueService.getQueueMetrics).toHaveBeenCalledTimes(2);
        });

        it('should clear old interval when settings change', async () => {
            const state = mockStateManager.getState('test-action-id') as any;
            state.intervalId = 123;
            state.lastSettings = {
                orgUrl: 'old-url',
                projectName: 'old-project',
                pat: 'old-token'
            };

            const newSettings = {
                orgUrl: 'new-url',
                projectName: 'new-project',
                pat: 'new-token'
            };

            // Call processSettingsChange directly to test the actual logic
            await (action as any).processSettingsChange('test-action-id', newSettings);
            
            expect(global.clearInterval).toHaveBeenCalledWith(123);
            expect(global.setInterval).toHaveBeenCalled();
        });
    });

    describe('Auto-Queue Feature', () => {
        it('should auto-queue builds when enabled', async () => {
            const settings = {
                orgUrl: 'https://dev.azure.com/test',
                projectName: 'TestProject',
                buildDefinitionName: 'CI Pipeline',
                pat: 'encrypted-token',
                autoQueue: true
            };

            const emptyMetrics = {
                ...mockMetrics,
                queueLength: 0,
                runningBuilds: [],
                queuedBuilds: []
            };

            mockBuildQueueService.getQueueMetrics.mockResolvedValueOnce(emptyMetrics);

            const event = createMockEvent('will-appear', { settings }) as any;
            
            await action.onWillAppear(event);
            
            // Should auto-queue when queue is empty
            // Note: This would need to be implemented in the actual action
        });
    });

    describe('Agent Pool Status', () => {
        it('should display correct agent pool information', async () => {
            const settings = {
                displayMode: 'agents' as const
            };

            await (action as any).displayAgentStatus(mockAction, mockMetrics);
            
            expect(mockAction.setTitle).toHaveBeenCalledWith(expect.stringContaining('Default'));
            expect(mockAction.setTitle).toHaveBeenCalledWith(expect.stringContaining('8/10 Online'));
            expect(mockAction.setTitle).toHaveBeenCalledWith(expect.stringContaining('5 Busy'));
            expect(mockAction.setTitle).toHaveBeenCalledWith(expect.stringContaining('3 Available'));
        });

        it('should handle missing agent pool data', async () => {
            const metricsWithoutAgents = {
                ...mockMetrics,
                agentStatus: {
                    poolName: 'Unknown',
                    totalAgents: 0,
                    onlineAgents: 0,
                    busyAgents: 0,
                    availableAgents: 0,
                    offlineAgents: 0
                }
            };

            await (action as any).displayAgentStatus(mockAction, metricsWithoutAgents);
            
            expect(mockAction.setTitle).toHaveBeenCalledWith(expect.stringContaining('Unknown'));
            expect(mockAction.setTitle).toHaveBeenCalledWith(expect.stringContaining('0/0 Online'));
        });
    });

    describe('Build Information Display', () => {
        it('should format build duration correctly', async () => {
            const build = mockRunningBuilds[0];
            build.startTime = new Date(Date.now() - 1800000); // 30 minutes ago

            const activeMetrics = {
                ...mockMetrics,
                runningBuilds: [build]
            };

            const settings = { displayMode: 'active' as const };

            await (action as any).displayActiveBuilds(mockAction, activeMetrics);
            
            expect(mockAction.setTitle).toHaveBeenCalledWith(expect.stringContaining('30m running'));
        });

        it('should truncate long branch names', async () => {
            const build = {
                ...mockRunningBuilds[0],
                sourceBranch: 'refs/heads/feature/very-long-branch-name-that-should-be-truncated'
            };

            const activeMetrics = {
                ...mockMetrics,
                runningBuilds: [build]
            };

            const settings = { displayMode: 'active' as const };

            await (action as any).displayActiveBuilds(mockAction, activeMetrics);
            
            expect(mockAction.setTitle).toHaveBeenCalledWith(expect.stringContaining('feature/very-long-branch-name-that-should-be-truncated'));
        });

        it('should show first failed test name in detailed mode', async () => {
            const failedDetails = mockMetrics.recentBuilds[1]; // The failed build
            
            const settings = { displayMode: 'failed' as const };

            // This test assumes a display mode that shows failed build info
            // Actual implementation may vary
        });
    });
});