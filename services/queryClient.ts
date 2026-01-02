
import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Les données de loterie changent peu (une fois par jour/semaine par jeu)
      // On garde les données en cache "fresh" pendant 5 minutes
      staleTime: 1000 * 60 * 5, 
      // On garde les données en mémoire (garbage collection) pendant 1 heure
      gcTime: 1000 * 60 * 60,
      // Re-fetch automatique si on revient sur l'onglet
      refetchOnWindowFocus: false, 
      retry: 2,
    },
  },
});
