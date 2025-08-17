import streamDeck, { LogLevel } from "@elgato/streamdeck";

import { ConfigurationManagerAction } from "./actions/configuration-manager";
import { PipelineStatusAction } from "./actions/pipeline-status";
import { PRChecks } from "./actions/pr-checks";
import { WorkItemStatusAction } from "./actions/work-item-status";
import { SprintProgressAction } from "./actions/sprint-progress";
import { RepositoryStatsAction } from "./actions/repository-stats";
import { ReleasePipelineMonitorAction } from "./actions/release-pipeline-monitor";
import { BuildQueueManagerAction } from "./actions/build-queue-manager";
import { TestResultsSummaryAction } from "./actions/test-results-summary";
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

// Register the configuration manager action
streamDeck.actions.registerAction(new ConfigurationManagerAction());

// Register the pipeline status action
streamDeck.actions.registerAction(new PipelineStatusAction());

// Register the PR checks action
streamDeck.actions.registerAction(new PRChecks());

// Register the work item status action
streamDeck.actions.registerAction(new WorkItemStatusAction());

// Register the sprint progress action
streamDeck.actions.registerAction(new SprintProgressAction());

// Register the repository stats action
streamDeck.actions.registerAction(new RepositoryStatsAction());

// Register the release pipeline monitor action
streamDeck.actions.registerAction(new ReleasePipelineMonitorAction());

// Register the build queue manager action
streamDeck.actions.registerAction(new BuildQueueManagerAction());

// Register the test results summary action
streamDeck.actions.registerAction(new TestResultsSummaryAction());

// Handle graceful shutdown
process.on('SIGTERM', () => {
    streamDeck.logger.info('Shutting down plugin...');
    memoryLeakDetector.stopMonitoring();
    performanceOptimizer.cleanup();
});

// Finally, connect to the Stream Deck.
streamDeck.connect();
