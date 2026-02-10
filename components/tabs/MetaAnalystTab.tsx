
import React, { useState, useRef, useEffect } from 'react';
import { generatePlatinumPrediction, savePlatinumHistory, getPlatinumHistory } from '../../services/metaAnalystService';
import { saveTicket } from '../../services/userPreferencesService';
import { useNexus } from '../NexusProvider';
import type { PlatinumResult, PlatinumTimeline } from '../../types';
import { NumberBall } from '../NumberBall';
import { useToast } from '../ui/Toast';
import { TicketXRay } from '../TicketXRay';
import { 
    Brain, Sparkles, Activity,
    Ghost, Layers, Hexagon, Clock, Workflow, Archive, FileSearch, Crown, Radar as RadarIcon, Atom, Zap, Binary, Wallet, Save
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, Tooltip, ResponsiveContainer } from 'recharts';

interface MetaAnalystTabProps {
    drawName: string;
}

// Configuration des Thèmes Visuels par Timeline
const TIMELINE_THEMES: Record<string, any> = {
    'NOVA': { 
        icon: <Brain size={24} />, 
        color: 'text-purple-400', 
        border: 'border-purple-500', 
        bg: 'bg-purple-500/10', 
        glow: 'shadow-[0_0_30px_rgba(168,85,247,0.3)]',
        gradient: 'from-purple-900/40 to-slate-900'
    },
    'NEON': { 
        icon: <Activity size={20} />, 
        color: 'text-cyan-400', 
        border: 'border-cyan-500/50', 
        bg: 'bg-cyan-900/20', 
        glow: 'shadow-cyan-500/20',
        gradient: 'from-cyan-900/20 to-slate-900'
    },
    'TERRA': { 
        icon: <Hexagon size={20} />, 
        color: 'text-emerald-400', 
        border: 'border-emerald-500/50', 
        bg: 'bg-emerald-900/20', 
        glow: 'shadow-emerald-500/20',
        gradient: 'from-emerald-900/20 to-slate-900'
    },
    'CHRONOS': { 
        icon: <Clock size={20} />, 
        color: 'text-amber-400', 
        border: 'border-amber-500/50', 
        bg: 'bg-amber-900/20', 
        glow: 'shadow-amber-500/20',
        gradient: 'from-amber-900/20 to-slate-900'
    },
    'AETHER': { 
        icon: <Ghost size={20} />, 
        color: 'text-rose-400', 
        border: 'border-rose-500/50', 
        bg: 'bg-rose-900/20', 
        glow: 'shadow-rose-500/20',
        gradient: 'from-rose-900/20 to-slate-900'
    }
};

// --- SOUS-COMPOSANTS ---

const TimelineCard: React.FC<{ 
    timeline: PlatinumTimeline; 
    isSelected: boolean; 
    onClick: () => void 
}> = ({ timeline, isSelected, onClick }) => {
    const theme = TIMELINE_THEMES[timeline.type] || TIMELINE_THEMES['NEON'];

    return (
        <motion.div 
            layout
            onClick={onClick}
            whileHover={{ scale: 1.02, y: -5 }}
            whileTap={{ scale: 0.98 }}
            className={`
                relative p-5 rounded-[2.5rem] border cursor-pointer overflow-hidden flex flex-col justify-between min-h-[180px] transition-all duration-300
                ${isSelected ? `${theme.border} bg-slate-900 ${theme.glow}` : 'border-slate-800 bg-slate-900/40 hover:border-slate-600'}
            `}
        >
            {/* Background Gradient */}
            <div className={`absolute inset-0 bg-gradient-to-br ${theme.gradient} opacity-0 group-hover:opacity-100 transition-opacity duration-500`} />
            
            <div className="relative z-10">
                <div className="flex justify-between items-start mb-4">
                    <div className={`p-3 rounded-2xl bg-black/40 border border-white/5 ${theme.color}`}>
                        {theme.icon}
                    </div>
                    <div className="flex flex-col items-end">
                        <span className={`text-[10px] font-black uppercase tracking-widest ${theme.color}`}>{timeline.type}</span>
                        <span className="text-[9px] font-bold text-slate-500">Stratégie ADN</span>
                    </div>
                </div>

                <div className="mb-4">
                    <h3 className="text-sm font-bold text-white mb-1 leading-tight">{timeline.title}</h3>
                    <p className="text-[10px] text-slate-400 line-clamp-2">{timeline.remark}</p>
                </div>

                <div className="flex justify-between gap-1 mt-auto">
                    {timeline.numbers.map((n) => (
                        <div key={n} className="scale-90 transform -ml-1.5 first:ml-0">
                            <NumberBall number={n} size="sm" />
                        </div>
                    ))}
                </div>
            </div>
        </motion.div>
    );
};

const NovaCore: React.FC<{ timeline: PlatinumTimeline; onSave: (nums: number[]) => void }> = ({ timeline, onSave }) => {
    return (
        <div className="relative group">
            <div className="absolute inset-0 bg-purple-600/20 rounded-[3rem] blur-2xl group-hover:blur-3xl transition-all duration-1000 animate-pulse-slow"></div>
            <div className={`relative bg-slate-950 border border-purple-500/30 p-8 md:p-10 rounded-[3rem] shadow-2xl overflow-hidden`}>
                
                {/* FX Background */}
                <div className="absolute top-0 right-0 p-10 opacity-10"><Atom size={200} className="text-purple-500 animate-spin-slow" /></div>
                
                <div className="relative z-10 flex flex-col md:flex-row justify-between items-center gap-8">
                    <div className="text-center md:text-left">
                        <div className="inline-flex items-center gap-2 px-3 py-1 bg-purple-500/10 border border-purple-500/20 rounded-full mb-4">
                            <Crown size={14} className="text-purple-400" />
                            <span className="text-[10px] font-black uppercase tracking-widest text-purple-300">Top 5 ADN</span>
                        </div>
                        <h2 className="text-4xl md:text-5xl font-black text-white tracking-tighter mb-2">
                            NOVA <span className="text-purple-500">PRIME</span>
                        </h2>
                        <p className="text-slate-400 text-sm max-w-md">
                            La quintessence de votre configuration ADN. Les 5 vecteurs les plus puissants générés par vos poids algorithmiques.
                        </p>
                        
                        <button 
                            onClick={(e) => { e.stopPropagation(); onSave(timeline.numbers); }}
                            className="mt-6 px-6 py-3 bg-purple-600 hover:bg-purple-500 text-white rounded-xl font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 shadow-lg transition-all active:scale-95"
                        >
                            <Save size={14}/> Sauvegarder Nova
                        </button>
                    </div>

                    <div className="flex gap-3 md:gap-4">
                        {timeline.numbers.map((n, i) => (
                            <motion.div 
                                key={n}
                                initial={{ scale: 0, y: 20 }}
                                animate={{ scale: 1, y: 0 }}
                                transition={{ delay: i * 0.1, type: 'spring' }}
                            >
                                <NumberBall number={n} size="xl" isAttractor glow />
                            </motion.div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};

const LoadingSequence: React.FC = () => {
    const [step, setStep] = useState(0);
    const steps = [
        "Chargement de l'ADN Algorithmique...",
        "Calcul des scores vectoriels (1-90)...",
        "Isolation des 5 flux de probabilité...",
        "Génération des réalités alternatives..."
    ];

    useEffect(() => {
        const interval = setInterval(() => {
            setStep(s => (s < steps.length - 1 ? s + 1 : s));
        }, 800);
        return () => clearInterval(interval);
    }, []);

    return (
        <div className="flex flex-col items-center justify-center min-h-[500px] gap-8 bg-slate-950 rounded-[3rem] border border-indigo-500/20 shadow-2xl relative overflow-hidden">
            <div className="absolute inset-0 flex items-center justify-center opacity-30 pointer-events-none">
                <div className="w-96 h-96 border border-indigo-500/20 rounded-full animate-[spin_10s_linear_infinite]"></div>
                <div className="absolute w-64 h-64 border border-purple-500/20 rounded-full animate-[spin_7s_linear_infinite_reverse]"></div>
            </div>
            
            <div className="relative z-10 flex flex-col items-center gap-6">
                <div className="relative">
                    <div className="w-20 h-20 bg-indigo-600 rounded-2xl animate-spin-slow"></div>
                    <div className="absolute inset-0 flex items-center justify-center">
                        <Workflow className="text-white w-10 h-10 animate-pulse" />
                    </div>
                </div>
                
                <div className="text-center space-y-2">
                    <p className="text-indigo-400 font-black uppercase tracking-[0.3em] text-xs animate-pulse">
                        Platinum Fusion v4.0
                    </p>
                    <div className="h-6 overflow-hidden">
                        <motion.p 
                            key={step}
                            initial={{ y: 20, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            exit={{ y: -20, opacity: 0 }}
                            className="text-slate-300 text-sm font-mono font-bold"
                        >
                            {steps[step]}
                        </motion.p>
                    </div>
                </div>
                
                <div className="flex gap-1.5 mt-4">
                    {steps.map((_, i) => (
                        <div key={i} className={`w-2 h-2 rounded-full transition-colors duration-500 ${i <= step ? 'bg-indigo-500' : 'bg-slate-800'}`}></div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export const MetaAnalystTab: React.FC<MetaAnalystTabProps> = ({ drawName }) => {
    const { showToast } = useToast();
    const { history, loading: nexusLoading, spectral, fractal, wavelet, correlationMatrix, regularity, symbioticContext, lastPrediction } = useNexus();
    
    const [viewMode, setViewMode] = useState<'generator' | 'archives'>('generator');
    const [result, setResult] = useState<PlatinumResult | null>(null);
    const [loading, setLoading] = useState(false);
    const [selectedTimelineId, setSelectedTimelineId] = useState<string | null>(null);
    const [archives, setArchives] = useState<PlatinumResult[]>([]);
    
    const isMounted = useRef(true);

    useEffect(() => {
        setArchives(getPlatinumHistory(drawName));
    }, [drawName, viewMode]);

    const runMetaAnalysis = async () => {
        if (history.length < 25) {
             showToast("Dataset insuffisant (Min 25).", "error");
             return;
        }
        setLoading(true);
        setResult(null); 
        
        try {
            await new Promise(r => setTimeout(r, 2500)); 

            const data = await generatePlatinumPrediction(
                drawName, 
                history, 
                { spectral, fractal, wavelet, correlationMatrix, regularity },
                null,
                symbioticContext,
                lastPrediction
            );
            
            if (isMounted.current) {
                setResult(data);
                setSelectedTimelineId(null); 
                savePlatinumHistory(data);
                showToast("Réalités Alternatives générées selon l'ADN.", "success");
            }
        } catch (e: any) {
            if (isMounted.current) showToast("Erreur noyau : " + e.message, "error");
        } finally {
            if (isMounted.current) setLoading(false);
        }
    };

    const handleSaveTimeline = async (timelineType: string, numbers: number[]) => {
        await saveTicket({
            numbers,
            drawName,
            strategy: `Platinum ${timelineType} (${new Date().toLocaleTimeString()})`
        });
        showToast(`Timeline ${timelineType} cristallisée dans le wallet.`, "success");
    };

    const selectedTimeline = result?.timelines.find(t => t.type === selectedTimelineId);

    if (nexusLoading || loading) return <LoadingSequence />;

    return (
        <div className="space-y-8 animate-fade-in pb-24 w-full overflow-hidden">
            
            {/* Header Control Panel */}
            <div className="bg-slate-900 border border-slate-800 p-6 md:p-8 rounded-[3rem] shadow-2xl relative overflow-hidden">
                <div className="absolute top-0 right-0 p-10 opacity-5 pointer-events-none"><Layers size={180} /></div>
                
                <div className="relative z-10 flex flex-col md:flex-row justify-between items-center gap-8">
                    <div>
                        <div className="flex items-center gap-3 mb-2">
                            <Sparkles size={20} className="text-purple-400" />
                            <h3 className="text-xs font-black uppercase tracking-[0.3em] text-purple-400">Continuité Quantique</h3>
                        </div>
                        <h2 className="text-3xl md:text-5xl font-black text-white tracking-tighter">
                            Platinum <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-indigo-400">Fusion</span>
                        </h2>
                        <div className="mt-2 flex flex-col gap-1">
                            <p className="text-slate-400 text-xs md:text-sm font-medium max-w-lg">
                                Génération de <strong>5 Réalités Alternatives</strong> basées strictement sur votre ADN Algorithmique actif.
                            </p>
                        </div>
                    </div>

                    <div className="flex bg-black/40 p-1.5 rounded-2xl border border-white/5">
                        <button 
                            onClick={() => setViewMode('generator')}
                            className={`px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 transition-all ${viewMode === 'generator' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
                        >
                            <Zap size={14}/> Live
                        </button>
                        <button 
                            onClick={() => setViewMode('archives')}
                            className={`px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 transition-all ${viewMode === 'archives' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
                        >
                            <Archive size={14}/> Archives
                        </button>
                    </div>
                </div>
            </div>

            {/* MAIN GENERATOR VIEW */}
            {viewMode === 'generator' && (
                <div className="space-y-10 animate-slide-up">
                    
                    {!result && (
                        <div className="flex flex-col items-center justify-center p-12 bg-slate-950 rounded-[3rem] border border-slate-800 border-dashed">
                            <Binary size={48} className="text-slate-600 mb-6" />
                            <p className="text-slate-400 text-sm font-medium mb-8 max-w-md text-center">
                                Le noyau va appliquer vos poids ADN pour calculer 5 stratégies distinctes (Elite, Probabiliste, Structurelle, Cyclique, Chaos).
                            </p>
                            <button 
                                onClick={runMetaAnalysis} 
                                className="px-12 py-5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-[2rem] font-black text-xs uppercase tracking-widest shadow-xl shadow-indigo-600/30 flex items-center gap-3 transition-all active:scale-95 group"
                            >
                                <Zap size={18} className="group-hover:rotate-12 transition-transform"/> Lancer Fusion (ADN)
                            </button>
                        </div>
                    )}

                    {result && (
                        <>
                            {/* NOVA CORE - The Main Result */}
                            <NovaCore 
                                timeline={result.timelines.find(t => t.type === 'NOVA')!} 
                                onSave={(nums) => handleSaveTimeline('NOVA', nums)}
                            />

                            {/* TIMELINES GRID */}
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                                {result.timelines.filter(t => t.type !== 'NOVA').map((timeline) => (
                                    <TimelineCard 
                                        key={timeline.type}
                                        timeline={timeline}
                                        isSelected={selectedTimelineId === timeline.type}
                                        onClick={() => setSelectedTimelineId(selectedTimelineId === timeline.type ? null : timeline.type)}
                                    />
                                ))}
                            </div>

                            {/* DETAILED INSPECTOR PANEL */}
                            <AnimatePresence>
                                {selectedTimeline && (
                                    <motion.div 
                                        initial={{ opacity: 0, height: 0 }}
                                        animate={{ opacity: 1, height: 'auto' }}
                                        exit={{ opacity: 0, height: 0 }}
                                        className="overflow-hidden"
                                    >
                                        <div className="bg-slate-900 border border-slate-800 rounded-[3rem] p-8 grid lg:grid-cols-2 gap-8 shadow-2xl relative">
                                            <div className="absolute top-4 right-6 text-slate-700 cursor-pointer hover:text-white" onClick={() => setSelectedTimelineId(null)}>✕</div>
                                            
                                            <div className="space-y-6">
                                                <div>
                                                    <h3 className={`text-2xl font-black uppercase tracking-tighter mb-2 ${TIMELINE_THEMES[selectedTimeline.type].color}`}>
                                                        Réalité {selectedTimeline.type}
                                                    </h3>
                                                    <p className="text-slate-400 text-xs font-medium italic border-l-2 border-slate-700 pl-4">
                                                        "{selectedTimeline.remark}"
                                                    </p>
                                                </div>
                                                
                                                <TicketXRay 
                                                    numbers={selectedTimeline.numbers} 
                                                    score={selectedTimeline.score}
                                                    showTitle={false}
                                                />
                                                
                                                <button 
                                                    onClick={() => handleSaveTimeline(selectedTimeline.type, selectedTimeline.numbers)}
                                                    className={`w-full py-4 rounded-xl text-white font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 shadow-lg transition-all active:scale-95 bg-gradient-to-r ${TIMELINE_THEMES[selectedTimeline.type].gradient}`}
                                                >
                                                    <Wallet size={16}/> Sauvegarder cette Timeline
                                                </button>
                                            </div>

                                            <div className="bg-black/30 rounded-[2rem] p-6 border border-white/5">
                                                <div className="flex items-center gap-2 mb-4">
                                                    <RadarIcon size={16} className="text-indigo-400" />
                                                    <span className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">Radar de Potentiel</span>
                                                </div>
                                                <div className="h-64 w-full">
                                                    <ResponsiveContainer width="100%" height="100%">
                                                        <RadarChart cx="50%" cy="50%" outerRadius="70%" data={selectedTimeline.radarStats}>
                                                            <PolarGrid stroke="#334155" />
                                                            <PolarAngleAxis dataKey="label" tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 'bold' }} />
                                                            <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
                                                            <Radar name={selectedTimeline.type} dataKey="value" stroke="#818cf8" strokeWidth={3} fill="#818cf8" fillOpacity={0.4} />
                                                            <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', backgroundColor: '#0f172a', color: '#fff', fontSize: '10px' }} />
                                                        </RadarChart>
                                                    </ResponsiveContainer>
                                                </div>
                                            </div>
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </>
                    )}
                </div>
            )}

            {/* ARCHIVES VIEW */}
            {viewMode === 'archives' && (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 animate-slide-up">
                    {archives.length === 0 ? (
                        <div className="col-span-full py-20 text-center text-slate-500 font-medium italic">Aucune archive Platinum disponible.</div>
                    ) : (
                        archives.map((arch) => (
                            <div key={arch.id} className="bg-white dark:bg-slate-900 p-6 rounded-[2.5rem] border border-slate-100 dark:border-slate-800 hover:border-purple-500 transition-all group shadow-sm flex flex-col h-full">
                                <div className="flex justify-between items-start mb-6">
                                    <div className="flex items-center gap-3">
                                        <div className="p-3 bg-slate-100 dark:bg-slate-800 rounded-2xl text-purple-500"><FileSearch size={20}/></div>
                                        <div>
                                            <div className="text-sm font-black text-slate-800 dark:text-white">{new Date(arch.timestamp).toLocaleDateString()}</div>
                                            <div className="text-[9px] font-bold text-slate-400 uppercase">{new Date(arch.timestamp).toLocaleTimeString()}</div>
                                        </div>
                                    </div>
                                    <div className="text-xs font-black text-purple-500 bg-purple-500/10 px-3 py-1 rounded-full">{arch.confidence}%</div>
                                </div>
                                
                                <div className="space-y-4 flex-1">
                                    {arch.timelines.filter(t => t.type === 'NOVA' || t.score > 90).slice(0, 2).map(t => (
                                        <div key={t.type} className="bg-slate-50 dark:bg-black/20 p-3 rounded-2xl border border-slate-100 dark:border-white/5">
                                            <div className="flex justify-between text-[10px] items-center mb-2">
                                                <span className={`font-black uppercase tracking-widest ${t.type === 'NOVA' ? 'text-purple-400' : 'text-slate-500'}`}>{t.type}</span>
                                                <span className="font-mono font-bold text-slate-400">{t.score}pts</span>
                                            </div>
                                            <div className="flex gap-1 justify-center">
                                                {t.numbers.map(n => <span key={n} className="w-5 h-5 bg-white dark:bg-slate-800 rounded flex items-center justify-center text-[9px] font-black shadow-sm">{n}</span>)}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))
                    )}
                </div>
            )}
        </div>
    );
};
