import { createLogger } from './logger.js';
import {
  findUndeclaredPlaceholders,
  normalizeHttpVariables,
  prepareHttpVariableValues,
  resolveHttpActionRequest,
  buildSampleVariableValues,
} from './httpActionVariables.js';

const log = createLogger('HttpAction');

export function sanitizeHttpUrl(url) {
  let cleaned = String(url || '').trim();
  if (!cleaned) return '';
  if (!/^https?:\/\//i.test(cleaned)) {
    cleaned = 'http://' + cleaned;
  }
  return cleaned;
}

export const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

// --- Separate thread (Web Worker) so UI never freezes during slow endpoints/optimization ---
let httpWorker = null;
let httpWorkerSeq = 1;
function getHttpWorker() {
  if (httpWorker) return httpWorker;
  if (typeof Worker === 'undefined') return null;
  try {
    httpWorker = new Worker(new URL('../workers/httpAction.worker.js', import.meta.url), { type: 'module' });
    httpWorker.addEventListener('error', (e) => log.error('HTTP worker error', e));
    return httpWorker;
  } catch (e) {
    log.warn('HTTP worker unavailable, falling back to main-thread fetch', e?.message);
    return null;
  }
}
function fetchViaWorker({ url, method, headers, body, timeoutMs = 8000 } = {}) {
  const w = getHttpWorker();
  if (!w) return null;
  return new Promise((resolve) => {
    const id = httpWorkerSeq++;
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve({ success: false, error: `Worker timeout after ${timeoutMs}ms`, isTimeout: true });
    }, timeoutMs);
    const handler = (e) => {
      if (!e?.data || e.data.id !== id) return;
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      w.removeEventListener('message', handler);
      // Worker sends { id, success, status, statusText, result, text, error }
      if (e.data.text !== undefined && e.data.result === undefined && e.data.success) {
        try { e.data.result = e.data.text ? JSON.parse(e.data.text) : null; } catch { e.data.result = e.data.text; }
      }
      resolve(e.data);
    };
    w.addEventListener('message', handler);
    w.postMessage({ id, url, method, headers, body });
  });
}

function parseHeaders(headersInput) {
  if (!headersInput) return {};
  if (typeof headersInput === 'object' && !Array.isArray(headersInput)) return headersInput;
  const raw = String(headersInput).trim();
  if (!raw) return {};
  // try JSON first
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
  } catch {}
  // fallback: lines like "Key: Value"
  const out = {};
  raw.split('\n').forEach((line) => {
    const idx = line.indexOf(':');
    if (idx > 0) {
      const k = line.slice(0, idx).trim();
      const v = line.slice(idx + 1).trim();
      if (k) out[k] = v;
    }
  });
  return out;
}

export function validateHeaders(headersInput) {
  if (!headersInput || !String(headersInput).trim()) return { valid: true, error: null, parsed: {} };
  const raw = String(headersInput).trim();
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      // ensure values are strings
      return { valid: true, error: null, parsed };
    }
    return { valid: false, error: 'Headers JSON must be an object (e.g. {"Content-Type":"application/json"})', parsed: null };
  } catch (e) {
    if (raw.startsWith('{') || raw.startsWith('[')) {
      return { valid: false, error: `Invalid JSON: ${e.message}`, parsed: null };
    }
    const out = {};
    const lines = raw.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      const idx = line.indexOf(':');
      if (idx <= 0) {
        return { valid: false, error: `Headers line ${i + 1} invalid — use "Key: Value" or valid JSON`, parsed: null };
      }
      const k = line.slice(0, idx).trim();
      const v = line.slice(idx + 1).trim();
      if (!k) return { valid: false, error: `Headers line ${i + 1} missing key`, parsed: null };
      out[k] = v;
    }
    if (Object.keys(out).length === 0) {
      return { valid: false, error: 'Headers empty or invalid format', parsed: null };
    }
    return { valid: true, error: null, parsed: out };
  }
}

export function validateJsonBody(bodyInput, headersInput) {
  const raw = bodyInput == null ? '' : String(bodyInput).trim();
  if (!raw) return { valid: true, error: null };
  const headersRaw = String(headersInput || '').toLowerCase();
  const looksJson = raw.startsWith('{') || raw.startsWith('[');
  const expectsJson = headersRaw.includes('application/json') || looksJson;
  if (!expectsJson) return { valid: true, error: null };
  try {
    JSON.parse(raw);
    return { valid: true, error: null };
  } catch (e) {
    return { valid: false, error: `Invalid JSON: ${e.message}` };
  }
}

export function validateHttpAction({ url, method, headers, body } = {}) {
  const errors = {};
  const urlTrim = String(url || '').trim();
  if (!urlTrim) errors.url = 'URL is required';
  else {
    try {
      const sanitized = sanitizeHttpUrl(urlTrim);
      new URL(sanitized);
    } catch {
      errors.url = 'Invalid URL';
    }
  }
  const upper = String(method || 'GET').toUpperCase();
  if (method && !HTTP_METHODS.includes(upper)) errors.method = 'Invalid method';
  const h = validateHeaders(headers);
  if (!h.valid) errors.headers = h.error;
  const b = validateJsonBody(body, headers);
  if (!b.valid) errors.body = b.error;
  if ((upper === 'GET' || upper === 'HEAD') && String(body || '').trim()) {
    errors.body = 'Body must be empty for GET/HEAD';
  }
  const valid = Object.keys(errors).length === 0;
  return { valid, errors, headerParsed: h.parsed, headerError: h.error, bodyError: b.error };
}

/**
 * Everything the two HTTP action editors need to show live feedback: per-field
 * header/body validity, the URL error, and an overall `valid` flag.
 *
 * When the action declares variables the template is checked *after*
 * substitution with stand-in answers, so a body like `{"count": {{count}}}` reads
 * as valid instead of being reported as broken JSON. Actions without variables
 * are checked exactly as they always were.
 */
export function inspectHttpActionConfig(config = {}) {
  const declared = normalizeHttpVariables(config.variables);
  const resolved = declared.length
    ? resolveHttpActionRequest(config, declared, buildSampleVariableValues(declared))
    : config;

  const headerCheck = validateHeaders(resolved.headers);
  const upper = String(resolved.method || 'GET').toUpperCase();
  const jsonBody = validateJsonBody(resolved.body, resolved.headers);
  const bodyCheck = (upper === 'GET' || upper === 'HEAD') && String(resolved.body || '').trim()
    ? { valid: false, error: 'Body must be empty for GET/HEAD' }
    : jsonBody;
  const urlError = validateHttpAction(resolved).errors.url || null;

  // First thing that needs fixing, so callers can point at one field.
  const field = !headerCheck.valid ? 'headers' : !bodyCheck.valid ? 'body' : urlError ? 'url' : null;
  const error = field === 'headers' ? headerCheck.error : field === 'body' ? bodyCheck.error : urlError;

  return {
    headerCheck,
    bodyCheck,
    urlError,
    field,
    error,
    valid: field === null,
  };
}

/**
 * Execute a configurable HTTP request.
 * Validates JSON before firing — never sends invalid JSON.
 * Tries Electron main process first (bypasses CORS), falls back to fetch.
 *
 * When `variables` is a non-empty list, `values` supplies the operator's answers
 * and every `{{name}}` / `${name}` placeholder in the URL, headers and body is
 * replaced first. Actions without variables behave exactly as before.
 */
export async function executeHttpAction({ url, method = 'GET', headers, body, variables, values } = {}) {
  const request = { url, method, headers, body };
  const declared = normalizeHttpVariables(variables);

  if (declared.length) {
    const prepared = prepareHttpVariableValues(declared, values);
    if (prepared.invalid.length) {
      log.warn('HTTP variable input invalid', prepared.invalid);
      return { success: false, error: prepared.invalid.join('; '), validationError: true, field: 'variables' };
    }
    if (prepared.missing.length) {
      log.warn('HTTP variables missing', prepared.missing);
      return { success: false, error: `Fill in required input: ${prepared.missing.join(', ')}`, validationError: true, field: 'variables' };
    }
    const undeclared = findUndeclaredPlaceholders(request, declared);
    if (undeclared.length) {
      log.warn('HTTP placeholders have no matching variable', undeclared);
      return {
        success: false,
        error: `Request uses undefined variable(s): ${undeclared.join(', ')}. Add them under Variables.`,
        validationError: true,
        field: 'variables',
      };
    }
    Object.assign(request, resolveHttpActionRequest(request, declared, prepared.values));
    log.info('HTTP variables resolved', { count: declared.length });
  }

  const validation = validateHttpAction(request);
  if (!validation.valid) {
    const firstKey = Object.keys(validation.errors)[0];
    const firstError = validation.errors[firstKey];
    log.warn('HTTP validation failed', validation.errors);
    return { success: false, error: firstError, validationError: true, field: firstKey, errors: validation.errors };
  }
  const sanitizedUrl = sanitizeHttpUrl(request.url);
  if (!sanitizedUrl) {
    return { success: false, error: 'Missing URL' };
  }
  const upperMethod = String(request.method || 'GET').toUpperCase();
  const headerObj = validation.headerParsed ?? parseHeaders(request.headers);
  const hasBody = request.body != null && String(request.body).trim() !== '' && upperMethod !== 'GET' && upperMethod !== 'HEAD';

  log.info('HTTP action', { url: sanitizedUrl, method: upperMethod });

  // Copy exact working pattern from outputAutomation.js:48-55 — must go via main to avoid CORS.
  // Try the new handler first (supports custom method/headers), then fall back to the proven
  // automation handler (exists in current builds) which also does Node fetch (no CORS).
  if (typeof window !== 'undefined' && window.electronAPI?.httpAction?.fire) {
    try {
      return await window.electronAPI.httpAction.fire({
        url: sanitizedUrl,
        method: upperMethod,
        headers: headerObj,
        body: hasBody ? String(request.body) : undefined,
      });
    } catch (e) {
      log.error('httpAction IPC failed', { error: e.message });
      // fall through to automation fallback
    }
  }
  if (typeof window !== 'undefined' && window.electronAPI?.outputAutomation?.fire) {
    try {
      // output-automation handler now also accepts generic method/headers (copied from http-action) — runs in Electron main (separate process)
      return await window.electronAPI.outputAutomation.fire({
        endpointUrl: sanitizedUrl,
        url: sanitizedUrl,
        method: upperMethod,
        headers: headerObj,
        body: hasBody ? String(request.body) : undefined,
      });
    } catch (e) {
      log.error('outputAutomation fallback failed', { error: e.message });
    }
  }

  // Browser path: offload to Web Worker so UI thread never blocks (even during optimization)
  if (typeof window !== 'undefined' && !window.electronAPI?.httpAction?.fire) {
    const workerRes = await fetchViaWorker({ url: sanitizedUrl, method: upperMethod, headers: headerObj, body: hasBody ? String(request.body) : undefined });
    if (workerRes) {
      if (workerRes.success) log.info('HTTP via worker', { status: workerRes.status });
      else log.warn('HTTP worker failed', workerRes.error);
      // Normalize worker shape to match IPC shape
      if (workerRes.isTimeout || workerRes.error) return workerRes;
      return workerRes;
    }
  }

  try {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timeout = controller ? setTimeout(() => controller.abort(), 8000) : null;
    const fetchOpts = {
      method: upperMethod,
      headers: headerObj,
      signal: controller?.signal,
    };
    if (hasBody) fetchOpts.body = String(request.body);

    const response = await fetch(sanitizedUrl, fetchOpts);
    if (timeout) clearTimeout(timeout);
    const text = await response.text().catch(() => '');
    let result = null;
    try {
      result = text ? JSON.parse(text) : null;
    } catch {
      result = text;
    }
    return { success: response.ok, status: response.status, statusText: response.statusText, result };
  } catch (error) {
    const isAbort = error?.name === 'AbortError';
    log.error('HTTP fetch failed', { url: sanitizedUrl, error: error.message });
    const msg = String(error.message || error);
    if (isAbort) return { success: false, error: `HTTP timeout after 8000ms — ${sanitizedUrl}` };
    const isCors = /cors|Failed to fetch|Load failed|NetworkError/i.test(msg);
    if (isCors && !window.electronAPI?.httpAction?.fire) {
      return {
        success: false,
        error: `${msg} — CORS blocked by target. Fix on SERVER (${sanitizedUrl}): send Access-Control-Allow-Origin, or run as Electron where fetch is proxied via main (no CORS).`,
        isCors: true,
      };
    }
    return { success: false, error: msg };
  }
}

export function buildHttpExample({ url, method = 'POST', headers, body } = {}) {
  const sanitizedUrl = sanitizeHttpUrl(url || 'http://localhost:8080/trigger');
  const m = String(method || 'POST').toUpperCase();
  const h = parseHeaders(headers);
  const headerLines = Object.entries(h).map(([k, v]) => `    '${k}': '${v}'`).join(',\n');
  const headerBlock = headerLines ? `,\n  headers: {\n${headerLines}\n  }` : '';
  const bodyLine = body && m !== 'GET' && m !== 'HEAD' ? `,\n  body: ${JSON.stringify(String(body))}` : '';
  return `fetch('${sanitizedUrl}', {\n  method: '${m}'${headerBlock}${bodyLine}\n});`;
}
