import React from "react";
import { Wifi, WifiOff, RefreshCw, Lock } from "lucide-react";

interface PredictionNetworkDiagnosticProps {
  networkState: {
    isOffline: boolean;
    checkingConnection: boolean;
    authStatus: string;
    userEmail: string | null;
    networkDiagnosticMessage: string;
  };
  checkNetworkAndAuth: () => void;
}

export const PredictionNetworkDiagnostic: React.FC<
  PredictionNetworkDiagnosticProps
> = ({ networkState, checkNetworkAndAuth }) => {
  return (
    <div
      className={`w-full max-w-lg mx-auto p-4 sm:p-5 rounded-2xl border mb-6 sm:mb-8 transition-all text-left ${
        networkState.isOffline
          ? "bg-rose-500/5 border-rose-500/20 text-rose-400"
          : "bg-emerald-500/5 border-emerald-500/20 text-emerald-400"
      }`}
    >
      <div className="flex items-start gap-3 sm:gap-4 flex-col sm:flex-row">
        <div className="p-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0 w-full sm:w-auto">
          {networkState.isOffline ? (
            <WifiOff
              size={20}
              className="text-rose-500 dark:text-rose-400 animate-pulse"
            />
          ) : (
            <Wifi
              size={20}
              className="text-emerald-500 dark:text-emerald-400"
            />
          )}
        </div>
        <div className="flex-1 w-full">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 sm:gap-4">
            <span className="text-[10px] font-black uppercase tracking-wider text-left sm:text-center">
              {networkState.isOffline
                ? "Réseau : Mode Hors-Ligne "
                : "Liaison de Données Établie"}
            </span>
            <button
              type="button"
              onClick={checkNetworkAndAuth}
              disabled={networkState.checkingConnection}
              className="text-[9px] font-black uppercase tracking-widest bg-slate-100 dark:bg-slate-850 text-slate-750 dark:text-slate-350 hover:bg-slate-200 dark:hover:bg-slate-800 px-3 py-2 sm:py-1 rounded-full border border-slate-250 dark:border-slate-750 flex items-center justify-center gap-1.5 transition-all shrink-0 w-full sm:w-auto"
            >
              <RefreshCw
                size={10}
                className={
                  networkState.checkingConnection ? "animate-spin" : ""
                }
              />
              {networkState.checkingConnection
                ? "Analyse..."
                : "Restaurer le module"}
            </button>
          </div>
          <p className="text-xs text-slate-550 dark:text-slate-400 mt-2 leading-relaxed font-medium">
            {networkState.networkDiagnosticMessage}
          </p>
          {networkState.authStatus === "authenticated" &&
            networkState.userEmail && (
              <div className="flex items-center justify-center sm:justify-start gap-1.5 mt-3 text-[9px] font-black text-indigo-550 dark:text-indigo-400 tracking-wider bg-indigo-500/5 py-1.5 px-3 rounded-full w-full sm:w-fit border border-indigo-500/15">
                <Lock size={10} /> SESSION PROTÉGÉE • {networkState.userEmail}
              </div>
            )}
        </div>
      </div>
    </div>
  );
};
