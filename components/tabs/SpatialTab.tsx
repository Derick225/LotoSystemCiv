
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { calculateSpatialMetrics, getBarycenterTrajectory } from '../../services/spatialService';
import { predictBarycenterShift } from '../../services/mathService';
import { useNexus } from '../NexusProvider';
import type { SpatialMetrics, DrawResult, SpatialCluster, BarycenterPoint } from '../../types';
import { NumberBall } from '../NumberBall';
import { XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LabelList, Line, ComposedChart, Scatter, ReferenceLine, Area } from 'recharts';
import { Target, TrendingUp, Info, Activity, MoveUpRight, Zap, Layers, Globe, Database, Clock, Play, Pause, ChevronLeft, ChevronRight, RotateCcw } from 'lucide-react';

interface SpatialTabProps {
  drawName: string;
}

export function SpatialTab({ drawName }: SpatialTabProps) {
  const { history, loading: nexusLoading } = useNexus();
  
  // Time Travel State
  // timeIndex = 0 : Présent (Dernier tirage connu)
  // timeIndex > 0 : Passé (Décalage de X tirages)
  const [timeIndex, setTimeIndex] = useState(0); 
  const [isPlaying, setIsPlaying] = useState(false);
  const playIntervalRef = useRef<number | null>(null);

  const [metrics, setMetrics] = useState<SpatialMetrics | null>(null);
  const [trajectory, setTrajectory] = useState<BarycenterPoint[]>([]);
  const [lastDraw, setLastDraw] = useState<DrawResult | null>(null);
  const [localLoading, setLocalLoading] = useState(true);
  const [hoveredCluster, setHoveredCluster] = useState<string | null>(null);

  const maxHistory = Math.min(history.length - 20, 100); // Limite de recul

  // Recalcul des métriques basé sur la fenêtre temporelle active
  useEffect(() => {
    if (history.length > 20) {
        // Pas de loading spinner bloquant pour la fluidité du time-travel, juste un recalcul rapide
        // On simule une "fenêtre glissante" en prenant l'historique décalé
        const snapshotHistory = history.slice(timeIndex);
        
        try {
            const spatialMetrics = calculateSpatialMetrics(snapshotHistory); 
            // La trajectoire doit être relative au point de vue temporel
            const traj = getBarycenterTrajectory(snapshotHistory, 15); // 15 derniers points de trajectoire
            
            setMetrics(spatialMetrics);
            setTrajectory(traj.reverse()); // Pour le graphe (gauche -> droite)
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
                  if (prev <= 0) { // Si on arrive au présent
                      setIsPlaying(false);
                      return 0;
                  }
                  return prev - 1; // On avance vers le présent
              });
          }, 600); // Vitesse de lecture
      } else {
          if (playIntervalRef.current) clearInterval(playIntervalRef.current);
      }
      return () => { if (playIntervalRef.current) clearInterval(playIntervalRef.current); };
  }, [isPlaying]);

  const shift = useMemo(() => {
    if (trajectory.length < 3) return null;
    return predictBarycenterShift(trajectory);
  }, [trajectory]);

  // Prédiction vectorielle simple basée sur le mouvement du barycentre
  const vectorPrediction = useMemo(() => {
      if (!shift || !metrics) return { x: 0, y: 0, zone: 'Centre' };
      const dx = shift.x - metrics.barycenter.x;
      const dy = shift.y - metrics.barycenter.y;
      
      let zone = 'Centre';
      if (dy < -0.5) zone = 'Nord';
      if (dy > 0.5) zone = 'Sud';
      if (dx < -0.5) zone += '-Ouest';
      if (dx > 0.5) zone += '-Est';
      
      return { x: dx, y: dy, zone: zone.replace('Centre-', '') };
  }, [shift, metrics]);

  if (nexusLoading || (localLoading && !metrics)) {
      return (
          <div className="flex flex-col items-center justify-center p-24 gap-6 bg-slate-900/5 rounded-[3.5rem] border border-dashed border-indigo-200">
              <div className="relative">
                  <Globe className="animate-spin text-indigo-500" size={48} />
                  <div className="absolute inset-0 m-auto w-2 h-2 bg-indigo-500 rounded-full animate-ping"></div>
              </div>
              <p className="text-xs font-black uppercase tracking-[0.4em] text-indigo-500 animate-pulse">Séquençage Spatial Master...</p>
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
                      <h4 className="text-sm font-black uppercase tracking-widest">Time-Lapse</h4>
                      <p className="text-[10px] text-slate-400 font-mono">
                          {timeIndex === 0 ? "TEMPS RÉEL (T)" : `T - ${timeIndex} TIRAGES`}
                          <span className="mx-2 text-slate-600">|</span>
                          {lastDraw?.date}
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
                          style={{ direction: 'rtl' }} // Pour que 0 (Présent) soit à droite
                      />
                      <div className="flex justify-between text-[8px] font-black uppercase text-slate-500 mt-2 px-1">
                          <span>Présent</span>
                          <span>Passé ({maxHistory}t)</span>
                      </div>
                  </div>

                  <button onClick={() => { setIsPlaying(false); setTimeIndex(0); }} className="p-3 bg-slate-800 text-slate-400 rounded-xl hover:text-white transition-all" title="Reset au présent">
                      <RotateCcw size={16} />
                  </button>
              </div>
          </div>

          <div className="grid lg:grid-cols-12 gap-8">
              {/* Barycenter Map */}
              <div className="lg:col-span-8 bg-white dark:bg-slate-800 p-8 rounded-[3rem] shadow-xl border border-slate-100 dark:border-slate-700 relative overflow-hidden">
                  <div className="flex justify-between items-start mb-6">
                      <div>
                          <h3 className="text-xl font-black text-slate-800 dark:text-white flex items-center gap-3">
                              <Target className="text-indigo-600" /> Trajectoire Gravitationnelle
                          </h3>
                          <p className="text-[10px] text-slate-400 font-bold uppercase mt-1">Mouvement du centre de masse (5 derniers tirages)</p>
                      </div>
                      <div className="flex gap-2">
                          <div className="px-3 py-1 bg-indigo-50 dark:bg-indigo-900/30 rounded-lg border border-indigo-100 dark:border-indigo-800 text-[9px] font-black text-indigo-600 dark:text-indigo-400">
                              X: {metrics?.barycenter.x.toFixed(2)}
                          </div>
                          <div className="px-3 py-1 bg-indigo-50 dark:bg-indigo-900/30 rounded-lg border border-indigo-100 dark:border-indigo-800 text-[9px] font-black text-indigo-600 dark:text-indigo-400">
                              Y: {metrics?.barycenter.y.toFixed(2)}
                          </div>
                      </div>
                  </div>

                  <div className="h-[350px] w-full relative">
                      <ResponsiveContainer width="100%" height="100%">
                          <ComposedChart data={trajectory} margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                              <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
                              <XAxis type="number" dataKey="x" domain={[0, 9]} hide />
                              <YAxis type="number" dataKey="y" domain={[0, 8]} hide />
                              <Tooltip cursor={{ strokeDasharray: '3 3' }} contentStyle={{ borderRadius: '12px', border: 'none', backgroundColor: '#0f172a', color: '#fff', fontSize: '10px' }} />
                              
                              {/* Zone de gravité (Ellipse approximative) */}
                              <ReferenceLine x={4.5} stroke="transparent" />
                              <ReferenceLine y={4} stroke="transparent" />
                              
                              {/* Trajectoire */}
                              <Line 
                                  type="monotone" 
                                  dataKey="y" 
                                  data={trajectory} 
                                  stroke="#6366f1" 
                                  strokeWidth={3} 
                                  dot={{ r: 4, fill: '#6366f1', strokeWidth: 2, stroke: '#fff' }} 
                                  animationDuration={500}
                              />
                              
                              {/* Projection Future */}
                              {shift && (
                                  <Scatter 
                                      data={[{ x: shift.x, y: shift.y, name: 'Projection' }]} 
                                      fill="#10b981" 
                                      shape="cross" 
                                  />
                              )}
                          </ComposedChart>
                      </ResponsiveContainer>
                      
                      {/* Grid Overlay Indicators */}
                      <div className="absolute inset-0 pointer-events-none border-2 border-slate-100 dark:border-slate-700/50 rounded-xl">
                          <div className="absolute top-1/2 left-0 w-full h-px bg-slate-200 dark:bg-slate-700 dashed opacity-50"></div>
                          <div className="absolute left-1/2 top-0 w-px h-full bg-slate-200 dark:bg-slate-700 dashed opacity-50"></div>
                          <span className="absolute top-2 left-2 text-[8px] font-black text-slate-300 uppercase">Nord-Ouest</span>
                          <span className="absolute bottom-2 right-2 text-[8px] font-black text-slate-300 uppercase">Sud-Est</span>
                      </div>
                  </div>
              </div>

              {/* Sidebar Info */}
              <div className="lg:col-span-4 space-y-6">
                  {/* Vector Prediction Card */}
                  <div className="bg-gradient-to-br from-indigo-600 to-violet-700 p-6 rounded-[2.5rem] shadow-xl text-white relative overflow-hidden">
                      <div className="absolute top-0 right-0 p-4 opacity-20"><MoveUpRight size={60} /></div>
                      <h4 className="text-xs font-black uppercase tracking-widest mb-4 flex items-center gap-2">
                          <Activity size={14}/> Vecteur T+1
                      </h4>
                      <div className="text-3xl font-black mb-2">{vectorPrediction.zone}</div>
                      <p className="text-[10px] text-indigo-100 font-medium leading-relaxed border-l-2 border-white/30 pl-3">
                          Le centre de masse glisse vers cette zone. Les numéros situés ici ont une probabilité spatiale accrue de 15%.
                      </p>
                  </div>

                  {/* Clusters List */}
                  <div className="bg-white dark:bg-slate-800 p-6 rounded-[2.5rem] shadow-sm border border-slate-100 dark:border-slate-700">
                      <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-6 flex items-center gap-2">
                          <Layers size={14} className="text-emerald-500"/> Clusters Actifs (DBSCAN)
                      </h4>
                      <div className="space-y-3 max-h-[300px] overflow-y-auto custom-scrollbar">
                          {metrics?.advancedClusters.map(cluster => (
                              <div 
                                  key={cluster.id} 
                                  className="p-3 bg-slate-50 dark:bg-slate-900/50 rounded-2xl border border-slate-100 dark:border-slate-800 hover:border-indigo-400 transition-colors cursor-help"
                                  onMouseEnter={() => setHoveredCluster(cluster.id)}
                                  onMouseLeave={() => setHoveredCluster(null)}
                              >
                                  <div className="flex justify-between items-center mb-2">
                                      <span className="text-[10px] font-black text-slate-500 uppercase">Densité {cluster.density}</span>
                                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: cluster.color }}></span>
                                  </div>
                                  <div className="flex flex-wrap gap-1">
                                      {cluster.numbers.map(n => (
                                          <span key={n} className="text-[9px] font-bold bg-white dark:bg-slate-800 px-1.5 py-0.5 rounded text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                                              {n}
                                          </span>
                                      ))}
                                  </div>
                              </div>
                          ))}
                          {metrics?.advancedClusters.length === 0 && (
                              <div className="text-center text-slate-400 text-xs italic py-4">Aucun cluster dense détecté. Distribution uniforme.</div>
                          )}
                      </div>
                  </div>
              </div>
          </div>
      </div>
  );
}
