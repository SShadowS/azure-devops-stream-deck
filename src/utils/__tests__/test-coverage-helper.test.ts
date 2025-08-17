import {
    calculateCoveragePercentage,
    meetsCoverageThreshold,
    formatCoveragePercentage,
    getCoverageStatusEmoji,
    calculateCoverageGap,
    allMetricsMeetThresholds,
    getLowestCoverageMetric,
    generateCoverageReport,
    CoverageSummary
} from '../test-coverage-helper';

describe('Test Coverage Helper', () => {
    describe('calculateCoveragePercentage', () => {
        it('should calculate percentage correctly', () => {
            expect(calculateCoveragePercentage(75, 100)).toBe(75);
            expect(calculateCoveragePercentage(50, 100)).toBe(50);
            expect(calculateCoveragePercentage(100, 100)).toBe(100);
            expect(calculateCoveragePercentage(0, 100)).toBe(0);
        });

        it('should handle decimal percentages', () => {
            expect(calculateCoveragePercentage(333, 1000)).toBe(33.3);
            expect(calculateCoveragePercentage(667, 1000)).toBe(66.7);
        });

        it('should return 100 when total is 0', () => {
            expect(calculateCoveragePercentage(0, 0)).toBe(100);
            expect(calculateCoveragePercentage(10, 0)).toBe(100);
        });
    });

    describe('meetsCoverageThreshold', () => {
        it('should return true when percentage meets threshold', () => {
            expect(meetsCoverageThreshold(75, 75)).toBe(true);
            expect(meetsCoverageThreshold(80, 75)).toBe(true);
            expect(meetsCoverageThreshold(100, 75)).toBe(true);
        });

        it('should return false when percentage below threshold', () => {
            expect(meetsCoverageThreshold(74.99, 75)).toBe(false);
            expect(meetsCoverageThreshold(50, 75)).toBe(false);
            expect(meetsCoverageThreshold(0, 75)).toBe(false);
        });
    });

    describe('formatCoveragePercentage', () => {
        it('should format percentage with 2 decimal places', () => {
            expect(formatCoveragePercentage(75)).toBe('75.00%');
            expect(formatCoveragePercentage(75.5)).toBe('75.50%');
            expect(formatCoveragePercentage(75.55)).toBe('75.55%');
            expect(formatCoveragePercentage(75.555)).toBe('75.56%');
        });

        it('should handle edge cases', () => {
            expect(formatCoveragePercentage(0)).toBe('0.00%');
            expect(formatCoveragePercentage(100)).toBe('100.00%');
        });
    });

    describe('getCoverageStatusEmoji', () => {
        it('should return ✅ for high coverage', () => {
            expect(getCoverageStatusEmoji(80)).toBe('✅');
            expect(getCoverageStatusEmoji(90)).toBe('✅');
            expect(getCoverageStatusEmoji(100)).toBe('✅');
        });

        it('should return ⚠️ for medium coverage', () => {
            expect(getCoverageStatusEmoji(60)).toBe('⚠️');
            expect(getCoverageStatusEmoji(70)).toBe('⚠️');
            expect(getCoverageStatusEmoji(79.99)).toBe('⚠️');
        });

        it('should return ❌ for low coverage', () => {
            expect(getCoverageStatusEmoji(0)).toBe('❌');
            expect(getCoverageStatusEmoji(30)).toBe('❌');
            expect(getCoverageStatusEmoji(59.99)).toBe('❌');
        });
    });

    describe('calculateCoverageGap', () => {
        it('should calculate gap when current is below target', () => {
            expect(calculateCoverageGap(70, 75)).toBe(5);
            expect(calculateCoverageGap(50, 75)).toBe(25);
            expect(calculateCoverageGap(0, 75)).toBe(75);
        });

        it('should return 0 when current meets or exceeds target', () => {
            expect(calculateCoverageGap(75, 75)).toBe(0);
            expect(calculateCoverageGap(80, 75)).toBe(0);
            expect(calculateCoverageGap(100, 75)).toBe(0);
        });
    });

    describe('allMetricsMeetThresholds', () => {
        const thresholds: CoverageSummary = {
            statements: 75,
            branches: 65,
            functions: 75,
            lines: 75
        };

        it('should return true when all metrics meet thresholds', () => {
            const coverage: CoverageSummary = {
                statements: 75,
                branches: 65,
                functions: 75,
                lines: 75
            };
            
            expect(allMetricsMeetThresholds(coverage, thresholds)).toBe(true);
        });

        it('should return true when all metrics exceed thresholds', () => {
            const coverage: CoverageSummary = {
                statements: 80,
                branches: 70,
                functions: 80,
                lines: 80
            };
            
            expect(allMetricsMeetThresholds(coverage, thresholds)).toBe(true);
        });

        it('should return false when any metric is below threshold', () => {
            const coverage: CoverageSummary = {
                statements: 74, // Below threshold
                branches: 65,
                functions: 75,
                lines: 75
            };
            
            expect(allMetricsMeetThresholds(coverage, thresholds)).toBe(false);
        });

        it('should return false when multiple metrics are below threshold', () => {
            const coverage: CoverageSummary = {
                statements: 70,
                branches: 60,
                functions: 70,
                lines: 70
            };
            
            expect(allMetricsMeetThresholds(coverage, thresholds)).toBe(false);
        });
    });

    describe('getLowestCoverageMetric', () => {
        it('should identify the lowest metric', () => {
            const coverage: CoverageSummary = {
                statements: 75,
                branches: 60,  // Lowest
                functions: 80,
                lines: 70
            };
            
            const result = getLowestCoverageMetric(coverage);
            
            expect(result.metric).toBe('branches');
            expect(result.value).toBe(60);
        });

        it('should handle equal metrics', () => {
            const coverage: CoverageSummary = {
                statements: 75,
                branches: 75,
                functions: 75,
                lines: 75
            };
            
            const result = getLowestCoverageMetric(coverage);
            
            expect(result.value).toBe(75);
        });

        it('should handle zero coverage', () => {
            const coverage: CoverageSummary = {
                statements: 50,
                branches: 0,  // Lowest
                functions: 25,
                lines: 30
            };
            
            const result = getLowestCoverageMetric(coverage);
            
            expect(result.metric).toBe('branches');
            expect(result.value).toBe(0);
        });
    });

    describe('generateCoverageReport', () => {
        it('should generate report with all metrics passing', () => {
            const coverage: CoverageSummary = {
                statements: 80,
                branches: 70,
                functions: 85,
                lines: 82
            };
            
            const thresholds: CoverageSummary = {
                statements: 75,
                branches: 65,
                functions: 75,
                lines: 75
            };
            
            const report = generateCoverageReport(coverage, thresholds);
            
            expect(report).toContain('Coverage Report:');
            expect(report).toContain('Statements: 80.00% (threshold: 75%)');
            expect(report).toContain('Branches:   70.00% (threshold: 65%)');
            expect(report).toContain('Functions:  85.00% (threshold: 75%)');
            expect(report).toContain('Lines:      82.00% (threshold: 75%)');
            expect(report).toContain('✅ All coverage thresholds met!');
        });

        it('should generate report with some metrics failing', () => {
            const coverage: CoverageSummary = {
                statements: 70,  // Below threshold
                branches: 60,    // Below threshold
                functions: 80,
                lines: 72        // Below threshold
            };
            
            const thresholds: CoverageSummary = {
                statements: 75,
                branches: 65,
                functions: 75,
                lines: 75
            };
            
            const report = generateCoverageReport(coverage, thresholds);
            
            expect(report).toContain('Coverage Report:');
            expect(report).toContain('Statements: 70.00% (threshold: 75%)');
            expect(report).toContain('Branches:   60.00% (threshold: 65%)');
            expect(report).toContain('Functions:  80.00% (threshold: 75%)');
            expect(report).toContain('Lines:      72.00% (threshold: 75%)');
            expect(report).toContain('❌ Coverage thresholds not met');
        });

        it('should handle decimal percentages', () => {
            const coverage: CoverageSummary = {
                statements: 72.98,
                branches: 59.30,
                functions: 79.78,
                lines: 72.78
            };
            
            const thresholds: CoverageSummary = {
                statements: 75,
                branches: 65,
                functions: 75,
                lines: 75
            };
            
            const report = generateCoverageReport(coverage, thresholds);
            
            expect(report).toContain('Statements: 72.98%');
            expect(report).toContain('Branches:   59.30%');
            expect(report).toContain('Functions:  79.78%');
            expect(report).toContain('Lines:      72.78%');
        });
    });
});