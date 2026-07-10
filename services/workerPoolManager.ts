type WorkerType = 'metaLearning' | 'prediction' | 'nexus' | 'forest' | 'aco' | 'pso' | 'bayesian' | 'tensor' | 'forensic' | 'backtest' | 'simulation' | 'genetic';

class WorkerPoolManager {
    private pools: Map<string, Worker[]> = new Map();
    private activeWorkers: Map<Worker, boolean> = new Map();

    private createWorker(type: WorkerType): Worker {
        switch (type) {
            case 'metaLearning': return new Worker(new URL('../workers/metaLearning.worker.ts?worker', import.meta.url), { type: 'module' });
            case 'prediction': return new Worker(new URL('./workers/prediction.worker.ts?worker', import.meta.url), { type: 'module' });
            case 'nexus': return new Worker(new URL('./nexus.worker.ts?worker', import.meta.url), { type: 'module' });
            case 'forest': return new Worker(new URL('./workers/forest.worker.ts?worker', import.meta.url), { type: 'module' });
            case 'aco': return new Worker(new URL('./workers/aco.worker.ts?worker', import.meta.url), { type: 'module' });
            case 'pso': return new Worker(new URL('./workers/pso.worker.ts?worker', import.meta.url), { type: 'module' });
            case 'bayesian': return new Worker(new URL('./workers/bayesian.worker.ts?worker', import.meta.url), { type: 'module' });
            case 'tensor': return new Worker(new URL('./workers/tensor.worker.ts?worker', import.meta.url), { type: 'module' });
            case 'forensic': return new Worker(new URL('./workers/forensic.worker.ts?worker', import.meta.url), { type: 'module' });
            case 'backtest': return new Worker(new URL('./workers/backtest.worker.ts?worker', import.meta.url), { type: 'module' });
            case 'simulation': return new Worker(new URL('./workers/simulation.worker.ts?worker', import.meta.url), { type: 'module' });
            case 'genetic': return new Worker(new URL('./workers/genetic.worker.ts?worker', import.meta.url), { type: 'module' });
            default: throw new Error(`Unknown worker type: ${type}`);
        }
    }

    public getWorker(type: WorkerType): Worker {
        let pool = this.pools.get(type);
        if (!pool) {
            pool = [];
            this.pools.set(type, pool);
        }

        // Try to find an inactive worker
        for (const worker of pool) {
            if (!this.activeWorkers.get(worker)) {
                this.activeWorkers.set(worker, true);
                return worker;
            }
        }

        // Create new worker if none available or max pool size not reached (allowing growth for now)
        const worker = this.createWorker(type);
        pool.push(worker);
        this.activeWorkers.set(worker, true);
        return worker;
    }

    public releaseWorker(worker: Worker) {
        worker.onmessage = null;
        worker.onerror = null;
        this.activeWorkers.set(worker, false);
    }

    public terminateWorker(worker: Worker) {
        try {
            worker.terminate();
        } catch (err) {
            console.error("Failed to terminate worker:", err);
        }
        this.activeWorkers.delete(worker);
        
        for (const [type, pool] of Array.from(this.pools.entries())) {
            const index = pool.indexOf(worker);
            if (index !== -1) {
                pool.splice(index, 1);
                if (pool.length === 0) {
                    this.pools.delete(type);
                }
                break;
            }
        }
    }

    public terminatePool(type: WorkerType) {
        const pool = this.pools.get(type);
        if (pool) {
            for (const worker of pool) {
                try {
                    worker.terminate();
                } catch (err) {
                    console.error(`Failed to terminate worker of type ${type}:`, err);
                }
                this.activeWorkers.delete(worker);
            }
            this.pools.delete(type);
        }
    }
    
    public terminateAll() {
        for (const pool of Array.from(this.pools.values())) {
            for (const worker of pool) {
                worker.terminate();
            }
        }
        this.pools.clear();
        this.activeWorkers.clear();
    }
}

export const workerPool = new WorkerPoolManager();
if (typeof globalThis !== 'undefined') {
    (globalThis as any).workerPool = workerPool;
}
