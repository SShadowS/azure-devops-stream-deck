import { BuildQueueService } from '../build-queue-service';
import { AzureDevOpsClient } from '../azure-devops-client';

// Mock the AzureDevOpsClient
jest.mock('../azure-devops-client');

describe('BuildQueueService', () => {
    let service: BuildQueueService;
    let mockLogger: any;
    let mockClient: jest.Mocked<AzureDevOpsClient>;

    beforeEach(() => {
        jest.clearAllMocks();
        
        mockLogger = {
            debug: jest.fn(),
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
            trace: jest.fn(),
            createScope: jest.fn(() => mockLogger)
        };

        // Mock AzureDevOpsClient
        mockClient = {
            connect: jest.fn().mockResolvedValue(undefined),
            getBuildApi: jest.fn().mockReturnValue({
                getBuilds: jest.fn().mockResolvedValue([
                    { id: 1, status: 'notStarted', definition: { name: 'Build 1' }, requestedFor: { displayName: 'User 1' }, queueTime: new Date() },
                    { id: 2, status: 'inProgress', definition: { name: 'Build 2' }, requestedFor: { displayName: 'User 2' }, queueTime: new Date() }
                ]),
                queueBuild: jest.fn().mockResolvedValue({
                    id: 123,
                    buildNumber: '20240101.1',
                    status: 'notStarted',
                    _links: { web: { href: 'https://dev.azure.com/test/project/_build/results?buildId=123' } }
                }),
                updateBuild: jest.fn().mockResolvedValue({ id: 123, status: 'cancelling' }),
                getDefinition: jest.fn().mockResolvedValue({
                    id: 1,
                    name: 'CI Pipeline',
                    project: { id: '1' },
                    repository: { defaultBranch: 'refs/heads/main' }
                }),
                getDefinitions: jest.fn().mockResolvedValue([
                    { id: 1, name: 'CI Pipeline' },
                    { id: 2, name: 'Release Pipeline' }
                ])
            }),
            getCoreApi: jest.fn().mockReturnValue({
                getProjects: jest.fn().mockResolvedValue([{ id: '1', name: 'TestProject' }])
            }),
            getTaskAgentApi: jest.fn().mockReturnValue({
                getAgentPools: jest.fn().mockResolvedValue([
                    { id: 1, name: 'Default', size: 5 },
                    { id: 2, name: 'Hosted Ubuntu', size: 10 }
                ]),
                getAgents: jest.fn().mockResolvedValue([
                    { id: 1, name: 'Agent-1', status: 'online', enabled: true },
                    { id: 2, name: 'Agent-2', status: 'online', enabled: true },
                    { id: 3, name: 'Agent-3', status: 'offline', enabled: true }
                ]),
                getAgentJobRequests: jest.fn().mockResolvedValue([
                    { requestId: 1, planType: 'Build', result: 'succeeded', queueTime: new Date() },
                    { requestId: 2, planType: 'Build', result: 'failed', queueTime: new Date() }
                ])
            })
        } as any;

        (AzureDevOpsClient as jest.Mock).mockImplementation(() => mockClient);
        
        // Mock the connection property that ensureConnection uses
        // Create mock APIs directly instead of calling non-existent methods
        const mockBuildApi = {
            getBuilds: jest.fn().mockResolvedValue([
                { id: 1, status: 'notStarted', definition: { name: 'Build 1' }, requestedFor: { displayName: 'User 1' }, queueTime: new Date() },
                { id: 2, status: 'inProgress', definition: { name: 'Build 2' }, requestedFor: { displayName: 'User 2' }, queueTime: new Date() }
            ]),
            queueBuild: jest.fn().mockResolvedValue({
                id: 123,
                buildNumber: '20240101.1',
                status: 'notStarted',
                _links: { web: { href: 'https://dev.azure.com/test/project/_build/results?buildId=123' } }
            }),
            updateBuild: jest.fn().mockResolvedValue({ id: 123, status: 'cancelling' }),
            getDefinition: jest.fn().mockResolvedValue({
                id: 1,
                name: 'CI Pipeline',
                project: { id: '1' },
                repository: { defaultBranch: 'refs/heads/main' }
            }),
            getDefinitions: jest.fn().mockResolvedValue([
                { id: 1, name: 'CI Pipeline' },
                { id: 2, name: 'Release Pipeline' }
            ]),
            getBuild: jest.fn().mockResolvedValue({
                id: 123,
                definition: { id: 1 },
                project: { id: '1' },
                sourceBranch: 'refs/heads/main',
                sourceVersion: 'abc123',
                parameters: '{}'
            })
        };

        const mockTaskAgentApi = {
            getAgentPools: jest.fn().mockResolvedValue([
                { id: 1, name: 'Default', size: 5 },
                { id: 2, name: 'Hosted Ubuntu', size: 10 }
            ]),
            getAgents: jest.fn().mockResolvedValue([
                { id: 1, name: 'Agent-1', status: 1, enabled: true }, // status: 1 = Online
                { id: 2, name: 'Agent-2', status: 1, enabled: true },
                { id: 3, name: 'Agent-3', status: 2, enabled: true }  // status: 2 = Offline
            ]),
            getAgentJobRequests: jest.fn().mockResolvedValue([
                { requestId: 1, planType: 'Build', result: 'succeeded', queueTime: new Date() },
                { requestId: 2, planType: 'Build', result: 'failed', queueTime: new Date() }
            ])
        };
        
        (mockClient as any).connection = {
            getBuildApi: jest.fn().mockResolvedValue(mockBuildApi),
            getTaskAgentApi: jest.fn().mockResolvedValue(mockTaskAgentApi),
            getCoreApi: jest.fn().mockResolvedValue({
                getProjects: jest.fn().mockResolvedValue([{ id: '1', name: 'TestProject' }])
            })
        };

        service = new BuildQueueService(mockLogger);
    });

    describe('getQueueMetrics', () => {
        it('should return queue metrics successfully', async () => {
            const settings = {
                orgUrl: 'https://dev.azure.com/test',
                projectName: 'TestProject',
                pat: 'test-pat',
                buildDefinitionId: 1
            };

            const result = await service.getQueueMetrics(settings);

            expect(result).toBeDefined();
            expect(result.queueLength).toBeGreaterThanOrEqual(0);
            expect(result.runningBuilds).toBeDefined();
            expect(mockClient.connect).toHaveBeenCalled();
        });

        it('should handle connection errors', async () => {
            const settings = {
                orgUrl: 'https://dev.azure.com/test',
                projectName: 'TestProject',
                pat: 'test-pat'
            };

            mockClient.connect.mockRejectedValue(new Error('Connection failed'));

            await expect(service.getQueueMetrics(settings)).rejects.toThrow('Connection failed');
            expect(mockLogger.error).toHaveBeenCalled();
        });

        it('should handle API errors gracefully', async () => {
            const settings = {
                orgUrl: 'https://dev.azure.com/test',
                projectName: 'TestProject',
                pat: 'test-pat'
            };

            // Mock the connection to throw an error on getBuildApi
            const mockConnection = (mockClient as any).connection;
            mockConnection.getBuildApi = jest.fn().mockRejectedValue(new Error('API Error'));

            await expect(service.getQueueMetrics(settings)).rejects.toThrow('API Error');
            expect(mockLogger.error).toHaveBeenCalled();
        });
    });

    describe('queueBuild', () => {
        it('should queue a build successfully', async () => {
            const settings = {
                orgUrl: 'https://dev.azure.com/test',
                projectName: 'TestProject',
                pat: 'test-pat',
                buildDefinitionId: 1,
                branch: 'main'
            };

            const result = await service.queueBuild(settings);

            expect(result).toBeDefined();
            expect(result.id).toBe(123);
            expect(result.buildNumber).toBe('20240101.1');
            
            // Check that the connection's buildApi queueBuild was called
            const mockConnection = (mockClient as any).connection;
            const mockBuildApi = await mockConnection.getBuildApi();
            expect(mockBuildApi.queueBuild).toHaveBeenCalled();
        });

        it('should handle missing build definition', async () => {
            const settings = {
                orgUrl: 'https://dev.azure.com/test',
                projectName: 'TestProject',
                pat: 'test-pat',
                buildDefinitionId: 999 // Non-existent definition ID
            };

            // Mock the connection's buildApi to return null for getDefinition
            const mockConnection = (mockClient as any).connection;
            const mockBuildApi = await mockConnection.getBuildApi();
            mockBuildApi.getDefinition = jest.fn().mockResolvedValue(null);

            await expect(service.queueBuild(settings)).rejects.toThrow('Build definition not found');
            expect(mockLogger.error).toHaveBeenCalled();
        });
    });

    describe('cancelBuild', () => {
        it('should cancel a build successfully', async () => {
            const settings = {
                orgUrl: 'https://dev.azure.com/test',
                projectName: 'TestProject',
                pat: 'test-pat',
                buildDefinitionId: 1
            };

            // cancelBuild returns void, not boolean
            await service.cancelBuild(settings, 123);

            // Check that the connection's buildApi updateBuild was called
            const mockConnection = (mockClient as any).connection;
            const mockBuildApi = await mockConnection.getBuildApi();
            expect(mockBuildApi.updateBuild).toHaveBeenCalled();
        });
    });

    describe('retryBuild', () => {
        it('should retry a build', async () => {
            const settings = {
                orgUrl: 'https://dev.azure.com/test',
                projectName: 'TestProject',
                pat: 'test-pat',
                buildDefinitionId: 1
            };

            const buildId = 123;
            
            // Mock getBuild to return the original build on the connection's buildApi
            const mockConnection = (mockClient as any).connection;
            const mockBuildApi = await mockConnection.getBuildApi();
            mockBuildApi.getBuild = jest.fn().mockResolvedValue({
                id: 123,
                definition: { id: 1 },
                project: { id: '1' },
                sourceBranch: 'refs/heads/main',
                sourceVersion: 'abc123',
                parameters: '{}'
            });

            const result = await service.retryBuild(settings, buildId);

            expect(result).toBeDefined();
            expect(result.id).toBe(123);
            expect(mockBuildApi.getBuild).toHaveBeenCalledWith(settings.projectName, buildId);
            expect(mockBuildApi.queueBuild).toHaveBeenCalled();
        });
    });

    // Removed tests for getAgentPools and getBuildDefinitions - these methods don't exist in the service
});