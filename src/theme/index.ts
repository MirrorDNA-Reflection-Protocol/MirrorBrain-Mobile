/**
 * MirrorBrain Mobile — Theme Index
 */

export * from './colors';
export * from './typography';

export const spacing = {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
    xxl: 48,
} as const;

export const borderRadius = {
    sm: 4,
    md: 8,
    lg: 12,
    xl: 16,
    full: 9999,
} as const;

// Glyphs from spec (use sparingly, meaningfully)
export const glyphs = {
    truth: '⟡',      // identity, truth, anchor
    decision: '△',   // decision, action
    pattern: '◈',    // pattern, memory
    synthesis: '⧉',  // synthesis, connection
} as const;
