import { runMarkovPrediction } from '../services/lstmCore';
import { DrawResult } from '../types';

function generateHistory(size: number): DrawResult[] {
    const history: DrawResult[] = [];
    for (let i = 0; i < size; i++) {
        history.push({
            id: String(i),
            drawName: 'Benchmark',
            date: '2023-01-01',
            gagnants: [
                Math.floor(Math.random() * 90) + 1,
                Math.floor(Math.random() * 90) + 1,
                Math.floor(Math.random() * 90) + 1,
                Math.floor(Math.random() * 90) + 1,
                Math.floor(Math.random() * 90) + 1
            ],
            machine: [],
            version: 1
        });
    }
    return history;
}

async function runBenchmark() {
    const sizes = [1000, 5000, 10000];
    
    console.log("Starting Markov Engine Benchmark...");
    console.log("-----------------------------------");
    
    for (const size of sizes) {
        const history = generateHistory(size);
        
        // Warmup
        runMarkovPrediction(history.slice(0, 100));
        
        const start = performance.now();
        runMarkovPrediction(history);
        const end = performance.now();
        
        const duration = end - start;
        console.log(`Size: ${size} draws | Time: ${duration.toFixed(2)}ms`);
        
        if (size === 10000 && duration > 50) {
            console.warn(`⚠️ Warning: 10k draws took longer than 50ms (${duration.toFixed(2)}ms)`);
        } else if (size === 10000) {
            console.log("✅ 10k draws performance target met (< 50ms)");
        }
    }
    console.log("-----------------------------------");
}

runBenchmark();
