import React from "react";
import { AlertTriangle, Info, AlertCircle } from "lucide-react";

export interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "info" | "warning";
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  title,
  message,
  confirmLabel = "Confirmer",
  cancelLabel = "Annuler",
  variant = "danger",
  onConfirm,
  onCancel,
}) => {
  if (!isOpen) return null;

  const btnColor =
    variant === "danger"
      ? "bg-rose-600 hover:bg-rose-500 shadow-rose-600/30"
      : variant === "warning"
        ? "bg-amber-600 hover:bg-amber-500 shadow-amber-600/30"
        : "bg-indigo-600 hover:bg-indigo-500 shadow-indigo-600/30";

  const iconBg =
    variant === "danger"
      ? "bg-rose-500/10 text-rose-400"
      : variant === "warning"
        ? "bg-amber-500/10 text-amber-400"
        : "bg-indigo-500/10 text-indigo-400";

  const Icon =
    variant === "danger"
      ? AlertTriangle
      : variant === "warning"
        ? AlertCircle
        : Info;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in p-4"
      onClick={onCancel}
    >
      <div
        className="bg-slate-900 border border-slate-700 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3">
          <span className={`p-2.5 rounded-xl ${iconBg}`}>
            <Icon size={20} />
          </span>
          <h3 className="text-sm font-black text-white uppercase tracking-wider">
            {title}
          </h3>
        </div>
        <p className="text-xs text-slate-300 leading-relaxed">{message}</p>
        <div className="flex items-center gap-3 justify-end pt-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold transition-all border border-slate-700 cursor-pointer"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`px-4 py-2 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-lg cursor-pointer active:scale-95 ${btnColor}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};
