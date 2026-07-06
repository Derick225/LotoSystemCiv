
/**
 * Prend un tableau de nombres (ou de chaînes de nombres) et retourne un tableau de nombres uniques triés.
 * Sécurité : Filtre exclusivement les numéros dans l'intervalle légal [1, 90].
 * @param numbers - Le tableau d'entrée.
 * @returns Un tableau de nombres uniques, filtrés et triés.
 */
export const getUniqueSortedNumbers = (numbers: (string | number | null | undefined)[]): number[] => {
    const uniqueNumbers = new Set<number>();
    for (const n of numbers) {
        if (n === null || n === undefined || String(n).trim() === '') continue;
        
        const num = Number(n);
        // Validation stricte du spectre Loto (1-90)
        if (!isNaN(num) && Number.isFinite(num) && num >= 1 && num <= 90) {
            uniqueNumbers.add(Math.floor(num));
        }
    }
    return Array.from(uniqueNumbers).sort((a, b) => a - b);
};

/**
 * Assure une isolation hermétique totale en éliminant tout tirage
 * ne correspondant pas au nom de tirage spécifié (TIRAGE ISOLATION RULE).
 */
export const purifyHistoryForDraw = <T extends { drawName?: string; draw_name?: string }>(drawName: string, history: T[]): T[] => {
    if (!history || !Array.isArray(history)) return [];
    const normalizedTarget = drawName.trim().toLowerCase();
    if (normalizedTarget === "all_combined" || normalizedTarget === "all") {
        return history;
    }
    const purified = history.reduce((acc: T[], d: any) => {
        const name = d.drawName || d.draw_name;
        if (!name) {
            // Fix corrupted items from cache by forcing the correct drawName
            acc.push({ ...d, drawName, draw_name: drawName } as T);
        } else {
            const nameStr = String(name).trim().toLowerCase();
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

        if (uniqueWinners.length !== 5) {
            errors.push(`Ligne ${idx + 1} (${dateStr}) : Doit contenir exactement 5 numéros uniques entre 1 et 90. Trouvé : [${uniqueWinners.join(", ")}]`);
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

    // Tri chronologique descendant (plus récent d'abord)
    validData.sort((a, b) => {
        const parseDate = (dStr: string) => {
            const parts = dStr.split("/");
            if (parts.length === 3) {
                // Format JJ/MM/AAAA
                return new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0])).getTime();
            }
            return new Date(dStr).getTime();
        };
        return parseDate(b.date) - parseDate(a.date);
    });

    return {
        success: validData.length > 0,
        validData,
        errors
    };
};

