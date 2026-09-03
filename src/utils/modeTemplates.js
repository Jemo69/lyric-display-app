import { resolveTemplateById as resolveBuiltIn, getTemplateSettings } from './outputTemplates.js';

export function getContentMode(contentType) {
  return contentType === 'bible' ? 'bible' : 'song';
}

export function getContentModeFromStore(lyricsFileName, bibleVersion, contentMode) {
  if (bibleVersion || contentMode === 'bible') return 'bible';
  return 'song';
}

export function resolveTemplate(templateId, outputKey, userTemplates = []) {
  return resolveBuiltIn(templateId, outputKey, userTemplates);
}

export function getResolvedSettings(templateId, outputKey, userTemplates = []) {
  const tpl = resolveTemplate(templateId, outputKey, userTemplates);
  if (!tpl) return null;
  return getTemplateSettings(tpl, outputKey);
}

export function shallowEqual(a, b) {
  if (a === b) return true;
  if (!a || !b) return false;
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  for (const key of keysA) {
    if (a[key] !== b[key]) return false;
  }
  return true;
}

export function debounce(fn, ms) {
  let timer = null;
  const debounced = (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
  debounced.cancel = () => clearTimeout(timer);
  return debounced;
}
