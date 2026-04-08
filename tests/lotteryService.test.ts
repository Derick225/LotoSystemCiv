import { describe, it, expect, vi, beforeEach } from 'vitest';
import { lotteryService, bulkAddResults, parseAndNormalizeDate } from '../services/lotteryService';
import { supabase, isSupabaseConfigured } from '../services/supabaseClient';

vi.mock('../services/supabaseClient', () => ({
    supabase: {
        from: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        upsert: vi.fn().mockReturnThis()
    },
    isSupabaseConfigured: vi.fn()
}));

const localStorageMock = (() => {
    let store: Record<string, string> = {};
    return {
        getItem: vi.fn((key: string) => store[key] || null),
        setItem: vi.fn((key: string, value: string) => {
            store[key] = value.toString();
        }),
        removeItem: vi.fn((key: string) => {
            delete store[key];
        }),
        clear: vi.fn(() => {
            store = {};
        })
    };
})();

Object.defineProperty(global, 'localStorage', {
    value: localStorageMock
});

Object.defineProperty(global.navigator, 'onLine', {
    value: true,
    writable: true
});

describe('lotteryService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        localStorage.clear();
    });

    describe('parseAndNormalizeDate', () => {
        it('should parse FR date correctly', () => {
            expect(parseAndNormalizeDate('31/12/2023', true)).toBe('2023-12-31');
            expect(parseAndNormalizeDate('31/12/2023', false)).toBe('31/12/2023');
        });

        it('should parse ISO date correctly', () => {
            expect(parseAndNormalizeDate('2023-12-31', true)).toBe('2023-12-31');
            expect(parseAndNormalizeDate('2023-12-31', false)).toBe('31/12/2023');
        });

        it('should throw on invalid date', () => {
            expect(() => parseAndNormalizeDate('invalid')).toThrow();
        });
    });

    describe('fetchHistory', () => {
        it('should fetch from cache if offline', async () => {
            (isSupabaseConfigured as any).mockReturnValue(false);
            const mockData = [{ id: '1', drawName: 'Test', date: '01/01/2023', gagnants: [1,2,3,4,5] }];
            localStorage.setItem('nexus_cache_history_Test', JSON.stringify({ data: mockData, expiry: Date.now() + 10000 }));
            
            const result = await lotteryService.fetchHistory('Test');
            expect(result).toEqual(mockData);
        });

        it('should deduplicate concurrent requests', async () => {
            (isSupabaseConfigured as any).mockReturnValue(true);
            (supabase.limit as any).mockResolvedValue({ data: [], error: null });

            const p1 = lotteryService.fetchHistory('Test');
            const p2 = lotteryService.fetchHistory('Test');

            await Promise.all([p1, p2]);

            // Supabase should only be called once
            expect(supabase.from).toHaveBeenCalledTimes(1);
        });
    });

    describe('bulkAddResults', () => {
        it('should throw if offline', async () => {
            (isSupabaseConfigured as any).mockReturnValue(false);
            await expect(bulkAddResults('Test', [])).rejects.toThrow("Mode hors-ligne : Écriture impossible.");
        });

        it('should validate input array', async () => {
            (isSupabaseConfigured as any).mockReturnValue(true);
            await expect(bulkAddResults('Test', {} as any)).rejects.toThrow("Results must be an array");
        });
    });
});
