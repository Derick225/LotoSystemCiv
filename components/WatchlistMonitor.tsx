
import React, { useState, useEffect } from 'react';
import { getWatchlist, removeFromWatchlist } from '../services/userPreferencesService';
import { getDailySummary } from '../services/lotteryService';
import { NumberBall } from './NumberBall';
import { Eye, Bell, X, CheckCircle2, Clock, Zap } from 'lucide-react';
import { useToast } from './ui/Toast';

export const WatchlistMonitor: React.FC = () => {
    const { showToast } = useToast();
    const [watchlist, setWatchlist] = useState<number[]>([]);
    const [hits, setHits] = useState<Record<number, { time: string, draw: string }[]>>({});
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadStatus();
        const interval = setInterval(loadStatus, 30000); // Rafraîchir toutes les 30s
        return () => clearInterval(interval);
    }, []);

    const loadStatus = async () => {
        const list = getWatchlist();
        setWatchlist(list);
        
        const days = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
        const today = days[new Date().getDay()];
        
        try {
            const summary = await getDailySummary(today);
            const newHits: Record<number, { time: string, draw: string }[]> = {};
            
            list.forEach(num => {
                const foundIn = summary
                    .filter(s => s.result && s.result.gagnants.includes(num))
                    .map(s => ({ time: s.time, draw: s.name }));
                
                if (foundIn.length > 0) newHits[num] = foundIn;
            });
            
            setHits(newHits);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const handleRemove = (num: number) => {
        removeFromWatchlist(num);
        showToast(`Numéro ${num} retiré des favoris.`, "info");
        loadStatus();
    };

    if (watchlist.length === 0) return null;

    return (
        <div className="bg-white dark:bg-gray-800 p-6 rounded-3xl shadow-xl border border-indigo-100 dark:border-indigo-900/50 mb-8 animate-fade-in relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/5 rounded-full blur-2xl -mr-16 -mt-16"></div>
            
            <div className="flex justify-between items-center mb-6 relative z-10">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-indigo-600 text-white rounded-xl flex items-center justify-center shadow-lg">
                        <Eye size={20} />
                    </div>
                    <div>
                        <h3 className="text-lg font-black text-gray-800 dark:text-white">Watchlist Live</h3>
                        <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Surveillance des favoris (Aujourd'hui)</p>
                    </div>
                </div>
                {Object.keys(hits).length > 0 && (
                    <div className="flex items-center gap-2 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 px-3 py-1 rounded-full text-[10px] font-black border border-emerald-200 dark:border-emerald-800 animate-pulse">
                        <Bell size={12} /> ALERTE SORTIE
                    </div>
                )}
            </div>

            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 relative z-10">
                {watchlist.map(num => {
                    const found = hits[num];
                    return (
                        <div key={num} className={`p-4 rounded-2xl border transition-all flex flex-col items-center gap-3 group relative ${found ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800 shadow-md' : 'bg-gray-50 dark:bg-gray-900/50 border-gray-100 dark:border-gray-700'}`}>
                            <button 
                                onClick={(e) => {
                                    e.stopPropagation();
                                    handleRemove(num);
                                }}
                                className="absolute top-2 right-2 bg-white dark:bg-slate-700 text-slate-400 hover:bg-rose-500 hover:text-white transition-colors p-1.5 rounded-full shadow-sm z-20 border border-slate-200 dark:border-slate-600"
                                title="Supprimer des favoris"
                            >
                                <X size={12} />
                            </button>
                            
                            <NumberBall number={num} size="md" />
                            
                            <div className="text-center w-full">
                                {found ? (
                                    <div className="space-y-1">
                                        <div className="flex items-center justify-center gap-1 text-[10px] font-black text-emerald-600">
                                            <CheckCircle2 size={10} /> SORTI
                                        </div>
                                        <div className="text-[8px] font-bold text-emerald-700 dark:text-emerald-400 uppercase truncate">
                                            {found[0].draw} ({found[0].time})
                                        </div>
                                    </div>
                                ) : (
                                    <div className="flex items-center justify-center gap-1 text-[10px] font-bold text-gray-400 italic">
                                        <Clock size={10} /> En attente
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};
