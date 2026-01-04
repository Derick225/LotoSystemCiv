
import React from 'react';
import { Volume2, VolumeX, Smartphone, Zap, Moon, Sun, X, Activity, Save } from 'lucide-react';
import { audioEngine } from '../../utils/audioEngine';
import { useHaptics } from '../../hooks/useHaptics';
import { saveSettings, UserSettings } from '../../services/userPreferencesService';
import { useToast } from '../ui/Toast';

interface SettingsSheetProps {
    isOpen: boolean;
    onClose: () => void;
    settings: UserSettings;
    setSettings: (s: UserSettings) => void;
}

export const SettingsSheet: React.FC<SettingsSheetProps> = ({ isOpen, onClose, settings, setSettings }) => {
    const { vibrate } = useHaptics();
    const { showToast } = useToast();

    if (!isOpen) return null;

    const handleUpdate = (key: keyof UserSettings, value: any) => {
        const newSettings = { ...settings, [key]: value };
        setSettings(newSettings);
        
        // Effets immédiats
        if (key === 'sound') audioEngine.setEnabled(value);
        if (key === 'haptics' && value) vibrate('medium');
        
        // Sauvegarde persistante (Debounce possible mais ici direct pour simplicité)
        saveSettings(newSettings);
    };

    return (
        <div className="fixed inset-0 z-[100] bg-slate-950/60 backdrop-blur-sm flex justify-end animate-fade-in" onClick={onClose}>
            <div 
                className="w-80 bg-slate-900 h-full p-6 shadow-2xl border-l border-slate-800 animate-slide-up flex flex-col"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex justify-between items-center mb-10">
                    <h3 className="text-xl font-black text-white uppercase tracking-tighter">Système</h3>
                    <button onClick={onClose} className="p-2 bg-slate-800 rounded-full hover:bg-slate-700 text-white"><X size={18}/></button>
                </div>

                <div className="space-y-6 flex-1">
                    {/* Audio Toggle */}
                    <div className="bg-slate-800/50 p-4 rounded-2xl border border-slate-700 flex justify-between items-center">
                        <div className="flex items-center gap-3">
                            {settings.sound ? <Volume2 className="text-indigo-400"/> : <VolumeX className="text-slate-500"/>}
                            <div>
                                <div className="text-sm font-bold text-white">Audio FX</div>
                                <div className="text-[10px] text-slate-400">Sons d'interface</div>
                            </div>
                        </div>
                        <button 
                            onClick={() => handleUpdate('sound', !settings.sound)}
                            className={`w-12 h-6 rounded-full transition-colors relative ${settings.sound ? 'bg-indigo-600' : 'bg-slate-700'}`}
                        >
                            <div className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${settings.sound ? 'translate-x-6' : ''}`}></div>
                        </button>
                    </div>

                    {/* Haptics Toggle */}
                    <div className="bg-slate-800/50 p-4 rounded-2xl border border-slate-700 flex justify-between items-center">
                        <div className="flex items-center gap-3">
                            <Smartphone className={settings.haptics ? "text-emerald-400" : "text-slate-500"}/>
                            <div>
                                <div className="text-sm font-bold text-white">Haptique</div>
                                <div className="text-[10px] text-slate-400">Vibrations tactiles</div>
                            </div>
                        </div>
                        <button 
                            onClick={() => handleUpdate('haptics', !settings.haptics)}
                            className={`w-12 h-6 rounded-full transition-colors relative ${settings.haptics ? 'bg-emerald-500' : 'bg-slate-700'}`}
                        >
                            <div className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${settings.haptics ? 'translate-x-6' : ''}`}></div>
                        </button>
                    </div>

                    {/* High Perf Toggle */}
                    <div className="bg-slate-800/50 p-4 rounded-2xl border border-slate-700 flex justify-between items-center">
                        <div className="flex items-center gap-3">
                            <Activity className={settings.highPerf ? "text-amber-400" : "text-slate-500"}/>
                            <div>
                                <div className="text-sm font-bold text-white">Mode Turbo</div>
                                <div className="text-[10px] text-slate-400">Animations fluides</div>
                            </div>
                        </div>
                        <button 
                            onClick={() => handleUpdate('highPerf', !settings.highPerf)}
                            className={`w-12 h-6 rounded-full transition-colors relative ${settings.highPerf ? 'bg-amber-500' : 'bg-slate-700'}`}
                        >
                            <div className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${settings.highPerf ? 'translate-x-6' : ''}`}></div>
                        </button>
                    </div>
                </div>

                <div className="mt-auto">
                    <div className="text-center p-4 border border-dashed border-slate-700 rounded-2xl bg-black/20">
                        <div className="flex items-center justify-center gap-2 mb-2 text-emerald-500 text-[10px] font-black uppercase tracking-widest">
                            <Save size={12}/> Cloud Sync Actif
                        </div>
                        <p className="text-[10px] text-slate-500 font-mono">Build v11.1 (Platinum)</p>
                        <p className="text-[9px] text-slate-600 mt-1">ID: {crypto.randomUUID().slice(0, 8)}</p>
                    </div>
                </div>
            </div>
        </div>
    );
};
