/**
 * Moteur de retour haptique (vibrations)
 * Utilisé pour ancrer physiquement l'application de prédiction dans les mains de l'utilisateur.
 */
export const hapticEngine = {
    /**
     * Vérifie si l'API de vibration est disponible
     */
    isSupported: (): boolean => {
        return typeof navigator !== 'undefined' && 'vibrate' in navigator;
    },

    /**
     * Vibration très courte et douce (ex: clic, sélection)
     */
    tap: () => {
        if (hapticEngine.isSupported()) {
            navigator.vibrate(10);
        }
    },

    /**
     * Double tap (ex: succès d'une petite action)
     */
    doubleTap: () => {
        if (hapticEngine.isSupported()) {
            navigator.vibrate([10, 50, 10]);
        }
    },

    /**
     * Lourd et lent (Alerte, erreur ou événement massif)
     */
    heavy: () => {
        if (hapticEngine.isSupported()) {
            navigator.vibrate([40, 20, 40]);
        }
    },

    /**
     * Sensation de calcul profond (Ex: Pendant la prédiction)
     */
    processing: () => {
        if (hapticEngine.isSupported()) {
            // Pattern rappelant un "battement de cœur" irrégulier d'un processeur
            navigator.vibrate([10, 30, 15, 30, 8, 30, 20]);
        }
    },

    /**
     * Énorme succès (Quand une prédiction complète est sortie)
     */
    successImpact: () => {
        if (hapticEngine.isSupported()) {
            navigator.vibrate([20, 40, 60, 40, 20, 10, 100]);
        }
    }
};
