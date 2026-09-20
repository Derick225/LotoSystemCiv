/**
 * CONSTANTES DE CALIBRATION DU MOTEUR DE PRÉDICTION
 * =================================================
 *
 * Registre central et documenté des paramètres d'accord (« tuning knobs ») du moteur.
 *
 * POURQUOI CE FICHIER EXISTE
 * --------------------------
 * AGENTS.md impose le principe « ZÉRO NOMBRE MAGIQUE ». Idéalement, chaque paramètre
 * devrait être dérivé continûment des données (variance, entropie, Hurst, structure du
 * jeu). En pratique, certains paramètres d'accord restent des choix de calibration
 * empiriques : ils ne sont PAS dérivables de façon exacte sans introduire de sur-apprentissage.
 *
 * Plutôt que de les laisser éparpillés (et parfois accompagnés de commentaires affirmant à
 * tort « zéro nombre magique »), ils sont rassemblés ici, nommés, et documentés honnêtement.
 * Cela rend l'ensemble des points de calibrage auditable en un seul endroit, sans modifier le
 * comportement numérique : les valeurs sont strictement identiques à celles auparavant codées
 * en dur sur leurs sites d'utilisation.
 *
 * INVARIANT : toute modification d'une valeur ci-dessous DOIT être justifiée (backtest
 * walk-forward, calibration de Platt, ou dérivation statistique) et re-validée par la suite
 * de tests + le golden-master. Aucune valeur ne doit être ajustée « au feeling ».
 */

/**
 * Calibrage du facteur de shrinkage (rétraction continue des scores).
 * Site : predictionOrchestrator.applyDifferentiableShrinkage.
 *
 * Le facteur de shrinkage contracte les scores lorsque le signal est plat/indécis. Il est
 * produit par une sigmoïde du coefficient de variation (CV) des scores :
 *   factor = FLOOR + SPAN * sigmoid(STEEPNESS * (cv - CV_MIDPOINT))
 */
export const SHRINKAGE_CALIBRATION = {
  /** Pente de la sigmoïde en fonction du CV. Contrôle la netteté de la transition. */
  SIGMOID_STEEPNESS: 10.0,
  /** CV charnière : en dessous, le signal est jugé plat et le shrinkage se contracte. */
  CV_MIDPOINT: 0.22,
  /** Borne basse du facteur (shrinkage maximal appliqué aux scores). */
  FACTOR_FLOOR: 0.70,
  /** Amplitude totale de variation du facteur (FACTOR_FLOOR + FACTOR_SPAN = 1.0). */
  FACTOR_SPAN: 0.30,
  /** Seuillage continu au-delà duquel le shrinkage est réputé « appliqué » (pour le log). */
  APPLIED_THRESHOLD: 0.985,
} as const;

/**
 * Exposants de l'agrégation poly-harmonique du score de stabilité.
 * Site : predictionFinalize (calcul de combinedStability).
 *
 * Moyenne géométrique pondérée de trois composantes de stabilité dans l'espace log :
 *   R = S_perturb^PERTURB * S_snr^SNR * S_sharpness^SHARPNESS
 * Les exposants somment à 1.0 (convex combination en log-espace).
 */
export const STABILITY_POLYHARMONIC_WEIGHTS = {
  /** Poids de la stabilité sous perturbation (composante dominante). */
  PERTURBATION: 0.5,
  /** Poids du rapport signal/bruit. */
  SNR: 0.3,
  /** Poids de l'acuité (1 - entropie normalisée). */
  SHARPNESS: 0.2,
} as const;

/**
 * Pondération de l'indice « d'alignement avec la réalité » d'un ticket.
 * Site : predictionFinalize (calcul de realityAlignment).
 *
 * Combinaison convexe (somme = 1.0) de quatre métriques d'un ticket :
 *   alignment = STABILITY*stabilityScore + SUM*sumLikelihood + PARITY*parityLikelihood + DIVERSITY*diversity
 */
export const REALITY_ALIGNMENT_WEIGHTS = {
  /** Stabilité structurelle du ticket (poids dominant). */
  STABILITY: 0.40,
  /** Vraisemblance de la somme (CDF gaussienne sur la somme historique). */
  SUM_LIKELIHOOD: 0.30,
  /** Vraisemblance de la parité (binomiale pair/impair). */
  PARITY_LIKELIHOOD: 0.20,
  /** Diversité topologique du ticket. */
  DIVERSITY: 0.10,
} as const;

/**
 * Taux d'apprentissage de base de l'optimiseur d'ADN algorithmique.
 * Site : DNAOptimizer (calcul de learningFactor).
 *
 * learningFactor = BASE * (1 + gini - entropy) : la concentration de la composition gagnante
 * (Gini élevé / entropie faible) autorise un ajustement plus ferme. BASE borne l'amplitude.
 */
export const DNA_LEARNING_CALIBRATION = {
  /** Facteur d'apprentissage de base avant modulation par la concentration du signal. */
  BASE_LEARNING_FACTOR: 0.12,
} as const;

/**
 * Calibration de l'autopsie en boucle fermée (closed-loop autopsy).
 * Site : closedLoopAutopsyService (calcul de calibrationAccuracy).
 *
 * calibrationAccuracy = 100 * exp(-brierScore * DECAY). Le score de Brier mesure l'écart
 * quadratique entre probabilités prédites et réalisation ; DECAY fixe l'échelle de conversion
 * Brier -> pourcentage de calibration.
 */
export const AUTOPSY_CALIBRATION = {
  /** Échelle de décroissance exponentielle convertissant le Brier en indice de calibration. */
  BRIER_TO_ACCURACY_DECAY: 20.0,
} as const;

/**
 * Barème de l'indice global d'intégrité du modèle.
 * Site : shrinkageVerificationService (calcul de integrityIndex).
 *
 * Chaque dérive détectée retire des points selon sa sévérité, atténués par tanh(valeur) ;
 * l'indice final = 100 * exp(-réduction / DECAY_SCALE).
 */
export const INTEGRITY_INDEX_CALIBRATION = {
  /** Points retirés par une dérive critique. */
  SEVERITY_CRITICAL: 40,
  /** Points retirés par un avertissement. */
  SEVERITY_WARNING: 15,
  /** Points retirés par une dérive mineure (info). */
  SEVERITY_INFO: 5,
  /** Échelle de décroissance exponentielle de la réduction totale -> indice [0,100]. */
  DECAY_SCALE: 50.0,
} as const;
