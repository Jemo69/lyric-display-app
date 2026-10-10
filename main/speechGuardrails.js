/**
 * main/speechGuardrails.js — the shared-laptop guardrails (Phase 6).
 *
 * Plan section 5.6, the part that isn't erase: "on a shared church laptop, a
 * runaway engine is worse than no engine at all." A 3 GB model on an old
 * machine can pin every core, push the machine into swap, and take OBS and the
 * lyrics display down with it — which during a service is the failure that
 * actually gets noticed.
 *
 * ## Design rules
 *
 * 1. SUSPEND BEFORE KILL. The first sign of trouble is a warning, not a
 *    teardown. Tearing down a live session because the CPU spiked for one
 *    sample would punish exactly the moment transcription is hardest.
 * 2. HysterESIS ON BOTH SIDES. Suspending at a threshold that also un-suspends
 *    at the same threshold oscillates, and a flapping engine is unusable
 *    during a service. Recovery needs a separate, lower number.
 * 3. DECAY, NOT RESET. A sustained spike clears; a brief one does not. Four
 *    high samples in a row means something is genuinely wrong.
 * 4. EVERY LIMIT IS A NUMBER THE USER CAN SEE. A limit hidden in a module is a
 *    limit the app can silently break.
 * 5. IT MAY NOT RAISE ITS OWN LIMITS. Auto-suspending forever is worse than
 *    running hot: the feature would be permanently dead with no explanation.
 *    After the cooldown, the engine restarts at the limit it had.
 *
 * Everything here is pure. The sampling, the thresholds, and the state machine
 * are separate from the side effects (suspend, resume, restart), so the rules
 * can be tested against a synthetic sample stream instead of a real machine.
 */
import os from 'node:os';
// Redaction ships from shared/ because the renderer has to state its limits
// next to the toggle. Re-exported here so main-side callers have one import
// site for the guardrails.
import { redactText, REDACTION_LIMITS } from '../shared/speech/redaction.js';

export { redactText, REDACTION_LIMITS };

/** Consecutive over-limit samples before a SUSPEND. See rule 3 above. */
export const STRIKE_LIMIT = 4;

/**
 * Consecutive healthy samples before a RESUME. Deliberately larger than
 * STRIKE_LIMIT: recovery should be more cautious than suspension, since a
 * machine that just thrashed will thrash again.
 */
export const RECOVERY_LIMIT = 6;

/** How long after a suspend the engine may be restarted, at all. */
export const COOLDOWN_MS = 30_000;

/**
 * Default ceilings, as fractions of the machine.
 *
 * Memory is a FRACTION OF TOTAL RAM on purpose. A fixed GB figure would pass on
 * a 64 GB machine and brick an 8 GB one — and 8 GB is a very common church
 * laptop. CPU is a fraction because a core count varies by 4x across the
 * machines this ships to.
 */
export const DEFAULT_LIMITS = Object.freeze({
  /** Engine RSS as a fraction of total system memory. */
  memoryFraction: 0.6,
  /** Engine CPU as a fraction of total system CPU (1.0 == all cores). */
  cpuFraction: 1.6,
  /** Absolute RSS floor in MB, for machines too small for the fraction. */
  memoryFloorMb: 1024,
  /** Absolute ceiling in MB, for machines with more RAM than the fraction allows. */
  memoryCeilingMb: 8192,
});

/**
 * Resolve the effective limits for this machine.
 *
 * @param {object} [over] user overrides, each optional
 * @param {object} [machine] injectable `{ totalMemMb, cpuCount }` for tests
 * @returns {{memoryMb: number, cpuFraction: number, memoryMbFloor: number, memoryMbCeiling: number}}
 */
export function resolveLimits(over = {}, machine = null) {
  const specs = machine ?? describeMachine();
  const fraction = clampPositive(over.memoryFraction, DEFAULT_LIMITS.memoryFraction);
  const cpu = Math.max(0.1, clampPositive(over.cpuFraction, DEFAULT_LIMITS.cpuFraction));
  const ceiling = Math.max(0, Number.isFinite(over.memoryCeilingMb) ? over.memoryCeilingMb : DEFAULT_LIMITS.memoryCeilingMb);

  // Whichever is SMALLER wins between the fraction and the ceiling, so a
  // generous ceiling cannot hand back an unsafe number on a huge machine, and
  // a tiny fraction cannot starve a model on a huge machine either.
  const byFraction = specs.totalMemMb * fraction;
  const memoryMb = clampNumber(Math.min(byFraction, ceiling || byFraction), 64, Number.MAX_SAFE_INTEGER);

  return {
    memoryMb: Math.round(memoryMb),
    cpuFraction: cpu,
    // Floors are reported so the UI can explain WHY a limit is what it is.
    memoryMbByFraction: Math.round(byFraction),
    memoryMbCeiling: Math.round(ceiling),
    totalMemMb: Math.round(specs.totalMemMb),
    cpuCount: specs.cpuCount,
  };
}

/** The machine this is running on, in the units the limits use. */
export function describeMachine(machine = os) {
  const totalMemMb = (machine.totalmem?.() ?? machine.totalMem?.() ?? 0) / (1024 * 1024);
  const cpuCount = machine.cpus?.()?.length ?? 0;
  return { totalMemMb, cpuCount };
}

function clampPositive(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function clampNumber(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

/**
 * A finite number, or null.
 *
 * `null` means "not reported", which `evaluateSample` treats as unmeasurable
 * rather than as zero — the distinction the whole watchdog rests on.
 */
function numberOrNull(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/**
 * Is one sample over a limit?
 *
 * @param {{rssMb?: number, cpuPercent?: number}} sample
 * @param {{memoryMb: number, cpuFraction: number, cpuCount?: number}} limits
 * @returns {{over: boolean, memory: boolean, cpu: boolean, memoryMb: number|undefined, cpuPercent: number|undefined}}
 */
export function evaluateSample(sample, limits) {
  const rssMb = numberOrNull(sample?.rssMb);
  const cpuPercent = numberOrNull(sample?.cpuPercent);

  // A missing sample is NOT a passing sample. Reporting "within limits" for a
  // machine that stopped answering is how a watchdog becomes decorative.
  if (rssMb === null && cpuPercent === null) {
    return { over: true, memory: false, cpu: false, unknown: true, rssMb, cpuPercent };
  }

  const memory = rssMb !== null && rssMb > limits.memoryMb;
  const cpu = cpuPercent !== null && cpuPercent > limits.cpuFraction * 100;
  return { over: memory || cpu, memory, cpu, unknown: false, rssMb, cpuPercent };
}

/** A human sentence naming the limit that was crossed, and by how much. */
export function describeViolation(verdict, limits) {
  if (verdict.unknown) {
    return 'The engine stopped reporting its resource use, so it cannot be shown to be safe.';
  }
  if (verdict.memory && verdict.cpu) {
    return `The engine is using ${round1(verdict.rssMb)} MB of memory (limit ${limits.memoryMb} MB) and ${round1(
      verdict.cpuPercent
    )}% CPU (limit ${Math.round(limits.cpuFraction * 100)}%).`;
  }
  if (verdict.memory) {
    return `The engine is using ${round1(verdict.rssMb)} MB of memory, over the ${limits.memoryMb} MB limit for this computer.`;
  }
  return `The engine is using ${round1(verdict.cpuPercent)}% CPU, over the ${Math.round(
    limits.cpuFraction * 100
  )}% limit for this computer.`;
}

function round1(n) {
  return typeof n === 'number' && Number.isFinite(n) ? Math.round(n * 10) / 10 : 0;
}

/**
 * The guardrail state machine.
 *
 * Pure: `observe(sample)` returns the decision, and nothing here touches a
 * process. The caller performs `suspend` / `resume` / `restart`.
 *
 * States: 'ok' -> 'warned' (a strike, not yet enough) -> 'suspended' -> back to
 * 'ok' once recovery samples pass.
 */
export function createGuardrail({ limits = null, strikes = STRIKE_LIMIT, recovery = RECOVERY_LIMIT, now = Date.now } = {}) {
  const resolved = limits ?? resolveLimits();
  let state = {
    status: 'ok',
    strikes: 0,
    recoveries: 0,
    overSince: null,
    suspendedAt: null,
    lastVerdict: null,
    lastMessage: '',
    trips: 0,
  };

  return {
    get limits() {
      return resolved;
    },
    get state() {
      return { ...state };
    },

    /**
     * Feed one sample.
     *
     * @returns {{action: 'none'|'warn'|'suspend'|'resume', status: string, message: string, verdict: object|null}}
     */
    observe(sample) {
      const verdict = evaluateSample(sample, resolved);
      state.lastVerdict = verdict;

      if (state.status === 'suspended') {
        // Already down. Recovery requires BOTH a healthy sample and the
        // cooldown, so a machine that just thrashed cannot thrash again
        // immediately.
        const healthy = !verdict.over;
        state.recoveries = healthy ? state.recoveries + 1 : 0;
        const cooled = state.suspendedAt === null || now() - state.suspendedAt >= COOLDOWN_MS;
        if (healthy && cooled && state.recoveries >= recovery) {
          state = { ...state, status: 'ok', strikes: 0, recoveries: 0, suspendedAt: null, overSince: null, lastMessage: '' };
          return { action: 'resume', status: 'ok', message: '', verdict };
        }
        return { action: 'none', status: 'suspended', message: state.lastMessage, verdict };
      }

      if (verdict.over) {
        if (state.overSince === null) state.overSince = now();
        state.strikes += 1;
        state.recoveries = 0;

        if (state.strikes >= strikes) {
          state = {
            ...state,
            status: 'suspended',
            suspendedAt: now(),
            trips: state.trips + 1,
            lastMessage: describeViolation(verdict, resolved),
          };
          return { action: 'suspend', status: 'suspended', message: state.lastMessage, verdict };
        }
        state.lastMessage = describeViolation(verdict, resolved);
        return { action: 'warn', status: 'warned', message: state.lastMessage, verdict };
      }

      // Under the limit. Decay rather than reset: one good sample should not
      // erase three bad ones, but four bad ones followed by one good one should
      // not be a permanent state either.
      state.strikes = state.strikes > 0 ? state.strikes - 1 : 0;
      state.recoveries = state.recoveries + 1;
      if (state.strikes === 0) state.overSince = null;
      state.lastMessage = '';
      // `state.status` is kept in sync here, not just in the returned object.
      // Returning a computed status while the stored one stayed stale meant a
      // caller reading the guardrail's own state saw 'ok' while it still held
      // strikes — and two readers disagreeing about the same object is how a
      // watchdog stops being believed.
      const status = state.strikes > 0 ? 'warned' : 'ok';
      state.status = status;
      return { action: 'none', status, message: '', verdict };
    },

    /** Called after the caller actually suspended, so timing starts at the real event. */
    markSuspended() {
      state = { ...state, status: 'suspended', suspendedAt: now() };
    },

    /** Forget everything. Used when the feature is switched off. */
    reset() {
      state = {
        status: 'ok',
        strikes: 0,
        recoveries: 0,
        overSince: null,
        suspendedAt: null,
        lastVerdict: null,
        lastMessage: '',
        trips: 0,
      };
    },
  };
}

export default createGuardrail;