
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality, Type, FunctionDeclaration } from '@google/genai';
import { Mic, MicOff, X, RefreshCw, Radio, Activity, Waves, AlertTriangle, Command } from 'lucide-react';
import { useToast } from './ui/Toast';
import { useNexus } from './NexusProvider';
import { ALL_DRAWS } from '../constants';

interface OracleLiveAssistantProps {
    drawName: string;
}

interface LiveSession {
    sendRealtimeInput: (data: any) => void;
    sendToolResponse: (data: any) => void;
    close: () => void;
}

function decodeBase64Audio(base64: string): Uint8Array {
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
}

function encodeAudioToBase64(bytes: Uint8Array): string {
    let binary = '';
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

const toolsDef: { functionDeclarations: FunctionDeclaration[] }[] = [{
    functionDeclarations: [
        {
            name: "inspectNumber",
            description: "Ouvre le panneau d'inspection détaillée (Quantum Inspector) pour un numéro spécifique.",
            parameters: {
                type: Type.OBJECT,
                properties: {
                    number: { type: Type.NUMBER, description: "Le numéro entre 1 et 90" }
                },
                required: ["number"]
            }
        },
        {
            name: "changeDraw",
            description: "Change le tirage actif dans l'application.",
            parameters: {
                type: Type.OBJECT,
                properties: {
                    name: { type: Type.STRING, description: "Le nom du tirage (ex: Reveil, National, Monday Special)" }
                },
                required: ["name"]
            }
        },
        {
            name: "navigateToTab",
            description: "Navigue vers un onglet spécifique du système.",
            parameters: {
                type: Type.OBJECT,
                properties: {
                    tab: { type: Type.STRING, enum: ["Flux", "Signaux", "Topologie", "Oracle", "Simulation", "Forensic"], description: "Le nom de l'onglet cible" }
                },
                required: ["tab"]
            }
        }
    ]
}];

export const OracleLiveAssistant: React.FC<OracleLiveAssistantProps> = ({ drawName }) => {
    const { showToast } = useToast();
    const { lastPrediction, regime, setInspectingNumber, setDrawName, refreshData } = useNexus();
    
    const [isActive, setIsActive] = useState(false);
    const [isConnecting, setIsConnecting] = useState(false);
    const [isSpeaking, setIsSpeaking] = useState(false);
    
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const sessionRef = useRef<LiveSession | null>(null);
    const animationRef = useRef<number | null>(null);
    const mediaStreamRef = useRef<MediaStream | null>(null);

    const inputAudioContext = useRef<AudioContext | null>(null);
    const outputAudioContext = useRef<AudioContext | null>(null);
    const nextStartTime = useRef<number>(0);
    const analyzerNode = useRef<AnalyserNode | null>(null);

    // Utilisation de process.env car défini dans vite.config.ts define
    const apiKey = process.env.API_KEY;

    // Cleanup complet au démontage
    useEffect(() => {
        return () => {
            stopAssistant();
        };
    }, []);

    const initAudioContexts = async () => {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        
        if (!outputAudioContext.current || outputAudioContext.current.state === 'closed') {
            outputAudioContext.current = new AudioContextClass({ sampleRate: 24000 });
        }
        if (!inputAudioContext.current || inputAudioContext.current.state === 'closed') {
            inputAudioContext.current = new AudioContextClass({ sampleRate: 16000 });
        }
        
        // Resume necessities for stricter browser policies
        if (outputAudioContext.current.state === 'suspended') await outputAudioContext.current.resume();
        if (inputAudioContext.current.state === 'suspended') await inputAudioContext.current.resume();
    };

    const stopAssistant = useCallback(async () => {
        // 1. Close Session
        if (sessionRef.current) {
            try { sessionRef.current.close(); } catch (e) {}
            sessionRef.current = null;
        }
        
        // 2. Stop Media Tracks (Microphone)
        if (mediaStreamRef.current) {
            mediaStreamRef.current.getTracks().forEach(track => track.stop());
            mediaStreamRef.current = null;
        }
        
        // 3. Close Audio Contexts to release hardware
        const closeCtx = async (ctx: AudioContext | null) => {
            if (ctx && ctx.state !== 'closed') {
                try { await ctx.close(); } catch (e) { console.warn("Context close error", e); }
            }
        };
        
        await Promise.all([
            closeCtx(inputAudioContext.current),
            closeCtx(outputAudioContext.current)
        ]);
        
        inputAudioContext.current = null;
        outputAudioContext.current = null;
        analyzerNode.current = null;

        // 4. Stop Visualizer
        if (animationRef.current) {
            cancelAnimationFrame(animationRef.current);
            animationRef.current = null;
        }

        // 5. Reset State
        setIsActive(false);
        setIsConnecting(false);
        setIsSpeaking(false);
        nextStartTime.current = 0;
    }, []);

    const playAudioChunk = async (base64Data: string) => {
        if (!outputAudioContext.current) return;
        const ctx = outputAudioContext.current;
        
        try {
            const rawBytes = decodeBase64Audio(base64Data);
            // Convert Int16 PCM to Float32
            const int16 = new Int16Array(rawBytes.buffer);
            const buffer = ctx.createBuffer(1, int16.length, 24000);
            const channelData = buffer.getChannelData(0);
            for (let i = 0; i < int16.length; i++) { channelData[i] = int16[i] / 32768.0; }
            
            const source = ctx.createBufferSource();
            source.buffer = buffer;
            source.connect(ctx.destination);
            
            const now = ctx.currentTime;
            // Scheduling pour éviter les gaps
            const startTime = Math.max(now, nextStartTime.current);
            source.start(startTime);
            nextStartTime.current = startTime + buffer.duration;
            
            setIsSpeaking(true);
            source.onended = () => {
                // Petite latence pour éviter le clignotement
                setTimeout(() => {
                    if (outputAudioContext.current && outputAudioContext.current.currentTime >= nextStartTime.current - 0.1) {
                        setIsSpeaking(false);
                    }
                }, 100);
            };
        } catch (e) {
            console.error("Playback error", e);
        }
    };

    const setupAudioProcessing = async (stream: MediaStream) => {
        if (!inputAudioContext.current) return;
        const inputCtx = inputAudioContext.current;
        
        const source = inputCtx.createMediaStreamSource(stream);
        
        // Analyzer pour la visualisation
        analyzerNode.current = inputCtx.createAnalyser();
        analyzerNode.current.fftSize = 64;
        source.connect(analyzerNode.current);
        
        // Processor pour l'envoi à l'API
        const scriptProcessor = inputCtx.createScriptProcessor(4096, 1, 1);
        scriptProcessor.onaudioprocess = (e) => {
            if (!isActive || !sessionRef.current) return;
            const inputData = e.inputBuffer.getChannelData(0);
            
            // Downsampling simple et conversion PCM16
            const pcm16 = new Int16Array(inputData.length);
            for (let i = 0; i < inputData.length; i++) { 
                pcm16[i] = Math.max(-1, Math.min(1, inputData[i])) * 0x7FFF; 
            }
            
            try {
                sessionRef.current.sendRealtimeInput({
                    media: { data: encodeAudioToBase64(new Uint8Array(pcm16.buffer)), mimeType: 'audio/pcm;rate=16000' }
                });
            } catch (err) {
                // Ignore send errors if session closed abruptly
            }
        };
        
        source.connect(scriptProcessor);
        scriptProcessor.connect(inputCtx.destination); // Nécessaire pour que onaudioprocess tire
    };

    const handleToolCall = async (toolCall: any) => {
        const responses = [];
        for (const fc of toolCall.functionCalls) {
            if (fc.name === 'inspectNumber') {
                const num = Number(fc.args.number);
                if (num >= 1 && num <= 90) {
                    setInspectingNumber(num);
                    showToast(`Analyse du N°${num}`, "info");
                    responses.push({ id: fc.id, name: fc.name, response: { result: "Inspector opened" } });
                }
            } else if (fc.name === 'changeDraw') {
                const target = String(fc.args.name);
                const match = ALL_DRAWS.find(d => d.name.toLowerCase().includes(target.toLowerCase()));
                if (match) {
                    setDrawName(match.name);
                    refreshData(match.name);
                    showToast(`Bascule vers ${match.name}`, "success");
                    responses.push({ id: fc.id, name: fc.name, response: { result: `Switched to ${match.name}` } });
                }
            } else if (fc.name === 'navigateToTab') {
                const tab = String(fc.args.tab);
                window.dispatchEvent(new CustomEvent('NAVIGATE_TO_MODULE', { detail: { mainTab: tab } }));
                showToast(`Ouverture : ${tab}`, "info");
                responses.push({ id: fc.id, name: fc.name, response: { result: `Navigated to ${tab}` } });
            }
        }
        if (responses.length > 0 && sessionRef.current) {
            sessionRef.current.sendToolResponse({ functionResponses: responses });
        }
    };

    const startAssistant = async () => {
        if (!apiKey) {
            showToast("Clé API manquante.", "error");
            return;
        }
        if (isConnecting || isActive) return;
        
        setIsConnecting(true);
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ 
                audio: { sampleRate: 16000, channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } 
            });
            mediaStreamRef.current = stream;
            
            await initAudioContexts();
            
            const ai = new GoogleGenAI({ apiKey });
            const contextPrompt = `Tu es l'Oracle de LotoPro. Tirage: ${drawName}. Régime: ${regime?.regime || 'Inconnu'}. Prédiction: ${lastPrediction?.suggestedNumbers?.join(', ') || 'Aucune'}. Sois bref et concis.`;

            const session = await ai.live.connect({
                model: 'gemini-2.5-flash-native-audio-preview-12-2025', 
                config: {
                    responseModalities: [Modality.AUDIO],
                    tools: toolsDef,
                    speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } } },
                    systemInstruction: contextPrompt,
                },
                callbacks: {
                    onopen: () => { 
                        setIsActive(true); 
                        setIsConnecting(false); 
                        setupAudioProcessing(stream); 
                        // Start visualizer loop
                        const draw = () => {
                            if (!canvasRef.current || !analyzerNode.current) return;
                            animationRef.current = requestAnimationFrame(draw);
                            const bufferLength = analyzerNode.current.frequencyBinCount;
                            const dataArray = new Uint8Array(bufferLength);
                            analyzerNode.current.getByteFrequencyData(dataArray);
                            
                            const ctx = canvasRef.current.getContext('2d');
                            if(!ctx) return;
                            
                            ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
                            const barWidth = (canvasRef.current.width / bufferLength) * 2.5;
                            let x = 0;
                            for (let i = 0; i < bufferLength; i++) {
                                const h = (dataArray[i] / 255) * canvasRef.current.height * 0.8;
                                ctx.fillStyle = isSpeaking ? '#10b981' : '#6366f1';
                                ctx.beginPath();
                                ctx.roundRect(x, canvasRef.current.height - h, barWidth, h, [4, 4, 0, 0]);
                                ctx.fill();
                                x += barWidth + 2;
                            }
                        };
                        draw();
                    },
                    onmessage: (msg: LiveServerMessage) => {
                        if (msg.toolCall) handleToolCall(msg.toolCall);
                        const audio = msg.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
                        if (audio) playAudioChunk(audio);
                    },
                    onclose: () => stopAssistant(),
                    onerror: () => { showToast("Signal Oracle perdu.", "error"); stopAssistant(); }
                }
            });
            sessionRef.current = session;
        } catch (e) {
            console.error(e);
            showToast("Erreur connexion Oracle.", "error");
            setIsConnecting(false);
            stopAssistant();
        }
    };

    return (
        <div className="fixed bottom-32 right-6 z-[80] flex flex-col items-end gap-4 pointer-events-none md:bottom-6">
            {isActive && (
                <div className="bg-slate-900/95 backdrop-blur-xl border border-indigo-500/50 p-5 rounded-[2.5rem] shadow-2xl w-80 animate-slide-up pointer-events-auto overflow-hidden mb-4">
                    <div className="flex justify-between items-center mb-4">
                        <div className="flex items-center gap-3 text-indigo-400">
                            <Radio size={18} className="animate-pulse" />
                            <span className="text-[10px] font-black uppercase tracking-widest">Oracle Live Assist</span>
                        </div>
                        <button onClick={stopAssistant} className="text-slate-500 hover:text-white transition p-1 rounded-full hover:bg-slate-800"><X size={16} /></button>
                    </div>
                    <div className="h-24 bg-black/40 rounded-3xl overflow-hidden border border-white/5 flex items-center justify-center p-2">
                        <canvas ref={canvasRef} className="w-full h-full" />
                    </div>
                    <div className="mt-4 flex justify-between items-center px-2">
                        <div className="flex items-center gap-2">
                            <Waves size={14} className={isSpeaking ? "text-emerald-400 animate-pulse" : "text-slate-600"} />
                            <span className={`text-[9px] font-bold uppercase ${isSpeaking ? 'text-emerald-400' : 'text-slate-500'}`}>{isSpeaking ? 'Transmission...' : 'Écoute active'}</span>
                        </div>
                        <div className="flex items-center gap-2 text-indigo-400/50"><Command size={12} /><span className="text-[8px] font-black">NAV ACTIVE</span></div>
                    </div>
                </div>
            )}
            <button
                onClick={isActive ? stopAssistant : startAssistant}
                disabled={isConnecting || !apiKey}
                className={`pointer-events-auto w-16 h-16 rounded-full flex items-center justify-center shadow-2xl transition-all border-4 border-slate-950 z-50 ${!apiKey ? 'bg-slate-800 border-rose-500/30' : isConnecting ? 'bg-slate-700 animate-pulse' : isActive ? 'bg-rose-600 shadow-rose-900/50 animate-pulse-slow' : 'bg-indigo-600 hover:scale-105'}`}
            >
                {!apiKey ? <AlertTriangle className="text-rose-500" size={20} /> : isConnecting ? <RefreshCw className="animate-spin text-white" size={20} /> : isActive ? <MicOff className="text-white" size={20} /> : <Mic className="text-white" size={20} />}
            </button>
        </div>
    );
};
