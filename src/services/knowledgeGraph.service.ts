/**
 * Knowledge Graph Service — Personal Entity & Relationship Mapper
 *
 * Builds a graph of entities (people, places, topics, events) and their
 * relationships from your life context.
 *
 * BIG TECH CAN'T DO THIS because:
 * 1. They don't have persistent cross-app context
 * 2. Privacy regulations prevent building personal graphs
 * 3. They can't combine signals from different services
 *
 * We build YOUR personal knowledge graph, locally, sovereignly.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { LifeContextService, ContextEntry } from './lifeContext.service';

// Entity types
export type EntityType =
    | 'person'
    | 'place'
    | 'organization'
    | 'topic'
    | 'event'
    | 'project'
    | 'app'
    | 'document'
    | 'date';

export interface Entity {
    id: string;
    type: EntityType;
    name: string;
    aliases: string[];
    attributes: Record<string, unknown>;
    firstSeen: number;
    lastSeen: number;
    mentionCount: number;
    importance: number;  // Calculated from frequency and recency
}

export interface Relationship {
    id: string;
    from: string;      // Entity ID
    to: string;        // Entity ID
    type: string;      // 'knows', 'works_at', 'mentioned_with', etc.
    strength: number;  // 0-1
    context: string[];  // Samples of where this relationship was seen
    firstSeen: number;
    lastSeen: number;
}

export interface GraphQuery {
    entity?: string;
    type?: EntityType;
    relationship?: string;
    depth?: number;
}

// Storage
const ENTITIES_KEY = '@knowledge_graph_entities';
const RELATIONSHIPS_KEY = '@knowledge_graph_relationships';

// Entity extraction patterns
const PATTERNS = {
    person: /(?:@|from|to|with|by|and)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/g,
    email: /([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9._-]+)/g,
    place: /(?:at|in|from|to|near)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/g,
    date: /(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\d{4}[\/\-]\d{2}[\/\-]\d{2})/g,
    project: /(?:project|repo|pr|issue)\s*[:#]?\s*([a-zA-Z0-9_-]+)/gi,
    hashtag: /#([a-zA-Z0-9_]+)/g,
};

class KnowledgeGraphServiceClass {
    private entities: Map<string, Entity> = new Map();
    private relationships: Map<string, Relationship> = new Map();
    private isLoaded = false;
    private processedContextIds: Set<string> = new Set();

    /**
     * Initialize the service
     */
    async initialize(): Promise<void> {
        if (this.isLoaded) return;

        console.log('[KnowledgeGraph] Initializing...');

        await this.loadGraph();

        this.isLoaded = true;
        console.log(`[KnowledgeGraph] Loaded ${this.entities.size} entities, ${this.relationships.size} relationships`);
    }

    /**
     * Process context to extract entities and relationships
     */
    async processContext(entries: ContextEntry[]): Promise<{
        newEntities: number;
        newRelationships: number;
    }> {
        let newEntities = 0;
        let newRelationships = 0;

        for (const entry of entries) {
            if (this.processedContextIds.has(entry.id)) continue;
            this.processedContextIds.add(entry.id);

            // Extract entities from this entry
            const extracted = this.extractEntities(entry.content, entry.metadata);

            // Add or update entities
            for (const entity of extracted) {
                const existing = this.findEntity(entity.name, entity.type);
                if (existing) {
                    this.updateEntity(existing.id, entry.timestamp);
                } else {
                    this.addEntity(entity);
                    newEntities++;
                }
            }

            // Create relationships between co-mentioned entities
            if (extracted.length > 1) {
                for (let i = 0; i < extracted.length; i++) {
                    for (let j = i + 1; j < extracted.length; j++) {
                        const e1 = this.findEntity(extracted[i].name, extracted[i].type);
                        const e2 = this.findEntity(extracted[j].name, extracted[j].type);
                        if (e1 && e2) {
                            const created = this.addOrUpdateRelationship(
                                e1.id,
                                e2.id,
                                'mentioned_with',
                                entry.content.slice(0, 200)
                            );
                            if (created) newRelationships++;
                        }
                    }
                }
            }
        }

        await this.saveGraph();
        return { newEntities, newRelationships };
    }

    /**
     * Extract entities from text
     */
    private extractEntities(
        text: string,
        metadata: Record<string, unknown>
    ): Partial<Entity>[] {
        const entities: Partial<Entity>[] = [];

        // Extract people
        let match;
        while ((match = PATTERNS.person.exec(text)) !== null) {
            const name = match[1].trim();
            if (name.length > 2 && !this.isCommonWord(name)) {
                entities.push({ type: 'person', name });
            }
        }
        PATTERNS.person.lastIndex = 0;

        // Extract from metadata
        if (metadata.app) {
            entities.push({ type: 'app', name: String(metadata.app) });
        }
        if (metadata.contact) {
            entities.push({ type: 'person', name: String(metadata.contact) });
        }

        // Extract topics from hashtags
        while ((match = PATTERNS.hashtag.exec(text)) !== null) {
            entities.push({ type: 'topic', name: match[1] });
        }
        PATTERNS.hashtag.lastIndex = 0;

        // Extract projects
        while ((match = PATTERNS.project.exec(text)) !== null) {
            entities.push({ type: 'project', name: match[1] });
        }
        PATTERNS.project.lastIndex = 0;

        return entities;
    }

    /**
     * Add an entity
     */
    addEntity(partial: Partial<Entity>): Entity {
        const id = `entity_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        const entity: Entity = {
            id,
            type: partial.type || 'topic',
            name: partial.name || 'Unknown',
            aliases: partial.aliases || [],
            attributes: partial.attributes || {},
            firstSeen: Date.now(),
            lastSeen: Date.now(),
            mentionCount: 1,
            importance: 0.5,
        };

        this.entities.set(id, entity);
        return entity;
    }

    /**
     * Update entity with new mention
     */
    private updateEntity(id: string, timestamp: number): void {
        const entity = this.entities.get(id);
        if (!entity) return;

        entity.lastSeen = timestamp;
        entity.mentionCount++;
        entity.importance = this.calculateImportance(entity);
    }

    /**
     * Find entity by name and type
     */
    findEntity(name: string, type?: EntityType): Entity | undefined {
        const nameLower = name.toLowerCase();

        for (const entity of this.entities.values()) {
            if (type && entity.type !== type) continue;

            if (entity.name.toLowerCase() === nameLower) return entity;
            if (entity.aliases.some(a => a.toLowerCase() === nameLower)) return entity;
        }

        return undefined;
    }

    /**
     * Add or update a relationship
     */
    private addOrUpdateRelationship(
        fromId: string,
        toId: string,
        type: string,
        context: string
    ): boolean {
        // Check if relationship exists
        const key = `${fromId}-${toId}-${type}`;
        const reverseKey = `${toId}-${fromId}-${type}`;

        let rel = this.relationships.get(key) || this.relationships.get(reverseKey);

        if (rel) {
            // Update existing
            rel.lastSeen = Date.now();
            rel.strength = Math.min(1, rel.strength + 0.1);
            if (rel.context.length < 5) {
                rel.context.push(context);
            }
            return false;
        }

        // Create new
        const id = `rel_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        rel = {
            id,
            from: fromId,
            to: toId,
            type,
            strength: 0.3,
            context: [context],
            firstSeen: Date.now(),
            lastSeen: Date.now(),
        };

        this.relationships.set(key, rel);
        return true;
    }

    /**
     * Query the graph
     */
    query(q: GraphQuery): { entities: Entity[]; relationships: Relationship[] } {
        let entities: Entity[] = [];
        let relationships: Relationship[] = [];

        if (q.entity) {
            // Find specific entity and its connections
            const entity = this.findEntity(q.entity, q.type);
            if (entity) {
                entities.push(entity);

                // Get connected entities
                const depth = q.depth || 1;
                const connected = this.getConnected(entity.id, depth);
                entities.push(...connected.entities);
                relationships.push(...connected.relationships);
            }
        } else if (q.type) {
            // Get all entities of a type
            entities = Array.from(this.entities.values())
                .filter(e => e.type === q.type)
                .sort((a, b) => b.importance - a.importance);
        } else {
            // Get all
            entities = Array.from(this.entities.values());
            relationships = Array.from(this.relationships.values());
        }

        return { entities, relationships };
    }

    /**
     * Get entities connected to a given entity
     */
    private getConnected(
        entityId: string,
        depth: number,
        visited: Set<string> = new Set()
    ): { entities: Entity[]; relationships: Relationship[] } {
        if (depth <= 0 || visited.has(entityId)) {
            return { entities: [], relationships: [] };
        }
        visited.add(entityId);

        const entities: Entity[] = [];
        const relationships: Relationship[] = [];

        for (const rel of this.relationships.values()) {
            let connectedId: string | null = null;

            if (rel.from === entityId) connectedId = rel.to;
            else if (rel.to === entityId) connectedId = rel.from;

            if (connectedId && !visited.has(connectedId)) {
                const entity = this.entities.get(connectedId);
                if (entity) {
                    entities.push(entity);
                    relationships.push(rel);

                    // Recurse
                    const deeper = this.getConnected(connectedId, depth - 1, visited);
                    entities.push(...deeper.entities);
                    relationships.push(...deeper.relationships);
                }
            }
        }

        return { entities, relationships };
    }

    /**
     * Get top entities by importance
     */
    getTopEntities(type?: EntityType, limit: number = 20): Entity[] {
        let entities = Array.from(this.entities.values());

        if (type) {
            entities = entities.filter(e => e.type === type);
        }

        return entities
            .sort((a, b) => b.importance - a.importance)
            .slice(0, limit);
    }

    /**
     * Generate context about an entity for LLM
     */
    generateEntityContext(entityName: string): string {
        const entity = this.findEntity(entityName);
        if (!entity) return `No information about "${entityName}" in knowledge graph.`;

        const { relationships } = this.getConnected(entity.id, 1);

        let context = `About ${entity.name} (${entity.type}):\n`;
        context += `- First seen: ${new Date(entity.firstSeen).toLocaleDateString()}\n`;
        context += `- Last seen: ${new Date(entity.lastSeen).toLocaleDateString()}\n`;
        context += `- Mentioned ${entity.mentionCount} times\n`;

        if (relationships.length > 0) {
            context += '\nConnections:\n';
            for (const rel of relationships.slice(0, 10)) {
                const otherId = rel.from === entity.id ? rel.to : rel.from;
                const other = this.entities.get(otherId);
                if (other) {
                    context += `- ${rel.type} ${other.name} (${other.type})\n`;
                }
            }
        }

        return context;
    }

    /**
     * Get graph statistics
     */
    getStats(): {
        entities: number;
        relationships: number;
        byType: Record<EntityType, number>;
    } {
        const byType: Record<EntityType, number> = {} as any;
        for (const entity of this.entities.values()) {
            byType[entity.type] = (byType[entity.type] || 0) + 1;
        }

        return {
            entities: this.entities.size,
            relationships: this.relationships.size,
            byType,
        };
    }

    // ─────────────────────────────────────────────────────────────────
    // Private Methods
    // ─────────────────────────────────────────────────────────────────

    private calculateImportance(entity: Entity): number {
        const now = Date.now();
        const recency = 1 - (now - entity.lastSeen) / (365 * 24 * 60 * 60 * 1000);
        const frequency = Math.min(1, entity.mentionCount / 100);
        return Math.max(0, Math.min(1, recency * 0.4 + frequency * 0.6));
    }

    private isCommonWord(word: string): boolean {
        const common = ['the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'her', 'was', 'one', 'our', 'out'];
        return common.includes(word.toLowerCase());
    }

    private async loadGraph(): Promise<void> {
        try {
            const entitiesJson = await AsyncStorage.getItem(ENTITIES_KEY);
            if (entitiesJson) {
                const arr = JSON.parse(entitiesJson) as Entity[];
                for (const e of arr) {
                    this.entities.set(e.id, e);
                }
            }

            const relsJson = await AsyncStorage.getItem(RELATIONSHIPS_KEY);
            if (relsJson) {
                const arr = JSON.parse(relsJson) as Relationship[];
                for (const r of arr) {
                    this.relationships.set(r.id, r);
                }
            }
        } catch (e) {
            console.warn('[KnowledgeGraph] Failed to load:', e);
        }
    }

    private async saveGraph(): Promise<void> {
        try {
            await AsyncStorage.setItem(
                ENTITIES_KEY,
                JSON.stringify(Array.from(this.entities.values()))
            );
            await AsyncStorage.setItem(
                RELATIONSHIPS_KEY,
                JSON.stringify(Array.from(this.relationships.values()))
            );
        } catch (e) {
            console.error('[KnowledgeGraph] Failed to save:', e);
        }
    }
}

export const KnowledgeGraphService = new KnowledgeGraphServiceClass();
export default KnowledgeGraphService;
