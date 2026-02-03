/**
 * Mobile Bus Service — SC1 Agent Communication
 *
 * Connects mobile agent to the MirrorDNA Memory Bus via Syncthing.
 * The bus is the single source of truth for agent state and coordination.
 *
 * Bus location (synced via vault):
 * - Mac: ~/.mirrordna/bus/
 * - Mobile: /sdcard/Obsidian/MirrorDNA-Vault/.mobile_bus/
 */

import RNFS from 'react-native-fs';
import DeviceInfo from 'react-native-device-info';
import { DeviceService } from './device.service';

// Bus paths - primary and fallback
const VAULT_PATH = '/storage/emulated/0/Obsidian/MirrorDNA-Vault';
const VAULT_BUS_PATH = `${VAULT_PATH}/.mobile_bus`;
const FALLBACK_BUS_PATH = '/storage/emulated/0/MirrorDNA/.mobile_bus';
let BUS_PATH = VAULT_BUS_PATH; // Will be set during init

// State interfaces
export interface MobileState {
    deviceId: string;
    deviceName: string;
    lastSeen: string;
    battery: {
        level: number;
        charging: boolean;
    };
    storage: {
        freeGb: number;
        totalGb: number;
    };
    status: 'online' | 'idle' | 'busy' | 'offline';
    currentTask?: string;
    errors: string[];
}

export interface HubCommand {
    id: string;
    from: 'hub';
    to: string;
    priority: 'low' | 'normal' | 'high' | 'critical';
    command: string;
    payload: Record<string, unknown>;
    expires?: string;
    created: string;
}

export interface BusState {
    mobile: Record<string, MobileState>;
    pendingCommands: HubCommand[];
    lastSync: string;
}

class MobileBusServiceClass {
    private deviceId: string = '';
    private deviceName: string = '';
    private isInitialized: boolean = false;
    private syncInterval: ReturnType<typeof setInterval> | null = null;

    /**
     * Initialize the bus service
     */
    async initialize(): Promise<boolean> {
        try {
            this.deviceId = await DeviceInfo.getUniqueId();
            this.deviceName = await DeviceInfo.getDeviceName();

            // Try primary path (vault), fall back to secondary
            let busPath = VAULT_BUS_PATH;
            try {
                const vaultExists = await RNFS.exists(VAULT_PATH);
                if (vaultExists) {
                    const busExists = await RNFS.exists(VAULT_BUS_PATH);
                    if (!busExists) {
                        await RNFS.mkdir(VAULT_BUS_PATH);
                    }
                    busPath = VAULT_BUS_PATH;
                    console.log('[MobileBus] Using vault path');
                } else {
                    throw new Error('Vault not found');
                }
            } catch {
                // Fall back to secondary path
                console.log('[MobileBus] Vault not accessible, using fallback path');
                busPath = FALLBACK_BUS_PATH;
                try {
                    const fallbackExists = await RNFS.exists(FALLBACK_BUS_PATH);
                    if (!fallbackExists) {
                        await RNFS.mkdir(FALLBACK_BUS_PATH);
                    }
                } catch (mkdirErr) {
                    console.error('[MobileBus] Could not create fallback dir:', mkdirErr);
                }
            }

            // Update the global BUS_PATH
            BUS_PATH = busPath;

            // Write initial state (with error handling)
            try {
                await this.writeState();
            } catch (writeErr) {
                console.warn('[MobileBus] Initial write failed, continuing:', writeErr);
            }

            // Start periodic sync (every 5 minutes)
            this.syncInterval = setInterval(() => this.sync(), 5 * 60 * 1000);

            this.isInitialized = true;
            console.log(`[MobileBus] Initialized for device: ${this.deviceName} (${this.deviceId}) at ${busPath}`);
            return true;
        } catch (error) {
            console.error('[MobileBus] Init failed:', error);
            // Still mark as initialized so app doesn't break
            this.isInitialized = true;
            return false;
        }
    }

    /**
     * Get current device state
     */
    async getDeviceState(): Promise<MobileState> {
        const battery = await DeviceService.getBatteryLevel();

        let freeGb = 0;
        let totalGb = 0;
        try {
            const freeSpace = await RNFS.getFSInfo();
            freeGb = Math.round((freeSpace.freeSpace / (1024 * 1024 * 1024)) * 10) / 10;
            totalGb = Math.round((freeSpace.totalSpace / (1024 * 1024 * 1024)) * 10) / 10;
        } catch {
            // Storage info not available
        }

        return {
            deviceId: this.deviceId,
            deviceName: this.deviceName,
            lastSeen: new Date().toISOString(),
            battery: {
                level: battery.level,
                charging: battery.charging,
            },
            storage: {
                freeGb,
                totalGb,
            },
            status: 'online',
            errors: [],
        };
    }

    /**
     * Write current state to bus
     */
    async writeState(status?: string, task?: string): Promise<void> {
        try {
            const state = await this.getDeviceState();
            if (status) state.status = status as MobileState['status'];
            if (task) state.currentTask = task;

            const statePath = `${BUS_PATH}/${this.deviceId}.json`;
            await RNFS.writeFile(statePath, JSON.stringify(state, null, 2), 'utf8');
            console.log('[MobileBus] State written');
        } catch (error) {
            console.error('[MobileBus] Write failed:', error);
        }
    }

    /**
     * Read pending commands from hub
     */
    async readCommands(): Promise<HubCommand[]> {
        try {
            const commandsPath = `${BUS_PATH}/commands_${this.deviceId}.json`;
            const exists = await RNFS.exists(commandsPath);
            if (!exists) return [];

            const content = await RNFS.readFile(commandsPath, 'utf8');
            const commands: HubCommand[] = JSON.parse(content);

            // Filter expired commands
            const now = new Date();
            return commands.filter(cmd => {
                if (!cmd.expires) return true;
                return new Date(cmd.expires) > now;
            });
        } catch (error) {
            console.error('[MobileBus] Read commands failed:', error);
            return [];
        }
    }

    /**
     * Mark command as completed
     */
    async completeCommand(commandId: string, result?: unknown): Promise<void> {
        try {
            const resultsPath = `${BUS_PATH}/results_${this.deviceId}.json`;

            let results: Record<string, unknown> = {};
            const exists = await RNFS.exists(resultsPath);
            if (exists) {
                const content = await RNFS.readFile(resultsPath, 'utf8');
                results = JSON.parse(content);
            }

            results[commandId] = {
                completed: new Date().toISOString(),
                result,
            };

            await RNFS.writeFile(resultsPath, JSON.stringify(results, null, 2), 'utf8');
            console.log(`[MobileBus] Command ${commandId} completed`);
        } catch (error) {
            console.error('[MobileBus] Complete command failed:', error);
        }
    }

    /**
     * Sync with bus (update state + check commands)
     */
    async sync(): Promise<{ commands: HubCommand[] }> {
        await this.writeState();
        const commands = await this.readCommands();

        if (commands.length > 0) {
            console.log(`[MobileBus] ${commands.length} pending commands`);
        }

        return { commands };
    }

    /**
     * Write a message/report to the hub
     */
    async writeReport(type: string, data: Record<string, unknown>): Promise<void> {
        try {
            const reportsPath = `${BUS_PATH}/reports`;
            const exists = await RNFS.exists(reportsPath);
            if (!exists) {
                await RNFS.mkdir(reportsPath);
            }

            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const filename = `${type}_${this.deviceId}_${timestamp}.json`;

            const report = {
                type,
                from: this.deviceId,
                deviceName: this.deviceName,
                timestamp: new Date().toISOString(),
                data,
            };

            await RNFS.writeFile(`${reportsPath}/${filename}`, JSON.stringify(report, null, 2), 'utf8');
            console.log(`[MobileBus] Report written: ${type}`);
        } catch (error) {
            console.error('[MobileBus] Write report failed:', error);
        }
    }

    /**
     * Send health report to hub
     */
    async sendHealthReport(): Promise<void> {
        const state = await this.getDeviceState();
        await this.writeReport('health', state as unknown as Record<string, unknown>);
    }

    /**
     * Send alert to hub
     */
    async sendAlert(level: 'warning' | 'alert' | 'critical', message: string, data?: Record<string, unknown>): Promise<void> {
        await this.writeReport('alert', {
            level,
            message,
            ...data,
        });
    }

    /**
     * Stop the bus service
     */
    stop(): void {
        if (this.syncInterval) {
            clearInterval(this.syncInterval);
            this.syncInterval = null;
        }
        this.isInitialized = false;
        console.log('[MobileBus] Stopped');
    }

    /**
     * Check if initialized
     */
    isReady(): boolean {
        return this.isInitialized;
    }
}

export const MobileBusService = new MobileBusServiceClass();
export default MobileBusService;
