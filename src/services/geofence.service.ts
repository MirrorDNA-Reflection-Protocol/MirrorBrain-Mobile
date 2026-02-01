/**
 * Geofence Service — Location-Based Triggers
 *
 * Purpose: Create geofences for location-based actions.
 * Use cases: "Remind me when I get home", "Focus mode at office"
 */

import {
    NativeModules,
    NativeEventEmitter,
    Platform,
} from 'react-native';

const { GeofenceService: NativeGeofence } = NativeModules;

export interface GeofenceLocation {
    id: string;
    name: string;
    latitude: number;
    longitude: number;
    radius?: number;
    action?: GeofenceAction;
    actionPayload?: string;
}

export interface GeofenceOptions {
    id: string;
    name?: string;
    latitude: number;
    longitude: number;
    radius?: number;
    onEnter?: boolean;
    onExit?: boolean;
    onDwell?: boolean;
    action?: GeofenceAction;
    actionPayload?: string;
}

export type GeofenceAction = 'notify' | 'focus_mode' | 'reminder' | 'named_location' | 'custom';

export interface GeofenceEvent {
    type: 'enter' | 'exit' | 'dwell';
    geofences: GeofenceLocation[];
    timestamp: number;
}

export interface LocationPermissionStatus {
    fineLocation: boolean;
    backgroundLocation: boolean;
    ready: boolean;
}

type GeofenceCallback = (event: GeofenceEvent) => void;

class GeofenceServiceClass {
    private emitter: NativeEventEmitter | null = null;
    private subscription: any = null;
    private callbacks: Set<GeofenceCallback> = new Set();
    private namedLocations: Map<string, GeofenceLocation> = new Map();

    /**
     * Initialize geofence service
     */
    async initialize(): Promise<boolean> {
        if (Platform.OS !== 'android' || !NativeGeofence) {
            console.warn('[GeofenceService] Only available on Android');
            return false;
        }

        // Set up event listener
        this.emitter = new NativeEventEmitter(NativeGeofence);
        this.subscription = this.emitter.addListener(
            'onGeofenceEvent',
            this.handleEvent.bind(this)
        );

        console.log('[GeofenceService] Initialized');
        return true;
    }

    /**
     * Clean up
     */
    destroy(): void {
        if (this.subscription) {
            this.subscription.remove();
            this.subscription = null;
        }
    }

    /**
     * Subscribe to geofence events
     */
    subscribe(callback: GeofenceCallback): () => void {
        this.callbacks.add(callback);
        return () => this.callbacks.delete(callback);
    }

    /**
     * Check location permission status
     */
    async checkPermissions(): Promise<LocationPermissionStatus> {
        if (!NativeGeofence) {
            return { fineLocation: false, backgroundLocation: false, ready: false };
        }
        return NativeGeofence.hasLocationPermission();
    }

    /**
     * Add a geofence
     */
    async addGeofence(options: GeofenceOptions): Promise<boolean> {
        if (!NativeGeofence) {
            console.warn('[GeofenceService] Not available');
            return false;
        }

        try {
            const result = await NativeGeofence.addGeofence({
                ...options,
                action: options.action || 'notify',
            });
            console.log('[GeofenceService] Added geofence:', options.id);
            return result;
        } catch (error) {
            console.error('[GeofenceService] Failed to add geofence:', error);
            return false;
        }
    }

    /**
     * Remove a geofence
     */
    async removeGeofence(id: string): Promise<boolean> {
        if (!NativeGeofence) return false;

        try {
            await NativeGeofence.removeGeofence(id);
            console.log('[GeofenceService] Removed geofence:', id);
            return true;
        } catch (error) {
            console.error('[GeofenceService] Failed to remove geofence:', error);
            return false;
        }
    }

    /**
     * Remove all geofences
     */
    async removeAll(): Promise<boolean> {
        if (!NativeGeofence) return false;

        try {
            await NativeGeofence.removeAllGeofences();
            console.log('[GeofenceService] Removed all geofences');
            return true;
        } catch (error) {
            console.error('[GeofenceService] Failed to remove geofences:', error);
            return false;
        }
    }

    /**
     * Get all active geofences
     */
    async getActive(): Promise<GeofenceLocation[]> {
        if (!NativeGeofence) return [];
        return NativeGeofence.getActiveGeofences();
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // Named Locations (Home, Work, etc.)
    // ─────────────────────────────────────────────────────────────────────────────

    /**
     * Set home location
     */
    async setHome(latitude: number, longitude: number): Promise<boolean> {
        if (!NativeGeofence) return false;

        try {
            await NativeGeofence.addNamedLocation('Home', latitude, longitude);
            this.namedLocations.set('home', {
                id: 'named_home',
                name: 'Home',
                latitude,
                longitude,
            });
            console.log('[GeofenceService] Set home location');
            return true;
        } catch (error) {
            console.error('[GeofenceService] Failed to set home:', error);
            return false;
        }
    }

    /**
     * Set work location
     */
    async setWork(latitude: number, longitude: number): Promise<boolean> {
        if (!NativeGeofence) return false;

        try {
            await NativeGeofence.addNamedLocation('Work', latitude, longitude);
            this.namedLocations.set('work', {
                id: 'named_work',
                name: 'Work',
                latitude,
                longitude,
            });
            console.log('[GeofenceService] Set work location');
            return true;
        } catch (error) {
            console.error('[GeofenceService] Failed to set work:', error);
            return false;
        }
    }

    /**
     * Add a named location
     */
    async addNamedLocation(name: string, latitude: number, longitude: number): Promise<boolean> {
        if (!NativeGeofence) return false;

        try {
            await NativeGeofence.addNamedLocation(name, latitude, longitude);
            this.namedLocations.set(name.toLowerCase(), {
                id: `named_${name.toLowerCase()}`,
                name,
                latitude,
                longitude,
            });
            return true;
        } catch (error) {
            console.error('[GeofenceService] Failed to add named location:', error);
            return false;
        }
    }

    /**
     * Get named locations
     */
    getNamedLocations(): Map<string, GeofenceLocation> {
        return this.namedLocations;
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // Location-Based Reminders
    // ─────────────────────────────────────────────────────────────────────────────

    /**
     * Add a location-based reminder
     */
    async addReminder(options: {
        id?: string;
        name: string;
        latitude: number;
        longitude: number;
        message: string;
        radius?: number;
    }): Promise<boolean> {
        const id = options.id || `reminder_${Date.now()}`;

        return this.addGeofence({
            id,
            name: options.name,
            latitude: options.latitude,
            longitude: options.longitude,
            radius: options.radius || 100,
            onEnter: true,
            action: 'reminder',
            actionPayload: options.message,
        });
    }

    /**
     * Add reminder at home
     */
    async remindAtHome(message: string): Promise<boolean> {
        const home = this.namedLocations.get('home');
        if (!home) {
            console.error('[GeofenceService] Home location not set');
            return false;
        }

        return this.addReminder({
            name: 'Home',
            latitude: home.latitude,
            longitude: home.longitude,
            message,
        });
    }

    /**
     * Add reminder at work
     */
    async remindAtWork(message: string): Promise<boolean> {
        const work = this.namedLocations.get('work');
        if (!work) {
            console.error('[GeofenceService] Work location not set');
            return false;
        }

        return this.addReminder({
            name: 'Work',
            latitude: work.latitude,
            longitude: work.longitude,
            message,
        });
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // Focus Mode Triggers
    // ─────────────────────────────────────────────────────────────────────────────

    /**
     * Enable auto focus mode at a location
     */
    async enableAutoFocusAt(options: {
        name: string;
        latitude: number;
        longitude: number;
        radius?: number;
    }): Promise<boolean> {
        return this.addGeofence({
            id: `focus_${options.name.toLowerCase()}`,
            name: options.name,
            latitude: options.latitude,
            longitude: options.longitude,
            radius: options.radius || 100,
            onEnter: true,
            onExit: true,
            action: 'focus_mode',
            actionPayload: options.name,
        });
    }

    /**
     * Enable auto focus mode at work
     */
    async enableFocusModeAtWork(): Promise<boolean> {
        const work = this.namedLocations.get('work');
        if (!work) {
            console.error('[GeofenceService] Work location not set');
            return false;
        }

        return this.enableAutoFocusAt({
            name: 'Work',
            latitude: work.latitude,
            longitude: work.longitude,
        });
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // Event Handling
    // ─────────────────────────────────────────────────────────────────────────────

    /**
     * Handle geofence event from native
     */
    private handleEvent(event: GeofenceEvent): void {
        console.log('[GeofenceService] Event:', event.type, event.geofences);

        // Notify subscribers
        this.callbacks.forEach(cb => {
            try {
                cb(event);
            } catch (error) {
                console.error('[GeofenceService] Callback error:', error);
            }
        });
    }

    /**
     * Check if service is available
     */
    isAvailable(): boolean {
        return Platform.OS === 'android' && NativeGeofence != null;
    }
}

export const GeofenceService = new GeofenceServiceClass();
