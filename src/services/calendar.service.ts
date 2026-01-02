/**
 * Calendar Service — Today's Events
 * From Spec Part VI
 * 
 * Read-only calendar access for today only.
 */

import RNCalendarEvents, { CalendarEventReadable } from 'react-native-calendar-events';

export interface CalendarEvent {
    id: string;
    title: string;
    startDate: Date;
    endDate: Date;
    isAllDay: boolean;
    location?: string;
}

class CalendarServiceClass {
    private hasPermission: boolean = false;

    /**
     * Request calendar permission
     */
    async requestPermission(): Promise<boolean> {
        try {
            const status = await RNCalendarEvents.requestPermissions();
            this.hasPermission = status === 'authorized';
            return this.hasPermission;
        } catch (error) {
            console.error('Failed to request calendar permission:', error);
            return false;
        }
    }

    /**
     * Check current permission status
     */
    async checkPermission(): Promise<boolean> {
        try {
            const status = await RNCalendarEvents.checkPermissions();
            this.hasPermission = status === 'authorized';
            return this.hasPermission;
        } catch (error) {
            console.error('Failed to check calendar permission:', error);
            return false;
        }
    }

    /**
     * Get today's events only
     */
    async getTodayEvents(): Promise<CalendarEvent[]> {
        if (!this.hasPermission) {
            const granted = await this.requestPermission();
            if (!granted) return [];
        }

        try {
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            const tomorrow = new Date(today);
            tomorrow.setDate(tomorrow.getDate() + 1);

            const events = await RNCalendarEvents.fetchAllEvents(
                today.toISOString(),
                tomorrow.toISOString()
            );

            return events.map(this.mapEvent).sort((a, b) =>
                a.startDate.getTime() - b.startDate.getTime()
            );
        } catch (error) {
            console.error('Failed to fetch calendar events:', error);
            return [];
        }
    }

    /**
     * Get upcoming event (next event from now)
     */
    async getNextEvent(): Promise<CalendarEvent | null> {
        const events = await this.getTodayEvents();
        const now = new Date();

        return events.find(event => event.endDate > now) || null;
    }

    /**
     * Format event time for display
     */
    formatEventTime(event: CalendarEvent): string {
        if (event.isAllDay) {
            return 'All day';
        }

        return event.startDate.toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
        });
    }

    /**
     * Map RN calendar event to our format
     */
    private mapEvent(event: CalendarEventReadable): CalendarEvent {
        return {
            id: event.id,
            title: event.title,
            startDate: new Date(event.startDate || Date.now()),
            endDate: new Date(event.endDate || Date.now()),
            isAllDay: event.allDay || false,
            location: event.location || undefined,
        };
    }
}

// Singleton export
export const CalendarService = new CalendarServiceClass();

export default CalendarService;
