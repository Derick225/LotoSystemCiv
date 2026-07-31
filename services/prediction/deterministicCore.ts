export const LCG_A = 1664525;
export const LCG_C = 1013904223;
export const LCG_M = Math.pow(2, 32);

/**
 * Standardized Park-Miller Linear Congruential Generator (LCG)
 * Constants: a = 48271, m = 2^31 - 1 (2147483647), c = 0.
 * To ensure reproducibility across backtesting and simulations.
 */
export class ParkMillerLCG {
    private state: number;

    constructor(seedString: string | number) {
        let hash = 2166136261;
        const str = String(seedString);
        for (let i = 0; i < str.length; i++) {
            hash ^= str.charCodeAt(i);
            hash = Math.imul(hash, 16777619);
        }
        this.state = (hash >>> 0) % 2147483647;
        if (this.state === 0) {
            this.state = 1;
        }
    }

    /**
     * Returns a float in [0.0, 1.0)
     */
    public nextFloat(): number {
        this.state = (this.state * 48271) % 2147483647;
        return (this.state - 1) / 2147483646;
    }
}

/**
 * Générateur Congruentiel Linéaire (LCG) pur, 100% déterministe basé sur un seed.
 * Utilise un algorithme de hachage non-collisionnel FNV-1a (32-bit) pour garantir
 * la distribution uniforme de la graine d'initialisation (seed).
 */
export class DeterministicSeededGenerator {
    private state: number;

    constructor(seedString: string | number) {
        this.state = this.hashString(String(seedString));
    }

    /**
     * Algorithme de hachage FNV-1a 32-bit déterministe.
     */
    private hashString(str: string): number {
        let hash = 2166136261;
        for (let i = 0; i < str.length; i++) {
            hash ^= str.charCodeAt(i);
            hash = Math.imul(hash, 16777619);
        }
        return (hash >>> 0);
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
 * Inclut une protection stricte contre les divisions par zéro et les valeurs aberrantes.
 * 
 * @param x Valeur d'évaluation.
 * @param mean Moyenne empirique (µ).
 * @param variance Variance empirique (σ²).
 */
export const gaussianPDF = (x: number, mean: number = 0, variance: number = 1): number => {
    const safeVariance = Math.max(Number.EPSILON, variance);
    return (1 / Math.sqrt(2 * Math.PI * safeVariance)) * Math.exp(-Math.pow(x - mean, 2) / (2 * safeVariance));
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
