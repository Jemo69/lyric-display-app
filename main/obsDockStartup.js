import createMainLogger from './logger.js';

const log = createMainLogger('ObsDockStartup');

export const OBS_DOCK_ARG = '--obs-dock';
export const OBS_DOCK_ROUTE = '/obs-dock';
export const OBS_DOCK_WINDOW_WIDTH = 420;
export const OBS_DOCK_WINDOW_HEIGHT = 720;

export function isObsDockMode(argv = process.argv) {
  const args = Array.isArray(argv) ? argv : [];
  return args.includes(OBS_DOCK_ARG);
}

export function resolveStartupRoute(argv = process.argv) {
  return isObsDockMode(argv) ? OBS_DOCK_ROUTE : '/';
}

export function getObsDockWindowOptions() {
  return {
    width: OBS_DOCK_WINDOW_WIDTH,
    height: OBS_DOCK_WINDOW_HEIGHT,
    minWidth: 320,
    minHeight: 480,
  };
}

export function logObsDockMode() {
  log.info(`Headless OBS dock mode enabled (${OBS_DOCK_ARG}); loading ${OBS_DOCK_ROUTE} without full menu chrome.`);
}
