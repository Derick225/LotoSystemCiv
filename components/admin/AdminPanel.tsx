import React, { useState, useEffect } from 'react';
import { useToast } from '../ui/Toast';
import { ExpertTuningPanel } from './ExpertTuningPanel';
import { DrawManagement } from './DrawManagement';
import { TrainingTab } from '../tabs/TrainingTab';
import { DatabaseControl } from './DatabaseControl';
import { DataIntegrityMonitor } from './DataIntegrityMonitor';
import { Server, Lock, LogOut, RefreshCw, BrainCircuit, Activity, Sliders, Database, ShieldCheck } from 'lucide-react';
import { authService } from '../../services/authService';
import { isSupabaseConfigured } from '../../services/supabaseClient';
import { ALL_DRAWS } from '../../constants';

export const AdminPanel: React.FC = () => {
    const { showToast } = useToast();
    const [activeTab, setActiveTab] = useState<'tuning' | 'training' | 'management' | 'database' | 'integrity'>('tuning');
    const [selectedDraw, setSelectedDraw] = useState<string>(ALL_DRAWS[0].name);
    
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [authLoading, setAuthLoading] = useState(true);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');

    useEffect(() => { checkAuth(); }, []);

    const checkAuth = async () => {
        if (!isSupabaseConfigured()) { setIsAuthenticated(true); setAuthLoading(false); return; }
        const session = await authService.getSession();
        setIsAuthenticated(!!session);
        setAuthLoading(false);
    };

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setAuthLoading(true);
        const { error } = await authService.login(email, password);
        if (error) showToast("Échec : " + error.message, "error");
        else setIsAuthenticated(true);
        setAuthLoading(false);
    };

    const handleLogout = async () => {
        await authService.logout();
        setIsAuthenticated(false);
    };

    if (authLoading) return <div className="flex justify-center p-20"><RefreshCw className="animate-spin h-10 w-10 text-indigo-600" /></div>;

    if (!isAuthenticated) {
        return (
            <div className="flex justify-center items-center min-h-[70vh] p-4">
                <div className="bg-white dark:bg-slate-800 p-10 rounded-[3.5rem] shadow-2xl w-full max-w-md border border-slate-100 dark:border-slate-700 animate-scale-in">
                    <div className="flex flex-col items-center mb-10">
                        <div className="w-20 h-20 bg-indigo-600 text-white rounded-3xl flex items-center justify-center mb-6 shadow-xl shadow-indigo-600/20">
                            <Lock size={32} />
                        </div>
                        <h2 className="text-2xl font-black text-slate-800 dark:text-white uppercase tracking-tighter">Nexus Master Access</h2>
                    </div>
                    <form onSubmit={handleLogin} className="space-y-4">
                        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full p-5 bg-slate-50 dark:bg-slate-900 rounded-2xl border-2 border-transparent focus:border-indigo-500 outline-none transition-all font-bold" placeholder="Email Admin" required />
                        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full p-5 bg-slate-50 dark:bg-slate-900 rounded-2xl border-2 border-transparent focus:border-indigo-500 outline-none transition-all font-bold" placeholder="Mot de passe" required />
                        <button type="submit" className="w-full py-5 bg-indigo-600 text-white font-black rounded-2xl shadow-xl hover:bg-indigo-700 transition active:scale-[0.98] uppercase tracking-[0.2em] text-xs">Ouvrir le Kernel</button>
                    </form>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-8 animate-fade-in pb-20">
            <header className="sticky top-[80px] z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl p-6 rounded-b-[3rem] shadow-xl border-x border-b border-indigo-100 dark:border-indigo-900/30 flex flex-col md:flex-row justify-between items-center gap-6">
                <div className="flex items-center gap-4">
                    <div className="p-3 bg-indigo-600 text-white rounded-2xl shadow-lg"><Server size={22}/></div>
                    <div>
                        <h2 className="text-xl font-black text-slate-800 dark:text-white uppercase tracking-tighter leading-none">Master Node Control</h2>
                        <div className="flex items-center gap-2 mt-1">
                             <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>
                             <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Système Opérationnel</span>
                        </div>
                    </div>
                </div>
                
                <div className="flex items-center gap-2 p-1.5 bg-slate-100 dark:bg-slate-800/80 rounded-[2rem] border border-slate-200 dark:border-slate-700 overflow-x-auto scrollbar-hide max-w-full">
                    {[
                        { id: 'tuning', label: 'Tuning', icon: <Sliders size={14}/> },
                        { id: 'training', label: 'Training', icon: <BrainCircuit size={14}/> },
                        { id: 'management', label: 'Data Registry', icon: <Database size={14}/> },
                        { id: 'integrity', label: 'Intégrité', icon: <ShieldCheck size={14}/> },
                        { id: 'database', label: 'Infrastructure', icon: <Activity size={14}/> }
                    ].map(tab => (
                        <button 
                            key={tab.id} 
                            onClick={() => setActiveTab(tab.id as any)} 
                            className={`px-5 py-3 rounded-2xl text-[10px] font-black uppercase transition-all whitespace-nowrap flex items-center gap-3 ${activeTab === tab.id ? 'bg-white dark:bg-indigo-600 shadow-xl text-indigo-600 dark:text-white scale-105 z-10' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'}`}
                        >
                            {tab.icon} {tab.label}
                        </button>
                    ))}
                    <button onClick={handleLogout} className="p-3 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-2xl transition-all ml-2 border border-rose-100 dark:border-rose-900/20"><LogOut size={16}/></button>
                </div>
            </header>

            <main className="px-4 animate-slide-up">
                {activeTab !== 'database' && (
                    <div className="mb-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                        <div className="relative group min-w-[280px]">
                            <select 
                                value={selectedDraw} 
                                onChange={(e) => setSelectedDraw(e.target.value)} 
                                className="w-full appearance-none p-5 bg-white dark:bg-slate-800 rounded-[2rem] border border-indigo-100 dark:border-indigo-900 shadow-sm font-black text-sm outline-none focus:ring-4 ring-indigo-500/10 transition-all uppercase tracking-widest"
                            >
                                {ALL_DRAWS.map(d => <option key={d.name} value={d.name}>{d.name} ({d.day})</option>)}
                            </select>
                            <div className="absolute right-6 top-1/2 -translate-y-1/2 pointer-events-none text-indigo-500">
                                <RefreshCw size={16} className="group-hover:rotate-180 transition-transform duration-700" />
                            </div>
                        </div>
                    </div>
                )}

                <div className="animate-slide-up">
                    {activeTab === 'tuning' && <ExpertTuningPanel selectedDrawName={selectedDraw} />}
                    {activeTab === 'training' && <TrainingTab drawName={selectedDraw} />}
                    {activeTab === 'management' && <DrawManagement drawName={selectedDraw} />}
                    {activeTab === 'integrity' && <DataIntegrityMonitor drawName={selectedDraw} />}
                    {activeTab === 'database' && <DatabaseControl />}
                </div>
            </main>
        </div>
    );
};
