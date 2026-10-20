/**
 * Utilitaires de dérivation de seeds déterministes (AGENTS.md — 100% reproductible).
 *
 * Remplace la dérivation de seed depuis un timestamp de date (instable selon
 * le fuseau horaire et non liée au contenu) par un hachage FNV-1a 64-bit du
 * contenu complet de l'historique : mêmes tirages => même seed, partout.
 */

interface SeedableDraw {
  date?: string | number | Date;
  drawName?: string;
  gagnants?: Array<number | string> | null;
  winners?: Array<number | string> | null;
  machine?: Array<number | string>;
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
 * Hash FNV-1a sur tous les éléments de contexte du tirage (date, nom, gagnants, machine, id)
 * en normalisant les nombres pour éviter les collisions de contenu équivalent.
 */
export function deriveSeedFromHistory(history: ReadonlyArray<SeedableDraw>): number {
  if (!history || history.length === 0) return 0;

  const normalizeNumbers = (values: Array<number | string> | null | undefined): number[] =>
    [...(values ?? [])]
      .map((n) => (typeof n === 'string' ? parseInt(n, 10) : n))
      .filter((n): n is number => Number.isFinite(n))
      .map((n) => Math.max(0, Math.min(255, Math.round(n))))
      .sort((a, b) => a - b);

  const bytes: number[] = [];
  for (const draw of history) {
    const drawNameStr = draw.drawName ?? (draw.id != null ? String(draw.id) : '');
    for (let i = 0; i < drawNameStr.length; i++) bytes.push(drawNameStr.charCodeAt(i) & 0xff);
    bytes.push(0xff);

    const dateStr = draw.date != null ? String(draw.date) : '';
    for (let i = 0; i < dateStr.length; i++) bytes.push(dateStr.charCodeAt(i) & 0xff);
    bytes.push(0xff);

    const numbers = normalizeNumbers(draw.gagnants ?? draw.winners ?? []);
    for (const n of numbers) bytes.push(n);
    bytes.push(0xfe);

    const machine = normalizeNumbers(draw.machine ?? []);
    for (const n of machine) bytes.push(n);
    bytes.push(0xfd);

    if (draw.id != null) {
      const idStr = String(draw.id);
      for (let i = 0; i < idStr.length; i++) bytes.push(idStr.charCodeAt(i) & 0xff);
      bytes.push(0xfc);
    }
  }

  return fnv1a64To53(bytes) || 0x9e3779b9;
}
