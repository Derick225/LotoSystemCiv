
import React, { useState, useRef, useEffect } from 'react';
import { useNexus } from '../NexusProvider';
import { invokeEdgeFunction } from '../../services/apiClient';
import { ChatMessage } from '../../types';
import { Send, Terminal, Bot, User, RefreshCw, Brain, Activity, Wallet, Trash2, Command, Cpu } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { SafeMarkdown } from '../ui/SafeMarkdown';
import { audioEngine } from '../../utils/audioEngine';
import { getBankroll } from '../../services/userPreferencesService';

export const TacticalChatTab: React.FC<{ drawName: string }> = ({ drawName }) => {
    const { history, lastPrediction, refreshData } = useNexus();
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);

    // Auto-scroll to bottom
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages, isLoading]);

    const executeFunctionCall = async (fc: any) => {
        let result = "Fonction exécutée.";
        
        switch (fc.name) {
            case "analyzeDrawDynamics":
                window.dispatchEvent(new CustomEvent('NAVIGATE_TO_MODULE', { detail: { mainTab: 'Signaux' } }));
                result = `> Navigation : Module Signaux activé pour ${fc.args.drawName}.`;
                break;
            case "requestTicketSynthesis":
                window.dispatchEvent(new CustomEvent('NAVIGATE_TO_MODULE', { detail: { mainTab: 'Topologie', subTab: 'combinations' } }));
                result = `> Configuration : Synthèse ${fc.args.riskProfile || 'Standard'} préparée.`;
                break;
            case "openForensicAudit":
                window.dispatchEvent(new CustomEvent('NAVIGATE_TO_MODULE', { detail: { mainTab: 'Forensic' } }));
                result = "> Sécurité : Accès Forensic accordé.";
                break;
            case "showHistory":
                window.dispatchEvent(new CustomEvent('NAVIGATE_TO_MODULE', { detail: { mainTab: 'Flux' } }));
                result = "> Base de Données : Registre global ouvert.";
                break;
            default:
                result = `> Erreur : Commande ${fc.name} inconnue.`;
        }
        
        return result;
    };

    const handleSend = async () => {
        if (!input.trim() || isLoading) return;

        const userMsg: ChatMessage = {
            id: crypto.randomUUID(),
            role: 'user',
            content: input,
            timestamp: Date.now()
        };

        setMessages(prev => [...prev, userMsg]);
        setInput('');
        setIsLoading(true);
        audioEngine.play('click');

        const currentBankroll = getBankroll();

        try {
            const { data, error } = await invokeEdgeFunction('ask-oracle', {
                body: {
                    task: 'chat',
                    drawName,
                    history: messages.slice(-5).map(m => ({ role: m.role, content: m.content })),
                    userInput: userMsg.content,
                    currentContext: {
                        regime: history.length > 20 ? "Stabilisé" : "Calibration",
                        lastPrediction: lastPrediction?.suggestedNumbers,
                        bankroll: currentBankroll
                    }
                }
            });

            if (error) throw error;

            if (data.functionCalls && data.functionCalls.length > 0) {
                for (const fc of data.functionCalls) {
                    const funcResult = await executeFunctionCall(fc);
                    setMessages(prev => [...prev, {
                        id: crypto.randomUUID(),
                        role: 'assistant',
                        content: `\`\`\`bash\n${funcResult}\n\`\`\``,
                        timestamp: Date.now()
                    }]);
                }
            }

            if (data.response) {
                setMessages(prev => [...prev, {
                    id: crypto.randomUUID(),
                    role: 'assistant',
                    content: data.response,
                    timestamp: Date.now()
                }]);
            }

            audioEngine.play('success');
        } catch (e: any) {
            setMessages(prev => [...prev, {
                id: crypto.randomUUID(),
                role: 'assistant',
                content: "⚠️ **ERREUR CRITIQUE** : Perte de liaison avec le Noyau. Vérifiez votre connexion.",
                timestamp: Date.now()
            }]);
            audioEngine.play('error');
        } finally {
            setIsLoading(false);
        }
    };

    const handleClear = () => {
        if (confirm("Purger le journal de communication ?")) {
            setMessages([]);
            audioEngine.play('click');
        }
    };

    return (
        <div className="flex flex-col h-[700px] bg-slate-900/80 rounded-[3rem] border border-white/10 overflow-hidden shadow-2xl relative">
            {/* Header */}
            <div className="px-8 py-6 bg-slate-950 border-b border-white/5 flex justify-between items-center z-10">
                <div className="flex items-center gap-4">
                    <div className="p-3 bg-indigo-600 rounded-2xl text-white shadow-lg shadow-indigo-600/20">
                        <Brain size={22} />
                    </div>
                    <div>
                        <h3 className="text-white font-black uppercase text-base tracking-widest flex items-center gap-2">
                            Tactical Liaison <span className="text-indigo-500">Apex</span>
                        </h3>
                        <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest flex items-center gap-2">
                             <Activity size={10} className="text-emerald-500"/> Cortex Decisionnel Actif
                        </p>
                    </div>
                </div>
                <div className="flex gap-3">
                    <div className="hidden md:flex px-4 py-2 bg-black/40 rounded-full border border-white/5 text-[9px] font-black text-emerald-400 items-center gap-2">
                        <Wallet size={10} /> {getBankroll().toLocaleString()} F
                    </div>
                    <button onClick={handleClear} className="p-2 bg-slate-800 rounded-full hover:bg-rose-500 hover:text-white text-slate-500 transition-colors" title="Purger le chat">
                        <Trash2 size={16} />
                    </button>
                </div>
            </div>

            {/* Chat Body */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 md:p-8 space-y-6 custom-scrollbar scroll-smooth bg-gradient-to-b from-slate-900 to-slate-950">
                {messages.length === 0 && (
                    <div className="h-full flex flex-col items-center justify-center text-center space-y-8 opacity-40 select-none">
                        <div className="relative">
                            <div className="absolute inset-0 bg-indigo-500 blur-[80px] opacity-20"></div>
                            <Bot size={100} className="text-indigo-500 animate-pulse relative z-10" />
                        </div>
                        <div className="space-y-2">
                            <p className="text-xl font-black uppercase tracking-[0.4em] text-slate-300">Terminal Prêt</p>
                            <p className="text-xs max-w-xs mx-auto font-medium text-slate-500">L'IA Tactique Apex v14 supervise les flux. Lancez une commande.</p>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            {['Analyser le risque', 'Ouvrir le Wallet', 'Audit Forensic', 'Synthèse Ticket'].map(cmd => (
                                <button key={cmd} onClick={() => setInput(cmd)} className="px-4 py-2 rounded-xl border border-slate-700 bg-slate-900 text-[10px] font-bold uppercase hover:border-indigo-500 hover:text-indigo-400 transition-colors">
                                    {cmd}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                <AnimatePresence>
                    {messages.map((msg) => (
                        <motion.div
                            key={msg.id}
                            initial={{ opacity: 0, y: 10, scale: 0.98 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                        >
                            <div className={`
                                max-w-[90%] md:max-w-[80%] p-5 rounded-[2rem] shadow-xl relative backdrop-blur-sm
                                ${msg.role === 'user' 
                                    ? 'bg-indigo-600 text-white rounded-tr-sm' 
                                    : 'bg-slate-800/80 text-slate-200 rounded-tl-sm border border-white/5'}
                            `}>
                                <div className="flex items-center gap-2 mb-2 opacity-60">
                                    {msg.role === 'assistant' ? <Cpu size={12}/> : <User size={12}/>}
                                    <span className="text-[9px] font-black uppercase tracking-widest">{msg.role === 'user' ? 'OPÉRATEUR' : 'APEX CORE'}</span>
                                </div>
                                <div className={`text-xs md:text-sm font-medium leading-relaxed ${msg.role === 'assistant' ? 'font-sans' : ''}`}>
                                    {msg.role === 'assistant' ? <SafeMarkdown text={msg.content} /> : msg.content}
                                </div>
                            </div>
                        </motion.div>
                    ))}
                </AnimatePresence>
                
                {isLoading && (
                    <div className="flex justify-start animate-fade-in">
                        <div className="bg-slate-800/50 px-6 py-4 rounded-[2rem] rounded-tl-sm border border-white/5 flex items-center gap-3">
                            <RefreshCw size={14} className="text-indigo-500 animate-spin"/>
                            <span className="text-[10px] font-mono text-indigo-400 animate-pulse">TRAITEMENT NEURONAL...</span>
                        </div>
                    </div>
                )}
            </div>

            {/* Input Area */}
            <div className="p-4 md:p-6 bg-slate-950 border-t border-white/5">
                <div className="flex gap-3 items-end bg-slate-900 p-2 rounded-[2rem] border border-white/10 focus-within:border-indigo-500/50 focus-within:ring-1 focus-within:ring-indigo-500/20 transition-all shadow-lg">
                    <div className="pl-3 pb-3 text-indigo-500">
                        <Terminal size={20} />
                    </div>
                    <textarea
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                handleSend();
                            }
                        }}
                        placeholder="Entrez votre directive..."
                        className="flex-1 bg-transparent border-none text-slate-200 placeholder-slate-600 focus:ring-0 resize-none py-3 max-h-32 text-sm font-medium outline-none"
                        rows={1}
                    />
                    <button 
                        onClick={handleSend}
                        disabled={!input.trim() || isLoading}
                        className="p-3 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-600 text-white rounded-full transition-all shadow-lg active:scale-95"
                    >
                        {isLoading ? <RefreshCw className="animate-spin" size={20}/> : <Send size={20}/>}
                    </button>
                </div>
                <div className="text-center mt-3">
                    <p className="text-[9px] text-slate-600 font-mono flex items-center justify-center gap-2">
                        <Command size={10}/> Mode: Gemini 3 Pro (Thinking)
                    </p>
                </div>
            </div>
        </div>
    );
};
