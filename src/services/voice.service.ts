/**
 * Voice Service — Recording and Transcription
 * Powered by ExecuTorch Whisper & LiveAudioStream
 * 
 * Flow:
 * 1. Record 16kHz Mono PCM via LiveAudioStream
 * 2. Buffer raw audio
 * 3. On stop, convert to Float32Array
 * 4. Transcribe via ExecuTorch SpeechToTextModule
 */

import { PermissionsAndroid, Platform, NativeEventEmitter } from 'react-native';
import RNFS from 'react-native-fs';
import LiveAudioStream from 'react-native-live-audio-stream';
import { Buffer } from 'buffer';
import { STORAGE_PATHS } from './vault.service';

// ExecuTorch imports
// We'll lazy import these to avoid crashes if native modules aren't linked yet
let SpeechToTextModule: any = null;
let WHISPER_TINY_EN: any = null;
let ResourceFetcher: any = null;

interface VoiceState {
    isRecording: boolean;
    isProcessing: boolean;
    modelLoaded: boolean;
}

class VoiceServiceClass {
    private state: VoiceState = {
        isRecording: false,
        isProcessing: false,
        modelLoaded: false,
    };

    private sttInstance: any = null;
    private audioBuffer: number[] = [];
    private hasPermission: boolean = false;

    constructor() {
        this.init();
    }

    private async init() {
        if (Platform.OS === 'android') {
            const granted = await PermissionsAndroid.check(
                PermissionsAndroid.PERMISSIONS.RECORD_AUDIO
            );
            this.hasPermission = granted;
        } else {
            this.hasPermission = true;
        }

        // Initialize Audio Stream
        LiveAudioStream.init({
            sampleRate: 16000,
            channels: 1,
            bitsPerSample: 16,
            audioSource: 6, // VOICE_RECOGNITION
            bufferSize: 4096,
        });

        LiveAudioStream.on('data', (data: string) => {
            if (this.state.isRecording) {
                this.processAudioData(data);
            }
        });
    }

    /**
     * Lazy load ExecuTorch dependencies
     */
    private async loadDependencies() {
        if (!SpeechToTextModule) {
            const ET = await import('react-native-executorch');
            SpeechToTextModule = ET.SpeechToTextModule;
            WHISPER_TINY_EN = ET.WHISPER_TINY_EN;
            ResourceFetcher = ET.ResourceFetcher;
        }
    }

    /**
     * Process incoming base64 audio chunk
     */
    private processAudioData(base64Data: string) {
        const buffer = Buffer.from(base64Data, 'base64');

        // Convert Int16 buffer to Float32 array (-1.0 to 1.0)
        // We push to temp array (not efficient for long recordings, but ok for voice commands)
        for (let i = 0; i < buffer.length; i += 2) {
            const int16 = buffer.readInt16LE(i);
            const float32 = int16 / 32768.0;
            this.audioBuffer.push(float32);
        }
    }

    /**
     * Request microphone permission
     */
    async requestPermission(): Promise<boolean> {
        if (Platform.OS !== 'android') return true;

        try {
            const granted = await PermissionsAndroid.request(
                PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
                {
                    title: 'Microphone Permission',
                    message: 'MirrorBrain needs microphone access for voice input.',
                    buttonNeutral: 'Ask Later',
                    buttonNegative: 'Cancel',
                    buttonPositive: 'OK',
                }
            );
            this.hasPermission = granted === PermissionsAndroid.RESULTS.GRANTED;
            return this.hasPermission;
        } catch (error) {
            console.error('Permission request failed:', error);
            return false;
        }
    }

    async isModelAvailable(): Promise<boolean> {
        await this.loadDependencies();
        // Check for key file presence
        // WHISPER_TINY_EN urls are opaque objects, but we can check if we downloaded them.
        // For simplicity, we assume if we have the monolithic 'whisper_tiny_en' dir in our models, it's good.
        // Actually, let's just rely on loadModel to fail nicely or succeed.
        // Or check a sentinel file.
        const modelPath = `${STORAGE_PATHS.ROOT}/${STORAGE_PATHS.MODELS}/whisper_tiny_en.sentinel`;
        return await RNFS.exists(modelPath);
    }

    async downloadModel(onProgress?: (progress: number) => void): Promise<boolean> {
        await this.loadDependencies();
        try {
            const modelConfig = WHISPER_TINY_EN;

            // Download all 3 parts using ResourceFetcher
            // We pass them all at once. ResourceFetcher calculates total progress.
            const result = await ResourceFetcher.fetch(
                (p: number) => onProgress?.(p),
                modelConfig.encoderSource,
                modelConfig.decoderSource,
                modelConfig.tokenizerSource
            );

            if (result) {
                // Create sentinel to mark success
                const sentinelPath = `${STORAGE_PATHS.ROOT}/${STORAGE_PATHS.MODELS}/whisper_tiny_en.sentinel`;
                if (!(await RNFS.exists(`${STORAGE_PATHS.ROOT}/${STORAGE_PATHS.MODELS}`))) {
                    await RNFS.mkdir(`${STORAGE_PATHS.ROOT}/${STORAGE_PATHS.MODELS}`);
                }
                await RNFS.writeFile(sentinelPath, 'true', 'utf8');
                return true;
            }
            return false;
        } catch (error) {
            console.error('Whisper download failed:', error);
            return false;
        }
    }

    /**
     * Load Whisper model into memory
     */
    async loadModel(): Promise<boolean> {
        if (this.state.modelLoaded && this.sttInstance) return true;

        await this.loadDependencies();

        try {
            this.sttInstance = new SpeechToTextModule();
            await this.sttInstance.load(WHISPER_TINY_EN);
            this.state.modelLoaded = true;
            console.log('Whisper model loaded');
            return true;
        } catch (error) {
            console.error('Failed to load Whisper:', error);
            return false;
        }
    }

    /**
     * Start Recording
     */
    async startRecording(): Promise<boolean> {
        if (this.state.isRecording) return false;

        if (!this.hasPermission) {
            const granted = await this.requestPermission();
            if (!granted) return false;
        }

        // Reset buffer
        this.audioBuffer = [];

        this.state.isRecording = true;
        LiveAudioStream.start();
        console.log('Voice recording started');
        return true;
    }

    /**
     * Stop Recording and Transcribe
     */
    async stopAndTranscribe(): Promise<string | null> {
        if (!this.state.isRecording) return null;

        try {
            LiveAudioStream.stop();
            this.state.isRecording = false;
            this.state.isProcessing = true;

            console.log(`Processing voice... ${this.audioBuffer.length} samples`);

            // Ensure model is loaded
            if (!this.sttInstance) {
                const loaded = await this.loadModel();
                if (!loaded) return null;
            }

            // Transcribe
            // ExecuTorch expects Float32Array
            const waveform = new Float32Array(this.audioBuffer);
            const result = await this.sttInstance.transcribe(waveform);

            this.state.isProcessing = false;
            console.log('Transcription result:', result);
            return result;

        } catch (error) {
            console.error('Transcription failed:', error);
            this.state.isProcessing = false;
            return null;
        }
    }

    /**
     * Cancel recording
     */
    async cancelRecording() {
        if (this.state.isRecording) {
            LiveAudioStream.stop();
            this.state.isRecording = false;
            this.audioBuffer = [];
        }
    }

    isRecording() {
        return this.state.isRecording;
    }

    isProcessing() {
        return this.state.isProcessing;
    }
}

export const VoiceService = new VoiceServiceClass();
export default VoiceService;
