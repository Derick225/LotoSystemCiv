
/**
 * Transforme une erreur technique brute en un message convivial pour l'utilisateur.
 * Version Platinum v4.1 - Stack Overflow Protection
 */
export const getUserFriendlyError = (error: any): string => {
    try {
        let rawMessage = "Une erreur inconnue est survenue.";
        
        if (!error) return rawMessage;

        if (typeof error === 'string') rawMessage = error;
        else if (error instanceof Error) rawMessage = error.message;
        else if (typeof error === 'object') {
            // Extraction safe des propriétés courantes sans JSON.stringify complet
            if ('message' in error) rawMessage = String((error as any).message);
            else if ('error_description' in error) rawMessage = String((error as any).error_description);
            else if ('code' in error) rawMessage = `Erreur Code: ${(error as any).code}`;
            else {
                // Fallback safe pour éviter la récursion sur JSON.stringify
                rawMessage = "Erreur objet non sérialisable";
            }
        }

        const lowerMsg = rawMessage.toLowerCase();

        // --- RESEAU & CONNEXION ---
        if (lowerMsg.includes('fetch') || lowerMsg.includes('network') || lowerMsg.includes('connection')) {
            return "Impossible de joindre le serveur. Vérifiez votre connexion internet.";
        }
        if (lowerMsg.includes('timeout') || lowerMsg.includes('timed out')) {
            return "Le serveur met trop de temps à répondre. Réessayez plus tard.";
        }
        if (lowerMsg.includes('offline') || lowerMsg.includes('internet disconnected')) {
            return "Vous êtes hors ligne. Nexus fonctionne en mode local limité.";
        }

        // --- API LIMITS & QUOTAS ---
        if (lowerMsg.includes('429') || lowerMsg.includes('quota') || lowerMsg.includes('rate limit') || lowerMsg.includes('resource_exhausted')) {
            return "Surcharge de l'Oracle IA. Veuillez patienter 60 secondes avant de réessayer.";
        }
        
        // --- DONNÉES & SUPABASE ---
        if (lowerMsg.includes('no results') || lowerMsg.includes('aucun résultat') || lowerMsg.includes('empty')) {
            return "Aucun résultat disponible pour cette période. Les serveurs officiels sont peut-être en maintenance.";
        }
        if (lowerMsg.includes('proxy') || lowerMsg.includes('invocation')) {
            return "Le relais de données (Proxy) est momentanément saturé. Réessayez dans 30s.";
        }
        if (lowerMsg.includes('supabase') || lowerMsg.includes('postgres') || lowerMsg.includes('pgrst')) {
            if (lowerMsg.includes('duplicate')) return "Cette donnée existe déjà dans la base.";
            if (lowerMsg.includes('relation "draw_results" does not exist') || lowerMsg.includes('42P01')) return "Table introuvable. Veuillez initialiser la base de données.";
            return "Problème de synchronisation avec le Cloud Nexus.";
        }

        // --- IA & CALCUL ---
        if (lowerMsg.includes('gemini') || lowerMsg.includes('ai') || lowerMsg.includes('generatecontent')) {
            return "L'Oracle IA ne répond pas. Passage automatique en mode algorithmique classique.";
        }
        if (lowerMsg.includes('worker') || lowerMsg.includes('terminated')) {
            return "Le moteur de calcul HPC a été interrompu. Réessayez l'opération.";
        }
        if (lowerMsg.includes('maximum call stack')) {
            return "Surcharge mémoire détectée (Stack Overflow). Rechargement recommandé.";
        }

        // --- AUDIO & MEDIA ---
        if (lowerMsg.includes('audiocontext') || lowerMsg.includes('microphone') || lowerMsg.includes('notallowederror')) {
            return "Accès micro refusé. Veuillez autoriser l'accès pour utiliser l'Oracle Vocal.";
        }

        // Si le message est court et propre, on l'affiche tel quel, sinon message générique
        if (rawMessage.length < 150 && !rawMessage.includes('{') && !rawMessage.includes('http')) {
            return rawMessage;
        }

        return "Une anomalie structurelle a été détectée. Le système s'est auto-protégé.";
    } catch (e) {
        return "Erreur critique du gestionnaire d'erreurs.";
    }
};
