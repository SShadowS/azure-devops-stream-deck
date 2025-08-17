import { ProfileManager } from "../services/profile-manager";
import { AzureDevOpsConnectionPool } from "../services/connection-pool";
import { CredentialManager } from "./credential-manager";
import streamDeck from "@elgato/streamdeck";

/**
 * Common helper functions for migrating actions to use profiles
 */
export class ProfileMigrationHelper {
    private static profileManager = ProfileManager.getInstance();
    private static connectionPool = AzureDevOpsConnectionPool.getInstance();
    private static credentialManager = new CredentialManager(streamDeck.logger);
    
    /**
     * Migrate legacy settings to use profiles if needed
     */
    static async migrateSettingsIfNeeded<T extends Record<string, any>>(
        action: any,
        settings: T,
        logger?: any
    ): Promise<T> {
        // If already using profile, no migration needed
        if (settings.profileId) {
            return settings;
        }
        
        // Check if we have legacy settings to migrate
        if (settings.organizationUrl && settings.personalAccessToken) {
            if (logger) {
                logger.info("Migrating legacy settings to profile", { actionId: action.id });
            }
            
            try {
                const migrationResult = await this.profileManager.migrateFromLegacySettings({
                    organizationUrl: settings.organizationUrl,
                    projectName: settings.projectName,
                    personalAccessToken: settings.personalAccessToken
                });
                
                // Update settings to use the profile
                const newSettings = {
                    ...settings,
                    profileId: migrationResult.profileId,
                    // Clear legacy fields
                    organizationUrl: undefined,
                    projectName: undefined,
                    personalAccessToken: undefined
                } as T;
                
                // Save the updated settings
                await action.setSettings(newSettings);
                
                if (logger) {
                    logger.info("Successfully migrated to profile", { 
                        profileId: migrationResult.profileId,
                        profileName: migrationResult.profileName
                    });
                }
                
                return newSettings;
            } catch (error) {
                if (logger) {
                    logger.error("Failed to migrate settings", error);
                }
                // Return original settings if migration fails
                return settings;
            }
        }
        
        return settings;
    }
    
    /**
     * Check if settings have valid configuration (profile or legacy)
     */
    static hasValidConfiguration(settings: Record<string, any>): boolean {
        // Check if profile is configured
        if (settings.profileId) {
            return true;
        }
        
        // Check legacy configuration
        return !!(settings.organizationUrl && settings.projectName && settings.personalAccessToken);
    }
    
    /**
     * Get connection configuration from profile or legacy settings
     */
    static async getConnectionConfig(settings: Record<string, any>): Promise<{
        organizationUrl: string;
        personalAccessToken: string;
        projectName?: string;
    } | null> {
        if (settings.profileId) {
            // Use profile-based configuration
            const config = await this.profileManager.getDecryptedConfig(settings.profileId);
            return config;
        } else if (settings.organizationUrl && settings.personalAccessToken) {
            // Use legacy configuration
            let decryptedPAT = settings.personalAccessToken;
            
            // Handle encrypted PATs
            if (this.isEncrypted(settings.personalAccessToken)) {
                decryptedPAT = this.credentialManager.decrypt(settings.personalAccessToken);
            }
            
            return {
                organizationUrl: settings.organizationUrl,
                personalAccessToken: decryptedPAT,
                projectName: settings.projectName
            };
        }
        
        return null;
    }
    
    /**
     * Send profile list to Property Inspector
     */
    static async sendProfileList(): Promise<void> {
        try {
            const profiles = await this.profileManager.getAllProfiles();
            const defaultProfile = await this.profileManager.getDefaultProfile();
            
            const profileList = profiles.map(profile => ({
                id: profile.id,
                name: profile.name,
                isDefault: profile.id === defaultProfile?.id
            }));
            
            await streamDeck.ui.current?.sendToPropertyInspector({
                event: "profileList",
                profiles: profileList
            });
            
        } catch (error) {
            streamDeck.logger.error("Failed to send profile list", error);
        }
    }
    
    /**
     * Initialize ProfileManager
     */
    static async initializeProfileManager(): Promise<void> {
        await this.profileManager.initialize();
    }
    
    /**
     * Release profile connection
     */
    static releaseProfileConnection(profileId: string): void {
        this.connectionPool.releaseProfileConnection(profileId);
    }
    
    /**
     * Check if a string is already encrypted (basic heuristic)
     */
    private static isEncrypted(value: string): boolean {
        // Check if it looks like encrypted data (base64 with specific pattern)
        // Encrypted PATs will be longer and contain base64 characters
        return value.length > 100 && /^[A-Za-z0-9+/]+=*$/.test(value);
    }
}