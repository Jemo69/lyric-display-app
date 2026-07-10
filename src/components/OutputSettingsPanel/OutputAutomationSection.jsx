import React from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip } from '@/components/ui/tooltip';
import { Zap, Plus, Trash2, Power } from 'lucide-react';
import { useOutputAutomationState } from '../../hooks/useStoreSelectors';

export default function OutputAutomationSection({ darkMode }) {
  const { outputActions, addOutputAction, removeOutputAction, updateOutputAction } = useOutputAutomationState();

  return (
    <div className={`mt-4 space-y-3 rounded-xl border p-4 ${darkMode ? 'border-gray-800 bg-gray-950/40' : 'border-gray-200 bg-gray-50/50'}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Zap className={`w-4 h-4 ${darkMode ? 'text-amber-400' : 'text-amber-600'}`} />
          <h4 className={`text-xs font-bold uppercase tracking-wider ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>Output Actions (HTTP Automation)</h4>
        </div>
        <Button size="sm" variant="outline" onClick={addOutputAction} className="h-7 px-2 text-xs">
          <Plus className="w-3 h-3 mr-1" /> Add
        </Button>
      </div>
      <p className={`text-[11px] ${darkMode ? 'text-gray-500' : 'text-gray-500'}`}>Trigger HTTP endpoints when output toggles live/off. Useful for FreeShow, OBS, custom hardware. Uses endpoint like http://localhost:5505/</p>

      {outputActions.length === 0 && (
        <div className={`text-xs p-3 rounded-lg border border-dashed text-center ${darkMode ? 'border-gray-700 text-gray-500' : 'border-gray-300 text-gray-500'}`}>No actions. Click Add to create one.</div>
      )}

      <div className="space-y-3">
        {outputActions.map((action) => (
          <div key={action.id} className={`rounded-lg border p-3 space-y-2 ${darkMode ? 'border-gray-800 bg-gray-900/50' : 'border-gray-200 bg-white'}`}>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 flex-1">
                <Switch checked={action.enabled !== false} onCheckedChange={(v) => updateOutputAction(action.id, { enabled: v })} />
                <span className={`text-xs font-medium truncate ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>{action.enabled !== false ? 'Enabled' : 'Disabled'}</span>
              </div>
              <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => removeOutputAction(action.id)}>
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </div>

            <div className="grid grid-cols-1 gap-2">
              <div>
                <label className={`text-[11px] font-medium ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>Endpoint URL</label>
                <Input value={action.endpoint} onChange={(e) => updateOutputAction(action.id, { endpoint: e.target.value })} placeholder="http://localhost:5505/" className={`mt-1 text-xs h-8 ${darkMode ? 'bg-gray-800 border-gray-700 text-gray-200' : ''}`} />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className={`text-[11px] font-medium ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>On Action</label>
                  <Input value={action.onAction || ''} onChange={(e) => updateOutputAction(action.id, { onAction: e.target.value })} placeholder="action_on" className={`mt-1 text-xs h-8 ${darkMode ? 'bg-gray-800 border-gray-700 text-gray-200' : ''}`} />
                </div>
                <div>
                  <label className={`text-[11px] font-medium ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>Off Action</label>
                  <Input value={action.offAction || ''} onChange={(e) => updateOutputAction(action.id, { offAction: e.target.value })} placeholder="action_off" className={`mt-1 text-xs h-8 ${darkMode ? 'bg-gray-800 border-gray-700 text-gray-200' : ''}`} />
                </div>
              </div>

              <div>
                <label className={`text-[11px] font-medium ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>Payload Format</label>
                <Select value={action.payloadFormat || 'boolean'} onValueChange={(v) => updateOutputAction(action.id, { payloadFormat: v })}>
                  <SelectTrigger className={`mt-1 h-8 text-xs ${darkMode ? 'bg-gray-800 border-gray-700 text-gray-200' : ''}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="boolean">Boolean (on/off suffix)</SelectItem>
                    <SelectItem value="action">Action only</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
