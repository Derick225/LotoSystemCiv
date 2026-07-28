import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  fetchResults,
  addResult,
  updateResult,
  deleteResult,
  bulkAddResults,
  bulkDeleteResults,
  purgeAllResults,
} from "../../services/lotteryService";
import { ExportService } from "../../services/exportService";
import type { DrawResult } from "../../types";
import { useToast } from "../ui/Toast";
import {
  Pencil,
  Trash2,
  Plus,
  Save,
  RotateCcw,
  Upload,
  LayoutGrid,
  Calendar,
  Download,
  Stethoscope,
  RefreshCw,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  Clipboard,
  DownloadCloud,
  FileText,
  Sparkles,
  Binary,
  Code2,
} from "lucide-react";
import { DataIntegrityMonitor } from "./DataIntegrityMonitor";
import { audioEngine } from "../../utils/audioEngine";
import { useNexusStore } from "../../store/useNexusStore";

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
  const navigateToModule = useNexusStore((state) => state.navigateToModule);
  const [results, setResults] = useState<DrawResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeSubTab, setActiveSubTab] = useState<
    "manual" | "bulk" | "audit" | "export" | "purge"
  >("manual");

  // Purge / Bulk Delete State
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleteStartDate, setDeleteStartDate] = useState("");
  const [deleteEndDate, setDeleteEndDate] = useState("");
  const [purgeConfirmed, setPurgeConfirmed] = useState(false);
  const [isPurging, setIsPurging] = useState(false);

  // Manual Form State
  const [isEditing, setIsEditing] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [formDate, setFormDate] = useState(
    new Date().toISOString().split("T")[0],
  );
  const [formWin, setFormWin] = useState<string[]>(Array(5).fill(""));
  const [formMac, setFormMac] = useState<string[]>(Array(5).fill(""));
  const [isSaving, setIsSaving] = useState(false);

  // Bulk Import State Enhanced
  const [isImporting, setIsImporting] = useState(false);
  const [previewData, setPreviewData] = useState<PreviewRow[]>([]);
  const [importStep, setImportStep] = useState<"upload" | "preview">("upload");
  const [uploadMode, setUploadMode] = useState<"file" | "text">("text");
  const [pasteContent, setPasteContent] = useState("");
  const [viewFilter, setViewFilter] = useState<"all" | "valid" | "error">(
    "all",
  );

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    resetForm();
    loadData();
    setPreviewData([]);
    setImportStep("upload");
    setPasteContent("");
    setViewFilter("all");
    setSelectedIds(new Set());
    setDeleteStartDate("");
    setDeleteEndDate("");
    setPurgeConfirmed(false);
  }, [drawName]);

  const loadData = async () => {
    setLoading(true);
    try {
      const { data } = await fetchResults(drawName);
      setResults(data);
    } catch (e) {
      showToast("Erreur de chargement", "error");
    } finally {
      setLoading(false);
    }
  };

  const validateNumbers = (nums: number[]) => {
    if (nums.length !== 5) return "Veuillez saisir 5 numéros.";
    if (new Set(nums).size !== 5) return "Les numéros doivent être uniques.";
    if (nums.some((n) => n < 1 || n > 90))
      return "Les numéros doivent être entre 1 et 90.";
    return null;
  };

  const handleSave = async () => {
    audioEngine.play("click");
    const winNums = formWin.map(Number).filter((val) => !isNaN(val) && val > 0);
    const macNums = formMac.map(Number).filter((val) => !isNaN(val) && val > 0);
    const error = validateNumbers(winNums);
    if (error) {
      audioEngine.play("error");
      showToast(error, "error");
      return;
    }
    setIsSaving(true);

    // Formatage date pour affichage local avant envoi
    const [y, m, d] = formDate.split("-");
    const formattedDate = `${d}/${m}/${y}`; // Format DD/MM/YYYY pour l'affichage local

    try {
      if (editId) {
        await updateResult(drawName, {
          id: editId,
          drawName: drawName,
          date: formattedDate,
          gagnants: winNums,
          machine: macNums.length === 5 ? macNums : undefined,
          version: 1,
        });
        audioEngine.play("success");
        showToast(`Registre mis à jour.`, "success");
      } else {
        await addResult(drawName, {
          drawName: drawName,
          date: formattedDate,
          gagnants: winNums,
          machine: macNums.length === 5 ? macNums : undefined,
          version: 1,
        });
        audioEngine.play("success");
        showToast(`Ajouté à ${drawName}.`, "success");
      }
      resetForm();
      loadData();
    } catch (e: unknown) {
      audioEngine.play("error");
      showToast(e instanceof Error ? e.message : String(e), "error");
    } finally {
      setIsSaving(false);
    }
  };

  const resetForm = () => {
    setIsEditing(false);
    setEditId(null);
    setFormWin(Array(5).fill(""));
    setFormMac(Array(5).fill(""));
    setFormDate(new Date().toISOString().split("T")[0]);
  };

  // --- BULK IMPORT LOGIC (ENHANCED FOR HISTORICAL FILES) ---

  const processRawData = (content: string) => {
    const lines = content.split(/\r?\n/).filter((line) => line.trim() !== "");
    const preview: PreviewRow[] = [];

    // Détection intelligente du séparateur sur la première ligne
    const firstLine = lines[0] || "";
    let separator: string | RegExp = ",";
    if ((firstLine.match(/;/g) || []).length > 0) {
      separator = ";";
    } else if ((firstLine.match(/\t/g) || []).length > 0) {
      separator = "\t";
    } else if ((firstLine.match(/,/g) || []).length > 0) {
      separator = ",";
    } else if ((firstLine.match(/\s+/g) || []).length > 0) {
      separator = /\s+/;
    }

    const seenDatesInBatch = new Set<string>();

    lines.forEach((line, index) => {
      // Ignorer l'en-tête technique si détecté
      const lowerLine = line.toLowerCase();
      if (
        index === 0 &&
        (lowerLine.includes("date") ||
          lowerLine.includes("g1") ||
          lowerLine.includes("tirage") ||
          lowerLine.includes("id"))
      )
        return;

      const cleanLine = line.replace(/['"]/g, "").trim();
      if (!cleanLine) return;

      const parts = cleanLine.split(separator).map((p) => p.trim());

      // Tentative de détection intelligente des colonnes : On cherche une date valide
      let dateIndex = -1;
      let dateStr = "";

      // Regex pour DD/MM/YYYY ou YYYY-MM-DD
      const dateRegex =
        /^(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4})|(\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2})/;

      // On scanne les parties pour trouver la date
      for (let i = 0; i < parts.length; i++) {
        if (parts[i].match(dateRegex)) {
          dateIndex = i;
          dateStr = parts[i];
          break;
        }
      }

      // Si pas de date trouvée, on suppose index 0 par défaut si format standard
      if (dateIndex === -1 && parts.length >= 6) {
        dateIndex = 0;
        dateStr = parts[0];
      }

      if (dateIndex === -1) {
        preview.push({
          date: "Inconnue",
          gagnants: [],
          machine: [],
          isValid: false,
          error: "Date manquante ou format de date introuvable dans la ligne.",
          rawLine: line,
        });
        return;
      }

      // On extrait les numéros (valeurs purement numériques de 1 à 90) de façon intelligente
      // pour éviter d'attraper des identifiants (IDs) ou numéros de tirage placés à gauche/droite.
      const isPureInteger = (str: string) => /^\d+$/.test(str.trim());

      const rightNums = parts
        .slice(dateIndex + 1)
        .filter(isPureInteger)
        .map((p) => parseInt(p, 10))
        .filter((n) => n >= 1 && n <= 90);

      const leftNums = parts
        .slice(0, dateIndex)
        .filter(isPureInteger)
        .map((p) => parseInt(p, 10))
        .filter((n) => n >= 1 && n <= 90);

      // On favorise la portion de droite si elle a au moins 5 numéros, sinon celle de gauche
      const potentialNumbers =
        rightNums.length >= 5
          ? rightNums
          : leftNums.length >= 5
            ? leftNums
            : [...leftNums, ...rightNums];

      // On prend les 5 premiers comme gagnants
      const winners = potentialNumbers.slice(0, 5);

      // Les suivants comme machine (si dispo)
      let machine: number[] = [];
      if (potentialNumbers.length >= 10) {
        machine = potentialNumbers.slice(5, 10);
      } else if (potentialNumbers.length >= 6) {
        machine = potentialNumbers.slice(5);
      }

      let isValid = true;
      let error = "";

      // Validation Date robuste & Normalisation
      let parsedDay = 0;
      let parsedMonth = 0;
      let parsedYear = 0;

      const matchYMD = dateStr.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
      const matchDMY = dateStr.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);

      if (matchYMD) {
        parsedYear = parseInt(matchYMD[1], 10);
        parsedMonth = parseInt(matchYMD[2], 10);
        parsedDay = parseInt(matchYMD[3], 10);
      } else if (matchDMY) {
        parsedDay = parseInt(matchDMY[1], 10);
        parsedMonth = parseInt(matchDMY[2], 10);
        parsedYear = parseInt(matchDMY[3], 10);
      }

      let finalDate = dateStr;
      if (
        parsedDay > 0 &&
        parsedDay <= 31 &&
        parsedMonth > 0 &&
        parsedMonth <= 12 &&
        parsedYear >= 1900 &&
        parsedYear <= 2100
      ) {
        finalDate = `${String(parsedDay).padStart(2, "0")}/${String(parsedMonth).padStart(2, "0")}/${parsedYear}`;
      } else {
        isValid = false;
        error =
          "Format Date invalide ou inconnu (requis: JJ/MM/AAAA ou AAAA-MM-JJ)";
      }

      // Validation Numéros
      if (isValid) {
        if (winners.length !== 5) {
          isValid = false;
          error = `Gagnants incomplets ou invalides (${winners.length}/5 numéros uniques requis entre 1 et 90)`;
        } else if (new Set(winners).size !== 5) {
          isValid = false;
          error = "Contient des doublons dans les numéros gagnants";
        } else if (winners.some((n) => n < 1 || n > 90)) {
          isValid = false;
          error =
            "Les numéros gagnants doivent être strictement compris entre 1 et 90";
        }
      }

      // Validation Machine optionnelle
      if (isValid && machine.length > 0) {
        if (machine.length !== 5 && machine.length !== 0) {
          machine = [];
        } else if (new Set(machine).size !== machine.length) {
          isValid = false;
          error = "Contient des doublons dans les numéros machine";
        } else if (machine.some((n) => n < 1 || n > 90)) {
          isValid = false;
          error =
            "Les numéros machine doivent être strictement compris entre 1 et 90";
        }
      }

      // Détection des doublons de date au sein du même lot d'importation
      if (isValid) {
        if (seenDatesInBatch.has(finalDate)) {
          isValid = false;
          error = `Date en doublon détectée dans le fichier d'importation (${finalDate})`;
        } else {
          seenDatesInBatch.add(finalDate);
        }
      }

      preview.push({
        date: finalDate,
        gagnants: winners,
        machine: machine.length === 5 ? machine : [],
        isValid,
        error,
        rawLine: line,
      });
    });

    setPreviewData(preview);
    setImportStep("preview");
    setViewFilter("all");
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
    audioEngine.play("click");
    const csvContent =
      "Date,G1,G2,G3,G4,G5,M1,M2,M3,M4,M5,ID\n02/02/2026,5,49,16,15,18,77,69,47,24,50,uuid-optionnel";
    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "nexus_import_template.csv";
    a.click();
  };

  const confirmImport = async () => {
    audioEngine.play("click");
    const validRows = previewData.filter((r) => r.isValid);
    if (validRows.length === 0) return;

    setIsImporting(true);
    try {
      const uniqueMap = new Map();
      validRows.forEach((row) => {
        // Normalisation de la date pour le backend (YYYY-MM-DD)
        let isoDate = row.date;
        const ddmmyyyy = row.date.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
        if (ddmmyyyy) {
          isoDate = `${ddmmyyyy[3]}-${ddmmyyyy[2].padStart(2, "0")}-${ddmmyyyy[1].padStart(2, "0")}`;
        }

        // Clé unique pour éviter les doublons dans le lot
        uniqueMap.set(isoDate, {
          draw_name: drawName,
          date: isoDate,
          gagnants: row.gagnants,
          machine: row.machine,
          version: 1,
        });
      });

      const batch = Array.from(uniqueMap.values());
      await bulkAddResults(drawName, batch);

      audioEngine.play("success");
      showToast(`${batch.length} tirages historiques importés.`, "success");

      // Reset
      setPreviewData([]);
      setImportStep("upload");
      loadData();

      // Suggestion d'aller vers le training
      showToast("Lancement de l'analyse post-import...", "info");
      setTimeout(() => {
        navigateToModule("admin", "training");
      }, 1500);
    } catch (e: unknown) {
      audioEngine.play("error");
      showToast(
        `Erreur d'import : ${e instanceof Error ? e.message : String(e)}`,
        "error",
      );
    } finally {
      setIsImporting(false);
    }
  };

  // --- EXPORT LOGIC ---
  const handleExportJSON = () => {
    audioEngine.play("click");
    if (results.length === 0) {
      audioEngine.play("error");
      showToast("Aucune donnée à exporter.", "error");
      return;
    }
    ExportService.exportToJSON(
      results,
      `Backup_${drawName.replace(/\s+/g, "_")}`,
    );
    audioEngine.play("success");
    showToast("Backup JSON généré.", "success");
  };

  const handleExportCSV = () => {
    audioEngine.play("click");
    if (results.length === 0) {
      audioEngine.play("error");
      showToast("Aucune donnée à exporter.", "error");
      return;
    }
    ExportService.exportHistoryToCSV(
      results,
      `Export_${drawName.replace(/\s+/g, "_")}`,
    );
    audioEngine.play("success");
    showToast("Export CSV généré.", "success");
  };

  const handleExportPython = () => {
    audioEngine.play("click");
    ExportService.exportPythonCore();
    audioEngine.play("success");
    showToast("Script Python généré.", "success");
  };

  const parseHTMLInputDate = (dateStr: string): Date => {
    const parts = dateStr.split("-");
    if (parts.length === 3) {
      return new Date(
        parseInt(parts[0], 10),
        parseInt(parts[1], 10) - 1,
        parseInt(parts[2], 10),
      );
    }
    return new Date(dateStr);
  };

  const rangeMatchCount = useMemo(() => {
    if (!deleteStartDate || !deleteEndDate) return 0;
    const start = parseHTMLInputDate(deleteStartDate);
    start.setHours(0, 0, 0, 0);
    const end = parseHTMLInputDate(deleteEndDate);
    end.setHours(23, 59, 59, 999);

    const parseLocalDrawDate = (dateStr: string): Date | null => {
      const parts = dateStr.split("/");
      if (parts.length === 3) {
        return new Date(
          parseInt(parts[2]),
          parseInt(parts[1]) - 1,
          parseInt(parts[0]),
        );
      }
      const d = new Date(dateStr);
      return isNaN(d.getTime()) ? null : d;
    };

    return results.filter((r) => {
      const d = parseLocalDrawDate(r.date);
      if (!d) return false;
      d.setHours(12, 0, 0, 0);
      return d >= start && d <= end;
    }).length;
  }, [deleteStartDate, deleteEndDate, results]);

  const toggleSelectId = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedIds(next);
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === results.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(results.map((r) => r.id)));
    }
  };

  const handleDeleteSelected = async () => {
    if (selectedIds.size === 0) return;
    if (
      !confirm(
        `Supprimer définitivement les ${selectedIds.size} tirages sélectionnés ?`,
      )
    )
      return;

    setIsPurging(true);
    audioEngine.play("click");
    try {
      await bulkDeleteResults(drawName, Array.from(selectedIds));
      audioEngine.play("success");
      showToast(
        `${selectedIds.size} tirages supprimés avec succès.`,
        "success",
      );
      setSelectedIds(new Set());
      loadData();
    } catch (e) {
      audioEngine.play("error");
      showToast(
        `Échec de la suppression : ${e instanceof Error ? e.message : String(e)}`,
        "error",
      );
    } finally {
      setIsPurging(false);
    }
  };

  const handleDeleteDateRange = async () => {
    if (!deleteStartDate || !deleteEndDate) return;

    const start = parseHTMLInputDate(deleteStartDate);
    start.setHours(0, 0, 0, 0);
    const end = parseHTMLInputDate(deleteEndDate);
    end.setHours(23, 59, 59, 999);

    const parseLocalDrawDate = (dateStr: string): Date | null => {
      const parts = dateStr.split("/");
      if (parts.length === 3) {
        return new Date(
          parseInt(parts[2]),
          parseInt(parts[1]) - 1,
          parseInt(parts[0]),
        );
      }
      const d = new Date(dateStr);
      return isNaN(d.getTime()) ? null : d;
    };

    const idsToDelete = results
      .filter((r) => {
        const d = parseLocalDrawDate(r.date);
        if (!d) return false;
        d.setHours(12, 0, 0, 0);
        return d >= start && d <= end;
      })
      .map((r) => r.id);

    if (idsToDelete.length === 0) return;

    if (
      !confirm(
        `Supprimer définitivement les ${idsToDelete.length} tirages de cette période ?`,
      )
    )
      return;

    setIsPurging(true);
    audioEngine.play("click");
    try {
      await bulkDeleteResults(drawName, idsToDelete);
      audioEngine.play("success");
      showToast(
        `${idsToDelete.length} tirages supprimés pour la période indiquée.`,
        "success",
      );
      setDeleteStartDate("");
      setDeleteEndDate("");
      loadData();
    } catch (e) {
      audioEngine.play("error");
      showToast(
        `Échec de la suppression : ${e instanceof Error ? e.message : String(e)}`,
        "error",
      );
    } finally {
      setIsPurging(false);
    }
  };

  const handlePurgeAll = async () => {
    if (!purgeConfirmed) return;
    if (
      !confirm(
        `ATTENTION DANGER : Voulez-vous vraiment purger TOUT l'historique de ${drawName} ? Cette action supprimera TOUT en local et sur le cloud.`,
      )
    )
      return;
    if (
      !confirm(
        `Confirmation finale : Tapez OK pour détruire définitivement les ${results.length} enregistrements de ${drawName}.`,
      )
    )
      return;

    setIsPurging(true);
    audioEngine.play("click");
    try {
      await purgeAllResults(drawName);
      audioEngine.play("success");
      showToast(
        `L'historique de ${drawName} a été entièrement vidé.`,
        "success",
      );
      setPurgeConfirmed(false);
      loadData();
    } catch (e) {
      audioEngine.play("error");
      showToast(
        `Échec de la purge : ${e instanceof Error ? e.message : String(e)}`,
        "error",
      );
    } finally {
      setIsPurging(false);
    }
  };

  const validCount = useMemo(
    () => previewData.filter((r) => r.isValid).length,
    [previewData],
  );
  const errorCount = useMemo(
    () => previewData.filter((r) => !r.isValid).length,
    [previewData],
  );
  const filteredPreview = useMemo(() => {
    if (viewFilter === "valid") return previewData.filter((r) => r.isValid);
    if (viewFilter === "error") return previewData.filter((r) => !r.isValid);
    return previewData;
  }, [previewData, viewFilter]);

  return (
    <div className="space-y-6 animate-fade-in w-full max-w-7xl mx-auto px-2 md:px-0">
      {/* Header Actions Card */}
      <div className="bg-slate-900 text-white p-4 md:p-6 rounded-[2.2rem] md:rounded-3xl flex flex-col md:flex-row items-center justify-between shadow-2xl border border-slate-800 gap-4 w-full">
        <div className="flex items-center gap-4 w-full md:w-auto">
          <div className="w-10 h-10 md:w-12 md:h-12 bg-indigo-600 rounded-xl md:rounded-2xl flex items-center justify-center shadow-lg">
            <FileText size={20} className="text-white" />
          </div>
          <div>
            <span className="text-[10px] md:text-xs font-black uppercase tracking-[0.2em] text-indigo-400">
              Registre Master
            </span>
            <h4 className="text-base md:text-xl font-black leading-none">
              {drawName}
            </h4>
          </div>
        </div>
        <div className="flex gap-2 w-full md:w-auto overflow-x-auto scrollbar-hide pb-1">
          <button
            onClick={() => {
              audioEngine.play("click");
              setActiveSubTab("manual");
            }}
            className={`flex-1 md:flex-none px-4 py-2.5 rounded-xl transition-all border border-white/5 text-[10px] md:text-xs font-black uppercase flex items-center justify-center gap-2 whitespace-nowrap ${activeSubTab === "manual" ? "bg-white text-slate-900 shadow-xl" : "bg-white/5 text-slate-400 hover:bg-white/10"}`}
          >
            <Pencil size={12} /> Saisie
          </button>
          <button
            onClick={() => {
              audioEngine.play("click");
              setActiveSubTab("bulk");
            }}
            className={`flex-1 md:flex-none px-4 py-2.5 rounded-xl transition-all border border-white/5 text-[10px] md:text-xs font-black uppercase flex items-center justify-center gap-2 whitespace-nowrap ${activeSubTab === "bulk" ? "bg-white text-slate-900 shadow-xl" : "bg-white/5 text-slate-400 hover:bg-white/10"}`}
          >
            <LayoutGrid size={12} /> Import CSV
          </button>
          <button
            onClick={() => {
              audioEngine.play("click");
              setActiveSubTab("export");
            }}
            className={`flex-1 md:flex-none px-4 py-2.5 rounded-xl transition-all border border-white/5 text-[10px] md:text-xs font-black uppercase flex items-center justify-center gap-2 whitespace-nowrap ${activeSubTab === "export" ? "bg-white text-slate-900 shadow-xl" : "bg-white/5 text-slate-400 hover:bg-white/10"}`}
          >
            <DownloadCloud size={12} /> Export
          </button>
          <button
            onClick={() => {
              audioEngine.play("click");
              setActiveSubTab("audit");
            }}
            className={`flex-1 md:flex-none px-4 py-2.5 rounded-xl transition-all border border-white/5 text-[10px] md:text-xs font-black uppercase flex items-center justify-center gap-2 whitespace-nowrap ${activeSubTab === "audit" ? "bg-emerald-50 text-white shadow-xl" : "bg-white/5 text-slate-400 hover:bg-white/10"}`}
          >
            <Stethoscope size={12} /> Audit
          </button>
          <button
            onClick={() => {
              audioEngine.play("click");
              setActiveSubTab("purge");
            }}
            className={`flex-1 md:flex-none px-4 py-2.5 rounded-xl transition-all border border-white/5 text-[10px] md:text-xs font-black uppercase flex items-center justify-center gap-2 whitespace-nowrap ${activeSubTab === "purge" ? "bg-rose-600 text-white shadow-xl" : "bg-white/5 text-slate-400 hover:bg-white/10"}`}
          >
            <Trash2 size={12} /> Suppression
          </button>
        </div>
      </div>

      {/* TAB CONTENT: MANUAL ENTRY */}
      {activeSubTab === "manual" && (
        <div className="flex flex-col md:grid md:grid-cols-2 gap-8 w-full">
          {/* Formulaire */}
          <div className="bg-white dark:bg-slate-800 p-6 md:p-8 rounded-2xl md:rounded-3xl border border-slate-100 dark:border-slate-700 shadow-xl">
            <div className="flex justify-between items-center mb-6 md:mb-8">
              <h3 className="font-black text-slate-700 dark:text-white uppercase tracking-tight flex items-center gap-2">
                {isEditing ? <Pencil size={16} /> : <Plus size={16} />}
                {isEditing ? "Modif." : "Nouveau"}
              </h3>
              {isEditing && (
                <button
                  onClick={resetForm}
                  className="p-2 bg-slate-100 dark:bg-slate-700 rounded-full"
                >
                  <RotateCcw size={14} />
                </button>
              )}
            </div>

            <div className="space-y-6">
              <div>
                <label className="text-xs font-black uppercase text-slate-400 tracking-widest mb-2 block">
                  Date
                </label>
                <div className="relative">
                  <input
                    type="date"
                    value={formDate}
                    onChange={(e) => setFormDate(e.target.value)}
                    className="w-full p-3.5 md:p-4 pl-10 md:pl-12 bg-slate-50 dark:bg-slate-900 rounded-2xl font-bold text-slate-700 dark:text-white border-2 border-transparent focus:border-indigo-500 outline-none transition-all"
                  />
                  <Calendar
                    className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
                    size={16}
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-black uppercase text-slate-400 tracking-widest mb-2 flex justify-between">
                  <span>Gagnants</span>
                  <span className="text-indigo-500 flex items-center gap-1 text-[10px]">
                    <Sparkles size={10} /> 5
                  </span>
                </label>
                <div className="grid grid-cols-5 gap-2">
                  {formWin.map((val, idx) => (
                    <input
                      key={`win-${idx}`}
                      type="number"
                      min="1"
                      max="90"
                      value={val}
                      onChange={(e) => {
                        const n = [...formWin];
                        n[idx] = e.target.value;
                        setFormWin(n);
                      }}
                      className="w-full aspect-square text-center font-black text-base md:text-lg bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300 rounded-xl border-2 border-indigo-100 dark:border-indigo-800 focus:border-indigo-500 outline-none transition-all"
                      placeholder={(idx + 1).toString()}
                    />
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-black uppercase text-slate-400 tracking-widest mb-2 flex justify-between">
                  <span>Machine</span>
                  <span className="text-slate-500 flex items-center gap-1 text-[10px]">
                    <Binary size={10} /> Opt.
                  </span>
                </label>
                <div className="grid grid-cols-5 gap-2">
                  {formMac.map((val, idx) => (
                    <input
                      key={`mac-${idx}`}
                      type="number"
                      min="1"
                      max="90"
                      value={val}
                      onChange={(e) => {
                        const n = [...formMac];
                        n[idx] = e.target.value;
                        setFormMac(n);
                      }}
                      className="w-full aspect-square text-center font-bold text-sm md:text-base bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-400 rounded-xl border-2 border-slate-100 dark:border-slate-800 focus:border-slate-400 outline-none transition-all"
                      placeholder="-"
                    />
                  ))}
                </div>
              </div>

              <div className="pt-4 flex gap-4">
                <button
                  onClick={handleSave}
                  disabled={isSaving}
                  className="flex-1 py-3.5 md:py-4 bg-indigo-600 hover:bg-indigo-500 text-white font-black rounded-2xl shadow-xl transition-all active:scale-[0.98] uppercase tracking-widest text-[10px] md:text-xs flex items-center justify-center gap-2"
                >
                  {isSaving ? (
                    <RefreshCw className="animate-spin" size={14} />
                  ) : (
                    <Save size={14} />
                  )}
                  Enregistrer
                </button>
              </div>
            </div>
          </div>

          {/* Liste Historique */}
          <div className="bg-slate-50 dark:bg-slate-900/50 p-6 rounded-2xl md:rounded-3xl border border-slate-200 dark:border-slate-800 h-[500px] md:h-[600px] flex flex-col">
            <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-6">
              Derniers Enregistrements
            </h4>
            <div className="flex-1 overflow-y-auto space-y-3 pr-1 custom-scrollbar">
              {results.slice(0, 50).map((r) => (
                <div
                  key={r.id}
                  className="bg-white dark:bg-slate-800 p-3 md:p-4 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700 flex justify-between items-center group"
                >
                  <div>
                    <div className="text-[10px] md:text-xs font-black text-slate-800 dark:text-white">
                      {r.date}
                    </div>
                    <div className="flex gap-1 mt-1.5 flex-wrap">
                      {r.gagnants.map((n) => (
                        <span
                          key={n}
                          className="w-5 h-5 md:w-6 md:h-6 rounded bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 flex items-center justify-center text-[10px] md:text-xs font-bold"
                        >
                          {n}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="flex gap-1 md:gap-2">
                    <button
                      onClick={() => {
                        setIsEditing(true);
                        setEditId(r.id);
                        setFormWin(r.gagnants.map(String));
                        if (r.machine) setFormMac(r.machine.map(String));
                      }}
                      className="p-2 bg-slate-100 dark:bg-slate-700 text-slate-500 rounded-lg hover:text-indigo-600"
                    >
                      <Pencil size={12} />
                    </button>
                    <button
                      onClick={() => {
                        if (confirm("Supprimer ?"))
                          deleteResult(drawName, r.id).then(loadData);
                      }}
                      className="p-2 bg-rose-50 dark:bg-rose-900/20 text-rose-500 rounded-lg"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB CONTENT: BULK IMPORT */}
      {activeSubTab === "bulk" && (
        <div className="bg-white dark:bg-slate-800 p-6 md:p-8 rounded-2xl md:rounded-3xl border border-slate-100 dark:border-slate-700 shadow-xl w-full">
          {importStep === "upload" ? (
            <div className="animate-slide-up">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-amber-100 dark:bg-amber-900/30 text-amber-600 rounded-2xl">
                    <Upload size={20} />
                  </div>
                  <div>
                    <h3 className="font-black text-slate-800 dark:text-white uppercase text-sm md:text-base">
                      Import de Masse
                    </h3>
                    <p className="text-xs md:text-[10px] text-slate-400 font-bold uppercase tracking-widest">
                      Supporte : Date(DD/MM/YYYY), G1-G5, M1-M5
                    </p>
                  </div>
                </div>
                <button
                  onClick={downloadTemplate}
                  className="text-[10px] md:text-xs font-bold text-indigo-500 flex items-center gap-2 hover:underline"
                >
                  <Download size={14} /> Modèle CSV
                </button>
              </div>

              <div className="flex gap-2 mb-6 bg-slate-100 dark:bg-slate-900/50 p-1 rounded-xl w-full md:w-fit overflow-x-auto scrollbar-hide">
                <button
                  onClick={() => setUploadMode("text")}
                  className={`flex-1 md:flex-none px-6 py-2.5 rounded-xl text-xs md:text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${uploadMode === "text" ? "bg-white dark:bg-slate-800 shadow-md text-indigo-600 dark:text-white" : "text-slate-400"}`}
                >
                  <Clipboard size={14} /> Coller
                </button>
                <button
                  onClick={() => setUploadMode("file")}
                  className={`flex-1 md:flex-none px-6 py-2.5 rounded-xl text-xs md:text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${uploadMode === "file" ? "bg-white dark:bg-slate-800 shadow-md text-indigo-600 dark:text-white" : "text-slate-400"}`}
                >
                  Fichier
                </button>
              </div>

              {uploadMode === "file" ? (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full h-40 border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-[2rem] flex flex-col items-center justify-center gap-4 cursor-pointer hover:border-indigo-500 transition-all bg-slate-50/50 dark:bg-slate-900/50"
                >
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileUpload}
                    accept=".csv,.txt"
                    className="hidden"
                  />
                  <FileSpreadsheet size={32} className="text-slate-400" />
                  <p className="text-xs font-bold text-slate-500">
                    Glisser le fichier historique ici
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  <textarea
                    value={pasteContent}
                    onChange={(e) => setPasteContent(e.target.value)}
                    className="w-full h-40 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 font-mono text-[10px] text-slate-600 dark:text-slate-300 focus:border-indigo-500 outline-none transition-all resize-none"
                    placeholder="Format compatible : 02/02/2026,5,49,16,15,18..."
                  />
                  <button
                    onClick={() => processRawData(pasteContent)}
                    disabled={!pasteContent.trim()}
                    className="w-full md:w-auto px-8 py-3 bg-indigo-600 text-white rounded-xl font-black text-[10px] uppercase shadow-xl disabled:opacity-50"
                  >
                    Analyser les Données
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="animate-slide-up space-y-6">
              <div className="flex flex-col gap-4">
                <div className="flex justify-between items-center">
                  <h3 className="font-black text-slate-800 dark:text-white uppercase text-sm">
                    Aperçu ({previewData.length})
                  </h3>
                  <div className="flex gap-1">
                    <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded text-xs font-bold">
                      {validCount} Valides
                    </span>
                    {errorCount > 0 && (
                      <span className="px-2 py-0.5 bg-rose-100 text-rose-700 rounded text-xs font-bold">
                        {errorCount} Erreurs
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex gap-1 p-1 bg-slate-100 dark:bg-slate-900 rounded-xl">
                  <button
                    onClick={() => setViewFilter("all")}
                    className={`flex-1 py-2 text-xs font-bold rounded-lg transition ${viewFilter === "all" ? "bg-white dark:bg-slate-700 shadow" : "text-slate-500"}`}
                  >
                    Tous
                  </button>
                  <button
                    onClick={() => setViewFilter("valid")}
                    className={`flex-1 py-2 text-xs font-bold rounded-lg transition ${viewFilter === "valid" ? "bg-white dark:bg-slate-700 shadow" : "text-slate-500"}`}
                  >
                    OK
                  </button>
                  <button
                    onClick={() => setViewFilter("error")}
                    className={`flex-1 py-2 text-xs font-bold rounded-lg transition ${viewFilter === "error" ? "bg-white dark:bg-slate-700 shadow" : "text-slate-500"}`}
                  >
                    Error
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto custom-scrollbar border border-slate-200 dark:border-slate-700 rounded-2xl max-h-[300px]">
                <table className="w-full text-[10px] md:text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-900 sticky top-0">
                    <tr className="text-left text-slate-500 font-black uppercase">
                      <th className="p-3">Statut</th>
                      <th className="p-3">Date</th>
                      <th className="p-3">Gagnants</th>
                      <th className="p-3">Machine</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {filteredPreview.map((row, i) => (
                      <tr
                        key={i}
                        className={
                          row.isValid ? "" : "bg-rose-50 dark:bg-rose-900/10"
                        }
                      >
                        <td className="p-3">
                          {row.isValid ? (
                            <CheckCircle2
                              size={14}
                              className="text-emerald-500"
                            />
                          ) : (
                            <AlertTriangle
                              size={14}
                              className="text-rose-500"
                            />
                          )}
                        </td>
                        <td className="p-3 font-mono font-bold">{row.date}</td>
                        <td className="p-3">
                          <div className="flex gap-1">
                            {row.gagnants.map((n, j) => (
                              <span
                                key={j}
                                className="w-5 h-5 rounded bg-slate-100 dark:bg-slate-700 flex items-center justify-center text-[10px]"
                              >
                                {n}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="p-3">
                          {row.machine.length > 0 ? (
                            <div className="flex gap-1">
                              {row.machine.map((n, j) => (
                                <span
                                  key={j}
                                  className="w-5 h-5 rounded bg-slate-200 dark:bg-slate-800 text-slate-500 flex items-center justify-center text-[10px]"
                                >
                                  {n}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-[10px] text-slate-400 italic">
                              --
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => setImportStep("upload")}
                  className="px-6 py-2.5 text-slate-500 font-bold text-[10px] uppercase"
                >
                  Annuler
                </button>
                <button
                  onClick={confirmImport}
                  disabled={isImporting || validCount === 0}
                  className="px-8 py-2.5 bg-emerald-600 text-white rounded-xl font-black text-[10px] uppercase shadow-lg shadow-emerald-500/20 disabled:opacity-50"
                >
                  Confirmer et Analyser
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB CONTENT: EXPORT */}
      {activeSubTab === "export" && (
        <div className="bg-white dark:bg-slate-800 p-8 rounded-3xl border border-slate-100 dark:border-slate-700 shadow-xl animate-scale-in">
          <div className="flex items-center gap-4 mb-8">
            <div className="p-3 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 rounded-2xl">
              <DownloadCloud size={24} />
            </div>
            <div>
              <h3 className="font-black text-slate-800 dark:text-white uppercase tracking-tighter text-lg">
                Centre d'Exportation
              </h3>
              <p className="text-slate-400 text-xs font-medium">
                Extraire les données de {drawName}
              </p>
            </div>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            <button
              onClick={handleExportCSV}
              className="flex flex-col items-center justify-center p-8 bg-slate-50 dark:bg-slate-900/50 rounded-2xl border border-slate-100 dark:border-slate-700 hover:border-indigo-400 dark:hover:border-indigo-500 transition-all group"
            >
              <div className="w-16 h-16 bg-white dark:bg-slate-800 rounded-full flex items-center justify-center shadow-lg mb-4 group-hover:scale-110 transition-transform">
                <FileSpreadsheet size={32} className="text-emerald-500" />
              </div>
              <h4 className="font-black text-slate-800 dark:text-white uppercase tracking-tight">
                Format Tableur (CSV)
              </h4>
              <p className="text-[10px] text-slate-400 text-center mt-2 max-w-[200px]">
                Compatible Excel, Sheets. Idéal pour l'analyse manuelle.
              </p>
            </button>

            <button
              onClick={handleExportJSON}
              className="flex flex-col items-center justify-center p-8 bg-slate-50 dark:bg-slate-900/50 rounded-2xl border border-slate-100 dark:border-slate-700 hover:border-indigo-400 dark:hover:border-indigo-500 transition-all group"
            >
              <div className="w-16 h-16 bg-white dark:bg-slate-800 rounded-full flex items-center justify-center shadow-lg mb-4 group-hover:scale-110 transition-transform">
                <Binary size={32} className="text-amber-500" />
              </div>
              <h4 className="font-black text-slate-800 dark:text-white uppercase tracking-tight">
                Format Backup (JSON)
              </h4>
              <p className="text-[10px] text-slate-400 text-center mt-2 max-w-[200px]">
                Structure complète. Idéal pour la sauvegarde.
              </p>
            </button>

            <button
              onClick={handleExportPython}
              className="flex flex-col items-center justify-center p-8 bg-slate-50 dark:bg-slate-900/50 rounded-2xl border border-slate-100 dark:border-slate-700 hover:border-indigo-400 dark:hover:border-indigo-500 transition-all group"
            >
              <div className="w-16 h-16 bg-white dark:bg-slate-800 rounded-full flex items-center justify-center shadow-lg mb-4 group-hover:scale-110 transition-transform">
                <Code2 size={32} className="text-indigo-500" />
              </div>
              <h4 className="font-black text-slate-800 dark:text-white uppercase tracking-tight">
                Algorithmes (Python)
              </h4>
              <p className="text-[10px] text-slate-400 text-center mt-2 max-w-[200px]">
                Moteur Thermodynamique et Statistique en script Python pur.
              </p>
            </button>
          </div>
        </div>
      )}

      {/* TAB CONTENT: PURGE / BULK DELETE */}
      {activeSubTab === "purge" && (
        <div className="space-y-8 animate-fade-in w-full">
          {/* Statut Global */}
          <div className="bg-rose-50 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-900/30 p-6 rounded-3xl flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-rose-100 dark:bg-rose-900/30 text-rose-600 rounded-2xl">
                <Trash2 size={24} />
              </div>
              <div>
                <h3 className="font-black text-rose-900 dark:text-rose-100 uppercase text-sm md:text-base">
                  Zone de Purge & Nettoyage de Masse
                </h3>
                <p className="text-xs text-rose-600 dark:text-rose-400 font-medium">
                  Vous gérez actuellement {results.length} enregistrements pour
                  le tirage {drawName}
                </p>
              </div>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            {/* Panel 1: Sélection & Suppression en Lots */}
            <div className="bg-white dark:bg-slate-800 p-6 md:p-8 rounded-3xl border border-slate-100 dark:border-slate-700 shadow-xl flex flex-col h-[600px]">
              <div className="mb-6 flex justify-between items-center">
                <div>
                  <h4 className="font-black text-slate-800 dark:text-white uppercase text-xs md:text-sm">
                    1. Sélection et Suppression
                  </h4>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-1">
                    Cochez les tirages à éliminer
                  </p>
                </div>
                {selectedIds.size > 0 && (
                  <button
                    onClick={handleDeleteSelected}
                    disabled={isPurging}
                    className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5 shadow-lg shadow-rose-500/20 active:scale-[0.98] transition-all"
                  >
                    Supprimer ({selectedIds.size})
                  </button>
                )}
              </div>

              <div className="flex gap-2 mb-4 bg-slate-50 dark:bg-slate-900 p-2 rounded-xl text-xs font-bold text-slate-500 justify-between items-center">
                <label className="flex items-center gap-2 cursor-pointer pl-1">
                  <input
                    type="checkbox"
                    checked={
                      results.length > 0 && selectedIds.size === results.length
                    }
                    onChange={toggleSelectAll}
                    className="rounded border-slate-300 text-rose-600 focus:ring-rose-500 w-4 h-4 cursor-pointer"
                  />
                  <span>Tout sélectionner</span>
                </label>
                <span className="text-[10px] font-black uppercase text-indigo-500">
                  {selectedIds.size} sélectionné(s)
                </span>
              </div>

              <div className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                {results.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-xs text-slate-400 italic">
                    Aucun tirage disponible.
                  </div>
                ) : (
                  results.map((r) => {
                    const isChecked = selectedIds.has(r.id);
                    return (
                      <div
                        key={r.id}
                        onClick={() => toggleSelectId(r.id)}
                        className={`p-3 rounded-2xl border transition-all cursor-pointer flex justify-between items-center ${isChecked ? "bg-rose-50/50 dark:bg-rose-950/15 border-rose-200 dark:border-rose-900/40" : "bg-slate-50/30 dark:bg-slate-900/20 border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-900/50"}`}
                      >
                        <div className="flex items-center gap-3">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) => {
                              e.stopPropagation();
                              toggleSelectId(r.id);
                            }}
                            className="rounded border-slate-300 text-rose-600 focus:ring-rose-500 w-4 h-4 cursor-pointer"
                          />
                          <div>
                            <div className="text-xs font-black text-slate-700 dark:text-white">
                              {r.date}
                            </div>
                            <div className="flex gap-1 mt-1">
                              {r.gagnants.map((n) => (
                                <span
                                  key={n}
                                  className="w-5 h-5 rounded bg-slate-100 dark:bg-slate-700/60 text-slate-700 dark:text-slate-300 flex items-center justify-center text-[10px] font-bold"
                                >
                                  {n}
                                </span>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            <div className="space-y-8 flex flex-col justify-between">
              {/* Panel 2: Intervalle de Dates */}
              <div className="bg-white dark:bg-slate-800 p-6 md:p-8 rounded-3xl border border-slate-100 dark:border-slate-700 shadow-xl flex flex-col">
                <div className="mb-6">
                  <h4 className="font-black text-slate-800 dark:text-white uppercase text-xs md:text-sm">
                    2. Suppression par Intervalle
                  </h4>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-1">
                    Éliminer une plage historique complète
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4 mb-6">
                  <div>
                    <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider mb-2 block">
                      Date de début
                    </label>
                    <input
                      type="date"
                      value={deleteStartDate}
                      onChange={(e) => setDeleteStartDate(e.target.value)}
                      className="w-full p-3 bg-slate-50 dark:bg-slate-900 rounded-xl font-bold text-xs text-slate-700 dark:text-white border border-transparent focus:border-rose-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider mb-2 block">
                      Date de fin
                    </label>
                    <input
                      type="date"
                      value={deleteEndDate}
                      onChange={(e) => setDeleteEndDate(e.target.value)}
                      className="w-full p-3 bg-slate-50 dark:bg-slate-900 rounded-xl font-bold text-xs text-slate-700 dark:text-white border border-transparent focus:border-rose-500 outline-none"
                    />
                  </div>
                </div>

                {rangeMatchCount > 0 && (
                  <div className="mb-4 p-3 bg-amber-50 dark:bg-amber-950/20 text-amber-700 dark:text-amber-400 text-xs font-bold rounded-xl flex items-center gap-2">
                    <AlertTriangle size={14} />
                    <span>
                      {rangeMatchCount} tirages correspondent à cette période et
                      seront supprimés.
                    </span>
                  </div>
                )}

                <button
                  onClick={handleDeleteDateRange}
                  disabled={
                    isPurging ||
                    !deleteStartDate ||
                    !deleteEndDate ||
                    rangeMatchCount === 0
                  }
                  className="w-full py-3.5 bg-slate-900 dark:bg-slate-700 hover:bg-rose-600 text-white font-black rounded-xl text-xs uppercase tracking-widest transition-all active:scale-[0.98] disabled:opacity-40"
                >
                  Supprimer la période
                </button>
              </div>

              {/* Panel 3: Destruction Totale / Zone de Danger */}
              <div className="bg-rose-50/30 dark:bg-rose-950/5 border-2 border-dashed border-rose-200 dark:border-rose-900/30 p-6 md:p-8 rounded-3xl flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-3 text-rose-600">
                    <AlertTriangle size={20} />
                    <h4 className="font-black uppercase text-xs md:text-sm text-rose-700 dark:text-rose-400">
                      3. Zone de Danger : Purge Absolue
                    </h4>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 font-medium leading-relaxed mb-6">
                    Cette action supprimera **définitivement** tout l'historique
                    disponible de **{drawName}** ({results.length}{" "}
                    enregistrements) à la fois sur votre stockage local et sur
                    les serveurs cloud.
                  </p>
                </div>

                <div className="space-y-4">
                  <label className="flex items-start gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={purgeConfirmed}
                      onChange={(e) => setPurgeConfirmed(e.target.checked)}
                      className="mt-0.5 rounded border-slate-300 text-rose-600 focus:ring-rose-500 w-4 h-4 cursor-pointer"
                    />
                    <span className="text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wide">
                      Je confirme vouloir effacer définitivement tout
                      l'historique de {drawName}.
                    </span>
                  </label>

                  <button
                    onClick={handlePurgeAll}
                    disabled={
                      isPurging || !purgeConfirmed || results.length === 0
                    }
                    className="w-full py-4 bg-rose-600 hover:bg-rose-700 text-white font-black rounded-2xl text-xs uppercase tracking-widest shadow-xl shadow-rose-600/10 active:scale-[0.98] disabled:opacity-40 transition-all"
                  >
                    {isPurging ? (
                      <RefreshCw className="animate-spin mx-auto" size={14} />
                    ) : (
                      `Purger complètement ${drawName}`
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB CONTENT: AUDIT */}
      {activeSubTab === "audit" && (
        <div className="w-full mx-auto">
          <DataIntegrityMonitor drawName={drawName} />
        </div>
      )}
    </div>
  );
};
