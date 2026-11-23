import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import http from "node:http";
import { EventEmitter, once } from "node:events";
import { PassThrough } from "node:stream";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { CreateEncounterCodexHandler } from "../scripts/Script_EncounterCodexServer.mjs";
import { CreateSteerableCodexChild } from "../scripts/Script_EncounterCodexRunner.mjs";
import { AntigravityCommand, CreateAntigravityChild, CreateDevinChild, ParseModelList } from "../scripts/Script_EncounterAgentProviders.mjs";
import { CreateLegacyProgressReader } from "../scripts/Script_EncounterCodexProgress.mjs";
import { CreateReloadableEncounterCodexHandler } from "../scripts/Script_LocalPreviewRuntime.mjs";
import { LoadPreviewModules } from "../scripts/Script_PreviewModules.mjs";
import { CreateFramePacket } from "./AdvancedTools/Script_LevelFlowDocument.mjs";
import { DEFAULT_ENCOUNTER_DOCUMENT, EvaluateFlow } from "./AdvancedTools/Script_LevelFlowModel.mjs";
import { CreateUnitsAttachment } from "./AdvancedTools/Script_LevelFlowUnits.mjs";

const directory = fs.mkdtempSync(path.join(os.tmpdir(), "EncounterCodexTest-"));
const children = [];
const realChildren = [], ready = [];
const stopped = [];
let stopFailure = false;
const state = {};
const handler = CreateEncounterCodexHandler(directory, { state, spawnCodex(args, root) {
  assert.equal(root, directory);
  const child = new EventEmitter();
  child.pid = process.pid;
  child.stdin = new PassThrough(); child.stdout = new PassThrough(); child.stderr = new PassThrough();
  child.prompt = "";
  child.steered = [];
  child.steer = async (prompt, image) => { child.steered.push({ prompt, image }); };
  child.stdin.on("data", chunk => { child.prompt += chunk.toString(); });
  child.args = args;
  children.push(child);
  return child;
}, stopCodex(child) {
  if (stopFailure) throw new Error("test stop failure");
  stopped.push(child);
  (children.includes(child) ? child : children.at(-1)).emit("close", 130);
} });
const server = http.createServer(handler);
server.listen(0, "127.0.0.1"); await once(server, "listening");
const base = `http://127.0.0.1:${server.address().port}/__encounter/codex`;
const snapshot = CreateFramePacket(DEFAULT_ENCOUNTER_DOCUMENT, EvaluateFlow(384), { center: [20, 30], scale: 2 }, { width: 640, height: 360 });
const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aM1sAAAAASUVORK5CYII=";
snapshot.context.viewports = { count: 1, active: 0, views: [{ type: "chase", mode: "follow", center: [20, 30],
  scale: 2, followZoom: 0.419, yaw: 0, pitch: 0.67, target: "player", viewport: { width: 640, height: 360 } }] };
snapshot.screenshot = { version: 1, width: 640, height: 360, image: png,
  marks: [{ kind: "brush", a: [10, 20], b: [30, 40], points: [[10, 20], [30, 40]], text: "" }] };
// Match the JSON payload sent over HTTP, including omitted optional fields.
const unitSnapshot = JSON.parse(JSON.stringify(CreateUnitsAttachment(EvaluateFlow(221), { mapData: { source: { scene: "FirstLevelWhitebox" }, terrain: { heightAt: () => 2 } } }, ["player", "Fork_0"], DEFAULT_ENCOUNTER_DOCUMENT)));
const body = { requestId: randomUUID(), prompt: "调整所选区域", frame: snapshot, units: unitSnapshot, location: { timeline: { timeSeconds: 384 }, selection: { id: "Fork" } }, screenshot: { image: png, frame: snapshot } };
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
  const invalidFrame = await Post({ ...body, frame: {} });
  assert.equal(invalidFrame.status, 400);
  assert.match((await invalidFrame.json()).error, /定位附件无效.*文件中没有可回放的帧定位/);
  const invalidScreenshotFrame = await Post({ ...body, screenshot: { image: png, frame: {} } });
  assert.equal(invalidScreenshotFrame.status, 400);
  assert.match((await invalidScreenshotFrame.json()).error, /截图定位无效.*文件中没有可回放的帧定位/);
  assert.equal((await Post({ ...body, prompt: "" })).status, 400);
  for (const units of [{}, { ...unitSnapshot, units: [] }, { ...unitSnapshot, units: [unitSnapshot.units[0], unitSnapshot.units[0]] },
    { ...unitSnapshot, units: [{ ...unitSnapshot.units[0], position: { x: null, y: 0, z: 0 } }] }]) {
    assert.equal((await Post({ ...body, units })).status, 400);
  }
  assert.equal(children.length, 0);
  const response = await Post(body); assert.equal(response.status, 202);
  let session = await response.json();
  assert.equal(session.status, "running");
  assert.equal(session.progress.phase, "preparing");
  assert.equal(session.messages[0].frame.time, 384);
  assert.equal(children.length, 1);
  const retried = await (await Post(body)).json();
  assert.equal(retried.id, session.id); assert.equal(children.length, 1);
  const first = children[0];
  assert.ok(first.args.includes("--image"));
  assert.ok(first.prompt.includes("Frame.json") && first.prompt.includes("Location.json"));
  assert.match(first.prompt, /Units.json/);
  assert.deepEqual(session.messages[0].units, unitSnapshot);
  const unitsResponse = await fetch(`http://127.0.0.1:${server.address().port}${session.messages[0].unitsUrl}`);
  assert.equal(unitsResponse.status, 200);
  assert.deepEqual(await unitsResponse.json(), unitSnapshot);
  const concurrentReader = CreateEncounterCodexHandler(directory);
  server.removeAllListeners("request"); server.on("request", concurrentReader);
  assert.equal((await (await fetch(`${base}/sessions/${session.id}`)).json()).status, "running", "another preview keeps a live owner's run active");
  assert.equal((await Post({ ...body, requestId: randomUUID(), sessionId: session.id })).status, 409, "another preview rejects a second run in a live session");
  const liveFile = path.join(directory, "tmp", "EncounterCodex", session.id, "Session.json");
  fs.writeFileSync(liveFile, JSON.stringify({ ...session, status: "failed", error: "本地服务已重启，上次执行已中断。可继续发送需求。" }));
  assert.equal((await (await fetch(`${base}/sessions/${session.id}`)).json()).status, "running", "a live owner recovers an older preview's incorrect interruption flag");
  server.removeAllListeners("request"); server.on("request", CreateEncounterCodexHandler(directory, { state }));
  const steerBody = { ...body, requestId: randomUUID(), sessionId: session.id, prompt: "执行中补充，保留附件定位" };
  const [steered, duplicate] = await Promise.all([Post(steerBody), Post(steerBody)]);
  assert.equal(steered.status, 202); assert.equal(duplicate.status, 202);
  assert.equal(children.length, 1); assert.equal(first.steered.length, 1);
  assert.match(first.steered[0].prompt, /执行中补充，保留附件定位/);
  assert.match(first.steered[0].prompt, /Units.json/);
  assert.ok(first.steered[0].image.endsWith("Screenshot.png"));
  assert.equal((await Post(steerBody)).status, 202, "route upgrades keep the active child and request deduplication state");
  assert.equal(children.length, 1);
  server.removeAllListeners("request"); server.on("request", handler);
  const privateReasoning = "private reasoning must stay out of chat";
  first.stdout.write(`${JSON.stringify({ type: "thread.started", thread_id: "01a1d446-7900-7781-9cc4-00ad3a768caf" })}\n`);
  first.stdout.write(`${JSON.stringify({ type: "progress", activity: "正在验证路线", text: "已定位到路线问题，正在修复并验证。", model: "gpt-6.1-sol", effort: "high" })}\n`);
  const progress = await (await fetch(`${base}/sessions/${session.id}`)).json();
  assert.equal(progress.progress.text, "已定位到路线问题，正在修复并验证。");
  assert.equal(progress.progress.phase, "running", "older runner activity events leave preparation");
  assert.equal(progress.model, "gpt-6.1-sol"); assert.equal(progress.effort, "high");
  const sessionUrl = `${base}/sessions/${session.id}`;
  const beforeDelete = fs.readFileSync(liveFile, "utf8");
  server.removeAllListeners("request"); server.on("request", concurrentReader);
  assert.equal((await fetch(sessionUrl, { method: "DELETE", headers: { Origin: "https://example.com" } })).status, 403);
  const deleted = await (await fetch(sessionUrl, { method: "DELETE" })).json();
  assert.ok(deleted.deletedAt);
  assert.equal((await (await fetch(sessionUrl, { method: "DELETE" })).json()).deletedAt, deleted.deletedAt);
  assert.equal(fs.readFileSync(liveFile, "utf8"), beforeDelete, "deleting only changes separate list metadata");
  assert.equal(stopped.length, 0, "deleting keeps the running CLI active");
  const deletedHistory = await (await fetch(`${base}/sessions`)).json();
  assert.equal(deletedHistory.sessions.length, 0);
  assert.equal(deletedHistory.deletedSessions[0].id, session.id);
  assert.equal((await Post({ requestId: randomUUID(), sessionId: session.id, prompt: "先还原" })).status, 409);
  server.removeAllListeners("request"); server.on("request", handler);
  first.stdout.write(`${JSON.stringify({ type: "item.completed", item: { type: "reasoning", text: privateReasoning } })}\n`);
  Finish(first, "已完成调整，验证通过。");
  session = await (await fetch(`${base}/sessions/${session.id}`)).json();
  assert.equal(session.status, "completed");
  assert.equal(session.deletedAt, deleted.deletedAt, "runner completion preserves the deletion marker");
  server.removeAllListeners("request"); server.on("request", CreateEncounterCodexHandler(directory));
  assert.equal((await (await fetch(`${base}/sessions`)).json()).deletedSessions[0].id, session.id, "deletion survives bridge restarts");
  const undeleted = await (await fetch(`${sessionUrl}/restore`, { method: "POST" })).json();
  assert.equal(undeleted.deletedAt, null);
  assert.equal(undeleted.cliSessionId, session.cliSessionId);
  assert.deepEqual(undeleted.messages, session.messages);
  assert.equal((await fetch(`${sessionUrl}/restore`, { method: "POST" })).status, 200, "restore is retryable");
  assert.equal((await fetch(`${base}/sessions/${randomUUID()}`, { method: "DELETE" })).status, 404);
  server.removeAllListeners("request"); server.on("request", handler);
  assert.equal(session.messages[2].text, "已完成调整，验证通过。");
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
  assert.equal(session.messages[3].frame.time, 400);
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
  assert.equal(session.messages.length, 4);
  const history = await (await fetch(`${base}/sessions`)).json();
  assert.equal(history.sessions.length, 1); assert.equal(history.sessions[0].id, session.id);
  assert.ok(!JSON.stringify(history).includes("messages"));
  const restarted = CreateEncounterCodexHandler(directory);
  const oldSession = JSON.parse(fs.readFileSync(sessionFile, "utf8"));
  oldSession.error = privateDiagnostic;
  fs.writeFileSync(sessionFile, JSON.stringify(oldSession));
  server.removeAllListeners("request"); server.on("request", restarted);
  const restored = await (await fetch(`${base}/sessions/${session.id}`)).json();
  assert.deepEqual(restored.messages[0].units, unitSnapshot);
  assert.equal(restored.messages.length, 4);
  assert.ok(!JSON.stringify(restored).includes("private-provider"));
  assert.ok(!fs.readFileSync(sessionFile, "utf8").includes("FAKE_PRIVATE_CREDENTIAL"));
  server.removeAllListeners("request"); server.on("request", handler);
  const plainBody = { requestId: randomUUID(), prompt: "只发文字" };
  assert.equal((await Post({ ...plainBody, location: { timeline: {} } })).status, 400);
  const plainResponse = await Post(plainBody);
  assert.equal(plainResponse.status, 202);
  const plainSession = await plainResponse.json();
  assert.equal(plainSession.messages[0].frame, undefined);
  assert.equal(plainSession.messages[0].locationUrl, undefined);
  const plainChild = children.at(-1);
  assert.ok(!plainChild.prompt.includes("Frame.json"));
  Finish(plainChild, "收到。");
  const imageResponse = await Post({ ...plainBody, requestId: randomUUID(), screenshot: body.screenshot });
  assert.equal(imageResponse.status, 202);
  const imageSession = await imageResponse.json();
  assert.equal(imageSession.messages[0].frame, undefined);
  assert.equal(imageSession.messages[0].screenshotFrame.time, 384);
  assert.ok(children.at(-1).prompt.includes("ScreenshotFrame.json"));
  Finish(children.at(-1), "已查看截图。");
  const unitsOnly = await (await Post({ ...plainBody, requestId: randomUUID(), units: unitSnapshot })).json();
  assert.equal(unitsOnly.messages[0].frame, undefined);
  assert.deepEqual(unitsOnly.messages[0].units, unitSnapshot);
  assert.match(children.at(-1).prompt, /Units.json/);
  Finish(children.at(-1), "已查看单位。");
  const interruptedFile = path.join(directory, "tmp", "EncounterCodex", plainSession.id, "Session.json");
  const interrupted = JSON.parse(fs.readFileSync(interruptedFile, "utf8"));
  interrupted.status = "running"; interrupted.runnerPid = 2147483647;
  fs.writeFileSync(interruptedFile, JSON.stringify(interrupted));
  assert.equal((await (await fetch(`${base}/sessions/${plainSession.id}`)).json()).status, "failed", "a stopped owner is detected");
  delete interrupted.runnerPid;
  fs.writeFileSync(interruptedFile, JSON.stringify(interrupted));
  assert.equal((await (await fetch(`${base}/sessions/${plainSession.id}`)).json()).status, "running", "a legacy run with unknown ownership is preserved");
  const cancelResponse = await Post({ requestId: randomUUID(), prompt: "需要中断的任务" });
  const cancelSession = await cancelResponse.json();
  const interruptUrl = `${base}/sessions/${cancelSession.id}/interrupt`;
  assert.equal((await fetch(interruptUrl, { method: "POST", headers: { Origin: "https://example.com" } })).status, 403);
  stopFailure = true;
  assert.equal((await fetch(interruptUrl, { method: "POST" })).status, 400);
  assert.equal((await (await fetch(`${base}/sessions/${cancelSession.id}`)).json()).status, "running");
  stopFailure = false;
  const canceled = await (await fetch(interruptUrl, { method: "POST" })).json();
  assert.equal(canceled.status, "interrupted");
  assert.equal(canceled.error, "");
  assert.equal(canceled.messages[0].text, "需要中断的任务");
  assert.equal(stopped.length, 1);
  await fetch(interruptUrl, { method: "POST" });
  assert.equal(stopped.length, 1, "repeated interruption is idempotent");
  const continued = await (await Post({ sessionId: cancelSession.id, requestId: randomUUID(), prompt: "继续处理" })).json();
  assert.equal(continued.status, "running");
  Finish(children.at(-1), "继续处理完成。");
  assert.equal((await (await fetch(`${base}/sessions/${cancelSession.id}`)).json()).status, "completed", "a past interruption does not cancel the next turn");
  const realHandler = CreateEncounterCodexHandler(directory, { spawnCodex() {
    const code = "const {spawn}=require('node:child_process');const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'});console.log(JSON.stringify({pid:child.pid}));process.stdin.resume();setInterval(()=>{},1000);";
    const child = spawn(process.execPath, ["-e", code], { windowsHide: true, detached: process.platform !== "win32", stdio: ["pipe", "pipe", "pipe"] });
    ready.push(new Promise(resolve => child.stdout.once("data", data => resolve(JSON.parse(data.toString()).pid))));
    realChildren.push(child);
    return child;
  } });
  server.removeAllListeners("request"); server.on("request", realHandler);
  const realSession = await (await Post({ requestId: randomUUID(), prompt: "test process interruption" })).json();
  const firstDescendant = await ready[0];
  const sibling = await (await Post({ requestId: randomUUID(), prompt: "test sibling isolation" })).json();
  const secondDescendant = await ready[1];
  const realInterrupt = await fetch(`${base}/sessions/${realSession.id}/interrupt`, { method: "POST" });
  assert.equal(realInterrupt.status, 202);
  assert.equal((await (await fetch(`${base}/sessions/${realSession.id}`)).json()).status, "interrupted");
  assert.throws(() => process.kill(realChildren[0].pid, 0), "the interrupted CLI wrapper has exited");
  assert.throws(() => process.kill(firstDescendant, 0), "the interrupted CLI descendant has exited");
  assert.doesNotThrow(() => process.kill(realChildren[1].pid, 0), "another session's wrapper keeps running");
  assert.doesNotThrow(() => process.kill(secondDescendant, 0), "another session's descendant keeps running");
  const legacyFile = path.join(directory, "tmp", "EncounterCodex", realSession.id, "Session.json");
  const legacyCompletion = JSON.parse(fs.readFileSync(legacyFile, "utf8"));
  legacyCompletion.status = "failed";
  legacyCompletion.error = "Codex 执行失败，请在本机 CLI 检查登录和网络后重试";
  delete legacyCompletion.cliPid;
  fs.writeFileSync(legacyFile, JSON.stringify(legacyCompletion));
  assert.equal((await (await fetch(`${base}/sessions/${realSession.id}`)).json()).status, "interrupted", "the interruption receipt survives an older owner's completion callback");
  await fetch(`${base}/sessions/${sibling.id}/interrupt`, { method: "POST" });
  console.log("ok  Encounter Codex bridge: same-origin gate, attachments, final replies, resume, concurrent rejection, interrupt/retry/continue and isolated CLI process-tree termination");
  server.removeAllListeners("request"); server.on("request", handler);
  const legacySession = await (await Post({ requestId: randomUUID(), prompt: "旧版执行中的任务" })).json();
  const legacyChild = children.at(-1);
  delete legacyChild.steer;
  legacyChild.stdout.write(`${JSON.stringify({ type: "thread.started", thread_id: "legacy-thread" })}\n`);
  const migrated = await (await Post({ requestId: randomUUID(), sessionId: legacySession.id, steer: true, prompt: "执行中修正方向" })).json();
  assert.equal(migrated.status, "running"); assert.equal(migrated.messages.length, 2);
  assert.ok(stopped.includes(legacyChild));
  assert.deepEqual(children.at(-1).args.slice(0, 3), ["exec", "resume", "legacy-thread"]);
  assert.match(children.at(-1).prompt, /执行中修正方向/);
  Finish(children.at(-1), "已按补充要求处理。");
  await TestAppServerSteering(directory);
  TestLegacyProgress(directory);
  await TestLegacyRecovery(directory, server, base);
  await TestAgentProviders(directory, server, base);
  await TestRouteReload(directory);
  await TestValidationReload(directory);
  console.log("ok  Encounter Codex bridge: same-origin gate, attachments, final-only replies, resume, live steering, idempotent retries and persisted history");
} finally {
  for (const child of realChildren) {
    if (child.exitCode !== null) continue;
    try {
      if (process.platform === "win32") {
        const killer = spawn("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
        await once(killer, "close");
      } else process.kill(-child.pid, "SIGKILL");
    } catch { /* The test process may have finished between the exit check and cleanup. */ }
  }
  server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
  assert.equal(path.dirname(directory), path.resolve(os.tmpdir()));
  fs.rmSync(directory, { recursive: true, force: true });
}

async function TestValidationReload(directory) {
  const root = path.join(directory, "ValidationReload");
  fs.mkdirSync(root, { recursive: true });
  const entry = path.join(root, "Reader.mjs"), dependency = path.join(root, "Validator.mjs");
  const tuning = path.join(root, "Limits.mjs");
  fs.writeFileSync(entry, 'export { Validate } from "./Validator.mjs";');
  fs.writeFileSync(dependency, 'import { limit } from "./Limits.mjs"; export function Validate() { return limit; }');
  fs.writeFileSync(tuning, "export const limit = 1;");
  const [original] = await LoadPreviewModules([entry]);
  assert.equal(original.Validate(), 1);
  fs.writeFileSync(tuning, "export const limit = 320;");
  const [updated] = await LoadPreviewModules([entry]);
  assert.equal(updated.Validate(), 320, "a transitive dependency refreshes without restarting the preview");
  assert.equal(original.Validate(), 1, "existing readers retain their coherent revision");
  assert.equal((await LoadPreviewModules([entry]))[0], updated, "unchanged sources reuse the loaded modules");
  fs.writeFileSync(tuning, "export const limit = ;");
  await assert.rejects(LoadPreviewModules([entry]), SyntaxError);
  fs.writeFileSync(tuning, "export const limit = 640;");
  assert.equal((await LoadPreviewModules([entry]))[0].Validate(), 640, "a repaired dependency loads on the next request");
}

async function TestRouteReload(directory) {
  const root = path.join(directory, "ReloadablePreview");
  const file = path.join(root, "scripts", "Script_EncounterCodexServer.mjs");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  function WriteVersion(version) {
    fs.writeFileSync(file, `
      export function CreateEncounterCodexHandler(root, { state }) {
        state.active.set("loads", (state.active.get("loads") || 0) + 1);
        return (request, response) => {
          if (request.method === "POST") state.submissions.set("pending", "live request");
          response.writeHead(${version === 1 ? 404 : 200}, { "Content-Type": "application/json" });
          response.end(JSON.stringify({ version: ${version}, loads: state.active.get("loads"), pending: state.submissions.get("pending") }));
        };
      }
    `);
  }
  WriteVersion(1);
  const state = { active: new Map([["live child", "retained"]]), submissions: new Map() };
  const preview = http.createServer(CreateReloadableEncounterCodexHandler(root, { state }));
  preview.listen(0, "127.0.0.1"); await once(preview, "listening");
  const url = `http://127.0.0.1:${preview.address().port}/__encounter/codex/sessions/${randomUUID()}`;
  try {
    assert.equal((await fetch(url, { method: "POST" })).status, 404);
    WriteVersion(2);
    const responses = await Promise.all([fetch(url, { method: "DELETE" }), fetch(url, { method: "DELETE" })]);
    for (const response of responses) {
      assert.equal(response.status, 200, "a new deletion route loads on the existing preview port");
      assert.deepEqual(await response.json(), { version: 2, loads: 2, pending: "live request" }, "concurrent requests share one upgrade and retain live state");
    }
    fs.writeFileSync(file, "export function {");
    assert.equal((await fetch(url)).status, 503, "an incomplete source update returns a retryable error");
    WriteVersion(3);
    assert.deepEqual(await (await fetch(url)).json(), { version: 3, loads: 3, pending: "live request" }, "a repaired update recovers on the same port with its state intact");
    assert.equal(state.active.get("live child"), "retained", "an existing preview can hand its live children into the reloadable bridge");
    assert.equal(state.submissions.get("pending"), "live request");
  } finally {
    preview.closeAllConnections(); await new Promise(resolve => preview.close(resolve));
  }
}

async function TestAppServerSteering(directory) {
  const requests = [];
  const server = new EventEmitter();
  server.stdin = new PassThrough(); server.stdout = new PassThrough(); server.stderr = new PassThrough();
  server.kill = () => { server.emit("close", 0); };
  server.stdin.on("finish", () => server.emit("close", 0));
  const Emit = value => server.stdout.write(`${JSON.stringify(value)}\n`);
  let turnCount = 0, pendingSteer;
  server.stdin.on("data", data => {
    for (const line of data.toString().trim().split("\n")) {
      const request = JSON.parse(line); requests.push(request);
      if (request.id == null) continue;
      setImmediate(() => {
        if (request.method === "turn/steer" && request.params.input[0].text === "completion race") { pendingSteer = request; return; }
        let result = {};
        if (request.method === "thread/start") result = { thread: { id: "thread-test" } };
        if (request.method === "turn/start") {
          const turn = { id: `turn-${++turnCount}` };
          result = { turn };
          setImmediate(() => Emit({ method: "turn/started", params: { threadId: "thread-test", turn } }));
        }
        Emit({ id: request.id, result });
      });
    }
  });
  const output = path.join(directory, "AppServerConclusion.txt");
  const child = CreateSteerableCodexChild(["exec", "--output-last-message", output, "--image", "Original.png", "-"], directory, { spawnAppServer: () => server });
  const errors = []; child.on("error", error => errors.push(error));
  let visibleOutput = ""; child.stdout.on("data", chunk => { visibleOutput += chunk; });
  child.stdin.end("original request");
  await Promise.all([child.steer("live correction", "Revised.png"), child.steer("another correction")]);
  assert.deepEqual(visibleOutput.trim().split("\n").map(line => JSON.parse(line)).filter(event => event.phase).map(event => event.phase),
    ["preparing", "running"], "the runner reports preparation before the turn starts");
  const starts = requests.filter(request => request.method === "turn/start");
  assert.equal(starts.length, 1); assert.equal(starts[0].params.input[1].path, "Original.png");
  assert.equal(starts[0].params.model, "gpt-6.1-sol"); assert.equal(starts[0].params.effort, "high");
  const steers = requests.filter(request => request.method === "turn/steer");
  assert.equal(steers.length, 2); assert.equal(steers[0].params.expectedTurnId, "turn-1");
  assert.equal(steers[0].params.input[1].path, "Revised.png");
  const raced = child.steer("completion race");
  while (!pendingSteer) await new Promise(resolve => setImmediate(resolve));
  Emit({ method: "turn/completed", params: { threadId: "thread-test", turn: { id: "turn-1", status: "completed" } } });
  Emit({ id: pendingSteer.id, error: { message: "No active turn" } });
  await raced;
  assert.equal(turnCount, 2);
  assert.equal(requests.filter(request => request.method === "thread/start").length, 1);
  for (const [type, phase, text] of [["reasoning", null, "hidden"], ["agentMessage", "commentary", "progress"], ["agentMessage", "final_answer", "steered result"]]) {
    Emit({ method: "item/completed", params: { threadId: "thread-test", turnId: "turn-2", item: { id: text, type, phase, text } } });
  }
  assert.ok(visibleOutput.includes('"text":"progress"')); assert.ok(!visibleOutput.includes("hidden"));
  const finished = once(child, "close");
  Emit({ method: "turn/completed", params: { threadId: "thread-test", turn: { id: "turn-2", status: "completed" } } });
  assert.deepEqual(await finished, [0]); assert.deepEqual(errors, []);
  assert.equal(fs.readFileSync(output, "utf8"), "steered result");
}

function TestLegacyProgress(directory) {
  const cliSessionId = randomUUID();
  const day = path.join(directory, "Rollouts", "2026", "11", "14");
  fs.mkdirSync(day, { recursive: true });
  const file = path.join(day, `rollout-test-${cliSessionId}.jsonl`);
  const Event = (type, payload) => `${JSON.stringify({ type, timestamp: "2026-11-13T16:30:00Z", payload })}\n`;
  fs.writeFileSync(file, Event("turn_context", { model: "legacy-model", effort: "high" })
    + Event("response_item", { type: "message", role: "assistant", phase: "commentary", content: [{ type: "output_text", text: "已找到问题，正在验证修复。" }] })
    + Event("response_item", { type: "reasoning", content: [{ text: "hidden reasoning" }] }));
  const ReadProgress = CreateLegacyProgressReader(path.join(directory, "Rollouts"));
  const session = { cliSessionId, createdAt: "2026-11-13T16:23:00Z" };
  assert.equal(ReadProgress(session).progress.text, "已找到问题，正在验证修复。");
  assert.equal(ReadProgress(session).model, "legacy-model");
  fs.appendFileSync(file, "x".repeat(300000) + "\n" + Event("response_item", {
    type: "message", role: "assistant", phase: "commentary", content: [{ type: "output_text", text: "回归检查已完成，正在整理结果。" }],
  }));
  const result = ReadProgress(session);
  assert.equal(result.progress.text, "回归检查已完成，正在整理结果。");
  assert.ok(!JSON.stringify(result).includes("hidden reasoning"));
  fs.appendFileSync(file, Event("event_msg", { type: "task_complete", last_agent_message: "旧任务已完成。" }));
  assert.equal(ReadProgress(session).completion.text, "旧任务已完成。");
  assert.equal(ReadProgress({ ...session, messages: [{ role: "user", createdAt: "2026-11-14T01:00:00Z" }] }).completion, undefined, "a resumed request never inherits the previous turn's completion");
  fs.appendFileSync(file, Event("event_msg", { type: "task_started" }));
  assert.equal(ReadProgress(session).completion, undefined, "a newer running turn clears an older completion");
}

async function TestLegacyRecovery(directory, server, base) {
  const id = randomUUID(), cliSessionId = randomUUID();
  const sessionFile = path.join(directory, "tmp", "EncounterCodex", id, "Session.json");
  fs.mkdirSync(path.dirname(sessionFile), { recursive: true });
  const session = { id, cliSessionId, title: "旧进程残留", status: "running", runnerPid: process.pid,
    createdAt: "2026-11-14T01:00:00Z", updatedAt: "2026-11-14T01:00:00Z",
    messages: [{ role: "user", text: "原始需求", createdAt: "2026-11-14T01:00:00Z" }] };
  fs.writeFileSync(sessionFile, JSON.stringify(session));
  const rollout = path.join(directory, "Rollouts", "2026", "11", "14", `rollout-recovery-${cliSessionId}.jsonl`);
  const Event = (timestamp, type, payload) => `${JSON.stringify({ timestamp, type, payload })}\n`;
  fs.writeFileSync(rollout, Event("2026-11-14T01:01:00Z", "response_item", {
    type: "message", role: "assistant", phase: "commentary", content: [{ type: "output_text", text: "正在核对修复。" }],
  }));
  const reader = CreateLegacyProgressReader(path.join(directory, "Rollouts"));
  server.removeAllListeners("request"); server.on("request", CreateEncounterCodexHandler(directory, { readLegacyProgress: reader }));
  const Read = async () => (await fetch(`${base}/sessions/${id}`)).json();
  assert.equal((await Read()).progress.text, "正在核对修复。");
  fs.appendFileSync(rollout, Event("2026-11-14T01:02:00Z", "response_item", {
    type: "message", role: "assistant", phase: "commentary", content: [{ type: "output_text", text: "验证结束。" }],
  }));
  assert.equal((await Read()).progress.text, "验证结束。", "legacy progress keeps updating across polls");
  fs.appendFileSync(rollout, Event("2026-11-14T01:03:00Z", "event_msg", { type: "task_complete", last_agent_message: "修复已交付。" }));
  const recovered = await Read();
  assert.equal(recovered.status, "completed", "task completion is recovered even while the old owner is alive");
  assert.equal(recovered.messages.at(-1).text, "修复已交付。");
  assert.equal(recovered.updatedAt, "2026-11-14T01:03:00Z");
  assert.equal((await Read()).messages.length, 2, "repeated polling never duplicates the final reply");
  assert.equal(JSON.parse(fs.readFileSync(sessionFile)).status, "completed");
  assert.equal((await (await fetch(`${base}/sessions`)).json()).sessions.find(item => item.id === id).status, "completed");
  fs.writeFileSync(sessionFile, JSON.stringify({ ...session, status: "failed", error: "Codex 执行失败，请在本机 CLI 检查登录和网络后重试" }));
  assert.equal((await Read()).status, "completed", "a late legacy process exit cannot overwrite recorded success");
  fs.writeFileSync(sessionFile, JSON.stringify({ ...session, messages: [...recovered.messages, { role: "user", text: "继续修改", createdAt: "2026-11-14T02:00:00Z" }] }));
  assert.equal((await Read()).status, "running", "a new request stays active until its own completion");
}

function FakeProcess() {
  const proc = new EventEmitter();
  proc.pid = process.pid;
  proc.stdin = new PassThrough(); proc.stdout = new PassThrough(); proc.stderr = new PassThrough();
  return proc;
}

async function TestAgentProviders(directory, server, base) {
  const spawned = [];
  const catalog = [
    { id: "codex", label: "Codex", available: true, error: "", models: [{ id: "gpt-6.1-sol", label: "gpt-6.1-sol", efforts: ["low", "high"], defaultEffort: "high" }], defaultModel: "gpt-6.1-sol", defaultEffort: "high" },
    { id: "devin", label: "Devin", available: true, error: "", models: [{ id: "claude-opus-5-5", label: "claude-opus-5-5", efforts: ["high", "xhigh"], defaultEffort: "high" }], defaultModel: "claude-opus-5-5", defaultEffort: "high" },
  ];
  server.removeAllListeners("request");
  server.on("request", CreateEncounterCodexHandler(directory, { loadCatalog: async () => catalog, spawnCodex(args, root, options) {
    const child = FakeProcess(); child.args = args; child.options = options; spawned.push(child); return child;
  }, stopCodex(child) { child.emit("close", 130); } }));
  assert.deepEqual((await (await fetch(`${base}/providers`)).json()).providers, catalog);
  const Turn = value => fetch(`${base}/turns`, { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ requestId: randomUUID(), prompt: "用 Devin 调整", ...value }) });
  assert.equal((await Turn({ provider: "other" })).status, 400);
  assert.equal((await Turn({ provider: "devin", model: "bad model" })).status, 400);
  assert.equal((await Turn({ provider: "devin", effort: "HIGH!" })).status, 400);
  const started = await (await Turn({ provider: "devin", model: "claude-opus-5-5", effort: "xhigh" })).json();
  assert.equal(started.provider, "devin"); assert.equal(started.model, "claude-opus-5-5"); assert.equal(started.effort, "xhigh");
  assert.deepEqual(spawned[0].options, { provider: "devin", model: "claude-opus-5-5", effort: "xhigh" });
  assert.match(started.progress.activity, /Devin/);
  assert.equal((await Turn({ sessionId: started.id, provider: "devin", steer: true })).status, 409, "print-mode providers reject live steering");
  spawned[0].stdout.write(`${JSON.stringify({ type: "thread.started", thread_id: "opaque-alibi" })}\n`);
  await new Promise(resolve => setImmediate(resolve));
  fs.writeFileSync(spawned[0].args[spawned[0].args.indexOf("--output-last-message") + 1], "Devin 已完成");
  spawned[0].emit("close", 0);
  const done = await (await fetch(`${base}/sessions/${started.id}`)).json();
  assert.equal(done.status, "completed"); assert.equal(done.messages.at(-1).text, "Devin 已完成");
  assert.equal((await (await fetch(`${base}/sessions`)).json()).sessions.find(item => item.id === started.id).provider, "devin");
  assert.equal((await Turn({ sessionId: started.id, provider: "codex" })).status, 400, "a session keeps its provider");
  const resumed = await (await Turn({ sessionId: started.id, provider: "devin", model: "claude-sonnet-5-5", effort: "high" })).json();
  assert.deepEqual(spawned[1].args.slice(0, 3), ["exec", "resume", "opaque-alibi"]);
  assert.equal(spawned[1].options.model, "claude-sonnet-5-5"); assert.equal(resumed.model, "claude-sonnet-5-5");
  spawned[1].emit("close", 1);
  assert.equal((await (await fetch(`${base}/sessions/${started.id}`)).json()).error, "Devin 执行失败，请在本机 CLI 检查登录和网络后重试");

  assert.deepEqual(ParseModelList("gemini-4-neon-xhigh   Gemini 4 Neon (XHigh)\ngemini-4-neon-high   Gemini 4 Neon (High)\nfusion-claude-opus-5-5-high-sidekick-claude-sonnet-5-5-medium  Fusion\n"), [
    { id: "gemini-4-neon", label: "Gemini 4 Neon", efforts: ["high", "xhigh"], defaultEffort: "high" },
    { id: "fusion-claude-opus-5-5-high-sidekick-claude-sonnet-5-5-medium", label: "Fusion", efforts: [], defaultEffort: "" },
  ]);

  const folder = fs.mkdtempSync(path.join(directory, "Devin-"));
  const devinOutput = path.join(folder, "Conclusion.txt");
  let devinArgs;
  const devin = CreateDevinChild(["exec", "resume", "opaque-alibi", "--json", "--output-last-message", devinOutput, "--image", "Shot.png", "-"], directory, {
    model: "claude-opus-5-5", effort: "high", command: "devin.exe", spawnCli(command, args) {
      devinArgs = args;
      const proc = FakeProcess();
      setImmediate(() => {
        proc.stdout.write("正在修改");
        fs.writeFileSync(path.join(folder, "Export.json"), JSON.stringify({ session_id: "opaque-alibi", steps: [{ source: "user", message: "需求" }, { source: "agent", message: "Devin 结论" }] }));
        proc.emit("close", 0);
      });
      return proc;
    } });
  const devinClosed = once(devin, "close");
  devin.stdin.end("需求");
  assert.deepEqual(await devinClosed, [0]);
  assert.equal(fs.readFileSync(devinOutput, "utf8"), "Devin 结论");
  assert.equal(devinArgs[devinArgs.indexOf("--model") + 1], "claude-opus-5-5-high");
  assert.equal(devinArgs[devinArgs.indexOf("-r") + 1], "opaque-alibi");
  assert.equal(devinArgs[devinArgs.indexOf("--permission-mode") + 1], "dangerous");
  assert.match(fs.readFileSync(path.join(folder, "Prompt.txt"), "utf8"), /需求[\s\S]*Shot\.png/);

  const agyOutput = path.join(folder, "Agy.txt");
  let agyArgs, agyInput = "";
  const agy = CreateAntigravityChild(["exec", "--json", "--output-last-message", agyOutput, "-"], directory, {
    model: "gemini-4-neon", effort: "xhigh", command: "agy.exe", spawnCli(command, args) {
      agyArgs = args;
      const proc = FakeProcess();
      proc.stdin.on("data", chunk => { agyInput += chunk; });
      proc.stdin.on("finish", () => proc.emit("close", 0));
      setImmediate(() => {
        for (const event of [{ event: "init", conversation_id: "conv-1" }, { event: "step_update", step_update: { step_type: "run_command", state: "ACTIVE" } },
          { event: "step_update", step_update: { step_type: "agent_response", state: "DONE", text_delta: "部分" } },
          { event: "result", result: { status: "SUCCESS", response: "Agy 结论" } }]) proc.stdout.write(`${JSON.stringify(event)}\n`);
      });
      return proc;
    } });
  let agyVisible = ""; agy.stdout.on("data", chunk => { agyVisible += chunk; });
  const agyClosed = once(agy, "close");
  agy.stdin.end("需求二");
  assert.deepEqual(await agyClosed, [0]);
  assert.equal(fs.readFileSync(agyOutput, "utf8"), "Agy 结论");
  assert.equal(agyArgs[agyArgs.indexOf("--model") + 1], "gemini-4-neon-xhigh");
  assert.ok(agyArgs.includes("--dangerously-skip-permissions"));
  assert.equal(JSON.parse(agyInput.trim()).message.content, "需求二");
  assert.match(agyVisible, /"thread_id":"conv-1"/); assert.match(agyVisible, /正在执行本地命令/);

  const fakeLocalAppData = fs.mkdtempSync(path.join(directory, "LocalAppData-"));
  const fakeAgy = path.join(fakeLocalAppData, "agy", "bin", "agy.exe");
  fs.mkdirSync(path.dirname(fakeAgy), { recursive: true });
  fs.writeFileSync(fakeAgy, "");
  const savedEnv = { path: process.env.PATH, local: process.env.LOCALAPPDATA, cli: process.env.ANTIGRAVITY_CLI_PATH };
  try {
    process.env.PATH = ""; process.env.LOCALAPPDATA = fakeLocalAppData; delete process.env.ANTIGRAVITY_CLI_PATH;
    assert.equal(AntigravityCommand(), fakeAgy, "AntigravityCommand finds Windows default LOCALAPPDATA/agy/bin/agy.exe");
  } finally {
    process.env.PATH = savedEnv.path; process.env.LOCALAPPDATA = savedEnv.local;
    if (savedEnv.cli === undefined) delete process.env.ANTIGRAVITY_CLI_PATH; else process.env.ANTIGRAVITY_CLI_PATH = savedEnv.cli;
  }
}
