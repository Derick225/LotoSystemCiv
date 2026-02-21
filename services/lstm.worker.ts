
import * as tf from '@tensorflow/tfjs';
import type { DrawResult } from '../types';

const SEQUENCE_LENGTH = 5;
const NUM_FEATURES = 90;
const EPOCHS = 20;
const BATCH_SIZE = 4;

// Force CPU backend for stability in Web Worker context
tf.setBackend('cpu');

self.onmessage = async (e: MessageEvent) => {
    const { history, id } = e.data;
    
    try {
        if (!history || history.length < SEQUENCE_LENGTH + 10) {
            self.postMessage({ id, probabilities: new Array(90).fill(0), accuracy: 0 });
            return;
        }

        // Préparation des données
        const data: number[][] = [];
        const recentHistory = history.slice(0, 50).reverse(); 
        
        recentHistory.forEach((draw: any) => {
            const vector = new Array(NUM_FEATURES).fill(0);
            draw.gagnants.forEach((n: number) => {
                if (n >= 1 && n <= 90) vector[n - 1] = 1;
            });
            data.push(vector);
        });

        const X_data: number[][][] = [];
        const y_data: number[][] = [];

        for (let i = 0; i < data.length - SEQUENCE_LENGTH; i++) {
            X_data.push(data.slice(i, i + SEQUENCE_LENGTH));
            y_data.push(data[i + SEQUENCE_LENGTH]);
        }

        const xs = tf.tensor3d(X_data);
        const ys = tf.tensor2d(y_data);

        // Création du modèle
        const model = tf.sequential();
        model.add(tf.layers.lstm({
            units: 64,
            inputShape: [SEQUENCE_LENGTH, NUM_FEATURES],
            returnSequences: false
        }));
        model.add(tf.layers.dropout({ rate: 0.2 }));
        model.add(tf.layers.dense({
            units: NUM_FEATURES,
            activation: 'sigmoid'
        }));

        model.compile({
            optimizer: tf.train.adam(0.01),
            loss: 'binaryCrossentropy',
            metrics: ['accuracy']
        });

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

        // Prédiction
        const lastSequence: number[][] = [];
        const predictDraws = history.slice(0, SEQUENCE_LENGTH).reverse();
        
        predictDraws.forEach((draw: any) => {
            const vector = new Array(NUM_FEATURES).fill(0);
            draw.gagnants.forEach((n: number) => {
                if (n >= 1 && n <= 90) vector[n - 1] = 1;
            });
            lastSequence.push(vector);
        });

        const input = tf.tensor3d([lastSequence]);
        const prediction = model.predict(input) as tf.Tensor;
        const probabilities = Array.from(prediction.dataSync());

        // Nettoyage
        xs.dispose();
        ys.dispose();
        model.dispose();
        input.dispose();
        prediction.dispose();

        self.postMessage({ id, probabilities, accuracy });

    } catch (error) {
        console.error("LSTM Worker Error:", error);
        self.postMessage({ id, error: String(error) });
    }
};
