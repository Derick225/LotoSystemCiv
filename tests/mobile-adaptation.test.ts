import { describe, it, expect } from 'vitest';
import { useNexusStore } from '../src/store/useNexusStore';
import { ALL_DRAWS, getNumberColor } from '../src/constants';
import { getNextScheduledDraw } from '../src/services/lotteryService';

describe('CONTRAT NAVIGATION & ADAPTATION MOBILE ANDROID', () => {
  it('garantit la disponibilite des tirages du programme pour le tiroir mobile', () => {
    expect(ALL_DRAWS.length).toBeGreaterThanOrEqual(4);
    ALL_DRAWS.forEach((draw) => {
      expect(draw.name).toBeDefined();
      expect(draw.name.length).toBeGreaterThan(0);
      expect(draw.time).toBeDefined();
    });

    const next = getNextScheduledDraw();
    if (next) {
      expect(next.name).toBeDefined();
      expect(next.time).toBeDefined();
    }
  });

  it('verifie le bon routage vers les hubs majeurs via navigateToModule (Oracle, Foret, Forensic)', () => {
    const store = useNexusStore.getState();

    // 1. Navigation vers Oracle
    store.navigateToModule('Oracle', 'stacking');
    expect(useNexusStore.getState().activeMainTab).toBe('Oracle');
    expect(useNexusStore.getState().activeSubTab).toBe('stacking');

    // 2. Navigation vers Foret de Decision
    store.navigateToModule('Topologie', 'decision_forest');
    expect(useNexusStore.getState().activeMainTab).toBe('Topologie');
    expect(useNexusStore.getState().activeSubTab).toBe('decision_forest');

    // 3. Navigation vers Forensic Autopsie
    store.navigateToModule('Forensic', 'autopsy');
    expect(useNexusStore.getState().activeMainTab).toBe('Forensic');
    expect(useNexusStore.getState().activeSubTab).toBe('autopsy');

    // 4. Navigation vers Flux / Station
    store.navigateToModule('Flux');
    expect(useNexusStore.getState().activeMainTab).toBe('Flux');
  });

  it('valide la colorisation continue et deterministe des 90 boules pour les ecrans tactiles', () => {
    for (let num = 1; num <= 90; num++) {
      const colorClass = getNumberColor(num);
      expect(colorClass).toBeDefined();
      expect(colorClass.length).toBeGreaterThan(0);
    }
  });

  it('preserve l integrite du mode Focus lors du masquage de la barre de navigation', () => {
    const store = useNexusStore.getState();

    store.setFocusMode(true);
    expect(useNexusStore.getState().isFocusMode).toBe(true);

    store.setFocusMode(false);
    expect(useNexusStore.getState().isFocusMode).toBe(false);
  });
});
