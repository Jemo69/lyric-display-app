export const OUTPUT_ACTION_ENDPOINT = 'http://localhost:5505/';
export const OUTPUT_ACTION_NAME = 'name_run_action';

export function sanitizeEndpointUrl(url) {
  let cleaned = String(url || '').trim();
  if (!cleaned) return '';

  if (!/^https?:\/\//i.test(cleaned)) {
    cleaned = 'http://' + cleaned;
  }

  cleaned = cleaned.replace(/^(https?:\/\/)([^/]+)/i, (match, protocol, hostAndPort) => {
    return protocol + hostAndPort.replace(/[øØ]/g, '0');
  });

  return cleaned;
}

export async function runOutputAutomationAction(actionValue, endpointUrl = OUTPUT_ACTION_ENDPOINT) {
  const value = String(actionValue || '').trim();
  if (!value) {
    return { success: false, skipped: true, error: 'No action configured' };
  }

  const sanitizedUrl = sanitizeEndpointUrl(endpointUrl || OUTPUT_ACTION_ENDPOINT);

  try {
    if (typeof window !== 'undefined' && window.electronAPI?.outputAutomation?.fire) {
      return await window.electronAPI.outputAutomation.fire({
        endpointUrl: sanitizedUrl,
        value,
      });
    }

    const response = await fetch(sanitizedUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: value,
        value,
        command: value,
        actionName: value,
        originalAction: OUTPUT_ACTION_NAME,
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
  const sanitizedUrl = sanitizeEndpointUrl(endpointUrl || OUTPUT_ACTION_ENDPOINT);
  return `fetch('${sanitizedUrl}', {\n  method: 'POST',\n  headers: { 'Content-Type': 'application/json' },\n  body: JSON.stringify({\n    action: '${actionValue}',\n    value: '${actionValue}'\n  })\n});`;
}
