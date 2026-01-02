
import { useEffect } from 'react';
import { useNexus } from '../components/NexusProvider';
import { useToast } from '../components/ui/Toast';
import { checkAndSyncRecentResults } from '../services/lotteryService';
import { audioEngine } from '../utils/audioEngine';

export const useKeyboardShortcuts = (
    toggleWallet: () => void,
    toggleSettings: () => void,
    setViewMode: (mode: 'home' | 'admin' | 'lab') => void
) => {
    const { showToast } = useToast();
    const { refreshData, currentDrawName } = useNexus();

    useEffect(() => {
        const handleKeyDown = async (e: KeyboardEvent) => {
            // Ignorer si on tape dans un input
            if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) return;

            // Combinaisons avec CTRL/CMD
            if (e.ctrlKey || e.metaKey) {
                switch(e.key.toLowerCase()) {
                    case 'k':
                        e.preventDefault();
                        toggleWallet();
                        audioEngine.play('click');
                        break;
                    case ',':
                        e.preventDefault();
                        toggleSettings();
                        audioEngine.play('click');
                        break;
                    case 'r':
                        // Bloquer le reload natif si shift n'est pas pressé, faire un soft refresh
                        if (!e.shiftKey) {
                            e.preventDefault();
                            if (currentDrawName) {
                                showToast("Rafraîchissement des données...", "info");
                                await refreshData(currentDrawName, true);
                                audioEngine.play('scan');
                            }
                        }
                        break;
                }
            } else {
                // Raccourcis simples
                switch(e.key.toLowerCase()) {
                    case 'h':
                        setViewMode('home');
                        audioEngine.play('click');
                        break;
                    case 'l':
                        setViewMode('lab');
                        audioEngine.play('click');
                        break;
                    case 's':
                        // Sync rapide
                        showToast("Synchronisation Cloud...", "info");
                        checkAndSyncRecentResults().then(c => {
                            if(c > 0) {
                                showToast(`${c} mises à jour.`, "success");
                                audioEngine.play('success');
                            }
                        });
                        break;
                    case 'escape':
                        // Fermer les modales (géré localement souvent, mais utile globalement)
                        break;
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [toggleWallet, toggleSettings, setViewMode, refreshData, currentDrawName]);
};
