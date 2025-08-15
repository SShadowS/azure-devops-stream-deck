import { Build, BuildStatus, BuildResult, BuildDefinition } from 'azure-devops-node-api/interfaces/BuildInterfaces';
import { AzureDevOpsClient } from './azure-devops-client';
import streamDeck from '@elgato/streamdeck';
import { performanceOptimizer } from '../utils/performance-optimizer';

export enum PipelineStatus {
    Succeeded = 'succeeded',
    Failed = 'failed',
    Running = 'running',
    PartiallySucceeded = 'partiallySucceeded',
    Canceled = 'canceled',
    Unknown = 'unknown',
    NotStarted = 'notStarted'
}

export interface PipelineInfo {
    id: number;
    name: string;
    status: PipelineStatus;
    buildNumber?: string;
    startTime?: Date;
    finishTime?: Date;
    duration?: number;
    url?: string;
    queueTime?: Date;
    requestedBy?: string;
    sourceBranch?: string;
    sourceVersion?: string;
}

interface CacheEntry<T> {
    data: T;
    timestamp: number;
}

export class PipelineService {
    private client: AzureDevOpsClient;
    private logger = streamDeck.logger.createScope('PipelineService');
    private cache = new Map<string, CacheEntry<any>>();
    private readonly CACHE_TTL = 30000; // 30 seconds
    private readonly MAX_RETRIES = 3;

    constructor(client: AzureDevOpsClient) {
        this.client = client;
    }

    public async getPipelineStatus(pipelineId: number, branchName?: string): Promise<PipelineInfo> {
        const cacheKey = `pipeline-status-${pipelineId}-${branchName || 'all'}`;
        
        // Use performance optimizer's advanced caching with request coalescing
        return performanceOptimizer.coalesceRequests(cacheKey, async () => {
            // Check local cache first
            const cached = this.getFromCache<PipelineInfo>(cacheKey);
            
            if (cached) {
                this.logger.debug(`Returning cached pipeline status for ${pipelineId}${branchName ? ` (branch: ${branchName})` : ''}`);
                return cached;
            }

            try {
                const latestBuild = await this.getLatestBuild(pipelineId, branchName);
                
                if (!latestBuild) {
                    return {
                        id: pipelineId,
                        name: `Pipeline ${pipelineId}`,
                        status: PipelineStatus.Unknown
                    };
                }

                const pipelineInfo = this.buildToPipelineInfo(latestBuild);
                this.setCache(cacheKey, pipelineInfo);
                
                return pipelineInfo;
            } catch (error) {
                this.logger.error(`Failed to get pipeline status for ${pipelineId}${branchName ? ` (branch: ${branchName})` : ''}`, error);
                throw error;
            }
        });
    }

    public async getLatestBuild(pipelineId: number, branchName?: string): Promise<Build | null> {
        const cacheKey = `latest-build-${pipelineId}-${branchName || 'all'}`;
        
        // Use request coalescing to prevent duplicate concurrent API calls
        return performanceOptimizer.coalesceRequests(cacheKey, async () => {
            const cached = this.getFromCache<Build>(cacheKey);
            
            if (cached) {
                this.logger.debug(`Returning cached latest build for pipeline ${pipelineId}${branchName ? ` (branch: ${branchName})` : ''}`);
                return cached;
            }

            try {
                const buildApi = this.client.getBuildApi();
                const projectName = this.client.getProjectName();
                
                // Normalize branch name if provided
                const normalizedBranch = branchName ? this.normalizeBranchName(branchName) : undefined;
                
                const builds = await this.client.retryWithExponentialBackoff(
                    () => buildApi.getBuilds(
                        projectName,
                        [pipelineId],
                        undefined,  // queues
                        undefined,  // buildNumber
                        undefined,  // minTime
                        undefined,  // maxTime
                        undefined,  // requestedFor
                        undefined,  // reasonFilter
                        undefined,  // statusFilter
                        undefined,  // resultFilter
                        undefined,  // tagFilters
                        undefined,  // properties
                        1,          // top
                        undefined,  // continuationToken
                        undefined,  // maxBuildsPerDefinition
                        undefined,  // deletedFilter
                        undefined,  // queryOrder
                        normalizedBranch  // branchName
                    ),
                    this.MAX_RETRIES
                );

                if (builds && builds.length > 0) {
                    const build = builds[0];
                    this.setCache(cacheKey, build);
                    this.logger.debug(`Found build for pipeline ${pipelineId}${branchName ? ` on branch ${branchName}` : ''}:`, {
                        buildNumber: build.buildNumber,
                        sourceBranch: build.sourceBranch,
                        status: build.status
                    });
                    return build;
                }

                this.logger.warn(`No builds found for pipeline ${pipelineId}${branchName ? ` on branch ${branchName}` : ''}`);
                return null;
            } catch (error) {
                this.logger.error(`Failed to get latest build for pipeline ${pipelineId}${branchName ? ` (branch: ${branchName})` : ''}`, error);
                throw error;
            }
        });
    }

    /**
     * Normalizes branch name to the format expected by Azure DevOps API
     * @param branchName The branch name to normalize (e.g., 'main', 'develop', 'refs/heads/main')
     * @returns Normalized branch name (e.g., 'refs/heads/main')
     */
    private normalizeBranchName(branchName: string): string {
        if (!branchName) {
            return branchName;
        }

        // If it already starts with refs/, assume it's normalized
        if (branchName.startsWith('refs/')) {
            return branchName;
        }

        // Otherwise, add the refs/heads/ prefix
        return `refs/heads/${branchName}`;
    }

    public async getPipelineRuns(pipelineId: number, maxCount: number = 10): Promise<Build[]> {
        const cacheKey = `pipeline-runs-${pipelineId}-${maxCount}`;
        const cached = this.getFromCache<Build[]>(cacheKey);
        
        if (cached) {
            this.logger.debug(`Returning cached pipeline runs for ${pipelineId}`);
            return cached;
        }

        try {
            const buildApi = this.client.getBuildApi();
            const projectName = this.client.getProjectName();
            
            const builds = await this.client.retryWithExponentialBackoff(
                () => buildApi.getBuilds(
                    projectName,
                    [pipelineId],
                    undefined,
                    undefined,
                    undefined,
                    undefined,
                    undefined,
                    undefined,
                    undefined,
                    undefined,
                    undefined,
                    undefined,
                    maxCount
                ),
                this.MAX_RETRIES
            );

            this.setCache(cacheKey, builds);
            return builds || [];
        } catch (error) {
            this.logger.error(`Failed to get pipeline runs for ${pipelineId}`, error);
            throw error;
        }
    }

    public async getPipelineDefinition(pipelineId: number): Promise<BuildDefinition | null> {
        const cacheKey = `pipeline-def-${pipelineId}`;
        const cached = this.getFromCache<BuildDefinition>(cacheKey);
        
        if (cached) {
            this.logger.debug(`Returning cached pipeline definition for ${pipelineId}`);
            return cached;
        }

        try {
            const buildApi = this.client.getBuildApi();
            const projectName = this.client.getProjectName();
            
            const definition = await this.client.retryWithExponentialBackoff(
                () => buildApi.getDefinition(projectName, pipelineId),
                this.MAX_RETRIES
            );

            if (definition) {
                this.setCache(cacheKey, definition);
            }
            
            return definition || null;
        } catch (error) {
            this.logger.error(`Failed to get pipeline definition for ${pipelineId}`, error);
            throw error;
        }
    }

    public mapBuildStatus(status?: BuildStatus, result?: BuildResult): PipelineStatus {
        if (status === BuildStatus.InProgress || status === BuildStatus.NotStarted) {
            return status === BuildStatus.InProgress ? PipelineStatus.Running : PipelineStatus.NotStarted;
        }

        if (status === BuildStatus.Completed) {
            switch (result) {
                case BuildResult.Succeeded:
                    return PipelineStatus.Succeeded;
                case BuildResult.Failed:
                    return PipelineStatus.Failed;
                case BuildResult.PartiallySucceeded:
                    return PipelineStatus.PartiallySucceeded;
                case BuildResult.Canceled:
                    return PipelineStatus.Canceled;
                default:
                    return PipelineStatus.Unknown;
            }
        }

        if (status === BuildStatus.Cancelling) {
            return PipelineStatus.Canceled;
        }

        return PipelineStatus.Unknown;
    }

    private buildToPipelineInfo(build: Build): PipelineInfo {
        const status = this.mapBuildStatus(build.status, build.result);
        const startTime = build.startTime ? new Date(build.startTime) : undefined;
        const finishTime = build.finishTime ? new Date(build.finishTime) : undefined;
        const queueTime = build.queueTime ? new Date(build.queueTime) : undefined;
        
        let duration: number | undefined;
        if (startTime && finishTime) {
            duration = finishTime.getTime() - startTime.getTime();
        }

        return {
            id: build.definition?.id || 0,
            name: build.definition?.name || 'Unknown Pipeline',
            status,
            buildNumber: build.buildNumber,
            startTime,
            finishTime,
            duration,
            url: build._links?.web?.href,
            queueTime,
            requestedBy: build.requestedBy?.displayName || build.requestedBy?.uniqueName,
            sourceBranch: build.sourceBranch,
            sourceVersion: build.sourceVersion
        };
    }

    private getFromCache<T>(key: string): T | null {
        const entry = this.cache.get(key);
        
        if (!entry) {
            return null;
        }

        const now = Date.now();
        if (now - entry.timestamp > this.CACHE_TTL) {
            this.cache.delete(key);
            return null;
        }

        return entry.data as T;
    }

    private setCache<T>(key: string, data: T): void {
        this.cache.set(key, {
            data,
            timestamp: Date.now()
        });
    }

    public clearCache(): void {
        this.cache.clear();
        this.logger.debug('Cache cleared');
    }

    public getCacheSize(): number {
        return this.cache.size;
    }
}