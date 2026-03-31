const { getJson, postJson } = require("../utils/http");
const { extractTicketKeyFromText } = require("../utils/parsers");

class BitbucketService {
  constructor({ config }) {
    this.config = config;
    this.baseUrl = config.bitbucket.baseUrl;
  }

  isConfigured() {
    return Boolean(
      this.config.bitbucket.baseUrl &&
        this.config.bitbucket.workspace &&
        this.config.bitbucket.username &&
        this.config.bitbucket.appPassword
    );
  }

  async listRepositories() {
    this.assertConfigured();
    const url = `${this.baseUrl}/repositories/${encodeURIComponent(
      this.config.bitbucket.workspace
    )}?pagelen=100`;
    const response = await getJson(url, {
      headers: this.buildHeaders()
    });

    return (response.values || []).map((repo) => ({
      slug: repo.slug,
      name: repo.name,
      fullName: repo.full_name,
      isPrivate: repo.is_private
    }));
  }

  async listOpenPullRequests(repoSlug) {
    this.assertConfigured();
    const repo = this.resolveRepo(repoSlug);
    const url = `${this.baseUrl}/repositories/${encodeURIComponent(
      this.config.bitbucket.workspace
    )}/${encodeURIComponent(repo)}/pullrequests?state=OPEN&pagelen=50`;
    const response = await getJson(url, {
      headers: this.buildHeaders()
    });

    return (response.values || []).map((pr) => this.mapPullRequest(pr));
  }

  async getPullRequest(repoSlug, prId) {
    this.assertConfigured();
    const repo = this.resolveRepo(repoSlug);
    const url = `${this.baseUrl}/repositories/${encodeURIComponent(
      this.config.bitbucket.workspace
    )}/${encodeURIComponent(repo)}/pullrequests/${encodeURIComponent(prId)}`;
    const pr = await getJson(url, {
      headers: this.buildHeaders()
    });
    return this.mapPullRequest(pr);
  }

  async getPullRequestChangedFiles(repoSlug, prId) {
    this.assertConfigured();
    const repo = this.resolveRepo(repoSlug);
    const baseUrl = `${this.baseUrl}/repositories/${encodeURIComponent(
      this.config.bitbucket.workspace
    )}/${encodeURIComponent(repo)}/pullrequests/${encodeURIComponent(prId)}/diffstat?pagelen=100`;

    const files = [];
    let nextUrl = baseUrl;

    while (nextUrl) {
      const page = await getJson(nextUrl, {
        headers: this.buildHeaders()
      });

      for (const item of page.values || []) {
        const path =
          item.new?.path || item.old?.path || item.new?.escaped_path || item.old?.escaped_path;
        files.push({
          path,
          status: item.status || "modified"
        });
      }

      nextUrl = page.next || null;
    }

    return files;
  }

  async findPullRequestByTicket(ticketKey, repoSlug) {
    if (!ticketKey) {
      return null;
    }

    if (repoSlug) {
      return this.findPullRequestByTicketInRepo(ticketKey, repoSlug);
    }

    const repos = await this.listRepositories();
    for (const repo of repos) {
      const match = await this.findPullRequestByTicketInRepo(ticketKey, repo.slug);
      if (match) {
        return match;
      }
    }

    return null;
  }

  async findPullRequestByTicketInRepo(ticketKey, repoSlug) {
    const prs = await this.listOpenPullRequests(repoSlug);
    const normalizedKey = String(ticketKey).toUpperCase();

    return (
      prs.find((pr) => {
        const branchTicket = extractTicketKeyFromText(pr.sourceBranch);
        const titleTicket = extractTicketKeyFromText(pr.title);
        return [branchTicket, titleTicket].includes(normalizedKey);
      }) || null
    );
  }

  async commentOnPullRequest(repoSlug, prId, content) {
    this.assertConfigured();
    const repo = this.resolveRepo(repoSlug);
    const url = `${this.baseUrl}/repositories/${encodeURIComponent(
      this.config.bitbucket.workspace
    )}/${encodeURIComponent(repo)}/pullrequests/${encodeURIComponent(prId)}/comments`;
    return postJson(
      url,
      {
        content: {
          raw: content
        }
      },
      {
        headers: this.buildHeaders()
      }
    );
  }

  async approvePullRequest(repoSlug, prId) {
    this.assertConfigured();
    const repo = this.resolveRepo(repoSlug);
    const url = `${this.baseUrl}/repositories/${encodeURIComponent(
      this.config.bitbucket.workspace
    )}/${encodeURIComponent(repo)}/pullrequests/${encodeURIComponent(prId)}/approve`;
    return postJson(
      url,
      {},
      {
        headers: this.buildHeaders()
      }
    );
  }

  buildHeaders() {
    const auth = Buffer.from(
      `${this.config.bitbucket.username}:${this.config.bitbucket.appPassword}`,
      "utf8"
    ).toString("base64");

    return {
      accept: "application/json",
      authorization: `Basic ${auth}`
    };
  }

  resolveRepo(repoSlug) {
    const repo = repoSlug || this.config.bitbucket.defaultRepo;
    if (!repo) {
      throw new Error("Bitbucket repo not provided. Use --repo or BITBUCKET_REPO.");
    }
    return repo;
  }

  mapPullRequest(pr) {
    const approvedReviewers = (pr.participants || [])
      .filter((participant) => participant.approved)
      .map((participant) => participant.user?.display_name)
      .filter(Boolean);

    return {
      id: pr.id,
      title: pr.title,
      state: pr.state,
      repo: pr.destination?.repository?.slug || null,
      sourceBranch: pr.source?.branch?.name || null,
      destinationBranch: pr.destination?.branch?.name || null,
      author: pr.author?.display_name || null,
      approvedReviewers,
      participants:
        (pr.participants || []).map((participant) => ({
          name: participant.user?.display_name || null,
          approved: Boolean(participant.approved),
          role: participant.role || null
        })) || [],
      link: pr.links?.html?.href || null,
      raw: pr
    };
  }

  assertConfigured() {
    if (!this.isConfigured()) {
      throw new Error(
        "Bitbucket is not configured. Check BITBUCKET_BASE_URL, BITBUCKET_WORKSPACE, BITBUCKET_USERNAME and BITBUCKET_APP_PASSWORD."
      );
    }
  }
}

module.exports = {
  BitbucketService
};
