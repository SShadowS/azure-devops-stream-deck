import { Logger } from '@elgato/streamdeck';
import * as azdev from 'azure-devops-node-api';
import { ITestApi } from 'azure-devops-node-api/TestApi';
import { IBuildApi } from 'azure-devops-node-api/BuildApi';
import { 
    TestRun,
    TestCaseResult,
    TestOutcome,
    TestRunState,
    ResultDetails,
    TestRunStatistic,
    TestResultsContext,
    TestResultsDetails,
    TestResultsQuery,
    TestResultsSettings,
    CoverageStatistics,
    CodeCoverageData,
    CodeCoverageSummary,
    TestSuite,
    TestPlan
} from 'azure-devops-node-api/interfaces/TestInterfaces';
import {
    Build,
    BuildStatus,
    BuildResult
} from 'azure-devops-node-api/interfaces/BuildInterfaces';
import { AzureDevOpsClient } from './azure-devops-client';

export interface TestResultsServiceSettings {
    orgUrl: string;
    projectName: string;
    pat: string;
    buildDefinitionId?: number;
    buildDefinitionName?: string;
    testPlanId?: number;
    testSuiteId?: number;
    includeFailedOnly?: boolean;
}

export interface TestResultsMetrics {
    totalTests: number;
    passedTests: number;
    failedTests: number;
    skippedTests: number;
    passRate: number;
    failureRate: number;
    averageDuration: number; // in seconds
    totalDuration: number; // in seconds
    recentRuns: TestRunSummary[];
    failedTestDetails: FailedTestDetail[];
    flakyTests: FlakyTestInfo[];
    codeCoverage?: CodeCoverageInfo;
    trend: TestTrend;
}

export interface TestRunSummary {
    id: number;
    name: string;
    buildNumber?: string;
    state: string;
    startedDate?: Date;
    completedDate?: Date;
    totalTests: number;
    passedTests: number;
    failedTests: number;
    passRate: number;
    duration: number; // in seconds
    url?: string;
}

export interface FailedTestDetail {
    testCaseTitle: string;
    testSuite?: string;
    errorMessage?: string;
    stackTrace?: string;
    failureType?: string;
    duration: number;
    owner?: string;
    priority?: number;
    runId: number;
    resultId: number;
}

export interface FlakyTestInfo {
    testCaseTitle: string;
    flakinessRate: number; // percentage of intermittent failures
    recentResults: boolean[]; // true = passed, false = failed
    totalRuns: number;
    failureCount: number;
}

export interface CodeCoverageInfo {
    lineCoverage: number;
    branchCoverage: number;
    methodCoverage: number;
    classCoverage: number;
    coverageTrend: 'increasing' | 'decreasing' | 'stable';
    uncoveredLines?: number;
    totalLines?: number;
}

export interface TestTrend {
    direction: 'improving' | 'declining' | 'stable';
    passRateChange: number; // percentage change
    durationChange: number; // percentage change
    recentPassRates: number[]; // last 5 run pass rates
}

export class TestResultsService {
    private client: AzureDevOpsClient;
    private logger: Logger;
    private testApi: ITestApi | null = null;
    private buildApi: IBuildApi | null = null;
    private cache = new Map<string, { data: TestResultsMetrics, timestamp: number }>();
    private readonly CACHE_DURATION = 30000; // 30 seconds

    constructor(logger: Logger) {
        this.logger = logger;
        this.client = new AzureDevOpsClient();
    }

    async getTestMetrics(settings: TestResultsServiceSettings): Promise<TestResultsMetrics> {
        const cacheKey = this.getCacheKey(settings);
        const cached = this.cache.get(cacheKey);
        
        if (cached && Date.now() - cached.timestamp < this.CACHE_DURATION) {
            this.logger.debug('Returning cached test results metrics');
            return cached.data;
        }

        try {
            await this.ensureConnection(settings);
            
            if (!this.testApi) {
                throw new Error('Test API not initialized');
            }

            // Get recent test runs
            const recentRuns = await this.getRecentTestRuns(settings);
            
            // Calculate aggregate metrics
            const aggregateMetrics = this.calculateAggregateMetrics(recentRuns);
            
            // Get failed test details from most recent run
            const failedTests = await this.getFailedTestDetails(settings, recentRuns);
            
            // Identify flaky tests
            const flakyTests = await this.identifyFlakyTests(settings, recentRuns);
            
            // Get code coverage if available
            const codeCoverage = await this.getCodeCoverageMetrics(settings, recentRuns);
            
            // Calculate trend
            const trend = this.calculateTestTrend(recentRuns);

            const metrics: TestResultsMetrics = {
                ...aggregateMetrics,
                recentRuns: recentRuns.slice(0, 10), // Keep last 10 runs
                failedTestDetails: failedTests,
                flakyTests,
                codeCoverage,
                trend
            };

            this.cache.set(cacheKey, { data: metrics, timestamp: Date.now() });
            
            return metrics;
        } catch (error) {
            this.logger.error('Error fetching test metrics:', error);
            throw error;
        }
    }

    async getTestRunDetails(settings: TestResultsServiceSettings, runId: number): Promise<TestRun> {
        try {
            await this.ensureConnection(settings);
            
            if (!this.testApi) {
                throw new Error('Test API not initialized');
            }

            const testRun = await this.testApi.getTestRunById(settings.projectName, runId);
            
            if (!testRun) {
                throw new Error(`Test run ${runId} not found`);
            }

            return testRun;
        } catch (error) {
            this.logger.error('Error fetching test run details:', error);
            throw error;
        }
    }

    async retryFailedTests(settings: TestResultsServiceSettings, runId: number): Promise<TestRun> {
        try {
            await this.ensureConnection(settings);
            
            if (!this.testApi || !this.buildApi) {
                throw new Error('APIs not initialized');
            }

            // Get the original test run
            const originalRun = await this.testApi.getTestRunById(settings.projectName, runId);
            
            if (!originalRun) {
                throw new Error('Original test run not found');
            }

            // Get failed test results
            const results = await this.testApi.getTestResults(settings.projectName, runId);
            const failedResults = results.filter(r => r.outcome === 'Failed');
            
            if (failedResults.length === 0) {
                throw new Error('No failed tests to retry');
            }

            // If the run was from a build, we would trigger a new build
            // For now, just log that we would retry
            if (originalRun.build) {
                this.logger.info(`Would retry tests from build ${originalRun.build.id}`);
                
                // Return a placeholder run object
                return {
                    id: 0,
                    name: `Retry of ${originalRun.name}`,
                    state: 'InProgress' as any
                } as TestRun;
            }

            throw new Error('Cannot retry tests - no associated build found');
        } catch (error) {
            this.logger.error('Error retrying failed tests:', error);
            throw error;
        }
    }

    private async getRecentTestRuns(settings: TestResultsServiceSettings): Promise<TestRunSummary[]> {
        if (!this.testApi) {
            return [];
        }

        try {
            // Get test runs from the last 7 days
            const minDate = new Date();
            minDate.setDate(minDate.getDate() - 7);

            const runs = await this.testApi.getTestRuns(
                settings.projectName,
                undefined, // buildUri
                undefined, // owner
                undefined, // tmiRunId
                undefined, // planId
                undefined, // includeRunDetails
                undefined, // automated
                undefined, // skip
                undefined // top
            );

            // Sort by completed date descending
            runs.sort((a, b) => {
                const dateA = a.completedDate ? new Date(a.completedDate).getTime() : 0;
                const dateB = b.completedDate ? new Date(b.completedDate).getTime() : 0;
                return dateB - dateA;
            });

            // Map to summary objects
            return runs.map(run => this.mapTestRunSummary(run));
        } catch (error) {
            this.logger.debug('Error fetching test runs:', error);
            return [];
        }
    }

    private mapTestRunSummary(run: TestRun): TestRunSummary {
        const totalTests = run.totalTests || 0;
        const passedTests = run.passedTests || 0;
        const failedTests = (run.unanalyzedTests || 0) + (run.notApplicableTests || 0);
        
        const startTime = run.startedDate ? new Date(run.startedDate).getTime() : 0;
        const endTime = run.completedDate ? new Date(run.completedDate).getTime() : Date.now();
        const duration = startTime ? (endTime - startTime) / 1000 : 0;

        return {
            id: run.id!,
            name: run.name || 'Unknown',
            buildNumber: undefined, // Build reference doesn't have buildNumber directly
            state: this.mapTestRunState(run.state as any),
            startedDate: run.startedDate ? new Date(run.startedDate) : undefined,
            completedDate: run.completedDate ? new Date(run.completedDate) : undefined,
            totalTests,
            passedTests,
            failedTests,
            passRate: totalTests > 0 ? (passedTests / totalTests) * 100 : 0,
            duration,
            url: run.webAccessUrl
        };
    }

    private mapTestRunState(state?: TestRunState): string {
        if (!state) return 'Unknown';
        
        switch (state) {
            case TestRunState.NotStarted: return 'Not Started';
            case TestRunState.InProgress: return 'In Progress';
            case TestRunState.Completed: return 'Completed';
            case TestRunState.Waiting: return 'Waiting';
            case TestRunState.Aborted: return 'Aborted';
            case TestRunState.NeedsInvestigation: return 'Needs Investigation';
            default: return 'Unknown';
        }
    }

    private calculateAggregateMetrics(runs: TestRunSummary[]): Omit<TestResultsMetrics, 'recentRuns' | 'failedTestDetails' | 'flakyTests' | 'codeCoverage' | 'trend'> {
        if (runs.length === 0) {
            return {
                totalTests: 0,
                passedTests: 0,
                failedTests: 0,
                skippedTests: 0,
                passRate: 0,
                failureRate: 0,
                averageDuration: 0,
                totalDuration: 0
            };
        }

        // Use the most recent completed run for current metrics
        const latestRun = runs.find(r => r.state === 'Completed') || runs[0];
        
        // Calculate average duration from all runs
        const totalDuration = runs.reduce((sum, run) => sum + run.duration, 0);
        const averageDuration = totalDuration / runs.length;

        return {
            totalTests: latestRun.totalTests,
            passedTests: latestRun.passedTests,
            failedTests: latestRun.failedTests,
            skippedTests: latestRun.totalTests - latestRun.passedTests - latestRun.failedTests,
            passRate: latestRun.passRate,
            failureRate: latestRun.totalTests > 0 ? (latestRun.failedTests / latestRun.totalTests) * 100 : 0,
            averageDuration,
            totalDuration: latestRun.duration
        };
    }

    private async getFailedTestDetails(settings: TestResultsServiceSettings, runs: TestRunSummary[]): Promise<FailedTestDetail[]> {
        if (!this.testApi || runs.length === 0) {
            return [];
        }

        try {
            // Get failed tests from the most recent run
            const latestRun = runs[0];
            if (latestRun.failedTests === 0) {
                return [];
            }

            const results = await this.testApi.getTestResults(
                settings.projectName,
                latestRun.id,
                undefined, // detailsToInclude
                undefined, // skip
                undefined, // top
                [TestOutcome.Failed] // outcomes
            );

            return results.slice(0, 10).map(result => ({
                testCaseTitle: result.testCaseTitle || 'Unknown',
                testSuite: result.automatedTestStorage,
                errorMessage: result.errorMessage,
                stackTrace: result.stackTrace,
                failureType: result.failureType,
                duration: result.durationInMs ? result.durationInMs / 1000 : 0,
                owner: result.owner?.displayName,
                priority: result.priority,
                runId: latestRun.id,
                resultId: result.id!
            }));
        } catch (error) {
            this.logger.debug('Error fetching failed test details:', error);
            return [];
        }
    }

    private async identifyFlakyTests(settings: TestResultsServiceSettings, runs: TestRunSummary[]): Promise<FlakyTestInfo[]> {
        if (!this.testApi || runs.length < 3) {
            return [];
        }

        try {
            // Analyze test results across multiple runs to identify flaky tests
            const testResultsMap = new Map<string, boolean[]>();
            
            // Get results from last 5 runs
            const runsToAnalyze = runs.slice(0, Math.min(5, runs.length));
            
            for (const run of runsToAnalyze) {
                const results = await this.testApi.getTestResults(
                    settings.projectName,
                    run.id
                );

                for (const result of results) {
                    const testName = result.testCaseTitle || 'Unknown';
                    if (!testResultsMap.has(testName)) {
                        testResultsMap.set(testName, []);
                    }
                    
                    const passed = result.outcome === 'Passed';
                    testResultsMap.get(testName)!.push(passed);
                }
            }

            // Identify flaky tests (tests that have both passed and failed)
            const flakyTests: FlakyTestInfo[] = [];
            
            for (const [testName, results] of testResultsMap.entries()) {
                const passCount = results.filter(r => r).length;
                const failCount = results.filter(r => !r).length;
                
                if (passCount > 0 && failCount > 0) {
                    flakyTests.push({
                        testCaseTitle: testName,
                        flakinessRate: (failCount / results.length) * 100,
                        recentResults: results,
                        totalRuns: results.length,
                        failureCount: failCount
                    });
                }
            }

            // Sort by flakiness rate
            flakyTests.sort((a, b) => b.flakinessRate - a.flakinessRate);
            
            return flakyTests.slice(0, 5); // Return top 5 flaky tests
        } catch (error) {
            this.logger.debug('Error identifying flaky tests:', error);
            return [];
        }
    }

    private async getCodeCoverageMetrics(settings: TestResultsServiceSettings, runs: TestRunSummary[]): Promise<CodeCoverageInfo | undefined> {
        if (!this.testApi || runs.length === 0) {
            return undefined;
        }

        try {
            // Get coverage from the most recent run
            const latestRun = runs[0];
            
            const coverageData = await this.testApi.getCodeCoverageSummary(
                settings.projectName,
                latestRun.id
            );

            if (!coverageData || !coverageData.coverageData || coverageData.coverageData.length === 0) {
                return undefined;
            }

            // Aggregate coverage statistics
            let totalLines = 0;
            let coveredLines = 0;
            let totalBranches = 0;
            let coveredBranches = 0;
            let totalMethods = 0;
            let coveredMethods = 0;
            let totalClasses = 0;
            let coveredClasses = 0;

            for (const coverage of coverageData.coverageData) {
                if (coverage.coverageStats) {
                    for (const stat of coverage.coverageStats) {
                        switch (stat.label) {
                            case 'Lines':
                                totalLines += stat.total || 0;
                                coveredLines += stat.covered || 0;
                                break;
                            case 'Branches':
                                totalBranches += stat.total || 0;
                                coveredBranches += stat.covered || 0;
                                break;
                            case 'Methods':
                                totalMethods += stat.total || 0;
                                coveredMethods += stat.covered || 0;
                                break;
                            case 'Classes':
                                totalClasses += stat.total || 0;
                                coveredClasses += stat.covered || 0;
                                break;
                        }
                    }
                }
            }

            // Calculate coverage percentages
            const lineCoverage = totalLines > 0 ? (coveredLines / totalLines) * 100 : 0;
            const branchCoverage = totalBranches > 0 ? (coveredBranches / totalBranches) * 100 : 0;
            const methodCoverage = totalMethods > 0 ? (coveredMethods / totalMethods) * 100 : 0;
            const classCoverage = totalClasses > 0 ? (coveredClasses / totalClasses) * 100 : 0;

            // Determine trend (would need historical data for accurate trend)
            const coverageTrend = 'stable'; // Simplified for now

            return {
                lineCoverage,
                branchCoverage,
                methodCoverage,
                classCoverage,
                coverageTrend,
                uncoveredLines: totalLines - coveredLines,
                totalLines
            };
        } catch (error) {
            this.logger.debug('Error fetching code coverage:', error);
            return undefined;
        }
    }

    private calculateTestTrend(runs: TestRunSummary[]): TestTrend {
        if (runs.length < 2) {
            return {
                direction: 'stable',
                passRateChange: 0,
                durationChange: 0,
                recentPassRates: runs.map(r => r.passRate)
            };
        }

        // Compare recent runs to older runs
        const recentRuns = runs.slice(0, Math.min(3, runs.length));
        const olderRuns = runs.slice(3, Math.min(6, runs.length));
        
        if (olderRuns.length === 0) {
            return {
                direction: 'stable',
                passRateChange: 0,
                durationChange: 0,
                recentPassRates: runs.slice(0, 5).map(r => r.passRate)
            };
        }

        // Calculate average pass rates
        const recentAvgPassRate = recentRuns.reduce((sum, r) => sum + r.passRate, 0) / recentRuns.length;
        const olderAvgPassRate = olderRuns.reduce((sum, r) => sum + r.passRate, 0) / olderRuns.length;
        
        // Calculate average durations
        const recentAvgDuration = recentRuns.reduce((sum, r) => sum + r.duration, 0) / recentRuns.length;
        const olderAvgDuration = olderRuns.reduce((sum, r) => sum + r.duration, 0) / olderRuns.length;
        
        // Calculate changes
        const passRateChange = recentAvgPassRate - olderAvgPassRate;
        const durationChange = olderAvgDuration > 0 
            ? ((recentAvgDuration - olderAvgDuration) / olderAvgDuration) * 100 
            : 0;

        // Determine direction
        let direction: 'improving' | 'declining' | 'stable';
        if (passRateChange > 5) {
            direction = 'improving';
        } else if (passRateChange < -5) {
            direction = 'declining';
        } else {
            direction = 'stable';
        }

        return {
            direction,
            passRateChange,
            durationChange,
            recentPassRates: runs.slice(0, 5).map(r => r.passRate)
        };
    }

    private async ensureConnection(settings: TestResultsServiceSettings): Promise<void> {
        await this.client.connect({
            organizationUrl: settings.orgUrl,
            personalAccessToken: settings.pat,
            projectName: settings.projectName
        });
        
        const connection = (this.client as any).connection;
        if (connection) {
            this.testApi = await connection.getTestApi();
            this.buildApi = await connection.getBuildApi();
        } else {
            throw new Error('Failed to connect to Azure DevOps');
        }
    }

    private getCacheKey(settings: TestResultsServiceSettings): string {
        const defId = settings.buildDefinitionId || settings.buildDefinitionName || 'all';
        const planId = settings.testPlanId || 'all';
        return `${settings.orgUrl}_${settings.projectName}_${defId}_${planId}`;
    }

    clearCache(): void {
        this.cache.clear();
    }
}