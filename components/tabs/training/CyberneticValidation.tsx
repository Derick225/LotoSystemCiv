import React, { useState } from 'react';
import { Play, RefreshCw, ShieldCheck } from 'lucide-react';
import { AlgoWeights } from '../../../types';
import { audioEngine } from '../../../utils/audioEngine';
import { runSurvivalSimulation } from '../../../services/backtestingEngine';

interface CyberneticValidationProps {
    weights: AlgoWeights;
    drawName: string;
    history: any[];
}

export const CyberneticValidation: React.FC<CyberneticValidationProps> = ({ weights, drawName, history }) => {
    const [running, setRunning] = useState(false);
    const [report, setReport] = useState<any>(null);
    const [strategy, setStrategy] = useState<'FLAT' | 'KELLY' | 'CONFIDENCE_SMART'>('CONFIDENCE_SMART');

    const runValidation = async () => {
        setRunning(true);
        audioEngine.play('scan');
        try {
            const res = await runSurvivalSimulation(
                drawName,
                history,
                weights,
                Math.min(50, history.length),
                strategy,
                undefined,
                10000,
                200
            );
            setReport(res);
            audioEngine.play('success');
        } catch (e) {
            console.error(e);
        } finally {
            setRunning(false);
        }
    };

    return (
        <div className="bg-slate-950 p-6 rounded-2xl border border-indigo-900/50 shadow-xl mt-6 relative overflow-hidden min-w-0">
            <div className="absolute -right-4 -top-4 bg-indigo-500/10 w-32 h-32 rounded-full blur-2xl pointer-events-none"></div>
            
            <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
                <h4 className="text-xs font-black text-indigo-400 uppercase tracking-widest flex items-center gap-2">
                    <ShieldCheck size={14} /> Validation Empirique (Cybérnétique)
                </h4>
                <div className="flex items-center gap-2">
                    <select 
                        value={strategy} 
                        onChange={e => setStrategy(e.target.value as any)}
                        className="bg-slate-900 text-[10px] text-slate-300 border border-slate-700 rounded p-1 uppercase tracking-wider font-bold"
                    >
                        <option value="FLAT">Flat Betting</option>
                        <option value="KELLY">Critère de Kelly</option>
                        <option value="CONFIDENCE_SMART">Smart Confidence</option>
                    </select>
                    <button 
                        onClick={runValidation} 
                        disabled={running}
                        className="bg-indigo-600 hover:bg-indigo-500 text-white p-1.5 rounded disabled:opacity-50 transition-all cursor-pointer"
                    >
                        {running ? <RefreshCw size={12} className="animate-spin" /> : <Play size={12} />}
                    </button>
                </div>
            </div>

            {report ? (
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    <div className="bg-slate-900 p-3 rounded-xl border border-slate-800">
                        <div className="text-[10px] text-slate-500 uppercase font-bold mb-1">ROI Net</div>
                        <div className={`text-lg font-black ${report.roi >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                            {report.roi > 0 ? '+' : ''}{report.roi.toFixed(1)}%
                        </div>
                    </div>
                    <div className="bg-slate-900 p-3 rounded-xl border border-slate-800">
                        <div className="text-[10px] text-slate-500 uppercase font-bold mb-1">Win Rate</div>
                        <div className="text-lg font-black text-blue-400">
                            {report.winRate.toFixed(1)}%
                        </div>
                    </div>
                    <div className="bg-slate-900 p-3 rounded-xl border border-slate-800">
                        <div className="text-[10px] text-slate-500 uppercase font-bold mb-1">Max Drawdown</div>
                        <div className="text-lg font-black text-amber-500">
                            -{report.maxDrawdown.toFixed(1)}%
                        </div>
                    </div>
                    <div className="bg-slate-900 p-3 rounded-xl border border-slate-800">
                        <div className="text-[10px] text-slate-500 uppercase font-bold mb-1">Sharpe Ratio</div>
                        <div className="text-lg font-black text-fuchsia-400">
                            {report.sharpeRatio.toFixed(2)}
                        </div>
                    </div>
                </div>
            ) : (
                <div className="p-4 border border-dashed border-slate-800 rounded-xl flex justify-center items-center text-slate-600 text-[10px] font-bold uppercase tracking-widest">
                    Lancer la simulation empirique pour valider l'ADN
                </div>
            )}
        </div>
    );
};
