
import React, { useState, useEffect } from 'react';
import { generateAbbreviatedWheel, generateFullWheel } from '../../services/combinatoricsService';
import { calculateACValue } from '../../services/mathService';
import { runAntColonyOptimization } from '../../services/acoService';
import { getUniqueSortedNumbers } from '../../utils/arrayUtils';
import { saveTicket } from '../../services/userPreferencesService';
import { useToast } from '../ui/Toast';
import { useNexus } from '../NexusProvider';
import { Calculator, Zap, Ghost, Terminal, Network, Edit3, Cpu, Save } from 'lucide-react';
import type { AntColonyPath } from '../../types';
import { TicketXRay } from '../TicketXRay';
import { PatternSequencer } from '../PatternSequencer';

interface CombinationsTabProps { drawName: string; }

interface GeneratedTicket {
    id: string;
    numbers: number[];
    nexusScore: number;
    sum: number;
    ac: number;
    parity: string;
}

export const CombinationsTab: React.FC<CombinationsTabProps> = ({ drawName }) => {
    const { showToast } = useToast();
    const { history, spectral, vocalContext, globalWeights } = useNexus();
    
    // Mode Switcher
    const [mode, setMode] = useState<'auto' | 'manual'>('auto');

    // Auto Inputs & Config
    const [inputs, setInputs] = useState<string[]>(Array(12).fill('')); 
    const [bankers, setBankers] = useState<number[]>([]); // Bankers non implémentés graphiquement pour l'instant, mais la logique est prête
    const [systemType, setSystemType] = useState<'full' | 'reduced'>('reduced');
    const [guarantee, setGuarantee] = useState<3 | 4 | 5>(3);
    
    // Filters
    const [minSum, setMinSum] = useState(100);
    const [maxSum, setMaxSum] = useState(250);
    const [useHarmonicFilter, setUseHarmonicFilter] = useState(true);
    
    // State
    const [generatedTickets, setGeneratedTickets] = useState<GeneratedTicket[]>([]);
    const [acoPaths, setAcoPaths] = useState<AntColonyPath[]>([]);
    const [isGenerating, setIsGenerating] = useState(false);
    const [genProgress, setGenProgress] = useState(0);
    const [logs, setLogs] = useState<string[]>([]);
    const [expandedTicketId, setExpandedTicketId] = useState<string | null>(null);

    // Chargement ACO
    useEffect(() => { 
        if(history.length > 20) loadAco(); 
    }, [drawName, history, vocalContext]);

    const loadAco = async () => {
        try {
            const paths = await runAntColonyOptimization(history, vocalContext);
            setAcoPaths(paths);
        } catch (e) { console.error(e); }
    };

    const addLog = (msg: string) => setLogs(prev => [`> ${msg}`, ...prev].slice(0, 6));

    // --- MOTEUR DE GÉNÉRATION PRINCIPAL ---
    const handleGenerate = async () => {
        const pool = getUniqueSortedNumbers(inputs);
        if (pool.length < 5) { showToast("Min 5 numéros requis dans le pool.", "error"); return; }
        if (minSum >= maxSum) { showToast("Plage de Somme invalide.", "error"); return; }
        
        setIsGenerating(true);
        setLogs(["Initialisation Architecte v2.0..."]);
        setGenProgress(0);
        setGeneratedTickets([]);
        
        try {
            // 1. Génération Brute (Worker-friendly en chunking)
            let baseTickets: number[][] = [];
            if (systemType === 'full') {
                if (pool.length > 14) {
                    showToast("Max 14 numéros pour Système Intégral (Protection Mémoire)", "error");
                    setIsGenerating(false);
                    return;
                }
                baseTickets = generateFullWheel(pool, 5);
            } else {
                baseTickets = generateAbbreviatedWheel(pool, bankers, 5, guarantee);
            }

            addLog(`${baseTickets.length} structures brutes générées.`);
            
            // 2. Préparation du scoring basé sur l'ADN (GlobalWeights)
            const spectralCache: Record<number, number> = {};
            pool.forEach(n => {
                spectralCache[n] = spectral.find(s => s.number === n)?.energy || 0;
            });

            // Poids d'influence pour le scoring
            const wSpectral = (globalWeights.spectral || 0.15) * 4; 
            const wChaos = (globalWeights.ai_intuition || 0.1) * 3; 

            let output: GeneratedTicket[] = [];
            const CHUNK_SIZE = 500; // Traitement par lots pour ne pas figer l'UI

            for (let i = 0; i < baseTickets.length; i += CHUNK_SIZE) {
                const chunk = baseTickets.slice(i, i + CHUNK_SIZE);
                
                const processedChunk = chunk.map(t => {
                    // A. Filtre Somme (Hard Filter)
                    const sum = t.reduce((a,b) => a+b, 0);
                    if (sum < minSum || sum > maxSum) return null;

                    // B. Filtre Harmonique (Moyenne spectrale)
                    const avgEnergy = t.reduce((acc, n) => acc + (spectralCache[n] || 0), 0) / 5;
                    if (useHarmonicFilter && avgEnergy < 30) return null; // Rejeter les combinaisons "froides"

                    // C. Calcul des Métriques
                    const ac = calculateACValue(t);
                    const odds = t.filter(n => n % 2 !== 0).length;
                    
                    // D. Scoring Nexus (0-100)
                    // Combine Énergie Spectrale + Complexité AC + Équilibre Parité
                    let nexusScore = (avgEnergy * wSpectral) + (ac * 10 * wChaos);
                    if (odds === 2 || odds === 3) nexusScore += 20; // Bonus parité équilibrée
                    
                    nexusScore = Math.min(100, Math.round(nexusScore / (wSpectral + wChaos + 0.5)));

                    return {
                        id: crypto.randomUUID(),
                        numbers: t,
                        nexusScore,
                        sum,
                        ac,
                        parity: `${odds}I/${5-odds}P`
                    } as GeneratedTicket;
                }).filter((t): t is GeneratedTicket => t !== null);

                output = [...output, ...processedChunk];
                setGenProgress(Math.round(((i + CHUNK_SIZE) / baseTickets.length) * 100));
                
                // Pause pour laisser respirer l'event loop
                await new Promise(resolve => requestAnimationFrame(resolve));
            }

            // 3. Tri final par score Nexus
            output.sort((a, b) => b.nexusScore - a.nexusScore);
            setGeneratedTickets(output);
            
            addLog(`Génération terminée : ${output.length} tickets optimisés.`);
            showToast(`${output.length} tickets générés et classés par pertinence ADN.`, "success");

        } catch (e: any) { 
            console.error(e);
            showToast("Erreur critique : " + e.message, "error"); 
        } finally { 
            setIsGenerating(false); 
            setGenProgress(100);
        }
    };

    const handleSaveTicket = async (t: GeneratedTicket) => {
        await saveTicket({
            numbers: t.numbers,
            drawName: drawName,
            strategy: `Architecte v2 (Score ${t.nexusScore})`
        });
        showToast("Ticket sauvegardé.", "success");
    };

    return (
        <div className="space-y-8 animate-fade-in pb-24 w-full overflow-hidden">
            {/* Mode Toggle */}
            <div className="flex justify-center mb-4">
                <div className="bg-slate-900 p-1 rounded-2xl border border-slate-800 flex shadow-lg">
                    <button 
                        onClick={() => setMode('auto')} 
                        className={`px-6 py-3 rounded-xl text-[10px] font-black uppercase flex items-center gap-2 transition-all ${mode === 'auto' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:text-white'}`}
                    >
                        <Zap size={14}/> Générateur Auto
                    </button>
                    <button 
                        onClick={() => setMode('manual')} 
                        className={`px-6 py-3 rounded-xl text-[10px] font-black uppercase flex items-center gap-2 transition-all ${mode === 'manual' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:text-white'}`}
                    >
                        <Edit3 size={14}/> Séquenceur Manuel
                    </button>
                </div>
            </div>

            {mode === 'manual' ? (
                <PatternSequencer drawName={drawName} />
            ) : (
                <>
                    {/* Header / Console */}
                    <div className="bg-slate-900 text-white p-8 rounded-[3.5rem] shadow-2xl border border-slate-800 relative overflow-hidden group">
                        <div className="absolute top-0 right-0 p-12 opacity-5 group-hover:rotate-12 transition-transform duration-700"><Ghost size={140} /></div>
                        
                        <div className="relative z-10 grid lg:grid-cols-3 gap-12">
                            <div className="lg:col-span-2 space-y-6">
                                <div>
                                    <div className="flex items-center gap-3 mb-2">
                                        <div className="p-2 bg-indigo-600 rounded-xl shadow-lg"><Calculator size={18} className="text-white" /></div>
                                        <h3 className="text-sm font-black uppercase tracking-[0.4em] text-indigo-400">Architecte v2.0</h3>
                                    </div>
                                    <h2 className="text-4xl md:text-5xl font-black text-white tracking-tighter">
                                        Studio de <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-purple-400">Synthèse</span>
                                    </h2>
                                    <p className="text-xs text-slate-400 mt-2 font-mono flex items-center gap-2">
                                        <Cpu size={12} className="text-emerald-500"/>
                                        Piloté par l'ADN Neuronal Actif
                                    </p>
                                </div>

                                {/* ACO Suggestions */}
                                <div className="space-y-3">
                                    <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2"><Network size={12}/> Suggestions ACO (Fourmis)</h4>
                                    <div className="flex flex-wrap gap-3">
                                        {acoPaths.slice(0, 3).map((path, i) => (
                                            <button 
                                                key={i} 
                                                onClick={() => setInputs([...path.numbers.map(String), ...Array(7).fill('')].slice(0,12))} 
                                                className="bg-white/5 border border-white/10 px-4 py-2 rounded-xl hover:bg-white/10 transition-all flex items-center gap-2 group"
                                            >
                                                <span className="text-[9px] font-black text-indigo-400">PATH #{i+1}</span>
                                                <div className="flex gap-1">{path.numbers.map(n => <span key={n} className="text-[10px] font-bold text-white">{n}</span>)}</div>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            {/* Console Logs */}
                            <div className="bg-black/40 p-6 rounded-[2.5rem] border border-white/5 flex flex-col justify-between h-full min-h-[180px]">
                                <div className="flex items-center gap-3 mb-4 border-b border-white/5 pb-2">
                                    <Terminal size={14} className="text-emerald-500" />
                                    <span className="text-[9px] font-black uppercase text-slate-500 tracking-widest">Logs Système</span>
                                </div>
                                <div className="space-y-1.5 flex-1 font-mono text-[10px] text-emerald-400/80 overflow-y-auto max-h-[100px] custom-scrollbar">
                                    {logs.map((log, i) => <div key={i} className={i === 0 ? "text-emerald-300 font-bold" : ""}>{log}</div>)}
                                </div>
                                {isGenerating && (
                                    <div className="mt-4">
                                        <div className="h-1 w-full bg-slate-800 rounded-full overflow-hidden">
                                            <div className="h-full bg-indigo-500 transition-all duration-100" style={{width: `${genProgress}%`}}></div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Configuration Panel */}
                    <div className="bg-white dark:bg-slate-800 p-8 rounded-[3rem] border border-slate-100 dark:border-slate-700 shadow-xl">
                        <div className="grid md:grid-cols-2 gap-8">
                            <div className="space-y-4">
                                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Pool de Numéros (Min 5, Max 14 pour Intégral)</h4>
                                <div className="grid grid-cols-6 gap-2">
                                    {inputs.map((val, idx) => (
                                        <input 
                                            key={idx} 
                                            type="number" 
                                            value={val} 
                                            onChange={(e) => { const n = [...inputs]; n[idx] = e.target.value; setInputs(n); }} 
                                            className="w-full aspect-square text-center font-bold bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 focus:border-indigo-500 outline-none text-slate-800 dark:text-white"
                                            placeholder="?"
                                        />
                                    ))}
                                </div>
                            </div>
                            <div className="space-y-6">
                                <div className="flex gap-4">
                                    <div className="flex-1 space-y-2">
                                        <label className="text-[10px] font-black text-slate-400 uppercase">Système</label>
                                        <div className="flex bg-slate-100 dark:bg-slate-900 p-1 rounded-xl">
                                            <button onClick={() => setSystemType('full')} className={`flex-1 py-2 text-[9px] font-bold rounded-lg transition ${systemType === 'full' ? 'bg-white dark:bg-slate-700 shadow text-indigo-600' : 'text-slate-500'}`}>Intégral</button>
                                            <button onClick={() => setSystemType('reduced')} className={`flex-1 py-2 text-[9px] font-bold rounded-lg transition ${systemType === 'reduced' ? 'bg-white dark:bg-slate-700 shadow text-indigo-600' : 'text-slate-500'}`}>Réduit</button>
                                        </div>
                                    </div>
                                    {systemType === 'reduced' && (
                                        <div className="flex-1 space-y-2">
                                            <label className="text-[10px] font-black text-slate-400 uppercase">Garantie</label>
                                            <div className="flex bg-slate-100 dark:bg-slate-900 p-1 rounded-xl">
                                                {[3,4,5].map(g => (
                                                    <button key={g} onClick={() => setGuarantee(g as any)} className={`flex-1 py-2 text-[9px] font-bold rounded-lg transition ${guarantee === g ? 'bg-white dark:bg-slate-700 shadow text-emerald-500' : 'text-slate-500'}`}>{g}/5</button>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                                <button onClick={handleGenerate} disabled={isGenerating} className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl transition-all active:scale-95 disabled:opacity-50">
                                    {isGenerating ? 'Calcul en cours...' : 'Lancer Génération'}
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Results */}
                    {generatedTickets.length > 0 && (
                        <div className="grid gap-4 animate-slide-up">
                            {generatedTickets.slice(0, 50).map(t => (
                                <div key={t.id} onClick={() => setExpandedTicketId(expandedTicketId === t.id ? null : t.id)} className="bg-white dark:bg-slate-800 p-4 rounded-[2rem] border border-slate-100 dark:border-slate-700 shadow-sm cursor-pointer hover:border-indigo-400 transition-all">
                                    <div className="flex justify-between items-center">
                                        <div className="flex items-center gap-3">
                                            <div className={`px-3 py-1 rounded-lg text-[10px] font-black ${t.nexusScore > 80 ? 'bg-emerald-100 text-emerald-700' : 'bg-indigo-50 text-indigo-600'}`}>Score {t.nexusScore}</div>
                                            <div className="flex gap-1">{t.numbers.map(n => <span key={n} className="w-6 h-6 rounded bg-slate-100 dark:bg-slate-900 flex items-center justify-center text-[10px] font-bold text-slate-700 dark:text-slate-300">{n}</span>)}</div>
                                        </div>
                                        <button onClick={(e) => { e.stopPropagation(); handleSaveTicket(t); }} className="p-2 bg-slate-100 dark:bg-slate-700 rounded-full hover:text-indigo-600"><Save size={14}/></button>
                                    </div>
                                    {expandedTicketId === t.id && (
                                        <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-700">
                                            <TicketXRay numbers={t.numbers} score={t.nexusScore} />
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </>
            )}
        </div>
    );
};
