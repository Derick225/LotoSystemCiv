import { readFileSync, writeFileSync } from 'fs';

const file = 'services/prediction/predictionFacade.ts';
let content = readFileSync(file, 'utf8');

// replace forensicAdjustments: any
content = content.replace(
  /forensicAdjustments: any/g,
  `forensicAdjustments: {
  recentReports: ForensicReport[];
  proximityScores: Record<number, number>;
  missedScores: Record<number, number>;
  driftScores: Record<number, number>;
  dynamicWeightModifiers: Record<number, Partial<Record<string, number>>>;
  oracleDriftMap: Record<string, number>;
}`
);

// replace gameRegimeInfo: any
content = content.replace(
  /gameRegimeInfo: any/g,
  `gameRegimeInfo: { regime: string; hurst: number; entropy: number; volatility: number; weylDiscrepancy: number; chaosDimension: number; }`
);

writeFileSync(file, content);
