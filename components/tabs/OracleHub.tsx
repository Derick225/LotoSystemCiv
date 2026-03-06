
import React, { useState, useEffect } from 'react';
import { PredictionTab } from './PredictionTab';
import { MetaAnalystTab } from './MetaAnalystTab';
import { IntelligenceTab } from './IntelligenceTab';
import { OrchestrationTab } from './OrchestrationTab';
import { FeedbackLoopTab } from './FeedbackLoopTab';
import { ConvergenceTab } from './ConvergenceTab';
import { useNexus } from '../NexusProvider';
import { getStrategyName } from '../../services/predictionEngine';
import { Sparkles, Medal, BrainCircuit, Network, AlertTriangle, ShieldCheck, Target, History, Hexagon, ScanBarcode } from 'lucide-react';
import { OracleLiveAssistant } from '../OracleLiveAssistant';
import { TicketScanner } from '../TicketScanner';

interface OracleHubProps { drawName: string; }

export const OracleHub: React.FC<OracleHubProps> = ({ drawName }) => {
    const { regime: globalRegime, loading: nexusLoading, globalWeights } = useNexus();
    
    // Platinum est maintenant le moteur principal, mais on expose la Synthèse en premier plan
    const [subTab, setSubTab] = useState<'oracle' | 'platinum' | 'intel' | 'orch' | 'feedback' | 'convergence' | 'vision'>('platinum');
    const [activeStrategy, setActiveStrategy] = useState("Standard");
    
    useEffect(() => {
        if (globalWeights) {
            setActiveStrategy(getStrategyName(globalWeights));
        }
    }, [globalWeights]);

    // SYMBIOSE : Écouteur d'événements
    useEffect(() => {
        const handleNavigation = (e: CustomEvent) => {
            if (e.detail?.mainTab === 'Oracle' && e.detail?.subTab) {
                setSubTab(e.detail.subTab as any);
                const contentElement = document.getElementById('oracle-content');
                if (contentElement) contentElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        };
        window.addEventListener('NAVIGATE_TO_MODULE' as any, handleNavigation);
        return () => window.removeEventListener('NAVIGATE_TO_MODULE' as any, handleNavigation);
    }, []);

    const subTabs = [
        { id: 'platinum', label: 'Platinum Elite', icon: <Medal size={16}/>, color: 'text-amber-500', bg: 'hover:bg-amber-50' },
        { id: 'convergence', label: 'Synthèse', icon: <Hexagon size={16}/>, color: 'text-indigo-500', bg: 'hover:bg-indigo-50' },
        { id: 'vision', label: 'Vision OCR', icon: <ScanBarcode size={16}/>, color: 'text-cyan-500', bg: 'hover:bg-cyan-50' },
        { id: 'oracle', label: 'Oracle Base', icon: <Sparkles size={16}/>, color: 'text-violet-500', bg: 'hover:bg-violet-50' },
        { id: 'intel', label: 'Narratif', icon: <BrainCircuit size={16}/>, color: 'text-emerald-500', bg: 'hover:bg-emerald-50' },
        { id: 'orch', label: 'Orchestra', icon: <Network size={16}/>, color: 'text-pink-500', bg: 'hover:bg-pink-50' },
        { id: 'feedback', label: 'Leçons', icon: <History size={16}/>, color: 'text-blue-500', bg: 'hover:bg-blue-50' }
    ];

    if (nexusLoading) return <div className="p-20 text-center animate-pulse text-indigo-500">Connexion Oracle...</div>;

    return (
        <div className="space-y-8 animate-fade-in relative">
            <div className="flex flex-col md:flex-row justify-between items-center gap-6 relative z-20 bg-nexus-950 py-2 -mx-4 px-4 md:mx-0 md:px-0 md:bg-transparent">
                <div className="w-full md:w-auto">
                    <div className="flex bg-slate-100 dark:bg-slate-800/80 p-1.5 rounded-[2.5rem] w-fit border border-slate-200 dark:border-slate-700 overflow-x-auto scrollbar-hide max-w-full shadow-inner">
                        {subTabs.map((tab) => (
                            <button 
                                key={tab.id}
                                onClick={() => setSubTab(tab.id as any)} 
                                className={`
                                    px-5 py-3 rounded-[1.8rem] text-[10px] font-black uppercase tracking-widest transition-all duration-300 flex items-center gap-2 whitespace-nowrap
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
                </div>
                
                <div className="flex flex-wrap items-center gap-2">
                    <div className={`flex items-center gap-3 px-4 py-2 rounded-2xl border ${globalRegime?.regime === 'CHAOS' ? 'bg-rose-50 border-rose-200 text-rose-600 animate-pulse' : 'bg-indigo-50 border-indigo-100 text-indigo-700'}`}>
                        {globalRegime?.regime === 'CHAOS' ? <AlertTriangle size={16}/> : <ShieldCheck size={16}/>}
                        <span className="text-[10px] font-black uppercase">Régime {globalRegime?.regime || 'Analyse...'}</span>
                    </div>
                </div>
            </div>

            <div id="oracle-content" className="animate-slide-up transition-all duration-500 min-h-[600px] scroll-mt-[300px] md:scroll-mt-[280px]">
                {subTab === 'convergence' && <ConvergenceTab drawName={drawName} />}
                {subTab === 'vision' && <TicketScanner />}
                {subTab === 'oracle' && <PredictionTab drawName={drawName} />}
                {subTab === 'feedback' && <FeedbackLoopTab drawName={drawName} />}
                {subTab === 'platinum' && <MetaAnalystTab drawName={drawName} />}
                {subTab === 'intel' && <IntelligenceTab drawName={drawName} />}
                {subTab === 'orch' && <OrchestrationTab drawName={drawName} />}
            </div>
            
            <OracleLiveAssistant drawName={drawName} />
        </div>
    );
};
