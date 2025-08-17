import {
    hasRequiredConnectionSettings,
    isValidPipelineSettings,
    isValidPRSettings,
    mergePipelineSettings,
    mergePRSettings,
    sanitizeSettings,
    migrateSettings,
    DEFAULT_PIPELINE_SETTINGS,
    DEFAULT_PR_SETTINGS,
    SETTINGS_VERSION,
    PipelineStatusSettings,
    PullRequestSettings,
    CommonSettings
} from '../settings';

describe('Settings', () => {
    describe('hasRequiredConnectionSettings', () => {
        it('should return true when all required connection settings are present', () => {
            const settings: CommonSettings = {
                organizationUrl: 'https://dev.azure.com/test',
                projectName: 'TestProject',
                personalAccessToken: 'test-token'
            };
            
            expect(hasRequiredConnectionSettings(settings)).toBe(true);
        });

        it('should return false when organizationUrl is missing', () => {
            const settings: CommonSettings = {
                projectName: 'TestProject',
                personalAccessToken: 'test-token'
            };
            
            expect(hasRequiredConnectionSettings(settings)).toBe(false);
        });

        it('should return false when projectName is missing', () => {
            const settings: CommonSettings = {
                organizationUrl: 'https://dev.azure.com/test',
                personalAccessToken: 'test-token'
            };
            
            expect(hasRequiredConnectionSettings(settings)).toBe(false);
        });

        it('should return false when personalAccessToken is missing', () => {
            const settings: CommonSettings = {
                organizationUrl: 'https://dev.azure.com/test',
                projectName: 'TestProject'
            };
            
            expect(hasRequiredConnectionSettings(settings)).toBe(false);
        });

        it('should return false when all settings are empty strings', () => {
            const settings: CommonSettings = {
                organizationUrl: '',
                projectName: '',
                personalAccessToken: ''
            };
            
            expect(hasRequiredConnectionSettings(settings)).toBe(false);
        });

        it('should return false when all settings are missing', () => {
            const settings: CommonSettings = {};
            
            expect(hasRequiredConnectionSettings(settings)).toBe(false);
        });
    });

    describe('isValidPipelineSettings', () => {
        it('should return true for valid pipeline settings', () => {
            const settings: PipelineStatusSettings = {
                organizationUrl: 'https://dev.azure.com/test',
                projectName: 'TestProject',
                personalAccessToken: 'test-token',
                pipelineId: 123
            };
            
            expect(isValidPipelineSettings(settings)).toBe(true);
        });

        it('should return false when pipelineId is missing', () => {
            const settings: PipelineStatusSettings = {
                organizationUrl: 'https://dev.azure.com/test',
                projectName: 'TestProject',
                personalAccessToken: 'test-token'
            };
            
            expect(isValidPipelineSettings(settings)).toBe(false);
        });

        it('should return false when pipelineId is 0', () => {
            const settings: PipelineStatusSettings = {
                organizationUrl: 'https://dev.azure.com/test',
                projectName: 'TestProject',
                personalAccessToken: 'test-token',
                pipelineId: 0
            };
            
            expect(isValidPipelineSettings(settings)).toBe(false);
        });

        it('should return false when pipelineId is negative', () => {
            const settings: PipelineStatusSettings = {
                organizationUrl: 'https://dev.azure.com/test',
                projectName: 'TestProject',
                personalAccessToken: 'test-token',
                pipelineId: -1
            };
            
            expect(isValidPipelineSettings(settings)).toBe(false);
        });

        it('should return false when connection settings are invalid', () => {
            const settings: PipelineStatusSettings = {
                pipelineId: 123
            };
            
            expect(isValidPipelineSettings(settings)).toBe(false);
        });
    });

    describe('isValidPRSettings', () => {
        it('should return true for valid PR settings', () => {
            const settings: PullRequestSettings = {
                organizationUrl: 'https://dev.azure.com/test',
                projectName: 'TestProject',
                personalAccessToken: 'test-token',
                repositoryId: 'repo-123'
            };
            
            expect(isValidPRSettings(settings)).toBe(true);
        });

        it('should return true when repositoryId is "all"', () => {
            const settings: PullRequestSettings = {
                organizationUrl: 'https://dev.azure.com/test',
                projectName: 'TestProject',
                personalAccessToken: 'test-token',
                repositoryId: 'all'
            };
            
            expect(isValidPRSettings(settings)).toBe(true);
        });

        it('should return false when repositoryId is missing', () => {
            const settings: PullRequestSettings = {
                organizationUrl: 'https://dev.azure.com/test',
                projectName: 'TestProject',
                personalAccessToken: 'test-token'
            };
            
            expect(isValidPRSettings(settings)).toBe(false);
        });

        it('should return false when repositoryId is empty string', () => {
            const settings: PullRequestSettings = {
                organizationUrl: 'https://dev.azure.com/test',
                projectName: 'TestProject',
                personalAccessToken: 'test-token',
                repositoryId: ''
            };
            
            expect(isValidPRSettings(settings)).toBe(false);
        });

        it('should return false when connection settings are invalid', () => {
            const settings: PullRequestSettings = {
                repositoryId: 'repo-123'
            };
            
            expect(isValidPRSettings(settings)).toBe(false);
        });
    });

    describe('mergePipelineSettings', () => {
        it('should return defaults when given empty object', () => {
            const result = mergePipelineSettings({});
            
            expect(result).toEqual(DEFAULT_PIPELINE_SETTINGS);
        });

        it('should override defaults with provided values', () => {
            const partial: PipelineStatusSettings = {
                organizationUrl: 'https://dev.azure.com/custom',
                pipelineId: 456,
                refreshInterval: 60,
                showDuration: true
            };
            
            const result = mergePipelineSettings(partial);
            
            expect(result.organizationUrl).toBe('https://dev.azure.com/custom');
            expect(result.pipelineId).toBe(456);
            expect(result.refreshInterval).toBe(60);
            expect(result.showDuration).toBe(true);
            expect(result.showBuildNumber).toBe(true); // Default value
            expect(result.displayFormat).toBe('both'); // Default value
        });

        it('should preserve all default values not overridden', () => {
            const partial: PipelineStatusSettings = {
                pipelineId: 789
            };
            
            const result = mergePipelineSettings(partial);
            
            expect(result.pipelineId).toBe(789);
            expect(result.organizationUrl).toBe(DEFAULT_PIPELINE_SETTINGS.organizationUrl);
            expect(result.projectName).toBe(DEFAULT_PIPELINE_SETTINGS.projectName);
            expect(result.refreshInterval).toBe(DEFAULT_PIPELINE_SETTINGS.refreshInterval);
        });

        it('should handle settings with index signature', () => {
            const partial: PipelineStatusSettings = {
                pipelineId: 123,
                customField: 'custom-value'
            };
            
            const result = mergePipelineSettings(partial);
            
            expect(result.pipelineId).toBe(123);
            expect(result.customField).toBe('custom-value');
        });
    });

    describe('mergePRSettings', () => {
        it('should return defaults when given empty object', () => {
            const result = mergePRSettings({});
            
            expect(result).toEqual(DEFAULT_PR_SETTINGS);
        });

        it('should override defaults with provided values', () => {
            const partial: PullRequestSettings = {
                organizationUrl: 'https://dev.azure.com/custom',
                repositoryId: 'custom-repo',
                statusFilter: 'completed',
                maxAge: 14,
                alertThreshold: 5
            };
            
            const result = mergePRSettings(partial);
            
            expect(result.organizationUrl).toBe('https://dev.azure.com/custom');
            expect(result.repositoryId).toBe('custom-repo');
            expect(result.statusFilter).toBe('completed');
            expect(result.maxAge).toBe(14);
            expect(result.alertThreshold).toBe(5);
            expect(result.displayFormat).toBe('count'); // Default value
            expect(result.showMergeConflicts).toBe(true); // Default value
        });

        it('should preserve all default values not overridden', () => {
            const partial: PullRequestSettings = {
                repositoryId: 'test-repo'
            };
            
            const result = mergePRSettings(partial);
            
            expect(result.repositoryId).toBe('test-repo');
            expect(result.statusFilter).toBe(DEFAULT_PR_SETTINGS.statusFilter);
            expect(result.creatorFilter).toBe(DEFAULT_PR_SETTINGS.creatorFilter);
            expect(result.refreshInterval).toBe(DEFAULT_PR_SETTINGS.refreshInterval);
        });
    });

    describe('sanitizeSettings', () => {
        it('should mask personalAccessToken when present', () => {
            const settings: CommonSettings = {
                organizationUrl: 'https://dev.azure.com/test',
                projectName: 'TestProject',
                personalAccessToken: 'super-secret-token'
            };
            
            const sanitized = sanitizeSettings(settings);
            
            expect(sanitized.organizationUrl).toBe('https://dev.azure.com/test');
            expect(sanitized.projectName).toBe('TestProject');
            expect(sanitized.personalAccessToken).toBe('***');
        });

        it('should keep undefined personalAccessToken as undefined', () => {
            const settings: CommonSettings = {
                organizationUrl: 'https://dev.azure.com/test',
                projectName: 'TestProject'
            };
            
            const sanitized = sanitizeSettings(settings);
            
            expect(sanitized.personalAccessToken).toBeUndefined();
        });

        it('should keep empty string personalAccessToken as undefined', () => {
            const settings: CommonSettings = {
                organizationUrl: 'https://dev.azure.com/test',
                projectName: 'TestProject',
                personalAccessToken: ''
            };
            
            const sanitized = sanitizeSettings(settings);
            
            expect(sanitized.personalAccessToken).toBeUndefined();
        });

        it('should preserve all other settings unchanged', () => {
            const settings: PipelineStatusSettings = {
                organizationUrl: 'https://dev.azure.com/test',
                projectName: 'TestProject',
                personalAccessToken: 'token',
                pipelineId: 123,
                branchName: 'main',
                refreshInterval: 60,
                showBuildNumber: true
            };
            
            const sanitized = sanitizeSettings(settings);
            
            expect(sanitized.organizationUrl).toBe('https://dev.azure.com/test');
            expect(sanitized.projectName).toBe('TestProject');
            expect(sanitized.pipelineId).toBe(123);
            expect(sanitized.branchName).toBe('main');
            expect(sanitized.refreshInterval).toBe(60);
            expect(sanitized.showBuildNumber).toBe(true);
        });

        it('should work with empty settings object', () => {
            const settings: CommonSettings = {};
            
            const sanitized = sanitizeSettings(settings);
            
            expect(sanitized).toEqual({});
        });
    });

    describe('migrateSettings', () => {
        it('should return settings unchanged at current version', () => {
            const settings: CommonSettings = {
                organizationUrl: 'https://dev.azure.com/test',
                projectName: 'TestProject',
                personalAccessToken: 'token'
            };
            
            const migrated = migrateSettings<CommonSettings>(settings, SETTINGS_VERSION);
            
            expect(migrated).toEqual(settings);
        });

        it('should return settings unchanged when no version provided', () => {
            const settings: CommonSettings = {
                organizationUrl: 'https://dev.azure.com/test',
                projectName: 'TestProject',
                personalAccessToken: 'token'
            };
            
            const migrated = migrateSettings<CommonSettings>(settings);
            
            expect(migrated).toEqual(settings);
        });

        it('should handle settings with additional properties', () => {
            const settings = {
                organizationUrl: 'https://dev.azure.com/test',
                projectName: 'TestProject',
                personalAccessToken: 'token',
                customField: 'custom-value',
                anotherField: 123
            };
            
            const migrated = migrateSettings<any>(settings, 0);
            
            expect(migrated).toEqual(settings);
        });

        it('should handle empty settings object', () => {
            const settings = {};
            
            const migrated = migrateSettings<CommonSettings>(settings);
            
            expect(migrated).toEqual({});
        });

        it('should handle null or undefined gracefully', () => {
            const migrated1 = migrateSettings<CommonSettings>(null);
            const migrated2 = migrateSettings<CommonSettings>(undefined);
            
            expect(migrated1).toBeNull();
            expect(migrated2).toBeUndefined();
        });
    });

    describe('Constants', () => {
        it('should have correct default pipeline settings', () => {
            expect(DEFAULT_PIPELINE_SETTINGS).toMatchObject({
                profileId: '',
                organizationUrl: '',
                projectName: '',
                pipelineId: 0,
                personalAccessToken: '',
                branchName: '',
                refreshInterval: 30,
                displayFormat: 'both',
                showBuildNumber: true,
                showDuration: false
            });
        });

        it('should have correct default PR settings', () => {
            expect(DEFAULT_PR_SETTINGS).toMatchObject({
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
            });
        });

        it('should have settings version defined', () => {
            expect(SETTINGS_VERSION).toBe(1);
        });
    });
});