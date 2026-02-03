/**
 * Nudge Service — Proactive Contextual Nudges
 *
 * Purpose: Generate contextual nudges based on:
 * - Device state (battery, time)
 * - Calendar (upcoming events)
 * - Pending items (reminders, deferred decisions)
 * - Patterns (time-based habits)
 */

import { DeviceService } from './device.service';
import { CalendarService, CalendarEvent } from './calendar.service';
import { VaultService } from './vault.service';
import { HapticSymphony } from './HapticSymphony';

export type NudgeType =
    | 'battery_warning'
    | 'upcoming_meeting'
    | 'pending_reminder'
    | 'deferred_decision'
    | 'focus_suggestion'
    | 'relationship_check'
    | 'morning_brief'
    | 'evening_review'
    | 'custom';

export type NudgePriority = 'low' | 'medium' | 'high' | 'urgent';

export interface Nudge {
    id: string;
    type: NudgeType;
    priority: NudgePriority;
    title: string;
    message: string;
    action?: NudgeAction;
    timestamp: Date;
    expiresAt?: Date;
    dismissed?: boolean;
}

export interface NudgeAction {
    label: string;
    type: 'open_app' | 'navigate' | 'execute' | 'dismiss';
    payload?: any;
}

export interface NudgeConfig {
    batteryThreshold: number; // Warn below this %
    meetingLeadTime: number; // Minutes before meeting
    checkInterval: number; // Milliseconds between checks
    enabled: boolean;
}

const DEFAULT_CONFIG: NudgeConfig = {
    batteryThreshold: 20,
    meetingLeadTime: 15,
    checkInterval: 60000, // 1 minute
    enabled: true,
};

type NudgeCallback = (nudge: Nudge) => void;

class NudgeServiceClass {
    private config: NudgeConfig = DEFAULT_CONFIG;
    private activeNudges: Map<string, Nudge> = new Map();
    private callbacks: Set<NudgeCallback> = new Set();
    private checkInterval: ReturnType<typeof setInterval> | null = null;
    private lastBatteryCheck = 0;
    private lastMeetingCheck = 0;

    /**
     * Start the nudge engine
     */
    start(config?: Partial<NudgeConfig>): void {
        if (config) {
            this.config = { ...this.config, ...config };
        }

        if (!this.config.enabled) {
            console.log('[NudgeService] Disabled, not starting');
            return;
        }

        if (this.checkInterval) {
            clearInterval(this.checkInterval);
        }

        // Initial check
        this.runChecks();

        // Periodic checks
        this.checkInterval = setInterval(() => {
            this.runChecks();
        }, this.config.checkInterval);

        console.log('[NudgeService] Started');
    }

    /**
     * Stop the nudge engine
     */
    stop(): void {
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
            this.checkInterval = null;
        }
        console.log('[NudgeService] Stopped');
    }

    /**
     * Subscribe to nudge events
     */
    subscribe(callback: NudgeCallback): () => void {
        this.callbacks.add(callback);
        return () => this.callbacks.delete(callback);
    }

    /**
     * Get all active nudges
     */
    getActiveNudges(): Nudge[] {
        const now = new Date();
        return Array.from(this.activeNudges.values())
            .filter(n => !n.dismissed && (!n.expiresAt || n.expiresAt > now))
            .sort((a, b) => {
                // Sort by priority then timestamp
                const priorityOrder = { urgent: 0, high: 1, medium: 2, low: 3 };
                const pDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
                if (pDiff !== 0) return pDiff;
                return b.timestamp.getTime() - a.timestamp.getTime();
            });
    }

    /**
     * Dismiss a nudge
     */
    dismiss(nudgeId: string): void {
        const nudge = this.activeNudges.get(nudgeId);
        if (nudge) {
            nudge.dismissed = true;
            this.activeNudges.set(nudgeId, nudge);
        }
    }

    /**
     * Clear all nudges
     */
    clearAll(): void {
        this.activeNudges.clear();
    }

    /**
     * Run all checks
     */
    private async runChecks(): Promise<void> {
        try {
            await Promise.all([
                this.checkBattery(),
                this.checkUpcomingMeetings(),
                this.checkPendingReminders(),
                this.checkTimeBasedNudges(),
            ]);
        } catch (error) {
            console.error('[NudgeService] Check error:', error);
        }
    }

    /**
     * Check battery level
     */
    private async checkBattery(): Promise<void> {
        const now = Date.now();
        // Only check every 5 minutes
        if (now - this.lastBatteryCheck < 300000) return;
        this.lastBatteryCheck = now;

        try {
            const batteryInfo = await DeviceService.getBatteryLevel();
            const battery = batteryInfo.level;
            const isCharging = batteryInfo.charging;

            if (!isCharging && battery <= this.config.batteryThreshold) {
                const nudgeId = 'battery_low';

                // Don't re-nudge if already active
                if (this.activeNudges.has(nudgeId)) return;

                this.createNudge({
                    id: nudgeId,
                    type: 'battery_warning',
                    priority: battery <= 10 ? 'urgent' : 'high',
                    title: 'Low Battery',
                    message: `Battery at ${battery}%. Consider charging soon.`,
                    action: {
                        label: 'Dismiss',
                        type: 'dismiss',
                    },
                    expiresAt: new Date(now + 3600000), // 1 hour
                });
            } else {
                // Clear battery nudge if charging or above threshold
                this.activeNudges.delete('battery_low');
            }
        } catch (error) {
            console.error('[NudgeService] Battery check error:', error);
        }
    }

    /**
     * Check upcoming meetings
     */
    private async checkUpcomingMeetings(): Promise<void> {
        const now = Date.now();
        // Only check every 2 minutes
        if (now - this.lastMeetingCheck < 120000) return;
        this.lastMeetingCheck = now;

        try {
            const events = await CalendarService.getUpcomingEvents(60); // Next hour

            for (const event of events) {
                const eventTime = new Date(event.startDate).getTime();
                const minutesUntil = (eventTime - now) / 60000;

                if (minutesUntil > 0 && minutesUntil <= this.config.meetingLeadTime) {
                    const nudgeId = `meeting_${event.id}`;

                    // Don't re-nudge if already active
                    if (this.activeNudges.has(nudgeId)) continue;

                    this.createNudge({
                        id: nudgeId,
                        type: 'upcoming_meeting',
                        priority: minutesUntil <= 5 ? 'urgent' : 'high',
                        title: 'Upcoming Meeting',
                        message: `${event.title} in ${Math.round(minutesUntil)} minutes`,
                        action: {
                            label: 'View',
                            type: 'navigate',
                            payload: { screen: 'calendar', eventId: event.id },
                        },
                        expiresAt: new Date(eventTime),
                    });
                }
            }
        } catch (error) {
            console.error('[NudgeService] Meeting check error:', error);
        }
    }

    /**
     * Check pending reminders
     */
    private async checkPendingReminders(): Promise<void> {
        try {
            const reminders = await VaultService.search('tag:reminder tag:pending');

            for (const reminder of reminders.slice(0, 3)) {
                const nudgeId = `reminder_${reminder.id}`;

                // Check if already active
                if (this.activeNudges.has(nudgeId)) continue;

                this.createNudge({
                    id: nudgeId,
                    type: 'pending_reminder',
                    priority: 'medium',
                    title: 'Pending Reminder',
                    message: reminder.title,
                    action: {
                        label: 'View',
                        type: 'navigate',
                        payload: { screen: 'vault', path: reminder.id },
                    },
                });
            }
        } catch (error) {
            // Vault search might fail, that's ok
        }
    }

    /**
     * Check time-based nudges (morning brief, evening review)
     */
    private async checkTimeBasedNudges(): Promise<void> {
        const now = new Date();
        const hour = now.getHours();
        const minute = now.getMinutes();
        const today = now.toDateString();

        // Morning brief: 7:00-8:00 AM
        if (hour === 7 && minute < 30) {
            const nudgeId = `morning_${today}`;
            if (!this.activeNudges.has(nudgeId)) {
                this.createNudge({
                    id: nudgeId,
                    type: 'morning_brief',
                    priority: 'medium',
                    title: 'Good Morning',
                    message: 'Ready for your morning briefing?',
                    action: {
                        label: 'Start',
                        type: 'navigate',
                        payload: { screen: 'briefing', type: 'morning' },
                    },
                    expiresAt: new Date(now.getTime() + 3600000),
                });
            }
        }

        // Evening review: 8:00-9:00 PM
        if (hour === 20 && minute < 30) {
            const nudgeId = `evening_${today}`;
            if (!this.activeNudges.has(nudgeId)) {
                this.createNudge({
                    id: nudgeId,
                    type: 'evening_review',
                    priority: 'low',
                    title: 'Evening Review',
                    message: 'How was your day?',
                    action: {
                        label: 'Review',
                        type: 'navigate',
                        payload: { screen: 'briefing', type: 'evening' },
                    },
                    expiresAt: new Date(now.getTime() + 3600000),
                });
            }
        }
    }

    /**
     * Create and emit a nudge
     */
    private createNudge(nudge: Omit<Nudge, 'timestamp'>): void {
        const fullNudge: Nudge = {
            ...nudge,
            timestamp: new Date(),
            dismissed: false,
        };

        this.activeNudges.set(nudge.id, fullNudge);

        // Haptic feedback for high priority
        if (nudge.priority === 'urgent' || nudge.priority === 'high') {
            HapticSymphony.attention();
        }

        // Notify subscribers
        this.callbacks.forEach(cb => {
            try {
                cb(fullNudge);
            } catch (error) {
                console.error('[NudgeService] Callback error:', error);
            }
        });

        console.log('[NudgeService] Created nudge:', nudge.id, nudge.title);
    }

    /**
     * Create a custom nudge
     */
    pushNudge(options: {
        title: string;
        message: string;
        priority?: NudgePriority;
        action?: NudgeAction;
        expiresIn?: number; // milliseconds
    }): string {
        const id = `custom_${Date.now()}`;
        const expiresAt = options.expiresIn
            ? new Date(Date.now() + options.expiresIn)
            : undefined;

        this.createNudge({
            id,
            type: 'custom',
            priority: options.priority || 'medium',
            title: options.title,
            message: options.message,
            action: options.action,
            expiresAt,
        });

        return id;
    }
}

export const NudgeService = new NudgeServiceClass();
