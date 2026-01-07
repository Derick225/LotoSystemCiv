
import React from 'react';
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer, Tooltip } from 'recharts';
import type { AlgoWeights } from '../types';

interface AlgoRadarProps {
    weights: AlgoWeights;
    previousWeights?: AlgoWeights;
    height?: number;
}

const LABELS: Record<string, string> = {
    frequency: 'Fréquence',
    gap: 'Écart',
    spectral: 'Spectral',
    fractal: 'Fractal',
    markov: 'Markov',
    spatial: 'Spatiale',
    momentum: 'Momentum',
    equilibrium: 'Équilibre',
    association: 'Associatif',
    bayes: 'Bayes',
    orchestration: 'Orchestr.',
    transformer: 'Transform.',
    spectral_energy: 'Énergie Spectrale',
    temporal: 'Temporelle',
    ai_intuition: 'Intuition',
    digital_root: 'Racine',
    gap_velocity: 'Vélocité',
    poisson: 'Poisson',
    leader_succession: 'Succession',
    wavelet: 'Ondelette',
    resistance: 'Résistance',
    anti_consensus: 'Anti-Favori' // NOUVEAU
};

const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
        const current = payload.find((p: any) => p.dataKey === 'A');
        const valCurrent = current ? current.value : 0;
        return (
            <div className="bg-gray-900/95 border border-gray-700 p-3 rounded-lg shadow-xl text-xs backdrop-blur-sm">
                <p className="font-bold text-gray-200 mb-1 border-b border-gray-700 pb-1">{label}</p>
                <div className="flex justify-between gap-4 text-indigo-300 font-bold">
                    <span>Intensité :</span>
                    <span className="font-mono">{valCurrent}%</span>
                </div>
            </div>
        );
    }
    return null;
};

export const AlgoRadar: React.FC<AlgoRadarProps> = ({ weights, previousWeights, height = 250 }) => {
    const keys = Object.keys(weights) as Array<keyof AlgoWeights>;
    const data = keys.map(key => ({
        subject: LABELS[key] || key,
        A: Math.round((weights[key] || 0) * 100),
        B: previousWeights?.[key] !== undefined ? Math.round(previousWeights[key]! * 100) : 0,
        fullMark: 100
    }));

    return (
        <div className="w-full relative" style={{ height: `${height}px` }}>
            <ResponsiveContainer width="100%" height="100%">
                <RadarChart cx="50%" cy="50%" outerRadius="70%" data={data}>
                    <PolarGrid stroke="#e5e7eb" strokeOpacity={0.2} />
                    <PolarAngleAxis 
                        dataKey="subject" 
                        tick={{ fill: '#94a3b8', fontSize: 8, fontWeight: 'bold' }} 
                    />
                    <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
                    {previousWeights && (
                        <Radar name="Référence" dataKey="B" stroke="#64748b" strokeWidth={1} fill="#64748b" fillOpacity={0.1} strokeDasharray="4 4" />
                    )}
                    <Radar name="Actuel" dataKey="A" stroke="#6366f1" strokeWidth={2} fill="#6366f1" fillOpacity={0.5} />
                    <Tooltip content={<CustomTooltip />} />
                </RadarChart>
            </ResponsiveContainer>
        </div>
    );
};