/**
 * Helpers for routing content events to one or more display outputs.
 *
 * Older clients send the regular lyrics/file/mode events without routing
 * metadata. Those events intentionally continue to mean "all outputs".
 * Targeted announcements use `targetOutput` (singular) or `targetOutputs`
 * (array), which lets each output decide whether it should apply the event.
 */

function collectTargetValues(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') return [value];
  return [];
}

/**
 * Return the normalized target list, or null when the event is broadcast to
 * every output. An empty list is treated as an untargeted/broadcast event so
 * malformed or legacy payloads cannot accidentally blank every display.
 */
export function normalizeTargetOutputs(payload) {
  if (!payload || typeof payload !== 'object') return null;

  const raw = payload.targetOutputs ?? payload.targetOutput ?? payload.targetOutputKey;
  if (raw === undefined || raw === null) return null;

  const targets = [...new Set(collectTargetValues(raw)
    .map((value) => String(value).trim())
    .filter(Boolean))];

  return targets.length > 0 ? targets : null;
}

/**
 * Whether an event should be applied by a particular output page.
 * Missing routing metadata means "all outputs" for backwards compatibility.
 */
export function isPayloadForOutput(payload, outputKey) {
  const targets = normalizeTargetOutputs(payload);
  if (!targets) return true;
  return targets.includes(String(outputKey || ''));
}

/**
 * Add the canonical routing fields to a payload without dropping the
 * singular field used by the control-panel UI.
 */
export function withTargetOutputs(payload, outputKey) {
  const targetOutput = String(outputKey || '').trim();
  if (!targetOutput || !payload || typeof payload !== 'object') return payload;
  return {
    ...payload,
    targetOutput,
    targetOutputs: [targetOutput],
  };
}
