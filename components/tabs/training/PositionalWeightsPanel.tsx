import React from 'react';
import { RefreshCw, Map as MapIcon, Sliders } from 'lucide-react';
import { AlgoKey } from '../../../shared/prediction.types';

const LABELS: Record<AlgoKey, string> = {
    [AlgoKey.FREQUENCY]: 'Fréquence',
    [AlgoKey.GAPS]: 'Écart',
    [AlgoKey.SPECTRAL]: 'Spectral',
    [AlgoKey.MARKOV]: 'Markov',
    [AlgoKey.BAYES]: 'Bayes',
    [AlgoKey.MOMENTUM]: 'Momentum',
    [AlgoKey.AFFINITY]: 'Affinité',
    [AlgoKey.SPATIAL]: 'Spatial',
    [AlgoKey.TEMPORAL]: 'Temporel',
    [AlgoKey.FRACTAL]: 'Fractal',
    [AlgoKey.EQUILIBRIUM]: 'Équilibre',
    [AlgoKey.SHADOW_PROBABILITY]: 'Probabilité Ombre',
    [AlgoKey.NETWORK_CORRELATION]: 'Corrélation Réseau',
    [AlgoKey.ANTI_CONSENSUS]: 'Anti-Consensus',
    [AlgoKey.DECADE_PATTERN]: 'Analyse Décennies',
    [AlgoKey.ECHO_STATE]: 'Echo State (ESN)',
    [AlgoKey.GAP_SEQUENCE]: 'Séquence Écart',
    [AlgoKey.DERIVED_NEIGHBOR]: 'Voisin/Miroir/Ombre'
};

interface PositionalWeightsPanelProps {
    selectedPosition: number;
    setSelectedPosition: (pos: number) => void;
    calculatingPositional: boolean;
    positionalProfiles: Record<number, Record<AlgoKey, number>>;
}

export const PositionalWeightsPanel: React.FC<PositionalWeightsPanelProps> = ({
    selectedPosition,
    setSelectedPosition,
    calculatingPositional,
    positionalProfiles
}) => {
    const currentPosDNA = positionalProfiles[selectedPosition] || {};

    return (
        <div className="bg-[#05091a]/85 border border-slate-800/80 p-6 rounded-2xl shadow-xl relative overflow-hidden min-w-0">
            <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/5 rounded-full blur-2xl pointer-events-none"></div>
            
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                <div>
                    <h4 className="text-[10px] font-black uppercase tracking-wider text-indigo-400">Empreinte Dimensionnelle</h4>
                    <h3 className="text-base font-black text-white flex items-center gap-2">
                        <MapIcon className="text-slate-500" size={16}/> Profil ADN par Boule Cible
                    </h3>
                </div>
                
                <div className="flex bg-slate-900/80 border border-slate-800 rounded-lg overflow-hidden">
                    {[0, 1, 2, 3, 4].map(pos => (
                        <button
                            key={pos}
                            onClick={() => setSelectedPosition(pos)}
                            className={`px-4 py-2 text-[10px] font-bold transition-all cursor-pointer ${selectedPosition === pos ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:text-white hover:bg-slate-800'}`}
                        >
                            Boule {pos + 1}
                        </button>
                    ))}
                </div>
            </div>

            {calculatingPositional ? (
                <div className="h-48 flex items-center justify-center text-slate-500 text-[10px] uppercase font-bold tracking-widest gap-2">
                    <RefreshCw className="animate-spin text-indigo-500" size={14} /> Extraction des profils...
                </div>
            ) : Object.keys(currentPosDNA).length > 0 ? (
                <div className="grid md:grid-cols-2 gap-4">
                    {Object.keys(currentPosDNA)
                        .sort((a,b) => currentPosDNA[b as AlgoKey] - currentPosDNA[a as AlgoKey])
                        .slice(0, 14)
                        .map((key) => {
                            const weightVal = currentPosDNA[key as AlgoKey] || 0;
                            const percentage = (weightVal * 100).toFixed(1);
                            const isDominant = weightVal > 1.2 / Object.keys(currentPosDNA).length;
                            const label = LABELS[key as AlgoKey] || key;
                            
                            return (
                                <div key={key} className="bg-black/30 p-3 rounded-xl border border-white/5 flex flex-col justify-between hover:border-slate-800 transition-all">
                                    <div className="flex justify-between items-center text-[10px] mb-2">
                                        <span className={`font-bold uppercase tracking-wider ${isDominant ? 'text-indigo-400' : 'text-slate-500'}`}>
                                            {label}
                                        </span>
                                        <span className={`font-black ${isDominant ? 'text-white' : 'text-slate-600'}`}>
                                            {percentage}%
                                        </span>
                                    </div>
                                    <div className="h-1 bg-slate-900 rounded-full overflow-hidden">
                                        <div 
                                            className={`h-full rounded-full ${isDominant ? 'bg-indigo-500' : 'bg-slate-700'}`} 
                                            style={{ width: `${percentage}%` }}
                                        />
                                    </div>
                                </div>
                            );
                        })}
                </div>
            ) : (
                <div className="h-48 flex items-center justify-center border border-dashed border-slate-800 rounded-2xl text-slate-600 text-[10px] font-bold uppercase tracking-widest">
                    Veuillez lancer une optimisation préalable.
                </div>
            )}
            
            {/* Info Card explaining positional DNA matrix benefits */}
            <div className="mt-6 p-5 bg-indigo-950/20 rounded-2xl border border-indigo-900/40">
                <p className="text-[10px] text-indigo-300 leading-relaxed font-semibold mb-2 flex items-center gap-2">
                    <Sliders size={12} /> CIBLAGE DES COMPORTEMENTS SPATIAUX
                </p>
                <p className="text-[10px] text-slate-400 leading-relaxed">
                    Les tirages ne sont pas homogènes. La Boule 1 privilégie souvent les basses fréquences et l'équilibre, tandis que la Boule 5 peut présenter une volatilité asymétrique et répondre plus fortement aux algorithmes de Momentum ou Fractals. Le moteur d'inférence adapte le spectre ADN en temps réel lors du décodage de la matrice d'opportunité en fonction du placement ciblé.
                </p>
            </div>
        </div>
    );
};
