
import React from 'react';
import type { DrawResult } from '../types';
import { analyzeIntraDraw } from '../services/intraDrawService';
import { DrawTopology } from './DrawTopology';
import { TicketXRay } from './TicketXRay';
import { Activity, ShieldCheck, Zap, Info, Binary, Maximize2, AlertTriangle, ChevronRight, Hash, ScanEye, X } from 'lucide-react';

interface DrawExamineProps {
    result: DrawResult;
    onClose: () => void;
}

export const DrawExamine: React.FC<DrawExamineProps> = ({ result, onClose }) => {
    const metrics = analyzeIntraDraw(result);

    const DeviationGauge = ({ label, value, diff, target, unit = "" }: any) => {
        const percent = Math.min(100, Math.max(0, 50 + (diff / target) * 50));
        const color = Math.abs(diff) > (target * 0.3) ? 'bg-orange-500' : 'bg-emerald-500';
        
        return (
            <div className="space-y-2">
                <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-slate-400">
                    <span>{label}</span>
                    <span className={Math.abs(diff) > (target * 0.3) ? 'text-orange-400' : 'text-emerald-400'}>
                        {value}{unit} ({diff > 0 ? '+' : ''}{diff.toFixed(1)})
                    </span>
                </div>
                <div className="h-1.5 w-full bg-slate-700 rounded-full overflow-hidden flex items-center px-0.5">
                    <div 
                        className={`h-0.5 rounded-full ${color} transition-all duration-1000 shadow-[0_0_8px_rgba(255,255,255,0.5)]`}
                        style={{ width: `${percent}%` }}
                    ></div>
                </div>
            </div>
        );
    };

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-950/95 backdrop-blur-xl animate-fade-in">
            <div className="bg-slate-900 w-full max-w-4xl rounded-[3rem] shadow-2xl overflow-hidden border border-slate-800 flex flex-col md:flex-row max-h-[90vh]">
                
                {/* Left Panel: Grid & Topology */}
                <div className="md:w-1/2 p-8 bg-black/20 flex flex-col items-center justify-center border-b md:border-b-0 md:border-r border-slate-800">
                    <div className="text-center mb-8">
                        <div className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.3em] mb-2">Morphologie Spatiale</div>
                        <h3 className="text-2xl font-black text-white">{result.date}</h3>
                    </div>
                    
                    <DrawTopology winners={result.gagnants} machine={result.machine} size="md" />
                    
                    <div className="mt-8 grid grid-cols-2 gap-4 w-full">
                        <div className="bg-slate-800/50 p-4 rounded-2xl border border-slate-700">
                            <div className="text-[9px] font-bold text-slate-500 uppercase mb-1">Écart Interne Max</div>
                            <div className="text-xl font-black text-white">{metrics.maxInternalGap} <span className="text-xs text-slate-500 font-normal">rangs</span></div>
                        </div>
                        <div className="bg-slate-800/50 p-4 rounded-2xl border border-slate-700">
                            <div className="text-[9px] font-bold text-slate-500 uppercase mb-1">Complexité AC</div>
                            <div className="text-xl font-black text-white">{metrics.acValue} <span className="text-xs text-slate-500 font-normal">/ 10</span></div>
                        </div>
                    </div>
                </div>

                {/* Right Panel: Data & Forensic Audit */}
                <div className="md:w-1/2 flex flex-col">
                    <div className="p-8 border-b border-slate-800 flex justify-between items-center">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-indigo-500/20 rounded-xl flex items-center justify-center text-indigo-400">
                                <Binary size={20} />
                            </div>
                            <div>
                                <h4 className="font-black text-white text-lg leading-none">Rapport d'Audit</h4>
                                <p className="text-[10px] text-slate-500 font-mono mt-1">ID: {result.id.slice(0, 12)}</p>
                            </div>
                        </div>
                        <button onClick={onClose} className="p-2 text-slate-500 hover:text-white transition">
                            <X size={24} />
                        </button>
                    </div>

                    <div className="p-8 space-y-8 overflow-y-auto custom-scrollbar flex-1">
                        
                        {/* Rayon-X Integration */}
                        <section>
                            <div className="flex items-center gap-2 mb-4">
                                <ScanEye size={14} className="text-indigo-500"/>
                                <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Rayon-X Structurel</span>
                            </div>
                            <TicketXRay numbers={result.gagnants} score={Math.round((metrics.acValue / 10) * 100)} showTitle={false} />
                        </section>

                        {/* Deviations Section */}
                        <section className="space-y-6">
                            <h5 className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                                <Activity size={12} /> Déviations Stochastiques
                            </h5>
                            <div className="grid gap-6">
                                <DeviationGauge label="Somme Sigma (Σ)" value={metrics.sum} diff={metrics.deviation.sumDiff} target={50} />
                                <DeviationGauge label="Stabilité AC" value={metrics.acValue} diff={metrics.deviation.acDiff} target={4} />
                            </div>
                        </section>

                        {/* Named Patterns Section */}
                        <section className="space-y-4">
                            <h5 className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                                <Zap size={12} /> Signatures de Formes
                            </h5>
                            <div className="space-y-2">
                                {metrics.patterns.length > 0 ? metrics.patterns.map(p => (
                                    <div key={p.id} className="flex items-center gap-4 p-4 bg-indigo-500/5 rounded-2xl border border-indigo-500/10 group hover:bg-indigo-500/10 transition-colors">
                                        <div className={`p-2 rounded-lg ${p.severity === 'high' ? 'bg-red-500/20 text-red-400' : 'bg-indigo-500/20 text-indigo-400'}`}>
                                            <AlertTriangle size={16} />
                                        </div>
                                        <div className="flex-1">
                                            <div className="text-xs font-black text-white">{p.name}</div>
                                            <div className="text-[10px] text-slate-500">{p.description}</div>
                                        </div>
                                        <ChevronRight size={14} className="text-slate-700 group-hover:text-indigo-500" />
                                    </div>
                                )) : (
                                    <div className="p-4 rounded-2xl border border-dashed border-slate-700 text-center">
                                        <p className="text-[10px] text-slate-500 font-bold italic">Tirage à morphologie neutre (Standard).</p>
                                    </div>
                                )}
                            </div>
                        </section>

                        {/* Finales Analysis */}
                        <section className="space-y-4">
                             <h5 className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                                <Hash size={12} /> Distribution des Finales
                            </h5>
                            <div className="flex gap-2">
                                {Object.entries(metrics.finalesCount).map(([f, count]) => (
                                    <div key={f} className={`flex-1 p-2 rounded-xl text-center border transition-all ${count >= 2 ? 'bg-indigo-600 border-indigo-400 text-white' : 'bg-slate-800 border-slate-700 text-slate-500'}`}>
                                        <div className="text-[10px] font-black">F{f}</div>
                                        <div className="text-xs font-bold">x{count}</div>
                                    </div>
                                ))}
                            </div>
                        </section>
                    </div>

                    <div className="p-6 bg-slate-800/30 border-t border-slate-800">
                        <button 
                            onClick={onClose}
                            className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 text-white font-black rounded-2xl shadow-xl transition transform active:scale-95 flex items-center justify-center gap-3"
                        >
                            TERMINER L'INSPECTION
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
