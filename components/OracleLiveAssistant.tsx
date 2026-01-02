
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { Mic, MicOff, X, RefreshCw, Radio, Activity, Waves, Volume2, AlertTriangle } from 'lucide-react';
import { useToast } from './ui/Toast';
import { useNexus } from './NexusProvider';

interface OracleLiveAssistantProps {
    drawName: string;
}

function decodeBase64Audio(base64: string) {
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
}

function encodeAudioToBase64(bytes: Uint8Array) {
    let binary = '';
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

export const OracleLiveAssistant: React.FC<OracleLiveAssistantProps> = ({ drawName }) => {
    const { showToast } = useToast();
    const { lastPrediction, regime, volatility } = useNexus();
    
    const [isActive, setIsActive] = useState(false);
    const [isConnecting, setIsConnecting] = useState(false);
    const [isSpeaking, setIsSpeaking] = useState(false);
    const [hasApiKey, setHasApiKey] = useState(true);
    
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const sessionRef = useRef<any>(null);
    const animationRef = useRef<number | null>(null);

    const inputAudioContext = useRef<AudioContext | null>(null);
    const outputAudioContext = useRef<AudioContext | null>(null);
    const nextStartTime = useRef<number>(0);
    const analyzerNode = useRef<AnalyserNode | null>(null);

    useEffect(() => {
        // Vérification de la clé API au montage
        if (!process.env.API_KEY) {
            setHasApiKey(false);
        }
    }, []);

    const stopAssistant = useCallback(() => {
        if (sessionRef.current) {
            try { sessionRef.current.close(); } catch(e) {}
            sessionRef.current = null;
        }
        if (inputAudioContext.current) inputAudioContext.current.close();
        if (outputAudioContext.current) outputAudioContext.current.close();
        if (animationRef.current) cancelAnimationFrame(animationRef.current);
        
        setIsActive(false);
        setIsConnecting(false);
        setIsSpeaking(false);
        nextStartTime.current = 0;
    }, []);

    const playAudioChunk = async (base64Data: string) => {
        if (!outputAudioContext.current) {
            outputAudioContext.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
        }
        const ctx = outputAudioContext.current;
        const rawBytes = decodeBase64Audio(base64Data);
        const int16 = new Int16Array(rawBytes.buffer);
        
        const buffer = ctx.createBuffer(1, int16.length, 24000);
        const channelData = buffer.getChannelData(0);
        for (let i = 0; i < int16.length; i++) {
            channelData[i] = int16[i] / 32768.0;
        }

        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(ctx.destination);

        const now = ctx.currentTime;
        if (nextStartTime.current < now) nextStartTime.current = now;
        
        source.start(nextStartTime.current);
        nextStartTime.current += buffer.duration;
        
        setIsSpeaking(true);
        source.onended = () => {
            if (ctx.currentTime >= nextStartTime.current - 0.1) setIsSpeaking(false);
        };
    };

    const startAssistant = async () => {
        if (!hasApiKey) {
            showToast("Clé API Gemini manquante (.env)", "error");
            return;
        }
        if (isConnecting) return;
        setIsConnecting(true);

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
            
            const contextPrompt = `Tu es l'Oracle de LotoPro pour le tirage ${drawName}. 
                Contexte actuel: Régime ${regime?.regime || 'Inconnu'}, Volatilité ${volatility?.score || 0}%.
                Prédiction IA: ${lastPrediction?.suggestedNumbers.join(', ') || 'Non disponible'}.
                Réponds de manière technique, mystérieuse et concise. Ne donne jamais de garantie de gain.`;

            const sessionPromise = ai.live.connect({
                model: 'gemini-2.5-flash-native-audio-preview-09-2025',
                config: {
                    responseModalities: [Modality.AUDIO],
                    speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } } },
                    systemInstruction: contextPrompt,
                },
                callbacks: {
                    onopen: () => {
                        setIsActive(true);
                        setIsConnecting(false);
                        
                        inputAudioContext.current = new AudioContext({ sampleRate: 16000 });
                        const source = inputAudioContext.current.createMediaStreamSource(stream);
                        analyzerNode.current = inputAudioContext.current.createAnalyser();
                        analyzerNode.current.fftSize = 64;
                        source.connect(analyzerNode.current);
                        
                        const scriptProcessor = inputAudioContext.current.createScriptProcessor(4096, 1, 1);
                        scriptProcessor.onaudioprocess = (e) => {
                            const inputData = e.inputBuffer.getChannelData(0);
                            const pcm16 = new Int16Array(inputData.length);
                            for (let i = 0; i < inputData.length; i++) {
                                pcm16[i] = Math.max(-1, Math.min(1, inputData[i])) * 0x7FFF;
                            }
                            
                            sessionPromise.then(s => {
                                s.sendRealtimeInput({
                                    media: {
                                        data: encodeAudioToBase64(new Uint8Array(pcm16.buffer)),
                                        mimeType: 'audio/pcm;rate=16000'
                                    }
                                });
                            });
                        };
                        source.connect(scriptProcessor);
                        scriptProcessor.connect(inputAudioContext.current.destination);
                        
                        startVisualizer();
                    },
                    onmessage: (msg: LiveServerMessage) => {
                        const audio = msg.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
                        if (audio) playAudioChunk(audio);
                    },
                    onclose: () => stopAssistant(),
                    onerror: (e) => {
                        console.error(e);
                        showToast("Signal instable avec l'Oracle.", "error");
                        stopAssistant();
                    }
                }
            });
            sessionRef.current = sessionPromise;

        } catch (e) {
            console.error(e);
            showToast("Microphone inaccessible.", "error");
            setIsConnecting(false);
        }
    };

    const startVisualizer = () => {
        if (!canvasRef.current || !analyzerNode.current) return;
        const ctx = canvasRef.current.getContext('2d');
        if (!ctx) return;
        
        const bufferLength = analyzerNode.current.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);

        const draw = () => {
            animationRef.current = requestAnimationFrame(draw);
            analyzerNode.current!.getByteFrequencyData(dataArray);
            
            ctx.clearRect(0, 0, canvasRef.current!.width, canvasRef.current!.height);
            const barWidth = (canvasRef.current!.width / bufferLength) * 2.5;
            let x = 0;
            for(let i = 0; i < bufferLength; i++) {
                const h = (dataArray[i] / 255) * canvasRef.current!.height;
                ctx.fillStyle = isSpeaking ? '#10b981' : '#6366f1';
                ctx.fillRect(x, canvasRef.current!.height - h, barWidth, h);
                x += barWidth + 1;
            }
        };
        draw();
    };

    return (
        <div className="fixed bottom-6 right-6 z-[80] flex flex-col items-end gap-4 pointer-events-none">
            {isActive && (
                <div className="bg-slate-900/95 backdrop-blur-xl border border-indigo-500/50 p-5 rounded-[2.5rem] shadow-2xl w-80 animate-slide-up pointer-events-auto overflow-hidden">
                    <div className="flex justify-between items-center mb-4">
                        <div className="flex items-center gap-3 text-indigo-400">
                            <Radio size={18} className="animate-pulse" />
                            <span className="text-[10px] font-black uppercase tracking-widest">Oracle Live Assist</span>
                        </div>
                        <button onClick={stopAssistant} className="text-slate-500 hover:text-white transition"><X size={16} /></button>
                    </div>
                    
                    <div className="h-24 bg-black/40 rounded-3xl overflow-hidden border border-white/5 flex items-center justify-center p-2">
                        <canvas ref={canvasRef} width={280} height={80} className="w-full h-full" />
                    </div>
                    
                    <div className="mt-4 flex justify-between items-center px-2">
                        <div className="flex items-center gap-2">
                            <Waves size={14} className={isSpeaking ? "text-indigo-400 animate-pulse" : "text-slate-600"} />
                            <span className="text-[9px] font-bold text-slate-500 uppercase">{isSpeaking ? 'Transmission...' : 'Écoute active'}</span>
                        </div>
                        <Activity size={16} className="text-slate-600" />
                    </div>
                </div>
            )}
            
            <button
                onClick={isActive ? stopAssistant : startAssistant}
                disabled={isConnecting || !hasApiKey}
                className={`pointer-events-auto w-16 h-16 rounded-full flex items-center justify-center shadow-2xl transition-all border-4 border-slate-950 z-50 ${
                    !hasApiKey ? 'bg-slate-800 border-rose-500/30' : 
                    isConnecting ? 'bg-slate-700' : 
                    isActive ? 'bg-rose-600 animate-pulse-slow' : 'bg-indigo-600 hover:bg-indigo-500'
                }`}
                title={!hasApiKey ? "Configuration API Requise" : "Oracle Vocal"}
            >
                {!hasApiKey ? <AlertTriangle className="text-rose-500" /> : 
                 isConnecting ? <RefreshCw className="animate-spin text-white" /> : 
                 isActive ? <MicOff className="text-white" /> : <Mic className="text-white" />}
            </button>
        </div>
    );
};
