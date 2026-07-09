import { createLogger } from "./logger.js";

const log = createLogger("OutputAutomation");

export const OUTPUT_ACTION_ENDPOINT = "http://localhost:5506/";
export const OUTPUT_ACTION_NAME = "name_run_action";

export function sanitizeEndpointUrl(url) {
  let cleaned = String(url || "").trim();
  if (!cleaned) return "";

  if (!/^https?:\/\//i.test(cleaned)) {
    cleaned = "http://" + cleaned;
  }

  cleaned = cleaned.replace(
    /^(https?:\/\/)([^/]+)/i,
    (match, protocol, hostAndPort) => {
      return protocol + hostAndPort.replace(/[øØ]/g, "0");
    },
  );

  return cleaned;
}

export async function runOutputAutomationAction(
  actionValue,
  endpointUrl = OUTPUT_ACTION_ENDPOINT,
  onState = null,
  dataValue = null,
) {
  const sanitizedUrl = sanitizeEndpointUrl(
    endpointUrl || OUTPUT_ACTION_ENDPOINT,
  );

  const isBooleanMode = onState !== null && onState !== undefined;

  if (isBooleanMode) {
    const value = String(actionValue || "").trim();
    const action = value || OUTPUT_ACTION_NAME;
    const body = JSON.stringify({
      action: OUTPUT_ACTION_NAME,
      value: onState ? `${action}_on` : `${action}_off`,
    });
    log.info("Running automation (boolean)", { action, onState });

    try {
      if (
        typeof window !== "undefined" &&
        window.electronAPI?.outputAutomation?.fire
      ) {
        return await window.electronAPI.outputAutomation.fire({
          endpointUrl: sanitizedUrl,
          body,
        });
      }

      const response = await fetch(sanitizedUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "yaak",
          "Accept": "*/*",
        },
        body,
      });

      let result = null;
      try {
        result = await response.json();
      } catch {
        result = null;
      }

      return { success: response.ok, status: response.status, result };
    } catch (error) {
      log.error("Automation fetch failed", {
        url: sanitizedUrl,
        error: error.message,
      });
      return { success: false, error: error.message };
    }
  }

  const value = String(actionValue || "").trim();
  if (!value) {
    log.debug("Skipping automation (no action configured)");
    return { success: false, skipped: true, error: "No action configured" };
  }

  log.info("Running automation (value)", { action: value });

  try {
    if (
      typeof window !== "undefined" &&
      window.electronAPI?.outputAutomation?.fire
    ) {
      return await window.electronAPI.outputAutomation.fire({
        endpointUrl: sanitizedUrl,
        body: JSON.stringify({
          action: OUTPUT_ACTION_NAME,
          value: value,
        }),
      });
    }

    const response = await fetch(sanitizedUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "yaak",
        "Accept": "*/*",
      },
      body: JSON.stringify({
        action: OUTPUT_ACTION_NAME,
        value: value,
      }),
    });

    let result = null;
    try {
      result = await response.json();
    } catch {
      result = null;
    }

    return { success: response.ok, status: response.status, result };
  } catch (error) {
    log.error("Automation fetch failed", {
      url: sanitizedUrl,
      error: error.message,
    });
    return { success: false, error: error.message };
  }
}

export async function runAllOutputActions(actions, onState) {
  log.info("Running all output actions", { count: actions.length, onState });
  const results = [];
  for (const action of actions) {
    if (action.enabled === false) {
      log.info("Skipping disabled output action", { id: action.id });
      results.push({ id: action.id, endpoint: action.endpoint, skipped: true, disabled: true });
      continue;
    }
    let result;
    if (action.payloadFormat === "boolean") {
      const actionValue = onState ? action.onAction : action.offAction;
      const dataValue = onState ? action.onDataValue : action.offDataValue;
      result = await runOutputAutomationAction(
        actionValue,
        action.endpoint,
        onState,
        dataValue,
      );
    } else {
      const actionValue = onState ? action.onAction : action.offAction;
      result = await runOutputAutomationAction(actionValue, action.endpoint);
    }
    results.push({ id: action.id, endpoint: action.endpoint, ...result });
  }
  return results;
}

export function buildOutputAutomationTemplate(
  actionValue = "YOUR_ACTION_NAME",
  endpointUrl = OUTPUT_ACTION_ENDPOINT,
  payloadFormat = "action",
  dataValue = "true",
) {
  const sanitizedUrl = sanitizeEndpointUrl(
    endpointUrl || OUTPUT_ACTION_ENDPOINT,
  );
  if (payloadFormat === "boolean") {
    return `fetch('${sanitizedUrl}', {\n  method: 'POST',\n  headers: {\n    'Content-Type': 'application/json',\n    'User-Agent': 'yaak',\n    'Accept': '*/*'\n  },\n  body: JSON.stringify({\n    action: '${OUTPUT_ACTION_NAME}',\n    value: '${actionValue || "YOUR_ACTION_NAME"}_on'\n  })\n});`;
  }
  return `fetch('${sanitizedUrl}', {\n  method: 'POST',\n  headers: {\n    'Content-Type': 'application/json',\n    'User-Agent': 'yaak',\n    'Accept': '*/*'\n  },\n  body: JSON.stringify({\n    action: '${OUTPUT_ACTION_NAME}',\n    value: '${actionValue}'\n  })\n});`;
}
