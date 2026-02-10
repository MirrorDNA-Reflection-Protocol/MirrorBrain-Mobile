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
import { DeviceOrchestratorService } from './device_orchestrator.service';
import { BriefingService } from './briefing.service';
import { FocusService } from './focus.service';
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
                    // Try via Tasker first (handles friendly names like "obsidian", "spotify")
                    const taskerResult = await DeviceOrchestratorService.dispatch(
                        'launch_app',
                        'local',
                        { package_name: appName },
                    );
                    if (taskerResult.ok) {
                        HapticSymphony.tap();
                        return {
                            success: true,
                            message: `Opening ${appName}`,
                        };
                    }

                    // Fallback to local AppLauncherService
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

        // Device skill handler — routes through DeviceOrchestratorService → Tasker
        this.registerHandler({
            type: 'device_skill',
            canExecute: (intent) => !!intent.entities.skillId,
            execute: async (intent) => {
                const { skillId, skillArgs } = intent.entities;
                if (!skillId) {
                    return { success: false, message: 'Unknown device command' };
                }

                try {
                    const result = await DeviceOrchestratorService.dispatch(
                        skillId,
                        'local',
                        skillArgs || {},
                    );

                    if (result.ok) {
                        HapticSymphony.success();
                        const taskResult = result.run?.result as Record<string, unknown> | undefined;
                        return {
                            success: true,
                            message: this.formatDeviceResult(skillId, skillArgs || {}, taskResult),
                            data: result.run,
                        };
                    } else {
                        return {
                            success: false,
                            message: result.error || `Failed to execute ${skillId}`,
                            data: result.queued ? { queued: true } : undefined,
                        };
                    }
                } catch (error) {
                    return {
                        success: false,
                        message: `Device command failed: ${error}`,
                    };
                }
            },
        });

        // Settings handler — maps to device skills where possible
        this.registerHandler({
            type: 'settings',
            canExecute: (intent) => !!intent.entities.subject,
            execute: async (intent) => {
                const subject = intent.entities.subject?.toLowerCase() || '';
                const cmd = intent.entities.command?.toLowerCase() || '';
                const isOn = /on|enable/.test(cmd);

                // Map common settings to device skills
                const settingsMap: Record<string, { skillId: string; args: Record<string, unknown> }> = {
                    'wifi': { skillId: 'toggle_wifi', args: { state: isOn ? 'on' : 'off' } },
                    'bluetooth': { skillId: 'toggle_bluetooth', args: { state: isOn ? 'on' : 'off' } },
                    'flashlight': { skillId: 'toggle_flashlight', args: { state: isOn ? 'on' : 'off' } },
                    'torch': { skillId: 'toggle_flashlight', args: { state: isOn ? 'on' : 'off' } },
                    'dnd': { skillId: 'toggle_dnd', args: { state: isOn ? 'on' : 'off' } },
                    'do not disturb': { skillId: 'toggle_dnd', args: { state: isOn ? 'on' : 'off' } },
                };

                const mapping = settingsMap[subject];
                if (mapping) {
                    try {
                        const result = await DeviceOrchestratorService.dispatch(
                            mapping.skillId,
                            'local',
                            mapping.args,
                        );
                        if (result.ok) {
                            HapticSymphony.success();
                            return {
                                success: true,
                                message: `${subject} turned ${isOn ? 'on' : 'off'}`,
                            };
                        }
                        return { success: false, message: result.error || `Failed to toggle ${subject}` };
                    } catch (error) {
                        return { success: false, message: `Failed: ${error}` };
                    }
                }

                return {
                    success: true,
                    message: `Setting "${subject}" — let me think about that...`,
                    data: { passToAI: true },
                };
            },
        });

        // Briefing handler — "brief me", "what's happening"
        this.registerHandler({
            type: 'briefing',
            canExecute: () => true,
            execute: async () => {
                try {
                    const briefing = await BriefingService.generateQuickBriefing();
                    const parts = [briefing.greeting + '.', briefing.summary];
                    for (const section of briefing.sections) {
                        parts.push(`${section.title}: ${section.content}`);
                    }
                    if (briefing.aiInsight) parts.push(briefing.aiInsight);
                    HapticSymphony.success();
                    return { success: true, message: parts.join(' ') };
                } catch (error) {
                    return { success: false, message: `Briefing failed: ${error}` };
                }
            },
        });

        // Goodnight handler — DND on, brightness down, evening review
        this.registerHandler({
            type: 'goodnight',
            canExecute: () => true,
            execute: async () => {
                try {
                    // DND on + brightness down in parallel
                    await Promise.all([
                        DeviceOrchestratorService.dispatch('toggle_dnd', 'local', { state: 'on' }),
                        DeviceOrchestratorService.dispatch('set_brightness', 'local', { level: 10 }),
                    ]);
                    // Generate evening review
                    let summary = 'Sleep well.';
                    try {
                        const briefing = await BriefingService.generateEveningBriefing();
                        summary = briefing.summary || summary;
                        if (briefing.aiInsight) summary += ' ' + briefing.aiInsight;
                    } catch {
                        // Briefing optional
                    }
                    HapticSymphony.success();
                    return {
                        success: true,
                        message: `Goodnight! DND is on, screen dimmed. ${summary}`,
                    };
                } catch (error) {
                    return { success: false, message: `Goodnight routine failed: ${error}` };
                }
            },
        });

        // Focus handler — start/end deep work with auto-DND
        this.registerHandler({
            type: 'focus',
            canExecute: () => true,
            execute: async (intent) => {
                const isEnd = intent.entities.command === 'end';
                try {
                    if (isEnd) {
                        const status = await FocusService.getStatus();
                        await FocusService.end();
                        await DeviceOrchestratorService.dispatch('toggle_dnd', 'local', { state: 'off' });
                        HapticSymphony.success();
                        const minutes = status.elapsedMinutes || 0;
                        return {
                            success: true,
                            message: `Focus mode ended.${minutes > 0 ? ` You focused for ${minutes} minutes.` : ''} DND off.`,
                        };
                    } else {
                        const duration = intent.entities.duration || 50;
                        await FocusService.start({ duration, reason: 'Voice activated' });
                        await DeviceOrchestratorService.dispatch('toggle_dnd', 'local', { state: 'on' });
                        HapticSymphony.success();
                        return {
                            success: true,
                            message: `Focus mode activated for ${duration} minutes. DND is on. Stay locked in.`,
                        };
                    }
                } catch (error) {
                    return { success: false, message: `Focus command failed: ${error}` };
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
     * Format device skill result into natural language
     */
    private formatDeviceResult(skillId: string, args: Record<string, unknown>, result?: Record<string, unknown>): string {
        switch (skillId) {
            case 'battery_status': {
                const pct = result?.percentage;
                const status = result?.status;
                return pct != null ? `Battery is at ${pct}%${status === 'CHARGING' ? ', charging' : ''}` : 'Battery status checked';
            }
            case 'set_volume':
                return `Volume set to ${args.level}`;
            case 'set_brightness':
                return args.auto ? 'Brightness set to auto' : `Brightness set to ${args.level}`;
            case 'toggle_flashlight':
                return `Flashlight ${args.state}`;
            case 'toggle_wifi':
                return `WiFi turned ${args.state}`;
            case 'toggle_bluetooth':
                return `Bluetooth turned ${args.state}`;
            case 'toggle_dnd':
                return `Do not disturb ${args.state}`;
            case 'media_control':
                return `Media ${args.action}`;
            case 'screenshot':
                return 'Screenshot taken';
            case 'set_alarm':
                return `Alarm set for ${args.hour}:${String(args.minute).padStart(2, '0')}`;
            case 'clipboard_get':
                return result?.text ? `Clipboard: ${result.text}` : 'Clipboard is empty';
            case 'clipboard_set':
                return 'Copied to clipboard';
            case 'send_whatsapp':
                return `Opening WhatsApp to ${args.phone}`;
            case 'send_sms':
                return `Opening SMS to ${args.phone}`;
            default:
                return `Done: ${skillId}`;
        }
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
