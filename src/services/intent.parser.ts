/**
 * Intent Parser Service — Natural Language to Actions
 *
 * Purpose: Parse natural language input into structured intents.
 * Patterns: Reminders, messages, notes, calendar, app commands.
 */

export type IntentType =
    | 'reminder'
    | 'message'
    | 'note'
    | 'calendar_event'
    | 'app_command'
    | 'search'
    | 'timer'
    | 'call'
    | 'navigate'
    | 'settings'
    | 'unknown';

export interface ParsedIntent {
    type: IntentType;
    confidence: number; // 0-1
    raw: string;
    entities: IntentEntities;
    action?: string;
}

export interface IntentEntities {
    // Time-related
    datetime?: Date;
    duration?: number; // in minutes
    timeExpression?: string; // "tomorrow at 9am", "in 2 hours"

    // People
    contact?: string;
    contacts?: string[];

    // Content
    subject?: string;
    body?: string;
    note?: string;

    // App/Action
    appName?: string;
    command?: string;

    // Location
    location?: string;

    // Query
    query?: string;
}

// Pattern definitions for intent matching
interface IntentPattern {
    type: IntentType;
    patterns: RegExp[];
    extractor: (match: RegExpMatchArray, input: string) => Partial<IntentEntities>;
}

const INTENT_PATTERNS: IntentPattern[] = [
    // Reminder patterns
    {
        type: 'reminder',
        patterns: [
            /remind(?:er)?\s+(?:me\s+)?(?:to\s+)?(.+?)(?:\s+(?:at|on|in|tomorrow|tonight|today)\s+(.+))?$/i,
            /(?:set\s+)?(?:a\s+)?reminder\s+(?:for\s+)?(.+?)(?:\s+(?:at|on|in)\s+(.+))?$/i,
            /don'?t\s+(?:let\s+me\s+)?forget\s+(?:to\s+)?(.+)/i,
        ],
        extractor: (match, input) => ({
            subject: match[1]?.trim(),
            timeExpression: match[2]?.trim(),
            datetime: parseTimeExpression(match[2] || 'later'),
        }),
    },

    // Message/Text patterns
    {
        type: 'message',
        patterns: [
            /(?:send|text|message)\s+(.+?)\s+(?:that|saying|to say)\s+(.+)/i,
            /(?:tell|let)\s+(.+?)\s+(?:know\s+)?(?:that\s+)?(.+)/i,
            /text\s+(.+?)\s+(.+)/i,
            /message\s+(.+?)\s+(.+)/i,
        ],
        extractor: (match) => ({
            contact: match[1]?.trim(),
            body: match[2]?.trim(),
        }),
    },

    // Note/Save patterns
    {
        type: 'note',
        patterns: [
            /(?:save|write|add|create)\s+(?:a\s+)?note\s*:?\s*(.+)/i,
            /note\s+(?:to\s+self\s*:?\s*)?(.+)/i,
            /save\s+(?:this|that)\s+(?:for\s+later)?:?\s*(.+)?/i,
            /remember\s+(?:that\s+)?(.+)/i,
            /jot\s+(?:down\s+)?(.+)/i,
        ],
        extractor: (match) => ({
            note: match[1]?.trim(),
        }),
    },

    // Calendar event patterns
    {
        type: 'calendar_event',
        patterns: [
            /(?:schedule|add|create|put)\s+(?:a\s+)?(?:meeting|event|appointment)\s+(?:with\s+)?(.+?)(?:\s+(?:at|on|for)\s+(.+))?$/i,
            /(?:add|put)\s+(.+?)\s+(?:on|to)\s+(?:my\s+)?calendar(?:\s+(?:at|on|for)\s+(.+))?$/i,
            /(?:block|book)\s+(?:time\s+)?(?:for\s+)?(.+?)(?:\s+(?:at|on|for)\s+(.+))?$/i,
        ],
        extractor: (match) => ({
            subject: match[1]?.trim(),
            timeExpression: match[2]?.trim(),
            datetime: parseTimeExpression(match[2] || ''),
        }),
    },

    // Timer patterns
    {
        type: 'timer',
        patterns: [
            /(?:set\s+)?(?:a\s+)?timer\s+(?:for\s+)?(\d+)\s*(second|minute|hour|min|sec|hr)s?/i,
            /(\d+)\s*(second|minute|hour|min|sec|hr)s?\s+timer/i,
        ],
        extractor: (match) => {
            const amount = parseInt(match[1], 10);
            const unit = match[2].toLowerCase();
            let minutes = amount;
            if (unit.startsWith('sec')) minutes = amount / 60;
            if (unit.startsWith('hour') || unit === 'hr') minutes = amount * 60;
            return { duration: minutes };
        },
    },

    // App command patterns
    {
        type: 'app_command',
        patterns: [
            /(?:open|launch|start|run)\s+(.+)/i,
            /(?:go\s+to|switch\s+to)\s+(.+)/i,
        ],
        extractor: (match) => ({
            appName: match[1]?.trim(),
        }),
    },

    // Call patterns
    {
        type: 'call',
        patterns: [
            /(?:call|phone|dial)\s+(.+)/i,
        ],
        extractor: (match) => ({
            contact: match[1]?.trim(),
        }),
    },

    // Navigation patterns
    {
        type: 'navigate',
        patterns: [
            /(?:navigate|directions?|take\s+me)\s+(?:to\s+)?(.+)/i,
            /(?:how\s+(?:do\s+I\s+)?get\s+to|where\s+is)\s+(.+)/i,
        ],
        extractor: (match) => ({
            location: match[1]?.trim(),
        }),
    },

    // Search patterns
    {
        type: 'search',
        patterns: [
            /(?:search|look\s+up|find|google)\s+(?:for\s+)?(.+)/i,
            /what\s+(?:is|are)\s+(.+)/i,
            /who\s+(?:is|was)\s+(.+)/i,
            /how\s+(?:do\s+(?:I|you)|to)\s+(.+)/i,
        ],
        extractor: (match) => ({
            query: match[1]?.trim(),
        }),
    },

    // Settings patterns
    {
        type: 'settings',
        patterns: [
            /(?:turn\s+)?(?:on|off|enable|disable)\s+(.+)/i,
            /(?:set|change)\s+(.+?)\s+to\s+(.+)/i,
        ],
        extractor: (match) => ({
            command: match[0],
            subject: match[1]?.trim(),
        }),
    },
];

/**
 * Parse time expression into Date
 */
function parseTimeExpression(expression: string): Date | undefined {
    if (!expression) return undefined;

    const now = new Date();
    const lower = expression.toLowerCase().trim();

    // Relative time patterns
    const inPattern = /in\s+(\d+)\s*(minute|hour|day|week|month)s?/i;
    const inMatch = lower.match(inPattern);
    if (inMatch) {
        const amount = parseInt(inMatch[1], 10);
        const unit = inMatch[2].toLowerCase();
        const result = new Date(now);

        switch (unit) {
            case 'minute':
                result.setMinutes(result.getMinutes() + amount);
                break;
            case 'hour':
                result.setHours(result.getHours() + amount);
                break;
            case 'day':
                result.setDate(result.getDate() + amount);
                break;
            case 'week':
                result.setDate(result.getDate() + amount * 7);
                break;
            case 'month':
                result.setMonth(result.getMonth() + amount);
                break;
        }
        return result;
    }

    // Named times
    if (lower.includes('tomorrow')) {
        const result = new Date(now);
        result.setDate(result.getDate() + 1);

        // Check for time
        const timeMatch = lower.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
        if (timeMatch) {
            let hours = parseInt(timeMatch[1], 10);
            const minutes = parseInt(timeMatch[2] || '0', 10);
            const ampm = timeMatch[3]?.toLowerCase();

            if (ampm === 'pm' && hours < 12) hours += 12;
            if (ampm === 'am' && hours === 12) hours = 0;

            result.setHours(hours, minutes, 0, 0);
        } else if (lower.includes('morning')) {
            result.setHours(9, 0, 0, 0);
        } else if (lower.includes('afternoon')) {
            result.setHours(14, 0, 0, 0);
        } else if (lower.includes('evening') || lower.includes('night')) {
            result.setHours(19, 0, 0, 0);
        } else {
            result.setHours(9, 0, 0, 0); // Default to 9am
        }
        return result;
    }

    if (lower.includes('today') || lower.includes('tonight')) {
        const result = new Date(now);

        const timeMatch = lower.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
        if (timeMatch) {
            let hours = parseInt(timeMatch[1], 10);
            const minutes = parseInt(timeMatch[2] || '0', 10);
            const ampm = timeMatch[3]?.toLowerCase();

            if (ampm === 'pm' && hours < 12) hours += 12;
            if (ampm === 'am' && hours === 12) hours = 0;

            result.setHours(hours, minutes, 0, 0);
        } else if (lower.includes('tonight')) {
            result.setHours(20, 0, 0, 0);
        }
        return result;
    }

    // Just time (assume today or tomorrow if passed)
    const justTimeMatch = lower.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i);
    if (justTimeMatch) {
        const result = new Date(now);
        let hours = parseInt(justTimeMatch[1], 10);
        const minutes = parseInt(justTimeMatch[2] || '0', 10);
        const ampm = justTimeMatch[3]?.toLowerCase();

        if (ampm === 'pm' && hours < 12) hours += 12;
        if (ampm === 'am' && hours === 12) hours = 0;

        result.setHours(hours, minutes, 0, 0);

        // If time has passed today, assume tomorrow
        if (result < now) {
            result.setDate(result.getDate() + 1);
        }
        return result;
    }

    // "later" = 1 hour from now
    if (lower === 'later') {
        const result = new Date(now);
        result.setHours(result.getHours() + 1);
        return result;
    }

    return undefined;
}

class IntentParserClass {
    /**
     * Parse natural language input into a structured intent
     */
    parse(input: string): ParsedIntent {
        const trimmed = input.trim();

        for (const pattern of INTENT_PATTERNS) {
            for (const regex of pattern.patterns) {
                const match = trimmed.match(regex);
                if (match) {
                    const entities = pattern.extractor(match, trimmed);
                    return {
                        type: pattern.type,
                        confidence: this.calculateConfidence(match, trimmed),
                        raw: trimmed,
                        entities,
                    };
                }
            }
        }

        // No pattern matched - return unknown
        return {
            type: 'unknown',
            confidence: 0,
            raw: trimmed,
            entities: {
                query: trimmed,
            },
        };
    }

    /**
     * Parse multiple potential intents from input
     */
    parseAll(input: string): ParsedIntent[] {
        const trimmed = input.trim();
        const results: ParsedIntent[] = [];

        for (const pattern of INTENT_PATTERNS) {
            for (const regex of pattern.patterns) {
                const match = trimmed.match(regex);
                if (match) {
                    const entities = pattern.extractor(match, trimmed);
                    results.push({
                        type: pattern.type,
                        confidence: this.calculateConfidence(match, trimmed),
                        raw: trimmed,
                        entities,
                    });
                }
            }
        }

        // Sort by confidence
        results.sort((a, b) => b.confidence - a.confidence);

        if (results.length === 0) {
            results.push({
                type: 'unknown',
                confidence: 0,
                raw: trimmed,
                entities: { query: trimmed },
            });
        }

        return results;
    }

    /**
     * Check if input looks like an actionable command
     */
    isActionable(input: string): boolean {
        const parsed = this.parse(input);
        return parsed.type !== 'unknown' && parsed.confidence > 0.5;
    }

    /**
     * Get suggested action description for UI
     */
    getActionDescription(intent: ParsedIntent): string {
        switch (intent.type) {
            case 'reminder':
                return `Set reminder: ${intent.entities.subject || 'untitled'}`;
            case 'message':
                return `Message ${intent.entities.contact}: ${intent.entities.body?.slice(0, 30)}...`;
            case 'note':
                return `Save note: ${intent.entities.note?.slice(0, 40)}...`;
            case 'calendar_event':
                return `Add to calendar: ${intent.entities.subject}`;
            case 'timer':
                return `Set timer for ${intent.entities.duration} minutes`;
            case 'app_command':
                return `Open ${intent.entities.appName}`;
            case 'call':
                return `Call ${intent.entities.contact}`;
            case 'navigate':
                return `Navigate to ${intent.entities.location}`;
            case 'search':
                return `Search: ${intent.entities.query}`;
            case 'settings':
                return `Change setting: ${intent.entities.subject}`;
            default:
                return 'Ask MirrorBrain';
        }
    }

    /**
     * Calculate confidence score for a match
     */
    private calculateConfidence(match: RegExpMatchArray, input: string): number {
        // Base confidence on how much of the input was matched
        const matchLength = match[0].length;
        const inputLength = input.length;
        const coverage = matchLength / inputLength;

        // Bonus for having extracted entities
        const entityBonus = match.slice(1).filter(m => m && m.trim()).length * 0.1;

        return Math.min(1, coverage * 0.8 + entityBonus + 0.1);
    }
}

export const IntentParser = new IntentParserClass();
