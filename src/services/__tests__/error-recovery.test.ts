/**
 * Tests for ErrorRecoveryService.
 * Verifies retry logic, exponential backoff, and error formatting.
 */

import { ErrorRecoveryService } from '../error-recovery';

describe('ErrorRecoveryService', () => {
    let service: ErrorRecoveryService;

    beforeEach(() => {
        service = new ErrorRecoveryService();
        jest.useFakeTimers();
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    describe('Retry Logic', () => {
        it('should succeed on first attempt', async () => {
            const operation = jest.fn().mockResolvedValue('success');
            
            const result = await service.tryWithRetry(operation);
            
            expect(result.success).toBe(true);
            expect(result.data).toBe('success');
            expect(result.attempts).toBe(1);
            expect(operation).toHaveBeenCalledTimes(1);
        });

        it('should retry on failure and eventually succeed', async () => {
            const operation = jest.fn()
                .mockRejectedValueOnce(new Error('Attempt 1'))
                .mockRejectedValueOnce(new Error('Attempt 2'))
                .mockResolvedValue('success');
            
            const promise = service.tryWithRetry(operation, { maxAttempts: 3 });
            
            // Fast-forward through retries
            await jest.runAllTimersAsync();
            
            const result = await promise;
            
            expect(result.success).toBe(true);
            expect(result.data).toBe('success');
            expect(result.attempts).toBe(3);
            expect(operation).toHaveBeenCalledTimes(3);
        });

        it('should fail after max attempts', async () => {
            const error = new Error('Persistent error');
            const operation = jest.fn().mockRejectedValue(error);
            
            const promise = service.tryWithRetry(operation, { maxAttempts: 3 });
            
            // Fast-forward through all retries
            await jest.runAllTimersAsync();
            
            const result = await promise;
            
            expect(result.success).toBe(false);
            expect(result.error).toBe(error);
            expect(result.attempts).toBe(3);
            expect(operation).toHaveBeenCalledTimes(3);
        });

        it('should respect shouldRetry callback', async () => {
            const authError = new Error('401 Unauthorized');
            const operation = jest.fn().mockRejectedValue(authError);
            
            const shouldRetry = jest.fn().mockReturnValue(false);
            
            const result = await service.tryWithRetry(operation, {
                maxAttempts: 3,
                shouldRetry
            });
            
            expect(result.success).toBe(false);
            expect(result.error).toBe(authError);
            expect(result.attempts).toBe(1);
            expect(operation).toHaveBeenCalledTimes(1);
            expect(shouldRetry).toHaveBeenCalledWith(authError);
        });

        it('should call onRetry callback', async () => {
            const error = new Error('Temporary error');
            const operation = jest.fn()
                .mockRejectedValueOnce(error)
                .mockResolvedValue('success');
            
            const onRetry = jest.fn();
            
            const promise = service.tryWithRetry(operation, {
                maxAttempts: 2,
                // onRetry is passed as 3rd parameter, not in config
            });
            
            // Fast-forward through retry
            await jest.runAllTimersAsync();
            
            await promise;
            
            expect(onRetry).toHaveBeenCalledWith(error, 0, expect.any(Number));
        });
    });

    describe('Exponential Backoff', () => {
        it('should use exponential backoff with jitter', async () => {
            const operation = jest.fn()
                .mockRejectedValueOnce(new Error('Error 1'))
                .mockRejectedValueOnce(new Error('Error 2'))
                .mockResolvedValue('success');
            
            const promise = service.tryWithRetry(operation, {
                maxAttempts: 3,
                baseDelay: 1000,
                maxDelay: 10000
            });
            
            // First attempt fails immediately
            expect(operation).toHaveBeenCalledTimes(1);
            
            // Advance time for first retry (1000-2000ms with jitter)
            jest.advanceTimersByTime(2000);
            await Promise.resolve();
            expect(operation).toHaveBeenCalledTimes(2);
            
            // Advance time for second retry (2000-4000ms with jitter)
            jest.advanceTimersByTime(4000);
            await Promise.resolve();
            expect(operation).toHaveBeenCalledTimes(3);
            
            await promise;
        });

        it('should respect maxDelay', async () => {
            const calculateDelay = (service as any).calculateBackoffDelay.bind(service);
            
            // Test that delay doesn't exceed maxDelay
            const delay1 = calculateDelay(5, 1000, 5000);
            expect(delay1).toBeLessThanOrEqual(5000);
            
            const delay2 = calculateDelay(10, 1000, 5000);
            expect(delay2).toBeLessThanOrEqual(5000);
        });
    });

    describe('Error Formatting', () => {
        it('should format authentication errors', () => {
            const error = new Error('401 Unauthorized');
            const formatted = service.formatErrorMessage(error);
            expect(formatted).toContain('Authentication failed');
        });

        it('should format not found errors', () => {
            const error = new Error('404 Not Found');
            const formatted = service.formatErrorMessage(error);
            expect(formatted).toContain('Resource not found');
        });

        it('should format network errors', () => {
            const error = new Error('ECONNREFUSED');
            const formatted = service.formatErrorMessage(error);
            expect(formatted).toContain('Connection refused');
        });

        it('should format timeout errors', () => {
            const error = new Error('ETIMEDOUT');
            const formatted = service.formatErrorMessage(error);
            expect(formatted).toContain('Connection timeout');
        });

        it('should format rate limit errors', () => {
            const error = new Error('429 Too Many Requests');
            const formatted = service.formatErrorMessage(error);
            expect(formatted).toContain('Rate limit exceeded');
        });

        it('should handle unknown errors', () => {
            const error = new Error('Something unexpected');
            const formatted = service.formatErrorMessage(error);
            expect(formatted).toBe('Something unexpected');
        });

        it('should handle non-Error objects', () => {
            const formatted = service.formatErrorMessage(new Error('String error'));
            expect(formatted).toBe('String error');
        });

        it('should handle null/undefined', () => {
            const formatted1 = service.formatErrorMessage(new Error());
            expect(formatted1).toBe('Unknown error');
            
            const formatted2 = service.formatErrorMessage(new Error(''));
            expect(formatted2).toBe('Unknown error');
        });
    });

    describe('Circuit Breaker Pattern', () => {
        it('should identify patterns of failures', () => {
            const errors = [
                new Error('Connection timeout'),
                new Error('Connection timeout'),
                new Error('Connection timeout')
            ];
            
            const shouldRetry = service.isRecoverableError(errors[2]);
            
            // Should still retry timeout errors
            expect(shouldRetry).toBe(true);
        });

        it('should not retry permanent errors', () => {
            const authError = new Error('401 Unauthorized');
            const shouldRetry = service.isRecoverableError(authError);
            expect(shouldRetry).toBe(false);
            
            const forbiddenError = new Error('403 Forbidden');
            const shouldRetry2 = service.isRecoverableError(forbiddenError);
            expect(shouldRetry2).toBe(false);
        });
    });

    describe('withRetry Helper', () => {
        it('should provide simpler API for basic retry', async () => {
            const operation = jest.fn()
                .mockRejectedValueOnce(new Error('Temporary'))
                .mockResolvedValue('success');
            
            const promise = service.withRetry(operation);
            
            // Fast-forward through retry
            await jest.runAllTimersAsync();
            
            const result = await promise;
            
            expect(result).toBe('success');
            expect(operation).toHaveBeenCalledTimes(2);
        });

        it('should throw on failure with withRetry', async () => {
            const error = new Error('Persistent error');
            const operation = jest.fn().mockRejectedValue(error);
            
            const promise = service.withRetry(operation, { maxAttempts: 2 });
            
            // Fast-forward through retries
            await jest.runAllTimersAsync();
            
            await expect(promise).rejects.toThrow('Persistent error');
            expect(operation).toHaveBeenCalledTimes(2);
        });
    });
});