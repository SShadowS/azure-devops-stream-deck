import { ConfigurationManagerAction } from '../configuration-manager';
import { ProfileManager } from '../../services/profile-manager';
import { streamDeck } from '@elgato/streamdeck';
import { WillAppearEvent, WillDisappearEvent, DidReceiveSettingsEvent, SendToPluginEvent, KeyDownEvent } from '@elgato/streamdeck';

// Mock dependencies
jest.mock('@elgato/streamdeck');
jest.mock('../../services/profile-manager');

describe('ConfigurationManagerAction', () => {
    let action: ConfigurationManagerAction;
    let mockProfileManager: jest.Mocked<ProfileManager>;
    let mockAction: any;
    let mockStreamDeckUI: any;

    beforeEach(() => {
        jest.clearAllMocks();

        // Setup StreamDeck mocks
        mockStreamDeckUI = {
            sendToPropertyInspector: jest.fn()
        };

        (streamDeck as any).logger = {
            createScope: jest.fn().mockReturnValue({
                info: jest.fn(),
                debug: jest.fn(),
                warn: jest.fn(),
                error: jest.fn()
            })
        };

        (streamDeck as any).ui = {
            current: mockStreamDeckUI
        };

        (streamDeck as any).actions = {
            getActionById: jest.fn()
        };

        // Setup ProfileManager mock
        mockProfileManager = {
            getInstance: jest.fn(),
            initialize: jest.fn().mockResolvedValue(undefined),
            getAllProfiles: jest.fn().mockResolvedValue([]),
            getProfile: jest.fn(),
            getDefaultProfile: jest.fn(),
            createProfile: jest.fn(),
            updateProfile: jest.fn(),
            deleteProfile: jest.fn(),
            setDefaultProfile: jest.fn(),
            testConnection: jest.fn(),
            findMatchingProfile: jest.fn(),
            onProfileChange: jest.fn().mockReturnValue(() => {}),
            getDecryptedConfig: jest.fn(),
            migrateFromLegacySettings: jest.fn(),
            validateProfile: jest.fn(),
            clearAllProfiles: jest.fn(),
            exportProfiles: jest.fn().mockResolvedValue('[]')
        } as any;

        (ProfileManager.getInstance as jest.Mock).mockReturnValue(mockProfileManager);

        // Setup action mock
        mockAction = {
            id: 'test-action-id',
            getSettings: jest.fn().mockResolvedValue({}),
            setSettings: jest.fn().mockResolvedValue(undefined),
            setTitle: jest.fn().mockResolvedValue(undefined),
            setState: jest.fn().mockResolvedValue(undefined),
            showOk: jest.fn().mockResolvedValue(undefined)
        };

        // Create action instance
        action = new ConfigurationManagerAction();
    });

    afterEach(() => {
        jest.clearAllTimers();
    });

    describe('onWillAppear', () => {
        it('should initialize ProfileManager and update display', async () => {
            const event: WillAppearEvent<any> = {
                action: mockAction,
                payload: {
                    settings: {},
                    coordinates: { column: 0, row: 0 },
                    state: 0,
                    isInMultiAction: false
                }
            } as any;

            await action.onWillAppear(event);

            expect(mockProfileManager.initialize).toHaveBeenCalled();
            expect(mockAction.setTitle).toHaveBeenCalled();
            expect(mockAction.setState).toHaveBeenCalled();
        });

        it('should subscribe to profile changes', async () => {
            const event: WillAppearEvent<any> = {
                action: mockAction,
                payload: { settings: {} }
            } as any;

            await action.onWillAppear(event);

            expect(mockProfileManager.onProfileChange).toHaveBeenCalled();
        });

        it('should display "No Profiles" when no profiles exist', async () => {
            mockProfileManager.getAllProfiles.mockResolvedValue([]);

            const event: WillAppearEvent<any> = {
                action: mockAction,
                payload: { settings: {} }
            } as any;

            await action.onWillAppear(event);

            expect(mockAction.setTitle).toHaveBeenCalledWith('No Profiles');
            expect(mockAction.setState).toHaveBeenCalledWith(1); // Disconnected state
        });

        it('should display current profile name when profile exists', async () => {
            const mockProfile = {
                id: 'profile-1',
                name: 'Test Profile',
                organizationUrl: 'https://dev.azure.com/test',
                projectName: 'TestProject',
                personalAccessToken: 'encrypted',
                createdAt: Date.now(),
                updatedAt: Date.now()
            };

            mockProfileManager.getAllProfiles.mockResolvedValue([mockProfile]);
            mockProfileManager.getProfile.mockResolvedValue(mockProfile);
            mockAction.getSettings.mockResolvedValue({ currentProfileId: 'profile-1' });

            const event: WillAppearEvent<any> = {
                action: mockAction,
                payload: { settings: { currentProfileId: 'profile-1' } }
            } as any;

            await action.onWillAppear(event);

            expect(mockAction.setTitle).toHaveBeenCalledWith('Test Profile');
            expect(mockAction.setState).toHaveBeenCalledWith(0); // Connected state
        });
    });

    describe('onWillDisappear', () => {
        it('should clean up resources', async () => {
            const appearEvent: WillAppearEvent<any> = {
                action: mockAction,
                payload: { settings: {} }
            } as any;

            // First appear to set up timers and subscriptions
            await action.onWillAppear(appearEvent);

            const disappearEvent: WillDisappearEvent<any> = {
                action: mockAction,
                payload: { settings: {} }
            } as any;

            await action.onWillDisappear(disappearEvent);

            // Should not throw any errors
            expect(true).toBe(true);
        });
    });

    describe('onKeyDown', () => {
        it('should show OK and cycle through profiles', async () => {
            const profiles = [
                { id: 'profile-1', name: 'Profile 1' },
                { id: 'profile-2', name: 'Profile 2' }
            ];

            mockProfileManager.getAllProfiles.mockResolvedValue(profiles as any);
            mockProfileManager.getProfile.mockResolvedValue(profiles[0] as any);

            const event: KeyDownEvent<any> = {
                action: mockAction,
                payload: {
                    settings: { currentProfileId: 'profile-1' },
                    coordinates: { column: 0, row: 0 },
                    state: 0,
                    userDesiredState: 0,
                    isInMultiAction: false
                }
            } as any;

            await action.onKeyDown(event);

            expect(mockAction.showOk).toHaveBeenCalled();
            expect(mockAction.setSettings).toHaveBeenCalledWith({
                currentProfileId: 'profile-2'
            });
        });

        it('should not cycle when only one profile exists', async () => {
            const profiles = [
                { id: 'profile-1', name: 'Profile 1' }
            ];

            mockProfileManager.getAllProfiles.mockResolvedValue(profiles as any);

            const event: KeyDownEvent<any> = {
                action: mockAction,
                payload: { settings: {} }
            } as any;

            await action.onKeyDown(event);

            expect(mockAction.showOk).toHaveBeenCalled();
            expect(mockAction.setSettings).not.toHaveBeenCalled();
        });
    });

    describe('onSendToPlugin', () => {
        describe('getProfiles event', () => {
            it('should send profile list to Property Inspector', async () => {
                const profiles = [
                    {
                        id: 'profile-1',
                        name: 'Profile 1',
                        organizationUrl: 'https://dev.azure.com/org1',
                        projectName: 'Project1',
                        personalAccessToken: 'encrypted',
                        createdAt: Date.now(),
                        updatedAt: Date.now(),
                        isDefault: true
                    }
                ];

                mockProfileManager.getAllProfiles.mockResolvedValue(profiles as any);
                mockProfileManager.getDefaultProfile.mockResolvedValue(profiles[0] as any);

                const event: SendToPluginEvent<any, any> = {
                    action: mockAction,
                    payload: { event: 'getProfiles' }
                } as any;

                await action.onSendToPlugin(event);

                expect(mockStreamDeckUI.sendToPropertyInspector).toHaveBeenCalledWith({
                    event: 'profileList',
                    profiles: expect.arrayContaining([
                        expect.objectContaining({
                            id: 'profile-1',
                            name: 'Profile 1',
                            organizationUrl: 'https://dev.azure.com/org1',
                            projectName: 'Project1',
                            isDefault: true
                        })
                    ]),
                    defaultProfileId: 'profile-1'
                });
            });
        });

        describe('addProfile event', () => {
            it('should show profile editor in add mode', async () => {
                const event: SendToPluginEvent<any, any> = {
                    action: mockAction,
                    payload: { event: 'addProfile' }
                } as any;

                await action.onSendToPlugin(event);

                expect(mockStreamDeckUI.sendToPropertyInspector).toHaveBeenCalledWith({
                    event: 'showProfileEditor',
                    mode: 'add',
                    profile: {
                        name: '',
                        organizationUrl: '',
                        projectName: '',
                        personalAccessToken: ''
                    }
                });
            });
        });

        describe('saveProfile event', () => {
            it('should create new profile', async () => {
                const newProfile = {
                    name: 'New Profile',
                    organizationUrl: 'https://dev.azure.com/new',
                    projectName: 'NewProject',
                    personalAccessToken: 'new-token'
                };

                const createdProfile = {
                    ...newProfile,
                    id: 'new-profile-id',
                    personalAccessToken: 'encrypted',
                    createdAt: Date.now(),
                    updatedAt: Date.now()
                };

                mockProfileManager.createProfile.mockResolvedValue(createdProfile as any);

                const event: SendToPluginEvent<any, any> = {
                    action: mockAction,
                    payload: {
                        event: 'saveProfile',
                        profile: newProfile
                    }
                } as any;

                await action.onSendToPlugin(event);

                expect(mockProfileManager.createProfile).toHaveBeenCalledWith(
                    expect.objectContaining({
                        name: 'New Profile',
                        organizationUrl: 'https://dev.azure.com/new',
                        projectName: 'NewProject',
                        personalAccessToken: 'new-token'
                    })
                );

                expect(mockStreamDeckUI.sendToPropertyInspector).toHaveBeenCalledWith({
                    event: 'profileCreated',
                    profile: expect.objectContaining({
                        id: 'new-profile-id',
                        name: 'New Profile'
                    })
                });
            });

            it('should update existing profile', async () => {
                const profileUpdate = {
                    id: 'existing-id',
                    name: 'Updated Profile',
                    organizationUrl: 'https://dev.azure.com/updated',
                    projectName: 'UpdatedProject',
                    personalAccessToken: '' // Empty PAT should not update
                };

                const updatedProfile = {
                    ...profileUpdate,
                    personalAccessToken: 'encrypted',
                    createdAt: Date.now() - 1000,
                    updatedAt: Date.now()
                };

                mockProfileManager.updateProfile.mockResolvedValue(updatedProfile as any);

                const event: SendToPluginEvent<any, any> = {
                    action: mockAction,
                    payload: {
                        event: 'saveProfile',
                        profile: profileUpdate
                    }
                } as any;

                await action.onSendToPlugin(event);

                expect(mockProfileManager.updateProfile).toHaveBeenCalledWith(
                    'existing-id',
                    expect.objectContaining({
                        name: 'Updated Profile',
                        organizationUrl: 'https://dev.azure.com/updated',
                        projectName: 'UpdatedProject'
                    })
                );

                expect(mockStreamDeckUI.sendToPropertyInspector).toHaveBeenCalledWith({
                    event: 'profileUpdated',
                    profile: expect.objectContaining({
                        id: 'existing-id',
                        name: 'Updated Profile'
                    })
                });
            });
        });

        describe('deleteProfile event', () => {
            it('should delete profile successfully', async () => {
                mockProfileManager.deleteProfile.mockResolvedValue(true);

                const event: SendToPluginEvent<any, any> = {
                    action: mockAction,
                    payload: {
                        event: 'deleteProfile',
                        profileId: 'profile-to-delete'
                    }
                } as any;

                await action.onSendToPlugin(event);

                expect(mockProfileManager.deleteProfile).toHaveBeenCalledWith('profile-to-delete');
                expect(mockStreamDeckUI.sendToPropertyInspector).toHaveBeenCalledWith({
                    event: 'profileDeleted',
                    profileId: 'profile-to-delete'
                });
            });

            it('should handle delete failure', async () => {
                mockProfileManager.deleteProfile.mockResolvedValue(false);

                const event: SendToPluginEvent<any, any> = {
                    action: mockAction,
                    payload: {
                        event: 'deleteProfile',
                        profileId: 'profile-to-delete'
                    }
                } as any;

                await action.onSendToPlugin(event);

                expect(mockStreamDeckUI.sendToPropertyInspector).toHaveBeenCalledWith({
                    event: 'error',
                    message: 'Failed to delete profile'
                });
            });
        });

        describe('testConnection event', () => {
            it('should test connection for existing profile', async () => {
                const testResult = {
                    success: true,
                    details: {
                        organizationName: 'TestOrg',
                        projectName: 'TestProject',
                        userName: 'Connected'
                    }
                };

                mockProfileManager.testConnection.mockResolvedValue(testResult);

                const event: SendToPluginEvent<any, any> = {
                    action: mockAction,
                    payload: {
                        event: 'testConnection',
                        profileId: 'profile-1'
                    }
                } as any;

                await action.onSendToPlugin(event);

                expect(mockProfileManager.testConnection).toHaveBeenCalledWith('profile-1');
                expect(mockStreamDeckUI.sendToPropertyInspector).toHaveBeenCalledWith({
                    event: 'connectionTestResult',
                    result: testResult
                });
            });

            it('should test connection for new profile data', async () => {
                const profileData = {
                    organizationUrl: 'https://dev.azure.com/test',
                    projectName: 'TestProject',
                    personalAccessToken: 'test-token'
                };

                const tempProfile = {
                    id: 'temp-id',
                    name: '__temp_test__',
                    ...profileData,
                    personalAccessToken: 'encrypted',
                    createdAt: Date.now(),
                    updatedAt: Date.now()
                };

                const testResult = {
                    success: true,
                    details: {
                        organizationName: 'test',
                        projectName: 'TestProject',
                        userName: 'Connected'
                    }
                };

                mockProfileManager.createProfile.mockResolvedValue(tempProfile as any);
                mockProfileManager.testConnection.mockResolvedValue(testResult);
                mockProfileManager.deleteProfile.mockResolvedValue(true);

                const event: SendToPluginEvent<any, any> = {
                    action: mockAction,
                    payload: {
                        event: 'testConnection',
                        profile: profileData
                    }
                } as any;

                await action.onSendToPlugin(event);

                expect(mockProfileManager.createProfile).toHaveBeenCalled();
                expect(mockProfileManager.testConnection).toHaveBeenCalledWith('temp-id');
                expect(mockProfileManager.deleteProfile).toHaveBeenCalledWith('temp-id');
                expect(mockStreamDeckUI.sendToPropertyInspector).toHaveBeenCalledWith({
                    event: 'connectionTestResult',
                    result: testResult
                });
            });
        });

        describe('setDefaultProfile event', () => {
            it('should set default profile', async () => {
                mockProfileManager.setDefaultProfile.mockResolvedValue(undefined);

                const event: SendToPluginEvent<any, any> = {
                    action: mockAction,
                    payload: {
                        event: 'setDefaultProfile',
                        profileId: 'profile-1'
                    }
                } as any;

                await action.onSendToPlugin(event);

                expect(mockProfileManager.setDefaultProfile).toHaveBeenCalledWith('profile-1');
                expect(mockStreamDeckUI.sendToPropertyInspector).toHaveBeenCalledWith({
                    event: 'defaultProfileSet',
                    profileId: 'profile-1'
                });
            });
        });

        describe('exportProfiles event', () => {
            it('should export profiles without PATs', async () => {
                const exportData = JSON.stringify([
                    {
                        name: 'Profile 1',
                        organizationUrl: 'https://dev.azure.com/org1',
                        projectName: 'Project1',
                        isDefault: false,
                        createdAt: Date.now(),
                        updatedAt: Date.now()
                    }
                ], null, 2);

                mockProfileManager.exportProfiles.mockResolvedValue(exportData);

                const event: SendToPluginEvent<any, any> = {
                    action: mockAction,
                    payload: { event: 'exportProfiles' }
                } as any;

                await action.onSendToPlugin(event);

                expect(mockStreamDeckUI.sendToPropertyInspector).toHaveBeenCalledWith({
                    event: 'profilesExported',
                    data: expect.stringContaining('Profile 1')
                });

                // Verify PAT is not in the exported data
                const callArg = mockStreamDeckUI.sendToPropertyInspector.mock.calls[0][0];
                expect(callArg.data).not.toContain('encrypted-token');
            });
        });

        describe('unknown event', () => {
            it('should handle unknown events gracefully', async () => {
                const event: SendToPluginEvent<any, any> = {
                    action: mockAction,
                    payload: { event: 'unknownEvent' }
                } as any;

                await action.onSendToPlugin(event);

                // Should not throw an error
                expect(true).toBe(true);
            });
        });
    });

    describe('onDidReceiveSettings', () => {
        it('should update display when settings change', async () => {
            const event: DidReceiveSettingsEvent<any> = {
                action: mockAction,
                payload: {
                    settings: { currentProfileId: 'new-profile' },
                    coordinates: { column: 0, row: 0 },
                    state: 0,
                    isInMultiAction: false
                }
            } as any;

            await action.onDidReceiveSettings(event);

            expect(mockAction.setTitle).toHaveBeenCalled();
            expect(mockAction.setState).toHaveBeenCalled();
        });
    });

    describe('Profile change subscription', () => {
        it('should update display when profiles change', async () => {
            let profileChangeCallback: any;
            mockProfileManager.onProfileChange.mockImplementation((callback) => {
                profileChangeCallback = callback;
                return () => {};
            });

            const event: WillAppearEvent<any> = {
                action: mockAction,
                payload: { settings: {} }
            } as any;

            await action.onWillAppear(event);

            // Simulate profile change
            await profileChangeCallback({
                type: 'updated',
                profileId: 'profile-1',
                profile: { name: 'Updated Profile' }
            });

            expect(mockAction.setTitle).toHaveBeenCalled();
            expect(mockStreamDeckUI.sendToPropertyInspector).toHaveBeenCalledWith(
                expect.objectContaining({
                    event: 'profileListUpdated'
                })
            );
        });
    });
});