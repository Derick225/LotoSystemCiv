
import React from 'react';
import { RefreshCw, Activity } from 'lucide-react';

interface LoaderProps {
    text?: string;
    fullScreen?: boolean;
}

export const Loader: React.FC<LoaderProps> = ({ text = "Calcul en cours...", fullScreen = false }) => {
    const content = (
        <div className="flex flex-col items-center justify-center gap-6 p-10 animate-fade-in">
            <div className="relative">
                <div className="w-20 h-20 border-4 border-slate-800 border-t-indigo-600 rounded-full animate-spin"></div>
                <Activity className="absolute inset-0 m-auto text-indigo-500 w-8 h-8 animate-pulse" />
            </div>
            <div className="flex items-center gap-3">
                <RefreshCw size={16} className="text-slate-500 animate-spin" />
                <span className="text-xs font-black uppercase tracking-[0.3em] text-slate-400">{text}</span>
            </div>
        </div>
    );

    if (fullScreen) {
        return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md">
                {content}
            </div>
        );
    }

    return content;
};
