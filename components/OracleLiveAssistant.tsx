
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { Mic, MicOff, X, RefreshCw, Radio, Activity, Waves, AlertTriangle } from 'lucide-react';
import { useToast } from './ui/Toast';
import { useNexus } from './NexusProvider';

interface OracleLiveAssistantProps {
    drawName: string;
}

interface LiveSession {
    sendRealtimeInput: (data: any) => void;
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

export const OracleLiveAssistant: React.FC<OracleLiveAssistantProps> = ({ drawName }) => {
    const { showToast } = useToast();
    const { lastPrediction, regime, volatility } = useNexus();
    
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
        // Output context (24kHz for Gemini)
        if (!outputAudioContext.current || outputAudioContext.current.state === 'closed') {
            if (outputAudioContext.current) await closeAudioContext(outputAudioContext.current);
            outputAudioContext.current = new (window.AudioContext || (window as any).webkitAudioContext)({ 
                sampleRate: 24000 
            });
        }
        if (outputAudioContext.current.state === 'suspended') {
            await outputAudioContext.current.resume();
        }

        // Input context (16kHz for mic)
        if (!inputAudioContext.current || inputAudioContext.current.state === 'closed') {
            if (inputAudioContext.current) await closeAudioContext(inputAudioContext.current);
            inputAudioContext.current = new AudioContext({ sampleRate: 16000 });
        }
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
                // Use requestAnimationFrame pour éviter les race conditions
                requestAnimationFrame(() => {
                    if (!outputAudioContext.current?.currentTime || 
                        outputAudioContext.current.currentTime >= nextStartTime.current - 0.1) {
                        setIsSpeaking(false);
                    }
                });
            };
        } catch (e) {
            console.warn('Error playing audio chunk:', e);
        }
    };

    const setupAudioProcessing = async (stream: MediaStream) => {
        const inputCtx = inputAudioContext.current!;
        
        const source = inputCtx.createMediaStreamSource(stream);
        analyzerNode.current = inputCtx.createAnalyser();
        analyzerNode.current.fftSize = 64;
        source.connect(analyzerNode.current);

        // Utilisation de AudioWorkletNode (moderne) avec fallback ScriptProcessor
        if (inputCtx.createScriptProcessor) {
            const scriptProcessor = inputCtx.createScriptProcessor(4096, 1, 1);
            scriptProcessor.onaudioprocess = (e) => {
                processAudioChunk(e.inputBuffer.getChannelData(0));
            };
            source.connect(scriptProcessor);
            scriptProcessor.connect(inputCtx.destination);
        } else {
            // Fallback pour navigateurs modernes (AudioWorklet requis)
            console.warn('ScriptProcessor déprécié, implémentez AudioWorklet');
        }
    };

    const processAudioChunk = (inputData: Float32Array) => {
        if (!sessionRef.current) return;

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
            console.warn('Error sending audio:', e);
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
                ctx.fillRect(x, canvas.height - h, barWidth, h);
                x += barWidth + 1;
            }
        };
        draw();
    };

    const startAssistant = async () => {
        if (!hasApiKey) {
            showToast("Clé API Gemini manquante (.env)", "error");
            return;
        }
        if (isConnecting || isActive) return;

        setIsConnecting(true);

        try {
            // Get microphone
            const stream = await navigator.mediaDevices.getUserMedia({ 
                audio: {
                    sampleRate: 16000,
                    channelCount: 1,
                    echoCancellation: true,
                    noiseSuppression: true
                } 
            });
            mediaStreamRef.current = stream;

            // Init audio contexts
            await initAudioContexts();

            // Create AI session
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY! });
            
            const contextPrompt = `Tu es l'Oracle de LotoPro pour le tirage ${drawName}. 
                Contexte actuel: Régime ${regime?.regime || 'Inconnu'}, Volatilité ${volatility?.score || 0}%.
                Prédiction IA: ${lastPrediction?.suggestedNumbers?.join(', ') || 'Non disponible'}.
                Réponds de manière technique, mystérieuse et concise.`;

            const session = await ai.live.connect({
                model: 'gemini-2.5-flash-native-audio-preview', 
                config: {
                    responseModalities: [Modality.AUDIO],
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
                        
                        // Setup audio processing
                        setupAudioProcessing(stream);
                        startVisualizer();
                    },
                    onmessage: (msg: LiveServerMessage) => {
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
                        showToast("Signal instable avec l'Oracle.", "error");
                        stopAssistant();
                    }
                }
            });

            sessionRef.current = session;

        } catch (e) {
            console.error('Start assistant error:', e);
            showToast("Microphone inaccessible ou erreur API.", "error");
            setIsConnecting(false);
            // Cleanup on error
            if (mediaStreamRef.current) {
                mediaStreamRef.current.getTracks().forEach(track => track.stop());
                mediaStreamRef.current = null;
            }
        }
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
                        <button 
                            onClick={stopAssistant} 
                            className="text-slate-500 hover:text-white transition p-1 rounded-full hover:bg-slate-800"
                            title="Fermer"
                        >
                            <X size={16} />
                        </button>
                    </div>
                    
                    <div className="h-24 bg-black/40 rounded-3xl overflow-hidden border border-white/5 flex items-center justify-center p-2">
                        <canvas ref={canvasRef} className="w-full h-full" />
                    </div>
                    
                    <div className="mt-4 flex justify-between items-center px-2">
                        <div className="flex items-center gap-2">
                            <Waves 
                                size={14} 
                                className={isSpeaking 
                                    ? "text-indigo-400 animate-pulse" 
                                    : "text-slate-600"
                                } 
                            />
                            <span className="text-[9px] font-bold text-slate-500 uppercase">
                                {isSpeaking ? 'Transmission...' : 'Écoute active'}
                            </span>
                        </div>
                        <Activity size={16} className="text-slate-600" />
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
                        ? 'bg-rose-600 hover:bg-rose-500 animate-pulse-slow' 
                        : 'bg-indigo-600 hover:bg-indigo-500'
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
