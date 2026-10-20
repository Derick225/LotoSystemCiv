import React, { useState, useEffect } from "react";
import { X, ChevronRight, Check, Zap, Target, Activity } from "lucide-react";
import { audioEngine } from "../../utils/audioEngine";

export const TutorialOverlay: React.FC = () => {
  const [isVisible, setIsVisible] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    const hasSeen = localStorage.getItem("nexus_tutorial_completed");
    if (!hasSeen) {
      setTimeout(() => setIsVisible(true), 2000);
    }
  }, []);

  const steps = [
    {
      title: "Bienvenue dans LotoPro",
      text: "Vous accédez à l'interface Cyber-Glass v12.0. Ce système utilise des modèles neuronaux pour analyser le flux stochastique des loteries.",
      icon: <Zap size={32} className="text-indigo-400" />,
    },
    {
      title: "Matrice & Signaux",
      text: "Naviguez dans la matrice pour détecter les anomalies de structure mathématique et observer l'évolution de la tension quantique.",
      icon: <Activity size={32} className="text-emerald-400" />,
    },
    {
      title: "Réseau Neuronal",
      text: "L'Oracle IA fusionne les modèles spectraux et de Markov en temps réel. Maintenez le système à jour pour garantir l'efficacité de la prédiction.",
      icon: <Target size={32} className="text-rose-400" />,
    },
  ];

  const handleNext = () => {
    audioEngine.play("click");
    if (step < steps.length - 1) {
      setStep(step + 1);
    } else {
      handleClose();
    }
  };

  const handleClose = () => {
    setIsVisible(false);
    localStorage.setItem("nexus_tutorial_completed", "true");
    audioEngine.play("success");
  };

  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-6 animate-fade-in">
      <div className="glass-card neural-border w-full max-w-md rounded-[2.5rem] p-8 md:p-10 shadow-2xl relative overflow-hidden group">
        {/* Background FX */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/10 rounded-full blur-[80px] -mr-20 -mt-20"></div>

        <div className="relative z-10">
          <div className="flex justify-between items-start mb-8">
            <div className="p-4 bg-slate-900/50 rounded-2xl border border-white/10 shadow-xl">
              {steps[step].icon}
            </div>
            <button
              onClick={handleClose}
              className="p-2 text-slate-500 hover:text-white transition bg-slate-900/50 rounded-full border border-white/5"
            >
              <X size={20} />
            </button>
          </div>

          <h3 className="text-2xl font-black text-white uppercase tracking-tight mb-4 min-h-[40px]">
            {steps[step].title}
          </h3>

          <p className="text-sm text-slate-300 font-medium leading-relaxed mb-8 min-h-[80px]">
            {steps[step].text}
          </p>

          <div className="flex items-center justify-between mt-4">
            <div className="flex gap-2">
              {steps.map((_, i) => (
                <div
                  key={i}
                  className={`h-1.5 rounded-full transition-all duration-500 shadow-inner ${i === step ? "w-8 bg-indigo-400 shadow-[0_0_10px_rgba(129,140,248,0.5)]" : "w-2 bg-slate-800"}`}
                />
              ))}
            </div>

            <button
              onClick={handleNext}
              className="px-6 py-3 bg-white text-indigo-950 rounded-xl font-black text-xs uppercase tracking-widest flex items-center gap-2 hover:bg-indigo-50 transition-transform active:scale-95 shadow-[0_0_20px_rgba(255,255,255,0.3)]"
            >
              {step === steps.length - 1 ? "Initialiser" : "Suivant"}
              {step === steps.length - 1 ? (
                <Check size={14} />
              ) : (
                <ChevronRight size={14} />
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
