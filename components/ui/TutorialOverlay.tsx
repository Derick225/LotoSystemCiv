
import React, { useState, useEffect } from 'react';
import { X, ChevronRight, Check, Zap, Target, Activity } from 'lucide-react';
import { audioEngine } from '../../utils/audioEngine';

export const TutorialOverlay: React.FC = () => {
    const [isVisible, setIsVisible] = useState(false);
    const [step, setStep] = useState(0);

    useEffect(() => {
        const hasSeen = localStorage.getItem('nexus_tutorial_completed');
        if (!hasSeen) {
            setTimeout(() => setIsVisible(true), 2000);
        }
    }, []);

    const steps = [
        {
            title: "Bienvenue dans Nexus",
            text: "Vous accédez à l'interface Platinum Elite v11.0. Ce système utilise des algorithmes quantiques pour décoder le flux stochastique des loteries.",
            icon: <Zap size={32} className="text-indigo-500" />
        },
        {
            title: "Flux & Signaux",
            text: "Naviguez entre le 'Flux' (Historique) et les 'Signaux' (Analyses mathématiques) pour détecter les anomalies de structure.",
            icon: <Activity size={32} className="text-emerald-500" />
        },
        {
            title: "Oracle IA",
            text: "L'onglet Oracle utilise Gemini Pro pour fusionner les modèles spectraux, fractals et probabilistes en une prédiction cohérente.",
            icon: <Target size={32} className="text-rose-500" />
        }
    ];

    const handleNext = () => {
        audioEngine.play('click');
        if (step < steps.length - 1) {
            setStep(step + 1);
        } else {
            handleClose();
        }
    };

    const handleClose = () => {
        setIsVisible(false);
        localStorage.setItem('nexus_tutorial_completed', 'true');
        audioEngine.play('success');
    };

    if (!isVisible) return null;

    return (
        <div className="fixed inset-0 z-[100] bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-6 animate-fade-in">
            <div className="bg-slate-900 border border-indigo-500/30 w-full max-w-md rounded-[2.5rem] p-8 shadow-2xl relative overflow-hidden group">
                {/* Background FX */}
                <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-600/10 rounded-full blur-[80px] -mr-20 -mt-20"></div>
                
                <div className="relative z-10">
                    <div className="flex justify-between items-start mb-8">
                        <div className="p-4 bg-slate-800 rounded-2xl border border-slate-700 shadow-lg">
                            {steps[step].icon}
                        </div>
                        <button onClick={handleClose} className="p-2 text-slate-500 hover:text-white transition">
                            <X size={20} />
                        </button>
                    </div>

                    <h3 className="text-2xl font-black text-white uppercase tracking-tight mb-4 min-h-[40px]">
                        {steps[step].title}
                    </h3>
                    
                    <p className="text-sm text-slate-400 font-medium leading-relaxed mb-8 min-h-[80px]">
                        {steps[step].text}
                    </p>

                    <div className="flex items-center justify-between">
                        <div className="flex gap-1.5">
                            {steps.map((_, i) => (
                                <div 
                                    key={i} 
                                    className={`h-1.5 rounded-full transition-all duration-500 ${i === step ? 'w-8 bg-indigo-500' : 'w-2 bg-slate-700'}`} 
                                />
                            ))}
                        </div>

                        <button 
                            onClick={handleNext}
                            className="px-6 py-3 bg-white text-indigo-900 rounded-xl font-black text-xs uppercase tracking-widest flex items-center gap-2 hover:bg-indigo-50 transition-transform active:scale-95 shadow-lg"
                        >
                            {step === steps.length - 1 ? 'Initialiser' : 'Suivant'}
                            {step === steps.length - 1 ? <Check size={14} /> : <ChevronRight size={14} />}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
