import React, { useState, useEffect } from 'react';
import { authService } from '../../services/authService';
import { useToast } from '../ui/Toast';
import { Lock, Mail, User, ArrowRight, ShieldCheck, Cpu, Globe, AlertTriangle, FileWarning } from 'lucide-react';
import { audioEngine } from '../../utils/audioEngine';
import { isSupabaseConfigured, getSupabaseConfigDiagnostics } from '../../services/supabaseClient';

interface AuthScreenProps {
  onSuccess: () => void;
}

export const AuthScreen: React.FC<AuthScreenProps> = ({ onSuccess }) => {
  const { showToast } = useToast();
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  
  const [configStatus, setConfigStatus] = useState(getSupabaseConfigDiagnostics());

  useEffect(() => {
      // Met à jour le status au montage (utile pour le HMR)
      setConfigStatus(getSupabaseConfigDiagnostics());
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!configStatus.isConfigured) {
        showToast("Configuration requise avant connexion.", "error");
        return;
    }
    if (!email || !password) {
      showToast("Veuillez remplir tous les champs", "error");
      return;
    }

    setLoading(true);
    audioEngine.play('click');

    try {
      if (isLogin) {
        const { error } = await authService.login(email, password);
        if (error) throw error;
        audioEngine.play('success');
        onSuccess();
      } else {
        const { error } = await authService.signUp(email, password);
        if (error) throw error;
        showToast("Compte créé ! Vérifiez votre email ou connectez-vous.", "success");
        setIsLogin(true);
        audioEngine.play('success');
      }
    } catch (error: any) {
      console.error(error);
      audioEngine.play('error');
      showToast(error.message || "Erreur d'authentification", "error");
    } finally {
      setLoading(false);
    }
  };

  // Si la config est invalide, on affiche un écran d'erreur critique
  if (!configStatus.isConfigured) {
      return (
        <div className="min-h-screen bg-nexus-950 flex flex-col items-center justify-center p-6 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1 bg-red-600 animate-pulse"></div>
            <div className="w-full max-w-lg bg-slate-900 border border-red-500/30 p-8 rounded-[2.5rem] shadow-2xl relative z-10">
                <div className="flex flex-col items-center text-center mb-8">
                    <div className="w-20 h-20 bg-red-500/10 rounded-3xl flex items-center justify-center mb-4 border border-red-500/20">
                        <AlertTriangle size={40} className="text-red-500" />
                    </div>
                    <h2 className="text-2xl font-black text-white uppercase tracking-tight">Configuration Requise</h2>
                    <p className="text-sm text-slate-400 mt-2 font-medium">Les clés d'accès à la base de données sont manquantes ou invalides.</p>
                </div>

                <div className="space-y-4 bg-black/30 p-6 rounded-2xl border border-white/5 mb-8">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-500 uppercase">VITE_SUPABASE_URL</span>
                        {configStatus.url.valid 
                            ? <span className="text-xs font-mono text-emerald-400 flex items-center gap-1"><ShieldCheck size={12}/> {configStatus.url.value}</span>
                            : <span className="text-xs font-mono text-red-400 flex items-center gap-1"><FileWarning size={12}/> {configStatus.url.error}</span>
                        }
                    </div>
                    <div className="h-px bg-white/10 w-full"></div>
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-500 uppercase">VITE_SUPABASE_ANON_KEY</span>
                        {configStatus.key.valid 
                            ? <span className="text-xs font-mono text-emerald-400 flex items-center gap-1"><ShieldCheck size={12}/> {configStatus.key.value}</span>
                            : <span className="text-xs font-mono text-red-400 flex items-center gap-1"><FileWarning size={12}/> {configStatus.key.error}</span>
                        }
                    </div>
                </div>

                <div className="bg-indigo-900/20 p-4 rounded-xl border border-indigo-500/20 text-center">
                    <p className="text-xs text-indigo-300 font-medium">
                        Modifiez le fichier <span className="font-mono bg-black/40 px-1 py-0.5 rounded text-white">.env</span> à la racine du projet et redémarrez le serveur.
                    </p>
                </div>
                
                <button onClick={() => window.location.reload()} className="w-full mt-6 py-4 bg-slate-800 hover:bg-slate-700 text-white font-black rounded-2xl transition uppercase text-xs tracking-widest">
                    Recharger la page
                </button>
            </div>
        </div>
      );
  }

  return (
    <div className="min-h-screen bg-nexus-950 flex flex-col items-center justify-center p-4 relative overflow-hidden">
      {/* Background FX */}
      <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-indigo-600/20 rounded-full blur-[120px] animate-pulse-slow" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-purple-600/20 rounded-full blur-[120px] animate-pulse-slow" />

      <div className="w-full max-w-md bg-white/5 backdrop-blur-2xl border border-white/10 p-8 rounded-[3rem] shadow-2xl relative z-10 animate-scale-in">
        <div className="text-center mb-10">
          <div className="w-20 h-20 bg-gradient-to-br from-indigo-600 to-violet-700 rounded-3xl mx-auto flex items-center justify-center shadow-lg shadow-indigo-500/30 mb-6">
            <span className="text-4xl font-black text-white italic">N</span>
          </div>
          <h1 className="text-3xl font-black text-white tracking-tighter mb-2">
            NEXUS<span className="text-indigo-500">PRO</span>
          </h1>
          <p className="text-xs text-slate-400 font-bold uppercase tracking-[0.3em]">
            Accès Sécurisé Requis
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-4">
            <div className="relative group">
              <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-indigo-400 transition-colors">
                <Mail size={20} />
              </div>
              <input
                type="email"
                placeholder="Identifiant Neural (Email)"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-slate-900/50 border border-slate-700 rounded-2xl py-4 pl-12 pr-4 text-white font-medium placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
              />
            </div>

            <div className="relative group">
              <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-indigo-400 transition-colors">
                <Lock size={20} />
              </div>
              <input
                type="password"
                placeholder="Clé de Cryptage (Mot de passe)"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-slate-900/50 border border-slate-700 rounded-2xl py-4 pl-12 pr-4 text-white font-medium placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 text-white font-black rounded-2xl shadow-xl shadow-indigo-600/20 transition-all active:scale-[0.98] uppercase tracking-widest text-xs flex items-center justify-center gap-3 group"
          >
            {loading ? (
              <Cpu className="animate-spin" size={18} />
            ) : (
              <>
                {isLogin ? "Initialiser Session" : "Créer Identité"}
                <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
              </>
            )}
          </button>
        </form>

        <div className="mt-8 text-center">
          <button
            onClick={() => { setIsLogin(!isLogin); audioEngine.play('click'); }}
            className="text-xs text-slate-400 font-bold hover:text-white transition-colors uppercase tracking-wide"
          >
            {isLogin ? "Pas encore de compte ? S'inscrire" : "Déjà membre ? Se connecter"}
          </button>
        </div>

        <div className="mt-10 pt-6 border-t border-white/5 flex justify-center gap-6 opacity-50">
          <div className="flex items-center gap-2 text-[10px] font-black text-slate-500 uppercase tracking-widest">
            <ShieldCheck size={12} /> SSL Secure
          </div>
          <div className="flex items-center gap-2 text-[10px] font-black text-slate-500 uppercase tracking-widest">
            <Globe size={12} /> Nexus Cloud
          </div>
        </div>
      </div>
    </div>
  );
};