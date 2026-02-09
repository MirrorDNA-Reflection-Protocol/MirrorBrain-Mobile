// graphLayout.service.ts
// Fetches graph layout snapshots from the MirrorGate Router and caches locally.

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { GraphSnapshot } from './graph.store';

const ROUTER_BASE = 'http://192.168.0.112:8097';
const CACHE_KEY = '@mirrorbrain/graph_layout_cache';
const CACHE_META_KEY = '@mirrorbrain/graph_layout_meta';

class GraphLayoutService {
  private cache: GraphSnapshot | null = null;

  async fetchLayout(
    scope: string = 'personal',
    preset: string = 'all',
  ): Promise<GraphSnapshot> {
    try {
      const url = `${ROUTER_BASE}/graph/layout?scope=${encodeURIComponent(scope)}&preset=${encodeURIComponent(preset)}`;
      const res = await fetch(url, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!res.ok) {
        throw new Error(`Router returned ${res.status}`);
      }

      const snapshot: GraphSnapshot = await res.json();
      this.cache = snapshot;

      // Persist to local storage for offline use
      await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(snapshot));
      await AsyncStorage.setItem(
        CACHE_META_KEY,
        JSON.stringify({
          scope,
          preset,
          cached_at: new Date().toISOString(),
          layout_hash: snapshot.meta.layout_hash,
          node_count: snapshot.nodes.length,
          edge_count: snapshot.edges.length,
        }),
      );

      console.log(
        `[GraphLayout] Fetched: ${snapshot.nodes.length} nodes, ${snapshot.edges.length} edges`,
      );
      return snapshot;
    } catch (err) {
      console.warn('[GraphLayout] Router fetch failed, trying cache:', err);
      return this.loadFromCache();
    }
  }

  async loadFromCache(): Promise<GraphSnapshot> {
    if (this.cache) return this.cache;

    const raw = await AsyncStorage.getItem(CACHE_KEY);
    if (raw) {
      const snapshot: GraphSnapshot = JSON.parse(raw);
      this.cache = snapshot;
      console.log(
        `[GraphLayout] Loaded from cache: ${snapshot.nodes.length} nodes`,
      );
      return snapshot;
    }

    // Return empty snapshot if nothing cached
    return {
      meta: {
        version: 'v1',
        scope: 'personal',
        created_at: new Date().toISOString(),
        layout_hash: 'empty',
      },
      nodes: [],
      edges: [],
    };
  }

  async getCacheMeta(): Promise<Record<string, string> | null> {
    const raw = await AsyncStorage.getItem(CACHE_META_KEY);
    return raw ? JSON.parse(raw) : null;
  }

  clearCache() {
    this.cache = null;
    AsyncStorage.removeItem(CACHE_KEY);
    AsyncStorage.removeItem(CACHE_META_KEY);
  }
}

export const graphLayoutService = new GraphLayoutService();
