/**
 * PassiveIntelligence Service — JS Bridge
 *
 * Interfaces with native Android modules for:
 * - Clipboard watching (auto-capture URLs, phones, addresses)
 * - Notification interception (AI summarization)
 * - Screen context (accessibility service)
 */

import {
    NativeModules,
    NativeEventEmitter,
    Platform,
    AppRegistry,
} from 'react-native';
import { VaultService } from './vault.service';
import { NotificationFilter, ClassifiedNotification } from './notification.filter';

const { PassiveIntelligence } = NativeModules;

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface ClipboardCapture {
    text: string;
    type: 'url' | 'phone' | 'email' | 'address' | 'crypto_address' | 'text';
    confidence: number;
    timestamp: number;
}

export interface NotificationData {
    id: string;
    packageName: string;
    appName: string;
    title: string;
    text: string;
    timestamp: number;
    isPriority: boolean;
    isOngoing: boolean;
    category: string;
}

export interface ScreenContext {
    packageName: string;
    activityName: string;
    appName: string;
    lastWindowChange: number;
    summary: string;
    textElements: Array<{
        text: string;
        className: string;
        x: number;
        y: number;
    }>;
    interactiveElements: Array<{
        text: string;
        className: string;
        viewId: string;
        isClickable: boolean;
        isEditable: boolean;
        x: number;
        y: number;
        width: number;
        height: number;
    }>;
}

export interface PassiveStatus {
    clipboardEnabled: boolean;
    notificationEnabled: boolean;
    screenContextEnabled: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Clipboard Watcher
// ─────────────────────────────────────────────────────────────────────────────

class ClipboardWatcherClass {
    private emitter: NativeEventEmitter | null = null;
    private subscription: any = null;
    private onCapture: ((capture: ClipboardCapture) => void) | null = null;
    private autoSaveToVault: boolean = true;

    /**
     * Start watching clipboard for content
     */
    async start(options?: {
        onCapture?: (capture: ClipboardCapture) => void;
        autoSaveToVault?: boolean;
    }): Promise<boolean> {
        if (Platform.OS !== 'android' || !PassiveIntelligence) {
            console.warn('ClipboardWatcher: Only available on Android');
            return false;
        }

        this.onCapture = options?.onCapture || null;
        this.autoSaveToVault = options?.autoSaveToVault ?? true;

        try {
            await PassiveIntelligence.startClipboardWatcher();

            // Set up event listener
            this.emitter = new NativeEventEmitter(PassiveIntelligence);
            this.subscription = this.emitter.addListener(
                'onClipboardCapture',
                this.handleCapture.bind(this)
            );

            return true;
        } catch (error) {
            console.error('ClipboardWatcher start failed:', error);
            return false;
        }
    }

    /**
     * Stop watching clipboard
     */
    async stop(): Promise<void> {
        if (this.subscription) {
            this.subscription.remove();
            this.subscription = null;
        }
        if (PassiveIntelligence) {
            await PassiveIntelligence.stopClipboardWatcher();
        }
    }

    /**
     * Get current clipboard content
     */
    async getCurrent(): Promise<string | null> {
        if (!PassiveIntelligence) return null;
        return PassiveIntelligence.getCurrentClipboard();
    }

    private async handleCapture(capture: ClipboardCapture) {
        // Callback to consumer
        if (this.onCapture) {
            this.onCapture(capture);
        }

        // Auto-save to vault if enabled and high-confidence structured data
        if (this.autoSaveToVault && capture.confidence >= 0.7 && capture.type !== 'text') {
            await this.saveToVault(capture);
        }
    }

    private async saveToVault(capture: ClipboardCapture) {
        const typeLabels: Record<string, string> = {
            url: 'Link',
            phone: 'Phone Number',
            email: 'Email',
            address: 'Address',
            crypto_address: 'Crypto Address',
        };

        const label = typeLabels[capture.type] || 'Clipboard';
        const date = new Date(capture.timestamp).toLocaleDateString();

        try {
            await VaultService.createSpark(
                `${label}: ${capture.text.slice(0, 50)}${capture.text.length > 50 ? '...' : ''}`,
                `**${label}** captured on ${date}\n\n\`${capture.text}\``,
                [capture.type, 'clipboard', 'auto-captured']
            );
        } catch (error) {
            console.error('Failed to save clipboard to vault:', error);
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Notification Interceptor
// ─────────────────────────────────────────────────────────────────────────────

class NotificationInterceptorClass {
    private onNotification: ((notification: NotificationData) => void) | null = null;
    private onClassifiedNotification: ((notification: ClassifiedNotification) => void) | null = null;
    private filterEnabled: boolean = true;

    /**
     * Check if notification access is enabled
     */
    async isEnabled(): Promise<boolean> {
        if (!PassiveIntelligence) return false;
        return PassiveIntelligence.isNotificationAccessEnabled();
    }

    /**
     * Open system settings for notification access
     */
    async openSettings(): Promise<void> {
        if (PassiveIntelligence) {
            await PassiveIntelligence.openNotificationAccessSettings();
        }
    }

    /**
     * Get all currently active notifications
     */
    async getActive(): Promise<NotificationData[]> {
        if (!PassiveIntelligence) return [];
        return PassiveIntelligence.getActiveNotifications();
    }

    /**
     * Get all active notifications, classified
     */
    async getActiveClassified(): Promise<ClassifiedNotification[]> {
        const notifications = await this.getActive();
        return NotificationFilter.classifyBatch(notifications);
    }

    /**
     * Get only important notifications (urgent + important)
     */
    async getImportant(): Promise<ClassifiedNotification[]> {
        const notifications = await this.getActive();
        return NotificationFilter.filterImportant(notifications);
    }

    /**
     * Dismiss a notification by its key
     */
    async dismiss(key: string): Promise<boolean> {
        if (!PassiveIntelligence) return false;
        return PassiveIntelligence.dismissNotification(key);
    }

    /**
     * Set callback for incoming notifications (raw)
     * (Called from headless JS task)
     */
    setHandler(handler: (notification: NotificationData) => void): void {
        this.onNotification = handler;
    }

    /**
     * Set callback for classified notifications
     * Called after AI filtering with category info
     */
    setClassifiedHandler(handler: (notification: ClassifiedNotification) => void): void {
        this.onClassifiedNotification = handler;
    }

    /**
     * Enable/disable filtering
     */
    setFilterEnabled(enabled: boolean): void {
        this.filterEnabled = enabled;
    }

    /**
     * Process incoming notification (called from headless task)
     */
    async processNotification(notification: NotificationData): Promise<void> {
        // Raw callback first
        if (this.onNotification) {
            this.onNotification(notification);
        }

        // Classify and callback
        if (this.filterEnabled && this.onClassifiedNotification) {
            try {
                const classified = await NotificationFilter.classify(notification);
                this.onClassifiedNotification(classified);
            } catch (error) {
                console.error('[NotificationInterceptor] Classification error:', error);
            }
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Screen Context
// ─────────────────────────────────────────────────────────────────────────────

class ScreenContextClass {
    /**
     * Check if accessibility service is enabled
     */
    async isEnabled(): Promise<boolean> {
        if (!PassiveIntelligence) return false;
        return PassiveIntelligence.isAccessibilityEnabled();
    }

    /**
     * Open system settings for accessibility
     */
    async openSettings(): Promise<void> {
        if (PassiveIntelligence) {
            await PassiveIntelligence.openAccessibilitySettings();
        }
    }

    /**
     * Get current screen context
     * Returns text content and interactive elements visible on screen
     */
    async getContext(): Promise<ScreenContext | null> {
        if (!PassiveIntelligence) return null;
        try {
            return await PassiveIntelligence.getScreenContext();
        } catch (error) {
            console.error('Screen context error:', error);
            return null;
        }
    }

    /**
     * Get a human-readable summary of the current screen
     */
    async getSummary(): Promise<string> {
        const context = await this.getContext();
        if (!context) {
            return 'Screen context not available. Enable accessibility service in settings.';
        }

        return `Currently viewing: ${context.appName}\n\n${context.summary}`;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Unified Passive Intelligence Service
// ─────────────────────────────────────────────────────────────────────────────

class PassiveIntelligenceServiceClass {
    public clipboard = new ClipboardWatcherClass();
    public notifications = new NotificationInterceptorClass();
    public screen = new ScreenContextClass();

    /**
     * Get status of all passive intelligence features
     */
    async getStatus(): Promise<PassiveStatus> {
        if (!PassiveIntelligence) {
            return {
                clipboardEnabled: false,
                notificationEnabled: false,
                screenContextEnabled: false,
            };
        }
        return PassiveIntelligence.getPassiveStatus();
    }

    /**
     * Initialize all passive intelligence features
     * Call this on app startup
     */
    async initialize(): Promise<void> {
        // Start clipboard watcher (no permissions needed)
        await this.clipboard.start();

        // Log status of permission-gated features
        const status = await this.getStatus();
        console.log('[PassiveIntelligence] Status:', status);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Headless JS Task for Background Notification Processing
// ─────────────────────────────────────────────────────────────────────────────

const notificationInterceptor = new NotificationInterceptorClass();

async function NotificationTask(data: { data: string }) {
    try {
        const notification = JSON.parse(data.data) as NotificationData;
        await notificationInterceptor.processNotification(notification);
    } catch (error) {
        console.error('NotificationTask error:', error);
    }
}

// Register headless task
AppRegistry.registerHeadlessTask('NotificationTask', () => NotificationTask);

// ─────────────────────────────────────────────────────────────────────────────
// Exports
// ─────────────────────────────────────────────────────────────────────────────

export const PassiveIntelligenceService = new PassiveIntelligenceServiceClass();
export const ClipboardWatcher = new ClipboardWatcherClass();
export const NotificationInterceptor = new NotificationInterceptorClass();
export const ScreenContext = new ScreenContextClass();

export default PassiveIntelligenceService;
