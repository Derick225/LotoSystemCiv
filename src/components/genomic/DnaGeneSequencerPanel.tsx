import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  Dna,
  RefreshCw,
  Check,
  Search,
  ArrowUpDown,
  ShieldCheck,
  AlertTriangle,
  Link2,
  Activity,
} from "lucide-react";
import { useNexusStore } from "../../store/useNexusStore";
import { useForensicData } from "../../hooks/useForensicData";
import { useToast } from "../ui/Toast";
import { audioEngine } from "../../utils/audioEngine";
import {
  runUnifiedDnaGeneSequencer,
  evaluateDnaGeneSequencerWalkForward,
  evaluateNetworkWalkForward,
  CHROMOSOMAL_ARM_LABELS,
  type ChromosomalArm,
  type GeneExpressionState,
  type DnaGeneSynthesisResult,
  type DnaGeneNode,
  type DnaGeneWalkForwardResult,
  type NetworkWalkForwardResult,
} from "../../services/prediction/dnaGeneSequenceService";
import { getDrawNetworkId, INTER_DRAW_NETWORKS } from "../../constants";
import { fetchResults } from "../../services/lotteryService";
import type { DrawResult } from "../../types";
import { AlgoKey } from "../../shared/prediction.types";

const ARM_SHORT_LABELS: Record<ChromosomalArm, string> = {
  STOCHASTIC_INFERENCE: "Inférence Stochastique",
  TEMPORAL_CADENCE: "Écarts & Cadences",
  SPECTRAL_FRACTAL: "Spectral & Fractal",
  TOPOLOGICAL_TRANSFER: "Topologie & Transferts",
};

const ARM_STRIPE_COLORS: Record<ChromosomalArm, string> = {
  STOCHASTIC_INFERENCE: "bg-cyan-500",
  TEMPORAL_CADENCE: "bg-amber-500",
  SPECTRAL_FRACTAL: "bg-indigo-500",
  TOPOLOGICAL_TRANSFER: "bg-emerald-500",
};

const ARM_TEXT_COLORS: Record<ChromosomalArm, string> = {
  STOCHASTIC_INFERENCE: "text-cyan-400",
  TEMPORAL_CADENCE: "text-amber-400",
  SPECTRAL_FRACTAL: "text-indigo-400",
  TOPOLOGICAL_TRANSFER: "text-emerald-400",
};

const EXPRESSION_LABELS: Record<
  GeneExpressionState,
  { label: string; glyph: string; toneClass: string }
> = {
  DOMINANT: {
    label: "Dominant",
    glyph: "▲",
    toneClass: "text-emerald-400",
  },
  CO_EXPRESSIVE: {
    label: "Co-expressif",
    glyph: "●",
    toneClass: "text-cyan-400",
  },
  HOMEOSTATIC: {
    label: "Homéostatique",
    glyph: "◆",
    toneClass: "text-slate-300",
  },
  REPRESSED: {
    label: "Réprimé",
    glyph: "▼",
    toneClass: "text-amber-400",
  },
  SILENCED: {
    label: "Neutralisé",
    glyph: "✖",
    toneClass: "text-rose-400",
  },
};

type SortColumn = "rank" | "optimizedWeight" | "weightDelta" | "postMortemSignal" | "proofZScore";

export const DnaGeneSequencerPanel: React.FC<{
  drawName: string;
}> = ({ drawName }) => {
  const { showToast } = useToast();
  const history = useNexusStore((state) => state.history);
  const globalWeights = useNexusStore((state) => state.globalWeights);
  const setGlobalWeights = useNexusStore((state) => state.setGlobalWeights);
  const addAgentLog = useNexusStore((state) => state.addAgentLog);

  const { reports } = useForensicData(drawName);

  const [result, setResult] = useState<DnaGeneSynthesisResult | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [applying, setApplying] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [armFilter, setArmFilter] = useState<"ALL" | ChromosomalArm>("ALL");
  const [stateFilter, setStateFilter] = useState<"ALL" | GeneExpressionState>("ALL");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedGeneKey, setSelectedGeneKey] = useState<AlgoKey | null>(null);
  const [sortCol, setSortCol] = useState<SortColumn>("rank");
  const [sortAsc, setSortAsc] = useState<boolean>(true);
  const [walkForward, setWalkForward] = useState<DnaGeneWalkForwardResult | null>(null);
  const [wfLoading, setWfLoading] = useState<boolean>(false);
  const [networkWf, setNetworkWf] = useState<NetworkWalkForwardResult | null>(null);
  const [networkWfLoading, setNetworkWfLoading] = useState<boolean>(false);

  const handleRunWalkForward = async () => {
    try {
      setWfLoading(true);
      audioEngine.play("scan");
      const wf = await evaluateDnaGeneSequencerWalkForward({
        drawName,
        history,
        currentWeights: globalWeights,
        forensicReports: reports,
      });
      setWalkForward(wf);
      audioEngine.play("success");
      showToast(wf.summaryText, wf.status === "COMPLETED" ? "success" : "info");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erreur de validation walk-forward";
      showToast(`Erreur walk-forward : ${msg}`, "error");
    } finally {
      setWfLoading(false);
    }
  };

  const runDryAnalysis = useCallback(async () => {
    try {
      setLoading(true);
      setErrorMsg(null);
      const res = await runUnifiedDnaGeneSequencer(drawName, history, globalWeights, {
        forensicReports: reports,
        applyWeights: false,
      });
      setResult(res);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erreur de séquençage ADN";
      setErrorMsg(msg);
    } finally {
      setLoading(false);
    }
  }, [drawName, history, globalWeights, reports]);

  const handleRunNetworkWalkForward = async () => {
    try {
      setNetworkWfLoading(true);
      audioEngine.play("scan");
      const networkId = getDrawNetworkId(drawName) ?? "hebdomadaire";
      const drawNames = INTER_DRAW_NETWORKS[networkId].drawNames;
      const entries = await Promise.all(
        drawNames.map(async (name): Promise<[string, DrawResult[]]> => {
          try {
            const res = await fetchResults(name);
            if (res.data && res.data.length > 0) return [name, res.data];
          } catch {
            // fallback local sur historique actif si correspondant
          }
          return [name, name.toLowerCase() === drawName.toLowerCase() ? history : []];
        })
      );
      const historyByDraw = Object.fromEntries(entries);
      const netRes = await evaluateNetworkWalkForward({
        networkId,
        history,
        historyByDraw,
        forensicReports: reports,
      });
      setNetworkWf(netRes);
      audioEngine.play("success");
      showToast(
        `Évaluation réseau ${networkId} : N=${netRes.totalOosDrawsCount} pas OOS sur ${netRes.drawsEvaluated.length} tirage(s), p=${netRes.permutationTest.pValueTwoSided.toFixed(3)}.`,
        netRes.totalOosDrawsCount > 0 ? "success" : "info"
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erreur d'évaluation réseau";
      showToast(`Erreur walk-forward réseau : ${msg}`, "error");
    } finally {
      setNetworkWfLoading(false);
    }
  };

  useEffect(() => {
    setWalkForward(null);
    setNetworkWf(null);
    runDryAnalysis();
  }, [runDryAnalysis]);

  const handleApplySynthesis = async () => {
    try {
      setApplying(true);
      audioEngine.play("scan");
      const applied = await runUnifiedDnaGeneSequencer(drawName, history, globalWeights, {
        forensicReports: reports,
        applyWeights: true,
      });
      setGlobalWeights(applied.optimizedWeights);
      setResult(applied);
      addAgentLog({
        id: `epigenome_sq_${Date.now()}`,
        timestamp: new Date(),
        action: `Séquenceur génomique appliqué sur ${drawName} (${applied.sequenceMetrics.sequenceSignature})`,
        type: "AUTOTUNE",
        impact: `Cohérence épistasique ${applied.sequenceMetrics.epistaticCoherenceScore}% · Décalage Kendall-Tau ${(applied.sequenceMetrics.kendallTauShiftVsActive * 100).toFixed(1)}%`,
      });
      audioEngine.play("success");
      showToast(
        `Séquence et poids ADN appliqués pour ${drawName} (${applied.sequenceMetrics.sequenceSignature}).`,
        "success"
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Échec d'application";
      showToast(`Erreur lors de l'application génomique : ${msg}`, "error");
    } finally {
      setApplying(false);
    }
  };

  const handleSort = (col: SortColumn) => {
    if (sortCol === col) {
      setSortAsc((prev) => !prev);
    } else {
      setSortCol(col);
      setSortAsc(col === "rank");
    }
  };

  const filteredAndSortedGenes: DnaGeneNode[] = useMemo(() => {
    if (!result) return [];
    const q = searchQuery.trim().toLowerCase();
    const list = result.geneSequence.filter((node) => {
      if (armFilter !== "ALL" && node.chromosomalArm !== armFilter) return false;
      if (stateFilter !== "ALL" && node.expressionState !== stateFilter) return false;
      if (q) {
        const hitLabel = node.label.toLowerCase().includes(q);
        const hitKey = node.key.toLowerCase().includes(q);
        const hitRat = node.rationale.toLowerCase().includes(q);
        if (!hitLabel && !hitKey && !hitRat) return false;
      }
      return true;
    });

    return [...list].sort((a, b) => {
      const vA = a[sortCol];
      const vB = b[sortCol];
      return sortAsc ? vA - vB : vB - vA;
    });
  }, [result, armFilter, stateFilter, searchQuery, sortCol, sortAsc]);

  const selectedGeneNode = useMemo(() => {
    if (!result || !selectedGeneKey) return null;
    return result.geneSequence.find((g) => g.key === selectedGeneKey) ?? null;
  }, [result, selectedGeneKey]);

  const selectedGeneCouplings = useMemo(() => {
    if (!result || !selectedGeneKey) return [];
    return result.epistaticCouplings.filter(
      (c) => c.geneA === selectedGeneKey || c.geneB === selectedGeneKey
    );
  }, [result, selectedGeneKey]);

  if (loading && !result) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
        <div className="flex items-center gap-3 text-slate-300 text-sm font-medium">
          <RefreshCw size={16} className="animate-spin text-cyan-400" />
          <span>Calcul de la séquence chromosomique et des couplages épistasiques pour {drawName}...</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[0, 1, 2, 3].map((idx) => (
            <div key={idx} className="h-24 bg-slate-950/60 border border-slate-800/80 rounded-xl animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (errorMsg && !result) {
    return (
      <div className="bg-slate-900 border border-rose-900/60 rounded-2xl p-6 space-y-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3 text-rose-400 text-sm font-semibold">
            <AlertTriangle size={18} />
            <span>Impossible d'exécuter le séquenceur génomique : {errorMsg}</span>
          </div>
          <button
            onClick={runDryAnalysis}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Réessayer l'analyse
          </button>
        </div>
      </div>
    );
  }

  if (!result) return null;

  const { sequenceMetrics, sourcesUsed, regimeContext, codons, epistaticCouplings, auditTrail } = result;
  const provenGenesCount = result.geneSequence.filter((g) => g.hasEmpiricalProof).length;
  const meanEbCredPct =
    result.geneSequence.length > 0
      ? (result.geneSequence.reduce((s, g) => s + (g.ebCredibility ?? (g.hasEmpiricalProof ? 1 : 0)), 0) /
          result.geneSequence.length) *
        100
      : 0;

  return (
    <div className="space-y-6">
      {/* En-tête de calibration et actions principales */}
      <section className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-2 max-w-3xl">
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400 font-mono">
              <span className="text-cyan-400 font-semibold">Séquenceur Épistasique ADN</span>
              <span aria-hidden="true">·</span>
              <span>{drawName}</span>
              <span aria-hidden="true">·</span>
              <span>Régime {regimeContext.regime} (H={regimeContext.hurst.toFixed(3)})</span>
              <span aria-hidden="true">·</span>
              <span className="text-slate-200">{sequenceMetrics.sequenceSignature}</span>
            </div>
            <h3 className="text-xl md:text-2xl font-bold text-white tracking-tight">
              Ordonnancement des Gènes &amp; Régulation des Poids Post-Mortem
            </h3>
            <p className="text-sm text-slate-400 leading-relaxed">
              Fusionne par précision inverse les rapports post-mortem, les autopsies en boucle fermée,
              la dérive ADN et la lignée génomique tout en appliquant un rétrécissement Empirical-Bayes
              dérivé du test de rang Mann-Whitney (Westfall-Young max-T).
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <button
              onClick={() => {
                audioEngine.play("click");
                runDryAnalysis();
              }}
              disabled={loading || applying}
              className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 rounded-xl text-xs font-semibold flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
            >
              <RefreshCw size={14} className={loading ? "animate-spin text-cyan-400" : ""} />
              Analyser la séquence
            </button>

            <button
              onClick={handleApplySynthesis}
              disabled={applying || loading}
              className="px-4 py-2.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl text-xs font-semibold flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
            >
              {applying ? (
                <RefreshCw size={14} className="animate-spin" />
              ) : (
                <Check size={14} />
              )}
              {applying ? "Application en cours..." : "Appliquer les poids ADN"}
            </button>
          </div>
        </div>

        {/* Bandeau de 4 KPI tabulaires */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-4 border-t border-slate-800">
          <div className="p-4 bg-slate-950/60 border border-slate-800/80 rounded-xl space-y-1">
            <div className="text-xs text-slate-400 font-medium">Cohérence Épistasique</div>
            <div className="text-2xl font-mono font-bold text-white tabular-nums">
              {sequenceMetrics.epistaticCoherenceScore.toFixed(1)}
              <span className="text-xs text-slate-400 font-normal ml-1.5">%</span>
            </div>
            <div className="text-xs font-mono text-cyan-400 tabular-nums">
              {codons.length} codon(s) · {epistaticCouplings.length} couplage(s)
            </div>
          </div>

          <div className="p-4 bg-slate-950/60 border border-slate-800/80 rounded-xl space-y-1">
            <div className="text-xs text-slate-400 font-medium">Décalage Séquence (Kendall-Tau)</div>
            <div className="text-2xl font-mono font-bold text-white tabular-nums">
              {(sequenceMetrics.kendallTauShiftVsActive * 100).toFixed(1)}
              <span className="text-xs text-slate-400 font-normal ml-1.5">%</span>
            </div>
            <div className="text-xs font-mono text-slate-400 tabular-nums">
              Spearman Footrule : {(sequenceMetrics.spearmanFootruleNormalized * 100).toFixed(1)}%
            </div>
          </div>

          <div className="p-4 bg-slate-950/60 border border-slate-800/80 rounded-xl space-y-1">
            <div className="text-xs text-slate-400 font-medium">Crédibilité EB &amp; Preuve WY max-T</div>
            <div className="text-2xl font-mono font-bold text-white tabular-nums">
              {meanEbCredPct.toFixed(1)}
              <span className="text-xs text-slate-400 font-normal ml-1.5">
                % ({provenGenesCount}/{result.geneSequence.length} WY)
              </span>
            </div>
            <div className="text-xs font-mono text-emerald-400 tabular-nums">
              Entropie Shannon : {(sequenceMetrics.shannonWeightDiversity * 100).toFixed(1)}%
            </div>
          </div>

          <div className="p-4 bg-slate-950/60 border border-slate-800/80 rounded-xl space-y-1">
            <div className="text-xs text-slate-400 font-medium">Régulation &amp; Sources Fusionnées</div>
            <div className="text-2xl font-mono font-bold text-white tabular-nums">
              {(sequenceMetrics.maxWeightDelta * 100).toFixed(2)}
              <span className="text-xs text-slate-400 font-normal ml-1.5">
                % Δmax (τ={(sequenceMetrics.criticalThreshold * 100).toFixed(1)}%)
              </span>
            </div>
            <div className="text-xs font-mono text-slate-400 tabular-nums">
              {sourcesUsed.forensicReports} post-mortem · {sourcesUsed.autopsyReports} autopsies · {sourcesUsed.dnaLineageGenerations} lignées
            </div>
          </div>
        </div>
      </section>

      {/* Ruban Chromosomique Ordonné + Répartition des 4 Bras */}
      <section className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h4 className="text-base font-semibold text-white flex items-center gap-2">
              <Dna size={16} className="text-cyan-400" />
              Ruban Chromosomique Ordonné (Rang 1 à {result.geneSequence.length})
            </h4>
            <p className="text-xs text-slate-400 mt-1">
              Cliquez sur un locus génique pour inspecter ses interactions épistasiques et sa justification post-mortem.
            </p>
          </div>
          <div className="text-xs font-mono text-slate-400 tabular-nums">
            Équilibre inter-bras : {(sequenceMetrics.armBalanceEntropy * 100).toFixed(1)}%
          </div>
        </div>

        {/* 4 Bras Chromosomiques */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {(Object.keys(sequenceMetrics.armDistribution) as ChromosomalArm[]).map((arm) => {
            const info = sequenceMetrics.armDistribution[arm];
            const isActiveArm = armFilter === arm;
            return (
              <button
                key={arm}
                onClick={() => setArmFilter(isActiveArm ? "ALL" : arm)}
                className={`text-left p-3.5 rounded-xl border transition-colors cursor-pointer ${
                  isActiveArm
                    ? "bg-slate-800 border-cyan-500/70"
                    : "bg-slate-950/60 border-slate-800 hover:border-slate-700"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className={`text-xs font-semibold ${ARM_TEXT_COLORS[arm]}`}>
                    {ARM_SHORT_LABELS[arm]}
                  </span>
                  <span className="text-xs font-mono text-slate-300 tabular-nums">
                    {(info.weightShare * 100).toFixed(1)}%
                  </span>
                </div>
                <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden mt-2">
                  <div
                    className={`h-full ${ARM_STRIPE_COLORS[arm]}`}
                    style={{ width: `${Math.min(100, Math.max(2, info.weightShare * 100))}%` }}
                  />
                </div>
                <div className="mt-2 flex items-center justify-between text-[11px] font-mono text-slate-400 tabular-nums">
                  <span>{info.geneCount} gènes</span>
                  <span>
                    Signal {info.meanSignal >= 0 ? "+" : ""}
                    {(info.meanSignal * 100).toFixed(1)}%
                  </span>
                </div>
              </button>
            );
          })}
        </div>

        {/* Séquence ordonnée cliquable */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
          {result.geneSequence.map((node) => {
            const isSelected = selectedGeneKey === node.key;
            const exp = EXPRESSION_LABELS[node.expressionState];
            return (
              <button
                key={node.key}
                onClick={() => setSelectedGeneKey(isSelected ? null : node.key)}
                className={`p-3 rounded-xl border text-left transition-colors cursor-pointer ${
                  isSelected
                    ? "bg-slate-800 border-cyan-400"
                    : "bg-slate-950/70 border-slate-800/90 hover:border-slate-700"
                }`}
              >
                <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 tabular-nums">
                  <span>#{node.rank}</span>
                  <span className={node.rankShift > 0 ? "text-emerald-400" : node.rankShift < 0 ? "text-amber-400" : "text-slate-500"}>
                    {node.rankShift > 0 ? `▲+${node.rankShift}` : node.rankShift < 0 ? `▼${node.rankShift}` : "="}
                  </span>
                </div>
                <div className="mt-1 text-xs font-semibold text-white truncate" title={node.label}>
                  {node.label}
                </div>
                <div className="mt-1.5 flex items-center justify-between text-[11px] font-mono tabular-nums">
                  <span className="text-slate-200">{(node.optimizedWeight * 100).toFixed(2)}%</span>
                  <span className={exp.toneClass} title={exp.label}>
                    {exp.glyph}
                  </span>
                </div>
                <div className={`mt-2 h-1 rounded-full ${ARM_STRIPE_COLORS[node.chromosomalArm]} opacity-75`} />
              </button>
            );
          })}
        </div>

        {/* Inspecteur de Locus sélectionné */}
        {selectedGeneNode && (
          <div className="p-4 bg-slate-950/80 border border-cyan-500/40 rounded-xl space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="space-y-0.5">
                <div className="text-xs font-mono text-cyan-400">
                  Locus #{selectedGeneNode.rank} · {CHROMOSOMAL_ARM_LABELS[selectedGeneNode.chromosomalArm]}
                </div>
                <div className="text-base font-semibold text-white">
                  {selectedGeneNode.label} ({selectedGeneNode.key})
                </div>
              </div>
              <button
                onClick={() => setSelectedGeneKey(null)}
                className="text-xs text-slate-400 hover:text-white self-start sm:self-auto cursor-pointer"
              >
                Fermer l'inspection
              </button>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">{selectedGeneNode.rationale}</p>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs font-mono tabular-nums pt-2 border-t border-slate-800">
              <div>
                <span className="text-slate-400 block">Forensic</span>
                <span className="text-slate-100">{(selectedGeneNode.forensicComponent * 100).toFixed(1)}%</span>
              </div>
              <div>
                <span className="text-slate-400 block">Autopsie</span>
                <span className="text-slate-100">{(selectedGeneNode.autopsyComponent * 100).toFixed(1)}%</span>
              </div>
              <div>
                <span className="text-slate-400 block">Audit Génomique</span>
                <span className="text-slate-100">{(selectedGeneNode.genomicComponent * 100).toFixed(1)}%</span>
              </div>
              <div>
                <span className="text-slate-400 block">Dérive ADN</span>
                <span className="text-slate-100">{(selectedGeneNode.driftComponent * 100).toFixed(1)}%</span>
              </div>
              <div>
                <span className="text-slate-400 block">Stabilité Lignée</span>
                <span className="text-slate-100">{(selectedGeneNode.stabilityScore * 100).toFixed(1)}%</span>
              </div>
            </div>
            {selectedGeneCouplings.length > 0 && (
              <div className="pt-2 border-t border-slate-800 space-y-1.5">
                <div className="text-xs font-medium text-slate-300 flex items-center gap-1.5">
                  <Link2 size={13} className="text-cyan-400" />
                  Couplages épistasiques détectés ({selectedGeneCouplings.length})
                </div>
                <div className="flex flex-wrap gap-3 text-xs font-mono tabular-nums">
                  {selectedGeneCouplings.slice(0, 6).map((c) => {
                    const partner = c.geneA === selectedGeneNode.key ? c.labelB : c.labelA;
                    return (
                      <span
                        key={`${c.geneA}_${c.geneB}`}
                        className={c.couplingStrength >= 0 ? "text-emerald-400" : "text-amber-400"}
                      >
                        {partner} ({c.couplingStrength >= 0 ? "+" : ""}
                        {(c.couplingStrength * 100).toFixed(1)}%)
                      </span>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      {/* Codons Synergiques & Couplages Épistasiques */}
      <section className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <h4 className="text-base font-semibold text-white">
            Codons Synergiques &amp; Matrice d'Épistasie ({codons.length} codon(s))
          </h4>
          <span className="text-xs text-slate-400 font-mono">
            Co-expression XAP gagnants · Contrefactuels · Covariance longitudinale
          </span>
        </div>

        {codons.length === 0 ? (
          <div className="p-4 bg-slate-950/60 border border-slate-800 rounded-xl text-xs text-slate-400">
            Aucun codon épistasique statistiquement significatif détecté sur ce tirage pour le moment. Exécutez
            des autopsies ou analyses post-mortem pour enrichir la matrice de co-expression.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {codons.map((codon) => (
              <div
                key={codon.id}
                className="p-4 bg-slate-950/70 border border-slate-800 rounded-xl space-y-2"
              >
                <div className="flex items-center justify-between gap-2 text-xs font-mono tabular-nums">
                  <span className={ARM_TEXT_COLORS[codon.arm]}>{ARM_SHORT_LABELS[codon.arm]}</span>
                  <span className="text-emerald-400 font-semibold">
                    Cohésion {codon.cohesionScore}%
                  </span>
                </div>
                <div className="text-sm font-semibold text-white">
                  {codon.labels.join(" ⊕ ")}
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">{codon.description}</p>
                <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-xs font-mono tabular-nums text-slate-300">
                  <span>Masse combinée : {(codon.combinedWeight * 100).toFixed(2)}%</span>
                  <span className="text-cyan-400">
                    Lift +{(codon.synergyLift * 100).toFixed(1)}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Table complète des 25 gènes ADN */}
      <section className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <h4 className="text-base font-semibold text-white">
            Registre Complet des Gènes ADN ({filteredAndSortedGenes.length} / {result.geneSequence.length})
          </h4>

          <div className="flex flex-wrap items-center gap-3">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filtrer un gène..."
                className="pl-8 pr-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
              />
            </div>

            <div className="flex items-center gap-1 p-1 bg-slate-950 border border-slate-800 rounded-lg overflow-x-auto">
              {(
                [
                  { id: "ALL", label: "Tous" },
                  { id: "DOMINANT", label: "Dominants" },
                  { id: "CO_EXPRESSIVE", label: "Co-expressifs" },
                  { id: "REPRESSED", label: "Réprimés" },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => setStateFilter(opt.id)}
                  className={`px-2.5 py-1 rounded text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    stateFilter === opt.id
                      ? "bg-slate-800 text-white"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {(armFilter !== "ALL" || stateFilter !== "ALL" || searchQuery) && (
              <button
                onClick={() => {
                  setArmFilter("ALL");
                  setStateFilter("ALL");
                  setSearchQuery("");
                }}
                className="text-xs text-cyan-400 hover:text-cyan-300 whitespace-nowrap cursor-pointer"
              >
                Réinitialiser
              </button>
            )}
          </div>
        </div>

        <div className="overflow-x-auto border border-slate-800 rounded-xl">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-950/90 border-b border-slate-800 text-[11px] font-mono text-slate-400 uppercase tracking-wider">
                <th className="py-3 px-3">
                  <button
                    onClick={() => handleSort("rank")}
                    className="flex items-center gap-1 hover:text-white cursor-pointer"
                  >
                    Rang <ArrowUpDown size={11} />
                  </button>
                </th>
                <th className="py-3 px-3">Gène &amp; Bras</th>
                <th className="py-3 px-3">Expression</th>
                <th className="py-3 px-3 text-right">
                  <button
                    onClick={() => handleSort("optimizedWeight")}
                    className="inline-flex items-center gap-1 hover:text-white cursor-pointer"
                  >
                    Poids Synthétisé <ArrowUpDown size={11} />
                  </button>
                </th>
                <th className="py-3 px-3 text-right">
                  <button
                    onClick={() => handleSort("weightDelta")}
                    className="inline-flex items-center gap-1 hover:text-white cursor-pointer"
                  >
                    Δ Poids <ArrowUpDown size={11} />
                  </button>
                </th>
                <th className="py-3 px-3 text-right">
                  <button
                    onClick={() => handleSort("postMortemSignal")}
                    className="inline-flex items-center gap-1 hover:text-white cursor-pointer"
                  >
                    Signal PM <ArrowUpDown size={11} />
                  </button>
                </th>
                <th className="py-3 px-3 text-right">Épistasie</th>
                <th className="py-3 px-3 text-right">
                  <button
                    onClick={() => handleSort("proofZScore")}
                    className="inline-flex items-center gap-1 hover:text-white cursor-pointer"
                  >
                    Preuve WY max-T <ArrowUpDown size={11} />
                  </button>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70 text-xs">
              {filteredAndSortedGenes.map((node) => {
                const exp = EXPRESSION_LABELS[node.expressionState];
                const isSelected = selectedGeneKey === node.key;
                return (
                  <tr
                    key={node.key}
                    onClick={() => setSelectedGeneKey(isSelected ? null : node.key)}
                    className={`transition-colors cursor-pointer ${
                      isSelected ? "bg-slate-800/70" : "hover:bg-slate-950/60"
                    }`}
                  >
                    <td className="py-2.5 px-3 font-mono tabular-nums text-slate-200 whitespace-nowrap">
                      #{node.rank}{" "}
                      <span
                        className={
                          node.rankShift > 0
                            ? "text-emerald-400 ml-1"
                            : node.rankShift < 0
                              ? "text-amber-400 ml-1"
                              : "text-slate-500 ml-1"
                        }
                      >
                        {node.rankShift > 0
                          ? `▲+${node.rankShift}`
                          : node.rankShift < 0
                            ? `▼${node.rankShift}`
                            : "·"}
                      </span>
                    </td>
                    <td className="py-2.5 px-3">
                      <div className="font-semibold text-white">{node.label}</div>
                      <div className={`text-[11px] ${ARM_TEXT_COLORS[node.chromosomalArm]}`}>
                        {ARM_SHORT_LABELS[node.chromosomalArm]}
                      </div>
                    </td>
                    <td className="py-2.5 px-3 whitespace-nowrap">
                      <span className={`font-medium ${exp.toneClass}`}>
                        {exp.glyph} {exp.label}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-100 whitespace-nowrap">
                      {(node.initialWeight * 100).toFixed(2)}% →{" "}
                      <span className="font-bold text-white">
                        {(node.optimizedWeight * 100).toFixed(2)}%
                      </span>
                    </td>
                    <td
                      className={`py-2.5 px-3 text-right font-mono tabular-nums whitespace-nowrap ${
                        node.weightDelta > 0.0001
                          ? "text-emerald-400"
                          : node.weightDelta < -0.0001
                            ? "text-amber-400"
                            : "text-slate-400"
                      }`}
                    >
                      {node.weightDelta >= 0 ? "+" : ""}
                      {(node.weightDelta * 100).toFixed(3)}%
                    </td>
                    <td
                      className={`py-2.5 px-3 text-right font-mono tabular-nums whitespace-nowrap ${
                        node.postMortemSignal > 0.05
                          ? "text-cyan-400"
                          : node.postMortemSignal < -0.05
                            ? "text-amber-400"
                            : "text-slate-400"
                      }`}
                    >
                      {node.postMortemSignal >= 0 ? "+" : ""}
                      {(node.postMortemSignal * 100).toFixed(1)}%
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-300 whitespace-nowrap">
                      {node.epistaticSynergy >= 0 ? "+" : ""}
                      {(node.epistaticSynergy * 100).toFixed(1)}%
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums whitespace-nowrap">
                      {(() => {
                        const credPct = (node.ebCredibility ?? (node.hasEmpiricalProof ? 1 : 0)) * 100;
                        const tone =
                          credPct >= 50
                            ? "text-emerald-400 font-semibold"
                            : credPct > 0
                              ? "text-cyan-400"
                              : "text-slate-500";
                        return (
                          <span className={tone}>
                            EB {credPct.toFixed(0)}% · Z={node.proofZScore.toFixed(2)} (q={node.qValue.toFixed(3)})
                          </span>
                        );
                      })()}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Validation Walk-Forward Hors-Échantillon (Anti-Fuite) */}
      <section className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <h4 className="text-base font-semibold text-white flex items-center gap-2">
              <Activity size={16} className="text-cyan-400" />
              Validation Walk-Forward Hors-Échantillon (EpiGenome-SQ vs Baseline vs H0)
            </h4>
            <p className="text-xs text-slate-400">
              Entraîne strictement sur l&apos;historique antérieur [t+1..N-1] et mesure le gain réel hors-échantillon face aux poids initiaux et au hasard pur (25,4 % ≥ 1 hit).
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              onClick={handleRunWalkForward}
              disabled={wfLoading || networkWfLoading || loading}
              className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 rounded-xl text-xs font-semibold flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
            >
              <RefreshCw size={14} className={wfLoading ? "animate-spin text-cyan-400" : "text-cyan-400"} />
              {wfLoading ? "Évaluation OOS..." : "Lancer Walk-Forward"}
            </button>

            <button
              onClick={handleRunNetworkWalkForward}
              disabled={networkWfLoading || wfLoading || loading}
              className="px-4 py-2.5 bg-slate-950 hover:bg-slate-800 text-cyan-300 border border-cyan-500/40 rounded-xl text-xs font-semibold flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
            >
              <Activity size={14} className={networkWfLoading ? "animate-spin" : ""} />
              {networkWfLoading
                ? "Agrégation Réseau..."
                : `Walk-Forward Réseau (${getDrawNetworkId(drawName) === "quotidien" ? "Quotidien · 22" : "Hebdo · 6"})`}
            </button>
          </div>
        </div>

        {walkForward && (
          <div className="space-y-4">
            <div className="p-3.5 bg-slate-950/70 border border-slate-800 rounded-xl flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
              <span className="text-slate-200">{walkForward.summaryText}</span>
              <span
                className={
                  walkForward.verdict === "OUTPERFORMS_BASELINE"
                    ? "text-emerald-400 font-semibold"
                    : walkForward.verdict === "UNDERPERFORMS_BASELINE"
                      ? "text-amber-400 font-semibold"
                      : "text-slate-400"
                }
              >
                {walkForward.verdict === "OUTPERFORMS_BASELINE"
                  ? "Gain vérifié vs Baseline"
                  : walkForward.verdict === "UNDERPERFORMS_BASELINE"
                    ? "Sous la Baseline sur cet échantillon"
                    : walkForward.verdict === "PARITY_WITH_BASELINE"
                      ? "Parité statistique"
                      : "Historique insuffisant"}
              </span>
            </div>

            {walkForward.status === "COMPLETED" && (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                  <div className="p-3.5 bg-slate-950/60 border border-slate-800/80 rounded-xl space-y-1">
                    <div className="text-xs text-slate-400">Test Permutation (N={walkForward.permutationTest.sampleSize})</div>
                    <div className="text-xl font-mono font-bold text-white tabular-nums">
                      p={walkForward.permutationTest.pValueTwoSided.toFixed(3)}
                      <span className="text-xs text-slate-400 font-normal ml-1.5">
                        (p₁={walkForward.permutationTest.pValueOneSidedPositive.toFixed(3)})
                      </span>
                    </div>
                    <div className="text-[11px] font-mono text-slate-400 tabular-nums">
                      IC95% [{walkForward.permutationTest.ciLower95 >= 0 ? "+" : ""}{walkForward.permutationTest.ciLower95.toFixed(3)} ; {walkForward.permutationTest.ciUpper95 >= 0 ? "+" : ""}{walkForward.permutationTest.ciUpper95.toFixed(3)}] · {walkForward.permutationTest.exactEnumeration ? "Exact 2^N" : "MC seedé"}
                    </div>
                  </div>

                  <div className="p-3.5 bg-slate-950/60 border border-slate-800/80 rounded-xl space-y-1">
                    <div className="text-xs text-slate-400">Hits Moyens Top-5 / Tirage</div>
                    <div className="text-xl font-mono font-bold text-white tabular-nums">
                      {walkForward.meanHitsTop5Epigenome.toFixed(2)}
                      <span
                        className={`text-xs ml-1.5 ${
                          walkForward.deltaMeanHitsTop5 >= 0 ? "text-emerald-400" : "text-amber-400"
                        }`}
                      >
                        ({walkForward.deltaMeanHitsTop5 >= 0 ? "+" : ""}
                        {walkForward.deltaMeanHitsTop5.toFixed(3)})
                      </span>
                    </div>
                    <div className="text-[11px] font-mono text-slate-400 tabular-nums">
                      Base {walkForward.meanHitsTop5Baseline.toFixed(2)} · H0 {walkForward.h0MeanHitsTop5.toFixed(2)} · Hedge {walkForward.hedgeComparison.meanHitsTop5Hedge.toFixed(2)}
                    </div>
                  </div>

                  <div className="p-3.5 bg-slate-950/60 border border-slate-800/80 rounded-xl space-y-1">
                    <div className="text-xs text-slate-400">Brier Skill Score vs Base</div>
                    <div
                      className={`text-xl font-mono font-bold tabular-nums ${
                        walkForward.brierSkillScoreVsBaseline >= 0 ? "text-emerald-400" : "text-amber-400"
                      }`}
                    >
                      {walkForward.brierSkillScoreVsBaseline >= 0 ? "+" : ""}
                      {(walkForward.brierSkillScoreVsBaseline * 100).toFixed(2)}%
                    </div>
                    <div className="text-[11px] font-mono text-slate-400 tabular-nums">
                      vs H0 : {(walkForward.brierSkillScoreVsH0 * 100).toFixed(2)}% · Hedge BSS {(walkForward.hedgeComparison.brierSkillScoreVsBaseline * 100).toFixed(2)}%
                    </div>
                  </div>

                  <div className="p-3.5 bg-slate-950/60 border border-slate-800/80 rounded-xl space-y-1">
                    <div className="text-xs text-slate-400">Log-Loss &amp; AUC (5/90)</div>
                    <div className="text-xl font-mono font-bold text-white tabular-nums">
                      {walkForward.meanLogLossEpigenome.toFixed(4)}
                      <span className="text-xs text-cyan-400 font-normal ml-1.5">
                        AUC {walkForward.meanAucEpigenome.toFixed(3)}
                      </span>
                    </div>
                    <div className="text-[11px] font-mono text-slate-400 tabular-nums">
                      Base LL {walkForward.meanLogLossBaseline.toFixed(4)} · τ={walkForward.calibratedTauSummary.finalTauEpi.toFixed(2)}
                    </div>
                  </div>

                  <div className="p-3.5 bg-slate-950/60 border border-slate-800/80 rounded-xl space-y-1">
                    <div className="text-xs text-slate-400">Taux ≥ 1 Hit &amp; Z vs H0</div>
                    <div className="text-xl font-mono font-bold text-white tabular-nums">
                      {(walkForward.atLeastOneHitRateEpigenome * 100).toFixed(1)}%
                      <span className="text-xs text-slate-400 font-normal ml-1.5">
                        ({walkForward.epigenomeZScoreVsH0 >= 0 ? "+" : ""}{walkForward.epigenomeZScoreVsH0.toFixed(2)}σ)
                      </span>
                    </div>
                    <div className="text-[11px] font-mono text-slate-400 tabular-nums">
                      Base {(walkForward.atLeastOneHitRateBaseline * 100).toFixed(1)}% · H0 {(walkForward.h0AtLeastOneHitRate * 100).toFixed(1)}%
                    </div>
                  </div>
                </div>

                <div className="overflow-x-auto border border-slate-800 rounded-xl">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-950/90 border-b border-slate-800 text-[11px] font-mono text-slate-400 uppercase tracking-wider">
                        <th className="py-2.5 px-3">Pas</th>
                        <th className="py-2.5 px-3">Date Cible</th>
                        <th className="py-2.5 px-3 text-right">Train</th>
                        <th className="py-2.5 px-3">Séquence Active</th>
                        <th className="py-2.5 px-3 text-right">Top-5 Epi / Base / Hedge</th>
                        <th className="py-2.5 px-3 text-right">Brier Epi / Base</th>
                        <th className="py-2.5 px-3 text-right">LogLoss / AUC</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/70 text-xs font-mono tabular-nums">
                      {walkForward.steps.map((st) => (
                        <tr key={`${st.stepIndex}_${st.drawDate}`} className="hover:bg-slate-950/50">
                          <td className="py-2 px-3 text-slate-400">#{st.stepIndex}</td>
                          <td className="py-2 px-3 text-slate-200">{st.drawDate}</td>
                          <td className="py-2 px-3 text-right text-slate-400">{st.trainDrawsCount}</td>
                          <td className="py-2 px-3 text-cyan-400 truncate max-w-[180px]" title={st.sequenceSignature}>
                            {st.sequenceSignature}
                          </td>
                          <td className="py-2 px-3 text-right">
                            <span
                              className={
                                st.hitsTop5Epigenome > st.hitsTop5Baseline
                                  ? "text-emerald-400 font-semibold"
                                  : st.hitsTop5Epigenome < st.hitsTop5Baseline
                                    ? "text-amber-400"
                                    : "text-slate-200"
                              }
                            >
                              {st.hitsTop5Epigenome}
                            </span>
                            <span className="text-slate-500"> / {st.hitsTop5Baseline} / {st.hedgeHitsTop5}</span>
                          </td>
                          <td className="py-2 px-3 text-right text-slate-300">
                            {st.brierEpigenome.toFixed(4)} / {st.brierBaseline.toFixed(4)}
                          </td>
                          <td className="py-2 px-3 text-right text-slate-300">
                            {st.logLossEpigenome.toFixed(4)} · {st.aucEpigenome.toFixed(3)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        )}

        {networkWf && (
          <div className="pt-4 border-t border-slate-800 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
              <div className="text-slate-200">
                Agrégation Réseau <span className="text-cyan-400 font-semibold uppercase">{networkWf.networkId}</span>{" "}
                (évaluation seule · {networkWf.drawsEvaluated.length} tirage(s) isolé(s), N={networkWf.totalOosDrawsCount} pas OOS)
              </div>
              <span
                className={
                  networkWf.verdict === "OUTPERFORMS_BASELINE"
                    ? "text-emerald-400 font-semibold"
                    : networkWf.verdict === "UNDERPERFORMS_BASELINE"
                      ? "text-amber-400 font-semibold"
                      : "text-slate-400"
                }
              >
                {networkWf.verdict === "OUTPERFORMS_BASELINE"
                  ? "Surperformance réseau vérifiée"
                  : networkWf.verdict === "UNDERPERFORMS_BASELINE"
                    ? "Sous la Baseline sur le réseau"
                    : networkWf.verdict === "PARITY_WITH_BASELINE"
                      ? "Parité statistique réseau"
                      : "Données réseau insuffisantes"}
              </span>
            </div>

            {networkWf.totalOosDrawsCount > 0 && (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  <div className="p-3.5 bg-slate-950/60 border border-slate-800/80 rounded-xl space-y-1">
                    <div className="text-xs text-slate-400">Permutation Réseau (N={networkWf.permutationTest.sampleSize})</div>
                    <div className="text-lg font-mono font-bold text-white tabular-nums">
                      p={networkWf.permutationTest.pValueTwoSided.toFixed(3)} · p₁={networkWf.permutationTest.pValueOneSidedPositive.toFixed(3)}
                    </div>
                    <div className="text-[11px] font-mono text-slate-400 tabular-nums">
                      IC95% [{networkWf.permutationTest.ciLower95 >= 0 ? "+" : ""}{networkWf.permutationTest.ciLower95.toFixed(3)} ; {networkWf.permutationTest.ciUpper95 >= 0 ? "+" : ""}{networkWf.permutationTest.ciUpper95.toFixed(3)}] · {networkWf.permutationTest.exactEnumeration ? "Exact 2^N" : "MC seedé"}
                    </div>
                  </div>

                  <div className="p-3.5 bg-slate-950/60 border border-slate-800/80 rounded-xl space-y-1">
                    <div className="text-xs text-slate-400">Hits Top-5 Réseau (Epi / Base)</div>
                    <div className="text-lg font-mono font-bold text-white tabular-nums">
                      {networkWf.meanHitsTop5Epigenome.toFixed(3)} / {networkWf.meanHitsTop5Baseline.toFixed(3)}
                    </div>
                    <div className="text-[11px] font-mono text-slate-400 tabular-nums">
                      Δ = {networkWf.deltaMeanHitsTop5 >= 0 ? "+" : ""}{networkWf.deltaMeanHitsTop5.toFixed(4)}
                    </div>
                  </div>

                  <div className="p-3.5 bg-slate-950/60 border border-slate-800/80 rounded-xl space-y-1">
                    <div className="text-xs text-slate-400">BSS Réseau vs Baseline</div>
                    <div
                      className={`text-lg font-mono font-bold tabular-nums ${
                        networkWf.brierSkillScoreVsBaseline >= 0 ? "text-emerald-400" : "text-amber-400"
                      }`}
                    >
                      {networkWf.brierSkillScoreVsBaseline >= 0 ? "+" : ""}
                      {(networkWf.brierSkillScoreVsBaseline * 100).toFixed(2)}%
                    </div>
                    <div className="text-[11px] font-mono text-slate-400 tabular-nums">
                      Estimateurs strictement par tirage
                    </div>
                  </div>

                  <div className="p-3.5 bg-slate-950/60 border border-slate-800/80 rounded-xl space-y-1">
                    <div className="text-xs text-slate-400">Log-Loss &amp; AUC Moyens</div>
                    <div className="text-lg font-mono font-bold text-white tabular-nums">
                      {networkWf.meanLogLossEpigenome.toFixed(4)} · AUC {networkWf.meanAucEpigenome.toFixed(3)}
                    </div>
                    <div className="text-[11px] font-mono text-slate-400 tabular-nums">
                      {networkWf.drawsEvaluated.length} tirage(s) évalué(s)
                    </div>
                  </div>
                </div>

                <div className="overflow-x-auto border border-slate-800 rounded-xl">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-950/90 border-b border-slate-800 text-[11px] font-mono text-slate-400 uppercase tracking-wider">
                        <th className="py-2 px-3">Tirage Isolé</th>
                        <th className="py-2 px-3 text-right">Pas OOS</th>
                        <th className="py-2 px-3 text-right">Hits Epi / Base</th>
                        <th className="py-2 px-3 text-right">BSS</th>
                        <th className="py-2 px-3 text-right">LogLoss / AUC</th>
                        <th className="py-2 px-3 text-right">p (Perm.)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/70 text-xs font-mono tabular-nums">
                      {networkWf.perDrawResults.map((d) => (
                        <tr key={d.drawName} className="hover:bg-slate-950/50">
                          <td className="py-2 px-3 text-slate-200 font-sans font-medium">{d.drawName}</td>
                          <td className="py-2 px-3 text-right text-slate-400">{d.evaluatedDrawsCount}</td>
                          <td className="py-2 px-3 text-right text-slate-200">
                            {d.meanHitsTop5Epigenome.toFixed(2)} / {d.meanHitsTop5Baseline.toFixed(2)}
                          </td>
                          <td
                            className={`py-2 px-3 text-right ${
                              d.brierSkillScoreVsBaseline >= 0 ? "text-emerald-400" : "text-amber-400"
                            }`}
                          >
                            {d.brierSkillScoreVsBaseline >= 0 ? "+" : ""}
                            {(d.brierSkillScoreVsBaseline * 100).toFixed(2)}%
                          </td>
                          <td className="py-2 px-3 text-right text-slate-300">
                            {d.meanLogLossEpigenome.toFixed(4)} · {d.meanAucEpigenome.toFixed(3)}
                          </td>
                          <td className="py-2 px-3 text-right text-slate-300">
                            {d.permutationTest.pValueTwoSided.toFixed(3)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        )}
      </section>

      {/* Piste d'audit causal */}
      <section className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-white">
          <ShieldCheck size={16} className="text-emerald-400" />
          Piste d'Audit Génomique &amp; Garde Statistique
        </div>
        <ul className="space-y-1.5 text-xs font-mono text-slate-300">
          {auditTrail.map((line, i) => (
            <li key={i} className="leading-relaxed">
              {i + 1}. {line}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
};
