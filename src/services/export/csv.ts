import type { DrawResult } from '../../types';

export const exportHistoryToCSV = (results: DrawResult[], filename: string) => {
  if (typeof document === 'undefined') return;

  const headers = ['Date', 'G1', 'G2', 'G3', 'G4', 'G5', 'M1', 'M2', 'M3', 'M4', 'M5', 'ID'];
  const rows = results.length
    ? results.map((row) => {
        const g = row.gagnants?.join(',') ?? '';
        const m = row.machine && row.machine.length === 5 ? row.machine.join(',') : ',,,,';
        return `${row.date},${g},${m},${row.id}`;
      })
    : [];

  const csv = [headers.join(','), ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${filename}.csv`;
  link.click();
  URL.revokeObjectURL(url);
};
