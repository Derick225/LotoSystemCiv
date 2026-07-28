import React from "react";
import { Info } from "lucide-react";

interface InfoTooltipProps {
  title: string;
  content: string;
  example?: string;
  position?: "top" | "bottom" | "left" | "right";
  children?: React.ReactNode;
}

export const InfoTooltip: React.FC<InfoTooltipProps> = ({
  title,
  content,
  example,
  position = "top",
  children,
}) => {
  const positionClasses = {
    top: "bottom-full left-1/2 -translate-x-1/2 mb-3",
    bottom: "top-full left-1/2 -translate-x-1/2 mt-3",
    left: "right-full top-1/2 -translate-y-1/2 mr-3",
    right: "left-full top-1/2 -translate-y-1/2 ml-3",
  };

  const arrowClasses = {
    top: "top-full left-1/2 -translate-x-1/2 border-t-slate-900",
    bottom: "bottom-full left-1/2 -translate-x-1/2 border-b-slate-900",
    left: "left-full top-1/2 -translate-y-1/2 border-l-slate-900",
    right: "right-full top-1/2 -translate-y-1/2 border-r-slate-900",
  };

  return (
    <div className="group relative inline-block">
      {children ? (
        children
      ) : (
        <Info
          size={14}
          className="text-slate-500 hover:text-indigo-400 transition-colors cursor-help"
        />
      )}

      <div
        className={`absolute z-[100] hidden group-hover:block w-64 p-4 glass-morphism bg-slate-950/95 rounded-2xl border border-indigo-500/30 shadow-2xl shadow-indigo-500/20 animate-scale-in pointer-events-none ${positionClasses[position]}`}
      >
        <div className="relative">
          <h5 className="text-[10px] font-black text-indigo-300 uppercase tracking-[0.2em] mb-2 flex items-center gap-2">
            <span className="w-1 h-1 bg-indigo-500 rounded-full animate-pulse"></span>
            {title}
          </h5>
          <p className="text-[11px] text-slate-200 leading-relaxed font-medium mb-2">
            {content}
          </p>
          {example && (
            <div className="pt-2 border-t border-white/10">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-tighter">
                Exemple:
              </span>
              <p className="text-[10px] text-indigo-200 italic font-mono mt-0.5">
                {example}
              </p>
            </div>
          )}
          {/* Arrow */}
          <div
            className={`absolute w-0 h-0 border-8 border-transparent ${arrowClasses[position]}`}
          ></div>
        </div>
      </div>
    </div>
  );
};
