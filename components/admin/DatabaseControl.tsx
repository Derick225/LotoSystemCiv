
import React, { useState, useEffect } from 'react';
import { supabase } from '../../services/supabaseClient';
import { useToast } from '../ui/Toast';
import { Database, HardDrive, Trash2, Server, Activity, Copy, RefreshCw, Save } from 'lucide-react';

export const DatabaseControl: React.FC = () => {
    const { showToast } = useToast();
    const [metrics, setMetrics] = useState({
        draws: 0,
        analytics: 0,
        weights: 0,
        feedback: 0,
        localStorageSize: 0
    });
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        refreshMetrics();
    }, []);

    const refreshMetrics = async () => {
        setLoading(true);
        try {
            // Requêtes parallèles légères (count exact)
            const [draws, analytics, weights, feedback] = await Promise.all([
                supabase.from('draw_results').select('*', { count: 'exact', head: true }),
                supabase.from('draw_analytics').select('*', { count: 'exact', head: true }),
                supabase.from('algo_weights').select('*', { count: 'exact', head: true }),
                supabase.from('prediction_feedback').select('*', { count: 'exact', head: true })
            ]);

            // Calcul taille LocalStorage (approx)
            let total = 0;
            for (const x in localStorage) {
                if (localStorage.hasOwnProperty(x)) {
                    total += ((localStorage[x].length + x.length) * 2);
                }
            }
            
            setMetrics({
                draws: draws.count || 0,
                analytics: analytics.count || 0,
                weights: weights.count || 0,
                feedback: feedback.count || 0,
                localStorageSize: Math.round(total / 1024) // KB
            });
        } catch (e) {
            console.error("Metrics error", e);
        } finally {
            setLoading(false);
        }
    };

    const handleClearCache = () => {
        if (confirm("Attention : Cela effacera tous les tickets locaux, l'historique de navigation et les préférences. Continuer ?")) {
            localStorage.clear();
            refreshMetrics();
            showToast("Cache local purgé.", "success");
            window.location.reload();
        }
    };

    const copySqlToClipboard = () => {
        const sql = `
-- OPTIMISATION NEXUS v12.0 - SÉCURITÉ & PERFORMANCE
alter table public.draw_results enable row level security;
drop policy if exists "Public Draw Read" on public.draw_results;
create policy "Public Draw Read" on public.draw_results for select using (true);
create policy "Service Write" on public.draw_results for insert with check (auth.role() = 'service_role' OR auth.role() = 'authenticated');
create policy "Service Update" on public.draw_results for update using (auth.role() = 'service_role' OR auth.role() = 'authenticated');
create policy "Service Delete" on public.draw_results for delete using (auth.role() = 'service_role' OR auth.role() = 'authenticated');

create table if not exists public.draw_analytics (
  id uuid default gen_random_uuid() primary key,
  draw_name text not null,
  date date not null,
  spectral jsonb, fractal jsonb, volatility jsonb, audit jsonb, correlations jsonb,
  updated_at timestamptz default now(),
  unique(draw_name, date)
);
alter table public.draw_analytics enable row level security;
create policy "Public Analytics Read" on public.draw_analytics for select using (true);
create policy "Service Write Analytics" on public.draw_analytics for insert with check (true);
create policy "Service Update Analytics" on public.draw_analytics for update using (true);

create table if not exists public.algo_weights (
  draw_name text primary key,
  weights jsonb not null,
  updated_at timestamptz default now()
);
alter table public.algo_weights enable row level security;
create policy "Public Weights Read" on public.algo_weights for select using (true);
create policy "Admin Weights Write" on public.algo_weights for all using (auth.role() = 'authenticated');
`;
        navigator.clipboard.writeText(sql);
        showToast("Script SQL copié dans le presse-papier.", "success");
    };

    return (
        <div className="space-y-8 animate-fade-in">
            {/* Server Status Header */}
            <div className="bg-slate-900 p-8 rounded-[2.5rem] border border-slate-800 shadow-2xl relative overflow-hidden flex flex-col md:flex-row justify-between items-center gap-6">
                <div className="flex items-center gap-4 z-10">
                    <div className="w-16 h-16 bg-indigo-600 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-600/20">
                        <Server size={32} className="text-white" />
                    </div>
                    <div>
                        <h3 className="text-xl font-black text-white uppercase tracking-tighter">Nexus Cloud Node</h3>
                        <div className="flex items-center gap-2 mt-1">
                            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                            <span className="text-xs font-mono text-emerald-400">PostgreSQL Actif</span>
                        </div>
                    </div>
                </div>
                <div className="flex gap-3 z-10">
                    <button onClick={refreshMetrics} className="p-3 bg-white/5 hover:bg-white/10 rounded-xl border border-white/5 transition-all text-slate-300">
                        <RefreshCw size={20} className={loading ? "animate-spin" : ""} />
                    </button>
                </div>
                {/* Background Decor */}
                <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-600/5 rounded-full blur-[80px] pointer-events-none"></div>
            </div>

            {/* Metrics Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                    { label: "Tirages Indexés", val: metrics.draws, icon: <Database size={16}/>, color: "text-indigo-400" },
                    { label: "Analyses HPC", val: metrics.analytics, icon: <Activity size={16}/>, color: "text-emerald-400" },
                    { label: "Profils ADN", val: metrics.weights, icon: <Save size={16}/>, color: "text-amber-400" },
                    { label: "Cache Local", val: `${metrics.localStorageSize} KB`, icon: <HardDrive size={16}/>, color: "text-slate-400" }
                ].map((m, i) => (
                    <div key={i} className="bg-white dark:bg-slate-800 p-6 rounded-[2rem] border border-slate-100 dark:border-slate-700 shadow-sm flex flex-col items-center text-center">
                        <div className={`mb-3 p-3 rounded-full bg-slate-50 dark:bg-slate-900 ${m.color}`}>{m.icon}</div>
                        <div className="text-2xl font-black text-slate-800 dark:text-white">{m.val}</div>
                        <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{m.label}</div>
                    </div>
                ))}
            </div>

            <div className="grid md:grid-cols-2 gap-8">
                {/* SQL Tools */}
                <div className="bg-white dark:bg-slate-800 p-8 rounded-[2.5rem] border border-slate-100 dark:border-slate-700 shadow-xl">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="p-2 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 rounded-lg"><Database size={20}/></div>
                        <h4 className="font-black text-slate-700 dark:text-white uppercase tracking-tight">Déploiement SQL</h4>
                    </div>
                    <div className="p-4 bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 mb-6">
                        <p className="text-[10px] font-mono text-slate-500 leading-relaxed">
                            Ce script initialise les tables, active le RLS (Row Level Security) et configure les index de performance. À exécuter dans le dashboard Supabase.
                        </p>
                    </div>
                    <button onClick={copySqlToClipboard} className="w-full py-4 bg-slate-900 dark:bg-indigo-600 hover:bg-slate-800 dark:hover:bg-indigo-500 text-white rounded-2xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 transition-all active:scale-95 shadow-lg">
                        <Copy size={16}/> Copier Script Init
                    </button>
                </div>

                {/* Maintenance Zone */}
                <div className="bg-rose-50 dark:bg-rose-900/10 p-8 rounded-[2.5rem] border border-rose-100 dark:border-rose-800 shadow-xl">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="p-2 bg-rose-100 dark:bg-rose-900/30 text-rose-600 rounded-lg"><Trash2 size={20}/></div>
                        <h4 className="font-black text-rose-800 dark:text-rose-400 uppercase tracking-tight">Zone Danger</h4>
                    </div>
                    <p className="text-xs text-rose-700 dark:text-rose-300/70 mb-8 font-medium leading-relaxed">
                        Actions irréversibles sur les données locales. Utilisez avec précaution si l'application rencontre des problèmes de synchronisation.
                    </p>
                    <button onClick={handleClearCache} className="w-full py-4 bg-rose-600 hover:bg-rose-500 text-white rounded-2xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 transition-all active:scale-95 shadow-lg">
                        <Trash2 size={16}/> Purger Cache Local
                    </button>
                </div>
            </div>
        </div>
    );
};
