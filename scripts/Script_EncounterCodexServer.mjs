// Loopback-only Encounter Designer bridge. Store attachments and final replies locally.
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { CreateSteerableCodexChild, ENCOUNTER_CODEX_MODEL, ENCOUNTER_CODEX_EFFORT } from "./Script_EncounterCodexRunner.mjs";
import { CreateLegacyProgressReader } from "./Script_EncounterCodexProgress.mjs";
import { ReadFramePacket } from "../Taierzhuang1938/AdvancedTools/Script_LevelFlowDocument.mjs";
import { FLOW_TIMELINE } from "../Taierzhuang1938/AdvancedTools/Script_LevelFlowModel.mjs";

const PREFIX = "/__encounter/codex";
const ID = /^[a-f0-9-]{36}$/;
const BODY_LIMIT = 32 * 1024 * 1024;
const CLI_FAILURE = "Codex 执行失败，请在本机 CLI 检查登录和网络后重试";
const CLI_MISSING = "未找到本机 Codex CLI，请检查安装和 PATH 配置";
const CLI_START_FAILURE = "本机 Codex CLI 启动失败，请检查本机运行环境";
const CLI_INTERRUPTED = "本地服务已重启，上次执行已中断。可继续发送需求。";
const PUBLIC_ERRORS = new Set([CLI_FAILURE, CLI_MISSING, CLI_START_FAILURE, CLI_INTERRUPTED]);

class RequestError extends Error {}
const RunFile = promisify(execFile);

function ProcessIsRunning(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; }
  catch (error) { return error.code === "EPERM"; }
}

function Send(response, status, value) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  response.end(JSON.stringify(value));
}

function LocalRequest(request) {
  const address = request.socket.remoteAddress;
  if (!["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(address)) return false;
  try {
    const host = new URL(`http://${request.headers.host}`);
    return ["127.0.0.1", "localhost", "[::1]"].includes(host.hostname)
      && (!request.headers.origin || request.headers.origin === host.origin);
  } catch { return false; }
}

async function ReadTurn(request) {
  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > BODY_LIMIT) throw new RequestError("附件超过 32 MB，请减少截图尺寸");
    chunks.push(chunk);
  }
  let body;
  try { body = JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw new RequestError("请求 JSON 无效"); }
  if (!body || typeof body.prompt !== "string" || !body.prompt.trim() || body.prompt.length > 20000) throw new RequestError("请填写需求，最多 20000 字");
  if (body.sessionId != null && !ID.test(body.sessionId)) throw new RequestError("会话编号无效");
  if (body.requestId != null && !ID.test(body.requestId)) throw new RequestError("请求编号无效");
  const frame = body.frame == null ? null : ReadFramePacket(body.frame, FLOW_TIMELINE);
  // Keep the more detailed location attachment, including selection and world-space camera.
  if (frame && (!body.location || typeof body.location !== "object" || Array.isArray(body.location) || JSON.stringify(body.location).length > 256000)) throw new RequestError("定位附件无效");
  if (!frame && body.location != null) throw new RequestError("定位附件缺少帧信息");
  if (body.screenshot) {
    if (typeof body.screenshot.image !== "string" || !/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(body.screenshot.image)) throw new RequestError("截图必须为 PNG");
    const png = Buffer.from(body.screenshot.image.split(",")[1], "base64");
    if (!png.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) throw new RequestError("截图文件无效");
    ReadFramePacket(body.screenshot.frame, FLOW_TIMELINE);
  }
  return { ...body, frame, prompt: body.prompt.trim() };
}

function SpawnCodex(args, rootDir) {
  return CreateSteerableCodexChild(args, rootDir);
}

async function StopCodex(child) {
  if (child.interrupt) { await child.interrupt(); return; }
  if (!ProcessIsRunning(child.pid)) return;
  if (process.platform === "win32") {
    await RunFile("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true, timeout: 15000 });
  } else process.kill(-child.pid, "SIGTERM");
}

async function LegacyCliPid(session) {
  if (session.cliPid && ProcessIsRunning(session.cliPid)) return session.cliPid;
  if (process.platform !== "win32") throw new RequestError("旧会话缺少 CLI 进程信息");
  // Session IDs are validated UUIDs. Return only the matching CLI wrapper's PID.
  const script = `Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" | Where-Object { $_.CommandLine -like '*codex.js*' -and $_.CommandLine -like '*exec*' -and $_.CommandLine -like '*${session.id}*' } | Select-Object -First 1 -ExpandProperty ProcessId`;
  const { stdout } = await RunFile("powershell.exe", ["-NoProfile", "-Command", script], { windowsHide: true, timeout: 10000 });
  const pid = Number(stdout.trim());
  if (!ProcessIsRunning(pid)) throw new RequestError("未找到该会话正在执行的 CLI 进程");
  return pid;
}

export function CreateEncounterCodexHandler(rootDir, { spawnCodex = SpawnCodex, stopCodex = StopCodex, readLegacyProgress = CreateLegacyProgressReader() } = {}) {
  const directory = path.join(rootDir, "tmp", "EncounterCodex");
  const active = new Map();
  const submissions = new Map();
  const SessionPath = id => path.join(directory, id, "Session.json");
  const InterruptPath = id => path.join(directory, id, "Interrupt.json");
  const DeletedPath = id => path.join(directory, id, "Deleted.json");
  // Keep list visibility separate from live runner writes and the CLI transcript.
  function WithVisibility(session) {
    const deletedAt = fs.existsSync(DeletedPath(session.id)) ? JSON.parse(fs.readFileSync(DeletedPath(session.id), "utf8")).deletedAt : null;
    return { ...session, deletedAt };
  }
  function ReadInterrupt(session) {
    if (!fs.existsSync(InterruptPath(session.id))) return null;
    const interruption = JSON.parse(fs.readFileSync(InterruptPath(session.id), "utf8"));
    return interruption.requestId === session.messages.findLast(message => message.role === "user")?.requestId ? interruption : null;
  }
  function Save(session) {
    fs.mkdirSync(path.dirname(SessionPath(session.id)), { recursive: true });
    const temporary = `${SessionPath(session.id)}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(session, null, 2));
    fs.renameSync(temporary, SessionPath(session.id));
  }
  function Load(id) {
    if (!ID.test(id)) throw new RequestError("会话编号无效");
    const session = JSON.parse(fs.readFileSync(SessionPath(id), "utf8"));
    if (session.error && !PUBLIC_ERRORS.has(session.error)) { session.error = CLI_FAILURE; Save(session); }
    const interruption = ReadInterrupt(session);
    if (interruption && !ProcessIsRunning(interruption.cliPid) && session.status !== "interrupted") {
      session.status = "interrupted";
      session.error = "";
      session.updatedAt = interruption.createdAt;
      Save(session);
    }
    const ownerAlive = ProcessIsRunning(session.runnerPid);
    if (session.status === "failed" && session.error === CLI_INTERRUPTED && ownerAlive) {
      session.status = "running";
      session.error = "";
      Save(session);
    }
    // Another preview instance may own this run. Legacy records have no owner PID.
    if (session.status === "running" && !active.has(id) && session.runnerPid != null && !ownerAlive) {
      session.status = "failed";
      session.error = CLI_INTERRUPTED;
      Save(session);
    }
    if (["running", "failed"].includes(session.status) && !active.has(id) && !interruption) {
      const legacy = readLegacyProgress(session);
      if (legacy?.model) session.model = legacy.model;
      if (legacy?.effort) session.effort = legacy.effort;
      if (legacy?.progress && (!session.progress || Date.parse(legacy.progress.updatedAt) > Date.parse(session.progress.updatedAt))) session.progress = legacy.progress;
      if (legacy?.completion) {
        const { text, updatedAt } = legacy.completion;
        if (session.messages.at(-1)?.role !== "assistant" || session.messages.at(-1).text !== text) {
          session.messages.push({ role: "assistant", text, createdAt: updatedAt });
        }
        session.status = "completed";
        session.error = "";
        session.updatedAt = updatedAt;
        Save(session);
      }
    }
    return session;
  }
  function Prompt(turn, folder) {
    return [
      "你正在处理 Encounter Designer 右侧会话提交的需求。遵循仓库 AGENTS.md，代码修改须在本会话独占的 worktree 中进行。",
      `编辑器检出目录为 ${rootDir}。`,
      turn.frame ? `定位附件保存在 ${path.join(folder, "Frame.json")} 和 ${path.join(folder, "Location.json")}，包含用户附加时的帧、时间、世界坐标、相机与选中对象。先读取附件。` : "",
      turn.screenshot ? `标注截图附在本条消息中，截图当时的帧信息在 ${path.join(folder, "ScreenshotFrame.json")}。` : "",
      "最终答复请用简洁中文给出处理结论、验证结果与尚未完成项。",
      "执行过程中用简洁中文同步公开的进度说明，说明已发现的问题、正在进行的修改或验证。",
      "用户需求", turn.prompt,
    ].filter(Boolean).join("\n\n");
  }
  function Start(session, turn, folder) {
    const output = path.join(folder, "Conclusion.txt");
    const args = ["exec"];
    if (session.cliSessionId) args.push("resume", session.cliSessionId);
    args.push("--json", "--output-last-message", output);
    if (turn.screenshot) args.push("--image", path.join(folder, "Screenshot.png"));
    args.push("-");
    const prompt = Prompt(turn, folder);
    session.status = "running";
    session.model = ENCOUNTER_CODEX_MODEL; session.effort = ENCOUNTER_CODEX_EFFORT;
    session.progress = { activity: "正在启动本机 Codex", text: "", updatedAt: new Date().toISOString() };
    session.runnerPid = process.pid;
    session.error = "";
    Save(session);
    let child;
    try { child = spawnCodex(args, rootDir); }
    catch (error) { session.status = "failed"; session.error = error.code === "ENOENT" ? CLI_MISSING : CLI_START_FAILURE; Save(session); return; }
    active.set(session.id, { child, session });
    session.cliPid = child.pid;
    Save(session);
    child.stdout.setEncoding("utf8");
    child.stderr.resume();
    let buffer = "";
    child.stdout.on("data", chunk => {
      buffer += chunk.toString();
      const lines = buffer.split("\n");
      buffer = lines.pop().slice(-1024 * 1024);
      for (const line of lines) {
        try {
          const event = JSON.parse(line);
          if (event.type === "thread.started") { session.cliSessionId = event.thread_id; Save(session); }
          if (event.type === "progress") {
            if (typeof event.text === "string") session.progress.text = event.text.slice(-4000);
            if (typeof event.activity === "string") session.progress.activity = event.activity.slice(0, 200);
            if (typeof event.model === "string") session.model = event.model;
            if (typeof event.effort === "string") session.effort = event.effort;
            session.progress.updatedAt = new Date().toISOString();
            Save(session);
          }
        } catch { /* Other CLI events are deliberately discarded. */ }
      }
    });
    let finished = false;
    function Finish(code, error) {
      if (finished) return;
      finished = true;
      active.delete(session.id);
      const conclusion = fs.existsSync(output) ? fs.readFileSync(output, "utf8").trim() : "";
      session.status = ReadInterrupt(session) ? "interrupted" : code === 0 && conclusion ? "completed" : "failed";
      if (conclusion) session.messages.push({ role: "assistant", text: conclusion, createdAt: new Date().toISOString() });
      if (session.status === "failed") session.error = error?.code === "ENOENT" ? CLI_MISSING : CLI_FAILURE;
      session.updatedAt = new Date().toISOString();
      Save(session);
    }
    child.on("error", error => Finish(null, error));
    child.on("close", code => Finish(code));
    child.stdin.on("error", () => {});
    child.stdin.end(prompt);
  }

  async function InterruptSession(session) {
    const pendingInterrupt = ReadInterrupt(session);
    const child = active.get(session.id)?.child || { pid: pendingInterrupt?.cliPid || await LegacyCliPid(session) };
    const interruption = { requestId: session.messages.findLast(message => message.role === "user").requestId,
      cliPid: child.pid, createdAt: new Date().toISOString() };
    const temporary = `${InterruptPath(session.id)}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(interruption));
    fs.renameSync(temporary, InterruptPath(session.id));
    session.status = "interrupting";
    Save(session);
    try { await stopCodex(child); }
    catch {
      if (ProcessIsRunning(child.pid)) {
        fs.rmSync(InterruptPath(session.id), { force: true });
        session.status = "running"; Save(session);
        throw new RequestError("中断未成功，请重试");
      }
    }
    return interruption;
  }

  async function MigrateLegacyRun(session) {
    if (!session.cliSessionId) throw new RequestError("旧会话正在启动，取得会话编号后即可补充要求");
    await InterruptSession(session);
    // Let the old preview's close callback persist any last conclusion before
    // resuming its transcript. The receipt also survives older owner versions.
    for (let attempt = 0; attempt < 50; attempt++) {
      const saved = JSON.parse(fs.readFileSync(SessionPath(session.id), "utf8"));
      if (!["running", "interrupting"].includes(saved.status)) return;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new RequestError("旧连接正在收尾，请重试补充要求");
  }

  return async function Handle(request, response) {
    if (!LocalRequest(request)) { Send(response, 403, { error: "仅支持本机同源页面" }); return; }
    const route = new URL(request.url, "http://localhost").pathname.slice(PREFIX.length);
    try {
      if (request.method === "GET" && route === "/sessions") {
        const sessions = fs.existsSync(directory) ? fs.readdirSync(directory).filter(id => ID.test(id)).map(Load) : [];
        const summaries = sessions.map(WithVisibility).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
          .map(({ id, title, status, updatedAt, progress, model, effort, deletedAt }) => ({ id, title, status, updatedAt, progress, model, effort, deletedAt }));
        Send(response, 200, { model: ENCOUNTER_CODEX_MODEL, effort: ENCOUNTER_CODEX_EFFORT,
          sessions: summaries.filter(session => !session.deletedAt), deletedSessions: summaries.filter(session => session.deletedAt) });
        return;
      }
      const sessionRoute = /^\/sessions\/([a-f0-9-]{36})$/.exec(route);
      if (request.method === "GET" && sessionRoute) { Send(response, 200, WithVisibility(Load(sessionRoute[1]))); return; }
      const restoreRoute = /^\/sessions\/([a-f0-9-]{36})\/restore$/.exec(route);
      if ((request.method === "DELETE" && sessionRoute) || (request.method === "POST" && restoreRoute)) {
        const session = Load((sessionRoute || restoreRoute)[1]);
        const file = DeletedPath(session.id);
        if (restoreRoute) fs.rmSync(file, { force: true });
        else if (!fs.existsSync(file)) {
          const temporary = `${file}.${randomUUID()}.tmp`;
          try {
            fs.writeFileSync(temporary, JSON.stringify({ deletedAt: new Date().toISOString() }));
            fs.renameSync(temporary, file);
          } finally { fs.rmSync(temporary, { force: true }); }
        }
        Send(response, 200, WithVisibility(session));
        return;
      }
      const interruptRoute = /^\/sessions\/([a-f0-9-]{36})\/interrupt$/.exec(route);
      if (request.method === "POST" && interruptRoute) {
        const session = active.get(interruptRoute[1])?.session || Load(interruptRoute[1]);
        if (!["running", "interrupting"].includes(session.status)) { Send(response, 200, session); return; }
        await InterruptSession(session);
        Send(response, 202, Load(session.id));
        return;
      }
      const attachment = /^\/attachments\/([a-f0-9-]{36})\/([a-f0-9-]{36})\/(Screenshot\.png|Frame\.json|Location\.json|ScreenshotFrame\.json)$/.exec(route);
      if (request.method === "GET" && attachment) {
        const file = path.join(directory, ...attachment.slice(1));
        const content = fs.readFileSync(file);
        response.writeHead(200, { "Content-Type": file.endsWith(".png") ? "image/png" : "application/json; charset=utf-8", "Cache-Control": "no-store" });
        response.end(content); return;
      }
      if (request.method !== "POST" || route !== "/turns") { Send(response, 404, { error: "接口不存在" }); return; }
      if (!request.headers["content-type"]?.startsWith("application/json")) { Send(response, 415, { error: "请使用 JSON 请求" }); return; }
      const turn = await ReadTurn(request);
      const now = new Date().toISOString();
      const turnId = turn.requestId || randomUUID();
      const sessionId = turn.sessionId || turnId;
      if (fs.existsSync(DeletedPath(sessionId))) { Send(response, 409, { error: "会话已删除，请先在已删除列表中还原" }); return; }
      let running = active.get(sessionId);
      const session = running?.session || (fs.existsSync(SessionPath(sessionId)) ? Load(sessionId) : null);
      if (turn.sessionId && !session) { Send(response, 404, { error: "会话不存在" }); return; }
      const submissionKey = `${sessionId}/${turnId}`;
      if (submissions.has(submissionKey)) await submissions.get(submissionKey);
      if (session?.messages.some(message => message.requestId === turnId)) { Send(response, 202, session); return; }
      let next = session || { id: sessionId, title: turn.prompt.slice(0, 32), messages: [], createdAt: now };
      if (turn.steer === true && next.status === "running" && !running?.child.steer) {
        await MigrateLegacyRun(next);
        running = active.get(sessionId);
        next = running?.session || Load(sessionId);
        if (next.messages.some(item => item.requestId === turnId)) { Send(response, 202, next); return; }
      }
      if (running && !running.child.steer) { Send(response, 409, { error: "当前执行使用旧版连接，请完成后重试" }); return; }
      if (!running && ["running", "interrupting"].includes(next.status)) { Send(response, 409, { error: "会话由另一个预览服务执行，请在原页面补充要求，或中断后继续" }); return; }
      const folder = path.join(directory, next.id, turnId);
      fs.mkdirSync(folder, { recursive: true });
      if (turn.frame) {
        fs.writeFileSync(path.join(folder, "Frame.json"), JSON.stringify(turn.frame, null, 2));
        fs.writeFileSync(path.join(folder, "Location.json"), JSON.stringify(turn.location, null, 2));
      }
      const attachmentBase = `${PREFIX}/attachments/${next.id}/${turnId}`;
      const message = { role: "user", requestId: turnId, text: turn.prompt, createdAt: now };
      if (turn.frame) Object.assign(message, { frame: turn.frame.context, location: turn.location,
        frameUrl: `${attachmentBase}/Frame.json`, locationUrl: `${attachmentBase}/Location.json` });
      if (turn.screenshot) {
        fs.writeFileSync(path.join(folder, "Screenshot.png"), Buffer.from(turn.screenshot.image.split(",")[1], "base64"));
        fs.writeFileSync(path.join(folder, "ScreenshotFrame.json"), JSON.stringify(turn.screenshot.frame, null, 2));
        message.screenshotUrl = `${attachmentBase}/Screenshot.png`;
        message.screenshotFrame = turn.screenshot.frame.context;
      }
      next.messages.push(message);
      next.updatedAt = now;
      if (running) {
        Save(next);
        const submission = running.child.steer(Prompt(turn, folder), turn.screenshot ? path.join(folder, "Screenshot.png") : null);
        submissions.set(submissionKey, submission);
        try { await submission; }
        catch {
          next.messages = next.messages.filter(item => item !== message);
          Save(next);
          throw new RequestError("补充要求发送失败，请重试");
        } finally { submissions.delete(submissionKey); }
      } else Start(next, turn, folder);
      Send(response, 202, next);
    } catch (error) {
      if (!response.headersSent) Send(response, error.code === "ENOENT" ? 404 : 400, {
        error: error instanceof RequestError ? error.message : error.code === "ENOENT" ? "会话或附件不存在" : "请求无效或本机会话文件无法读写",
      });
      else response.end();
    }
  };
}
