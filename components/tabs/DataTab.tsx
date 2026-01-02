import React, { useState, useEffect, useMemo, useRef } from 'react';
import { syncDrawExternal, formatDate } from '../../services/lotteryService';
import { getPredictionHistoryAsync } from '../../services/predictionHistoryService';
import { performForensicAnalysis } from '../../services/postPredictionAnalysisService';
import { generateMasterPrediction } from '../../services/predictionEngine';
import { ExportService } from '../../services/reportService';
import type { DrawResult, PredictionHistoryItem, ForensicReport } from '../../types';
import { NumberBall } from '../NumberBall';
import { ListSkeleton } from '../skeletons/ListSkeleton';
import { PredictionForensics } from '../PredictionForensics';
import { DrawExamine } from '../DrawExamine';
import { SimilarityFinder } from '../SimilarityFinder';
import { Microscope, SearchCode, RefreshCw, Zap, Activity, Clock, Filter, PlusCircle, Binary, Download, GitCompare } from 'lucide-react';
import { useToast } from '../ui/Toast';
import { useNexus } from '../NexusProvider';

interface DataTabProps { drawName: string; }

export const DataTab: React.FC<DataTabProps> = ({ drawName }) => {
  const { showToast } = useToast();
  const { history: results, loading: nexusLoading, refreshData } = useNexus();
  
  const [predictionHistory, setPredictionHistory] = useState<PredictionHistoryItem[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [isAuditing, setIsAuditing] = useState(false);
  const [auditingId, setAuditingId] = useState<string | null>(null);
  const [forensicReport, setForensicReport] = useState<ForensicReport | null>(null);
  const [examiningDraw, setExaminingDraw] = useState<DrawResult | null>(null);
  const [similarityTarget, setSimilarityTarget] = useState<DrawResult | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  
  const [visibleCount, setVisibleCount] = useState(12);
  const ITEMS_INCREMENT = 12;
  const isMounted = useRef(true);

  useEffect(() => {
      isMounted.current = true;
      return () => { isMounted.current = false; };
  }, []);

  const loadHistory = async () => {
      if (isMounted.current) setLoadingHistory(true);
      try {
        const hist = await getPredictionHistoryAsync(drawName);
        if (isMounted.current) setPredictionHistory(hist);
      } catch (err) {
        console.error(err);
      } finally {
        if (isMounted.current) setLoadingHistory(false);
      }
  };

  const handleManualRefresh = async () => {
      await syncDrawExternal(drawName);
      await refreshData(drawName, true); 
      await loadHistory();
  };

  const handleExport = () => {
      if (results.length === 0) return;
      ExportService.exportHistoryToCSV(results, `Nexus_History_${drawName}`);
      showToast("Export CSV généré.", "success");
  };

  useEffect(() => { 
    loadHistory(); 
    setVisibleCount(12); 
  }, [drawName]);

  const filtered = useMemo(() => {
      const term = searchTerm.toLowerCase();
      return results.filter(r => {
          const displayDate = formatDate(r.date, false);
          return displayDate.includes(term) || r.gagnants.some(n => n.toString() === term);
      });
  }, [results, searchTerm]);

  const pagedItems = filtered.slice(0, visibleCount);

  const handleAudit = async (result: DrawResult) => {
      const todayISO = result.date;
      const todayDisplay = formatDate(todayISO, false);
      
      const existing = predictionHistory.find(p => {
          const predDateISO = formatDate(new Date(p.timestamp).toISOString(), true);
          return predDateISO === todayISO;
      });

      if (isMounted.current) {
          setAuditingId(result.id);
          setIsAuditing(true);
      }
      try {
          let report: ForensicReport;
          if (!existing) {
              const idx = results.findIndex(r => r.id === result.id);
              const hist = results.slice(idx + 1);
              if (hist.length < 5) throw new Error("Historique trop court pour simuler l'IA.");
              const sim = await generateMasterPrediction(drawName, hist);
              report = await performForensicAnalysis(drawName, todayDisplay, sim.suggestedNumbers, result.gagnants, sim.breakdown);
          } else {
              report = await performForensicAnalysis(drawName, todayDisplay, existing.prediction.suggestedNumbers, result.gagnants, existing.prediction.breakdown, existing.id);
          }
          if (isMounted.current) setForensicReport(report);
      } catch (e: any) { 
          if (isMounted.current) showToast(e.message, "error"); 
      } finally { 
          if (isMounted.current) {
              setIsAuditing(false); 
              setAuditingId(null);
          }
      }
  };

  return (
    <div className="space-y-4 md:space-y-6 animate-fade-in relative">
        {isAuditing && (
            <div className="fixed inset-0 z-[100] bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-6">
                <div className="bg-white dark:bg-slate-800 p-8 rounded-[2.5rem] shadow-2xl max-w-sm w-full flex flex-col items-center gap-4 border border-indigo-500/20">
                    <div className="relative"><div className="w-16 h-16 border-4 border-indigo-100 border-t-indigo-600 rounded-full animate-spin"></div><Microscope className="absolute inset-0 m-auto text-indigo-600" /></div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 text-center">Extraction Séquentielle IA...</p>
                </div>
            </div>
        )}

       <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-slate-50/50 dark:bg-slate-900/50 p-2 rounded-3xl sticky top-0 z-30 backdrop-blur-md border border-white/10">
            <div className="px-2">
                <h3 className="text-xl font-black tracking-tight text-slate-800 dark:text-white">Master Flux</h3>
                <div className="flex items-center gap-2 mt-0.5"><Clock size={10} className="text-slate-400" /><span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{results.length} Signatures</span></div>
            </div>
            <div className="flex gap-2 w-full sm:w-auto">
                <div className="relative flex-1 sm:w-48 group">
                    <input type="text" placeholder="Chercher date..." value={searchTerm} onChange={(e) => { setSearchTerm(e.target.value); setVisibleCount(12); }} className="w-full pl-3 pr-8 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-bold text-[11px] outline-none focus:ring-2 ring-indigo-500/20" />
                    <Filter className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-300" />
                </div>
                <button onClick={handleExport} className="p-2.5 bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-2xl hover:bg-indigo-100 dark:hover:bg-indigo-900 transition" title="Export CSV"><Download size={16}/></button>
                <button onClick={handleManualRefresh} className="p-2.5 bg-indigo-600 text-white rounded-2xl shadow-lg active:scale-90 transition hover:bg-indigo-500"><RefreshCw size={16}/></button>
            </div>
      </div>

      {similarityTarget && (
          <div className="relative">
              <button onClick={() => setSimilarityTarget(null)} className="absolute top-4 right-4 z-10 p-2 bg-slate-100 dark:bg-slate-900 rounded-full text-slate-500 hover:text-rose-500 transition font-bold text-xs">Fermer X</button>
              <SimilarityFinder currentDraw={similarityTarget} history={results} />
          </div>
      )}

      {nexusLoading ? <ListSkeleton /> : (
          <div className="grid gap-3">
              {pagedItems.map(result => {
                  const displayDate = formatDate(result.date, false);
                  const hasPred = predictionHistory.some(p => formatDate(new Date(p.timestamp).toISOString(), true) === result.date);
                  const hasMachine = result.machine && result.machine.length === 5;
                  
                  return (
                      <div key={result.id} className="bg-white dark:bg-slate-800 p-4 rounded-[2rem] border border-slate-100 dark:border-slate-700 shadow-sm group hover:border-indigo-400 transition-all overflow-hidden relative">
                          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                              <div className="flex items-center gap-4 w-full md:w-auto">
                                  <div className="p-2.5 bg-slate-50 dark:bg-slate-900 rounded-2xl text-slate-400 group-hover:text-indigo-500 transition-colors"><Activity size={18}/></div>
                                  <div className="flex-1">
                                      <h4 className="text-sm font-black leading-none text-slate-800 dark:text-white">{displayDate}</h4>
                                      <div className="mt-1.5 flex items-center gap-2">
                                          {hasPred ? <span className="px-1.5 py-0.5 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 rounded-md text-[7px] font-black border border-indigo-100 flex items-center gap-1"><Zap size={8} className="fill-current"/> ARCHIVE IA</span> : <span className="text-[7px] font-bold text-slate-400 uppercase tracking-tighter">Donnée Brute</span>}
                                      </div>
                                  </div>
                              </div>
                              
                              <div className="flex flex-col gap-2 items-center">
                                <div className="flex gap-1.5 flex-wrap justify-center">
                                    {result.gagnants.map((n, i) => (
                                        <div key={n} className="animate-scale-in" style={{ animationDelay: `${i * 30}ms`, animationFillMode: 'backwards' }}>
                                            <NumberBall number={n} size="sm" />
                                        </div>
                                    ))}
                                </div>
                                {hasMachine && (
                                    <div className="flex items-center gap-2">
                                        <span className="text-[8px] font-black text-slate-400 uppercase tracking-tighter flex items-center gap-1">
                                            <Binary size={8}/> Machine
                                        </span>
                                        <div className="flex gap-1 justify-center">
                                            {result.machine!.map((n, i) => (
                                                <div 
                                                    key={n} 
                                                    className="w-5 h-5 rounded-md bg-slate-100 dark:bg-slate-900 flex items-center justify-center text-[8px] font-black text-slate-500 border border-slate-200 dark:border-slate-800 animate-fade-in"
                                                    style={{ animationDelay: `${200 + (i * 20)}ms`, animationFillMode: 'backwards' }}
                                                >
                                                    {n}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                              </div>

                              <div className="flex items-center gap-2 w-full md:w-auto">
                                  <button onClick={() => setSimilarityTarget(result)} className={`flex-1 md:flex-none p-2.5 rounded-xl transition ${similarityTarget?.id === result.id ? 'bg-indigo-600 text-white' : 'bg-slate-50 dark:bg-slate-700 text-slate-400 hover:text-indigo-500'}`} title="Trouver Similarités"><GitCompare size={18} /></button>
                                  <button onClick={() => setExaminingDraw(result)} className="flex-1 md:flex-none p-2.5 bg-slate-50 dark:bg-slate-700 text-slate-400 rounded-xl hover:text-indigo-500 transition" title="Examiner"><SearchCode size={18} /></button>
                                  <button onClick={() => handleAudit(result)} disabled={auditingId === result.id} className={`flex-1 md:flex-none px-4 py-2.5 rounded-xl text-[9px] font-black uppercase transition shadow-sm flex items-center justify-center gap-2 ${hasPred ? 'bg-indigo-600 text-white' : 'bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 text-slate-500'}`}>{auditingId === result.id ? <RefreshCw className="animate-spin" size={14}/> : <Microscope size={14} />}<span>Audit</span></button>
                              </div>
                          </div>
                      </div>
                  );
              })}
              {visibleCount < filtered.length && (
                  <button onClick={() => setVisibleCount(v => v + ITEMS_INCREMENT)} className="w-full py-4 bg-slate-100 dark:bg-slate-800 text-slate-400 hover:text-indigo-600 rounded-2xl font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 transition-all group">
                      <PlusCircle size={16} className="group-hover:rotate-90 transition-transform" /> Charger plus de tirages
                  </button>
              )}
              {filtered.length === 0 && !nexusLoading && (
                  <div className="p-12 text-center text-slate-400 bg-white dark:bg-slate-800 rounded-[2rem] border-2 border-dashed border-slate-100 dark:border-slate-700">
                      <Clock size={40} className="mx-auto mb-4 opacity-10" />
                      <p className="font-black text-xs uppercase tracking-widest">Aucune donnée sur cette période</p>
                  </div>
              )}
          </div>
      )}

      {forensicReport && <PredictionForensics report={forensicReport} onClose={() => setForensicReport(null)} />}
      {examiningDraw && <DrawExamine result={examiningDraw} onClose={() => setExaminingDraw(null)} />}
    </div>
  );
};