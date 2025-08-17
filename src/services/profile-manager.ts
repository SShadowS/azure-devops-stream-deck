import { streamDeck } from "@elgato/streamdeck";
import { v4 as uuidv4 } from 'uuid';
import {
    DevOpsProfile,
    GlobalSettings,
    LegacySettings,
    MigrationResult,
    ValidationResult,
    ConnectionTestResult,
    ProfileChangeEvent
} from '../types/profiles';
import { CredentialManager } from '../utils/credential-manager';
import { AzureDevOpsClient } from './azure-devops-client';

/**
 * Manages Azure DevOps configuration profiles
 * Provides CRUD operations, validation, and migration capabilities
 */
export class ProfileManager {
    private static instance: ProfileManager;
    private readonly SETTINGS_KEY = 'devopsProfiles';
    private readonly CURRENT_VERSION = 1;
    private credentialManager: CredentialManager;
    private profiles: Map<string, DevOpsProfile> = new Map();
    private defaultProfileId?: string;
    private changeListeners: Set<(event: ProfileChangeEvent) => void> = new Set();
    private initialized = false;

    private constructor() {
        // Handle test environment where streamDeck might not be fully available
        const logger = streamDeck?.logger || {
            createScope: () => ({
                info: () => {},
                error: () => {},
                debug: () => {},
                warn: () => {},
                trace: () => {}
            })
        };
        this.credentialManager = new CredentialManager(logger);
    }

    /**
     * Get the singleton instance of ProfileManager
     */
    public static getInstance(): ProfileManager {
        if (!ProfileManager.instance) {
            ProfileManager.instance = new ProfileManager();
        }
        return ProfileManager.instance;
    }

    /**
     * Initialize the ProfileManager by loading existing profiles
     */
    public async initialize(): Promise<void> {
        if (this.initialized) {
            return;
        }

        try {
            await this.loadProfiles();
            this.initialized = true;
            streamDeck.logger.info('ProfileManager initialized successfully');
        } catch (error) {
            streamDeck.logger.error('Failed to initialize ProfileManager', error);
            throw error;
        }
    }

    /**
     * Load profiles from global settings
     */
    private async loadProfiles(): Promise<void> {
        try {
            const settings = await streamDeck.settings.getGlobalSettings() as unknown as GlobalSettings;
            
            if (settings?.profiles) {
                this.profiles.clear();
                Object.entries(settings.profiles).forEach(([id, profile]) => {
                    this.profiles.set(id, profile);
                });
                this.defaultProfileId = settings.defaultProfileId;
                streamDeck.logger.debug(`Loaded ${this.profiles.size} profiles`);
            } else {
                // Initialize with empty profiles if none exist
                await this.saveProfiles();
            }
        } catch (error) {
            streamDeck.logger.error('Failed to load profiles', error);
            // Initialize with empty state on error
            this.profiles.clear();
            this.defaultProfileId = undefined;
        }
    }

    /**
     * Save profiles to global settings
     */
    private async saveProfiles(): Promise<void> {
        try {
            const settings: GlobalSettings = {
                profiles: Object.fromEntries(this.profiles),
                defaultProfileId: this.defaultProfileId,
                version: this.CURRENT_VERSION
            };

            await streamDeck.settings.setGlobalSettings(settings as any);
            streamDeck.logger.debug('Profiles saved successfully');
        } catch (error) {
            streamDeck.logger.error('Failed to save profiles', error);
            throw error;
        }
    }

    /**
     * Create a new profile
     */
    public async createProfile(
        profileData: Omit<DevOpsProfile, 'id' | 'createdAt' | 'updatedAt'>
    ): Promise<DevOpsProfile> {
        await this.initialize();

        // Validate the profile data
        const validation = await this.validateProfileData(profileData);
        if (!validation.isValid) {
            throw new Error(`Invalid profile: ${validation.errors.join(', ')}`);
        }

        // Encrypt the PAT
        const encryptedPAT = await this.credentialManager.encrypt(profileData.personalAccessToken);

        const profile: DevOpsProfile = {
            ...profileData,
            id: uuidv4(),
            personalAccessToken: encryptedPAT,
            createdAt: Date.now(),
            updatedAt: Date.now()
        };

        // If this is the first profile or marked as default, set it as default
        if (this.profiles.size === 0 || profileData.isDefault) {
            this.defaultProfileId = profile.id;
            profile.isDefault = true;
            
            // Remove default flag from other profiles
            if (profileData.isDefault) {
                this.profiles.forEach(p => {
                    p.isDefault = false;
                });
            }
        }

        this.profiles.set(profile.id, profile);
        await this.saveProfiles();

        this.notifyListeners({
            type: 'created',
            profileId: profile.id,
            profile
        });

        streamDeck.logger.info(`Created profile: ${profile.name} (${profile.id})`);
        return profile;
    }

    /**
     * Update an existing profile
     */
    public async updateProfile(
        id: string,
        updates: Partial<Omit<DevOpsProfile, 'id' | 'createdAt'>>
    ): Promise<DevOpsProfile> {
        await this.initialize();

        const profile = this.profiles.get(id);
        if (!profile) {
            throw new Error(`Profile not found: ${id}`);
        }

        // If PAT is being updated, encrypt it
        if (updates.personalAccessToken) {
            updates.personalAccessToken = await this.credentialManager.encrypt(updates.personalAccessToken);
        }

        // Handle default profile update
        if (updates.isDefault === true && this.defaultProfileId !== id) {
            this.profiles.forEach(p => {
                p.isDefault = false;
            });
            this.defaultProfileId = id;
        }

        const updatedProfile: DevOpsProfile = {
            ...profile,
            ...updates,
            id: profile.id,
            createdAt: profile.createdAt,
            updatedAt: Date.now()
        };

        // Validate the updated profile
        const validation = await this.validateProfileData(updatedProfile);
        if (!validation.isValid) {
            throw new Error(`Invalid profile update: ${validation.errors.join(', ')}`);
        }

        this.profiles.set(id, updatedProfile);
        await this.saveProfiles();

        this.notifyListeners({
            type: 'updated',
            profileId: id,
            profile: updatedProfile
        });

        streamDeck.logger.info(`Updated profile: ${updatedProfile.name} (${id})`);
        return updatedProfile;
    }

    /**
     * Delete a profile
     */
    public async deleteProfile(id: string): Promise<boolean> {
        await this.initialize();

        const profile = this.profiles.get(id);
        if (!profile) {
            return false;
        }

        // Prevent deletion of the last profile
        if (this.profiles.size === 1) {
            throw new Error('Cannot delete the last profile');
        }

        // If deleting the default profile, set another as default
        if (this.defaultProfileId === id) {
            const remainingProfiles = Array.from(this.profiles.keys()).filter(pid => pid !== id);
            if (remainingProfiles.length > 0) {
                this.defaultProfileId = remainingProfiles[0];
                const newDefault = this.profiles.get(this.defaultProfileId);
                if (newDefault) {
                    newDefault.isDefault = true;
                }
            }
        }

        this.profiles.delete(id);
        await this.saveProfiles();

        this.notifyListeners({
            type: 'deleted',
            profileId: id
        });

        streamDeck.logger.info(`Deleted profile: ${profile.name} (${id})`);
        return true;
    }

    /**
     * Get a profile by ID
     */
    public async getProfile(id: string): Promise<DevOpsProfile | null> {
        await this.initialize();
        return this.profiles.get(id) || null;
    }

    /**
     * Get all profiles
     */
    public async getAllProfiles(): Promise<DevOpsProfile[]> {
        await this.initialize();
        return Array.from(this.profiles.values());
    }

    /**
     * Set the default profile
     */
    public async setDefaultProfile(id: string): Promise<void> {
        await this.initialize();

        const profile = this.profiles.get(id);
        if (!profile) {
            throw new Error(`Profile not found: ${id}`);
        }

        // Update all profiles' default status
        this.profiles.forEach(p => {
            p.isDefault = p.id === id;
        });

        this.defaultProfileId = id;
        await this.saveProfiles();

        streamDeck.logger.info(`Set default profile: ${profile.name} (${id})`);
    }

    /**
     * Get the default profile
     */
    public async getDefaultProfile(): Promise<DevOpsProfile | null> {
        await this.initialize();

        if (!this.defaultProfileId) {
            return null;
        }

        return this.profiles.get(this.defaultProfileId) || null;
    }

    /**
     * Validate a profile
     */
    public async validateProfile(profile: DevOpsProfile): Promise<ValidationResult> {
        return this.validateProfileData(profile);
    }

    /**
     * Validate profile data
     */
    private async validateProfileData(
        profileData: Partial<DevOpsProfile>
    ): Promise<ValidationResult> {
        const errors: string[] = [];

        if (!profileData.name || profileData.name.trim().length === 0) {
            errors.push('Profile name is required');
        }

        if (!profileData.organizationUrl || profileData.organizationUrl.trim().length === 0) {
            errors.push('Organization URL is required');
        } else if (!this.isValidUrl(profileData.organizationUrl)) {
            errors.push('Organization URL must be a valid URL');
        }

        if (!profileData.projectName || profileData.projectName.trim().length === 0) {
            errors.push('Project name is required');
        }

        if (!profileData.personalAccessToken || profileData.personalAccessToken.trim().length === 0) {
            errors.push('Personal Access Token is required');
        }

        return {
            isValid: errors.length === 0,
            errors
        };
    }

    /**
     * Test connection for a profile
     */
    public async testConnection(profileId: string): Promise<ConnectionTestResult> {
        await this.initialize();

        const profile = this.profiles.get(profileId);
        if (!profile) {
            return {
                success: false,
                error: 'Profile not found'
            };
        }

        try {
            // Decrypt the PAT
            const decryptedPAT = await this.credentialManager.decrypt(profile.personalAccessToken);

            // Create a client and test the connection
            const client = new AzureDevOpsClient();
            
            await client.connect({
                organizationUrl: profile.organizationUrl,
                projectName: profile.projectName,
                personalAccessToken: decryptedPAT
            });
            
            // Connection successful if no error was thrown
            const organizationName = profile.organizationUrl.split('/').pop();

            return {
                success: true,
                details: {
                    organizationName: organizationName,
                    projectName: profile.projectName,
                    userName: 'Connected' // Azure DevOps API doesn't easily expose current user
                }
            };
        } catch (error) {
            streamDeck.logger.error(`Connection test failed for profile ${profileId}`, error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Connection failed'
            };
        }
    }

    /**
     * Migrate from legacy settings
     */
    public async migrateFromLegacySettings(settings: LegacySettings): Promise<MigrationResult> {
        await this.initialize();

        // Normalize the settings
        const orgUrl = settings.organizationUrl || settings.orgUrl;
        const projectName = settings.projectName || settings.project;
        const pat = settings.personalAccessToken;

        if (!orgUrl || !pat) {
            throw new Error('Invalid legacy settings: missing required fields');
        }

        // Check if a matching profile already exists
        const existingProfile = await this.findMatchingProfile({
            organizationUrl: orgUrl,
            projectName: projectName || '',
            personalAccessToken: pat
        });

        if (existingProfile) {
            return {
                profileId: existingProfile.id,
                wasCreated: false,
                profileName: existingProfile.name
            };
        }

        // Create a new profile from the legacy settings
        const profileCount = this.profiles.size;
        const profile = await this.createProfile({
            name: `Migrated ${projectName || 'Profile'} ${profileCount > 0 ? profileCount + 1 : ''}`.trim(),
            organizationUrl: orgUrl,
            projectName: projectName || '',
            personalAccessToken: pat,
            isDefault: profileCount === 0
        });

        return {
            profileId: profile.id,
            wasCreated: true,
            profileName: profile.name
        };
    }

    /**
     * Find a matching profile based on connection details
     */
    public async findMatchingProfile(settings: LegacySettings): Promise<DevOpsProfile | null> {
        await this.initialize();

        const orgUrl = settings.organizationUrl || settings.orgUrl;
        const projectName = settings.projectName || settings.project;

        if (!orgUrl) {
            return null;
        }

        // Find profile with matching org URL and project
        for (const profile of this.profiles.values()) {
            if (this.normalizeUrl(profile.organizationUrl) === this.normalizeUrl(orgUrl)) {
                // If project name is specified, it must match
                if (projectName && profile.projectName !== projectName) {
                    continue;
                }
                return profile;
            }
        }

        return null;
    }

    /**
     * Get decrypted configuration for a profile
     */
    public async getDecryptedConfig(profileId: string): Promise<{
        organizationUrl: string;
        projectName: string;
        personalAccessToken: string;
    } | null> {
        const profile = await this.getProfile(profileId);
        if (!profile) {
            return null;
        }

        const decryptedPAT = await this.credentialManager.decrypt(profile.personalAccessToken);

        return {
            organizationUrl: profile.organizationUrl,
            projectName: profile.projectName,
            personalAccessToken: decryptedPAT
        };
    }

    /**
     * Register a listener for profile changes
     */
    public onProfileChange(callback: (event: ProfileChangeEvent) => void): () => void {
        this.changeListeners.add(callback);
        
        // Return unsubscribe function
        return () => {
            this.changeListeners.delete(callback);
        };
    }

    /**
     * Notify all listeners of a profile change
     */
    private notifyListeners(event: ProfileChangeEvent): void {
        this.changeListeners.forEach(listener => {
            try {
                listener(event);
            } catch (error) {
                streamDeck.logger.error('Error in profile change listener', error);
            }
        });
    }

    /**
     * Normalize a URL for comparison
     */
    private normalizeUrl(url: string): string {
        return url.toLowerCase().replace(/\/$/, '');
    }

    /**
     * Check if a string is a valid URL
     */
    private isValidUrl(url: string): boolean {
        try {
            new URL(url);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Clear all profiles (for testing purposes)
     */
    public async clearAllProfiles(): Promise<void> {
        await this.initialize();
        this.profiles.clear();
        this.defaultProfileId = undefined;
        await this.saveProfiles();
        streamDeck.logger.warn('All profiles cleared');
    }

    /**
     * Export profiles to a JSON string (without sensitive data)
     */
    public async exportProfiles(includePasswords: boolean = false): Promise<string> {
        await this.initialize();
        
        const profiles = await Promise.all(
            Array.from(this.profiles.values()).map(async profile => {
                const exportProfile: any = {
                    name: profile.name,
                    organizationUrl: profile.organizationUrl,
                    projectName: profile.projectName,
                    isDefault: profile.isDefault,
                    createdAt: profile.createdAt,
                    updatedAt: profile.updatedAt
                };
                
                // Only include PAT if explicitly requested (security consideration)
                if (includePasswords) {
                    const decryptedPAT = await this.credentialManager.decrypt(profile.personalAccessToken);
                    exportProfile.personalAccessToken = decryptedPAT;
                }
                
                return exportProfile;
            })
        );
        
        const exportData = {
            version: this.CURRENT_VERSION,
            exportDate: new Date().toISOString(),
            profiles: profiles
        };
        
        return JSON.stringify(exportData, null, 2);
    }

    /**
     * Import profiles from a JSON string
     */
    public async importProfiles(jsonData: string, overwrite: boolean = false): Promise<{ imported: number; skipped: number; errors: string[] }> {
        await this.initialize();
        
        const result = {
            imported: 0,
            skipped: 0,
            errors: [] as string[]
        };
        
        try {
            const importData = JSON.parse(jsonData);
            
            if (!importData.profiles || !Array.isArray(importData.profiles)) {
                throw new Error('Invalid import data: missing profiles array');
            }
            
            for (const profileData of importData.profiles) {
                try {
                    // Check if profile with same name exists
                    const existingProfile = Array.from(this.profiles.values())
                        .find(p => p.name === profileData.name);
                    
                    if (existingProfile && !overwrite) {
                        result.skipped++;
                        continue;
                    }
                    
                    // Validate required fields
                    if (!profileData.name || !profileData.organizationUrl) {
                        result.errors.push(`Invalid profile data: missing required fields for "${profileData.name || 'unknown'}"`);
                        continue;
                    }
                    
                    if (existingProfile && overwrite) {
                        // Update existing profile
                        await this.updateProfile(existingProfile.id, {
                            organizationUrl: profileData.organizationUrl,
                            projectName: profileData.projectName,
                            personalAccessToken: profileData.personalAccessToken,
                            isDefault: profileData.isDefault
                        });
                    } else {
                        // Create new profile
                        await this.createProfile({
                            name: profileData.name,
                            organizationUrl: profileData.organizationUrl,
                            projectName: profileData.projectName || '',
                            personalAccessToken: profileData.personalAccessToken || '',
                            isDefault: profileData.isDefault
                        });
                    }
                    
                    result.imported++;
                } catch (error) {
                    result.errors.push(`Failed to import profile "${profileData.name}": ${error instanceof Error ? error.message : 'Unknown error'}`);
                }
            }
            
        } catch (error) {
            result.errors.push(`Failed to parse import data: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
        
        return result;
    }

    /**
     * Duplicate an existing profile
     */
    public async duplicateProfile(profileId: string, newName?: string): Promise<DevOpsProfile> {
        await this.initialize();
        
        const sourceProfile = await this.getProfile(profileId);
        if (!sourceProfile) {
            throw new Error('Source profile not found');
        }
        
        // Decrypt the PAT for the new profile
        const decryptedPAT = await this.credentialManager.decrypt(sourceProfile.personalAccessToken);
        
        // Generate a unique name if not provided
        let profileName = newName;
        if (!profileName) {
            let copyNumber = 1;
            let baseName = sourceProfile.name;
            
            // Remove existing copy suffix if present
            const copyMatch = baseName.match(/^(.+) \(Copy(?: (\d+))?\)$/);
            if (copyMatch) {
                baseName = copyMatch[1];
                copyNumber = copyMatch[2] ? parseInt(copyMatch[2]) + 1 : 2;
            }
            
            // Find a unique name
            do {
                profileName = copyNumber === 1 ? `${baseName} (Copy)` : `${baseName} (Copy ${copyNumber})`;
                copyNumber++;
            } while (Array.from(this.profiles.values()).some(p => p.name === profileName));
        }
        
        // Create the duplicate profile
        return await this.createProfile({
            name: profileName,
            organizationUrl: sourceProfile.organizationUrl,
            projectName: sourceProfile.projectName,
            personalAccessToken: decryptedPAT,
            isDefault: false // Never duplicate the default status
        });
    }
}