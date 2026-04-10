import { DrawResult } from '../store/useLotteryStore';

export interface PredictionStats {
  hotNumbers: number[];
  coldNumbers: number[];
  overdueNumbers: number[];
  predictedNumbers: number[];
}

export function calculatePredictions(results: DrawResult[]): PredictionStats {
  if (results.length === 0) {
    return { hotNumbers: [], coldNumbers: [], overdueNumbers: [], predictedNumbers: [] };
  }

  const frequencies = new Map<number, number>();
  const lastSeen = new Map<number, number>();
  
  // Initialize
  for (let i = 1; i <= 90; i++) {
    frequencies.set(i, 0);
    lastSeen.set(i, -1); // -1 means never seen
  }

  // Sort results by date ascending (oldest first)
  const sortedResults = [...results].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  sortedResults.forEach((result, index) => {
    result.numbers.forEach(num => {
      frequencies.set(num, (frequencies.get(num) || 0) + 1);
      lastSeen.set(num, index);
    });
  });

  const totalDraws = sortedResults.length;

  // Calculate overdue (totalDraws - lastSeenIndex - 1)
  const overdueStats = Array.from(lastSeen.entries()).map(([num, lastIndex]) => ({
    num,
    overdue: lastIndex === -1 ? totalDraws : totalDraws - lastIndex - 1
  }));

  const freqStats = Array.from(frequencies.entries()).map(([num, freq]) => ({
    num,
    freq
  }));

  // Sort to find hot and cold
  freqStats.sort((a, b) => b.freq - a.freq);
  const hotNumbers = freqStats.slice(0, 5).map(s => s.num);
  const coldNumbers = freqStats.slice(-5).reverse().map(s => s.num);

  // Sort to find overdue
  overdueStats.sort((a, b) => b.overdue - a.overdue);
  const overdueNumbers = overdueStats.slice(0, 5).map(s => s.num);

  // Simple prediction algorithm: mix of hot, overdue, and a bit of randomness
  // Let's pick 2 hot, 2 overdue, and 1 random from the rest
  const predictedSet = new Set<number>();
  
  // Add 2 hot numbers
  for (const num of hotNumbers) {
    if (predictedSet.size < 2) predictedSet.add(num);
  }

  // Add 2 overdue numbers
  for (const num of overdueNumbers) {
    if (predictedSet.size < 4 && !predictedSet.has(num)) predictedSet.add(num);
  }

  // Fill the rest with random numbers (up to 5)
  while (predictedSet.size < 5) {
    const randomNum = Math.floor(Math.random() * 90) + 1;
    predictedSet.add(randomNum);
  }

  return {
    hotNumbers,
    coldNumbers,
    overdueNumbers,
    predictedNumbers: Array.from(predictedSet).sort((a, b) => a - b)
  };
}
