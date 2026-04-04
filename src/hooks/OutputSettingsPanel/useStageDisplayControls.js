import { useCallback, useEffect, useState } from 'react';
import { useControlSocket } from '../../context/ControlSocketProvider';
import useToast from '../useToast';
import { sanitizeIntegerInput } from '../../utils/numberInput';

const STORAGE_KEYS = {
  customUpcomingSongName: 'stage_custom_upcoming_song_name',
  customMessages: 'stage_custom_messages',
  timerDuration: 'stage_timer_duration',
  timerEndTime: 'stage_timer_end_time',
  timerRemainingMs: 'stage_timer_remaining_ms',
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
  const [pausedRemainingMs, setPausedRemainingMs] = useState(null);
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
    const formatRemaining = (remainingMs) => {
      const safeRemaining = Math.max(0, remainingMs);
      const minutes = Math.floor(safeRemaining / 60000);
      const seconds = Math.floor((safeRemaining % 60000) / 1000);
      return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    };

    const storedDuration = sessionStorage.getItem(STORAGE_KEYS.timerDuration);
    const storedEndTime = sessionStorage.getItem(STORAGE_KEYS.timerEndTime);
    const storedRemainingMs = sessionStorage.getItem(STORAGE_KEYS.timerRemainingMs);
    const storedRunning = sessionStorage.getItem(STORAGE_KEYS.timerRunning);
    const storedPaused = sessionStorage.getItem(STORAGE_KEYS.timerPaused);

    if (storedDuration) {
      setTimerDuration(sanitizeIntegerInput(storedDuration, 0, { min: 0, max: 180 }));
    }

    if (storedRunning === 'true') {
      const isPaused = storedPaused === 'true';
      const now = Date.now();

      if (isPaused) {
        let remainingMs = Number.parseInt(storedRemainingMs || '', 10);

        if (!Number.isFinite(remainingMs) || remainingMs <= 0) {
          const parsedEndTime = Number.parseInt(storedEndTime || '', 10);
          if (Number.isFinite(parsedEndTime) && parsedEndTime > now) {
            remainingMs = parsedEndTime - now;
          }
        }

        if (Number.isFinite(remainingMs) && remainingMs > 0) {
          setTimerRunning(true);
          setTimerPaused(true);
          setTimerEndTime(null);
          setPausedRemainingMs(remainingMs);
          setTimeRemaining(formatRemaining(remainingMs));
          sessionStorage.setItem(STORAGE_KEYS.timerRemainingMs, Math.floor(remainingMs).toString());
          sessionStorage.removeItem(STORAGE_KEYS.timerEndTime);
        } else {
          sessionStorage.removeItem(STORAGE_KEYS.timerEndTime);
          sessionStorage.removeItem(STORAGE_KEYS.timerRemainingMs);
          sessionStorage.removeItem(STORAGE_KEYS.timerRunning);
          sessionStorage.removeItem(STORAGE_KEYS.timerPaused);
        }
      } else if (storedEndTime) {
        const endTime = Number.parseInt(storedEndTime, 10);
        if (Number.isFinite(endTime) && endTime > now) {
          setTimerEndTime(endTime);
          setTimerRunning(true);
          setTimerPaused(false);
          setPausedRemainingMs(null);
        } else {
          sessionStorage.removeItem(STORAGE_KEYS.timerEndTime);
          sessionStorage.removeItem(STORAGE_KEYS.timerRemainingMs);
          sessionStorage.removeItem(STORAGE_KEYS.timerRunning);
          sessionStorage.removeItem(STORAGE_KEYS.timerPaused);
        }
      } else {
        sessionStorage.removeItem(STORAGE_KEYS.timerEndTime);
        sessionStorage.removeItem(STORAGE_KEYS.timerRemainingMs);
        sessionStorage.removeItem(STORAGE_KEYS.timerRunning);
        sessionStorage.removeItem(STORAGE_KEYS.timerPaused);
      }
    } else {
      sessionStorage.removeItem(STORAGE_KEYS.timerRemainingMs);
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

  useEffect(() => {
    const formatRemaining = (remainingMs) => {
      const safeRemaining = Math.max(0, remainingMs);
      const minutes = Math.floor(safeRemaining / 60000);
      const seconds = Math.floor((safeRemaining % 60000) / 1000);
      return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    };

    if (!timerRunning) return;

    if (timerPaused) {
      if (Number.isFinite(pausedRemainingMs) && pausedRemainingMs > 0) {
        setTimeRemaining(formatRemaining(pausedRemainingMs));
      }
      return;
    }

    if (!timerEndTime) return;

    const updateTimer = () => {
      const now = Date.now();
      const remaining = timerEndTime - now;

      if (remaining <= 0) {
        setTimerRunning(false);
        setTimerPaused(false);
        setTimerEndTime(null);
        setPausedRemainingMs(null);
        setTimeRemaining('0:00');
        sessionStorage.removeItem(STORAGE_KEYS.timerEndTime);
        sessionStorage.removeItem(STORAGE_KEYS.timerRemainingMs);
        sessionStorage.removeItem(STORAGE_KEYS.timerRunning);
        sessionStorage.removeItem(STORAGE_KEYS.timerPaused);
        if (emitStageTimerUpdate) {
          emitStageTimerUpdate({ running: false, paused: false, endTime: null, remaining: null });
        }
        return;
      }

      setTimeRemaining(formatRemaining(remaining));
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [emitStageTimerUpdate, pausedRemainingMs, timerEndTime, timerPaused, timerRunning]);

  const handleStartTimer = () => {
    if (timerDuration <= 0) return;

    const endTime = Date.now() + (timerDuration * 60000);
    setTimerEndTime(endTime);
    setTimerRunning(true);
    setTimerPaused(false);
    setPausedRemainingMs(null);
    setTimeRemaining(`${timerDuration}:00`);

    sessionStorage.setItem(STORAGE_KEYS.timerEndTime, endTime.toString());
    sessionStorage.removeItem(STORAGE_KEYS.timerRemainingMs);
    sessionStorage.setItem(STORAGE_KEYS.timerRunning, 'true');
    sessionStorage.setItem(STORAGE_KEYS.timerPaused, 'false');

    if (emitStageTimerUpdate) {
      emitStageTimerUpdate({ running: true, paused: false, endTime, remaining: null });
    }
  };

  const handlePauseTimer = () => {
    if (!timerRunning || timerPaused) return;
    if (!timerEndTime) return;

    const remainingMs = Math.max(0, timerEndTime - Date.now());
    const minutes = Math.floor(remainingMs / 60000);
    const seconds = Math.floor((remainingMs % 60000) / 1000);
    const formattedRemaining = `${minutes}:${seconds.toString().padStart(2, '0')}`;

    setTimerPaused(true);
    setTimerEndTime(null);
    setPausedRemainingMs(remainingMs);
    setTimeRemaining(formattedRemaining);

    sessionStorage.removeItem(STORAGE_KEYS.timerEndTime);
    sessionStorage.setItem(STORAGE_KEYS.timerRemainingMs, Math.floor(remainingMs).toString());
    sessionStorage.setItem(STORAGE_KEYS.timerPaused, 'true');

    if (emitStageTimerUpdate) {
      emitStageTimerUpdate({ running: true, paused: true, endTime: null, remaining: formattedRemaining });
    }
  };

  const handleResumeTimer = () => {
    if (!timerRunning || !timerPaused) return;

    const remainingMs = Number.isFinite(pausedRemainingMs) ? pausedRemainingMs : 0;
    if (remainingMs <= 0) {
      handleStopTimer();
      return;
    }

    const resumedEndTime = Date.now() + remainingMs;
    setTimerPaused(false);
    setPausedRemainingMs(null);
    setTimerEndTime(resumedEndTime);

    sessionStorage.setItem(STORAGE_KEYS.timerEndTime, resumedEndTime.toString());
    sessionStorage.removeItem(STORAGE_KEYS.timerRemainingMs);
    sessionStorage.setItem(STORAGE_KEYS.timerPaused, 'false');

    if (emitStageTimerUpdate) {
      emitStageTimerUpdate({ running: true, paused: false, endTime: resumedEndTime, remaining: null });
    }
  };

  const handleStopTimer = () => {
    setTimerRunning(false);
    setTimerPaused(false);
    setTimerEndTime(null);
    setPausedRemainingMs(null);
    setTimeRemaining(null);

    sessionStorage.removeItem(STORAGE_KEYS.timerEndTime);
    sessionStorage.removeItem(STORAGE_KEYS.timerRemainingMs);
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
      pausedRemainingMs,
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