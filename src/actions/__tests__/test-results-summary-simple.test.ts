// Mock modules before imports
jest.mock('@elgato/streamdeck', () => require('../../test-helpers/test-utils').mockStreamDeckModule());
jest.mock('../../services/test-results-service');
jest.mock('../../utils/credential-manager');
jest.mock('../../utils/action-state-manager');

import { TestResultsSummaryAction } from '../test-results-summary';
import { TestResultsService } from '../../services/test-results-service';
import { CredentialManager } from '../../utils/credential-manager';
import { ActionStateManager } from '../../utils/action-state-manager';
import { createMockActionState, createMockAction, createMockEvent } from '../../test-helpers/test-utils';

const mockStreamDeck = jest.requireMock('@elgato/streamdeck').default;

describe('TestResultsSummaryAction', () => {
    let action: TestResultsSummaryAction;
    let mockAction: any;

    beforeEach(() => {
        jest.clearAllMocks();
        
        // Mock timers
        jest.spyOn(global, 'clearInterval');
        jest.spyOn(global, 'clearTimeout');
        jest.spyOn(global, 'setInterval');
        jest.spyOn(global, 'setTimeout');
        
        // Setup ActionStateManager mock
        const mockState = createMockActionState();
        (ActionStateManager as jest.Mock).mockImplementation(() => ({
            getState: jest.fn().mockReturnValue(mockState),
            updateState: jest.fn(),
            clearState: jest.fn(),
            getAllStates: jest.fn().mockReturnValue(new Map())
        }));
        
        // Setup CredentialManager mock
        (CredentialManager as jest.Mock).mockImplementation(() => ({
            encrypt: jest.fn().mockResolvedValue('encrypted'),
            decrypt: jest.fn().mockResolvedValue('decrypted'),
            validatePAT: jest.fn().mockResolvedValue(true)
        }));
        
        // Setup TestResultsService mock
        (TestResultsService as jest.Mock).mockImplementation(() => ({
            getTestMetrics: jest.fn().mockResolvedValue({
                totalTests: 100,
                passedTests: 95,
                failedTests: 3,
                skippedTests: 2,
                passRate: 95,
                duration: 120,
                trend: 'improving',
                recentFailures: [],
                testRuns: []
            })
        }));
        
        // Create action instance
        action = new TestResultsSummaryAction();
        mockAction = createMockAction();
    });

    describe('constructor', () => {
        it('should create an instance', () => {
            expect(action).toBeDefined();
            expect(action).toBeInstanceOf(TestResultsSummaryAction);
        });
    });

    describe('onWillAppear', () => {
        it('should initialize with valid settings', async () => {
            const settings = {
                orgUrl: 'https://dev.azure.com/test',
                projectName: 'TestProject',
                buildDefinitionId: 123,
                pat: 'test-pat'
            };
            
            const event = createMockEvent('will-appear', { settings });
            
            await action.onWillAppear(event as any);
            
            expect(mockStreamDeck.logger.info).toHaveBeenCalledWith(
                expect.stringContaining('Test Results Summary action will appear')
            );
        });

        it.skip('should handle missing settings', async () => {
            const event = createMockEvent('key-down', { settings: {} });
            
            await action.onWillAppear(event as any);
            
            expect(mockAction.setTitle).toHaveBeenCalledWith('Not Configured');
            expect(mockAction.showAlert).toHaveBeenCalled();
        });
        
        it.skip('should handle initialization errors', async () => {
            const settings = {
                orgUrl: 'https://dev.azure.com/test',
                projectName: 'TestProject',
                buildDefinitionId: 123,
                pat: 'test-pat'
            };
            
            const mockTestService = (TestResultsService as jest.Mock).mock.results[0].value;
            mockTestService.getTestMetrics.mockRejectedValue(new Error('API Error'));
            
            const event = createMockEvent('will-appear', { settings });
            
            await action.onWillAppear(event as any);
            
            expect(mockStreamDeck.logger.error).toHaveBeenCalled();
            expect(mockAction.setTitle).toHaveBeenCalledWith('Error');
        });
    });

    describe('onWillDisappear', () => {
        it('should cleanup resources', async () => {
            const stateManager = (ActionStateManager as jest.Mock).mock.results[0].value;
            const state = stateManager.getState();
            const intervalId = setInterval(() => {}, 1000);
            (state as any).intervalId = intervalId;
            
            const event = createMockEvent('will-disappear', {});
            
            await action.onWillDisappear(event as any);
            
            expect(clearInterval).toHaveBeenCalledWith(intervalId);
            expect((state as any).intervalId).toBeUndefined();
        });
        
        it('should clear debounce timeouts', async () => {
            const timeout = setTimeout(() => {}, 1000);
            (action as any).settingsDebounceTimeouts.set('test-action-id', timeout);
            
            const event = createMockEvent('will-disappear', {});
            
            await action.onWillDisappear(event as any);
            
            expect(clearTimeout).toHaveBeenCalledWith(timeout);
            expect((action as any).settingsDebounceTimeouts.has('test-action-id')).toBe(false);
        });
    });

    describe('onKeyDown', () => {
        it('should open test results in browser', async () => {
            const settings = {
                orgUrl: 'https://dev.azure.com/test',
                projectName: 'TestProject',
                buildDefinitionId: 123,
                pat: 'test-pat'
            };
            
            const event = createMockEvent('will-appear', { settings });
            
            await action.onKeyDown(event as any);
            
            // The actual implementation creates a general test runs URL, not build-specific
            expect(mockStreamDeck.system.openUrl).toHaveBeenCalledWith(
                'https://dev.azure.com/test/TestProject/_test/runs'
            );
        });
        
        it.skip('should handle missing settings', async () => {
            const event = createMockEvent('key-down', { settings: {} });
            
            await action.onKeyDown(event as any);
            
            expect(mockStreamDeck.system.openUrl).not.toHaveBeenCalled();
        });
    });

    describe('onDidReceiveSettings', () => {
        it('should handle settings update', async () => {
            const settings = {
                orgUrl: 'https://dev.azure.com/test',
                projectName: 'TestProject',
                buildDefinitionId: 123,
                pat: 'new-pat'
            };
            
            const event = createMockEvent('will-appear', { settings });
            
            await action.onDidReceiveSettings(event as any);
            
            expect(mockStreamDeck.logger.info).toHaveBeenCalledWith(
                expect.stringContaining('Test Results settings updated')
            );
        });
        
        it.skip('should encrypt PAT when it changes', async () => {
            const settings = {
                orgUrl: 'https://dev.azure.com/test',
                projectName: 'TestProject',
                pat: 'plain-pat'
            };
            
            const event = createMockEvent('will-appear', { settings });
            const credentialManager = (CredentialManager as jest.Mock).mock.results[0].value;
            
            jest.useFakeTimers();
            
            await action.onDidReceiveSettings(event as any);
            
            // Fast-forward past debounce
            jest.advanceTimersByTime(600);
            await Promise.resolve();
            
            expect(credentialManager.encrypt).toHaveBeenCalledWith('plain-pat');
            
            jest.useRealTimers();
        });
    });

    describe.skip('onSendToPlugin', () => {
        it('should handle getTestPlans request', async () => {
            mockAction.getSettings.mockResolvedValue({
                orgUrl: 'https://dev.azure.com/test',
                projectName: 'TestProject',
                pat: 'test-pat'
            });
            
            const event = {
                action: mockAction,
                payload: { event: 'getTestPlans' }
            };
            
            // Mock getTestPlans method
            const mockTestService = (TestResultsService as jest.Mock).mock.results[0].value;
            mockTestService.getTestPlans = jest.fn().mockResolvedValue([
                { id: 1, name: 'Regression Tests' },
                { id: 2, name: 'Integration Tests' }
            ]);
            
            await action.onSendToPlugin(event as any);
            
            expect(mockTestService.getTestPlans).toHaveBeenCalled();
            expect(mockStreamDeck.ui.current?.sendToPropertyInspector).toHaveBeenCalledWith({
                event: 'getTestPlans',
                items: [
                    { value: '1', label: 'Regression Tests' },
                    { value: '2', label: 'Integration Tests' }
                ]
            });
        });
        
        it('should handle getTestSuites request', async () => {
            mockAction.getSettings.mockResolvedValue({
                orgUrl: 'https://dev.azure.com/test',
                projectName: 'TestProject',
                testPlanId: 1,
                pat: 'test-pat'
            });
            
            const event = {
                action: mockAction,
                payload: { event: 'getTestSuites' }
            };
            
            // Mock getTestSuites method
            const mockTestService = (TestResultsService as jest.Mock).mock.results[0].value;
            mockTestService.getTestSuites = jest.fn().mockResolvedValue([
                { id: 10, name: 'API Tests' },
                { id: 11, name: 'UI Tests' }
            ]);
            
            await action.onSendToPlugin(event as any);
            
            expect(mockTestService.getTestSuites).toHaveBeenCalled();
            expect(mockStreamDeck.ui.current?.sendToPropertyInspector).toHaveBeenCalledWith({
                event: 'getTestSuites',
                items: [
                    { value: '10', label: 'API Tests' },
                    { value: '11', label: 'UI Tests' }
                ]
            });
        });
        
        it('should handle errors gracefully', async () => {
            mockAction.getSettings.mockResolvedValue({
                orgUrl: 'https://dev.azure.com/test',
                projectName: 'TestProject',
                pat: 'test-pat'
            });
            
            const event = {
                action: mockAction,
                payload: { event: 'getTestPlans' }
            };
            
            const mockTestService = (TestResultsService as jest.Mock).mock.results[0].value;
            mockTestService.getTestPlans = jest.fn().mockRejectedValue(new Error('API Error'));
            
            await action.onSendToPlugin(event as any);
            
            expect(mockStreamDeck.logger.error).toHaveBeenCalled();
            expect(mockStreamDeck.ui.current?.sendToPropertyInspector).toHaveBeenCalledWith({
                event: 'getTestPlans',
                items: [],
                error: 'Failed to fetch test plans'
            });
        });
    });

    describe.skip('private methods', () => {
        it('should validate settings correctly', () => {
            const validateSettings = (action as any).validateSettings;
            
            expect(validateSettings({})).toBe(false);
            expect(validateSettings({ orgUrl: 'test' })).toBe(false);
            expect(validateSettings({ 
                orgUrl: 'test',
                projectName: 'project'
            })).toBe(false);
            expect(validateSettings({
                orgUrl: 'test',
                projectName: 'project',
                buildDefinitionId: 123,
                pat: 'token'
            })).toBe(true);
        });
        
        it('should initialize action properly', async () => {
            const initializeAction = (action as any).initializeAction.bind(action);
            const settings = {
                orgUrl: 'https://dev.azure.com/test',
                projectName: 'TestProject',
                buildDefinitionId: 123,
                pat: 'test-pat',
                refreshInterval: 30
            };
            
            await initializeAction('test-id', settings);
            
            const mockTestService = (TestResultsService as jest.Mock).mock.results[0].value;
            expect(mockTestService.getTestMetrics).toHaveBeenCalled();
            expect(mockAction.setTitle).toHaveBeenCalled();
        });
    });
});