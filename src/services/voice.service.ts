/**
 * Voice Service — Recording and Transcription
 * From Spec Part VI
 * 
 * Record audio → Transcribe locally with Whisper → Save to Vault
 * 
 * NOTE: whisper.rn integration is a placeholder.
 * For a working implementation, install: npm install whisper.rn
 * and download whisper-tiny.bin model (~39MB)
 */

import { PermissionsAndroid, Platform } from 'react-native';
import RNFS from 'react-native-fs';
import { STORAGE_PATHS } from './vault.service';

// Placeholder for whisper.rn - install separately
// import { initWhisper, WhisperContext } from 'whisper.rn';

interface RecordingState {
    isRecording: boolean;
    filePath: string | null;
    startTime: Date | null;
}

class VoiceServiceClass {
    private state: RecordingState = {
        isRecording: false,
        filePath: null,
        startTime: null,
    };

    private hasPermission: boolean = false;
    // private whisperContext: WhisperContext | null = null;

    /**
     * Request microphone permission
     */
    async requestPermission(): Promise<boolean> {
        if (Platform.OS !== 'android') {
            // iOS handles permissions differently
            this.hasPermission = true;
            return true;
        }

        try {
            const granted = await PermissionsAndroid.request(
                PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
                {
                    title: 'Microphone Permission',
                    message: 'MirrorBrain needs microphone access for voice capture.',
                    buttonNeutral: 'Ask Later',
                    buttonNegative: 'Cancel',
                    buttonPositive: 'OK',
                }
            );

            this.hasPermission = granted === PermissionsAndroid.RESULTS.GRANTED;
            return this.hasPermission;
        } catch (error) {
            console.error('Failed to request mic permission:', error);
            return false;
        }
    }

    /**
     * Check if Whisper model exists
     */
    async hasWhisperModel(): Promise<boolean> {
        const modelPath = this.getWhisperModelPath();
        return await RNFS.exists(modelPath);
    }

    /**
     * Get Whisper model path
     */
    getWhisperModelPath(): string {
        return `${STORAGE_PATHS.ROOT}/${STORAGE_PATHS.MODELS}/whisper-tiny.bin`;
    }

    /**
     * Start recording audio
     */
    async startRecording(): Promise<boolean> {
        if (this.state.isRecording) {
            console.warn('Already recording');
            return false;
        }

        if (!this.hasPermission) {
            const granted = await this.requestPermission();
            if (!granted) {
                console.error('Microphone permission denied');
                return false;
            }
        }

        try {
            const voiceDir = `${STORAGE_PATHS.ROOT}/${STORAGE_PATHS.CAPTURES_VOICE}`;
            await RNFS.mkdir(voiceDir);

            const filename = `voice-${Date.now()}.wav`;
            const filePath = `${voiceDir}/${filename}`;

            // TODO: Implement actual recording with react-native-audio-api or similar
            // For now, just track state
            this.state = {
                isRecording: true,
                filePath,
                startTime: new Date(),
            };

            console.log('Recording started:', filePath);
            return true;
        } catch (error) {
            console.error('Failed to start recording:', error);
            return false;
        }
    }

    /**
     * Stop recording and return file path
     */
    async stopRecording(): Promise<string | null> {
        if (!this.state.isRecording) {
            console.warn('Not recording');
            return null;
        }

        try {
            // TODO: Stop actual recording
            const filePath = this.state.filePath;

            this.state = {
                isRecording: false,
                filePath: null,
                startTime: null,
            };

            console.log('Recording stopped:', filePath);
            return filePath;
        } catch (error) {
            console.error('Failed to stop recording:', error);
            return null;
        }
    }

    /**
     * Transcribe audio file using Whisper
     */
    async transcribe(audioPath: string): Promise<string | null> {
        try {
            // Check if model exists
            const hasModel = await this.hasWhisperModel();
            if (!hasModel) {
                console.error('Whisper model not found. Download whisper-tiny.bin first.');
                return null;
            }

            // TODO: Implement with whisper.rn when installed
            // const modelPath = this.getWhisperModelPath();
            // this.whisperContext = await initWhisper({ filePath: modelPath });
            // const result = await this.whisperContext.transcribe(audioPath);
            // return result.text;

            // Placeholder
            console.log('Transcription would happen here for:', audioPath);
            return '[Whisper transcription - install whisper.rn to enable]';
        } catch (error) {
            console.error('Transcription failed:', error);
            return null;
        }
    }

    /**
     * Check recording state
     */
    isRecording(): boolean {
        return this.state.isRecording;
    }

    /**
     * Get recording duration in seconds
     */
    getRecordingDuration(): number {
        if (!this.state.isRecording || !this.state.startTime) {
            return 0;
        }
        return Math.floor((Date.now() - this.state.startTime.getTime()) / 1000);
    }
}

// Singleton export
export const VoiceService = new VoiceServiceClass();

export default VoiceService;
