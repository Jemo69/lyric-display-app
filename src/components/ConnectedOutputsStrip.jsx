import React from 'react';
import { Monitor, Wifi, WifiOff } from 'lucide-react';
import { useOutputRegistry } from '../hooks/useStoreSelectors';
import { useOutputPresence } from '../hooks/useOutputPresence';
import useModal from '../hooks/useModal';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('ConnectedOutputsStrip');

function openHealthModal(showModal) {
  showModal({
    title: 'Pre-Service Health Check',
    component: 'PreServiceHealth',
    variant: 'info',
    size: 'large',
    dismissLabel: 'Close',
  });
}

/**
 * Persistent live strip of output heartbeat state (feature #03).
 * One chip per output (built-in + custom): icon plus a text label, never
 * colour alone. Clicking a chip opens the full pre-service health check.
 */
const ConnectedOutputsStrip = ({ darkMode }) => {
  const { outputs } = useOutputRegistry();
  const { presenceByKey } = useOutputPresence();
  const { showModal } = useModal();

  logger.info('ConnectedOutputsStrip mounted');

  return (
    <section
      aria-label="Connected outputs"
      className={`mb-4 rounded-xl border px-3 py-2 ${darkMode ? 'border-gray-700 bg-gray-950/40' : 'border-gray-200 bg-gray-50'}`}
    >
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <h3 className={`text-[10px] font-bold uppercase tracking-[0.2em] ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
          Connected outputs
        </h3>
        <button
          type="button"
          onClick={() => openHealthModal(showModal)}
          className={`rounded-md text-[11px] font-semibold underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-1 ${darkMode ? 'text-gray-300 hover:text-white' : 'text-gray-600 hover:text-gray-900'}`}
        >
          Pre-service check
        </button>
      </div>
      <ul className="flex flex-wrap gap-1.5" aria-live="polite">
        {outputs.map((output) => {
          const instances = presenceByKey.get(output.key) || presenceByKey.get(output.id) || [];
          const connected = instances.length > 0;
          return (
            <li key={output.key}>
              <button
                type="button"
                onClick={() => openHealthModal(showModal)}
                title={`${output.name} — ${connected ? `connected (${instances.length} screen${instances.length === 1 ? '' : 's'})` : 'not connected'}. Open the pre-service health check.`}
                aria-label={`${output.name}: ${connected ? 'connected' : 'not connected'}. Open the pre-service health check.`}
                className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-1 ${connected
                  ? darkMode
                    ? 'border-green-700/50 bg-green-900/20 text-green-200 hover:bg-green-900/35'
                    : 'border-green-300 bg-green-50 text-green-800 hover:bg-green-100'
                  : darkMode
                    ? 'border-gray-700 bg-gray-800 text-gray-400 hover:text-gray-200'
                    : 'border-gray-200 bg-white text-gray-500 hover:text-gray-800'
                  }`}
              >
                <Monitor className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span className="max-w-28 truncate">{output.name}</span>
                {connected ? (
                  <Wifi className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                ) : (
                  <WifiOff className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                )}
                <span>{connected ? `Connected${instances.length > 1 ? ` ×${instances.length}` : ''}` : 'Not connected'}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
};

export default ConnectedOutputsStrip;
