import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import useLyricsStore from '../context/LyricsStore';
import { getAllOutputs } from '../utils/outputs';
import { useOutputTemplateSync } from '../hooks/useOutputTemplateSync';

const emitStyleUpdateMock = vi.fn();
const showToastMock = vi.fn();

vi.mock('../context/ControlSocketProvider', () => ({
  useControlSocket: () => ({ emitStyleUpdate: emitStyleUpdateMock }),
}));
vi.mock('../hooks/useToast', () => ({
  default: () => ({ showToast: showToastMock }),
}));

describe('outputTemplateSync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useLyricsStore.setState({
      contentMode: 'song',
      modeTemplates: {
        output1: { enabled: true, song: 'default', bible: 'bible-reverent-serif' },
        output2: { enabled: true, song: 'default', bible: 'bible-reverent-serif' },
        stage: { enabled: true, song: 'default', bible: 'bible-stage-verse-focus' },
      },
      _lastAppliedModeTemplate: {},
      customOutputs: [],
      customOutputSettings: {},
      customOutputEnabled: {},
    });
  });

  it('getAllOutputs includes built-ins', () => {
    const state = useLyricsStore.getState();
    const outputs = getAllOutputs(state);
    expect(outputs.some((o) => o.key === 'output1')).toBe(true);
    expect(outputs.some((o) => o.key === 'stage')).toBe(true);
  });

  it('custom regular output participates like built-ins', () => {
    const id = useLyricsStore.getState().createCustomOutput({ name: 'My Custom', slug: 'my-custom', type: 'regular', sourceOutputKey: 'output1' });
    useLyricsStore.getState().setModeTemplate(id, 'song', 'default');
    useLyricsStore.getState().setModeTemplate(id, 'bible', 'bible-reverent-serif');
    useLyricsStore.getState().setModeTemplateEnabled(id, true);
    const state = useLyricsStore.getState();
    const outputs = getAllOutputs(state);
    const custom = outputs.find((o) => o.key === id);
    expect(custom).toBeTruthy();
    expect(custom.type).toBe('regular');
    expect(state.modeTemplates[id].enabled).toBe(true);
  });

  it('custom stage output is stage-shaped', () => {
    const id = useLyricsStore.getState().createCustomOutput({ name: 'My Stage', slug: 'my-stage', type: 'stage', sourceOutputKey: 'stage' });
    const state = useLyricsStore.getState();
    const outputs = getAllOutputs(state);
    const custom = outputs.find((o) => o.key === id);
    expect(custom.type).toBe('stage');
  });

  it('toggling custom output never changes mode', () => {
    const id = useLyricsStore.getState().createCustomOutput({ name: 'Toggle Test', slug: 'toggle-test', type: 'regular', sourceOutputKey: 'output1' });
    useLyricsStore.getState().selectMode('bible');
    expect(useLyricsStore.getState().contentMode).toBe('bible');
    useLyricsStore.getState().setCustomOutputEnabled(id, false);
    expect(useLyricsStore.getState().contentMode).toBe('bible');
    useLyricsStore.getState().setCustomOutputEnabled(id, true);
    expect(useLyricsStore.getState().contentMode).toBe('bible');
  });

  it('regular custom with different song/bible templates', () => {
    const id = useLyricsStore.getState().createCustomOutput({ name: 'Diff Templates', slug: 'diff-templates', type: 'regular', sourceOutputKey: 'output1' });
    useLyricsStore.getState().setModeTemplate(id, 'song', 'default');
    useLyricsStore.getState().setModeTemplate(id, 'bible', 'bible-reverent-serif');
    useLyricsStore.getState().setModeTemplateEnabled(id, true);
    const cfg = useLyricsStore.getState().modeTemplates[id];
    expect(cfg.song).toBe('default');
    expect(cfg.bible).toBe('bible-reverent-serif');
    expect(cfg.enabled).toBe(true);
  });

  it('applyForMode applies bible template settings to store and emits style updates', async () => {
    const { result } = renderHook(() => useOutputTemplateSync());

    await act(async () => {
      await result.current.applyForMode('bible');
    });

    const state = useLyricsStore.getState();
    expect(state.output1Settings.fontStyle).toBe('Cormorant Garamond');
    expect(state.output1Settings.fontSize).toBe(56);
    expect(state.stageSettings.liveFontSize).toBe(96);
    expect(emitStyleUpdateMock).toHaveBeenCalledWith('output1', expect.objectContaining({ fontStyle: 'Cormorant Garamond', fontSize: 56 }));
    expect(emitStyleUpdateMock).toHaveBeenCalledWith('stage', expect.objectContaining({ liveFontSize: 96 }));
  });

  it('applyForMode applies song template settings when switching back to song', async () => {
    const { result } = renderHook(() => useOutputTemplateSync());

    await act(async () => {
      await result.current.applyForMode('bible');
    });
    expect(useLyricsStore.getState().output1Settings.fontStyle).toBe('Cormorant Garamond');

    await act(async () => {
      await result.current.applyForMode('song');
    });

    const state = useLyricsStore.getState();
    expect(state.output1Settings.fontStyle).toBe('Bebas Neue');
    expect(emitStyleUpdateMock).toHaveBeenCalledWith('output1', expect.objectContaining({ fontStyle: 'Bebas Neue' }));
  });

  it('reapply forces reapplication of template', async () => {
    const { result } = renderHook(() => useOutputTemplateSync());

    // Modify a setting manually
    useLyricsStore.getState().updateOutputSettings('output1', { fontSize: 30 });
    expect(useLyricsStore.getState().output1Settings.fontSize).toBe(30);

    await act(async () => {
      result.current.reapply('output1', 'bible');
    });

    expect(useLyricsStore.getState().output1Settings.fontSize).toBe(56);
    expect(emitStyleUpdateMock).toHaveBeenCalledWith('output1', expect.objectContaining({ fontSize: 56 }));
  });

  it('does NOT restyle when a bible verse is loaded — manual apply only', async () => {
    renderHook(() => useOutputTemplateSync());
    const before = useLyricsStore.getState().output1Settings.fontStyle;

    act(() => {
      useLyricsStore.getState().loadBibleVerse({
        reference: 'John 3:16',
        text: 'For God so loved',
        bible: 'KJV',
      });
    });

    // No auto-apply: styles untouched until the user applies explicitly.
    expect(useLyricsStore.getState().output1Settings.fontStyle).toBe(before);
    expect(emitStyleUpdateMock).not.toHaveBeenCalled();
  });

  it('does NOT restyle when a song is loaded — manual apply only', async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useOutputTemplateSync());
    act(() => {
      useLyricsStore.getState().loadBibleVerse({
        reference: 'John 3:16',
        text: 'For God so loved',
        bible: 'KJV',
      });
    });

    // Manual apply still works on demand.
    await act(async () => {
      await result.current.applyForMode('bible', { force: true, manual: true });
    });
    expect(useLyricsStore.getState().output1Settings.fontStyle).toBe('Cormorant Garamond');

    // Then load song — styles must stay as manually applied.
    act(() => {
      useLyricsStore.getState().loadSong({
        title: 'Amazing Grace',
        fileName: 'Amazing Grace',
        lines: ['Amazing grace'],
      });
    });
    await act(async () => {
      vi.advanceTimersByTime(150);
    });

    expect(useLyricsStore.getState().output1Settings.fontStyle).toBe('Cormorant Garamond');
    vi.useRealTimers();
  });
});
