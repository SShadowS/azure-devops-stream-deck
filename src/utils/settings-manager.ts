/**
 * Manages settings validation, migration, and persistence for Stream Deck actions.
 */

import streamDeck from '@elgato/streamdeck';
import {
    PipelineStatusSettings,
    PullRequestSettings,
    CommonSettings,
    DEFAULT_PIPELINE_SETTINGS,
    DEFAULT_PR_SETTINGS,
    hasRequiredConnectionSettings,
    isValidPipelineSettings,
    isValidPRSettings,
    sanitizeSettings,
    migrateSettings,
    SETTINGS_VERSION
} from '../types/settings';

/**
 * Validation result containing status and any error messages.
 */
export interface ValidationResult {
    isValid: boolean;
    errors: string[];
    warnings: string[];
}

/**
 * Manages settings for Stream Deck actions with validation and migration.
 */
export class SettingsManager {
    private logger = streamDeck.logger.createScope('SettingsManager');

    /**
     * Validates Pipeline Status settings.
     */
    validatePipelineSettings(settings: PipelineStatusSettings): ValidationResult {
        const errors: string[] = [];
        const warnings: string[] = [];

        // Check required fields
        if (!settings.organizationUrl) {
            errors.push('Organization URL is required');
        } else if (!this.isValidUrl(settings.organizationUrl)) {
            errors.push('Organization URL is not valid');
        }

        if (!settings.projectName) {
            errors.push('Project name is required');
        }

        if (!settings.personalAccessToken) {
            errors.push('Personal Access Token is required');
        }

        if (!settings.pipelineId || settings.pipelineId <= 0) {
            errors.push('Pipeline ID is required and must be positive');
        }

        // Check optional fields
        if (settings.refreshInterval !== undefined) {
            if (settings.refreshInterval < 10) {
                warnings.push('Refresh interval is very low (< 10 seconds), this may cause rate limiting');
            } else if (settings.refreshInterval > 300) {
                warnings.push('Refresh interval is very high (> 5 minutes), status may be outdated');
            }
        }

        if (settings.branchName && !this.isValidBranchName(settings.branchName)) {
            warnings.push('Branch name format may be incorrect');
        }

        return {
            isValid: errors.length === 0,
            errors,
            warnings
        };
    }

    /**
     * Validates Pull Request settings.
     */
    validatePRSettings(settings: PullRequestSettings): ValidationResult {
        const errors: string[] = [];
        const warnings: string[] = [];

        // Check required fields
        if (!settings.organizationUrl) {
            errors.push('Organization URL is required');
        } else if (!this.isValidUrl(settings.organizationUrl)) {
            errors.push('Organization URL is not valid');
        }

        if (!settings.projectName) {
            errors.push('Project name is required');
        }

        if (!settings.personalAccessToken) {
            errors.push('Personal Access Token is required');
        }

        if (!settings.repositoryId) {
            errors.push('Repository is required');
        }

        // Check filter consistency
        if ((settings.creatorFilter === 'me' || settings.reviewerFilter === 'me') && !settings.username) {
            errors.push('Username is required when using "me" filters');
        }

        // Check optional fields
        if (settings.refreshInterval !== undefined) {
            if (settings.refreshInterval < 10) {
                warnings.push('Refresh interval is very low (< 10 seconds), this may cause rate limiting');
            } else if (settings.refreshInterval > 300) {
                warnings.push('Refresh interval is very high (> 5 minutes), PRs may be outdated');
            }
        }

        if (settings.maxAge !== undefined && settings.maxAge > 30) {
            warnings.push('Max age is very high (> 30 days), old PRs will be included');
        }

        if (settings.alertThreshold !== undefined && settings.alertThreshold < 5) {
            warnings.push('Alert threshold is very low (< 5), alerts may be too frequent');
        }

        return {
            isValid: errors.length === 0,
            errors,
            warnings
        };
    }

    /**
     * Applies defaults to Pipeline Status settings.
     */
    applyPipelineDefaults(settings: PipelineStatusSettings): Required<PipelineStatusSettings> {
        return {
            ...DEFAULT_PIPELINE_SETTINGS,
            ...settings
        };
    }

    /**
     * Applies defaults to Pull Request settings.
     */
    applyPRDefaults(settings: PullRequestSettings): Required<PullRequestSettings> {
        return {
            ...DEFAULT_PR_SETTINGS,
            ...settings
        };
    }

    /**
     * Migrates settings from old format to current format.
     */
    migrate<T extends CommonSettings>(settings: any): T {
        const migrated = migrateSettings<T>(settings, settings._version);
        
        // Add version to migrated settings
        (migrated as any)._version = SETTINGS_VERSION;
        
        this.logger.debug('Settings migrated', {
            fromVersion: settings._version || 0,
            toVersion: SETTINGS_VERSION
        });
        
        return migrated;
    }

    /**
     * Sanitizes settings for logging (removes sensitive data).
     */
    sanitize<T extends CommonSettings>(settings: T): Partial<T> {
        return sanitizeSettings(settings);
    }

    /**
     * Checks if settings have changed in a way that requires reconnection.
     */
    requiresReconnection(oldSettings: CommonSettings, newSettings: CommonSettings): boolean {
        return oldSettings.organizationUrl !== newSettings.organizationUrl ||
               oldSettings.projectName !== newSettings.projectName ||
               oldSettings.personalAccessToken !== newSettings.personalAccessToken;
    }

    /**
     * Validates an Azure DevOps organization URL.
     */
    private isValidUrl(url: string): boolean {
        try {
            const parsed = new URL(url);
            // Check for Azure DevOps domains
            return parsed.protocol === 'https:' && (
                parsed.hostname.includes('dev.azure.com') ||
                parsed.hostname.includes('visualstudio.com') ||
                parsed.hostname.includes('azure.com')
            );
        } catch {
            return false;
        }
    }

    /**
     * Validates a branch name format.
     */
    private isValidBranchName(branchName: string): boolean {
        // Allow common formats
        if (branchName.startsWith('refs/heads/')) {
            return true;
        }
        // Allow simple branch names
        if (/^[a-zA-Z0-9\-_\/]+$/.test(branchName)) {
            return true;
        }
        return false;
    }

    /**
     * Exports settings to a JSON string for backup.
     */
    exportSettings(settings: CommonSettings): string {
        const sanitized = this.sanitize(settings);
        return JSON.stringify(sanitized, null, 2);
    }

    /**
     * Imports settings from a JSON string.
     */
    importSettings<T extends CommonSettings>(json: string): T | null {
        try {
            const parsed = JSON.parse(json);
            return this.migrate<T>(parsed);
        } catch (error) {
            this.logger.error('Failed to import settings', error);
            return null;
        }
    }

    /**
     * Creates a settings diff for debugging.
     */
    diffSettings(oldSettings: CommonSettings, newSettings: CommonSettings): object {
        const diff: any = {};
        
        const allKeys = new Set([
            ...Object.keys(oldSettings),
            ...Object.keys(newSettings)
        ]);
        
        for (const key of allKeys) {
            const oldValue = (oldSettings as any)[key];
            const newValue = (newSettings as any)[key];
            
            if (oldValue !== newValue) {
                // Don't include PAT in diff
                if (key === 'personalAccessToken') {
                    diff[key] = { old: '***', new: '***' };
                } else {
                    diff[key] = { old: oldValue, new: newValue };
                }
            }
        }
        
        return diff;
    }

    /**
     * Gets a summary of settings for display.
     */
    getSettingsSummary(settings: CommonSettings): string {
        const parts: string[] = [];
        
        if (settings.organizationUrl) {
            const url = new URL(settings.organizationUrl);
            parts.push(`Org: ${url.hostname}`);
        }
        
        if (settings.projectName) {
            parts.push(`Project: ${settings.projectName}`);
        }
        
        if ('pipelineId' in settings) {
            parts.push(`Pipeline: ${(settings as any).pipelineId}`);
        }
        
        if ('repositoryId' in settings) {
            const repoId = (settings as any).repositoryId;
            parts.push(`Repo: ${repoId === 'all' ? 'All' : repoId}`);
        }
        
        return parts.join(' | ');
    }
}