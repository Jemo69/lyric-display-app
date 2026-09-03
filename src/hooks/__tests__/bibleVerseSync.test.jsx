import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import useSocketEvents from '../useSocketEvents';
import useLyricsStore from '../../context/LyricsStore';

function makeSocket() {
  const handlers = {};
  return {
    handlers,
    on: (event, fn) => {
      (handlers[event] = handlers[event] || []).push(fn);
    },
    off: () => {},
    emit: () => {},
    connected: true,
  };
}

function fire(socket, event, payload) {
  (socket.handlers[event] || []).forEach((fn) => fn(payload));
}

const REF = 'John 3:16';
const BODY = 'For God so loved the world, that he gave his only begotten Son';
const LINES = [`${BODY}\n\n${REF}`];
const PAYLOAD = { reference: REF, bible: 'KJV', slideIndex: 0, slides: [BODY], text: BODY };

// Server fan-out order for one bibleVerseLoaded from control:
// lyricsLoad -> lineUpdate -> fileNameUpdate -> bibleVerseLoaded ->
// contentModeUpdate -> lyricsSectionsUpdate (+ async styleUpdates)
function driveVerseClick(socket) {
  fire(socket, 'lyricsLoad', LINES);
  fire(socket, 'lineUpdate', { index: 0 });
  fire(socket, 'fileNameUpdate', REF);
  fire(socket, 'bibleVerseLoaded', PAYLOAD);
  fire(socket, 'contentModeUpdate', { mode: 'bible', bibleVersion: 'KJV', fileName: REF });
  fire(socket, 'lyricsSectionsUpdate', { sections: [], lineToSection: {} });
}

describe('bible verse socket sync (output displays)', () => {
  beforeEach(() => {
    useLyricsStore.setState({
      lyrics: [],
      selectedLine: null,
      lyricsFileName: '',
      displayLabel: '',
      bibleVersion: '',
      contentMode: 'song',
    });
  });

  it('keeps the verse body after a full verse-click broadcast sequence', () => {
    const { result } = renderHook(() => useSocketEvents('output1'));
    const socket = makeSocket();
    act(() => {
      result.current.setupApplicationEventHandlers(socket, 'output1', false);
    });
    act(() => {
      driveVerseClick(socket);
    });
    const st = useLyricsStore.getState();
    expect(st.lyricsFileName).toBe(REF);
    expect(st.lyrics).toHaveLength(1);
    expect(st.lyrics[0]).toContain(BODY);
  });

  it('keeps the verse body on the control panel echo path too', () => {
    const { result } = renderHook(() => useSocketEvents('control'));
    const socket = makeSocket();
    act(() => {
      result.current.setupApplicationEventHandlers(socket, 'desktop', true);
    });
    // control panel already applied loadBibleVerse locally, then echoes arrive
    act(() => {
      useLyricsStore.getState().loadBibleVerse({
        reference: REF,
        text: BODY,
        fullText: BODY,
        slides: [BODY],
        slideIndex: 0,
        bible: 'KJV',
        bibleId: 'KJV',
      });
    });
    act(() => {
      driveVerseClick(socket);
    });
    const st = useLyricsStore.getState();
    expect(st.lyricsFileName).toBe(REF);
    expect(st.lyrics[0]).toContain(BODY);
  });
});
