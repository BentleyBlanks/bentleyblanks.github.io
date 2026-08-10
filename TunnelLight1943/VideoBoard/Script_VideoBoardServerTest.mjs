import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  buildDreaminaArgs,
  extractDreaminaMedia,
  resolveReferencePaths,
  startVideoBoardServer,
  validateGenerateRequest,
} from "./Script_VideoBoardServer.mjs";

const temporaryRoot = await fsp.mkdtemp(path.join(os.tmpdir(), "tunnel-light-video-board-test-"));
const boardRoot = path.join(temporaryRoot, "TunnelLight1943", "VideoBoard");
const tunnelRoot = path.join(temporaryRoot, "TunnelLight1943");
const repoRoot = temporaryRoot;
const referenceRoot = path.join(temporaryRoot, "references");
await fsp.mkdir(boardRoot, { recursive: true });
await fsp.mkdir(path.join(tunnelRoot, "Video"), { recursive: true });
await fsp.mkdir(referenceRoot, { recursive: true });
await fsp.writeFile(path.join(boardRoot, "index.html"), "<!doctype html><title>VideoBoard test</title>");
for (const fileName of ["Texture_ReferencePro01.png", "Texture_ReferencePro11FamilyCorrected.png", "Texture_ReferencePro11B.png"]) {
  await fsp.writeFile(path.join(referenceRoot, fileName), "reference");
}
await fsp.writeFile(path.join(tunnelRoot, "Video", "Pro_01.mp4"), "video");

const spawnCalls = [];
function fakeSpawn(command, args, options) {
  spawnCalls.push({ command, args: [...args], options: { ...options } });
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  process.nextTick(() => {
    const isQuery = args[0] === "query_result";
    const submitId = isQuery ? args[2] : "test-submit-001";
    child.stdout.emit("data", JSON.stringify({
      submit_id: submitId,
      gen_status: isQuery ? "success" : "querying",
      ...(isQuery ? { result_json: JSON.stringify({ videos: [{ video_url: "https://media.example/test-submit-001.mp4" }] }) } : {}),
    }));
    child.emit("close", 0, null);
  });
  return child;
}

const server = await startVideoBoardServer({
  port: 0,
  videoBoardRoot: boardRoot,
  tunnelRoot,
  repositoryRoot: repoRoot,
  referenceRoot,
  dreaminaCommand: "dreamina-test-double",
  spawnImpl: fakeSpawn,
  generationTimeoutMs: 5000,
});
const address = server.address();
assert.ok(address && typeof address === "object");
const baseUrl = `http://127.0.0.1:${address.port}`;

async function request(route, options = {}) {
  const response = await fetch(`${baseUrl}${route}`, options);
  const text = await response.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text; }
  return { response, body };
}

function payload(overrides = {}) {
  return {
    nodeId: "pro01a",
    command: "image2video",
    model: "seedance2.0_vip",
    resolution: "720p",
    duration: 4,
    timelineDuration: 3,
    prompt: "固定机位；旧纸纹和墨线只做轻微自然动作。",
    referenceFiles: ["Texture_ReferencePro01.png"],
    confirmCredits: false,
    ...overrides,
  };
}

try {
  // Health and static serving stay local and do not invoke Dreamina.
  const health = await request("/api/health");
  assert.equal(health.response.status, 200);
  assert.equal(health.body.ok, true);
  assert.equal(health.body.host, "127.0.0.1");
  const preflight = await request("/api/generate", {
    method: "OPTIONS",
    headers: {
      origin: "https://bentleyblanks.github.io",
      "access-control-request-method": "POST",
      "access-control-request-private-network": "true",
    },
  });
  assert.equal(preflight.response.status, 204);
  assert.equal(preflight.response.headers.get("access-control-allow-origin"), "https://bentleyblanks.github.io");
  assert.equal(preflight.response.headers.get("access-control-allow-private-network"), "true");
  const rejectedOrigin = await request("/api/health", { headers: { origin: "https://attacker.invalid" } });
  assert.equal(rejectedOrigin.response.status, 403);
  assert.equal(rejectedOrigin.body.error, "ORIGIN_NOT_ALLOWED");
  const page = await request("/");
  assert.equal(page.response.status, 200);
  assert.match(String(page.body), /VideoBoard test/);
  const media = await request("/TunnelLight1943/Video/Pro_01.mp4");
  assert.equal(media.response.status, 200);

  // Confirmation is a hard gate: no child process starts before the warning.
  const warning = await request("/api/generate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload()),
  });
  assert.equal(warning.response.status, 409);
  assert.equal(warning.body.requiresConfirmation, true);
  assert.match(warning.body.creditWarning, /consumes credits/i);
  assert.equal(spawnCalls.length, 0);

  // Path traversal is rejected before the process boundary, including an
  // otherwise valid, explicitly confirmed request.
  const traversal = await request("/api/generate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload({ referenceFiles: ["../secret.png"], confirmCredits: true })),
  });
  assert.equal(traversal.response.status, 400);
  assert.equal(traversal.body.error, "NODE_REFERENCE_MISMATCH");
  assert.equal(spawnCalls.length, 0);
  await assert.rejects(
    resolveReferencePaths(referenceRoot, ["../secret.png"]),
    (error) => error?.code === "REFERENCE_PATH_TRAVERSAL",
  );

  const unknownNode = await request("/api/generate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload({ nodeId: "pro99z", confirmCredits: true })),
  });
  assert.equal(unknownNode.response.status, 400);
  assert.equal(unknownNode.body.error, "UNKNOWN_NODE");

  const unknownModel = await request("/api/generate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload({ model: "seedance1.5pro", confirmCredits: true })),
  });
  assert.equal(unknownModel.response.status, 400);
  assert.equal(unknownModel.body.error, "UNKNOWN_MODEL");
  const unavailableFutureModel = await request("/api/generate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload({ model: "seedance2.5_vip", confirmCredits: true })),
  });
  assert.equal(unavailableFutureModel.response.status, 400);
  assert.equal(unavailableFutureModel.body.error, "UNKNOWN_MODEL");
  const mismatchedCommand = await request("/api/generate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload({ command: "frames2video", referenceFiles: ["Texture_ReferencePro01.png", "Texture_ReferencePro01.png"], confirmCredits: true })),
  });
  assert.equal(mismatchedCommand.response.status, 400);
  assert.equal(mismatchedCommand.body.error, "NODE_CONTRACT_MISMATCH");
  const shortGeneration = await request("/api/generate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload({ duration: 4, timelineDuration: 5, confirmCredits: true })),
  });
  assert.equal(shortGeneration.response.status, 400);
  assert.equal(shortGeneration.body.error, "GENERATION_TOO_SHORT");

  // A confirmed request uses an argv array.  Shell metacharacters remain one
  // prompt argument and cannot become a second command.
  const maliciousPrompt = "safe prompt; whoami && echo injected";
  const submitted = await request("/api/generate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload({ prompt: maliciousPrompt, confirmCredits: true })),
  });
  assert.equal(submitted.response.status, 202);
  assert.equal(submitted.body.submit_id, "test-submit-001");
  assert.equal(spawnCalls.length, 1);
  assert.equal(spawnCalls[0].command, "dreamina-test-double");
  assert.equal(spawnCalls[0].options.shell, false);
  const promptFlag = spawnCalls[0].args.indexOf("--prompt");
  assert.ok(promptFlag >= 0);
  assert.equal(spawnCalls[0].args[promptFlag + 1], maliciousPrompt);

  const query = await request("/api/task/test-submit-001");
  assert.equal(query.response.status, 200);
  assert.equal(query.body.submit_id, "test-submit-001");
  assert.equal(query.body.gen_status, "success");
  assert.equal(query.body.video_url, "https://media.example/test-submit-001.mp4");
  assert.equal(query.body.media.url, "https://media.example/test-submit-001.mp4");
  assert.equal(spawnCalls.length, 2);
  assert.deepEqual(spawnCalls[1].args, ["query_result", "--submit_id", "test-submit-001"]);
  const invalidTask = await request("/api/task/test-submit-001%3Bwhoami");
  assert.equal(invalidTask.response.status, 400);
  assert.equal(spawnCalls.length, 2);

  // Keep the pure command/validation surface covered for the two multi-frame
  // modes without invoking a real paid command.
  const framesRequest = validateGenerateRequest(payload({
    nodeId: "pro11b",
    command: "frames2video",
    duration: 6,
    timelineDuration: 6,
    referenceFiles: ["Texture_ReferencePro11FamilyCorrected.png", "Texture_ReferencePro11B.png"],
    confirmCredits: true,
  }));
  assert.deepEqual(buildDreaminaArgs(framesRequest, ["C:/safe/first.png", "C:/safe/last.png"]).slice(0, 5), [
    "frames2video", "--first", "C:/safe/first.png", "--last", "C:/safe/last.png",
  ]);
  assert.throws(() => validateGenerateRequest(payload({
    command: "multiframe2video",
    referenceFiles: ["Texture_ReferencePro01.png", "Texture_ReferencePro01.png"],
    confirmCredits: true,
  })), (error) => error?.code === "NODE_CONTRACT_MISMATCH");
  const multiRequest = {
    command: "multiframe2video",
    prompt: "固定机位",
    duration: 4,
    references: ["a.png", "b.png"],
  };
  assert.equal(buildDreaminaArgs(multiRequest, ["C:/safe/a.png", "C:/safe/b.png"])[0], "multiframe2video");
  assert.equal(extractDreaminaMedia({ result_json: JSON.stringify({ videos: [{ video_url: "https://media.example/nested.mp4" }] }) }).video_url, "https://media.example/nested.mp4");

  console.log("VideoBoard server tests: PASS");
} finally {
  await new Promise((resolve) => server.close(resolve));
  await fsp.rm(temporaryRoot, { recursive: true, force: true });
}
