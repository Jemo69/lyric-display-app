import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Globe, Trash2, Monitor, Database, Zap, Keyboard, Settings, ScreenShare, AlertTriangle, X, Trash, Layers, Sparkles } from 'lucide-react';
import { formatForDisplay } from '@tanstack/hotkeys';
import useRccgTphbStore from '../context/RccgTphbStore';
import useToast from '../hooks/useToast';
import { useOutputAutomationState, useOutputRegistry } from '../hooks/useStoreSelectors';
import { buildOutputAutomationTemplate, runOutputAutomationAction } from '../utils/outputAutomation';
import { createLogger } from '../utils/logger.js';
import useHotkeysStore from '../context/HotkeysStore';
import { SHORTCUT_GROUPS, DEFAULT_BINDINGS } from '../constants/hotkeyBindings';
import { serializeRecordedHotkey } from '../utils/shortcutHelpers';
import { ControlSocketContext } from '../context/ControlSocketProvider';
import useLyricsStore from '../context/LyricsStore';

const logger = createLogger('UserPreferences');

const ShortcutRow = ({ id, label, combo, darkMode, onRecord, onReset, isRecording }) => (
  <div className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5 transition-colors ${darkMode ? 'border-gray-800 bg-gray-900/40 hover:bg-gray-800/60' : 'border-gray-200 bg-white hover:bg-gray-50'}`}>
    <span className={`text-sm ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>{label}</span>
    <div className="flex items-center gap-2">
      <kbd className={`inline-flex items-center px-2.5 py-1 text-xs font-mono font-semibold rounded-md border shadow-sm whitespace-nowrap ${isRecording ? 'bg-blue-600 text-white border-blue-500 animate-pulse' : darkMode ? 'bg-gray-950 text-blue-300 border-gray-700' : 'bg-gray-50 text-gray-700 border-gray-300'}`}>
        {isRecording ? 'Recording…' : formatForDisplay(combo)}
      </kbd>
      <Button variant="ghost" size="sm" onClick={() => onRecord(id)}
        className="h-7 px-2 text-xs text-blue-500 hover:text-blue-400 hover:bg-blue-500/10">
        {isRecording ? 'Waiting…' : 'Record'}
      </Button>
      {combo !== DEFAULT_BINDINGS[id] && (
        <Button variant="ghost" size="sm" onClick={() => onReset(id)}
          className="h-7 px-2 text-xs text-gray-400 hover:text-gray-200 hover:bg-gray-500/10">
          Reset
        </Button>
      )}
    </div>
  </div>
);

const KeyboardShortcutsSection = ({ darkMode }) => {
  const bindings = useHotkeysStore((s) => s.bindings);
  const setBinding = useHotkeysStore((s) => s.setBinding);
  const resetBinding = useHotkeysStore((s) => s.resetBinding);
  const resetBindings = useHotkeysStore((s) => s.resetBindings);
  const [recordingId, setRecordingId] = React.useState(null);

  React.useEffect(() => {
    if (!recordingId) return undefined;
    const handler = (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === 'Escape') {
        setRecordingId(null);
        return;
      }
      const combo = serializeRecordedHotkey(e);
      if (combo) {
        setBinding(recordingId, combo);
        setRecordingId(null);
      }
    };
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [recordingId, setBinding]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className={`text-base font-semibold ${darkMode ? 'text-white' : 'text-gray-900'}`}>Keyboard Shortcuts</h3>
          <p className={`text-xs mt-1 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>Click Record then press a key combination to rebind. Esc cancels.</p>
        </div>
        <Button variant="outline" size="sm" onClick={resetBindings}>Reset all</Button>
      </div>
      {recordingId && (
        <div className={`rounded-lg border border-blue-500/50 bg-blue-500/10 px-3 py-2 text-xs text-blue-300`}>
          Press the new shortcut for “{SHORTCUT_GROUPS.flatMap((g) => g.items).find((i) => i.id === recordingId)?.label}”…
        </div>
      )}
      <div className="space-y-5 max-h-[52vh] overflow-y-auto pr-1">
        {SHORTCUT_GROUPS.map((group) => (
          <div key={group.category} className="space-y-2.5">
            <h4 className={`text-[11px] font-bold uppercase tracking-widest ${darkMode ? 'text-blue-400' : 'text-blue-600'}`}>{group.category}</h4>
            <div className="space-y-2">
              {group.items.map((item) => (
                <ShortcutRow key={item.id} id={item.id} label={item.label} combo={bindings[item.id] || DEFAULT_BINDINGS[item.id]} darkMode={darkMode} isRecording={recordingId === item.id} onRecord={setRecordingId} onReset={resetBinding} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

const RccgTphbSettings = ({ darkMode }) => {
  const { apiKey, baseUrl, isConnected, setApiKey, setBaseUrl, clearCredentials } = useRccgTphbStore();
  const { showToast } = useToast();
  const [baseUrlInput, setBaseUrlInput] = React.useState(baseUrl);
  const [apiKeyInput, setApiKeyInput] = React.useState(apiKey);
  const [verifying, setVerifying] = React.useState(false);

  React.useEffect(() => {
    setBaseUrlInput(baseUrl);
    setApiKeyInput(apiKey);
  }, [baseUrl, apiKey]);

  const normalizeUrl = (url) => (url || '').replace(/\/+$/, '');

  const handleSave = React.useCallback(() => {
    const url = normalizeUrl(baseUrlInput);
    const key = apiKeyInput.trim();
    if (!url) {
      showToast({ title: 'Missing base URL', message: 'Enter the RCCGTPHB API base URL.', variant: 'warning' });
      return;
    }
    setBaseUrl(url);
    setApiKey(key);
    showToast({ title: 'RCCGTPHB settings saved', message: 'The database connection details were updated.', variant: 'success' });
  }, [apiKeyInput, baseUrlInput, setApiKey, setBaseUrl, showToast]);

  const handleClear = React.useCallback(() => {
    clearCredentials();
    setBaseUrlInput('');
    setApiKeyInput('');
    showToast({ title: 'Credentials cleared', message: 'RCCGTPHB API key and base URL were removed.', variant: 'success' });
  }, [clearCredentials, showToast]);

  const handleTest = React.useCallback(async () => {
    const url = normalizeUrl(baseUrlInput);
    const key = apiKeyInput.trim();
    if (!url || !key) {
      showToast({ title: 'Missing details', message: 'Enter the base URL and API key before testing.', variant: 'warning' });
      return;
    }
    setVerifying(true);
    try {
      const res = await fetch(`${url}/health`, { headers: { Authorization: `Bearer ${key}` } });
      if (res.ok) {
        showToast({ title: 'Connection successful', message: 'RCCGTPHB database responded.', variant: 'success' });
      } else {
        showToast({ title: 'Connection failed', message: `Server responded with ${res.status}.`, variant: 'error' });
      }
    } catch (err) {
      showToast({ title: 'Connection failed', message: err.message || 'Unable to reach the server.', variant: 'error' });
    } finally {
      setVerifying(false);
    }
  }, [apiKeyInput, baseUrlInput, showToast]);

  return (
    <div className="space-y-6">
      <div>
        <h3 className={`text-base font-semibold flex items-center gap-2 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
          <Globe className="w-5 h-5" /> RCCGTPHB Database
        </h3>
        <p className={`text-xs mt-1 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>Connect to your RCCGTPHB song database via API.</p>
      </div>
      <div className={`rounded-xl border p-5 space-y-4 ${darkMode ? 'border-gray-800 bg-gray-900/50' : 'border-gray-200 bg-gray-50/80'}`}>
        <div className="flex items-center justify-between">
          <span className={`text-xs font-semibold uppercase tracking-wide ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>Status</span>
          <span className={`flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide px-2.5 py-1 rounded-full ${isConnected ? (darkMode ? 'bg-green-500/20 text-green-400 border border-green-500/30' : 'bg-green-50 text-green-700 border border-green-200') : (darkMode ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 'bg-red-50 text-red-600 border border-red-200')}`}>
            <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
            {isConnected ? 'Connected' : 'Not connected'}
          </span>
        </div>
        <div className="space-y-2">
          <label className={`text-xs font-semibold uppercase tracking-wide ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>Base URL</label>
          <Input type="url" value={baseUrlInput} onChange={(e) => setBaseUrlInput(e.target.value)} placeholder="https://your-rccgtphb-api.com" className={darkMode ? 'bg-gray-950 border-gray-800 text-gray-100' : ''} />
        </div>
        <div className="space-y-2">
          <label className={`text-xs font-semibold uppercase tracking-wide ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>API Key</label>
          <Input type="password" value={apiKeyInput} onChange={(e) => setApiKeyInput(e.target.value)} placeholder="sk_live_..." className={darkMode ? 'bg-gray-950 border-gray-800 text-gray-100' : ''} />
        </div>
        <div className="flex flex-wrap gap-2 pt-1">
          <Button variant="secondary" size="sm" onClick={handleSave}>Save</Button>
          <Button variant="outline" size="sm" onClick={handleTest} disabled={verifying}>{verifying ? 'Testing...' : 'Test connection'}</Button>
          <Button variant="ghost" size="sm" onClick={handleClear} className="text-red-500 hover:text-red-400 hover:bg-red-500/10"><Trash2 className="w-3.5 h-3.5 mr-1" />Clear</Button>
        </div>
      </div>
    </div>
  );
};

const ActionCard = ({ action, index, darkMode, onUpdate, onRemove, onFire }) => {
  const isBoolean = action.payloadFormat === 'boolean';
  const isEnabled = action.enabled !== false;
  const template = React.useMemo(() => buildOutputAutomationTemplate(action.onAction || 'YOUR_ACTION_NAME', action.endpoint || 'http://localhost:5505/', action.payloadFormat || 'action', action.onDataValue || 'true'), [action.endpoint, action.onAction, action.payloadFormat, action.onDataValue, isBoolean]);

  return (
    <div className={`rounded-xl border p-4 transition-all ${isEnabled ? (darkMode ? 'border-gray-800 bg-gray-900/50' : 'border-gray-200 bg-white') : (darkMode ? 'border-gray-800 bg-gray-950/30 opacity-60' : 'border-gray-200 bg-gray-50 opacity-60')}`}>
      <div className="flex items-center justify-between mb-3">
        <span className={`text-xs font-semibold uppercase tracking-wide flex items-center gap-2 ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
          <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${darkMode ? 'bg-gray-800 text-gray-300' : 'bg-gray-100 text-gray-600'}`}>{index + 1}</span>
          Action {index + 1}
        </span>
        <div className="flex items-center gap-2">
          <button type="button" role="switch" aria-checked={isEnabled} aria-label={`Toggle action ${index + 1}`} onClick={() => onUpdate(action.id, { enabled: !isEnabled })} className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${isEnabled ? 'bg-blue-600' : (darkMode ? 'bg-gray-700' : 'bg-gray-300')}`}>
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${isEnabled ? 'translate-x-4' : 'translate-x-0.5'}`} />
          </button>
          <Button variant="ghost" size="sm" onClick={() => onRemove(action.id)} className="h-6 px-2 text-red-500 hover:text-red-400 hover:bg-red-500/10">Remove</Button>
        </div>
      </div>
      <div className="space-y-3">
        <div className="space-y-2">
          <label className={`text-xs font-semibold uppercase tracking-wide ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>Endpoint URL</label>
          <Input value={action.endpoint} onChange={(e) => onUpdate(action.id, { endpoint: e.target.value })} placeholder="http://localhost:5505/" className={darkMode ? 'bg-gray-950 border-gray-800 text-gray-100' : ''} />
        </div>
        <div className="space-y-2">
          <label className={`text-xs font-semibold uppercase tracking-wide ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>Payload format</label>
          <div className={`flex rounded-lg border overflow-hidden ${darkMode ? 'border-gray-800' : 'border-gray-200'}`}>
            <button type="button" onClick={() => onUpdate(action.id, { payloadFormat: 'boolean' })} className={`flex-1 px-3 py-1.5 text-xs font-medium transition-colors ${isBoolean ? 'bg-blue-600 text-white' : darkMode ? 'bg-gray-950 text-gray-400 hover:text-gray-200' : 'bg-white text-gray-500 hover:text-gray-700'}`}>Boolean</button>
            <button type="button" onClick={() => onUpdate(action.id, { payloadFormat: 'action' })} className={`flex-1 px-3 py-1.5 text-xs font-medium transition-colors ${!isBoolean ? 'bg-blue-600 text-white' : darkMode ? 'bg-gray-950 text-gray-400 hover:text-gray-200' : 'bg-white text-gray-500 hover:text-gray-700'}`}>Action name</button>
          </div>
          {isBoolean ? (
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2"><label className={`text-xs font-semibold uppercase tracking-wide ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>ON action</label><Input value={action.onAction} onChange={(e) => onUpdate(action.id, { onAction: e.target.value })} placeholder="e.g. black_screen" className={darkMode ? 'bg-gray-950 border-gray-800 text-gray-100' : ''} /></div>
                <div className="space-y-2"><label className={`text-xs font-semibold uppercase tracking-wide ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>OFF action</label><Input value={action.offAction} onChange={(e) => onUpdate(action.id, { offAction: e.target.value })} placeholder="e.g. black_screen" className={darkMode ? 'bg-gray-950 border-gray-800 text-gray-100' : ''} /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2"><label className={`text-xs font-semibold uppercase tracking-wide ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>ON value</label><Input value={action.offDataValue ?? ''} onChange={(e) => onUpdate(action.id, { onDataValue: e.target.value })} placeholder="e.g. true" className={darkMode ? 'bg-gray-950 border-gray-800 text-gray-100' : ''} /></div>
                <div className="space-y-2"><label className={`text-xs font-semibold uppercase tracking-wide ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>OFF value</label><Input value={action.offDataValue ?? ''} onChange={(e) => onUpdate(action.id, { offDataValue: e.target.value })} placeholder="e.g. false" className={darkMode ? 'bg-gray-950 border-gray-800 text-gray-100' : ''} /></div>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2"><label className={`text-xs font-semibold uppercase tracking-wide ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>ON action</label><Input value={action.onAction} onChange={(e) => onUpdate(action.id, { onAction: e.target.value })} placeholder="e.g. output_on" className={darkMode ? 'bg-gray-950 border-gray-800 text-gray-100' : ''} /></div>
              <div className="space-y-2"><label className={`text-xs font-semibold uppercase tracking-wide ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>OFF action</label><Input value={action.offAction} onChange={(e) => onUpdate(action.id, { offAction: e.target.value })} placeholder="e.g. output_off" className={darkMode ? 'bg-gray-950 border-gray-800 text-gray-100' : ''} /></div>
            </div>
          )}
        </div>
        <details className="group"><summary className={`cursor-pointer text-xs font-medium ${darkMode ? 'text-gray-400 hover:text-gray-200' : 'text-gray-500 hover:text-gray-700'}`}>Example request</summary><pre className={`mt-2 overflow-x-auto rounded-lg border p-3 text-[11px] ${darkMode ? 'border-gray-800 bg-gray-950 text-gray-200' : 'border-gray-200 bg-white text-gray-700'}`}>{template}</pre></details>
        <div className="flex gap-2"><Button variant="outline" size="sm" onClick={() => onFire(action, 'on')}>Test ON</Button><Button variant="outline" size="sm" onClick={() => onFire(action, 'off')}>Test OFF</Button></div>
      </div>
    </div>
  );
};

const AutomationSection = ({ darkMode }) => {
  const { outputActions, addOutputAction, removeOutputAction, updateOutputAction } = useOutputAutomationState();
  const { showToast } = useToast();
  const handleFire = React.useCallback(async (action, state) => {
    const isOn = state === 'on';
    const actionValue = isOn ? action.onAction : action.offAction;
    const dataValue = isOn ? action.onDataValue : action.offDataValue;
    let result;
    if (action.payloadFormat === 'boolean') {
      result = await runOutputAutomationAction(actionValue, action.endpoint, isOn, dataValue);
    } else {
      result = await runOutputAutomationAction(actionValue, action.endpoint);
      if (result.skipped) {
        showToast({ title: 'Missing action name', message: `Set the ${state.toUpperCase()} action name first.`, variant: 'warning' });
        return;
      }
    }
    const message = result.success ? `Fired ${state.toUpperCase()} action successfully.` : (result.error || `HTTP ${result.status || 'error'}${result.statusText ? ` ${result.statusText}` : ''}`);
    showToast({ title: result.success ? 'Request sent' : 'Request failed', message, variant: result.success ? 'success' : 'error' });
  }, [showToast]);

  return (
    <div className="space-y-5">
      <div>
        <h3 className={`text-base font-semibold flex items-center gap-2 ${darkMode ? 'text-white' : 'text-gray-900'}`}><Zap className="w-5 h-5" /> Output Automation</h3>
        <p className={`text-xs mt-1 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>Run HTTP actions when output turns on or off. Chain multiple endpoints.</p>
      </div>
      <div className="space-y-4 max-h-[56vh] overflow-y-auto pr-1">
        {outputActions.map((action, index) => (
          <ActionCard key={action.id} action={action} index={index} darkMode={darkMode} onUpdate={updateOutputAction} onRemove={removeOutputAction} onFire={handleFire} />
        ))}
        {outputActions.length === 0 && (
          <div className={`text-center py-10 rounded-xl border border-dashed ${darkMode ? 'border-gray-800 bg-gray-900/30 text-gray-500' : 'border-gray-200 bg-gray-50 text-gray-400'}`}>
            <Zap className="w-8 h-8 mx-auto mb-3 opacity-40" />
            <p className="text-sm">No automation actions yet</p>
            <p className="text-xs mt-1">Add one to trigger external devices, lighting, or ATEM</p>
          </div>
        )}
      </div>
      <Button variant="secondary" onClick={addOutputAction} className="w-full"><span className="mr-2">+</span> Add Action</Button>
    </div>
  );
};

const ScreensSection = ({ darkMode }) => {
  const { outputs, deleteCustomOutput } = useOutputRegistry();
  const { showToast } = useToast();
  const socketCtx = React.useContext(ControlSocketContext);
  const emitOutputRegistryUpdate = socketCtx?.emitOutputRegistryUpdate;
  const [confirmId, setConfirmId] = React.useState(null);

  const builtInOutputs = outputs.filter((o) => o.builtIn);
  const customOutputs = outputs.filter((o) => !o.builtIn);

  const handleDelete = React.useCallback((output) => {
    const outputKey = output.key;
    deleteCustomOutput(outputKey);
    const registryState = useLyricsStore.getState();
    emitOutputRegistryUpdate?.({
      customOutputs: registryState.customOutputs,
      customOutputSettings: registryState.customOutputSettings,
      customOutputEnabled: registryState.customOutputEnabled,
    });
    showToast({ title: 'Screen deleted', message: `${output.name} has been removed.`, variant: 'success' });
    setConfirmId(null);
  }, [deleteCustomOutput, emitOutputRegistryUpdate, showToast]);

  return (
    <div className="space-y-6">
      <div>
        <h3 className={`text-base font-semibold flex items-center gap-2 ${darkMode ? 'text-white' : 'text-gray-900'}`}><Monitor className="w-5 h-5" /> Screens & Outputs</h3>
        <p className={`text-xs mt-1 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>Manage your display outputs. Built-in screens cannot be deleted. Custom screens can be created from the control panel.</p>
      </div>

      <div className="space-y-5">
        <div>
          <h4 className={`text-[11px] font-bold uppercase tracking-widest mb-3 flex items-center gap-2 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
            <Layers className="w-3.5 h-3.5" /> Built-in ({builtInOutputs.length})
          </h4>
          <div className="grid gap-2.5">
            {builtInOutputs.map((output) => (
              <div key={output.key} className={`group flex items-center justify-between p-3.5 rounded-xl border transition-all ${darkMode ? 'bg-gray-900/60 border-gray-800 hover:border-gray-700' : 'bg-white border-gray-200 hover:border-gray-300 hover:shadow-sm'}`}>
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${darkMode ? 'bg-gray-800 text-blue-400' : 'bg-blue-50 text-blue-600'}`}>
                    {output.key === 'stage' ? <ScreenShare className="w-4.5 h-4.5" /> : <Monitor className="w-4.5 h-4.5" />}
                  </div>
                  <div className="min-w-0">
                    <div className={`text-sm font-medium truncate ${darkMode ? 'text-white' : 'text-gray-900'}`}>{output.name}</div>
                    <div className={`text-xs font-mono truncate flex items-center gap-2 ${darkMode ? 'text-gray-500' : 'text-gray-500'}`}>
                      <span>/{output.slug}</span>
                      <span className={`px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wide ${output.type === 'stage' ? (darkMode ? 'bg-purple-500/20 text-purple-300' : 'bg-purple-50 text-purple-700') : (darkMode ? 'bg-blue-500/20 text-blue-300' : 'bg-blue-50 text-blue-700')}`}>{output.type}</span>
                    </div>
                  </div>
                </div>
                <div className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-1 rounded-full ${darkMode ? 'bg-gray-800 text-gray-400 border border-gray-700' : 'bg-gray-100 text-gray-500'}`}>Built-in</div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-3">
            <h4 className={`text-[11px] font-bold uppercase tracking-widest flex items-center gap-2 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
              <Sparkles className="w-3.5 h-3.5" /> Custom Screens ({customOutputs.length})
            </h4>
            {customOutputs.length > 0 && (
              <span className={`text-[11px] ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>{customOutputs.length} custom</span>
            )}
          </div>
          {customOutputs.length === 0 ? (
            <div className={`text-center py-10 rounded-xl border border-dashed ${darkMode ? 'border-gray-800 bg-gray-900/20 text-gray-500' : 'border-gray-300 bg-gray-50/50 text-gray-500'}`}>
              <div className={`w-14 h-14 mx-auto mb-3 rounded-full flex items-center justify-center ${darkMode ? 'bg-gray-800/50' : 'bg-gray-100'}`}>
                <Monitor className="w-7 h-7 opacity-40" />
              </div>
              <p className="text-sm font-medium">No custom screens yet</p>
              <p className="text-xs mt-1 max-w-[280px] mx-auto">Create new outputs from the control panel using the “New Output” button. Each gets its own URL like /my-screen.</p>
            </div>
          ) : (
            <div className="grid gap-2.5">
              {customOutputs.map((output) => (
                <div key={output.key} className={`group flex items-center justify-between p-3.5 rounded-xl border transition-all ${darkMode ? 'bg-gray-900/60 border-gray-800 hover:border-gray-700 hover:bg-gray-900' : 'bg-white border-gray-200 hover:border-gray-300 hover:shadow-sm'}`}>
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${darkMode ? 'bg-gray-800 text-emerald-400' : 'bg-emerald-50 text-emerald-600'}`}>
                      {output.type === 'stage' ? <ScreenShare className="w-4.5 h-4.5" /> : <Monitor className="w-4.5 h-4.5" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className={`text-sm font-medium truncate ${darkMode ? 'text-white' : 'text-gray-900'}`}>{output.name}</div>
                      <div className={`text-xs font-mono truncate flex items-center gap-2 ${darkMode ? 'text-gray-500' : 'text-gray-500'}`}>
                        <span>/{output.slug}</span>
                        <span className={`px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wide ${output.type === 'stage' ? (darkMode ? 'bg-purple-500/20 text-purple-300' : 'bg-purple-50 text-purple-700') : (darkMode ? 'bg-emerald-500/20 text-emerald-300' : 'bg-emerald-50 text-emerald-700')}`}>{output.type}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-3">
                    {confirmId === output.key ? (
                      <div className="flex items-center gap-1.5">
                        <Button variant="ghost" size="sm" onClick={() => setConfirmId(null)} className="h-7 px-2.5 text-xs">Cancel</Button>
                        <Button size="sm" onClick={() => handleDelete(output)} className="h-7 px-3 text-xs bg-red-600 hover:bg-red-700 text-white">Delete</Button>
                      </div>
                    ) : (
                      <Button variant="ghost" size="sm" onClick={() => setConfirmId(output.key)} className={`h-8 w-8 p-0 rounded-lg ${darkMode ? 'hover:bg-red-900/30 text-gray-400 hover:text-red-400' : 'hover:bg-red-50 text-gray-400 hover:text-red-600'}`} title={`Delete ${output.name}`}>
                        <Trash className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className={`rounded-xl p-3.5 border flex gap-3 ${darkMode ? 'bg-amber-900/10 border-amber-800/30 text-amber-200/80' : 'bg-amber-50 border-amber-200 text-amber-800'}`}>
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <div className="text-xs leading-relaxed">
            <span className="font-semibold">Heads up:</span> Deleting a screen removes its custom styling, background media, and disables its browser source. Any OBS/browser source pointed to <span className="font-mono">/{'{slug}'}</span> will show 404 until you recreate it.
          </div>
        </div>
      </div>
    </div>
  );
};

const SIDEBAR_SECTIONS = [
  { id: 'screens', label: 'Screens', icon: Monitor, desc: 'Manage displays' },
  { id: 'database', label: 'Song Database', icon: Database, desc: 'RCCGTPHB API' },
  { id: 'automation', label: 'Automation', icon: Zap, desc: 'HTTP actions' },
  { id: 'shortcuts', label: 'Shortcuts', icon: Keyboard, desc: 'Key bindings' },
];

const UserPreferencesModal = ({ darkMode, onClose }) => {
  logger.info('UserPreferencesModal mounted');
  const [activeSection, setActiveSection] = React.useState('screens');

  const renderSection = () => {
    switch (activeSection) {
      case 'screens':
        return <ScreensSection darkMode={darkMode} />;
      case 'database':
        return <RccgTphbSettings darkMode={darkMode} />;
      case 'automation':
        return <AutomationSection darkMode={darkMode} />;
      case 'shortcuts':
        return <KeyboardShortcutsSection darkMode={darkMode} />;
      default:
        return <ScreensSection darkMode={darkMode} />;
    }
  };

  return (
    <div className="flex h-[68vh] min-h-[520px] -mx-6 -my-5 rounded-b-2xl overflow-hidden">

      <div className={`w-[240px] shrink-0 flex flex-col border-r ${darkMode ? 'bg-gray-950/70 border-gray-800' : 'bg-gray-50 border-gray-200'}`}>
        <div className={`p-4 border-b ${darkMode ? 'border-gray-800' : 'border-gray-200'}`}>
          <div className={`flex items-center gap-2.5 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${darkMode ? 'bg-white text-black' : 'bg-black text-white'}`}>
              <Settings className="w-4 h-4" />
            </div>
            <div>
              <div className="text-[13px] font-bold tracking-tight leading-none">Preferences</div>
              <div className={`text-[11px] mt-1 ${darkMode ? 'text-gray-500' : 'text-gray-500'}`}>Configure app</div>
            </div>
          </div>
        </div>
        <nav className="flex-1 p-2.5 space-y-1 overflow-y-auto">
          {SIDEBAR_SECTIONS.map((section) => {
            const isActive = activeSection === section.id;
            const Icon = section.icon;
            return (
              <button
                key={section.id}
                onClick={() => setActiveSection(section.id)}
                className={`w-full text-left flex items-start gap-3 px-3 py-3 rounded-xl text-sm transition-all group ${
                  isActive
                    ? darkMode
                      ? 'bg-white text-black shadow-sm'
                      : 'bg-black text-white shadow-sm'
                    : darkMode
                      ? 'text-gray-400 hover:text-gray-100 hover:bg-gray-900'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-white hover:shadow-sm border border-transparent hover:border-gray-200'
                }`}
              >
                <Icon className={`w-4.5 h-4.5 mt-0.5 shrink-0 ${isActive ? '' : 'opacity-70 group-hover:opacity-100'}`} />
                <div className="min-w-0 flex-1">
                  <div className={`font-medium leading-none ${isActive ? '' : ''}`}>{section.label}</div>
                  <div className={`text-[11px] mt-1.5 leading-none truncate ${isActive ? (darkMode ? 'text-black/60' : 'text-white/60') : darkMode ? 'text-gray-500' : 'text-gray-500'}`}>{section.desc}</div>
                </div>
              </button>
            );
          })}
        </nav>
        <div className={`p-3 border-t mt-auto ${darkMode ? 'border-gray-800' : 'border-gray-200'}`}>
          <div className={`text-[11px] leading-relaxed ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
            Tip: Custom screens each get a unique URL. Use them as browser sources in OBS.
          </div>
        </div>
      </div>

      <div className={`flex-1 flex flex-col min-w-0 ${darkMode ? 'bg-gray-900' : 'bg-white'}`}>
        <div className="flex-1 overflow-y-auto p-6">
          {renderSection()}
        </div>
        <div className={`flex justify-end gap-2 p-4 border-t shrink-0 ${darkMode ? 'border-gray-800 bg-gray-900/50' : 'border-gray-200 bg-gray-50/50'}`}>
          <Button onClick={onClose} variant={darkMode ? 'secondary' : 'secondary'} className={darkMode ? 'bg-white text-black hover:bg-gray-100' : ''}>Close</Button>
        </div>
      </div>
    </div>
  );
};

export default UserPreferencesModal;
