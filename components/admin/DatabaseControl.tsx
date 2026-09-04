import React, { useState, useEffect } from "react";
import {
  supabase,
  testDatabaseConnection,
  isSupabaseConfigured,
} from "../../services/supabaseClient";
import { useToast } from "../ui/Toast";
import { NEXUS_DATABASE_SCHEMA } from "../../services/databaseSchema";
import {
  Database,
  HardDrive,
  Trash2,
  Server,
  Activity,
  Copy,
  RefreshCw,
  Save,
  AlertCircle,
} from "lucide-react";
import { audioEngine } from "../../utils/audioEngine";

export const DatabaseControl: React.FC = () => {
  const { showToast } = useToast();
  const [metrics, setMetrics] = useState({
    draws: 0,
    analytics: 0,
    weights: 0,
    feedback: 0,
    localStorageSize: 0,
  });
  const [loading, setLoading] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<
    "unknown" | "success" | "error"
  >("unknown");
  const [lastError, setLastError] = useState<string | null>(null);

  useEffect(() => {
    refreshMetrics();
  }, []);

  const refreshMetrics = async () => {
    audioEngine.play("click");
    if (!isSupabaseConfigured()) {
      setConnectionStatus("error");
      setLastError("Configuration .env manquante");
      return;
    }

    setLoading(true);
    try {
      // Test de connexion d'abord
      const conn = await testDatabaseConnection();
      if (!conn.success) {
        setConnectionStatus("error");
        setLastError(conn.error || "Erreur inconnue");
        setLoading(false);
        return;
      }
      setConnectionStatus("success");
      setLastError(null);

      const [draws, analytics, weights, feedback] = await Promise.all([
        supabase
          .from("draw_results")
          .select("id", { count: "exact", head: true }),
        supabase
          .from("draw_analytics")
          .select("id", { count: "exact", head: true }),
        supabase
          .from("algo_weights")
          .select("id", { count: "exact", head: true }),
        supabase
          .from("prediction_feedback")
          .select("id", { count: "exact", head: true }),
      ]);

      let total = 0;
      if (typeof window !== "undefined" && window.localStorage) {
        for (const x in localStorage) {
          if (Object.prototype.hasOwnProperty.call(localStorage, x)) {
            total += (localStorage[x].length + x.length) * 2;
          }
        }
      }

      setMetrics({
        draws: draws.count || 0,
        analytics: analytics.count || 0,
        weights: weights.count || 0,
        feedback: feedback.count || 0,
        localStorageSize: Math.round(total / 1024),
      });
      audioEngine.play("success");
    } catch (e: unknown) {
      console.error("Metrics error", e);
      setConnectionStatus("error");
      setLastError(e instanceof Error ? e.message : String(e));
      audioEngine.play("error");
    } finally {
      setLoading(false);
    }
  };

  const handleClearCache = () => {
    audioEngine.play("click");
    if (
      confirm(
        "Attention : Cela effacera tous les tickets locaux, l'historique de navigation et les préférences. Continuer ?",
      )
    ) {
      localStorage.clear();
      refreshMetrics();
      audioEngine.play("success");
      showToast("Cache local purgé.", "success");
      window.location.reload();
    }
  };

  const copySqlToClipboard = () => {
    audioEngine.play("click");
    navigator.clipboard.writeText(NEXUS_DATABASE_SCHEMA);
    audioEngine.play("success");
    showToast(
      "Script SQL copié. Collez-le dans l'éditeur SQL Supabase.",
      "success",
    );
  };

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Status Header */}
      <div
        className={`p-8 rounded-2xl border shadow-2xl relative overflow-hidden flex flex-col md:flex-row justify-between items-center gap-6 ${connectionStatus === "error" ? "bg-rose-950 border-rose-800" : "bg-slate-900 border-slate-800"}`}
      >
        <div className="flex items-center gap-4 z-10">
          <div
            className={`w-16 h-16 rounded-2xl flex items-center justify-center shadow-lg ${connectionStatus === "error" ? "bg-rose-600" : "bg-indigo-600"}`}
          >
            <Server size={32} className="text-white" />
          </div>
          <div>
            <h3 className="text-xl font-black text-white uppercase tracking-tighter">
              Nexus Cloud Node
            </h3>
            <div className="flex items-center gap-2 mt-1">
              <span
                className={`w-2 h-2 rounded-full ${connectionStatus === "success" ? "bg-emerald-500 animate-pulse" : "bg-rose-500"}`}
              ></span>
              <span
                className={`text-xs font-mono ${connectionStatus === "success" ? "text-emerald-400" : "text-rose-400"}`}
              >
                {isSupabaseConfigured()
                  ? connectionStatus === "success"
                    ? "Connecté (PostgreSQL)"
                    : "Erreur de Connexion"
                  : "Mode Local (Offline)"}
              </span>
            </div>
            {lastError && (
              <p className="text-[10px] text-rose-300 mt-2 font-mono max-w-md">
                {lastError}
              </p>
            )}
          </div>
        </div>
        <div className="flex gap-3 z-10">
          <button
            onClick={refreshMetrics}
            className="p-3 bg-white/5 hover:bg-white/10 rounded-xl border border-white/5 transition-all text-slate-300"
          >
            <RefreshCw size={20} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
        <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-600/5 rounded-full blur-[80px] pointer-events-none"></div>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          {
            label: "Tirages Indexés",
            val: metrics.draws,
            icon: <Database size={16} />,
            color: "text-indigo-400",
          },
          {
            label: "Analyses HPC",
            val: metrics.analytics,
            icon: <Activity size={16} />,
            color: "text-emerald-400",
          },
          {
            label: "Profils ADN",
            val: metrics.weights,
            icon: <Save size={16} />,
            color: "text-amber-400",
          },
          {
            label: "Cache Local",
            val: `${metrics.localStorageSize} KB`,
            icon: <HardDrive size={16} />,
            color: "text-slate-400",
          },
        ].map((m, i) => (
          <div
            key={i}
            className="bg-white dark:bg-slate-800 p-6 rounded-[2rem] border border-slate-100 dark:border-slate-700 shadow-sm flex flex-col items-center text-center"
          >
            <div
              className={`mb-3 p-3 rounded-full bg-slate-50 dark:bg-slate-900 ${m.color}`}
            >
              {m.icon}
            </div>
            <div className="text-2xl font-black text-slate-800 dark:text-white">
              {m.val}
            </div>
            <div className="text-xs font-black text-slate-400 uppercase tracking-widest">
              {m.label}
            </div>
          </div>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-8">
        {/* SQL Tools */}
        <div className="bg-white dark:bg-slate-800 p-8 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-xl">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 rounded-lg">
              <Database size={20} />
            </div>
            <h4 className="font-black text-slate-700 dark:text-white uppercase tracking-tight">
              Installation BDD
            </h4>
          </div>

          {connectionStatus === "error" && (
            <div className="p-4 bg-amber-50 dark:bg-amber-900/20 rounded-xl border border-amber-200 dark:border-amber-800 mb-6 flex gap-3">
              <AlertCircle className="text-amber-500 shrink-0" size={18} />
              <p className="text-[10px] text-amber-700 dark:text-amber-300 font-medium leading-relaxed">
                Si vous venez de cloner le projet, vous devez exécuter le script
                SQL d'initialisation dans Supabase pour créer les tables.
              </p>
            </div>
          )}

          <button
            onClick={copySqlToClipboard}
            className="w-full py-4 bg-slate-900 dark:bg-indigo-600 hover:bg-slate-800 dark:hover:bg-indigo-500 text-white rounded-2xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 transition-all active:scale-95 shadow-lg"
          >
            <Copy size={16} /> Copier Script SQL
          </button>
          <p className="text-xs text-slate-400 text-center mt-3 font-mono">
            Collez dans : Supabase Dashboard &gt; SQL Editor
          </p>
        </div>

        {/* Maintenance Zone */}
        <div className="bg-rose-50 dark:bg-rose-900/10 p-8 rounded-2xl border border-rose-100 dark:border-rose-800 shadow-xl">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-rose-100 dark:bg-rose-900/30 text-rose-600 rounded-lg">
              <Trash2 size={20} />
            </div>
            <h4 className="font-black text-rose-800 dark:text-rose-400 uppercase tracking-tight">
              Zone Danger
            </h4>
          </div>
          <p className="text-xs text-rose-700 dark:text-rose-300/70 mb-8 font-medium leading-relaxed">
            Actions irréversibles sur les données locales. Utilisez avec
            précaution si l'application rencontre des problèmes de
            synchronisation ou d'affichage.
          </p>
          <button
            onClick={handleClearCache}
            className="w-full py-4 bg-rose-600 hover:bg-rose-500 text-white rounded-2xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 transition-all active:scale-95 shadow-lg"
          >
            <Trash2 size={16} /> Purger Cache Local
          </button>
        </div>
      </div>
    </div>
  );
};
