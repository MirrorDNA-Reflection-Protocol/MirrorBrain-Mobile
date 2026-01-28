import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { GlassView } from './GlassView';
import { spacing } from '../theme';
import { WeatherService } from '../services';

interface WeatherData {
    temp: number;
    condition: string;
    high: number;
    low: number;
    location: string;
    icon: string;
}

export const WeatherWidget: React.FC = () => {
    const [weather, setWeather] = useState<WeatherData>({
        temp: 28,
        condition: 'Partly Cloudy',
        high: 32,
        low: 24,
        location: 'Goa',
        icon: '☀️'
    });

    useEffect(() => {
        loadWeather();
    }, []);

    const loadWeather = async () => {
        try {
            const data = await WeatherService.getWeather();
            if (data) {
                setWeather({
                    temp: Math.round(data.temperature),
                    condition: WeatherService.getConditionText(data.condition),
                    high: Math.round(data.temperature + 4),
                    low: Math.round(data.temperature - 4),
                    location: data.location || 'Goa',
                    icon: WeatherService.getIcon(data.condition)
                });
            }
        } catch {
            console.log('Weather: Using cached data');
        }
    };

    return (
        <GlassView style={styles.container} variant="prominent">
            <View style={styles.content}>
                {/* Location */}
                <View style={styles.header}>
                    <Text style={styles.location}>{weather.location}</Text>
                </View>

                {/* Large Temperature */}
                <Text style={styles.temp}>{weather.temp}°</Text>

                {/* Condition Row */}
                <View style={styles.bottomRow}>
                    <Text style={styles.icon}>{weather.icon}</Text>
                    <View style={styles.conditionInfo}>
                        <Text style={styles.condition}>{weather.condition}</Text>
                        <Text style={styles.range}>H:{weather.high}° L:{weather.low}°</Text>
                    </View>
                </View>
            </View>
        </GlassView>
    );
};

const styles = StyleSheet.create({
    container: {
        width: 160,
        height: 160,
    },
    content: {
        padding: spacing.md,
        flex: 1,
        justifyContent: 'space-between',
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
    },
    location: {
        fontSize: 13,
        fontWeight: '600',
        color: 'rgba(255, 255, 255, 0.9)',
        letterSpacing: 0.5,
    },
    temp: {
        fontSize: 52,
        fontWeight: '200',
        color: '#FFFFFF',
        marginTop: -4,
        includeFontPadding: false,
    },
    bottomRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    icon: {
        fontSize: 26,
        marginRight: spacing.sm,
    },
    conditionInfo: {
        flex: 1,
    },
    condition: {
        fontSize: 12,
        fontWeight: '600',
        color: 'rgba(255, 255, 255, 0.9)',
    },
    range: {
        fontSize: 11,
        color: 'rgba(255, 255, 255, 0.6)',
        marginTop: 2,
    },
});

