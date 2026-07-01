const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { URL } = require("node:url");

const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, "public");
const CONFIG_FILE = path.join(ROOT, "config.local.json");
const PORT = Number(process.env.PORT || 4173);
const DEFAULT_API_HOST = "https://api-seller.ozon.ru";
const DEFAULT_PERFORMANCE_API_HOST = "https://api-performance.ozon.ru";
const DEFAULT_LABEL_DIR = path.join(process.env.USERPROFILE || process.env.HOME || ROOT, "Downloads", "OzonLabels");
const SELLER_HOST = "https://seller.ozon.ru";
const SELLER_API_PREFIX = "/api/supplier-api-cargoes-gw/api/v1/";

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

let config = {
  apiHost: DEFAULT_API_HOST,
  clientId: "",
  apiKey: "",
};
const performanceTokenCache = new Map();

function loadConfig() {
  if (!fs.existsSync(CONFIG_FILE)) {
    return;
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8"));
    config = {
      apiHost: typeof parsed.apiHost === "string" ? parsed.apiHost : DEFAULT_API_HOST,
      clientId: typeof parsed.clientId === "string" ? parsed.clientId : "",
      apiKey: typeof parsed.apiKey === "string" ? parsed.apiKey : "",
    };
  } catch (error) {
    console.warn(`Could not load ${CONFIG_FILE}: ${error.message}`);
  }
}

function saveConfig() {
  const body = JSON.stringify(config, null, 2);
  fs.writeFileSync(CONFIG_FILE, body, { encoding: "utf8" });
}

function mask(value) {
  if (!value) {
    return "";
  }
  if (value.length <= 6) {
    return "*".repeat(value.length);
  }
  return `${value.slice(0, 3)}${"*".repeat(Math.max(4, value.length - 6))}${value.slice(-3)}`;
}

function publicConfig() {
  return {
    apiHost: config.apiHost,
    clientIdMasked: mask(config.clientId),
    apiKeyMasked: mask(config.apiKey),
    hasClientId: Boolean(config.clientId),
    hasApiKey: Boolean(config.apiKey),
    savedOnDisk: fs.existsSync(CONFIG_FILE),
    defaultLabelSaveDir: DEFAULT_LABEL_DIR,
  };
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let data = "";
    request.on("data", (chunk) => {
      data += chunk;
      if (data.length > 2_000_000) {
        reject(new Error("Request body is too large."));
        request.destroy();
      }
    });
    request.on("end", () => {
      if (!data) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(data));
      } catch (error) {
        reject(new Error("Request body must be valid JSON."));
      }
    });
    request.on("error", reject);
  });
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  response.end(JSON.stringify(payload, null, 2));
}

function sendError(response, statusCode, message, details) {
  sendJson(response, statusCode, {
    ok: false,
    error: message,
    details,
  });
}

function normalizeApiHost(value) {
  const url = new URL(value || DEFAULT_API_HOST);
  if (url.protocol !== "https:") {
    throw new Error("API host must use https.");
  }

  const host = url.hostname.toLowerCase();
  const isOzonHost = host === "api-seller.ozon.ru" || host === "api-seller.ozon.com" || host.endsWith(".ozon.ru") || host.endsWith(".ozon.com");
  if (!isOzonHost) {
    throw new Error("API host must be an Ozon host.");
  }

  url.pathname = "";
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}

function normalizeEndpoint(endpoint) {
  if (typeof endpoint !== "string" || endpoint.length < 2 || endpoint.length > 300) {
    throw new Error("Endpoint must be a path like /v2/draft/timeslot/info.");
  }
  if (!endpoint.startsWith("/") || endpoint.startsWith("//") || endpoint.includes("://")) {
    throw new Error("Endpoint must be a relative Ozon API path.");
  }
  return endpoint;
}

function normalizePerformanceEndpoint(endpoint) {
  const normalized = normalizeEndpoint(endpoint);
  if (!normalized.startsWith("/api/client/")) {
    throw new Error("Performance endpoint must start with /api/client/.");
  }
  if (normalized.startsWith("/api/client/token")) {
    throw new Error("Performance token endpoint is handled by the local proxy.");
  }
  return normalized;
}

function normalizeSellerEndpoint(endpoint) {
  const normalized = normalizeEndpoint(endpoint || `${SELLER_API_PREFIX}add-cargoes-start`);
  if (!normalized.startsWith(SELLER_API_PREFIX)) {
    throw new Error(`Seller endpoint must start with ${SELLER_API_PREFIX}.`);
  }
  return normalized;
}

function maskCookie(cookie) {
  if (!cookie) {
    return "";
  }
  return String(cookie)
    .split(";")
    .map((part) => {
      const name = part.trim().split("=")[0];
      return name ? `${name}=***` : "***";
    })
    .join("; ");
}

function sanitizeExtraHeaders(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const blocked = new Set(["host", "content-length", "connection", "cookie", "origin", "referer"]);
  const headers = {};
  for (const [key, rawValue] of Object.entries(value)) {
    const name = String(key).trim();
    if (!name || blocked.has(name.toLowerCase()) || /[\r\n:]/.test(name)) {
      continue;
    }
    if (rawValue === undefined || rawValue === null) {
      continue;
    }
    headers[name] = String(rawValue);
  }
  return headers;
}

function sanitizeFileName(value) {
  const cleaned = String(value || "")
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "_")
    .replace(/\s+/g, "_")
    .replace(/^\.+/, "")
    .slice(0, 160);
  const base = cleaned || `ozon-cargo-labels-${Date.now()}.pdf`;
  return base.toLowerCase().endsWith(".pdf") ? base : `${base}.pdf`;
}

function sanitizeGenericFileName(value, defaultExt = ".xlsx") {
  const cleaned = String(value || "")
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "_")
    .replace(/\s+/g, "_")
    .replace(/^\.+/, "")
    .slice(0, 160);
  let base = cleaned || `ozon-export-${Date.now()}${defaultExt}`;
  if (!path.extname(base)) {
    base += defaultExt;
  }
  const ext = path.extname(base).toLowerCase();
  if (![".xlsx", ".xls", ".csv", ".txt", ".json", ".pdf"].includes(ext)) {
    throw new Error("Unsupported file extension.");
  }
  return base;
}

function normalizeSaveDir(value) {
  const raw = String(value || "").trim() || DEFAULT_LABEL_DIR;
  return path.resolve(raw);
}

function resolveSafeTarget(saveDir, fileName) {
  const targetPath = path.join(saveDir, fileName);
  const targetResolved = path.resolve(targetPath);
  if (!targetResolved.startsWith(`${saveDir}${path.sep}`) && targetResolved !== path.join(saveDir, fileName)) {
    throw new Error("Invalid target file path.");
  }
  return targetResolved;
}

function normalizeDownloadUrl(value) {
  const url = new URL(String(value || ""));
  if (url.protocol !== "https:") {
    throw new Error("PDF URL must use https.");
  }

  const host = url.hostname.toLowerCase();
  const allowed =
    host === "api-seller.ozon.ru" ||
    host === "api-seller.ozon.com" ||
    host === "ozonusercontent.com" ||
    host.endsWith(".ozonusercontent.com") ||
    host === "ozonstatic.cn" ||
    host.endsWith(".ozonstatic.cn") ||
    host === "ozonru.cn" ||
    host.endsWith(".ozonru.cn") ||
    host.endsWith(".ozon.ru") ||
    host.endsWith(".ozon.com") ||
    host.endsWith(".ozone.ru") ||
    host.endsWith(".ozone.com");
  if (!allowed) {
    throw new Error(`PDF URL must be an Ozon download URL. Rejected host: ${host}`);
  }
  return url;
}

function tryParseJson(text) {
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch (_error) {
    return text;
  }
}

async function proxyOzon(requestBody) {
  const method = (requestBody.method || "POST").toUpperCase();
  if (!["POST", "GET"].includes(method)) {
    throw new Error("Only POST and GET are supported.");
  }

  const endpoint = normalizeEndpoint(requestBody.endpoint);
  const apiHost = normalizeApiHost(requestBody.apiHost || config.apiHost);
  const body = requestBody.body === undefined ? {} : requestBody.body;
  const url = `${apiHost}${endpoint}`;
  const clientId = typeof requestBody.clientId === "string" && requestBody.clientId.trim() ? requestBody.clientId.trim() : config.clientId;
  const apiKey = typeof requestBody.apiKey === "string" && requestBody.apiKey.trim() ? requestBody.apiKey.trim() : config.apiKey;

  const headers = {
    Accept: "application/json",
    "Content-Type": "application/json",
    "Client-Id": clientId,
    "Api-Key": apiKey,
  };

  if (requestBody.dryRun) {
    return {
      ok: true,
      dryRun: true,
      request: {
        method,
        url,
        headers: {
          ...headers,
          "Client-Id": mask(headers["Client-Id"]),
          "Api-Key": mask(headers["Api-Key"]),
        },
        body,
      },
    };
  }

  if (!clientId || !apiKey) {
    const missing = [!clientId && "Client-Id", !apiKey && "Api-Key"].filter(Boolean).join(", ");
    const error = new Error(`Missing Ozon credentials: ${missing}.`);
    error.statusCode = 400;
    throw error;
  }

  const started = Date.now();
  const upstreamResponse = await fetch(url, {
    method,
    headers,
    body: method === "GET" ? undefined : JSON.stringify(body),
  }).catch((error) => {
    const wrapped = new Error(error.message || "fetch failed");
    wrapped.statusCode = 502;
    wrapped.details = {
      name: error.name,
      message: error.message,
      causeCode: error.cause?.code,
      causeMessage: error.cause?.message,
      endpoint,
      apiHost,
    };
    throw wrapped;
  });
  const text = await upstreamResponse.text();
  const responseBody = tryParseJson(text);
  const responseHeaders = {};
  for (const key of ["content-type", "x-o3-trace-id", "x-request-id"]) {
    const value = upstreamResponse.headers.get(key);
    if (value) {
      responseHeaders[key] = value;
    }
  }

  return {
    ok: upstreamResponse.ok,
    status: upstreamResponse.status,
    statusText: upstreamResponse.statusText,
    error: upstreamResponse.ok ? undefined : responseBody?.message || responseBody?.error || `${upstreamResponse.status} ${upstreamResponse.statusText}`,
    durationMs: Date.now() - started,
    endpoint,
    responseHeaders,
    body: responseBody,
  };
}

async function getPerformanceToken(requestBody) {
  const apiHost = normalizeApiHost(requestBody.performanceApiHost || requestBody.apiHost || DEFAULT_PERFORMANCE_API_HOST);
  const clientId = String(requestBody.performanceClientId || requestBody.clientId || "").trim();
  const clientSecret = String(requestBody.performanceClientSecret || requestBody.clientSecret || "").trim();
  if (!clientId || !clientSecret) {
    const error = new Error("Missing Performance credentials: Client ID and Client Secret.");
    error.statusCode = 400;
    throw error;
  }

  const cacheKey = `${apiHost}\n${clientId}\n${clientSecret}`;
  const cached = performanceTokenCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;

  const tokenResponse = await fetch(`${apiHost}/api/client/token`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "client_credentials",
    }),
  }).catch((error) => {
    const wrapped = new Error(error.message || "Performance token request failed");
    wrapped.statusCode = 502;
    wrapped.details = { name: error.name, message: error.message, causeCode: error.cause?.code, causeMessage: error.cause?.message };
    throw wrapped;
  });

  const tokenText = await tokenResponse.text();
  const tokenBody = tryParseJson(tokenText);
  if (!tokenResponse.ok) {
    const error = new Error(tokenBody?.error_description || tokenBody?.message || tokenBody?.error || `Performance token failed: ${tokenResponse.status} ${tokenResponse.statusText}`);
    error.statusCode = 502;
    error.details = { status: tokenResponse.status, body: tokenBody };
    throw error;
  }
  const token = tokenBody?.access_token || tokenBody?.token || tokenBody?.result?.access_token;
  if (!token) {
    const error = new Error("Performance token response did not include access_token.");
    error.statusCode = 502;
    error.details = tokenBody;
    throw error;
  }
  const expiresIn = Number(tokenBody?.expires_in || tokenBody?.expiresIn || 1800);
  performanceTokenCache.set(cacheKey, {
    token,
    expiresAt: Date.now() + Math.max(300, expiresIn) * 1000,
  });
  return token;
}

async function proxyPerformance(requestBody) {
  const method = (requestBody.method || "POST").toUpperCase();
  if (!["POST", "GET"].includes(method)) {
    throw new Error("Only POST and GET are supported.");
  }
  const endpoint = normalizePerformanceEndpoint(requestBody.endpoint);
  const apiHost = normalizeApiHost(requestBody.performanceApiHost || requestBody.apiHost || DEFAULT_PERFORMANCE_API_HOST);
  const url = `${apiHost}${endpoint}`;
  const body = requestBody.body === undefined ? {} : requestBody.body;
  const token = await getPerformanceToken(requestBody);

  const started = Date.now();
  const upstreamResponse = await fetch(url, {
    method,
    headers: {
      Accept: "application/json,text/plain,*/*",
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: method === "GET" ? undefined : JSON.stringify(body),
  }).catch((error) => {
    const wrapped = new Error(error.message || "Performance fetch failed");
    wrapped.statusCode = 502;
    wrapped.details = { name: error.name, message: error.message, causeCode: error.cause?.code, causeMessage: error.cause?.message, endpoint };
    throw wrapped;
  });
  const text = await upstreamResponse.text();
  const responseBody = tryParseJson(text);
  const responseHeaders = {};
  for (const key of ["content-type", "x-o3-trace-id", "x-request-id"]) {
    const value = upstreamResponse.headers.get(key);
    if (value) responseHeaders[key] = value;
  }

  return {
    ok: upstreamResponse.ok,
    status: upstreamResponse.status,
    statusText: upstreamResponse.statusText,
    error: upstreamResponse.ok ? undefined : responseBody?.message || responseBody?.error || `${upstreamResponse.status} ${upstreamResponse.statusText}`,
    durationMs: Date.now() - started,
    endpoint,
    responseHeaders,
    body: responseBody,
  };
}

async function proxySellerGateway(requestBody) {
  const method = (requestBody.method || "POST").toUpperCase();
  if (method !== "POST") {
    throw new Error("Seller gateway only supports POST.");
  }

  const endpoint = normalizeSellerEndpoint(requestBody.endpoint);
  const body = requestBody.body === undefined ? {} : requestBody.body;
  const url = `${SELLER_HOST}${endpoint}`;
  const cookie = String(requestBody.cookie || requestBody.sellerCookie || "").trim();
  const extraHeaders = sanitizeExtraHeaders(requestBody.extraHeaders);
  const headers = {
    Accept: "application/json, text/plain, */*",
    "Content-Type": "application/json",
    Origin: SELLER_HOST,
    Referer: `${SELLER_HOST}/`,
    "User-Agent":
      requestBody.userAgent ||
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125 Safari/537.36",
    ...extraHeaders,
  };

  if (body && body.companyId && !headers["x-o3-company-id"] && !headers["X-O3-Company-Id"]) {
    headers["x-o3-company-id"] = String(body.companyId);
  }
  if (cookie) {
    headers.Cookie = cookie;
  }

  if (requestBody.dryRun) {
    return {
      ok: true,
      dryRun: true,
      request: {
        method,
        url,
        headers: {
          ...headers,
          Cookie: maskCookie(headers.Cookie),
        },
        body,
      },
    };
  }

  if (!cookie) {
    const error = new Error("Missing seller.ozon.ru Cookie. Copy it from the logged-in seller page Network request.");
    error.statusCode = 400;
    throw error;
  }

  const started = Date.now();
  const upstreamResponse = await fetch(url, {
    method,
    headers,
    body: JSON.stringify(body),
  }).catch((error) => {
    const wrapped = new Error(error.message || "fetch failed");
    wrapped.statusCode = 502;
    wrapped.details = {
      name: error.name,
      message: error.message,
      causeCode: error.cause?.code,
      causeMessage: error.cause?.message,
      endpoint,
      host: SELLER_HOST,
    };
    throw wrapped;
  });
  const text = await upstreamResponse.text();
  const responseBody = tryParseJson(text);
  const responseHeaders = {};
  for (const key of ["content-type", "x-o3-trace-id", "x-request-id"]) {
    const value = upstreamResponse.headers.get(key);
    if (value) {
      responseHeaders[key] = value;
    }
  }

  return {
    ok: upstreamResponse.ok,
    status: upstreamResponse.status,
    statusText: upstreamResponse.statusText,
    error: upstreamResponse.ok ? undefined : responseBody?.message || responseBody?.error || `${upstreamResponse.status} ${upstreamResponse.statusText}`,
    durationMs: Date.now() - started,
    endpoint,
    responseHeaders,
    body: responseBody,
  };
}

async function downloadPdfFile(requestBody) {
  const fileUrl = normalizeDownloadUrl(requestBody.url || requestBody.file_url);
  const saveDir = normalizeSaveDir(requestBody.directory || requestBody.saveDir);
  const fileName = sanitizeFileName(requestBody.filename);
  const targetResolved = resolveSafeTarget(saveDir, fileName);

  const headers = {
    Accept: "application/pdf,*/*",
  };
  const clientId = typeof requestBody.clientId === "string" && requestBody.clientId.trim() ? requestBody.clientId.trim() : config.clientId;
  const apiKey = typeof requestBody.apiKey === "string" && requestBody.apiKey.trim() ? requestBody.apiKey.trim() : config.apiKey;
  if ((fileUrl.hostname === "api-seller.ozon.ru" || fileUrl.hostname === "api-seller.ozon.com") && clientId && apiKey) {
    headers["Client-Id"] = clientId;
    headers["Api-Key"] = apiKey;
  }

  const started = Date.now();
  const upstreamResponse = await fetch(fileUrl.toString(), { headers }).catch((error) => {
    const wrapped = new Error(error.message || "fetch failed");
    wrapped.statusCode = 502;
    wrapped.details = {
      name: error.name,
      message: error.message,
      causeCode: error.cause?.code,
      causeMessage: error.cause?.message,
      url: fileUrl.toString(),
    };
    throw wrapped;
  });

  if (!upstreamResponse.ok) {
    const text = await upstreamResponse.text();
    const parsed = tryParseJson(text);
    const error = new Error(parsed?.message || parsed?.error || `PDF download failed: ${upstreamResponse.status} ${upstreamResponse.statusText}`);
    error.statusCode = 502;
    error.details = {
      status: upstreamResponse.status,
      statusText: upstreamResponse.statusText,
      body: parsed,
    };
    throw error;
  }

  const bytes = Buffer.from(await upstreamResponse.arrayBuffer());
  fs.mkdirSync(saveDir, { recursive: true });
  fs.writeFileSync(targetResolved, bytes);

  return {
    ok: true,
    durationMs: Date.now() - started,
    bytes: bytes.length,
    path: targetResolved,
    directory: saveDir,
    filename: fileName,
    contentType: upstreamResponse.headers.get("content-type") || "",
  };
}

function saveBase64File(requestBody) {
  const saveDir = normalizeSaveDir(requestBody.directory || requestBody.saveDir);
  const fileName = sanitizeGenericFileName(requestBody.filename, ".xlsx");
  const targetResolved = resolveSafeTarget(saveDir, fileName);
  const raw = String(requestBody.base64 || requestBody.data || "");
  const base64 = raw.includes(",") ? raw.slice(raw.indexOf(",") + 1) : raw;
  if (!base64.trim()) {
    throw new Error("Missing base64 file data.");
  }
  const bytes = Buffer.from(base64, "base64");
  if (!bytes.length) {
    throw new Error("Decoded file is empty.");
  }
  fs.mkdirSync(saveDir, { recursive: true });
  fs.writeFileSync(targetResolved, bytes);
  return {
    ok: true,
    bytes: bytes.length,
    path: targetResolved,
    directory: saveDir,
    filename: fileName,
  };
}

function serveStatic(request, response) {
  const parsedUrl = new URL(request.url, `http://${request.headers.host}`);
  let pathname = decodeURIComponent(parsedUrl.pathname);
  if (pathname === "/") {
    pathname = "/index.html";
  }

  const target = path.normalize(path.join(PUBLIC_DIR, pathname));
  if (!target.startsWith(PUBLIC_DIR)) {
    sendError(response, 403, "Forbidden.");
    return;
  }

  fs.readFile(target, (error, data) => {
    if (error) {
      sendError(response, 404, "Not found.");
      return;
    }
    response.writeHead(200, {
      "Content-Type": MIME_TYPES[path.extname(target)] || "application/octet-stream",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
    });
    response.end(data);
  });
}

async function route(request, response) {
  const parsedUrl = new URL(request.url, `http://${request.headers.host}`);

  try {
    if (request.method === "OPTIONS") {
      response.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Cache-Control": "no-store",
      });
      response.end();
      return;
    }

    if (request.method === "GET" && parsedUrl.pathname === "/api/health") {
      sendJson(response, 200, { ok: true, config: publicConfig() });
      return;
    }

    if (request.method === "GET" && parsedUrl.pathname === "/api/config") {
      sendJson(response, 200, { ok: true, config: publicConfig() });
      return;
    }

    if (request.method === "POST" && parsedUrl.pathname === "/api/config") {
      const body = await readBody(request);
      if (typeof body.apiHost === "string" && body.apiHost.trim()) {
        config.apiHost = normalizeApiHost(body.apiHost.trim());
      }
      if (typeof body.clientId === "string") {
        config.clientId = body.clientId.trim();
      }
      if (typeof body.apiKey === "string" && !body.apiKey.includes("***")) {
        config.apiKey = body.apiKey.trim();
      }
      if (body.save) {
        saveConfig();
      }
      sendJson(response, 200, { ok: true, config: publicConfig() });
      return;
    }

    if (request.method === "POST" && parsedUrl.pathname === "/api/ozon") {
      const body = await readBody(request);
      const result = await proxyOzon(body);
      sendJson(response, result.ok ? 200 : 502, result);
      return;
    }

    if (request.method === "POST" && parsedUrl.pathname === "/api/performance") {
      const body = await readBody(request);
      const result = await proxyPerformance(body);
      sendJson(response, result.ok ? 200 : 502, result);
      return;
    }

    if (request.method === "POST" && parsedUrl.pathname === "/api/seller-gateway") {
      const body = await readBody(request);
      const result = await proxySellerGateway(body);
      sendJson(response, result.ok ? 200 : 502, result);
      return;
    }

    if (request.method === "POST" && parsedUrl.pathname === "/api/download-pdf") {
      const body = await readBody(request);
      const result = await downloadPdfFile(body);
      sendJson(response, 200, result);
      return;
    }

    if (request.method === "POST" && parsedUrl.pathname === "/api/save-file-base64") {
      const body = await readBody(request);
      const result = saveBase64File(body);
      sendJson(response, 200, result);
      return;
    }

    if (request.method !== "GET") {
      sendError(response, 405, "Method not allowed.");
      return;
    }

    serveStatic(request, response);
  } catch (error) {
    sendError(response, error.statusCode || 400, error.message || "Unexpected error.", error.details);
  }
}

loadConfig();

const server = http.createServer((request, response) => {
  route(request, response);
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Ozon fast supply booking is running at http://127.0.0.1:${PORT}`);
});
