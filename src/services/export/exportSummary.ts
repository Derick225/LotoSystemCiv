export interface ExportSummary {
  format: 'csv' | 'json' | 'pdf';
  rows: number;
  generatedAt: string;
}

export const summarizeExport = (format: 'csv' | 'json' | 'pdf', rows: number, generatedAt: string): ExportSummary => ({
  format,
  rows: Number.isFinite(rows) ? Math.max(0, rows) : 0,
  generatedAt,
});
