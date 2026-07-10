import React, { useRef, useEffect } from 'react';
import { Terminal } from 'lucide-react';

interface LogTerminalProps {
    logs: string[];
}

export const LogTerminal: React.FC<LogTerminalProps> = ({ logs }) => {
    const scrollRef = useRef<HTMLDivElement>(null);
    
    useEffect(() => {
        if(scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }, [logs]);

    return (
        <div className="bg-[#040815] rounded-2xl border border-slate-800 p-4 font-mono text-[10px] h-48 overflow-hidden flex flex-col shadow-inner">
            <div className="flex items-center gap-2 border-b border-slate-850 pb-2 mb-2 text-slate-500 justify-between">
                <div className="flex items-center gap-2">
                    <Terminal size={12} className="text-emerald-500" /> <span className="font-bold">NEXUS_KERNEL_LOGS</span>
                </div>
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></div>
            </div>
            <div ref={scrollRef} className="flex-1 overflow-y-auto custom-scrollbar space-y-1">
                {logs.map((log, i) => (
                    <div key={i} className="text-emerald-500/90 leading-relaxed text-[9.5px]">
                        <span className="text-slate-600 mr-2 font-light">[{new Date().toLocaleTimeString()}]</span>
                        {log}
                    </div>
                ))}
                {logs.length === 0 && <span className="text-slate-700 italic">En attente du processus de calcul...</span>}
            </div>
        </div>
    );
};
