const path = require("node:path");
const { spawn } = require("node:child_process");
const { renderHelp } = require("./help");
const { JiraService } = require("../services/jira");
const { BitbucketService } = require("../services/bitbucket");
const { GeminiService } = require("../services/gemini");
const { ReleaseManager } = require("../domain/release-manager");
const { readJsonFile, writeJsonFile, removeFile } = require("../utils/files");
const { parseArgs } = require("../utils/parsers");

const MONITOR_PID_FILE = path.join(process.cwd(), "data", "monitor.pid.json");

async function runCli(argv, context) {
  const { positionals, flags } = parseArgs(argv);
  const [group, action, subaction] = positionals;

  if (!group || group === "help" || group === "--help" || group === "-h") {
    console.log(renderHelp());
    return;
  }

  const jira = new JiraService(context);
  const bitbucket = new BitbucketService(context);
  const gemini = new GeminiService(context);
  const releaseManager = new ReleaseManager({
    ...context,
    jira,
    bitbucket,
    gemini
  });

  if (group === "jira" && action === "ticket") {
    const ticketKey = subaction;
    if (!ticketKey) {
      throw new Error("Missing Jira ticket key. Example: jira ticket TLC-500");
    }
    const ticket = await jira.getTicket(ticketKey);
    console.log(JSON.stringify(ticket, null, 2));
    return;
  }

  if (group === "jira" && action === "watch") {
    const candidates = await releaseManager.scanBoards();
    console.log(JSON.stringify(candidates, null, 2));
    return;
  }

  if (group === "jira" && action === "transition") {
    if (!flags.ticket || !flags.transition) {
      throw new Error("Usage: jira transition --ticket <key> --transition <id> --confirm");
    }
    if (!flags.confirm || !context.config.allowJiraTransitions) {
      throw new Error(
        "Jira transitions are protected. Use --confirm and set ALLOW_JIRA_TRANSITIONS=true."
      );
    }
    const result = await jira.transitionIssue(flags.ticket, flags.transition);
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (group === "bitbucket" && action === "repos") {
    const repos = await bitbucket.listRepositories();
    console.log(JSON.stringify(repos, null, 2));
    return;
  }

  if (group === "bitbucket" && action === "prs") {
    const repo = flags.repo || context.config.bitbucket.defaultRepo;
    const prs = await bitbucket.listOpenPullRequests(repo);
    console.log(JSON.stringify(prs, null, 2));
    return;
  }

  if (group === "bitbucket" && action === "pr" && subaction === "analyze") {
    const repo = flags.repo || context.config.bitbucket.defaultRepo;
    const prId = flags.pr;
    if (!repo || !prId) {
      throw new Error("Usage: bitbucket pr analyze --repo <repo> --pr <id> [--ticket <key>]");
    }
    const analysis = await releaseManager.analyzePullRequest({
      repo,
      prId,
      ticketKey: flags.ticket
    });
    console.log(JSON.stringify(analysis, null, 2));
    return;
  }

  if (group === "bitbucket" && action === "pr" && subaction === "comment") {
    const repo = flags.repo || context.config.bitbucket.defaultRepo;
    if (!repo || !flags.pr || !flags.message) {
      throw new Error("Usage: bitbucket pr comment --repo <repo> --pr <id> --message \"text\"");
    }
    const result = await bitbucket.commentOnPullRequest(repo, flags.pr, flags.message);
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (group === "bitbucket" && action === "pr" && subaction === "approve") {
    const repo = flags.repo || context.config.bitbucket.defaultRepo;
    if (!repo || !flags.pr) {
      throw new Error("Usage: bitbucket pr approve --repo <repo> --pr <id> --confirm");
    }
    if (!flags.confirm || !context.config.allowPrApproval) {
      throw new Error(
        "PR approval is protected. Use --confirm and set ALLOW_PR_APPROVAL=true."
      );
    }
    const result = await bitbucket.approvePullRequest(repo, flags.pr);
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (group === "release" && action === "scan") {
    const result = await releaseManager.scanBoards();
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (group === "release" && action === "status") {
    const status = await releaseManager.getStatusSummary();
    console.log(JSON.stringify(status, null, 2));
    return;
  }

  if (group === "monitor" && action === "start") {
    await startMonitor(flags, context);
    return;
  }

  if (group === "monitor" && action === "run") {
    await runMonitor(flags, releaseManager, context);
    return;
  }

  if (group === "monitor" && action === "stop") {
    await stopMonitor(context);
    return;
  }

  throw new Error(`Unknown command: ${positionals.join(" ")}`);
}

async function startMonitor(flags, context) {
  const existing = readJsonFile(MONITOR_PID_FILE);
  if (existing && isProcessAlive(existing.pid)) {
    throw new Error(`Monitor is already running with PID ${existing.pid}`);
  }

  const interval = Number(flags.interval || context.config.monitorIntervalMs);
  const child = spawn(
    process.execPath,
    [path.join(process.cwd(), "src", "main.js"), "monitor", "run", "--interval", String(interval)],
    {
      cwd: process.cwd(),
      detached: true,
      stdio: "ignore"
    }
  );

  child.unref();

  writeJsonFile(MONITOR_PID_FILE, {
    pid: child.pid,
    startedAt: new Date().toISOString(),
    intervalMs: interval
  });

  console.log(
    JSON.stringify(
      {
        message: "Monitor started",
        pid: child.pid,
        intervalMs: interval
      },
      null,
      2
    )
  );
}

async function runMonitor(flags, releaseManager, context) {
  const interval = Number(flags.interval || context.config.monitorIntervalMs);
  const logger = context.logger;

  const executeCycle = async () => {
    try {
      const result = await releaseManager.scanBoards();
      logger.info(`Monitor cycle complete. Candidates found: ${result.totalCandidates}`);
    } catch (error) {
      logger.error(`Monitor cycle failed: ${error.message}`);
    }
  };

  await executeCycle();
  const timer = setInterval(executeCycle, interval);

  const shutdown = () => {
    clearInterval(timer);
    removeFile(MONITOR_PID_FILE);
    logger.info("Monitor stopped");
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

async function stopMonitor() {
  const metadata = readJsonFile(MONITOR_PID_FILE);
  if (!metadata) {
    throw new Error("Monitor PID file not found. The monitor may not be running.");
  }

  if (!isProcessAlive(metadata.pid)) {
    removeFile(MONITOR_PID_FILE);
    throw new Error(`Monitor PID ${metadata.pid} is not active anymore.`);
  }

  process.kill(metadata.pid, "SIGTERM");
  removeFile(MONITOR_PID_FILE);

  console.log(
    JSON.stringify(
      {
        message: "Monitor stop signal sent",
        pid: metadata.pid
      },
      null,
      2
    )
  );
}

function isProcessAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return false;
  }
}

module.exports = {
  runCli
};
