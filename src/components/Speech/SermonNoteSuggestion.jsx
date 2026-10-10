/**
 * SermonNoteSuggestion.jsx — lane 3, the running sermon note.
 *
 * A draft the rail keeps from SETTLED segments only (partials and
 * gate-discarded segments are never appended), editable inline because there
 * is no summarisation model here — the operator sees exactly what the
 * transcript produced and fixes anything that is wrong.
 *
 * SEND = "Send to Free Notes" lands it in the existing `freeNotesDrafts`
 * shape via `saveFreeNoteDraft(toFreeNoteDraft(note))`. It is a draft save,
 * not a projection: no output receives anything, contentMode does not change,
 * and nothing is emitted. The feedback line says that out loud so the operator
 * never has to guess which press moves a screen.
 */
import React, { useState } from 'react';
import useSpeechRuntimeStore from '../../context/SpeechRuntimeStore';
import { sendSermonNote } from '../../hooks/useSpeechRuntime';

const SermonNoteSuggestion = ({ darkMode = false, note = null }) => {
  const editNote = useSpeechRuntimeStore((state) => state.editNote);
  const [saved, setSaved] = useState(false);

  if (!note) return null;

  const muted = darkMode ? 'text-gray-400' : 'text-gray-500';

  const onChange = (event) => {
    editNote({ content: event.target.value });
    setSaved(false);
  };

  const send = () => {
    if (sendSermonNote(note)) setSaved(true);
  };

  return (
    <div
      data-testid="suggestion-note"
      className={`rounded-lg border p-3 space-y-2 ${
        darkMode ? 'border-gray-800 bg-gray-950/40' : 'border-gray-200 bg-gray-50'
      }`}
    >
      <p className={`text-[11px] font-bold uppercase tracking-wider ${muted}`}>Sermon note</p>

      <textarea
        data-testid="sermon-note-input"
        aria-label="Sermon note draft"
        value={note.content}
        onChange={onChange}
        rows={5}
        className={`w-full resize-y rounded-md border px-2 py-1.5 text-xs leading-relaxed ${
          darkMode
            ? 'border-gray-700 bg-gray-950 text-gray-200'
            : 'border-gray-300 bg-white text-gray-800'
        }`}
      />

      <div className="flex items-center gap-2">
        <button
          type="button"
          data-testid="sermon-note-send"
          onClick={send}
          className={`rounded-md border px-3 py-1.5 text-xs font-semibold transition-colors ${
            darkMode
              ? 'border-blue-500/50 bg-blue-500/10 text-blue-300 hover:bg-blue-500/20'
              : 'border-blue-400 bg-blue-50 text-blue-700 hover:bg-blue-100'
          }`}
        >
          Send to Free Notes
        </button>
        <span className={`text-[11px] ${muted}`}>
          Saves a draft. No output changes.
        </span>
      </div>

      {saved ? (
        <p data-testid="sermon-note-feedback" role="status" className={`text-xs ${muted}`}>
          Saved to Free Notes drafts.
        </p>
      ) : null}
    </div>
  );
};

export default SermonNoteSuggestion;
