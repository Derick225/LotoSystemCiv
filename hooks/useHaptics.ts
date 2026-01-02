
import { useCallback } from 'react';
import { Capacitor } from '@capacitor/core';
// Import dynamique pour éviter les erreurs SSR ou build si Capacitor n'est pas installé
// Dans un vrai projet, on installerait @capacitor/haptics

export const useHaptics = () => {
    const vibrate = useCallback(async (style: 'light' | 'medium' | 'heavy' | 'success' | 'error' = 'medium') => {
        try {
            // Fallback Web API
            if (!Capacitor.isNativePlatform()) {
                if (navigator.vibrate) {
                    switch (style) {
                        case 'light': navigator.vibrate(10); break;
                        case 'medium': navigator.vibrate(40); break;
                        case 'heavy': navigator.vibrate(70); break;
                        case 'success': navigator.vibrate([30, 30, 30]); break;
                        case 'error': navigator.vibrate([50, 50, 50, 50]); break;
                    }
                }
                return;
            }

            // Ici on utiliserait Haptics.impact({ style }) si @capacitor/haptics était présent
            // Pour l'instant on utilise le fallback web qui fonctionne souvent sur mobile web
            if (navigator.vibrate) navigator.vibrate(20);

        } catch (e) {
            // Ignore haptics error
        }
    }, []);

    return { vibrate };
};
