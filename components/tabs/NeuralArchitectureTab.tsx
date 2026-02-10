import React, { useEffect, useState, useMemo } from 'react';
import { useNexus } from '../NexusProvider';
import { Network, Activity, Cpu, Zap, Layers, Grid, Share2, RefreshCw } from 'lucide-react';
import { NumberBall } from '../NumberBall';
import { saveTicket } from '../../services/userPreferencesService';
import { useToast } from '../ui/Toast';
import { motion, AnimatePresence } from 'framer-motion';

interface NodeData { 
    id: number; 
    centrality: number; // Importance globale (degré pondéré)
    community: number;  // Groupe d'appartenance
    links: { target: number; strength: number }[]; // Connexions triées
}

const COMMUNITY_COLORS = [
    'border-indigo-500 text-indigo-500', 
    'border-emerald-500 text-emerald-500', 
    'border-rose-500 text-rose-500', 
    'border-amber-500 text-amber-500', 
    'border-violet-500 text-violet-500', 
    'border-cyan-500 text-cyan-500',
];

const COMMUNITY_BG = [
    'bg-indigo-500', 
    'bg-emerald-500', 
    'bg-rose-500', 
    'bg-amber-500', 
    'bg-violet-500', 
    'bg-cyan-500',
];

export const NeuralArchitectureTab: React.FC = () => {
    const { correlationMatrix, drawName, spectral } = useNexus();
    const { showToast } = useToast();
    
    // State
    const [nodes, setNodes] = useState<NodeData[]>([]);
    const [selectedNodeId, setSelectedNodeId] = useState<number | null>(null);
    const [generatedPath, setGeneratedPath] = useState<number[]>([]);
    const [minStrength, setMinStrength] = useState(15); 
    const [isWalking, setIsWalking] = useState(false);

    // --- ANALYSE DES DONNÉES (Construction du Graphe) ---
    useEffect(() => {
        const calculatedNodes: NodeData[] = [];

        for (let i = 1; i <= 90; i++) {
            const affinities = correlationMatrix[i]?.affinities || {};
            const links: { target: number; strength: number }[] = [];
            let degree = 0;

            Object.entries(affinities).forEach(([targetStr, strength]) => {
                const s = Number(strength);
                if (s > 0.05) {
                    links.push({ target: parseInt(targetStr), strength: s });
                    degree += s;
                }
            });

            // Tri des liens par force décroissante
            links.sort((a, b) => b.strength - a.strength);

            // Assignation de communauté basée sur le lien le plus fort
            const primaryLink = links[0]?.target || i;
            const community = primaryLink % 6;

            calculatedNodes.push({
                id: i,
                centrality: degree,
                community,
                links
            });
        }

        setNodes(calculatedNodes);
    }, [correlationMatrix]);

    const selectedNodeData = useMemo(() => 
        nodes.find(n => n.id === selectedNodeId) || null, 
    [nodes, selectedNodeId]);

    // --- ALGORITHME DE MARCHE ALÉATOIRE PONDÉRÉE ---
    const generateNeuralPath = async () => {
        if (!selectedNodeData) return;
        setIsWalking(true);
        setGeneratedPath([]);

        // Simulation visuelle du parcours
        const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

        // 1. Point de départ
        const path = new Set<number>();
        path.add(selectedNodeData.id);
        
        let currentNode = selectedNodeData;
        let steps = 0;
        const MAX_STEPS = 4; // On veut 5 numéros au total (1 + 4)

        while (path.size < 5 && steps < 20) { // Safety break
            await delay(300); // Délai pour l'effet visuel
            
            // 2. Identifier les voisins valides (pas encore dans le path)
            const neighbors = currentNode.links
                .filter(l => !path.has(l.target))
                .map(l => ({ ...l, weight: l.strength * l.strength })); // On accentue les poids (carré)

            let nextId: number;

            if (neighbors.length > 0) {
                // 3. Sélection Roulette Wheel (Probabiliste)
                const totalWeight = neighbors.reduce((sum, n) => sum + n.weight, 0);
                let random = Math.random() * totalWeight;
                
                const selectedNeighbor = neighbors.find(n => {
                    random -= n.weight;
                    return random <= 0;
                }) || neighbors[0]; // Fallback au meilleur

                nextId = selectedNeighbor.target;
            } else {
                // 4. Cul-de-sac : Saut Quantique vers un nœud spectral fort non utilisé
                const availableHighEnergy = spectral
                    .filter(s => !path.has(s.number))
                    .sort((a, b) => b.energy - a.energy)
                    .slice(0, 5);
                
                if (availableHighEnergy.length > 0) {
                    nextId = availableHighEnergy[Math.floor(Math.random() * availableHighEnergy.length)].number;
                } else {
                    // Fallback ultime : aléatoire
                    do {
                        nextId = Math.floor(Math.random() * 90) + 1;
                    } while (path.has(nextId));
                }
            }

            path.add(nextId);
            setGeneratedPath(Array.from(path)); // Mise à jour progressive
            
            const nextNodeObj = nodes.find(n => n.id === nextId);
            if (nextNodeObj) currentNode = nextNodeObj;
            steps++;
        }

        setIsWalking(false);
        showToast("Chemin neuronal tracé.", "success");
    };

    const savePath = async () => {
        if (generatedPath.length < 5) return;
        const sortedPath = [...generatedPath].sort((a, b) => a - b);
        await saveTicket({
            numbers: sortedPath,
            drawName,
            strategy: `Architecture (Source #${selectedNodeId})`
        });
        showToast("Chemin sauvegardé dans le Wallet.", "success");
    };

    // Normalisation pour l'affichage visuel (Opacité/Taille)
    const maxCentrality = Math.max(...nodes.map(n => n.centrality), 1);

    return (
        <div className="space-y-8 animate-fade-in pb-20">
            {/* Header */}
            <div className="bg-slate-900 p-6 rounded-[2.5rem] border border-slate-800 shadow-xl flex flex-col md:flex-row items-center justify-between gap-6">
                <div>
                    <h3 className="text-xl font-black text-white uppercase tracking-tighter flex items-center gap-3">
                        <Network size={24} className="text-indigo-500" /> Matrice Structurelle
                    </h3>
                    <p className="text-xs text-slate-400 mt-1">Cartographie des poids synaptiques & propagation.</p>
                </div>
                
                {/* Stats Globales */}
                <div className="flex gap-4">
                    <div className="bg-black/30 px-4 py-2 rounded-xl border border-white/5 text-center">
                        <div className="text-[9px] font-black text-slate-500 uppercase">Nœuds Actifs</div>
                        <div className="text-lg font-black text-white">{nodes.filter(n => n.centrality > 1).length}</div>
                    </div>
                    <div className="bg-black/30 px-4 py-2 rounded-xl border border-white/5 text-center">
                        <div className="text-[9px] font-black text-slate-500 uppercase">Densité</div>
                        <div className="text-lg font-black text-emerald-400">{(maxCentrality / 5).toFixed(1)}</div>
                    </div>
                </div>
            </div>

            <div className="grid lg:grid-cols-12 gap-8">
                
                {/* GRILLE (Main Visualization) */}
                <div className="lg:col-span-8 bg-white dark:bg-slate-800 p-6 rounded-[3rem] shadow-2xl border border-slate-200 dark:border-slate-700 relative overflow-hidden">
                    <div className="flex justify-between items-center mb-6 px-2">
                        <h4 className="text-xs font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                            <Grid size={14} className="text-indigo-500"/> Carte des Poids
                        </h4>
                        <div className="flex gap-2 text-[9px] font-bold text-slate-400 uppercase">
                            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-slate-200"></span> Faible</span>
                            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-indigo-500"></span> Fort</span>
                        </div>
                    </div>

                    <div className="grid grid-cols-10 gap-2 sm:gap-3">
                        {nodes.map((node) => {
                            const intensity = node.centrality / maxCentrality; // 0 à 1
                            const isSelected = selectedNodeId === node.id;
                            const isInPath = generatedPath.includes(node.id);
                            const isLinked = selectedNodeData?.links.some(l => l.target === node.id && l.strength > (minStrength/100));
                            
                            let bgClass = "bg-slate-50 dark:bg-slate-900 border-slate-100 dark:border-slate-700 text-slate-300";
                            let scaleClass = "scale-100";

                            if (isSelected) {
                                bgClass = "bg-indigo-600 border-indigo-500 text-white shadow-xl z-20";
                                scaleClass = "scale-110";
                            } else if (isInPath) {
                                bgClass = "bg-emerald-500 border-emerald-400 text-white shadow-lg z-20 animate-pulse";
                                scaleClass = "scale-105";
                            } else if (isLinked) {
                                bgClass = "bg-indigo-50 dark:bg-indigo-900/30 border-indigo-200 dark:border-indigo-800 text-indigo-600 dark:text-indigo-300";
                            } else if (intensity > 0.1) {
                                bgClass = `border-2 ${COMMUNITY_COLORS[node.community]} bg-opacity-10`;
                            }

                            return (
                                <button
                                    key={node.id}
                                    onClick={() => { setSelectedNodeId(node.id === selectedNodeId ? null : node.id); setGeneratedPath([]); }}
                                    className={`
                                        aspect-square rounded-xl flex items-center justify-center text-[10px] md:text-xs font-black transition-all duration-300 relative border
                                        ${bgClass} ${scaleClass}
                                    `}
                                    style={(!isSelected && !isLinked && !isInPath && intensity > 0.1) ? { opacity: 0.7 + intensity * 0.3 } : {}}
                                >
                                    {node.id}
                                    {intensity > 0.6 && !isSelected && !isInPath && <div className={`absolute bottom-1 w-1 h-1 rounded-full ${COMMUNITY_BG[node.community]}`}></div>}
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* INSPECTOR (Sidebar) */}
                <div className="lg:col-span-4 flex flex-col gap-6">
                    <div className="bg-slate-950 p-6 rounded-[2.5rem] border border-slate-800 shadow-xl flex-1 flex flex-col h-full min-h-[500px]">
                        <h4 className="text-xs font-black text-indigo-400 uppercase tracking-widest mb-6 flex items-center gap-2">
                            <Activity size={16}/> Inspecteur Neuronal
                        </h4>

                        <AnimatePresence mode="wait">
                            {selectedNodeData ? (
                                <motion.div 
                                    key="details"
                                    initial={{ opacity: 0, x: 20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: -20 }}
                                    className="flex-1 flex flex-col"
                                >
                                    {/* En-tête Nœud */}
                                    <div className="text-center mb-8 relative">
                                        <div className={`absolute inset-0 bg-gradient-to-b ${COMMUNITY_COLORS[selectedNodeData.community].split(' ')[1].replace('text-', 'from-')}/20 to-transparent blur-3xl opacity-30`}></div>
                                        <div className="relative z-10">
                                            <NumberBall number={selectedNodeData.id} size="xl" isAttractor />
                                            <div className="mt-4 flex justify-center gap-4">
                                                <div className="text-center">
                                                    <div className="text-[9px] font-black text-slate-500 uppercase">Masse</div>
                                                    <div className="text-xl font-black text-white">{selectedNodeData.centrality.toFixed(1)}</div>
                                                </div>
                                                <div className="text-center">
                                                    <div className="text-[9px] font-black text-slate-500 uppercase">Tribu</div>
                                                    <div className={`text-xl font-black ${COMMUNITY_COLORS[selectedNodeData.community].split(' ')[1]}`}>#{selectedNodeData.community + 1}</div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Liste Connexions */}
                                    <div className="flex-1 space-y-3 mb-6 overflow-y-auto custom-scrollbar pr-1 max-h-[250px]">
                                        <div className="text-[9px] font-black text-slate-500 uppercase mb-2 flex justify-between">
                                            <span>Liaisons Fortes</span>
                                            <span>Intensité</span>
                                        </div>
                                        {selectedNodeData.links.slice(0, 6).map((link, idx) => (
                                            <div key={idx} className="flex items-center justify-between p-3 rounded-2xl bg-white/5 border border-white/5 hover:bg-white/10 transition-colors">
                                                <div className="flex items-center gap-3">
                                                    <span className="text-[9px] font-bold text-slate-500">#{idx+1}</span>
                                                    <NumberBall number={link.target} size="sm" />
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <div className="w-12 h-1 bg-slate-800 rounded-full overflow-hidden">
                                                        <div className="h-full bg-indigo-500" style={{ width: `${Math.min(100, link.strength * 100)}%` }}></div>
                                                    </div>
                                                    <span className="text-[10px] font-mono text-indigo-300">{Math.round(link.strength * 100)}%</span>
                                                </div>
                                            </div>
                                        ))}
                                        {selectedNodeData.links.length === 0 && (
                                            <div className="text-center text-xs text-slate-500 italic py-4">Nœud isolé (Orphelin)</div>
                                        )}
                                    </div>

                                    <button 
                                        onClick={generateNeuralPath}
                                        disabled={isWalking}
                                        className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl flex items-center justify-center gap-2 transition-all active:scale-95 group disabled:opacity-50"
                                    >
                                        {isWalking ? <RefreshCw className="animate-spin" size={16}/> : <Zap size={16} className="group-hover:text-yellow-300 transition-colors"/>}
                                        {isWalking ? "Propagation..." : "Générer Séquence"}
                                    </button>
                                </motion.div>
                            ) : (
                                <motion.div 
                                    key="empty"
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    className="flex-1 flex flex-col items-center justify-center text-center opacity-40 p-6"
                                >
                                    <Share2 size={64} className="text-slate-600 mb-6 animate-pulse-slow" />
                                    <p className="text-sm font-bold text-slate-400">Sélectionnez un vecteur dans la matrice pour démarrer la propagation.</p>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>

                    {/* Zone de génération */}
                    {generatedPath.length > 0 && (
                        <div className="bg-emerald-900/20 p-6 rounded-[2.5rem] border border-emerald-500/30 animate-slide-up">
                            <div className="flex justify-between items-center mb-4">
                                <h4 className="text-xs font-black text-emerald-400 uppercase tracking-widest flex items-center gap-2">
                                    <Cpu size={14}/> Séquence Dérivée
                                </h4>
                            </div>
                            <div className="flex justify-center gap-2 mb-6">
                                {generatedPath.map(n => <NumberBall key={n} number={n} size="sm" />)}
                            </div>
                            <button 
                                onClick={savePath}
                                className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-black text-[10px] uppercase tracking-widest shadow-lg active:scale-95 transition-all flex items-center justify-center gap-2"
                            >
                                <Layers size={14}/> Sauvegarder
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};