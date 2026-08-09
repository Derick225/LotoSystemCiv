import { db } from './firebaseClient';
import { collection, doc, getDocs, setDoc, query, where, orderBy, limit, deleteDoc } from 'firebase/firestore';
import { DrawResult } from '../types';

const COLLECTION_NAME = 'draw_results';

/**
 * Normalise le nom du tirage
 */
const normalizeDrawName = (name: string) => {
  return name.trim().toUpperCase().replace(/\s+/g, '_');
};

/**
 * Récupère l'historique des tirages
 */
export const fetchDrawResults = async (drawName: string, maxLimit = 100): Promise<DrawResult[]> => {
  try {
    const q = query(
      collection(db, COLLECTION_NAME),
      where('draw_name', '==', normalizeDrawName(drawName)),
      limit(maxLimit)
    );
    
    const snapshot = await getDocs(q);
    const results: DrawResult[] = [];
    
    snapshot.forEach((doc) => {
      const data = doc.data();
      results.push({
        id: doc.id,
        drawName: data.draw_name,
        date: data.date,
        gagnants: data.gagnants || [],
        machine: data.machine || [],
        version: data.version || 1
      });
    });

    // Tri décroissant par date
    return results.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  } catch (error) {
    console.error("Erreur lors de la récupération des tirages:", error);
    throw error;
  }
};

/**
 * Ajoute un nouveau tirage
 */
export const saveDrawResult = async (drawName: string, result: Omit<DrawResult, 'id'>) => {
  try {
    const normalizedName = normalizeDrawName(drawName);
    const docId = `${normalizedName}_${result.date}`.replace(/[\/\s]/g, '_');
    const docRef = doc(db, COLLECTION_NAME, docId);
    
    const payload = {
      draw_name: normalizedName,
      date: result.date,
      gagnants: result.gagnants,
      machine: result.machine || [],
      version: result.version || 1
    };
    
    await setDoc(docRef, payload, { merge: true });
    return docId;
  } catch (error) {
    console.error("Erreur lors de l'enregistrement du tirage:", error);
    throw error;
  }
};

/**
 * Supprime un tirage
 */
export const removeDrawResult = async (docId: string) => {
  try {
    await deleteDoc(doc(db, COLLECTION_NAME, docId));
  } catch (error) {
    console.error("Erreur lors de la suppression du tirage:", error);
    throw error;
  }
};
