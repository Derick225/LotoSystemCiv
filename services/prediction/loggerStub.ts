const print = (level: string, ...args: any[]) => {
  if (level === 'debug') return; // Silence debug on edge
  console.log(`[${level.toUpperCase()}]`, ...args);
};

export const logger = {
  debug: (...args: any[]) => print('debug', ...args),
  info: (...args: any[]) => print('info', ...args),
  warn: (...args: any[]) => print('warn', ...args),
  error: (...args: any[]) => print('error', ...args),
};
