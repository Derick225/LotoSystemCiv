import React, { useState, useMemo } from 'react';
import { useNexusStore } from '../../store/useNexusStore';
import { 
  gapRangeSequenceService, 
  GapRangeStep, 
  GapRangeBinInfo 
} from '../../services/prediction/gapRangeSequenceService';
import { NumberBall } from '../NumberBall';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  Cell 
} from 'recharts';
import { 
  Layers, 
  TrendingUp, 
  Sparkles, 
  Filter, 
  CheckCircle2, 
  SlidersHorizontal,
  ChevronRight,
  HelpCircle
} from 'lucide-react';
import { audioEngine } from '../../utils/audioEngine';

interface GapRangeSequenceWidgetProps {
  drawName: string;
}

export const GapRangeSequenceWidget: React.FC<GapRangeSequenceWidgetProps> = ({ drawName }) => {
  const history = useNexusStore(state => state.history);
  const [step, setStep] = useState<GapRangeStep>('combined');
  const [selectedBinIndex, setSelectedBinIndex] = useState<number | null>(null);

  // Compute Gap Range Sequence analysis dynamically
  const report = useMemo(() => {
    return gapRangeSequenceService.analyzeGapRangePatterns(drawName, history, step, 90);
  }, [drawName, history, step]);

  const activeBin = useMemo(() => {
    if (selectedBinIndex !== null && report.bins[selectedBinIndex]) {
      return report.bins[selectedBinIndex];
    }
    return report.topPredictedBins[0] || report.bins[0];
  }, [selectedBinIndex, report]);

  const handleStepChange = (newStep: GapRangeStep) => {
    audioEngine.play('click');
    setStep(newStep);
    setSelectedBinIndex(null);
  };

  const chartData = useMemo(() => {
    return report.bins.map(bin => ({
      binIndex: bin.binIndex,
      label: bin.label,
      probability: parseFloat((bin.probability * 100).toFixed(1)),
      count: bin.matchingNumbers.length
    }));
  }, [report]);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-7 shadow-xl space-y-6 relative overflow-hidden">
      {/* Background Accent Glow */}
      <div className="absolute top-0 right-0 -mt-12 -mr-12 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 left-0 -mb-12 -ml-12 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* Header & Step Selector */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 bg-indigo-500/10 text-indigo-400 rounded-xl border border-indigo-500/20">
              <Layers className="w-5 h-5" />
            </span>
            <h3 className="text-lg font-black text-white tracking-wide uppercase">
              Séquences & Pattern des Écarts par Tranches
            </h3>
          </div>
          <p className="text-xs text-slate-400 mt-1 max-w-2xl">
            Modèle Markovien de transition de fréquences d'écarts d'apparition d'un tirage au suivant.
            Prédit les tranches d'écarts les plus probables pour filtrer l'ADN des numéros.
          </p>
        </div>

        {/* Granularity Switcher */}
        <div className="flex flex-wrap items-center bg-slate-950 p-1 rounded-2xl border border-slate-800 self-start md:self-auto gap-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-3 flex items-center gap-1">
            <SlidersHorizontal className="w-3 h-3 text-indigo-400" />
            Tranches
          </span>
          <button
            onClick={() => handleStepChange('combined')}
            className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-all ${
              step === 'combined'
                ? 'bg-gradient-to-r from-indigo-600 to-emerald-600 text-white shadow-lg shadow-indigo-600/30'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Multi-Res (5 & 10)
          </button>
          <button
            onClick={() => handleStepChange(10)}
            className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-all ${
              step === 10
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Tranches de 10
          </button>
          <button
            onClick={() => handleStepChange(5)}
            className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-all ${
              step === 5
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Tranches de 5
          </button>
        </div>
      </div>

      {/* Multi-Resolution Weight Info Badge */}
      {report.resolutionWeights && (
        <div className="bg-indigo-950/40 border border-indigo-500/20 rounded-xl px-4 py-2 flex flex-wrap items-center justify-between text-xs font-mono text-slate-300">
          <span className="text-indigo-400 font-bold flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5" /> Fusion Multi-Résolution Entropique :
          </span>
          <div className="flex items-center gap-4">
            <span>Poids Tranches de 5 : <strong className="text-emerald-400">{(report.resolutionWeights.step5Weight * 100).toFixed(1)}%</strong></span>
            <span>Poids Tranches de 10 : <strong className="text-indigo-400">{(report.resolutionWeights.step10Weight * 100).toFixed(1)}%</strong></span>
          </div>
        </div>
      )}

      {/* Last Draw Signature Banner */}
      <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
        <div className="space-y-1">
          <div className="text-[10px] font-black uppercase tracking-widest text-indigo-400 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5" />
            Signature des Écarts du Dernier Tirage
          </div>
          <div className="text-xs text-slate-300 font-mono">
            Séquence des tranches :{' '}
            <span className="text-emerald-400 font-bold">
              {report.lastDrawBinLabels.join('  ➔  ')}
            </span>
          </div>
        </div>

        {/* Individual Winning Balls & Gap details */}
        <div className="flex flex-wrap items-center gap-2">
          {report.lastDrawWinningGaps.map((item, idx) => (
            <div
              key={idx}
              className="bg-slate-900 border border-slate-800 rounded-xl px-2.5 py-1.5 flex items-center gap-2 shadow-sm"
            >
              <NumberBall number={item.number} size="sm" />
              <div className="flex flex-col text-[10px]">
                <span className="text-slate-400">Écart : <strong className="text-amber-400">{item.gap}</strong></span>
                <span className="text-indigo-300 font-mono font-bold">{item.binLabel}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Transition Probabilities Bar Chart & Top Predicted Ranges */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 relative z-10">
        {/* Probability Chart */}
        <div className="lg:col-span-7 bg-slate-950/50 border border-slate-800/80 rounded-2xl p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-emerald-400" />
              Probabilités de Transition des Tranches (Markov)
            </h4>
            <span className="text-[10px] text-slate-500 font-mono">
              Cliquez sur une tranche pour filtrer les numéros
            </span>
          </div>

          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={chartData}
                margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                onClick={(e) => {
                  if (e && e.activePayload && e.activePayload.length > 0) {
                    const idx = e.activePayload[0].payload.binIndex;
                    setSelectedBinIndex(idx);
                    audioEngine.play('click');
                  }
                }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="label" stroke="#64748b" fontSize={11} tickLine={false} />
                <YAxis stroke="#64748b" fontSize={11} tickLine={false} unit="%" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0f172a',
                    borderColor: '#334155',
                    borderRadius: '12px',
                    fontSize: '12px',
                    color: '#f8fafc'
                  }}
                  formatter={(val: any) => [`${val}%`, 'Probabilité']}
                  labelFormatter={(label) => `Tranche d'écart ${label}`}
                />
                <Bar dataKey="probability" radius={[6, 6, 0, 0]} cursor="pointer">
                  {chartData.map((entry) => {
                    const isTop = report.topPredictedBins[0]?.binIndex === entry.binIndex;
                    const isSelected = activeBin.binIndex === entry.binIndex;
                    let fill = '#3b82f6';
                    if (isTop) fill = '#10b981';
                    if (isSelected) fill = '#6366f1';
                    return <Cell key={`cell-${entry.binIndex}`} fill={fill} />;
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Top Predicted Bins Summary */}
        <div className="lg:col-span-5 bg-slate-950/50 border border-slate-800/80 rounded-2xl p-4 flex flex-col justify-between space-y-4">
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300 mb-3 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-400" />
              Tranches Favorisées au Prochain Tirage
            </h4>
            <div className="space-y-2.5">
              {report.topPredictedBins.slice(0, 3).map((bin, rank) => {
                const isSelected = activeBin.binIndex === bin.binIndex;
                return (
                  <div
                    key={bin.binIndex}
                    onClick={() => {
                      setSelectedBinIndex(bin.binIndex);
                      audioEngine.play('click');
                    }}
                    className={`p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${
                      isSelected
                        ? 'bg-indigo-950/60 border-indigo-500 shadow-md'
                        : 'bg-slate-900 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className={`w-6 h-6 rounded-lg text-xs font-black flex items-center justify-center ${
                          rank === 0
                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                            : rank === 1
                            ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30'
                            : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                        }`}
                      >
                        #{rank + 1}
                      </span>
                      <div>
                        <div className="text-xs font-bold text-white flex items-center gap-2">
                          Tranche <span className="font-mono text-indigo-300">{bin.label}</span>
                          <span className="text-[10px] text-slate-400 font-normal">
                            (écarts {bin.minGap} à {bin.maxGap === Infinity ? '60+' : bin.maxGap})
                          </span>
                        </div>
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          {bin.matchingNumbers.length} numéros actuellement dans cette tranche
                        </div>
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="text-xs font-black font-mono text-emerald-400">
                        {(bin.probability * 100).toFixed(1)}%
                      </div>
                      <div className="text-[9px] uppercase tracking-wider text-slate-500">Vraisemblance</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="text-[11px] text-slate-400 bg-slate-900/80 p-3 rounded-xl border border-slate-800/60 flex items-start gap-2">
            <HelpCircle className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
            <span>
              Les probabilités de transition sont calculées par chaîne de Markov conditionnelle
              lissée par la loi de Laplace, dérivée uniquement de l'historique du tirage actif.
            </span>
          </div>
        </div>
      </div>

      {/* Matching Numbers Section for the Selected Bin */}
      <div className="bg-slate-950/60 border border-slate-800 rounded-2xl p-5 space-y-4 relative z-10">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800/80 pb-3">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-indigo-400" />
            <h4 className="text-xs font-bold text-white uppercase tracking-wider">
              Numéros dans la Tranche d'Écart <span className="text-indigo-300 font-mono font-black">{activeBin.label}</span>
            </h4>
            <span className="px-2 py-0.5 text-[10px] bg-indigo-500/20 text-indigo-300 rounded-full font-bold border border-indigo-500/30">
              {activeBin.matchingNumbers.length} Numéros
            </span>
          </div>

          <div className="text-xs text-slate-400 font-mono">
            Probabilité Conditionnelle de la Tranche :{' '}
            <strong className="text-emerald-400 font-bold">
              {(activeBin.probability * 100).toFixed(1)}%
            </strong>
          </div>
        </div>

        {/* Numbers Grid */}
        {activeBin.matchingNumbers.length === 0 ? (
          <p className="text-xs text-slate-500 italic py-4 text-center">
            Aucun numéro n'est actuellement dans cette tranche d'écart d'apparition.
          </p>
        ) : (
          <div className="grid grid-cols-2 xs:grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3">
            {activeBin.matchingNumbers.map((num) => {
              const score = report.scoresByNumber[num] ?? 50;
              return (
                <div
                  key={num}
                  className="bg-slate-900 border border-slate-800 hover:border-indigo-500/50 rounded-2xl p-2.5 flex flex-col items-center justify-between gap-2 shadow-sm transition-all group"
                >
                  <NumberBall number={num} size="md" />

                  <div className="w-full text-center space-y-0.5">
                    <div className="text-[10px] font-bold font-mono text-indigo-300">
                      Score : <span className="text-emerald-400 font-black">{score.toFixed(1)}</span>
                    </div>
                    <div className="w-full bg-slate-800 h-1 rounded-full overflow-hidden">
                      <div
                        className="bg-gradient-to-r from-indigo-500 to-emerald-400 h-full rounded-full"
                        style={{ width: `${Math.min(100, Math.max(0, score))}%` }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Historical Sequence Pattern Transitions Section */}
      {report.sequenceMatches && report.sequenceMatches.length > 0 && (
        <div className="bg-slate-950/60 border border-slate-800 rounded-2xl p-5 space-y-4 relative z-10">
          <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-emerald-400" />
              <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                Analogie Historique : Patterns de Séquences Similaires & Transitions
              </h4>
            </div>
            <span className="text-[10px] text-slate-400 font-mono">
              Top {report.sequenceMatches.length} séquences historiques analogues
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {report.sequenceMatches.slice(0, 4).map((match, idx) => (
              <div
                key={idx}
                className="bg-slate-900/90 border border-slate-800 rounded-xl p-3 space-y-2 text-xs"
              >
                <div className="flex items-center justify-between text-[11px] font-mono">
                  <span className="text-slate-400 font-bold">
                    Tirage Historique #{match.historicalDrawIndex}
                  </span>
                  <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-400 rounded-full font-bold border border-emerald-500/20">
                    Similarité Jaccard : {(match.similarityScore * 100).toFixed(0)}%
                  </span>
                </div>

                <div className="flex items-center gap-2 text-[10px] font-mono">
                  <span className="text-slate-400">Signature :</span>
                  <span className="text-indigo-300">{match.historicalGapsSignature.join(', ')}</span>
                </div>

                <div className="flex items-center gap-2 text-[10px] font-mono">
                  <span className="text-slate-400">Transition Suivante :</span>
                  <span className="text-emerald-400 font-bold">{match.subsequentGapsSignature.join(' ➔ ')}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
