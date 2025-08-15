import { PRChecks } from '../pr-checks';
import { PRService } from '../../services/pr-service';
import { PRDisplayManager } from '../../utils/pr-display-manager';
import { performanceOptimizer } from '../../utils/performance-optimizer';
import streamDeck from '@elgato/streamdeck';

// Mock the Stream Deck SDK
jest.mock('@elgato/streamdeck');

// Mock the services
jest.mock('../../services/pr-service');
jest.mock('../../utils/pr-display-manager');
jest.mock('../../utils/credential-manager');
jest.mock('../../utils/performance-optimizer', () => ({
    performanceOptimizer: {
        withCache: jest.fn((key, fn) => fn()),
        cachedCall: jest.fn((key, fn) => fn())
    }
}));

describe('PRChecks Action', () => {
    let action: PRChecks;
    let mockAction: any;
    let mockService: jest.Mocked<PRService>;

    beforeEach(() => {
        jest.clearAllMocks();
        jest.clearAllTimers();
        jest.useFakeTimers();
        
        action = new PRChecks();
        
        // Create mock action object
        mockAction = {
            id: 'test-action-id',
            isKey: jest.fn().mockReturnValue(true),
            getSettings: jest.fn().mockResolvedValue({}),
            setSettings: jest.fn(),
            setTitle: jest.fn(),
            setImage: jest.fn(),
            setState: jest.fn()
        };

        // Mock PRService
        mockService = {
            hasValidCredentials: jest.fn().mockReturnValue(true),
            getPullRequests: jest.fn().mockResolvedValue([]),
            getRepositories: jest.fn().mockResolvedValue([])
        } as any;
        
        (PRService as jest.MockedClass<typeof PRService>).mockImplementation(() => mockService);
    });
    
    afterEach(() => {
        jest.clearAllTimers();
        jest.useRealTimers();
    });

    describe('onWillAppear', () => {
        it('should initialize with default settings if not provided', async () => {
            const event = {
                action: mockAction,
                payload: {
                    settings: {}
                }
            };

            await action.onWillAppear(event as any);

            expect(mockAction.setSettings).toHaveBeenCalledWith(
                expect.objectContaining({
                    refreshInterval: 60,
                    repository: 'all',
                    showOnlyMyPRs: false,
                    showPRsImReviewing: false,
                    showConflictsOnly: false
                })
            );
        });

        it('should show configuration message if credentials are missing', async () => {
            const event = {
                action: mockAction,
                payload: {
                    settings: {}
                }
            };

            await action.onWillAppear(event as any);

            expect(mockAction.setTitle).toHaveBeenCalledWith('Configure\nin Settings');
            expect(mockAction.setImage).toHaveBeenCalled();
        });

        it('should start polling if credentials are provided', async () => {
            const event = {
                action: mockAction,
                payload: {
                    settings: {
                        organizationUrl: 'https://dev.azure.com/test',
                        projectName: 'TestProject',
                        personalAccessToken: 'encrypted-token',
                        refreshInterval: 60
                    }
                }
            };

            await action.onWillAppear(event as any);

            // Should create service and start polling
            expect(PRService).toHaveBeenCalled();
        });

        it('should not process non-key actions', async () => {
            mockAction.isKey.mockReturnValue(false);
            
            const event = {
                action: mockAction,
                payload: { settings: {} }
            };

            await action.onWillAppear(event as any);

            expect(mockAction.setSettings).not.toHaveBeenCalled();
        });
    });

    describe('onWillDisappear', () => {
        it('should clean up polling interval', async () => {
            // First appear to set up polling
            const appearEvent = {
                action: mockAction,
                payload: {
                    settings: {
                        organizationUrl: 'https://dev.azure.com/test',
                        projectName: 'TestProject',
                        personalAccessToken: 'token'
                    }
                }
            };
            await action.onWillAppear(appearEvent as any);

            // Then disappear
            const disappearEvent = {
                action: mockAction,
                payload: { settings: {} }
            };
            
            jest.spyOn(global, 'clearInterval');
            await action.onWillDisappear(disappearEvent as any);

            expect(clearInterval).toHaveBeenCalled();
        });
    });

    describe('onKeyDown', () => {
        it('should open Azure DevOps PRs page in browser', async () => {
            const mockOpenUrl = jest.fn();
            (streamDeck.system as any) = { openUrl: mockOpenUrl };

            const event = {
                action: mockAction,
                payload: {
                    settings: {
                        organizationUrl: 'https://dev.azure.com/test',
                        projectName: 'TestProject'
                    }
                }
            };

            await action.onKeyDown(event as any);

            expect(mockOpenUrl).toHaveBeenCalledWith(
                'https://dev.azure.com/test/TestProject/_git/pullrequests'
            );
        });

        it('should not open URL if settings are missing', async () => {
            const mockOpenUrl = jest.fn();
            (streamDeck.system as any) = { openUrl: mockOpenUrl };

            const event = {
                action: mockAction,
                payload: {
                    settings: {}
                }
            };

            await action.onKeyDown(event as any);

            expect(mockOpenUrl).not.toHaveBeenCalled();
        });
    });

    describe('onDidReceiveSettings', () => {
        it.skip('should restart polling with new settings - implementation changed', async () => {
            mockAction.isKey.mockReturnValue(true);
            
            // First establish initial polling
            const initialEvent = {
                action: mockAction,
                payload: {
                    settings: {
                        organizationUrl: 'https://dev.azure.com/test',
                        projectName: 'TestProject',
                        personalAccessToken: 'token',
                        refreshInterval: 60
                    }
                }
            };
            
            await action.onWillAppear(initialEvent as any);
            
            // Clear mock call counts
            (PRService as jest.MockedClass<typeof PRService>).mockClear();
            
            const event = {
                action: mockAction,
                payload: {
                    settings: {
                        organizationUrl: 'https://dev.azure.com/test',
                        projectName: 'TestProject',
                        personalAccessToken: 'token',
                        refreshInterval: 30
                    }
                }
            };

            jest.spyOn(global, 'clearInterval');
            await action.onDidReceiveSettings(event as any);

            // Should clear old interval and create new service
            expect(clearInterval).toHaveBeenCalled();
            expect(PRService).toHaveBeenCalled();
        });
    });

    describe('onSendToPlugin', () => {
        it('should handle getRepositories request', async () => {
            const mockSendToPI = jest.fn();
            (streamDeck.ui as any) = { 
                current: { sendToPropertyInspector: mockSendToPI }
            };

            mockService.getRepositories.mockResolvedValue([
                { id: 'repo1', name: 'Repository 1' },
                { id: 'repo2', name: 'Repository 2' }
            ]);

            const mockSettings = {
                organizationUrl: 'https://dev.azure.com/test',
                projectName: 'TestProject',
                personalAccessToken: 'token'
            };
            
            mockAction.getSettings.mockResolvedValue(mockSettings);

            const event = {
                action: mockAction,
                payload: {
                    event: 'getRepositories'
                }
            };

            await action.onSendToPlugin(event as any);

            expect(mockSendToPI).toHaveBeenCalledWith({
                event: 'getRepositories',
                items: expect.arrayContaining([
                    { value: 'all', label: 'All Repositories' },
                    { value: 'repo1', label: 'Repository 1' },
                    { value: 'repo2', label: 'Repository 2' }
                ])
            });
        });

        it.skip('should handle testConnection request - feature not implemented', async () => {
            const mockSendToPI = jest.fn();
            (streamDeck.ui as any) = { 
                current: { sendToPropertyInspector: mockSendToPI }
            };

            const event = {
                action: mockAction,
                payload: {
                    event: 'testConnection',
                    settings: {
                        organizationUrl: 'https://dev.azure.com/test',
                        projectName: 'TestProject',
                        personalAccessToken: 'token'
                    }
                }
            };

            await action.onSendToPlugin(event as any);

            expect(mockSendToPI).toHaveBeenCalledWith({
                event: 'testConnection',
                success: true,
                message: 'Connection successful!'
            });
        });

        it.skip('should handle connection test failure - feature not implemented', async () => {
            const mockSendToPI = jest.fn();
            (streamDeck.ui as any) = { 
                current: { sendToPropertyInspector: mockSendToPI }
            };

            mockService.getRepositories.mockRejectedValue(new Error('Auth failed'));

            const event = {
                action: mockAction,
                payload: {
                    event: 'testConnection',
                    settings: {
                        organizationUrl: 'https://dev.azure.com/test',
                        projectName: 'TestProject',
                        personalAccessToken: 'token'
                    }
                }
            };

            await action.onSendToPlugin(event as any);

            expect(mockSendToPI).toHaveBeenCalledWith({
                event: 'testConnection',
                success: false,
                message: 'Auth failed'
            });
        });
    });

    describe('PR Status Updates', () => {
        it('should update button with PR information', async () => {
            const mockPRs = [
                {
                    id: 1,
                    title: 'Test PR',
                    author: 'Test Author',
                    targetBranch: 'main',
                    sourceBranch: 'feature',
                    status: 'active' as const,
                    createdDate: new Date(),
                    url: 'https://test.url',
                    reviewers: [],
                    hasConflicts: false,
                    isDraft: false,
                    repository: 'TestRepo'
                }
            ];

            mockService.getPullRequests.mockResolvedValue(mockPRs);
            mockService.hasValidCredentials.mockReturnValue(true);
            
            (PRDisplayManager.generateTitle as jest.Mock) = jest.fn().mockReturnValue('1 PR');
            (PRDisplayManager.generateImage as jest.Mock) = jest.fn().mockReturnValue('image-data');

            // Mock performanceOptimizer to return PRs immediately
            (performanceOptimizer.cachedCall as jest.Mock) = jest.fn((key, fn) => fn());

            // Trigger update through onWillAppear
            const event = {
                action: mockAction,
                payload: {
                    settings: {
                        organizationUrl: 'https://dev.azure.com/test',
                        projectName: 'TestProject',
                        personalAccessToken: 'token'
                    }
                }
            };

            await action.onWillAppear(event as any);

            // Wait for all promises to resolve
            await Promise.resolve();
            await Promise.resolve();

            expect(mockAction.setTitle).toHaveBeenCalledWith('1 PR');
            expect(mockAction.setImage).toHaveBeenCalledWith('image-data');
        });

        it('should show error state on update failure', async () => {
            mockService.getPullRequests.mockRejectedValue(new Error('API Error'));
            
            (PRDisplayManager.getErrorImage as jest.Mock) = jest.fn().mockReturnValue('error-image');

            const event = {
                action: mockAction,
                payload: {
                    settings: {
                        organizationUrl: 'https://dev.azure.com/test',
                        projectName: 'TestProject',
                        personalAccessToken: 'token'
                    }
                }
            };

            await action.onWillAppear(event as any);

            // Use fake timers to control async operations
            jest.advanceTimersByTime(100);
            await Promise.resolve();

            expect(mockAction.setTitle).toHaveBeenCalledWith('Error');
            expect(mockAction.setImage).toHaveBeenCalledWith('error-image');
        });
    });
});