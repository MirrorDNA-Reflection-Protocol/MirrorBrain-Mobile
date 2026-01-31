/**
 * Active Mirror Logo Component
 *
 * Renders the logo as an Image with optional glow effect.
 */

import React from 'react';
import { View, Image, StyleSheet, ViewStyle } from 'react-native';

interface LogoProps {
    size?: number;
    style?: ViewStyle;
    showGlow?: boolean;
}

export const Logo: React.FC<LogoProps> = ({
    size = 48,
    style,
    showGlow = false
}) => {
    return (
        <View style={[styles.container, { width: size, height: size }, style]}>
            {showGlow && (
                <View style={[styles.glow, { width: size * 1.5, height: size * 1.5 }]} />
            )}
            <Image
                source={require('../assets/logo.png')}
                style={{ width: size, height: size }}
                resizeMode="contain"
            />
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        alignItems: 'center',
        justifyContent: 'center',
    },
    glow: {
        position: 'absolute',
        backgroundColor: 'rgba(245, 158, 11, 0.15)',
        borderRadius: 999,
    },
});

export default Logo;
