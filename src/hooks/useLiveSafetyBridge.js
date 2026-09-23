import { useCallback } from 'react';
import { createLogger } from '../utils/logger.js';
import { shouldBlockDestructive, DESTRUCTIVE_LABELS } from '../utils/previewSafety.js';

const log = createLogger('LiveSafetyBridge');

/**
 * Live command safety bridge (feature #02).
 *
 * While any output is live (`isOutputOn === true`), destructive commands
 * (delete song, remove/clear setlist) are blocked with an explanatory toast.
 * The operator can still proceed via an explicit confirm-override modal —
 * nothing destructive ever fires silently while the room is watching.
 *
 * @param {{ isOutputOn?: boolean, showToast?: Function, showModal?: Function }} args
 * @returns {{ isLocked: boolean, guardDestructive: Function }}
 */
export function useLiveSafetyBridge({ isOutputOn = false, showToast = () => {}, showModal = null } = {}) {
  const isLocked = !!isOutputOn;

  const guardDestructive = useCallback(
    async (action, fn, opts = {}) => {
      const label = DESTRUCTIVE_LABELS[action] || opts.label || action || 'This action';

      if (!shouldBlockDestructive({ isOutputOn, action })) {
        await fn?.();
        return { blocked: false, overridden: false };
      }

      log.warn('Destructive command blocked while live', { action });
      showToast?.({
        title: 'Live safety lock',
        message: `Output is LIVE — ${label} is blocked to protect the screen. Confirm to override.`,
        variant: 'warn',
        dedupeKey: `live-safety-${action}`,
      });

      if (typeof showModal !== 'function') {
        return { blocked: true, overridden: false };
      }

      const detail = opts.detail || 'The projector is showing lyrics right now. Overriding may change what the room sees.';
      const result = await showModal({
        title: `${label} while LIVE?`,
        description: `${label} is blocked because output is LIVE.\n\n${detail}\n\nChoose Override to proceed anyway, or Cancel to keep the screen safe.`,
        variant: 'warn',
        actions: [
          { label: 'Cancel', value: 'cancel', variant: 'outline', autoFocus: true },
          { label: 'Override & proceed', value: 'override', variant: 'destructive' },
        ],
      });

      if (result === 'override') {
        log.warn('Destructive command overridden while live', { action });
        await fn?.();
        return { blocked: true, overridden: true };
      }
      return { blocked: true, overridden: false };
    },
    [isOutputOn, showToast, showModal],
  );

  return { isLocked, guardDestructive };
}

export default useLiveSafetyBridge;
