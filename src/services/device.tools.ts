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
import { CalendarService } from './calendar.service';
import { WeatherService } from './weather.service';
import { ContactsService } from './contacts.service';

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
                const apps = await AppLauncherService.getInstalledApps();
                return {
                    success: true,
                    data: apps.slice(0, 15).map(a => ({ name: a.name, pkg: a.packageName })),
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
                await VaultService.saveCapture({ type: 'note', content, title });
                return { success: true, data: { saved: title } };
            },
            source: 'local',
            requiresNetwork: false,
        },

        // Calendar — local only
        {
            name: 'get_events',
            description: 'Get upcoming calendar events',
            parameters: {
                type: 'object',
                properties: {
                    hours: { type: 'number', description: 'Hours ahead (default 24)' },
                },
            },
            execute: async (params) => {
                const hours = (params.hours as number) || 24;
                const events = await CalendarService.getUpcomingEvents(hours);
                return {
                    success: true,
                    data: events.slice(0, 5).map(e => ({
                        title: e.title,
                        start: e.startDate,
                    })),
                };
            },
            source: 'local',
            requiresNetwork: false,
        },

        // Weather — REQUIRES NETWORK
        {
            name: 'get_weather',
            description: 'Get current weather',
            parameters: { type: 'object', properties: {} },
            execute: async () => {
                const weather = await WeatherService.getCurrentWeather();
                if (!weather) {
                    return { success: false, error: 'Weather unavailable', retryable: true };
                }
                return {
                    success: true,
                    data: {
                        condition: weather.condition,
                        temp: weather.temperature,
                    },
                };
            },
            source: 'local',
            requiresNetwork: true, // Needs network
            maxRetries: 2,
            timeoutMs: 8000,
        },

        // Contacts — local only
        {
            name: 'get_contacts',
            description: 'Get priority contacts',
            parameters: { type: 'object', properties: {} },
            execute: async () => {
                const contacts = await ContactsService.getPriorityContacts();
                return {
                    success: true,
                    data: contacts.slice(0, 5).map(c => ({ name: c.name })),
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
