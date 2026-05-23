import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import useToast from '../hooks/useToast';
import { useOutputAutomationState } from '../hooks/useStoreSelectors';
import { buildOutputAutomationTemplate, runOutputAutomationAction } from '../utils/outputAutomation';

const UserPreferencesModal = ({ darkMode, onClose }) => {
  const {
    outputActionEndpoint,
    outputOnActionName,
    outputOffActionName,
    setOutputActionEndpoint,
    setOutputOnActionName,
    setOutputOffActionName,
  } = useOutputAutomationState();

  const { showToast } = useToast();
  const [manualFireStatus, setManualFireStatus] = React.useState('');

  const template = React.useMemo(
    () => buildOutputAutomationTemplate(outputOnActionName || 'YOUR_ACTION_NAME', outputActionEndpoint || 'http://localhost:5505/'),
    [outputActionEndpoint, outputOnActionName]
  );

  const handleFire = React.useCallback(async (state) => {
    const actionValue = state === 'on' ? outputOnActionName : outputOffActionName;
    setManualFireStatus(`Sending ${state.toUpperCase()}...`);
    const result = await runOutputAutomationAction(actionValue, outputActionEndpoint);

    if (result.skipped) {
      const message = `Set the ${state.toUpperCase()} action name first.`;
      setManualFireStatus(message);
      showToast({
        title: 'Missing action name',
        message,
        variant: 'warning',
      });
      return;
    }

    const message = result.success
      ? `Fired ${state.toUpperCase()} action successfully.`
      : (result.error || `HTTP ${result.status || 'error'}`);
    setManualFireStatus(message);
    showToast({
      title: result.success ? 'Request sent' : 'Request failed',
      message,
      variant: result.success ? 'success' : 'error',
    });
  }, [outputActionEndpoint, outputOffActionName, outputOnActionName, showToast]);

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <p className={`text-sm ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
          Run an action when output turns on or off. The request sent is:
        </p>
        <pre className={`overflow-x-auto rounded-lg border p-3 text-[11px] ${darkMode ? 'border-gray-800 bg-gray-950 text-gray-200' : 'border-gray-200 bg-gray-50 text-gray-700'}`}>
          {template}
        </pre>
      </div>

      <div className="space-y-3">
        <div className="space-y-2">
          <label className={`text-xs font-semibold uppercase tracking-wide ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
            Endpoint URL
          </label>
          <Input
            value={outputActionEndpoint}
            onChange={(e) => setOutputActionEndpoint(e.target.value)}
            placeholder="http://localhost:5505/"
            className={darkMode ? 'bg-gray-950 border-gray-800 text-gray-100' : ''}
          />
        </div>

        <div className="space-y-2">
          <label className={`text-xs font-semibold uppercase tracking-wide ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
            Action when output turns ON
          </label>
          <Input
            value={outputOnActionName}
            onChange={(e) => setOutputOnActionName(e.target.value)}
            placeholder="e.g. output_on"
            className={darkMode ? 'bg-gray-950 border-gray-800 text-gray-100' : ''}
          />
        </div>

        <div className="space-y-2">
          <label className={`text-xs font-semibold uppercase tracking-wide ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
            Action when output turns OFF
          </label>
          <Input
            value={outputOffActionName}
            onChange={(e) => setOutputOffActionName(e.target.value)}
            placeholder="e.g. output_off"
            className={darkMode ? 'bg-gray-950 border-gray-800 text-gray-100' : ''}
          />
        </div>
      </div>

      <div className={`rounded-lg border p-4 ${darkMode ? 'border-gray-800 bg-gray-950/60' : 'border-gray-200 bg-gray-50'}`}>
        <div className={`text-xs font-semibold uppercase tracking-wide ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
          Example request
        </div>
        <Textarea
          readOnly
          value={template}
          className={`mt-2 min-h-28 font-mono text-[11px] ${darkMode ? 'bg-gray-950 border-gray-800 text-gray-200' : 'bg-white'}`}
        />
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <Button variant="outline" onClick={() => handleFire('on')}>
          Fire ON
        </Button>
        <Button variant="outline" onClick={() => handleFire('off')}>
          Fire OFF
        </Button>
        <span className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
          {manualFireStatus}
        </span>
      </div>

      <div className="flex justify-end">
        <Button onClick={onClose}>Close</Button>
      </div>
    </div>
  );
};

export default UserPreferencesModal;
