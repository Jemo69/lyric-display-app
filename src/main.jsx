// src/main.jsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import useLyricsStore from './context/LyricsStore';
import { installGlobalDiagnostics, diagInfo } from './utils/diagnosticsLog';

// App-wide safety net: uncaught renderer errors and unhandled rejections land
// in the diagnostics journal (with stack, without payload data) so Copy logs
// can explain a crash the operator cannot describe.
installGlobalDiagnostics('app');

const log = (level, ...args) => {
  console[level](`[${new Date().toISOString()}] [${level.toUpperCase()}] [App]`, ...args);
};

log('info', 'Initializing app');

if (typeof window !== 'undefined' && window.electronAPI) {
  log('info', 'Electron environment detected');
  try {
    useLyricsStore.getState().setIsDesktopApp(true);
  } catch (error) {
    log('warn', 'Failed to initialize desktop mode flag:', error);
  }
}

log('info', 'Creating React root');
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
