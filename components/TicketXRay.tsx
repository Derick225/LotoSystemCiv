
import React, { useMemo } from 'react';
import { calculateACValue } from '../services/mathService';
import { Radar, Activity, Zap, ShieldAlert, ShieldCheck, ScanLine } from 'lucide-react';
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

    const integrityScore = Math.round((Math.min(100, (ac/8)*100) + (score || 50)) / 2);
    const isCritical = integrityScore < 40;
    const isOptimal = integrityScore > 75;

    return (
        <div className="mt-4 p-6 bg-slate-900 rounded-[2.5rem] border border-indigo-500/30 animate-slide-up relative overflow-hidden group">
            {/* Animated Scanner Beam */}
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-indigo-400 to-transparent opacity-50 animate-[scan_3s_ease-in-out_infinite] pointer-events-none z-20 shadow-[0_0_15px_rgba(99,102,241,0.5)]"></div>
            <style>{`@keyframes scan { 0%, 100% { top: 0%; opacity: 0; } 50% { top: 100%; opacity: 1; } }`}</style>

            {/* Background Tech Texture */}
            <div className="absolute inset-0 opacity-5 pointer-events-none" 
                 style={{ backgroundImage: 'radial-gradient(#6366f1 1px, transparent 1px)', backgroundSize: '20px 20px' }}>
            </div>
            
            <div className="grid md:grid-cols-2 gap-8 relative z-10">
                <div className="space-y-6">
                    {showTitle && (
                        <div className="flex justify-between items-center border-b border-white/10 pb-4">
                            <h5 className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.3em] flex items-center gap-2">
                                <ScanLine size={14} className="animate-pulse"/> Diagnostic Structurel
                            </h5>
                            <div className={`px-3 py-1 rounded-full text-[9px] font-black uppercase flex items-center gap-2 border ${isOptimal ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' : isCritical ? 'bg-rose-500/10 text-rose-400 border-rose-500/30' : 'bg-slate-700 text-slate-300 border-slate-600'}`}>
                                {isOptimal ? <ShieldCheck size={10}/> : isCritical ? <ShieldAlert size={10}/> : <Activity size={10}/>}
                                {isOptimal ? 'Intégrité Optimale' : isCritical ? 'Structure Instable' : 'Standard'}
                            </div>
                        </div>
                    )}

                    <div className="space-y-3">
                        <div className="flex justify-between items-center p-3 bg-white/5 rounded-xl border border-white/5 hover:bg-white/10 transition-colors">
                            <div className="flex items-center gap-3">
                                <div className="w-1 h-8 bg-blue-500 rounded-full"></div>
                                <div>
                                    <div className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Somme Sigma</div>
                                    <div className="text-[8px] text-slate-500">Masse Totale</div>
                                </div>
                            </div>
                            <span className={`text-lg font-mono font-black ${sum > 150 && sum < 300 ? 'text-emerald-400' : 'text-orange-400'}`}>{sum}</span>
                        </div>

                        <div className="flex justify-between items-center p-3 bg-white/5 rounded-xl border border-white/5 hover:bg-white/10 transition-colors">
                            <div className="flex items-center gap-3">
                                <div className="w-1 h-8 bg-purple-500 rounded-full"></div>
                                <div>
                                    <div className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Complexité AC</div>
                                    <div className="text-[8px] text-slate-500">Indice Arithmétique</div>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <div className="flex gap-0.5">
                                    {[...Array(10)].map((_, i) => (
                                        <div key={i} className={`w-1 h-3 rounded-full ${i < ac ? 'bg-purple-500' : 'bg-slate-700'}`}></div>
                                    ))}
                                </div>
                                <span className="text-sm font-mono font-black text-white">{ac}/10</span>
                            </div>
                        </div>

                        <div className="flex justify-between items-center p-3 bg-white/5 rounded-xl border border-white/5 hover:bg-white/10 transition-colors">
                            <div className="flex items-center gap-3">
                                <div className="w-1 h-8 bg-indigo-500 rounded-full"></div>
                                <div>
                                    <div className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Balance P/I</div>
                                    <div className="text-[8px] text-slate-500">Pair / Impair</div>
                                </div>
                            </div>
                            <span className="text-sm font-mono font-black text-indigo-300">{5-oddCount}P / {oddCount}I</span>
                        </div>
                    </div>
                </div>
                
                <div className="relative h-48 w-full flex items-center justify-center">
                    {/* Rotating Ring Effect */}
                    <div className="absolute inset-0 border-2 border-dashed border-indigo-500/20 rounded-full animate-[spin_10s_linear_infinite]"></div>
                    <ResponsiveContainer width="100%" height="100%">
                        <RadarChart cx="50%" cy="50%" outerRadius="70%" data={radarData}>
                            <PolarGrid stroke="#334155" strokeOpacity={0.5} />
                            <PolarAngleAxis dataKey="subject" tick={{ fill: '#94a3b8', fontSize: 9, fontWeight: 'bold' }} />
                            <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
                            <RechartsRadar 
                                name="Empreinte" 
                                dataKey="A" 
                                stroke="#8b5cf6" 
                                strokeWidth={2} 
                                fill="#8b5cf6" 
                                fillOpacity={0.3} 
                            />
                            <Tooltip 
                                contentStyle={{ borderRadius: '12px', border: 'none', backgroundColor: 'rgba(15, 23, 42, 0.9)', color: '#fff', fontSize: '10px', boxShadow: '0 4px 20px rgba(0,0,0,0.5)' }} 
                                itemStyle={{ color: '#a78bfa' }}
                            />
                        </RadarChart>
                    </ResponsiveContainer>
                    
                    <div className="absolute bottom-0 right-0">
                        <div className="text-[30px] font-black text-white/5 leading-none select-none pointer-events-none">NEXUS</div>
                    </div>
                </div>
            </div>
        </div>
    );
};
