import pino from 'pino';

const isDev = typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env.MODE !== 'production' : process.env.NODE_ENV !== 'production';

export const logger = pino({
  level: isDev ? 'debug' : 'info',
  transport: isDev
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
        },
      }
    : undefined,
  base: {
    env: typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env.MODE : process.env.NODE_ENV,
  },
});
