
import React, { useState, useRef, useEffect } from 'react';
import { generatePlatinumPrediction, savePlatinumHistory, getPlatinumHistory, performPlatinumAudit } from '../../services/metaAnalystService';
import { useNexus } from '../NexusProvider';
import type { PlatinumResult, PlatinumTimeline, PlatinumAudit } from '../../types';
import { NumberBall } from '../NumberBall';
import { useToast } from '../ui/Toast';
import { TicketXRay } from '../TicketXRay';
import { 
    Brain, ShieldCheck, Zap,
    Binary, Sparkles, Activity,
    Ghost, Layers, Hexagon, Component, Clock, Workflow, Archive, FileSearch, ArrowRight, BarChart2, CheckCircle2, Radar as RadarIcon, Crown
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar } from 'recharts';

interface MetaAnalystTabProps {
    drawName: string;
}

// Composant Carte Timeline
const TimelineCard: React.FC<{ 
    timeline: PlatinumTimeline; 
    isSelected: boolean; 
    onClick: () => void 
}> = ({ timeline, isSelected, onClick }) => {
    
    const themes: Record<string, any> = {
        'NEON': { border: 'border-cyan-500', bg: 'bg-cyan-500/10', glow: 'shadow-cyan-500/40', text: 'text-cyan-400', icon: <Activity size={18}/> },
        'TERRA': { border: 'border-emerald-500', bg: 'bg-emerald-500/10', glow: 'shadow-emerald-500/40', text: 'text-emerald-400', icon: <Hexagon size={18}/> },
        'CHRONOS': { border: 'border-amber-500', bg: 'bg-amber-500/10', glow: 'shadow-amber-500/40', text: 'text-amber-400', icon: <Clock size={18}/> },
        'AETHER': { border: 'border-rose-500', bg: 'bg-rose-500/10', glow: 'shadow-rose-500/40', text: 'text-rose-400', icon: <Ghost size={18}/> },
        'NOVA': { border: 'border-purple-500', bg: 'bg-purple-500/10', glow: 'shadow-purple-500/40', text: 'text-purple-400', icon: <Brain size={18}/> }
    };
    const theme = themes[timeline.type] || themes['NEON'];

    return (
        <motion.div 
            whileHover={{ scale: 1.02 }}
            onClick={onClick}
            className={`
                relative p-5 rounded-[2rem] border cursor-pointer transition-all duration-300 overflow-hidden flex flex-col justify-between h-full min-h-[160px] group
                ${isSelected ? `${theme.border} ${theme.bg} shadow-xl ${theme.glow}` : 'border-slate-800 bg-slate-900/40 hover:bg-slate-800'}
            `}
        >
            <div className="flex justify-between items-start mb-2 relative z-10">
                <div className="flex items-center gap-2">
                    <div className={`p-1.5 rounded-lg bg-black/40 ${theme.text} border border-white/5`}>
                        {theme.icon}
                    </div>
                    <h4 className={`text-xs font-black uppercase tracking-widest ${theme.text}`}>{timeline.type}</h4>
                </div>
                {timeline.divergence !== undefined && (
                    <div className={`text-[8px] font-black uppercase px-2 py-0.5 rounded border border-white/10 ${timeline.divergence > 60 ? 'text-rose-400 bg-rose-900/20' : 'text-slate-400 bg-black/20'}`}>
                        Div: {Math.round(timeline.divergence)}%
                    </div>
                )}
            </div>

            <div className="relative z-10">
                <h3 className="text-sm text-white font-bold mb-3 truncate">{timeline.title}</h3>
                <div className="flex justify-between gap-1">
                    {timeline.numbers.map(n => (
                        <div key={n} className="scale-90 transform -ml-1 first:ml-0">
                            <NumberBall number={n} size="sm" />
                        </div>
                    ))}
                </div>
            </div>
            
            {/* Background Glint */}
            {isSelected && <div className={`absolute -bottom-10 -right-10 w-32 h-32 blur-[50px] opacity-30 ${theme.bg.replace('/10', '')}`}></div>}
        </motion.div>
    );
};

// Composant Radar de Divergence
const DivergenceRadar: React.FC<{ timeline: PlatinumTimeline }> = ({ timeline }) => {
    if (!timeline.radarStats) return null;

    return (
        <div className="h-64 w-full relative">
            <ResponsiveContainer width="100%" height="100%">
                <RadarChart cx="50%" cy="50%" outerRadius="70%" data={timeline.radarStats}>
                    <PolarGrid stroke="#334155" />
                    <PolarAngleAxis dataKey="label" tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 'bold' }} />
                    <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
                    <Radar name={timeline.type} dataKey="value" stroke="#818cf8" strokeWidth={3} fill="#818cf8" fillOpacity={0.4} />
                    <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', backgroundColor: '#0f172a', color: '#fff', fontSize: '10px' }} />
                </RadarChart>
            </ResponsiveContainer>
            <div className="absolute top-0 right-0 p-2 bg-slate-900/80 rounded-lg border border-slate-700 text-[9px] text-slate-400 font-mono">
                Divergence Scan
            </div>
        </div>
    );
};

// Composant Fusion Matrix (King Numbers)
const FusionMatrix: React.FC<{ kings: { number: number, count: number }[] }> = ({ kings }) => {
    return (
        <div className="bg-slate-950 p-6 rounded-[2.5rem] border border-indigo-500/20 shadow-inner">
            <div className="flex items-center gap-3 mb-6">
                <Crown size={20} className="text-amber-400" />
                <h4 className="text-white font-black text-sm uppercase tracking-widest">Matrice de Fusion (Rois)</h4>
            </div>
            <div className="flex flex-wrap gap-4 justify-center">
                {kings.slice(0, 6).map((k, i) => (
                    <div key={k.number} className="flex flex-col items-center gap-2 group">
                        <div className="relative">
                            <NumberBall number={k.number} size="md" isAttractor={i < 3} />
                            <div className="absolute -top-2 -right-2 bg-indigo-600 text-white text-[9px] font-black w-5 h-5 flex items-center justify-center rounded-full border-2 border-slate-950 shadow-lg">
                                {k.count}
                            </div>
                        </div>
                        <div className="h-1 w-8 bg-slate-800 rounded-full overflow-hidden">
                            <div className="h-full bg-amber-400" style={{ width: `${(k.count / 5) * 100}%` }}></div>
                        </div>
                    </div>
                ))}
                {kings.length === 0 && <span className="text-slate-500 text-xs italic">Aucune convergence détectée.</span>}
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
    const [selectedTimeline, setSelectedTimeline] = useState<string>('NOVA');
    
    const [archives, setArchives] = useState<PlatinumResult[]>([]);
    const [selectedAudit, setSelectedAudit] = useState<PlatinumAudit | null>(null);
    
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
        
        try {
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
                setSelectedTimeline('NOVA');
                savePlatinumHistory(data);
                showToast("Multivers Platinum généré.", "success");
            }
        } catch (e: any) {
            if (isMounted.current) showToast("Erreur noyau : " + e.message, "error");
        } finally {
            if (isMounted.current) setLoading(false);
        }
    };

    if (nexusLoading || (loading && !result)) return (
        <div className="flex flex-col items-center justify-center min-h-[500px] gap-8 bg-slate-950 rounded-[4rem] border border-indigo-500/20 shadow-2xl relative overflow-hidden">
            <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-64 h-64 border border-indigo-500/20 rounded-full animate-[spin_10s_linear_infinite]"></div>
                <div className="absolute w-48 h-48 border border-purple-500/20 rounded-full animate-[spin_7s_linear_infinite_reverse]"></div>
            </div>
            <div className="relative z-10 flex flex-col items-center gap-4">
                <Workflow className="text-indigo-400 w-16 h-16 animate-pulse" />
                <div className="text-center">
                    <p className="text-indigo-400 font-black uppercase tracking-[0.5em] text-xs mb-2">Platinum Fusion v23.0</p>
                    <p className="text-slate-500 text-xs font-mono">Génération des 5 Réalités Stochastiques...</p>
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
                            <h3 className="text-sm font-black uppercase tracking-[0.3em] text-amber-400">Continuité Quantique</h3>
                        </div>
                        <h2 className="text-3xl md:text-5xl font-black text-white tracking-tighter">
                            Platinum <span className="text-indigo-500">Fusion</span>
                        </h2>
                        <p className="text-slate-400 text-xs md:text-sm mt-2 max-w-lg font-medium">
                            L'Oracle Base donne le Consensus. Ici, nous explorons 5 réalités divergentes basées sur des signaux ignorés.
                        </p>
                    </div>

                    <div className="flex bg-black/40 p-1.5 rounded-2xl border border-white/5">
                        <button 
                            onClick={() => { setViewMode('generator'); setSelectedAudit(null); }}
                            className={`px-5 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 transition-all ${viewMode === 'generator' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
                        >
                            <Zap size={14}/> Live
                        </button>
                        <button 
                            onClick={() => setViewMode('archives')}
                            className={`px-5 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 transition-all ${viewMode === 'archives' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
                        >
                            <Archive size={14}/> Archives
                        </button>
                    </div>
                </div>
            </div>

            {/* ARCHIVES VIEW */}
            {viewMode === 'archives' && (
                <div className="animate-slide-up grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {archives.length === 0 ? (
                        <div className="col-span-full py-20 text-center text-slate-500 font-medium italic">Aucune archive Platinum disponible.</div>
                    ) : (
                        archives.map((arch) => (
                            <div key={arch.id} className="bg-white dark:bg-slate-900 p-6 rounded-[2.5rem] border border-slate-100 dark:border-slate-800 hover:border-indigo-500 transition-all group shadow-sm">
                                <div className="flex justify-between items-start mb-4">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2.5 bg-slate-100 dark:bg-slate-800 rounded-xl text-indigo-500"><FileSearch size={18}/></div>
                                        <div>
                                            <div className="text-sm font-black text-slate-800 dark:text-white">{new Date(arch.timestamp).toLocaleDateString()}</div>
                                            <div className="text-[9px] font-bold text-slate-400 uppercase">{new Date(arch.timestamp).toLocaleTimeString()}</div>
                                        </div>
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    {arch.timelines.slice(0, 3).map(t => (
                                        <div key={t.type} className="flex justify-between text-[10px] items-center">
                                            <span className="font-bold text-slate-500">{t.type}</span>
                                            <div className="flex gap-0.5">{t.numbers.map(n => <span key={n} className="w-4 h-4 bg-slate-100 dark:bg-slate-800 rounded flex items-center justify-center text-[8px] font-bold">{n}</span>)}</div>
                                        </div>
                                    ))}
                                    <div className="text-[9px] text-slate-400 text-center pt-2">+2 autres timelines</div>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            )}

            {/* GENERATOR / INSPECTOR VIEW */}
            {viewMode === 'generator' && (
                <div className="space-y-10 animate-slide-up">
                    
                    {!result && (
                        <div className="flex justify-center">
                            <button 
                                onClick={runMetaAnalysis} 
                                className="px-12 py-5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-[2rem] font-black text-xs uppercase tracking-widest shadow-xl shadow-indigo-600/30 flex items-center gap-3 transition-all active:scale-95"
                            >
                                <Binary size={18}/> Lancer Simulation
                            </button>
                        </div>
                    )}

                    {result && (
                        <>
                            {/* Grid des 5 Timelines */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
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
                            <AnimatePresence mode="wait">
                                <motion.div 
                                    key={selectedTimeline}
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -20 }}
                                    className="bg-white dark:bg-slate-800 p-8 rounded-[3rem] shadow-xl border border-slate-100 dark:border-slate-700 relative overflow-hidden"
                                >
                                    <div className="absolute top-0 right-0 p-6 opacity-5"><Component size={120}/></div>
                                    
                                    <div className="relative z-10 grid lg:grid-cols-12 gap-8">
                                        <div className="lg:col-span-8">
                                            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
                                                <div>
                                                    <div className="flex items-center gap-3 mb-2">
                                                        <div className="px-3 py-1 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-300 rounded-full text-[10px] font-black uppercase tracking-widest">
                                                            Timeline Active : {selectedTimeline}
                                                        </div>
                                                        <div className="text-[10px] text-slate-400 font-bold uppercase">{result.timelines.find(t => t.type === selectedTimeline)?.keyMetric}</div>
                                                    </div>
                                                    <h3 className="text-xl font-black text-slate-800 dark:text-white uppercase tracking-tighter">
                                                        {result.timelines.find(t => t.type === selectedTimeline)?.title}
                                                    </h3>
                                                </div>
                                                <div className="p-4 bg-slate-50 dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-700 max-w-md">
                                                    <div className="flex gap-2">
                                                        <ShieldCheck size={16} className="text-emerald-500 shrink-0 mt-0.5" />
                                                        <p className="text-xs text-slate-600 dark:text-slate-300 font-medium italic leading-relaxed">
                                                            "{result.timelines.find(t => t.type === selectedTimeline)?.remark}"
                                                        </p>
                                                    </div>
                                                </div>
                                            </div>

                                            <TicketXRay 
                                                numbers={result.timelines.find(t => t.type === selectedTimeline)?.numbers || []} 
                                                score={result.timelines.find(t => t.type === selectedTimeline)?.score}
                                                showTitle={false}
                                            />
                                        </div>

                                        <div className="lg:col-span-4 flex flex-col gap-6">
                                            <div className="bg-slate-950 p-6 rounded-[2.5rem] border border-slate-800 shadow-xl h-full">
                                                <h4 className="text-xs font-black text-indigo-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                                                    <RadarIcon size={14} /> Profil de Divergence
                                                </h4>
                                                {result.timelines.find(t => t.type === selectedTimeline) && 
                                                    <DivergenceRadar timeline={result.timelines.find(t => t.type === selectedTimeline)!} />
                                                }
                                            </div>
                                        </div>
                                    </div>
                                </motion.div>
                            </AnimatePresence>

                            {/* Fusion Matrix Footer */}
                            <div className="grid lg:grid-cols-12 gap-8">
                                <div className="lg:col-span-12">
                                    <FusionMatrix kings={result.kingNumbers} />
                                </div>
                            </div>

                            {/* Footer Info */}
                            <div className="text-center pb-8">
                                <div className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 rounded-full border border-slate-800">
                                    <BarChart2 size={12} className="text-slate-500"/>
                                    <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">
                                        Divergence Index : {result.timelines.length} Paths Active
                                    </span>
                                </div>
                            </div>
                        </>
                    )}
                </div>
            )}
        </div>
    );
};
