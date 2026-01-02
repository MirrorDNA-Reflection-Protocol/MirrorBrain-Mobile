/**
 * Weather Service — Local Weather Data
 * 
 * Offline-first weather with optional API refresh.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

export interface WeatherData {
    temperature: number;
    condition: 'sunny' | 'cloudy' | 'partly_cloudy' | 'rainy' | 'stormy' | 'snowy' | 'foggy';
    humidity?: number;
    location?: string;
    updatedAt: Date;
}

const WEATHER_CACHE_KEY = '@mirrorbrain/weather';
const CACHE_DURATION = 60 * 60 * 1000; // 1 hour

class WeatherServiceClass {
    private cached: WeatherData | null = null;

    /**
     * Get current weather (cached or fresh)
     */
    async getWeather(): Promise<WeatherData> {
        // Check memory cache
        if (this.cached) {
            const age = Date.now() - this.cached.updatedAt.getTime();
            if (age < CACHE_DURATION) {
                return this.cached;
            }
        }

        // Check storage cache
        try {
            const stored = await AsyncStorage.getItem(WEATHER_CACHE_KEY);
            if (stored) {
                const data = JSON.parse(stored);
                data.updatedAt = new Date(data.updatedAt);
                const age = Date.now() - data.updatedAt.getTime();
                if (age < CACHE_DURATION) {
                    this.cached = data;
                    return data;
                }
            }
        } catch (error) {
            console.warn('Weather cache read failed:', error);
        }

        // Return mock weather (real implementation would fetch from API)
        // Using Open-Meteo (free, no API key) or wttr.in
        return this.getMockWeather();
    }

    /**
     * Get mock weather based on time of day
     */
    private getMockWeather(): WeatherData {
        const hour = new Date().getHours();

        // Simulate weather based on time
        let temp: number;
        let condition: WeatherData['condition'];

        if (hour >= 6 && hour < 12) {
            temp = 24 + Math.floor(Math.random() * 4);
            condition = 'sunny';
        } else if (hour >= 12 && hour < 17) {
            temp = 28 + Math.floor(Math.random() * 5);
            condition = 'partly_cloudy';
        } else if (hour >= 17 && hour < 21) {
            temp = 25 + Math.floor(Math.random() * 3);
            condition = 'partly_cloudy';
        } else {
            temp = 22 + Math.floor(Math.random() * 3);
            condition = 'cloudy';
        }

        return {
            temperature: temp,
            condition,
            humidity: 60 + Math.floor(Math.random() * 20),
            location: 'Goa',
            updatedAt: new Date(),
        };
    }

    /**
     * Format weather for display
     */
    format(weather: WeatherData): string {
        const icon = this.getIcon(weather.condition);
        return `${weather.temperature}°C ${icon}`;
    }

    /**
     * Get weather icon
     */
    getIcon(condition: WeatherData['condition']): string {
        const icons: Record<WeatherData['condition'], string> = {
            sunny: '☀️',
            partly_cloudy: '⛅',
            cloudy: '☁️',
            rainy: '🌧️',
            stormy: '⛈️',
            snowy: '🌨️',
            foggy: '🌫️',
        };
        return icons[condition];
    }

    /**
     * Get condition text
     */
    getConditionText(condition: WeatherData['condition']): string {
        const text: Record<WeatherData['condition'], string> = {
            sunny: 'Sunny',
            partly_cloudy: 'Partly cloudy',
            cloudy: 'Cloudy',
            rainy: 'Rainy',
            stormy: 'Stormy',
            snowy: 'Snowy',
            foggy: 'Foggy',
        };
        return text[condition];
    }

    /**
     * Refresh weather from API (placeholder)
     */
    async refresh(): Promise<WeatherData> {
        // TODO: Implement actual API call to Open-Meteo or wttr.in
        // For now, just get mock data
        const weather = this.getMockWeather();

        // Cache it
        this.cached = weather;
        try {
            await AsyncStorage.setItem(WEATHER_CACHE_KEY, JSON.stringify(weather));
        } catch (error) {
            console.warn('Weather cache write failed:', error);
        }

        return weather;
    }
}

// Singleton export
export const WeatherService = new WeatherServiceClass();

export default WeatherService;
