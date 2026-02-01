/**
 * Relationship Service — Communication Tracking
 *
 * Purpose: Track communication with contacts for relationship health.
 * Metrics: Last contact, frequency trend, pending replies.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { ContactsService, PriorityContact } from './contacts.service';

export interface RelationshipRecord {
    contactId: string;
    contactName: string;
    phoneNumber?: string;
    isPriority: boolean;
    lastOutgoing: Date | null;
    lastIncoming: Date | null;
    outgoingCount30d: number;
    incomingCount30d: number;
    pendingReply: boolean;
    frequencyTrend: 'increasing' | 'stable' | 'decreasing';
    healthScore: number; // 0-100
    notes?: string;
}

export interface RelationshipInsight {
    type: 'neglected' | 'one_sided' | 'strong' | 'pending_reply';
    contactName: string;
    message: string;
    suggestedAction?: string;
    priority: 'high' | 'medium' | 'low';
}

export interface CommunicationEvent {
    contactId: string;
    contactName: string;
    direction: 'incoming' | 'outgoing';
    type: 'message' | 'call' | 'email';
    app?: string;
    timestamp: Date;
}

const STORAGE_KEY = 'mirror_relationships';
const NEGLECT_THRESHOLD_DAYS = 14;
const PENDING_REPLY_THRESHOLD_HOURS = 24;

class RelationshipServiceClass {
    private records: Map<string, RelationshipRecord> = new Map();
    private events: CommunicationEvent[] = [];
    private initialized = false;

    /**
     * Initialize relationship service
     */
    async initialize(): Promise<void> {
        if (this.initialized) return;

        try {
            const stored = await AsyncStorage.getItem(STORAGE_KEY);
            if (stored) {
                const data = JSON.parse(stored);
                if (data.records) {
                    for (const r of data.records) {
                        r.lastOutgoing = r.lastOutgoing ? new Date(r.lastOutgoing) : null;
                        r.lastIncoming = r.lastIncoming ? new Date(r.lastIncoming) : null;
                        this.records.set(r.contactId, r);
                    }
                }
                if (data.events) {
                    this.events = data.events.map((e: any) => ({
                        ...e,
                        timestamp: new Date(e.timestamp),
                    }));
                }
            }

            // Sync with priority contacts
            await this.syncWithContacts();

            this.initialized = true;
            console.log('[RelationshipService] Loaded', this.records.size, 'relationships');
        } catch (error) {
            console.error('[RelationshipService] Failed to load:', error);
        }
    }

    /**
     * Save to storage
     */
    private async save(): Promise<void> {
        try {
            const data = {
                records: Array.from(this.records.values()),
                events: this.events.slice(-1000), // Keep last 1000 events
            };
            await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        } catch (error) {
            console.error('[RelationshipService] Failed to save:', error);
        }
    }

    /**
     * Sync with contacts service
     */
    private async syncWithContacts(): Promise<void> {
        try {
            const priorityContacts = await ContactsService.getPriorityContacts();

            for (const contact of priorityContacts) {
                if (!this.records.has(contact.id)) {
                    this.records.set(contact.id, this.createRecord(contact));
                } else {
                    const record = this.records.get(contact.id)!;
                    record.isPriority = true;
                }
            }
        } catch {
            // Contacts not available
        }
    }

    /**
     * Create a new relationship record
     */
    private createRecord(contact: PriorityContact): RelationshipRecord {
        return {
            contactId: contact.id,
            contactName: contact.name,
            phoneNumber: contact.phoneNumber,
            isPriority: true,
            lastOutgoing: null,
            lastIncoming: null,
            outgoingCount30d: 0,
            incomingCount30d: 0,
            pendingReply: false,
            frequencyTrend: 'stable',
            healthScore: 50,
        };
    }

    /**
     * Record a communication event
     */
    async recordCommunication(event: Omit<CommunicationEvent, 'timestamp'>): Promise<void> {
        const fullEvent: CommunicationEvent = {
            ...event,
            timestamp: new Date(),
        };

        this.events.push(fullEvent);

        // Update or create record
        let record = this.records.get(event.contactId);
        if (!record) {
            record = {
                contactId: event.contactId,
                contactName: event.contactName,
                isPriority: false,
                lastOutgoing: null,
                lastIncoming: null,
                outgoingCount30d: 0,
                incomingCount30d: 0,
                pendingReply: false,
                frequencyTrend: 'stable',
                healthScore: 50,
            };
            this.records.set(event.contactId, record);
        }

        // Update record based on direction
        if (event.direction === 'outgoing') {
            record.lastOutgoing = fullEvent.timestamp;
            record.pendingReply = false; // We responded
        } else {
            record.lastIncoming = fullEvent.timestamp;
            record.pendingReply = true; // They messaged us
        }

        // Recalculate metrics
        this.updateMetrics(record);

        await this.save();
    }

    /**
     * Update metrics for a record
     */
    private updateMetrics(record: RelationshipRecord): void {
        const now = new Date();
        const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

        // Count events in last 30 days
        const recentEvents = this.events.filter(
            e => e.contactId === record.contactId && e.timestamp > thirtyDaysAgo
        );

        record.outgoingCount30d = recentEvents.filter(e => e.direction === 'outgoing').length;
        record.incomingCount30d = recentEvents.filter(e => e.direction === 'incoming').length;

        // Check pending reply status
        if (record.lastIncoming && record.lastOutgoing) {
            const hoursSinceIncoming = (now.getTime() - record.lastIncoming.getTime()) / (1000 * 60 * 60);
            record.pendingReply = record.lastIncoming > record.lastOutgoing && hoursSinceIncoming < 72;
        } else if (record.lastIncoming && !record.lastOutgoing) {
            record.pendingReply = true;
        }

        // Calculate frequency trend
        const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
        const olderEvents = this.events.filter(
            e => e.contactId === record.contactId && e.timestamp > sixtyDaysAgo && e.timestamp <= thirtyDaysAgo
        );
        const olderCount = olderEvents.length;
        const recentCount = recentEvents.length;

        if (recentCount > olderCount * 1.2) {
            record.frequencyTrend = 'increasing';
        } else if (recentCount < olderCount * 0.8) {
            record.frequencyTrend = 'decreasing';
        } else {
            record.frequencyTrend = 'stable';
        }

        // Calculate health score
        record.healthScore = this.calculateHealthScore(record);
    }

    /**
     * Calculate relationship health score
     */
    private calculateHealthScore(record: RelationshipRecord): number {
        let score = 50; // Base score

        // Activity bonus
        const totalActivity = record.outgoingCount30d + record.incomingCount30d;
        if (totalActivity >= 10) score += 20;
        else if (totalActivity >= 5) score += 10;
        else if (totalActivity === 0) score -= 20;

        // Balance (two-way communication)
        if (record.outgoingCount30d > 0 && record.incomingCount30d > 0) {
            const ratio = Math.min(record.outgoingCount30d, record.incomingCount30d) /
                          Math.max(record.outgoingCount30d, record.incomingCount30d);
            score += ratio * 15; // Up to 15 points for balanced communication
        }

        // Recency bonus
        const lastContact = record.lastOutgoing && record.lastIncoming
            ? new Date(Math.max(record.lastOutgoing.getTime(), record.lastIncoming.getTime()))
            : record.lastOutgoing || record.lastIncoming;

        if (lastContact) {
            const daysSince = (Date.now() - lastContact.getTime()) / (1000 * 60 * 60 * 24);
            if (daysSince < 3) score += 15;
            else if (daysSince < 7) score += 10;
            else if (daysSince < 14) score += 5;
            else if (daysSince > 30) score -= 15;
        }

        // Pending reply penalty
        if (record.pendingReply) score -= 10;

        // Priority contact bonus
        if (record.isPriority) score += 5;

        return Math.max(0, Math.min(100, score));
    }

    /**
     * Get all relationships sorted by health
     */
    getRelationships(): RelationshipRecord[] {
        return Array.from(this.records.values())
            .sort((a, b) => a.healthScore - b.healthScore);
    }

    /**
     * Get priority relationships
     */
    getPriorityRelationships(): RelationshipRecord[] {
        return this.getRelationships().filter(r => r.isPriority);
    }

    /**
     * Get neglected contacts
     */
    getNeglectedContacts(): RelationshipRecord[] {
        const now = Date.now();

        return Array.from(this.records.values())
            .filter(r => {
                if (!r.isPriority) return false;

                const lastContact = r.lastOutgoing || r.lastIncoming;
                if (!lastContact) return true;

                const daysSince = (now - lastContact.getTime()) / (1000 * 60 * 60 * 24);
                return daysSince > NEGLECT_THRESHOLD_DAYS;
            })
            .sort((a, b) => {
                const aLast = a.lastOutgoing || a.lastIncoming;
                const bLast = b.lastOutgoing || b.lastIncoming;
                if (!aLast) return -1;
                if (!bLast) return 1;
                return aLast.getTime() - bLast.getTime();
            });
    }

    /**
     * Get contacts with pending replies
     */
    getPendingReplies(): RelationshipRecord[] {
        return Array.from(this.records.values())
            .filter(r => r.pendingReply)
            .sort((a, b) => {
                const aTime = a.lastIncoming?.getTime() || 0;
                const bTime = b.lastIncoming?.getTime() || 0;
                return aTime - bTime; // Oldest first
            });
    }

    /**
     * Get relationship insights
     */
    getInsights(): RelationshipInsight[] {
        const insights: RelationshipInsight[] = [];

        // Pending replies
        const pending = this.getPendingReplies();
        for (const record of pending.slice(0, 3)) {
            insights.push({
                type: 'pending_reply',
                contactName: record.contactName,
                message: `${record.contactName} is waiting for your reply`,
                suggestedAction: 'Send a message',
                priority: 'high',
            });
        }

        // Neglected relationships
        const neglected = this.getNeglectedContacts();
        for (const record of neglected.slice(0, 3)) {
            const daysSince = record.lastOutgoing
                ? Math.floor((Date.now() - record.lastOutgoing.getTime()) / (1000 * 60 * 60 * 24))
                : 'never';

            insights.push({
                type: 'neglected',
                contactName: record.contactName,
                message: `Haven't reached out to ${record.contactName} in ${daysSince} days`,
                suggestedAction: 'Check in with them',
                priority: 'medium',
            });
        }

        // One-sided relationships
        const oneSided = Array.from(this.records.values()).filter(r => {
            if (!r.isPriority) return false;
            return r.outgoingCount30d > 0 && r.incomingCount30d === 0;
        });

        for (const record of oneSided.slice(0, 2)) {
            insights.push({
                type: 'one_sided',
                contactName: record.contactName,
                message: `${record.contactName} hasn't responded to your recent messages`,
                priority: 'low',
            });
        }

        // Strong relationships
        const strong = Array.from(this.records.values())
            .filter(r => r.healthScore >= 80 && r.isPriority)
            .slice(0, 2);

        for (const record of strong) {
            insights.push({
                type: 'strong',
                contactName: record.contactName,
                message: `Great relationship with ${record.contactName}! Keep it up.`,
                priority: 'low',
            });
        }

        return insights;
    }

    /**
     * Get relationship for a contact
     */
    getRelationship(contactId: string): RelationshipRecord | undefined {
        return this.records.get(contactId);
    }

    /**
     * Mark a contact as priority
     */
    async markAsPriority(contactId: string, contactName: string): Promise<void> {
        let record = this.records.get(contactId);
        if (!record) {
            record = {
                contactId,
                contactName,
                isPriority: true,
                lastOutgoing: null,
                lastIncoming: null,
                outgoingCount30d: 0,
                incomingCount30d: 0,
                pendingReply: false,
                frequencyTrend: 'stable',
                healthScore: 50,
            };
            this.records.set(contactId, record);
        } else {
            record.isPriority = true;
        }
        await this.save();
    }

    /**
     * Add a note to a relationship
     */
    async addNote(contactId: string, note: string): Promise<void> {
        const record = this.records.get(contactId);
        if (record) {
            record.notes = note;
            await this.save();
        }
    }

    /**
     * Get summary stats
     */
    getSummary(): {
        totalRelationships: number;
        priorityCount: number;
        pendingReplies: number;
        neglectedCount: number;
        averageHealthScore: number;
    } {
        const records = Array.from(this.records.values());
        const priorityRecords = records.filter(r => r.isPriority);

        return {
            totalRelationships: records.length,
            priorityCount: priorityRecords.length,
            pendingReplies: records.filter(r => r.pendingReply).length,
            neglectedCount: this.getNeglectedContacts().length,
            averageHealthScore: priorityRecords.length > 0
                ? Math.round(priorityRecords.reduce((sum, r) => sum + r.healthScore, 0) / priorityRecords.length)
                : 0,
        };
    }

    /**
     * Clear all data
     */
    async clear(): Promise<void> {
        this.records.clear();
        this.events = [];
        await AsyncStorage.removeItem(STORAGE_KEY);
    }
}

export const RelationshipService = new RelationshipServiceClass();
