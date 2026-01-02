
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
