import useLyricsStore from '../../context/LyricsStore';
import { useOnboardStore } from '../../context/OnboardStore';

const line = (t) => t;

export const DEMO_SONGS = [
  {
    fileName: 'Amazing Grace (Demo)',
    rawText: [
      'Amazing grace how sweet the sound',
      'That saved a wretch like me',
      '',
      'I once was lost but now am found',
      'Was blind but now I see',
      '',
      "'Twas grace that taught my heart to fear",
      'And grace my fears relieved',
      '',
      'How precious did that grace appear',
      'The hour I first believed',
    ].join('\n'),
  },
  {
    fileName: '10,000 Reasons (Demo Chorus)',
    rawText: [
      "Bless the Lord oh my soul",
      'Oh my soul',
      '',
      'Worship His Holy name',
      'Sing like never before',
      'Oh my soul',
      "I'll worship Your Holy name",
    ].join('\n'),
  },
];

export const DEMO_NOTE = {
  title: 'Welcome (Demo Note)',
  rawText: [
    'Welcome to Selah demo service!',
    '',
    'Please silence your phones.',
    'Kids check-in is in the foyer.',
  ].join('\n'),
};

function toSlides(rawText) {
  return rawText.split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean);
}

/** Load a ready-made mini service: 2 songs + note staged, setlist filled. */
export function loadDemoService() {
  const store = useLyricsStore.getState();
  const onboard = useOnboardStore.getState();

  const first = DEMO_SONGS[0];
  const slides = toSlides(first.rawText);
  if (store.loadSong) {
    store.loadSong({ fileName: first.fileName, rawText: first.rawText, lines: slides, selectedLine: 0 });
  } else {
    store.setLyrics?.(slides);
    store.setRawLyricsContent?.(first.rawText);
    store.setLyricsFileName?.(first.fileName);
    store.selectLine?.(0);
  }

  const now = Date.now();
  const files = [...DEMO_SONGS.map((s, i) => ({
    id: `demo-song-${i}`,
    displayName: s.fileName,
    name: `${s.fileName}.txt`,
    content: s.rawText,
    lastModified: now,
  })), {
    id: 'demo-note',
    displayName: DEMO_NOTE.title,
    name: `${DEMO_NOTE.title}.txt`,
    content: DEMO_NOTE.rawText,
    lastModified: now,
    metadata: { type: 'freenote' },
  }];
  store.setSetlistFiles?.(files);

  onboard.setDemoLoaded(true);
  onboard.completeTask('load');
  onboard.logAction('Loaded demo service (2 songs + welcome note + setlist)');
}

export function clearDemoService() {
  const store = useLyricsStore.getState();
  store.setSetlistFiles?.([]);
  useOnboardStore.getState().setDemoLoaded(false);
}

export { line };
