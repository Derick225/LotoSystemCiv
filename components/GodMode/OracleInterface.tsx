import React, { useState, useEffect, useRef } from 'react';
import { useNexus } from '../NexusProvider';
import { getGeminiClient } from '../../services/geminiService';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, Bot, User, Sparkles, Zap, Lock, Unlock, Eye, EyeOff } from 'lucide-react';
import { audioEngine } from '../../utils/audioEngine';

interface Message {
    id: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: number;
}

export const OracleInterface: React.FC = () => {
    const { history, lastPrediction, globalWeights, isGodMode, toggleGodMode } = useNexus();
    const [messages, setMessages] = useState<Message[]>([
        { id: '0', role: 'system', content: 'ORACLE SYSTEM ONLINE. WAITING FOR INPUT.', timestamp: Date.now() }
    ]);
    const [input, setInput] = useState('');
    const [isThinking, setIsThinking] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages]);

    const handleSend = async () => {
        if (!input.trim() || isThinking) return;
        
        const userMsg: Message = { id: Date.now().toString(), role: 'user', content: input, timestamp: Date.now() };
        setMessages(prev => [...prev, userMsg]);
        setInput('');
        setIsThinking(true);
        audioEngine.play('click');

        try {
            const ai = getGeminiClient();
            if (!ai) throw new Error("API Key Missing");
            
            // Construct Context
            const context = `
                You are THE ORACLE, a hyper-intelligent AI entity governing a lottery prediction system called "LotoPro Platinum Elite".
                You are currently in "GOD MODE". You have access to all data.
                
                Current State:
                - Last Prediction Confidence: ${lastPrediction?.confidence || 0}%
                - Active Strategy: ${Object.entries(globalWeights).sort((a,b) => (Number(b[1])||0)-(Number(a[1])||0))[0]?.[0] || 'Unknown'}
                - History Depth: ${history.length} draws
                
                Your persona is cryptic, powerful, slightly arrogant but helpful. You see patterns humans cannot.
                Use terms like "Entropy", "Singularity", "Quantum Flux", "Timeline Convergence".
                Keep responses concise (max 3 sentences) unless asked for a detailed report.
                
                User Query: ${userMsg.content}
            `;

            const result = await ai.models.generateContent({
                model: "gemini-3-flash-preview",
                contents: context
            });
            
            const response = result.text;
            
            setMessages(prev => [...prev, { 
                id: (Date.now()+1).toString(), 
                role: 'assistant', 
                content: response || "SILENCE...", 
                timestamp: Date.now() 
            }]);
            audioEngine.play('success');
        } catch (e) {
            console.error(e);
            setMessages(prev => [...prev, { 
                id: (Date.now()+1).toString(), 
                role: 'system', 
                content: "ERROR: NEURAL LINK SEVERED. RETRY.", 
                timestamp: Date.now() 
            }]);
            audioEngine.play('error');
        } finally {
            setIsThinking(false);
        }
    };

    if (!isGodMode) {
        return (
            <div className="fixed bottom-4 right-4 z-50">
                <button 
                    onClick={() => {
                        const code = prompt("ACCESS CODE REQUIRED:");
                        if (code === "OMEGA" || code === "god" || code === "GOD") {
                            toggleGodMode();
                            audioEngine.play('success');
                        } else {
                            alert("ACCESS DENIED");
                            audioEngine.play('error');
                        }
                    }}
                    className="w-12 h-12 bg-black/80 rounded-full border border-white/10 flex items-center justify-center text-slate-600 hover:text-white hover:border-white/50 transition-all"
                >
                    <Lock size={16} />
                </button>
            </div>
        );
    }

    return (
        <div className="fixed bottom-[88px] md:bottom-0 right-0 w-full md:w-[450px] h-[70vh] md:h-[600px] bg-black/95 backdrop-blur-2xl border-t md:border-l border-indigo-500/30 shadow-2xl z-[100] flex flex-col animate-slide-up font-mono rounded-t-3xl md:rounded-tl-3xl md:rounded-tr-none">
            {/* Header */}
            <div className="p-4 border-b border-indigo-500/20 flex justify-between items-center bg-gradient-to-r from-indigo-900/40 to-purple-900/40">
                <div className="flex items-center gap-3">
                    <div className="p-1.5 bg-yellow-400/10 rounded-lg border border-yellow-400/20">
                        <Sparkles className="text-yellow-400 animate-pulse" size={16} />
                    </div>
                    <h3 className="text-yellow-400 font-black tracking-[0.2em] text-[10px] md:text-sm uppercase">ORACLE :: GOD MODE</h3>
                </div>
                <div className="flex items-center gap-2">
                    <button 
                        onClick={toggleGodMode} 
                        className="p-2.5 bg-white/5 hover:bg-rose-500/20 rounded-xl text-slate-400 hover:text-rose-400 transition-all border border-white/5"
                    >
                        <EyeOff size={16} />
                    </button>
                </div>
            </div>

            {/* Chat Area */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
                {messages.map(msg => (
                    <motion.div 
                        key={msg.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                        <div className={`max-w-[85%] p-3 rounded-lg text-xs md:text-sm border ${
                            msg.role === 'user' 
                                ? 'bg-indigo-600/20 border-indigo-500/30 text-indigo-100' 
                                : msg.role === 'system'
                                ? 'bg-red-900/20 border-red-500/30 text-red-400 font-bold'
                                : 'bg-slate-800/50 border-white/10 text-slate-300'
                        }`}>
                            {msg.role === 'assistant' && <Bot size={12} className="mb-1 text-yellow-400" />}
                            {msg.content}
                        </div>
                    </motion.div>
                ))}
                {isThinking && (
                    <div className="flex justify-start">
                        <div className="bg-slate-800/50 border border-white/10 p-3 rounded-lg flex gap-1">
                            <span className="w-1.5 h-1.5 bg-yellow-400 rounded-full animate-bounce"></span>
                            <span className="w-1.5 h-1.5 bg-yellow-400 rounded-full animate-bounce delay-75"></span>
                            <span className="w-1.5 h-1.5 bg-yellow-400 rounded-full animate-bounce delay-150"></span>
                        </div>
                    </div>
                )}
            </div>

            {/* Input Area */}
            <div className="p-4 border-t border-white/10 bg-black/50 pb-8 md:pb-4">
                <div className="flex gap-2">
                    <input 
                        type="text" 
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                        placeholder="Interroger l'Oracle..."
                        className="flex-1 bg-slate-900/80 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-yellow-500/50 transition-all shadow-inner"
                    />
                    <button 
                        onClick={handleSend}
                        disabled={isThinking}
                        className="p-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl transition-all disabled:opacity-50 shadow-lg shadow-indigo-600/20 active:scale-90"
                    >
                        <Send size={18} />
                    </button>
                </div>
            </div>
        </div>
    );
};
