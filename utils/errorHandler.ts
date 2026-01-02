
/**
 * Transforme une erreur technique brute en un message convivial pour l'utilisateur.
 * Version Platinum v4.0 - Enhanced Context Awareness
 */
export const getUserFriendlyError = (error: any): string => {
    let rawMessage = "Une erreur inconnue est survenue.";
    
    if (typeof error === 'string') rawMessage = error;
    else if (error instanceof Error) rawMessage = error.message;
    else if (error && typeof error === 'object' && 'message' in error) rawMessage = (error as any).message;
    else if (error && typeof error === 'object') rawMessage = JSON.stringify(error);

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
        return "Problème de synchronisation avec le Cloud Nexus.";
    }

    // --- IA & CALCUL ---
    if (lowerMsg.includes('gemini') || lowerMsg.includes('ai') || lowerMsg.includes('generatecontent')) {
        return "L'Oracle IA ne répond pas. Passage automatique en mode algorithmique classique.";
    }
    if (lowerMsg.includes('worker') || lowerMsg.includes('terminated')) {
        return "Le moteur de calcul HPC a été interrompu. Réessayez l'opération.";
    }

    // --- AUDIO & MEDIA ---
    if (lowerMsg.includes('audiocontext') || lowerMsg.includes('microphone') || lowerMsg.includes('notallowederror')) {
        return "Accès micro refusé. Veuillez autoriser l'accès pour utiliser l'Oracle Vocal.";
    }

    // Si le message est court et propre, on l'affiche tel quel, sinon message générique
    if (rawMessage.length < 80 && !rawMessage.includes('{') && !rawMessage.includes('http')) {
        return rawMessage;
    }

    return "Une anomalie structurelle a été détectée. Le système s'est auto-protégé.";
};
