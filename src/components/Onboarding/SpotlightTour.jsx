import React, { useEffect, useState } from 'react';
import { X, ArrowLeft, ArrowRight } from 'lucide-react';
import { TOUR_STEPS } from './onboardingContent';
import { useOnboardStore } from '../../context/OnboardStore';

const STEP_TARGET = {
  library: '[data-onboard="library"]',
  live: '[data-onboard="live"]',
  lyrics: '[data-onboard="slides"]',
  outputs: '[data-onboard="outputs"]',
  show: '[data-onboard="show"]',
  setlist: '[data-onboard="toolbar"]',
  stream: '[data-onboard="toolbar"]',
  extras: '[data-onboard="toolbar"]',
};

export default function SpotlightTour({ darkMode, onClose }) {
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState(null);
  const setSpotlightDone = useOnboardStore((s) => s.setSpotlightDone);
  const logAction = useOnboardStore((s) => s.logAction);

  const step = TOUR_STEPS[index];

  useEffect(() => {
    const update = () => {
      const sel = STEP_TARGET[step.id];
      const el = sel ? document.querySelector(sel) : null;
      if (el) {
        const r = el.getBoundingClientRect();
        setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
        el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      } else {
        setRect(null);
      }
    };
    update();
    window.addEventListener('resize', update);
    const t = setTimeout(update, 300);
    return () => {
      window.removeEventListener('resize', update);
      clearTimeout(t);
    };
  }, [index, step.id]);

  const finish = () => {
    setSpotlightDone(true);
    logAction('Completed spotlight tour');
    onClose?.();
  };

  const cardStyle = (() => {
    if (!rect) return { top: '50%', left: '50%', transform: 'translate(-50%, -50%)', position: 'fixed' };
    const below = rect.top + rect.height + 16;
    const top = below + 260 > window.innerHeight ? Math.max(16, rect.top - 276) : below;
    return { position: 'fixed', top, left: Math.min(Math.max(16, rect.left), window.innerWidth - 336), width: 320 };
  })();

  return (
    <div className="fixed inset-0 z-[130]" role="dialog" aria-modal="true" aria-label="Spotlight tour">
      {/* dim + cutout */}
      {rect ? (
        <>
          <div className="absolute inset-0 bg-black/60" onClick={finish} />
          <div
            className="absolute rounded-lg border-2 border-blue-500 shadow-[0_0_0_9999px_rgba(0,0,0,0.6)] pointer-events-none transition-all"
            style={{ top: rect.top - 4, left: rect.left - 4, width: rect.width + 8, height: rect.height + 8 }}
          />
        </>
      ) : (
        <div className="absolute inset-0 bg-black/60" onClick={finish} />
      )}
      <div
        className={`rounded-xl border shadow-2xl p-4 space-y-2 ${darkMode ? 'bg-gray-900 text-gray-100 border-gray-700' : 'bg-white text-gray-900 border-gray-200'}`}
        style={cardStyle}
      >
        <div className="flex items-center justify-between">
          <span className={`text-[11px] font-bold uppercase tracking-wide ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
            {index + 1} / {TOUR_STEPS.length} · {step.icon} {step.title}
          </span>
          <button onClick={finish} aria-label="End tour" className="p-1 rounded hover:bg-black/10"><X className="h-4 w-4" /></button>
        </div>
        <p className={`text-xs leading-relaxed ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>{step.body}</p>
        <p className="text-xs font-medium text-blue-500">💡 {step.tip}</p>
        <div className="flex items-center justify-between pt-1">
          <button onClick={() => setIndex((i) => Math.max(0, i - 1))} disabled={index === 0} className="flex items-center gap-1 px-2 py-1.5 text-xs font-medium rounded hover:bg-black/10 disabled:opacity-40">
            <ArrowLeft className="h-3.5 w-3.5" /> Back
          </button>
          {index < TOUR_STEPS.length - 1 ? (
            <button onClick={() => setIndex((i) => i + 1)} className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded bg-blue-600 text-white hover:bg-blue-700">
              Next <ArrowRight className="h-3.5 w-3.5" />
            </button>
          ) : (
            <button onClick={finish} className="px-3 py-1.5 text-xs font-semibold rounded bg-green-600 text-white hover:bg-green-700">Done ✓</button>
          )}
        </div>
      </div>
    </div>
  );
}
