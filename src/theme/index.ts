/**
 * MirrorBrain Mobile — Theme Index
 */

export * from './colors';
export * from './typography';
export * from './responsive';

import { moderateScale } from './responsive';

export const spacing = {
    xs: moderateScale(4),
    sm: moderateScale(8),
    md: moderateScale(16),
    lg: moderateScale(24),
    xl: moderateScale(32),
    xxl: moderateScale(48),
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
