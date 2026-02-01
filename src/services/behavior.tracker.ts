/**
 * Behavior Tracker — Event Collection for Pattern Recognition
 *
 * Purpose: Track user behavior events and feed into PatternService.
 * Collects: App usage, location visits, communication, focus sessions.
 */

import { AppState, AppStateStatus } from 'react-native';
import { PatternService } from './pattern.service';
import { GeofenceService, GeofenceEvent } from './geofence.service';
import { FocusService, FocusEvent } from './focus.service';

export interface TrackedEvent {
    category: EventCategory;
    action: string;
    timestamp: Date;
    metadata?: Record<string, any>;
}

export type EventCategory =
    | 'app_usage'
    | 'location'
    | 'communication'
    | 'focus'
    | 'interaction'
    | 'notification';

class BehaviorTrackerClass {
    private isTracking = false;
    private appStateSubscription: any = null;
    private geofenceSubscription: (() => void) | null = null;
    private focusSubscription: (() => void) | null = null;
    private lastAppState: AppStateStatus = 'active';

    /**
     * Start tracking behavior
     */
    async start(): Promise<void> {
        if (this.isTracking) return;

        // Initialize pattern service
        await PatternService.initialize();

        // Track app state changes
        this.appStateSubscription = AppState.addEventListener('change', this.handleAppStateChange);

        // Track geofence events
        this.geofenceSubscription = GeofenceService.subscribe(this.handleGeofenceEvent);

        // Track focus events
        this.focusSubscription = FocusService.subscribe(this.handleFocusEvent);

        this.isTracking = true;
        console.log('[BehaviorTracker] Started tracking');

        // Record session start
        await this.trackEvent('interaction', 'session_started');
    }

    /**
     * Stop tracking behavior
     */
    stop(): void {
        if (!this.isTracking) return;

        if (this.appStateSubscription) {
            this.appStateSubscription.remove();
            this.appStateSubscription = null;
        }

        if (this.geofenceSubscription) {
            this.geofenceSubscription();
            this.geofenceSubscription = null;
        }

        if (this.focusSubscription) {
            this.focusSubscription();
            this.focusSubscription = null;
        }

        this.isTracking = false;
        console.log('[BehaviorTracker] Stopped tracking');
    }

    /**
     * Track a custom event
     */
    async trackEvent(
        category: EventCategory,
        action: string,
        metadata?: Record<string, any>
    ): Promise<void> {
        if (!this.isTracking) return;

        const event: TrackedEvent = {
            category,
            action,
            timestamp: new Date(),
            metadata,
        };

        // Send to pattern service
        await PatternService.recordEvent(`${category}_${action}`, {
            ...metadata,
            category,
            action,
        });

        console.log('[BehaviorTracker] Tracked:', category, action);
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // Event Handlers
    // ─────────────────────────────────────────────────────────────────────────────

    private handleAppStateChange = async (nextState: AppStateStatus) => {
        if (nextState === 'active' && this.lastAppState !== 'active') {
            await this.trackEvent('app_usage', 'app_foregrounded');
        } else if (nextState === 'background' && this.lastAppState === 'active') {
            await this.trackEvent('app_usage', 'app_backgrounded');
        }
        this.lastAppState = nextState;
    };

    private handleGeofenceEvent = async (event: GeofenceEvent) => {
        for (const geofence of event.geofences) {
            await this.trackEvent('location', `location_${event.type}`, {
                locationId: geofence.id,
                locationName: geofence.name,
                latitude: geofence.latitude,
                longitude: geofence.longitude,
            });
        }
    };

    private handleFocusEvent = async (event: FocusEvent) => {
        await this.trackEvent('focus', `focus_${event.type}`, {
            minutes: event.minutes,
        });
    };

    // ─────────────────────────────────────────────────────────────────────────────
    // Specific Trackers
    // ─────────────────────────────────────────────────────────────────────────────

    /**
     * Track app open
     */
    async trackAppOpen(packageName: string, appName?: string): Promise<void> {
        await this.trackEvent('app_usage', 'app_open', {
            packageName,
            appName: appName || packageName,
        });
    }

    /**
     * Track message sent
     */
    async trackMessageSent(contactName: string, app: string): Promise<void> {
        await this.trackEvent('communication', 'message_sent', {
            contactName,
            app,
        });
    }

    /**
     * Track message received
     */
    async trackMessageReceived(contactName: string, app: string): Promise<void> {
        await this.trackEvent('communication', 'message_received', {
            contactName,
            app,
        });
    }

    /**
     * Track notification received
     */
    async trackNotification(packageName: string, category: string): Promise<void> {
        await this.trackEvent('notification', 'received', {
            packageName,
            category,
        });
    }

    /**
     * Track notification dismissed
     */
    async trackNotificationDismissed(packageName: string): Promise<void> {
        await this.trackEvent('notification', 'dismissed', {
            packageName,
        });
    }

    /**
     * Track note created
     */
    async trackNoteCreated(tags?: string[]): Promise<void> {
        await this.trackEvent('interaction', 'note_created', {
            tags,
        });
    }

    /**
     * Track search performed
     */
    async trackSearch(query: string, source: string): Promise<void> {
        await this.trackEvent('interaction', 'search', {
            queryLength: query.length,
            source,
        });
    }

    /**
     * Track screen viewed
     */
    async trackScreenView(screenName: string): Promise<void> {
        await this.trackEvent('interaction', 'screen_view', {
            screenName,
        });
    }

    /**
     * Track calendar event viewed/created
     */
    async trackCalendarAction(action: 'viewed' | 'created', eventTitle?: string): Promise<void> {
        await this.trackEvent('interaction', `calendar_${action}`, {
            eventTitle,
        });
    }

    /**
     * Track voice capture
     */
    async trackVoiceCapture(durationSeconds: number): Promise<void> {
        await this.trackEvent('interaction', 'voice_capture', {
            durationSeconds,
        });
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // Analytics
    // ─────────────────────────────────────────────────────────────────────────────

    /**
     * Get tracking status
     */
    isActive(): boolean {
        return this.isTracking;
    }

    /**
     * Get behavior insights
     */
    getInsights(): string[] {
        return PatternService.getInsights();
    }

    /**
     * Get current suggestions based on patterns
     */
    getSuggestions() {
        return PatternService.getSuggestions();
    }

    /**
     * Get all recognized patterns
     */
    getPatterns() {
        return PatternService.getPatterns();
    }
}

export const BehaviorTracker = new BehaviorTrackerClass();
