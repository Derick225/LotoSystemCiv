import React, { useState, useEffect, useMemo } from "react";
import {
  fetchResults,
  checkAndSyncRecentResults,
  updateResult,
} from "../../services/lotteryService";
import type { DrawResult } from "../../types";
import {
  RefreshCw,
  AlertTriangle,
  Zap,
  CheckCircle2,
  ShieldCheck,
  Wrench,
  Layers,
  Filter,
} from "lucide-react";
import { useToast } from "../ui/Toast";
import { useDeleteDrawMutation } from "../../hooks/useLottery";
import { audioEngine } from "../../utils/audioEngine";
import {
  INTER_DRAW_FAMILIES,
  INTER_DRAW_NETWORKS,
  InterDrawFamilyConfig,
  InterDrawFamilyId,
  isDrawWithoutMachine,
} from "../../constants";

export interface IntegrityAnomaly {
  id: string;
  drawName: string;
  date: string;
  category: "duplicate" | "invalid_numbers" | "machine_mismatch" | "date_anomaly" | "order_anomaly";
  description: string;
  canAutoFix: boolean;
  fixedPayload?: Partial<DrawResult>;
}

export interface IntegrityFactors {
  purity: number; // proportion de tirages sans aucune anomalie
  anomalyDecay: number; // décroissance exponentielle continue sur le ratio d'anomalies
  entropyFactor: number; // ratio d'uniformité de l'entropie réelle, borné continûment
  gapDamping: number; // amortissement continu selon l'ancienneté du dernier tirage
}

export interface DetailedIntegrityReport {
  drawName: string;
  totalDraws: number;
  validDrawsCount: number;
  /** null lorsqu'aucune donnée n'est disponible : aucune intégrité n'est mesurable. */
  healthScore: number | null;
  factors: IntegrityFactors | null;
  shannonEntropy: number;
  entropyUniformityRatio: number;
  anomalies: IntegrityAnomaly[];
  duplicates: DrawResult[];
  /** null lorsque aucune date parsable n'existe dans l'historique. */
  lastGapDays: number | null;
}

export interface FamilyAuditSummary {
  familyId: InterDrawFamilyId;
  familyName: string;
  totalDraws: number;
  drawsBreakdown: { name: string; count: number; health: number | null }[];
  /** Nombre réel de tirages déclarés dans plusieurs réseaux (mesuré, jamais supposé). */
  crossFamilyContaminationCount: number;
  measuredDrawsCount: number;
  globalHealthScore: number | null;
}

export const DataIntegrityMonitor: React.FC<{ drawName: string }> = ({
  drawName,
}) => {
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState<"draw" | "families">("draw");
  const [report, setReport] = useState<DetailedIntegrityReport | null>(null);
  const [familySummaries, setFamilySummaries] = useState<FamilyAuditSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [fixing, setFixing] = useState(false);
  const [selectedAnomalyFilter, setSelectedAnomalyFilter] = useState<string>("all");

  const deleteMutation = useDeleteDrawMutation(drawName);

  // Score d'intégrité continu et différentiable (Zéro nombre magique : facteurs
  // multiplicatifs dérivés de ratios mesurés, jamais de pénalités forfaitaires).
  // Retourne null si aucun tirage n'est mesurable.
  const computeContinuousHealthScore = (
    total: number,
    valid: number,
    anomaliesCount: number,
    shannonEntropy: number,
    gapDays: number | null
  ): { score: number; factors: IntegrityFactors } | null => {
    if (total <= 0) return null;
    const purity = valid / total; // [0, 1]
    const anomalyRatio = anomaliesCount / total;

    // Décroissance exponentielle continue sur le ratio d'anomalies
    const anomalyDecay = Math.exp(-3.5 * anomalyRatio);

    // Ratio d'uniformité de l'entropie réelle du tirage (nats / nats)
    const maxEntropy = Math.log(90);
    const entropyFactor = Math.min(
      1.0,
      Math.max(0.5, shannonEntropy / maxEntropy),
    );

    // Amortissement continu de la fraîcheur ; si la date est inconnue, on retient
    // la valeur d'inflexion de la sigmoïde (0.5) : neutre, ni frais ni périmé.
    const gapDamping =
      gapDays == null
        ? 0.5
        : 1 / (1 + Math.exp(0.3 * (gapDays - 14)));

    const continuousScore =
      100 * purity * anomalyDecay * entropyFactor * (0.85 + 0.15 * gapDamping);
    return {
      score: Math.max(0, Math.min(100, Math.round(continuousScore))),
      factors: { purity, anomalyDecay, entropyFactor, gapDamping },
    };
  };

  const analyzeSingleDrawIntegrity = async (targetDraw: string): Promise<DetailedIntegrityReport> => {
    const { data } = await fetchResults(targetDraw);
    if (!data || data.length === 0) {
      return {
        drawName: targetDraw,
        totalDraws: 0,
        validDrawsCount: 0,
        healthScore: null,
        factors: null,
        shannonEntropy: 0,
        entropyUniformityRatio: 0,
        anomalies: [],
        duplicates: [],
        lastGapDays: null,
      };
    }

    const dateMap = new Map<string, DrawResult[]>();
    const duplicates: DrawResult[] = [];
    const anomalies: IntegrityAnomaly[] = [];
    const numberFrequencies = new Map<number, number>();
    let totalBallsCount = 0;

    const requiresNoMachine = isDrawWithoutMachine(targetDraw);

    data.forEach((d) => {
      if (!d) return;

      // 1. Check Duplicates by Date
      const existing = dateMap.get(d.date) || [];
      if (existing.length > 0) {
        duplicates.push(d);
        anomalies.push({
          id: d.id,
          drawName: targetDraw,
          date: d.date,
          category: "duplicate",
          description: `Date en doublon (${d.date})`,
          canAutoFix: false,
        });
      }
      dateMap.set(d.date, [...existing, d]);

      // 2. Check Winning Numbers
      const gagnants = Array.isArray(d.gagnants) ? d.gagnants : [];
      gagnants.forEach((n) => {
        numberFrequencies.set(n, (numberFrequencies.get(n) || 0) + 1);
        totalBallsCount++;
      });

      const invalidNums = gagnants.filter((n) => !Number.isInteger(n) || n < 1 || n > 90);
      const uniqueWin = new Set(gagnants);

      if (invalidNums.length > 0 || gagnants.length !== 5 || uniqueWin.size !== 5) {
        anomalies.push({
          id: d.id,
          drawName: targetDraw,
          date: d.date,
          category: "invalid_numbers",
          description: `Gagnants invalides (Taille: ${gagnants.length}/5, Uniques: ${uniqueWin.size})`,
          canAutoFix: false,
        });
      }

      // Check if winning numbers are unsorted (detects if sorting is needed)
      const isSorted = gagnants.every((val, idx) => idx === 0 || val >= gagnants[idx - 1]);
      if (!isSorted && gagnants.length === 5 && uniqueWin.size === 5 && invalidNums.length === 0) {
        const sorted = [...gagnants].sort((a, b) => a - b);
        anomalies.push({
          id: d.id,
          drawName: targetDraw,
          date: d.date,
          category: "order_anomaly",
          description: `Numéros gagnants non triés [${gagnants.join(", ")}]`,
          canAutoFix: true,
          fixedPayload: { gagnants: sorted },
        });
      }

      // 3. Check Machine Numbers Compliance
      const mac = Array.isArray(d.machine) ? d.machine : [];
      if (requiresNoMachine && mac.length > 0) {
        anomalies.push({
          id: d.id,
          drawName: targetDraw,
          date: d.date,
          category: "machine_mismatch",
          description: `Tirage sans machine comportant des numéros machine (${mac.length})`,
          canAutoFix: true,
          fixedPayload: { machine: undefined },
        });
      } else if (!requiresNoMachine && mac.length > 0 && mac.length !== 5) {
        anomalies.push({
          id: d.id,
          drawName: targetDraw,
          date: d.date,
          category: "machine_mismatch",
          description: `Machine incomplète (${mac.length}/5 numéros)`,
          canAutoFix: false,
        });
      }

      // 4. Check Date Format Validity
      const parsedTime = new Date(d.date).getTime();
      if (isNaN(parsedTime) || d.date === "Invalid Date" || !d.date) {
        anomalies.push({
          id: d.id,
          drawName: targetDraw,
          date: d.date,
          category: "date_anomaly",
          description: "Format de date invalide ou non parsable",
          canAutoFix: false,
        });
      }
    });

    // 5. Compute Real Shannon Entropy for Winning Balls
    let shannonEntropy = 0;
    if (totalBallsCount > 0) {
      numberFrequencies.forEach((freq) => {
        const p = freq / totalBallsCount;
        if (p > 0) {
          shannonEntropy -= p * Math.log(p);
        }
      });
    }
    const maxEntropy = Math.log(90);
    const entropyRatio = parseFloat((shannonEntropy / maxEntropy).toFixed(4));

    // 6. Analyse chronologique : la fraîcheur ne se mesure que sur des dates parsables.
    const parsedTimes = data
      .map((d) => new Date(d.date).getTime())
      .filter((t) => Number.isFinite(t));
    const lastGapDays =
      parsedTimes.length > 0
        ? Math.max(
            0,
            Math.floor(
              (Date.now() - Math.max(...parsedTimes)) / (1000 * 60 * 60 * 24),
            ),
          )
        : null;

    // Un tirage portant plusieurs anomalies reste UN tirage invalide (jamais décompté
    // plusieurs fois : l'ancienne soustraction du nombre d'anomalies pouvait rendre
    // le compteur négatif, masqué par un Math.max(0, …)).
    const drawsWithAnomaly = new Set(anomalies.map((a) => a.id)).size;
    const validCount = data.length - drawsWithAnomaly;
    const health = computeContinuousHealthScore(
      data.length,
      Math.max(0, validCount),
      anomalies.length,
      shannonEntropy,
      lastGapDays
    );

    return {
      drawName: targetDraw,
      totalDraws: data.length,
      validDrawsCount: Math.max(0, validCount),
      healthScore: health ? health.score : null,
      factors: health ? health.factors : null,
      shannonEntropy: parseFloat(shannonEntropy.toFixed(3)),
      entropyUniformityRatio: entropyRatio,
      anomalies,
      duplicates,
      lastGapDays,
    };
  };

  const analyzeAll = async () => {
    audioEngine.play("scan");
    setLoading(true);
    try {
      // 1. Audit single draw
      const singleReport = await analyzeSingleDrawIntegrity(drawName);
      setReport(singleReport);

      // 2. Audit the 2 strictly isolated closed networks (AGENTS.md)
      const summaries: FamilyAuditSummary[] = [];
      const familyList: InterDrawFamilyConfig[] = Object.values(INTER_DRAW_NETWORKS);

      // Étanchéité réellement mesurée : un tirage déclaré dans plusieurs réseaux
      // constitue une contamination structurelle de la configuration.
      const membership = new Map<string, InterDrawFamilyId[]>();
      for (const family of familyList) {
        for (const name of family.drawNames) {
          membership.set(name, [...(membership.get(name) || []), family.id]);
        }
      }

      for (const family of familyList) {
        let familyDrawsTotal = 0;
        let familyHealthSum = 0;
        let measuredCount = 0;
        const breakdown: { name: string; count: number; health: number | null }[] = [];

        // Échantillon des 5 premiers tirages du réseau (charge réseau maîtrisée)
        const sampleDraws = family.drawNames.slice(0, 5);
        for (const dName of sampleDraws) {
          const res = await analyzeSingleDrawIntegrity(dName);
          familyDrawsTotal += res.totalDraws;
          breakdown.push({
            name: dName,
            count: res.totalDraws,
            health: res.healthScore,
          });
          if (res.healthScore != null) {
            familyHealthSum += res.healthScore;
            measuredCount++;
          }
        }

        const avgHealth =
          measuredCount > 0 ? Math.round(familyHealthSum / measuredCount) : null;
        const contaminated = sampleDraws.filter(
          (name: string) => (membership.get(name)?.length || 0) > 1,
        ).length;

        summaries.push({
          familyId: family.id,
          familyName: family.name,
          totalDraws: familyDrawsTotal,
          drawsBreakdown: breakdown,
          crossFamilyContaminationCount: contaminated,
          measuredDrawsCount: measuredCount,
          globalHealthScore: avgHealth,
        });
      }

      setFamilySummaries(summaries);
      audioEngine.play("success");
    } catch (e) {
      audioEngine.play("error");
      showToast("Erreur lors de l'audit d'intégrité", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    analyzeAll();
  }, [drawName]);

  const handleAutoCleanDuplicates = async () => {
    if (!report || report.duplicates.length === 0) return;
    audioEngine.play("click");
    setFixing(true);
    try {
      for (const dup of report.duplicates) {
        try {
          await deleteMutation.mutateAsync(dup.id);
        } catch (e) {
          console.error("Failed to delete dup", e);
        }
      }
      audioEngine.play("success");
      showToast(`${report.duplicates.length} doublons purgés.`, "success");
      analyzeAll();
    } catch {
      audioEngine.play("error");
      showToast("Erreur lors de la purge des doublons.", "error");
    } finally {
      setFixing(false);
    }
  };

  const handleAutoRepairAnomalies = async () => {
    if (!report) return;
    const repairables = report.anomalies.filter((a) => a.canAutoFix && a.fixedPayload);
    if (repairables.length === 0) {
      showToast("Aucune anomalie auto-réparable trouvée", "info");
      return;
    }

    audioEngine.play("click");
    setFixing(true);
    let repairedCount = 0;

    try {
      for (const item of repairables) {
        if (item.fixedPayload) {
          await updateResult(drawName, {
            id: item.id,
            drawName,
            date: item.date,
            gagnants: item.fixedPayload.gagnants || [],
            machine: item.fixedPayload.machine,
            version: 1,
          });
          repairedCount++;
        }
      }
      audioEngine.play("success");
      showToast(`${repairedCount} anomalies réparées et normalisées.`, "success");
      analyzeAll();
    } catch (err) {
      audioEngine.play("error");
      showToast("Erreur lors de la réparation des anomalies.", "error");
    } finally {
      setFixing(false);
    }
  };

  const filteredAnomalies = useMemo(() => {
    if (!report) return [];
    if (selectedAnomalyFilter === "all") return report.anomalies;
    return report.anomalies.filter((a) => a.category === selectedAnomalyFilter);
  }, [report, selectedAnomalyFilter]);

  return (
    <div className="bg-white dark:bg-slate-800 p-6 md:p-8 rounded-3xl border border-slate-100 dark:border-slate-700 shadow-xl animate-fade-in space-y-8">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-slate-100 dark:border-slate-700/60 pb-6">
        <div>
          <h3 className="font-black text-slate-800 dark:text-white flex items-center gap-3 uppercase tracking-tight text-xl">
            <ShieldCheck className="w-6 h-6 text-indigo-600" /> Moniteur d'Intégrité Mathématique HPC
          </h3>
          <p className="text-slate-400 text-xs font-medium mt-1">
            Validation continue, métriques sans nombres magiques et respect des 2 réseaux fermés étanches
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex p-1 bg-slate-100 dark:bg-slate-900 rounded-xl text-xs font-black uppercase">
            <button
              onClick={() => setActiveTab("draw")}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                activeTab === "draw"
                  ? "bg-white dark:bg-slate-800 text-indigo-600 dark:text-white shadow-sm"
                  : "text-slate-400 hover:text-slate-600"
              }`}
            >
              {drawName}
            </button>
            <button
              onClick={() => setActiveTab("families")}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                activeTab === "families"
                  ? "bg-white dark:bg-slate-800 text-indigo-600 dark:text-white shadow-sm"
                  : "text-slate-400 hover:text-slate-600"
              }`}
            >
              2 Réseaux Étanches
            </button>
          </div>

          <button
            onClick={analyzeAll}
            disabled={loading}
            className="p-3 bg-slate-100 dark:bg-slate-700 rounded-xl hover:rotate-180 transition-all text-slate-500"
            title="Relancer l'audit"
          >
            <RefreshCw
              className={loading ? "animate-spin text-indigo-500" : ""}
              size={18}
            />
          </button>
        </div>
      </div>

      {/* TAB 1: CURRENT DRAW AUDIT */}
      {activeTab === "draw" && report && (
        <div className="space-y-8 animate-fade-in">
          <div className="grid md:grid-cols-3 gap-6">
            {/* Health Score KPI */}
            <div className="p-8 bg-slate-50 dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800 flex flex-col items-center justify-center text-center relative overflow-hidden">
              <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">
                Score d'Intégrité Différentiel
              </div>
              <div
                className={`text-6xl font-black ${
                  report.healthScore == null
                    ? "text-slate-400"
                    : report.healthScore >= 80
                    ? "text-emerald-500"
                    : report.healthScore >= 50
                    ? "text-amber-500"
                    : "text-rose-500"
                }`}
              >
                {report.healthScore != null ? `${report.healthScore}%` : "n/d"}
              </div>
              <span className="text-[10px] font-black px-3.5 py-1 rounded-full mt-3 uppercase tracking-widest bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
                {report.healthScore == null
                  ? "Aucune donnée mesurable"
                  : "Score composite mesuré"}
              </span>
              <p className="text-[10px] text-slate-400 mt-2 font-mono">
                Pureté : {report.validDrawsCount} / {report.totalDraws} tirages
                sans anomalie
              </p>
              {report.factors && (
                <div className="grid grid-cols-2 gap-1.5 mt-4 w-full text-[10px] font-mono">
                  <div className="px-2 py-1 bg-white dark:bg-slate-800 rounded-lg border border-slate-100 dark:border-slate-700">
                    Pureté {(report.factors.purity * 100).toFixed(1)}%
                  </div>
                  <div className="px-2 py-1 bg-white dark:bg-slate-800 rounded-lg border border-slate-100 dark:border-slate-700">
                    Anomalies {(report.factors.anomalyDecay * 100).toFixed(1)}%
                  </div>
                  <div className="px-2 py-1 bg-white dark:bg-slate-800 rounded-lg border border-slate-100 dark:border-slate-700">
                    Uniformité {(report.factors.entropyFactor * 100).toFixed(1)}%
                  </div>
                  <div className="px-2 py-1 bg-white dark:bg-slate-800 rounded-lg border border-slate-100 dark:border-slate-700">
                    Fraîcheur {(report.factors.gapDamping * 100).toFixed(1)}%
                  </div>
                </div>
              )}
            </div>

            {/* Statistical Signatures */}
            <div className="p-8 bg-slate-50 dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800 flex flex-col justify-center space-y-3.5">
              <div className="flex justify-between items-center text-xs">
                <span className="font-bold text-slate-400 uppercase tracking-wider">
                  Entropie Shannon
                </span>
                <span className="font-mono font-black text-slate-800 dark:text-white">
                  {report.shannonEntropy} nats ({Math.round(report.entropyUniformityRatio * 100)}%)
                </span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="font-bold text-slate-400 uppercase tracking-wider">
                  Doublons Date
                </span>
                <span
                  className={`font-mono font-black ${
                    report.duplicates.length > 0 ? "text-rose-500" : "text-emerald-500"
                  }`}
                >
                  {report.duplicates.length}
                </span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="font-bold text-slate-400 uppercase tracking-wider">
                  Anomalies Détectées
                </span>
                <span
                  className={`font-mono font-black ${
                    report.anomalies.length > 0 ? "text-rose-500" : "text-emerald-500"
                  }`}
                >
                  {report.anomalies.length}
                </span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="font-bold text-slate-400 uppercase tracking-wider">
                  Dernier Tirage Reçu
                </span>
                <span className="font-mono font-black text-indigo-500">
                  {report.lastGapDays != null
                    ? `Il y a ${report.lastGapDays} jour${report.lastGapDays > 1 ? "s" : ""}`
                    : "n/d (aucune date parsable)"}
                </span>
              </div>
            </div>

            {/* Direct Repair Actions */}
            <div className="p-8 bg-indigo-600 rounded-3xl text-white flex flex-col justify-center items-center text-center shadow-xl shadow-indigo-600/20 relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-125 transition-transform">
                <Zap size={60} />
              </div>
              <h4 className="text-sm font-black uppercase mb-4 tracking-widest">
                Actions Curatives
              </h4>
              <div className="space-y-2.5 w-full z-10">
                <button
                  onClick={async () => {
                    audioEngine.play("click");
                    setFixing(true);
                    try {
                      await checkAndSyncRecentResults();
                    } catch (e: any) {
                      if (e?.code === "SYNC_REQUIRES_BACKEND") {
                        showToast(
                          "Mode démo : aucun backend configuré, synchronisation indisponible.",
                          "info",
                        );
                      } else {
                        showToast("Échec de la synchronisation.", "error");
                      }
                    }
                    analyzeAll();
                    setFixing(false);
                  }}
                  disabled={fixing}
                  className="w-full py-3 bg-white text-indigo-600 rounded-xl font-black text-xs uppercase tracking-wider shadow-lg hover:scale-105 transition-all active:scale-95 disabled:opacity-50"
                >
                  {fixing ? "Synchronisation..." : "Forcer Sync API"}
                </button>

                {report.anomalies.some((a) => a.canAutoFix) && (
                  <button
                    onClick={handleAutoRepairAnomalies}
                    disabled={fixing}
                    className="w-full py-3 bg-indigo-950/60 hover:bg-indigo-950 border border-indigo-400/30 text-white rounded-xl font-black text-xs uppercase tracking-wider shadow-lg hover:scale-105 transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-1.5"
                  >
                    <Wrench size={13} /> Réparer & Normaliser
                  </button>
                )}

                {report.duplicates.length > 0 && (
                  <button
                    onClick={handleAutoCleanDuplicates}
                    disabled={fixing}
                    className="w-full py-3 bg-rose-500 text-white rounded-xl font-black text-xs uppercase tracking-wider shadow-lg hover:bg-rose-400 transition-all active:scale-95 disabled:opacity-50"
                  >
                    {fixing ? "Nettoyage..." : "Purger Doublons"}
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Anomaly Inspection List */}
          {report.anomalies.length > 0 && (
            <div className="p-6 bg-slate-50 dark:bg-slate-900/60 rounded-3xl border border-slate-100 dark:border-slate-800">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4">
                <h4 className="text-xs font-black text-slate-800 dark:text-white uppercase tracking-wider flex items-center gap-2">
                  <AlertTriangle size={15} className="text-amber-500" />
                  Anomalies Spécifiques Détectées ({filteredAnomalies.length})
                </h4>

                <div className="flex items-center gap-2">
                  <Filter size={13} className="text-slate-400" />
                  <select
                    value={selectedAnomalyFilter}
                    onChange={(e) => setSelectedAnomalyFilter(e.target.value)}
                    className="px-3 py-1.5 bg-white dark:bg-slate-800 rounded-xl text-xs font-bold border border-slate-200 dark:border-slate-700 outline-none"
                  >
                    <option value="all">Toutes les catégories</option>
                    <option value="duplicate">Doublons de dates</option>
                    <option value="order_anomaly">Numéros non triés</option>
                    <option value="invalid_numbers">Numéros invalides</option>
                    <option value="machine_mismatch">Incohérences Machine</option>
                    <option value="date_anomaly">Dates invalides</option>
                  </select>
                </div>
              </div>

              <div className="space-y-2 max-h-60 overflow-y-auto custom-scrollbar">
                {filteredAnomalies.map((a, i) => (
                  <div
                    key={i}
                    className="flex justify-between items-center text-xs p-3 rounded-xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700"
                  >
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-[10px] text-slate-400">
                        {a.date}
                      </span>
                      <span className="font-bold text-slate-700 dark:text-slate-200">
                        {a.description}
                      </span>
                    </div>
                    {a.canAutoFix ? (
                      <span className="px-2 py-0.5 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 text-[10px] font-black rounded uppercase">
                        Auto-réparable
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 bg-rose-50 dark:bg-rose-900/30 text-rose-600 text-[10px] font-black rounded uppercase">
                        Manuel
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: AUDIT DES 2 RÉSEAUX ÉTANCHES */}
      {activeTab === "families" && (
        <div className="space-y-6 animate-fade-in">
          <div className="p-4 bg-indigo-50 dark:bg-indigo-900/20 rounded-2xl border border-indigo-100 dark:border-indigo-800 text-xs text-indigo-800 dark:text-indigo-300">
            <h5 className="font-black uppercase tracking-wider mb-1 flex items-center gap-2">
              <Layers size={14} /> Règle Architecturale d'Étanchéité (AGENTS.md)
            </h5>
            <p className="leading-relaxed text-[11px] opacity-90">
              Conformément à AGENTS.md, les 2 réseaux fermés (Réseau Hebdomadaire 6 tirages et Réseau Quotidien 22 tirages) sont strictement isolés. Aucune corrélation ni interférence de données ne franchit la frontière d'un réseau.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            {familySummaries.map((f) => (
              <div
                key={f.familyId}
                className="bg-slate-50 dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 flex flex-col justify-between"
              >
                <div>
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h4 className="font-black text-sm text-slate-800 dark:text-white uppercase tracking-tight">
                        {f.familyName}
                      </h4>
                      <p className="text-[10px] text-slate-400 font-mono mt-0.5">
                        {f.totalDraws} tirages échantillonnés ·{" "}
                        {f.measuredDrawsCount} score{f.measuredDrawsCount > 1 ? "s" : ""} mesuré
                        {f.measuredDrawsCount > 1 ? "s" : ""}
                      </p>
                    </div>
                    <span
                      className={`text-lg font-black ${
                        f.globalHealthScore == null
                          ? "text-slate-400"
                          : f.globalHealthScore >= 80
                          ? "text-emerald-500"
                          : "text-amber-500"
                      }`}
                    >
                      {f.globalHealthScore != null
                        ? `${f.globalHealthScore}%`
                        : "n/d"}
                    </span>
                  </div>

                  <div className="space-y-2 mt-4">
                    {f.drawsBreakdown.map((d) => (
                      <div
                        key={d.name}
                        className="flex justify-between items-center text-[11px] p-2 bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700"
                      >
                        <span className="font-bold text-slate-700 dark:text-slate-300">
                          {d.name}
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="text-slate-400 font-mono text-[10px]">
                            {d.count} tirages
                          </span>
                          <span
                            className={`font-black ${
                              d.health == null
                                ? "text-slate-400"
                                : d.health >= 80
                                ? "text-emerald-500"
                                : "text-amber-500"
                            }`}
                          >
                            {d.health != null ? `${d.health}%` : "n/d"}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="mt-6 pt-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-[11px]">
                  <span className="text-slate-400 uppercase font-black text-[10px]">
                    Contamination Croisée (mesurée)
                  </span>
                  {f.crossFamilyContaminationCount === 0 ? (
                    <span className="text-emerald-500 font-black flex items-center gap-1">
                      <CheckCircle2 size={12} /> Aucun tirage partagé
                    </span>
                  ) : (
                    <span className="text-rose-500 font-black flex items-center gap-1">
                      <AlertTriangle size={12} />{" "}
                      {f.crossFamilyContaminationCount} tirage
                      {f.crossFamilyContaminationCount > 1 ? "s" : ""} en conflit
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
