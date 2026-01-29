/**
 * Device Tools — Local tool definitions for orchestrator
 * 
 * Wraps existing services as Tool objects
 * These are the "hands" of the agent
 */

import { OrchestratorService, type Tool } from './orchestrator.service';
import { DeviceService } from './device.service';
import { HapticService } from './haptic.service';
import { AppLauncherService } from './applauncher.service';
import { VaultService } from './vault.service';
import { CalendarService, type CalendarEvent } from './calendar.service';
import { WeatherService } from './weather.service';
import { ContactsService, type PriorityContact } from './contacts.service';
import {
    PassiveIntelligenceService,
    ClipboardWatcher,
    NotificationInterceptor,
    ScreenContext,
} from './passive.service';

/**
 * Create and register all local device tools
 */
export function registerDeviceTools(): void {
    const tools: Tool[] = [
        // Device info — local only
        {
            name: 'get_battery',
            description: 'Get battery level and charging status',
            parameters: { type: 'object', properties: {} },
            execute: async () => {
                const info = await DeviceService.getBatteryLevel();
                return {
                    success: true,
                    data: { level: info.level, charging: info.charging },
                };
            },
            source: 'local',
            requiresNetwork: false,
        },

        // Haptics — local only
        {
            name: 'vibrate',
            description: 'Vibrate device',
            parameters: {
                type: 'object',
                properties: {
                    pattern: {
                        type: 'string',
                        description: 'Pattern: light|medium|heavy|success|warning|error',
                        enum: ['light', 'medium', 'heavy', 'success', 'warning', 'error'],
                    },
                },
            },
            execute: async (params) => {
                const pattern = (params.pattern as string) || 'medium';
                HapticService.trigger(pattern as any);
                return { success: true, data: { pattern } };
            },
            source: 'local',
            requiresNetwork: false,
        },

        // App launcher — local only
        {
            name: 'open_app',
            description: 'Launch app by name or package',
            parameters: {
                type: 'object',
                properties: {
                    name: { type: 'string', description: 'App name or package' },
                },
                required: ['name'],
            },
            execute: async (params) => {
                const name = params.name as string;
                const success = await AppLauncherService.launchApp(name);
                return {
                    success,
                    data: { launched: name },
                    error: success ? undefined : `Could not launch ${name}`,
                    retryable: false, // Don't retry app launches
                };
            },
            source: 'local',
            requiresNetwork: false,
            maxRetries: 1, // Only try once
        },

        // List apps — local only
        {
            name: 'list_apps',
            description: 'List installed apps',
            parameters: { type: 'object', properties: {} },
            execute: async () => {
                const apps = AppLauncherService.getFavoriteApps();
                return {
                    success: true,
                    data: apps.slice(0, 15).map(a => ({ name: a.label, pkg: a.packageName })),
                };
            },
            source: 'local',
            requiresNetwork: false,
        },

        // Vault capture — local only
        {
            name: 'save_note',
            description: 'Save note to Vault',
            parameters: {
                type: 'object',
                properties: {
                    content: { type: 'string', description: 'Note content' },
                    title: { type: 'string', description: 'Optional title' },
                },
                required: ['content'],
            },
            execute: async (params) => {
                const content = params.content as string;
                const title = (params.title as string) || 'Quick Capture';
                await VaultService.saveCapture('note', content, title);
                return { success: true, data: { saved: title } };
            },
            source: 'local',
            requiresNetwork: false,
        },

        // Calendar — local only
        {
            name: 'get_events', // Renamed from get_events to check_schedule in the snippet, but keeping original name as per instruction context
            description: 'Get upcoming calendar events',
            parameters: {
                type: 'object',
                properties: {
                    // Removed 'hours' parameter as getTodayEvents doesn't use it
                },
            },
            execute: async (_params) => {
                // const hours = (params.hours as number) || 24; // Removed hours logic
                const events = await CalendarService.getTodayEvents(); // Updated method call
                return {
                    success: true,
                    data: events.slice(0, 5).map((e: CalendarEvent) => ({ // Updated map function and added type
                        title: e.title,
                        time: CalendarService.formatEventTime(e), // New field
                        location: e.location // New field
                    })),
                    formatted: `You have ${events.length} events today.` // Added formatted field
                };
            },
            source: 'local',
            requiresNetwork: false,
        },

        // Weather — REQUIRES NETWORK
        {
            name: 'get_weather', // Renamed from get_weather to check_weather in the snippet, but keeping original name as per instruction context
            description: 'Get current weather',
            parameters: { type: 'object', properties: {} },
            execute: async () => {
                const weather = await WeatherService.getWeather(); // Updated method call
                if (!weather) {
                    return { success: false, error: 'Weather unavailable', retryable: true };
                }
                return {
                    success: true,
                    data: weather, // Updated data structure
                    formatted: `It's ${weather.temperature}°C and ${weather.condition} in ${weather.location || 'your location'}.` // Added formatted field
                };
            },
            source: 'local',
            requiresNetwork: true, // Needs network
            maxRetries: 2,
            timeoutMs: 8000,
        },

        // Contacts — local only
        {
            name: 'get_contacts', // Renamed from get_contacts to list_contacts in the snippet, but keeping original name as per instruction context
            description: 'Get priority contacts',
            parameters: { type: 'object', properties: {} },
            execute: async () => {
                const contacts = await ContactsService.getContacts(); // Updated method call
                return {
                    success: true,
                    data: contacts.slice(0, 5).map((c: PriorityContact) => ({ name: c.name })), // Updated map function and added type
                    formatted: `Found ${contacts.length} priority contacts.` // Added formatted field
                };
            },
            source: 'local',
            requiresNetwork: false,
        },

        // ─────────────────────────────────────────────────────────────────────
        // Passive Intelligence Tools
        // ─────────────────────────────────────────────────────────────────────

        // Clipboard — read current clipboard
        {
            name: 'get_clipboard',
            description: 'Get current clipboard content',
            parameters: { type: 'object', properties: {} },
            execute: async () => {
                const text = await ClipboardWatcher.getCurrent();
                return {
                    success: true,
                    data: { text: text || '(empty)' },
                    formatted: text ? `Clipboard contains: "${text.slice(0, 100)}${text.length > 100 ? '...' : ''}"` : 'Clipboard is empty.',
                };
            },
            source: 'local',
            requiresNetwork: false,
        },

        // Notifications — get active notifications
        {
            name: 'get_notifications',
            description: 'Get active device notifications',
            parameters: { type: 'object', properties: {} },
            execute: async () => {
                const enabled = await NotificationInterceptor.isEnabled();
                if (!enabled) {
                    return {
                        success: false,
                        error: 'Notification access not enabled. User needs to enable in Settings.',
                        retryable: false,
                    };
                }
                const notifications = await NotificationInterceptor.getActive();
                return {
                    success: true,
                    data: notifications.slice(0, 10).map(n => ({
                        app: n.appName,
                        title: n.title,
                        text: n.text?.slice(0, 100),
                    })),
                    formatted: `You have ${notifications.length} active notifications.`,
                };
            },
            source: 'local',
            requiresNetwork: false,
        },

        // Screen context — what am I looking at?
        {
            name: 'get_screen_context',
            description: 'Get context about what is currently on screen (requires accessibility service)',
            parameters: { type: 'object', properties: {} },
            execute: async () => {
                const enabled = await ScreenContext.isEnabled();
                if (!enabled) {
                    return {
                        success: false,
                        error: 'Screen context service not enabled. User needs to enable MirrorBrain in Accessibility settings.',
                        retryable: false,
                    };
                }
                const context = await ScreenContext.getContext();
                if (!context) {
                    return { success: false, error: 'Could not get screen context', retryable: true };
                }
                return {
                    success: true,
                    data: {
                        app: context.appName,
                        summary: context.summary?.slice(0, 500),
                    },
                    formatted: `Currently viewing ${context.appName}. ${context.summary?.slice(0, 200) || ''}`,
                };
            },
            source: 'local',
            requiresNetwork: false,
        },

        // Passive status — check what's enabled
        {
            name: 'get_passive_status',
            description: 'Check status of passive intelligence features (clipboard, notifications, screen context)',
            parameters: { type: 'object', properties: {} },
            execute: async () => {
                const status = await PassiveIntelligenceService.getStatus();
                const features = [];
                if (status.clipboardEnabled) features.push('clipboard');
                if (status.notificationEnabled) features.push('notifications');
                if (status.screenContextEnabled) features.push('screen context');
                return {
                    success: true,
                    data: status,
                    formatted: features.length > 0
                        ? `Passive intelligence enabled: ${features.join(', ')}.`
                        : 'No passive intelligence features enabled.',
                };
            },
            source: 'local',
            requiresNetwork: false,
        },
    ];

    OrchestratorService.registerTools(tools);
    console.log(`[DeviceTools] Registered ${tools.length} tools`);
}

/**
 * Get registered tool names
 */
export function getRegisteredToolNames(): string[] {
    return OrchestratorService.listTools().map(t => t.name);
}
