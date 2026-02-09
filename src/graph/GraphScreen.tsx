// GraphScreen.tsx
// Galaxy graph renderer using WebView Canvas2D.
// Layout is precomputed; phone only renders + filters.

import React, { useMemo, useRef } from 'react';
import { View, StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';
import type { GraphSnapshot, GraphNode } from './graph.store';

type Props = {
  snapshot: GraphSnapshot;
  onOpenNode?: (node: GraphNode) => void;
};

export default function GraphScreen({ snapshot, onOpenNode }: Props) {
  const webRef = useRef<WebView>(null);
  const html = useMemo(() => buildGalaxyHTML(snapshot), [snapshot]);

  return (
    <View style={styles.root}>
      <WebView
        ref={webRef}
        source={{ html }}
        style={styles.webview}
        scrollEnabled={false}
        bounces={false}
        overScrollMode="never"
        javaScriptEnabled
        originWhitelist={['*']}
        onMessage={(event) => {
          try {
            const msg = JSON.parse(event.nativeEvent.data);
            if (msg.type === 'nodePress' && onOpenNode) {
              const node = snapshot.nodes.find((n) => n.id === msg.id);
              if (node) onOpenNode(node);
            }
          } catch {}
        }}
      />
    </View>
  );
}

function buildGalaxyHTML(snapshot: GraphSnapshot): string {
  const nodesJSON = JSON.stringify(
    snapshot.nodes.map((n) => ({
      id: n.id,
      x: n.x,
      y: n.y,
      t: n.title,
      s: n.size || 1.2,
      c: n.colorKey || 'default',
      tp: n.type || '',
      p: n.path || '',
    }))
  );
  const edgesJSON = JSON.stringify(
    snapshot.edges.map((e) => ({ s: e.sourceId, t: e.targetId }))
  );

  return `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<style>
* { margin:0; padding:0; box-sizing:border-box; }
body { background:#000; overflow:hidden; touch-action:none; }
canvas { display:block; width:100vw; height:100vh; }
#hud { position:fixed; bottom:10px; left:10px; right:10px; color:rgba(255,255,255,0.6);
  font:11px monospace; background:rgba(0,0,0,0.55); padding:8px 12px; border-radius:10px;
  border:1px solid rgba(255,255,255,0.08); pointer-events:none; text-align:center; }
#zoomBtns { position:fixed; bottom:50px; right:14px; display:flex; flex-direction:column; gap:10px; z-index:10; }
#zoomBtns button { width:40px; height:40px; border-radius:20px; border:1px solid rgba(255,255,255,0.25);
  background:rgba(20,20,30,0.75); color:rgba(255,255,255,0.8); font-size:20px; font-weight:300;
  backdrop-filter:blur(4px); -webkit-backdrop-filter:blur(4px); }
</style>
</head>
<body>
<canvas id="c"></canvas>
<div id="hud">Tap a node</div>
<div id="zoomBtns"><button id="zIn">+</button><button id="zOut">\u2212</button></div>
<script>
const nodes = ${nodesJSON};
const edges = ${edgesJSON};
const W = window.innerWidth, H = window.innerHeight;
const dpr = window.devicePixelRatio || 1;
const c = document.getElementById('c');
c.width = W * dpr; c.height = H * dpr;
const ctx = c.getContext('2d');
ctx.scale(dpr, dpr);

// Build node lookup + adjacency
const nodeMap = {};
nodes.forEach(n => { nodeMap[n.id] = n; });
const adj = {};
edges.forEach(e => {
  if (!adj[e.s]) adj[e.s] = [];
  if (!adj[e.t]) adj[e.t] = [];
  adj[e.s].push(e.t);
  adj[e.t].push(e.s);
});

// Vibrant color palette based on path tier or type
const TIER_COLORS = [
  '#FF6B9D', // pink — 00_CANONICAL
  '#C084FC', // purple — 01_ACTIVE
  '#60A5FA', // blue — 02_OPERATIONAL
  '#34D399', // emerald — 03_MEMORY
  '#FBBF24', // amber — 04_REFERENCE
  '#F97316', // orange — 05_ARCHIVE
  '#38BDF8', // sky — 06_AGENTS
  '#A78BFA', // violet — 07_GOVERNANCE
  '#FB7185', // rose — other
];
const TYPE_COLORS = {
  folder: '#52D1FF',
  file: '#9CA3AF',
  default: '#9CA3AF',
};

function nodeColor(n) {
  // Try tier from path
  const p = n.p || '';
  const tierMatch = p.match(/\\/(0[0-7])_/);
  if (tierMatch) return TIER_COLORS[parseInt(tierMatch[1])] || TIER_COLORS[8];
  // Try type-based or hash-based color
  if (n.tp === 'folder') return '#52D1FF';
  // Deterministic color from id hash
  let h = 0;
  for (let i = 0; i < n.id.length; i++) h = ((h << 5) - h + n.id.charCodeAt(i)) | 0;
  const palette = ['#FF6B9D','#C084FC','#60A5FA','#34D399','#FBBF24','#F97316','#38BDF8','#A78BFA','#FB7185','#4ADE80','#F472B6','#22D3EE'];
  return palette[Math.abs(h) % palette.length];
}

// Pre-compute colors
nodes.forEach(n => { n._color = nodeColor(n); });

const PAL = {
  edge:'rgba(255,255,255,0.06)', edgeHot:'rgba(255,255,255,0.4)',
  dim:'rgba(255,255,255,0.08)', selected:'#FFFFFF'
};

// Auto-fit
let minX=1e9, maxX=-1e9, minY=1e9, maxY=-1e9;
nodes.forEach(n => { if(n.x<minX) minX=n.x; if(n.x>maxX) maxX=n.x; if(n.y<minY) minY=n.y; if(n.y>maxY) maxY=n.y; });
const gw = maxX-minX || 1, gh = maxY-minY || 1;
const fitScale = Math.min(W/gw, H/gh) * 0.8;
const gcx = (minX+maxX)/2, gcy = (minY+maxY)/2;

// Camera
let scale = fitScale, tx = W/2 - gcx*fitScale, ty = H/2 - gcy*fitScale;
let selectedId = null;
let neighborSet = new Set();

// Starfield
const stars = [];
let seed = 1337;
function rnd() { seed = (seed*9301+49297)%233280; return seed/233280; }
for (let i=0; i<400; i++) {
  stars.push({ x: rnd()*W, y: rnd()*H, r: 0.4+rnd()*1.0, a: 0.04+rnd()*0.10 });
}

function getNeighbors(id) {
  const s = new Set([id]);
  (adj[id]||[]).forEach(nb => s.add(nb));
  return s;
}

function draw() {
  ctx.clearRect(0, 0, W, H);
  // Dark gradient background
  const bg = ctx.createRadialGradient(W/2, H/2, 0, W/2, H/2, Math.max(W,H)*0.7);
  bg.addColorStop(0, '#0a0a18');
  bg.addColorStop(1, '#000005');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Stars
  stars.forEach(s => {
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, Math.PI*2);
    ctx.fillStyle = 'rgba(255,255,255,'+s.a+')';
    ctx.fill();
  });

  // Edges
  ctx.lineWidth = 0.5;
  const maxEdges = Math.min(edges.length, 35000);
  for (let i=0; i<maxEdges; i++) {
    const e = edges[i];
    const a = nodeMap[e.s], b = nodeMap[e.t];
    if (!a || !b) continue;
    const ax = a.x*scale+tx, ay = a.y*scale+ty;
    const bx = b.x*scale+tx, by = b.y*scale+ty;
    if (ax<-50 && bx<-50) continue;
    if (ax>W+50 && bx>W+50) continue;
    if (ay<-50 && by<-50) continue;
    if (ay>H+50 && by>H+50) continue;
    const hot = selectedId && (e.s===selectedId || e.t===selectedId || (neighborSet.has(e.s) && neighborSet.has(e.t)));
    if (hot) {
      ctx.strokeStyle = PAL.edgeHot;
      ctx.lineWidth = 1.5;
    } else {
      // Colored edges — blend source/target colors
      ctx.strokeStyle = PAL.edge;
      ctx.lineWidth = 0.5;
    }
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.stroke();
  }

  // Nodes
  const maxNodes = Math.min(nodes.length, 12000);
  for (let i=0; i<maxNodes; i++) {
    const n = nodes[i];
    const px = n.x*scale+tx, py = n.y*scale+ty;
    if (px<-20 || px>W+20 || py<-20 || py>H+20) continue;
    const isSel = selectedId===n.id;
    const isNbr = neighborSet.has(n.id);
    const dim = selectedId && !isSel && !isNbr;
    const color = isSel ? PAL.selected : dim ? PAL.dim : n._color;
    const r = n.s * Math.max(0.8, Math.min(3.5, scale*0.7));

    // Glow for larger nodes
    if (r > 2.5 && !dim) {
      ctx.beginPath();
      ctx.arc(px, py, r*2.5, 0, Math.PI*2);
      ctx.fillStyle = n._color.replace(')', ',0.08)').replace('rgb(', 'rgba(');
      // Simple glow approximation
      const gc = ctx.createRadialGradient(px, py, 0, px, py, r*2.5);
      gc.addColorStop(0, n._color + '22');
      gc.addColorStop(1, 'transparent');
      ctx.fillStyle = gc;
      ctx.fill();
    }

    // Selection halo
    if (isSel) {
      ctx.beginPath();
      ctx.arc(px, py, r+12, 0, Math.PI*2);
      ctx.strokeStyle = 'rgba(255,255,255,0.3)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    ctx.beginPath();
    ctx.arc(px, py, r, 0, Math.PI*2);
    ctx.fillStyle = color;
    ctx.fill();
  }

  // Labels
  const labelThreshold = fitScale * 1.5;
  if (scale >= labelThreshold) {
    ctx.font = '10px -apple-system, sans-serif';
    const sorted = [...nodes].sort((a,b) => (b.s||1)-(a.s||1));
    const maxLabels = Math.min(80, sorted.length);
    for (let i=0; i<maxLabels; i++) {
      const n = sorted[i];
      const px = n.x*scale+tx, py = n.y*scale+ty;
      if (px<-50 || px>W+50 || py<-50 || py>H+50) continue;
      const dim = selectedId && selectedId!==n.id && !neighborSet.has(n.id);
      ctx.fillStyle = dim ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.80)';
      ctx.fillText(n.t, px+8, py-6);
    }
  }

  requestAnimationFrame(draw);
}
draw();

// Gesture handling
let touches = {};
let lastDist = 0;
let isTap = true;

c.addEventListener('touchstart', e => {
  e.preventDefault();
  isTap = e.touches.length === 1;
  for (let t of e.changedTouches) touches[t.identifier] = { x: t.clientX, y: t.clientY };
  if (e.touches.length === 2) {
    const t0 = e.touches[0], t1 = e.touches[1];
    lastDist = Math.hypot(t1.clientX-t0.clientX, t1.clientY-t0.clientY);
  }
}, { passive: false });

c.addEventListener('touchmove', e => {
  e.preventDefault();
  isTap = false;
  if (e.touches.length === 1) {
    const t = e.touches[0], prev = touches[t.identifier];
    if (prev) { tx += t.clientX-prev.x; ty += t.clientY-prev.y; touches[t.identifier] = { x: t.clientX, y: t.clientY }; }
  } else if (e.touches.length === 2) {
    const t0 = e.touches[0], t1 = e.touches[1];
    const dist = Math.hypot(t1.clientX-t0.clientX, t1.clientY-t0.clientY);
    const midX = (t0.clientX+t1.clientX)/2, midY = (t0.clientY+t1.clientY)/2;
    const newScale = Math.max(0.1, Math.min(50, scale * dist / lastDist));
    tx = midX - (midX - tx) * (newScale / scale);
    ty = midY - (midY - ty) * (newScale / scale);
    scale = newScale;
    lastDist = dist;
    for (let t of e.changedTouches) touches[t.identifier] = { x: t.clientX, y: t.clientY };
  }
}, { passive: false });

c.addEventListener('touchend', e => {
  e.preventDefault();
  for (let t of e.changedTouches) {
    if (isTap && e.touches.length === 0) {
      const sx = t.clientX, sy = t.clientY;
      let best = null, bestD = 1e18;
      const hitR = 22*22;
      for (const n of nodes) {
        const px = n.x*scale+tx, py = n.y*scale+ty;
        const d2 = (px-sx)*(px-sx)+(py-sy)*(py-sy);
        if (d2 < bestD) { bestD = d2; best = n; }
      }
      if (best && bestD <= hitR) {
        selectedId = best.id;
        neighborSet = getNeighbors(best.id);
        document.getElementById('hud').textContent = best.t;
        window.ReactNativeWebView.postMessage(JSON.stringify({ type:'nodePress', id: best.id }));
      } else {
        selectedId = null; neighborSet = new Set();
        document.getElementById('hud').textContent = 'Tap a node';
      }
    }
    delete touches[t.identifier];
  }
}, { passive: false });

// Zoom buttons
function zoomAt(factor) {
  const newScale = Math.max(0.1, Math.min(50, scale * factor));
  tx = W/2 - (W/2 - tx) * (newScale / scale);
  ty = H/2 - (H/2 - ty) * (newScale / scale);
  scale = newScale;
}
document.getElementById('zIn').addEventListener('click', function(e) { e.stopPropagation(); zoomAt(2.0); });
document.getElementById('zOut').addEventListener('click', function(e) { e.stopPropagation(); zoomAt(0.5); });
</script>
</body>
</html>`;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: 'black' },
  webview: { flex: 1, backgroundColor: 'black' },
});
