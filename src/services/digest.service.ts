/**
 * Digest Service — AI-Generated Weekly Summaries
 *
 * Purpose: Generate weekly digests covering productivity,
 * communication, patterns, and actionable insights.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { LLMService } from './llm.service';
import { PatternService } from './pattern.service';
import { RelationshipService } from './relationship.service';
import { VaultService } from './vault.service';

export interface WeeklyDigest {
    id: string;
    weekStart: Date;
    weekEnd: Date;
    generatedAt: Date;
    summary: string;
    sections: DigestSection[];
    highlights: string[];
    insights: string[];
    goals?: string[];
}

export interface DigestSection {
    title: string;
    icon: string;
    content: string;
    metrics?: DigestMetric[];
    items?: DigestItem[];
}

export interface DigestMetric {
    label: string;
    value: string | number;
    change?: number; // Percentage change from last week
    trend?: 'up' | 'down' | 'stable';
}

export interface DigestItem {
    text: string;
    subtext?: string;
    type: 'achievement' | 'insight' | 'suggestion' | 'warning';
}

export interface WeeklyStats {
    notesCreated: number;
    focusMinutes: number;
    messagesExchanged: number;
    eventsAttended: number;
    tasksCompleted: number;
    queriesAsked: number;
}

const STORAGE_KEY = 'mirror_digests';

class DigestServiceClass {
    private digests: Map<string, WeeklyDigest> = new Map();
    private initialized = false;

    /**
     * Initialize digest service
     */
    async initialize(): Promise<void> {
        if (this.initialized) return;

        try {
            const stored = await AsyncStorage.getItem(STORAGE_KEY);
            if (stored) {
                const data = JSON.parse(stored);
                for (const d of data) {
                    d.weekStart = new Date(d.weekStart);
                    d.weekEnd = new Date(d.weekEnd);
                    d.generatedAt = new Date(d.generatedAt);
                    this.digests.set(d.id, d);
                }
            }
            this.initialized = true;
            console.log('[DigestService] Loaded', this.digests.size, 'digests');
        } catch (error) {
            console.error('[DigestService] Failed to load:', error);
        }
    }

    /**
     * Save digests
     */
    private async save(): Promise<void> {
        try {
            const data = Array.from(this.digests.values());
            await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        } catch (error) {
            console.error('[DigestService] Failed to save:', error);
        }
    }

    /**
     * Generate weekly digest
     */
    async generateWeeklyDigest(): Promise<WeeklyDigest> {
        const { weekStart, weekEnd } = this.getCurrentWeekRange();
        const digestId = `digest_${weekStart.toISOString().split('T')[0]}`;

        // Check if already generated
        const existing = this.digests.get(digestId);
        if (existing) {
            return existing;
        }

        // Gather data
        const stats = await this.gatherWeeklyStats(weekStart, weekEnd);
        const patterns = PatternService.getPatterns();
        const relationshipSummary = RelationshipService.getSummary();
        const relationshipInsights = RelationshipService.getInsights();

        // Build sections
        const sections: DigestSection[] = [];

        // Productivity Section
        sections.push({
            title: 'Productivity',
            icon: '📊',
            content: `You had ${stats.focusMinutes} minutes of focus time and completed ${stats.tasksCompleted} tasks.`,
            metrics: [
                {
                    label: 'Focus Time',
                    value: `${Math.round(stats.focusMinutes / 60)}h ${stats.focusMinutes % 60}m`,
                    trend: 'stable',
                },
                {
                    label: 'Tasks Done',
                    value: stats.tasksCompleted,
                    trend: 'stable',
                },
                {
                    label: 'Notes Created',
                    value: stats.notesCreated,
                    trend: 'stable',
                },
            ],
        });

        // Communication Section
        sections.push({
            title: 'Communication',
            icon: '💬',
            content: this.buildCommunicationSummary(stats, relationshipSummary),
            metrics: [
                {
                    label: 'Messages',
                    value: stats.messagesExchanged,
                    trend: 'stable',
                },
                {
                    label: 'Pending Replies',
                    value: relationshipSummary.pendingReplies,
                    trend: relationshipSummary.pendingReplies > 3 ? 'up' : 'stable',
                },
                {
                    label: 'Relationship Health',
                    value: `${relationshipSummary.averageHealthScore}%`,
                    trend: 'stable',
                },
            ],
            items: relationshipInsights.slice(0, 3).map(i => ({
                text: i.message,
                type: i.type === 'strong' ? 'achievement' as const : 'suggestion' as const,
            })),
        });

        // Patterns Section
        if (patterns.length > 0) {
            sections.push({
                title: 'Patterns Discovered',
                icon: '🔮',
                content: `I noticed ${patterns.length} pattern${patterns.length > 1 ? 's' : ''} in your behavior this week.`,
                items: patterns.slice(0, 4).map(p => ({
                    text: p.name,
                    subtext: p.description,
                    type: 'insight' as const,
                })),
            });
        }

        // Calendar Section
        sections.push({
            title: 'Calendar',
            icon: '📅',
            content: `You attended ${stats.eventsAttended} events this week.`,
            metrics: [
                {
                    label: 'Events',
                    value: stats.eventsAttended,
                    trend: 'stable',
                },
            ],
        });

        // Generate AI summary and insights
        const aiContent = await this.generateAIContent(stats, patterns, relationshipSummary);

        // Build highlights
        const highlights = this.buildHighlights(stats, patterns);

        // Create digest
        const digest: WeeklyDigest = {
            id: digestId,
            weekStart,
            weekEnd,
            generatedAt: new Date(),
            summary: aiContent.summary,
            sections,
            highlights,
            insights: aiContent.insights,
            goals: aiContent.goals,
        };

        // Save
        this.digests.set(digestId, digest);
        await this.save();

        return digest;
    }

    /**
     * Get current week range
     */
    private getCurrentWeekRange(): { weekStart: Date; weekEnd: Date } {
        const now = new Date();
        const dayOfWeek = now.getDay();
        const weekStart = new Date(now);
        weekStart.setDate(now.getDate() - dayOfWeek);
        weekStart.setHours(0, 0, 0, 0);

        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekStart.getDate() + 6);
        weekEnd.setHours(23, 59, 59, 999);

        return { weekStart, weekEnd };
    }

    /**
     * Gather weekly stats
     */
    private async gatherWeeklyStats(weekStart: Date, weekEnd: Date): Promise<WeeklyStats> {
        // In a real implementation, this would aggregate data from various sources
        // For now, return mock data
        return {
            notesCreated: Math.floor(Math.random() * 10) + 2,
            focusMinutes: Math.floor(Math.random() * 300) + 60,
            messagesExchanged: Math.floor(Math.random() * 100) + 20,
            eventsAttended: Math.floor(Math.random() * 10) + 2,
            tasksCompleted: Math.floor(Math.random() * 15) + 3,
            queriesAsked: Math.floor(Math.random() * 30) + 5,
        };
    }

    /**
     * Build communication summary
     */
    private buildCommunicationSummary(
        stats: WeeklyStats,
        relationshipSummary: ReturnType<typeof RelationshipService.getSummary>
    ): string {
        const parts: string[] = [];

        parts.push(`You exchanged ${stats.messagesExchanged} messages this week`);

        if (relationshipSummary.pendingReplies > 0) {
            parts.push(`with ${relationshipSummary.pendingReplies} conversation${relationshipSummary.pendingReplies > 1 ? 's' : ''} awaiting your reply`);
        }

        if (relationshipSummary.neglectedCount > 0) {
            parts.push(`Consider reaching out to ${relationshipSummary.neglectedCount} contact${relationshipSummary.neglectedCount > 1 ? 's' : ''} you haven't connected with recently`);
        }

        return parts.join('. ') + '.';
    }

    /**
     * Build highlights
     */
    private buildHighlights(stats: WeeklyStats, patterns: any[]): string[] {
        const highlights: string[] = [];

        if (stats.focusMinutes > 180) {
            highlights.push(`Over ${Math.floor(stats.focusMinutes / 60)} hours of focused work`);
        }

        if (stats.tasksCompleted > 10) {
            highlights.push(`Completed ${stats.tasksCompleted} tasks`);
        }

        if (stats.notesCreated > 5) {
            highlights.push(`Captured ${stats.notesCreated} notes`);
        }

        if (patterns.length > 0) {
            highlights.push(`Discovered ${patterns.length} behavior pattern${patterns.length > 1 ? 's' : ''}`);
        }

        return highlights;
    }

    /**
     * Generate AI content for digest
     */
    private async generateAIContent(
        stats: WeeklyStats,
        patterns: any[],
        relationshipSummary: any
    ): Promise<{ summary: string; insights: string[]; goals: string[] }> {
        try {
            const prompt = `Generate a brief weekly summary and 2-3 actionable insights based on this data:

Focus time: ${stats.focusMinutes} minutes
Tasks completed: ${stats.tasksCompleted}
Notes created: ${stats.notesCreated}
Messages exchanged: ${stats.messagesExchanged}
Events attended: ${stats.eventsAttended}
Patterns discovered: ${patterns.length}
Pending replies: ${relationshipSummary.pendingReplies}
Relationship health: ${relationshipSummary.averageHealthScore}%

Respond in JSON format:
{
  "summary": "2-3 sentence summary of the week",
  "insights": ["insight 1", "insight 2"],
  "goals": ["suggested goal 1", "suggested goal 2"]
}`;

            const response = await LLMService.complete(prompt, 300);

            // Try to parse JSON response
            const jsonMatch = response?.text?.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]);
                return {
                    summary: parsed.summary || 'Week in review.',
                    insights: parsed.insights || [],
                    goals: parsed.goals || [],
                };
            }
        } catch (error) {
            console.error('[DigestService] AI generation failed:', error);
        }

        // Fallback
        return {
            summary: `This week you spent ${Math.round(stats.focusMinutes / 60)} hours focusing, completed ${stats.tasksCompleted} tasks, and exchanged ${stats.messagesExchanged} messages.`,
            insights: [
                stats.focusMinutes < 120 ? 'Try to increase your focused work time next week' : 'Great focus time this week!',
                relationshipSummary.pendingReplies > 3 ? 'Consider catching up on pending messages' : 'Good job staying on top of communications',
            ],
            goals: [
                'Maintain consistent focus sessions',
                'Stay connected with priority contacts',
            ],
        };
    }

    /**
     * Get all digests
     */
    getDigests(): WeeklyDigest[] {
        return Array.from(this.digests.values())
            .sort((a, b) => b.weekStart.getTime() - a.weekStart.getTime());
    }

    /**
     * Get latest digest
     */
    getLatestDigest(): WeeklyDigest | null {
        const digests = this.getDigests();
        return digests.length > 0 ? digests[0] : null;
    }

    /**
     * Get digest for a specific week
     */
    getDigest(weekStartDate: Date): WeeklyDigest | undefined {
        const id = `digest_${weekStartDate.toISOString().split('T')[0]}`;
        return this.digests.get(id);
    }

    /**
     * Check if current week's digest is available
     */
    hasCurrentWeekDigest(): boolean {
        const { weekStart } = this.getCurrentWeekRange();
        const id = `digest_${weekStart.toISOString().split('T')[0]}`;
        return this.digests.has(id);
    }

    /**
     * Clear all digests
     */
    async clear(): Promise<void> {
        this.digests.clear();
        await AsyncStorage.removeItem(STORAGE_KEY);
    }
}

export const DigestService = new DigestServiceClass();
