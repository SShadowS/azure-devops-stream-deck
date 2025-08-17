import streamDeck, {
    action,
    DidReceiveSettingsEvent,
    KeyAction,
    KeyDownEvent,
    SendToPluginEvent,
    SingletonAction,
    WillAppearEvent,
    WillDisappearEvent,
    JsonValue
} from "@elgato/streamdeck";

import { PRService } from "../services/pr-service";
import { PRDisplayManager } from "../utils/pr-display-manager";
import { CredentialManager } from "../utils/credential-manager";
import { performanceOptimizer } from "../utils/performance-optimizer";
import { ProfileManager } from "../services/profile-manager";
import { AzureDevOpsConnectionPool } from "../services/connection-pool";

/**
 * Settings interface for PR Checks action
 */
interface PRChecksSettings {
    // Profile-based connection
    profileId?: string;
    
    // Legacy connection settings (for migration)
    organizationUrl?: string;
    projectName?: string;
    personalAccessToken?: string;
    
    // PR-specific settings
    repository?: string;
    refreshInterval?: number;
    showOnlyMyPRs?: boolean;
    showPRsImReviewing?: boolean;
    showConflictsOnly?: boolean;
    targetBranch?: string;
    [key: string]: any; // Index signature for JsonObject compatibility
}

/**
 * PR Checks action that displays pull request status from Azure DevOps
 * Following SDK v2 best practices from the example plugins
 */
@action({ UUID: "com.sshadows.azure-devops-info.pr-checks" })
export class PRChecks extends SingletonAction<PRChecksSettings> {
    private pollIntervals = new Map<string, NodeJS.Timeout>();
    private prServices = new Map<string, PRService>();
    private credentialManager = new CredentialManager(streamDeck.logger);
    private profileManager = ProfileManager.getInstance();
    private connectionPool = AzureDevOpsConnectionPool.getInstance();

    /**
     * Called when the action appears on Stream Deck
     */
    override async onWillAppear(ev: WillAppearEvent<PRChecksSettings>): Promise<void> {
        if (!ev.action.isKey()) return;

        streamDeck.logger.trace("PR Checks action appearing", { context: ev.action.id });

        // Initialize ProfileManager
        await this.profileManager.initialize();
        
        // Check for legacy settings and migrate if necessary
        let settings = await this.migrateSettingsIfNeeded(ev.action as KeyAction<PRChecksSettings>, ev.payload.settings);

        // Initialize with default settings if needed
        if (!settings.refreshInterval) {
            const defaultSettings: PRChecksSettings = {
                ...settings,
                refreshInterval: 60,
                repository: "all",
                showOnlyMyPRs: false,
                showPRsImReviewing: false,
                showConflictsOnly: false
            };
            await ev.action.setSettings(defaultSettings);
            settings = defaultSettings;
        }

        // Start polling if we have credentials (profile or legacy)
        if (this.hasValidConfiguration(settings)) {
            await this.startPolling(ev.action as KeyAction<PRChecksSettings>, settings);
        } else {
            // Show configuration required message
            await ev.action.setTitle("Configure\nin Settings");
            await ev.action.setImage("data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNzIiIGhlaWdodD0iNzIiIHZpZXdCb3g9IjAgMCA3MiA3MiIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3Qgd2lkdGg9IjcyIiBoZWlnaHQ9IjcyIiBmaWxsPSIjMjIyMjIyIi8+CjxwYXRoIGQ9Ik0zNiA0MEMzOC4yMDkxIDQwIDQwIDM4LjIwOTEgNDAgMzZDNDAgMzMuNzkwOSAzOC4yMDkxIDMyIDM2IDMyQzMzLjc5MDkgMzIgMzIgMzMuNzkwOSAzMiAzNkMzMiAzOC4yMDkxIDMzLjc5MDkgNDAgMzYgNDBaIiBmaWxsPSIjODg4ODg4Ii8+Cjwvc3ZnPg==");
        }
    }

    /**
     * Called when the action disappears from Stream Deck
     */
    override async onWillDisappear(ev: WillDisappearEvent<PRChecksSettings>): Promise<void> {
        streamDeck.logger.trace("PR Checks action disappearing", { context: ev.action.id });
        
        // Clean up polling interval
        const interval = this.pollIntervals.get(ev.action.id);
        if (interval) {
            clearInterval(interval);
            this.pollIntervals.delete(ev.action.id);
        }

        // Clean up service instance
        this.prServices.delete(ev.action.id);
        
        // Release connection from pool
        const settings = ev.payload.settings;
        if (settings.profileId) {
            this.connectionPool.releaseProfileConnection(settings.profileId);
        }
    }

    /**
     * Called when settings are updated in Property Inspector
     */
    override async onDidReceiveSettings(ev: DidReceiveSettingsEvent<PRChecksSettings>): Promise<void> {
        if (!ev.action.isKey()) return;

        streamDeck.logger.trace("PR Checks settings updated", { 
            context: ev.action.id,
            hasProfile: !!ev.payload.settings.profileId,
            hasLegacy: !!(ev.payload.settings.organizationUrl && ev.payload.settings.personalAccessToken)
        });

        // Restart polling with new settings
        const interval = this.pollIntervals.get(ev.action.id);
        if (interval) {
            clearInterval(interval);
            this.pollIntervals.delete(ev.action.id);
        }

        if (this.hasValidConfiguration(ev.payload.settings)) {
            await this.startPolling(ev.action as KeyAction<PRChecksSettings>, ev.payload.settings);
        }
    }

    /**
     * Check if a string is already encrypted (basic heuristic)
     */
    private isEncrypted(value: string): boolean {
        // Check if it looks like encrypted data (base64 with specific pattern)
        // Encrypted PATs will be longer and contain base64 characters
        return value.length > 100 && /^[A-Za-z0-9+/]+=*$/.test(value);
    }

    /**
     * Called when the user presses the action button
     */
    override async onKeyDown(ev: KeyDownEvent<PRChecksSettings>): Promise<void> {
        streamDeck.logger.trace("PR Checks button pressed", { context: ev.action.id });

        const settings = ev.payload.settings;
        if (settings.organizationUrl && settings.projectName) {
            // Open Azure DevOps PRs page in browser
            const url = `${settings.organizationUrl}/${settings.projectName}/_git/pullrequests`;
            streamDeck.system.openUrl(url);
        }
    }

    /**
     * Handle messages from Property Inspector
     */
    override async onSendToPlugin(ev: SendToPluginEvent<JsonValue, PRChecksSettings>): Promise<void> {
        streamDeck.logger.trace("PR Checks received message from PI", { 
            context: ev.action.id,
            payload: ev.payload 
        });

        const payload = ev.payload as any;
        if (!payload?.event) return;

        switch (payload.event) {
            case "getProfiles":
                await this.sendProfileList();
                break;
                
            case "getRepositories":
                // Get current settings from the action
                const currentSettings = await ev.action.getSettings();
                await this.sendRepositoryList(ev.action as KeyAction<PRChecksSettings>, currentSettings);
                break;
                
            case "openConfigManager":
                // Show alert to indicate action
                await ev.action.showAlert();
                streamDeck.logger.info("User requested to open Configuration Manager");
                break;
                
            default:
                streamDeck.logger.debug("Unknown event from Property Inspector", { event: payload.event });
        }
    }

    /**
     * Start polling for PR updates
     */
    private async startPolling(action: KeyAction<PRChecksSettings>, settings: PRChecksSettings): Promise<void> {
        try {
            let organizationUrl: string;
            let decryptedPAT: string;
            let projectName: string | undefined;
            
            if (settings.profileId) {
                // Use profile-based configuration
                const config = await this.profileManager.getDecryptedConfig(settings.profileId);
                if (!config) {
                    throw new Error("Profile not found or invalid");
                }
                organizationUrl = config.organizationUrl;
                decryptedPAT = config.personalAccessToken;
                projectName = config.projectName;
            } else if (settings.organizationUrl && settings.personalAccessToken) {
                // Use legacy configuration
                organizationUrl = settings.organizationUrl;
                projectName = settings.projectName;
                
                // Handle both encrypted and plain text PATs
                if (this.isEncrypted(settings.personalAccessToken)) {
                    decryptedPAT = this.credentialManager.decrypt(settings.personalAccessToken);
                } else {
                    decryptedPAT = settings.personalAccessToken;
                }
            } else {
                throw new Error("No valid configuration found");
            }
            
            // Create or get PR service
            let service = this.prServices.get(action.id);
            if (!service || !service.hasValidCredentials(organizationUrl, decryptedPAT)) {
                service = new PRService(organizationUrl, decryptedPAT);
                this.prServices.set(action.id, service);
            }

            // Initial update with merged project name
            const mergedSettings = { ...settings, projectName: projectName || settings.projectName };
            await this.updatePRStatus(action, service, mergedSettings);

            // Set up polling interval
            const intervalMs = (settings.refreshInterval || 60) * 1000;
            const interval = setInterval(async () => {
                await this.updatePRStatus(action, service, mergedSettings);
            }, intervalMs);

            this.pollIntervals.set(action.id, interval);

        } catch (error) {
            streamDeck.logger.error("Failed to start PR polling", error);
            await action.setTitle("Error\nCheck logs");
            await action.setImage(PRDisplayManager.getErrorImage());
        }
    }

    /**
     * Update PR status on the button
     */
    private async updatePRStatus(
        action: KeyAction<PRChecksSettings>, 
        service: PRService, 
        settings: PRChecksSettings
    ): Promise<void> {
        try {
            streamDeck.logger.trace("Updating PR status", { context: action.id });

            // Fetch PRs with filters
            const prs = await performanceOptimizer.cachedCall(
                `prs-${action.id}`,
                async () => {
                    return await service.getPullRequests(
                        settings.projectName!,
                        settings.repository === "all" ? undefined : settings.repository,
                        {
                            targetBranch: settings.targetBranch,
                            onlyMyPRs: settings.showOnlyMyPRs,
                            onlyReviewing: settings.showPRsImReviewing,
                            onlyConflicts: settings.showConflictsOnly
                        }
                    );
                },
                30 // 30 second cache
            );

            // Update button display
            const title = PRDisplayManager.generateTitle(prs);
            const image = PRDisplayManager.generateImage(prs);
            
            await action.setTitle(title);
            await action.setImage(image);

            // Set state based on PR status
            if (prs.some(pr => pr.hasConflicts)) {
                await action.setState(1); // Error state
            } else if (prs.length > 0) {
                await action.setState(0); // Normal state
            }

        } catch (error) {
            streamDeck.logger.error("Failed to update PR status", error);
            await action.setTitle("Error");
            await action.setImage(PRDisplayManager.getErrorImage());
        }
    }

    /**
     * Send repository list to Property Inspector
     */
    private async sendRepositoryList(action: KeyAction<PRChecksSettings>, settings: PRChecksSettings): Promise<void> {
        try {
            let organizationUrl: string;
            let decryptedPAT: string;
            let projectName: string;
            
            if (settings.profileId) {
                // Use profile-based configuration
                const config = await this.profileManager.getDecryptedConfig(settings.profileId);
                if (!config) {
                    // Send empty list if profile not found
                    streamDeck.ui.current?.sendToPropertyInspector({
                        event: "getRepositories",
                        items: [{ value: "all", label: "All Repositories" }]
                    });
                    return;
                }
                organizationUrl = config.organizationUrl;
                decryptedPAT = config.personalAccessToken;
                projectName = config.projectName || settings.projectName!;
            } else if (settings.organizationUrl && settings.personalAccessToken && settings.projectName) {
                // Use legacy configuration
                organizationUrl = settings.organizationUrl;
                projectName = settings.projectName;
                
                // Handle both encrypted and plain text PATs
                if (this.isEncrypted(settings.personalAccessToken)) {
                    decryptedPAT = this.credentialManager.decrypt(settings.personalAccessToken);
                } else {
                    decryptedPAT = settings.personalAccessToken;
                }
            } else {
                // Send empty list if settings are not complete
                streamDeck.ui.current?.sendToPropertyInspector({
                    event: "getRepositories",
                    items: [{ value: "all", label: "All Repositories" }]
                });
                return;
            }

            const service = new PRService(organizationUrl, decryptedPAT);
            const repositories = await service.getRepositories(projectName);

            // Send repositories to Property Inspector following official data source pattern
            streamDeck.ui.current?.sendToPropertyInspector({
                event: "getRepositories",
                items: [
                    { value: "all", label: "All Repositories" },
                    ...repositories.map(repo => ({
                        value: repo.id,
                        label: repo.name
                    }))
                ]
            });

        } catch (error) {
            streamDeck.logger.error("Failed to get repositories", error);
            // Send fallback list on error
            streamDeck.ui.current?.sendToPropertyInspector({
                event: "getRepositories",
                items: [
                    { value: "all", label: "All Repositories" }
                ]
            });
        }
    }

    /**
     * Send profile list to Property Inspector
     */
    private async sendProfileList(): Promise<void> {
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
            
            streamDeck.logger.debug(`Sent ${profileList.length} profiles to Property Inspector`);
        } catch (error) {
            streamDeck.logger.error("Failed to send profile list", error);
        }
    }

    /**
     * Migrate legacy settings to use profiles if needed
     */
    private async migrateSettingsIfNeeded(action: KeyAction<PRChecksSettings>, settings: PRChecksSettings): Promise<PRChecksSettings> {
        // If already using profile, no migration needed
        if (settings.profileId) {
            return settings;
        }
        
        // Check if we have legacy settings to migrate
        if (settings.organizationUrl && settings.personalAccessToken) {
            streamDeck.logger.info("Migrating legacy PR Checks settings to profile", { actionId: action.id });
            
            try {
                const migrationResult = await this.profileManager.migrateFromLegacySettings({
                    organizationUrl: settings.organizationUrl,
                    projectName: settings.projectName,
                    personalAccessToken: settings.personalAccessToken
                });
                
                // Update settings to use the profile
                const newSettings: PRChecksSettings = {
                    ...settings,
                    profileId: migrationResult.profileId,
                    // Clear legacy fields
                    organizationUrl: undefined,
                    projectName: undefined,
                    personalAccessToken: undefined
                };
                
                // Save the updated settings
                await action.setSettings(newSettings);
                
                streamDeck.logger.info("Successfully migrated to profile", { 
                    profileId: migrationResult.profileId,
                    profileName: migrationResult.profileName
                });
                
                return newSettings;
            } catch (error) {
                streamDeck.logger.error("Failed to migrate settings", error);
                // Return original settings if migration fails
                return settings;
            }
        }
        
        return settings;
    }

    /**
     * Check if settings have valid configuration (profile or legacy)
     */
    private hasValidConfiguration(settings: PRChecksSettings): boolean {
        // Check if profile is configured
        if (settings.profileId) {
            return true;
        }
        
        // Check legacy configuration
        return !!(settings.organizationUrl && settings.projectName && settings.personalAccessToken);
    }

}