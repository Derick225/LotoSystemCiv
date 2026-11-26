import React, { useState, useMemo } from "react";
import { Prediction } from "../../types";
import {
  AlgoKey,
  ACTIVE_ALGO_COUNT,
  RETIRED_ALGO_WEIGHT_KEYS,
} from "../../shared/prediction.types";
import {
  UNIFORM_BRIER_REFERENCE,
  UNIFORM_EXPECTED_HITS_TOP_K,
  UNIFORM_SINGLE_NUMBER_PROBABILITY,
} from "../../shared/drawTheory";
import {
  TrendingUp,
  Activity,
  BarChart3,
  Sliders,
  ShieldCheck,
  ChevronRight,
  Target,
} from "lucide-react";

interface PredictiveCalibrationAnalyticsDashboardProps {
  prediction: Prediction | null;
  drawName: string;
}

export interface ChannelMeta {
  key: string;
  label: string;
  layer: string;
  family: string;
  formula: string;
  description: string;
}

export interface ChannelSimplexRow extends ChannelMeta {
  rawWeight: number;
  simplexWeight: number;
  percentage: string;
  isActive: boolean;
}

export interface DecileRow {
  decile: number;
  meanPredicted: number;
  meanObserved: number;
  count: number;
}

export const CHANNELS_CATALOG: Record<AlgoKey, ChannelMeta> = {
  [AlgoKey.FREQUENCY]: {
    key: AlgoKey.FREQUENCY,
    label: "Fréquence Laplacienne",
    layer: "Fréquentielle & Temporelle",
    family: "Statistique Paramétrique",
    formula: "P(n) = (Count(n) + 1) / (N + 90)",
    description: "Distribution de fréquence historique stabilisée par lissage bayésien de Laplace.",
  },
  [AlgoKey.GAPS]: {
    key: AlgoKey.GAPS,
    label: "Théorie des Écarts",
    layer: "Dynamique d'Écarts",
    family: "Processus Ponctuels",
    formula: "Ecart_t(n) = t - last_seen(n)",
    description: "Tension stochastique accumulée par l'absence temporelle et réversion à l'espérance.",
  },
  [AlgoKey.SPECTRAL]: {
    key: AlgoKey.SPECTRAL,
    label: "Spectre & FFT",
    layer: "Harmonique & Fréquence",
    family: "Analyse Harmonique",
    formula: "X(k) = sum(x_n * exp(-i 2pi k n / N))",
    description: "Détection des périodicités latentes et résonances cycliques dans le domaine spectral.",
  },
  [AlgoKey.MARKOV]: {
    key: AlgoKey.MARKOV,
    label: "Transitions Markoviennes",
    layer: "Dynamique de Séquence",
    family: "Processus Stochastiques",
    formula: "P(S_t | S_{t-1}) = T_{i,j}",
    description: "Probabilités de transition conditionnelle entre tirages consécutifs.",
  },
  [AlgoKey.BAYES]: {
    key: AlgoKey.BAYES,
    label: "Inférence Bayésienne",
    layer: "Probabiliste & Croyances",
    family: "Inférence Bayésienne",
    formula: "P(Theta | D) = P(D | Theta) P(Theta) / P(D)",
    description: "Mise à jour séquentielle des croyances a priori selon les données empiriques observées.",
  },
  [AlgoKey.MOMENTUM]: {
    key: AlgoKey.MOMENTUM,
    label: "Momentum Cinétique",
    layer: "Cinétique & Vitesse",
    family: "Dynamique Hamiltonienne",
    formula: "v(n) = d(Freq_t) / dt",
    description: "Accélération locale de sortie des numéros sur fenêtres temporelles glissantes.",
  },
  [AlgoKey.AFFINITY]: {
    key: AlgoKey.AFFINITY,
    label: "Affinité Co-Occurrences",
    layer: "Réseau & Topologie",
    family: "Graphes d'Interaction",
    formula: "A(i, j) = P(i and j) / (P(i) P(j))",
    description: "Attraction mutuelle et couplage dyadique des paires dans le tirage cible.",
  },
  [AlgoKey.SPATIAL]: {
    key: AlgoKey.SPATIAL,
    label: "Distribution Spatiale",
    layer: "Topologie de Grille",
    family: "Géométrie Stochastique",
    formula: "d(p1, p2) = ||Coord(p1) - Coord(p2)||_2",
    description: "Cohérence géométrique et centroïde spatial sur la grille matricielle 9x10.",
  },
  [AlgoKey.TEMPORAL]: {
    key: AlgoKey.TEMPORAL,
    label: "Mémoire Temporelle",
    layer: "Séries Temporelles",
    family: "Dynamique Récurrente",
    formula: "M_t = lambda M_{t-1} + (1-lambda) X_t",
    description: "Amortissement exponentiel lissé mesurant l'inertie historique récente.",
  },
  [AlgoKey.FRACTAL]: {
    key: AlgoKey.FRACTAL,
    label: "Exposant de Hurst & Fractale",
    layer: "Dynamique Non-Linéaire",
    family: "Théorie du Chaos",
    formula: "E[R(n)/S(n)] = C * n^H",
    description: "Persistance et mémoire longue (H > 0.5) vs anti-persistance (H < 0.5).",
  },
  [AlgoKey.SHADOW_PROBABILITY]: {
    key: AlgoKey.SHADOW_PROBABILITY,
    label: "Probabilité Ombre",
    layer: "Latence Cachée",
    family: "Variables Latentes",
    formula: "S_t(n) = P(Non-tirage persistant | Gaps)",
    description: "Densité de probabilité implicite dans l'espace des numéros non-observés.",
  },
  [AlgoKey.NETWORK_CORRELATION]: {
    key: AlgoKey.NETWORK_CORRELATION,
    label: "Corrélation Réseau",
    layer: "Réseau Inter-Tirages",
    family: "Graphes Complexes",
    formula: "W_{ij} = Cov(X_i, X_j) / (sigma_i sigma_j)",
    description: "Matrice d'interconnexion continue au sein du réseau étanche canonique.",
  },
  [AlgoKey.ECHO_STATE]: {
    key: AlgoKey.ECHO_STATE,
    label: "Echo State Reservoir",
    layer: "Dynamique Récurrente",
    family: "Calcul par Réservoir",
    formula: "x_{t+1} = tanh(W_{in} u_t + W x_t)",
    description: "Projection en haute dimension par réservoir dynamique déterministe.",
  },
  [AlgoKey.GAP_SEQUENCE]: {
    key: AlgoKey.GAP_SEQUENCE,
    label: "Champ Moyen d'Ising",
    layer: "Topologie & Aimantation",
    family: "Physique Statistique",
    formula: "H(s) = -Sum J_ij s_i s_j - Sum h_i s_i",
    description: "Potentiel topologique collectif d'aimantation du réseau des écarts.",
  },
  [AlgoKey.DERIVED_NEIGHBOR]: {
    key: AlgoKey.DERIVED_NEIGHBOR,
    label: "Voisinage Dérivé",
    layer: "Topologie Locale",
    family: "Graphes Locaux",
    formula: "N(n) = { n - 1, n + 1, n - 10, n + 10 }",
    description: "Transfert d'excitation stochastique vers les numéros voisins sur la grille.",
  },
  [AlgoKey.GAP_PATTERN]: {
    key: AlgoKey.GAP_PATTERN,
    label: "Processus de Hawkes",
    layer: "Contagion & Écarts",
    family: "Processus Auto-Excitants",
    formula: "lambda_n(t) = mu_n + Sum alpha exp(-beta(t - t_i))",
    description: "Auto-excitation discrète multivariée modélisant les grappes d'apparitions.",
  },
  [AlgoKey.SEQUENCE_PATTERN]: {
    key: AlgoKey.SEQUENCE_PATTERN,
    label: "Entropie de Permutation",
    layer: "Dynamique Symbolique",
    family: "Théorie de l'Information",
    formula: "H_perm = -Sum p(pi) log p(pi)",
    description: "Compressibilité informationnelle et motifs ordinaux locaux des trajectoires.",
  },
  [AlgoKey.GAP_CADENCE]: {
    key: AlgoKey.GAP_CADENCE,
    label: "Cadence d'Écarts",
    layer: "Régime d'Écarts",
    family: "Processus Ponctuels",
    formula: "Cadence(n) = Mean(Delta Gap) / Std(Delta Gap)",
    description: "Régularité périodique des intervalles d'apparition de chaque numéro.",
  },
  [AlgoKey.GAP_TREND]: {
    key: AlgoKey.GAP_TREND,
    label: "Tendance d'Écarts (Holt)",
    layer: "Lissage d'Écarts",
    family: "Séries Temporelles",
    formula: "S_t = alpha Y_t + (1-alpha)(S_{t-1} + b_{t-1})",
    description: "Lissage exponentiel double modélisant la vitesse de contraction des écarts.",
  },
  [AlgoKey.INTER_MONTHLY_RESONANCE]: {
    key: AlgoKey.INTER_MONTHLY_RESONANCE,
    label: "Ondelettes Multi-Échelles (T0 = 18)",
    layer: "Analyse Ondelettes",
    family: "Transformée de Ricker",
    formula: "W(a, b) = Sum x_t psi((t - b) / a)",
    description: "Transformée en ondelettes continues calée sur la période fondamentale physique T0 = 90/5.",
  },
  [AlgoKey.ISOLATION_ANOMALY]: {
    key: AlgoKey.ISOLATION_ANOMALY,
    label: "Détection d'Anomalie",
    layer: "Isolation Spatiale",
    family: "Forêts d'Isolation",
    formula: "s(x, n) = 2^(- E(h(x)) / c(n))",
    description: "Identification objective des configurations déviantes et atypiques.",
  },
  [AlgoKey.GAP_BAND_SEQUENCE]: {
    key: AlgoKey.GAP_BAND_SEQUENCE,
    label: "Séquence par Bandes d'Écarts",
    layer: "Markov Collectif",
    family: "Chaînes Cachées",
    formula: "P(Band_t | Band_{t-1})",
    description: "Modélisation markovienne des tranches d'écarts collectives.",
  },
  [AlgoKey.MACHINE_TRANSFER]: {
    key: AlgoKey.MACHINE_TRANSFER,
    label: "Transfert Machine",
    layer: "Mécanique Physique",
    family: "Transfert Bivarié",
    formula: "P(Win | Machine) = T(w, m)",
    description: "Couplage empirique continu entre numéros machine et numéros gagnants (0% si absent).",
  },
  [AlgoKey.INTER_DRAW_RESONANCE]: {
    key: AlgoKey.INTER_DRAW_RESONANCE,
    label: "Résonance Harmonique Inter-Tirages",
    layer: "Réseau Inter-Tirages",
    family: "Symétries Canoniques",
    formula: "Mirror(n) = 91 - n",
    description: "Résonance harmonique miroir et complémentaire au sein du réseau étanche.",
  },
  [AlgoKey.JACCARD]: {
    key: AlgoKey.JACCARD,
    label: "Indice de Jaccard Topologique",
    layer: "Topologie Ensembliste",
    family: "Similarité d'Ensembles",
    formula: "J(A, B) = |A inter B| / |A union B|",
    description: "Mesure du recouvrement structurel entre tirages récents et bassins de numéros.",
  },
};

export function buildChannelSimplexRows(
  rawWeights?: Record<string, number>
): { rows: ChannelSimplexRow[]; hasExplicitWeights: boolean } {
  const keys = (Object.values(AlgoKey) as AlgoKey[]).filter(
    (k) => !RETIRED_ALGO_WEIGHT_KEYS.has(k)
  );
  const hasExplicitWeights = Boolean(rawWeights && Object.keys(rawWeights).length > 0);

  let sum = 0;
  const rawMap: Record<string, number> = {};
  keys.forEach((k) => {
    let val = 0;
    if (hasExplicitWeights && rawWeights) {
      const candidate = rawWeights[k];
      val = typeof candidate === "number" && Number.isFinite(candidate) && candidate >= 0 ? candidate : 0;
    } else {
      val = 1.0;
    }
    rawMap[k] = val;
    sum += val;
  });

  const rows = keys
    .map((k) => {
      const meta = CHANNELS_CATALOG[k] || {
        key: k,
        label: k,
        layer: "Non catégorisé",
        family: "Générique",
        formula: "-",
        description: "-",
      };
      const rawW = rawMap[k];
      const normalizedW = sum > 0 ? rawW / sum : 0;
      return {
        ...meta,
        rawWeight: rawW,
        simplexWeight: normalizedW,
        percentage: (normalizedW * 100).toFixed(2),
        isActive: rawW > 0,
      };
    })
    .sort((a, b) => b.simplexWeight - a.simplexWeight || a.key.localeCompare(b.key));

  return { rows, hasExplicitWeights };
}

export function computeReliabilityAxisScale(deciles: DecileRow[]): {
  axisMax: number;
  ticks: number[];
  digits: number;
} {
  const maxObservedOrPred = deciles.reduce(
    (m, d) => Math.max(m, d.meanPredicted, d.meanObserved),
    UNIFORM_SINGLE_NUMBER_PROBABILITY
  );
  const axisMax = Math.min(
    1.0,
    Math.max(0.10, Math.ceil((maxObservedOrPred * 1.15) / 0.02) * 0.02)
  );
  const ticks = [0, 0.25, 0.5, 0.75, 1.0].map((f) => f * axisMax);
  return {
    axisMax,
    ticks,
    digits: axisMax < 0.25 ? 3 : 2,
  };
}

const UNIFORM_LOG_LOSS_BENCHMARK = -(
  UNIFORM_SINGLE_NUMBER_PROBABILITY * Math.log(UNIFORM_SINGLE_NUMBER_PROBABILITY) +
  (1 - UNIFORM_SINGLE_NUMBER_PROBABILITY) * Math.log(1 - UNIFORM_SINGLE_NUMBER_PROBABILITY)
);

export const PredictiveCalibrationAnalyticsDashboard: React.FC<PredictiveCalibrationAnalyticsDashboardProps> = ({
  prediction,
  drawName,
}) => {
  const [activeTab, setActiveTab] = useState<"overview" | "simplex_channels" | "deciles_curve" | "stability">("overview");
  const [searchTerm, setSearchTerm] = useState("");

  const calib = prediction?.walkForwardCalibration;
  const hasMeasuredCalib = Boolean(calib && calib.evaluatedWindows > 0);
  const uniformBenchmark = UNIFORM_BRIER_REFERENCE;

  const { rows: channelsList, hasExplicitWeights } = useMemo(
    () => buildChannelSimplexRows(calib?.channelWeights),
    [calib?.channelWeights]
  );

  const filteredChannels = useMemo(() => {
    if (!searchTerm.trim()) return channelsList;
    const term = searchTerm.toLowerCase();
    return channelsList.filter(
      (c) =>
        c.label.toLowerCase().includes(term) ||
        c.key.toLowerCase().includes(term) ||
        c.layer.toLowerCase().includes(term) ||
        c.family.toLowerCase().includes(term)
    );
  }, [channelsList, searchTerm]);

  const bss = hasMeasuredCalib && calib ? calib.brierSkillScore : null;
  const bssPositive = bss !== null && bss > 0.0001;
  const brierScore = hasMeasuredCalib && calib ? calib.brierScore : null;
  const logLoss = hasMeasuredCalib && calib && typeof calib.logLoss === "number" && calib.logLoss > 0
    ? calib.logLoss
    : null;
  const ece = hasMeasuredCalib && calib && typeof calib.ece === "number" ? calib.ece : null;
  const lift = hasMeasuredCalib && calib && typeof calib.liftVsRandom === "number" ? calib.liftVsRandom : null;
  const meanHits = hasMeasuredCalib && calib && typeof calib.meanHits === "number" ? calib.meanHits : null;
  const evaluatedWindows = calib?.evaluatedWindows ?? 0;
  const holdoutDraws = calib?.holdoutDraws ?? 0;
  const holdoutBss = holdoutDraws > 0 && calib && typeof calib.holdoutBrierSkillScore === "number"
    ? calib.holdoutBrierSkillScore
    : null;
  const bootstrapMean = hasMeasuredCalib && calib && typeof calib.blockBootstrapBssMean === "number"
    ? calib.blockBootstrapBssMean
    : null;
  const bootstrapStd = hasMeasuredCalib && calib && typeof calib.blockBootstrapBssStd === "number" && calib.blockBootstrapBssStd > 0
    ? calib.blockBootstrapBssStd
    : null;
  const plattAlpha = hasMeasuredCalib && calib ? calib.plattAlpha : null;
  const plattBeta = hasMeasuredCalib && calib ? calib.plattBeta : null;

  const deciles: DecileRow[] = useMemo(() => {
    if (
      calib?.decileCalibration &&
      calib.decileCalibration.length === 10 &&
      calib.decileCalibration.some((d) => d.count > 0)
    ) {
      return calib.decileCalibration;
    }
    return [];
  }, [calib?.decileCalibration]);

  const reliabilityScale = useMemo(() => computeReliabilityAxisScale(deciles), [deciles]);
  const activeChannelCount = useMemo(
    () => channelsList.filter((c) => c.isActive).length,
    [channelsList]
  );

  return (
    <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 md:p-8 border border-slate-200 dark:border-slate-800 shadow-sm space-y-6">
      {/* En-tête : Titre & Métadonnées unboxed */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mb-1">
            <span>Validation Empirique Out-Of-Fold</span>
            <span aria-hidden="true">·</span>
            <span>Simplexe {ACTIVE_ALGO_COUNT} Canaux ({activeChannelCount} actifs)</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono text-indigo-600 dark:text-indigo-400 font-semibold">{drawName}</span>
          </div>
          <h3 className="text-lg md:text-xl font-bold text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
            <Target size={20} className="text-indigo-500" />
            Tableau Analytique de Calibration & Simplexe Bayésien
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-3xl leading-relaxed">
            Évaluation Walk-Forward causale face à la loi uniforme 5/90 (
            <span className="font-mono tabular-nums">BS_ref = {uniformBenchmark.toFixed(5)}</span>,{" "}
            <span className="font-mono tabular-nums">LL_ref = {UNIFORM_LOG_LOSS_BENCHMARK.toFixed(4)}</span>) et répartition normalisée des {ACTIVE_ALGO_COUNT} canaux actifs sur le simplexe (
            <span className="font-mono tabular-nums">Sum(w_k) = 100%</span>).
          </p>
        </div>

        {/* Sélecteur de sous-onglets fonctionnel */}
        <div className="flex items-center p-1 bg-slate-100 dark:bg-slate-800 rounded-xl self-start md:self-auto">
          <button
            onClick={() => setActiveTab("overview")}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
              activeTab === "overview"
                ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
            }`}
          >
            Vue Synthèse
          </button>
          <button
            onClick={() => setActiveTab("simplex_channels")}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
              activeTab === "simplex_channels"
                ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
            }`}
          >
            {ACTIVE_ALGO_COUNT} Canaux ({activeChannelCount}/{channelsList.length})
          </button>
          <button
            onClick={() => setActiveTab("deciles_curve")}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
              activeTab === "deciles_curve"
                ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
            }`}
          >
            Courbe Déciles
          </button>
          <button
            onClick={() => setActiveTab("stability")}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
              activeTab === "stability"
                ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
            }`}
          >
            Platt & Bootstrap
          </button>
        </div>
      </div>

      {/* Grille des 4 Métriques Fondamentales (KPI Cards) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1 : Brier Skill Score */}
        <div className="bg-slate-50 dark:bg-slate-800/60 rounded-2xl p-4 border border-slate-200/80 dark:border-slate-800 space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span className="font-semibold uppercase tracking-wider text-[10px]">Brier Skill Score (BSS)</span>
            <ShieldCheck size={14} className={bssPositive ? "text-emerald-500" : "text-amber-500"} />
          </div>
          <div className="flex items-baseline gap-2">
            <span
              className={`text-2xl font-black font-mono tabular-nums ${
                bssPositive ? "text-emerald-600 dark:text-emerald-400" : "text-slate-700 dark:text-slate-300"
              }`}
            >
              {bss !== null ? `${bss > 0 ? "+" : ""}${(bss * 100).toFixed(2)}%` : "n/d"}
            </span>
            <span className="text-[11px] text-slate-500 dark:text-slate-400">vs hasard</span>
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight">
            Gain relatif sur l'erreur quadratique uniforme (1 - BS / BS_ref).
          </div>
        </div>

        {/* Card 2 : Brier Score & Log-Loss */}
        <div className="bg-slate-50 dark:bg-slate-800/60 rounded-2xl p-4 border border-slate-200/80 dark:border-slate-800 space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span className="font-semibold uppercase tracking-wider text-[10px]">Brier Score & Log-Loss</span>
            <Activity size={14} className="text-indigo-500" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black font-mono tabular-nums text-slate-900 dark:text-white">
              {brierScore !== null ? brierScore.toFixed(4) : "n/d"}
            </span>
            <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
              (LL: {logLoss !== null ? logLoss.toFixed(4) : "n/d"})
            </span>
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight">
            Seuils neutres : BS {uniformBenchmark.toFixed(4)} · LL {UNIFORM_LOG_LOSS_BENCHMARK.toFixed(4)}.
          </div>
        </div>

        {/* Card 3 : Expected Calibration Error (ECE) */}
        <div className="bg-slate-50 dark:bg-slate-800/60 rounded-2xl p-4 border border-slate-200/80 dark:border-slate-800 space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span className="font-semibold uppercase tracking-wider text-[10px]">Calibration Error (ECE)</span>
            <TrendingUp size={14} className="text-cyan-500" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black font-mono tabular-nums text-indigo-600 dark:text-indigo-400">
              {ece !== null ? `${(ece * 100).toFixed(2)}%` : "n/d"}
            </span>
            <span className="text-[11px] text-slate-500 dark:text-slate-400">écart pondéré</span>
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight">
            Écart moyen pondéré sur 10 déciles quantiles OOF.
          </div>
        </div>

        {/* Card 4 : Lift vs Hasard & Hits */}
        <div className="bg-slate-50 dark:bg-slate-800/60 rounded-2xl p-4 border border-slate-200/80 dark:border-slate-800 space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span className="font-semibold uppercase tracking-wider text-[10px]">Lift vs Hasard (Top 5)</span>
            <BarChart3 size={14} className="text-emerald-500" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
              {lift !== null ? `${lift.toFixed(2)}x` : "n/d"}
            </span>
            <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
              ({meanHits !== null ? `${meanHits.toFixed(2)} hits/tirage` : "n/d"})
            </span>
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight">
            Espérance uniforme : {UNIFORM_EXPECTED_HITS_TOP_K.toFixed(3)} numéro touché par ticket de 5 boules.
          </div>
        </div>
      </div>

      {/* Contenu de l'onglet actif */}
      {activeTab === "overview" && (
        <div className="space-y-6 pt-2">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
                  Top 6 Canaux Prépondérants sur le Simplexe ({hasExplicitWeights ? "Poids Actifs" : "Prior Uniforme"})
                </h4>
                <button
                  onClick={() => setActiveTab("simplex_channels")}
                  className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1"
                >
                  Voir les {ACTIVE_ALGO_COUNT} canaux <ChevronRight size={14} />
                </button>
              </div>

              <div className="space-y-2.5">
                {channelsList.slice(0, 6).map((c, i) => (
                  <div
                    key={c.key}
                    className="p-3 bg-slate-50/70 dark:bg-slate-800/40 rounded-xl border border-slate-100 dark:border-slate-800 flex items-center justify-between gap-4"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="font-mono text-xs text-slate-400 font-bold w-5">{String(i + 1).padStart(2, "0")}.</span>
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">{c.label}</div>
                        <div className="text-[10px] text-slate-400 dark:text-slate-500 truncate font-mono">
                          {c.layer} · {c.family}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <div className="w-24 md:w-36 bg-slate-200 dark:bg-slate-700 h-2 rounded-full overflow-hidden">
                        <div
                          className="bg-indigo-600 dark:bg-indigo-400 h-full rounded-full transition-all duration-300"
                          style={{ width: `${Math.min(100, c.simplexWeight * 400)}%` }}
                        />
                      </div>
                      <span className="font-mono text-xs font-bold text-slate-900 dark:text-white tabular-nums w-14 text-right">
                        {c.percentage}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Diagnostic & Fiabilité Empirique */}
            <div className="p-5 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-slate-200/80 dark:border-slate-800 space-y-4">
              <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
                Garanties de Convergence
              </h4>

              <div className="space-y-3 text-xs">
                <div className="flex justify-between items-center pb-2 border-b border-slate-200/60 dark:border-slate-800">
                  <span className="text-slate-500 dark:text-slate-400">Fenêtres Walk-Forward</span>
                  <span className="font-mono font-bold text-slate-900 dark:text-white">
                    {evaluatedWindows > 0 ? `${evaluatedWindows} tirages` : "n/d"}
                  </span>
                </div>
                <div className="flex justify-between items-center pb-2 border-b border-slate-200/60 dark:border-slate-800">
                  <span className="text-slate-500 dark:text-slate-400">Échantillon Holdout Gelé</span>
                  <span className="font-mono font-bold text-slate-900 dark:text-white">
                    {holdoutDraws > 0 ? `${holdoutDraws} tirages` : "n/d"}
                  </span>
                </div>
                <div className="flex justify-between items-center pb-2 border-b border-slate-200/60 dark:border-slate-800">
                  <span className="text-slate-500 dark:text-slate-400">Pente de Platt (alpha)</span>
                  <span className="font-mono font-bold text-slate-900 dark:text-white">
                    {plattAlpha !== null ? plattAlpha.toFixed(3) : "n/d"}
                  </span>
                </div>
                <div className="flex justify-between items-center pb-2 border-b border-slate-200/60 dark:border-slate-800">
                  <span className="text-slate-500 dark:text-slate-400">Biais de Platt (beta)</span>
                  <span className="font-mono font-bold text-slate-900 dark:text-white">
                    {plattBeta !== null ? plattBeta.toFixed(3) : "n/d"}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500 dark:text-slate-400">Statut Qualitatif</span>
                  <span className="font-mono text-[11px] font-bold text-indigo-600 dark:text-indigo-400">
                    {calib?.calibrationQualityLabel?.replace(/_/g, " ") || "n/d"}
                  </span>
                </div>
              </div>

              <div className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                Les probabilités marginales finales sont shrinkées par Empirical Bayes (λ) selon le BSS out-of-fold mesuré sur l'historique causal et projetées sur le simplexe Sum(p_n) = 5.0.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Onglet : Canaux du Simplexe */}
      {activeTab === "simplex_channels" && (
        <div className="space-y-4 pt-2">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="text-xs text-slate-500 dark:text-slate-400">
              Distribution des {channelsList.length} canaux <span className="font-mono font-semibold text-slate-800 dark:text-slate-200">w_k</span> sur le simplexe (
              <span className="font-mono tabular-nums">Sum = 100.0%</span>, <span className="font-mono">w_k &gt;= 0</span> ·{" "}
              <span className="font-mono">{activeChannelCount} actifs</span>)
            </div>
            <input
              type="text"
              placeholder="Filtrer par nom ou couche..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="px-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500 w-full sm:w-64"
            />
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-500 dark:text-slate-400 font-semibold border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="py-2.5 px-3">#</th>
                  <th className="py-2.5 px-3">Canal Algorithmique</th>
                  <th className="py-2.5 px-3">Couche & Famille Mathématique</th>
                  <th className="py-2.5 px-3">Formule Opératoire</th>
                  <th className="py-2.5 px-3 w-40">Distribution</th>
                  <th className="py-2.5 px-3 text-right">Poids Simplexe</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredChannels.map((c, i) => (
                  <tr
                    key={c.key}
                    className={`hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors ${
                      !c.isActive ? "opacity-55" : ""
                    }`}
                  >
                    <td className="py-2.5 px-3 font-mono text-slate-400 font-bold">{String(i + 1).padStart(2, "0")}</td>
                    <td className="py-2.5 px-3">
                      <div className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                        <span>{c.label}</span>
                        {!c.isActive && (
                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-200/70 dark:bg-slate-700/70 text-slate-600 dark:text-slate-300">
                            Inactif
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] font-mono text-slate-400">{c.key}</div>
                    </td>
                    <td className="py-2.5 px-3">
                      <div className="text-slate-700 dark:text-slate-300 font-medium">{c.layer}</div>
                      <div className="text-[10px] text-slate-400">{c.family}</div>
                    </td>
                    <td className="py-2.5 px-3 font-mono text-[11px] text-slate-500 dark:text-slate-400">{c.formula}</td>
                    <td className="py-2.5 px-3">
                      <div className="w-full bg-slate-200 dark:bg-slate-700 h-2 rounded-full overflow-hidden">
                        <div
                          className="bg-indigo-600 dark:bg-indigo-400 h-full rounded-full"
                          style={{ width: `${Math.min(100, c.simplexWeight * 400)}%` }}
                        />
                      </div>
                    </td>
                    <td className="py-2.5 px-3 font-mono font-bold text-slate-900 dark:text-white tabular-nums text-right">
                      {c.percentage}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Onglet : Courbe de Calibration Décile par Décile */}
      {activeTab === "deciles_curve" && (
        <div className="space-y-4 pt-2">
          <div className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
            Diagramme de fiabilité (Reliability Diagram) comparant la probabilité prédite moyenne de chaque décile quantile à la fréquence observée out-of-fold. La diagonale pointillée représente la calibration parfaite (<span className="font-mono">P_obs = P_pred</span>) et l'axe [0, {reliabilityScale.axisMax.toFixed(2)}] épouse l'échelle réelle 5/90 (<span className="font-mono">p_0 = 0.0556</span>).
          </div>

          {deciles.length === 0 ? (
            <div className="p-8 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 text-center text-xs text-slate-500 dark:text-slate-400">
              Données out-of-fold insuffisantes pour calculer les 10 déciles quantiles (minimum 8 tirages historiques requis).
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* Visualisation SVG Haute Précision */}
              <div className="lg:col-span-7 bg-slate-50 dark:bg-slate-800/40 p-4 rounded-2xl border border-slate-200 dark:border-slate-800">
                <div className="relative aspect-[4/3] w-full">
                  <svg viewBox="0 0 400 300" className="w-full h-full overflow-visible font-mono text-[10px]">
                    {/* Grille de fond alignée sur [0, axisMax] */}
                    {[0, 0.25, 0.5, 0.75, 1.0].map((frac, idx) => {
                      const val = reliabilityScale.ticks[idx];
                      const y = 260 - frac * 220;
                      const x = 50 + frac * 320;
                      return (
                        <React.Fragment key={frac}>
                          <line x1={50} y1={y} x2={370} y2={y} stroke="currentColor" className="text-slate-200 dark:text-slate-700" strokeDasharray="3 3" />
                          <line x1={x} y1={40} x2={x} y2={260} stroke="currentColor" className="text-slate-200 dark:text-slate-700" strokeDasharray="3 3" />
                          <text x={44} y={y + 3} textAnchor="end" className="fill-slate-400 text-[9px]">{val.toFixed(reliabilityScale.digits)}</text>
                          <text x={x} y={276} textAnchor="middle" className="fill-slate-400 text-[9px]">{val.toFixed(reliabilityScale.digits)}</text>
                        </React.Fragment>
                      );
                    })}

                    {/* Référence équiprobable 5/90 */}
                    {UNIFORM_SINGLE_NUMBER_PROBABILITY <= reliabilityScale.axisMax && (
                      <>
                        <line
                          x1={50}
                          y1={260 - (UNIFORM_SINGLE_NUMBER_PROBABILITY / reliabilityScale.axisMax) * 220}
                          x2={370}
                          y2={260 - (UNIFORM_SINGLE_NUMBER_PROBABILITY / reliabilityScale.axisMax) * 220}
                          stroke="#cbd5e1"
                          strokeWidth={1}
                          strokeDasharray="2 3"
                        />
                        <line
                          x1={50 + (UNIFORM_SINGLE_NUMBER_PROBABILITY / reliabilityScale.axisMax) * 320}
                          y1={40}
                          x2={50 + (UNIFORM_SINGLE_NUMBER_PROBABILITY / reliabilityScale.axisMax) * 320}
                          y2={260}
                          stroke="#cbd5e1"
                          strokeWidth={1}
                          strokeDasharray="2 3"
                        />
                      </>
                    )}

                    {/* Diagonale de calibration idéale y = x */}
                    <line x1={50} y1={260} x2={370} y2={40} stroke="#94a3b8" strokeWidth={1.5} strokeDasharray="4 4" />

                    {/* Ligne empirique observée */}
                    <polyline
                      fill="none"
                      stroke="#6366f1"
                      strokeWidth={2.5}
                      points={deciles
                        .map((d) => {
                          const px = 50 + (d.meanPredicted / reliabilityScale.axisMax) * 320;
                          const py = 260 - (d.meanObserved / reliabilityScale.axisMax) * 220;
                          return `${Math.min(370, Math.max(50, px))},${Math.min(260, Math.max(40, py))}`;
                        })
                        .join(" ")}
                    />

                    {/* Points des déciles */}
                    {deciles.map((d) => {
                      const px = Math.min(370, Math.max(50, 50 + (d.meanPredicted / reliabilityScale.axisMax) * 320));
                      const py = Math.min(260, Math.max(40, 260 - (d.meanObserved / reliabilityScale.axisMax) * 220));
                      return (
                        <g key={d.decile}>
                          <circle cx={px} cy={py} r={4.5} fill="#6366f1" className="stroke-white dark:stroke-slate-900 stroke-2" />
                          <text x={px} y={py - 8} textAnchor="middle" className="fill-indigo-600 dark:fill-indigo-400 font-bold text-[8px]">
                            D{d.decile}
                          </text>
                        </g>
                      );
                    })}

                    {/* Légendes des axes */}
                    <text x={210} y={295} textAnchor="middle" className="fill-slate-500 font-semibold text-[10px]">
                      Probabilité Prédite Moyenne P_pred
                    </text>
                    <text x={12} y={150} textAnchor="middle" transform="rotate(-90 12 150)" className="fill-slate-500 font-semibold text-[10px]">
                      Fréquence Observée P_obs
                    </text>
                  </svg>
                </div>
              </div>

              {/* Tableau des 10 Déciles */}
              <div className="lg:col-span-5 overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-500 dark:text-slate-400 font-semibold border-b border-slate-200 dark:border-slate-800">
                    <tr>
                      <th className="py-2 px-2.5">Décile</th>
                      <th className="py-2 px-2.5 font-mono">P_pred</th>
                      <th className="py-2 px-2.5 font-mono">P_obs</th>
                      <th className="py-2 px-2.5 text-right font-mono">Écart</th>
                      <th className="py-2 px-2.5 text-right font-mono">N</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {deciles.map((d) => {
                      const gap = Math.abs(d.meanPredicted - d.meanObserved);
                      return (
                        <tr key={d.decile} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                          <td className="py-1.5 px-2.5 font-mono font-bold text-slate-600 dark:text-slate-400">D{d.decile}</td>
                          <td className="py-1.5 px-2.5 font-mono tabular-nums">{d.meanPredicted.toFixed(4)}</td>
                          <td className="py-1.5 px-2.5 font-mono tabular-nums text-slate-900 dark:text-white font-semibold">
                            {d.meanObserved.toFixed(4)}
                          </td>
                          <td className="py-1.5 px-2.5 font-mono tabular-nums text-right text-indigo-600 dark:text-indigo-400">
                            {gap.toFixed(4)}
                          </td>
                          <td className="py-1.5 px-2.5 font-mono tabular-nums text-right text-slate-500">
                            {d.count}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Onglet : Platt & Stabilité Bootstrap */}
      {activeTab === "stability" && (
        <div className="space-y-6 pt-2">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Régression Affine de Platt */}
            <div className="p-5 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-4">
              <div className="flex items-center gap-2">
                <Sliders size={16} className="text-indigo-500" />
                <h4 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                  Calibration de Platt Out-Of-Fold
                </h4>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                Transformation affine continue <span className="font-mono font-semibold">p' = alpha * p + beta</span> estimée sur les sorties de validation sans jamais toucher aux tirages de holdout.
              </p>

              <div className="space-y-3 pt-2 text-xs">
                <div className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 flex justify-between items-center">
                  <span className="text-slate-500">Pente de Calibration (alpha)</span>
                  <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400 tabular-nums">
                    {plattAlpha !== null ? plattAlpha.toFixed(4) : "n/d"}
                  </span>
                </div>
                <div className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 flex justify-between items-center">
                  <span className="text-slate-500">Biais Stochastique (beta)</span>
                  <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400 tabular-nums">
                    {plattBeta !== null ? plattBeta.toFixed(4) : "n/d"}
                  </span>
                </div>
              </div>
            </div>

            {/* Jackknife / Block Bootstrap */}
            <div className="p-5 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-4">
              <div className="flex items-center gap-2">
                <ShieldCheck size={16} className="text-emerald-500" />
                <h4 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                  Stabilité Jackknife & Holdout Gelé
                </h4>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                Validation par ré-échantillonnage par blocs contigus non-chevauchants pour mesurer l'autocorrélation temporelle et vérifier le BSS hors-échantillon final.
              </p>

              <div className="space-y-3 pt-2 text-xs">
                <div className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 flex justify-between items-center">
                  <span className="text-slate-500">BSS Holdout Gelé</span>
                  <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400 tabular-nums">
                    {holdoutBss !== null ? `${holdoutBss > 0 ? "+" : ""}${(holdoutBss * 100).toFixed(2)}%` : "n/d"}
                  </span>
                </div>
                <div className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 flex justify-between items-center">
                  <span className="text-slate-500">BSS Moyen Bootstrap</span>
                  <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                    {bootstrapMean !== null ? `${bootstrapMean > 0 ? "+" : ""}${(bootstrapMean * 100).toFixed(2)}%` : "n/d"}
                  </span>
                </div>
                <div className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 flex justify-between items-center">
                  <span className="text-slate-500">Écart-Type Jackknife (sigma)</span>
                  <span className="font-mono font-bold text-slate-700 dark:text-slate-300 tabular-nums">
                    {bootstrapStd !== null ? bootstrapStd.toFixed(4) : "n/d"}
                  </span>
                </div>
                <div className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 flex justify-between items-center">
                  <span className="text-slate-500">Tirages Holdout Évalués</span>
                  <span className="font-mono font-bold text-slate-900 dark:text-white tabular-nums">
                    {holdoutDraws > 0 ? `${holdoutDraws} tirages` : "n/d"}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
