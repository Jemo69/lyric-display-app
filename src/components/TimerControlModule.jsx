import React from 'react';
import { Pause, Play, Plus, SkipForward, Square, Timer, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { ColorPicker } from '@/components/ui/color-picker';
import { useControlSocket } from '../context/ControlSocketProvider';
import useSharedTimer from '../hooks/useSharedTimer';
import { DEFAULT_TIMER_DISPLAY, formatGlobalClock, minutesToMs, msToMinutesInput, secondsToMs, splitClockPeriod } from '../utils/timerUtils';
import { useDarkModeState, useTimerDisplaySettings } from '../hooks/useStoreSelectors';
import FontSelect from './FontSelect';

const QUICK_MINUTES = [1, 3, 5, 10, 15, 30];
const PERIOD_STYLE = {
  fontSize: '0.42em',
  marginLeft: '0.12em',
  verticalAlign: 'baseline',
  lineHeight: 1,
};

const createTimerSet = (index = 0) => ({
  id: `timer-set-${Date.now()}-${index}`,
  label: `Timer ${index + 1}`,
  durationMs: minutesToMs(5),
});

const TimerControlModule = () => {
  const { emitStageTimerUpdate } = useControlSocket();
  const { darkMode } = useDarkModeState();
  const { settings: timerDisplaySettings, updateSettings: updateTimerDisplaySettings } = useTimerDisplaySettings();
  const { timerState, now, displayValue, intensity, progress, actions } = useSharedTimer({
    emitTimerUpdate: emitStageTimerUpdate,
    controller: true,
  });
  const { commitTimerState } = actions;
  const latestTimerStateRef = React.useRef(timerState);

  const [mode, setMode] = React.useState('countdown');
  const [durationMinutes, setDurationMinutes] = React.useState(5);
  const [targetTime, setTargetTime] = React.useState('');
  const [warningSeconds, setWarningSeconds] = React.useState(60);
  const [criticalSeconds, setCriticalSeconds] = React.useState(30);
  const [overrunMode, setOverrunMode] = React.useState(false);
  const [useSets, setUseSets] = React.useState(false);
  const [sets, setSets] = React.useState([createTimerSet(0), createTimerSet(1)]);
  const [autoStartNext, setAutoStartNext] = React.useState(true);
  const [indicatorEnabled, setIndicatorEnabled] = React.useState(true);
  const [indicatorSeconds, setIndicatorSeconds] = React.useState(10);
  const [indicatorLabel, setIndicatorLabel] = React.useState('Next timer starts in');

  const displaySettings = React.useMemo(() => {
    const settings = {
      ...DEFAULT_TIMER_DISPLAY,
      ...(timerDisplaySettings || {}),
    };
    settings.otherItemsScale = timerDisplaySettings?.otherItemsScale ?? timerDisplaySettings?.globalClockScale ?? DEFAULT_TIMER_DISPLAY.otherItemsScale;
    settings.globalClockScale = settings.otherItemsScale;
    return settings;
  }, [timerDisplaySettings]);

  const active = timerState.running || timerState.paused;
  const accent = intensity === 'critical' ? '#EF4444' : intensity === 'warning' ? '#F59E0B' : displaySettings.accentColor;
  const globalClockValue = React.useMemo(() => formatGlobalClock(now, {
    clockHour12: displaySettings.clockHour12,
    clockShowSeconds: displaySettings.clockShowSeconds,
    clockShowPeriod: displaySettings.clockShowPeriod,
  }), [displaySettings.clockHour12, displaySettings.clockShowPeriod, displaySettings.clockShowSeconds, now]);
  const globalClockParts = React.useMemo(() => splitClockPeriod(globalClockValue), [globalClockValue]);

  React.useEffect(() => {
    latestTimerStateRef.current = timerState;
  }, [timerState]);

  const applyTimerDisplaySettings = React.useCallback((partial) => {
    const displayUpdatedAt = Date.now();
    const normalizedPartial = { ...partial, displayUpdatedAt };
    if (Object.prototype.hasOwnProperty.call(normalizedPartial, 'otherItemsScale')) {
      normalizedPartial.globalClockScale = normalizedPartial.otherItemsScale;
    }
    const nextDisplay = {
      ...displaySettings,
      ...normalizedPartial,
    };
    updateTimerDisplaySettings(normalizedPartial);
    commitTimerState({
      ...latestTimerStateRef.current,
      display: nextDisplay,
    });
  }, [commitTimerState, displaySettings, updateTimerDisplaySettings]);

  const buildDisplay = () => ({
    ...displaySettings,
  });

  const getTargetTimestamp = () => {
    if (!targetTime) return null;
    const [hours, minutes] = targetTime.split(':').map((part) => Number(part));
    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
    const next = new Date();
    next.setHours(hours, minutes, 0, 0);
    if (next.getTime() <= Date.now()) {
      next.setDate(next.getDate() + 1);
    }
    return next.getTime();
  };

  const handleStart = () => {
    const display = buildDisplay();
    if (useSets) {
      actions.startTimerSet({
        sets,
        warningMs: secondsToMs(warningSeconds),
        criticalMs: secondsToMs(criticalSeconds),
        overrunMode,
        autoStartNext,
        indicatorEnabled,
        indicatorDurationMs: secondsToMs(indicatorSeconds),
        indicatorLabel,
        display,
      });
      return;
    }

    actions.startTimer({
      mode,
      durationMs: minutesToMs(durationMinutes),
      targetTime: mode === 'target' ? getTargetTimestamp() : null,
      label: display.label,
      warningMs: secondsToMs(warningSeconds),
      criticalMs: secondsToMs(criticalSeconds),
      overrunMode,
      display,
    });
  };

  const updateSet = (id, updates) => {
    if (active) return;
    setSets((current) => current.map((set) => (set.id === id ? { ...set, ...updates } : set)));
  };

  const addSet = () => {
    if (active) return;
    setSets((current) => [...current, createTimerSet(current.length)]);
  };

  const removeSet = (id) => {
    if (active) return;
    setSets((current) => current.length <= 1 ? current : current.filter((set) => set.id !== id));
  };

  const panelClass = darkMode ? 'border-gray-700 bg-gray-800 text-gray-100' : 'border-gray-200 bg-white text-gray-900';
  const mutedText = darkMode ? 'text-gray-400' : 'text-gray-500';
  const inputClass = darkMode ? 'bg-gray-700 border-gray-600 text-gray-100' : 'bg-white border-gray-300';
  const outlineButtonClass = darkMode
    ? 'bg-gray-800 border-gray-600 text-gray-100 hover:bg-gray-700 hover:text-white'
    : '';
  const subtleButtonClass = darkMode
    ? 'bg-gray-700 hover:bg-gray-600 text-gray-100 disabled:bg-gray-700 disabled:text-gray-500'
    : 'bg-gray-100 hover:bg-gray-200 text-gray-800 disabled:text-gray-400';
  const switchBaseClasses = `!h-8 !w-16 !border-0 shadow-sm transition-colors ${darkMode
    ? 'data-[state=checked]:bg-green-400 data-[state=unchecked]:bg-gray-600'
    : 'data-[state=checked]:bg-black data-[state=unchecked]:bg-gray-300'
    }`;
  const switchThumbClass = '!h-6 !w-7 data-[state=checked]:!translate-x-8 data-[state=unchecked]:!translate-x-1';
  const getSwitchProps = (disabled = false) => ({
    className: `${switchBaseClasses} ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`,
    thumbClassName: switchThumbClass,
  });

  return (
    <div className={`h-full overflow-y-auto ${darkMode ? 'bg-gray-900 text-gray-100' : 'bg-gray-50 text-gray-900'}`}>
      <div className="min-h-full p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Timer className="w-5 h-5" />
            <h1 className="text-lg font-semibold">Timer Control</h1>
          </div>
          <Button variant="outline" size="sm" className={outlineButtonClass} onClick={() => window.electronAPI?.display?.openOutputWindow?.('time')}>
            Open Display
          </Button>
        </div>

        <div className="grid grid-cols-[minmax(300px,0.9fr)_minmax(420px,1.2fr)_minmax(300px,0.9fr)] gap-4">
          <section className={`rounded-lg border p-4 space-y-4 ${panelClass}`}>
            <div>
              <h2 className="text-sm font-semibold">Timer Setup</h2>
              <p className={`text-xs ${mutedText}`}>Inputs lock while a timer is active.</p>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium">Mode</label>
              <Select value={mode} onValueChange={setMode} disabled={active || useSets}>
                <SelectTrigger className={inputClass}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="countdown">Countdown</SelectItem>
                  <SelectItem value="countup">Count up</SelectItem>
                  <SelectItem value="target">Until time</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {!useSets && mode !== 'target' && mode !== 'countup' && (
              <div className="space-y-2">
                <label className="text-xs font-medium">Duration</label>
                <div className="flex gap-2">
                  <Input
                    type="number"
                    min="0"
                    step="0.5"
                    disabled={active}
                    value={durationMinutes}
                    onChange={(event) => setDurationMinutes(event.target.value)}
                    className={inputClass}
                  />
                  <span className={`self-center text-xs ${mutedText}`}>minutes</span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {QUICK_MINUTES.map((minutes) => (
                    <button
                      key={minutes}
                      disabled={active}
                      onClick={() => setDurationMinutes(minutes)}
                      className={`h-8 rounded text-xs font-medium transition-colors disabled:opacity-50 ${subtleButtonClass}`}
                    >
                      {minutes}m
                    </button>
                  ))}
                </div>
              </div>
            )}

            {!useSets && mode === 'target' && (
              <div className="space-y-2">
                <label className="text-xs font-medium">Target Time</label>
                <Input type="time" disabled={active} value={targetTime} onChange={(event) => setTargetTime(event.target.value)} className={inputClass} />
              </div>
            )}

            <div className="space-y-2">
              <label className="text-xs font-medium">Display Label</label>
              <Input
                disabled={active}
                value={displaySettings.label || ''}
                onChange={(event) => applyTimerDisplaySettings({ label: event.target.value })}
                className={inputClass}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <label className="text-xs font-medium">Warn At</label>
                <Input type="number" min="0" disabled={active} value={warningSeconds} onChange={(event) => setWarningSeconds(event.target.value)} className={inputClass} />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium">Critical At</label>
                <Input type="number" min="0" disabled={active} value={criticalSeconds} onChange={(event) => setCriticalSeconds(event.target.value)} className={inputClass} />
              </div>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-sm">Continue as overrun</span>
              <Switch checked={overrunMode} onCheckedChange={setOverrunMode} disabled={active} {...getSwitchProps(active)} />
            </div>
          </section>

          <section className={`rounded-lg border p-4 flex flex-col ${panelClass}`}>
            <div
              className="rounded-lg min-h-[255px] flex flex-col items-center justify-center px-6"
              style={{ backgroundColor: displaySettings.backgroundColor }}
            >
              <div className="text-sm font-semibold mb-4" style={{ color: accent }}>
                {timerState.phase === 'indicator' ? timerState.indicatorLabel : (timerState.label || displaySettings.label)}
              </div>
              <div
                className="leading-none max-w-full"
                style={{
                  color: intensity === 'critical' ? '#EF4444' : displaySettings.textColor,
                  fontFamily: displaySettings.timerFontFamily,
                  fontSize: displaySettings.timerFontSizeMode === 'manual' ? `${displaySettings.timerFontSize}px` : 'clamp(4rem, 12vw, 10rem)',
                  fontWeight: displaySettings.timerBold ? 700 : 400,
                  fontStyle: displaySettings.timerItalic ? 'italic' : 'normal',
                  textDecoration: displaySettings.timerUnderline ? 'underline' : 'none',
                  textAlign: displaySettings.timerAlign,
                  fontVariantNumeric: 'tabular-nums',
                  fontFeatureSettings: '"tnum" 1, "lnum" 1',
                  whiteSpace: 'nowrap',
                }}
              >
                {displayValue}
              </div>
              {timerState.sets?.length > 1 && (
                <div className="mt-4 text-xs text-white/70">
                  {timerState.activeSetIndex + 1} of {timerState.sets.length}
                </div>
              )}
              {displaySettings.showProgress && (
                <div className="mt-8 w-full h-2 rounded-full bg-white/15 overflow-hidden">
                  <div className="h-full rounded-full transition-all" style={{ width: `${progress * 100}%`, backgroundColor: accent }} />
                </div>
              )}
            </div>

            <div
              className="mt-3 w-full rounded-lg border px-6 py-4 flex items-center justify-between"
              style={{
                backgroundColor: displaySettings.backgroundColor,
                borderColor: 'rgba(255,255,255,0.14)',
              }}
            >
              <span className="text-xs font-semibold uppercase tracking-wide text-white/55">Global Time</span>
              <span
                className="font-mono text-2xl font-semibold text-white/80"
                style={{
                  fontVariantNumeric: 'tabular-nums',
                  fontFeatureSettings: '"tnum" 1, "lnum" 1',
                }}
              >
                {globalClockParts.time}
                {globalClockParts.period && <span style={PERIOD_STYLE}>{globalClockParts.period}</span>}
              </span>
            </div>

            <div className="mt-4 grid grid-cols-5 gap-2">
              {!timerState.running ? (
                <Button onClick={handleStart} disabled={active || (mode === 'target' && !targetTime)} className="col-span-2 bg-green-600 hover:bg-green-700 text-white">
                  <Play className="w-4 h-4 mr-2" />
                  Start
                </Button>
              ) : timerState.paused ? (
                <Button onClick={actions.resumeTimer} className="col-span-2 bg-green-600 hover:bg-green-700 text-white">
                  <Play className="w-4 h-4 mr-2" />
                  Resume
                </Button>
              ) : (
                <Button onClick={actions.pauseTimer} className="col-span-2 bg-amber-600 hover:bg-amber-700 text-white">
                  <Pause className="w-4 h-4 mr-2" />
                  Pause
                </Button>
              )}
              <Button variant="outline" className={outlineButtonClass} onClick={() => actions.addTime(-60000)} disabled={!active || timerState.mode === 'countup'}>-1m</Button>
              <Button variant="outline" className={outlineButtonClass} onClick={() => actions.addTime(60000)} disabled={!active || timerState.mode === 'countup'}>+1m</Button>
              <Button variant="outline" className={outlineButtonClass} onClick={() => actions.addTime(300000)} disabled={!active || timerState.mode === 'countup'}>+5m</Button>
              <Button variant="outline" className={outlineButtonClass} onClick={actions.skipToNextSet} disabled={!active || !timerState.sets?.[timerState.activeSetIndex + 1]}>
                <SkipForward className="w-4 h-4 mr-2" />
                Skip
              </Button>
              <Button variant="destructive" onClick={actions.stopTimer} disabled={!active} className="col-span-4">
                <Square className="w-4 h-4 mr-2" />
                Stop
              </Button>
            </div>

            <div className={`mt-4 rounded-lg border p-3 space-y-3 ${darkMode ? 'border-gray-700 bg-gray-900/40' : 'border-gray-200 bg-gray-50'}`}>
              <div className="space-y-2">
                <label className="text-xs font-medium">Timer Font</label>
                <FontSelect
                  value={displaySettings.timerFontFamily}
                  onChange={(value) => applyTimerDisplaySettings({ timerFontFamily: value })}
                  darkMode={darkMode}
                  containerClassName="relative w-full"
                  triggerClassName={`w-full ${inputClass}`}
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-2">
                  <label className="text-xs font-medium">Size</label>
                  <Select
                    value={displaySettings.timerFontSizeMode}
                    onValueChange={(value) => applyTimerDisplaySettings({ timerFontSizeMode: value })}
                  >
                    <SelectTrigger className={inputClass}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="auto">Auto-fit width</SelectItem>
                      <SelectItem value="manual">Manual</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-medium">Manual px</label>
                  <Input
                    type="number"
                    min="48"
                    max="420"
                    disabled={displaySettings.timerFontSizeMode !== 'manual'}
                    value={displaySettings.timerFontSize}
                    onChange={(event) => applyTimerDisplaySettings({ timerFontSize: event.target.value })}
                    className={inputClass}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-2">
                  <label className="text-xs font-medium">Alignment</label>
                  <Select
                    value={displaySettings.timerAlign}
                    onValueChange={(value) => applyTimerDisplaySettings({ timerAlign: value })}
                  >
                    <SelectTrigger className={inputClass}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="left">Left</SelectItem>
                      <SelectItem value="center">Center</SelectItem>
                      <SelectItem value="right">Right</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-medium">Other items scale</label>
                  <Input
                    type="number"
                    min="0.08"
                    max="2"
                    step="0.01"
                    value={displaySettings.otherItemsScale}
                    onChange={(event) => applyTimerDisplaySettings({ otherItemsScale: event.target.value })}
                    className={inputClass}
                  />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <button type="button" onClick={() => applyTimerDisplaySettings({ timerBold: !displaySettings.timerBold })} className={`h-9 rounded text-sm font-bold transition-colors ${displaySettings.timerBold ? 'bg-blue-600 text-white' : subtleButtonClass}`}>B</button>
                <button type="button" onClick={() => applyTimerDisplaySettings({ timerItalic: !displaySettings.timerItalic })} className={`h-9 rounded text-sm italic transition-colors ${displaySettings.timerItalic ? 'bg-blue-600 text-white' : subtleButtonClass}`}>I</button>
                <button type="button" onClick={() => applyTimerDisplaySettings({ timerUnderline: !displaySettings.timerUnderline })} className={`h-9 rounded text-sm underline transition-colors ${displaySettings.timerUnderline ? 'bg-blue-600 text-white' : subtleButtonClass}`}>U</button>
              </div>
            </div>
          </section>

          <section className={`rounded-lg border p-4 space-y-4 ${panelClass}`}>
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold">Timer Sets</h2>
                <p className={`text-xs ${mutedText}`}>Run multiple timers in sequence.</p>
              </div>
              <Switch checked={useSets} onCheckedChange={setUseSets} disabled={active} {...getSwitchProps(active)} />
            </div>

            {useSets && (
              <div className="space-y-2">
                {sets.map((set, index) => (
                  <div key={set.id} className={`rounded-md border p-2 space-y-2 ${darkMode ? 'border-gray-700 bg-gray-900/40' : 'border-gray-200 bg-gray-50'}`}>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs w-5 ${mutedText}`}>{index + 1}</span>
                      <Input disabled={active} value={set.label} onChange={(event) => updateSet(set.id, { label: event.target.value })} className={inputClass} />
                      <button disabled={active || sets.length <= 1} onClick={() => removeSet(set.id)} className={`p-2 rounded ${darkMode ? 'hover:bg-gray-700 disabled:opacity-40' : 'hover:bg-gray-200 disabled:opacity-40'}`}>
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="flex items-center gap-2 pl-7">
                      <Input
                        type="number"
                        min="0"
                        step="0.5"
                        disabled={active}
                        value={msToMinutesInput(set.durationMs)}
                        onChange={(event) => updateSet(set.id, { durationMs: minutesToMs(event.target.value) })}
                        className={inputClass}
                      />
                      <span className={`text-xs ${mutedText}`}>minutes</span>
                    </div>
                  </div>
                ))}
                <Button variant="outline" size="sm" className={outlineButtonClass} onClick={addSet} disabled={active}>
                  <Plus className="w-4 h-4 mr-2" />
                  Add Timer
                </Button>
              </div>
            )}

            <div className="space-y-3 pt-2 border-t border-gray-700/30">
              <div className="flex items-center justify-between">
                <span className="text-sm">Auto-start next</span>
                <Switch checked={autoStartNext} onCheckedChange={setAutoStartNext} disabled={active || !useSets} {...getSwitchProps(active || !useSets)} />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">Indicator period</span>
                <Switch checked={indicatorEnabled} onCheckedChange={setIndicatorEnabled} disabled={active || !useSets} {...getSwitchProps(active || !useSets)} />
              </div>
              <div className="grid grid-cols-[1fr_90px] gap-2">
                <Input disabled={active || !useSets || !indicatorEnabled} value={indicatorLabel} onChange={(event) => setIndicatorLabel(event.target.value)} className={inputClass} />
                <Input type="number" min="0" disabled={active || !useSets || !indicatorEnabled} value={indicatorSeconds} onChange={(event) => setIndicatorSeconds(event.target.value)} className={inputClass} />
              </div>
            </div>

            <div className="space-y-3 pt-2 border-t border-gray-700/30">
              <h2 className="text-sm font-semibold">Display</h2>
              <div className="space-y-2">
                <label className="text-xs font-medium">Format</label>
                <Select
                  value={displaySettings.format}
                  onValueChange={(value) => applyTimerDisplaySettings({ format: value })}
                >
                  <SelectTrigger className={inputClass}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">M:SS / H:MM:SS</SelectItem>
                    <SelectItem value="mmss">MM:SS</SelectItem>
                    <SelectItem value="hhmmss">H:MM:SS</SelectItem>
                    <SelectItem value="minutes">Minutes</SelectItem>
                    <SelectItem value="verbose">Verbose</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <ColorPicker value={displaySettings.textColor} onChange={(value) => applyTimerDisplaySettings({ textColor: value })} darkMode={darkMode} />
                <ColorPicker value={displaySettings.accentColor} onChange={(value) => applyTimerDisplaySettings({ accentColor: value })} darkMode={darkMode} />
                <ColorPicker value={displaySettings.backgroundColor} onChange={(value) => applyTimerDisplaySettings({ backgroundColor: value })} darkMode={darkMode} />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">Progress bar</span>
                <Switch checked={displaySettings.showProgress} onCheckedChange={(checked) => applyTimerDisplaySettings({ showProgress: checked })} {...getSwitchProps(false)} />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">Show global time on display</span>
                <Switch checked={displaySettings.showGlobalClock} onCheckedChange={(checked) => applyTimerDisplaySettings({ showGlobalClock: checked })} {...getSwitchProps(false)} />
              </div>
              <div className={`rounded-md border p-3 space-y-3 ${darkMode ? 'border-gray-700 bg-gray-900/40' : 'border-gray-200 bg-gray-50'}`}>
                <div className="text-xs font-medium">Global Time Format</div>
                <div className="flex items-center justify-between">
                  <span className="text-sm">12-hour clock</span>
                  <Switch checked={displaySettings.clockHour12} onCheckedChange={(checked) => applyTimerDisplaySettings({ clockHour12: checked })} {...getSwitchProps(false)} />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm">Show seconds</span>
                  <Switch checked={displaySettings.clockShowSeconds} onCheckedChange={(checked) => applyTimerDisplaySettings({ clockShowSeconds: checked })} {...getSwitchProps(false)} />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm">Show AM/PM</span>
                  <Switch
                    checked={displaySettings.clockShowPeriod}
                    onCheckedChange={(checked) => applyTimerDisplaySettings({ clockShowPeriod: checked })}
                    disabled={!displaySettings.clockHour12}
                    {...getSwitchProps(!displaySettings.clockHour12)}
                  />
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};

export default TimerControlModule;
