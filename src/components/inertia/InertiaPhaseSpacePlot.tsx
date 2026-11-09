import React, { memo } from "react";
import { Compass, Target } from "lucide-react";
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { InertiaResolvedVector } from "../../services/prediction/systemInertiaEngine";
import { ScatterPoint } from "../../hooks/useInertiaCybernetics";

interface TooltipPayloadItem {
  payload: ScatterPoint;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: TooltipPayloadItem[];
}

const PhasePortraitTooltip: React.FC<CustomTooltipProps> = ({ active, payload }) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="bg-slate-950/95 text-white p-4 rounded-2xl border border-cyan-500/20 shadow-2xl backdrop-blur-md text-[10px] space-y-1.5 font-mono max-w-[240px]">
        <div className="flex items-center justify-between">
          <p className="font-sans font-black text-xs text-cyan-400 flex items-center gap-1.5">
            <Target size={13} className="text-cyan-400" />
            Numéro {String(data.num).padStart(2, "0")}
          </p>
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-cyan-950/80 border border-cyan-500/30 text-cyan-300 font-bold">
            Z = {data.zScore > 0 ? `+${data.zScore}` : data.zScore}
          </span>
        </div>
        <div className="h-px bg-white/10 my-1" />
        <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[9px]">
          <span className="text-slate-400">Score d'Inertie :</span>
          <span className="text-right font-black text-cyan-300">
            {data.score}%
          </span>
          <span className="text-slate-400">Potentiel U(g) :</span>
          <span className="text-right text-slate-200">{data.x}</span>
          <span className="text-slate-400">Attraction A(f) :</span>
          <span className="text-right text-slate-200">{data.y}</span>
          <span className="text-slate-400">Indice Jaccard J :</span>
          <span className="text-right text-emerald-400 font-mono font-bold">
            {(data.jaccard * 100).toFixed(1)}%
          </span>
          <span className="text-slate-400">Cohérence C(H) :</span>
          <span className="text-right text-indigo-300">{data.coherence}</span>
          <span className="text-slate-400">Amortiss. Δ(ζ) :</span>
          <span className="text-right text-pink-400">{data.damping}</span>
        </div>
      </div>
    );
  }
  return null;
};

export interface InertiaPhaseSpacePlotProps {
  scatterData: ScatterPoint[];
  optimizedVector: InertiaResolvedVector | null;
}

export const InertiaPhaseSpacePlot: React.FC<InertiaPhaseSpacePlotProps> = memo(
  ({ scatterData, optimizedVector }) => {
    return (
      <div className="bg-slate-900/40 p-6 rounded-[2rem] border border-white/5 shadow-xl flex flex-col justify-between">
        <div className="space-y-4">
          <div>
            <h3 className="text-xs font-black uppercase tracking-widest text-slate-300 flex items-center gap-2 mb-1 font-sans">
              <Compass size={14} className="text-cyan-400" />
              Portrait d'Espace de Phase [U(g) vs A(f)]
            </h3>
            <p className="text-[10px] text-slate-500 leading-normal">
              Projection 2D des attracteurs d'inertie : Potentiel de renouvellement $U_n$ (axe X) vs Attraction de phase $A_n$ (axe Y).
            </p>
          </div>

          {/* Interactive Recharts Scatter plot */}
          <div className="h-[220px] w-full mt-2 relative">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 10, right: 10, bottom: 20, left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" />
                <XAxis
                  type="number"
                  dataKey="x"
                  name="Potentiel U(g)"
                  domain={[0, 1]}
                  stroke="#475569"
                  style={{ fontSize: 8, fontFamily: "monospace" }}
                  tickFormatter={(v: number) => `U:${v.toFixed(1)}`}
                />
                <YAxis
                  type="number"
                  dataKey="y"
                  name="Attraction A(f)"
                  domain={[0, 1]}
                  stroke="#475569"
                  style={{ fontSize: 8, fontFamily: "monospace" }}
                  tickFormatter={(v: number) => `A:${v.toFixed(1)}`}
                />
                <RechartsTooltip
                  cursor={{
                    strokeDasharray: "3 3",
                    stroke: "rgba(6,182,212,0.2)",
                  }}
                  content={<PhasePortraitTooltip />}
                />
                <Scatter name="Oscillateurs d'Inertie" data={scatterData}>
                  {scatterData.map((entry) => {
                    const isPrimary = optimizedVector?.primary.includes(entry.num);
                    const isSecondary = optimizedVector?.secondary.includes(entry.num);

                    let color = "rgba(100, 116, 139, 0.45)";
                    let radius = 4;

                    if (isPrimary) {
                      color = "#06b6d4"; // Cyan Primaire
                      radius = 9;
                    } else if (isSecondary) {
                      color = "#818cf8"; // Indigo Secondaire
                      radius = 6.5;
                    } else if (entry.score > 70) {
                      color = "rgba(236, 72, 153, 0.5)";
                      radius = 5.5;
                    }

                    return (
                      <Cell
                        key={`ball-cell-${entry.num}`}
                        fill={color}
                        r={radius}
                        className="transition-all duration-300 cursor-pointer hover:stroke-white hover:stroke-1"
                      />
                    );
                  })}
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>
            <div className="absolute top-2 right-2 flex gap-3 text-[8px] font-mono select-none bg-slate-950/80 px-2 py-1 rounded-lg border border-white/5">
              <span className="flex items-center gap-1 text-cyan-300">
                <span className="w-2 h-2 rounded-full bg-cyan-400" /> Primaire
              </span>
              <span className="flex items-center gap-1 text-indigo-300">
                <span className="w-2 h-2 rounded-full bg-indigo-400" /> Couverture
              </span>
            </div>
          </div>
        </div>

        <p className="text-[9px] text-slate-500 text-center leading-normal mt-2 italic font-mono">
          Survolez un oscillateur pour extraire sa signature de rappel, son Z-score et son action hamiltonienne.
        </p>
      </div>
    );
  }
);

InertiaPhaseSpacePlot.displayName = "InertiaPhaseSpacePlot";
