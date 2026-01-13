import React, { ErrorInfo, ReactNode } from 'react';
import { RefreshCw, AlertTriangle, WifiOff } from 'lucide-react';

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * LocalErrorBoundary - Targeted Module Error Isolation
 * Catches errors in children, displays fallback UI, and allows recovery.
 * Now smarter: Reloads page on ChunkLoadErrors.
 */
export class LocalErrorBoundary extends React.Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    if (process.env.NODE_ENV === 'development') {
        console.warn("Module Failure Intercepted:", error, errorInfo);
    }
  }

  handleReload = () => {
    // Détection des erreurs de chargement de module (Chunk missing)
    const isChunkError = this.state.error?.message?.includes('dynamically imported module') || 
                         this.state.error?.message?.includes('Importing a module script failed');
    
    if (isChunkError) {
        // Si c'est une erreur de chunk, on doit recharger la page pour avoir le nouvel index
        window.location.reload();
    } else {
        // Sinon, on tente juste de remonter le composant React
        this.setState({ hasError: false, error: null });
    }
  };

  render(): ReactNode {
    if (this.state.hasError) {
      const isNetwork = this.state.error?.message?.includes('fetch') || this.state.error?.message?.includes('network');
      
      return (
        <div className="p-6 bg-slate-50 dark:bg-slate-900/50 text-slate-600 dark:text-slate-300 rounded-[2rem] border-2 border-dashed border-slate-200 dark:border-slate-800 text-center animate-fade-in flex flex-col items-center justify-center gap-4 h-full min-h-[200px]">
          <div className="p-4 bg-white dark:bg-slate-800 rounded-full shadow-sm">
            {isNetwork ? <WifiOff size={24} className="text-rose-500"/> : <AlertTriangle size={24} className="text-amber-500" />}
          </div>
          <div>
            <p className="font-black text-xs uppercase tracking-widest text-slate-800 dark:text-white mb-1">Module Indisponible</p>
            <p className="text-[10px] opacity-70 max-w-[200px] mx-auto leading-relaxed">
              {this.state.error?.message || "Erreur de rendu"}
            </p>
          </div>
          <button 
            onClick={this.handleReload} 
            className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-black text-[10px] uppercase tracking-widest shadow-lg shadow-indigo-600/20 transition-all active:scale-95 flex items-center gap-2"
          >
            <RefreshCw size={12} /> {isNetwork ? 'Reconnexion' : 'Restaurer'}
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}