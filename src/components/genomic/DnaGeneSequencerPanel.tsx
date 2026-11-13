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
} from "lucide-react";
import { useNexusStore } from "../../store/useNexusStore";
import { useForensicData } from "../../hooks/useForensicData";
import { useToast } from "../ui/Toast";
import { audioEngine } from "../../utils/audioEngine";
import {
  runUnifiedDnaGeneSequencer,
  CHROMOSOMAL_ARM_LABELS,
  type ChromosomalArm,
  type GeneExpressionState,
  type DnaGeneSynthesisResult,
  type DnaGeneNode,
} from "../../services/prediction/dnaGeneSequenceService";
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

  useEffect(() => {
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
              Fusionne les rapports post-mortem, les autopsies en boucle fermée, la dérive ADN et la lignée
              génomique afin d'ordonner la séquence des 25 gènes par bras chromosomique tout en maintenant le
              plafond statistique Benjamini-Hochberg sur les canaux non prouvés.
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
            <div className="text-xs text-slate-400 font-medium">Preuve Empirique BH &amp; Diversité</div>
            <div className="text-2xl font-mono font-bold text-white tabular-nums">
              {provenGenesCount}
              <span className="text-xs text-slate-400 font-normal ml-1.5">
                / {result.geneSequence.length} prouvés
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
                    Preuve BH <ArrowUpDown size={11} />
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
                      {node.hasEmpiricalProof ? (
                        <span className="text-emerald-400 font-semibold">
                          ✓ Z={node.proofZScore.toFixed(2)} (q={node.qValue.toFixed(3)})
                        </span>
                      ) : (
                        <span className="text-slate-500">
                          Plafonné (Z={node.proofZScore.toFixed(2)})
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
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
