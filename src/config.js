const fs = require("node:fs");
const path = require("node:path");

const DEFAULTS = {
  BITBUCKET_BASE_URL: "https://api.bitbucket.org/2.0",
  GEMINI_MODEL: "gemini-2.5-flash",
  DEFAULT_MONITOR_INTERVAL_MS: "120000",
  SAFE_MODE: "true",
  ALLOW_PR_APPROVAL: "false",
  ALLOW_JIRA_TRANSITIONS: "false",
  LOG_LEVEL: "info",
  DEBUG: "false"
};

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return {};
  }

  const raw = fs.readFileSync(filePath, "utf8");
  const env = {};

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex <= 0) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    env[key] = value;
  }

  return env;
}

function parseBoolean(value) {
  return String(value).toLowerCase() === "true";
}

function loadConfig() {
  const envFilePath = path.join(process.cwd(), ".env");
  const fileEnv = parseEnvFile(envFilePath);

  for (const [key, value] of Object.entries({ ...DEFAULTS, ...fileEnv })) {
    if (!process.env[key] && value !== undefined) {
      process.env[key] = value;
    }
  }

  const config = {
    jira: {
      baseUrl: process.env.JIRA_BASE_URL,
      email: process.env.JIRA_EMAIL,
      apiToken: process.env.JIRA_API_TOKEN
    },
    bitbucket: {
      baseUrl: process.env.BITBUCKET_BASE_URL,
      workspace: process.env.BITBUCKET_WORKSPACE,
      username: process.env.BITBUCKET_USERNAME,
      appPassword: process.env.BITBUCKET_APP_PASSWORD,
      defaultRepo: process.env.BITBUCKET_REPO
    },
    gemini: {
      apiKey: process.env.GEMINI_API_KEY,
      model: process.env.GEMINI_MODEL
    },
    monitorIntervalMs: Number(process.env.DEFAULT_MONITOR_INTERVAL_MS) || 120000,
    safeMode: parseBoolean(process.env.SAFE_MODE),
    allowPrApproval: parseBoolean(process.env.ALLOW_PR_APPROVAL),
    allowJiraTransitions: parseBoolean(process.env.ALLOW_JIRA_TRANSITIONS),
    logLevel: process.env.LOG_LEVEL || "info",
    debug: parseBoolean(process.env.DEBUG)
  };

  config.releaseBoards = [
    {
      name: "Sprint de Desarrollo - TLC",
      projectKey: "TLC",
      statusName: "Release Manager",
      nextStatus: "Listo para DryRun",
      environments: ["Telecentro-demo02", "Telecentro-demo"]
    },
    {
      name: "BugFixing - Telecentro UAT SP11",
      projectKey: null,
      statusName: "Release Manager",
      nextStatus: "Listo para QA",
      deploymentStatus: "En despliegue",
      environments: ["Telecentro-uat"]
    },
    {
      name: "BugFixing - Telecentro QA SP12/13",
      projectKey: null,
      statusName: "Release Manager",
      nextStatus: "Listo para QA",
      deploymentStatus: "En despliegue",
      environments: ["Telecentro-qa"]
    }
  ];

  config.authorizedReviewers = [
    "Pablo Inglod",
    "Lara Castillo",
    "Leandro Petri"
  ];

  config.branchTargets = {
    DEV: "SP14/main",
    QA: "SP12/main",
    UAT: "SP11/main",
    STAGE: "SP10/main",
    AMS: "SP10/main",
    PROD: "SP10/main"
  };

  return config;
}

module.exports = {
  loadConfig
};
