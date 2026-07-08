

export class LCG {
    private seed: number;

    constructor(initialSeed: string | number) {
        if (typeof initialSeed === 'string') {
            let hash = 0;
            for (let i = 0; i < initialSeed.length; i++) {
                const char = initialSeed.charCodeAt(i);
                hash = ((hash << 5) - hash) + char;
                hash = hash & hash;
            }
            this.seed = Math.abs(hash) || 848932;
        } else {
            this.seed = initialSeed || 848932;
        }
    }

    public next(): number {
        this.seed = (this.seed * 1664525 + 1013904223) >>> 0;
        return this.seed / 4294967296;
    }
}

// Retro-compatibility (deprecated for singletons, use instances instead)
let defaultLcgConfig = new LCG(848932);

export const initializeLcgForDraw = (drawName: string) => {
    defaultLcgConfig = new LCG(drawName);
};

export const lcgGlobalRandom = () => {
    return defaultLcgConfig.next();
};

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
        const j = Math.floor(lcgGlobalRandom() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
};

/**
 * Génère un UUID RFC 4122 v4 valide de manière 100% déterministe à partir d'une chaîne arbitraire.
 * Respecte l'exigence ZÉRO HASARD de AGENTS.md (sans Math.random ou crypto.getRandomValues non seedés).
 */
export const getDeterministicUUID = (str: string): string => {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (uuidRegex.test(str)) {
        return str.toLowerCase();
    }

    // Hachage FNV-1a déterministe sur 4 slots de 32 bits
    let h1 = 0x811c9dc5;
    let h2 = 0x12345678;
    let h3 = 0xabcdef01;
    let h4 = 0x76543210;

    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        h1 = Math.imul(h1 ^ char, 16777619);
        h2 = Math.imul(h2 ^ char, 10995116);
        h3 = Math.imul(h3 ^ char, 16777619) + h1;
        h4 = Math.imul(h4 ^ char, 10995116) + h2;
    }

    const toHex8 = (num: number) => {
        return (num >>> 0).toString(16).padStart(8, '0');
    };

    const hex1 = toHex8(h1);
    const hex2 = toHex8(h2);
    const hex3 = toHex8(h3);
    const hex4 = toHex8(h4);

    const rawHex = (hex1 + hex2 + hex3 + hex4).toLowerCase();

    // Formatage sous forme de UUID RFC 4122 standard : 8-4-4-4-12
    // Version 4 (4xxx) et Variant (8, 9, a ou b) forcés
    const part1 = rawHex.substring(0, 8);
    const part2 = rawHex.substring(8, 12);
    const part3 = '4' + rawHex.substring(13, 16);
    
    const variantChar = ['8', '9', 'a', 'b'][Math.abs(h1) % 4];
    const part4 = variantChar + rawHex.substring(17, 20);
    const part5 = rawHex.substring(20, 32);

    return `${part1}-${part2}-${part3}-${part4}-${part5}`;
};

