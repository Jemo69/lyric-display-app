import { useCallback, useEffect, useRef, useState } from 'react';
import { createLogger } from '../../utils/logger';
import { computeCountdownRemaining, formatCountdown, msToNextBoundary } from '../../utils/renderClock';
import { useControlSocket } from '../../context/ControlSocketProvider';
import useToast from '../useToast';
import { sanitizeIntegerInput } from '../../utils/numberInput';

const log = createLogger('StageDisplay');

const STORAGE_KEYS = {
  customUpcomingSongName: 'stage_custom_upcoming_song_name',
  customMessages: 'stage_custom_messages',
  timerDuration: 'stage_timer_duration',
  timerEndTime: 'stage_timer_end_time',
  timerRunning: 'stage_timer_running',
  timerPaused: 'stage_timer_paused'
};

const useStageDisplayControls = ({ settings, applySettings, update, showModal }) => {
  const { emitStageTimerUpdate, emitStageMessagesUpdate } = useControlSocket();
  const { showToast } = useToast();

  const [customMessages, setCustomMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [timerDuration, setTimerDuration] = useState(0);
  const [timerRunning, setTimerRunning] = useState(false);
  const [timerPaused, setTimerPaused] = useState(false);
  const [timerEndTime, setTimerEndTime] = useState(null);
  const [timeRemaining, setTimeRemaining] = useState(null);
  const [customUpcomingSongName, setCustomUpcomingSongName] = useState('');
  const [upcomingSongAdvancedExpanded, setUpcomingSongAdvancedExpanded] = useState(false);
  const [hasUnsavedUpcomingSongName, setHasUnsavedUpcomingSongName] = useState(false);
  const [timerAdvancedExpanded, setTimerAdvancedExpanded] = useState(false);
  const [customMessagesAdvancedExpanded, setCustomMessagesAdvancedExpanded] = useState(false);

  useEffect(() => {
    const stored = sessionStorage.getItem(STORAGE_KEYS.customUpcomingSongName);
    if (stored) {
      setCustomUpcomingSongName(stored);
    }
  }, []);

  useEffect(() => {
    if (settings.upcomingSongMode === 'custom') {
      setUpcomingSongAdvancedExpanded(true);
    }
  }, [settings.upcomingSongMode]);

  const handleCustomUpcomingSongNameChange = (value) => {
    setCustomUpcomingSongName(value);
    setHasUnsavedUpcomingSongName(true);
  };

  const handleConfirmUpcomingSongName = () => {
    sessionStorage.setItem(STORAGE_KEYS.customUpcomingSongName, customUpcomingSongName);
    setHasUnsavedUpcomingSongName(false);

    if (emitStageTimerUpdate) {
      const payload = {
        type: 'upcomingSongUpdate',
        customName: customUpcomingSongName,
        mode: settings.upcomingSongMode,
      };
      if (typeof emitStageTimerUpdate === 'function') {
        emitStageTimerUpdate(payload);
      }
    }

    window.dispatchEvent(new CustomEvent('stage-upcoming-song-update', {
      detail: { customName: customUpcomingSongName }
    }));

    showToast({
      title: 'Upcoming Song Updated',
      message: 'Custom upcoming song name has been set',
      variant: 'success',
    });
  };

  const handleFullScreenToggle = (type, checked) => {
    if (checked) {
      const updates = {
        upcomingSongFullScreen: type === 'upcomingSong',
        timerFullScreen: type === 'timer',
        customMessagesFullScreen: type === 'customMessages',
      };
      applySettings(updates);
      return;
    }
    update(`${type}FullScreen`, false);
  };

  useEffect(() => {
    const stored = sessionStorage.getItem(STORAGE_KEYS.customMessages);
    if (stored) {
      try {
        const messages = JSON.parse(stored);
        setCustomMessages(messages);
        if (emitStageMessagesUpdate) {
          emitStageMessagesUpdate(messages);
        }
      } catch {
        setCustomMessages([]);
      }
    }
  }, [emitStageMessagesUpdate]);

  useEffect(() => {
    const storedDuration = sessionStorage.getItem(STORAGE_KEYS.timerDuration);
    const storedEndTime = sessionStorage.getItem(STORAGE_KEYS.timerEndTime);
    const storedRunning = sessionStorage.getItem(STORAGE_KEYS.timerRunning);
    const storedPaused = sessionStorage.getItem(STORAGE_KEYS.timerPaused);

    if (storedDuration) {
      setTimerDuration(sanitizeIntegerInput(storedDuration, 0, { min: 0, max: 180 }));
    }

    if (storedRunning === 'true' && storedEndTime) {
      const endTime = parseInt(storedEndTime, 10);
      const now = Date.now();

      if (endTime > now) {
        setTimerEndTime(endTime);
        setTimerRunning(true);
        setTimerPaused(storedPaused === 'true');
      } else {
        sessionStorage.removeItem(STORAGE_KEYS.timerEndTime);
        sessionStorage.removeItem(STORAGE_KEYS.timerRunning);
        sessionStorage.removeItem(STORAGE_KEYS.timerPaused);
      }
    }
  }, []);

  const saveMessages = useCallback((messages) => {
    setCustomMessages(messages);
    sessionStorage.setItem(STORAGE_KEYS.customMessages, JSON.stringify(messages));
    if (emitStageMessagesUpdate) {
      emitStageMessagesUpdate(messages);
    }
  }, [emitStageMessagesUpdate]);

  const handleAddMessage = () => {
    if (!newMessage.trim()) return;
    const updatedMessages = [...customMessages, { id: `msg_${Date.now()}`, text: newMessage.trim() }];
    saveMessages(updatedMessages);
    setNewMessage('');

    showToast({
      title: 'Message Added',
      message: 'Custom message has been added to stage display',
      variant: 'success',
    });
  };

  const handleRemoveMessage = (id) => {
    const updatedMessages = customMessages.filter(msg => msg.id !== id);
    saveMessages(updatedMessages);

    showToast({
      title: 'Message Removed',
      message: 'Custom message has been removed from stage display',
      variant: 'success',
    });
  };

  // Socket emitter ref (missing-feature #05 timer fix): the countdown chain
  // below must not churn when the context re-creates the emitter identity,
  // so the effect depends on timer primitives only and reads this ref.
  const emitStageTimerUpdateRef = useRef(emitStageTimerUpdate);
  useEffect(() => {
    emitStageTimerUpdateRef.current = emitStageTimerUpdate;
  }, [emitStageTimerUpdate]);

  useEffect(() => {
    if (!timerRunning || !timerEndTime || timerPaused) return;

    let timer = null;
    let cancelled = false;
    const updateTimer = () => {
      if (cancelled) return;
      const remaining = computeCountdownRemaining(timerEndTime, Date.now());

      if (remaining === null || remaining <= 0) {
        setTimerRunning(false);
        setTimerPaused(false);
        setTimerEndTime(null);
        setTimeRemaining((prev) => (prev === '0:00' ? prev : '0:00'));
        sessionStorage.removeItem(STORAGE_KEYS.timerEndTime);
        sessionStorage.removeItem(STORAGE_KEYS.timerRunning);
        sessionStorage.removeItem(STORAGE_KEYS.timerPaused);
        if (emitStageTimerUpdateRef.current) {
          emitStageTimerUpdateRef.current({ running: false, paused: false, endTime: null, remaining: null });
        }
        return;
      }

      const formattedTime = formatCountdown(remaining);
      setTimeRemaining((prev) => (prev === formattedTime ? prev : formattedTime));
      // Boundary-aligned chain (no cumulative drift); guarded setState above
      // makes idle ticks free instead of compounding work per second.
      timer = setTimeout(updateTimer, msToNextBoundary(Date.now(), 1000));
      if (timer && typeof timer.unref === 'function') timer.unref();
    };

    updateTimer();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [timerEndTime, timerPaused, timerRunning]);

  const handleStartTimer = () => {
    if (timerDuration <= 0) return;
    log.info('Stage timer started:', timerDuration, 'minutes');

    const endTime = Date.now() + (timerDuration * 60000);
    setTimerEndTime(endTime);
    setTimerRunning(true);
    setTimerPaused(false);

    sessionStorage.setItem(STORAGE_KEYS.timerEndTime, endTime.toString());
    sessionStorage.setItem(STORAGE_KEYS.timerRunning, 'true');
    sessionStorage.setItem(STORAGE_KEYS.timerPaused, 'false');

    if (emitStageTimerUpdate) {
      emitStageTimerUpdate({ running: true, paused: false, endTime, remaining: null });
    }
  };

  const handlePauseTimer = () => {
    if (!timerRunning) return;
    setTimerPaused(true);
    sessionStorage.setItem(STORAGE_KEYS.timerPaused, 'true');

    if (emitStageTimerUpdate) {
      emitStageTimerUpdate({ running: true, paused: true, endTime: timerEndTime, remaining: timeRemaining });
    }
  };

  const handleResumeTimer = () => {
    if (!timerRunning) return;
    setTimerPaused(false);
    sessionStorage.setItem(STORAGE_KEYS.timerPaused, 'false');

    if (emitStageTimerUpdate) {
      emitStageTimerUpdate({ running: true, paused: false, endTime: timerEndTime, remaining: timeRemaining });
    }
  };

  const handleStopTimer = () => {
    log.debug('Stage timer stopped');
    setTimerRunning(false);
    setTimerPaused(false);
    setTimerEndTime(null);
    setTimeRemaining(null);

    sessionStorage.removeItem(STORAGE_KEYS.timerEndTime);
    sessionStorage.removeItem(STORAGE_KEYS.timerRunning);
    sessionStorage.removeItem(STORAGE_KEYS.timerPaused);

    if (emitStageTimerUpdate) {
      emitStageTimerUpdate({ running: false, paused: false, endTime: null, remaining: null });
    }
  };

  const handleTimerDurationChange = (value) => {
    const duration = sanitizeIntegerInput(value, timerDuration ?? 0, { min: 0, max: 180 });
    setTimerDuration(duration);
    sessionStorage.setItem(STORAGE_KEYS.timerDuration, duration.toString());
  };

  return {
    state: {
      customMessages,
      newMessage,
      timerDuration,
      timerRunning,
      timerPaused,
      timerEndTime,
      timeRemaining,
      customUpcomingSongName,
      upcomingSongAdvancedExpanded,
      hasUnsavedUpcomingSongName,
      timerAdvancedExpanded,
      customMessagesAdvancedExpanded
    },
    setters: {
      setNewMessage,
      setCustomUpcomingSongName,
      setUpcomingSongAdvancedExpanded,
      setTimerAdvancedExpanded,
      setCustomMessagesAdvancedExpanded
    },
    handlers: {
      handleCustomUpcomingSongNameChange,
      handleConfirmUpcomingSongName,
      handleFullScreenToggle,
      handleAddMessage,
      handleRemoveMessage,
      handleStartTimer,
      handlePauseTimer,
      handleResumeTimer,
      handleStopTimer,
      handleTimerDurationChange
    }
  };
};

export default useStageDisplayControls;