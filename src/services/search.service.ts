/**
 * Search Service — Web Search Integration
 * 
 * Provides Perplexity-style web search with citations.
 * Uses DuckDuckGo Instant Answer API (free, no key needed).
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
    answer?: string;  // AI-generated summary
    relatedQueries?: string[];
}

const DUCKDUCKGO_API = 'https://api.duckduckgo.com/';

class SearchServiceClass {
    private cache: Map<string, SearchResponse> = new Map();

    /**
     * Search the web using DuckDuckGo
     */
    async search(query: string, limit: number = 5): Promise<SearchResponse> {
        // Check cache first
        const cacheKey = `${query}_${limit}`;
        if (this.cache.has(cacheKey)) {
            return this.cache.get(cacheKey)!;
        }

        try {
            // DuckDuckGo Instant Answer API
            const response = await fetch(
                `${DUCKDUCKGO_API}?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`
            );
            const data = await response.json();

            const results: SearchResult[] = [];

            // Add abstract if available
            if (data.AbstractText && data.AbstractURL) {
                results.push({
                    title: data.Heading || query,
                    url: data.AbstractURL,
                    snippet: data.AbstractText.slice(0, 200) + '...',
                    source: data.AbstractSource || 'Wikipedia',
                    favicon: this.getFavicon(data.AbstractURL),
                });
            }

            // Add related topics
            if (data.RelatedTopics && Array.isArray(data.RelatedTopics)) {
                for (const topic of data.RelatedTopics.slice(0, limit - 1)) {
                    if (topic.FirstURL && topic.Text) {
                        results.push({
                            title: topic.Text.split(' - ')[0] || topic.Text.slice(0, 50),
                            url: topic.FirstURL,
                            snippet: topic.Text.slice(0, 150),
                            source: this.extractDomain(topic.FirstURL),
                            favicon: this.getFavicon(topic.FirstURL),
                        });
                    }
                }
            }

            // If no results from instant answer, try HTML scrape fallback
            if (results.length === 0) {
                const htmlResults = await this.searchHTML(query, limit);
                results.push(...htmlResults);
            }

            const searchResponse: SearchResponse = {
                query,
                results,
                relatedQueries: data.RelatedTopics
                    ?.filter((t: any) => t.Name)
                    ?.map((t: any) => t.Name)
                    ?.slice(0, 5),
            };

            // Cache the result
            this.cache.set(cacheKey, searchResponse);

            return searchResponse;
        } catch (error) {
            console.error('Search failed:', error);
            return { query, results: [] };
        }
    }

    /**
     * Fallback: Scrape DuckDuckGo HTML results
     */
    private async searchHTML(query: string, limit: number): Promise<SearchResult[]> {
        try {
            const response = await fetch(
                `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`,
                {
                    headers: {
                        'User-Agent': 'MirrorBrain/1.0',
                    },
                }
            );
            const html = await response.text();

            // Simple regex parsing for results
            const results: SearchResult[] = [];
            const resultPattern = /<a class="result__a" href="([^"]+)"[^>]*>([^<]+)<\/a>[\s\S]*?<a class="result__snippet"[^>]*>([^<]+)/g;

            let match;
            while ((match = resultPattern.exec(html)) !== null && results.length < limit) {
                const url = match[1];
                results.push({
                    title: match[2].trim(),
                    url: url,
                    snippet: match[3].trim(),
                    source: this.extractDomain(url),
                    favicon: this.getFavicon(url),
                });
            }

            return results;
        } catch (error) {
            console.warn('HTML search fallback failed:', error);
            return [];
        }
    }

    /**
     * Generate AI summary using local model
     */
    async generateSummary(query: string, results: SearchResult[]): Promise<string> {
        // This would call the local AI service
        // For now, return a formatted summary of top results
        if (results.length === 0) {
            return "I couldn't find any results for that query.";
        }

        const topResult = results[0];
        return `Based on ${topResult.source}: ${topResult.snippet}`;
    }

    /**
     * Get favicon URL for a website
     */
    private getFavicon(url: string): string {
        try {
            const domain = new URL(url).hostname;
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
            return new URL(url).hostname.replace('www.', '');
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
