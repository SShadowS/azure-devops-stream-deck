import { AzureDevOpsClient } from '../azure-devops-client';
import * as azdev from 'azure-devops-node-api';
import streamDeck from '@elgato/streamdeck';

jest.mock('azure-devops-node-api');
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

describe('AzureDevOpsClient', () => {
    let client: AzureDevOpsClient;
    let mockBuildApi: any;
    let mockGitApi: any;
    let mockWebApi: any;

    beforeEach(() => {
        jest.clearAllMocks();
        client = new AzureDevOpsClient();
        
        mockBuildApi = {
            getBuilds: jest.fn()
        };
        
        mockGitApi = {
            getRepositories: jest.fn(),
            getPullRequests: jest.fn()
        };
        
        mockWebApi = {
            getBuildApi: jest.fn().mockResolvedValue(mockBuildApi),
            getGitApi: jest.fn().mockResolvedValue(mockGitApi)
        };
        
        (azdev.WebApi as unknown as jest.Mock) = jest.fn().mockImplementation(() => mockWebApi);
        (azdev.getPersonalAccessTokenHandler as jest.Mock) = jest.fn().mockReturnValue({});
    });

    describe('connect', () => {
        const validConfig = {
            organizationUrl: 'https://dev.azure.com/testorg',
            personalAccessToken: 'test-token',
            projectName: 'test-project'
        };

        it('should connect successfully with valid configuration', async () => {
            mockBuildApi.getBuilds.mockResolvedValue([{ id: 1 }]);
            
            await client.connect(validConfig);
            
            expect(azdev.getPersonalAccessTokenHandler).toHaveBeenCalledWith('test-token');
            expect(azdev.WebApi).toHaveBeenCalledWith('https://dev.azure.com/testorg', expect.any(Object));
            expect(client.isConnected()).toBe(true);
        });

        it('should throw error with missing configuration', async () => {
            const invalidConfig = {
                organizationUrl: '',
                personalAccessToken: 'test-token',
                projectName: 'test-project'
            };

            await expect(client.connect(invalidConfig)).rejects.toThrow(
                'Missing required configuration: organizationUrl, personalAccessToken, or projectName'
            );
        });

        it('should handle connection failure', async () => {
            mockWebApi.getBuildApi.mockRejectedValue(new Error('Connection failed'));
            
            await expect(client.connect(validConfig)).rejects.toThrow('Connection failed');
            expect(client.isConnected()).toBe(false);
        });

        it('should prevent rapid reconnection attempts', async () => {
            mockBuildApi.getBuilds.mockRejectedValue(new Error('API error'));
            
            try {
                await client.connect(validConfig);
            } catch (e) {
                // First attempt fails
            }
            
            await expect(client.connect(validConfig)).rejects.toThrow(
                'Connection attempt too soon after previous failure'
            );
        });
    });

    describe('validateConnection', () => {
        it('should validate connection successfully', async () => {
            const config = {
                organizationUrl: 'https://dev.azure.com/testorg',
                personalAccessToken: 'test-token',
                projectName: 'test-project'
            };

            mockBuildApi.getBuilds.mockResolvedValue([{ id: 1 }]);
            await client.connect(config);
            
            const isValid = await client.validateConnection();
            
            expect(isValid).toBe(true);
            expect(mockBuildApi.getBuilds).toHaveBeenCalledWith(
                'test-project',
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
                undefined,
                1
            );
        });

        it('should throw error when not connected', async () => {
            await expect(client.validateConnection()).rejects.toThrow(
                'Client not connected. Call connect() first.'
            );
        });

        it('should handle validation failure', async () => {
            const config = {
                organizationUrl: 'https://dev.azure.com/testorg',
                personalAccessToken: 'test-token',
                projectName: 'test-project'
            };

            mockBuildApi.getBuilds.mockResolvedValueOnce([]).mockRejectedValueOnce(new Error('API error'));
            await client.connect(config);
            
            mockBuildApi.getBuilds.mockRejectedValue(new Error('API error'));
            await expect(client.validateConnection()).rejects.toThrow(
                'Failed to validate connection: API error'
            );
        });
    });

    describe('getBuildApi', () => {
        it('should return build API when connected', async () => {
            const config = {
                organizationUrl: 'https://dev.azure.com/testorg',
                personalAccessToken: 'test-token',
                projectName: 'test-project'
            };

            mockBuildApi.getBuilds.mockResolvedValue([]);
            await client.connect(config);
            
            const api = client.getBuildApi();
            expect(api).toBe(mockBuildApi);
        });

        it('should throw error when not connected', () => {
            expect(() => client.getBuildApi()).toThrow(
                'Client not connected. Call connect() first.'
            );
        });
    });

    describe('getProjectName', () => {
        it('should return project name when configured', async () => {
            const config = {
                organizationUrl: 'https://dev.azure.com/testorg',
                personalAccessToken: 'test-token',
                projectName: 'test-project'
            };

            mockBuildApi.getBuilds.mockResolvedValue([]);
            await client.connect(config);
            
            expect(client.getProjectName()).toBe('test-project');
        });

        it('should throw error when not configured', () => {
            expect(() => client.getProjectName()).toThrow('Client not configured');
        });
    });

    describe('disconnect', () => {
        it('should disconnect successfully', async () => {
            const config = {
                organizationUrl: 'https://dev.azure.com/testorg',
                personalAccessToken: 'test-token',
                projectName: 'test-project'
            };

            mockBuildApi.getBuilds.mockResolvedValue([]);
            await client.connect(config);
            
            client.disconnect();
            
            expect(client.isConnected()).toBe(false);
            expect(() => client.getBuildApi()).toThrow();
        });
    });

    describe('retryWithExponentialBackoff', () => {
        it('should succeed on first attempt', async () => {
            const operation = jest.fn().mockResolvedValue('success');
            
            const result = await client.retryWithExponentialBackoff(operation);
            
            expect(result).toBe('success');
            expect(operation).toHaveBeenCalledTimes(1);
        });

        it('should retry and succeed on second attempt', async () => {
            const operation = jest.fn()
                .mockRejectedValueOnce(new Error('First failure'))
                .mockResolvedValueOnce('success');
            
            const result = await client.retryWithExponentialBackoff(operation, 3, 10);
            
            expect(result).toBe('success');
            expect(operation).toHaveBeenCalledTimes(2);
        });

        it('should fail after max retries', async () => {
            const operation = jest.fn().mockRejectedValue(new Error('Persistent failure'));
            
            await expect(
                client.retryWithExponentialBackoff(operation, 2, 10)
            ).rejects.toThrow('Persistent failure');
            
            expect(operation).toHaveBeenCalledTimes(2);
        });
    });
});