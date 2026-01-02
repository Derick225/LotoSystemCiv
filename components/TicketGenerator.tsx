
import React, { useState } from 'react';
import { NumberBall } from './NumberBall';
import { useToast } from './ui/Toast';
import { analyzeTicketStrength } from '../services/predictionEngine';
import { saveTicket } from '../services/userPreferencesService';
import type { TicketAnalysisResult } from '../types';
import { Wallet, Copy, RefreshCw } from 'lucide-react';
import { TicketXRay } from './TicketXRay';

interface TicketGeneratorProps {
    suggestedNumbers: number[];
    candidates: number[];
    drawName?: string;
}

type Strategy = 'safe' | 'balanced' | 'audacious' | 'chaos';

export const TicketGenerator: React.FC<TicketGeneratorProps> = ({ suggestedNumbers, candidates, drawName = 'Unknown' }) => {
    const { showToast } = useToast();
    const [strategy, setStrategy] = useState<Strategy>('balanced');
    const [ticket, setTicket] = useState<number[]>([]);
    const [audit, setAudit] = useState<TicketAnalysisResult | null>(null);
    const [isAuditing, setIsAuditing] = useState(false);

    const generateTicket = async () => {
        let selection: number[] = [];
        const poolTop = suggestedNumbers.slice(0, 5);
        const poolExtended = candidates.length > 0 ? candidates.slice(0, 15) : suggestedNumbers;
        
        switch (strategy) {
            case 'safe':
                selection = [...poolTop];
                break;
            case 'balanced':
                selection = [...poolTop.slice(0, 3)];
                const remainderBalanced = poolExtended.filter(n => !selection.includes(n));
                while(selection.length < 5 && remainderBalanced.length > 0) {
                    const idx = Math.floor(Math.random() * remainderBalanced.length);
                    selection.push(remainderBalanced[idx]);
                    remainderBalanced.splice(idx, 1);
                }
                break;
            case 'audacious':
                selection = [...poolTop.slice(0, 2)];
                const remainderAudacious = candidates.filter(n => !selection.includes(n));
                while(selection.length < 5 && remainderAudacious.length > 0) {
                    const idx = Math.floor(Math.random() * remainderAudacious.length);
                    selection.push(remainderAudacious[idx]);
                    remainderAudacious.splice(idx, 1);
                }
                break;
            case 'chaos':
                const chaosPool = [...candidates];
                while(selection.length < 5 && chaosPool.length > 0) {
                    const idx = Math.floor(Math.random() * chaosPool.length);
                    selection.push(chaosPool[idx]);
                    chaosPool.splice(idx, 1);
                }
                break;
        }
        
        while (selection.length < 5) {
             const rnd = Math.floor(Math.random() * 90) + 1;
             if (!selection.includes(rnd)) selection.push(rnd);
        }

        const finalTicket = selection.sort((a,b) => a-b);
        setTicket(finalTicket);
        
        if (drawName !== 'Unknown') {
            setIsAuditing(true);
            try {
                const auditResult = await analyzeTicketStrength(finalTicket, drawName);
                setAudit(auditResult);
            } catch (e) {
                setAudit(null);
            } finally {
                setIsAuditing(false);
            }
        } else {
            setAudit(null);
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
            strategy: strategy
        });
        showToast("Ticket sauvegardé dans votre Portefeuille.", "success");
    };

    const getAuditColor = (score: number) => {
        if (score >= 80) return 'bg-green-100 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-800';
        if (score >= 50) return 'bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-300 dark:border-yellow-800';
        return 'bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800';
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
                <button onClick={() => setStrategy('safe')} className={`px-4 py-2 rounded-lg text-xs font-bold whitespace-nowrap transition ${strategy === 'safe' ? 'bg-green-100 text-green-700 border border-green-300 dark:bg-green-900/40 dark:text-green-300 dark:border-green-700' : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'}`}>🛡️ Prudent</button>
                <button onClick={() => setStrategy('balanced')} className={`px-4 py-2 rounded-lg text-xs font-bold whitespace-nowrap transition ${strategy === 'balanced' ? 'bg-blue-100 text-blue-700 border border-blue-300 dark:bg-blue-900/40 dark:text-blue-300 dark:border-blue-700' : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'}`}>⚖️ Équilibré</button>
                <button onClick={() => setStrategy('audacious')} className={`px-4 py-2 rounded-lg text-xs font-bold whitespace-nowrap transition ${strategy === 'audacious' ? 'bg-orange-100 text-orange-700 border border-orange-300 dark:bg-orange-900/40 dark:text-orange-300 dark:border-orange-700' : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'}`}>🚀 Audacieux</button>
                <button onClick={() => setStrategy('chaos')} className={`px-4 py-2 rounded-lg text-xs font-bold whitespace-nowrap transition ${strategy === 'chaos' ? 'bg-purple-100 text-purple-700 border border-purple-300 dark:bg-purple-900/40 dark:text-purple-300 dark:border-purple-700' : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'}`}>🌀 Chaos</button>
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
                            <button onClick={generateTicket} className="p-2 bg-slate-100 dark:bg-slate-700 rounded-full text-slate-500 hover:text-indigo-600 transition" title="Regénérer"><RefreshCw size={16}/></button>
                            <button onClick={copyTicket} className="px-6 py-2 bg-slate-800 text-white rounded-full text-xs font-bold shadow-md transition transform active:scale-95 flex items-center gap-2">
                                <Copy size={14}/> Copier
                            </button>
                            <button onClick={handleSaveToWallet} className="px-6 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-full text-xs font-bold shadow-md transition transform active:scale-95 flex items-center gap-2">
                                <Wallet size={14}/> Sauvegarder
                            </button>
                        </div>
                        
                        {/* X-Ray Visual Analysis */}
                        <div className="w-full mt-4">
                            <TicketXRay numbers={ticket} score={audit?.score || 0} showTitle={false} />
                        </div>
                        
                        {audit && audit.warnings.length > 0 && (
                            <div className="mt-2 text-[10px] text-orange-500 text-center max-w-sm">
                                ⚠️ Note: {audit.warnings[0]}
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="text-center">
                        <button onClick={generateTicket} className="px-8 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold shadow-lg transition transform active:scale-95">
                            Générer ma grille
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};
