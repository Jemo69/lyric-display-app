import path from 'path';
import { fork } from 'child_process';
import { resolveProductionPath } from './paths.js';
import { app } from 'electron';
import createMainLogger from './logger.js';

const log = createMainLogger('Backend');

let backendProcess = null;

async function waitForBackendHealth(maxAttempts = 60, intervalMs = 500) {
  let attempts = 0;

  while (attempts < maxAttempts) {
    try {
      const response = await fetch('http://127.0.0.1:4000/api/health/ready', {
        method: 'GET',
        timeout: 2000,
      });

      if (response.ok) {
        const data = await response.json();
        if (data.status === 'ready' && data.serverListening) {
          log.info(`Backend health check passed after ${attempts + 1} attempts`);
          return true;
        }
      }
    } catch (error) {
      log.info(`Health check attempt ${attempts + 1}/${maxAttempts}: ${error.message}`);
    }

    attempts++;
    const jitter = Math.random() * 200;
    await new Promise(resolve => setTimeout(resolve, intervalMs + jitter));
  }

  log.warn(`Backend health check failed after ${maxAttempts} attempts`);
  return false;
}

export function startBackend() {
  return new Promise((resolve, reject) => {
    const serverPath = resolveProductionPath('server', 'index.js');
    const backendDataDir = path.join(app.getPath('userData'), 'backend');

    backendProcess = fork(serverPath, app.isPackaged ? ['--serve-static'] : [], {
      cwd: path.dirname(serverPath),
      env: {
        ...process.env,
        NODE_ENV: app.isPackaged ? 'production' : 'development',
        LYRICDISPLAY_DATA_DIR: backendDataDir
      },
      stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
    });

    let isResolved = false;

    // Resolve as soon as the backend proves healthy via the /api/health/ready
    // endpoint. Safe to call repeatedly; only the first successful call resolves.
    const tryResolve = async () => {
      if (isResolved) return;
      const isHealthy = await waitForBackendHealth(5, 200);
      if (isHealthy) {
        log.info('Backend startup completed successfully');
        isResolved = true;
        clearTimeout(fatalTimer);
        clearInterval(pollTimer);
        resolve();
      }
    };

    backendProcess.on('error', (err) => {
      log.error('Backend process error:', err);
      if (!isResolved) {
        isResolved = true;
        clearTimeout(fatalTimer);
        clearInterval(pollTimer);
        reject(err);
      }
    });

    backendProcess.on('exit', (code, signal) => {
      log.info(`Backend process exited with code ${code}, signal: ${signal}`);
      if (!isResolved && code !== 0) {
        isResolved = true;
        clearTimeout(fatalTimer);
        clearInterval(pollTimer);
        reject(new Error(`Backend process exited with code ${code}`));
      }
    });

    backendProcess.on('message', async (msg) => {
      if (msg?.status === 'error' && msg?.error === 'EADDRINUSE' && !isResolved) {
        log.error(`Backend failed: Port ${msg.port} is already in use`);
        isResolved = true;
        clearTimeout(fatalTimer);
        clearInterval(pollTimer);
        reject(new Error('PORT_IN_USE'));
        return;
      }

      if (msg?.status === 'ready' && !isResolved) {
        log.info('Backend reported ready, verifying health...');
        await tryResolve();
      }
    });

    // Continuous health polling. This tolerates backends that take a long time
    // to bind on first run (e.g. antivirus scanning native modules, slow secret
    // store reads) instead of failing after a short fixed window.
    const pollTimer = setInterval(async () => {
      if (isResolved) {
        clearInterval(pollTimer);
        return;
      }
      await tryResolve();
    }, 1000);

    // Only give up after a generous budget. Most slow starts recover well
    // before this, and the frontend socket will reconnect once the backend is up.
    const fatalTimer = setTimeout(() => {
      if (!isResolved) {
        log.error('Backend failed to become ready within timeout');
        isResolved = true;
        clearInterval(pollTimer);
        reject(new Error('Backend startup timeout'));
      }
    }, 180000);
  });
}

export function stopBackend() {
  if (backendProcess) {
    log.info('Stopping backend process...');
    try {
      if (process.platform === 'win32') {
        log.info('Using SIGKILL for Windows');
        backendProcess.kill('SIGKILL');
      } else {
        backendProcess.kill('SIGTERM');

        setTimeout(() => {
          if (backendProcess && !backendProcess.killed) {
            log.info('Force killing backend process');
            backendProcess.kill('SIGKILL');
          }
        }, 2000);
      }
    } catch (error) {
      log.error('Error stopping backend:', error);
      try {
        if (backendProcess && !backendProcess.killed) {
          backendProcess.kill('SIGKILL');
        }
      } catch (killError) {
        log.error('Error force killing backend:', killError);
      }
    }
    backendProcess = null;
  }
}