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

    beforeAll(() => {
        jest.useFakeTimers();
    });

    afterAll(() => {
        jest.useRealTimers();
    });

    beforeEach(() => {
        // Reset singleton instance BEFORE getting it
        (AzureDevOpsConnectionPool as any).instance = undefined;
        
        // Clear all instances and calls to constructor and all methods
        jest.clearAllMocks();
        
        // Create mock client
        mockClient = {
            connect: jest.fn().mockResolvedValue(undefined),
            disconnect: jest.fn().mockResolvedValue(undefined),
            isConnected: jest.fn().mockReturnValue(true),
            getPipelineService: jest.fn(),
            getPullRequestService: jest.fn(),
            testConnection: jest.fn().mockResolvedValue(true)
        } as unknown as jest.Mocked<AzureDevOpsClient>;
        
        // Mock the constructor to return our mock
        (AzureDevOpsClient as jest.MockedClass<typeof AzureDevOpsClient>).mockImplementation(() => mockClient);
        
        // Get fresh instance after mocking
        pool = AzureDevOpsConnectionPool.getInstance();
    });

    afterEach(async () => {
        // Shutdown pool to clear timers
        await pool.shutdown();
        // Clean up singleton instance
        (AzureDevOpsConnectionPool as any).instance = undefined;
        jest.clearAllTimers();
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
            
            // Fast-forward time past CONNECTION_TIMEOUT (5 minutes)
            jest.advanceTimersByTime(5 * 60 * 1000);
            
            // Now trigger the cleanup interval
            jest.advanceTimersByTime(60 * 1000);
            
            // Let the async cleanup complete
            await Promise.resolve();
            
            // Should have been disconnected after cleanup
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

        it('should reuse connection even if marked as disconnected', async () => {
            // First connection
            const client1 = await pool.getConnection(config);
            
            // Make connection appear invalid (pool doesn't check this)
            mockClient.isConnected.mockReturnValue(false);
            
            // Should still reuse the same connection
            // (validation is responsibility of the client, not the pool)
            const client2 = await pool.getConnection(config);
            
            expect(client1).toBe(client2);
            expect(AzureDevOpsClient).toHaveBeenCalledTimes(1);
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

        it('should not store failed connections', async () => {
            mockClient.connect.mockRejectedValue(new Error('Connection failed'));
            
            try {
                await pool.getConnection(config);
            } catch (error) {
                // Expected error
            }
            
            // Connection should not be stored in pool
            expect(pool.hasConnection(config)).toBe(false);
            
            // Next attempt should create new client
            jest.clearAllMocks();
            mockClient.connect.mockResolvedValue(undefined);
            const client = await pool.getConnection(config);
            expect(AzureDevOpsClient).toHaveBeenCalledTimes(1);
            expect(client).toBe(mockClient);
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
            await pool.shutdown();
            
            // Both should be disconnected
            expect(mockClient.disconnect).toHaveBeenCalledTimes(2);
        });
    });
});