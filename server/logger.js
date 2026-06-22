const LOG_LEVELS = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 };
const currentLevel = process.env.LOG_LEVEL ? (LOG_LEVELS[process.env.LOG_LEVEL.toUpperCase()] ?? 1) : 1;

const formatTimestamp = () => new Date().toISOString();

const createServerLogger = (category) => ({
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

export default createServerLogger;