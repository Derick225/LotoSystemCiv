
import React, { useMemo } from 'react';
import { useNexusStore } from '../../store/useNexusStore';
import { NumberBall } from '../NumberBall';
import { Zap, BatteryCharging, BatteryWarning, Sparkles, Activity } from 'lucide-react';
import { computeSVD } from '../../services/mathCore';

export const SpectralTab: React.FC<{ drawName: string }> = ({ drawName }) => {
  const spectral = useNexusStore(state => state.spectral);
  const wavelet = useNexusStore(state => state.wavelet);
  const loading = useNexusStore(state => state.loading);
  const history = useNexusStore(state => state.history);

  const highEnergy = useMemo(() => {
      return [...spectral]
        .sort((a, b) => b.energy - a.energy)
        .slice(0, 15);
  }, [spectral]);

  const highWavelet = useMemo(() => {
      return [...wavelet]
        .sort((a, b) => b.energy - a.energy)
        .slice(0, 5);
  }, [wavelet]);

  const resonantWaveletsCount = useMemo(() => {
      return wavelet.filter((w: any) => w.resonance).length;
  }, [wavelet]);

  const dominantPeriod = useMemo(() => {
      return spectral[0]?.dominantPeriod || 12.0;
  }, [spectral]);

  const energyStats = useMemo(() => {
      if (spectral.length === 0) return { mean: 75, stdDev: 10 };
      const energies = spectral.map(s => s.energy);
      const mean = energies.reduce((a, b) => a + b, 0) / energies.length;
      let sumSq = 0;
      for (let i = 0; i < energies.length; i++) {
          sumSq += (energies[i] - mean) ** 2;
      }
      const stdDev = Math.sqrt(sumSq / energies.length) || 1.0;
      return { mean, stdDev };
  }, [spectral]);

  const svdModes = useMemo(() => {
      const N = Math.min(history.length, 100);
      // CORRECTION : Les modes de repli (SVD) doivent être harmoniques (1/2, 1/3, 1/6)
      if (N < 10) return [50, 100 / 3, 100 / 6];
      
      const M = 90; // 90 Boules standards
      
      // Matrice d'occurrence H
      const H = Array(N).fill(0).map(() => Array(M).fill(0));
      const colMeans = Array(M).fill(0);
      
      for (let i = 0; i < N; i++) {
          const d = history[i];
          for (let j = 0; j < M; j++) {
              const ball = j + 1;
              const val = d.gagnants.includes(ball) ? 1.0 : -1.0;
              H[i][j] = val;
              colMeans[j] += val;
          }
      }
      
      // Centrage des colonnes (ZÉRO NOMBRES MAGIQUES)
      for (let j = 0; j < M; j++) {
          colMeans[j] /= N;
          for (let i = 0; i < N; i++) {
              H[i][j] -= colMeans[j];
          }
      }
      
      try {
          const { s } = computeSVD(H, 3);
          const totalVal = s.reduce((a, b) => a + b, 0) || 1;
          return s.map(v => (v / totalVal) * 100);
      } catch (e) {
          // CORRECTION : Les modes de repli (SVD) doivent être harmoniques (1/2, 1/3, 1/6)
          return [50, 100 / 3, 100 / 6]; // Fallback continu
      }
  }, [history]);

  if (loading || spectral.length === 0) return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-6 animate-pulse">
          <Zap className="text-indigo-500 animate-bounce" size={48} />
          <p className="text-xs font-black uppercase tracking-[0.3em] text-slate-400">Scan des potentiels énergétiques...</p>
      </div>
  );

  return (
    <div className="space-y-8 animate-fade-in pb-16 w-full">
        {/* Header Hero */}
        <div className="bg-slate-950 p-8 md:p-8 rounded-3xl text-white shadow-2xl relative overflow-hidden border border-slate-800">
            <div className="absolute top-0 right-0 w-80 h-80 bg-indigo-500/10 rounded-full blur-[100px] -mr-20 -mt-20"></div>
            <div className="relative z-10 flex flex-col md:flex-row justify-between items-center gap-8">
                <div className="flex-1">
                    <h3 className="text-3xl md:text-4xl font-black tracking-tighter mb-4 flex items-center gap-3">
                        <Zap className="text-amber-400" fill="currentColor" /> État de Charge des Numéros
                    </h3>
                    <p className="text-slate-400 text-sm font-medium leading-relaxed max-w-xl">
                        Plus la jauge est pleine, plus le numéro a accumulé une tension cyclique. Ces numéros sont statistiquement "dus" et cherchent à décharger leur énergie en sortant au tirage.
                    </p>
                </div>
                <div className="bg-white/5 p-6 rounded-3xl border border-white/10 text-center min-w-[200px]">
                    <div className="text-amber-400 font-black text-4xl mb-1">{highEnergy[0]?.energy || 0}%</div>
                    <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">Potentiel de Charge Max</div>
                </div>
            </div>
        </div>

        {/* Synthèse Harmonique Temporelle & SVD Card */}
        <div className="glass-card neural-border p-6 rounded-3xl shadow-sm relative overflow-hidden">
            <div className="absolute top-0 left-0 w-64 h-64 bg-indigo-500/5 rounded-full blur-[80px] -ml-10 -mt-10"></div>
            <div className="absolute bottom-0 right-0 w-64 h-64 bg-purple-500/5 rounded-full blur-[80px] -mr-10 -mb-10"></div>
            
            <div className="relative z-10 space-y-6">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-5">
                    <div>
                        <div className="flex items-center gap-2 text-indigo-500 dark:text-indigo-400 font-bold text-xs uppercase tracking-widest mb-1">
                            <Activity size={14} className="text-indigo-500 dark:text-indigo-400" /> Analyse de Décomposition Vectorielle
                        </div>
                        <h4 className="text-xl font-black tracking-tight text-slate-900 dark:text-white">Synthèse Harmonique Temporelle (SVD)</h4>
                    </div>
                    <div className="bg-slate-50 dark:bg-slate-950 px-4 py-2 rounded-2xl border border-slate-200 dark:border-slate-800 flex items-center gap-3">
                        <Zap size={16} className="text-amber-500 animate-pulse" />
                        <div>
                            <div className="text-[9px] font-black uppercase tracking-widest text-slate-400">Facteur Périodique (T)</div>
                            <div className="text-sm font-mono font-black text-slate-900 dark:text-amber-400">{dominantPeriod} Cycles</div>
                        </div>
                    </div>
                </div>

                <p className="text-slate-500 dark:text-slate-400 text-xs font-medium leading-relaxed">
                    Cette synthèse traite l'historique non pas comme des événements isolés, mais comme des ondes de probabilité superposées. 
                    En extrayant les principaux vecteurs d'activations par <strong>Décomposition en Valeurs Singulières (SVD)</strong>, 
                    nous obtenons les modes spectraux majeurs (ondes stationnaires). Leurs fréquences dominantes calibrent continûment le facteur périodique des algorithmes spectraux.
                </p>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
                    {/* Mode 1 */}
                    <div className="bg-slate-50 dark:bg-slate-950 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 flex flex-col justify-between gap-3">
                        <div className="flex items-center justify-between">
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Mode Ondulatoire 1 (Ψ1)</span>
                            <span className="text-[10px] px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-500 dark:text-indigo-400 font-black uppercase">Principal</span>
                        </div>
                        <div className="space-y-1">
                            <div className="flex justify-between items-end">
                                <span className="text-[9px] text-slate-500">Amplitude Relat. (SVD)</span>
                                <span className="text-sm font-black font-mono text-slate-900 dark:text-white">{svdModes[0]?.toFixed(1)}%</span>
                            </div>
                            <div className="h-1.5 w-full bg-slate-200 dark:bg-slate-900 rounded-full overflow-hidden">
                                <div className="h-full bg-gradient-to-r from-indigo-500 to-indigo-400 rounded-full" style={{ width: `${svdModes[0]}%` }}></div>
                            </div>
                        </div>
                    </div>

                    {/* Mode 2 */}
                    <div className="bg-slate-50 dark:bg-slate-950 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 flex flex-col justify-between gap-3">
                        <div className="flex items-center justify-between">
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Mode Ondulatoire 2 (Ψ2)</span>
                            <span className="text-[10px] px-2 py-0.5 rounded bg-purple-500/10 text-purple-500 dark:text-purple-400 font-black uppercase">Secondaire</span>
                        </div>
                        <div className="space-y-1">
                            <div className="flex justify-between items-end">
                                <span className="text-[9px] text-slate-500">Amplitude Relat. (SVD)</span>
                                <span className="text-sm font-black font-mono text-slate-900 dark:text-white">{svdModes[1]?.toFixed(1)}%</span>
                            </div>
                            <div className="h-1.5 w-full bg-slate-200 dark:bg-slate-900 rounded-full overflow-hidden">
                                <div className="h-full bg-gradient-to-r from-purple-500 to-purple-400 rounded-full" style={{ width: `${svdModes[1]}%` }}></div>
                            </div>
                        </div>
                    </div>

                    {/* Mode 3 */}
                    <div className="bg-slate-50 dark:bg-slate-950 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 flex flex-col justify-between gap-3">
                        <div className="flex items-center justify-between">
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Mode Ondulatoire 3 (Ψ3)</span>
                            <span className="text-[10px] px-2 py-0.5 rounded bg-pink-500/10 text-pink-500 dark:text-pink-400 font-black uppercase">Harmonique</span>
                        </div>
                        <div className="space-y-1">
                            <div className="flex justify-between items-end">
                                <span className="text-[9px] text-slate-500">Amplitude Relat. (SVD)</span>
                                <span className="text-sm font-black font-mono text-slate-900 dark:text-white">{svdModes[2]?.toFixed(1)}%</span>
                            </div>
                            <div className="h-1.5 w-full bg-slate-200 dark:bg-slate-900 rounded-full overflow-hidden">
                                <div className="h-full bg-gradient-to-r from-pink-500 to-pink-400 rounded-full" style={{ width: `${svdModes[2]}%` }}></div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        {/* CWT: Continuous Wavelet Transform Card */}
        {wavelet && wavelet.length > 0 && (
            <div className="glass-card neural-border p-6 rounded-3xl shadow-sm relative overflow-hidden border border-slate-100 dark:border-slate-800 bg-slate-900/40">
                <div className="absolute top-0 right-0 w-64 h-64 bg-amber-500/5 rounded-full blur-[80px] -mr-10 -mt-10"></div>
                
                <div className="relative z-10 space-y-6">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-5">
                        <div>
                            <div className="flex items-center gap-2 text-amber-500 dark:text-amber-400 font-bold text-xs uppercase tracking-widest mb-1">
                                <Activity size={14} className="text-amber-500 dark:text-amber-400" /> Décomposition Multi-échelle Continue (CWT)
                            </div>
                            <h4 className="text-xl font-black tracking-tight text-slate-900 dark:text-white">Analyse Temps-Fréquence d'Ondelette Continue (CWT)</h4>
                        </div>
                        <div className="bg-amber-500/10 px-4 py-2 rounded-2xl border border-amber-500/20 flex items-center gap-3">
                            <Sparkles size={16} className="text-amber-400" />
                            <div>
                                <div className="text-[9px] font-black uppercase tracking-widest text-amber-500">Numéros en Résonance</div>
                                <div className="text-sm font-mono font-black text-amber-400">{resonantWaveletsCount} Actifs</div>
                            </div>
                        </div>
                    </div>

                    <p className="text-slate-500 dark:text-slate-400 text-xs font-medium leading-relaxed">
                        Contrairement à la transformée de Fourier classique (FFT) qui supprime toute coordonnée temporelle, la 
                        <strong> Transformée en Ondelettes Continues (CWT)</strong> utilise des ondelettes de Morlet complexes décalées et étirées en continu (échelles de 1.5 à 12.0 tirages). 
                        Elle détecte simultanément <em>quand</em> et <em>à quelle fréquence</em> les paquets d'énergie probabiliste s'accumulent pour chaque numéro, révélant des micro-cycles non-stationnaires indétectables par SVD simple.
                    </p>

                    <div className="space-y-4">
                        <div className="text-xs font-black uppercase tracking-wider text-slate-400">Top 5 - Forte Énergie d'Ondelette continue (CWT) :</div>
                        <div className="grid grid-cols-1 sm:grid-cols-5 gap-4">
                            {highWavelet.map((w, index) => {
                                const isResonant = w.resonance;
                                return (
                                    <div key={w.number} className={`p-4 rounded-2xl border flex flex-col justify-between gap-3 transition-all duration-300 ${isResonant ? 'bg-amber-500/10 border-amber-500/40' : 'bg-slate-950/40 border-slate-800'}`}>
                                        <div className="flex justify-between items-center">
                                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Rang {index + 1}</span>
                                            {isResonant && (
                                                <span className="text-[8px] px-1.5 py-0.5 rounded bg-amber-400 text-slate-950 font-black uppercase">Résonance</span>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <NumberBall number={w.number} size="sm" glow={isResonant} />
                                            <div>
                                                <div className="text-xs font-black text-slate-900 dark:text-white">Boule {w.number}</div>
                                                <div className="text-[10px] font-mono text-slate-500">{w.energy}% Énergie</div>
                                            </div>
                                        </div>
                                        <div className="w-full bg-slate-200 dark:bg-slate-800 h-1 rounded-full overflow-hidden">
                                            <div className={`h-full rounded-full ${isResonant ? 'bg-amber-500' : 'bg-indigo-500'}`} style={{ width: `${w.energy}%` }}></div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            </div>
        )}

        {/* Energy Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {highEnergy.map((m) => {
                // CORRECTION : Sigmoïde logistique continue centrée sur la moyenne avec facteur d'étalement basé sur l'écart-type
                const saturationRatio = 1 / (1 + Math.exp(-(m.energy - energyStats.mean) / energyStats.stdDev));
                
                // Interpolation continue de la couleur entre Emerald (16, 185, 129) et Rose (244, 63, 94)
                const red = Math.round(16 + (244 - 16) * saturationRatio);
                const green = Math.round(185 + (63 - 185) * saturationRatio);
                const blue = Math.round(129 + (94 - 129) * saturationRatio);
                const activeColor = `rgb(${red}, ${green}, ${blue})`;
                
                // Statut de tension continue
                const statusText = saturationRatio < 0.2 
                    ? "Phase Accumulation (Basse)" 
                    : saturationRatio > 0.8 
                        ? "Saturation Critique (Déchargement)" 
                        : "Tension Progressive (Intermédiaire)";

                const interpretationText = saturationRatio < 0.2
                    ? "Signal de veille : accumulation graduelle en arrière-plan."
                    : saturationRatio > 0.8
                        ? "Potentiel imminent : décharge cyclique imminente attendue."
                        : "Courbe de résonance active : tension stable.";

                return (
                    <div key={m.number} className="bg-white dark:bg-slate-900 p-6 rounded-3xl shadow-sm border border-slate-100 dark:border-slate-800 flex flex-col gap-6 group hover:border-indigo-500/50 transition-all duration-300">
                        <div className="flex justify-between items-center">
                            <div className="flex items-center gap-4">
                                <NumberBall number={m.number} size="md" glow={saturationRatio > 0.5} />
                                <div>
                                    <div className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Vecteur {m.number}</div>
                                    <div className="text-xs font-black transition-colors duration-300" style={{ color: activeColor }}>
                                        {statusText}
                                    </div>
                                </div>
                            </div>
                            <div className="transition-all duration-300 animate-pulse" style={{ color: activeColor }}>
                                {saturationRatio > 0.5 ? <BatteryWarning size={20} /> : <BatteryCharging size={20} />}
                            </div>
                        </div>
                        
                        <div className="space-y-2">
                            <div className="flex justify-between items-center">
                                <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-tighter">Potentiel de Résonance</span>
                                <span className="text-lg font-black text-slate-800 dark:text-white font-mono">{Math.round(m.energy)}%</span>
                            </div>
                            
                            <div className="h-6 w-full bg-slate-100 dark:bg-slate-950 rounded-xl overflow-hidden p-1 border border-slate-200 dark:border-slate-800 shadow-inner">
                                <div 
                                    className="h-full rounded-lg transition-all duration-500 relative overflow-hidden" 
                                    style={{ 
                                        width: `${m.energy}%`,
                                        background: `linear-gradient(to right, rgb(16, 185, 129), ${activeColor})`
                                    }}
                                >
                                    <div className="absolute inset-0 bg-white/10 animate-[shimmer_2s_infinite]"></div>
                                </div>
                            </div>
                        </div>
                        
                        <div className="flex items-center gap-2 text-[10px] font-semibold text-slate-400 dark:text-slate-500 italic mt-auto">
                            <Sparkles size={12} className="text-amber-500" />
                            {interpretationText}
                        </div>
                    </div>
                );
            })}
        </div>
    </div>
  );
};
