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
            // Check silently first — only prompt if not yet authorized
            const alreadyGranted = await this.checkPermission();
            if (!alreadyGranted) {
                const granted = await this.requestPermission();
                if (!granted) return [];
            }
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

    /**
     * Create a calendar event
     * Uses react-native-calendar-events saveEvent API
     */
    async createEvent(event: { title: string; startDate: Date; endDate: Date; location?: string }): Promise<string | null> {
        if (!this.hasPermission) {
            const granted = await this.requestPermission();
            if (!granted) return null;
        }

        try {
            const eventId = await RNCalendarEvents.saveEvent(event.title, {
                startDate: event.startDate.toISOString(),
                endDate: event.endDate.toISOString(),
                location: event.location,
            });
            console.log('Calendar event created:', eventId);
            return eventId;
        } catch (error) {
            console.error('Failed to create calendar event:', error);
            return null;
        }
    }

    /**
     * Get events for a specific date
     */
    async getEventsForDate(date: Date): Promise<CalendarEvent[]> {
        if (!this.hasPermission) {
            const alreadyGranted = await this.checkPermission();
            if (!alreadyGranted) {
                const granted = await this.requestPermission();
                if (!granted) return [];
            }
        }

        try {
            const dayStart = new Date(date);
            dayStart.setHours(0, 0, 0, 0);

            const dayEnd = new Date(date);
            dayEnd.setHours(23, 59, 59, 999);

            const events = await RNCalendarEvents.fetchAllEvents(
                dayStart.toISOString(),
                dayEnd.toISOString()
            );

            return events.map(this.mapEvent).sort((a, b) =>
                a.startDate.getTime() - b.startDate.getTime()
            );
        } catch (error) {
            console.error('Failed to fetch events for date:', error);
            return [];
        }
    }

    /**
     * Get upcoming events within next N days (default 7)
     */
    async getUpcomingEvents(days: number = 7): Promise<CalendarEvent[]> {
        if (!this.hasPermission) {
            const alreadyGranted = await this.checkPermission();
            if (!alreadyGranted) {
                const granted = await this.requestPermission();
                if (!granted) return [];
            }
        }

        try {
            const now = new Date();
            const futureDate = new Date(now);
            futureDate.setDate(futureDate.getDate() + days);

            const events = await RNCalendarEvents.fetchAllEvents(
                now.toISOString(),
                futureDate.toISOString()
            );

            return events.map(this.mapEvent).sort((a, b) =>
                a.startDate.getTime() - b.startDate.getTime()
            );
        } catch (error) {
            console.error('Failed to fetch upcoming events:', error);
            return [];
        }
    }
}

// Singleton export
export const CalendarService = new CalendarServiceClass();

export default CalendarService;
