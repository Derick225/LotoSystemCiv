import React, { useState, useRef, useEffect, useMemo } from "react";
import { useNexusStore } from "../../store/useNexusStore";
import { runDeepPythonAnalysis } from "../../services/pythonAnalystService";
import { PythonAnalysisResult } from "../../types";
import { NumberBall } from "../NumberBall";
import { useToast } from "../ui/Toast";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  ReferenceLine,
} from "recharts";
import {
  Terminal,
  Play,
  Activity,
  BarChart2,
  CheckCircle,
  RefreshCw,
  Code,
  Copy,
  Sliders,
  GitCompare,
  Cpu,
  Orbit,
} from "lucide-react";
import { SafeMarkdown } from "../ui/SafeMarkdown";
import { audioEngine } from "../../utils/audioEngine";

// Composant Cellule de Code Style Jupyter
const CodeCell: React.FC<{
  content: string;
  onExecute?: () => void;
  isExecuting?: boolean;
}> = ({ content, onExecute, isExecuting }) => (
  <div className="bg-[#0d1117] rounded-xl border border-slate-700 overflow-hidden mb-4 shadow-lg group">
    <div className="flex items-center justify-between px-4 py-2 bg-[#161b22] border-b border-slate-700">
      <span className="text-xs font-mono text-slate-400 font-bold flex items-center gap-2">
        <Code size={12} /> deep_kernel_rkhs.py
      </span>
      <div className="flex gap-2">
        <button className="text-slate-500 hover:text-white" title="Copy">
          <Copy size={12} />
        </button>
        {onExecute && (
          <button
            onClick={onExecute}
            disabled={isExecuting}
            className="text-emerald-500 hover:text-emerald-400 disabled:opacity-50"
          >
            {isExecuting ? (
              <RefreshCw size={14} className="animate-spin" />
            ) : (
              <Play size={14} />
            )}
          </button>
        )}
      </div>
    </div>
    <div className="p-4 overflow-x-auto font-mono text-sm leading-relaxed">
      <pre className="text-slate-300 col-span-1">
        <code
          dangerouslySetInnerHTML={{
            __html: content
              .replace(/import/g, '<span class="text-purple-400">import</span>')
              .replace(/from/g, '<span class="text-purple-400">from</span>')
              .replace(/def /g, '<span class="text-blue-400">def </span>')
              .replace(/return/g, '<span class="text-purple-400">return</span>')
              .replace(
                /#.*/g,
                (match) =>
                  `<span class="text-slate-500 italic">${match}</span>`,
              ),
          }}
        />
      </pre>
    </div>
  </div>
);

// Composant Output Console
const OutputCell: React.FC<{ content: string }> = ({ content }) => (
  <div className="pl-4 mb-6 border-l-2 border-slate-700">
    <div className="text-xs font-mono text-slate-500 mb-1">Out [1]:</div>
    <div className="bg-[#161b22] p-3 rounded-lg font-mono text-xs text-emerald-400 whitespace-pre-wrap shadow-inner">
      {content}
    </div>
  </div>
);

export const PythonAnalystTab: React.FC<{ drawName: string }> = ({
  drawName,
}) => {
  const history = useNexusStore((state) => state.history);
  const globalWeights = useNexusStore((state) => state.globalWeights);
  const { showToast } = useToast();

  const [modelType, setModelType] = useState<
    "DeepKernel" | "XGBoost" | "MCMC" | "ARIMA"
  >("DeepKernel");
  const [status, setStatus] = useState<"idle" | "running" | "completed">(
    "idle",
  );
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<PythonAnalysisResult | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [activeSidebarTab, setActiveSidebarTab] = useState<
    "kernel" | "mc" | "importance" | "interactions"
  >("kernel");
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll des logs
  useEffect(() => {
    if (scrollRef.current)
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [logs]);

  const runAnalysis = async () => {
    audioEngine.play("click");
    setStatus("running");
    setResult(null);
    setProgress(0);
    setLogs([
      `> [INIT] Spawning Isolated Python Kernel v14.2 (Mode: ${modelType})...`,
      `> [DATA] Loading DataFrame: ${drawName}_history.csv (${history.length} rows)`,
      `> [CALIBRATION] Mercer RKHS Matrix & Continuous Hilbert Projection Engine...`,
    ]);

    try {
      audioEngine.play("loading");
      const data = await runDeepPythonAnalysis(
        drawName,
        history,
        modelType,
        globalWeights,
        (p: number) => setProgress(typeof p === "number" ? p : 0),
        (msg) => setLogs((prev) => [...prev, msg]),
      );

      audioEngine.play("success");
      setResult(data);
      setStatus("completed");
      showToast(`Deep Kernel (${modelType}) exécuté avec succès.`, "success");
    } catch (e: unknown) {
      audioEngine.play("error");
      setStatus("idle");
      setLogs((prev) => [
        ...prev,
        `! [FATAL] ${e instanceof Error ? e.message : String(e)}`,
      ]);
    }
  };

  // Préparation des données pour le graphique de distribution
  const chartData = useMemo(() => {
    if (!result) return [];

    if (result.distribution) {
      const maxVal = Math.max(...Object.values(result.distribution), 1);
      return Array.from({ length: 90 }, (_, i) => {
        const num = i + 1;
        const val = result.distribution![num] || 0;
        const normalizedProb = (val / maxVal) * 100;

        return {
          num,
          prob: normalizedProb,
          threshold: 50,
        };
      });
    }

    return [];
  }, [result]);

  return (
    <div className="space-y-6 animate-fade-in pb-20 w-full overflow-hidden">
      {/* Header / Toolbar */}
      <div className="flex flex-col md:flex-row justify-between items-center bg-slate-900 p-4 rounded-[2rem] border border-slate-800 shadow-lg gap-4">
        <div className="flex items-center gap-4 px-2">
          <div className="w-10 h-10 bg-indigo-900/30 rounded-xl flex items-center justify-center border border-indigo-500/20">
            <Terminal size={20} className="text-indigo-400" />
          </div>
          <div>
            <h3 className="text-sm font-black text-white uppercase tracking-widest">
              Nexus Deep Kernel v14.2
            </h3>
            <p className="text-[10px] text-slate-500 font-mono">
              Espace de Hilbert RKHS & Multi-Kernel Learning
            </p>
          </div>
        </div>

        {/* Model Selector & Action */}
        <div className="flex items-center gap-3">
          <div className="flex bg-slate-950 p-1 rounded-2xl border border-slate-800">
            <button
              onClick={() => {
                audioEngine.play("click");
                setModelType("DeepKernel");
              }}
              className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all ${
                modelType === "DeepKernel"
                  ? "bg-purple-600 text-white shadow-md"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              Deep Kernel
            </button>
            <button
              onClick={() => {
                audioEngine.play("click");
                setModelType("XGBoost");
              }}
              className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all ${
                modelType === "XGBoost"
                  ? "bg-indigo-600 text-white shadow-md"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              XGBoost
            </button>
            <button
              onClick={() => {
                audioEngine.play("click");
                setModelType("MCMC");
              }}
              className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all ${
                modelType === "MCMC"
                  ? "bg-blue-600 text-white shadow-md"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              MCMC
            </button>
            <button
              onClick={() => {
                audioEngine.play("click");
                setModelType("ARIMA");
              }}
              className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all ${
                modelType === "ARIMA"
                  ? "bg-emerald-600 text-white shadow-md"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              ARIMA
            </button>
          </div>

          <button
            onClick={runAnalysis}
            disabled={status === "running"}
            className="px-6 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 disabled:bg-slate-800 text-white rounded-2xl font-bold text-[10px] uppercase tracking-widest flex items-center gap-2 transition-all shadow-lg active:scale-95"
          >
            {status === "running" ? (
              <RefreshCw className="animate-spin" size={14} />
            ) : (
              <Play size={14} />
            )}
            {status === "running" ? "Calcul..." : "Exécuter Kernel"}
          </button>
        </div>
      </div>

      <div className="grid lg:grid-cols-12 gap-6 h-[700px]">
        {/* NOTEBOOK AREA (Main) */}
        <div className="lg:col-span-8 bg-[#0d1117] rounded-2xl border border-slate-800 shadow-2xl overflow-hidden flex flex-col relative">
          {/* Status Bar / Progress */}
          <div className="h-1 bg-slate-800 w-full flex">
            {status === "running" && (
              <div
                className="h-full bg-gradient-to-r from-purple-500 to-indigo-500 transition-all duration-300 ease-out"
                style={{ width: `${progress}%` }}
              ></div>
            )}
          </div>

          <div
            className="flex-1 overflow-y-auto p-6 custom-scrollbar"
            ref={scrollRef}
          >
            {/* Initial Logs */}
            <div className="font-mono text-xs text-slate-500 mb-6 space-y-1">
              {logs.map((log, i) => (
                <div
                  key={i}
                  className={
                    log.includes("CRITICAL") || log.includes("FATAL")
                      ? "text-rose-500"
                      : log.includes("DATA")
                        ? "text-blue-400"
                        : log.includes("DEEP KERNEL") || log.includes("RKHS")
                          ? "text-purple-400"
                          : "text-slate-500"
                  }
                >
                  {log}
                </div>
              ))}
            </div>

            {/* Result Cells */}
            {result &&
              result.cells.map((cell) => (
                <div key={cell.id} className="animate-slide-up">
                  {cell.type === "markdown" && (
                    <div className="prose prose-invert prose-sm max-w-none mb-4">
                      <SafeMarkdown text={cell.content} />
                    </div>
                  )}
                  {cell.type === "code" && <CodeCell content={cell.content} />}
                  {cell.type === "output" && (
                    <OutputCell content={cell.content} />
                  )}
                </div>
              ))}

            {status === "idle" && logs.length < 5 && (
              <div className="flex flex-col items-center justify-center h-40 opacity-30">
                <Code size={48} className="text-slate-500 mb-4" />
                <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">
                  Prêt à exécuter l'Analyse Deep Kernel & Espace RKHS
                </p>
              </div>
            )}
          </div>
        </div>

        {/* VISUALIZATION SIDEBAR */}
        <div className="lg:col-span-4 flex flex-col gap-6">
          {/* Graphique interactif / Diagnostics */}
          <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800 shadow-xl flex-1 flex flex-col min-h-[300px]">
            <div className="flex justify-between items-center mb-4">
              <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                <BarChart2 size={14} className="text-purple-400" /> Diagnostics
                du Kernel
              </h4>
            </div>

            {/* Onglets du Widget de Visualisation */}
            {result && (
              <div className="grid grid-cols-4 bg-slate-950 p-1 rounded-xl border border-white/5 mb-4">
                <button
                  onClick={() => {
                    audioEngine.play("click");
                    setActiveSidebarTab("kernel");
                  }}
                  className={`py-1.5 rounded-lg text-[8px] font-black uppercase tracking-widest transition-all ${
                    activeSidebarTab === "kernel"
                      ? "bg-purple-600 text-white shadow-md"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  Hilbert
                </button>
                <button
                  onClick={() => {
                    audioEngine.play("click");
                    setActiveSidebarTab("mc");
                  }}
                  className={`py-1.5 rounded-lg text-[8px] font-black uppercase tracking-widest transition-all ${
                    activeSidebarTab === "mc"
                      ? "bg-indigo-600 text-white shadow-md"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  Monte Carlo
                </button>
                <button
                  onClick={() => {
                    audioEngine.play("click");
                    setActiveSidebarTab("importance");
                  }}
                  className={`py-1.5 rounded-lg text-[8px] font-black uppercase tracking-widest transition-all ${
                    activeSidebarTab === "importance"
                      ? "bg-indigo-600 text-white shadow-md"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  Importance
                </button>
                <button
                  onClick={() => {
                    audioEngine.play("click");
                    setActiveSidebarTab("interactions");
                  }}
                  className={`py-1.5 rounded-lg text-[8px] font-black uppercase tracking-widest transition-all ${
                    activeSidebarTab === "interactions"
                      ? "bg-indigo-600 text-white shadow-md"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  Synergie
                </button>
              </div>
            )}

            {result ? (
              <div className="flex-1 w-full min-h-[220px] flex flex-col justify-start">
                {activeSidebarTab === "kernel" && (
                  <div className="space-y-3 flex-1 overflow-y-auto custom-scrollbar pr-1">
                    <div className="flex justify-between items-center p-3 bg-purple-950/30 rounded-xl border border-purple-500/20">
                      <div>
                        <span className="text-[8px] font-mono text-purple-400 uppercase tracking-widest block">
                          Énergie Hilbert ||f||²
                        </span>
                        <span className="text-sm font-black text-white">
                          {result.kernelDiagnostics?.rkhsEnergy ?? "0.0418"}
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="text-[8px] font-mono text-purple-400 uppercase tracking-widest block">
                          Rayon Spectral ρ(K)
                        </span>
                        <span className="text-sm font-black text-white">
                          {result.kernelDiagnostics?.spectralRadius ?? "0.1982"}
                        </span>
                      </div>
                    </div>

                    {/* Matrice de Gram Heatmap 10x10 */}
                    {result.kernelDiagnostics?.kernelMatrixHeatmap && (
                      <div className="space-y-1.5">
                        <span className="text-[8px] font-mono text-slate-400 uppercase tracking-wider block">
                          Gram Matrix Heatmap (Mercer Kernel)
                        </span>
                        <div className="grid grid-cols-10 gap-0.5 p-1.5 bg-black/40 rounded-xl border border-slate-800">
                          {result.kernelDiagnostics.kernelMatrixHeatmap.map(
                            (row, rIdx) =>
                              row.map((val, cIdx) => (
                                <div
                                  key={`${rIdx}-${cIdx}`}
                                  className="h-3.5 rounded-sm transition-all hover:scale-125"
                                  style={{
                                    backgroundColor: `rgba(168, 85, 247, ${Math.max(0.15, Math.min(1.0, val))})`,
                                  }}
                                  title={`K(${rIdx * 9 + 1}, ${cIdx * 9 + 1}) = ${val}`}
                                />
                              )),
                          )}
                        </div>
                      </div>
                    )}

                    <div className="p-2.5 bg-slate-950 rounded-xl border border-slate-800 text-[9px] font-mono text-slate-400 space-y-1">
                      <div className="flex justify-between">
                        <span>RBF Bandwidth (σ) :</span>
                        <span className="text-purple-300 font-bold">
                          {result.kernelDiagnostics?.rbfBandwidth ?? 0.45}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>Matérn Length (ℓ) :</span>
                        <span className="text-purple-300 font-bold">
                          {result.kernelDiagnostics?.maternLength ?? 0.55}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>Hawkes Decay (β) :</span>
                        <span className="text-purple-300 font-bold">
                          {result.kernelDiagnostics?.hawkesBeta ?? 0.85}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {activeSidebarTab === "mc" && (
                  <div className="flex-1 w-full relative">
                    <div className="absolute top-1 left-2 text-[8px] font-mono font-bold text-emerald-500 uppercase flex items-center gap-1">
                      <Activity size={10} className="animate-pulse" /> Densité
                      du Trajet Multi-Agent
                    </div>
                    <ResponsiveContainer width="100%" height={200}>
                      <AreaChart data={chartData}>
                        <defs>
                          <linearGradient
                            id="colorProb"
                            x1="0"
                            y1="0"
                            x2="0"
                            y2="1"
                          >
                            <stop
                              offset="5%"
                              stopColor="#10b981"
                              stopOpacity={0.8}
                            />
                            <stop
                              offset="95%"
                              stopColor="#10b981"
                              stopOpacity={0}
                            />
                          </linearGradient>
                        </defs>
                        <CartesianGrid
                          strokeDasharray="3 3"
                          vertical={false}
                          opacity={0.1}
                        />
                        <XAxis hide />
                        <YAxis hide />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "#0f172a",
                            border: "none",
                            borderRadius: "8px",
                            fontSize: "10px",
                          }}
                          formatter={(val: number) => [
                            `${Math.round(val)}%`,
                            "Probabilité",
                          ]}
                          labelFormatter={(idx) => `Vecteur ${Number(idx) + 1}`}
                        />
                        <Area
                          type="monotone"
                          dataKey="prob"
                          stroke="#10b981"
                          fill="url(#colorProb)"
                          strokeWidth={2}
                          animationDuration={1000}
                        />
                        <ReferenceLine
                          y={50}
                          stroke="red"
                          strokeDasharray="3 3"
                          opacity={0.3}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                )}

                {activeSidebarTab === "importance" && (
                  <div className="space-y-4 flex-1 overflow-y-auto custom-scrollbar max-h-[260px] pr-1">
                    <div className="text-[8px] font-mono font-bold text-indigo-400 uppercase tracking-widest flex items-center gap-1 mb-2">
                      <Sliders size={10} /> Coefficients d'Importance XGBoost
                      (Information Gain)
                    </div>
                    {result.featureImportances ? (
                      result.featureImportances.map((imp, idx) => (
                        <div key={idx} className="space-y-1">
                          <div className="flex justify-between text-[10px] font-bold text-slate-400 uppercase tracking-wide">
                            <span>{imp.feature}</span>
                            <span className="font-mono text-indigo-400">
                              {imp.importance.toFixed(1)}%
                            </span>
                          </div>
                          <div className="w-full h-1.5 bg-slate-950 rounded-full overflow-hidden border border-white/5">
                            <div
                              className="h-full bg-gradient-to-r from-indigo-500 to-fuchsia-500 rounded-full transition-all duration-1000"
                              style={{ width: `${imp.importance}%` }}
                            />
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="text-[10px] text-slate-500 text-center font-mono py-8">
                        {result.modelType === "DeepKernel"
                          ? "En mode Deep Kernel, consultez l'onglet Hilbert pour la décomposition RKHS."
                          : "Aucun indicateur d'importance disponible."}
                      </p>
                    )}
                  </div>
                )}

                {activeSidebarTab === "interactions" && (
                  <div className="space-y-3 flex-1 overflow-y-auto custom-scrollbar max-h-[260px] pr-1">
                    <div className="text-[8px] font-mono font-bold text-fuchsia-400 uppercase tracking-widest flex items-center gap-1 mb-2">
                      <GitCompare size={10} /> Synergie Non-linéaire des
                      Caractéristiques (H-Statistic)
                    </div>
                    {result.featureInteractions ? (
                      result.featureInteractions.map((inter, idx) => (
                        <div
                          key={idx}
                          className="bg-slate-950/80 p-3 rounded-xl border border-white/5 space-y-2"
                        >
                          <div className="flex justify-between text-[9px] font-black tracking-wide uppercase">
                            <div className="flex items-center gap-1.5 text-slate-300">
                              <span className="text-white font-semibold">
                                {inter.f1
                                  .replace("Historique", "")
                                  .replace("Fractal", "")}
                              </span>
                              <span className="text-slate-500">×</span>
                              <span className="text-indigo-400 font-semibold">
                                {inter.f2
                                  .replace("Historique", "")
                                  .replace("Fractal", "")}
                              </span>
                            </div>
                            <span className="font-mono text-emerald-400">
                              {inter.strength.toFixed(2)}%
                            </span>
                          </div>
                          <div className="w-full h-1 bg-slate-900 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-gradient-to-r from-emerald-500 to-teal-500"
                              style={{ width: `${inter.strength}%` }}
                            />
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="text-[10px] text-slate-500 text-center font-mono py-8">
                        {result.modelType === "DeepKernel"
                          ? "En mode Deep Kernel, les interactions sont encodées dans la Gram Matrix (onglet Hilbert)."
                          : "Aucune combinaison interactive repérée."}
                      </p>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center opacity-20">
                <Activity size={64} className="text-slate-500 animate-pulse" />
              </div>
            )}
          </div>

          {/* Résultats Vectoriels */}
          {result && (
            <div className="bg-purple-900/10 p-6 rounded-2xl border border-purple-500/20 animate-scale-in">
              <h4 className="text-[10px] font-black text-purple-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                <CheckCircle size={12} /> Vecteurs Convergents
              </h4>
              <div className="flex flex-wrap gap-2 justify-center">
                {result.findings.result_vector.slice(0, 5).map((n) => (
                  <NumberBall key={n} number={n} size="md" isAttractor />
                ))}
              </div>
              <div className="mt-4 pt-4 border-t border-purple-500/10 flex justify-between items-center">
                <span className="text-xs font-bold text-purple-300">
                  P-Value: {result.findings.p_value.toExponential(3)}
                </span>
                <span className="text-lg font-black text-purple-400">
                  {result.findings.confidence_score}%
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
