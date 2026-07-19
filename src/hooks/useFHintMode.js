import { useEffect, useState, useCallback, useRef } from 'react';
import useLyricsStore from '../context/LyricsStore';

// Vimium-style hint characters — home-row priority for ergonomic one-hand use
const HINT_CHARS = 'ASDFGHJKLQWERTYUIOPZXCVBNM'.split('');

function isTypingElement(el) {
  if (!el) return false;
  const tag = el.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (el.isContentEditable) return true;
  // also check parents that might be contenteditable
  if (el.closest && el.closest('[contenteditable="true"]')) return true;
  return false;
}

function isVisible(el) {
  if (!el || !document.contains(el)) return false;
  if (el.closest('[data-f-hint-ignore]')) return false;
  const style = window.getComputedStyle(el);
  if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
  if (el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true') return false;
  const rect = el.getBoundingClientRect();
  if (rect.width < 3 || rect.height < 3) return false;
  if (rect.bottom < 0 || rect.top > window.innerHeight || rect.right < 0 || rect.left > window.innerWidth) return false;
  // opacity parent check via rect is enough; additional check for no size
  return true;
}

function collectHintTargets() {
  // Broad selector for interactive elements — mirrors Vimium's scope but filtered to UI
  const selector = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled]):not([type="hidden"])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[role="button"]',
    '[role="tab"]',
    '[onclick]',
    '[data-f-hint]',
    '[data-line-index]',
    '.lyric-line',
    // Visible clickable divs/lis with cursor pointer and tabindex
    '[tabindex]:not([tabindex="-1"])',
  ].join(', ');

  const candidates = Array.from(document.querySelectorAll(selector));
  const seen = new Set();
  const filtered = [];

  for (const el of candidates) {
    if (seen.has(el)) continue;
    seen.add(el);
    if (!isVisible(el)) continue;

    // Exclude elements inside hidden overlays? keep modals if visible — they are in DOM and visible rect true
    // But exclude our own hint overlay
    if (el.closest('[data-f-hint-overlay]')) continue;
    // Exclude toast dismiss? Keep - it's visible; but we want most buttons
    // Filter out elements with zero text and no aria-label that are not inputs
    // But keep them — badges will still show; user can discover
    filtered.push(el);
  }

  // Prioritize by viewport position top->bottom, left->right for deterministic labeling
  filtered.sort((a, b) => {
    const ra = a.getBoundingClientRect();
    const rb = b.getBoundingClientRect();
    if (Math.abs(ra.top - rb.top) > 10) return ra.top - rb.top;
    return ra.left - rb.left;
  });

  // Dedupe overlapping exact same rect (e.g. wrapper + inner button) — keep smallest clickable
  // Simple: if two elements' rects nearly identical, keep the innermost (deepest)
  // For now just limit to first 100 to avoid perf issues
  return filtered.slice(0, 200);
}

function generateHints(count) {
  if (count <= 0) return [];
  if (count <= HINT_CHARS.length) {
    return HINT_CHARS.slice(0, count);
  }
  // Need two-letter hints — uniform length 2 to avoid prefix ambiguity
  const hints = [];
  // Use 2-char combos; enough for 676 elements (26*26)
  let idx = 0;
  outer: for (let i = 0; i < HINT_CHARS.length; i++) {
    for (let j = 0; j < HINT_CHARS.length; j++) {
      hints.push(HINT_CHARS[i] + HINT_CHARS[j]);
      idx++;
      if (idx >= count) break outer;
    }
  }
  if (hints.length < count) {
    // Fallback 3-char if >676 (unlikely)
    for (let i = hints.length; i < count; i++) {
      const a = HINT_CHARS[i % HINT_CHARS.length];
      const b = HINT_CHARS[Math.floor(i / HINT_CHARS.length) % HINT_CHARS.length];
      const c = HINT_CHARS[Math.floor(i / (HINT_CHARS.length * HINT_CHARS.length)) % HINT_CHARS.length];
      hints.push(`${c}${b}${a}`);
    }
  }
  return hints;
}

export function useFHintMode() {
  const enabled = useLyricsStore((s) => s.fHintEnabled ?? true);
  const [active, setActive] = useState(false);
  const [typed, setTyped] = useState('');
  const [hints, setHints] = useState([]); // { id, el, hint, rect, index }
  const hintsRef = useRef([]);
  const typedRef = useRef('');

  const exit = useCallback(() => {
    setActive(false);
    setTyped('');
    typedRef.current = '';
    setHints([]);
    hintsRef.current = [];
  }, []);

  const enter = useCallback(() => {
    if (!enabled) return;
    const targets = collectHintTargets();
    if (targets.length === 0) return;
    const labels = generateHints(targets.length);
    const next = targets.map((el, i) => {
      const rect = el.getBoundingClientRect();
      return { id: i, el, hint: labels[i], rect };
    });
    hintsRef.current = next;
    typedRef.current = '';
    setHints(next);
    setTyped('');
    setActive(true);
  }, [enabled]);

  const triggerElement = useCallback((el) => {
    // Close hint mode first
    exit();
    // Use rAF to let overlay unmount before click propagation
    requestAnimationFrame(() => {
      try {
        el.focus({ preventScroll: true });
      } catch {}
      // Simulate real click with mouse events for frameworks that listen to pointer
      el.click();
      // Also dispatch pointer events for completeness
      // Some buttons are inside labels or custom components — click is enough
      // For lyrics lines that are divs with onClick, click should fire
      // For inputs, focus already done
    });
  }, [exit]);

  useEffect(() => {
    if (!enabled && active) exit();
  }, [enabled, active, exit]);

  // Keep rects updated on scroll/resize while active
  useEffect(() => {
    if (!active) return;
    let raf = 0;
    const updateRects = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        setHints((prev) =>
          prev.map((h) => ({ ...h, rect: h.el.getBoundingClientRect() }))
        );
      });
    };
    window.addEventListener('scroll', updateRects, true);
    window.addEventListener('resize', updateRects);
    return () => {
      window.removeEventListener('scroll', updateRects, true);
      window.removeEventListener('resize', updateRects);
      cancelAnimationFrame(raf);
    };
  }, [active]);

  // Global key handling
  useEffect(() => {
    const onKeyDown = (e) => {
      // Ignore if typing and not active
      const ae = document.activeElement;

      if (active) {
        // While active, intercept all keys
        const key = e.key;

        if (key === 'Escape' || key === 'Esc') {
          e.preventDefault();
          e.stopPropagation();
          exit();
          return;
        }
        if (key === 'Backspace') {
          e.preventDefault();
          e.stopPropagation();
          if (typedRef.current.length > 0) {
            const next = typedRef.current.slice(0, -1);
            typedRef.current = next;
            setTyped(next);
          }
          return;
        }
        // Allow closing by pressing F again with no typed prefix
        if (key.toLowerCase() === 'f' && typedRef.current === '' && !e.ctrlKey && !e.metaKey && !e.altKey) {
          e.preventDefault();
          e.stopPropagation();
          exit();
          return;
        }
        // Only handle single character A-Z
        if (key.length === 1 && /^[a-zA-Z]$/.test(key) && !e.ctrlKey && !e.metaKey && !e.altKey) {
          e.preventDefault();
          e.stopPropagation();
          const upper = key.toUpperCase();
          const nextTyped = typedRef.current + upper;
          const prefixMatches = hintsRef.current.filter((h) => h.hint.startsWith(nextTyped));
          if (prefixMatches.length === 0) {
            // No match — flash but stay; don't advance
            // Optional: shake animation — just ignore
            return;
          }
          // If exact match and it's unique (or uniform length reached) -> trigger
          const exact = hintsRef.current.find((h) => h.hint === nextTyped);
          // If exact exists and either it's the only prefix or length matches hint length -> fire
          if (exact && (prefixMatches.length === 1 || nextTyped.length === exact.hint.length)) {
            triggerElement(exact.el);
            return;
          }
          // Otherwise wait for more chars
          typedRef.current = nextTyped;
          setTyped(nextTyped);
          // Also check if nextTyped already uniquely identifies one even with longer hints? (prefix length 1 -> auto trigger)
          if (prefixMatches.length === 1 && prefixMatches[0].hint === nextTyped) {
            triggerElement(prefixMatches[0].el);
          }
          return;
        }
        // For any other key while active, prevent default to avoid propagating to app shortcuts
        // But allow F5, etc? Just block single chars and escape already handled
        if (key.length === 1 && !e.ctrlKey && !e.metaKey) {
          e.preventDefault();
          e.stopPropagation();
        }
        return;
      }

      // Not active — check for entry trigger 'f'
      // Bare F is captured app-wide on purpose (capture phase outranks other key handlers).
      // Typing contexts are exempt via isTypingElement; exclude elements with data-f-hint-ignore.
      if (!enabled) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (isTypingElement(ae)) return;
      // Don't trigger when a modal input is focused via custom portals (already covered)
      // Ignore if any modifier overlay is open? still allow but with visible hints user can click modal buttons
      if (e.key.toLowerCase() !== 'f') return;
      // Avoid hijacking when user holds key repeat? only first press
      if (e.repeat) return;
      // Prevent 'f' from typing into any focused body
      e.preventDefault();
      e.stopPropagation();
      enter();
    };

    // Use capture to beat TanStack hotkeys manager
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [active, enabled, enter, exit, triggerElement]);

  // Keep refs in sync
  useEffect(() => {
    hintsRef.current = hints;
  }, [hints]);
  useEffect(() => {
    typedRef.current = typed;
  }, [typed]);

  // Exit on click outside hint? keep active until explicit action; clicking overlay badge triggers
  const handleBackdropClick = useCallback(
    (e) => {
      // Click on dim backdrop exits
      if (e.target && e.target.getAttribute && e.target.getAttribute('data-f-hint-backdrop') === 'true') {
        exit();
      }
    },
    [exit]
  );

  return { active, typed, hints, exit, enter, enabled, handleBackdropClick, triggerElement };
}
