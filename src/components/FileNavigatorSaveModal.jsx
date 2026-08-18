import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { X, Folder, FileDown, Loader2, AlertTriangle, FileText } from 'lucide-react';
import { OPEN_FILE_SAVE_NAVIGATOR_EVENT, canUseFileNavigator } from '../utils/fileNavigatorEvents';
import { normalizeNavigatorSaveExtension, validateNavigatorSaveName } from 'shared/fileNavigatorSave';
import { createLogger } from '../utils/logger';

const log = createLogger('FileNavigatorSave');

export default function FileNavigatorSaveModal({ darkMode = false }) {
  const [open, setOpen] = useState(false);
  const [destinations, setDestinations] = useState([]);
  const [selectedPath, setSelectedPath] = useState('');
  const [name, setName] = useState('');
  const [extension, setExtension] = useState('txt');
  const [error, setError] = useState('');
  const [conflict, setConflict] = useState(null);
  const [saving, setSaving] = useState(false);
  const [opening, setOpening] = useState(false);

  const pendingRef = useRef(null);
  const detailsRef = useRef(null);

  const closePanel = useCallback((result = { canceled: true }) => {
    pendingRef.current?.onComplete?.(result);
    pendingRef.current = null;
    detailsRef.current = null;
    setOpen(false);
    setDestinations([]);
    setName('');
    setExtension('txt');
    setError('');
    setConflict(null);
    setSaving(false);
    setOpening(false);
  }, []);

  const openPanel = useCallback(async (detail) => {
    detailsRef.current = detail || {};
    pendingRef.current = { onComplete: detailsRef.current.onComplete };
    setOpen(true);
    setOpening(true);
    setError('');
    try {
      const result = await window.electronAPI.fileNavigator.getSaveDestinations(detailsRef.current.initialDirectory || null);
      const available = (result?.success ? result.destinations || [] : []).filter((entry) => entry?.available);
      if (available.length === 0) {
        closePanel({ unavailable: true });
        return;
      }
      setDestinations(available);
      const preferred = available.find((entry) => entry.preferred) || available[0];
      setSelectedPath(preferred.path);
      const normalized = normalizeNavigatorSaveExtension(detailsRef.current.extension);
      const offered = (Array.isArray(detailsRef.current.availableExtensions)
        ? detailsRef.current.availableExtensions.map(normalizeNavigatorSaveExtension).filter(Boolean)
        : [])
        .concat(normalized ? [normalized] : []);
      const extensions = [...new Set(offered.length > 0 ? offered : ['txt', 'lrc'])];
      setExtension(normalized || extensions[0]);
      setName(String(detailsRef.current.suggestedName || '').replace(/\.(?:txt|lrc)$/i, ''));
    } catch (error) {
      log.error('Failed to open save navigator', error);
      closePanel({ unavailable: true });
    } finally {
      setOpening(false);
    }
  }, [closePanel]);

  const resolveContent = useCallback((byExtension, selectedExtension) => {
    if (byExtension == null) return '';
    if (typeof byExtension === 'string') return byExtension;
    if (typeof byExtension === 'object') {
      return byExtension[selectedExtension] || byExtension.txt || byExtension.lrc || '';
    }
    return '';
  }, []);

  const handleSave = useCallback(async (forcedOverwrite = false) => {
    if (saving) return;
    const validated = validateNavigatorSaveName(name, extension);
    if (!validated.valid) {
      setError(validated.error);
      return;
    }
    setSaving(true);
    setError('');
    try {
      const prepareResult = await window.electronAPI.fileNavigator.prepareSave({
        directoryPath: selectedPath,
        fileName: validated.fileName,
        extension: validated.extension,
        overwrite: forcedOverwrite,
      });
      if (!prepareResult?.success) {
        setError(prepareResult?.error || 'Could not prepare the save');
        return;
      }
      if (prepareResult.exists && !prepareResult.writeGranted) {
        setConflict({
          filePathInfo: prepareResult.fileName,
          baseName: validated.baseName,
          extension: validated.extension,
        });
        return;
      }
      const content = resolveContent(detailsRef.current?.contentByExtension, validated.extension);
      await window.electronAPI.writeFile(prepareResult.filePath, content);
      closePanel({
        canceled: false,
        filePath: prepareResult.filePath,
        fileName: prepareResult.fileName,
      });
    } catch (error) {
      setError(error?.message || 'Could not save the lyrics file');
    } finally {
      setSaving(false);
    }
  }, [closePanel, extension, name, resolveContent, saving, selectedPath]);

  useEffect(() => {
    if (!canUseFileNavigator()) return undefined;
    const handleSaveRequest = (event) => {
      openPanel(event.detail || {});
    };
    window.addEventListener(OPEN_FILE_SAVE_NAVIGATOR_EVENT, handleSaveRequest);
    return () => window.removeEventListener(OPEN_FILE_SAVE_NAVIGATOR_EVENT, handleSaveRequest);
  }, [openPanel]);

  useEffect(() => {
    if (!open) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closePanel();
      }
      if (event.key === 'Enter' && !conflict && !saving) {
        event.preventDefault();
        handleSave(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [open, conflict, saving, closePanel, handleSave]);

  const dark = !!darkMode;
  const panelBg = dark ? 'bg-gray-900 border-gray-700' : 'bg-white border-gray-200';
  const textPrimary = dark ? 'text-gray-100' : 'text-gray-800';
  const textMuted = dark ? 'text-gray-400' : 'text-gray-500';
  const inputBg = dark ? 'bg-gray-800 border-gray-600' : 'bg-gray-50 border-gray-300';
  const rowHover = dark ? 'hover:bg-gray-800' : 'hover:bg-gray-50';

  const extensionOptions = useMemo(() => {
    const offered = (Array.isArray(detailsRef.current?.availableExtensions)
      ? detailsRef.current.availableExtensions.map(normalizeNavigatorSaveExtension).filter(Boolean)
      : [])
      .concat(normalizeNavigatorSaveExtension(detailsRef.current?.extension) ? [normalizeNavigatorSaveExtension(detailsRef.current.extension)] : []);
    return [...new Set(offered.length > 0 ? offered : ['txt', 'lrc'])];
  }, [open]);

  if (!open || !canUseFileNavigator()) return null;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) closePanel();
      }}
      data-testid="file-navigator-save-modal"
    >
      <div className={`flex w-[520px] max-w-[92vw] flex-col overflow-hidden rounded-xl border shadow-2xl ${panelBg}`}>
        <div className={`flex items-center justify-between gap-3 border-b px-4 py-3 ${dark ? 'border-gray-700' : 'border-gray-200'}`}>
          <div className="flex items-center gap-2">
            <FileDown className={`w-4 h-4 ${dark ? 'text-gray-300' : 'text-gray-600'}`} />
            <h2 className={`text-sm font-semibold ${textPrimary}`}>Save lyrics file</h2>
            {opening && <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-400" />}
          </div>
          <button
            className={`rounded-md p-1.5 ${dark ? 'hover:bg-gray-700 text-gray-300' : 'hover:bg-gray-100 text-gray-500'}`}
            onClick={() => closePanel()}
            aria-label="Close save dialog"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex flex-col gap-3 px-4 py-4">
          <div>
            <label className={`mb-1 block text-xs font-medium ${textMuted}`}>Save to folder</label>
            <div className={`max-h-40 overflow-y-auto rounded-lg border ${dark ? 'border-gray-700' : 'border-gray-200'}`}>
              {destinations.map((destination) => (
                <button
                  key={destination.path}
                  className={`flex w-full items-center gap-2 px-3 py-2 text-left ${rowHover} ${selectedPath === destination.path ? (dark ? 'bg-gray-700/60' : 'bg-blue-50') : ''}`}
                  onClick={() => { setSelectedPath(destination.path); setError(''); }}
                  data-testid="file-navigator-save-destination"
                >
                  <Folder className={`w-4 h-4 shrink-0 ${dark ? 'text-amber-400' : 'text-amber-500'}`} />
                  <span className="min-w-0 flex-1">
                    <span className={`block truncate text-sm ${textPrimary}`}>{destination.name}</span>
                    {destination.detail && (
                      <span className={`block truncate text-[11px] ${textMuted}`}>{destination.detail}</span>
                    )}
                  </span>
                  {destination.preferred && (
                    <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] uppercase ${dark ? 'bg-gray-700 text-gray-300' : 'bg-gray-100 text-gray-600'}`}>
                      Current
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-end gap-2">
            <div className="flex-1">
              <label className={`mb-1 block text-xs font-medium ${textMuted}`}>File name</label>
              <input
                className={`w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 ${inputBg} ${textPrimary}`}
                value={name}
                onChange={(event) => { setName(event.target.value); setError(''); setConflict(null); }}
                placeholder="lyrics"
                data-testid="file-navigator-save-name"
                autoFocus
              />
            </div>
            <div>
              <label className={`mb-1 block text-xs font-medium ${textMuted}`}>Type</label>
              <select
                className={`rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 ${inputBg} ${textPrimary}`}
                value={extension}
                onChange={(event) => { setExtension(event.target.value); setError(''); setConflict(null); }}
                data-testid="file-navigator-save-extension"
              >
                {extensionOptions.map((ext) => <option key={ext} value={ext}>{ext.toUpperCase()}</option>)}
              </select>
            </div>
          </div>

          {conflict && (
            <div className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm ${dark ? 'border-amber-600/60 bg-amber-900/20 text-amber-300' : 'border-amber-300 bg-amber-50 text-amber-700'}`}>
              <span className="inline-flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span className="truncate">“{conflict.baseName}.{conflict.extension}” already exists in that folder.</span>
              </span>
              <span className="flex shrink-0 gap-2">
                <button
                  className="rounded-md border border-current px-2.5 py-1 text-xs font-semibold"
                  onClick={() => handleSave(true)}
                  data-testid="file-navigator-save-overwrite"
                >
                  Overwrite
                </button>
                <button
                  className="rounded-md px-2.5 py-1 text-xs font-medium opacity-80 hover:opacity-100"
                  onClick={() => setConflict(null)}
                >
                  Change name
                </button>
              </span>
            </div>
          )}

          {error && (
            <p className="inline-flex items-center gap-1.5 text-xs text-amber-600">
              <AlertTriangle className="w-3.5 h-3.5" />
              {error}
            </p>
          )}
        </div>

        <div className={`flex items-center justify-end gap-2 border-t px-4 py-3 ${dark ? 'border-gray-700' : 'border-gray-200'}`}>
          <button
            className={`rounded-lg border px-4 py-2 text-sm font-medium ${dark ? 'border-gray-600 hover:bg-gray-800 text-gray-200' : 'border-gray-300 hover:bg-gray-50 text-gray-700'}`}
            onClick={() => closePanel()}
          >
            Cancel
          </button>
          <button
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            disabled={!selectedPath || !name.trim() || saving || opening}
            onClick={() => handleSave(false)}
            data-testid="file-navigator-save-confirm"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
            Save
          </button>
        </div>
      </div>
    </div>
  );
}