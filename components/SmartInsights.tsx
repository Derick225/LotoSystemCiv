
import React from 'react';
import type { SmartInsight } from '../types';
import { useNexus } from './NexusProvider';
import { ArrowRight, TrendingUp, AlertTriangle, Lightbulb, Zap, Clock, Activity, BarChart2 } from 'lucide-react';
import { audioEngine } from '../../utils/audioEngine';

interface SmartInsightsProps {
    drawName: string;
}

export const SmartInsights: React.FC<SmartInsightsProps> = ({ drawName }) => {
    const { smartInsights, loading: nexusLoading } = useNexus();

    const handleNavigate = (insight: SmartInsight) => {
        audioEngine.play('click');
        let mainTab = 'Signaux';
        let subTab = 'stats'; 

        // Routage intelligent basé sur l'ID de l'insight
        if (insight.id.includes('vol-')) { 
            mainTab = 'Signaux'; subTab = 'math'; // Volatilité -> Maths
        }
        else if (insight.id.includes('spec-') || insight.id.includes('hybrid-')) { 
            mainTab = 'Signaux'; subTab = 'spectral'; // Spectral -> Spectral
        }
        else if (insight.id.includes('gap-')) { 
            mainTab = 'Signaux'; subTab = 'stats'; // Gaps -> Stats
        }
        else if (insight.id.includes('clock-')) { 
            mainTab = 'Signaux'; subTab = 'temporal'; // Cycles -> Temporal
        }
        
        window.dispatchEvent(new CustomEvent('NAVIGATE_TO_MODULE', { 
            detail: { mainTab, subTab } 
        }));
    };

    if (nexusLoading) return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            <div className="h-32 animate-pulse bg-slate-900/50 rounded-[2.5rem] border border-slate-800"></div>
            <div className="h-32 animate-pulse bg-slate-900/50 rounded-[2.5rem] border border-slate-800"></div>
        </div>
    );
    
    if (smartInsights.length === 0) return null;

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8 animate-slide-up">
            {smartInsights.map((insight) => {
                let theme = {
                    border: 'border-indigo-500',
                    bg: 'bg-white dark:bg-slate-800',
                    iconBg: 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600',
                    text: 'text-indigo-900 dark:text-indigo-100',
                    icon: Lightbulb
                };

                if (insight.type === 'opportunity') {
                    theme = {
                        border: 'border-l-emerald-500',
                        bg: 'bg-white dark:bg-slate-800',
                        iconBg: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600',
                        text: 'text-emerald-900 dark:text-emerald-100',
                        icon: Zap
                    };
                } else if (insight.type === 'risk') {
                    theme = {
                        border: 'border-l-rose-500',
                        bg: 'bg-white dark:bg-slate-800',
                        iconBg: 'bg-rose-100 dark:bg-rose-900/30 text-rose-600',
                        text: 'text-rose-900 dark:text-rose-100',
                        icon: AlertTriangle
                    };
                }

                // Icône contextuelle selon le contenu
                if (insight.id.includes('clock')) theme.icon = Clock;
                if (insight.id.includes('spec')) theme.icon = Activity;
                if (insight.id.includes('gap')) theme.icon = BarChart2;

                return (
                    <div 
                        key={insight.id}
                        onClick={() => handleNavigate(insight)}
                        className={`
                            p-6 rounded-[2.5rem] border-l-4 shadow-xl relative overflow-hidden flex items-start gap-5 transition-all hover:scale-[1.02] cursor-pointer group
                            ${theme.bg} border-slate-200 dark:border-slate-800 ${theme.border}
                        `}
                    >
                        <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shadow-inner flex-shrink-0 ${theme.iconBg} group-hover:scale-110 transition-transform`}>
                            <theme.icon size={28} />
                        </div>
                        
                        <div className="flex-1 min-w-0">
                            <div className="flex justify-between items-start mb-2">
                                <h4 className={`font-black text-sm uppercase tracking-tight truncate pr-2 ${theme.text}`}>
                                    {insight.title}
                                </h4>
                                <span className={`text-[9px] font-black px-2 py-1 rounded-lg border uppercase tracking-widest ${theme.iconBg} bg-opacity-20 border-opacity-20`}>
                                    Impact {insight.score}%
                                </span>
                            </div>
                            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium leading-relaxed line-clamp-2">
                                {insight.description}
                            </p>
                            <div className="mt-4 flex items-center gap-2 text-[10px] font-bold text-slate-400 group-hover:text-indigo-500 transition-colors uppercase tracking-widest">
                                <span>Lancer l'Analyse</span>
                                <ArrowRight className="w-3 h-3 group-hover:translate-x-1 transition-transform" />
                            </div>
                        </div>
                        
                        {/* Decor */}
                        <div className={`absolute -bottom-6 -right-6 w-24 h-24 rounded-full opacity-5 pointer-events-none ${theme.iconBg.split(' ')[0]}`}></div>
                    </div>
                );
            })}
        </div>
    );
};
