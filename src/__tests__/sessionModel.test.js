import { describe, it, expect, beforeEach } from 'vitest';
import useLyricsStore from '../context/LyricsStore';
import { CONTENT_MODE_SONG, CONTENT_MODE_BIBLE } from '../utils/contentMode.js';

describe('sessionModel', () => {
  beforeEach(() => {
    // reset store to initial
    useLyricsStore.setState({
      contentMode: 'song',
      lyricsFileName: '',
      bibleVersion: '',
      displayLabel: '',
      session: undefined,
      _persistVersion: undefined,
    });
    // force migrate
    const s = useLyricsStore.getState();
    // trigger hydration logic manually by calling persist rehydrate handler if needed
  });

  it('selectMode writes bible and song atomically', () => {
    const store = useLyricsStore.getState();
    store.selectMode('bible');
    expect(useLyricsStore.getState().contentMode).toBe(CONTENT_MODE_BIBLE);
    expect(useLyricsStore.getState().session.contentMode).toBe(CONTENT_MODE_BIBLE);
    expect(useLyricsStore.getState().session.leftPanel.view).toBe('bible');
    store.selectMode('song');
    expect(useLyricsStore.getState().contentMode).toBe(CONTENT_MODE_SONG);
    expect(useLyricsStore.getState().session.leftPanel.view).toBe('songs');
  });

  it('loadBibleVerse is atomic — no transient song', () => {
    const store = useLyricsStore.getState();
    store.selectMode('song');
    expect(store.contentMode).toBe('song');
    // simulate picking bible verse without second tab click
    store.loadBibleVerse({
      reference: 'John 3:16',
      text: 'For God so loved',
      fullText: 'For God so loved the world',
      slides: ['For God so loved'],
      slideIndex: 0,
      bible: 'KJV',
      bibleId: 'KJV',
    });
    const after = useLyricsStore.getState();
    expect(after.contentMode).toBe(CONTENT_MODE_BIBLE);
    expect(after.lyricsFileName).toBe('John 3:16');
    expect(after.bibleVersion).toBe('KJV');
    expect(after.session.activeContent.reference).toBe('John 3:16');
  });

  it('filename echo cannot change mode', () => {
    const store = useLyricsStore.getState();
    store.selectMode('bible');
    store.loadBibleVerse({
      reference: 'Genesis 1:1',
      text: 'In the beginning',
      slides: ['In the beginning'],
      bible: 'ESV',
    });
    expect(useLyricsStore.getState().contentMode).toBe(CONTENT_MODE_BIBLE);
    // socket filename echo (label-only) should not flip to song
    useLyricsStore.getState().setLyricsFileName('Some Song Title');
    expect(useLyricsStore.getState().contentMode).toBe(CONTENT_MODE_BIBLE);
    expect(useLyricsStore.getState().bibleVersion).toBe('ESV');
    // even multiple echoes
    useLyricsStore.getState().setLyricsFileName('Another Song');
    expect(useLyricsStore.getState().contentMode).toBe(CONTENT_MODE_BIBLE);
  });

  it('loadSong sets song mode atomically', () => {
    const store = useLyricsStore.getState();
    store.selectMode('bible');
    store.loadSong({
      title: 'Amazing Grace',
      fileName: 'Amazing Grace',
      rawText: 'Amazing grace how sweet',
      lines: ['Amazing grace how sweet'],
      metadata: { title: 'Amazing Grace' },
    });
    const after = useLyricsStore.getState();
    expect(after.contentMode).toBe(CONTENT_MODE_SONG);
    expect(after.bibleVersion).toBe('');
    expect(after.session.activeContent.kind).toBe('song');
  });

  it('setLyricsFileName is label-only — never decides mode', () => {
    const store = useLyricsStore.getState();
    store.selectMode('song');
    store.setLyricsFileName('Bible Reference Like John 3:16');
    expect(useLyricsStore.getState().contentMode).toBe(CONTENT_MODE_SONG);
    store.selectMode('bible');
    store.setLyricsFileName('Another Label');
    expect(useLyricsStore.getState().contentMode).toBe(CONTENT_MODE_BIBLE);
  });
});
