
import React, { useState, useRef } from 'react';
import { ScanBarcode, Camera, Upload, AlertCircle, CheckCircle, RefreshCw, X, FileText } from 'lucide-react';
import { invokeEdgeFunction } from '../services/apiClient';
import { useNexus } from './NexusProvider';
import { useToast } from './ui/Toast';
import { NumberBall } from './NumberBall';
import { motion, AnimatePresence } from 'framer-motion';

export const TicketScanner: React.FC = () => {
    const { showToast } = useToast();
    const { lastPrediction } = useNexus();
    
    const [isScanning, setIsScanning] = useState(false);
    const [scannedData, setScannedData] = useState<{date: string, gagnants: number[], machine: number[]} | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const processImage = async (file: File) => {
        setIsScanning(true);
        setScannedData(null);
        showToast("Analyse optique en cours (Quantum Vision)...", "info");

        try {
            // 1. Compression Client-Side (Canvas)
            const compressedBase64 = await compressImage(file);
            
            // 2. Appel Edge Function (Gemini Vision)
            const { data, error } = await invokeEdgeFunction('vision-ocr', {
                body: { imageBase64: compressedBase64 }
            });

            if (error) throw error;

            if (data && data.gagnants && Array.isArray(data.gagnants)) {
                setScannedData({
                    date: data.date || 'Inconnue',
                    gagnants: data.gagnants,
                    machine: data.machine || []
                });
                showToast("Ticket décodé avec succès.", "success");
            } else {
                throw new Error("Format non reconnu.");
            }

        } catch (e: any) {
            console.error("OCR Error", e);
            showToast("Échec de la lecture optique. Réessayez avec une image plus claire.", "error");
        } finally {
            setIsScanning(false);
        }
    };

    const compressImage = (file: File): Promise<string> => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = (event) => {
                const img = new Image();
                img.src = event.target?.result as string;
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    const MAX_WIDTH = 800;
                    const scaleSize = MAX_WIDTH / img.width;
                    canvas.width = MAX_WIDTH;
                    canvas.height = img.height * scaleSize;
                    
                    const ctx = canvas.getContext('2d');
                    ctx?.drawImage(img, 0, 0, canvas.width, canvas.height);
                    
                    // Conversion en JPEG base64 (sans le préfixe data:image...)
                    const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
                    const base64 = dataUrl.split(',')[1];
                    resolve(base64);
                };
                img.onerror = reject;
            };
            reader.onerror = reject;
        });
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) processImage(file);
    };

    const getMatchScore = (numbers: number[]) => {
        if (!lastPrediction) return 0;
        const hits = numbers.filter(n => lastPrediction.suggestedNumbers.includes(n)).length;
        const close = numbers.filter(n => lastPrediction.candidates.includes(n)).length;
        return (hits * 20) + (close * 5); // Score arbitraire sur 100
    };

    return (
        <div className="space-y-8 animate-fade-in pb-20 w-full overflow-hidden">
            {/* Header Scanner */}
            <div className="bg-slate-900 border border-indigo-500/20 p-8 rounded-[3rem] shadow-2xl relative overflow-hidden text-center group">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-indigo-500 to-transparent animate-pulse-slow"></div>
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(99,102,241,0.1),transparent)] opacity-50"></div>
                
                <div className="relative z-10 flex flex-col items-center">
                    <div className="p-4 bg-indigo-600 rounded-full shadow-lg shadow-indigo-600/30 mb-6 animate-float">
                        <ScanBarcode size={32} className="text-white"/>
                    </div>
                    <h2 className="text-3xl md:text-4xl font-black text-white tracking-tighter uppercase mb-2">
                        Quantum <span className="text-indigo-500">Scanner</span>
                    </h2>
                    <p className="text-slate-400 text-xs md:text-sm font-medium max-w-md mx-auto mb-8">
                        Numérisez vos tickets physiques via l'IA Vision. Le système auditera vos jeux par rapport aux vecteurs de l'Oracle.
                    </p>

                    <div className="flex gap-4">
                        <button 
                            onClick={() => fileInputRef.current?.click()}
                            disabled={isScanning}
                            className="px-8 py-4 bg-white text-slate-900 hover:bg-indigo-50 rounded-[2rem] font-black text-xs uppercase tracking-[0.2em] shadow-xl flex items-center justify-center gap-3 transition-all active:scale-95 disabled:opacity-50 min-w-[200px]"
                        >
                            {isScanning ? <RefreshCw className="animate-spin" size={18}/> : <Camera size={18}/>}
                            {isScanning ? 'Analyse...' : 'Scanner Ticket'}
                        </button>
                        <input 
                            type="file" 
                            accept="image/*" 
                            capture="environment" 
                            ref={fileInputRef} 
                            onChange={handleFileChange} 
                            className="hidden" 
                        />
                    </div>
                </div>
            </div>

            {/* Results Area */}
            <AnimatePresence>
                {scannedData && (
                    <motion.div 
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        className="bg-white dark:bg-slate-800 p-8 rounded-[3rem] shadow-2xl border border-slate-100 dark:border-slate-700 relative overflow-hidden"
                    >
                        <div className="flex justify-between items-center mb-8 pb-4 border-b border-slate-100 dark:border-slate-700">
                            <div className="flex items-center gap-3">
                                <FileText size={20} className="text-indigo-500"/>
                                <div>
                                    <h3 className="font-black text-slate-800 dark:text-white uppercase tracking-widest text-sm">Ticket Décodé</h3>
                                    <p className="text-[10px] text-slate-400 font-bold">{scannedData.date}</p>
                                </div>
                            </div>
                            <button onClick={() => setScannedData(null)} className="p-2 text-slate-400 hover:text-rose-500 transition"><X size={18}/></button>
                        </div>

                        <div className="space-y-8">
                            <div className="text-center">
                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4 block">Numéros Identifiés</span>
                                <div className="flex flex-wrap justify-center gap-4">
                                    {scannedData.gagnants.map(n => (
                                        <NumberBall key={n} number={n} size="lg" />
                                    ))}
                                </div>
                            </div>

                            {lastPrediction && (
                                <div className="bg-slate-50 dark:bg-slate-900/50 p-6 rounded-[2rem] border border-slate-100 dark:border-slate-800">
                                    <h4 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-4 text-center">Audit de Conformité Oracle</h4>
                                    
                                    <div className="flex justify-center items-center gap-8 mb-6">
                                        <div className="text-center">
                                            <div className="text-3xl font-black text-indigo-600 dark:text-indigo-400">{getMatchScore(scannedData.gagnants)}%</div>
                                            <div className="text-[9px] font-bold text-slate-400 uppercase">Score Qualité</div>
                                        </div>
                                        {getMatchScore(scannedData.gagnants) > 50 ? (
                                            <div className="p-3 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 rounded-full">
                                                <CheckCircle size={24}/>
                                            </div>
                                        ) : (
                                            <div className="p-3 bg-amber-100 dark:bg-amber-900/30 text-amber-600 rounded-full">
                                                <AlertCircle size={24}/>
                                            </div>
                                        )}
                                    </div>

                                    <div className="text-center text-xs text-slate-500 font-medium">
                                        {getMatchScore(scannedData.gagnants) > 50 
                                            ? "Ce ticket est aligné avec les vecteurs de l'IA." 
                                            : "Ce ticket diverge des prédictions actuelles."}
                                    </div>
                                </div>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};
