
import { audioEngine } from '../utils/audioEngine';

export interface VoiceCommand {
    intent: 'ANALYZE_NUMBER' | 'PREDICT' | 'GET_SCORE' | 'NAVIGATE' | 'UNKNOWN';
    entity?: string | number;
    confidence: number;
}

export const VoiceService = {
    isSupported: (): boolean => {
        return 'webkitSpeechRecognition' in window || 'SpeechRecognition' in window;
    },

    startListening: (onResult: (text: string) => void, onError: (err: any) => void) => {
        const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (!SpeechRecognition) return null;

        const recognition = new SpeechRecognition();
        recognition.lang = 'fr-FR';
        recognition.continuous = false;
        recognition.interimResults = false;

        recognition.onstart = () => {
            audioEngine.play('click');
        };

        recognition.onresult = (event: any) => {
            const transcript = event.results[0][0].transcript;
            onResult(transcript);
        };

        recognition.onerror = (event: any) => {
            onError(event.error);
        };

        recognition.start();
        return recognition;
    },

    parseCommand: (text: string): VoiceCommand => {
        const lower = text.toLowerCase();

        // Analyse de nombre
        if (lower.includes('analyse') || lower.includes('inspecte') || lower.includes('détail')) {
            const match = lower.match(/\d+/);
            if (match) {
                return { intent: 'ANALYZE_NUMBER', entity: parseInt(match[0]), confidence: 0.9 };
            }
        }

        // Prédiction
        if (lower.includes('prédiction') || lower.includes('prédit') || lower.includes('tirage')) {
            return { intent: 'PREDICT', confidence: 0.9 };
        }

        // Score
        if (lower.includes('score') || lower.includes('probabilité')) {
            const match = lower.match(/\d+/);
            if (match) {
                return { intent: 'GET_SCORE', entity: parseInt(match[0]), confidence: 0.9 };
            }
        }

        return { intent: 'UNKNOWN', confidence: 0 };
    },

    speak: (text: string) => {
        if ('speechSynthesis' in window) {
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.lang = 'fr-FR';
            utterance.rate = 1.1;
            utterance.pitch = 1.0;
            window.speechSynthesis.speak(utterance);
        }
    }
};
