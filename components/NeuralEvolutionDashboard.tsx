import React, { useMemo } from 'react';
import { RLState } from '../types';
import { motion } from 'framer-motion';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { BrainCircuit, TrendingUp, ShieldCheck, Zap } from 'lucide-react';

interface NeuralEvolutionDashboardProps {
    rlState: RLState | null;
    drawName: string;
}

export const NeuralEvolutionDashboard: React.FC<NeuralEvolutionDashboardProps> = ({ rlState, drawName }) => {
    const mockEvolution = useMemo(() => {
        // Simulation d'une courbe d'apprentissage basée sur le totalCorrection
        const pts = [];
        const base = 50;
        const correction = rlState?.totalCorrection || 0;
        
        for (let i = 0; i < 12; i++) {
            pts.push({
                index: i,
                stability: Math.min(100, base + (i * 2) + (correction * 10)),
                learning: 100 - (i * 5)
            });
        }
        return pts;
    }, [rlState]);

    if (!rlState) return null;

    return (
        <div className="bg-slate-900 border border-indigo-500/20 rounded-[3rem] p-8 shadow-2xl relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:scale-110 transition-transform"><BrainCircuit size={120} /></div>
            
            <div className="relative z-10 flex flex-col lg:flex-row gap-10">
                <div className="lg:w-1/3 space-y-6">
                    <div>
                        <div className="flex items-center gap-2 mb-2">
                            <Zap size={16} className="text-amber-400" />
                            <h4 className="text-white font-black text-sm uppercase tracking-widest">Stabilité du Génome</h4>
                        </div>
                        <p className="text-slate-400 text-xs leading-relaxed font-medium">
                            Visualisation de l'ajustement auto-régulé de l'ADN Oracle pour le flux <strong>{drawName}</strong>.
                        </p>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="bg-white/5 p-4 rounded-2xl border border-white/5">
                            <div className="text-[8px] font-black text-slate-500 uppercase mb-1">Learning Rate</div>
                            <div className="text-xl font-black text-indigo-400 font-mono">α {rlState.learningRate.toFixed(3)}</div>
                        </div>
                        <div className="bg-white/5 p-4 rounded-2xl border border-white/5">
                            <div className="text-[8px] font-black text-slate-500 uppercase mb-1">Correction Σ</div>
                            <div className="text-xl font-black text-emerald-400 font-mono">{(rlState.totalCorrection * 100).toFixed(1)}%</div>
                        </div>
                    </div>

                    <div className="p-4 bg-indigo-600/10 rounded-2xl border border-indigo-500/20 flex items-center gap-4">
                        <ShieldCheck className="text-indigo-400" size={24} />
                        <div className="text-left">
                            <div className="text-[10px] font-black text-white uppercase leading-none mb-1">Statut ADN</div>
                            <div className="text-xs font-bold text-indigo-300 uppercase">{rlState.streak > 0 ? 'Synchro Optimale' : 'Calibration Active'}</div>
                        </div>
                    </div>
                </div>

                <div className="flex-1 h-64 bg-black/20 rounded-[2rem] p-4 border border-white/5 shadow-inner relative">
                    <div className="absolute top-4 right-6 flex items-center gap-4 text-[8px] font-black uppercase tracking-widest text-slate-500">
                        <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-indigo-500"></span> Cohérence</span>
                        <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-slate-700"></span> Bruit</span>
                    </div>
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={mockEvolution}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.05} />
                            <Tooltip contentStyle={{ backgroundColor: '#0f172a', border: 'none', borderRadius: '12px', fontSize: '10px' }} />
                            <Line type="monotone" dataKey="stability" stroke="#6366f1" strokeWidth={4} dot={false} animationDuration={2000} />
                            <Line type="monotone" dataKey="learning" stroke="#334155" strokeWidth={2} strokeDasharray="4 4" dot={false} />
                        </LineChart>
                    </ResponsiveContainer>
                </div>
            </div>
        </div>
    );
};