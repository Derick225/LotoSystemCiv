import React, { useState } from 'react';
import {
  FileText,
  Printer,
  Download,
  Copy,
  Check,
  X,
  ShieldCheck,
  Calendar,
  Clock,
  Layers,
  Sparkles,
  Award,
} from 'lucide-react';
import {
  LonaciReceiptData,
  generateLonaciReceiptPdf,
} from '../../services/lonaciReceiptPdfService';
import { audioEngine } from '../../utils/audioEngine';
import { useToast } from '../ui/Toast';
import { motion, AnimatePresence } from 'framer-motion';

interface LonaciReceiptModalProps {
  isOpen: boolean;
  onClose: () => void;
  receiptData: LonaciReceiptData | null;
}

export const LonaciReceiptModal: React.FC<LonaciReceiptModalProps> = ({
  isOpen,
  onClose,
  receiptData,
}) => {
  const { showToast } = useToast();
  const [format, setFormat] = useState<'A4' | 'THERMAL'>('A4');
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [copiedHash, setCopiedHash] = useState<boolean>(false);

  if (!isOpen || !receiptData) return null;

  const handleDownloadPdf = async () => {
    try {
      setIsExporting(true);
      audioEngine.play('click');
      await generateLonaciReceiptPdf(receiptData, {
        format,
        autoDownload: true,
      });
      showToast('Bordereau LONACI exporté en PDF avec succès !', 'success');
      audioEngine.play('success');
    } catch (err) {
      console.error(err);
      showToast("Erreur lors de l'exportation du PDF", 'error');
    } finally {
      setIsExporting(false);
    }
  };

  const handleCopyHash = () => {
    if (!receiptData.securityHash) return;
    navigator.clipboard.writeText(receiptData.securityHash);
    setCopiedHash(true);
    audioEngine.play('click');
    showToast('Hash SHA-256 de vérification copié !', 'success');
    setTimeout(() => setCopiedHash(false), 2000);
  };

  const playedSet = new Set(receiptData.numbers);

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/80 backdrop-blur-md overflow-y-auto">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          className="bg-slate-900 border border-white/10 rounded-3xl max-w-2xl w-full shadow-2xl overflow-hidden flex flex-col my-auto max-h-[92vh]"
        >
          {/* Header Modal */}
          <div className="p-4 sm:p-6 border-b border-white/10 flex items-center justify-between bg-slate-950/60">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
                <FileText size={20} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-black uppercase tracking-widest text-amber-400 bg-amber-950/50 px-2 py-0.5 rounded border border-amber-800/40">
                    Bordereau Officiel LONACI
                  </span>
                  <span className="text-xs text-slate-400 font-mono">
                    {receiptData.ticketId}
                  </span>
                </div>
                <h3 className="text-base sm:text-lg font-black text-white tracking-tight mt-0.5">
                  Validation de Prise de Jeu &amp; Reçu Numérique
                </h3>
              </div>
            </div>

            <button
              onClick={onClose}
              className="w-9 h-9 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center transition-all cursor-pointer"
            >
              <X size={18} />
            </button>
          </div>

          {/* Corps de la modale avec aperçu ticket */}
          <div className="p-4 sm:p-6 overflow-y-auto space-y-6 flex-1 custom-scrollbar">
            {/* Contrôles du format */}
            <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-950/40 p-3 rounded-2xl border border-white/5">
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400 font-medium">Format d'export :</span>
                <div className="inline-flex rounded-xl bg-slate-900 p-1 border border-white/10 text-xs">
                  <button
                    onClick={() => setFormat('A4')}
                    className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                      format === 'A4'
                        ? 'bg-amber-500 text-slate-950 shadow-md'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Bordereau A4
                  </button>
                  <button
                    onClick={() => setFormat('THERMAL')}
                    className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                      format === 'THERMAL'
                        ? 'bg-amber-500 text-slate-950 shadow-md'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Ticket 80mm
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleCopyHash}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs rounded-xl font-medium flex items-center gap-1.5 transition-all cursor-pointer border border-white/5"
                  title="Copier le Hash de validation"
                >
                  {copiedHash ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
                  <span>{copiedHash ? 'Hash copié' : 'Hash SHA-256'}</span>
                </button>
              </div>
            </div>

            {/* APERÇU DU BORDEREAU STYLE TICKET PHYSIQUE AUTHENTIQUE */}
            <div className="bg-amber-50 text-slate-900 rounded-2xl p-5 sm:p-7 shadow-2xl font-mono text-xs border border-amber-200 relative overflow-hidden select-text">
              {/* Liseré Drapeau Ivoirien */}
              <div className="absolute top-0 left-0 right-0 h-2 flex">
                <div className="w-1/3 bg-[#FF8200]" />
                <div className="w-1/3 bg-white" />
                <div className="w-1/3 bg-[#009A44]" />
              </div>

              {/* En-tête officiel */}
              <div className="text-center pt-2 pb-3 border-b-2 border-dashed border-slate-400 space-y-0.5">
                <div className="font-sans font-black text-sm tracking-widest text-slate-900">
                  RÉPUBLIQUE DE CÔTE D'IVOIRE
                </div>
                <div className="text-[10px] text-slate-600 font-sans">
                  Union - Discipline - Travail
                </div>
                <div className="font-sans font-black text-base text-slate-950 tracking-tight pt-1">
                  LOTERIE NATIONALE DE CÔTE D'IVOIRE
                </div>
                <div className="text-[11px] font-bold text-amber-700 font-sans">
                  BORDEREAU OFFICIEL DE PRISE DE JEU 5/90
                </div>
                <div className="text-[9px] text-slate-500">
                  Système LotoPro Platinum Elite v12.0
                </div>
              </div>

              {/* Réf & Terminal */}
              <div className="grid grid-cols-2 gap-2 py-3 border-b border-dashed border-slate-300 text-[11px]">
                <div>
                  <span className="text-slate-500 block text-[9px]">RÉFÉRENCE :</span>
                  <strong className="font-bold text-slate-900">{receiptData.ticketId}</strong>
                </div>
                <div className="text-right">
                  <span className="text-slate-500 block text-[9px]">DATE &amp; HEURE :</span>
                  <span>{receiptData.date}</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[9px]">TERMINAL :</span>
                  <span>{receiptData.terminalId}</span>
                </div>
                <div className="text-right">
                  <span className="text-slate-500 block text-[9px]">FORMULE :</span>
                  <strong className="text-indigo-900">{receiptData.gameMode} ({receiptData.betType})</strong>
                </div>
              </div>

              {/* Les 5 Numéros Joués */}
              <div className="py-4 text-center border-b border-dashed border-slate-300">
                <div className="text-[10px] uppercase font-bold text-slate-600 mb-2 font-sans">
                  Combinaison Officielle Jouée ({receiptData.numbers.length} Numéros)
                </div>
                <div className="flex flex-wrap justify-center gap-2.5 sm:gap-3">
                  {receiptData.numbers.map((num) => (
                    <div
                      key={num}
                      className="w-10 h-10 rounded-full bg-slate-950 text-white font-black text-base flex items-center justify-center shadow-md border-2 border-white ring-2 ring-slate-950"
                    >
                      {String(num).padStart(2, '0')}
                    </div>
                  ))}
                </div>
              </div>

              {/* Grille 1-90 optique */}
              <div className="py-3 border-b border-dashed border-slate-300">
                <div className="text-[9px] uppercase font-bold text-slate-600 mb-1.5 font-sans">
                  Grille Optique de Contrôle LONACI (1-90)
                </div>
                <div className="grid grid-cols-10 gap-0.5 text-[8px] font-bold text-center">
                  {Array.from({ length: 90 }, (_, i) => i + 1).map((n) => {
                    const isPlayed = playedSet.has(n);
                    return (
                      <div
                        key={n}
                        className={`py-0.5 rounded-xs transition-colors ${
                          isPlayed
                            ? 'bg-[#FF8200] text-white font-black shadow-xs ring-1 ring-amber-600'
                            : 'bg-slate-200/60 text-slate-600'
                        }`}
                      >
                        {String(n).padStart(2, '0')}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Tirages ciblés (Tirage Unique ou Rafale) */}
              <div className="py-3 border-b border-dashed border-slate-300 space-y-1">
                <div className="flex justify-between items-center text-[10px] font-bold text-slate-700 font-sans">
                  <span>
                    {receiptData.drawNames.length > 1
                      ? `Rafale Multi-Tirages (${receiptData.drawNames.length} tirages)`
                      : 'Tirage Concerné'}
                  </span>
                  <span className="text-amber-800">Cote : {receiptData.odds}x</span>
                </div>
                <div className="space-y-1 pt-1">
                  {(receiptData.burstItems || receiptData.drawNames.map((d) => ({
                    name: d,
                    time: '',
                    stake: receiptData.stakePerDraw,
                    potentialWin: receiptData.stakePerDraw * receiptData.odds,
                  }))).map((item, idx) => (
                    <div
                      key={idx}
                      className="flex justify-between items-center bg-slate-100/80 px-2 py-1 rounded text-[11px]"
                    >
                      <span className="font-bold text-slate-800">
                        {item.name} {item.time ? `(${item.time})` : ''}
                      </span>
                      <div className="flex items-center gap-3">
                        <span className="text-slate-600">{item.stake.toLocaleString()} F</span>
                        <strong className="text-emerald-700 font-bold">
                          {item.potentialWin.toLocaleString()} F
                        </strong>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Total & Gains */}
              <div className="py-3 border-b-2 border-dashed border-slate-400 space-y-1.5 text-xs">
                <div className="flex justify-between items-center">
                  <span className="text-slate-600">Total Mises Payées :</span>
                  <strong className="text-base font-black text-slate-900">
                    {receiptData.totalStake.toLocaleString()} FCFA
                  </strong>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-600">Gain Max Potentiel :</span>
                  <strong className="text-base font-black text-emerald-700">
                    {receiptData.potentialWin.toLocaleString()} FCFA
                  </strong>
                </div>
              </div>

              {/* Barcode & Mentions Légales */}
              <div className="pt-3 text-center space-y-2">
                {/* Code-barres simulé en CSS vectoriel */}
                <div className="flex justify-center items-center h-8 gap-[1px] bg-white p-1 rounded border border-slate-300">
                  {Array.from({ length: 60 }).map((_, i) => (
                    <div
                      key={i}
                      className={`h-full ${
                        (i * 7) % 5 === 0 ? 'w-[3px] bg-slate-900' : (i * 3) % 2 === 0 ? 'w-[1.5px] bg-slate-900' : 'w-[1px] bg-transparent'
                      }`}
                    />
                  ))}
                </div>

                <div className="text-[8px] text-slate-500 truncate">
                  SHA-256 : {receiptData.securityHash}
                </div>

                <div className="text-[7.5px] text-slate-500 leading-tight pt-1 font-sans">
                  Gains payables dans un délai de 30 jours à compter de la date du tirage dans les agences et points agréés LONACI. Jeu interdit aux mineurs de moins de 18 ans.
                </div>
              </div>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="p-4 sm:p-6 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-950/80">
            <div className="text-xs text-slate-400 font-mono text-center sm:text-left">
              Fichier prêt pour impression thermique ou archivage comptable.
            </div>

            <div className="flex items-center gap-3 w-full sm:w-auto">
              <button
                onClick={onClose}
                className="flex-1 sm:flex-none px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold rounded-xl transition-all cursor-pointer"
              >
                Fermer
              </button>

              <button
                onClick={handleDownloadPdf}
                disabled={isExporting}
                className="flex-1 sm:flex-none px-5 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-black rounded-xl transition-all shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <Download size={14} />
                <span>{isExporting ? 'Génération...' : 'Télécharger le PDF'}</span>
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
