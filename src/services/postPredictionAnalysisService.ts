/**
 * Façade modulaire rétrocompatible du moteur Post-Mortem & Forensic.
 * Les implémentations cohésives sont isolées dans `src/services/forensic/`:
 * - `forensicStorageService.ts` : Schémas Zod, cache IDB/globalCache, cloud sync, guérison
 * - `counterfactualEngine.ts` : Simulation contrefactuelle Wasserstein/Topologique & auto-tuning ADN
 * - `autopsyEngine.ts` : Moteur d'autopsie mathématique déterministe
 */

export {
  getForensicReportByPredictionId,
  getForensicReportById,
  saveForensicReport,
  healForensicReport,
  getLocalForensicReports,
  syncForensicReportsWithCloud,
  markAutopsyDismissed,
  getDismissedAutopsyPredictionIds,
  deleteForensicReportLocal,
  deleteMultipleForensicReportsLocal,
} from "./forensic/forensicStorageService";

export {
  runCounterfactualSimulation,
  autoTuneModelDnaFromAutopsyReport,
} from "./forensic/counterfactualEngine";

export {
  runForensicAutopsy,
  performForensicAnalysis,
} from "./forensic/autopsyEngine";
