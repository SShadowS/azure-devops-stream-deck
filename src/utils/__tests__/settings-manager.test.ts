/**
 * Tests for SettingsManager.
 * Verifies settings validation, migration, and sanitization.
 */

import { SettingsManager } from '../settings-manager';
import { PipelineStatusSettings, PullRequestSettings } from '../../types/settings';

describe('SettingsManager', () => {
    let manager: SettingsManager;

    beforeEach(() => {
        manager = new SettingsManager();
    });

    describe('Pipeline Settings Validation', () => {
        it('should validate complete pipeline settings', () => {
            const settings: PipelineStatusSettings = {
                organizationUrl: 'https://dev.azure.com/test',
                projectName: 'TestProject',
                pipelineId: 123,
                personalAccessToken: 'test-token',
                branchName: 'main',
                refreshInterval: 30,
                displayFormat: 'both',
                showBuildNumber: true,
                showDuration: false
            };

            const result = manager.validatePipelineSettings(settings);
            
            expect(result.isValid).toBe(true);
            expect(result.errors).toHaveLength(0);
        });

        it('should detect missing required fields', () => {
            const settings: PipelineStatusSettings = {
                organizationUrl: 'https://dev.azure.com/test',
                // Missing projectName, pipelineId, personalAccessToken
            };

            const result = manager.validatePipelineSettings(settings);
            
            expect(result.isValid).toBe(false);
            expect(result.errors).toContain('Project name is required');
            expect(result.errors).toContain('Pipeline ID is required');
            expect(result.errors).toContain('Personal Access Token is required');
        });

        it('should validate pipeline ID is positive number', () => {
            const settings: PipelineStatusSettings = {
                organizationUrl: 'https://dev.azure.com/test',
                projectName: 'TestProject',
                pipelineId: -1,
                personalAccessToken: 'test-token'
            };

            const result = manager.validatePipelineSettings(settings);
            
            expect(result.isValid).toBe(false);
            expect(result.errors).toContain('Pipeline ID must be a positive integer');
        });

        it('should validate refresh interval range', () => {
            const settings1: PipelineStatusSettings = {
                organizationUrl: 'https://dev.azure.com/test',
                projectName: 'TestProject',
                pipelineId: 123,
                personalAccessToken: 'test-token',
                refreshInterval: 5 // Too low
            };

            const result1 = manager.validatePipelineSettings(settings1);
            expect(result1.isValid).toBe(true); // Low values generate warnings, not errors
            expect(result1.warnings).toContain('Refresh interval is very low (< 10 seconds), this may cause rate limiting');

            const settings2: PipelineStatusSettings = {
                ...settings1,
                refreshInterval: 4000 // Too high
            };

            const result2 = manager.validatePipelineSettings(settings2);
            expect(result2.isValid).toBe(true); // High values generate warnings, not errors
            expect(result2.warnings).toContain('Refresh interval is very high (> 5 minutes), status may be outdated');
        });

        it('should not validate display format values', () => {
            // Display format is not validated, invalid values are allowed
            const settings: PipelineStatusSettings = {
                organizationUrl: 'https://dev.azure.com/test',
                projectName: 'TestProject',
                pipelineId: 123,
                personalAccessToken: 'test-token',
                displayFormat: 'invalid' as any
            };

            const result = manager.validatePipelineSettings(settings);
            
            expect(result.isValid).toBe(true);
            expect(result.errors).toHaveLength(0);
        });
    });

    describe('Pull Request Settings Validation', () => {
        it('should validate complete PR settings', () => {
            const settings: PullRequestSettings = {
                organizationUrl: 'https://dev.azure.com/test',
                projectName: 'TestProject',
                repositoryId: 'repo-123',
                personalAccessToken: 'test-token',
                statusFilter: 'active',
                creatorFilter: 'anyone',
                reviewerFilter: 'me',
                username: 'user@example.com',
                maxAge: 7,
                refreshInterval: 30,
                displayFormat: 'count',
                alertThreshold: 5,
                showMergeConflicts: true
            };

            const result = manager.validatePRSettings(settings);
            
            expect(result.isValid).toBe(true);
            expect(result.errors).toHaveLength(0);
        });

        it('should detect missing repository ID', () => {
            const settings: PullRequestSettings = {
                organizationUrl: 'https://dev.azure.com/test',
                projectName: 'TestProject',
                personalAccessToken: 'test-token'
            };

            const result = manager.validatePRSettings(settings);
            
            expect(result.isValid).toBe(false);
            expect(result.errors).toContain('Repository is required');
        });

        it('should require username when using "me" filters', () => {
            const settings: PullRequestSettings = {
                organizationUrl: 'https://dev.azure.com/test',
                projectName: 'TestProject',
                repositoryId: 'repo-123',
                personalAccessToken: 'test-token',
                creatorFilter: 'me',
                // Missing username
            };

            const result = manager.validatePRSettings(settings);
            
            expect(result.isValid).toBe(false);
            expect(result.errors).toContain('Username is required when using "me" filters');
        });

        it('should not validate status filter values', () => {
            // Status filter is not validated, invalid values are allowed
            const settings: PullRequestSettings = {
                organizationUrl: 'https://dev.azure.com/test',
                projectName: 'TestProject',
                repositoryId: 'repo-123',
                personalAccessToken: 'test-token',
                statusFilter: 'invalid' as any
            };

            const result = manager.validatePRSettings(settings);
            
            expect(result.isValid).toBe(true);
            expect(result.errors).toHaveLength(0);
        });

        it('should generate warning for low alert threshold', () => {
            // Alert threshold generates warnings, not errors
            const settings: PullRequestSettings = {
                organizationUrl: 'https://dev.azure.com/test',
                projectName: 'TestProject',
                repositoryId: 'repo-123',
                personalAccessToken: 'test-token',
                alertThreshold: 3
            };

            const result = manager.validatePRSettings(settings);
            
            expect(result.isValid).toBe(true);
            expect(result.warnings).toContain('Alert threshold is very low (< 5), alerts may be too frequent');
        });
    });

    describe('Settings Migration', () => {
        it('should migrate old pipeline settings format', () => {
            const oldSettings = {
                orgUrl: 'https://dev.azure.com/test', // Old field name
                project: 'TestProject', // Old field name
                pipelineId: 123,
                pat: 'test-token', // Old field name
                refreshInterval: 30
            };

            const migrated = manager.migrate(oldSettings);
            
            expect(migrated.organizationUrl).toBe('https://dev.azure.com/test');
            expect(migrated.projectName).toBe('TestProject');
            expect(migrated.personalAccessToken).toBe('test-token');
            expect((migrated as any).pipelineId).toBe(123);
        });

        it('should preserve new format settings', () => {
            const newSettings: PipelineStatusSettings = {
                organizationUrl: 'https://dev.azure.com/test',
                projectName: 'TestProject',
                pipelineId: 123,
                personalAccessToken: 'test-token'
            };

            const migrated = manager.migrate(newSettings);
            
            expect(migrated).toEqual(newSettings);
        });

        it('should handle mixed format settings', () => {
            const mixedSettings = {
                organizationUrl: 'https://dev.azure.com/test', // New
                project: 'TestProject', // Old
                pipelineId: 123,
                pat: 'test-token' // Old
            };

            const migrated = manager.migrate(mixedSettings);
            
            expect(migrated.organizationUrl).toBe('https://dev.azure.com/test');
            expect(migrated.projectName).toBe('TestProject');
            expect(migrated.personalAccessToken).toBe('test-token');
        });
    });

    describe('Settings Sanitization', () => {
        it('should remove sensitive data for logging', () => {
            const settings: PipelineStatusSettings = {
                organizationUrl: 'https://dev.azure.com/test',
                projectName: 'TestProject',
                pipelineId: 123,
                personalAccessToken: 'super-secret-token',
                branchName: 'main'
            };

            const sanitized = manager.sanitize(settings);
            
            expect(sanitized.organizationUrl).toBe('https://dev.azure.com/test');
            expect(sanitized.projectName).toBe('TestProject');
            expect(sanitized.pipelineId).toBe(123);
            expect(sanitized.personalAccessToken).toBe('[REDACTED]');
            expect(sanitized.branchName).toBe('main');
        });

        it('should handle missing PAT field', () => {
            const settings = {
                organizationUrl: 'https://dev.azure.com/test',
                projectName: 'TestProject'
            };

            const sanitized = manager.sanitize(settings);
            
            expect((sanitized as any).personalAccessToken).toBeUndefined();
        });

        it('should handle null/undefined settings', () => {
            expect(manager.sanitize(null as any)).toEqual({});
            expect(manager.sanitize(undefined as any)).toEqual({});
        });
    });

    describe('Reconnection Detection', () => {
        it('should require reconnection for connection settings changes', () => {
            const oldSettings: PipelineStatusSettings = {
                organizationUrl: 'https://dev.azure.com/test',
                projectName: 'TestProject',
                pipelineId: 123,
                personalAccessToken: 'token1'
            };

            const newSettings: PipelineStatusSettings = {
                ...oldSettings,
                personalAccessToken: 'token2' // Changed
            };

            expect(manager.requiresReconnection(oldSettings, newSettings)).toBe(true);
        });

        it('should not require reconnection for display settings changes', () => {
            const oldSettings: PipelineStatusSettings = {
                organizationUrl: 'https://dev.azure.com/test',
                projectName: 'TestProject',
                pipelineId: 123,
                personalAccessToken: 'token',
                displayFormat: 'icon'
            };

            const newSettings: PipelineStatusSettings = {
                ...oldSettings,
                displayFormat: 'both', // Changed display setting
                showBuildNumber: true // Changed display setting
            };

            expect(manager.requiresReconnection(oldSettings, newSettings)).toBe(false);
        });

        it('should require reconnection for organization URL changes', () => {
            const oldSettings: PipelineStatusSettings = {
                organizationUrl: 'https://dev.azure.com/test1',
                projectName: 'TestProject',
                pipelineId: 123,
                personalAccessToken: 'token'
            };

            const newSettings: PipelineStatusSettings = {
                ...oldSettings,
                organizationUrl: 'https://dev.azure.com/test2'
            };

            expect(manager.requiresReconnection(oldSettings, newSettings)).toBe(true);
        });

        it('should require reconnection for project name changes', () => {
            const oldSettings: PipelineStatusSettings = {
                organizationUrl: 'https://dev.azure.com/test',
                projectName: 'Project1',
                pipelineId: 123,
                personalAccessToken: 'token'
            };

            const newSettings: PipelineStatusSettings = {
                ...oldSettings,
                projectName: 'Project2'
            };

            expect(manager.requiresReconnection(oldSettings, newSettings)).toBe(true);
        });
    });

});