import { state } from '../state.js';

export function registerStageHandlers({ io, socket, hasPermission, clientType }) {
  socket.on('stageTimerUpdate', (timerData) => {
    if (!hasPermission(socket, 'output:control')) {
      socket.emit('permissionError', 'Insufficient permissions to control stage timer');
      return;
    }

    const nextStageTimerState = {
      ...state.currentStageTimerState,
      ...timerData,
      display: {
        ...(state.currentStageTimerState?.display || {}),
        ...(timerData?.display || {}),
      },
    };
    if (typeof timerData.status !== 'string') {
      nextStageTimerState.status = nextStageTimerState.running
        ? (nextStageTimerState.paused ? 'paused' : 'running')
        : (nextStageTimerState.finished ? 'finished' : 'idle');
    }
    state.currentStageTimerState = nextStageTimerState;
    console.log(`Stage timer updated by ${clientType} client:`, state.currentStageTimerState);
    io.emit('stageTimerUpdate', state.currentStageTimerState);
  });

  socket.on('stageMessagesUpdate', (messages) => {
    if (!hasPermission(socket, 'output:control')) {
      socket.emit('permissionError', 'Insufficient permissions to update stage messages');
      return;
    }

    state.currentStageMessages = Array.isArray(messages) ? [...messages] : [];
    console.log(`Stage messages updated by ${clientType} client: ${messages?.length || 0} messages`);
    io.emit('stageMessagesUpdate', messages);
  });
}

