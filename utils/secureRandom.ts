/**
 * Générateur de nombres pseudo-aléatoires cryptographiquement sûr.
 * Remplace Math.random() pour éliminer les biais stochastiques dans le moteur de prédiction.
 */
export function secureRandom(): number {
    const cryptoObj = typeof crypto !== 'undefined' ? crypto : (typeof window !== 'undefined' ? window.crypto : null);
    
    if (cryptoObj && cryptoObj.getRandomValues) {
        const array = new Uint32Array(1);
        cryptoObj.getRandomValues(array);
        return array[0] / 4294967296; // Divise par le maximum de Uint32 + 1 pour avoir [0, 1)
    }
    
    console.warn("L'API Web Crypto n'est pas disponible. Utilisation de Math.random() (dégradé).");
    return Math.random();
}
