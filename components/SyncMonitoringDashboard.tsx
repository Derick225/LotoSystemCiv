import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Cloud,
  HardDrive,
  Wifi,
  WifiOff,
  RefreshCw,
  CheckCircle,
  AlertTriangle,
  XCircle,
  Activity,
  ChevronRight,
} from "lucide-react";
import { useSyncStatus } from "../hooks/useSyncStatus";

export const SyncMonitoringDashboard: React.FC = () => {
  const {
    isOnline,
    dbConnection,
    idbStats,
    isSyncing,
    lastChecked,
    checkStatus,
  } = useSyncStatus();

  const MetricRow = ({
    label,
    value,
  }: {
    label: string;
    value: string | number;
  }) => (
    <div className="flex justify-between items-center py-1 border-b border-slate-700/50 last:border-0">
      <span className="text-slate-400 text-xs">{label}</span>
      <span className="text-slate-200 text-xs font-mono">{value}</span>
    </div>
  );

  return (
    <div className="glass-card neural-border rounded-xl p-6 text-white font-mono relative overflow-hidden shadow-2xl">
      <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-5 pointer-events-none mix-blend-screen"></div>

      <div className="flex justify-between items-center mb-6 relative z-10 border-b border-slate-700/50 pb-4">
        <div className="flex items-center gap-3">
          <Activity className="w-5 h-5 text-cyan-400" />
          <h2 className="text-lg font-bold tracking-tight text-slate-100">
            Telemetry & Synchronization
          </h2>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[10px] text-slate-500">
            LAST SYNC: {lastChecked.toLocaleTimeString()}
          </span>
          <button
            onClick={checkStatus}
            disabled={isSyncing}
            className="p-1.5 rounded-md bg-slate-800 hover:bg-slate-700 border border-slate-600 transition-colors disabled:opacity-50"
            title="Force refresh"
          >
            <RefreshCw
              className={`w-4 h-4 text-cyan-400 ${isSyncing ? "animate-spin" : ""}`}
            />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 relative z-10">
        {/* IndexedDB Cache */}
        <div className="bg-slate-800/50 rounded-lg p-5 border border-slate-700 relative group overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 to-cyan-400 rounded-t-lg opacity-80 shadow-[0_0_10px_rgba(6,182,212,0.5)]"></div>
          <div className="flex items-center gap-3 mb-4">
            <HardDrive className="w-5 h-5 text-blue-400 drop-shadow-[0_0_5px_rgba(96,165,250,0.5)]" />
            <h3 className="font-semibold text-slate-200">IndexedDB Engine</h3>
          </div>

          <div className="space-y-1 mt-4">
            <MetricRow label="Stored Predictions" value={idbStats.history} />
            <MetricRow label="Forensic Reports" value={idbStats.forensics} />
            <MetricRow label="Learning Sessions" value={idbStats.learning} />
            <MetricRow label="Autopsy Snapshots" value={idbStats.snapshots} />
            <MetricRow label="Other Assets" value={idbStats.other} />
            <div className="mt-4 pt-3 border-t border-slate-700">
              <MetricRow
                label="Payload Estimate"
                value={idbStats.totalStorage}
              />
            </div>
          </div>
        </div>

        {/* Sync Link Animation */}
        <div className="flex flex-col justify-center items-center relative hidden md:flex">
          <div className="h-0.5 w-full bg-slate-700 absolute top-[40%] -z-10"></div>
          {isOnline ? (
            <motion.div
              animate={{ x: [-20, 20, -20] }}
              transition={{ ease: "linear", repeat: Infinity, duration: 3 }}
            >
              <div className="glass-card border border-cyan-500/50 p-2 rounded-full shadow-[0_0_15px_rgba(6,182,212,0.3)]">
                <ChevronRight className="w-5 h-5 text-cyan-400" />
              </div>
            </motion.div>
          ) : (
            <div className="glass-card border border-red-500/50 p-2 rounded-full shadow-[0_0_15px_rgba(239,68,68,0.3)]">
              <XCircle className="w-5 h-5 text-red-500" />
            </div>
          )}
          <div className="mt-6 text-[10px] font-bold tracking-[0.2em] text-slate-400 bg-slate-900 px-3 py-1 rounded-full border border-slate-800">
            {isOnline ? "TRANSPORT ACTIVE" : "TRANSPORT OFFLINE"}
          </div>
        </div>

        {/* Local Network fallback for mobile */}
        <div className="md:hidden bg-slate-800/50 rounded-lg p-5 border border-slate-700 relative">
          <div
            className={`absolute top-0 left-0 w-full h-1 ${isOnline ? "bg-cyan-400" : "bg-red-500"} rounded-t-lg opacity-80`}
          ></div>
          <div className="flex items-center gap-3">
            {isOnline ? (
              <Wifi className="w-5 h-5 text-cyan-400" />
            ) : (
              <WifiOff className="w-5 h-5 text-red-500" />
            )}
            <h3 className="font-semibold text-slate-200">Network Transport</h3>
          </div>
        </div>

        {/* Supabase Node */}
        <div className="bg-slate-800/50 rounded-lg p-5 border border-slate-700 relative overflow-hidden">
          <div
            className={`absolute top-0 left-0 w-full h-1 ${dbConnection === "connected" ? "bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]" : dbConnection === "checking" ? "bg-amber-500" : "bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.5)]"} rounded-t-lg opacity-80`}
          ></div>
          <div className="flex items-center gap-3 mb-4">
            <Cloud
              className={`w-5 h-5 ${dbConnection === "connected" ? "text-emerald-400 drop-shadow-[0_0_5px_rgba(52,211,153,0.5)]" : "text-slate-500"}`}
            />
            <h3 className="font-semibold text-slate-200">Supabase Cloud</h3>
          </div>

          <div className="flex items-center justify-center p-6 border border-slate-700/50 rounded bg-slate-900/50 mt-4 h-32 relative">
            <AnimatePresence mode="wait">
              {dbConnection === "checking" && (
                <motion.div
                  key="checking"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex flex-col items-center absolute"
                >
                  <RefreshCw className="w-8 h-8 text-amber-400 animate-spin mb-3" />
                  <span className="text-amber-400/80 text-[10px] tracking-widest font-bold">
                    HANDSHAKING...
                  </span>
                </motion.div>
              )}
              {dbConnection === "connected" && (
                <motion.div
                  key="connected"
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex flex-col items-center absolute"
                >
                  <CheckCircle className="w-8 h-8 text-emerald-500 mb-3 drop-shadow-[0_0_8px_rgba(16,185,129,0.6)]" />
                  <span className="text-emerald-500/80 text-[10px] tracking-widest font-bold">
                    SYNC ESTABLISHED
                  </span>
                </motion.div>
              )}
              {dbConnection === "disconnected" && (
                <motion.div
                  key="disconnected"
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex flex-col items-center absolute"
                >
                  <AlertTriangle className="w-8 h-8 text-red-500 mb-3 drop-shadow-[0_0_8px_rgba(239,68,68,0.6)]" />
                  <span className="text-red-500/80 text-[10px] tracking-widest font-bold">
                    NODE UNREACHABLE
                  </span>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="mt-4 pt-4 border-t border-slate-700 flex justify-between items-center text-[10px] text-slate-500 font-bold">
            <span>PROTOCOL</span>
            <span
              className={
                dbConnection === "connected"
                  ? "text-emerald-400"
                  : "text-red-400"
              }
            >
              {dbConnection === "connected" ? "SECURE_WSS" : "DISCONNECTED"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
