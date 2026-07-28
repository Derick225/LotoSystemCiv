import React, { createContext, useContext, useState, useCallback } from "react";
import { X, CheckCircle, AlertCircle, Info } from "lucide-react";

type ToastType = "success" | "error" | "info";

interface Toast {
  id: string;
  message: string;
  type: ToastType;
}

interface ToastContextType {
  showToast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used within a ToastProvider");
  return context;
};

let globalToastCounter = 0;

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback((message: string, type: ToastType = "info") => {
    globalToastCounter++;
    const id = `toast_${Date.now()}_${globalToastCounter}`;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  const getIcon = (type: ToastType) => {
    switch (type) {
      case "success":
        return <CheckCircle size={18} className="text-emerald-500" />;
      case "error":
        return <AlertCircle size={18} className="text-rose-500" />;
      default:
        return <Info size={18} className="text-indigo-500" />;
    }
  };

  const getStyles = (type: ToastType) => {
    switch (type) {
      case "success":
        return "border-emerald-500/50 bg-slate-900/90 text-white shadow-[0_0_15px_rgba(16,185,129,0.2)] border";
      case "error":
        return "border-rose-500/50 bg-slate-900/90 text-white shadow-[0_0_15px_rgba(244,63,94,0.2)] border";
      default:
        return "border-indigo-500/50 bg-slate-900/90 text-white shadow-[0_0_15px_rgba(99,102,241,0.2)] border";
    }
  };

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-3 pointer-events-none p-2">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto min-w-[300px] max-w-sm p-4 rounded-xl shadow-2xl flex items-start gap-3 transform transition-all animate-slide-up backdrop-blur-md ${getStyles(toast.type)}`}
          >
            <div className="mt-0.5 shrink-0">{getIcon(toast.type)}</div>
            <p className="text-xs font-bold leading-relaxed flex-1">
              {toast.message}
            </p>
            <button
              onClick={() => removeToast(toast.id)}
              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};
