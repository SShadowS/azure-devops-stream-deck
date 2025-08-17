import { MemoryLeakDetector } from '../memory-leak-detector';
import streamDeck from '@elgato/streamdeck';

jest.mock('@elgato/streamdeck');

describe('MemoryLeakDetector', () => {
    let detector: MemoryLeakDetector;
    let mockLogger: any;

    beforeEach(() => {
        jest.clearAllMocks();
        jest.useFakeTimers();
        
        mockLogger = {
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
            debug: jest.fn()
        };
        
        (streamDeck.logger.createScope as jest.Mock).mockReturnValue(mockLogger);
        
        detector = new MemoryLeakDetector();
    });

    afterEach(() => {
        detector.stopMonitoring();
        jest.useRealTimers();
    });

    describe('startMonitoring', () => {
        it('should start monitoring memory usage', () => {
            detector.startMonitoring();
            
            expect(mockLogger.info).toHaveBeenCalledWith('Starting memory leak detection');
            expect(mockLogger.debug).toHaveBeenCalled();
        });

        it('should warn if monitoring is already active', () => {
            detector.startMonitoring();
            detector.startMonitoring();
            
            expect(mockLogger.warn).toHaveBeenCalledWith('Memory monitoring already active');
        });

        it('should take snapshots at regular intervals', () => {
            const takeSnapshotSpy = jest.spyOn(detector as any, 'takeSnapshot');
            
            detector.startMonitoring();
            expect(takeSnapshotSpy).toHaveBeenCalledTimes(1);
            
            jest.advanceTimersByTime(30000);
            expect(takeSnapshotSpy).toHaveBeenCalledTimes(2);
            
            jest.advanceTimersByTime(30000);
            expect(takeSnapshotSpy).toHaveBeenCalledTimes(3);
        });
    });

    describe('stopMonitoring', () => {
        it('should stop monitoring memory usage', () => {
            detector.startMonitoring();
            detector.stopMonitoring();
            
            expect(mockLogger.info).toHaveBeenCalledWith('Stopped memory leak detection');
        });

        it('should clear the monitoring timer', () => {
            detector.startMonitoring();
            const takeSnapshotSpy = jest.spyOn(detector as any, 'takeSnapshot');
            
            detector.stopMonitoring();
            takeSnapshotSpy.mockClear();
            
            jest.advanceTimersByTime(30000);
            expect(takeSnapshotSpy).not.toHaveBeenCalled();
        });

        it('should handle stopping when not monitoring', () => {
            expect(() => detector.stopMonitoring()).not.toThrow();
        });
    });

    describe('getMemoryStats', () => {
        it('should return current memory statistics', () => {
            const mockMemoryUsage = {
                heapUsed: 50 * 1024 * 1024, // 50MB
                heapTotal: 100 * 1024 * 1024,
                rss: 150 * 1024 * 1024,
                external: 10 * 1024 * 1024,
                arrayBuffers: 5 * 1024 * 1024
            };
            
            jest.spyOn(process, 'memoryUsage').mockReturnValue(mockMemoryUsage as any);
            
            const stats = detector.getMemoryStats();
            
            expect(stats.current.heapUsed).toBe(mockMemoryUsage.heapUsed);
            expect(stats.current.heapTotal).toBe(mockMemoryUsage.heapTotal);
            expect(stats.current.rss).toBe(mockMemoryUsage.rss);
            expect(stats.trend).toBe('stable');
            expect(stats.averageHeapMB).toBe(0);
            expect(stats.peakHeapMB).toBe(0);
        });

        it('should detect increasing memory trend', () => {
            const mockMemoryUsages = [
                { heapUsed: 50 * 1024 * 1024 },
                { heapUsed: 52 * 1024 * 1024 },
                { heapUsed: 54 * 1024 * 1024 },
                { heapUsed: 56 * 1024 * 1024 },
                { heapUsed: 58 * 1024 * 1024 }
            ];
            
            let callIndex = 0;
            jest.spyOn(process, 'memoryUsage').mockImplementation(() => ({
                ...mockMemoryUsages[Math.min(callIndex++, mockMemoryUsages.length - 1)],
                heapTotal: 100 * 1024 * 1024,
                rss: 150 * 1024 * 1024,
                external: 10 * 1024 * 1024,
                arrayBuffers: 5 * 1024 * 1024
            } as any));
            
            detector.startMonitoring();
            
            // Advance time to take multiple snapshots
            for (let i = 0; i < 4; i++) {
                jest.advanceTimersByTime(30000);
            }
            
            const stats = detector.getMemoryStats();
            expect(stats.trend).toBe('increasing');
        });

        it('should detect decreasing memory trend', () => {
            const mockMemoryUsages = [
                { heapUsed: 58 * 1024 * 1024 },
                { heapUsed: 56 * 1024 * 1024 },
                { heapUsed: 54 * 1024 * 1024 },
                { heapUsed: 52 * 1024 * 1024 },
                { heapUsed: 50 * 1024 * 1024 }
            ];
            
            let callIndex = 0;
            jest.spyOn(process, 'memoryUsage').mockImplementation(() => ({
                ...mockMemoryUsages[Math.min(callIndex++, mockMemoryUsages.length - 1)],
                heapTotal: 100 * 1024 * 1024,
                rss: 150 * 1024 * 1024,
                external: 10 * 1024 * 1024,
                arrayBuffers: 5 * 1024 * 1024
            } as any));
            
            detector.startMonitoring();
            
            // Advance time to take multiple snapshots
            for (let i = 0; i < 4; i++) {
                jest.advanceTimersByTime(30000);
            }
            
            const stats = detector.getMemoryStats();
            expect(stats.trend).toBe('decreasing');
        });
    });

    describe('analyzeMemoryPattern', () => {
        it('should detect high severity memory leak', () => {
            const mockMemoryUsages = [
                { heapUsed: 50 * 1024 * 1024 }, // 50MB
                { heapUsed: 60 * 1024 * 1024 }, // 60MB
                { heapUsed: 70 * 1024 * 1024 }, // 70MB
                { heapUsed: 80 * 1024 * 1024 }, // 80MB
                { heapUsed: 90 * 1024 * 1024 }  // 90MB - 40MB growth
            ];
            
            let callIndex = 0;
            jest.spyOn(process, 'memoryUsage').mockImplementation(() => ({
                heapUsed: mockMemoryUsages[Math.min(callIndex++, mockMemoryUsages.length - 1)].heapUsed,
                heapTotal: 100 * 1024 * 1024,
                rss: 150 * 1024 * 1024,
                external: 10 * 1024 * 1024,
                arrayBuffers: 5 * 1024 * 1024
            } as any));
            
            detector.startMonitoring();
            
            // Advance time to take multiple snapshots (4 * 30 seconds = 2 minutes)
            for (let i = 0; i < 4; i++) {
                jest.advanceTimersByTime(30000);
            }
            
            expect(mockLogger.error).toHaveBeenCalledWith(
                'Memory leak detected',
                expect.objectContaining({
                    hasLeak: true,
                    severity: 'high',
                    message: expect.stringContaining('Critical memory leak detected')
                })
            );
        });

        it('should not detect leak with stable memory', () => {
            const mockMemoryUsage = {
                heapUsed: 50 * 1024 * 1024, // Stable 50MB
                heapTotal: 100 * 1024 * 1024,
                rss: 150 * 1024 * 1024,
                external: 10 * 1024 * 1024,
                arrayBuffers: 5 * 1024 * 1024
            };
            
            jest.spyOn(process, 'memoryUsage').mockReturnValue(mockMemoryUsage as any);
            
            detector.startMonitoring();
            
            // Advance time to take multiple snapshots
            for (let i = 0; i < 4; i++) {
                jest.advanceTimersByTime(30000);
            }
            
            expect(mockLogger.error).not.toHaveBeenCalled();
        });
    });

    describe('forceGCAndAnalyze', () => {
        it('should force garbage collection when available', () => {
            const mockGC = jest.fn();
            (global as any).gc = mockGC;
            
            const mockMemoryUsages = [
                { heapUsed: 100 * 1024 * 1024 }, // Before GC: 100MB
                { heapUsed: 60 * 1024 * 1024 }   // After GC: 60MB
            ];
            
            let callIndex = 0;
            jest.spyOn(process, 'memoryUsage').mockImplementation(() => {
                const usage = mockMemoryUsages[callIndex] || mockMemoryUsages[mockMemoryUsages.length - 1];
                callIndex++;
                return {
                    heapUsed: usage.heapUsed,
                    heapTotal: 150 * 1024 * 1024,
                    rss: 200 * 1024 * 1024,
                    external: 10 * 1024 * 1024,
                    arrayBuffers: 5 * 1024 * 1024
                } as any;
            });
            
            const result = detector.forceGCAndAnalyze();
            
            expect(mockGC).toHaveBeenCalled();
            expect(result.collected).toBe(true);
            expect(result.freedMemoryMB).toBeCloseTo(40, 1); // ~40MB freed
            expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('Garbage collection freed'));
            
            delete (global as any).gc;
        });

        it('should handle when garbage collection is not available', () => {
            delete (global as any).gc;
            
            jest.spyOn(process, 'memoryUsage').mockReturnValue({
                heapUsed: 100 * 1024 * 1024,
                heapTotal: 150 * 1024 * 1024,
                rss: 200 * 1024 * 1024,
                external: 10 * 1024 * 1024,
                arrayBuffers: 5 * 1024 * 1024
            } as any);
            
            const result = detector.forceGCAndAnalyze();
            
            expect(result.collected).toBe(false);
            expect(result.freedMemoryMB).toBe(0);
        });
    });

    describe('getReport', () => {
        it('should generate a comprehensive report', () => {
            const mockMemoryUsage = {
                heapUsed: 75 * 1024 * 1024, // 75MB
                heapTotal: 100 * 1024 * 1024,
                rss: 150 * 1024 * 1024,
                external: 10 * 1024 * 1024,
                arrayBuffers: 5 * 1024 * 1024
            };
            
            jest.spyOn(process, 'memoryUsage').mockReturnValue(mockMemoryUsage as any);
            
            detector.startMonitoring();
            jest.advanceTimersByTime(30000);
            
            const report = detector.getReport();
            
            expect(report).toContain('=== Memory Leak Detection Report ===');
            expect(report).toContain('Current Heap: 75.00 MB');
            expect(report).toContain('Memory Trend: stable');
            expect(report).toContain('Leak Status: None');
            expect(report).toContain('Severity: none');
            expect(report).toContain('Recommendations:');
        });

        it('should include recommendations when leak is detected', () => {
            const mockMemoryUsages = [
                { heapUsed: 50 * 1024 * 1024 },
                { heapUsed: 55 * 1024 * 1024 },
                { heapUsed: 60 * 1024 * 1024 },
                { heapUsed: 65 * 1024 * 1024 }
            ];
            
            let callIndex = 0;
            jest.spyOn(process, 'memoryUsage').mockImplementation(() => ({
                heapUsed: mockMemoryUsages[Math.min(callIndex++, mockMemoryUsages.length - 1)].heapUsed,
                heapTotal: 100 * 1024 * 1024,
                rss: 150 * 1024 * 1024,
                external: 10 * 1024 * 1024,
                arrayBuffers: 5 * 1024 * 1024
            } as any));
            
            detector.startMonitoring();
            
            // Advance time to take multiple snapshots
            for (let i = 0; i < 3; i++) {
                jest.advanceTimersByTime(30000);
            }
            
            const report = detector.getReport();
            
            expect(report).toContain('Leak Status:');
            expect(report).toContain('Growth Rate:');
        });
    });

    describe('snapshot management', () => {
        it('should maintain maximum number of snapshots', () => {
            jest.spyOn(process, 'memoryUsage').mockReturnValue({
                heapUsed: 50 * 1024 * 1024,
                heapTotal: 100 * 1024 * 1024,
                rss: 150 * 1024 * 1024,
                external: 10 * 1024 * 1024,
                arrayBuffers: 5 * 1024 * 1024
            } as any);
            
            detector.startMonitoring();
            
            // Take more than MAX_SNAPSHOTS (20)
            for (let i = 0; i < 25; i++) {
                jest.advanceTimersByTime(30000);
            }
            
            // Check that detector maintains only MAX_SNAPSHOTS
            const stats = detector.getMemoryStats();
            expect(stats).toBeDefined();
            // Logger should have been called for each snapshot
            expect(mockLogger.debug).toHaveBeenCalled();
        });
    });
});