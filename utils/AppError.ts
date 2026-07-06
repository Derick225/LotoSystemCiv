export type ErrorSeverity = 'low' | 'medium' | 'high' | 'critical';

export class AppError extends Error {
  public readonly code: string;
  public readonly severity: ErrorSeverity;
  public readonly context?: Record<string, unknown>;

  constructor(message: string, code: string = 'UNKNOWN_ERROR', severity: ErrorSeverity = 'medium', context?: Record<string, unknown>) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.severity = severity;
    this.context = context;

    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, AppError);
    }
  }
}

export const logError = (error: unknown, context?: Record<string, unknown>) => {
  const isNetworkOrFetchError = (err: unknown): boolean => {
    if (!err) return false;
    const msg = String((err as any).message || '').toLowerCase();
    const code = String((err as any).code || '').toLowerCase();
    return (
      msg.includes('failed to fetch') ||
      msg.includes('fetch') ||
      msg.includes('network') ||
      msg.includes('connection') ||
      msg.includes('contact’') ||
      msg.includes('contacter le serveur') ||
      code.includes('network') ||
      code.includes('fetch')
    );
  };

  const isNetwork = isNetworkOrFetchError(error) || (context && isNetworkOrFetchError(context.error));

  if (error instanceof AppError) {
    const severity = isNetwork ? 'medium' : error.severity;
    if (severity === 'high' || severity === 'critical') {
      console.error(`[${severity.toUpperCase()}] ${error.code}: ${error.message}`, {
        ...error.context,
        ...context,
        stack: error.stack
      });
    } else {
      console.warn(`[${severity.toUpperCase()}] ${error.code}: ${error.message}`, {
        ...error.context,
        ...context
      });
    }
  } else if (error instanceof Error) {
    if (isNetwork) {
      console.warn(`[NETWORK_WARN] ${error.name}: ${error.message}`, {
        ...context
      });
    } else {
      console.error(`[UNHANDLED] ${error.name}: ${error.message}`, {
        ...context,
        stack: error.stack
      });
    }
  } else {
    if (isNetwork) {
      console.warn(`[NETWORK_WARN]`, error, context);
    } else {
      console.error(`[UNKNOWN]`, error, context);
    }
  }
};
