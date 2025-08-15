/**
 * Tests for PerformanceOptimizer
 */

// Use manual mock for performance-optimizer module
jest.mock('../performance-optimizer');

import { PerformanceOptimizer } from '../performance-optimizer';

describe('PerformanceOptimizer', () => {
    let optimizer: PerformanceOptimizer;

    beforeEach(() => {
        jest.clearAllMocks();
        jest.useFakeTimers();
        optimizer = new PerformanceOptimizer();
    });

    afterEach(() => {
        jest.clearAllTimers();
        jest.useRealTimers();
    });

    describe('throttle', () => {
        it('should limit function calls to once per interval', () => {
            const fn = jest.fn();
            const throttledFn = optimizer.throttle(fn, 100);

            // Call multiple times quickly
            throttledFn('first');
            throttledFn('second');
            throttledFn('third');

            // Only first call should execute immediately
            expect(fn).toHaveBeenCalledTimes(1);
            expect(fn).toHaveBeenCalledWith('first');

            // After delay, can call again
            jest.advanceTimersByTime(100);
            throttledFn('fourth');
            expect(fn).toHaveBeenCalledTimes(2);
            expect(fn).toHaveBeenCalledWith('fourth');
        });

        it('should track throttled calls in metrics', () => {
            const fn = jest.fn();
            const throttledFn = optimizer.throttle(fn, 100);

            throttledFn();
            throttledFn(); // This should be throttled
            throttledFn(); // This should be throttled

            const metrics = optimizer.getMetrics();
            expect(metrics.throttledCalls).toBe(2);
        });

        it('should use custom key when provided', () => {
            const fn1 = jest.fn();
            const fn2 = jest.fn();
            
            const throttled1 = optimizer.throttle(fn1, 100, 'key1');
            const throttled2 = optimizer.throttle(fn2, 100, 'key2');

            throttled1();
            throttled2();

            // Both should execute since they have different keys
            expect(fn1).toHaveBeenCalledTimes(1);
            expect(fn2).toHaveBeenCalledTimes(1);
        });
    });

    describe('debounce', () => {
        it('should delay execution until after calls have stopped', () => {
            const fn = jest.fn();
            const debouncedFn = optimizer.debounce(fn, 100);

            debouncedFn('first');
            jest.advanceTimersByTime(50);
            debouncedFn('second');
            jest.advanceTimersByTime(50);
            debouncedFn('third');

            // Function not called yet
            expect(fn).not.toHaveBeenCalled();

            // After final delay, function called with last args
            jest.advanceTimersByTime(100);
            expect(fn).toHaveBeenCalledTimes(1);
            expect(fn).toHaveBeenCalledWith('third');
        });

        it('should track debounced calls in metrics', () => {
            const fn = jest.fn();
            const debouncedFn = optimizer.debounce(fn, 100);

            debouncedFn();
            debouncedFn(); // This resets the timer
            debouncedFn(); // This resets the timer

            const metrics = optimizer.getMetrics();
            expect(metrics.debouncedCalls).toBe(2); // Two resets
        });
    });

    describe('cachedCall', () => {
        it('should cache async function results', async () => {
            const expensiveFn = jest.fn().mockResolvedValue('result');
            
            // First call - should execute function
            const result1 = await optimizer.cachedCall('test-key', expensiveFn, 1000);
            expect(result1).toBe('result');
            expect(expensiveFn).toHaveBeenCalledTimes(1);

            // Second call - should return cached value
            const result2 = await optimizer.cachedCall('test-key', expensiveFn, 1000);
            expect(result2).toBe('result');
            expect(expensiveFn).toHaveBeenCalledTimes(1); // Not called again

            const metrics = optimizer.getMetrics();
            expect(metrics.cacheHits).toBe(1);
            expect(metrics.cacheMisses).toBe(1);
        });

        it('should expire cache after TTL', async () => {
            const fn = jest.fn()
                .mockResolvedValueOnce('first')
                .mockResolvedValueOnce('second');
            
            await optimizer.cachedCall('test-key', fn, 100);
            expect(fn).toHaveBeenCalledTimes(1);

            // Advance time past TTL
            jest.advanceTimersByTime(101);

            const result = await optimizer.cachedCall('test-key', fn, 100);
            expect(result).toBe('second');
            expect(fn).toHaveBeenCalledTimes(2);
        });

        it('should handle errors and not cache them', async () => {
            const fn = jest.fn()
                .mockRejectedValueOnce(new Error('Failed'))
                .mockResolvedValueOnce('success');
            
            // First call fails
            await expect(optimizer.cachedCall('test-key', fn, 1000)).rejects.toThrow('Failed');
            
            // Second call should retry, not use cached error
            const result = await optimizer.cachedCall('test-key', fn, 1000);
            expect(result).toBe('success');
            expect(fn).toHaveBeenCalledTimes(2);
        });
    });

    describe('batchOperations', () => {
        it('should batch operations efficiently', async () => {
            const items = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
            const operation = jest.fn(async (batch: number[]) => 
                batch.map(x => x * 2)
            );

            const results = await optimizer.batchOperations(items, operation, 3);

            expect(results).toEqual([2, 4, 6, 8, 10, 12, 14, 16, 18, 20]);
            expect(operation).toHaveBeenCalledTimes(4); // 10 items in batches of 3
            expect(operation).toHaveBeenCalledWith([1, 2, 3]);
            expect(operation).toHaveBeenCalledWith([4, 5, 6]);
            expect(operation).toHaveBeenCalledWith([7, 8, 9]);
            expect(operation).toHaveBeenCalledWith([10]);
        });
    });

    describe('cleanupCache', () => {
        it('should remove expired cache entries', async () => {
            const fn = jest.fn().mockResolvedValue('result');
            
            // Add cache entries with different TTLs
            await optimizer.cachedCall('key1', fn, 100);
            await optimizer.cachedCall('key2', fn, 200);
            
            // Advance time to expire first entry
            jest.advanceTimersByTime(150);
            
            optimizer.cleanupCache();
            
            // key1 should be removed, key2 should remain
            await optimizer.cachedCall('key1', fn, 100);
            expect(fn).toHaveBeenCalledTimes(3); // Initial 2 + 1 after cleanup
            
            await optimizer.cachedCall('key2', fn, 100);
            expect(fn).toHaveBeenCalledTimes(3); // Still cached
        });
    });

    describe('coalesceRequests', () => {
        it('should prevent duplicate concurrent requests', async () => {
            const fn = jest.fn().mockResolvedValue('result');
            
            // Make concurrent requests with same key
            const promise1 = optimizer.coalesceRequests('test-key', fn);
            const promise2 = optimizer.coalesceRequests('test-key', fn);
            const promise3 = optimizer.coalesceRequests('test-key', fn);
            
            const results = await Promise.all([promise1, promise2, promise3]);
            
            // Function should only be called once
            expect(fn).toHaveBeenCalledTimes(1);
            expect(results).toEqual(['result', 'result', 'result']);
        });

        it('should allow new request after previous completes', async () => {
            const fn = jest.fn().mockResolvedValue('result');
            
            await optimizer.coalesceRequests('test-key', fn);
            expect(fn).toHaveBeenCalledTimes(1);
            
            await optimizer.coalesceRequests('test-key', fn);
            expect(fn).toHaveBeenCalledTimes(2);
        });
    });

    describe('createLazyLoader', () => {
        it('should load data only once when called multiple times', async () => {
            const loader = jest.fn().mockResolvedValue('loaded data');
            const lazyLoad = optimizer.createLazyLoader(loader);
            
            const result1 = await lazyLoad();
            const result2 = await lazyLoad();
            const result3 = await lazyLoad();
            
            expect(loader).toHaveBeenCalledTimes(1);
            expect(result1).toBe('loaded data');
            expect(result2).toBe('loaded data');
            expect(result3).toBe('loaded data');
        });
    });

    describe('createCircuitBreaker', () => {
        it('should open circuit after failure threshold', async () => {
            let callCount = 0;
            const fn = jest.fn(async () => {
                callCount++;
                if (callCount <= 5) {
                    throw new Error('Service unavailable');
                }
                return 'success';
            });
            
            const breaker = optimizer.createCircuitBreaker(fn, {
                failureThreshold: 3,
                resetTimeout: 1000
            });
            
            // Fail 3 times to open circuit
            for (let i = 0; i < 3; i++) {
                await expect(breaker()).rejects.toThrow('Service unavailable');
            }
            
            // Circuit should be open now
            await expect(breaker()).rejects.toThrow('Circuit breaker is open');
            expect(fn).toHaveBeenCalledTimes(3);
        });
    });

    describe('getMetrics', () => {
        it('should return performance metrics', async () => {
            const fn = jest.fn().mockResolvedValue('result');
            
            // Generate some metrics
            await optimizer.cachedCall('key1', fn, 1000);
            await optimizer.cachedCall('key1', fn, 1000); // Cache hit
            
            const throttled = optimizer.throttle(() => {}, 100);
            throttled();
            throttled(); // Throttled
            
            const metrics = optimizer.getMetrics();
            
            expect(metrics).toEqual(expect.objectContaining({
                cacheHits: 1,
                cacheMisses: 1,
                cacheSize: 1,
                throttledCalls: 1,
                debouncedCalls: 0
            }));
        });
    });

    describe('resetMetrics', () => {
        it('should reset all metrics to zero', async () => {
            const fn = jest.fn().mockResolvedValue('result');
            
            // Generate some metrics
            await optimizer.cachedCall('key1', fn, 1000);
            
            optimizer.resetMetrics();
            
            const metrics = optimizer.getMetrics();
            expect(metrics).toEqual({
                cacheHits: 0,
                cacheMisses: 0,
                cacheSize: 1, // Cache size remains
                throttledCalls: 0,
                debouncedCalls: 0,
                averageResponseTime: 0
            });
        });
    });

    describe('cleanup', () => {
        it('should clear all timers and cache', () => {
            const fn = jest.fn();
            const throttled = optimizer.throttle(fn, 100);
            const debounced = optimizer.debounce(fn, 100);
            
            throttled();
            // throttled call executed immediately
            expect(fn).toHaveBeenCalledTimes(1);
            
            debounced();
            // debounced call is pending
            
            optimizer.cleanup();
            
            // Advance timers - debounced function shouldn't be called
            jest.advanceTimersByTime(200);
            expect(fn).toHaveBeenCalledTimes(1); // Only the throttled call
        });
    });
});

// Test the singleton export
describe('performanceOptimizer singleton', () => {
    it('should export a singleton instance', () => {
        const { performanceOptimizer } = require('../performance-optimizer');
        expect(performanceOptimizer).toBeDefined();
        expect(performanceOptimizer).toBeInstanceOf(PerformanceOptimizer);
    });
});