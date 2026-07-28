/**
 * Zero-Copy Transferable Objects Utility
 * Packs numeric arrays, draw histories, and 2D matrices into contiguous ArrayBuffers
 * to allow 0-overhead instant memory transfer between Main Thread and Web Workers via postMessage.
 */

export interface PackedHistory {
  historyBuffer: ArrayBuffer;
  drawCount: number;
  winningCount: number;
  totalCols: number;
}

export interface PackedMatrix {
  matrixBuffer: ArrayBuffer;
  rows: number;
  cols: number;
}

export interface PackedArray {
  arrayBuffer: ArrayBuffer;
  length: number;
}

/**
 * Packs DrawResult[] or { gagnants: number[], machine?: number[] }[] into an Int32Array ArrayBuffer.
 */
export function packHistory(history: { gagnants: number[]; machine?: number[] }[]): PackedHistory {
  if (!history || history.length === 0) {
    const empty = new Int32Array(0);
    return { historyBuffer: empty.buffer, drawCount: 0, winningCount: 0, totalCols: 0 };
  }

  const drawCount = history.length;
  const sample = history[0];
  const winningCount = sample.gagnants ? sample.gagnants.length : 5;
  const machineCount = sample.machine ? sample.machine.length : 0;
  const totalCols = winningCount + machineCount;

  const typedArr = new Int32Array(drawCount * totalCols);
  for (let i = 0; i < drawCount; i++) {
    const draw = history[i];
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
    historyBuffer: typedArr.buffer,
    drawCount,
    winningCount,
    totalCols,
  };
}

/**
 * Unpacks an ArrayBuffer (or Int32Array) back into lightweight DrawResult objects.
 * Supports transparent fallback if standard array is passed.
 */
export function unpackHistory(
  input: ArrayBuffer | Int32Array | { gagnants: number[]; machine?: number[] }[],
  drawCount?: number,
  winningCount: number = 5,
  totalCols: number = 5
): { gagnants: number[]; machine?: number[] }[] {
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
    draws[i] = { gagnants, machine };
  }

  return draws;
}

/**
 * Packs 2D number[][] matrix into Float64Array ArrayBuffer.
 */
export function packMatrix(matrix: number[][]): PackedMatrix {
  if (!matrix || matrix.length === 0) {
    return { matrixBuffer: new Float64Array(0).buffer, rows: 0, cols: 0 };
  }
  const rows = matrix.length;
  const cols = matrix[0]?.length || 0;
  const typedArr = new Float64Array(rows * cols);
  for (let r = 0; r < rows; r++) {
    const row = matrix[r];
    const offset = r * cols;
    for (let c = 0; c < cols; c++) {
      typedArr[offset + c] = row[c] || 0;
    }
  }
  return { matrixBuffer: typedArr.buffer, rows, cols };
}

/**
 * Unpacks ArrayBuffer into 2D number[][] matrix.
 */
export function unpackMatrix(
  input: ArrayBuffer | Float64Array | number[][],
  rows?: number,
  cols?: number
): number[][] {
  if (Array.isArray(input)) return input;
  if (!input || (input instanceof ArrayBuffer && input.byteLength === 0)) return [];

  const arr = input instanceof Float64Array ? input : new Float64Array(input);
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
 * Packs 1D number[] into Float64Array ArrayBuffer.
 */
export function packArray(arr: number[]): PackedArray {
  if (!arr || arr.length === 0) {
    return { arrayBuffer: new Float64Array(0).buffer, length: 0 };
  }
  const typedArr = Float64Array.from(arr);
  return { arrayBuffer: typedArr.buffer, length: arr.length };
}

/**
 * Unpacks 1D ArrayBuffer to number[].
 */
export function unpackArray(input: ArrayBuffer | Float64Array | number[]): number[] {
  if (Array.isArray(input)) return input;
  if (!input) return [];
  const arr = input instanceof Float64Array ? input : new Float64Array(input);
  return Array.from(arr);
}

/**
 * Traverses an object or array to discover all ArrayBuffers / TypedArray buffers
 * and pushes them to the transferables array for 0-copy postMessage transfers.
 */
export function collectTransferables(
  obj: unknown,
  transferables: Transferable[],
  visited = new WeakSet<object>()
): void {
  if (!obj || typeof obj !== 'object') return;
  if (visited.has(obj as object)) return;
  visited.add(obj as object);

  if (obj instanceof ArrayBuffer) {
    if (!transferables.includes(obj)) {
      transferables.push(obj);
    }
    return;
  }

  if (ArrayBuffer.isView(obj)) {
    if (obj.buffer && !transferables.includes(obj.buffer)) {
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

