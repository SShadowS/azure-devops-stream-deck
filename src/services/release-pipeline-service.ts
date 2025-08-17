import { Logger } from '@elgato/streamdeck';
import * as azdev from 'azure-devops-node-api';
import { IReleaseApi } from 'azure-devops-node-api/ReleaseApi';
import { 
    Release, 
    ReleaseDefinition, 
    ReleaseEnvironment, 
    EnvironmentStatus,
    ReleaseStatus,
    DeploymentStatus,
    ApprovalStatus
} from 'azure-devops-node-api/interfaces/ReleaseInterfaces';
import { AzureDevOpsClient } from './azure-devops-client';

export interface ReleaseSettings {
    orgUrl: string;
    projectName: string;
    releaseDefinitionName?: string;
    releaseDefinitionId?: number;
    pat: string;
    environmentFilter?: string[]; // Optional filter for specific environments
}

export interface ReleaseMetrics {
    definitionName: string;
    latestRelease: ReleaseInfo | null;
    environments: EnvironmentInfo[];
    pendingApprovals: ApprovalInfo[];
    recentDeployments: DeploymentInfo[];
    overallStatus: 'success' | 'partial' | 'failed' | 'inprogress' | 'notdeployed';
}

export interface ReleaseInfo {
    id: number;
    name: string;
    status: string;
    createdOn: Date;
    modifiedOn: Date;
    releaseDefinitionName: string;
    createdBy: string;
    reason: string;
    description?: string;
}

export interface EnvironmentInfo {
    id: number;
    name: string;
    status: string;
    deploymentStatus: string;
    rank: number;
    releaseId: number;
    releaseName: string;
    deployedVersion?: string;
    deployedOn?: Date;
    deployedBy?: string;
    timeToDeploy?: number; // in minutes
    hasApprovals: boolean;
    approvalStatus?: string;
}

export interface ApprovalInfo {
    id: number;
    environmentName: string;
    releaseName: string;
    approver: string;
    status: string;
    createdOn: Date;
    comments?: string;
}

export interface DeploymentInfo {
    releaseName: string;
    environmentName: string;
    status: string;
    startedOn: Date;
    completedOn?: Date;
    duration?: number; // in minutes
    requestedBy: string;
}

export class ReleasePipelineService {
    private client: AzureDevOpsClient;
    private logger: Logger;
    private releaseApi: IReleaseApi | null = null;
    private cache = new Map<string, { data: ReleaseMetrics, timestamp: number }>();
    private readonly CACHE_DURATION = 30000; // 30 seconds for more real-time updates

    constructor(logger: Logger) {
        this.logger = logger;
        this.client = new AzureDevOpsClient();
    }

    async getReleaseMetrics(settings: ReleaseSettings): Promise<ReleaseMetrics> {
        const cacheKey = this.getCacheKey(settings);
        const cached = this.cache.get(cacheKey);
        
        if (cached && Date.now() - cached.timestamp < this.CACHE_DURATION) {
            this.logger.debug('Returning cached release metrics');
            return cached.data;
        }

        try {
            await this.ensureConnection(settings);
            
            if (!this.releaseApi) {
                throw new Error('Release API not initialized');
            }

            // Get release definition
            let definition: ReleaseDefinition | undefined;
            
            if (settings.releaseDefinitionId) {
                definition = await this.releaseApi.getReleaseDefinition(
                    settings.projectName,
                    settings.releaseDefinitionId
                );
            } else if (settings.releaseDefinitionName) {
                const definitions = await this.releaseApi.getReleaseDefinitions(
                    settings.projectName,
                    settings.releaseDefinitionName
                );
                definition = definitions?.[0];
            }

            if (!definition) {
                throw new Error('Release definition not found');
            }

            // Get latest releases for this definition
            const releases = await this.releaseApi.getReleases(
                settings.projectName,
                definition.id,
                undefined, // environments
                undefined, // expand
                undefined, // releaseIdFilter
                undefined, // createdBy
                undefined, // statusFilter
                undefined, // minCreatedTime
                undefined, // maxCreatedTime
                undefined, // queryOrder
                10 // top
            );

            if (!releases || releases.length === 0) {
                return {
                    definitionName: definition.name!,
                    latestRelease: null,
                    environments: [],
                    pendingApprovals: [],
                    recentDeployments: [],
                    overallStatus: 'notdeployed'
                };
            }

            // Get detailed info for the latest release
            const latestRelease = await this.releaseApi.getRelease(
                settings.projectName,
                releases[0].id!
            );

            if (!latestRelease) {
                throw new Error('Could not get release details');
            }

            // Process release information
            const releaseInfo = this.mapReleaseInfo(latestRelease);
            const environments = this.mapEnvironments(latestRelease, settings.environmentFilter);
            const pendingApprovals = await this.getPendingApprovals(settings.projectName, latestRelease);
            const recentDeployments = await this.getRecentDeployments(releases.slice(0, 5));
            const overallStatus = this.calculateOverallStatus(environments);

            const metrics: ReleaseMetrics = {
                definitionName: definition.name!,
                latestRelease: releaseInfo,
                environments,
                pendingApprovals,
                recentDeployments,
                overallStatus
            };

            this.cache.set(cacheKey, { data: metrics, timestamp: Date.now() });
            
            return metrics;
        } catch (error) {
            this.logger.error('Error fetching release metrics:', error);
            throw error;
        }
    }

    private mapReleaseInfo(release: Release): ReleaseInfo {
        return {
            id: release.id!,
            name: release.name!,
            status: String(release.status || 'Unknown'),
            createdOn: new Date(release.createdOn!),
            modifiedOn: new Date(release.modifiedOn!),
            releaseDefinitionName: release.releaseDefinition?.name || 'Unknown',
            createdBy: release.createdBy?.displayName || 'Unknown',
            reason: String(release.reason || 'Manual'),
            description: release.description
        };
    }

    private mapEnvironments(release: Release, filter?: string[]): EnvironmentInfo[] {
        if (!release.environments) {
            return [];
        }

        let environments = release.environments;
        
        // Apply filter if provided
        if (filter && filter.length > 0) {
            environments = environments.filter(env => 
                filter.includes(env.name!)
            );
        }

        return environments.map(env => {
            const deploySteps = env.deploySteps || [];
            const latestDeployment = deploySteps[deploySteps.length - 1];
            
            let deployedOn: Date | undefined;
            let deployedBy: string | undefined;
            let timeToDeploy: number | undefined;

            if (latestDeployment && latestDeployment.queuedOn && latestDeployment.lastModifiedOn) {
                deployedOn = new Date(latestDeployment.lastModifiedOn);
                deployedBy = latestDeployment.requestedBy?.displayName;
                
                const start = new Date(latestDeployment.queuedOn).getTime();
                const end = new Date(latestDeployment.lastModifiedOn).getTime();
                timeToDeploy = Math.round((end - start) / (1000 * 60)); // Convert to minutes
            }

            // Check for approvals
            const hasApprovals = (env.preDeployApprovals?.length || 0) > 0 || 
                                (env.postDeployApprovals?.length || 0) > 0;
            
            let approvalStatus: string | undefined;
            if (hasApprovals) {
                const allApprovals = [...(env.preDeployApprovals || []), ...(env.postDeployApprovals || [])];
                const pendingApprovals = allApprovals.filter(a => a.status === ApprovalStatus.Pending);
                const rejectedApprovals = allApprovals.filter(a => a.status === ApprovalStatus.Rejected);
                
                if (rejectedApprovals.length > 0) {
                    approvalStatus = 'Rejected';
                } else if (pendingApprovals.length > 0) {
                    approvalStatus = 'Pending';
                } else {
                    approvalStatus = 'Approved';
                }
            }

            return {
                id: env.id!,
                name: env.name!,
                status: this.mapEnvironmentStatus(env.status!),
                deploymentStatus: 'Unknown', // ReleaseCondition doesn't have status property
                rank: env.rank!,
                releaseId: release.id!,
                releaseName: release.name!,
                deployedVersion: release.name,
                deployedOn,
                deployedBy,
                timeToDeploy,
                hasApprovals,
                approvalStatus
            };
        }).sort((a, b) => a.rank - b.rank); // Sort by deployment order
    }

    private mapEnvironmentStatus(status: EnvironmentStatus): string {
        switch (status) {
            case EnvironmentStatus.NotStarted:
                return 'Not Started';
            case EnvironmentStatus.InProgress:
                return 'In Progress';
            case EnvironmentStatus.Succeeded:
                return 'Succeeded';
            case EnvironmentStatus.Canceled:
                return 'Canceled';
            case EnvironmentStatus.Rejected:
                return 'Rejected';
            case EnvironmentStatus.Queued:
                return 'Queued';
            case EnvironmentStatus.Scheduled:
                return 'Scheduled';
            case EnvironmentStatus.PartiallySucceeded:
                return 'Partially Succeeded';
            default:
                return 'Unknown';
        }
    }

    private mapDeploymentStatus(status?: DeploymentStatus): string {
        if (!status) return 'Not Deployed';
        
        switch (status) {
            case DeploymentStatus.NotDeployed:
                return 'Not Deployed';
            case DeploymentStatus.InProgress:
                return 'In Progress';
            case DeploymentStatus.Succeeded:
                return 'Succeeded';
            case DeploymentStatus.PartiallySucceeded:
                return 'Partially Succeeded';
            case DeploymentStatus.Failed:
                return 'Failed';
            case DeploymentStatus.All:
                return 'All';
            default:
                return 'Unknown';
        }
    }

    private async getPendingApprovals(projectName: string, release: Release): Promise<ApprovalInfo[]> {
        const approvals: ApprovalInfo[] = [];

        if (!release.environments) {
            return approvals;
        }

        for (const env of release.environments) {
            const allApprovals = [...(env.preDeployApprovals || []), ...(env.postDeployApprovals || [])];
            
            for (const approval of allApprovals) {
                if (approval.status === ApprovalStatus.Pending) {
                    approvals.push({
                        id: approval.id!,
                        environmentName: env.name!,
                        releaseName: release.name!,
                        approver: approval.approver?.displayName || 'Unknown',
                        status: 'Pending',
                        createdOn: new Date(approval.createdOn!),
                        comments: approval.comments
                    });
                }
            }
        }

        return approvals;
    }

    private async getRecentDeployments(releases: Release[]): Promise<DeploymentInfo[]> {
        const deployments: DeploymentInfo[] = [];

        for (const release of releases) {
            if (!release.environments) continue;

            for (const env of release.environments) {
                if (env.status === EnvironmentStatus.Succeeded || 
                    env.status === EnvironmentStatus.PartiallySucceeded ||
                    env.status === EnvironmentStatus.Rejected) {
                    
                    const deploySteps = env.deploySteps || [];
                    const latestDeployment = deploySteps[deploySteps.length - 1];
                    
                    if (latestDeployment) {
                        let duration: number | undefined;
                        if (latestDeployment.queuedOn && latestDeployment.lastModifiedOn) {
                            const start = new Date(latestDeployment.queuedOn).getTime();
                            const end = new Date(latestDeployment.lastModifiedOn).getTime();
                            duration = Math.round((end - start) / (1000 * 60)); // Convert to minutes
                        }

                        deployments.push({
                            releaseName: release.name!,
                            environmentName: env.name!,
                            status: this.mapEnvironmentStatus(env.status!),
                            startedOn: new Date(latestDeployment.queuedOn!),
                            completedOn: latestDeployment.lastModifiedOn ? new Date(latestDeployment.lastModifiedOn) : undefined,
                            duration,
                            requestedBy: latestDeployment.requestedBy?.displayName || 'Unknown'
                        });
                    }
                }
            }
        }

        return deployments.slice(0, 10); // Return last 10 deployments
    }

    private calculateOverallStatus(environments: EnvironmentInfo[]): 'success' | 'partial' | 'failed' | 'inprogress' | 'notdeployed' {
        if (environments.length === 0) {
            return 'notdeployed';
        }

        const hasInProgress = environments.some(e => e.status === 'In Progress' || e.status === 'Queued');
        const hasFailed = environments.some(e => e.status === 'Failed' || e.status === 'Rejected');
        const hasSucceeded = environments.some(e => e.status === 'Succeeded');
        const allSucceeded = environments.every(e => e.status === 'Succeeded');

        if (hasInProgress) {
            return 'inprogress';
        } else if (allSucceeded) {
            return 'success';
        } else if (hasFailed && !hasSucceeded) {
            return 'failed';
        } else if (hasFailed && hasSucceeded) {
            return 'partial';
        } else {
            return 'notdeployed';
        }
    }

    private async ensureConnection(settings: ReleaseSettings): Promise<void> {
        await this.client.connect({
            organizationUrl: settings.orgUrl,
            personalAccessToken: settings.pat,
            projectName: settings.projectName
        });
        
        const connection = (this.client as any).connection;
        if (connection) {
            this.releaseApi = await connection.getReleaseApi();
        } else {
            throw new Error('Failed to connect to Azure DevOps');
        }
    }

    private getCacheKey(settings: ReleaseSettings): string {
        const defId = settings.releaseDefinitionId || settings.releaseDefinitionName || 'unknown';
        return `${settings.orgUrl}_${settings.projectName}_${defId}`;
    }

    clearCache(): void {
        this.cache.clear();
    }
}