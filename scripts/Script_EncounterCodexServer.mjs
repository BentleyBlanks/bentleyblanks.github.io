// Loopback-only Encounter Designer bridge. Store attachments and final replies locally.
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
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
  const frame = ReadFramePacket(body.frame, FLOW_TIMELINE);
  // Keep the more detailed location attachment, including selection and world-space camera.
  if (!body.location || typeof body.location !== "object" || JSON.stringify(body.location).length > 256000) throw new RequestError("定位附件无效");
  if (body.screenshot) {
    if (typeof body.screenshot.image !== "string" || !/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(body.screenshot.image)) throw new RequestError("截图必须为 PNG");
    const png = Buffer.from(body.screenshot.image.split(",")[1], "base64");
    if (!png.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) throw new RequestError("截图文件无效");
    ReadFramePacket(body.screenshot.frame, FLOW_TIMELINE);
  }
  return { ...body, frame, prompt: body.prompt.trim() };
}

function SpawnCodex(args, rootDir) {
  // Use the installed npm entry when present, avoiding .cmd quoting and shell execution.
  const npmEntry = path.join(process.env.APPDATA || "", "npm/node_modules/@openai/codex/bin/codex.js");
  const command = fs.existsSync(npmEntry) ? process.execPath : process.platform === "win32" ? "codex.exe" : "codex";
  return spawn(command, fs.existsSync(npmEntry) ? [npmEntry, ...args] : args, {
    cwd: rootDir, windowsHide: true, stdio: ["pipe", "pipe", "pipe"],
  });
}

export function CreateEncounterCodexHandler(rootDir, { spawnCodex = SpawnCodex } = {}) {
  const directory = path.join(rootDir, "tmp", "EncounterCodex");
  const active = new Map();
  const SessionPath = id => path.join(directory, id, "Session.json");
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
    if (session.status === "running" && !active.has(id)) {
      session.status = "failed";
      session.error = CLI_INTERRUPTED;
      Save(session);
    }
    return session;
  }
  function Start(session, turn, folder) {
    const output = path.join(folder, "Conclusion.txt");
    const args = ["exec"];
    if (session.cliSessionId) args.push("resume", session.cliSessionId);
    args.push("--json", "--output-last-message", output);
    if (turn.screenshot) args.push("--image", path.join(folder, "Screenshot.png"));
    args.push("-");
    const prompt = [
      "你正在处理 Encounter Designer 右侧会话提交的需求。遵循仓库 AGENTS.md，代码修改须在本会话独占的 worktree 中进行。",
      `编辑器检出目录为 ${rootDir}。当前帧、时间、世界坐标、相机与选中对象已自动保存到 ${path.join(folder, "Frame.json")} 和 ${path.join(folder, "Location.json")}，先读取附件。`,
      turn.screenshot ? `标注截图附在本条消息中，截图当时的帧信息在 ${path.join(folder, "ScreenshotFrame.json")}。` : "",
      "最终答复请用简洁中文给出处理结论、验证结果与尚未完成项。",
      "用户需求", turn.prompt,
    ].filter(Boolean).join("\n\n");
    session.status = "running";
    session.error = "";
    Save(session);
    let child;
    try { child = spawnCodex(args, rootDir); }
    catch (error) { session.status = "failed"; session.error = error.code === "ENOENT" ? CLI_MISSING : CLI_START_FAILURE; Save(session); return; }
    active.set(session.id, child);
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
        } catch { /* Other CLI events are deliberately discarded. */ }
      }
    });
    let finished = false;
    function Finish(code, error) {
      if (finished) return;
      finished = true;
      active.delete(session.id);
      const conclusion = fs.existsSync(output) ? fs.readFileSync(output, "utf8").trim() : "";
      session.status = code === 0 && conclusion ? "completed" : "failed";
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

  return async function Handle(request, response) {
    if (!LocalRequest(request)) { Send(response, 403, { error: "仅支持本机同源页面" }); return; }
    const route = new URL(request.url, "http://localhost").pathname.slice(PREFIX.length);
    try {
      if (request.method === "GET" && route === "/sessions") {
        const sessions = fs.existsSync(directory) ? fs.readdirSync(directory).filter(id => ID.test(id)).map(Load) : [];
        Send(response, 200, { sessions: sessions.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).map(({ id, title, status, updatedAt }) => ({ id, title, status, updatedAt })) });
        return;
      }
      const sessionRoute = /^\/sessions\/([a-f0-9-]{36})$/.exec(route);
      if (request.method === "GET" && sessionRoute) { Send(response, 200, Load(sessionRoute[1])); return; }
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
      const session = fs.existsSync(SessionPath(sessionId)) ? Load(sessionId) : null;
      if (turn.sessionId && !session) { Send(response, 404, { error: "会话不存在" }); return; }
      if (session?.messages.some(message => message.requestId === turnId)) { Send(response, 202, session); return; }
      const next = session || { id: sessionId, title: turn.prompt.slice(0, 32), messages: [], createdAt: now };
      if (active.has(next.id)) { Send(response, 409, { error: "当前会话正在执行，请等待结论" }); return; }
      const folder = path.join(directory, next.id, turnId);
      fs.mkdirSync(folder, { recursive: true });
      fs.writeFileSync(path.join(folder, "Frame.json"), JSON.stringify(turn.frame, null, 2));
      fs.writeFileSync(path.join(folder, "Location.json"), JSON.stringify(turn.location, null, 2));
      const attachmentBase = `${PREFIX}/attachments/${next.id}/${turnId}`;
      const message = { role: "user", requestId: turnId, text: turn.prompt, createdAt: now, frame: turn.frame.context, location: turn.location,
        frameUrl: `${attachmentBase}/Frame.json`, locationUrl: `${attachmentBase}/Location.json` };
      if (turn.screenshot) {
        fs.writeFileSync(path.join(folder, "Screenshot.png"), Buffer.from(turn.screenshot.image.split(",")[1], "base64"));
        fs.writeFileSync(path.join(folder, "ScreenshotFrame.json"), JSON.stringify(turn.screenshot.frame, null, 2));
        message.screenshotUrl = `${attachmentBase}/Screenshot.png`;
        message.screenshotFrame = turn.screenshot.frame.context;
      }
      next.messages.push(message);
      next.updatedAt = now;
      Start(next, turn, folder);
      Send(response, 202, next);
    } catch (error) {
      if (!response.headersSent) Send(response, error.code === "ENOENT" ? 404 : 400, {
        error: error instanceof RequestError ? error.message : error.code === "ENOENT" ? "会话或附件不存在" : "请求无效或本机会话文件无法读写",
      });
      else response.end();
    }
  };
}
