/**
 * Memory profiling script for the Azure DevOps Stream Deck plugin.
 * Monitors memory usage and helps identify potential leaks.
 */

const v8 = require('v8');
const { performance } = require('perf_hooks');

class MemoryProfiler {
    constructor() {
        this.snapshots = [];
        this.startTime = Date.now();
        this.gcStats = {
            minor: 0,
            major: 0,
            incremental: 0,
            weakcb: 0
        };
    }

    /**
     * Take a heap snapshot and store metrics.
     */
    takeSnapshot(label = '') {
        // Force garbage collection if available
        if (global.gc) {
            global.gc();
        }

        const heapStats = v8.getHeapStatistics();
        const heapSpaceStats = v8.getHeapSpaceStatistics();
        
        const snapshot = {
            label,
            timestamp: Date.now() - this.startTime,
            memory: process.memoryUsage(),
            heap: {
                totalHeapSize: heapStats.total_heap_size,
                totalHeapSizeExecutable: heapStats.total_heap_size_executable,
                totalPhysicalSize: heapStats.total_physical_size,
                totalAvailableSize: heapStats.total_available_size,
                usedHeapSize: heapStats.used_heap_size,
                heapSizeLimit: heapStats.heap_size_limit,
                mallocedMemory: heapStats.malloced_memory,
                peakMallocedMemory: heapStats.peak_malloced_memory,
                doesZapGarbage: heapStats.does_zap_garbage
            },
            spaces: heapSpaceStats
        };

        this.snapshots.push(snapshot);
        return snapshot;
    }

    /**
     * Compare two snapshots to identify memory growth.
     */
    compareSnapshots(index1, index2) {
        const snap1 = this.snapshots[index1];
        const snap2 = this.snapshots[index2];

        if (!snap1 || !snap2) {
            console.error('Invalid snapshot indices');
            return null;
        }

        return {
            timeDiff: snap2.timestamp - snap1.timestamp,
            heapUsedDiff: snap2.memory.heapUsed - snap1.memory.heapUsed,
            heapTotalDiff: snap2.memory.heapTotal - snap1.memory.heapTotal,
            rssDiff: snap2.memory.rss - snap1.memory.rss,
            externalDiff: snap2.memory.external - snap1.memory.external,
            arrayBuffersDiff: snap2.memory.arrayBuffers - snap1.memory.arrayBuffers
        };
    }

    /**
     * Analyze memory growth patterns.
     */
    analyzeGrowth() {
        if (this.snapshots.length < 2) {
            console.log('Not enough snapshots for analysis');
            return;
        }

        console.log('\n=== Memory Growth Analysis ===');
        
        for (let i = 1; i < this.snapshots.length; i++) {
            const comparison = this.compareSnapshots(i - 1, i);
            const snap = this.snapshots[i];
            
            console.log(`\n${snap.label || `Snapshot ${i}`}:`);
            console.log(`  Time elapsed: ${(comparison.timeDiff / 1000).toFixed(2)}s`);
            console.log(`  Heap used: ${this.formatBytes(snap.memory.heapUsed)} (${this.formatBytes(comparison.heapUsedDiff, true)})`);
            console.log(`  Heap total: ${this.formatBytes(snap.memory.heapTotal)} (${this.formatBytes(comparison.heapTotalDiff, true)})`);
            console.log(`  RSS: ${this.formatBytes(snap.memory.rss)} (${this.formatBytes(comparison.rssDiff, true)})`);
            
            // Check for potential leaks
            if (comparison.heapUsedDiff > 1024 * 1024) { // > 1MB growth
                console.log('  ⚠️  Significant memory growth detected');
            }
        }
    }

    /**
     * Monitor memory for a specific duration.
     */
    async monitor(durationMs = 60000, intervalMs = 5000) {
        console.log(`Starting memory monitoring for ${durationMs / 1000} seconds...`);
        
        this.takeSnapshot('Initial');
        
        const interval = setInterval(() => {
            this.takeSnapshot('Periodic');
        }, intervalMs);

        await new Promise(resolve => setTimeout(resolve, durationMs));
        
        clearInterval(interval);
        this.takeSnapshot('Final');
        
        this.analyzeGrowth();
        this.printSummary();
    }

    /**
     * Print a summary of memory usage.
     */
    printSummary() {
        if (this.snapshots.length === 0) {
            console.log('No snapshots available');
            return;
        }

        const first = this.snapshots[0];
        const last = this.snapshots[this.snapshots.length - 1];

        console.log('\n=== Memory Usage Summary ===');
        console.log(`Duration: ${(last.timestamp / 1000).toFixed(2)} seconds`);
        console.log(`Snapshots taken: ${this.snapshots.length}`);
        
        console.log('\nInitial Memory:');
        console.log(`  Heap Used: ${this.formatBytes(first.memory.heapUsed)}`);
        console.log(`  RSS: ${this.formatBytes(first.memory.rss)}`);
        
        console.log('\nFinal Memory:');
        console.log(`  Heap Used: ${this.formatBytes(last.memory.heapUsed)}`);
        console.log(`  RSS: ${this.formatBytes(last.memory.rss)}`);
        
        console.log('\nTotal Growth:');
        console.log(`  Heap Used: ${this.formatBytes(last.memory.heapUsed - first.memory.heapUsed, true)}`);
        console.log(`  RSS: ${this.formatBytes(last.memory.rss - first.memory.rss, true)}`);

        // Find peak memory usage
        let peakHeap = 0;
        let peakRSS = 0;
        for (const snap of this.snapshots) {
            if (snap.memory.heapUsed > peakHeap) peakHeap = snap.memory.heapUsed;
            if (snap.memory.rss > peakRSS) peakRSS = snap.memory.rss;
        }
        
        console.log('\nPeak Memory:');
        console.log(`  Heap Used: ${this.formatBytes(peakHeap)}`);
        console.log(`  RSS: ${this.formatBytes(peakRSS)}`);
    }

    /**
     * Format bytes for display.
     */
    formatBytes(bytes, showSign = false) {
        const sign = showSign && bytes > 0 ? '+' : '';
        const absBytes = Math.abs(bytes);
        
        if (absBytes < 1024) return `${sign}${bytes} B`;
        if (absBytes < 1024 * 1024) return `${sign}${(bytes / 1024).toFixed(2)} KB`;
        if (absBytes < 1024 * 1024 * 1024) return `${sign}${(bytes / (1024 * 1024)).toFixed(2)} MB`;
        return `${sign}${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
    }

    /**
     * Check for common memory leak patterns.
     */
    checkForLeaks() {
        console.log('\n=== Leak Detection ===');
        
        // Check for consistent growth
        let consistentGrowth = true;
        let totalGrowth = 0;
        
        for (let i = 1; i < this.snapshots.length; i++) {
            const comparison = this.compareSnapshots(i - 1, i);
            totalGrowth += comparison.heapUsedDiff;
            
            if (comparison.heapUsedDiff < 0) {
                consistentGrowth = false;
            }
        }
        
        if (consistentGrowth && totalGrowth > 5 * 1024 * 1024) { // > 5MB total growth
            console.log('⚠️  WARNING: Consistent memory growth detected - possible memory leak');
            console.log(`   Total growth: ${this.formatBytes(totalGrowth)}`);
        } else {
            console.log('✅ No obvious memory leaks detected');
        }

        // Check for high memory usage
        const last = this.snapshots[this.snapshots.length - 1];
        if (last.memory.heapUsed > 100 * 1024 * 1024) { // > 100MB
            console.log('⚠️  WARNING: High memory usage detected');
            console.log(`   Current heap usage: ${this.formatBytes(last.memory.heapUsed)}`);
        }

        // Check heap utilization
        const heapUtilization = (last.heap.usedHeapSize / last.heap.heapSizeLimit) * 100;
        if (heapUtilization > 90) {
            console.log('⚠️  WARNING: High heap utilization');
            console.log(`   Heap usage: ${heapUtilization.toFixed(2)}%`);
        }
    }
}

// Export for use in tests
module.exports = { MemoryProfiler };

// Run if executed directly
if (require.main === module) {
    const profiler = new MemoryProfiler();
    
    // Parse command line arguments
    const args = process.argv.slice(2);
    const duration = parseInt(args[0]) || 60000; // Default 60 seconds
    const interval = parseInt(args[1]) || 5000;   // Default 5 seconds
    
    console.log('Azure DevOps Stream Deck Plugin - Memory Profiler');
    console.log('==================================================');
    console.log(`Node version: ${process.version}`);
    console.log(`Platform: ${process.platform}`);
    console.log(`Architecture: ${process.arch}`);
    console.log('');
    
    // Enable garbage collection stats if available
    if (global.gc) {
        console.log('Manual GC enabled (running with --expose-gc)');
    } else {
        console.log('Manual GC not available. Run with: node --expose-gc profile-memory.js');
    }
    
    profiler.monitor(duration, interval).then(() => {
        profiler.checkForLeaks();
        process.exit(0);
    }).catch(error => {
        console.error('Error during profiling:', error);
        process.exit(1);
    });
}