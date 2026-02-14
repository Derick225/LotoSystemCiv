
import React, { useMemo } from 'react';
import { RLState } from '../types';
import { ResponsiveContainer, LineChart, Line, Tooltip, CartesianGrid } from 'recharts';
import { BrainCircuit, ShieldCheck, Zap, Dna } from 'lucide-react';

interface NeuralEvolutionDashboardProps {
    rlState: RLState | null;
    drawName: string;
}

export const NeuralEvolutionDashboard: React.FC<NeuralEvolutionDashboardProps> = ({ rlState, drawName }) => {
    const mockEvolution = useMemo(() => {
        // Simulation d'une courbe d'apprentissage basée sur le totalCorrection pour l'effet visuel
        const pts = [];
        const base = 50;
        const correction = rlState?.totalCorrection || 0;
        
        for (let i = 0; i < 15; i++) {
            // Courbe sigmoïde pour simuler l'apprentissage
            const progress = i / 14;
            const stability = base + (correction * 10 * progress) + (Math.sin(i * 0.5) * 5);
            
            pts.push({
                index: i,
                stability: Math.min(100, Math.max(0, stability)),
                learning: 100 - (progress * 80)
            });
        }
        return pts;
    }, [rlState]);

    if (!rlState) return null;

    return (
        <div className="bg-slate-900 border border-indigo-500/20 rounded-[3rem] p-8 shadow-2xl relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:scale-110 transition-transform"><BrainCircuit size={120} /></div>
            
            <div className="relative z-10 flex flex-col lg:flex-row gap-10 items-center">
                <div className="lg:w-1/3 space-y-8">
                    <div>
                        <div className="flex items-center gap-2 mb-2">
                            <Zap size={16} className="text-amber-400" />
                            <h4 className="text-white font-black text-xs uppercase tracking-[0.3em]">Stabilité du Génome</h4>
                        </div>
                        <h3 className="text-2xl font-black text-white uppercase tracking-tighter">
                             ADN <span className="text-indigo-500">Auto-Régulé</span>
                        </h3>
                        <p className="text-slate-400 text-xs leading-relaxed font-medium mt-2">
                            Visualisation de l'ajustement auto-régulé des poids neuronaux pour le flux <strong>{drawName}</strong>.
                        </p>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="bg-white/5 p-4 rounded-3xl border border-white/5 flex flex-col items-center text-center">
                            <div className="text-[8px] font-black text-slate-500 uppercase mb-1">Learning Rate</div>
                            <div className="text-2xl font-black text-indigo-400 font-mono">α {rlState.learningRate.toFixed(3)}</div>
                        </div>
                        <div className="bg-white/5 p-4 rounded-3xl border border-white/5 flex flex-col items-center text-center">
                            <div className="text-[8px] font-black text-slate-500 uppercase mb-1">Correction Σ</div>
                            <div className="text-2xl font-black text-emerald-400 font-mono">{(rlState.totalCorrection * 100).toFixed(1)}%</div>
                        </div>
                    </div>

                    <div className="p-4 bg-indigo-600/10 rounded-2xl border border-indigo-500/20 flex items-center gap-4">
                        <ShieldCheck className="text-indigo-400" size={24} />
                        <div className="text-left">
                            <div className="text-[10px] font-black text-white uppercase leading-none mb-1">Statut Système</div>
                            <div className="text-xs font-bold text-indigo-300 uppercase">{rlState.streak > 0 ? 'Synchro Optimale' : 'Calibration Active'}</div>
                        </div>
                    </div>
                </div>

                <div className="flex-1 w-full h-64 bg-black/20 rounded-[2.5rem] p-4 border border-white/5 shadow-inner relative overflow-hidden">
                    <div className="absolute top-4 right-6 flex items-center gap-4 text-[8px] font-black uppercase tracking-widest text-slate-500 z-10">
                        <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-indigo-500"></span> Cohérence</span>
                        <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-slate-700"></span> Plasticité</span>
                    </div>
                    
                    {/* Background Grid decorative */}
                    <div className="absolute inset-0 opacity-[0.05] pointer-events-none" style={{ backgroundImage: 'radial-gradient(#fff 1px, transparent 1px)', backgroundSize: '20px 20px' }}></div>

                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={mockEvolution}>
                            <defs>
                                <linearGradient id="lineGrad" x1="0" y1="0" x2="1" y2="0">
                                    <stop offset="0%" stopColor="#6366f1" />
                                    <stop offset="100%" stopColor="#a855f7" />
                                </linearGradient>
                            </defs>
                            <Tooltip cursor={{stroke: 'rgba(255,255,255,0.1)'}} contentStyle={{ backgroundColor: '#0f172a', border: 'none', borderRadius: '12px', fontSize: '10px', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.5)' }} />
                            <Line type="monotone" dataKey="stability" stroke="url(#lineGrad)" strokeWidth={4} dot={false} animationDuration={2000} />
                            <Line type="monotone" dataKey="learning" stroke="#334155" strokeWidth={2} strokeDasharray="4 4" dot={false} />
                        </LineChart>
                    </ResponsiveContainer>
                </div>
            </div>
        </div>
    );
};
