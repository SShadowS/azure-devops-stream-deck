import { Logger } from '@elgato/streamdeck';

/**
 * Custom error types for different scenarios
 */
export enum ErrorType {
    AUTHENTICATION = 'AUTHENTICATION',
    NETWORK = 'NETWORK',
    API_RATE_LIMIT = 'API_RATE_LIMIT',
    INVALID_CONFIGURATION = 'INVALID_CONFIGURATION',
    API_ERROR = 'API_ERROR',
    UNKNOWN = 'UNKNOWN'
}

/**
 * Custom error class for Azure DevOps plugin errors
 */
export class AzureDevOpsError extends Error {
    public readonly type: ErrorType;
    public readonly statusCode?: number;
    public readonly retryable: boolean;
    public readonly userMessage: string;
    public readonly details?: any;

    constructor(
        message: string,
        type: ErrorType,
        options?: {
            statusCode?: number;
            retryable?: boolean;
            userMessage?: string;
            details?: any;
        }
    ) {
        super(message);
        this.name = 'AzureDevOpsError';
        this.type = type;
        this.statusCode = options?.statusCode;
        this.retryable = options?.retryable ?? false;
        this.userMessage = options?.userMessage ?? this.getDefaultUserMessage(type);
        this.details = options?.details;
    }

    private getDefaultUserMessage(type: ErrorType): string {
        switch (type) {
            case ErrorType.AUTHENTICATION:
                return 'Authentication failed. Please check your Personal Access Token.';
            case ErrorType.NETWORK:
                return 'Network error. Please check your internet connection.';
            case ErrorType.API_RATE_LIMIT:
                return 'API rate limit exceeded. Please try again later.';
            case ErrorType.INVALID_CONFIGURATION:
                return 'Invalid configuration. Please check your settings.';
            case ErrorType.API_ERROR:
                return 'Azure DevOps API error. Please try again.';
            default:
                return 'An unexpected error occurred.';
        }
    }
}

/**
 * Error handler with retry logic and user-friendly messages
 */
export class ErrorHandler {
    private readonly logger: Logger;
    private readonly maxRetries: number;
    private readonly baseRetryDelay: number;
    private retryAttempts: Map<string, number> = new Map();

    constructor(logger: Logger, maxRetries: number = 3, baseRetryDelay: number = 1000) {
        this.logger = logger;
        this.maxRetries = maxRetries;
        this.baseRetryDelay = baseRetryDelay;
    }

    /**
     * Handles errors and determines appropriate action
     */
    public handleError(error: any, context?: string): AzureDevOpsError {
        const azureError = this.categorizeError(error);
        
        // Log the error with context
        this.logError(azureError, context);
        
        return azureError;
    }

    /**
     * Categorizes errors into specific types
     */
    private categorizeError(error: any): AzureDevOpsError {
        // Already an AzureDevOpsError
        if (error instanceof AzureDevOpsError) {
            return error;
        }

        // Network errors
        if (this.isNetworkError(error)) {
            return new AzureDevOpsError(
                error.message || 'Network request failed',
                ErrorType.NETWORK,
                {
                    retryable: true,
                    details: error
                }
            );
        }

        // Authentication errors (401, 403)
        if (this.isAuthenticationError(error)) {
            return new AzureDevOpsError(
                error.message || 'Authentication failed',
                ErrorType.AUTHENTICATION,
                {
                    statusCode: error.statusCode || error.response?.status || 401,
                    retryable: false,
                    userMessage: 'Authentication failed. Please verify your Personal Access Token has the required permissions.',
                    details: error
                }
            );
        }

        // Rate limiting errors (429)
        if (this.isRateLimitError(error)) {
            const retryAfter = this.extractRetryAfter(error);
            return new AzureDevOpsError(
                error.message || 'Rate limit exceeded',
                ErrorType.API_RATE_LIMIT,
                {
                    statusCode: 429,
                    retryable: true,
                    userMessage: `Rate limit exceeded. Please wait ${retryAfter} seconds.`,
                    details: { retryAfter }
                }
            );
        }

        // API errors (4xx, 5xx)
        if (this.isApiError(error)) {
            const statusCode = error.statusCode || error.response?.status;
            const retryable = statusCode >= 500; // Retry server errors
            
            return new AzureDevOpsError(
                error.message || `API error: ${statusCode}`,
                ErrorType.API_ERROR,
                {
                    statusCode,
                    retryable,
                    details: error
                }
            );
        }

        // Configuration errors
        if (this.isConfigurationError(error)) {
            return new AzureDevOpsError(
                error.message || 'Invalid configuration',
                ErrorType.INVALID_CONFIGURATION,
                {
                    retryable: false,
                    details: error
                }
            );
        }

        // Unknown errors
        return new AzureDevOpsError(
            error?.message || 'Unknown error occurred',
            ErrorType.UNKNOWN,
            {
                retryable: false,
                details: error
            }
        );
    }

    /**
     * Executes a function with retry logic
     */
    public async executeWithRetry<T>(
        fn: () => Promise<T>,
        retryKey: string,
        options?: {
            maxRetries?: number;
            onRetry?: (attempt: number, error: AzureDevOpsError) => void;
        }
    ): Promise<T> {
        const maxRetries = options?.maxRetries ?? this.maxRetries;
        let lastError: AzureDevOpsError | undefined;
        
        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
                // Reset retry count on success
                if (attempt > 0) {
                    this.logger.debug(`Retry attempt ${attempt} for ${retryKey}`);
                }
                
                const result = await fn();
                this.retryAttempts.delete(retryKey);
                return result;
            } catch (error) {
                lastError = this.handleError(error, retryKey);
                
                // Don't retry if not retryable or max retries reached
                if (!lastError.retryable || attempt >= maxRetries) {
                    break;
                }
                
                // Calculate delay with exponential backoff
                const delay = this.calculateRetryDelay(attempt, lastError);
                
                // Notify about retry
                if (options?.onRetry) {
                    options.onRetry(attempt + 1, lastError);
                }
                
                this.logger.info(`Retrying ${retryKey} after ${delay}ms (attempt ${attempt + 1}/${maxRetries})`);
                
                // Wait before retrying
                await this.sleep(delay);
            }
        }
        
        // All retries exhausted
        throw lastError || new AzureDevOpsError('All retry attempts failed', ErrorType.UNKNOWN);
    }

    /**
     * Calculates retry delay with exponential backoff
     */
    private calculateRetryDelay(attempt: number, error: AzureDevOpsError): number {
        // Use retry-after header if available (for rate limiting)
        if (error.type === ErrorType.API_RATE_LIMIT && error.details?.retryAfter) {
            return error.details.retryAfter * 1000;
        }
        
        // Exponential backoff with jitter
        const exponentialDelay = this.baseRetryDelay * Math.pow(2, attempt);
        const jitter = Math.random() * 1000; // Add up to 1 second of jitter
        
        return Math.min(exponentialDelay + jitter, 30000); // Cap at 30 seconds
    }

    /**
     * Helper to sleep for a given duration
     */
    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Logs error with appropriate level and context
     */
    private logError(error: AzureDevOpsError, context?: string): void {
        const logMessage = context 
            ? `[${context}] ${error.message}` 
            : error.message;
        
        const errorDetails = {
            type: error.type,
            statusCode: error.statusCode,
            retryable: error.retryable,
            details: error.details
        };

        switch (error.type) {
            case ErrorType.AUTHENTICATION:
            case ErrorType.INVALID_CONFIGURATION:
                this.logger.error(logMessage, errorDetails);
                break;
            case ErrorType.API_RATE_LIMIT:
            case ErrorType.NETWORK:
                this.logger.warn(logMessage, errorDetails);
                break;
            default:
                this.logger.error(logMessage, errorDetails);
        }
    }

    /**
     * Error type detection helpers
     */
    private isNetworkError(error: any): boolean {
        if (!error) return false;
        return (
            error.code === 'ECONNREFUSED' ||
            error.code === 'ENOTFOUND' ||
            error.code === 'ETIMEDOUT' ||
            error.code === 'ECONNRESET' ||
            error.message?.toLowerCase().includes('network') ||
            error.message?.toLowerCase().includes('fetch failed')
        );
    }

    private isAuthenticationError(error: any): boolean {
        if (!error) return false;
        const statusCode = error?.statusCode || error?.response?.status;
        return (
            statusCode === 401 ||
            statusCode === 403 ||
            error?.message?.toLowerCase().includes('unauthorized') ||
            error?.message?.toLowerCase().includes('forbidden') ||
            error?.message?.toLowerCase().includes('authentication')
        );
    }

    private isRateLimitError(error: any): boolean {
        if (!error) return false;
        const statusCode = error?.statusCode || error?.response?.status;
        return (
            statusCode === 429 ||
            error?.message?.toLowerCase().includes('rate limit') ||
            error?.message?.toLowerCase().includes('too many requests')
        );
    }

    private isApiError(error: any): boolean {
        if (!error) return false;
        const statusCode = error?.statusCode || error?.response?.status;
        return statusCode >= 400 && statusCode < 600;
    }

    private isConfigurationError(error: any): boolean {
        if (!error) return false;
        return (
            error?.message?.toLowerCase().includes('invalid configuration') ||
            error?.message?.toLowerCase().includes('missing required') ||
            error?.message?.toLowerCase().includes('invalid url') ||
            error?.message?.toLowerCase().includes('invalid project')
        );
    }

    private extractRetryAfter(error: any): number {
        // Try to extract retry-after from headers
        const retryAfter = error.response?.headers?.['retry-after'] || 
                          error.headers?.['retry-after'];
        
        if (retryAfter) {
            // If it's a number, it's seconds
            const seconds = parseInt(retryAfter, 10);
            if (!isNaN(seconds)) {
                return seconds;
            }
        }
        
        // Default to 60 seconds for rate limiting
        return 60;
    }

    /**
     * Clears retry attempts for a specific key
     */
    public clearRetryAttempts(retryKey?: string): void {
        if (retryKey) {
            this.retryAttempts.delete(retryKey);
        } else {
            this.retryAttempts.clear();
        }
    }

    /**
     * Gets user-friendly error message for display
     */
    public getUserMessage(error: any): string {
        if (error instanceof AzureDevOpsError) {
            return error.userMessage;
        }
        
        const azureError = this.categorizeError(error);
        return azureError.userMessage;
    }
}

export default ErrorHandler;