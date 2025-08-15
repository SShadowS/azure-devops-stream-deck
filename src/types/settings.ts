/**
 * Type definitions for all action settings.
 * Provides strong typing and validation for Stream Deck action configurations.
 */

/**
 * Settings for the Pipeline Status action.
 * Includes index signature for Stream Deck SDK compatibility.
 */
export interface PipelineStatusSettings {
    // Connection settings
    organizationUrl?: string;
    projectName?: string;
    pipelineId?: number;
    personalAccessToken?: string;
    
    // Filter settings
    branchName?: string; // Optional branch filter (e.g., 'main', 'develop', 'refs/heads/main')
    
    // Display settings
    refreshInterval?: number; // in seconds
    displayFormat?: 'icon' | 'text' | 'both';
    showBuildNumber?: boolean;
    showDuration?: boolean;
    
    // Index signature for Stream Deck SDK compatibility
    [key: string]: any;
}

/**
 * Settings for the Pull Request Status action.
 * Includes index signature for Stream Deck SDK compatibility.
 */
export interface PullRequestSettings {
    // Connection settings
    organizationUrl?: string;
    projectName?: string;
    repositoryId?: string;  // Specific repo ID or 'all'
    personalAccessToken?: string;
    
    // Filter settings
    statusFilter?: 'active' | 'completed' | 'abandoned' | 'all';
    targetBranch?: string;  // e.g., 'refs/heads/main', 'refs/heads/develop'
    creatorFilter?: 'anyone' | 'me';
    reviewerFilter?: 'anyone' | 'me';
    username?: string;  // Username for 'me' filters
    maxAge?: number;  // Days, for highlighting old PRs
    
    // Display settings
    refreshInterval?: number;  // seconds
    displayFormat?: 'count' | 'age' | 'title' | 'combined';
    showMergeConflicts?: boolean;
    alertThreshold?: number;  // PR count for alert
    
    // Index signature for Stream Deck SDK compatibility
    [key: string]: any;
}

/**
 * Common settings shared across all actions.
 */
export interface CommonSettings {
    organizationUrl?: string;
    projectName?: string;
    personalAccessToken?: string;
    refreshInterval?: number;
}

/**
 * Default values for Pipeline Status settings.
 */
export const DEFAULT_PIPELINE_SETTINGS: Required<PipelineStatusSettings> = {
    organizationUrl: '',
    projectName: '',
    pipelineId: 0,
    personalAccessToken: '',
    branchName: '',
    refreshInterval: 30,
    displayFormat: 'both',
    showBuildNumber: true,
    showDuration: false
};

/**
 * Default values for Pull Request settings.
 */
export const DEFAULT_PR_SETTINGS: Required<PullRequestSettings> = {
    organizationUrl: '',
    projectName: '',
    repositoryId: '',
    personalAccessToken: '',
    statusFilter: 'active',
    targetBranch: '',
    creatorFilter: 'anyone',
    reviewerFilter: 'anyone',
    username: '',
    maxAge: 7,
    refreshInterval: 30,
    displayFormat: 'count',
    showMergeConflicts: true,
    alertThreshold: 10
};

/**
 * Validates that required connection settings are present.
 */
export function hasRequiredConnectionSettings(settings: CommonSettings): boolean {
    return !!(
        settings.organizationUrl &&
        settings.projectName &&
        settings.personalAccessToken
    );
}

/**
 * Validates Pipeline Status settings.
 */
export function isValidPipelineSettings(settings: PipelineStatusSettings): boolean {
    return hasRequiredConnectionSettings(settings) && 
           !!settings.pipelineId &&
           settings.pipelineId > 0;
}

/**
 * Validates Pull Request settings.
 */
export function isValidPRSettings(settings: PullRequestSettings): boolean {
    return hasRequiredConnectionSettings(settings) && 
           !!settings.repositoryId;
}

/**
 * Merges partial settings with defaults.
 */
export function mergePipelineSettings(
    partial: PipelineStatusSettings
): Required<PipelineStatusSettings> {
    return { ...DEFAULT_PIPELINE_SETTINGS, ...partial };
}

/**
 * Merges partial PR settings with defaults.
 */
export function mergePRSettings(
    partial: PullRequestSettings
): Required<PullRequestSettings> {
    return { ...DEFAULT_PR_SETTINGS, ...partial };
}

/**
 * Sanitizes settings for logging (removes sensitive data).
 */
export function sanitizeSettings<T extends CommonSettings>(settings: T): Partial<T> {
    const sanitized = { ...settings };
    if ('personalAccessToken' in sanitized) {
        // @ts-ignore
        sanitized.personalAccessToken = sanitized.personalAccessToken ? '***' : undefined;
    }
    return sanitized;
}

/**
 * Settings version for migration purposes.
 */
export const SETTINGS_VERSION = 1;

/**
 * Migrates settings from old format to current format.
 */
export function migrateSettings<T extends CommonSettings>(
    settings: any,
    version?: number
): T {
    // Currently at version 1, no migrations needed yet
    // Future migrations would go here
    
    // Example migration from version 0 to 1:
    // if (!version || version < 1) {
    //     if (settings.pat && !settings.personalAccessToken) {
    //         settings.personalAccessToken = settings.pat;
    //         delete settings.pat;
    //     }
    // }
    
    return settings as T;
}