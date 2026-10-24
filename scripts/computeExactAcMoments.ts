/**
 * Moments exacts de l'AC (nombre de différences distinctes - 4) pour 5 numéros sur 90.
 * Énumération exhaustive déterministe de C(90,5) = 43 949 268 combinaisons.
 *
 * Usage : npx tsx scripts/computeExactAcMoments.ts
 */
const N = 90;
const K = 5;
const stamp = new Int32Array(N + 1);
let generation = 0;
const histogram = new Int32Array(K * (K - 1) / 2 + 1);
let count = 0;

for (let a = 1; a <= N - 4; a++) {
  for (let b = a + 1; b <= N - 3; b++) {
    for (let c = b + 1; c <= N - 2; c++) {
      for (let d = c + 1; d <= N - 1; d++) {
        for (let e = d + 1; e <= N; e++) {
          generation++;
          let distinct = 0;
          const nums = [a, b, c, d, e];
          for (let i = 0; i < K; i++) {
            for (let j = i + 1; j < K; j++) {
              const diff = nums[j] - nums[i];
              if (stamp[diff] !== generation) {
                stamp[diff] = generation;
                distinct++;
              }
            }
          }
          histogram[distinct - (K - 1)]++;
          count++;
        }
      }
    }
  }
}

let mean = 0;
for (let ac = 0; ac < histogram.length; ac++) mean += ac * histogram[ac];
mean /= count;
let variance = 0;
for (let ac = 0; ac < histogram.length; ac++) variance += histogram[ac] * (ac - mean) ** 2;
variance /= count;
console.log(JSON.stringify({
  count,
  mean,
  variance,
  std: Math.sqrt(variance),
  distribution: Array.from(histogram).map((c, ac) => ({ ac, count: c, probability: c / count })),
}, null, 2));
