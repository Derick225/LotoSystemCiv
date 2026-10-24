/**
 * Audit prédictif déterministe de l'historique réel `draw_results` (Supabase, lecture publique).
 *
 * Aucune donnée simulée, aucun aléatoire : toutes les valeurs de référence sont les moments
 * exacts du plan de tirage 5/90 (hypergéométrique multivarié) ou des transformations fixes
 * de l'historique. Sortie JSON complète dans node_modules/.cache/loto-predictive-audit/.
 *
 * Usage : npx tsx scripts/predictiveDataAudit.ts
 */
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { getDrawFullTimestamp, getDrawNetworkId, INTER_DRAW_NETWORKS } from '../src/config/networks';

const TOTAL = 90;
const PICK = 5;
const P = PICK / TOTAL;
const VAR_SINGLE = P * (1 - P); // variance du nombre d'apparitions par tirage
const COV_PAIR = -VAR_SINGLE / (TOTAL - 1); // covariance entre deux numéros sur un tirage
const DESIGN_EFFECT = (VAR_SINGLE - COV_PAIR) / VAR_SINGLE; // 1.0112 : surdispersion du chi²
const MEAN_OVERLAP = PICK * P; // 25/90
const VAR_OVERLAP = PICK * P * (1 - P) * (TOTAL - PICK) / (TOTAL - 1);
const NULL_MEAN_RANK = (TOTAL + 1) / 2;
const VAR_MEAN_RANK = (TOTAL * TOTAL - 1) / 12 / PICK; // variance de la moyenne des rangs de 5 gagnants
const P_AT_LEAST_3 = (choose(5, 3) * choose(85, 2) + choose(5, 4) * choose(85, 1) + 1) / choose(90, 5);

interface Draw {
  draw_name: string;
  date: string;
  gagnants: number[];
  machine: number[];
}

interface DrawSeries {
  name: string;
  network: 'hebdomadaire' | 'quotidien' | null;
  draws: Draw[];
}

// ---------------------------------------------------------------- statistiques exactes

function logGamma(x: number): number {
  const c = [
    76.18009172947146, -86.50532032941677, 24.01409824083091,
    -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5,
  ];
  let y = x;
  let tmp = x + 5.5;
  tmp -= (x + 0.5) * Math.log(tmp);
  let ser = 1.000000000190015;
  for (let j = 0; j < 6; j++) ser += c[j] / ++y;
  return -tmp + Math.log(2.5066282746310005 * ser / x);
}

function logChoose(n: number, k: number): number {
  if (k < 0 || k > n) return -Infinity;
  return logGamma(n + 1) - logGamma(k + 1) - logGamma(n - k + 1);
}

function choose(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  let r = 1;
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
  return r;
}

function gammaLowerSeries(a: number, x: number): number {
  let ap = a;
  let sum = 1 / a;
  let del = sum;
  for (let n = 1; n < 500; n++) {
    ap += 1;
    del *= x / ap;
    sum += del;
    if (Math.abs(del) < Math.abs(sum) * 1e-15) break;
  }
  return sum * Math.exp(-x + a * Math.log(x) - logGamma(a));
}

function gammaUpperCF(a: number, x: number): number {
  const tiny = 1e-300;
  let b = x + 1 - a;
  let c = 1 / tiny;
  let d = 1 / b;
  let h = d;
  for (let i = 1; i < 500; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < tiny) d = tiny;
    c = b + an / c;
    if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 1e-15) break;
  }
  return Math.exp(-x + a * Math.log(x) - logGamma(a)) * h;
}

function gammaUpper(a: number, x: number): number {
  if (x <= 0) return 1;
  return x < a + 1 ? 1 - gammaLowerSeries(a, x) : gammaUpperCF(a, x);
}

function chi2SF(x: number, df: number): number {
  return gammaUpper(df / 2, x / 2);
}

function normalSF(z: number): number {
  // Abramowitz & Stegun 7.1.26 via erfc asymptotique de haute précision
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const poly = t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  const tail = Math.exp(-z * z / 2) / Math.sqrt(2 * Math.PI) * poly;
  return z >= 0 ? tail : 1 - tail;
}

function twoSided(z: number): number {
  return Math.min(1, 2 * Math.min(normalSF(z), 1 - normalSF(z)));
}

function binomialSF(k: number, n: number, p: number): number {
  let total = 0;
  for (let i = k; i <= n; i++) {
    total += Math.exp(logChoose(n, i) + i * Math.log(p) + (n - i) * Math.log(1 - p));
  }
  return Math.min(1, total);
}

function bh(pairs: Array<{ key: string; p: number }>): Map<string, number> {
  const sorted = [...pairs].sort((a, b) => a.p - b.p || a.key.localeCompare(b.key));
  const q = new Map<string, number>();
  let running = 1;
  for (let i = sorted.length - 1; i >= 0; i--) {
    const value = Math.min(running, (sorted[i].p * sorted.length) / (i + 1));
    running = value;
    q.set(sorted[i].key, value);
  }
  return q;
}

function mean(xs: number[]): number {
  return xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0;
}

function variance(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return xs.reduce((s, x) => s + (x - m) * (x - m), 0) / (xs.length - 1);
}

function pearson(xs: number[], ys: number[]): number {
  const mx = mean(xs), my = mean(ys);
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < xs.length; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    dx += (xs[i] - mx) ** 2;
    dy += (ys[i] - my) ** 2;
  }
  return dx > 0 && dy > 0 ? num / Math.sqrt(dx * dy) : 0;
}

function quantize(x: number, digits = 4): number {
  return Number.isFinite(x) ? Number(x.toFixed(digits)) : 0;
}

// ---------------------------------------------------------------- collecte

function envFromExample(): { url: string; key: string } {
  const file = resolve(process.cwd(), '.env.example');
  const text = readFileSync(file, 'utf8');
  const url = process.env.VITE_SUPABASE_URL ?? text.match(/VITE_SUPABASE_URL=(.+)/)?.[1]?.trim() ?? '';
  const key = process.env.VITE_SUPABASE_ANON_KEY ?? text.match(/VITE_SUPABASE_ANON_KEY=(.+)/)?.[1]?.trim() ?? '';
  if (!url || !key) throw new Error('Configuration Supabase introuvable (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).');
  return { url, key };
}

async function fetchAllDraws(): Promise<Draw[]> {
  const { url, key } = envFromExample();
  const rows: Draw[] = [];
  const page = 1000;
  for (let from = 0; ; from += page) {
    const res = await fetch(
      `${url}/rest/v1/draw_results?select=draw_name,date,gagnants,machine&order=date.asc,draw_name.asc`,
      {
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
          Range: `${from}-${from + page - 1}`,
          'Range-Unit': 'items',
        },
      },
    );
    if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);
    const batch = (await res.json()) as Draw[];
    rows.push(...batch);
    if (batch.length < page) break;
  }
  return rows;
}

function toSeries(rows: Draw[]): DrawSeries[] {
  const map = new Map<string, Draw[]>();
  for (const row of rows) {
    const list = map.get(row.draw_name) ?? [];
    list.push(row);
    map.set(row.draw_name, list);
  }
  return [...map.entries()]
    .map(([name, draws]) => ({
      name,
      network: getDrawNetworkId(name),
      draws: draws.sort((a, b) =>
        getDrawFullTimestamp(a.date, a.draw_name) - getDrawFullTimestamp(b.date, b.draw_name)),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// ---------------------------------------------------------------- intégrité

function auditIntegrity(rows: Draw[]) {
  const duplicates: string[] = [];
  const seen = new Set<string>();
  const invalid: string[] = [];
  let machineDraws = 0;
  let machineGagnantIntersections = 0;
  const lengths = new Map<number, number>();
  const machineLengths = new Map<number, number>();

  for (const r of rows) {
    const key = `${r.draw_name.trim().toLowerCase()}|${r.date}`;
    if (seen.has(key)) duplicates.push(key);
    seen.add(key);

    const g = r.gagnants ?? [];
    lengths.set(g.length, (lengths.get(g.length) ?? 0) + 1);
    if (g.length !== PICK) invalid.push(`${key}: ${g.length} gagnants`);
    if (new Set(g).size !== g.length) invalid.push(`${key}: doublons gagnants`);
    if (g.some((n) => !Number.isInteger(n) || n < 1 || n > TOTAL)) invalid.push(`${key}: numéro hors [1,90]`);

    const m = r.machine ?? [];
    if (m.length > 0) {
      machineDraws++;
      machineLengths.set(m.length, (machineLengths.get(m.length) ?? 0) + 1);
      if (m.length !== PICK) invalid.push(`${key}: ${m.length} machine`);
      if (new Set(m).size !== m.length) invalid.push(`${key}: doublons machine`);
      if (m.some((n) => !Number.isInteger(n) || n < 1 || n > TOTAL)) invalid.push(`${key}: machine hors [1,90]`);
      if (m.some((n) => g.includes(n))) machineGagnantIntersections++;
    }
  }

  const dates = rows.map((r) => r.date).sort();
  return {
    rows: rows.length,
    distinctDraws: new Set(rows.map((r) => r.draw_name)).size,
    dateMin: dates[0],
    dateMax: dates[dates.length - 1],
    duplicates,
    invalid,
    winnerLengthDistribution: Object.fromEntries([...lengths.entries()].sort((a, b) => a[0] - b[0])),
    machineLengthDistribution: Object.fromEntries([...machineLengths.entries()].sort((a, b) => a[0] - b[0])),
    machineDraws,
    machineGagnantIntersections,
  };
}

// ---------------------------------------------------------------- uniformité / dérive

function countVector(draws: Draw[]): Float64Array {
  const counts = new Float64Array(TOTAL + 1);
  for (const d of draws) for (const n of d.gagnants) counts[n]++;
  return counts;
}

function uniformity(draws: Draw[], label: string) {
  const n = draws.length;
  const counts = countVector(draws);
  const expected = n * P;
  let q = 0;
  for (let i = 1; i <= TOTAL; i++) q += (counts[i] - expected) ** 2 / (n * VAR_SINGLE);
  const qScaled = q / DESIGN_EFFECT;
  const pValue = chi2SF(qScaled, TOTAL - 1);
  let top = 1, bottom = 1;
  for (let i = 2; i <= TOTAL; i++) {
    if (counts[i] > counts[top]) top = i;
    if (counts[i] < counts[bottom]) bottom = i;
  }
  const empirical = Array.from({ length: TOTAL }, (_, i) => counts[i + 1] / (n * PICK));
  const entropy = -empirical.reduce((s, f) => s + (f > 0 ? f * Math.log(f) : 0), 0);
  const entropyCorrected = entropy + (TOTAL - 1) / (2 * n * PICK);
  const zTop = (counts[top] - expected) / Math.sqrt(n * VAR_SINGLE);
  return {
    label,
    draws: n,
    expectedPerNumber: quantize(expected, 2),
    topNumber: top,
    topCount: counts[top],
    topZ: quantize(zTop, 2),
    bottomNumber: bottom,
    bottomCount: counts[bottom],
    chi2: quantize(q, 2),
    chi2Scaled: quantize(qScaled, 2),
    chi2PValue: quantize(pValue, 5),
    entropyCorrected: quantize(entropyCorrected, 5),
    entropyRatio: quantize(entropyCorrected / Math.log(TOTAL), 5),
  };
}

function splitHalfPersistence(draws: Draw[]) {
  const half = Math.floor(draws.length / 2);
  if (half < 20) return null;
  const first = countVector(draws.slice(0, half));
  const second = countVector(draws.slice(half));
  const r = pearson(
    Array.from({ length: TOTAL }, (_, i) => first[i + 1]),
    Array.from({ length: TOTAL }, (_, i) => second[i + 1]),
  );
  // Ecart-type exact de r sous indépendance des deux moitiés (covariance hypergéométrique)
  const sdNull = Math.sqrt((TOTAL - 1) / (TOTAL * TOTAL));
  return { r: quantize(r, 3), z: quantize(r / sdNull, 2), halfSize: half };
}

function sumStats(draws: Draw[]) {
  const sums = draws.map((d) => d.gagnants.reduce((s, n) => s + n, 0));
  const amps = draws.map((d) => Math.max(...d.gagnants) - Math.min(...d.gagnants));
  const meanSum = mean(sums);
  const varSum = variance(sums);
  const theoreticalMean = PICK * (TOTAL + 1) / 2;
  const theoreticalVar = PICK * (TOTAL * TOTAL - 1) / 12 * (TOTAL - PICK) / (TOTAL - 1);
  let lag = 0, lagDen = 0;
  const ms = meanSum;
  for (let i = 1; i < sums.length; i++) {
    lag += (sums[i] - ms) * (sums[i - 1] - ms);
    lagDen += (sums[i] - ms) ** 2;
  }
  const lag1 = lagDen > 0 ? lag / lagDen : 0;
  const theoreticalAmp = ((PICK - 1) / (PICK + 1)) * (TOTAL + 1);
  return {
    draws: draws.length,
    meanSum: quantize(meanSum, 2),
    theoreticalMeanSum: quantize(theoreticalMean, 2),
    sumMeanZ: quantize((meanSum - theoreticalMean) / Math.sqrt(theoreticalVar / draws.length), 2),
    sdSum: quantize(Math.sqrt(varSum), 2),
    theoreticalSdSum: quantize(Math.sqrt(theoreticalVar), 2),
    lag1Sum: quantize(lag1, 3),
    lag1Z: quantize(lag1 * Math.sqrt(draws.length), 2),
    meanAmplitude: quantize(mean(amps), 2),
    theoreticalMeanAmplitude: quantize(theoreticalAmp, 2),
  };
}

// ---------------------------------------------------------------- dépendances

function hyperOverlapZ(observed: number, pairs: number, setSize = PICK): number {
  const mu = PICK * setSize / TOTAL;
  const va = PICK * (setSize / TOTAL) * (1 - setSize / TOTAL) * (TOTAL - PICK) / (TOTAL - 1);
  return (observed - pairs * mu) / Math.sqrt(pairs * va);
}

function carryOver(series: DrawSeries[]) {
  let pairs = 0, overlapSum = 0, zero = 0;
  for (const s of series) {
    for (let i = 1; i < s.draws.length; i++) {
      const prev = new Set(s.draws[i - 1].gagnants);
      const cur = s.draws[i].gagnants;
      const o = cur.filter((n) => prev.has(n)).length;
      pairs++;
      overlapSum += o;
      if (o === 0) zero++;
    }
  }
  const pZero = choose(TOTAL - PICK, PICK) / choose(TOTAL, PICK);
  return {
    pairs,
    observedOverlap: overlapSum,
    meanOverlap: quantize(overlapSum / pairs, 4),
    expectedOverlap: quantize(MEAN_OVERLAP, 4),
    z: quantize(hyperOverlapZ(overlapSum, pairs), 2),
    zeroRate: quantize(zero / pairs, 4),
    expectedZeroRate: quantize(pZero, 4),
  };
}

function sameSlotNextDay(series: DrawSeries[]) {
  let pairs = 0, sum = 0;
  for (const s of series) {
    for (let i = 1; i < s.draws.length; i++) {
      const prev = new Set(s.draws[i - 1].gagnants);
      sum += s.draws[i].gagnants.filter((n) => prev.has(n)).length;
      pairs++;
    }
  }
  return { pairs, meanOverlap: quantize(sum / pairs, 4), z: quantize(hyperOverlapZ(sum, pairs), 2) };
}

function interDrawEdges(rows: Draw[], series: DrawSeries[]) {
  const edgeStats = new Map<string, {
    pairs: number; sum: number; mirror: number; mirrorExp: number; mirrorVar: number;
    complement: number; machineToNext: number; machinePairs: number;
  }>();
  const bump = (key: string) => {
    let s = edgeStats.get(key);
    if (!s) {
      s = {
        pairs: 0, sum: 0, mirror: 0, mirrorExp: 0, mirrorVar: 0,
        complement: 0, machineToNext: 0, machinePairs: 0,
      };
      edgeStats.set(key, s);
    }
    return s;
  };
  const mirror = (n: number) => {
    if (n < 10) return n * 10 <= 90 ? n * 10 : n;
    if (n % 10 === 0) return n / 10;
    const rev = parseInt(String(n).split('').reverse().join(''), 10);
    return rev >= 1 && rev <= TOTAL ? rev : n;
  };

  for (const netSeries of series) {
    const a = netSeries.draws;
    for (let i = 1; i < a.length; i++) {
      const prev = a[i - 1], cur = a[i];
      if (getDrawNetworkId(prev.draw_name) !== getDrawNetworkId(cur.draw_name)) continue;
      const setPrev = new Set(prev.gagnants);
      const s = bump(`${prev.draw_name} -> ${cur.draw_name}`);
      s.pairs++;
      s.sum += cur.gagnants.filter((n) => setPrev.has(n)).length;
      const mirrorSet = new Set(prev.gagnants.map(mirror));
      s.mirror += cur.gagnants.filter((n) => mirrorSet.has(n)).length;
      const k = mirrorSet.size;
      s.mirrorExp += PICK * k / TOTAL;
      s.mirrorVar += PICK * (k / TOTAL) * (1 - k / TOTAL) * (TOTAL - PICK) / (TOTAL - 1);
      const compSet = new Set(prev.gagnants.map((n) => TOTAL + 1 - n));
      s.complement += cur.gagnants.filter((n) => compSet.has(n)).length;
      if (prev.machine && prev.machine.length > 0) {
        const machineSet = new Set(prev.machine);
        s.machinePairs++;
        s.machineToNext += cur.gagnants.filter((n) => machineSet.has(n)).length;
      }
    }
  }

  let leakagePairs = 0, leakageSum = 0;
  const byDate = new Map<string, Draw[]>();
  for (const r of rows) {
    const list = byDate.get(r.date) ?? [];
    list.push(r);
    byDate.set(r.date, list);
  }
  const dates = [...byDate.keys()].sort();
  for (let di = 1; di < dates.length; di++) {
    const prevDay = byDate.get(dates[di - 1])!;
    const curDay = byDate.get(dates[di])!;
    for (const a of prevDay) {
      for (const b of curDay) {
        const netA = getDrawNetworkId(a.draw_name);
        const netB = getDrawNetworkId(b.draw_name);
        if (netA && netB && netA !== netB) {
          leakagePairs++;
          const setA = new Set(a.gagnants);
          leakageSum += b.gagnants.filter((n) => setA.has(n)).length;
        }
      }
    }
  }

  const edges = [...edgeStats.entries()]
    .map(([key, s]) => ({
      edge: key,
      pairs: s.pairs,
      overlapMean: quantize(s.sum / s.pairs, 4),
      overlapZ: quantize(hyperOverlapZ(s.sum, s.pairs), 2),
      mirrorMean: quantize(s.mirror / s.pairs, 4),
      mirrorZ: quantize((s.mirror - s.mirrorExp) / Math.sqrt(Math.max(1e-12, s.mirrorVar)), 2),
      complementMean: quantize(s.complement / s.pairs, 4),
      complementZ: quantize(hyperOverlapZ(s.complement, s.pairs), 2),
      machineToNextMean: s.machinePairs ? quantize(s.machineToNext / s.machinePairs, 4) : null,
      machineToNextZ: s.machinePairs ? quantize(hyperOverlapZ(s.machineToNext, s.machinePairs), 2) : null,
      machinePairs: s.machinePairs,
    }))
    .sort((a, b) => a.edge.localeCompare(b.edge));
  return {
    edges,
    crossNetworkLeakage: {
      pairs: leakagePairs,
      meanOverlap: quantize(leakageSum / leakagePairs, 4),
      z: quantize(hyperOverlapZ(leakageSum, leakagePairs), 2),
    },
  };
}

function sameDrawMachineTransfer(rows: Draw[]) {
  let pairs = 0, nextHits = 0, sameHits = 0;
  const byDraw = new Map<string, Draw[]>();
  for (const r of rows) {
    const list = byDraw.get(r.draw_name) ?? [];
    list.push(r);
    byDraw.set(r.draw_name, list);
  }
  for (const list of byDraw.values()) {
    list.sort((a, b) => getDrawFullTimestamp(a.date, a.draw_name) - getDrawFullTimestamp(b.date, b.draw_name));
    for (let i = 0; i < list.length; i++) {
      const m = list[i].machine ?? [];
      if (m.length === 0) continue;
      const set = new Set(m);
      sameHits += list[i].gagnants.filter((n) => set.has(n)).length;
      if (i + 1 < list.length) {
        pairs++;
        nextHits += list[i + 1].gagnants.filter((n) => set.has(n)).length;
      }
    }
  }
  return {
    nextDrawPairs: pairs,
    nextDrawMeanOverlap: quantize(nextHits / Math.max(1, pairs), 4),
    nextDrawExpected: quantize(MEAN_OVERLAP, 4),
    nextDrawZ: quantize(hyperOverlapZ(nextHits, Math.max(1, pairs)), 2),
    sameDrawHits: sameHits,
  };
}

function pairCooccurrence(draws: Draw[]) {
  const n = draws.length;
  const counts = new Float64Array((TOTAL + 1) * (TOTAL + 1));
  for (const d of draws) {
    for (let i = 0; i < d.gagnants.length; i++) {
      for (let j = i + 1; j < d.gagnants.length; j++) {
        const a = Math.min(d.gagnants[i], d.gagnants[j]);
        const b = Math.max(d.gagnants[i], d.gagnants[j]);
        counts[a * (TOTAL + 1) + b]++;
      }
    }
  }
  const pPair = choose(PICK, 2) / choose(TOTAL, 2);
  const tests: Array<{ key: string; p: number; count: number; expected: number }> = [];
  let maxCount = 0, maxKey = '';
  for (let a = 1; a <= TOTAL; a++) {
    for (let b = a + 1; b <= TOTAL; b++) {
      const c = counts[a * (TOTAL + 1) + b];
      if (c > maxCount) { maxCount = c; maxKey = `${a}-${b}`; }
      const p = binomialSF(c, n, pPair);
      tests.push({ key: `${a}-${b}`, p, count: c, expected: n * pPair });
    }
  }
  const q = bh(tests);
  const significant = tests.filter((t) => (q.get(t.key) ?? 1) < 0.10);
  return {
    draws: n,
    expectedCountPerPair: quantize(n * pPair, 3),
    maxPair: maxKey,
    maxCount,
    maxZ: quantize((maxCount - n * pPair) / Math.sqrt(n * pPair * (1 - pPair)), 2),
    bh10Significant: significant.length,
    significantPairs: significant
      .sort((a, b) => (q.get(a.key) ?? 1) - (q.get(b.key) ?? 1))
      .slice(0, 10)
      .map((t) => ({ pair: t.key, count: t.count, expected: quantize(t.expected, 2), q: quantize(q.get(t.key) ?? 1, 4) })),
  };
}

// ---------------------------------------------------------------- backtest walk-forward

type StrategyKey =
  | 'hot' | 'cold' | 'gap' | 'affinity' | 'blend'
  | 'previous_winners' | 'previous_machine' | 'previous_mirror' | 'previous_complement';

interface StrategySpec { key: StrategyKey; window: number | 'all' }

const WINDOWS: Array<number | 'all'> = [30, 60, 120, 'all'];
const STRATEGIES: StrategySpec[] = [
  ...WINDOWS.map((window) => ({ key: 'hot' as const, window })),
  ...WINDOWS.map((window) => ({ key: 'cold' as const, window })),
  ...WINDOWS.map((window) => ({ key: 'gap' as const, window })),
  ...WINDOWS.map((window) => ({ key: 'affinity' as const, window })),
  ...WINDOWS.map((window) => ({ key: 'blend' as const, window })),
  { key: 'previous_winners', window: 'all' },
  { key: 'previous_machine', window: 'all' },
  { key: 'previous_mirror', window: 'all' },
  { key: 'previous_complement', window: 'all' },
];

function strategyScores(
  spec: StrategySpec,
  history: Draw[],
  cooc: Float64Array,
  appearances: Float64Array,
  lastDraw: Draw,
): Float64Array {
  const scores = new Float64Array(TOTAL + 1);
  const n = history.length;
  const windowSize = spec.window === 'all' ? n : Math.min(spec.window, n);
  const start = n - windowSize;
  const counts = new Float64Array(TOTAL + 1);
  const lastSeen = new Int32Array(TOTAL + 1).fill(-1);
  for (let t = 0; t < n; t++) {
    for (const num of history[t].gagnants) {
      if (t >= start) counts[num]++;
      lastSeen[num] = t;
    }
  }
  const recent = lastDraw.gagnants;
  const expectedGap = TOTAL / PICK;
  const mirror = (x: number) => {
    if (x < 10) return x * 10 <= 90 ? x * 10 : x;
    if (x % 10 === 0) return x / 10;
    const rev = parseInt(String(x).split('').reverse().join(''), 10);
    return rev >= 1 && rev <= TOTAL ? rev : x;
  };

  const hot = new Float64Array(TOTAL + 1);
  const gap = new Float64Array(TOTAL + 1);
  const aff = new Float64Array(TOTAL + 1);

  for (let num = 1; num <= TOTAL; num++) {
    hot[num] = counts[num];
    gap[num] = (lastSeen[num] < 0 ? n + 1 : n - lastSeen[num]) / expectedGap;
    let s = 0;
    for (const j of recent) {
      const co = cooc[num * (TOTAL + 1) + j] + cooc[j * (TOTAL + 1) + num];
      s += (co + 1) / (appearances[j] + TOTAL);
    }
    aff[num] = s;
  }

  for (let num = 1; num <= TOTAL; num++) {
    switch (spec.key) {
      case 'hot': scores[num] = hot[num]; break;
      case 'cold': scores[num] = -hot[num]; break;
      case 'gap': scores[num] = gap[num]; break;
      case 'affinity': scores[num] = aff[num]; break;
      case 'previous_winners': scores[num] = recent.includes(num) ? 1 : 0; break;
      case 'previous_machine': scores[num] = lastDraw.machine?.includes(num) ? 1 : 0; break;
      case 'previous_mirror': scores[num] = recent.some((x) => mirror(x) === num) ? 1 : 0; break;
      case 'previous_complement': scores[num] = recent.some((x) => TOTAL + 1 - x === num) ? 1 : 0; break;
      case 'blend': scores[num] = 0; break;
    }
  }

  if (spec.key === 'blend') {
    const z = (arr: Float64Array) => {
      const values = Array.from({ length: TOTAL }, (_, i) => arr[i + 1]);
      const m = mean(values);
      const sd = Math.sqrt(variance(values));
      return values.map((v) => (sd > 0 ? (v - m) / sd : 0));
    };
    const zh = z(hot), zg = z(gap), za = z(aff);
    for (let num = 1; num <= TOTAL; num++) scores[num] = zh[num - 1] + zg[num - 1] + za[num - 1];
  }
  return scores;
}

function evaluateBacktest(series: DrawSeries[]) {
  interface Row {
    strategy: string;
    scope: string;
    draws: number;
    meanRank: number;
    rankZ: number;
    hits5Mean: number;
    hits5Z: number;
    hits10Mean: number;
    ge3: number;
    expectedGe3: number;
    top1: number;
    brier: number;
    brierSkill: number;
    p: number;
  }
  const scopes: Array<{ key: string; list: DrawSeries[] }> = [
    { key: 'global', list: series },
    { key: 'hebdomadaire', list: series.filter((s) => s.network === 'hebdomadaire') },
    { key: 'quotidien', list: series.filter((s) => s.network === 'quotidien') },
  ];
  const rows: Row[] = [];
  const perDrawRows: Array<Row & { draw: string }> = [];

  for (const scope of scopes) {
    for (const spec of STRATEGIES) {
      const perDraw: Array<{ draw: string; rank: number; hits5: number; hits10: number; ge3: number; top1: number }> = [];
      for (const s of scope.list) {
        const draws = s.draws;
        const cooc = new Float64Array((TOTAL + 1) * (TOTAL + 1));
        const appearances = new Float64Array(TOTAL + 1);
        for (let t = 1; t < draws.length; t++) {
          // met à jour avec le tirage t-1 avant de prédire t
          const prev = draws[t - 1];
          for (let i = 0; i < prev.gagnants.length; i++) {
            appearances[prev.gagnants[i]]++;
            for (let j = i + 1; j < prev.gagnants.length; j++) {
              const a = Math.min(prev.gagnants[i], prev.gagnants[j]);
              const b = Math.max(prev.gagnants[i], prev.gagnants[j]);
              cooc[a * (TOTAL + 1) + b]++;
              cooc[b * (TOTAL + 1) + a]++;
            }
          }
          const burnIn = Math.max(1, Math.ceil(draws.length * 0.2));
          if (t < burnIn) continue;
          const window = spec.window === 'all' ? Infinity : spec.window;
          const trainStart = window === Infinity ? 0 : Math.max(0, t - window);
          if (t - trainStart < 10) continue;
          if (spec.key === 'previous_machine' && (!prev.machine || prev.machine.length === 0)) continue;
          const history = draws.slice(trainStart, t);
          const lastDraw = spec.key.startsWith('previous_') ? prev : draws[t - 1];
          const scores = strategyScores(spec, history, cooc, appearances, lastDraw);
          const ranked = Array.from({ length: TOTAL }, (_, i) => i + 1)
            .sort((a, b) => scores[b] - scores[a] || a - b);
          const winners = new Set(draws[t].gagnants);
          const rankOf = new Map<number, number>();
          ranked.forEach((num, idx) => rankOf.set(num, idx + 1));
          const winnerRanks = draws[t].gagnants.map((n) => rankOf.get(n) ?? TOTAL);
          const hits5 = ranked.slice(0, 5).filter((n) => winners.has(n)).length;
          const hits10 = ranked.slice(0, 10).filter((n) => winners.has(n)).length;
          perDraw.push({
            draw: s.name,
            rank: mean(winnerRanks),
            hits5,
            hits10,
            ge3: hits5 >= 3 ? 1 : 0,
            top1: winners.has(ranked[0]) ? 1 : 0,
          });
        }
      }

      if (perDraw.length === 0) continue;
      const m = perDraw.length;
      const meanRank = mean(perDraw.map((r) => r.rank));
      const rankZ = (meanRank - NULL_MEAN_RANK) / Math.sqrt(VAR_MEAN_RANK / m);
      const hits5Mean = mean(perDraw.map((r) => r.hits5));
      const hits5Z = (hits5Mean - MEAN_OVERLAP) / Math.sqrt(VAR_OVERLAP / m);
      const brier = mean(perDraw.map((r) => (2 / TOTAL) * (PICK - r.hits5)));
      const uniformBrier = PICK / TOTAL * (1 - PICK / TOTAL);
      const row: Row = {
        strategy: `${spec.key}:${spec.window}`,
        scope: scope.key,
        draws: m,
        meanRank: quantize(meanRank, 3),
        rankZ: quantize(rankZ, 2),
        hits5Mean: quantize(hits5Mean, 4),
        hits5Z: quantize(hits5Z, 2),
        hits10Mean: quantize(mean(perDraw.map((r) => r.hits10)), 4),
        ge3: perDraw.reduce((s, r) => s + r.ge3, 0),
        expectedGe3: quantize(m * P_AT_LEAST_3, 2),
        top1: perDraw.reduce((s, r) => s + r.top1, 0),
        brier: quantize(brier, 5),
        brierSkill: quantize(1 - brier / uniformBrier, 4),
        p: quantize(twoSided(rankZ), 4),
      };
      rows.push(row);

      // tests par tirage (famille corrigée séparément)
      const perSpecPerDraw = new Map<string, number[]>();
      for (const r of perDraw) {
        const list = perSpecPerDraw.get(r.draw) ?? [];
        list.push(r.rank);
        perSpecPerDraw.set(r.draw, list);
      }
      for (const [draw, ranks] of perSpecPerDraw) {
        const mm = ranks.length;
        const mr = mean(ranks);
        const z = (mr - NULL_MEAN_RANK) / Math.sqrt(VAR_MEAN_RANK / mm);
        perDrawRows.push({
          ...row,
          draw,
          draws: mm,
          meanRank: quantize(mr, 3),
          rankZ: quantize(z, 2),
          p: quantize(twoSided(z), 4),
          hits5Mean: 0,
          hits5Z: 0,
          hits10Mean: 0,
          ge3: 0,
          expectedGe3: 0,
          top1: 0,
          brier: 0,
          brierSkill: 0,
        });
      }
    }
  }

  const pooledQ = bh(rows.map((r) => ({ key: `${r.scope}|${r.strategy}`, p: r.p })));
  const perDrawQ = bh(perDrawRows.map((r) => ({ key: `${r.draw}|${r.strategy}`, p: r.p })));
  const withQ = rows.map((r) => ({ ...r, q: quantize(pooledQ.get(`${r.scope}|${r.strategy}`) ?? 1, 4) }));
  const perDrawWithQ = perDrawRows
    .map((r) => ({ ...r, q: quantize(perDrawQ.get(`${r.draw}|${r.strategy}`) ?? 1, 4) }))
    .sort((a, b) => a.q - b.q || a.draw.localeCompare(b.draw));

  return {
    nullReferences: {
      meanRank: NULL_MEAN_RANK,
      sdMeanRankPerDraw: quantize(Math.sqrt(VAR_MEAN_RANK), 3),
      hits5: quantize(MEAN_OVERLAP, 4),
      sdHits5PerDraw: quantize(Math.sqrt(VAR_OVERLAP), 4),
      pAtLeast3: P_AT_LEAST_3,
      uniformBrier: quantize(P * (1 - P), 5),
    },
    pooled: withQ.sort((a, b) => a.scope.localeCompare(b.scope) || a.q - b.q || a.strategy.localeCompare(b.strategy)),
    bestPerDraw: perDrawWithQ.slice(0, 20),
    perDrawSignificantBH05: perDrawWithQ.filter((r) => r.q < 0.05).length,
    perDrawTests: perDrawWithQ.length,
  };
}

// ---------------------------------------------------------------- main

async function main() {
  const rows = await fetchAllDraws();
  const series = toSeries(rows);
  const globalDraws = [...rows].sort((a, b) =>
    getDrawFullTimestamp(a.date, a.draw_name) - getDrawFullTimestamp(b.date, b.draw_name));

  const integrity = auditIntegrity(rows);

  const uniformityPerDraw = series
    .map((s) => ({ draw: s.name, network: s.network, ...uniformity(s.draws, s.name) }))
    .sort((a, b) => a.chi2PValue - b.chi2PValue);
  const qUniformity = bh(uniformityPerDraw.map((u) => ({ key: u.draw, p: u.chi2PValue })));
  const uniformityWithQ = uniformityPerDraw.map((u) => ({ ...u, q: quantize(qUniformity.get(u.draw) ?? 1, 4) }));

  const byNetwork = (['hebdomadaire', 'quotidien'] as const).map((net) => {
    const netSeries = series.filter((s) => s.network === net);
    const netDraws = netSeries.flatMap((s) => s.draws);
    return {
      network: net,
      ...uniformity(netDraws, net),
      splitHalf: splitHalfPersistence(netDraws),
      sums: sumStats(netDraws),
      carryOver: carryOver(netSeries),
      sameSlotNextDay: sameSlotNextDay(netSeries),
      pairCooccurrence: pairCooccurrence(netDraws),
    };
  });

  const global = {
    ...uniformity(globalDraws, 'global'),
    splitHalf: splitHalfPersistence(globalDraws),
    sums: sumStats(globalDraws),
    carryOver: carryOver(series),
    pairCooccurrence: pairCooccurrence(globalDraws),
  };

  const edges = interDrawEdges(globalDraws, series);
  const machine = sameDrawMachineTransfer(globalDraws);
  const persistence = series
    .map((s) => ({ draw: s.name, network: s.network, ...splitHalfPersistence(s.draws) }))
    .sort((a, b) => (a?.z ?? 0) - (b?.z ?? 0));

  const backtest = evaluateBacktest(series);

  const report = {
    generatedAt: new Date().toISOString(),
    meta: {
      rows: rows.length,
      draws: series.length,
      networks: Object.fromEntries(
        (['hebdomadaire', 'quotidien'] as const).map((net) => [net, series.filter((s) => s.network === net).length]),
      ),
      dateMin: integrity.dateMin,
      dateMax: integrity.dateMax,
      windowDefinitions: WINDOWS,
      strategyCount: STRATEGIES.length,
    },
    integrity,
    uniformity: { global, perDraw: uniformityWithQ, byNetwork },
    dependence: {
      carryOver: global.carryOver,
      edges,
      machineTransfer: machine,
      pairCooccurrence: global.pairCooccurrence,
      sums: global.sums,
    },
    persistence,
    backtest,
  };

  const outDir = resolve(process.cwd(), 'node_modules/.cache/loto-predictive-audit');
  mkdirSync(outDir, { recursive: true });
  const outFile = resolve(outDir, 'audit.json');
  writeFileSync(outFile, JSON.stringify(report, null, 2), 'utf8');

  // -------------------------------------------------------------- digest
  console.log(`\n=== AUDIT PREDICTIF (${rows.length} tirages, ${series.length} tirages distincts) ===`);
  console.log(`Periode : ${integrity.dateMin} -> ${integrity.dateMax}`);
  console.log(`Integrite : doublons=${integrity.duplicates.length}, invalides=${integrity.invalid.length}, machine∩gagnants=${integrity.machineGagnantIntersections}`);
  console.log(`Uniformite globale : chi2=${global.chi2} p=${global.chi2PValue} H/Hmax=${global.entropyRatio} top=${global.topNumber}(z=${global.topZ})`);
  for (const u of uniformityWithQ.slice(0, 5)) {
    console.log(`  [uniformite] ${u.draw.padEnd(18)} chi2=${u.chi2} p=${u.chi2PValue} q=${u.q}`);
  }
  for (const net of byNetwork) {
    console.log(`  [reseau ${net.network}] p=${net.chi2PValue} carry-over=${net.carryOver.meanOverlap} (z=${net.carryOver.z}) split-half r=${net.splitHalf?.r} (z=${net.splitHalf?.z})`);
  }
  console.log(`Carry-over global : ${global.carryOver.meanOverlap} vs ${global.carryOver.expectedOverlap} (z=${global.carryOver.z}), P0=${global.carryOver.zeroRate} vs ${global.carryOver.expectedZeroRate}`);
  console.log(`Machine -> tirage suivant : ${machine.nextDrawMeanOverlap} vs ${machine.nextDrawExpected} (z=${machine.nextDrawZ}, n=${machine.nextDrawPairs})`);
  console.log(`Paires : max ${global.pairCooccurrence.maxPair}=${global.pairCooccurrence.maxCount} (z=${global.pairCooccurrence.maxZ}), BH10=${global.pairCooccurrence.bh10Significant}`);
  console.log(`Somme : moyenne ${global.sums.meanSum} vs ${global.sums.theoreticalMeanSum} (z=${global.sums.sumMeanZ}), lag1 z=${global.sums.lag1Z}`);
  console.log(`Fuites inter-reseaux : ${edges.crossNetworkLeakage.meanOverlap} vs ${MEAN_OVERLAP.toFixed(4)} (z=${edges.crossNetworkLeakage.z})`);
  console.log(`\n--- Edges inter-tirages (top 8 par |z|) ---`);
  const topEdges = [...edges.edges].sort((a, b) => Math.abs(b.overlapZ) - Math.abs(a.overlapZ)).slice(0, 8);
  for (const e of topEdges) {
    console.log(`  ${e.edge.padEnd(34)} overlap=${e.overlapMean} z=${e.overlapZ} | miroir z=${e.mirrorZ} complement z=${e.complementZ} | machine->suivant ${e.machineToNextMean ?? '-'} z=${e.machineToNextZ ?? '-'}`);
  }
  console.log(`\n--- Backtest walk-forward (references : rang=${NULL_MEAN_RANK}, hits5=${MEAN_OVERLAP.toFixed(4)}, P(>=3)=${P_AT_LEAST_3.toExponential(3)}, Brier uniforme=${(P * (1 - P)).toFixed(5)}) ---`);
  for (const r of backtest.pooled.filter((x) => x.scope === 'global').slice(0, 14)) {
    console.log(`  ${r.strategy.padEnd(24)} n=${r.draws} rang=${r.meanRank} z=${r.rankZ} q=${r.q} hits5=${r.hits5Mean} z5=${r.hits5Z} ge3=${r.ge3}/${r.expectedGe3} brier=${r.brier} skill=${r.brierSkill}`);
  }
  console.log(`Tests par tirage significatifs BH<0.05 : ${backtest.perDrawSignificantBH05}/${backtest.perDrawTests}`);
  if (backtest.perDrawSignificantBH05 > 0) {
    for (const r of backtest.bestPerDraw.filter((x) => x.q < 0.05).slice(0, 10)) {
      console.log(`  [per-draw] ${r.draw} ${r.strategy} rang=${r.meanRank} z=${r.rankZ} q=${r.q}`);
    }
  }
  console.log(`\nRapport complet : ${outFile}\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
