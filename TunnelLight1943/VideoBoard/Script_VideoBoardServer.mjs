import http from "node:http";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn as nodeSpawn } from "node:child_process";
import { VideoNodes } from "./Data_VideoNodes.mjs";

const modulePath = fileURLToPath(import.meta.url);
const videoBoardRoot = path.dirname(modulePath);
const tunnelRoot = path.resolve(videoBoardRoot, "..");
const repositoryRoot = path.resolve(tunnelRoot, "..");

export const HOST = "127.0.0.1";
export const DEFAULT_PORT = 47821;
export const DEFAULT_REFERENCE_ROOT = path.join(videoBoardRoot, "Reference");
export const MAX_BODY_BYTES = 1024 * 1024;
export const PUBLIC_DIRECTOR_ORIGIN = "https://bentleyblanks.github.io";

/**
 * These are deliberately explicit.  The board is a finite prologue edit, not
 * a general-purpose Dreamina proxy, so an arbitrary node id must never become
 * an input to the paid generator.
 */
export const ALLOWED_NODE_IDS = Object.freeze([
  "pro01a", "pro01b",
  "pro02a", "pro02b",
  "pro03a", "pro03b", "pro03c",
  "pro04a", "pro04b",
  "pro05a", "pro05b", "pro05c",
  "pro06a", "pro06b", "pro06c",
  "pro07a", "pro07b",
  "pro08a", "pro08b",
  "pro09a", "pro09b", "pro09c",
  "pro10a", "pro10b",
  "pro11a", "pro11b",
]);

export const ALLOWED_COMMANDS = Object.freeze([
  "image2video",
  "frames2video",
  "multiframe2video",
]);

// Keep this list aligned with the installed CLI help.  A future model must not
// become spendable merely because its name looks plausible.
export const ALLOWED_MODELS = Object.freeze([
  "seedance2.0",
  "seedance2.0fast",
  "seedance2.0_vip",
  "seedance2.0fast_vip",
  "seedance2.0mini",
]);

export const ALLOWED_RESOLUTION = "720p";
export const MIN_DURATION_SECONDS = 4;
export const MAX_DURATION_SECONDS = 15;

const allowedNodeSet = new Set(ALLOWED_NODE_IDS);
const allowedCommandSet = new Set(ALLOWED_COMMANDS);
const allowedModelSet = new Set(ALLOWED_MODELS);
const nodeContracts = new Map(VideoNodes.map((node) => [node.id, Object.freeze({
  command: node.command,
  referenceFiles: Object.freeze([...node.referenceFiles]),
})]));
const validSubmitId = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const MIME_TYPES = Object.freeze({
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".flac": "audio/flac",
});

export class RequestError extends Error {
  constructor(statusCode, message, code = "BAD_REQUEST", details = undefined) {
    super(message);
    this.name = "RequestError";
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

function requestError(statusCode, message, code, details) {
  return new RequestError(statusCode, message, code, details);
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function pick(value, ...keys) {
  for (const key of keys) {
    if (value[key] !== undefined && value[key] !== null) return value[key];
  }
  return undefined;
}

function normalizeReferences(value) {
  if (typeof value === "string") return [value];
  if (!Array.isArray(value)) {
    throw requestError(400, "referenceFiles must be an array of paths", "INVALID_REFERENCES");
  }
  if (value.some((item) => typeof item !== "string")) {
    throw requestError(400, "referenceFiles must contain only strings", "INVALID_REFERENCES");
  }
  return [...value];
}

function normalizeDuration(value) {
  const duration = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  if (!Number.isInteger(duration) || duration < MIN_DURATION_SECONDS || duration > MAX_DURATION_SECONDS) {
    throw requestError(
      400,
      `duration must be an integer from ${MIN_DURATION_SECONDS} to ${MAX_DURATION_SECONDS} seconds`,
      "INVALID_DURATION",
    );
  }
  return duration;
}

/**
 * Validate and normalize the small JSON contract used by the VideoBoard UI.
 * Unknown properties are ignored, but every property that reaches Dreamina
 * comes from one of the explicit allow-lists below.
 */
export function validateGenerateRequest(input) {
  if (!isRecord(input)) throw requestError(400, "request body must be a JSON object", "INVALID_JSON");

  const nodeId = pick(input, "nodeId", "id");
  if (typeof nodeId !== "string" || !allowedNodeSet.has(nodeId)) {
    throw requestError(400, "unknown VideoBoard node id", "UNKNOWN_NODE", { nodeId });
  }

  const command = pick(input, "command", "generationMode", "mode");
  if (typeof command !== "string" || !allowedCommandSet.has(command)) {
    throw requestError(400, "unsupported Dreamina video command", "UNKNOWN_COMMAND", { command });
  }

  const model = pick(input, "model", "modelVersion", "model_version");
  if (typeof model !== "string" || !allowedModelSet.has(model)) {
    throw requestError(400, "unsupported Seedance model", "UNKNOWN_MODEL", { model });
  }

  const resolution = pick(input, "resolution", "videoResolution", "video_resolution");
  if (resolution !== ALLOWED_RESOLUTION) {
    throw requestError(400, "only 720p generation is allowed", "INVALID_RESOLUTION", { resolution });
  }

  const duration = normalizeDuration(pick(input, "duration", "generationDuration", "generation_duration"));
  const prompt = pick(input, "prompt", "workingPrompt", "actionPrompt", "action_prompt");
  if (typeof prompt !== "string" || prompt.trim().length === 0 || prompt.length > 20000 || prompt.includes("\0")) {
    throw requestError(400, "prompt must be a non-empty string of at most 20,000 characters", "INVALID_PROMPT");
  }

  const references = normalizeReferences(
    pick(input, "referenceFiles", "references", "referencePaths", "referencePath"),
  );
  const expectedReferenceCount = command === "image2video" ? 1 : command === "frames2video" ? 2 : null;
  if (expectedReferenceCount !== null && references.length !== expectedReferenceCount) {
    throw requestError(
      400,
      `${command} requires exactly ${expectedReferenceCount} reference image${expectedReferenceCount === 1 ? "" : "s"}`,
      "INVALID_REFERENCE_COUNT",
    );
  }
  if (command === "multiframe2video" && (references.length < 2 || references.length > 20)) {
    throw requestError(400, "multiframe2video requires 2 to 20 reference images", "INVALID_REFERENCE_COUNT");
  }

  const nodeContract = nodeContracts.get(nodeId);
  if (!nodeContract || nodeContract.command !== command) {
    throw requestError(400, "generation command does not match the selected story asset", "NODE_CONTRACT_MISMATCH", {
      nodeId,
      expectedCommand: nodeContract?.command,
      command,
    });
  }
  if (references.length !== nodeContract.referenceFiles.length
    || references.some((reference, index) => reference !== nodeContract.referenceFiles[index])) {
    throw requestError(400, "reference assets do not match the selected story asset", "NODE_REFERENCE_MISMATCH", {
      nodeId,
      expectedReferences: nodeContract.referenceFiles,
      references,
    });
  }

  const rawTimelineDuration = pick(input, "timelineDuration", "timeline_duration");
  const timelineDuration = rawTimelineDuration === undefined ? duration : Number(rawTimelineDuration);
  if (!Number.isFinite(timelineDuration) || timelineDuration < 0.5 || timelineDuration > MAX_DURATION_SECONDS) {
    throw requestError(400, "timelineDuration must be from 0.5 to 15 seconds", "INVALID_TIMELINE_DURATION");
  }
  if (duration < timelineDuration) {
    throw requestError(400, "generation duration cannot be shorter than the timeline segment", "GENERATION_TOO_SHORT", {
      duration,
      timelineDuration,
    });
  }

  const transitionPrompts = pick(input, "transitionPrompts", "transition_prompts");
  const transitionDurations = pick(input, "transitionDurations", "transition_durations");
  if (transitionPrompts !== undefined && (!Array.isArray(transitionPrompts) || transitionPrompts.some((item) => typeof item !== "string"))) {
    throw requestError(400, "transitionPrompts must be an array of strings", "INVALID_TRANSITIONS");
  }
  if (transitionDurations !== undefined && (!Array.isArray(transitionDurations) || transitionDurations.some((item) => !Number.isFinite(Number(item))))) {
    throw requestError(400, "transitionDurations must be an array of numbers", "INVALID_TRANSITIONS");
  }

  return Object.freeze({
    nodeId,
    command,
    model,
    resolution,
    duration,
    timelineDuration,
    prompt,
    references,
    transitionPrompts: transitionPrompts ? [...transitionPrompts] : undefined,
    transitionDurations: transitionDurations ? [...transitionDurations] : undefined,
    confirmCredits: input.confirmCredits === true,
  });
}

function isWithinRoot(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative !== "" && relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function rejectDotSegments(reference) {
  const segments = reference.replaceAll("\\", "/").split("/");
  if (segments.some((segment) => segment === "..")) {
    throw requestError(400, "reference path traversal is not allowed", "REFERENCE_PATH_TRAVERSAL");
  }
}

/** Resolve existing reference files and prove that symlinks stay in the root. */
export async function resolveReferencePaths(referenceRoot, references) {
  const root = path.resolve(referenceRoot);
  let realRoot;
  try {
    realRoot = await fsp.realpath(root);
  } catch {
    throw requestError(400, "configured reference root does not exist", "REFERENCE_ROOT_MISSING");
  }

  const resolved = [];
  for (const reference of references) {
    if (typeof reference !== "string" || reference.length === 0 || reference.includes("\0")) {
      throw requestError(400, "reference path must be a non-empty string", "INVALID_REFERENCE_PATH");
    }
    rejectDotSegments(reference);
    const candidate = path.resolve(realRoot, reference);
    if (!isWithinRoot(realRoot, candidate)) {
      throw requestError(400, "reference path must stay inside the configured reference root", "REFERENCE_PATH_TRAVERSAL");
    }
    let realCandidate;
    try {
      realCandidate = await fsp.realpath(candidate);
    } catch {
      throw requestError(400, `reference file not found: ${reference}`, "REFERENCE_NOT_FOUND");
    }
    if (!isWithinRoot(realRoot, realCandidate)) {
      throw requestError(400, "reference path resolves outside the configured reference root", "REFERENCE_PATH_TRAVERSAL");
    }
    const stat = await fsp.stat(realCandidate);
    if (!stat.isFile()) throw requestError(400, `reference is not a file: ${reference}`, "INVALID_REFERENCE_PATH");
    resolved.push(realCandidate);
  }
  return resolved;
}

function pushFlag(args, name, value) {
  args.push(name, String(value));
}

/** Build argv without ever concatenating a shell command. */
export function buildDreaminaArgs(request, resolvedReferences) {
  const args = [request.command];
  if (request.command === "image2video") {
    pushFlag(args, "--image", resolvedReferences[0]);
    pushFlag(args, "--prompt", request.prompt);
    pushFlag(args, "--duration", request.duration);
    pushFlag(args, "--video_resolution", request.resolution);
    pushFlag(args, "--model_version", request.model);
  } else if (request.command === "frames2video") {
    pushFlag(args, "--first", resolvedReferences[0]);
    pushFlag(args, "--last", resolvedReferences[1]);
    pushFlag(args, "--prompt", request.prompt);
    pushFlag(args, "--duration", request.duration);
    pushFlag(args, "--video_resolution", request.resolution);
    pushFlag(args, "--model_version", request.model);
  } else {
    // The current CLI intentionally does not expose model/resolution flags for
    // multiframe2video; it infers ratio and uses the backend defaults.  The
    // bridge still validates the requested 720p/Seedance family contract.
    pushFlag(args, "--images", resolvedReferences.join(","));
    if (resolvedReferences.length === 2) {
      pushFlag(args, "--prompt", request.prompt);
      pushFlag(args, "--duration", request.duration);
    } else {
      const prompts = request.transitionPrompts?.length === resolvedReferences.length - 1
        ? request.transitionPrompts
        : resolvedReferences.slice(1).map(() => request.prompt);
      for (const transitionPrompt of prompts) pushFlag(args, "--transition-prompt", transitionPrompt);
      if (request.transitionDurations?.length === resolvedReferences.length - 1) {
        for (const transitionDuration of request.transitionDurations) pushFlag(args, "--transition-duration", transitionDuration);
      }
    }
  }
  return args;
}

function findNestedValue(value, names) {
  if (Array.isArray(value)) {
    for (const item of value) {
      const result = findNestedValue(item, names);
      if (result !== undefined) return result;
    }
    return undefined;
  }
  if (!isRecord(value)) return undefined;
  for (const name of names) {
    if (value[name] !== undefined && value[name] !== null) return value[name];
  }
  for (const child of Object.values(value)) {
    const result = findNestedValue(child, names);
    if (result !== undefined) return result;
  }
  return undefined;
}

function parseNestedJson(value) {
  if (isRecord(value) || Array.isArray(value)) return value;
  if (typeof value !== "string") return undefined;
  const text = value.trim();
  if (!text.startsWith("{") && !text.startsWith("[")) return undefined;
  try { return JSON.parse(text); } catch { return undefined; }
}

/** Flatten the media fields the browser needs while retaining the raw payload. */
export function extractDreaminaMedia(payload) {
  const resultJson = parseNestedJson(findNestedValue(payload, ["result_json", "resultJson"]));
  const sources = [payload, resultJson].filter((value) => value !== undefined);
  const find = (names) => {
    for (const source of sources) {
      const value = findNestedValue(source, names);
      if (typeof value === "string" && value.trim()) return value.trim();
    }
    return undefined;
  };
  const localUrl = find(["local_url", "localUrl"]);
  const videoUrl = find(["video_url", "videoUrl", "download_url", "downloadUrl", "file_url", "fileUrl"]);
  const outputFile = find(["output_file", "outputFile", "local_path", "localPath"]);
  return {
    local_url: localUrl,
    video_url: videoUrl,
    output_file: outputFile,
    media: {
      url: localUrl || videoUrl,
      local: Boolean(localUrl || outputFile),
      persisted: Boolean(localUrl || outputFile),
    },
  };
}

function jsonCandidates(raw) {
  const trimmed = raw.trim();
  if (!trimmed) return [];
  const candidates = [];
  try { candidates.push(JSON.parse(trimmed)); } catch { /* try line-delimited output below */ }
  for (const line of trimmed.split(/\r?\n/).reverse()) {
    const text = line.trim();
    if (!text || !/[\[{]/.test(text)) continue;
    try { candidates.push(JSON.parse(text)); } catch { /* CLI log line, not JSON */ }
  }
  return candidates;
}

export function parseDreaminaOutput(stdout = "", stderr = "") {
  const raw = String(stdout ?? "");
  let payload;
  for (const candidate of jsonCandidates(raw)) {
    payload = candidate;
    break;
  }

  let submitId = payload ? findNestedValue(payload, ["submit_id", "submitId"]) : undefined;
  let genStatus = payload ? findNestedValue(payload, ["gen_status", "genStatus", "task_status", "taskStatus"]) : undefined;
  let failReason = payload ? findNestedValue(payload, ["fail_reason", "failReason", "error", "message"]) : undefined;
  if (typeof submitId !== "string") {
    submitId = /(?:submit_id|submitId)\s*[=:]\s*["']?([A-Za-z0-9][A-Za-z0-9_-]{0,127})/i.exec(raw)?.[1];
  }
  if (typeof genStatus !== "string") {
    genStatus = /(?:gen_status|genStatus|task_status|taskStatus)\s*[=:]\s*["']?([A-Za-z_ -]+)/i.exec(raw)?.[1]?.trim();
  }
  if (typeof failReason !== "string") {
    failReason = String(stderr || "").trim() || undefined;
  }
  if (typeof genStatus === "string") genStatus = genStatus.toLowerCase().replace(/\s+/g, "_");
  return {
    submitId: typeof submitId === "string" ? submitId : undefined,
    genStatus: typeof genStatus === "string" ? genStatus : undefined,
    failReason: typeof failReason === "string" ? failReason : undefined,
    payload,
    raw: raw.slice(-32000),
  };
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    request.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(requestError(413, "request body is too large", "BODY_TOO_LARGE"));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on("error", (error) => reject(error));
    request.on("end", () => {
      try {
        const text = Buffer.concat(chunks).toString("utf8");
        resolve(JSON.parse(text));
      } catch {
        reject(requestError(400, "request body must contain valid JSON", "INVALID_JSON"));
      }
    });
  });
}

function sendJson(response, statusCode, value) {
  const body = JSON.stringify(value);
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Content-Length": Buffer.byteLength(body),
  });
  response.end(body);
}

function sendError(response, error) {
  const requestFailure = error instanceof RequestError
    ? error
    : requestError(500, "VideoBoard bridge error", "INTERNAL_ERROR");
  const body = {
    ok: false,
    error: requestFailure.code,
    message: requestFailure.message,
  };
  if (requestFailure.details !== undefined) body.details = requestFailure.details;
  sendJson(response, requestFailure.statusCode, body);
}

function isAllowedOrigin(origin) {
  if (!origin) return true;
  if (origin === PUBLIC_DIRECTOR_ORIGIN) return true;
  try {
    const parsed = new URL(origin);
    return parsed.protocol === "http:" && (parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost");
  } catch {
    return false;
  }
}

function applyApiCors(request, response) {
  const origin = String(request.headers.origin || "");
  if (!isAllowedOrigin(origin)) {
    throw requestError(403, "origin is not allowed to use the local director bridge", "ORIGIN_NOT_ALLOWED", { origin });
  }
  if (origin) {
    response.setHeader("Access-Control-Allow-Origin", origin);
    response.setHeader("Vary", "Origin");
  }
  response.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (String(request.headers["access-control-request-private-network"] || "").toLowerCase() === "true") {
    response.setHeader("Access-Control-Allow-Private-Network", "true");
  }
}

function runDreamina(command, args, spawnImpl, timeoutMs = 120000) {
  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawnImpl(command, args, {
        shell: false,
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (error) {
      reject(error);
      return;
    }
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk) => { stdout += chunk.toString(); });
    child.stderr?.on("data", (chunk) => { stderr += chunk.toString(); });
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try { child.kill?.("SIGTERM"); } catch { /* best effort */ }
      reject(requestError(504, "Dreamina command timed out", "DREAMINA_TIMEOUT"));
    }, timeoutMs);
    const finish = (error, result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolve(result);
    };
    child.once?.("error", (error) => finish(error));
    child.once?.("close", (code, signal) => finish(null, { code, signal, stdout, stderr }));
    // Tiny test doubles sometimes expose only .on rather than .once.
    if (!child.once && child.on) {
      child.on("error", (error) => finish(error));
      child.on("close", (code, signal) => finish(null, { code, signal, stdout, stderr }));
    }
  });
}

function decodePathname(rawPath) {
  try {
    const pathname = decodeURIComponent(rawPath);
    if (pathname.includes("\0")) throw new Error("NUL");
    return pathname;
  } catch {
    throw requestError(400, "malformed URL path", "INVALID_PATH");
  }
}

function staticCandidateFor(pathname, config) {
  const segments = pathname.split("/");
  if (segments.includes("..")) throw requestError(403, "path traversal is not allowed", "PATH_TRAVERSAL");
  if (pathname === "/" || pathname === "/index.html") return path.join(config.videoBoardRoot, "index.html");
  if (pathname === "/VideoBoard" || pathname === "/VideoBoard/") return path.join(config.videoBoardRoot, "index.html");

  if (pathname.startsWith("/TunnelLight1943/VideoBoard/")) {
    return path.join(config.repositoryRoot, pathname.slice("/".length));
  }
  if (pathname.startsWith("/TunnelLight1943/Video/")) {
    return path.join(config.repositoryRoot, pathname.slice("/".length));
  }
  if (pathname.startsWith("/Video/")) return path.join(config.tunnelRoot, "Video", pathname.slice("/Video/".length));
  if (pathname.startsWith("/media/")) return path.join(config.referenceRoot, pathname.slice("/media/".length));
  if (pathname.startsWith("/reference/")) return path.join(config.referenceRoot, pathname.slice("/reference/".length));
  if (pathname.startsWith("/VideoBoard/")) return path.join(config.videoBoardRoot, pathname.slice("/VideoBoard/".length));
  // Convenience for a board opened directly at http://127.0.0.1:47821/.
  return path.join(config.videoBoardRoot, pathname.slice(1));
}

async function resolveStaticFile(pathname, config) {
  const candidate = path.resolve(staticCandidateFor(pathname, config));
  const roots = [config.videoBoardRoot, config.tunnelRoot, config.repositoryRoot, config.referenceRoot]
    .map((root) => path.resolve(root));
  if (!roots.some((root) => candidate === root || isWithinRoot(root, candidate))) {
    throw requestError(403, "static path is outside the allowed roots", "PATH_TRAVERSAL");
  }
  let real;
  try { real = await fsp.realpath(candidate); } catch { return null; }
  if (!roots.some((root) => real === root || isWithinRoot(root, real))) {
    throw requestError(403, "static path resolves outside the allowed roots", "PATH_TRAVERSAL");
  }
  return real;
}

async function serveStatic(request, response, pathname, config) {
  const filePath = await resolveStaticFile(pathname, config);
  if (!filePath) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("Not found");
    return;
  }
  const stat = await fsp.stat(filePath);
  if (!stat.isFile()) {
    response.writeHead(404).end();
    return;
  }
  const baseHeaders = {
    "Content-Type": MIME_TYPES[path.extname(filePath).toLowerCase()] ?? "application/octet-stream",
    "Cache-Control": "no-store",
    "Accept-Ranges": "bytes",
  };
  if (request.method === "HEAD") {
    response.writeHead(200, { ...baseHeaders, "Content-Length": stat.size }).end();
    return;
  }
  const rangeHeader = request.headers.range;
  if (!rangeHeader) {
    response.writeHead(200, { ...baseHeaders, "Content-Length": stat.size });
    fs.createReadStream(filePath).pipe(response);
    return;
  }
  const match = /^bytes=(\d*)-(\d*)$/.exec(String(rangeHeader).trim());
  if (!match) {
    response.writeHead(416, { ...baseHeaders, "Content-Range": `bytes */${stat.size}` }).end();
    return;
  }
  let start = match[1] ? Number(match[1]) : Math.max(0, stat.size - Number(match[2] || 0));
  let end = match[2] ? Number(match[2]) : stat.size - 1;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start > end || start >= stat.size) {
    response.writeHead(416, { ...baseHeaders, "Content-Range": `bytes */${stat.size}` }).end();
    return;
  }
  end = Math.min(end, stat.size - 1);
  response.writeHead(206, {
    ...baseHeaders,
    "Content-Range": `bytes ${start}-${end}/${stat.size}`,
    "Content-Length": end - start + 1,
  });
  fs.createReadStream(filePath, { start, end }).pipe(response);
}

function healthPayload(config) {
  return {
    ok: true,
    service: "TunnelLight1943 AssetDirector bridge",
    host: HOST,
    port: config.port,
    dreaminaCommand: config.dreaminaCommand,
    generationRequiresCreditConfirmation: true,
    allowedCommands: ALLOWED_COMMANDS,
    allowedModels: ALLOWED_MODELS,
    allowedResolution: ALLOWED_RESOLUTION,
  };
}

async function handleGenerate(request, response, config, tasks) {
  const body = await readJsonBody(request);
  const normalized = validateGenerateRequest(body);
  const resolvedReferences = await resolveReferencePaths(config.referenceRoot, normalized.references);
  if (!normalized.confirmCredits) {
    sendJson(response, 409, {
      ok: false,
      error: "CREDITS_CONFIRMATION_REQUIRED",
      requiresConfirmation: true,
      confirmCredits: false,
      creditWarning: "Dreamina video generation consumes credits. Resubmit this exact request with confirmCredits:true to submit one task.",
      nodeId: normalized.nodeId,
      command: normalized.command,
      model: normalized.model,
      resolution: normalized.resolution,
      duration: normalized.duration,
    });
    return;
  }

  const args = buildDreaminaArgs(normalized, resolvedReferences);
  let result;
  try {
    result = await runDreamina(config.dreaminaCommand, args, config.spawnImpl, config.generationTimeoutMs);
  } catch (error) {
    sendError(response, error);
    return;
  }
  const parsed = parseDreaminaOutput(result.stdout, result.stderr);
  if (result.code !== 0) {
    sendJson(response, 502, {
      ok: false,
      error: "DREAMINA_SUBMIT_FAILED",
      message: parsed.failReason || result.stderr || `dreamina exited with code ${result.code}`,
      gen_status: parsed.genStatus,
      raw: parsed.raw,
    });
    return;
  }
  if (!parsed.submitId || !validSubmitId.test(parsed.submitId)) {
    sendJson(response, 502, { ok: false, error: "DREAMINA_INVALID_RESPONSE", message: "Dreamina response did not contain a valid submit_id", raw: parsed.raw });
    return;
  }
  if (!parsed.genStatus || !["querying", "success"].includes(parsed.genStatus)) {
    sendJson(response, 502, {
      ok: false,
      error: parsed.genStatus === "fail" ? "DREAMINA_SUBMIT_FAILED" : "DREAMINA_INVALID_RESPONSE",
      message: parsed.failReason || "Dreamina response did not contain gen_status querying or success",
      submit_id: parsed.submitId,
      gen_status: parsed.genStatus,
      raw: parsed.raw,
    });
    return;
  }
  tasks.set(parsed.submitId, { nodeId: normalized.nodeId, command: normalized.command, createdAt: Date.now() });
  const statusCode = parsed.genStatus === "success" ? 200 : 202;
  const media = extractDreaminaMedia(parsed.payload);
  sendJson(response, statusCode, {
    ok: true,
    submit_id: parsed.submitId,
    submitId: parsed.submitId,
    gen_status: parsed.genStatus,
    genStatus: parsed.genStatus,
    ...media,
    result: parsed.payload,
  });
}

async function handleTask(response, config, submitId) {
  if (!validSubmitId.test(submitId)) {
    sendJson(response, 400, { ok: false, error: "INVALID_SUBMIT_ID", message: "invalid Dreamina submit_id" });
    return;
  }
  let result;
  try {
    result = await runDreamina(config.dreaminaCommand, ["query_result", "--submit_id", submitId], config.spawnImpl, config.generationTimeoutMs);
  } catch (error) {
    sendError(response, error);
    return;
  }
  const parsed = parseDreaminaOutput(result.stdout, result.stderr);
  if (result.code !== 0) {
    sendJson(response, 502, {
      ok: false,
      error: "DREAMINA_QUERY_FAILED",
      message: parsed.failReason || result.stderr || `dreamina exited with code ${result.code}`,
      submit_id: submitId,
      gen_status: parsed.genStatus,
      raw: parsed.raw,
    });
    return;
  }
  const status = parsed.genStatus || "querying";
  const media = extractDreaminaMedia(parsed.payload);
  sendJson(response, 200, {
    ok: status !== "fail",
    submit_id: parsed.submitId || submitId,
    submitId: parsed.submitId || submitId,
    gen_status: status,
    genStatus: status,
    ...media,
    result: parsed.payload,
    fail_reason: parsed.failReason,
  });
}

async function handleRequest(request, response, config, tasks) {
  let url;
  try { url = new URL(request.url, `http://${HOST}`); } catch { sendJson(response, 400, { ok: false, error: "INVALID_URL" }); return; }
  let pathname;
  try { pathname = decodePathname(url.pathname); } catch (error) { sendError(response, error); return; }

  try {
    if (pathname.startsWith("/api/")) {
      applyApiCors(request, response);
      if (request.method === "OPTIONS") {
        response.writeHead(204).end();
        return;
      }
    }
    if (pathname === "/api/health") {
      if (request.method !== "GET") { response.writeHead(405, { Allow: "GET" }).end(); return; }
      sendJson(response, 200, healthPayload(config));
      return;
    }
    if (pathname === "/api/generate") {
      if (request.method !== "POST") { response.writeHead(405, { Allow: "POST" }).end(); return; }
      await handleGenerate(request, response, config, tasks);
      return;
    }
    if (pathname.startsWith("/api/task/")) {
      if (request.method !== "GET") { response.writeHead(405, { Allow: "GET" }).end(); return; }
      const submitId = pathname.slice("/api/task/".length);
      if (!submitId || submitId.includes("/")) { sendJson(response, 400, { ok: false, error: "INVALID_SUBMIT_ID" }); return; }
      await handleTask(response, config, submitId);
      return;
    }
    if (request.method !== "GET" && request.method !== "HEAD") {
      response.writeHead(405, { Allow: "GET, HEAD" }).end();
      return;
    }
    await serveStatic(request, response, pathname, config);
  } catch (error) {
    sendError(response, error);
  }
}

function makeConfig(options = {}) {
  const configuredReferenceRoot = options.referenceRoot
    ?? process.env.VIDEO_BOARD_REFERENCE_ROOT
    ?? process.env.TUNNEL_LIGHT_REFERENCE_ROOT
    ?? DEFAULT_REFERENCE_ROOT;
  const configuredDreaminaCommand = options.dreaminaCommand
    ?? process.env.DREAMINA_COMMAND
    ?? "dreamina";
  return Object.freeze({
    port: Number.isInteger(options.port) ? options.port : Number(process.env.VIDEO_BOARD_PORT || DEFAULT_PORT),
    host: HOST,
    videoBoardRoot: path.resolve(options.videoBoardRoot ?? videoBoardRoot),
    tunnelRoot: path.resolve(options.tunnelRoot ?? tunnelRoot),
    repositoryRoot: path.resolve(options.repositoryRoot ?? repositoryRoot),
    referenceRoot: path.resolve(configuredReferenceRoot),
    dreaminaCommand: String(configuredDreaminaCommand),
    spawnImpl: options.spawnImpl ?? nodeSpawn,
    generationTimeoutMs: Number.isFinite(options.generationTimeoutMs) ? options.generationTimeoutMs : 120000,
  });
}

export function createVideoBoardServer(options = {}) {
  const config = makeConfig(options);
  if (config.port < 0 || config.port > 65535) throw new Error("port must be between 0 and 65535");
  const tasks = new Map();
  const server = http.createServer((request, response) => {
    handleRequest(request, response, config, tasks).catch((error) => sendError(response, error));
  });
  server.videoBoardConfig = config;
  server.videoBoardTasks = tasks;
  return server;
}

export function startVideoBoardServer(options = {}) {
  const server = createVideoBoardServer(options);
  const port = server.videoBoardConfig.port;
  return new Promise((resolve, reject) => {
    const onError = (error) => { server.removeListener("listening", onListening); reject(error); };
    const onListening = () => { server.removeListener("error", onError); resolve(server); };
    server.once("error", onError);
    server.once("listening", onListening);
    // The host is intentionally hard-coded.  A caller cannot turn this paid
    // local bridge into a network-facing proxy by passing an option.
    server.listen(port, HOST);
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === modulePath) {
  const portArg = process.argv[2] === undefined ? DEFAULT_PORT : Number(process.argv[2]);
  startVideoBoardServer({ port: portArg }).then((server) => {
    const address = server.address();
    console.log(`TunnelLight1943 VideoBoard bridge: http://${HOST}:${address.port}/`);
    console.log("Dreamina submission requires POST /api/generate with confirmCredits:true.");
  }).catch((error) => {
    console.error(error?.message || error);
    process.exitCode = 1;
  });
}
