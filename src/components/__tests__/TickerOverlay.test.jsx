import React from 'react';
import { describe, expect, it } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import TickerOverlay from '../outputs/TickerOverlay';

describe('TickerOverlay text controls', () => {
  it('renders legacy items exactly as before (centered, bold, white)', () => {
    render(<TickerOverlay item={{ id: 'a', text: 'Welcome home' }} />);
    const text = screen.getByTestId('ticker-overlay-text');
    expect(text).toHaveTextContent('Welcome home');
    expect(text.className).toMatch(/text-center/);
    expect(text.className).toMatch(/font-bold/);
    expect(text.className).toMatch(/text-white/);
  });

  it('applies size, slant, alignment, and color', () => {
    render(
      <TickerOverlay
        item={{
          id: 'b',
          text: 'Kids check-in closes at 10:30',
          style: { fontSize: 'lg', bold: false, italic: true, align: 'right', color: 'amber' },
        }}
      />
    );
    const text = screen.getByTestId('ticker-overlay-text');
    expect(text.className).toMatch(/text-right/);
    expect(text.className).toMatch(/italic/);
    expect(text.className).toMatch(/text-amber-200/);
    expect(text.className).not.toMatch(/font-bold/);
    expect(text.className).toMatch(/text-2xl/);
  });

  it('renders nothing without text', () => {
    const { container } = render(<TickerOverlay item={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});
