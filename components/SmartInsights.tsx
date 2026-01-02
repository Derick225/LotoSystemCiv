
import React from 'react';
import type { SmartInsight } from '../types';
import { useNexus } from './NexusProvider';
import { ArrowRight } from 'lucide-react';

interface SmartInsightsProps {
    drawName: string; // Updated
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
        
        // Navigation multi-niveaux : 1. Onglet Principal (DrawDetails) 2. Sous-onglet (SignalHub)
        window.dispatchEvent(new CustomEvent('NAVIGATE_TO_MODULE', { 
            detail: { mainTab, subTab } 
        }));
    };

    if (nexusLoading) return <div className="h-24 animate-pulse bg-slate-100 dark:bg-slate-800 rounded-2xl mb-6 border border-slate-200 dark:border-slate-700"></div>;
    if (smartInsights.length === 0) return null;

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6 animate-slide-up">
            {smartInsights.map((insight) => (
                <div 
                    key={insight.id}
                    onClick={() => handleNavigate(insight)}
                    className={`
                        p-4 rounded-xl border shadow-sm relative overflow-hidden flex items-start gap-4 transition-all hover:scale-[1.02] cursor-pointer group
                        ${insight.type === 'opportunity' 
                            ? 'bg-gradient-to-br from-green-50 to-emerald-100 dark:from-green-900/30 dark:to-emerald-900/20 border-green-200 dark:border-green-800' 
                            : insight.type === 'risk'
                                ? 'bg-gradient-to-br from-red-50 to-orange-100 dark:from-red-900/30 dark:to-orange-900/20 border-red-200 dark:border-red-800'
                                : 'bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-blue-900/30 dark:to-indigo-900/20 border-blue-200 dark:border-blue-800'
                        }
                    `}
                >
                    <div className={`
                        w-10 h-10 rounded-full flex items-center justify-center text-xl shadow-inner flex-shrink-0 transition-transform group-hover:scale-110
                        ${insight.type === 'opportunity' ? 'bg-white/80 text-green-600' : insight.type === 'risk' ? 'bg-white/80 text-red-600' : 'bg-white/80 text-blue-600'}
                    `}>
                        {insight.icon}
                    </div>
                    
                    <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-start">
                            <h4 className={`font-bold text-sm truncate ${insight.type === 'opportunity' ? 'text-green-800 dark:text-green-300' : insight.type === 'risk' ? 'text-red-800 dark:text-red-300' : 'text-blue-800 dark:text-blue-300'}`}>
                                {insight.title}
                            </h4>
                            <span className="text-[10px] font-bold bg-white/50 px-2 py-0.5 rounded-full text-gray-600 dark:text-gray-300 border border-black/5 group-hover:bg-white transition-colors">
                                {insight.score}%
                            </span>
                        </div>
                        <p className="text-xs text-gray-600 dark:text-gray-400 mt-1 leading-relaxed font-medium line-clamp-2">
                            {insight.description}
                        </p>
                        <div className="mt-2 flex items-center gap-1 text-[10px] font-bold opacity-0 group-hover:opacity-100 transition-opacity uppercase tracking-wider">
                            <span>Analyser</span>
                            <ArrowRight className="w-3 h-3" />
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );
};
