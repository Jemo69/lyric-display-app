import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Globe, Trash2 } from 'lucide-react';
import { formatForDisplay } from '@tanstack/hotkeys';
import useRccgTphbStore from '../context/RccgTphbStore';
import useToast from '../hooks/useToast';
import { useOutputAutomationState } from '../hooks/useStoreSelectors';
import { buildOutputAutomationTemplate, runOutputAutomationAction } from '../utils/outputAutomation';
import { createLogger } from '../utils/logger.js';
import useHotkeysStore from '../context/HotkeysStore';
import { SHORTCUT_GROUPS, DEFAULT_BINDINGS } from '../constants/hotkeyBindings';
import { serializeRecordedHotkey } from '../utils/shortcutHelpers';

const logger = createLogger('UserPreferences');

const ShortcutRow = ({ id, label, combo, darkMode, onRecord, onReset, isRecording }) => (
  <div className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-2 ${darkMode ? 'border-gray-800 bg-gray-950/40' : 'border-gray-200 bg-white'}`}>
    <span className={`text-sm ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>{label}</span>
    <div className="flex items-center gap-2">
      <kbd className={`inline-flex items-center px-2.5 py-1 text-xs font-mono font-semibold rounded-md border shadow-sm whitespace-nowrap ${isRecording ? 'bg-blue-600 text-white border-blue-500 animate-pulse' : darkMode ? 'bg-gray-900 text-blue-300 border-gray-600' : 'bg-gray-50 text-gray-700 border-gray-300'}`}>
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
          <h3 className={`text-sm font-semibold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
            Keyboard Shortcuts
          </h3>
          <p className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
            Click <span className="font-medium">Record</span> then press a key combination to rebind. Esc cancels.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={resetBindings}>
          Reset all
        </Button>
      </div>

      {recordingId && (
        <div className={`rounded-lg border border-blue-500/50 bg-blue-500/10 px-3 py-2 text-xs text-blue-300`}>
          Press the new shortcut for “{SHORTCUT_GROUPS.flatMap((g) => g.items).find((i) => i.id === recordingId)?.label}”…
        </div>
      )}

      <div className="space-y-5 max-h-[50vh] overflow-y-auto pr-1">
        {SHORTCUT_GROUPS.map((group) => (
          <div key={group.category} className="space-y-2">
            <h4 className={`text-xs font-bold uppercase tracking-wider ${darkMode ? 'text-blue-400' : 'text-blue-600'}`}>
              {group.category}
            </h4>
            <div className="space-y-2">
              {group.items.map((item) => (
                <ShortcutRow
                  key={item.id}
                  id={item.id}
                  label={item.label}
                  combo={bindings[item.id] || DEFAULT_BINDINGS[item.id]}
                  darkMode={darkMode}
                  isRecording={recordingId === item.id}
                  onRecord={setRecordingId}
                  onReset={resetBinding}
                />
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
      const res = await fetch(`${url}/health`, {
        headers: { Authorization: `Bearer ${key}` },
      });
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
    <div className={`rounded-lg border p-4 space-y-4 ${darkMode ? 'border-gray-800 bg-gray-950/60' : 'border-gray-200 bg-gray-50'}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Globe className={`w-4 h-4 ${darkMode ? 'text-gray-300' : 'text-gray-600'}`} />
          <span className={`text-xs font-semibold uppercase tracking-wide ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
            RCCGTPHB Database
          </span>
        </div>
        <span className={`flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide ${
          isConnected ? (darkMode ? 'text-green-400' : 'text-green-700') : (darkMode ? 'text-red-400' : 'text-red-600')
        }`}>
          <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
          {isConnected ? 'Connected' : 'Not connected'}
        </span>
      </div>

      <div className="space-y-2">
        <label className={`text-xs font-semibold uppercase tracking-wide ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
          Base URL
        </label>
        <Input
          type="url"
          value={baseUrlInput}
          onChange={(e) => setBaseUrlInput(e.target.value)}
          placeholder="https://your-rccgtphb-api.com"
          className={darkMode ? 'bg-gray-950 border-gray-800 text-gray-100' : ''}
        />
      </div>

      <div className="space-y-2">
        <label className={`text-xs font-semibold uppercase tracking-wide ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
          API Key
        </label>
        <Input
          type="password"
          value={apiKeyInput}
          onChange={(e) => setApiKeyInput(e.target.value)}
          placeholder="sk_live_..."
          className={darkMode ? 'bg-gray-950 border-gray-800 text-gray-100' : ''}
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" size="sm" onClick={handleSave}>Save</Button>
        <Button variant="outline" size="sm" onClick={handleTest} disabled={verifying}>
          {verifying ? 'Testing...' : 'Test connection'}
        </Button>
        <Button variant="ghost" size="sm" onClick={handleClear}
          className="text-red-500 hover:text-red-400 hover:bg-red-500/10">
          <Trash2 className="w-3.5 h-3.5 mr-1" />
          Clear
        </Button>
      </div>
    </div>
  );
};

const ActionCard = ({ action, index, darkMode, onUpdate, onRemove, onFire }) => {
  const isBoolean = action.payloadFormat === 'boolean';
  const template = React.useMemo(
    () => buildOutputAutomationTemplate(
      action.onAction || 'YOUR_ACTION_NAME',
      action.endpoint || 'http://localhost:5505/',
      action.payloadFormat || 'action',
      action.onDataValue || 'true'
    ),
    [action.endpoint, action.onAction, action.payloadFormat, action.onDataValue, isBoolean]
  );

  return (
    <div className={`rounded-lg border p-4 ${darkMode ? 'border-gray-800 bg-gray-950/60' : 'border-gray-200 bg-gray-50'}`}>
      <div className="flex items-center justify-between mb-3">
        <span className={`text-xs font-semibold uppercase tracking-wide ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
          Action {index + 1}
        </span>
        <Button variant="ghost" size="sm" onClick={() => onRemove(action.id)}
          className="h-6 px-2 text-red-500 hover:text-red-400 hover:bg-red-500/10">
          Remove
        </Button>
      </div>
      <div className="space-y-3">
        <div className="space-y-2">
          <label className={`text-xs font-semibold uppercase tracking-wide ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
            Endpoint URL
          </label>
          <Input
            value={action.endpoint}
            onChange={(e) => onUpdate(action.id, { endpoint: e.target.value })}
            placeholder="http://localhost:5505/"
            className={darkMode ? 'bg-gray-950 border-gray-800 text-gray-100' : ''}
          />
        </div>
        <div className="space-y-2">
          <label className={`text-xs font-semibold uppercase tracking-wide ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
            Payload format
          </label>
          <div className={`flex rounded-lg border overflow-hidden ${darkMode ? 'border-gray-800' : 'border-gray-200'}`}>
            <button
              type="button"
              onClick={() => onUpdate(action.id, { payloadFormat: 'boolean' })}
              className={`flex-1 px-3 py-1.5 text-xs font-medium transition-colors ${
                isBoolean
                  ? 'bg-blue-600 text-white'
                  : darkMode ? 'bg-gray-950 text-gray-400 hover:text-gray-200' : 'bg-white text-gray-500 hover:text-gray-700'
              }`}
            >
              Boolean
            </button>
            <button
              type="button"
              onClick={() => onUpdate(action.id, { payloadFormat: 'action' })}
              className={`flex-1 px-3 py-1.5 text-xs font-medium transition-colors ${
                !isBoolean
                  ? 'bg-blue-600 text-white'
                  : darkMode ? 'bg-gray-950 text-gray-400 hover:text-gray-200' : 'bg-white text-gray-500 hover:text-gray-700'
              }`}
            >
              Action name
            </button>
          </div>
          {isBoolean ? (
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <label className={`text-xs font-semibold uppercase tracking-wide ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                    ON action
                  </label>
                  <Input
                    value={action.onAction}
                    onChange={(e) => onUpdate(action.id, { onAction: e.target.value })}
                    placeholder="e.g. black_screen"
                    className={darkMode ? 'bg-gray-950 border-gray-800 text-gray-100' : ''}
                  />
                </div>
                <div className="space-y-2">
                  <label className={`text-xs font-semibold uppercase tracking-wide ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                    OFF action
                  </label>
                  <Input
                    value={action.offAction}
                    onChange={(e) => onUpdate(action.id, { offAction: e.target.value })}
                    placeholder="e.g. black_screen"
                    className={darkMode ? 'bg-gray-950 border-gray-800 text-gray-100' : ''}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <label className={`text-xs font-semibold uppercase tracking-wide ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                    ON value
                  </label>
                  <Input
                    value={action.onDataValue ?? ''}
                    onChange={(e) => onUpdate(action.id, { onDataValue: e.target.value })}
                    placeholder="e.g. true"
                    className={darkMode ? 'bg-gray-950 border-gray-800 text-gray-100' : ''}
                  />
                </div>
                <div className="space-y-2">
                  <label className={`text-xs font-semibold uppercase tracking-wide ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                    OFF value
                  </label>
                  <Input
                    value={action.offDataValue ?? ''}
                    onChange={(e) => onUpdate(action.id, { offDataValue: e.target.value })}
                    placeholder="e.g. false"
                    className={darkMode ? 'bg-gray-950 border-gray-800 text-gray-100' : ''}
                  />
                </div>
              </div>
              <p className={`text-[11px] ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                Sends {'{ action: "<on_action>", data: { value: <on_value> } }'} on ON, {'{ action: "<off_action>", data: { value: <off_value> } }'} on OFF
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <label className={`text-xs font-semibold uppercase tracking-wide ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                  ON action
                </label>
                <Input
                  value={action.onAction}
                  onChange={(e) => onUpdate(action.id, { onAction: e.target.value })}
                  placeholder="e.g. output_on"
                  className={darkMode ? 'bg-gray-950 border-gray-800 text-gray-100' : ''}
                />
              </div>
              <div className="space-y-2">
                <label className={`text-xs font-semibold uppercase tracking-wide ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                  OFF action
                </label>
                <Input
                  value={action.offAction}
                  onChange={(e) => onUpdate(action.id, { offAction: e.target.value })}
                  placeholder="e.g. output_off"
                  className={darkMode ? 'bg-gray-950 border-gray-800 text-gray-100' : ''}
                />
              </div>
            </div>
          )}
        </div>
        <details className="group">
          <summary className={`cursor-pointer text-xs font-medium ${darkMode ? 'text-gray-400 hover:text-gray-200' : 'text-gray-500 hover:text-gray-700'}`}>
            Example request
          </summary>
          <pre className={`mt-2 overflow-x-auto rounded-lg border p-3 text-[11px] ${darkMode ? 'border-gray-800 bg-gray-950 text-gray-200' : 'border-gray-200 bg-white text-gray-700'}`}>
            {template}
          </pre>
        </details>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => onFire(action, 'on')}>
            Test ON
          </Button>
          <Button variant="outline" size="sm" onClick={() => onFire(action, 'off')}>
            Test OFF
          </Button>
        </div>
      </div>
    </div>
  );
};

const UserPreferencesModal = ({ darkMode, onClose }) => {
  logger.info('UserPreferencesModal mounted');
  const { outputActions, addOutputAction, removeOutputAction, updateOutputAction, setOutputActions } = useOutputAutomationState();
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
        showToast({
          title: 'Missing action name',
          message: `Set the ${state.toUpperCase()} action name first.`,
          variant: 'warning',
        });
        return;
      }
    }

    console.log('[OutputAutomation] Test result:', { state, endpoint: action.endpoint, result });

    const message = result.success
      ? `Fired ${state.toUpperCase()} action successfully.`
      : (result.error || `HTTP ${result.status || 'error'}${result.statusText ? ` ${result.statusText}` : ''}`);
    showToast({
      title: result.success ? 'Request sent' : 'Request failed',
      message,
      variant: result.success ? 'success' : 'error',
    });
  }, [showToast]);

  return (
    <div className="space-y-5">
      <RccgTphbSettings darkMode={darkMode} />

      <div className="border-t pt-4 space-y-1">
        <p className={`text-sm ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
          Run actions when output turns on or off. Add as many actions as you need.
        </p>
      </div>

      <div className="space-y-4">
        {outputActions.map((action, index) => (
          <ActionCard
            key={action.id}
            action={action}
            index={index}
            darkMode={darkMode}
            onUpdate={updateOutputAction}
            onRemove={removeOutputAction}
            onFire={handleFire}
          />
        ))}
      </div>

      <Button variant="secondary" onClick={addOutputAction} className="w-full">
        + Add Action
      </Button>

      <div className={`border-t pt-5 ${darkMode ? 'border-gray-800' : 'border-gray-200'}`}>
        <KeyboardShortcutsSection darkMode={darkMode} />
      </div>

      <div className="flex justify-end">
        <Button onClick={onClose}>Close</Button>
      </div>
    </div>
  );
};

export default UserPreferencesModal;
