import { ErrorHandler, AzureDevOpsError, ErrorType } from '../error-handler';
import { Logger } from '@elgato/streamdeck';

describe('AzureDevOpsError', () => {
    describe('constructor', () => {
        it('should create error with default values', () => {
            const error = new AzureDevOpsError('Test error', ErrorType.AUTHENTICATION);

            expect(error.message).toBe('Test error');
            expect(error.type).toBe(ErrorType.AUTHENTICATION);
            expect(error.name).toBe('AzureDevOpsError');
            expect(error.retryable).toBe(false);
            expect(error.userMessage).toBe('Authentication failed. Please check your Personal Access Token.');
            expect(error.statusCode).toBeUndefined();
            expect(error.details).toBeUndefined();
        });

        it('should create error with custom options', () => {
            const error = new AzureDevOpsError('Test error', ErrorType.API_ERROR, {
                statusCode: 500,
                retryable: true,
                userMessage: 'Custom message',
                details: { foo: 'bar' }
            });

            expect(error.statusCode).toBe(500);
            expect(error.retryable).toBe(true);
            expect(error.userMessage).toBe('Custom message');
            expect(error.details).toEqual({ foo: 'bar' });
        });

        it('should provide default user messages for all error types', () => {
            const errorTypes = [
                { type: ErrorType.AUTHENTICATION, message: 'Authentication failed. Please check your Personal Access Token.' },
                { type: ErrorType.NETWORK, message: 'Network error. Please check your internet connection.' },
                { type: ErrorType.API_RATE_LIMIT, message: 'API rate limit exceeded. Please try again later.' },
                { type: ErrorType.INVALID_CONFIGURATION, message: 'Invalid configuration. Please check your settings.' },
                { type: ErrorType.API_ERROR, message: 'Azure DevOps API error. Please try again.' },
                { type: ErrorType.UNKNOWN, message: 'An unexpected error occurred.' }
            ];

            errorTypes.forEach(({ type, message }) => {
                const error = new AzureDevOpsError('Test', type);
                expect(error.userMessage).toBe(message);
            });
        });
    });
});

describe('ErrorHandler', () => {
    let errorHandler: ErrorHandler;
    let mockLogger: jest.Mocked<Logger>;

    beforeEach(() => {
        mockLogger = {
            debug: jest.fn(),
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
            trace: jest.fn(),
            createScope: jest.fn()
        } as any;

        errorHandler = new ErrorHandler(mockLogger);
    });

    describe('handleError', () => {
        it('should return existing AzureDevOpsError unchanged', () => {
            const originalError = new AzureDevOpsError('Test', ErrorType.AUTHENTICATION);
            const result = errorHandler.handleError(originalError, 'test-context');

            expect(result).toBe(originalError);
            expect(mockLogger.error).toHaveBeenCalled();
        });

        it('should categorize network errors correctly', () => {
            const networkError = new Error('ECONNREFUSED');
            (networkError as any).code = 'ECONNREFUSED';

            const result = errorHandler.handleError(networkError);

            expect(result.type).toBe(ErrorType.NETWORK);
            expect(result.retryable).toBe(true);
        });

        it('should categorize authentication errors correctly', () => {
            const authError = new Error('401 Unauthorized');
            (authError as any).statusCode = 401;

            const result = errorHandler.handleError(authError);

            expect(result.type).toBe(ErrorType.AUTHENTICATION);
            expect(result.retryable).toBe(false);
            expect(result.statusCode).toBe(401);
        });

        it('should categorize rate limit errors correctly', () => {
            const rateLimitError = new Error('Too Many Requests');
            (rateLimitError as any).statusCode = 429;

            const result = errorHandler.handleError(rateLimitError);

            expect(result.type).toBe(ErrorType.API_RATE_LIMIT);
            expect(result.retryable).toBe(true);
            expect(result.statusCode).toBe(429);
        });

        it('should categorize API errors correctly', () => {
            const apiError = new Error('Internal Server Error');
            (apiError as any).statusCode = 500;

            const result = errorHandler.handleError(apiError);

            expect(result.type).toBe(ErrorType.API_ERROR);
            expect(result.retryable).toBe(true);
            expect(result.statusCode).toBe(500);
        });

        it('should categorize unknown errors', () => {
            const unknownError = new Error('Something went wrong');

            const result = errorHandler.handleError(unknownError);

            expect(result.type).toBe(ErrorType.UNKNOWN);
            expect(result.retryable).toBe(false);
        });

        it('should handle errors with response object', () => {
            const error = {
                response: {
                    status: 403,
                    statusText: 'Forbidden',
                    data: { message: 'Access denied' }
                }
            };

            const result = errorHandler.handleError(error);

            expect(result.type).toBe(ErrorType.AUTHENTICATION);
            expect(result.statusCode).toBe(403);
        });

        it('should log errors with context', () => {
            const error = new Error('Test error');
            errorHandler.handleError(error, 'test-context');

            expect(mockLogger.error).toHaveBeenCalledWith(
                expect.stringContaining('test-context'),
                expect.any(Object)
            );
        });
    });

    describe('executeWithRetry', () => {
        it('should execute operation successfully on first try', async () => {
            const operation = jest.fn().mockResolvedValue('success');

            const result = await errorHandler.executeWithRetry(operation, 'test-op');

            expect(result).toBe('success');
            expect(operation).toHaveBeenCalledTimes(1);
        });

        it('should retry on retryable errors', async () => {
            const operation = jest.fn()
                .mockRejectedValueOnce(new AzureDevOpsError('Network error', ErrorType.NETWORK, { retryable: true }))
                .mockResolvedValue('success');

            const result = await errorHandler.executeWithRetry(operation, 'test-op');

            expect(result).toBe('success');
            expect(operation).toHaveBeenCalledTimes(2);
        });

        it('should not retry on non-retryable errors', async () => {
            const operation = jest.fn()
                .mockRejectedValue(new AzureDevOpsError('Auth error', ErrorType.AUTHENTICATION, { retryable: false }));

            await expect(errorHandler.executeWithRetry(operation, 'test-op'))
                .rejects.toThrow('Auth error');

            expect(operation).toHaveBeenCalledTimes(1);
        });

        it('should respect max retries', async () => {
            const handler = new ErrorHandler(mockLogger, 2, 10);
            const operation = jest.fn()
                .mockRejectedValue(new AzureDevOpsError('Network error', ErrorType.NETWORK, { retryable: true }));

            await expect(handler.executeWithRetry(operation, 'test-op'))
                .rejects.toThrow('Network error');

            expect(operation).toHaveBeenCalledTimes(3); // Initial + 2 retries
        });

        it('should use exponential backoff for retries', async () => {
            jest.useFakeTimers();

            const handler = new ErrorHandler(mockLogger, 2, 100);
            const operation = jest.fn()
                .mockRejectedValueOnce(new AzureDevOpsError('Network error', ErrorType.NETWORK, { retryable: true }))
                .mockResolvedValue('success');

            const promise = handler.executeWithRetry(operation, 'test-op');

            // Wait for initial attempt to complete
            await Promise.resolve();
            expect(operation).toHaveBeenCalledTimes(1);

            // Advance past exponential backoff delay (100ms base + jitter up to 1000ms)
            await jest.runAllTimersAsync();

            const result = await promise;
            expect(result).toBe('success');
            expect(operation).toHaveBeenCalledTimes(2);

            jest.useRealTimers();
        });

        it('should call onRetry callback', async () => {
            jest.useFakeTimers();
            
            const handler = new ErrorHandler(mockLogger, 2, 10);
            const operation = jest.fn()
                .mockRejectedValueOnce(new AzureDevOpsError('Network error', ErrorType.NETWORK, { retryable: true }))
                .mockResolvedValue('success');
            const onRetry = jest.fn();

            const promise = handler.executeWithRetry(operation, 'test-op', { onRetry });
            
            // Run all timers to complete the retry
            await jest.runAllTimersAsync();
            await promise;

            expect(onRetry).toHaveBeenCalledWith(1, expect.any(AzureDevOpsError));
            
            jest.useRealTimers();
        });

        it('should clear retry attempts on success', async () => {
            jest.useFakeTimers();
            
            const handler = new ErrorHandler(mockLogger, 2, 10);
            const operation = jest.fn()
                .mockRejectedValueOnce(new AzureDevOpsError('Network error', ErrorType.NETWORK, { retryable: true }))
                .mockResolvedValue('success');

            // First execution with retry
            const promise1 = handler.executeWithRetry(operation, 'test-op');
            await jest.runAllTimersAsync();
            await promise1;
            expect(operation).toHaveBeenCalledTimes(2);

            // Reset mock
            operation.mockClear();
            operation.mockResolvedValue('success');

            // Second execution should start fresh
            const promise2 = handler.executeWithRetry(operation, 'test-op');
            await jest.runAllTimersAsync();
            await promise2;
            expect(operation).toHaveBeenCalledTimes(1);
            
            jest.useRealTimers();
        });
    });

    describe('getUserMessage', () => {
        it('should get user message from AzureDevOpsError', () => {
            const error = new AzureDevOpsError('Technical error', ErrorType.API_ERROR, {
                userMessage: 'Something went wrong',
                statusCode: 500
            });

            const message = errorHandler.getUserMessage(error);

            expect(message).toBe('Something went wrong');
        });

        it('should categorize and get user message for non-AzureDevOpsError', () => {
            const error = new Error('Network failed');
            (error as any).code = 'ECONNREFUSED';

            const message = errorHandler.getUserMessage(error);

            expect(message).toBe('Network error. Please check your internet connection.');
        });

        it('should handle null and undefined errors gracefully', () => {
            const nullResult = errorHandler.handleError(null);
            expect(nullResult.type).toBe(ErrorType.UNKNOWN);

            const undefinedResult = errorHandler.handleError(undefined);
            expect(undefinedResult.type).toBe(ErrorType.UNKNOWN);
        });
    });

    describe('clearRetryAttempts', () => {
        it('should clear retry attempts for specific key', () => {
            errorHandler.clearRetryAttempts('test-key');
            // Method doesn't return anything, just ensure it doesn't throw
            expect(true).toBe(true);
        });

        it('should clear all retry attempts when no key provided', () => {
            errorHandler.clearRetryAttempts();
            // Method doesn't return anything, just ensure it doesn't throw
            expect(true).toBe(true);
        });
    });
});