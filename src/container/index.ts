import streamDeck from '@elgato/streamdeck';
import { AzureDevOpsConnectionPool } from '../services/connection-pool';
import { ProfileManager } from '../services/profile-manager';
import { ErrorRecoveryService } from '../services/error-recovery';
import { ActionStateManager } from '../utils/action-state-manager';
import { SettingsManager } from '../utils/settings-manager';
import { CredentialManager } from '../utils/credential-manager';
import { StatusDisplayManager } from '../utils/status-display';
import { PRDisplayManager } from '../utils/pr-display-manager';
import { visualFeedback } from '../utils/visual-feedback';
import { performanceOptimizer } from '../utils/performance-optimizer';
import { memoryLeakDetector } from '../utils/memory-leak-detector';

// Services
import { AzureDevOpsClient } from '../services/azure-devops-client';
import { PipelineService } from '../services/pipeline-service';
import { PRService } from '../services/pr-service';
import { WorkItemService } from '../services/work-item-service';
import { SprintService } from '../services/sprint-service';
import { RepositoryStatsService } from '../services/repository-stats-service';
import { ReleasePipelineService } from '../services/release-pipeline-service';
import { BuildQueueService } from '../services/build-queue-service';
import { TestResultsService } from '../services/test-results-service';

// Actions
import { ConfigurationManagerAction } from '../actions/configuration-manager';
import { PipelineStatusAction } from '../actions/pipeline-status';
import { PRChecks } from '../actions/pr-checks';
import { WorkItemStatusAction } from '../actions/work-item-status';
import { SprintProgressAction } from '../actions/sprint-progress';
import { RepositoryStatsAction } from '../actions/repository-stats';
import { ReleasePipelineMonitorAction } from '../actions/release-pipeline-monitor';
import { BuildQueueManagerAction } from '../actions/build-queue-manager';
import { TestResultsSummaryAction } from '../actions/test-results-summary';

// Interfaces
import { ILogger } from '../interfaces';

type ServiceFactory<T = any> = () => T;
type ServiceToken = string | symbol;

/**
 * Dependency Injection Container for the Azure DevOps Stream Deck plugin.
 * Manages service creation and lifecycle.
 */
export class DIContainer {
    private static instance: DIContainer;
    private services = new Map<ServiceToken, ServiceFactory>();
    private singletons = new Map<ServiceToken, any>();
    
    private constructor() {
        this.registerDefaults();
    }
    
    /**
     * Gets the singleton instance of the container
     */
    static getInstance(): DIContainer {
        if (!this.instance) {
            this.instance = new DIContainer();
        }
        return this.instance;
    }
    
    /**
     * Registers a service factory
     */
    register<T>(token: ServiceToken, factory: ServiceFactory<T>, singleton = true): void {
        if (singleton) {
            // Wrap factory to ensure singleton behavior
            const originalFactory = factory;
            this.services.set(token, () => {
                if (!this.singletons.has(token)) {
                    this.singletons.set(token, originalFactory());
                }
                return this.singletons.get(token);
            });
        } else {
            this.services.set(token, factory);
        }
    }
    
    /**
     * Resolves a service by token
     */
    resolve<T>(token: ServiceToken): T {
        const factory = this.services.get(token);
        if (!factory) {
            throw new Error(`Service not registered: ${String(token)}`);
        }
        return factory();
    }
    
    /**
     * Checks if a service is registered
     */
    has(token: ServiceToken): boolean {
        return this.services.has(token);
    }
    
    /**
     * Clears all singleton instances (useful for testing)
     */
    clearSingletons(): void {
        this.singletons.clear();
    }
    
    /**
     * Registers all default services and actions
     */
    private registerDefaults(): void {
        // Core utilities
        this.register('Logger', () => streamDeck.logger);
        
        // Singleton managers and utilities
        this.register('ConnectionPool', () => AzureDevOpsConnectionPool.getInstance());
        this.register('ProfileManager', () => ProfileManager.getInstance());
        this.register('ErrorRecoveryService', () => new ErrorRecoveryService());
        this.register('ActionStateManager', () => new ActionStateManager());
        this.register('SettingsManager', () => new SettingsManager());
        this.register('CredentialManager', () => new CredentialManager(this.resolve('Logger')));
        this.register('StatusDisplayManager', () => new StatusDisplayManager());
        this.register('PRDisplayManager', () => new PRDisplayManager());
        this.register('VisualFeedback', () => visualFeedback);
        this.register('PerformanceOptimizer', () => performanceOptimizer);
        this.register('MemoryLeakDetector', () => memoryLeakDetector);
        
        // Services (non-singleton for testing)
        this.register('AzureDevOpsClient', () => new AzureDevOpsClient(), false);
        this.register('PipelineService', () => new PipelineService(
            this.resolve('AzureDevOpsClient')
        ), false);
        // PRService requires connection-specific credentials, so it's created on-demand in actions
        // Not registered in container
        this.register('WorkItemService', () => new WorkItemService(
            this.resolve('Logger')
        ), false);
        this.register('SprintService', () => new SprintService(
            this.resolve('Logger')
        ), false);
        this.register('RepositoryStatsService', () => new RepositoryStatsService(
            this.resolve('Logger')
        ), false);
        this.register('ReleasePipelineService', () => new ReleasePipelineService(
            this.resolve('Logger')
        ), false);
        this.register('BuildQueueService', () => new BuildQueueService(
            this.resolve('Logger')
        ), false);
        this.register('TestResultsService', () => new TestResultsService(
            this.resolve('Logger')
        ), false);
        
        // Actions
        this.registerActions();
    }
    
    /**
     * Registers all action classes
     */
    private registerActions(): void {
        // Configuration Manager (doesn't need DI refactoring yet)
        this.register('ConfigurationManagerAction', () => new ConfigurationManagerAction());
        
        // These will be refactored to use DI
        this.register('PipelineStatusAction', () => new PipelineStatusAction());
        this.register('PRChecks', () => new PRChecks());
        this.register('WorkItemStatusAction', () => new WorkItemStatusAction());
        this.register('SprintProgressAction', () => new SprintProgressAction());
        this.register('RepositoryStatsAction', () => new RepositoryStatsAction());
        this.register('ReleasePipelineMonitorAction', () => new ReleasePipelineMonitorAction());
        this.register('BuildQueueManagerAction', () => new BuildQueueManagerAction());
        this.register('TestResultsSummaryAction', () => new TestResultsSummaryAction());
    }
}

// Export service tokens for type-safe access
export const ServiceTokens = {
    // Core
    Logger: 'Logger',
    
    // Managers
    ConnectionPool: 'ConnectionPool',
    ProfileManager: 'ProfileManager',
    ErrorRecoveryService: 'ErrorRecoveryService',
    ActionStateManager: 'ActionStateManager',
    SettingsManager: 'SettingsManager',
    CredentialManager: 'CredentialManager',
    StatusDisplayManager: 'StatusDisplayManager',
    PRDisplayManager: 'PRDisplayManager',
    VisualFeedback: 'VisualFeedback',
    PerformanceOptimizer: 'PerformanceOptimizer',
    MemoryLeakDetector: 'MemoryLeakDetector',
    
    // Services
    AzureDevOpsClient: 'AzureDevOpsClient',
    PipelineService: 'PipelineService',
    PullRequestService: 'PullRequestService',
    WorkItemService: 'WorkItemService',
    SprintService: 'SprintService',
    RepositoryStatsService: 'RepositoryStatsService',
    ReleasePipelineService: 'ReleasePipelineService',
    BuildQueueService: 'BuildQueueService',
    TestResultsService: 'TestResultsService',
    
    // Actions
    ConfigurationManagerAction: 'ConfigurationManagerAction',
    PipelineStatusAction: 'PipelineStatusAction',
    PRChecks: 'PRChecks',
    WorkItemStatusAction: 'WorkItemStatusAction',
    SprintProgressAction: 'SprintProgressAction',
    RepositoryStatsAction: 'RepositoryStatsAction',
    ReleasePipelineMonitorAction: 'ReleasePipelineMonitorAction',
    BuildQueueManagerAction: 'BuildQueueManagerAction',
    TestResultsSummaryAction: 'TestResultsSummaryAction'
} as const;

// Type helpers for resolving services
export type ServiceType<T extends keyof typeof ServiceTokens> = 
    T extends 'Logger' ? ILogger :
    T extends 'ConnectionPool' ? AzureDevOpsConnectionPool :
    T extends 'ProfileManager' ? ProfileManager :
    T extends 'ErrorRecoveryService' ? ErrorRecoveryService :
    T extends 'ActionStateManager' ? ActionStateManager :
    T extends 'SettingsManager' ? SettingsManager :
    T extends 'CredentialManager' ? CredentialManager :
    T extends 'StatusDisplayManager' ? StatusDisplayManager :
    T extends 'PRDisplayManager' ? PRDisplayManager :
    T extends 'PipelineService' ? PipelineService :
    T extends 'PullRequestService' ? PRService :
    T extends 'WorkItemService' ? WorkItemService :
    T extends 'SprintService' ? SprintService :
    T extends 'RepositoryStatsService' ? RepositoryStatsService :
    T extends 'ReleasePipelineService' ? ReleasePipelineService :
    T extends 'BuildQueueService' ? BuildQueueService :
    T extends 'TestResultsService' ? TestResultsService :
    any;