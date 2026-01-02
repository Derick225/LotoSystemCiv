
import React, { useMemo } from 'react';
import type { DrawResult } from '../types';
import { Tooltip } from 'recharts';

interface HeatmapCalendarProps {
    history: DrawResult[];
}

export const HeatmapCalendar: React.FC<HeatmapCalendarProps> = ({ history }) => {
    const data = useMemo(() => {
        const today = new Date();
        const yearAgo = new Date();
        yearAgo.setFullYear(today.getFullYear() - 1);
        
        // Map: Date String (YYYY-MM-DD) -> Count/Sum
        const map = new Map<string, { count: number, sum: number, draws: number[] }>();
        
        history.forEach(h => {
            // Conversion DD/MM/YYYY vers YYYY-MM-DD pour tri standard
            let isoDate = h.date;
            if (h.date.includes('/')) {
                const [d, m, y] = h.date.split('/');
                isoDate = `${y}-${m}-${d}`;
            }
            
            const current = map.get(isoDate) || { count: 0, sum: 0, draws: [] };
            map.set(isoDate, {
                count: current.count + 1,
                sum: current.sum + h.gagnants.reduce((a,b)=>a+b,0),
                draws: h.gagnants
            });
        });

        // Génération de la grille (52 semaines x 7 jours)
        const days = [];
        let cursor = new Date(yearAgo);
        // Alignement au Dimanche précédent
        cursor.setDate(cursor.getDate() - cursor.getDay());

        while (cursor <= today) {
            const iso = cursor.toISOString().split('T')[0];
            // Pour l'affichage, on reformatte si besoin, mais la clé est iso
            // On cherche dans la map avec le format original de l'historique si possible
            // Ici on simplifie en supposant que l'historique a été normalisé ou qu'on utilise un matcher plus complexe
            
            // Tentative de match direct ou reverse
            let match = map.get(iso);
            if (!match) {
               const [y,m,d] = iso.split('-');
               const frDate = `${d}/${m}/${y}`;
               match = map.get(frDate);
            }

            days.push({
                date: new Date(cursor),
                iso: iso,
                value: match ? match.sum : 0,
                hasDraw: !!match
            });
            cursor.setDate(cursor.getDate() + 1);
        }
        return days;
    }, [history]);

    const getColor = (val: number, hasDraw: boolean) => {
        if (!hasDraw) return 'bg-slate-100 dark:bg-slate-800';
        if (val > 250) return 'bg-rose-500';
        if (val > 200) return 'bg-indigo-500';
        if (val > 150) return 'bg-emerald-500';
        return 'bg-slate-400';
    };

    return (
        <div className="bg-white dark:bg-slate-900 p-6 rounded-[2.5rem] border border-slate-200 dark:border-slate-800 shadow-sm overflow-x-auto">
            <div className="min-w-[700px]">
                <div className="flex justify-between items-end mb-4">
                    <h4 className="text-xs font-black uppercase tracking-widest text-slate-500">Densité Annuelle (Somme Σ)</h4>
                    <div className="flex items-center gap-2 text-[8px] font-bold uppercase text-slate-400">
                        <span>Faible</span>
                        <div className="w-2 h-2 bg-emerald-500 rounded-sm"></div>
                        <div className="w-2 h-2 bg-indigo-500 rounded-sm"></div>
                        <div className="w-2 h-2 bg-rose-500 rounded-sm"></div>
                        <span>Élevée</span>
                    </div>
                </div>
                
                <div className="grid grid-rows-7 grid-flow-col gap-1 w-fit">
                    {data.map((day, i) => (
                        <div 
                            key={i}
                            className={`w-3 h-3 rounded-sm ${getColor(day.value, day.hasDraw)} transition-all hover:scale-125 cursor-help relative group`}
                            title={`${day.date.toLocaleDateString()} : ${day.hasDraw ? 'Somme ' + day.value : 'Aucun tirage'}`}
                        >
                            {/* Tooltip CSS simple pour éviter la lourdeur JS sur 365 éléments */}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};
