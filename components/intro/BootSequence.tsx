import React, { useEffect, useState } from "react";
import {
  Binary,
  Cpu,
  ShieldCheck,
  Wifi,
  Globe,
  Database,
  Fingerprint,
} from "lucide-react";
import { audioEngine } from "../../utils/audioEngine";

interface BootSequenceProps {
  onComplete: () => void;
}

export const BootSequence: React.FC<BootSequenceProps> = ({ onComplete }) => {
  const [step, setStep] = useState(0);
  const [logs, setLogs] = useState<string[]>([]);

  const bootSteps = [
    {
      text: "Initialisation du Noyau LotoPro v12.0...",
      delay: 600,
      icon: <Cpu size={16} />,
    },
    {
      text: "Chargement des modules heuristiques...",
      delay: 1000,
      icon: <Binary size={16} />,
    },
    {
      text: "Synchronisation des tenseurs neuronaux...",
      delay: 1400,
      icon: <Wifi size={16} />,
    },
    {
      text: "Vérification de l'intégrité blockchain...",
      delay: 1900,
      icon: <ShieldCheck size={16} />,
    },
    {
      text: "Calibration des capteurs stochastiques...",
      delay: 2400,
      icon: <Globe size={16} />,
    },
    {
      text: "Accès Base de Données Sécurisée...",
      delay: 2800,
      icon: <Database size={16} />,
    },
    {
      text: "Authentification Biométrique...",
      delay: 3300,
      icon: <Fingerprint size={16} />,
    },
    {
      text: "SYSTÈME EN LIGNE.",
      delay: 3800,
      icon: (
        <div className="w-2 h-2 bg-emerald-500 rounded-full shadow-[0_0_10px_#10b981]" />
      ),
    },
  ];

  useEffect(() => {
    if (sessionStorage.getItem("nexus_booted") === "true") {
      onComplete();
      return;
    }

    let timeouts: number[] = [];

    const runSequence = async () => {
      try {
        audioEngine.play("boot");
      } catch (e) {
        console.warn("Audio boot failed", e);
      }

      // Accelerated boot sequence for speed
      bootSteps.forEach((s, i) => {
        const t = window.setTimeout(() => {
          setStep(i + 1);
          setLogs((prev) => [...prev, s.text]);
          try {
            if (i < bootSteps.length - 1) audioEngine.play("click");
            else audioEngine.play("success");
          } catch (e) {
            /* ignore audio error */
          }
        }, s.delay * 0.15); // Fast forward 85%
        timeouts.push(t);
      });

      const finalT = window.setTimeout(() => {
        sessionStorage.setItem("nexus_booted", "true");
        onComplete();
      }, 4200 * 0.15); // Fast forward 85%
      timeouts.push(finalT);
    };

    runSequence();

    return () => timeouts.forEach(clearTimeout);
  }, [onComplete]);

  return (
    <div className="fixed inset-0 z-[9999] bg-slate-950 flex flex-col items-center justify-center font-mono text-slate-300">
      <div className="w-full max-w-md p-8 space-y-8">
        {/* Logo Central */}
        <div className="flex justify-center mb-10">
          <div className="relative">
            <div className="w-24 h-24 border-4 border-indigo-500/30 rounded-full animate-[spin_3s_linear_infinite]"></div>
            <div className="absolute inset-0 border-4 border-t-indigo-500 rounded-full animate-[spin_2s_linear_infinite]"></div>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-4xl font-black text-white tracking-tighter">
                N
              </span>
            </div>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="w-full h-1 bg-slate-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-indigo-500 shadow-[0_0_15px_#6366f1] transition-all duration-300 ease-linear"
            style={{ width: `${(step / bootSteps.length) * 100}%` }}
          ></div>
        </div>

        {/* Logs Terminal */}
        <div className="space-y-2 min-h-[160px]">
          {bootSteps.slice(0, step).map((s, i) => (
            <div
              key={i}
              className="flex items-center gap-3 text-xs md:text-sm animate-slide-up"
            >
              <span className="text-indigo-500">{s.icon}</span>
              <span
                className={
                  i === bootSteps.length - 1
                    ? "text-white font-bold"
                    : "text-slate-500"
                }
              >
                {s.text}
              </span>
            </div>
          ))}
        </div>

        <div className="text-center">
          <p className="text-[10px] text-slate-600 uppercase tracking-[0.3em] animate-pulse">
            LotoPro Neural Core &copy; 2025
          </p>
        </div>
      </div>
    </div>
  );
};
