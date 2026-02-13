
import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Stratégie de mise en cache agressive pour l'historique statique
      staleTime: 1000 * 60 * 10, // 10 minutes par défaut
      gcTime: 1000 * 60 * 60 * 24, // Garder en mémoire 24h
      
      refetchOnWindowFocus: false, 
      refetchOnMount: false,
      
      retry: (failureCount, error: any) => {
        // Ne pas réessayer si 404 ou erreur fatale
        if (error?.status === 404 || error?.message?.includes('Fatal')) return false;
        return failureCount < 3;
      },
      
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000), // Backoff exponentiel
    },
    mutations: {
        retry: 1, // Une seule tentative pour les actions critiques
    }
  },
});
