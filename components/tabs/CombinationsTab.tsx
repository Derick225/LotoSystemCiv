import React, { useState, useEffect, useMemo, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  generateAbbreviatedWheel,
  generateFullWheel,
} from "../../services/combinatoricsService";
import { calculateACValue } from "../../services/mathService";
import { runAntColonyOptimization } from "../../services/acoService";
import { filterDiverseCombinations } from "../../services/prediction/diversityService";
import { getUniqueSortedNumbers } from "../../utils/arrayUtils";
import { saveTicket } from "../../services/userPreferencesService";
import { savePredictionToHistory } from "../../services/predictionHistoryService";
import type { Prediction } from "../../types";
import { useToast } from "../ui/Toast";
import { useNexusStore } from "../../store/useNexusStore";
import {
  Calculator,
  Zap,
  Ghost,
  Terminal,
  Network,
  Edit3,
  Cpu,
  Save,
  Lock,
  Unlock,
  Layers,
  ShieldCheck,
  RefreshCw,
} from "lucide-react";
import type { AntColonyPath } from "../../types";
import { TicketXRay } from "../TicketXRay";
import { PatternSequencer } from "../PatternSequencer";
import { motion } from "framer-motion";
import { audioEngine } from "../../utils/audioEngine";

interface CombinationsTabProps {
  drawName: string;
}

interface GeneratedTicket {
  id: string;
  numbers: number[];
  nexusScore: number;
  sum: number;
  ac: number;
  parity: string;
}

export const CombinationsTab: React.FC<CombinationsTabProps> = ({
  drawName,
}) => {
  const { showToast } = useToast();
  const history = useNexusStore((state) => state.history);
  const spectral = useNexusStore((state) => state.spectral);
  const vocalContext = useNexusStore((state) => state.vocalContext);
  const globalWeights = useNexusStore((state) => state.globalWeights);
  const nexusLoading = useNexusStore((state) => state.loading);

  // Mode Switcher
  const [mode, setMode] = useState<"auto" | "manual">("auto");

  // Auto Inputs & Config
  // Structure: { value: string, isBanker: boolean }
  const [inputs, setInputs] = useState<{ val: string; isBanker: boolean }[]>(
    Array(12).fill({ val: "", isBanker: false }),
  );
  const [systemType, setSystemType] = useState<"full" | "reduced">("reduced");
  const [guarantee, setGuarantee] = useState<3 | 4 | 5>(3);

  // Filters
  const [minSum, setMinSum] = useState(100);
  const [maxSum, setMaxSum] = useState(250);
  const [useHarmonicFilter, setUseHarmonicFilter] = useState(true);

  // State
  const [generatedTickets, setGeneratedTickets] = useState<GeneratedTicket[]>(
    [],
  );
  const [acoPaths, setAcoPaths] = useState<AntColonyPath[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [genProgress, setGenProgress] = useState(0);
  const [logs, setLogs] = useState<string[]>([]);
  const [expandedTicketId, setExpandedTicketId] = useState<string | null>(null);

  // Grid Virtualization Setup
  const parentRef = useRef<HTMLDivElement>(null);
  const [columns, setColumns] = useState(1);

  useEffect(() => {
    const updateColumns = () => {
      setColumns(window.innerWidth >= 768 ? 2 : 1);
    };
    updateColumns();
    window.addEventListener("resize", updateColumns);
    return () => window.removeEventListener("resize", updateColumns);
  }, []);

  const ticketRows = useMemo(() => {
    const rows: GeneratedTicket[][] = [];
    for (let i = 0; i < generatedTickets.length; i += columns) {
      rows.push(generatedTickets.slice(i, i + columns));
    }
    return rows;
  }, [generatedTickets, columns]);

  const rowVirtualizer = useVirtualizer({
    count: ticketRows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => (columns === 1 ? 160 : 180),
    overscan: 5,
  });

  // Chargement ACO
  useEffect(() => {
    if (history.length > 20) loadAco();
  }, [drawName, history, vocalContext]);

  const loadAco = async () => {
    try {
      const paths = await runAntColonyOptimization(history, vocalContext);
      setAcoPaths(paths);
    } catch (e) {
      console.error(e);
    }
  };

  const addLog = (msg: string) =>
    setLogs((prev) => [`> ${msg}`, ...prev].slice(0, 6));

  const handleInputChange = (idx: number, value: string) => {
    const newInputs = [...inputs];
    newInputs[idx] = { ...newInputs[idx], val: value };
    setInputs(newInputs);
  };

  const toggleBanker = (idx: number) => {
    const newInputs = [...inputs];
    // Si la valeur est vide, on ne peut pas locker
    if (!newInputs[idx].val) return;
    newInputs[idx] = { ...newInputs[idx], isBanker: !newInputs[idx].isBanker };
    setInputs(newInputs);
  };

  // --- MOTEUR DE GÉNÉRATION PRINCIPAL ---
  const handleGenerate = async () => {
    audioEngine.play("click");
    // Extraction du pool et des bankers
    const rawPool = inputs
      .filter((i) => i.val !== "")
      .map((i) => Number(i.val));
    const bankers = inputs
      .filter((i) => i.val !== "" && i.isBanker)
      .map((i) => Number(i.val));

    const pool = getUniqueSortedNumbers(rawPool);
    const uniqueBankers = getUniqueSortedNumbers(bankers);

    if (pool.length < 5) {
      audioEngine.play("error");
      showToast("Min 5 numéros requis dans le pool.", "error");
      return;
    }
    if (uniqueBankers.length > 4) {
      audioEngine.play("error");
      showToast("Trop de bases (Max 4).", "error");
      return;
    }
    if (minSum >= maxSum) {
      audioEngine.play("error");
      showToast("Plage de Somme invalide.", "error");
      return;
    }

    audioEngine.play("loading");
    setIsGenerating(true);
    setLogs([
      "Initialisation Architecte v3.0...",
      `Pool: ${pool.length} | Bases: ${uniqueBankers.length}`,
    ]);
    setGenProgress(0);
    setGeneratedTickets([]);

    try {
      // 1. Génération Brute (Worker-friendly en chunking)
      let baseTickets: number[][] = [];

      if (systemType === "full") {
        if (pool.length > 14) {
          audioEngine.play("error");
          showToast(
            "Max 14 numéros pour Système Intégral (Protection Mémoire)",
            "error",
          );
          setIsGenerating(false);
          return;
        }
        baseTickets = generateFullWheel(pool, 5);
      } else {
        // Système réduit avec support des Bankers
        // Note: Si des bankers sont définis, ils sont forcés dans chaque ticket
        if (uniqueBankers.length > 0) {
          // Génération manuelle avec bankers
          // On génère des tickets de taille (5 - nbBankers) à partir du reste du pool
          const subPool = pool.filter((n) => !uniqueBankers.includes(n));
          const subSize = 5 - uniqueBankers.length;
          // On utilise generateFullWheel sur le subPool pour la garantie réduite
          // (Approximation: un système réduit complet avec bankers est complexe,
          // ici on fait un full wheel du reste pour garantir la couverture, ou on pourrait utiliser generateAbbreviatedWheel sur le reste)
          const subTickets = generateAbbreviatedWheel(
            subPool,
            [],
            subSize,
            guarantee === 5
              ? subSize
              : Math.max(2, guarantee - uniqueBankers.length),
          );
          baseTickets = subTickets.map((t) =>
            [...uniqueBankers, ...t].sort((a, b) => a - b),
          );
        } else {
          baseTickets = generateAbbreviatedWheel(pool, [], 5, guarantee);
        }
      }

      addLog(`${baseTickets.length} structures brutes assemblées.`);

      // 2. Préparation du scoring basé sur l'ADN (GlobalWeights)
      const spectralCache: Record<number, number> = {};
      pool.forEach((n) => {
        spectralCache[n] = spectral.find((s) => s.number === n)?.energy || 0;
      });

      const wSpectral = (globalWeights.spectral || 0.15) * 4;
      const wChaos = (globalWeights.bayes || 0.1) * 3;

      let output: GeneratedTicket[] = [];
      const CHUNK_SIZE = 500;

      for (let i = 0; i < baseTickets.length; i += CHUNK_SIZE) {
        const chunk = baseTickets.slice(i, i + CHUNK_SIZE);

        const processedChunk = chunk
          .map((t) => {
            // A. Filtre Somme (Retiré du filtrage, conservé pour les métadonnées)
            const sum = t.reduce((a, b) => a + b, 0);

            // B. Filtre Harmonique avec amortissement continu (Sigmoïde)
            const avgEnergy =
              t.reduce((acc, n) => acc + (spectralCache[n] || 0), 0) / 5;
            let harmonicPass = 1.0;
            if (useHarmonicFilter) {
              harmonicPass = 1 / (1 + Math.exp(-0.25 * (avgEnergy - 30)));
              const pruneThreshold = Math.exp(-3.0); // Équivalent probabiliste ~0.0498
              if (harmonicPass < pruneThreshold) return null; // Garde-fou rapide pour performance de rendu
            }

            // C. Calcul des Métriques
            const ac = calculateACValue(t);
            const odds = t.filter((n) => n % 2 !== 0).length;

            // D. Scoring Nexus avec Loi Gaussienne continue pour l'équilibre des parités
            let nexusScore = avgEnergy * wSpectral + ac * 10 * wChaos;
            const oddsFactor = Math.exp(-0.4 * Math.pow(odds - 2.5, 2));
            nexusScore += 22 * oddsFactor;

            nexusScore = Math.min(
              100,
              Math.round(
                (nexusScore * harmonicPass) / (wSpectral + wChaos + 0.5),
              ),
            );

            let hashVal = 0;
            for (let x = 0; x < t.length; x++) {
              hashVal = (hashVal << 5) - hashVal + t[x];
              hashVal |= 0;
            }
            const deterministicId = `ticket_${Math.abs(hashVal)}_${sum}`;

            return {
              id: deterministicId,
              numbers: t,
              nexusScore,
              sum,
              ac,
              parity: `${odds}I/${5 - odds}P`,
            } as GeneratedTicket;
          })
          .filter((t): t is GeneratedTicket => t !== null);

        output = [...output, ...processedChunk];
        setGenProgress(
          Math.round(((i + CHUNK_SIZE) / baseTickets.length) * 100),
        );

        await new Promise((resolve) => requestAnimationFrame(resolve));
      }

      // 3. Tri final par score Nexus et application du filtre de diversité de Shannon
      output.sort((a, b) => b.nexusScore - a.nexusScore);
      const diverseOutput = filterDiverseCombinations(output);
      setGeneratedTickets(diverseOutput);

      addLog(
        `Optimisation terminée : ${diverseOutput.length} tickets valides après filtre de diversité de Shannon.`,
      );
      audioEngine.play("success");
      showToast(
        `${diverseOutput.length} tickets uniques générés et filtrés pour diversité de Shannon.`,
        "success",
      );
    } catch (e: unknown) {
      console.error(e);
      audioEngine.play("error");
      showToast(
        "Erreur critique : " + (e instanceof Error ? e.message : String(e)),
        "error",
      );
    } finally {
      setIsGenerating(false);
      setGenProgress(100);
    }
  };

  const handleSaveTicket = async (t: GeneratedTicket) => {
    audioEngine.play("click");
    await saveTicket({
      numbers: t.numbers,
      drawName: drawName,
      strategy: `Architecte v3 (Score ${t.nexusScore})`,
    });

    const breakdown: Record<number, Record<string, number>> = {};
    t.numbers.forEach((num) => {
      breakdown[num] = {
        orchestration: t.nexusScore,
        fractal: t.ac * 10,
        spectral: t.sum / 5,
      };
    });

    const predictionObj: Prediction = {
      suggestedNumbers: t.numbers,
      candidates: t.numbers,
      confidence: t.nexusScore,
      analysis: `Architecte v3 (Score ${t.nexusScore})`,
      breakdown: breakdown,
      timestamp: Date.now(),
    };
    await savePredictionToHistory(drawName, predictionObj);

    audioEngine.play("success");
    showToast("Ticket sauvegardé et autopsié.", "success");
  };

  const handleApplyAco = (numbers: number[]) => {
    audioEngine.play("click");
    // Remplir les inputs avec les numéros ACO
    const newInputs = inputs.map((i) => ({ val: "", isBanker: false }));
    numbers.forEach((n, idx) => {
      if (idx < newInputs.length) newInputs[idx].val = n.toString();
    });
    setInputs(newInputs);
    audioEngine.play("success");
    showToast("Chemin ACO injecté dans le pool.", "info");
  };

  return (
    <div className="space-y-8 animate-fade-in pb-24 w-full overflow-hidden">
      {/* Mode Toggle */}
      <div className="flex justify-center mb-6">
        <div className="bg-slate-900 p-1.5 rounded-2xl border border-slate-800 flex shadow-lg">
          <button
            onClick={() => {
              audioEngine.play("click");
              setMode("auto");
            }}
            className={`px-6 py-3 rounded-xl text-[10px] font-black uppercase flex items-center gap-2 transition-all ${mode === "auto" ? "bg-indigo-600 text-white shadow-lg" : "text-slate-500 hover:text-white"}`}
          >
            <Zap size={14} /> Architecte Auto
          </button>
          <button
            onClick={() => {
              audioEngine.play("click");
              setMode("manual");
            }}
            className={`px-6 py-3 rounded-xl text-[10px] font-black uppercase flex items-center gap-2 transition-all ${mode === "manual" ? "bg-indigo-600 text-white shadow-lg" : "text-slate-500 hover:text-white"}`}
          >
            <Edit3 size={14} /> Séquenceur Manuel
          </button>
        </div>
      </div>

      {mode === "manual" ? (
        <PatternSequencer drawName={drawName} />
      ) : (
        <>
          {/* Header / Console */}
          <div className="bg-slate-900 text-white p-8 rounded-3xl shadow-2xl border border-slate-800 relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:rotate-12 transition-transform duration-300">
              <Ghost size={140} />
            </div>

            <div className="relative z-10 grid lg:grid-cols-3 gap-8">
              <div className="lg:col-span-2 space-y-8">
                <div>
                  <div className="flex items-center gap-3 mb-2">
                    <div className="p-2 bg-indigo-600 rounded-xl shadow-lg">
                      <Calculator size={18} className="text-white" />
                    </div>
                    <h3 className="text-sm font-black uppercase tracking-[0.4em] text-indigo-400">
                      Architecte v3.0
                    </h3>
                  </div>
                  <h2 className="text-4xl md:text-5xl font-black text-white tracking-tighter">
                    Studio de{" "}
                    <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-purple-400">
                      Synthèse
                    </span>
                  </h2>
                  <p className="text-xs text-slate-400 mt-2 font-mono flex items-center gap-2">
                    <Cpu size={12} className="text-emerald-500" />
                    Moteur Combinatoire :{" "}
                    {nexusLoading ? "Initialisation..." : "Prêt"}
                  </p>
                </div>

                {/* ACO Suggestions */}
                <div className="space-y-4">
                  <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                    <Network size={12} /> Suggestions ACO (Fourmis)
                  </h4>
                  <div className="flex flex-wrap gap-3">
                    {acoPaths.slice(0, 3).map((path, i) => (
                      <button
                        key={i}
                        onClick={() => handleApplyAco(path.numbers)}
                        className="bg-slate-800/50 border border-slate-700 px-4 py-3 rounded-2xl hover:bg-slate-800 hover:border-indigo-500 transition-all flex items-center gap-3 group"
                      >
                        <div className="w-6 h-6 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center text-xs font-black">
                          #{i + 1}
                        </div>
                        <div className="flex gap-1">
                          {path.numbers.map((n) => (
                            <span
                              key={n}
                              className="w-5 h-5 rounded-md bg-black/40 flex items-center justify-center text-xs font-bold text-white"
                            >
                              {n}
                            </span>
                          ))}
                        </div>
                      </button>
                    ))}
                    {acoPaths.length === 0 && (
                      <div className="text-xs text-slate-500 italic">
                        En attente des fourmis...
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Console Logs */}
              <div className="bg-black/40 p-6 rounded-2xl border border-white/5 flex flex-col justify-between h-full min-h-[200px]">
                <div className="flex items-center gap-3 mb-4 border-b border-white/5 pb-2">
                  <Terminal size={14} className="text-emerald-500" />
                  <span className="text-xs font-black uppercase text-slate-500 tracking-widest">
                    Logs Système
                  </span>
                </div>
                <div className="space-y-1.5 flex-1 font-mono text-[10px] text-emerald-400/80 overflow-y-auto max-h-[120px] custom-scrollbar">
                  {logs.map((log, i) => (
                    <div
                      key={i}
                      className={i === 0 ? "text-emerald-300 font-bold" : ""}
                    >
                      {log}
                    </div>
                  ))}
                </div>
                {isGenerating && (
                  <div className="mt-4">
                    <div className="flex justify-between text-[10px] font-bold text-slate-500 mb-1">
                      <span>Traitement</span>
                      <span>{genProgress}%</span>
                    </div>
                    <div className="h-1 w-full bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-indigo-500 transition-all duration-100"
                        style={{ width: `${genProgress}%` }}
                      ></div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Configuration Panel */}
          <div className="bg-white dark:bg-slate-800 p-8 rounded-3xl border border-slate-100 dark:border-slate-700 shadow-xl">
            <div className="grid md:grid-cols-2 gap-8">
              {/* LEFT: Pool & Bankers */}
              <div className="space-y-6">
                <div className="flex justify-between items-end">
                  <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                    Pool de Numéros
                  </h4>
                  <div className="text-xs font-bold text-indigo-500 bg-indigo-50 dark:bg-indigo-900/30 px-2 py-1 rounded-lg">
                    {inputs.filter((i) => i.val).length} / 14 Numéros
                  </div>
                </div>

                <div className="grid grid-cols-4 sm:grid-cols-6 gap-3">
                  {inputs.map((input, idx) => (
                    <div key={idx} className="relative group">
                      <input
                        type="number"
                        value={input.val}
                        onChange={(e) => handleInputChange(idx, e.target.value)}
                        className={`
                                                    w-full aspect-square text-center font-black text-lg rounded-2xl border-2 outline-none transition-all
                                                    ${
                                                      input.isBanker
                                                        ? "bg-amber-50 dark:bg-amber-900/20 border-amber-400 text-amber-600 dark:text-amber-400"
                                                        : "bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-800 dark:text-white focus:border-indigo-500"
                                                    }
                                                `}
                        placeholder="?"
                      />
                      {/* Banker Toggle Overlay */}
                      {input.val && (
                        <button
                          onClick={() => toggleBanker(idx)}
                          className={`
                                                        absolute -top-2 -right-2 p-1 rounded-full shadow-sm transition-all transform hover:scale-110
                                                        ${input.isBanker ? "bg-amber-500 text-white" : "bg-slate-200 dark:bg-slate-700 text-slate-400 hover:text-amber-500"}
                                                    `}
                          title={
                            input.isBanker
                              ? "Base (Verrouillé)"
                              : "Définir comme Base"
                          }
                        >
                          {input.isBanker ? (
                            <Lock size={10} fill="currentColor" />
                          ) : (
                            <Unlock size={10} />
                          )}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                <p className="text-xs text-slate-400 italic">
                  <Lock size={10} className="inline mb-0.5 mr-1" /> Cliquez sur
                  le cadenas pour définir une "Base" (Numéro fixe).
                </p>
              </div>

              {/* RIGHT: System Settings */}
              <div className="space-y-8 flex flex-col justify-center">
                <div className="space-y-4">
                  <div className="flex gap-4">
                    <div className="flex-1 space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase">
                        Système
                      </label>
                      <div className="flex bg-slate-100 dark:bg-slate-900 p-1 rounded-xl">
                        <button
                          onClick={() => setSystemType("full")}
                          className={`flex-1 py-2 text-xs font-bold rounded-lg transition ${systemType === "full" ? "bg-white dark:bg-slate-700 shadow text-indigo-600 dark:text-white" : "text-slate-500"}`}
                        >
                          Intégral
                        </button>
                        <button
                          onClick={() => setSystemType("reduced")}
                          className={`flex-1 py-2 text-xs font-bold rounded-lg transition ${systemType === "reduced" ? "bg-white dark:bg-slate-700 shadow text-indigo-600 dark:text-white" : "text-slate-500"}`}
                        >
                          Réduit
                        </button>
                      </div>
                    </div>
                    {systemType === "reduced" && (
                      <div className="flex-1 space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase">
                          Garantie
                        </label>
                        <div className="flex bg-slate-100 dark:bg-slate-900 p-1 rounded-xl">
                          {[3, 4, 5].map((g) => (
                            <button
                              key={g}
                              onClick={() => setGuarantee(g as 3 | 4 | 5)}
                              className={`flex-1 py-2 text-xs font-bold rounded-lg transition ${guarantee === g ? "bg-white dark:bg-slate-700 shadow text-emerald-500" : "text-slate-500"}`}
                            >
                              {g}/5
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Advanced Filters */}
                  <div className="p-4 bg-slate-50 dark:bg-slate-900/50 rounded-2xl border border-slate-100 dark:border-slate-800">
                    <div className="flex justify-between items-center mb-3">
                      <span className="text-[10px] font-black text-slate-500 uppercase flex items-center gap-2">
                        <Layers size={12} /> Filtres Avancés
                      </span>
                      <div
                        className={`w-2 h-2 rounded-full ${useHarmonicFilter ? "bg-emerald-500" : "bg-slate-300"}`}
                      ></div>
                    </div>
                    <div className="flex items-center gap-4 text-xs font-bold text-slate-600 dark:text-slate-400">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={useHarmonicFilter}
                          onChange={(e) =>
                            setUseHarmonicFilter(e.target.checked)
                          }
                          className="accent-indigo-600"
                        />
                        Harmonique
                      </label>
                    </div>
                  </div>
                </div>

                <button
                  onClick={handleGenerate}
                  disabled={isGenerating}
                  className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl shadow-indigo-600/20 transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-3"
                >
                  {isGenerating ? (
                    <RefreshCw className="animate-spin" size={16} />
                  ) : (
                    <Zap size={16} fill="currentColor" />
                  )}
                  {isGenerating ? "Calcul en cours..." : "Lancer Génération"}
                </button>
              </div>
            </div>
          </div>

          {/* Results Area */}
          {generatedTickets.length > 0 && (
            <div className="space-y-4 animate-slide-up">
              <div className="flex items-center justify-between px-2">
                <h4 className="text-xs font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                  <ShieldCheck size={14} className="text-emerald-500" />{" "}
                  Résultats Optimisés
                </h4>
                <span className="text-xs font-bold text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded-lg">
                  {generatedTickets.length} combinaisons
                </span>
              </div>

              <div
                ref={parentRef}
                className="max-h-[650px] overflow-y-auto overflow-x-hidden rounded-2xl p-1 custom-scrollbar"
                style={{ contain: "strict" }}
              >
                <div
                  style={{
                    height: `${rowVirtualizer.getTotalSize()}px`,
                    width: "100%",
                    position: "relative",
                  }}
                >
                  {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                    const rowTickets = ticketRows[virtualRow.index];
                    return (
                      <div
                        key={virtualRow.key}
                        data-index={virtualRow.index}
                        ref={rowVirtualizer.measureElement}
                        style={{
                          position: "absolute",
                          top: 0,
                          left: 0,
                          width: "100%",
                          transform: `translateY(${virtualRow.start}px)`,
                        }}
                        className="pb-4"
                      >
                        <div
                          className={`grid gap-4 ${
                            columns > 1 ? "grid-cols-2" : "grid-cols-1"
                          }`}
                        >
                          {rowTickets.map((t) => (
                            <div
                              key={t.id}
                              onClick={() => {
                                audioEngine.play("click");
                                setExpandedTicketId(
                                  expandedTicketId === t.id ? null : t.id,
                                );
                              }}
                              className={`
                                bg-white dark:bg-slate-800 p-4 rounded-[2rem] border shadow-sm cursor-pointer transition-all relative overflow-hidden group
                                ${
                                  expandedTicketId === t.id
                                    ? "border-indigo-500 ring-1 ring-indigo-500/50"
                                    : "border-slate-100 dark:border-slate-700 hover:border-indigo-300"
                                }
                              `}
                            >
                              <div className="flex justify-between items-center relative z-10">
                                <div className="flex items-center gap-3">
                                  <div
                                    className={`w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-black border ${
                                      t.nexusScore > 80
                                        ? "bg-emerald-100 text-emerald-600 border-emerald-200"
                                        : "bg-slate-100 text-slate-500 border-slate-200"
                                    }`}
                                  >
                                    {t.nexusScore}
                                  </div>
                                  <div className="flex gap-1 flex-wrap">
                                    {t.numbers.map((n) => (
                                      <span
                                        key={n}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          useNexusStore
                                            .getState()
                                            .setInspectingNumber(n);
                                        }}
                                        className="w-7 h-7 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-700 flex items-center justify-center text-[10px] font-bold text-slate-700 dark:text-slate-300 group-hover:bg-white dark:group-hover:bg-slate-800 transition-colors cursor-pointer hover:scale-110"
                                      >
                                        {n}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleSaveTicket(t);
                                  }}
                                  className="p-2 bg-slate-100 dark:bg-slate-700 rounded-full text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-all"
                                >
                                  <Save size={14} />
                                </button>
                              </div>

                              {/* Quick Stats */}
                              <div className="flex gap-4 mt-3 pl-11 text-xs font-mono text-slate-400">
                                <span>∑ {t.sum}</span>
                                <span>AC {t.ac}</span>
                                <span>{t.parity}</span>
                              </div>

                              {expandedTicketId === t.id && (
                                <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-700 animate-fade-in">
                                  <TicketXRay
                                    numbers={t.numbers}
                                    score={t.nexusScore}
                                    showTitle={false}
                                  />
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};
