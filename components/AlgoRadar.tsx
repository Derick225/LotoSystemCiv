
import React, { useMemo } from 'react';
import type { AlgoWeights } from '../types';
import { AlgoKey } from '../shared/prediction.types';
import { ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, Legend, Tooltip } from 'recharts';

interface AlgoRadarProps {
    weights: AlgoWeights;
    previousWeights?: AlgoWeights; // Pour la comparaison Avant/Après
    height?: number;
}

const LABELS: Record<string, string> = {
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
    [AlgoKey.SHADOW_PROBABILITY]: 'Probabilité Ombre',
    [AlgoKey.NETWORK_CORRELATION]: 'Corrélation Réseau',
    [AlgoKey.ECHO_STATE]: 'Echo State (ESN)',
    [AlgoKey.GAP_SEQUENCE]: 'Séquence Écart',
    [AlgoKey.DERIVED_NEIGHBOR]: 'Voisin/Miroir/Ombre',
};

export const AlgoRadar: React.FC<AlgoRadarProps> = ({ weights, previousWeights, height = 300 }) => {
    const data = useMemo(() => {
        // On normalise les clés pour l'affichage
        const keys = Object.keys(LABELS) as Array<AlgoKey>;
        
        return keys.map(key => ({
            subject: LABELS[key],
            A: Math.round((weights[key] || 0) * 100), // Valeur Actuelle / Optimisée
            B: previousWeights ? Math.round((previousWeights[key] || 0) * 100) : 0, // Valeur Précédente
            fullMark: 100
        }));
    }, [weights, previousWeights]);

    return (
        <div className="w-full relative" style={{ height: `${height}px` }}>
            <ResponsiveContainer width="100%" height="100%">
                <RadarChart cx="50%" cy="50%" outerRadius="70%" data={data}>
                    <PolarGrid stroke="#334155" strokeDasharray="3 3" />
                    <PolarAngleAxis 
                        dataKey="subject" 
                        tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 'bold' }} 
                    />
                    <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
                    
                    {/* Radar Actuel / Optimisé */}
                    <Radar
                        name={previousWeights ? "Optimisé IA" : "Configuration Actuelle"}
                        dataKey="A"
                        stroke="#818cf8"
                        strokeWidth={3}
                        fill="#818cf8"
                        fillOpacity={previousWeights ? 0.6 : 0.4}
                    />

                    {/* Radar Précédent (Fantôme) pour comparaison */}
                    {previousWeights && (
                        <Radar
                            name="Standard"
                            dataKey="B"
                            stroke="#94a3b8"
                            strokeWidth={2}
                            fill="#94a3b8"
                            fillOpacity={0.1}
                            strokeDasharray="4 4"
                        />
                    )}

                    <Tooltip 
                        contentStyle={{ 
                            backgroundColor: '#0f172a', 
                            border: '1px solid #1e293b', 
                            borderRadius: '12px', 
                            fontSize: '11px', 
                            color: '#fff',
                            boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.5)'
                        }}
                        itemStyle={{ padding: 0 }}
                    />
                    {previousWeights && <Legend wrapperStyle={{ fontSize: '10px', paddingTop: '10px' }} />}
                </RadarChart>
            </ResponsiveContainer>
            
            {!previousWeights && (
                <div className="absolute bottom-0 w-full text-center">
                    <p className="text-xs text-slate-500 italic">
                        Visualisation de l'ADN algorithmique actif.
                    </p>
                </div>
            )}
        </div>
    );
};
