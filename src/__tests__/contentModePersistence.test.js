import { describe, it, expect } from 'vitest';
import { migratePersistedState, SESSION_SCHEMA_VERSION } from '../context/sessionModel.js';
import { CONTENT_MODE_BIBLE, CONTENT_MODE_SONG } from '../utils/contentMode.js';

describe('contentModePersistence', () => {
  it('migrates legacy flat keys to versioned session', () => {
    const legacy = {
      contentMode: 'bible',
      lyricsFileName: 'John 3:16',
      bibleVersion: 'KJV',
      rawLyricsContent: 'For God so loved',
      lyrics: ['For God so loved\n\nJohn 3:16'],
      songMetadata: { title: 'John 3:16' },
      sidebarCollapsed: false,
    };
    const migrated = migratePersistedState({ ...legacy });
    expect(migrated._persistVersion).toBe(SESSION_SCHEMA_VERSION);
    expect(migrated.session.contentMode).toBe(CONTENT_MODE_BIBLE);
    expect(migrated.session.activeContent.reference).toBe('John 3:16');
    expect(migrated.session.leftPanel.view).toBe('bible');
  });

  it('migrates song legacy', () => {
    const legacy = {
      contentMode: 'song',
      lyricsFileName: 'Amazing Grace',
      bibleVersion: '',
      lyrics: ['Amazing grace'],
    };
    const migrated = migratePersistedState({ ...legacy });
    expect(migrated.session.contentMode).toBe(CONTENT_MODE_SONG);
    expect(migrated.session.leftPanel.view).toBe('songs');
  });

  it('preserves existing valid session', () => {
    const session = {
      contentMode: CONTENT_MODE_BIBLE,
      activeContent: { kind: 'bible', reference: 'John 3:16', lines: [], title: 'John 3:16', rawText: '', id: '1', bibleId: 'KJV' },
      leftPanel: { open: true, view: 'bible' },
      outputs: {},
      revision: 5,
    };
    const state = {
      contentMode: CONTENT_MODE_BIBLE,
      session,
      _persistVersion: SESSION_SCHEMA_VERSION,
    };
    const migrated = migratePersistedState({ ...state });
    expect(migrated.session.revision).toBe(5);
    expect(migrated._persistVersion).toBe(SESSION_SCHEMA_VERSION);
  });

  it('restores templates and output assignments after migrate', () => {
    const legacy = {
      contentMode: 'song',
      modeTemplates: {
        output1: { enabled: true, song: 'default', bible: 'bible-reverent-serif' },
        stage: { enabled: true, song: 'stage-classic', bible: 'bible-stage-verse-focus' },
      },
      output1Settings: { fontSize: 48 },
      stageSettings: { liveFontSize: 72 },
      customOutputs: [{ id: 'custom_test', name: 'Test', slug: 'test', type: 'regular' }],
      customOutputSettings: { custom_test: { fontSize: 99 } },
      customOutputEnabled: { custom_test: true },
    };
    const migrated = migratePersistedState({ ...legacy });
    expect(migrated.modeTemplates.output1.enabled).toBe(true);
    expect(migrated.customOutputs.length).toBe(1);
    expect(migrated._persistVersion).toBe(SESSION_SCHEMA_VERSION);
  });
});
