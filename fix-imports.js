const fs = require('fs');
const glob = require('glob');

function addImports(file, imports) {
    let content = fs.readFileSync(file, 'utf-8');
    content = imports + '\n' + content;
    fs.writeFileSync(file, content);
}

// 1. OracleLiveAssistant.tsx
addImports('components/OracleLiveAssistant.tsx', `import { apiClient } from "../core/api/apiClient";`);

// 2. TrainingEvolutionDrawer.tsx
addImports('components/TrainingEvolutionDrawer.tsx', `import { db } from "../services/firebaseClient";\nimport { collection, query, where, orderBy, getDocs } from "firebase/firestore";`);

// 3. IAPredictionTab.tsx
addImports('components/tabs/IAPredictionTab.tsx', `import { apiClient } from "../../core/api/apiClient";`);

// 4. hooks/useForensicData.ts
addImports('hooks/useForensicData.ts', `import { isFirebaseConfigured, db, auth } from "../services/firebaseClient";\nimport { collection, query, where, orderBy, getDocs } from "firebase/firestore";`);

// 5. hooks/useLottery.ts
addImports('hooks/useLottery.ts', `import { isFirebaseConfigured, db } from "../services/firebaseClient";\nimport { collection, query, where, onSnapshot } from "firebase/firestore";`);

// 6. services/offlineQueueService.ts
addImports('services/offlineQueueService.ts', `import { db } from "./firebaseClient";\nimport { doc, setDoc, addDoc, collection } from "firebase/firestore";`);

// 7. services/paymentService.ts
addImports('services/paymentService.ts', `import { doc, getDoc } from "firebase/firestore";\nimport { db } from "./firebaseClient";`);

// 8. services/prediction/weightsManager.ts
addImports('services/prediction/weightsManager.ts', `import { db } from "../firebaseClient";\nimport { doc, getDoc, setDoc } from "firebase/firestore";`);

// 9. DatabaseControl.tsx
addImports('components/admin/DatabaseControl.tsx', `import { db, testDatabaseConnection } from "../../services/firebaseClient";\nimport { collection, getDocs, writeBatch, doc } from "firebase/firestore";`);

