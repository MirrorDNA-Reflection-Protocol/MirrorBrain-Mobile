/**
 * Vault Service — Local Storage Operations
 * From Spec Part V & Part XII
 * 
 * Storage Layout:
 * /sdcard/MirrorBrain/
 * ├── Config/
 * ├── Models/
 * ├── Vault/
 * ├── Captures/
 * └── Logs/
 */

import RNFS from 'react-native-fs';
import { PermissionsAndroid, Platform } from 'react-native';
import type { VaultItem, SessionClosure, ChatMessage } from '../types';

// External vault paths on Pixel
export const EXTERNAL_VAULT_PATHS = {
    PIXEL_VAULT: '/storage/emulated/0/Pixel Vault',
    OBSIDIAN: '/storage/emulated/0/Obsidian/MirrorDNA-Vault',
    CHRYSALIS: '/storage/emulated/0/Chrysalis',
} as const;

// Storage paths matching spec Part XII
// Using DocumentDirectoryPath for Android 13+ compatibility (scoped storage)
export const STORAGE_PATHS = {
    // Root - app-specific storage that doesn't require special permissions
    ROOT: `${RNFS.DocumentDirectoryPath}/MirrorBrain`,

    // Subdirectories
    CONFIG: 'Config',
    MODELS: 'Models',
    VAULT: 'Vault',
    CAPTURES: 'Captures',
    LOGS: 'Logs',

    // Config files
    IDENTITY: 'Config/identity.json',
    PREFERENCES: 'Config/preferences.json',
    MODELS_CONFIG: 'Config/models.json',

    // Vault subdirectories
    VAULT_CAPTURES: 'Vault/captures',
    VAULT_DECISIONS: 'Vault/decisions',
    VAULT_SESSIONS: 'Vault/sessions',

    // Capture subdirectories
    CAPTURES_NOTES: 'Captures/notes',
    CAPTURES_VOICE: 'Captures/voice',
    CAPTURES_SCREENSHOTS: 'Captures/screenshots',
} as const;

export interface VaultServiceConfig {
    rootPath: string;
}

interface StoredCapture {
    id: string;
    type: 'note' | 'voice' | 'screenshot';
    title: string;
    content: string;
    mediaPath?: string;
    createdAt: string;
    updatedAt: string;
    tags?: string[];
}

export interface MemorySpark {
    id: string;
    title: string;
    content: string;
    date: Date;
}

interface StoredDecision {
    id: string;
    decision: string;
    rationale: string;
    context?: string;
    createdAt: string;
}

interface StoredSession {
    id: string;
    messages: ChatMessage[];
    closure: SessionClosure;
    createdAt: string;
}

class VaultServiceClass {
    private rootPath: string = STORAGE_PATHS.ROOT;
    private externalVaultPath: string | null = null;
    private initialized: boolean = false;
    private hasExternalAccess: boolean = false;

    /**
     * Initialize storage directories
     * Should be called on app startup
     */
    async initialize(config?: VaultServiceConfig): Promise<boolean> {
        if (config?.rootPath) {
            this.rootPath = config.rootPath;
        }

        try {
            const directories = [
                this.getPath(STORAGE_PATHS.CONFIG),
                this.getPath(STORAGE_PATHS.MODELS),
                this.getPath(STORAGE_PATHS.VAULT),
                this.getPath(STORAGE_PATHS.CAPTURES),
                this.getPath(STORAGE_PATHS.LOGS),
                this.getPath(STORAGE_PATHS.VAULT_CAPTURES),
                this.getPath(STORAGE_PATHS.VAULT_DECISIONS),
                this.getPath(STORAGE_PATHS.VAULT_SESSIONS),
                this.getPath(STORAGE_PATHS.CAPTURES_NOTES),
                this.getPath(STORAGE_PATHS.CAPTURES_VOICE),
                this.getPath(STORAGE_PATHS.CAPTURES_SCREENSHOTS),
            ];

            // Create all directories
            for (const dir of directories) {
                const exists = await RNFS.exists(dir);
                if (!exists) {
                    await RNFS.mkdir(dir);
                }
            }

            console.log('Vault initialized at:', this.rootPath);
            this.initialized = true;
            return true;
        } catch (error) {
            console.error('Failed to initialize vault:', error);
            return false;
        }
    }

    /**
     * Get full path for a storage location
     */
    getPath(subPath: string): string {
        return `${this.rootPath}/${subPath}`;
    }

    /**
     * Check if vault is initialized
     */
    isInitialized(): boolean {
        return this.initialized;
    }

    /**
     * Get root path
     */
    getRootPath(): string {
        return this.rootPath;
    }

    /**
     * Save a capture to vault
     */
    async saveCapture(
        type: 'note' | 'voice' | 'screenshot',
        content: string,
        title?: string,
        mediaPath?: string,
        tags?: string[]
    ): Promise<string | null> {
        if (!this.initialized) {
            console.error('Vault not initialized');
            return null;
        }

        const id = generateId();
        const timestamp = new Date().toISOString();

        const capture: StoredCapture = {
            id,
            type,
            title: title || `${type} - ${new Date().toLocaleDateString()}`,
            content,
            mediaPath,
            tags,
            createdAt: timestamp,
            updatedAt: timestamp,
        };

        try {
            const filePath = `${this.getPath(STORAGE_PATHS.VAULT_CAPTURES)}/${id}.json`;
            await RNFS.writeFile(filePath, JSON.stringify(capture, null, 2), 'utf8');
            console.log('Capture saved:', id);
            return id;
        } catch (error) {
            console.error('Failed to save capture:', error);
            return null;
        }
    }

    /**
     * Save a decision to vault
     */
    async saveDecision(
        decision: string,
        rationale: string,
        context?: string
    ): Promise<string | null> {
        if (!this.initialized) {
            console.error('Vault not initialized');
            return null;
        }

        const id = generateId();
        const timestamp = new Date().toISOString();

        const record: StoredDecision = {
            id,
            decision,
            rationale,
            context,
            createdAt: timestamp,
        };

        try {
            const filePath = `${this.getPath(STORAGE_PATHS.VAULT_DECISIONS)}/${id}.json`;
            await RNFS.writeFile(filePath, JSON.stringify(record, null, 2), 'utf8');
            console.log('Decision saved:', id);
            return id;
        } catch (error) {
            console.error('Failed to save decision:', error);
            return null;
        }
    }

    /**
     * Save a session summary to vault
     */
    async saveSession(
        messages: ChatMessage[],
        closure: SessionClosure
    ): Promise<string | null> {
        if (!this.initialized) {
            console.error('Vault not initialized');
            return null;
        }

        const id = generateId();
        const timestamp = new Date().toISOString();

        const session: StoredSession = {
            id,
            messages,
            closure,
            createdAt: timestamp,
        };

        try {
            const filePath = `${this.getPath(STORAGE_PATHS.VAULT_SESSIONS)}/${id}.json`;
            await RNFS.writeFile(filePath, JSON.stringify(session, null, 2), 'utf8');
            console.log('Session saved:', id);
            return id;
        } catch (error) {
            console.error('Failed to save session:', error);
            return null;
        }
    }

    /**
     * List items from vault
     */
    async listItems(
        type?: 'capture' | 'decision' | 'session'
    ): Promise<VaultItem[]> {
        const items: VaultItem[] = [];

        try {
            const paths: Array<{ path: string; itemType: VaultItem['type'] }> = [];

            if (!type || type === 'capture') {
                paths.push({ path: this.getPath(STORAGE_PATHS.VAULT_CAPTURES), itemType: 'capture' });
            }
            if (!type || type === 'decision') {
                paths.push({ path: this.getPath(STORAGE_PATHS.VAULT_DECISIONS), itemType: 'decision' });
            }
            if (!type || type === 'session') {
                paths.push({ path: this.getPath(STORAGE_PATHS.VAULT_SESSIONS), itemType: 'session' });
            }

            for (const { path, itemType } of paths) {
                const exists = await RNFS.exists(path);
                if (!exists) continue;

                const files = await RNFS.readDir(path);

                for (const file of files) {
                    if (!file.name.endsWith('.json')) continue;

                    try {
                        const content = await RNFS.readFile(file.path, 'utf8');
                        const data = JSON.parse(content);

                        items.push({
                            id: data.id,
                            type: itemType,
                            title: data.title || data.decision || `Session ${data.id.slice(0, 8)}`,
                            content: data.content || data.rationale || `${data.messages?.length || 0} messages`,
                            createdAt: new Date(data.createdAt),
                            updatedAt: new Date(data.updatedAt || data.createdAt),
                            tags: data.tags,
                        });
                    } catch (parseError) {
                        console.warn('Failed to parse vault item:', file.name, parseError);
                    }
                }
            }

            // Sort by date, newest first
            items.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

            return items;
        } catch (error) {
            console.error('Failed to list vault items:', error);
            return [];
        }
    }



    /**
     * Get a specific item by ID
     */
    async getItem(id: string, type: VaultItem['type']): Promise<unknown | null> {
        try {
            let dir: string;
            switch (type) {
                case 'capture':
                    dir = this.getPath(STORAGE_PATHS.VAULT_CAPTURES);
                    break;
                case 'decision':
                    dir = this.getPath(STORAGE_PATHS.VAULT_DECISIONS);
                    break;
                case 'session':
                    dir = this.getPath(STORAGE_PATHS.VAULT_SESSIONS);
                    break;
            }

            const filePath = `${dir}/${id}.json`;
            const exists = await RNFS.exists(filePath);

            if (!exists) return null;

            const content = await RNFS.readFile(filePath, 'utf8');
            return JSON.parse(content);
        } catch (error) {
            console.error('Failed to get item:', error);
            return null;
        }
    }

    /**
     * Delete an item from vault
     * User can delete anything, anytime, completely
     */
    async deleteItem(id: string, type: VaultItem['type']): Promise<boolean> {
        try {
            let dir: string;
            switch (type) {
                case 'capture':
                    dir = this.getPath(STORAGE_PATHS.VAULT_CAPTURES);
                    break;
                case 'decision':
                    dir = this.getPath(STORAGE_PATHS.VAULT_DECISIONS);
                    break;
                case 'session':
                    dir = this.getPath(STORAGE_PATHS.VAULT_SESSIONS);
                    break;
            }

            const filePath = `${dir}/${id}.json`;
            const exists = await RNFS.exists(filePath);

            if (!exists) {
                console.warn('Item not found:', id);
                return false;
            }

            await RNFS.unlink(filePath);
            console.log('Item deleted:', id);
            return true;
        } catch (error) {
            console.error('Failed to delete item:', error);
            return false;
        }
    }

    /**
     * Export vault to user-selected location
     */
    async export(targetPath: string): Promise<boolean> {
        try {
            // Create backup directory
            const backupDir = `${targetPath}/MirrorBrain-Backup-${Date.now()}`;
            await RNFS.mkdir(backupDir);

            // Copy directories recursively
            await this.copyDirectory(
                this.getPath(STORAGE_PATHS.VAULT),
                `${backupDir}/Vault`
            );
            await this.copyDirectory(
                this.getPath(STORAGE_PATHS.CONFIG),
                `${backupDir}/Config`
            );

            console.log('Vault exported to:', backupDir);
            return true;
        } catch (error) {
            console.error('Failed to export vault:', error);
            return false;
        }
    }

    /**
     * Helper: Copy directory recursively
     */
    private async copyDirectory(source: string, dest: string): Promise<void> {
        const exists = await RNFS.exists(source);
        if (!exists) return;

        await RNFS.mkdir(dest);

        const files = await RNFS.readDir(source);
        for (const file of files) {
            const destPath = `${dest}/${file.name}`;
            if (file.isDirectory()) {
                await this.copyDirectory(file.path, destPath);
            } else {
                await RNFS.copyFile(file.path, destPath);
            }
        }
    }

    /**
     * Get storage usage info
     */
    async getStorageInfo(): Promise<{
        used: number;
        available: number;
        items: number;
    }> {
        try {
            const fsInfo = await RNFS.getFSInfo();
            const items = await this.listItems();

            return {
                used: fsInfo.totalSpace - fsInfo.freeSpace,
                available: fsInfo.freeSpace,
                items: items.length,
            };
        } catch (error) {
            console.error('Failed to get storage info:', error);
            return {
                used: 0,
                available: 0,
                items: 0,
            };
        }
    }

    /**
     * Check available space before operations
     * From spec Part IX: Alert user BEFORE operation fails
     */
    async hasSpaceFor(bytes: number): Promise<boolean> {
        try {
            const fsInfo = await RNFS.getFSInfo();
            return fsInfo.freeSpace > bytes + 100_000_000; // 100MB buffer
        } catch {
            return true; // Assume OK if check fails
        }
    }



    /**
     * Request external storage access for Pixel Vault
     * On Android 11+, requires MANAGE_EXTERNAL_STORAGE which user must grant in Settings
     */
    async requestExternalAccess(): Promise<boolean> {
        if (Platform.OS !== 'android') return false;

        try {
            console.log('Checking vault paths...');
            console.log('Pixel Vault path:', EXTERNAL_VAULT_PATHS.PIXEL_VAULT);
            console.log('Obsidian path:', EXTERNAL_VAULT_PATHS.OBSIDIAN);

            // Request legacy storage permission on SDK ≤ 32 only.
            // On SDK 33+ (Android 13+), READ_EXTERNAL_STORAGE is dead —
            // the app uses MANAGE_EXTERNAL_STORAGE granted via Settings.
            const sdkVersion = typeof Platform.Version === 'number' ? Platform.Version : parseInt(String(Platform.Version), 10);
            if (sdkVersion <= 32) {
                const granted = await PermissionsAndroid.request(
                    PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE,
                    {
                        title: 'Storage Access',
                        message: 'MirrorBrain needs access to read your Obsidian vault',
                        buttonPositive: 'Grant Access',
                    }
                );
                console.log('Storage permission result:', granted);
            } else {
                console.log('SDK 33+ — skipping READ_EXTERNAL_STORAGE, using MANAGE_EXTERNAL_STORAGE');
            }

            // Check if external vault exists
            const pixelVaultExists = await RNFS.exists(EXTERNAL_VAULT_PATHS.PIXEL_VAULT);
            const obsidianExists = await RNFS.exists(EXTERNAL_VAULT_PATHS.OBSIDIAN);

            console.log('Pixel Vault exists:', pixelVaultExists);
            console.log('Obsidian exists:', obsidianExists);

            if (obsidianExists) {
                this.externalVaultPath = EXTERNAL_VAULT_PATHS.OBSIDIAN;
                this.hasExternalAccess = true;
            } else if (pixelVaultExists) {
                this.externalVaultPath = EXTERNAL_VAULT_PATHS.PIXEL_VAULT;
                this.hasExternalAccess = true;
            }

            console.log('External vault path set to:', this.externalVaultPath);
            console.log('Has external access:', this.hasExternalAccess);
            return this.hasExternalAccess;
        } catch (error) {
            console.error('Failed to access external vault:', error);
            return false;
        }
    }

    /**
     * Check if app has all files access (MANAGE_EXTERNAL_STORAGE)
     * Returns true if we can read external storage directories
     */
    async checkAllFilesAccess(): Promise<boolean> {
        if (Platform.OS !== 'android') return false;

        try {
            // Try to read a known directory to test access
            const testPath = EXTERNAL_VAULT_PATHS.OBSIDIAN;
            const exists = await RNFS.exists(testPath);
            if (!exists) return false;

            const items = await RNFS.readDir(testPath);
            console.log('All files access test - items found:', items.length);
            return items.length > 0;
        } catch (e) {
            console.log('All files access test failed:', e);
            return false;
        }
    }

    /**
     * Run storage diagnostics
     */
    async runDiagnostics(): Promise<string> {
        if (Platform.OS !== 'android') return 'Not Android';

        const logs: string[] = [];
        const log = (msg: string) => {
            console.log('[Diagnostics]', msg);
            logs.push(msg);
        };

        try {
            log('Running storage diagnostics...');

            // 1. Check Root Access
            const rootPath = '/storage/emulated/0';
            try {
                const rootItems = await RNFS.readDir(rootPath);
                log(`Root listing (${rootPath}): Found ${rootItems.length} items.`);
                if (rootItems.length > 0) {
                    log(`First item: ${rootItems[0].name} (${rootItems[0].isDirectory() ? 'DIR' : 'FILE'})`);
                }
            } catch (e) {
                log(`FAILED to list root: ${e}`);
            }

            // 2. Check Obsidian Folder
            const obsidianPath = EXTERNAL_VAULT_PATHS.OBSIDIAN;
            try {
                const exists = await RNFS.exists(obsidianPath);
                log(`Obsidian path (${obsidianPath}) exists: ${exists}`);

                if (exists) {
                    const items = await RNFS.readDir(obsidianPath);
                    log(`Obsidian folder content: Found ${items.length} items.`);
                    items.forEach(i => log(` - ${i.name}`));
                }
            } catch (e) {
                log(`FAILED to list Obsidian: ${e}`);
            }

            // 3. Check Permissions Status
            try {
                const readPerm = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE);
                const writePerm = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE);
                log(`Permission Status - READ: ${readPerm}, WRITE: ${writePerm}`);
            } catch (e) {
                log(`Error checking permissions: ${e}`);
            }

            return logs.join('\n');
        } catch (error) {
            log(`Critical diagnostic fail: ${error}`);
            return logs.join('\n');
        }
    }
    /**
     * List files from external Pixel Vault
     */
    async listExternalVaultFiles(subPath: string = ''): Promise<VaultItem[]> {
        if (!this.externalVaultPath) {
            await this.requestExternalAccess();
        }

        if (!this.externalVaultPath) {
            return [];
        }

        const items: VaultItem[] = [];
        const targetPath = subPath
            ? `${this.externalVaultPath}/${subPath}`
            : this.externalVaultPath;

        try {
            const exists = await RNFS.exists(targetPath);
            if (!exists) return [];

            const files = await RNFS.readDir(targetPath);

            for (const file of files) {
                // Skip hidden files and system folders
                if (file.name.startsWith('.')) continue;

                items.push({
                    id: file.path,
                    type: file.isDirectory() ? 'capture' : 'session',
                    title: file.name,
                    content: file.isDirectory()
                        ? `📁 Folder`
                        : `${Math.round(file.size / 1024)} KB`,
                    createdAt: new Date(file.mtime || Date.now()),
                    updatedAt: new Date(file.mtime || Date.now()),
                    tags: file.isDirectory() ? ['folder'] : [file.name.split('.').pop() || 'file'],
                });
            }

            // Sort folders first, then by name
            items.sort((a, b) => {
                if (a.tags?.includes('folder') && !b.tags?.includes('folder')) return -1;
                if (!a.tags?.includes('folder') && b.tags?.includes('folder')) return 1;
                return a.title.localeCompare(b.title);
            });

            return items;
        } catch (error) {
            console.error('Failed to list external vault:', error);
            return [];
        }
    }

    /**
     * Read file content from external vault
     */
    async readExternalFile(filePath: string): Promise<string | null> {
        try {
            const exists = await RNFS.exists(filePath);
            if (!exists) return null;

            return await RNFS.readFile(filePath, 'utf8');
        } catch (error) {
            console.error('Failed to read external file:', error);
            return null;
        }
    }

    /**
     * Get a random memory (capture or decision) to spark serendipity
     */
    async getRandomMemory(): Promise<MemorySpark | null> {
        try {
            const captures = await this.listItems('capture');
            const decisions = await this.listItems('decision');
            const allItems = [...captures, ...decisions];

            if (allItems.length === 0) return null;

            // Filter out very short items to avoid noise
            const candidates = allItems.filter(item => item.content.length > 20);

            if (candidates.length === 0) return null;

            const randomItem = candidates[Math.floor(Math.random() * candidates.length)];

            return {
                id: randomItem.id,
                title: randomItem.title,
                content: randomItem.content,
                date: randomItem.createdAt
            };
        } catch (error) {
            console.error('Failed to get random memory:', error);
            return null;
        }
    }

    /**
     * Search the vault for items matching a query
     */
    async search(query: string): Promise<VaultItem[]> {
        if (!query || query.trim().length === 0) return [];

        try {
            const allItems = await this.listItems();
            const lowerQuery = query.toLowerCase();

            return allItems.filter(item =>
                item.title.toLowerCase().includes(lowerQuery) ||
                item.content.toLowerCase().includes(lowerQuery) ||
                (item.tags && item.tags.some(tag => tag.toLowerCase().includes(lowerQuery)))
            );
        } catch (error) {
            console.error('Search failed:', error);
            return [];
        }
    }

    /**
     * Get graph data for visualization
     * Scans external vault for markdown files and extracts [[links]]
     */
    async getGraphData(): Promise<{ nodes: any[], links: any[] }> {
        if (!this.externalVaultPath) {
            await this.requestExternalAccess();
        }

        if (!this.externalVaultPath) {
            return { nodes: [], links: [] };
        }

        const nodes: any[] = [];
        const links: any[] = [];
        const fileNames = new Set<string>();
        const folderPaths = new Set<string>();
        let filesScanned = 0;
        const MAX_FILES = 1000; // Increased for visual density

        console.log('Starting graph scan from:', this.externalVaultPath);

        const scanRecursive = async (currentPath: string, depth: number = 0, parentId: string | null = null, topFolder: string = 'Root') => {
            if (depth > 6 || filesScanned > MAX_FILES) return;

            try {
                const files = await RNFS.readDir(currentPath);

                let currentFolderId = parentId;

                if (depth > 0) {
                    const folderName = depth === 0 ? 'Root' : (currentPath.split('/').pop() || 'Unknown');
                    const folderId = `dir_${currentPath}`;
                    currentFolderId = folderId;

                    if (!folderPaths.has(folderId)) {
                        folderPaths.add(folderId);

                        // Group Hash based on full path for maximum color variety
                        let pathHash = 0;
                        for (let i = 0; i < currentPath.length; i++) pathHash = currentPath.charCodeAt(i) + ((pathHash << 5) - pathHash);
                        const group = Math.abs(pathHash % 6) + 1;

                        nodes.push({
                            id: folderId,
                            label: folderName,
                            group,
                            type: 'folder',
                            radius: 12 + Math.max(0, 4 - depth)
                        });

                        // Link to Parent
                        if (parentId) {
                            links.push({ source: parentId, target: folderId, type: 'structure' });
                        }
                    }
                }

                for (const file of files) {
                    if (file.name.startsWith('.')) continue;
                    if (filesScanned > MAX_FILES) break;

                    if (file.isDirectory()) {
                        const nextFolder = depth === 0 ? file.name : topFolder;
                        // Use currentFolderId as parent for children
                        await scanRecursive(file.path, depth + 1, currentFolderId, nextFolder);
                    } else if (file.name.endsWith('.md')) {
                        filesScanned++;
                        const name = file.name.replace('.md', '');
                        fileNames.add(name);

                        let fileHash = 0;
                        for (let i = 0; i < file.path.length; i++) fileHash = file.path.charCodeAt(i) + ((fileHash << 5) - fileHash);
                        const group = Math.abs(fileHash % 6) + 1;

                        nodes.push({
                            id: name,
                            group,
                            folder: topFolder,
                            type: 'file',
                            path: file.path // Critical for navigation
                        });

                        // Link to Folder
                        if (currentFolderId) {
                            links.push({ source: currentFolderId, target: name, type: 'structure' });
                        }

                        try {
                            const content = await RNFS.readFile(file.path, 'utf8');
                            const linkMatches = content.matchAll(/\[\[(.*?)\]\]/g);
                            for (const match of linkMatches) {
                                links.push({ source: name, target: match[1].split('|')[0], type: 'semantic' });
                            }
                        } catch {
                            // ignore
                        }
                    }
                }
            } catch {
                // ignore
            }
        };

        try {
            await scanRecursive(this.externalVaultPath);
            console.log(`[VaultService] Graph scan complete: ${nodes.length} nodes, ${links.length} links`);

            // CRITICAL: D3 will crash if any link source/target is missing from the nodes array.
            // We must filter all links against the final node set.
            const validNodeIds = new Set(nodes.map(n => n.id));
            const validLinks = links.filter(l =>
                validNodeIds.has(l.source) &&
                validNodeIds.has(l.target)
            );

            console.log(`[VaultService] Final filtered graph: ${nodes.length} nodes, ${validLinks.length} links`);
            return { nodes, links: validLinks };
        } catch (error) {
            console.error('[VaultService] Failed to extract graph data:', error);
            return { nodes: [], links: [] };
        }
    }

    /**
     * Get external vault path
     */
    getExternalVaultPath(): string | null {
        return this.externalVaultPath;
    }

    /**
     * Check if external vault is connected
     */
    hasExternalVault(): boolean {
        return this.hasExternalAccess;
    }

    /**
     * Save a note to vault (convenience wrapper around saveCapture)
     * Used by ActionExecutor for 'note' and 'reminder' intents
     */
    async saveNote(title: string, content: string, tags?: string[]): Promise<string | null> {
        return this.saveCapture('note', content, title, undefined, tags);
    }

    /**
     * Create a memory spark from passive intelligence captures
     * Used by PassiveIntelligenceService and OCRService
     */
    async createSpark(content: string, category?: string): Promise<string | null> {
        const tags = category ? ['spark', category] : ['spark'];
        const title = `Spark: ${content.slice(0, 40)}${content.length > 40 ? '...' : ''}`;
        return this.saveCapture('note', content, title, undefined, tags);
    }
}

/**
 * Generate a unique ID
 */
function generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// Singleton export
export const VaultService = new VaultServiceClass();

export default VaultService;
