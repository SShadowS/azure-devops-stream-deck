/**
 * Pipeline Status Property Inspector functionality.
 * Handles pipeline-specific configuration and testing.
 */

class PipelineStatusPI {
    constructor() {
        this.common = window.piCommon;
        this.streamDeckClient = this.common.streamDeckClient;
        this.testButton = null;
        this.isTestingConnection = false;
    }

    /**
     * Initialize the Property Inspector.
     */
    initialize() {
        this.common.initialize();
        this.setupHandlers();
        this.common.debugLog('Pipeline Status PI initialized');
    }

    /**
     * Set up event handlers specific to Pipeline Status.
     */
    setupHandlers() {
        // Handle settings changes from Stream Deck
        this.streamDeckClient.didReceiveSettings = (settings) => {
            this.common.debugLog('Settings received from Stream Deck:', settings);
            this.onSettingsReceived(settings);
        };

        // Handle messages from plugin
        this.streamDeckClient.sendToPropertyInspector = (data) => {
            this.common.debugLog('Received from plugin', data);
            this.handlePluginMessage(data);
        };

        // Test connection button
        this.testButton = document.getElementById('testConnection');
        if (this.testButton) {
            this.testButton.addEventListener('click', () => this.testConnection());
        }

        // Pipeline ID validation
        const pipelineIdField = document.querySelector('[setting="pipelineId"]');
        if (pipelineIdField) {
            pipelineIdField.addEventListener('input', (e) => {
                // Ensure only numbers are entered
                e.target.value = e.target.value.replace(/[^0-9]/g, '');
            });
        }

        // Branch name helper
        const branchField = document.querySelector('[setting="branchName"]');
        if (branchField) {
            branchField.addEventListener('focus', () => {
                this.common.debugLog('Branch field focused - showing examples');
            });
        }
    }

    /**
     * Handle settings received from Stream Deck.
     */
    onSettingsReceived(settings) {
        // Update UI based on settings if needed
        if (settings.refreshInterval) {
            this.common.debugLog(`Refresh interval: ${settings.refreshInterval} seconds`);
        }
    }

    /**
     * Handle messages from the plugin.
     */
    handlePluginMessage(data) {
        switch (data.event) {
            case 'debugLog':
                this.common.debugLog(`[PLUGIN] ${data.message}`, data.data);
                break;
            
            case 'connectionResult':
                this.handleConnectionResult(data);
                break;
            
            default:
                this.common.debugLog('Unknown event from plugin:', data);
        }
    }

    /**
     * Test the Azure DevOps connection.
     */
    async testConnection() {
        if (this.isTestingConnection) {
            this.common.debugLog('Test already in progress');
            return;
        }

        this.common.debugLog('Test Connection clicked');
        
        // Get current settings
        const settings = this.common.getFormSettings([
            'organizationUrl',
            'projectName',
            'pipelineId',
            'personalAccessToken',
            'branchName',
            'refreshInterval',
            'displayFormat',
            'showBuildNumber',
            'showDuration'
        ]);
        
        this.common.debugLog('Testing with settings', settings);
        
        // Validate required fields
        const validation = this.common.validateSettings(
            settings, 
            ['organizationUrl', 'projectName', 'pipelineId', 'personalAccessToken']
        );
        
        if (!validation.isValid) {
            const error = `Please fill in all required fields: ${validation.missingFields.join(', ')}`;
            this.common.debugLog('Validation failed', { error, settings });
            this.common.showStatus('connectionStatus', error, 'error');
            return;
        }

        // Validate pipeline ID is a number
        const pipelineId = parseInt(settings.pipelineId, 10);
        if (isNaN(pipelineId) || pipelineId <= 0) {
            const error = 'Pipeline ID must be a valid number';
            this.common.debugLog('Invalid pipeline ID', { pipelineId: settings.pipelineId });
            this.common.showStatus('connectionStatus', error, 'error');
            return;
        }
        settings.pipelineId = pipelineId;

        // Show testing status
        this.setTestingState(true);
        this.common.showStatus('connectionStatus', 'Testing connection...', 'testing', 0);
        
        // Send test request to plugin
        this.common.sendToPlugin('testConnection', settings);
    }

    /**
     * Handle connection test result from plugin.
     */
    handleConnectionResult(data) {
        this.setTestingState(false);
        
        if (data.success) {
            this.common.debugLog('Connection test successful', { message: data.message });
            
            let successMessage = data.message || 'Connection successful!';
            if (data.details?.pipelineInfo) {
                const info = data.details.pipelineInfo;
                successMessage += ` Found pipeline: ${info.name}`;
            }
            
            this.common.showStatus('connectionStatus', successMessage, 'success');
        } else {
            this.common.debugLog('Connection test failed', { message: data.message });
            this.common.showStatus('connectionStatus', data.message || 'Connection failed', 'error');
        }
    }

    /**
     * Set the testing state and update UI accordingly.
     */
    setTestingState(isTesting) {
        this.isTestingConnection = isTesting;
        if (this.testButton) {
            this.testButton.disabled = isTesting;
            if (isTesting) {
                this.testButton.textContent = 'Testing...';
            } else {
                this.testButton.textContent = 'Test Connection';
            }
        }
    }

    /**
     * Show help for branch name format.
     */
    showBranchHelp() {
        const helpText = `Branch name examples:
• main - matches 'refs/heads/main'
• develop - matches 'refs/heads/develop'
• refs/heads/feature/* - matches all feature branches
• Leave empty to monitor all branches`;
        
        this.common.debugLog('Branch help:', helpText);
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    const pi = new PipelineStatusPI();
    pi.initialize();
});