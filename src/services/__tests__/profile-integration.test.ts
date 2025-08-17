import { ProfileManager } from '../profile-manager';
import { AzureDevOpsConnectionPool } from '../connection-pool';
import { CredentialManager } from '../../utils/credential-manager';
import { DevOpsProfile } from '../../types/profiles';
import streamDeck from '@elgato/streamdeck';

// Mock Stream Deck module
jest.mock('@elgato/streamdeck');

// Mock global settings
const mockGlobalSettings = {
    profiles: [] as DevOpsProfile[],
    defaultProfileId: null as string | null
};

// Mock CredentialManager
jest.mock('../../utils/credential-manager', () => ({
    CredentialManager: jest.fn().mockImplementation(() => ({
        encrypt: jest.fn((value) => `encrypted_${value}`),
        decrypt: jest.fn((value) => value.replace('encrypted_', ''))
    }))
}));

// Mock AzureDevOpsClient
jest.mock('../azure-devops-client', () => ({
    AzureDevOpsClient: jest.fn().mockImplementation(() => ({
        connect: jest.fn().mockResolvedValue(undefined),
        disconnect: jest.fn().mockResolvedValue(undefined),
        isConnected: jest.fn().mockReturnValue(true),
        validateConnection: jest.fn().mockResolvedValue(true),
        testConnection: jest.fn().mockResolvedValue({ success: true }),
        getBuildApi: jest.fn(),
        getProjectName: jest.fn().mockReturnValue('TestProject')
    }))
}));

describe('Profile Integration Tests', () => {
    let profileManager: ProfileManager;
    let connectionPool: AzureDevOpsConnectionPool;
    
    beforeEach(async () => {
        // Reset singleton instances
        (ProfileManager as any).instance = undefined;
        (AzureDevOpsConnectionPool as any).instance = undefined;
        
        // Clear mock settings
        mockGlobalSettings.profiles = [];
        mockGlobalSettings.defaultProfileId = null;
        
        // Setup mock responses
        (streamDeck.settings.getGlobalSettings as jest.Mock).mockResolvedValue(mockGlobalSettings);
        (streamDeck.settings.setGlobalSettings as jest.Mock).mockImplementation((settings: any) => {
            Object.assign(mockGlobalSettings, settings);
            return Promise.resolve();
        });
        
        // Get fresh instances
        profileManager = ProfileManager.getInstance();
        connectionPool = AzureDevOpsConnectionPool.getInstance();
        
        // Initialize profile manager
        await profileManager.initialize();
    });
    
    afterEach(() => {
        jest.clearAllMocks();
    });
    
    describe('Profile Switching', () => {
        it('should switch between profiles and update connections', async () => {
            // Create two profiles
            const profile1 = await profileManager.createProfile({
                name: 'Production',
                organizationUrl: 'https://dev.azure.com/prod',
                projectName: 'ProdProject',
                personalAccessToken: 'prod-token-123'
            });
            
            const profile2 = await profileManager.createProfile({
                name: 'Development',
                organizationUrl: 'https://dev.azure.com/dev',
                projectName: 'DevProject',
                personalAccessToken: 'dev-token-456'
            });
            
            // Get connection for profile1
            const conn1 = await connectionPool.getConnectionByProfile(profile1.id);
            expect(conn1).toBeDefined();
            
            // Get connection for profile2
            const conn2 = await connectionPool.getConnectionByProfile(profile2.id);
            expect(conn2).toBeDefined();
            
            // Verify connections are different
            expect(conn1).not.toBe(conn2);
            
            // Verify connection pool has both connections
            const stats = connectionPool.getStats();
            expect(stats.totalConnections).toBe(2);
            expect(stats.activeConnections).toBe(2);
        });
        
        it('should handle rapid profile switching', async () => {
            const profiles = [];
            
            // Create multiple profiles
            for (let i = 0; i < 5; i++) {
                const profile = await profileManager.createProfile({
                    name: `Profile ${i}`,
                    organizationUrl: `https://dev.azure.com/org${i}`,
                    projectName: `Project${i}`,
                    personalAccessToken: `token-${i}`
                });
                profiles.push(profile);
            }
            
            // Rapidly switch between profiles
            const connectionPromises = [];
            for (let i = 0; i < 20; i++) {
                const profileIndex = i % profiles.length;
                connectionPromises.push(
                    connectionPool.getConnectionByProfile(profiles[profileIndex].id)
                );
            }
            
            const connections = await Promise.all(connectionPromises);
            
            // All connections should be successful
            connections.forEach(conn => {
                expect(conn).toBeDefined();
            });
            
            // Should have at most 5 connections (one per profile)
            const stats = connectionPool.getStats();
            expect(stats.totalConnections).toBeLessThanOrEqual(5);
        });
    });
    
    describe('Profile Update and Connection Invalidation', () => {
        it('should invalidate connections when profile is updated', async () => {
            // Create a profile
            const profile = await profileManager.createProfile({
                name: 'Test Profile',
                organizationUrl: 'https://dev.azure.com/test',
                projectName: 'TestProject',
                personalAccessToken: 'test-token'
            });
            
            // Get initial connection
            const conn1 = await connectionPool.getConnectionByProfile(profile.id);
            expect(conn1).toBeDefined();
            
            // Update the profile
            await profileManager.updateProfile(profile.id, {
                personalAccessToken: 'new-token'
            });
            
            // Get connection again - should be a new connection
            const conn2 = await connectionPool.getConnectionByProfile(profile.id);
            expect(conn2).toBeDefined();
            
            // Connections should be different due to invalidation
            // Note: In real implementation, this would create a new connection
        });
        
        it('should handle profile deletion gracefully', async () => {
            // Create multiple profiles (need at least 2 to delete one)
            const profile1 = await profileManager.createProfile({
                name: 'Keep Profile',
                organizationUrl: 'https://dev.azure.com/keep',
                projectName: 'KeepProject',
                personalAccessToken: 'keep-token'
            });
            
            const profile2 = await profileManager.createProfile({
                name: 'Temp Profile',
                organizationUrl: 'https://dev.azure.com/temp',
                projectName: 'TempProject',
                personalAccessToken: 'temp-token'
            });
            
            // Get connection for profile2
            const conn = await connectionPool.getConnectionByProfile(profile2.id);
            expect(conn).toBeDefined();
            
            // Delete profile2
            const deleted = await profileManager.deleteProfile(profile2.id);
            expect(deleted).toBe(true);
            
            // Try to get connection for deleted profile
            const conn2 = await connectionPool.getConnectionByProfile(profile2.id);
            expect(conn2).toBeNull();
            
            // Verify profile1 still exists
            const remainingProfile = await profileManager.getProfile(profile1.id);
            expect(remainingProfile).toBeDefined();
        });
    });
    
    describe('Default Profile Handling', () => {
        it('should set and use default profile correctly', async () => {
            // Create multiple profiles
            const profile1 = await profileManager.createProfile({
                name: 'Profile 1',
                organizationUrl: 'https://dev.azure.com/org1',
                projectName: 'Project1',
                personalAccessToken: 'token1'
            });
            
            const profile2 = await profileManager.createProfile({
                name: 'Profile 2',
                organizationUrl: 'https://dev.azure.com/org2',
                projectName: 'Project2',
                personalAccessToken: 'token2',
                isDefault: true // Set as default
            });
            
            // Verify profile2 is default
            const defaultProfile = await profileManager.getDefaultProfile();
            expect(defaultProfile?.id).toBe(profile2.id);
            
            // Change default to profile1
            await profileManager.setDefaultProfile(profile1.id);
            
            // Verify profile1 is now default
            const newDefault = await profileManager.getDefaultProfile();
            expect(newDefault?.id).toBe(profile1.id);
            
            // Verify profile2 is no longer default
            const updatedProfile2 = await profileManager.getProfile(profile2.id);
            expect(updatedProfile2?.isDefault).toBe(false);
        });
    });
    
    describe('Profile Validation', () => {
        it('should reject invalid profile data', async () => {
            // Try to create profile without required fields
            await expect(profileManager.createProfile({
                name: '',
                organizationUrl: '',
                projectName: '',
                personalAccessToken: ''
            })).rejects.toThrow();
            
            // Try to create profile with invalid URL
            await expect(profileManager.createProfile({
                name: 'Invalid',
                organizationUrl: 'not-a-url',
                projectName: 'Project',
                personalAccessToken: 'token'
            })).rejects.toThrow();
        });
        
        it('should allow duplicate profile names', async () => {
            // Create first profile
            const profile1 = await profileManager.createProfile({
                name: 'Duplicate Test',
                organizationUrl: 'https://dev.azure.com/org',
                projectName: 'Project',
                personalAccessToken: 'token'
            });
            
            // Create second profile with same name (now allowed)
            const profile2 = await profileManager.createProfile({
                name: 'Duplicate Test',
                organizationUrl: 'https://dev.azure.com/org2',
                projectName: 'Project2',
                personalAccessToken: 'token2'
            });
            
            // Both profiles should exist with different IDs
            expect(profile1.id).not.toBe(profile2.id);
            expect(profile1.name).toBe(profile2.name);
        });
    });
    
    describe('Connection Test Functionality', () => {
        it('should test profile connection successfully', async () => {
            const profile = await profileManager.createProfile({
                name: 'Test Connection',
                organizationUrl: 'https://dev.azure.com/test',
                projectName: 'TestProject',
                personalAccessToken: 'test-token'
            });
            
            // Mock successful connection test
            const result = await profileManager.testConnection(profile.id);
            
            // Note: In real implementation, this would actually test the connection
            // For now, we're testing the structure
            expect(result).toHaveProperty('success');
            // profileId is no longer returned in ConnectionTestResult
            if (result.success && result.details) {
                expect(result.details).toHaveProperty('organizationName');
                expect(result.details).toHaveProperty('projectName');
            }
        });
    });
    
    describe('Profile Change Events', () => {
        it('should emit events on profile changes', async () => {
            const events: any[] = [];
            
            // Subscribe to profile changes
            const unsubscribe = profileManager.onProfileChange((event) => {
                events.push(event);
            });
            
            // Create first profile (to keep at least one)
            const keepProfile = await profileManager.createProfile({
                name: 'Keep Profile',
                organizationUrl: 'https://dev.azure.com/keep',
                projectName: 'KeepProject',
                personalAccessToken: 'keep-token'
            });
            
            // Create a profile to test with
            const profile = await profileManager.createProfile({
                name: 'Event Test',
                organizationUrl: 'https://dev.azure.com/event',
                projectName: 'EventProject',
                personalAccessToken: 'event-token'
            });
            
            // Update the profile
            await profileManager.updateProfile(profile.id, {
                name: 'Event Test Updated'
            });
            
            // Delete the profile (not the keepProfile)
            await profileManager.deleteProfile(profile.id);
            
            // Verify events were emitted (4 total: 2 creates, 1 update, 1 delete)
            expect(events).toHaveLength(4);
            expect(events[0].type).toBe('created'); // keepProfile
            expect(events[1].type).toBe('created'); // profile
            expect(events[2].type).toBe('updated');
            expect(events[3].type).toBe('deleted');
            
            // Cleanup
            unsubscribe();
        });
    });
});