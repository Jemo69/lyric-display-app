import { useEffect, useState } from 'react';
import { createLogger } from '../../utils/logger';

const log = createLogger('NetworkStatus');

export default function useNetworkStatus() {
    const [isOnline, setIsOnline] = useState(
        typeof navigator !== 'undefined' ? navigator.onLine : true
    );

    useEffect(() => {
        const handleOnline = () => {
            log.info('Network status: online');
            setIsOnline(true);
        };
        const handleOffline = () => {
            log.warn('Network status: offline');
            setIsOnline(false);
        };

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, []);

    return isOnline;
}