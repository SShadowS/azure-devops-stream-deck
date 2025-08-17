import { ProfileManager } from '../profile-manager';
import { streamDeck } from '@elgato/streamdeck';
import { CredentialManager } from '../../utils/credential-manager';
import { AzureDevOpsClient } from '../azure-devops-client';
import {
    DevOpsProfile,
    GlobalSettings,
    LegacySettings,
    ValidationResult,
    ConnectionTestResult
} from '../../types/profiles';

// Mock the modules
jest.mock('@elgato/streamdeck');
jest.mock('../../utils/credential-manager');
jest.mock('../azure-devops-client');
jest.mock('uuid', () => {
    let counter = 0;
    return {
        v4: jest.fn(() => `test-uuid-${++counter}`)
    };
});

describe('ProfileManager', () => {
    let profileManager: ProfileManager;
    let mockGetGlobalSettings: jest.Mock;
    let mockSetGlobalSettings: jest.Mock;
    let mockEncrypt: jest.Mock;
    let mockDecrypt: jest.Mock;

    beforeEach(() => {
        // Clear all instances and calls to constructor and all methods
        jest.clearAllMocks();

        // Reset singleton instance
        (ProfileManager as any).instance = undefined;

        // Setup Stream Deck mocks
        mockGetGlobalSettings = jest.fn().mockResolvedValue({});
        mockSetGlobalSettings = jest.fn().mockResolvedValue(undefined);

        (streamDeck as any).settings = {
            getGlobalSettings: mockGetGlobalSettings,
            setGlobalSettings: mockSetGlobalSettings
        };

        (streamDeck as any).logger = {
            info: jest.fn(),
            debug: jest.fn(),
            warn: jest.fn(),
            error: jest.fn()
        };

        // Setup CredentialManager mocks
        mockEncrypt = jest.fn((value) => `encrypted_${value}`);
        mockDecrypt = jest.fn((value) => value.replace('encrypted_', ''));

        (CredentialManager as any).mockImplementation(() => ({
            encrypt: mockEncrypt,
            decrypt: mockDecrypt
        }));

        // Get ProfileManager instance
        profileManager = ProfileManager.getInstance();
    });

    describe('Singleton Pattern', () => {
        it('should return the same instance', () => {
            const instance1 = ProfileManager.getInstance();
            const instance2 = ProfileManager.getInstance();
            expect(instance1).toBe(instance2);
        });
    });

    describe('Initialization', () => {
        it('should initialize successfully with no existing profiles', async () => {
            await profileManager.initialize();
            
            expect(mockGetGlobalSettings).toHaveBeenCalled();
            expect(mockSetGlobalSettings).toHaveBeenCalledWith({
                profiles: {},
                defaultProfileId: undefined,
                version: 1
            });
        });

        it('should load existing profiles on initialization', async () => {
            const existingProfiles: GlobalSettings = {
                profiles: {
                    'profile-1': {
                        id: 'profile-1',
                        name: 'Test Profile',
                        organizationUrl: 'https://dev.azure.com/test',
                        projectName: 'TestProject',
                        personalAccessToken: 'encrypted_token',
                        createdAt: Date.now(),
                        updatedAt: Date.now(),
                        isDefault: true
                    }
                },
                defaultProfileId: 'profile-1',
                version: 1
            };

            mockGetGlobalSettings.mockResolvedValue(existingProfiles);
            
            await profileManager.initialize();
            
            const profiles = await profileManager.getAllProfiles();
            expect(profiles).toHaveLength(1);
            expect(profiles[0].name).toBe('Test Profile');
        });

        it('should handle initialization errors gracefully', async () => {
            mockGetGlobalSettings.mockRejectedValue(new Error('Settings error'));
            
            await profileManager.initialize();
            
            const profiles = await profileManager.getAllProfiles();
            expect(profiles).toHaveLength(0);
            expect(streamDeck.logger.error).toHaveBeenCalled();
        });

        it('should only initialize once', async () => {
            await profileManager.initialize();
            await profileManager.initialize();
            
            expect(mockGetGlobalSettings).toHaveBeenCalledTimes(1);
        });
    });

    describe('Create Profile', () => {
        beforeEach(async () => {
            await profileManager.initialize();
        });

        it('should create a new profile successfully', async () => {
            const profileData = {
                name: 'Production',
                organizationUrl: 'https://dev.azure.com/myorg',
                projectName: 'MyProject',
                personalAccessToken: 'my-pat-token'
            };

            const profile = await profileManager.createProfile(profileData);

            expect(profile).toMatchObject({
                id: expect.stringMatching(/^test-uuid-\d+$/),
                name: 'Production',
                organizationUrl: 'https://dev.azure.com/myorg',
                projectName: 'MyProject',
                personalAccessToken: 'encrypted_my-pat-token'
            });
            expect(profile.createdAt).toBeDefined();
            expect(profile.updatedAt).toBeDefined();
            expect(mockEncrypt).toHaveBeenCalledWith('my-pat-token');
            expect(mockSetGlobalSettings).toHaveBeenCalled();
        });

        it('should set first profile as default', async () => {
            const profileData = {
                name: 'First Profile',
                organizationUrl: 'https://dev.azure.com/myorg',
                projectName: 'MyProject',
                personalAccessToken: 'token'
            };

            const profile = await profileManager.createProfile(profileData);
            
            expect(profile.isDefault).toBe(true);
            const defaultProfile = await profileManager.getDefaultProfile();
            expect(defaultProfile?.id).toBe(profile.id);
        });

        it('should handle default profile flag correctly', async () => {
            // Create first profile
            await profileManager.createProfile({
                name: 'Profile 1',
                organizationUrl: 'https://dev.azure.com/org1',
                projectName: 'Project1',
                personalAccessToken: 'token1'
            });

            // Create second profile as default
            const profile2 = await profileManager.createProfile({
                name: 'Profile 2',
                organizationUrl: 'https://dev.azure.com/org2',
                projectName: 'Project2',
                personalAccessToken: 'token2',
                isDefault: true
            });

            expect(profile2.isDefault).toBe(true);
            const defaultProfile = await profileManager.getDefaultProfile();
            expect(defaultProfile?.id).toBe(profile2.id);
        });

        it('should validate profile data before creation', async () => {
            const invalidProfile = {
                name: '',
                organizationUrl: 'invalid-url',
                projectName: '',
                personalAccessToken: ''
            };

            await expect(profileManager.createProfile(invalidProfile))
                .rejects.toThrow('Invalid profile');
        });
    });

    describe('Update Profile', () => {
        let testProfileId: string;

        beforeEach(async () => {
            await profileManager.initialize();
            const profile = await profileManager.createProfile({
                name: 'Test Profile',
                organizationUrl: 'https://dev.azure.com/test',
                projectName: 'TestProject',
                personalAccessToken: 'test-token'
            });
            testProfileId = profile.id;
        });

        it('should update an existing profile', async () => {
            const updates = {
                name: 'Updated Profile',
                projectName: 'UpdatedProject'
            };
            
            // Add a small delay to ensure different timestamps
            await new Promise(resolve => setTimeout(resolve, 10));

            const updatedProfile = await profileManager.updateProfile(testProfileId, updates);

            expect(updatedProfile.name).toBe('Updated Profile');
            expect(updatedProfile.projectName).toBe('UpdatedProject');
            expect(updatedProfile.updatedAt).toBeGreaterThanOrEqual(updatedProfile.createdAt);
            expect(mockSetGlobalSettings).toHaveBeenCalled();
        });

        it('should encrypt PAT when updating', async () => {
            const updates = {
                personalAccessToken: 'new-token'
            };

            const updatedProfile = await profileManager.updateProfile(testProfileId, updates);

            expect(mockEncrypt).toHaveBeenCalledWith('new-token');
            expect(updatedProfile.personalAccessToken).toBe('encrypted_new-token');
        });

        it('should handle default profile update', async () => {
            // Create a second profile
            const profile2 = await profileManager.createProfile({
                name: 'Profile 2',
                organizationUrl: 'https://dev.azure.com/org2',
                projectName: 'Project2',
                personalAccessToken: 'token2'
            });

            // Update profile2 to be default
            await profileManager.updateProfile(profile2.id, { isDefault: true });

            const defaultProfile = await profileManager.getDefaultProfile();
            expect(defaultProfile?.id).toBe(profile2.id);
        });

        it('should throw error for non-existent profile', async () => {
            await expect(profileManager.updateProfile('non-existent', { name: 'New Name' }))
                .rejects.toThrow('Profile not found');
        });

        it('should validate updated profile data', async () => {
            const invalidUpdates = {
                organizationUrl: 'invalid-url'
            };

            await expect(profileManager.updateProfile(testProfileId, invalidUpdates))
                .rejects.toThrow('Invalid profile update');
        });
    });

    describe('Delete Profile', () => {
        beforeEach(async () => {
            await profileManager.initialize();
        });

        it('should delete an existing profile', async () => {
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
                personalAccessToken: 'token2'
            });

            const result = await profileManager.deleteProfile(profile1.id);
            
            expect(result).toBe(true);
            const profiles = await profileManager.getAllProfiles();
            expect(profiles).toHaveLength(1);
            expect(profiles[0].id).toBe(profile2.id);
        });

        it('should prevent deletion of the last profile', async () => {
            const profile = await profileManager.createProfile({
                name: 'Only Profile',
                organizationUrl: 'https://dev.azure.com/org',
                projectName: 'Project',
                personalAccessToken: 'token'
            });

            await expect(profileManager.deleteProfile(profile.id))
                .rejects.toThrow('Cannot delete the last profile');
        });

        it('should reassign default when deleting default profile', async () => {
            const profile1 = await profileManager.createProfile({
                name: 'Profile 1',
                organizationUrl: 'https://dev.azure.com/org1',
                projectName: 'Project1',
                personalAccessToken: 'token1',
                isDefault: true
            });

            const profile2 = await profileManager.createProfile({
                name: 'Profile 2',
                organizationUrl: 'https://dev.azure.com/org2',
                projectName: 'Project2',
                personalAccessToken: 'token2'
            });

            await profileManager.deleteProfile(profile1.id);

            const defaultProfile = await profileManager.getDefaultProfile();
            expect(defaultProfile?.id).toBe(profile2.id);
        });

        it('should return false for non-existent profile', async () => {
            const result = await profileManager.deleteProfile('non-existent');
            expect(result).toBe(false);
        });
    });

    describe('Get Operations', () => {
        let profile1: DevOpsProfile;
        let profile2: DevOpsProfile;

        beforeEach(async () => {
            await profileManager.initialize();
            
            profile1 = await profileManager.createProfile({
                name: 'Profile 1',
                organizationUrl: 'https://dev.azure.com/org1',
                projectName: 'Project1',
                personalAccessToken: 'token1'
            });

            profile2 = await profileManager.createProfile({
                name: 'Profile 2',
                organizationUrl: 'https://dev.azure.com/org2',
                projectName: 'Project2',
                personalAccessToken: 'token2'
            });
        });

        it('should get a profile by ID', async () => {
            const profile = await profileManager.getProfile(profile1.id);
            expect(profile).toEqual(profile1);
        });

        it('should return null for non-existent profile', async () => {
            const profile = await profileManager.getProfile('non-existent');
            expect(profile).toBeNull();
        });

        it('should get all profiles', async () => {
            const profiles = await profileManager.getAllProfiles();
            expect(profiles).toHaveLength(2);
            expect(profiles).toContainEqual(profile1);
            expect(profiles).toContainEqual(profile2);
        });

        it('should get decrypted configuration', async () => {
            const config = await profileManager.getDecryptedConfig(profile1.id);
            
            expect(config).toEqual({
                organizationUrl: 'https://dev.azure.com/org1',
                projectName: 'Project1',
                personalAccessToken: 'token1'
            });
            expect(mockDecrypt).toHaveBeenCalledWith('encrypted_token1');
        });

        it('should return null for non-existent profile config', async () => {
            const config = await profileManager.getDecryptedConfig('non-existent');
            expect(config).toBeNull();
        });
    });

    describe('Validation', () => {
        beforeEach(async () => {
            await profileManager.initialize();
        });

        it('should validate a valid profile', async () => {
            const profile: DevOpsProfile = {
                id: 'test-id',
                name: 'Valid Profile',
                organizationUrl: 'https://dev.azure.com/org',
                projectName: 'Project',
                personalAccessToken: 'token',
                createdAt: Date.now(),
                updatedAt: Date.now()
            };

            const result = await profileManager.validateProfile(profile);
            
            expect(result.isValid).toBe(true);
            expect(result.errors).toHaveLength(0);
        });

        it('should detect missing name', async () => {
            const profile: DevOpsProfile = {
                id: 'test-id',
                name: '',
                organizationUrl: 'https://dev.azure.com/org',
                projectName: 'Project',
                personalAccessToken: 'token',
                createdAt: Date.now(),
                updatedAt: Date.now()
            };

            const result = await profileManager.validateProfile(profile);
            
            expect(result.isValid).toBe(false);
            expect(result.errors).toContain('Profile name is required');
        });

        it('should detect invalid URL', async () => {
            const profile: DevOpsProfile = {
                id: 'test-id',
                name: 'Profile',
                organizationUrl: 'not-a-url',
                projectName: 'Project',
                personalAccessToken: 'token',
                createdAt: Date.now(),
                updatedAt: Date.now()
            };

            const result = await profileManager.validateProfile(profile);
            
            expect(result.isValid).toBe(false);
            expect(result.errors).toContain('Organization URL must be a valid URL');
        });

        it('should detect multiple validation errors', async () => {
            const profile: DevOpsProfile = {
                id: 'test-id',
                name: '',
                organizationUrl: '',
                projectName: '',
                personalAccessToken: '',
                createdAt: Date.now(),
                updatedAt: Date.now()
            };

            const result = await profileManager.validateProfile(profile);
            
            expect(result.isValid).toBe(false);
            expect(result.errors.length).toBeGreaterThan(1);
        });
    });

    describe('Connection Testing', () => {
        beforeEach(async () => {
            await profileManager.initialize();
        });

        it('should test connection successfully', async () => {
            const profile = await profileManager.createProfile({
                name: 'Test Profile',
                organizationUrl: 'https://dev.azure.com/test',
                projectName: 'TestProject',
                personalAccessToken: 'test-token'
            });

            const mockConnect = jest.fn().mockResolvedValue({
                getCoreApi: jest.fn().mockResolvedValue({
                    getProject: jest.fn().mockResolvedValue({
                        name: 'TestProject'
                    })
                })
            });

            (AzureDevOpsClient as any).mockImplementation(() => ({
                connect: mockConnect
            }));

            const result = await profileManager.testConnection(profile.id);

            expect(result.success).toBe(true);
            expect(result.details?.projectName).toBe('TestProject');
            expect(mockDecrypt).toHaveBeenCalledWith('encrypted_test-token');
        });

        it('should handle connection test failure', async () => {
            const profile = await profileManager.createProfile({
                name: 'Test Profile',
                organizationUrl: 'https://dev.azure.com/test',
                projectName: 'TestProject',
                personalAccessToken: 'test-token'
            });

            const mockConnect = jest.fn().mockRejectedValue(new Error('Connection failed'));

            (AzureDevOpsClient as any).mockImplementation(() => ({
                connect: mockConnect
            }));

            const result = await profileManager.testConnection(profile.id);

            expect(result.success).toBe(false);
            expect(result.error).toBe('Connection failed');
        });

        it('should handle non-existent profile', async () => {
            const result = await profileManager.testConnection('non-existent');
            
            expect(result.success).toBe(false);
            expect(result.error).toBe('Profile not found');
        });
    });

    describe('Migration', () => {
        beforeEach(async () => {
            await profileManager.initialize();
        });

        it('should migrate legacy settings to new profile', async () => {
            const legacySettings: LegacySettings = {
                organizationUrl: 'https://dev.azure.com/legacy',
                projectName: 'LegacyProject',
                personalAccessToken: 'legacy-token'
            };

            const result = await profileManager.migrateFromLegacySettings(legacySettings);

            expect(result.wasCreated).toBe(true);
            expect(result.profileName).toContain('Migrated LegacyProject');
            
            const profile = await profileManager.getProfile(result.profileId);
            expect(profile?.organizationUrl).toBe('https://dev.azure.com/legacy');
            expect(profile?.projectName).toBe('LegacyProject');
        });

        it('should use existing profile if matching', async () => {
            const existingProfile = await profileManager.createProfile({
                name: 'Existing',
                organizationUrl: 'https://dev.azure.com/existing',
                projectName: 'ExistingProject',
                personalAccessToken: 'existing-token'
            });

            const legacySettings: LegacySettings = {
                organizationUrl: 'https://dev.azure.com/existing',
                projectName: 'ExistingProject',
                personalAccessToken: 'different-token'
            };

            const result = await profileManager.migrateFromLegacySettings(legacySettings);

            expect(result.wasCreated).toBe(false);
            expect(result.profileId).toBe(existingProfile.id);
        });

        it('should handle alternative field names', async () => {
            const legacySettings: LegacySettings = {
                orgUrl: 'https://dev.azure.com/alt',
                project: 'AltProject',
                personalAccessToken: 'alt-token'
            };

            const result = await profileManager.migrateFromLegacySettings(legacySettings);

            expect(result.wasCreated).toBe(true);
            const profile = await profileManager.getProfile(result.profileId);
            expect(profile?.organizationUrl).toBe('https://dev.azure.com/alt');
            expect(profile?.projectName).toBe('AltProject');
        });

        it('should throw error for invalid legacy settings', async () => {
            const invalidSettings: LegacySettings = {
                projectName: 'OnlyProject'
            };

            await expect(profileManager.migrateFromLegacySettings(invalidSettings))
                .rejects.toThrow('Invalid legacy settings');
        });

        it('should find matching profile', async () => {
            const profile = await profileManager.createProfile({
                name: 'Test',
                organizationUrl: 'https://dev.azure.com/test',
                projectName: 'TestProject',
                personalAccessToken: 'token'
            });

            const matching = await profileManager.findMatchingProfile({
                organizationUrl: 'https://dev.azure.com/test',
                projectName: 'TestProject'
            });

            expect(matching?.id).toBe(profile.id);
        });

        it('should normalize URLs for comparison', async () => {
            const profile = await profileManager.createProfile({
                name: 'Test',
                organizationUrl: 'https://dev.azure.com/test/',
                projectName: 'TestProject',
                personalAccessToken: 'token'
            });

            const matching = await profileManager.findMatchingProfile({
                organizationUrl: 'HTTPS://DEV.AZURE.COM/TEST',
                projectName: 'TestProject'
            });

            expect(matching?.id).toBe(profile.id);
        });
    });

    describe('Event Listeners', () => {
        beforeEach(async () => {
            await profileManager.initialize();
        });

        it('should notify listeners on profile creation', async () => {
            const listener = jest.fn();
            profileManager.onProfileChange(listener);

            const profile = await profileManager.createProfile({
                name: 'Test',
                organizationUrl: 'https://dev.azure.com/test',
                projectName: 'TestProject',
                personalAccessToken: 'token'
            });

            expect(listener).toHaveBeenCalledWith({
                type: 'created',
                profileId: profile.id,
                profile
            });
        });

        it('should notify listeners on profile update', async () => {
            const profile = await profileManager.createProfile({
                name: 'Test',
                organizationUrl: 'https://dev.azure.com/test',
                projectName: 'TestProject',
                personalAccessToken: 'token'
            });

            const listener = jest.fn();
            profileManager.onProfileChange(listener);

            await profileManager.updateProfile(profile.id, { name: 'Updated' });

            expect(listener).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: 'updated',
                    profileId: profile.id
                })
            );
        });

        it('should notify listeners on profile deletion', async () => {
            const profile1 = await profileManager.createProfile({
                name: 'Test 1',
                organizationUrl: 'https://dev.azure.com/test1',
                projectName: 'TestProject1',
                personalAccessToken: 'token1'
            });

            const profile2 = await profileManager.createProfile({
                name: 'Test 2',
                organizationUrl: 'https://dev.azure.com/test2',
                projectName: 'TestProject2',
                personalAccessToken: 'token2'
            });

            const listener = jest.fn();
            profileManager.onProfileChange(listener);

            await profileManager.deleteProfile(profile1.id);

            expect(listener).toHaveBeenCalledWith({
                type: 'deleted',
                profileId: profile1.id
            });
        });

        it('should handle listener errors gracefully', async () => {
            const errorListener = jest.fn(() => {
                throw new Error('Listener error');
            });
            const normalListener = jest.fn();

            profileManager.onProfileChange(errorListener);
            profileManager.onProfileChange(normalListener);

            await profileManager.createProfile({
                name: 'Test',
                organizationUrl: 'https://dev.azure.com/test',
                projectName: 'TestProject',
                personalAccessToken: 'token'
            });

            expect(errorListener).toHaveBeenCalled();
            expect(normalListener).toHaveBeenCalled();
            expect(streamDeck.logger.error).toHaveBeenCalled();
        });

        it('should unsubscribe listeners', async () => {
            const listener = jest.fn();
            const unsubscribe = profileManager.onProfileChange(listener);

            unsubscribe();

            await profileManager.createProfile({
                name: 'Test',
                organizationUrl: 'https://dev.azure.com/test',
                projectName: 'TestProject',
                personalAccessToken: 'token'
            });

            expect(listener).not.toHaveBeenCalled();
        });
    });

    describe('Utility Methods', () => {
        beforeEach(async () => {
            await profileManager.initialize();
        });

        it('should clear all profiles', async () => {
            await profileManager.createProfile({
                name: 'Profile 1',
                organizationUrl: 'https://dev.azure.com/org1',
                projectName: 'Project1',
                personalAccessToken: 'token1'
            });

            await profileManager.createProfile({
                name: 'Profile 2',
                organizationUrl: 'https://dev.azure.com/org2',
                projectName: 'Project2',
                personalAccessToken: 'token2'
            });

            await profileManager.clearAllProfiles();

            const profiles = await profileManager.getAllProfiles();
            expect(profiles).toHaveLength(0);
            expect(streamDeck.logger.warn).toHaveBeenCalledWith('All profiles cleared');
        });
    });
});