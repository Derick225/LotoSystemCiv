
import { LOTTERY_CONSTANTS } from "../services/lotteryService";

/**
 * Prend un tableau de nombres (ou de chaînes de nombres) et retourne un tableau de nombres uniques triés.
 * Sécurité : Filtre exclusivement les numéros dans l'intervalle légal [1, LOTTERY_CONSTANTS.TOTAL_NUMBERS].
 * @param numbers - Le tableau d'entrée.
 * @returns Un tableau de nombres uniques, filtrés et triés.
 */
export const getUniqueSortedNumbers = (numbers: (string | number | null | undefined)[]): number[] => {
    const uniqueNumbers = new Set<number>();
    for (const n of numbers) {
        if (n === null || n === undefined || String(n).trim() === '') continue;
        
        const num = Number(n);
        // Validation stricte du spectre Loto (1-90)
        if (!isNaN(num) && Number.isFinite(num) && num >= 1 && num <= LOTTERY_CONSTANTS.TOTAL_NUMBERS) {
            uniqueNumbers.add(Math.floor(num));
        }
    }
    return Array.from(uniqueNumbers).sort((a, b) => a - b);
};

/**
 * Assure une isolation hermétique totale en éliminant tout tirage
 * ne correspondant pas au nom de tirage spécifié (TIRAGE ISOLATION RULE).
 * 
 * NOTE DE CONCEPTION (RÈGLE D'ISOLATION) :
 * L'utilisation de `normalize("NFD").replace(/[\u0300-\u036f]/g, "")` décompose les caractères accentués 
 * en leurs glyphes de base et supprime les marques diacritiques. Cela garantit une comparaison 
 * insensible aux accents et à la casse d'une manière déterministe, protégeant le système contre les 
 * divergences d'encodage de texte des plateformes d'import/export de l'historique de loterie.
 */
export const purifyHistoryForDraw = <T extends { drawName?: string; draw_name?: string }>(drawName: string, history: T[]): T[] => {
    if (!history || !Array.isArray(history)) return [];
    const normalizedTarget = drawName.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    if (normalizedTarget === "all_combined" || normalizedTarget === "all") {
        return history;
    }
    const purified = history.reduce((acc: T[], d: any) => {
        const name = d.drawName || d.draw_name;
        if (!name) {
            // Fix corrupted items from cache by forcing the correct drawName
            acc.push({ ...d, drawName, draw_name: drawName } as T);
        } else if (name === drawName) {
            acc.push({ ...d, drawName: name, draw_name: name } as T);
        } else {
            const nameStr = String(name).trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
            if (nameStr === normalizedTarget || normalizedTarget.includes(nameStr) || nameStr.includes(normalizedTarget)) {
                acc.push({ ...d, drawName: name, draw_name: name } as T);
            }
        }
        return acc;
    }, []);

    return purified;
};

/**
 * Valide et assainit un historique de tirages importé.
 * Élimine les doublons, trie chronologiquement (descendant) et applique une validation stricte (1-90, 5 numéros uniques).
 * Gère de manière robuste les formats de dates hétérogènes sans lever d'exceptions.
 */
export const validateAndSanitizeImportedHistory = (
    rawData: unknown,
    targetDrawName: string
): { success: boolean; validData: any[]; errors: string[] } => {
    const errors: string[] = [];
    const validData: any[] = [];
    
    if (!rawData || !Array.isArray(rawData)) {
        return { success: false, validData: [], errors: ["Les données importées doivent être sous forme de tableau."] };
    }

    const seenDates = new Set<string>();
    const seenIds = new Set<string>();

    for (let idx = 0; idx < rawData.length; idx++) {
        const item = rawData[idx];
        if (typeof item !== "object" || item === null) {
            errors.push(`Ligne ${idx + 1} : Format invalide (doit être un objet).`);
            continue;
        }

        const dateStr = String(item.date || "").trim();
        if (!dateStr) {
            errors.push(`Ligne ${idx + 1} : Date manquante.`);
            continue;
        }

        // Extraction et validation des gagnants
        const winnersRaw = Array.isArray(item.gagnants) ? item.gagnants : [];
        const uniqueWinners = getUniqueSortedNumbers(winnersRaw);

        if (uniqueWinners.length !== LOTTERY_CONSTANTS.NUMBERS_PER_DRAW) {
            errors.push(`Ligne ${idx + 1} (${dateStr}) : Doit contenir exactement ${LOTTERY_CONSTANTS.NUMBERS_PER_DRAW} numéros uniques entre 1 et ${LOTTERY_CONSTANTS.TOTAL_NUMBERS}. Trouvé : [${uniqueWinners.join(", ")}]`);
            continue;
        }

        // Validation optionnelle des numéros machine
        const machineRaw = Array.isArray(item.machine) ? item.machine : [];
        const validatedMachine = getUniqueSortedNumbers(machineRaw);

        // Clé unique pour éliminer les doublons
        if (seenDates.has(dateStr)) {
            // Ignorer silencieusement ou avertir pour le doublon de date
            continue;
        }

        const id = String(item.id || `${targetDrawName}_${dateStr.replace(/[^0-9]/g, "")}_${uniqueWinners.join("_")}`);
        if (seenIds.has(id)) {
            continue;
        }

        seenDates.add(dateStr);
        seenIds.add(id);

        validData.push({
            id,
            drawName: targetDrawName,
            date: dateStr,
            gagnants: uniqueWinners,
            machine: validatedMachine.length > 0 ? validatedMachine : undefined
        });
    }

    /**
     * Analyseur de date robuste pour formats hétérogènes (ISO vs JJ/MM/AAAA vs JJ-MM-AAAA)
     * sans risque d'effondrement ou de rejet silencieux.
     */
    const parseDate = (dStr: string): number => {
        if (!dStr) return 0;
        
        // Détecter séparateurs (Slashes ou Tirets) pour formats de type JJ/MM/AAAA ou JJ-MM-AAAA
        const separator = dStr.includes("/") ? "/" : (dStr.includes("-") && dStr.indexOf("-") < 4 ? "-" : null);
        if (separator) {
            const parts = dStr.split(separator);
            if (parts.length === 3) {
                const day = parseInt(parts[0], 10);
                const month = parseInt(parts[1], 10) - 1;
                const year = parseInt(parts[2], 10);
                if (!isNaN(day) && !isNaN(month) && !isNaN(year)) {
                    return new Date(year, month, day).getTime();
                }
            }
        }
        
        // Format ISO AAAA-MM-JJ ou AAAA/MM/JJ
        const isoMatch = dStr.match(/^(\d{4})[-/](\d{2})[-/](\d{2})/);
        if (isoMatch) {
            const year = parseInt(isoMatch[1], 10);
            const month = parseInt(isoMatch[2], 10) - 1;
            const day = parseInt(isoMatch[3], 10);
            if (!isNaN(year) && !isNaN(month) && !isNaN(day)) {
                return new Date(year, month, day).getTime();
            }
        }
        
        const parsed = new Date(dStr).getTime();
        return isNaN(parsed) ? 0 : parsed;
    };

    // Tri chronologique descendant (plus récent d'abord)
    validData.sort((a, b) => {
        return parseDate(b.date) - parseDate(a.date);
    });

    return {
        success: validData.length > 0,
        validData,
        errors
    };
};

/**
 * Calcule l'autocorrélation de décalage 1 (Lag-1 Autocorrelation) d'une série temporelle.
 * Formule standard rigoureuse : \rho(1) = Cov(X_t, X_{t-1}) / Var(X_t)
 * = \frac{\sum_{t=2}^{N} (X_t - \mu)(X_{t-1} - \mu)}{\sum_{t=1}^{N} (X_t - \mu)^2}
 * 
 * @param series Série numérique continue à analyser.
 * @returns Coefficient d'autocorrélation entre -1.0 et 1.0 (ou 0.0 si la variance est nulle ou taille < 2).
 */
export const calculateAutocorrelationLag1 = (series: number[]): number => {
    const n = series.length;
    if (n < 2) return 0.0;

    const mean = series.reduce((a, b) => a + b, 0) / n;

    let numerator = 0.0;
    let denominator = 0.0;

    for (let i = 0; i < n; i++) {
        const diff = series[i] - mean;
        denominator += diff * diff;
        if (i >= 1) {
            const prevDiff = series[i - 1] - mean;
            numerator += diff * prevDiff;
        }
    }

    if (denominator <= Number.EPSILON) {
        return 0.0; // Pas de variance, pas d'autocorrélation possible
    }

    return numerator / denominator;
};
