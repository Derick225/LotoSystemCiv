import React, { useState, useMemo } from 'react';
import { useNexusStore } from '../../store/useNexusStore';
import { generateMasterPrediction, getAlgoWeights, normalizeWeights } from '../../services/predictionEngine';
import type { DrawResult, Prediction, RiskProfile, AlgoWeights } from '../../types';
import { Play, RefreshCw, Activity, Target, CheckCircle2, AlertTriangle, BarChart2, Calendar, DollarSign, TrendingUp, TrendingDown, Wallet } from 'lucide-react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ComposedChart, Line } from 'recharts';
import { NumberBall } from '../NumberBall';
import { audioEngine } from '../../utils/audioEngine';
import { useToast } from '../ui/Toast';
import { DRAW_SCHEDULE } from '../../constants';

type BettingStrategyType = 'SIMPLE' | 'PERM_2_5';

const BETTING_CONFIG = {
    'SIMPLE': {
        name: 'Ticket Simple (5 numéros)',
        cost: 300,
        calculateRevenue: (hits: number) => {
            if (hits === 3) return 15000;
            if (hits === 4) return 75000;
            if (hits === 5) return 2000000;
            return 0;
        }
    },
    'PERM_2_5': {
        name: 'Permutation (2 sur 5)',
        cost: 1000, // 100 FCFA per pair * 10 pairs
        calculateRevenue: (hits: number) => {
            if (hits === 2) return 24000; // 1 pair
            if (hits === 3) return 72000; // 3 pairs
            if (hits === 4) return 144000; // 6 pairs
            if (hits === 5) return 240000; // 10 pairs
            return 0;
        }
    }
};

interface BacktestResult {
    drawDate: string;
    actualGagnants: number[];
    predictedNumbers: number[];
    hits: number[];
    confidence: number;
    cost: number;
    revenue: number;
    profit: number;
    cumulativeProfit: number;
}

export const BacktestTab: React.FC<{ drawName: string }> = ({ drawName: initialDrawName }) => {
    const history = useNexusStore(state => state.history);
    const drawName = useNexusStore(state => state.drawName);
    const setDrawName = useNexusStore(state => state.setDrawName);
    const refreshData = useNexusStore(state => state.refreshData);
    const { showToast } = useToast();
    
    const [testCount, setTestCount] = useState<number>(10);
    const [riskProfile, setRiskProfile] = useState<RiskProfile>('BALANCED');
    const [strategy, setStrategy] = useState<string>('Standard');
    const [bettingStrategy, setBettingStrategy] = useState<BettingStrategyType>('PERM_2_5');
    
    const [isRunning, setIsRunning] = useState(false);
    const [progress, setProgress] = useState(0);
    const [results, setResults] = useState<BacktestResult[]>([]);
    
    const allDraws = useMemo(() => {
        const draws = new Set<string>();
        Object.values(DRAW_SCHEDULE).forEach(day => {
            Object.values(day).forEach(name => draws.add(name));
        });
        return Array.from(draws).sort();
    }, []);

    const handleDrawChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
        const newDraw = e.target.value;
        audioEngine.play('click');
        setDrawName(newDraw);
        setResults([]);
        await refreshData(newDraw);
    };
    
    const strategies: Record<string, { name: string; weights: AlgoWeights }> = {
        'Standard': { name: 'Standard', weights: { frequency: 0.15, markov: 0.15, gap: 0.10, spectral: 0.10, poisson: 0.05, momentum: 0.05, equilibrium: 0.05, ai_intuition: 0.05, decision_forest: 0.05, fractal: 0.05, wavelet: 0.05, resistance: 0.05, spatial: 0.05, orchestration: 0.0, gap_velocity: 0.05, anti_consensus: 0.0, lstm: 0.05, bayes: 0.05, leader_succession: 0.05, twin: 0.10, quantum_entanglement: 0.05, fractal_resonance: 0.05, volatility_index: 0.05, shadow_factor: 0.0 } },
        'Spectral Focus': { name: 'Spectral Focus', weights: { spectral: 0.4, wavelet: 0.3, frequency: 0.1, markov: 0.1, fractal: 0.1, volatility_index: 0.0 } },
        'Fractal Deep': { name: 'Fractal Deep', weights: { fractal: 0.4, fractal_resonance: 0.3, markov: 0.1, gap: 0.1, equilibrium: 0.1, volatility_index: 0.0 } },
        'Quantum Chaos': { name: 'Quantum Chaos', weights: { quantum_entanglement: 0.4, anti_consensus: 0.3, ai_intuition: 0.2, spatial: 0.1, volatility_index: 0.0 } },
        'Conservative': { name: 'Conservative', weights: { frequency: 0.3, markov: 0.3, twin: 0.2, equilibrium: 0.2, volatility_index: 0.0 } }
    };

    const runBacktest = async () => {
        if (!drawName) {
            showToast("Veuillez sélectionner un tirage cible.", "error");
            return;
        }
        if (history.length < testCount + 10) {
            showToast(`Historique insuffisant pour tester ${testCount} tirages.`, "error");
            return;
        }

        audioEngine.play('click');
        setIsRunning(true);
        setProgress(0);
        setResults([]);

        const testResults: BacktestResult[] = [];
        const weights = normalizeWeights(strategies[strategy as keyof typeof strategies]?.weights || strategies['Standard'].weights);
        const betConfig = BETTING_CONFIG[bettingStrategy];

        let currentCumulativeProfit = 0;
        
        for (let i = testCount - 1; i >= 0; i--) {
            const targetDraw = history[i];
            const pastHistory = history.slice(i + 1);
            
            try {
                const prediction = await generateMasterPrediction(
                    drawName,
                    pastHistory,
                    weights,
                    undefined,
                    undefined,
                    riskProfile
                );
                
                const hits = prediction.suggestedNumbers.filter(n => targetDraw.gagnants.includes(n));
                const cost = betConfig.cost;
                const revenue = betConfig.calculateRevenue(hits.length);
                const profit = revenue - cost;
                currentCumulativeProfit += profit;
                
                testResults.push({
                    drawDate: targetDraw.date,
                    actualGagnants: targetDraw.gagnants,
                    predictedNumbers: prediction.suggestedNumbers,
                    hits,
                    confidence: prediction.confidence,
                    cost,
                    revenue,
                    profit,
                    cumulativeProfit: currentCumulativeProfit
                });
            } catch (e) {
                console.error("Backtest error at index", i, e);
            }
            
            setProgress(Math.round(((testCount - i) / testCount) * 100));
            // Small delay to allow UI to update and not freeze the browser completely
            await new Promise(resolve => setTimeout(resolve, 50));
        }

        // Reverse to show newest first in the list
        setResults(testResults.reverse());
        setIsRunning(false);
        audioEngine.play('success');
        showToast("Backtest terminé avec succès.", "success");
    };

    const stats = useMemo(() => {
        if (results.length === 0) return null;
        
        let totalHits = 0;
        let perfectDraws = 0; // 3+ hits
        let totalPredicted = 0;
        let totalCost = 0;
        let totalRevenue = 0;
        let maxDrawdown = 0;
        let peak = 0;
        
        results.forEach(r => {
            totalHits += r.hits.length;
            totalPredicted += r.predictedNumbers.length;
            if (r.hits.length >= 3) perfectDraws++;
            
            totalCost += r.cost;
            totalRevenue += r.revenue;
            
            if (r.cumulativeProfit > peak) {
                peak = r.cumulativeProfit;
            }
            const drawdown = peak - r.cumulativeProfit;
            if (drawdown > maxDrawdown) {
                maxDrawdown = drawdown;
            }
        });
        
        const netProfit = totalRevenue - totalCost;
        const roi = totalCost > 0 ? (netProfit / totalCost) * 100 : 0;
        
        return {
            accuracy: totalPredicted > 0 ? (totalHits / totalPredicted) * 100 : 0,
            totalHits,
            perfectDraws,
            avgHits: totalHits / results.length,
            totalCost,
            totalRevenue,
            netProfit,
            roi,
            maxDrawdown
        };
    }, [results]);

    const chartData = useMemo(() => {
        return [...results].reverse().map((r, idx) => ({
            name: r.drawDate.slice(0, 5),
            hits: r.hits.length,
            profit: r.profit,
            cumulative: r.cumulativeProfit
        }));
    }, [results]);

    return (
        <div className="space-y-6 animate-fade-in w-full px-1 md:px-0">
            <div className="bg-nexus-900/40 border border-white/10 p-6 rounded-[2rem] shadow-xl backdrop-blur-md">
                <div className="flex items-center gap-3 mb-6">
                    <div className="p-3 bg-indigo-500/20 rounded-2xl text-indigo-400">
                        <Activity size={24} />
                    </div>
                    <div>
                        <h2 className="text-xl font-black text-white uppercase tracking-tighter">Simulateur Backtest</h2>
                        <p className="text-xs text-slate-400 font-medium">Évaluez les stratégies sur les données historiques</p>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Tirage Cible</label>
                        <select 
                            value={drawName || ''} 
                            onChange={handleDrawChange}
                            disabled={isRunning}
                            className="w-full bg-nexus-950 border border-white/10 rounded-xl px-4 py-3 text-sm font-bold text-white focus:ring-2 focus:ring-indigo-500 outline-none"
                        >
                            <option value="" disabled>Sélectionner un tirage...</option>
                            {allDraws.map(d => (
                                <option key={d} value={d}>{d}</option>
                            ))}
                        </select>
                    </div>
                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Échantillon (Tirages)</label>
                        <select 
                            value={testCount} 
                            onChange={(e) => setTestCount(Number(e.target.value))}
                            disabled={isRunning}
                            className="w-full bg-nexus-950 border border-white/10 rounded-xl px-4 py-3 text-sm font-bold text-white focus:ring-2 focus:ring-indigo-500 outline-none"
                        >
                            <option value={10}>10 Derniers Tirages</option>
                            <option value={20}>20 Derniers Tirages</option>
                            <option value={50}>50 Derniers Tirages</option>
                            <option value={100}>100 Derniers Tirages</option>
                        </select>
                    </div>
                    
                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Profil de Risque</label>
                        <select 
                            value={riskProfile} 
                            onChange={(e) => setRiskProfile(e.target.value as RiskProfile)}
                            disabled={isRunning}
                            className="w-full bg-nexus-950 border border-white/10 rounded-xl px-4 py-3 text-sm font-bold text-white focus:ring-2 focus:ring-indigo-500 outline-none"
                        >
                            <option value="PRUDENT">Prudent (Couverture)</option>
                            <option value="BALANCED">Équilibré (Défaut)</option>
                            <option value="AGGRESSIVE">Agressif (Singularités)</option>
                            <option value="QUANTUM">Quantique (Chaos)</option>
                        </select>
                    </div>

                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">ADN Algorithmique</label>
                        <select 
                            value={strategy} 
                            onChange={(e) => setStrategy(e.target.value)}
                            disabled={isRunning}
                            className="w-full bg-nexus-950 border border-white/10 rounded-xl px-4 py-3 text-sm font-bold text-white focus:ring-2 focus:ring-indigo-500 outline-none"
                        >
                            {Object.keys(strategies).map(s => (
                                <option key={s} value={s}>{s}</option>
                            ))}
                        </select>
                    </div>
                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Stratégie de Mise</label>
                        <select 
                            value={bettingStrategy} 
                            onChange={(e) => setBettingStrategy(e.target.value as BettingStrategyType)}
                            disabled={isRunning}
                            className="w-full bg-nexus-950 border border-white/10 rounded-xl px-4 py-3 text-sm font-bold text-white focus:ring-2 focus:ring-indigo-500 outline-none"
                        >
                            {Object.entries(BETTING_CONFIG).map(([key, config]) => (
                                <option key={key} value={key}>{config.name}</option>
                            ))}
                        </select>
                    </div>
                </div>

                <button 
                    onClick={runBacktest}
                    disabled={isRunning || !drawName}
                    className={`w-full py-4 rounded-2xl font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-all ${isRunning || !drawName ? 'bg-indigo-600/50 text-white/50 cursor-not-allowed' : 'bg-indigo-600 text-white hover:bg-indigo-500 hover:shadow-lg hover:shadow-indigo-500/25 active:scale-[0.98]'}`}
                >
                    {isRunning ? (
                        <><RefreshCw size={18} className="animate-spin" /> Simulation en cours ({progress}%)...</>
                    ) : (
                        <><Play size={18} /> Lancer le Backtest</>
                    )}
                </button>
                
                {isRunning && (
                    <div className="mt-4 h-2 bg-nexus-950 rounded-full overflow-hidden">
                        <div className="h-full bg-indigo-500 transition-all duration-300" style={{ width: `${progress}%` }}></div>
                    </div>
                )}
            </div>

            {stats && (
                <div className="space-y-6 animate-slide-up">
                    {/* Financial Dashboard */}
                    <div className="bg-gradient-to-br from-slate-900 to-nexus-900 border border-white/10 p-6 rounded-[2rem] shadow-2xl relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/10 rounded-full blur-[80px] -mr-32 -mt-32 pointer-events-none"></div>
                        <h3 className="text-sm font-black text-white uppercase tracking-widest mb-6 flex items-center gap-2">
                            <Wallet size={16} className="text-indigo-400" />
                            Bilan Financier (ROI)
                        </h3>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <div className="bg-black/40 border border-white/5 p-4 rounded-2xl flex flex-col">
                                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Investissement</span>
                                <span className="text-xl font-mono font-black text-white">{stats.totalCost.toLocaleString()} F</span>
                            </div>
                            <div className="bg-black/40 border border-white/5 p-4 rounded-2xl flex flex-col">
                                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Gains Bruts</span>
                                <span className="text-xl font-mono font-black text-white">{stats.totalRevenue.toLocaleString()} F</span>
                            </div>
                            <div className={`bg-black/40 border ${stats.netProfit >= 0 ? 'border-emerald-500/30' : 'border-rose-500/30'} p-4 rounded-2xl flex flex-col`}>
                                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Profit Net</span>
                                <div className="flex items-center gap-2">
                                    {stats.netProfit >= 0 ? <TrendingUp size={16} className="text-emerald-400" /> : <TrendingDown size={16} className="text-rose-400" />}
                                    <span className={`text-xl font-mono font-black ${stats.netProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                        {stats.netProfit > 0 ? '+' : ''}{stats.netProfit.toLocaleString()} F
                                    </span>
                                </div>
                            </div>
                            <div className={`bg-black/40 border ${stats.roi >= 0 ? 'border-emerald-500/30' : 'border-rose-500/30'} p-4 rounded-2xl flex flex-col`}>
                                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">R.O.I</span>
                                <span className={`text-xl font-black ${stats.roi >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                    {stats.roi > 0 ? '+' : ''}{stats.roi.toFixed(1)}%
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Technical Stats */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="bg-nexus-900/40 border border-white/5 p-4 rounded-2xl flex flex-col items-center justify-center text-center">
                            <Target size={20} className="text-indigo-400 mb-2" />
                            <div className="text-2xl font-black text-white">{stats.accuracy.toFixed(1)}%</div>
                            <div className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Précision Globale</div>
                        </div>
                        <div className="bg-nexus-900/40 border border-white/5 p-4 rounded-2xl flex flex-col items-center justify-center text-center">
                            <CheckCircle2 size={20} className="text-emerald-400 mb-2" />
                            <div className="text-2xl font-black text-white">{stats.totalHits}</div>
                            <div className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Total Hits</div>
                        </div>
                        <div className="bg-nexus-900/40 border border-white/5 p-4 rounded-2xl flex flex-col items-center justify-center text-center">
                            <AlertTriangle size={20} className="text-amber-400 mb-2" />
                            <div className="text-2xl font-black text-white">{stats.perfectDraws}</div>
                            <div className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Tirages Parfaits (3+)</div>
                        </div>
                        <div className="bg-nexus-900/40 border border-white/5 p-4 rounded-2xl flex flex-col items-center justify-center text-center">
                            <Activity size={20} className="text-rose-400 mb-2" />
                            <div className="text-2xl font-black text-white">{stats.maxDrawdown.toLocaleString()} F</div>
                            <div className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Max Drawdown</div>
                        </div>
                    </div>
                </div>
            )}

            {results.length > 0 && (
                <div className="bg-nexus-900/40 border border-white/10 p-6 rounded-[2rem] shadow-xl backdrop-blur-md animate-slide-up">
                    <h3 className="text-sm font-black text-white uppercase tracking-widest mb-6 flex items-center gap-2">
                        <DollarSign size={16} className="text-emerald-400" />
                        Évolution du Capital (P&L)
                    </h3>
                    <div className="h-64 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                <defs>
                                    <linearGradient id="colorProfit" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                                        <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                                    </linearGradient>
                                    <linearGradient id="colorLoss" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.3}/>
                                        <stop offset="95%" stopColor="#f43f5e" stopOpacity={0}/>
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
                                <XAxis dataKey="name" stroke="#ffffff40" fontSize={10} tickMargin={10} />
                                <YAxis stroke="#ffffff40" fontSize={10} tickFormatter={(val) => `${val/1000}k`} />
                                <Tooltip 
                                    contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', borderRadius: '12px', fontSize: '12px' }}
                                    itemStyle={{ color: '#e2e8f0' }}
                                    formatter={(value: number, name: string) => [
                                        `${value.toLocaleString()} F`, 
                                        name === 'cumulative' ? 'Capital' : 'Profit/Perte'
                                    ]}
                                />
                                <Area type="monotone" dataKey="cumulative" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#colorProfit)" />
                                <Line type="monotone" dataKey="profit" stroke="#6366f1" strokeWidth={2} dot={{ r: 2 }} />
                            </ComposedChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            )}

            {results.length > 0 && (
                <div className="space-y-4 animate-slide-up">
                    <h3 className="text-sm font-black text-white uppercase tracking-widest mb-4 flex items-center gap-2 px-2">
                        <Calendar size={16} className="text-indigo-400" />
                        Journal des Simulations
                    </h3>
                    {results.map((res, idx) => (
                        <div key={idx} className="bg-nexus-900/40 border border-white/5 p-5 rounded-2xl flex flex-col md:flex-row gap-4 items-center justify-between">
                            <div className="flex items-center gap-4 w-full md:w-auto">
                                <div className="bg-slate-800/50 px-3 py-1.5 rounded-lg border border-white/5 text-center min-w-[80px]">
                                    <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Date</div>
                                    <div className="text-sm font-bold text-white">{res.drawDate}</div>
                                </div>
                                <div>
                                    <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Prédiction</div>
                                    <div className="flex gap-1 flex-wrap">
                                        {res.predictedNumbers.map(n => (
                                            <div key={n} className="relative">
                                                {res.hits.includes(n) && <div className="absolute -inset-1 bg-emerald-500/40 rounded-full blur animate-pulse"></div>}
                                                <NumberBall number={n} size="sm" selected={res.hits.includes(n)} />
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                            <div className="flex items-center gap-4 w-full md:w-auto justify-between md:justify-end border-t md:border-t-0 border-white/5 pt-4 md:pt-0">
                                <div>
                                    <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Résultat Réel</div>
                                    <div className="flex gap-1 flex-wrap">
                                        {res.actualGagnants.map(n => (
                                            <div key={n} className={`w-6 h-6 rounded-md flex items-center justify-center text-[9px] font-black border ${res.hits.includes(n) ? 'bg-emerald-600 border-emerald-400 text-white shadow-md' : 'bg-slate-800 border-slate-700 text-slate-400'}`}>{n}</div>
                                        ))}
                                    </div>
                                </div>
                                <div className={`px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-widest border flex flex-col items-end ${res.profit > 0 ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : 'bg-rose-500/10 text-rose-400 border-rose-500/20'}`}>
                                    <span>{res.hits.length} Hits</span>
                                    <span className="text-[9px] font-mono">{res.profit > 0 ? '+' : ''}{res.profit.toLocaleString()} F</span>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};
