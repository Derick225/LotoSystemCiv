import React, { useState } from 'react';
import { Prediction, QuantifiedUncertainty, PredictionScenarioItem } from '../../types';
import { NumberBall } from '../NumberBall';
import { audioEngine } from '../../utils/audioEngine';
import { useToast } from '../ui/Toast';
import {
  ShieldAlert,
  Sliders,
  Layers,
  Sparkles,
  Info,
  TrendingUp,
  Activity,
  CheckCircle2,
  AlertTriangle,
  Compass,
} from 'lucide-react';

interface PredictionUncertaintyScenariosPanelProps {
  prediction: Prediction | null;
  onApplyScenario?: (numbers: number[]) => void;
}

export const PredictionUncertaintyScenariosPanel: React.FC<PredictionUncertaintyScenariosPanelProps> = ({
  prediction,
  onApplyScenario,
}) => {
  const { showToast } = useToast();
  const [selectedScenarioId, setSelectedScenarioId] = useState<string>('BALANCED_PARETO');

  if (!prediction) return null;

  const uncertainty: QuantifiedUncertainty | undefined = prediction.quantifiedUncertainty;
  const scenarios: PredictionScenarioItem[] = prediction.simulationScenarios || [];
  const readability = prediction.readabilityReport;

  const handleSelectScenario = (sc: PredictionScenarioItem) => {
    audioEngine.play('click');
    setSelectedScenarioId(sc.scenarioId);
    if (onApplyScenario) {
      onApplyScenario(sc.suggestedNumbers);
      showToast(`Scénario "${sc.label}" appliqué au ticket actif`, 'info');
    }
  };

  return (
    <div id="prediction-uncertainty-scenarios-panel" className="w-full space-y-6 bg-slate-900/60 p-6 rounded-3xl border border-white/5 shadow-xl font-sans">
      {/* HEADER */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 font-black text-[10px] rounded-lg uppercase tracking-wider">
            <Compass size={13} className="text-cyan-400 animate-pulse" />
            Quantified Uncertainty & Deterministic Scenarios
          </div>
          <h3 className="text-lg md:text-xl font-black text-white uppercase tracking-tight">
            Décomposition d'Incertitude & Scénarios Déterministes
          </h3>
          <p className="text-xs text-slate-400">
            Quantification continue de l'entropie épistémique vs aléatoire et navigation parmi les régimes de simulation.
          </p>
        </div>

        {uncertainty && (
          <div className="flex items-center gap-2 bg-slate-950 px-4 py-2 rounded-2xl border border-white/10">
            <span className="text-[10px] font-black uppercase text-slate-400">Fiabilité Globale :</span>
            <span className="text-sm font-black font-mono text-cyan-400">
              {uncertainty.reliabilityScore}%
            </span>
          </div>
        )}
      </div>

      {/* UNCERTAINTY DECOMPOSITION BARS */}
      {uncertainty && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 bg-slate-950/80 rounded-2xl border border-white/5 space-y-2">
            <div className="flex justify-between items-center text-[10px] font-black uppercase">
              <span className="text-slate-400 flex items-center gap-1.5">
                <Sliders size={12} className="text-indigo-400" />
                Incertitude Épistémique (Modèle)
              </span>
              <span className="font-mono text-indigo-400">{uncertainty.epistemicUncertainty}%</span>
            </div>
            <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-indigo-500 to-indigo-400 transition-all duration-500"
                style={{ width: `${Math.min(100, uncertainty.epistemicUncertainty)}%` }}
              />
            </div>
            <p className="text-[9px] text-slate-500 leading-tight">
              Réductible par enrichissement historique et optimisation des hyperparamètres.
            </p>
          </div>

          <div className="p-4 bg-slate-950/80 rounded-2xl border border-white/5 space-y-2">
            <div className="flex justify-between items-center text-[10px] font-black uppercase">
              <span className="text-slate-400 flex items-center gap-1.5">
                <Activity size={12} className="text-amber-400" />
                Incertitude Aléatoire (Stochastique)
              </span>
              <span className="font-mono text-amber-400">{uncertainty.aleatoricUncertainty}%</span>
            </div>
            <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-amber-500 to-amber-400 transition-all duration-500"
                style={{ width: `${Math.min(100, uncertainty.aleatoricUncertainty)}%` }}
              />
            </div>
            <p className="text-[9px] text-slate-500 leading-tight">
              Inhérente au processus physique stochastique du tirage et à la dynamique chaotique.
            </p>
          </div>

          <div className="p-4 bg-slate-950/80 rounded-2xl border border-white/5 space-y-2">
            <div className="flex justify-between items-center text-[10px] font-black uppercase">
              <span className="text-slate-400 flex items-center gap-1.5">
                <ShieldAlert size={12} className="text-cyan-400" />
                Entropie de Shannon Totale
              </span>
              <span className="font-mono text-cyan-400">{uncertainty.totalEntropyBits.toFixed(2)} bits</span>
            </div>
            <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-cyan-500 to-emerald-400 transition-all duration-500"
                style={{ width: `${Math.min(100, (uncertainty.totalEntropyBits / 6.49) * 100)}%` }}
              />
            </div>
            <p className="text-[9px] text-slate-500 leading-tight">
              Information théorique vs bruit blanc théorique max (6.49 bits pour N=90).
            </p>
          </div>
        </div>
      )}

      {/* 3 DETERMINISTIC SCENARIOS */}
      {scenarios.length > 0 && (
        <div className="space-y-3">
          <h4 className="text-xs font-black uppercase tracking-wider text-slate-300 flex items-center gap-2">
            <Layers size={14} className="text-cyan-400" />
            Régimes de Scénarios de Simulation
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {scenarios.map((sc) => {
              const isSelected = selectedScenarioId === sc.scenarioId;
              return (
                <div
                  key={sc.scenarioId}
                  onClick={() => handleSelectScenario(sc)}
                  className={`p-5 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between space-y-4 ${
                    isSelected
                      ? 'bg-cyan-950/40 border-cyan-500/60 shadow-lg shadow-cyan-950/50 scale-[1.02]'
                      : 'bg-slate-950/60 border-white/5 hover:border-white/20'
                  }`}
                >
                  <div className="space-y-2">
                    <div className="flex justify-between items-start gap-2">
                      <span className="text-xs font-black uppercase tracking-tight text-white block">
                        {sc.label}
                      </span>
                      <span className="px-2 py-0.5 rounded-full text-[9px] font-mono font-bold bg-cyan-500/10 text-cyan-300 border border-cyan-500/20">
                        {sc.confidence}% Conf.
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-400 leading-relaxed">
                      {sc.rationale}
                    </p>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {sc.suggestedNumbers.map((num) => (
                        <NumberBall key={num} number={num} size="sm" />
                      ))}
                    </div>

                    <div className="pt-2 flex items-center justify-between text-[10px] font-bold">
                      <span className={isSelected ? 'text-cyan-400' : 'text-slate-500'}>
                        {isSelected ? '✓ Scénario Sélectionné' : 'Cliquer pour charger'}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* READABILITY REPORT & KEY DRIVERS */}
      {readability && (
        <div className="p-5 bg-slate-950/60 rounded-2xl border border-white/5 space-y-3">
          <div className="flex items-center gap-2">
            <Sparkles size={14} className="text-amber-400" />
            <h4 className="text-xs font-black uppercase tracking-wider text-white">
              Synthèse d'Explicabilité & Drivers d'Inférence
            </h4>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed font-medium">
            {readability.summary}
          </p>

          <div className="flex flex-wrap gap-2 pt-1">
            {readability.keyDrivers.map((driver, i) => (
              <span
                key={i}
                className="px-2.5 py-1 bg-slate-900 border border-white/10 rounded-lg text-[10px] text-slate-300 font-mono"
              >
                ⚡ {driver}
              </span>
            ))}
          </div>

          <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-start gap-2.5 text-[11px] text-amber-200">
            <AlertTriangle size={15} className="text-amber-400 flex-shrink-0 mt-0.5" />
            <p className="leading-snug">
              <strong className="font-bold">Évaluation des Risques :</strong> {readability.riskAssessment}
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
