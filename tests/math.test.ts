
import { calculateACValue, calculateMean, calculateStandardDeviation } from '../services/mathService';
import { calculateSpatialHotSpots } from '../services/advancedMathService';

const runTest = (name: string, fn: () => boolean) => {
    try {
        if (fn()) {
            console.log(`✅ PASS: ${name}`);
        } else {
            console.error(`❌ FAIL: ${name}`);
        }
    } catch (e) {
        console.error(`❌ ERROR: ${name}`, e);
    }
};

const testMathService = () => {
    console.log("--- MATH SERVICE TESTS ---");

    runTest("AC Value - Simple Sequence", () => {
        // 1, 2, 3, 4, 5 -> Diffs: 1, 2, 3, 4. Unique: 4. N=5. AC = 4 - (5-1) = 0.
        const ac = calculateACValue([1, 2, 3, 4, 5]);
        return ac === 0; 
    });

    runTest("AC Value - Spread Sequence", () => {
        // 1, 3, 5, 7, 9 -> Diffs: 2, 4, 6, 8. Unique: 4. N=5. AC = 4 - 4 = 0.
        const ac = calculateACValue([1, 3, 5, 7, 9]);
        return ac === 0;
    });

    runTest("Mean Calculation", () => {
        const mean = calculateMean([1, 2, 3, 4, 5]);
        return mean === 3;
    });

    runTest("Standard Deviation", () => {
        // [2, 4, 4, 4, 5, 5, 7, 9] -> Mean=5, StdDev=2
        const std = calculateStandardDeviation([2, 4, 4, 4, 5, 5, 7, 9]);
        return Math.abs(std - 2) < 0.01;
    });
};

const testAdvancedMath = () => {
    console.log("\n--- ADVANCED MATH TESTS ---");
    
    runTest("Spatial HotSpots - Basic Grid", () => {
        // Mock history where number 1 appears often
        // DrawResult needs: id, date, gagnants, machine, drawName
        const mockDraw = { id: '1', date: '2023-01-01', gagnants: [1, 2, 3, 4, 5], machine: [], drawName: 'TEST' };
        const history: any[] = Array(20).fill(mockDraw);
        
        const hotSpots = calculateSpatialHotSpots(history);
        // 1 should be in hot spots as it appears every time
        return hotSpots.includes(1);
    });
};

// Run All
testMathService();
testAdvancedMath();
