// Service Interfaces
export interface ISprintService {
    getCurrentSprintMetrics(settings: {
        orgUrl: string;
        projectName: string;
        teamName: string;
        pat: string;
        sprintPath?: string;
    }): Promise<{
        name: string;
        startDate: Date;
        endDate: Date;
        totalPoints: number;
        completedPoints: number;
        remainingPoints: number;
        totalItems: number;
        completedItems: number;
        remainingItems: number;
        percentComplete: number;
        daysRemaining: number;
        totalDays: number;
        burndownTrend: 'on-track' | 'behind' | 'ahead' | 'complete';
        velocity?: number;
    }>;
}

export interface ITestResultsService {
    getTestMetrics(settings: {
        orgUrl: string;
        projectName: string;
        pat: string;
        pipelineId?: number;
        buildDefinitionId?: number;
        maxRuns?: number;
        maxAge?: number;
    }): Promise<any>;
}

export interface IBuildQueueService {
    getQueueMetrics(settings: {
        orgUrl: string;
        projectName: string;
        pat: string;
        poolId?: number;
        definitionId?: number;
    }): Promise<any>;
    
    queueBuild(
        settings: any,
        definitionId: number,
        sourceBranch?: string,
        parameters?: Record<string, string>
    ): Promise<any>;
    
    cancelBuild(
        settings: any,
        buildId: number
    ): Promise<void>;
    
    retryBuild(
        settings: any,
        buildId: number
    ): Promise<any>;
}

export interface IReleasePipelineService {
    getReleaseMetrics(settings: {
        orgUrl: string;
        projectName: string;
        pat: string;
        definitionId: number;
    }): Promise<any>;
}

// Manager Interfaces
export interface ICredentialManager {
    encrypt(token: string): string;
    decrypt(encryptedToken: string): string;
}

export interface IActionStateManager {
    getState(actionId: string): any;
    updateState(actionId: string, updates: any): void;
    clearState(actionId: string): void;
}

// Logger Interface
export interface ILogger {
    trace(message: string, ...args: any[]): void;
    debug(message: string, ...args: any[]): void;
    info(message: string, ...args: any[]): void;
    warn(message: string, ...args: any[]): void;
    error(message: string, ...args: any[]): void;
}