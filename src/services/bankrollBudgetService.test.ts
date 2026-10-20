import { describe, it, expect, beforeEach } from 'vitest';
import {
  computeDailySpendingMetrics,
  recordBetExpense,
  clearBetExpenses,
  loadAllBetExpenses,
  getDateKey,
} from './bankrollBudgetService';

describe('bankrollBudgetService - Protection de Budget & Risque Continu (AGENTS.md)', () => {
  beforeEach(() => {
    clearBetExpenses();
  });

  it('gère le Cold Start sans seuil binaire et avec un a priori bayésien dérivé du capital', () => {
    const metrics = computeDailySpendingMetrics();
    expect(metrics).toBeDefined();
    expect(metrics.todaySpending).toBe(0);
    expect(metrics.continuousRiskActivation).toBeGreaterThanOrEqual(0);
    expect(metrics.continuousRiskActivation).toBeLessThanOrEqual(1);
    expect(metrics.kellyFractionDamping).toBeGreaterThan(0);
  });

  it('enregistre une dépense de ticket de façon déterministe', () => {
    const expense = recordBetExpense({
      amount: 500,
      drawName: 'NATIONAL',
      betType: '2N',
      numbers: [12, 45],
    });

    expect(expense.id).toContain('exp_');
    expect(expense.amount).toBe(500);
    expect(expense.drawName).toBe('NATIONAL');

    const all = loadAllBetExpenses();
    expect(all.length).toBe(1);
    expect(all[0].amount).toBe(500);
  });

  it('calcule la dérive continue Z-Score et amortit Kelly de façon différentiable sans seuil brutal', () => {
    // Enregistrement d'une dépense
    recordBetExpense({
      amount: 1000,
      drawName: 'NATIONAL',
      betType: '2N',
      numbers: [10, 20],
    });

    const metrics1 = computeDailySpendingMetrics();
    expect(metrics1.todaySpending).toBe(1000);

    // Enregistrement d'une surdépense massive
    recordBetExpense({
      amount: 15000,
      drawName: 'NATIONAL',
      betType: '3N',
      numbers: [10, 20, 30],
    });

    const metrics2 = computeDailySpendingMetrics();
    expect(metrics2.todaySpending).toBe(16000);
    expect(metrics2.driftZScore).toBeGreaterThan(0);
    // Le risque augmente continûment
    expect(metrics2.continuousRiskActivation).toBeGreaterThan(metrics1.continuousRiskActivation);
    // Le facteur d'amortissement de Kelly diminue continûment pour protéger le capital
    expect(metrics2.kellyFractionDamping).toBeLessThan(metrics1.kellyFractionDamping);
    expect(metrics2.capitalSurvivalHorizon).toBeGreaterThan(0);
  });
});
