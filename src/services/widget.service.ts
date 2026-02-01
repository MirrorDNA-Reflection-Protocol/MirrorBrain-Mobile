/**
 * Widget Service — Home Screen Widget Bridge
 *
 * Purpose: TypeScript bridge to native home screen widget.
 * Updates widget with status, events, and pending items.
 */

import { NativeModules, Platform } from 'react-native';

const { MirrorBrainWidget } = NativeModules;

export interface WidgetData {
    greeting?: string;
    status?: string;
    pendingCount?: number;
    nextEvent?: string;
}

class WidgetServiceClass {
    /**
     * Update widget with new data
     */
    async updateWidget(data: WidgetData): Promise<boolean> {
        if (Platform.OS !== 'android' || !MirrorBrainWidget) {
            return false;
        }

        try {
            await MirrorBrainWidget.updateWidget(data);
            console.log('[WidgetService] Widget updated:', data);
            return true;
        } catch (error) {
            console.error('[WidgetService] updateWidget failed:', error);
            return false;
        }
    }

    /**
     * Refresh widget (reload current data)
     */
    async refreshWidget(): Promise<boolean> {
        if (Platform.OS !== 'android' || !MirrorBrainWidget) {
            return false;
        }

        try {
            await MirrorBrainWidget.refreshWidget();
            return true;
        } catch (error) {
            console.error('[WidgetService] refreshWidget failed:', error);
            return false;
        }
    }

    /**
     * Get time-based greeting
     */
    getGreeting(): string {
        const hour = new Date().getHours();
        if (hour < 12) return 'Good morning';
        if (hour < 17) return 'Good afternoon';
        if (hour < 21) return 'Good evening';
        return 'Good night';
    }

    /**
     * Update widget with current state
     */
    async updateWithState(options: {
        status?: string;
        pendingItems?: number;
        nextEventTitle?: string;
        nextEventTime?: Date;
    }): Promise<boolean> {
        const { status, pendingItems, nextEventTitle, nextEventTime } = options;

        let nextEvent: string | undefined;
        if (nextEventTitle && nextEventTime) {
            const timeStr = nextEventTime.toLocaleTimeString([], {
                hour: 'numeric',
                minute: '2-digit',
            });
            nextEvent = `${nextEventTitle} at ${timeStr}`;
        }

        return this.updateWidget({
            greeting: this.getGreeting(),
            status: status || 'Ready to help',
            pendingCount: pendingItems || 0,
            nextEvent,
        });
    }
}

export const WidgetService = new WidgetServiceClass();
