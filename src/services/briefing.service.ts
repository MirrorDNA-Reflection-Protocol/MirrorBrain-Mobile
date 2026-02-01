/**
 * Briefing Service — Morning & Evening Rituals
 *
 * Purpose: Generate contextual briefings for daily rituals.
 * Morning: Weather, calendar, pending tasks, focus suggestion
 * Evening: Day summary, tomorrow preview, relationship check
 */

import { CalendarService, CalendarEvent } from './calendar.service';
import { WeatherService, WeatherData } from './weather.service';
import { VaultService } from './vault.service';
import { NudgeService } from './nudge.service';
import { LLMService } from './llm.service';
import { ContactsService, PriorityContact } from './contacts.service';

export type BriefingType = 'morning' | 'evening' | 'quick';

export interface BriefingSection {
    title: string;
    icon: string;
    content: string;
    items?: BriefingItem[];
    action?: BriefingAction;
}

export interface BriefingItem {
    id: string;
    text: string;
    subtext?: string;
    type: 'event' | 'task' | 'reminder' | 'contact' | 'insight';
    priority?: 'high' | 'medium' | 'low';
    action?: BriefingAction;
}

export interface BriefingAction {
    label: string;
    type: 'navigate' | 'dismiss' | 'snooze' | 'complete';
    payload?: any;
}

export interface Briefing {
    type: BriefingType;
    greeting: string;
    summary: string;
    sections: BriefingSection[];
    generatedAt: Date;
    aiInsight?: string;
}

export interface DaySummary {
    eventsAttended: number;
    tasksCompleted: number;
    notesCreated: number;
    messagesReceived: number;
    focusMinutes: number;
    highlights: string[];
}

class BriefingServiceClass {
    private lastMorningBriefing: Briefing | null = null;
    private lastEveningBriefing: Briefing | null = null;

    /**
     * Generate a briefing based on type
     */
    async generateBriefing(type: BriefingType): Promise<Briefing> {
        switch (type) {
            case 'morning':
                return this.generateMorningBriefing();
            case 'evening':
                return this.generateEveningBriefing();
            case 'quick':
                return this.generateQuickBriefing();
            default:
                return this.generateQuickBriefing();
        }
    }

    /**
     * Generate morning briefing
     */
    async generateMorningBriefing(): Promise<Briefing> {
        const sections: BriefingSection[] = [];
        const now = new Date();
        const greeting = this.getMorningGreeting();

        // Weather section
        try {
            const weather = await WeatherService.getCurrentWeather();
            if (weather) {
                sections.push(this.buildWeatherSection(weather));
            }
        } catch {
            // Weather unavailable
        }

        // Today's calendar
        try {
            const events = await CalendarService.getTodayEvents();
            if (events.length > 0) {
                sections.push(this.buildCalendarSection(events, 'Today\'s Schedule'));
            }
        } catch {
            // Calendar unavailable
        }

        // Pending tasks/reminders
        try {
            const pendingItems = await this.getPendingItems();
            if (pendingItems.length > 0) {
                sections.push({
                    title: 'Pending Items',
                    icon: '📋',
                    content: `You have ${pendingItems.length} item${pendingItems.length > 1 ? 's' : ''} to address`,
                    items: pendingItems.slice(0, 5),
                });
            }
        } catch {
            // Pending items unavailable
        }

        // Focus suggestion
        const focusSuggestion = await this.getFocusSuggestion();
        if (focusSuggestion) {
            sections.push({
                title: 'Focus Suggestion',
                icon: '🎯',
                content: focusSuggestion,
                action: {
                    label: 'Start Focus',
                    type: 'navigate',
                    payload: { screen: 'focus' },
                },
            });
        }

        // Generate AI summary
        const aiInsight = await this.generateMorningInsight(sections);

        const briefing: Briefing = {
            type: 'morning',
            greeting,
            summary: this.buildMorningSummary(sections),
            sections,
            generatedAt: now,
            aiInsight,
        };

        this.lastMorningBriefing = briefing;
        return briefing;
    }

    /**
     * Generate evening briefing
     */
    async generateEveningBriefing(): Promise<Briefing> {
        const sections: BriefingSection[] = [];
        const now = new Date();
        const greeting = this.getEveningGreeting();

        // Day summary
        const daySummary = await this.getDaySummary();
        sections.push({
            title: 'Today\'s Summary',
            icon: '📊',
            content: this.formatDaySummary(daySummary),
            items: daySummary.highlights.map((h, i) => ({
                id: `highlight_${i}`,
                text: h,
                type: 'insight' as const,
            })),
        });

        // Tomorrow preview
        try {
            const tomorrow = new Date(now);
            tomorrow.setDate(tomorrow.getDate() + 1);
            const tomorrowEvents = await CalendarService.getEventsForDate(tomorrow);
            if (tomorrowEvents.length > 0) {
                sections.push(this.buildCalendarSection(tomorrowEvents, 'Tomorrow\'s Preview'));
            }
        } catch {
            // Calendar unavailable
        }

        // Relationship check
        try {
            const neglectedContacts = await this.getNeglectedContacts();
            if (neglectedContacts.length > 0) {
                sections.push({
                    title: 'Stay Connected',
                    icon: '👥',
                    content: `You haven't reached out to ${neglectedContacts.length} important contact${neglectedContacts.length > 1 ? 's' : ''} recently`,
                    items: neglectedContacts.slice(0, 3).map(c => ({
                        id: c.id,
                        text: c.name,
                        subtext: `Last contact: ${this.formatRelativeTime(c.lastContact)}`,
                        type: 'contact' as const,
                        action: {
                            label: 'Reach Out',
                            type: 'navigate' as const,
                            payload: { screen: 'contact', contactId: c.id },
                        },
                    })),
                });
            }
        } catch {
            // Contacts unavailable
        }

        // Gratitude/reflection prompt
        sections.push({
            title: 'Evening Reflection',
            icon: '🌙',
            content: 'What went well today? What would you do differently?',
            action: {
                label: 'Capture Thoughts',
                type: 'navigate',
                payload: { screen: 'vault', type: 'reflection' },
            },
        });

        // Generate AI insight
        const aiInsight = await this.generateEveningInsight(daySummary);

        const briefing: Briefing = {
            type: 'evening',
            greeting,
            summary: `You completed ${daySummary.tasksCompleted} tasks and attended ${daySummary.eventsAttended} events today.`,
            sections,
            generatedAt: now,
            aiInsight,
        };

        this.lastEveningBriefing = briefing;
        return briefing;
    }

    /**
     * Generate quick briefing (on-demand summary)
     */
    async generateQuickBriefing(): Promise<Briefing> {
        const sections: BriefingSection[] = [];
        const now = new Date();
        const hour = now.getHours();

        // Upcoming events (next 2 hours)
        try {
            const upcoming = await CalendarService.getUpcomingEvents(120);
            if (upcoming.length > 0) {
                sections.push(this.buildCalendarSection(upcoming, 'Coming Up'));
            }
        } catch {
            // Calendar unavailable
        }

        // Active nudges
        const nudges = NudgeService.getActiveNudges();
        if (nudges.length > 0) {
            sections.push({
                title: 'Needs Attention',
                icon: '⚡',
                content: `${nudges.length} item${nudges.length > 1 ? 's' : ''} need your attention`,
                items: nudges.slice(0, 3).map(n => ({
                    id: n.id,
                    text: n.title,
                    subtext: n.message,
                    type: 'reminder' as const,
                    priority: n.priority === 'urgent' ? 'high' : n.priority === 'high' ? 'medium' : 'low',
                })),
            });
        }

        const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

        return {
            type: 'quick',
            greeting,
            summary: sections.length > 0
                ? `You have ${sections.reduce((acc, s) => acc + (s.items?.length || 0), 0)} items to review.`
                : 'All clear! No pressing items.',
            sections,
            generatedAt: now,
        };
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // Section Builders
    // ─────────────────────────────────────────────────────────────────────────────

    private buildWeatherSection(weather: WeatherData): BriefingSection {
        const temp = Math.round(weather.temperature);
        const feelsLike = Math.round(weather.feelsLike);
        const emoji = this.getWeatherEmoji(weather.condition);

        return {
            title: 'Weather',
            icon: emoji,
            content: `${temp}°F (feels like ${feelsLike}°F) — ${weather.condition}`,
            items: weather.alerts?.map((alert, i) => ({
                id: `alert_${i}`,
                text: alert,
                type: 'insight' as const,
                priority: 'high' as const,
            })),
        };
    }

    private buildCalendarSection(events: CalendarEvent[], title: string): BriefingSection {
        return {
            title,
            icon: '📅',
            content: `${events.length} event${events.length > 1 ? 's' : ''}`,
            items: events.slice(0, 5).map(e => ({
                id: e.id,
                text: e.title,
                subtext: this.formatEventTime(e),
                type: 'event' as const,
                action: {
                    label: 'View',
                    type: 'navigate' as const,
                    payload: { screen: 'calendar', eventId: e.id },
                },
            })),
        };
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // Data Fetchers
    // ─────────────────────────────────────────────────────────────────────────────

    private async getPendingItems(): Promise<BriefingItem[]> {
        const items: BriefingItem[] = [];

        // Get pending reminders from vault
        try {
            const reminders = await VaultService.search('tag:reminder tag:pending');
            for (const r of reminders.slice(0, 5)) {
                items.push({
                    id: r.path,
                    text: r.title,
                    type: 'reminder',
                    action: {
                        label: 'View',
                        type: 'navigate',
                        payload: { screen: 'vault', path: r.path },
                    },
                });
            }
        } catch {
            // Vault search failed
        }

        // Get deferred decisions
        try {
            const deferred = await VaultService.search('tag:decision tag:deferred');
            for (const d of deferred.slice(0, 3)) {
                items.push({
                    id: d.path,
                    text: d.title,
                    subtext: 'Deferred decision',
                    type: 'task',
                    priority: 'medium',
                });
            }
        } catch {
            // Vault search failed
        }

        return items;
    }

    private async getFocusSuggestion(): Promise<string | null> {
        const hour = new Date().getHours();

        // Morning focus suggestions
        if (hour >= 6 && hour < 10) {
            return 'Start your day with a 25-minute deep work session on your most important task.';
        }

        // Late morning
        if (hour >= 10 && hour < 12) {
            return 'Good time for collaborative work and meetings.';
        }

        // Afternoon
        if (hour >= 14 && hour < 16) {
            return 'Post-lunch energy dip — try a 15-minute focus sprint or a short walk.';
        }

        return null;
    }

    private async getDaySummary(): Promise<DaySummary> {
        // In a real implementation, this would aggregate data from various services
        return {
            eventsAttended: 3,
            tasksCompleted: 5,
            notesCreated: 2,
            messagesReceived: 15,
            focusMinutes: 90,
            highlights: [
                'Completed project planning',
                'Good focus session in the morning',
            ],
        };
    }

    private async getNeglectedContacts(): Promise<Array<PriorityContact & { lastContact: Date }>> {
        try {
            const contacts = await ContactsService.getPriorityContacts();
            const now = new Date();
            const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

            // Filter to contacts not contacted in a week
            // In real implementation, would track actual contact dates
            return contacts.slice(0, 3).map(c => ({
                ...c,
                lastContact: oneWeekAgo,
            }));
        } catch {
            return [];
        }
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // AI Insights
    // ─────────────────────────────────────────────────────────────────────────────

    private async generateMorningInsight(sections: BriefingSection[]): Promise<string | undefined> {
        try {
            const context = sections.map(s => `${s.title}: ${s.content}`).join('\n');

            const prompt = `Based on this morning context, give ONE brief (1-2 sentences) actionable insight or motivation for the day:

${context}

Keep it personal and encouraging. Focus on what matters most today.`;

            return await LLMService.complete(prompt, {
                maxTokens: 100,
                temperature: 0.7,
            });
        } catch {
            return undefined;
        }
    }

    private async generateEveningInsight(summary: DaySummary): Promise<string | undefined> {
        try {
            const prompt = `Based on this day summary, give ONE brief (1-2 sentences) reflection or suggestion for tomorrow:

Events attended: ${summary.eventsAttended}
Tasks completed: ${summary.tasksCompleted}
Focus time: ${summary.focusMinutes} minutes
Highlights: ${summary.highlights.join(', ')}

Keep it warm and constructive.`;

            return await LLMService.complete(prompt, {
                maxTokens: 100,
                temperature: 0.7,
            });
        } catch {
            return undefined;
        }
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // Formatters
    // ─────────────────────────────────────────────────────────────────────────────

    private getMorningGreeting(): string {
        const hour = new Date().getHours();
        if (hour < 6) return 'Early bird! Here\'s your day ahead';
        if (hour < 9) return 'Good morning! Ready for the day?';
        if (hour < 12) return 'Good morning! Here\'s what\'s happening';
        return 'Good day! Here\'s your briefing';
    }

    private getEveningGreeting(): string {
        const hour = new Date().getHours();
        if (hour < 18) return 'Wrapping up? Here\'s your day in review';
        if (hour < 21) return 'Good evening! Time to wind down';
        return 'End of day — let\'s reflect';
    }

    private getWeatherEmoji(condition: string): string {
        const lower = condition.toLowerCase();
        if (lower.includes('sun') || lower.includes('clear')) return '☀️';
        if (lower.includes('cloud')) return '☁️';
        if (lower.includes('rain')) return '🌧️';
        if (lower.includes('snow')) return '❄️';
        if (lower.includes('storm') || lower.includes('thunder')) return '⛈️';
        if (lower.includes('fog') || lower.includes('mist')) return '🌫️';
        return '🌤️';
    }

    private formatEventTime(event: CalendarEvent): string {
        const start = new Date(event.startDate);
        return start.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    }

    private formatRelativeTime(date: Date): string {
        const now = new Date();
        const diff = now.getTime() - date.getTime();
        const days = Math.floor(diff / (24 * 60 * 60 * 1000));

        if (days === 0) return 'Today';
        if (days === 1) return 'Yesterday';
        if (days < 7) return `${days} days ago`;
        if (days < 14) return 'Last week';
        if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
        return `${Math.floor(days / 30)} months ago`;
    }

    private formatDaySummary(summary: DaySummary): string {
        const parts: string[] = [];

        if (summary.eventsAttended > 0) {
            parts.push(`${summary.eventsAttended} event${summary.eventsAttended > 1 ? 's' : ''}`);
        }
        if (summary.tasksCompleted > 0) {
            parts.push(`${summary.tasksCompleted} task${summary.tasksCompleted > 1 ? 's' : ''} completed`);
        }
        if (summary.focusMinutes > 0) {
            const hours = Math.floor(summary.focusMinutes / 60);
            const mins = summary.focusMinutes % 60;
            if (hours > 0) {
                parts.push(`${hours}h ${mins}m focused`);
            } else {
                parts.push(`${mins}m focused`);
            }
        }

        return parts.join(' • ') || 'Quiet day';
    }

    private buildMorningSummary(sections: BriefingSection[]): string {
        const eventSection = sections.find(s => s.title.includes('Schedule'));
        const pendingSection = sections.find(s => s.title === 'Pending Items');

        const parts: string[] = [];

        if (eventSection?.items) {
            parts.push(`${eventSection.items.length} event${eventSection.items.length > 1 ? 's' : ''} today`);
        }
        if (pendingSection?.items) {
            parts.push(`${pendingSection.items.length} pending item${pendingSection.items.length > 1 ? 's' : ''}`);
        }

        return parts.length > 0 ? parts.join(', ') : 'Clear schedule ahead';
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // Cache Access
    // ─────────────────────────────────────────────────────────────────────────────

    getLastMorningBriefing(): Briefing | null {
        return this.lastMorningBriefing;
    }

    getLastEveningBriefing(): Briefing | null {
        return this.lastEveningBriefing;
    }
}

export const BriefingService = new BriefingServiceClass();
