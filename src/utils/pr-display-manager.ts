import { PullRequest } from "../services/pr-service";

/**
 * Manages the display of PR information on Stream Deck buttons
 */
export class PRDisplayManager {
    /**
     * Generate title text for the button based on PRs
     */
    static generateTitle(prs: PullRequest[]): string {
        if (prs.length === 0) {
            return "No PRs";
        }

        // Count different PR states
        const activePRs = prs.filter(pr => pr.status === 'active' && !pr.isDraft);
        const draftPRs = prs.filter(pr => pr.isDraft);
        const conflictPRs = prs.filter(pr => pr.hasConflicts);
        
        // Build title parts
        const parts: string[] = [];
        
        // Show total count prominently
        parts.push(`${prs.length} PR${prs.length !== 1 ? 's' : ''}`);
        
        // Add status indicators
        if (conflictPRs.length > 0) {
            parts.push(`⚠ ${conflictPRs.length}`);
        }
        if (draftPRs.length > 0) {
            parts.push(`✏ ${draftPRs.length}`);
        }

        // Show age of oldest PR
        if (prs.length > 0) {
            const oldestPR = prs.reduce((oldest, pr) => 
                pr.createdDate < oldest.createdDate ? pr : oldest
            );
            const ageInDays = Math.floor(
                (Date.now() - oldestPR.createdDate.getTime()) / (1000 * 60 * 60 * 24)
            );
            if (ageInDays > 0) {
                parts.push(`${ageInDays}d old`);
            }
        }

        return parts.join('\n');
    }

    /**
     * Generate an image/icon for the button based on PR status
     */
    static generateImage(prs: PullRequest[]): string {
        if (prs.length === 0) {
            return this.getSuccessImage(); // Green - all good
        }

        // Determine priority status
        const hasConflicts = prs.some(pr => pr.hasConflicts);
        const hasOldPRs = prs.some(pr => {
            const ageInDays = Math.floor(
                (Date.now() - pr.createdDate.getTime()) / (1000 * 60 * 60 * 24)
            );
            return ageInDays > 7;
        });
        const hasWaitingReviews = prs.some(pr => 
            pr.reviewers.some(r => r.vote === -5) // Waiting for review
        );

        if (hasConflicts) {
            return this.getConflictImage(); // Red
        } else if (hasOldPRs) {
            return this.getWarningImage(); // Yellow
        } else if (hasWaitingReviews) {
            return this.getPendingImage(); // Blue
        } else {
            return this.getNormalImage(); // Default PR icon
        }
    }

    /**
     * Get success image (green checkmark)
     */
    static getSuccessImage(): string {
        return "data:image/svg+xml;base64," + Buffer.from(`
            <svg width="72" height="72" viewBox="0 0 72 72" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect width="72" height="72" fill="#0E7C3A"/>
                <path d="M30 36L34 40L42 32" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
        `).toString('base64');
    }

    /**
     * Get normal PR image (default)
     */
    static getNormalImage(): string {
        return "data:image/svg+xml;base64," + Buffer.from(`
            <svg width="72" height="72" viewBox="0 0 72 72" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect width="72" height="72" fill="#0078D4"/>
                <path d="M36 20V36M36 36L30 30M36 36L42 30" stroke="white" stroke-width="2" stroke-linecap="round"/>
                <path d="M28 44H44" stroke="white" stroke-width="2" stroke-linecap="round"/>
                <path d="M32 52H40" stroke="white" stroke-width="2" stroke-linecap="round"/>
            </svg>
        `).toString('base64');
    }

    /**
     * Get warning image (yellow)
     */
    static getWarningImage(): string {
        return "data:image/svg+xml;base64," + Buffer.from(`
            <svg width="72" height="72" viewBox="0 0 72 72" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect width="72" height="72" fill="#F2C94C"/>
                <path d="M36 20V36M36 36L30 30M36 36L42 30" stroke="white" stroke-width="2" stroke-linecap="round"/>
                <path d="M28 44H44" stroke="white" stroke-width="2" stroke-linecap="round"/>
                <circle cx="36" cy="52" r="2" fill="white"/>
            </svg>
        `).toString('base64');
    }

    /**
     * Get conflict image (red)
     */
    static getConflictImage(): string {
        return "data:image/svg+xml;base64," + Buffer.from(`
            <svg width="72" height="72" viewBox="0 0 72 72" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect width="72" height="72" fill="#D13438"/>
                <path d="M36 20V36M36 36L30 30M36 36L42 30" stroke="white" stroke-width="2" stroke-linecap="round"/>
                <path d="M30 46L42 46M30 50L42 50" stroke="white" stroke-width="2" stroke-linecap="round"/>
            </svg>
        `).toString('base64');
    }

    /**
     * Get pending image (blue)
     */
    static getPendingImage(): string {
        return "data:image/svg+xml;base64," + Buffer.from(`
            <svg width="72" height="72" viewBox="0 0 72 72" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect width="72" height="72" fill="#106EBE"/>
                <path d="M36 20V36M36 36L30 30M36 36L42 30" stroke="white" stroke-width="2" stroke-linecap="round"/>
                <circle cx="32" cy="48" r="2" fill="white"/>
                <circle cx="36" cy="48" r="2" fill="white"/>
                <circle cx="40" cy="48" r="2" fill="white"/>
            </svg>
        `).toString('base64');
    }

    /**
     * Get error image
     */
    static getErrorImage(): string {
        return "data:image/svg+xml;base64," + Buffer.from(`
            <svg width="72" height="72" viewBox="0 0 72 72" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect width="72" height="72" fill="#A80000"/>
                <path d="M30 30L42 42M42 30L30 42" stroke="white" stroke-width="3" stroke-linecap="round"/>
            </svg>
        `).toString('base64');
    }

    /**
     * Format PR count for display
     */
    static formatPRCount(count: number): string {
        if (count === 0) return "No PRs";
        if (count === 1) return "1 PR";
        if (count > 99) return "99+ PRs";
        return `${count} PRs`;
    }

    /**
     * Get status color as hex
     */
    static getPRStatusColor(prs: PullRequest[]): string {
        if (prs.length === 0) return "#0E7C3A"; // Green
        
        const hasConflicts = prs.some(pr => pr.hasConflicts);
        const hasOldPRs = prs.some(pr => {
            const ageInDays = Math.floor(
                (Date.now() - pr.createdDate.getTime()) / (1000 * 60 * 60 * 24)
            );
            return ageInDays > 7;
        });

        if (hasConflicts) return "#D13438"; // Red
        if (hasOldPRs) return "#F2C94C"; // Yellow
        return "#0078D4"; // Blue
    }
}