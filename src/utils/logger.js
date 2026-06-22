const isVerbose = Boolean(import.meta.env.DEV || import.meta.env.MODE === 'development' || import.meta.env.VITE_ENABLE_VERBOSE_LOGS === 'true');

const formatTimestamp = () => new Date().toISOString();

const formatArgs = (category, level, args) => {
  const prefix = `[${formatTimestamp()}] [${level}] [${category}]`;
  return [prefix, ...args];
};

export const createLogger = (category) => ({
  debug: (...args) => {
    if (isVerbose) {
      console.debug(...formatArgs(category, 'DEBUG', args));
    }
  },
  info: (...args) => {
    if (isVerbose) {
      console.info(...formatArgs(category, 'INFO', args));
    }
  },
  warn: (...args) => {
    console.warn(...formatArgs(category, 'WARN', args));
  },
  error: (...args) => {
    console.error(...formatArgs(category, 'ERROR', args));
  },
});

export const logDebug = (...args) => {
  if (isVerbose) {
    console.debug(`[${formatTimestamp()}] [DEBUG]`, ...args);
  }
};

export const logInfo = (...args) => {
  if (isVerbose) {
    console.info(`[${formatTimestamp()}] [INFO]`, ...args);
  }
};

export const logWarn = (...args) => {
  console.warn(`[${formatTimestamp()}] [WARN]`, ...args);
};

export const logError = (...args) => {
  console.error(`[${formatTimestamp()}] [ERROR]`, ...args);
};
