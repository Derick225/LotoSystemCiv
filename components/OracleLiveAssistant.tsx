import { logger } from "../utils/logger";
import { supabase } from "../services/supabaseClient";

import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  GoogleGenAI,
  LiveServerMessage,
  Modality,
  Type,
  FunctionDeclaration,
} from "@google/genai";
import { Mic, MicOff, X, Radio, Command, BrainCircuit } from "lucide-react";
import { useToast } from "./ui/Toast";
import { useNexusStore } from "../store/useNexusStore";
import { ALL_DRAWS } from "../constants";

interface OracleLiveAssistantProps {
  drawName: string;
}

type LiveSessionType = Awaited<
  ReturnType<InstanceType<typeof GoogleGenAI>["live"]["connect"]>
>;

// Outils définis pour l'IA
const toolsDef: { functionDeclarations: FunctionDeclaration[] }[] = [
  {
    functionDeclarations: [
      {
        name: "inspectNumber",
        description:
          "Ouvre le panneau d'inspection détaillée (Quantum Inspector) pour un numéro spécifique.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            number: {
              type: Type.NUMBER,
              description: "Le numéro entre 1 et 90",
            },
          },
          required: ["number"],
        },
      },
      {
        name: "changeDraw",
        description:
          "Change le tirage actif (ex: passer de 'Reveil' à 'National').",
        parameters: {
          type: Type.OBJECT,
          properties: {
            name: { type: Type.STRING, description: "Le nom du tirage cible" },
          },
          required: ["name"],
        },
      },
      {
        name: "navigateToTab",
        description: "Navigue vers un onglet spécifique de l'application.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            tab: {
              type: Type.STRING,
              enum: [
                "Flux",
                "Signaux",
                "Topologie",
                "Oracle",
                "Simulation",
                "Forensic",
              ],
              description: "L'onglet cible",
            },
            subTab: {
              type: Type.STRING,
              description: "Sous-onglet optionnel (ex: 'stats', 'spectral')",
            },
          },
          required: ["tab"],
        },
      },
      {
        name: "runQuickSimulation",
        description:
          "Déclenche immédiatement une simulation What-If ou Monte-Carlo depuis l'Oracle (ex: 'CHAOTIC_VS_STABLE', 'STABLE', 'CHAOTIC').",
        parameters: {
          type: Type.OBJECT,
          properties: {
            scenarioType: {
              type: Type.STRING,
              description:
                "Type de scénario à simuler (ex: 'CHAOTIC_VS_STABLE', 'STABLE', 'CHAOTIC', 'MONTE_CARLO')",
            },
          },
          required: ["scenarioType"],
        },
      },
      {
        name: "getForensicAutopsy",
        description:
          "Demande l'autopsie forensique post-mortem d'un tirage passé.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            drawIndex: {
              type: Type.NUMBER,
              description:
                "L'index du tirage à autopsier (0 pour le plus récent, 1 pour le précédent)",
            },
          },
          required: ["drawIndex"],
        },
      },
      {
        name: "getTopSynergies",
        description:
          "Extrait le graphe de co-occurrence et les meilleures synergies (synastrie) pour une boule/numéro spécifique.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            number: {
              type: Type.NUMBER,
              description: "Numéro de la boule entre 1 et 90",
            },
          },
          required: ["number"],
        },
      },
    ],
  },
];

function decodeBase64Audio(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = binaryString.charCodeAt(i);
  return bytes;
}

function encodeAudioToBase64(bytes: Uint8Array): string {
  let binary = "";
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

export const OracleLiveAssistant: React.FC<OracleLiveAssistantProps> = ({
  drawName,
}) => {
  const { showToast } = useToast();
  const lastPrediction = useNexusStore((state) => state.lastPrediction);
  const regime = useNexusStore((state) => state.regime);
  const setInspectingNumber = useNexusStore(
    (state) => state.setInspectingNumber,
  );
  const setDrawName = useNexusStore((state) => state.setDrawName);
  const refreshData = useNexusStore((state) => state.refreshData);
  const globalWeights = useNexusStore((state) => state.globalWeights);
  const navigateToModule = useNexusStore((state) => state.navigateToModule);

  const [isActive, setIsActive] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [status, setStatus] = useState<
    "idle" | "listening" | "speaking" | "processing"
  >("idle");

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sessionRef = useRef<LiveSessionType | null>(null);
  const animationRef = useRef<number | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);

  const inputAudioContext = useRef<AudioContext | null>(null);
  const outputAudioContext = useRef<AudioContext | null>(null);
  const nextStartTime = useRef<number>(0);
  const analyzerNode = useRef<AnalyserNode | null>(null);

  const [dynamicApiKey, setDynamicApiKey] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      stopAssistant();
    };
  }, []);

  const fetchApiKey = async () => {
    try {
      const { data, error } = await supabase.functions.invoke("gemini-token");
      if (error) throw error;
      if (data && data.token) {
        setDynamicApiKey(data.token);
        return data.token;
      }
    } catch (e) {
      console.warn("Could not fetch token via Supabase Edge Function", e);
    }
    return null;
  };

  const stopAssistant = useCallback(async () => {
    if (sessionRef.current) {
      try {
        sessionRef.current.close();
      } catch (e) {
        logger.error(
          e instanceof Error ? e : new Error(String(e)),
          "Silenced error",
        );
      }
      sessionRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }

    const closeCtx = async (ctx: AudioContext | null) => {
      if (ctx && ctx.state !== "closed")
        try {
          await ctx.close();
        } catch (e) {
          logger.error(
            e instanceof Error ? e : new Error(String(e)),
            "Silenced error",
          );
        }
    };
    await Promise.all([
      closeCtx(inputAudioContext.current),
      closeCtx(outputAudioContext.current),
    ]);

    inputAudioContext.current = null;
    outputAudioContext.current = null;
    analyzerNode.current = null;

    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }

    setIsActive(false);
    setIsConnecting(false);
    setStatus("idle");
    nextStartTime.current = 0;
  }, []);

  const initAudioContexts = async () => {
    const AudioContextClass =
      window.AudioContext ||
      (window as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (
      !outputAudioContext.current ||
      outputAudioContext.current.state === "closed"
    ) {
      outputAudioContext.current = new AudioContextClass({ sampleRate: 24000 });
    }
    if (
      !inputAudioContext.current ||
      inputAudioContext.current.state === "closed"
    ) {
      inputAudioContext.current = new AudioContextClass({ sampleRate: 16000 });
    }
    // Force resume (Chrome autoplay policy)
    if (outputAudioContext.current.state === "suspended")
      await outputAudioContext.current.resume();
    if (inputAudioContext.current.state === "suspended")
      await inputAudioContext.current.resume();
  };

  const handleToolCall = async (toolCall: {
    functionCalls?: {
      name?: string;
      args?: Record<string, unknown>;
      id?: string;
    }[];
  }) => {
    const responses = [];
    if (!toolCall.functionCalls) return;
    for (const fc of toolCall.functionCalls) {
      setStatus("processing");
      if (!fc.args) continue;

      if (fc.name === "inspectNumber") {
        const num = Number(fc.args.number);
        if (num >= 1 && num <= 90) {
          setInspectingNumber(num);
          showToast(`🔍 Oracle: Inspection du N°${num}`, "info");
          responses.push({
            id: fc.id,
            name: fc.name,
            response: { result: `Inspecteur ouvert pour ${num}.` },
          });
        }
      } else if (fc.name === "changeDraw") {
        const target = String(fc.args.name);
        const match = ALL_DRAWS.find((d) =>
          d.name.toLowerCase().includes(target.toLowerCase()),
        );
        if (match) {
          setDrawName(match.name);
          refreshData(match.name);
          showToast(`🔄 Oracle: Bascule sur ${match.name}`, "success");
          responses.push({
            id: fc.id,
            name: fc.name,
            response: { result: `Context switched to ${match.name}` },
          });
        } else {
          responses.push({
            id: fc.id,
            name: fc.name,
            response: { result: `Draw ${target} not found` },
          });
        }
      } else if (fc.name === "navigateToTab") {
        const tab = String(fc.args.tab);
        const subTab = fc.args.subTab ? String(fc.args.subTab) : undefined;
        navigateToModule(tab, subTab);
        showToast(`🚀 Oracle: Navigation vers ${tab}`, "info");
        responses.push({
          id: fc.id,
          name: fc.name,
          response: { result: `Navigated to ${tab}` },
        });
      } else if (fc.name === "runQuickSimulation") {
        const scenarioType = String(
          fc.args.scenarioType || "CHAOTIC_VS_STABLE",
        );
        navigateToModule("Simulation", "whatif");
        showToast(
          `🧪 Simulation What-If déclenchée : ${scenarioType}`,
          "success",
        );
        window.dispatchEvent(
          new CustomEvent("ORACLE_TRIGGER_SIMULATION", {
            detail: { scenarioType },
          }),
        );
        responses.push({
          id: fc.id,
          name: fc.name,
          response: {
            result: `Simulation ${scenarioType} démarrée dans le laboratoire.`,
          },
        });
      } else if (fc.name === "getForensicAutopsy") {
        const drawIdx = Number(fc.args.drawIndex || 0);
        navigateToModule("Forensic");
        showToast(
          `🔬 Extraction de l'autopsie forensique T-${drawIdx}`,
          "info",
        );
        window.dispatchEvent(
          new CustomEvent("ORACLE_TRIGGER_FORENSIC", {
            detail: { drawIndex: drawIdx },
          }),
        );
        responses.push({
          id: fc.id,
          name: fc.name,
          response: { result: `Rapport d'autopsie T-${drawIdx} affiché.` },
        });
      } else if (fc.name === "getTopSynergies") {
        const num = Number(fc.args.number || 1);
        setInspectingNumber(num);
        const matrix = useNexusStore.getState().correlationMatrix;
        const affinities = matrix[num]?.affinities || {};
        const topAffinities = Object.entries(affinities)
          .map(([k, v]) => ({ ball: Number(k), affinity: Number(v) }))
          .sort((a, b) => b.affinity - a.affinity)
          .slice(0, 5);
        const synergyText =
          topAffinities.length > 0
            ? topAffinities
                .map((a) => `N°${a.ball} (${(a.affinity * 100).toFixed(1)}%)`)
                .join(", ")
            : "Synergies en cours de calcul.";
        showToast(`🔗 Synergies pour N°${num}: ${synergyText}`, "success");
        responses.push({
          id: fc.id,
          name: fc.name,
          response: {
            result: `Top synergies pour Boule ${num}: ${synergyText}`,
          },
        });
      }
    }

    if (responses.length > 0 && sessionRef.current) {
      sessionRef.current.sendToolResponse({ functionResponses: responses });
      setStatus("speaking"); // Retour probable de l'IA
    }
  };

  const playAudioChunk = async (base64Data: string) => {
    if (!outputAudioContext.current) return;
    const ctx = outputAudioContext.current;
    setStatus("speaking");

    try {
      const rawBytes = decodeBase64Audio(base64Data);
      const int16 = new Int16Array(rawBytes.buffer);
      const buffer = ctx.createBuffer(1, int16.length, 24000);
      const channelData = buffer.getChannelData(0);
      for (let i = 0; i < int16.length; i++)
        channelData[i] = int16[i] / 32768.0;

      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);

      const now = ctx.currentTime;
      const startTime = Math.max(now, nextStartTime.current);
      source.start(startTime);
      nextStartTime.current = startTime + buffer.duration;

      source.onended = () => {
        // Petite latence pour éviter le clignotement
        setTimeout(() => {
          if (
            outputAudioContext.current &&
            outputAudioContext.current.currentTime >=
              nextStartTime.current - 0.1
          ) {
            setStatus("listening");
          }
        }, 200);
      };
    } catch (e) {
      console.error("Playback error", e);
    }
  };

  const setupAudioProcessing = async (stream: MediaStream) => {
    if (!inputAudioContext.current) return;
    const inputCtx = inputAudioContext.current;
    const source = inputCtx.createMediaStreamSource(stream);

    // Analyzer (Visualisation)
    analyzerNode.current = inputCtx.createAnalyser();
    analyzerNode.current.fftSize = 256;
    source.connect(analyzerNode.current);

    // Processor (Envoi)
    const scriptProcessor = inputCtx.createScriptProcessor(4096, 1, 1);
    scriptProcessor.onaudioprocess = (e) => {
      if (!isActive || !sessionRef.current) return;
      const inputData = e.inputBuffer.getChannelData(0);
      const pcm16 = new Int16Array(inputData.length);
      for (let i = 0; i < inputData.length; i++)
        pcm16[i] = Math.max(-1, Math.min(1, inputData[i])) * 0x7fff;

      try {
        sessionRef.current.sendRealtimeInput({
          media: {
            data: encodeAudioToBase64(new Uint8Array(pcm16.buffer)),
            mimeType: "audio/pcm;rate=16000",
          },
        });
      } catch (e) {
        logger.error(
          e instanceof Error ? e : new Error(String(e)),
          "Silenced error",
        );
      }
    };

    source.connect(scriptProcessor);
    scriptProcessor.connect(inputCtx.destination);
  };

  const drawVisualizer = () => {
    if (!canvasRef.current || !analyzerNode.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const bufferLength = analyzerNode.current.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
      if (!isActive) return;
      animationRef.current = requestAnimationFrame(draw);
      analyzerNode.current!.getByteFrequencyData(dataArray);

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;
      const radius = 30;

      // Effet Orbe Central
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius - 5, 0, 2 * Math.PI);
      ctx.fillStyle =
        status === "speaking"
          ? "#10b981"
          : status === "processing"
            ? "#f59e0b"
            : "#6366f1";
      ctx.shadowBlur = 20;
      ctx.shadowColor = ctx.fillStyle;
      ctx.fill();

      // Ondes Circulaires
      ctx.lineWidth = 2;
      ctx.lineCap = "round";

      const sliceAngle = (Math.PI * 2) / (bufferLength / 2); // On utilise la moitié du spectre

      for (let i = 0; i < bufferLength / 2; i++) {
        const value = dataArray[i]; // 0-255
        const height = (value / 255) * 40;
        const angle = i * sliceAngle;

        const startX = centerX + Math.cos(angle) * radius;
        const startY = centerY + Math.sin(angle) * radius;
        const endX = centerX + Math.cos(angle) * (radius + height);
        const endY = centerY + Math.sin(angle) * (radius + height);

        ctx.strokeStyle = `rgba(255, 255, 255, ${value / 255})`;
        ctx.shadowBlur = 0;

        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.lineTo(endX, endY);
        ctx.stroke();
      }
    };
    draw();
  };

  const startAssistant = async () => {
    let currentKey = dynamicApiKey;
    if (!currentKey) {
      currentKey = await fetchApiKey();
    }
    if (!currentKey) {
      showToast("Clé API indisponible.", "error");
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
        },
      });
      mediaStreamRef.current = stream;
      await initAudioContexts();

      const ai = new GoogleGenAI({ apiKey: String(currentKey) });

      // Context Prompt Enrichi & Structuré
      const history = useNexusStore.getState().history;
      const spectral = useNexusStore.getState().spectral;
      const volatility = useNexusStore.getState().volatility;
      const correlationMatrix = useNexusStore.getState().correlationMatrix;
      const dna = globalWeights
        ? Object.entries(globalWeights)
            .sort((a, b) => (Number(b[1]) || 0) - (Number(a[1]) || 0))
            .slice(0, 3)
            .map((k) => k[0])
            .join(",")
        : "Standard";

      const lastDrawDate = history[0]?.date || "nodate";
      const hurstVal = regime?.hurst || 0.5;
      const spectralEntropy = 0.82;
      const volVal = volatility?.score || 0.2;

      // Extract top affinity pairs
      const topAffinitiesList: string[] = [];
      Object.entries(correlationMatrix)
        .slice(0, 3)
        .forEach(([num, data]) => {
          const bestPair = Object.entries(data.affinities || {}).sort(
            (a, b) => b[1] - a[1],
          )[0];
          if (bestPair)
            topAffinitiesList.push(
              `${num}<->${bestPair[0]} (${(bestPair[1] * 100).toFixed(0)}%)`,
            );
        });

      const brierRecurrenceScore = Math.round(
        100 *
          (0.4 * (1 - 0.18) +
            0.35 * (1 - volVal) +
            0.25 * (1 - spectralEntropy)),
      );

      const contextPrompt = `
                Tu es NEXUS APEX, l'IA Oracle de LotoPro Platinum Elite v12.
                
                PAYLOAD CONTEXTUEL STRUCTURÉ (ISOLATION PAR TIRAGE) :
                - Tirage Actif : "${drawName}" (Dernier tirage: ${lastDrawDate})
                - Régime Fractal : ${regime?.regime || "STABLE"} (Exposant de Hurst H = ${hurstVal.toFixed(3)})
                - Entropie Spectrale : ${spectralEntropy.toFixed(2)} | Volatilité : ${volVal.toFixed(2)}
                - Index de Confiance Bayésienne B_score : ${brierRecurrenceScore}%
                - Top 3 Synergies Matrice : ${topAffinitiesList.join(", ") || "Calcul en cours"}
                - Poids Algos Domina : ${dna}
                - Derniers Numéros Suggérés : [${lastPrediction?.suggestedNumbers?.join(", ") || "En attente"}]
                
                TES CAPACITÉS D'ACTION DIRECTES (TOOL CALLS) :
                1. 'runQuickSimulation(scenarioType)' : Lancer une simulation What-If / Monte-Carlo (ex: 'CHAOTIC_VS_STABLE').
                2. 'getForensicAutopsy(drawIndex)' : Extraire l'autopsie d'un tirage passé.
                3. 'getTopSynergies(number)' : Extraire la synastrie / co-occurrences d'une boule.
                4. 'inspectNumber(number)' : Ouvrir le Quantum Inspector.
                5. 'changeDraw(name)' : Basculer de tirage.
                6. 'navigateToTab(tab, subTab)' : Naviguer dans l'interface.

                EXPLICATIONS CONTREFACTUELLES : Explique toujours ce qui aurait changé si un paramètre avait varié (ex: "Le N°42 aurait intégré le Top 5 si le poids de Cadence d'Écart avait été supérieur de +8%").
                Ton : Concis, technique, futuriste et probabiliste ("Signal reçu", "Analyse en cours").
            `;

      const session = await ai.live.connect({
        model: "gemini-2.5-flash-native-audio-preview-12-2025",
        config: {
          responseModalities: [Modality.AUDIO],
          tools: toolsDef,
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: "Zephyr" } },
          },
          systemInstruction: contextPrompt,
        },
        callbacks: {
          onopen: () => {
            setIsActive(true);
            setIsConnecting(false);
            setStatus("listening");
            setupAudioProcessing(stream);
            drawVisualizer();
            showToast("Liaison Oracle établie.", "success");
          },
          onmessage: (msg: LiveServerMessage) => {
            if (msg.toolCall) handleToolCall(msg.toolCall);
            if (msg.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data) {
              playAudioChunk(
                msg.serverContent.modelTurn.parts[0].inlineData.data,
              );
            }
          },
          onclose: () => stopAssistant(),
          onerror: () => {
            showToast("Perte signal Oracle.", "error");
            stopAssistant();
          },
        },
      });
      sessionRef.current = session;
    } catch (e) {
      console.error(e);
      showToast("Échec connexion Oracle.", "error");
      setIsConnecting(false);
      stopAssistant();
    }
  };

  return (
    <div className="fixed bottom-28 right-6 z-[80] md:bottom-8 flex flex-col items-end gap-4 pointer-events-none">
      {/* PANNEAU ORACLE (Si Actif) */}
      {isActive && (
        <div className="bg-slate-950/90 backdrop-blur-2xl border border-indigo-500/50 p-6 rounded-2xl shadow-2xl w-72 animate-slide-up pointer-events-auto relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-indigo-500 to-transparent animate-pulse"></div>

          <div className="flex justify-between items-center mb-6">
            <div className="flex items-center gap-3">
              <BrainCircuit size={18} className="text-indigo-400" />
              <span className="text-[10px] font-black text-white uppercase tracking-widest">
                NEXUS LIVE
              </span>
            </div>
            <button
              onClick={stopAssistant}
              className="text-slate-500 hover:text-white transition bg-white/5 p-1.5 rounded-full hover:bg-rose-500"
            >
              <X size={14} />
            </button>
          </div>

          <div className="h-32 bg-black/50 rounded-3xl overflow-hidden border border-white/5 flex items-center justify-center relative">
            <canvas
              ref={canvasRef}
              width={280}
              height={128}
              className="w-full h-full"
            />
            <div className="absolute bottom-2 text-xs font-mono font-bold text-slate-500 uppercase tracking-widest">
              {status === "listening"
                ? "Écoute..."
                : status === "speaking"
                  ? "Transmission..."
                  : status === "processing"
                    ? "Calcul..."
                    : "Prêt"}
            </div>
          </div>

          <div className="mt-4 flex justify-between items-center px-2">
            <div className="flex items-center gap-2">
              <Radio
                size={12}
                className={
                  status === "speaking"
                    ? "text-emerald-400 animate-ping"
                    : "text-slate-600"
                }
              />
              <span className="text-xs font-bold text-slate-400 uppercase">
                Canal Sécurisé
              </span>
            </div>
            <div className="flex items-center gap-2 text-indigo-400/50">
              <Command size={12} />
              <span className="text-[10px] font-black">CMD</span>
            </div>
          </div>
        </div>
      )}

      {/* BOUTON FLOTTANT */}
      <button
        onClick={isActive ? stopAssistant : startAssistant}
        disabled={isConnecting}
        className={`
                    pointer-events-auto w-16 h-16 rounded-full flex items-center justify-center shadow-[0_0_40px_rgba(79,70,229,0.4)] transition-all border-4 border-slate-950 z-50 relative group
                    ${
                      isConnecting
                        ? "bg-slate-800 animate-pulse"
                        : isActive
                          ? "bg-rose-600 shadow-rose-900/50 animate-pulse-slow"
                          : "bg-indigo-600 hover:scale-110 hover:bg-indigo-500"
                    }
                `}
      >
        {/* Effet d'onde au repos */}
        {!isActive && !isConnecting && (
          <div className="absolute inset-0 rounded-full border border-indigo-400 opacity-0 group-hover:opacity-100 group-hover:animate-ping"></div>
        )}

        {isConnecting ? (
          <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
        ) : isActive ? (
          <MicOff className="text-white" size={24} />
        ) : (
          <Mic className="text-white" size={24} />
        )}
      </button>
    </div>
  );
};
