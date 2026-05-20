import React, { useState, useEffect } from 'react';
import { 
  Play, SkipBack, SkipForward, XSquare, Square, Image, 
  RefreshCw, Send, History, Settings, CheckCircle2, 
  XCircle, Info, ExternalLink, Plus, Trash2, Edit2, 
  Save, Zap, Layout, Terminal, MoreVertical, Star,
  Bell, BellOff, ArrowRight, Command
} from 'lucide-react';
import useFreeShowStore from '../context/FreeShowStore';
import useToast from '../hooks/useToast';
import { Tooltip } from "@/components/ui/tooltip";

const FreeShowControlPanel = ({ darkMode }) => {
  const { 
    apiUrl, 
    setApiUrl, 
    runAction, 
    history, 
    clearHistory,
    lastAction,
    setLastAction,
    lastData,
    setLastData,
    isEnabled,
    setIsEnabled,
    savedActions,
    addSavedAction,
    removeSavedAction,
    updateSavedAction,
    autoRunActionId,
    setAutoRunActionId
  } = useFreeShowStore();
  
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState('library'); // library, history, settings
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState(null);
  
  // Form state
  const [formData, setFormData] = useState({
    name: '',
    actionId: '',
    data: '{}'
  });

  const resetForm = () => {
    setFormData({ name: '', actionId: '', data: '{}' });
    setIsAdding(false);
    setEditingId(null);
  };

  const handleSaveAction = () => {
    if (!formData.name || !formData.actionId) {
      showToast({ title: 'Error', message: 'Name and Action ID are required', variant: 'error' });
      return;
    }

    if (editingId) {
      updateSavedAction(editingId, formData);
      showToast({ title: 'Success', message: 'Action updated', variant: 'success' });
    } else {
      addSavedAction(formData);
      showToast({ title: 'Success', message: 'Action saved to library', variant: 'success' });
    }
    resetForm();
  };

  const startEditing = (action) => {
    setFormData({
      name: action.name,
      actionId: action.actionId,
      data: action.data || '{}'
    });
    setEditingId(action.id);
    setIsAdding(true);
  };

  const handleRunActionWrapper = async (actionId, dataStr) => {
    if (!isEnabled) {
      showToast({
        title: 'FreeShow Disabled',
        message: 'Please enable FreeShow integration in settings.',
        variant: 'warning'
      });
      return;
    }

    const { success, error } = await runAction(actionId, dataStr);
    if (success) {
      showToast({
        title: 'Action Triggered',
        message: `Successfully executed ${actionId}`,
        variant: 'success',
        duration: 1500
      });
    } else {
      showToast({
        title: 'Action Failed',
        message: error || 'Connection error',
        variant: 'error'
      });
    }
  };

  const commonActions = [
    { id: 'next_slide', label: 'Next Slide', icon: SkipForward, color: 'from-blue-500 to-indigo-600' },
    { id: 'previous_slide', label: 'Prev Slide', icon: SkipBack, color: 'from-blue-500 to-indigo-600' },
    { id: 'clear_all', label: 'Clear All', icon: XSquare, color: 'from-red-500 to-rose-600' },
    { id: 'restore_output', label: 'Restore', icon: RefreshCw, color: 'from-green-500 to-emerald-600' },
  ];

  return (
    <div className={`flex flex-col h-full overflow-hidden rounded-2xl border shadow-xl ${darkMode ? 'border-gray-800 bg-gray-950 text-gray-100' : 'border-gray-200 bg-white text-gray-900'}`}>
      {/* Header */}
      <div className={`flex-shrink-0 border-b px-5 py-4 ${darkMode ? 'border-gray-800 bg-gray-900/50' : 'border-gray-100 bg-gray-50/50'}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className={`w-3 h-3 rounded-full ${isEnabled ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]' : 'bg-gray-500'}`}></div>
              {isEnabled && <div className="absolute inset-0 w-3 h-3 rounded-full bg-green-500 animate-ping opacity-25"></div>}
            </div>
            <div>
              <h3 className="text-xs font-black uppercase tracking-widest flex items-center gap-1.5">
                FreeShow <Zap className="w-3 h-3 text-yellow-500 fill-yellow-500" />
              </h3>
              <p className="text-[9px] font-bold opacity-40 uppercase tracking-tighter">Remote Controller</p>
            </div>
          </div>
          
          <div className={`flex p-1 rounded-xl ${darkMode ? 'bg-gray-800' : 'bg-gray-200'}`}>
            {[
              { id: 'library', icon: Layout, label: 'Library' },
              { id: 'history', icon: History, label: 'History' },
              { id: 'settings', icon: Settings, label: 'Config' }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all ${
                  activeTab === tab.id 
                    ? (darkMode ? 'bg-gray-700 text-white shadow-lg' : 'bg-white text-black shadow-sm') 
                    : 'text-gray-500 hover:text-gray-300'
                }`}
              >
                <tab.icon className="w-3 h-3" />
                <span className="hidden sm:inline">{tab.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {activeTab === 'library' && (
          <div className="p-5 space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Quick Actions */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase tracking-widest opacity-30">Quick Triggers</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {commonActions.map((action) => (
                  <button
                    key={action.id}
                    onClick={() => handleRunActionWrapper(action.id)}
                    className={`group relative flex items-center gap-2.5 px-4 py-3 rounded-xl overflow-hidden transition-all active:scale-95 shadow-md hover:shadow-lg`}
                  >
                    <div className={`absolute inset-0 bg-gradient-to-br ${action.color} opacity-90 group-hover:opacity-100 transition-opacity`}></div>
                    <action.icon className="relative w-4 h-4 text-white" />
                    <span className="relative text-xs font-bold text-white tracking-tight">{action.label}</span>
                    <div className="absolute right-2 opacity-0 group-hover:opacity-20 transition-opacity">
                      <Zap className="w-8 h-8 text-white rotate-12" />
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Actions Library */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase tracking-widest opacity-30">Action Library</span>
                <button 
                  onClick={() => setIsAdding(true)}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-bold transition-all ${darkMode ? 'bg-blue-600/20 text-blue-400 hover:bg-blue-600/30' : 'bg-blue-50 text-blue-600 hover:bg-blue-100'}`}
                >
                  <Plus className="w-3 h-3" /> New Action
                </button>
              </div>

              {isAdding && (
                <div className={`p-4 rounded-2xl border-2 border-dashed animate-in zoom-in-95 duration-200 ${darkMode ? 'border-gray-800 bg-gray-900/40' : 'border-gray-200 bg-gray-50'}`}>
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="text-[10px] font-black uppercase tracking-widest text-blue-500">{editingId ? 'Edit Action' : 'Define New Action'}</h4>
                    <button onClick={resetForm} className="opacity-40 hover:opacity-100"><XCircle className="w-4 h-4" /></button>
                  </div>
                  
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <label className="text-[9px] uppercase font-black opacity-40 ml-1">Friendly Name</label>
                        <input 
                          type="text" 
                          value={formData.name}
                          onChange={(e) => setFormData({...formData, name: e.target.value})}
                          placeholder="e.g. Start Service"
                          className={`w-full px-3 py-2.5 rounded-xl text-xs font-bold border focus:ring-2 focus:ring-blue-500 outline-none transition-all ${darkMode ? 'bg-gray-950 border-gray-800 text-white' : 'bg-white border-gray-200'}`}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[9px] uppercase font-black opacity-40 ml-1">Action ID</label>
                        <input 
                          type="text" 
                          value={formData.actionId}
                          onChange={(e) => setFormData({...formData, actionId: e.target.value})}
                          placeholder="next_slide"
                          className={`w-full px-3 py-2.5 rounded-xl text-xs font-mono border focus:ring-2 focus:ring-blue-500 outline-none transition-all ${darkMode ? 'bg-gray-950 border-gray-800 text-white' : 'bg-white border-gray-200'}`}
                        />
                      </div>
                    </div>
                    
                    <div className="space-y-1.5">
                      <label className="text-[9px] uppercase font-black opacity-40 ml-1">Payload (JSON)</label>
                      <textarea 
                        value={formData.data}
                        onChange={(e) => setFormData({...formData, data: e.target.value})}
                        placeholder='{"id": "..."}'
                        rows={2}
                        className={`w-full px-3 py-2.5 rounded-xl text-[10px] border font-mono focus:ring-2 focus:ring-blue-500 outline-none transition-all resize-none ${darkMode ? 'bg-gray-950 border-gray-800 text-white' : 'bg-white border-gray-200'}`}
                      />
                    </div>

                    <button
                      onClick={handleSaveAction}
                      className={`w-full py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-600/20 active:scale-95`}
                    >
                      <Save className="w-3.5 h-3.5" />
                      {editingId ? 'Update Action' : 'Save Action'}
                    </button>
                  </div>
                </div>
              )}

              {savedActions.length === 0 && !isAdding ? (
                <div className={`py-12 text-center rounded-2xl border-2 border-dashed ${darkMode ? 'border-gray-800/50 opacity-20' : 'border-gray-100 opacity-40'}`}>
                  <Terminal className="w-10 h-10 mx-auto mb-3" />
                  <p className="text-xs font-bold uppercase tracking-tight">Your library is empty</p>
                  <p className="text-[10px] mt-1">Create custom triggers for your workflow</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {savedActions.map((action) => (
                    <div 
                      key={action.id} 
                      className={`group flex items-center gap-3 p-3.5 rounded-2xl border transition-all hover:shadow-md ${
                        darkMode ? 'bg-gray-900/40 border-gray-800 hover:border-gray-700' : 'bg-gray-50 border-gray-100 hover:border-gray-200'
                      }`}
                    >
                      <button 
                        onClick={() => handleRunActionWrapper(action.actionId, action.data)}
                        className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center transition-all active:scale-90 ${darkMode ? 'bg-blue-600/20 text-blue-400 hover:bg-blue-600/40' : 'bg-blue-600 text-white hover:bg-blue-700'}`}
                      >
                        <Play className="w-4 h-4 fill-current" />
                      </button>
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-black truncate tracking-tight">{action.name}</span>
                          {autoRunActionId === action.id && (
                            <span className={`px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-tighter ${darkMode ? 'bg-green-500/20 text-green-400' : 'bg-green-100 text-green-700'}`}>
                              Auto
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5 opacity-40">
                          <code className="text-[9px] font-mono">{action.actionId}</code>
                          <span className="text-[9px] font-bold">•</span>
                          <span className="text-[9px] font-bold truncate max-w-[100px]">{action.data || '{}'}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Tooltip content="Run on project start">
                            <button 
                              onClick={() => setAutoRunActionId(autoRunActionId === action.id ? null : action.id)}
                              className={`p-2 rounded-lg transition-colors ${autoRunActionId === action.id ? 'text-green-500' : 'text-gray-500 hover:bg-gray-500/10'}`}
                            >
                              {autoRunActionId === action.id ? <Bell className="w-3.5 h-3.5 fill-current" /> : <BellOff className="w-3.5 h-3.5" />}
                            </button>
                        </Tooltip>
                        
                        <button onClick={() => startEditing(action)} className="p-2 text-gray-500 hover:text-blue-500 transition-colors"><Edit2 className="w-3.5 h-3.5" /></button>
                        <button onClick={() => removeSavedAction(action.id)} className="p-2 text-gray-500 hover:text-red-500 transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Manual Terminal (Replacing Custom Action) */}
            <div className={`p-5 rounded-2xl overflow-hidden relative ${darkMode ? 'bg-gray-900 border border-gray-800' : 'bg-gray-50 border border-gray-200'}`}>
              <div className="absolute top-0 right-0 p-3 opacity-5 pointer-events-none">
                <Command className="w-20 h-20" />
              </div>
              
              <div className="flex items-center gap-2 mb-4 relative">
                <Terminal className="w-4 h-4 text-blue-500" />
                <span className="text-[10px] font-black uppercase tracking-widest">Manual Command</span>
              </div>

              <div className="flex gap-2 relative">
                <div className="flex-1 space-y-2">
                  <input 
                    type="text" 
                    value={lastAction}
                    onChange={(e) => setLastAction(e.target.value)}
                    placeholder="Action ID..."
                    className={`w-full px-3 py-2.5 rounded-xl text-xs font-mono border transition-all ${darkMode ? 'bg-gray-950 border-gray-800 text-blue-400 placeholder:text-gray-700' : 'bg-white border-gray-200 text-blue-600'}`}
                  />
                  <input 
                    type="text" 
                    value={lastData}
                    onChange={(e) => setLastData(e.target.value)}
                    placeholder='Payload JSON e.g. {"index": 0}'
                    className={`w-full px-3 py-2 rounded-xl text-[10px] font-mono border transition-all ${darkMode ? 'bg-gray-950 border-gray-800 text-gray-400 placeholder:text-gray-700' : 'bg-white border-gray-200 text-gray-600'}`}
                  />
                </div>
                <button 
                  onClick={() => handleRunActionWrapper(lastAction, lastData)}
                  className={`flex flex-col items-center justify-center gap-1.5 px-4 rounded-xl text-white font-black transition-all active:scale-95 bg-black hover:bg-gray-800`}
                >
                  <Send className="w-4 h-4" />
                  <span className="text-[8px] uppercase tracking-tighter">Exec</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'history' && (
          <div className="p-5 space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-black uppercase tracking-widest opacity-30">Execution Log</span>
              <button 
                onClick={clearHistory}
                className="text-[10px] font-black text-red-500 hover:underline px-2 py-1"
              >
                Clear All
              </button>
            </div>
            
            {history.length === 0 ? (
              <div className="py-20 text-center opacity-20">
                <History className="w-12 h-12 mx-auto mb-3" />
                <p className="text-xs font-black uppercase">No activity logged</p>
              </div>
            ) : (
              <div className="space-y-2">
                {history.map((item, idx) => (
                  <div key={idx} className={`group flex items-start gap-3 p-3.5 rounded-2xl border transition-all ${darkMode ? 'bg-gray-900/40 border-gray-800' : 'bg-white border-gray-100 shadow-sm'}`}>
                    <div className={`mt-1 flex-shrink-0 w-2 h-2 rounded-full ${item.success ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.4)]' : 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.4)]'}`}></div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-black truncate tracking-tight">{item.action}</span>
                        <span className="text-[9px] font-bold opacity-30 whitespace-nowrap">{new Date(item.timestamp).toLocaleTimeString()}</span>
                      </div>
                      {item.data && item.data !== '{}' && (
                        <code className={`text-[10px] block mt-1 px-2 py-1 rounded bg-black/10 font-mono truncate ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>{item.data}</code>
                      )}
                      {!item.success && item.error && (
                        <p className="text-[9px] mt-1 text-red-500 font-bold">{item.error}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="p-5 space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className={`p-4 rounded-2xl border-2 border-blue-500/20 bg-blue-500/5`}>
              <div className="flex gap-3">
                <Info className="w-5 h-5 flex-shrink-0 text-blue-500" />
                <div>
                  <p className="text-xs font-bold text-blue-500 mb-1 uppercase tracking-tighter">API Connection</p>
                  <p className="text-[10px] leading-relaxed opacity-70">
                    Enable the **REST API** in FreeShow Settings &gt; Connections. The default port is usually **5506**.
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-6">
              <div className={`flex items-center justify-between p-4 rounded-2xl border ${darkMode ? 'bg-gray-900 border-gray-800' : 'bg-gray-50 border-gray-200'}`}>
                <div>
                  <h4 className="text-xs font-black uppercase tracking-tight">Active Integration</h4>
                  <p className="text-[9px] font-bold opacity-40 uppercase">Allow remote commands</p>
                </div>
                <div 
                  onClick={() => setIsEnabled(!isEnabled)}
                  className={`w-12 h-6 rounded-full p-1 cursor-pointer transition-all ${isEnabled ? 'bg-green-500' : 'bg-gray-700'}`}
                >
                  <div className={`w-4 h-4 bg-white rounded-full shadow-lg transform transition-transform ${isEnabled ? 'translate-x-6' : 'translate-x-0'}`}></div>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[9px] uppercase font-black opacity-40 ml-1">Endpoint URL</label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <input 
                      type="text" 
                      value={apiUrl}
                      onChange={(e) => setApiUrl(e.target.value)}
                      placeholder="http://localhost:5506"
                      className={`w-full pl-3 pr-10 py-3 rounded-xl text-xs font-mono border focus:ring-2 focus:ring-blue-500 outline-none transition-all ${darkMode ? 'bg-gray-900 border-gray-800 text-white' : 'bg-white border-gray-200'}`}
                    />
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 flex gap-1">
                       <div className={`w-2 h-2 rounded-full ${isEnabled ? 'bg-green-500' : 'bg-gray-500'}`}></div>
                    </div>
                  </div>
                  <button 
                    onClick={() => handleRunActionWrapper('get_cleared')}
                    className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all ${darkMode ? 'bg-gray-800 border-gray-700 hover:bg-gray-700' : 'bg-white border-gray-200 hover:bg-gray-50'}`}
                  >
                    Test
                  </button>
                </div>
              </div>

              <div className="pt-6 border-t border-gray-800/20">
                <a 
                  href="https://freeshow.app/docs/connecting" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className={`flex items-center justify-between p-4 rounded-xl transition-all ${darkMode ? 'bg-gray-900/50 hover:bg-gray-800' : 'bg-gray-100 hover:bg-gray-200'}`}
                >
                  <div className="flex items-center gap-3">
                    <Layout className="w-4 h-4 opacity-40" />
                    <span className="text-[10px] font-black uppercase tracking-widest opacity-60">Documentation</span>
                  </div>
                  <ExternalLink className="w-3 h-3 opacity-40" />
                </a>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Footer / Status Bar */}
      <div className={`flex-shrink-0 px-5 py-2.5 border-t text-[8px] font-black uppercase tracking-[0.2em] flex items-center justify-between opacity-30 ${darkMode ? 'border-gray-800 bg-gray-950' : 'border-gray-100 bg-gray-50'}`}>
        <div className="flex items-center gap-2">
          <span>Status:</span>
          <span className={isEnabled ? 'text-green-500' : 'text-gray-500'}>{isEnabled ? 'Operational' : 'Offline'}</span>
        </div>
        <div className="flex items-center gap-3">
          <span>v1.2.0-remote</span>
          <span>FS-CORE: 5.0.0</span>
        </div>
      </div>
    </div>
  );
};

export default FreeShowControlPanel;

