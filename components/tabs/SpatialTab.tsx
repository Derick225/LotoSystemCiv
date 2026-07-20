import React, { useState, useEffect, useMemo, useRef } from 'react';
import { calculateSpatialMetrics, getBarycenterTrajectory } from '../../services/spatialService';
import { predictBarycenterShift } from '../../services/mathService';
import { useNexusStore } from '../../store/useNexusStore';
import type { SpatialMetrics, DrawResult, BarycenterPoint } from '../../types';
import { 
    Layers, Globe, Clock, Play, Pause, RotateCcw, Compass, 
    Map as MapIcon, Navigation, TrendingUp, Sparkles, Anchor, Radar, Activity 
} from 'lucide-react';
import { audioEngine } from '../../utils/audioEngine';

interface SpatialTabProps {
  drawName: string;
}

// Composant Boussole Visuelle
const GravityCompass: React.FC<{ vector: { x: number, y: number, angle: number, zone: string } }> = ({ vector }) => {
    return (
        <div className="relative w-40 h-40 flex items-center justify-center bg-slate-900 rounded-full border-4 border-slate-800 shadow-inner">
            {/* Cadran */}
            <div className="absolute inset-2 border border-slate-700/50 rounded-full"></div>
            <div className="absolute top-2 text-[10px] font-black text-slate-500">N</div>
            <div className="absolute bottom-2 text-[10px] font-black text-slate-500">S</div>
            <div className="absolute left-2 text-[10px] font-black text-slate-500">O</div>
            <div className="absolute right-2 text-[10px] font-black text-slate-500">E</div>
            
            {/* Aiguille */}
            <div 
                className="absolute w-1 h-16 bg-gradient-to-t from-indigo-500 to-rose-500 origin-bottom rounded-full shadow-lg transition-transform duration-500 ease-out"
                style={{ transform: `rotate(${vector.angle}deg) translateY(-50%)` }}
            >
                <div className="absolute -top-1 -left-1.5 w-4 h-4 bg-rose-500 rounded-full flex items-center justify-center shadow-lg">
                    <div className="w-1.5 h-1.5 bg-white rounded-full"></div>
                </div>
            </div>
            
            {/* Centre */}
            <div className="absolute w-4 h-4 bg-slate-200 rounded-full border-2 border-slate-900 z-10"></div>
        </div>
    );
};

export function SpatialTab({ drawName }: SpatialTabProps) {
  const history = useNexusStore(state => state.history);
  const nexusLoading = useNexusStore(state => state.loading);
  
  // Time Travel State (0 = Présent)
  const [timeIndex, setTimeIndex] = useState(0); 
  const [isPlaying, setIsPlaying] = useState(false);
  const playIntervalRef = useRef<number | null>(null);
  
  // Dual tabular exploration for Dense clusters and Newtonian fields
  const [sideTab, setSideTab] = useState<'clusters' | 'wells'>('clusters');

  const [metrics, setMetrics] = useState<SpatialMetrics | null>(null);
  const [trajectory, setTrajectory] = useState<BarycenterPoint[]>([]);
  const [lastDraw, setLastDraw] = useState<DrawResult | null>(null);
  const [localLoading, setLocalLoading] = useState(true);

  const maxHistory = Math.min(history.length - 20, 100); 

  // Recalcul des métriques basé sur la fenêtre temporelle active
  useEffect(() => {
    if (history.length > 20) {
        // Fenêtre glissante virtuelle sur l'historique
        const snapshotHistory = history.slice(timeIndex);
        
        try {
            const spatialMetrics = calculateSpatialMetrics(snapshotHistory); 
            const traj = getBarycenterTrajectory(snapshotHistory, 15); 
            
            setMetrics(spatialMetrics);
            setTrajectory(traj.reverse());
            setLastDraw(snapshotHistory[0]);
        } catch(e) {
            console.error(e);
        } finally {
            setLocalLoading(false);
        }
    }
  }, [history, timeIndex]);

  // Player Logic
  useEffect(() => {
      if (isPlaying) {
          playIntervalRef.current = window.setInterval(() => {
              setTimeIndex(prev => {
                  if (prev <= 0) { 
                      setIsPlaying(false);
                      return 0;
                  }
                  return prev - 1; 
              });
          }, 300); 
      } else {
          if (playIntervalRef.current) clearInterval(playIntervalRef.current);
      }
      return () => { if (playIntervalRef.current) clearInterval(playIntervalRef.current); };
  }, [isPlaying]);

  const shift = useMemo(() => {
    if (trajectory.length < 3) return null;
    return predictBarycenterShift(trajectory);
  }, [trajectory]);

  const vectorPrediction = useMemo(() => {
      if (!shift || !metrics) return { x: 0, y: 0, angle: 0, zone: 'Centre' };
      const dx = shift.x - metrics.barycenter.x;
      const dy = shift.y - metrics.barycenter.y;
      
      // Calcul de l'angle pour la boussole (en degrés, 0 = Nord)
      let angle = (Math.atan2(dy, dx) * 180) / Math.PI;
      angle = angle + 90; // Rotation pour aligner 0 au Nord

      let zone = 'Centre';
      if (dy < -0.5) zone = 'Nord'; // Vers les petits nombres (haut de grille)
      if (dy > 0.5) zone = 'Sud';   // Vers les grands nombres (bas de grille)
      if (dx < -0.5) zone += '-Ouest'; // Vers la gauche
      if (dx > 0.5) zone += '-Est';    // Vers la droite
      
      return { x: dx, y: dy, angle, zone: zone.replace('Centre-', '') };
  }, [shift, metrics]);

  // Helper pour colorer la grille 1-90
  const getCellIntensity = (num: number) => {
      if (!metrics) return 0;
      // On utilise la densité de grille calculée par le service spatial
      // gridDensity est un tableau où l'index = le numéro
      const density = metrics.gridDensity[num] || 0;
      // Normalisation (0 à 1) basée sur le max trouvé
      const maxD = Math.max(...metrics.gridDensity);
      return maxD > 0 ? density / maxD : 0;
  };

  if (nexusLoading || (localLoading && !metrics)) {
      return (
          <div className="flex flex-col items-center justify-center p-24 gap-6 bg-slate-900/5 rounded-3xl border border-dashed border-indigo-200 animate-pulse">
              <Globe className="animate-spin text-indigo-500" size={48} />
              <p className="text-xs font-black uppercase tracking-[0.4em] text-indigo-500">Triangulation GPS...</p>
          </div>
      );
  }

  return (
      <div className="space-y-8 animate-fade-in pb-20">
          
          {/* Time Travel Controls */}
          <div className="bg-slate-900 text-white p-4 md:p-6 rounded-2xl shadow-xl border border-slate-800 flex flex-col md:flex-row items-center gap-4 md:gap-6">
              <div className="flex items-center gap-4 w-full md:w-auto">
                  <div className="p-3 bg-indigo-600 rounded-2xl shadow-lg shadow-indigo-600/30">
                      <Clock size={20} className={isPlaying ? "animate-spin" : ""} />
                  </div>
                  <div>
                      <h4 className="text-sm font-black uppercase tracking-widest">Replay Historique</h4>
                      <p className="text-[10px] text-slate-400 font-medium">
                          {timeIndex === 0 ? "TEMPS RÉEL" : `Recul de ${timeIndex} tirages`}
                      </p>
                  </div>
              </div>

              <div className="flex-1 w-full flex items-center gap-4">
                  <button 
                      onClick={() => { audioEngine.play('click'); setIsPlaying(!isPlaying); }}
                      className={`p-3 rounded-xl transition-all ${isPlaying ? 'bg-amber-500 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}
                  >
                      {isPlaying ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}
                  </button>
                  
                  <div className="flex-1 relative group">
                      <input 
                          type="range" 
                          min="0" 
                          max={maxHistory} 
                          step="1" 
                          value={timeIndex}
                          onChange={(e) => { setIsPlaying(false); setTimeIndex(Number(e.target.value)); }}
                          className="w-full h-2 bg-slate-800 rounded-full appearance-none cursor-pointer accent-indigo-500 dir-rtl"
                          style={{ direction: 'rtl' }} 
                      />
                  </div>

                  <button onClick={() => { audioEngine.play('click'); setIsPlaying(false); setTimeIndex(0); }} className="p-3 bg-slate-800 text-slate-400 rounded-xl hover:text-white transition-all" title="Retour au présent">
                      <RotateCcw size={16} />
                  </button>
              </div>
          </div>

          <div className="grid lg:grid-cols-12 gap-8">
              
              {/* Carte Thermique 1-90 (Heatmap Grid) & Trajectoire */}
              <div className="lg:col-span-8 space-y-8">
                  {/* Heatmap Card */}
                  <div className="bg-white dark:bg-slate-800 p-6 md:p-8 rounded-3xl shadow-xl border border-slate-100 dark:border-slate-700 relative overflow-hidden">
                      <div className="flex flex-col sm:flex-row sm:justify-between items-start sm:items-center gap-4 mb-6 px-2">
                          <h3 className="text-lg sm:text-xl font-black text-slate-800 dark:text-white flex items-center gap-3">
                              <MapIcon className="text-indigo-600 dark:text-indigo-400 shrink-0" /> Carte des Impacts
                          </h3>
                          <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-[10px] sm:text-xs font-bold text-slate-400 uppercase">
                              <div className="flex items-center gap-1"><span className="w-3 h-3 bg-slate-50 dark:bg-slate-900 rounded-sm border border-slate-100 dark:border-slate-850 shrink-0"></span> Froid</div>
                              <div className="flex items-center gap-1"><span className="w-3 h-3 bg-indigo-100 dark:bg-indigo-900/40 rounded-sm shrink-0"></span> Moyen</div>
                              <div className="flex items-center gap-1"><span className="w-3 h-3 bg-indigo-500 rounded-sm shrink-0"></span> Chaud</div>
                              <div className="flex items-center gap-1"><span className="w-3 h-3 bg-rose-500 rounded-sm shrink-0"></span> Brûlant</div>
                          </div>
                      </div>

                      {/* We extract the gravity well central cell numbers in H0 space */}
                      {(() => {
                          const wellNumbers = metrics?.gravityWells?.map((well: any) => well.y * 10 + well.x + 1) || [];
                          
                          return (
                              <div className="grid grid-cols-10 gap-1 sm:gap-1.5 md:gap-2.5 relative">
                                  {Array.from({length: 90}, (_, i) => i + 1).map(n => {
                                      const intensity = getCellIntensity(n);
                                      const isWell = wellNumbers.includes(n);
                                      const wellObj = metrics?.gravityWells?.find((well: any) => (well.y * 10 + well.x + 1) === n) as any;
                                      
                                      // Continuous logistic/sigmoid scaling for noise filtering and smooth styling
                                      // Centered at 0.4 with an activation slope of 12
                                      const sIntensity = 1 / (1 + Math.exp(-12 * (intensity - 0.4)));
                                      
                                      // Check if there is actual signal above baseline noise (0.01)
                                      const hasSignal = intensity > 0.01;
                                      
                                      // Smooth transition between Indigo (99, 102, 241) and Rose (244, 63, 94)
                                      const r = Math.round(99 + (244 - 99) * sIntensity);
                                      const g = Math.round(102 + (63 - 102) * sIntensity);
                                      const b = Math.round(241 + (94 - 241) * sIntensity);
                                      
                                      // Continuous background opacity and scale
                                      const bgOpacity = 0.15 + 0.85 * sIntensity;
                                      const currentScale = 1 + 0.12 * sIntensity;
                                      const dynamicShadow = sIntensity > 0.5 ? `0 10px 15px -3px rgba(${r}, ${g}, ${b}, ${0.3 * sIntensity})` : 'none';
                                      
                                      // Default fallback class if there is zero signal (quiet state)
                                      const baseClass = hasSignal 
                                          ? "aspect-square rounded-md sm:rounded-xl flex items-center justify-center text-[9px] sm:text-[11px] font-black tracking-tighter transition-all duration-500 relative border" 
                                          : "aspect-square rounded-md sm:rounded-xl flex items-center justify-center text-[9px] sm:text-[11px] font-black tracking-tighter transition-all duration-500 relative bg-slate-50 dark:bg-slate-900 text-slate-400 dark:text-slate-500 border border-slate-100 dark:border-slate-850 scale-100";

                                      const dynamicStyle = hasSignal ? {
                                          backgroundColor: `rgba(${r}, ${g}, ${b}, ${bgOpacity})`,
                                          color: sIntensity > 0.45 ? '#ffffff' : `rgb(${r}, ${g}, ${b})`,
                                          borderColor: `rgba(${r}, ${g}, ${b}, 0.3)`,
                                          transform: `scale(${currentScale})`,
                                          boxShadow: dynamicShadow,
                                          zIndex: sIntensity > 0.5 ? 10 : 1
                                      } : {};

                                      return (
                                          <div 
                                              key={n}
                                              className={baseClass}
                                              style={dynamicStyle}
                                          >
                                              {n}
                                              {isWell && (
                                                  <>
                                                      {/* Gravitational force ring */}
                                                      <span className="absolute inset-0 rounded-xl ring-2 ring-violet-500 ring-offset-2 ring-offset-white dark:ring-offset-slate-900 animate-pulse pointer-events-none z-10" />
                                                      <span 
                                                          className="absolute -top-1 -right-1 w-3 h-3 bg-violet-500 text-white rounded-full flex items-center justify-center text-[7px] font-bold shadow-lg ring-1 ring-white/20 select-none z-20 cursor-help"
                                                          title={`Singularité Newtonienne (${wellObj?.pullForce}% force)`}
                                                      >
                                                          ★
                                                      </span>
                                                  </>
                                              )}
                                          </div>
                                      );
                                  })}

                                  {/* Bounding Box des Clusters (Visualisation) */}
                                  {metrics?.advancedClusters.map((cluster, i) => {
                                      if (cluster.numbers.length < 3) return null;
                                      
                                      // Calculate bounds for grid positioning
                                      let minX = 10, maxX = -1, minY = 10, maxY = -1;
                                      cluster.numbers.forEach(n => {
                                          const idx = n - 1;
                                          const x = idx % 10;
                                          const y = Math.floor(idx / 10);
                                          if(x < minX) minX = x;
                                          if(x > maxX) maxX = x;
                                          if(y < minY) minY = y;
                                          if(y > maxY) maxY = y;
                                      });

                                      return (
                                          <div 
                                              key={`cluster-overlay-${i}`}
                                              className="pointer-events-none rounded-2xl border-2 z-20 absolute transition-all duration-500 hidden sm:block"
                                              style={{
                                                  gridColumnStart: minX + 1,
                                                  gridColumnEnd: maxX + 2,
                                                  gridRowStart: minY + 1,
                                                  gridRowEnd: maxY + 2,
                                                  borderColor: cluster.color,
                                                  boxShadow: `0 0 15px ${cluster.color}40`,
                                                  background: `${cluster.color}05`
                                              }}
                                          >
                                              <div className="absolute -top-3 right-0 bg-slate-950 text-[10px] font-black text-white px-2 py-0.5 rounded-full border shadow-sm" style={{ borderColor: cluster.color, color: cluster.color }}>
                                                  ZONE {i+1}
                                              </div>
                                          </div>
                                      );
                                  })}
                              </div>
                          );
                      })()}
                  </div>

                  {/* Trajectoire Orbitale Card */}
                  <div className="bg-white dark:bg-slate-800 p-6 md:p-8 rounded-3xl shadow-xl border border-slate-100 dark:border-slate-700 relative overflow-hidden">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                          <h3 className="text-xl font-black text-slate-800 dark:text-white flex items-center gap-3">
                              <TrendingUp className="text-indigo-600 dark:text-indigo-400" /> Trajectoire Orbitale du Centride
                          </h3>
                          <div className="text-[10px] font-mono bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-450 px-3 py-1 rounded-full border border-indigo-200/20 uppercase tracking-widest font-black shrink-0">
                              Mouvement : {trajectory.length} Tirages
                          </div>
                      </div>

                      <div className="w-full flex flex-col md:flex-row gap-8 items-center">
                          {/* SVG Plot */}
                          <div className="relative w-full max-w-[380px] aspect-square md:w-[320px] bg-slate-950 rounded-2xl border border-slate-900 p-4 flex items-center justify-center shrink-0">
                              {/* Quadrature references */}
                              <div className="absolute inset-5 grid grid-cols-10 grid-rows-9 pointer-events-none opacity-[0.03]">
                                  {Array.from({ length: 90 }).map((_, i) => (
                                      <div key={i} className="border-t border-l border-white" />
                                  ))}
                              </div>

                              <svg className="w-full h-full p-4 overflow-visible" viewBox="0 0 100 100" preserveAspectRatio="none">
                                  <defs>
                                      <linearGradient id="trajGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                                          <stop offset="0%" stopColor="#818cf8" stopOpacity="0.2" />
                                          <stop offset="100%" stopColor="#ec4899" stopOpacity="0.95" />
                                      </linearGradient>
                                  </defs>
                                  
                                  {/* Coordinate Cartesian Guides */}
                                  <line x1="10" y1="90" x2="90" y2="90" stroke="#334155" strokeWidth="0.8" />
                                  <line x1="10" y1="10" x2="10" y2="90" stroke="#334155" strokeWidth="0.8" />
                                  
                                  {/* Grid axes divisions */}
                                  <line x1="50" y1="10" x2="50" y2="90" stroke="#1e293b" strokeWidth="0.4" strokeDasharray="1.5 2" />
                                  <line x1="10" y1="50" x2="90" y2="50" stroke="#1e293b" strokeWidth="0.4" strokeDasharray="1.5 2" />

                                  {/* Core SVG Path linking historical centroids */}
                                  {trajectory.length >= 2 && (
                                      <path
                                          d={trajectory.map((point, idx) => {
                                              const sx = 10 + (point.x / 9) * 80;
                                              const sy = 90 - (point.y / 8) * 80; // Invert to follow grid standard coords
                                              return `${idx === 0 ? 'M' : 'L'} ${sx} ${sy}`;
                                          }).join(" ")}
                                          fill="none"
                                          stroke="url(#trajGradient)"
                                          strokeWidth="2"
                                          strokeLinecap="round"
                                          strokeLinejoin="round"
                                      />
                                  )}

                                  {/* historical centroid points */}
                                  {trajectory.map((point, idx) => {
                                      const sx = 10 + (point.x / 9) * 80;
                                      const sy = 90 - (point.y / 8) * 80;
                                      const isLastReal = idx === trajectory.length - 1;
                                      return (
                                          <g key={`orbit-node-${idx}`}>
                                              <circle
                                                  cx={sx}
                                                  cy={sy}
                                                  r={isLastReal ? 3.5 : 1.8}
                                                  fill={isLastReal ? "#ec4899" : "#6366f1"}
                                              />
                                              {isLastReal && (
                                                  <circle
                                                      cx={sx}
                                                      cy={sy}
                                                      r="7"
                                                      fill="none"
                                                      stroke="#ec4899"
                                                      strokeWidth="0.6"
                                                      className="animate-ping"
                                                  />
                                              )}
                                          </g>
                                      );
                                  })}

                                  {/* Velocity Trend Projections */}
                                  {shift && trajectory.length > 0 && (() => {
                                      const lastPt = trajectory[trajectory.length - 1];
                                      const lx = 10 + (lastPt.x / 9) * 80;
                                      const ly = 90 - (lastPt.y / 8) * 80;
                                      const px = 10 + (shift.x / 9) * 80;
                                      const py = 90 - (shift.y / 8) * 80;
                                      return (
                                          <g>
                                              <line
                                                  x1={lx}
                                                  y1={ly}
                                                  x2={px}
                                                  y2={py}
                                                  stroke="#10b981"
                                                  strokeWidth="1.5"
                                                  strokeDasharray="2.5 1.5"
                                              />
                                              <circle
                                                  cx={px}
                                                  cy={py}
                                                  r="4.5"
                                                  fill="none"
                                                  stroke="#10b981"
                                                  strokeWidth="1"
                                                  className="animate-pulse"
                                              />
                                              <circle
                                                  cx={px}
                                                  cy={py}
                                                  r="2"
                                                  fill="#10b981"
                                              />
                                          </g>
                                      );
                                  })()}
                              </svg>

                              {/* Corner axes descriptors */}
                              <div className="absolute bottom-2 left-6 text-[8px] font-mono text-slate-500 uppercase tracking-widest leading-none font-bold">
                                  X: Col 1-10 (gauche → droite)
                              </div>
                              <div className="absolute top-2 left-6 text-[8px] font-mono text-slate-500 uppercase tracking-widest leading-none font-bold">
                                  Y: Ligne 1-9 (haut → bas)
                              </div>
                          </div>

                          {/* Orbit details content */}
                          <div className="flex-1 space-y-4 text-left">
                              <div className="p-4 bg-slate-50 dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-850">
                                  <div className="flex items-center gap-2 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2">
                                      <Activity size={12} className="text-indigo-500" /> Analyse Cinématique
                                  </div>
                                  <p className="text-xs text-slate-550 dark:text-slate-400 leading-relaxed font-semibold">
                                      L'orbite du centroid modélise les oscillations spatiales de l'énergie. Le vecteur <span className="text-emerald-500 dark:text-emerald-400 font-bold">H+1 (Prédiction)</span> est calculé de manière continue en atténuant l'historique par une exponentielle de Hurst. L'absence de bifurcation brute préserve la régularité dynamique du paysage d'inférence.
                                  </p>
                              </div>

                              <div className="grid grid-cols-2 gap-4">
                                  <div className="p-4 bg-slate-50 dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-850">
                                      <div className="text-[9px] text-slate-400 dark:text-slate-500 font-black uppercase tracking-wider mb-1">Centroid Présent (H0)</div>
                                      <div className="text-base font-black text-slate-800 dark:text-white font-mono leading-none">
                                          X:{metrics?.barycenter.x.toFixed(2)} Y:{metrics?.barycenter.y.toFixed(2)}
                                      </div>
                                  </div>
                                  <div className="p-4 bg-emerald-500/5 rounded-2xl border border-emerald-500/10">
                                      <div className="text-[9px] text-emerald-400 font-black uppercase tracking-wider mb-1 text-emerald-600 dark:text-emerald-400">Vecteur Projété (H+1)</div>
                                      <div className="text-base font-black text-emerald-500 dark:text-emerald-400 font-mono leading-none">
                                          X:{shift?.x.toFixed(2)} Y:{shift?.y.toFixed(2)}
                                      </div>
                                  </div>
                                </div>
                          </div>
                      </div>
                  </div>
              </div>

              {/* Sidebar Info & Compass */}
              <div className="lg:col-span-4 space-y-8">
                  
                  {/* GPS Card */}
                  <div className="bg-gradient-to-b from-slate-900 to-slate-950 p-8 rounded-3xl shadow-2xl border border-indigo-500/20 text-center relative overflow-hidden">
                      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-indigo-500 via-rose-500 to-indigo-500 animate-shimmer"></div>
                      
                      <h4 className="text-xs font-black uppercase tracking-[0.3em] text-slate-400 mb-6 flex items-center justify-center gap-2">
                          <Compass size={14} className="text-white"/> GPS Prédictif
                      </h4>
                      
                      <div className="flex justify-center mb-6">
                          <GravityCompass vector={vectorPrediction} />
                      </div>

                      <div className="space-y-2">
                          <div className="text-[10px] text-slate-500 uppercase font-bold tracking-widest">Cap Détecté</div>
                          <div className="text-3xl font-black text-white">{vectorPrediction.zone}</div>
                          <div className="inline-block px-3 py-1 bg-white/10 rounded-full text-xs font-black text-indigo-300 border border-white/10 mt-2">
                              Angle {Math.round(vectorPrediction.angle)}°
                          </div>
                      </div>
                  </div>

                  {/* Dual Tabular Side Panels - DBSCAN Clusters & Newtonian Gravity Wells */}
                  <div className="bg-white dark:bg-slate-800 p-4 sm:p-6 md:p-8 rounded-3xl shadow-xl border border-slate-100 dark:border-slate-700 space-y-6">
                      <div className="flex flex-col sm:flex-row bg-slate-100 dark:bg-slate-900 p-1.5 rounded-2xl border border-slate-200 dark:border-slate-800 gap-1 sm:gap-0">
                          <button 
                              type="button"
                              onClick={() => { audioEngine.play('click'); setSideTab('clusters'); }}
                              className={`flex-1 py-2 sm:py-3 text-[9px] sm:text-[10px] whitespace-nowrap font-black uppercase tracking-wider rounded-xl transition-all ${
                                  sideTab === 'clusters' 
                                  ? 'bg-white dark:bg-slate-700 text-slate-800 dark:text-white shadow-lg scale-[1.02] sm:scale-[1.02]' 
                                  : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-400'
                              }`}
                          >
                              Zones denses
                          </button>
                          <button 
                              type="button"
                              onClick={() => { audioEngine.play('click'); setSideTab('wells'); }}
                              className={`flex-1 py-2 sm:py-3 text-[9px] sm:text-[10px] whitespace-nowrap font-black uppercase tracking-wider rounded-xl transition-all ${
                                  sideTab === 'wells' 
                                  ? 'bg-white dark:bg-slate-700 text-slate-800 dark:text-white shadow-lg scale-[1.02] sm:scale-[1.02]' 
                                  : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-400'
                              }`}
                          >
                              Puits de Gravité
                          </button>
                      </div>

                      {sideTab === 'clusters' ? (
                          <div className="space-y-4">
                              <div className="flex items-center justify-between px-1">
                                  <div className="text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">Clusters DBSCAN Actifs</div>
                                  <span className="text-[9px] font-black uppercase bg-indigo-500/10 text-indigo-500 dark:text-indigo-400 px-2.5 py-0.5 rounded-full border border-indigo-500/10">
                                      {metrics?.advancedClusters.length} détectés
                                  </span>
                              </div>
                              <div className="space-y-3 max-h-[280px] overflow-y-auto custom-scrollbar pr-1">
                                  {metrics?.advancedClusters.map((cluster, i) => (
                                      <div 
                                          key={cluster.id} 
                                          className="p-4 bg-slate-50 dark:bg-slate-900/50 rounded-2xl border border-slate-100 dark:border-slate-850 hover:border-indigo-400 dark:hover:border-indigo-500/30 transition-all group"
                                      >
                                          <div className="flex justify-between items-center mb-2.5">
                                              <span className="text-[10px] font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-wide">Zone #{i+1}</span>
                                              <div className="flex gap-1">
                                                  {cluster.numbers.slice(0, 3).map(n => (
                                                      <span key={n} className="w-5 h-5 flex items-center justify-center bg-white dark:bg-slate-800 rounded-full text-[9px] font-black shadow-sm text-slate-700 dark:text-slate-300 border border-slate-150 dark:border-slate-700">{n}</span>
                                                  ))}
                                                  {cluster.numbers.length > 3 && <span className="text-[9px] font-bold text-slate-400 self-center pl-1">+{cluster.numbers.length - 3}</span>}
                                              </div>
                                          </div>
                                          <div className="space-y-1">
                                              <div className="flex justify-between text-[9px] text-slate-400 uppercase font-bold tracking-widest">
                                                  <span>Intensité stochastique</span>
                                                  <span>{cluster.potential}%</span>
                                              </div>
                                              <div className="w-full bg-slate-200 dark:bg-slate-700 h-1 rounded-full overflow-hidden">
                                                  <div className="h-full bg-indigo-500" style={{ width: `${Math.min(100, cluster.potential)}%` }}></div>
                                              </div>
                                          </div>
                                      </div>
                                  ))}
                                  {metrics?.advancedClusters.length === 0 && (
                                      <div className="text-center text-slate-400 text-xs italic py-8 border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl">
                                          Le tirage est dispersé (Aucun regroupement clair).
                                      </div>
                                  )}
                              </div>
                          </div>
                      ) : (
                          <div className="space-y-4">
                              <div className="flex items-center justify-between px-1">
                                  <div className="text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">Champ Newtonien</div>
                                  <span className="text-[9px] font-black uppercase bg-violet-500/10 text-violet-500 dark:text-violet-400 px-2.5 py-0.5 rounded-full border border-violet-500/10">
                                      Top 3 Singularités
                                  </span>
                              </div>
                              <div className="space-y-3 max-h-[280px] overflow-y-auto custom-scrollbar pr-1">
                                  {metrics?.gravityWells?.slice(0, 3).map((well: any, idx: number) => {
                                      const wellNum = well.y * 10 + well.x + 1;
                                      return (
                                          <div 
                                              key={well.id} 
                                              className="p-4 bg-slate-50 dark:bg-slate-900/50 rounded-2xl border border-slate-100 dark:border-slate-850 hover:border-violet-400 dark:hover:border-violet-500/30 transition-all group text-left"
                                          >
                                              <div className="flex items-center justify-between mb-2">
                                                  <div className="flex items-center gap-2">
                                                      <div className="w-5 h-5 rounded-full bg-violet-500/20 text-violet-500 dark:text-violet-400 flex items-center justify-center text-[10px] font-black">
                                                          {idx + 1}
                                                      </div>
                                                      <span className="text-[10px] font-black text-violet-600 dark:text-violet-400 uppercase tracking-wide">Puits #{wellNum}</span>
                                                  </div>
                                                  <span className="text-[9px] text-slate-400 dark:text-slate-500 font-mono font-bold">
                                                      Col: {well.x + 1} • Lig: {well.y + 1}
                                                  </span>
                                              </div>
                                              
                                              <div className="space-y-2">
                                                  <div className="space-y-1">
                                                      <div className="flex justify-between text-[9px] font-bold text-slate-400 uppercase tracking-widest">
                                                          <span>Attraction Newtonienne</span>
                                                          <span className="font-mono">{well.pullForce}%</span>
                                                      </div>
                                                      <div className="w-full bg-slate-200 dark:bg-slate-700 h-1 rounded-full overflow-hidden">
                                                          <div className="h-full bg-violet-500" style={{ width: `${well.pullForce}%` }}></div>
                                                      </div>
                                                  </div>
                                                  
                                                  <div className="flex items-center gap-1.5 pt-1.5 border-t border-slate-100 dark:border-slate-850">
                                                      <span className="text-[8px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-wider">Event horizon :</span>
                                                      <div className="flex gap-1 flex-wrap">
                                                          {well.subordinateNumbers.slice(0, 5).map((sub: number) => (
                                                              <span key={sub} className="text-[9px] font-bold text-slate-500 dark:text-slate-400 bg-white dark:bg-slate-800 px-1 rounded border border-slate-250/20">
                                                                  {sub}
                                                              </span>
                                                          ))}
                                                          {well.subordinateNumbers.length > 5 && (
                                                              <span className="text-[8px] text-slate-400 self-center font-bold pl-0.5">...</span>
                                                          )}
                                                      </div>
                                                  </div>
                                              </div>
                                          </div>
                                      );
                                  })}
                                  {(!metrics?.gravityWells || metrics?.gravityWells?.length === 0) && (
                                      <div className="text-center text-slate-400 text-xs italic py-8 border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl">
                                          Calcul des forces d'attraction en cours...
                                      </div>
                                  )}
                              </div>
                          </div>
                      )}
                  </div>
                  
                  {/* Astuce */}
                  <div className="p-4 bg-indigo-50 dark:bg-indigo-900/20 rounded-3xl border border-indigo-100 dark:border-indigo-800/50 flex gap-3 text-left">
                      <Navigation size={18} className="text-indigo-500 shrink-0 mt-0.5" />
                      <p className="text-[10px] text-indigo-800 dark:text-indigo-250 font-medium leading-relaxed">
                          "Si la boussole pointe vers le <strong>Sud-Est</strong>, privilégiez les numéros élevés (ex: 70-90). Si elle pointe vers le <strong>Nord</strong>, jouez les petits numéros (1-30)."
                      </p>
                  </div>
              </div>
          </div>
      </div>
  );
}