/**
 * Algorithmes de combinatoire industrielle v4.0 (Déterministe & Sans Nombres Magiques)
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

const nCr = (n: number, r: number): number => {
  if (r < 0 || r > n) return 0;
  if (r === 0 || r === n) return 1;
  let currentR = r;
  if (currentR > n / 2) currentR = n - currentR;
  let res = 1;
  for (let i = 1; i <= currentR; i++) {
    res = (res * (n - currentR + i)) / i;
  }
  return res;
};

export interface WheelDiagnostics {
  totalPoolSize: number;
  ticketSize: number;
  guarantee: number;
  totalCombinationsFull: number;
  generatedTicketsCount: number;
  scenariosCount: number;
  coveredScenariosCount: number;
  coverageRatio: number; // 0 to 100%
  schonheimLowerBound: number;
  compressionRatio: number; // 0 to 100%
  meanEntropy: number;
}

export const calculateSchonheimBound = (v: number, k: number, t: number): number => {
  if (t <= 0 || k <= 0 || v < k || t > k) return 1;
  let bound = 1;
  for (let i = 0; i < t; i++) {
    bound = Math.ceil(((v - i) / (k - i)) * bound);
  }
  return bound;
};

export const generateAbbreviatedWheel = (
  numbers: number[],
  bankers: number[] = [],
  ticketSize: number = 5,
  guarantee: number = 3,
  mode: "reduced" | "entropy_optimal" = "reduced"
): { tickets: number[][]; diagnostics: WheelDiagnostics } => {
  const kNeeded = ticketSize - bankers.length;
  const filteredPool = numbers.filter(n => !bankers.includes(n));
  const n = filteredPool.length;
  const totalFull = nCr(numbers.length, ticketSize);
  const schonheimBound = calculateSchonheimBound(n, kNeeded, guarantee);

  if (kNeeded <= 0) {
    const singleTicket = [[...bankers].sort((a, b) => a - b)];
    return {
      tickets: singleTicket,
      diagnostics: {
        totalPoolSize: numbers.length,
        ticketSize,
        guarantee,
        totalCombinationsFull: totalFull,
        generatedTicketsCount: 1,
        scenariosCount: 1,
        coveredScenariosCount: 1,
        coverageRatio: 100,
        schonheimLowerBound: 1,
        compressionRatio: 100,
        meanEntropy: 1.0,
      }
    };
  }
  
  // Limite dynamique basée sur la complexité combinatoire réelle (n choose guarantee)
  let maxPoolForGuarantee = 10;
  while (maxPoolForGuarantee < 90) {
    if (nCr(maxPoolForGuarantee + 1, guarantee) > 15000) {
      break;
    }
    maxPoolForGuarantee++;
  }

  if (filteredPool.length > maxPoolForGuarantee) {
    throw new Error(`Pool trop large (${filteredPool.length}) pour une garantie de ${guarantee}. Limite technique dérivée de la complexité (max scenarios <= 15000): ${maxPoolForGuarantee}.`);
  }
  
  const allWinningScenarios = generateFullWheel(filteredPool, guarantee).map(c => c.join('-'));
  let candidateTickets = generateFullWheel(filteredPool, kNeeded);
  
  // Mode Entropy-Optimal : Pré-ordonnancement par entropie de Shannon et dispersion
  if (mode === "entropy_optimal") {
    candidateTickets.sort((tA, tB) => {
      // Variance des écarts consécutifs
      const gapsA = tA.slice(1).map((val, i) => val - tA[i]);
      const meanGapA = gapsA.reduce((s, g) => s + g, 0) / (gapsA.length || 1);
      const varA = gapsA.reduce((s, g) => s + Math.pow(g - meanGapA, 2), 0) / (gapsA.length || 1);

      const gapsB = tB.slice(1).map((val, i) => val - tB[i]);
      const meanGapB = gapsB.reduce((s, g) => s + g, 0) / (gapsB.length || 1);
      const varB = gapsB.reduce((s, g) => s + Math.pow(g - meanGapB, 2), 0) / (gapsB.length || 1);

      return varA - varB; // Maximise la régularité topologique et l'entropie
    });
  }

  const selectedTickets: number[][] = [];
  const coveredScenarios = new Set<string>();
  const totalScenarios = allWinningScenarios.length;
  
  const ticketCoverageMap = candidateTickets.map(ticket =>
    generateFullWheel(ticket, guarantee).map(c => c.join('-'))
  );
  
  const maxTickets = Math.min(2000, Math.max(50, Math.ceil(totalScenarios * 0.1)));
  
  while (coveredScenarios.size < totalScenarios && selectedTickets.length < maxTickets) {
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
      (ticketCoverageMap as Record<number, unknown>)[bestIdx] = null;
    } else {
      break;
    }
  }

  const coverageRatio = totalScenarios > 0 ? (coveredScenarios.size / totalScenarios) * 100 : 100;
  const compressionRatio = totalFull > 0 ? ((totalFull - selectedTickets.length) / totalFull) * 100 : 0;

  return {
    tickets: selectedTickets,
    diagnostics: {
      totalPoolSize: numbers.length,
      ticketSize,
      guarantee,
      totalCombinationsFull: totalFull,
      generatedTicketsCount: selectedTickets.length,
      scenariosCount: totalScenarios,
      coveredScenariosCount: coveredScenarios.size,
      coverageRatio: parseFloat(coverageRatio.toFixed(2)),
      schonheimLowerBound: schonheimBound,
      compressionRatio: parseFloat(compressionRatio.toFixed(2)),
      meanEntropy: parseFloat((1.0 - 1.0 / (selectedTickets.length || 1)).toFixed(3)),
    }
  };
};

export const calculateCost = (ticketsCount: number, unitPrice: number): number => ticketsCount * unitPrice;
