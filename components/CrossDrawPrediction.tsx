
import React, { useEffect, useState, useMemo } from 'react';
import { useNexus } from './NexusProvider';
import type { DrawResult } from '../types';
import { analyzeMigrationFlux, type InterGameHeat } from '../services/interGameService';
import { NumberBall } from './NumberBall';
import { 
    Zap, Activity, TrendingUp, 
    RefreshCw, Layers, Microscope, 
    ShieldCheck, Binary, Waves, 
    ArrowDownRight, Cpu, Globe, ArrowRight
} from 'lucide-react';
import { 
    Radar, RadarChart, PolarGrid, 
    PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer, Tooltip
} from 'recharts';

interface CrossDrawPredictionProps {
    currentDrawName: string;
}

interface SelfCorrelationMetrics {
    drawName: string;
    machineLeakage: number; // T-1 Machine -> T Winner
    repetitionRate: number; // T-1 Winner -> T Winner
    neighborForce: number;  // T-1 -> T Neighbor
    mirrorForce: number;    // T-1 -> T Mirror
    jumpRate: number;      // T-2 -> T Winner
    attractors: number[];
    stability: number;
}

export const CrossDrawPrediction: React.FC<CrossDrawPredictionProps> = ({ currentDrawName }) => {
    const { history, loading: nexusLoading } = useNexus();
    const [metrics, setMetrics] = useState<SelfCorrelationMetrics | null>(null);
    const [migration, setMigration] = useState<InterGameHeat | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const load = async () => {
            if (history.length >= 15) {
                // Parallélisation des analyses interne et externe
                setLoading(true);
                try {
                    await analyzeSelfCorrelation();
                    const migrationData = await analyzeMigrationFlux(currentDrawName);
                    setMigration(migrationData);
                } catch (e) {
                    console.error("CrossDraw Analysis Error", e);
                } finally {
                    setLoading(false);
                }
            } else if (!nexusLoading) {
                setLoading(false);
            }
        };
        load();
    }, [currentDrawName, history, nexusLoading]);

    const analyzeSelfCorrelation = async () => {
        // 1. Analyse des vecteurs internes (Auto-corrélation)
        let machineToWinner = 0;
        let winnersToWinners = 0;
        let neighbors = 0;
        let mirrors = 0;
        let jumps = 0;
        const sampleSize = Math.min(history.length - 2, 40);

        for (let i = 0; i < sampleSize; i++) {
            const T = history[i];
            const T_minus_1 = history[i + 1];
            const T_minus_2 = history[i + 2];

            T.gagnants.forEach(n => {
                if (T_minus_1.machine?.includes(n)) machineToWinner++;
                if (T_minus_1.gagnants.includes(n)) winnersToWinners++;
                if (T_minus_1.gagnants.some(prev => Math.abs(prev - n) === 1)) neighbors++;
                if (T_minus_1.gagnants.includes(91 - n)) mirrors++;
                if (T_minus_2.gagnants.includes(n) && !T_minus_1.gagnants.includes(n)) jumps++;
            });
        }

        const totalEvents = sampleSize * 5;
        const leakage = Math.round((machineToWinner / totalEvents) * 100 * 3.5);
        const repetition = Math.round((winnersToWinners / totalEvents) * 100 * 3.5);
        const neighbor = Math.round((neighbors / totalEvents) * 100 * 2.5);
        const mirror = Math.round((mirrors / totalEvents) * 100 * 3.0);
        const jump = Math.round((jumps / totalEvents) * 100 * 3.0);

        const lastDraw = history[0];
        const attractors: Set<number> = new Set();
        
        const vectorScores = [
            { type: 'leakage', val: leakage, pool: lastDraw.machine || [] },
            { type: 'repetition', val: repetition, pool: lastDraw.gagnants },
            { type: 'mirror', val: mirror, pool: lastDraw.gagnants.map(n => 91 - n) },
            { type: 'jump', val: jump, pool: history[1].gagnants }
        ].sort((a, b) => b.val - a.val);

        vectorScores.slice(0, 2).forEach(v => {
            v.pool.forEach(n => {
                if (n >= 1 && n <= 90) attractors.add(n);
            });
        });

        setMetrics({
            drawName: currentDrawName,
            machineLeakage: Math.min(100, leakage),
            repetitionRate: Math.min(100, repetition),
            neighborForce: Math.min(100, neighbor),
            mirrorForce: Math.min(100, mirror),
            jumpRate: Math.min(100, jump),
            attractors: Array.from(attractors).slice(0, 5),
            stability: Math.round((leakage + repetition + neighbor + mirror) / 4)
        });
    };

    const chartData = useMemo(() => {
        if (!metrics) return [];
        return [
            { subject: 'Translocation', A: metrics.machineLeakage, fullMark: 100 },
            { subject: 'Inertie', A: metrics.repetitionRate, fullMark: 100 },
            { subject: 'Voisinage', A: metrics.neighborForce, fullMark: 100 },
            { subject: 'Miroir', A: metrics.mirrorForce, fullMark: 100 },
            { subject: 'Saut T-2', A: metrics.jumpRate, fullMark: 100 },
        ];
    }, [metrics]);

    if (loading || nexusLoading) return (
        <div className="bg-slate-900 border border-slate-800 rounded-[2.5rem] p-10 flex flex-col items-center justify-center gap-6 animate-pulse min-h-[300px]">
            <div className="relative">
                <RefreshCw className="text-indigo-500 animate-spin" size={40} />
                <Binary className="absolute inset-0 m-auto text-indigo-300 w-4 h-4" />
            </div>
            <span className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em]">Séquençage Intra/Inter Flux...</span>
        </div>
    );

    if (!metrics) return null;

    return (
        <div className="space-y-8 animate-fade-in pb-10">
            {/* Main Analysis Hub */}
            <div className="bg-slate-950 border border-indigo-500/20 rounded-[3rem] p-6 md:p-10 shadow-2xl relative overflow-hidden group">
                <div className="absolute top-0 right-0 w-80 h-80 bg-indigo-600/5 rounded-full blur-[100px] group-hover:bg-indigo-600/10 transition-all duration-1000"></div>
                
                <div className="relative z-10 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-8">
                    <div className="flex-1">
                        <div className="inline-flex items-center gap-2 px-3 py-1 bg-indigo-500/10 text-indigo-400 text-[9px] font-black uppercase tracking-widest rounded-full border border-indigo-500/20 mb-4">
                            <Cpu size={12} /> Auto-Corrélation Master
                        </div>
                        <h3 className="text-3xl md:text-5xl font-black text-white tracking-tighter leading-tight">
                            Flux <span className="text-indigo-500">{metrics.drawName}</span>
                        </h3>
                    </div>

                    <div className="bg-white/5 backdrop-blur-2xl p-6 rounded-[2.5rem] border border-white/5 flex items-center gap-8 shadow-inner w-full lg:w-auto">
                        <div className="text-center">
                            <div className="text-[10px] font-black text-slate-500 uppercase mb-1">Index Nexus</div>
                            <div className="text-5xl font-black text-emerald-400">{metrics.stability}%</div>
                        </div>
                        <div className="h-12 w-px bg-white/10 hidden sm:block"></div>
                        <div className="flex-1 hidden sm:block min-w-[120px]">
                            <div className="text-[9px] font-black text-slate-500 uppercase mb-2">Cohérence du Flux</div>
                            <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                                <div className="h-full bg-indigo-500 shadow-[0_0_15px_#6366f1]" style={{ width: `${metrics.stability}%` }}></div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="grid lg:grid-cols-12 gap-8 mt-12">
                    {/* Radar d'Influence (Left) */}
                    <div className="lg:col-span-5 bg-black/40 rounded-[2.5rem] p-6 border border-white/5 flex flex-col items-center">
                        <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] mb-6 flex items-center gap-2">
                            <Waves size={14} className="text-indigo-400" /> Profil de Résonance
                        </h4>
                        <div className="h-64 w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <RadarChart cx="50%" cy="50%" outerRadius="80%" data={chartData}>
                                    <PolarGrid stroke="#1e293b" />
                                    <PolarAngleAxis dataKey="subject" tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 'bold' }} />
                                    <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
                                    <Radar name="Intensité" dataKey="A" stroke="#6366f1" fill="#6366f1" fillOpacity={0.5} strokeWidth={3} />
                                    <Tooltip contentStyle={{ backgroundColor: '#0f172a', border: 'none', borderRadius: '16px', fontSize: '11px', color: '#fff' }} />
                                </RadarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    {/* Attracteurs (Right) */}
                    <div className="lg:col-span-7 space-y-8">
                        {/* Migration Inter-Jeux Widget */}
                        {migration && migration.correlationFactor > 10 && (
                            <div className="bg-gradient-to-r from-emerald-900/40 to-slate-900 p-5 rounded-3xl border border-emerald-500/20 flex items-center gap-5 relative overflow-hidden">
                                <div className="absolute top-0 right-0 p-3 opacity-10"><Globe size={64}/></div>
                                <div className="p-3 bg-emerald-500/20 rounded-2xl text-emerald-400"><Globe size={24}/></div>
                                <div className="flex-1 relative z-10">
                                    <div className="flex justify-between items-center mb-1">
                                        <h4 className="text-xs font-black text-white uppercase tracking-widest">Influence Externe Détectée</h4>
                                        <span className="text-[9px] font-black bg-emerald-500 text-slate-900 px-2 py-0.5 rounded">
                                            {migration.correlationFactor}% CORR
                                        </span>
                                    </div>
                                    <p className="text-[10px] text-slate-300 font-medium">
                                        Le tirage précédent <strong>{migration.sourceGame}</strong> exerce une pression de transfert.
                                    </p>
                                    {migration.migratingNumbers.length > 0 && (
                                        <div className="flex gap-2 mt-3 items-center">
                                            <span className="text-[9px] text-slate-500 uppercase font-black">Transferts :</span>
                                            {migration.migratingNumbers.map(n => <span key={n} className="text-xs font-bold text-white bg-emerald-500/20 px-2 py-0.5 rounded border border-emerald-500/30">{n}</span>)}
                                        </div>
                                    )}
                                </div>
                                <ArrowRight size={20} className="text-emerald-500/50" />
                            </div>
                        )}

                        <div>
                            <div className="flex items-center justify-between mb-4">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 bg-indigo-600 rounded-xl shadow-lg"><Zap className="text-white" size={18} /></div>
                                    <h4 className="text-lg font-black text-white uppercase tracking-tight">Attracteurs T-1</h4>
                                </div>
                                <span className="text-[10px] font-black text-indigo-400 bg-indigo-500/10 px-3 py-1 rounded-full border border-indigo-500/20 uppercase">Signal Alpha</span>
                            </div>
                            
                            <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
                                {metrics.attractors.map((n, i) => (
                                    <div key={n} className="bg-white/5 border border-white/5 p-5 rounded-3xl flex flex-col items-center gap-4 hover:bg-white/10 transition-all group/ball relative">
                                        <div className="absolute top-2 right-2 w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse"></div>
                                        <span className="text-[9px] font-black text-slate-500 uppercase">Vecteur {i+1}</span>
                                        <NumberBall number={n} size="md" />
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Sub Metrics Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                    { label: 'Fuite Machine', val: metrics.machineLeakage, icon: <ArrowDownRight size={14}/>, color: 'text-rose-500', bg: 'bg-rose-500/10' },
                    { label: 'Echo (Inertie)', val: metrics.repetitionRate, icon: <TrendingUp size={14}/>, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
                    { label: 'Force Voisins', val: metrics.neighborForce, icon: <Layers size={14}/>, color: 'text-blue-500', bg: 'bg-blue-500/10' },
                    { label: 'Résonance Saut', val: metrics.jumpRate, icon: <Activity size={14}/>, color: 'text-purple-500', bg: 'bg-purple-500/10' }
                ].map(item => (
                    <div key={item.label} className="bg-white dark:bg-slate-800 p-5 rounded-3xl border border-slate-100 dark:border-slate-700 shadow-sm flex items-center justify-between group hover:border-indigo-500 transition-all">
                        <div className="flex items-center gap-4">
                            <div className={`p-2.5 rounded-xl ${item.bg} ${item.color}`}>{item.icon}</div>
                            <span className="text-[11px] font-black text-slate-400 uppercase tracking-tight">{item.label}</span>
                        </div>
                        <span className="text-xl font-black text-slate-800 dark:text-white">{item.val}%</span>
                    </div>
                ))}
            </div>
        </div>
    );
};
