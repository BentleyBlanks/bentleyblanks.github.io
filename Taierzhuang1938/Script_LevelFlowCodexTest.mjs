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
import { CreateLegacyProgressReader } from "../scripts/Script_EncounterCodexProgress.mjs";
import { CreateFramePacket } from "./AdvancedTools/Script_LevelFlowDocument.mjs";
import { DEFAULT_ENCOUNTER_DOCUMENT, EvaluateFlow } from "./AdvancedTools/Script_LevelFlowModel.mjs";

const directory = fs.mkdtempSync(path.join(os.tmpdir(), "EncounterCodexTest-"));
const children = [];
const realChildren = [], ready = [];
const stopped = [];
let stopFailure = false;
const handler = CreateEncounterCodexHandler(directory, { spawnCodex(args, root) {
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
  const concurrentReader = CreateEncounterCodexHandler(directory);
  server.removeAllListeners("request"); server.on("request", concurrentReader);
  assert.equal((await (await fetch(`${base}/sessions/${session.id}`)).json()).status, "running", "another preview keeps a live owner's run active");
  assert.equal((await Post({ ...body, requestId: randomUUID(), sessionId: session.id })).status, 409, "another preview rejects a second run in a live session");
  const liveFile = path.join(directory, "tmp", "EncounterCodex", session.id, "Session.json");
  fs.writeFileSync(liveFile, JSON.stringify({ ...session, status: "failed", error: "本地服务已重启，上次执行已中断。可继续发送需求。" }));
  assert.equal((await (await fetch(`${base}/sessions/${session.id}`)).json()).status, "running", "a live owner recovers an older preview's incorrect interruption flag");
  server.removeAllListeners("request"); server.on("request", handler);
  const steerBody = { ...body, requestId: randomUUID(), sessionId: session.id, prompt: "执行中补充，保留附件定位" };
  const [steered, duplicate] = await Promise.all([Post(steerBody), Post(steerBody)]);
  assert.equal(steered.status, 202); assert.equal(duplicate.status, 202);
  assert.equal(children.length, 1); assert.equal(first.steered.length, 1);
  assert.match(first.steered[0].prompt, /执行中补充，保留附件定位/);
  assert.ok(first.steered[0].image.endsWith("Screenshot.png"));
  const privateReasoning = "private reasoning must stay out of chat";
  first.stdout.write(`${JSON.stringify({ type: "thread.started", thread_id: "01a1d446-7900-7781-9cc4-00ad3a768caf" })}\n`);
  first.stdout.write(`${JSON.stringify({ type: "progress", activity: "正在验证路线", text: "已定位到路线问题，正在修复并验证。", model: "gpt-6.1-sol", effort: "high" })}\n`);
  const progress = await (await fetch(`${base}/sessions/${session.id}`)).json();
  assert.equal(progress.progress.text, "已定位到路线问题，正在修复并验证。");
  assert.equal(progress.model, "gpt-6.1-sol"); assert.equal(progress.effort, "high");
  first.stdout.write(`${JSON.stringify({ type: "item.completed", item: { type: "reasoning", text: privateReasoning } })}\n`);
  Finish(first, "已完成调整，验证通过。");
  session = await (await fetch(`${base}/sessions/${session.id}`)).json();
  assert.equal(session.status, "completed");
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
