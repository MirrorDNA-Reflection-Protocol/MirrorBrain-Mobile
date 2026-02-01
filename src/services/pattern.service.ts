/**
 * Pattern Service — Behavior Pattern Recognition
 *
 * Purpose: Learn user behavior patterns for proactive suggestions.
 * Tracks: Time habits, app sequences, location behaviors, communication patterns.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

export type PatternType =
    | 'time_habit'      // Actions at specific times
    | 'app_sequence'    // App usage sequences
    | 'location_habit'  // Actions at locations
    | 'communication'   // Communication patterns
    | 'focus_pattern'   // Focus session patterns
    | 'response_time';  // Response time patterns

export interface Pattern {
    id: string;
    type: PatternType;
    name: string;
    description: string;
    confidence: number; // 0-1
    occurrences: number;
    lastSeen: Date;
    context: PatternContext;
    suggestion?: PatternSuggestion;
}

export interface PatternContext {
    timeOfDay?: { start: number; end: number }; // Hours (0-23)
    dayOfWeek?: number[]; // 0-6 (Sunday-Saturday)
    location?: string;
    precedingApp?: string;
    followingApp?: string;
    duration?: number; // Average duration in minutes
}

export interface PatternSuggestion {
    action: string;
    message: string;
    triggerTime?: Date;
    payload?: any;
}

export interface PatternEvent {
    type: string;
    timestamp: Date;
    metadata: Record<string, any>;
}

const STORAGE_KEY = 'mirror_patterns';
const MIN_OCCURRENCES_FOR_PATTERN = 3;
const CONFIDENCE_THRESHOLD = 0.6;

class PatternServiceClass {
    private patterns: Map<string, Pattern> = new Map();
    private eventHistory: PatternEvent[] = [];
    private initialized = false;

    /**
     * Initialize pattern service
     */
    async initialize(): Promise<void> {
        if (this.initialized) return;

        try {
            const stored = await AsyncStorage.getItem(STORAGE_KEY);
            if (stored) {
                const data = JSON.parse(stored);
                if (data.patterns) {
                    for (const p of data.patterns) {
                        p.lastSeen = new Date(p.lastSeen);
                        this.patterns.set(p.id, p);
                    }
                }
                if (data.eventHistory) {
                    this.eventHistory = data.eventHistory.map((e: any) => ({
                        ...e,
                        timestamp: new Date(e.timestamp),
                    }));
                }
            }
            this.initialized = true;
            console.log('[PatternService] Loaded', this.patterns.size, 'patterns');
        } catch (error) {
            console.error('[PatternService] Failed to load:', error);
        }
    }

    /**
     * Save patterns to storage
     */
    private async save(): Promise<void> {
        try {
            const data = {
                patterns: Array.from(this.patterns.values()),
                eventHistory: this.eventHistory.slice(-500), // Keep last 500 events
            };
            await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        } catch (error) {
            console.error('[PatternService] Failed to save:', error);
        }
    }

    /**
     * Record an event for pattern analysis
     */
    async recordEvent(type: string, metadata: Record<string, any> = {}): Promise<void> {
        const event: PatternEvent = {
            type,
            timestamp: new Date(),
            metadata,
        };

        this.eventHistory.push(event);

        // Analyze for patterns
        await this.analyzePatterns();

        // Prune old events
        if (this.eventHistory.length > 1000) {
            this.eventHistory = this.eventHistory.slice(-500);
        }

        await this.save();
    }

    /**
     * Analyze events for patterns
     */
    private async analyzePatterns(): Promise<void> {
        await this.analyzeTimePatterns();
        await this.analyzeAppSequences();
        await this.analyzeFocusPatterns();
    }

    /**
     * Analyze time-based patterns
     */
    private async analyzeTimePatterns(): Promise<void> {
        // Group events by type and hour
        const hourlyEvents = new Map<string, Map<number, number>>();

        for (const event of this.eventHistory) {
            const hour = event.timestamp.getHours();
            const key = event.type;

            if (!hourlyEvents.has(key)) {
                hourlyEvents.set(key, new Map());
            }

            const hourMap = hourlyEvents.get(key)!;
            hourMap.set(hour, (hourMap.get(hour) || 0) + 1);
        }

        // Find patterns with consistent timing
        for (const [eventType, hourMap] of hourlyEvents) {
            const maxHour = this.findPeakHour(hourMap);
            if (maxHour === null) continue;

            const count = hourMap.get(maxHour) || 0;
            if (count < MIN_OCCURRENCES_FOR_PATTERN) continue;

            const totalEvents = Array.from(hourMap.values()).reduce((a, b) => a + b, 0);
            const confidence = count / totalEvents;

            if (confidence >= CONFIDENCE_THRESHOLD) {
                const patternId = `time_${eventType}_${maxHour}`;
                this.updatePattern({
                    id: patternId,
                    type: 'time_habit',
                    name: `${eventType} at ${this.formatHour(maxHour)}`,
                    description: `You typically ${eventType.toLowerCase()} around ${this.formatHour(maxHour)}`,
                    confidence,
                    occurrences: count,
                    lastSeen: new Date(),
                    context: {
                        timeOfDay: { start: maxHour, end: maxHour + 1 },
                    },
                });
            }
        }
    }

    /**
     * Analyze app sequence patterns
     */
    private async analyzeAppSequences(): Promise<void> {
        const sequences = new Map<string, number>();
        const appEvents = this.eventHistory.filter(e => e.type === 'app_open');

        for (let i = 0; i < appEvents.length - 1; i++) {
            const current = appEvents[i].metadata.packageName;
            const next = appEvents[i + 1].metadata.packageName;

            if (!current || !next || current === next) continue;

            // Check if within 5 minutes
            const timeDiff = appEvents[i + 1].timestamp.getTime() - appEvents[i].timestamp.getTime();
            if (timeDiff > 5 * 60 * 1000) continue;

            const seqKey = `${current}→${next}`;
            sequences.set(seqKey, (sequences.get(seqKey) || 0) + 1);
        }

        // Find frequent sequences
        for (const [seq, count] of sequences) {
            if (count < MIN_OCCURRENCES_FOR_PATTERN) continue;

            const [preceding, following] = seq.split('→');
            const patternId = `seq_${seq}`;

            this.updatePattern({
                id: patternId,
                type: 'app_sequence',
                name: `${this.getAppName(preceding)} → ${this.getAppName(following)}`,
                description: `You often open ${this.getAppName(following)} after ${this.getAppName(preceding)}`,
                confidence: Math.min(count / 10, 1),
                occurrences: count,
                lastSeen: new Date(),
                context: {
                    precedingApp: preceding,
                    followingApp: following,
                },
            });
        }
    }

    /**
     * Analyze focus session patterns
     */
    private async analyzeFocusPatterns(): Promise<void> {
        const focusEvents = this.eventHistory.filter(e =>
            e.type === 'focus_started' || e.type === 'focus_ended'
        );

        // Analyze typical focus durations
        const durations: number[] = [];
        for (let i = 0; i < focusEvents.length - 1; i++) {
            if (focusEvents[i].type === 'focus_started' && focusEvents[i + 1].type === 'focus_ended') {
                const duration = (focusEvents[i + 1].timestamp.getTime() - focusEvents[i].timestamp.getTime()) / 60000;
                if (duration > 0 && duration < 480) { // Valid duration (< 8 hours)
                    durations.push(duration);
                }
            }
        }

        if (durations.length >= MIN_OCCURRENCES_FOR_PATTERN) {
            const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;

            this.updatePattern({
                id: 'focus_duration',
                type: 'focus_pattern',
                name: 'Typical Focus Duration',
                description: `Your average focus session is ${Math.round(avgDuration)} minutes`,
                confidence: Math.min(durations.length / 10, 1),
                occurrences: durations.length,
                lastSeen: new Date(),
                context: {
                    duration: avgDuration,
                },
            });
        }
    }

    /**
     * Update or create a pattern
     */
    private updatePattern(pattern: Pattern): void {
        const existing = this.patterns.get(pattern.id);
        if (existing) {
            existing.confidence = (existing.confidence + pattern.confidence) / 2;
            existing.occurrences = pattern.occurrences;
            existing.lastSeen = pattern.lastSeen;
        } else {
            this.patterns.set(pattern.id, pattern);
        }
    }

    /**
     * Get all recognized patterns
     */
    getPatterns(): Pattern[] {
        return Array.from(this.patterns.values())
            .filter(p => p.confidence >= CONFIDENCE_THRESHOLD)
            .sort((a, b) => b.confidence - a.confidence);
    }

    /**
     * Get patterns by type
     */
    getPatternsByType(type: PatternType): Pattern[] {
        return this.getPatterns().filter(p => p.type === type);
    }

    /**
     * Get suggestions based on current context
     */
    getSuggestions(): PatternSuggestion[] {
        const suggestions: PatternSuggestion[] = [];
        const now = new Date();
        const currentHour = now.getHours();

        for (const pattern of this.patterns.values()) {
            if (pattern.confidence < CONFIDENCE_THRESHOLD) continue;

            // Check time-based patterns
            if (pattern.type === 'time_habit' && pattern.context.timeOfDay) {
                const { start, end } = pattern.context.timeOfDay;
                if (currentHour >= start && currentHour < end) {
                    suggestions.push({
                        action: pattern.name,
                        message: `Based on your patterns: ${pattern.description}`,
                        triggerTime: now,
                    });
                }
            }
        }

        return suggestions;
    }

    /**
     * Get insights about user behavior
     */
    getInsights(): string[] {
        const insights: string[] = [];
        const patterns = this.getPatterns();

        // Most productive hours
        const timePatterns = patterns.filter(p => p.type === 'time_habit');
        if (timePatterns.length > 0) {
            const topTime = timePatterns[0];
            insights.push(`Your most consistent activity time is around ${topTime.context.timeOfDay?.start}:00`);
        }

        // Focus patterns
        const focusPattern = patterns.find(p => p.id === 'focus_duration');
        if (focusPattern) {
            insights.push(focusPattern.description);
        }

        // App sequences
        const seqPatterns = patterns.filter(p => p.type === 'app_sequence');
        if (seqPatterns.length > 0) {
            insights.push(`You have ${seqPatterns.length} frequent app workflow${seqPatterns.length > 1 ? 's' : ''}`);
        }

        return insights;
    }

    /**
     * Clear all patterns
     */
    async clear(): Promise<void> {
        this.patterns.clear();
        this.eventHistory = [];
        await AsyncStorage.removeItem(STORAGE_KEY);
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // Helpers
    // ─────────────────────────────────────────────────────────────────────────────

    private findPeakHour(hourMap: Map<number, number>): number | null {
        let maxHour = null;
        let maxCount = 0;

        for (const [hour, count] of hourMap) {
            if (count > maxCount) {
                maxCount = count;
                maxHour = hour;
            }
        }

        return maxHour;
    }

    private formatHour(hour: number): string {
        if (hour === 0) return '12 AM';
        if (hour < 12) return `${hour} AM`;
        if (hour === 12) return '12 PM';
        return `${hour - 12} PM`;
    }

    private getAppName(packageName: string): string {
        const names: Record<string, string> = {
            'com.whatsapp': 'WhatsApp',
            'com.google.android.apps.messaging': 'Messages',
            'org.telegram.messenger': 'Telegram',
            'com.Slack': 'Slack',
            'com.google.android.gm': 'Gmail',
            'com.google.android.calendar': 'Calendar',
            'com.spotify.music': 'Spotify',
        };
        return names[packageName] || packageName.split('.').pop() || packageName;
    }
}

export const PatternService = new PatternServiceClass();
