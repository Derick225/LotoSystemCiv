/**
 * ============================================================================
 *           DETERMINISTIC QUASI-RANDOM (LOW DISCREPANCY) GENERATORS
 * ============================================================================
 * Implements canonical low-discrepancy Halton and Sobol sequences for
 * uniform combinatoric subspace exploration without clustering artifacts.
 * 
 * 100% Deterministic - Zero Magic Numbers - Fully Seedable.
 * ============================================================================
 */

/**
 * Halton Sequence Generator (Low-Discrepancy Multi-Dimensional Quasi-Random)
 * Generates sequences of quasi-random numbers using coprime bases (2, 3, 5, 7, 11, 13, 17, 19...).
 */
export class HaltonSequence {
  private index: number;
  private readonly bases: number[];

  constructor(dimension: number = 5, initialOffset: number = 1) {
    this.index = Math.max(1, initialOffset);
    // Bases premières canoniques pour jusqu'à 10 dimensions
    const primeBases = [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47];
    this.bases = primeBases.slice(0, Math.max(1, Math.min(primeBases.length, dimension)));
  }

  /**
   * Calcule la valeur de van der Corput pour l'indice `index` dans la base `base`.
   */
  public static vanDerCorput(index: number, base: number): number {
    let result = 0;
    let f = 1 / base;
    let i = index;
    while (i > 0) {
      result += f * (i % base);
      i = Math.floor(i / base);
      f /= base;
    }
    return result;
  }

  /**
   * Génère le prochain vecteur multi-dimensionnel quasi-aléatoire dans [0, 1)^d.
   */
  public nextVector(): number[] {
    const vec = this.bases.map(base => HaltonSequence.vanDerCorput(this.index, base));
    this.index++;
    return vec;
  }

  /**
   * Génère le prochain scalaire quasi-aléatoire dans [0, 1) sur la première base.
   */
  public next(): number {
    const val = HaltonSequence.vanDerCorput(this.index, this.bases[0]);
    this.index++;
    return val;
  }
}

/**
 * 1D Sobol Sequence Generator
 * Direction numbers derived canonically for 32-bit integer arithmetic.
 */
export class SobolSequence1D {
  private count: number;
  private x: number;

  constructor(initialOffset: number = 0) {
    this.count = Math.max(0, initialOffset);
    this.x = 0;
    for (let i = 0; i < this.count; i++) {
      this.step();
    }
  }

  private step(): void {
    // Find rightmost zero bit of count
    let c = this.count;
    let l = 0;
    while ((c & 1) === 1) {
      c >>= 1;
      l++;
    }
    // Direction number V_l = 1 << (31 - l)
    const v = (1 << (31 - l)) >>> 0;
    this.x = (this.x ^ v) >>> 0;
    this.count++;
  }

  public next(): number {
    this.step();
    return this.x / 4294967296.0;
  }
}
