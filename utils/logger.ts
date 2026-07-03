import pino from 'pino';

const isDev = /* @ts-ignore */ import.meta.env.MODE !== 'production';

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
    env: /* @ts-ignore */ import.meta.env.MODE,
  },
});
