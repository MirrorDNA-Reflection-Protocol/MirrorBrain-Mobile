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
    | 'device_skill'
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

    // Device skill
    skillId?: string;
    skillArgs?: Record<string, unknown>;
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

    // Device skill patterns — map natural language to Tasker HTTP server skills
    {
        type: 'device_skill',
        patterns: [
            /(?:set\s+)?(?:the\s+)?volume\s+(?:to\s+)?(\d+)/i,
            /(?:turn\s+)?(?:the\s+)?volume\s+(up|down|max|min|mute)/i,
        ],
        extractor: (match) => {
            let level = 7;
            const val = match[1]?.toLowerCase();
            if (val === 'up') level = 12;
            else if (val === 'down') level = 4;
            else if (val === 'max') level = 15;
            else if (val === 'min' || val === 'mute') level = 0;
            else if (/^\d+$/.test(val)) level = Math.min(15, parseInt(val, 10));
            return { skillId: 'set_volume', skillArgs: { stream: 'media', level } };
        },
    },
    {
        type: 'device_skill',
        patterns: [
            /(?:set\s+)?(?:the\s+)?brightness\s+(?:to\s+)?(\d+)/i,
            /(?:turn\s+)?brightness\s+(up|down|max|min|auto)/i,
        ],
        extractor: (match) => {
            const val = match[1]?.toLowerCase();
            if (val === 'auto') return { skillId: 'set_brightness', skillArgs: { auto: true } };
            let level = 128;
            if (val === 'up' || val === 'max') level = 255;
            else if (val === 'down' || val === 'min') level = 20;
            else if (/^\d+$/.test(val)) level = Math.min(255, parseInt(val, 10));
            return { skillId: 'set_brightness', skillArgs: { level } };
        },
    },
    {
        type: 'device_skill',
        patterns: [
            /(?:turn\s+)?(?:on|off)\s+(?:the\s+)?(?:flash\s*light|torch)/i,
            /(?:flash\s*light|torch)\s+(on|off)/i,
        ],
        extractor: (match) => {
            const state = /off/i.test(match[0]) ? 'off' : 'on';
            return { skillId: 'toggle_flashlight', skillArgs: { state } };
        },
    },
    {
        type: 'device_skill',
        patterns: [
            /(?:turn\s+)?(?:on|off)\s+(?:the\s+)?wi-?fi/i,
            /wi-?fi\s+(on|off)/i,
        ],
        extractor: (match) => {
            const state = /off/i.test(match[0]) ? 'off' : 'on';
            return { skillId: 'toggle_wifi', skillArgs: { state } };
        },
    },
    {
        type: 'device_skill',
        patterns: [
            /(?:turn\s+)?(?:on|off)\s+(?:the\s+)?bluetooth/i,
            /bluetooth\s+(on|off)/i,
        ],
        extractor: (match) => {
            const state = /off/i.test(match[0]) ? 'off' : 'on';
            return { skillId: 'toggle_bluetooth', skillArgs: { state } };
        },
    },
    {
        type: 'device_skill',
        patterns: [
            /(?:turn\s+)?(?:on|off)\s+(?:do\s+not\s+disturb|dnd)/i,
            /(?:do\s+not\s+disturb|dnd)\s+(on|off)/i,
        ],
        extractor: (match) => {
            const state = /off/i.test(match[0]) ? 'off' : 'on';
            return { skillId: 'toggle_dnd', skillArgs: { state } };
        },
    },
    {
        type: 'device_skill',
        patterns: [
            /(?:play|resume)\s+(?:the\s+)?music/i,
            /(?:pause|stop)\s+(?:the\s+)?music/i,
            /(?:next|skip)\s+(?:track|song)/i,
            /(?:previous|prev|last)\s+(?:track|song)/i,
            /(?:play|pause|stop|next|previous|skip)\s*$/i,
        ],
        extractor: (match) => {
            const text = match[0].toLowerCase();
            let action = 'play_pause';
            if (/pause|stop/.test(text)) action = 'pause';
            else if (/play|resume/.test(text)) action = 'play';
            else if (/next|skip/.test(text)) action = 'next';
            else if (/prev/.test(text)) action = 'previous';
            return { skillId: 'media_control', skillArgs: { action } };
        },
    },
    {
        type: 'device_skill',
        patterns: [
            /(?:what(?:'?s|\s+is)\s+(?:the\s+)?|check\s+(?:the\s+)?)battery/i,
            /battery\s+(?:level|status|percent)/i,
            /how\s+much\s+battery/i,
        ],
        extractor: () => ({ skillId: 'battery_status', skillArgs: {} }),
    },
    {
        type: 'device_skill',
        patterns: [
            /take\s+(?:a\s+)?screenshot/i,
            /capture\s+(?:the\s+)?screen/i,
            /screen\s*shot/i,
        ],
        extractor: () => ({ skillId: 'screenshot', skillArgs: {} }),
    },
    {
        type: 'device_skill',
        patterns: [
            /(?:set\s+)?(?:an?\s+)?alarm\s+(?:for\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i,
            /wake\s+(?:me\s+)?(?:up\s+)?(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i,
        ],
        extractor: (match) => {
            let hour = parseInt(match[1], 10);
            const minute = parseInt(match[2] || '0', 10);
            const ampm = match[3]?.toLowerCase();
            if (ampm === 'pm' && hour < 12) hour += 12;
            if (ampm === 'am' && hour === 12) hour = 0;
            return { skillId: 'set_alarm', skillArgs: { hour, minute } };
        },
    },
    {
        type: 'device_skill',
        patterns: [
            /(?:copy|clipboard)\s+(.+)/i,
            /(?:set|put)\s+(?:the\s+)?clipboard\s+(?:to\s+)?(.+)/i,
        ],
        extractor: (match) => {
            const text = (match[1] || match[2])?.trim();
            return { skillId: 'clipboard_set', skillArgs: { text } };
        },
    },
    {
        type: 'device_skill',
        patterns: [
            /(?:what(?:'?s|\s+is)\s+(?:in\s+)?(?:the\s+)?|read\s+(?:the\s+)?|paste\s+(?:the\s+)?)clipboard/i,
        ],
        extractor: () => ({ skillId: 'clipboard_get', skillArgs: {} }),
    },
    {
        type: 'device_skill',
        patterns: [
            /(?:whatsapp|wa)\s+(.+?)(?:\s+(?:saying|that|message|:)\s+(.+))?$/i,
            /(?:send\s+)?(?:a\s+)?whatsapp\s+(?:to\s+)?(.+?)(?:\s+(?:saying|that|message|:)\s+(.+))?$/i,
        ],
        extractor: (match) => {
            const phone = match[1]?.trim();
            const message = match[2]?.trim() || '';
            return { skillId: 'send_whatsapp', skillArgs: { phone, message } };
        },
    },

    // Settings patterns (catch-all for on/off patterns not caught above)
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
            case 'device_skill':
                return `Device: ${intent.entities.skillId || 'command'}`;
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
