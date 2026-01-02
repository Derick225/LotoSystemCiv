
import React, { useEffect, useState, useMemo } from 'react';
import { useNexus } from './NexusProvider';
import type { DrawResult } from '../types';
import { NumberBall } from './NumberBall';
import { 
    Zap, Activity, TrendingUp, 
    RefreshCw, Layers, Microscope, 
    ShieldCheck, Binary, Waves, 
    ArrowDownRight, Cpu
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
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (history.length >= 15) {
            analyzeSelfCorrelation();
        } else if (!nexusLoading) {
            setLoading(false);
        }
    }, [currentDrawName, history, nexusLoading]);

    const analyzeSelfCorrelation = async () => {
        setLoading(true);
        try {
            // Utilisation directe de l'historique du contexte
            // history est déjà trié du plus récent au plus ancien
            
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
                    // Fuite Machine
                    if (T_minus_1.machine?.includes(n)) machineToWinner++;
                    // Inertie
                    if (T_minus_1.gagnants.includes(n)) winnersToWinners++;
                    // Voisinage
                    if (T_minus_1.gagnants.some(prev => Math.abs(prev - n) === 1)) neighbors++;
                    // Miroir
                    if (T_minus_1.gagnants.includes(91 - n)) mirrors++;
                    // Saut (T-2)
                    if (T_minus_2.gagnants.includes(n) && !T_minus_1.gagnants.includes(n)) jumps++;
                });
            }

            // 2. Calcul des scores normalisés (0-100)
            const totalEvents = sampleSize * 5;
            const leakage = Math.round((machineToWinner / totalEvents) * 100 * 3.5);
            const repetition = Math.round((winnersToWinners / totalEvents) * 100 * 3.5);
            const neighbor = Math.round((neighbors / totalEvents) * 100 * 2.5);
            const mirror = Math.round((mirrors / totalEvents) * 100 * 3.0);
            const jump = Math.round((jumps / totalEvents) * 100 * 3.0);

            // 3. Identification des Attracteurs par Translocation Active (T-1 -> NOW)
            const lastDraw = history[0];
            const attractors: Set<number> = new Set();
            
            // On privilégie le vecteur dominant
            const vectorScores = [
                { type: 'leakage', val: leakage, pool: lastDraw.machine || [] },
                { type: 'repetition', val: repetition, pool: lastDraw.gagnants },
                { type: 'mirror', val: mirror, pool: lastDraw.gagnants.map(n => 91 - n) },
                { type: 'jump', val: jump, pool: history[1].gagnants }
            ].sort((a, b) => b.val - a.val);

            // On remplit le pool d'attracteurs avec les 2 vecteurs les plus forts
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

        } catch (e) {
            console.error("Self-Correlation Error:", e);
        } finally {
            setLoading(false);
        }
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
            <span className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em]">Séquençage Intra-Flux...</span>
        </div>
    );

    if (!metrics) return null;

    return (
        <div className="space-y-6 animate-fade-in pb-10">
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
                        <p className="text-slate-500 mt-3 text-sm md:text-base font-medium max-w-xl">
                            Détection des cycles de translocation internes (Winners vs Machine) sur la séquence temporelle isolée.
                        </p>
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
                        <p className="text-[9px] text-slate-600 font-bold uppercase mt-4 italic">Analyse basée sur les transitions T-1/T</p>
                    </div>

                    {/* Attracteurs (Right) */}
                    <div className="lg:col-span-7 space-y-8">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-indigo-600 rounded-xl shadow-lg"><Zap className="text-white" size={18} /></div>
                                <h4 className="text-lg font-black text-white uppercase tracking-tight">Attracteurs de Translocation</h4>
                            </div>
                            <span className="text-[10px] font-black text-indigo-400 bg-indigo-500/10 px-3 py-1 rounded-full border border-indigo-500/20 uppercase">Signal Alpha</span>
                        </div>
                        
                        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
                            {metrics.attractors.map((n, i) => (
                                <div key={n} className="bg-white/5 border border-white/5 p-5 rounded-3xl flex flex-col items-center gap-4 hover:bg-white/10 transition-all group/ball relative">
                                    <div className="absolute top-2 right-2 w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse"></div>
                                    <span className="text-[9px] font-black text-slate-500 uppercase">Vecteur {i+1}</span>
                                    <NumberBall number={n} size="md" />
                                    <div className="text-[8px] font-bold text-indigo-400 opacity-60 group-hover/ball:opacity-100 transition-opacity">
                                        RE-ENTRY
                                    </div>
                                </div>
                            ))}
                            {metrics.attractors.length === 0 && (
                                <div className="col-span-5 py-10 text-center text-slate-500 italic text-sm">Calcul des vecteurs en cours...</div>
                            )}
                        </div>

                        <div className="p-5 bg-indigo-500/5 rounded-3xl border border-indigo-500/10 flex items-start gap-4">
                            <Microscope size={22} className="text-indigo-400 shrink-0 mt-1" />
                            <div className="space-y-1">
                                <p className="text-xs md:text-sm text-slate-300 leading-relaxed font-medium">
                                    "Le moteur détecte une dominance de **{chartData.sort((a,b)=>b.A - a.A)[0].subject}**. Les attracteurs isolés ci-dessus présentent une résonance harmonique avec les sorties Machine du tirage précédent."
                                </p>
                                <p className="text-[10px] text-slate-500 font-bold uppercase mt-2 flex items-center gap-2">
                                    <ShieldCheck size={12} className="text-emerald-500" /> Données 100% isolées ({currentDrawName})
                                </p>
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
