const LOG_LEVELS = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 };

const getLogLevel = () => {
  const envLevel = typeof process !== 'undefined' && process?.env?.LOG_LEVEL
    ? process.env.LOG_LEVEL
    : (typeof import.meta !== 'undefined' && import.meta?.env?.VITE_LOG_LEVEL ? import.meta.env.VITE_LOG_LEVEL : '');
  return envLevel ? (LOG_LEVELS[String(envLevel).toUpperCase()] ?? 1) : 1;
};

const currentLevel = getLogLevel();

const formatTimestamp = () => new Date().toISOString();

const createSharedLogger = (category) => ({
  debug: (...args) => {
    if (currentLevel <= 0) {
      console.debug(`[${formatTimestamp()}] [DEBUG] [${category}]`, ...args);
    }
  },
  info: (...args) => {
    if (currentLevel <= 1) {
      console.log(`[${formatTimestamp()}] [INFO] [${category}]`, ...args);
    }
  },
  warn: (...args) => {
    if (currentLevel <= 2) {
      console.warn(`[${formatTimestamp()}] [WARN] [${category}]`, ...args);
    }
  },
  error: (...args) => {
    console.error(`[${formatTimestamp()}] [ERROR] [${category}]`, ...args);
  },
});

export default createSharedLogger;
