
import React, { useState, useEffect, useRef } from 'react';
import { Search, ArrowRight, Zap, LayoutGrid, Terminal, Wallet, Settings, X, Activity } from 'lucide-react';
import { useNexus } from '../NexusProvider';
import { useToast } from './Toast';
import { audioEngine } from '../../utils/audioEngine';
import { ALL_DRAWS } from '../../constants';

interface CommandPaletteProps {
    isOpen: boolean;
    onClose: () => void;
    onNavigate: (view: any) => void;
    onAction: (action: string) => void;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({ isOpen, onClose, onNavigate, onAction }) => {
    const { setDrawName, refreshData, currentDrawName } = useNexus();
    const { showToast } = useToast();
    const [query, setQuery] = useState('');
    const [selectedIndex, setSelectedIndex] = useState(0);
    const inputRef = useRef<HTMLInputElement>(null);

    // Filtered Commands
    const commands = [
        { id: 'nav-home', label: 'Aller à la Station', icon: <LayoutGrid size={16}/>, group: 'Navigation', action: () => onNavigate('home') },
        { id: 'nav-lab', label: 'Ouvrir Quantum Lab', icon: <Activity size={16}/>, group: 'Navigation', action: () => onNavigate('lab') },
        { id: 'nav-wallet', label: 'Mon Portefeuille', icon: <Wallet size={16}/>, group: 'Navigation', action: () => onAction('wallet') },
        { id: 'sys-scan', label: 'Forcer Scan Cloud', icon: <Zap size={16}/>, group: 'Système', action: () => { refreshData(currentDrawName || '', true); showToast('Scan lancé...', 'info'); } },
        { id: 'sys-settings', label: 'Paramètres', icon: <Settings size={16}/>, group: 'Système', action: () => onAction('settings') },
        ...ALL_DRAWS.map(d => ({
            id: `draw-${d.name}`,
            label: `Analyser ${d.name}`,
            icon: <Terminal size={16}/>,
            group: 'Tirages',
            action: () => { setDrawName(d.name); }
        }))
    ];

    const filtered = commands.filter(c => c.label.toLowerCase().includes(query.toLowerCase())).slice(0, 8);

    useEffect(() => {
        if (isOpen) {
            setTimeout(() => inputRef.current?.focus(), 50);
            setQuery('');
            setSelectedIndex(0);
        }
    }, [isOpen]);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'ArrowDown') {
            setSelectedIndex(prev => Math.min(prev + 1, filtered.length - 1));
        } else if (e.key === 'ArrowUp') {
            setSelectedIndex(prev => Math.max(prev - 1, 0));
        } else if (e.key === 'Enter') {
            if (filtered[selectedIndex]) {
                handleSelect(filtered[selectedIndex]);
            }
        } else if (e.key === 'Escape') {
            onClose();
        }
    };

    const handleSelect = (cmd: typeof commands[0]) => {
        audioEngine.play('click');
        cmd.action();
        onClose();
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] bg-slate-950/80 backdrop-blur-sm flex items-start justify-center pt-[15vh] p-4 animate-fade-in" onClick={onClose}>
            <div className="w-full max-w-xl bg-slate-900 rounded-3xl shadow-2xl border border-slate-700 overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
                <div className="flex items-center gap-4 p-6 border-b border-slate-800">
                    <Search className="text-slate-500" size={24} />
                    <input 
                        ref={inputRef}
                        type="text" 
                        value={query}
                        onChange={e => { setQuery(e.target.value); setSelectedIndex(0); }}
                        onKeyDown={handleKeyDown}
                        placeholder="Rechercher une commande, un tirage..."
                        className="flex-1 bg-transparent text-xl font-bold text-white placeholder-slate-600 outline-none"
                    />
                    <div className="hidden md:flex gap-2">
                        <kbd className="px-2 py-1 bg-slate-800 rounded-lg text-[10px] font-black text-slate-400 border border-slate-700">esc</kbd>
                    </div>
                </div>
                
                <div className="max-h-[60vh] overflow-y-auto custom-scrollbar p-2">
                    {filtered.length > 0 ? (
                        filtered.map((cmd, idx) => (
                            <button
                                key={cmd.id}
                                onClick={() => handleSelect(cmd)}
                                onMouseEnter={() => setSelectedIndex(idx)}
                                className={`w-full flex items-center justify-between p-4 rounded-2xl transition-all group ${selectedIndex === idx ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:bg-white/5'}`}
                            >
                                <div className="flex items-center gap-4">
                                    <div className={`p-2 rounded-xl ${selectedIndex === idx ? 'bg-white/20' : 'bg-slate-800'}`}>
                                        {cmd.icon}
                                    </div>
                                    <div className="text-left">
                                        <div className={`text-sm font-bold ${selectedIndex === idx ? 'text-white' : 'text-slate-300'}`}>{cmd.label}</div>
                                        {cmd.group && <div className={`text-[10px] font-bold uppercase tracking-wider ${selectedIndex === idx ? 'text-indigo-200' : 'text-slate-600'}`}>{cmd.group}</div>}
                                    </div>
                                </div>
                                {selectedIndex === idx && <ArrowRight size={16} className="animate-pulse"/>}
                            </button>
                        ))
                    ) : (
                        <div className="p-12 text-center text-slate-500">
                            <p className="text-xs font-bold uppercase tracking-widest">Aucun résultat</p>
                        </div>
                    )}
                </div>
                
                <div className="p-3 bg-slate-950 border-t border-slate-800 flex justify-between items-center px-6">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Nexus Command v2.0</span>
                    <div className="flex gap-4 text-[10px] font-bold text-slate-600">
                        <span>↑↓ Naviguer</span>
                        <span>↵ Valider</span>
                    </div>
                </div>
            </div>
        </div>
    );
};
