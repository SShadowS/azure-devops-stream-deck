/**
 * Visual feedback utilities for consistent UI states across actions.
 * Provides standardized loading, error, and success animations.
 */

import streamDeck from '@elgato/streamdeck';

export enum FeedbackType {
    Loading = 'loading',
    Success = 'success',
    Error = 'error',
    Warning = 'warning',
    Info = 'info',
    Connecting = 'connecting',
    Disconnected = 'disconnected'
}

export interface FeedbackOptions {
    duration?: number;  // Duration in ms (0 = indefinite)
    pulseInterval?: number;  // Interval for pulsing animations
    showAlert?: boolean;  // Show Stream Deck alert animation
    title?: string;  // Override title text
    preserveState?: boolean;  // Preserve current state after feedback
}

/**
 * Manages visual feedback for Stream Deck actions.
 */
export class VisualFeedbackManager {
    private activeAnimations = new Map<string, NodeJS.Timeout>();
    private originalStates = new Map<string, { title: string; state: number }>();
    private logger = streamDeck.logger.createScope('VisualFeedback');

    /**
     * Show loading animation.
     */
    async showLoading(action: any, message: string = 'Loading...', options: FeedbackOptions = {}): Promise<void> {
        const actionId = action.id;
        this.stopAnimation(actionId);

        // Store original state
        if (!options.preserveState) {
            this.originalStates.set(actionId, {
                title: await this.getActionTitle(action),
                state: await this.getActionState(action)
            });
        }

        // Set initial loading state
        await action.setTitle(message);
        
        // Create pulsing animation with dots
        const dots = ['', '.', '..', '...'];
        let dotIndex = 0;
        
        const animationId = setInterval(async () => {
            const baseMessage = message.replace(/\.+$/, '');
            await action.setTitle(`${baseMessage}${dots[dotIndex]}`);
            dotIndex = (dotIndex + 1) % dots.length;
        }, options.pulseInterval || 500);

        this.activeAnimations.set(actionId, animationId);

        // Auto-clear after duration if specified
        if (options.duration && options.duration > 0) {
            setTimeout(() => this.stopAnimation(actionId), options.duration);
        }
    }

    /**
     * Show connecting animation.
     */
    async showConnecting(action: any, attempt: number = 1, maxAttempts: number = 3): Promise<void> {
        const message = maxAttempts > 1 
            ? `Connecting (${attempt}/${maxAttempts})` 
            : 'Connecting';
        
        await this.showLoading(action, message, {
            pulseInterval: 300,
            preserveState: false
        });
    }

    /**
     * Show success feedback.
     */
    async showSuccess(action: any, message: string = 'Success!', options: FeedbackOptions = {}): Promise<void> {
        const actionId = action.id;
        this.stopAnimation(actionId);

        await action.setTitle(message);
        await action.setState(0);  // Success state (green)
        
        if (options.showAlert !== false) {
            await action.showOk();
        }

        // Restore after duration
        if (options.duration !== 0) {
            setTimeout(() => {
                this.restoreOriginalState(action);
            }, options.duration || 3000);
        }
    }

    /**
     * Show error feedback.
     */
    async showError(action: any, message: string = 'Error', options: FeedbackOptions = {}): Promise<void> {
        const actionId = action.id;
        this.stopAnimation(actionId);

        await action.setTitle(message);
        await action.setState(1);  // Error state (red)
        
        if (options.showAlert !== false) {
            await action.showAlert();
        }

        // Don't auto-restore for errors unless specified
        if (options.duration && options.duration > 0) {
            setTimeout(() => {
                this.restoreOriginalState(action);
            }, options.duration);
        }
    }

    /**
     * Show warning feedback.
     */
    async showWarning(action: any, message: string = 'Warning', options: FeedbackOptions = {}): Promise<void> {
        const actionId = action.id;
        this.stopAnimation(actionId);

        await action.setTitle(message);
        await action.setState(3);  // Warning state (orange/yellow)

        // Pulse animation for warnings
        if (options.pulseInterval) {
            let isVisible = true;
            const animationId = setInterval(async () => {
                await action.setState(isVisible ? 3 : 5);
                isVisible = !isVisible;
            }, options.pulseInterval);
            
            this.activeAnimations.set(actionId, animationId);
        }

        // Auto-clear after duration
        if (options.duration && options.duration > 0) {
            setTimeout(() => {
                this.stopAnimation(actionId);
                this.restoreOriginalState(action);
            }, options.duration);
        }
    }

    /**
     * Show disconnected state.
     */
    async showDisconnected(action: any, message: string = 'Disconnected'): Promise<void> {
        const actionId = action.id;
        this.stopAnimation(actionId);

        await action.setTitle(message);
        await action.setState(5);  // Unknown/disconnected state (gray)
    }

    /**
     * Show progress indicator.
     */
    async showProgress(action: any, current: number, total: number, label?: string): Promise<void> {
        const percentage = Math.round((current / total) * 100);
        const progressBar = this.createProgressBar(percentage);
        
        const title = label 
            ? `${label}\n${progressBar}\n${percentage}%`
            : `${progressBar}\n${percentage}%`;
        
        await action.setTitle(title);
    }

    /**
     * Create a text-based progress bar.
     */
    private createProgressBar(percentage: number): string {
        const filled = Math.round(percentage / 10);
        const empty = 10 - filled;
        return '█'.repeat(filled) + '░'.repeat(empty);
    }

    /**
     * Stop any active animation for an action.
     */
    stopAnimation(actionId: string): void {
        const animationId = this.activeAnimations.get(actionId);
        if (animationId) {
            clearInterval(animationId);
            this.activeAnimations.delete(actionId);
        }
    }

    /**
     * Stop all active animations.
     */
    stopAllAnimations(): void {
        for (const [actionId, animationId] of this.activeAnimations) {
            clearInterval(animationId);
        }
        this.activeAnimations.clear();
    }

    /**
     * Restore original state of an action.
     */
    async restoreOriginalState(action: any): Promise<void> {
        const actionId = action.id;
        const original = this.originalStates.get(actionId);
        
        if (original) {
            await action.setTitle(original.title);
            await action.setState(original.state);
            this.originalStates.delete(actionId);
        }
    }

    /**
     * Clear all stored states.
     */
    clearStoredStates(): void {
        this.originalStates.clear();
    }

    /**
     * Get current action title (helper method).
     */
    private async getActionTitle(action: any): Promise<string> {
        // Stream Deck SDK doesn't provide a getTitle method, 
        // so we'll default to empty string
        return '';
    }

    /**
     * Get current action state (helper method).
     */
    private async getActionState(action: any): Promise<number> {
        // Stream Deck SDK doesn't provide a getState method,
        // so we'll default to 0
        return 0;
    }

    /**
     * Show a countdown timer.
     */
    async showCountdown(action: any, seconds: number, label: string = 'Next update'): Promise<void> {
        const actionId = action.id;
        this.stopAnimation(actionId);

        let remaining = seconds;
        
        const updateCountdown = async () => {
            const minutes = Math.floor(remaining / 60);
            const secs = remaining % 60;
            const timeStr = minutes > 0 
                ? `${minutes}:${secs.toString().padStart(2, '0')}`
                : `${secs}s`;
            
            await action.setTitle(`${label}\n${timeStr}`);
            
            remaining--;
            if (remaining < 0) {
                this.stopAnimation(actionId);
            }
        };

        // Initial update
        await updateCountdown();

        // Update every second
        const animationId = setInterval(updateCountdown, 1000);
        this.activeAnimations.set(actionId, animationId);
    }

    /**
     * Flash the action button for attention.
     */
    async flash(action: any, count: number = 3, interval: number = 200): Promise<void> {
        const actionId = action.id;
        const original = await this.getActionState(action);

        for (let i = 0; i < count; i++) {
            await action.setState(1);  // Flash state
            await new Promise(resolve => setTimeout(resolve, interval));
            await action.setState(original);
            await new Promise(resolve => setTimeout(resolve, interval));
        }
    }
}

// Create singleton instance
export const visualFeedback = new VisualFeedbackManager();