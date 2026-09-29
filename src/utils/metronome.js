/**
 * Metronome engine.
 *
 * Ported from FreeShow's `src/frontend/components/drawer/audio/metronome.ts`
 * (GPL-3.0, https://github.com/freeshow/freeshow). The beat clock, the
 * look-ahead scheduler, the accent/secondary gain ratio and the channel
 * routing are kept identical on purpose — this is a 1:1 port, so the timing
 * behaviour and the stored defaults must not drift.
 *
 * Two mechanical changes were unavoidable:
 *   1. Svelte stores -> a plain module singleton plus a `subscribe()` listener
 *      set, so React can read it through `useSyncExternalStore`.
 *   2. FreeShow multiplies click gain by its global `volume` store and
 *      `AudioPlayer.getGain()`. LyricDisplay has no master bus, so
 *      `getVolume()` is just the accent/secondary factor times the metronome's
 *      own volume. The `accentVolume` / `secondaryVolume` ratio is untouched.
 *
 * The click buffers are FreeShow's own (`public/sounds/metronome/*.webm`).
 */

export const defaultMetronomeValues = {
  tempo: 120, // BPM
  beats: 4,
  volume: 1,
};

/** Click sounds ship with the app: [accent, secondary]. */
const clickFiles = {
  metal: ['beat-metal-hi.webm', 'beat-metal-lo.webm'],
  wood: ['beat-wood-hi.webm', 'beat-wood-lo.webm'],
};

export const CLICK_SOUND_OPTIONS = [
  { value: 'metal', label: 'Metal' },
  { value: 'wood', label: 'Wood' },
  { value: 'custom', label: 'Custom' },
];

export const AUDIO_CHANNEL_OPTIONS = [
  { value: '', label: 'Stereo' },
  { value: 'mono_left', label: 'Mono left' },
  { value: 'mono_right', label: 'Mono right' },
];

/** FreeShow's `preScheduleTime`. Exported so the visualizer can match. */
export const preScheduleTime = 0.1;

const accentVolume = 2;
const secondaryVolume = 1.75;

const clamp = (value, min, max, fallback) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
};

/* -------------------------------------------------------------------------- */
/* Live state                                                                  */
/* -------------------------------------------------------------------------- */

let metronomeValues = { ...defaultMetronomeValues };
let clickSoundSettings = { clickSound: 'metal', clickSound_hi: '', clickSound_lo: '' };
let showMetadata = null;
let playing = false;
let timer = { beat: 0, timeToNext: 0 };

const listeners = new Set();

// A stable snapshot so `useSyncExternalStore` does not loop on identity: the
// reference only changes when `emit()` runs, which is once per beat.
let snapshot = { values: metronomeValues, clickSound: clickSoundSettings, playing, timer };

const emit = () => {
  snapshot = { values: metronomeValues, clickSound: clickSoundSettings, playing, timer };
  listeners.forEach((listener) => listener());
};

export function subscribeMetronome(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getMetronomeState() {
  return snapshot;
}

/* -------------------------------------------------------------------------- */
/* Audio plumbing                                                              */
/* -------------------------------------------------------------------------- */

let audioContext = null;
function getAudioContext() {
  if (typeof window === 'undefined') return null;
  if (!audioContext) {
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return null;
    try {
      audioContext = new Ctor();
    } catch (err) {
      console.error('[metronome] could not create AudioContext', err);
      return null;
    }
  }
  return audioContext;
}

const audioBuffers = {};
let bufferLoad = null;

function resolveBufferId() {
  const { clickSound, clickSound_hi: hi, clickSound_lo: lo } = clickSoundSettings;
  if (clickSound === 'custom') return hi + lo;
  return clickSound || 'metal';
}

async function setAudioBuffers() {
  const ctx = getAudioContext();
  if (!ctx) return;

  const bufferId = resolveBufferId();
  if (!bufferId || audioBuffers[bufferId]) return;
  // Collapse the concurrent fetches `Promise.all` can trigger when start() is
  // called twice before the first decode finishes.
  if (bufferLoad && bufferLoad.id === bufferId) return bufferLoad.promise;

  const { clickSound, clickSound_hi: hi, clickSound_lo: lo } = clickSoundSettings;
  const clickSounds = clickSound === 'custom' ? [hi, lo] : clickFiles[clickSound];

  const promise = Promise.all(
    clickSounds.map(async (fileName, index) => {
      if (!fileName) return;

      // KNOWN LIMITATION (custom click sound): the renderer is served over HTTP
      // with `webSecurity` on, so `fetch('file://…')` is blocked, and Electron 37
      // removed `File.path`, so the picker only has `file.name` to work with. In
      // the shipped app "Custom" therefore loads nothing and the click goes
      // silent while `playing` stays true. The shipped metal/wood samples are
      // unaffected. Making Custom work means routing the bytes through the main
      // process (IPC -> fs.readFile -> ArrayBuffer); tracked rather than faked
      // here, because silently muting the click is worse than a visible failure.
      const path =
        clickSound === 'custom'
          ? `file://${fileName}`
          : `${import.meta.env.BASE_URL}sounds/metronome/${fileName}`;

      const audioBuffer = await fetch(path)
        .then((res) => res.arrayBuffer())
        .then((arrayBuffer) => ctx.decodeAudioData(arrayBuffer));

      const id = index === 0 ? 'hi' : 'lo';
      audioBuffers[bufferId] = { ...audioBuffers[bufferId], [id]: audioBuffer };
    })
  ).catch((err) => {
    console.error('[metronome] could not load click sound', err);
  });

  bufferLoad = { id: bufferId, promise };
  await promise;
  if (bufferLoad && bufferLoad.id === bufferId) bufferLoad = null;
}

/**
 * FreeShow's `AudioPlayer.getOutputs()`: enumerate audio outputs, dropping the
 * synthetic "default" entry because `setSinkId('default')` is not portable.
 */
export async function getAudioOutputs() {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.enumerateDevices) return [];
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices
      .filter((device) => device.kind === 'audiooutput' && device.deviceId !== 'default')
      .map((device) => ({ value: device.deviceId, label: device.label }));
  } catch (err) {
    console.error(`[metronome] ${err.name}: ${err.message}`);
    return [];
  }
}

/* -------------------------------------------------------------------------- */
/* Public control surface (FreeShow: metronome.ts)                            */
/* -------------------------------------------------------------------------- */

function initializeValues() {
  metronomeValues = { ...defaultMetronomeValues };
  emit();
}

export function toggleMetronome() {
  if (playing) stopMetronome();
  else startMetronome();
}

export function startMetronome(values = {}) {
  if (metronomeValues.tempo) metronomeValues = { ...metronomeValues };
  if (values.metadataBPM) values = { ...values, tempo: getShowBPM() };
  if (Object.keys(values).length) {
    const oldValues = { ...metronomeValues };
    delete oldValues.volume;

    updateMetronome(values, true);

    // return if playing and values are the same
    const newValues = { ...values };
    delete newValues.volume;
    if (playing && JSON.stringify(newValues) === JSON.stringify(oldValues)) return;
  }

  if (!metronomeValues.tempo) initializeValues();
  if (playing) stopMetronome();

  initializeMetronome(++runId);
}

/**
 * FreeShow's `getShowBPM()`: look for a custom metadata key that mentions BPM
 * (it does not hardcode one name) and fall back to the default tempo. FreeShow
 * reads it off the show's `meta`; LyricDisplay keeps the same data on
 * `songMetadata`, which is a free-form object, so the key scan is what makes
 * this work with whichever loader or importer supplies the tempo.
 */
export function getShowBPM() {
  const metadata = showMetadata || {};
  const bpmKey = findTempoKey(metadata) || 'BPM';
  return Math.floor(parseFloat(metadata[bpmKey] || 0)) || defaultMetronomeValues.tempo;
}

/**
 * FreeShow looks for a metadata key that mentions BPM and does not hardcode one
 * name. `tempo` is accepted alongside the `bpm` spellings because that is the key
 * this app's chord-chart parser writes (`shared/chords.js`), and a scan limited
 * to `bpm` would never match anything the app can actually produce.
 */
export function findTempoKey(metadata) {
  const keys = Object.keys(metadata || {});
  return (
    keys.find((key) => key.toLowerCase().includes('bpm')) ||
    keys.find((key) => key.toLowerCase() === 'tempo') ||
    null
  );
}

/** Feed the currently loaded song's metadata in so `metadataBPM` can read it. */
export function setShowMetadata(metadata) {
  showMetadata = metadata || null;
}

export function updateMetronome(values = {}, starting = false) {
  const next = { ...values };
  const previousOutput = metronomeValues.audioOutput;
  const before = { ...metronomeValues };

  if (!next.tempo) {
    next.tempo = metronomeValues.tempo || defaultMetronomeValues.tempo;
  }
  if (!starting && playing && next.tempo !== metronomeValues.tempo) {
    return startMetronome(next);
  }

  metronomeValues.tempo = clamp(next.tempo, 1, 320, defaultMetronomeValues.tempo);
  if (next.beats) metronomeValues.beats = clamp(next.beats, 1, 16, defaultMetronomeValues.beats);
  if (next.volume) metronomeValues.volume = clamp(next.volume, 0.01, 3, 1);
  if (next.audioOutput !== undefined) metronomeValues.audioOutput = next.audioOutput;
  if (next.audioChannel !== undefined) metronomeValues.audioChannel = next.audioChannel;

  // Changing the output mid-play re-routes immediately; the scheduler no longer
  // re-issues `setSinkId` on every beat.
  if (next.audioOutput !== undefined && next.audioOutput !== previousOutput) {
    applyAudioOutput();
  }

  // `useMetronome` pushes the whole store into the engine on mount and on every
  // settings write, so most calls here are no-ops. Emitting unconditionally gave
  // `useSyncExternalStore` a new snapshot identity each time and re-rendered the
  // bar for nothing. Only notify on an actual change.
  if (!valuesEqual(before, metronomeValues)) emit();
}

/** Shallow equality, tolerant of keys present on only one side. */
function valuesEqual(a, b) {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of keys) {
    if (a[key] !== b[key]) return false;
  }
  return true;
}

export function updateClickSound(next = {}) {
  const merged = { ...clickSoundSettings, ...next };
  // `useMetronome` re-pushes the click sound on every settings write, so most
  // calls carry the values already in place. Restarting unconditionally there
  // punched a full beat of silence into the click for any unrelated change — a
  // volume nudge, or holding `+` to dial in a tempo. At the 1 BPM minimum that
  // was a 60-second hole in the middle of a service.
  if (valuesEqual(clickSoundSettings, merged)) return;

  clickSoundSettings = merged;
  // Changing the sample needs a fresh beat clock.
  if (playing) startMetronome({});
  else emit();
}

export function stopMetronome() {
  // Invalidate any start still awaiting its buffers, so a stop during that
  // window takes effect instead of being overwritten by the continuation.
  runId++;
  if (scheduleTimeout) clearTimeout(scheduleTimeout);
  scheduleTimeout = null;
  // Silence the notes already queued in the audio graph, not just the timer.
  liveSources.forEach((source) => {
    try {
      source.stop(0);
    } catch {
      /* already finished */
    }
  });
  liveSources.clear();
  playing = false;
  timer = { beat: 0, timeToNext: 0 };
  emit();

  startTime = 0;
  beatsPlayed = 0;
  clockStarted = false;
}

/* -------------------------------------------------------------------------- */
/* Scheduler (FreeShow: metronome.ts)                                          */
/* -------------------------------------------------------------------------- */

// time values are in seconds
let timeBetweenEachBeat = 0;
let startTime = 0;
// FreeShow asks "is this the first note?" with `!startTime`. That is wrong on a
// freshly created AudioContext, where currentTime is still exactly 0: the flag
// never latches and scheduleNote recurses until the stack blows. Use an
// explicit sentinel instead.
let clockStarted = false;

/**
 * Every start gets a ticket, and `stop` invalidates the current one.
 *
 * `initializeMetronome` awaits `resume()` and the click-sample fetch+decode, and
 * on a first play that is tens to hundreds of milliseconds. A stop landing in
 * that window used to be silently lost: there was no pending timeout to clear
 * yet, so the continuation went on to `scheduleNextNote()` and the click kept
 * running with no way to silence it short of a second stop. Comparing the ticket
 * after each await closes that window.
 */
let runId = 0;

async function initializeMetronome(id) {
  const ctx = getAudioContext();
  if (!ctx) return;
  // Clicking play is a user gesture, but the await in setAudioBuffers can drop
  // the activation in some browsers, so resume explicitly before scheduling.
  if (ctx.state === 'suspended') {
    try {
      await ctx.resume();
    } catch {
      /* ignore */
    }
  }
  if (id !== runId) return;

  await setAudioBuffers();
  if (id !== runId) return;

  // Select the output once per start rather than once per beat: `setSinkId`
  // reconfigures the device, and re-issuing it four times a second at 240bpm
  // audibly glitches the click.
  await applyAudioOutput();
  if (id !== runId) return;

  const beatsPerSecond = 60 / (metronomeValues.tempo || defaultMetronomeValues.tempo);
  timeBetweenEachBeat = beatsPerSecond;

  scheduleNextNote();
}

/** Route the click to the operator's chosen output. Safe to call while playing. */
async function applyAudioOutput() {
  const ctx = getAudioContext();
  const output = metronomeValues.audioOutput;
  if (!ctx || !output || typeof ctx.setSinkId !== 'function') return;
  try {
    await ctx.setSinkId(output);
  } catch (err) {
    console.error('[metronome] could not select audio output', err);
  }
}

let scheduleTimeout = null;
/** Buffer sources scheduled but not yet finished, so `stop` can cut them off. */
const liveSources = new Set();
function scheduleNextNote(time = 0, beat = 1) {
  // changing tempo when active could cause many to play at once without this check
  if (scheduleTimeout) return;

  if (!clockStarted) {
    clockStarted = true;
    startTime = getAudioContext()?.currentTime ?? 0;
    playing = true;
    scheduleNote(beat);
    return;
  }

  if (beat > (metronomeValues.beats || defaultMetronomeValues.beats)) beat = 1;

  scheduleTimeout = setTimeout(
    () => {
      scheduleTimeout = null;
      scheduleNote(beat);
    },
    (time + timeBetweenEachBeat - preScheduleTime) * 1000
  );
  playing = true;
}

let beatsPlayed = 0;
function scheduleNote(beat) {
  beatsPlayed++;
  const timeUntilNextNote = getTimeToNextNote();

  // If the JS timer chain was starved (window hidden or occluded, a long GC, a
  // pegged CPU) the scheduled time is already in the past. FreeShow fires those
  // notes immediately, which recovers from a stall as a machine-gun burst — one
  // click per event-loop tick through the PA. Skip them and re-anchor instead.
  if (timeUntilNextNote < -timeBetweenEachBeat) {
    startTime = getAudioContext()?.currentTime ?? 0;
    beatsPlayed = 0;
    scheduleTimeout = setTimeout(() => {
      scheduleTimeout = null;
      scheduleNote(beat);
    }, preScheduleTime * 1000);
    return;
  }

  timer = { beat, timeToNext: timeUntilNextNote };
  emit();

  playNote(timeUntilNextNote, beat === 1);
  scheduleNextNote(timeUntilNextNote, beat + 1);
}

function getTimeToNextNote() {
  const ctx = getAudioContext();
  if (!ctx) return 0;

  const nextPlayTime = timeBetweenEachBeat * beatsPlayed;
  const timePassed = ctx.currentTime - startTime;

  return nextPlayTime - timePassed;
}

function playNote(time, first = false) {
  const ctx = getAudioContext();
  if (!ctx) return;

  const bufferId = resolveBufferId();
  const audioBuffer = audioBuffers[bufferId]?.[first ? 'hi' : 'lo'];
  if (!audioBuffer) return;

  const source = ctx.createBufferSource();
  source.buffer = audioBuffer;

  // volume control
  const gainNode = ctx.createGain();
  const audioChannel = metronomeValues.audioChannel || '';
  if (audioChannel === 'mono_left' || audioChannel === 'mono_right') {
    const merger = ctx.createChannelMerger(2);
    source.connect(gainNode);

    const channel = audioChannel === 'mono_left' ? 0 : 1;
    gainNode.connect(merger, 0, channel);

    merger.connect(ctx.destination);
  } else {
    // Stereo (default)
    source.connect(gainNode);
    gainNode.connect(ctx.destination);
  }

  // `GainNode.gain` is a read-only AudioParam attribute, so it has a getter and
  // no setter. Assigning to it throws a TypeError in strict mode — which ES
  // modules always are — and that killed `source.start()` below, leaving a
  // sweeping visualizer over a silent speaker. Set the param's value instead.
  gainNode.gain.value = getVolume(first ? accentVolume : secondaryVolume);

  // The output is selected once per start (see `applyAudioOutput`), so this
  // stays synchronous and `currentTime` is read at the intended moment rather
  // than after an await.
  source.start(ctx.currentTime + time);

  // The look-ahead means the next click is already queued in the audio graph.
  // Keep a handle so `stopMetronome` can silence it — at 60 BPM it is a full
  // second away, and the operator should not hear it after hitting stop.
  liveSources.add(source);
  source.onended = () => liveSources.delete(source);
}

function getVolume(beatVolume) {
  return beatVolume * (metronomeValues.volume || 1);
}

/** Test seam — jsdom implements neither of these. */
export function __resetMetronomeForTests() {
  runId++;
  if (scheduleTimeout) clearTimeout(scheduleTimeout);
  scheduleTimeout = null;
  metronomeValues = { ...defaultMetronomeValues };
  clickSoundSettings = { clickSound: 'metal', clickSound_hi: '', clickSound_lo: '' };
  showMetadata = null;
  playing = false;
  timer = { beat: 0, timeToNext: 0 };
  startTime = 0;
  beatsPlayed = 0;
  clockStarted = false;
  timeBetweenEachBeat = 0;
  bufferLoad = null;
  // Drop decoded samples and the context too, otherwise a pending start() from
  // an earlier test keeps the cache warm and the next test never re-fetches.
  Object.keys(audioBuffers).forEach((key) => delete audioBuffers[key]);
  audioContext = null;
  liveSources.clear();
  emit();
}
