import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ChordChartView from '../Stage/ChordChartView';
import { parseChordPro } from 'shared/chords.js';

const SAMPLE = `{title: Amazing Grace}
{key: G}

{start_of_verse: Verse 1}
[G]Amazing grace how [C]sweet the [G]sound
That saved a wretch like [D]me

{start_of_chorus}
My [G]chains are [Em]gone
{end_of_chorus}`;

describe('ChordChartView stage rendering', () => {
  it('renders nothing without chord data (lyric-only stage unchanged)', () => {
    const { container } = render(<ChordChartView chart={null} />);
    expect(container.innerHTML).toBe('');
  });

  it('renders nothing for malformed chart data', () => {
    const { container } = render(<ChordChartView chart={{ sections: [null] }} />);
    expect(container.innerHTML).toBe('');
  });

  it('renders sections, mono-aligned chords, and the key badge', () => {
    const chart = parseChordPro(SAMPLE);
    const { container } = render(<ChordChartView chart={chart} transpose={0} baseFontSize={32} color="#FFFFFF" />);
    expect(screen.getByText('Verse 1')).toBeTruthy();
    expect(screen.getByText('Chorus')).toBeTruthy();
    expect(screen.getByText('Key G')).toBeTruthy();
    // Chord row sits above its lyric row inside a mono block.
    const region = screen.getByLabelText('Chord chart');
    expect(region.textContent).toContain('Amazing grace how sweet the sound');
    const chordRow = container.querySelector('.whitespace-pre .font-bold').textContent;
    expect(chordRow[0]).toBe('G');
    // C sits above "sweet", final G above "sound" — exact mono offsets.
    expect(chordRow.indexOf('C')).toBe('Amazing grace how '.length);
    expect(chordRow.lastIndexOf('G')).toBe('Amazing grace how sweet the '.length);
  });

  it('does not add a key badge when the chart has no key', () => {
    render(<ChordChartView chart={parseChordPro('[C]Sing this song')} />);
    expect(screen.queryByText(/Key/)).toBeNull();
  });

  it('marks the live section without relying on color alone', () => {
    const chart = parseChordPro(SAMPLE);
    render(<ChordChartView chart={chart} activeSectionLabel="chorus" />);
    expect(screen.getByText(/now playing/)).toBeTruthy();
  });

  it('transposes via the on-stage controls and shows the sounding key', async () => {
    const user = userEvent.setup();
    const chart = parseChordPro(SAMPLE);
    const onTransposeChange = vi.fn();
    render(<ChordChartView chart={chart} transpose={2} onTransposeChange={onTransposeChange} />);
    expect(screen.getByText('Key G → A')).toBeTruthy();
    await user.click(screen.getByLabelText('Transpose up one semitone'));
    expect(onTransposeChange).toHaveBeenCalledWith(3);
    await user.click(screen.getByLabelText('Reset transpose to concert pitch'));
    expect(onTransposeChange).toHaveBeenCalledWith(0);
  });
});
