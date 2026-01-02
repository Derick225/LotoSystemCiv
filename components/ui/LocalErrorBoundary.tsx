import React, { ErrorInfo, ReactNode } from 'react';
import { RefreshCw, AlertTriangle } from 'lucide-react';

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
}

/**
 * LocalErrorBoundary - Targeted Module Error Isolation
 */
export class LocalErrorBoundary extends React.Component<Props, State> {
  public state: State = {
    hasError: false,
  };

  constructor(props: Props) {
    super(props);
  }

  static getDerivedStateFromError(_: Error): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.warn("Module Failure Intercepted:", error, errorInfo);
  }

  handleReload = () => {
    this.setState({ hasError: false });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-6 bg-red-50 dark:bg-red-900/10 text-red-700 dark:text-red-300 rounded-2xl border border-red-200 dark:border-red-800/30 text-center animate-fade-in flex flex-col items-center justify-center gap-3 h-full min-h-[150px]">
          <div className="p-3 bg-red-100 dark:bg-red-900/30 rounded-full">
            <AlertTriangle size={24} />
          </div>
          <p className="font-bold text-xs uppercase tracking-widest">Module Instable</p>
          <button 
            onClick={this.handleReload} 
            className="px-5 py-2 bg-white dark:bg-slate-800 text-[10px] font-black uppercase tracking-widest text-indigo-600 dark:text-indigo-400 rounded-xl border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-slate-700 transition shadow-sm flex items-center justify-center gap-2"
          >
            <RefreshCw size={12} /> Réessayer
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}