import { Logger } from '@elgato/streamdeck';
import * as azdev from 'azure-devops-node-api';
import { IWorkApi } from 'azure-devops-node-api/WorkApi';
import { IWorkItemTrackingApi } from 'azure-devops-node-api/WorkItemTrackingApi';
import { TimeFrame } from 'azure-devops-node-api/interfaces/WorkInterfaces';
import { TeamContext } from 'azure-devops-node-api/interfaces/CoreInterfaces';
import { WorkItem, Wiql, WorkItemQueryResult } from 'azure-devops-node-api/interfaces/WorkItemTrackingInterfaces';
import { AzureDevOpsClient } from './azure-devops-client';

export interface SprintSettings {
    orgUrl: string;
    projectName: string;
    teamName: string;
    pat: string;
    sprintPath?: string; // Optional specific sprint, otherwise current
}

export interface SprintMetrics {
    name: string;
    startDate: Date;
    endDate: Date;
    totalPoints: number;
    completedPoints: number;
    remainingPoints: number;
    totalItems: number;
    completedItems: number;
    remainingItems: number;
    percentComplete: number;
    daysRemaining: number;
    totalDays: number;
    burndownTrend: 'on-track' | 'behind' | 'ahead' | 'complete';
    velocity?: number; // Historical velocity if available
}

export interface WorkItemDetail {
    id: number;
    title: string;
    state: string;
    storyPoints?: number;
    assignedTo?: string;
    workItemType: string;
}

export class SprintService {
    private client: AzureDevOpsClient;
    private logger: Logger;
    private workApi: IWorkApi | null = null;
    private workItemApi: IWorkItemTrackingApi | null = null;
    private cache = new Map<string, { data: SprintMetrics, timestamp: number }>();
    private readonly CACHE_DURATION = 60000; // 1 minute

    constructor(logger: Logger) {
        this.logger = logger;
        this.client = new AzureDevOpsClient();
    }

    async getCurrentSprintMetrics(settings: SprintSettings): Promise<SprintMetrics> {
        const cacheKey = this.getCacheKey(settings);
        const cached = this.cache.get(cacheKey);
        
        if (cached && Date.now() - cached.timestamp < this.CACHE_DURATION) {
            this.logger.debug('Returning cached sprint metrics');
            return cached.data;
        }

        try {
            await this.ensureConnection(settings);
            
            if (!this.workApi || !this.workItemApi) {
                throw new Error('Work APIs not initialized');
            }

            // Get team context
            const teamContext: TeamContext = {
                project: settings.projectName,
                team: settings.teamName
            };

            // Get current iteration
            const currentIteration = await this.workApi.getTeamIteration(
                teamContext,
                '$current'
            );

            if (!currentIteration || !currentIteration.attributes) {
                throw new Error('No active sprint found');
            }

            const startDate = new Date(currentIteration.attributes.startDate!);
            const endDate = new Date(currentIteration.attributes.finishDate!);
            const iterationPath = currentIteration.path;

            // Get work items in the sprint
            const workItems = await this.getSprintWorkItems(
                settings.projectName,
                iterationPath!,
                settings.teamName
            );

            // Calculate metrics
            const metrics = this.calculateMetrics(
                workItems,
                currentIteration.name!,
                startDate,
                endDate
            );

            // Get historical velocity if available
            const velocity = await this.getTeamVelocity(teamContext);
            if (velocity) {
                metrics.velocity = velocity;
            }

            this.cache.set(cacheKey, { data: metrics, timestamp: Date.now() });
            
            return metrics;
        } catch (error) {
            this.logger.error('Error fetching sprint metrics:', error);
            throw error;
        }
    }

    private async getSprintWorkItems(
        projectName: string,
        iterationPath: string,
        teamName: string
    ): Promise<WorkItemDetail[]> {
        if (!this.workItemApi) {
            throw new Error('Work Item API not initialized');
        }

        // Build WIQL query for sprint items
        const wiql = `
            SELECT [System.Id], [System.Title], [System.State], 
                   [Microsoft.VSTS.Scheduling.StoryPoints], 
                   [System.AssignedTo], [System.WorkItemType]
            FROM WorkItems
            WHERE [System.TeamProject] = '${projectName}'
              AND [System.IterationPath] = '${iterationPath}'
              AND [System.WorkItemType] IN ('User Story', 'Bug', 'Task', 'Feature')
            ORDER BY [Microsoft.VSTS.Common.Priority] ASC
        `;

        const queryResult: WorkItemQueryResult = await this.workItemApi.queryByWiql(
            { query: wiql },
            { project: projectName } as any
        );

        if (!queryResult.workItems || queryResult.workItems.length === 0) {
            return [];
        }

        const workItemIds = queryResult.workItems
            .map(wi => wi.id!)
            .filter(id => id !== undefined);

        if (workItemIds.length === 0) {
            return [];
        }

        const fields = [
            'System.Id',
            'System.Title',
            'System.State',
            'Microsoft.VSTS.Scheduling.StoryPoints',
            'System.AssignedTo',
            'System.WorkItemType'
        ];

        const workItems = await this.workItemApi.getWorkItemsBatch(
            {
                ids: workItemIds,
                fields: fields
            },
            { project: projectName } as any
        );

        return this.mapWorkItemsToDetails(workItems);
    }

    private mapWorkItemsToDetails(workItems: WorkItem[]): WorkItemDetail[] {
        return workItems.map(wi => {
            const fields = wi.fields || {};
            return {
                id: wi.id!,
                title: fields['System.Title'] || 'Untitled',
                state: fields['System.State'] || 'Unknown',
                storyPoints: fields['Microsoft.VSTS.Scheduling.StoryPoints'],
                assignedTo: fields['System.AssignedTo']?.displayName,
                workItemType: fields['System.WorkItemType'] || 'Unknown'
            };
        });
    }

    private calculateMetrics(
        workItems: WorkItemDetail[],
        sprintName: string,
        startDate: Date,
        endDate: Date
    ): SprintMetrics {
        const now = new Date();
        const totalDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
        const daysElapsed = Math.ceil((now.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
        const daysRemaining = Math.max(0, Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));

        // Define completed states
        const completedStates = ['Done', 'Closed', 'Resolved', 'Completed'];

        // Calculate points
        let totalPoints = 0;
        let completedPoints = 0;
        let completedItems = 0;

        workItems.forEach(item => {
            const points = item.storyPoints || 0;
            totalPoints += points;
            
            if (completedStates.includes(item.state)) {
                completedPoints += points;
                completedItems++;
            }
        });

        const remainingPoints = totalPoints - completedPoints;
        const remainingItems = workItems.length - completedItems;
        const percentComplete = totalPoints > 0 
            ? Math.round((completedPoints / totalPoints) * 100) 
            : 0;

        // Calculate burndown trend
        let burndownTrend: 'on-track' | 'behind' | 'ahead' | 'complete';
        if (percentComplete === 100) {
            burndownTrend = 'complete';
        } else if (daysRemaining === 0) {
            burndownTrend = 'behind';
        } else {
            const expectedProgress = (daysElapsed / totalDays) * 100;
            if (percentComplete >= expectedProgress + 10) {
                burndownTrend = 'ahead';
            } else if (percentComplete <= expectedProgress - 10) {
                burndownTrend = 'behind';
            } else {
                burndownTrend = 'on-track';
            }
        }

        return {
            name: sprintName,
            startDate,
            endDate,
            totalPoints,
            completedPoints,
            remainingPoints,
            totalItems: workItems.length,
            completedItems,
            remainingItems,
            percentComplete,
            daysRemaining,
            totalDays,
            burndownTrend
        };
    }

    private async getTeamVelocity(teamContext: TeamContext): Promise<number | undefined> {
        try {
            if (!this.workApi) {
                return undefined;
            }

            // Get last 3 completed iterations for velocity calculation
            const iterations = await this.workApi.getTeamIterations(teamContext, 'past');
            
            if (!iterations || iterations.length < 2) {
                return undefined;
            }

            // For simplicity, returning a placeholder
            // In a real implementation, you'd calculate actual velocity from completed work
            return 30; // Average story points per sprint
        } catch (error) {
            this.logger.debug('Could not calculate velocity:', error);
            return undefined;
        }
    }

    private async ensureConnection(settings: SprintSettings): Promise<void> {
        await this.client.connect({
            organizationUrl: settings.orgUrl,
            personalAccessToken: settings.pat,
            projectName: settings.projectName
        });
        
        const connection = (this.client as any).connection;
        if (connection) {
            this.workApi = await connection.getWorkApi();
            this.workItemApi = await connection.getWorkItemTrackingApi();
        } else {
            throw new Error('Failed to connect to Azure DevOps');
        }
    }

    private getCacheKey(settings: SprintSettings): string {
        return `${settings.orgUrl}_${settings.projectName}_${settings.teamName}_${settings.sprintPath || 'current'}`;
    }

    clearCache(): void {
        this.cache.clear();
    }
}