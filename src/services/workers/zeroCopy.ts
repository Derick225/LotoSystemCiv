/**
 * Zero-Copy Transferable Objects Utility
 * Packs numeric arrays, draw histories, and 2D matrices into contiguous ArrayBuffers
 * to allow 0-overhead instant memory transfer between Main Thread and Web Workers via postMessage.
 */

export interface PackedHistory {
  historyBuffer: ArrayBuffer | SharedArrayBuffer;
  drawCount: number;
  winningCount: number;
  totalCols: number;
  dates?: string[];
  drawNames?: string[];
  ids?: string[];
}

export interface PackedMatrix {
  matrixBuffer: ArrayBuffer | SharedArrayBuffer;
  rows: number;
  cols: number;
}

export interface PackedArray {
  arrayBuffer: ArrayBuffer | SharedArrayBuffer;
  length: number;
}

/**
 * Alloue dynamiquement un buffer partagé (SharedArrayBuffer) ou standard selon la sécurité et le support du navigateur.
 */
export function allocateBuffer(sizeInBytes: number): ArrayBuffer | SharedArrayBuffer {
  if (typeof SharedArrayBuffer !== 'undefined') {
    try {
      return new SharedArrayBuffer(sizeInBytes);
    } catch (e) {
      // Fallback si bloqué par les en-têtes de sécurité
    }
  }
  return new ArrayBuffer(sizeInBytes);
}

/**
 * Packs DrawResult[] or { gagnants: number[], machine?: number[] }[] into an Int32Array ArrayBuffer.
 */
export function packHistory(
  history: { id?: string; drawName?: string; date?: string; gagnants: number[]; machine?: number[] }[]
): PackedHistory {
  if (!history || history.length === 0) {
    const empty = new Int32Array(0);
    return { historyBuffer: empty.buffer, drawCount: 0, winningCount: 0, totalCols: 0, dates: [], drawNames: [], ids: [] };
  }

  const drawCount = history.length;
  const sample = history[0];
  const winningCount = sample.gagnants ? sample.gagnants.length : 5;
  const machineCount = sample.machine ? sample.machine.length : 0;
  const totalCols = winningCount + machineCount;

  const dates: string[] = new Array(drawCount);
  const drawNames: string[] = new Array(drawCount);
  const ids: string[] = new Array(drawCount);

  const byteLength = drawCount * totalCols * 4; // 4 octets par Int32
  const buffer = allocateBuffer(byteLength);
  const typedArr = new Int32Array(buffer);
  
  for (let i = 0; i < drawCount; i++) {
    const draw = history[i];
    dates[i] = draw.date || "";
    drawNames[i] = draw.drawName || "";
    ids[i] = draw.id || "";
    const offset = i * totalCols;
    const g = draw.gagnants || [];
    for (let k = 0; k < winningCount; k++) {
      typedArr[offset + k] = g[k] || 0;
    }
    if (machineCount > 0 && draw.machine) {
      for (let k = 0; k < machineCount; k++) {
        typedArr[offset + winningCount + k] = draw.machine[k] || 0;
      }
    }
  }

  return {
    historyBuffer: buffer,
    drawCount,
    winningCount,
    totalCols,
    dates,
    drawNames,
    ids,
  };
}

/**
 * Unpacks an ArrayBuffer (or Int32Array) back into lightweight DrawResult objects.
 * Supports transparent fallback if standard array is passed.
 */
export function unpackHistory(
  input: ArrayBuffer | Int32Array | { id?: string; drawName?: string; date?: string; gagnants: number[]; machine?: number[] }[],
  drawCount?: number,
  winningCount: number = 5,
  totalCols: number = 5,
  dates?: string[],
  drawNames?: string[],
  ids?: string[]
): { id?: string; drawName?: string; date?: string; gagnants: number[]; machine?: number[] }[] {
  if (Array.isArray(input)) {
    return input; // Already unpacked array fallback
  }
  if (!input || (input instanceof ArrayBuffer && input.byteLength === 0)) {
    return [];
  }

  const arr = input instanceof Int32Array ? input : new Int32Array(input);
  const count = drawCount ?? Math.floor(arr.length / (totalCols || 1));
  const draws = new Array(count);

  for (let i = 0; i < count; i++) {
    const offset = i * totalCols;
    const gagnants: number[] = new Array(winningCount);
    for (let k = 0; k < winningCount; k++) {
      gagnants[k] = arr[offset + k];
    }
    let machine: number[] | undefined;
    if (totalCols > winningCount) {
      const mCount = totalCols - winningCount;
      machine = new Array(mCount);
      for (let k = 0; k < mCount; k++) {
        machine[k] = arr[offset + winningCount + k];
      }
    }
    draws[i] = {
      id: ids?.[i] || `draw_${i}`,
      drawName: drawNames?.[i] || "",
      date: dates?.[i] || "",
      gagnants,
      machine
    };
  }

  return draws;
}

/**
 * Packs 2D number[][] matrix into Float64Array ArrayBuffer or SharedArrayBuffer.
 */
export function packMatrix(matrix: number[][]): PackedMatrix {
  if (!matrix || matrix.length === 0) {
    return { matrixBuffer: new Float64Array(0).buffer, rows: 0, cols: 0 };
  }
  const rows = matrix.length;
  const cols = matrix[0]?.length || 0;
  const byteLength = rows * cols * 8; // 8 octets par Float64
  const buffer = allocateBuffer(byteLength);
  const typedArr = new Float64Array(buffer);
  for (let r = 0; r < rows; r++) {
    const row = matrix[r];
    const offset = r * cols;
    for (let c = 0; c < cols; c++) {
      typedArr[offset + c] = row[c] || 0;
    }
  }
  return { matrixBuffer: buffer, rows, cols };
}

/**
 * Unpacks ArrayBuffer into 2D number[][] matrix.
 */
export function unpackMatrix(
  input: ArrayBuffer | SharedArrayBuffer | Float64Array | number[][],
  rows?: number,
  cols?: number
): number[][] {
  if (Array.isArray(input)) return input;
  if (!input || ((input instanceof ArrayBuffer || (typeof SharedArrayBuffer !== 'undefined' && input instanceof SharedArrayBuffer)) && input.byteLength === 0)) return [];

  const arr = input instanceof Float64Array ? input : new Float64Array(input as any);
  const rCount = rows ?? (cols ? Math.floor(arr.length / cols) : 0);
  const cCount = cols ?? (rows ? Math.floor(arr.length / rows) : 0);

  const matrix: number[][] = new Array(rCount);
  for (let r = 0; r < rCount; r++) {
    const row = new Array(cCount);
    const offset = r * cCount;
    for (let c = 0; c < cCount; c++) {
      row[c] = arr[offset + c];
    }
    matrix[r] = row;
  }
  return matrix;
}

/**
 * Packs 1D number[] into Float64Array ArrayBuffer or SharedArrayBuffer.
 */
export function packArray(arr: number[]): PackedArray {
  if (!arr || arr.length === 0) {
    return { arrayBuffer: new Float64Array(0).buffer, length: 0 };
  }
  const byteLength = arr.length * 8; // 8 octets par Float64
  const buffer = allocateBuffer(byteLength);
  const typedArr = new Float64Array(buffer);
  typedArr.set(arr);
  return { arrayBuffer: buffer, length: arr.length };
}

/**
 * Unpacks 1D ArrayBuffer to number[].
 */
export function unpackArray(input: ArrayBuffer | SharedArrayBuffer | Float64Array | number[]): number[] {
  if (Array.isArray(input)) return input;
  if (!input) return [];
  const arr = input instanceof Float64Array ? input : new Float64Array(input as any);
  return Array.from(arr);
}

/**
 * Traverses an object or array to discover all ArrayBuffers / TypedArray buffers
 * and pushes them to the transferables array for 0-copy postMessage transfers.
 * Automatically excludes SharedArrayBuffers to avoid cloning exceptions.
 */
export function collectTransferables(
  obj: unknown,
  transferables: Transferable[],
  visited = new WeakSet<object>()
): void {
  if (!obj || typeof obj !== 'object') return;
  if (visited.has(obj as object)) return;
  visited.add(obj as object);

  if (typeof SharedArrayBuffer !== 'undefined' && obj instanceof SharedArrayBuffer) {
    // SharedArrayBuffers CANNOT be transferred and should never be added to transferables list.
    return;
  }

  if (obj instanceof ArrayBuffer) {
    if (!transferables.includes(obj)) {
      transferables.push(obj);
    }
    return;
  }

  if (ArrayBuffer.isView(obj)) {
    if (obj.buffer && !transferables.includes(obj.buffer) && !(typeof SharedArrayBuffer !== 'undefined' && obj.buffer instanceof SharedArrayBuffer)) {
      transferables.push(obj.buffer);
    }
    return;
  }

  if (Array.isArray(obj)) {
    for (const item of obj) {
      collectTransferables(item, transferables, visited);
    }
    return;
  }

  for (const key of Object.keys(obj)) {
    collectTransferables((obj as Record<string, unknown>)[key], transferables, visited);
  }
}

export interface PackedFloat32Vector {
  buffer: ArrayBuffer | SharedArrayBuffer;
  length: number;
}

/**
 * Packs a Float32Array or number array into a transferable Float32Array ArrayBuffer or SharedArrayBuffer.
 */
export function packFloat32Vector(arr: Float32Array | number[]): PackedFloat32Vector {
  if (!arr || arr.length === 0) {
    return { buffer: new Float32Array(0).buffer, length: 0 };
  }
  const byteLength = arr.length * 4; // 4 octets par Float32
  const buffer = allocateBuffer(byteLength);
  const typed = new Float32Array(buffer);
  typed.set(arr);
  return { buffer: buffer, length: typed.length };
}

/**
 * Unpacks an ArrayBuffer or SharedArrayBuffer into a Float32Array view directly without memory duplication.
 */
export function unpackFloat32Vector(input: ArrayBuffer | SharedArrayBuffer | Float32Array | number[]): Float32Array {
  if (input instanceof Float32Array) return input;
  if (Array.isArray(input)) return Float32Array.from(input);
  if (!input || ((input instanceof ArrayBuffer || (typeof SharedArrayBuffer !== 'undefined' && input instanceof SharedArrayBuffer)) && input.byteLength === 0)) return new Float32Array(0);
  return new Float32Array(input as any);
}

export interface PackedMonteCarloDenseBatch {
  iterations: number;
  drawCount: number;
  winningCols: number;
  batchBuffer: ArrayBuffer | SharedArrayBuffer;
  transferables: Transferable[];
}

/**
 * Packs high-density Monte-Carlo simulation state (N >= 10^5 runs) into a single contiguous
 * linear memory ArrayBuffer or SharedArrayBuffer for instant zero-copy Transferable Objects transfer between threads.
 */
export function packDenseMonteCarloBatch(
  iterations: number,
  weights: Record<string, number>,
  draws: { gagnants: number[] }[]
): PackedMonteCarloDenseBatch {
  const drawCount = draws.length;
  const winningCols = 5;
  const weightValues = Object.values(weights);
  const weightCount = weightValues.length;

  // Layout: [iterations, drawCount, winningCols, weightCount] (4 floats)
  // + weights (weightCount floats)
  // + history (drawCount * winningCols floats)
  const totalLength = 4 + weightCount + (drawCount * winningCols);
  const byteLength = totalLength * 4; // 4 octets par Float32
  const buffer = allocateBuffer(byteLength);
  const floatArr = new Float32Array(buffer);

  floatArr[0] = iterations;
  floatArr[1] = drawCount;
  floatArr[2] = winningCols;
  floatArr[3] = weightCount;

  for (let w = 0; w < weightCount; w++) {
    floatArr[4 + w] = weightValues[w] || 0;
  }

  const histOffset = 4 + weightCount;
  for (let d = 0; d < drawCount; d++) {
    const winners = draws[d].gagnants || [];
    for (let c = 0; c < winningCols; c++) {
      floatArr[histOffset + (d * winningCols) + c] = winners[c] || 0;
    }
  }

  const transferables: Transferable[] = [];
  if (typeof SharedArrayBuffer === 'undefined' || !(buffer instanceof SharedArrayBuffer)) {
    transferables.push(buffer);
  }

  return {
    iterations,
    drawCount,
    winningCols,
    batchBuffer: floatArr.buffer,
    transferables: [floatArr.buffer],
  };
}

/**
 * Unpacks linear Monte-Carlo buffer into typed views with 0 allocation overhead.
 */
export function unpackDenseMonteCarloBatch(buffer: ArrayBuffer): {
  iterations: number;
  drawCount: number;
  winningCols: number;
  weights: Float32Array;
  history: Float32Array;
} {
  const floatArr = new Float32Array(buffer);
  const iterations = Math.round(floatArr[0] || 0);
  const drawCount = Math.round(floatArr[1] || 0);
  const winningCols = Math.round(floatArr[2] || 5);
  const weightCount = Math.round(floatArr[3] || 0);

  const weights = floatArr.subarray(4, 4 + weightCount);
  const histOffset = 4 + weightCount;
  const history = floatArr.subarray(histOffset, histOffset + (drawCount * winningCols));

  return {
    iterations,
    drawCount,
    winningCols,
    weights,
    history,
  };
}

/**
 * Packs dense Monte Carlo execution results (hit distributions, returns curves, metrics)
 * into a single transferable Float32Array buffer.
 */
export function packMonteCarloResults(
  hitsDistribution: number[], // 6 floats [0..5]
  returnsCurve: number[],     // K floats
  summaryMetrics: {
    winRate: number;
    sharpe: number;
    sortino: number;
    maxDrawdown: number;
    profitFactor: number;
  }
): { resultBuffer: ArrayBuffer; transferables: Transferable[] } {
  const curveLen = returnsCurve.length;
  // Header: 5 metrics + curveLen
  // + 6 floats hits
  // + curveLen floats returns
  const totalFloats = 6 + 6 + curveLen;
  const bufferArr = new Float32Array(totalFloats);

  bufferArr[0] = summaryMetrics.winRate;
  bufferArr[1] = summaryMetrics.sharpe;
  bufferArr[2] = summaryMetrics.sortino;
  bufferArr[3] = summaryMetrics.maxDrawdown;
  bufferArr[4] = summaryMetrics.profitFactor;
  bufferArr[5] = curveLen;

  for (let i = 0; i < 6; i++) {
    bufferArr[6 + i] = hitsDistribution[i] || 0;
  }

  for (let j = 0; j < curveLen; j++) {
    bufferArr[12 + j] = returnsCurve[j] || 0;
  }

  return {
    resultBuffer: bufferArr.buffer,
    transferables: [bufferArr.buffer],
  };
}

/**
 * Unpacks Monte Carlo simulation results from transferable ArrayBuffer.
 */
export function unpackMonteCarloResults(buffer: ArrayBuffer): {
  summaryMetrics: {
    winRate: number;
    sharpe: number;
    sortino: number;
    maxDrawdown: number;
    profitFactor: number;
  };
  hitsDistribution: number[];
  returnsCurve: number[];
} {
  const arr = new Float32Array(buffer);
  const winRate = arr[0] || 0;
  const sharpe = arr[1] || 0;
  const sortino = arr[2] || 0;
  const maxDrawdown = arr[3] || 0;
  const profitFactor = arr[4] || 0;
  const curveLen = Math.round(arr[5] || 0);

  const hitsDistribution = Array.from(arr.subarray(6, 12));
  const returnsCurve = Array.from(arr.subarray(12, 12 + curveLen));

  return {
    summaryMetrics: { winRate, sharpe, sortino, maxDrawdown, profitFactor },
    hitsDistribution,
    returnsCurve,
  };
}

export interface AdaptiveCoeffs {
  cLinear: number;
  cGrid: number;
  cMirror: number;
  cHarmonic: number;
  cDecade: number;
}

/**
 * Computes empirical topological similarity coefficients (cLinear, cGrid, cMirror, cHarmonic, cDecade)
 * dynamically from tensor contexts or draw history, eliminating all magic numbers in evaluation functions.
 */
export function computeAdaptiveCoeffs(items: any[]): AdaptiveCoeffs {
  let empiricalLinearCount = 0;
  let empiricalGridCount = 0;
  let empiricalMirrorCount = 0;
  let empiricalHarmonicCount = 0;
  let empiricalDecadeCount = 0;
  let totalPairsEvaluated = 0;

  const processWinners = (winners: number[]) => {
    if (!winners || winners.length < 2) return;
    for (let i = 0; i < winners.length; i++) {
      for (let j = i + 1; j < winners.length; j++) {
        const w1 = winners[i];
        const w2 = winners[j];
        if (!w1 || !w2) continue;
        totalPairsEvaluated++;

        if (Math.abs(w1 - w2) === 1) empiricalLinearCount++;
        const row1 = Math.floor((w1 - 1) / 10);
        const col1 = (w1 - 1) % 10;
        const row2 = Math.floor((w2 - 1) / 10);
        const col2 = (w2 - 1) % 10;
        const dist = Math.sqrt(Math.pow(row1 - row2, 2) + Math.pow(col1 - col2, 2));
        if (dist <= 1.5) empiricalGridCount++;
        if (w1 + w2 === 91) empiricalMirrorCount++;

        const str1 = w1.toString();
        const rev1 = parseInt(str1.split("").reverse().join(""), 10);
        if (rev1 >= 1 && rev1 <= 90 && rev1 === w2) empiricalMirrorCount++;

        if (w1 % 10 === w2 % 10) empiricalHarmonicCount++;
        if (row1 === row2) empiricalDecadeCount++;
      }
    }
  };

  if (Array.isArray(items)) {
    items.forEach(item => {
      if (item) {
        if (item.targetWinners) {
          processWinners(item.targetWinners);
        } else if (item.gagnants) {
          processWinners(item.gagnants);
        }
      }
    });
  }

  const safePairs = Math.max(1, totalPairsEvaluated);

  const computeCoeff = (count: number) => {
    const rate = count / safePairs;
    const sig = 1.0 / (1.0 + Math.exp(-25.0 * (rate - 0.05)));
    return parseFloat((0.15 + 0.45 * sig).toFixed(4));
  };

  return {
    cLinear: computeCoeff(empiricalLinearCount),
    cGrid: computeCoeff(empiricalGridCount),
    cMirror: computeCoeff(empiricalMirrorCount),
    cHarmonic: computeCoeff(empiricalHarmonicCount),
    cDecade: computeCoeff(empiricalDecadeCount)
  };
}

