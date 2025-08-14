import { PipelineService, PipelineStatus } from '../pipeline-service';
import { AzureDevOpsClient } from '../azure-devops-client';
import { BuildStatus, BuildResult } from 'azure-devops-node-api/interfaces/BuildInterfaces';
import streamDeck from '@elgato/streamdeck';

jest.mock('../azure-devops-client');
jest.mock('@elgato/streamdeck', () => ({
    __esModule: true,
    default: {
        logger: {
            createScope: jest.fn(() => ({
                debug: jest.fn(),
                info: jest.fn(),
                warn: jest.fn(),
                error: jest.fn()
            }))
        }
    }
}));

describe('PipelineService', () => {
    let service: PipelineService;
    let mockClient: jest.Mocked<AzureDevOpsClient>;
    let mockBuildApi: any;

    beforeEach(() => {
        jest.clearAllMocks();
        
        mockBuildApi = {
            getBuilds: jest.fn(),
            getDefinition: jest.fn()
        };

        mockClient = {
            getBuildApi: jest.fn().mockReturnValue(mockBuildApi),
            getProjectName: jest.fn().mockReturnValue('test-project'),
            retryWithExponentialBackoff: jest.fn((operation) => operation()),
            connect: jest.fn(),
            validateConnection: jest.fn(),
            isConnected: jest.fn(),
            disconnect: jest.fn()
        } as any;

        service = new PipelineService(mockClient);
    });

    describe('getPipelineStatus', () => {
        it('should return pipeline status for successful build', async () => {
            const mockBuild = {
                id: 123,
                buildNumber: '20240101.1',
                status: BuildStatus.Completed,
                result: BuildResult.Succeeded,
                definition: {
                    id: 1,
                    name: 'Test Pipeline'
                },
                startTime: new Date('2024-01-01T10:00:00'),
                finishTime: new Date('2024-01-01T10:30:00'),
                _links: {
                    web: { href: 'https://dev.azure.com/test/build/123' }
                }
            };

            mockBuildApi.getBuilds.mockResolvedValue([mockBuild]);

            const status = await service.getPipelineStatus(1);

            expect(status).toEqual({
                id: 1,
                name: 'Test Pipeline',
                status: PipelineStatus.Succeeded,
                buildNumber: '20240101.1',
                startTime: mockBuild.startTime,
                finishTime: mockBuild.finishTime,
                duration: 1800000, // 30 minutes in ms
                url: 'https://dev.azure.com/test/build/123',
                queueTime: undefined,
                requestedBy: undefined,
                sourceBranch: undefined,
                sourceVersion: undefined
            });
        });

        it('should return unknown status when no builds found', async () => {
            mockBuildApi.getBuilds.mockResolvedValue([]);

            const status = await service.getPipelineStatus(1);

            expect(status).toEqual({
                id: 1,
                name: 'Pipeline 1',
                status: PipelineStatus.Unknown
            });
        });

        it('should use cached value within TTL', async () => {
            const mockBuild = {
                id: 123,
                status: BuildStatus.Completed,
                result: BuildResult.Succeeded,
                definition: { id: 1, name: 'Test Pipeline' }
            };

            mockBuildApi.getBuilds.mockResolvedValue([mockBuild]);

            await service.getPipelineStatus(1);
            await service.getPipelineStatus(1);

            expect(mockBuildApi.getBuilds).toHaveBeenCalledTimes(1);
        });
    });

    describe('getLatestBuild', () => {
        it('should return the latest build', async () => {
            const mockBuild = {
                id: 123,
                buildNumber: '20240101.1',
                status: BuildStatus.Completed,
                result: BuildResult.Succeeded
            };

            mockBuildApi.getBuilds.mockResolvedValue([mockBuild]);

            const build = await service.getLatestBuild(1);

            expect(build).toEqual(mockBuild);
            expect(mockBuildApi.getBuilds).toHaveBeenCalledWith(
                'test-project',
                [1],
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
                1,
                undefined,
                undefined,
                undefined,
                undefined,
                undefined
            );
        });

        it('should return null when no builds found', async () => {
            mockBuildApi.getBuilds.mockResolvedValue([]);

            const build = await service.getLatestBuild(1);

            expect(build).toBeNull();
        });

        it('should handle API errors', async () => {
            mockBuildApi.getBuilds.mockRejectedValue(new Error('API error'));

            await expect(service.getLatestBuild(1)).rejects.toThrow('API error');
        });
    });

    describe('getPipelineRuns', () => {
        it('should return multiple pipeline runs', async () => {
            const mockBuilds = [
                { id: 123, buildNumber: '20240101.1' },
                { id: 122, buildNumber: '20240101.0' }
            ];

            mockBuildApi.getBuilds.mockResolvedValue(mockBuilds);

            const runs = await service.getPipelineRuns(1, 2);

            expect(runs).toEqual(mockBuilds);
            expect(mockBuildApi.getBuilds).toHaveBeenCalledWith(
                'test-project',
                [1],
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
                2
            );
        });

        it('should return empty array when no builds found', async () => {
            mockBuildApi.getBuilds.mockResolvedValue(null);

            const runs = await service.getPipelineRuns(1);

            expect(runs).toEqual([]);
        });
    });

    describe('getPipelineDefinition', () => {
        it('should return pipeline definition', async () => {
            const mockDefinition = {
                id: 1,
                name: 'Test Pipeline',
                path: '\\',
                type: 2
            };

            mockBuildApi.getDefinition.mockResolvedValue(mockDefinition);

            const definition = await service.getPipelineDefinition(1);

            expect(definition).toEqual(mockDefinition);
            expect(mockBuildApi.getDefinition).toHaveBeenCalledWith('test-project', 1);
        });

        it('should return null when definition not found', async () => {
            mockBuildApi.getDefinition.mockResolvedValue(null);

            const definition = await service.getPipelineDefinition(1);

            expect(definition).toBeNull();
        });
    });

    describe('mapBuildStatus', () => {
        it('should map in-progress status', () => {
            const status = service.mapBuildStatus(BuildStatus.InProgress, undefined);
            expect(status).toBe(PipelineStatus.Running);
        });

        it('should map not-started status', () => {
            const status = service.mapBuildStatus(BuildStatus.NotStarted, undefined);
            expect(status).toBe(PipelineStatus.NotStarted);
        });

        it('should map completed succeeded', () => {
            const status = service.mapBuildStatus(BuildStatus.Completed, BuildResult.Succeeded);
            expect(status).toBe(PipelineStatus.Succeeded);
        });

        it('should map completed failed', () => {
            const status = service.mapBuildStatus(BuildStatus.Completed, BuildResult.Failed);
            expect(status).toBe(PipelineStatus.Failed);
        });

        it('should map completed partially succeeded', () => {
            const status = service.mapBuildStatus(BuildStatus.Completed, BuildResult.PartiallySucceeded);
            expect(status).toBe(PipelineStatus.PartiallySucceeded);
        });

        it('should map completed canceled', () => {
            const status = service.mapBuildStatus(BuildStatus.Completed, BuildResult.Canceled);
            expect(status).toBe(PipelineStatus.Canceled);
        });

        it('should map cancelling status', () => {
            const status = service.mapBuildStatus(BuildStatus.Cancelling, undefined);
            expect(status).toBe(PipelineStatus.Canceled);
        });

        it('should return unknown for undefined status', () => {
            const status = service.mapBuildStatus(undefined, undefined);
            expect(status).toBe(PipelineStatus.Unknown);
        });
    });

    describe('cache management', () => {
        it('should clear cache', async () => {
            const mockBuild = {
                id: 123,
                definition: { id: 1, name: 'Test' },
                status: BuildStatus.Completed,
                result: BuildResult.Succeeded
            };

            mockBuildApi.getBuilds.mockResolvedValue([mockBuild]);

            await service.getPipelineStatus(1);
            expect(service.getCacheSize()).toBe(2); // status + build

            service.clearCache();
            expect(service.getCacheSize()).toBe(0);
        });

        it('should expire cache after TTL', async () => {
            const mockBuild = {
                id: 123,
                definition: { id: 1, name: 'Test' },
                status: BuildStatus.Completed,
                result: BuildResult.Succeeded
            };

            mockBuildApi.getBuilds.mockResolvedValue([mockBuild]);

            // Mock Date.now to control time
            const originalDateNow = Date.now;
            let currentTime = 1000000;
            Date.now = jest.fn(() => currentTime);

            await service.getLatestBuild(1);
            
            // Move time forward beyond TTL
            currentTime += 31000;
            
            await service.getLatestBuild(1);
            
            // Should have called API twice (cache expired)
            expect(mockBuildApi.getBuilds).toHaveBeenCalledTimes(2);
            
            // Restore Date.now
            Date.now = originalDateNow;
        });
    });
});