// Local agent CLIs available to the Encounter Designer chat. Every provider
// returns the same child contract as CreateSteerableCodexChild: progress and
// thread.started JSON lines on stdout, the final reply in --output-last-message.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, execFile } from "node:child_process";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { promisify } from "node:util";
import { CreateSteerableCodexChild, SpawnAppServer, ENCOUNTER_CODEX_MODEL, ENCOUNTER_CODEX_EFFORT } from "./Script_EncounterCodexRunner.mjs";

const RunFile = promisify(execFile);
const EFFORTS = ["low", "medium", "high", "xhigh", "max", "ultra"];
const EFFORT_SUFFIX = /-(low|medium|high|xhigh|max)$/;
const CATALOG_TTL = 10 * 60 * 1000;

export const PROVIDER_IDS = ["codex", "devin", "antigravity"];
export const PROVIDER_LABELS = { codex: "Codex", devin: "Devin", antigravity: "Antigravity" };
export const MODEL_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,95}$/;
export const EFFORT_PATTERN = /^[a-z]{1,12}$/;

function FirstExisting(candidates) {
  return candidates.find(file => file && fs.existsSync(file)) || null;
}

function OnPath(names) {
  const directories = (process.env.PATH || "").split(path.delimiter).filter(Boolean);
  const extensions = process.platform === "win32" ? ["", ".exe", ".cmd"] : [""];
  for (const directory of directories) for (const name of names) for (const extension of extensions) {
    const file = path.join(directory, name + extension);
    if (fs.existsSync(file) && fs.statSync(file).isFile()) return file;
  }
  return null;
}

export function DevinCommand() {
  return FirstExisting([process.env.DEVIN_CLI_PATH]) || OnPath(["devin"]) || FirstExisting([
    path.join(process.env.LOCALAPPDATA || "", "Programs/Devin/resources/app/extensions/windsurf/devin/bin/devin.exe"),
    path.join(os.homedir(), ".local/bin/devin"),
  ]);
}

export function AntigravityCommand() {
  return FirstExisting([process.env.ANTIGRAVITY_CLI_PATH]) || OnPath(["agy"]) || FirstExisting([
    path.join(process.env.LOCALAPPDATA || "", "agy/bin/agy.exe"),
    path.join(process.env.LOCALAPPDATA || "", "Programs/Antigravity/bin/agy.exe"),
    path.join(process.env.LOCALAPPDATA || "", "Programs/Antigravity CLI/agy.exe"),
    path.join(os.homedir(), ".local/bin/agy"),
  ]);
}

// npm .cmd shims need a shell on Windows; native binaries run directly.
function SpawnCli(command, args, rootDir) {
  const shell = process.platform === "win32" && /\.cmd$/i.test(command);
  return spawn(shell ? `"${command}"` : command, shell ? args.map(arg => `"${arg.replace(/"/g, '\\"')}"`) : args,
    { cwd: rootDir, windowsHide: true, stdio: ["pipe", "pipe", "pipe"], shell });
}

// Provider model ids such as claude-opus-5-5-high encode effort as a suffix.
function GroupByEffort(ids, labels = {}) {
  const models = new Map();
  for (const id of ids) {
    const match = !id.includes("-sidekick-") && EFFORT_SUFFIX.exec(id);
    const base = match ? id.slice(0, match.index) : id;
    const entry = models.get(base) || { id: base, label: labels[base] || base, efforts: [] };
    if (match) entry.efforts.push(match[1]);
    models.set(base, entry);
  }
  for (const entry of models.values()) {
    entry.efforts.sort((a, b) => EFFORTS.indexOf(a) - EFFORTS.indexOf(b));
    entry.defaultEffort = entry.efforts.includes("high") ? "high" : entry.efforts.at(-1) || "";
  }
  return [...models.values()];
}

export function ProviderModelId(provider, model, effort) {
  return provider !== "codex" && effort ? `${model}-${effort}` : model;
}

export function ParseModelList(stdout) {
  const ids = [], labels = {};
  for (const line of stdout.split(/\r?\n/)) {
    const match = /^\s*[*>]?\s*([a-z0-9][a-z0-9._-]{2,95})(?:\s{2,}|\t)(.*)$/i.exec(line) || /^\s*[*>]?\s*([a-z0-9][a-z0-9._-]*-[a-z0-9._-]+)\s*$/i.exec(line);
    if (!match || /^(model|id|name)$/i.test(match[1])) continue;
    ids.push(match[1]);
    if (match[2]) labels[match[1].includes("-sidekick-") ? match[1] : match[1].replace(EFFORT_SUFFIX, "")] = match[2].trim().replace(/\s*\((low|medium|high|xhigh|max)\)\s*$/i, "");
  }
  return GroupByEffort(ids, labels);
}

function CodexConfigModel() {
  try {
    const config = fs.readFileSync(path.join(process.env.CODEX_HOME || path.join(os.homedir(), ".codex"), "config.toml"), "utf8");
    return /^model\s*=\s*"([^"]+)"/m.exec(config)?.[1] || null;
  } catch { return null; }
}

async function CodexCatalog(rootDir) {
  const fallback = [ENCOUNTER_CODEX_MODEL, CodexConfigModel()].filter((id, index, list) => id && list.indexOf(id) === index)
    .map(id => ({ id, label: id, efforts: EFFORTS.slice(0, 5), defaultEffort: ENCOUNTER_CODEX_EFFORT }));
  const server = SpawnAppServer(rootDir);
  try {
    const listed = await new Promise((resolve, reject) => {
      let buffer = "";
      const timer = setTimeout(() => reject(new Error("timeout")), 20000);
      server.on("error", reject);
      server.stdout.setEncoding("utf8");
      server.stdout.on("data", chunk => {
        buffer += chunk;
        const lines = buffer.split("\n"); buffer = lines.pop();
        for (const line of lines) {
          let event; try { event = JSON.parse(line); } catch { continue; }
          if (event.id === 1) server.stdin.write(`${JSON.stringify({ method: "initialized", params: {} })}\n${JSON.stringify({ id: 2, method: "model/list", params: {} })}\n`);
          if (event.id === 2) { clearTimeout(timer); event.error ? reject(new Error(event.error.message)) : resolve(event.result.data || []); }
        }
      });
      server.stderr.resume();
      server.stdin.write(`${JSON.stringify({ id: 1, method: "initialize", params: { clientInfo: { name: "encounter_designer", version: "1.0.0" }, capabilities: {} } })}\n`);
    });
    const models = listed.filter(model => !model.hidden).map(model => ({ id: model.id, label: model.displayName || model.id,
      efforts: (model.supportedReasoningEfforts || []).map(item => item.reasoningEffort), defaultEffort: model.defaultReasoningEffort || "" }));
    return { available: true, models: [...fallback.filter(model => !models.some(item => item.id === model.id)), ...models] };
  } catch (error) {
    return { available: error.code !== "ENOENT", error: error.code === "ENOENT" ? "未找到本机 Codex CLI" : "", models: fallback };
  } finally { server.stdin.end(); server.kill(); }
}

async function CliCatalog(command, label, loginHint, fallback) {
  if (!command) return { available: false, error: `未找到本机 ${label} CLI`, models: fallback };
  try {
    const { stdout, stderr } = await RunFile(command, ["models"], { windowsHide: true, timeout: 30000, shell: /\.cmd$/i.test(command) });
    const models = ParseModelList(stdout);
    if (models.length) return { available: true, models };
    // An unknown listing format must not block a logged-in CLI; offer the known models instead.
    return /log|auth/i.test(stdout + stderr) ? { available: false, error: loginHint, models: fallback } : { available: true, models: fallback };
  } catch (error) {
    const text = `${error.stdout || ""}${error.stderr || ""}`;
    return /log|auth/i.test(text) ? { available: false, error: loginHint, models: fallback } : { available: true, models: fallback };
  }
}

const DEVIN_FALLBACK = GroupByEffort(["claude-opus-5-5-low", "claude-opus-5-5-medium", "claude-opus-5-5-high", "claude-opus-5-5-xhigh",
  "claude-sonnet-5-5-low", "claude-sonnet-5-5-medium", "claude-sonnet-5-5-high"]);
const ANTIGRAVITY_FALLBACK = GroupByEffort(["gemini-4-neon-low", "gemini-4-neon-medium", "gemini-4-neon-high", "gemini-4-neon-xhigh",
  "gemini-4-carbon-low", "gemini-4-carbon-medium", "gemini-4-carbon-high", "gemini-3.8-flash-medium", "gemini-3.8-flash-high"]);

export async function LoadProviderCatalog(rootDir) {
  const [codex, devin, antigravity] = await Promise.all([
    CodexCatalog(rootDir),
    CliCatalog(DevinCommand(), "Devin", "Devin CLI 未登录，请在终端运行 devin auth login", DEVIN_FALLBACK),
    CliCatalog(AntigravityCommand(), "Antigravity", "Antigravity CLI 未登录，请先在终端运行一次 agy 完成登录", ANTIGRAVITY_FALLBACK),
  ]);
  const defaults = { codex: [ENCOUNTER_CODEX_MODEL, ENCOUNTER_CODEX_EFFORT] };
  return Object.entries({ codex, devin, antigravity }).map(([id, entry]) => {
    const [model, effort] = defaults[id] || [entry.models[0]?.id || "", entry.models[0]?.defaultEffort || ""];
    return { id, label: PROVIDER_LABELS[id], available: entry.available, error: entry.error || "", models: entry.models,
      defaultModel: entry.models.some(item => item.id === model) ? model : entry.models[0]?.id || "", defaultEffort: effort };
  });
}

export function CreateProviderCatalogCache(rootDir, load = LoadProviderCatalog) {
  let value = null, loadedAt = 0, loading = null;
  return function Get(refresh = false) {
    if (!refresh && value && Date.now() - loadedAt < CATALOG_TTL) return Promise.resolve(value);
    loading ||= load(rootDir).then(result => { value = result; loadedAt = Date.now(); return result; }).finally(() => { loading = null; });
    return loading;
  };
}

function ReadExport(file) {
  try {
    const value = JSON.parse(fs.readFileSync(file, "utf8"));
    const steps = value.steps || value.trajectory?.steps || [];
    const reply = steps.filter(step => step.source === "agent" && typeof step.message === "string" && step.message.trim()).at(-1)?.message;
    return { sessionId: value.session_id || value.sessionId || null, reply: reply?.trim() || "" };
  } catch { return { sessionId: null, reply: "" }; }
}

async function LatestDevinSession(rootDir, since) {
  try {
    const { DatabaseSync } = await import("node:sqlite");
    const database = new DatabaseSync(path.join(process.env.APPDATA || path.join(os.homedir(), ".local/share"), "devin/cli/sessions.db"), { readOnly: true });
    try {
      return database.prepare("select id from sessions where working_directory = ? and created_at >= ? order by created_at desc limit 1")
        .get(path.resolve(rootDir), Math.floor(since / 1000) - 5)?.id || null;
    } finally { database.close(); }
  } catch { return null; }
}

function ImageNote(images) {
  return images.length ? `\n\n标注截图文件（请用读取文件工具查看图片）：\n${images.map(file => `- ${file}`).join("\n")}` : "";
}

// Shared shell for print-mode CLIs: buffer the prompt from stdin, run one
// process per turn, and translate its output into the bridge contract.
function CreatePrintChild(args, Run) {
  const child = new EventEmitter();
  child.stdin = new PassThrough(); child.stdout = new PassThrough(); child.stderr = new PassThrough();
  const output = args[args.indexOf("--output-last-message") + 1];
  const resumeId = args[1] === "resume" ? args[2] : null;
  const imageIndex = args.indexOf("--image");
  const images = imageIndex >= 0 ? [args[imageIndex + 1]] : [];
  let prompt = "", closed = false;
  child.Progress = value => child.stdout.write(`${JSON.stringify({ type: "progress", ...value })}\n`);
  child.Thread = id => child.stdout.write(`${JSON.stringify({ type: "thread.started", thread_id: id })}\n`);
  child.Close = (code, error) => {
    if (closed) return;
    closed = true;
    if (error) child.emit("error", error);
    child.emit("close", code);
  };
  child.stdin.on("data", chunk => { prompt += chunk.toString(); });
  child.stdin.on("finish", () => {
    try { Run({ child, prompt: prompt + ImageNote(images), output, resumeId, folder: path.dirname(output) }); }
    catch (error) { child.Close(1, error); }
  });
  return child;
}

function Attach(child, server) {
  child.pid = server.pid;
  server.stderr.resume();
  server.on("error", error => child.Close(1, error));
  return server;
}

export function CreateDevinChild(args, rootDir, { model, effort, command = DevinCommand(), spawnCli = SpawnCli } = {}) {
  if (!command) throw Object.assign(new Error("Devin CLI missing"), { code: "ENOENT" });
  const modelId = ProviderModelId("devin", model, effort);
  const child = CreatePrintChild(args, ({ child, prompt, output, resumeId, folder }) => {
    const promptFile = path.join(folder, "Prompt.txt"), exportFile = path.join(folder, "Export.json");
    fs.writeFileSync(promptFile, prompt);
    const startedAt = Date.now();
    const cliArgs = ["-p", "--prompt-file", promptFile, "--permission-mode", "dangerous", "--respect-workspace-trust", "false",
      "--process-model", "in-process", "--export", exportFile];
    if (modelId) cliArgs.push("--model", modelId);
    if (resumeId) cliArgs.push("-r", resumeId);
    const server = Attach(child, spawnCli(command, cliArgs, rootDir));
    if (resumeId) child.Thread(resumeId);
    child.Progress({ phase: "running", activity: "正在处理需求", model, effort });
    let text = "", lastProgress = 0;
    server.stdout.setEncoding("utf8");
    server.stdout.on("data", chunk => {
      text += chunk;
      if (Date.now() - lastProgress > 500) { child.Progress({ text: text.slice(-4000) }); lastProgress = Date.now(); }
    });
    server.on("close", async code => {
      const exported = ReadExport(exportFile);
      const sessionId = exported.sessionId || resumeId || await LatestDevinSession(rootDir, startedAt);
      if (sessionId && sessionId !== resumeId) child.Thread(sessionId);
      const reply = exported.reply || text.trim();
      if (reply) fs.writeFileSync(output, reply);
      child.Close(code === 0 && reply ? 0 : code || 1);
    });
  });
  return child;
}

const AGY_ACTIVITIES = { run_command: "正在执行本地命令", write_to_file: "正在修改文件", replace_file_content: "正在修改文件",
  view_file: "正在读取文件", grep_search: "正在搜索代码", search_web: "正在查阅资料", read_url_content: "正在查阅资料", planner_response: "正在分析需求" };

export function CreateAntigravityChild(args, rootDir, { model, effort, command = AntigravityCommand(), spawnCli = SpawnCli } = {}) {
  if (!command) throw Object.assign(new Error("Antigravity CLI missing"), { code: "ENOENT" });
  const modelId = ProviderModelId("antigravity", model, effort);
  return CreatePrintChild(args, ({ child, prompt, output, resumeId }) => {
    const cliArgs = ["--input-format", "stream-json", "--output-format", "stream-json", "--dangerously-skip-permissions"];
    if (modelId) cliArgs.push("--model", modelId);
    if (resumeId) cliArgs.push("--conversation", resumeId);
    const server = Attach(child, spawnCli(command, cliArgs, rootDir));
    let buffer = "", text = "", result = null, lastProgress = 0;
    server.stdout.setEncoding("utf8");
    server.stdout.on("data", chunk => {
      buffer += chunk;
      const lines = buffer.split("\n"); buffer = lines.pop();
      for (const line of lines) {
        let event; try { event = JSON.parse(line); } catch { continue; }
        if (event.event === "init") {
          if (event.conversation_id) child.Thread(event.conversation_id);
          child.Progress({ phase: "running", activity: "正在处理需求", model, effort });
        }
        const step = event.step_update;
        if (step?.step_type === "agent_response" && typeof step.text_delta === "string") {
          text += step.text_delta;
          if (Date.now() - lastProgress > 500) { child.Progress({ text: text.slice(-4000) }); lastProgress = Date.now(); }
        } else if (step?.state === "ACTIVE" && AGY_ACTIVITIES[step.step_type]) child.Progress({ activity: AGY_ACTIVITIES[step.step_type] });
        if (event.event === "result") { result = event.result; server.stdin.end(); }
      }
    });
    server.stdin.on("error", () => {});
    server.stdin.write(`${JSON.stringify({ event: "user", message: { content: prompt } })}\n`);
    server.on("close", code => {
      const reply = (result?.response || text).trim();
      if (reply) fs.writeFileSync(output, reply);
      child.Close(result?.status === "SUCCESS" && reply ? 0 : code || 1, result?.error ? new Error(result.error) : undefined);
    });
  });
}

export function SpawnAgent(args, rootDir, { provider = "codex", model = ENCOUNTER_CODEX_MODEL, effort = ENCOUNTER_CODEX_EFFORT } = {}) {
  if (provider === "devin") return CreateDevinChild(args, rootDir, { model, effort });
  if (provider === "antigravity") return CreateAntigravityChild(args, rootDir, { model, effort });
  return CreateSteerableCodexChild(args, rootDir, { model, effort });
}
