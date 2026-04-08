export type LogLevel = 'info' | 'warn' | 'error';

export const auditLogger = (level: LogLevel, context: string, payload?: any) => {
    const timestamp = new Date().toISOString();
    const logEntry = {
        timestamp,
        level,
        context,
        payload
    };

    // In a real production environment, this would send to Sentry, Datadog, etc.
    switch (level) {
        case 'info':
            console.log(`[INFO] [${context}]`, payload ? payload : '');
            break;
        case 'warn':
            console.warn(`[WARN] [${context}]`, payload ? payload : '');
            break;
        case 'error':
            console.error(`[ERROR] [${context}]`, payload ? payload : '');
            break;
    }
};

export class InvalidInputError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'InvalidInputError';
    }
}
