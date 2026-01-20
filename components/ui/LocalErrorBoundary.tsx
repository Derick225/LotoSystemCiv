
import React, { ErrorInfo, ReactNode } from 'react';
import { RefreshCw, AlertTriangle, WifiOff } from 'lucide-react';

interface Props {
  children?: ReactNode;
  key?: any;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * LocalErrorBoundary v4.5 - Module Isolation
 */
// Fix: Use React.Component to ensure inheritance is properly recognized by TypeScript
export class LocalErrorBoundary extends React.Component<Props, State> {
  // Fix: Correctly initialize state for class component
  public state: State = {
    hasError: false,
    error: null,
  };

  constructor(props: Props) {
    super(props);
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  // Fix: Removed 'override' to ensure compatibility across TS environments
  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    if (process.env.NODE_ENV === 'development') {
        console.warn("Module Failure Intercepted:", error, errorInfo);
    }
  }

  // Fix: Inheritance resolution allows access to setState and state method within arrow function
  private handleReload = () => {
    const { error } = this.state;
    const isChunkError = error?.message?.includes('dynamically imported module') || 
                         error?.message?.includes('Importing a module script failed');
    
    if (isChunkError) {
        window.location.reload();
    } else {
        // Fix: Accessing setState through React.Component inheritance
        this.setState({ hasError: false, error: null });
    }
  };

  // Fix: Removed 'override' and correctly access state/props from base React.Component class
  public render(): ReactNode {
    // Fix: props and state are accessed correctly through inheritance from React.Component
    const { hasError, error } = this.state;
    const { children } = this.props;

    if (hasError) {
      const isNetwork = error?.message?.includes('fetch') || error?.message?.includes('network');
      
      return (
        <div className="p-6 bg-slate-50 dark:bg-slate-900/50 text-slate-600 dark:text-slate-300 rounded-[2rem] border-2 border-dashed border-slate-200 dark:border-slate-800 text-center animate-fade-in flex flex-col items-center justify-center gap-4 h-full min-h-[200px]">
          <div className="p-4 bg-white dark:bg-slate-800 rounded-full shadow-sm">
            {isNetwork ? <WifiOff size={24} className="text-rose-500"/> : <AlertTriangle size={24} className="text-amber-500" />}
          </div>
          <div>
            <p className="font-black text-xs uppercase tracking-widest text-slate-800 dark:text-white mb-1">Module Indisponible</p>
            <p className="text-[10px] opacity-70 max-w-[200px] mx-auto leading-relaxed">
              {error?.message || "Erreur de rendu"}
            </p>
          </div>
          <button 
            onClick={this.handleReload} 
            className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-black text-[10px] uppercase tracking-widest shadow-lg shadow-indigo-600/20 transition-all active:scale-95 flex items-center justify-center gap-2"
          >
            <RefreshCw size={12} /> {isNetwork ? 'Reconnexion' : 'Restaurer'}
          </button>
        </div>
      );
    }

    return children;
  }
}
