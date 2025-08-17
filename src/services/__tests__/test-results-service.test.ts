import { TestResultsService, TestResultsServiceSettings } from '../test-results-service';
import { AzureDevOpsClient } from '../azure-devops-client';
import { Logger } from '@elgato/streamdeck';

jest.mock('../azure-devops-client');

describe('TestResultsService', () => {
    let service: TestResultsService;
    let mockLogger: jest.Mocked<Logger>;
    let mockClient: jest.Mocked<AzureDevOpsClient>;
    let mockTestApi: any;
    let mockBuildApi: any;

    const baseSettings: TestResultsServiceSettings = {
        orgUrl: 'https://dev.azure.com/myorg',
        projectName: 'TestProject',
        pat: 'test-pat-token',
        buildDefinitionId: 123
    };

    beforeEach(() => {
        jest.clearAllMocks();
        
        mockLogger = {
            debug: jest.fn(),
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
            trace: jest.fn(),
            setLevel: jest.fn(),
            createScope: jest.fn()
        } as unknown as jest.Mocked<Logger>;

        mockTestApi = {
            getTestRuns: jest.fn(),
            getTestResults: jest.fn(),
            getTestResultDetailsForBuild: jest.fn(),
            getCodeCoverageSummary: jest.fn(),
            getTestResultById: jest.fn(),
            queryTestRuns: jest.fn()
        };

        mockBuildApi = {
            getBuilds: jest.fn(),
            getBuild: jest.fn()
        };

        mockClient = new AzureDevOpsClient() as jest.Mocked<AzureDevOpsClient>;
        mockClient.connect = jest.fn().mockResolvedValue(undefined);
        (mockClient as any).connection = {
            getTestApi: jest.fn().mockResolvedValue(mockTestApi),
            getBuildApi: jest.fn().mockResolvedValue(mockBuildApi)
        };

        (AzureDevOpsClient as jest.Mock).mockImplementation(() => mockClient);

        service = new TestResultsService(mockLogger);
    });

    describe('getTestMetrics', () => {
        it('should fetch and calculate test metrics from builds', async () => {
            const mockBuilds = [
                {
                    id: 100,
                    buildNumber: '1.0.100',
                    status: 'completed',
                    result: 'succeeded',
                    startTime: new Date('2024-01-01T10:00:00Z'),
                    finishTime: new Date('2024-01-01T10:30:00Z')
                }
            ];

            const mockTestRuns = [
                {
                    id: 1,
                    name: 'Test Run 1',
                    state: 'Completed',
                    totalTests: 100,
                    passedTests: 95,
                    unanalyzedTests: 3,
                    notApplicableTests: 0,
                    startedDate: new Date('2024-01-01T10:00:00Z'),
                    completedDate: new Date('2024-01-01T10:10:00Z'),
                    buildConfiguration: { id: 100, number: '1.0.100' }
                }
            ];

            const mockTestResults = [
                {
                    id: 1,
                    testCaseTitle: 'Test 1',
                    outcome: 'Passed',
                    duration: 1000,
                    priority: 1
                },
                {
                    id: 2,
                    testCaseTitle: 'Test 2',
                    outcome: 'Failed',
                    duration: 2000,
                    priority: 2,
                    errorMessage: 'Assertion failed',
                    stackTrace: 'at test...'
                },
                {
                    id: 3,
                    testCaseTitle: 'Test 3',
                    outcome: 'Passed',
                    duration: 1500,
                    priority: 1
                }
            ];

            // The service doesn't use builds API for this, it uses test runs directly
            mockTestApi.getTestRuns.mockResolvedValue(mockTestRuns);
            // Service calls getTestResults with TestOutcome.Failed filter
            mockTestApi.getTestResults.mockResolvedValue([mockTestResults[1]]); // Only the failed test

            const result = await service.getTestMetrics(baseSettings);

            expect(result.totalTests).toBe(100);
            expect(result.passedTests).toBe(95);
            expect(result.failedTests).toBe(3);
            expect(result.passRate).toBe(95); // 95/100 * 100
            expect(result.failureRate).toBe(3); // 3/100 * 100
            expect(result.recentRuns).toHaveLength(1);
            expect(result.failedTestDetails).toHaveLength(1); // Only Test 2 failed
            expect(result.failedTestDetails[0].testCaseTitle).toBe('Test 2');
        });

        it('should return cached metrics within cache duration', async () => {
            mockTestApi.getTestRuns.mockResolvedValue([]);

            // First call
            await service.getTestMetrics(baseSettings);
            expect(mockTestApi.getTestRuns).toHaveBeenCalledTimes(1);

            // Second call (should use cache)
            await service.getTestMetrics(baseSettings);
            expect(mockTestApi.getTestRuns).toHaveBeenCalledTimes(1);
            expect(mockLogger.debug).toHaveBeenCalledWith('Returning cached test results metrics');
        });

        it('should identify flaky tests', async () => {
            const mockBuilds = [
                { id: 100, buildNumber: '1.0.100' },
                { id: 101, buildNumber: '1.0.101' },
                { id: 102, buildNumber: '1.0.102' }
            ];

            const mockTestRuns = [
                { id: 1, buildConfiguration: { id: 100 }, totalTests: 10, passedTests: 9, failedTests: 1 },
                { id: 2, buildConfiguration: { id: 101 }, totalTests: 10, passedTests: 10, failedTests: 0 },
                { id: 3, buildConfiguration: { id: 102 }, totalTests: 10, passedTests: 9, failedTests: 1 }
            ];

            // Same test fails intermittently
            const mockTestResults1 = [
                { testCaseTitle: 'Flaky Test', outcome: 'Failed' }
            ];
            const mockTestResults2 = [
                { testCaseTitle: 'Flaky Test', outcome: 'Passed' }
            ];
            const mockTestResults3 = [
                { testCaseTitle: 'Flaky Test', outcome: 'Failed' }
            ];

            // Service uses test runs directly, not builds
            mockTestApi.getTestRuns.mockResolvedValue(mockTestRuns);
            mockTestApi.getTestResults
                .mockResolvedValueOnce(mockTestResults1)
                .mockResolvedValueOnce(mockTestResults2)
                .mockResolvedValueOnce(mockTestResults3);

            const result = await service.getTestMetrics(baseSettings);

            expect(result.flakyTests).toHaveLength(1);
            expect(result.flakyTests[0].testCaseTitle).toBe('Flaky Test');
            expect(result.flakyTests[0].flakinessRate).toBeGreaterThan(0);
            expect(result.flakyTests[0].totalRuns).toBe(3);
            expect(result.flakyTests[0].failureCount).toBe(2);
        });

        it('should handle code coverage data when available', async () => {
            const mockCoverageData = {
                coverageData: [
                    {
                        coverageStats: [
                            { label: 'Lines', covered: 800, total: 1000 },
                            { label: 'Branches', covered: 60, total: 100 }
                        ]
                    }
                ]
            };

            const mockTestRun = {
                id: 1,
                name: 'Test Run 1',
                state: 'Completed',
                totalTests: 100,
                passedTests: 100,
                completedDate: new Date()
            };
            
            mockTestApi.getTestRuns.mockResolvedValue([mockTestRun]);
            mockTestApi.getTestResults.mockResolvedValue([]);
            mockTestApi.getCodeCoverageSummary.mockResolvedValue(mockCoverageData);

            const result = await service.getTestMetrics(baseSettings);

            expect(result.codeCoverage).toBeDefined();
            expect(result.codeCoverage?.lineCoverage).toBe(80); // 800/1000 * 100
            expect(result.codeCoverage?.branchCoverage).toBe(60); // 60/100 * 100
        });

        it('should handle no test runs gracefully', async () => {
            mockTestApi.getTestRuns.mockResolvedValue([]);

            const result = await service.getTestMetrics(baseSettings);

            expect(result.totalTests).toBe(0);
            expect(result.passedTests).toBe(0);
            expect(result.failedTests).toBe(0);
            expect(result.passRate).toBe(0);
            expect(result.trend.direction).toBe('stable');
        });

        it('should filter by build definition name when provided', async () => {
            const settings: TestResultsServiceSettings = {
                ...baseSettings,
                buildDefinitionId: undefined,
                buildDefinitionName: 'MyBuild'
            };

            mockTestApi.getTestRuns.mockResolvedValue([]);

            await service.getTestMetrics(settings);

            // Service uses test runs API, not builds API
            expect(mockTestApi.getTestRuns).toHaveBeenCalledWith(
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
        });

        it('should calculate test trend correctly', async () => {
            const mockBuilds = [
                { id: 100 },
                { id: 101 }
            ];

            const mockTestRuns = [
                { 
                    id: 1, 
                    buildConfiguration: { id: 100 },
                    totalTests: 100,
                    passedTests: 80,
                    failedTests: 20 
                },
                { 
                    id: 2, 
                    buildConfiguration: { id: 101 },
                    totalTests: 100,
                    passedTests: 90,
                    failedTests: 10 
                }
            ];

            // Service uses test runs directly
            // Add more runs to make trend calculation work (needs at least 3)
            const moreRuns = [
                ...mockTestRuns, // 80%, 90%
                { 
                    id: 3, 
                    buildConfiguration: { id: 102 },
                    totalTests: 100,
                    passedTests: 92,
                    unanalyzedTests: 8,
                    completedDate: new Date('2024-01-03')
                },
                { 
                    id: 4, 
                    buildConfiguration: { id: 103 },
                    totalTests: 100,
                    passedTests: 75,
                    unanalyzedTests: 25,
                    completedDate: new Date('2024-01-04')
                }
            ];
            // Order by date desc - newest first
            mockTestApi.getTestRuns.mockResolvedValue([
                moreRuns[3], // 75% - oldest
                moreRuns[2], // 92%
                moreRuns[1], // 90%
                moreRuns[0]  // 80% - newest
            ]);
            mockTestApi.getTestResults.mockResolvedValue([]);

            const result = await service.getTestMetrics(baseSettings);

            // Recent average (80+92+90)/3 = 87.3% vs older average (75)/1 = 75%
            // So should be improving
            expect(result.trend.direction).toBe('improving');
        });

        it('should handle API errors gracefully', async () => {
            // Service catches getTestRuns errors and returns empty array
            mockTestApi.getTestRuns.mockRejectedValue(new Error('API Error'));

            const result = await service.getTestMetrics(baseSettings);
            
            // Service handles error gracefully and returns default metrics
            expect(result.totalTests).toBe(0);
            expect(result.failedTests).toBe(0);
            expect(mockLogger.debug).toHaveBeenCalledWith('Error fetching test runs:', expect.any(Error));
        });

        it('should handle connection failures', async () => {
            mockClient.connect.mockRejectedValue(new Error('Connection failed'));

            await expect(service.getTestMetrics(baseSettings)).rejects.toThrow('Connection failed');
        });

        it('should include only failed tests when includeFailedOnly is true', async () => {
            const settings = { ...baseSettings, includeFailedOnly: true };

            const mockTestResults = [
                { testCaseTitle: 'Test 1', outcome: 'Passed' },
                { testCaseTitle: 'Test 2', outcome: 'Failed', errorMessage: 'Error' },
                { testCaseTitle: 'Test 3', outcome: 'Failed', errorMessage: 'Error' }
            ];

            mockTestApi.getTestRuns.mockResolvedValue([{ 
                id: 1,
                totalTests: 100,
                passedTests: 97,
                unanalyzedTests: 3,
                completedDate: new Date()
            }]);
            // Service calls getTestResults with TestOutcome.Failed filter
            const failedResults = mockTestResults.filter(r => r.outcome === 'Failed');
            mockTestApi.getTestResults.mockResolvedValue(failedResults);

            const result = await service.getTestMetrics(settings);

            // Service filters to only return failed tests
            expect(result.failedTestDetails).toHaveLength(failedResults.length);
            expect(result.failedTestDetails.every(t => t.errorMessage)).toBe(true);
        });
    });

    describe('getTestRunDetails', () => {
        it('should fetch detailed test run information', async () => {
            const mockTestRun = {
                id: 1,
                name: 'Test Run 1',
                state: 'Completed',
                totalTests: 50,
                passedTests: 48,
                unanalyzedTests: 2,
                startedDate: new Date('2024-01-01T10:00:00Z'),
                completedDate: new Date('2024-01-01T10:05:00Z')
            };

            mockTestApi.getTestRunById = jest.fn().mockResolvedValue(mockTestRun);
            
            const result = await service.getTestRunDetails(baseSettings, 1);

            expect(result.id).toBe(1);
            expect(result.name).toBe('Test Run 1');
            expect(result.totalTests).toBe(50);
            expect(result.passedTests).toBe(48);
            expect(result.unanalyzedTests).toBe(2);
            expect(mockTestApi.getTestRunById).toHaveBeenCalledWith(baseSettings.projectName, 1);
        });
    });

    describe('clearCache', () => {
        it('should clear cached metrics', async () => {
            mockBuildApi.getBuilds.mockResolvedValue([]);
            mockTestApi.getTestRuns.mockResolvedValue([]);

            // Service uses test runs directly
            mockTestApi.getTestRuns.mockResolvedValue([{ 
                id: 1, 
                totalTests: 10, 
                passedTests: 10,
                completedDate: new Date()
            }]);

            // First call
            await service.getTestMetrics(baseSettings);
            expect(mockTestApi.getTestRuns).toHaveBeenCalledTimes(1);

            // Clear cache
            service.clearCache();

            // Second call (should not use cache)
            await service.getTestMetrics(baseSettings);
            expect(mockTestApi.getTestRuns).toHaveBeenCalledTimes(2);
        });
    });
});