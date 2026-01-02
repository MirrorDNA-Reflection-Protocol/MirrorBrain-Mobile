/**
 * Syncthing Service — Continuous Vault Sync
 * 
 * Integration with Syncthing for background vault sync.
 */

import { Linking } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface SyncthingStatus {
    connected: boolean;
    lastSync: Date | null;
    pendingUp: number;
    pendingDown: number;
    deviceId?: string;
}

export interface LANServerStatus {
    online: boolean;
    ip: string;
    port: number;
}

const SYNCTHING_CONFIG_KEY = '@mirrorbrain/syncthing';
const LAN_SERVER_KEY = '@mirrorbrain/lan_server';

class SyncthingServiceClass {
    private config: {
        enabled: boolean;
        macDeviceId?: string;
        lanServerIp?: string;
        lanServerPort: number;
    } = {
            enabled: true,
            lanServerPort: 8082,
        };

    /**
     * Initialize service
     */
    async initialize(): Promise<void> {
        try {
            const stored = await AsyncStorage.getItem(SYNCTHING_CONFIG_KEY);
            if (stored) {
                this.config = { ...this.config, ...JSON.parse(stored) };
            }
        } catch (error) {
            console.warn('Syncthing config load failed:', error);
        }
    }

    /**
     * Get Syncthing status
     * Note: Actual implementation would use Syncthing REST API
     */
    async getStatus(): Promise<SyncthingStatus> {
        // Placeholder - real implementation would query Syncthing API
        // http://localhost:8384/rest/system/connections
        return {
            connected: true,
            lastSync: new Date(Date.now() - 2 * 60 * 1000), // 2 min ago
            pendingUp: 3,
            pendingDown: 12,
        };
    }

    /**
     * Open Syncthing app
     */
    async openSyncthing(): Promise<void> {
        try {
            // Try to open Syncthing Android app
            await Linking.openURL('syncthing://');
        } catch {
            // Fallback to Play Store
            await Linking.openURL('market://details?id=com.nutomic.syncthingandroid');
        }
    }

    /**
     * Check LAN server connectivity
     */
    async checkLANServer(): Promise<LANServerStatus> {
        const ip = this.config.lanServerIp || '192.168.0.112';
        const port = this.config.lanServerPort;

        try {
            const response = await fetch(`http://${ip}:${port}/health`, {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' },
            });

            if (response.ok) {
                return { online: true, ip, port };
            }
            return { online: false, ip, port };
        } catch {
            return { online: false, ip, port };
        }
    }

    /**
     * Pull identity from Mac
     */
    async pullIdentity(): Promise<unknown | null> {
        const server = await this.checkLANServer();
        if (!server.online) return null;

        try {
            const response = await fetch(
                `http://${server.ip}:${server.port}/identity`,
                { method: 'GET' }
            );

            if (response.ok) {
                return await response.json();
            }
            return null;
        } catch (error) {
            console.error('Pull identity failed:', error);
            return null;
        }
    }

    /**
     * Search remote vault
     */
    async searchRemote(query: string): Promise<{ path: string; snippet: string }[]> {
        const server = await this.checkLANServer();
        if (!server.online) return [];

        try {
            const response = await fetch(
                `http://${server.ip}:${server.port}/vault/search?query=${encodeURIComponent(query)}`,
                { method: 'GET' }
            );

            if (response.ok) {
                const data = await response.json();
                return data.results || [];
            }
            return [];
        } catch (error) {
            console.error('Remote search failed:', error);
            return [];
        }
    }

    /**
     * Set LAN server IP
     */
    async setLANServerIP(ip: string): Promise<void> {
        this.config.lanServerIp = ip;
        await this.saveConfig();
    }

    /**
     * Format status for display
     */
    formatStatus(status: SyncthingStatus): string {
        if (!status.connected) return '🔴 Disconnected';
        if (status.pendingUp > 0 || status.pendingDown > 0) {
            return `🟡 Syncing (${status.pendingUp}↑ ${status.pendingDown}↓)`;
        }
        return '🟢 Synced';
    }

    /**
     * Format last sync time
     */
    formatLastSync(status: SyncthingStatus): string {
        if (!status.lastSync) return 'Never';

        const diff = Date.now() - status.lastSync.getTime();
        const mins = Math.floor(diff / 60000);

        if (mins < 1) return 'Just now';
        if (mins < 60) return `${mins} min ago`;

        const hours = Math.floor(mins / 60);
        return `${hours}h ago`;
    }

    /**
     * Save config
     */
    private async saveConfig(): Promise<void> {
        try {
            await AsyncStorage.setItem(SYNCTHING_CONFIG_KEY, JSON.stringify(this.config));
        } catch (error) {
            console.error('Syncthing config save failed:', error);
        }
    }
}

// Singleton export
export const SyncthingService = new SyncthingServiceClass();

export default SyncthingService;
