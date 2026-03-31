const { postJson } = require("../utils/http");
const { safeJsonParse } = require("../utils/parsers");

class GeminiService {
  constructor({ config }) {
    this.config = config;
  }

  isConfigured() {
    return Boolean(this.config.gemini.apiKey);
  }

  async analyzeReleaseCandidate(context) {
    this.assertConfigured();

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
      this.config.gemini.model
    )}:generateContent`;

    const prompt = buildPrompt(context);
    const payload = {
      contents: [
        {
          role: "user",
          parts: [
            {
              text: prompt
            }
          ]
        }
      ],
      generationConfig: {
        temperature: 0.2,
        responseMimeType: "application/json"
      }
    };

    const response = await postJson(endpoint, payload, {
      headers: {
        accept: "application/json",
        "x-goog-api-key": this.config.gemini.apiKey
      },
      timeoutMs: 20000,
      retries: 0
    });

    const rawText =
      response.candidates?.[0]?.content?.parts?.map((part) => part.text).join("") || "";
    const parsed = safeJsonParse(rawText);

    if (!parsed) {
      throw new Error("Gemini returned invalid JSON.");
    }

    validateGeminiResponse(parsed);
    return parsed;
  }

  assertConfigured() {
    if (!this.isConfigured()) {
      throw new Error("Gemini is not configured. Check GEMINI_API_KEY.");
    }
  }
}

function buildPrompt(context) {
  return `
You are a release management assistant for Salesforce projects.
Analyze the following PR and ticket context.
Return ONLY valid JSON with these fields:
summary, riskLevel, mainConcerns, deploymentHints, requiresManualAttention, preDeployDetected, postDeployDetected, componentScope

Rules:
- riskLevel must be one of: low, medium, high
- mainConcerns must be an array of strings
- deploymentHints must be an array of strings
- requiresManualAttention must be boolean
- preDeployDetected and postDeployDetected must be boolean
- componentScope must be one of: Salesforce Core, Salesforce Industries, Core + Industries, Unknown
- summary must be concise and practical for release management

Context JSON:
${JSON.stringify(context, null, 2)}
  `.trim();
}

function validateGeminiResponse(value) {
  const requiredKeys = [
    "summary",
    "riskLevel",
    "mainConcerns",
    "deploymentHints",
    "requiresManualAttention",
    "preDeployDetected",
    "postDeployDetected",
    "componentScope"
  ];

  for (const key of requiredKeys) {
    if (!(key in value)) {
      throw new Error(`Gemini JSON response is missing '${key}'.`);
    }
  }
}

module.exports = {
  GeminiService
};
