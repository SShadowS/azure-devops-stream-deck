import { ReleasePipelineService } from '../release-pipeline-service';
import { AzureDevOpsClient } from '../azure-devops-client';

// Mock the AzureDevOpsClient
jest.mock('../azure-devops-client');

describe('ReleasePipelineService', () => {
    let service: ReleasePipelineService;
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
            getReleaseApi: jest.fn().mockReturnValue({
                getReleases: jest.fn().mockResolvedValue([
                    {
                        id: 1,
                        name: 'Release-1.0.0',
                        status: 'active',
                        environments: [
                            { id: 1, name: 'Dev', status: 'succeeded', deploySteps: [] },
                            { id: 2, name: 'Staging', status: 'inProgress', deploySteps: [] },
                            { id: 3, name: 'Production', status: 'notStarted', deploySteps: [] }
                        ],
                        createdOn: new Date('2024-01-01'),
                        modifiedOn: new Date('2024-01-02')
                    },
                    {
                        id: 2,
                        name: 'Release-0.9.0',
                        status: 'active',
                        environments: [
                            { id: 1, name: 'Dev', status: 'succeeded', deploySteps: [] },
                            { id: 2, name: 'Staging', status: 'succeeded', deploySteps: [] },
                            { id: 3, name: 'Production', status: 'succeeded', deploySteps: [] }
                        ],
                        createdOn: new Date('2023-12-01'),
                        modifiedOn: new Date('2023-12-02')
                    }
                ]),
                getReleaseDefinitions: jest.fn().mockResolvedValue([
                    { id: 1, name: 'Main Pipeline', environments: [] },
                    { id: 2, name: 'Feature Pipeline', environments: [] }
                ]),
                getReleaseDefinition: jest.fn().mockResolvedValue({
                    id: 1,
                    name: 'Main Pipeline',
                    environments: [
                        { id: 1, name: 'Dev' },
                        { id: 2, name: 'Staging' },
                        { id: 3, name: 'Production' }
                    ]
                }),
                getApprovals: jest.fn().mockResolvedValue([
                    { id: 1, status: 'pending', approver: { displayName: 'User 1' } },
                    { id: 2, status: 'pending', approver: { displayName: 'User 2' } }
                ]),
                createRelease: jest.fn().mockResolvedValue({
                    id: 3,
                    name: 'Release-1.1.0',
                    status: 'draft'
                }),
                updateReleaseEnvironment: jest.fn().mockResolvedValue({
                    id: 1,
                    status: 'inProgress'
                })
            }),
            getCoreApi: jest.fn().mockReturnValue({
                getProjects: jest.fn().mockResolvedValue([{ id: '1', name: 'TestProject' }])
            })
        } as any;

        (AzureDevOpsClient as jest.Mock).mockImplementation(() => mockClient);
        
        // Mock the connection property that ensureConnection uses  
        // Create mock API directly instead of calling non-existent method
        const mockReleaseApi = {
            getReleases: jest.fn().mockResolvedValue([
                {
                    id: 1,
                    name: 'Release-1.0.0',
                    status: 'active',
                    environments: [
                        { id: 1, name: 'Dev', status: 'succeeded', deploySteps: [] },
                        { id: 2, name: 'Staging', status: 'inProgress', deploySteps: [] },
                        { id: 3, name: 'Production', status: 'notStarted', deploySteps: [] }
                    ],
                    createdOn: new Date('2024-01-01'),
                    modifiedOn: new Date('2024-01-02')
                },
                {
                    id: 2,
                    name: 'Release-0.9.0',
                    status: 'active',
                    environments: [
                        { id: 1, name: 'Dev', status: 'succeeded', deploySteps: [] },
                        { id: 2, name: 'Staging', status: 'succeeded', deploySteps: [] },
                        { id: 3, name: 'Production', status: 'succeeded', deploySteps: [] }
                    ],
                    createdOn: new Date('2023-12-01'),
                    modifiedOn: new Date('2023-12-02')
                }
            ]),
            getReleaseDefinitions: jest.fn().mockResolvedValue([
                { id: 1, name: 'Main Pipeline', environments: [] },
                { id: 2, name: 'Feature Pipeline', environments: [] }
            ]),
            getReleaseDefinition: jest.fn().mockResolvedValue({
                id: 1,
                name: 'Main Pipeline',
                environments: [
                    { id: 1, name: 'Dev' },
                    { id: 2, name: 'Staging' },
                    { id: 3, name: 'Production' }
                ]
            }),
            getRelease: jest.fn().mockResolvedValue({
                id: 1,
                name: 'Release-1.0.0',
                status: 'active',
                environments: [
                    { id: 1, name: 'Dev', status: 'succeeded', deploySteps: [] },
                    { id: 2, name: 'Staging', status: 'inProgress', deploySteps: [] },
                    { id: 3, name: 'Production', status: 'notStarted', deploySteps: [] }
                ],
                createdOn: new Date('2024-01-01'),
                modifiedOn: new Date('2024-01-02'),
                releaseDefinition: { name: 'Main Pipeline' },
                createdBy: { displayName: 'Test User' },
                reason: 'Manual'
            }),
            getApprovals: jest.fn().mockResolvedValue([
                { id: 1, status: 'pending', approver: { displayName: 'User 1' } },
                { id: 2, status: 'pending', approver: { displayName: 'User 2' } }
            ]),
            createRelease: jest.fn().mockResolvedValue({
                id: 3,
                name: 'Release-1.1.0',
                status: 'draft'
            }),
            updateReleaseEnvironment: jest.fn().mockResolvedValue({
                id: 1,
                status: 'inProgress'
            })
        };
        
        (mockClient as any).connection = {
            getReleaseApi: jest.fn().mockResolvedValue(mockReleaseApi)
        };

        service = new ReleasePipelineService(mockLogger);
    });

    describe('getReleaseMetrics', () => {
        it('should return release metrics successfully', async () => {
            const settings = {
                orgUrl: 'https://dev.azure.com/test',
                projectName: 'TestProject',
                pat: 'test-pat',
                releaseDefinitionId: 1
            };

            const result = await service.getReleaseMetrics(settings);

            expect(result).toBeDefined();
            expect(result.latestRelease).toBeDefined();
            expect(result.latestRelease?.name).toBe('Release-1.0.0');
            expect(result.environments).toBeDefined();
            expect(result.overallStatus).toBeDefined();
            expect(mockClient.connect).toHaveBeenCalled();
        });

        it('should handle connection errors', async () => {
            const settings = {
                orgUrl: 'https://dev.azure.com/test',
                projectName: 'TestProject',
                pat: 'test-pat'
            };

            mockClient.connect.mockRejectedValue(new Error('Connection failed'));

            await expect(service.getReleaseMetrics(settings)).rejects.toThrow('Connection failed');
            expect(mockLogger.error).toHaveBeenCalled();
        });

        it('should handle empty releases', async () => {
            const settings = {
                orgUrl: 'https://dev.azure.com/test',
                projectName: 'TestProject',
                pat: 'test-pat',
                releaseDefinitionId: 1
            };

            // Mock the connection to return a releaseApi with empty releases
            const mockConnection = (mockClient as any).connection;
            mockConnection.getReleaseApi = jest.fn().mockResolvedValue({
                getReleaseDefinition: jest.fn().mockResolvedValue({
                    id: 1,
                    name: 'Main Pipeline'
                }),
                getReleases: jest.fn().mockResolvedValue([])
            });

            const result = await service.getReleaseMetrics(settings);

            expect(result.latestRelease).toBeNull();
            expect(result.environments).toBeDefined();
            expect(result.overallStatus).toBe('notdeployed');
        });
    });

    // Removed tests for non-existent methods (getReleaseDefinitions, getEnvironments, createRelease, deployToEnvironment, getPendingApprovals)
});