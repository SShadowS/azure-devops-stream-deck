import { StatusDisplayManager } from '../status-display';
import { PipelineStatus, PipelineInfo } from '../../services/pipeline-service';

describe('StatusDisplayManager', () => {
    let manager: StatusDisplayManager;

    beforeEach(() => {
        manager = new StatusDisplayManager();
    });

    describe('getStatusColor', () => {
        it('should return correct colors for each status', () => {
            expect(manager.getStatusColor(PipelineStatus.Succeeded)).toBe('#28a745');
            expect(manager.getStatusColor(PipelineStatus.Failed)).toBe('#dc3545');
            expect(manager.getStatusColor(PipelineStatus.Running)).toBe('#007bff');
            expect(manager.getStatusColor(PipelineStatus.PartiallySucceeded)).toBe('#ffc107');
            expect(manager.getStatusColor(PipelineStatus.Canceled)).toBe('#6c757d');
            expect(manager.getStatusColor(PipelineStatus.Unknown)).toBe('#6c757d');
            expect(manager.getStatusColor(PipelineStatus.NotStarted)).toBe('#17a2b8');
        });
    });

    describe('getStatusIcon', () => {
        it('should return correct icons for each status', () => {
            expect(manager.getStatusIcon(PipelineStatus.Succeeded)).toBe('✓');
            expect(manager.getStatusIcon(PipelineStatus.Failed)).toBe('✗');
            expect(manager.getStatusIcon(PipelineStatus.Running)).toBe('⟳');
            expect(manager.getStatusIcon(PipelineStatus.PartiallySucceeded)).toBe('⚠');
            expect(manager.getStatusIcon(PipelineStatus.Canceled)).toBe('⊘');
            expect(manager.getStatusIcon(PipelineStatus.Unknown)).toBe('?');
            expect(manager.getStatusIcon(PipelineStatus.NotStarted)).toBe('⏸');
        });
    });

    describe('getStatusLabel', () => {
        it('should return correct labels for each status', () => {
            expect(manager.getStatusLabel(PipelineStatus.Succeeded)).toBe('Succeeded');
            expect(manager.getStatusLabel(PipelineStatus.Failed)).toBe('Failed');
            expect(manager.getStatusLabel(PipelineStatus.Running)).toBe('Running');
            expect(manager.getStatusLabel(PipelineStatus.PartiallySucceeded)).toBe('Partial');
            expect(manager.getStatusLabel(PipelineStatus.Canceled)).toBe('Canceled');
            expect(manager.getStatusLabel(PipelineStatus.Unknown)).toBe('Unknown');
            expect(manager.getStatusLabel(PipelineStatus.NotStarted)).toBe('Not Started');
        });
    });

    describe('formatDuration', () => {
        it('should format seconds correctly', () => {
            expect(manager.formatDuration(45000)).toBe('45s');
            expect(manager.formatDuration(1000)).toBe('1s');
        });

        it('should format minutes and seconds correctly', () => {
            expect(manager.formatDuration(65000)).toBe('1m 5s');
            expect(manager.formatDuration(180000)).toBe('3m 0s');
        });

        it('should format hours and minutes correctly', () => {
            expect(manager.formatDuration(3665000)).toBe('1h 1m');
            expect(manager.formatDuration(7200000)).toBe('2h 0m');
        });
    });

    describe('formatStatusText', () => {
        const pipelineInfo: PipelineInfo = {
            id: 1,
            name: 'Test Pipeline',
            status: PipelineStatus.Succeeded,
            buildNumber: '123',
            duration: 65000
        };

        it('should format with icon only', () => {
            const text = manager.formatStatusText(pipelineInfo, {
                format: 'icon',
                showBuildNumber: false,
                showDuration: false
            });
            expect(text).toBe('✓');
        });

        it('should format with text only', () => {
            const text = manager.formatStatusText(pipelineInfo, {
                format: 'text',
                showBuildNumber: false,
                showDuration: false
            });
            expect(text).toBe('Succeeded');
        });

        it('should format with both icon and text', () => {
            const text = manager.formatStatusText(pipelineInfo, {
                format: 'both',
                showBuildNumber: false,
                showDuration: false
            });
            expect(text).toBe('✓ Succeeded');
        });

        it('should include build number when requested', () => {
            const text = manager.formatStatusText(pipelineInfo, {
                format: 'text',
                showBuildNumber: true,
                showDuration: false
            });
            expect(text).toBe('Succeeded #123');
        });

        it('should include duration when requested', () => {
            const text = manager.formatStatusText(pipelineInfo, {
                format: 'text',
                showBuildNumber: false,
                showDuration: true
            });
            expect(text).toBe('Succeeded 1m 5s');
        });

        it('should include all options', () => {
            const text = manager.formatStatusText(pipelineInfo, {
                format: 'both',
                showBuildNumber: true,
                showDuration: true
            });
            expect(text).toBe('✓ Succeeded #123 1m 5s');
        });
    });

    describe('formatBuildInfo', () => {
        it('should format complete build information', () => {
            const pipelineInfo: PipelineInfo = {
                id: 1,
                name: 'Test Pipeline',
                status: PipelineStatus.Succeeded,
                buildNumber: '123',
                startTime: new Date(Date.now() - 3600000), // 1 hour ago
                duration: 1800000, // 30 minutes
                requestedBy: 'John Doe',
                sourceBranch: 'refs/heads/main'
            };

            const info = manager.formatBuildInfo(pipelineInfo);
            expect(info).toContain('Pipeline: Test Pipeline');
            expect(info).toContain('Status: Succeeded');
            expect(info).toContain('Build: #123');
            expect(info).toContain('Duration: 30m 0s');
            expect(info).toContain('By: John Doe');
            expect(info).toContain('Branch: main');
        });

        it('should handle partial information', () => {
            const pipelineInfo: PipelineInfo = {
                id: 1,
                name: 'Test Pipeline',
                status: PipelineStatus.Running
            };

            const info = manager.formatBuildInfo(pipelineInfo);
            expect(info).toContain('Pipeline: Test Pipeline');
            expect(info).toContain('Status: Running');
            expect(info).not.toContain('Build:');
            expect(info).not.toContain('Duration:');
        });
    });

    describe('getStatusPriority', () => {
        it('should return correct priorities', () => {
            expect(manager.getStatusPriority(PipelineStatus.Failed)).toBe(0);
            expect(manager.getStatusPriority(PipelineStatus.PartiallySucceeded)).toBe(1);
            expect(manager.getStatusPriority(PipelineStatus.Running)).toBe(2);
            expect(manager.getStatusPriority(PipelineStatus.Canceled)).toBe(3);
            expect(manager.getStatusPriority(PipelineStatus.NotStarted)).toBe(4);
            expect(manager.getStatusPriority(PipelineStatus.Unknown)).toBe(5);
            expect(manager.getStatusPriority(PipelineStatus.Succeeded)).toBe(6);
        });
    });
});