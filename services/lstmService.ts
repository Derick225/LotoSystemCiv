
import * as tf from '@tensorflow/tfjs';
import { DrawResult } from '../types';

// Configuration du modèle
const SEQUENCE_LENGTH = 5; // Nombre de tirages passés pour prédire le suivant
const NUM_FEATURES = 90;   // Numéros de 1 à 90
const EPOCHS = 20;         // Entraînement léger pour la réactivité
const BATCH_SIZE = 4;

export const LSTMService = {
    
    /**
     * Prépare les données pour le modèle LSTM (One-Hot Encoding)
     */
    prepareData: (history: DrawResult[]) => {
        const data: number[][] = [];
        
        // On ne garde que les 50 derniers tirages pour l'entraînement rapide
        const recentHistory = history.slice(0, 50).reverse(); 
        
        recentHistory.forEach(draw => {
            const vector = new Array(NUM_FEATURES).fill(0);
            draw.gagnants.forEach(n => {
                if (n >= 1 && n <= 90) vector[n - 1] = 1;
            });
            data.push(vector);
        });

        const X: number[][][] = [];
        const y: number[][] = [];

        for (let i = 0; i < data.length - SEQUENCE_LENGTH; i++) {
            X.push(data.slice(i, i + SEQUENCE_LENGTH));
            y.push(data[i + SEQUENCE_LENGTH]);
        }

        return {
            xs: tf.tensor3d(X),
            ys: tf.tensor2d(y)
        };
    },

    /**
     * Crée et compile le modèle LSTM
     */
    createModel: () => {
        const model = tf.sequential();
        
        model.add(tf.layers.lstm({
            units: 64,
            inputShape: [SEQUENCE_LENGTH, NUM_FEATURES],
            returnSequences: false
        }));
        
        model.add(tf.layers.dropout({ rate: 0.2 }));
        
        model.add(tf.layers.dense({
            units: NUM_FEATURES,
            activation: 'sigmoid' // Multi-label classification (probabilité indépendante par numéro)
        }));

        model.compile({
            optimizer: tf.train.adam(0.01),
            loss: 'binaryCrossentropy',
            metrics: ['accuracy']
        });

        return model;
    },

    /**
     * Entraîne le modèle et prédit le prochain tirage
     */
    runPrediction: async (history: DrawResult[]): Promise<{ probabilities: number[], accuracy: number }> => {
        if (history.length < SEQUENCE_LENGTH + 10) {
            console.warn("Pas assez d'historique pour LSTM");
            return { probabilities: new Array(90).fill(0), accuracy: 0 };
        }

        const { xs, ys } = LSTMService.prepareData(history);
        const model = LSTMService.createModel();

        let accuracy = 0;

        await model.fit(xs, ys, {
            epochs: EPOCHS,
            batchSize: BATCH_SIZE,
            shuffle: true,
            callbacks: {
                onEpochEnd: (_epoch, logs) => {
                    accuracy = logs?.acc || 0;
                }
            }
        });

        // Prédiction sur la dernière séquence connue
        const lastSequence: number[][] = [];
        const recentDraws = history.slice(0, SEQUENCE_LENGTH).reverse();
        
        recentDraws.forEach(draw => {
            const vector = new Array(NUM_FEATURES).fill(0);
            draw.gagnants.forEach(n => {
                if (n >= 1 && n <= 90) vector[n - 1] = 1;
            });
            lastSequence.push(vector);
        });

        const input = tf.tensor3d([lastSequence]);
        const prediction = model.predict(input) as tf.Tensor;
        const probabilities = Array.from(prediction.dataSync());

        // Nettoyage mémoire
        xs.dispose();
        ys.dispose();
        model.dispose();
        input.dispose();
        prediction.dispose();

        return { probabilities, accuracy };
    }
};
