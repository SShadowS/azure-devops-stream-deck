import { RepositoryStatsService } from '../repository-stats-service';
import { AzureDevOpsClient } from '../azure-devops-client';

// Mock the AzureDevOpsClient
jest.mock('../azure-devops-client');

describe('RepositoryStatsService', () => {
    let service: RepositoryStatsService;
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
            getGitApi: jest.fn().mockReturnValue({
                getRepositories: jest.fn().mockResolvedValue([
                    { id: '1', name: 'Repo1', size: 1024000, defaultBranch: 'refs/heads/main' },
                    { id: '2', name: 'Repo2', size: 512000, defaultBranch: 'refs/heads/master' }
                ]),
                getCommits: jest.fn().mockResolvedValue([
                    { commitId: '1', author: { name: 'User 1', date: new Date() }, comment: 'Initial commit' },
                    { commitId: '2', author: { name: 'User 2', date: new Date() }, comment: 'Feature added' },
                    { commitId: '3', author: { name: 'User 1', date: new Date() }, comment: 'Bug fix' }
                ]),
                getPullRequests: jest.fn().mockResolvedValue([
                    { pullRequestId: 1, status: 'active', createdBy: { displayName: 'User 1' }, creationDate: new Date() },
                    { pullRequestId: 2, status: 'completed', createdBy: { displayName: 'User 2' }, creationDate: new Date(), closedDate: new Date() },
                    { pullRequestId: 3, status: 'active', createdBy: { displayName: 'User 3' }, creationDate: new Date() }
                ]),
                getBranches: jest.fn().mockResolvedValue([
                    { name: 'refs/heads/main', isBaseVersion: true },
                    { name: 'refs/heads/develop', isBaseVersion: false },
                    { name: 'refs/heads/feature/new-feature', isBaseVersion: false }
                ]),
                getRepository: jest.fn().mockResolvedValue({
                    id: '1',
                    name: 'Repo1',
                    defaultBranch: 'refs/heads/main'
                }),
                getPushes: jest.fn().mockResolvedValue([
                    { pushId: 1, date: new Date(), pushedBy: { displayName: 'User 1' } },
                    { pushId: 2, date: new Date(), pushedBy: { displayName: 'User 2' } }
                ])
            }),
            getCoreApi: jest.fn().mockReturnValue({
                getProjects: jest.fn().mockResolvedValue([{ id: '1', name: 'TestProject' }])
            })
        } as any;

        (AzureDevOpsClient as jest.Mock).mockImplementation(() => mockClient);
        
        // Mock the connection property that ensureConnection uses
        (mockClient as any).connection = {
            getGitApi: jest.fn().mockResolvedValue(mockClient.getGitApi())
        };

        service = new RepositoryStatsService(mockLogger);
    });

    describe('getRepositoryMetrics', () => {
        it('should return repository metrics successfully', async () => {
            const settings = {
                orgUrl: 'https://dev.azure.com/test',
                projectName: 'TestProject',
                repositoryName: 'Repo1',
                pat: 'test-pat'
            };

            const result = await service.getRepositoryMetrics(settings);

            expect(result).toBeDefined();
            expect(result.commits).toBeDefined();
            expect(result.pullRequests).toBeDefined();
            expect(result.contributors).toBeDefined();
            expect(mockClient.connect).toHaveBeenCalled();
            expect(mockClient.getGitApi().getCommits).toHaveBeenCalled();
        });

        it('should handle connection errors', async () => {
            const settings = {
                orgUrl: 'https://dev.azure.com/test',
                projectName: 'TestProject',
                repositoryName: 'Repo1',
                pat: 'test-pat'
            };

            mockClient.connect.mockRejectedValue(new Error('Connection failed'));

            await expect(service.getRepositoryMetrics(settings)).rejects.toThrow('Connection failed');
            expect(mockLogger.error).toHaveBeenCalled();
        });

        it('should handle empty commits', async () => {
            const settings = {
                orgUrl: 'https://dev.azure.com/test',
                projectName: 'TestProject',
                repositoryName: 'Repo1',
                pat: 'test-pat'
            };

            (mockClient.getGitApi().getCommits as jest.Mock).mockResolvedValue([]);
            (mockClient.getGitApi().getPullRequests as jest.Mock).mockResolvedValue([]);

            const result = await service.getRepositoryMetrics(settings);

            expect(result.commits.totalCount).toBe(0);
            expect(result.contributors.activeContributors).toBe(0);
            expect(result.pullRequests.openCount).toBe(0);
        });
    });

    // Removed tests for getRepositories - method doesn't exist as public

    // Removed getBranches tests - method doesn't exist

    // Removed tests for getContributors - this is a private method

    // Removed tests for getCodeChurn - method doesn't exist

    // Removed tests for getPullRequestMetrics - this is a private method
});