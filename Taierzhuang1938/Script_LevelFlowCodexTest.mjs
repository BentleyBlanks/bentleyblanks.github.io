import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import http from "node:http";
import { EventEmitter, once } from "node:events";
import { PassThrough } from "node:stream";
import { randomUUID } from "node:crypto";
import { CreateEncounterCodexHandler } from "../scripts/Script_EncounterCodexServer.mjs";
import { CreateFramePacket } from "./AdvancedTools/Script_LevelFlowDocument.mjs";
import { DEFAULT_ENCOUNTER_DOCUMENT, EvaluateFlow } from "./AdvancedTools/Script_LevelFlowModel.mjs";

const directory = fs.mkdtempSync(path.join(os.tmpdir(), "EncounterCodexTest-"));
const children = [];
const handler = CreateEncounterCodexHandler(directory, { spawnCodex(args, root) {
  assert.equal(root, directory);
  const child = new EventEmitter();
  child.stdin = new PassThrough(); child.stdout = new PassThrough(); child.stderr = new PassThrough();
  child.prompt = "";
  child.stdin.on("data", chunk => { child.prompt += chunk.toString(); });
  child.args = args;
  children.push(child);
  return child;
} });
const server = http.createServer(handler);
server.listen(0, "127.0.0.1"); await once(server, "listening");
const base = `http://127.0.0.1:${server.address().port}/__encounter/codex`;
const snapshot = CreateFramePacket(DEFAULT_ENCOUNTER_DOCUMENT, EvaluateFlow(384), { center: [20, 30], scale: 2 }, { width: 640, height: 360 });
const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aM1sAAAAASUVORK5CYII=";
const body = { requestId: randomUUID(), prompt: "调整所选区域", frame: snapshot, location: { timeline: { timeSeconds: 384 }, selection: { id: "Fork" } }, screenshot: { image: png, frame: snapshot } };
async function Post(value, headers = {}) {
  return fetch(`${base}/turns`, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(value) });
}
function Finish(child, text, code = 0) {
  const output = child.args[child.args.indexOf("--output-last-message") + 1];
  if (text) fs.writeFileSync(output, text);
  child.emit("close", code);
}
try {
  assert.equal((await Post(body, { Origin: "https://example.com" })).status, 403);
  assert.equal((await Post({ ...body, screenshot: { image: "invalid" } })).status, 400);
  assert.equal((await Post({ ...body, frame: {} })).status, 400);
  assert.equal((await Post({ ...body, prompt: "" })).status, 400);
  assert.equal(children.length, 0);
  const response = await Post(body); assert.equal(response.status, 202);
  let session = await response.json();
  assert.equal(session.status, "running");
  assert.equal(session.messages[0].frame.time, 384);
  assert.equal(children.length, 1);
  const retried = await (await Post(body)).json();
  assert.equal(retried.id, session.id); assert.equal(children.length, 1);
  const first = children[0];
  assert.ok(first.args.includes("--image"));
  assert.ok(first.prompt.includes("Frame.json") && first.prompt.includes("Location.json"));
  assert.equal((await Post({ ...body, requestId: randomUUID(), sessionId: session.id })).status, 409);
  const privateReasoning = "private reasoning must stay out of chat";
  first.stdout.write(`${JSON.stringify({ type: "thread.started", thread_id: "01a1d446-7900-7781-9cc4-00ad3a768caf" })}\n`);
  first.stdout.write(`${JSON.stringify({ type: "item.completed", item: { type: "reasoning", text: privateReasoning } })}\n`);
  Finish(first, "已完成调整，验证通过。");
  session = await (await fetch(`${base}/sessions/${session.id}`)).json();
  assert.equal(session.status, "completed");
  assert.equal(session.messages[1].text, "已完成调整，验证通过。");
  assert.ok(!JSON.stringify(session).includes(privateReasoning));
  const attachment = await fetch(`http://127.0.0.1:${server.address().port}${session.messages[0].screenshotUrl}`);
  assert.equal(attachment.headers.get("content-type"), "image/png");
  assert.deepEqual(Buffer.from(await attachment.arrayBuffer()), Buffer.from(png.split(",")[1], "base64"));
  const secondBody = { ...body, requestId: randomUUID(), sessionId: session.id, prompt: "继续调整", screenshot: null,
    frame: { ...snapshot, context: { ...snapshot.context, time: 400 } } };
  session = await (await Post(secondBody)).json();
  assert.equal(children.length, 2);
  assert.deepEqual(children[1].args.slice(0, 3), ["exec", "resume", session.cliSessionId]);
  assert.ok(!children[1].args.includes("--image"));
  assert.equal(session.messages[2].frame.time, 400);
  const privateDiagnostic = "provider=https://private-provider.invalid/path Authorization=Bearer FAKE_PRIVATE_CREDENTIAL";
  children[1].stderr.write(privateDiagnostic);
  children[1].stdout.write(`${JSON.stringify({ type: "error", message: privateDiagnostic })}\n`);
  Finish(children[1], "", 1);
  session = await (await fetch(`${base}/sessions/${session.id}`)).json();
  assert.equal(session.status, "failed"); assert.match(session.error, /请在本机 CLI 检查/);
  assert.ok(!JSON.stringify(session).includes("private-provider"));
  assert.ok(!JSON.stringify(session).includes("FAKE_PRIVATE_CREDENTIAL"));
  const sessionFile = path.join(directory, "tmp", "EncounterCodex", session.id, "Session.json");
  assert.ok(!fs.readFileSync(sessionFile, "utf8").includes("FAKE_PRIVATE_CREDENTIAL"));
  assert.equal(session.messages.length, 3);
  const history = await (await fetch(`${base}/sessions`)).json();
  assert.equal(history.sessions.length, 1); assert.equal(history.sessions[0].id, session.id);
  assert.ok(!JSON.stringify(history).includes("messages"));
  const restarted = CreateEncounterCodexHandler(directory);
  const oldSession = JSON.parse(fs.readFileSync(sessionFile, "utf8"));
  oldSession.error = privateDiagnostic;
  fs.writeFileSync(sessionFile, JSON.stringify(oldSession));
  server.removeAllListeners("request"); server.on("request", restarted);
  const restored = await (await fetch(`${base}/sessions/${session.id}`)).json();
  assert.equal(restored.messages.length, 3);
  assert.ok(!JSON.stringify(restored).includes("private-provider"));
  assert.ok(!fs.readFileSync(sessionFile, "utf8").includes("FAKE_PRIVATE_CREDENTIAL"));
  console.log("ok  Encounter Codex bridge: same-origin gate, frame/image attachments, final-only replies, resume, concurrent rejection and persisted history");
} finally {
  server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
  assert.equal(path.dirname(directory), path.resolve(os.tmpdir()));
  fs.rmSync(directory, { recursive: true, force: true });
}
