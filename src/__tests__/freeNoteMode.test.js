import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import useLyricsStore from '../context/LyricsStore';
import {
  CONTENT_MODE_FREENOTE,
  CONTENT_MODES,
  isValidContentMode,
  normalizeContentMode,
  isFreeNoteMode
} from '../utils/contentMode';
import {
  freeNoteTemplates,
  resolveTemplateById,
  resolveTemplateForOutput,
  allOutputTemplatesForOutput,
  getAllKnownTemplateIds
} from '../utils/outputTemplates';
import {
  splitFreeNoteSlides,
  extractFreeNoteTitle,
  extractBibleShortcode,
  extractHymnShortcode,
  createFreeNoteDraft,
  isMarkdownContent,
  calculateNoteBaseFontSize,
} from '../utils/freeNote';
import {
  parseMarkdownBlocks,
  renderInlineMarkdown,
} from '../components/FreeNote/MarkdownNoteRenderer';
import { useOutputTemplateSync } from '../hooks/useOutputTemplateSync';

const emitStyleUpdateMock = vi.fn();
const showToastMock = vi.fn();

vi.mock('../context/ControlSocketProvider', () => ({
  useControlSocket: () => ({ emitStyleUpdate: emitStyleUpdateMock }),
}));
vi.mock('../hooks/useToast', () => ({
  default: () => ({ showToast: showToastMock }),
}));

describe('Free Note Mode & Tri-Mode Architecture', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useLyricsStore.setState({
      contentMode: 'song',
      freeNotesEnabled: true,
      currentSong: null,
      currentBibleVerse: null,
      freeNotesDrafts: [],
      modeTemplates: {
        output1: { enabled: true, song: 'default', bible: 'bible-reverent-serif', freenote: 'freenote-standard' },
        output2: { enabled: true, song: 'default', bible: 'bible-reverent-serif', freenote: 'freenote-standard' },
        stage: { enabled: true, song: 'default', bible: 'bible-stage-verse-focus', freenote: 'freenote-stage-focus' },
      },
      _lastAppliedModeTemplate: {},
      customOutputs: [],
      customOutputSettings: {},
      customOutputEnabled: {},
    });
  });

  describe('contentMode utilities', () => {
    it('defines CONTENT_MODE_FREENOTE correctly', () => {
      expect(CONTENT_MODE_FREENOTE).toBe('freenote');
      expect(CONTENT_MODES).toContain('freenote');
      expect(isValidContentMode('freenote')).toBe(true);
      expect(normalizeContentMode('freenote')).toBe('freenote');
      expect(isFreeNoteMode('freenote')).toBe(true);
      expect(isFreeNoteMode('song')).toBe(false);
      expect(isFreeNoteMode('bible')).toBe(false);
    });
  });

  describe('Free Note text parsing and shortcodes', () => {
    it('splits slides on delimiter ---', () => {
      const markdown = 'Welcome to Church\n---\nPlease turn to your neighbour\n---\nAnnouncements: Youth Meeting at 5pm';
      const slides = splitFreeNoteSlides(markdown);
      expect(slides).toEqual([
        'Welcome to Church',
        'Please turn to your neighbour',
        'Announcements: Youth Meeting at 5pm'
      ]);
    });

    it('handles single slide without delimiters', () => {
      const markdown = 'One simple slide note';
      const slides = splitFreeNoteSlides(markdown);
      expect(slides).toEqual(['One simple slide note']);
    });

    it('extracts note title correctly', () => {
      expect(extractFreeNoteTitle('# Pastor Sermon Title\nBody')).toBe('Pastor Sermon Title');
      expect(extractFreeNoteTitle('Welcome Visitors\nSecond line')).toBe('Welcome Visitors');
      expect(extractFreeNoteTitle('')).toBe('Free Note');
    });

    it('extracts bible shortcodes', () => {
      expect(extractBibleShortcode('b:John 3:16')).toBe('John 3:16');
      expect(extractBibleShortcode('bible: Genesis 1:1-3')).toBe('Genesis 1:1-3');
      expect(extractBibleShortcode('regular text without code')).toBeNull();
    });

    it('extracts hymn shortcodes', () => {
      expect(extractHymnShortcode('h:32')).toBe('32');
      expect(extractHymnShortcode('hymn: 145')).toBe('145');
      expect(extractHymnShortcode('hymn:Amazing Grace')).toBe('Amazing Grace');
      expect(extractHymnShortcode('just text')).toBeNull();
    });

    it('creates free note draft with valid id and timestamp', () => {
      const draft = createFreeNoteDraft({ title: 'Test Draft', content: 'Slide 1\n---\nSlide 2' });
      expect(draft.id).toBeDefined();
      expect(draft.title).toBe('Test Draft');
      expect(draft.content).toContain('Slide 1');
      expect(draft.updatedAt).toBeDefined();
    });
  });

  describe('Free Note Output Templates', () => {
    it('contains all standard free note templates', () => {
      const ids = freeNoteTemplates.map((t) => t.id);
      expect(ids).toContain('freenote-standard');
      expect(ids).toContain('freenote-lower-third');
      expect(ids).toContain('freenote-emergency-alert');
      expect(ids).toContain('freenote-quote');
      expect(ids).toContain('freenote-stage-focus');
      expect(ids).toContain('freenote-stage-alert');
    });

    it('resolves free note templates by id', () => {
      const tmpl = resolveTemplateById('freenote-standard');
      expect(tmpl).toBeDefined();
      expect(tmpl.id).toBe('freenote-standard');
      expect(tmpl.title).toBe('Free Note — Standard');
      expect(tmpl.getSettings('output1').fontStyle).toBe('Inter');
    });

    it('resolves template for stage output correctly', () => {
      const tmpl = resolveTemplateForOutput('freenote-stage-focus', { type: 'stage', key: 'stage' });
      expect(tmpl).toBeDefined();
      const settings = tmpl.getSettings({ type: 'stage', key: 'stage' });
      expect(settings.liveFontSize).toBe(96);
      expect(settings.liveColor).toBe('#FBBF24');
    });

    it('includes free note templates in allOutputTemplatesForOutput', () => {
      const regularTemplates = allOutputTemplatesForOutput('regular');
      const stageTemplates = allOutputTemplatesForOutput('stage');

      expect(regularTemplates.some(t => t.id === 'freenote-standard')).toBe(true);
      expect(stageTemplates.some(t => t.id === 'freenote-stage-focus')).toBe(true);
    });

    it('includes free note template IDs in getAllKnownTemplateIds', () => {
      const ids = getAllKnownTemplateIds();
      expect(ids).toContain('freenote-standard');
      expect(ids).toContain('freenote-lower-third');
      expect(ids).toContain('freenote-emergency-alert');
    });
  });

  describe('LyricsStore Free Note integration', () => {
    it('loads free note and clears other mode objects', () => {
      useLyricsStore.getState().loadSong({
        title: 'Song Before',
        fileName: 'Song.txt',
        lines: ['Line 1']
      });
      expect(useLyricsStore.getState().contentMode).toBe('song');

      useLyricsStore.getState().loadFreeNote({
        title: 'Sunday Announcements',
        content: 'Welcome\n---\nPlease donate',
        slides: ['Welcome', 'Please donate'],
        targetSlideIndex: 0
      });

      const state = useLyricsStore.getState();
      expect(state.contentMode).toBe('freenote');
      expect(state.currentSong).toBeNull();
      expect(state.currentBibleVerse).toBeNull();
      expect(state.freeNoteContent).toBe('Welcome\n---\nPlease donate');
      expect(state.lyrics).toEqual(['Welcome', 'Please donate']);
      expect(state.selectedLine).toBe(0);
    });

    it('saves and deletes free note drafts', () => {
      const store = useLyricsStore.getState();
      const draft = store.saveFreeNoteDraft({
        id: 'draft-1',
        title: 'First Draft',
        content: 'Content here'
      });

      expect(useLyricsStore.getState().freeNotesDrafts).toHaveLength(1);
      expect(useLyricsStore.getState().freeNotesDrafts[0].title).toBe('First Draft');

      // Update same draft
      store.saveFreeNoteDraft({
        id: 'draft-1',
        title: 'Updated Draft',
        content: 'Updated content'
      });
      expect(useLyricsStore.getState().freeNotesDrafts).toHaveLength(1);
      expect(useLyricsStore.getState().freeNotesDrafts[0].title).toBe('Updated Draft');

      // Delete draft
      store.deleteFreeNoteDraft('draft-1');
      expect(useLyricsStore.getState().freeNotesDrafts).toHaveLength(0);
    });

    it('sets mode template for freenote', () => {
      const store = useLyricsStore.getState();
      store.setModeTemplate('output1', 'freenote', 'freenote-lower-third');
      expect(useLyricsStore.getState().modeTemplates.output1.freenote).toBe('freenote-lower-third');
    });
  });

  describe('outputTemplateSync with Free Notes mode', () => {
    it('applies freenote template styles to outputs and emits style updates', async () => {
      const { result } = renderHook(() => useOutputTemplateSync());

      await act(async () => {
        await result.current.applyForMode('freenote');
      });

      const state = useLyricsStore.getState();
      expect(state.output1Settings.fontStyle).toBe('Inter');
      expect(state.output1Settings.fontSize).toBe(56);
      expect(state.stageSettings.liveFontSize).toBe(96);

      expect(emitStyleUpdateMock).toHaveBeenCalledWith('output1', expect.objectContaining({ fontStyle: 'Inter', fontSize: 56 }));
      expect(emitStyleUpdateMock).toHaveBeenCalledWith('stage', expect.objectContaining({ liveFontSize: 96 }));
      expect(showToastMock).toHaveBeenCalledWith(expect.objectContaining({
        title: 'Free Notes template applied',
        variant: 'success'
      }));
    });
  });

  describe('Screen Display & Broadcast Integration', () => {
    it('turns on output when broadcasting if output is currently off', () => {
      useLyricsStore.setState({ isOutputOn: false });
      expect(useLyricsStore.getState().isOutputOn).toBe(false);

      // Simulating broadcasting note
      const store = useLyricsStore.getState();
      const payload = {
        title: 'Urgent Announcement',
        lines: ['Please move car with license plate ABC-123'],
        selectedLine: 0,
      };

      store.loadFreeNote(payload);
      store.setIsOutputOn(true);

      const updated = useLyricsStore.getState();
      expect(updated.isOutputOn).toBe(true);
      expect(updated.contentMode).toBe('freenote');
      expect(updated.lyrics[0]).toBe('Please move car with license plate ABC-123');
      expect(updated.selectedLine).toBe(0);
    });

    it('RegularOutput slide visibility condition evaluates to true for Free Notes', () => {
      useLyricsStore.setState({
        lyrics: ['First Slide', 'Second Slide'],
        selectedLine: 1,
        isOutputOn: true,
      });

      const state = useLyricsStore.getState();
      const currentLine = Array.isArray(state.lyrics) && state.selectedLine != null ? state.lyrics[state.selectedLine] : undefined;
      const isOutputActive = Boolean(state.isOutputOn);
      const isVisible = Boolean(isOutputActive && currentLine);

      expect(currentLine).toBe('Second Slide');
      expect(isVisible).toBe(true);
    });

    it('imports LyricDisplayApp module without initialization errors', async () => {
      const mod = await import('../components/LyricDisplayApp');
      expect(mod.default).toBeDefined();
    }, 20000);
  });

  describe('Obsidian Markdown Formatting & Proportional Typography', () => {
    it('detects markdown tokens and syntax accurately', () => {
      expect(isMarkdownContent('# Welcome to Church')).toBe(true);
      expect(isMarkdownContent('## Subheading')).toBe(true);
      expect(isMarkdownContent('Key reminder: ==bring your Bible==')).toBe(true);
      expect(isMarkdownContent('> Quote for the day')).toBe(true);
      expect(isMarkdownContent('- Bullet item')).toBe(true);
      expect(isMarkdownContent('1. Numbered item')).toBe(true);
      expect(isMarkdownContent('**Bold statement**')).toBe(true);
      expect(isMarkdownContent('b:John 3:16')).toBe(true);

      // Normal song lyrics should NOT be detected as markdown
      expect(isMarkdownContent('Amazing grace how sweet the sound')).toBe(false);
      expect(isMarkdownContent('That saved a wretch like me')).toBe(false);
    });

    it('dynamically adapts base font size based on note content density', () => {
      // 1-line short title: generous, huge impact
      const singleTitleSize = calculateNoteBaseFontSize('# WELCOME HOME');

      // Dense sermon slide with 7 bullet points
      const denseNoteText = [
        '## 5 Keys to Kingdom Advancement',
        '- 1. **Faithful Stewardship** over little things',
        '- 2. **Continuous Fellowship** with the Holy Spirit',
        '- 3. Consistent prayer without ceasing',
        '- 4. Sacrificial love for one another',
        '- 5. Bearing fruit that will ==remain forever==',
        '> "For as many as are led by the Spirit of God, they are the sons of God."',
        'b:Romans 8:14',
      ].join('\n');

      const denseNoteSize = calculateNoteBaseFontSize(denseNoteText);

      // Verify that dense notes scale down while single titles scale up
      expect(singleTitleSize).toBeGreaterThan(denseNoteSize);
      expect(singleTitleSize).toBeGreaterThanOrEqual(48);
      expect(denseNoteSize).toBeLessThanOrEqual(40);
    });

    it('parses markdown headings, callouts, lists, and quotes into structured blocks', () => {
      const raw = [
        '# Main Headline',
        '## Secondary Topic',
        '> [!NOTE] Offering',
        '> Please make cheques payable to Church',
        '- Point A',
        '- Point B with ==accent==',
        '1. Step One',
        '---',
        'Final encouragement',
      ].join('\n');

      const blocks = parseMarkdownBlocks(raw);

      const heading1 = blocks.find((b) => b.type === 'heading' && b.level === 1);
      const heading2 = blocks.find((b) => b.type === 'heading' && b.level === 2);
      const callout = blocks.find((b) => b.type === 'callout');
      const ulist = blocks.find((b) => b.type === 'ul');
      const olist = blocks.find((b) => b.type === 'ol');
      const divider = blocks.find((b) => b.type === 'divider');
      const paragraph = blocks.find((b) => b.type === 'paragraph');

      expect(heading1).toBeDefined();
      expect(heading1.text).toBe('Main Headline');
      expect(heading2).toBeDefined();
      expect(heading2.text).toBe('Secondary Topic');

      expect(callout).toBeDefined();
      expect(callout.calloutType).toBe('NOTE');
      expect(callout.title).toBe('Offering');

      expect(ulist).toBeDefined();
      expect(ulist.items.length).toBe(2);

      expect(olist).toBeDefined();
      expect(olist.items.length).toBe(1);

      expect(divider).toBeDefined();
      expect(paragraph).toBeDefined();
      expect(paragraph.text).toBe('Final encouragement');
    });

    it('renders inline Obsidian highlights and formatting into React elements', () => {
      const elements = renderInlineMarkdown('Please ==remember to pray== and **stand firm** in *faith*');
      expect(elements).toBeDefined();
      expect(Array.isArray(elements)).toBe(true);

      // Contains mark element for highlight
      const hasMark = elements.some((el) => el?.type === 'mark');
      const hasStrong = elements.some((el) => el?.type === 'strong');
      const hasEm = elements.some((el) => el?.type === 'em');

      expect(hasMark).toBe(true);
      expect(hasStrong).toBe(true);
      expect(hasEm).toBe(true);
    });
  });

  describe('Experimental Free Notes Toggle & Preferences', () => {
    it('prevents selecting freenote mode when freeNotesEnabled is false and falls back to song', () => {
      useLyricsStore.getState().setFreeNotesEnabled(false);
      expect(useLyricsStore.getState().freeNotesEnabled).toBe(false);

      useLyricsStore.getState().selectMode('freenote');
      expect(useLyricsStore.getState().contentMode).toBe('song');

      useLyricsStore.getState().setContentMode('freenote');
      expect(useLyricsStore.getState().contentMode).toBe('song');
    });

    it('resets contentMode to song when disabled while currently active in freenote mode', () => {
      useLyricsStore.getState().setFreeNotesEnabled(true);
      useLyricsStore.getState().selectMode('freenote');
      expect(useLyricsStore.getState().contentMode).toBe('freenote');

      // User turns off Free Notes in preferences
      useLyricsStore.getState().setFreeNotesEnabled(false);
      expect(useLyricsStore.getState().freeNotesEnabled).toBe(false);
      expect(useLyricsStore.getState().contentMode).toBe('song');
      expect(useLyricsStore.getState().session?.contentMode).toBe('song');
      expect(useLyricsStore.getState().session?.leftPanel?.view).toBe('songs');
    });

    it('allows freenote mode selection when re-enabled', () => {
      useLyricsStore.getState().setFreeNotesEnabled(false);
      expect(useLyricsStore.getState().freeNotesEnabled).toBe(false);

      useLyricsStore.getState().setFreeNotesEnabled(true);
      expect(useLyricsStore.getState().freeNotesEnabled).toBe(true);

      useLyricsStore.getState().selectMode('freenote');
      expect(useLyricsStore.getState().contentMode).toBe('freenote');
    });
  });

  describe('Experimental Full-Text Lyric Search Toggle & Preferences', () => {
    it('defaults lyricContentSearchEnabled to true', () => {
      expect(useLyricsStore.getState().lyricContentSearchEnabled).toBe(true);
    });

    it('can be toggled on and off', () => {
      useLyricsStore.getState().setLyricContentSearchEnabled(false);
      expect(useLyricsStore.getState().lyricContentSearchEnabled).toBe(false);

      useLyricsStore.getState().setLyricContentSearchEnabled(true);
      expect(useLyricsStore.getState().lyricContentSearchEnabled).toBe(true);
    });
  });
});

