const { classifyChangedFiles, extractTicketKeyFromText } = require("../utils/parsers");

class ReleaseManager {
  constructor({ config, logger, jira, bitbucket, gemini }) {
    this.config = config;
    this.logger = logger;
    this.jira = jira;
    this.bitbucket = bitbucket;
    this.gemini = gemini;
  }

  async scanBoards() {
    const results = [];

    for (const board of this.config.releaseBoards) {
      const tickets = await this.jira.findReleaseCandidates(board);
      for (const ticket of tickets) {
        const candidate = await this.buildCandidateFromTicket(ticket, board);
        results.push(candidate);
      }
    }

    return {
      scannedAt: new Date().toISOString(),
      totalCandidates: results.length,
      safeMode: this.config.safeMode,
      candidates: results
    };
  }

  async getStatusSummary() {
    const scan = await this.scanBoards();
    const counts = {
      ready: 0,
      blockedNoPr: 0,
      blockedNoApproval: 0,
      blockedMismatch: 0,
      unknown: 0
    };

    for (const candidate of scan.candidates) {
      if (candidate.releaseState === "READY_FOR_NEXT_PHASE") {
        counts.ready += 1;
      } else if (candidate.releaseState === "BLOCKED_NO_PR") {
        counts.blockedNoPr += 1;
      } else if (candidate.releaseState === "BLOCKED_NO_APPROVAL") {
        counts.blockedNoApproval += 1;
      } else if (candidate.releaseState === "BLOCKED_INCONSISTENT") {
        counts.blockedMismatch += 1;
      } else {
        counts.unknown += 1;
      }
    }

    return {
      scannedAt: scan.scannedAt,
      counts,
      candidates: scan.candidates
    };
  }

  async analyzePullRequest({ repo, prId, ticketKey }) {
    const pr = await this.bitbucket.getPullRequest(repo, prId);
    const files = await this.bitbucket.getPullRequestChangedFiles(repo, prId);
    const classification = classifyChangedFiles(files);
    const derivedTicketKey =
      ticketKey ||
      extractTicketKeyFromText(pr.sourceBranch) ||
      extractTicketKeyFromText(pr.title);
    const jiraTicket = derivedTicketKey ? await this.jira.getTicket(derivedTicketKey) : null;
    const approval = this.findAuthorizedApprovals(pr.approvedReviewers);

    const geminiContext = {
      ticketKey: derivedTicketKey,
      board: null,
      status: jiraTicket?.status || null,
      sourceBranch: pr.sourceBranch,
      destinationBranch: pr.destinationBranch,
      changedFiles: files.map((file) => file.path),
      preDeployDetected: classification.preDeployDetected,
      postDeployDetected: classification.postDeployDetected,
      hasCoreChanges: classification.hasCore,
      hasIndustriesChanges: classification.hasIndustries,
      approvedReviewerExists: approval.hasAuthorizedApproval,
      approvedReviewers: approval.authorizedReviewers
    };

    const ai = await this.gemini.analyzeReleaseCandidate(geminiContext);

    return {
      ticket: jiraTicket,
      pullRequest: pr,
      files,
      classification,
      approval,
      ai
    };
  }

  async buildCandidateFromTicket(ticket, board) {
    const pr = await this.bitbucket.findPullRequestByTicket(ticket.key);
    if (!pr) {
      return {
        ticket,
        board: board.name,
        environments: board.environments,
        releaseState: "BLOCKED_NO_PR",
        reason: "No open PR found for the Jira ticket key."
      };
    }

    const files = await this.bitbucket.getPullRequestChangedFiles(pr.repo, pr.id);
    const classification = classifyChangedFiles(files);
    const approval = this.findAuthorizedApprovals(pr.approvedReviewers);
    const extractedBranchKey = extractTicketKeyFromText(pr.sourceBranch);
    const consistencyOk = extractedBranchKey === ticket.key;

    const geminiContext = {
      ticketKey: ticket.key,
      board: board.name,
      status: ticket.status,
      sourceBranch: pr.sourceBranch,
      destinationBranch: pr.destinationBranch,
      changedFiles: files.map((file) => file.path),
      preDeployDetected: classification.preDeployDetected,
      postDeployDetected: classification.postDeployDetected,
      hasCoreChanges: classification.hasCore,
      hasIndustriesChanges: classification.hasIndustries,
      approvedReviewerExists: approval.hasAuthorizedApproval,
      approvedReviewers: approval.authorizedReviewers
    };

    let ai = null;
    try {
      ai = await this.gemini.analyzeReleaseCandidate(geminiContext);
    } catch (error) {
      this.logger.warn(`Gemini analysis skipped for ${ticket.key}: ${error.message}`);
    }

    let releaseState = "READY_FOR_NEXT_PHASE";
    let reason = "Ticket, PR and approval look consistent for the next stage.";

    if (!consistencyOk) {
      releaseState = "BLOCKED_INCONSISTENT";
      reason = "Ticket key does not match the source branch naming convention.";
    } else if (!approval.hasAuthorizedApproval) {
      releaseState = "BLOCKED_NO_APPROVAL";
      reason = "No approval found from an authorized reviewer.";
    }

    return {
      ticket,
      board: board.name,
      environments: board.environments,
      targetStatus: board.nextStatus,
      deploymentStatus: board.deploymentStatus || null,
      pullRequest: pr,
      approval,
      classification,
      ai,
      releaseState,
      reason
    };
  }

  findAuthorizedApprovals(approvedReviewers = []) {
    const authorizedReviewers = approvedReviewers.filter((reviewer) =>
      this.config.authorizedReviewers.includes(reviewer)
    );

    return {
      hasAuthorizedApproval: authorizedReviewers.length > 0,
      authorizedReviewers,
      approvedReviewers
    };
  }
}

module.exports = {
  ReleaseManager
};
