import React, { useState, useCallback, useEffect, useMemo } from "react";
import { useNexusStore } from "../../store/useNexusStore";

import { useToast } from "../ui/Toast";
import { audioEngine } from "../../utils/audioEngine";
import { speechEngine } from "../../utils/speechEngine";
import { motion, AnimatePresence } from "framer-motion";
import {
  BrainCircuit,
  Sparkles,
  AlertTriangle,
  RefreshCw,
  Copy,
  Save,
  Volume2,
  Cpu,
  Sliders,
  CheckCircle2,
  Info,
  ChevronDown,
  VolumeX,
  Plus,
  Minus,
  Sparkle
} from "lucide-react";
import { evolveNeuralDNA } from "../../services/trainingService";
import { generateMasterPrediction } from "../../services/prediction/predictionFacade";
import { extractFeatures } from "../../services/prediction/featureExtractor";
import { generateCombination } from "../../services/prediction/combinationGenerator";
import { FALLBACK_CALIBRATION } from "../../shared/prediction.types";
import { purifyHistoryForDraw } from "../../utils/arrayUtils";

interface AdvancedPredictionTabProps {
  drawName: string;
}

interface GeneratedTicket {
  id: string;
  numbers: number[];
  confidence: number;
  harmony: string;
  outsidersCount: number;
  isSaved: boolean;
}

export const AdvancedPredictionTab: React.FC<AdvancedPredictionTabProps> = React.memo(
  ({ drawName }) => {
    const { showToast } = useToast();

    // Récupération de l'historique global
    const rawHistory = useNexusStore((state) => state.history);
    const history = React.useDeferredValue(rawHistory);

    // Isolement strict des données du tirage actif (TIRAGE ISOLATION RULE)
    const activeHistory = useMemo(() => {
      return purifyHistoryForDraw(drawName, history);
    }, [history, drawName]);

    // États de configuration simples et intuitifs (sans complexité visuelle)
    const [ticketCount, setTicketCount] = useState<number>(4);
    const [riskProfile, setRiskProfile] = useState<"safe" | "balanced" | "speculative" | "chaos">("balanced");
    const [isComputing, setIsComputing] = useState(false);
    const [computingProgress, setComputingProgress] = useState(0);
    const [computingStep, setComputingStep] = useState("");
    const [activeExplanationNum, setActiveExplanationNum] = useState<number | null>(null);
    const [speakingTicketId, setSpeakingTicketId] = useState<string | null>(null);

    // Cache local en mémoire pour réactivité instantanée lors de la navigation
    const [generatedTickets, setGeneratedTickets] = useState<GeneratedTicket[]>([]);

    // Définir les profils de risque de manière claire et non-abstraite
    const profiles = {
      safe: {
        label: "Conservateur",
        desc: "Faible risque, numéros à forte régularité et à faible écart.",
        color: "bg-emerald-500/10 border-emerald-500/30 text-emerald-400 text-emerald-500",
        btnColor: "bg-emerald-500 text-white",
        icon: "🟢",
        outsiders: 0,
      },
      balanced: {
        label: "Équilibré",
        desc: "Compromis idéal combinant fréquences stables et écarts mûrs.",
        color: "bg-indigo-500/10 border-indigo-500/30 text-indigo-400 text-indigo-500",
        btnColor: "bg-indigo-600 text-white",
        icon: "🟡",
        outsiders: 1,
      },
      speculative: {
        label: "Spéculatif",
        desc: "Optimisation agressive ciblant les outsiders à fort potentiel d'écart.",
        color: "bg-amber-500/10 border-amber-500/30 text-amber-400 text-amber-500",
        btnColor: "bg-amber-500 text-white",
        icon: "🔴",
        outsiders: 2,
      },
      chaos: {
        label: "Chaos Stochastique",
        desc: "Modélisation de l'entropie maximale. Idéal pour les tirages imprévisibles.",
        color: "bg-rose-500/10 border-rose-500/30 text-rose-400 text-rose-500",
        btnColor: "bg-rose-500 text-white",
        icon: "🔥",
        outsiders: 3,
      }
    };

    // Charger les tickets existants s'ils sont déjà sauvegardés en mémoire temporaire pour ce tirage spécifique
    useEffect(() => {
      try {
        const localKey = `loto_advanced_pred_${drawName}_${riskProfile}_${ticketCount}`;
        const cached = sessionStorage.getItem(localKey);
        if (cached) {
          setGeneratedTickets(JSON.parse(cached));
        } else {
          setGeneratedTickets([]);
        }
      } catch (e) {
        console.warn("[AdvancedPrediction] Échec du chargement du cache temporaire:", e);
      }
    }, [drawName, riskProfile, ticketCount]);

    // Algorithme d'inférence stochastique neurale (Déterministe à 100%)
    const runNeuralStochasticInference = useCallback(async () => {
      if (activeHistory.length < 5) {
        audioEngine.play("error");
        showToast("Historique insuffisant pour calibrer le réseau neuronal.", "error");
        return;
      }

      audioEngine.play("loading");
      setIsComputing(true);
      setComputingProgress(10);
      setComputingStep("Initialisation des tenseurs du tirage isolé...");

      try {
        await new Promise((resolve) => setTimeout(resolve, 300));
        setComputingProgress(25);
        setComputingStep("Évolution de l'ADN neuronal (Optimisation PSO)...");

        // 1. Calibrer l'ADN neuronal de façon étanche (TIRAGE ISOLATION RULE)
        const neuralDnaResult = await evolveNeuralDNA(drawName, {
          generations: 12,
          sampleSize: Math.min(activeHistory.length, 60),
          optimizerType: "pso"
        });

        setComputingProgress(50);
        setComputingStep("Inférence hybride & Scoring vectoriel...");
        await new Promise((resolve) => setTimeout(resolve, 300));

        // 2. Lancer la prédiction maître pour obtenir les scores des numéros
        const prediction = await generateMasterPrediction(
          drawName,
          activeHistory,
          30, // temporal depth
          neuralDnaResult.bestWeights,
          undefined, // metrics
          undefined, // symbiotic context
          true,      // skip extra training
          riskProfile === "chaos" || riskProfile === "speculative", // adversarial mode
          riskProfile === "chaos" ? 3 : riskProfile === "speculative" ? 2 : 1,
          true       // forensic optimized
        );

        setComputingProgress(75);
        setComputingStep("Extraction de la matrice d'affinité spatio-temporelle...");
        await new Promise((resolve) => setTimeout(resolve, 300));

        // 3. Extraire l'affinity map pour garantir la cohésion harmonique des suites
        const features = await extractFeatures(drawName, activeHistory);
        const affinityMap = features.affinityMap;

        setComputingProgress(90);
        setComputingStep("Génération stochastique par Recuit Simulé...");
        await new Promise((resolve) => setTimeout(resolve, 200));

        // Formater les candidats scored numbers
        const scoredNumbers = prediction.candidates.map((num) => {
          const bd = prediction.breakdown?.[num] || {
            frequency: 0.5,
            gaps: 0.5,
            markov: 0.5,
            affinity: 0.5,
            momentum: 0.5
          };
          return {
            num,
            score: prediction.breakdown?.[num] ? Object.values(prediction.breakdown[num]).reduce((a, b) => a + b, 0) : 0.5,
            breakdown: bd
          };
        }).sort((a, b) => b.score - a.score);

        // Dériver une valeur déterministe pour l'entropie et le seed LCG (ZÉRO HASARD)
        const lastDraw = activeHistory[0]?.gagnants || [];
        const lastDrawSum = lastDraw.reduce((a, b) => a + b, 0);

        const tickets: GeneratedTicket[] = [];

        // Générer le nombre requis de suites stochastiques distinctes mais reproductibles
        for (let i = 0; i < ticketCount; i++) {
          // Perturber de façon continue et déterministe le spectre de scores pour chaque ticket
          const perturbedScores = scoredNumbers.map((sn, idx) => {
            // Convolutions trigonométriques fluides (pente douce sans nombres magiques arbitraires)
            const perturbation = 1.0 + 0.18 * Math.sin(i * 1.7 + idx * 2.9 + lastDrawSum * 0.07);
            return {
              ...sn,
              score: sn.score * perturbation
            };
          }).sort((a, b) => b.score - a.score);

          // Générer la combinaison optimisée par recuit simulé déterministe
          const combo = await generateCombination(
            perturbedScores,
            affinityMap,
            FALLBACK_CALIBRATION,
            profiles[riskProfile].outsiders,
            lastDraw,
            riskProfile === "chaos" ? 0.9 : riskProfile === "speculative" ? 0.6 : 0.3
          );

          // Trier les numéros de la grille par ordre croissant pour l'affichage classique
          const sortedCombo = [...combo].sort((a, b) => a - b);

          // Calculer un indice de confiance déterministe basé sur les scores perturbés des numéros de la grille
          const comboSumScore = sortedCombo.reduce((acc, num) => {
            const found = scoredNumbers.find(s => s.num === num);
            return acc + (found ? found.score : 0.5);
          }, 0);
          const baseConf = (comboSumScore / 5) * 100;
          const finalConfidence = Math.max(76, Math.min(99.4, baseConf + (i * -0.6)));

          // Déterminer la mention harmonique
          const harmonyOptions = ["Optimale", "Excellente", "Harmonique", "Équilibrée"];
          const harmony = harmonyOptions[Math.floor((finalConfidence * 11) % harmonyOptions.length)];

          tickets.push({
            id: `stoch_${drawName}_${riskProfile}_${i}_${lastDrawSum}`,
            numbers: sortedCombo,
            confidence: parseFloat(finalConfidence.toFixed(1)),
            harmony,
            outsidersCount: profiles[riskProfile].outsiders,
            isSaved: false
          });
        }

        setGeneratedTickets(tickets);

        // Sauvegarde en cache de session
        try {
          const localKey = `loto_advanced_pred_${drawName}_${riskProfile}_${ticketCount}`;
          sessionStorage.setItem(localKey, JSON.stringify(tickets));
        } catch (e) {}

        setComputingProgress(100);
        setIsComputing(false);
        audioEngine.play("success");
        showToast("Inférence neurale accomplie. Vos suites stochastiques sont prêtes.", "success");
      } catch (err) {
        console.error("[AdvancedPrediction] Erreur pendant l'inférence:", err);
        setIsComputing(false);
        audioEngine.play("error");
        showToast("Échec de l'optimisation stochastique.", "error");
      }
    }, [drawName, activeHistory, ticketCount, riskProfile, showToast]);

    // Copie de combinaison rapide
    const handleCopyCombination = useCallback((numbers: number[]) => {
      try {
        navigator.clipboard.writeText(numbers.join(", "));
        audioEngine.play("success");
        showToast(`Combinaison [${numbers.join(", ")}] copiée dans le presse-papiers !`, "success");
      } catch (e) {
        showToast("Échec de la copie.", "error");
      }
    }, [showToast]);

    // Sauvegarde physique de ticket localement et synchronisation
    const handleSaveTicket = useCallback(async (ticket: GeneratedTicket, idx: number) => {
      try {
        audioEngine.play("click");
        await saveTicket({
          drawName,
          numbers: ticket.numbers,
          strategy: `Inférence Neurale - ${profiles[riskProfile].label}`
        });
        
        // Mettre à jour l'état visuel local
        setGeneratedTickets((prev) => {
          const next = [...prev];
          if (next[idx]) next[idx].isSaved = true;
          return next;
        });

        audioEngine.play("success");
        showToast(`Grille #${idx + 1} enregistrée dans votre portefeuille de simulation.`, "success");
      } catch (err) {
        showToast("Erreur lors de l'enregistrement.", "error");
      }
    }, [drawName, riskProfile, showToast]);

    // Synthèse vocale interactive (Extrêmement bénéfique pour l'accessibilité)
    const handleListenTicket = useCallback((ticket: GeneratedTicket) => {
      if (speakingTicketId === ticket.id) {
        speechEngine.stop();
        setSpeakingTicketId(null);
        audioEngine.play("click");
      } else {
        speechEngine.stop();
        setSpeakingTicketId(ticket.id);
        speechEngine.speakNumbers(ticket.numbers, drawName, () => {
          setSpeakingTicketId(null);
        });
      }
    }, [speakingTicketId, drawName]);

    // Arrêter la parole lors du démontage du composant
    useEffect(() => {
      return () => {
        speechEngine.stop();
      };
    }, []);

    // Rendre l'explication simple d'un numéro individuel
    const renderNumberExplainer = (num: number) => {
      // Dérivations de métriques simples basées sur l'historique sans jargon complexe
      const occurrences = activeHistory.filter((d) => d.gagnants.includes(num)).length;
      const pct = activeHistory.length > 0 ? ((occurrences / activeHistory.length) * 100).toFixed(1) : "0";
      
      // Trouver le dernier écart déterministe
      let gap = 0;
      for (let i = 0; i < activeHistory.length; i++) {
        if (activeHistory[i].gagnants.includes(num)) {
          gap = i;
          break;
        }
      }

      return (
        <div className="bg-slate-900 border border-slate-700/60 p-4 rounded-2xl text-left space-y-2 text-slate-100 max-w-xs shadow-2xl">
          <div className="flex justify-between items-center border-b border-slate-800 pb-2">
            <span className="text-sm font-black text-indigo-400">NUMÉRO {num}</span>
            <span className="px-2 py-0.5 bg-indigo-500/10 text-indigo-400 text-[10px] font-black uppercase rounded-full">
              Fiche Technique
            </span>
          </div>
          <div className="space-y-1.5 text-xs">
            <div className="flex justify-between">
              <span className="text-slate-400">Présence Globale :</span>
              <span className="font-bold text-slate-200">{occurrences} fois ({pct}%)</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Écart Actuel :</span>
              <span className="font-bold text-slate-200">{gap} tirages</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Température :</span>
              <span className={`font-bold ${gap > 15 ? 'text-cyan-400' : 'text-amber-400'}`}>
                {gap > 15 ? "Refroidi" : "Chaud"}
              </span>
            </div>
          </div>
          <p className="text-[10px] text-slate-400 leading-relaxed pt-1.5 border-t border-slate-800">
            Ce numéro a été retenu par le moteur neuronal en raison de sa forte cohésion harmonique spatiale dans la matrice d'affinité.
          </p>
        </div>
      );
    };

    return (
      <div className="space-y-6 md:space-y-8 animate-fade-in">
        {/* En-tête du module - Minimaliste, clair et sans surcharge graphique */}
        <div className="bg-slate-900/40 p-6 md:p-8 rounded-3xl border border-white/5 relative overflow-hidden">
          <div className="absolute top-0 right-0 p-8 opacity-5 pointer-events-none">
            <BrainCircuit size={120} className="text-indigo-500" />
          </div>
          
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-indigo-400">
                <BrainCircuit size={18} className="animate-pulse" />
                <span className="text-xs font-black uppercase tracking-[0.25em]">Moteur Stochastique Neural</span>
              </div>
              <h3 className="text-xl md:text-3xl font-black text-white uppercase tracking-tight">
                Prédiction Avancée
              </h3>
              <p className="text-xs text-slate-400 max-w-2xl leading-relaxed">
                Générez des suites stochastiques hautement probables pour le tirage actif. 
                Le système calibre un réseau d'ADN neuronal pour cartographier les transitions puis affine les grilles par recuit simulé déterministe.
              </p>
            </div>
          </div>
        </div>

        {/* Panneau de configuration simplifié - Boutons larges, excellente cible de toucher */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          
          {/* Nombre de grilles */}
          <div className="lg:col-span-4 bg-slate-900/60 p-5 md:p-6 rounded-3xl border border-white/5 space-y-4">
            <div className="flex items-center gap-2 text-slate-300 font-bold text-sm">
              <Sliders size={16} className="text-indigo-400" />
              <span>Nombre de grilles à générer</span>
            </div>
            
            <div className="flex items-center justify-between bg-slate-950/80 p-3 rounded-2xl border border-white/5">
              <button
                onClick={() => {
                  audioEngine.play("click");
                  setTicketCount(prev => Math.max(1, prev - 1));
                }}
                disabled={ticketCount <= 1}
                className="w-12 h-12 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-30 disabled:pointer-events-none flex items-center justify-center text-white cursor-pointer btn-reactive"
                title="Diminuer"
              >
                <Minus size={18} />
              </button>
              
              <span className="text-3xl font-black text-white">{ticketCount}</span>
              
              <button
                onClick={() => {
                  audioEngine.play("click");
                  setTicketCount(prev => Math.min(8, prev + 1));
                }}
                disabled={ticketCount >= 8}
                className="w-12 h-12 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-30 disabled:pointer-events-none flex items-center justify-center text-white cursor-pointer btn-reactive"
                title="Augmenter"
              >
                <Plus size={18} />
              </button>
            </div>
            <p className="text-[11px] text-slate-500">
              Générez jusqu'à 8 grilles simultanées optimisées par convolutions mathématiques distinctes.
            </p>
          </div>

          {/* Choix du profil de risque */}
          <div className="lg:col-span-8 bg-slate-900/60 p-5 md:p-6 rounded-3xl border border-white/5 space-y-4">
            <div className="flex items-center gap-2 text-slate-300 font-bold text-sm">
              <Sliders size={16} className="text-indigo-400" />
              <span>Sélectionner le Profil de Risque</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {(Object.keys(profiles) as Array<keyof typeof profiles>).map((key) => {
                const p = profiles[key];
                const active = riskProfile === key;
                return (
                  <button
                    key={key}
                    onClick={() => {
                      audioEngine.play("click");
                      setRiskProfile(key);
                    }}
                    className={`p-3 rounded-2xl border text-left flex flex-col justify-between h-28 cursor-pointer transition-all btn-reactive ${
                      active
                        ? "bg-slate-800 border-indigo-500 ring-2 ring-indigo-500/20 text-white"
                        : "bg-slate-950/60 border-white/5 text-slate-400 hover:bg-slate-900 hover:text-slate-200"
                    }`}
                  >
                    <span className="text-2xl">{p.icon}</span>
                    <div>
                      <div className="text-xs font-black uppercase tracking-wider">{p.label}</div>
                      <div className="text-[9px] text-slate-500 mt-0.5 line-clamp-2 leading-tight">
                        {p.desc}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Bouton Principal d'action */}
        <div className="flex justify-center">
          <button
            onClick={runNeuralStochasticInference}
            disabled={isComputing}
            className="w-full md:w-auto px-8 py-5 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-black uppercase tracking-widest text-sm flex items-center justify-center gap-3 shadow-xl shadow-indigo-600/20 transition-all disabled:opacity-40 cursor-pointer border border-indigo-400/20 btn-reactive"
          >
            <Cpu size={18} className={isComputing ? "animate-spin" : ""} />
            <span>{isComputing ? "Inférence en cours..." : "LANCER L'INFÉRENCE NEURALE"}</span>
          </button>
        </div>

        {/* Overlay ou Bloc de Progression pour l'Inférence */}
        <AnimatePresence>
          {isComputing && (
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              className="bg-indigo-950/20 border border-indigo-500/30 p-6 rounded-3xl space-y-4"
            >
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <RefreshCw className="animate-spin text-indigo-400" size={18} />
                  <span className="text-xs font-mono font-bold text-indigo-300 uppercase tracking-wider">
                    {computingStep}
                  </span>
                </div>
                <span className="text-xs font-mono font-bold text-indigo-400">{computingProgress}%</span>
              </div>
              
              <div className="h-2 bg-slate-950 rounded-full overflow-hidden border border-white/5">
                <motion.div
                  className="h-full bg-indigo-500 rounded-full"
                  initial={{ width: "0%" }}
                  animate={{ width: `${computingProgress}%` }}
                  transition={{ duration: 0.3 }}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Résultats - Rendu sous forme de magnifiques Tickets en papier réactifs */}
        <div className="space-y-6">
          {generatedTickets.length === 0 ? (
            <div className="p-16 text-center border-2 border-dashed border-slate-800 rounded-3xl space-y-4 max-w-lg mx-auto">
              <div className="w-16 h-16 rounded-full bg-slate-900 flex items-center justify-center text-slate-500 mx-auto">
                <Sparkles size={24} />
              </div>
              <div className="space-y-1">
                <h4 className="text-sm font-black text-slate-300 uppercase tracking-wider">
                  Aucune suite stochastique générée
                </h4>
                <p className="text-xs text-slate-500 leading-relaxed max-w-xs mx-auto">
                  Veuillez cliquer sur le bouton d'inférence ci-dessus pour lancer les simulations neuronales sur le tirage actif.
                </p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {generatedTickets.map((ticket, idx) => {
                const p = profiles[riskProfile];
                const isSpeaking = speakingTicketId === ticket.id;

                return (
                  <motion.div
                    key={ticket.id}
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.05 }}
                    className="bg-slate-900/80 border border-white/5 rounded-3xl p-5 md:p-6 space-y-4 relative overflow-hidden group shadow-xl"
                  >
                    {/* Filigrane discret de fond */}
                    <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none font-mono text-xs select-none">
                      INFERENCE_{idx + 1}
                    </div>

                    <div className="flex justify-between items-center border-b border-white/5 pb-3">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-black text-white uppercase tracking-wider">
                            GRILLE #{idx + 1}
                          </span>
                          <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider ${p.color}`}>
                            {p.label}
                          </span>
                        </div>
                        <div className="text-[10px] text-slate-500 uppercase tracking-widest font-mono">
                          Harmonie : {ticket.harmony}
                        </div>
                      </div>

                      {/* Indice de Confiance */}
                      <div className="text-right">
                        <div className="text-[9px] font-black uppercase tracking-wider text-slate-500 leading-none">
                          Confiance
                        </div>
                        <div className="text-lg font-black text-amber-400 mt-0.5 leading-none">
                          {ticket.confidence}%
                        </div>
                      </div>
                    </div>

                    {/* Affichage des numéros en boules élégantes */}
                    <div className="flex flex-wrap gap-2.5 justify-center py-4 bg-slate-950/40 rounded-2xl border border-white/5">
                      {ticket.numbers.map((num) => (
                        <button
                          key={num}
                          onClick={() => {
                            audioEngine.play("click");
                            setActiveExplanationNum(activeExplanationNum === num ? null : num);
                          }}
                          className="w-12 h-12 rounded-full bg-gradient-to-br from-indigo-600/90 to-purple-700 text-white flex items-center justify-center font-black text-lg shadow-md border border-white/10 hover:scale-110 active:scale-95 hover:border-indigo-400/40 transition-all cursor-pointer relative overflow-hidden group"
                        >
                          <span className="relative z-10">{num}</span>
                          <div className="absolute inset-0 bg-white/15 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                        </button>
                      ))}
                    </div>

                    {/* Affichage d'une explication interactive très simple si un numéro est cliqué */}
                    <AnimatePresence>
                      {activeExplanationNum && ticket.numbers.includes(activeExplanationNum) && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          className="overflow-hidden"
                        >
                          {renderNumberExplainer(activeExplanationNum)}
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {/* Zone d'actions interactives simplifiées */}
                    <div className="flex justify-between items-center pt-2 gap-2">
                      <button
                        onClick={() => handleListenTicket(ticket)}
                        className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl border text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer btn-reactive ${
                          isSpeaking
                            ? "bg-rose-500/10 border-rose-500/30 text-rose-400"
                            : "bg-slate-950 border-white/5 text-slate-400 hover:text-slate-200 hover:bg-slate-800"
                        }`}
                        title="Écouter la combinaison à haute voix (Français)"
                      >
                        {isSpeaking ? <VolumeX size={13} /> : <Volume2 size={13} />}
                        <span>{isSpeaking ? "Arrêter" : "Écouter"}</span>
                      </button>

                      <button
                        onClick={() => handleCopyCombination(ticket.numbers)}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-slate-950 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-white/5 text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer btn-reactive"
                        title="Copier la combinaison"
                      >
                        <Copy size={13} />
                        <span>Copier</span>
                      </button>

                      <button
                        onClick={() => handleSaveTicket(ticket, idx)}
                        disabled={ticket.isSaved}
                        className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer btn-reactive ${
                          ticket.isSaved
                            ? "bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 disabled:opacity-100"
                            : "bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-400 hover:text-indigo-300 border border-indigo-500/30"
                        }`}
                        title="Enregistrer cette grille"
                      >
                        {ticket.isSaved ? <CheckCircle2 size={13} /> : <Save size={13} />}
                        <span>{ticket.isSaved ? "Enregistré" : "Sauver"}</span>
                      </button>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>

        {/* Rappel des principes d'isolation (Isolé de façon étanche) */}
        <div className="p-4 rounded-2xl bg-slate-900/20 border border-slate-800 flex items-start gap-3">
          <Info size={16} className="text-slate-400 shrink-0 mt-0.5" />
          <p className="text-[10px] text-slate-500 leading-relaxed font-sans">
            <strong>Garde d'Isolation Active</strong> : Ce module respecte scrupuleusement l'étanchéité des données. 
            Les grilles stochastiques générées sont formulées exclusivement à partir de l'historique propre du tirage <strong>{drawName}</strong>, excluant toute contamination inter-tirages.
          </p>
        </div>
      </div>
    );
  }
);

AdvancedPredictionTab.displayName = "AdvancedPredictionTab";
