import { useState, useEffect } from 'react';
import { testDatabaseConnection } from '../services/supabaseClient';
import { keys } from 'idb-keyval';

export function useSyncStatus() {
  const [isOnline, setIsOnline] = useState<boolean>(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [dbConnection, setDbConnection] = useState<'checking' | 'connected' | 'disconnected'>('checking');
  const [idbStats, setIdbStats] = useState({ history: 0, forensics: 0, learning: 0, snapshots: 0, other: 0, totalStorage: '0.00 MB' });
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastChecked, setLastChecked] = useState<Date>(new Date());

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const checkStatus = async () => {
    setIsSyncing(true);
    try {
      if (isOnline) {
        const connected = await testDatabaseConnection();
        setDbConnection(connected.success ? 'connected' : 'disconnected');
      } else {
        setDbConnection('disconnected');
      }

      const allKeys = await keys();
      let history = 0, forensics = 0, learning = 0, snapshots = 0, other = 0;

      allKeys.forEach((key) => {
        const k = String(key);
        if (k.startsWith('prediction_history_')) history++;
        else if (k.startsWith('forensic_report_')) forensics++;
        else if (k.startsWith('learning_session_')) learning++;
        else if (k.startsWith('prediction_snapshot_')) snapshots++;
        else if (k !== 'supabase.auth.token') other++; 
      });

      let totalStorage = 'N/A';
      if (navigator.storage && navigator.storage.estimate) {
        const est = await navigator.storage.estimate();
        if (est.usage) {
          totalStorage = (est.usage / (1024 * 1024)).toFixed(2) + ' MB';
        }
      }

      setIdbStats({ history, forensics, learning, snapshots, other, totalStorage });
      setLastChecked(new Date());
    } catch (e) {
      console.error("Telemetry error:", e);
    } finally {
      setIsSyncing(false);
    }
  };

  useEffect(() => {
    checkStatus();
    const interval = setInterval(checkStatus, 30000);
    return () => clearInterval(interval);
  }, [isOnline]);

  return {
    isOnline,
    dbConnection,
    idbStats,
    isSyncing,
    lastChecked,
    checkStatus
  };
}
