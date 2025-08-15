/**
 * Tests for AzureDevOpsConnectionPool.
 * Verifies connection pooling, reference counting, and cleanup.
 */

import { AzureDevOpsConnectionPool } from '../connection-pool';
import { AzureDevOpsClient } from '../azure-devops-client';

// Mock the AzureDevOpsClient
jest.mock('../azure-devops-client');

describe('AzureDevOpsConnectionPool', () => {
    let pool: AzureDevOpsConnectionPool;
    let mockClient: jest.Mocked<AzureDevOpsClient>;

    beforeEach(() => {
        // Clear all instances and calls to constructor and all methods
        jest.clearAllMocks();
        
        // Get fresh instance (singleton is reset between tests)
        pool = AzureDevOpsConnectionPool.getInstance();
        
        // Create mock client
        mockClient = new AzureDevOpsClient() as jest.Mocked<AzureDevOpsClient>;
        mockClient.connect = jest.fn().mockResolvedValue(undefined);
        mockClient.disconnect = jest.fn().mockResolvedValue(undefined);
        mockClient.isConnected = jest.fn().mockReturnValue(true);
        
        // Mock the constructor to return our mock
        (AzureDevOpsClient as jest.MockedClass<typeof AzureDevOpsClient>).mockImplementation(() => mockClient);
    });

    afterEach(() => {
        // Clean up singleton instance
        (AzureDevOpsConnectionPool as any).instance = undefined;
    });

    describe('Singleton Pattern', () => {
        it('should return the same instance', () => {
            const instance1 = AzureDevOpsConnectionPool.getInstance();
            const instance2 = AzureDevOpsConnectionPool.getInstance();
            expect(instance1).toBe(instance2);
        });
    });

    describe('Connection Management', () => {
        const config = {
            organizationUrl: 'https://dev.azure.com/test',
            personalAccessToken: 'test-token',
            projectName: 'TestProject'
        };

        it('should create new connection for first request', async () => {
            const client = await pool.getConnection(config);
            
            expect(AzureDevOpsClient).toHaveBeenCalledTimes(1);
            expect(mockClient.connect).toHaveBeenCalledWith(config);
            expect(client).toBe(mockClient);
        });

        it('should reuse existing connection for same config', async () => {
            const client1 = await pool.getConnection(config);
            const client2 = await pool.getConnection(config);
            
            expect(AzureDevOpsClient).toHaveBeenCalledTimes(1);
            expect(mockClient.connect).toHaveBeenCalledTimes(1);
            expect(client1).toBe(client2);
        });

        it('should create different connections for different configs', async () => {
            const config2 = {
                organizationUrl: 'https://dev.azure.com/other',
                personalAccessToken: 'other-token',
                projectName: 'OtherProject'
            };

            const client1 = await pool.getConnection(config);
            const client2 = await pool.getConnection(config2);
            
            expect(AzureDevOpsClient).toHaveBeenCalledTimes(2);
            expect(client1).toBe(mockClient);
            // Note: Both will be the same mock in this test setup
        });
    });

    describe('Reference Counting', () => {
        const config = {
            organizationUrl: 'https://dev.azure.com/test',
            personalAccessToken: 'test-token',
            projectName: 'TestProject'
        };

        it('should increment reference count on getConnection', async () => {
            await pool.getConnection(config);
            await pool.getConnection(config);
            
            // Connection should still exist after one release
            pool.releaseConnection(config);
            const client = await pool.getConnection(config);
            
            expect(AzureDevOpsClient).toHaveBeenCalledTimes(1); // Still using same connection
            expect(client).toBe(mockClient);
        });

        it('should disconnect and remove connection when reference count reaches zero', async () => {
            await pool.getConnection(config);
            await pool.getConnection(config);
            
            // Release both references
            pool.releaseConnection(config);
            pool.releaseConnection(config);
            
            // Should have been disconnected
            expect(mockClient.disconnect).toHaveBeenCalledTimes(1);
            
            // Next getConnection should create new client
            jest.clearAllMocks();
            await pool.getConnection(config);
            expect(AzureDevOpsClient).toHaveBeenCalledTimes(1);
        });

        it('should handle release of non-existent connection gracefully', () => {
            const config = {
                organizationUrl: 'https://dev.azure.com/nonexistent',
                personalAccessToken: 'token',
                projectName: 'Project'
            };
            
            // Should not throw
            expect(() => pool.releaseConnection(config)).not.toThrow();
        });
    });

    describe('Connection Validation', () => {
        const config = {
            organizationUrl: 'https://dev.azure.com/test',
            personalAccessToken: 'test-token',
            projectName: 'TestProject'
        };

        it('should reconnect if existing connection is not valid', async () => {
            // First connection
            await pool.getConnection(config);
            
            // Make connection invalid
            mockClient.isConnected.mockReturnValue(false);
            
            // Should reconnect
            jest.clearAllMocks();
            await pool.getConnection(config);
            
            expect(mockClient.disconnect).toHaveBeenCalledTimes(1);
            expect(AzureDevOpsClient).toHaveBeenCalledTimes(1);
            expect(mockClient.connect).toHaveBeenCalledTimes(1);
        });
    });

    describe('Error Handling', () => {
        const config = {
            organizationUrl: 'https://dev.azure.com/test',
            personalAccessToken: 'test-token',
            projectName: 'TestProject'
        };

        it('should handle connection errors', async () => {
            mockClient.connect.mockRejectedValue(new Error('Connection failed'));
            
            await expect(pool.getConnection(config)).rejects.toThrow('Connection failed');
        });

        it('should clean up on connection error', async () => {
            mockClient.connect.mockRejectedValue(new Error('Connection failed'));
            
            try {
                await pool.getConnection(config);
            } catch (error) {
                // Expected error
            }
            
            // Should have cleaned up
            expect(mockClient.disconnect).toHaveBeenCalledTimes(1);
            
            // Next attempt should create new client
            jest.clearAllMocks();
            mockClient.connect.mockResolvedValue(undefined);
            await pool.getConnection(config);
            expect(AzureDevOpsClient).toHaveBeenCalledTimes(1);
        });
    });

    describe('Cleanup', () => {
        it('should disconnect all connections on cleanup', async () => {
            const config1 = {
                organizationUrl: 'https://dev.azure.com/test1',
                personalAccessToken: 'token1',
                projectName: 'Project1'
            };
            
            const config2 = {
                organizationUrl: 'https://dev.azure.com/test2',
                personalAccessToken: 'token2',
                projectName: 'Project2'
            };
            
            await pool.getConnection(config1);
            await pool.getConnection(config2);
            
            // Cleanup all
            await pool.cleanup();
            
            // Both should be disconnected
            expect(mockClient.disconnect).toHaveBeenCalledTimes(2);
        });
    });
});