import { describe, it, expect, beforeEach } from 'vitest';
import {
  normalizeShowState,
  isValidShowState,
  showStateToMasterOn,
  masterOnToShowState,
  applyMasterToggleToShowState,
  describeShowState,
  sanitizeTickerText,
  createTickerItem,
  addTickerItem,
  removeTickerItem,
  clearTickerQueue,
  resolveTickerActive,
  resolveTickerForOutput,
  isTickerForOutput,
  TICKER_MAX_QUEUE,
} from '../../shared/showControl.js';
import useLyricsStore from '../context/LyricsStore';

describe('showControl state machine', () => {
  it('normalizes known states case-insensitively', () => {
    expect(normalizeShowState('live')).toBe('LIVE');
    expect(normalizeShowState(' Clear ')).toBe('CLEAR');
    expect(normalizeShowState('blackout')).toBe('BLACKOUT');
    expect(normalizeShowState('LOGO')).toBe('LOGO');
  });

  it('falls back for unknown values', () => {
    expect(normalizeShowState('nope')).toBe('LIVE');
    expect(normalizeShowState(undefined)).toBe('LIVE');
    expect(normalizeShowState(null, 'BLACKOUT')).toBe('BLACKOUT');
    expect(isValidShowState('CLEAR')).toBe(true);
    expect(isValidShowState('bogus')).toBe(false);
  });

  it('maps legacy master toggle: only LIVE is ON', () => {
    expect(showStateToMasterOn('LIVE')).toBe(true);
    expect(showStateToMasterOn('CLEAR')).toBe(false);
    expect(showStateToMasterOn('BLACKOUT')).toBe(false);
    expect(showStateToMasterOn('LOGO')).toBe(false);
  });

  it('maps legacy toggle input back to states', () => {
    expect(masterOnToShowState(true)).toBe('LIVE');
    expect(masterOnToShowState(false)).toBe('BLACKOUT');
    expect(masterOnToShowState('true')).toBe('LIVE');
    expect(masterOnToShowState('0')).toBe('BLACKOUT');
  });

  it('legacy OFF preserves an explicit CLEAR/LOGO choice', () => {
    expect(applyMasterToggleToShowState('LIVE', false)).toBe('BLACKOUT');
    expect(applyMasterToggleToShowState('CLEAR', false)).toBe('CLEAR');
    expect(applyMasterToggleToShowState('LOGO', false)).toBe('LOGO');
    expect(applyMasterToggleToShowState('BLACKOUT', false)).toBe('BLACKOUT');
    expect(applyMasterToggleToShowState('CLEAR', true)).toBe('LIVE');
  });

  it('describes every state with label + hint', () => {
    for (const state of ['LIVE', 'CLEAR', 'BLACKOUT', 'LOGO']) {
      const meta = describeShowState(state);
      expect(meta.state).toBe(state);
      expect(typeof meta.label).toBe('string');
      expect(meta.label.length).toBeGreaterThan(0);
      expect(typeof meta.hint).toBe('string');
      expect(meta.hint.length).toBeGreaterThan(0);
    }
  });
});

describe('announcement ticker queue', () => {
  it('sanitizes text (trim + length cap)', () => {
    expect(sanitizeTickerText('  hello  ')).toBe('hello');
    expect(sanitizeTickerText('x'.repeat(500)).length).toBeLessThanOrEqual(280);
    expect(sanitizeTickerText(null)).toBe('');
  });

  it('creates items with unique ids', () => {
    const a = createTickerItem('Welcome');
    const b = createTickerItem('Welcome');
    expect(a.text).toBe('Welcome');
    expect(a.id).not.toBe(b.id);
    expect(() => createTickerItem('   ')).toThrow();
  });

  it('activates the first item automatically', () => {
    const { queue, added, activateId } = addTickerItem([], 'First');
    expect(queue).toHaveLength(1);
    expect(added.text).toBe('First');
    expect(activateId).toBe(added.id);
    const second = addTickerItem(queue, 'Second');
    expect(second.queue).toHaveLength(2);
    expect(second.activateId).toBeUndefined();
  });

  it('rejects empty text and a full queue', () => {
    expect(() => addTickerItem([], '  ')).toThrow();
    const full = Array.from({ length: TICKER_MAX_QUEUE }, (_, i) => ({
      id: `id-${i}`,
      text: `item ${i}`,
      createdAt: Date.now(),
    }));
    expect(() => addTickerItem(full, 'overflow')).toThrow();
  });

  it('removes and clears', () => {
    const first = addTickerItem([], 'One');
    const both = addTickerItem(first.queue, 'Two');
    const removed = removeTickerItem(both.queue, first.added.id);
    expect(removed.queue).toHaveLength(1);
    expect(removed.queue[0].text).toBe('Two');
    expect(clearTickerQueue()).toEqual({ queue: [], activeId: null });
  });

  it('resolves the active overlay item', () => {
    expect(resolveTickerActive([], null)).toBeNull();
    const { queue, added } = addTickerItem([], 'Head');
    expect(resolveTickerActive(queue, null).id).toBe(added.id);
    expect(resolveTickerActive(queue, 'missing-id').id).toBe(added.id);
    expect(resolveTickerActive(queue, added.id).id).toBe(added.id);
  });

  it('routes targeted announcements while keeping legacy items global', () => {
    const { queue, added } = addTickerItem([], 'Output 2 only', { targetOutput: 'output2' });
    expect(added.targetOutput).toBe('output2');
    expect(isTickerForOutput(added, 'output2')).toBe(true);
    expect(isTickerForOutput(added, 'output1')).toBe(false);
    expect(resolveTickerForOutput(queue, added.id, 'output2')?.id).toBe(added.id);
    expect(resolveTickerForOutput(queue, added.id, 'output1')).toBeNull();

    const legacy = createTickerItem('Legacy announcement');
    expect(legacy.targetOutput).toBeUndefined();
    expect(isTickerForOutput(legacy, 'output1')).toBe(true);
    expect(isTickerForOutput(legacy, 'stage')).toBe(true);
  });
});

describe('LyricsStore show-control integration', () => {
  beforeEach(() => {
    useLyricsStore.setState({
      isOutputOn: true,
      showState: 'LIVE',
      tickerQueue: [],
      tickerActiveId: null,
    });
  });

  it('setShowState drives the legacy master flag', () => {
    const store = useLyricsStore.getState();
    store.setShowState('CLEAR');
    expect(useLyricsStore.getState().showState).toBe('CLEAR');
    expect(useLyricsStore.getState().isOutputOn).toBe(false);
    store.setShowState('LOGO');
    expect(useLyricsStore.getState().isOutputOn).toBe(false);
    store.setShowState('LIVE');
    expect(useLyricsStore.getState().isOutputOn).toBe(true);
  });

  it('legacy setIsOutputOn maps onto the machine without breaking callers', () => {
    const store = useLyricsStore.getState();
    store.setIsOutputOn(false);
    expect(useLyricsStore.getState().showState).toBe('BLACKOUT');
    store.setIsOutputOn(true);
    expect(useLyricsStore.getState().showState).toBe('LIVE');
    // turning OFF from CLEAR preserves the explicit choice
    store.setShowState('CLEAR');
    store.setIsOutputOn(false);
    expect(useLyricsStore.getState().showState).toBe('CLEAR');
    expect(useLyricsStore.getState().isOutputOn).toBe(false);
  });

  it('ticker state round-trips through the store', () => {
    const store = useLyricsStore.getState();
    store.setTickerState([{ id: 'a', text: 'Hello', createdAt: 1 }], 'a');
    expect(useLyricsStore.getState().tickerQueue).toHaveLength(1);
    expect(useLyricsStore.getState().tickerActiveId).toBe('a');
    store.setTickerState([], null);
    expect(useLyricsStore.getState().tickerQueue).toHaveLength(0);
  });
});
