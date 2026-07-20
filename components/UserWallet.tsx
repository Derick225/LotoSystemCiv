
import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getSavedTickets, deleteTicket, archiveTicket, getBankroll, updateBankroll, hydrateUserData } from '../services/userPreferencesService';
import { checkAndSyncRecentResults, fetchResults } from '../services/lotteryService';
import { checkSubscriptionStatus } from '../services/subscriptionService';
import { authService } from '../services/authService';
import type { SavedTicket, DrawResult, SubscriptionState } from '../types';
import { NumberBall } from './NumberBall';
import {  Trash2, Trophy, Clock, Search, AlertCircle, Coins, ChevronDown, RefreshCw, CloudDownload, Briefcase, Calculator, Crown } from 'lucide-react';
import { ResponsiveContainer, AreaChart, Area, Tooltip } from 'recharts';
import { TicketXRay } from './TicketXRay';
import { LOTO_PAYOUTS } from '../constants';
import { useToast } from './ui/Toast';
import { KellyCalculator } from './KellyCalculator';
import { useNexusStore } from '../store/useNexusStore';
import { audioEngine } from '../utils/audioEngine';

const calculateWinAmount = (hits: number) => {
    const payouts = LOTO_PAYOUTS.STANDARD.SIMPLE;
    if (hits === 1) return payouts['1N'].gain;
    if (hits === 2) return payouts['2N'].gain;
    if (hits === 3) return payouts['3N'].gain;
    if (hits === 4) return payouts['4N'].gain;
    if (hits === 5) return payouts['5N'].gain;
    return 0;
};

const parseDateSafe = (dateStr: string): Date => {
    if (!dateStr) return new Date();
    try {
        if (dateStr.includes('/')) {
            const [d, m, y] = dateStr.split('/').map(Number);
            return new Date(y, m - 1, d);
        }
        if (dateStr.includes('-')) {
            const [y, m, d] = dateStr.split('-').map(Number);
            return new Date(y, m - 1, d);
        }
        const d = new Date(dateStr);
        return isNaN(d.getTime()) ? new Date() : d;
    } catch {
        return new Date();
    }
};

export const UserWallet: React.FC = () => {
    const { showToast } = useToast();
    const spectral = useNexusStore(state => state.spectral); 
    const queryClient = useQueryClient();
    
    const [expandedTicketId, setExpandedTicketId] = useState<string | null>(null);
    const [showKelly, setShowKelly] = useState(false);
    
    // --- REACT QUERY HOOKS ---

    // 1. Fetch User Session & Subscription
    const { data: sessionData } = useQuery({
        queryKey: ['session'],
        queryFn: async () => {
            const sess = await authService.getSession();
            let sub: SubscriptionState | null = null;
            if ((sess?.user)) {
                sub = await checkSubscriptionStatus((sess?.user?.id));
            }
            return { session: sess, subscription: sub };
        },
        staleTime: 1000 * 60 * 10
    });

    // 2. Fetch Saved Tickets (Local Source of Truth)
    const { data: tickets = [], isLoading: ticketsLoading } = useQuery<SavedTicket[]>({
        queryKey: ['tickets'],
        queryFn: () => getSavedTickets().filter(t => t.status !== 'archived'),
        staleTime: 0
    });

    // 3. Fetch Bankroll
    const { data: bankroll = 50000 } = useQuery({
        queryKey: ['bankroll'],
        queryFn: getBankroll,
        staleTime: 0
    });

    // 4. Fetch Results for Tickets
    const ticketDrawNames = React.useMemo(() => {
        return Array.from(new Set(tickets.map(t => t.drawName)));
    }, [tickets]);
    
    const { data: resultsMap = {} } = useQuery<Record<string, DrawResult[]>>({
        queryKey: ['ticketResults', ticketDrawNames],
        queryFn: async () => {
            const map: Record<string, DrawResult[]> = {};
            await Promise.all(ticketDrawNames.map(async (name) => {
                if (name !== 'Unknown') {
                    try {
                        const { data } = await fetchResults(name);
                        map[name] = data;
                    } catch { /* ignore */ }
                }
            }));
            return map;
        },
        enabled: tickets.length > 0,
        staleTime: 1000 * 60 * 5
    });

    const deleteMutation = useMutation({
        mutationFn: deleteTicket,
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tickets'] })
    });

    const archiveMutation = useMutation({
        mutationFn: archiveTicket,
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tickets'] })
    });

    const bankrollMutation = useMutation({
        mutationFn: async (amount: number) => updateBankroll(amount),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['bankroll'] })
    });

    // --- DERIVED STATE ---
    
    const { totalWinnings, totalSpent, financialHistory } = React.useMemo(() => {
        let winnings = 0;
        let spent = 0;
        let runningBalance = 50000;
        const history: { date: string, balance: number }[] = [];
        const sortedTickets = [...tickets].sort((a, b) => a.createdAt - b.createdAt);

        sortedTickets.forEach(ticket => {
            spent += 100;
            runningBalance -= 100;
            const drawHistory = resultsMap[ticket.drawName] || [];
            const creationDate = new Date(ticket.createdAt);
            
            const matchDraw = drawHistory.find(d => {
                 const dDate = parseDateSafe(d.date);
                 const diff = dDate.getTime() - creationDate.getTime();
                 // Match si le tirage a lieu entre -24h et +48h de la création du ticket
                 return diff > -86400000 && diff < 172800000; 
            });

            if (matchDraw) {
                const hits = ticket.numbers.filter(n => matchDraw.gagnants.includes(n)).length;
                const win = calculateWinAmount(hits);
                winnings += win;
                runningBalance += win;
            }
            history.push({ date: creationDate.toLocaleDateString('fr-FR').slice(0, 5), balance: runningBalance });
        });

        return { totalWinnings: winnings, totalSpent: spent, financialHistory: history };
    }, [tickets, resultsMap]);

    // --- ACTIONS ---

    const handleSyncWallet = async () => {
        audioEngine.play('click');
        const sess = sessionData?.session;
        if ((sess?.user)) {
            try {
                await hydrateUserData((sess?.user?.id));
                queryClient.invalidateQueries({ queryKey: ['tickets'] });
                audioEngine.play('success');
                showToast("Sync Cloud OK.", "success");
            } catch (err) {
                console.warn("[AlmostInstantSync] Erreur lors de la synchronisation manuelle :", err);
                showToast("Échec de synchronisation Cloud (temps d'attente dépassé ou réseau isolé).", "error");
                audioEngine.play('error');
            }
        } else {
            audioEngine.play('error');
            showToast("Connexion requise.", "error");
        }
    };

    const handleScanLive = async () => {
        audioEngine.play('click');
        try {
            const count = await checkAndSyncRecentResults();
            if (count > 0) {
                queryClient.invalidateQueries({ queryKey: ['ticketResults'] });
                audioEngine.play('success');
                showToast(`${count} nouveaux tirages.`, "success");
            } else {
                audioEngine.play('success');
                showToast("À jour.", "success");
            }
        } catch (e: any) {
            if (e?.code === 'SYNC_REQUIRES_BACKEND') {
                showToast("Mode démo : aucun backend configuré, synchronisation indisponible.", "info");
            } else {
                showToast("Échec de la synchronisation.", "error");
            }
            audioEngine.play('error');
        }
    };

    const handleClaim = (ticket: SavedTicket, winAmount: number) => {
        audioEngine.play('click');
        if (confirm(`Encaisser ${winAmount.toLocaleString()} F ?`)) {
            bankrollMutation.mutate(winAmount);
            archiveMutation.mutate(ticket.id);
            audioEngine.play('success');
            showToast("Gain ajouté !", "success");
        }
    };

    const getTicketStatus = (ticket: SavedTicket) => {
        const history = resultsMap[ticket.drawName];
        if (!history || history.length === 0) return { status: 'pending', hits: 0, win: 0 };

        const creationDate = new Date(ticket.createdAt);
        const match = history.find(d => {
            const dDate = parseDateSafe(d.date);
            const diff = dDate.getTime() - creationDate.getTime();
            return diff > -86400000 && diff < 172800000;
        });

        if (!match) return { status: 'pending', hits: 0, win: 0 };

        const hits = ticket.numbers.filter(n => match.gagnants.includes(n)).length;
        const win = calculateWinAmount(hits);
        
        return { status: 'checked', hits, win, drawDate: match.date };
    };

    const getRelevance = (numbers: number[]) => {
        if (spectral.length === 0) return null;
        const totalEnergy = numbers.reduce((acc, n) => {
            const s = spectral.find(x => x.number === n);
            return acc + (s?.energy || 0);
        }, 0);
        return Math.round(totalEnergy / numbers.length);
    };

    const subscription = sessionData?.subscription;

    return (
        <div className="animate-fade-in space-y-6 md:space-y-8 pb-20 px-1 md:px-0">
            {subscription && (
                <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 p-5 md:p-6 rounded-[2rem] md:rounded-2xl shadow-xl border border-indigo-500/30 relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-4 opacity-10"><Crown size={80} className="md:w-[120px] md:h-[120px]" /></div>
                    <div className="relative z-10 flex flex-col md:flex-row justify-between items-center gap-4 md:gap-6">
                        <div className="flex items-center gap-4 w-full md:w-auto">
                            <div className={`w-12 h-12 md:w-14 md:h-14 rounded-xl md:rounded-2xl flex items-center justify-center shadow-lg ${subscription.plan === 'premium' ? 'bg-gradient-to-br from-amber-400 to-orange-500 text-white' : 'bg-slate-700 text-slate-300'}`}>
                                <Crown size={24} className="md:w-7 md:h-7" />
                            </div>
                            <div className="flex-1">
                                <h3 className="text-lg md:text-xl font-black text-white uppercase tracking-tight">Membre Platinum</h3>
                                <div className="flex flex-wrap items-center gap-2 mt-1">
                                    <span className={`text-[10px] md:text-[10px] font-black uppercase px-2 py-0.5 rounded border ${subscription.status === 'active' ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : 'bg-amber-500/20 text-amber-400 border-amber-500/30'}`}>
                                        {subscription.status === 'active' ? 'Actif' : 'Essai'}
                                    </span>
                                    <span className="text-xs md:text-[10px] text-slate-400 font-bold whitespace-nowrap">{subscription.daysLeft} jours restants</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <div className="bg-white dark:bg-slate-800 p-5 md:p-8 rounded-3xl md:rounded-3xl shadow-xl relative overflow-hidden group border border-slate-100 dark:border-slate-700">
                <div className="relative z-10 flex flex-col lg:grid lg:grid-cols-2 gap-6 md:gap-8">
                    <div>
                        <div className="flex justify-between items-start mb-4 md:mb-6">
                            <div>
                                <h2 className="text-xl md:text-3xl font-black tracking-tighter mb-1 md:mb-2 flex items-center gap-2 text-slate-900 dark:text-white">
                                    <Briefcase className="text-emerald-500 w-5 h-5 md:w-6 md:h-6" /> Portefeuille
                                </h2>
                                <p className="text-slate-400 font-bold uppercase text-[10px] md:text-[10px] tracking-widest">Bankroll Actuel</p>
                            </div>
                            <div className="px-3 md:px-4 py-1.5 md:py-2 bg-emerald-500/10 border border-emerald-500/20 rounded-xl md:rounded-2xl flex flex-col items-end text-emerald-600 dark:text-emerald-400">
                                <span className="text-[10px] md:text-[10px] font-black uppercase tracking-widest">Disponible</span>
                                <span className="text-xl md:text-3xl font-black whitespace-nowrap">{bankroll.toLocaleString()} F</span>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2 md:gap-4">
                            <div className="bg-slate-50 dark:bg-slate-900 p-3 md:p-4 rounded-xl md:rounded-2xl border border-slate-200 dark:border-slate-700">
                                <div className="text-[10px] md:text-[10px] font-black text-slate-400 uppercase mb-0.5 md:mb-1">Mises Total</div>
                                <div className="text-sm md:text-xl font-black text-slate-700 dark:text-slate-200 whitespace-nowrap">{totalSpent.toLocaleString()} F</div>
                            </div>
                            <div className="bg-slate-50 dark:bg-slate-900 p-3 md:p-4 rounded-xl md:rounded-2xl border border-slate-200 dark:border-slate-700">
                                <div className="text-[10px] md:text-[10px] font-black text-emerald-500 uppercase mb-0.5 md:mb-1">Gains Estimés</div>
                                <div className="text-sm md:text-xl font-black text-emerald-600 dark:text-emerald-400 whitespace-nowrap">{totalWinnings.toLocaleString()} F</div>
                            </div>
                        </div>
                    </div>

                    <div className="h-28 md:h-40 w-full bg-slate-50 dark:bg-slate-900 rounded-xl md:rounded-2xl p-2 md:p-4 border border-slate-200 dark:border-slate-700 relative overflow-hidden">
                        <div className="absolute top-2 left-4 text-[10px] md:text-xs font-black text-slate-400 uppercase tracking-widest z-10">Performance</div>
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={financialHistory}>
                                <defs>
                                    <linearGradient id="colorBal" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/><stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                                    </linearGradient>
                                </defs>
                                <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', backgroundColor: '#0f172a', color: '#fff', fontSize: '8px' }} />
                                <Area type="monotone" dataKey="balance" stroke="#10b981" strokeWidth={2} fill="url(#colorBal)" />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>

            <div className="flex gap-3 overflow-x-auto scrollbar-hide pb-1">
                <button 
                    onClick={() => { audioEngine.play('click'); setShowKelly(!showKelly); }}
                    className={`flex-1 md:flex-none flex items-center justify-center gap-2 px-6 py-4 rounded-2xl md:rounded-[2rem] border transition-all whitespace-nowrap ${showKelly ? 'bg-emerald-600 text-white border-emerald-500' : 'bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-300 border-slate-200 dark:border-slate-700'}`}
                >
                    <Calculator size={16} />
                    <span className="text-[10px] md:text-xs font-black uppercase tracking-widest">Kelly</span>
                </button>
                <button 
                    onClick={handleScanLive}
                    className="flex-1 md:flex-none flex items-center justify-center gap-2 px-6 py-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl md:rounded-[2rem] font-black text-[10px] md:text-xs uppercase tracking-widest shadow-lg active:scale-95 transition-all whitespace-nowrap"
                >
                    <RefreshCw size={16} />
                    Scan Live
                </button>
                <button 
                    onClick={handleSyncWallet}
                    className="flex-1 md:flex-none flex items-center justify-center gap-2 px-6 py-4 bg-slate-800 hover:bg-slate-700 text-white rounded-2xl md:rounded-[2rem] font-black text-[10px] md:text-xs uppercase tracking-widest shadow-lg active:scale-95 transition-all whitespace-nowrap"
                >
                    <CloudDownload size={16} />
                    Sync
                </button>
            </div>

            {showKelly && <KellyCalculator confidence={75} />}

            <div className="space-y-4">
                <div className="flex justify-between items-center px-2">
                    <h3 className="text-[11px] md:text-sm font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                        <Coins size={14} /> Mes Tickets ({tickets.length})
                    </h3>
                </div>

                {ticketsLoading ? (
                    <div className="p-8 text-center animate-pulse text-slate-400 font-black uppercase text-xs">Chargement...</div>
                ) : tickets.length === 0 ? (
                    <div className="p-6 md:p-8 text-center border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-[2rem] md:rounded-3xl bg-white/5">
                        <Search className="mx-auto text-slate-300 mb-4 opacity-50" size={32} />
                        <p className="text-slate-400 font-black uppercase text-[10px]">Aucun ticket archivé</p>
                    </div>
                ) : (
                    <div className="grid gap-3">
                    {tickets.map(ticket => {
                        const { status, win, drawDate } = getTicketStatus(ticket);
                        const isExpanded = expandedTicketId === ticket.id;
                        const relevance = getRelevance(ticket.numbers);
                        
                        return (
                            <div 
                                key={ticket.id} 
                                onClick={() => { audioEngine.play('click'); setExpandedTicketId(isExpanded ? null : ticket.id); }}
                                className={`bg-white dark:bg-slate-800 p-4 md:p-5 rounded-[2rem] md:rounded-2xl border shadow-sm flex flex-col relative overflow-hidden group transition-all cursor-pointer ${isExpanded ? 'border-indigo-500 ring-1 ring-indigo-500/50' : 'border-slate-100 dark:border-slate-700 hover:border-indigo-300'}`}
                            >
                                {win > 0 && <div className="absolute top-0 left-0 w-1 md:w-1.5 h-full bg-emerald-500"></div>}
                                
                                <div className="flex flex-col md:flex-row items-center gap-3 md:gap-6">
                                    <div className="flex-1 w-full md:w-auto">
                                        <div className="flex justify-between items-start mb-2 md:mb-3">
                                            <div className="flex items-center gap-2">
                                                <span className="text-[10px] md:text-[10px] font-black uppercase text-white bg-slate-900 px-2 py-0.5 md:px-2.5 md:py-1 rounded-md md:rounded-lg">{ticket.drawName}</span>
                                                <span className="text-[10px] md:text-[10px] text-slate-400 font-bold">{new Date(ticket.createdAt).toLocaleDateString('fr-FR')}</span>
                                            </div>
                                            <button onClick={(e) => { e.stopPropagation(); audioEngine.play('click'); deleteMutation.mutate(ticket.id); }} className="text-slate-300 hover:text-rose-500 p-1 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-900/20"><Trash2 size={12}/></button>
                                        </div>
                                        <div className="flex gap-1 md:gap-2 justify-center md:justify-start flex-wrap">
                                            {ticket.numbers.map(n => <NumberBall key={n} number={n} size="xs" />)}
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-3 md:gap-4 w-full md:w-auto justify-between md:justify-end border-t md:border-t-0 pt-2 md:pt-0 border-slate-50 dark:border-slate-700">
                                        {status === 'checked' ? (
                                            <div className="text-right">
                                                {win > 0 ? (
                                                    <div className="flex flex-col items-end gap-1">
                                                        <div className="text-emerald-500 font-black text-sm md:text-lg flex items-center justify-end gap-1">
                                                            <Trophy size={12}/> {win.toLocaleString()} F
                                                        </div>
                                                        <button 
                                                            onClick={(e) => { e.stopPropagation(); handleClaim(ticket, win); }}
                                                            className="px-2.5 py-1 bg-emerald-500 text-white rounded-lg text-[10px] font-black uppercase shadow-lg hover:bg-emerald-600 transition"
                                                        >
                                                            Claim
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <div className="flex flex-col items-end">
                                                        <div className="text-slate-400 font-bold text-xs md:text-xs flex items-center gap-1">
                                                            <AlertCircle size={10}/> Perdu
                                                        </div>
                                                        <div className="text-[10px] font-bold text-slate-300 uppercase">{drawDate}</div>
                                                    </div>
                                                )}
                                            </div>
                                        ) : (
                                            <div className="flex items-center gap-1 text-slate-400 bg-slate-50 dark:bg-slate-900/50 px-2 py-0.5 rounded-lg">
                                                <Clock size={10} className="animate-spin-slow" />
                                                <span className="text-[10px] md:text-xs font-black uppercase">Attente</span>
                                            </div>
                                        )}
                                        <div className={`p-1 rounded-full transition-all ${isExpanded ? 'bg-indigo-100 text-indigo-600 rotate-180' : 'bg-slate-100 text-slate-400'}`}>
                                            <ChevronDown size={12} />
                                        </div>
                                    </div>
                                </div>
                                
                                {isExpanded && (
                                    <div className="mt-4 border-t border-slate-50 dark:border-slate-700 pt-4 cursor-default animate-fade-in" onClick={(e) => e.stopPropagation()}>
                                        <TicketXRay numbers={ticket.numbers} score={50} showTitle={false} />
                                        <div className="mt-3 text-center text-[10px] md:text-xs font-bold text-slate-500 uppercase tracking-widest">
                                            {ticket.strategy || 'Strategie Inconnue'}
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                    </div>
                )}
            </div>
        </div>
    );
};
