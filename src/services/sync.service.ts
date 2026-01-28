/**
 * Sync Service — MirrorDNA-Vault Integration
 * 
 * Purpose: Sync captures, decisions, and sessions from mobile to
 * your Mac's MirrorDNA-Vault for reflection with Claude/Antigravity.
 * 
 * Methods:
 * 1. Export as JSON (share via any app)
 * 2. Write to shared folder (for Syncthing/KDE Connect)
 * 3. Generate markdown for Obsidian
 */

import RNFS from 'react-native-fs';
import { Share, Platform } from 'react-native';
import { VaultService } from './vault.service';
import type { VaultItem } from '../types';

export interface SyncPackage {
    version: '1.0';
    exportedAt: string;
    device: string;
    items: {
        captures: unknown[];
        decisions: unknown[];
        sessions: unknown[];
    };
    summary: {
        totalItems: number;
        dateRange: {
            earliest: string;
            latest: string;
        };
    };
}

class SyncServiceClass {
    /**
     * Export vault as JSON package for sharing
     */
    async exportAsJson(): Promise<string | null> {
        try {
            const items = await VaultService.listItems();

            if (items.length === 0) {
                return null;
            }

            const captures = await this.loadAllItems('capture');
            const decisions = await this.loadAllItems('decision');
            const sessions = await this.loadAllItems('session');

            const dates = items.map(i => i.createdAt.getTime());

            const syncPackage: SyncPackage = {
                version: '1.0',
                exportedAt: new Date().toISOString(),
                device: 'MirrorBrain Mobile',
                items: {
                    captures,
                    decisions,
                    sessions,
                },
                summary: {
                    totalItems: items.length,
                    dateRange: {
                        earliest: new Date(Math.min(...dates)).toISOString(),
                        latest: new Date(Math.max(...dates)).toISOString(),
                    },
                },
            };

            const filename = `mirrorbrain-sync-${Date.now()}.json`;
            const path = `${RNFS.CachesDirectoryPath}/${filename}`;

            await RNFS.writeFile(path, JSON.stringify(syncPackage, null, 2), 'utf8');

            return path;
        } catch (error) {
            console.error('Export failed:', error);
            return null;
        }
    }

    /**
     * Share vault export via system share sheet
     */
    async shareExport(): Promise<boolean> {
        try {
            const path = await this.exportAsJson();

            if (!path) {
                return false;
            }

            if (Platform.OS === 'android') {
                await Share.share({
                    message: 'MirrorBrain Vault Export',
                    url: `file://${path}`,
                });
            } else {
                await Share.share({
                    url: `file://${path}`,
                });
            }

            return true;
        } catch (error) {
            console.error('Share failed:', error);
            return false;
        }
    }

    /**
     * Generate Obsidian-compatible markdown for each item
     */
    async exportAsMarkdown(): Promise<string | null> {
        try {
            const items = await VaultService.listItems();

            if (items.length === 0) {
                return null;
            }

            const exportDir = `${RNFS.CachesDirectoryPath}/obsidian-export`;
            await RNFS.mkdir(exportDir);

            // Export captures
            for (const item of items.filter(i => i.type === 'capture')) {
                const md = this.itemToMarkdown(item, 'capture');
                const filename = `capture-${item.id}.md`;
                await RNFS.writeFile(`${exportDir}/${filename}`, md, 'utf8');
            }

            // Export decisions
            for (const item of items.filter(i => i.type === 'decision')) {
                const md = this.itemToMarkdown(item, 'decision');
                const filename = `decision-${item.id}.md`;
                await RNFS.writeFile(`${exportDir}/${filename}`, md, 'utf8');
            }

            // Export sessions
            for (const item of items.filter(i => i.type === 'session')) {
                const md = this.itemToMarkdown(item, 'session');
                const filename = `session-${item.id}.md`;
                await RNFS.writeFile(`${exportDir}/${filename}`, md, 'utf8');
            }

            // Create index
            const index = this.generateIndex(items);
            await RNFS.writeFile(`${exportDir}/MirrorBrain-Index.md`, index, 'utf8');

            return exportDir;
        } catch (error) {
            console.error('Markdown export failed:', error);
            return null;
        }
    }

    /**
     * Write sync package to a specific path (for Syncthing)
     */
    async syncToPath(targetPath: string): Promise<boolean> {
        try {
            const path = await this.exportAsJson();
            if (!path) return false;

            const filename = `mirrorbrain-sync-${new Date().toISOString().split('T')[0]}.json`;
            const destPath = `${targetPath}/${filename}`;

            await RNFS.copyFile(path, destPath);

            console.log('Synced to:', destPath);
            return true;
        } catch (error) {
            console.error('Sync to path failed:', error);
            return false;
        }
    }

    /**
     * Convert vault item to Obsidian markdown
     */
    private itemToMarkdown(item: VaultItem, type: string): string {
        const frontmatter = [
            '---',
            `type: ${type}`,
            `id: ${item.id}`,
            `created: ${item.createdAt.toISOString()}`,
            `source: MirrorBrain Mobile`,
            item.tags?.length ? `tags: [${item.tags.join(', ')}]` : null,
            '---',
        ].filter(Boolean).join('\n');

        const content = [
            frontmatter,
            '',
            `# ${item.title}`,
            '',
            item.content,
            '',
            '---',
            `*Captured on ${item.createdAt.toLocaleString()}*`,
        ].join('\n');

        return content;
    }

    /**
     * Generate index markdown for Obsidian
     */
    private generateIndex(items: VaultItem[]): string {
        const now = new Date();

        const lines = [
            '---',
            'type: mirrorbrain-index',
            `exported: ${now.toISOString()}`,
            '---',
            '',
            '# MirrorBrain Export',
            '',
            `*Exported on ${now.toLocaleString()}*`,
            '',
            '## Summary',
            '',
            `- **Total items:** ${items.length}`,
            `- **Captures:** ${items.filter(i => i.type === 'capture').length}`,
            `- **Decisions:** ${items.filter(i => i.type === 'decision').length}`,
            `- **Sessions:** ${items.filter(i => i.type === 'session').length}`,
            '',
            '## Recent Items',
            '',
        ];

        // Add recent items
        const recent = items.slice(0, 10);
        for (const item of recent) {
            const date = item.createdAt.toLocaleDateString();
            lines.push(`- [[${item.type}-${item.id}|${item.title}]] (${date})`);
        }

        return lines.join('\n');
    }

    /**
     * Load all items of a specific type
     */
    private async loadAllItems(type: 'capture' | 'decision' | 'session'): Promise<unknown[]> {
        const items = await VaultService.listItems(type);
        const fullItems: unknown[] = [];

        for (const item of items) {
            const fullItem = await VaultService.getItem(item.id, type);
            if (fullItem) {
                fullItems.push(fullItem);
            }
        }

        return fullItems;
    }
}

// Singleton export
export const SyncService = new SyncServiceClass();

export default SyncService;
