export const safeSetItem = (key: string, value: string) => {
  try {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(key, value);
    }
  } catch (e: unknown) {
    if (e instanceof Error && (e.name === 'QuotaExceededError' || e.message?.includes('quota') || e.message?.includes('Quota'))) {
      console.warn('LocalStorage quota exceeded. Purging caches...');
      if (typeof window !== 'undefined') {
        const keysToRemove: string[] = [];
        for (let i = 0; i < window.localStorage.length; i++) {
          const k = window.localStorage.key(i);
          if (k && (
            k.startsWith('nexus_cache_history_') || 
            k.startsWith('nexus_recent_stats_') || 
            k.startsWith('nexus_global_stats_') ||
            k.startsWith('orch_patterns_') ||
            k.startsWith('forensic_report_') ||
            k.startsWith('pred_') ||
            k.startsWith('learning_sess_')
          )) {
            keysToRemove.push(k);
          }
        }
        keysToRemove.forEach(k => window.localStorage.removeItem(k));
        
        try {
          window.localStorage.setItem(key, value);
        } catch (retryErr) {
          console.error('Failed to setItem even after purging caches', retryErr);
        }
      }
    } else {
      console.error('Error setting localStorage item', e);
    }
  }
};
