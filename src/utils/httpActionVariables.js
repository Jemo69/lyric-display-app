/**
 * Dynamic input for HTTP actions.
 *
 * An HTTP action may declare `variables`. When it does, pressing the button asks
 * the operator to fill them in BEFORE the request is sent, and the answers are
 * substituted into the URL, headers and body.
 *
 * Placeholders accept either spelling, so both of these work:
 *   {"song": "{{songTitle}}"}
 *   {"song": "${songTitle}"}
 *
 * Actions with no variables are untouched — `resolveHttpActionRequest` is only
 * ever called when a non-empty variable list exists, so a literal `{{` in a body
 * is never rewritten.
 */

export const HTTP_VARIABLE_TYPES = ['text', 'number', 'select'];

/** Names must be usable inside `{{name}}` / `${name}`. */
const VALID_NAME = /^[A-Za-z0-9_.-]+$/;

/** Matches `{{ name }}` and `${ name }`, tolerating inner whitespace. */
const PLACEHOLDER = /\{\{\s*([A-Za-z0-9_.-]+)\s*\}\}|\$\{\s*([A-Za-z0-9_.-]+)\s*\}/g;

export function isValidVariableName(name) {
  return VALID_NAME.test(String(name || '').trim());
}

let variableSeq = 0;
function makeVariableId() {
  const rand = typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  variableSeq += 1;
  return `var-${rand}-${variableSeq}`;
}

export function createHttpVariable(overrides = {}) {
  const type = HTTP_VARIABLE_TYPES.includes(overrides.type) ? overrides.type : 'text';
  return {
    id: overrides.id || makeVariableId(),
    name: String(overrides.name || '').trim(),
    label: String(overrides.label || '').trim(),
    type,
    options: Array.isArray(overrides.options)
      ? overrides.options.map((o) => String(o).trim()).filter(Boolean)
      : String(overrides.options || '')
        .split(',')
        .map((o) => o.trim())
        .filter(Boolean),
    defaultValue: overrides.defaultValue == null ? '' : String(overrides.defaultValue),
    required: overrides.required !== false,
  };
}

/**
 * Clean a persisted variable list for runtime use. Entries without a valid name
 * are dropped — they could never be matched by a placeholder anyway.
 */
export function normalizeHttpVariables(variables) {
  if (!Array.isArray(variables)) return [];
  const seen = new Set();
  return variables
    .map((v) => createHttpVariable(v))
    .filter((v) => isValidVariableName(v.name))
    .filter((v) => {
      if (seen.has(v.name)) return false;
      seen.add(v.name);
      return true;
    });
}

export function parseVariableOptions(options) {
  if (Array.isArray(options)) return options.map((o) => String(o).trim()).filter(Boolean);
  return String(options || '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
}

/** Every placeholder name referenced by a request template, in first-seen order. */
export function extractPlaceholders(text) {
  const raw = String(text == null ? '' : text);
  const names = [];
  PLACEHOLDER.lastIndex = 0;
  let match = PLACEHOLDER.exec(raw);
  while (match) {
    const name = match[1] || match[2];
    if (name && !names.includes(name)) names.push(name);
    match = PLACEHOLDER.exec(raw);
  }
  return names;
}

/** Placeholders used by the template that no declared variable covers. */
export function findUndeclaredPlaceholders(request, variables) {
  const declared = new Set(normalizeHttpVariables(variables).map((v) => v.name));
  const missing = [];
  const scan = (value) => {
    for (const name of extractPlaceholders(value)) {
      if (!declared.has(name) && !missing.includes(name)) missing.push(name);
    }
  };
  scan(request?.url);
  scan(request?.headers);
  scan(request?.body);
  return missing;
}

/**
 * Replace placeholders in a plain string.
 * `urlSafe` leaves the reserved delimiters (`/ ? & = :`) intact so a value can
 * span a path segment or a query string, and escapes everything else.
 *
 * The allowlist is explicit rather than a denylist on purpose: `#` would turn
 * the rest of the URL into a fragment that never reaches the server (the request
 * still succeeds, so the operator is told "HTTP sent" while their value was
 * dropped), `%` would open a bogus percent-escape, and `+` is re-read as a
 * space by most servers. Song titles trip all three.
 */
export function interpolateText(text, values = {}, { urlSafe = false } = {}) {
  const raw = String(text == null ? '' : text);
  if (!raw || !values) return raw;
  return raw.replace(PLACEHOLDER, (whole, doubleBrace, dollarBrace) => {
    const name = doubleBrace || dollarBrace;
    if (!Object.prototype.hasOwnProperty.call(values, name)) return whole;
    const replacement = values[name] == null ? '' : String(values[name]);
    if (!urlSafe) return replacement;
    // encodeURIComponent is the identity on unreserved characters, so only the
    // characters that genuinely need escaping come out changed.
    return replacement.replace(/[^/?&=:]/g, (ch) => encodeURIComponent(ch));
  });
}

/**
 * Walk a parsed JSON structure and interpolate only its string leaves. Doing it
 * structurally (instead of on the raw text) keeps the body valid JSON even when
 * an answer contains quotes or newlines.
 */
function interpolateJsonNode(node, values) {
  if (typeof node === 'string') return interpolateText(node, values);
  if (Array.isArray(node)) return node.map((item) => interpolateJsonNode(item, values));
  if (node && typeof node === 'object') {
    const out = {};
    for (const [key, val] of Object.entries(node)) {
      out[key] = interpolateJsonNode(val, values);
    }
    return out;
  }
  return node;
}

/** Interpolate a body or headers string, preferring a structural JSON pass. */
function interpolateJsonOrText(raw, values) {
  const trimmed = String(raw == null ? '' : raw).trim();
  if (!trimmed) return raw;
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      return JSON.stringify(interpolateJsonNode(JSON.parse(trimmed), values));
    } catch {
      // Not valid JSON (e.g. a bare `{{number}}` placeholder) — fall through.
    }
  }
  return interpolateText(raw, values);
}

function interpolateHeaders(raw, values) {
  const trimmed = String(raw == null ? '' : raw).trim();
  if (!trimmed) return raw;
  if (trimmed.startsWith('{')) {
    try {
      return JSON.stringify(interpolateJsonNode(JSON.parse(trimmed), values));
    } catch {
      // fall through to line-based interpolation
    }
  }
  return String(raw)
    .split('\n')
    .map((line) => {
      const idx = line.indexOf(':');
      if (idx <= 0) return line;
      return `${line.slice(0, idx + 1)}${interpolateText(line.slice(idx + 1), values)}`;
    })
    .join('\n');
}

/**
 * Build the concrete request that will actually be sent.
 * Returns the request fields with every placeholder replaced.
 */
export function resolveHttpActionRequest(request = {}, variables, values = {}) {
  const lookup = values || {};
  return {
    ...request,
    url: interpolateText(request.url, lookup, { urlSafe: true }),
    method: interpolateText(request.method, lookup),
    headers: interpolateHeaders(request.headers, lookup),
    body: interpolateJsonOrText(request.body, lookup),
  };
}

/** Merge operator answers over declared defaults, coercing everything to string. */
export function buildVariableValues(variables, values = {}) {
  const declared = normalizeHttpVariables(variables);
  const resolved = {};
  for (const variable of declared) {
    const provided = values ? values[variable.name] : undefined;
    const fallback = variable.type === 'select'
      ? (variable.options[0] ?? '')
      : (variable.defaultValue ?? '');
    resolved[variable.name] = provided == null ? String(fallback) : String(provided);
  }
  return resolved;
}

/**
 * Resolve answers and report which required variables are still blank.
 * Returns `{ values, missing, invalid }`.
 */
export function prepareHttpVariableValues(variables, values = {}) {
  const declared = normalizeHttpVariables(variables);
  const resolved = buildVariableValues(declared, values);
  const missing = [];
  const invalid = [];
  for (const variable of declared) {
    const value = String(resolved[variable.name] ?? '');
    if (variable.required && value.trim() === '') missing.push(variable.name);
    if (variable.type === 'number' && value.trim() !== '' && !Number.isFinite(Number(value))) {
      invalid.push(`${variable.name} must be a number`);
    }
  }
  return { values: resolved, missing, invalid, variables: declared };
}

/**
 * Stand-in answers used to check a template while it is being edited, so an
 * action using `{"count": {{count}}}` reads as valid rather than as broken JSON.
 */
export function buildSampleVariableValues(variables) {
  const resolved = {};
  for (const variable of normalizeHttpVariables(variables)) {
    if (variable.type === 'select') resolved[variable.name] = variable.options[0] ?? 'sample';
    else if (variable.type === 'number') resolved[variable.name] = variable.defaultValue || '1';
    else resolved[variable.name] = variable.defaultValue || 'sample';
  }
  return resolved;
}
