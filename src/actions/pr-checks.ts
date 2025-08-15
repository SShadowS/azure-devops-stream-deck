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

/**
 * Settings interface for PR Checks action
 */
interface PRChecksSettings {
    organizationUrl?: string;
    projectName?: string;
    personalAccessToken?: string;
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

    /**
     * Called when the action appears on Stream Deck
     */
    override async onWillAppear(ev: WillAppearEvent<PRChecksSettings>): Promise<void> {
        if (!ev.action.isKey()) return;

        streamDeck.logger.trace("PR Checks action appearing", { context: ev.action.id });

        // Initialize with default settings if needed
        const settings = ev.payload.settings;
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
        }

        // Start polling if we have credentials
        if (settings.organizationUrl && settings.projectName && settings.personalAccessToken) {
            await this.startPolling(ev.action, settings);
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
    }

    /**
     * Called when settings are updated in Property Inspector
     */
    override async onDidReceiveSettings(ev: DidReceiveSettingsEvent<PRChecksSettings>): Promise<void> {
        if (!ev.action.isKey()) return;

        streamDeck.logger.trace("PR Checks settings updated", { 
            context: ev.action.id,
            hasCredentials: !!(ev.payload.settings.organizationUrl && ev.payload.settings.personalAccessToken)
        });

        // Encrypt the PAT if it's not already encrypted (check if it's plain text)
        if (ev.payload.settings.personalAccessToken && !this.isEncrypted(ev.payload.settings.personalAccessToken)) {
            try {
                const encryptedPAT = this.credentialManager.encrypt(ev.payload.settings.personalAccessToken);
                ev.payload.settings.personalAccessToken = encryptedPAT;
                
                // Save the updated settings with encrypted PAT
                await ev.action.setSettings(ev.payload.settings);
                streamDeck.logger.debug("Personal Access Token encrypted and saved");
            } catch (error) {
                streamDeck.logger.error("Failed to encrypt PAT", error);
                return;
            }
        }

        // Restart polling with new settings
        const interval = this.pollIntervals.get(ev.action.id);
        if (interval) {
            clearInterval(interval);
            this.pollIntervals.delete(ev.action.id);
        }

        if (ev.payload.settings.organizationUrl && 
            ev.payload.settings.projectName && 
            ev.payload.settings.personalAccessToken) {
            await this.startPolling(ev.action, ev.payload.settings);
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

        // Check if the payload is requesting a data source
        if (ev.payload instanceof Object && "event" in ev.payload && ev.payload.event === "getRepositories") {
            // Get current settings from the action
            const currentSettings = await ev.action.getSettings();
            await this.sendRepositoryList(ev.action as KeyAction<PRChecksSettings>, currentSettings);
        }
    }

    /**
     * Start polling for PR updates
     */
    private async startPolling(action: KeyAction<PRChecksSettings>, settings: PRChecksSettings): Promise<void> {
        try {
            // Handle both encrypted and plain text PATs
            let decryptedPAT: string;
            if (this.isEncrypted(settings.personalAccessToken!)) {
                decryptedPAT = this.credentialManager.decrypt(settings.personalAccessToken!);
            } else {
                // If it's not encrypted yet, use as-is (this handles the transition period)
                decryptedPAT = settings.personalAccessToken!;
            }
            
            // Create or get PR service
            let service = this.prServices.get(action.id);
            if (!service || !service.hasValidCredentials(settings.organizationUrl!, decryptedPAT)) {
                service = new PRService(settings.organizationUrl!, decryptedPAT);
                this.prServices.set(action.id, service);
            }

            // Initial update
            await this.updatePRStatus(action, service, settings);

            // Set up polling interval
            const intervalMs = (settings.refreshInterval || 60) * 1000;
            const interval = setInterval(async () => {
                await this.updatePRStatus(action, service, settings);
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
            if (!settings.organizationUrl || !settings.personalAccessToken || !settings.projectName) {
                // Send empty list if settings are not complete
                streamDeck.ui.current?.sendToPropertyInspector({
                    event: "getRepositories",
                    items: [
                        { value: "all", label: "All Repositories" }
                    ]
                });
                return;
            }

            // Handle both encrypted and plain text PATs
            let decryptedPAT: string;
            if (this.isEncrypted(settings.personalAccessToken)) {
                decryptedPAT = this.credentialManager.decrypt(settings.personalAccessToken);
            } else {
                // If it's not encrypted yet, use as-is (this handles the transition period)
                decryptedPAT = settings.personalAccessToken;
            }

            const service = new PRService(settings.organizationUrl, decryptedPAT);
            const repositories = await service.getRepositories(settings.projectName);

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

}