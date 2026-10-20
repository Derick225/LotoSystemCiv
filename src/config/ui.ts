export const SLOT_CONFIG: Record<string, { color: string; icon: string; label: string }> = {
  '10:00': { color: 'text-amber-400', icon: '🌅', label: 'Morning' },
  '13:00': { color: 'text-blue-400', icon: '☀️', label: 'Zenith' },
  '16:00': { color: 'text-orange-400', icon: '🌤️', label: 'Daylight' },
  '19:55': { color: 'text-indigo-400', icon: '🌙', label: 'Twilight' },
};

export const getNumberColor = (n: number): string => {
  if (n < 10) return 'bg-slate-600 border-slate-400 shadow-slate-400/20';
  if (n < 20) return 'bg-blue-600 border-blue-400 shadow-blue-400/20';
  if (n < 30) return 'bg-emerald-600 border-emerald-400 shadow-emerald-400/20';
  if (n < 40) return 'bg-yellow-500 border-yellow-300 shadow-yellow-300/20';
  if (n < 50) return 'bg-orange-600 border-orange-400 shadow-orange-400/20';
  if (n < 60) return 'bg-red-600 border-red-400 shadow-red-400/20';
  if (n < 70) return 'bg-purple-600 border-purple-400 shadow-purple-400/20';
  if (n < 80) return 'bg-pink-600 border-pink-400 shadow-pink-400/20';
  return 'bg-rose-700 border-rose-500 shadow-rose-500/20';
};
