/**
 * Performance optimization utilities for the Stream Deck plugin.
 * Provides throttling, debouncing, caching, and other performance enhancements.
 */

import streamDeck from '@elgato/streamdeck';

/**
 * Cache entry with expiration support.
 */
interface CacheEntry<T> {
    value: T;
    expires: number;
    hits: number;
}

/**
 * Performance metrics for monitoring.
 */
export interface PerformanceMetrics {
    cacheHits: number;
    cacheMisses: number;
    cacheSize: number;
    throttledCalls: number;
    debouncedCalls: number;
    averageResponseTime: number;
}

/**
 * Performance optimizer for Stream Deck plugin operations.
 */
export class PerformanceOptimizer {
    private cache = new Map<string, CacheEntry<any>>();
    private throttleTimers = new Map<string, NodeJS.Timeout>();
    private debounceTimers = new Map<string, NodeJS.Timeout>();
    private metrics: PerformanceMetrics = {
        cacheHits: 0,
        cacheMisses: 0,
        cacheSize: 0,
        throttledCalls: 0,
        debouncedCalls: 0,
        averageResponseTime: 0
    };
    private responseTimes: number[] = [];
    private readonly MAX_RESPONSE_TIME_SAMPLES = 100;
    private readonly MAX_CACHE_SIZE = 100;
    private logger = streamDeck.logger.createScope('PerformanceOptimizer');

    /**
     * Throttle function calls to limit execution frequency.
     * Ensures function is called at most once per interval.
     */
    throttle<T extends (...args: any[]) => any>(
        fn: T,
        delay: number,
        key?: string
    ): (...args: Parameters<T>) => void {
        const throttleKey = key || fn.toString();
        
        return (...args: Parameters<T>) => {
            if (this.throttleTimers.has(throttleKey)) {
                this.metrics.throttledCalls++;
                return;
            }

            fn(...args);
            
            const timer = setTimeout(() => {
                this.throttleTimers.delete(throttleKey);
            }, delay);
            
            this.throttleTimers.set(throttleKey, timer);
        };
    }

    /**
     * Debounce function calls to delay execution until after calls have stopped.
     * Useful for search inputs or resize events.
     */
    debounce<T extends (...args: any[]) => any>(
        fn: T,
        delay: number,
        key?: string
    ): (...args: Parameters<T>) => void {
        const debounceKey = key || fn.toString();
        
        return (...args: Parameters<T>) => {
            const existing = this.debounceTimers.get(debounceKey);
            if (existing) {
                clearTimeout(existing);
                this.metrics.debouncedCalls++;
            }

            const timer = setTimeout(() => {
                fn(...args);
                this.debounceTimers.delete(debounceKey);
            }, delay);
            
            this.debounceTimers.set(debounceKey, timer);
        };
    }

    /**
     * Cache function results with TTL support.
     */
    async cachedCall<T>(
        key: string,
        fn: () => Promise<T>,
        ttl: number = 60000 // Default 1 minute
    ): Promise<T> {
        const now = Date.now();
        
        // Check cache
        const cached = this.cache.get(key);
        if (cached && cached.expires > now) {
            cached.hits++;
            this.metrics.cacheHits++;
            this.logger.debug('Cache hit', { key, hits: cached.hits });
            return cached.value;
        }

        // Cache miss - execute function
        this.metrics.cacheMisses++;
        const startTime = performance.now();
        
        try {
            const value = await fn();
            const responseTime = performance.now() - startTime;
            this.recordResponseTime(responseTime);
            
            // Store in cache
            this.setCache(key, value, ttl);
            
            return value;
        } catch (error) {
            // Don't cache errors
            this.logger.error('Cached call failed', { key, error });
            throw error;
        }
    }

    /**
     * Batch multiple operations for efficiency.
     */
    async batchOperations<T, R>(
        items: T[],
        operation: (batch: T[]) => Promise<R[]>,
        batchSize: number = 10
    ): Promise<R[]> {
        const results: R[] = [];
        
        for (let i = 0; i < items.length; i += batchSize) {
            const batch = items.slice(i, i + batchSize);
            const batchResults = await operation(batch);
            results.push(...batchResults);
        }
        
        return results;
    }

    /**
     * Implement request coalescing to prevent duplicate concurrent requests.
     */
    private pendingRequests = new Map<string, Promise<any>>();
    
    async coalesceRequests<T>(
        key: string,
        fn: () => Promise<T>
    ): Promise<T> {
        // Check if request is already pending
        const pending = this.pendingRequests.get(key);
        if (pending) {
            this.logger.debug('Coalescing request', { key });
            return pending;
        }

        // Start new request
        const promise = fn().finally(() => {
            this.pendingRequests.delete(key);
        });
        
        this.pendingRequests.set(key, promise);
        return promise;
    }

    /**
     * Lazy load data only when needed.
     */
    createLazyLoader<T>(loader: () => Promise<T>): () => Promise<T> {
        let loaded = false;
        let value: T;
        let loadPromise: Promise<T> | null = null;

        return async () => {
            if (loaded) {
                return value;
            }

            if (loadPromise) {
                return loadPromise;
            }

            loadPromise = loader().then(result => {
                value = result;
                loaded = true;
                loadPromise = null;
                return result;
            });

            return loadPromise;
        };
    }

    /**
     * Implement circuit breaker pattern for failing services.
     */
    createCircuitBreaker<T>(
        fn: () => Promise<T>,
        options: {
            failureThreshold?: number;
            resetTimeout?: number;
            halfOpenRequests?: number;
        } = {}
    ): () => Promise<T> {
        const { 
            failureThreshold = 5, 
            resetTimeout = 60000,
            halfOpenRequests = 1 
        } = options;

        let failures = 0;
        let state: 'closed' | 'open' | 'half-open' = 'closed';
        let nextAttempt = 0;
        let halfOpenAttempts = 0;

        return async () => {
            const now = Date.now();

            // Circuit is open
            if (state === 'open') {
                if (now < nextAttempt) {
                    throw new Error('Circuit breaker is open');
                }
                state = 'half-open';
                halfOpenAttempts = 0;
            }

            // Circuit is half-open
            if (state === 'half-open') {
                halfOpenAttempts++;
                if (halfOpenAttempts > halfOpenRequests) {
                    state = 'open';
                    nextAttempt = now + resetTimeout;
                    throw new Error('Circuit breaker is open');
                }
            }

            try {
                const result = await fn();
                
                // Success - reset circuit
                if (state === 'half-open' || failures > 0) {
                    failures = 0;
                    state = 'closed';
                    this.logger.info('Circuit breaker reset');
                }
                
                return result;
            } catch (error) {
                failures++;
                
                if (failures >= failureThreshold) {
                    state = 'open';
                    nextAttempt = now + resetTimeout;
                    this.logger.warn('Circuit breaker opened', { failures });
                }
                
                throw error;
            }
        };
    }

    /**
     * Set cache entry with size management.
     */
    private setCache<T>(key: string, value: T, ttl: number): void {
        // Implement LRU eviction if cache is too large
        if (this.cache.size >= this.MAX_CACHE_SIZE) {
            // Find least recently used entry
            let lruKey: string | null = null;
            let minHits = Infinity;
            
            for (const [k, entry] of this.cache.entries()) {
                if (entry.hits < minHits) {
                    minHits = entry.hits;
                    lruKey = k;
                }
            }
            
            if (lruKey) {
                this.cache.delete(lruKey);
                this.logger.debug('Evicted cache entry', { key: lruKey });
            }
        }

        this.cache.set(key, {
            value,
            expires: Date.now() + ttl,
            hits: 0
        });
        
        this.metrics.cacheSize = this.cache.size;
    }

    /**
     * Clear expired cache entries.
     */
    cleanupCache(): void {
        const now = Date.now();
        let removed = 0;
        
        for (const [key, entry] of this.cache.entries()) {
            if (entry.expires <= now) {
                this.cache.delete(key);
                removed++;
            }
        }
        
        if (removed > 0) {
            this.logger.debug('Cleaned up cache', { removed });
            this.metrics.cacheSize = this.cache.size;
        }
    }

    /**
     * Record response time for metrics.
     */
    private recordResponseTime(time: number): void {
        this.responseTimes.push(time);
        
        if (this.responseTimes.length > this.MAX_RESPONSE_TIME_SAMPLES) {
            this.responseTimes.shift();
        }
        
        // Update average
        const sum = this.responseTimes.reduce((a, b) => a + b, 0);
        this.metrics.averageResponseTime = sum / this.responseTimes.length;
    }

    /**
     * Get current performance metrics.
     */
    getMetrics(): PerformanceMetrics {
        return { ...this.metrics };
    }

    /**
     * Reset all performance metrics.
     */
    resetMetrics(): void {
        this.metrics = {
            cacheHits: 0,
            cacheMisses: 0,
            cacheSize: this.cache.size,
            throttledCalls: 0,
            debouncedCalls: 0,
            averageResponseTime: 0
        };
        this.responseTimes = [];
    }

    /**
     * Clear all caches and timers.
     */
    cleanup(): void {
        this.cache.clear();
        
        for (const timer of this.throttleTimers.values()) {
            clearTimeout(timer);
        }
        this.throttleTimers.clear();
        
        for (const timer of this.debounceTimers.values()) {
            clearTimeout(timer);
        }
        this.debounceTimers.clear();
        
        this.pendingRequests.clear();
        this.resetMetrics();
    }
}

// Create singleton instance
export const performanceOptimizer = new PerformanceOptimizer();