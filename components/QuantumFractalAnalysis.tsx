
import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Zap, Activity, Share2, Target } from 'lucide-react';
import type { Prediction } from '../types';

interface QuantumFractalAnalysisProps {
    prediction: Prediction;
}

export const QuantumFractalAnalysis: React.FC<QuantumFractalAnalysisProps> = ({ prediction }) => {
    const { suggestedNumbers, breakdown } = prediction;

    const analysisData = useMemo(() => {
        return suggestedNumbers.map(n => {
            const b = breakdown[n] || {};
            const entanglement = b.quantum_entanglement || 0;
            const resonance = b.fractal_resonance || 0;
            
            return {
                number: n,
                entanglement,
                resonance,
                total: (entanglement + resonance) / 2
            };
        });
    }, [suggestedNumbers, breakdown]);

    return (
        <div className="bg-slate-900/80 rounded-[2.5rem] border border-white/5 p-8 backdrop-blur-xl shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 right-0 p-8 opacity-10">
                <Share2 size={120} className="text-indigo-500" />
            </div>

            <div className="relative z-10">
                <div className="flex items-center justify-between mb-8">
                    <div>
                        <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] mb-2">Analyse Subatomique</h4>
                        <h3 className="text-2xl font-black text-white uppercase tracking-tighter">Intrication & Résonance</h3>
                    </div>
                    <div className="p-3 bg-indigo-500/20 rounded-2xl text-indigo-400">
                        <Zap size={24} />
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {analysisData.map((data, idx) => (
                        <motion.div 
                            key={data.number}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: idx * 0.1 }}
                            className="bg-slate-800/50 rounded-3xl p-6 border border-white/5 hover:border-indigo-500/30 transition-all group"
                        >
                            <div className="flex items-center justify-between mb-4">
                                <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center text-white font-black text-xl shadow-lg group-hover:scale-110 transition-transform">
                                    {data.number}
                                </div>
                                <div className="text-right">
                                    <div className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Score Global</div>
                                    <div className="text-lg font-black text-indigo-400">{Math.round(data.total)}%</div>
                                </div>
                            </div>

                            <div className="space-y-4">
                                <div>
                                    <div className="flex justify-between text-[9px] font-bold text-slate-400 uppercase mb-1">
                                        <span>Intrication Quantum</span>
                                        <span className="text-emerald-400">{Math.round(data.entanglement)}%</span>
                                    </div>
                                    <div className="h-1.5 w-full bg-slate-700 rounded-full overflow-hidden">
                                        <motion.div 
                                            initial={{ width: 0 }}
                                            animate={{ width: `${data.entanglement}%` }}
                                            className="h-full bg-emerald-500"
                                        />
                                    </div>
                                </div>

                                <div>
                                    <div className="flex justify-between text-[9px] font-bold text-slate-400 uppercase mb-1">
                                        <span>Résonance Fractale</span>
                                        <span className="text-purple-400">{Math.round(data.resonance)}%</span>
                                    </div>
                                    <div className="h-1.5 w-full bg-slate-700 rounded-full overflow-hidden">
                                        <motion.div 
                                            initial={{ width: 0 }}
                                            animate={{ width: `${data.resonance}%` }}
                                            className="h-full bg-purple-500"
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="mt-4 pt-4 border-t border-white/5 flex items-center gap-2 text-[8px] font-black text-slate-500 uppercase tracking-widest">
                                <Activity size={10} className="text-indigo-500" />
                                {data.total > 70 ? 'Forte Cohérence' : data.total > 40 ? 'Signal Stable' : 'Bruit de Fond'}
                            </div>
                        </motion.div>
                    ))}
                </div>

                <div className="mt-8 p-6 bg-indigo-500/5 rounded-3xl border border-indigo-500/10 flex items-start gap-4">
                    <div className="p-2 bg-indigo-500/20 rounded-xl text-indigo-400 shrink-0">
                        <Target size={16} />
                    </div>
                    <p className="text-[10px] text-slate-400 font-medium leading-relaxed italic">
                        L'intrication mesure la corrélation non-linéaire avec le dernier tirage, tandis que la résonance détecte les cycles d'auto-similarité temporelle. Une convergence élevée indique un point de singularité statistique.
                    </p>
                </div>
            </div>
        </div>
    );
};
