
import React, { useState, useRef } from 'react';
import { generatePlatinumPrediction, savePlatinumHistory, calculateOptimalUserBias } from '../../services/metaAnalystService';
import { getFusionConfig, saveFusionConfig } from '../../services/userPreferencesService';
import { useNexus } from '../NexusProvider';
import type { PlatinumResult, StrategyBias, PlatinumTimeline } from '../../types';
import { NumberBall } from '../NumberBall';
import { useToast } from '../ui/Toast';
import { TicketXRay } from '../TicketXRay';
import { 
    Brain, ShieldCheck, Zap, RefreshCw, 
    Wand2, Star, Activity, Binary, Sparkles, 
    Ghost, Layers, Lightbulb, ArrowRight
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface MetaAnalystTabProps {
    drawName: string;
}

// Composant Carte Holographique pour une Timeline
const TimelineCard: React.FC<{ 
    timeline: PlatinumTimeline; 
    isSelected: boolean; 
    onClick: () => void 
}> = ({ timeline, isSelected, onClick }) => {
    
    // Styles dynamiques selon le type
    const themes = {
        'ALPHA': { border: 'border-indigo-500', bg: 'bg-indigo-500/10', glow: 'shadow-indigo-500/40', text: 'text-indigo-400', icon: <ShieldCheck size={20}/> },
        'SIGMA': { border: 'border-amber-500', bg: 'bg-amber-500/10', glow: 'shadow-amber-500/40', text: 'text-amber-400', icon: <Zap size={20}/> },
        'OMEGA': { border: 'border-purple-500', bg: 'bg-purple-500/10', glow: 'shadow-purple-500/40', text: 'text-purple-400', icon: <Ghost size={20}/> }
    };
    const theme = themes[timeline.type];

    return (
        <motion.div 
            whileHover={{ scale: 1.02 }}
            onClick={onClick}
            className={`
                relative p-6 rounded-[2.5rem] border-2 cursor-pointer transition-all duration-500 overflow-hidden
                ${isSelected ? `${theme.border} ${theme.bg} shadow-2xl ${theme.glow}` : 'border-slate-800 bg-slate-900/50 opacity-60 hover:opacity-100'}
            `}
        >
            {/* Effet Scanline */}
            {isSelected && <div className="absolute inset-0 bg-gradient-to-b from-transparent via-white/5 to-transparent h-[200%] w-full animate-[scan_3s_linear_infinite] pointer-events-none" style={{backgroundSize: '100% 4px'}}></div>}
            
            <div className="flex justify-between items-start mb-4 relative z-10">
                <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-xl bg-black/40 ${theme.text} border border-white/10`}>
                        {theme.icon}
                    </div>
                    <div>
                        <h4 className={`text-sm font-black uppercase tracking-widest ${theme.text}`}>{timeline.title}</h4>
                        <p className="text-[10px] text-slate-400 font-bold">{timeline.keyMetric}</p>
                    </div>
                </div>
                <div className="text-right">
                    <div className="text-2xl font-black text-white">{timeline.score}%</div>
                    <div className="text-[8px] text-slate-500 uppercase font-bold">Confiance</div>
                </div>
            </div>

            <div className="flex justify-between gap-1 mb-6 relative z-10">
                {timeline.numbers.map(n => (
                    <div key={n} className="scale-90">
                        <NumberBall number={n} size="sm" />
                    </div>
                ))}
            </div>

            {isSelected && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="pt-4 border-t border-white/10 relative z-10">
                    <div className="flex items-start gap-2">
                        <Lightbulb size={14} className={theme.text} />
                        <p className="text-[10px] text-slate-300 font-medium italic leading-relaxed">
                            "{timeline.remark}"
                        </p>
                    </div>
                    <div className="mt-3 flex items-center justify-between">
                        <span className="text-[9px] font-black uppercase text-slate-500">Intuition Artificielle</span>
                        <div className="w-16 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                            <div className={`h-full ${theme.bg.replace('/10', '')}`} style={{ width: `${timeline.intuitionScore}%` }}></div>
                        </div>
                    </div>
                </motion.div>
            )}
        </motion.div>
    );
};

export const MetaAnalystTab: React.FC<MetaAnalystTabProps> = ({ drawName }) => {
    const { showToast } = useToast();
    const { history, loading: nexusLoading, spectral, fractal, wavelet, correlationMatrix, regularity, symbioticContext, volatility } = useNexus();
    
    const [result, setResult] = useState<PlatinumResult | null>(null);
    const [loading, setLoading] = useState(false);
    const [selectedTimeline, setSelectedTimeline] = useState<'ALPHA' | 'SIGMA' | 'OMEGA'>('OMEGA');
    
    // Bias state (gardé pour compatibilité legacy, même si moins utilisé en v18)
    const [bias, setBias] = useState<StrategyBias>(() => {
        const saved = getFusionConfig() as any;
        return saved || { stability: 0.35, chaos: 0.4, harmony: 0.45, wavelet: 0.5, orchestration: 0.55 };
    });
    
    const isMounted = useRef(true);

    const runMetaAnalysis = async () => {
        if (history.length < 25) {
             showToast("Dataset insuffisant (Min 25 pour v18).", "error");
             return;
        }
        setLoading(true);
        
        try {
            const data = await generatePlatinumPrediction(
                drawName, 
                history, 
                { spectral, fractal, wavelet, correlationMatrix, regularity },
                bias,
                symbioticContext
            );
            
            if (isMounted.current) {
                setResult(data);
                savePlatinumHistory(data);
                showToast("Singularité atteinte. 3 Timelines générées.", "success");
            }
        } catch (e: any) {
            if (isMounted.current) showToast("Erreur noyau : " + e.message, "error");
        } finally {
            if (isMounted.current) setLoading(false);
        }
    };

    const handleAutoTune = () => {
        const optimization = calculateOptimalUserBias(drawName, history, { fractal, spectral, volatility });
        setBias(optimization.bias);
        saveFusionConfig(optimization.bias as any);
        showToast(`Auto-Calibration : ${optimization.reasoning}`, "info");
    };

    if (nexusLoading || (loading && !result)) return (
        <div className="flex flex-col items-center justify-center min-h-[500px] gap-8 bg-slate-950 rounded-[4rem] border border-indigo-500/20 shadow-2xl relative overflow-hidden">
            {/* Animation de chargement "Vortex" */}
            <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-64 h-64 border border-indigo-500/20 rounded-full animate-[spin_10s_linear_infinite]"></div>
                <div className="absolute w-48 h-48 border border-purple-500/20 rounded-full animate-[spin_7s_linear_infinite_reverse]"></div>
                <div className="absolute w-32 h-32 border border-emerald-500/20 rounded-full animate-[spin_4s_linear_infinite]"></div>
            </div>
            <div className="relative z-10 flex flex-col items-center gap-4">
                <Brain className="text-indigo-400 w-16 h-16 animate-pulse" />
                <div className="text-center">
                    <p className="text-indigo-400 font-black uppercase tracking-[0.5em] text-xs mb-2">Platinum Fusion v18.0</p>
                    <p className="text-slate-500 text-xs font-mono">Calcul des Timelines Quantiques...</p>
                </div>
            </div>
        </div>
    );

    return (
        <div className="space-y-8 animate-fade-in pb-24 w-full overflow-hidden">
            
            {/* Header Control Panel */}
            <div className="bg-slate-900 border border-slate-800 p-8 rounded-[3rem] shadow-2xl relative overflow-hidden">
                <div className="absolute top-0 right-0 p-10 opacity-5 pointer-events-none"><Layers size={180} /></div>
                
                <div className="relative z-10 flex flex-col md:flex-row justify-between items-center gap-8">
                    <div>
                        <div className="flex items-center gap-3 mb-2">
                            <Sparkles size={20} className="text-amber-400" />
                            <h3 className="text-sm font-black uppercase tracking-[0.3em] text-amber-400">Générateur Quantique</h3>
                        </div>
                        <h2 className="text-3xl md:text-5xl font-black text-white tracking-tighter">
                            Fusion <span className="text-indigo-500">Platinum</span>
                        </h2>
                        <p className="text-slate-400 text-xs md:text-sm mt-2 max-w-lg font-medium">
                            Déployez 3 réalités statistiques divergentes. L'Intuition Artificielle détecte les "Sauts Fantômes" invisibles aux algos classiques.
                        </p>
                    </div>

                    <div className="flex gap-4">
                        <button onClick={handleAutoTune} className="p-4 bg-slate-800 rounded-2xl text-slate-400 hover:text-white hover:bg-slate-700 transition border border-slate-700" title="Auto-Tune">
                            <Wand2 size={20}/>
                        </button>
                        <button 
                            onClick={runMetaAnalysis} 
                            disabled={loading}
                            className="px-8 py-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl shadow-indigo-600/20 flex items-center gap-3 transition-all active:scale-95"
                        >
                            <Binary size={16}/> {loading ? 'Calcul...' : 'Lancer Fusion'}
                        </button>
                    </div>
                </div>
            </div>

            {/* Results Display */}
            {result && (
                <div className="space-y-10 animate-slide-up">
                    
                    {/* Triptyque des Timelines */}
                    <div className="grid lg:grid-cols-3 gap-6">
                        {result.timelines.map((timeline) => (
                            <TimelineCard 
                                key={timeline.type}
                                timeline={timeline}
                                isSelected={selectedTimeline === timeline.type}
                                onClick={() => setSelectedTimeline(timeline.type)}
                            />
                        ))}
                    </div>

                    {/* Detailed Analysis of Selected Timeline */}
                    <div className="bg-white dark:bg-slate-800 p-8 rounded-[3rem] shadow-xl border border-slate-100 dark:border-slate-700 relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-6 opacity-5"><Activity size={120}/></div>
                        
                        <div className="relative z-10">
                            <div className="flex justify-between items-center mb-8">
                                <h3 className="text-xl font-black text-slate-800 dark:text-white uppercase tracking-tighter flex items-center gap-3">
                                    Analyse Détaillée : Timeline <span className="text-indigo-500">{selectedTimeline}</span>
                                </h3>
                                <div className="px-4 py-2 bg-slate-100 dark:bg-slate-900 rounded-xl text-[10px] font-black uppercase text-slate-500 tracking-widest">
                                    Rayon-X Actif
                                </div>
                            </div>

                            <TicketXRay 
                                numbers={result.timelines.find(t => t.type === selectedTimeline)?.numbers || []} 
                                score={result.timelines.find(t => t.type === selectedTimeline)?.score}
                                showTitle={false}
                            />

                            <div className="mt-8 flex justify-end">
                                <button className="flex items-center gap-2 text-[10px] font-black uppercase text-indigo-500 hover:text-indigo-400 transition-colors">
                                    Voir les paramètres du noyau <ArrowRight size={12}/>
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Footer Info */}
                    <div className="text-center pb-8">
                        <div className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 rounded-full border border-slate-800">
                            <Ghost size={12} className="text-slate-500"/>
                            <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">
                                Ghost Protocol : {result.ghostMap ? 'Actif' : 'Inactif'}
                            </span>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
