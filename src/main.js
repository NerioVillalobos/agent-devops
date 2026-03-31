#!/usr/bin/env node

const { loadConfig } = require("./config");
const { runCli } = require("./cli/router");
const { createLogger } = require("./utils/logger");

async function main() {
  const config = loadConfig();
  const logger = createLogger(config.logLevel);

  try {
    await runCli(process.argv.slice(2), { config, logger });
  } catch (error) {
    logger.error(error.message);
    if (config.debug) {
      logger.error(error.stack || "No stack trace available");
    }
    process.exitCode = 1;
  }
}

main();
