import React, { useState, useRef, useEffect } from 'react';
import { useNexus } from '../NexusProvider';
import { invokeEdgeFunction } from '../../services/apiClient';
import { ChatMessage } from '../../types';
import { Send, Terminal, Bot, User, RefreshCw, Brain, Sparkles, Wand2, Activity } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { SafeMarkdown } from '../ui/SafeMarkdown';
import { audioEngine } from '../../utils/audioEngine';

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
                // Simule une analyse en navigant vers l'onglet signaux par exemple
                window.dispatchEvent(new CustomEvent('NAVIGATE_TO_MODULE', { detail: { mainTab: 'Signaux' } }));
                result = `Analyse des dynamiques de ${fc.args.drawName} lancée. Visualisation déportée vers le module Signaux.`;
                break;
            case "requestTicketSynthesis":
                // Navigue vers l'onglet Combinatoire/Architecte
                window.dispatchEvent(new CustomEvent('NAVIGATE_TO_MODULE', { detail: { mainTab: 'Topologie', subTab: 'combinations' } }));
                result = `Paramétrage de la synthèse effectué : ${fc.args.ticketCount} tickets demandés en mode ${fc.args.riskProfile || 'BALANCED'}.`;
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

        try {
            const { data, error } = await invokeEdgeFunction('ask-oracle', {
                body: {
                    task: 'chat',
                    drawName,
                    history: messages.slice(-5).map(m => ({ role: m.role, content: m.content })),
                    userInput: input,
                    currentContext: {
                        regime: history.length > 20 ? "Stabilisé" : "Calibration",
                        lastPrediction: lastPrediction?.suggestedNumbers
                    }
                }
            });

            if (error) throw error;

            // Gestion du function calling
            if (data.functionCalls && data.functionCalls.length > 0) {
                for (const fc of data.functionCalls) {
                    const funcResult = await executeFunctionCall(fc);
                    setMessages(prev => [...prev, {
                        id: crypto.randomUUID(),
                        role: 'assistant',
                        content: `**[SYSTÈME EXEC]** : ${funcResult}`,
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
                content: "Anomalie de liaison Cloud. Le noyau Apex est en mode dégradé.",
                timestamp: Date.now()
            }]);
            audioEngine.play('error');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="flex flex-col h-[700px] bg-slate-900/60 rounded-[3.5rem] border border-white/10 overflow-hidden shadow-2xl relative">
            {/* Header */}
            <div className="p-8 bg-slate-900 border-b border-white/5 flex justify-between items-center z-10">
                <div className="flex items-center gap-4">
                    <div className="p-3 bg-indigo-600 rounded-2xl text-white shadow-lg shadow-indigo-600/20">
                        <Brain size={22} />
                    </div>
                    <div>
                        <h3 className="text-white font-black uppercase text-base tracking-widest">Agent Tactique Apex</h3>
                        <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest flex items-center gap-2">
                             <Activity size={10} className="text-emerald-500"/> Liaison Actionnable Active
                        </p>
                    </div>
                </div>
                <div className="flex gap-2">
                    <div className="px-4 py-2 bg-black/40 rounded-full border border-white/5 text-[9px] font-black text-emerald-400">
                        GEMINI_3_PRO_ACTIVE
                    </div>
                </div>
            </div>

            {/* Chat Area */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-8 space-y-6 custom-scrollbar scroll-smooth">
                {messages.length === 0 && (
                    <div className="h-full flex flex-col items-center justify-center text-center space-y-8 opacity-20">
                        <div className="relative">
                            <Sparkles size={80} className="text-indigo-500 animate-pulse" />
                            <div className="absolute inset-0 bg-indigo-500 blur-[60px] opacity-20"></div>
                        </div>
                        <div className="space-y-3">
                            <p className="text-lg font-black uppercase tracking-[0.4em] text-slate-300">Terminal d'Inférence</p>
                            <p className="text-xs max-w-xs mx-auto font-medium">L'IA Apex peut analyser vos stratégies et exécuter des commandes pour vous.</p>
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
                                    <span className="text-[10px] font-black uppercase tracking-widest">
                                        {msg.role === 'assistant' ? 'Agent Apex' : 'Opérateur'}
                                    </span>
                                </div>
                                <div className="text-sm md:text-base leading-relaxed font-medium">
                                    <SafeMarkdown text={msg.content} />
                                </div>
                            </div>
                        </motion.div>
                    ))}
                </AnimatePresence>

                {isLoading && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex justify-start">
                        <div className="bg-slate-800 p-6 rounded-[2.5rem] rounded-tl-none border border-white/5 shadow-xl flex items-center gap-4">
                            <RefreshCw size={18} className="animate-spin text-emerald-400" />
                            <span className="text-xs font-black text-slate-400 uppercase tracking-widest animate-pulse">Décodage synaptique...</span>
                        </div>
                    </motion.div>
                )}
            </div>

            {/* Input Area */}
            <div className="p-8 bg-slate-900 border-t border-white/10">
                <div className="flex gap-4 items-center bg-black/40 p-2 pl-8 rounded-[3rem] border border-white/10 focus-within:border-indigo-500/50 transition-all shadow-inner">
                    <Terminal size={20} className="text-slate-500" />
                    <input 
                        type="text" 
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                        placeholder="Demander une analyse ou un ticket à l'Agent..."
                        className="flex-1 bg-transparent border-none text-white text-sm py-5 outline-none placeholder-slate-600 font-bold"
                    />
                    <button 
                        onClick={handleSend}
                        disabled={!input.trim() || isLoading}
                        className="p-5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-full transition-all active:scale-90 disabled:opacity-30 shadow-xl shadow-indigo-900/40"
                    >
                        <Send size={20} />
                    </button>
                </div>
            </div>
        </div>
    );
};