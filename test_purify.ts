import { purifyHistoryForDraw } from './utils/arrayUtils';

const raw = [
  { id: 1, drawName: 'National', gagnants: [1,2,3,4,5] }
];

console.log(purifyHistoryForDraw('National', raw));
console.log(purifyHistoryForDraw('Etoile', raw));
