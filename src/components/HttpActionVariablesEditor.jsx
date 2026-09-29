import React from 'react';
import { Plus, Trash2, Variable } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  HTTP_VARIABLE_TYPES,
  createHttpVariable,
  findUndeclaredPlaceholders,
  normalizeHttpVariables,
  parseVariableOptions,
} from '../utils/httpActionVariables';

const TYPE_LABELS = { text: 'Text', number: 'Number', select: 'Dropdown' };

/**
 * Variable list for a single HTTP action, shared by the settings card and the
 * header pill popover so both edit the same shape.
 */
const HttpActionVariablesEditor = ({ button, darkMode, onChange }) => {
  const raw = Array.isArray(button?.variables) ? button.variables : [];
  const declared = normalizeHttpVariables(raw);

  // A name is a duplicate when more than one row declares it.
  const nameCounts = new Map();
  for (const item of raw) {
    const key = String(item?.name || '').trim();
    if (key) nameCounts.set(key, (nameCounts.get(key) || 0) + 1);
  }

  const undeclared = findUndeclaredPlaceholders(button, declared);

  const commit = (next) => onChange({ variables: next });

  const updateAt = (index, patch) => {
    const next = raw.map((item, i) => (i === index ? { ...item, ...patch } : item));
    commit(next);
  };

  const addVariable = () => {
    commit([...raw, createHttpVariable({ label: '', type: 'text', required: true })]);
  };

  const removeAt = (index) => {
    commit(raw.filter((_, i) => i !== index));
  };

  const inputBase = darkMode ? 'bg-gray-950 text-gray-100' : '';
  const selectBase = darkMode
    ? 'border-gray-700 bg-gray-950 text-gray-100'
    : 'border-gray-200 bg-white text-gray-900';

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <label className={`text-xs font-semibold uppercase tracking-wide flex items-center gap-1.5 ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
          <Variable className="w-3.5 h-3.5" />
          Variables
          {declared.length > 0 && (
            <span className="normal-case font-normal opacity-60">({declared.length})</span>
          )}
        </label>
        <button
          type="button"
          onClick={addVariable}
          className={`inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide transition-colors ${darkMode ? 'text-blue-400 hover:text-blue-300' : 'text-blue-600 hover:text-blue-500'}`}
        >
          <Plus className="w-3.5 h-3.5" /> Add variable
        </button>
      </div>

      {raw.length === 0 && (
        <p className={`text-[11px] leading-relaxed ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
          No variables — this action sends immediately. Add a variable and it will ask for input before each request.
        </p>
      )}

      {raw.map((variable, index) => {
        const cleanName = String(variable?.name || '').trim();
        const nameError = cleanName.length > 0 && !/^[A-Za-z0-9_.-]+$/.test(cleanName);
        const duplicate = !nameError && cleanName.length > 0 && (nameCounts.get(cleanName) || 0) > 1;
        const options = parseVariableOptions(variable?.options);
        return (
          <div key={variable?.id || `variable-${index}`} className={`rounded-lg border p-3 space-y-2 ${darkMode ? 'border-gray-800 bg-gray-950/40' : 'border-gray-200 bg-gray-50'}`}>
            <div className="flex items-end gap-2">
              <div className="flex-1 space-y-1">
                <label className={`text-[10px] font-semibold uppercase tracking-wide ${darkMode ? 'text-gray-500' : 'text-gray-500'}`}>Name</label>
                <Input
                  value={cleanName}
                  onChange={(e) => updateAt(index, { name: e.target.value })}
                  placeholder="songTitle"
                  className={`${inputBase} h-8 font-mono text-xs ${nameError || duplicate ? 'border-red-500 focus-visible:ring-red-500' : darkMode ? 'border-gray-800' : ''}`}
                />
              </div>
              <div className="flex-1 space-y-1">
                <label className={`text-[10px] font-semibold uppercase tracking-wide ${darkMode ? 'text-gray-500' : 'text-gray-500'}`}>Prompt label</label>
                <Input
                  value={String(variable?.label || '')}
                  onChange={(e) => updateAt(index, { label: e.target.value })}
                  placeholder={cleanName || 'Song title'}
                  className={`${inputBase} h-8 text-xs ${darkMode ? 'border-gray-800' : ''}`}
                />
              </div>
              <button
                type="button"
                onClick={() => removeAt(index)}
                className={`h-8 w-8 shrink-0 rounded-md flex items-center justify-center transition-colors ${darkMode ? 'text-red-400 hover:bg-red-500/10' : 'text-red-500 hover:bg-red-500/10'}`}
                title="Remove variable"
                aria-label="Remove variable"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>

            {nameError && <p className="text-[11px] text-red-500">Use letters, numbers, dot, dash or underscore only.</p>}
            {duplicate && <p className="text-[11px] text-red-500">Another variable already uses this name.</p>}

            <div className="flex items-end gap-2">
              <div className="w-28 space-y-1">
                <label className={`text-[10px] font-semibold uppercase tracking-wide ${darkMode ? 'text-gray-500' : 'text-gray-500'}`}>Type</label>
                <select
                  value={HTTP_VARIABLE_TYPES.includes(variable?.type) ? variable.type : 'text'}
                  onChange={(e) => updateAt(index, { type: e.target.value })}
                  className={`w-full h-8 rounded-md border px-2 text-xs ${selectBase}`}
                >
                  {HTTP_VARIABLE_TYPES.map((t) => (
                    <option key={t} value={t}>{TYPE_LABELS[t]}</option>
                  ))}
                </select>
              </div>
              {variable?.type === 'select' ? (
                <div className="flex-1 space-y-1">
                  <label className={`text-[10px] font-semibold uppercase tracking-wide ${darkMode ? 'text-gray-500' : 'text-gray-500'}`}>Options (comma separated)</label>
                  <Input
                    value={Array.isArray(variable?.options) ? variable.options.join(', ') : String(variable?.options || '')}
                    onChange={(e) => updateAt(index, { options: parseVariableOptions(e.target.value) })}
                    placeholder="black, white, blue"
                    className={`${inputBase} h-8 text-xs ${options.length === 0 ? 'border-amber-500 focus-visible:ring-amber-500' : darkMode ? 'border-gray-800' : ''}`}
                  />
                </div>
              ) : (
                <div className="flex-1 space-y-1">
                  <label className={`text-[10px] font-semibold uppercase tracking-wide ${darkMode ? 'text-gray-500' : 'text-gray-500'}`}>Default value</label>
                  <Input
                    value={String(variable?.defaultValue ?? '')}
                    onChange={(e) => updateAt(index, { defaultValue: e.target.value })}
                    placeholder="optional"
                    className={`${inputBase} h-8 text-xs ${darkMode ? 'border-gray-800' : ''}`}
                  />
                </div>
              )}
              <label className={`flex items-center gap-1.5 h-8 text-[11px] whitespace-nowrap cursor-pointer ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                <input
                  type="checkbox"
                  checked={variable?.required !== false}
                  onChange={(e) => updateAt(index, { required: e.target.checked })}
                  className="rounded border-gray-400"
                />
                Required
              </label>
            </div>

            {variable?.type === 'select' && options.length === 0 && (
              <p className="text-[11px] text-amber-500">Add at least one option so the operator has something to pick.</p>
            )}
          </div>
        );
      })}

      {raw.length > 0 && (
        <p className={`text-[11px] leading-relaxed ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
          Reference any variable in the URL, headers or body as{' '}
          <span className="font-mono text-gray-400">{'{{name}}'}</span> or{' '}
          <span className="font-mono text-gray-400">{'${name}'}</span>. The request waits for your input before it is sent.
        </p>
      )}

      {undeclared.length > 0 && (
        <p className="text-[11px] text-amber-500">
          The request references {undeclared.map((n) => `{{${n}}}`).join(', ')} but no variable is defined for {undeclared.length === 1 ? 'it' : 'them'}. Add a variable with {undeclared.length === 1 ? 'that name' : 'those names'} before firing.
        </p>
      )}
    </div>
  );
};

export default HttpActionVariablesEditor;
