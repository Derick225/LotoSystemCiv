
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality, Type, FunctionDeclaration } from '@google/genai';
import { Mic, MicOff, X, RefreshCw, Radio, Activity, Waves, AlertTriangle, Command } from 'lucide-react';
import { useToast } from './ui/Toast';
import { useNexus } from './NexusProvider';

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

// Définition des outils que l'IA peut utiliser
const toolsDef: { functionDeclarations: FunctionDeclaration[] }[] = [{
    functionDeclarations: [{
        name: "inspectNumber",
        description: "Ouvre le panneau d'inspection détaillée (Quantum Inspector) pour un numéro spécifique demandé par l'utilisateur.",
        parameters: {
            type: Type.OBJECT,
            properties: {
                number: { type: Type.NUMBER, description: "Le numéro à analyser (entre 1 et 90)" }
            },
            required: ["number"]
        }
    }]
}];

export const OracleLiveAssistant: React.FC<OracleLiveAssistantProps> = ({ drawName }) => {
    const { showToast } = useToast();
    const { lastPrediction, regime, volatility, setInspectingNumber } = useNexus();
    
    const [isActive, setIsActive] = useState(false);
    const [isConnecting, setIsConnecting] = useState(false);
    const [isSpeaking, setIsSpeaking] = useState(false);
    const [hasApiKey, setHasApiKey] = useState(true);
    
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const sessionRef = useRef<LiveSession | null>(null);
    const animationRef = useRef<number | null>(null);
    const mediaStreamRef = useRef<MediaStream | null>(null);

    const inputAudioContext = useRef<AudioContext | null>(null);
    const outputAudioContext = useRef<AudioContext | null>(null);
    const nextStartTime = useRef<number>(0);
    const analyzerNode = useRef<AnalyserNode | null>(null);

    // Cleanup effect
    useEffect(() => {
        return () => {
            stopAssistant();
        };
    }, []);

    // Check API key
    useEffect(() => {
        if (!process.env.API_KEY) {
            setHasApiKey(false);
        }
    }, []);

    // Resize canvas responsively
    useEffect(() => {
        const resizeCanvas = () => {
            const canvas = canvasRef.current;
            if (canvas) {
                const rect = canvas.getBoundingClientRect();
                canvas.width = rect.width * window.devicePixelRatio;
                canvas.height = rect.height * window.devicePixelRatio;
            }
        };

        window.addEventListener('resize', resizeCanvas);
        resizeCanvas();
        return () => window.removeEventListener('resize', resizeCanvas);
    }, []);

    const closeAudioContext = async (ctx: AudioContext | null) => {
        if (ctx && ctx.state !== 'closed') {
            try {
                await ctx.close();
            } catch (e) {
                console.warn('Error closing AudioContext:', e);
            }
        }
    };

    const initAudioContexts = async () => {
        // Output context (24kHz for Gemini Live)
        if (!outputAudioContext.current || outputAudioContext.current.state === 'closed') {
            outputAudioContext.current = new (window.AudioContext || (window as any).webkitAudioContext)({ 
                sampleRate: 24000 
            });
        }
        
        // Input context (16kHz for mic)
        if (!inputAudioContext.current || inputAudioContext.current.state === 'closed') {
            inputAudioContext.current = new AudioContext({ sampleRate: 16000 });
        }

        // Resume if suspended (browser autoplay policy)
        if (outputAudioContext.current.state === 'suspended') await outputAudioContext.current.resume();
        if (inputAudioContext.current.state === 'suspended') await inputAudioContext.current.resume();
    };

    const stopAssistant = useCallback(async () => {
        // Close session
        if (sessionRef.current) {
            try {
                sessionRef.current.close();
            } catch (e) {
                console.warn('Error closing session:', e);
            }
            sessionRef.current = null;
        }

        // Stop media stream
        if (mediaStreamRef.current) {
            mediaStreamRef.current.getTracks().forEach(track => track.stop());
            mediaStreamRef.current = null;
        }

        // Close audio contexts
        await Promise.all([
            closeAudioContext(inputAudioContext.current),
            closeAudioContext(outputAudioContext.current)
        ]);
        inputAudioContext.current = null;
        outputAudioContext.current = null;

        // Stop animation
        if (animationRef.current) {
            cancelAnimationFrame(animationRef.current);
            animationRef.current = null;
        }

        // Reset states
        setIsActive(false);
        setIsConnecting(false);
        setIsSpeaking(false);
        nextStartTime.current = 0;
        analyzerNode.current = null;
    }, []);

    const playAudioChunk = async (base64Data: string) => {
        const ctx = outputAudioContext.current;
        if (!ctx) return;

        try {
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
            if (nextStartTime.current < now) {
                nextStartTime.current = now;
            }

            source.start(nextStartTime.current);
            nextStartTime.current += buffer.duration;
            
            setIsSpeaking(true);

            source.onended = () => {
                requestAnimationFrame(() => {
                    if (!outputAudioContext.current || outputAudioContext.current.state === 'closed') return;
                    if (outputAudioContext.current.currentTime >= nextStartTime.current - 0.1) {
                        setIsSpeaking(false);
                    }
                });
            };
        } catch (e) {
            console.warn('Error playing audio chunk:', e);
        }
    };

    const setupAudioProcessing = async (stream: MediaStream) => {
        if (!inputAudioContext.current) return;
        const inputCtx = inputAudioContext.current;
        
        const source = inputCtx.createMediaStreamSource(stream);
        analyzerNode.current = inputCtx.createAnalyser();
        analyzerNode.current.fftSize = 64;
        source.connect(analyzerNode.current);

        // Fallback ScriptProcessor (AudioWorklet preferred in prod but keeps single-file simplicity here)
        const scriptProcessor = inputCtx.createScriptProcessor(4096, 1, 1);
        scriptProcessor.onaudioprocess = (e) => {
            if (!isActive) return; // Guard
            processAudioChunk(e.inputBuffer.getChannelData(0));
        };
        source.connect(scriptProcessor);
        scriptProcessor.connect(inputCtx.destination);
    };

    const processAudioChunk = (inputData: Float32Array) => {
        if (!sessionRef.current || !isActive) return;

        const pcm16 = new Int16Array(inputData.length);
        for (let i = 0; i < inputData.length; i++) {
            pcm16[i] = Math.max(-1, Math.min(1, inputData[i])) * 0x7FFF;
        }

        try {
            sessionRef.current.sendRealtimeInput({
                media: {
                    data: encodeAudioToBase64(new Uint8Array(pcm16.buffer)),
                    mimeType: 'audio/pcm;rate=16000'
                }
            });
        } catch (e) {
            // Silent catch to avoid spamming console on disconnect
        }
    };

    const startVisualizer = () => {
        if (!canvasRef.current || !analyzerNode.current) return;
        
        const ctx = canvasRef.current.getContext('2d');
        if (!ctx) return;

        const bufferLength = analyzerNode.current.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);

        const draw = () => {
            if (!canvasRef.current || !analyzerNode.current) return;
            
            animationRef.current = requestAnimationFrame(draw);
            analyzerNode.current!.getByteFrequencyData(dataArray);
            
            const canvas = canvasRef.current;
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            
            const barWidth = (canvas.width / bufferLength) * 2.5;
            let x = 0;
            
            for (let i = 0; i < bufferLength; i++) {
                const h = (dataArray[i] / 255) * canvas.height * 0.8;
                ctx.fillStyle = isSpeaking ? '#10b981' : '#6366f1';
                // Rounded bar top
                ctx.beginPath();
                ctx.roundRect(x, canvas.height - h, barWidth, h, [4, 4, 0, 0]);
                ctx.fill();
                x += barWidth + 2;
            }
        };
        draw();
    };

    const handleToolCall = async (toolCall: any) => {
        const responses = [];
        for (const fc of toolCall.functionCalls) {
            if (fc.name === 'inspectNumber') {
                const num = Number(fc.args.number);
                if (!isNaN(num) && num >= 1 && num <= 90) {
                    setInspectingNumber(num);
                    showToast(`Oracle inspecte le ${num}`, "info");
                    responses.push({
                        id: fc.id,
                        name: fc.name,
                        response: { result: "Inspector opened successfully" }
                    });
                } else {
                    responses.push({
                        id: fc.id,
                        name: fc.name,
                        response: { error: "Invalid number" }
                    });
                }
            }
        }
        
        if (responses.length > 0 && sessionRef.current) {
            sessionRef.current.sendToolResponse({ functionResponses: responses });
        }
    };

    const startAssistant = async () => {
        if (!hasApiKey) {
            showToast("Clé API Gemini manquante (.env)", "error");
            return;
        }
        if (isConnecting || isActive) return;

        setIsConnecting(true);

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ 
                audio: {
                    sampleRate: 16000,
                    channelCount: 1,
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                } 
            });
            mediaStreamRef.current = stream;

            await initAudioContexts();

            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY! });
            
            // Context injection
            const contextPrompt = `Tu es l'Oracle de LotoPro.
                Tirage cible : ${drawName}.
                Régime actuel : ${regime?.regime || 'Inconnu'} (Hurst: ${regime?.hurst.toFixed(2) || '?'}).
                Volatilité : ${volatility?.score || 0}%.
                Prédiction IA : ${lastPrediction?.suggestedNumbers?.join(', ') || 'Non disponible'}.
                
                Rôle: Expert en dynamique stochastique. Tu es mystérieux, précis et professionnel.
                Si l'utilisateur demande d'analyser ou de voir un numéro, utilise l'outil 'inspectNumber'.
                Réponds de manière concise.`;

            // Utilisation du modèle Live dédié
            const session = await ai.live.connect({
                model: 'gemini-2.5-flash-native-audio-preview-12-2025', 
                config: {
                    responseModalities: [Modality.AUDIO],
                    tools: toolsDef,
                    speechConfig: { 
                        voiceConfig: { 
                            prebuiltVoiceConfig: { voiceName: 'Zephyr' } 
                        } 
                    },
                    systemInstruction: contextPrompt,
                },
                callbacks: {
                    onopen: () => {
                        setIsActive(true);
                        setIsConnecting(false);
                        setupAudioProcessing(stream);
                        startVisualizer();
                    },
                    onmessage: (msg: LiveServerMessage) => {
                        if (msg.toolCall) {
                            handleToolCall(msg.toolCall);
                        }
                        const audio = msg.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
                        if (audio) {
                            playAudioChunk(audio);
                        }
                    },
                    onclose: () => {
                        stopAssistant();
                    },
                    onerror: (e) => {
                        console.error('Session error:', e);
                        showToast("Signal perdu avec l'Oracle.", "error");
                        stopAssistant();
                    }
                }
            });

            sessionRef.current = session;

        } catch (e) {
            console.error('Start assistant error:', e);
            showToast("Microphone inaccessible ou erreur API.", "error");
            setIsConnecting(false);
            stopAssistant();
        }
    };

    return (
        <div className="fixed bottom-28 md:bottom-6 right-6 z-[80] flex flex-col items-end gap-4 pointer-events-none">
            {isActive && (
                <div className="bg-slate-900/95 backdrop-blur-xl border border-indigo-500/50 p-5 rounded-[2.5rem] shadow-2xl w-80 animate-slide-up pointer-events-auto overflow-hidden">
                    <div className="flex justify-between items-center mb-4">
                        <div className="flex items-center gap-3 text-indigo-400">
                            <Radio size={18} className="animate-pulse" />
                            <span className="text-[10px] font-black uppercase tracking-widest">Oracle Live Assist</span>
                        </div>
                        <button 
                            onClick={stopAssistant} 
                            className="text-slate-500 hover:text-white transition p-1 rounded-full hover:bg-slate-800"
                            title="Fermer"
                        >
                            <X size={16} />
                        </button>
                    </div>
                    
                    <div className="h-24 bg-black/40 rounded-3xl overflow-hidden border border-white/5 flex items-center justify-center p-2 relative">
                        {/* Status Overlay */}
                        <div className="absolute top-3 left-4 flex gap-1">
                            <div className={`w-1.5 h-1.5 rounded-full ${isSpeaking ? 'bg-emerald-500 animate-pulse' : 'bg-slate-700'}`}></div>
                            <div className="w-1.5 h-1.5 rounded-full bg-slate-700"></div>
                            <div className="w-1.5 h-1.5 rounded-full bg-slate-700"></div>
                        </div>
                        <canvas ref={canvasRef} className="w-full h-full" />
                    </div>
                    
                    <div className="mt-4 flex justify-between items-center px-2">
                        <div className="flex items-center gap-2">
                            <Waves 
                                size={14} 
                                className={isSpeaking 
                                    ? "text-emerald-400 animate-pulse" 
                                    : "text-slate-600"
                                } 
                            />
                            <span className={`text-[9px] font-bold uppercase transition-colors ${isSpeaking ? 'text-emerald-400' : 'text-slate-500'}`}>
                                {isSpeaking ? 'Transmission...' : 'Écoute active'}
                            </span>
                        </div>
                        <div className="flex items-center gap-2 text-indigo-400/50">
                            <Command size={12} />
                            <span className="text-[8px] font-black">CMD ACTIVE</span>
                        </div>
                    </div>
                </div>
            )}
            
            <button
                onClick={isActive ? stopAssistant : startAssistant}
                disabled={isConnecting || !hasApiKey}
                className={`pointer-events-auto w-16 h-16 rounded-full flex items-center justify-center shadow-2xl transition-all border-4 border-slate-950 z-50 ${
                    !hasApiKey 
                        ? 'bg-slate-800 border-rose-500/30 hover:border-rose-500/50' 
                        : isConnecting 
                        ? 'bg-slate-700 animate-pulse' 
                        : isActive 
                        ? 'bg-rose-600 hover:bg-rose-500 animate-pulse-slow shadow-rose-900/50' 
                        : 'bg-indigo-600 hover:bg-indigo-500 hover:scale-105'
                }`}
                title={!hasApiKey ? "Configuration API Requise" : isActive ? "Arrêter l'Oracle" : "Oracle Vocal"}
            >
                {!hasApiKey ? (
                    <AlertTriangle className="text-rose-500 w-6 h-6" size={20} />
                ) : isConnecting ? (
                    <RefreshCw className="animate-spin text-white w-5 h-5" size={20} />
                ) : isActive ? (
                    <MicOff className="text-white w-5 h-5" size={20} />
                ) : (
                    <Mic className="text-white w-5 h-5" size={20} />
                )}
            </button>
        </div>
    );
};
