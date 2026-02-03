/**
 * Notification Filter Service — AI-Powered Classification
 *
 * Purpose: Classify notifications by urgency and importance.
 * Categories: Urgent → Important → Informational → Noise
 *
 * Uses heuristics first, then AI for ambiguous cases.
 */

import { NotificationData } from './passive.service';
import { LLMService } from './llm.service';
import { ContactsService } from './contacts.service';

export type NotificationCategory = 'urgent' | 'important' | 'informational' | 'noise';

export interface ClassifiedNotification extends NotificationData {
    category: NotificationCategory;
    categoryReason: string;
    shouldSurface: boolean;
    suggestedAction?: 'respond' | 'dismiss' | 'snooze' | 'read_later';
}

export interface FilterConfig {
    // Apps that are always urgent
    urgentApps: string[];
    // Apps that are always noise
    noiseApps: string[];
    // Keywords that indicate urgency
    urgentKeywords: string[];
    // Use AI for classification
    enableAI: boolean;
    // AI confidence threshold for classification
    aiConfidenceThreshold: number;
}

const DEFAULT_CONFIG: FilterConfig = {
    urgentApps: [
        'com.whatsapp',
        'com.google.android.apps.messaging',
        'org.telegram.messenger',
        'com.Slack',
        'com.slack',
    ],
    noiseApps: [
        'com.android.vending', // Play Store
        'com.google.android.youtube',
        'com.spotify.music',
        'com.netflix.mediaclient',
        'com.facebook.orca',
        'com.instagram.android',
        'com.twitter.android',
        'com.zhiliaoapp.musically', // TikTok
    ],
    urgentKeywords: [
        'urgent',
        'emergency',
        'asap',
        'immediately',
        'critical',
        'now',
        'call me',
        'help',
        'sos',
        'deadline',
        'payment due',
        'security alert',
        'fraud',
        'suspicious',
        'verification code',
        'otp',
        '2fa',
        'confirm',
    ],
    enableAI: true,
    aiConfidenceThreshold: 0.7,
};

// Category rules by Android notification category
const CATEGORY_MAPPING: Record<string, NotificationCategory> = {
    'msg': 'important',
    'email': 'informational',
    'call': 'urgent',
    'alarm': 'urgent',
    'reminder': 'important',
    'event': 'important',
    'social': 'informational',
    'promo': 'noise',
    'recommendation': 'noise',
    'status': 'noise',
    'progress': 'noise',
    'service': 'noise',
    'transport': 'informational',
    'navigation': 'informational',
    'err': 'urgent',
    'sys': 'noise',
};

class NotificationFilterClass {
    private config: FilterConfig = DEFAULT_CONFIG;
    private classificationCache: Map<string, ClassifiedNotification> = new Map();
    private priorityContacts: Set<string> = new Set();

    /**
     * Initialize filter with config and load priority contacts
     */
    async initialize(config?: Partial<FilterConfig>): Promise<void> {
        if (config) {
            this.config = { ...this.config, ...config };
        }

        // Load priority contacts
        try {
            const contacts = await ContactsService.getPriorityContacts();
            this.priorityContacts = new Set(
                contacts.map(c => c.name.toLowerCase())
            );
            console.log('[NotificationFilter] Loaded', this.priorityContacts.size, 'priority contacts');
        } catch {
            // Contacts not available
        }
    }

    /**
     * Update filter configuration
     */
    updateConfig(config: Partial<FilterConfig>): void {
        this.config = { ...this.config, ...config };
    }

    /**
     * Classify a notification
     */
    async classify(notification: NotificationData): Promise<ClassifiedNotification> {
        // Check cache first
        const cached = this.classificationCache.get(notification.id);
        if (cached) {
            return cached;
        }

        // Run heuristic classification first
        let result = this.heuristicClassify(notification);

        // If confidence is low and AI is enabled, use AI
        if (
            this.config.enableAI &&
            result.category === 'informational' &&
            !result.categoryReason.includes('keyword') &&
            !result.categoryReason.includes('priority contact')
        ) {
            const aiResult = await this.aiClassify(notification);
            if (aiResult) {
                result = aiResult;
            }
        }

        // Cache result
        this.classificationCache.set(notification.id, result);

        // Limit cache size
        if (this.classificationCache.size > 100) {
            const oldest = this.classificationCache.keys().next().value;
            if (oldest) {
                this.classificationCache.delete(oldest);
            }
        }

        return result;
    }

    /**
     * Batch classify multiple notifications
     */
    async classifyBatch(notifications: NotificationData[]): Promise<ClassifiedNotification[]> {
        return Promise.all(notifications.map(n => this.classify(n)));
    }

    /**
     * Filter notifications to only important ones
     */
    async filterImportant(notifications: NotificationData[]): Promise<ClassifiedNotification[]> {
        const classified = await this.classifyBatch(notifications);
        return classified.filter(n => n.shouldSurface);
    }

    /**
     * Get notifications grouped by category
     */
    async groupByCategory(notifications: NotificationData[]): Promise<Record<NotificationCategory, ClassifiedNotification[]>> {
        const classified = await this.classifyBatch(notifications);
        const grouped: Record<NotificationCategory, ClassifiedNotification[]> = {
            urgent: [],
            important: [],
            informational: [],
            noise: [],
        };

        for (const n of classified) {
            grouped[n.category].push(n);
        }

        return grouped;
    }

    /**
     * Heuristic-based classification (fast, no AI)
     */
    private heuristicClassify(notification: NotificationData): ClassifiedNotification {
        const { packageName, title, text, category, isPriority, isOngoing } = notification;
        const content = `${title} ${text}`.toLowerCase();

        // Check if from noise app
        if (this.config.noiseApps.includes(packageName)) {
            return this.createResult(notification, 'noise', 'App in noise list', false);
        }

        // Ongoing notifications are usually noise (download progress, etc.)
        if (isOngoing && category !== 'call' && category !== 'navigation') {
            return this.createResult(notification, 'noise', 'Ongoing notification', false);
        }

        // Check for urgent keywords
        for (const keyword of this.config.urgentKeywords) {
            if (content.includes(keyword.toLowerCase())) {
                return this.createResult(
                    notification,
                    'urgent',
                    `Contains urgent keyword: "${keyword}"`,
                    true,
                    'respond'
                );
            }
        }

        // Check if from urgent app
        if (this.config.urgentApps.includes(packageName)) {
            // Check if from priority contact
            if (this.isPriorityContact(title, text)) {
                return this.createResult(
                    notification,
                    'urgent',
                    'Message from priority contact',
                    true,
                    'respond'
                );
            }
            return this.createResult(
                notification,
                'important',
                'From priority app',
                true,
                'respond'
            );
        }

        // Check Android notification category
        if (category && CATEGORY_MAPPING[category]) {
            const mappedCategory = CATEGORY_MAPPING[category];
            return this.createResult(
                notification,
                mappedCategory,
                `Android category: ${category}`,
                mappedCategory !== 'noise'
            );
        }

        // Check if isPriority flag was set by Android
        if (isPriority) {
            return this.createResult(
                notification,
                'important',
                'Marked as priority by system',
                true
            );
        }

        // Default to informational
        return this.createResult(
            notification,
            'informational',
            'Default classification',
            true,
            'read_later'
        );
    }

    /**
     * AI-based classification for ambiguous notifications
     */
    private async aiClassify(notification: NotificationData): Promise<ClassifiedNotification | null> {
        try {
            const prompt = `Classify this notification by urgency. Reply with ONLY one word: URGENT, IMPORTANT, INFORMATIONAL, or NOISE.

App: ${notification.appName}
Title: ${notification.title}
Content: ${notification.text.slice(0, 200)}

Consider:
- URGENT: Requires immediate action (security alerts, calls, emergencies)
- IMPORTANT: Should read soon (messages from people, calendar reminders)
- INFORMATIONAL: Can wait (news, updates, promotions that might interest user)
- NOISE: Can ignore (spam, ads, unnecessary updates)

Classification:`;

            const response = await LLMService.complete(prompt, 10);

            const classification = (response?.text || '').trim().toUpperCase();
            let category: NotificationCategory = 'informational';
            let reason = 'AI classification';

            if (classification.includes('URGENT')) {
                category = 'urgent';
                reason = 'AI determined urgent';
            } else if (classification.includes('IMPORTANT')) {
                category = 'important';
                reason = 'AI determined important';
            } else if (classification.includes('NOISE')) {
                category = 'noise';
                reason = 'AI determined noise';
            } else if (classification.includes('INFORMATIONAL')) {
                category = 'informational';
                reason = 'AI determined informational';
            }

            return this.createResult(
                notification,
                category,
                reason,
                category !== 'noise',
                category === 'urgent' ? 'respond' : undefined
            );
        } catch (error) {
            console.error('[NotificationFilter] AI classification failed:', error);
            return null;
        }
    }

    /**
     * Check if notification mentions a priority contact
     */
    private isPriorityContact(title: string, text: string): boolean {
        const content = `${title} ${text}`.toLowerCase();

        for (const contact of this.priorityContacts) {
            if (content.includes(contact)) {
                return true;
            }
        }

        return false;
    }

    /**
     * Create a classified notification result
     */
    private createResult(
        notification: NotificationData,
        category: NotificationCategory,
        reason: string,
        shouldSurface: boolean,
        suggestedAction?: 'respond' | 'dismiss' | 'snooze' | 'read_later'
    ): ClassifiedNotification {
        return {
            ...notification,
            category,
            categoryReason: reason,
            shouldSurface,
            suggestedAction,
        };
    }

    /**
     * Add an app to the noise list
     */
    addNoiseApp(packageName: string): void {
        if (!this.config.noiseApps.includes(packageName)) {
            this.config.noiseApps.push(packageName);
        }
    }

    /**
     * Remove an app from the noise list
     */
    removeNoiseApp(packageName: string): void {
        this.config.noiseApps = this.config.noiseApps.filter(p => p !== packageName);
    }

    /**
     * Add an app to the urgent list
     */
    addUrgentApp(packageName: string): void {
        if (!this.config.urgentApps.includes(packageName)) {
            this.config.urgentApps.push(packageName);
        }
    }

    /**
     * Remove an app from the urgent list
     */
    removeUrgentApp(packageName: string): void {
        this.config.urgentApps = this.config.urgentApps.filter(p => p !== packageName);
    }

    /**
     * Clear the classification cache
     */
    clearCache(): void {
        this.classificationCache.clear();
    }

    /**
     * Get current configuration
     */
    getConfig(): FilterConfig {
        return { ...this.config };
    }

    /**
     * Generate a summary of recent notifications
     */
    async summarize(notifications: NotificationData[]): Promise<string> {
        const grouped = await this.groupByCategory(notifications);

        const parts: string[] = [];

        if (grouped.urgent.length > 0) {
            parts.push(`🔴 ${grouped.urgent.length} urgent notification${grouped.urgent.length > 1 ? 's' : ''}`);
        }
        if (grouped.important.length > 0) {
            parts.push(`🟡 ${grouped.important.length} important`);
        }
        if (grouped.informational.length > 0) {
            parts.push(`🔵 ${grouped.informational.length} informational`);
        }
        if (grouped.noise.length > 0) {
            parts.push(`⚪ ${grouped.noise.length} filtered as noise`);
        }

        if (parts.length === 0) {
            return 'No notifications';
        }

        return parts.join(' • ');
    }
}

export const NotificationFilter = new NotificationFilterClass();
