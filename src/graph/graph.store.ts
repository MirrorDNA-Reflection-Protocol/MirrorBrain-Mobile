// graph.store.ts
// Lightweight in-memory store with viewport querying + nearest-node hit testing.

export type GraphNode = {
  id: string;
  title: string;
  path?: string | null;
  type?: string | null;
  tags?: string[];
  mtime?: number | null;
  clusterId?: string | null;
  size?: number | null;
  colorKey?: string | null;
  x: number;
  y: number;
};

export type GraphEdge = {
  sourceId: string;
  targetId: string;
  weight?: number | null;
  type?: string | null;
};

export type GraphMeta = {
  version: string;
  tenant_id?: string | null;
  scope: 'personal' | 'team' | 'commercial';
  preset?: string | null;
  created_at: string;
  source_hash?: string | null;
  layout_hash: string;
};

export type GraphSnapshot = {
  meta: GraphMeta;
  nodes: GraphNode[];
  edges: GraphEdge[];
};

export type Viewport = {
  xMin: number;
  yMin: number;
  xMax: number;
  yMax: number;
};

export class GraphStore {
  private nodesById = new Map<string, GraphNode>();
  private edges: GraphEdge[] = [];
  private adjacency = new Map<string, string[]>();
  public meta: GraphMeta | null = null;

  load(snapshot: GraphSnapshot) {
    this.meta = snapshot.meta;
    this.nodesById.clear();
    this.edges = snapshot.edges || [];
    this.adjacency.clear();

    for (const n of snapshot.nodes || []) {
      this.nodesById.set(n.id, n);
      this.adjacency.set(n.id, []);
    }
    for (const e of this.edges) {
      const a = e.sourceId;
      const b = e.targetId;
      if (this.adjacency.has(a)) this.adjacency.get(a)!.push(b);
      if (this.adjacency.has(b)) this.adjacency.get(b)!.push(a);
    }
  }

  getNode(id: string) {
    return this.nodesById.get(id) || null;
  }

  getEdges() {
    return this.edges;
  }

  getNodesInViewport(vp: Viewport, limit = 20000): GraphNode[] {
    const out: GraphNode[] = [];
    for (const n of this.nodesById.values()) {
      if (n.x >= vp.xMin && n.x <= vp.xMax && n.y >= vp.yMin && n.y <= vp.yMax) {
        out.push(n);
        if (out.length >= limit) break;
      }
    }
    return out;
  }

  getNeighborIds(id: string, hops = 1, cap = 2000): Set<string> {
    const visited = new Set<string>();
    const q: Array<{ id: string; d: number }> = [{ id, d: 0 }];
    visited.add(id);

    while (q.length) {
      const cur = q.shift()!;
      if (cur.d >= hops) continue;
      const nbrs = this.adjacency.get(cur.id) || [];
      for (const nb of nbrs) {
        if (!visited.has(nb)) {
          visited.add(nb);
          if (visited.size >= cap) return visited;
          q.push({ id: nb, d: cur.d + 1 });
        }
      }
    }
    return visited;
  }
}
