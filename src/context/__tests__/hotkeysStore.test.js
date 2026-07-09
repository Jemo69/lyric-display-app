import { describe, it, expect, beforeEach } from 'vitest';
import useHotkeysStore from '../HotkeysStore';
import { DEFAULT_BINDINGS, ALL_SHORTCUT_IDS } from '../../constants/hotkeyBindings';

describe('HotkeysStore', () => {
  beforeEach(() => {
    useHotkeysStore.getState().resetBindings();
  });

  it('starts with the default bindings', () => {
    const { bindings } = useHotkeysStore.getState();
    expect(bindings).toEqual(DEFAULT_BINDINGS);
  });

  it('updates a single binding via setBinding', () => {
    useHotkeysStore.getState().setBinding('cycleTranslation', 'Mod+K');
    expect(useHotkeysStore.getState().bindings.cycleTranslation).toBe('Mod+K');
  });

  it('ignores unknown shortcut ids', () => {
    useHotkeysStore.getState().setBinding('doesNotExist', 'Mod+Z');
    expect(useHotkeysStore.getState().bindings.doesNotExist).toBeUndefined();
  });

  it('resets a single binding to its default', () => {
    useHotkeysStore.getState().setBinding('cycleTranslation', 'Mod+K');
    useHotkeysStore.getState().resetBinding('cycleTranslation');
    expect(useHotkeysStore.getState().bindings.cycleTranslation).toBe(DEFAULT_BINDINGS.cycleTranslation);
  });

  it('resets all bindings to defaults', () => {
    useHotkeysStore.getState().setBinding('openFile', 'Mod+Q');
    useHotkeysStore.getState().setBinding('newSong', 'Mod+W');
    useHotkeysStore.getState().resetBindings();
    const { bindings } = useHotkeysStore.getState();
    expect(bindings.openFile).toBe(DEFAULT_BINDINGS.openFile);
    expect(bindings.newSong).toBe(DEFAULT_BINDINGS.newSong);
  });

  it('only contains known shortcut ids', () => {
    const ids = Object.keys(useHotkeysStore.getState().bindings);
    ids.forEach((id) => expect(ALL_SHORTCUT_IDS).toContain(id));
  });
});
