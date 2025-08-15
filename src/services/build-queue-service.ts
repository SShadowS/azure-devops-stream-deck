import { Logger } from '@elgato/streamdeck';
import * as azdev from 'azure-devops-node-api';
import { IBuildApi } from 'azure-devops-node-api/BuildApi';
import { ITaskAgentApi } from 'azure-devops-node-api/TaskAgentApi';
import { 
    Build, 
    BuildDefinition,
    BuildStatus,
    BuildResult,
    BuildReason,
    QueuePriority,
    BuildQueryOrder,
    DefinitionQueryOrder
} from 'azure-devops-node-api/interfaces/BuildInterfaces';
import {
    TaskAgentPool,
    TaskAgent,
    TaskAgentQueue,
    TaskAgentJobRequest
} from 'azure-devops-node-api/interfaces/TaskAgentInterfaces';
import { AzureDevOpsClient } from './azure-devops-client';

export interface BuildQueueSettings {
    orgUrl: string;
    projectName: string;
    buildDefinitionName?: string;
    buildDefinitionId?: number;
    pat: string;
    poolName?: string;
    branch?: string;
}

export interface BuildQueueMetrics {
    queueLength: number;
    runningBuilds: BuildInfo[];
    queuedBuilds: BuildInfo[];
    recentBuilds: BuildInfo[];
    agentStatus: AgentPoolStatus;
    estimatedWaitTime: number; // in minutes
    averageBuildTime: number; // in minutes
}

export interface BuildInfo {
    id: number;
    buildNumber: string;
    definitionName: string;
    status: string;
    result?: string;
    reason: string;
    queueTime?: Date;
    startTime?: Date;
    finishTime?: Date;
    requestedBy: string;
    sourceBranch: string;
    queuePosition?: number;
    estimatedDuration?: number; // in minutes
    canCancel: boolean;
}

export interface AgentPoolStatus {
    poolName: string;
    totalAgents: number;
    onlineAgents: number;
    busyAgents: number;
    availableAgents: number;
    offlineAgents: number;
}

export interface BuildParameters {
    branch?: string;
    variables?: { [key: string]: string };
    sourceBuildId?: number;
}

export class BuildQueueService {
    private client: AzureDevOpsClient;
    private logger: Logger;
    private buildApi: IBuildApi | null = null;
    private taskAgentApi: ITaskAgentApi | null = null;
    private cache = new Map<string, { data: BuildQueueMetrics, timestamp: number }>();
    private readonly CACHE_DURATION = 15000; // 15 seconds for more real-time updates

    constructor(logger: Logger) {
        this.logger = logger;
        this.client = new AzureDevOpsClient();
    }

    async getQueueMetrics(settings: BuildQueueSettings): Promise<BuildQueueMetrics> {
        const cacheKey = this.getCacheKey(settings);
        const cached = this.cache.get(cacheKey);
        
        if (cached && Date.now() - cached.timestamp < this.CACHE_DURATION) {
            this.logger.debug('Returning cached build queue metrics');
            return cached.data;
        }

        try {
            await this.ensureConnection(settings);
            
            if (!this.buildApi) {
                throw new Error('Build API not initialized');
            }

            // Get running and queued builds
            const [runningBuilds, queuedBuilds, recentBuilds, agentStatus] = await Promise.all([
                this.getRunningBuilds(settings),
                this.getQueuedBuilds(settings),
                this.getRecentBuilds(settings),
                this.getAgentPoolStatus(settings)
            ]);

            // Calculate metrics
            const queueLength = queuedBuilds.length;
            const averageBuildTime = this.calculateAverageBuildTime(recentBuilds);
            const estimatedWaitTime = this.calculateEstimatedWaitTime(
                queuedBuilds.length,
                agentStatus.availableAgents,
                averageBuildTime
            );

            const metrics: BuildQueueMetrics = {
                queueLength,
                runningBuilds,
                queuedBuilds,
                recentBuilds,
                agentStatus,
                estimatedWaitTime,
                averageBuildTime
            };

            this.cache.set(cacheKey, { data: metrics, timestamp: Date.now() });
            
            return metrics;
        } catch (error) {
            this.logger.error('Error fetching build queue metrics:', error);
            throw error;
        }
    }

    async queueBuild(settings: BuildQueueSettings, parameters?: BuildParameters): Promise<Build> {
        try {
            await this.ensureConnection(settings);
            
            if (!this.buildApi) {
                throw new Error('Build API not initialized');
            }

            // Get build definition
            let definition: BuildDefinition | undefined;
            
            if (settings.buildDefinitionId) {
                definition = await this.buildApi.getDefinition(
                    settings.projectName,
                    settings.buildDefinitionId
                );
            } else if (settings.buildDefinitionName) {
                const definitions = await this.buildApi.getDefinitions(
                    settings.projectName,
                    settings.buildDefinitionName
                );
                definition = definitions?.[0];
            }

            if (!definition) {
                throw new Error('Build definition not found');
            }

            // Prepare build request
            const build: Build = {
                definition: {
                    id: definition.id
                },
                project: {
                    id: definition.project?.id
                },
                sourceBranch: parameters?.branch || settings.branch || definition.repository?.defaultBranch,
                reason: BuildReason.Manual,
                priority: QueuePriority.Normal,
                parameters: parameters?.variables ? JSON.stringify(parameters.variables) : undefined
            };

            // Queue the build
            const queuedBuild = await this.buildApi.queueBuild(build, settings.projectName);
            
            this.logger.info(`Build queued successfully: ${queuedBuild.buildNumber}`);
            
            // Clear cache to reflect new build
            this.cache.delete(this.getCacheKey(settings));
            
            return queuedBuild;
        } catch (error) {
            this.logger.error('Error queuing build:', error);
            throw error;
        }
    }

    async cancelBuild(settings: BuildQueueSettings, buildId: number): Promise<void> {
        try {
            await this.ensureConnection(settings);
            
            if (!this.buildApi) {
                throw new Error('Build API not initialized');
            }

            // Update build status to cancelled
            const build: Build = {
                id: buildId,
                status: BuildStatus.Cancelling
            };

            await this.buildApi.updateBuild(build, settings.projectName, buildId);
            
            this.logger.info(`Build ${buildId} cancelled successfully`);
            
            // Clear cache to reflect cancelled build
            this.cache.delete(this.getCacheKey(settings));
        } catch (error) {
            this.logger.error('Error cancelling build:', error);
            throw error;
        }
    }

    async retryBuild(settings: BuildQueueSettings, buildId: number): Promise<Build> {
        try {
            await this.ensureConnection(settings);
            
            if (!this.buildApi) {
                throw new Error('Build API not initialized');
            }

            // Get the original build
            const originalBuild = await this.buildApi.getBuild(settings.projectName, buildId);
            
            if (!originalBuild) {
                throw new Error('Original build not found');
            }

            // Queue a new build with same parameters
            const build: Build = {
                definition: originalBuild.definition,
                project: originalBuild.project,
                sourceBranch: originalBuild.sourceBranch,
                sourceVersion: originalBuild.sourceVersion,
                reason: BuildReason.Manual,
                priority: QueuePriority.Normal,
                parameters: originalBuild.parameters
            };

            const retriedBuild = await this.buildApi.queueBuild(build, settings.projectName);
            
            this.logger.info(`Build retried successfully: ${retriedBuild.buildNumber}`);
            
            // Clear cache
            this.cache.delete(this.getCacheKey(settings));
            
            return retriedBuild;
        } catch (error) {
            this.logger.error('Error retrying build:', error);
            throw error;
        }
    }

    private async getRunningBuilds(settings: BuildQueueSettings): Promise<BuildInfo[]> {
        if (!this.buildApi) {
            return [];
        }

        try {
            const builds = await this.buildApi.getBuilds(
                settings.projectName,
                undefined, // definitions
                undefined, // queues
                undefined, // buildNumber
                undefined, // minTime
                undefined, // maxTime
                undefined, // requestedFor
                undefined, // reasonFilter
                BuildStatus.InProgress, // statusFilter
                undefined, // resultFilter
                undefined, // tagFilters
                undefined, // properties
                undefined, // top
                undefined, // continuationToken
                undefined, // maxBuildsPerDefinition
                undefined, // deletedFilter
                BuildQueryOrder.StartTimeDescending // queryOrder
            );

            return builds.map(build => this.mapBuildInfo(build));
        } catch (error) {
            this.logger.debug('Error fetching running builds:', error);
            return [];
        }
    }

    private async getQueuedBuilds(settings: BuildQueueSettings): Promise<BuildInfo[]> {
        if (!this.buildApi) {
            return [];
        }

        try {
            const builds = await this.buildApi.getBuilds(
                settings.projectName,
                undefined, // definitions
                undefined, // queues
                undefined, // buildNumber
                undefined, // minTime
                undefined, // maxTime
                undefined, // requestedFor
                undefined, // reasonFilter
                BuildStatus.NotStarted, // statusFilter
                undefined, // resultFilter
                undefined, // tagFilters
                undefined, // properties
                undefined, // top
                undefined, // continuationToken
                undefined, // maxBuildsPerDefinition
                undefined, // deletedFilter
                BuildQueryOrder.QueueTimeDescending // queryOrder
            );

            // Add queue position
            const queuedBuilds = builds.map((build, index) => {
                const info = this.mapBuildInfo(build);
                info.queuePosition = index + 1;
                return info;
            });

            return queuedBuilds;
        } catch (error) {
            this.logger.debug('Error fetching queued builds:', error);
            return [];
        }
    }

    private async getRecentBuilds(settings: BuildQueueSettings): Promise<BuildInfo[]> {
        if (!this.buildApi) {
            return [];
        }

        try {
            const builds = await this.buildApi.getBuilds(
                settings.projectName,
                undefined, // definitions
                undefined, // queues
                undefined, // buildNumber
                undefined, // minTime
                undefined, // maxTime
                undefined, // requestedFor
                undefined, // reasonFilter
                undefined, // statusFilter
                undefined, // resultFilter
                undefined, // tagFilters
                undefined, // properties
                20, // top
                undefined, // continuationToken
                undefined, // maxBuildsPerDefinition
                undefined, // deletedFilter
                BuildQueryOrder.FinishTimeDescending // queryOrder
            );

            return builds.map(build => this.mapBuildInfo(build));
        } catch (error) {
            this.logger.debug('Error fetching recent builds:', error);
            return [];
        }
    }

    private async getAgentPoolStatus(settings: BuildQueueSettings): Promise<AgentPoolStatus> {
        if (!this.taskAgentApi) {
            return {
                poolName: 'Unknown',
                totalAgents: 0,
                onlineAgents: 0,
                busyAgents: 0,
                availableAgents: 0,
                offlineAgents: 0
            };
        }

        try {
            // Get agent pools
            const pools = await this.taskAgentApi.getAgentPools();
            
            // Find the specified pool or use the first one
            const pool = settings.poolName 
                ? pools.find(p => p.name === settings.poolName)
                : pools[0];

            if (!pool || !pool.id) {
                return {
                    poolName: 'Unknown',
                    totalAgents: 0,
                    onlineAgents: 0,
                    busyAgents: 0,
                    availableAgents: 0,
                    offlineAgents: 0
                };
            }

            // Get agents in the pool
            const agents = await this.taskAgentApi.getAgents(pool.id);
            
            const totalAgents = agents.length;
            const onlineAgents = agents.filter(a => a.status === 1).length; // Online
            const busyAgents = agents.filter(a => a.assignedRequest).length;
            const availableAgents = onlineAgents - busyAgents;
            const offlineAgents = agents.filter(a => a.status === 2).length; // Offline

            return {
                poolName: pool.name!,
                totalAgents,
                onlineAgents,
                busyAgents,
                availableAgents,
                offlineAgents
            };
        } catch (error) {
            this.logger.debug('Error fetching agent pool status:', error);
            return {
                poolName: 'Unknown',
                totalAgents: 0,
                onlineAgents: 0,
                busyAgents: 0,
                availableAgents: 0,
                offlineAgents: 0
            };
        }
    }

    private mapBuildInfo(build: Build): BuildInfo {
        const duration = build.startTime && build.finishTime
            ? Math.round((new Date(build.finishTime).getTime() - new Date(build.startTime).getTime()) / 60000)
            : undefined;

        return {
            id: build.id!,
            buildNumber: build.buildNumber || 'Unknown',
            definitionName: build.definition?.name || 'Unknown',
            status: this.mapBuildStatus(build.status),
            result: build.result !== undefined ? this.mapBuildResult(build.result) : undefined,
            reason: this.mapBuildReason(build.reason),
            queueTime: build.queueTime ? new Date(build.queueTime) : undefined,
            startTime: build.startTime ? new Date(build.startTime) : undefined,
            finishTime: build.finishTime ? new Date(build.finishTime) : undefined,
            requestedBy: build.requestedBy?.displayName || build.requestedFor?.displayName || 'Unknown',
            sourceBranch: build.sourceBranch || 'Unknown',
            estimatedDuration: duration,
            canCancel: build.status === BuildStatus.InProgress || build.status === BuildStatus.NotStarted
        };
    }

    private mapBuildStatus(status?: BuildStatus): string {
        if (!status) return 'Unknown';
        
        switch (status) {
            case BuildStatus.InProgress: return 'In Progress';
            case BuildStatus.Completed: return 'Completed';
            case BuildStatus.Cancelling: return 'Cancelling';
            case BuildStatus.Postponed: return 'Postponed';
            case BuildStatus.NotStarted: return 'Queued';
            default: return 'Unknown';
        }
    }

    private mapBuildResult(result: BuildResult): string {
        switch (result) {
            case BuildResult.Succeeded: return 'Succeeded';
            case BuildResult.PartiallySucceeded: return 'Partially Succeeded';
            case BuildResult.Failed: return 'Failed';
            case BuildResult.Canceled: return 'Canceled';
            default: return 'Unknown';
        }
    }

    private mapBuildReason(reason?: BuildReason): string {
        if (!reason) return 'Unknown';
        
        switch (reason) {
            case BuildReason.Manual: return 'Manual';
            case BuildReason.IndividualCI: return 'CI';
            case BuildReason.BatchedCI: return 'Batched CI';
            case BuildReason.Schedule: return 'Scheduled';
            case BuildReason.PullRequest: return 'Pull Request';
            case BuildReason.BuildCompletion: return 'Build Completion';
            case BuildReason.ResourceTrigger: return 'Resource Trigger';
            case BuildReason.Triggered: return 'Triggered';
            default: return 'Unknown';
        }
    }

    private calculateAverageBuildTime(builds: BuildInfo[]): number {
        const completedBuilds = builds.filter(b => 
            b.startTime && b.finishTime && b.status === 'Completed'
        );

        if (completedBuilds.length === 0) {
            return 30; // Default 30 minutes
        }

        const totalTime = completedBuilds.reduce((sum, build) => {
            const duration = new Date(build.finishTime!).getTime() - new Date(build.startTime!).getTime();
            return sum + duration;
        }, 0);

        return Math.round(totalTime / completedBuilds.length / 60000); // Convert to minutes
    }

    private calculateEstimatedWaitTime(
        queueLength: number,
        availableAgents: number,
        averageBuildTime: number
    ): number {
        if (availableAgents === 0) {
            return queueLength * averageBuildTime;
        }

        // Estimate based on queue length and available agents
        const buildsPerAgent = Math.ceil(queueLength / availableAgents);
        return buildsPerAgent * averageBuildTime;
    }

    private async ensureConnection(settings: BuildQueueSettings): Promise<void> {
        await this.client.connect({
            organizationUrl: settings.orgUrl,
            personalAccessToken: settings.pat,
            projectName: settings.projectName
        });
        
        const connection = (this.client as any).connection;
        if (connection) {
            this.buildApi = await connection.getBuildApi();
            this.taskAgentApi = await connection.getTaskAgentApi();
        } else {
            throw new Error('Failed to connect to Azure DevOps');
        }
    }

    private getCacheKey(settings: BuildQueueSettings): string {
        const defId = settings.buildDefinitionId || settings.buildDefinitionName || 'all';
        return `${settings.orgUrl}_${settings.projectName}_${defId}`;
    }

    clearCache(): void {
        this.cache.clear();
    }
}