export const OUTPUT_ACTION_ENDPOINT = 'http://localhost:5505/';
export const OUTPUT_ACTION_NAME = 'name_run_action';

export async function runOutputAutomationAction(actionValue, endpointUrl = OUTPUT_ACTION_ENDPOINT) {
  const value = String(actionValue || '').trim();
  if (!value) {
    return { success: false, skipped: true, error: 'No action configured' };
  }

  try {
    if (typeof window !== 'undefined' && window.electronAPI?.outputAutomation?.fire) {
      return await window.electronAPI.outputAutomation.fire({
        endpointUrl: endpointUrl || OUTPUT_ACTION_ENDPOINT,
        value,
      });
    }

    const response = await fetch(endpointUrl || OUTPUT_ACTION_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: OUTPUT_ACTION_NAME,
        value,
      }),
    });

    let result = null;
    try {
      result = await response.json();
    } catch {
      result = null;
    }

    return {
      success: response.ok,
      status: response.status,
      result,
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
}

export async function runAllOutputActions(actions, onState) {
  const results = [];
  for (const action of actions) {
    const actionValue = onState ? action.onAction : action.offAction;
    const result = await runOutputAutomationAction(actionValue, action.endpoint);
    results.push({ id: action.id, endpoint: action.endpoint, actionValue, ...result });
  }
  return results;
}

export function buildOutputAutomationTemplate(actionValue = 'YOUR_ACTION_NAME', endpointUrl = OUTPUT_ACTION_ENDPOINT) {
  return `fetch('${endpointUrl}', {\n  method: 'POST',\n  headers: { 'Content-Type': 'application/json' },\n  body: JSON.stringify({\n    action: '${OUTPUT_ACTION_NAME}',\n    value: '${actionValue}'\n  })\n});`;
}
