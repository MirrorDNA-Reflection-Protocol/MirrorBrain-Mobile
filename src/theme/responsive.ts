/**
 * MirrorBrain Mobile — Responsive Scaling
 *
 * Normalizes layout across display size settings (small/medium/large/largest).
 * Android's "Display size" setting changes screen density, which affects
 * Dimensions.get('window') and pixel-based layouts.
 *
 * Usage:
 *   import { scale, fontScale, moderateScale } from '../theme/responsive';
 *   width: scale(16)         // scales linearly with screen width
 *   fontSize: fontScale(14)  // scales with font accessibility, capped
 *   padding: moderateScale(8, 0.5)  // scales at 50% rate (less aggressive)
 */

import { Dimensions, PixelRatio, Platform } from 'react-native';

// Design baseline: standard 390pt width (iPhone 14 / Pixel 7 at default density)
const BASE_WIDTH = 390;
const BASE_HEIGHT = 844;

const getScale = () => {
    const { width, height } = Dimensions.get('window');
    return width / BASE_WIDTH;
};

const getVerticalScale = () => {
    const { height } = Dimensions.get('window');
    return height / BASE_HEIGHT;
};

/**
 * Linear scale based on screen width ratio.
 * Use for horizontal spacing, widths, horizontal padding.
 */
export const scale = (size: number): number => {
    return Math.round(size * getScale());
};

/**
 * Linear scale based on screen height ratio.
 * Use for vertical spacing, heights, vertical padding.
 */
export const verticalScale = (size: number): number => {
    return Math.round(size * getVerticalScale());
};

/**
 * Moderate scale — scales at a reduced rate (default 50%).
 * Use for padding, margins, border radius — things that shouldn't
 * grow as aggressively as the screen.
 */
export const moderateScale = (size: number, factor: number = 0.5): number => {
    return Math.round(size + (scale(size) - size) * factor);
};

/**
 * Font scale — respects accessibility but caps at 1.3x to prevent overflow.
 * Use for all fontSize values.
 */
export const fontScale = (size: number): number => {
    const systemFontScale = Math.min(PixelRatio.getFontScale(), 1.3);
    const screenScale = getScale();
    // Blend screen scale and font scale, weighted toward font scale
    const blended = size * (0.4 * screenScale + 0.6 * systemFontScale);
    return Math.round(blended);
};

/**
 * Get current window dimensions (reactive — call inside components).
 */
export const getWindowDimensions = () => Dimensions.get('window');

/**
 * Check if device is in a "large display" mode.
 * Useful for conditional layouts.
 */
export const isLargeDisplay = (): boolean => {
    const { fontScale: fs } = Dimensions.get('window');
    return PixelRatio.getFontScale() > 1.15;
};

/**
 * Scale spacing tokens for current display.
 */
export const scaledSpacing = () => ({
    xs: moderateScale(4),
    sm: moderateScale(8),
    md: moderateScale(16),
    lg: moderateScale(24),
    xl: moderateScale(32),
    xxl: moderateScale(48),
});
