export type ErrorCode = 
  | 'NETWORK_ERR' 
  | 'AUTH_ERR' 
  | 'VALIDATION_ERR' 
  | 'COMPUTATION_ERR' 
  | 'UNKNOWN_ERR';

export class AppError extends Error {
  constructor(
    public code: ErrorCode,
    public message: string,
    public originalError?: any,
    public isRecoverable: boolean = true
  ) {
    super(message);
    this.name = 'AppError';
    
    // Logging centralisé
    console.error(`[${code}] ${message}`, originalError || '');
  }
}
