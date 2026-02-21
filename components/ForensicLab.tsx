
import React, { useState, useMemo } from 'react';
import { useNexus } from './NexusProvider';
import { ForensicResultAudit } from './ForensicResultAudit';
import { PredictionForensics } from './PredictionForensics';
import { Microscope, ShieldCheck, AlertTriangle, FileText, Search, Fingerprint } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { DrawResult, ForensicReport } from '../types';
import { analyzeForManipulation } from '../services/forensicAuditService';

export const ForensicLab: React.FC = () => {
    const { history, loading } = useNexus();
    const [selectedDraw, setSelectedDraw] = useState<DrawResult | null>(null);
    const [searchQuery, setSearchQuery] = useState('');

    const filteredHistory = useMemo(() => {
        if (!searchQuery) return history.slice(0, 50);
        return history.filter(h => 
            h.drawName.toLowerCase().includes(searchQuery.toLowerCase()) ||
            h.date.includes(searchQuery)
        ).slice(0, 50);
    }, [history, searchQuery]);

    const handleAudit = (draw: DrawResult) => {
        setSelectedDraw(draw);
    };

    if (loading) return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 animate-pulse">
            <Microscope className="text-indigo-500 animate-spin" size={64} />
            <p className="text-xs font-black uppercase tracking-[0.4em] text-slate-400">Initialisation du Labo Forensic...</p>
        </div>
    );

    if (selectedDraw) {
        return (
            <ForensicResultAudit 
                result={selectedDraw} 
                history={history} 
                onBack={() => setSelectedDraw(null)} 
            />
        );
    }

    return (
        <div className="space-y-8 animate-fade-in pb-24 w-full max-w-7xl mx-auto">
            
            {/* Header */}
            <div className="bg-slate-900/50 backdrop-blur-xl p-8 rounded-[3rem] border border-white/5 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-600/10 rounded-full blur-[120px] -mr-32 -mt-32"></div>
                <div className="relative z-10 flex flex-col md:flex-row justify-between items-center gap-8">
                    <div>
                        <div className="flex items-center gap-3 mb-2">
                            <div className="p-2 bg-indigo-500/20 rounded-xl border border-indigo-500/30">
                                <ShieldCheck size={20} className="text-indigo-400" />
                            </div>
                            <h3 className="text-sm font-mono font-bold tracking-[0.2em] text-indigo-300 uppercase">Sécurité & Intégrité</h3>
                        </div>
                        <h2 className="text-3xl md:text-5xl font-black text-white tracking-tighter leading-none">
                            Forensic <span className="text-indigo-500">Lab</span>
                        </h2>
                        <p className="text-slate-400 text-xs md:text-sm font-medium mt-4 max-w-xl leading-relaxed">
                            Analysez l'intégrité structurelle des tirages passés. Détectez les anomalies statistiques, les dérives entropiques et les signatures de manipulation potentielles.
                        </p>
                    </div>
                    
                    <div className="w-full md:w-auto bg-black/30 p-1 rounded-2xl border border-white/10 flex items-center">
                        <Search className="text-slate-500 ml-3" size={18} />
                        <input 
                            type="text" 
                            placeholder="Rechercher un tirage..." 
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="bg-transparent border-none text-white text-xs font-bold px-4 py-3 outline-none w-full md:w-64 placeholder-slate-600"
                        />
                    </div>
                </div>
            </div>

            {/* Grid des Tirages */}
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredHistory.map((draw, index) => {
                    // Analyse rapide pour l'aperçu
                    const quickAudit = analyzeForManipulation(draw.gagnants, history.filter(h => h.id !== draw.id));
                    const isSuspicious = quickAudit.suspicionScore > 50;

                    return (
                        <motion.div 
                            key={draw.id}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: index * 0.05 }}
                            onClick={() => handleAudit(draw)}
                            className={`
                                group cursor-pointer bg-white dark:bg-slate-900 p-6 rounded-[2rem] border transition-all hover:scale-[1.02] hover:shadow-2xl relative overflow-hidden
                                ${isSuspicious ? 'border-rose-500/30 hover:border-rose-500' : 'border-slate-200 dark:border-slate-800 hover:border-indigo-500'}
                            `}
                        >
                            {isSuspicious && (
                                <div className="absolute top-0 right-0 bg-rose-500 text-white text-[9px] font-black uppercase px-3 py-1 rounded-bl-xl">
                                    Anomalie
                                </div>
                            )}

                            <div className="flex justify-between items-start mb-4">
                                <div>
                                    <h4 className="font-black text-slate-800 dark:text-white text-lg">{draw.drawName}</h4>
                                    <p className="text-[10px] font-mono text-slate-500 uppercase tracking-widest">{draw.date}</p>
                                </div>
                                <div className={`p-2 rounded-xl ${isSuspicious ? 'bg-rose-500/10 text-rose-500' : 'bg-slate-100 dark:bg-slate-800 text-slate-400'}`}>
                                    <Fingerprint size={20} />
                                </div>
                            </div>

                            <div className="flex gap-2 mb-6">
                                {draw.gagnants.map(n => (
                                    <span key={n} className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-xs font-black text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
                                        {n}
                                    </span>
                                ))}
                            </div>

                            <div className="flex items-center justify-between pt-4 border-t border-slate-100 dark:border-slate-800">
                                <div className="flex flex-col">
                                    <span className="text-[9px] font-black text-slate-400 uppercase">Score Suspicion</span>
                                    <span className={`text-lg font-black ${isSuspicious ? 'text-rose-500' : 'text-emerald-500'}`}>
                                        {quickAudit.suspicionScore}%
                                    </span>
                                </div>
                                <div className="px-4 py-2 bg-slate-950 text-white rounded-xl text-[10px] font-black uppercase tracking-widest group-hover:bg-indigo-600 transition-colors">
                                    Auditer
                                </div>
                            </div>
                        </motion.div>
                    );
                })}
            </div>
        </div>
    );
};
