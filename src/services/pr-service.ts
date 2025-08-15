import * as azdev from "azure-devops-node-api";
import { IGitApi } from "azure-devops-node-api/GitApi";
import { GitPullRequest, GitRepository, PullRequestStatus } from "azure-devops-node-api/interfaces/GitInterfaces";
import streamDeck from "@elgato/streamdeck";

/**
 * Pull Request data structure
 */
export interface PullRequest {
    id: number;
    title: string;
    author: string;
    targetBranch: string;
    sourceBranch: string;
    status: 'active' | 'completed' | 'abandoned';
    createdDate: Date;
    url: string;
    reviewers: Array<{
        displayName: string;
        vote: number; // -10 rejected, -5 waiting, 0 no vote, 5 approved with suggestions, 10 approved
        isRequired: boolean;
    }>;
    hasConflicts: boolean;
    isDraft: boolean;
    repository: string;
}

/**
 * Filter options for pull requests
 */
export interface PRFilterOptions {
    targetBranch?: string;
    onlyMyPRs?: boolean;
    onlyReviewing?: boolean;
    onlyConflicts?: boolean;
}

/**
 * Service for interacting with Azure DevOps Pull Requests
 */
export class PRService {
    private connection: azdev.WebApi;
    private gitApi: IGitApi | null = null;
    private organizationUrl: string;
    private currentUserEmail: string | null = null;
    private cache = new Map<string, { data: any; timestamp: number }>();
    private readonly CACHE_TTL = 30000; // 30 seconds

    constructor(organizationUrl: string, personalAccessToken: string) {
        this.organizationUrl = organizationUrl;
        const authHandler = azdev.getPersonalAccessTokenHandler(personalAccessToken);
        this.connection = new azdev.WebApi(organizationUrl, authHandler);
    }

    /**
     * Check if service has valid credentials
     */
    hasValidCredentials(organizationUrl: string, personalAccessToken: string): boolean {
        // Simple check - in reality, credentials would need to be compared properly
        return this.organizationUrl === organizationUrl;
    }

    /**
     * Get all repositories in a project
     */
    async getRepositories(projectName: string): Promise<Array<{ id: string; name: string }>> {
        const cacheKey = `repos-${projectName}`;
        const cached = this.getFromCache<Array<{ id: string; name: string }>>(cacheKey);
        if (cached) return cached;

        try {
            if (!this.gitApi) {
                this.gitApi = await this.connection.getGitApi();
            }

            const repos = await this.gitApi.getRepositories(projectName);
            const result = repos
                .filter((repo: GitRepository) => !repo.isDisabled)
                .map((repo: GitRepository) => ({
                    id: repo.id || '',
                    name: repo.name || ''
                }))
                .sort((a, b) => a.name.localeCompare(b.name));

            this.setCache(cacheKey, result);
            return result;

        } catch (error) {
            streamDeck.logger.error("Failed to get repositories", error);
            throw new Error(`Failed to get repositories: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Get pull requests with filters
     */
    async getPullRequests(
        projectName: string,
        repositoryId?: string,
        filters?: PRFilterOptions
    ): Promise<PullRequest[]> {
        const cacheKey = `prs-${projectName}-${repositoryId || 'all'}-${JSON.stringify(filters || {})}`;
        const cached = this.getFromCache<PullRequest[]>(cacheKey);
        if (cached) return cached;

        try {
            if (!this.gitApi) {
                this.gitApi = await this.connection.getGitApi();
            }

            // Get current user info if needed for filtering
            if ((filters?.onlyMyPRs || filters?.onlyReviewing) && !this.currentUserEmail) {
                await this.getCurrentUser();
            }

            let allPRs: GitPullRequest[] = [];

            if (repositoryId && repositoryId !== "all") {
                // Get PRs from specific repository
                const searchCriteria = {
                    status: PullRequestStatus.Active,
                    targetRefName: filters?.targetBranch ? `refs/heads/${filters.targetBranch}` : undefined
                };
                const prs = await this.gitApi.getPullRequests(repositoryId, searchCriteria, projectName);
                allPRs = prs || [];
            } else {
                // Get PRs from all repositories
                const repos = await this.getRepositories(projectName);
                const prPromises = repos.map(repo => 
                    this.gitApi!.getPullRequests(
                        repo.id,
                        {
                            status: PullRequestStatus.Active,
                            targetRefName: filters?.targetBranch ? `refs/heads/${filters.targetBranch}` : undefined
                        },
                        projectName
                    ).catch(() => []) // Ignore errors for individual repos
                );
                const results = await Promise.all(prPromises);
                allPRs = results.flat();
            }

            // Transform and filter PRs
            let prs = await this.transformPullRequests(allPRs);

            // Apply additional filters
            if (filters) {
                prs = this.applyFilters(prs, filters);
            }

            // Sort by creation date (newest first)
            prs.sort((a, b) => b.createdDate.getTime() - a.createdDate.getTime());

            this.setCache(cacheKey, prs);
            return prs;

        } catch (error) {
            streamDeck.logger.error("Failed to get pull requests", error);
            throw new Error(`Failed to get pull requests: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Transform Azure DevOps PR to our PR interface
     */
    private async transformPullRequests(gitPRs: GitPullRequest[]): Promise<PullRequest[]> {
        return gitPRs.map(pr => ({
            id: pr.pullRequestId || 0,
            title: pr.title || 'Untitled',
            author: pr.createdBy?.displayName || 'Unknown',
            targetBranch: pr.targetRefName?.replace('refs/heads/', '') || 'unknown',
            sourceBranch: pr.sourceRefName?.replace('refs/heads/', '') || 'unknown',
            status: this.mapPRStatus(pr.status),
            createdDate: pr.creationDate ? new Date(pr.creationDate) : new Date(),
            url: pr.url || '',
            reviewers: (pr.reviewers || []).map(reviewer => ({
                displayName: reviewer.displayName || 'Unknown',
                vote: reviewer.vote || 0,
                isRequired: reviewer.isRequired || false
            })),
            hasConflicts: pr.mergeStatus === 2, // 2 = conflicts
            isDraft: pr.isDraft || false,
            repository: pr.repository?.name || 'Unknown'
        }));
    }

    /**
     * Map Azure DevOps PR status to our simplified status
     */
    private mapPRStatus(status?: PullRequestStatus): 'active' | 'completed' | 'abandoned' {
        switch (status) {
            case PullRequestStatus.Completed:
                return 'completed';
            case PullRequestStatus.Abandoned:
                return 'abandoned';
            default:
                return 'active';
        }
    }

    /**
     * Apply filters to PR list
     */
    private applyFilters(prs: PullRequest[], filters: PRFilterOptions): PullRequest[] {
        let filtered = [...prs];

        if (filters.onlyMyPRs && this.currentUserEmail) {
            filtered = filtered.filter(pr => 
                pr.author.toLowerCase().includes(this.currentUserEmail!.toLowerCase())
            );
        }

        if (filters.onlyReviewing && this.currentUserEmail) {
            filtered = filtered.filter(pr => 
                pr.reviewers.some(r => 
                    r.displayName.toLowerCase().includes(this.currentUserEmail!.toLowerCase())
                )
            );
        }

        if (filters.onlyConflicts) {
            filtered = filtered.filter(pr => pr.hasConflicts);
        }

        return filtered;
    }

    /**
     * Get current user information
     */
    private async getCurrentUser(): Promise<void> {
        try {
            const coreApi = await this.connection.getCoreApi();
            const profile = await coreApi.getTeamMembersWithExtendedProperties(
                this.organizationUrl.split('/').pop() || '',
                'me'
            );
            if (profile && profile.length > 0) {
                this.currentUserEmail = profile[0].identity?.uniqueName || null;
            }
        } catch (error) {
            streamDeck.logger.warn("Could not get current user info", error);
        }
    }

    /**
     * Get from cache if valid
     */
    private getFromCache<T>(key: string): T | null {
        const cached = this.cache.get(key);
        if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
            return cached.data;
        }
        return null;
    }

    /**
     * Set cache value
     */
    private setCache(key: string, data: any): void {
        this.cache.set(key, {
            data,
            timestamp: Date.now()
        });

        // Clean old cache entries
        if (this.cache.size > 100) {
            const oldestKey = this.cache.keys().next().value;
            if (oldestKey) {
                this.cache.delete(oldestKey);
            }
        }
    }
}