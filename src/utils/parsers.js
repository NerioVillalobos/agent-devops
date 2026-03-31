function parseArgs(argv) {
  const positionals = [];
  const flags = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      positionals.push(token);
      continue;
    }

    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      flags[key] = true;
      continue;
    }

    flags[key] = next;
    index += 1;
  }

  return { positionals, flags };
}

function extractTicketKeyFromText(input) {
  if (!input) {
    return null;
  }

  const match = String(input).match(/\b([A-Z][A-Z0-9]+-\d+)\b/);
  return match ? match[1] : null;
}

function classifyChangedFiles(files) {
  const normalized = files.map((file) => file.path || file);
  const hasCore = normalized.some((file) => file.startsWith("force-app/"));
  const hasIndustries = normalized.some((file) => file.startsWith("Vlocity/"));
  const preDeployDetected = normalized.some((file) =>
    /(^|\/)(PreDeploySteps\.md|.*Pre.*)/i.test(file)
  );
  const postDeployDetected = normalized.some((file) =>
    /(^|\/)(PostDeploySteps\.md|.*Post.*)/i.test(file)
  );

  let componentScope = "Unknown";
  if (hasCore && hasIndustries) {
    componentScope = "Core + Industries";
  } else if (hasCore) {
    componentScope = "Salesforce Core";
  } else if (hasIndustries) {
    componentScope = "Salesforce Industries";
  }

  return {
    hasCore,
    hasIndustries,
    preDeployDetected,
    postDeployDetected,
    componentScope
  };
}

function safeJsonParse(input) {
  try {
    return JSON.parse(stripCodeFences(input));
  } catch (error) {
    return null;
  }
}

function stripCodeFences(input) {
  const value = String(input || "").trim();
  if (value.startsWith("```") && value.endsWith("```")) {
    return value.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  }
  return value;
}

module.exports = {
  parseArgs,
  extractTicketKeyFromText,
  classifyChangedFiles,
  safeJsonParse
};
