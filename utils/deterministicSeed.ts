/**
 * Utilitaires de dérivation de seeds déterministes (AGENTS.md — 100% reproductible).
 *
 * Remplace la dérivation de seed depuis un timestamp de date (instable selon
 * le fuseau horaire et non liée au contenu) par un hachage FNV-1a 64-bit du
 * contenu complet de l'historique : mêmes tirages => même seed, partout.
 */

interface SeedableDraw {
  date?: string | number | Date;
  gagnants?: Array<number | string> | null;
  winners?: Array<number | string> | null;
  id?: string | number;
}

/** Hachage FNV-1a 64-bit réduit à 53 bits (précision entière Number) */
export function fnv1a64To53(bytes: ArrayLike<number>): number {
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  const mask = 0xffffffffffffffffn;
  for (let i = 0; i < bytes.length; i++) {
    hash = (hash ^ BigInt(bytes[i] & 0xff)) & mask;
    hash = (hash * prime) & mask;
  }
  return Number(hash % (1n << 53n));
}

/**
 * Dérive un seed déterministe du contenu d'un historique de tirages.
 * Hash FNV-1a sur (date, numéros gagnants) de chaque tirage — ordre chronologique inclus.
 */
export function deriveSeedFromHistory(history: ReadonlyArray<SeedableDraw>): number {
  if (!history || history.length === 0) return 0;
  const bytes: number[] = [];
  for (const draw of history) {
    const dateStr = draw.date != null ? String(draw.date) : '';
    for (let i = 0; i < dateStr.length; i++) bytes.push(dateStr.charCodeAt(i) & 0xff);
    bytes.push(0xff); // séparateur canonique
    const numbers = draw.gagnants ?? draw.winners ?? [];
    for (const n of numbers) {
      const v = typeof n === 'string' ? parseInt(n, 10) : n;
      if (Number.isFinite(v)) bytes.push(Math.max(0, Math.min(255, Math.round(v as number))));
    }
    bytes.push(0xfe); // séparateur de tirage
  }
  // Seed jamais nul (le LCG Rust remplace 0 par une constante canonique ; on reste cohérent)
  return fnv1a64To53(bytes) || 0x9e3779b9;
}
