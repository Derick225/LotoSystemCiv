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
  if (error instanceof AppError) {
    console.error(`[${error.severity.toUpperCase()}] ${error.code}: ${error.message}`, {
      ...error.context,
      ...context,
      stack: error.stack
    });
    // Here we could send to Sentry, Datadog, or Supabase logs
  } else if (error instanceof Error) {
    console.error(`[UNHANDLED] ${error.name}: ${error.message}`, {
      ...context,
      stack: error.stack
    });
  } else {
    console.error(`[UNKNOWN]`, error, context);
  }
};
