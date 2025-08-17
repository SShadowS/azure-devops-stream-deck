import { action, DidReceiveSettingsEvent, KeyDownEvent, SendToPluginEvent, SingletonAction, WillAppearEvent, WillDisappearEvent } from '@elgato/streamdeck';
import { TestResultsService, TestResultsMetrics, TestResultsServiceSettings } from '../services/test-results-service';
import { CredentialManager } from '../utils/credential-manager';
import { ActionStateManager } from '../utils/action-state-manager';
import { ITestResultsService, ICredentialManager, IActionStateManager, ILogger } from '../interfaces';
import streamDeck from '@elgato/streamdeck';

// Settings interface with index signature for SDK compatibility
interface TestResultsSummarySettings {
    // Connection settings
    orgUrl?: string;
    projectName?: string;
    pat?: string;
    
    // Test settings
    buildDefinitionId?: number;
    buildDefinitionName?: string;
    testPlanId?: number;
    testSuiteId?: number;
    includeFailedOnly?: boolean;
    
    // Display settings
    displayMode?: 'summary' | 'trend' | 'failures' | 'coverage' | 'performance' | 'flaky';
    refreshInterval?: number;
    showDetails?: boolean;
    alertOnFailure?: boolean;
    failureThreshold?: number;
    coverageThreshold?: number;
    
    // Index signature for Stream Deck SDK compatibility
    [key: string]: any;
}

@action({ UUID: 'com.sshadows.azure-devops-info.testresults' })
export class TestResultsSummaryAction extends SingletonAction<TestResultsSummarySettings> {
    private testResultsService: ITestResultsService;
    private credentialManager: ICredentialManager;
    private stateManager: IActionStateManager;
    private settingsDebounceTimeouts = new Map<string, NodeJS.Timeout>();

    constructor(
        testResultsService?: ITestResultsService,
        credentialManager?: ICredentialManager,
        stateManager?: IActionStateManager,
        logger?: ILogger
    ) {
        super();
        const actualLogger = logger || streamDeck.logger;
        this.testResultsService = testResultsService || new TestResultsService(actualLogger as any);
        this.credentialManager = credentialManager || new CredentialManager(actualLogger as any);
        this.stateManager = stateManager || new ActionStateManager();
    }

    override async onWillAppear(ev: WillAppearEvent<TestResultsSummarySettings>): Promise<void> {
        streamDeck.logger.info(`Test Results Summary action will appear: ${ev.action.id}`);
        
        const state = this.stateManager.getState(ev.action.id) as any;
        state.lastSettings = ev.payload.settings;
        
        await this.initializeAction(ev.action.id, ev.payload.settings);
    }

    override async onWillDisappear(ev: WillDisappearEvent<TestResultsSummarySettings>): Promise<void> {
        streamDeck.logger.info(`Test Results Summary action will disappear: ${ev.action.id}`);
        
        const state = this.stateManager.getState(ev.action.id) as any;
        if (state.intervalId) {
            clearInterval(state.intervalId);
            state.intervalId = undefined;
        }
        
        const debounceTimeout = this.settingsDebounceTimeouts.get(ev.action.id);
        if (debounceTimeout) {
            clearTimeout(debounceTimeout);
            this.settingsDebounceTimeouts.delete(ev.action.id);
        }
    }

    override async onKeyDown(ev: KeyDownEvent<TestResultsSummarySettings>): Promise<void> {
        const state = this.stateManager.getState(ev.action.id) as any;
        const settings = ev.payload.settings;
        
        if (!this.validateSettings(settings)) {
            return;
        }

        // Open test results in browser
        if (state.lastMetrics?.recentRuns?.[0]?.url) {
            streamDeck.system.openUrl(state.lastMetrics.recentRuns[0].url);
        } else if (settings.orgUrl && settings.projectName) {
            const url = `${settings.orgUrl}/${settings.projectName}/_test/runs`;
            streamDeck.system.openUrl(url);
        }
    }

    override async onDidReceiveSettings(ev: DidReceiveSettingsEvent<TestResultsSummarySettings>): Promise<void> {
        streamDeck.logger.info(`Test Results settings updated for action: ${ev.action.id}`);
        
        const existingTimeout = this.settingsDebounceTimeouts.get(ev.action.id);
        if (existingTimeout) {
            clearTimeout(existingTimeout);
        }
        
        const timeout = setTimeout(async () => {
            await this.processSettingsChange(ev.action.id, ev.payload.settings);
            this.settingsDebounceTimeouts.delete(ev.action.id);
        }, 500);
        
        this.settingsDebounceTimeouts.set(ev.action.id, timeout);
    }

    override async onSendToPlugin(ev: SendToPluginEvent<any, TestResultsSummarySettings>): Promise<void> {
        if (ev.payload instanceof Object && 'event' in ev.payload) {
            const currentSettings = await ev.action.getSettings();
            
            switch (ev.payload.event) {
                case 'testConnection':
                    await this.testConnection(ev.action, currentSettings);
                    break;
                case 'getBuildDefinitions':
                    await this.sendBuildDefinitionList(ev.action, currentSettings);
                    break;
                case 'getTestPlans':
                    await this.sendTestPlanList(ev.action, currentSettings);
                    break;
                case 'retryFailedTests':
                    await this.retryFailedTests(ev.action.id, currentSettings);
                    break;
            }
        }
    }

    private async processSettingsChange(actionId: string, settings: TestResultsSummarySettings): Promise<void> {
        const state = this.stateManager.getState(actionId) as any;
        const oldSettings = state.lastSettings || {};
        state.lastSettings = settings;
        
        const needsRestart = 
            oldSettings.orgUrl !== settings.orgUrl ||
            oldSettings.projectName !== settings.projectName ||
            oldSettings.pat !== settings.pat ||
            oldSettings.buildDefinitionId !== settings.buildDefinitionId ||
            oldSettings.buildDefinitionName !== settings.buildDefinitionName ||
            oldSettings.testPlanId !== settings.testPlanId ||
            oldSettings.refreshInterval !== settings.refreshInterval;
        
        if (needsRestart) {
            if (state.intervalId) {
                clearInterval(state.intervalId);
                state.intervalId = undefined;
            }
            
            const action = this.getActionById(actionId);
            if (action) {
                await this.initializeAction(actionId, settings);
            }
        } else {
            // Just update display
            const action = this.getActionById(actionId);
            if (action && state.lastMetrics) {
                await this.updateDisplay(action, state.lastMetrics, settings);
            }
        }
    }

    private async initializeAction(actionId: string, settings: TestResultsSummarySettings): Promise<void> {
        const action = this.getActionById(actionId);
        if (!action) return;
        
        if (!this.validateSettings(settings)) {
            await action.setTitle('Configure\nTest Results');
            await action.setState(2); // Error state
            return;
        }
        
        // Create a copy to avoid mutating the original settings
        const decryptedSettings = { ...settings };
        if (decryptedSettings.pat) {
            decryptedSettings.pat = this.credentialManager.decrypt(decryptedSettings.pat);
        }
        
        await this.updateTestMetrics(actionId, decryptedSettings);
        
        const state = this.stateManager.getState(actionId) as any;
        const refreshInterval = (settings.refreshInterval || 60) * 1000; // Default 60 seconds
        
        if (state.intervalId) {
            clearInterval(state.intervalId);
        }
        
        state.intervalId = setInterval(async () => {
            await this.updateTestMetrics(actionId, decryptedSettings);
        }, refreshInterval);
    }

    private async updateTestMetrics(actionId: string, settings: TestResultsSummarySettings): Promise<void> {
        const action = this.getActionById(actionId);
        if (!action) return;
        
        const state = this.stateManager.getState(actionId) as any;
        
        try {
            streamDeck.logger.debug(`Fetching test metrics for action ${actionId}`);
            
            const metrics = await this.testResultsService.getTestMetrics({
                orgUrl: settings.orgUrl!,
                projectName: settings.projectName!,
                pat: settings.pat!,
                pipelineId: settings.pipelineId,
                maxRuns: 10
            });
            
            state.lastMetrics = metrics;
            state.lastError = undefined;
            
            await this.updateDisplay(action, metrics, settings);
            
            // Check for alerts
            if (settings.alertOnFailure && metrics.failureRate > (settings.failureThreshold || 10)) {
                await action.showAlert();
            }
            
        } catch (error) {
            streamDeck.logger.error(`Error fetching test metrics: ${error}`);
            state.lastError = error instanceof Error ? error.message : 'Unknown error';
            
            await action.setTitle('Error\nFetching\nTests');
            await action.setState(2); // Error state
        }
    }

    private async updateDisplay(action: any, metrics: TestResultsMetrics, settings: TestResultsSummarySettings): Promise<void> {
        const displayMode = settings.displayMode || 'summary';
        
        // Set state based on test results
        if (metrics.passRate >= 95) {
            await action.setState(0); // Success (green)
        } else if (metrics.passRate >= 80) {
            await action.setState(1); // Warning (yellow)
        } else if (metrics.passRate >= 60) {
            await action.setState(2); // Failure (orange)
        } else {
            await action.setState(3); // Critical (red)
        }
        
        switch (displayMode) {
            case 'summary':
                await this.displaySummary(action, metrics);
                break;
            case 'trend':
                await this.displayTrend(action, metrics);
                break;
            case 'failures':
                await this.displayFailures(action, metrics);
                break;
            case 'coverage':
                await this.displayCoverage(action, metrics);
                break;
            case 'performance':
                await this.displayPerformance(action, metrics);
                break;
            case 'flaky':
                await this.displayFlakyTests(action, metrics);
                break;
            default:
                await this.displaySummary(action, metrics);
        }
    }

    private async displaySummary(action: any, metrics: TestResultsMetrics): Promise<void> {
        const passEmoji = metrics.passRate >= 95 ? '✅' : 
                         metrics.passRate >= 80 ? '⚠️' : '❌';
        
        const title = [
            `${passEmoji} ${metrics.passRate.toFixed(1)}%`,
            `${metrics.passedTests}/${metrics.totalTests}`,
            `${metrics.failedTests} failed`,
            metrics.trend.direction === 'improving' ? '📈' : 
            metrics.trend.direction === 'declining' ? '📉' : '➡️'
        ].join('\n');

        await action.setTitle(title);
    }

    private async displayTrend(action: any, metrics: TestResultsMetrics): Promise<void> {
        const trendIcon = metrics.trend.direction === 'improving' ? '📈' : 
                         metrics.trend.direction === 'declining' ? '📉' : '➡️';
        
        const changeSign = metrics.trend.passRateChange >= 0 ? '+' : '';
        
        const title = [
            `${trendIcon} Trend`,
            `${changeSign}${metrics.trend.passRateChange.toFixed(1)}%`,
            `Pass: ${metrics.passRate.toFixed(1)}%`,
            `Last 5: ${metrics.trend.recentPassRates.slice(0, 3).map(r => r.toFixed(0)).join(',')}`
        ].join('\n');

        await action.setTitle(title);
    }

    private async displayFailures(action: any, metrics: TestResultsMetrics): Promise<void> {
        if (metrics.failedTestDetails.length === 0) {
            await action.setTitle('✅ No\nFailures');
            return;
        }

        const firstFailure = metrics.failedTestDetails[0];
        const testName = firstFailure.testCaseTitle.length > 20 
            ? firstFailure.testCaseTitle.substring(0, 20) + '...'
            : firstFailure.testCaseTitle;

        const title = [
            `❌ ${metrics.failedTests} Failed`,
            testName,
            firstFailure.failureType || 'Test Failed',
            `+${metrics.failedTestDetails.length - 1} more`
        ].join('\n');

        await action.setTitle(title);
    }

    private async displayCoverage(action: any, metrics: TestResultsMetrics): Promise<void> {
        if (!metrics.codeCoverage) {
            await action.setTitle('Coverage\nNot\nAvailable');
            return;
        }

        const coverage = metrics.codeCoverage;
        const coverageEmoji = coverage.lineCoverage >= 80 ? '🟢' :
                            coverage.lineCoverage >= 60 ? '🟡' : '🔴';

        const title = [
            `${coverageEmoji} ${coverage.lineCoverage.toFixed(1)}%`,
            `Lines: ${coverage.lineCoverage.toFixed(0)}%`,
            `Branch: ${coverage.branchCoverage.toFixed(0)}%`,
            coverage.coverageTrend === 'increasing' ? '📈' :
            coverage.coverageTrend === 'decreasing' ? '📉' : '➡️'
        ].join('\n');

        await action.setTitle(title);
    }

    private async displayPerformance(action: any, metrics: TestResultsMetrics): Promise<void> {
        const formatDuration = (seconds: number): string => {
            if (seconds < 60) return `${seconds.toFixed(0)}s`;
            const minutes = Math.floor(seconds / 60);
            const secs = seconds % 60;
            return `${minutes}m ${secs.toFixed(0)}s`;
        };

        const perfIcon = metrics.trend.durationChange < -10 ? '⚡' :
                        metrics.trend.durationChange > 10 ? '🐌' : '⏱️';

        const title = [
            `${perfIcon} Performance`,
            `Total: ${formatDuration(metrics.totalDuration)}`,
            `Avg: ${formatDuration(metrics.averageDuration)}`,
            `${metrics.trend.durationChange >= 0 ? '+' : ''}${metrics.trend.durationChange.toFixed(0)}%`
        ].join('\n');

        await action.setTitle(title);
    }

    private async displayFlakyTests(action: any, metrics: TestResultsMetrics): Promise<void> {
        if (metrics.flakyTests.length === 0) {
            await action.setTitle('✅ No\nFlaky\nTests');
            return;
        }

        const worstFlaky = metrics.flakyTests[0];
        const testName = worstFlaky.testCaseTitle.length > 20 
            ? worstFlaky.testCaseTitle.substring(0, 20) + '...'
            : worstFlaky.testCaseTitle;

        const title = [
            `⚠️ ${metrics.flakyTests.length} Flaky`,
            testName,
            `Fail: ${worstFlaky.flakinessRate.toFixed(0)}%`,
            `${worstFlaky.failureCount}/${worstFlaky.totalRuns} runs`
        ].join('\n');

        await action.setTitle(title);
    }

    private async retryFailedTests(actionId: string, settings: TestResultsSummarySettings): Promise<void> {
        try {
            const state = this.stateManager.getState(actionId) as any;
            const metrics = state.lastMetrics as TestResultsMetrics;
            
            if (!metrics || !metrics.recentRuns || metrics.recentRuns.length === 0) {
                throw new Error('No recent test runs to retry');
            }

            const decryptedSettings = { ...settings };
            if (decryptedSettings.pat) {
                decryptedSettings.pat = this.credentialManager.decrypt(decryptedSettings.pat);
            }

            // TODO: Implement retry failed tests functionality
            // const latestRun = metrics.recentRuns[0];
            // await this.testResultsService.retryFailedTests({
            //     orgUrl: decryptedSettings.orgUrl!,
            //     projectName: decryptedSettings.projectName!,
            //     pat: decryptedSettings.pat!
            // }, latestRun.id);

            // streamDeck.logger.info(`Retrying failed tests from run ${latestRun.id}`);
            
            const action = this.getActionById(actionId);
            if (action) {
                await action.showOk();
                // Refresh metrics
                await this.updateTestMetrics(actionId, settings);
            }
        } catch (error) {
            streamDeck.logger.error('Error retrying failed tests:', error);
            const action = this.getActionById(actionId);
            if (action) {
                await action.showAlert();
            }
        }
    }

    private async testConnection(action: any, settings: TestResultsSummarySettings): Promise<void> {
        try {
            if (!this.validateSettings(settings)) {
                await streamDeck.ui.current?.sendToPropertyInspector({
                    event: 'testConnectionResult',
                    status: 'error',
                    message: 'Please fill in all required fields'
                });
                return;
            }
            
            const decryptedSettings = { ...settings };
            if (decryptedSettings.pat) {
                decryptedSettings.pat = this.credentialManager.decrypt(decryptedSettings.pat);
            }
            
            const metrics = await this.testResultsService.getTestMetrics({
                orgUrl: decryptedSettings.orgUrl!,
                projectName: decryptedSettings.projectName!,
                pat: decryptedSettings.pat!
            });
            
            await streamDeck.ui.current?.sendToPropertyInspector({
                event: 'testConnectionResult',
                status: 'success',
                message: `Connected! ${metrics.totalTests} tests, ${metrics.passRate.toFixed(1)}% pass rate`
            });
            
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            await streamDeck.ui.current?.sendToPropertyInspector({
                event: 'testConnectionResult',
                status: 'error',
                message: errorMessage
            });
        }
    }

    private async sendBuildDefinitionList(action: any, settings: TestResultsSummarySettings): Promise<void> {
        // For now, send placeholder definitions
        const definitions = [
            { label: 'All Definitions', value: '' },
            { label: 'CI Pipeline', value: 'ci-pipeline' },
            { label: 'PR Validation', value: 'pr-validation' },
            { label: 'Nightly Tests', value: 'nightly-tests' },
            { label: 'Integration Tests', value: 'integration-tests' }
        ];
        
        await streamDeck.ui.current?.sendToPropertyInspector({
            event: 'didReceiveBuildDefinitions',
            definitions: definitions
        });
    }

    private async sendTestPlanList(action: any, settings: TestResultsSummarySettings): Promise<void> {
        // Common test plan names
        const plans = [
            { label: 'All Test Plans', value: '' },
            { label: 'Regression Tests', value: 'regression' },
            { label: 'Smoke Tests', value: 'smoke' },
            { label: 'Integration Tests', value: 'integration' },
            { label: 'Performance Tests', value: 'performance' }
        ];
        
        await streamDeck.ui.current?.sendToPropertyInspector({
            event: 'didReceiveTestPlans',
            plans: plans
        });
    }

    private validateSettings(settings: TestResultsSummarySettings): boolean {
        return !!(settings?.orgUrl && settings?.projectName && settings?.pat);
    }

    private getActionById(actionId: string): any {
        return streamDeck.actions.getActionById(actionId);
    }
}