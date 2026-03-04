
import React, { useState, useEffect } from 'react';
import { useNexus } from './NexusProvider';
import { generateMasterPrediction, getAlgoWeights } from '../services/predictionEngine';
import { RiskProfile, Prediction } from '../types';
import { NumberBall } from './NumberBall';
import { Swords, Shield, Zap, Scale, Target } from 'lucide-react';
import { motion } from 'framer-motion';

export const StrategyBattle: React.FC = () => {
    const { history, drawName, riskProfile } = useNexus();
    const [leftProfile, setLeftProfile] = useState<RiskProfile>(riskProfile || 'PRUDENT');
    const [rightProfile, setRightProfile] = useState<RiskProfile>('AUDACIOUS');
    const [leftPred, setLeftPred] = useState<Prediction | null>(null);
    const [rightPred, setRightPred] = useState<Prediction | null>(null);
    const [isBattling, setIsBattling] = useState(false);
    const [divergence, setDivergence] = useState(0);

    const runBattle = async () => {
        if (history.length < 10) return;
        setIsBattling(true);
        setLeftPred(null);
        setRightPred(null);

        try {
            const weights = await getAlgoWeights(drawName);
            
            const [p1, p2] = await Promise.all([
                generateMasterPrediction(drawName, history, weights, undefined, undefined, leftProfile),
                generateMasterPrediction(drawName, history, weights, undefined, undefined, rightProfile)
            ]);

            setLeftPred(p1);
            setRightPred(p2);

            // Calculate Divergence (How different are the sets?)
            const set1 = new Set(p1.suggestedNumbers);
            const set2 = new Set(p2.suggestedNumbers);
            const intersection = new Set([...set1].filter(x => set2.has(x)));
            const union = new Set([...set1, ...set2]);
            
            // Jaccard Distance
            const jaccardIndex = intersection.size / union.size;
            setDivergence(Math.round((1 - jaccardIndex) * 100));

        } catch (e) {
            console.error("Battle failed", e);
        } finally {
            setIsBattling(false);
        }
    };

    const profiles: RiskProfile[] = ['PRUDENT', 'BALANCED', 'AUDACIOUS', 'CHAOS'];

    return (
        <div className="bg-slate-900/50 p-6 rounded-2xl border border-white/10 backdrop-blur-md w-full">
            <div className="flex items-center gap-3 mb-6">
                <div className="p-2 bg-rose-500/20 rounded-lg text-rose-400">
                    <Swords size={24} />
                </div>
                <div>
                    <h3 className="text-lg font-bold text-white">Mode Battle</h3>
                    <p className="text-xs text-slate-400">Comparateur de Stratégies Temps Réel</p>
                </div>
            </div>

            <div className="grid grid-cols-[1fr_auto_1fr] gap-4 items-center mb-8">
                {/* Left Controls */}
                <div className="flex flex-col gap-2">
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Challenger A</label>
                    <select 
                        value={leftProfile} 
                        onChange={(e) => setLeftProfile(e.target.value as RiskProfile)}
                        className="bg-slate-800 text-white text-xs font-bold p-2 rounded-lg border border-slate-700 focus:border-indigo-500 outline-none"
                    >
                        {profiles.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                </div>

                {/* VS Badge */}
                <div className="flex flex-col items-center justify-center">
                    <div className="w-10 h-10 rounded-full bg-slate-800 border-2 border-slate-700 flex items-center justify-center font-black text-slate-500 text-xs italic">
                        VS
                    </div>
                </div>

                {/* Right Controls */}
                <div className="flex flex-col gap-2 text-right">
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Challenger B</label>
                    <select 
                        value={rightProfile} 
                        onChange={(e) => setRightProfile(e.target.value as RiskProfile)}
                        className="bg-slate-800 text-white text-xs font-bold p-2 rounded-lg border border-slate-700 focus:border-indigo-500 outline-none text-right"
                    >
                        {profiles.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                </div>
            </div>

            <button 
                onClick={runBattle}
                disabled={isBattling}
                className="w-full py-3 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-sm font-bold transition-colors flex items-center justify-center gap-2 mb-8 shadow-lg shadow-rose-900/20 disabled:opacity-50"
            >
                {isBattling ? <Swords className="animate-spin" size={18} /> : <Zap size={18} />}
                Lancer le Duel
            </button>

            {leftPred && rightPred && (
                <div className="space-y-6 animate-fade-in">
                    {/* Divergence Meter */}
                    <div className="flex flex-col items-center gap-2">
                        <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Divergence Stratégique</div>
                        <div className="text-3xl font-black text-white">{divergence}%</div>
                        <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden max-w-[200px]">
                            <motion.div 
                                className="h-full bg-gradient-to-r from-indigo-500 to-rose-500"
                                initial={{ width: 0 }}
                                animate={{ width: `${divergence}%` }}
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        {/* Left Results */}
                        <div className="bg-slate-800/50 p-4 rounded-xl border border-white/5 flex flex-col items-center gap-4">
                            <div className="flex flex-wrap justify-center gap-2">
                                {leftPred.suggestedNumbers.map(n => (
                                    <NumberBall key={n} number={n} size="xs" />
                                ))}
                            </div>
                            <div className="text-xs font-mono text-emerald-400">Conf: {leftPred.confidence}%</div>
                        </div>

                        {/* Right Results */}
                        <div className="bg-slate-800/50 p-4 rounded-xl border border-white/5 flex flex-col items-center gap-4">
                            <div className="flex flex-wrap justify-center gap-2">
                                {rightPred.suggestedNumbers.map(n => (
                                    <NumberBall key={n} number={n} size="xs" />
                                ))}
                            </div>
                            <div className="text-xs font-mono text-emerald-400">Conf: {rightPred.confidence}%</div>
                        </div>
                    </div>

                    {/* Common Ground */}
                    <div className="bg-indigo-900/20 p-4 rounded-xl border border-indigo-500/20 text-center">
                        <div className="text-[10px] font-black text-indigo-300 uppercase tracking-widest mb-3">Consensus (Base Commune)</div>
                        <div className="flex flex-wrap justify-center gap-2">
                            {leftPred.suggestedNumbers.filter(n => rightPred.suggestedNumbers.includes(n)).length > 0 ? (
                                leftPred.suggestedNumbers.filter(n => rightPred.suggestedNumbers.includes(n)).map(n => (
                                    <NumberBall key={n} number={n} size="sm" />
                                ))
                            ) : (
                                <span className="text-xs text-slate-500 italic">Aucun consensus trouvé.</span>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
