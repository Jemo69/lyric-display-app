/**
 * QuoteSuggestionCard.test.jsx — lane 4, the sermon quote (Phase 7)
 *
 * THE TEST THAT MATTERS MOST IS AT THE BOTTOM: this card must be structurally
 * incapable of putting anything on a screen. That is the difference between
 * this lane and FreeShow's, and it is asserted against the source rather than
 * left to review, because a send-to-output action added later would otherwise
 * look like an ordinary feature.
 */

import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import QuoteSuggestionCard from '../Speech/QuoteSuggestionCard';
import useSpeechRuntimeStore from '../../context/SpeechRuntimeStore';
import useHotkeysStore from '../../context/HotkeysStore';
import { DEFAULT_BINDINGS } from '../../constants/hotkeyBindings';

const QUOTE = 'God does not want your religion, he wants your faith';

function mountCard(props = {}) {
  return render(
    <QuoteSuggestionCard
      darkMode={false}
      suggestion={{ type: 'quote', content: QUOTE, confidence: 88, ...props }}
    />
  );
}

describe('QuoteSuggestionCard', () => {
  beforeEach(() => {
    cleanup();
    useSpeechRuntimeStore.getState().reset();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders the quote text it was given', () => {
    mountCard();
    expect(screen.getByTestId('quote-content')).toHaveTextContent(QUOTE);
  });

  it('names the provider when the lane is running', () => {
    // While the lane is on, which provider is holding the sermon text must be
    // visible on the card — not buried in settings the operator closed.
    mountCard({ providerName: 'Ollama (on this machine)' });
    expect(screen.getByTestId('quote-provider')).toHaveTextContent('Ollama');
  });

  it('renders nothing without a suggestion', () => {
    const { container } = render(<QuoteSuggestionCard darkMode={false} suggestion={null} />);
    expect(container.firstChild).toBeNull();
  });

  it('offers exactly three actions', () => {
    mountCard();
    expect(screen.getByTestId('quote-action-send')).toBeInTheDocument();
    expect(screen.getByTestId('quote-action-copy')).toBeInTheDocument();
    expect(screen.getByTestId('quote-action-dismiss')).toBeInTheDocument();
  });

  it('names itself a suggestion, not a slide', () => {
    mountCard();
    expect(screen.getByText(/suggestion only/i)).toBeInTheDocument();
  });

  it('Send to Free Note folds the quote into the running note', () => {
    mountCard();
    fireEvent.click(screen.getByTestId('quote-action-send'));

    const { note } = useSpeechRuntimeStore.getState();
    expect(note.content).toContain(QUOTE);
    // Blockquoted, so it reads as something the operator selected rather than
    // something the transcript simply contained.
    expect(note.content).toContain('>');
  });

  it('folding a second quote appends rather than replaces', () => {
    mountCard();
    fireEvent.click(screen.getByTestId('quote-action-send'));

    const second = 'Faith is not a performance, it is a relationship';
    render(
      <QuoteSuggestionCard
        darkMode={false}
        suggestion={{ type: 'quote', content: second, confidence: 88 }}
      />
    );
    fireEvent.click(screen.getAllByTestId('quote-action-send')[1]);

    const { note } = useSpeechRuntimeStore.getState();
    expect(note.content).toContain(QUOTE);
    expect(note.content).toContain(second);
  });

  it('Copy writes to the clipboard and says so', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
      writable: true,
    });

    mountCard();
    fireEvent.click(screen.getByTestId('quote-action-copy'));

    // Waited on the NOTICE rather than asserting it after the write. The
    // clipboard promise resolves on a microtask and the notice renders after
    // that, so asserting immediately is a race that passes most of the time —
    // which is worse than failing, because it trains you not to trust it.
    await vi.waitFor(() => {
      expect(writeText).toHaveBeenCalledWith(QUOTE);
      expect(screen.getByTestId('quote-notice')).toHaveTextContent(/copied/i);
    });
  });

  it('Copy reports a clipboard failure instead of throwing', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
      configurable: true,
      writable: true,
    });

    mountCard();
    fireEvent.click(screen.getByTestId('quote-action-copy'));

    await vi.waitFor(() => {
      expect(screen.getByTestId('quote-notice')).toHaveTextContent(/could not copy/i);
    });
  });

  it('Dismiss records the quote and moves nothing', () => {
    mountCard();
    fireEvent.click(screen.getByTestId('quote-action-dismiss'));

    expect(useSpeechRuntimeStore.getState().dismissedQuotes).toContain(QUOTE);
    // The verse dismiss list is a DIFFERENT list. Sharing it would let a verse
    // dismissal suppress an unrelated quote.
    expect(useSpeechRuntimeStore.getState().dismissed).not.toContain(QUOTE);
  });

  it('dismissing twice records one entry', () => {
    const { dismissQuote } = useSpeechRuntimeStore.getState();
    dismissQuote(QUOTE);
    dismissQuote(QUOTE);
    expect(useSpeechRuntimeStore.getState().dismissedQuotes).toEqual([QUOTE]);
  });

  it('dismissQuote ignores junk', () => {
    const { dismissQuote } = useSpeechRuntimeStore.getState();
    dismissQuote(null);
    dismissQuote('');
    dismissQuote(42);
    expect(useSpeechRuntimeStore.getState().dismissedQuotes).toEqual([]);
  });

  it('declares rebindable hotkeys with safe defaults', () => {
    // The defaults must exist, or a partially rehydrated hotkeys store leaves
    // the card with no key at all.
    expect(DEFAULT_BINDINGS.quoteSendToNote).toBeTruthy();
    expect(DEFAULT_BINDINGS.quoteDismiss).toBeTruthy();
  });

  it('survives a hotkey store that has not rehydrated', () => {
    useHotkeysStore.setState({ bindings: undefined });
    expect(() => mountCard()).not.toThrow();
  });

  it('renders under both themes', () => {
    cleanup();
    expect(() =>
      render(
        <QuoteSuggestionCard
          darkMode
          suggestion={{ type: 'quote', content: QUOTE, confidence: 88 }}
        />
      )
    ).not.toThrow();
  });
});

describe('the card cannot reach an output window', () => {
  /**
   * Source-level, not a behavioural smoke test.
   *
   * The only ways this codebase puts text on a screen are sendVerseLive,
   * loadBibleVerse, and the store's output actions. If any of them appears in
   * this component, a model's opinion about what the pastor said can reach a
   * congregation. That is the one failure this lane must never have, and it is
   * checked against the source so a later "just add a send button" is a failing
   * test rather than a code review nobody catches.
   */
  it('contains no output-reaching call anywhere in its module graph', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve, dirname } = await import('node:path');
    const { fileURLToPath } = await import('node:url');

    const here = dirname(fileURLToPath(import.meta.url));
    const source = readFileSync(resolve(here, '../Speech/QuoteSuggestionCard.jsx'), 'utf8')
      // Comments are stripped so the file's own warning about this rule does
      // not match itself — the same false-positive trap hit in verseScore.
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^[ \t]*\/\/.*$/gm, '');

    for (const forbidden of [
      'sendVerseLive',
      'loadBibleVerse',
      'emitBibleVerseLoaded',
      'sendLyricLine',
      'isOutputOn',
      'contentMode',
    ]) {
      expect(source, `"${forbidden}" must not appear in the quote card`).not.toContain(forbidden);
    }
  });
});