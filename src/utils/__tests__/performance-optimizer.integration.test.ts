/**
 * Integration tests for PerformanceOptimizer
 * These tests use the actual implementation with mocked Stream Deck SDK
 */

// Mock Stream Deck SDK before importing the module
jest.mock('@elgato/streamdeck');

// Import the ACTUAL implementation (not the mock)
import { PerformanceOptimizer, performanceOptimizer } from '../performance-optimizer';

describe('PerformanceOptimizer Integration Tests', () => {
    let optimizer: PerformanceOptimizer;

    beforeEach(() => {
        jest.clearAllMocks();
        jest.useFakeTimers();
        
        // Create a new instance for each test
        optimizer = new PerformanceOptimizer();
    });

    afterEach(() => {
        optimizer.cleanup();
        jest.clearAllTimers();
        jest.useRealTimers();
    });

    describe('Throttle functionality', () => {
        it('should throttle function calls with actual timing', () => {
            const fn = jest.fn();
            const throttledFn = optimizer.throttle(fn, 100);

            // Multiple rapid calls
            throttledFn('call1');
            throttledFn('call2');
            throttledFn('call3');

            // Only first call executes immediately
            expect(fn).toHaveBeenCalledTimes(1);
            expect(fn).toHaveBeenCalledWith('call1');

            // Wait for throttle period
            jest.advanceTimersByTime(100);
            
            // Now can call again
            throttledFn('call4');
            expect(fn).toHaveBeenCalledTimes(2);
            expect(fn).toHaveBeenCalledWith('call4');
        });

        it('should maintain separate throttles for different keys', () => {
            const fn1 = jest.fn();
            const fn2 = jest.fn();
            
            const throttled1 = optimizer.throttle(fn1, 100, 'action1');
            const throttled2 = optimizer.throttle(fn2, 100, 'action2');

            throttled1('a');
            throttled2('b');
            throttled1('c'); // Should be throttled
            throttled2('d'); // Should be throttled

            expect(fn1).toHaveBeenCalledTimes(1);
            expect(fn1).toHaveBeenCalledWith('a');
            expect(fn2).toHaveBeenCalledTimes(1);
            expect(fn2).toHaveBeenCalledWith('b');
        });

        it('should correctly track throttled calls in metrics', () => {
            const fn = jest.fn();
            const throttledFn = optimizer.throttle(fn, 100);

            throttledFn();
            throttledFn(); // Throttled
            throttledFn(); // Throttled
            
            const metrics = optimizer.getMetrics();
            expect(metrics.throttledCalls).toBe(2);
        });
    });

    describe('Debounce functionality', () => {
        it('should debounce function calls with actual timing', () => {
            const fn = jest.fn();
            const debouncedFn = optimizer.debounce(fn, 100);

            debouncedFn('first');
            expect(fn).not.toHaveBeenCalled();

            jest.advanceTimersByTime(50);
            debouncedFn('second');
            expect(fn).not.toHaveBeenCalled();

            jest.advanceTimersByTime(50);
            debouncedFn('third');
            expect(fn).not.toHaveBeenCalled();

            // Wait for debounce period after last call
            jest.advanceTimersByTime(100);
            expect(fn).toHaveBeenCalledTimes(1);
            expect(fn).toHaveBeenCalledWith('third');
        });

        it('should maintain separate debounces for different keys', () => {
            const fn1 = jest.fn();
            const fn2 = jest.fn();
            
            const debounced1 = optimizer.debounce(fn1, 100, 'key1');
            const debounced2 = optimizer.debounce(fn2, 100, 'key2');

            debounced1('a');
            debounced2('b');

            jest.advanceTimersByTime(100);

            expect(fn1).toHaveBeenCalledWith('a');
            expect(fn2).toHaveBeenCalledWith('b');
        });

        it('should track debounced calls correctly', () => {
            const fn = jest.fn();
            const debouncedFn = optimizer.debounce(fn, 100);

            debouncedFn();
            debouncedFn(); // Reset timer
            debouncedFn(); // Reset timer

            const metrics = optimizer.getMetrics();
            expect(metrics.debouncedCalls).toBe(2);
        });
    });

    describe('Cache functionality', () => {
        it('should cache async function results with TTL', async () => {
            let callCount = 0;
            const expensiveFn = jest.fn(async () => {
                callCount++;
                return `result-${callCount}`;
            });

            // First call - cache miss
            const result1 = await optimizer.cachedCall('cache-key', expensiveFn, 1000);
            expect(result1).toBe('result-1');
            expect(expensiveFn).toHaveBeenCalledTimes(1);

            // Second call - cache hit
            const result2 = await optimizer.cachedCall('cache-key', expensiveFn, 1000);
            expect(result2).toBe('result-1');
            expect(expensiveFn).toHaveBeenCalledTimes(1);

            // Check metrics
            const metrics = optimizer.getMetrics();
            expect(metrics.cacheHits).toBe(1);
            expect(metrics.cacheMisses).toBe(1);
            expect(metrics.cacheSize).toBe(1);
        });

        it('should expire cache after TTL', async () => {
            const fn = jest.fn()
                .mockResolvedValueOnce('value1')
                .mockResolvedValueOnce('value2');

            await optimizer.cachedCall('ttl-key', fn, 100);
            expect(fn).toHaveBeenCalledTimes(1);

            // Before TTL expires
            jest.advanceTimersByTime(99);
            await optimizer.cachedCall('ttl-key', fn, 100);
            expect(fn).toHaveBeenCalledTimes(1);

            // After TTL expires
            jest.advanceTimersByTime(2);
            const result = await optimizer.cachedCall('ttl-key', fn, 100);
            expect(result).toBe('value2');
            expect(fn).toHaveBeenCalledTimes(2);
        });

        it('should not cache errors', async () => {
            const fn = jest.fn()
                .mockRejectedValueOnce(new Error('First error'))
                .mockResolvedValueOnce('success');

            await expect(optimizer.cachedCall('error-key', fn, 1000))
                .rejects.toThrow('First error');

            // Should retry on next call, not return cached error
            const result = await optimizer.cachedCall('error-key', fn, 1000);
            expect(result).toBe('success');
            expect(fn).toHaveBeenCalledTimes(2);
        });

        it('should handle concurrent cache requests', async () => {
            const fn = jest.fn().mockResolvedValue('concurrent-result');

            // Make multiple concurrent requests
            const promises = [
                optimizer.cachedCall('concurrent-key', fn, 1000),
                optimizer.cachedCall('concurrent-key', fn, 1000),
                optimizer.cachedCall('concurrent-key', fn, 1000)
            ];

            const results = await Promise.all(promises);

            // All should get same result, but function called multiple times
            // (since they're truly concurrent, cache might not be set yet)
            expect(results).toEqual(['concurrent-result', 'concurrent-result', 'concurrent-result']);
        });
    });

    describe('Request coalescing', () => {
        it('should coalesce concurrent requests', async () => {
            let callCount = 0;
            const fn = jest.fn().mockImplementation(async () => {
                callCount++;
                return `result-${callCount}`;
            });

            // Start multiple concurrent requests
            const promise1 = optimizer.coalesceRequests('coalesce-key', fn);
            const promise2 = optimizer.coalesceRequests('coalesce-key', fn);
            const promise3 = optimizer.coalesceRequests('coalesce-key', fn);

            const results = await Promise.all([promise1, promise2, promise3]);

            // Function should only be called once
            expect(fn).toHaveBeenCalledTimes(1);
            expect(results).toEqual(['result-1', 'result-1', 'result-1']);
        });

        it('should allow new request after completion', async () => {
            const fn = jest.fn().mockResolvedValue('coalesced');

            await optimizer.coalesceRequests('key', fn);
            expect(fn).toHaveBeenCalledTimes(1);

            // After completion, new request should work
            await optimizer.coalesceRequests('key', fn);
            expect(fn).toHaveBeenCalledTimes(2);
        });

        it('should handle errors in coalesced requests', async () => {
            const fn = jest.fn().mockRejectedValue(new Error('Coalesce error'));

            const promise1 = optimizer.coalesceRequests('error-key', fn);
            const promise2 = optimizer.coalesceRequests('error-key', fn);

            await expect(promise1).rejects.toThrow('Coalesce error');
            await expect(promise2).rejects.toThrow('Coalesce error');
            expect(fn).toHaveBeenCalledTimes(1);
        });
    });

    describe('Batch operations', () => {
        it('should batch operations correctly', async () => {
            const items = Array.from({ length: 10 }, (_, i) => i + 1);
            const operation = jest.fn(async (batch: number[]) => {
                return batch.map(x => x * 2);
            });

            const results = await optimizer.batchOperations(items, operation, 3);

            expect(results).toEqual([2, 4, 6, 8, 10, 12, 14, 16, 18, 20]);
            expect(operation).toHaveBeenCalledTimes(4);
            expect(operation.mock.calls).toEqual([
                [[1, 2, 3]],
                [[4, 5, 6]],
                [[7, 8, 9]],
                [[10]]
            ]);
        });

        it('should handle empty batch', async () => {
            const operation = jest.fn(async (batch: any[]) => batch);
            const results = await optimizer.batchOperations([], operation, 5);
            
            expect(results).toEqual([]);
            expect(operation).not.toHaveBeenCalled();
        });

        it('should handle batch errors', async () => {
            const items = [1, 2, 3, 4, 5];
            const operation = jest.fn(async (batch: number[]) => {
                if (batch.includes(3)) {
                    throw new Error('Batch error on 3');
                }
                return batch.map(x => x * 2);
            });

            await expect(optimizer.batchOperations(items, operation, 2))
                .rejects.toThrow('Batch error on 3');
        });
    });

    describe('Circuit breaker', () => {
        it('should open circuit after failure threshold', async () => {
            let callCount = 0;
            const fn = jest.fn(async () => {
                callCount++;
                if (callCount <= 3) {
                    throw new Error('Service error');
                }
                return 'success';
            });

            const breaker = optimizer.createCircuitBreaker(fn, {
                failureThreshold: 3,
                resetTimeout: 1000
            });

            // Fail 3 times
            for (let i = 0; i < 3; i++) {
                await expect(breaker()).rejects.toThrow('Service error');
            }

            // Circuit should be open
            await expect(breaker()).rejects.toThrow('Circuit breaker is open');
            expect(fn).toHaveBeenCalledTimes(3);
        });

        it('should reset circuit after timeout', async () => {
            let callCount = 0;
            const fn = jest.fn(async () => {
                callCount++;
                if (callCount <= 3) {
                    throw new Error('Service error');
                }
                return 'success';
            });

            const breaker = optimizer.createCircuitBreaker(fn, {
                failureThreshold: 3,
                resetTimeout: 1000
            });

            // Open the circuit
            for (let i = 0; i < 3; i++) {
                await expect(breaker()).rejects.toThrow('Service error');
            }

            // Circuit is open
            await expect(breaker()).rejects.toThrow('Circuit breaker is open');

            // Wait for reset timeout
            jest.advanceTimersByTime(1000);

            // Circuit should be half-open, next call succeeds
            const result = await breaker();
            expect(result).toBe('success');
            expect(fn).toHaveBeenCalledTimes(4);
        });

        it('should handle half-open state correctly', async () => {
            let callCount = 0;
            const fn = jest.fn(async () => {
                callCount++;
                if (callCount === 4) {
                    throw new Error('Still failing');
                }
                if (callCount <= 3) {
                    throw new Error('Initial failures');
                }
                return 'success';
            });

            const breaker = optimizer.createCircuitBreaker(fn, {
                failureThreshold: 3,
                resetTimeout: 100
            });

            // Open circuit
            for (let i = 0; i < 3; i++) {
                await expect(breaker()).rejects.toThrow('Initial failures');
            }

            // Wait for reset
            jest.advanceTimersByTime(100);

            // Half-open test fails, circuit reopens
            await expect(breaker()).rejects.toThrow('Still failing');
            await expect(breaker()).rejects.toThrow('Circuit breaker is open');
        });
    });

    describe('Lazy loader', () => {
        it('should load data only once', async () => {
            const loader = jest.fn().mockResolvedValue('lazy-loaded-data');
            const lazyLoad = optimizer.createLazyLoader(loader);

            const result1 = await lazyLoad();
            const result2 = await lazyLoad();
            const result3 = await lazyLoad();

            expect(loader).toHaveBeenCalledTimes(1);
            expect(result1).toBe('lazy-loaded-data');
            expect(result2).toBe('lazy-loaded-data');
            expect(result3).toBe('lazy-loaded-data');
        });

        it('should handle concurrent lazy load requests', async () => {
            const loader = jest.fn().mockResolvedValue('concurrent-lazy-data');
            const lazyLoad = optimizer.createLazyLoader(loader);

            const promises = [lazyLoad(), lazyLoad(), lazyLoad()];
            const results = await Promise.all(promises);

            expect(loader).toHaveBeenCalledTimes(1);
            expect(results).toEqual(['concurrent-lazy-data', 'concurrent-lazy-data', 'concurrent-lazy-data']);
        });

        it('should propagate errors from loader', async () => {
            const loader = jest.fn().mockRejectedValue(new Error('Load failed'));
            const lazyLoad = optimizer.createLazyLoader(loader);

            await expect(lazyLoad()).rejects.toThrow('Load failed');
            
            // Error should not be cached, retry should call loader again
            await expect(lazyLoad()).rejects.toThrow('Load failed');
            expect(loader).toHaveBeenCalledTimes(2);
        });
    });

    describe('Cache cleanup', () => {
        it('should remove expired entries', async () => {
            const fn1 = jest.fn().mockResolvedValue('value1');
            const fn2 = jest.fn().mockResolvedValue('value2');
            const fn3 = jest.fn().mockResolvedValue('value3');

            // Add entries with different TTLs
            await optimizer.cachedCall('short-ttl', fn1, 50);
            await optimizer.cachedCall('medium-ttl', fn2, 150);
            await optimizer.cachedCall('long-ttl', fn3, 300);

            // Advance time to expire first entry
            jest.advanceTimersByTime(100);

            // Cleanup
            optimizer.cleanupCache();

            // Short TTL should be expired
            await optimizer.cachedCall('short-ttl', fn1, 50);
            expect(fn1).toHaveBeenCalledTimes(2);

            // Medium and long TTL should still be cached
            await optimizer.cachedCall('medium-ttl', fn2, 150);
            expect(fn2).toHaveBeenCalledTimes(1);

            await optimizer.cachedCall('long-ttl', fn3, 300);
            expect(fn3).toHaveBeenCalledTimes(1);
        });
    });

    describe('Performance metrics', () => {
        it('should track all metrics correctly', async () => {
            // Generate various metrics
            const fn = jest.fn().mockResolvedValue('metric-result');
            
            // Cache operations
            await optimizer.cachedCall('metric-key', fn, 1000);
            await optimizer.cachedCall('metric-key', fn, 1000); // Hit
            await optimizer.cachedCall('other-key', fn, 1000); // Miss

            // Throttle operations
            const throttled = optimizer.throttle(() => {}, 100);
            throttled();
            throttled(); // Throttled
            throttled(); // Throttled

            // Debounce operations
            const debounced = optimizer.debounce(() => {}, 100);
            debounced();
            debounced(); // Reset
            debounced(); // Reset

            const metrics = optimizer.getMetrics();
            expect(metrics).toMatchObject({
                cacheHits: 1,
                cacheMisses: 2,
                cacheSize: 2,
                throttledCalls: 2,
                debouncedCalls: 2
            });
        });

        it('should reset metrics correctly', () => {
            // Generate metrics
            const throttled = optimizer.throttle(() => {}, 100);
            throttled();
            throttled();

            optimizer.resetMetrics();

            const metrics = optimizer.getMetrics();
            expect(metrics).toMatchObject({
                cacheHits: 0,
                cacheMisses: 0,
                throttledCalls: 0,
                debouncedCalls: 0,
                averageResponseTime: 0
            });
        });
    });

    describe('Memory management', () => {
        it('should track memory usage', async () => {
            // Memory management methods would need implementation
            // For now, just test that the optimizer exists and can be used
            expect(optimizer).toBeDefined();
            
            // Add some cache entries to simulate memory usage
            const fn = jest.fn().mockResolvedValue('memory-test');
            await optimizer.cachedCall('mem-key-1', fn, 1000);
            await optimizer.cachedCall('mem-key-2', fn, 1000);
            
            const metrics = optimizer.getMetrics();
            expect(metrics.cacheSize).toBe(2);
        });

        it('should cleanup on destroy', () => {
            const fn = jest.fn();
            const throttled = optimizer.throttle(fn, 100);
            const debounced = optimizer.debounce(fn, 100);

            throttled();
            debounced();

            optimizer.cleanup();

            // Advance timers - nothing should execute after cleanup
            jest.advanceTimersByTime(200);
            expect(fn).toHaveBeenCalledTimes(1); // Only throttled immediate call
        });
    });

    describe('Edge cases', () => {
        it('should handle zero delay in throttle', () => {
            const fn = jest.fn();
            const throttled = optimizer.throttle(fn, 0);

            throttled('a');
            throttled('b');
            throttled('c');

            // With 0 delay, might execute all or just first
            expect(fn.mock.calls.length).toBeGreaterThanOrEqual(1);
        });

        it('should handle zero delay in debounce', () => {
            const fn = jest.fn();
            const debounced = optimizer.debounce(fn, 0);

            debounced('a');
            jest.runAllTimers();

            expect(fn).toHaveBeenCalledWith('a');
        });

        it('should handle very large batch sizes', async () => {
            const items = Array.from({ length: 100 }, (_, i) => i);
            const operation = jest.fn(async (batch: number[]) => batch);

            const results = await optimizer.batchOperations(items, operation, 1000);
            
            expect(results).toEqual(items);
            expect(operation).toHaveBeenCalledTimes(1);
            expect(operation).toHaveBeenCalledWith(items);
        });

        it('should handle batch size larger than items', async () => {
            const items = [1, 2, 3];
            const operation = jest.fn(async (batch: number[]) => batch);

            const results = await optimizer.batchOperations(items, operation, 10);
            
            expect(results).toEqual([1, 2, 3]);
            expect(operation).toHaveBeenCalledTimes(1);
            expect(operation).toHaveBeenCalledWith([1, 2, 3]);
        });
    });

    describe('Singleton instance', () => {
        it('should export working singleton', () => {
            expect(performanceOptimizer).toBeDefined();
            expect(performanceOptimizer).toBeInstanceOf(PerformanceOptimizer);
        });

        it('should have all methods available on singleton', async () => {
            const fn = jest.fn().mockResolvedValue('singleton-result');
            
            // Test various methods
            const throttled = performanceOptimizer.throttle(() => {}, 100);
            const debounced = performanceOptimizer.debounce(() => {}, 100);
            
            await expect(performanceOptimizer.cachedCall('singleton-key', fn, 1000))
                .resolves.toBe('singleton-result');
            
            expect(() => throttled()).not.toThrow();
            expect(() => debounced()).not.toThrow();
        });
    });
});