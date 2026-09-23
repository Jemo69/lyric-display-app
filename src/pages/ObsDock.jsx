import React, { useCallback, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { resolveBackendOrigin, resolveBackendUrl } from '../utils/network';
import { createLogger } from '../utils/logger.js';

const log = createLogger('ObsDock');

const DOCK_TOKEN_KEY = 'lyricdisplay:obs-dock:token';
const FOCUS_RING = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-black';

const StatusDot = ({ connected }) => (
  <span
    aria-hidden="true"
    className={`inline-block w-3 h-3 rounded-full ${connected ? 'bg-white' : 'bg-neutral-500'}`}
  />
);

const ObsDock = () => {
  const [pin, setPin] = useState('');
  const [authState, setAuthState] = useState('idle');
  const [authError, setAuthError] = useState('');
  const [connected, setConnected] = useState(false);
  const [lyrics, setLyrics] = useState([]);
  const [lyricsFileName, setLyricsFileName] = useState('');
  const [selectedLine, setSelectedLine] = useState(null);
  const [isOutputOn, setIsOutputOn] = useState(false);
  const socketRef = useRef(null);
  const listRef = useRef(null);
  const deviceIdRef = useRef('');

  if (!deviceIdRef.current) {
    deviceIdRef.current = `obs-dock-${Math.random().toString(36).slice(2, 10)}`;
  }

  const hasLyrics = Array.isArray(lyrics) && lyrics.length > 0;
  const currentLine = hasLyrics && selectedLine != null ? lyrics[selectedLine] : '';

  const teardownSocket = useCallback(() => {
    try { socketRef.current?.removeAllListeners(); } catch { /* noop */ }
    try { socketRef.current?.disconnect(); } catch { /* noop */ }
    socketRef.current = null;
    setConnected(false);
  }, []);

  const attachSocket = useCallback((token) => {
    teardownSocket();
    const socket = io(resolveBackendOrigin(), {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 10,
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      setConnected(true);
      socket.emit('clientConnect', { type: 'web' });
      socket.emit('requestCurrentState');
    });
    socket.on('disconnect', () => setConnected(false));
    socket.on('connect_error', (error) => {
      log.warn('OBS dock socket error:', error?.message || error);
      setConnected(false);
    });
    socket.on('authError', (message) => {
      setAuthError(typeof message === 'string' ? message : 'Session expired. Pair again with a new PIN.');
      setAuthState('idle');
      try { sessionStorage.removeItem(DOCK_TOKEN_KEY); } catch { /* noop */ }
      teardownSocket();
    });
    socket.on('currentState', (state) => {
      if (!state || typeof state !== 'object') return;
      if (Array.isArray(state.lyrics)) setLyrics(state.lyrics);
      if (typeof state.lyricsFileName === 'string') setLyricsFileName(state.lyricsFileName);
      if (typeof state.selectedLine === 'number' || state.selectedLine == null) setSelectedLine(state.selectedLine);
      if (typeof state.isOutputOn === 'boolean') setIsOutputOn(state.isOutputOn);
    });
    socket.on('lyricsLoad', (lines) => {
      if (Array.isArray(lines)) setLyrics(lines);
    });
    socket.on('fileNameUpdate', (name) => {
      if (typeof name === 'string') setLyricsFileName(name);
    });
    socket.on('lineUpdate', ({ index } = {}) => {
      if (typeof index === 'number') setSelectedLine(index);
    });
    socket.on('outputToggle', (state) => {
      setIsOutputOn(state === true || state === 'true' || state === 1);
    });
    return socket;
  }, [teardownSocket]);

  useEffect(() => {
    let saved = null;
    try { saved = sessionStorage.getItem(DOCK_TOKEN_KEY); } catch { /* noop */ }
    if (saved) {
      setAuthState('paired');
      attachSocket(saved);
    }
    return () => teardownSocket();
  }, [attachSocket, teardownSocket]);

  const handlePair = useCallback(async (event) => {
    event?.preventDefault();
    const cleanPin = String(pin).trim();
    if (!/^\d{6}$/.test(cleanPin)) {
      setAuthError('Enter the 6-digit PIN shown on the desktop app.');
      return;
    }
    setAuthState('pairing');
    setAuthError('');
    try {
      const response = await fetch(resolveBackendUrl('/api/auth/obs-dock/token'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: cleanPin, deviceId: deviceIdRef.current }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (response.status === 423) {
          setAuthError(`Too many wrong PINs. Try again in ${Math.ceil((data.retryAfterMs || 60000) / 1000)}s.`);
        } else {
          setAuthError(data.error || 'Pairing failed. Check the PIN and try again.');
        }
        setAuthState('idle');
        return;
      }
      try { sessionStorage.setItem(DOCK_TOKEN_KEY, data.token); } catch { /* noop */ }
      setAuthState('paired');
      attachSocket(data.token);
    } catch (error) {
      log.warn('OBS dock pairing failed:', error?.message || error);
      setAuthError('Could not reach the LyricDisplay server. Check the network and retry.');
      setAuthState('idle');
    }
  }, [pin, attachSocket]);

  const handleUnpair = useCallback(() => {
    try { sessionStorage.removeItem(DOCK_TOKEN_KEY); } catch { /* noop */ }
    teardownSocket();
    setPin('');
    setAuthState('idle');
  }, [teardownSocket]);

  const goToLine = useCallback((index) => {
    if (!hasLyrics) return;
    const clamped = Math.max(0, Math.min(lyrics.length - 1, index));
    setSelectedLine(clamped);
    try { socketRef.current?.emit('lineUpdate', { index: clamped }); } catch { /* noop */ }
  }, [hasLyrics, lyrics.length]);

  const handlePrev = useCallback(() => {
    if (selectedLine == null) return goToLine(0);
    goToLine(selectedLine - 1);
  }, [selectedLine, goToLine]);

  const handleNext = useCallback(() => {
    if (selectedLine == null) return goToLine(0);
    goToLine(selectedLine + 1);
  }, [selectedLine, goToLine]);

  const handleToggleOutput = useCallback(async () => {
    const next = !isOutputOn;
    setIsOutputOn(next);
    try { socketRef.current?.emit('outputToggle', next); } catch { /* noop */ }
    try {
      const token = sessionStorage.getItem(DOCK_TOKEN_KEY);
      if (token) {
        await fetch(resolveBackendUrl('/api/v1/output/toggle'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ on: next }),
        });
      }
    } catch { /* socket already carries the toggle; REST is best-effort */ }
  }, [isOutputOn]);

  useEffect(() => {
    if (!listRef.current || selectedLine == null) return;
    const el = listRef.current.children[selectedLine];
    if (el) el.scrollIntoView({ block: 'nearest' });
  }, [selectedLine]);

  useEffect(() => {
    const handler = (e) => {
      if (authState !== 'paired') return;
      if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') { e.preventDefault(); handlePrev(); }
      else if (e.key === 'ArrowDown' || e.key === 'ArrowRight') { e.preventDefault(); handleNext(); }
      else if (e.key === ' ') { e.preventDefault(); handleToggleOutput(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [authState, handlePrev, handleNext, handleToggleOutput]);

  return (
    <div className="flex flex-col h-screen bg-black text-white select-none">
      <header className="flex items-center justify-between gap-2 px-3 py-2 border-b-2 border-white flex-shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <StatusDot connected={connected} />
          <span className="text-sm font-bold truncate" role="status" aria-label={connected ? 'Connected to server' : 'Disconnected from server'}>
            {connected ? 'CONNECTED' : 'OFFLINE'}
          </span>
          {authState === 'paired' && (
            <span className="text-xs text-neutral-300 truncate hidden sm:inline">
              {lyricsFileName || 'No song'}
            </span>
          )}
        </div>
        {authState === 'paired' ? (
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              type="button"
              onClick={handleToggleOutput}
              aria-pressed={isOutputOn}
              aria-label={isOutputOn ? 'Turn output off' : 'Turn output on'}
              className={`px-4 py-2 min-h-[48px] rounded-lg text-sm font-black tracking-wide border-2 border-white ${FOCUS_RING} ${isOutputOn ? 'bg-white text-black' : 'bg-black text-white'}`}
            >
              {isOutputOn ? '● OUTPUT ON' : '○ OUTPUT OFF'}
            </button>
            <button
              type="button"
              onClick={handleUnpair}
              aria-label="Unpair this dock"
              className={`px-3 py-2 min-h-[48px] rounded-lg text-xs font-bold border-2 border-neutral-500 text-neutral-300 ${FOCUS_RING}`}
            >
              UNPAIR
            </button>
          </div>
        ) : (
          <span className="text-xs font-bold tracking-widest text-neutral-300">OBS DOCK</span>
        )}
      </header>

      {authState !== 'paired' ? (
        <main className="flex-1 flex flex-col items-center justify-center gap-4 px-6 text-center">
          <h1 className="text-xl font-black tracking-wide">PAIR OBS DOCK</h1>
          <p className="text-sm text-neutral-300 max-w-[320px]">
            Enter the 6-digit PIN shown on the desktop app to control lyrics from inside OBS.
          </p>
          <form onSubmit={handlePair} className="flex flex-col items-center gap-3 w-full max-w-[280px]">
            <label htmlFor="obs-dock-pin" className="text-xs font-bold tracking-widest text-neutral-300">
              6-DIGIT PIN
            </label>
            <input
              id="obs-dock-pin"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="000000"
              aria-describedby={authError ? 'obs-dock-pin-error' : undefined}
              className={`w-full text-center text-3xl font-black tracking-[0.3em] bg-neutral-900 border-2 border-white rounded-lg py-3 min-h-[56px] ${FOCUS_RING}`}
            />
            {authError && (
              <p id="obs-dock-pin-error" role="alert" className="text-sm font-bold text-white border-2 border-white rounded-lg px-3 py-2">
                ⚠ {authError}
              </p>
            )}
            <button
              type="submit"
              disabled={authState === 'pairing'}
              className={`w-full py-3 min-h-[52px] rounded-lg text-base font-black tracking-wide bg-white text-black disabled:opacity-50 ${FOCUS_RING}`}
            >
              {authState === 'pairing' ? 'PAIRING…' : 'PAIR DOCK'}
            </button>
          </form>
        </main>
      ) : (
        <>
          <div className="flex-shrink-0 px-3 py-4 min-h-[96px] flex items-center justify-center border-b-2 border-white" aria-live="polite">
            {hasLyrics && currentLine ? (
              <p className="text-2xl font-black text-center leading-snug">{currentLine}</p>
            ) : (
              <p className="text-base text-neutral-400 text-center">No lyrics loaded — load a song on the desktop app.</p>
            )}
          </div>

          <div className="flex items-center justify-center gap-3 px-3 py-3 flex-shrink-0">
            <button
              type="button"
              onClick={handlePrev}
              disabled={!hasLyrics || selectedLine == null || selectedLine <= 0}
              aria-label="Previous line"
              className={`flex-1 py-4 min-h-[56px] rounded-lg text-lg font-black border-2 border-white disabled:opacity-30 ${FOCUS_RING} bg-neutral-900`}
            >
              ◀ PREV
            </button>
            <button
              type="button"
              onClick={handleNext}
              disabled={!hasLyrics || (selectedLine != null && selectedLine >= lyrics.length - 1)}
              aria-label="Next line"
              className={`flex-1 py-4 min-h-[56px] rounded-lg text-lg font-black border-2 border-white disabled:opacity-30 ${FOCUS_RING} bg-white text-black`}
            >
              NEXT ▶
            </button>
          </div>

          <div ref={listRef} className="flex-1 overflow-y-auto px-3 pb-4 flex flex-col gap-2" role="listbox" aria-label="Lyrics lines">
            {hasLyrics ? lyrics.map((line, index) => {
              const active = index === selectedLine;
              return (
                <button
                  key={index}
                  type="button"
                  role="option"
                  aria-selected={active}
                  aria-current={active ? 'true' : undefined}
                  onClick={() => goToLine(index)}
                  className={`w-full text-left px-3 py-3 min-h-[52px] rounded-lg text-base font-bold border-2 ${FOCUS_RING} ${active ? 'bg-white text-black border-white' : 'bg-neutral-900 text-white border-neutral-600'}`}
                >
                  <span className="mr-2 text-xs font-black opacity-70">{active ? '▶' : `${index + 1}`}</span>
                  {line || <span className="opacity-50">(blank)</span>}
                </button>
              );
            }) : (
              <p className="text-sm text-neutral-400 text-center py-6">Lyrics will appear here once paired and loaded.</p>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default ObsDock;
