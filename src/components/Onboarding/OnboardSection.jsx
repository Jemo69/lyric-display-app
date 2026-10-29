import React, { useState } from 'react';
import {
  GraduationCap, Sparkles, Play, RotateCcw, CheckCircle2, Circle,
  Keyboard, History, Trash2, User, Lightbulb, MonitorPlay,
} from 'lucide-react';
import { useOnboardStore, ONBOARD_ROLES, CHECKLIST_TASKS } from '../../context/OnboardStore';
import { loadDemoService, clearDemoService } from './demoService';

function Row({ darkMode, icon, title, desc, control }) {
  return (
    <div className={`flex items-start gap-3 p-3 rounded-xl border ${darkMode ? 'bg-gray-900/60 border-gray-800' : 'bg-white border-gray-200'}`}>
      <div className={`mt-0.5 ${darkMode ? 'text-blue-400' : 'text-blue-600'}`}>{icon}</div>
      <div className="flex-1 min-w-0">
        <div className={`text-sm font-semibold ${darkMode ? 'text-white' : 'text-gray-900'}`}>{title}</div>
        {desc && <div className={`text-xs mt-0.5 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>{desc}</div>}
      </div>
      {control}
    </div>
  );
}

export default function OnboardSection({ darkMode, onOpenTour, onOpenSpotlight, onOpenAI, onOpenShortcuts }) {
  const {
    role, setRole, explainMode, setExplainMode,
    checklist, completeTask, resetChecklist,
    actionLog, clearActionLog, demoLoaded, logAction,
  } = useOnboardStore();
  const [confirmClear, setConfirmClear] = useState(false);

  const doneCount = CHECKLIST_TASKS.filter((t) => checklist[t.id]).length;
  const btn = 'px-3 py-1.5 text-xs font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700 whitespace-nowrap';
  const ghost = `px-3 py-1.5 text-xs font-medium rounded-lg border whitespace-nowrap ${darkMode ? 'border-gray-700 hover:bg-gray-800' : 'border-gray-300 hover:bg-gray-100'}`;

  return (
    <div className="space-y-3">
      <p className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
        Everything for teaching someone Selah: tours, a demo service, first-task checklist, role presets, and a what-happened log.
      </p>

      {/* Tours */}
      <Row darkMode={darkMode} icon={<GraduationCap className="w-4 h-4" />} title="Guided tour (cards)"
        desc="8 steps explaining each part of the UI."
        control={<button className={btn} onClick={onOpenTour}>Start</button>} />
      <Row darkMode={darkMode} icon={<MonitorPlay className="w-4 h-4" />} title="Spotlight tour (interactive)"
        desc="Highlights the real UI element for each step."
        control={<button className={btn} onClick={onOpenSpotlight}>Start</button>} />
      <Row darkMode={darkMode} icon={<Sparkles className="w-4 h-4" />} title="AI setup helper"
        desc="Copy a prompt into Pi, OpenCode, ChatGPT… to plan your setup."
        control={<button className={btn} onClick={onOpenAI}>Open</button>} />

      {/* Demo service */}
      <Row darkMode={darkMode} icon={<Play className="w-4 h-4" />} title="Demo service"
        desc={demoLoaded ? 'Loaded: 2 demo songs + welcome note + setlist.' : 'Load 2 sample songs, a note, and a setlist instantly.'}
        control={demoLoaded ? (
          <button className={ghost} onClick={() => { clearDemoService(); logAction('Cleared demo service'); }}>Clear</button>
        ) : (
          <button className={btn} onClick={() => loadDemoService()}>Load demo</button>
        )} />

      {/* First-task checklist */}
      <div className={`p-3 rounded-xl border space-y-2 ${darkMode ? 'bg-gray-900/60 border-gray-800' : 'bg-white border-gray-200'}`}>
        <div className="flex items-center justify-between">
          <div className={`text-sm font-semibold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
            First-task checklist <span className={`text-xs font-normal ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>{doneCount}/{CHECKLIST_TASKS.length}</span>
          </div>
          <button className={ghost} onClick={resetChecklist} title="Reset checklist"><RotateCcw className="w-3.5 h-3.5" /></button>
        </div>
        <div className="h-1.5 rounded-full overflow-hidden bg-black/10">
          <div className="h-full bg-green-500 transition-all" style={{ width: `${(doneCount / CHECKLIST_TASKS.length) * 100}%` }} />
        </div>
        {CHECKLIST_TASKS.map((t) => (
          <button key={t.id} onClick={() => completeTask(t.id)} className="w-full flex items-start gap-2 text-left py-1">
            {checklist[t.id]
              ? <CheckCircle2 className="w-4 h-4 mt-0.5 text-green-500 shrink-0" />
              : <Circle className={`w-4 h-4 mt-0.5 shrink-0 ${darkMode ? 'text-gray-600' : 'text-gray-300'}`} />}
            <span>
              <span className={`text-xs font-medium ${checklist[t.id] ? 'line-through opacity-60' : ''}`}>{t.label}</span>
              <span className={`block text-[11px] ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>{t.hint}</span>
            </span>
          </button>
        ))}
      </div>

      {/* Role preset */}
      <Row darkMode={darkMode} icon={<User className="w-4 h-4" />} title="Role preset"
        desc="Simplify the UI for a trainee's job. Hides advanced sections from Preferences."
        control={
          <select value={role} onChange={(e) => { setRole(e.target.value); logAction(`Role preset: ${e.target.value}`); }}
            className={`text-xs rounded-lg border px-2 py-1.5 max-w-[160px] ${darkMode ? 'bg-gray-800 border-gray-700 text-white' : 'bg-white border-gray-300'}`}>
            {ONBOARD_ROLES.map((r) => <option key={r.id} value={r.id} title={r.hint}>{r.label}</option>)}
          </select>} />

      {/* Explain mode + shortcuts */}
      <Row darkMode={darkMode} icon={<Lightbulb className="w-4 h-4" />} title="Explain mode"
        desc="Hovering toolbar buttons shows a plain-language teaching tip."
        control={
          <button onClick={() => setExplainMode(!explainMode)} className={`relative w-10 h-5 rounded-full transition-colors ${explainMode ? 'bg-blue-600' : darkMode ? 'bg-gray-700' : 'bg-gray-300'}`}>
            <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${explainMode ? 'left-[22px]' : 'left-0.5'}`} />
          </button>} />
      <Row darkMode={darkMode} icon={<Keyboard className="w-4 h-4" />} title="Shortcut cheat-sheet"
        desc="Press ? anywhere to open it."
        control={<button className={ghost} onClick={onOpenShortcuts}>Open</button>} />

      {/* Action log */}
      <div className={`p-3 rounded-xl border space-y-2 ${darkMode ? 'bg-gray-900/60 border-gray-800' : 'bg-white border-gray-200'}`}>
        <div className="flex items-center justify-between">
          <div className={`text-sm font-semibold flex items-center gap-2 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
            <History className="w-4 h-4" /> What just happened?
          </div>
          <button className={ghost} onClick={() => {
            if (confirmClear) { clearActionLog(); setConfirmClear(false); }
            else { setConfirmClear(true); setTimeout(() => setConfirmClear(false), 2500); }
          }}>
            <span className="flex items-center gap-1"><Trash2 className="w-3 h-3" />{confirmClear ? 'Confirm' : 'Clear'}</span>
          </button>
        </div>
        {actionLog.length === 0 ? (
          <p className={`text-xs ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>Key actions (firing slides, show states, tours) appear here for trainees.</p>
        ) : (
          <ul className="space-y-1 max-h-40 overflow-y-auto">
            {actionLog.map((a, i) => (
              <li key={`${a.at}-${i}`} className={`text-xs ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                <span className={`font-mono text-[10px] mr-2 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                  {new Date(a.at).toLocaleTimeString()}
                </span>{a.text}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
