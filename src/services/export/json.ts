export type ExportPayload = unknown;

export const exportToJSON = (data: ExportPayload, filename: string) => {
  if (typeof document === 'undefined') return;
  const content = JSON.stringify(data, null, 2);
  const blob = new Blob([content], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${filename}.json`;
  link.click();
  URL.revokeObjectURL(url);
};
