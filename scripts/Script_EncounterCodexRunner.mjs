import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { createRequire } from "node:module";

export const ENCOUNTER_CODEX_MODEL = "gpt-6.1-sol";
export const ENCOUNTER_CODEX_EFFORT = "high";

function SpawnAppServer(rootDir) {
  const entry = path.join(process.env.APPDATA || "", "npm/node_modules/@openai/codex/bin/codex.js");
  let command = fs.existsSync(entry) ? process.execPath : process.platform === "win32" ? "codex.exe" : "codex";
  const args = ["app-server", "--listen", "stdio://"];
  let commandArgs = fs.existsSync(entry) ? [entry, ...args] : args;
  if (process.platform === "win32" && fs.existsSync(entry)) {
    const packageName = `@openai/codex-win32-${process.arch}`;
    const platformRoot = path.dirname(createRequire(entry).resolve(`${packageName}/package.json`));
    const target = process.arch === "arm64" ? "aarch64-pc-windows-msvc" : "x86_64-pc-windows-msvc";
    command = path.join(platformRoot, "vendor", target, "bin", "codex.exe");
    commandArgs = args;
  }
  return spawn(command, commandArgs, {
    cwd: rootDir, windowsHide: true, stdio: ["pipe", "pipe", "pipe"],
  });
}

// Keep the bridge's final-output child contract while using the bidirectional
// app-server protocol for live turn/steer requests and local image attachments.
export function CreateSteerableCodexChild(args, rootDir, { spawnAppServer = SpawnAppServer } = {}) {
  const child = new EventEmitter();
  child.stdin = new PassThrough(); child.stdout = new PassThrough(); child.stderr = new PassThrough();
  const server = spawnAppServer(rootDir);
  child.pid = server.pid;
  const pending = new Map(), finalMessages = new Map(), commentary = new Map();
  const startedTurns = new Set(), startWaiters = new Map();
  const output = args[args.indexOf("--output-last-message") + 1];
  let sequence = 0, buffer = "", prompt = "", threadId, turnId, completed = null, closed = false, steering = 0;
  let resolveReady, rejectReady;
  const ready = new Promise((resolve, reject) => { resolveReady = resolve; rejectReady = reject; });
  ready.catch(() => {});

  function Send(value) { server.stdin.write(`${JSON.stringify(value)}\n`); }
  function Request(method, params) {
    if (closed) return Promise.reject(new Error("Codex connection closed"));
    const id = ++sequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { pending.delete(id); reject(new Error("Codex request timed out")); }, 60000);
      pending.set(id, { resolve, reject, timer });
      Send({ id, method, params });
    });
  }
  function Close(code, error) {
    if (closed) return;
    closed = true;
    rejectReady(error || new Error("Codex connection closed"));
    for (const request of pending.values()) { clearTimeout(request.timer); request.reject(error || new Error("Codex connection closed")); }
    pending.clear();
    for (const waiter of startWaiters.values()) waiter.reject(error || new Error("Codex connection closed"));
    startWaiters.clear();
    server.stdin.end();
    const shutdown = setTimeout(() => server.kill(), 5000);
    shutdown.unref(); server.once("close", () => clearTimeout(shutdown));
    if (error) child.emit("error", error);
    child.emit("close", code);
  }
  function Complete() {
    setImmediate(() => {
      if (closed || steering || !completed) return;
      const text = [...finalMessages.values()].join("\n\n").trim();
      try {
        if (text) fs.writeFileSync(output, text);
        Close(completed.status === "completed" && text ? 0 : 1);
      } catch (error) { Close(1, error); }
    });
  }
  async function StartTurn(input) {
    completed = null;
    const result = await Request("turn/start", { threadId, input, model: ENCOUNTER_CODEX_MODEL, effort: ENCOUNTER_CODEX_EFFORT });
    turnId = result.turn.id;
    if (!startedTurns.has(turnId)) await new Promise((resolve, reject) => startWaiters.set(turnId, { resolve, reject }));
  }
  function Input(text, imagePath) {
    const input = [{ type: "text", text, text_elements: [] }];
    if (imagePath) input.push({ type: "localImage", path: imagePath });
    return input;
  }
  let lastProgress = 0;
  function Progress(value) { child.stdout.write(`${JSON.stringify({ type: "progress", ...value })}\n`); }
  server.stdout.setEncoding("utf8");
  server.stdout.on("data", chunk => {
    buffer += chunk;
    const lines = buffer.split("\n"); buffer = lines.pop();
    for (const line of lines) {
      let event;
      try { event = JSON.parse(line); } catch { continue; }
      if (event.id != null && !event.method) {
        const request = pending.get(event.id);
        if (!request) continue;
        clearTimeout(request.timer); pending.delete(event.id);
        if (event.error) request.reject(new Error(event.error.message || "Codex request failed"));
        else request.resolve(event.result);
        continue;
      }
      if (event.id != null) {
        Send({ id: event.id, error: { code: -32601, message: "This local chat supports text and image input only" } });
        continue;
      }
      const params = event.params;
      if (params?.threadId !== threadId) continue;
      if (event.method === "turn/started") {
        turnId = params.turn.id; completed = null; startedTurns.add(turnId);
        startWaiters.get(turnId)?.resolve(); startWaiters.delete(turnId);
        Progress({ activity: "正在处理需求" });
      }
      if (event.method === "item/started") {
        if (params.item.type === "agentMessage" && params.item.phase === "commentary") commentary.set(params.item.id, "");
        const activities = { commandExecution: "正在执行本地命令", fileChange: "正在修改文件", webSearch: "正在查阅资料", mcpToolCall: "正在调用工具", reasoning: "正在分析需求" };
        if (activities[params.item.type]) Progress({ activity: activities[params.item.type] });
      }
      if (event.method === "item/agentMessage/delta" && commentary.has(params.itemId)) {
        const text = commentary.get(params.itemId) + params.delta;
        commentary.set(params.itemId, text);
        if (Date.now() - lastProgress > 500) { Progress({ text }); lastProgress = Date.now(); }
      }
      if (event.method === "item/completed" && params.item.type === "agentMessage" && params.item.phase === "commentary") Progress({ text: params.item.text });
      if (event.method === "item/completed" && params.item.type === "agentMessage"
        && (!params.item.phase || params.item.phase === "final_answer")) finalMessages.set(params.item.id, params.item.text);
      if (event.method === "turn/completed" && params.turn.id === turnId) { completed = params.turn; Complete(); }
    }
  });
  server.stderr.resume();
  server.on("error", error => Close(1, error));
  server.on("close", () => { if (!closed) Close(1); });
  server.stdin.on("error", error => Close(1, error));
  child.stdin.on("data", chunk => { prompt += chunk.toString(); });
  child.stdin.on("finish", async () => {
    try {
      await Request("initialize", { clientInfo: { name: "encounter_designer", version: "1.0.0" }, capabilities: {} });
      Send({ method: "initialized", params: {} });
      const resume = args[1] === "resume";
      const result = await Request(resume ? "thread/resume" : "thread/start", {
        cwd: rootDir, model: ENCOUNTER_CODEX_MODEL, config: { model_reasoning_effort: ENCOUNTER_CODEX_EFFORT }, ...(resume ? { threadId: args[2] } : {}),
      });
      threadId = result.thread.id;
      Progress({ activity: "已连接，正在提交需求", model: result.model || ENCOUNTER_CODEX_MODEL, effort: result.reasoningEffort || ENCOUNTER_CODEX_EFFORT });
      child.stdout.write(`${JSON.stringify({ type: "thread.started", thread_id: threadId })}\n`);
      const imageIndex = args.indexOf("--image");
      await StartTurn(Input(prompt, imageIndex >= 0 ? args[imageIndex + 1] : null));
      resolveReady();
    } catch (error) { Close(1, error); }
  });
  let steerQueue = Promise.resolve();
  child.steer = (text, imagePath) => {
    steering++;
    const operation = steerQueue.then(async () => {
      await ready;
      const input = Input(text, imagePath);
      if (completed) return StartTurn(input);
      try { await Request("turn/steer", { threadId, expectedTurnId: turnId, input }); }
      catch (error) {
        // Completion can race the click. Continue on the same thread when the
        // server has already emitted completion for the expected active turn.
        if (!completed && !/no active turn/i.test(error.message)) throw error;
        await StartTurn(input);
      }
    });
    steerQueue = operation.catch(() => {});
    return operation.finally(() => { steering--; Complete(); });
  };
  child.interrupt = async () => {
    if (closed) return;
    await ready;
    if (!closed && !completed) await Request("turn/interrupt", { threadId, turnId });
  };
  return child;
}
