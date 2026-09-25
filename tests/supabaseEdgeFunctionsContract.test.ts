import { describe, it, expect, vi, beforeEach } from 'vitest';
import { apiClient } from '../core/api/apiClient';
import { supabase } from '../services/supabaseClient';
import { AppError } from '../utils/AppError';
import type { Prediction } from '../types';

// Mock supabase client
vi.mock('../services/supabaseClient', () => ({
  supabase: {
    functions: {
      invoke: vi.fn(),
    },
  },
  isSupabaseConfigured: vi.fn(() => true),
}));

describe('Supabase Edge Functions Gateway & Contracts (nexus-api)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('apiClient.post Gateway Routing', () => {
    it('should route request through nexus-api with endpoint set as action parameter', async () => {
      const mockInvoke = vi.mocked(supabase.functions.invoke);
      mockInvoke.mockResolvedValueOnce({
        data: { success: true, count: 5 },
        error: null,
      });

      const response = await apiClient.post<{ success: boolean; count: number }>('cron-sync', {
        drawName: 'Reveil',
        manualTrigger: true,
      });

      expect(mockInvoke).toHaveBeenCalledTimes(1);
      expect(mockInvoke).toHaveBeenCalledWith('nexus-api', {
        body: {
          action: 'cron-sync',
          drawName: 'Reveil',
          manualTrigger: true,
        },
        headers: undefined,
      });
      expect(response).toEqual({ success: true, count: 5 });
    });

    it('should properly handle non-object payloads by wrapping into payload key', async () => {
      const mockInvoke = vi.mocked(supabase.functions.invoke);
      mockInvoke.mockResolvedValueOnce({
        data: { ok: true },
        error: null,
      });

      await apiClient.post('sample-action', 'raw-string-payload');

      expect(mockInvoke).toHaveBeenCalledWith('nexus-api', {
        body: {
          action: 'sample-action',
          payload: 'raw-string-payload',
        },
        headers: undefined,
      });
    });
  });

  describe('Error Classification & AppError Contract', () => {
    it('should classify unauthorized / auth errors as AUTH_ERR', async () => {
      const mockInvoke = vi.mocked(supabase.functions.invoke);
      mockInvoke.mockResolvedValue({
        data: null,
        error: {
          message: 'Non autorisé: Token JWT manquant ou invalide',
          context: {} as any,
          name: 'FunctionsHttpError',
        },
      });

      try {
        await apiClient.post('admin-users', { action: 'list' }, { suppressErrorLogging: true });
      } catch (err: any) {
        expect(err).toBeInstanceOf(AppError);
        expect(err.code).toBe('AUTH_ERR');
        expect(err.severity).toBe('low');
      }
    });

    it('should classify network / fetch failures as NETWORK_ERR', async () => {
      const mockInvoke = vi.mocked(supabase.functions.invoke);
      mockInvoke.mockResolvedValueOnce({
        data: null,
        error: {
          message: 'Failed to fetch Edge Function',
          context: {} as any,
          name: 'FunctionsFetchError',
        },
      });

      try {
        await apiClient.post('predict-elite', {}, { suppressErrorLogging: true });
      } catch (err: any) {
        expect(err).toBeInstanceOf(AppError);
        expect(err.code).toBe('NETWORK_ERR');
      }
    });

    it('should classify business errors in data as API_ERR', async () => {
      const mockInvoke = vi.mocked(supabase.functions.invoke);
      mockInvoke.mockResolvedValueOnce({
        data: { error: 'Dataset de moins de 12 tirages insuffisant' },
        error: null,
      });

      try {
        await apiClient.post('predict-elite', { drawName: 'National', history: [] }, { suppressErrorLogging: true });
      } catch (err: any) {
        expect(err).toBeInstanceOf(AppError);
        expect(err.code).toBe('API_ERR');
        expect(err.severity).toBe('high');
        expect(err.message).toContain('Dataset de moins de 12 tirages insuffisant');
      }
    });
  });

  describe('Predict-Elite Payload & Schema Compliance', () => {
    it('should validate edge predict-elite response against Prediction schema', async () => {
      const mockPredictionResponse = {
        drawName: 'Reveil',
        suggestedNumbers: [7, 24, 38, 59, 82],
        candidates: [1, 14, 25, 33, 44, 55, 67, 78, 88, 90],
        confidence: 78,
        confidenceBand: 'structuree',
        stabilityScore: 0.782,
        regime: 'stationnaire',
        dominantFamilies: ['inertia', 'structure'],
        warnings: [],
        breakdown: {
          7: {
            repeatShort: 42,
            machineTransfer: 15,
            neighbor: 68,
            mirror: 10,
            markov: 80,
            trend: 55,
            seasonal: 30,
            structuralCoherence: 74,
            score: 85,
          },
        },
        engineVersion: 'predict-elite-v2',
        analysis: 'Analyse Deno Edge predict-elite-v2 validée',
        timestamp: Date.now(),
        realityAlignment: 81,
        realityAlignmentNote: 'Indicateur interne de cohérence du moteur — ne reflète PAS une probabilité de gain.',
      };

      const mockInvoke = vi.mocked(supabase.functions.invoke);
      mockInvoke.mockResolvedValueOnce({
        data: mockPredictionResponse,
        error: null,
      });

      const prediction = await apiClient.post<Prediction>('predict-elite', {
        drawName: 'Reveil',
        history: Array(15).fill({
          gagnants: [1, 2, 3, 4, 5],
          date: '2026-09-24',
        }),
      });

      // Vérification du contrat Prediction
      expect(prediction).toBeDefined();
      expect(prediction.drawName).toBe('Reveil');
      expect(prediction.suggestedNumbers).toHaveLength(5);
      expect(new Set(prediction.suggestedNumbers).size).toBe(5);
      expect(prediction.candidates).toHaveLength(10);
      expect(typeof prediction.confidence).toBe('number');
      expect(typeof prediction.realityAlignment).toBe('number');
      expect(prediction.realityAlignment).toBeGreaterThanOrEqual(10);
      expect(prediction.realityAlignment).toBeLessThanOrEqual(99);
      expect(prediction.suggestedNumbers.every((n) => n >= 1 && n <= 90)).toBe(true);
    });
  });

  describe('Compute-Nexus-Analytics Schema Compliance', () => {
    it('should validate compute-nexus-analytics cache and result format', async () => {
      const mockAnalytics = {
        success: true,
        analytics: {
          drawName: 'Akwaba',
          analyzedDraws: 50,
          hotNumbers: [12, 45, 67, 89, 3],
          coldNumbers: [90, 88, 76, 54, 21],
          lastUpdate: new Date().toISOString(),
        },
      };

      const mockInvoke = vi.mocked(supabase.functions.invoke);
      mockInvoke.mockResolvedValueOnce({
        data: mockAnalytics,
        error: null,
      });

      const result = await apiClient.post<typeof mockAnalytics>('compute-nexus-analytics', {
        drawName: 'Akwaba',
      });

      expect(result.success).toBe(true);
      expect(result.analytics.drawName).toBe('Akwaba');
      expect(result.analytics.hotNumbers).toHaveLength(5);
      expect(result.analytics.coldNumbers).toHaveLength(5);
    });
  });
});
