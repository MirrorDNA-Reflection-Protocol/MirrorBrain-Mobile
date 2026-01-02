/**
 * Focus Timer Service — Pomodoro with Vault Logging
 * 
 * Simple focus sessions that log to vault when complete.
 */

import { VaultService } from './vault.service';

export interface FocusSession {
    id: string;
    duration: number;     // Total seconds
    elapsed: number;      // Seconds elapsed
    type: 'focus' | 'break';
    startedAt: Date;
    task?: string;
    completed: boolean;
}

// Default durations
export const FOCUS_DURATIONS = {
    short: 15 * 60,    // 15 min
    standard: 25 * 60, // 25 min (pomodoro)
    long: 45 * 60,     // 45 min
    break: 5 * 60,     // 5 min break
};

class FocusTimerServiceClass {
    private currentSession: FocusSession | null = null;
    private intervalId: ReturnType<typeof setInterval> | null = null;
    private listeners: Set<(session: FocusSession) => void> = new Set();

    /**
     * Start a focus session
     */
    start(duration: number, task?: string): FocusSession {
        // Stop any existing session
        if (this.currentSession) {
            this.stop();
        }

        this.currentSession = {
            id: `focus-${Date.now()}`,
            duration,
            elapsed: 0,
            type: 'focus',
            startedAt: new Date(),
            task,
            completed: false,
        };

        // Start timer
        this.intervalId = setInterval(() => {
            if (this.currentSession) {
                this.currentSession.elapsed += 1;
                this.notifyListeners();

                // Check if complete
                if (this.currentSession.elapsed >= this.currentSession.duration) {
                    this.complete();
                }
            }
        }, 1000);

        this.notifyListeners();
        return this.currentSession;
    }

    /**
     * Stop current session
     */
    stop(): FocusSession | null {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }

        const session = this.currentSession;
        this.currentSession = null;
        this.notifyListeners();
        return session;
    }

    /**
     * Complete session and log to vault
     */
    async complete(): Promise<void> {
        if (!this.currentSession) return;

        this.currentSession.completed = true;

        // Log to vault
        const minutes = Math.round(this.currentSession.duration / 60);
        await VaultService.saveCapture(
            'note',
            `Completed ${minutes}-minute focus session${this.currentSession.task ? ` on: ${this.currentSession.task}` : ''}.`,
            `Focus Session — ${minutes}min`,
            undefined,
            ['focus', 'completed']
        );

        this.stop();
    }

    /**
     * Get current session
     */
    getSession(): FocusSession | null {
        return this.currentSession;
    }

    /**
     * Check if timer is running
     */
    isRunning(): boolean {
        return this.currentSession !== null && this.intervalId !== null;
    }

    /**
     * Get remaining time in seconds
     */
    getRemaining(): number {
        if (!this.currentSession) return 0;
        return Math.max(0, this.currentSession.duration - this.currentSession.elapsed);
    }

    /**
     * Format time for display
     */
    formatTime(seconds: number): string {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }

    /**
     * Subscribe to session updates
     */
    subscribe(listener: (session: FocusSession) => void): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    /**
     * Notify all listeners
     */
    private notifyListeners() {
        const session = this.currentSession || ({
            id: '',
            duration: 0,
            elapsed: 0,
            type: 'focus',
            startedAt: new Date(),
            completed: false,
        } as FocusSession);

        this.listeners.forEach(listener => listener(session));
    }
}

// Singleton export
export const FocusTimerService = new FocusTimerServiceClass();

export default FocusTimerService;
