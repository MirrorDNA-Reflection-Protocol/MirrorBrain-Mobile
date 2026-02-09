/**
 * Predictive Service — Pre-computation Engine
 *
 * Uses idle time to predict likely queries and pre-generate responses.
 * When you ask, the answer is already waiting.
 *
 * BIG TECH DOESN'T DO THIS because:
 * 1. Computation costs money at scale
 * 2. They can't predict YOUR specific needs
 * 3. Generic pre-computation is wasteful
 *
 * We run inference during idle time, locally, for YOUR patterns.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState, AppStateStatus } from 'react-native';
import { LifeContextService } from './lifeContext.service';
import { OllamaService } from './ollama.service';

export interface PredictedQuery {
    id: string;
    query: string;
    response: string;
    confidence: number;
    generatedAt: number;
    usedAt?: number;
    context: string;
}

export interface QueryPattern {
    pattern: string;
    frequency: number;
    lastAsked: number;
    timeOfDay?: number[];  // Hours when typically asked
    dayOfWeek?: number[];  // Days when typically asked
}

// Storage
const PREDICTIONS_KEY = '@predictive_cache';
const PATTERNS_KEY = '@query_patterns';

// Config
const MAX_PREDICTIONS = 20;
const PREDICTION_TTL = 4 * 60 * 60 * 1000;  // 4 hours
const MIN_IDLE_TIME = 30000;  // 30 seconds of idle before computing

class PredictiveServiceClass {
    private predictions: Map<string, PredictedQuery> = new Map();
    private patterns: QueryPattern[] = [];
    private isComputing = false;
    private lastActivity = Date.now();
    private idleCheckInterval: ReturnType<typeof setInterval> | null = null;
    private isInitialized = false;

    /**
     * Initialize the service
     */
    async initialize(): Promise<void> {
        if (this.isInitialized) return;

        console.log('[Predictive] Initializing...');

        await this.loadCache();
        await this.loadPatterns();

        // Monitor app state for idle detection
        AppState.addEventListener('change', this.handleAppStateChange);

        // Check for idle time periodically
        this.idleCheckInterval = setInterval(() => this.checkIdleAndCompute(), 60000);

        this.isInitialized = true;
        console.log(`[Predictive] Loaded ${this.predictions.size} cached predictions`);
    }

    /**
     * Record a query for pattern learning
     */
    async recordQuery(query: string): Promise<void> {
        this.lastActivity = Date.now();

        const normalized = this.normalizeQuery(query);
        const hour = new Date().getHours();
        const day = new Date().getDay();

        // Find or create pattern
        let pattern = this.patterns.find(p => p.pattern === normalized);
        if (pattern) {
            pattern.frequency++;
            pattern.lastAsked = Date.now();
            if (!pattern.timeOfDay) pattern.timeOfDay = [];
            if (!pattern.timeOfDay.includes(hour)) pattern.timeOfDay.push(hour);
            if (!pattern.dayOfWeek) pattern.dayOfWeek = [];
            if (!pattern.dayOfWeek.includes(day)) pattern.dayOfWeek.push(day);
        } else {
            this.patterns.push({
                pattern: normalized,
                frequency: 1,
                lastAsked: Date.now(),
                timeOfDay: [hour],
                dayOfWeek: [day],
            });
        }

        // Keep top patterns only
        this.patterns.sort((a, b) => b.frequency - a.frequency);
        this.patterns = this.patterns.slice(0, 100);

        await this.savePatterns();
    }

    /**
     * Get pre-computed response if available
     */
    getPrediction(query: string): PredictedQuery | null {
        const normalized = this.normalizeQuery(query);
        const now = Date.now();

        // Look for matching prediction
        for (const pred of this.predictions.values()) {
            if (this.queriesMatch(pred.query, normalized)) {
                // Check if still valid
                if (now - pred.generatedAt < PREDICTION_TTL) {
                    pred.usedAt = now;
                    console.log(`[Predictive] Cache hit for: ${query.slice(0, 30)}...`);
                    return pred;
                } else {
                    // Expired
                    this.predictions.delete(pred.id);
                }
            }
        }

        return null;
    }

    /**
     * Get likely queries for current context
     */
    getLikelyQueries(): string[] {
        const hour = new Date().getHours();
        const day = new Date().getDay();

        return this.patterns
            .filter(p => {
                // Score by time match and recency
                let score = p.frequency;
                if (p.timeOfDay?.includes(hour)) score *= 1.5;
                if (p.dayOfWeek?.includes(day)) score *= 1.3;
                return score > 1;
            })
            .sort((a, b) => b.frequency - a.frequency)
            .slice(0, 10)
            .map(p => p.pattern);
    }

    /**
     * Manually trigger pre-computation
     */
    async computePredictions(): Promise<number> {
        if (this.isComputing) return 0;

        this.isComputing = true;
        let computed = 0;

        try {
            const likelyQueries = this.getLikelyQueries();
            console.log(`[Predictive] Computing predictions for ${likelyQueries.length} likely queries`);

            // Get recent context
            const context = await LifeContextService.getRecentContext(
                ['conversation', 'notification', 'search'],
                24,
                2000
            );

            for (const query of likelyQueries) {
                // Skip if already cached
                if (this.getPrediction(query)) continue;

                try {
                    // Generate response
                    const response = await this.generatePrediction(query, context);
                    if (response) {
                        this.cachePrediction(query, response, context);
                        computed++;
                    }
                } catch (e) {
                    console.warn(`[Predictive] Failed to generate for: ${query}`, e);
                }

                // Don't overwhelm the LLM
                await this.sleep(2000);
            }

            await this.saveCache();
            console.log(`[Predictive] Generated ${computed} new predictions`);

        } finally {
            this.isComputing = false;
        }

        return computed;
    }

    /**
     * Get statistics
     */
    getStats(): {
        cachedPredictions: number;
        patterns: number;
        cacheHits: number;
    } {
        const hits = Array.from(this.predictions.values()).filter(p => p.usedAt).length;
        return {
            cachedPredictions: this.predictions.size,
            patterns: this.patterns.length,
            cacheHits: hits,
        };
    }

    // ─────────────────────────────────────────────────────────────────
    // Time-based Predictions
    // ─────────────────────────────────────────────────────────────────

    /**
     * Pre-compute time-sensitive predictions
     */
    async computeTimePredictions(): Promise<void> {
        const hour = new Date().getHours();

        // Morning (6-9am)
        if (hour >= 6 && hour <= 9) {
            await this.ensurePrediction("What's on my calendar today?");
            await this.ensurePrediction("What did I miss overnight?");
            await this.ensurePrediction("What should I focus on today?");
        }

        // Midday (11am-2pm)
        if (hour >= 11 && hour <= 14) {
            await this.ensurePrediction("What meetings do I have this afternoon?");
            await this.ensurePrediction("Summarize my morning");
        }

        // Evening (5-8pm)
        if (hour >= 17 && hour <= 20) {
            await this.ensurePrediction("What did I accomplish today?");
            await this.ensurePrediction("What's pending for tomorrow?");
        }
    }

    private async ensurePrediction(query: string): Promise<void> {
        if (!this.getPrediction(query)) {
            const context = await LifeContextService.getRecentContext(
                undefined, 24, 2000
            );
            const response = await this.generatePrediction(query, context);
            if (response) {
                this.cachePrediction(query, response, context);
            }
        }
    }

    // ─────────────────────────────────────────────────────────────────
    // Private Methods
    // ─────────────────────────────────────────────────────────────────

    private async generatePrediction(query: string, context: string): Promise<string | null> {
        try {
            const prompt = `Context from recent activity:\n${context}\n\nUser asks: "${query}"\n\nProvide a helpful, personalized response based on the context.`;

            const response = await OllamaService.generate(prompt, {
                maxTokens: 300,
                temperature: 0.7,
            });

            return response || null;
        } catch (e) {
            console.warn('[Predictive] Generation failed:', e);
            return null;
        }
    }

    private cachePrediction(query: string, response: string, context: string): void {
        const id = `pred_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

        this.predictions.set(id, {
            id,
            query: this.normalizeQuery(query),
            response,
            confidence: 0.8,
            generatedAt: Date.now(),
            context: context.slice(0, 500),
        });

        // Limit cache size
        if (this.predictions.size > MAX_PREDICTIONS) {
            const oldest = Array.from(this.predictions.values())
                .sort((a, b) => a.generatedAt - b.generatedAt)[0];
            this.predictions.delete(oldest.id);
        }
    }

    private normalizeQuery(query: string): string {
        return query.toLowerCase().trim().replace(/[?!.,]/g, '');
    }

    private queriesMatch(q1: string, q2: string): boolean {
        // Simple matching - could be improved with embeddings
        const n1 = this.normalizeQuery(q1);
        const n2 = this.normalizeQuery(q2);

        if (n1 === n2) return true;

        // Check word overlap
        const words1 = new Set(n1.split(/\s+/));
        const words2 = new Set(n2.split(/\s+/));
        const overlap = [...words1].filter(w => words2.has(w)).length;
        const similarity = overlap / Math.max(words1.size, words2.size);

        return similarity > 0.7;
    }

    private handleAppStateChange = (state: AppStateStatus): void => {
        if (state === 'active') {
            this.lastActivity = Date.now();
        }
    };

    private async checkIdleAndCompute(): Promise<void> {
        const idleTime = Date.now() - this.lastActivity;

        if (idleTime > MIN_IDLE_TIME && !this.isComputing) {
            console.log('[Predictive] Device idle, computing predictions...');
            await this.computeTimePredictions();
            await this.computePredictions();
        }
    }

    private async loadCache(): Promise<void> {
        try {
            const json = await AsyncStorage.getItem(PREDICTIONS_KEY);
            if (json) {
                const arr = JSON.parse(json) as PredictedQuery[];
                for (const p of arr) {
                    this.predictions.set(p.id, p);
                }
            }
        } catch (e) {
            console.warn('[Predictive] Failed to load cache:', e);
        }
    }

    private async saveCache(): Promise<void> {
        try {
            await AsyncStorage.setItem(
                PREDICTIONS_KEY,
                JSON.stringify(Array.from(this.predictions.values()))
            );
        } catch (e) {
            console.error('[Predictive] Failed to save cache:', e);
        }
    }

    private async loadPatterns(): Promise<void> {
        try {
            const json = await AsyncStorage.getItem(PATTERNS_KEY);
            if (json) {
                this.patterns = JSON.parse(json);
            }
        } catch (e) {
            console.warn('[Predictive] Failed to load patterns:', e);
        }
    }

    private async savePatterns(): Promise<void> {
        try {
            await AsyncStorage.setItem(PATTERNS_KEY, JSON.stringify(this.patterns));
        } catch (e) {
            console.error('[Predictive] Failed to save patterns:', e);
        }
    }

    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Cleanup
     */
    cleanup(): void {
        if (this.idleCheckInterval) clearInterval(this.idleCheckInterval);
    }
}

export const PredictiveService = new PredictiveServiceClass();
export default PredictiveService;
