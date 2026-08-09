import { useState, useEffect, useCallback } from 'react';
import { workManager, WorkManagerStatus } from '../services/workManager';

/**
 * Hook personnalisé pour interagir avec le WorkManager de mise à jour des tirages en arrière-plan.
 */
export function useWorkManager() {
  const [status, setStatus] = useState<WorkManagerStatus>(() => workManager.getStatus());

  useEffect(() => {
    workManager.initialize();
    const unsubscribe = workManager.subscribe(newStatus => {
      setStatus(newStatus);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  const triggerManualSync = useCallback(async (drawNames?: string[]) => {
    return await workManager.scheduleDrawsSyncWork({
      force: true,
      drawNames,
      triggerSource: 'MANUAL_USER_TRIGGER'
    });
  }, []);

  return {
    ...status,
    triggerManualSync,
    initialize: () => workManager.initialize(),
  };
}
