/**
 * Action Executor Service — Execute Parsed Intents
 *
 * Purpose: Execute actions from parsed natural language intents.
 * Integrates with device services, calendar, contacts, vault.
 */

import { Linking, Platform } from 'react-native';
import { VaultService } from './vault.service';
import { CalendarService } from './calendar.service';
import { AppLauncherService } from './applauncher.service';
import { ContactsService } from './contacts.service';
import { HapticSymphony } from './HapticSymphony';
import type { ParsedIntent, IntentType } from './intent.parser';

export interface ActionResult {
    success: boolean;
    message: string;
    data?: any;
    followUp?: string; // Suggested follow-up action
}

export interface ActionHandler {
    type: IntentType;
    execute: (intent: ParsedIntent) => Promise<ActionResult>;
    canExecute: (intent: ParsedIntent) => boolean;
}

class ActionExecutorClass {
    private handlers: Map<IntentType, ActionHandler> = new Map();

    constructor() {
        this.registerDefaultHandlers();
    }

    /**
     * Register default action handlers
     */
    private registerDefaultHandlers() {
        // Reminder handler
        this.registerHandler({
            type: 'reminder',
            canExecute: (intent) => !!intent.entities.subject,
            execute: async (intent) => {
                const { subject, datetime, timeExpression } = intent.entities;

                // For now, save as a note with reminder tag
                // Future: integrate with system alarms
                const reminderNote = `# Reminder: ${subject}\n\nSet: ${new Date().toLocaleString()}\nDue: ${datetime?.toLocaleString() || timeExpression || 'Later'}\n\nStatus: Pending`;

                try {
                    await VaultService.saveNote(
                        `Reminder: ${subject}`,
                        reminderNote,
                        ['reminder', 'pending']
                    );

                    HapticSymphony.success();

                    return {
                        success: true,
                        message: `Reminder set: "${subject}"${datetime ? ` for ${datetime.toLocaleString()}` : ''}`,
                        data: { subject, datetime },
                    };
                } catch (error) {
                    return {
                        success: false,
                        message: `Failed to set reminder: ${error}`,
                    };
                }
            },
        });

        // Note handler
        this.registerHandler({
            type: 'note',
            canExecute: (intent) => !!intent.entities.note,
            execute: async (intent) => {
                const { note } = intent.entities;
                if (!note) {
                    return { success: false, message: 'No note content provided' };
                }

                try {
                    // Generate title from first line or first 50 chars
                    const title = note.split('\n')[0].slice(0, 50) || 'Quick Note';

                    await VaultService.saveNote(title, note, ['quick-capture']);

                    HapticSymphony.success();

                    return {
                        success: true,
                        message: `Note saved: "${title}"`,
                        data: { title, content: note },
                    };
                } catch (error) {
                    return {
                        success: false,
                        message: `Failed to save note: ${error}`,
                    };
                }
            },
        });

        // Calendar event handler
        this.registerHandler({
            type: 'calendar_event',
            canExecute: (intent) => !!intent.entities.subject,
            execute: async (intent) => {
                const { subject, datetime } = intent.entities;

                if (!datetime) {
                    return {
                        success: false,
                        message: 'When should I schedule this?',
                        followUp: 'Please specify a date and time.',
                    };
                }

                try {
                    // End time is 1 hour after start
                    const endDate = new Date(datetime);
                    endDate.setHours(endDate.getHours() + 1);

                    const eventId = await CalendarService.createEvent({
                        title: subject || 'Untitled Event',
                        startDate: datetime,
                        endDate,
                    });

                    HapticSymphony.success();

                    return {
                        success: true,
                        message: `Event created: "${subject}" on ${datetime.toLocaleDateString()} at ${datetime.toLocaleTimeString()}`,
                        data: { eventId, subject, datetime },
                    };
                } catch (error) {
                    return {
                        success: false,
                        message: `Failed to create event: ${error}`,
                    };
                }
            },
        });

        // App command handler
        this.registerHandler({
            type: 'app_command',
            canExecute: (intent) => !!intent.entities.appName,
            execute: async (intent) => {
                const { appName } = intent.entities;

                if (!appName) {
                    return { success: false, message: 'Which app should I open?' };
                }

                try {
                    const success = await AppLauncherService.launchApp(appName);

                    if (success) {
                        HapticSymphony.tap();
                        return {
                            success: true,
                            message: `Opening ${appName}`,
                        };
                    } else {
                        // Try to find similar apps
                        const apps = await AppLauncherService.getInstalledApps();
                        const similar = apps
                            .filter(app =>
                                app.label.toLowerCase().includes(appName.toLowerCase()) ||
                                appName.toLowerCase().includes(app.label.toLowerCase())
                            )
                            .slice(0, 3);

                        if (similar.length > 0) {
                            return {
                                success: false,
                                message: `App "${appName}" not found. Did you mean: ${similar.map(a => a.label).join(', ')}?`,
                                data: { suggestions: similar },
                            };
                        }

                        return {
                            success: false,
                            message: `App "${appName}" not found`,
                        };
                    }
                } catch (error) {
                    return {
                        success: false,
                        message: `Failed to open app: ${error}`,
                    };
                }
            },
        });

        // Message handler
        this.registerHandler({
            type: 'message',
            canExecute: (intent) => !!intent.entities.contact && !!intent.entities.body,
            execute: async (intent) => {
                const { contact, body } = intent.entities;

                if (!contact || !body) {
                    return {
                        success: false,
                        message: 'Who should I message and what should I say?',
                    };
                }

                try {
                    // Look up contact
                    const contacts = await ContactsService.search(contact);

                    if (contacts.length === 0) {
                        return {
                            success: false,
                            message: `Contact "${contact}" not found`,
                            followUp: 'Try a different name or check your contacts.',
                        };
                    }

                    const targetContact = contacts[0];
                    const phone = targetContact.phone;

                    if (!phone) {
                        return {
                            success: false,
                            message: `No phone number found for ${targetContact.name}`,
                        };
                    }

                    // Open SMS app with pre-filled message
                    const smsUrl = Platform.OS === 'ios'
                        ? `sms:${phone}&body=${encodeURIComponent(body)}`
                        : `sms:${phone}?body=${encodeURIComponent(body)}`;

                    await Linking.openURL(smsUrl);

                    HapticSymphony.tap();

                    return {
                        success: true,
                        message: `Opening message to ${targetContact.name}`,
                        data: { contact: targetContact, body },
                    };
                } catch (error) {
                    return {
                        success: false,
                        message: `Failed to send message: ${error}`,
                    };
                }
            },
        });

        // Call handler
        this.registerHandler({
            type: 'call',
            canExecute: (intent) => !!intent.entities.contact,
            execute: async (intent) => {
                const { contact } = intent.entities;

                if (!contact) {
                    return { success: false, message: 'Who should I call?' };
                }

                try {
                    const contacts = await ContactsService.search(contact);

                    if (contacts.length === 0) {
                        return {
                            success: false,
                            message: `Contact "${contact}" not found`,
                        };
                    }

                    const targetContact = contacts[0];
                    const phone = targetContact.phone;

                    if (!phone) {
                        return {
                            success: false,
                            message: `No phone number found for ${targetContact.name}`,
                        };
                    }

                    await Linking.openURL(`tel:${phone}`);

                    HapticSymphony.tap();

                    return {
                        success: true,
                        message: `Calling ${targetContact.name}`,
                        data: { contact: targetContact },
                    };
                } catch (error) {
                    return {
                        success: false,
                        message: `Failed to make call: ${error}`,
                    };
                }
            },
        });

        // Timer handler
        this.registerHandler({
            type: 'timer',
            canExecute: (intent) => !!intent.entities.duration,
            execute: async (intent) => {
                const { duration } = intent.entities;

                if (!duration) {
                    return { success: false, message: 'How long should the timer be?' };
                }

                // Save timer as a reminder note
                const endTime = new Date();
                endTime.setMinutes(endTime.getMinutes() + duration);

                try {
                    await VaultService.saveNote(
                        `Timer: ${duration} minutes`,
                        `Timer set at ${new Date().toLocaleTimeString()}\nEnds at ${endTime.toLocaleTimeString()}`,
                        ['timer', 'pending']
                    );

                    HapticSymphony.success();

                    return {
                        success: true,
                        message: `Timer set for ${duration} minutes`,
                        data: { duration, endTime },
                        followUp: `Timer will end at ${endTime.toLocaleTimeString()}`,
                    };
                } catch (error) {
                    return {
                        success: false,
                        message: `Failed to set timer: ${error}`,
                    };
                }
            },
        });

        // Navigate handler
        this.registerHandler({
            type: 'navigate',
            canExecute: (intent) => !!intent.entities.location,
            execute: async (intent) => {
                const { location } = intent.entities;

                if (!location) {
                    return { success: false, message: 'Where should I navigate to?' };
                }

                try {
                    const mapsUrl = Platform.OS === 'ios'
                        ? `maps:?q=${encodeURIComponent(location)}`
                        : `geo:0,0?q=${encodeURIComponent(location)}`;

                    await Linking.openURL(mapsUrl);

                    HapticSymphony.tap();

                    return {
                        success: true,
                        message: `Opening directions to ${location}`,
                        data: { location },
                    };
                } catch (error) {
                    return {
                        success: false,
                        message: `Failed to open navigation: ${error}`,
                    };
                }
            },
        });

        // Search handler (passthrough to MirrorMesh)
        this.registerHandler({
            type: 'search',
            canExecute: () => true,
            execute: async (intent) => {
                // Search intents are passed to MirrorMesh for AI response
                return {
                    success: true,
                    message: 'Searching...',
                    data: { query: intent.entities.query, passToAI: true },
                };
            },
        });

        // Unknown handler
        this.registerHandler({
            type: 'unknown',
            canExecute: () => true,
            execute: async (intent) => {
                // Unknown intents are passed to MirrorMesh
                return {
                    success: true,
                    message: 'Let me think about that...',
                    data: { query: intent.raw, passToAI: true },
                };
            },
        });
    }

    /**
     * Register a custom action handler
     */
    registerHandler(handler: ActionHandler) {
        this.handlers.set(handler.type, handler);
    }

    /**
     * Execute a parsed intent
     */
    async execute(intent: ParsedIntent): Promise<ActionResult> {
        const handler = this.handlers.get(intent.type);

        if (!handler) {
            return {
                success: false,
                message: `No handler for intent type: ${intent.type}`,
            };
        }

        if (!handler.canExecute(intent)) {
            return {
                success: false,
                message: 'Missing required information to execute this action',
                followUp: this.getMissingInfoPrompt(intent),
            };
        }

        try {
            return await handler.execute(intent);
        } catch (error) {
            console.error('[ActionExecutor] Execution error:', error);
            return {
                success: false,
                message: `Action failed: ${error}`,
            };
        }
    }

    /**
     * Check if an intent can be executed
     */
    canExecute(intent: ParsedIntent): boolean {
        const handler = this.handlers.get(intent.type);
        return handler ? handler.canExecute(intent) : false;
    }

    /**
     * Get prompt for missing information
     */
    private getMissingInfoPrompt(intent: ParsedIntent): string {
        switch (intent.type) {
            case 'reminder':
                if (!intent.entities.subject) return 'What should I remind you about?';
                if (!intent.entities.datetime) return 'When should I remind you?';
                break;
            case 'message':
                if (!intent.entities.contact) return 'Who should I message?';
                if (!intent.entities.body) return 'What should the message say?';
                break;
            case 'calendar_event':
                if (!intent.entities.subject) return 'What is the event about?';
                if (!intent.entities.datetime) return 'When should I schedule it?';
                break;
            case 'call':
                if (!intent.entities.contact) return 'Who should I call?';
                break;
        }
        return 'Please provide more details.';
    }
}

export const ActionExecutor = new ActionExecutorClass();
