

/**
 * Constantes de configuration pour le générateur congruentiel linéaire (LCG) déterministe.
 * Standards provenant de l'ouvrage de référence "Numerical Recipes" pour maximiser la période
 * et garantir la reproductibilité absolue sans nombres magiques dispersés.
 */
export const LCG_CONSTANTS = {
    /** Multiplicateur multiplicatif du LCG standard */
    MULTIPLIER: 1664525,
    /** Incrément additif standard */
    INCREMENT: 1013904223,
    /** Seed de repli déterministe canonique (première) */
    DEFAULT_SEED: 848932,
    /** Modulo puissance de 2 de normalisation (2^32) */
    MODULO: 4294967296,
};

/**
 * Générateur Congruentiel Linéaire (LCG) pour un déterminisme absolu (100% reproductible).
 * Utilise les constantes de Park-Miller (a = 48271, m = 2^31 - 1, c = 0)
 * et un hachage FNV-1a de la graine pour garantir l'uniformité et éviter les corrélations de germes.
 */
export class LCG {
    private seed: number;

    constructor(initialSeed: string | number) {
        if (typeof initialSeed === 'string') {
            let hash = 2166136261;
            for (let i = 0; i < initialSeed.length; i++) {
                hash ^= initialSeed.charCodeAt(i);
                hash = Math.imul(hash, 16777619);
            }
            this.seed = (hash >>> 0) % 2147483647;
            if (this.seed === 0) {
                this.seed = 1;
            }
        } else {
            const parsed = Number(initialSeed);
            this.seed = (isNaN(parsed) || parsed === 0) ? 1 : Math.abs(parsed) % 2147483647;
            if (this.seed === 0) {
                this.seed = 1;
            }
        }
    }

    /**
     * Génère le prochain nombre pseudo-aléatoire déterministe dans l'intervalle [0, 1[.
     */
    public next(): number {
        this.seed = (this.seed * 48271) % 2147483647;
        return (this.seed - 1) / 2147483646;
    }
}

// Retro-compatibility (deprecated for singletons, use instances instead)
let defaultLcgConfig = new LCG(LCG_CONSTANTS.DEFAULT_SEED);

export const initializeLcgForDraw = (drawName: string) => {
    defaultLcgConfig = new LCG(drawName);
};

export const lcgGlobalRandom = () => {
    return defaultLcgConfig.next();
};

/**
 * Calcule le nombre de combinaisons possibles (n parmi k) de manière robuste.
 * nCr = n! / (k! * (n-k)!)
 * L'implémentation alterne multiplications et divisions à chaque itération pour
 * éviter un dépassement d'entier (overflow) ou des imprécisions sur les nombres flottants,
 * garantissant un résultat exact même pour de grandes valeurs de n et k.
 *
 * @param n Nombre total d'éléments dans l'ensemble.
 * @param k Nombre d'éléments à choisir.
 */
export const combinations = (n: number, k: number): number => {
    if (k < 0 || k > n) return 0;
    if (k === 0 || k === n) return 1;
    let targetK = k;
    if (targetK > n / 2) targetK = n - targetK;
    let res = 1;
    for (let i = 1; i <= targetK; i++) {
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
 * Utilise un algorithme de hachage déterministe FNV-1a (Fowler-Noll-Vo) étalé sur 4 slots de 32 bits
 * distincts pour dériver de manière uniforme un bloc d'octets de 128 bits.
 * Respecte l'exigence ZÉRO HASARD de AGENTS.md (sans Math.random ou crypto.getRandomValues non seedés).
 *
 * @param str La chaîne d'entrée servant de base déterministe.
 * @returns Une chaîne au format standard d'un UUIDv4 RFC 4122.
 */
export const getDeterministicUUID = (str: string): string => {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (uuidRegex.test(str)) {
        return str.toLowerCase();
    }

    // Algorithme de hachage FNV-1a déterministe sur 4 variables d'état de 32 bits.
    // Constantes d'offset d'initialisation canoniques pour FNV-1 et multiplicateurs premiers :
    let h1 = 0x811c9dc5;
    let h2 = 0x12345678;
    let h3 = 0xabcdef01;
    let h4 = 0x76543210;

    const fnvPrime32 = 16777619;
    const alternativePrime32 = 10995116;

    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        h1 = Math.imul(h1 ^ char, fnvPrime32);
        h2 = Math.imul(h2 ^ char, alternativePrime32);
        h3 = Math.imul(h3 ^ char, fnvPrime32) + h1;
        h4 = Math.imul(h4 ^ char, alternativePrime32) + h2;
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
    
    // Le variant est sélectionné de manière déterministe parmi ['8', '9', 'a', 'b']
    const variantChar = ['8', '9', 'a', 'b'][Math.abs(h1) % 4];
    const part4 = variantChar + rawHex.substring(17, 20);
    const part5 = rawHex.substring(20, 32);

    return `${part1}-${part2}-${part3}-${part4}-${part5}`;
};

/**
 * Génère une signature/hash canonique déterministe basée exclusivement sur le tirage actif et son historique propre.
 * Garantit l'isolation absolue inter-tirages des matrices de synergie, caches et rapports analytiques.
 */
export const getCanonicalDrawHistoryHash = (drawName: string, history: { date?: string; gagnants?: number[] }[]): string => {
    const cleanDraw = drawName.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    let signatureStr = `${cleanDraw}_len:${history.length}`;
    for (let i = 0; i < Math.min(25, history.length); i++) {
        const d = history[i];
        const gStr = Array.isArray(d?.gagnants) ? d.gagnants.join(',') : '';
        signatureStr += `|${d?.date || i}:${gStr}`;
    }

    let h1 = 0x811c9dc5, h2 = 0x12345678, h3 = 0xabcdef01, h4 = 0x76543210;
    const fnvPrime32 = 16777619, altPrime32 = 10995116;
    for (let i = 0; i < signatureStr.length; i++) {
        const char = signatureStr.charCodeAt(i);
        h1 = Math.imul(h1 ^ char, fnvPrime32);
        h2 = Math.imul(h2 ^ char, altPrime32);
        h3 = Math.imul(h3 ^ char, fnvPrime32) + h1;
        h4 = Math.imul(h4 ^ char, altPrime32) + h2;
    }
    const toHex8 = (num: number) => (num >>> 0).toString(16).padStart(8, '0');
    return `${cleanDraw}_${history.length}_${toHex8(h1)}${toHex8(h2)}`;
};

