
import React, { useState } from 'react';
import { NumberBall } from './NumberBall';
import { useToast } from './ui/Toast';
import { analyzeTicketStrength } from '../services/predictionEngine';
import { saveTicket } from '../services/userPreferencesService';
import { getFullOrchestrationAnalysis } from '../services/orchestrationService';
import { useNexus } from './NexusProvider';
import type { TicketAnalysisResult } from '../types';
import { Wallet, Copy, RefreshCw, Cpu, Shield, Zap, AlertTriangle } from 'lucide-react';
import { TicketXRay } from './TicketXRay';

interface TicketGeneratorProps {
    suggestedNumbers: number[];
    candidates: number[];
    drawName?: string;
}

type Strategy = 'safe' | 'balanced' | 'audacious' | 'chaos';

export const TicketGenerator: React.FC<TicketGeneratorProps> = ({ suggestedNumbers, candidates, drawName = 'Unknown' }) => {
    const { showToast } = useToast();
    const { history, stats, gaps, spectral } = useNexus(); // Accès aux données spectrales
    
    const [strategy, setStrategy] = useState<Strategy>('balanced');
    const [ticket, setTicket] = useState<number[]>([]);
    const [audit, setAudit] = useState<TicketAnalysisResult | null>(null);
    const [isAuditing, setIsAuditing] = useState(false);
    const [isGenerating, setIsGenerating] = useState(false);

    // Fonction de sélection pondérée (Roulette Wheel Selection)
    const selectWeighted = (pool: {n: number, w: number}[]) => {
        const totalWeight = pool.reduce((acc, item) => acc + item.w, 0);
        let random = Math.random() * totalWeight;
        for (const item of pool) {
            random -= item.w;
            if (random <= 0) return item.n;
        }
        return pool[0].n; // Fallback
    };

    const generateTicket = async () => {
        setIsGenerating(true);
        let selection: Set<number> = new Set();
        
        try {
            // --- STRATEGIE SAFE : Suivi strict de l'IA ---
            if (strategy === 'safe') {
                suggestedNumbers.slice(0, 5).forEach(n => selection.add(n));
            }
            
            // --- STRATEGIE BALANCED : IA + Fréquence (King Numbers) ---
            else if (strategy === 'balanced') {
                suggestedNumbers.slice(0, 3).forEach(n => selection.add(n));
                const hotNumbers = stats.slice(0, 10).map(s => s.number);
                const availableHot = hotNumbers.filter(n => !selection.has(n));
                
                while (selection.size < 5 && availableHot.length > 0) {
                    const idx = Math.floor(Math.random() * availableHot.length);
                    selection.add(availableHot[idx]);
                    availableHot.splice(idx, 1);
                }
            }
            
            // --- STRATEGIE AUDACIOUS : Orchestration (Patterns T-1) ---
            else if (strategy === 'audacious') {
                const orchestration = await getFullOrchestrationAnalysis(drawName, history);
                const patternCandidates = orchestration.topCandidates.map(c => c.number);
                suggestedNumbers.slice(0, 2).forEach(n => selection.add(n));
                
                const availablePatterns = patternCandidates.filter(n => !selection.has(n));
                while (selection.size < 5 && availablePatterns.length > 0) {
                    const idx = Math.floor(Math.random() * Math.min(5, availablePatterns.length)); 
                    selection.add(availablePatterns[idx]);
                    availablePatterns.splice(idx, 1);
                }
            }
            
            // --- STRATEGIE CHAOS : Contre-Tendance (Gaps Critiques) ---
            else if (strategy === 'chaos') {
                const coldNumbers = [...gaps].sort((a, b) => b.gap - a.gap).slice(0, 15).map(g => g.number);
                while (selection.size < 5 && coldNumbers.length > 0) {
                    const idx = Math.floor(Math.random() * coldNumbers.length);
                    selection.add(coldNumbers[idx]);
                    coldNumbers.splice(idx, 1);
                }
            }

            // REMPLISSAGE INTELLIGENT (SMART FILL)
            // Au lieu du random, on utilise l'énergie spectrale pour boucher les trous
            if (selection.size < 5) {
                // Création d'un pool pondéré par l'énergie spectrale
                const weightedPool = Array.from({length: 90}, (_, i) => i + 1)
                    .filter(n => !selection.has(n))
                    .map(n => {
                        const spec = spectral.find(s => s.number === n);
                        // Poids minimal de 5 pour laisser une chance à tous
                        return { n, w: spec ? spec.energy + 5 : 10 };
                    });

                while (selection.size < 5) {
                    const pick = selectWeighted(weightedPool);
                    selection.add(pick);
                    // On retire le numéro du pool pour ne pas le reprendre
                    const idx = weightedPool.findIndex(i => i.n === pick);
                    if (idx !== -1) weightedPool.splice(idx, 1);
                }
            }

            const finalTicket = Array.from(selection).sort((a,b) => a-b);
            setTicket(finalTicket);
            
            if (drawName !== 'Unknown') {
                setIsAuditing(true);
                const auditResult = await analyzeTicketStrength(finalTicket, drawName);
                setAudit(auditResult);
                setIsAuditing(false);
            }

        } catch (e) {
            console.error("Gen Error", e);
            showToast("Erreur de génération vectorielle.", "error");
        } finally {
            setIsGenerating(false);
        }
    };

    const copyTicket = async () => {
        if(ticket.length === 0) return;
        try {
            await navigator.clipboard.writeText(ticket.join('-'));
            showToast("Ticket copié !", "success");
        } catch (err) {
            showToast("Erreur copie.", "error");
        }
    };

    const handleSaveToWallet = async () => {
        if (ticket.length === 0) return;
        await saveTicket({
            numbers: ticket,
            drawName: drawName,
            strategy: strategy.toUpperCase()
        });
        showToast("Ticket sauvegardé dans votre Portefeuille.", "success");
    };

    const getAuditColor = (score: number) => {
        if (score >= 80) return 'bg-green-100 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-800';
        if (score >= 50) return 'bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-300 dark:border-yellow-800';
        return 'bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800';
    };

    const getStrategyIcon = (s: Strategy) => {
        switch(s) {
            case 'safe': return <Shield size={14}/>;
            case 'balanced': return <Cpu size={14}/>;
            case 'audacious': return <Zap size={14}/>;
            case 'chaos': return <AlertTriangle size={14}/>;
        }
    };

    return (
        <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-lg border border-indigo-200 dark:border-indigo-900/50 mt-6 animate-fade-in">
            <div className="flex justify-between items-center mb-4">
                <h3 className="font-bold text-gray-800 dark:text-white flex items-center gap-2">
                    <span className="text-2xl">🎫</span> Studio de Tickets
                </h3>
                <span className="text-xs text-gray-500 bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">Générateur Stratégique</span>
            </div>
            
            <div className="flex gap-2 mb-6 overflow-x-auto pb-2 scrollbar-hide">
                <button onClick={() => setStrategy('safe')} className={`px-4 py-3 rounded-xl text-xs font-black uppercase tracking-widest whitespace-nowrap transition flex items-center gap-2 ${strategy === 'safe' ? 'bg-green-100 text-green-700 border border-green-300 dark:bg-green-900/40 dark:text-green-300 dark:border-green-700' : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'}`}>
                    <Shield size={14}/> Prudent
                </button>
                <button onClick={() => setStrategy('balanced')} className={`px-4 py-3 rounded-xl text-xs font-black uppercase tracking-widest whitespace-nowrap transition flex items-center gap-2 ${strategy === 'balanced' ? 'bg-blue-100 text-blue-700 border border-blue-300 dark:bg-blue-900/40 dark:text-blue-300 dark:border-blue-700' : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'}`}>
                    <Cpu size={14}/> Équilibré
                </button>
                <button onClick={() => setStrategy('audacious')} className={`px-4 py-3 rounded-xl text-xs font-black uppercase tracking-widest whitespace-nowrap transition flex items-center gap-2 ${strategy === 'audacious' ? 'bg-orange-100 text-orange-700 border border-orange-300 dark:bg-orange-900/40 dark:text-orange-300 dark:border-orange-700' : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'}`}>
                    <Zap size={14}/> Audacieux
                </button>
                <button onClick={() => setStrategy('chaos')} className={`px-4 py-3 rounded-xl text-xs font-black uppercase tracking-widest whitespace-nowrap transition flex items-center gap-2 ${strategy === 'chaos' ? 'bg-purple-100 text-purple-700 border border-purple-300 dark:bg-purple-900/40 dark:text-purple-300 dark:border-purple-700' : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'}`}>
                    <AlertTriangle size={14}/> Chaos
                </button>
            </div>

            <div className="flex flex-col items-center justify-center bg-gray-50 dark:bg-gray-900/50 rounded-xl p-6 border-2 border-dashed border-gray-300 dark:border-gray-700 min-h-[140px] relative">
                {ticket.length > 0 ? (
                    <div className="animate-scale-in flex flex-col items-center gap-4 w-full relative z-10">
                        {isAuditing ? (
                            <span className="text-[10px] font-bold bg-gray-200 dark:bg-gray-700 px-2 py-1 rounded animate-pulse text-gray-500">Audit en cours...</span>
                        ) : audit ? (
                            <div className={`px-3 py-1 rounded-full border text-xs font-bold flex items-center gap-2 ${getAuditColor(audit.score)}`}>
                                <span>{audit.verdict} ({audit.score}%)</span>
                                {audit.score >= 80 && <span>✨</span>}
                            </div>
                        ) : null}

                        <div className="flex gap-2 md:gap-4 flex-wrap justify-center">
                            {ticket.map(n => <NumberBall key={n} number={n} size="md" />)}
                        </div>
                        
                        <div className="flex gap-3 mt-4">
                            <button onClick={generateTicket} disabled={isGenerating} className="p-3 bg-slate-100 dark:bg-slate-700 rounded-full text-slate-500 hover:text-indigo-600 transition disabled:opacity-50" title="Regénérer">
                                <RefreshCw size={16} className={isGenerating ? "animate-spin" : ""}/>
                            </button>
                            <button onClick={copyTicket} className="px-6 py-2 bg-slate-800 text-white rounded-full text-xs font-bold shadow-md transition transform active:scale-95 flex items-center gap-2">
                                <Copy size={14}/> Copier
                            </button>
                            <button onClick={handleSaveToWallet} className="px-6 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-full text-xs font-bold shadow-md transition transform active:scale-95 flex items-center gap-2">
                                <Wallet size={14}/> Sauvegarder
                            </button>
                        </div>
                        
                        <div className="w-full mt-4">
                            <TicketXRay numbers={ticket} score={audit?.score || 0} showTitle={false} />
                        </div>
                        
                        {audit && audit.warnings.length > 0 && (
                            <div className="mt-2 text-[10px] text-orange-500 text-center max-w-sm bg-orange-500/10 p-2 rounded-lg border border-orange-500/20">
                                ⚠️ Note: {audit.warnings[0]}
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="text-center">
                        <p className="text-xs text-slate-400 mb-4 font-medium">Sélectionnez une stratégie pour calculer un ticket optimal.</p>
                        <button onClick={generateTicket} disabled={isGenerating} className="px-8 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold shadow-lg transition transform active:scale-95 flex items-center gap-2 mx-auto">
                            {isGenerating ? <RefreshCw className="animate-spin" size={16}/> : getStrategyIcon(strategy)}
                            Générer ma grille
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};
