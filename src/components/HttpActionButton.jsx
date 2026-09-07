import React from 'react';
import { Settings2, Zap, Send, Trash2, Plus, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import useToast from '../hooks/useToast';
import { useHttpActionButtonsState } from '../hooks/useStoreSelectors';
import { executeHttpAction, validateHeaders, validateJsonBody, validateHttpAction } from '../utils/httpAction';
import { createLogger } from '../utils/logger.js';

const log = createLogger('HttpActionButton');

const METHOD_OPTIONS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

const HttpButtonConfig = ({ button, darkMode, onUpdate, onClose }) => {
  const [label, setLabel] = React.useState(button.label || '');
  const [url, setUrl] = React.useState(button.url || '');
  const [method, setMethod] = React.useState(button.method || 'POST');
  const [headers, setHeaders] = React.useState(button.headers || '');
  const [body, setBody] = React.useState(button.body || '');

  React.useEffect(() => {
    setLabel(button.label || '');
    setUrl(button.url || '');
    setMethod(button.method || 'POST');
    setHeaders(button.headers || '');
    setBody(button.body || '');
  }, [button]);

  const headerCheck = React.useMemo(() => validateHeaders(headers), [headers]);
  const bodyCheck = React.useMemo(() => {
    const base = validateJsonBody(body, headers);
    const upper = String(method || 'GET').toUpperCase();
    if ((upper === 'GET' || upper === 'HEAD') && String(body || '').trim()) {
      return { valid: false, error: 'Body must be empty for GET/HEAD' };
    }
    return base;
  }, [body, headers, method]);
  const urlError = React.useMemo(() => {
    const v = validateHttpAction({ url, method, headers, body });
    return v.errors.url || null;
  }, [url, method, headers, body]);
  const canSave = headerCheck.valid && bodyCheck.valid && !urlError;

  const handleSave = () => {
    const v = validateHttpAction({ url, method, headers, body });
    if (!v.valid) {
      return;
    }
    onUpdate(button.id, {
      label: label.trim() || 'HTTP',
      url: url.trim(),
      method,
      headers: headers.trim(),
      body: body.trim(),
    });
    onClose?.();
  };

  return (
    <div className="space-y-3 w-[360px]">
      <div className="space-y-1.5">
        <label className={`text-xs font-semibold uppercase tracking-wide ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>Button label</label>
        <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="HTTP" className={darkMode ? 'bg-gray-950 border-gray-800 text-gray-100' : ''} />
      </div>
      <div className="space-y-1.5">
        <label className={`text-xs font-semibold uppercase tracking-wide ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>URL</label>
        <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="http://192.168.1.50:3000/trigger" className={darkMode ? `bg-gray-950 text-gray-100 ${urlError ? 'border-red-500 focus-visible:ring-red-500' : 'border-gray-800'}` : urlError ? 'border-red-500 focus-visible:ring-red-500' : ''} />
        {urlError && <p className="text-[11px] text-red-500">{urlError}</p>}
      </div>
      <div className="space-y-1.5">
        <label className={`text-xs font-semibold uppercase tracking-wide ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>Method</label>
        <select
          value={method}
          onChange={(e) => setMethod(e.target.value)}
          className={`w-full h-9 rounded-md border px-3 text-sm ${darkMode ? 'border-gray-700 bg-gray-950 text-gray-100' : 'border-gray-200 bg-white text-gray-900'}`}
        >
          {METHOD_OPTIONS.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
      </div>
      <div className="space-y-1.5">
        <label className={`text-xs font-semibold uppercase tracking-wide ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>Headers <span className="normal-case font-normal opacity-60">(JSON or Key: Value lines)</span></label>
        <Textarea value={headers} onChange={(e) => setHeaders(e.target.value)} placeholder={'{\n  "Content-Type": "application/json"\n}'} rows={3} className={`${darkMode ? 'bg-gray-950 text-gray-100 font-mono text-xs' : 'font-mono text-xs'} ${!headerCheck.valid ? 'border-red-500 focus-visible:ring-red-500' : darkMode ? 'border-gray-800' : ''}`} />
        {!headerCheck.valid ? <p className="text-[11px] text-red-500">✕ {headerCheck.error}</p> : headers.trim() ? <p className="text-[11px] text-emerald-500">✓ Valid JSON</p> : null}
      </div>
      <div className="space-y-1.5">
        <label className={`text-xs font-semibold uppercase tracking-wide ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>Body {body.trim() && (String(headers).toLowerCase().includes('application/json') || String(body).trim().startsWith('{') || String(body).trim().startsWith('[')) ? <span className="normal-case font-normal opacity-60">(JSON validated)</span> : null}</label>
        <Textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder='{"action":"next"}' rows={3} className={`${darkMode ? 'bg-gray-950 text-gray-100 font-mono text-xs' : 'font-mono text-xs'} ${!bodyCheck.valid ? 'border-red-500 focus-visible:ring-red-500' : darkMode ? 'border-gray-800' : ''}`} />
        {!bodyCheck.valid ? <p className="text-[11px] text-red-500">✕ {bodyCheck.error}</p> : body.trim() ? <p className="text-[11px] text-emerald-500">✓ Valid JSON</p> : <p className={`text-[11px] ${darkMode ? 'text-gray-500' : 'text-gray-500'}`}>Leave empty for GET/HEAD. Invalid JSON will block firing.</p>}
      </div>
      <div className="flex justify-end gap-2 pt-1">
        <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
        <Button size="sm" onClick={handleSave} disabled={!canSave} title={!canSave ? 'Fix JSON errors before saving' : undefined}>Save</Button>
      </div>
      {!canSave && <p className="text-[11px] text-amber-500 text-right">Fix highlighted JSON errors before saving/firing</p>}
    </div>
  );
};

const SingleHttpButton = ({ button, darkMode }) => {
  const { updateButton: update, removeButton: remove } = useHttpActionButtonsState();
  const { showToast } = useToast();
  const [firing, setFiring] = React.useState(false);
  const [configOpen, setConfigOpen] = React.useState(false);

  const handleFire = async () => {
    const v = validateHttpAction(button);
    if (!v.valid) {
      const field = Object.keys(v.errors)[0];
      const msg = v.errors[field];
      showToast({ title: field === 'headers' ? 'Invalid Headers JSON' : field === 'body' ? 'Invalid Body JSON' : 'Invalid HTTP config', message: msg, variant: 'error' });
      setConfigOpen(true);
      return;
    }
    if (!button.url?.trim()) {
      showToast({ title: 'Missing URL', message: 'Configure the HTTP action first.', variant: 'warning' });
      setConfigOpen(true);
      return;
    }
    setFiring(true);
    log.info('Firing HTTP button', { id: button.id, url: button.url, method: button.method });
    const result = await executeHttpAction(button);
    setFiring(false);
    if (result.validationError) {
      showToast({ title: 'JSON invalid — blocked', message: result.error, variant: 'error' });
      setConfigOpen(true);
      return;
    }
    if (result.success) {
      showToast({ title: 'HTTP sent', message: `${button.label || 'HTTP'} → ${result.status || 'OK'}`, variant: 'success' });
    } else {
      showToast({ title: 'HTTP failed', message: result.error || `HTTP ${result.status || 'error'} ${result.statusText || ''}`.trim(), variant: 'error' });
    }
  };

  // Longer labels/sections: truncate to keep header from blowing out, full label on hover.
  const displayLabel = button.label || 'HTTP';
  const truncatedLabel = displayLabel.length > 22 ? `${displayLabel.slice(0, 22)}…` : displayLabel;
  return (
    <div className={`inline-flex items-center gap-1 rounded-full border shadow-sm p-1 pr-1 min-w-0 shrink-0 max-w-full ${darkMode ? 'border-gray-700 bg-gray-800' : 'border-gray-200 bg-white'}`}>
      <button
        onClick={handleFire}
        disabled={firing}
        className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-wider transition-colors disabled:opacity-60 min-w-0 max-w-[180px] ${darkMode ? 'bg-white text-gray-900 hover:bg-gray-100' : 'bg-black text-white hover:bg-gray-900'}`}
        title={`${displayLabel} • ${button.method || 'POST'} ${button.url || '— not configured —'}`}
      >
        {firing ? <Loader2 className="w-3 h-3 shrink-0 animate-spin" /> : <Send className="w-3 h-3 shrink-0" />}
        <span className="truncate min-w-0">{truncatedLabel}</span>
      </button>

      <Popover open={configOpen} onOpenChange={setConfigOpen}>
        <PopoverTrigger asChild>
          <button
            className={`w-7 h-7 rounded-full flex items-center justify-center transition-colors ${darkMode ? 'hover:bg-gray-700 text-gray-400 hover:text-gray-100' : 'hover:bg-gray-100 text-gray-500 hover:text-gray-700'}`}
            title="Configure HTTP action — also in Settings → HTTP Actions"
            aria-label="Configure HTTP action"
          >
            <Settings2 className="w-3.5 h-3.5" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" side="bottom" className={`w-auto p-4 ${darkMode ? 'bg-gray-900 border-gray-800' : 'bg-white'}`}>
          <div className="flex items-center justify-between mb-3">
            <span className={`text-xs font-semibold uppercase tracking-wide flex items-center gap-2 ${darkMode ? 'text-gray-200' : 'text-gray-700'}`}>
              <Zap className="w-3.5 h-3.5" /> Configure HTTP
            </span>
            <button onClick={() => remove(button.id)} className="text-[11px] text-red-500 hover:text-red-400 flex items-center gap-1">
              <Trash2 className="w-3 h-3" /> Remove
            </button>
          </div>
          <HttpButtonConfig button={button} darkMode={darkMode} onUpdate={update} onClose={() => setConfigOpen(false)} />
          <p className={`mt-3 text-[11px] leading-relaxed ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>Tip: press the pill body to fire. Full config also in <span className="font-semibold">Settings → HTTP Actions</span>.</p>
        </PopoverContent>
      </Popover>
    </div>
  );
};

export const HttpActionButtons = ({ darkMode, compact = false }) => {
  const { buttons, addButton: add } = useHttpActionButtonsState();
  const list = Array.isArray(buttons) ? buttons : [];

  if (list.length === 0) {
    return (
      <button
        onClick={add}
        className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider transition-colors shadow-sm ${darkMode ? 'border-gray-700 bg-gray-800 text-gray-300 hover:bg-gray-700 hover:text-white' : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50 hover:text-gray-900'}`}
        title="Add HTTP action button"
      >
        <Plus className="w-3 h-3" />
        HTTP Action
      </button>
    );
  }

  // Handles longer sections: wrap, scroll on overflow, and tips for many buttons.
  return (
    <div className={`flex items-center gap-2 flex-wrap min-w-0 max-w-full ${compact ? 'w-full' : ''} ${list.length > 3 ? 'gap-1.5' : ''}`}>
      {list.map((b) => (
        <SingleHttpButton key={b.id} button={b} darkMode={darkMode} />
      ))}
      <button
        onClick={add}
        className={`w-7 h-7 rounded-full border flex items-center justify-center shadow-sm transition-colors shrink-0 ${darkMode ? 'border-gray-700 bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-100' : 'border-gray-200 bg-white text-gray-500 hover:bg-gray-50 hover:text-gray-700'}`}
        title="Add HTTP action — longer sections wrap to next line"
        aria-label="Add HTTP action"
      >
        <Plus className="w-3.5 h-3.5" />
      </button>
      {list.length > 6 && (
        <span className={`mono text-[10px] tracking-wide ${darkMode ? 'text-zinc-400' : 'text-zinc-500'}`}>{list.length} buttons • wraps automatically</span>
      )}
    </div>
  );
};

export default HttpActionButtons;
