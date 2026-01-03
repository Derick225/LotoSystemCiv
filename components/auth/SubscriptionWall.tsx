
import React, { useState } from 'react';
import { processMobileMoneyPayment } from '../../services/subscriptionService';
import { useToast } from '../ui/Toast';
import { ShieldCheck, Lock, Smartphone, RefreshCw, LogOut, Award } from 'lucide-react';
import { audioEngine } from '../../utils/audioEngine';

interface SubscriptionWallProps {
    userId: string;
    onPaymentSuccess: () => void;
    onLogout: () => void;
}

export const SubscriptionWall: React.FC<SubscriptionWallProps> = ({ userId, onPaymentSuccess, onLogout }) => {
    const { showToast } = useToast();
    const [loading, setLoading] = useState(false);
    const [selectedProvider, setSelectedProvider] = useState<'ORANGE' | 'MTN' | 'WAVE' | null>(null);

    const handlePayment = async (provider: 'ORANGE' | 'MTN' | 'WAVE') => {
        setLoading(true);
        setSelectedProvider(provider);
        audioEngine.play('click');
        
        try {
            const success = await processMobileMoneyPayment(userId, provider);
            if (success) {
                audioEngine.play('success');
                showToast("Paiement validé ! Accès débloqué pour 30 jours.", "success");
                setTimeout(() => {
                    onPaymentSuccess();
                }, 1000);
            } else {
                audioEngine.play('error');
                showToast("Échec de la transaction. Réessayez.", "error");
            }
        } catch (e) {
            showToast("Erreur de connexion.", "error");
        } finally {
            setLoading(false);
            setSelectedProvider(null);
        }
    };

    return (
        <div className="fixed inset-0 z-[200] bg-nexus-950 flex flex-col items-center justify-center p-6 relative overflow-hidden">
            {/* Background FX */}
            <div className="absolute top-[-10%] right-[-10%] w-[60%] h-[60%] bg-indigo-600/10 rounded-full blur-[150px] animate-pulse-slow"></div>
            <div className="absolute bottom-[-10%] left-[-10%] w-[60%] h-[60%] bg-emerald-600/10 rounded-full blur-[150px] animate-pulse-slow"></div>

            <div className="w-full max-w-md bg-slate-900/80 backdrop-blur-2xl border border-slate-700/50 p-8 rounded-[3rem] shadow-2xl relative z-10 animate-scale-in text-center">
                
                <div className="w-20 h-20 bg-slate-800 rounded-3xl mx-auto flex items-center justify-center mb-6 shadow-inner border border-slate-700">
                    <Lock size={32} className="text-indigo-500" />
                </div>

                <h2 className="text-3xl font-black text-white tracking-tighter mb-2">
                    Accès <span className="text-indigo-500">Expiré</span>
                </h2>
                
                <p className="text-slate-400 text-sm font-medium mb-8 leading-relaxed">
                    Votre période d'essai de 30 jours est terminée. Pour continuer à bénéficier de la puissance de l'Oracle Nexus, renouvelez votre accès.
                </p>

                <div className="bg-gradient-to-br from-indigo-900/50 to-slate-900 rounded-2xl p-6 border border-indigo-500/30 mb-8 relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-4 opacity-10"><Award size={64}/></div>
                    <div className="relative z-10 text-left">
                        <div className="text-[10px] font-black uppercase text-indigo-300 tracking-widest mb-1">Abonnement Premium</div>
                        <div className="text-4xl font-black text-white">3 000 F <span className="text-sm font-bold text-slate-400">/ mois</span></div>
                        <ul className="mt-4 space-y-2 text-xs text-slate-300 font-medium">
                            <li className="flex items-center gap-2"><ShieldCheck size={12} className="text-emerald-400"/> Accès illimité aux Prédictions IA</li>
                            <li className="flex items-center gap-2"><ShieldCheck size={12} className="text-emerald-400"/> Analyses Forensiques & Spectrales</li>
                            <li className="flex items-center gap-2"><ShieldCheck size={12} className="text-emerald-400"/> Support Prioritaire</li>
                        </ul>
                    </div>
                </div>

                <div className="space-y-3">
                    <button 
                        onClick={() => handlePayment('ORANGE')}
                        disabled={loading}
                        className="w-full py-4 bg-[#ff7900] hover:bg-[#e66e00] text-white font-black rounded-2xl shadow-lg transition-all active:scale-[0.98] uppercase tracking-widest text-xs flex items-center justify-center gap-3 disabled:opacity-50"
                    >
                        {loading && selectedProvider === 'ORANGE' ? <RefreshCw className="animate-spin" size={16}/> : <Smartphone size={16}/>}
                        Payer avec Orange Money
                    </button>
                    <button 
                        onClick={() => handlePayment('MTN')}
                        disabled={loading}
                        className="w-full py-4 bg-[#ffcc00] hover:bg-[#e6b800] text-black font-black rounded-2xl shadow-lg transition-all active:scale-[0.98] uppercase tracking-widest text-xs flex items-center justify-center gap-3 disabled:opacity-50"
                    >
                        {loading && selectedProvider === 'MTN' ? <RefreshCw className="animate-spin" size={16}/> : <Smartphone size={16}/>}
                        Payer avec MTN Money
                    </button>
                    <button 
                        onClick={() => handlePayment('WAVE')}
                        disabled={loading}
                        className="w-full py-4 bg-[#1dc4ff] hover:bg-[#1ab0e6] text-white font-black rounded-2xl shadow-lg transition-all active:scale-[0.98] uppercase tracking-widest text-xs flex items-center justify-center gap-3 disabled:opacity-50"
                    >
                        {loading && selectedProvider === 'WAVE' ? <RefreshCw className="animate-spin" size={16}/> : <Smartphone size={16}/>}
                        Payer avec Wave
                    </button>
                </div>

                <button onClick={onLogout} className="mt-8 text-xs font-bold text-slate-500 hover:text-white flex items-center justify-center gap-2 transition-colors">
                    <LogOut size={12}/> Se déconnecter
                </button>
            </div>
        </div>
    );
};
