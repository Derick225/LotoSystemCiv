
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { fetchResults, addResult, updateResult, deleteResult, bulkAddResults } from '../../services/lotteryService';
import { parseResultFromImage } from '../../services/geminiService';
import type { DrawResult } from '../../types';
import { NumberBall } from '../NumberBall';
import { useToast } from '../ui/Toast';
import { Pencil, Trash2, Plus, Save, RotateCcw, Upload, Camera, Sparkles, Binary, History, LayoutGrid, Calendar, Download, Stethoscope, RefreshCw, FileSpreadsheet, CheckCircle2, AlertTriangle, X, Clipboard, Filter } from 'lucide-react';
import { DataIntegrityMonitor } from './DataIntegrityMonitor';

interface DrawManagementProps {
    drawName: string;
}

interface PreviewRow {
    date: string;
    gagnants: number[];
    machine: number[];
    isValid: boolean;
    error?: string;
    rawLine?: string;
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

    // Bulk Import State Enhanced
    const [isImporting, setIsImporting] = useState(false);
    const [previewData, setPreviewData] = useState<PreviewRow[]>([]);
    const [importStep, setImportStep] = useState<'upload' | 'preview'>('upload');
    const [uploadMode, setUploadMode] = useState<'file' | 'text'>('text');
    const [pasteContent, setPasteContent] = useState('');
    const [viewFilter, setViewFilter] = useState<'all' | 'valid' | 'error'>('all');
    
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => { 
        resetForm();
        loadData(); 
        setPreviewData([]);
        setImportStep('upload');
        setPasteContent('');
        setViewFilter('all');
    }, [drawName]);

    const loadData = async () => {
        setLoading(true);
        try {
            const { data } = await fetchResults(drawName);
            setResults(data);
        } catch (e) { showToast("Erreur de chargement", "error"); } finally { setLoading(false); }
    };

    // --- MANUAL & CAMERA LOGIC ---
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

    const resetForm = () => {
        setIsEditing(false); setEditId(null); setFormWin(Array(5).fill('')); setFormMac(Array(5).fill(''));
        setFormDate(new Date().toISOString().split('T')[0]);
    };

    // --- BULK IMPORT LOGIC ---

    const processRawData = (content: string) => {
        const lines = content.split(/\r?\n/).filter(line => line.trim() !== '');
        const preview: PreviewRow[] = [];

        lines.forEach((line, index) => {
            // Ignorer l'entête si présent (détection heuristique)
            if (index === 0 && (line.toLowerCase().includes('date') || line.toLowerCase().includes('g1'))) return;

            // Nettoyage et split (support virgule, point-virgule et tabulation)
            // Priorité: Tabulation (Excel) > Point-virgule > Virgule
            let separator = ',';
            if (line.includes('\t')) separator = '\t';
            else if (line.includes(';')) separator = ';';
            
            // Nettoyage des caractères invisibles et espaces
            const cleanLine = line.replace(/['"]/g, '').trim();
            const parts = cleanLine.split(separator).map(p => p.trim()).filter(p => p !== '');

            if (parts.length < 6) {
                // Pas assez de colonnes, tentative de parsing plus flexible si c'est juste des espaces
                const spaceParts = cleanLine.split(/\s+/).map(p => p.trim());
                if (spaceParts.length >= 6) {
                     // Utiliser l'espace comme séparateur si ça marche mieux
                     // Logique simplifiée pour éviter de casser le CSV standard
                } else {
                    preview.push({ date: '?', gagnants: [], machine: [], isValid: false, error: 'Format incomplet (min 6 colonnes)', rawLine: line });
                    return;
                }
            }

            const dateStr = parts[0];
            const winners = parts.slice(1, 6).map(Number);
            const machine = parts.slice(6, 11).map(Number).filter(n => !isNaN(n)); // Machine optionnelle

            // Validation
            let isValid = true;
            let error = '';

            // Check Date (Simple format check)
            if (!dateStr.match(/^\d{2}\/\d{2}\/\d{4}$/) && !dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
                isValid = false; error = 'Date invalide (DD/MM/YYYY ou YYYY-MM-DD)';
            }
            // Check Winners
            if (winners.some(isNaN) || winners.length !== 5 || new Set(winners).size !== 5 || winners.some(n => n < 1 || n > 90)) {
                isValid = false; error = 'Numéros gagnants invalides';
            }

            preview.push({
                date: dateStr,
                gagnants: winners,
                machine: machine.length === 5 ? machine : [],
                isValid,
                error,
                rawLine: line
            });
        });

        setPreviewData(preview);
        setImportStep('preview');
        setViewFilter('all');
        
        const validCount = preview.filter(r => r.isValid).length;
        if (validCount === 0 && preview.length > 0) {
            showToast("Attention: Aucune donnée valide détectée.", "error");
        } else if (preview.length > 0) {
            showToast(`${validCount} lignes valides prêtes.`, "success");
        }
    };

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            const text = event.target?.result as string;
            processRawData(text);
        };
        reader.readAsText(file);
    };

    const downloadTemplate = () => {
        const csvContent = "Date,G1,G2,G3,G4,G5,M1,M2,M3,M4,M5\n01/01/2024,5,12,34,56,89,1,2,3,4,5";
        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'nexus_import_template.csv';
        a.click();
    };

    const confirmImport = async () => {
        const validRows = previewData.filter(r => r.isValid);
        if (validRows.length === 0) return;

        setIsImporting(true);
        try {
            // DEDOUBLONNAGE CRITIQUE : Postgres interdit de mettre à jour la même ligne 2x dans le même batch
            // On utilise une Map pour ne garder que la dernière occurrence de chaque date
            const uniqueMap = new Map();
            
            validRows.forEach(row => {
                // Normalisation si nécessaire (ici on suppose que row.date est la clé unique pour ce tirage)
                uniqueMap.set(row.date, {
                    draw_name: drawName,
                    date: row.date,
                    gagnants: row.gagnants,
                    machine: row.machine,
                    version: 1
                });
            });

            const batch = Array.from(uniqueMap.values());

            // Si des doublons ont été retirés, on prévient l'utilisateur
            if (batch.length < validRows.length) {
                const diff = validRows.length - batch.length;
                showToast(`${diff} doublons ignorés automatiquement (Date identique).`, "info");
            }

            await bulkAddResults(drawName, batch);
            showToast(`${batch.length} tirages importés avec succès.`, "success");
            setPreviewData([]);
            setImportStep('upload');
            setPasteContent('');
            loadData();
        } catch (e: any) {
            showToast(`Erreur Import: ${e.message}`, "error");
        } finally {
            setIsImporting(false);
        }
    };

    // Calculs pour l'affichage Preview
    const validCount = useMemo(() => previewData.filter(r => r.isValid).length, [previewData]);
    const errorCount = useMemo(() => previewData.filter(r => !r.isValid).length, [previewData]);
    const filteredPreview = useMemo(() => {
        if (viewFilter === 'valid') return previewData.filter(r => r.isValid);
        if (viewFilter === 'error') return previewData.filter(r => !r.isValid);
        return previewData;
    }, [previewData, viewFilter]);

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
                        <LayoutGrid size={14}/> Import
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
                <div className="bg-white dark:bg-slate-800 p-8 rounded-[3rem] border border-slate-100 dark:border-slate-700 shadow-xl transition-all">
                    
                    {importStep === 'upload' && (
                        <div className="animate-slide-up">
                            <div className="flex justify-between items-center mb-8">
                                <div className="flex items-center gap-3">
                                    <div className="p-3 bg-amber-100 dark:bg-amber-900/30 text-amber-600 rounded-2xl"><Upload size={20}/></div>
                                    <div>
                                        <h3 className="font-black text-slate-800 dark:text-white uppercase">Import de Masse</h3>
                                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Support CSV & Copier-Coller</p>
                                    </div>
                                </div>
                                <button onClick={downloadTemplate} className="text-xs font-bold text-indigo-500 flex items-center gap-2 hover:underline"><Download size={14}/> Télécharger Modèle CSV</button>
                            </div>

                            {/* MODE SWITCHER */}
                            <div className="flex gap-2 mb-6 bg-slate-100 dark:bg-slate-900/50 p-1 rounded-xl w-fit">
                                <button 
                                    onClick={() => setUploadMode('text')} 
                                    className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 ${uploadMode === 'text' ? 'bg-white dark:bg-slate-800 shadow-md text-indigo-600 dark:text-white' : 'text-slate-400 hover:text-slate-600'}`}
                                >
                                    <Clipboard size={14}/> Copier/Coller
                                </button>
                                <button 
                                    onClick={() => setUploadMode('file')} 
                                    className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${uploadMode === 'file' ? 'bg-white dark:bg-slate-800 shadow-md text-indigo-600 dark:text-white' : 'text-slate-400 hover:text-slate-600'}`}
                                >
                                    Fichier (CSV)
                                </button>
                            </div>

                            {uploadMode === 'file' ? (
                                <>
                                    <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept=".csv,.json" className="hidden" />
                                    
                                    <div 
                                        onClick={() => fileInputRef.current?.click()}
                                        className="w-full h-48 border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-3xl flex flex-col items-center justify-center gap-4 cursor-pointer hover:border-indigo-500 hover:bg-slate-50 dark:hover:bg-slate-900/50 transition-all group"
                                    >
                                        <div className="w-16 h-16 bg-slate-100 dark:bg-slate-900 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform">
                                            <FileSpreadsheet size={32} className="text-slate-400 group-hover:text-indigo-500" />
                                        </div>
                                        <div className="text-center">
                                            <p className="text-sm font-bold text-slate-600 dark:text-slate-300">Cliquez ou Glissez votre fichier CSV</p>
                                            <p className="text-xs text-slate-400 mt-1">Format: Date, G1, G2, G3, G4, G5, [M1..M5]</p>
                                        </div>
                                    </div>
                                </>
                            ) : (
                                <div className="space-y-4">
                                    <textarea
                                        value={pasteContent}
                                        onChange={(e) => setPasteContent(e.target.value)}
                                        className="w-full h-48 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-3xl p-6 font-mono text-xs text-slate-600 dark:text-slate-300 focus:border-indigo-500 focus:ring-4 ring-indigo-500/10 outline-none transition-all resize-none"
                                        placeholder={`Collez vos données ici...\nFormats acceptés:\n01/01/2024, 5, 12, 34, 56, 89\n02/01/2024; 10; 20; 30; 40; 50\n03/01/2024 \t 1 \t 2 \t 3 \t 4 \t 5`}
                                    />
                                    <div className="flex justify-end">
                                        <button 
                                            onClick={() => processRawData(pasteContent)}
                                            disabled={!pasteContent.trim()}
                                            className="px-8 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                                        >
                                            <Binary size={16}/> Analyser le contenu
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {importStep === 'preview' && (
                        <div className="animate-slide-up space-y-6">
                            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                                <div className="flex-1">
                                    <div className="flex items-center gap-3">
                                        <h3 className="font-black text-slate-800 dark:text-white uppercase">Validation</h3>
                                        <div className="flex gap-2">
                                            <span className="px-2 py-0.5 bg-slate-100 dark:bg-slate-700 rounded text-[10px] font-bold text-slate-500">{previewData.length} Total</span>
                                            <span className="px-2 py-0.5 bg-emerald-100 dark:bg-emerald-900/30 rounded text-[10px] font-bold text-emerald-600">{validCount} Valides</span>
                                            {errorCount > 0 && <span className="px-2 py-0.5 bg-rose-100 dark:bg-rose-900/30 rounded text-[10px] font-bold text-rose-600">{errorCount} Erreurs</span>}
                                        </div>
                                    </div>
                                </div>
                                <div className="flex gap-2 bg-slate-100 dark:bg-slate-900 p-1 rounded-xl">
                                    <button onClick={() => setViewFilter('all')} className={`px-4 py-2 rounded-lg text-[10px] font-bold uppercase transition ${viewFilter === 'all' ? 'bg-white dark:bg-slate-700 shadow text-indigo-600 dark:text-white' : 'text-slate-500'}`}>Tous</button>
                                    <button onClick={() => setViewFilter('valid')} className={`px-4 py-2 rounded-lg text-[10px] font-bold uppercase transition ${viewFilter === 'valid' ? 'bg-white dark:bg-slate-700 shadow text-emerald-600' : 'text-slate-500'}`}>Valides</button>
                                    <button onClick={() => setViewFilter('error')} className={`px-4 py-2 rounded-lg text-[10px] font-bold uppercase transition ${viewFilter === 'error' ? 'bg-white dark:bg-slate-700 shadow text-rose-600' : 'text-slate-500'}`}>Erreurs</button>
                                </div>
                                <button onClick={() => { setImportStep('upload'); setPreviewData([]); }} className="p-2 bg-slate-100 dark:bg-slate-700 rounded-full hover:bg-slate-200 dark:hover:bg-slate-600"><X size={16}/></button>
                            </div>

                            <div className="max-h-[400px] overflow-y-auto custom-scrollbar border border-slate-200 dark:border-slate-700 rounded-2xl bg-slate-50/50 dark:bg-slate-900/50">
                                <table className="w-full text-left text-xs">
                                    <thead className="bg-slate-100 dark:bg-slate-800 sticky top-0 z-10 shadow-sm">
                                        <tr>
                                            <th className="p-4 font-black text-slate-500 uppercase w-12">État</th>
                                            <th className="p-4 font-black text-slate-500 uppercase">Date</th>
                                            <th className="p-4 font-black text-slate-500 uppercase">Gagnants</th>
                                            <th className="p-4 font-black text-slate-500 uppercase">Machine</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                        {filteredPreview.map((row, i) => (
                                            <tr key={i} className={row.isValid ? 'hover:bg-slate-50 dark:hover:bg-slate-900/30' : 'bg-rose-50/50 dark:bg-rose-900/10'}>
                                                <td className="p-4">
                                                    {row.isValid 
                                                        ? <CheckCircle2 size={16} className="text-emerald-500"/> 
                                                        : <div className="group relative">
                                                            <AlertTriangle size={16} className="text-rose-500 cursor-help"/>
                                                            <div className="absolute left-6 top-0 w-48 bg-slate-900 text-white text-[10px] p-2 rounded-lg shadow-xl z-20 hidden group-hover:block">
                                                                {row.error}
                                                            </div>
                                                          </div>
                                                    }
                                                </td>
                                                <td className="p-4 font-mono font-bold text-slate-700 dark:text-slate-300">{row.date}</td>
                                                <td className="p-4">
                                                    {row.gagnants.length > 0 ? (
                                                        <div className="flex gap-1">
                                                            {row.gagnants.map((n, j) => (
                                                                <span key={j} className="w-6 h-6 rounded-md bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 flex items-center justify-center text-[10px] font-bold">{n}</span>
                                                            ))}
                                                        </div>
                                                    ) : <span className="text-slate-400 italic">Vide</span>}
                                                </td>
                                                <td className="p-4">
                                                    <div className="flex gap-1">
                                                        {row.machine.map((n, j) => (
                                                            <span key={j} className="w-6 h-6 rounded-md bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400 flex items-center justify-center text-[10px] font-bold">{n}</span>
                                                        ))}
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                        {filteredPreview.length === 0 && (
                                            <tr>
                                                <td colSpan={4} className="p-10 text-center text-slate-400 italic flex flex-col items-center gap-2">
                                                    <Filter size={24} className="opacity-50"/>
                                                    <span>Aucun élément dans cette vue.</span>
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>

                            <div className="flex justify-between items-center pt-6 border-t border-slate-100 dark:border-slate-800">
                                <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wide flex items-center gap-2">
                                    {errorCount > 0 ? (
                                        <>
                                            <span className="flex items-center gap-1 text-amber-500"><AlertTriangle size={12}/> Attention :</span> 
                                            {errorCount} lignes invalides seront ignorées.
                                        </>
                                    ) : (
                                        <>
                                            <span className="flex items-center gap-1 text-emerald-500"><CheckCircle2 size={12}/> Parfait :</span> 
                                            Toutes les lignes sont valides.
                                        </>
                                    )}
                                </div>
                                <div className="flex gap-4">
                                    <button onClick={() => setImportStep('upload')} className="px-6 py-3 text-slate-500 font-bold hover:text-slate-800 dark:hover:text-white transition text-xs uppercase tracking-wider">Annuler</button>
                                    <button 
                                        onClick={confirmImport} 
                                        disabled={isImporting || validCount === 0} 
                                        className={`px-8 py-3 rounded-2xl font-black uppercase text-xs tracking-widest shadow-xl flex items-center gap-2 disabled:opacity-50 active:scale-95 transition-all ${errorCount > 0 ? 'bg-amber-500 hover:bg-amber-600 text-white' : 'bg-emerald-600 hover:bg-emerald-500 text-white'}`}
                                    >
                                        {isImporting ? <RefreshCw className="animate-spin" size={16}/> : <Save size={16}/>}
                                        {validCount > 0 ? `Importer ${validCount} Valides` : 'Aucune donnée'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* TAB CONTENT: AUDIT */}
            {activeSubTab === 'audit' && (
                <DataIntegrityMonitor drawName={drawName} />
            )}
        </div>
    );
};
