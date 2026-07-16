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

export const generateAbbreviatedWheel = (
  numbers: number[],
  bankers: number[] = [],
  ticketSize: number = 5,
  guarantee: number = 3
): number[][] => {
  const kNeeded = ticketSize - bankers.length;
  if (kNeeded <= 0) return [[...bankers].sort((a, b) => a - b)];
  
  const filteredPool = numbers.filter(n => !bankers.includes(n));
  
  // Limite dynamique basée sur la complexité combinatoire réelle (n choose guarantee)
  // On recherche le maxPoolForGuarantee tel que nCr(maxPool, guarantee) <= 15000.
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
  
  const selectedTickets: number[][] = [];
  const coveredScenarios = new Set<string>();
  const totalScenarios = allWinningScenarios.length;
  
  const ticketCoverageMap = candidateTickets.map(ticket =>
    generateFullWheel(ticket, guarantee).map(c => c.join('-'))
  );
  
  // Limite dynamique de tickets : proportionnelle à l'espace des scénarios et dérivée de Set Cover (ex: Math.ceil(totalScenarios * 0.1))
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
      
      // Trie déterministe en cas d'égalité (indice le plus faible)
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
  return selectedTickets;
};

export const calculateCost = (ticketsCount: number, unitPrice: number): number => ticketsCount * unitPrice;
