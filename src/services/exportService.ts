import type { AlgoWeights, DrawResult } from '../types';

type ExportPayload = unknown;
const EMPTY_ALGO_WEIGHTS = {} as unknown as AlgoWeights;

const safeDownload = (filename: string, content: string, mimeType: string) => {
  if (typeof document === 'undefined') return;
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
};

const exportToJSON = (data: ExportPayload, filename: string) => {
  safeDownload(`${filename}.json`, JSON.stringify(data, null, 2), 'application/json');
};

const exportDNA = (weights: AlgoWeights, drawName: string) => {
  safeDownload(`Nexus_DNA_${drawName}.json`, JSON.stringify({ weights }, null, 2), 'application/json');
};

const importDNA = async (): Promise<AlgoWeights> => {
  if (typeof document === 'undefined') {
    return EMPTY_ALGO_WEIGHTS;
  }
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

const exportHistoryToCSV = (results: DrawResult[], filename: string) => {
  if (!results.length) {
    safeDownload(`${filename}.csv`, 'date,value\n', 'text/csv');
    return;
  }
  const rows = results.map((row) => JSON.stringify(row));
  safeDownload(`${filename}.csv`, rows.join('\n'), 'text/csv');
};

const generateUnifiedForensicScenarioPDF = async (_scenario: unknown) => undefined;
const generateForensicLogPDF = async (_payload: unknown) => undefined;
const generateForensicStochasticReportPDF = async (_payload: unknown) => undefined;
const generateNeuralPredictionPDF = async (_payload: unknown) => undefined;
const exportPythonCore = () => undefined;

export const exportService = {
  exportToJSON,
  exportDNA,
  importDNA,
  exportHistoryToCSV,
  generateUnifiedForensicScenarioPDF,
  generateForensicLogPDF,
  generateForensicStochasticReportPDF,
  generateNeuralPredictionPDF,
  exportPythonCore,
};

export const ExportService = exportService;

export {
  exportToJSON,
  exportDNA,
  importDNA,
  exportHistoryToCSV,
  generateUnifiedForensicScenarioPDF,
  generateForensicLogPDF,
  generateForensicStochasticReportPDF,
  generateNeuralPredictionPDF,
  exportPythonCore,
};

export default exportService;
