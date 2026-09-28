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
  Download,
  Upload,
  CheckCircle2,
  Clock,
  Shield,
  Layers,
  Sparkles,
  Zap,
} from "lucide-react";
import { audioEngine } from "../../utils/audioEngine";
import { keys as idbKeys, clear as idbClear, delMany as idbDelMany, getMany as idbGetMany, setMany as idbSetMany } from "idb-keyval";

// Les jetons de session (Supabase Auth `sb-*-auth-token`, clés NEXUS) sont
// exclus des snapshots exportés et jamais écrasés lors d'une importation.
const isAuthStorageKey = (key: string): boolean =>
  /auth[-_]token/i.test(key) || key.startsWith("nexus_auth");

export const DatabaseControl: React.FC = () => {
  const { showToast } = useToast();
  // Les compteurs cloud restent null tant qu'aucune mesure réelle n'a abouti :
  // l'UI affiche « n/d » plutôt qu'un zéro inventé.
  const [metrics, setMetrics] = useState({
    draws: null as number | null,
    analytics: null as number | null,
    weights: null as number | null,
    feedback: null as number | null,
    subscriptions: null as number | null,
    localStorageSize: 0,
    idbKeyCount: 0,
    idbEstimatedMb: 0,
    pingLatencyMs: null as number | null,
  });
  const [tableStatus, setTableStatus] = useState<Record<string, "ok" | "missing" | "error">>({});
  const [loading, setLoading] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<
    "unknown" | "success" | "error"
  >("unknown");
  const [lastError, setLastError] = useState<string | null>(null);

  // Modals state
  const [showFactoryResetModal, setShowFactoryResetModal] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);

  useEffect(() => {
    refreshMetrics();
  }, []);

  const refreshMetrics = async () => {
    audioEngine.play("click");
    setLoading(true);
    const startPing = performance.now();

    // 1. Calculate LocalStorage size
    let localTotal = 0;
    if (typeof window !== "undefined" && window.localStorage) {
      for (const x in localStorage) {
        if (Object.prototype.hasOwnProperty.call(localStorage, x)) {
          localTotal += (localStorage[x].length + x.length) * 2;
        }
      }
    }

    // 2. Calculate IndexedDB metrics
    let idbCount = 0;
    let idbEstMb = 0;
    try {
      const allIdbKeys = await idbKeys();
      idbCount = allIdbKeys.length;

      if (navigator.storage && navigator.storage.estimate) {
        const est = await navigator.storage.estimate();
        if (est.usage) {
          idbEstMb = parseFloat((est.usage / (1024 * 1024)).toFixed(2));
        }
      }
    } catch (e) {
      console.warn("Could not read IDB estimate", e);
    }

    // 3. Supabase connectivity & counts
    if (!isSupabaseConfigured()) {
      setConnectionStatus("error");
      setLastError("Configuration .env Supabase absente (Mode Déconnecté)");
      setTableStatus({});
      setMetrics({
        draws: null,
        analytics: null,
        weights: null,
        feedback: null,
        subscriptions: null,
        localStorageSize: Math.round(localTotal / 1024),
        idbKeyCount: idbCount,
        idbEstimatedMb: idbEstMb,
        pingLatencyMs: null,
      });
      setLoading(false);
      return;
    }

    try {
      const conn = await testDatabaseConnection();
      const endPing = performance.now();
      const pingMs = Math.round(endPing - startPing);

      if (!conn.success) {
        setConnectionStatus("error");
        setLastError(conn.error || "Erreur de connexion");
        setTableStatus({});
        setMetrics({
          draws: null,
          analytics: null,
          weights: null,
          feedback: null,
          subscriptions: null,
          localStorageSize: Math.round(localTotal / 1024),
          idbKeyCount: idbCount,
          idbEstimatedMb: idbEstMb,
          pingLatencyMs: null,
        });
        setLoading(false);
        return;
      }
      setConnectionStatus("success");
      setLastError(null);

      // Probe each table independently to identify partial migrations
      const tables = ["draw_results", "draw_analytics", "algo_weights", "prediction_feedback", "subscriptions"];
      const statuses: Record<string, "ok" | "missing" | "error"> = {};
      // Un compte reste null si la table est absente ou en erreur : on ne
      // présente jamais « 0 » comme une mesure réelle.
      const counts: Record<string, number | null> = {};

      await Promise.all(
        tables.map(async (t) => {
          try {
            const { count, error } = await supabase
              .from(t)
              .select("*", { count: "exact", head: true });
            if (error) {
              statuses[t] = error.code === "42P01" ? "missing" : "error";
              counts[t] = null;
            } else {
              statuses[t] = "ok";
              counts[t] = count ?? 0;
            }
          } catch {
            statuses[t] = "error";
            counts[t] = null;
          }
        })
      );

      setTableStatus(statuses);
      setMetrics({
        draws: counts["draw_results"] ?? null,
        analytics: counts["draw_analytics"] ?? null,
        weights: counts["algo_weights"] ?? null,
        feedback: counts["prediction_feedback"] ?? null,
        subscriptions: counts["subscriptions"] ?? null,
        localStorageSize: Math.round(localTotal / 1024),
        idbKeyCount: idbCount,
        idbEstimatedMb: idbEstMb,
        pingLatencyMs: pingMs,
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

  // Selective Cache Purging (Preserving Auth and Themes)
  const handlePurgeInferenceCache = async () => {
    audioEngine.play("click");
    try {
      const allKeys = await idbKeys();
      const inferenceKeys = allKeys.filter((k) => {
        const s = String(k);
        return (
          s.includes("prediction") ||
          s.includes("tensor") ||
          s.includes("matrix") ||
          s.includes("cache_") ||
          s.includes("spectral") ||
          s.includes("weights_")
        );
      });
      if (inferenceKeys.length > 0) {
        await idbDelMany(inferenceKeys);
      }

      // Also clean inference keys in localStorage
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const key = localStorage.key(i);
        if (key && (key.startsWith("nexus_pred") || key.startsWith("nexus_cache") || key.startsWith("weights_"))) {
          localStorage.removeItem(key);
        }
      }

      audioEngine.play("success");
      showToast(`Cache IA purgé (${inferenceKeys.length} entrées supprimées)`, "success");
      refreshMetrics();
    } catch (err) {
      audioEngine.play("error");
      showToast("Erreur lors de la purge du cache IA", "error");
    }
  };

  const handlePurgeForensics = async () => {
    audioEngine.play("click");
    try {
      const allKeys = await idbKeys();
      const forensicKeys = allKeys.filter((k) => {
        const s = String(k);
        return s.includes("forensic") || s.includes("autopsy") || s.includes("audit") || s.includes("telemetry");
      });
      if (forensicKeys.length > 0) {
        await idbDelMany(forensicKeys);
      }

      for (let i = localStorage.length - 1; i >= 0; i--) {
        const key = localStorage.key(i);
        if (key && (key.startsWith("nexus_forensic") || key.startsWith("nexus_drift"))) {
          localStorage.removeItem(key);
        }
      }

      audioEngine.play("success");
      showToast(`Logs et Forensics purgés (${forensicKeys.length} clés)`, "success");
      refreshMetrics();
    } catch {
      audioEngine.play("error");
      showToast("Erreur lors du nettoyage forensics", "error");
    }
  };

  const handleFactoryReset = async () => {
    audioEngine.play("click");
    try {
      await idbClear();
      localStorage.clear();
      // Rechargement immédiat : tous les stores en mémoire référencent le
      // stockage purgé, aucun délai d'affichage n'apporte d'information.
      window.location.reload();
    } catch {
      audioEngine.play("error");
      showToast("Erreur lors de la réinitialisation", "error");
    }
  };

  const handleExportSnapshot = async () => {
    audioEngine.play("click");
    try {
      const allKeys = await idbKeys();
      const allValues = await idbGetMany(allKeys);
      const idbData: Record<string, any> = {};
      allKeys.forEach((key, idx) => {
        idbData[String(key)] = allValues[idx];
      });

      const localData: Record<string, string> = {};
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && !isAuthStorageKey(key)) {
          localData[key] = localStorage.getItem(key) || "";
        }
      }

      const snapshot = {
        meta: {
          system: "LotoSystemCiv Nexus",
          version: "12.0.0",
          exportedAt: new Date().toISOString(),
          tablesStatus: tableStatus,
          authTokensExcluded: true,
        },
        localStorage: localData,
        indexedDB: idbData,
      };

      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(snapshot, null, 2));
      const downloadAnchor = document.createElement("a");
      downloadAnchor.setAttribute("href", dataStr);
      downloadAnchor.setAttribute("download", `nexus_db_snapshot_${new Date().toISOString().split("T")[0]}.json`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();

      audioEngine.play("success");
      showToast("Snapshot de la base exporté avec succès", "success");
    } catch (e) {
      audioEngine.play("error");
      showToast("Échec de l'exportation du snapshot", "error");
    }
  };

  const handleImportSnapshot = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    audioEngine.play("click");
    setIsRestoring(true);
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const text = event.target?.result as string;
        const snapshot = JSON.parse(text);

        if (!snapshot.indexedDB && !snapshot.localStorage) {
          throw new Error("Format de snapshot invalide");
        }

        // Restore localStorage, hors jetons de session : un snapshot importé ne
        // doit jamais écraser la session active du navigateur.
        if (snapshot.localStorage) {
          Object.entries(snapshot.localStorage).forEach(([k, v]) => {
            if (!isAuthStorageKey(k)) {
              localStorage.setItem(k, v as string);
            }
          });
        }

        // Restore IndexedDB
        if (snapshot.indexedDB) {
          const entries = Object.entries(snapshot.indexedDB);
          const keysToSet = entries.map(([k]) => k);
          const valsToSet = entries.map(([, v]) => v);
          await idbSetMany(keysToSet.map((k, idx) => [k, valsToSet[idx]]));
        }

        setIsRestoring(false);
        // Rechargement immédiat : les stores en mémoire doivent se réhydrater
        // depuis le stockage restauré.
        window.location.reload();
      } catch (err: any) {
        audioEngine.play("error");
        showToast(`Échec restauration : ${err.message || "Fichier invalide"}`, "error");
        setIsRestoring(false);
      }
    };
    reader.readAsText(file);
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
        className={`p-8 rounded-3xl border shadow-2xl relative overflow-hidden flex flex-col md:flex-row justify-between items-center gap-6 ${
          connectionStatus === "error"
            ? "bg-slate-900 border-rose-900/50"
            : "bg-slate-900 border-slate-800"
        }`}
      >
        <div className="flex items-center gap-5 z-10 w-full md:w-auto">
          <div
            className={`w-16 h-16 rounded-2xl flex items-center justify-center shadow-lg shrink-0 ${
              connectionStatus === "error" ? "bg-rose-600" : "bg-indigo-600"
            }`}
          >
            <Server size={30} className="text-white" />
          </div>
          <div>
            <h3 className="text-xl font-black text-white uppercase tracking-tighter">
              Nexus Distributed Node
            </h3>
            <div className="flex flex-wrap items-center gap-3 mt-1.5">
              <span className="flex items-center gap-1.5 text-xs font-mono">
                <span
                  className={`w-2.5 h-2.5 rounded-full ${
                    connectionStatus === "success"
                      ? "bg-emerald-500 animate-pulse"
                      : "bg-rose-500"
                  }`}
                ></span>
                <span
                  className={
                    connectionStatus === "success"
                      ? "text-emerald-400 font-bold"
                      : "text-rose-400 font-bold"
                  }
                >
                  {isSupabaseConfigured()
                    ? connectionStatus === "success"
                      ? "Connecté (PostgreSQL / Supabase Edge)"
                      : "Erreur de Connexion"
                    : "Mode Local Isolé (Hors Ligne)"}
                </span>
              </span>

              {metrics.pingLatencyMs !== null && (
                <span className="px-2.5 py-0.5 rounded-full bg-slate-800 border border-slate-700 text-slate-300 text-[11px] font-mono flex items-center gap-1">
                  <Clock size={11} className="text-cyan-400" />
                  {metrics.pingLatencyMs} ms RTT
                </span>
              )}
            </div>

            {lastError && (
              <p className="text-[11px] text-rose-300 mt-2 font-mono max-w-xl bg-rose-950/40 p-2 rounded-xl border border-rose-900/30">
                {lastError}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3 z-10 w-full md:w-auto justify-end">
          <button
            onClick={refreshMetrics}
            disabled={loading}
            className="px-4 py-3 bg-white/5 hover:bg-white/10 rounded-2xl border border-white/10 transition-all text-slate-200 text-xs font-black uppercase tracking-wider flex items-center gap-2"
          >
            <RefreshCw size={16} className={loading ? "animate-spin text-indigo-400" : ""} />
            Actualiser
          </button>
        </div>
        <div className="absolute top-0 right-0 w-80 h-80 bg-indigo-600/10 rounded-full blur-[100px] pointer-events-none"></div>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          {
            label: "Tirages Cloud Indexés",
            val: metrics.draws,
            icon: <Database size={18} />,
            color: "text-indigo-400",
            status: tableStatus["draw_results"],
          },
          {
            label: "Analyses HPC",
            val: metrics.analytics,
            icon: <Activity size={18} />,
            color: "text-emerald-400",
            status: tableStatus["draw_analytics"],
          },
          {
            label: "Profils ADN Poids",
            val: metrics.weights,
            icon: <Save size={18} />,
            color: "text-amber-400",
            status: tableStatus["algo_weights"],
          },
          {
            label: "Stockage IDB + Local",
            val: `${metrics.idbEstimatedMb > 0 ? metrics.idbEstimatedMb + " MB" : metrics.localStorageSize + " KB"}`,
            icon: <HardDrive size={18} />,
            color: "text-cyan-400",
            sub: `${metrics.idbKeyCount} clés IDB`,
          },
        ].map((m, i) => (
          <div
            key={i}
            className="bg-white dark:bg-slate-800 p-6 rounded-3xl border border-slate-100 dark:border-slate-700 shadow-sm flex flex-col items-center text-center relative overflow-hidden"
          >
            {m.status && (
              <span
                className={`absolute top-4 right-4 text-[9px] font-black uppercase px-2 py-0.5 rounded-full ${
                  m.status === "ok"
                    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
                    : m.status === "missing"
                      ? "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300"
                      : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
                }`}
              >
                {m.status === "ok"
                  ? "En ligne"
                  : m.status === "missing"
                    ? "Table absente"
                    : "Erreur requête"}
              </span>
            )}
            <div
              className={`mb-3 p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-900 ${m.color}`}
            >
              {m.icon}
            </div>
            <div className="text-2xl font-black text-slate-800 dark:text-white">
              {m.val ?? "n/d"}
            </div>
            <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">
              {m.label}
            </div>
            {m.sub && (
              <div className="text-[10px] font-mono text-slate-500 mt-1">
                {m.sub}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* SQL & Backup Grid */}
      <div className="grid md:grid-cols-2 gap-8">
        {/* SQL Tools & Schema */}
        <div className="bg-white dark:bg-slate-800 p-8 rounded-3xl border border-slate-100 dark:border-slate-700 shadow-xl flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2.5 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 rounded-xl">
                <Database size={22} />
              </div>
              <div>
                <h4 className="font-black text-slate-800 dark:text-white uppercase tracking-tight">
                  Schéma SQL Supabase
                </h4>
                <p className="text-xs text-slate-400">
                  Initialisation tables, fonctions d'indexation & RLS
                </p>
              </div>
            </div>

            {connectionStatus === "error" && (
              <div className="p-4 bg-amber-50 dark:bg-amber-900/20 rounded-2xl border border-amber-200 dark:border-amber-800 mb-6 flex gap-3">
                <AlertCircle className="text-amber-500 shrink-0 mt-0.5" size={18} />
                <p className="text-xs text-amber-700 dark:text-amber-300 font-medium leading-relaxed">
                  Si les tables PostgreSQL ne sont pas encore créées sur votre projet Supabase, copiez le script officiel ci-dessous et exécutez-le dans le tableau de bord Supabase SQL Editor.
                </p>
              </div>
            )}
          </div>

          <div className="pt-4">
            <button
              onClick={copySqlToClipboard}
              className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 transition-all active:scale-95 shadow-lg shadow-indigo-600/20"
            >
              <Copy size={16} /> Copier Script SQL Déploiement
            </button>
            <p className="text-xs text-slate-400 text-center mt-3 font-mono">
              Dashboard Supabase &gt; SQL Editor &gt; New Query &gt; Run
            </p>
          </div>
        </div>

        {/* Backup & Disaster Recovery */}
        <div className="bg-white dark:bg-slate-800 p-8 rounded-3xl border border-slate-100 dark:border-slate-700 shadow-xl flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2.5 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 rounded-xl">
                <Shield size={22} />
              </div>
              <div>
                <h4 className="font-black text-slate-800 dark:text-white uppercase tracking-tight">
                  Sauvegarde & Restauration
                </h4>
                <p className="text-xs text-slate-400">
                  Export / Import snapshot complet (Poids ADN, caches, configuration)
                </p>
              </div>
            </div>

            <p className="text-xs text-slate-500 dark:text-slate-400 mb-6 leading-relaxed">
              Téléchargez une image intégrale de votre environnement de calcul (poids d'apprentissage, historique de navigation, modèles fusions) pour réplication ou secours. Les jetons de session (authentification) sont exclus du fichier et ne sont jamais écrasés par une restauration.
            </p>
          </div>

          <div className="space-y-3">
            <button
              onClick={handleExportSnapshot}
              className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-2xl font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/20 active:scale-95 transition-all"
            >
              <Download size={16} /> Télécharger Snapshot Global (JSON)
            </button>

            <label className="w-full py-3.5 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-2xl font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer transition-all active:scale-95">
              <Upload size={16} />
              <span>{isRestoring ? "Restauration en cours..." : "Restaurer un Snapshot"}</span>
              <input
                type="file"
                accept=".json"
                className="hidden"
                disabled={isRestoring}
                onChange={handleImportSnapshot}
              />
            </label>
          </div>
        </div>
      </div>

      {/* Selective Cache Cleaning & Factory Reset */}
      <div className="bg-slate-50 dark:bg-slate-900/50 p-8 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xl">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2.5 bg-rose-100 dark:bg-rose-900/30 text-rose-600 rounded-xl">
            <Trash2 size={22} />
          </div>
          <div>
            <h4 className="font-black text-slate-800 dark:text-white uppercase tracking-tight">
              Maintenance du Stockage & Purge Sélective
            </h4>
            <p className="text-xs text-slate-400">
              Nettoyez les caches volatils sans perdre votre session d'authentification
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-5 bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2 font-black text-xs uppercase text-slate-700 dark:text-slate-200 mb-1">
                <Sparkles size={14} className="text-indigo-500" /> Cache Inférence & Modèles
              </div>
              <p className="text-[11px] text-slate-400 leading-normal mb-4">
                Purger les matrices de calcul, tenseurs intermédiaires et caches de prédiction. Conserve les logins.
              </p>
            </div>
            <button
              onClick={handlePurgeInferenceCache}
              className="w-full py-2.5 bg-indigo-50 dark:bg-indigo-900/20 hover:bg-indigo-100 text-indigo-700 dark:text-indigo-300 rounded-xl text-xs font-black uppercase tracking-wider transition-all"
            >
              Vider Cache IA
            </button>
          </div>

          <div className="p-5 bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2 font-black text-xs uppercase text-slate-700 dark:text-slate-200 mb-1">
                <Activity size={14} className="text-amber-500" /> Télémétrie & Forensics
              </div>
              <p className="text-[11px] text-slate-400 leading-normal mb-4">
                Purger les rapports d'autopsie passés, logs de dérive d'algorithmes et métriques historiques.
              </p>
            </div>
            <button
              onClick={handlePurgeForensics}
              className="w-full py-2.5 bg-amber-50 dark:bg-amber-900/20 hover:bg-amber-100 text-amber-700 dark:text-amber-300 rounded-xl text-xs font-black uppercase tracking-wider transition-all"
            >
              Vider Logs Forensics
            </button>
          </div>

          <div className="p-5 bg-rose-50 dark:bg-rose-900/20 rounded-2xl border border-rose-200 dark:border-rose-900/50 flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2 font-black text-xs uppercase text-rose-700 dark:text-rose-400 mb-1">
                <Trash2 size={14} /> Réinitialisation Usine
              </div>
              <p className="text-[11px] text-rose-600/80 dark:text-rose-400/80 leading-normal mb-4">
                Efface l'intégralité du stockage local (IndexedDB + LocalStorage) et déconnecte l'utilisateur.
              </p>
            </div>
            <button
              onClick={() => setShowFactoryResetModal(true)}
              className="w-full py-2.5 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-black uppercase tracking-wider shadow-lg shadow-rose-600/20 transition-all"
            >
              Reset Global
            </button>
          </div>
        </div>
      </div>

      {/* CONFIRM FACTORY RESET MODAL */}
      {showFactoryResetModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
          <div className="bg-white dark:bg-slate-800 rounded-3xl p-6 md:p-8 max-w-sm w-full border border-rose-200 dark:border-rose-900 shadow-2xl text-center">
            <div className="w-14 h-14 bg-rose-100 dark:bg-rose-900/30 text-rose-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <AlertCircle size={26} />
            </div>
            <h4 className="text-base font-black text-slate-800 dark:text-white uppercase tracking-tight mb-2">
              Réinitialisation Totale ?
            </h4>
            <p className="text-xs text-slate-500 mb-6 leading-relaxed">
              Toutes les données locales, tickets enregistrés et sessions seront effacés de ce navigateur. L'application rechargera avec les paramètres par défaut.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowFactoryResetModal(false)}
                className="flex-1 py-3 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-black uppercase"
              >
                Annuler
              </button>
              <button
                onClick={handleFactoryReset}
                className="flex-1 py-3 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-black uppercase shadow-lg shadow-rose-600/20"
              >
                Confirmer Reset
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
