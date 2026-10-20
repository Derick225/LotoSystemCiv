import { exportToJSON } from './json';
import { exportDNA, importDNA } from './dna';
import { exportHistoryToCSV } from './csv';
import {
  exportPythonCore,
  generateForensicLogPDF,
  generateForensicStochasticReportPDF,
  generateNeuralPredictionPDF,
  generateUnifiedForensicScenarioPDF,
} from './pdf';

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
export default exportService;
