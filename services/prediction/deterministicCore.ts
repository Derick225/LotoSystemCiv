export const LCG_A = 1664525;
export const LCG_C = 1013904223;
export const LCG_M = Math.pow(2, 32);

/**
 * Générateur Congruentiel Linéaire (LCG) pur, 100% déterministe basé sur un seed.
 */
export class DeterministicSeededGenerator {
    private state: number;

    constructor(seedString: string | number) {
        this.state = this.hashString(String(seedString));
    }

    private hashString(str: string): number {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            hash = (hash << 5) - hash + str.charCodeAt(i);
            hash |= 0;
        }
        return Math.abs(hash);
    }

    /**
     * Retourne une valeur déterministe continue entre 0.0 et 1.0 (exclusive)
     */
    public nextFloat(): number {
        this.state = (LCG_A * this.state + LCG_C) % LCG_M;
        return this.state / LCG_M;
    }
}

/**
 * Mapping continu: Fonction sigmoïde standard.
 * Remplace les seuils binaires "if (x > threshold)" par un gradient continu entre 0 et 1.
 */
export const sigmoid = (curr: number, center: number = 0, k: number = 1): number => {
    return 1 / (1 + Math.exp(-k * (curr - center)));
};

/**
 * Calcul de la vraie médiane d'une série continue, 100% reproductible.
 */
export const calculateMedian = (values: number[]): number => {
    if (!values || values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    if (sorted.length % 2 === 0) {
        return (sorted[mid - 1] + sorted[mid]) / 2.0;
    }
    return sorted[mid];
};

/**
 * Fonction Mathématique Continue : Probabilité de densité Gaussienne (PDF)
 * Permet d'atténuer les écarts sans "nombres magiques".
 */
export const gaussianPDF = (x: number, mean: number = 0, variance: number = 1): number => {
    if (variance <= 0) return 0;
    return (1 / Math.sqrt(2 * Math.PI * variance)) * Math.exp(-Math.pow(x - mean, 2) / (2 * variance));
};

/**
 * Lissage de Laplace pour prioriser les données observées d'une Loi Multinomiale (sans constante zéro ou div by zero).
 * Retourne le tableau des scores lissés.
 */
export const laplaceSmooth = (counts: number[], priorPoints: number = 1.0): number[] => {
    const K = counts.length;
    const sum = counts.reduce((a, b) => a + b, 0);
    return counts.map(c => (c + priorPoints) / (sum + K * priorPoints));
};

/**
 * Entropie de Shannon pour un vecteur de probabilités continues.
 */
export const calculateShannonEntropy = (probabilities: number[]): number => {
    return -probabilities.reduce((sum, p) => {
        if (p <= 0) return sum;
        return sum + p * Math.log2(p);
    }, 0);
};

/**
 * Mapping d'étalement : Softmax sur un vecteur de tenseurs sans utiliser `Math.random()`.
 */
export const softmax = (logits: number[]): number[] => {
    const maxLogit = Math.max(...logits);
    const scaled = logits.map(v => Math.exp(v - maxLogit)); // stabilité numérique
    const sum = scaled.reduce((a, b) => a + b, 0);
    return scaled.map(v => v / sum);
};
