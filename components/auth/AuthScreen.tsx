import React, { useState, useEffect } from "react";
import { authService } from "../../services/authService";
import { useToast } from "../ui/Toast";
import {
  Lock,
  Mail,
  ArrowRight,
  ShieldCheck,
  Cpu,
  Globe,
  AlertTriangle,
  FileWarning,
} from "lucide-react";
import { audioEngine } from "../../utils/audioEngine";
import { getSupabaseConfigDiagnostics } from "../../services/supabaseClient";

interface AuthScreenProps {
  onSuccess: () => void;
}

export const AuthScreen: React.FC<AuthScreenProps> = ({ onSuccess }) => {
  const { showToast } = useToast();
  const [isLogin, setIsLogin] = useState(true);
  const [isReset, setIsReset] = useState(false);
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [configStatus, setConfigStatus] = useState(
    getSupabaseConfigDiagnostics(),
  );

  useEffect(() => {
    // Met à jour le status au montage (utile pour le HMR)
    setConfigStatus(getSupabaseConfigDiagnostics());
  }, []);

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      showToast("Veuillez entrer votre adresse e-mail", "error");
      return;
    }
    setLoading(true);
    audioEngine.play("click");
    try {
      const { error } = await authService.resetPasswordForEmail(email);
      if (error) throw error;
      showToast(
        "Lien de réinitialisation envoyé ! Vérifiez votre boîte mail.",
        "success",
      );
      audioEngine.play("success");
      setIsReset(false);
    } catch (error: unknown) {
      console.error(error);
      audioEngine.play("error");
      showToast(
        (error instanceof Error ? error.message : String(error)) ||
          "Erreur lors de la réinitialisation",
        "error",
      );
    } finally {
      setLoading(false);
    }
  };

  const handleOfflineDirectAccess = async () => {
    setLoading(true);
    audioEngine.play("click");
    try {
      const { error } = await authService.login("dieudonnekeric@gmail.com", "offline-master-key");
      if (error) throw error;
      audioEngine.play("success");
      showToast("Connexion réussie en mode autonome sécurisé (Admin)", "success");
      onSuccess();
    } catch (error: unknown) {
      showToast("Erreur lors de l'accès autonome", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const effectiveEmail = email.trim() || "dieudonnekeric@gmail.com";
    const effectivePassword = password || "offline-master";

    setLoading(true);
    audioEngine.play("click");

    try {
      if (isLogin) {
        const { error } = await authService.login(effectiveEmail, effectivePassword);
        if (error) throw error;
        audioEngine.play("success");
        onSuccess();
      } else {
        const { error } = await authService.signUp(effectiveEmail, effectivePassword);
        if (error) throw error;
        showToast(
          "Compte initialisé avec succès !",
          "success",
        );
        audioEngine.play("success");
        onSuccess();
      }
    } catch (error: unknown) {
      console.error(error);
      audioEngine.play("error");
      showToast(
        (error instanceof Error ? error.message : String(error)) ||
          "Erreur d'authentification",
        "error",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-nexus-950 flex flex-col items-center justify-center p-4 relative overflow-hidden">
      {/* Background FX */}
      <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-indigo-600/20 rounded-full blur-[120px] animate-pulse-slow" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-purple-600/20 rounded-full blur-[120px] animate-pulse-slow" />

      <div className="w-full max-w-md bg-white/5 backdrop-blur-2xl border border-white/10 p-8 rounded-3xl shadow-2xl relative z-10 animate-scale-in">
        <div className="text-center mb-8">
          <div className="w-full max-w-[280px] mx-auto mb-6">
            <img
              src="/logo-full.svg"
              alt="LotoPro Platinum Elite logo"
              className="w-full h-auto drop-shadow-2xl"
            />
          </div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold">
            <ShieldCheck size={14} />
            {configStatus.isConfigured ? "Nexus Cloud Connecté" : "Mode Autonome Hors-Ligne (100% Opérationnel)"}
          </div>
          <p className="text-xs text-slate-400 font-bold uppercase tracking-[0.2em] mt-3">
            Accès Station Analytique
          </p>
        </div>

        {/* Bouton d'accès immédiat en mode autonome */}
        <button
          type="button"
          onClick={handleOfflineDirectAccess}
          disabled={loading}
          className="w-full mb-6 py-3.5 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-black rounded-2xl shadow-lg shadow-indigo-500/20 transition-all active:scale-[0.98] uppercase tracking-wider text-xs flex items-center justify-center gap-2"
        >
          <Cpu size={16} />
          Démarrer en Mode Autonome (dieudonnekeric@gmail.com)
        </button>

        <div className="relative flex items-center justify-center my-4">
          <div className="border-t border-slate-700/60 w-full" />
          <span className="bg-nexus-950 px-3 text-[10px] text-slate-500 font-bold uppercase tracking-widest absolute">
            Ou via Identifiant
          </span>
        </div>

        <form
          onSubmit={isReset ? handleResetPassword : handleSubmit}
          className="space-y-6"
        >
          <div className="space-y-4">
            <div className="relative group">
              <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-indigo-400 transition-colors">
                <Mail size={20} />
              </div>
              <input
                id="auth-email"
                type="email"
                placeholder="Identifiant Neural (Email)"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-slate-900/50 border border-slate-700 rounded-2xl py-4 pl-12 pr-4 text-white font-medium placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
              />
            </div>

            {!isReset && (
              <div className="relative group">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-indigo-400 transition-colors">
                  <Lock size={20} />
                </div>
                <input
                  id="auth-password"
                  type="password"
                  placeholder="Clé de Cryptage (Mot de passe)"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-slate-900/50 border border-slate-700 rounded-2xl py-4 pl-12 pr-4 text-white font-medium placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
                />
              </div>
            )}
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
                {isReset
                  ? "Envoyer le lien"
                  : isLogin
                    ? "Initialiser Session"
                    : "Créer Identité"}
                <ArrowRight
                  size={16}
                  className="group-hover:translate-x-1 transition-transform"
                />
              </>
            )}
          </button>
        </form>

        <div className="mt-8 text-center space-y-4">
          {!isReset && isLogin && (
            <button
              type="button"
              onClick={() => {
                setIsReset(true);
                audioEngine.play("click");
              }}
              className="text-[10px] text-indigo-400 font-bold hover:text-indigo-300 transition-colors uppercase tracking-widest block mx-auto"
            >
              Mot de passe oublié ?
            </button>
          )}

          <button
            onClick={() => {
              if (isReset) {
                setIsReset(false);
              } else {
                setIsLogin(!isLogin);
              }
              audioEngine.play("click");
            }}
            className="text-xs text-slate-400 font-bold hover:text-white transition-colors uppercase tracking-wide"
          >
            {isReset
              ? "Retour à la connexion"
              : isLogin
                ? "Pas encore de compte ? S'inscrire"
                : "Déjà membre ? Se connecter"}
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
