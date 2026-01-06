
import { useState, useEffect, useCallback } from 'react';
import { useNexus } from '../components/NexusProvider';
import { useToast } from '../components/ui/Toast';
import { audioEngine } from '../utils/audioEngine';

export interface VoiceCommandState {
    isListening: boolean;
    lastTranscript: string;
    error: string | null;
}

export const useVoiceControl = (
    navigate: (view: 'home' | 'lab' | 'admin') => void,
    toggleWallet: (show: boolean) => void,
    triggerGeneration?: () => void
) => {
    const { showToast } = useToast();
    const { refreshData, currentDrawName } = useNexus();
    
    const [isListening, setIsListening] = useState(false);
    const [transcript, setTranscript] = useState('');
    const [recognition, setRecognition] = useState<any>(null);

    useEffect(() => {
        if (typeof window !== 'undefined') {
            const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
            
            if (SpeechRecognition) {
                const reco = new SpeechRecognition();
                reco.continuous = true; // Écoute continue
                reco.interimResults = false;
                reco.lang = 'fr-FR';
                
                reco.onstart = () => setIsListening(true);
                reco.onend = () => setIsListening(false);
                
                reco.onresult = (event: any) => {
                    const last = event.results.length - 1;
                    const text = event.results[last][0].transcript.trim().toLowerCase();
                    setTranscript(text);
                    processCommand(text);
                };

                setRecognition(reco);
            }
        }
    }, []);

    const processCommand = useCallback((cmd: string) => {
        console.log("Voice Command:", cmd);

        // Commandes de Navigation
        if (cmd.includes('station') || cmd.includes('accueil') || cmd.includes('home')) {
            navigate('home');
            feedback('Retour à la station.');
        }
        else if (cmd.includes('labo') || cmd.includes('quantum') || cmd.includes('analyse')) {
            navigate('lab');
            feedback('Ouverture du Laboratoire.');
        }
        else if (cmd.includes('admin') || cmd.includes('système')) {
            navigate('admin');
            feedback('Accès Système.');
        }
        
        // Commandes d'Action
        else if (cmd.includes('portefeuille') || cmd.includes('wallet') || cmd.includes('ticket')) {
            toggleWallet(true);
            feedback('Portefeuille ouvert.');
        }
        else if (cmd.includes('fermer') || cmd.includes('retour')) {
            toggleWallet(false);
            feedback('Fermeture.');
        }
        else if (cmd.includes('scan') || cmd.includes('actualiser') || cmd.includes('refresh')) {
            if (currentDrawName) {
                refreshData(currentDrawName, true);
                feedback('Scan du flux en cours.');
            }
        }
        else if (cmd.includes('génère') || cmd.includes('magique') || cmd.includes('calcul')) {
            if (triggerGeneration) {
                triggerGeneration();
                feedback('Génération vectorielle lancée.');
            } else {
                showToast("Commande indisponible ici.", "info");
            }
        }
    }, [navigate, toggleWallet, refreshData, currentDrawName, triggerGeneration]);

    const feedback = (msg: string) => {
        showToast(msg, 'success');
        audioEngine.play('click');
    };

    const toggleListening = () => {
        if (!recognition) {
            showToast("Reconnaissance vocale non supportée.", "error");
            return;
        }
        if (isListening) {
            recognition.stop();
            audioEngine.play('click');
        } else {
            recognition.start();
            audioEngine.play('scan');
            showToast("Écoute active...", "info");
        }
    };

    return { isListening, transcript, toggleListening };
};
