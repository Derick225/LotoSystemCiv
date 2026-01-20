
import React, { useState } from 'react';
import { 
    BookOpen, Zap, Activity, Layers, Target, 
    Sparkles, Binary, Waves, GraduationCap, 
    ShieldCheck, Lightbulb, ArrowRight, TrendingUp,
    Compass, Microscope, ChevronRight, PlayCircle
} from 'lucide-react';
import { audioEngine } from '../../utils/audioEngine';

interface Lesson {
    id: string;
    title: string;
    icon: React.ReactNode;
    desc: string;
    tip: string;
    impact: string;
    difficulty: "Débutant" | "Intermédiaire" | "Expert";
    content: string;
}

export const AcademyTab: React.FC = () => {
    const [selectedLesson, setSelectedLesson] = useState<Lesson | null>(null);

    const navigateTo = (tab: string, subTab?: string) => {
        audioEngine.play('click');
        window.dispatchEvent(new CustomEvent('NAVIGATE_TO_MODULE', { 
            detail: { mainTab: tab, subTab } 
        }));
    };

    const lessons: Lesson[] = [
        {
            id: "spectral",
            title: "Énergie Spectrale (FFT)",
            icon: <Waves className="text-purple-500" />,
            desc: "Mesure la 'vibration' d'un numéro. Une énergie haute indique qu'un numéro suit un cycle régulier.",
            tip: "Ciblez les énergies > 70% pour des bases solides.",
            impact: "Élevé",
            difficulty: "Intermédiaire",
            content: "L'analyse spectrale décompose le flux de tirages en fréquences. Si un numéro sort à intervalles réguliers, il crée une onde de résonance. Plus l'onde est propre, plus la probabilité de sortie au prochain cycle est calculable."
        },
        {
            id: "hurst",
            title: "Exposant de Hurst",
            icon: <Layers className="text-emerald-500" />,
            desc: "Détermine si le jeu a de la 'mémoire'. Tendance persistante ou retour à la moyenne.",
            tip: "En régime 'Persistant', jouez les favoris. En 'Anti-persistant', jouez les écarts.",
            impact: "Critique",
            difficulty: "Expert",
            content: "Le coefficient de Hurst (H) varie de 0 à 1. H > 0.5 indique un système persistant (les tendances se maintiennent). H < 0.5 indique un système anti-persistant (le hasard cherche à compenser immédiatement)."
        },
        {
            id: "entropy",
            title: "Entropie de Shannon",
            icon: <Activity className="text-rose-500" />,
            desc: "Niveau de chaos du flux. Une entropie basse signifie que des patterns prévisibles se forment.",
            tip: "Plus l'entropie est basse, plus l'Oracle est précis.",
            impact: "Moyen",
            difficulty: "Expert",
            content: "L'entropie mesure le désordre. Dans un loto parfait, l'entropie est maximale. Mais les machines physiques et les cycles humains créent des 'poches' de basse entropie que Nexus exploite."
        },
        {
            id: "ac",
            title: "Complexité AC",
            icon: <Binary className="text-indigo-500" />,
            desc: "Score mesurant la structure d'une grille. Un score bas signifie que les numéros sont trop 'simples'.",
            tip: "Évitez les tickets avec un AC < 7, ils sortent statistiquement moins souvent.",
            impact: "Sécurité",
            difficulty: "Débutant",
            content: "La complexité arithmétique (AC) analyse les différences entre les numéros d'un ticket. Un tirage réel est rarement une suite simple (ex: 1, 2, 3). L'IA cherche des combinaisons à haute complexité structurelle."
        }
    ];

    return (
        <div className="space-y-10 animate-fade-in pb-24 w-full overflow-hidden">
            {/* Hero Section */}
            <div className="bg-slate-900 border border-slate-800 p-8 md:p-12 rounded-[3rem] md:rounded-[4rem] shadow-2xl relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:scale-110 transition-transform duration-1000">
                    <GraduationCap size={160} className="text-indigo-500"/>
                </div>
                <div className="relative z-10 max-w-3xl">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="p-2 bg-indigo-500/20 rounded-xl">
                            <Sparkles className="text-indigo-400" size={20} />
                        </div>
                        <span className="text-xs font-black uppercase tracking-[0.4em] text-indigo-400">Master Class Intelligence</span>
                    </div>
                    <h2 className="text-4xl md:text-6xl font-black text-white uppercase tracking-tighter mb-6 leading-none">
                        Nexus <span className="text-indigo-500">Academy</span>
                    </h2>
                    <p className="text-slate-400 text-sm md:text-lg font-medium leading-relaxed">
                        Bienvenue dans le centre d'instruction Nexus. Apprenez à décoder les signaux stochastiques pour transformer le hasard brut en probabilités exploitables par l'IA.
                    </p>
                </div>
            </div>

            {/* Core Concepts Grid */}
            <div className="grid md:grid-cols-2 gap-6 md:gap-8">
                {lessons.map((c, i) => (
                    <div 
                        key={c.id} 
                        className="bg-white dark:bg-slate-800 p-8 rounded-[2.5rem] border border-slate-100 dark:border-slate-700 shadow-sm hover:border-indigo-500 transition-all group flex flex-col cursor-help"
                        onClick={() => { audioEngine.play('click'); setSelectedLesson(c); }}
                    >
                        <div className="flex justify-between items-start mb-8">
                            <div className="p-4 bg-slate-50 dark:bg-slate-900 rounded-2xl group-hover:scale-110 transition-transform shadow-inner border border-slate-100 dark:border-slate-800">
                                {c.icon}
                            </div>
                            <div className="flex flex-col items-end gap-1">
                                <span className="text-[8px] font-black uppercase text-slate-400 tracking-widest">Difficulté</span>
                                <span className={`text-[10px] font-bold ${c.difficulty === 'Expert' ? 'text-rose-500' : 'text-slate-600 dark:text-slate-300'}`}>{c.difficulty}</span>
                            </div>
                        </div>
                        
                        <h3 className="font-black text-slate-800 dark:text-white uppercase tracking-tight text-lg mb-4">{c.title}</h3>
                        <p className="text-xs md:text-sm text-slate-500 dark:text-slate-400 leading-relaxed mb-8 flex-1">
                            {c.desc}
                        </p>
                        
                        <div className="mt-auto space-y-4">
                            <div className="p-4 bg-indigo-50 dark:bg-indigo-900/30 rounded-2xl border border-indigo-100 dark:border-indigo-800 flex gap-3 items-start">
                                <Lightbulb size={16} className="text-indigo-500 shrink-0 mt-0.5" />
                                <p className="text-[10px] text-indigo-700 dark:text-indigo-300 font-bold italic leading-tight">
                                    {c.tip}
                                </p>
                            </div>
                            <div className="flex justify-between items-center text-[9px] font-black uppercase tracking-widest text-slate-400 px-2">
                                <span>Impact : {c.impact}</span>
                                <div className="flex items-center gap-1 text-indigo-500 group-hover:gap-2 transition-all">
                                    <span>Explorer</span>
                                    <ArrowRight size={12} />
                                </div>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Strategy Guide Section */}
            <div className="bg-white dark:bg-slate-800 rounded-[3rem] border border-slate-100 dark:border-slate-700 shadow-xl overflow-hidden">
                <div className="p-8 md:p-12 border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/20">
                    <h3 className="text-xl md:text-2xl font-black text-slate-800 dark:text-white uppercase flex items-center gap-4">
                        <Compass className="text-indigo-600" /> Guide Stratégique Rapide
                    </h3>
                </div>
                <div className="grid md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-slate-100 dark:divide-slate-700">
                    <div className="p-8 space-y-4 hover:bg-slate-50 dark:hover:bg-slate-900/30 transition-colors">
                        <div className="w-10 h-10 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 rounded-xl flex items-center justify-center">
                            <TrendingUp size={20} />
                        </div>
                        <h4 className="font-black text-slate-800 dark:text-white text-sm uppercase">Mode "Inertie"</h4>
                        <p className="text-xs text-slate-500 leading-relaxed font-medium">
                            Quand le Hurst est élevé (&gt; 0.6), favorisez les numéros qui sont sortis lors des 3 derniers tirages. La tendance s'auto-alimente.
                        </p>
                    </div>
                    <div className="p-8 space-y-4 hover:bg-slate-50 dark:hover:bg-slate-900/30 transition-colors">
                        <div className="w-10 h-10 bg-amber-100 dark:bg-amber-900/30 text-amber-600 rounded-xl flex items-center justify-center">
                            <Microscope size={20} />
                        </div>
                        <h4 className="font-black text-slate-800 dark:text-white text-sm uppercase">Mode "Écart"</h4>
                        <p className="text-xs text-slate-500 leading-relaxed font-medium">
                            Si un numéro dépasse 3 fois son écart moyen (Gap), son énergie spectrale augmente drastiquement. C'est un pivot de ticket idéal.
                        </p>
                    </div>
                    <div className="p-8 space-y-4 hover:bg-slate-50 dark:hover:bg-slate-900/30 transition-colors">
                        <div className="w-10 h-10 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 rounded-xl flex items-center justify-center">
                            <ShieldCheck size={20} />
                        </div>
                        <h4 className="font-black text-slate-800 dark:text-white text-sm uppercase">Règle de l'AC</h4>
                        <p className="text-xs text-slate-500 leading-relaxed font-medium">
                            Ne jouez jamais des suites simples (ex: 1, 2, 3, 4, 5). La nature déteste la simplicité. Gardez un score de complexité AC supérieur à 7.
                        </p>
                    </div>
                </div>
            </div>

            {/* Call to Action Final */}
            <div className="bg-slate-950 p-10 md:p-14 rounded-[3rem] md:rounded-[4.5rem] border border-white/10 flex flex-col md:flex-row items-center gap-10 shadow-2xl relative overflow-hidden group">
                <div className="absolute inset-0 bg-indigo-600/5 opacity-0 group-hover:opacity-100 transition-opacity duration-700"></div>
                <div className="w-20 h-20 md:w-28 md:h-28 bg-white/5 rounded-full flex items-center justify-center text-amber-500 shadow-inner shrink-0 relative z-10 border border-white/10">
                    <Target size={48} className="animate-pulse" />
                </div>
                <div className="flex-1 text-center md:text-left relative z-10">
                    <h4 className="text-white font-black uppercase tracking-widest text-xl md:text-2xl mb-2">Prêt pour l'Inférence ?</h4>
                    <p className="text-slate-400 text-sm md:text-base font-medium">
                        Fusionnez ces concepts mathématiques dans le module Oracle pour générer votre prochaine prédiction vectorielle.
                    </p>
                </div>
                <button 
                    onClick={() => navigateTo('Oracle')}
                    className="w-full md:w-auto px-12 py-5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-[2rem] font-black text-xs md:text-sm uppercase tracking-[0.2em] shadow-xl shadow-indigo-600/20 active:scale-95 transition-all relative z-10 flex items-center justify-center gap-3"
                >
                    <Zap size={18} fill="currentColor" /> Ouvrir l'Oracle
                </button>
            </div>

            {/* Detailed Lesson Modal Overlay */}
            {selectedLesson && (
                <div className="fixed inset-0 z-[100] bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in" onClick={() => setSelectedLesson(null)}>
                    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-indigo-500/30 w-full max-w-2xl rounded-[3rem] p-8 md:p-12 shadow-2xl relative animate-scale-in" onClick={e => e.stopPropagation()}>
                        <button onClick={() => setSelectedLesson(null)} className="absolute top-6 right-6 p-2 text-slate-400 hover:text-slate-600 dark:hover:text-white transition">
                            <X size={24} />
                        </button>
                        
                        <div className="flex items-center gap-4 mb-8">
                            <div className="p-4 bg-slate-100 dark:bg-slate-800 rounded-2xl">
                                {selectedLesson.icon}
                            </div>
                            <div>
                                <h3 className="text-2xl md:text-3xl font-black text-slate-800 dark:text-white uppercase tracking-tighter">
                                    {selectedLesson.title}
                                </h3>
                                <div className="text-[10px] font-black uppercase tracking-widest text-indigo-500">Document Technique Nexus</div>
                            </div>
                        </div>

                        <div className="prose dark:prose-invert max-w-none mb-10">
                            <p className="text-slate-600 dark:text-slate-300 text-sm md:text-base leading-relaxed">
                                {selectedLesson.content}
                            </p>
                        </div>

                        <div className="p-6 bg-slate-50 dark:bg-white/5 rounded-3xl border border-slate-100 dark:border-white/10 flex items-center gap-6">
                            <div className="shrink-0 w-12 h-12 bg-indigo-600 text-white rounded-full flex items-center justify-center">
                                <PlayCircle size={28} />
                            </div>
                            <div className="flex-1">
                                <h4 className="text-[10px] font-black uppercase text-indigo-500 mb-1">Mise en pratique</h4>
                                <p className="text-xs text-slate-500 dark:text-slate-400 font-bold">
                                    L'IA Apex utilise ce paramètre avec un poids de 25% dans le calcul du consensus.
                                </p>
                            </div>
                            <button 
                                onClick={() => navigateTo('Signaux', selectedLesson.id === 'ac' ? 'math' : selectedLesson.id)}
                                className="px-6 py-3 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-xl font-black text-[10px] uppercase tracking-widest hover:scale-105 transition-transform"
                            >
                                Voir Live
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <div className="text-center">
                <p className="text-[10px] text-slate-500 font-black uppercase tracking-[0.4em] opacity-40">
                    Nexus Elite Engineering • Intelligence Collective • v11.1
                </p>
            </div>
        </div>
    );
};

// Simple X icon for the modal
const X = ({size, className}:any) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className={className}>
        <line x1="18" y1="6" x2="6" y2="18"></line>
        <line x1="6" y1="6" x2="18" y2="18"></line>
    </svg>
);
