
import React from 'react';
import type { AlgoWeights } from '../types';

interface AlgoRadarProps {
    weights: AlgoWeights;
    previousWeights?: AlgoWeights;
    height?: number; // Gardé pour compatibilité props, mais non utilisé pour la hauteur fixe
}

const LABELS: Record<string, string> = {
    frequency: 'Fréquence (Les habitués)',
    gap: 'Retard (Les absents)',
    spectral: 'Forme du moment',
    fractal: 'Cycles',
    markov: 'Suites Logiques',
    spatial: 'Position',
    momentum: 'Élan',
    equilibrium: 'Équilibre',
    anti_consensus: 'Surprises',
    resistance: 'Résistance'
};

export const AlgoRadar: React.FC<AlgoRadarProps> = ({ weights }) => {
    // On ne garde que les 6 critères les plus importants pour ne pas noyer l'utilisateur
    const importantKeys = ['frequency', 'gap', 'spectral', 'markov', 'anti_consensus', 'equilibrium'];
    
    const data = importantKeys.map(key => ({
        label: LABELS[key] || key,
        value: Math.round((weights[key as keyof AlgoWeights] || 0) * 100)
    })).sort((a, b) => b.value - a.value);

    return (
        <div className="w-full space-y-4">
            {data.map((item, idx) => (
                <div key={idx} className="space-y-1">
                    <div className="flex justify-between items-center text-xs font-bold text-slate-400 uppercase tracking-wider">
                        <span>{item.label}</span>
                        <span className="text-indigo-400">{item.value}%</span>
                    </div>
                    <div className="h-3 w-full bg-slate-800 rounded-full overflow-hidden shadow-inner border border-white/5">
                        <div 
                            className="h-full bg-gradient-to-r from-indigo-600 to-purple-500 rounded-full transition-all duration-1000" 
                            style={{ width: `${Math.min(100, item.value * 3)}%` }} // *3 pour visibilité visuelle accentuée
                        ></div>
                    </div>
                </div>
            ))}
            <p className="text-[10px] text-slate-500 text-center mt-4 italic">
                Ce graphique montre "les ingrédients" utilisés par l'IA pour ce tirage.
            </p>
        </div>
    );
};
