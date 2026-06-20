import { io, type Socket } from 'socket.io-client';
import { onMount, onDestroy } from 'svelte';
import { getBackendOrigin } from '$lib/utils';

let socket: Socket | null = null;

export function useSocket() {
  onMount(() => {
    if (!socket) {
      socket = io(getBackendOrigin(), {
        transports: ['websocket', 'polling'],
        autoConnect: true,
      });

      socket.on('connect', () => {
        console.log('[Socket] Connected');
      });

      socket.on('disconnect', (reason) => {
        console.log('[Socket] Disconnected:', reason);
      });

      socket.on('connect_error', (error) => {
        console.error('[Socket] Connection error:', error);
      });
    }
  });

  onDestroy(() => {
    if (socket) {
      socket.disconnect();
      socket = null;
    }
  });

  return {
    get socket() { return socket; },
    
    emit(event: string, data?: unknown) {
      socket?.emit(event, data);
    },
    
    on(event: string, callback: (...args: unknown[]) => void) {
      socket?.on(event, callback);
      return () => socket?.off(event, callback);
    },
    
    off(event: string, callback?: (...args: unknown[]) => void) {
      socket?.off(event, callback);
    }
  };
}

// Event types for type-safe emissions
export interface LyricUpdateEvent {
  lines: Array<{ id: string; text: string; type: string }>;
  activeLine: string | null;
}

export interface SetlistUpdateEvent {
  setlist: Array<{ id: string; title: string; content: string }>;
}

export interface OutputSettingsEvent {
  outputKey: string;
  settings: {
    fontFamily: string;
    fontSize: number;
    color: string;
    backgroundColor: string;
  };
}

export interface StageTimerEvent {
  seconds: number;
  running: boolean;
}

export interface StageMessageEvent {
  text: string;
}
