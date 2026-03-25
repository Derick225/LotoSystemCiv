
import React from 'react';
import { useNexusStore } from '../../store/useNexusStore';
import { TrendingUp, AlertTriangle, CheckCircle2 } from 'lucide-react';

export const FractalTab: React.FC<{ drawName: string }> = () => {
  const regime = useNexusStore(state => state.regime);
  const loading = useNexusStore(state => state.loading);

  if (loading) return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-6 animate-pulse">
          <p className="text-xs font-black uppercase tracking-[0.3em] text-slate-400">Analyse de la météo du jeu...</p>
      </div>
  );

  const hurst = regime?.hurst || 0.5;
  
  // Logique simplifiée pour l'utilisateur
  let status = 'Neutre';
  let description = "Le jeu est normal, rien de particulier.";
  let color = "bg-slate-500";
  let icon = <TrendingUp size={60} />;

  if (hurst > 0.6) {
      status = 'Facile (Suivre la tendance)';
      description = "Les numéros qui sortent souvent vont continuer de sortir. Jouez les favoris !";
      color = "bg-emerald-500";
      icon = <CheckCircle2 size={80} />;
  } else if (hurst < 0.4) {
      status = 'Rebond (Jouer les inverses)';
      description = "Le jeu cherche à s'équilibrer. Jouez ceux qui ne sont pas sortis depuis longtemps.";
      color = "bg-indigo-500";
      icon = <TrendingUp size={80} />;
  } else {
      status = 'Difficile (Hasard total)';
      description = "Aucune logique détectée aujourd'hui. Prudence, c'est du pur hasard.";
      color = "bg-rose-500";
      icon = <AlertTriangle size={80} />;
  }

  return (
    <div className="space-y-10 animate-fade-in pb-16">
        
        <div className="bg-slate-950 p-10 rounded-[3rem] text-white shadow-2xl border border-slate-800 text-center relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full blur-[80px]"></div>
            
            <div className="relative z-10 flex flex-col items-center gap-6">
                <div className={`p-6 rounded-full ${color} shadow-2xl shadow-${color}/50 mb-4 animate-pulse`}>
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

        <div className="grid md:grid-cols-3 gap-6">
            <div className="bg-emerald-50 dark:bg-emerald-900/20 p-6 rounded-[2rem] border border-emerald-100 dark:border-emerald-800/30">
                <h4 className="font-black text-emerald-700 dark:text-emerald-400 uppercase text-sm mb-2">Quand c'est Vert</h4>
                <p className="text-xs text-emerald-800 dark:text-emerald-200">
                    C'est le moment idéal pour jouer. Les répétitions sont fréquentes. Misez sur les numéros en forme.
                </p>
            </div>
            <div className="bg-rose-50 dark:bg-rose-900/20 p-6 rounded-[2rem] border border-rose-100 dark:border-rose-800/30">
                <h4 className="font-black text-rose-700 dark:text-rose-400 uppercase text-sm mb-2">Quand c'est Rouge</h4>
                <p className="text-xs text-rose-800 dark:text-rose-200">
                    Attention ! Le jeu est chaotique. Réduisez vos mises ou jouez des grilles "Flash" au hasard.
                </p>
            </div>
            <div className="bg-indigo-50 dark:bg-indigo-900/20 p-6 rounded-[2rem] border border-indigo-100 dark:border-indigo-800/30">
                <h4 className="font-black text-indigo-700 dark:text-indigo-400 uppercase text-sm mb-2">Quand c'est Bleu</h4>
                <p className="text-xs text-indigo-800 dark:text-indigo-200">
                    Effet élastique. Les numéros en retard ont de fortes chances de sortir pour rattraper la moyenne.
                </p>
            </div>
        </div>
    </div>
  );
};
