
import React, { useState } from 'react';
import { Prediction } from '../types';
import { NumberBall } from './NumberBall';
import { calculateACValue } from '../services/mathService';
import { saveTicket } from '../services/userPreferencesService';
import { useToast } from './ui/Toast';
import { Wand2, RefreshCw, Save, Sliders, ShieldAlert } from 'lucide-react';
import { motion } from 'framer-motion';
import { audioEngine } from '../utils/audioEngine';

interface TicketGeneratorProps {
    prediction: Prediction | null;
    drawName: string;
}

export const TicketGenerator: React.FC<TicketGeneratorProps> = ({ prediction, drawName }) => {
    const { showToast } = useToast();
    const [ticket, setTicket] = useState<number[]>([]);
    const [filters, setFilters] = useState({
        minSum: 120,
        maxSum: 280,
        minAc: 6,
        forceOdd: true
    });

    const generate = () => {
        audioEngine.play('click');
        if (!prediction) return;
        
        // Pool de numéros : Suggestions + Candidats (Outsiders)
        const pool = [...prediction.suggestedNumbers, ...prediction.candidates];
        
        let attempts = 0;
        let bestCandidate: number[] = [];
        let bestScore = -1;

        while (attempts < 100) {
            // Mélange et sélection
            const shuffled = [...pool].sort(() => 0.5 - Math.random());
            const candidate = shuffled.slice(0, 5).sort((a,b) => a-b);
            
            // Validation des filtres
            const sum = candidate.reduce((a,b) => a+b, 0);
            const ac = calculateACValue(candidate);
            const odds = candidate.filter(n => n % 2 !== 0).length;
            
            let score = 0;
            if (sum >= filters.minSum && sum <= filters.maxSum) score += 20;
            if (ac >= filters.minAc) score += 30;
            if (!filters.forceOdd || (odds >= 2 && odds <= 3)) score += 20;
            
            // Bonus si numéros "Suggested" (Top IA) sont présents
            const topHits = candidate.filter(n => prediction.suggestedNumbers.includes(n)).length;
            score += topHits * 10;

            if (score > bestScore) {
                bestScore = score;
                bestCandidate = candidate;
            }
            
            if (score >= 90) break; // Ticket parfait trouvé
            attempts++;
        }

        setTicket(bestCandidate);
        audioEngine.play('success');
        showToast(`Ticket généré (Score Qualité: ${bestScore})`, "success");
    };

    const handleSave = async () => {
        audioEngine.play('click');
        if (ticket.length !== 5) return;
        await saveTicket({
            numbers: ticket,
            drawName,
            strategy: 'Générateur Tactique'
        });
        audioEngine.play('success');
        showToast("Ticket sauvegardé.", "success");
    };

    return (
        <div className="bg-white dark:bg-slate-900 p-6 rounded-[2.5rem] border border-slate-200 dark:border-slate-800 shadow-xl">
            <div className="flex justify-between items-center mb-6">
                <h4 className="text-sm font-black text-slate-800 dark:text-white uppercase tracking-widest flex items-center gap-2">
                    <Wand2 size={16} className="text-indigo-500"/> Générateur Flash
                </h4>
                <button onClick={() => setFilters(prev => ({...prev, forceOdd: !prev.forceOdd}))} className={`p-2 rounded-xl border ${filters.forceOdd ? 'bg-indigo-100 dark:bg-indigo-900/30 border-indigo-200 dark:border-indigo-800 text-indigo-600' : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-400'}`}>
                    <Sliders size={14}/>
                </button>
            </div>

            <div className="bg-slate-50 dark:bg-slate-950/50 p-6 rounded-3xl border border-slate-100 dark:border-slate-800 mb-6 flex flex-col items-center justify-center min-h-[120px]">
                {ticket.length > 0 ? (
                    <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="flex gap-2">
                        {ticket.map(n => <NumberBall key={n} number={n} size="md" />)}
                    </motion.div>
                ) : (
                    <span className="text-xs text-slate-400 font-bold uppercase tracking-widest">En attente de génération...</span>
                )}
            </div>

            <div className="flex gap-3">
                <button 
                    onClick={generate} 
                    disabled={!prediction}
                    className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-black text-xs uppercase tracking-widest shadow-lg flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-50"
                >
                    <RefreshCw size={14}/> {ticket.length > 0 ? 'Régénérer' : 'Générer'}
                </button>
                {ticket.length > 0 && (
                    <button 
                        onClick={handleSave}
                        className="px-6 py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-black shadow-lg transition-all active:scale-95"
                    >
                        <Save size={16}/>
                    </button>
                )}
            </div>
            
            {ticket.length > 0 && calculateACValue(ticket) < 6 && (
                <div className="mt-4 flex items-center gap-2 text-[10px] text-amber-500 font-bold bg-amber-50 dark:bg-amber-900/20 p-2 rounded-lg border border-amber-200 dark:border-amber-800/30">
                    <ShieldAlert size={12}/> Attention: Complexité faible détectée.
                </div>
            )}
        </div>
    );
};
