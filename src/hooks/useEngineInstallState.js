import { useEffect, useState } from 'react';

/**
 * useEngineInstallState — is the REAL speech engine installed?
 *
 * WHY THIS EXISTS. The rail's privacy indicator reports the configured mode
 * ("Local · large-v3"). That was true but useless in the one case that
 * matters: Production mode selected on a machine with no whisper.cpp binary.
 * The start then refuses (main/speechIpc.js), but until the operator presses
 * resume the rail looked ready. This hook reads the engine half of
 * `speech:install-state` so the rail can say "engine not installed" up front.
 *
 * Read-only and cold: one `getState()` on mount plus one subscription, no
 * spawn, no download, no microphone.
 *
 * @returns {{installed: boolean, binDir: string, supported: boolean,
 *            release: string}|null} null until the bridge answers.
 */
export function useEngineInstallState() {
  const [engine, setEngine] = useState(null);

  useEffect(() => {
    const speech = typeof window === 'undefined' ? null : window.electronAPI?.speech ?? null;
    if (!speech) return undefined;

    let alive = true;
    const apply = (state) => {
      if (alive && state?.engine) setEngine(state.engine);
    };

    Promise.resolve()
      .then(() => speech.getState?.())
      .then((state) => apply(state?.installState))
      .catch(() => {
        // No bridge answer reads as "unknown", never as a scary banner.
      });

    let off = null;
    try {
      off = speech.onInstallState?.(apply);
    } catch {
      off = null;
    }

    return () => {
      alive = false;
      try {
        off?.();
      } catch {
        // Bridge already torn down.
      }
    };
  }, []);

  return engine;
}

export default useEngineInstallState;
