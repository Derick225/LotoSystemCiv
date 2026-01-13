import React, { Component, ErrorInfo, ReactNode } from 'react';
import { getUserFriendlyError } from '../../utils/errorHandler';

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * GlobalErrorBoundary v4.0 - Industrial Grade Error Interceptor
 * Protects the entire application from crashing.
 */
export class GlobalErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('NEXUS CRITICAL FAILURE:', error, errorInfo);
  }

  handleReload = () => {
    this.setState({ hasError: false, error: null });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      const msg = getUserFriendlyError(this.state.error);
      return (
        <div className="min-h-screen flex items-center justify-center bg-nexus-950 p-4 font-sans safe-top safe-bottom">
          <div className="bg-white dark:bg-slate-800 p-10 rounded-[3rem] shadow-2xl max-w-lg w-full text-center border border-slate-700 relative overflow-hidden animate-scale-in">
            <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-indigo-500 to-purple-500"></div>
            <div className="w-20 h-20 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-6 text-4xl shadow-lg border border-red-500/20">🧩</div>
            <h2 className="text-2xl font-black text-slate-800 dark:text-white mb-3 tracking-tighter uppercase">Collision Structurelle</h2>
            <p className="text-slate-400 mb-6 text-sm font-medium">Une anomalie critique a interrompu le moteur Nexus.</p>
            <div className="bg-red-900/10 border border-red-900/30 p-5 rounded-2xl mb-8">
                <p className="text-red-400 font-bold text-sm leading-relaxed italic">"{msg}"</p>
            </div>
            <button 
                onClick={this.handleReload} 
                className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 text-white font-black rounded-2xl transition-all shadow-xl shadow-indigo-600/20 active:scale-[0.95] uppercase tracking-[0.2em] text-xs flex items-center justify-center gap-2"
            >
                <span>↻</span> Réinitialiser l'Infrastructure
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
