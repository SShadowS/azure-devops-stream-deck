/**
 * Helper utilities for test coverage analysis
 */

/**
 * Calculates coverage percentage
 */
export function calculateCoveragePercentage(covered: number, total: number): number {
    if (total === 0) return 100;
    return Math.round((covered / total) * 100 * 100) / 100;
}

/**
 * Determines if coverage meets threshold
 */
export function meetsCoverageThreshold(percentage: number, threshold: number): boolean {
    return percentage >= threshold;
}

/**
 * Formats coverage percentage for display
 */
export function formatCoveragePercentage(percentage: number): string {
    return `${percentage.toFixed(2)}%`;
}

/**
 * Gets coverage status emoji
 */
export function getCoverageStatusEmoji(percentage: number): string {
    if (percentage >= 80) return '✅';
    if (percentage >= 60) return '⚠️';
    return '❌';
}

/**
 * Calculates coverage gap
 */
export function calculateCoverageGap(current: number, target: number): number {
    return Math.max(0, target - current);
}

/**
 * Coverage report summary
 */
export interface CoverageSummary {
    statements: number;
    branches: number;
    functions: number;
    lines: number;
}

/**
 * Checks if all coverage metrics meet thresholds
 */
export function allMetricsMeetThresholds(
    coverage: CoverageSummary,
    thresholds: CoverageSummary
): boolean {
    return coverage.statements >= thresholds.statements &&
           coverage.branches >= thresholds.branches &&
           coverage.functions >= thresholds.functions &&
           coverage.lines >= thresholds.lines;
}

/**
 * Gets the lowest coverage metric
 */
export function getLowestCoverageMetric(coverage: CoverageSummary): { metric: string; value: number } {
    const metrics = [
        { metric: 'statements', value: coverage.statements },
        { metric: 'branches', value: coverage.branches },
        { metric: 'functions', value: coverage.functions },
        { metric: 'lines', value: coverage.lines }
    ];
    
    return metrics.reduce((lowest, current) => 
        current.value < lowest.value ? current : lowest
    );
}

/**
 * Generates coverage report message
 */
export function generateCoverageReport(
    coverage: CoverageSummary,
    thresholds: CoverageSummary
): string {
    const lines: string[] = [
        'Coverage Report:',
        `  Statements: ${formatCoveragePercentage(coverage.statements)} (threshold: ${thresholds.statements}%)`,
        `  Branches:   ${formatCoveragePercentage(coverage.branches)} (threshold: ${thresholds.branches}%)`,
        `  Functions:  ${formatCoveragePercentage(coverage.functions)} (threshold: ${thresholds.functions}%)`,
        `  Lines:      ${formatCoveragePercentage(coverage.lines)} (threshold: ${thresholds.lines}%)`
    ];
    
    const meetsAll = allMetricsMeetThresholds(coverage, thresholds);
    lines.push('');
    lines.push(meetsAll ? '✅ All coverage thresholds met!' : '❌ Coverage thresholds not met');
    
    return lines.join('\n');
}