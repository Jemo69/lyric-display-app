import React from 'react';

const TICKER_CSS = `
@keyframes ld-ticker-scroll {
  0% { transform: translateX(100%); }
  100% { transform: translateX(-100%); }
}
.ld-ticker-track {
  display: inline-block;
  white-space: nowrap;
  will-change: transform;
}
@media (prefers-reduced-motion: no-preference) {
  .ld-ticker-track-animate {
    animation: ld-ticker-scroll 18s linear infinite;
  }
}
`;

let tickerCssInjected = false;
function ensureTickerCss() {
  if (tickerCssInjected || typeof document === 'undefined') return;
  tickerCssInjected = true;
  const style = document.createElement('style');
  style.setAttribute('data-ld-ticker', 'true');
  style.textContent = TICKER_CSS;
  document.head.appendChild(style);
}

/**
 * Lower-third announcement overlay for output surfaces (feature #18).
 * Renders the active ticker item over the current lyric without disturbing
 * it. Hidden when there is no active item. Motion is disabled under
 * prefers-reduced-motion (static readable bar instead of scrolling).
 */
const TickerOverlay = ({ item, reduceMotion = false, testId = 'ticker-overlay' }) => {
  React.useEffect(() => {
    ensureTickerCss();
  }, []);

  if (!item || !item.text) return null;

  const long = String(item.text).length > 80;

  return (
    <div
      data-testid={testId}
      role="status"
      aria-live="polite"
      aria-label={`Announcement: ${item.text}`}
      className="pointer-events-none absolute inset-x-0 bottom-0 z-30 flex justify-center px-6 pb-6"
    >
      <div
        className="flex max-w-4xl items-center gap-3 overflow-hidden rounded-xl border-2 border-amber-300/80 bg-black/85 px-5 py-3 shadow-2xl"
      >
        <span
          className="shrink-0 rounded bg-amber-400 px-2 py-0.5 text-xs font-black uppercase tracking-widest text-black"
          aria-hidden="true"
        >
          Notice
        </span>
        <span className="min-w-0 flex-1 overflow-hidden text-center text-xl font-bold text-white md:text-2xl">
          {long && !reduceMotion ? (
            <span key={item.id} className="ld-ticker-track ld-ticker-track-animate">
              {item.text}
            </span>
          ) : (
            <span key={item.id}>{item.text}</span>
          )}
        </span>
      </div>
    </div>
  );
};

export default TickerOverlay;
