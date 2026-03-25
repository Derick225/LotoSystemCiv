
import React, { useState, useMemo } from 'react';
import { DrawResult } from '../../types';
import { NumberBall } from '../NumberBall';
import { formatDate, syncDrawExternal } from '../../services/lotteryService';
import { useNexusStore } from '../../store/useNexusStore';
import { RefreshCw, Search, Activity, Clock, Binary, Download, GitCompare, SearchCode, Calendar, Layers, Eye } from 'lucide-react';
import { ExportService } from '../../services/exportService';
import { useToast } from '../ui/Toast';
import { ListSkeleton } from '../skeletons/ListSkeleton';
import { SimilarityFinder } from '../SimilarityFinder';
import { DrawExamine } from '../DrawExamine';
import { HeatmapCalendar } from '../HeatmapCalendar';
import { FixedSizeList as List } from 'react-window';
import AutoSizer from 'react-virtualized-auto-sizer';
import { audioEngine } from '../../utils/audioEngine';

// Row Component for Virtualization
const DrawRow = ({ index, style, data }: { index: number, style: React.CSSProperties, data: { items: DrawResult[], onSimilarity: (d: DrawResult) => void, onExamine: (d: DrawResult) => void } }) => {
    const draw = data.items[index];
    if (!draw) return null;

    // Détection rapide si Machine a des numéros
    const hasMachine = draw.machine && draw.machine.length > 0;
    
    // Somme pour donner un indicateur visuel rapide (Densité)
    const sum = draw.gagnants.reduce((a,b) => a+b, 0);
    const sumColor = sum > 250 ? 'text-rose-400' : sum < 180 ? 'text-blue-400' : 'text-slate-400';

    return (
        <div style={{ ...style, paddingBottom: '12px' }} className="px-1">
            <div 
                className="bg-white dark:bg-slate-800/80 p-4 rounded-[2rem] border border-slate-100 dark:border-slate-700 shadow-sm hover:border-indigo-400 dark:hover:border-indigo-500 transition-all group relative overflow-hidden h-full flex flex-col justify-center cursor-default"
                onClick={() => { audioEngine.play('click'); data.onExamine(draw); }}
            >
                <div className="flex flex-col md:flex-row justify-between items-center gap-3 md:gap-4 w-full">
                    {/* Meta Info */}
                    <div className="flex flex-row md:flex-col items-center md:items-start justify-between md:justify-center w-full md:w-auto md:min-w-[140px] text-left">
                        <div>
                            <div className="flex items-center gap-2 mb-1">
                                <Layers size={10} className="text-indigo-500"/>
                                <span className="text-[9px] font-black uppercase text-indigo-500 tracking-wide">{draw.drawName}</span>
                            </div>
                            <div className="flex items-baseline gap-2">
                                <span className="text-lg md:text-xl font-black text-slate-800 dark:text-white leading-none">
                                    {formatDate(draw.date).split('/')[0]}/{formatDate(draw.date).split('/')[1]}
                                </span>
                                <span className="text-[10px] font-mono font-bold text-slate-500">
                                    {formatDate(draw.date).split('/')[2]}
                                </span>
                            </div>
                        </div>
                        <div className="md:hidden flex gap-2">
                             {/* Mobile Actions */}
                             <button onClick={(e) => { e.stopPropagation(); data.onSimilarity(draw); }} className="p-2 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 rounded-lg"><GitCompare size={14}/></button>
                        </div>
                    </div>
                    
                    {/* Numbers */}
                    <div className="flex flex-col items-center gap-3 w-full md:w-auto">
                        <div className="flex gap-1.5 md:gap-2 flex-wrap justify-center">
                            {draw.gagnants.map(n => <NumberBall key={n} number={n} size="sm" />)}
                        </div>
                        {hasMachine && (
                            <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 w-full md:w-auto justify-center">
                                <span className="text-[7px] font-black text-slate-400 uppercase tracking-tighter flex items-center gap-1 shrink-0">
                                    <Binary size={8}/> MAC
                                </span>
                                <div className="flex gap-1 flex-wrap justify-center">
                                    {draw.machine!.map(n => (
                                        <span key={n} className="text-[9px] font-mono font-bold text-slate-500 w-4 text-center">{n}</span>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Stats & Actions (Desktop) */}
                    <div className="hidden md:flex items-center gap-4">
                        <div className="text-center px-4 py-2 bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800">
                            <div className="text-[8px] font-black text-slate-400 uppercase">Somme</div>
                            <div className={`text-xs font-bold ${sumColor}`}>{sum}</div>
                        </div>
                        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={(e) => { e.stopPropagation(); data.onSimilarity(draw); }} className="p-2.5 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-xl hover:scale-110 transition" title="Trouver Similitudes">
                                <GitCompare size={16} />
                            </button>
                            <button onClick={(e) => { e.stopPropagation(); data.onExamine(draw); }} className="p-2.5 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-xl hover:scale-110 transition" title="Audit Complet">
                                <SearchCode size={16} />
                            </button>
                        </div>
                    </div>
                </div>
                
                {/* Visual indicator on hover */}
                <div className="absolute left-0 top-0 bottom-0 w-1 bg-indigo-500 opacity-0 group-hover:opacity-100 transition-opacity"></div>
            </div>
        </div>
    );
};

export const FluxHub: React.FC<{ history: DrawResult[] }> = ({ history }) => {
  const currentDrawName = useNexusStore(state => state.currentDrawName);
  const refreshData = useNexusStore(state => state.refreshData);
  const loading = useNexusStore(state => state.loading);
  const { showToast } = useToast();
  
  const [searchTerm, setSearchTerm] = useState('');
  const [similarityTarget, setSimilarityTarget] = useState<DrawResult | null>(null);
  const [examiningDraw, setExaminingDraw] = useState<DrawResult | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list');

  const handleManualRefresh = async () => {
      if (!currentDrawName) return;
      showToast("Synchronisation API...", "info");
      audioEngine.play('scan');
      await syncDrawExternal(currentDrawName);
      await refreshData(currentDrawName, true);
      showToast("Flux mis à jour.", "success");
      audioEngine.play('success');
  };

  const filteredHistory = useMemo(() => {
      if (!searchTerm) return history;
      const term = searchTerm.toLowerCase();
      return history.filter(h => 
          formatDate(h.date).includes(term) || 
          h.gagnants.some(n => n.toString() === term) ||
          h.drawName.toLowerCase().includes(term)
      );
  }, [history, searchTerm]);

  if (loading && history.length === 0) return <ListSkeleton />;

  return (
    <div className="space-y-6 animate-fade-in pb-4 w-full max-w-7xl mx-auto px-1 md:px-0 h-[calc(100vh-200px)] flex flex-col">
        {/* Controls Bar */}
        <div className="flex flex-col lg:flex-row justify-between items-center gap-4 bg-white dark:bg-slate-900 p-4 rounded-[2rem] shadow-xl border border-slate-100 dark:border-slate-800 relative z-30 mx-auto w-full shrink-0">
            <div className="flex items-center gap-3 px-2 w-full md:w-auto">
                <div className="p-2 bg-indigo-50 dark:bg-indigo-900/30 rounded-xl text-indigo-600 dark:text-indigo-400 shadow-sm">
                    <Activity size={18} />
                </div>
                <div>
                    <h3 className="text-sm font-black text-slate-800 dark:text-white uppercase tracking-wider">Master Flux</h3>
                    <div className="flex items-center gap-2">
                        <Clock size={10} className="text-slate-400" />
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{filteredHistory.length} Signatures</span>
                    </div>
                </div>
            </div>

            <div className="flex flex-wrap gap-2 w-full md:w-auto justify-center sm:justify-end">
                {/* View Switcher */}
                <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl border border-slate-200 dark:border-slate-700">
                    <button onClick={() => setViewMode('list')} className={`p-2 rounded-lg transition-all ${viewMode === 'list' ? 'bg-white dark:bg-slate-700 shadow text-indigo-600 dark:text-white' : 'text-slate-400'}`} title="Liste"><Activity size={14}/></button>
                    <button onClick={() => setViewMode('calendar')} className={`p-2 rounded-lg transition-all ${viewMode === 'calendar' ? 'bg-white dark:bg-slate-700 shadow text-indigo-600 dark:text-white' : 'text-slate-400'}`} title="Calendrier"><Calendar size={14}/></button>
                </div>

                <div className="relative flex-1 sm:w-48 group min-w-[140px]">
                    <input 
                        type="text" 
                        placeholder="Rechercher (Date, N°)..." 
                        value={searchTerm} 
                        onChange={(e) => setSearchTerm(e.target.value)} 
                        className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold text-[11px] outline-none focus:ring-2 ring-indigo-500/20 transition-all text-slate-800 dark:text-white placeholder-slate-400" 
                    />
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                </div>
                <div className="flex gap-2">
                    <button onClick={() => ExportService.exportHistoryToCSV(history, `Flux_${currentDrawName}`)} className="p-2.5 bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-300 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-700 transition border border-slate-200 dark:border-slate-700" title="Export CSV">
                        <Download size={18}/>
                    </button>
                    <button onClick={handleManualRefresh} className="p-2.5 bg-indigo-600 text-white rounded-xl shadow-lg hover:bg-indigo-500 active:scale-95 transition">
                        <RefreshCw size={18} className={loading ? "animate-spin" : ""}/>
                    </button>
                </div>
            </div>
        </div>

        {/* Similarity Overlay */}
        {similarityTarget && (
            <div className="relative animate-slide-up mx-auto w-full mb-4 shrink-0 z-20">
                <button onClick={() => setSimilarityTarget(null)} className="absolute top-4 right-4 z-10 p-2 bg-slate-100 dark:bg-slate-900 rounded-full text-slate-500 hover:text-rose-500 transition font-bold text-xs shadow-sm">Fermer</button>
                <SimilarityFinder currentDraw={similarityTarget} history={history} />
            </div>
        )}

        {/* CALENDAR VIEW */}
        {viewMode === 'calendar' && (
            <div className="animate-fade-in mx-auto w-full overflow-x-auto pb-4 shrink-0">
                <div className="min-w-max flex justify-center p-4">
                    <HeatmapCalendar history={history} />
                </div>
            </div>
        )}

        {/* VIRTUALIZED LIST VIEW */}
        {viewMode === 'list' && (
            <div className="flex-1 w-full min-h-0 bg-transparent">
                <AutoSizer>
                    {({ height, width }: { height: number, width: number }) => (
                        <List
                            height={height}
                            itemCount={filteredHistory.length}
                            // Hauteur conditionnelle : Plus grande sur mobile pour afficher les éléments empilés
                            itemSize={width < 768 ? 200 : 130}
                            width={width}
                            itemData={{ 
                                items: filteredHistory, 
                                onSimilarity: setSimilarityTarget, 
                                onExamine: setExaminingDraw 
                            }}
                        >
                            {DrawRow}
                        </List>
                    )}
                </AutoSizer>
            </div>
        )}

        {examiningDraw && <DrawExamine result={examiningDraw} onClose={() => setExaminingDraw(null)} />}
    </div>
  );
};
