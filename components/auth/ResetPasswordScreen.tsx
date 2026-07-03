import React, { useState } from 'react';
import { authService } from '../../services/authService';
import { useToast } from '../ui/Toast';
import { Lock, ArrowRight, Cpu } from 'lucide-react';
import { audioEngine } from '../../utils/audioEngine';

interface ResetPasswordScreenProps {
  onSuccess: () => void;
}

export const ResetPasswordScreen: React.FC<ResetPasswordScreenProps> = ({ onSuccess }) => {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [password, setPassword] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password || password.length < 6) {
      showToast("Le mot de passe doit contenir au moins 6 caractères", "error");
      return;
    }

    setLoading(true);
    audioEngine.play('click');

    try {
      const { error } = await authService.updatePassword(password);
      if (error) throw error;
      showToast("Mot de passe mis à jour avec succès !", "success");
      audioEngine.play('success');
      onSuccess();
    } catch (error: unknown) {
      console.error(error);
      audioEngine.play('error');
      showToast((error instanceof Error ? error.message : String(error)) || "Erreur lors de la mise à jour", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-nexus-950 flex flex-col items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-indigo-600/20 rounded-full blur-[120px] animate-pulse-slow" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-purple-600/20 rounded-full blur-[120px] animate-pulse-slow" />

      <div className="w-full max-w-md bg-white/5 backdrop-blur-2xl border border-white/10 p-8 rounded-3xl shadow-2xl relative z-10 animate-scale-in">
        <div className="text-center mb-10">
          <h1 className="text-3xl font-black text-white tracking-tighter mb-2">
            Nouveau Mot de Passe
          </h1>
          <p className="text-xs text-slate-400 font-bold uppercase tracking-[0.3em]">
            Sécurisez votre accès
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-4">
            <div className="relative group">
              <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-indigo-400 transition-colors">
                <Lock size={20} />
              </div>
              <input
                id="reset-password-input"
                type="password"
                placeholder="Nouveau mot de passe"
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
                Mettre à jour
                <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
};