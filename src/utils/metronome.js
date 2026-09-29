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

  initializeMetronome();
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
  const bpmKey = Object.keys(metadata).find((key) => key.toLowerCase().includes('bpm')) || 'BPM';
  return Math.floor(parseFloat(metadata[bpmKey] || 0)) || defaultMetronomeValues.tempo;
}

/** Feed the currently loaded song's metadata in so `metadataBPM` can read it. */
export function setShowMetadata(metadata) {
  showMetadata = metadata || null;
}

export function updateMetronome(values = {}, starting = false) {
  const next = { ...values };

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

  emit();
}

export function updateClickSound(next = {}) {
  clickSoundSettings = { ...clickSoundSettings, ...next };
  // Changing the sample needs a fresh beat clock.
  if (playing) startMetronome({});
  else emit();
}

export function stopMetronome() {
  if (scheduleTimeout) clearTimeout(scheduleTimeout);
  scheduleTimeout = null;
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

async function initializeMetronome() {
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

  await setAudioBuffers();

  const beatsPerSecond = 60 / (metronomeValues.tempo || defaultMetronomeValues.tempo);
  timeBetweenEachBeat = beatsPerSecond;

  scheduleNextNote();
}

let scheduleTimeout = null;
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

async function playNote(time, first = false) {
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

  // custom audio output
  if (metronomeValues.audioOutput !== undefined) {
    try {
      await ctx.setSinkId(metronomeValues.audioOutput);
    } catch (err) {
      console.error(err);
    }
  }

  gainNode.gain = getVolume(first ? accentVolume : secondaryVolume);

  source.start(ctx.currentTime + time);
}

function getVolume(beatVolume) {
  return beatVolume * (metronomeValues.volume || 1);
}

/** Test seam — jsdom implements neither of these. */
export function __resetMetronomeForTests() {
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
  emit();
}
