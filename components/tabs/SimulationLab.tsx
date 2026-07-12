import { useNexusStore } from "../../store/useNexusStore";
import React, { useState, useRef } from 'react';
import * as tf from '@tensorflow/tfjs';
import { Upload, Play, Square, Activity, Database, Sparkles, Sliders, CheckCircle, AlertTriangle } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { audioEngine } from '../../utils/audioEngine';
import { useToast } from '../ui/Toast';
import { LCG } from '../../utils/mathUtils';
import { AlgoKey } from "../../shared/prediction.types";

const DOMAIN_SIZE = 90;
const DRAW_SIZE = 5;

// Tente d'extraire 5 numéros gagnants valides (entiers distincts, 1-90) d'un enregistrement
// brut importé (CSV ou JSON), quel que soit le nom exact des colonnes utilisées par l'utilisateur.
const extractDrawFromRecord = (record: any): number[] | null => {
  if (!record || typeof record !== 'object') return null;

  const toNumberArray = (val: any): number[] | null => {
    if (Array.isArray(val)) {
      const nums = val.map(v => Number(v)).filter(n => Number.isFinite(n));
      return nums.length >= DRAW_SIZE ? nums.slice(0, DRAW_SIZE) : null;
    }
    if (typeof val === 'string') {
      const nums = val.split(/[\s,;\-\|]+/).map(v => Number(v.trim())).filter(n => Number.isFinite(n));
      return nums.length >= DRAW_SIZE ? nums.slice(0, DRAW_SIZE) : null;
    }
    return null;
  };

  // Stratégie 1 : un champ unique contenant les 5 numéros (array ou chaîne délimitée)
  const arrayFieldNames = ['gagnants', 'numbers', 'numeros', 'winningnumbers', 'winning_numbers', 'boules'];
  for (const key of Object.keys(record)) {
    if (arrayFieldNames.includes(key.toLowerCase())) {
      const parsed = toNumberArray(record[key]);
      if (parsed) return parsed;
    }
  }

  // Stratégie 2 : 5 champs numériques séparés (n1..n5, num1..num5, boule1..boule5, etc.)
  const prefixes = ['n', 'num', 'numero', 'boule', 'gagnant', 'b'];
  for (const prefix of prefixes) {
    const collected: number[] = [];
    for (let i = 1; i <= DRAW_SIZE; i++) {
      const key = Object.keys(record).find(k => k.toLowerCase() === `${prefix}${i}`);
      if (key === undefined) break;
      const n = Number(record[key]);
      if (!Number.isFinite(n)) break;
      collected.push(n);
    }
    if (collected.length === DRAW_SIZE) return collected;
  }

  // Stratégie 3 (repli) : les 5 premières valeurs numériques trouvées dans l'objet
  const allNums = Object.values(record).map(v => Number(v)).filter(n => Number.isFinite(n));
  if (allNums.length >= DRAW_SIZE) return allNums.slice(0, DRAW_SIZE);

  return null;
};

// Valide qu'un tirage extrait est réellement exploitable : 5 entiers distincts dans [1, 90]
const isValidDraw = (nums: number[] | null): nums is number[] => {
  if (!nums || nums.length !== DRAW_SIZE) return false;
  const unique = new Set(nums.map(n => Math.round(n)));
  if (unique.size !== DRAW_SIZE) return false;
  return nums.every(n => Number.isInteger(Math.round(n)) && n >= 1 && n <= DOMAIN_SIZE);
};

export const SimulationLab: React.FC<{ drawName: string }> = ({ drawName }) => {
  const { showToast } = useToast();
  const [fileData, setFileData] = useState<any[] | null>(null);
  const [fileDraws, setFileDraws] = useState<{ gagnants: number[] }[] | null>(null);
  const [fileParseWarning, setFileParseWarning] = useState<string | null>(null);
  const [mlPrediction, setMlPrediction] = useState<number[]>([]);
  const [trainingState, setTrainingState] = useState<'idle' | 'training' | 'finished'>('idle');
  const [trainingDataSource, setTrainingDataSource] = useState<{ type: 'history' | 'file'; sampleCount: number } | null>(null);
  const history = useNexusStore(state => state.history);
  const updateGlobalWeights = useNexusStore(state => state.updateGlobalWeights);
  const [epochLogs, setEpochLogs] = useState<{ epoch: number, loss: number, val_loss?: number, acc: number, val_acc?: number }[]>([]);
  
  // Custom interactive configs
  const [epochsCount, setEpochsCount] = useState(50);
  const [learningRate, setLearningRate] = useState(0.01);
  const [optimizerType, setOptimizerType] = useState<'adam' | 'sgd' | 'rmsprop'>('adam');
  const [hiddenLayersConfig, setHiddenLayersConfig] = useState<'32x16' | '64x32' | '16x8'>('32x16');
  const [activationFn, setActivationFn] = useState<'relu' | 'sigmoid' | 'tanh'>('relu');
  const [dropoutRate, setDropoutRate] = useState(0.2);
  const [selectedFeatures, setSelectedFeatures] = useState<{ winNums: boolean, gaps: boolean, parity: boolean }>({
    winNums: true,
    gaps: true,
    parity: false
  });

  const modelRef = useRef<tf.Sequential | null>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        let data: any[] = [];
        if (file.name.endsWith('.json')) {
          data = JSON.parse(text);
        } else if (file.name.endsWith('.csv')) {
          const lines = text.split('\n').filter(l => l.trim().length > 0);
          const headers = lines[0].split(',').map(h => h.trim());
          data = lines.slice(1).map(line => {
            const values = line.split(',');
            let obj: any = {};
            headers.forEach((h, i) => {
              obj[h] = values[i]?.trim();
            });
            return obj;
          });
        }
        
        if (data && data.length > 0) {
          const parsedDraws = data
            .map(extractDrawFromRecord)
            .filter(isValidDraw)
            .map(gagnants => ({ gagnants: gagnants.sort((a, b) => a - b) }));

          setFileData(data);

          if (parsedDraws.length < 20) {
            // Moins de 20 tirages exploitables : pas assez de matière pour un entraînement
            // significatif. On le dit clairement plutôt que de basculer sur du bruit aléatoire.
            setFileDraws(null);
            setFileParseWarning(
              `${parsedDraws.length} tirage(s) valide(s) détecté(s) sur ${data.length} ligne(s) — ` +
              `il en faut au moins 20 (5 numéros distincts entre 1 et 90 par ligne). ` +
              `Vérifiez le format du fichier (colonnes attendues : gagnants/numbers, ou n1..n5, ou boule1..boule5).`
            );
            showToast(`Format non exploitable : seulement ${parsedDraws.length} tirage(s) valide(s) détecté(s).`, 'error');
          } else {
            setFileDraws(parsedDraws);
            setFileParseWarning(null);
            showToast(`Données chargées : ${parsedDraws.length} tirage(s) valide(s) sur ${data.length} ligne(s).`, 'success');
            audioEngine.play('success');
          }
        } else {
          setFileData(null);
          setFileDraws(null);
          setFileParseWarning(null);
          showToast(`Format de données non reconnu.`, 'error');
        }
      } catch (err) {
        showToast("Erreur lors de la lecture du fichier.", "error");
      }
    };
    reader.readAsText(file);
  };

  // Construit des paires (features, labels) à partir d'une séquence de tirages réels
  // (fichier importé ou historique de l'app), en respectant l'ordre "plus récent en premier"
  // utilisé partout ailleurs dans l'application (features tirées du tirage i, labels = tirage i+1
  // -> devenu i, i.e. le tirage suivant chronologiquement).
  const buildTensorsFromDraws = (draws: { gagnants: number[] }[]) => {
    const samples = Math.min(draws.length - 1, 500);
    const xData: number[][] = [];
    const yData: number[][] = [];

    for (let i = 0; i < samples; i++) {
      const currentDraw = draws[i + 1];
      const nextDraw = draws[i];
      if (!currentDraw || !nextDraw) continue;

      const features: number[] = [];
      if (selectedFeatures.winNums) {
        features.push(...[...currentDraw.gagnants].map(n => n / DOMAIN_SIZE));
      }
      if (selectedFeatures.gaps) {
        for (let j = 0; j < DRAW_SIZE; j++) {
          features.push(j < currentDraw.gagnants.length - 1 ? (currentDraw.gagnants[j + 1] - currentDraw.gagnants[j]) / DOMAIN_SIZE : 0);
        }
      }
      if (selectedFeatures.parity) {
        features.push(...[...currentDraw.gagnants].map(n => (n % 2 === 0 ? 1 : 0)));
      }
      if (features.length === 0) {
        features.push(...[...currentDraw.gagnants].map(n => n / DOMAIN_SIZE));
      }

      const labels = [...nextDraw.gagnants].map(n => n / DOMAIN_SIZE);

      xData.push(features);
      yData.push(labels);
    }

    if (xData.length === 0) return null;

    const X = tf.tensor2d(xData, [xData.length, xData[0].length]);
    const Y = tf.tensor2d(yData, [yData.length, 5]);
    return { X, Y, inputDim: xData[0].length, sampleCount: xData.length };
  };

  // Retourne les tenseurs d'entraînement à partir de vraies données uniquement.
  // Ne génère JAMAIS de données synthétiques : si rien d'exploitable n'est disponible,
  // retourne null et l'appelant doit refuser l'entraînement plutôt que d'entraîner sur du bruit.
  const prepareData = (): { X: tf.Tensor2D; Y: tf.Tensor2D; inputDim: number; source: 'history' | 'file'; sampleCount: number } | null => {
    if (fileDraws && fileDraws.length >= 20) {
      const built = buildTensorsFromDraws(fileDraws);
      if (!built) return null;
      const { X, Y, inputDim, sampleCount } = built;
      return { X, Y, inputDim, source: 'file', sampleCount };
    }

    if (history.length >= 20) {
      const built = buildTensorsFromDraws(history as unknown as { gagnants: number[] }[]);
      if (!built) return null;
      const { X, Y, inputDim, sampleCount } = built;
      return { X, Y, inputDim, source: 'history', sampleCount };
    }

    return null;
  };

  const startTraining = async () => {
    if (trainingState === 'training') return;
    audioEngine.play('click');

    const prepared = prepareData();
    if (!prepared) {
      showToast(
        "Entraînement impossible : aucune donnée réelle exploitable (il faut au moins 20 tirages, " +
        "via l'historique actif ou un fichier importé valide). Aucune donnée synthétique n'est générée à la place.",
        'error'
      );
      audioEngine.play('error');
      return;
    }

    setTrainingState('training');
    setEpochLogs([]);
    setTrainingDataSource({ type: prepared.source, sampleCount: prepared.sampleCount });

    const { X, Y, inputDim } = prepared;

    // Parse hidden layers dimensions
    const dims = hiddenLayersConfig.split('x').map(Number);

    const model = tf.sequential();
    model.add(tf.layers.dense({ units: dims[0], activation: activationFn, inputShape: [inputDim] }));
    if (dropoutRate > 0) {
      model.add(tf.layers.dropout({ rate: dropoutRate }));
    }
    model.add(tf.layers.dense({ units: dims[1], activation: activationFn }));
    model.add(tf.layers.dense({ units: 5, activation: 'linear' }));

    // Dynamic optimizer selection
    let opt;
    if (optimizerType === 'adam') {
      opt = tf.train.adam(learningRate);
    } else if (optimizerType === 'sgd') {
      opt = tf.train.sgd(learningRate);
    } else {
      opt = tf.train.rmsprop(learningRate);
    }

    model.compile({
      optimizer: opt,
      loss: 'meanSquaredError',
      metrics: ['mse']
    });

    modelRef.current = model;

    try {
      await model.fit(X, Y, {
        epochs: epochsCount,
        validationSplit: 0.2,
        batchSize: 32,
        callbacks: {
          onEpochEnd: (epoch, logs) => {
            // Proxy continu dérivé du MSE (pas une "accuracy" de classification au sens strict,
            // mais un indicateur de qualité d'ajustement borné [0,1] cohérent pour une régression).
            const mseProxyAccuracy = 1.0 - (logs?.mse || 0.5);
            const valMseProxyAccuracy = 1.0 - (logs?.val_mse || 0.5);
            
            // Interactive tick sound per 5 epochs
            if ((epoch + 1) % 5 === 0) {
              audioEngine.play('click');
            }

            setEpochLogs(prev => [...prev, {
              epoch: epoch + 1,
              loss: logs?.loss || 0,
              val_loss: logs?.val_loss,
              acc: Math.max(0, mseProxyAccuracy),
              val_acc: Math.max(0, valMseProxyAccuracy)
            }]);
          }
        }
      });
      
      // Make a prediction based on the most recent draw (history[0])
      if (history.length > 0) {
        const currentDraw = history[0];
        const features: number[] = [];
        if (selectedFeatures.winNums) {
          features.push(...[...currentDraw.gagnants].map(n => n / 90));
        }
        if (selectedFeatures.gaps) {
          for (let j = 0; j < 5; j++) {
            features.push(j < currentDraw.gagnants.length - 1 ? (currentDraw.gagnants[j+1] - currentDraw.gagnants[j]) / 90 : 0);
          }
        }
        if (selectedFeatures.parity) {
          features.push(...[...currentDraw.gagnants].map(n => (n % 2 === 0 ? 1 : 0)));
        }
        if (features.length === 0) {
          features.push(...[...currentDraw.gagnants].map(n => n / 90));
        }

        const inputTensor = tf.tensor2d([features], [1, features.length]);
        const predTensor = model.predict(inputTensor) as tf.Tensor;
        const predArray = await predTensor.data();
        
        const finalNumbers = Array.from(predArray).map(n => {
           let val = Math.round(n * 90);
           return Math.max(1, Math.min(90, val));
        });

        // 100% DETERMINISTIC fallback using LCG seed-based generation to replace Math.random() (AGENTS.md compliance)
        const prng = new LCG(history[0]?.date || "SimulationLabDeterministicFallback");
        const uniqueNumbers = Array.from(new Set(finalNumbers));
        while(uniqueNumbers.length < 5) {
           let r = Math.floor(prng.next() * 90) + 1;
           if(!uniqueNumbers.includes(r)) uniqueNumbers.push(r);
        }
        setMlPrediction(uniqueNumbers.sort((a,b)=>a-b));
        inputTensor.dispose();
        predTensor.dispose();
      }
      
      setTrainingState('finished');
      showToast("Entraînement terminé avec succès.", "success");
      audioEngine.play('success');
    } catch (e) {
      console.error(e);
      setTrainingState('idle');
      showToast("Erreur lors de l'entraînement du réseau de neurones.", "error");
      audioEngine.play('error');
    } finally {
      X.dispose();
      Y.dispose();
    }
  };

  const stopTraining = () => {
    if (modelRef.current && trainingState === 'training') {
      modelRef.current.stopTraining = true;
      setTrainingState('idle');
      showToast("Entraînement interrompu par l'utilisateur.", "info");
    }
  };

  // Weight Injection function (Self-Learning Closed-loop Integration)
  const injectWeights = async () => {
    if (epochLogs.length === 0) return;
    audioEngine.play('click');

    // GARDE-FOU : on n'injecte jamais de poids si l'entraînement n'a pas tourné sur de vraies
    // données (historique réel ou fichier importé validé), et jamais sur un échantillon trop
    // petit pour être statistiquement significatif. Avant ce correctif, un entraînement sur du
    // bruit aléatoire (tf.randomNormal/tf.randomUniform) pouvait déclencher jusqu'à +40% sur le
    // poids réel de production "aiIntuition", utilisé par le moteur de prédiction en direct.
    if (!trainingDataSource) {
      showToast("Injection refusée : aucune information sur la source des données d'entraînement.", "error");
      return;
    }
    const MIN_SAMPLES_FOR_INJECTION = 25;
    if (trainingDataSource.sampleCount < MIN_SAMPLES_FOR_INJECTION) {
      showToast(
        `Injection refusée : seulement ${trainingDataSource.sampleCount} échantillon(s) réel(s) ` +
        `(minimum requis : ${MIN_SAMPLES_FOR_INJECTION}) — trop peu pour garantir un signal fiable.`,
        "error"
      );
      return;
    }

    try {
      // On utilise la perte de VALIDATION (données jamais vues pendant l'entraînement, cf.
      // validationSplit: 0.2 plus haut) plutôt que la perte d'entraînement brute : celle-ci peut
      // diminuer même en cas de pur surapprentissage (ou, pire, en s'ajustant à du bruit), ce qui
      // ne reflète aucune amélioration réelle de la capacité prédictive.
      const epochsWithValLoss = epochLogs.filter(e => typeof e.val_loss === 'number');
      if (epochsWithValLoss.length < 5) {
        showToast("Injection refusée : pas assez d'époques avec perte de validation mesurée.", "error");
        return;
      }
      const firstValLoss = epochsWithValLoss[0].val_loss as number;
      const finalValLoss = epochsWithValLoss[epochsWithValLoss.length - 1].val_loss as number;
      const valLossDelta = firstValLoss - finalValLoss;

      // If validation loss went down, we boost the weight of the neural intuition algorithm proportionally.
      if (valLossDelta > 0) {
        const improvementRatio = Math.min(1, valLossDelta / firstValLoss);
        const drawNameKey = drawName || "Global";
        
        // Fetch current active weights
        const storeWeights = (useNexusStore.getState().globalWeights || {}) as Record<string, number>;
        const validKeys = Object.values(AlgoKey);
        
        // Check if there are any current valid keys in storeWeights
        const hasValidKeys = Object.keys(storeWeights).some(k => validKeys.includes(k as AlgoKey));
        
        const oldWeights = hasValidKeys 
          ? { ...storeWeights } 
          : validKeys.reduce((acc, key) => {
              acc[key] = 100.0 / validKeys.length;
              return acc;
            }, {} as Record<string, number>);

        // Deep copy of weights and filter out any stale/obsolete keys to prevent database/pipeline corruption
        const updated = {} as Record<string, number>;
        validKeys.forEach(key => {
          updated[key] = typeof oldWeights[key] === 'number' ? oldWeights[key] : (100.0 / validKeys.length);
        });
        
        // Boost Echo State (ESN) neural algorithm
        const echoStateKey = AlgoKey.ECHO_STATE;
        const currentEchoState = updated[echoStateKey] || (100.0 / validKeys.length);
        
        // Max boost of up to 40% based on VALIDATED learning improvement
        const boostAmount = currentEchoState * (improvementRatio * 0.40);
        updated[echoStateKey] = parseFloat((currentEchoState + boostAmount).toFixed(4));

        // Normalize weights to sum back to exactly 100
        const total = Object.values(updated).reduce((a, b) => a + b, 0);
        for (const key in updated) {
          updated[key] = parseFloat(((updated[key] / total) * 100).toFixed(4));
        }

        await updateGlobalWeights(updated as any, drawNameKey);
        showToast(
          `Succès : L'Echo State (ESN) a été boosté de +${boostAmount.toFixed(1)}% ` +
          `(validé sur ${trainingDataSource.sampleCount} échantillons réels, source : ` +
          `${trainingDataSource.type === 'file' ? 'fichier importé' : 'historique du tirage'}).`,
          "success"
        );
        audioEngine.play('success');
      } else {
        showToast("Injection annulée : la perte de validation n'a pas diminué (aucune amélioration réelle mesurée).", "info");
      }
    } catch (err) {
      showToast("Erreur lors de l'injection des poids.", "error");
    }
  };

  return (
    <div className="space-y-8 animate-fade-in w-full">
      <div className="bg-slate-900 p-8 rounded-3xl border border-slate-800 shadow-2xl relative overflow-hidden">
        <h3 className="text-2xl font-black text-white uppercase tracking-tighter mb-4 flex items-center gap-3">
          <Database className="text-fuchsia-500 animate-pulse" size={28} />
          Laboratoire d'Inférence et d'Apprentissage TensorFlow.js
        </h3>
        <p className="text-slate-400 text-sm font-medium mb-8">
          Entraînez un modèle de deep learning multi-couches de type Perceptron Séquentiel en temps réel dans votre navigateur, sur des données 100% réelles (historique du tirage ou fichier importé et validé). Aucune donnée synthétique n'est utilisée : si moins de 20 tirages exploitables sont disponibles, l'entraînement est désactivé plutôt que simulé.
        </p>

        {/* Feature selection and configurations */}
        <div className="bg-slate-950 p-6 rounded-2xl border border-slate-800/60 mb-8">
          <h4 className="text-xs font-bold uppercase text-slate-500 mb-4 flex items-center gap-2">
            <Sliders size={14} className="text-fuchsia-500" />
            Configuration des Entrées & Vecteurs d'Analyse (Features Selection)
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <label className="flex items-center gap-3 cursor-pointer p-3 rounded-xl bg-slate-900/50 hover:bg-slate-900 border border-slate-800 transition">
              <input 
                type="checkbox" 
                checked={selectedFeatures.winNums} 
                onChange={e => setSelectedFeatures(prev => ({ ...prev, winNums: e.target.checked }))}
                className="w-4 h-4 accent-fuchsia-500 rounded" 
              />
              <div>
                <span className="block text-xs font-bold text-slate-200">Numéros Gagnants (Norm.)</span>
                <span className="text-[10px] text-slate-500">Coordonnées cartésiennes de base [0-1]</span>
              </div>
            </label>
            <label className="flex items-center gap-3 cursor-pointer p-3 rounded-xl bg-slate-900/50 hover:bg-slate-900 border border-slate-800 transition">
              <input 
                type="checkbox" 
                checked={selectedFeatures.gaps} 
                onChange={e => setSelectedFeatures(prev => ({ ...prev, gaps: e.target.checked }))}
                className="w-4 h-4 accent-fuchsia-500 rounded" 
              />
              <div>
                <span className="block text-xs font-bold text-slate-200">Intervalles Dynamiques (Gaps)</span>
                <span className="text-[10px] text-slate-500">Vitesse d'écart et de dispersion des tirages</span>
              </div>
            </label>
            <label className="flex items-center gap-3 cursor-pointer p-3 rounded-xl bg-slate-900/50 hover:bg-slate-900 border border-slate-800 transition">
              <input 
                type="checkbox" 
                checked={selectedFeatures.parity} 
                onChange={e => setSelectedFeatures(prev => ({ ...prev, parity: e.target.checked }))}
                className="w-4 h-4 accent-fuchsia-500 rounded" 
              />
              <div>
                <span className="block text-xs font-bold text-slate-200">Indicateurs de Parité (Parity)</span>
                <span className="text-[10px] text-slate-500">Cartographie binaire Pair/Impair</span>
              </div>
            </label>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-slate-950 p-6 rounded-2xl border border-slate-800/80">
            <h4 className="text-xs font-bold uppercase text-slate-500 mb-4 flex items-center gap-2">
              <Upload size={14} className="text-slate-400" />
              1. Source de Données
            </h4>
            <label className="flex items-center justify-center w-full h-24 border-2 border-dashed border-slate-800 rounded-xl cursor-pointer hover:border-indigo-500 hover:bg-slate-900/50 transition-all">
              <div className="flex flex-col items-center">
                <Upload size={20} className="text-slate-400 mb-2" />
                <span className="text-xs font-bold text-slate-300">Importer CSV / JSON</span>
              </div>
              <input type="file" className="hidden" accept=".csv,.json" onChange={handleFileUpload} />
            </label>
            {fileData ? (
              fileDraws ? (
                <div className="mt-3 text-[10px] text-emerald-400 font-bold bg-emerald-500/10 px-3 py-1.5 rounded-lg text-center">
                  {fileDraws.length} tirage(s) valide(s) extraits de {fileData.length} ligne(s) — prêt pour l'entraînement
                </div>
              ) : (
                <div className="mt-3 text-[10px] text-rose-400 font-bold bg-rose-500/10 px-3 py-1.5 rounded-lg text-center flex items-center justify-center gap-1.5">
                  <AlertTriangle size={12} />
                  {fileParseWarning || "Fichier non exploitable pour l'entraînement."}
                </div>
              )
            ) : history.length >= 20 ? (
              <div className="mt-3 text-[10px] text-indigo-400 font-bold bg-indigo-500/10 px-3 py-1.5 rounded-lg text-center">
                Historique Actif Déterminisé ({history.length} tirages)
              </div>
            ) : (
              <div className="mt-3 text-[10px] text-rose-400 font-bold bg-rose-500/10 px-3 py-1.5 rounded-lg text-center flex items-center justify-center gap-1.5">
                <AlertTriangle size={12} />
                Historique insuffisant ({history.length}/20 tirages minimum) — entraînement désactivé
              </div>
            )}
          </div>

          <div className="bg-slate-950 p-6 rounded-2xl border border-slate-800/80">
            <h4 className="text-xs font-bold uppercase text-slate-500 mb-4 flex items-center gap-2">
              <Sliders size={14} className="text-slate-400" />
              2. Hyperparamètres & Réseau
            </h4>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[9px] uppercase font-bold text-slate-400 mb-1">Époques (Epochs)</label>
                  <input 
                    type="number" 
                    value={epochsCount} 
                    onChange={e => setEpochsCount(Number(e.target.value))}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white" 
                  />
                </div>
                <div>
                  <label className="block text-[9px] uppercase font-bold text-slate-400 mb-1">Learning Rate</label>
                  <input 
                    type="number" 
                    step="0.001"
                    value={learningRate} 
                    onChange={e => setLearningRate(Number(e.target.value))}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white" 
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[9px] uppercase font-bold text-slate-400 mb-1">Architecture</label>
                  <select 
                    value={hiddenLayersConfig} 
                    onChange={e => setHiddenLayersConfig(e.target.value as any)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white"
                  >
                    <option value="32x16">Dense 32x16</option>
                    <option value="64x32">Dense 64x32</option>
                    <option value="16x8">Dense 16x8</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[9px] uppercase font-bold text-slate-400 mb-1">Optimiseur</label>
                  <select 
                    value={optimizerType} 
                    onChange={e => setOptimizerType(e.target.value as any)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white"
                  >
                    <option value="adam">Adam</option>
                    <option value="sgd">SGD</option>
                    <option value="rmsprop">RMSprop</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[9px] uppercase font-bold text-slate-400 mb-1">Activation</label>
                  <select 
                    value={activationFn} 
                    onChange={e => setActivationFn(e.target.value as any)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white"
                  >
                    <option value="relu">ReLU</option>
                    <option value="sigmoid">Sigmoïde</option>
                    <option value="tanh">Tanh</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[9px] uppercase font-bold text-slate-400 mb-1">Dropout</label>
                  <select 
                    value={dropoutRate} 
                    onChange={e => setDropoutRate(Number(e.target.value))}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white"
                  >
                    <option value="0">Aucun (0.0)</option>
                    <option value="0.1">Faible (0.1)</option>
                    <option value="0.2">Modéré (0.2)</option>
                    <option value="0.3">Fort (0.3)</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-slate-950 p-6 rounded-2xl border border-slate-800/80 flex flex-col justify-center">
             <h4 className="text-xs font-bold uppercase text-slate-500 mb-4 flex items-center gap-2">
               <Activity size={14} className="text-slate-400" />
               3. Contrôles Moteur
             </h4>
             {trainingState === 'training' ? (
                <button onClick={stopTraining} className="w-full py-4 bg-rose-500/20 hover:bg-rose-500/30 text-rose-400 border border-rose-500/30 rounded-xl flex items-center justify-center gap-2 font-black text-xs uppercase tracking-widest transition-all">
                  <Square size={16} /> Interrompre
                </button>
             ) : (
                <button
                  onClick={startTraining}
                  disabled={!fileDraws && history.length < 20}
                  className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed disabled:hover:bg-slate-800 text-white rounded-xl flex items-center justify-center gap-2 font-black text-xs uppercase tracking-widest transition-all shadow-lg shadow-indigo-600/30 disabled:shadow-none"
                >
                  <Play size={16} /> Lancer l'entraînement
                </button>
             )}
          </div>
        </div>

        {mlPrediction.length > 0 && trainingState === 'finished' && (
          <div className="bg-slate-950 border border-slate-800 p-6 rounded-2xl mb-6 relative overflow-hidden animate-fade-in">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
              <div className="flex flex-col items-center justify-center gap-4 text-center md:border-r md:border-slate-800/80 md:pr-6">
                <h4 className="text-xs font-black uppercase tracking-widest text-indigo-400 flex items-center gap-1.5">
                  <Sparkles size={14} className="text-indigo-400 animate-spin" />
                  Prédiction du Modèle ML Entraîné (Prochain Tirage)
                </h4>
                <div className="flex gap-2.5">
                  {mlPrediction.map((n, i) => (
                    <div key={i} className="w-11 h-11 rounded-full bg-slate-900 border border-indigo-500 flex items-center justify-center text-indigo-400 font-black text-base shadow-[0_0_12px_rgba(99,102,241,0.25)]">
                      {n}
                    </div>
                  ))}
                </div>
                <p className="text-[10px] text-slate-500 max-w-sm">
                  Ce vecteur de 5 boules a été obtenu par une étape de feedforward sur le dernier état spatial connu du plateau.
                </p>
              </div>

              <div className="flex flex-col items-center justify-center gap-3 text-center">
                <h4 className="text-xs font-black uppercase tracking-widest text-emerald-400 flex items-center gap-1.5">
                  <CheckCircle size={14} className="text-emerald-400" />
                  Mise à Jour de l'Oracle (Closed-Loop feedback)
                </h4>
                <p className="text-[10px] text-slate-400 max-w-xs">
                  Vous pouvez injecter la correction mathématique obtenue durant cet entraînement directement pour modifier la balance du moteur prédictif global.
                </p>
                <button 
                  onClick={injectWeights}
                  className="px-5 py-2.5 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 border border-emerald-500/30 rounded-xl font-bold text-xs uppercase tracking-wider transition"
                >
                  Injecter l'Apprentissage dans l'Oracle
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-slate-950 p-6 rounded-2xl border border-slate-800/80 h-72 relative">
             <h4 className="text-[10px] font-black uppercase text-slate-500 mb-4 flex items-center gap-2"><Activity size={12}/> Evolution de la Perte (Loss / MSE)</h4>
             <ResponsiveContainer width="100%" height="100%">
                <LineChart data={epochLogs}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.05} />
                  <XAxis dataKey="epoch" stroke="#475569" fontSize={9} />
                  <YAxis stroke="#475569" fontSize={9} domain={['auto', 'auto']} />
                  <Tooltip contentStyle={{ backgroundColor: '#020617', border: '1px solid #1e293b', borderRadius: '12px' }} />
                  <Legend wrapperStyle={{ fontSize: '9px' }} />
                  <Line type="monotone" dataKey="loss" stroke="#f43f5e" strokeWidth={2} dot={false} name="Train Loss" />
                  <Line type="monotone" dataKey="val_loss" stroke="#fb923c" strokeWidth={2} dot={false} name="Val Loss" />
                </LineChart>
             </ResponsiveContainer>
          </div>

          <div className="bg-slate-950 p-6 rounded-2xl border border-slate-800/80 h-72 relative">
             <h4 className="text-[10px] font-black uppercase text-slate-500 mb-4 flex items-center gap-2"><Activity size={12}/> Précision d'Apprentissage (Simulated Accuracy)</h4>
             <ResponsiveContainer width="100%" height="100%">
                <LineChart data={epochLogs}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.05} />
                  <XAxis dataKey="epoch" stroke="#475569" fontSize={9} />
                  <YAxis stroke="#475569" fontSize={9} domain={[0, 1]} />
                  <Tooltip contentStyle={{ backgroundColor: '#020617', border: '1px solid #1e293b', borderRadius: '12px' }} />
                  <Legend wrapperStyle={{ fontSize: '9px' }} />
                  <Line type="monotone" dataKey="acc" stroke="#10b981" strokeWidth={2} dot={false} name="Train Acc" />
                  <Line type="monotone" dataKey="val_acc" stroke="#34d399" strokeWidth={2} dot={false} name="Val Acc" />
                </LineChart>
             </ResponsiveContainer>
          </div>
        </div>

      </div>
    </div>
  );
};
