import streamDeck from '@elgato/streamdeck';
import { AzureDevOpsClient, AzureDevOpsConfig } from './azure-devops-client';
import { ProfileManager } from './profile-manager';
import { ProfileChangeEvent } from '../types/profiles';

interface ConnectionInfo {
    client: AzureDevOpsClient;
    refCount: number;
    lastUsed: Date;
    config: AzureDevOpsConfig;
    profileId?: string; // Track which profile this connection is for
}

/**
 * Manages a pool of Azure DevOps client connections with reference counting.
 * Implements singleton pattern to ensure connections are shared across actions.
 */
export class AzureDevOpsConnectionPool {
    private static instance: AzureDevOpsConnectionPool;
    private connections = new Map<string, ConnectionInfo>();
    private logger = streamDeck.logger.createScope('ConnectionPool');
    private cleanupInterval: NodeJS.Timeout | null = null;
    private readonly CONNECTION_TIMEOUT = 5 * 60 * 1000; // 5 minutes
    private readonly CLEANUP_INTERVAL = 60 * 1000; // 1 minute

    private constructor() {
        this.startCleanupTimer();
        this.setupProfileChangeListener();
    }

    /**
     * Gets the singleton instance of the connection pool.
     */
    static getInstance(): AzureDevOpsConnectionPool {
        if (!this.instance) {
            this.instance = new AzureDevOpsConnectionPool();
        }
        return this.instance;
    }

    /**
     * Gets a connection from the pool or creates a new one.
     * Increments reference count for the connection.
     */
    async getConnection(config: AzureDevOpsConfig): Promise<AzureDevOpsClient> {
        const key = this.getConnectionKey(config);
        
        this.logger.debug('Getting connection', { 
            key, 
            exists: this.connections.has(key),
            totalConnections: this.connections.size 
        });

        if (this.connections.has(key)) {
            const conn = this.connections.get(key)!;
            conn.refCount++;
            conn.lastUsed = new Date();
            
            this.logger.debug('Reusing existing connection', { 
                key, 
                refCount: conn.refCount 
            });
            
            return conn.client;
        }

        try {
            const client = new AzureDevOpsClient();
            await client.connect(config);
            
            const connectionInfo: ConnectionInfo = {
                client,
                refCount: 1,
                lastUsed: new Date(),
                config
            };
            
            this.connections.set(key, connectionInfo);
            
            this.logger.info('Created new connection', { 
                key, 
                totalConnections: this.connections.size 
            });
            
            return client;
        } catch (error) {
            this.logger.error('Failed to create connection', { key, error });
            throw error;
        }
    }

    /**
     * Gets a connection using a profile ID.
     * The profile configuration is fetched from ProfileManager.
     */
    async getConnectionByProfile(profileId: string): Promise<AzureDevOpsClient | null> {
        const profileManager = ProfileManager.getInstance();
        const config = await profileManager.getDecryptedConfig(profileId);
        
        if (!config) {
            this.logger.error('Profile not found', { profileId });
            return null;
        }

        // Use profile ID as the key for profile-based connections
        const key = `profile:${profileId}`;
        
        this.logger.debug('Getting connection by profile', { 
            profileId, 
            key,
            exists: this.connections.has(key),
            totalConnections: this.connections.size 
        });

        if (this.connections.has(key)) {
            const conn = this.connections.get(key)!;
            conn.refCount++;
            conn.lastUsed = new Date();
            
            this.logger.debug('Reusing existing profile connection', { 
                profileId, 
                refCount: conn.refCount 
            });
            
            return conn.client;
        }

        try {
            const client = new AzureDevOpsClient();
            await client.connect(config);
            
            const connectionInfo: ConnectionInfo = {
                client,
                refCount: 1,
                lastUsed: new Date(),
                config,
                profileId
            };
            
            this.connections.set(key, connectionInfo);
            
            this.logger.info('Created new profile connection', { 
                profileId, 
                totalConnections: this.connections.size 
            });
            
            return client;
        } catch (error) {
            this.logger.error('Failed to create profile connection', { profileId, error });
            throw error;
        }
    }

    /**
     * Releases a profile-based connection.
     */
    releaseProfileConnection(profileId: string): void {
        const key = `profile:${profileId}`;
        const conn = this.connections.get(key);
        
        if (conn) {
            conn.refCount--;
            conn.lastUsed = new Date();
            
            this.logger.debug('Released profile connection', { 
                profileId,
                refCount: conn.refCount 
            });
            
            if (conn.refCount <= 0) {
                this.logger.debug('Profile connection eligible for cleanup', { profileId });
            }
        }
    }

    /**
     * Invalidates connections for a specific profile.
     * Called when a profile is updated or deleted.
     */
    invalidateProfileConnections(profileId: string): void {
        const key = `profile:${profileId}`;
        const conn = this.connections.get(key);
        
        if (conn) {
            this.logger.info('Invalidating profile connection', { 
                profileId,
                refCount: conn.refCount 
            });
            
            // Disconnect the client
            conn.client.disconnect().catch(error => {
                this.logger.error('Error disconnecting client', { profileId, error });
            });
            
            // Remove from pool
            this.connections.delete(key);
        }
    }

    /**
     * Sets up listener for profile changes to invalidate connections.
     */
    private setupProfileChangeListener(): void {
        const profileManager = ProfileManager.getInstance();
        
        profileManager.onProfileChange((event: ProfileChangeEvent) => {
            if (event.type === 'updated' || event.type === 'deleted') {
                this.invalidateProfileConnections(event.profileId);
                
                // If profile was updated, connections will be recreated on next use
                // If profile was deleted, connections are permanently removed
                this.logger.info('Profile change detected, invalidated connections', {
                    type: event.type,
                    profileId: event.profileId
                });
            }
        });
    }

    /**
     * Releases a connection, decrementing its reference count.
     * If reference count reaches 0, the connection becomes eligible for cleanup.
     */
    releaseConnection(config: AzureDevOpsConfig): void {
        const key = this.getConnectionKey(config);
        const conn = this.connections.get(key);
        
        if (conn) {
            conn.refCount--;
            conn.lastUsed = new Date();
            
            this.logger.debug('Released connection', { 
                key, 
                refCount: conn.refCount 
            });
            
            // Don't immediately close connections with 0 references
            // Let the cleanup timer handle it to allow for reconnection
            if (conn.refCount < 0) {
                this.logger.warn('Reference count below zero', { key });
                conn.refCount = 0;
            }
        } else {
            this.logger.warn('Attempted to release non-existent connection', { key });
        }
    }

    /**
     * Forces immediate release of a connection regardless of reference count.
     */
    async forceReleaseConnection(config: AzureDevOpsConfig): Promise<void> {
        const key = this.getConnectionKey(config);
        const conn = this.connections.get(key);
        
        if (conn) {
            this.logger.info('Force releasing connection', { 
                key, 
                refCount: conn.refCount 
            });
            
            try {
                await conn.client.disconnect();
            } catch (error) {
                this.logger.error('Error disconnecting client', { key, error });
            }
            
            this.connections.delete(key);
        }
    }

    /**
     * Gets the current reference count for a connection.
     */
    getRefCount(config: AzureDevOpsConfig): number {
        const key = this.getConnectionKey(config);
        return this.connections.get(key)?.refCount ?? 0;
    }

    /**
     * Checks if a connection exists in the pool.
     */
    hasConnection(config: AzureDevOpsConfig): boolean {
        return this.connections.has(this.getConnectionKey(config));
    }

    /**
     * Gets statistics about the connection pool.
     */
    getStats(): { totalConnections: number; activeConnections: number; idleConnections: number } {
        let activeConnections = 0;
        let idleConnections = 0;

        for (const conn of this.connections.values()) {
            if (conn.refCount > 0) {
                activeConnections++;
            } else {
                idleConnections++;
            }
        }

        return {
            totalConnections: this.connections.size,
            activeConnections,
            idleConnections
        };
    }

    /**
     * Generates a unique key for a connection configuration.
     */
    private getConnectionKey(config: AzureDevOpsConfig): string {
        return `${config.organizationUrl}|${config.projectName}|${this.hashPAT(config.personalAccessToken)}`;
    }

    /**
     * Creates a hash of the PAT for use in the connection key.
     * This avoids storing the actual PAT in memory unnecessarily.
     */
    private hashPAT(pat: string): string {
        // Simple hash for identifying unique PATs without storing them
        let hash = 0;
        for (let i = 0; i < pat.length; i++) {
            const char = pat.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32-bit integer
        }
        return hash.toString(36);
    }

    /**
     * Starts the cleanup timer to remove idle connections.
     */
    private startCleanupTimer(): void {
        if (this.cleanupInterval) {
            return;
        }

        this.cleanupInterval = setInterval(() => {
            this.cleanupIdleConnections();
        }, this.CLEANUP_INTERVAL);

        this.logger.debug('Cleanup timer started');
    }

    /**
     * Stops the cleanup timer.
     */
    private stopCleanupTimer(): void {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
            this.logger.debug('Cleanup timer stopped');
        }
    }

    /**
     * Removes idle connections that haven't been used recently.
     */
    private async cleanupIdleConnections(): Promise<void> {
        const now = Date.now();
        const connectionsToRemove: string[] = [];

        for (const [key, conn] of this.connections) {
            const idleTime = now - conn.lastUsed.getTime();
            
            // Remove connections with 0 references that have been idle
            if (conn.refCount === 0 && idleTime > this.CONNECTION_TIMEOUT) {
                connectionsToRemove.push(key);
            }
        }

        if (connectionsToRemove.length > 0) {
            this.logger.info('Cleaning up idle connections', { 
                count: connectionsToRemove.length 
            });

            for (const key of connectionsToRemove) {
                const conn = this.connections.get(key);
                if (conn) {
                    try {
                        await conn.client.disconnect();
                    } catch (error) {
                        this.logger.error('Error disconnecting idle client', { key, error });
                    }
                    this.connections.delete(key);
                }
            }
        }

        // Stop the cleanup timer if no connections remain
        if (this.connections.size === 0) {
            this.stopCleanupTimer();
        }
    }

    /**
     * Cleans up all connections and stops the cleanup timer.
     * Should be called when the plugin is shutting down.
     */
    async shutdown(): Promise<void> {
        this.logger.info('Shutting down connection pool', { 
            connections: this.connections.size 
        });

        this.stopCleanupTimer();

        const disconnectPromises: Promise<void>[] = [];
        
        for (const [key, conn] of this.connections) {
            this.logger.debug('Disconnecting', { key, refCount: conn.refCount });
            disconnectPromises.push(
                conn.client.disconnect().catch(error => {
                    this.logger.error('Error during shutdown disconnect', { key, error });
                })
            );
        }

        await Promise.all(disconnectPromises);
        this.connections.clear();
        
        this.logger.info('Connection pool shutdown complete');
    }
}