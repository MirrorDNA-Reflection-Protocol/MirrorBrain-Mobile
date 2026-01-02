/**
 * MirrorBrain Mobile — Color Palette
 * From Spec Part XVII: Design Language
 * 
 * Dark by default (OLED-friendly, matches GrapheneOS)
 * Minimal color — accent for interactive elements only
 */

export const colors = {
    // Backgrounds
    background: '#0a0a0f',       // Deep dark, not pure black
    surface: '#121218',          // Cards, panels
    surfaceElevated: '#1a1a22',  // Elevated surfaces

    // Text
    textPrimary: '#f0f0f5',      // Main text
    textSecondary: '#a0a0b0',    // Subtle text
    textMuted: '#606070',        // Very subtle

    // Accent (Indigo gradient matching activemirror.ai)
    accentPrimary: '#6366f1',    // Indigo-500
    accentLight: '#818cf8',      // Indigo-400
    accentDark: '#4f46e5',       // Indigo-600

    // Semantic
    online: '#22c55e',           // Green - network active
    offline: '#71717a',          // Zinc - network inactive
    warning: '#f59e0b',          // Amber
    error: '#ef4444',            // Red (used sparingly)
    success: '#10b981',          // Emerald

    // Glyphs
    glyphTruth: '#a5b4fc',       // ⟡ identity, truth, anchor
    glyphDecision: '#fbbf24',    // △ decision, action
    glyphPattern: '#c4b5fd',     // ◈ pattern, memory
    glyphSynthesis: '#67e8f9',   // ⧉ synthesis, connection

    // Overlay
    overlay: 'rgba(0, 0, 0, 0.7)',
    overlayLight: 'rgba(255, 255, 255, 0.05)',
} as const;

// Gradient definitions for accent
export const gradients = {
    accent: ['#6366f1', '#4f46e5'],
    accentButton: ['#818cf8', '#6366f1'],
    surface: ['#121218', '#0a0a0f'],
} as const;

export type ColorKey = keyof typeof colors;
