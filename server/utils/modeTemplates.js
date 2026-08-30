// server/utils/modeTemplates.js — server-side template resolver (mirrors src/utils/outputTemplates.js)
// Keep in sync with src/utils/outputTemplates.js + LyricsStore defaults
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataRoot = process.env.LYRICDISPLAY_DATA_DIR ? path.resolve(process.env.LYRICDISPLAY_DATA_DIR) : path.join(__dirname, '../..');

export const defaultOutput1Settings = {
  fontStyle: 'Bebas Neue', bold: false, italic: false, underline: false, allCaps: false, textAlign: 'center', fontSize: 48,
  translationFontSizeMode: 'bound', translationFontSize: 48, fontColor: '#FFFFFF', translationLineColor: '#FBBF24',
  borderColor: '#000000', borderSize: 0, dropShadowColor: '#000000', dropShadowOpacity: 4, dropShadowOffsetX: 0, dropShadowOffsetY: 8, dropShadowBlur: 10,
  backgroundColor: '#000000', backgroundOpacity: 0, backgroundBandVerticalPadding: 20, backgroundBandHeightMode: 'adaptive', backgroundBandCustomLines: 3, backgroundBandLockedToMaxLines: false,
  lyricsPosition: 'lower', fullScreenMode: false, fullScreenBackgroundType: 'color', fullScreenBackgroundColor: '#000000', fullScreenBackgroundMedia: null, fullScreenBackgroundMediaName: '', alwaysShowBackground: false, fullScreenRestorePosition: null,
  xMargin: 3.5, yMargin: 2, maxLinesEnabled: false, maxLines: 3, minFontSize: 24, maxFontSize: 300, fitWidthPercent: 90, fitHeightPercent: 90,
  bibleReferencePosition: 'bottom-center', bibleReferenceSize: 28, showBibleVersion: true, autosizerActive: false, primaryViewportWidth: null, primaryViewportHeight: null, allInstances: null, instanceCount: 0, transitionAnimation: 'none', transitionSpeed: 150
};

export const defaultOutput2Settings = {
  fontStyle: 'Bebas Neue', bold: false, italic: false, underline: false, allCaps: false, textAlign: 'center', fontSize: 72,
  translationFontSizeMode: 'bound', translationFontSize: 72, fontColor: '#FFFFFF', translationLineColor: '#FBBF24',
  borderColor: '#000000', borderSize: 0, dropShadowColor: '#000000', dropShadowOpacity: 4, dropShadowOffsetX: 0, dropShadowOffsetY: 8, dropShadowBlur: 10,
  backgroundColor: '#000000', backgroundOpacity: 0, backgroundBandVerticalPadding: 30, backgroundBandHeightMode: 'adaptive', backgroundBandCustomLines: 3, backgroundBandLockedToMaxLines: false,
  lyricsPosition: 'lower', fullScreenMode: false, fullScreenBackgroundType: 'color', fullScreenBackgroundColor: '#000000', fullScreenBackgroundMedia: null, fullScreenBackgroundMediaName: '', alwaysShowBackground: false, fullScreenRestorePosition: null,
  xMargin: 3.5, yMargin: 2, maxLinesEnabled: false, maxLines: 3, minFontSize: 24, maxFontSize: 300, fitWidthPercent: 90, fitHeightPercent: 90,
  bibleReferencePosition: 'bottom-center', bibleReferenceSize: 28, showBibleVersion: true, autosizerActive: false, primaryViewportWidth: null, primaryViewportHeight: null, allInstances: null, instanceCount: 0, transitionAnimation: 'none', transitionSpeed: 150
};

export const defaultStageSettings = {
  transparentBackground: false, fullScreenBackgroundType: 'color', fullScreenBackgroundColor: '#000000', fullScreenBackgroundMedia: null, fullScreenBackgroundMediaName: '', alwaysShowBackground: false, showOffScreenImage: false, offScreenMedia: null, offScreenMediaName: '',
  fontStyle: 'Bebas Neue', backgroundColor: '#000000',
  liveFontSize: 120, liveColor: '#FFFFFF', liveBold: true, liveItalic: false, liveUnderline: false, liveAllCaps: false, liveAlign: 'left',
  nextFontSize: 72, nextColor: '#808080', nextBold: false, nextItalic: false, nextUnderline: false, nextAllCaps: false, nextAlign: 'left',
  showNextArrow: true, nextArrowColor: '#FFA500', prevFontSize: 28, prevColor: '#404040', prevBold: false, prevItalic: false, prevUnderline: false, prevAllCaps: false, prevAlign: 'left',
  currentSongColor: '#FFFFFF', currentSongSize: 24, topBarAlignment: 'left', showTopBar: true, showUpcomingSong: false, upcomingSongColor: '#808080', upcomingSongSize: 18, upcomingSongMode: 'automatic', upcomingSongFullScreen: false, timerFullScreen: false, customMessagesFullScreen: false,
  showTime: true, showNextLine: true, showPrevLine: true, showWaitingForLyrics: false, messageScrollSpeed: 3000, bottomBarColor: '#FFFFFF', bottomBarSize: 20, translationLineColor: '#FBBF24',
  maxLinesEnabled: false, maxLines: 3, minFontSize: 24, maxFontSize: 300, fitWidthPercent: 90, fitHeightPercent: 90, bibleReferencePosition: 'bottom-center', bibleReferenceSize: 28, showBibleVersion: true, transitionAnimation: 'slide', transitionSpeed: 300
};

export const CLEARABLE_KEYS = ['backgroundImage', 'fullScreenBackgroundMedia', 'fullScreenBackgroundType', 'overlayOpacity'];
export const RUNTIME_SETTING_KEYS = new Set(['autosizerActive', 'primaryViewportWidth', 'primaryViewportHeight', 'allInstances', 'instanceCount']);

export function stripRuntimeSettings(settings) {
  if (!settings || typeof settings !== 'object') return {};
  const clean = {};
  for (const [key, val] of Object.entries(settings)) {
    if (!RUNTIME_SETTING_KEYS.has(key)) clean[key] = val;
  }
  return clean;
}

const baseOutputSettings = { ...defaultOutput1Settings };

export const outputTemplates = [
  { id: 'default', title: 'Default', description: 'Reset to default application settings', getSettings: (outputKey) => outputKey === 'output2' ? { ...defaultOutput2Settings } : { ...defaultOutput1Settings } },
  { id: 'lyric-lower-third-wide', title: 'Lyric — Lower Third Wide', description: 'Wide lower-third layout', getSettings: (outputKey) => {
      const base = outputKey === 'output2' ? { ...defaultOutput2Settings } : { ...defaultOutput1Settings };
      return { ...base, fontStyle: 'Bebas Neue', fontSize: 72, textAlign: 'center', lyricsPosition: 'lower', backgroundBandVerticalPadding: 30, backgroundBandHeightMode: 'adaptive', translationFontSizeMode: 'bound', translationFontSize: 48, translationLineColor: '#FBBF24', xMargin: 5, yMargin: 3 };
  }},
];

export const bibleTemplates = [
  { id: 'bible-reverent-serif', title: 'Bible — Reverent Serif', description: 'Elegant serif for scripture', audience: 'bible', getSettings: (outputKey) => {
      const base = outputKey === 'output2' ? { ...defaultOutput2Settings } : { ...defaultOutput1Settings };
      return { ...base, fontStyle: 'Cormorant Garamond', fontSize: 56, textAlign: 'center', lyricsPosition: 'center', fontColor: '#FFFFFF', translationLineColor: '#93C5FD', backgroundOpacity: 4, backgroundBandVerticalPadding: 24, bibleReferencePosition: 'bottom-center', bibleReferenceSize: 28, showBibleVersion: true, dropShadowOpacity: 6, dropShadowBlur: 12, dropShadowOffsetY: 6, lineHeight: 1.5 };
  }},
  { id: 'bible-scripture-bold', title: 'Bible — Scripture Bold', description: 'Bold Inter', audience: 'bible', getSettings: (outputKey) => {
      const base = outputKey === 'output2' ? { ...defaultOutput2Settings } : { ...defaultOutput1Settings };
      return { ...base, fontStyle: 'Inter', bold: true, fontSize: 64, textAlign: 'center', lyricsPosition: 'upper', fontColor: '#FFFFFF', translationLineColor: '#F59E0B', backgroundOpacity: 2, bibleReferencePosition: 'bottom-center', bibleReferenceSize: 30, showBibleVersion: true, dropShadowOpacity: 5, dropShadowBlur: 8 };
  }},
  { id: 'bible-minimal-verse', title: 'Bible — Minimal Verse', description: 'Clean Lato', audience: 'bible', getSettings: (outputKey) => {
      const base = outputKey === 'output2' ? { ...defaultOutput2Settings } : { ...defaultOutput1Settings };
      return { ...base, fontStyle: 'Lato', fontSize: 52, textAlign: 'center', lyricsPosition: 'center', fontColor: '#FFFFFF', translationLineColor: '#A7F3D0', backgroundOpacity: 2, borderSize: 0, backgroundBandVerticalPadding: 20, bibleReferencePosition: 'bottom-center', bibleReferenceSize: 26, showBibleVersion: true, dropShadowOpacity: 3, dropShadowBlur: 6 };
  }},
  { id: 'bible-stage-verse-focus', title: 'Stage — Verse Focus', description: 'Stage-optimized scripture', audience: 'bible', getSettings: (outputKeyOrOutput) => {
      const key = typeof outputKeyOrOutput === 'object' ? (outputKeyOrOutput?.key || outputKeyOrOutput?.id) : outputKeyOrOutput;
      const isStage = (() => { if (typeof outputKeyOrOutput === 'object' && outputKeyOrOutput !== null) return outputKeyOrOutput.type === 'stage' || outputKeyOrOutput.key === 'stage' || outputKeyOrOutput.id === 'stage'; return key === 'stage'; })();
      if (isStage) return { ...defaultStageSettings, fontStyle: 'Inter', liveFontSize: 96, liveAlign: 'center', liveColor: '#FFFFFF', liveBold: true, nextFontSize: 48, nextColor: '#808080', prevFontSize: 36, showNextArrow: false, showUpcomingSong: false, bibleReferencePosition: 'bottom-center', bibleReferenceSize: 32, showBibleVersion: true, transitionAnimation: 'fade', transitionSpeed: 200 };
      const base = key === 'output2' ? { ...defaultOutput2Settings } : { ...defaultOutput1Settings };
      return { ...base, fontStyle: 'Inter', fontSize: 60, textAlign: 'center', lyricsPosition: 'center', bibleReferenceSize: 32, showBibleVersion: true };
  }},
];

const baseStageSettings = { ...defaultStageSettings };

export const stageTemplates = [
  { id: 'default', title: 'Default', description: 'Reset to default stage', settings: { ...defaultStageSettings } },
  { id: 'stage-classic', title: 'Classic Stage', description: 'Traditional', settings: { ...baseStageSettings, fontStyle: 'Inter', liveFontSize: 72, liveAlign: 'center', nextFontSize: 48, nextColor: '#A0A0A0', nextAlign: 'center', nextArrowColor: '#4ADE80', prevFontSize: 36, prevColor: '#606060', prevAlign: 'center', upcomingSongSize: 20, upcomingSongColor: '#A0A0A0', bottomBarSize: 18, transitionAnimation: 'fade', transitionSpeed: 200 } },
  { id: 'stage-minimal', title: 'Minimal Focus', description: 'Emphasizes current line', settings: { ...baseStageSettings, fontStyle: 'Lato', backgroundColor: '#0A0A0A', liveFontSize: 84, liveAlign: 'center', nextFontSize: 40, nextColor: '#707070', nextItalic: true, nextAlign: 'center', showNextArrow: false, prevFontSize: 32, prevColor: '#404040', prevAlign: 'center', currentSongSize: 20, currentSongColor: '#E0E0E0', upcomingSongSize: 18, upcomingSongColor: '#808080', showTime: false, bottomBarSize: 16, bottomBarColor: '#C0C0C0', transitionAnimation: 'slide', transitionSpeed: 300, messageScrollSpeed: 4000 } },
  { id: 'stage-colorful', title: 'Colorful Guide', description: 'Color-coded', settings: { ...baseStageSettings, fontStyle: 'Poppins', backgroundColor: '#1A1A2E', liveFontSize: 68, liveColor: '#60A5FA', liveAlign: 'center', nextFontSize: 52, nextColor: '#34D399', nextAlign: 'center', nextArrowColor: '#10B981', prevFontSize: 38, prevColor: '#9CA3AF', prevAlign: 'center', currentSongSize: 22, currentSongColor: '#F3F4F6', upcomingSongSize: 20, upcomingSongColor: '#D1D5DB', bottomBarSize: 18, bottomBarColor: '#E5E7EB', transitionAnimation: 'fade', transitionSpeed: 250, messageScrollSpeed: 3500 } },
  { id: 'stage-large-text', title: 'Large Text', description: 'Extra large', settings: { ...baseStageSettings, fontStyle: 'Roboto', liveFontSize: 96, liveAllCaps: true, liveAlign: 'center', nextFontSize: 56, nextColor: '#B0B0B0', nextAlign: 'center', nextArrowColor: '#22C55E', prevFontSize: 40, prevColor: '#707070', prevAlign: 'center', currentSongSize: 28, upcomingSongSize: 24, upcomingSongColor: '#B0B0B0', bottomBarSize: 20, transitionAnimation: 'fade', transitionSpeed: 150, messageScrollSpeed: 2500 } },
  { id: 'stage-compact', title: 'Compact View', description: 'Balanced', settings: { ...baseStageSettings, fontStyle: 'Open Sans', backgroundColor: '#121212', liveFontSize: 60, liveAlign: 'center', nextFontSize: 44, nextColor: '#9CA3AF', nextAlign: 'center', nextArrowColor: '#3B82F6', prevFontSize: 36, prevColor: '#6B7280', prevAlign: 'center', currentSongSize: 20, currentSongColor: '#F9FAFB', upcomingSongSize: 18, upcomingSongColor: '#9CA3AF', bottomBarSize: 16, bottomBarColor: '#D1D5DB', transitionAnimation: 'slide', transitionSpeed: 200 } },
];

export function resolveTemplateById(templateId, outputKey, userTemplates = []) {
  if (!templateId) return null;
  if (templateId === 'default') {
    return { id: 'default', title: 'Default', getSettings: (k) => { if (k === 'output2') return { ...defaultOutput2Settings }; if (k === 'stage') return { ...defaultStageSettings }; return { ...defaultOutput1Settings }; }, settings: outputKey === 'stage' ? { ...defaultStageSettings } : outputKey === 'output2' ? { ...defaultOutput2Settings } : { ...defaultOutput1Settings } };
  }
  const allBuiltIns = [...outputTemplates, ...bibleTemplates, ...stageTemplates];
  const found = allBuiltIns.find((t) => t.id === templateId);
  if (found) return found;
  const user = (userTemplates || []).find((t) => t.id === templateId);
  if (user) return user;
  return null;
}

export function resolveTemplateForOutput(templateId, output, userTemplates = []) {
  if (!templateId) return null;
  if (templateId === 'default') {
    const key = output?.key || output?.id || 'output1';
    const isStage = output?.type === 'stage' || key === 'stage';
    return { id: 'default', title: 'Default', getSettings: () => isStage ? { ...defaultStageSettings } : key === 'output2' ? { ...defaultOutput2Settings } : { ...defaultOutput1Settings }, settings: isStage ? { ...defaultStageSettings } : key === 'output2' ? { ...defaultOutput2Settings } : { ...defaultOutput1Settings } };
  }
  const allBuiltIns = [...outputTemplates, ...bibleTemplates, ...stageTemplates];
  const found = allBuiltIns.find((t) => t.id === templateId);
  if (found) return found;
  const user = (userTemplates || []).find((t) => t.id === templateId);
  if (user) return user;
  return null;
}

export function getTemplateSettings(template, outputKeyOrOutput) {
  if (!template) return null;
  const key = typeof outputKeyOrOutput === 'object' ? (outputKeyOrOutput?.key || outputKeyOrOutput?.id) : outputKeyOrOutput;
  if (typeof template.getSettings === 'function') {
    try { const primary = template.getSettings(outputKeyOrOutput); if (primary) return primary; } catch {}
    try { return template.getSettings(key) || null; } catch { return null; }
  }
  return template.settings || null;
}

export function sanitizeModeTemplates(input, validKeys = null) {
  if (!input || typeof input !== 'object') return {};
  const out = {};
  for (const [k, v] of Object.entries(input)) {
    if (validKeys && !validKeys.has(k)) continue;
    if (!v || typeof v !== 'object') continue;
    out[k] = { enabled: !!v.enabled, song: v.song ?? null, bible: v.bible ?? null };
  }
  return out;
}

// User template loader for server — tries filesystem
export async function loadUserTemplatesForServer() {
  const candidates = [
    path.join(dataRoot, 'backend', 'UserTemplates', 'output-templates.json'),
    path.join(dataRoot, 'UserTemplates', 'output-templates.json'),
    path.join(dataRoot, 'output-templates.json'),
  ];
  const stageCandidates = candidates.map(p => p.replace('output-templates', 'stage-templates'));
  let out = [];
  let stg = [];
  for (const p of candidates) {
    try { const raw = await fs.readFile(p, 'utf8'); const parsed = JSON.parse(raw); if (Array.isArray(parsed)) { out = parsed; break; } } catch {}
  }
  for (const p of stageCandidates) {
    try { const raw = await fs.readFile(p, 'utf8'); const parsed = JSON.parse(raw); if (Array.isArray(parsed)) { stg = parsed; break; } } catch {}
  }
  // Also try Electron userData path via env hint
  const electronUserData = process.env.LYRICDISPLAY_USERDATA || '';
  if (electronUserData) {
    try { const raw = await fs.readFile(path.join(electronUserData, 'UserTemplates', 'output-templates.json'), 'utf8'); const parsed = JSON.parse(raw); if (Array.isArray(parsed) && out.length === 0) out = parsed; } catch {}
    try { const raw = await fs.readFile(path.join(electronUserData, 'UserTemplates', 'stage-templates.json'), 'utf8'); const parsed = JSON.parse(raw); if (Array.isArray(parsed) && stg.length === 0) stg = parsed; } catch {}
  }
  return [...out, ...stg];
}

export function getOutputSettingsForServer(state, outputKey) {
  if (outputKey === 'output1') return state.output1Settings || defaultOutput1Settings;
  if (outputKey === 'output2') return state.output2Settings || defaultOutput2Settings;
  if (outputKey === 'stage') return state.stageSettings || defaultStageSettings;
  if (state.customOutputSettings?.[outputKey]) return state.customOutputSettings[outputKey];
  return defaultOutput1Settings;
}
