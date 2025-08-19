/**
 * Comprehensive tests for DIContainer
 * Tests service registration, resolution, singleton management, and error handling
 */

import { jest } from '@jest/globals';
import { DIContainer, ServiceTokens } from '../index';
import { createMockLogger } from '../../test-utils/mock-factories';

describe('DIContainer', () => {
    let container: DIContainer;

    beforeEach(() => {
        // Reset singleton instance for clean tests
        (DIContainer as any).instance = undefined;
        container = DIContainer.getInstance();
        container.clearSingletons();
    });

    afterEach(() => {
        container.clearSingletons();
        jest.clearAllMocks();
    });

    describe('Singleton Pattern', () => {
        it('should return the same instance on multiple calls', () => {
            const instance1 = DIContainer.getInstance();
            const instance2 = DIContainer.getInstance();
            
            expect(instance1).toBe(instance2);
            expect(instance1).toBe(container);
        });

        it('should maintain state across getInstance calls', () => {
            const testToken = 'test-service';
            const factory = jest.fn(() => ({ value: 'test' }));
            
            container.register(testToken, factory);
            
            const newInstance = DIContainer.getInstance();
            expect(newInstance.has(testToken)).toBe(true);
        });
    });

    describe('Service Registration', () => {
        it('should register singleton services by default', () => {
            const testToken = 'test-singleton';
            const factory = jest.fn(() => ({ id: Math.random() }));
            
            container.register(testToken, factory);
            
            const instance1 = container.resolve(testToken);
            const instance2 = container.resolve(testToken);
            
            expect(instance1).toBe(instance2);
            expect(factory).toHaveBeenCalledTimes(1);
        });

        it('should register non-singleton services when specified', () => {
            const testToken = 'test-non-singleton';
            const factory = jest.fn(() => ({ id: Math.random() }));
            
            container.register(testToken, factory, false);
            
            const instance1 = container.resolve(testToken);
            const instance2 = container.resolve(testToken);
            
            expect(instance1).not.toBe(instance2);
            expect(factory).toHaveBeenCalledTimes(2);
        });

        it('should allow re-registration of services', () => {
            const testToken = 'test-re-register';
            const factory1 = jest.fn(() => ({ version: 1 }));
            const factory2 = jest.fn(() => ({ version: 2 }));
            
            container.register(testToken, factory1);
            const instance1 = container.resolve(testToken) as { version: number };
            
            // Clear singletons to allow re-registration to take effect
            container.clearSingletons();
            container.register(testToken, factory2);
            const instance2 = container.resolve(testToken) as { version: number };
            
            expect(instance1.version).toBe(1);
            expect(instance2.version).toBe(2);
        });
    });

    describe('Service Resolution', () => {
        it('should resolve registered services', () => {
            const testToken = 'test-resolve';
            const expectedValue = { data: 'test-data' };
            const factory = jest.fn(() => expectedValue);
            
            container.register(testToken, factory);
            const resolved = container.resolve(testToken);
            
            expect(resolved).toBe(expectedValue);
            expect(factory).toHaveBeenCalledTimes(1);
        });

        it('should throw error for unregistered services', () => {
            const unregisteredToken = 'unregistered-service';
            
            expect(() => container.resolve(unregisteredToken)).toThrow(
                `Service not registered: ${unregisteredToken}`
            );
        });

        it('should handle string tokens', () => {
            const stringToken = 'string-token';
            const factory = jest.fn(() => ({ type: 'string' }));
            
            container.register(stringToken, factory);
            const resolved = container.resolve(stringToken) as { type: string };
            
            expect(resolved.type).toBe('string');
        });

        it('should handle symbol tokens', () => {
            const symbolToken = Symbol('symbol-token');
            const factory = jest.fn(() => ({ type: 'symbol' }));
            
            container.register(symbolToken, factory);
            const resolved = container.resolve(symbolToken) as { type: string };
            
            expect(resolved.type).toBe('symbol');
        });
    });

    describe('Service Existence Check', () => {
        it('should return true for registered services', () => {
            const testToken = 'test-exists';
            const factory = jest.fn(() => ({}));
            
            container.register(testToken, factory);
            
            expect(container.has(testToken)).toBe(true);
        });

        it('should return false for unregistered services', () => {
            const unregisteredToken = 'unregistered';
            
            expect(container.has(unregisteredToken)).toBe(false);
        });
    });

    describe('Singleton Management', () => {
        it('should clear all singleton instances', () => {
            const token1 = 'singleton-1';
            const token2 = 'singleton-2';
            const factory1 = jest.fn(() => ({ id: 1 }));
            const factory2 = jest.fn(() => ({ id: 2 }));
            
            container.register(token1, factory1);
            container.register(token2, factory2);
            
            // Create instances
            const instance1a = container.resolve(token1);
            const instance2a = container.resolve(token2);
            
            // Clear singletons
            container.clearSingletons();
            
            // Resolve again - should create new instances
            const instance1b = container.resolve(token1);
            const instance2b = container.resolve(token2);
            
            expect(instance1a).not.toBe(instance1b);
            expect(instance2a).not.toBe(instance2b);
            expect(factory1).toHaveBeenCalledTimes(2);
            expect(factory2).toHaveBeenCalledTimes(2);
        });

        it('should not affect non-singleton services when clearing', () => {
            const singletonToken = 'singleton';
            const nonSingletonToken = 'non-singleton';
            const singletonFactory = jest.fn(() => ({ type: 'singleton' }));
            const nonSingletonFactory = jest.fn(() => ({ type: 'non-singleton' }));
            
            container.register(singletonToken, singletonFactory, true);
            container.register(nonSingletonToken, nonSingletonFactory, false);
            
            // Create instances
            container.resolve(singletonToken);
            container.resolve(nonSingletonToken);
            
            container.clearSingletons();
            
            // Resolve again
            container.resolve(singletonToken);
            container.resolve(nonSingletonToken);
            
            expect(singletonFactory).toHaveBeenCalledTimes(2); // Re-created after clear
            expect(nonSingletonFactory).toHaveBeenCalledTimes(2); // Always creates new
        });
    });

    describe('Default Service Registration', () => {
        it('should register core logger service', () => {
            expect(container.has(ServiceTokens.Logger)).toBe(true);
            
            const logger = container.resolve(ServiceTokens.Logger) as any;
            expect(logger).toBeDefined();
            expect(typeof logger.info).toBe('function');
        });

        it('should register singleton managers', () => {
            const managerTokens = [
                ServiceTokens.ConnectionPool,
                ServiceTokens.ProfileManager,
                ServiceTokens.ErrorRecoveryService,
                ServiceTokens.ActionStateManager,
                ServiceTokens.SettingsManager,
                ServiceTokens.CredentialManager,
                ServiceTokens.StatusDisplayManager,
                ServiceTokens.PRDisplayManager
            ];

            managerTokens.forEach(token => {
                expect(container.has(token)).toBe(true);
                const service = container.resolve(token);
                expect(service).toBeDefined();
            });
        });

        it('should register non-singleton services', () => {
            const serviceTokens = [
                ServiceTokens.AzureDevOpsClient,
                ServiceTokens.PipelineService,
                ServiceTokens.WorkItemService,
                ServiceTokens.SprintService,
                ServiceTokens.RepositoryStatsService,
                ServiceTokens.ReleasePipelineService,
                ServiceTokens.BuildQueueService,
                ServiceTokens.TestResultsService
            ];

            serviceTokens.forEach(token => {
                expect(container.has(token)).toBe(true);
                const service = container.resolve(token);
                expect(service).toBeDefined();
            });
        });

        it('should register action classes', () => {
            const actionTokens = [
                ServiceTokens.ConfigurationManagerAction,
                ServiceTokens.PipelineStatusAction,
                ServiceTokens.PRChecks,
                ServiceTokens.WorkItemStatusAction,
                ServiceTokens.SprintProgressAction,
                ServiceTokens.RepositoryStatsAction,
                ServiceTokens.ReleasePipelineMonitorAction,
                ServiceTokens.BuildQueueManagerAction,
                ServiceTokens.TestResultsSummaryAction
            ];

            actionTokens.forEach(token => {
                expect(container.has(token)).toBe(true);
                const action = container.resolve(token);
                expect(action).toBeDefined();
            });
        });
    });

    describe('Dependency Injection', () => {
        it('should resolve dependencies for credential manager', () => {
            const credentialManager = container.resolve(ServiceTokens.CredentialManager) as any;
            expect(credentialManager).toBeDefined();
            expect(typeof credentialManager.encrypt).toBe('function');
            expect(typeof credentialManager.decrypt).toBe('function');
        });

        it('should resolve dependencies for pipeline service', () => {
            const pipelineService = container.resolve(ServiceTokens.PipelineService);
            expect(pipelineService).toBeDefined();
        });

        it('should maintain circular dependency safety', () => {
            // Should not throw with current dependency graph
            expect(() => {
                container.resolve(ServiceTokens.Logger);
                container.resolve(ServiceTokens.CredentialManager);
                container.resolve(ServiceTokens.PipelineService);
            }).not.toThrow();
        });
    });

    describe('Service Token Constants', () => {
        it('should have all required service tokens defined', () => {
            expect(ServiceTokens.Logger).toBe('Logger');
            expect(ServiceTokens.ConnectionPool).toBe('ConnectionPool');
            expect(ServiceTokens.ProfileManager).toBe('ProfileManager');
            expect(ServiceTokens.CredentialManager).toBe('CredentialManager');
            expect(ServiceTokens.PipelineService).toBe('PipelineService');
        });

        it('should have unique token values', () => {
            const tokenValues = Object.values(ServiceTokens);
            const uniqueValues = new Set(tokenValues);
            
            expect(tokenValues.length).toBe(uniqueValues.size);
        });
    });

    describe('Error Handling', () => {
        it('should handle factory exceptions gracefully', () => {
            const errorToken = 'error-service';
            const errorFactory = jest.fn(() => {
                throw new Error('Factory failed');
            });
            
            container.register(errorToken, errorFactory);
            
            expect(() => container.resolve(errorToken)).toThrow('Factory failed');
        });

        it('should handle null/undefined factory results', () => {
            const nullToken = 'null-service';
            const undefinedToken = 'undefined-service';
            const nullFactory = jest.fn(() => null);
            const undefinedFactory = jest.fn(() => undefined);
            
            container.register(nullToken, nullFactory);
            container.register(undefinedToken, undefinedFactory);
            
            expect(container.resolve(nullToken)).toBeNull();
            expect(container.resolve(undefinedToken)).toBeUndefined();
        });
    });

    describe('Memory Management', () => {
        it('should not leak memory with many registrations', () => {
            const initialSize = (container as any).services.size;
            
            // Register many services
            for (let i = 0; i < 100; i++) {
                container.register(`test-service-${i}`, () => ({ id: i }));
            }
            
            expect((container as any).services.size).toBe(initialSize + 100);
            
            // Clear and verify
            container.clearSingletons();
            expect((container as any).singletons.size).toBe(0);
        });

        it('should properly clean up singleton references', () => {
            const testToken = 'memory-test';
            const factory = jest.fn(() => ({ data: new Array(1000).fill(0) }));
            
            container.register(testToken, factory);
            container.resolve(testToken);
            
            expect((container as any).singletons.has(testToken)).toBe(true);
            
            container.clearSingletons();
            
            expect((container as any).singletons.has(testToken)).toBe(false);
        });
    });

    describe('Thread Safety Simulation', () => {
        it('should handle concurrent resolution attempts', async () => {
            const testToken = 'concurrent-service';
            let creationCount = 0;
            const factory = jest.fn(() => {
                creationCount++;
                return { id: creationCount };
            });
            
            container.register(testToken, factory);
            
            // Simulate concurrent resolution
            const promises = Array.from({ length: 10 }, () =>
                Promise.resolve(container.resolve(testToken))
            );
            
            const results = await Promise.all(promises);
            
            // All should be the same instance (singleton)
            const firstInstance = results[0];
            results.forEach(instance => {
                expect(instance).toBe(firstInstance);
            });
            
            expect(factory).toHaveBeenCalledTimes(1);
        });
    });
});