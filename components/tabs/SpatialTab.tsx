
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { calculateSpatialMetrics, getBarycenterTrajectory } from '../../services/spatialService';
import { predictBarycenterShift } from '../../services/mathService';
import { useNexus } from '../NexusProvider';
import type { SpatialMetrics, DrawResult, BarycenterPoint } from '../../types';
import { Target, Activity, MoveUpRight, Layers, Globe, Clock, Play, Pause, RotateCcw, Compass, Map as MapIcon, Navigation } from 'lucide-react';

interface SpatialTabProps {
  drawName: string;
}

// Composant Boussole Visuelle
const GravityCompass: React.FC<{ vector: { x: number, y: number, angle: number, zone: string } }> = ({ vector }) => {
    return (
        <div className="relative w-40 h-40 flex items-center justify-center bg-slate-900 rounded-full border-4 border-slate-800 shadow-inner">
            {/* Cadran */}
            <div className="absolute inset-2 border border-slate-700/50 rounded-full"></div>
            <div className="absolute top-2 text-[8px] font-black text-slate-500">N</div>
            <div className="absolute bottom-2 text-[8px] font-black text-slate-500">S</div>
            <div className="absolute left-2 text-[8px] font-black text-slate-500">O</div>
            <div className="absolute right-2 text-[8px] font-black text-slate-500">E</div>
            
            {/* Aiguille */}
            <div 
                className="absolute w-1 h-16 bg-gradient-to-t from-indigo-500 to-rose-500 origin-bottom rounded-full shadow-lg transition-transform duration-1000 ease-out"
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
  const { history, loading: nexusLoading } = useNexus();
  
  // Time Travel State (0 = Présent)
  const [timeIndex, setTimeIndex] = useState(0); 
  const [isPlaying, setIsPlaying] = useState(false);
  const playIntervalRef = useRef<number | null>(null);

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
          <div className="flex flex-col items-center justify-center p-24 gap-6 bg-slate-900/5 rounded-[3.5rem] border border-dashed border-indigo-200 animate-pulse">
              <Globe className="animate-spin text-indigo-500" size={48} />
              <p className="text-xs font-black uppercase tracking-[0.4em] text-indigo-500">Triangulation GPS...</p>
          </div>
      );
  }

  return (
      <div className="space-y-8 animate-fade-in pb-20">
          
          {/* Time Travel Controls */}
          <div className="bg-slate-900 text-white p-6 rounded-[2.5rem] shadow-xl border border-slate-800 flex flex-col md:flex-row items-center gap-6">
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
                      onClick={() => setIsPlaying(!isPlaying)}
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

                  <button onClick={() => { setIsPlaying(false); setTimeIndex(0); }} className="p-3 bg-slate-800 text-slate-400 rounded-xl hover:text-white transition-all" title="Retour au présent">
                      <RotateCcw size={16} />
                  </button>
              </div>
          </div>

          <div className="grid lg:grid-cols-12 gap-8">
              
              {/* Carte Thermique 1-90 (Heatmap Grid) */}
              <div className="lg:col-span-8 bg-white dark:bg-slate-800 p-6 rounded-[3rem] shadow-xl border border-slate-100 dark:border-slate-700 relative overflow-hidden">
                  <div className="flex justify-between items-center mb-6 px-2">
                      <h3 className="text-xl font-black text-slate-800 dark:text-white flex items-center gap-3">
                          <MapIcon className="text-indigo-600" /> Carte des Impacts
                      </h3>
                      <div className="flex items-center gap-2 text-[9px] font-bold text-slate-400 uppercase">
                          <span className="w-3 h-3 bg-slate-100 dark:bg-slate-700 rounded-sm"></span> Froid
                          <span className="w-3 h-3 bg-indigo-500 rounded-sm"></span> Chaud
                          <span className="w-3 h-3 bg-rose-500 rounded-sm"></span> Brûlant
                      </div>
                  </div>

                  <div className="grid grid-cols-10 gap-1 sm:gap-2">
                      {Array.from({length: 90}, (_, i) => i + 1).map(n => {
                          const intensity = getCellIntensity(n);
                          // Couleur dynamique
                          let bg = 'bg-slate-50 dark:bg-slate-900 text-slate-400';
                          let scale = 'scale-100';
                          
                          if (intensity > 0.7) {
                              bg = 'bg-rose-500 text-white shadow-lg shadow-rose-500/30';
                              scale = 'scale-110 z-10';
                          } else if (intensity > 0.4) {
                              bg = 'bg-indigo-500 text-white';
                          } else if (intensity > 0.1) {
                              bg = 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300';
                          }

                          return (
                              <div 
                                  key={n}
                                  className={`aspect-square rounded-lg flex items-center justify-center text-[10px] font-bold transition-all duration-500 ${bg} ${scale}`}
                              >
                                  {n}
                              </div>
                          );
                      })}
                  </div>
                  
                  {/* Bounding Box des Clusters (Visualisation simplifiée) */}
                  {metrics?.advancedClusters.map((cluster, i) => {
                      if (cluster.numbers.length < 3) return null;
                      return null; 
                  })}
              </div>

              {/* Sidebar Info & Compass */}
              <div className="lg:col-span-4 space-y-6">
                  
                  {/* GPS Card */}
                  <div className="bg-gradient-to-b from-slate-900 to-slate-950 p-8 rounded-[3rem] shadow-2xl border border-indigo-500/20 text-center relative overflow-hidden">
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
                          <div className="inline-block px-3 py-1 bg-white/10 rounded-full text-[9px] font-black text-indigo-300 border border-white/10 mt-2">
                              Angle {Math.round(vectorPrediction.angle)}°
                          </div>
                      </div>
                  </div>

                  {/* Clusters List */}
                  <div className="bg-white dark:bg-slate-800 p-6 rounded-[2.5rem] shadow-sm border border-slate-100 dark:border-slate-700">
                      <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-6 flex items-center gap-2">
                          <Layers size={14} className="text-emerald-500"/> Zones denses
                      </h4>
                      <div className="space-y-3 max-h-[300px] overflow-y-auto custom-scrollbar">
                          {metrics?.advancedClusters.slice(0, 4).map((cluster, i) => (
                              <div 
                                  key={cluster.id} 
                                  className="p-4 bg-slate-50 dark:bg-slate-900/50 rounded-2xl border border-slate-100 dark:border-slate-800 hover:border-indigo-400 transition-colors group"
                              >
                                  <div className="flex justify-between items-center mb-2">
                                      <span className="text-[10px] font-black text-indigo-600 dark:text-indigo-400 uppercase">Zone #{i+1}</span>
                                      <div className="flex gap-1">
                                          {cluster.numbers.slice(0, 3).map(n => (
                                              <span key={n} className="w-5 h-5 flex items-center justify-center bg-white dark:bg-slate-800 rounded-full text-[9px] font-bold shadow-sm">{n}</span>
                                          ))}
                                          {cluster.numbers.length > 3 && <span className="text-[9px] text-slate-400 self-center">...</span>}
                                      </div>
                                  </div>
                                  <div className="w-full bg-slate-200 dark:bg-slate-700 h-1 rounded-full overflow-hidden">
                                      <div className="h-full bg-indigo-500" style={{ width: `${Math.min(100, cluster.potential)}%` }}></div>
                                  </div>
                              </div>
                          ))}
                          {metrics?.advancedClusters.length === 0 && (
                              <div className="text-center text-slate-400 text-xs italic py-4">Le tirage est dispersé (Aucun regroupement clair).</div>
                          )}
                      </div>
                  </div>
                  
                  {/* Astuce */}
                  <div className="p-4 bg-indigo-50 dark:bg-indigo-900/20 rounded-3xl border border-indigo-100 dark:border-indigo-800/50 flex gap-3">
                      <Navigation size={18} className="text-indigo-500 shrink-0 mt-1" />
                      <p className="text-[10px] text-indigo-800 dark:text-indigo-200 font-medium leading-relaxed">
                          "Si la boussole pointe vers le <strong>Sud-Est</strong>, privilégiez les numéros élevés (ex: 70-90). Si elle pointe vers le <strong>Nord</strong>, jouez les petits numéros (1-30)."
                      </p>
                  </div>
              </div>
          </div>
      </div>
  );
}
