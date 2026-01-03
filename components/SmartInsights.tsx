
import React from 'react';
import type { SmartInsight } from '../types';
import { useNexus } from './NexusProvider';
import { ArrowRight, TrendingUp, AlertTriangle, Lightbulb } from 'lucide-react';

interface SmartInsightsProps {
    drawName: string;
}

export const SmartInsights: React.FC<SmartInsightsProps> = ({ drawName }) => {
    const { smartInsights, loading: nexusLoading } = useNexus();

    const handleNavigate = (insight: SmartInsight) => {
        let mainTab = 'Signaux';
        let subTab = 'matrix'; 

        if (insight.id.includes('vol-')) { mainTab = 'Signaux'; subTab = 'math'; }
        else if (insight.id.includes('spec-')) { mainTab = 'Signaux'; subTab = 'spectral'; }
        else if (insight.id.includes('gap-')) { mainTab = 'Signaux'; subTab = 'stats'; }
        else if (insight.id.includes('clock-')) { mainTab = 'Signaux'; subTab = 'fractal'; }
        
        window.dispatchEvent(new CustomEvent('NAVIGATE_TO_MODULE', { 
            detail: { mainTab, subTab } 
        }));
    };

    if (nexusLoading) return <div className="h-28 animate-pulse bg-slate-100 dark:bg-slate-800 rounded-[2.5rem] mb-6 border border-slate-200 dark:border-slate-700"></div>;
    if (smartInsights.length === 0) return null;

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8 animate-slide-up">
            {smartInsights.map((insight) => {
                let borderColor = 'border-slate-200 dark:border-slate-700';
                let iconBg = 'bg-slate-100 text-slate-500';
                let titleColor = 'text-slate-800 dark:text-white';
                let LucideIcon = Lightbulb;

                if (insight.type === 'opportunity') {
                    borderColor = 'border-emerald-200 dark:border-emerald-800';
                    iconBg = 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600';
                    titleColor = 'text-emerald-900 dark:text-emerald-100';
                    LucideIcon = TrendingUp;
                } else if (insight.type === 'risk') {
                    borderColor = 'border-rose-200 dark:border-rose-800';
                    iconBg = 'bg-rose-100 dark:bg-rose-900/30 text-rose-600';
                    titleColor = 'text-rose-900 dark:text-rose-100';
                    LucideIcon = AlertTriangle;
                } else {
                    iconBg = 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600';
                    titleColor = 'text-indigo-900 dark:text-indigo-100';
                }

                return (
                    <div 
                        key={insight.id}
                        onClick={() => handleNavigate(insight)}
                        className={`
                            p-6 rounded-[2.5rem] border-l-4 shadow-sm relative overflow-hidden flex items-start gap-5 transition-all hover:scale-[1.02] cursor-pointer group bg-white dark:bg-slate-800
                            ${borderColor}
                            ${insight.type === 'opportunity' ? 'border-l-emerald-500' : insight.type === 'risk' ? 'border-l-rose-500' : 'border-l-indigo-500'}
                        `}
                    >
                        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-xl shadow-inner flex-shrink-0 ${iconBg}`}>
                            <LucideIcon size={24} />
                        </div>
                        
                        <div className="flex-1 min-w-0">
                            <div className="flex justify-between items-start mb-2">
                                <h4 className={`font-black text-sm uppercase tracking-tight ${titleColor}`}>
                                    {insight.title}
                                </h4>
                                <span className={`text-[10px] font-black px-2 py-1 rounded-lg border ${iconBg} bg-opacity-10 border-opacity-20`}>
                                    {insight.score}% Impact
                                </span>
                            </div>
                            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium leading-relaxed">
                                {insight.description}
                            </p>
                            <div className="mt-4 flex items-center gap-2 text-[10px] font-bold text-slate-400 group-hover:text-indigo-500 transition-colors uppercase tracking-widest">
                                <span>Voir l'analyse</span>
                                <ArrowRight className="w-3 h-3 group-hover:translate-x-1 transition-transform" />
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
};
