import React from 'react';
import { AlertTriangle, ArrowRight, Braces } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { buildVariableValues, normalizeHttpVariables } from '../utils/httpActionVariables';

/**
 * Shown when an operator presses an HTTP action that declares variables.
 * Collects every answer, validates the required ones, and hands the values
 * back so the request can be resolved and sent.
 */
const HttpActionVariableForm = ({ variables, request, darkMode, onSubmit, onCancel }) => {
  const declared = React.useMemo(() => normalizeHttpVariables(variables), [variables]);
  const [values, setValues] = React.useState(() => buildVariableValues(declared, {}));
  const [errors, setErrors] = React.useState({});

  // Live preview of the request the answers will produce.
  const preview = React.useMemo(() => {
    const template = request || {};
    const sample = buildVariableValues(declared, values);
    const lines = [`${String(template.method || 'POST').toUpperCase()} ${String(template.url || '').trim() || '(no URL)'}`];
    const headers = String(template.headers || '').trim();
    if (headers) lines.push(headers);
    const body = String(template.body || '').trim();
    if (body) lines.push(body);
    return lines
      .map((line) => line.replace(/\{\{\s*([A-Za-z0-9_.-]+)\s*\}\}|\$\{\s*([A-Za-z0-9_.-]+)\s*\}/g, (whole, a, b) => {
        const name = a || b;
        return Object.prototype.hasOwnProperty.call(sample, name) ? String(sample[name]) : whole;
      }))
      .join('\n');
  }, [declared, request, values]);

  const setValue = (name, next) => {
    setValues((prev) => ({ ...prev, [name]: next }));
    setErrors((prev) => (prev[name] ? { ...prev, [name]: null } : prev));
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    const nextErrors = {};
    for (const variable of declared) {
      const raw = String(values[variable.name] ?? '');
      if (variable.required && raw.trim() === '') {
        nextErrors[variable.name] = 'Required';
      } else if (variable.type === 'number' && raw.trim() !== '' && !Number.isFinite(Number(raw))) {
        nextErrors[variable.name] = 'Must be a number';
      }
    }
    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors);
      return;
    }
    onSubmit(buildVariableValues(declared, values));
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {declared.map((variable) => {
        const error = errors[variable.name];
        const inputClass = darkMode
          ? 'bg-gray-950 text-gray-100'
          : '';
        const errorClass = error
          ? 'border-red-500 focus-visible:ring-red-500'
          : darkMode
            ? 'border-gray-800'
            : '';
        const label = variable.label || variable.name;
        return (
          <div key={variable.id || variable.name} className="space-y-1.5">
            <label
              htmlFor={`http-var-${variable.id || variable.name}`}
              className={`flex items-center gap-2 text-xs font-semibold uppercase tracking-wide ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}
            >
              <span>{label}</span>
              {variable.required && <span className="text-red-500 normal-case font-normal">required</span>}
              <span className="ml-auto font-mono text-[10px] font-normal normal-case opacity-60">
                {'{{'}{variable.name}{'}}'}
              </span>
            </label>
            {variable.type === 'select' ? (
              <select
                id={`http-var-${variable.id || variable.name}`}
                value={values[variable.name] ?? ''}
                onChange={(e) => setValue(variable.name, e.target.value)}
                className={`w-full h-9 rounded-md border px-3 text-sm ${errorClass} ${inputClass || 'border-gray-200 bg-white text-gray-900'}`}
              >
                {variable.options.length === 0 && <option value="">No options configured</option>}
                {variable.options.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            ) : (
              <Input
                id={`http-var-${variable.id || variable.name}`}
                type={variable.type === 'number' ? 'number' : 'text'}
                inputMode={variable.type === 'number' ? 'decimal' : undefined}
                value={values[variable.name] ?? ''}
                onChange={(e) => setValue(variable.name, e.target.value)}
                placeholder={variable.label || variable.name}
                autoFocus={declared[0]?.name === variable.name}
                className={`${inputClass} ${errorClass}`}
              />
            )}
            {error && <p className="text-[11px] text-red-500 flex items-center gap-1"><AlertTriangle className="w-3 h-3" />{error}</p>}
          </div>
        );
      })}

      <details className="group">
        <summary className={`cursor-pointer text-xs font-medium flex items-center gap-1.5 ${darkMode ? 'text-gray-400 hover:text-gray-200' : 'text-gray-500 hover:text-gray-700'}`}>
          <Braces className="w-3.5 h-3.5" /> Preview request
        </summary>
        <pre className={`mt-2 overflow-x-auto whitespace-pre-wrap break-all rounded-lg border p-3 text-[11px] font-mono ${darkMode ? 'border-gray-800 bg-gray-950 text-gray-300' : 'border-gray-200 bg-gray-50 text-gray-700'}`}>
          {preview}
        </pre>
      </details>

      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="outline" size="sm" onClick={onCancel}>Cancel</Button>
        <Button type="submit" size="sm" className="gap-1.5">
          <ArrowRight className="w-3.5 h-3.5" /> Send request
        </Button>
      </div>
    </form>
  );
};

export default HttpActionVariableForm;
