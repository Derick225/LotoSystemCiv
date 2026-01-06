
import React, { useState, useEffect } from 'react';
import { PredictionTab } from './tabs/PredictionTab';
import { MetaAnalystTab } from './tabs/MetaAnalystTab';
import { IntelligenceTab } from './tabs/IntelligenceTab';
import { OrchestrationTab } from './tabs/OrchestrationTab';
import { useNexus } from './NexusProvider';
import { getStrategyName } from '../services/predictionEngine';
import { Sparkles, Medal, BrainCircuit, Network, AlertTriangle, ShieldCheck, Target } from 'lucide-react';
import { OracleLiveAssistant } from './OracleLiveAssistant';

interface OracleHubProps { drawName: string; }

export const OracleHub: React.FC<OracleHubProps> = ({ drawName }) => {
    // Récupération du régime calculé globalement par le Provider
    const { regime: globalRegime, loading: nexusLoading, globalWeights } = useNexus();
    
    const [subTab, setSubTab] = useState<'oracle' | 'platinum' | 'intel' | 'orch'>('oracle');
    const [activeStrategy, setActiveStrategy] = useState("Standard");
    
    useEffect(() => {
        if (globalWeights) {
            setActiveStrategy(getStrategyName(globalWeights));
        }
    }, [globalWeights]);

    const subTabs = [
        { id: 'oracle', label: 'Oracle Base', icon: <Sparkles size={16}/>, color: 'text-indigo-500', bg: 'hover:bg-indigo-50' },
        { id: 'platinum', label: 'Platinum Fusion', icon: <Medal size={16}/>, color: 'text-amber-500', bg: 'hover:bg-amber-50' },
        { id: 'intel', label: 'IA Narrative', icon: <BrainCircuit size={16}/>, color: 'text-emerald-500', bg: 'hover:bg-emerald-50' },
        { id: 'orch', label: 'Orchestration', icon: <Network size={16}/>, color: 'text-pink-500', bg: 'hover:bg-pink-50' }
    ];

    if (nexusLoading) return <div className="p-20 text-center animate-pulse text-indigo-500">Connexion Oracle...</div>;

    return (
        <div className="space-y-8 animate-fade-in relative">
            <div className="flex flex-col md:flex-row justify-between items-center gap-6">
                <div className="flex bg-slate-100 dark:bg-slate-800/80 p-1.5 rounded-[2.5rem] w-fit border border-slate-200 dark:border-slate-700 overflow-x-auto scrollbar-hide max-w-full shadow-inner">
                    {subTabs.map((tab) => (
                        <button 
                            key={tab.id}
                            onClick={() => setSubTab(tab.id as any)} 
                            className={`
                                px-6 py-3.5 rounded-[1.8rem] text-[10px] font-black uppercase tracking-widest transition-all duration-300 flex items-center gap-3 whitespace-nowrap
                                ${subTab === tab.id 
                                    ? 'bg-white dark:bg-slate-700 shadow-xl text-slate-900 dark:text-white scale-105' 
                                    : `text-slate-400 ${tab.bg} dark:hover:bg-slate-800`
                                }
                            `}
                        >
                            <span className={subTab === tab.id ? tab.color : ''}>{tab.icon}</span>
                            {tab.label}
                        </button>
                    ))}
                </div>
                
                <div className="flex flex-wrap items-center gap-2">
                    <div className={`flex items-center gap-3 px-4 py-2 rounded-2xl border ${globalRegime?.regime === 'CHAOS' ? 'bg-rose-50 border-rose-200 text-rose-600 animate-pulse' : 'bg-indigo-50 border-indigo-100 text-indigo-700'}`}>
                        {globalRegime?.regime === 'CHAOS' ? <AlertTriangle size={16}/> : <ShieldCheck size={16}/>}
                        <span className="text-[10px] font-black uppercase">Régime {globalRegime?.regime || 'Analyse...'}</span>
                    </div>
                    
                    <div className="flex items-center gap-2 px-4 py-2 rounded-2xl border bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800">
                        <Target size={16} className="text-slate-500" />
                        <span className="text-[10px] font-black uppercase text-slate-600 dark:text-slate-400 truncate max-w-[150px]" title={activeStrategy}>
                            Strat: {activeStrategy}
                        </span>
                    </div>
                </div>
            </div>

            <div className="animate-slide-up transition-all duration-500">
                {subTab === 'oracle' ? <PredictionTab drawName={drawName} /> : 
                 subTab === 'platinum' ? <MetaAnalystTab drawName={drawName} /> : 
                 subTab === 'intel' ? <IntelligenceTab drawName={drawName} /> : 
                 <OrchestrationTab drawName={drawName} />}
            </div>
            
            <OracleLiveAssistant drawName={drawName} />
        </div>
    );
};
