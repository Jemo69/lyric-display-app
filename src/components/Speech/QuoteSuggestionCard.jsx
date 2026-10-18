/**
 * QuoteSuggestionCard.jsx — lane 4, the sermon quote (Phase 7).
 *
 * THREE PRESS-ACTIVATED ACTIONS, AND ONE OF THEM IS ABSENT ON PURPOSE.
 *
 *   Send to Free Note   the ONLY productive action. Lands in the existing
 *                       freeNotesDrafts shape.
 *   Copy                puts the text on the clipboard.
 *   Dismiss             the card goes away and NOTHING moves anywhere.
 *
 * There is NO send-to-output button. Not as a setting, not behind a
 * confidence threshold, not in a future phase.
 *
 * WHY, PRECISELY. This is the one card in the rail whose content is a model's
 * opinion about what the preacher meant to say. Every other lane proposes a
 * FACT the app can verify — a reference that resolves against an installed
 * translation, a lyric line that is literally on screen. A "quotable takeaway"
 * is none of those: it is a summarisation, and a wrong one is indistinguishable
 * from a right one at a glance. FreeShow makes this a projection target.
 *
 * The user said "suggest", and a suggestion an operator can review in a note is
 * a suggestion. A suggestion that reaches a congregation screen unreviewed is a
 * different thing entirely, and this feature will never be that thing.
 *
 * KEYBOARD. Alt+Q sends, Alt+X dismisses — declared in DEFAULT_BINDINGS so
 * they are rebindable in User Preferences, and registered HERE, by the card,
 * for as long as the card exists. With no quote on screen there is no send key
 * at all, which is the same rule the verse card follows: a press always names
 * something the operator can see.
 *
 * NOTHING RUNS AUTOMATICALLY. Translations, prompts, and buttons exist only
 * after the operator has a card to look at.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getHotkeyManager, formatForDisplay } from '@tanstack/hotkeys';
import useHotkeysStore from '../../context/HotkeysStore';
import useSpeechRuntimeStore from '../../context/SpeechRuntimeStore';
import { DEFAULT_BINDINGS } from '../../constants/hotkeyBindings';
import { toFreeNoteDraft } from '../../speech/sermonNote';

const buttonClass = (darkMode, tone) => {
  const base = 'rounded-md border px-3 py-1.5 text-xs font-semibold transition-colors';
  if (tone === 'primary') {
    return `${base} ${
      darkMode
        ? 'border-violet-500/50 bg-violet-500/10 text-violet-300 hover:bg-violet-500/20'
        : 'border-violet-400 bg-violet-50 text-violet-700 hover:bg-violet-100'
    }`;
  }
  return `${base} ${
    darkMode
      ? 'border-gray-700 bg-gray-900 text-gray-300 hover:bg-gray-800'
      : 'border-gray-300 bg-white text-gray-600 hover:bg-gray-50'
  }`;
};

/** Live binding with the shipped default as fallback. */
const resolveCombo = (bindings, id) =>
  bindings?.[id] || DEFAULT_BINDINGS[id] || '';

function QuoteCardHotkeys({ sendCombo, dismissCombo, onSend, onDismiss }) {
  const sendRef = useRef(onSend);
  const dismissRef = useRef(onDismiss);
  sendRef.current = onSend;
  dismissRef.current = onDismiss;

  useEffect(() => {
    const manager = getHotkeyManager();
    if (!manager) return undefined;

    const send = manager.register(
      { id: 'quoteSendToNote', combo: sendCombo, target: document.body },
      (event) => {
        event.preventDefault?.();
        sendRef.current?.();
      }
    );
    const dismiss = manager.register(
      { id: 'quoteDismiss', combo: dismissCombo, target: document.body },
      (event) => {
        event.preventDefault?.();
        dismissRef.current?.();
      }
    );

    return () => {
      manager.unregister?.('quoteSendToNote');
      manager.unregister?.('quoteDismiss');
    };
  }, [sendCombo, dismissCombo]);

  return null;
}

/**
 * @param {object} props
 * @param {object|null} props.suggestion { content, type, confidence, providerName }
 */
const QuoteSuggestionCard = ({ darkMode = false, suggestion = null }) => {
  const editNote = useSpeechRuntimeStore((state) => state.editNote);
  const dismissQuote = useSpeechRuntimeStore((state) => state.dismissQuote);

  const bindings = useHotkeysStore((state) => state.bindings);
  const sendCombo = resolveCombo(bindings, 'quoteSendToNote');
  const dismissCombo = resolveCombo(bindings, 'quoteDismiss');

  const [notice, setNotice] = useState(null);

  const content = suggestion?.content ?? '';
  const muted = darkMode ? 'text-gray-400' : 'text-gray-500';
  const titleClass = 'text-[11px] font-bold uppercase tracking-wider';

  const sendToNote = useCallback(() => {
    if (!content) return;
    // Folded into the RUNNING note rather than a separate draft, so the operator
    // ends the service with one document instead of fragments.
    //
    // `editNote` takes a PATCH ({ content }), not a note object — it applies the
    // patch to whatever note the store currently holds. Passing a whole note
    // object would spread its fields in as if they were the patch, which is how
    // the note silently stayed empty.
    const existing = useSpeechRuntimeStore.getState().note;
    const base = existing?.content ? `${existing.content}\n\n` : '';
    editNote({ content: `${base}> ${content}` });
    setNotice('Added to your sermon note.');
  }, [content, editNote]);

  const copy = useCallback(async () => {
    if (!content) return;
    try {
      await navigator.clipboard.writeText(content);
      setNotice('Copied.');
    } catch {
      // Clipboard permission denied. A notice, not an exception — this runs
      // during a service.
      setNotice('Could not copy to the clipboard.');
    }
  }, [content]);

  const dismiss = useCallback(() => {
    dismissQuote?.(content);
    setNotice(null);
  }, [dismissQuote, content]);

  // Clear a stale notice when the card's content changes underneath it.
  useEffect(() => {
    setNotice(null);
  }, [content]);

  const providerName = suggestion?.providerName;
  const showCombo = (combo) => (combo ? formatForDisplay(combo) : '');

  const actions = useMemo(
    () => [
      { id: 'send', label: 'Send to Free Note', combo: showCombo(sendCombo), primary: true, run: sendToNote },
      { id: 'copy', label: 'Copy', combo: '', primary: false, run: copy },
      { id: 'dismiss', label: 'Dismiss', combo: showCombo(dismissCombo), primary: false, run: dismiss },
    ],
    [sendToNote, copy, dismiss, sendCombo, dismissCombo]
  );

  if (!suggestion || !content) return null;

  return (
    <div
      data-testid="quote-suggestion-card"
      data-lane="quote"
      className="rounded-xl border border-violet-500/40 bg-violet-500/5 p-4 space-y-3"
    >
      <QuoteCardHotkeys
        sendCombo={sendCombo}
        dismissCombo={dismissCombo}
        onSend={sendToNote}
        onDismiss={dismiss}
      />

      <p className={titleClass}>Sermon quote — suggestion only</p>

      <blockquote
        data-testid="quote-content"
        className={`text-sm italic leading-snug ${darkMode ? 'text-gray-100' : 'text-gray-900'}`}
      >
        “{content}”
      </blockquote>

      {providerName ? (
        <p data-testid="quote-provider" className={`text-[11px] ${muted}`}>
          Suggested by {providerName}.
        </p>
      ) : null}

      {notice ? (
        <p data-testid="quote-notice" className={`text-[11px] ${muted}`}>
          {notice}
        </p>
      ) : null}

      {/*
        NO OUTPUT BUTTON. Not hidden by a flag, not disabled — absent.

        This card's content is a model's opinion about what the pastor meant to
        say, which is the one thing on this rail that cannot be verified against
        an installed translation or an on-screen lyric line. It goes to a note,
        where the operator reads it, or nowhere.
      */}
      <div className="flex flex-wrap gap-2 pt-1">
        {actions.map((action) => (
          <button
            key={action.id}
            type="button"
            data-testid={`quote-action-${action.id}`}
            onClick={action.run}
            className={buttonClass(darkMode, action.primary ? 'primary' : 'default')}
          >
            {action.label}
            {action.combo ? (
              <span className={`ml-1.5 text-[10px] font-normal ${muted}`}>{action.combo}</span>
            ) : null}
          </button>
        ))}
      </div>
    </div>
  );
};

export default QuoteSuggestionCard;