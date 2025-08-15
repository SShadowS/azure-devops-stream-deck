import { PRService } from '../pr-service';
import * as azdev from 'azure-devops-node-api';
import { GitPullRequest, PullRequestStatus } from 'azure-devops-node-api/interfaces/GitInterfaces';

// Mock azure-devops-node-api
jest.mock('azure-devops-node-api');

describe('PRService', () => {
    let service: PRService;
    let mockGitApi: any;
    let mockConnection: any;

    beforeEach(() => {
        jest.clearAllMocks();

        // Mock Git API
        mockGitApi = {
            getRepositories: jest.fn(),
            getPullRequests: jest.fn()
        };

        // Mock connection
        mockConnection = {
            getGitApi: jest.fn().mockResolvedValue(mockGitApi),
            getCoreApi: jest.fn()
        };

        // Mock WebApi constructor
        (azdev.WebApi as unknown as jest.Mock).mockImplementation(() => mockConnection);
        (azdev.getPersonalAccessTokenHandler as jest.Mock).mockReturnValue({});

        service = new PRService('https://dev.azure.com/test', 'test-token');
    });

    describe('getRepositories', () => {
        it('should return list of repositories', async () => {
            const mockRepos = [
                { id: 'repo1', name: 'Repository 1', isDisabled: false },
                { id: 'repo2', name: 'Repository 2', isDisabled: false },
                { id: 'repo3', name: 'Disabled Repo', isDisabled: true }
            ];

            mockGitApi.getRepositories.mockResolvedValue(mockRepos);

            const result = await service.getRepositories('TestProject');

            expect(mockGitApi.getRepositories).toHaveBeenCalledWith('TestProject');
            expect(result).toEqual([
                { id: 'repo1', name: 'Repository 1' },
                { id: 'repo2', name: 'Repository 2' }
            ]);
            expect(result).not.toContainEqual(
                expect.objectContaining({ name: 'Disabled Repo' })
            );
        });

        it('should cache repository results', async () => {
            const mockRepos = [
                { id: 'repo1', name: 'Repository 1', isDisabled: false }
            ];

            mockGitApi.getRepositories.mockResolvedValue(mockRepos);

            // First call
            await service.getRepositories('TestProject');
            // Second call (should use cache)
            await service.getRepositories('TestProject');

            expect(mockGitApi.getRepositories).toHaveBeenCalledTimes(1);
        });

        it('should handle API errors gracefully', async () => {
            mockGitApi.getRepositories.mockRejectedValue(new Error('API Error'));

            await expect(service.getRepositories('TestProject'))
                .rejects.toThrow('Failed to get repositories: API Error');
        });
    });

    describe('getPullRequests', () => {
        it('should return pull requests for specific repository', async () => {
            const mockPRs: Partial<GitPullRequest>[] = [
                {
                    pullRequestId: 1,
                    title: 'Test PR 1',
                    createdBy: { displayName: 'Author 1' },
                    targetRefName: 'refs/heads/main',
                    sourceRefName: 'refs/heads/feature1',
                    status: PullRequestStatus.Active,
                    creationDate: new Date('2024-01-01'),
                    reviewers: [],
                    mergeStatus: 0,
                    isDraft: false,
                    repository: { name: 'Repo1' }
                }
            ];

            mockGitApi.getPullRequests.mockResolvedValue(mockPRs);

            const result = await service.getPullRequests('TestProject', 'repo1');

            expect(mockGitApi.getPullRequests).toHaveBeenCalledWith(
                'repo1',
                expect.objectContaining({
                    status: PullRequestStatus.Active
                }),
                'TestProject'
            );

            expect(result).toHaveLength(1);
            expect(result[0]).toMatchObject({
                id: 1,
                title: 'Test PR 1',
                author: 'Author 1',
                targetBranch: 'main',
                sourceBranch: 'feature1',
                status: 'active'
            });
        });

        it('should return pull requests from all repositories', async () => {
            const mockRepos = [
                { id: 'repo1', name: 'Repository 1', isDisabled: false },
                { id: 'repo2', name: 'Repository 2', isDisabled: false }
            ];

            const mockPRs1: Partial<GitPullRequest>[] = [
                {
                    pullRequestId: 1,
                    title: 'PR from Repo 1',
                    status: PullRequestStatus.Active,
                    repository: { name: 'Repo1' }
                }
            ];

            const mockPRs2: Partial<GitPullRequest>[] = [
                {
                    pullRequestId: 2,
                    title: 'PR from Repo 2',
                    status: PullRequestStatus.Active,
                    repository: { name: 'Repo2' }
                }
            ];

            mockGitApi.getRepositories.mockResolvedValue(mockRepos);
            mockGitApi.getPullRequests
                .mockResolvedValueOnce(mockPRs1)
                .mockResolvedValueOnce(mockPRs2);

            const result = await service.getPullRequests('TestProject');

            expect(result).toHaveLength(2);
            expect(result.map(pr => pr.title)).toContain('PR from Repo 1');
            expect(result.map(pr => pr.title)).toContain('PR from Repo 2');
        });

        it('should filter PRs by target branch', async () => {
            const mockPRs: Partial<GitPullRequest>[] = [
                {
                    pullRequestId: 1,
                    title: 'Test PR',
                    targetRefName: 'refs/heads/main',
                    status: PullRequestStatus.Active
                }
            ];

            mockGitApi.getPullRequests.mockResolvedValue(mockPRs);

            await service.getPullRequests('TestProject', 'repo1', {
                targetBranch: 'main'
            });

            expect(mockGitApi.getPullRequests).toHaveBeenCalledWith(
                'repo1',
                expect.objectContaining({
                    targetRefName: 'refs/heads/main'
                }),
                'TestProject'
            );
        });

        it('should handle merge conflicts correctly', async () => {
            const mockPRs: Partial<GitPullRequest>[] = [
                {
                    pullRequestId: 1,
                    title: 'PR with conflicts',
                    mergeStatus: 2, // Conflicts
                    status: PullRequestStatus.Active
                },
                {
                    pullRequestId: 2,
                    title: 'PR without conflicts',
                    mergeStatus: 0,
                    status: PullRequestStatus.Active
                }
            ];

            mockGitApi.getPullRequests.mockResolvedValue(mockPRs);

            const result = await service.getPullRequests('TestProject', 'repo1', {
                onlyConflicts: true
            });

            expect(result).toHaveLength(1);
            expect(result[0].hasConflicts).toBe(true);
            expect(result[0].title).toBe('PR with conflicts');
        });

        it('should map PR status correctly', async () => {
            const mockPRs: Partial<GitPullRequest>[] = [
                {
                    pullRequestId: 1,
                    status: PullRequestStatus.Active
                },
                {
                    pullRequestId: 2,
                    status: PullRequestStatus.Completed
                },
                {
                    pullRequestId: 3,
                    status: PullRequestStatus.Abandoned
                }
            ];

            mockGitApi.getPullRequests.mockResolvedValue(mockPRs);

            const result = await service.getPullRequests('TestProject', 'repo1');

            expect(result[0].status).toBe('active');
            expect(result[1].status).toBe('completed');
            expect(result[2].status).toBe('abandoned');
        });

        it('should cache PR results', async () => {
            const mockPRs: Partial<GitPullRequest>[] = [
                { pullRequestId: 1, status: PullRequestStatus.Active }
            ];

            mockGitApi.getPullRequests.mockResolvedValue(mockPRs);

            // First call
            await service.getPullRequests('TestProject', 'repo1');
            // Second call (should use cache)
            await service.getPullRequests('TestProject', 'repo1');

            expect(mockGitApi.getPullRequests).toHaveBeenCalledTimes(1);
        });
    });

    describe('hasValidCredentials', () => {
        it('should return true for matching organization URL', () => {
            const result = service.hasValidCredentials(
                'https://dev.azure.com/test',
                'any-token'
            );
            expect(result).toBe(true);
        });

        it('should return false for different organization URL', () => {
            const result = service.hasValidCredentials(
                'https://dev.azure.com/different',
                'any-token'
            );
            expect(result).toBe(false);
        });
    });
});