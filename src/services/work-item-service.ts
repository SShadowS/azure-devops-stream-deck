import { Logger } from '@elgato/streamdeck';
import * as azdev from 'azure-devops-node-api';
import { IWorkItemTrackingApi } from 'azure-devops-node-api/WorkItemTrackingApi';
import { WorkItem, Wiql, WorkItemQueryResult } from 'azure-devops-node-api/interfaces/WorkItemTrackingInterfaces';
import { AzureDevOpsClient } from './azure-devops-client';

export interface WorkItemQuerySettings {
    orgUrl: string;
    projectName: string;
    pat: string;
    queryType: 'assigned' | 'created' | 'mentioned' | 'query';
    assignedTo?: string;
    states?: string[];
    workItemTypes?: string[];
    customQuery?: string;
    maxItems?: number;
    includeCompleted?: boolean;
}

export interface WorkItemSummary {
    id: number;
    title: string;
    type: string;
    state: string;
    assignedTo?: string;
    priority?: number;
    url: string;
    tags?: string[];
    iterationPath?: string;
}

export class WorkItemService {
    private client: AzureDevOpsClient;
    private logger: Logger;
    private workItemApi: IWorkItemTrackingApi | null = null;
    private cache = new Map<string, { data: WorkItemSummary[], timestamp: number }>();
    private readonly CACHE_DURATION = 30000; // 30 seconds

    constructor(logger: Logger) {
        this.logger = logger;
        this.client = new AzureDevOpsClient();
    }

    async getWorkItems(settings: WorkItemQuerySettings): Promise<WorkItemSummary[]> {
        const cacheKey = this.getCacheKey(settings);
        const cached = this.cache.get(cacheKey);
        
        if (cached && Date.now() - cached.timestamp < this.CACHE_DURATION) {
            this.logger.debug('Returning cached work items');
            return cached.data;
        }

        try {
            await this.ensureConnection(settings);
            
            if (!this.workItemApi) {
                throw new Error('Work Item API not initialized');
            }

            const wiql = this.buildWiqlQuery(settings);
            this.logger.debug(`Executing WIQL query: ${wiql}`);

            const queryResult: WorkItemQueryResult = await this.workItemApi.queryByWiql(
                { query: wiql },
                { project: settings.projectName } as any
            );

            if (!queryResult.workItems || queryResult.workItems.length === 0) {
                this.logger.info('No work items found');
                return [];
            }

            const workItemIds = queryResult.workItems
                .slice(0, settings.maxItems || 10)
                .map(wi => wi.id!)
                .filter(id => id !== undefined);

            if (workItemIds.length === 0) {
                return [];
            }

            const fields = [
                'System.Id',
                'System.Title',
                'System.WorkItemType',
                'System.State',
                'System.AssignedTo',
                'Microsoft.VSTS.Common.Priority',
                'System.Tags',
                'System.IterationPath'
            ];

            const workItems = await this.workItemApi.getWorkItemsBatch(
                {
                    ids: workItemIds,
                    fields: fields
                },
                { project: settings.projectName } as any
            );

            const summaries = this.mapWorkItemsToSummaries(workItems, settings);
            
            this.cache.set(cacheKey, { data: summaries, timestamp: Date.now() });
            
            return summaries;
        } catch (error) {
            this.logger.error('Error fetching work items:', error);
            throw error;
        }
    }

    private buildWiqlQuery(settings: WorkItemQuerySettings): string {
        if (settings.queryType === 'query' && settings.customQuery) {
            return settings.customQuery;
        }

        const conditions: string[] = [
            `[System.TeamProject] = '${settings.projectName}'`
        ];

        if (settings.queryType === 'assigned') {
            const assignee = settings.assignedTo || '@Me';
            conditions.push(`[System.AssignedTo] = ${assignee}`);
        } else if (settings.queryType === 'created') {
            conditions.push('[System.CreatedBy] = @Me');
        } else if (settings.queryType === 'mentioned') {
            conditions.push('[System.History] Contains @Me');
        }

        if (settings.states && settings.states.length > 0) {
            const stateConditions = settings.states.map(state => `[System.State] = '${state}'`);
            conditions.push(`(${stateConditions.join(' OR ')})`);
        } else if (!settings.includeCompleted) {
            conditions.push(`[System.State] <> 'Closed'`);
            conditions.push(`[System.State] <> 'Done'`);
            conditions.push(`[System.State] <> 'Removed'`);
        }

        if (settings.workItemTypes && settings.workItemTypes.length > 0) {
            const typeConditions = settings.workItemTypes.map(type => `[System.WorkItemType] = '${type}'`);
            conditions.push(`(${typeConditions.join(' OR ')})`);
        }

        return `SELECT [System.Id] FROM WorkItems WHERE ${conditions.join(' AND ')} ORDER BY [Microsoft.VSTS.Common.Priority] ASC, [System.CreatedDate] DESC`;
    }

    private mapWorkItemsToSummaries(workItems: WorkItem[], settings: WorkItemQuerySettings): WorkItemSummary[] {
        return workItems.map(wi => {
            const fields = wi.fields || {};
            return {
                id: wi.id!,
                title: fields['System.Title'] || 'Untitled',
                type: fields['System.WorkItemType'] || 'Unknown',
                state: fields['System.State'] || 'Unknown',
                assignedTo: fields['System.AssignedTo']?.displayName,
                priority: fields['Microsoft.VSTS.Common.Priority'],
                url: `${settings.orgUrl}/${settings.projectName}/_workitems/edit/${wi.id}`,
                tags: fields['System.Tags']?.split(';').map((t: string) => t.trim()).filter((t: string) => t),
                iterationPath: fields['System.IterationPath']
            };
        });
    }

    private async ensureConnection(settings: WorkItemQuerySettings): Promise<void> {
        await this.client.connect({
            organizationUrl: settings.orgUrl,
            personalAccessToken: settings.pat,
            projectName: settings.projectName
        });
        
        const connection = (this.client as any).connection;
        if (connection) {
            this.workItemApi = await connection.getWorkItemTrackingApi();
        } else {
            throw new Error('Failed to connect to Azure DevOps');
        }
    }

    private getCacheKey(settings: WorkItemQuerySettings): string {
        return `${settings.orgUrl}_${settings.projectName}_${settings.queryType}_${settings.assignedTo || 'me'}_${settings.states?.join(',') || 'all'}`;
    }

    clearCache(): void {
        this.cache.clear();
    }
}