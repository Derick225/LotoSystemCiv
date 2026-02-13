import React, { Component, ErrorInfo, ReactNode } from 'react';
import { RefreshCw, AlertTriangle } from 'lucide-react';

interface LocalErrorBoundaryProps {
  children?: ReactNode;
}

interface LocalErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * LocalErrorBoundary v1.2
 * Isolates module-level rendering failures to prevent app-wide crash.
 */
export class LocalErrorBoundary extends Component<LocalErrorBoundaryProps, LocalErrorBoundaryState> {
  public state: LocalErrorBoundaryState = { hasError: false, error: null };

  constructor(props: LocalErrorBoundaryProps) {
    super(props);
  }

  // Standard static method for error boundaries
  static getDerivedStateFromError(error: Error): LocalErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.warn("MODULE_ISOLATED_FAILURE:", error, errorInfo);
  }

  // Restore the module by resetting error state
  handleReload = () => {
    this.setState({ hasError: false, error: null });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="p-6 bg-slate-50 dark:bg-slate-900/50 text-slate-600 dark:text-slate-300 rounded-[2rem] border-2 border-dashed border-slate-200 dark:border-slate-800 text-center animate-fade-in flex flex-col items-center justify-center gap-4 min-h-[200px]">
          <div className="p-4 bg-white dark:bg-slate-800 rounded-full shadow-sm">
            <AlertTriangle size={24} className="text-amber-500" />
          </div>
          <div>
            <p className="font-black text-xs uppercase tracking-widest text-slate-800 dark:text-white mb-1">Module Indisponible</p>
            <p className="text-[10px] opacity-70 max-w-[200px] mx-auto leading-relaxed">
              {this.state.error?.message || "Erreur de rendu interne."}
            </p>
          </div>
          <button onClick={this.handleReload} className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-black text-[10px] uppercase tracking-widest shadow-lg transition-all active:scale-95 flex items-center justify-center gap-2">
            <RefreshCw size={12} /> Restaurer le module
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}