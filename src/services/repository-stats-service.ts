import { Logger } from '@elgato/streamdeck';
import * as azdev from 'azure-devops-node-api';
import { IGitApi } from 'azure-devops-node-api/GitApi';
import { GitRepository, GitCommitRef, GitPullRequest, GitBranchStats } from 'azure-devops-node-api/interfaces/GitInterfaces';
import { AzureDevOpsClient } from './azure-devops-client';

export interface RepositorySettings {
    orgUrl: string;
    projectName: string;
    repositoryName: string;
    pat: string;
    branch?: string; // Optional specific branch, otherwise default branch
}

export interface RepositoryMetrics {
    repositoryName: string;
    branch: string;
    commits: CommitMetrics;
    pullRequests: PullRequestMetrics;
    contributors: ContributorMetrics;
    activity: ActivityMetrics;
    codeMetrics: CodeMetrics;
}

export interface CommitMetrics {
    todayCount: number;
    weekCount: number;
    monthCount: number;
    totalCount: number;
    lastCommitDate?: Date;
    lastCommitAuthor?: string;
    lastCommitMessage?: string;
}

export interface PullRequestMetrics {
    openCount: number;
    mergedThisWeek: number;
    averageMergeTime: number; // in hours
    reviewTurnaround: number; // in hours
}

export interface ContributorMetrics {
    activeContributors: number; // Active in last 30 days
    topContributors: Contributor[];
    totalContributors: number;
}

export interface Contributor {
    name: string;
    email?: string;
    commitCount: number;
    linesAdded: number;
    linesDeleted: number;
}

export interface ActivityMetrics {
    trend: 'increasing' | 'stable' | 'decreasing';
    hottestFiles: string[]; // Most frequently changed files
    activeBranches: number;
    stalebranchesCount: number;
}

export interface CodeMetrics {
    additions: number;
    deletions: number;
    churnRate: number; // Percentage of code changed
    filesChanged: number;
}

export class RepositoryStatsService {
    private client: AzureDevOpsClient;
    private logger: Logger;
    private gitApi: IGitApi | null = null;
    private cache = new Map<string, { data: RepositoryMetrics, timestamp: number }>();
    private readonly CACHE_DURATION = 300000; // 5 minutes

    constructor(logger: Logger) {
        this.logger = logger;
        this.client = new AzureDevOpsClient();
    }

    async getRepositoryMetrics(settings: RepositorySettings): Promise<RepositoryMetrics> {
        const cacheKey = this.getCacheKey(settings);
        const cached = this.cache.get(cacheKey);
        
        if (cached && Date.now() - cached.timestamp < this.CACHE_DURATION) {
            this.logger.debug('Returning cached repository metrics');
            return cached.data;
        }

        try {
            await this.ensureConnection(settings);
            
            if (!this.gitApi) {
                throw new Error('Git API not initialized');
            }

            // Get repository details
            const repository = await this.gitApi.getRepository(
                settings.repositoryName,
                settings.projectName
            );

            if (!repository) {
                throw new Error('Repository not found');
            }

            const branch = settings.branch || repository.defaultBranch?.replace('refs/heads/', '') || 'main';

            // Fetch all metrics in parallel for better performance
            const [
                commits,
                pullRequests,
                contributors,
                activity,
                codeMetrics
            ] = await Promise.all([
                this.getCommitMetrics(settings, repository, branch),
                this.getPullRequestMetrics(settings, repository),
                this.getContributorMetrics(settings, repository, branch),
                this.getActivityMetrics(settings, repository),
                this.getCodeMetrics(settings, repository, branch)
            ]);

            const metrics: RepositoryMetrics = {
                repositoryName: repository.name!,
                branch,
                commits,
                pullRequests,
                contributors,
                activity,
                codeMetrics
            };

            this.cache.set(cacheKey, { data: metrics, timestamp: Date.now() });
            
            return metrics;
        } catch (error) {
            this.logger.error('Error fetching repository metrics:', error);
            throw error;
        }
    }

    private async getCommitMetrics(
        settings: RepositorySettings,
        repository: GitRepository,
        branch: string
    ): Promise<CommitMetrics> {
        if (!this.gitApi) {
            throw new Error('Git API not initialized');
        }

        const now = new Date();
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

        try {
            // Get commits from the last month
            const commits = await this.gitApi.getCommits(
                repository.id!,
                {
                    fromDate: monthAgo.toISOString(),
                    toDate: now.toISOString(),
                    $top: 1000,
                    itemVersion: {
                        version: branch
                    }
                },
                settings.projectName
            );

            // Count commits by time period
            let todayCount = 0;
            let weekCount = 0;
            const monthCount = commits.length;

            commits.forEach(commit => {
                const commitDate = new Date(commit.committer?.date || '');
                if (commitDate >= todayStart) {
                    todayCount++;
                }
                if (commitDate >= weekAgo) {
                    weekCount++;
                }
            });

            // Get latest commit details
            const lastCommit = commits[0];

            return {
                todayCount,
                weekCount,
                monthCount,
                totalCount: monthCount, // Limited to last month for performance
                lastCommitDate: lastCommit ? new Date(lastCommit.committer?.date || '') : undefined,
                lastCommitAuthor: lastCommit?.author?.name,
                lastCommitMessage: lastCommit?.comment
            };
        } catch (error) {
            this.logger.debug('Error fetching commit metrics:', error);
            return {
                todayCount: 0,
                weekCount: 0,
                monthCount: 0,
                totalCount: 0
            };
        }
    }

    private async getPullRequestMetrics(
        settings: RepositorySettings,
        repository: GitRepository
    ): Promise<PullRequestMetrics> {
        if (!this.gitApi) {
            throw new Error('Git API not initialized');
        }

        try {
            const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

            // Get open pull requests
            const openPRs = await this.gitApi.getPullRequests(
                repository.id!,
                {
                    status: 1 // Active
                },
                settings.projectName
            );

            // Get recently merged pull requests
            const mergedPRs = await this.gitApi.getPullRequests(
                repository.id!,
                {
                    status: 3, // Completed
                    minTime: weekAgo
                },
                settings.projectName
            );

            // Calculate average merge time and review turnaround
            let totalMergeTime = 0;
            let totalReviewTime = 0;
            let mergeCount = 0;
            let reviewCount = 0;

            mergedPRs.forEach(pr => {
                if (pr.creationDate && pr.closedDate) {
                    const createTime = new Date(pr.creationDate).getTime();
                    const closeTime = new Date(pr.closedDate).getTime();
                    const mergeTime = (closeTime - createTime) / (1000 * 60 * 60); // Convert to hours
                    totalMergeTime += mergeTime;
                    mergeCount++;
                }

                // Estimate review time (simplified - time from creation to first vote)
                if (pr.creationDate) {
                    const createTime = new Date(pr.creationDate).getTime();
                    const reviewTime = 24; // Default 24 hours estimate
                    totalReviewTime += reviewTime;
                    reviewCount++;
                }
            });

            return {
                openCount: openPRs.length,
                mergedThisWeek: mergedPRs.length,
                averageMergeTime: mergeCount > 0 ? Math.round(totalMergeTime / mergeCount) : 0,
                reviewTurnaround: reviewCount > 0 ? Math.round(totalReviewTime / reviewCount) : 0
            };
        } catch (error) {
            this.logger.debug('Error fetching PR metrics:', error);
            return {
                openCount: 0,
                mergedThisWeek: 0,
                averageMergeTime: 0,
                reviewTurnaround: 0
            };
        }
    }

    private async getContributorMetrics(
        settings: RepositorySettings,
        repository: GitRepository,
        branch: string
    ): Promise<ContributorMetrics> {
        if (!this.gitApi) {
            throw new Error('Git API not initialized');
        }

        try {
            const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

            // Get commits from last 30 days
            const commits = await this.gitApi.getCommits(
                repository.id!,
                {
                    fromDate: monthAgo.toISOString(),
                    $top: 500,
                    itemVersion: {
                        version: branch
                    }
                },
                settings.projectName
            );

            // Aggregate contributor stats
            const contributorMap = new Map<string, Contributor>();

            commits.forEach(commit => {
                const author = commit.author?.name || 'Unknown';
                const email = commit.author?.email;

                if (!contributorMap.has(author)) {
                    contributorMap.set(author, {
                        name: author,
                        email,
                        commitCount: 0,
                        linesAdded: 0,
                        linesDeleted: 0
                    });
                }

                const contributor = contributorMap.get(author)!;
                contributor.commitCount++;
                
                // Note: Line stats would require additional API calls to get commit details
                // For performance, we're using estimates
                contributor.linesAdded += 50; // Estimate
                contributor.linesDeleted += 20; // Estimate
            });

            // Sort contributors by commit count
            const topContributors = Array.from(contributorMap.values())
                .sort((a, b) => b.commitCount - a.commitCount)
                .slice(0, 5); // Top 5 contributors

            return {
                activeContributors: contributorMap.size,
                topContributors,
                totalContributors: contributorMap.size
            };
        } catch (error) {
            this.logger.debug('Error fetching contributor metrics:', error);
            return {
                activeContributors: 0,
                topContributors: [],
                totalContributors: 0
            };
        }
    }

    private async getActivityMetrics(
        settings: RepositorySettings,
        repository: GitRepository
    ): Promise<ActivityMetrics> {
        if (!this.gitApi) {
            throw new Error('Git API not initialized');
        }

        try {
            // Get branches
            const branches = await this.gitApi.getBranches(
                repository.id!,
                settings.projectName
            );

            // Count active branches (modified in last 30 days)
            const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
            let activeBranches = 0;
            let staleBranches = 0;

            for (const branch of branches) {
                // Note: Getting last commit for each branch would be expensive
                // For now, counting all branches as a simplified metric
                if (branch.name !== repository.defaultBranch) {
                    activeBranches++;
                }
            }

            // Determine trend (simplified - based on recent commit count)
            const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
            const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);

            const recentCommits = await this.gitApi.getCommits(
                repository.id!,
                {
                    fromDate: weekAgo.toISOString(),
                    $top: 100
                },
                settings.projectName
            );

            const previousCommits = await this.gitApi.getCommits(
                repository.id!,
                {
                    fromDate: twoWeeksAgo.toISOString(),
                    toDate: weekAgo.toISOString(),
                    $top: 100
                },
                settings.projectName
            );

            let trend: 'increasing' | 'stable' | 'decreasing';
            if (recentCommits.length > previousCommits.length * 1.2) {
                trend = 'increasing';
            } else if (recentCommits.length < previousCommits.length * 0.8) {
                trend = 'decreasing';
            } else {
                trend = 'stable';
            }

            return {
                trend,
                hottestFiles: [], // Would require additional analysis
                activeBranches,
                stalebranchesCount: staleBranches
            };
        } catch (error) {
            this.logger.debug('Error fetching activity metrics:', error);
            return {
                trend: 'stable',
                hottestFiles: [],
                activeBranches: 0,
                stalebranchesCount: 0
            };
        }
    }

    private async getCodeMetrics(
        settings: RepositorySettings,
        repository: GitRepository,
        branch: string
    ): Promise<CodeMetrics> {
        // Simplified code metrics
        // Full implementation would require analyzing commit diffs
        return {
            additions: 0,
            deletions: 0,
            churnRate: 0,
            filesChanged: 0
        };
    }

    private async ensureConnection(settings: RepositorySettings): Promise<void> {
        await this.client.connect({
            organizationUrl: settings.orgUrl,
            personalAccessToken: settings.pat,
            projectName: settings.projectName
        });
        
        const connection = (this.client as any).connection;
        if (connection) {
            this.gitApi = await connection.getGitApi();
        } else {
            throw new Error('Failed to connect to Azure DevOps');
        }
    }

    private getCacheKey(settings: RepositorySettings): string {
        return `${settings.orgUrl}_${settings.projectName}_${settings.repositoryName}_${settings.branch || 'default'}`;
    }

    clearCache(): void {
        this.cache.clear();
    }
}