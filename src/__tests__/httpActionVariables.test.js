import { describe, it, expect } from 'vitest';
import {
  HTTP_VARIABLE_TYPES,
  buildSampleVariableValues,
  buildVariableValues,
  createHttpVariable,
  extractPlaceholders,
  findUndeclaredPlaceholders,
  interpolateText,
  isValidVariableName,
  normalizeHttpVariables,
  prepareHttpVariableValues,
  resolveHttpActionRequest,
} from '@/utils/httpActionVariables';
import { inspectHttpActionConfig } from '@/utils/httpAction';

const vars = (...specs) => specs.map((s) => createHttpVariable(s));

describe('httpActionVariables - naming', () => {
  it('exposes the supported input types', () => {
    expect(HTTP_VARIABLE_TYPES).toEqual(['text', 'number', 'select']);
  });

  it('accepts letters, numbers, dot, dash and underscore in names', () => {
    ['songTitle', 'port', 'scene-1', 'a.b', 'x_2'].forEach((n) => {
      expect(isValidVariableName(n)).toBe(true);
    });
  });

  it('rejects names that cannot appear inside a placeholder', () => {
    ['', '  ', 'two words', 'has/slash', 'a b', 'quote"'].forEach((n) => {
      expect(isValidVariableName(n)).toBe(false);
    });
  });

  it('normalizes dropdown options from a comma separated string', () => {
    expect(createHttpVariable({ name: 'a', type: 'select', options: ' black, white ,, blue ' }).options)
      .toEqual(['black', 'white', 'blue']);
  });

  it('drops unnamed variables and duplicate names', () => {
    const result = normalizeHttpVariables([
      { name: 'song' },
      { name: '' },
      { name: 'song' },
      { name: 'port' },
    ]);
    expect(result.map((v) => v.name)).toEqual(['song', 'port']);
  });

  it('gives every variable a stable id', () => {
    const [a, b] = normalizeHttpVariables([{ name: 'x' }, { name: 'y' }]);
    expect(a.id).toBeTruthy();
    expect(a.id).not.toBe(b.id);
  });
});

describe('httpActionVariables - placeholder detection', () => {
  it('finds both placeholder spellings', () => {
    expect(extractPlaceholders('{{a}} and ${b} and {{ a }}')).toEqual(['a', 'b']);
  });

  it('deduplicates repeated names', () => {
    expect(extractPlaceholders('{{song}}/{{song}}')).toEqual(['song']);
  });

  it('ignores text that is not a placeholder', () => {
    expect(extractPlaceholders('{"action":"next"}')).toEqual([]);
  });

  it('reports placeholders with no matching variable', () => {
    const request = { url: 'http://x/{{missing}}', headers: '', body: '{"a":"{{gone}}"}' };
    expect(findUndeclaredPlaceholders(request, vars({ name: 'song' }))).toEqual(['missing', 'gone']);
  });

  it('reports nothing when every placeholder is declared', () => {
    const request = { url: 'http://x/{{song}}', headers: '', body: '{"a":"${song}"}' };
    expect(findUndeclaredPlaceholders(request, vars({ name: 'song' }))).toEqual([]);
  });
});

describe('httpActionVariables - substitution', () => {
  it('replaces both spellings and leaves unknown names alone', () => {
    const out = interpolateText('{{a}}/${b}/{{unknown}}', { a: 'one', b: 'two' });
    expect(out).toBe('one/two/{{unknown}}');
  });

  it('encodes illegal URL characters but keeps reserved delimiters', () => {
    const out = interpolateText('http://h/cue/{{song}}', { song: 'He said "hi" / now' }, { urlSafe: true });
    expect(out).toBe('http://h/cue/He%20said%20%22hi%22%20/%20now');
  });

  it('does not encode inside the body', () => {
    const out = interpolateText('{"song":"{{song}}"}', { song: 'He said "hi"' });
    expect(out).toBe('{"song":"He said "hi""}');
  });

  it('substitutes into url, headers and body together', () => {
    const resolved = resolveHttpActionRequest(
      {
        url: 'http://host/cue/{{song}}',
        method: 'POST',
        headers: '{"X-Song":"{{song}}"}',
        body: '{"song":"{{song}}"}',
      },
      vars({ name: 'song' }),
      { song: 'Amazing Grace' }
    );
    expect(resolved.url).toBe('http://host/cue/Amazing%20Grace');
    expect(JSON.parse(resolved.headers)['X-Song']).toBe('Amazing Grace');
    expect(JSON.parse(resolved.body)).toEqual({ song: 'Amazing Grace' });
  });

  it('keeps a JSON body valid when an answer contains quotes and newlines', () => {
    const resolved = resolveHttpActionRequest(
      { url: 'http://host', method: 'POST', headers: '', body: '{"note":"{{note}}"}' },
      vars({ name: 'note' }),
      { note: 'He said "hi"\nsecond line' }
    );
    expect(JSON.parse(resolved.body)).toEqual({ note: 'He said "hi"\nsecond line' });
  });

  it('supports an unquoted number placeholder', () => {
    const resolved = resolveHttpActionRequest(
      { url: 'http://host', method: 'POST', headers: '', body: '{"count": {{count}}}' },
      vars({ name: 'count', type: 'number' }),
      { count: '7' }
    );
    expect(JSON.parse(resolved.body)).toEqual({ count: 7 });
  });

  it('substitutes into Key: Value header lines', () => {
    const resolved = resolveHttpActionRequest(
      { url: 'http://host', method: 'GET', headers: 'X-Token: {{token}}\nAccept: */*', body: '' },
      vars({ name: 'token' }),
      { token: 'abc123' }
    );
    expect(resolved.headers).toBe('X-Token: abc123\nAccept: */*');
  });

  it('leaves an untouched request exactly as it was', () => {
    const request = { url: 'http://host/{{x}}', method: 'POST', headers: '{"a":"1"}', body: '{"b":2}' };
    const resolved = resolveHttpActionRequest(request, [], {});
    expect(resolved.url).toBe('http://host/{{x}}');
    expect(resolved.body).toBe('{"b":2}');
  });

  it('replaces an empty value with an empty string rather than "undefined"', () => {
    expect(interpolateText('{{a}}-{{b}}', { a: '', b: null })).toBe('-');
  });
});

describe('httpActionVariables - answers', () => {
  it('falls back to the declared default when no answer is given', () => {
    const values = buildVariableValues(vars({ name: 'song', defaultValue: 'Fallback' }), {});
    expect(values.song).toBe('Fallback');
  });

  it('preselects the first option for a dropdown', () => {
    const values = buildVariableValues(vars({ name: 'scene', type: 'select', options: 'black, white' }), {});
    expect(values.scene).toBe('black');
  });

  it('keeps an explicit answer over the default', () => {
    const values = buildVariableValues(vars({ name: 'song', defaultValue: 'Fallback' }), { song: 'Typed' });
    expect(values.song).toBe('Typed');
  });

  it('lists required variables left blank', () => {
    const { missing } = prepareHttpVariableValues(
      vars({ name: 'song', required: true }, { name: 'port', required: false }),
      { song: '   ' }
    );
    expect(missing).toEqual(['song']);
  });

  it('does not require optional variables', () => {
    const { missing } = prepareHttpVariableValues(vars({ name: 'note', required: false }), {});
    expect(missing).toEqual([]);
  });

  it('rejects a non-numeric answer for a number variable', () => {
    const { invalid } = prepareHttpVariableValues(vars({ name: 'port', type: 'number' }), { port: 'abc' });
    expect(invalid).toEqual(['port must be a number']);
  });

  it('accepts a numeric answer for a number variable', () => {
    const { invalid } = prepareHttpVariableValues(vars({ name: 'port', type: 'number' }), { port: '8080' });
    expect(invalid).toEqual([]);
  });

  it('builds plausible sample values for editor validation', () => {
    const sample = buildSampleVariableValues(
      vars({ name: 'song' }, { name: 'count', type: 'number' }, { name: 'scene', type: 'select', options: 'black, white' })
    );
    expect(sample).toEqual({ song: 'sample', count: '1', scene: 'black' });
  });
});

describe('inspectHttpActionConfig - live editor feedback', () => {
  it('reports a clean action as valid', () => {
    const result = inspectHttpActionConfig({
      url: 'http://host/x',
      method: 'POST',
      headers: '{"Content-Type":"application/json"}',
      body: '{"a":1}',
    });
    expect(result).toMatchObject({ valid: true, urlError: null });
    expect(result.headerCheck.valid).toBe(true);
    expect(result.bodyCheck.valid).toBe(true);
  });

  it('accepts a body that is only valid after substitution', () => {
    const result = inspectHttpActionConfig({
      url: 'http://host/x',
      method: 'POST',
      headers: '{"Content-Type":"application/json"}',
      body: '{"count": {{count}}}',
      variables: vars({ name: 'count', type: 'number' }),
    });
    expect(result.bodyCheck.valid).toBe(true);
    expect(result.valid).toBe(true);
  });

  it('still rejects a genuinely broken body', () => {
    const result = inspectHttpActionConfig({
      url: 'http://host/x',
      method: 'POST',
      headers: '{"Content-Type":"application/json"}',
      body: '{"a": }',
      variables: vars({ name: 'song' }),
    });
    expect(result.bodyCheck.valid).toBe(false);
    expect(result.valid).toBe(false);
  });

  it('rejects a body on GET even when it holds a placeholder', () => {
    const result = inspectHttpActionConfig({
      url: 'http://host/x',
      method: 'GET',
      headers: '',
      body: '{{song}}',
      variables: vars({ name: 'song' }),
    });
    expect(result.bodyCheck.error).toMatch(/GET\/HEAD/);
    expect(result.valid).toBe(false);
  });

  it('surfaces a URL error separately', () => {
    const result = inspectHttpActionConfig({ url: 'not a url', method: 'POST', headers: '', body: '' });
    expect(result.urlError).toBeTruthy();
    expect(result.valid).toBe(false);
  });

  it('leaves a variable-free action completely untouched', () => {
    // Same body, but nothing is declared, so no substitution happens and the
    // literal braces are still invalid JSON. Compare the test above.
    const result = inspectHttpActionConfig({
      url: 'http://host/x',
      method: 'POST',
      headers: '{"Content-Type":"application/json"}',
      body: '{"count": {{count}}}',
      variables: [],
    });
    expect(result.bodyCheck.valid).toBe(false);
    expect(result.valid).toBe(false);
  });
});
