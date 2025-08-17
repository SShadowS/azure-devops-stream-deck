// Mock modules before imports
jest.mock('@elgato/streamdeck', () => require('../../test-helpers/test-utils').mockStreamDeckModule());
jest.mock('../../services/repository-stats-service');
jest.mock('../../utils/credential-manager');
jest.mock('../../utils/action-state-manager');

import { RepositoryStatsAction } from '../repository-stats';
import { RepositoryStatsService, RepositoryMetrics } from '../../services/repository-stats-service';
import { CredentialManager } from '../../utils/credential-manager';
import { ActionStateManager } from '../../utils/action-state-manager';
import { createMockActionState, createMockAction, createMockEvent } from '../../test-helpers/test-utils';

const mockStreamDeck = jest.requireMock('@elgato/streamdeck').default;

describe('RepositoryStatsAction', () => {
    let action: RepositoryStatsAction;
    let mockAction: any;
    let mockRepositoryStatsService: any;
    let mockCredentialManager: jest.Mocked<CredentialManager>;
    let mockStateManager: jest.Mocked<ActionStateManager>;

    const mockMetrics: RepositoryMetrics = {
        repositoryName: 'test-repo',
        branch: 'main',
        commits: {
            todayCount: 5,
            weekCount: 25,
            monthCount: 100,
            totalCount: 500,
            lastCommitDate: new Date(),
            lastCommitAuthor: 'John Doe',
            lastCommitMessage: 'Fix bug'
        },
        contributors: {
            activeContributors: 5,
            totalContributors: 10,
            topContributors: [
                { name: 'John Doe', email: 'john@example.com', commitCount: 50, linesAdded: 1000, linesDeleted: 200 }
            ]
        },
        activity: {
            trend: 'increasing' as 'increasing' | 'stable' | 'decreasing',
            hottestFiles: ['src/main.ts', 'src/index.ts'],
            activeBranches: 3,
            stalebranchesCount: 2
        },
        pullRequests: {
            openCount: 3,
            mergedThisWeek: 7,
            averageMergeTime: 24,
            reviewTurnaround: 12
        },
        codeMetrics: {
            additions: 5000,
            deletions: 2000,
            churnRate: 15.5,
            filesChanged: 45
        }
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
            clearState: jest.fn(),
            getAllStates: jest.fn().mockReturnValue(new Map())
        } as any;
        (ActionStateManager as jest.Mock).mockImplementation(() => mockStateManager);
        
        // Setup CredentialManager mock
        mockCredentialManager = {
            encrypt: jest.fn().mockReturnValue('encrypted'),
            decrypt: jest.fn().mockReturnValue('decrypted'),
            validatePAT: jest.fn().mockResolvedValue(true)
        } as any;
        (CredentialManager as jest.Mock).mockImplementation(() => mockCredentialManager);
        
        // Setup RepositoryStatsService mock
        mockRepositoryStatsService = {
            getRepositoryMetrics: jest.fn().mockResolvedValue(mockMetrics)
        } as any;
        (RepositoryStatsService as jest.Mock).mockImplementation(() => mockRepositoryStatsService);
        
        mockAction = createMockAction();
        mockStreamDeck.actions.getActionById.mockImplementation((id: string) => {
            // Always return the mockAction for any ID
            return mockAction;
        });
        
        action = new RepositoryStatsAction();
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
                repositoryName: 'test-repo',
                pat: 'encrypted-token',
                refreshInterval: 60,
                displayMode: 'commits' as const,
                timeRange: 'week' as const,
                showTrend: true
            };

            const event = createMockEvent('will-appear', { settings }) as any;
            
            await action.onWillAppear(event);
            
            expect(mockCredentialManager.decrypt).toHaveBeenCalledWith('encrypted-token');
            expect(mockRepositoryStatsService.getRepositoryMetrics).toHaveBeenCalledWith({
                orgUrl: 'https://dev.azure.com/test',
                projectName: 'TestProject',
                repositoryName: 'test-repo',
                pat: 'decrypted',
                branch: undefined
            });
            expect(mockAction.setTitle).toHaveBeenCalledWith('25 Commits\nThis Week\n📈 increasing');
            expect(mockAction.setState).toHaveBeenCalledWith(0); // Green for increasing
        });

        it('should show configure message with invalid settings', async () => {
            const settings = {
                orgUrl: 'https://dev.azure.com/test'
                // Missing required fields
            };

            const event = createMockEvent('will-appear', { settings }) as any;
            
            await action.onWillAppear(event);
            
            expect(mockRepositoryStatsService.getRepositoryMetrics).not.toHaveBeenCalled();
            expect(mockAction.setTitle).toHaveBeenCalledWith('Configure\nRepository');
            expect(mockAction.setState).toHaveBeenCalledWith(2); // Warning state
        });

        it('should handle specific branch setting', async () => {
            const settings = {
                orgUrl: 'https://dev.azure.com/test',
                projectName: 'TestProject',
                repositoryName: 'test-repo',
                pat: 'encrypted-token',
                branch: 'develop'
            };

            const event = createMockEvent('will-appear', { settings }) as any;
            
            await action.onWillAppear(event);
            
            expect(mockRepositoryStatsService.getRepositoryMetrics).toHaveBeenCalledWith(
                expect.objectContaining({ branch: 'develop' })
            );
        });

        it('should set up refresh interval', async () => {
            const settings = {
                orgUrl: 'https://dev.azure.com/test',
                projectName: 'TestProject',
                repositoryName: 'test-repo',
                pat: 'encrypted-token',
                refreshInterval: 120 // 2 minutes
            };

            const event = createMockEvent('will-appear', { settings }) as any;
            
            await action.onWillAppear(event);
            
            expect(setInterval).toHaveBeenCalledWith(expect.any(Function), 120000);
        });

        it('should handle error during initialization', async () => {
            const settings = {
                orgUrl: 'https://dev.azure.com/test',
                projectName: 'TestProject',
                repositoryName: 'test-repo',
                pat: 'encrypted-token'
            };

            mockRepositoryStatsService.getRepositoryMetrics.mockRejectedValueOnce(new Error('API Error'));

            const event = createMockEvent('will-appear', { settings }) as any;
            
            await action.onWillAppear(event);
            
            expect(mockAction.setTitle).toHaveBeenCalledWith('Error\nFetching\nStats');
            expect(mockAction.setState).toHaveBeenCalledWith(1); // Error state
        });
    });

    describe('onWillDisappear', () => {
        it('should clear interval on disappear', async () => {
            const state = mockStateManager.getState('test-action-id') as any;
            state.intervalId = 123;
            
            const event = createMockEvent('will-disappear', {}) as any;
            
            await action.onWillDisappear(event);
            
            expect(clearInterval).toHaveBeenCalledWith(123);
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
        it('should open repository URL in browser on key press', async () => {
            const settings = {
                orgUrl: 'https://dev.azure.com/test',
                projectName: 'TestProject',
                repositoryName: 'test-repo',
                pat: 'token'
            };

            const event = createMockEvent('key-down', { settings }) as any;
            
            await action.onKeyDown(event);
            
            expect(mockStreamDeck.system.openUrl).toHaveBeenCalledWith(
                'https://dev.azure.com/test/TestProject/_git/test-repo'
            );
        });

        it('should not open URL with incomplete settings', async () => {
            const settings = {
                orgUrl: 'https://dev.azure.com/test',
                projectName: 'TestProject'
                // Missing repositoryName
            };

            const event = createMockEvent('key-down', { settings }) as any;
            
            await action.onKeyDown(event);
            
            expect(mockStreamDeck.system.openUrl).not.toHaveBeenCalled();
        });
    });

    describe('onDidReceiveSettings', () => {
        it('should debounce rapid settings changes', async () => {
            const settings1 = {
                orgUrl: 'https://dev.azure.com/test1',
                projectName: 'Project1',
                repositoryName: 'repo1',
                pat: 'token1'
            };

            const settings2 = {
                orgUrl: 'https://dev.azure.com/test2',
                projectName: 'Project2',
                repositoryName: 'repo2',
                pat: 'token2'
            };

            const event1 = createMockEvent('did-receive-settings', { settings: settings1 }) as any;
            const event2 = createMockEvent('did-receive-settings', { settings: settings2 }) as any;
            
            await action.onDidReceiveSettings(event1);
            await action.onDidReceiveSettings(event2);
            
            // Should have created two timeouts but cleared the first
            expect(setTimeout).toHaveBeenCalledTimes(2);
            expect(clearTimeout).toHaveBeenCalledTimes(1);
            
            // Run all timers to trigger the debounced update
            jest.runAllTimers();
            
            // Should only process the second settings
            expect(mockRepositoryStatsService.getRepositoryMetrics).toHaveBeenCalledTimes(1);
        });

        it('should restart when connection settings change', async () => {
            const state = mockStateManager.getState('test-action-id') as any;
            state.lastSettings = {
                orgUrl: 'https://dev.azure.com/old',
                projectName: 'OldProject',
                repositoryName: 'old-repo',
                pat: 'old-token',
                displayMode: 'commits'
            };
            state.intervalId = 123;

            const newSettings = {
                orgUrl: 'https://dev.azure.com/new',
                projectName: 'NewProject',
                repositoryName: 'new-repo',
                pat: 'new-token',
                displayMode: 'commits'
            };

            const event = createMockEvent('did-receive-settings', { settings: newSettings }) as any;
            
            await action.onDidReceiveSettings(event);
            jest.runAllTimers();
            
            expect(clearInterval).toHaveBeenCalledWith(123);
            expect(mockRepositoryStatsService.getRepositoryMetrics).toHaveBeenCalled();
        });

        it('should only update display for display mode changes', async () => {
            const state = mockStateManager.getState('test-action-id') as any;
            state.lastSettings = {
                orgUrl: 'https://dev.azure.com/test',
                projectName: 'TestProject',
                repositoryName: 'test-repo',
                pat: 'token',
                displayMode: 'commits'
            };
            state.lastMetrics = mockMetrics;

            const newSettings = {
                orgUrl: 'https://dev.azure.com/test',
                projectName: 'TestProject',
                repositoryName: 'test-repo',
                pat: 'token',
                displayMode: 'contributors' as const
            };

            // Call processSettingsChange directly instead of going through onDidReceiveSettings
            await (action as any).processSettingsChange('test-action-id', newSettings);
            
            expect(clearInterval).not.toHaveBeenCalled();
            expect(mockRepositoryStatsService.getRepositoryMetrics).not.toHaveBeenCalled();
            expect(mockAction.setTitle).toHaveBeenCalledWith('5 Active\nContributors\n👑 John');
        });
    });

    describe('onSendToPlugin', () => {
        it('should handle test connection event', async () => {
            const settings = {
                orgUrl: 'https://dev.azure.com/test',
                projectName: 'TestProject',
                repositoryName: 'test-repo',
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
            
            expect(mockRepositoryStatsService.getRepositoryMetrics).toHaveBeenCalled();
            expect(mockStreamDeck.ui.current?.sendToPropertyInspector).toHaveBeenCalledWith({
                event: 'testConnectionResult',
                status: 'success',
                message: 'Connected! 25 commits this week'
            });
        });

        it('should handle test connection error', async () => {
            const settings = {
                orgUrl: 'https://dev.azure.com/test',
                projectName: 'TestProject',
                repositoryName: 'test-repo',
                pat: 'encrypted-token'
            };

            mockRepositoryStatsService.getRepositoryMetrics.mockRejectedValueOnce(new Error('Invalid PAT'));

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

        it('should handle getRepositories event', async () => {
            const event = {
                action: {
                    ...mockAction,
                    getSettings: jest.fn().mockResolvedValue({})
                },
                payload: { event: 'getRepositories' }
            } as any;
            
            await action.onSendToPlugin(event);
            
            expect(mockStreamDeck.ui.current?.sendToPropertyInspector).toHaveBeenCalledWith({
                event: 'didReceiveRepositories',
                repositories: expect.arrayContaining([
                    expect.objectContaining({ label: 'Main Repository', value: 'main-repo' })
                ])
            });
        });

        it('should handle getBranches event', async () => {
            const event = {
                action: {
                    ...mockAction,
                    getSettings: jest.fn().mockResolvedValue({})
                },
                payload: { event: 'getBranches' }
            } as any;
            
            await action.onSendToPlugin(event);
            
            expect(mockStreamDeck.ui.current?.sendToPropertyInspector).toHaveBeenCalledWith({
                event: 'didReceiveBranches',
                branches: expect.arrayContaining([
                    expect.objectContaining({ label: 'Default Branch', value: '' }),
                    expect.objectContaining({ label: 'main', value: 'main' })
                ])
            });
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
                repositoryName: 'test-repo',
                pat: 'encrypted-token'
            };

            const event = createMockEvent('will-appear', { settings }) as any;
            await action.onWillAppear(event);
            jest.clearAllMocks();
        });

        it('should display commits with today time range', async () => {
            const settings = {
                displayMode: 'commits' as const,
                timeRange: 'today' as const,
                showTrend: false
            };

            await (action as any).updateDisplay(mockAction, mockMetrics, settings);
            
            expect(mockAction.setTitle).toHaveBeenCalledWith('5 Commits\nToday\ntest-repo');
        });

        it('should display commits with month time range and trend', async () => {
            const settings = {
                displayMode: 'commits' as const,
                timeRange: 'month' as const,
                showTrend: true
            };

            await (action as any).updateDisplay(mockAction, mockMetrics, settings);
            
            expect(mockAction.setTitle).toHaveBeenCalledWith('100 Commits\nThis Month\n📈 increasing');
        });

        it('should display contributors mode', async () => {
            const settings = {
                displayMode: 'contributors' as const
            };

            await (action as any).updateDisplay(mockAction, mockMetrics, settings);
            
            expect(mockAction.setTitle).toHaveBeenCalledWith('5 Active\nContributors\n👑 John');
        });

        it('should display activity mode', async () => {
            const settings = {
                displayMode: 'activity' as const
            };

            await (action as any).updateDisplay(mockAction, mockMetrics, settings);
            
            expect(mockAction.setTitle).toHaveBeenCalledWith('📈 increasing\n3 Branches\ntest-repo');
            expect(mockAction.setState).toHaveBeenCalledWith(0); // Green for increasing
        });

        it('should display pull requests mode', async () => {
            const settings = {
                displayMode: 'prs' as const
            };

            await (action as any).updateDisplay(mockAction, mockMetrics, settings);
            
            expect(mockAction.setTitle).toHaveBeenCalledWith('3 Open PRs\n7 Merged\n~24h to merge');
        });

        it('should display detailed mode', async () => {
            const settings = {
                displayMode: 'detailed' as const
            };

            await (action as any).updateDisplay(mockAction, mockMetrics, settings);
            
            expect(mockAction.setTitle).toHaveBeenCalledWith('test-repo\n25c 3pr\n5 contributors\nincreasing');
        });

        it('should set correct state for stable trend', async () => {
            const stableMetrics = {
                ...mockMetrics,
                activity: { ...mockMetrics.activity, trend: 'stable' }
            };

            const settings = { displayMode: 'activity' as const };

            await (action as any).updateDisplay(mockAction, stableMetrics, settings);
            
            expect(mockAction.setState).toHaveBeenCalledWith(2); // Blue for stable
        });

        it('should set correct state for decreasing trend', async () => {
            const decreasingMetrics = {
                ...mockMetrics,
                activity: { ...mockMetrics.activity, trend: 'decreasing' }
            };

            const settings = { displayMode: 'activity' as const };

            await (action as any).updateDisplay(mockAction, decreasingMetrics, settings);
            
            expect(mockAction.setState).toHaveBeenCalledWith(1); // Yellow for decreasing
        });
    });

    describe('Error Handling', () => {
        it('should handle metrics fetch error gracefully', async () => {
            const settings = {
                orgUrl: 'https://dev.azure.com/test',
                projectName: 'TestProject',
                repositoryName: 'test-repo',
                pat: 'encrypted-token'
            };

            mockRepositoryStatsService.getRepositoryMetrics.mockRejectedValueOnce(new Error('Network error'));

            await (action as any).updateRepositoryStats('test-action', settings);
            
            const state = mockStateManager.getState('test-action-id') as any;
            expect(state.lastError).toBe('Network error');
            expect(mockAction.setTitle).toHaveBeenCalledWith('Error\nFetching\nStats');
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
                repositoryName: 'test-repo',
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
                repositoryName: 'test-repo',
                pat: 'encrypted-token'
                // No refreshInterval specified
            };

            const event = createMockEvent('will-appear', { settings }) as any;
            
            await action.onWillAppear(event);
            
            expect(setInterval).toHaveBeenCalledWith(expect.any(Function), 300000); // 5 minutes default
        });

        it('should trigger refresh on interval', async () => {
            const settings = {
                orgUrl: 'https://dev.azure.com/test',
                projectName: 'TestProject',
                repositoryName: 'test-repo',
                pat: 'encrypted-token',
                refreshInterval: 60
            };

            const event = createMockEvent('will-appear', { settings }) as any;
            
            await action.onWillAppear(event);
            
            expect(mockRepositoryStatsService.getRepositoryMetrics).toHaveBeenCalledTimes(1);
            
            // Advance timer to trigger refresh
            jest.advanceTimersByTime(60000);
            
            expect(mockRepositoryStatsService.getRepositoryMetrics).toHaveBeenCalledTimes(2);
        });

        it('should clear old interval when settings change', async () => {
            const state = mockStateManager.getState('test-action-id') as any;
            state.intervalId = 123;
            state.lastSettings = {
                orgUrl: 'old-url',
                projectName: 'old-project',
                repositoryName: 'old-repo',
                pat: 'old-token'
            };

            const newSettings = {
                orgUrl: 'new-url',
                projectName: 'new-project',
                repositoryName: 'new-repo',
                pat: 'encrypted-token'  // Use encrypted token
            };

            // Call processSettingsChange directly
            await (action as any).processSettingsChange('test-action-id', newSettings);
            
            // Clear interval should have been called
            expect(clearInterval).toHaveBeenCalledWith(123);
            
            // setInterval should have been called in initializeAction
            expect(setInterval).toHaveBeenCalled();
        });
    });
});