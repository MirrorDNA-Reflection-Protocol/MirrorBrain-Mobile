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
    feelsLike?: number;
    alerts?: string[];
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

        // Try real API first, fall back to mock
        try {
            return await this.refresh();
        } catch {
            return this.getMockWeather();
        }
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
     * Refresh weather from API
     */
    async refresh(): Promise<WeatherData> {
        try {
            // Fetch from Open-Meteo (Free, no key, Paul's location in Goa)
            const response = await fetch(
                'https://api.open-meteo.com/v1/forecast?latitude=15.2993&longitude=74.1240&current=temperature_2m,relative_humidity_2m,weather_code&timezone=Asia%2FKolkata'
            );

            if (!response.ok) {
                throw new Error(`Weather API returned ${response.status}`);
            }

            const data = await response.json();
            const current = data.current;

            const weather: WeatherData = {
                temperature: Math.round(current.temperature_2m),
                condition: this.mapWeatherCode(current.weather_code),
                humidity: current.relative_humidity_2m,
                location: 'Goa',
                updatedAt: new Date(),
            };

            // Cache it
            this.cached = weather;
            await AsyncStorage.setItem(WEATHER_CACHE_KEY, JSON.stringify(weather));

            console.log('Weather refreshed from API:', weather.temperature, '°C');
            return weather;
        } catch (error) {
            console.warn('Weather refresh failed, using mock fallback:', error);
            return this.getMockWeather();
        }
    }

    /**
     * Map WMO code to our internal condition
     */
    private mapWeatherCode(code: number): WeatherData['condition'] {
        if (code === 0) return 'sunny';
        if (code <= 3) return 'partly_cloudy';
        if (code <= 48) return 'foggy';
        if (code <= 57) return 'rainy';
        if (code <= 67) return 'rainy';
        if (code <= 77) return 'snowy';
        if (code <= 82) return 'rainy';
        if (code <= 86) return 'snowy';
        if (code >= 95) return 'stormy';
        return 'cloudy';
    }

    /**
     * Get current weather (alias for getWeather)
     * Used by BriefingService
     */
    async getCurrentWeather(): Promise<WeatherData> {
        return this.getWeather();
    }
}

// Singleton export
export const WeatherService = new WeatherServiceClass();

export default WeatherService;
