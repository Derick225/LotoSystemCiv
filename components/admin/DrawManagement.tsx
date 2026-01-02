import React, { useState, useEffect, useRef } from 'react';
import { fetchResults, addResult, updateResult, deleteResult, bulkAddResults } from '../../services/lotteryService';
import { parseResultFromImage } from '../../services/geminiService';
import { ExportService } from '../../services/exportService';
import type { DrawResult } from '../../types';
import { NumberBall } from '../NumberBall';
import { useToast } from '../ui/Toast';
import { Pencil, Trash2, Plus, Save, RotateCcw, Upload, FileJson, Camera, Sparkles, Binary, History, LayoutGrid, Calendar, Download, ChevronRight, Stethoscope, RefreshCw } from 'lucide-react';
import { DRAW_SCHEDULE } from '../../constants';
import { DataIntegrityMonitor } from './DataIntegrityMonitor';

interface DrawManagementProps {
    drawName: string;
}

export const DrawManagement: React.FC<DrawManagementProps> = ({ drawName }) => {
    const { showToast } = useToast();
    const [results, setResults] = useState<DrawResult[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeSubTab, setActiveSubTab] = useState<'manual' | 'bulk' | 'audit'>('manual');
    
    // Vision OCR State
    const [isScanning, setIsScanning] = useState(false);
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);

    // Manual Form State
    const [isEditing, setIsEditing] = useState(false);
    const [editId, setEditId] = useState<string | null>(null);
    const [formDate, setFormDate] = useState(new Date().toISOString().split('T')[0]);
    const [formWin, setFormWin] = useState<string[]>(Array(5).fill(''));
    const [formMac, setFormMac] = useState<string[]>(Array(5).fill(''));
    const [isSaving, setIsSaving] = useState(false);

    // Bulk Import State
    const [bulkData, setBulkData] = useState<string>('');
    const [isImporting, setIsImporting] = useState(false);

    useEffect(() => { 
        resetForm();
        loadData(); 
    }, [drawName]);

    const loadData = async () => {
        setLoading(true);
        try {
            const { data } = await fetchResults(drawName);
            setResults(data);
        } catch (e) { showToast("Erreur de chargement", "error"); } finally { setLoading(false); }
    };

    const startCamera = async () => {
        setIsScanning(true);
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
                videoRef.current.play();
            }
        } catch (err) {
            showToast("Caméra inaccessible", "error");
            setIsScanning(false);
        }
    };

    const stopCamera = () => {
        if (videoRef.current && videoRef.current.srcObject) {
            const tracks = (videoRef.current.srcObject as MediaStream).getTracks();
            tracks.forEach(t => t.stop());
        }
        setIsScanning(false);
    };

    const captureAndParse = async () => {
        if (!videoRef.current || !canvasRef.current) return;
        const canvas = canvasRef.current;
        const video = videoRef.current;
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const base64 = canvas.toDataURL('image/jpeg', 0.8).split(',')[1];
        
        showToast("Analyse visuelle en cours...", "info");
        stopCamera();

        try {
            const parsed = await parseResultFromImage(base64);
            if (parsed && parsed.gagnants) {
                setFormWin(parsed.gagnants.map(String));
                if (parsed.machine) setFormMac(parsed.machine.map(String));
                if (parsed.date) {
                    const parts = parsed.date.split('/');
                    if (parts.length === 3) {
                         setFormDate(`${parts[2]}-${parts[1]}-${parts[0]}`);
                    }
                }
                showToast("Données extraites avec succès !", "success");
            } else {
                showToast("Impossible de lire l'image.", "error");
            }
        } catch (e) {
            showToast("Erreur Vision IA.", "error");
        }
    };

    const validateNumbers = (nums: number[]) => {
        if (nums.length !== 5) return "Veuillez saisir 5 numéros.";
        if (new Set(nums).size !== 5) return "Les numéros doivent être uniques.";
        if (nums.some(n => n < 1 || n > 90)) return "Les numéros doivent être entre 1 et 90.";
        return null;
    };

    const handleSave = async () => {
        const winNums = formWin.map(Number).filter(val => !isNaN(val) && val > 0);
        const macNums = formMac.map(Number).filter(val => !isNaN(val) && val > 0);
        const error = validateNumbers(winNums);
        if (error) { showToast(error, "error"); return; }
        setIsSaving(true);
        const [y, m, d] = formDate.split('-');
        const formattedDate = `${d}/${m}/${y}`;

        try {
            if (editId) {
                await updateResult(drawName, { 
                    id: editId, 
                    drawName: drawName,
                    date: formattedDate, 
                    gagnants: winNums, 
                    machine: macNums.length === 5 ? macNums : undefined,
                    version: 1
                });
                showToast(`Registre mis à jour.`, "success");
            } else {
                await addResult(drawName, { 
                    drawName: drawName,
                    date: formattedDate, 
                    gagnants: winNums, 
                    machine: macNums.length === 5 ? macNums : undefined,
                    version: 1
                });
                showToast(`Ajouté à ${drawName}.`, "success");
            }
            resetForm(); loadData();
        } catch (e: any) { showToast(e.message, "error"); } finally { setIsSaving(false); }
    };

    const parseLotoBonheurJSON = (json: any): any[] => {
        const results: any[] = [];
        const currentYear = new Date().getFullYear().toString();

        if (json.drawsResultsWeekly && Array.isArray(json.drawsResultsWeekly)) {
            json.drawsResultsWeekly.forEach((week: any) => {
                const yearMatch = week.startDate ? week.startDate.match(/\d{4}$/) : null;
                const year = yearMatch ? yearMatch[0] : currentYear;

                if (week.drawResultsDaily && Array.isArray(week.drawResultsDaily)) {
                    week.drawResultsDaily.forEach((daily: any) => {
                        const dateMatch = daily.date.match(/(\d{2})\/(\d{2})/);
                        if (!dateMatch) return;
                        const formattedDate = `${dateMatch[1]}/${dateMatch[2]}/${year}`;

                        if (daily.drawResults && Array.isArray(daily.drawResults.standardDraws)) {
                            daily.drawResults.standardDraws.forEach((draw: any) => {
                                const apiName = (draw.drawName || "").trim().toUpperCase();
                                let mappedName = null;
                                if (apiName === drawName.toUpperCase() || apiName.includes(drawName.toUpperCase())) {
                                    mappedName = drawName;
                                } else {
                                    Object.values(DRAW_SCHEDULE).forEach(daySched => {
                                        Object.values(daySched).forEach(schedName => {
                                            if (schedName.toUpperCase() === apiName) mappedName = schedName;
                                        });
                                    });
                                }

                                if (mappedName && draw.winningNumbers && !draw.winningNumbers.includes('..')) {
                                    const win = (draw.winningNumbers.match(/\d+/g) || []).map(Number);
                                    const mac = (draw.machineNumbers?.match(/\d+/g) || []).map(Number);
                                    
                                    if (win.length === 5) {
                                        results.push({
                                            draw_name: mappedName, 
                                            date: formattedDate,
                                            gagnants: win,
                                            machine: mac.length === 5 ? mac : [],
                                            version: 1
                                        });
                                    }
                                }
                            });
                        }
                    });
                }
            });
        }
        return results;
    };

    const handleBulkImport = async () => {
        if (!bulkData.trim()) return;
        setIsImporting(true);
        try {
            let parsedData;
            let importCount = 0;

            try {
                const json = JSON.parse(bulkData);
                if (json.drawsResultsWeekly || (Array.isArray(json) && json[0]?.drawsResultsWeekly)) {
                    const root = Array.isArray(json) ? { drawsResultsWeekly: json.flatMap((x:any) => x.drawsResultsWeekly || []) } : json;
                    parsedData = parseLotoBonheurJSON(root);
                    showToast(`Format API détecté : ${parsedData.length} tirages extraits.`, "info");
                } else if (Array.isArray(json)) {
                    parsedData = json;
                } else {
                    parsedData = [json];
                }
            } catch (e) {
                const rows = bulkData.split('\n');
                parsedData = rows.map(r => {
                    const parts = r.split(',');
                    if (parts.length < 6) return null;
                    return {
                        draw_name: drawName,
                        date: parts[0],
                        gagnants: parts.slice(1, 6).map(Number),
                        machine: parts.slice(6, 11).map(Number)
                    };
                }).filter(x => x !== null);
            }

            if (!parsedData || parsedData.length === 0) throw new Error("Format non reconnu ou aucune donnée valide.");
            
            const finalizedData = parsedData.map((d: any) => ({
                ...d,
                draw_name: d.draw_name || drawName 
            }));

            const groupedByName: Record<string, any[]> = {};
            finalizedData.forEach((d: any) => {
                if (!groupedByName[d.draw_name]) groupedByName[d.draw_name] = [];
                groupedByName[d.draw_name].push(d);
            });

            for (const [name, batch] of Object.entries(groupedByName)) {
                await bulkAddResults(name, batch);
                importCount += batch.length;
            }
            
            showToast(`${importCount} résultats importés avec succès !`, "success");
            setBulkData('');
            loadData();
        } catch (e: any) {
            showToast(`Échec Import : ${e.message}`, "error");
        } finally {
            setIsImporting(false);
        }
    };

    const resetForm = () => {
        setIsEditing(false); setEditId(null); setFormWin(Array(5).fill('')); setFormMac(Array(5).fill(''));
        setFormDate(new Date().toISOString().split('T')[0]);
    };

    return (
        <div className="space-y-6 animate-fade-in">
            {/* Header Actions Card */}
            <div className="bg-slate-900 text-white p-4 md:p-6 rounded-[2.2rem] md:rounded-[3rem] flex flex-col sm:flex-row items-center justify-between shadow-2xl border border-slate-800 gap-4">
                <div className="flex items-center gap-4 w-full sm:w-auto">
                    <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-600/20"><History size={22} className="text-white" /></div>
                    <div>
                        <span className="text-[9px] font-black uppercase tracking-[0.2em] text-indigo-400">Registre Master</span>
                        <h4 className="text-lg md:text-xl font-black leading-none">{drawName}</h4>
                    </div>
                </div>
                <div className="flex gap-2 w-full sm:w-auto justify-end overflow-x-auto scrollbar-hide">
                    <button onClick={() => setActiveSubTab('manual')} className={`flex-1 sm:flex-none px-4 py-3 rounded-xl transition-all border border-white/5 text-[9px] font-black uppercase flex items-center justify-center gap-2 ${activeSubTab === 'manual' ? 'bg-white text-slate-900 shadow-xl' : 'bg-white/5 text-slate-400 hover:bg-white/10'}`}>
                        <Pencil size={14}/> Saisie
                    </button>
                    <button onClick={() => setActiveSubTab('bulk')} className={`flex-1 sm:flex-none px-4 py-3 rounded-xl transition-all border border-white/5 text-[9px] font-black uppercase flex items-center justify-center gap-2 ${activeSubTab === 'bulk' ? 'bg-white text-slate-900 shadow-xl' : 'bg-white/5 text-slate-400 hover:bg-white/10'}`}>
                        <LayoutGrid size={14}/> Bulk
                    </button>
                    <button onClick={() => setActiveSubTab('audit')} className={`flex-1 sm:flex-none px-4 py-3 rounded-xl transition-all border border-white/5 text-[9px] font-black uppercase flex items-center justify-center gap-2 ${activeSubTab === 'audit' ? 'bg-emerald-50 text-white shadow-xl' : 'bg-white/5 text-slate-400 hover:bg-white/10'}`}>
                        <Stethoscope size={14}/> Audit
                    </button>
                </div>
            </div>

            {/* TAB CONTENT: MANUAL ENTRY */}
            {activeSubTab === 'manual' && (
                <div className="grid md:grid-cols-2 gap-8">
                    {/* Formulaire */}
                    <div className="bg-white dark:bg-slate-800 p-8 rounded-[3rem] border border-slate-100 dark:border-slate-700 shadow-xl">
                        <div className="flex justify-between items-center mb-8">
                            <h3 className="font-black text-slate-700 dark:text-white uppercase tracking-tight flex items-center gap-2">
                                {isEditing ? <Pencil size={18}/> : <Plus size={18}/>}
                                {isEditing ? 'Modification' : 'Nouveau Résultat'}
                            </h3>
                            {isEditing && <button onClick={resetForm} className="p-2 bg-slate-100 dark:bg-slate-700 rounded-full hover:rotate-180 transition-transform"><RotateCcw size={16}/></button>}
                        </div>

                        <div className="space-y-6">
                            <div>
                                <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-2 block">Date du Tirage</label>
                                <div className="relative">
                                    <input type="date" value={formDate} onChange={(e) => setFormDate(e.target.value)} className="w-full p-4 pl-12 bg-slate-50 dark:bg-slate-900 rounded-2xl font-bold text-slate-700 dark:text-white border-2 border-transparent focus:border-indigo-500 outline-none transition-all" />
                                    <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                                </div>
                            </div>

                            <div>
                                <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-2 flex justify-between">
                                    <span>Numéros Gagnants</span>
                                    <span className="text-indigo-500 flex items-center gap-1"><Sparkles size={10}/> 5 requis</span>
                                </label>
                                <div className="flex gap-2">
                                    {formWin.map((val, idx) => (
                                        <input key={`win-${idx}`} type="number" min="1" max="90" value={val} onChange={(e) => { const n = [...formWin]; n[idx] = e.target.value; setFormWin(n); }} className="w-full aspect-square text-center font-black text-lg bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300 rounded-xl border-2 border-indigo-100 dark:border-indigo-800 focus:border-indigo-500 outline-none transition-all placeholder-indigo-200" placeholder={(idx+1).toString()} />
                                    ))}
                                </div>
                            </div>

                            <div>
                                <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-2 flex justify-between">
                                    <span>Numéros Machine (Optionnel)</span>
                                    <span className="text-slate-500 flex items-center gap-1"><Binary size={10}/> Machine</span>
                                </label>
                                <div className="flex gap-2">
                                    {formMac.map((val, idx) => (
                                        <input key={`mac-${idx}`} type="number" min="1" max="90" value={val} onChange={(e) => { const n = [...formMac]; n[idx] = e.target.value; setFormMac(n); }} className="w-full aspect-square text-center font-bold text-base bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-400 rounded-xl border-2 border-slate-100 dark:border-slate-800 focus:border-slate-400 outline-none transition-all placeholder-slate-200" placeholder="-" />
                                    ))}
                                </div>
                            </div>

                            <div className="pt-4 flex gap-4">
                                <button onClick={() => isScanning ? stopCamera() : startCamera()} className={`p-4 rounded-2xl transition-all shadow-lg flex items-center justify-center gap-2 ${isScanning ? 'bg-rose-500 text-white animate-pulse' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}>
                                    <Camera size={20} />
                                </button>
                                <button onClick={handleSave} disabled={isSaving} className="flex-1 py-4 bg-indigo-600 hover:bg-indigo-500 text-white font-black rounded-2xl shadow-xl shadow-indigo-600/20 transition-all active:scale-[0.98] uppercase tracking-widest text-xs flex items-center justify-center gap-2 disabled:opacity-50">
                                    {isSaving ? <RefreshCw className="animate-spin" size={16}/> : <Save size={16}/>}
                                    {isEditing ? 'Mettre à jour' : 'Enregistrer'}
                                </button>
                            </div>

                            {/* Camera Viewport */}
                            {isScanning && (
                                <div className="relative rounded-2xl overflow-hidden shadow-2xl border-4 border-indigo-500 mt-4 animate-scale-in">
                                    <video ref={videoRef} className="w-full h-48 object-cover" autoPlay playsInline muted></video>
                                    <canvas ref={canvasRef} className="hidden"></canvas>
                                    <div className="absolute bottom-4 left-0 right-0 flex justify-center">
                                        <button onClick={captureAndParse} className="px-6 py-2 bg-white text-indigo-600 rounded-full font-black text-xs uppercase shadow-lg hover:scale-105 transition">Capturer</button>
                                    </div>
                                    <div className="absolute inset-0 border-2 border-white/30 pointer-events-none flex items-center justify-center"><div className="w-3/4 h-1/2 border-2 border-dashed border-white/50 rounded-lg"></div></div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Liste Historique */}
                    <div className="bg-slate-50 dark:bg-slate-900/50 p-6 rounded-[3rem] border border-slate-200 dark:border-slate-800 h-[600px] flex flex-col">
                        <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-6 px-2">Derniers Enregistrements</h4>
                        <div className="flex-1 overflow-y-auto space-y-3 pr-2 custom-scrollbar">
                            {results.map(r => (
                                <div key={r.id} className="bg-white dark:bg-slate-800 p-4 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700 flex justify-between items-center group hover:border-indigo-300 transition-all">
                                    <div>
                                        <div className="text-xs font-black text-slate-800 dark:text-white">{r.date}</div>
                                        <div className="flex gap-1 mt-1.5">
                                            {r.gagnants.map(n => <span key={n} className="w-5 h-5 rounded bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 flex items-center justify-center text-[9px] font-bold">{n}</span>)}
                                        </div>
                                    </div>
                                    <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button onClick={() => { setIsEditing(true); setEditId(r.id); setFormWin(r.gagnants.map(String)); if(r.machine) setFormMac(r.machine.map(String)); }} className="p-2 bg-slate-100 dark:bg-slate-700 text-slate-500 rounded-lg hover:text-indigo-600"><Pencil size={14}/></button>
                                        <button onClick={() => { if(confirm('Supprimer ?')) deleteResult(drawName, r.id).then(loadData); }} className="p-2 bg-rose-50 dark:bg-rose-900/20 text-rose-500 rounded-lg hover:bg-rose-100"><Trash2 size={14}/></button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* TAB CONTENT: BULK IMPORT */}
            {activeSubTab === 'bulk' && (
                <div className="bg-white dark:bg-slate-800 p-8 rounded-[3rem] border border-slate-100 dark:border-slate-700 shadow-xl">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="p-3 bg-amber-100 dark:bg-amber-900/30 text-amber-600 rounded-2xl"><Upload size={20}/></div>
                        <div>
                            <h3 className="font-black text-slate-800 dark:text-white uppercase">Import de Masse</h3>
                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Support JSON (API) & CSV</p>
                        </div>
                    </div>
                    
                    <textarea 
                        value={bulkData}
                        onChange={(e) => setBulkData(e.target.value)}
                        className="w-full h-64 p-6 bg-slate-50 dark:bg-slate-900 rounded-3xl border-2 border-dashed border-slate-200 dark:border-slate-700 focus:border-indigo-500 outline-none font-mono text-xs text-slate-600 dark:text-slate-300 resize-none transition-colors mb-6"
                        placeholder={`Collez ici le JSON de l'API ou un CSV au format:\nDD/MM/YYYY,G1,G2,G3,G4,G5,M1,M2,M3,M4,M5`}
                    />
                    
                    <div className="flex justify-end gap-4">
                        <button onClick={() => setBulkData('')} className="px-6 py-4 rounded-2xl font-bold text-xs text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 transition">Effacer</button>
                        <button onClick={handleBulkImport} disabled={isImporting} className="px-10 py-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl flex items-center gap-3 disabled:opacity-50 transition active:scale-95">
                            {isImporting ? <RefreshCw className="animate-spin" size={16}/> : <FileJson size={16}/>} Traiter les données
                        </button>
                    </div>
                </div>
            )}

            {/* TAB CONTENT: AUDIT */}
            {activeSubTab === 'audit' && (
                <DataIntegrityMonitor drawName={drawName} />
            )}
        </div>
    );
};