import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  Activity,
  TrendingUp,
  GitMerge,
  AlertCircle,
  Database,
  RefreshCw,
} from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { supabase, isSupabaseConfigured } from "../services/supabaseClient";

export interface WeightHistoryEntry {
  timestamp?: number | string;
  created_at?: string;
  score?: number;
  fitness?: number;
  relativeGain?: number;
  improvement_delta?: number | string;
  weights?: Record<string, number>;
  applied_weights?: Record<string, number>;
  source?: "supabase" | "local";
}

export const TrainingEvolutionDrawer: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  drawName: string;
}> = ({ isOpen, onClose, drawName }) => {
  const [history, setHistory] = useState<WeightHistoryEntry[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  useEffect(() => {
    let isMounted = true;

    const fetchHistoryData = async () => {
      if (!isOpen || !drawName) return;
      setIsLoading(true);

      const entries: WeightHistoryEntry[] = [];

      // 1. Charger depuis Supabase si disponible
      if (isSupabaseConfigured() && navigator.onLine) {
        try {
          const { data: logs, error: logsError } = await supabase
            .from("learning_logs")
            .select("*")
            .eq("draw_name", drawName)
            .order("created_at", { ascending: true });

          if (!logsError && logs) {
            logs.forEach((item: any) => {
              const weights = item.applied_weights || {};
              const fit = Number(item.new_fitness) || 0;
              const prevFit = Number(item.previous_fitness) || 0;
              const gain = prevFit > 0 ? ((fit - prevFit) / prevFit) * 100 : 0;

              entries.push({
                created_at: item.created_at,
                timestamp: new Date(item.created_at).getTime(),
                score: fit,
                fitness: fit,
                relativeGain: gain,
                improvement_delta: item.improvement_delta,
                weights: weights,
                source: "supabase",
              });
            });
          }

          const { data: sessions, error: sessionsError } = await supabase
            .from("learning_sessions")
            .select("*")
            .eq("draw_name", drawName)
            .order("created_at", { ascending: true });

          if (!sessionsError && sessions) {
            sessions.forEach((s: any) => {
              const sData = s.session_data || {};
              if (sData.bestGenome) {
                entries.push({
                  created_at: s.created_at,
                  timestamp: s.timestamp || new Date(s.created_at).getTime(),
                  score: sData.bestFitness || sData.score || 0,
                  fitness: sData.bestFitness || sData.score || 0,
                  relativeGain: sData.improvement || 0,
                  weights: sData.bestGenome,
                  source: "supabase",
                });
              }
            });
          }
        } catch (e) {
          console.warn("[TrainingEvolutionDrawer] Supabase fetch error:", e);
        }
      }

      // 2. Charger depuis localStorage
      if (typeof window !== "undefined") {
        try {
          const localData = localStorage.getItem(
            `nexus_weights_history_${drawName}`,
          );
          if (localData) {
            const parsed = JSON.parse(localData);
            if (Array.isArray(parsed)) {
              parsed.forEach((h: any, idx: number) => {
                entries.push({
                  timestamp:
                    h.timestamp || Date.now() - (parsed.length - idx) * 3600000,
                  score: Number(h.score) || Number(h.fitness) || 0,
                  fitness: Number(h.fitness) || Number(h.score) || 0,
                  relativeGain: Number(h.relativeGain) || 0,
                  weights: h.weights || h.applied_weights || {},
                  source: "local",
                });
              });
            }
          }
        } catch (e) {
          console.warn(
            "[TrainingEvolutionDrawer] LocalStorage parse error:",
            e,
          );
        }
      }

      // Sort chronologically and remove duplicate snapshots by close timestamp
      entries.sort(
        (a, b) => Number(a.timestamp || 0) - Number(b.timestamp || 0),
      );

      const deduped: WeightHistoryEntry[] = [];
      const seen = new Set<string>();

      entries.forEach((e) => {
        const key = `${Math.floor(Number(e.timestamp || 0) / 1000)}_${(e.score || 0).toFixed(2)}`;
        if (!seen.has(key)) {
          seen.add(key);
          deduped.push(e);
        }
      });

      if (isMounted) {
        setHistory(deduped);
        setIsLoading(false);
      }
    };

    fetchHistoryData();

    return () => {
      isMounted = false;
    };
  }, [isOpen, drawName]);

  // Transform dataset for Recharts
  const chartData = history.map((h, i) => {
    const base: Record<string, any> = {
      name: `v${i + 1}`,
      score: Number((h.score || h.fitness || 0).toFixed(2)),
      gain: Number((h.relativeGain || 0).toFixed(1)),
      source: h.source || "local",
    };

    // Extract weights normalized to 0-100%
    const weightsObj = h.weights || h.applied_weights || {};
    Object.keys(weightsObj).forEach((k) => {
      const val = weightsObj[k];
      base[k] = typeof val === "number" ? Number((val * 100).toFixed(1)) : 0;
    });

    return base;
  });

  // Extract all unique algorithm keys present across the history entries
  const allAlgoKeysSet = new Set<string>();
  history.forEach((h) => {
    const w = h.weights || h.applied_weights || {};
    Object.keys(w).forEach((k) => allAlgoKeysSet.add(k));
  });
  const availableAlgos = Array.from(allAlgoKeysSet);

  const colors = [
    "#6366f1",
    "#10b981",
    "#f59e0b",
    "#ec4899",
    "#8b5cf6",
    "#3b82f6",
    "#14b8a6",
    "#f97316",
    "#a855f7",
    "#06b6d4",
    "#eab308",
  ];

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", damping: 25, stiffness: 200 }}
        className="fixed bottom-0 left-0 right-0 z-50 bg-slate-950/95 backdrop-blur-xl border-t border-slate-800 shadow-2xl p-6 rounded-t-3xl max-h-[85vh] overflow-y-auto"
      >
        <div className="max-w-6xl mx-auto">
          <div className="flex justify-between items-start mb-6">
            <div>
              <h2 className="text-2xl font-black text-white flex items-center gap-3">
                <span className="w-10 h-10 bg-indigo-600 text-white flex items-center justify-center rounded-2xl text-xl shadow-lg shadow-indigo-600/30">
                  <TrendingUp size={20} />
                </span>
                Évolution de l'Apprentissage &bull;{" "}
                <span className="text-emerald-400">{drawName}</span>
              </h2>
              <p className="text-slate-400 text-xs uppercase tracking-widest mt-2 font-medium flex items-center gap-2">
                <Database size={12} className="text-indigo-400" />
                Historique complet de calibration continue (RLHF &amp; Gradient
                Descent)
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-slate-800 rounded-full transition-colors text-slate-400 hover:text-white cursor-pointer"
            >
              <X size={20} />
            </button>
          </div>

          {isLoading ? (
            <div className="h-64 flex flex-col items-center justify-center text-slate-400 gap-3">
              <RefreshCw size={28} className="animate-spin text-indigo-500" />
              <p className="text-xs font-bold uppercase tracking-widest">
                Chargement de l'historique d'apprentissage...
              </p>
            </div>
          ) : history.length === 0 ? (
            <div className="h-64 flex flex-col items-center justify-center text-slate-500 bg-slate-900/40 rounded-2xl border border-dashed border-slate-800">
              <AlertCircle
                size={36}
                className="mb-3 opacity-60 text-amber-500"
              />
              <p className="text-sm font-bold text-slate-300">
                Aucun historique d'entraînement pour ce tirage ({drawName}).
              </p>
              <p className="text-xs text-slate-500 mt-1">
                Lancez une session dans le Laboratoire Darwinien pour
                initialiser la télémétrie.
              </p>
            </div>
          ) : (
            <div className="grid lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                    <Activity size={14} className="text-indigo-400" />{" "}
                    Distribution &amp; Mutation des Poids (%)
                  </h3>
                  <span className="text-[10px] font-mono text-slate-500 bg-slate-900 px-2 py-1 rounded-md border border-slate-800">
                    {history.length} itérations enregistrées
                  </span>
                </div>
                <div className="h-80 w-full bg-slate-900/60 rounded-2xl p-4 border border-slate-800">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                      data={chartData}
                      margin={{ top: 10, right: 20, left: -20, bottom: 5 }}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="#334155"
                        opacity={0.2}
                      />
                      <XAxis
                        dataKey="name"
                        tick={{ fontSize: 10, fill: "#64748b" }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        tick={{ fontSize: 10, fill: "#64748b" }}
                        axisLine={false}
                        tickLine={false}
                        domain={[0, "auto"]}
                      />
                      <Tooltip
                        contentStyle={{
                          borderRadius: "12px",
                          fontSize: "11px",
                          backgroundColor: "#020617",
                          color: "#fff",
                          border: "1px solid #1e293b",
                        }}
                      />
                      <Legend
                        iconType="circle"
                        wrapperStyle={{ fontSize: "10px", paddingTop: "10px" }}
                      />
                      {availableAlgos.map((algo, idx) => (
                        <Line
                          key={algo}
                          type="monotone"
                          dataKey={algo}
                          stroke={colors[idx % colors.length]}
                          strokeWidth={2}
                          dot={{ r: 3 }}
                          activeDot={{ r: 6 }}
                        />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                  <GitMerge size={14} className="text-emerald-400" /> Score de
                  Fitness Global
                </h3>
                <div className="h-80 w-full bg-slate-900/60 rounded-2xl p-4 border border-slate-800 flex flex-col justify-between">
                  <ResponsiveContainer width="100%" height="80%">
                    <LineChart
                      data={chartData}
                      margin={{ top: 10, right: 20, left: -20, bottom: 5 }}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="#334155"
                        opacity={0.2}
                      />
                      <XAxis
                        dataKey="name"
                        tick={{ fontSize: 10, fill: "#64748b" }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        tick={{ fontSize: 10, fill: "#64748b" }}
                        axisLine={false}
                        tickLine={false}
                        domain={["auto", "auto"]}
                      />
                      <Tooltip
                        contentStyle={{
                          borderRadius: "12px",
                          fontSize: "11px",
                          backgroundColor: "#020617",
                          color: "#fff",
                          border: "1px solid #1e293b",
                        }}
                      />
                      <Line
                        type="monotone"
                        dataKey="score"
                        name="Fitness Score"
                        stroke="#10b981"
                        strokeWidth={3}
                        dot={{ r: 4, fill: "#10b981" }}
                      />
                    </LineChart>
                  </ResponsiveContainer>

                  <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-[10px] text-emerald-300 font-mono flex justify-between items-center">
                    <span>Dernier Score :</span>
                    <span className="font-black text-sm text-emerald-400">
                      {history.length > 0
                        ? (history[history.length - 1].score || 0).toFixed(2)
                        : "--"}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
};
