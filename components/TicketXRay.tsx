
import React, { useMemo } from 'react';
import { calculateACValue } from '../services/mathService';
import { Radar, Activity } from 'lucide-react';
import { ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar as RechartsRadar, Tooltip } from 'recharts';

interface TicketXRayProps {
    numbers: number[];
    score?: number;
    showTitle?: boolean;
}

export const TicketXRay: React.FC<TicketXRayProps> = ({ numbers, score = 0, showTitle = true }) => {
    const sum = useMemo(() => numbers.reduce((a, b) => a + b, 0), [numbers]);
    const ac = useMemo(() => calculateACValue(numbers), [numbers]);
    const oddCount = useMemo(() => numbers.filter(n => n % 2 !== 0).length, [numbers]);
    const spread = useMemo(() => numbers.length > 0 ? numbers[numbers.length - 1] - numbers[0] : 0, [numbers]);
    
    // Simulation d'un profil pour le radar chart
    const radarData = useMemo(() => [
        { subject: 'Force Σ', A: Math.min(100, (sum / 250) * 100), fullMark: 100 },
        { subject: 'Complexité AC', A: Math.min(100, (ac / 10) * 100), fullMark: 100 },
        { subject: 'Équilibre P/I', A: (oddCount / 5) * 100, fullMark: 100 },
        { subject: 'Spread', A: (spread / 90) * 100, fullMark: 100 },
        { subject: 'Score IA', A: Math.min(100, score > 0 ? score : 50), fullMark: 100 },
    ], [sum, ac, oddCount, spread, score]);

    if (numbers.length === 0) return null;

    return (
        <div className="mt-4 p-6 bg-slate-900 rounded-3xl border border-indigo-500/30 animate-slide-up relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-10"><Radar size={80} className="text-indigo-400"/></div>
            
            <div className="grid md:grid-cols-2 gap-8 relative z-10">
                <div>
                    {showTitle && (
                        <h5 className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                            <Activity size={12}/> Diagnostic Structurel
                        </h5>
                    )}
                    <div className="space-y-3">
                        <div className="flex justify-between items-center p-3 bg-white/5 rounded-xl border border-white/5">
                            <span className="text-xs text-slate-400 font-bold">Somme Totale</span>
                            <span className={`text-sm font-black ${sum > 150 && sum < 300 ? 'text-emerald-400' : 'text-orange-400'}`}>{sum}</span>
                        </div>
                        <div className="flex justify-between items-center p-3 bg-white/5 rounded-xl border border-white/5">
                            <span className="text-xs text-slate-400 font-bold">Complexité Arithmétique (AC)</span>
                            <span className={`text-sm font-black ${ac >= 7 ? 'text-emerald-400' : 'text-slate-300'}`}>{ac}/10</span>
                        </div>
                        <div className="flex justify-between items-center p-3 bg-white/5 rounded-xl border border-white/5">
                            <span className="text-xs text-slate-400 font-bold">Ratio Pair/Impair</span>
                            <span className="text-sm font-black text-indigo-300">{5-oddCount}P / {oddCount}I</span>
                        </div>
                        <div className="flex justify-between items-center p-3 bg-white/5 rounded-xl border border-white/5">
                            <span className="text-xs text-slate-400 font-bold">Étendue (Spread)</span>
                            <span className="text-sm font-black text-slate-200">{spread}</span>
                        </div>
                    </div>
                </div>
                
                <div className="h-40 w-full flex items-center justify-center">
                    <ResponsiveContainer width="100%" height="100%">
                        <RadarChart cx="50%" cy="50%" outerRadius="70%" data={radarData}>
                            <PolarGrid stroke="#334155" />
                            <PolarAngleAxis dataKey="subject" tick={{ fill: '#94a3b8', fontSize: 9, fontWeight: 'bold' }} />
                            <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
                            <RechartsRadar name="Profil" dataKey="A" stroke="#8b5cf6" strokeWidth={2} fill="#8b5cf6" fillOpacity={0.4} />
                            <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', backgroundColor: '#0f172a', color: '#fff', fontSize: '10px' }} />
                        </RadarChart>
                    </ResponsiveContainer>
                </div>
            </div>
        </div>
    );
};
