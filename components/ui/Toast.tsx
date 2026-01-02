
import React, { createContext, useContext, useState, useCallback } from 'react';

type ToastType = 'success' | 'error' | 'info';

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
  if (!context) throw new Error('useToast must be used within a ToastProvider');
  return context;
};

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback((message: string, type: ToastType = 'info') => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {/* Z-Index High pour passer au-dessus des modales (z-50/z-100) */}
      <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none">
        {toasts.map(toast => (
          <div
            key={toast.id}
            className={`pointer-events-auto min-w-[280px] max-w-sm p-4 rounded-lg shadow-2xl border-l-4 text-sm font-medium animate-slide-up transform transition-all backdrop-blur-md ${
              toast.type === 'success' ? 'bg-white/95 dark:bg-slate-800/95 border-emerald-500 text-slate-800 dark:text-white' :
              toast.type === 'error' ? 'bg-white/95 dark:bg-slate-800/95 border-rose-500 text-slate-800 dark:text-white' : 
              'bg-white/95 dark:bg-slate-800/95 border-indigo-500 text-slate-800 dark:text-white'
            }`}
          >
            <div className="flex items-start gap-3">
                <span className="text-lg mt-0.5">
                    {toast.type === 'success' ? '✅' : toast.type === 'error' ? '⛔' : 'ℹ️'}
                </span>
                <p className="flex-1 leading-snug">{toast.message}</p>
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};
