
/**
 * Algorithmes de combinatoire industrielle v3.3
 * Optimisé pour les calculs intensifs sur terminaux mobiles.
 */

/**
 * Génère toutes les combinaisons possibles (n choose k) de manière itérative.
 * Évite le Stack Overflow pour les grands ensembles.
 */
export const generateFullWheel = (pool: number[], k: number = 5): number[][] => {
    const n = pool.length;
    if (k > n || k <= 0) return [];
    if (k === n) return [[...pool].sort((a, b) => a - b)];

    const results: number[][] = [];
    const indices = Array.from({ length: k }, (_, i) => i);

    while (indices[0] <= n - k) {
        results.push(indices.map(i => pool[i]).sort((a, b) => a - b));

        let i = k - 1;
        while (i >= 0 && indices[i] === n - k + i) i--;

        if (i < 0) break;

        indices[i]++;
        for (let j = i + 1; j < k; j++) {
            indices[j] = indices[j - 1] + 1;
        }
    }
    return results;
};

/**
 * Génère un système intégral avec support Bankers.
 */
export const generateFullWheelWithBankers = (
    pool: number[], 
    bankers: number[], 
    ticketSize: number = 5
): number[][] => {
    const kNeeded = ticketSize - bankers.length;
    if (kNeeded <= 0) return [[...bankers].sort((a, b) => a - b)];
    
    const filteredPool = pool.filter(n => !bankers.includes(n));
    const combinations = generateFullWheel(filteredPool, kNeeded);
    
    return combinations.map(c => [...bankers, ...c].sort((a, b) => a - b));
};

/**
 * Génère un système réduit (Covering Design) optimisé.
 * Utilise une approche gloutonne avec limitation de complexité.
 */
export const generateAbbreviatedWheel = (
    numbers: number[], 
    bankers: number[] = [],
    ticketSize: number = 5, 
    guarantee: number = 3
): number[][] => {
    const kNeeded = ticketSize - bankers.length;
    if (kNeeded <= 0) return [[...bankers].sort((a, b) => a - b)];
    
    const filteredPool = numbers.filter(n => !bankers.includes(n));
    
    // Protection contre l'explosion combinatoire
    if (filteredPool.length > 22 && guarantee >= 4) {
        throw new Error("Pool trop large pour cette garantie (Limite technique 22).");
    }

    const allWinningScenarios = generateFullWheel(filteredPool, guarantee).map(c => c.join('-'));
    let candidateTickets = generateFullWheel(filteredPool, kNeeded);
    
    const selectedTickets: number[][] = [];
    const coveredScenarios = new Set<string>();
    const totalScenarios = allWinningScenarios.length;

    // Mapping pour accélération : ticket -> scenarios qu'il couvre
    const ticketCoverageMap = candidateTickets.map(ticket => 
        generateFullWheel(ticket, guarantee).map(c => c.join('-'))
    );

    while (coveredScenarios.size < totalScenarios && selectedTickets.length < 500) {
        let bestIdx = -1;
        let bestNewCoverage = 0;

        for (let i = 0; i < ticketCoverageMap.length; i++) {
            if (!ticketCoverageMap[i]) continue;
            
            let currentNewCount = 0;
            for (const scenario of ticketCoverageMap[i]) {
                if (!coveredScenarios.has(scenario)) currentNewCount++;
            }

            if (currentNewCount > bestNewCoverage) {
                bestNewCoverage = currentNewCount;
                bestIdx = i;
            }
        }

        if (bestIdx !== -1 && bestNewCoverage > 0) {
            selectedTickets.push([...bankers, ...candidateTickets[bestIdx]].sort((a, b) => a - b));
            ticketCoverageMap[bestIdx].forEach(s => coveredScenarios.add(s));
            // On invalide le ticket pour ne pas le reprendre
            (ticketCoverageMap as any)[bestIdx] = null;
        } else break;
    }

    return selectedTickets;
};

export const calculateCost = (ticketsCount: number, unitPrice: number = 100): number => ticketsCount * unitPrice;
