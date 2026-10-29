/**
 * HERMETIC STORAGE GUARD & PERSISTENCE INTEGRITY SERVICE
 * 
 * Conforme aux consignes strictes d'AGENTS.md :
 * - ISOLATION DU CACHING : Clés strictement conformes nexus_interdraw_${networkId}_${drawName}
 *   avec networkId ∈ {'hebdomadaire', 'quotidien'}.
 * - ÉTANCHÉITÉ DES RÉSEAUX : Zéro pollution, zéro croisement entre les 6 tirages hebdomadaires
 *   et les 22 tirages quotidiens LONACI.
 * - ZÉRO DONNÉES SYNTHÉTIQUES : Rejet strict des IDs 'deterministic-*' et fausses données.
 * - CONFORMITÉ 5/90 : Exactement 5 entiers distincts ∈ [1, 90].
 */

import { get, set, del, keys as idbKeys, getMany, delMany } from 'idb-keyval';
import { DrawResult } from '../../types';

const DOMAIN_TOTAL_NUMBERS = 90;
const DOMAIN_NUMBERS_PER_DRAW = 5;
import {
  getDrawNetworkId,
  normalizeDrawName,
  INTER_DRAW_NETWORKS,
  InterDrawNetworkId,
} from '../../config/networks';
import { globalCache } from '../cache/CacheService';

export interface ValidationIssue {
  field: string;
  reason: string;
  fatal: boolean;
}

export interface DrawValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
  cleanDraw?: DrawResult;
}

/**
 * Valide rigoureusement un enregistrement de tirage pour la persistance locale et le moteur WASM.
 */
export function validateDrawRecord(
  raw: unknown,
  options?: { allowSynthetic?: boolean }
): DrawValidationResult {
  const issues: ValidationIssue[] = [];
  if (!raw || typeof raw !== 'object') {
    return {
      valid: false,
      issues: [{ field: 'root', reason: 'Enregistrement non-objet ou nul', fatal: true }],
    };
  }

  const d = raw as Record<string, unknown>;

  // 1. Détection de données synthétiques interdites (sauf si explicitement autorisé pour tests/simulations)
  if (!options?.allowSynthetic && typeof d.id === 'string' && d.id.startsWith('deterministic-')) {
    issues.push({
      field: 'id',
      reason: 'Donnée synthétique interdite (ID préfixé par deterministic-)',
      fatal: true,
    });
  }

  // 2. Nom du tirage
  const drawName = typeof d.drawName === 'string' ? d.drawName.trim() : '';
  if (!drawName) {
    issues.push({
      field: 'drawName',
      reason: 'Nom de tirage manquant ou vide',
      fatal: true,
    });
  }

  // 3. Date
  const dateStr = typeof d.date === 'string' ? d.date.trim() : '';
  if (!dateStr) {
    issues.push({
      field: 'date',
      reason: 'Date de tirage manquante',
      fatal: true,
    });
  }

  // 4. Numéros gagnants (5 boules uniques ∈ [1, 90])
  const winnersRaw = Array.isArray(d.gagnants)
    ? d.gagnants
    : Array.isArray((d as { winners?: unknown }).winners)
    ? (d as { winners: unknown[] }).winners
    : [];

  const validWinners: number[] = [];
  const seenNumbers = new Set<number>();

  for (const item of winnersRaw) {
    const num = typeof item === 'number' ? item : parseInt(String(item), 10);
    if (!Number.isFinite(num) || num < 1 || num > DOMAIN_TOTAL_NUMBERS) {
      issues.push({
        field: 'gagnants',
        reason: `Numéro hors-bornes [1, 90] ou non-entier : ${item}`,
        fatal: true,
      });
      continue;
    }
    if (seenNumbers.has(num)) {
      issues.push({
        field: 'gagnants',
        reason: `Numéro en doublon interne détecté : ${num}`,
        fatal: true,
      });
      continue;
    }
    seenNumbers.add(num);
    validWinners.push(num);
  }

  if (validWinners.length !== DOMAIN_NUMBERS_PER_DRAW) {
    issues.push({
      field: 'gagnants',
      reason: `Nombre de gagnants invalide (${validWinners.length} au lieu de ${DOMAIN_NUMBERS_PER_DRAW})`,
      fatal: true,
    });
  }

  // 5. Numéros machine (optionnels, mais doivent être conformes si présents)
  const machineRaw = Array.isArray(d.machine) ? d.machine : [];
  const validMachine: number[] = [];
  const seenMachine = new Set<number>();

  for (const item of machineRaw) {
    const num = typeof item === 'number' ? item : parseInt(String(item), 10);
    if (Number.isFinite(num) && num >= 1 && num <= DOMAIN_TOTAL_NUMBERS) {
      if (!seenMachine.has(num) && !seenNumbers.has(num)) {
        seenMachine.add(num);
        validMachine.push(num);
      }
    }
  }

  const hasFatal = issues.some((i) => i.fatal);

  if (hasFatal) {
    return { valid: false, issues };
  }

  const cleanDraw: DrawResult = {
    id: typeof d.id === 'string' && d.id ? d.id : `${normalizeDrawName(drawName)}_${dateStr}`,
    drawName,
    date: dateStr,
    gagnants: validWinners,
    machine: validMachine,
  };

  return { valid: true, issues, cleanDraw };
}

export interface HermeticPersistenceAudit {
  timestamp: number;
  totalDrawsScanned: number;
  validDrawsCount: number;
  invalidDrawsCount: number;
  syntheticDrawsDetected: number;
  exactDuplicatesCount: number;
  networkHermeticityScore: number; // 0-100%
  crossNetworkViolations: {
    sourceKey: string;
    detectedNetwork: string;
    expectedNetwork: string;
    description: string;
  }[];
  cacheKeysChecked: number;
  invalidCacheKeysCount: number;
  healthStatus: 'HEALTHY' | 'DEGRADED' | 'CORRUPTED';
}

const isIdbAvailable = (): boolean => typeof indexedDB !== 'undefined';

async function safeIdbKeys(): Promise<string[]> {
  if (!isIdbAvailable()) return [];
  try {
    const keys = await idbKeys();
    return keys.filter((k): k is string => typeof k === 'string');
  } catch {
    return [];
  }
}

/**
 * Exécute un audit d'intégrité et d'étanchéité de persistance complet.
 */
export async function auditHermeticPersistence(): Promise<HermeticPersistenceAudit> {
  const stringKeys = await safeIdbKeys();

  let totalDrawsScanned = 0;
  let validDrawsCount = 0;
  let invalidDrawsCount = 0;
  let syntheticDrawsDetected = 0;
  let exactDuplicatesCount = 0;
  let invalidCacheKeysCount = 0;
  const crossNetworkViolations: HermeticPersistenceAudit['crossNetworkViolations'] = [];

  // 1. Audit des clés de tirages historiques
  const historyKeys = stringKeys.filter(
    (k) => k.startsWith('nexus_history_') || k.startsWith('draws_') || k.startsWith('lottery_')
  );

  const seenDrawFingerprints = new Set<string>();

  if (isIdbAvailable() && historyKeys.length > 0) {
    const historyValues = await getMany(historyKeys);
    for (let i = 0; i < historyValues.length; i++) {
      const rawVal = historyValues[i];
      if (!rawVal) continue;
      const key = historyKeys[i];
      const records: unknown[] = Array.isArray(rawVal)
        ? rawVal
        : Array.isArray((rawVal as { data?: unknown }).data)
        ? ((rawVal as { data: unknown[] }).data)
        : [rawVal];

      for (const rec of records) {
        totalDrawsScanned++;
        const validation = validateDrawRecord(rec);
        if (!validation.valid) {
          invalidDrawsCount++;
          if (validation.issues.some((iss) => iss.reason.includes('synthétique'))) {
            syntheticDrawsDetected++;
          }
        } else if (validation.cleanDraw) {
          validDrawsCount++;
          const d = validation.cleanDraw;
          const fp = `${normalizeDrawName(d.drawName)}_${d.date}_${[...d.gagnants].sort((a, b) => a - b).join('-')}`;
          if (seenDrawFingerprints.has(fp)) {
            exactDuplicatesCount++;
          } else {
            seenDrawFingerprints.add(fp);
          }
        }
      }
    }
  }

  // 2. Audit des clés inter-tirages (AGENTS.md)
  const interdrawKeys = stringKeys.filter((k) => k.startsWith('nexus_interdraw_'));
  for (const k of interdrawKeys) {
    // Format requis : nexus_interdraw_${networkId}_${drawName}...
    const parts = k.split('_');
    // parts[0] = 'nexus', parts[1] = 'interdraw', parts[2] = networkId, parts[3] = drawName
    if (parts.length < 4) {
      invalidCacheKeysCount++;
      continue;
    }
    const networkId = parts[2];
    const drawName = parts[3];

    if (networkId !== 'hebdomadaire' && networkId !== 'quotidien' && networkId !== 'isolated') {
      invalidCacheKeysCount++;
      crossNetworkViolations.push({
        sourceKey: k,
        detectedNetwork: networkId,
        expectedNetwork: 'hebdomadaire | quotidien',
        description: `Identifiant de réseau inconnu dans la clé : '${networkId}'`,
      });
      continue;
    }

    const officialNetwork = getDrawNetworkId(drawName);
    if (officialNetwork && officialNetwork !== networkId) {
      crossNetworkViolations.push({
        sourceKey: k,
        detectedNetwork: networkId,
        expectedNetwork: officialNetwork,
        description: `Tirage '${drawName}' tagué '${networkId}' alors qu'il appartient strictement au réseau '${officialNetwork}'`,
      });
    }
  }

  // Calcul du score d'étanchéité réseau (0 à 100%)
  const totalNetworkChecks = Math.max(1, interdrawKeys.length);
  const networkHermeticityScore = Math.max(
    0,
    Math.round(100 * (1 - crossNetworkViolations.length / totalNetworkChecks))
  );

  let healthStatus: HermeticPersistenceAudit['healthStatus'] = 'HEALTHY';
  if (crossNetworkViolations.length > 0 || syntheticDrawsDetected > 0 || invalidDrawsCount > 5) {
    healthStatus = 'CORRUPTED';
  } else if (exactDuplicatesCount > 0 || invalidCacheKeysCount > 0) {
    healthStatus = 'DEGRADED';
  }

  return {
    timestamp: Date.now(),
    totalDrawsScanned,
    validDrawsCount,
    invalidDrawsCount,
    syntheticDrawsDetected,
    exactDuplicatesCount,
    networkHermeticityScore,
    crossNetworkViolations,
    cacheKeysChecked: interdrawKeys.length,
    invalidCacheKeysCount,
    healthStatus,
  };
}

export interface HermeticRepairResult {
  purgedSyntheticCount: number;
  deduplicatedCount: number;
  invalidCacheKeysPurged: number;
  repairedDrawKeys: number;
  bytesFreedApproxKb: number;
  auditAfter: HermeticPersistenceAudit;
}

/**
 * Exécute la réconciliation et l'auto-réparation hermétique complète :
 * 1. Purge sans pitié des reliquats synthétiques.
 * 2. Dédoublonnage atomique des tirages historiques sans perte d'information.
 * 3. Purge des clés de cache corrompues ou polluées inter-réseaux.
 * 4. Assainissement du cache L1 (mémoire) et L2 (IndexedDB).
 */
export async function repairHermeticPersistence(): Promise<HermeticRepairResult> {
  let purgedSyntheticCount = 0;
  let deduplicatedCount = 0;
  let invalidCacheKeysPurged = 0;
  let repairedDrawKeys = 0;

  // 1. Purge du cache L1 en mémoire vive
  const memPurge = await globalCache.purgeSyntheticDraws();
  purgedSyntheticCount += memPurge.memoryPurged;

  const stringKeys = await safeIdbKeys();

  // 2. Nettoyage des clés de cache inter-tirages illicites
  const keysToDelete: string[] = [];
  const interdrawKeys = stringKeys.filter((k) => k.startsWith('nexus_interdraw_'));

  for (const k of interdrawKeys) {
    const parts = k.split('_');
    if (parts.length < 4) {
      keysToDelete.push(k);
      invalidCacheKeysPurged++;
      continue;
    }
    const networkId = parts[2];
    const drawName = parts[3];
    const officialNetwork = getDrawNetworkId(drawName);

    // Si le réseau tagué ne correspond pas au réseau officiel ou est invalide
    if (
      (networkId !== 'hebdomadaire' && networkId !== 'quotidien' && networkId !== 'isolated') ||
      (officialNetwork && officialNetwork !== networkId)
    ) {
      keysToDelete.push(k);
      invalidCacheKeysPurged++;
    }
  }

  // 3. Assainissement et dédoublonnage des historiques de tirages
  const historyKeys = stringKeys.filter(
    (k) => k.startsWith('nexus_history_') || k.startsWith('draws_') || k.startsWith('lottery_')
  );

  if (isIdbAvailable() && historyKeys.length > 0) {
    const historyValues = await getMany(historyKeys);
    for (let i = 0; i < historyValues.length; i++) {
      const rawVal = historyValues[i];
      if (!rawVal) continue;
      const key = historyKeys[i];

      const records: unknown[] = Array.isArray(rawVal)
        ? rawVal
        : Array.isArray((rawVal as { data?: unknown }).data)
        ? ((rawVal as { data: unknown[] }).data)
        : [rawVal];

      const cleanList: DrawResult[] = [];
      const seenFingerprints = new Set<string>();
      let modified = false;

      for (const rec of records) {
        const validation = validateDrawRecord(rec);
        if (!validation.valid || !validation.cleanDraw) {
          modified = true;
          if (validation.issues.some((iss) => iss.reason.includes('synthétique'))) {
            purgedSyntheticCount++;
          }
          continue;
        }

        const d = validation.cleanDraw;
        const fp = `${normalizeDrawName(d.drawName)}_${d.date}_${[...d.gagnants].sort((a, b) => a - b).join('-')}`;
        if (seenFingerprints.has(fp)) {
          deduplicatedCount++;
          modified = true;
        } else {
          seenFingerprints.add(fp);
          cleanList.push(d);
        }
      }

      if (modified) {
        if (cleanList.length === 0) {
          keysToDelete.push(key);
        } else if (isIdbAvailable()) {
          // Si le format original était encapsulé sous un objet `{ data, expiry }` (CacheEntry)
          if ((rawVal as Record<string, unknown>)?.data) {
            (rawVal as Record<string, unknown>).data = cleanList;
            await set(key, rawVal);
          } else {
            await set(key, cleanList);
          }
          repairedDrawKeys++;
        }
      }
    }
  }

  // Suppression physique des clés condamnées
  if (isIdbAvailable() && keysToDelete.length > 0) {
    await delMany(keysToDelete);
  }

  const bytesFreedApproxKb = Math.round(
    (purgedSyntheticCount * 1.5 + deduplicatedCount * 0.8 + invalidCacheKeysPurged * 2.2)
  );

  const auditAfter = await auditHermeticPersistence();

  return {
    purgedSyntheticCount,
    deduplicatedCount,
    invalidCacheKeysPurged,
    repairedDrawKeys,
    bytesFreedApproxKb,
    auditAfter,
  };
}
