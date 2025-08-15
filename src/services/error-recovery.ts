import streamDeck from '@elgato/streamdeck';

/**
 * Configuration for retry behavior.
 */
export interface RetryConfig {
    maxAttempts?: number;
    baseDelay?: number;
    maxDelay?: number;
    backoffMultiplier?: number;
    shouldRetry?: (error: Error, attempt: number) => boolean;
}

/**
 * Result of a retry operation.
 */
export interface RetryResult<T> {
    success: boolean;
    data?: T;
    error?: Error;
    attempts: number;
}

/**
 * Service for handling errors and implementing retry logic with exponential backoff.
 */
export class ErrorRecoveryService {
    private logger = streamDeck.logger.createScope('ErrorRecovery');
    
    // Default retry configuration
    private readonly DEFAULT_CONFIG: Required<RetryConfig> = {
        maxAttempts: 5,
        baseDelay: 1000,
        maxDelay: 30000,
        backoffMultiplier: 2,
        shouldRetry: (error: Error) => {
            // Don't retry on authentication errors
            if (error.message?.includes('401') || error.message?.includes('403')) {
                return false;
            }
            // Don't retry on not found errors
            if (error.message?.includes('404')) {
                return false;
            }
            // Retry on network errors and timeouts
            if (error.message?.includes('ECONNREFUSED') || 
                error.message?.includes('ETIMEDOUT') ||
                error.message?.includes('ENOTFOUND') ||
                error.message?.includes('ENETUNREACH')) {
                return true;
            }
            // Retry on server errors
            if (error.message?.includes('500') || 
                error.message?.includes('502') ||
                error.message?.includes('503') ||
                error.message?.includes('504')) {
                return true;
            }
            // Default to retry
            return true;
        }
    };

    /**
     * Executes an operation with retry logic and exponential backoff.
     */
    async withRetry<T>(
        operation: () => Promise<T>,
        config?: RetryConfig,
        onRetry?: (error: Error, attempt: number, nextDelay: number) => void
    ): Promise<T> {
        const finalConfig = { ...this.DEFAULT_CONFIG, ...config };
        let lastError: Error = new Error('No attempts made');
        
        for (let attempt = 1; attempt <= finalConfig.maxAttempts; attempt++) {
            try {
                this.logger.debug('Attempting operation', { attempt, maxAttempts: finalConfig.maxAttempts });
                const result = await operation();
                
                if (attempt > 1) {
                    this.logger.info('Operation succeeded after retry', { attempt });
                }
                
                return result;
            } catch (error) {
                lastError = error as Error;
                
                this.logger.warn('Operation failed', { 
                    attempt, 
                    error: lastError.message,
                    willRetry: attempt < finalConfig.maxAttempts && finalConfig.shouldRetry(lastError, attempt)
                });
                
                // Check if we should retry
                if (attempt >= finalConfig.maxAttempts || !finalConfig.shouldRetry(lastError, attempt)) {
                    break;
                }
                
                // Calculate delay with exponential backoff
                const delay = this.calculateDelay(attempt, finalConfig);
                
                // Notify about retry
                onRetry?.(lastError, attempt, delay);
                
                // Wait before retrying
                await this.delay(delay);
            }
        }
        
        this.logger.error('All retry attempts exhausted', { 
            attempts: finalConfig.maxAttempts,
            finalError: lastError.message 
        });
        
        throw lastError;
    }

    /**
     * Executes an operation with retry logic and returns a result object.
     * This variant doesn't throw but returns success/failure information.
     */
    async tryWithRetry<T>(
        operation: () => Promise<T>,
        config?: RetryConfig,
        onRetry?: (error: Error, attempt: number, nextDelay: number) => void
    ): Promise<RetryResult<T>> {
        const finalConfig = { ...this.DEFAULT_CONFIG, ...config };
        let lastError: Error = new Error('No attempts made');
        let attempts = 0;
        
        for (attempts = 1; attempts <= finalConfig.maxAttempts; attempts++) {
            try {
                const data = await operation();
                return {
                    success: true,
                    data,
                    attempts
                };
            } catch (error) {
                lastError = error as Error;
                
                if (attempts >= finalConfig.maxAttempts || !finalConfig.shouldRetry(lastError, attempts)) {
                    break;
                }
                
                const delay = this.calculateDelay(attempts, finalConfig);
                onRetry?.(lastError, attempts, delay);
                await this.delay(delay);
            }
        }
        
        return {
            success: false,
            error: lastError,
            attempts
        };
    }

    /**
     * Wraps an async function with retry logic.
     */
    wrapWithRetry<T extends (...args: any[]) => Promise<any>>(
        fn: T,
        config?: RetryConfig
    ): T {
        return (async (...args: Parameters<T>) => {
            return this.withRetry(() => fn(...args), config);
        }) as T;
    }

    /**
     * Calculates the delay for the next retry attempt using exponential backoff.
     */
    private calculateDelay(attempt: number, config: Required<RetryConfig>): number {
        // Exponential backoff with jitter
        const exponentialDelay = config.baseDelay * Math.pow(config.backoffMultiplier, attempt - 1);
        
        // Add jitter (±25% of the delay)
        const jitter = exponentialDelay * 0.25 * (Math.random() * 2 - 1);
        const delayWithJitter = exponentialDelay + jitter;
        
        // Cap at maxDelay
        const finalDelay = Math.min(delayWithJitter, config.maxDelay);
        
        this.logger.debug('Calculated retry delay', { 
            attempt, 
            baseDelay: config.baseDelay,
            exponentialDelay,
            finalDelay: Math.round(finalDelay)
        });
        
        return Math.round(finalDelay);
    }

    /**
     * Delays execution for the specified milliseconds.
     */
    private delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Determines if an error is recoverable.
     */
    isRecoverableError(error: Error): boolean {
        return this.DEFAULT_CONFIG.shouldRetry(error, 1);
    }

    /**
     * Formats an error message for display to the user.
     */
    formatErrorMessage(error: Error): string {
        // Authentication errors
        if (error.message?.includes('401')) {
            return 'Authentication failed. Please check your Personal Access Token.';
        }
        if (error.message?.includes('403')) {
            return 'Access denied. Please check your permissions.';
        }
        
        // Not found errors
        if (error.message?.includes('404')) {
            return 'Resource not found. Please check your configuration.';
        }
        
        // Network errors
        if (error.message?.includes('ECONNREFUSED')) {
            return 'Connection refused. Please check the organization URL.';
        }
        if (error.message?.includes('ETIMEDOUT')) {
            return 'Connection timed out. Please check your network.';
        }
        if (error.message?.includes('ENOTFOUND')) {
            return 'Server not found. Please check the organization URL.';
        }
        if (error.message?.includes('ENETUNREACH')) {
            return 'Network unreachable. Please check your connection.';
        }
        
        // Server errors
        if (error.message?.includes('500')) {
            return 'Server error. Please try again later.';
        }
        if (error.message?.includes('502') || error.message?.includes('503')) {
            return 'Service temporarily unavailable. Please try again later.';
        }
        if (error.message?.includes('504')) {
            return 'Request timed out. Please try again.';
        }
        
        // Default
        return error.message || 'An unknown error occurred.';
    }

    /**
     * Creates a retry configuration for specific scenarios.
     */
    static createConfig(scenario: 'fast' | 'standard' | 'patient'): RetryConfig {
        switch (scenario) {
            case 'fast':
                return {
                    maxAttempts: 3,
                    baseDelay: 500,
                    maxDelay: 5000,
                    backoffMultiplier: 2
                };
            
            case 'standard':
                return {
                    maxAttempts: 5,
                    baseDelay: 1000,
                    maxDelay: 30000,
                    backoffMultiplier: 2
                };
            
            case 'patient':
                return {
                    maxAttempts: 10,
                    baseDelay: 2000,
                    maxDelay: 60000,
                    backoffMultiplier: 1.5
                };
            
            default:
                return {};
        }
    }
}