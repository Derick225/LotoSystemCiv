import type { DrawResult } from '../../types';

export const calculateGap = (history: DrawResult[], number: number): number => {
  for (let i = 0; i < history.length; i++) {
    if (history[i].gagnants.includes(number)) return i;
  }
  return history.length;
};

export const calculateFrequency = (history: DrawResult[], number: number, limit = 50): number => {
  const subset = history.slice(0, limit);
  return subset.filter((draw) => draw.gagnants.includes(number)).length;
};

export const calculateMean = (values: number[]): number => {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
};

export const calculateStdDev = (values: number[], mean = calculateMean(values)): number => {
  if (!values.length) return 1;
  const variance = values.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) / values.length;
  return Math.sqrt(variance) || 1;
};

export const calculateIQR = (sortedValues: number[]): number => {
  if (!sortedValues.length) return 1;
  const q1 = sortedValues[Math.floor(sortedValues.length * 0.25)] ?? 0;
  const q3 = sortedValues[Math.floor(sortedValues.length * 0.75)] ?? 0;
  return Math.max(1e-6, q3 - q1);
};
