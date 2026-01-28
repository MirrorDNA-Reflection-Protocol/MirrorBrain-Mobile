/**
 * Search Service — Web Search Integration
 * 
 * Uses DuckDuckGo HTML scraping for web results.
 * Note: This is a workaround since DDG Instant Answer API is limited.
 */

export interface SearchResult {
    title: string;
    url: string;
    snippet: string;
    favicon?: string;
    source: string;
}

export interface SearchResponse {
    query: string;
    results: SearchResult[];
    answer?: string;
    relatedQueries?: string[];
}

class SearchServiceClass {
    private cache: Map<string, SearchResponse> = new Map();

    /**
     * Search the web using DuckDuckGo
     */
    async search(query: string, limit: number = 5): Promise<SearchResponse> {
        // Check cache first
        const cacheKey = `${query}_${limit}`;
        if (this.cache.has(cacheKey)) {
            console.log('Search: Cache hit for', query);
            return this.cache.get(cacheKey)!;
        }

        try {
            console.log('Search: Querying for', query);

            // Use DuckDuckGo Lite for better scraping
            const results = await this.searchDDGLite(query, limit);

            // If DDG Lite fails, try HTML version
            if (results.length === 0) {
                console.log('Search: DDG Lite empty, trying HTML');
                const htmlResults = await this.searchDDGHTML(query, limit);
                results.push(...htmlResults);
            }

            const searchResponse: SearchResponse = {
                query,
                results,
            };

            // Cache for 5 minutes
            this.cache.set(cacheKey, searchResponse);
            setTimeout(() => this.cache.delete(cacheKey), 5 * 60 * 1000);

            console.log('Search: Found', results.length, 'results');
            return searchResponse;
        } catch (error) {
            console.error('Search failed:', error);
            return { query, results: [] };
        }
    }

    /**
     * Search using DuckDuckGo Lite (mobile-friendly, easier to parse)
     */
    private async searchDDGLite(query: string, limit: number): Promise<SearchResult[]> {
        try {
            const response = await fetch(
                `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(query)}`,
                {
                    method: 'POST',
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Android 14; Mobile) MirrorBrain/1.0',
                        'Accept': 'text/html',
                    },
                }
            );

            if (!response.ok) {
                throw new Error(`DDG Lite returned ${response.status}`);
            }

            const html = await response.text();
            const results: SearchResult[] = [];

            // Parse DDG Lite results
            // Format: <a rel="nofollow" href="URL" class='result-link'>TITLE</a>
            // followed by snippet in <td class='result-snippet'>
            const linkPattern = /<a[^>]*class=['"]?result-link['"]?[^>]*href=['"]([^'"]+)['"][^>]*>([^<]+)<\/a>/gi;
            const snippetPattern = /<td[^>]*class=['"]?result-snippet['"]?[^>]*>([^<]+)/gi;

            const links: Array<{ url: string; title: string }> = [];
            let match;

            while ((match = linkPattern.exec(html)) !== null && links.length < limit) {
                const url = match[1];
                const title = this.decodeHtmlEntities(match[2].trim());
                if (url.startsWith('http') && !url.includes('duckduckgo.com')) {
                    links.push({ url, title });
                }
            }

            const snippets: string[] = [];
            while ((match = snippetPattern.exec(html)) !== null) {
                snippets.push(this.decodeHtmlEntities(match[1].trim()));
            }

            for (let i = 0; i < links.length && results.length < limit; i++) {
                results.push({
                    title: links[i].title,
                    url: links[i].url,
                    snippet: snippets[i] || '',
                    source: this.extractDomain(links[i].url),
                    favicon: this.getFavicon(links[i].url),
                });
            }

            return results;
        } catch (error) {
            console.warn('DDG Lite search failed:', error);
            return [];
        }
    }

    /**
     * Fallback: Regular DuckDuckGo HTML
     */
    private async searchDDGHTML(query: string, limit: number): Promise<SearchResult[]> {
        try {
            const response = await fetch(
                `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`,
                {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Android 14; Mobile) MirrorBrain/1.0',
                        'Accept': 'text/html',
                    },
                }
            );

            if (!response.ok) {
                throw new Error(`DDG HTML returned ${response.status}`);
            }

            const html = await response.text();
            const results: SearchResult[] = [];

            // Parse result links
            // <a class="result__a" href="URL">TITLE</a>
            const resultPattern = /<a[^>]*class=['"]?result__a['"]?[^>]*href=['"]([^'"]+)['"][^>]*>([^<]+)<\/a>/gi;
            const snippetPattern = /<a[^>]*class=['"]?result__snippet['"]?[^>]*>([^<]+)/gi;

            const links: Array<{ url: string; title: string }> = [];
            let match;

            while ((match = resultPattern.exec(html)) !== null && links.length < limit * 2) {
                let url = match[1];
                const title = this.decodeHtmlEntities(match[2].trim());

                // DDG HTML uses redirect URLs, try to extract actual URL
                if (url.includes('uddg=')) {
                    const urlMatch = url.match(/uddg=([^&]+)/);
                    if (urlMatch) {
                        url = decodeURIComponent(urlMatch[1]);
                    }
                }

                if (url.startsWith('http') && !url.includes('duckduckgo.com')) {
                    links.push({ url, title });
                }
            }

            const snippets: string[] = [];
            while ((match = snippetPattern.exec(html)) !== null) {
                snippets.push(this.decodeHtmlEntities(match[1].trim()));
            }

            for (let i = 0; i < links.length && results.length < limit; i++) {
                results.push({
                    title: links[i].title,
                    url: links[i].url,
                    snippet: snippets[i] || 'No description available',
                    source: this.extractDomain(links[i].url),
                    favicon: this.getFavicon(links[i].url),
                });
            }

            return results;
        } catch (error) {
            console.warn('DDG HTML search failed:', error);
            return [];
        }
    }

    /**
     * Decode HTML entities
     */
    private decodeHtmlEntities(text: string): string {
        return text
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .replace(/&nbsp;/g, ' ');
    }

    /**
     * Get favicon URL for a website
     */
    private getFavicon(url: string): string {
        try {
            const match = url.match(/:\/\/(www[0-9]?\.)?(.[^/:]+)/i);
            const domain = match ? match[2] : url;
            return `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;
        } catch {
            return '';
        }
    }

    /**
     * Extract domain from URL
     */
    private extractDomain(url: string): string {
        try {
            const match = url.match(/:\/\/(www[0-9]?\.)?(.[^/:]+)/i);
            return match ? match[2] : url;
        } catch {
            return 'web';
        }
    }

    /**
     * Clear search cache
     */
    clearCache(): void {
        this.cache.clear();
    }
}

export const SearchService = new SearchServiceClass();
export default SearchService;

