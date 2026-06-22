import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import useToast from '../hooks/useToast';
import { useOutputAutomationState } from '../hooks/useStoreSelectors';
import { buildOutputAutomationTemplate, runOutputAutomationAction } from '../utils/outputAutomation';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('UserPreferences');

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
      <div className="space-y-1">
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

      <div className="flex justify-end">
        <Button onClick={onClose}>Close</Button>
      </div>
    </div>
  );
};

export default UserPreferencesModal;
