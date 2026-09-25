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

const CLEAN_LYRICS = [
  '[Verse 1]',
  'Amazing grace how sweet the sound',
  'That saved a wretch like me',
  '[Chorus]',
  'My chains are gone',
];

describe('ChordChartView stage rendering', () => {
  it('renders nothing without chord data (lyric-only stage unchanged)', () => {
    const { container } = render(
      <ChordChartView chart={null} activeLine="Amazing grace" activeLineIndex={0} lyrics={['Amazing grace']} />,
    );
    expect(container.innerHTML).toBe('');
  });

  it('renders nothing for malformed chart data', () => {
    const { container } = render(
      <ChordChartView
        chart={{ sections: [null] }}
        activeLine="Amazing grace"
        activeLineIndex={0}
        lyrics={['Amazing grace']}
      />,
    );
    expect(container.innerHTML).toBe('');
  });

  it('renders only the currently selected lyric and its aligned chords', () => {
    const chart = parseChordPro(SAMPLE);
    const activeLine = 'Amazing grace how sweet the sound';
    const { container } = render(
      <ChordChartView
        chart={chart}
        activeLine={activeLine}
        activeLineIndex={1}
        lyrics={CLEAN_LYRICS}
        baseFontSize={32}
        color="#FFFFFF"
      />,
    );

    expect(screen.getByText('Verse 1')).toBeTruthy();
    expect(screen.getByText(activeLine)).toBeTruthy();
    expect(screen.queryByText('That saved a wretch like me')).toBeNull();
    expect(screen.queryByText('My chains are gone')).toBeNull();

    const chordRow = container.querySelector('.whitespace-pre .font-bold').textContent;
    expect(chordRow[0]).toBe('G');
    expect(chordRow.indexOf('C')).toBe('Amazing grace how '.length);
    expect(chordRow.lastIndexOf('G')).toBe('Amazing grace how sweet the '.length);
    expect(screen.getByText('Key G')).toBeTruthy();
  });

  it('switches to the newly selected line without retaining the previous line', () => {
    const chart = parseChordPro(SAMPLE);
    const { rerender } = render(
      <ChordChartView
        chart={chart}
        activeLine={CLEAN_LYRICS[1]}
        activeLineIndex={1}
        lyrics={CLEAN_LYRICS}
      />,
    );

    expect(screen.getByText(CLEAN_LYRICS[1])).toBeTruthy();

    rerender(
      <ChordChartView
        chart={chart}
        activeLine={CLEAN_LYRICS[4]}
        activeLineIndex={4}
        lyrics={CLEAN_LYRICS}
      />,
    );

    expect(screen.getByText(CLEAN_LYRICS[4])).toBeTruthy();
    expect(screen.queryByText(CLEAN_LYRICS[1])).toBeNull();
  });

  it('renders both source lines from a normal two-line group', () => {
    const chart = parseChordPro(SAMPLE);
    const groupedLine = {
      type: 'normal-group',
      line1: CLEAN_LYRICS[1],
      line2: CLEAN_LYRICS[2],
      displayText: `${CLEAN_LYRICS[1]}\n${CLEAN_LYRICS[2]}`,
    };
    const lyrics = [[CLEAN_LYRICS[0], groupedLine, CLEAN_LYRICS[3], CLEAN_LYRICS[4]]];

    render(
      <ChordChartView chart={chart} activeLine={groupedLine} activeLineIndex={1} lyrics={lyrics} />,
    );

    expect(screen.getByText(CLEAN_LYRICS[1])).toBeTruthy();
    expect(screen.getByText(CLEAN_LYRICS[2])).toBeTruthy();
    expect(screen.queryByText(CLEAN_LYRICS[4])).toBeNull();
  });

  it('uses the matching occurrence when a lyric line repeats', () => {
    const chart = parseChordPro('[C]First\n[D]Repeat\n[E]Repeat');
    const lyrics = ['First', 'Repeat', 'Repeat'];

    render(<ChordChartView chart={chart} activeLine="Repeat" activeLineIndex={2} lyrics={lyrics} />);

    const region = screen.getByLabelText('Current chord line');
    expect(region.textContent).toContain('ERepeat');
    expect(region.textContent).not.toContain('DRepeat');
  });

  it('keeps the current lyric visible when no chart line matches', () => {
    const chart = parseChordPro(SAMPLE);
    render(
      <ChordChartView
        chart={chart}
        activeLine="A newly edited lyric line"
        activeLineIndex={5}
        lyrics={[...CLEAN_LYRICS, 'A newly edited lyric line']}
      />,
    );

    expect(screen.getByText('A newly edited lyric line')).toBeTruthy();
    expect(screen.queryByText(CLEAN_LYRICS[1])).toBeNull();
  });

  it('does not add a key badge when the chart has no key', () => {
    const lyrics = ['Sing this song'];
    render(<ChordChartView chart={parseChordPro('[C]Sing this song')} activeLine={lyrics[0]} lyrics={lyrics} />);
    expect(screen.queryByText(/Key/)).toBeNull();
  });

  it('transposes via the on-stage controls and shows the sounding key', async () => {
    const user = userEvent.setup();
    const chart = parseChordPro(SAMPLE);
    const onTransposeChange = vi.fn();
    const activeLine = CLEAN_LYRICS[4];
    render(
      <ChordChartView
        chart={chart}
        activeLine={activeLine}
        activeLineIndex={4}
        lyrics={CLEAN_LYRICS}
        transpose={2}
        onTransposeChange={onTransposeChange}
      />,
    );
    expect(screen.getByText('Key G → A')).toBeTruthy();
    await user.click(screen.getByLabelText('Transpose up one semitone'));
    expect(onTransposeChange).toHaveBeenCalledWith(3);
    await user.click(screen.getByLabelText('Reset transpose to concert pitch'));
    expect(onTransposeChange).toHaveBeenCalledWith(0);
  });
});
