import React from "react";
import { useNexusStore } from "../../store/useNexusStore";
import {
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  Compass,
  Activity,
} from "lucide-react";

export const FractalTab: React.FC<{ drawName: string }> = () => {
  const regime = useNexusStore((state) => state.regime);
  const history = useNexusStore((state) => state.history);
  const loading = useNexusStore((state) => state.loading);

  if (loading)
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-6 animate-pulse">
        <p className="text-xs font-black uppercase tracking-[0.3em] text-slate-400">
          Analyse de la météo du jeu...
        </p>
      </div>
    );

  if (!regime)
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-6 bg-slate-950 rounded-3xl border border-slate-800">
        <AlertTriangle className="text-slate-500" size={48} />
        <p className="text-xs font-black uppercase tracking-[0.3em] text-slate-400">
          Données insuffisantes pour établir la météo du jeu
        </p>
      </div>
    );

  const hurst = regime.hurst;
  const weylDiscrepancy = regime.weylDiscrepancy;
  const chaosDimension = regime.chaosDimension;

  // Marge d'incertitude d'échantillonnage, convention identique au moteur detectGameRegime (1/sqrt(N))
  const sampleSize = Math.min(history.length, 200);
  const uncertaintyMargin = sampleSize > 0 ? 1.0 / Math.sqrt(sampleSize) : 0;

  // Logique pour l'utilisateur : seuils centrés sur 0.5 avec marge statistique, pas de constantes fixes
  let status = "Neutre (Marche Aléatoire)";
  let description =
    "Aucune mémoire statistique détectable : le flux se comporte comme un hasard équitable.";
  let color = "bg-slate-500";
  let icon = <TrendingUp size={60} />;

  if (hurst > 0.5 + uncertaintyMargin) {
    status = "Persistant (Tendance)";
    description =
      "L'historique montre une continuité des tendances (H > 0.5). Cela décrit le passé, ne garantit pas le futur.";
    color = "bg-emerald-500";
    icon = <CheckCircle2 size={80} />;
  } else if (hurst < 0.5 - uncertaintyMargin) {
    status = "Anti-persistant (Retour à la moyenne)";
    description =
      "L'historique oscille autour de sa moyenne (H < 0.5). Tendance statistique passée, sans promesse de gain.";
    color = "bg-indigo-500";
    icon = <TrendingUp size={80} />;
  } else {
    status = "Neutre (Marche Aléatoire)";
    description =
      "Aucune mémoire statistique détectable : le flux se comporte comme un hasard équitable.";
    color = "bg-rose-500";
    icon = <AlertTriangle size={80} />;
  }

  return (
    <div className="space-y-10 animate-fade-in pb-16">
      <div className="bg-slate-950 p-6 rounded-3xl text-white shadow-2xl border border-slate-800 text-center relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full blur-[80px]"></div>

        <div className="relative z-10 flex flex-col items-center gap-6">
          <div
            className={`p-6 rounded-full ${color} shadow-2xl shadow-${color}/50 mb-4 animate-pulse`}
          >
            {icon}
          </div>

          <h2 className="text-3xl md:text-5xl font-black uppercase tracking-tighter">
            Météo : {status}
          </h2>

          <div className="bg-white/10 p-6 rounded-2xl max-w-xl mx-auto backdrop-blur-md">
            <p className="text-lg font-medium leading-relaxed">
              "{description}"
            </p>
          </div>
        </div>
      </div>

      {/* NOUVELLES DIMENSIONS MATHÉMATIQUES AVANCÉES (100% DÉTERMINISTES) */}
      <div className="glass-card neural-border p-8 rounded-3xl shadow-xl space-y-6">
        <div>
          <span className="text-[10px] font-bold text-indigo-500 uppercase tracking-[0.2em]">
            HPC INFERENCE
          </span>
          <h3 className="text-2xl font-black text-slate-800 dark:text-white uppercase tracking-tighter mt-1">
            Nouvelles Dimensions de l'Espace des Phases
          </h3>
          <p className="text-xs text-slate-500 font-medium leading-relaxed mt-2 max-w-3xl">
            Ces dimensions évaluent la structure mathématique intrinsèque de
            l'attracteur dynamique sans aucun bruit stochastique ou coefficient
            arbitraire.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-6 pt-4">
          {/* DISCRÉPANCE DE WEYL */}
          <div className="bg-slate-50 dark:bg-slate-950 rounded-2xl p-6 border border-slate-100 dark:border-slate-800 flex flex-col justify-between">
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-indigo-500/10 text-indigo-500 rounded-lg">
                  <Compass size={20} />
                </div>
                <div>
                  <h4 className="font-bold text-slate-800 dark:text-white uppercase tracking-tight text-sm">
                    Discrépance de Weyl Modulaire
                  </h4>
                  <span className="text-[10px] font-bold text-slate-400">
                    ÉQUIRÉPARTITION CRITIQUES
                  </span>
                </div>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed font-medium">
                Mesure l'écart suprémum cumulé par rapport à une distribution
                uniforme uniforme modulaire. Plus ce score est proche de 0.0,
                plus le flux est fluide.
              </p>
            </div>

            <div className="mt-6 space-y-2">
              <div className="flex justify-between items-baseline mb-1">
                <span className="text-xs font-black text-slate-400">
                  Weyl D* Stat
                </span>
                <span className="text-2xl font-black font-mono text-indigo-500">
                  {typeof weylDiscrepancy === "number"
                    ? weylDiscrepancy.toFixed(4)
                    : "n/d"}
                </span>
              </div>
              <div className="h-2 w-full bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-indigo-500 rounded-full transition-all duration-1000"
                  style={{
                    width: `${
                      typeof weylDiscrepancy === "number"
                        ? Math.min(100, weylDiscrepancy * 100)
                        : 0
                    }%`,
                  }}
                ></div>
              </div>
              <div className="flex justify-between text-[9px] font-bold text-slate-400 uppercase tracking-widest pt-1">
                <span>Uniforme {`(<0.15)`}</span>
                <span>Chaos structurel {`(>0.25)`}</span>
              </div>
            </div>
          </div>

          {/* DIMENSION DE CORRÉLATION DE GRASSBERGER-PROCACCIA */}
          <div className="bg-slate-50 dark:bg-slate-950 rounded-2xl p-6 border border-slate-100 dark:border-slate-800 flex flex-col justify-between">
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-violet-500/10 text-violet-500 rounded-lg">
                  <Activity size={20} />
                </div>
                <div>
                  <h4 className="font-bold text-slate-800 dark:text-white uppercase tracking-tight text-sm">
                    Attracteur Chaos GP
                  </h4>
                  <span className="text-[10px] font-bold text-slate-400">
                    DIMENSION FRACTALE DYNAMIQUE
                  </span>
                </div>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed font-medium">
                Estime la dimension fractale dynamique d'auto-corrélation
                d'espace-phase du système. Représente le nombre d'équations
                couplées nécessaires pour modéliser le flux.
              </p>
            </div>

            <div className="mt-6 space-y-2">
              <div className="flex justify-between items-baseline mb-1">
                <span className="text-xs font-black text-slate-400">
                  Dimension Fractale ν
                </span>
                <span className="text-2xl font-black font-mono text-violet-500">
                  {typeof chaosDimension === "number"
                    ? chaosDimension.toFixed(3)
                    : "n/d"}
                </span>
              </div>
              <div className="h-2 w-full bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-violet-500 rounded-full transition-all duration-1000"
                  style={{
                    width: `${
                      typeof chaosDimension === "number"
                        ? Math.min(
                            100,
                            Math.max(0, ((chaosDimension - 1.0) / 2.0) * 100)
                          )
                        : 0
                    }%`,
                  }}
                ></div>
              </div>
              <div className="flex justify-between text-[9px] font-bold text-slate-400 uppercase tracking-widest pt-1">
                <span>Attracteur Simple (1.0)</span>
                <span>Chaos Dimensionnel (3.0)</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        <div className="bg-emerald-50 dark:bg-emerald-900/20 p-6 rounded-[2rem] border border-emerald-100 dark:border-emerald-800/30">
          <h4 className="font-black text-emerald-700 dark:text-emerald-400 uppercase text-sm mb-2">
            Quand c'est Vert
          </h4>
          <p className="text-xs text-emerald-800 dark:text-emerald-200">
            L'historique montre une continuité des tendances : les séries de
            sorties ont tendance à se prolonger. Observation statistique du
            passé, pas une garantie de gain.
          </p>
        </div>
        <div className="bg-rose-50 dark:bg-rose-900/20 p-6 rounded-[2rem] border border-rose-100 dark:border-rose-800/30">
          <h4 className="font-black text-rose-700 dark:text-rose-400 uppercase text-sm mb-2">
            Quand c'est Rouge
          </h4>
          <p className="text-xs text-rose-800 dark:text-rose-200">
            Le régime ressemble à une marche aléatoire : aucune mémoire
            statistique exploitable. Restez prudent et gérez votre budget.
          </p>
        </div>
        <div className="bg-indigo-50 dark:bg-indigo-900/20 p-6 rounded-[2rem] border border-indigo-100 dark:border-indigo-800/30">
          <h4 className="font-black text-indigo-700 dark:text-indigo-400 uppercase text-sm mb-2">
            Quand c'est Bleu
          </h4>
          <p className="text-xs text-indigo-800 dark:text-indigo-200">
            Effet élastique observé dans le passé : après des tirages
            déficitaires, le flux a tendance à revenir vers sa moyenne. Rien
            n'oblige le prochain tirage à suivre cette tendance.
          </p>
        </div>
      </div>
    </div>
  );
};
