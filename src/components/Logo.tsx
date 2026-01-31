/**
 * Active Mirror Logo Component
 *
 * Animated logo with diamond frame, core block, and signal arcs.
 * Uses Reanimated for smooth ambient pulse.
 */

import React, { useEffect } from 'react';
import { View, Image, StyleSheet, ViewStyle } from 'react-native';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withRepeat,
    withTiming,
    Easing,
    interpolate,
} from 'react-native-reanimated';

interface LogoProps {
    size?: number;
    style?: ViewStyle;
    showGlow?: boolean;
    animated?: boolean;
}

export const Logo: React.FC<LogoProps> = ({
    size = 48,
    style,
    showGlow = false,
    animated = true,
}) => {
    const pulse = useSharedValue(0);

    useEffect(() => {
        if (animated) {
            pulse.value = withRepeat(
                withTiming(1, { duration: 4000, easing: Easing.inOut(Easing.ease) }),
                -1,
                true
            );
        }
    }, [animated, pulse]);

    const glowStyle = useAnimatedStyle(() => {
        const opacity = interpolate(pulse.value, [0, 0.5, 1], [0.4, 0.7, 0.4]);
        const scale = interpolate(pulse.value, [0, 0.5, 1], [1, 1.1, 1]);
        return {
            opacity,
            transform: [{ scale }],
        };
    });

    return (
        <View style={[styles.container, { width: size, height: size }, style]}>
            {showGlow && (
                <Animated.View
                    style={[
                        styles.glow,
                        { width: size * 1.5, height: size * 1.5 },
                        glowStyle,
                    ]}
                />
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
        backgroundColor: 'rgba(245, 158, 11, 0.2)',
        borderRadius: 999,
    },
});

export default Logo;
