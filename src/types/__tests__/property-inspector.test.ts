import {
    isTestConnectionMessage,
    isGetRepositoriesMessage,
    isGetDataSourceMessage,
    extractMessagePayload,
    TestConnectionMessage,
    GetRepositoriesMessage,
    GetDataSourceMessage,
    ConnectionResultMessage,
    RepositoriesResultMessage,
    DataSourceResultMessage,
    DebugLogMessage,
    DataSourceItem
} from '../property-inspector';

describe('Property Inspector Types', () => {
    describe('isTestConnectionMessage', () => {
        it('should return true for valid test connection message', () => {
            const msg: TestConnectionMessage = {
                event: 'testConnection',
                organizationUrl: 'https://dev.azure.com/test',
                projectName: 'TestProject',
                personalAccessToken: 'token'
            };
            
            expect(isTestConnectionMessage(msg)).toBe(true);
        });

        it('should return true for minimal test connection message', () => {
            const msg = {
                event: 'testConnection'
            };
            
            expect(isTestConnectionMessage(msg)).toBe(true);
        });

        it('should return false for different event type', () => {
            const msg = {
                event: 'getRepositories'
            };
            
            expect(isTestConnectionMessage(msg)).toBe(false);
        });

        it('should return false for null', () => {
            expect(isTestConnectionMessage(null)).toBe(false);
        });

        it('should return false for undefined', () => {
            expect(isTestConnectionMessage(undefined)).toBe(false);
        });

        it('should return false for empty object', () => {
            expect(isTestConnectionMessage({})).toBe(false);
        });

        it('should return false for non-object', () => {
            expect(isTestConnectionMessage('testConnection')).toBe(false);
            expect(isTestConnectionMessage(123)).toBe(false);
            expect(isTestConnectionMessage(true)).toBe(false);
        });
    });

    describe('isGetRepositoriesMessage', () => {
        it('should return true for valid get repositories message', () => {
            const msg: GetRepositoriesMessage = {
                event: 'getRepositories',
                organizationUrl: 'https://dev.azure.com/test',
                projectName: 'TestProject',
                personalAccessToken: 'token'
            };
            
            expect(isGetRepositoriesMessage(msg)).toBe(true);
        });

        it('should return true for minimal get repositories message', () => {
            const msg = {
                event: 'getRepositories'
            };
            
            expect(isGetRepositoriesMessage(msg)).toBe(true);
        });

        it('should return false for different event type', () => {
            const msg = {
                event: 'testConnection'
            };
            
            expect(isGetRepositoriesMessage(msg)).toBe(false);
        });

        it('should return false for null', () => {
            expect(isGetRepositoriesMessage(null)).toBe(false);
        });

        it('should return false for undefined', () => {
            expect(isGetRepositoriesMessage(undefined)).toBe(false);
        });

        it('should return false for empty object', () => {
            expect(isGetRepositoriesMessage({})).toBe(false);
        });
    });

    describe('isGetDataSourceMessage', () => {
        it('should return true for valid data source message', () => {
            const msg: GetDataSourceMessage = {
                event: 'getDataSource',
                datasource: 'pipelines',
                payload: { filter: 'active' }
            };
            
            expect(isGetDataSourceMessage(msg)).toBe(true);
        });

        it('should return true for minimal data source message', () => {
            const msg = {
                event: 'getDataSource',
                datasource: 'repositories'
            };
            
            expect(isGetDataSourceMessage(msg)).toBe(true);
        });

        it('should return false when datasource is missing', () => {
            const msg = {
                event: 'getDataSource'
            };
            
            expect(isGetDataSourceMessage(msg)).toBe(false);
        });

        it('should return false when datasource is not a string', () => {
            const msg = {
                event: 'getDataSource',
                datasource: 123
            };
            
            expect(isGetDataSourceMessage(msg)).toBe(false);
        });

        it('should return false when datasource is null', () => {
            const msg = {
                event: 'getDataSource',
                datasource: null
            };
            
            expect(isGetDataSourceMessage(msg)).toBe(false);
        });

        it('should return false for different event type', () => {
            const msg = {
                event: 'testConnection',
                datasource: 'pipelines'
            };
            
            expect(isGetDataSourceMessage(msg)).toBe(false);
        });

        it('should return false for null', () => {
            expect(isGetDataSourceMessage(null)).toBe(false);
        });

        it('should return false for undefined', () => {
            expect(isGetDataSourceMessage(undefined)).toBe(false);
        });

        it('should return false for empty object', () => {
            expect(isGetDataSourceMessage({})).toBe(false);
        });
    });

    describe('extractMessagePayload', () => {
        it('should extract double nested payload', () => {
            const msg = {
                payload: {
                    payload: {
                        data: 'test-data',
                        value: 123
                    }
                }
            };
            
            const result = extractMessagePayload(msg);
            
            expect(result).toEqual({
                data: 'test-data',
                value: 123
            });
        });

        it('should extract single nested payload', () => {
            const msg = {
                payload: {
                    data: 'test-data',
                    value: 456
                }
            };
            
            const result = extractMessagePayload(msg);
            
            expect(result).toEqual({
                data: 'test-data',
                value: 456
            });
        });

        it('should return message as-is when no payload', () => {
            const msg = {
                data: 'test-data',
                value: 789
            };
            
            const result = extractMessagePayload(msg);
            
            expect(result).toEqual(msg);
        });

        it('should handle null payload', () => {
            const msg = {
                payload: null
            };
            
            const result = extractMessagePayload(msg);
            
            expect(result).toEqual(msg); // Returns the whole message when payload is falsy
        });

        it('should handle undefined payload', () => {
            const msg = {
                payload: undefined
            };
            
            const result = extractMessagePayload(msg);
            
            expect(result).toEqual(msg);
        });

        it('should handle null message', () => {
            const result = extractMessagePayload(null);
            
            expect(result).toBeNull();
        });

        it('should handle undefined message', () => {
            const result = extractMessagePayload(undefined);
            
            expect(result).toBeUndefined();
        });

        it('should handle primitive values', () => {
            expect(extractMessagePayload('string')).toBe('string');
            expect(extractMessagePayload(123)).toBe(123);
            expect(extractMessagePayload(true)).toBe(true);
        });

        it('should handle empty object', () => {
            const result = extractMessagePayload({});
            
            expect(result).toEqual({});
        });

        it('should prefer double nested over single nested payload', () => {
            const msg = {
                payload: {
                    data: 'outer',
                    payload: {
                        data: 'inner'
                    }
                }
            };
            
            const result = extractMessagePayload(msg);
            
            expect(result).toEqual({
                data: 'inner'
            });
        });
    });

    describe('Type Definitions', () => {
        it('should properly type ConnectionResultMessage', () => {
            const msg: ConnectionResultMessage = {
                event: 'connectionResult',
                success: true,
                message: 'Connected successfully',
                details: {
                    pipelineInfo: {
                        id: 123,
                        name: 'CI Pipeline',
                        status: 'completed' as any,
                        buildNumber: '2024.1.0',
                        startTime: new Date(),
                        finishTime: new Date(),
                        duration: 300,
                        url: 'https://dev.azure.com/test/_build',
                        queueTime: new Date(),
                        requestedBy: 'Test User',
                        sourceBranch: 'refs/heads/main',
                        sourceVersion: 'abc123'
                    },
                    repositoryCount: 5
                }
            };
            
            expect(msg.event).toBe('connectionResult');
            expect(msg.success).toBe(true);
            expect(msg.details?.repositoryCount).toBe(5);
        });

        it('should properly type RepositoriesResultMessage', () => {
            const msg: RepositoriesResultMessage = {
                event: 'repositoriesResult',
                success: true,
                repositories: [
                    {
                        id: 'repo-1',
                        name: 'TestRepo'
                    }
                ],
                message: 'Found 1 repository'
            };
            
            expect(msg.event).toBe('repositoriesResult');
            expect(msg.repositories?.length).toBe(1);
            expect(msg.repositories?.[0].name).toBe('TestRepo');
        });

        it('should properly type DataSourceResultMessage', () => {
            const msg: DataSourceResultMessage = {
                event: 'dataSourceResult',
                datasource: 'pipelines',
                items: [
                    {
                        value: '1',
                        label: 'CI Pipeline'
                    },
                    {
                        value: '2',
                        label: 'CD Pipeline',
                        disabled: true
                    },
                    {
                        value: 'group',
                        label: 'Pipeline Group',
                        children: [
                            {
                                value: '3',
                                label: 'Sub Pipeline'
                            }
                        ]
                    }
                ]
            };
            
            expect(msg.event).toBe('dataSourceResult');
            expect(msg.datasource).toBe('pipelines');
            expect(msg.items.length).toBe(3);
            expect(msg.items[2].children?.length).toBe(1);
        });

        it('should properly type DebugLogMessage', () => {
            const msg: DebugLogMessage = {
                event: 'debugLog',
                message: 'Debug information',
                data: {
                    timestamp: Date.now(),
                    level: 'info',
                    context: 'test'
                }
            };
            
            expect(msg.event).toBe('debugLog');
            expect(msg.message).toBe('Debug information');
            expect(msg.data).toBeDefined();
        });

        it('should properly type DataSourceItem', () => {
            const item: DataSourceItem = {
                value: 'item-1',
                label: 'Item 1',
                disabled: false,
                children: [
                    {
                        value: 'child-1',
                        label: 'Child 1'
                    },
                    {
                        value: 'child-2',
                        label: 'Child 2',
                        disabled: true
                    }
                ]
            };
            
            expect(item.value).toBe('item-1');
            expect(item.children?.length).toBe(2);
            expect(item.children?.[1].disabled).toBe(true);
        });
    });
});