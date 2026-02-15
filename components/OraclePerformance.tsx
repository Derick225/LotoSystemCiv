
import React, { useMemo } from 'react';
import { PredictionHistoryItem, DrawResult } from '../types';
import { ResponsiveContainer, ComposedChart, Line, Area, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { Activity } from 'lucide-react';

interface OraclePerformanceProps {
    predictions: PredictionHistoryItem[];
    results: DrawResult[];
}

export const OraclePerformance: React.FC<OraclePerformanceProps> = ({ predictions, results }) => {
    
    const data = useMemo(() => {
        // Fusionner les prédictions avec les résultats réels
        const chartData = predictions.map(pred => {
            const dateStr = new Date(pred.timestamp).toLocaleDateString('fr-FR');
            const result = results.find(r => r.date === dateStr || r.id === pred.drawResultId);
            
            let hits = 0;
            if (result) {
                hits = pred.prediction.suggestedNumbers.filter(n => result.gagnants.includes(n)).length;
            }

            return {
                date: dateStr.slice(0, 5), // JJ/MM
                fullDate: dateStr,
                confidence: pred.prediction.confidence,
                hits: hits,
                roi: hits >= 3 ? 5000 : hits === 2 ? 200 : -100 // Simulation ROI simple
            };
        }).reverse(); // Chronologique

        // Moyenne mobile pour la tendance
        const maWindow = 5;
        return chartData.map((point, idx, arr) => {
            const slice = arr.slice(Math.max(0, idx - maWindow + 1), idx + 1);
            const avgHits = slice.reduce((sum, p) => sum + p.hits, 0) / slice.length;
            return { ...point, trend: avgHits };
        });
    }, [predictions, results]);

    if (data.length === 0) return null;

    const avgAccuracy = (data.reduce((acc, d) => acc + d.hits, 0) / (data.length * 5)) * 100;
    const profitableTrades = data.filter(d => d.roi > 0).length;

    return (
        <div className="bg-slate-900 border border-slate-800 rounded-[2.5rem] p-6 shadow-xl space-y-6">
            <div className="flex justify-between items-center px-2">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-indigo-500/20 rounded-xl text-indigo-400">
                        <Activity size={20} />
                    </div>
                    <div>
                        <h3 className="text-sm font-black text-white uppercase tracking-widest">Performance Oracle</h3>
                        <p className="text-[10px] text-slate-500 font-bold">Sur les {data.length} derniers tirages</p>
                    </div>
                </div>
                <div className="text-right">
                    <div className="text-2xl font-black text-emerald-400">{avgAccuracy.toFixed(1)}%</div>
                    <div className="text-[9px] text-slate-500 uppercase tracking-widest">Précision Globale</div>
                </div>
            </div>

            <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                        <defs>
                            <linearGradient id="colorHits" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#10b981" stopOpacity={0.8}/>
                                <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                            </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.1} />
                        <XAxis dataKey="date" tick={{fontSize: 10}} axisLine={false} tickLine={false} />
                        <YAxis yAxisId="left" orientation="left" hide domain={[0, 5]} />
                        <YAxis yAxisId="right" orientation="right" hide domain={[0, 100]} />
                        <Tooltip 
                            contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '12px', fontSize: '11px', color: '#fff' }}
                            labelStyle={{ color: '#94a3b8', marginBottom: '5px' }}
                        />
                        <Area yAxisId="left" type="monotone" dataKey="hits" name="Hits Réels" fill="url(#colorHits)" stroke="#10b981" strokeWidth={2} />
                        <Line yAxisId="right" type="monotone" dataKey="confidence" name="Confiance IA" stroke="#6366f1" strokeWidth={2} dot={false} strokeDasharray="4 4" />
                        <Line yAxisId="left" type="monotone" dataKey="trend" name="Tendance (MA5)" stroke="#f59e0b" strokeWidth={2} dot={false} />
                    </ComposedChart>
                </ResponsiveContainer>
            </div>

            <div className="grid grid-cols-3 gap-4">
                <div className="bg-white/5 p-3 rounded-2xl border border-white/5 text-center">
                    <div className="text-[9px] font-black text-slate-500 uppercase mb-1">Ratio Gain</div>
                    <div className="text-lg font-black text-white">{profitableTrades}/{data.length}</div>
                </div>
                <div className="bg-white/5 p-3 rounded-2xl border border-white/5 text-center">
                    <div className="text-[9px] font-black text-slate-500 uppercase mb-1">Max Hits</div>
                    <div className="text-lg font-black text-emerald-400">{Math.max(...data.map(d => d.hits))}</div>
                </div>
                <div className="bg-white/5 p-3 rounded-2xl border border-white/5 text-center">
                    <div className="text-[9px] font-black text-slate-500 uppercase mb-1">Confiance Moy.</div>
                    <div className="text-lg font-black text-indigo-400">{Math.round(data.reduce((a,b)=>a+b.confidence,0)/data.length)}%</div>
                </div>
            </div>
        </div>
    );
};
