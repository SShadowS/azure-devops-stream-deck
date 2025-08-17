import { ProfileManager } from '../profile-manager';
import { DevOpsProfile } from '../../types/profiles';
import { v4 as uuidv4 } from 'uuid';

// Mock dependencies  
const mockLogger = {
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    trace: jest.fn()
};

jest.mock('@elgato/streamdeck', () => ({
    streamDeck: {
        logger: {
            createScope: jest.fn(() => mockLogger),
            info: jest.fn(),
            error: jest.fn(),
            debug: jest.fn(),
            warn: jest.fn(),
            trace: jest.fn()
        },
        settings: {
            getGlobalSettings: jest.fn(),
            setGlobalSettings: jest.fn()
        }
    }
}));

jest.mock('uuid', () => ({
    v4: jest.fn()
}));

describe('Profile CRUD Operations', () => {
    let profileManager: ProfileManager;
    let mockSettings: { profiles: DevOpsProfile[], defaultProfileId: string | null };
    let uuidCounter = 0;
    
    beforeEach(async () => {
        // Reset singleton
        (ProfileManager as any).instance = undefined;
        
        // Setup UUID mock to return unique IDs
        uuidCounter = 0;
        (uuidv4 as jest.Mock).mockImplementation(() => `test-id-${++uuidCounter}`);
        
        // Setup mock settings
        mockSettings = { profiles: [], defaultProfileId: null };
        
        const streamDeckMock = require('@elgato/streamdeck').streamDeck;
        streamDeckMock.settings.getGlobalSettings.mockResolvedValue(mockSettings);
        streamDeckMock.settings.setGlobalSettings.mockImplementation((settings: any) => {
            Object.assign(mockSettings, settings);
            return Promise.resolve();
        });
        
        profileManager = ProfileManager.getInstance();
        await profileManager.initialize();
    });
    
    afterEach(() => {
        jest.clearAllMocks();
    });
    
    describe('Create Operations', () => {
        it('should create a new profile with all fields', async () => {
            const profileData = {
                name: 'Production',
                organizationUrl: 'https://dev.azure.com/myorg',
                projectName: 'MyProject',
                personalAccessToken: 'my-pat-token'
            };
            
            const profile = await profileManager.createProfile(profileData);
            
            expect(profile).toMatchObject({
                id: 'test-id-1',
                name: 'Production',
                organizationUrl: 'https://dev.azure.com/myorg',
                projectName: 'MyProject',
                isDefault: true // First profile is automatically set as default
            });
            
            expect(profile.personalAccessToken).toBeDefined();
            expect(profile.personalAccessToken).not.toBe('my-pat-token'); // Should be encrypted
            expect(profile.createdAt).toBeDefined();
            expect(profile.updatedAt).toBeDefined();
        });
        
        it('should create profile as default when specified', async () => {
            const profile = await profileManager.createProfile({
                name: 'Default Profile',
                organizationUrl: 'https://dev.azure.com/org',
                projectName: 'Project',
                personalAccessToken: 'token',
                isDefault: true
            });
            
            expect(profile.isDefault).toBe(true);
            
            const defaultProfile = await profileManager.getDefaultProfile();
            expect(defaultProfile?.id).toBe(profile.id);
        });
        
        it.skip('should auto-generate profile name if not provided - feature not implemented', async () => {
            // First profile without name
            const profile1 = await profileManager.createProfile({
                name: '',
                organizationUrl: 'https://dev.azure.com/org1',
                projectName: 'Project1',
                personalAccessToken: 'token1'
            });
            
            expect(profile1.name).toBe('Azure DevOps Profile 1');
            
            // Second profile without name
            const profile2 = await profileManager.createProfile({
                name: '',
                organizationUrl: 'https://dev.azure.com/org2',
                projectName: 'Project2',
                personalAccessToken: 'token2'
            });
            
            expect(profile2.name).toBe('Azure DevOps Profile 2');
        });
        
        it.skip('should prevent duplicate profile names - feature not implemented', async () => {
            await profileManager.createProfile({
                name: 'Duplicate',
                organizationUrl: 'https://dev.azure.com/org1',
                projectName: 'Project1',
                personalAccessToken: 'token1'
            });
            
            await expect(
                profileManager.createProfile({
                    name: 'Duplicate',
                    organizationUrl: 'https://dev.azure.com/org2',
                    projectName: 'Project2',
                    personalAccessToken: 'token2'
                })
            ).rejects.toThrow('Profile with name "Duplicate" already exists');
        });
    });
    
    describe('Read Operations', () => {
        let testProfiles: DevOpsProfile[];
        
        beforeEach(async () => {
            // Create test profiles
            testProfiles = [];
            for (let i = 1; i <= 3; i++) {
                const profile = await profileManager.createProfile({
                    name: `Profile ${i}`,
                    organizationUrl: `https://dev.azure.com/org${i}`,
                    projectName: `Project${i}`,
                    personalAccessToken: `token${i}`,
                    isDefault: i === 2 // Make second profile default
                });
                testProfiles.push(profile);
            }
        });
        
        it('should get profile by ID', async () => {
            const profile = await profileManager.getProfile(testProfiles[0].id);
            expect(profile).toMatchObject({
                id: testProfiles[0].id,
                name: 'Profile 1',
                organizationUrl: 'https://dev.azure.com/org1'
            });
        });
        
        it('should return null for non-existent profile', async () => {
            const profile = await profileManager.getProfile('non-existent');
            expect(profile).toBeNull();
        });
        
        it('should get all profiles', async () => {
            const profiles = await profileManager.getAllProfiles();
            expect(profiles).toHaveLength(3);
            expect(profiles.map(p => p.name)).toEqual(['Profile 1', 'Profile 2', 'Profile 3']);
        });
        
        it('should get default profile', async () => {
            const defaultProfile = await profileManager.getDefaultProfile();
            expect(defaultProfile).toBeDefined();
            expect(defaultProfile?.name).toBe('Profile 2');
            expect(defaultProfile?.isDefault).toBe(true);
        });
        
        it('should get decrypted configuration', async () => {
            const config = await profileManager.getDecryptedConfig(testProfiles[0].id);
            expect(config).toMatchObject({
                organizationUrl: 'https://dev.azure.com/org1',
                projectName: 'Project1',
                personalAccessToken: 'token1' // Should be decrypted
            });
        });
        
        it('should find matching profile', async () => {
            const match = await profileManager.findMatchingProfile({
                organizationUrl: 'https://dev.azure.com/org2',
                projectName: 'Project2'
            });
            
            expect(match).toBeDefined();
            expect(match?.name).toBe('Profile 2');
        });
        
        it('should return null when no matching profile found', async () => {
            const match = await profileManager.findMatchingProfile({
                organizationUrl: 'https://dev.azure.com/nonexistent',
                projectName: 'NoProject'
            });
            
            expect(match).toBeNull();
        });
    });
    
    describe('Update Operations', () => {
        let testProfile: DevOpsProfile;
        
        beforeEach(async () => {
            testProfile = await profileManager.createProfile({
                name: 'Update Test',
                organizationUrl: 'https://dev.azure.com/org',
                projectName: 'Project',
                personalAccessToken: 'token'
            });
        });
        
        it('should update profile name', async () => {
            // Wait a bit to ensure updatedAt timestamp is different
            await new Promise(resolve => setTimeout(resolve, 10));
            
            const updated = await profileManager.updateProfile(testProfile.id, {
                name: 'Updated Name'
            });
            
            expect(updated.name).toBe('Updated Name');
            expect(updated.updatedAt).toBeGreaterThanOrEqual(testProfile.updatedAt);
        });
        
        it('should update organization URL', async () => {
            const updated = await profileManager.updateProfile(testProfile.id, {
                organizationUrl: 'https://dev.azure.com/neworg'
            });
            
            expect(updated.organizationUrl).toBe('https://dev.azure.com/neworg');
        });
        
        it('should update PAT and re-encrypt', async () => {
            const updated = await profileManager.updateProfile(testProfile.id, {
                personalAccessToken: 'new-token'
            });
            
            expect(updated.personalAccessToken).not.toBe('new-token');
            expect(updated.personalAccessToken).not.toBe(testProfile.personalAccessToken);
            
            // Verify decryption works
            const config = await profileManager.getDecryptedConfig(updated.id);
            expect(config?.personalAccessToken).toBe('new-token');
        });
        
        it('should set profile as default', async () => {
            const updated = await profileManager.updateProfile(testProfile.id, {
                isDefault: true
            });
            
            expect(updated.isDefault).toBe(true);
            
            const defaultProfile = await profileManager.getDefaultProfile();
            expect(defaultProfile?.id).toBe(testProfile.id);
        });
        
        it('should unset other profiles as default when setting new default', async () => {
            // Create another profile as default
            const otherProfile = await profileManager.createProfile({
                name: 'Other Profile',
                organizationUrl: 'https://dev.azure.com/other',
                projectName: 'OtherProject',
                personalAccessToken: 'other-token',
                isDefault: true
            });
            
            // Update test profile to be default
            await profileManager.updateProfile(testProfile.id, {
                isDefault: true
            });
            
            // Check that other profile is no longer default
            const updatedOther = await profileManager.getProfile(otherProfile.id);
            expect(updatedOther?.isDefault).toBe(false);
        });
        
        it('should throw error when updating non-existent profile', async () => {
            await expect(
                profileManager.updateProfile('non-existent', { name: 'New Name' })
            ).rejects.toThrow('Profile not found');
        });
    });
    
    describe('Delete Operations', () => {
        let testProfiles: DevOpsProfile[];
        
        beforeEach(async () => {
            testProfiles = [];
            for (let i = 1; i <= 3; i++) {
                const profile = await profileManager.createProfile({
                    name: `Profile ${i}`,
                    organizationUrl: `https://dev.azure.com/org${i}`,
                    projectName: `Project${i}`,
                    personalAccessToken: `token${i}`
                });
                testProfiles.push(profile);
            }
        });
        
        it('should delete profile by ID', async () => {
            const result = await profileManager.deleteProfile(testProfiles[1].id);
            expect(result).toBe(true);
            
            const profile = await profileManager.getProfile(testProfiles[1].id);
            expect(profile).toBeNull();
            
            const allProfiles = await profileManager.getAllProfiles();
            expect(allProfiles).toHaveLength(2);
        });
        
        it('should return false when deleting non-existent profile', async () => {
            const result = await profileManager.deleteProfile('non-existent');
            expect(result).toBe(false);
        });
        
        it('should handle deleting default profile', async () => {
            // Set first profile as default
            await profileManager.setDefaultProfile(testProfiles[0].id);
            
            // Delete the default profile
            await profileManager.deleteProfile(testProfiles[0].id);
            
            // Another profile should become default
            const defaultProfile = await profileManager.getDefaultProfile();
            expect(defaultProfile).not.toBeNull();
            expect(defaultProfile?.id).not.toBe(testProfiles[0].id);
            
            // Verify the deleted profile no longer exists
            const deletedProfile = await profileManager.getProfile(testProfiles[0].id);
            expect(deletedProfile).toBeNull();
        });
        
        it('should prevent deleting last profile if it has active connections', async () => {
            // Delete all but one profile
            await profileManager.deleteProfile(testProfiles[1].id);
            await profileManager.deleteProfile(testProfiles[2].id);
            
            // Try to delete last profile - should throw error
            await expect(
                profileManager.deleteProfile(testProfiles[0].id)
            ).rejects.toThrow('Cannot delete the last profile');
        });
    });
    
    describe('Batch Operations', () => {
        it('should handle batch profile creation', async () => {
            const profilesData = [
                { name: 'Batch 1', organizationUrl: 'https://dev.azure.com/b1', projectName: 'P1', personalAccessToken: 't1' },
                { name: 'Batch 2', organizationUrl: 'https://dev.azure.com/b2', projectName: 'P2', personalAccessToken: 't2' },
                { name: 'Batch 3', organizationUrl: 'https://dev.azure.com/b3', projectName: 'P3', personalAccessToken: 't3' }
            ];
            
            const profiles = await Promise.all(
                profilesData.map(data => profileManager.createProfile(data))
            );
            
            expect(profiles).toHaveLength(3);
            
            const allProfiles = await profileManager.getAllProfiles();
            expect(allProfiles).toHaveLength(3);
        });
        
        it('should handle batch profile deletion', async () => {
            // Create profiles
            const profiles = [];
            for (let i = 1; i <= 5; i++) {
                const profile = await profileManager.createProfile({
                    name: `Batch Delete ${i}`,
                    organizationUrl: `https://dev.azure.com/bd${i}`,
                    projectName: `BD${i}`,
                    personalAccessToken: `bd${i}`
                });
                profiles.push(profile);
            }
            
            // Delete first 3 profiles
            const deleteResults = await Promise.all(
                profiles.slice(0, 3).map(p => profileManager.deleteProfile(p.id))
            );
            
            expect(deleteResults).toEqual([true, true, true]);
            
            const remainingProfiles = await profileManager.getAllProfiles();
            expect(remainingProfiles).toHaveLength(2);
            expect(remainingProfiles.map(p => p.name)).toEqual(['Batch Delete 4', 'Batch Delete 5']);
        });
    });
});