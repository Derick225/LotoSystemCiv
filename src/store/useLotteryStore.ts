import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface DrawResult {
  id: string; // unique id for the result
  drawId: string; // reference to the draw (e.g., 'reveil')
  date: string; // ISO string
  numbers: [number, number, number, number, number];
}

interface LotteryState {
  results: DrawResult[];
  addResult: (result: Omit<DrawResult, 'id'>) => void;
  removeResult: (id: string) => void;
  updateResult: (id: string, result: Partial<DrawResult>) => void;
  getResultsByDraw: (drawId: string) => DrawResult[];
}

export const useLotteryStore = create<LotteryState>()(
  persist(
    (set, get) => ({
      results: [],
      addResult: (result) => set((state) => ({
        results: [...state.results, { ...result, id: crypto.randomUUID() }]
      })),
      removeResult: (id) => set((state) => ({
        results: state.results.filter((r) => r.id !== id)
      })),
      updateResult: (id, updatedResult) => set((state) => ({
        results: state.results.map((r) => r.id === id ? { ...r, ...updatedResult } : r)
      })),
      getResultsByDraw: (drawId) => get().results.filter((r) => r.drawId === drawId).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
    }),
    {
      name: 'lottery-storage',
    }
  )
);
