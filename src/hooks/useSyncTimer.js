import { useState, useEffect } from 'react';
import { createLogger } from '../utils/logger';

const log = createLogger('SyncTimer');

export const useSyncTimer = (lastSyncTime) => {
  const [secondsAgo, setSecondsAgo] = useState(0);

  useEffect(() => {
    if (!lastSyncTime) {
      log.debug('No sync time available');
      setSecondsAgo(0);
      return;
    }

    const updateTimer = () => {
      setSecondsAgo(Math.floor((Date.now() - lastSyncTime) / 1000));
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);

    return () => clearInterval(interval);
  }, [lastSyncTime]);

  return secondsAgo;
};