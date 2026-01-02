
import React, { useState, useEffect } from 'react';
import { getSavedTickets, deleteTicket, archiveTicket, getBankroll, updateBankroll } from '../services/userPreferencesService';
import { checkAndSyncRecentResults, fetchResults } from '../services/lotteryService';
import type { SavedTicket, DrawResult } from '../types';
import { useNexus } from './NexusProvider';
import { NumberBall } from './NumberBall';
import { Wallet, Trash2, Trophy, Clock, Search, AlertCircle, Coins, ChevronDown, RefreshCw, Download, Briefcase, Calculator } from 'lucide-react';
import { ResponsiveContainer, AreaChart, Area, Tooltip } from 'recharts';
import { TicketXRay } from './TicketXRay';
import { LOTO_PAYOUTS } from '../constants';
import { useToast } from './ui/Toast';
import { KellyCalculator } from './KellyCalculator';

export const UserWallet: React.FC = () => {
    const { showToast } = useToast();
    const [tickets, setTickets] = useState<SavedTicket[]>([]);
    const [resultsMap, setResultsMap] = useState<Record<string, DrawResult[]>>({});
    const [loading, setLoading] = useState(true);
    const [scanning, setScanning] = useState(false);
    const [expandedTicketId, setExpandedTicketId] = useState<string | null>(null);
    const [bankroll, setBankroll] = useState(getBankroll());
    const [showKelly, setShowKelly] = useState(false);
    
    // Financials
    const [totalWinnings, setTotalWinnings] = useState(0);
    const [totalSpent, setTotalSpent] = useState(0);
    const [financialHistory, setFinancialHistory] = useState<any[]>([]);

    useEffect(() => { loadWallet(); }, []);

    const loadWallet = async () => {
        setLoading(true);
        const saved = getSavedTickets().filter(t => t.status !== 'archived');
        setTickets(saved);
        setBankroll(getBankroll());

        const drawNames = [...new Set(saved.map(t => t.drawName))];
        const newResultsMap: Record<string, DrawResult[]> = {};
        
        await Promise.all(drawNames.map(async (name) => {
            if (name !== 'Unknown') {
                try {
                    const { data } = await fetchResults(name); 
                    newResultsMap[name] = data;
                } catch (e) { console.warn(`Failed to load results for ${name}`); }
            }
        }));
        
        setResultsMap(newResultsMap);
        calculateFinancials(saved, newResultsMap);
        setLoading(false);
    };

    const handleScanLive = async () => {
        setScanning(true);
        try {
            const count = await checkAndSyncRecentResults();
            await loadWallet();
            if (count > 0) showToast(`${count} nouveaux tirages synchronisés.`, "success");
            else showToast("Aucun nouveau résultat détecté.", "info");
        } catch(e) {
            showToast("Erreur de scan.", "error");
        } finally {
            setScanning(false);
        }
    };

    const handleClaim = async (ticket: SavedTicket, winAmount: number) => {
        if (confirm(`Encaisser ${winAmount.toLocaleString()} F ? Le ticket sera archivé.`)) {
            updateBankroll(winAmount);
            await archiveTicket(ticket.id);
            showToast("Gain ajouté au capital !", "success");
            loadWallet();
        }
    };

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
        if (dateStr.includes('/')) {
            const [d, m, y] = dateStr.split('/').map(Number);
            return new Date(y, m - 1, d);
        }
        if (dateStr.includes('-')) {
            const [y, m, d] = dateStr.split('-').map(Number);
            return new Date(y, m - 1, d);
        }
        return new Date(dateStr);
    };

    const calculateFinancials = (tickets: SavedTicket[], results: Record<string, DrawResult[]>) => {
        let winnings = 0;
        let spent = 0;
        let runningBalance = 50000;
        const history: any[] = [];
        const sortedTickets = [...tickets].sort((a, b) => a.createdAt - b.createdAt);

        sortedTickets.forEach(ticket => {
            spent += 100;
            runningBalance -= 100;
            const drawHistory = results[ticket.drawName] || [];
            const creationDate = new Date(ticket.createdAt);
            
            const matchDraw = drawHistory.find(d => {
                 const dDate = parseDateSafe(d.date);
                 const diff = dDate.getTime() - creationDate.getTime();
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

        setTotalWinnings(winnings);
        setTotalSpent(spent);
        setFinancialHistory(history);
    };

    const handleDelete = async (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        if(confirm('Supprimer ce ticket ?')) {
            await deleteTicket(id);
            loadWallet();
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

    return (
        <div className="animate-fade-in space-y-8 pb-20">
            {/* Financial Dashboard */}
            <div className="bg-slate-900 text-white p-8 rounded-[3rem] shadow-2xl relative overflow-hidden group border border-slate-800">
                <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/10 rounded-full blur-[80px] -mr-16 -mt-16 group-hover:bg-indigo-500/20 transition-all duration-1000"></div>
                
                <div className="relative z-10 grid lg:grid-cols-2 gap-8">
                    <div>
                        <div className="flex justify-between items-start mb-6">
                            <div>
                                <h2 className="text-3xl font-black tracking-tighter mb-2 flex items-center gap-3">
                                    <Briefcase className="text-emerald-500" /> Capital Actif
                                </h2>
                                <p className="text-slate-400 font-bold uppercase text-[10px] tracking-widest">Bankroll Réel</p>
                            </div>
                            <div className="px-4 py-2 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl flex flex-col items-end text-emerald-400">
                                <span className="text-[10px] font-black uppercase tracking-widest">Solde Disponible</span>
                                <span className="text-3xl font-black">{bankroll.toLocaleString()} F</span>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="bg-white/5 p-4 rounded-2xl border border-white/5 backdrop-blur-sm">
                                <div className="text-[10px] font-black text-slate-400 uppercase mb-1">Mises en Jeu</div>
                                <div className="text-xl font-black">{totalSpent.toLocaleString()} F</div>
                            </div>
                            <div className="bg-white/5 p-4 rounded-2xl border border-white/5 backdrop-blur-sm">
                                <div className="text-[10px] font-black text-emerald-400 uppercase mb-1">Gains Potentiels</div>
                                <div className="text-xl font-black text-emerald-400">{totalWinnings.toLocaleString()} F</div>
                            </div>
                        </div>
                    </div>

                    <div className="h-40 w-full bg-black/20 rounded-2xl p-4 border border-white/5 relative">
                        <div className="absolute top-2 left-4 text-[9px] font-black text-slate-500 uppercase tracking-widest">Evolution Capital</div>
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={financialHistory}>
                                <defs>
                                    <linearGradient id="colorBal" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/><stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                                    </linearGradient>
                                </defs>
                                <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', backgroundColor: '#0f172a', color: '#fff', fontSize: '10px' }} />
                                <Area type="monotone" dataKey="balance" stroke="#10b981" strokeWidth={2} fill="url(#colorBal)" />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>

            {/* Smart Tools Bar */}
            <div className="flex gap-4 overflow-x-auto scrollbar-hide">
                <button 
                    onClick={() => setShowKelly(!showKelly)}
                    className={`flex items-center gap-2 px-6 py-4 rounded-[2rem] border transition-all whitespace-nowrap ${showKelly ? 'bg-emerald-600 text-white border-emerald-500' : 'bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-300 border-slate-200 dark:border-slate-700'}`}
                >
                    <Calculator size={18} />
                    <span className="text-xs font-black uppercase tracking-widest">Calculateur Kelly</span>
                </button>
                <button 
                    onClick={handleScanLive}
                    disabled={scanning}
                    className="flex items-center gap-2 px-6 py-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-[2rem] font-black text-xs uppercase tracking-widest shadow-lg active:scale-95 transition-all whitespace-nowrap"
                >
                    <RefreshCw size={18} className={scanning ? 'animate-spin' : ''} />
                    {scanning ? 'Scan en cours...' : 'Scan Résultats Live'}
                </button>
            </div>

            {showKelly && <KellyCalculator confidence={75} />}

            {/* Active Tickets List */}
            <div className="space-y-4">
                <div className="flex justify-between items-center px-2">
                    <h3 className="text-sm font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                        <Coins size={14} /> Tickets Actifs ({tickets.length})
                    </h3>
                </div>

                {loading ? (
                    <div className="p-12 text-center animate-pulse text-slate-400 font-black uppercase text-[10px]">Chargement du portefeuille...</div>
                ) : tickets.length === 0 ? (
                    <div className="p-12 text-center border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-[3rem]">
                        <Search className="mx-auto text-slate-300 mb-4" size={32} />
                        <p className="text-slate-400 font-black uppercase text-xs">Aucun ticket actif</p>
                    </div>
                ) : (
                    tickets.map(ticket => {
                        const { status, hits, win, drawDate } = getTicketStatus(ticket);
                        const isExpanded = expandedTicketId === ticket.id;
                        
                        return (
                            <div 
                                key={ticket.id} 
                                onClick={() => setExpandedTicketId(isExpanded ? null : ticket.id)}
                                className={`bg-white dark:bg-slate-800 p-5 rounded-[2.5rem] border shadow-sm flex flex-col relative overflow-hidden group transition-all cursor-pointer ${isExpanded ? 'border-indigo-500 ring-1 ring-indigo-500/50' : 'border-slate-100 dark:border-slate-700 hover:border-indigo-300'}`}
                            >
                                {win > 0 && <div className="absolute top-0 left-0 w-1.5 h-full bg-emerald-500"></div>}
                                
                                <div className="flex flex-col md:flex-row items-center gap-6">
                                    <div className="flex-1 w-full md:w-auto">
                                        <div className="flex justify-between items-start mb-3">
                                            <div className="flex items-center gap-2">
                                                <span className="text-[10px] font-black uppercase text-white bg-slate-900 px-3 py-1 rounded-full">{ticket.drawName}</span>
                                                <span className="text-[10px] text-slate-400 font-bold">{new Date(ticket.createdAt).toLocaleDateString('fr-FR')}</span>
                                            </div>
                                            <button onClick={(e) => handleDelete(e, ticket.id)} className="text-slate-300 hover:text-rose-500 transition p-2 rounded-full hover:bg-rose-50 dark:hover:bg-rose-900/20"><Trash2 size={14}/></button>
                                        </div>
                                        <div className="flex gap-2 justify-center md:justify-start">
                                            {ticket.numbers.map(n => <NumberBall key={n} number={n} size="sm" />)}
                                        </div>
                                    </div>

                                    {/* Status Section */}
                                    <div className="flex items-center gap-4 w-full md:w-auto justify-between md:justify-end border-t md:border-t-0 pt-4 md:pt-0 border-slate-100 dark:border-slate-800">
                                        {status === 'checked' ? (
                                            <div className="text-right">
                                                {win > 0 ? (
                                                    <div className="flex flex-col items-end gap-2">
                                                        <div className="text-emerald-500 font-black text-lg flex items-center justify-end gap-2">
                                                            <Trophy size={16}/> {win.toLocaleString()} F
                                                        </div>
                                                        <button 
                                                            onClick={(e) => { e.stopPropagation(); handleClaim(ticket, win); }}
                                                            className="px-4 py-1.5 bg-emerald-500 text-white rounded-lg text-[10px] font-black uppercase shadow-lg hover:bg-emerald-600 transition active:scale-95 flex items-center gap-2"
                                                        >
                                                            <Download size={12}/> Encaisser
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <>
                                                        <div className="text-slate-400 font-bold text-sm flex items-center justify-end gap-2">
                                                            <AlertCircle size={16}/> Perdu
                                                        </div>
                                                        <div className="text-[10px] font-bold text-slate-300 uppercase">Tirage {drawDate}</div>
                                                    </>
                                                )}
                                            </div>
                                        ) : (
                                            <div className="flex flex-col items-end gap-2">
                                                <div className="flex items-center gap-2 text-slate-400 bg-slate-50 dark:bg-slate-900/50 px-3 py-1.5 rounded-xl">
                                                    <Clock size={12} />
                                                    <span className="text-[9px] font-black uppercase">En Attente</span>
                                                </div>
                                            </div>
                                        )}
                                        <div className={`p-2 rounded-full transition-transform duration-300 ${isExpanded ? 'bg-indigo-100 text-indigo-600 rotate-180' : 'text-slate-400'}`}>
                                            <ChevronDown size={16} />
                                        </div>
                                    </div>
                                </div>
                                
                                {isExpanded && (
                                    <div className="mt-4 border-t border-slate-100 dark:border-slate-800 pt-4 cursor-default" onClick={(e) => e.stopPropagation()}>
                                        <TicketXRay numbers={ticket.numbers} score={50} />
                                        <div className="mt-2 text-center text-[9px] font-bold text-slate-400">
                                            Stratégie : {ticket.strategy || 'Manuelle'}
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
};
