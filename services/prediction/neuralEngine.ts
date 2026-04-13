import * as tf from '@tensorflow/tfjs';
import { DrawResult } from '../../types';

// Cache for models to avoid retraining from scratch every time
const modelCache: Record<string, tf.Sequential> = {};
const historyLengthCache: Record<string, number> = {};

/**
 * Prepares the history data for LSTM training.
 * We convert each draw into a binary vector of size 90.
 */
const prepareData = (history: DrawResult[], sequenceLength: number = 15) => {
    const N = 90;
    const sequences: number[][][] = [];
    const labels: number[][] = [];

    // Sort history chronologically (oldest first)
    const sortedHistory = [...history].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    // Convert to binary vectors
    const binaryVectors = sortedHistory.map(draw => {
        const vec = new Array(N).fill(0);
        draw.gagnants.forEach(num => {
            if (num >= 1 && num <= N) vec[num - 1] = 1;
        });
        return vec;
    });

    for (let i = 0; i < binaryVectors.length - sequenceLength; i++) {
        sequences.push(binaryVectors.slice(i, i + sequenceLength));
        labels.push(binaryVectors[i + sequenceLength]);
    }

    return {
        xs: tf.tensor3d(sequences),
        ys: tf.tensor2d(labels)
    };
};

/**
 * Builds and trains an LSTM model on the draw history.
 * Returns a probability vector for the next draw (1 to 90).
 */
export const predictWithLSTM = async (drawName: string, history: DrawResult[]): Promise<Record<number, number>> => {
    const N = 90;
    const sequenceLength = 15; // Increased sequence length to capture longer dependencies

    if (history.length < sequenceLength + 5) {
        console.warn("Not enough history for LSTM. Returning empty predictions.");
        return {};
    }

    try {
        const { xs, ys } = prepareData(history, sequenceLength);

        let model = modelCache[drawName];
        const isNewModel = !model;
        const historyChanged = historyLengthCache[drawName] !== history.length;

        if (isNewModel) {
            model = tf.sequential();
            model.add(tf.layers.lstm({
                units: 128, // Increased capacity
                inputShape: [sequenceLength, N],
                returnSequences: false
            }));
            model.add(tf.layers.dropout({ rate: 0.3 })); // Increased dropout to prevent overfitting
            model.add(tf.layers.dense({ units: N, activation: 'sigmoid' }));

            model.compile({
                optimizer: tf.train.adam(0.005), // Slightly lower learning rate for stability
                loss: 'binaryCrossentropy',
                metrics: ['accuracy']
            });
            
            modelCache[drawName] = model;
        }

        // Train the model only if it's new or history has changed
        if (isNewModel || historyChanged) {
            await model.fit(xs, ys, {
                epochs: isNewModel ? 30 : 5, // Train less if just updating
                batchSize: 32,
                validationSplit: 0.15, // Use 15% of data for validation
                shuffle: true,
                verbose: 0,
                callbacks: tf.callbacks.earlyStopping({
                    monitor: 'val_loss',
                    patience: 5, // Stop if validation loss doesn't improve for 5 epochs
                    minDelta: 0.001
                })
            });
            historyLengthCache[drawName] = history.length;
        }

        // Predict the next sequence
        // Get the last `sequenceLength` draws
        const sortedHistory = [...history].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        const lastDraws = sortedHistory.slice(-sequenceLength);
        
        const lastSequence = lastDraws.map(draw => {
            const vec = new Array(N).fill(0);
            draw.gagnants.forEach(num => {
                if (num >= 1 && num <= N) vec[num - 1] = 1;
            });
            return vec;
        });

        const inputTensor = tf.tensor3d([lastSequence]);
        const predictionTensor = model.predict(inputTensor) as tf.Tensor;
        const predictionArray = await predictionTensor.data();

        // Cleanup tensors to avoid memory leaks
        xs.dispose();
        ys.dispose();
        inputTensor.dispose();
        predictionTensor.dispose();

        // Map to 1-90 and normalize to 0-100 score
        const results: Record<number, number> = {};
        let maxProb = 0;
        for (let i = 0; i < N; i++) {
            if (predictionArray[i] > maxProb) maxProb = predictionArray[i];
        }

        for (let i = 0; i < N; i++) {
            // Scale relative to the max probability found
            results[i + 1] = maxProb > 0 ? (predictionArray[i] / maxProb) * 100 : 0;
        }

        return results;

    } catch (error) {
        console.error("LSTM Prediction Error:", error);
        return {};
    }
};
