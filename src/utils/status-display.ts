import { PipelineStatus, PipelineInfo } from '../services/pipeline-service';

export interface StatusColors {
    succeeded: string;
    failed: string;
    running: string;
    partiallySucceeded: string;
    canceled: string;
    unknown: string;
    notStarted: string;
}

export interface StatusIcons {
    succeeded: string;
    failed: string;
    running: string;
    partiallySucceeded: string;
    canceled: string;
    unknown: string;
    notStarted: string;
}

export interface DisplayOptions {
    format: 'icon' | 'text' | 'both';
    showBuildNumber: boolean;
    showDuration: boolean;
}

export class StatusDisplayManager {
    private static readonly STATUS_COLORS: StatusColors = {
        succeeded: '#28a745',
        failed: '#dc3545',
        running: '#007bff',
        partiallySucceeded: '#ffc107',
        canceled: '#6c757d',
        unknown: '#6c757d',
        notStarted: '#17a2b8'
    };

    private static readonly STATUS_ICONS: StatusIcons = {
        succeeded: '✓',
        failed: '✗',
        running: '⟳',
        partiallySucceeded: '⚠',
        canceled: '⊘',
        unknown: '?',
        notStarted: '⏸'
    };

    private static readonly STATUS_LABELS: Record<PipelineStatus, string> = {
        [PipelineStatus.Succeeded]: 'Succeeded',
        [PipelineStatus.Failed]: 'Failed',
        [PipelineStatus.Running]: 'Running',
        [PipelineStatus.PartiallySucceeded]: 'Partial',
        [PipelineStatus.Canceled]: 'Canceled',
        [PipelineStatus.Unknown]: 'Unknown',
        [PipelineStatus.NotStarted]: 'Not Started'
    };

    public getStatusColor(status: PipelineStatus): string {
        return StatusDisplayManager.STATUS_COLORS[status] || StatusDisplayManager.STATUS_COLORS.unknown;
    }

    public getStatusIcon(status: PipelineStatus): string {
        return StatusDisplayManager.STATUS_ICONS[status] || StatusDisplayManager.STATUS_ICONS.unknown;
    }

    public getStatusLabel(status: PipelineStatus): string {
        return StatusDisplayManager.STATUS_LABELS[status] || 'Unknown';
    }

    public formatStatusText(pipelineInfo: PipelineInfo, options: DisplayOptions): string {
        const lines: string[] = [];
        const statusParts: string[] = [];

        // First line: Status text only (no icon)
        if (options.format === 'icon') {
            // If user specifically wants icon only, show icon
            lines.push(this.getStatusIcon(pipelineInfo.status));
        } else {
            // For 'text' or 'both', show text only (no icon)
            const shortLabel = this.getShortStatusLabel(pipelineInfo.status);
            lines.push(shortLabel);
        }

        // Parse and display build number (if enabled)
        if (options.showBuildNumber && pipelineInfo.buildNumber) {
            // Remove any leading/trailing whitespace
            const cleanBuildNumber = pipelineInfo.buildNumber.trim();
            
            // Try to parse version format (e.g., "26.10.2.12345-rc.37171.1231")
            // Match pattern: digits.digits.digits followed by separator and build number
            const versionMatch = cleanBuildNumber.match(/^(\d+\.\d+\.\d+)[\.\-_]?(\d+)?/);
            
            if (versionMatch) {
                // Display version on one line
                lines.push(versionMatch[1]);
                // Display build number on next line (if it exists)
                // versionMatch[2] will only contain the numeric build number, not the extra data
                if (versionMatch[2]) {
                    lines.push(versionMatch[2]);
                }
            } else {
                // If it doesn't match the expected format, just display as-is
                // but remove # prefix if present
                const displayNumber = cleanBuildNumber.replace(/^#/, '');
                lines.push(displayNumber);
            }
        }

        // Additional line: Duration (if enabled and we have room)
        if (options.showDuration && pipelineInfo.duration) {
            const duration = this.formatShortDuration(pipelineInfo.duration);
            // Stream Deck can handle 4-5 lines, but keep it reasonable
            if (lines.length <= 4) {
                lines.push(duration);
            }
        }

        // Join with newlines for multiline display
        return lines.join('\n');
    }

    private getShortStatusLabel(status: PipelineStatus): string {
        const shortLabels: Record<PipelineStatus, string> = {
            [PipelineStatus.Succeeded]: 'Success',
            [PipelineStatus.Failed]: 'Failed',
            [PipelineStatus.Running]: 'Running',
            [PipelineStatus.PartiallySucceeded]: 'Partial',
            [PipelineStatus.Canceled]: 'Canceled',
            [PipelineStatus.Unknown]: 'Unknown',
            [PipelineStatus.NotStarted]: 'Waiting'
        };
        return shortLabels[status] || 'Unknown';
    }

    private formatShortDuration(milliseconds: number): string {
        const seconds = Math.floor(milliseconds / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);

        if (hours > 0) {
            const remainingMinutes = minutes % 60;
            return `${hours}h${remainingMinutes > 0 ? ` ${remainingMinutes}m` : ''}`;
        } else if (minutes > 0) {
            return `${minutes}m`;
        } else {
            return `${seconds}s`;
        }
    }

    public formatDuration(milliseconds: number): string {
        const seconds = Math.floor(milliseconds / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);

        if (hours > 0) {
            const remainingMinutes = minutes % 60;
            return `${hours}h ${remainingMinutes}m`;
        } else if (minutes > 0) {
            const remainingSeconds = seconds % 60;
            return `${minutes}m ${remainingSeconds}s`;
        } else {
            return `${seconds}s`;
        }
    }

    public formatBuildInfo(pipelineInfo: PipelineInfo): string {
        const lines: string[] = [];
        
        lines.push(`Pipeline: ${pipelineInfo.name}`);
        lines.push(`Status: ${this.getStatusLabel(pipelineInfo.status)}`);
        
        if (pipelineInfo.buildNumber) {
            lines.push(`Build: #${pipelineInfo.buildNumber}`);
        }
        
        if (pipelineInfo.startTime) {
            lines.push(`Started: ${this.formatRelativeTime(pipelineInfo.startTime)}`);
        }
        
        if (pipelineInfo.duration) {
            lines.push(`Duration: ${this.formatDuration(pipelineInfo.duration)}`);
        }
        
        if (pipelineInfo.requestedBy) {
            lines.push(`By: ${pipelineInfo.requestedBy}`);
        }
        
        if (pipelineInfo.sourceBranch) {
            const branch = pipelineInfo.sourceBranch.replace('refs/heads/', '');
            lines.push(`Branch: ${branch}`);
        }

        return lines.join('\n');
    }

    private formatRelativeTime(date: Date): string {
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMins / 60);
        const diffDays = Math.floor(diffHours / 24);

        if (diffDays > 0) {
            return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
        } else if (diffHours > 0) {
            return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
        } else if (diffMins > 0) {
            return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
        } else {
            return 'Just now';
        }
    }

    public getStatusPriority(status: PipelineStatus): number {
        const priorities: Record<PipelineStatus, number> = {
            [PipelineStatus.Failed]: 0,
            [PipelineStatus.PartiallySucceeded]: 1,
            [PipelineStatus.Running]: 2,
            [PipelineStatus.Canceled]: 3,
            [PipelineStatus.NotStarted]: 4,
            [PipelineStatus.Unknown]: 5,
            [PipelineStatus.Succeeded]: 6
        };
        
        return priorities[status] ?? 5;
    }
}