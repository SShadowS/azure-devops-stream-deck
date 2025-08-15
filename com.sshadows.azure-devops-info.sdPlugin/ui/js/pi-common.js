/**
 * Common functionality shared across all Property Inspectors.
 * Provides debug logging, status messages, and utility functions.
 */

class PICommon {
    constructor() {
        this.debugLogs = [];
        this.maxLogs = 100;
        this.streamDeckClient = SDPIComponents.streamDeckClient;
        this.statusTimeouts = new Map();
    }

    /**
     * Log a debug message with optional data.
     */
    debugLog(message, data = null) {
        const timestamp = new Date().toISOString().substring(11, 23);
        let logEntry = `[${timestamp}] ${message}`;
        if (data) {
            logEntry += '\n' + JSON.stringify(data, null, 2);
        }
        this.debugLogs.push(logEntry);
        
        // Keep only last N logs
        if (this.debugLogs.length > this.maxLogs) {
            this.debugLogs.shift();
        }
        
        this.updateDebugDisplay();
    }

    /**
     * Update the debug log display element.
     */
    updateDebugDisplay() {
        const debugLogElement = document.getElementById('debugLog');
        if (debugLogElement) {
            debugLogElement.value = this.debugLogs.join('\n\n');
            debugLogElement.scrollTop = debugLogElement.scrollHeight;
        }
    }

    /**
     * Show a status message with the specified type.
     * @param {string} elementId - The status element ID
     * @param {string} message - The message to display
     * @param {string} type - The message type (success, error, testing, info)
     * @param {number} duration - How long to show the message (ms)
     */
    showStatus(elementId, message, type = 'info', duration = 5000) {
        const statusEl = document.getElementById(elementId);
        if (!statusEl) return;

        // Clear any existing timeout for this element
        if (this.statusTimeouts.has(elementId)) {
            clearTimeout(this.statusTimeouts.get(elementId));
        }

        statusEl.textContent = message;
        statusEl.className = `status-message ${type} visible`;

        if (duration > 0) {
            const timeout = setTimeout(() => {
                statusEl.classList.remove('visible');
                this.statusTimeouts.delete(elementId);
            }, duration);
            this.statusTimeouts.set(elementId, timeout);
        }
    }

    /**
     * Copy debug logs to clipboard.
     */
    copyLogs() {
        const debugLogElement = document.getElementById('debugLog');
        if (!debugLogElement) return;

        // Try modern clipboard API first
        if (navigator.clipboard) {
            navigator.clipboard.writeText(debugLogElement.value).then(() => {
                this.showCopyFeedback();
            }).catch(() => {
                this.fallbackCopy(debugLogElement);
            });
        } else {
            this.fallbackCopy(debugLogElement);
        }
        
        this.debugLog('Logs copied to clipboard');
    }

    /**
     * Fallback copy method for older browsers.
     */
    fallbackCopy(element) {
        element.select();
        document.execCommand('copy');
        this.showCopyFeedback();
    }

    /**
     * Show feedback when logs are copied.
     */
    showCopyFeedback() {
        const copyButton = document.getElementById('copyLogs');
        if (!copyButton) return;

        const originalText = copyButton.textContent;
        copyButton.textContent = 'Copied!';
        setTimeout(() => {
            copyButton.textContent = originalText;
        }, 1500);
    }

    /**
     * Clear debug logs.
     */
    clearLogs() {
        this.debugLogs = [];
        const debugLogElement = document.getElementById('debugLog');
        if (debugLogElement) {
            debugLogElement.value = '';
        }
        this.debugLog('Logs cleared');
    }

    /**
     * Validate required connection settings.
     * @param {Object} settings - The settings to validate
     * @param {Array} required - Array of required field names
     * @returns {Object} - { isValid: boolean, missingFields: Array }
     */
    validateSettings(settings, required = ['organizationUrl', 'projectName', 'personalAccessToken']) {
        const missingFields = [];
        
        for (const field of required) {
            if (!settings[field]) {
                missingFields.push(field);
            }
        }

        return {
            isValid: missingFields.length === 0,
            missingFields
        };
    }

    /**
     * Get settings from form elements.
     * @param {Array} fields - Array of field names to get
     * @returns {Object} - The settings object
     */
    getFormSettings(fields) {
        const settings = {};
        
        for (const field of fields) {
            const element = document.querySelector(`[setting="${field}"]`);
            if (element) {
                if (element.type === 'checkbox') {
                    settings[field] = element.checked;
                } else {
                    settings[field] = element.value;
                }
            }
        }

        return settings;
    }

    /**
     * Send a message to the plugin.
     * @param {string} event - The event type
     * @param {Object} payload - The message payload
     */
    sendToPlugin(event, payload = {}) {
        const message = {
            event,
            ...payload
        };

        this.debugLog(`Sending to plugin: ${event}`, message);
        this.streamDeckClient.send('sendToPlugin', message);
    }

    /**
     * Set up common event handlers.
     */
    setupCommonHandlers() {
        // Copy logs button
        const copyBtn = document.getElementById('copyLogs');
        if (copyBtn) {
            copyBtn.addEventListener('click', () => this.copyLogs());
        }

        // Clear logs button
        const clearBtn = document.getElementById('clearLogs');
        if (clearBtn) {
            clearBtn.addEventListener('click', () => this.clearLogs());
        }

        // Log initial state
        this.debugLog('Property Inspector initialized');
        this.debugLog('SDPIComponents available:', typeof SDPIComponents !== 'undefined');
        this.debugLog('streamDeckClient type:', typeof this.streamDeckClient);
    }

    /**
     * Initialize common functionality.
     */
    initialize() {
        this.setupCommonHandlers();
        
        // Get and log initial settings
        const initialSettings = this.streamDeckClient.getSettings();
        if (initialSettings) {
            this.debugLog('Initial settings available:', initialSettings);
        } else {
            this.debugLog('Settings not immediately available');
        }
    }
}

// Create global instance
window.piCommon = new PICommon();