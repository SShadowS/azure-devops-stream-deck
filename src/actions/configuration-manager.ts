import { action, JsonValue, SingletonAction, WillAppearEvent, WillDisappearEvent, DidReceiveSettingsEvent, SendToPluginEvent, KeyDownEvent } from "@elgato/streamdeck";
import { ProfileManager } from "../services/profile-manager";
import { DevOpsProfile, ConnectionTestResult } from "../types/profiles";
import streamDeck from "@elgato/streamdeck";

/**
 * Settings for the Configuration Manager action
 */
interface Settings {
    currentProfileId?: string;
    [key: string]: any; // Allow additional properties for JsonObject compatibility
}

/**
 * Configuration Manager action for managing Azure DevOps connection profiles
 * Provides UI for creating, editing, deleting, and testing profiles
 */
@action({ UUID: "com.sshadows.azure-devops-info.configurationmanager" })
export class ConfigurationManagerAction extends SingletonAction<Settings> {
    private logger = streamDeck.logger.createScope("ConfigurationManager");
    private profileManager: ProfileManager;
    private updateInterval: NodeJS.Timeout | null = null;
    private profileChangeUnsubscribe: (() => void) | null = null;

    constructor() {
        super();
        this.profileManager = ProfileManager.getInstance();
        this.logger.info("ConfigurationManagerAction initialized");
    }

    /**
     * Called when the action appears on the Stream Deck
     */
    override async onWillAppear(ev: WillAppearEvent<Settings>): Promise<void> {
        this.logger.debug(`Configuration Manager appearing for context: ${ev.action.id}`);
        
        // Initialize ProfileManager if needed
        await this.profileManager.initialize();
        
        // Set initial state
        await this.updateDisplay(ev.action);
        
        // Start periodic updates
        this.startUpdateTimer(ev.action.id);
        
        // Subscribe to profile changes
        if (!this.profileChangeUnsubscribe) {
            this.profileChangeUnsubscribe = this.profileManager.onProfileChange(async (event) => {
                this.logger.debug(`Profile change detected: ${event.type} for ${event.profileId}`);
                await this.updateDisplay(ev.action);
                await this.sendProfileListUpdate();
            });
        }
    }

    /**
     * Called when the action disappears from the Stream Deck
     */
    override async onWillDisappear(ev: WillDisappearEvent<Settings>): Promise<void> {
        this.logger.debug(`Configuration Manager disappearing for context: ${ev.action.id}`);
        
        // Stop update timer
        this.stopUpdateTimer();
        
        // Unsubscribe from profile changes
        if (this.profileChangeUnsubscribe) {
            this.profileChangeUnsubscribe();
            this.profileChangeUnsubscribe = null;
        }
    }

    /**
     * Called when settings are changed in the Property Inspector
     */
    override async onDidReceiveSettings(ev: DidReceiveSettingsEvent<Settings>): Promise<void> {
        this.logger.debug(`Settings received:`, ev.payload.settings);
        
        // Update display based on new settings
        await this.updateDisplay(ev.action);
    }

    /**
     * Called when the action button is pressed
     */
    override async onKeyDown(ev: KeyDownEvent<Settings>): Promise<void> {
        this.logger.debug(`Key pressed for Configuration Manager`);
        
        // Open the Property Inspector for configuration
        await ev.action.showOk();
        
        // Optionally, cycle through profiles on press
        const profiles = await this.profileManager.getAllProfiles();
        if (profiles.length > 1) {
            const currentProfile = await this.getCurrentProfile(ev.payload.settings);
            const currentIndex = profiles.findIndex(p => p.id === currentProfile?.id);
            const nextIndex = (currentIndex + 1) % profiles.length;
            const nextProfile = profiles[nextIndex];
            
            await ev.action.setSettings({
                ...ev.payload.settings,
                currentProfileId: nextProfile.id
            });
            
            await this.updateDisplay(ev.action);
        }
    }

    /**
     * Handle messages from the Property Inspector
     */
    override async onSendToPlugin(ev: SendToPluginEvent<JsonValue, Settings>): Promise<void> {
        const payload = ev.payload as any;
        this.logger.debug(`Received event from Property Inspector:`, payload);

        if (!payload?.event) {
            return;
        }

        switch (payload.event) {
            case "getProfiles":
                await this.sendProfileList(ev.action);
                break;
                
            case "addProfile":
                await this.handleAddProfile(ev.action);
                break;
                
            case "editProfile":
                await this.handleEditProfile(ev.action, payload.profileId);
                break;
                
            case "deleteProfile":
                await this.handleDeleteProfile(ev.action, payload.profileId);
                break;
                
            case "saveProfile":
                await this.handleSaveProfile(ev.action, payload.profile);
                break;
                
            case "testConnection":
                await this.handleTestConnection(ev.action, payload.profileId || payload.profile);
                break;
                
            case "setDefaultProfile":
                await this.handleSetDefaultProfile(ev.action, payload.profileId);
                break;
                
            case "exportProfiles":
                await this.handleExportProfiles(ev.action);
                break;
                
            case "importProfiles":
                await this.handleImportProfiles(ev.action, payload.data);
                break;
                
            case "duplicateProfile":
                await this.handleDuplicateProfile(ev.action, payload.profileId, payload.newName);
                break;
                
            default:
                this.logger.warn(`Unknown event: ${payload.event}`);
        }
    }

    /**
     * Send the list of profiles to the Property Inspector
     */
    private async sendProfileList(action: any): Promise<void> {
        try {
            const profiles = await this.profileManager.getAllProfiles();
            const defaultProfile = await this.profileManager.getDefaultProfile();
            
            const profileList = profiles.map(profile => ({
                id: profile.id,
                name: profile.name,
                organizationUrl: profile.organizationUrl,
                projectName: profile.projectName,
                isDefault: profile.id === defaultProfile?.id,
                createdAt: profile.createdAt,
                updatedAt: profile.updatedAt
            }));
            
            await streamDeck.ui.current?.sendToPropertyInspector({
                event: "profileList",
                profiles: profileList,
                defaultProfileId: defaultProfile?.id
            });
            
            this.logger.debug(`Sent ${profileList.length} profiles to Property Inspector`);
        } catch (error) {
            this.logger.error("Failed to send profile list", error);
        }
    }

    /**
     * Send profile list update to all Property Inspectors
     */
    private async sendProfileListUpdate(): Promise<void> {
        try {
            const profiles = await this.profileManager.getAllProfiles();
            const defaultProfile = await this.profileManager.getDefaultProfile();
            
            const profileList = profiles.map(profile => ({
                id: profile.id,
                name: profile.name,
                organizationUrl: profile.organizationUrl,
                projectName: profile.projectName,
                isDefault: profile.id === defaultProfile?.id
            }));
            
            // Broadcast to all instances
            await streamDeck.ui.current?.sendToPropertyInspector({
                event: "profileListUpdated",
                profiles: profileList,
                defaultProfileId: defaultProfile?.id
            });
            
            this.logger.debug(`Broadcast profile update with ${profileList.length} profiles`);
        } catch (error) {
            this.logger.error("Failed to broadcast profile update", error);
        }
    }

    /**
     * Handle add profile request
     */
    private async handleAddProfile(action: any): Promise<void> {
        this.logger.debug("Handling add profile request");
        
        // Send event to show profile editor in add mode
        await streamDeck.ui.current?.sendToPropertyInspector({
            event: "showProfileEditor",
            mode: "add",
            profile: {
                name: "",
                organizationUrl: "",
                projectName: "",
                personalAccessToken: ""
            }
        });
    }

    /**
     * Handle edit profile request
     */
    private async handleEditProfile(action: any, profileId: string): Promise<void> {
        this.logger.debug(`Handling edit profile request for ${profileId}`);
        
        const profile = await this.profileManager.getProfile(profileId);
        if (!profile) {
            await streamDeck.ui.current?.sendToPropertyInspector({
                event: "error",
                message: "Profile not found"
            });
            return;
        }
        
        // Don't send the encrypted PAT to the UI
        await streamDeck.ui.current?.sendToPropertyInspector({
            event: "showProfileEditor",
            mode: "edit",
            profile: {
                id: profile.id,
                name: profile.name,
                organizationUrl: profile.organizationUrl,
                projectName: profile.projectName,
                personalAccessToken: "", // Empty for security
                isDefault: profile.isDefault
            }
        });
    }

    /**
     * Handle delete profile request
     */
    private async handleDeleteProfile(action: any, profileId: string): Promise<void> {
        this.logger.debug(`Handling delete profile request for ${profileId}`);
        
        try {
            const success = await this.profileManager.deleteProfile(profileId);
            
            if (success) {
                await streamDeck.ui.current?.sendToPropertyInspector({
                    event: "profileDeleted",
                    profileId: profileId
                });
                
                // Update profile list
                await this.sendProfileList(action);
                
                // Update display
                await this.updateDisplay(action);
            } else {
                await streamDeck.ui.current?.sendToPropertyInspector({
                    event: "error",
                    message: "Failed to delete profile"
                });
            }
        } catch (error) {
            this.logger.error(`Failed to delete profile ${profileId}`, error);
            await streamDeck.ui.current?.sendToPropertyInspector({
                event: "error",
                message: error instanceof Error ? error.message : "Failed to delete profile"
            });
        }
    }

    /**
     * Handle save profile request
     */
    private async handleSaveProfile(action: any, profileData: any): Promise<void> {
        this.logger.debug("Handling save profile request", profileData);
        
        try {
            let profile: DevOpsProfile;
            
            if (profileData.id) {
                // Update existing profile
                const updates: any = {
                    name: profileData.name,
                    organizationUrl: profileData.organizationUrl,
                    projectName: profileData.projectName,
                    isDefault: profileData.isDefault
                };
                
                // Only update PAT if provided
                if (profileData.personalAccessToken && profileData.personalAccessToken.trim()) {
                    updates.personalAccessToken = profileData.personalAccessToken;
                }
                
                profile = await this.profileManager.updateProfile(profileData.id, updates);
                
                await streamDeck.ui.current?.sendToPropertyInspector({
                    event: "profileUpdated",
                    profile: {
                        id: profile.id,
                        name: profile.name,
                        organizationUrl: profile.organizationUrl,
                        projectName: profile.projectName,
                        isDefault: profile.isDefault
                    }
                });
            } else {
                // Create new profile
                profile = await this.profileManager.createProfile({
                    name: profileData.name,
                    organizationUrl: profileData.organizationUrl,
                    projectName: profileData.projectName,
                    personalAccessToken: profileData.personalAccessToken,
                    isDefault: profileData.isDefault
                });
                
                await streamDeck.ui.current?.sendToPropertyInspector({
                    event: "profileCreated",
                    profile: {
                        id: profile.id,
                        name: profile.name,
                        organizationUrl: profile.organizationUrl,
                        projectName: profile.projectName,
                        isDefault: profile.isDefault
                    }
                });
            }
            
            // Update profile list
            await this.sendProfileList(action);
            
            // Update display
            await this.updateDisplay(action);
            
        } catch (error) {
            this.logger.error("Failed to save profile", error);
            await streamDeck.ui.current?.sendToPropertyInspector({
                event: "error",
                message: error instanceof Error ? error.message : "Failed to save profile"
            });
        }
    }

    /**
     * Handle test connection request
     */
    private async handleTestConnection(action: any, profileIdOrData: string | any): Promise<void> {
        this.logger.debug("Handling test connection request");
        
        try {
            let result: ConnectionTestResult;
            
            if (typeof profileIdOrData === 'string') {
                // Test existing profile
                result = await this.profileManager.testConnection(profileIdOrData);
            } else {
                // Test new profile data
                const tempProfile = await this.profileManager.createProfile({
                    name: "__temp_test__",
                    organizationUrl: profileIdOrData.organizationUrl,
                    projectName: profileIdOrData.projectName,
                    personalAccessToken: profileIdOrData.personalAccessToken
                });
                
                result = await this.profileManager.testConnection(tempProfile.id);
                
                // Delete temp profile
                await this.profileManager.deleteProfile(tempProfile.id);
            }
            
            await streamDeck.ui.current?.sendToPropertyInspector({
                event: "connectionTestResult",
                result: result as any
            });
            
        } catch (error) {
            this.logger.error("Connection test failed", error);
            await streamDeck.ui.current?.sendToPropertyInspector({
                event: "connectionTestResult",
                result: {
                    success: false,
                    error: error instanceof Error ? error.message : "Connection test failed"
                }
            });
        }
    }

    /**
     * Handle set default profile request
     */
    private async handleSetDefaultProfile(action: any, profileId: string): Promise<void> {
        this.logger.debug(`Setting default profile to ${profileId}`);
        
        try {
            await this.profileManager.setDefaultProfile(profileId);
            
            await streamDeck.ui.current?.sendToPropertyInspector({
                event: "defaultProfileSet",
                profileId: profileId
            });
            
            // Update profile list
            await this.sendProfileList(action);
            
        } catch (error) {
            this.logger.error(`Failed to set default profile`, error);
            await streamDeck.ui.current?.sendToPropertyInspector({
                event: "error",
                message: error instanceof Error ? error.message : "Failed to set default profile"
            });
        }
    }

    /**
     * Handle export profiles request
     */
    private async handleExportProfiles(action: any): Promise<void> {
        this.logger.debug("Handling export profiles request");
        
        try {
            // Use ProfileManager's export method (without passwords by default)
            const exportData = await this.profileManager.exportProfiles(false);
            
            await streamDeck.ui.current?.sendToPropertyInspector({
                event: "profilesExported",
                data: exportData
            });
            
        } catch (error) {
            this.logger.error("Failed to export profiles", error);
            await streamDeck.ui.current?.sendToPropertyInspector({
                event: "error",
                message: "Failed to export profiles"
            });
        }
    }

    /**
     * Handle import profiles request
     */
    private async handleImportProfiles(action: any, data: string): Promise<void> {
        this.logger.debug("Handling import profiles request");
        
        try {
            // Use ProfileManager's import method
            const result = await this.profileManager.importProfiles(data, false);
            
            await streamDeck.ui.current?.sendToPropertyInspector({
                event: "profilesImported",
                imported: result.imported,
                skipped: result.skipped,
                errors: result.errors
            });
            
            // Update profile list
            await this.sendProfileList(action);
            
        } catch (error) {
            this.logger.error("Failed to import profiles", error);
            await streamDeck.ui.current?.sendToPropertyInspector({
                event: "error",
                message: error instanceof Error ? error.message : "Failed to import profiles"
            });
        }
    }
    
    /**
     * Handle duplicate profile request
     */
    private async handleDuplicateProfile(action: any, profileId: string, newName?: string): Promise<void> {
        this.logger.debug(`Handling duplicate profile request for ${profileId}`);
        
        try {
            // Use ProfileManager's duplicate method
            const duplicatedProfile = await this.profileManager.duplicateProfile(profileId, newName);
            
            await streamDeck.ui.current?.sendToPropertyInspector({
                event: "profileDuplicated",
                profile: {
                    id: duplicatedProfile.id,
                    name: duplicatedProfile.name,
                    organizationUrl: duplicatedProfile.organizationUrl,
                    projectName: duplicatedProfile.projectName,
                    isDefault: duplicatedProfile.isDefault
                }
            });
            
            // Update profile list
            await this.sendProfileList(action);
            
            // Update display
            await this.updateDisplay(action);
            
        } catch (error) {
            this.logger.error(`Failed to duplicate profile ${profileId}`, error);
            await streamDeck.ui.current?.sendToPropertyInspector({
                event: "error",
                message: error instanceof Error ? error.message : "Failed to duplicate profile"
            });
        }
    }

    /**
     * Update the display based on current state
     */
    private async updateDisplay(action: any): Promise<void> {
        try {
            const settings = await action.getSettings() as Settings;
            const profiles = await this.profileManager.getAllProfiles();
            
            if (profiles.length === 0) {
                await action.setTitle("No Profiles");
                await action.setState(1); // Disconnected state
                return;
            }
            
            const currentProfile = await this.getCurrentProfile(settings);
            
            if (currentProfile) {
                await action.setTitle(currentProfile.name);
                await action.setState(0); // Connected state
            } else {
                const defaultProfile = await this.profileManager.getDefaultProfile();
                if (defaultProfile) {
                    await action.setTitle(defaultProfile.name);
                    await action.setState(0); // Connected state
                } else {
                    await action.setTitle("Select Profile");
                    await action.setState(1); // Disconnected state
                }
            }
        } catch (error) {
            this.logger.error("Failed to update display", error);
            await action.setTitle("Error");
            await action.setState(1); // Disconnected state
        }
    }

    /**
     * Get the current profile based on settings
     */
    private async getCurrentProfile(settings: Settings): Promise<DevOpsProfile | null> {
        if (settings.currentProfileId) {
            return await this.profileManager.getProfile(settings.currentProfileId);
        }
        return await this.profileManager.getDefaultProfile();
    }

    /**
     * Start the update timer
     */
    private startUpdateTimer(actionId: string): void {
        this.stopUpdateTimer();
        
        // Update every 30 seconds
        this.updateInterval = setInterval(async () => {
            const action = streamDeck.actions.getActionById(actionId);
            if (action) {
                await this.updateDisplay(action);
            } else {
                this.stopUpdateTimer();
            }
        }, 30000);
    }

    /**
     * Stop the update timer
     */
    private stopUpdateTimer(): void {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
        }
    }
}