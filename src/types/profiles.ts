/**
 * Azure DevOps Profile types for multi-configuration support
 */

/**
 * Represents a named Azure DevOps configuration profile
 */
export interface DevOpsProfile {
    /** Unique identifier for the profile */
    id: string;
    /** User-friendly name (e.g., "Production", "Development") */
    name: string;
    /** Azure DevOps organization URL */
    organizationUrl: string;
    /** Default project name */
    projectName: string;
    /** Encrypted Personal Access Token */
    personalAccessToken: string;
    /** Creation timestamp */
    createdAt: number;
    /** Last update timestamp */
    updatedAt: number;
    /** Whether this is the default profile */
    isDefault?: boolean;
}

/**
 * Global settings structure that contains all profiles
 */
export interface GlobalSettings {
    /** Map of profile ID to profile data */
    profiles: Record<string, DevOpsProfile>;
    /** ID of the default profile */
    defaultProfileId?: string;
    /** Schema version for future migrations */
    version: number;
}

/**
 * Action settings that reference a profile
 */
export interface ProfileActionSettings {
    /** Selected profile ID */
    profileId?: string;
}

/**
 * Legacy settings structure for migration
 */
export interface LegacySettings {
    organizationUrl?: string;
    projectName?: string;
    personalAccessToken?: string;
    orgUrl?: string; // Alternative naming
    project?: string; // Alternative naming
}

/**
 * Result of migrating legacy settings to a profile
 */
export interface MigrationResult {
    /** Created or matched profile ID */
    profileId: string;
    /** True if a new profile was created */
    wasCreated: boolean;
    /** Name of the profile */
    profileName: string;
}

/**
 * Result of profile validation
 */
export interface ValidationResult {
    /** Whether the profile is valid */
    isValid: boolean;
    /** Validation errors if any */
    errors: string[];
}

/**
 * Result of connection test
 */
export interface ConnectionTestResult {
    /** Whether the connection was successful */
    success: boolean;
    /** Error message if connection failed */
    error?: string;
    /** Additional details about the connection */
    details?: {
        organizationName?: string;
        projectName?: string;
        userName?: string;
    };
}

/**
 * Profile change event
 */
export interface ProfileChangeEvent {
    type: 'created' | 'updated' | 'deleted';
    profileId: string;
    profile?: DevOpsProfile;
}