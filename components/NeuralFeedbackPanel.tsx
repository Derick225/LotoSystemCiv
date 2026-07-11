import React, { useState } from 'react';
import { useNexusStore } from '../store/useNexusStore';
import { 
  BrainCircuit, 
  Trash2, 
  Search, 
  Filter, 
  TrendingUp, 
  TrendingDown, 
  Minus, 
  Clock, 
  ArrowRight, 
  Sparkles,
  CheckCircle2,
  Info
} from 'lucide-react';
import { audioEngine } from '../utils/audioEngine';
import { useToast } from './ui/Toast';

export const NeuralFeedbackPanel: React.FC = () => {
  const { neuralFeedbackLogs } = useNexusStore();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedAlgo, setSelectedAlgo] = useState<string>('ALL');
  const [selectedDirection, setSelectedDirection] = useState<string>('ALL');
  const { showToast } = useToast();

  const handleClearLogs = () => {
    try { audioEngine.play('click'); } catch(e) {}
    if (neuralFeedbackLogs.length === 0) return;
    if (window.confirm("Voulez-vous réinitialiser l'historique du feedback neuronal (session actuelle) ?")) {
      useNexusStore.setState({ neuralFeedbackLogs: [] });
      try { audioEngine.play('success'); } catch(e) {}
      showToast("Historique de feedback nettoyé.", "info");
    }
  };

  // Extract unique algorithm names from logs for filtering
  const uniqueAlgos = Array.from(new Set(neuralFeedbackLogs.map(log => log.algo)));

  // Filter logs based on search term, selected algorithm, and direction
  const filteredLogs = neuralFeedbackLogs.filter(log => {
    const matchesSearch = 
      log.algo.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.reason.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.drawName.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesAlgo = selectedAlgo === 'ALL' || log.algo === selectedAlgo;
    
    const matchesDirection = 
      selectedDirection === 'ALL' || 
      (selectedDirection === 'BOOST' && log.direction === 'BOOST') ||
      (selectedDirection === 'REDUCE' && log.direction === 'REDUCE') ||
      (selectedDirection === 'STABILIZE' && log.direction === 'STABILIZE');

    return matchesSearch && matchesAlgo && matchesDirection;
  });

  return (
    <div id="neural-feedback-panel" className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xl overflow-hidden transition-all duration-300">
      {/* Header */}
      <div className="p-6 border-b border-slate-100 dark:border-slate-800 bg-gradient-to-r from-slate-50 to-white dark:from-slate-900 dark:to-slate-950 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-emerald-500/10 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 rounded-2xl animate-pulse">
            <BrainCircuit size={24} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-xl font-black text-slate-900 dark:text-white tracking-tight">
                Feedback Neural Post-Tirage
              </h3>
              <span className="flex h-2.5 w-2.5 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mt-1">
              Supervision en temps réel du calibrage adaptatif et de l'apprentissage de l'ADN algorithmique.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-auto">
          {neuralFeedbackLogs.length > 0 && (
            <button
              onClick={handleClearLogs}
              className="px-4 py-2 text-xs font-black uppercase tracking-wider text-rose-500 hover:text-rose-600 hover:bg-rose-500/5 rounded-xl border border-rose-500/10 transition-all duration-200 flex items-center gap-2"
            >
              <Trash2 size={14} />
              Effacer ({neuralFeedbackLogs.length})
            </button>
          )}
        </div>
      </div>

      {/* Control Bar */}
      <div className="p-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 flex flex-col md:flex-row gap-3">
        {/* Search */}
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
          <input
            type="text"
            placeholder="Rechercher par algo, tirage ou motif..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-850 text-slate-800 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:focus:ring-emerald-500/30 focus:border-emerald-500 transition-all"
          />
        </div>

        {/* Algorithm Filter */}
        <div className="flex gap-2 flex-wrap sm:flex-nowrap">
          <div className="relative flex-shrink-0 w-full sm:w-48">
            <Filter size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 pointer-events-none" />
            <select
              value={selectedAlgo}
              onChange={(e) => setSelectedAlgo(e.target.value)}
              className="w-full pl-9 pr-8 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-850 text-slate-800 dark:text-white appearance-none focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all"
            >
              <option value="ALL">Tous les Algorithmes</option>
              {uniqueAlgos.map(algo => (
                <option key={algo} value={algo}>{algo}</option>
              ))}
            </select>
          </div>

          {/* Direction Filter */}
          <div className="relative flex-shrink-0 w-full sm:w-40">
            <select
              value={selectedDirection}
              onChange={(e) => setSelectedDirection(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-850 text-slate-800 dark:text-white appearance-none focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all"
            >
              <option value="ALL">Tous les impacts</option>
              <option value="BOOST">Renforcements (BOOST)</option>
              <option value="REDUCE">Pénalisations (REDUCE)</option>
              <option value="STABILIZE">Stabilisations (STABILIZE)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Logs Feed */}
      <div className="max-h-[480px] overflow-y-auto scrollbar-thin scrollbar-thumb-slate-200 dark:scrollbar-thumb-slate-800">
        {filteredLogs.length === 0 ? (
          <div className="p-12 text-center flex flex-col items-center justify-center space-y-4">
            <div className="p-4 bg-slate-50 dark:bg-slate-850 rounded-full text-slate-300 dark:text-slate-700 relative">
              <BrainCircuit size={40} className="text-slate-400 dark:text-slate-600 animate-pulse" />
              <Sparkles size={16} className="absolute top-2 right-2 text-emerald-400 animate-bounce" />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-700 dark:text-slate-300">
                Aucun signal de feedback neuronal actif
              </p>
              <p className="text-xs text-slate-400 dark:text-slate-500 max-w-sm mx-auto mt-2 leading-relaxed">
                Les découvertes post-tirage et les calibrages d'ADN apparaîtront ici dès que vous exécuterez une <strong>Autopsie Post-Mortem</strong>, appliquerez un <strong>Auto-Tune</strong>, ou effectuerez un rééquilibrage ciblé sur l'un de vos tirages.
              </p>
            </div>
            <div className="p-3 bg-indigo-500/5 dark:bg-indigo-500/10 rounded-2xl border border-indigo-500/10 max-w-md text-left flex gap-3 mt-2">
              <Info size={16} className="text-indigo-500 shrink-0 mt-0.5" />
              <div className="text-[11px] text-indigo-600 dark:text-indigo-400 font-medium">
                <strong>Astuce :</strong> Allez dans l'onglet principal "Rapports", sélectionnez une prédiction passée avec un résultat de tirage publié, puis cliquez sur <strong>"Générer l'Autopsie"</strong> et injectez les leçons via <strong>"Auto-Tune"</strong>.
              </div>
            </div>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800/60">
            {filteredLogs.map((log) => {
              const formattedTime = new Date(log.timestamp).toLocaleTimeString();
              const isBoost = log.direction === 'BOOST';
              const isReduce = log.direction === 'REDUCE';

              return (
                <div 
                  key={log.id} 
                  className="p-4 hover:bg-slate-50/50 dark:hover:bg-slate-850/30 transition-all duration-200 flex flex-col sm:flex-row sm:items-start justify-between gap-3 animate-slide-up"
                >
                  <div className="flex items-start gap-3.5 flex-1 min-w-0">
                    {/* Direction Badge */}
                    <div className={`p-2 rounded-xl shrink-0 mt-0.5 ${
                      isBoost 
                        ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/10' 
                        : isReduce 
                        ? 'bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/10' 
                        : 'bg-slate-50 dark:bg-slate-500/10 text-slate-500 dark:text-slate-400 border border-slate-500/10'
                    }`}>
                      {isBoost ? <TrendingUp size={16} /> : isReduce ? <TrendingDown size={16} /> : <Minus size={16} />}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center flex-wrap gap-2">
                        {/* Algo Badge */}
                        <span className="font-mono text-xs font-black uppercase px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                          {log.algo}
                        </span>

                        {/* Draw Name */}
                        <span className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-500/5 dark:bg-indigo-500/10 px-2 py-0.5 rounded-md border border-indigo-500/5">
                          {log.drawName}
                        </span>

                        {/* Weight Shift Representation */}
                        <div className="flex items-center gap-1.5 text-xs font-bold text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-900 px-2 py-0.5 rounded-md border border-slate-100 dark:border-slate-800">
                          <span className="font-mono">{log.oldWeight.toFixed(3)}</span>
                          <ArrowRight size={10} className="text-slate-400" />
                          <span className="font-mono font-black text-slate-900 dark:text-white">
                            {log.newWeight.toFixed(3)}
                          </span>
                        </div>
                      </div>

                      {/* Reason text */}
                      <p className="text-xs text-slate-600 dark:text-slate-300 font-medium mt-1.5 leading-relaxed">
                        {log.reason}
                      </p>
                    </div>
                  </div>

                  {/* Impact & Time info */}
                  <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-start gap-2 shrink-0 border-t sm:border-t-0 border-slate-100 dark:border-slate-800 pt-2 sm:pt-0">
                    <div className={`px-2.5 py-1 rounded-lg text-xs font-black flex items-center gap-1 ${
                      isBoost 
                        ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' 
                        : isReduce 
                        ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400' 
                        : 'bg-slate-500/10 text-slate-600 dark:text-slate-400'
                    }`}>
                      {isBoost ? '+' : ''}{log.impactPercentage > 0 ? log.impactPercentage.toFixed(2) : log.impactPercentage.toFixed(2)}%
                    </div>

                    <div className="flex items-center gap-1 text-[10px] text-slate-400 dark:text-slate-500 font-mono">
                      <Clock size={10} />
                      <span>{formattedTime}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer statistics */}
      {neuralFeedbackLogs.length > 0 && (
        <div className="p-4 bg-slate-50 dark:bg-slate-950 border-t border-slate-100 dark:border-slate-800/60 text-[11px] text-slate-500 dark:text-slate-400 font-medium flex justify-between items-center">
          <div className="flex items-center gap-1">
            <CheckCircle2 size={12} className="text-emerald-500" />
            <span>Moteur d'inférence synchronisé de façon 100% déterministe.</span>
          </div>
          <div className="font-mono">
            {filteredLogs.length === neuralFeedbackLogs.length 
              ? `${neuralFeedbackLogs.length} signaux actifs` 
              : `${filteredLogs.length} / ${neuralFeedbackLogs.length} filtrés`
            }
          </div>
        </div>
      )}
    </div>
  );
};
