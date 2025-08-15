/**
 * Memory leak detection utility for Stream Deck plugin.
 * Monitors memory usage patterns and detects potential leaks.
 */

import streamDeck from '@elgato/streamdeck';

interface MemorySnapshot {
    timestamp: number;
    heapUsed: number;
    heapTotal: number;
    rss: number;
    external: number;
    arrayBuffers: number;
}

interface LeakDetectionResult {
    hasLeak: boolean;
    severity: 'none' | 'low' | 'medium' | 'high';
    message: string;
    growthRate: number;
    recommendations: string[];
}

export class MemoryLeakDetector {
    private snapshots: MemorySnapshot[] = [];
    private readonly MAX_SNAPSHOTS = 20;
    private readonly SNAPSHOT_INTERVAL = 30000; // 30 seconds
    private readonly LEAK_THRESHOLD_MB = 10; // 10MB growth
    private readonly LEAK_RATE_THRESHOLD = 0.5; // 500KB/minute
    private monitorTimer?: NodeJS.Timeout;
    private logger = streamDeck.logger.createScope('MemoryLeakDetector');

    /**
     * Start monitoring memory usage.
     */
    startMonitoring(): void {
        if (this.monitorTimer) {
            this.logger.warn('Memory monitoring already active');
            return;
        }

        this.logger.info('Starting memory leak detection');
        this.takeSnapshot();

        this.monitorTimer = setInterval(() => {
            this.takeSnapshot();
            this.analyzeMemoryPattern();
        }, this.SNAPSHOT_INTERVAL);
    }

    /**
     * Stop monitoring memory usage.
     */
    stopMonitoring(): void {
        if (this.monitorTimer) {
            clearInterval(this.monitorTimer);
            this.monitorTimer = undefined;
            this.logger.info('Stopped memory leak detection');
        }
    }

    /**
     * Take a memory snapshot.
     */
    private takeSnapshot(): void {
        const memUsage = process.memoryUsage();
        
        const snapshot: MemorySnapshot = {
            timestamp: Date.now(),
            heapUsed: memUsage.heapUsed,
            heapTotal: memUsage.heapTotal,
            rss: memUsage.rss,
            external: memUsage.external,
            arrayBuffers: memUsage.arrayBuffers
        };

        this.snapshots.push(snapshot);

        // Keep only the most recent snapshots
        if (this.snapshots.length > this.MAX_SNAPSHOTS) {
            this.snapshots.shift();
        }

        this.logger.debug('Memory snapshot taken', {
            heapUsedMB: Math.round(snapshot.heapUsed / 1024 / 1024),
            rssMB: Math.round(snapshot.rss / 1024 / 1024)
        });
    }

    /**
     * Analyze memory pattern for potential leaks.
     */
    private analyzeMemoryPattern(): LeakDetectionResult {
        if (this.snapshots.length < 3) {
            return {
                hasLeak: false,
                severity: 'none',
                message: 'Not enough data for analysis',
                growthRate: 0,
                recommendations: []
            };
        }

        const first = this.snapshots[0];
        const last = this.snapshots[this.snapshots.length - 1];
        const timeDiffMinutes = (last.timestamp - first.timestamp) / 60000;

        // Calculate growth
        const heapGrowthMB = (last.heapUsed - first.heapUsed) / 1024 / 1024;
        const growthRateMBPerMin = heapGrowthMB / timeDiffMinutes;

        // Check for consistent growth pattern
        const isConsistentGrowth = this.checkConsistentGrowth();
        
        // Determine if there's a leak
        const result: LeakDetectionResult = {
            hasLeak: false,
            severity: 'none',
            message: 'Memory usage is stable',
            growthRate: growthRateMBPerMin,
            recommendations: []
        };

        if (heapGrowthMB > this.LEAK_THRESHOLD_MB && isConsistentGrowth) {
            result.hasLeak = true;
            
            if (growthRateMBPerMin > 1) {
                result.severity = 'high';
                result.message = `Critical memory leak detected: ${growthRateMBPerMin.toFixed(2)} MB/min`;
                result.recommendations = [
                    'Check for uncleared timers or intervals',
                    'Verify event listeners are properly removed',
                    'Look for growing arrays or maps',
                    'Check for circular references'
                ];
            } else if (growthRateMBPerMin > 0.5) {
                result.severity = 'medium';
                result.message = `Memory leak detected: ${growthRateMBPerMin.toFixed(2)} MB/min`;
                result.recommendations = [
                    'Review cache management',
                    'Check for accumulating action instances',
                    'Verify proper cleanup in onWillDisappear'
                ];
            } else {
                result.severity = 'low';
                result.message = `Possible memory leak: ${growthRateMBPerMin.toFixed(2)} MB/min`;
                result.recommendations = [
                    'Monitor memory usage over longer period',
                    'Consider implementing cache limits'
                ];
            }

            this.logger.error('Memory leak detected', result);
        }

        return result;
    }

    /**
     * Check if memory growth is consistent (indicating a leak).
     */
    private checkConsistentGrowth(): boolean {
        if (this.snapshots.length < 3) {
            return false;
        }

        let growthCount = 0;
        for (let i = 1; i < this.snapshots.length; i++) {
            if (this.snapshots[i].heapUsed > this.snapshots[i - 1].heapUsed) {
                growthCount++;
            }
        }

        // If more than 70% of snapshots show growth, it's likely a leak
        return growthCount / (this.snapshots.length - 1) > 0.7;
    }

    /**
     * Get current memory statistics.
     */
    getMemoryStats(): {
        current: MemorySnapshot;
        trend: 'increasing' | 'decreasing' | 'stable';
        averageHeapMB: number;
        peakHeapMB: number;
    } {
        const current = process.memoryUsage();
        const currentSnapshot: MemorySnapshot = {
            timestamp: Date.now(),
            heapUsed: current.heapUsed,
            heapTotal: current.heapTotal,
            rss: current.rss,
            external: current.external,
            arrayBuffers: current.arrayBuffers
        };

        let trend: 'increasing' | 'decreasing' | 'stable' = 'stable';
        if (this.snapshots.length > 1) {
            const recent = this.snapshots.slice(-5);
            const firstRecent = recent[0];
            const lastRecent = recent[recent.length - 1];
            const diff = lastRecent.heapUsed - firstRecent.heapUsed;
            
            if (diff > 1024 * 1024) { // > 1MB
                trend = 'increasing';
            } else if (diff < -1024 * 1024) { // < -1MB
                trend = 'decreasing';
            }
        }

        const heapValues = this.snapshots.map(s => s.heapUsed);
        const averageHeap = heapValues.reduce((a, b) => a + b, 0) / heapValues.length || 0;
        const peakHeap = Math.max(...heapValues, 0);

        return {
            current: currentSnapshot,
            trend,
            averageHeapMB: averageHeap / 1024 / 1024,
            peakHeapMB: peakHeap / 1024 / 1024
        };
    }

    /**
     * Force garbage collection if available and analyze impact.
     */
    forceGCAndAnalyze(): {
        collected: boolean;
        freedMemoryMB: number;
    } {
        const before = process.memoryUsage().heapUsed;
        
        // Force GC if available (requires --expose-gc flag)
        if (global.gc) {
            global.gc();
            
            const after = process.memoryUsage().heapUsed;
            const freedBytes = before - after;
            const freedMB = freedBytes / 1024 / 1024;
            
            this.logger.info(`Garbage collection freed ${freedMB.toFixed(2)} MB`);
            
            return {
                collected: true,
                freedMemoryMB: freedMB
            };
        }
        
        return {
            collected: false,
            freedMemoryMB: 0
        };
    }

    /**
     * Get leak detection report.
     */
    getReport(): string {
        const stats = this.getMemoryStats();
        const analysis = this.analyzeMemoryPattern();
        
        const report = [
            '=== Memory Leak Detection Report ===',
            `Current Heap: ${(stats.current.heapUsed / 1024 / 1024).toFixed(2)} MB`,
            `Average Heap: ${stats.averageHeapMB.toFixed(2)} MB`,
            `Peak Heap: ${stats.peakHeapMB.toFixed(2)} MB`,
            `Memory Trend: ${stats.trend}`,
            `Leak Status: ${analysis.hasLeak ? 'DETECTED' : 'None'}`,
            `Severity: ${analysis.severity}`,
            `Growth Rate: ${analysis.growthRate.toFixed(3)} MB/min`,
            '',
            'Recommendations:',
            ...analysis.recommendations.map(r => `  - ${r}`)
        ];
        
        return report.join('\n');
    }
}

// Singleton instance
export const memoryLeakDetector = new MemoryLeakDetector();