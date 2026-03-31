const { getJson, postJson, request } = require("../utils/http");

class JiraService {
  constructor({ config }) {
    this.config = config;
    this.baseUrl = config.jira.baseUrl;
  }

  isConfigured() {
    return Boolean(
      this.config.jira.baseUrl && this.config.jira.email && this.config.jira.apiToken
    );
  }

  async getTicket(ticketKey) {
    this.assertConfigured();
    const url = `${this.baseUrl}/rest/api/3/issue/${encodeURIComponent(ticketKey)}`;
    const issue = await getJson(url, {
      headers: this.buildHeaders()
    });

    return this.mapIssue(issue);
  }

  async searchIssuesByJql(jql) {
    this.assertConfigured();
    const url = `${this.baseUrl}/rest/api/3/search`;
    const payload = {
      jql,
      maxResults: 50,
      fields: ["summary", "status", "issuetype", "project"]
    };

    const response = await postJson(url, payload, {
      headers: this.buildHeaders()
    });

    return (response.issues || []).map((issue) => this.mapIssue(issue));
  }

  async findReleaseCandidates(board) {
    const conditions = [`status = "${board.statusName}"`];

    if (board.projectKey) {
      conditions.push(`project = "${board.projectKey}"`);
    }

    const jql = `${conditions.join(" AND ")} ORDER BY updated DESC`;
    return this.searchIssuesByJql(jql);
  }

  async transitionIssue(ticketKey, transitionId) {
    this.assertConfigured();
    const url = `${this.baseUrl}/rest/api/3/issue/${encodeURIComponent(ticketKey)}/transitions`;
    await request(url, {
      method: "POST",
      headers: {
        ...this.buildHeaders(),
        "content-type": "application/json"
      },
      body: JSON.stringify({
        transition: {
          id: String(transitionId)
        }
      }),
      expectedStatus: [204]
    });
    return { success: true };
  }

  buildHeaders() {
    const auth = Buffer.from(
      `${this.config.jira.email}:${this.config.jira.apiToken}`,
      "utf8"
    ).toString("base64");

    return {
      accept: "application/json",
      authorization: `Basic ${auth}`
    };
  }

  mapIssue(issue) {
    return {
      id: issue.id,
      key: issue.key,
      summary: issue.fields?.summary || null,
      status: issue.fields?.status?.name || null,
      issueType: issue.fields?.issuetype?.name || null,
      projectKey: issue.fields?.project?.key || null,
      raw: issue
    };
  }

  assertConfigured() {
    if (!this.isConfigured()) {
      throw new Error("Jira is not configured. Check JIRA_BASE_URL, JIRA_EMAIL and JIRA_API_TOKEN.");
    }
  }
}

module.exports = {
  JiraService
};
