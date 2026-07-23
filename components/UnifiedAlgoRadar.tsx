import React from "react";
import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  Tooltip,
  Legend,
} from "recharts";

export interface RadarItem {
  subject: string;
  value: number;
  comparisonValue?: number;
  fullMark?: number;
}

export interface UnifiedAlgoRadarProps {
  data: RadarItem[];
  title?: string;
  primaryName?: string;
  comparisonName?: string;
  primaryColor?: string;
  comparisonColor?: string;
  height?: number;
  className?: string;
  showLegend?: boolean;
}

export const UnifiedAlgoRadar: React.FC<UnifiedAlgoRadarProps> = ({
  data,
  title,
  primaryName = "Poids / Intensité",
  comparisonName = "Optimal / Cible",
  primaryColor = "#6366f1", // Indigo
  comparisonColor = "#f43f5e", // Rose
  height = 260,
  className = "",
  showLegend = false,
}) => {
  const hasComparison = data.some((d) => d.comparisonValue !== undefined);

  if (!data || data.length === 0) {
    return (
      <div className={`flex items-center justify-center bg-slate-900/40 rounded-2xl border border-slate-800 p-6 h-[${height}px] ${className}`}>
        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
          Aucune donnée radar disponible
        </span>
      </div>
    );
  }

  // Sanitize data for Recharts
  const chartData = data.map((d) => ({
    subject: d.subject,
    A: Math.max(0, Math.min(100, d.value)),
    B: d.comparisonValue !== undefined ? Math.max(0, Math.min(100, d.comparisonValue)) : undefined,
    fullMark: d.fullMark || 100,
  }));

  const gradIdPrimary = `radarGrad_${primaryColor.replace("#", "")}`;
  const gradIdComp = `radarGrad_${comparisonColor.replace("#", "")}`;

  return (
    <div className={`w-full relative flex flex-col justify-between ${className}`}>
      {title && (
        <div className="flex justify-between items-center mb-2 px-1">
          <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
            {title}
          </span>
        </div>
      )}

      <div style={{ width: "100%", height }}>
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart cx="50%" cy="50%" outerRadius="72%" data={chartData}>
            <defs>
              <radialGradient id={gradIdPrimary} cx="0.5" cy="0.5" r="0.5">
                <stop offset="0%" stopColor={primaryColor} stopOpacity={0.6} />
                <stop offset="100%" stopColor={primaryColor} stopOpacity={0.15} />
              </radialGradient>
              {hasComparison && (
                <radialGradient id={gradIdComp} cx="0.5" cy="0.5" r="0.5">
                  <stop offset="0%" stopColor={comparisonColor} stopOpacity={0.5} />
                  <stop offset="100%" stopColor={comparisonColor} stopOpacity={0.1} />
                </radialGradient>
              )}
            </defs>

            <PolarGrid stroke="#334155" strokeDasharray="3 3" />
            <PolarAngleAxis
              dataKey="subject"
              tick={{ fill: "#94a3b8", fontSize: 9, fontWeight: 700 }}
            />
            <PolarRadiusAxis
              angle={30}
              domain={[0, 100]}
              tick={false}
              axisLine={false}
            />

            <Radar
              name={primaryName}
              dataKey="A"
              stroke={primaryColor}
              strokeWidth={2.5}
              fill={`url(#${gradIdPrimary})`}
              fillOpacity={1}
            />

            {hasComparison && (
              <Radar
                name={comparisonName}
                dataKey="B"
                stroke={comparisonColor}
                strokeWidth={2}
                strokeDasharray="4 4"
                fill={`url(#${gradIdComp})`}
                fillOpacity={0.6}
              />
            )}

            <Tooltip
              contentStyle={{
                backgroundColor: "#0f172a",
                borderColor: "#1e293b",
                borderRadius: "12px",
                color: "#f8fafc",
                fontSize: "11px",
                fontWeight: 600,
              }}
              formatter={(val: any) => [`${Number(val).toFixed(1)}%`, "Score"]}
            />

            {showLegend && (
              <Legend
                wrapperStyle={{ fontSize: "10px", fontWeight: 700, paddingTop: "8px" }}
              />
            )}
          </RadarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
