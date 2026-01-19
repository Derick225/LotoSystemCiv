import React from 'react';
import { BookOpen, Zap, Activity, Layers, Target, Info, Sparkles, Binary, Waves } from 'lucide-react';

export const AcademyTab: React.FC = () => {
    const concepts = [
        {
            title: "Énergie Spectrale (FFT)",
            icon: <Waves className="text-purple-500" />,
            desc: "Mesure la 'vibration' d'un numéro. Une énergie haute indique qu'un numéro suit un cycle régulier (ex: il sort tous les 4 tirages).",
            tip: "Ciblez les énergies > 70% pour des bases solides."
        },
        {
            title: "Exposant de Hurst",
            icon: <Layers className="text-emerald-500" />,
            desc: "Détermine si le jeu a de la 'mémoire'. Si > 0.5, la tendance se répète. Si < 0.5, le jeu cherche à s'inverser.",
            tip: "En régime 'Persistant', jouez les favoris. En 'Anti-persistant', jouez les écarts."
        },
        {
            title: "Entropie (Désordre)",
            icon: <Activity className="text-rose-500" />,
            desc: "Niveau de chaos du flux. Une entropie basse signifie que des patterns prévisibles sont en train de se former.",
            tip: "Plus l'entropie est basse, plus l'IA est précise."
        },
        {
            title: "Complexité AC",
            icon: <Binary className="text-indigo-500" />,
            desc: "Score de 1 à 10 mesurant la structure d'une grille. Un score AC bas signifie que les numéros sont trop 'logiques' ou simples.",
            tip: "Évitez les tickets avec un AC < 6, ils sortent rarement."
        }
    ];

    return (
        <div className="space-y-8 animate-fade-in pb-20">
            <div className="bg-slate-900 border border-slate-800 p-8 rounded-[3rem] shadow-2xl relative overflow-hidden">
                <div className="absolute top-0 right-0 p-8 opacity-10"><BookOpen size={120} className="text-indigo-500"/></div>
                <div className="relative z-10">
                    <h2 className="text-3xl font-black text-white uppercase tracking-tighter mb-4">Nexus <span className="text-indigo-500">Academy</span></h2>
                    <p className="text-slate-400 max-w-2xl text-sm font-medium leading-relaxed">
                        Apprenez à interpréter les signaux du noyau pour maximiser votre intuition stratégique. Nexus n'est pas un jeu de hasard, c'est une étude de fréquences.
                    </p>
                </div>
            </div>

            <div className="grid md:grid-cols-2 gap-6">
                {concepts.map((c, i) => (
                    <div key={i} className="bg-white dark:bg-slate-800 p-8 rounded-[2.5rem] border border-slate-100 dark:border-slate-700 shadow-sm hover:border-indigo-500 transition-all group">
                        <div className="flex items-center gap-4 mb-6">
                            <div className="p-3 bg-slate-50 dark:bg-slate-900 rounded-2xl group-hover:scale-110 transition-transform shadow-inner">
                                {c.icon}
                            </div>
                            <h3 className="font-black text-slate-800 dark:text-white uppercase tracking-tight">{c.title}</h3>
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed mb-6 font-medium">
                            {c.desc}
                        </p>
                        <div className="p-4 bg-indigo-50 dark:bg-indigo-900/30 rounded-2xl border border-indigo-100 dark:border-indigo-800 flex gap-3 items-start">
                            <Sparkles size={16} className="text-indigo-500 shrink-0 mt-0.5" />
                            <p className="text-[10px] text-indigo-700 dark:text-indigo-300 font-bold italic leading-tight">
                                Conseil : {c.tip}
                            </p>
                        </div>
                    </div>
                ))}
            </div>

            <div className="bg-slate-950 p-8 rounded-[3rem] border border-white/5 flex flex-col md:flex-row items-center gap-8">
                <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center text-amber-500 shadow-inner">
                    <Target size={32} />
                </div>
                <div className="flex-1 text-center md:text-left">
                    <h4 className="text-white font-black uppercase tracking-widest text-sm mb-1">Prêt pour l'Inférence ?</h4>
                    <p className="text-slate-500 text-xs font-medium">Utilisez l'Oracle IA pour fusionner tous ces concepts en une prédiction unique.</p>
                </div>
                <button className="px-8 py-4 bg-indigo-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl shadow-indigo-600/20 active:scale-95 transition-all">
                    Ouvrir l'Oracle
                </button>
            </div>
        </div>
    );
};