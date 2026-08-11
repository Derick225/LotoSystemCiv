/**
 * Moteur de retour haptique (vibrations)
 * Utilisé pour ancrer physiquement l'application de prédiction dans les mains de l'utilisateur.
 */
export const hapticEngine = {
    /**
     * Vérifie si l'API de vibration est disponible et autorisée par l'interaction utilisateur
     */
    isSupported: (): boolean => {
        if (typeof navigator === 'undefined' || !('vibrate' in navigator)) return false;
        if (typeof navigator.userActivation !== 'undefined' && !navigator.userActivation.hasBeenActive) {
            return false;
        }
        return true;
    },

    /**
     * Vibration très courte et douce (ex: clic, sélection)
     */
    tap: () => {
        if (hapticEngine.isSupported()) {
            try {
                navigator.vibrate(10);
            } catch (e) {
                // Ignore vibration errors if blocked by browser policy
            }
        }
    },

    /**
     * Double tap (ex: succès d'une petite action)
     */
    doubleTap: () => {
        if (hapticEngine.isSupported()) {
            try {
                navigator.vibrate([10, 50, 10]);
            } catch (e) {
                // Ignore
            }
        }
    },

    /**
     * Lourd et lent (Alerte, erreur ou événement massif)
     */
    heavy: () => {
        if (hapticEngine.isSupported()) {
            try {
                navigator.vibrate([40, 20, 40]);
            } catch (e) {
                // Ignore
            }
        }
    },

    /**
     * Sensation de calcul profond (Ex: Pendant la prédiction)
     */
    processing: () => {
        if (hapticEngine.isSupported()) {
            try {
                // Pattern rappelant un "battement de cœur" irrégulier d'un processeur
                navigator.vibrate([10, 30, 15, 30, 8, 30, 20]);
            } catch (e) {
                // Ignore
            }
        }
    },

    /**
     * Énorme succès (Quand une prédiction complète est sortie)
     */
    successImpact: () => {
        if (hapticEngine.isSupported()) {
            try {
                navigator.vibrate([20, 40, 60, 40, 20, 10, 100]);
            } catch (e) {
                // Ignore
            }
        }
    }
};
