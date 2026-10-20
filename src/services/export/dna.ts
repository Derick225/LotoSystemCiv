import type { AlgoWeights } from '../../types';

const EMPTY_ALGO_WEIGHTS = {} as unknown as AlgoWeights;

export const exportDNA = (weights: AlgoWeights, drawName: string) => {
  if (typeof document === 'undefined') return;
  const content = JSON.stringify({ weights }, null, 2);
  const blob = new Blob([content], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `Nexus_DNA_${drawName}.json`;
  link.click();
  URL.revokeObjectURL(url);
};

export const importDNA = async (): Promise<AlgoWeights> => {
  if (typeof document === 'undefined') return EMPTY_ALGO_WEIGHTS;

  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) {
        resolve(EMPTY_ALGO_WEIGHTS);
        return;
      }

      const reader = new FileReader();
      reader.onload = () => {
        try {
          const parsed = JSON.parse(String(reader.result ?? '{}'));
          resolve((parsed.weights ?? parsed) as unknown as AlgoWeights);
        } catch {
          resolve(EMPTY_ALGO_WEIGHTS);
        }
      };
      reader.readAsText(file);
    };
    input.click();
  });
};
