import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import config from '../firebase-applet-config.json';

const firebaseConfig = {
  apiKey: config.apiKey || "dummy-api-key",
  authDomain: config.authDomain || "",
  projectId: config.projectId || "dummy-project-id",
  storageBucket: config.storageBucket || "",
  messagingSenderId: config.messagingSenderId || "",
  appId: config.appId || "",
};

export const isFirebaseConfigured = (): boolean => {
  return Boolean(config.apiKey && config.projectId && config.apiKey !== "dummy-api-key");
};

export const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = config.firestoreDatabaseId 
  ? getFirestore(app, config.firestoreDatabaseId) 
  : getFirestore(app);
export const storage = getStorage(app);

import { collection, limit, query, getDocs } from 'firebase/firestore';

export const testDatabaseConnection = async () => {
  if (!isFirebaseConfigured()) return { success: false, error: "Configuration Firebase manquante" };
  try {
    const start = performance.now();
    const q = query(collection(db, 'draw_results'), limit(1));
    const snap = await getDocs(q);
    const latency = Math.round(performance.now() - start);
    return { success: true, count: snap.size, latency };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return { success: false, error: errorMsg || "Erreur de connexion Firestore." };
  }
};

