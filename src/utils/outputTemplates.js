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

log.debug('Loaded output templates', { outputCount: outputTemplates.length, stageCount: stageTemplates.length });