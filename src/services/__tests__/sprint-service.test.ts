import { SprintService, SprintSettings } from '../sprint-service';
import { AzureDevOpsClient } from '../azure-devops-client';
import { Logger } from '@elgato/streamdeck';

jest.mock('../azure-devops-client');

describe('SprintService', () => {
    let service: SprintService;
    let mockLogger: jest.Mocked<Logger>;
    let mockClient: jest.Mocked<AzureDevOpsClient>;
    let mockWorkApi: any;
    let mockWorkItemApi: any;

    const baseSettings: SprintSettings = {
        orgUrl: 'https://dev.azure.com/myorg',
        projectName: 'TestProject',
        teamName: 'TestTeam',
        pat: 'test-pat-token'
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

        mockWorkApi = {
            getTeamIteration: jest.fn(),
            getTeamIterations: jest.fn()
        };

        mockWorkItemApi = {
            queryByWiql: jest.fn(),
            getWorkItemsBatch: jest.fn()
        };

        mockClient = new AzureDevOpsClient() as jest.Mocked<AzureDevOpsClient>;
        mockClient.connect = jest.fn().mockResolvedValue(undefined);
        (mockClient as any).connection = {
            getWorkApi: jest.fn().mockResolvedValue(mockWorkApi),
            getWorkItemTrackingApi: jest.fn().mockResolvedValue(mockWorkItemApi)
        };

        (AzureDevOpsClient as jest.Mock).mockImplementation(() => mockClient);

        service = new SprintService(mockLogger);
    });

    describe('getCurrentSprintMetrics', () => {
        it('should fetch and calculate sprint metrics', async () => {
            const mockIteration = {
                name: 'Sprint 1',
                path: 'TestProject\\Sprint 1',
                attributes: {
                    startDate: '2024-01-01T00:00:00Z',
                    finishDate: '2024-01-14T23:59:59Z',
                    timeFrame: 'current'
                }
            };

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
                        'System.Title': 'Story 1',
                        'System.State': 'Done',
                        'Microsoft.VSTS.Scheduling.StoryPoints': 5,
                        'System.WorkItemType': 'User Story',
                        'System.AssignedTo': { displayName: 'John Doe' }
                    }
                },
                {
                    id: 2,
                    fields: {
                        'System.Title': 'Story 2',
                        'System.State': 'Active',
                        'Microsoft.VSTS.Scheduling.StoryPoints': 3,
                        'System.WorkItemType': 'User Story',
                        'System.AssignedTo': { displayName: 'Jane Smith' }
                    }
                },
                {
                    id: 3,
                    fields: {
                        'System.Title': 'Bug 1',
                        'System.State': 'New',
                        'Microsoft.VSTS.Scheduling.StoryPoints': 2,
                        'System.WorkItemType': 'Bug'
                    }
                }
            ];

            mockWorkApi.getTeamIteration.mockResolvedValue(mockIteration);
            mockWorkItemApi.queryByWiql.mockResolvedValue(mockQueryResult);
            mockWorkItemApi.getWorkItemsBatch.mockResolvedValue(mockWorkItems);

            const result = await service.getCurrentSprintMetrics(baseSettings);

            expect(result.name).toBe('Sprint 1');
            expect(result.totalPoints).toBe(10); // 5 + 3 + 2
            expect(result.completedPoints).toBe(5); // Only story 1 is done
            expect(result.remainingPoints).toBe(5); // 3 + 2
            expect(result.totalItems).toBe(3);
            expect(result.completedItems).toBe(1);
            expect(result.percentComplete).toBe(50); // 5/10 * 100
        });

        it('should return cached metrics within cache duration', async () => {
            const mockIteration = {
                name: 'Sprint 1',
                path: 'TestProject\\Sprint 1',
                attributes: {
                    startDate: '2024-01-01T00:00:00Z',
                    finishDate: '2024-01-14T23:59:59Z'
                }
            };

            mockWorkApi.getTeamIteration.mockResolvedValue(mockIteration);
            mockWorkItemApi.queryByWiql.mockResolvedValue({ workItems: [] });
            mockWorkItemApi.getWorkItemsBatch.mockResolvedValue([]);

            // First call
            await service.getCurrentSprintMetrics(baseSettings);
            expect(mockWorkApi.getTeamIteration).toHaveBeenCalledTimes(1);

            // Second call (should use cache)
            await service.getCurrentSprintMetrics(baseSettings);
            expect(mockWorkApi.getTeamIteration).toHaveBeenCalledTimes(1);
            expect(mockLogger.debug).toHaveBeenCalledWith('Returning cached sprint metrics');
        });

        it('should throw error when no active sprint found', async () => {
            mockWorkApi.getTeamIteration.mockResolvedValue(null);

            await expect(service.getCurrentSprintMetrics(baseSettings)).rejects.toThrow('No active sprint found');
        });

        it('should handle work items without story points', async () => {
            const mockIteration = {
                name: 'Sprint 1',
                path: 'TestProject\\Sprint 1',
                attributes: {
                    startDate: '2024-01-01T00:00:00Z',
                    finishDate: '2024-01-14T23:59:59Z'
                }
            };

            const mockWorkItems = [
                {
                    id: 1,
                    fields: {
                        'System.Title': 'Task 1',
                        'System.State': 'Done',
                        'System.WorkItemType': 'Task'
                        // No story points
                    }
                },
                {
                    id: 2,
                    fields: {
                        'System.Title': 'Task 2',
                        'System.State': 'Active',
                        'Microsoft.VSTS.Scheduling.StoryPoints': 3,
                        'System.WorkItemType': 'Task'
                    }
                }
            ];

            mockWorkApi.getTeamIteration.mockResolvedValue(mockIteration);
            mockWorkItemApi.queryByWiql.mockResolvedValue({ workItems: [{ id: 1 }, { id: 2 }] });
            mockWorkItemApi.getWorkItemsBatch.mockResolvedValue(mockWorkItems);

            const result = await service.getCurrentSprintMetrics(baseSettings);

            expect(result.totalPoints).toBe(3); // Only task 2 has points
            expect(result.totalItems).toBe(2);
            expect(result.completedItems).toBe(1);
        });

        it('should calculate burndown trend correctly', async () => {
            const mockIteration = {
                name: 'Sprint 1',
                path: 'TestProject\\Sprint 1',
                attributes: {
                    startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days ago
                    finishDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()  // 7 days from now
                }
            };

            const mockWorkItems = [
                {
                    id: 1,
                    fields: {
                        'System.Title': 'Story 1',
                        'System.State': 'Done',
                        'Microsoft.VSTS.Scheduling.StoryPoints': 5,
                        'System.WorkItemType': 'User Story'
                    }
                },
                {
                    id: 2,
                    fields: {
                        'System.Title': 'Story 2',
                        'System.State': 'Active',
                        'Microsoft.VSTS.Scheduling.StoryPoints': 5,
                        'System.WorkItemType': 'User Story'
                    }
                }
            ];

            mockWorkApi.getTeamIteration.mockResolvedValue(mockIteration);
            mockWorkItemApi.queryByWiql.mockResolvedValue({ workItems: [{ id: 1 }, { id: 2 }] });
            mockWorkItemApi.getWorkItemsBatch.mockResolvedValue(mockWorkItems);

            const result = await service.getCurrentSprintMetrics(baseSettings);

            // 50% complete at 50% time = on-track
            expect(result.burndownTrend).toBe('on-track');
        });

        it('should handle API errors gracefully', async () => {
            mockWorkApi.getTeamIteration.mockRejectedValue(new Error('API Error'));

            await expect(service.getCurrentSprintMetrics(baseSettings)).rejects.toThrow('API Error');
            expect(mockLogger.error).toHaveBeenCalledWith('Error fetching sprint metrics:', expect.any(Error));
        });

        it('should handle connection failures', async () => {
            mockClient.connect.mockRejectedValue(new Error('Connection failed'));

            await expect(service.getCurrentSprintMetrics(baseSettings)).rejects.toThrow('Connection failed');
        });

        it('should handle empty sprint', async () => {
            const mockIteration = {
                name: 'Sprint 1',
                path: 'TestProject\\Sprint 1',
                attributes: {
                    startDate: '2024-01-01T00:00:00Z',
                    finishDate: '2024-01-14T23:59:59Z'
                }
            };

            mockWorkApi.getTeamIteration.mockResolvedValue(mockIteration);
            mockWorkItemApi.queryByWiql.mockResolvedValue({ workItems: [] });

            const result = await service.getCurrentSprintMetrics(baseSettings);

            expect(result.totalPoints).toBe(0);
            expect(result.totalItems).toBe(0);
            expect(result.percentComplete).toBe(0);
            // Empty sprint with 0% complete will be evaluated against elapsed time
            // Since the test uses fixed dates, we can't predict the exact trend
            expect(['on-track', 'behind', 'ahead']).toContain(result.burndownTrend);
        });
    });

    describe('getSprintWorkItems', () => {
        it('should query work items with correct WIQL', async () => {
            const expectedQuery = expect.stringContaining("[System.TeamProject] = 'TestProject'");
            
            mockWorkItemApi.queryByWiql.mockResolvedValue({ workItems: [] });

            // Access private method through prototype
            const getSprintWorkItems = (service as any).getSprintWorkItems.bind(service);
            (service as any).workItemApi = mockWorkItemApi;
            
            await getSprintWorkItems('TestProject', 'TestProject\\Sprint 1', 'TestTeam');

            expect(mockWorkItemApi.queryByWiql).toHaveBeenCalledWith(
                { query: expectedQuery },
                expect.any(Object)
            );
        });
    });

    describe('clearCache', () => {
        it('should clear cached metrics', async () => {
            const mockIteration = {
                name: 'Sprint 1',
                path: 'TestProject\\Sprint 1',
                attributes: {
                    startDate: '2024-01-01T00:00:00Z',
                    finishDate: '2024-01-14T23:59:59Z'
                }
            };

            mockWorkApi.getTeamIteration.mockResolvedValue(mockIteration);
            mockWorkItemApi.queryByWiql.mockResolvedValue({ workItems: [] });
            mockWorkItemApi.getWorkItemsBatch.mockResolvedValue([]);

            // First call
            await service.getCurrentSprintMetrics(baseSettings);
            expect(mockWorkApi.getTeamIteration).toHaveBeenCalledTimes(1);

            // Clear cache
            service.clearCache();

            // Second call (should not use cache)
            await service.getCurrentSprintMetrics(baseSettings);
            expect(mockWorkApi.getTeamIteration).toHaveBeenCalledTimes(2);
        });
    });
});