/**
 * Device Service — Real Device Signals
 * 
 * Battery level, connectivity status, and other system info.
 */

import { Platform } from 'react-native';
import DeviceInfo from 'react-native-device-info';

// Battery types for Android
interface BatteryInfo {
    level: number;       // 0-100
    charging: boolean;
}

interface ConnectivityInfo {
    connected: boolean;
    type: 'wifi' | 'cellular' | 'none';
}

class DeviceServiceClass {
    private batteryListeners: Set<(info: BatteryInfo) => void> = new Set();

    /**
     * Get current battery level using react-native-device-info
     * Returns real device battery on Android and iOS
     * Note: Always fetches fresh - no caching
     */
    async getBatteryLevel(): Promise<BatteryInfo> {
        try {
            // Force fresh readings (no caching in device-info, but log for debug)
            const rawLevel = await DeviceInfo.getBatteryLevel();
            const charging = await DeviceInfo.isBatteryCharging();
            const level = Math.round(rawLevel * 100);

            console.log(`[DeviceService] Battery: raw=${rawLevel}, level=${level}%, charging=${charging}`);

            return { level, charging };
        } catch (error) {
            console.warn('[DeviceService] Battery read failed:', error);
            return { level: -1, charging: false };
        }
    }

    /**
     * Format battery for display
     */
    formatBattery(info: BatteryInfo): string {
        if (info.level < 0) return '??%';
        const charge = info.charging ? '⚡' : '';
        return `${Math.round(info.level)}%${charge}`;
    }

    /**
     * Get battery icon based on level
     */
    getBatteryIcon(level: number): string {
        if (level < 0) return '🔋';
        if (level <= 10) return '🪫';
        if (level <= 25) return '🔋';
        return '🔋';
    }

    /**
     * Get connectivity status
     */
    async getConnectivity(): Promise<ConnectivityInfo> {
        // Placeholder - real implementation would use @react-native-community/netinfo
        return {
            connected: true,
            type: 'wifi',
        };
    }

    /**
     * Get device model
     */
    getDeviceModel(): string {
        if (Platform.OS === 'android') {
            return 'Android Device';
        }
        return 'iOS Device';
    }

    /**
     * Format time remaining (placeholder)
     */
    getTimeRemaining(batteryLevel: number): string {
        if (batteryLevel < 0) return 'Unknown';
        // Rough estimate: ~1% per 6 minutes on standby
        const hoursRemaining = Math.round((batteryLevel / 100) * 10);
        return `~${hoursRemaining}h`;
    }

    /**
     * Get unique device ID
     * Used by LocalAgentService and MeshService
     */
    async getDeviceId(): Promise<string> {
        try {
            return await DeviceInfo.getUniqueId();
        } catch (error) {
            console.warn('[DeviceService] Failed to get device ID:', error);
            return `device-${Date.now()}`;
        }
    }

    /**
     * Check if device is charging
     * Used by NudgeService for battery-aware nudges
     */
    async isCharging(): Promise<boolean> {
        try {
            return await DeviceInfo.isBatteryCharging();
        } catch (error) {
            console.warn('[DeviceService] Failed to check charging status:', error);
            return false;
        }
    }
}

// Singleton export
export const DeviceService = new DeviceServiceClass();

export default DeviceService;
