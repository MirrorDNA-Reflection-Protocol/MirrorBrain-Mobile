import React, { useRef, useEffect, useState, useCallback } from 'react';
import { View, StyleSheet, ActivityIndicator } from 'react-native';
import { WebView } from 'react-native-webview';
import { colors } from '../theme';

interface MirrorGraphProps {
    data: {
        nodes: Array<{ id: string; group: number }>;
        links: Array<{ source: string; target: string }>;
    };
    onNodePress?: (nodeId: string) => void;
}

export const MirrorGraph: React.FC<MirrorGraphProps> = ({ data, onNodePress }) => {
    const webviewRef = useRef<WebView>(null);
    const [isReady, setIsReady] = useState(false);

    // Injection logic
    const injectData = useCallback((graphData: any) => {
        if (webviewRef.current && graphData.nodes.length > 0) {
            console.log('[MirrorGraph] Injecting data:', graphData.nodes.length, 'nodes');
            const script = `
                if (typeof window.updateGraph === 'function') {
                    window.updateGraph(${JSON.stringify(graphData)});
                } else {
                    console.error('updateGraph not found');
                }
                true;
            `;
            webviewRef.current.injectJavaScript(script);
        }
    }, []);

    // Inject when data changes AND we are ready
    useEffect(() => {
        if (isReady && data.nodes.length > 0) {
            injectData(data);
        }
    }, [data, isReady, injectData]);

    const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
        <script src="file:///android_asset/d3.min.js"></script>
        <style>
            body { margin: 0; background-color: #000000; overflow: hidden; font-family: monospace; }
            canvas { display: block; width: 100vw; height: 100vh; }
            #loading { 
                position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); 
                color: #00ff88; font-size: 14px; text-align: center;
            }
            #debug {
                position: absolute; bottom: 10px; left: 10px; color: red; font-size: 10px; pointer-events: none;
            }
        </style>
    </head>
    <body>
        <div id="loading">INITIALIZING NEURAL LATTICE...<br><small id="status">Loading modules...</small></div>
        <div id="debug"></div>
        <canvas id="graphCanvas"></canvas>
        <script>
            // Error handling
            window.onerror = function(msg, url, line) {
                document.getElementById('debug').innerHTML += msg + '<br>';
                window.ReactNativeWebView.postMessage('ERROR: ' + msg);
            };

            const canvas = document.getElementById('graphCanvas');
            const ctx = canvas.getContext('2d');
            let width = window.innerWidth;
            let height = window.innerHeight;
            
            // Handle retina displays
            const dpr = window.devicePixelRatio || 1;
            canvas.width = width * dpr;
            canvas.height = height * dpr;
            ctx.scale(dpr, dpr);

            // LIVING CORTEX ENGINE
            let simulation, nodes, links, transform;
            let particles = []; // Neural Impulses
            let focusNode = null; // Spotlight Focus

            // Wait for full load to ensure D3 is ready
            window.onload = function() {
                if (typeof d3 === 'undefined') {
                    document.getElementById('status').innerText = 'D3 Load Failed';
                    window.ReactNativeWebView.postMessage('ERROR: D3 not loaded');
                } else {
                    document.getElementById('status').innerText = 'D3 Loaded. Waiting for data...';
                    transform = d3.zoomIdentity;
                    window.ReactNativeWebView.postMessage('READY');
                }
            };

            const COLORS = ['#00ff88', '#00ffff', '#ff00ff', '#ffff00', '#ff8800', '#ffffff']; 
            const COLOR_TEXT = 'rgba(255, 255, 255, 0.8)';

            // Telemetry
            setInterval(() => {
                window.ReactNativeWebView.postMessage('PULSE');
            }, 5000);

            let frameCount = 0;
            function initGraph(graphData) {
                try {
                    // Hide loading immediately
                    document.getElementById('loading').style.display = 'none';
                    window.ReactNativeWebView.postMessage('DEBUG: initGraph started');
                    
                    nodes = graphData.nodes.map(d => Object.create(d));
                    links = graphData.links.map(d => Object.create(d));

                    // Simulation setup...
                    // Simulation setup - SURGICALLY TIGHT
                    // Simulation: Tighter spine, loose thoughts
                    // Simulation: Tighter spine, loose thoughts
                    simulation = d3.forceSimulation(nodes)
                        .force("charge", d3.forceManyBody().strength(d => d.type === 'folder' ? -120 : -60)) // Stronger repulsion for clarity
                        .force("link", d3.forceLink(links).id(d => d.id).distance(d => d.type === 'structure' ? 35 : 80)) // More breathing room
                        .force("center", d3.forceCenter(width / 2, height / 2))
                        .force("collide", d3.forceCollide().radius(d => (d.radius || 5) + 5))
                        // Decoupled tick
                        .on("tick", () => {}); 

                    // Interactions
                    d3.select(canvas)
                        .call(d3.zoom()
                            .scaleExtent([0.1, 8])
                            .on("zoom", (event) => {
                                transform = event.transform;
                            })
                        )
                        .on("click", handleInput);

                    // Start Living Loop
                    requestAnimationFrame(renderLoop);
                    
                } catch (e) {
                    window.ReactNativeWebView.postMessage('ERROR: ' + e.message);
                }
            }

            function handleInput(event) {
                const [x, y] = d3.pointer(event);
                const tx = (x - transform.x) / transform.k;
                const ty = (y - transform.y) / transform.k;
                
                // 1. Ripple Effect (Visual Burst)
                for(let i=0; i<8; i++) {
                    const angle = (Math.PI * 2 * i) / 8;
                    particles.push({
                        x: tx, y: ty,
                        vx: Math.cos(angle) * 2, vy: Math.sin(angle) * 2,
                        life: 1.0, color: '#ffffff', type: 'ripple'
                    });
                }

                let clicked = null;
                let minDist = 40; // Generous hit box
                
                for (const n of nodes) {
                    const dx = tx - n.x;
                    const dy = ty - n.y;
                    const dist = Math.sqrt(dx*dx + dy*dy);
                    if (dist < Math.max((n.radius || 5) + 15, 20) && dist < minDist) {
                        minDist = dist;
                        clicked = n;
                    }
                }

                if (clicked) {
                    if (focusNode === clicked) {
                        focusNode = null;
                        flyTo(width/2, height/2, 1); // Reset view
                    } else {
                        focusNode = clicked;
                        // 2. Cinematic Camera Pan
                        flyTo(clicked.x, clicked.y, 2.5);
                    }
                    window.ReactNativeWebView.postMessage('CLICK:' + clicked.id);
                } else {
                    focusNode = null;
                }
            }

            // Cinematic Camera FlyTo
            function flyTo(targetX, targetY, targetK) {
                const transform_ = d3.zoomIdentity
                    .translate(width / 2, height / 2)
                    .scale(targetK)
                    .translate(-targetX, -targetY);

                d3.select(canvas).transition()
                    .duration(1000) // 1 second smooth glide
                    .call(d3.zoom().transform, transform_);
            }

            function renderLoop(time) {
                if (!ctx) return;
                
                // 1. Fade
                ctx.save();
                ctx.clearRect(0, 0, width, height);
                ctx.translate(transform.x, transform.y);
                ctx.scale(transform.k, transform.k);
                
                // View Culling
                const viewX = -transform.x / transform.k;
                const viewW = width / transform.k;

                // 2. Impulses
                if (Math.random() < 0.1) {
                    const link = links[Math.floor(Math.random() * links.length)];
                    particles.push({ l: link, t: 0, speed: link.type === 'structure' ? 0.02 : 0.01 });
                }

                // 3. Draw Links & Particles
                ctx.globalCompositeOperation = 'lighter';
                links.forEach(l => {
                    if (l.source.x < viewX - 100 || l.source.x > viewX + viewW + 100) return;
                    let isDim = focusNode && (l.source !== focusNode && l.target !== focusNode);
                    
                    ctx.beginPath();
                    ctx.moveTo(l.source.x, l.source.y);
                    ctx.lineTo(l.target.x, l.target.y);
                    ctx.lineWidth = isDim ? 0.2 : (l.type === 'structure' ? 1.5 : 0.8);
                    ctx.strokeStyle = l.type==='structure' 
                        ? (isDim ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.2)')
                        : (isDim ? 'rgba(0,255,136,0.05)' : 'rgba(0,255,136,0.3)');
                    ctx.stroke();
                });

                // Particles (Impulses + Ripples)
                ctx.fillStyle = '#ffffff';
                for (let i = particles.length - 1; i >= 0; i--) {
                    const p = particles[i];
                    
                    if (p.type === 'ripple') {
                        // Ripple Logic
                        p.x += p.vx;
                        p.y += p.vy;
                        p.life -= 0.05;
                        if (p.life <= 0) { particles.splice(i, 1); continue; }
                        
                        ctx.globalAlpha = p.life;
                        ctx.beginPath(); ctx.arc(p.x, p.y, 3 * (1.1 - p.life) * 4, 0, 6.28); ctx.fill();
                        ctx.globalAlpha = 1.0;
                    } else {
                        // Impulse Logic
                        p.t += p.speed;
                        if (p.t >= 1) { particles.splice(i, 1); continue; }
                        if (focusNode && p.l.source !== focusNode && p.l.target !== focusNode) continue;
                        
                        const x = p.l.source.x + (p.l.target.x - p.l.source.x) * p.t;
                        const y = p.l.source.y + (p.l.target.y - p.l.source.y) * p.t;
                        ctx.beginPath(); ctx.arc(x, y, 1.5, 0, 6.28); ctx.fill();
                    }
                }

                // 4. Draw Nodes (Breathing)
                ctx.globalCompositeOperation = 'source-over';
                nodes.forEach(d => {
                    if (d.x < viewX - 50 || d.x > viewX + viewW + 50) return;
                    
                    let isDim = focusNode && d !== focusNode && !isConnected(d, focusNode);
                    if (!d.breathOffset) d.breathOffset = Math.random() * 100;
                    
                    const breath = Math.sin((time / 200) + d.breathOffset) * 2;
                    const r = (d.radius||5) + (d.type === 'folder' ? 0 : breath * 0.5);

                    ctx.beginPath();
                    ctx.moveTo(d.x + r, d.y);
                    ctx.arc(d.x, d.y, r, 0, 6.28);
                    
                    if (d.type === 'folder') {
                        ctx.strokeStyle = isDim ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.8)';
                        ctx.lineWidth = 2;
                        ctx.fillStyle = 'rgba(0,0,0,0.9)';
                        ctx.stroke(); ctx.fill();
                    } else {
                        const color = COLORS[(d.group - 1) % COLORS.length] || COLORS[0];
                        ctx.fillStyle = isDim ? '#444' : color;
                        if (!isDim) {
                            ctx.shadowBlur = 10 + breath; 
                            ctx.shadowColor = color;
                        } else {
                            ctx.shadowBlur = 0;
                        }
                        ctx.fill();
                        ctx.shadowBlur = 0;
                    }
                });

                // 5. Labels
                drawLabels(transform);
                
                ctx.restore();
                requestAnimationFrame(renderLoop);
            }

            function isConnected(n1, n2) {
                return links.some(l => (l.source === n1 && l.target === n2) || (l.source === n2 && l.target === n1));
            }
            
            function drawLabels(t) {

                if (t.k > 0.8) {
                    ctx.textAlign = "center";
                    const fontSize = Math.max(10, Math.min(16, 10 * t.k));
                    ctx.font = "bold " + fontSize + "px Arial"; 

                    const visibleNodes = nodes.filter(d => {
                        // Spotlight Mode
                        if (focusNode) {
                            return d === focusNode || isConnected(d, focusNode);
                        }
                        // Normal Mode
                        if (d.type === 'folder') return true;
                        if (t.k > 3) return true;
                        if (t.k > 1.5 && d.degree > 2) return true;
                        return d.degree > 5;
                    });

                    visibleNodes.forEach(d => {
                        let label = d.label || d.id;
                        if (label.startsWith('dir_')) label = label.split('/').pop();
                        
                        ctx.lineWidth = 3;
                        ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)';
                        ctx.strokeText(label, d.x, d.y + (d.radius||5) + fontSize + 2);
                        ctx.fillStyle = '#ffffff';
                        ctx.fillText(label, d.x, d.y + (d.radius||5) + fontSize + 2);
                    });
                }
            }

            window.updateGraph = function(data) {
                if(data && data.nodes && data.nodes.length > 0) {
                    initGraph(data);
                }
            };

            // Initial READY signal
            window.ReactNativeWebView.postMessage('READY');
        </script>
    </body>
    </html>
    `;

    if (!data.nodes) {
        // Initial loading state
        return null;
    }

    return (
        <WebView
            ref={webviewRef}
            source={{ html: htmlContent, baseUrl: 'file:///android_asset/' }}
            style={styles.webview}
            onMessage={(event) => {
                const msg = event.nativeEvent.data;
                if (msg === 'READY') {
                    console.log('[MirrorGraph] WebView READY - sending data');
                    setIsReady(true);
                } else if (msg.startsWith('CLICK:')) {
                    if (onNodePress) onNodePress(msg.substring(6));
                } else if (msg.startsWith('ERROR:')) {
                    console.error('[MirrorGraph WebView]', msg);
                }
            }}
            originWhitelist={['*']}
            javaScriptEnabled={true}
            domStorageEnabled={true}
            allowFileAccess={true}
            allowUniversalAccessFromFileURLs={true}
            allowFileAccessFromFileURLs={true}
            startInLoadingState={true}
            renderLoading={() => (
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color={colors.accent} />
                </View>
            )}
        />
    );
};

const styles = StyleSheet.create({
    webview: {
        flex: 1,
        backgroundColor: '#000000',
    },
    loadingContainer: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: '#000000',
        justifyContent: 'center',
        alignItems: 'center',
    },
});
