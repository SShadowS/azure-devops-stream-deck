/**
 * Shared test utilities and mock factories for all tests
 * Provides reusable mock implementations for dependency injection
 */

import { jest } from '@jest/globals';
import { Logger } from '@elgato/streamdeck';
import type { CredentialManager } from '../utils/credential-manager';
import type { ActionStateManager } from '../utils/action-state-manager';
import type { ProfileManager } from '../services/profile-manager';
import type { ConnectionPool } from '../services/connection-pool';
import type { ErrorRecoveryService } from '../services/error-recovery';
import type { IBuildQueueService } from '../services/build-queue-service';
import type { ISprintService } from '../services/sprint-service';
import type { IReleasePipelineService } from '../services/release-pipeline-service';
import type { WorkItemService } from '../services/work-item-service';
import type { RepositoryStatsService } from '../services/repository-stats-service';
import type { TestResultsService } from '../services/test-results-service';
import type { PullRequestService } from '../services/pr-service';
import type { PipelineService } from '../services/pipeline-service';

/**
 * Creates a mock logger with all methods as jest functions
 */
export function createMockLogger(): Logger {
    return {
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        trace: jest.fn(),
        createScope: jest.fn().mockReturnValue({
            debug: jest.fn(),
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
            trace: jest.fn(),
        })
    } as unknown as Logger;
}

/**
 * Creates a mock credential manager with encrypted/decrypted token handling
 */
export function createMockCredentialManager(): Partial<CredentialManager> {
    return {
        encrypt: jest.fn().mockReturnValue('encrypted-token'),
        decrypt: jest.fn().mockReturnValue('decrypted-token'),
        validateToken: jest.fn().mockResolvedValue(true),
        secureStore: jest.fn().mockResolvedValue(undefined),
        secureRetrieve: jest.fn().mockResolvedValue('stored-token')
    } as Partial<CredentialManager>;
}

/**
 * Creates a mock state manager for action state management
 */
export function createMockStateManager(): Partial<ActionStateManager> {
    const stateMap = new Map<string, any>();
    
    return {
        getState: jest.fn((actionId: string) => {
            if (!stateMap.has(actionId)) {
                stateMap.set(actionId, {
                    isPolling: false,
                    lastUpdate: Date.now(),
                    lastError: undefined,
                    lastSettings: {},
                    connectionAttempts: 0
                });
            }
            return stateMap.get(actionId);
        }),
        setState: jest.fn((actionId: string, state: any) => {
            stateMap.set(actionId, { ...stateMap.get(actionId), ...state });
        }),
        clearState: jest.fn((actionId: string) => {
            stateMap.delete(actionId);
        }),
        updateState: jest.fn((actionId: string, updates: any) => {
            const current = stateMap.get(actionId) || {};
            stateMap.set(actionId, { ...current, ...updates });
        }),
        hasState: jest.fn((actionId: string) => stateMap.has(actionId)),
        getAllStates: jest.fn(() => Array.from(stateMap.entries()))
    } as Partial<ActionStateManager>;
}

/**
 * Creates a mock profile manager for profile handling
 */
export function createMockProfileManager(): Partial<ProfileManager> {
    const profiles = new Map<string, any>();
    
    return {
        getProfile: jest.fn((profileId: string) => profiles.get(profileId)),
        saveProfile: jest.fn((profileId: string, data: any) => {
            profiles.set(profileId, data);
            return Promise.resolve();
        }),
        deleteProfile: jest.fn((profileId: string) => {
            profiles.delete(profileId);
            return Promise.resolve();
        }),
        listProfiles: jest.fn(() => Promise.resolve(Array.from(profiles.keys()))),
        getDefaultProfile: jest.fn(() => profiles.get('default')),
        setDefaultProfile: jest.fn((profileId: string) => Promise.resolve()),
        validateProfile: jest.fn(() => Promise.resolve({ isValid: true, errors: [] })),
        exportProfile: jest.fn(() => Promise.resolve('{}')),
        importProfile: jest.fn(() => Promise.resolve('imported-id'))
    } as Partial<ProfileManager>;
}

/**
 * Creates a mock Azure DevOps connection pool
 */
export function createMockConnectionPool(): Partial<ConnectionPool> {
    return {
        getConnection: jest.fn().mockResolvedValue({
            getCoreApi: jest.fn().mockResolvedValue({}),
            getGitApi: jest.fn().mockResolvedValue({}),
            getBuildApi: jest.fn().mockResolvedValue({}),
            getReleaseApi: jest.fn().mockResolvedValue({}),
            getWorkItemTrackingApi: jest.fn().mockResolvedValue({}),
            getTestApi: jest.fn().mockResolvedValue({})
        }),
        releaseConnection: jest.fn(),
        clearPool: jest.fn(),
        validateConnection: jest.fn().mockResolvedValue(true),
        getPoolSize: jest.fn().mockReturnValue(0),
        getActiveConnections: jest.fn().mockReturnValue([])
    } as Partial<ConnectionPool>;
}

/**
 * Creates a mock error recovery service
 */
export function createMockErrorRecoveryService(): Partial<ErrorRecoveryService> {
    return {
        handleError: jest.fn().mockResolvedValue(undefined),
        canRetry: jest.fn().mockReturnValue(true),
        getRetryDelay: jest.fn().mockReturnValue(1000),
        recordError: jest.fn(),
        clearErrors: jest.fn(),
        getErrorCount: jest.fn().mockReturnValue(0),
        getLastError: jest.fn().mockReturnValue(undefined),
        shouldCircuitBreak: jest.fn().mockReturnValue(false),
        resetCircuitBreaker: jest.fn()
    } as Partial<ErrorRecoveryService>;
}

/**
 * Creates a mock build queue service
 */
export function createMockBuildQueueService(): IBuildQueueService {
    return {
        getQueueMetrics: jest.fn().mockResolvedValue({
            totalBuilds: 5,
            queuedBuilds: 2,
            runningBuilds: 1,
            completedBuilds: 2,
            averageWaitTime: 120,
            averageDuration: 300,
            oldestQueuedBuild: { id: 1, name: 'Build 1' },
            latestBuild: { id: 5, name: 'Build 5', status: 'completed' }
        }),
        queueBuild: jest.fn().mockResolvedValue({ id: 6, name: 'Build 6' }),
        cancelBuild: jest.fn().mockResolvedValue(true),
        retryBuild: jest.fn().mockResolvedValue({ id: 7, name: 'Build 7' }),
        getBuildDetails: jest.fn().mockResolvedValue({ id: 1, name: 'Build 1', status: 'completed' }),
        getQueuePosition: jest.fn().mockResolvedValue(3),
        getBuildHistory: jest.fn().mockResolvedValue([]),
        validateDefinition: jest.fn().mockResolvedValue(true)
    };
}

/**
 * Creates a mock sprint service
 */
export function createMockSprintService(): ISprintService {
    return {
        getCurrentSprintMetrics: jest.fn().mockResolvedValue({
            sprintName: 'Sprint 1',
            startDate: new Date().toISOString(),
            endDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
            totalWorkItems: 20,
            completedWorkItems: 8,
            inProgressWorkItems: 5,
            remainingWorkItems: 7,
            completionPercentage: 40,
            daysRemaining: 10,
            velocity: 15,
            burndownTrend: 'on-track',
            capacity: 100,
            effort: 80
        }),
        getSprintList: jest.fn().mockResolvedValue([]),
        getSprintDetails: jest.fn().mockResolvedValue({}),
        getSprintBurndown: jest.fn().mockResolvedValue([]),
        updateSprintCapacity: jest.fn().mockResolvedValue(true),
        getTeamVelocity: jest.fn().mockResolvedValue(15)
    };
}

/**
 * Creates a mock release pipeline service
 */
export function createMockReleasePipelineService(): IReleasePipelineService {
    return {
        getReleaseStatus: jest.fn().mockResolvedValue({
            releaseId: 1,
            releaseName: 'Release-1',
            status: 'succeeded',
            environments: [],
            createdOn: new Date().toISOString(),
            modifiedOn: new Date().toISOString()
        }),
        getLatestRelease: jest.fn().mockResolvedValue({}),
        deployToEnvironment: jest.fn().mockResolvedValue(true),
        approveDeployment: jest.fn().mockResolvedValue(true),
        getReleaseHistory: jest.fn().mockResolvedValue([]),
        getReleaseDefinitions: jest.fn().mockResolvedValue([]),
        createRelease: jest.fn().mockResolvedValue({ id: 2 }),
        cancelRelease: jest.fn().mockResolvedValue(true)
    };
}

/**
 * Creates a mock work item service
 */
export function createMockWorkItemService(): WorkItemService {
    return {
        getWorkItem: jest.fn().mockResolvedValue({
            id: 1,
            title: 'Test Work Item',
            state: 'Active',
            assignedTo: 'Test User',
            workItemType: 'Task'
        }),
        getWorkItemsByQuery: jest.fn().mockResolvedValue([]),
        updateWorkItem: jest.fn().mockResolvedValue({}),
        createWorkItem: jest.fn().mockResolvedValue({ id: 2 }),
        getWorkItemHistory: jest.fn().mockResolvedValue([]),
        getWorkItemRelations: jest.fn().mockResolvedValue([]),
        validateWorkItemType: jest.fn().mockResolvedValue(true)
    } as unknown as WorkItemService;
}

/**
 * Creates a mock repository stats service
 */
export function createMockRepositoryStatsService(): RepositoryStatsService {
    return {
        getRepositoryStats: jest.fn().mockResolvedValue({
            totalCommits: 100,
            totalBranches: 5,
            activePullRequests: 3,
            contributors: 10,
            lastCommit: new Date().toISOString(),
            codeChurn: 250,
            filesChanged: 20
        }),
        getCommitHistory: jest.fn().mockResolvedValue([]),
        getBranchList: jest.fn().mockResolvedValue([]),
        getContributorStats: jest.fn().mockResolvedValue([]),
        getFileChangeStats: jest.fn().mockResolvedValue([]),
        getCodeChurnMetrics: jest.fn().mockResolvedValue({})
    } as unknown as RepositoryStatsService;
}

/**
 * Creates a mock test results service
 */
export function createMockTestResultsService(): TestResultsService {
    return {
        getTestResults: jest.fn().mockResolvedValue({
            totalTests: 100,
            passedTests: 95,
            failedTests: 3,
            skippedTests: 2,
            passRate: 95,
            duration: 120,
            lastRun: new Date().toISOString()
        } as any),
        getTestRuns: jest.fn().mockResolvedValue([] as any),
        getTestSuites: jest.fn().mockResolvedValue([] as any),
        getFailedTests: jest.fn().mockResolvedValue([] as any),
        retryFailedTests: jest.fn().mockResolvedValue(true as any),
        getTestTrends: jest.fn().mockResolvedValue([] as any),
        getCodeCoverage: jest.fn().mockResolvedValue({ percentage: 85 } as any)
    } as unknown as TestResultsService;
}

/**
 * Creates a mock pull request service
 */
export function createMockPullRequestService(): PullRequestService {
    return {
        getPullRequests: jest.fn().mockResolvedValue([
            {
                pullRequestId: 1,
                title: 'Test PR',
                status: 'active',
                createdBy: 'Test User',
                creationDate: new Date().toISOString(),
                targetBranch: 'main',
                sourceBranch: 'feature/test'
            }
        ]),
        getPullRequestDetails: jest.fn().mockResolvedValue({}),
        approvePullRequest: jest.fn().mockResolvedValue(true),
        completePullRequest: jest.fn().mockResolvedValue(true),
        createPullRequest: jest.fn().mockResolvedValue({ id: 2 }),
        updatePullRequest: jest.fn().mockResolvedValue({}),
        getPullRequestComments: jest.fn().mockResolvedValue([]),
        addComment: jest.fn().mockResolvedValue({ id: 1 })
    } as unknown as PullRequestService;
}

/**
 * Creates a mock pipeline service
 */
export function createMockPipelineService(): PipelineService {
    return {
        getPipelineStatus: jest.fn().mockResolvedValue({
            id: 1,
            name: 'Test Pipeline',
            status: 'succeeded',
            result: 'succeeded',
            startTime: new Date().toISOString(),
            finishTime: new Date().toISOString(),
            duration: 300,
            url: 'https://test.azure.com/pipeline/1'
        }),
        runPipeline: jest.fn().mockResolvedValue({ id: 2 } as any),
        getPipelineRuns: jest.fn().mockResolvedValue([] as any),
        getPipelineDefinition: jest.fn().mockResolvedValue({} as any),
        cancelPipelineRun: jest.fn().mockResolvedValue(true as any),
        retryPipelineRun: jest.fn().mockResolvedValue({ id: 3 } as any),
        getPipelineArtifacts: jest.fn().mockResolvedValue([] as any),
        validatePipelineYaml: jest.fn().mockResolvedValue(true as any)
    } as unknown as PipelineService;
}

/**
 * Creates a mock Stream Deck action with common methods
 */
export function createMockAction() {
    return {
        id: 'test-action-id',
        setTitle: jest.fn().mockResolvedValue(undefined as any),
        setImage: jest.fn().mockResolvedValue(undefined as any),
        setState: jest.fn().mockResolvedValue(undefined as any),
        showOk: jest.fn().mockResolvedValue(undefined as any),
        showAlert: jest.fn().mockResolvedValue(undefined as any),
        setSettings: jest.fn().mockResolvedValue(undefined as any),
        getSettings: jest.fn().mockResolvedValue({} as any),
        setFeedback: jest.fn().mockResolvedValue(undefined as any),
        setFeedbackLayout: jest.fn().mockResolvedValue(undefined as any),
        setTriggerDescription: jest.fn().mockResolvedValue(undefined as any)
    };
}

/**
 * Creates a mock Stream Deck event
 */
export function createMockEvent(settings: any = {}, action: any = null, eventType: string = 'willAppear') {
    return {
        action: action || createMockAction(),
        payload: {
            settings: settings,
            coordinates: { column: 0, row: 0 },
            state: 0,
            isInMultiAction: false
        },
        context: 'test-context',
        device: 'test-device',
        type: eventType
    };
}

/**
 * Utility to reset all mocks
 */
export function resetAllMocks(...mocks: any[]) {
    mocks.forEach(mock => {
        if (mock && typeof mock === 'object') {
            Object.keys(mock).forEach(key => {
                if (typeof mock[key] === 'function' && 'mockClear' in mock[key]) {
                    mock[key].mockClear();
                }
            });
        }
    });
}

/**
 * Utility to create a complete set of mocks for action testing
 */
export function createActionTestMocks() {
    return {
        mockLogger: createMockLogger(),
        mockCredentialManager: createMockCredentialManager(),
        mockStateManager: createMockStateManager(),
        mockProfileManager: createMockProfileManager(),
        mockConnectionPool: createMockConnectionPool(),
        mockErrorRecovery: createMockErrorRecoveryService(),
        mockAction: createMockAction()
    };
}

/**
 * Service-specific mock bundles
 */
export const ServiceMocks = {
    buildQueue: createMockBuildQueueService,
    sprint: createMockSprintService,
    releasePipeline: createMockReleasePipelineService,
    workItem: createMockWorkItemService,
    repositoryStats: createMockRepositoryStatsService,
    testResults: createMockTestResultsService,
    pullRequest: createMockPullRequestService,
    pipeline: createMockPipelineService
};