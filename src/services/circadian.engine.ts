/**
 * Circadian Intelligence Engine — The Conductor
 *
 * The phone has a circadian rhythm, not a notification queue.
 *
 * Phases: morning_pilot → focus_shield → afternoon_flow → evening_wind → sleep_guard
 *
 * Three attention states:
 *   Silent  — deep work, sleep. Nothing except emergencies.
 *   Whisper — between tasks. Subtle haptic + one-line nudge.
 *   Speak   — idle/receptive. Full TTS briefing.
 *
 * Accumulates context silently all day. Synthesizes. Delivers at the right
 * moment in the right modality. Treats attention as a resource to conserve.
 */

import { CalendarService, type CalendarEvent } from './calendar.service';
import { WeatherService, type WeatherData } from './weather.service';
import { NudgeService, type Nudge } from './nudge.service';
import { NotificationFilter, type ClassifiedNotification } from './notification.filter';
import { PassiveIntelligenceService, type NotificationData } from './passive.service';
import { BriefingService } from './briefing.service';
import { FocusService } from './focus.service';
import { PatternService } from './pattern.service';
import { BehaviorTracker } from './behavior.tracker';
import { DeviceOrchestratorService } from './device_orchestrator.service';
import { TTSService } from './tts.service';
import { HapticSymphony } from './HapticSymphony';

// ─── Types ───────────────────────────────────────────────────

export type CircadianPhase =
    | 'morning_pilot'    // 6:00–9:00  — wake up, brief, prepare
    | 'focus_shield'     // 9:00–12:00 — deep work, suppress everything
    | 'afternoon_flow'   // 12:00–17:00 — normal flow, batch delivery
    | 'evening_wind'     // 17:00–21:00 — wind down, review
    | 'sleep_guard';     // 21:00–6:00  — silence, only emergencies

export type AttentionState = 'silent' | 'whisper' | 'speak';

export type DeliveryMode = 'haptic' | 'nudge' | 'tts' | 'full';

export type AttentionSource =
    | 'calendar'
    | 'notification'
    | 'battery'
    | 'relationship'
    | 'pattern'
    | 'clipboard'
    | 'weather'
    | 'briefing'
    | 'focus'
    | 'system';

export interface AttentionItem {
    id: string;
    source: AttentionSource;
    priority: 'urgent' | 'high' | 'medium' | 'low';
    message: string;
    detail?: string;
    createdAt: number;
    expiresAt?: number;
    delivered: boolean;
    deliveredAt?: number;
    deliveryMode?: DeliveryMode;
    escalationCount: number;
    data?: Record<string, unknown>;
}

export interface CircadianState {
    phase: CircadianPhase;
    attentionState: AttentionState;
    queueSize: number;
    pendingCount: number;
    lastDelivery: number | null;
    focusActive: boolean;
    nextMeeting: { title: string; minutesUntil: number } | null;
    battery: number | null;
}

export interface CircadianConfig {
    enabled: boolean;
    heartbeatMs: number;            // How often to check (default 60s)
    morningBriefingEnabled: boolean;
    eveningReviewEnabled: boolean;
    focusAutoEnabled: boolean;      // Auto-DND during focus phases
    sleepAutoEnabled: boolean;      // Auto-DND + dim during sleep
    batchDeliveryInterval: number;  // Min ms between whisper deliveries
    speakThreshold: number;         // Seconds idle before speak mode
    urgentBreakthrough: boolean;    // Urgent items bypass silent mode
}

type CircadianCallback = (event: CircadianEvent) => void;

export interface CircadianEvent {
    type: 'phase_change' | 'delivery' | 'attention_state_change' | 'briefing';
    phase: CircadianPhase;
    attentionState: AttentionState;
    items?: AttentionItem[];
    synthesis?: string;
}

// ─── Constants ───────────────────────────────────────────────

const DEFAULT_CONFIG: CircadianConfig = {
    enabled: true,
    heartbeatMs: 60000,             // 1 minute
    morningBriefingEnabled: true,
    eveningReviewEnabled: true,
    focusAutoEnabled: true,
    sleepAutoEnabled: true,
    batchDeliveryInterval: 300000,  // 5 minutes between whispers
    speakThreshold: 120,            // 2 min idle → speak eligible
    urgentBreakthrough: true,
};

const PHASE_SCHEDULE: Array<{ phase: CircadianPhase; startHour: number; endHour: number }> = [
    { phase: 'morning_pilot',   startHour: 6,  endHour: 9 },
    { phase: 'focus_shield',    startHour: 9,  endHour: 12 },
    { phase: 'afternoon_flow',  startHour: 12, endHour: 17 },
    { phase: 'evening_wind',    startHour: 17, endHour: 21 },
    { phase: 'sleep_guard',     startHour: 21, endHour: 6 },  // wraps midnight
];

// ─── Engine ──────────────────────────────────────────────────

class CircadianEngineClass {
    private config: CircadianConfig = DEFAULT_CONFIG;
    private queue: Map<string, AttentionItem> = new Map();
    private callbacks: Set<CircadianCallback> = new Set();
    private heartbeat: ReturnType<typeof setInterval> | null = null;

    private currentPhase: CircadianPhase = 'afternoon_flow';
    private attentionState: AttentionState = 'whisper';
    private lastDelivery: number = 0;
    private lastPhaseAction: string = '';
    private morningBriefingDone: string = '';  // date string
    private eveningReviewDone: string = '';
    private focusActive: boolean = false;
    private cachedBattery: number | null = null;
    private cachedNextMeeting: { title: string; minutesUntil: number } | null = null;

    // ─── Lifecycle ───

    async start(config?: Partial<CircadianConfig>): Promise<void> {
        if (config) {
            this.config = { ...this.config, ...config };
        }

        if (!this.config.enabled) {
            console.log('[Circadian] Disabled');
            return;
        }

        // Initialize dependencies
        try {
            await NotificationFilter.initialize();
        } catch { /* ok if fails */ }

        try {
            await PatternService.initialize();
        } catch { /* ok */ }

        try {
            await BehaviorTracker.start();
        } catch { /* ok */ }

        // Determine initial phase
        this.currentPhase = this.detectPhase();
        this.attentionState = this.computeAttentionState();

        // Subscribe to notification stream
        this.subscribeToNotifications();

        // Initial heartbeat
        await this.tick();

        // Start periodic heartbeat
        this.heartbeat = setInterval(() => this.tick(), this.config.heartbeatMs);

        console.log(`[Circadian] Started — phase: ${this.currentPhase}, attention: ${this.attentionState}`);
    }

    stop(): void {
        if (this.heartbeat) {
            clearInterval(this.heartbeat);
            this.heartbeat = null;
        }
        BehaviorTracker.stop();
        console.log('[Circadian] Stopped');
    }

    // ─── Public API ───

    subscribe(callback: CircadianCallback): () => void {
        this.callbacks.add(callback);
        return () => this.callbacks.delete(callback);
    }

    getState(): CircadianState {
        return {
            phase: this.currentPhase,
            attentionState: this.attentionState,
            queueSize: this.queue.size,
            pendingCount: this.getPending().length,
            lastDelivery: this.lastDelivery || null,
            focusActive: this.focusActive,
            nextMeeting: this.cachedNextMeeting,
            battery: this.cachedBattery,
        };
    }

    getPhase(): CircadianPhase {
        return this.currentPhase;
    }

    getAttentionState(): AttentionState {
        return this.attentionState;
    }

    /** Manually push an attention item */
    pushItem(item: Omit<AttentionItem, 'id' | 'createdAt' | 'delivered' | 'escalationCount'>): string {
        const id = `ci_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        const full: AttentionItem = {
            ...item,
            id,
            createdAt: Date.now(),
            delivered: false,
            escalationCount: 0,
        };
        this.queue.set(id, full);
        return id;
    }

    /** Get pending (undelivered) items */
    getPending(): AttentionItem[] {
        const now = Date.now();
        return Array.from(this.queue.values())
            .filter(i => !i.delivered && (!i.expiresAt || i.expiresAt > now))
            .sort((a, b) => {
                const prio = { urgent: 0, high: 1, medium: 2, low: 3 };
                return prio[a.priority] - prio[b.priority] || a.createdAt - b.createdAt;
            });
    }

    /** Force a delivery cycle now */
    async deliverNow(): Promise<void> {
        await this.deliverPending();
    }

    /** Update config at runtime */
    setConfig(config: Partial<CircadianConfig>): void {
        this.config = { ...this.config, ...config };
    }

    // ─── Heartbeat ───

    private async tick(): Promise<void> {
        try {
            // 1. Detect phase
            const newPhase = this.detectPhase();
            if (newPhase !== this.currentPhase) {
                const oldPhase = this.currentPhase;
                this.currentPhase = newPhase;
                console.log(`[Circadian] Phase: ${oldPhase} → ${newPhase}`);
                await this.onPhaseTransition(oldPhase, newPhase);
            }

            // 2. Compute attention state
            const newState = this.computeAttentionState();
            if (newState !== this.attentionState) {
                this.attentionState = newState;
                this.emit({
                    type: 'attention_state_change',
                    phase: this.currentPhase,
                    attentionState: newState,
                });
            }

            // 3. Accumulate context
            await this.accumulateContext();

            // 4. Escalate stale items
            this.escalateStale();

            // 5. Deliver if appropriate
            await this.deliverIfReady();

            // 6. Garbage collect expired items
            this.gc();

        } catch (error) {
            console.error('[Circadian] Tick error:', error);
        }
    }

    // ─── Phase Detection ───

    private detectPhase(): CircadianPhase {
        const hour = new Date().getHours();

        for (const { phase, startHour, endHour } of PHASE_SCHEDULE) {
            if (startHour < endHour) {
                // Normal range
                if (hour >= startHour && hour < endHour) return phase;
            } else {
                // Wraps midnight (sleep_guard: 21-6)
                if (hour >= startHour || hour < endHour) return phase;
            }
        }

        return 'afternoon_flow'; // fallback
    }

    // ─── Attention State ───

    private computeAttentionState(): AttentionState {
        // Sleep guard → silent (unless urgent breakthrough)
        if (this.currentPhase === 'sleep_guard') return 'silent';

        // Focus shield → silent
        if (this.currentPhase === 'focus_shield') return 'silent';
        if (this.focusActive) return 'silent';

        // Morning pilot → speak (briefing mode)
        if (this.currentPhase === 'morning_pilot') return 'speak';

        // Afternoon/evening → whisper by default
        return 'whisper';
    }

    // ─── Phase Transitions ───

    private async onPhaseTransition(from: CircadianPhase, to: CircadianPhase): Promise<void> {
        const today = new Date().toDateString();

        this.emit({
            type: 'phase_change',
            phase: to,
            attentionState: this.attentionState,
        });

        switch (to) {
            case 'morning_pilot':
                if (this.morningBriefingDone !== today && this.config.morningBriefingEnabled) {
                    await this.deliverMorningBriefing();
                    this.morningBriefingDone = today;
                }
                break;

            case 'focus_shield':
                if (this.config.focusAutoEnabled) {
                    await this.activateFocusMode();
                }
                break;

            case 'afternoon_flow':
                // Deactivate focus DND
                if (this.config.focusAutoEnabled) {
                    await this.deactivateFocusMode();
                }
                // Batch-deliver anything accumulated during focus
                await this.deliverPending();
                break;

            case 'evening_wind':
                if (this.eveningReviewDone !== today && this.config.eveningReviewEnabled) {
                    await this.deliverEveningReview();
                    this.eveningReviewDone = today;
                }
                // Dim brightness
                this.deviceAction('set_brightness', { level: 80 });
                break;

            case 'sleep_guard':
                if (this.config.sleepAutoEnabled) {
                    await this.activateSleepMode();
                }
                break;
        }
    }

    // ─── Context Accumulation ───

    private async accumulateContext(): Promise<void> {
        // Battery check (every 5 min via tick, but battery rarely changes fast)
        try {
            const battResult = await DeviceOrchestratorService.dispatch('battery_status', 'local', {});
            if (battResult.ok && battResult.run?.result) {
                const r = battResult.run.result as Record<string, unknown>;
                const pct = r.percentage as number;
                this.cachedBattery = pct;

                if (pct <= 15 && !this.hasItem('battery_low')) {
                    this.pushItem({
                        source: 'battery',
                        priority: pct <= 5 ? 'urgent' : 'high',
                        message: `Battery at ${pct}%. Charge soon.`,
                    });
                }
            }
        } catch { /* ok */ }

        // Calendar check
        try {
            const events = await CalendarService.getUpcomingEvents(60);
            if (events.length > 0) {
                const next = events[0];
                const eventTime = new Date(next.startDate).getTime();
                const minsUntil = Math.round((eventTime - Date.now()) / 60000);
                this.cachedNextMeeting = { title: next.title, minutesUntil: minsUntil };

                if (minsUntil <= 15 && minsUntil > 0 && !this.hasItem(`meeting_${next.id}`)) {
                    this.pushItem({
                        source: 'calendar',
                        priority: minsUntil <= 5 ? 'urgent' : 'high',
                        message: `${next.title} in ${minsUntil} min`,
                        data: { eventId: next.id },
                    });
                }
            } else {
                this.cachedNextMeeting = null;
            }
        } catch { /* ok */ }

        // Focus state
        try {
            this.focusActive = await FocusService.isActive();
        } catch {
            this.focusActive = false;
        }
    }

    // ─── Notification Interception ───

    private subscribeToNotifications(): void {
        try {
            const notifService = PassiveIntelligenceService.notifications;
            if (!notifService) return;

            // Set handler for incoming notifications → feed into engine
            notifService.setHandler((notification: NotificationData) => {
                this.ingestNotification(notification);
            });

            // Process any existing active notifications
            notifService.getActive().then((active: NotificationData[]) => {
                this.processNotificationBatch(active);
            }).catch(() => { /* ok */ });
        } catch { /* ok */ }
    }

    async ingestNotification(notification: NotificationData): Promise<void> {
        try {
            const classified = await NotificationFilter.classify(notification);
            this.classifiedToAttention(classified);
        } catch {
            // Fallback: treat as medium
            this.pushItem({
                source: 'notification',
                priority: 'medium',
                message: `${notification.app}: ${notification.title}`,
                detail: notification.text,
            });
        }
    }

    private async processNotificationBatch(notifications: NotificationData[]): Promise<void> {
        if (notifications.length === 0) return;
        try {
            const classified = await NotificationFilter.classifyBatch(notifications);
            for (const c of classified) {
                this.classifiedToAttention(c);
            }
        } catch { /* ok */ }
    }

    private classifiedToAttention(c: ClassifiedNotification): void {
        const priorityMap: Record<string, AttentionItem['priority']> = {
            urgent: 'urgent',
            important: 'high',
            informational: 'medium',
            noise: 'low',
        };

        // Skip noise entirely
        if (c.category === 'noise') return;

        this.pushItem({
            source: 'notification',
            priority: priorityMap[c.category] || 'medium',
            message: `${c.app}: ${c.title}`,
            detail: c.text,
            expiresAt: Date.now() + 3600000, // 1 hour
        });
    }

    // ─── Delivery ───

    private async deliverIfReady(): Promise<void> {
        const pending = this.getPending();
        if (pending.length === 0) return;

        const now = Date.now();
        const timeSinceLastDelivery = now - this.lastDelivery;

        // Urgent items always break through (if config allows)
        const urgentItems = pending.filter(i => i.priority === 'urgent');
        if (urgentItems.length > 0 && this.config.urgentBreakthrough) {
            await this.deliver(urgentItems, 'tts');
            return;
        }

        // Silent mode: queue everything
        if (this.attentionState === 'silent') return;

        // Whisper mode: batch delivery with interval
        if (this.attentionState === 'whisper') {
            if (timeSinceLastDelivery < this.config.batchDeliveryInterval) return;
            const batch = pending.slice(0, 5); // Max 5 at a time
            await this.deliver(batch, 'nudge');
            return;
        }

        // Speak mode: deliver via TTS
        if (this.attentionState === 'speak') {
            if (timeSinceLastDelivery < 30000) return; // Min 30s between speak
            const batch = pending.slice(0, 3);
            await this.deliver(batch, 'tts');
        }
    }

    private async deliver(items: AttentionItem[], mode: DeliveryMode): Promise<void> {
        if (items.length === 0) return;

        const now = Date.now();

        // Synthesize into one message
        const synthesis = this.synthesize(items);

        // Mark as delivered
        for (const item of items) {
            item.delivered = true;
            item.deliveredAt = now;
            item.deliveryMode = mode;
            this.queue.set(item.id, item);
        }

        this.lastDelivery = now;

        // Deliver based on mode
        switch (mode) {
            case 'haptic':
                HapticSymphony.attention();
                break;

            case 'nudge':
                HapticSymphony.tap();
                NudgeService.pushNudge({
                    title: 'MirrorBrain',
                    message: synthesis,
                    priority: items[0].priority === 'urgent' ? 'urgent' : 'medium',
                    expiresIn: 600000, // 10 min
                });
                break;

            case 'tts':
                HapticSymphony.tap();
                await TTSService.speak(synthesis);
                break;

            case 'full':
                HapticSymphony.attention();
                NudgeService.pushNudge({
                    title: 'MirrorBrain',
                    message: synthesis,
                    priority: 'high',
                    expiresIn: 1800000, // 30 min
                });
                await TTSService.speak(synthesis);
                break;
        }

        // Emit event
        this.emit({
            type: 'delivery',
            phase: this.currentPhase,
            attentionState: this.attentionState,
            items,
            synthesis,
        });

        console.log(`[Circadian] Delivered ${items.length} items via ${mode}: "${synthesis.slice(0, 80)}..."`);
    }

    // ─── Synthesis ───

    /** Turn multiple attention items into one coherent sentence */
    private synthesize(items: AttentionItem[]): string {
        if (items.length === 1) return items[0].message;

        // Group by source
        const bySource: Record<string, string[]> = {};
        for (const item of items) {
            if (!bySource[item.source]) bySource[item.source] = [];
            bySource[item.source].push(item.message);
        }

        const parts: string[] = [];
        for (const [source, msgs] of Object.entries(bySource)) {
            if (msgs.length === 1) {
                parts.push(msgs[0]);
            } else {
                parts.push(`${msgs.length} ${source} updates: ${msgs.slice(0, 2).join('. ')}`);
            }
        }

        return parts.join('. ') + '.';
    }

    // ─── Escalation ───

    private escalateStale(): void {
        const now = Date.now();
        const staleThreshold = 600000; // 10 min

        for (const item of this.queue.values()) {
            if (item.delivered || item.priority === 'urgent') continue;
            if (now - item.createdAt > staleThreshold * (item.escalationCount + 1)) {
                // Escalate priority
                if (item.priority === 'low') item.priority = 'medium';
                else if (item.priority === 'medium') item.priority = 'high';
                item.escalationCount++;
                this.queue.set(item.id, item);
            }
        }
    }

    // ─── Phase Actions ───

    private async deliverMorningBriefing(): Promise<void> {
        console.log('[Circadian] Morning briefing');
        try {
            const briefing = await BriefingService.generateMorningBriefing();
            const spoken = briefing.summary || briefing.greeting || 'Good morning.';

            this.emit({
                type: 'briefing',
                phase: 'morning_pilot',
                attentionState: 'speak',
                synthesis: spoken,
            });

            // Brightness up for morning
            this.deviceAction('set_brightness', { level: 180 });

            // Speak the briefing
            await TTSService.speak(spoken);
        } catch (error) {
            console.error('[Circadian] Morning briefing error:', error);
            // Fallback: simple battery + weather
            const parts: string[] = ['Good morning.'];
            if (this.cachedBattery != null) {
                parts.push(`Battery at ${this.cachedBattery}%.`);
            }
            try {
                const weather = await WeatherService.getWeather();
                parts.push(`${Math.round(weather.temperature)} degrees, ${WeatherService.getConditionText(weather.condition)}.`);
            } catch { /* ok */ }
            await TTSService.speak(parts.join(' '));
        }
    }

    private async deliverEveningReview(): Promise<void> {
        console.log('[Circadian] Evening review');
        try {
            const briefing = await BriefingService.generateEveningBriefing();
            const spoken = briefing.summary || 'Time to wind down.';

            this.emit({
                type: 'briefing',
                phase: 'evening_wind',
                attentionState: 'speak',
                synthesis: spoken,
            });

            await TTSService.speak(spoken);
        } catch (error) {
            console.error('[Circadian] Evening review error:', error);
        }
    }

    private async activateFocusMode(): Promise<void> {
        console.log('[Circadian] Focus mode ON');
        this.deviceAction('toggle_dnd', { state: 'on' });
    }

    private async deactivateFocusMode(): Promise<void> {
        console.log('[Circadian] Focus mode OFF');
        this.deviceAction('toggle_dnd', { state: 'off' });
    }

    private async activateSleepMode(): Promise<void> {
        console.log('[Circadian] Sleep mode ON');
        this.deviceAction('toggle_dnd', { state: 'on' });
        this.deviceAction('set_brightness', { level: 10 });
    }

    // ─── Helpers ───

    private deviceAction(skillId: string, args: Record<string, unknown>): void {
        DeviceOrchestratorService.dispatch(skillId, 'local', args).catch(e =>
            console.warn(`[Circadian] Device action ${skillId} failed:`, e)
        );
    }

    private hasItem(idPrefix: string): boolean {
        for (const key of this.queue.keys()) {
            if (key.includes(idPrefix)) return true;
        }
        // Also check by message content for deduplication
        return false;
    }

    private gc(): void {
        const now = Date.now();
        const maxAge = 7200000; // 2 hours
        for (const [id, item] of this.queue.entries()) {
            if (item.delivered && (now - (item.deliveredAt || item.createdAt)) > maxAge) {
                this.queue.delete(id);
            }
            if (item.expiresAt && item.expiresAt < now) {
                this.queue.delete(id);
            }
        }
    }

    private emit(event: CircadianEvent): void {
        for (const cb of this.callbacks) {
            try { cb(event); } catch (e) {
                console.error('[Circadian] Callback error:', e);
            }
        }
    }

    async deliverPending(): Promise<void> {
        const pending = this.getPending();
        if (pending.length === 0) return;

        const mode: DeliveryMode = this.attentionState === 'speak' ? 'tts' : 'nudge';
        await this.deliver(pending.slice(0, 5), mode);
    }
}

export const CircadianEngine = new CircadianEngineClass();
