import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useNexusStore } from "../../store/useNexusStore";
import {
  Dna,
  Zap,
  RefreshCw,
  Activity,
  CheckCircle2,
  AlertTriangle,
  Sliders,
  Sparkles,
  Layers,
  Download,
  ShieldCheck,
  Check,
  TrendingUp,
  Cpu,
  BarChart3,
  Award,
  Filter,
  Flame,
  Search,
  Eye,
  Radio,
  Target,
  Maximize2,
  Compass,
} from "lucide-react";
import {
  runGenomicAudit,
  GenomicAuditReport,
  GeneAuditMetric,
} from "../../services/training/genomicAuditService";
import {
  calculateDnaSieveWeights,
  DnaSieveResult,
} from "../../services/temporalAnalysisService";
import { purifyHistoryForDraw } from "../../utils/arrayUtils";
import { audioEngine } from "../../utils/audioEngine";
import { useToast } from "../ui/Toast";
import { AlgoWeights, PlatinumScenario } from "../../types";
import { normalizeWeights } from "../../services/predictionEngine";
import {
  ResponsiveContainer,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  Tooltip,
  Legend,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";

type InoculationProfile =
  | "FULL_RECOMMENDED"
  | "TOP_5_ELITE"
  | "ANTI_OVERFITTING"
  | "MAX_STABILITY";

type ActiveViewMode = "PANORAMA" | "RADAR" | "SIEVE" | "GENOME_TABLE";

interface MacroFamilyScore {
  familyKey: string;
  familyName: string;
  currentWeightPct: number;
  recommendedWeightPct: number;
  sieveEnergyPct: number;
  geneCount: number;
}

export const UnifiedDnaSieveRadar: React.FC<{
  drawName: string;
  initialViewMode?: ActiveViewMode;
  className?: string;
  scenarios?: PlatinumScenario[];
  selectedScenarioId?: string | null;
  onSelectScenarioId?: (id: string) => void;
}> = ({
  drawName,
  initialViewMode = "PANORAMA",
  className = "",
  scenarios = [],
  selectedScenarioId = null,
  onSelectScenarioId,
}) => {
  const { showToast } = useToast();
  const history = useNexusStore((state) => state.history);
  const globalWeights = useNexusStore((state) => state.globalWeights);
  const setGlobalWeights = useNexusStore((state) => state.setGlobalWeights);

  const [viewMode, setViewMode] = useState<ActiveViewMode>(initialViewMode);
  const [radarGranularity, setRadarGranularity] = useState<"MACRO" | "MICRO">(
    "MACRO",
  );
  const [sieveFilter, setSieveFilter] = useState<
    "ALL" | "ELITE" | "NEUTRAL" | "SHADOW"
  >("ALL");
  const [selectedNumber, setSelectedNumber] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedProfile, setSelectedProfile] =
    useState<InoculationProfile>("FULL_RECOMMENDED");

  const [internalScenarioId, setInternalScenarioId] = useState<string | null>(null);
  const activeScenarioId = selectedScenarioId ?? internalScenarioId;

  const activeScenario = useMemo(() => {
    if (!scenarios || scenarios.length === 0) return null;
    if (activeScenarioId) {
      return scenarios.find((s) => s.id === activeScenarioId) || scenarios[0];
    }
    return scenarios[0];
  }, [scenarios, activeScenarioId]);

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [progressPercent, setProgressPercent] = useState<number>(0);
  const [progressStatus, setProgressStatus] = useState<string>("");
  const [auditReport, setAuditReport] = useState<GenomicAuditReport | null>(
    null,
  );
  const [isApplied, setIsApplied] = useState<boolean>(false);

  // 1. Calcul déterministe et continu du Tamis ADN Actif
  const cleanHistory = useMemo(() => {
    return purifyHistoryForDraw(drawName, history);
  }, [drawName, history]);

  const dnaSieve: DnaSieveResult = useMemo(() => {
    return calculateDnaSieveWeights(cleanHistory, globalWeights, drawName);
  }, [cleanHistory, globalWeights, drawName]);

  // 2. Exécution de l'Audit Génomique Rétrospectif
  const handleRunAudit = useCallback(async () => {
    if (cleanHistory.length < 5) {
      showToast(
        `Historique insuffisant pour l'Audit Génomique (${cleanHistory.length} tirages trouvés).`,
        "error",
      );
      return;
    }

    setIsLoading(true);
    setProgressPercent(0);
    setProgressStatus("Initialisation du profil génomique unifié...");
    setIsApplied(false);
    audioEngine.play("scan");

    try {
      const result = await runGenomicAudit(
        drawName,
        cleanHistory,
        globalWeights,
        {
          depth: 35,
          onProgress: (pct, msg) => {
            setProgressPercent(pct);
            setProgressStatus(msg);
          },
        },
      );

      setAuditReport(result);
      audioEngine.play("success");
      showToast(
        `ADN, Tamis et Radar synchronisés avec succès pour ${drawName}`,
        "success",
      );
    } catch (err: any) {
      console.error(err);
      audioEngine.play("error");
      showToast(
        `Erreur d'audit génomique : ${err.message || String(err)}`,
        "error",
      );
    } finally {
      setIsLoading(false);
    }
  }, [drawName, cleanHistory, globalWeights, showToast]);

  // Lancement automatique au montage si l'historique est prêt
  useEffect(() => {
    if (cleanHistory.length >= 5 && !auditReport && !isLoading) {
      handleRunAudit();
    }
  }, [drawName, cleanHistory.length]);

  // 3. Synthèse des Macro-Familles pour le Radar Algorithmique
  const macroFamilies: MacroFamilyScore[] = useMemo(() => {
    const familyMap: Record<
      string,
      {
        name: string;
        genes: string[];
        currentSum: number;
        recomSum: number;
        sieveSum: number;
      }
    > = {
      FREQ_MARKOV: {
        name: "Fréquence & Markov",
        genes: ["frequency", "markov", "affinity", "cohort"],
        currentSum: 0,
        recomSum: 0,
        sieveSum: 0,
      },
      GAPS_CADENCE: {
        name: "Écarts & Cadences",
        genes: [
          "gaps",
          "gap_sequence",
          "gap_cadence",
          "gap_trend",
          "gap_band_sequence",
        ],
        currentSum: 0,
        recomSum: 0,
        sieveSum: 0,
      },
      TEMPORAL_HAWKES: {
        name: "Temporel & Hawkes",
        genes: ["temporal", "inter_monthly_resonance", "isolation_anomaly"],
        currentSum: 0,
        recomSum: 0,
        sieveSum: 0,
      },
      SPECTRAL_FOURIER: {
        name: "Spectral & Harmonique",
        genes: ["spectral"],
        currentSum: 0,
        recomSum: 0,
        sieveSum: 0,
      },
      SPATIAL_FRACTAL: {
        name: "Spatial & Fractal",
        genes: ["spatial", "fractal"],
        currentSum: 0,
        recomSum: 0,
        sieveSum: 0,
      },
      MACHINE_BAYES: {
        name: "Machine & Bayes",
        genes: ["machine_transfer", "bayes", "shadow_probability"],
        currentSum: 0,
        recomSum: 0,
        sieveSum: 0,
      },
    };

    let totalCurrent = 0;
    let totalRecom = 0;

    const allGenes = auditReport?.allGenes || [];
    const geneRecomMap = new Map<string, number>();
    allGenes.forEach((g) => {
      geneRecomMap.set(g.key, g.recommendedWeight);
    });

    Object.entries(globalWeights || {}).forEach(([k, val]) => {
      const numW = typeof val === "number" ? val : 0.05;
      totalCurrent += numW;
      const rec = geneRecomMap.get(k) || numW;
      totalRecom += rec;

      for (const fKey in familyMap) {
        if (familyMap[fKey].genes.includes(k)) {
          familyMap[fKey].currentSum += numW;
          familyMap[fKey].recomSum += rec;
          // Énergie de tamisage dérivée
          familyMap[fKey].sieveSum += (numW + rec) * 0.5;
          break;
        }
      }
    });

    const safeTotalCurrent = totalCurrent > 0 ? totalCurrent : 1.0;
    const safeTotalRecom = totalRecom > 0 ? totalRecom : 1.0;

    return Object.entries(familyMap).map(([key, item]) => ({
      familyKey: key,
      familyName: item.name,
      currentWeightPct: Number(
        ((item.currentSum / safeTotalCurrent) * 100).toFixed(1),
      ),
      recommendedWeightPct: Number(
        ((item.recomSum / safeTotalRecom) * 100).toFixed(1),
      ),
      sieveEnergyPct: Number(
        Math.min(
          100,
          (item.sieveSum / (safeTotalCurrent + safeTotalRecom)) * 200,
        ).toFixed(1),
      ),
      geneCount: item.genes.length,
    }));
  }, [globalWeights, auditReport]);

  // Données pour le Radar Recharts (avec superposition spectrale du Scénario)
  const radarChartData = useMemo(() => {
    if (radarGranularity === "MACRO") {
      return macroFamilies.map((f) => {
        const scenarioMatch = activeScenario?.genomicProfile?.macroFingerprint?.find(
          (m) => m.familyKey === f.familyKey || m.familyName === f.familyName
        );
        const scenarioEnergy = scenarioMatch ? scenarioMatch.energyPct : undefined;

        return {
          subject: f.familyName,
          Actuel: f.currentWeightPct,
          Cible: f.recommendedWeightPct,
          Tamis: f.sieveEnergyPct,
          ...(scenarioEnergy !== undefined ? { Scenario: scenarioEnergy } : {}),
          fullMark: 100,
        };
      });
    } else {
      if (!auditReport) return [];
      return auditReport.dominantGenes.slice(0, 8).map((g) => ({
        subject: g.label.length > 12 ? g.label.slice(0, 10) + ".." : g.label,
        Actuel: Number((g.currentWeight * 100).toFixed(1)),
        Cible: Number((g.recommendedWeight * 100).toFixed(1)),
        Tamis: Number((g.resonanceScore * 0.9).toFixed(1)),
        fullMark: 100,
      }));
    }
  }, [macroFamilies, radarGranularity, auditReport, activeScenario]);

  // 4. Numéros du Tamis (1 à 90) avec multiplicateurs et catégories
  const sieveGridData = useMemo(() => {
    const items = [];
    for (let n = 1; n <= 90; n++) {
      const mult = dnaSieve.multipliers[n] || 1.0;
      const affinity = dnaSieve.affinityPercent[n] || 50;
      let category: "ELITE" | "NEUTRAL" | "SHADOW" = "NEUTRAL";
      if (mult >= 1.12) category = "ELITE";
      else if (mult <= 0.88) category = "SHADOW";

      items.push({
        num: n,
        multiplier: parseFloat(mult.toFixed(2)),
        affinity,
        category,
        dnaScore: dnaSieve.compositeDna
          ? parseFloat((dnaSieve.compositeDna[n] * 100).toFixed(1))
          : 50,
      });
    }
    return items;
  }, [dnaSieve]);

  // Statistiques globales du Tamisage
  const sieveStats = useMemo(() => {
    const elites = sieveGridData.filter((d) => d.category === "ELITE");
    const shadows = sieveGridData.filter((d) => d.category === "SHADOW");
    const neutrals = sieveGridData.filter((d) => d.category === "NEUTRAL");
    const avgMultiplier =
      sieveGridData.reduce((acc, d) => acc + d.multiplier, 0) / 90.0;
    const snr = dnaSieve.stdDevDna
      ? (dnaSieve.stdDevDna / (dnaSieve.meanDna || 1)) * 100
      : 50;

    return {
      elitesCount: elites.length,
      shadowsCount: shadows.length,
      neutralsCount: neutrals.length,
      retentionRatePct: Number(((elites.length / 90) * 100).toFixed(1)),
      avgMultiplier: parseFloat(avgMultiplier.toFixed(2)),
      sieveIntensitySNR: Number(Math.min(100, Math.max(20, snr * 2.5)).toFixed(1)),
      concordanceMean: dnaSieve.dnaConcordanceMean || 50,
      entropy: dnaSieve.entropyBits || 0,
      dominantAlgos: dnaSieve.dominantAlgos || [],
    };
  }, [sieveGridData, dnaSieve]);

  // Filtrage des éléments de la grille du tamis
  const filteredSieveGrid = useMemo(() => {
    return sieveGridData.filter((item) => {
      if (sieveFilter === "ELITE") return item.category === "ELITE";
      if (sieveFilter === "NEUTRAL") return item.category === "NEUTRAL";
      if (sieveFilter === "SHADOW") return item.category === "SHADOW";
      return true;
    });
  }, [sieveGridData, sieveFilter]);

  // 5. Application des profils d'inoculation génomique
  const handleApplyProfile = (profile: InoculationProfile) => {
    if (!auditReport?.allGenes) return;
    audioEngine.play("click");
    setSelectedProfile(profile);

    let candidateWeights: Record<string, number> = {};

    switch (profile) {
      case "TOP_5_ELITE": {
        const top5 = auditReport.dominantGenes.slice(0, 5);
        top5.forEach((g) => {
          candidateWeights[g.key] = Math.max(0.01, g.resonanceScore);
        });
        break;
      }
      case "ANTI_OVERFITTING": {
        const meanWeight = 1.0 / auditReport.allGenes.length;
        auditReport.allGenes.forEach((g) => {
          candidateWeights[g.key] =
            g.recommendedWeight * 0.6 + meanWeight * 0.4;
        });
        break;
      }
      case "MAX_STABILITY": {
        auditReport.allGenes.forEach((g) => {
          candidateWeights[g.key] =
            g.recommendedWeight * (1 + g.meanReciprocalRank);
        });
        break;
      }
      case "FULL_RECOMMENDED":
      default: {
        candidateWeights = { ...auditReport.recommendedWeights };
        break;
      }
    }

    const normalized = normalizeWeights(candidateWeights as AlgoWeights);
    setGlobalWeights(normalized);
    setIsApplied(true);
    audioEngine.play("success");
    showToast(
      `Profil génomique [${profile}] inoculé avec succès au moteur de ${drawName} !`,
      "success",
    );
    setTimeout(() => setIsApplied(false), 3000);
  };

  // Exportation du diagnostic unifié en JSON
  const handleExportUnifiedJSON = () => {
    audioEngine.play("click");
    const exportData = {
      drawName,
      timestamp: new Date().toISOString(),
      dnaAudit: auditReport,
      dnaSieve: {
        dominantAlgos: dnaSieve.dominantAlgos,
        dnaConcordanceMean: dnaSieve.dnaConcordanceMean,
        entropyBits: dnaSieve.entropyBits,
        sieveIntensitySNR: sieveStats.sieveIntensitySNR,
        retentionRatePct: sieveStats.retentionRatePct,
        elites: sieveGridData.filter((d) => d.category === "ELITE"),
        shadows: sieveGridData.filter((d) => d.category === "SHADOW"),
      },
      macroFamiliesRadar: macroFamilies,
      activeWeights: globalWeights,
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `unifie_adn_tamis_radar_${drawName.toLowerCase().replace(/\s+/g, "_")}_${new Date().toISOString().split("T")[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast(
      "Dossier unifié ADN • Tamis • Radar exporté avec succès",
      "success",
    );
  };

  return (
    <div
      className={`w-full space-y-6 animate-fade-in font-sans ${className}`}
      id="unified-dna-sieve-radar"
    >
      {/* 1. MISSION CONTROL HEADER UNIFIÉ */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 bg-slate-900/90 p-6 md:p-8 rounded-3xl border border-slate-800 shadow-2xl relative overflow-hidden">
        <div className="space-y-1.5 relative z-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-gradient-to-r from-emerald-500/10 via-indigo-500/10 to-amber-500/10 border border-emerald-500/30 text-emerald-400 font-black text-[10px] rounded-lg uppercase tracking-wider">
            <Dna size={13} className="text-emerald-400 animate-pulse" />
            <span>Trilogie Algorithmique : ADN • Tamis • Radar</span>
          </div>
          <h2 className="text-2xl md:text-3xl font-black text-white uppercase tracking-tight flex items-center gap-3">
            Génome, Filtration & Radar Unifiés
          </h2>
          <p className="text-xs text-slate-400 font-medium max-w-2xl">
            Convergence continue entre l'ADN actif, le tamisage différentiable
            des 90 numéros et le radar d'alignement stochastique pour{" "}
            <span className="text-emerald-400 font-bold">{drawName}</span>.
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap relative z-10">
          {/* Sélecteur d'onglets de vue unifiée */}
          <div className="flex bg-slate-950 p-1 rounded-2xl border border-slate-800">
            {[
              { id: "PANORAMA", label: "Panoramique", icon: Sparkles },
              { id: "RADAR", label: "Radar 3D", icon: Radio },
              { id: "SIEVE", label: "Tamis 1-90", icon: Filter },
              { id: "GENOME_TABLE", label: "22 Gènes", icon: Layers },
            ].map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => {
                    audioEngine.play("click");
                    setViewMode(tab.id as ActiveViewMode);
                  }}
                  className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 transition-all cursor-pointer ${
                    viewMode === tab.id
                      ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  <Icon size={12} />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          <button
            onClick={handleExportUnifiedJSON}
            disabled={isLoading}
            className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs rounded-xl flex items-center gap-2 transition-colors border border-slate-700 disabled:opacity-40 cursor-pointer"
            title="Exporter l'archive unifiée"
          >
            <Download size={14} />
            <span className="hidden sm:inline">Export</span>
          </button>

          <button
            onClick={handleRunAudit}
            disabled={isLoading}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs uppercase tracking-wider rounded-xl flex items-center gap-2 transition-all shadow-lg shadow-emerald-600/20 active:scale-95 disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw size={14} className={isLoading ? "animate-spin" : ""} />
            <span>{isLoading ? "Sync..." : "Re-Scan Unifié"}</span>
          </button>
        </div>
      </div>

      {/* PROGRESSION DU CHARGEMENT */}
      {isLoading && (
        <div className="bg-slate-900/90 p-8 rounded-3xl border border-slate-800 shadow-xl space-y-4 text-center">
          <div className="flex items-center justify-center gap-3 text-emerald-400">
            <Cpu size={24} className="animate-spin" />
            <h3 className="text-sm font-black uppercase tracking-wider">
              Analyse Tri-Dimensionnelle (ADN • Tamis • Radar)
            </h3>
          </div>
          <p className="text-xs text-slate-400 font-mono">{progressStatus}</p>
          <div className="w-full max-w-md mx-auto h-2 bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-emerald-500 via-indigo-500 to-amber-500 transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      )}

      {/* 2. BARRE DES 4 KPI CARDS UNIFIÉS */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* KPI 1 : Index d'Harmonie ADN */}
        <div className="p-4 bg-slate-900/80 rounded-2xl border border-slate-800 shadow-sm relative flex flex-col justify-between">
          <div className="flex justify-between items-start">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
              Harmonie ADN Actif
            </span>
            <Sparkles size={14} className="text-amber-400" />
          </div>
          <div className="my-1.5">
            <div className="text-2xl font-black font-mono text-white">
              {auditReport
                ? auditReport.genomicHarmonyIndex.toFixed(1)
                : dnaSieve.dnaConcordanceMean || 50}
              <span className="text-xs text-slate-500 font-normal"> / 100</span>
            </div>
            <span className="text-[9px] text-slate-400 block">
              Concordance des 22 gènes
            </span>
          </div>
          <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
            <div
              className="bg-amber-400 h-full rounded-full"
              style={{
                width: `${auditReport?.genomicHarmonyIndex || dnaSieve.dnaConcordanceMean || 50}%`,
              }}
            />
          </div>
        </div>

        {/* KPI 2 : Intensité de Tamisage (SNR) */}
        <div className="p-4 bg-slate-900/80 rounded-2xl border border-slate-800 shadow-sm relative flex flex-col justify-between">
          <div className="flex justify-between items-start">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
              Intensité Tamisage (SNR)
            </span>
            <Filter size={14} className="text-violet-400" />
          </div>
          <div className="my-1.5">
            <div className="text-2xl font-black font-mono text-violet-400">
              {sieveStats.sieveIntensitySNR}%
            </div>
            <span className="text-[9px] text-slate-400 block">
              Contraste signal/bruit 1-90
            </span>
          </div>
          <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
            <div
              className="bg-violet-400 h-full rounded-full"
              style={{ width: `${sieveStats.sieveIntensitySNR}%` }}
            />
          </div>
        </div>

        {/* KPI 3 : Rétention Élite du Tamis */}
        <div className="p-4 bg-slate-900/80 rounded-2xl border border-slate-800 shadow-sm relative flex flex-col justify-between">
          <div className="flex justify-between items-start">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
              Survivants Élite Tamis
            </span>
            <Flame size={14} className="text-emerald-400" />
          </div>
          <div className="my-1.5">
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-black font-mono text-emerald-400">
                {sieveStats.elitesCount}
              </span>
              <span className="text-xs font-bold font-mono text-slate-400">
                / 90 numéros
              </span>
            </div>
            <span className="text-[9px] text-slate-400 block">
              {sieveStats.retentionRatePct}% taux d'amplification ($M_n \ge
              1.12$)
            </span>
          </div>
          <div className="text-[9px] text-emerald-400 font-mono font-bold">
            +{sieveStats.elitesCount} Amplifiés | -{sieveStats.shadowsCount}{" "}
            Ombres
          </div>
        </div>

        {/* KPI 4 : Entropie de Shannon & Régime */}
        <div className="p-4 bg-slate-900/80 rounded-2xl border border-slate-800 shadow-sm relative flex flex-col justify-between">
          <div className="flex justify-between items-start">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
              Entropie & Alignement
            </span>
            <Radio size={14} className="text-indigo-400" />
          </div>
          <div className="my-1.5">
            <div className="text-2xl font-black font-mono text-indigo-400">
              {sieveStats.entropy.toFixed(2)}
              <span className="text-xs text-slate-500 font-normal"> bits</span>
            </div>
            <span className="text-[9px] text-slate-400 block truncate">
              Top : {sieveStats.dominantAlgos.slice(0, 2).join(" • ") || "ADN Global"}
            </span>
          </div>
          <div className="text-[9px] text-indigo-300 font-mono">
            Régime stochastique actif
          </div>
        </div>
      </div>

      {/* 3. CORPS PRINCIPAL EN FONCTION DU VIEW MODE */}

      {/* VUE 1 : PANORAMA (SYMBIOSIE TRIPLE) */}
      {(viewMode === "PANORAMA" || viewMode === "RADAR") && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Colonne Gauche : Radar Algorithmique 3D (7 cols) */}
          <div className="lg:col-span-7 bg-slate-900/80 p-6 rounded-3xl border border-slate-800 space-y-4 shadow-xl flex flex-col justify-between">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
              <div>
                <h3 className="text-sm font-black uppercase tracking-wider text-white flex items-center gap-2">
                  <Radio size={16} className="text-indigo-400" />
                  Radar Algorithmique Tri-Dimensionnel
                </h3>
                <p className="text-[10px] text-slate-400 mt-0.5">
                  Confrontation : Poids Actuel (Vert) vs Cible Idéale (Or) vs
                  Énergie Tamis (Indigo) {activeScenario ? `vs ${activeScenario.name}` : ""}
                </p>
              </div>

              {/* Granularité Radar Macro / Micro */}
              <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800 self-end sm:self-auto">
                <button
                  onClick={() => setRadarGranularity("MACRO")}
                  className={`px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider cursor-pointer ${
                    radarGranularity === "MACRO"
                      ? "bg-indigo-600 text-white"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  Macro-Familles
                </button>
                <button
                  onClick={() => setRadarGranularity("MICRO")}
                  className={`px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider cursor-pointer ${
                    radarGranularity === "MICRO"
                      ? "bg-indigo-600 text-white"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  Top Gènes
                </button>
              </div>
            </div>

            {/* Sélecteur de superposition de scénario si présent */}
            {scenarios.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 p-2 bg-slate-950/80 rounded-xl border border-slate-800">
                <span className="text-[9px] font-black uppercase text-slate-400 mr-1 flex items-center gap-1">
                  <Target size={11} className="text-indigo-400" /> Empreinte Scénario :
                </span>
                {scenarios.map((sc) => {
                  const isSelected = activeScenario?.id === sc.id;
                  return (
                    <button
                      key={sc.id}
                      onClick={() => {
                        setInternalScenarioId(sc.id);
                        onSelectScenarioId?.(sc.id);
                      }}
                      className={`px-2 py-0.5 rounded-lg text-[9px] font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                        isSelected
                          ? "text-white shadow-md ring-1 ring-white/20"
                          : "text-slate-400 hover:text-slate-200 bg-slate-900/60"
                      }`}
                      style={{
                        backgroundColor: isSelected ? sc.color : undefined,
                      }}
                    >
                      <span
                        className="w-1.5 h-1.5 rounded-full"
                        style={{ backgroundColor: isSelected ? "#ffffff" : sc.color }}
                      />
                      {sc.name}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Recharts Radar Chart */}
            <div className="w-full h-80 relative">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart cx="50%" cy="50%" outerRadius="72%" data={radarChartData}>
                  <defs>
                    <radialGradient id="radarGradActuel" cx="0.5" cy="0.5" r="0.5">
                      <stop offset="0%" stopColor="#10b981" stopOpacity={0.6} />
                      <stop offset="100%" stopColor="#10b981" stopOpacity={0.15} />
                    </radialGradient>
                    <radialGradient id="radarGradCible" cx="0.5" cy="0.5" r="0.5">
                      <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.5} />
                      <stop offset="100%" stopColor="#f59e0b" stopOpacity={0.1} />
                    </radialGradient>
                    <radialGradient id="radarGradTamis" cx="0.5" cy="0.5" r="0.5">
                      <stop offset="0%" stopColor="#818cf8" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="#818cf8" stopOpacity={0.05} />
                    </radialGradient>
                  </defs>

                  <PolarGrid stroke="#334155" strokeDasharray="3 3" />
                  <PolarAngleAxis
                    dataKey="subject"
                    tick={{ fill: "#94a3b8", fontSize: 9, fontWeight: 700 }}
                  />
                  <PolarRadiusAxis
                    angle={30}
                    domain={[0, 100]}
                    tick={false}
                    axisLine={false}
                  />

                  <Radar
                    name="ADN Actuel (%)"
                    dataKey="Actuel"
                    stroke="#10b981"
                    strokeWidth={2.5}
                    fill="url(#radarGradActuel)"
                    fillOpacity={1}
                  />

                  <Radar
                    name="Cible Idéale (MRR)"
                    dataKey="Cible"
                    stroke="#f59e0b"
                    strokeWidth={2}
                    strokeDasharray="4 4"
                    fill="url(#radarGradCible)"
                    fillOpacity={0.6}
                  />

                  <Radar
                    name="Énergie Tamis (%)"
                    dataKey="Tamis"
                    stroke="#818cf8"
                    strokeWidth={1.5}
                    fill="url(#radarGradTamis)"
                    fillOpacity={0.4}
                  />

                  {activeScenario && (
                    <Radar
                      name={`Scénario : ${activeScenario.name} (%)`}
                      dataKey="Scenario"
                      stroke={activeScenario.color || "#f43f5e"}
                      strokeWidth={2.5}
                      strokeDasharray="3 3"
                      fill={activeScenario.color || "#f43f5e"}
                      fillOpacity={0.25}
                    />
                  )}

                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#0f172a",
                      borderColor: "#1e293b",
                      borderRadius: "12px",
                      fontSize: "11px",
                      fontWeight: 600,
                    }}
                  />
                  <Legend
                    wrapperStyle={{
                      fontSize: "10px",
                      fontWeight: 700,
                      paddingTop: "6px",
                    }}
                  />
                </RadarChart>
              </ResponsiveContainer>
            </div>

            {/* Macro Familles Metrics Strip */}
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 pt-2 border-t border-slate-800/80">
              {macroFamilies.map((f) => (
                <div
                  key={f.familyKey}
                  className="bg-slate-950/60 p-2 rounded-xl border border-slate-800 text-center"
                >
                  <span className="text-[8px] font-black uppercase text-slate-500 block truncate">
                    {f.familyName.split(" ")[0]}
                  </span>
                  <span className="text-xs font-mono font-bold text-emerald-400">
                    {f.currentWeightPct}%
                  </span>
                  <span className="text-[8px] font-mono text-amber-400/80 block">
                    Cible: {f.recommendedWeightPct}%
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Colonne Droite : Inoculation Génomique & Tamisage Rapide (5 cols) */}
          <div className="lg:col-span-5 bg-slate-900/80 p-6 rounded-3xl border border-slate-800 space-y-6 shadow-xl flex flex-col justify-between">
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <div className="p-2.5 bg-emerald-600/20 text-emerald-400 rounded-xl border border-emerald-500/30">
                  <Zap size={18} />
                </div>
                <div>
                  <h3 className="text-sm font-black uppercase tracking-wider text-white">
                    Inoculation & Calibrage ADN
                  </h3>
                  <p className="text-[10px] text-slate-400">
                    Calibrer instantanément les 22 algorithmes et réaligner le
                    tamis
                  </p>
                </div>
              </div>

              <div className="space-y-2.5">
                {[
                  {
                    id: "FULL_RECOMMENDED",
                    label: "Idéal Complet (Softmax Global)",
                    desc: "Ajuste les 22 algorithmes selon leur rendement réel",
                  },
                  {
                    id: "TOP_5_ELITE",
                    label: "Top 5 Élite (Pure Concentration)",
                    desc: "Focalise 100% du poids sur les 5 meilleurs gènes",
                  },
                  {
                    id: "ANTI_OVERFITTING",
                    label: "Anti-Surapprentissage (L2 Damp)",
                    desc: "Atténue les poids extrêmes pour maximiser la robustesse",
                  },
                  {
                    id: "MAX_STABILITY",
                    label: "Haute Résilience (MRR Pondéré)",
                    desc: "Favorise les algorithmes à concordance temporelle constante",
                  },
                ].map((p) => (
                  <button
                    key={p.id}
                    onClick={() => handleApplyProfile(p.id as InoculationProfile)}
                    className={`w-full p-3 rounded-2xl text-left border transition-all flex flex-col gap-0.5 cursor-pointer ${
                      selectedProfile === p.id && isApplied
                        ? "bg-emerald-600/20 border-emerald-500 text-white shadow-lg"
                        : "bg-slate-950/60 border-slate-800 text-slate-300 hover:border-slate-700"
                    }`}
                  >
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-black uppercase tracking-wider">
                        {p.label}
                      </span>
                      <Check
                        size={14}
                        className={
                          isApplied && selectedProfile === p.id
                            ? "text-emerald-400"
                            : "opacity-0"
                        }
                      />
                    </div>
                    <span className="text-[10px] text-slate-400">{p.desc}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Résumé d'amplification du tamis */}
            <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800/80 space-y-2">
              <div className="flex justify-between items-center text-xs">
                <span className="font-bold text-slate-400">
                  Amplification Max Tamis :
                </span>
                <span className="font-mono font-black text-emerald-400">
                  ×
                  {Math.max(
                    ...sieveGridData.map((d) => d.multiplier),
                  ).toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="font-bold text-slate-400">
                  Atténuation Min Tamis :
                </span>
                <span className="font-mono font-black text-rose-400">
                  ×
                  {Math.min(
                    ...sieveGridData.map((d) => d.multiplier),
                  ).toFixed(2)}
                </span>
              </div>
              <div className="text-[9px] font-mono text-slate-500 pt-1 border-t border-slate-800">
                Isolation stricte : calibrage appliqué exclusivement à{" "}
                <strong className="text-slate-300">{drawName}</strong>.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* VUE 2 & PANORAMA : MATRICE INTERACTIVE DU TAMIS 1-90 */}
      {(viewMode === "PANORAMA" || viewMode === "SIEVE") && (
        <div className="bg-slate-900/70 p-6 md:p-8 rounded-3xl border border-slate-800 shadow-xl space-y-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <h3 className="text-sm font-black uppercase tracking-wider text-white flex items-center gap-2">
                <Filter size={16} className="text-emerald-400" />
                Matrice du Tamis ADN Actif (Numéros 1 à 90)
              </h3>
              <p className="text-[10px] text-slate-400 mt-0.5">
                Filtrage différentiable continu : les multiplicateurs sont
                calculés selon le profil génomique actif
              </p>
            </div>

            {/* Filtre de Catégories Tamis */}
            <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800 flex-wrap gap-1">
              {[
                { id: "ALL", label: `Tous (90)` },
                {
                  id: "ELITE",
                  label: `🔥 Survivants (${sieveStats.elitesCount})`,
                },
                {
                  id: "NEUTRAL",
                  label: `⚖️ Neutres (${sieveStats.neutralsCount})`,
                },
                {
                  id: "SHADOW",
                  label: `🌑 Ombres (${sieveStats.shadowsCount})`,
                },
              ].map((f) => (
                <button
                  key={f.id}
                  onClick={() => setSieveFilter(f.id as any)}
                  className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider cursor-pointer ${
                    sieveFilter === f.id
                      ? "bg-emerald-600 text-white shadow"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {/* GRILLE DES 90 NUMÉROS TAMISÉS */}
          <div className="grid grid-cols-6 sm:grid-cols-10 md:grid-cols-15 lg:grid-cols-18 gap-2">
            {filteredSieveGrid.map((item) => {
              const isSelected = selectedNumber === item.num;
              return (
                <button
                  key={item.num}
                  onClick={() => {
                    audioEngine.play("click");
                    setSelectedNumber(isSelected ? null : item.num);
                  }}
                  className={`p-2 rounded-xl flex flex-col items-center justify-between border transition-all cursor-pointer relative ${
                    item.category === "ELITE"
                      ? "bg-emerald-500/10 border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/20"
                      : item.category === "SHADOW"
                      ? "bg-slate-950/80 border-slate-800 text-slate-500 hover:border-slate-700"
                      : "bg-slate-900/90 border-slate-800/80 text-slate-300 hover:border-indigo-500/40"
                  } ${isSelected ? "ring-2 ring-indigo-400 scale-105 shadow-xl z-10" : ""}`}
                >
                  <span className="text-xs font-black font-mono">
                    {String(item.num).padStart(2, "0")}
                  </span>
                  <span
                    className={`text-[8px] font-mono font-bold mt-0.5 ${
                      item.multiplier >= 1.12
                        ? "text-emerald-400"
                        : item.multiplier <= 0.88
                        ? "text-rose-400/80"
                        : "text-slate-400"
                    }`}
                  >
                    ×{item.multiplier}
                  </span>
                </button>
              );
            })}
          </div>

          {/* INSPECTEUR DÉTAILLÉ DU NUMÉRO SÉLECTIONNÉ */}
          {selectedNumber !== null && (
            <div className="bg-slate-950 p-4 rounded-2xl border border-indigo-500/40 space-y-3 animate-fade-in">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-black font-mono text-sm shadow-md">
                    {selectedNumber}
                  </div>
                  <div>
                    <h4 className="text-xs font-black uppercase text-white">
                      Diagnostic Génomique & Tamis du Numéro {selectedNumber}
                    </h4>
                    <span className="text-[10px] text-slate-400">
                      Multiplicateur Tamis :{" "}
                      <strong className="text-emerald-400">
                        ×{dnaSieve.multipliers[selectedNumber]?.toFixed(2)}
                      </strong>{" "}
                      • Concordance ADN :{" "}
                      <strong className="text-indigo-400">
                        {dnaSieve.affinityPercent[selectedNumber]}%
                      </strong>
                    </span>
                  </div>
                </div>

                <button
                  onClick={() => setSelectedNumber(null)}
                  className="text-xs text-slate-500 hover:text-white px-2 py-1"
                >
                  Fermer
                </button>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-[10px] font-mono">
                <div className="bg-slate-900/80 p-2.5 rounded-xl border border-slate-800">
                  <span className="text-slate-500 block uppercase">
                    Statut Tamis
                  </span>
                  <span className="font-black text-white">
                    {dnaSieve.multipliers[selectedNumber] >= 1.12
                      ? "🔥 Survivant Élite (Amplifié)"
                      : dnaSieve.multipliers[selectedNumber] <= 0.88
                      ? "🌑 Ombre Tamisée (Atténué)"
                      : "⚖️ Neutre"}
                  </span>
                </div>
                <div className="bg-slate-900/80 p-2.5 rounded-xl border border-slate-800">
                  <span className="text-slate-500 block uppercase">
                    Score Composite ADN
                  </span>
                  <span className="font-black text-emerald-400">
                    {dnaSieve.compositeDna
                      ? (dnaSieve.compositeDna[selectedNumber] * 100).toFixed(1)
                      : 50}
                    %
                  </span>
                </div>
                <div className="bg-slate-900/80 p-2.5 rounded-xl border border-slate-800">
                  <span className="text-slate-500 block uppercase">
                    Gènes Porteurs
                  </span>
                  <span className="font-black text-indigo-300 truncate block">
                    {dnaSieve.dominantAlgos.join(", ")}
                  </span>
                </div>
                <div className="bg-slate-900/80 p-2.5 rounded-xl border border-slate-800">
                  <span className="text-slate-500 block uppercase">
                    Action Recommandée
                  </span>
                  <span className="font-black text-amber-400">
                    {dnaSieve.multipliers[selectedNumber] >= 1.12
                      ? "Priorité Haute dans l'Oracle"
                      : "Filtrage standard"}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* VUE 3 : TABLEAU COMPLET DES 22 GÈNES ALGORITHMIQUES */}
      {(viewMode === "PANORAMA" || viewMode === "GENOME_TABLE") &&
        auditReport && (
          <div className="space-y-4 bg-slate-900/70 p-6 md:p-8 rounded-3xl border border-slate-800 shadow-xl">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-800 pb-4">
              <div>
                <h3 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
                  <Layers size={16} className="text-indigo-400" />
                  Cartographie Exhaustive des 22 Gènes Algorithmiques
                </h3>
                <p className="text-[10px] text-slate-400 mt-0.5">
                  Analyse détaillée du Mean Reciprocal Rank (MRR) et de
                  l'Information Coefficient
                </p>
              </div>

              {/* Barre de Recherche */}
              <div className="relative w-full sm:w-64">
                <Search
                  size={14}
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
                />
                <input
                  type="text"
                  placeholder="Rechercher un gène..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            {/* Tableau des Gènes */}
            <div className="overflow-x-auto custom-scrollbar">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-[10px] font-black uppercase text-slate-400 tracking-wider">
                    <th className="pb-3 px-3">Gène Algorithmique</th>
                    <th className="pb-3 px-3">Catégorie</th>
                    <th className="pb-3 px-3">Poids Actuel</th>
                    <th className="pb-3 px-3">Poids Idéal</th>
                    <th className="pb-3 px-3">Attribution MRR</th>
                    <th className="pb-3 px-3">Capture Top-5</th>
                    <th className="pb-3 px-3 text-right">Statut</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono">
                  {auditReport.allGenes
                    .filter((g) => {
                      if (!searchQuery) return true;
                      return (
                        g.label
                          .toLowerCase()
                          .includes(searchQuery.toLowerCase()) ||
                        g.key.toLowerCase().includes(searchQuery.toLowerCase())
                      );
                    })
                    .map((gene) => (
                      <tr
                        key={gene.key}
                        className="hover:bg-slate-800/30 transition-colors"
                      >
                        <td className="py-3 px-3 font-bold text-slate-200 font-sans">
                          {gene.label}
                        </td>
                        <td className="py-3 px-3 text-slate-400 text-[10px] font-sans">
                          {gene.category}
                        </td>
                        <td className="py-3 px-3 text-slate-400">
                          {(gene.currentWeight * 100).toFixed(1)}%
                        </td>
                        <td className="py-3 px-3 text-emerald-400 font-bold">
                          {(gene.recommendedWeight * 100).toFixed(1)}%
                        </td>
                        <td className="py-3 px-3 text-indigo-400">
                          {gene.meanReciprocalRank.toFixed(3)}
                        </td>
                        <td className="py-3 px-3 text-slate-300">
                          {(gene.historicalHitRateTop5 * 100).toFixed(1)}%
                        </td>
                        <td className="py-3 px-3 text-right">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${
                              gene.status === "underweighted"
                                ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                                : gene.status === "overweighted"
                                ? "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                                : "bg-slate-800 text-slate-400"
                            }`}
                          >
                            {gene.status === "underweighted"
                              ? "Sous-pondéré"
                              : gene.status === "overweighted"
                              ? "Sur-pondéré"
                              : "Optimal"}
                          </span>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
    </div>
  );
};
