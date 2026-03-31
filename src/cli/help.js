function renderHelp() {
  return `
Release Management Assistant CLI

Usage:
  node src/main.js jira ticket <TICKET_KEY>
  node src/main.js jira watch
  node src/main.js bitbucket repos
  node src/main.js bitbucket prs [--repo <repo>]
  node src/main.js bitbucket pr analyze --repo <repo> --pr <id> [--ticket <key>]
  node src/main.js bitbucket pr comment --repo <repo> --pr <id> --message "texto"
  node src/main.js bitbucket pr approve --repo <repo> --pr <id> --confirm
  node src/main.js jira transition --ticket <key> --transition <id> --confirm
  node src/main.js release scan
  node src/main.js release status
  node src/main.js monitor start [--interval <ms>]
  node src/main.js monitor stop
  node src/main.js help

Notes:
  - SAFE_MODE=true keeps actions like Jira transitions and PR approvals disabled by default.
  - The .env file is loaded automatically from the project root.
  `.trim();
}

module.exports = {
  renderHelp
};
