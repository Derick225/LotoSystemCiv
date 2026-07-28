import React, { useState } from "react";
import { ExpertTuningPanel } from "./ExpertTuningPanel";
import { DrawManagement } from "./DrawManagement";
import { TrainingTab } from "../tabs/TrainingTab";
import { DatabaseControl } from "./DatabaseControl";
import { DataIntegrityMonitor } from "./DataIntegrityMonitor";
import { UserManagement } from "./UserManagement";
import { SyncMonitoringDashboard } from "../SyncMonitoringDashboard";
import {
  Server,
  BrainCircuit,
  Activity,
  Sliders,
  Database,
  ShieldCheck,
  Users,
  RadioTower,
} from "lucide-react";
import { ALL_DRAWS } from "../../constants";
import { RefreshCw } from "lucide-react";
import { audioEngine } from "../../utils/audioEngine";

import { useNexusStore } from "../../store/useNexusStore";

export const AdminPanel: React.FC = () => {
  const activeSubTab = useNexusStore((state) => state.activeSubTab);
  const navigateToModule = useNexusStore((state) => state.navigateToModule);
  const [selectedDraw, setSelectedDraw] = useState<string>(ALL_DRAWS[0].name);

  // Ensure active tab starts at tuning if empty
  const currentTab = (activeSubTab || "tuning") as
    | "tuning"
    | "training"
    | "management"
    | "users"
    | "integrity"
    | "database"
    | "telemetry";

  const setActiveTab = (tab: string) => navigateToModule("admin", tab);

  return (
    <div className="space-y-8 animate-fade-in pb-20">
      {/* Header corrigé : relative sur mobile, sticky sur desktop */}
      <header className="relative md:sticky top-0 md:top-[110px] lg:top-[85px] z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl p-6 rounded-[2rem] md:rounded-b-[3rem] md:rounded-t-none shadow-xl border border-indigo-100 dark:border-indigo-900/30 flex flex-col md:flex-row justify-between items-center gap-6 mb-8 md:mb-0">
        <div className="flex items-center gap-4 w-full md:w-auto">
          <div className="p-3 bg-indigo-600 text-white rounded-2xl shadow-lg shrink-0">
            <Server size={22} />
          </div>
          <div>
            <h2 className="text-xl font-black text-slate-800 dark:text-white uppercase tracking-tighter leading-none">
              Master Node Control
            </h2>
            <div className="flex items-center gap-2 mt-1">
              <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>
              <span className="text-xs font-black text-slate-500 uppercase tracking-widest">
                Système Opérationnel
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 p-1.5 bg-slate-100 dark:bg-slate-800/80 rounded-[2rem] border border-slate-200 dark:border-slate-700 overflow-x-auto scrollbar-hide w-full md:max-w-full">
          {[
            { id: "tuning", label: "Tuning", icon: <Sliders size={14} /> },
            {
              id: "training",
              label: "Training",
              icon: <BrainCircuit size={14} />,
            },
            {
              id: "management",
              label: "Registre",
              icon: <Database size={14} />,
            },
            { id: "users", label: "Utilisateurs", icon: <Users size={14} /> },
            {
              id: "integrity",
              label: "Intégrité",
              icon: <ShieldCheck size={14} />,
            },
            { id: "database", label: "Infra", icon: <Activity size={14} /> },
            {
              id: "telemetry",
              label: "Telemetry",
              icon: <RadioTower size={14} />,
            },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => {
                audioEngine.play("click");
                setActiveTab(tab.id as never);
              }}
              className={`px-5 py-3 rounded-2xl text-[10px] font-black uppercase transition-all whitespace-nowrap flex items-center gap-3 ${currentTab === tab.id ? "bg-white dark:bg-indigo-600 shadow-xl text-indigo-600 dark:text-white scale-105 z-10" : "text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"}`}
            >
              {tab.icon} {tab.label}
            </button>
          ))}
        </div>
      </header>

      <main className="px-4 animate-slide-up">
        {currentTab !== "database" &&
          currentTab !== "users" &&
          currentTab !== "telemetry" && (
            <div className="mb-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div className="relative group w-full md:min-w-[280px] md:w-auto">
                <select
                  value={selectedDraw}
                  onChange={(e) => {
                    audioEngine.play("click");
                    setSelectedDraw(e.target.value);
                  }}
                  className="w-full appearance-none p-5 bg-white dark:bg-slate-800 rounded-[2rem] border border-indigo-100 dark:border-indigo-900 shadow-sm font-black text-sm outline-none focus:ring-4 ring-indigo-500/10 transition-all uppercase tracking-widest"
                >
                  {ALL_DRAWS.map((d) => (
                    <option key={d.name} value={d.name}>
                      {d.name} ({d.day})
                    </option>
                  ))}
                </select>
                <div className="absolute right-6 top-1/2 -translate-y-1/2 pointer-events-none text-indigo-500">
                  <RefreshCw
                    size={16}
                    className="group-hover:rotate-180 transition-transform duration-300"
                  />
                </div>
              </div>
            </div>
          )}

        <div className="animate-slide-up">
          {currentTab === "tuning" && (
            <ExpertTuningPanel selectedDrawName={selectedDraw} />
          )}
          {currentTab === "training" && <TrainingTab drawName={selectedDraw} />}
          {currentTab === "management" && (
            <DrawManagement drawName={selectedDraw} />
          )}
          {currentTab === "users" && <UserManagement />}
          {currentTab === "integrity" && (
            <DataIntegrityMonitor drawName={selectedDraw} />
          )}
          {currentTab === "database" && <DatabaseControl />}
          {currentTab === "telemetry" && <SyncMonitoringDashboard />}
        </div>
      </main>
    </div>
  );
};
