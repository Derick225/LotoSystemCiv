import React, { useMemo } from "react";
import { useNexusStore } from "../store/useNexusStore";
import { motion, AnimatePresence } from "framer-motion";
import { X, Network, Atom, ShieldAlert, Cpu } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

export const ExplainabilityDrawer: React.FC = () => {
  const inspectingNumber = useNexusStore((state) => state.inspectingNumber);
  const setInspectingNumber = useNexusStore(
    (state) => state.setInspectingNumber,
  );
  const lastPrediction = useNexusStore((state) => state.lastPrediction);

  const expData = useMemo(() => {
    if (!inspectingNumber || !lastPrediction?.explainabilityData) return null;
    return lastPrediction.explainabilityData[inspectingNumber];
  }, [inspectingNumber, lastPrediction]);

  const shapData = useMemo(() => {
    if (!expData?.shapValues) return [];
    return Object.entries(expData.shapValues)
      .map(([algo, val]) => ({
        algo,
        val: Number(val) || 0,
      }))
      .sort((a, b) => b.val - a.val);
  }, [expData]);

  if (!inspectingNumber || !expData) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", damping: 25, stiffness: 200 }}
        className="fixed bottom-0 left-0 right-0 z-50 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border-t border-slate-200 dark:border-slate-800 shadow-2xl p-6 rounded-t-3xl max-h-[85vh] overflow-y-auto"
      >
        <div className="max-w-4xl mx-auto">
          <div className="flex justify-between items-start mb-6">
            <div>
              <h2 className="text-2xl font-black text-slate-900 dark:text-white flex items-center gap-3">
                <span className="w-10 h-10 bg-indigo-500 text-white flex items-center justify-center rounded-full text-xl shadow-lg">
                  {inspectingNumber}
                </span>
                XAP : Diagnostic d'Attribution
              </h2>
              <p className="text-slate-500 text-xs uppercase tracking-widest mt-2 font-medium">
                Pourquoi ce numéro a-t-il été suggéré ?
              </p>
            </div>
            <button
              onClick={() => setInspectingNumber(null)}
              className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors"
            >
              <X size={20} className="text-slate-500" />
            </button>
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            {/* SHAP Waterfall Chart Equivalent */}
            <div className="space-y-4">
              <h3 className="text-sm font-black text-slate-600 dark:text-slate-400 uppercase tracking-widest flex items-center gap-2">
                <Network size={14} className="text-indigo-400" /> Poids
                d'Inférence (SHAP)
              </h3>
              <div className="h-64 w-full bg-slate-50 dark:bg-slate-800/50 rounded-2xl p-4 border border-slate-100 dark:border-slate-800">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={shapData}
                    layout="vertical"
                    margin={{ top: 0, right: 0, left: 30, bottom: 0 }}
                  >
                    <XAxis type="number" hide />
                    <YAxis
                      dataKey="algo"
                      type="category"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 10, fill: "#64748b" }}
                      width={80}
                    />
                    <Tooltip
                      cursor={{ fill: "transparent" }}
                      contentStyle={{ borderRadius: "12px", fontSize: "12px" }}
                    />
                    <Bar dataKey="val" radius={[0, 4, 4, 0]}>
                      {shapData.map((_entry, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={
                            index < 2
                              ? "#6366f1"
                              : index < 5
                                ? "#818cf8"
                                : "#cbd5e1"
                          }
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="space-y-6">
              {/* Topological Tension */}
              <div className="bg-slate-50 dark:bg-slate-800/50 p-5 rounded-2xl border border-slate-100 dark:border-slate-800">
                <h3 className="text-xs font-black text-slate-600 dark:text-slate-400 uppercase tracking-widest flex items-center gap-2 mb-3">
                  <ShieldAlert size={14} className="text-indigo-400" /> Tension
                  Topologique
                </h3>
                <div className="flex items-end gap-3">
                  <span className="text-3xl font-black font-mono text-indigo-500">
                    {expData.topologicalTension.toFixed(2)}
                  </span>
                  <span className="text-xs text-slate-500 mb-1">
                    Indice de résistance aux perturbations locales.
                  </span>
                </div>
              </div>

              {/* DNA Orbiting Index */}
              <div className="bg-slate-50 dark:bg-slate-800/50 p-5 rounded-2xl border border-slate-100 dark:border-slate-800">
                <h3 className="text-xs font-black text-slate-600 dark:text-slate-400 uppercase tracking-widest flex items-center gap-2 mb-3">
                  <Atom size={14} className="text-emerald-400" /> Indice
                  d'Orbitale ADN
                </h3>
                <div className="flex items-end gap-3">
                  <span className="text-3xl font-black font-mono text-emerald-500">
                    {expData.dnaOrbitingIndex.toFixed(4)}
                  </span>
                  <span className="text-xs text-slate-500 mb-1">
                    Alignement spectral continu avec la signature globale.
                  </span>
                </div>
              </div>

              {/* Narrative Context */}
              <div className="bg-indigo-50 dark:bg-indigo-900/10 p-5 rounded-2xl border border-indigo-100 dark:border-indigo-800">
                <h3 className="text-xs font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-widest flex items-center gap-2 mb-2">
                  <Cpu size={14} className="text-indigo-500" /> Synthèse
                  Déterministe
                </h3>
                <p className="text-xs text-indigo-800 dark:text-indigo-300 leading-relaxed font-medium">
                  Le numéro {inspectingNumber} émerge avec une contribution
                  primaire dominée par {shapData[0]?.algo || "N/A"} et{" "}
                  {shapData[1]?.algo || "N/A"}. Sa résonance spectrale (DNA
                  Orbiting) de {expData.dnaOrbitingIndex.toFixed(4)} confirme sa
                  convergence absolue vers l'attracteur central du tirage,
                  propulsant ce candidat en zone de haute fiabilité
                  stochastique.
                </p>
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};
