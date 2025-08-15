/**
 * Mock for visual-feedback module
 */

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
    duration?: number;
    pulseInterval?: number;
    showAlert?: boolean;
    title?: string;
    preserveState?: boolean;
}

export class VisualFeedbackManager {
    private activeAnimations = new Map<string, NodeJS.Timeout>();
    private originalStates = new Map<string, { title: string; state: number }>();

    async showLoading(action: any, message: string = 'Loading...', options: FeedbackOptions = {}): Promise<void> {
        const actionId = action.id;
        this.stopAnimation(actionId);

        if (!options.preserveState) {
            this.originalStates.set(actionId, {
                title: '',
                state: 0
            });
        }

        await action.setTitle(message);
        
        const dots = ['', '.', '..', '...'];
        let dotIndex = 0;
        
        const animationId = setInterval(async () => {
            const baseMessage = message.replace(/\.+$/, '');
            await action.setTitle(`${baseMessage}${dots[dotIndex]}`);
            dotIndex = (dotIndex + 1) % dots.length;
        }, options.pulseInterval || 500);

        this.activeAnimations.set(actionId, animationId);

        if (options.duration && options.duration > 0) {
            setTimeout(() => this.stopAnimation(actionId), options.duration);
        }
    }

    async showConnecting(action: any, attempt: number = 1, maxAttempts: number = 3): Promise<void> {
        const message = maxAttempts > 1 
            ? `Connecting (${attempt}/${maxAttempts})` 
            : 'Connecting';
        
        await this.showLoading(action, message, {
            pulseInterval: 300,
            preserveState: false
        });
    }

    async showSuccess(action: any, message: string = 'Success!', options: FeedbackOptions = {}): Promise<void> {
        const actionId = action.id;
        this.stopAnimation(actionId);

        await action.setTitle(message);
        await action.setState(0);
        
        if (options.showAlert !== false) {
            await action.showOk();
        }

        if (options.duration !== 0) {
            setTimeout(() => {
                this.restoreOriginalState(action);
            }, options.duration || 3000);
        }
    }

    async showError(action: any, message: string = 'Error', options: FeedbackOptions = {}): Promise<void> {
        const actionId = action.id;
        this.stopAnimation(actionId);

        await action.setTitle(message);
        await action.setState(1);
        
        if (options.showAlert !== false) {
            await action.showAlert();
        }

        if (options.duration && options.duration > 0) {
            setTimeout(() => {
                this.restoreOriginalState(action);
            }, options.duration);
        }
    }

    async showWarning(action: any, message: string = 'Warning', options: FeedbackOptions = {}): Promise<void> {
        const actionId = action.id;
        this.stopAnimation(actionId);

        await action.setTitle(options.title || message);
        await action.setState(3);
        await action.setImage('warning-image');
    }

    async showDisconnected(action: any, message: string = 'Disconnected'): Promise<void> {
        const actionId = action.id;
        this.stopAnimation(actionId);

        await action.setTitle(message);
        await action.setState(1);
    }

    async showProgress(action: any, current: number, total: number, label?: string): Promise<void> {
        const percentage = Math.round((current / total) * 100);
        const progressBar = this.createProgressBar(percentage);
        
        const title = label 
            ? `${label}\n${progressBar}\n${percentage}%`
            : `${progressBar}\n${percentage}%`;
        
        await action.setTitle(title);
    }

    private createProgressBar(percentage: number): string {
        const filled = Math.round(percentage / 10);
        const empty = 10 - filled;
        return '█'.repeat(filled) + '░'.repeat(empty);
    }

    stopAnimation(actionId: string): void {
        const animationId = this.activeAnimations.get(actionId);
        if (animationId) {
            clearInterval(animationId);
            this.activeAnimations.delete(actionId);
        }
    }

    stopAllAnimations(): void {
        for (const [actionId, animationId] of this.activeAnimations) {
            clearInterval(animationId);
        }
        this.activeAnimations.clear();
    }

    async restoreOriginalState(action: any): Promise<void> {
        const actionId = action.id;
        const original = this.originalStates.get(actionId);
        
        if (original) {
            await action.setTitle(original.title);
            await action.setState(original.state);
            this.originalStates.delete(actionId);
        }
    }

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

        await updateCountdown();

        const animationId = setInterval(updateCountdown, 1000);
        this.activeAnimations.set(actionId, animationId);
    }

    async flash(action: any, count: number = 3, interval: number = 200): Promise<void> {
        const original = 0;

        for (let i = 0; i < count; i++) {
            await action.setState(1);
            await new Promise(resolve => setTimeout(resolve, interval));
            await action.setState(original);
            await new Promise(resolve => setTimeout(resolve, interval));
        }
    }
}

export const visualFeedback = new VisualFeedbackManager();