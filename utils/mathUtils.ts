
/**
 * Calcule le nombre de combinaisons possibles (n parmi k).
 * nCr = n! / (k! * (n-k)!)
 */
export const combinations = (n: number, k: number): number => {
    if (k < 0 || k > n) return 0;
    if (k === 0 || k === n) return 1;
    if (k > n / 2) k = n - k;
    let res = 1;
    for (let i = 1; i <= k; i++) {
        res = (res * (n - i + 1)) / i;
    }
    return Math.round(res);
};

/**
 * Plus Grand Commun Diviseur (GCD)
 */
export const gcd = (a: number, b: number): number => {
    return b === 0 ? a : gcd(b, a % b);
};

/**
 * Plus Petit Commun Multiple (LCM)
 */
export const lcm = (a: number, b: number): number => {
    return (a * b) / gcd(a, b);
};

/**
 * Calcule la variance d'un tableau de nombres.
 */
export const variance = (arr: number[]): number => {
    if (arr.length === 0) return 0;
    const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
    return arr.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / arr.length;
};

/**
 * Calcule l'écart-type.
 */
export const stdDev = (arr: number[]): number => Math.sqrt(variance(arr));

/**
 * Mélange un tableau (Fisher-Yates) - Immutable
 */
export const shuffleArray = <T>(array: T[]): T[] => {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
};
