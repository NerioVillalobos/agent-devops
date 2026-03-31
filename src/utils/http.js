const DEFAULT_TIMEOUT_MS = 15000;
const DEFAULT_RETRIES = 1;

async function request(url, options = {}) {
  const {
    timeoutMs = DEFAULT_TIMEOUT_MS,
    retries = DEFAULT_RETRIES,
    retryDelayMs = 500,
    expectedStatus = [],
    ...fetchOptions
  } = options;

  let lastError;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        ...fetchOptions,
        signal: controller.signal
      });
      clearTimeout(timer);

      const successStatuses = expectedStatus.length > 0 ? expectedStatus : [200, 201, 202, 204];
      if (!successStatuses.includes(response.status)) {
        const bodyText = await safeReadText(response);
        throw new Error(`HTTP ${response.status} for ${sanitizeUrl(url)}: ${bodyText}`);
      }

      return response;
    } catch (error) {
      clearTimeout(timer);
      lastError = error;
      if (attempt >= retries) {
        throw error;
      }
      await delay(retryDelayMs * (attempt + 1));
    }
  }

  throw lastError;
}

async function getJson(url, options = {}) {
  const response = await request(url, options);
  if (response.status === 204) {
    return null;
  }
  const bodyText = await response.text();

  if (!bodyText) {
    return null;
  }

  try {
    return JSON.parse(bodyText);
  } catch (error) {
    const snippet = bodyText.slice(0, 200).replace(/\s+/g, " ");
    throw new Error(`Expected JSON from ${sanitizeUrl(url)} but received: ${snippet}`);
  }
}

async function postJson(url, body, options = {}) {
  return getJson(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(options.headers || {})
    },
    body: JSON.stringify(body),
    ...options
  });
}

async function safeReadText(response) {
  try {
    return await response.text();
  } catch (error) {
    return "<unable to read body>";
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sanitizeUrl(url) {
  try {
    const parsed = new URL(url);
    for (const key of ["key", "api_key", "token", "access_token"]) {
      if (parsed.searchParams.has(key)) {
        parsed.searchParams.set(key, "<redacted>");
      }
    }
    return parsed.toString();
  } catch (error) {
    return String(url).replace(/(key|token|api_key|access_token)=([^&]+)/gi, "$1=<redacted>");
  }
}

module.exports = {
  request,
  getJson,
  postJson,
  sanitizeUrl
};
