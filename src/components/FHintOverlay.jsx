import React from 'react';
import { createPortal } from 'react-dom';
import { useFHintMode } from '../hooks/useFHintMode';

export default function FHintOverlay() {
  const { active, typed, hints, handleBackdropClick, triggerElement } = useFHintMode();

  if (!active) return null;

  // Filter hints for dimming: if typed prefix doesn't match, dim
  const visibleHints = hints;

  const overlay = (
    <div
      data-f-hint-overlay="true"
      data-f-hint-ignore="true"
      style={{ position: 'fixed', inset: 0, zIndex: 9999, pointerEvents: 'none' }}
      aria-hidden="true"
    >
      {/* Subtle dim backdrop — still click to exit */}
      <div
        data-f-hint-backdrop="true"
        onClick={handleBackdropClick}
        style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(0,0,0,0.08)',
          pointerEvents: 'auto',
        }}
      />
      {/* Instruction bar */}
      <div
        style={{
          position: 'fixed',
          bottom: 16,
          left: '50%',
          transform: 'translateX(-50%)',
          background: '#111',
          color: '#fff',
          padding: '8px 14px',
          borderRadius: 999,
          fontSize: 12,
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
          letterSpacing: '0.02em',
          boxShadow: '0 8px 24px rgba(0,0,0,0.35), 0 0 0 1px rgba(255,255,255,0.08) inset',
          pointerEvents: 'auto',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          whiteSpace: 'nowrap',
        }}
      >
        <span style={{ fontWeight: 700, color: '#FFE66D' }}>F</span>
        <span style={{ opacity: 0.9 }}>Hint Mode</span>
        <span style={{ opacity: 0.35 }}>•</span>
        <span style={{ opacity: 0.8 }}>press hint to click</span>
        <span style={{ opacity: 0.35 }}>•</span>
        <span style={{ opacity: 0.8 }}>ESC or F to exit</span>
        {typed && (
          <>
            <span style={{ opacity: 0.35 }}>•</span>
            <span style={{ background: '#FFE66D', color: '#111', padding: '1px 6px', borderRadius: 4, fontWeight: 800 }}>{typed}</span>
          </>
        )}
      </div>

      {visibleHints.map((h) => {
        const isPrefix = typed && h.hint.startsWith(typed);
        const isNoMatch = typed && !h.hint.startsWith(typed);
        // Position slightly above top-left; clamp to viewport
        const top = Math.max(2, h.rect.top - 8);
        const left = Math.max(2, h.rect.left - 6);
        // Dim non-matching
        const opacity = isNoMatch ? 0.18 : 1;
        const scale = isPrefix ? 1.05 : 1;

        // Split hint into matched prefix + remainder for styling
        const matched = isPrefix ? typed : '';
        const remainder = isPrefix ? h.hint.slice(typed.length) : h.hint;

        return (
          <button
            key={h.id}
            data-f-hint-badge="true"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              triggerElement(h.el);
            }}
            style={{
              position: 'fixed',
              top,
              left,
              pointerEvents: 'auto',
              opacity,
              transform: `scale(${scale})`,
              transition: 'opacity 120ms, transform 120ms',
              background: isPrefix ? '#FFE66D' : '#111',
              color: isPrefix ? '#111' : '#FFE66D',
              border: `1.5px solid ${isPrefix ? '#111' : '#FFE66D'}`,
              borderRadius: 6,
              padding: '2px 6px',
              fontSize: 11,
              fontWeight: 900,
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              letterSpacing: '0.06em',
              lineHeight: 1,
              boxShadow: '0 2px 8px rgba(0,0,0,0.35), 0 0 0 1px rgba(0,0,0,0.08) inset',
              cursor: 'pointer',
              zIndex: 10000,
              minWidth: 14,
              textAlign: 'center',
            }}
            title={`Click ${h.hint}`}
            aria-label={`Hint ${h.hint}`}
          >
            {matched && <span style={{ opacity: 1 }}>{matched}</span>}
            <span style={{ opacity: matched ? 0.85 : 1 }}>{remainder}</span>
          </button>
        );
      })}

      {/* Highlight outline for hinted elements via extra divs — avoids mutating DOM */}
      {visibleHints.map((h) => {
        const isNoMatch = typed && !h.hint.startsWith(typed);
        if (isNoMatch) return null;
        return (
          <div
            key={`hl-${h.id}`}
            style={{
              position: 'fixed',
              top: h.rect.top - 2,
              left: h.rect.left - 2,
              width: h.rect.width + 4,
              height: h.rect.height + 4,
              border: '2px solid #FFE66D',
              borderRadius: 8,
              pointerEvents: 'none',
              boxShadow: '0 0 0 2px rgba(255,230,109,0.22)',
              opacity: typed && h.hint.startsWith(typed) ? 0.95 : 0.55,
            }}
          />
        );
      })}
    </div>
  );

  return createPortal(overlay, document.body);
}
