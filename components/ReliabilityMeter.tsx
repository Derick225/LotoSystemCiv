
import React from 'react';
import { BrierCalibration } from '../types';
import { Target, AlertCircle, TrendingUp, TrendingDown, ShieldCheck } from 'lucide-react';

interface ReliabilityMeterProps {
    calibration: BrierCalibration;
}

export const ReliabilityMeter: React.FC<ReliabilityMeterProps> = ({ calibration }) => {
    const getBiasText = () => {
        if (calibration.bias === 'OPTIMIST') return "Surestimation (L'IA est trop confiante)";
        if (calibration.bias === 'PESSIMIST') return "Sous-estimation (L'IA est trop prudente)";
        return "Équilibré (L'IA se connaît parfaitement)";
    };

    const getStatusColor = () => {
        if (calibration.reliability > 80) return 'text-emerald-500';
        if (calibration.reliability > 60) return 'text-indigo-500';
        return 'text-orange-500';
    };

    const getReliabilityLabel = () => {
        if (calibration.reliability > 85) return "Précision Chirurgicale";
        if (calibration.reliability > 70) return "Haute Fiabilité";
        if (calibration.reliability > 50) return "Stabilité Modérée";
        return "Apprentissage Requis";
    };

    return (
        <div className="bg-white dark:bg-slate-800 p-6 rounded-[2rem] shadow-xl border border-indigo-100 dark:border-indigo-900/50 animate-fade-in group">
            <div className="flex justify-between items-start mb-6">
                <div>
                    <h4 className="text-sm font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                        <Target size={16} className="text-indigo-500" /> Calibration de l'Oracle
                    </h4>
                    <p className="text-xs text-slate-500 mt-1">
                        {/* Affichage adaptatif selon la source de la métrique */}
                        Base de connaissance : {calibration.sampleSize} tirages
                    </p>
                </div>
                <div className={`p-2 rounded-xl bg-indigo-50 dark:bg-indigo-900/30 ${getStatusColor()}`}>
                    <ShieldCheck size={20} />
                </div>
            </div>

            <div className="flex flex-col md:flex-row gap-8 items-center">
                <div className="relative w-32 h-32 flex items-center justify-center">
                    <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                        <circle cx="50" cy="50" r="45" fill="none" stroke="currentColor" strokeWidth="8" className="text-slate-100 dark:text-slate-700" />
                        <circle 
                            cx="50" cy="50" r="45" fill="none" stroke="currentColor" strokeWidth="8" 
                            strokeDasharray={282.6} strokeDashoffset={282.6 - (calibration.reliability / 100) * 282.6} 
                            strokeLinecap="round" className={`transition-all duration-1000 ${getStatusColor()}`} 
                        />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                        <span className="text-3xl font-black text-slate-800 dark:text-white">{calibration.reliability}%</span>
                        <span className="text-[8px] font-bold text-slate-400 uppercase">Fiabilité</span>
                    </div>
                </div>

                <div className="flex-1 space-y-4 w-full">
                    <div className="p-4 bg-slate-50 dark:bg-slate-900/50 rounded-2xl border border-slate-100 dark:border-slate-700">
                        <div className="flex justify-between items-center mb-1">
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-tighter">Verdict de Calibration</span>
                            <span className={`text-[10px] font-black px-2 py-0.5 rounded ${getStatusColor()} bg-opacity-10 border border-current`}>
                                {getReliabilityLabel()}
                            </span>
                        </div>
                        <p className="text-xs font-bold text-slate-700 dark:text-slate-200">{getBiasText()}</p>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                            <div className="text-[10px] font-bold text-slate-400 uppercase">Score Brier</div>
                            <div className="text-lg font-black text-indigo-400 font-mono">{calibration.overallScore.toFixed(3)}</div>
                        </div>
                        <div className="space-y-1">
                            <div className="text-[10px] font-bold text-slate-400 uppercase">Tendance Précision</div>
                            <div className="flex items-center gap-2">
                                {calibration.bias === 'NEUTRAL' ? (
                                    <span className="text-emerald-500 font-black flex items-center gap-1 text-sm"><CheckCircle size={14}/> Stable</span>
                                ) : calibration.bias === 'OPTIMIST' ? (
                                    <span className="text-orange-500 font-black flex items-center gap-1 text-sm"><TrendingDown size={14}/> Optimiste</span>
                                ) : (
                                    <span className="text-blue-500 font-black flex items-center gap-1 text-sm"><TrendingUp size={14}/> Prudent</span>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            
            <div className="mt-6 flex items-center gap-2 p-3 bg-amber-50 dark:bg-amber-900/10 rounded-xl border border-amber-100 dark:border-amber-900/30">
                <AlertCircle size={14} className="text-amber-500 flex-shrink-0" />
                <p className="text-[9px] text-amber-700 dark:text-amber-400 leading-tight">
                    Le score de fiabilité est {calibration.sampleSize > 200 ? 'calculé sur l\'historique global' : 'estimé sur vos prédictions'}. 
                    Plus il est proche de 100%, plus la variance est maîtrisée.
                </p>
            </div>
        </div>
    );
};

const CheckCircle = ({size, className}:any) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className={className}>
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
        <polyline points="22 4 12 14.01 9 11.01"></polyline>
    </svg>
);
