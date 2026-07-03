import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Activity, TrendingUp, GitMerge, AlertCircle } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

export const TrainingEvolutionDrawer: React.FC<{ isOpen: boolean; onClose: () => void; drawName: string }> = ({ isOpen, onClose, drawName }) => {
  const [history, setHistory] = useState<any[]>([]);

  useEffect(() => {
    if (isOpen && typeof window !== 'undefined') {
      const data = localStorage.getItem(`nexus_weights_history_${drawName}`);
      if (data) {
        const parsed = JSON.parse(data).reverse(); // Oldest to newest
        setHistory(parsed);
      }
    }
  }, [isOpen, drawName]);

  const chartData = history.map((h, i) => {
      const base: Record<string, any> = {
          name: `v${i+1}`,
          score: h.score,
          gain: h.relativeGain,
      };
      // Flatten weights into the data point
      Object.keys(h.weights || {}).forEach(k => {
          base[k] = Number((h.weights[k] * 100).toFixed(1));
      });
      return base;
  });

  const availableAlgos = chartData.length > 0 ? Object.keys(history[0].weights || {}).slice(0, 5) : [];
  const colors = ['#6366f1', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6'];

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div 
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", damping: 25, stiffness: 200 }}
        className="fixed bottom-0 left-0 right-0 z-50 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border-t border-slate-200 dark:border-slate-800 shadow-2xl p-6 rounded-t-3xl max-h-[85vh] overflow-y-auto"
      >
        <div className="max-w-5xl mx-auto">
          <div className="flex justify-between items-start mb-6">
            <div>
              <h2 className="text-2xl font-black text-slate-900 dark:text-white flex items-center gap-3">
                <span className="w-10 h-10 bg-indigo-500 text-white flex items-center justify-center rounded-full text-xl shadow-lg">
                  <TrendingUp size={20} />
                </span>
                Évolution de l'Apprentissage
              </h2>
              <p className="text-slate-500 text-xs uppercase tracking-widest mt-2 font-medium">Historique de calibration continue (RLHF & Gradient Descent)</p>
            </div>
            <button 
              onClick={onClose}
              className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors"
            >
              <X size={20} className="text-slate-500" />
            </button>
          </div>

          {history.length === 0 ? (
            <div className="h-64 flex flex-col items-center justify-center text-slate-400">
               <AlertCircle size={32} className="mb-2 opacity-50" />
               <p className="text-sm font-medium">Aucun historique d'entraînement pour ce tirage.</p>
            </div>
          ) : (
            <div className="grid lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 space-y-4">
                  <h3 className="text-sm font-black text-slate-600 dark:text-slate-400 uppercase tracking-widest flex items-center gap-2">
                    <Activity size={14} className="text-indigo-400" /> Évolution des Poids (%)
                  </h3>
                  <div className="h-72 w-full bg-slate-50 dark:bg-slate-800/50 rounded-2xl p-4 border border-slate-100 dark:border-slate-800">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={chartData} margin={{ top: 5, right: 20, left: -20, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.2} />
                        <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} />
                        <Tooltip contentStyle={{ borderRadius: '12px', fontSize: '12px', backgroundColor: 'rgba(15, 23, 42, 0.9)', color: '#fff', border: 'none' }} />
                        <Legend iconType="circle" wrapperStyle={{ fontSize: '11px' }} />
                        {availableAlgos.map((algo, idx) => (
                            <Line key={algo} type="monotone" dataKey={algo} stroke={colors[idx % colors.length]} strokeWidth={2} dot={{ r: 2 }} activeDot={{ r: 6 }} />
                        ))}
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="text-sm font-black text-slate-600 dark:text-slate-400 uppercase tracking-widest flex items-center gap-2">
                    <GitMerge size={14} className="text-emerald-400" /> Score de Performance
                  </h3>
                  <div className="h-72 w-full bg-slate-50 dark:bg-slate-800/50 rounded-2xl p-4 border border-slate-100 dark:border-slate-800">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={chartData} margin={{ top: 5, right: 20, left: -20, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.2} />
                        <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} domain={['auto', 'auto']} />
                        <Tooltip contentStyle={{ borderRadius: '12px', fontSize: '12px', backgroundColor: 'rgba(15, 23, 42, 0.9)', color: '#fff', border: 'none' }} />
                        <Line type="monotone" dataKey="score" name="Fitness Score" stroke="#10b981" strokeWidth={3} dot={{ r: 3, fill: '#10b981' }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
            </div>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
};
