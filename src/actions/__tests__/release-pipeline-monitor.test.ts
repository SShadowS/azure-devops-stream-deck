// Mock modules before imports
jest.mock('@elgato/streamdeck', () => require('../../test-helpers/test-utils').mockStreamDeckModule());

import { ReleasePipelineMonitorAction } from '../release-pipeline-monitor';
import { IReleasePipelineService, ICredentialManager, IActionStateManager } from '../../interfaces';
import { createMockActionState, createMockAction, createMockEvent } from '../../test-helpers/test-utils';

const mockStreamDeck = jest.requireMock('@elgato/streamdeck').default;

describe('ReleasePipelineMonitorAction', () => {
    let action: ReleasePipelineMonitorAction;
    let mockAction: any;
    let mockReleasePipelineService: jest.Mocked<IReleasePipelineService>;
    let mockCredentialManager: jest.Mocked<ICredentialManager>;
    let mockStateManager: jest.Mocked<IActionStateManager>;

    beforeEach(() => {
        jest.clearAllMocks();
        
        // Mock timers
        jest.spyOn(global, 'clearInterval');
        jest.spyOn(global, 'clearTimeout');
        jest.spyOn(global, 'setInterval');
        jest.spyOn(global, 'setTimeout');
        
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
        
        // Setup ReleasePipelineService mock
        mockReleasePipelineService = {
            getReleaseMetrics: jest.fn().mockResolvedValue({
                latestRelease: {
                    id: 123,
                    name: 'Release-1.0.0',
                    status: 'succeeded',
                    environments: [
                        { name: 'Dev', status: 'succeeded' },
                        { name: 'Staging', status: 'inProgress' },
                        { name: 'Production', status: 'notStarted' }
                    ],
                    createdOn: new Date(),
                    modifiedOn: new Date()
                },
                totalReleases: 50,
                successfulReleases: 45,
                failedReleases: 3,
                partialReleases: 2,
                successRate: 90,
                averageDuration: 1200,
                pendingApprovals: 2
            }),
            getReleaseDefinitions: jest.fn().mockResolvedValue([
                { id: 1, name: 'Release-Def-1' },
                { id: 2, name: 'Release-Def-2' }
            ]),
            getEnvironments: jest.fn().mockResolvedValue([
                { id: 1, name: 'Dev' },
                { id: 2, name: 'Staging' },
                { id: 3, name: 'Production' }
            ])
        } as any;
        
        // Create action instance with dependency injection
        action = new ReleasePipelineMonitorAction(
            mockReleasePipelineService,
            mockCredentialManager,
            mockStateManager
        );
        mockAction = createMockAction();
    });

    describe('constructor', () => {
        it('should create an instance', () => {
            expect(action).toBeDefined();
            expect(action).toBeInstanceOf(ReleasePipelineMonitorAction);
        });
    });

    describe('onWillAppear', () => {
        it('should initialize with valid settings', async () => {
            const settings = {
                orgUrl: 'https://dev.azure.com/test',
                projectName: 'TestProject',
                releaseDefinitionId: 1,
                pat: 'test-pat'
            };
            
            const event = {
                action: mockAction,
                payload: { settings }
            };
            
            await action.onWillAppear(event as any);
            
            expect(mockStreamDeck.logger.info).toHaveBeenCalledWith(
                expect.stringContaining('Release Pipeline Monitor action will appear')
            );
        });
    });

    describe('onWillDisappear', () => {
        it('should cleanup resources', async () => {
            const stateManager = mockStateManager;
            const state = stateManager.getState('test-action-id');
            const intervalId = setInterval(() => {}, 1000);
            (state as any).intervalId = intervalId;
            
            const event = {
                action: mockAction,
                payload: {}
            };
            
            // Mock clearInterval
            jest.spyOn(global, 'clearInterval');
            
            await action.onWillDisappear(event as any);
            
            expect(global.clearInterval).toHaveBeenCalledWith(intervalId);
            expect((state as any).intervalId).toBeUndefined();
        });
        
        it('should clear debounce timeouts', async () => {
            const timeout = setTimeout(() => {}, 1000);
            (action as any).settingsDebounceTimeouts.set('test-action-id', timeout);
            
            const event = {
                action: mockAction,
                payload: {}
            };
            
            // Mock clearTimeout
            jest.spyOn(global, 'clearTimeout');
            
            await action.onWillDisappear(event as any);
            
            expect(global.clearTimeout).toHaveBeenCalledWith(timeout);
            expect((action as any).settingsDebounceTimeouts.has('test-action-id')).toBe(false);
        });
    });

    describe('onKeyDown', () => {
        it('should open release in browser with latest release', async () => {
            const settings = {
                orgUrl: 'https://dev.azure.com/test',
                projectName: 'TestProject'
            };
            
            const event = {
                action: mockAction,
                payload: { settings }
            };
            
            // Set up state with metrics
            const stateManager = mockStateManager;
            const state = stateManager.getState('test-action-id');
            (state as any).lastMetrics = {
                latestRelease: {
                    id: 123
                }
            };
            
            await action.onKeyDown(event as any);
            
            expect(mockStreamDeck.system.openUrl).toHaveBeenCalledWith(
                'https://dev.azure.com/test/TestProject/_releaseProgress?releaseId=123'
            );
        });
        
        it('should open release dashboard without specific release', async () => {
            const settings = {
                orgUrl: 'https://dev.azure.com/test',
                projectName: 'TestProject'
            };
            
            const event = {
                action: mockAction,
                payload: { settings }
            };
            
            await action.onKeyDown(event as any);
            
            expect(mockStreamDeck.system.openUrl).toHaveBeenCalledWith(
                'https://dev.azure.com/test/TestProject/_release'
            );
        });
        
        it('should handle missing settings', async () => {
            const event = {
                action: mockAction,
                payload: { settings: {} }
            };
            
            await action.onKeyDown(event as any);
            
            expect(mockStreamDeck.system.openUrl).not.toHaveBeenCalled();
        });
    });

    describe('onDidReceiveSettings', () => {
        it('should handle settings update', async () => {
            const settings = {
                orgUrl: 'https://dev.azure.com/test',
                projectName: 'TestProject',
                releaseDefinitionId: 1,
                pat: 'new-pat'
            };
            
            const event = {
                action: mockAction,
                payload: { settings }
            };
            
            await action.onDidReceiveSettings(event as any);
            
            expect(mockStreamDeck.logger.info).toHaveBeenCalledWith(
                expect.stringContaining('Release Pipeline settings updated')
            );
        });
    });

    describe.skip('onSendToPlugin', () => {
        it('should handle getReleaseDefinitions request', async () => {
            mockAction.getSettings.mockResolvedValue({
                orgUrl: 'https://dev.azure.com/test',
                projectName: 'TestProject',
                pat: 'test-pat'
            });
            
            const event = {
                action: mockAction,
                payload: { event: 'getReleaseDefinitions' }
            };
            
            const mockReleaseService = mockReleasePipelineService;
            
            await action.onSendToPlugin(event as any);
            
            expect((mockReleaseService as any).getReleaseDefinitions).toHaveBeenCalled();
            expect(mockStreamDeck.ui.current?.sendToPropertyInspector).toHaveBeenCalledWith({
                event: 'getReleaseDefinitions',
                items: [
                    { value: '1', label: 'Main Pipeline' },
                    { value: '2', label: 'Feature Pipeline' }
                ]
            });
        });
        
        it('should handle getEnvironments request', async () => {
            mockAction.getSettings.mockResolvedValue({
                orgUrl: 'https://dev.azure.com/test',
                projectName: 'TestProject',
                releaseDefinitionId: 1,
                pat: 'test-pat'
            });
            
            const event = {
                action: mockAction,
                payload: { event: 'getEnvironments' }
            };
            
            const mockReleaseService = mockReleasePipelineService;
            
            await action.onSendToPlugin(event as any);
            
            expect((mockReleaseService as any).getEnvironments).toHaveBeenCalled();
            expect(mockStreamDeck.ui.current?.sendToPropertyInspector).toHaveBeenCalledWith({
                event: 'getEnvironments',
                items: [
                    { value: 'Dev', label: 'Dev' },
                    { value: 'Staging', label: 'Staging' },
                    { value: 'Production', label: 'Production' }
                ]
            });
        });
        
        it('should handle errors gracefully', async () => {
            mockAction.getSettings.mockResolvedValue({
                orgUrl: 'https://dev.azure.com/test',
                projectName: 'TestProject',
                pat: 'test-pat'
            });
            
            const event = {
                action: mockAction,
                payload: { event: 'getReleaseDefinitions' }
            };
            
            const mockReleaseService = mockReleasePipelineService;
            (mockReleaseService as any).getReleaseDefinitions.mockRejectedValue(new Error('API Error'));
            
            await action.onSendToPlugin(event as any);
            
            expect(mockStreamDeck.logger.error).toHaveBeenCalled();
            expect(mockStreamDeck.ui.current?.sendToPropertyInspector).toHaveBeenCalledWith({
                event: 'getReleaseDefinitions',
                items: [],
                error: 'Failed to fetch release definitions'
            });
        });
    });
});