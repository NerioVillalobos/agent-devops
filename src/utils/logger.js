const LEVELS = ["debug", "info", "warn", "error"];

function createLogger(level = "info") {
  const currentIndex = LEVELS.indexOf(level) >= 0 ? LEVELS.indexOf(level) : 1;

  const logger = {};

  for (const candidate of LEVELS) {
    logger[candidate] = (message) => {
      if (LEVELS.indexOf(candidate) < currentIndex) {
        return;
      }
      const timestamp = new Date().toISOString();
      const stream = candidate === "error" ? process.stderr : process.stdout;
      stream.write(`[${timestamp}] ${candidate.toUpperCase()} ${message}\n`);
    };
  }

  return logger;
}

module.exports = {
  createLogger
};
