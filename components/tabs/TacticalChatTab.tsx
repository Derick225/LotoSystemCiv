
import React, { useState, useRef, useEffect } from 'react';
import { useNexus } from '../NexusProvider';
import { invokeEdgeFunction } from '../../services/apiClient';
import { ChatMessage } from '../../types';
import { Send, Terminal, Bot, User, RefreshCw, Brain, Sparkles, Wand2, Activity, Wallet, Microscope, History } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { SafeMarkdown } from '../ui/SafeMarkdown';
import { audioEngine } from '../../utils/audioEngine';
import { getBankroll } from '../../services/userPreferencesService';

export const TacticalChatTab: React.FC<{ drawName: string }> = ({ drawName }) => {
    const { history, spectral, stats, lastPrediction, setDrawName, refreshData } = useNexus();
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages, isLoading]);

    const executeFunctionCall = async (fc: any) => {
        let result = "Fonction exécutée avec succès.";
        
        switch (fc.name) {
            case "analyzeDrawDynamics":
                window.dispatchEvent(new CustomEvent('NAVIGATE_TO_MODULE', { detail: { mainTab: 'Signaux' } }));
                result = `Analyse des dynamiques de ${fc.args.drawName} lancée. Visualisation déportée vers le module Signaux.`;
                break;
            case "requestTicketSynthesis":
                window.dispatchEvent(new CustomEvent('NAVIGATE_TO_MODULE', { detail: { mainTab: 'Topologie', subTab: 'combinations' } }));
                result = `Paramétrage de la synthèse effectué : ${fc.args.ticketCount} tickets demandés en mode ${fc.args.riskProfile || 'BALANCED'}.`;
                break;
            case "openForensicAudit":
                window.dispatchEvent(new CustomEvent('NAVIGATE_TO_MODULE', { detail: { mainTab: 'Forensic' } }));
                result = "Accès au module Forensic pour audit post-tirage accordé.";
                break;
            case "showHistory":
                window.dispatchEvent(new CustomEvent('NAVIGATE_TO_MODULE', { detail: { mainTab: 'Flux' } }));
                result = "Ouverture du registre historique global.";
                break;
            default:
                result = "Erreur : Outil non reconnu.";
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
                    userInput: input,
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
                        content: `**[SYSTEM_ACTION]** : ${funcResult}`,
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
                content: "Rupture de liaison. Le noyau Apex tente une reconnexion...",
                timestamp: Date.now()
            }]);
            audioEngine.play('error');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="flex flex-col h-[700px] bg-slate-900/60 rounded-[3.5rem] border border-white/10 overflow-hidden shadow-2xl relative">
            <div className="p-8 bg-slate-900 border-b border-white/5 flex justify-between items-center z-10">
                <div className="flex items-center gap-4">
                    <div className="p-3 bg-indigo-600 rounded-2xl text-white shadow-lg">
                        <Brain size={22} />
                    </div>
                    <div>
                        <h3 className="text-white font-black uppercase text-base tracking-widest">Tactical Liaison Apex</h3>
                        <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest flex items-center gap-2">
                             <Activity size={10} className="text-emerald-500"/> Cortex Decisionnel Actif
                        </p>
                    </div>
                </div>
                <div className="flex gap-2">
                    <div className="px-4 py-2 bg-black/40 rounded-full border border-white/5 text-[9px] font-black text-emerald-400 flex items-center gap-2">
                        <Wallet size={10} /> {getBankroll().toLocaleString()} F
                    </div>
                </div>
            </div>

            <div ref={scrollRef} className="flex-1 overflow-y-auto p-8 space-y-6 custom-scrollbar scroll-smooth">
                {messages.length === 0 && (
                    <div className="h-full flex flex-col items-center justify-center text-center space-y-8 opacity-20">
                        <div className="relative">
                            <Bot size={80} className="text-indigo-500 animate-pulse" />
                        </div>
                        <div className="space-y-3">
                            <p className="text-lg font-black uppercase tracking-[0.4em] text-slate-300">Terminal d'Opérations</p>
                            <p className="text-xs max-w-xs mx-auto font-medium">L'IA Tactique Apex v14 supervise les flux. Ordonnez une analyse ou demandez une synthèse.</p>
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
                                max-w-[85%] p-6 rounded-[2.5rem] shadow-2xl relative
                                ${msg.role === 'user' 
                                    ? 'bg-indigo-600 text-white rounded-tr-none' 
                                    : 'bg-slate-800 text-slate-100 rounded-tl-none border border-white/10'}
                            `}>
                                <div className="flex items-center gap-2 mb-3 opacity-50">
                                    {msg.role === 'assistant' ? <Bot size={14}/> : <User size={14}/>}
                                    <span className="text-[10px] font-black uppercase tracking-widest">{msg.role === 'user' ? 'Opérateur' : 'Apex Core'}</span>
                                </div>
                                <div className={`text-xs md:text-sm font-medium leading-relaxed ${msg.role === 'assistant' ? 'font-mono' : ''}`}>
                                    {msg.role === 'assistant' ? <SafeMarkdown text={msg.content} /> : msg.content}
                                </div>
                            </div>
                        </motion.div>
                    ))}
                </AnimatePresence>
                
                {isLoading && (
                    <div className="flex justify-start">
                        <div className="bg-slate-800/50 p-6 rounded-[2.5rem] rounded-tl-none border border-white/5 flex gap-2">
                            <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-bounce"></div>
                            <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                            <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                        </div>
                    </div>
                )}
            </div>

            <div className="p-6 bg-slate-900 border-t border-white/5">
                <div className="flex gap-4 items-end bg-black/30 p-2 rounded-[2.5rem] border border-white/10 focus-within:border-indigo-500/50 transition-colors">
                    <div className="pl-4 pb-4 text-indigo-500">
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
                        placeholder="Demandez un audit, une navigation ou un avis..."
                        className="flex-1 bg-transparent border-none text-slate-200 placeholder-slate-600 focus:ring-0 resize-none py-4 max-h-32 text-sm font-medium outline-none"
                        rows={1}
                    />
                    <button 
                        onClick={handleSend}
                        disabled={!input.trim() || isLoading}
                        className="p-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-full transition-all disabled:opacity-50 shadow-lg"
                    >
                        {isLoading ? <RefreshCw className="animate-spin" size={20}/> : <Send size={20}/>}
                    </button>
                </div>
            </div>
        </div>
    );
};
