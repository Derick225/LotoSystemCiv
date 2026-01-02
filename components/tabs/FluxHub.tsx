
import React, { useState, useMemo } from 'react';
import { DrawResult } from '../../types';
import { NumberBall } from '../NumberBall';
import { formatDate, syncDrawExternal } from '../../services/lotteryService';
import { useNexus } from '../NexusProvider';
import { RefreshCw, Search, Activity, Clock, Binary, Download, GitCompare, SearchCode, Calendar } from 'lucide-react';
import { ExportService } from '../../services/exportService';
import { useToast } from '../ui/Toast';
import { ListSkeleton } from '../skeletons/ListSkeleton';
import { SimilarityFinder } from '../SimilarityFinder';
import { DrawExamine } from '../DrawExamine';
import { HeatmapCalendar } from '../HeatmapCalendar';

export const FluxHub: React.FC<{ history: DrawResult[] }> = ({ history }) => {
  const { currentDrawName, refreshData, loading } = useNexus();
  const { showToast } = useToast();
  
  const [searchTerm, setSearchTerm] = useState('');
  const [visibleCount, setVisibleCount] = useState(12);
  const [similarityTarget, setSimilarityTarget] = useState<DrawResult | null>(null);
  const [examiningDraw, setExaminingDraw] = useState<DrawResult | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list');

  const handleManualRefresh = async () => {
      if (!currentDrawName) return;
      showToast("Synchronisation API...", "info");
      await syncDrawExternal(currentDrawName);
      await refreshData(currentDrawName, true);
      showToast("Flux mis à jour.", "success");
  };

  const filteredHistory = useMemo(() => {
      if (!searchTerm) return history;
      const term = searchTerm.toLowerCase();
      return history.filter(h => 
          formatDate(h.date).includes(term) || 
          h.gagnants.some(n => n.toString() === term)
      );
  }, [history, searchTerm]);

  const pagedItems = filteredHistory.slice(0, visibleCount);

  if (loading && history.length === 0) return <ListSkeleton />;

  return (
    <div className="space-y-6 animate-fade-in pb-12">
        {/* Controls Bar */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white dark:bg-slate-800 p-4 rounded-[2rem] shadow-sm border border-slate-100 dark:border-slate-700 sticky top-32 z-30">
            <div className="flex items-center gap-3 px-2">
                <div className="p-2 bg-indigo-50 dark:bg-indigo-900/30 rounded-xl text-indigo-600 dark:text-indigo-400">
                    <Activity size={18} />
                </div>
                <div>
                    <h3 className="text-sm font-black text-slate-800 dark:text-white uppercase tracking-wider">Master Flux</h3>
                    <div className="flex items-center gap-2">
                        <Clock size={10} className="text-slate-400" />
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{history.length} Signatures</span>
                    </div>
                </div>
            </div>

            <div className="flex gap-2 w-full sm:w-auto">
                {/* View Switcher */}
                <div className="flex bg-slate-100 dark:bg-slate-900 p-1 rounded-xl">
                    <button onClick={() => setViewMode('list')} className={`p-2 rounded-lg transition-all ${viewMode === 'list' ? 'bg-white dark:bg-slate-700 shadow text-indigo-600' : 'text-slate-400'}`}><Activity size={14}/></button>
                    <button onClick={() => setViewMode('calendar')} className={`p-2 rounded-lg transition-all ${viewMode === 'calendar' ? 'bg-white dark:bg-slate-700 shadow text-indigo-600' : 'text-slate-400'}`}><Calendar size={14}/></button>
                </div>

                <div className="relative flex-1 sm:w-48 group">
                    <input 
                        type="text" 
                        placeholder="Date ou Numéro..." 
                        value={searchTerm} 
                        onChange={(e) => setSearchTerm(e.target.value)} 
                        className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 font-bold text-[11px] outline-none focus:ring-2 ring-indigo-500/20 transition-all" 
                    />
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                </div>
                <button onClick={() => ExportService.exportHistoryToCSV(history, `Flux_${currentDrawName}`)} className="p-2.5 bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-300 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-600 transition" title="Export CSV">
                    <Download size={18}/>
                </button>
                <button onClick={handleManualRefresh} className="p-2.5 bg-indigo-600 text-white rounded-xl shadow-lg hover:bg-indigo-500 active:scale-95 transition">
                    <RefreshCw size={18} className={loading ? "animate-spin" : ""}/>
                </button>
            </div>
        </div>

        {/* Similarity Overlay */}
        {similarityTarget && (
            <div className="relative animate-slide-up">
                <button onClick={() => setSimilarityTarget(null)} className="absolute top-4 right-4 z-10 p-2 bg-slate-100 dark:bg-slate-900 rounded-full text-slate-500 hover:text-rose-500 transition font-bold text-xs shadow-sm">Fermer</button>
                <SimilarityFinder currentDraw={similarityTarget} history={history} />
            </div>
        )}

        {/* CALENDAR VIEW */}
        {viewMode === 'calendar' && (
            <div className="animate-fade-in">
                <HeatmapCalendar history={history} />
            </div>
        )}

        {/* LIST VIEW */}
        {viewMode === 'list' && (
            <div className="grid gap-3 animate-fade-in">
                {pagedItems.map((draw) => (
                    <div key={draw.id} className="bg-white dark:bg-slate-800 p-4 rounded-[2rem] border border-slate-100 dark:border-slate-700 shadow-sm hover:border-indigo-400 transition-all group relative overflow-hidden">
                        <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                            <div className="flex flex-col items-start min-w-[100px]">
                                <span className="text-xl font-black text-slate-800 dark:text-white leading-none">{formatDate(draw.date).split('/')[0]}/{formatDate(draw.date).split('/')[1]}</span>
                                <span className="text-[10px] text-slate-400 font-mono font-bold mt-1">{formatDate(draw.date).split('/')[2]}</span>
                            </div>
                            
                            <div className="flex flex-col items-center gap-2">
                                <div className="flex gap-1.5 flex-wrap justify-center">
                                    {draw.gagnants.map(n => <NumberBall key={n} number={n} size="sm" />)}
                                </div>
                                {draw.machine && draw.machine.length > 0 && (
                                    <div className="flex items-center gap-2 opacity-60">
                                        <span className="text-[8px] font-black text-slate-400 uppercase tracking-tighter flex items-center gap-1">
                                            <Binary size={8}/> MAC
                                        </span>
                                        <div className="flex gap-1">
                                            {draw.machine.map(n => (
                                                <div key={n} className="w-5 h-5 rounded-md bg-slate-100 dark:bg-slate-900 flex items-center justify-center text-[8px] font-black text-slate-500 border border-slate-200 dark:border-slate-800">
                                                    {n}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button onClick={() => setSimilarityTarget(draw)} className="p-2 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-xl hover:scale-110 transition" title="Similitudes">
                                    <GitCompare size={16} />
                                </button>
                                <button onClick={() => setExaminingDraw(draw)} className="p-2 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-xl hover:scale-110 transition" title="Examiner">
                                    <SearchCode size={16} />
                                </button>
                            </div>
                        </div>
                    </div>
                ))}
                
                {visibleCount < filteredHistory.length && (
                    <button onClick={() => setVisibleCount(v => v + 12)} className="w-full py-4 bg-slate-100 dark:bg-slate-800 text-slate-400 hover:text-indigo-600 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all">
                        Charger plus d'archives
                    </button>
                )}
            </div>
        )}

        {examiningDraw && <DrawExamine result={examiningDraw} onClose={() => setExaminingDraw(null)} />}
    </div>
  );
};
