import { WorkItemService, WorkItemQuerySettings } from '../work-item-service';
import { AzureDevOpsClient } from '../azure-devops-client';
import { Logger } from '@elgato/streamdeck';

jest.mock('../azure-devops-client');

describe('WorkItemService', () => {
    let service: WorkItemService;
    let mockLogger: jest.Mocked<Logger>;
    let mockClient: jest.Mocked<AzureDevOpsClient>;
    let mockWorkItemApi: any;

    const baseSettings: WorkItemQuerySettings = {
        orgUrl: 'https://dev.azure.com/myorg',
        projectName: 'TestProject',
        pat: 'test-pat-token',
        queryType: 'assigned',
        maxItems: 10
    };

    beforeEach(() => {
        jest.clearAllMocks();
        
        mockLogger = {
            debug: jest.fn(),
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
            trace: jest.fn(),
            setLevel: jest.fn(),
            createScope: jest.fn()
        } as unknown as jest.Mocked<Logger>;

        mockWorkItemApi = {
            queryByWiql: jest.fn(),
            getWorkItemsBatch: jest.fn()
        };

        mockClient = new AzureDevOpsClient() as jest.Mocked<AzureDevOpsClient>;
        mockClient.connect = jest.fn().mockResolvedValue(undefined);
        (mockClient as any).connection = {
            getWorkItemTrackingApi: jest.fn().mockResolvedValue(mockWorkItemApi)
        };

        (AzureDevOpsClient as jest.Mock).mockImplementation(() => mockClient);

        service = new WorkItemService(mockLogger);
    });

    describe('getWorkItems', () => {
        it('should fetch and return work items', async () => {
            const mockQueryResult = {
                workItems: [
                    { id: 1 },
                    { id: 2 },
                    { id: 3 }
                ]
            };

            const mockWorkItems = [
                {
                    id: 1,
                    fields: {
                        'System.Title': 'Bug Fix',
                        'System.WorkItemType': 'Bug',
                        'System.State': 'Active',
                        'System.AssignedTo': { displayName: 'John Doe' },
                        'Microsoft.VSTS.Common.Priority': 1,
                        'System.Tags': 'critical;backend',
                        'System.IterationPath': 'Sprint 1'
                    }
                },
                {
                    id: 2,
                    fields: {
                        'System.Title': 'New Feature',
                        'System.WorkItemType': 'User Story',
                        'System.State': 'New',
                        'System.AssignedTo': { displayName: 'Jane Smith' },
                        'Microsoft.VSTS.Common.Priority': 2,
                        'System.Tags': 'frontend',
                        'System.IterationPath': 'Sprint 2'
                    }
                },
                {
                    id: 3,
                    fields: {
                        'System.Title': 'Documentation Update',
                        'System.WorkItemType': 'Task',
                        'System.State': 'In Progress',
                        'Microsoft.VSTS.Common.Priority': 3
                    }
                }
            ];

            mockWorkItemApi.queryByWiql.mockResolvedValue(mockQueryResult);
            mockWorkItemApi.getWorkItemsBatch.mockResolvedValue(mockWorkItems);

            const result = await service.getWorkItems(baseSettings);

            expect(result).toHaveLength(3);
            expect(result[0]).toEqual({
                id: 1,
                title: 'Bug Fix',
                type: 'Bug',
                state: 'Active',
                assignedTo: 'John Doe',
                priority: 1,
                url: 'https://dev.azure.com/myorg/TestProject/_workitems/edit/1',
                tags: ['critical', 'backend'],
                iterationPath: 'Sprint 1'
            });
            expect(result[1].assignedTo).toBe('Jane Smith');
            expect(result[2].assignedTo).toBeUndefined();
        });

        it('should return empty array when no work items found', async () => {
            mockWorkItemApi.queryByWiql.mockResolvedValue({ workItems: [] });

            const result = await service.getWorkItems(baseSettings);

            expect(result).toEqual([]);
            expect(mockLogger.info).toHaveBeenCalledWith('No work items found');
        });

        it('should use cache for subsequent calls within cache duration', async () => {
            const mockQueryResult = { workItems: [{ id: 1 }] };
            const mockWorkItems = [{
                id: 1,
                fields: { 'System.Title': 'Cached Item' }
            }];

            mockWorkItemApi.queryByWiql.mockResolvedValue(mockQueryResult);
            mockWorkItemApi.getWorkItemsBatch.mockResolvedValue(mockWorkItems);

            // First call
            await service.getWorkItems(baseSettings);
            expect(mockWorkItemApi.queryByWiql).toHaveBeenCalledTimes(1);

            // Second call (should use cache)
            await service.getWorkItems(baseSettings);
            expect(mockWorkItemApi.queryByWiql).toHaveBeenCalledTimes(1);
            expect(mockLogger.debug).toHaveBeenCalledWith('Returning cached work items');
        });

        it('should handle connection errors', async () => {
            mockClient.connect.mockRejectedValue(new Error('Connection failed'));

            await expect(service.getWorkItems(baseSettings)).rejects.toThrow('Connection failed');
            expect(mockLogger.error).toHaveBeenCalledWith(
                'Error fetching work items:',
                expect.any(Error)
            );
        });

        it('should handle API errors', async () => {
            mockWorkItemApi.queryByWiql.mockRejectedValue(new Error('API Error'));

            await expect(service.getWorkItems(baseSettings)).rejects.toThrow('API Error');
            expect(mockLogger.error).toHaveBeenCalled();
        });

        it('should respect maxItems setting', async () => {
            const mockQueryResult = {
                workItems: Array.from({ length: 20 }, (_, i) => ({ id: i + 1 }))
            };

            const mockWorkItems = Array.from({ length: 10 }, (_, i) => ({
                id: i + 1,
                fields: { 'System.Title': `Item ${i + 1}` }
            }));

            mockWorkItemApi.queryByWiql.mockResolvedValue(mockQueryResult);
            mockWorkItemApi.getWorkItemsBatch.mockResolvedValue(mockWorkItems);

            const result = await service.getWorkItems({ ...baseSettings, maxItems: 10 });

            expect(result).toHaveLength(10);
            expect(mockWorkItemApi.getWorkItemsBatch).toHaveBeenCalledWith(
                expect.objectContaining({
                    ids: expect.arrayContaining([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
                }),
                expect.any(Object)
            );
        });
    });

    describe('buildWiqlQuery', () => {
        it('should build query for assigned work items', async () => {
            const settings: WorkItemQuerySettings = {
                ...baseSettings,
                queryType: 'assigned',
                assignedTo: 'john.doe@company.com'
            };

            mockWorkItemApi.queryByWiql.mockImplementation(async (wiql: any) => {
                expect(wiql.query).toContain("[System.AssignedTo] = john.doe@company.com");
                expect(wiql.query).toContain("[System.TeamProject] = 'TestProject'");
                return { workItems: [] };
            });

            await service.getWorkItems(settings);
        });

        it('should build query for created work items', async () => {
            const settings: WorkItemQuerySettings = {
                ...baseSettings,
                queryType: 'created'
            };

            mockWorkItemApi.queryByWiql.mockImplementation(async (wiql: any) => {
                expect(wiql.query).toContain('[System.CreatedBy] = @Me');
                return { workItems: [] };
            });

            await service.getWorkItems(settings);
        });

        it('should build query for mentioned work items', async () => {
            const settings: WorkItemQuerySettings = {
                ...baseSettings,
                queryType: 'mentioned'
            };

            mockWorkItemApi.queryByWiql.mockImplementation(async (wiql: any) => {
                expect(wiql.query).toContain('[System.History] Contains @Me');
                return { workItems: [] };
            });

            await service.getWorkItems(settings);
        });

        it('should use custom query when provided', async () => {
            const customQuery = 'SELECT [System.Id] FROM WorkItems WHERE [System.Title] Contains "test"';
            const settings: WorkItemQuerySettings = {
                ...baseSettings,
                queryType: 'query',
                customQuery
            };

            mockWorkItemApi.queryByWiql.mockImplementation(async (wiql: any) => {
                expect(wiql.query).toBe(customQuery);
                return { workItems: [] };
            });

            await service.getWorkItems(settings);
        });

        it('should filter by states when provided', async () => {
            const settings: WorkItemQuerySettings = {
                ...baseSettings,
                states: ['Active', 'New']
            };

            mockWorkItemApi.queryByWiql.mockImplementation(async (wiql: any) => {
                expect(wiql.query).toContain("([System.State] = 'Active' OR [System.State] = 'New')");
                return { workItems: [] };
            });

            await service.getWorkItems(settings);
        });

        it('should exclude completed items by default', async () => {
            mockWorkItemApi.queryByWiql.mockImplementation(async (wiql: any) => {
                expect(wiql.query).toContain("[System.State] <> 'Closed'");
                expect(wiql.query).toContain("[System.State] <> 'Done'");
                expect(wiql.query).toContain("[System.State] <> 'Removed'");
                return { workItems: [] };
            });

            await service.getWorkItems(baseSettings);
        });

        it('should include completed items when specified', async () => {
            const settings: WorkItemQuerySettings = {
                ...baseSettings,
                includeCompleted: true
            };

            mockWorkItemApi.queryByWiql.mockImplementation(async (wiql: any) => {
                expect(wiql.query).not.toContain("[System.State] <> 'Closed'");
                expect(wiql.query).not.toContain("[System.State] <> 'Done'");
                return { workItems: [] };
            });

            await service.getWorkItems(settings);
        });

        it('should filter by work item types when provided', async () => {
            const settings: WorkItemQuerySettings = {
                ...baseSettings,
                workItemTypes: ['Bug', 'Task']
            };

            mockWorkItemApi.queryByWiql.mockImplementation(async (wiql: any) => {
                expect(wiql.query).toContain("([System.WorkItemType] = 'Bug' OR [System.WorkItemType] = 'Task')");
                return { workItems: [] };
            });

            await service.getWorkItems(settings);
        });
    });

    describe('clearCache', () => {
        it('should clear the cache', async () => {
            const mockQueryResult = { workItems: [{ id: 1 }] };
            const mockWorkItems = [{
                id: 1,
                fields: { 'System.Title': 'Item' }
            }];

            mockWorkItemApi.queryByWiql.mockResolvedValue(mockQueryResult);
            mockWorkItemApi.getWorkItemsBatch.mockResolvedValue(mockWorkItems);

            // First call
            await service.getWorkItems(baseSettings);
            expect(mockWorkItemApi.queryByWiql).toHaveBeenCalledTimes(1);

            // Clear cache
            service.clearCache();

            // Second call (should not use cache)
            await service.getWorkItems(baseSettings);
            expect(mockWorkItemApi.queryByWiql).toHaveBeenCalledTimes(2);
        });
    });

    describe('error handling', () => {
        it('should throw error when work item API is not initialized', async () => {
            (mockClient as any).connection = null;

            await expect(service.getWorkItems(baseSettings)).rejects.toThrow('Failed to connect to Azure DevOps');
        });

        it('should handle work items with missing fields gracefully', async () => {
            const mockQueryResult = { workItems: [{ id: 1 }] };
            const mockWorkItems = [{
                id: 1,
                fields: {} // Empty fields
            }];

            mockWorkItemApi.queryByWiql.mockResolvedValue(mockQueryResult);
            mockWorkItemApi.getWorkItemsBatch.mockResolvedValue(mockWorkItems);

            const result = await service.getWorkItems(baseSettings);

            expect(result[0]).toEqual({
                id: 1,
                title: 'Untitled',
                type: 'Unknown',
                state: 'Unknown',
                assignedTo: undefined,
                priority: undefined,
                url: 'https://dev.azure.com/myorg/TestProject/_workitems/edit/1',
                tags: undefined,
                iterationPath: undefined
            });
        });

        it('should handle tags parsing correctly', async () => {
            const mockQueryResult = { workItems: [{ id: 1 }] };
            const mockWorkItems = [{
                id: 1,
                fields: {
                    'System.Tags': 'tag1; tag2 ; ; tag3 '
                }
            }];

            mockWorkItemApi.queryByWiql.mockResolvedValue(mockQueryResult);
            mockWorkItemApi.getWorkItemsBatch.mockResolvedValue(mockWorkItems);

            const result = await service.getWorkItems(baseSettings);

            expect(result[0].tags).toEqual(['tag1', 'tag2', 'tag3']);
        });
    });
});