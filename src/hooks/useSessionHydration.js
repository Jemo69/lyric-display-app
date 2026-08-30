import { useEffect, useState } from 'react';
import useLyricsStore from '../context/LyricsStore';
import { SESSION_SCHEMA_VERSION } from '../context/sessionModel.js';

export function useSessionHydration() {
  const hasHydrated = useLyricsStore.persist?.hasHydrated?.() ?? false;
  const [hydrated, setHydrated] = useState(hasHydrated);
  const [version, setVersion] = useState(() => {
    try {
      const s = useLyricsStore.getState();
      return s._persistVersion ?? s.session?._version ?? SESSION_SCHEMA_VERSION;
    } catch { return SESSION_SCHEMA_VERSION; }
  });

  useEffect(() => {
    if (hasHydrated) {
      setHydrated(true);
      return;
    }
    const unsub = useLyricsStore.persist?.onFinishHydration?.(() => {
      setHydrated(true);
      try {
        const s = useLyricsStore.getState();
        setVersion(s._persistVersion ?? SESSION_SCHEMA_VERSION);
      } catch {}
    });
    // fallback: if no onFinishHydration, poll once
    const t = setTimeout(() => {
      if (useLyricsStore.persist?.hasHydrated?.()) setHydrated(true);
    }, 300);
    return () => {
      if (typeof unsub === 'function') unsub();
      clearTimeout(t);
    };
  }, [hasHydrated]);

  return { hydrated, version, hasHydrated: hydrated };
}

export default useSessionHydration;
