import { defaultOutput1Settings, defaultOutput2Settings, defaultStageSettings } from '../context/LyricsStore';
import { createLogger } from './logger.js';

const log = createLogger('OutputTemplates');

const baseOutputSettings = { ...defaultOutput1Settings };

export const outputTemplates = [
  {
    id: 'default',
    title: 'Default',
    description: 'Reset to default application settings with standard configuration',
    getSettings: (outputKey) => {
      return outputKey === 'output2' ? { ...defaultOutput2Settings } : { ...defaultOutput1Settings };
    }
  },
  {
    id: 'lyric-lower-third-wide',
    title: 'Lyric — Lower Third Wide',
    description: 'Wide lower-third layout for lyrics with large Bebas Neue and adaptive background band',
    getSettings: (outputKey) => {
      const base = outputKey === 'output2' ? { ...defaultOutput2Settings } : { ...defaultOutput1Settings };
      return {
        ...base,
        fontStyle: 'Bebas Neue',
        fontSize: 72,
        textAlign: 'center',
        lyricsPosition: 'lower',
        backgroundBandVerticalPadding: 30,
        backgroundBandHeightMode: 'adaptive',
        translationFontSizeMode: 'bound',
        translationFontSize: 48,
        translationLineColor: '#FBBF24',
        xMargin: 5,
        yMargin: 3,
      };
    }
  },
];

export const bibleTemplates = [
  {
    id: 'bible-reverent-serif',
    title: 'Bible — Reverent Serif',
    description: 'Elegant serif for scripture with centered layout and reference pill',
    audience: 'bible',
    getSettings: (outputKey) => {
      const base = outputKey === 'output2' ? { ...defaultOutput2Settings } : { ...defaultOutput1Settings };
      return {
        ...base,
        fontStyle: 'Cormorant Garamond',
        fontSize: 56,
        textAlign: 'center',
        lyricsPosition: 'center',
        fontColor: '#FFFFFF',
        translationLineColor: '#93C5FD',
        backgroundOpacity: 4,
        backgroundBandVerticalPadding: 24,
        bibleReferencePosition: 'bottom-center',
        bibleReferenceSize: 28,
        showBibleVersion: true,
        dropShadowOpacity: 6,
        dropShadowBlur: 12,
        dropShadowOffsetY: 6,
        lineHeight: 1.5,
      };
    },
  },
  {
    id: 'bible-scripture-bold',
    title: 'Bible — Scripture Bold',
    description: 'Bold Inter for high-contrast scripture, upper-center with amber translation',
    audience: 'bible',
    getSettings: (outputKey) => {
      const base = outputKey === 'output2' ? { ...defaultOutput2Settings } : { ...defaultOutput1Settings };
      return {
        ...base,
        fontStyle: 'Inter',
        bold: true,
        fontSize: 64,
        textAlign: 'center',
        lyricsPosition: 'upper',
        fontColor: '#FFFFFF',
        translationLineColor: '#F59E0B',
        backgroundOpacity: 2,
        bibleReferencePosition: 'bottom-center',
        bibleReferenceSize: 30,
        showBibleVersion: true,
        dropShadowOpacity: 5,
        dropShadowBlur: 8,
      };
    },
  },
  {
    id: 'bible-minimal-verse',
    title: 'Bible — Minimal Verse',
    description: 'Clean Lato for bright projectors, centered with subtle background',
    audience: 'bible',
    getSettings: (outputKey) => {
      const base = outputKey === 'output2' ? { ...defaultOutput2Settings } : { ...defaultOutput1Settings };
      return {
        ...base,
        fontStyle: 'Lato',
        fontSize: 52,
        textAlign: 'center',
        lyricsPosition: 'center',
        fontColor: '#FFFFFF',
        translationLineColor: '#A7F3D0',
        backgroundOpacity: 2,
        borderSize: 0,
        backgroundBandVerticalPadding: 20,
        bibleReferencePosition: 'bottom-center',
        bibleReferenceSize: 26,
        showBibleVersion: true,
        dropShadowOpacity: 3,
        dropShadowBlur: 6,
      };
    },
  },
  {
    id: 'bible-stage-verse-focus',
    title: 'Stage — Verse Focus',
    description: 'Stage-optimized scripture with large reference, upcoming hidden',
    audience: 'bible',
    getSettings: (outputKey) => {
      const isStage = (() => {
        if (outputKey === 'stage') return true;
        if (String(outputKey).startsWith('custom_')) {
          try {
            const raw = localStorage.getItem('lyrics-store');
            if (raw) {
              const parsed = JSON.parse(raw);
              const customs = parsed?.state?.customOutputs || parsed?.customOutputs || [];
              const found = Array.isArray(customs) ? customs.find((c) => c.id === outputKey) : null;
              if (found) return found.type === 'stage';
            }
          } catch {}
          // fallback: if we cannot determine, treat custom as regular (safer than stage)
          return false;
        }
        return false;
      })();
      if (isStage) {
        return {
          ...defaultStageSettings,
          fontStyle: 'Inter',
          liveFontSize: 96,
          liveAlign: 'center',
          liveColor: '#FFFFFF',
          liveBold: true,
          nextFontSize: 48,
          nextColor: '#808080',
          prevFontSize: 36,
          showNextArrow: false,
          showUpcomingSong: false,
          bibleReferencePosition: 'bottom-center',
          bibleReferenceSize: 32,
          showBibleVersion: true,
          transitionAnimation: 'fade',
          transitionSpeed: 200,
        };
      }
      const base = outputKey === 'output2' ? { ...defaultOutput2Settings } : { ...defaultOutput1Settings };
      return {
        ...base,
        fontStyle: 'Inter',
        fontSize: 60,
        textAlign: 'center',
        lyricsPosition: 'center',
        bibleReferenceSize: 32,
        showBibleVersion: true,
      };
    },
  },
];

const baseStageSettings = { ...defaultStageSettings };

export const stageTemplates = [
  {
    id: 'default',
    title: 'Default',
    description: 'Reset to default stage display settings with standard configuration',
    settings: { ...defaultStageSettings }
  },
  {
    id: 'stage-classic',
    title: 'Classic Stage',
    description: 'Traditional three-line display with clear current/next/previous distinction',
    settings: {
      ...baseStageSettings,
      fontStyle: 'Inter',
      liveFontSize: 72,
      liveAlign: 'center',
      nextFontSize: 48,
      nextColor: '#A0A0A0',
      nextAlign: 'center',
      nextArrowColor: '#4ADE80',
      prevFontSize: 36,
      prevColor: '#606060',
      prevAlign: 'center',
      upcomingSongSize: 20,
      upcomingSongColor: '#A0A0A0',
      bottomBarSize: 18,
      transitionAnimation: 'fade',
      transitionSpeed: 200,
    }
  },
  {
    id: 'stage-minimal',
    title: 'Minimal Focus',
    description: 'Emphasizes current line with minimal distractions, subtle next line preview',
    settings: {
      ...baseStageSettings,
      fontStyle: 'Lato',
      backgroundColor: '#0A0A0A',
      liveFontSize: 84,
      liveAlign: 'center',
      nextFontSize: 40,
      nextColor: '#707070',
      nextItalic: true,
      nextAlign: 'center',
      showNextArrow: false,
      prevFontSize: 32,
      prevColor: '#404040',
      prevAlign: 'center',
      currentSongSize: 20,
      currentSongColor: '#E0E0E0',
      upcomingSongSize: 18,
      upcomingSongColor: '#808080',
      showTime: false,
      bottomBarSize: 16,
      bottomBarColor: '#C0C0C0',
      transitionAnimation: 'slide',
      transitionSpeed: 300,
      messageScrollSpeed: 4000,
    }
  },
  {
    id: 'stage-colorful',
    title: 'Colorful Guide',
    description: 'Color-coded lines for easy tracking with vibrant next-line indicator',
    settings: {
      ...baseStageSettings,
      fontStyle: 'Poppins',
      backgroundColor: '#1A1A2E',
      liveFontSize: 68,
      liveColor: '#60A5FA',
      liveAlign: 'center',
      nextFontSize: 52,
      nextColor: '#34D399',
      nextAlign: 'center',
      nextArrowColor: '#10B981',
      prevFontSize: 38,
      prevColor: '#9CA3AF',
      prevAlign: 'center',
      currentSongSize: 22,
      currentSongColor: '#F3F4F6',
      upcomingSongSize: 20,
      upcomingSongColor: '#D1D5DB',
      bottomBarSize: 18,
      bottomBarColor: '#E5E7EB',
      transitionAnimation: 'fade',
      transitionSpeed: 250,
      messageScrollSpeed: 3500,
    }
  },
  {
    id: 'stage-large-text',
    title: 'Large Text',
    description: 'Extra large fonts for visibility from distance, ideal for large stages',
    settings: {
      ...baseStageSettings,
      fontStyle: 'Roboto',
      liveFontSize: 96,
      liveAllCaps: true,
      liveAlign: 'center',
      nextFontSize: 56,
      nextColor: '#B0B0B0',
      nextAlign: 'center',
      nextArrowColor: '#22C55E',
      prevFontSize: 40,
      prevColor: '#707070',
      prevAlign: 'center',
      currentSongSize: 28,
      upcomingSongSize: 24,
      upcomingSongColor: '#B0B0B0',
      bottomBarSize: 20,
      transitionAnimation: 'fade',
      transitionSpeed: 150,
      messageScrollSpeed: 2500,
    }
  },
  {
    id: 'stage-compact',
    title: 'Compact View',
    description: 'Balanced sizing for smaller stages or confidence monitors',
    settings: {
      ...baseStageSettings,
      fontStyle: 'Open Sans',
      backgroundColor: '#121212',
      liveFontSize: 60,
      liveAlign: 'center',
      nextFontSize: 44,
      nextColor: '#9CA3AF',
      nextAlign: 'center',
      nextArrowColor: '#3B82F6',
      prevFontSize: 36,
      prevColor: '#6B7280',
      prevAlign: 'center',
      currentSongSize: 20,
      currentSongColor: '#F9FAFB',
      upcomingSongSize: 18,
      upcomingSongColor: '#9CA3AF',
      bottomBarSize: 16,
      bottomBarColor: '#D1D5DB',
      transitionAnimation: 'slide',
      transitionSpeed: 200,
    }
  },
];

export function resolveTemplateById(templateId, outputKey, userTemplates = []) {
  if (!templateId) return null;
  if (templateId === 'default') {
    return {
      id: 'default',
      title: 'Default',
      getSettings: (k) => {
        if (k === 'output2') return { ...defaultOutput2Settings };
        if (k === 'stage') return { ...defaultStageSettings };
        // custom outputs: caller should pass correct base via getTemplateSettings fallback; we default to regular
        // hook will handle custom stage via output.type check before calling
        return { ...defaultOutput1Settings };
      },
      settings: outputKey === 'stage' ? { ...defaultStageSettings } : outputKey === 'output2' ? { ...defaultOutput2Settings } : { ...defaultOutput1Settings },
    };
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
    return {
      id: 'default',
      title: 'Default',
      getSettings: () => isStage ? { ...defaultStageSettings } : key === 'output2' ? { ...defaultOutput2Settings } : { ...defaultOutput1Settings },
      settings: isStage ? { ...defaultStageSettings } : key === 'output2' ? { ...defaultOutput2Settings } : { ...defaultOutput1Settings },
    };
  }
  const allBuiltIns = [...outputTemplates, ...bibleTemplates, ...stageTemplates];
  const found = allBuiltIns.find((t) => t.id === templateId);
  if (found) return found;
  const user = (userTemplates || []).find((t) => t.id === templateId);
  if (user) return user;
  return null;
}

export function getTemplateSettings(template, outputKey) {
  if (!template) return null;
  if (typeof template.getSettings === 'function') return template.getSettings(outputKey);
  return template.settings || null;
}

export function allOutputTemplatesForOutput(outputKey, userTemplates = []) {
  if (outputKey === 'stage') {
    return [...stageTemplates, ...bibleTemplates.filter((t) => t.id.includes('stage')), ...userTemplates];
  }
  return [...outputTemplates, ...bibleTemplates, ...userTemplates];
}

export function getAllKnownTemplateIds(userTemplates = []) {
  const builtIns = [...outputTemplates, ...bibleTemplates, ...stageTemplates].map((t) => t.id);
  const userIds = (userTemplates || []).map((t) => t.id);
  return [...builtIns, ...userIds];
}

log.debug('Loaded output templates', { outputCount: outputTemplates.length, bibleCount: bibleTemplates.length, stageCount: stageTemplates.length });