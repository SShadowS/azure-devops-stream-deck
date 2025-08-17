// Mock modules before imports
jest.mock('../../services/profile-manager');
jest.mock('../../services/connection-pool');
jest.mock('../credential-manager');
jest.mock('@elgato/streamdeck', () => require('../../test-helpers/test-utils').mockStreamDeckModule());

import { ProfileMigrationHelper } from '../profile-migration-helper';
import { ProfileManager } from '../../services/profile-manager';
import { AzureDevOpsConnectionPool } from '../../services/connection-pool';
import { CredentialManager } from '../credential-manager';

const mockStreamDeck = jest.requireMock('@elgato/streamdeck').default;

describe('ProfileMigrationHelper', () => {
    let mockProfileManager: jest.Mocked<ProfileManager>;
    let mockConnectionPool: jest.Mocked<AzureDevOpsConnectionPool>;
    let mockCredentialManager: jest.Mocked<CredentialManager>;
    let mockAction: any;

    beforeEach(() => {
        jest.clearAllMocks();
        
        // Setup ProfileManager mock
        mockProfileManager = {
            initialize: jest.fn().mockResolvedValue(undefined),
            migrateFromLegacySettings: jest.fn().mockResolvedValue({
                profileId: 'profile-123',
                profileName: 'Migrated Profile'
            }),
            getDecryptedConfig: jest.fn().mockResolvedValue({
                organizationUrl: 'https://dev.azure.com/test',
                personalAccessToken: 'decrypted-token',
                projectName: 'TestProject'
            }),
            getAllProfiles: jest.fn().mockResolvedValue([
                { id: 'profile-1', name: 'Profile 1', organizationUrl: 'https://dev.azure.com/org1' },
                { id: 'profile-2', name: 'Profile 2', organizationUrl: 'https://dev.azure.com/org2' }
            ]),
            getDefaultProfile: jest.fn().mockResolvedValue({
                id: 'profile-1',
                name: 'Profile 1',
                organizationUrl: 'https://dev.azure.com/org1'
            })
        } as any;
        
        (ProfileManager.getInstance as jest.Mock).mockReturnValue(mockProfileManager);
        
        // Setup ConnectionPool mock
        mockConnectionPool = {
            releaseProfileConnection: jest.fn()
        } as any;
        
        (AzureDevOpsConnectionPool.getInstance as jest.Mock).mockReturnValue(mockConnectionPool);
        
        // Setup CredentialManager mock
        mockCredentialManager = {
            decrypt: jest.fn().mockReturnValue('decrypted-token')
        } as any;
        
        (CredentialManager as jest.Mock).mockImplementation(() => mockCredentialManager);
        
        // Setup action mock
        mockAction = {
            id: 'test-action',
            setSettings: jest.fn().mockResolvedValue(undefined)
        };
        
        // Reset static instance references
        (ProfileMigrationHelper as any).profileManager = mockProfileManager;
        (ProfileMigrationHelper as any).connectionPool = mockConnectionPool;
        (ProfileMigrationHelper as any).credentialManager = mockCredentialManager;
    });

    describe('migrateSettingsIfNeeded', () => {
        it('should return settings unchanged if already using profile', async () => {
            const settings = {
                profileId: 'existing-profile',
                someOtherSetting: 'value'
            };

            const result = await ProfileMigrationHelper.migrateSettingsIfNeeded(
                mockAction,
                settings,
                mockStreamDeck.logger
            );

            expect(result).toEqual(settings);
            expect(mockProfileManager.migrateFromLegacySettings).not.toHaveBeenCalled();
        });

        it('should migrate legacy settings to profile', async () => {
            const settings = {
                organizationUrl: 'https://dev.azure.com/legacy',
                projectName: 'LegacyProject',
                personalAccessToken: 'legacy-token',
                someOtherSetting: 'value'
            };

            const result = await ProfileMigrationHelper.migrateSettingsIfNeeded(
                mockAction,
                settings,
                mockStreamDeck.logger
            );

            expect(mockProfileManager.migrateFromLegacySettings).toHaveBeenCalledWith({
                organizationUrl: 'https://dev.azure.com/legacy',
                projectName: 'LegacyProject',
                personalAccessToken: 'legacy-token'
            });

            expect(result).toEqual({
                profileId: 'profile-123',
                someOtherSetting: 'value',
                organizationUrl: undefined,
                projectName: undefined,
                personalAccessToken: undefined
            });

            expect(mockAction.setSettings).toHaveBeenCalledWith(result);
        });

        it('should handle migration failure gracefully', async () => {
            const settings = {
                organizationUrl: 'https://dev.azure.com/legacy',
                projectName: 'LegacyProject',
                personalAccessToken: 'legacy-token'
            };

            mockProfileManager.migrateFromLegacySettings.mockRejectedValueOnce(new Error('Migration failed'));

            const result = await ProfileMigrationHelper.migrateSettingsIfNeeded(
                mockAction,
                settings,
                mockStreamDeck.logger
            );

            expect(result).toEqual(settings); // Returns original settings on failure
            expect(mockAction.setSettings).not.toHaveBeenCalled();
        });

        it('should return settings unchanged if no migration needed', async () => {
            const settings = {
                someOtherSetting: 'value'
                // No profile or legacy settings
            };

            const result = await ProfileMigrationHelper.migrateSettingsIfNeeded(
                mockAction,
                settings,
                mockStreamDeck.logger
            );

            expect(result).toEqual(settings);
            expect(mockProfileManager.migrateFromLegacySettings).not.toHaveBeenCalled();
        });

        it('should handle missing organizationUrl in legacy settings', async () => {
            const settings = {
                personalAccessToken: 'legacy-token',
                projectName: 'LegacyProject'
                // Missing organizationUrl
            };

            const result = await ProfileMigrationHelper.migrateSettingsIfNeeded(
                mockAction,
                settings,
                mockStreamDeck.logger
            );

            expect(result).toEqual(settings);
            expect(mockProfileManager.migrateFromLegacySettings).not.toHaveBeenCalled();
        });

        it('should handle missing personalAccessToken in legacy settings', async () => {
            const settings = {
                organizationUrl: 'https://dev.azure.com/legacy',
                projectName: 'LegacyProject'
                // Missing personalAccessToken
            };

            const result = await ProfileMigrationHelper.migrateSettingsIfNeeded(
                mockAction,
                settings,
                mockStreamDeck.logger
            );

            expect(result).toEqual(settings);
            expect(mockProfileManager.migrateFromLegacySettings).not.toHaveBeenCalled();
        });

        it('should work without logger', async () => {
            const settings = {
                organizationUrl: 'https://dev.azure.com/legacy',
                projectName: 'LegacyProject',
                personalAccessToken: 'legacy-token'
            };

            const result = await ProfileMigrationHelper.migrateSettingsIfNeeded(
                mockAction,
                settings
                // No logger provided
            );

            expect(mockProfileManager.migrateFromLegacySettings).toHaveBeenCalled();
            expect((result as any).profileId).toBe('profile-123');
        });
    });

    describe('hasValidConfiguration', () => {
        it('should return true for settings with profileId', () => {
            const settings = {
                profileId: 'profile-123'
            };

            const result = ProfileMigrationHelper.hasValidConfiguration(settings);

            expect(result).toBe(true);
        });

        it('should return true for complete legacy settings', () => {
            const settings = {
                organizationUrl: 'https://dev.azure.com/test',
                projectName: 'TestProject',
                personalAccessToken: 'token'
            };

            const result = ProfileMigrationHelper.hasValidConfiguration(settings);

            expect(result).toBe(true);
        });

        it('should return false for incomplete legacy settings', () => {
            const settings = {
                organizationUrl: 'https://dev.azure.com/test',
                projectName: 'TestProject'
                // Missing personalAccessToken
            };

            const result = ProfileMigrationHelper.hasValidConfiguration(settings);

            expect(result).toBe(false);
        });

        it('should return false for empty settings', () => {
            const settings = {};

            const result = ProfileMigrationHelper.hasValidConfiguration(settings);

            expect(result).toBe(false);
        });

        it('should return false when only organizationUrl is present', () => {
            const settings = {
                organizationUrl: 'https://dev.azure.com/test'
            };

            const result = ProfileMigrationHelper.hasValidConfiguration(settings);

            expect(result).toBe(false);
        });

        it('should return false when only personalAccessToken is present', () => {
            const settings = {
                personalAccessToken: 'token'
            };

            const result = ProfileMigrationHelper.hasValidConfiguration(settings);

            expect(result).toBe(false);
        });
    });

    describe('getConnectionConfig', () => {
        it('should get config from profile', async () => {
            const settings = {
                profileId: 'profile-123'
            };

            const result = await ProfileMigrationHelper.getConnectionConfig(settings);

            expect(mockProfileManager.getDecryptedConfig).toHaveBeenCalledWith('profile-123');
            expect(result).toEqual({
                organizationUrl: 'https://dev.azure.com/test',
                personalAccessToken: 'decrypted-token',
                projectName: 'TestProject'
            });
        });

        it('should get config from legacy settings with unencrypted PAT', async () => {
            const settings = {
                organizationUrl: 'https://dev.azure.com/legacy',
                personalAccessToken: 'plain-token',
                projectName: 'LegacyProject'
            };

            const result = await ProfileMigrationHelper.getConnectionConfig(settings);

            expect(mockCredentialManager.decrypt).not.toHaveBeenCalled();
            expect(result).toEqual({
                organizationUrl: 'https://dev.azure.com/legacy',
                personalAccessToken: 'plain-token',
                projectName: 'LegacyProject'
            });
        });

        it('should decrypt encrypted PAT in legacy settings', async () => {
            const encryptedPAT = 'A'.repeat(101) + '='; // Simulate encrypted PAT
            const settings = {
                organizationUrl: 'https://dev.azure.com/legacy',
                personalAccessToken: encryptedPAT,
                projectName: 'LegacyProject'
            };

            const result = await ProfileMigrationHelper.getConnectionConfig(settings);

            expect(mockCredentialManager.decrypt).toHaveBeenCalledWith(encryptedPAT);
            expect(result).toEqual({
                organizationUrl: 'https://dev.azure.com/legacy',
                personalAccessToken: 'decrypted-token',
                projectName: 'LegacyProject'
            });
        });

        it('should return null for invalid settings', async () => {
            const settings = {
                someOtherSetting: 'value'
            };

            const result = await ProfileMigrationHelper.getConnectionConfig(settings);

            expect(result).toBeNull();
        });

        it('should return null for incomplete legacy settings', async () => {
            const settings = {
                organizationUrl: 'https://dev.azure.com/legacy'
                // Missing personalAccessToken
            };

            const result = await ProfileMigrationHelper.getConnectionConfig(settings);

            expect(result).toBeNull();
        });

        it('should handle profile config retrieval error', async () => {
            const settings = {
                profileId: 'profile-123'
            };

            mockProfileManager.getDecryptedConfig.mockRejectedValueOnce(new Error('Profile not found'));

            await expect(ProfileMigrationHelper.getConnectionConfig(settings)).rejects.toThrow('Profile not found');
        });
    });

    describe('sendProfileList', () => {
        it('should send profile list to Property Inspector', async () => {
            await ProfileMigrationHelper.sendProfileList();

            expect(mockProfileManager.getAllProfiles).toHaveBeenCalled();
            expect(mockProfileManager.getDefaultProfile).toHaveBeenCalled();
            expect(mockStreamDeck.ui.current?.sendToPropertyInspector).toHaveBeenCalledWith({
                event: 'profileList',
                profiles: [
                    { id: 'profile-1', name: 'Profile 1', isDefault: true },
                    { id: 'profile-2', name: 'Profile 2', isDefault: false }
                ]
            });
        });

        it('should handle when no default profile exists', async () => {
            mockProfileManager.getDefaultProfile.mockResolvedValueOnce(null);

            await ProfileMigrationHelper.sendProfileList();

            expect(mockStreamDeck.ui.current?.sendToPropertyInspector).toHaveBeenCalledWith({
                event: 'profileList',
                profiles: [
                    { id: 'profile-1', name: 'Profile 1', isDefault: false },
                    { id: 'profile-2', name: 'Profile 2', isDefault: false }
                ]
            });
        });

        it('should handle error when fetching profiles', async () => {
            mockProfileManager.getAllProfiles.mockRejectedValueOnce(new Error('Database error'));

            await ProfileMigrationHelper.sendProfileList();

            expect(mockStreamDeck.logger.error).toHaveBeenCalledWith(
                'Failed to send profile list',
                expect.any(Error)
            );
            expect(mockStreamDeck.ui.current?.sendToPropertyInspector).not.toHaveBeenCalled();
        });

        it('should handle empty profile list', async () => {
            mockProfileManager.getAllProfiles.mockResolvedValueOnce([]);

            await ProfileMigrationHelper.sendProfileList();

            expect(mockStreamDeck.ui.current?.sendToPropertyInspector).toHaveBeenCalledWith({
                event: 'profileList',
                profiles: []
            });
        });
    });

    describe('initializeProfileManager', () => {
        it('should initialize ProfileManager', async () => {
            await ProfileMigrationHelper.initializeProfileManager();

            expect(mockProfileManager.initialize).toHaveBeenCalled();
        });

        it('should handle initialization error', async () => {
            mockProfileManager.initialize.mockRejectedValueOnce(new Error('Init failed'));

            await expect(ProfileMigrationHelper.initializeProfileManager()).rejects.toThrow('Init failed');
        });
    });

    describe('releaseProfileConnection', () => {
        it('should release profile connection', () => {
            ProfileMigrationHelper.releaseProfileConnection('profile-123');

            expect(mockConnectionPool.releaseProfileConnection).toHaveBeenCalledWith('profile-123');
        });
    });

    describe('isEncrypted (private method)', () => {
        it('should identify encrypted PAT', () => {
            const encryptedPAT = 'A'.repeat(101) + '=';
            const result = (ProfileMigrationHelper as any).isEncrypted(encryptedPAT);
            expect(result).toBe(true);
        });

        it('should identify base64 encrypted data', () => {
            const encryptedData = 'VGhpcyBpcyBhIGJhc2U2NCBlbmNvZGVkIHN0cmluZyB0aGF0IGlzIGxvbmcgZW5vdWdoIHRvIGJlIGNvbnNpZGVyZWQgZW5jcnlwdGVkIGRhdGEgYnkgdGhlIGhlbHBlciBmdW5jdGlvbg==';
            const result = (ProfileMigrationHelper as any).isEncrypted(encryptedData);
            expect(result).toBe(true);
        });

        it('should identify non-encrypted short PAT', () => {
            const plainPAT = 'short-plain-token';
            const result = (ProfileMigrationHelper as any).isEncrypted(plainPAT);
            expect(result).toBe(false);
        });

        it('should identify non-encrypted PAT with special characters', () => {
            const plainPAT = 'pat-with-special-chars!@#$%^&*()_+';
            const result = (ProfileMigrationHelper as any).isEncrypted(plainPAT);
            expect(result).toBe(false);
        });

        it('should handle empty string', () => {
            const result = (ProfileMigrationHelper as any).isEncrypted('');
            expect(result).toBe(false);
        });

        it('should handle long non-base64 string', () => {
            const longString = 'x'.repeat(150) + '!@#$%';
            const result = (ProfileMigrationHelper as any).isEncrypted(longString);
            expect(result).toBe(false);
        });
    });
});