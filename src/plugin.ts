import streamDeck, { LogLevel } from "@elgato/streamdeck";

import { PipelineStatusAction } from "./actions/pipeline-status";
import { PRChecks } from "./actions/pr-checks";
import { memoryLeakDetector } from "./utils/memory-leak-detector";
import { performanceOptimizer } from "./utils/performance-optimizer";

// We can enable "trace" logging so that all messages between the Stream Deck, and the plugin are recorded. When storing sensitive information
streamDeck.logger.setLevel(LogLevel.TRACE);

// Start memory leak detection in development mode
if (process.env.NODE_ENV !== 'production') {
    memoryLeakDetector.startMonitoring();
    
    // Log memory stats every 5 minutes
    setInterval(() => {
        const stats = memoryLeakDetector.getMemoryStats();
        streamDeck.logger.info('Memory Stats', {
            heapUsedMB: (stats.current.heapUsed / 1024 / 1024).toFixed(2),
            trend: stats.trend,
            averageMB: stats.averageHeapMB.toFixed(2)
        });
    }, 5 * 60 * 1000);
}

// Cleanup cache periodically to prevent memory buildup
setInterval(() => {
    performanceOptimizer.cleanupCache();
}, 60 * 1000); // Every minute

// Register the pipeline status action
streamDeck.actions.registerAction(new PipelineStatusAction());

// Register the PR checks action
streamDeck.actions.registerAction(new PRChecks());

// Handle graceful shutdown
process.on('SIGTERM', () => {
    streamDeck.logger.info('Shutting down plugin...');
    memoryLeakDetector.stopMonitoring();
    performanceOptimizer.cleanup();
});

// Finally, connect to the Stream Deck.
streamDeck.connect();
