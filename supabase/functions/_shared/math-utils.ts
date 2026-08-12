
/**
 * Shared Mathematical Utilities for LotoPro Edge Compute
 */

// Basic Stats
export const mean = (data: number[]) => data.reduce((a, b) => a + b, 0) / (data.length || 1);

export const stdDev = (data: number[]) => {
    const mu = mean(data);
    const variance = data.reduce((a, b) => a + Math.pow(b - mu, 2), 0) / (data.length || 1);
    return Math.sqrt(variance);
};

export const factorial = (n: number): number => {
    if (n < 0) return 1;
    let result = 1;
    for (let i = 2; i <= n; i++) result *= i;
    return result;
};

// P(k; λ) = (e^(-λ) * λ^k) / k!
export const calculatePoisson = (k: number, lambda: number): number => {
    if (k > 20) return 0; // Prevent Infinity/Overflow in Edge
    return (Math.exp(-lambda) * Math.pow(lambda, k)) / factorial(k);
};

// Signal Processing
export function computeDFT(signal: number[]): { frequency: number, power: number, period: number }[] {
    const N = signal.length;
    const spectrum = [];
    for (let k = 1; k < N / 2; k++) {
        let re = 0;
        let im = 0;
        for (let n = 0; n < N; n++) {
            const window = 0.5 * (1 - Math.cos((2 * Math.PI * n) / (N - 1)));
            const val = signal[n] * window;
            const angle = (2 * Math.PI * k * n) / N;
            re += val * Math.cos(angle);
            im -= val * Math.sin(angle);
        }
        const magnitude = Math.sqrt(re * re + im * im);
        spectrum.push({ frequency: k, power: magnitude, period: N / k });
    }
    return spectrum;
}

// Matrix Ops
export const matMul = (A: number[][], B: number[][]): number[][] => {
    const m = A.length;
    const n = A[0].length;
    const p = B[0].length;
    const C = Array(m).fill(0).map(() => Array(p).fill(0));
    for (let i = 0; i < m; i++) {
        for (let j = 0; j < p; j++) {
            let sum = 0;
            for (let k = 0; k < n; k++) sum += A[i][k] * B[k][j];
            C[i][j] = sum;
        }
    }
    return C;
};
