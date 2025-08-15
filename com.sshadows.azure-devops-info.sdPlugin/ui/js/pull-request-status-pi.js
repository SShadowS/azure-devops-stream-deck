/**
 * Pull Request Status Property Inspector functionality.
 * Handles PR-specific configuration, repository loading, and testing.
 */

class PullRequestStatusPI {
    constructor() {
        this.common = window.piCommon;
        this.streamDeckClient = this.common.streamDeckClient;
        this.testButton = null;
        this.loadReposButton = null;
        this.isTestingConnection = false;
        this.isLoadingRepos = false;
        this.repositories = [];
    }

    /**
     * Initialize the Property Inspector.
     */
    initialize() {
        this.common.initialize();
        this.setupHandlers();
        this.updateUsernameVisibility();
        this.common.debugLog('Pull Request Status PI initialized');
    }

    /**
     * Set up event handlers specific to Pull Request Status.
     */
    setupHandlers() {
        // Don't override SDPIComponents' built-in settings handlers
        // Just listen for messages from the plugin
        try {
            // Only handle messages from plugin, not settings changes
            if (this.streamDeckClient && this.streamDeckClient.sendToPropertyInspector) {
                if (typeof this.streamDeckClient.sendToPropertyInspector.subscribe === 'function') {
                    // New API with subscribe method
                    this.streamDeckClient.sendToPropertyInspector.subscribe((event) => {
                        this.common.debugLog('Message from plugin (subscribe):', event);
                        this.handlePluginMessage(event);
                    });
                } else {
                    // Fallback - add a custom handler for plugin messages
                    const originalHandler = this.streamDeckClient.sendToPropertyInspector;
                    this.streamDeckClient.sendToPropertyInspector = (data) => {
                        this.common.debugLog('Message from plugin:', data);
                        this.handlePluginMessage(data);
                        // Call original handler if it exists
                        if (typeof originalHandler === 'function') {
                            originalHandler(data);
                        }
                    };
                }
            }
        } catch (error) {
            this.common.debugLog('Error setting up plugin message handler:', error.message);
        }

        // Test connection button
        this.testButton = document.getElementById('testConnection');
        if (this.testButton) {
            this.testButton.addEventListener('click', () => this.testConnection());
        }

        // Load repositories button
        this.loadReposButton = document.getElementById('loadRepositories');
        if (this.loadReposButton) {
            this.loadReposButton.addEventListener('click', () => this.loadRepositories());
        }

        // Filter change handlers
        const creatorFilter = document.getElementById('creatorFilter');
        const reviewerFilter = document.getElementById('reviewerFilter');
        
        if (creatorFilter) {
            creatorFilter.addEventListener('change', () => this.updateUsernameVisibility());
        }
        
        if (reviewerFilter) {
            reviewerFilter.addEventListener('change', () => this.updateUsernameVisibility());
        }

        // Repository selection handler - using querySelector for sdpi-select
        const repoSelect = document.querySelector('[setting="repositoryId"]');
        if (repoSelect) {
            repoSelect.addEventListener('change', (e) => {
                this.common.debugLog('Repository selected:', e.target.value);
            });
        }

        // Max age slider
        const maxAgeSlider = document.querySelector('[setting="maxAge"]');
        if (maxAgeSlider) {
            maxAgeSlider.addEventListener('input', (e) => {
                this.common.debugLog(`Max PR age: ${e.target.value} days`);
            });
        }

        // Alert threshold slider
        const alertSlider = document.querySelector('[setting="alertThreshold"]');
        if (alertSlider) {
            alertSlider.addEventListener('input', (e) => {
                this.common.debugLog(`Alert threshold: ${e.target.value} PRs`);
            });
        }
    }

    /**
     * Handle settings received from Stream Deck.
     */
    onSettingsReceived(settings) {
        // Check if settings is defined
        if (!settings) {
            this.common.debugLog('Settings received but undefined, skipping update');
            return;
        }
        
        this.updateUsernameVisibility();
        
        // Update repository selection if needed
        if (settings.repositoryId) {
            const repoSelect = document.querySelector('[setting="repositoryId"]');
            if (repoSelect && repoSelect.value !== settings.repositoryId) {
                repoSelect.value = settings.repositoryId;
            }
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
            
            case 'repositoriesResult':
                this.handleRepositoriesResult(data);
                break;
            
            default:
                this.common.debugLog('Unknown event from plugin:', data);
        }
    }

    /**
     * Update username field visibility based on filter selections.
     */
    updateUsernameVisibility() {
        const creatorFilter = document.getElementById('creatorFilter')?.value;
        const reviewerFilter = document.getElementById('reviewerFilter')?.value;
        const usernameItem = document.getElementById('usernameItem');
        
        if (usernameItem) {
            const shouldShow = creatorFilter === 'me' || reviewerFilter === 'me';
            if (shouldShow) {
                usernameItem.classList.remove('hidden');
                this.common.debugLog('Username field shown (filter set to "me")');
            } else {
                usernameItem.classList.add('hidden');
                this.common.debugLog('Username field hidden (no "me" filters)');
            }
        }
    }

    /**
     * Load repositories from Azure DevOps.
     */
    async loadRepositories() {
        if (this.isLoadingRepos) {
            this.common.debugLog('Repository loading already in progress');
            return;
        }

        this.common.debugLog('Load Repositories clicked');
        
        // Get connection settings
        const settings = this.common.getFormSettings([
            'organizationUrl',
            'projectName',
            'personalAccessToken'
        ]);
        
        this.common.debugLog('Loading repositories with settings', settings);
        
        // Validate required fields
        const validation = this.common.validateSettings(settings);
        
        if (!validation.isValid) {
            const error = `Please fill in connection fields first: ${validation.missingFields.join(', ')}`;
            this.common.debugLog('Validation failed for repository loading', { error });
            this.common.showStatus('connectionStatus', error, 'error');
            return;
        }

        // Show loading state
        this.setLoadingReposState(true);
        this.common.showStatus('connectionStatus', 'Loading repositories...', 'testing', 0);
        
        // Send request to plugin
        this.common.sendToPlugin('getRepositories', settings);
    }

    /**
     * Handle repository loading result from plugin.
     */
    handleRepositoriesResult(data) {
        this.setLoadingReposState(false);
        
        const repoSelect = document.querySelector('[setting="repositoryId"]');
        if (!repoSelect) {
            this.common.debugLog('Repository select element not found');
            return;
        }

        if (data.success !== false && data.repositories) {
            // Clear existing options except first two (placeholder and "All")
            while (repoSelect.options.length > 2) {
                repoSelect.remove(2);
            }
            
            // Add repository options
            this.repositories = data.repositories;
            data.repositories.forEach(repo => {
                const option = document.createElement('option');
                option.value = repo.id;
                option.textContent = repo.name;
                repoSelect.appendChild(option);
            });
            
            const message = `Loaded ${data.repositories.length} repositories`;
            this.common.debugLog(message);
            this.common.showStatus('connectionStatus', message, 'success');
        } else {
            const error = data.message || data.error || 'Failed to load repositories';
            this.common.debugLog('Failed to load repositories:', error);
            this.common.showStatus('connectionStatus', error, 'error');
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
        
        // Get all settings
        const settings = this.common.getFormSettings([
            'organizationUrl',
            'projectName',
            'personalAccessToken',
            'repositoryId',
            'statusFilter',
            'targetBranch',
            'creatorFilter',
            'reviewerFilter',
            'username',
            'maxAge',
            'refreshInterval',
            'displayFormat',
            'alertThreshold',
            'showMergeConflicts'
        ]);
        
        this.common.debugLog('Testing with settings', settings);
        
        // Validate required fields
        const validation = this.common.validateSettings(settings);
        
        if (!validation.isValid) {
            const error = `Please fill in all required fields: ${validation.missingFields.join(', ')}`;
            this.common.debugLog('Validation failed', { error, settings });
            this.common.showStatus('connectionStatus', error, 'error');
            return;
        }

        // Validate username if using "me" filters
        if ((settings.creatorFilter === 'me' || settings.reviewerFilter === 'me') && !settings.username) {
            const error = 'Username is required when using "Me" filters';
            this.common.debugLog('Username required but not provided');
            this.common.showStatus('connectionStatus', error, 'error');
            return;
        }

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
            if (data.details?.repositoryCount) {
                successMessage += ` Found ${data.details.repositoryCount} repositories`;
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
     * Set the loading repos state and update UI accordingly.
     */
    setLoadingReposState(isLoading) {
        this.isLoadingRepos = isLoading;
        if (this.loadReposButton) {
            this.loadReposButton.disabled = isLoading;
            if (isLoading) {
                this.loadReposButton.textContent = 'Loading...';
            } else {
                this.loadReposButton.textContent = 'Load Repositories';
            }
        }
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    const pi = new PullRequestStatusPI();
    pi.initialize();
});