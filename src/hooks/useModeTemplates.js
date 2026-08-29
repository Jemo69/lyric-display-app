import { useEffect, useRef, useCallback } from 'react';
import useLyricsStore from '../context/LyricsStore';
import { useControlSocket } from '../context/ControlSocketProvider';
import { getAllOutputs, getOutputSettings } from '../utils/outputs';
import { getContentMode, shallowEqual, debounce } from '../utils/modeTemplates';
import { resolveTemplateById, resolveTemplateForOutput, getTemplateSettings } from '../utils/outputTemplates';
import useToast from './useToast';
import { createLogger } from '../utils/logger.js';

const log = createLogger('ModeTemplates');

export function useModeTemplateApplier({ contentType }) {
  const mode = getContentMode(contentType);
  const prevModeRef = useRef(mode);
  const debounceRef = useRef(null);
  const { emitStyleUpdate } = useControlSocket();
  const { showToast } = useToast();

  const applyForMode = useCallback(async (targetMode) => {
    const state = useLyricsStore.getState();
    const modeTemplates = state.modeTemplates || {};
    const outputs = getAllOutputs(state);
    const applied = [];
    const skipped = [];
    let userTemplatesCache = null;

    const loadUserTemplates = async () => {
      if (userTemplatesCache !== null) return userTemplatesCache;
      if (!window.electronAPI?.templates?.load) {
        userTemplatesCache = [];
        return userTemplatesCache;
      }
      try {
        const [outRes, stageRes] = await Promise.all([
          window.electronAPI.templates.load('output').catch(() => ({ success: false, templates: [] })),
          window.electronAPI.templates.load('stage').catch(() => ({ success: false, templates: [] })),
        ]);
        const out = outRes?.success ? (outRes.templates || []) : [];
        const stg = stageRes?.success ? (stageRes.templates || []) : [];
        userTemplatesCache = [...out, ...stg];
      } catch {
        userTemplatesCache = [];
      }
      return userTemplatesCache;
    };

    for (const out of outputs) {
      const key = out.key;
      const cfg = modeTemplates[key];
      if (!cfg?.enabled) {
        if (cfg && (cfg.song != null || cfg.bible != null)) skipped.push(`${out.name} (OFF)`);
        else if (!cfg) skipped.push(`${out.name} (OFF)`);
        else skipped.push(`${out.name} (OFF)`);
        continue;
      }
      const templateId = cfg[targetMode];
      if (templateId == null) {
        skipped.push(`${out.name} (None)`);
        continue;
      }

      let tpl = resolveTemplateForOutput(templateId, out, []);
      if (!tpl) {
        const userTemplates = await loadUserTemplates();
        tpl = resolveTemplateForOutput(templateId, out, userTemplates);
      }
      // fallback to legacy by-key resolver for backward compat
      if (!tpl) tpl = resolveTemplateById(templateId, key, await loadUserTemplates());
      if (!tpl) {
        log.warn('Template not found', { templateId, outputKey: key });
        showToast({ title: 'Template not found', message: `${out.name} ${targetMode} preference cleared — template not found.`, variant: 'warning' });
        useLyricsStore.getState().setModeTemplate(key, targetMode, null);
        skipped.push(`${out.name} (missing)`);
        continue;
      }

      const settings = getTemplateSettings(tpl, key);
      if (!settings) {
        skipped.push(`${out.name} (no settings)`);
        continue;
      }

      const current = getOutputSettings(state, key);
      // idempotence: skip if shallow equal for a few keys? check if already applied same template recently
      const last = state._lastAppliedModeTemplate?.[key];
      if (last && last.mode === targetMode && last.templateId === templateId) {
        // still check if current already equals target to avoid redundant emit
        let isSame = true;
        for (const k of Object.keys(settings)) {
          if (current?.[k] !== settings[k]) { isSame = false; break; }
        }
        if (isSame) {
          skipped.push(`${out.name} (already applied)`);
          continue;
        }
      } else {
        let isSame = true;
        // quick shallow check: if settings are subset equal, skip emit
        // we do a shallow equal on the intersecting keys from settings
        for (const k of Object.keys(settings)) {
          if (current?.[k] !== settings[k]) { isSame = false; break; }
        }
        if (isSame) {
          skipped.push(`${out.name} (already applied)`);
          continue;
        }
      }

      const snapshot = JSON.parse(JSON.stringify(current));
      useLyricsStore.getState().setLastAppliedModeTemplate(key, { mode: targetMode, templateId, prevSnapshot: snapshot });
      useLyricsStore.getState().updateOutputSettings(key, settings);
      try {
        emitStyleUpdate(key, settings);
      } catch (e) {
        log.error('emitStyleUpdate failed', { key, error: e?.message });
      }
      applied.push(`${out.name}: ${tpl.title || tpl.name || templateId}`);
    }

    if (applied.length > 0) {
      const appliedLabel = applied.join(', ');
      const skippedLabel = skipped.length ? ` · Skipped: ${skipped.join(', ')}` : '';
      showToast({
        title: `${targetMode === 'bible' ? 'Bible' : 'Song'} template applied`,
        message: `Applied to: ${appliedLabel}${skippedLabel}`,
        variant: 'success',
        duration: 4000,
        actions: [
          {
            label: 'Undo',
            onClick: () => {
              const cur = useLyricsStore.getState();
              for (const label of applied) {
                const outName = label.split(':')[0]?.trim();
                const out = outputs.find((o) => o.name === outName);
                if (!out) continue;
                const last = cur._lastAppliedModeTemplate?.[out.key];
                if (last?.prevSnapshot) {
                  cur.updateOutputSettings(out.key, last.prevSnapshot);
                  try { emitStyleUpdate(out.key, last.prevSnapshot); } catch {}
                  cur.clearLastAppliedModeTemplate(out.key);
                }
              }
              showToast({ title: 'Undone', message: 'Restored previous styles.', variant: 'info' });
            },
          },
        ],
      });
    } else if (skipped.length > 0 && modeTemplates && Object.keys(modeTemplates).some((k) => modeTemplates[k]?.enabled)) {
      // only toast skipped if at least one was enabled but none applied (e.g. missing)
      // avoid noise when all OFF
    }
  }, [emitStyleUpdate, showToast]);

  useEffect(() => {
    if (prevModeRef.current === mode) return;
    const prev = prevModeRef.current;
    prevModeRef.current = mode;

    if (debounceRef.current) debounceRef.current.cancel();
    const debounced = debounce(() => {
      log.info('Mode changed', { from: prev, to: mode });
      applyForMode(mode);
    }, 250);
    debounceRef.current = debounced;
    debounced();

    return () => debounced.cancel();
  }, [mode, applyForMode]);

  const reapply = useCallback((outputKey, targetMode) => {
    const m = targetMode || mode;
    const state = useLyricsStore.getState();
    const cfg = state.modeTemplates?.[outputKey];
    if (!cfg) return;
    const templateId = cfg[m];
    if (!templateId) {
      showToast({ title: 'Nothing to re-apply', message: `${outputKey} has — None — for ${m}.`, variant: 'info' });
      return;
    }
    // force reapply even if same mode
    applyForMode(m);
  }, [mode, applyForMode, showToast]);

  return { reapply, applyForMode };
}

export default useModeTemplateApplier;
