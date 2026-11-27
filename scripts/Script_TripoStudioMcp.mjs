import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createInterface } from "node:readline";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createWriteStream } from "node:fs";
import { setTimeout as Delay } from "node:timers/promises";
import { SpawnAppServer } from "./Script_EncounterCodexRunner.mjs";

const imageLimit = 20 * 1024 * 1024;
const modelLimit = 256 * 1024 * 1024;
const imageTypes = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp" };
const modelSettings = { family: "hd", model_version: "v3.1-20260211", texture: true, texture_quality: "standard", pbr: true };

async function Connect(cwd, signal) {
  signal.throwIfAborted();
  // Use the same CLI as codex mcp login. Desktop and CLI can have different OAuth support.
  const child = SpawnAppServer(cwd, ["-c", "mcp_servers.tripo.startup_timeout_sec=30"], { preferInstalledCli: true });
  const replies = createInterface({ input: child.stdout });
  const pending = new Map();
  let sequence = 0;
  let closed = false;
  function Finish() {
    closed = true;
    for (const answer of pending.values()) answer.reject(new Error("本机 Codex MCP 连接已断开"));
    pending.clear();
  }
  function Close() {
    signal.removeEventListener("abort", Close);
    child.kill();
    replies.close();
    Finish();
  }
  signal.addEventListener("abort", Close, { once: true });
  child.on("error", Finish);
  child.stdin.on("error", Finish);
  child.stderr.resume();
  replies.on("close", Finish);
  replies.on("line", line => {
    let event;
    try { event = JSON.parse(line); } catch { return; }
    if (event.method && event.id != null) {
      child.stdin.write(JSON.stringify({ id: event.id, error: { code: -32601, message: "No interactive requests" } }) + "\n");
      return;
    }
    const answer = pending.get(event.id);
    if (!answer) return;
    if (event.error) answer.reject(new Error("Codex MCP 请求失败，请检查 Tripo 注册和 OAuth 登录"));
    else answer.resolve(event.result);
  });
  async function Request(method, params) {
    signal.throwIfAborted();
    if (closed) throw new Error("本机 Codex MCP 连接已断开");
    const id = ++sequence;
    let timer;
    try {
      return await new Promise((resolve, reject) => {
        timer = setTimeout(() => reject(new Error("等待 Codex MCP 响应超时")), 90_000);
        pending.set(id, { resolve, reject });
        child.stdin.write(JSON.stringify({ id, method, params }) + "\n");
      });
    } finally {
      clearTimeout(timer);
      pending.delete(id);
    }
  }
  try {
    await Request("initialize", { clientInfo: { name: "tripo_model_workbench", version: "1.0.0" } });
    child.stdin.write('{"method":"initialized"}\n');
    const { thread } = await Request("thread/start", { cwd, ephemeral: true, approvalPolicy: "never" });
    return {
      close: Close,
      async call(tool, args) {
        const response = await Request("mcpServer/tool/call", { threadId: thread.id, server: "tripo", tool, arguments: args });
        const data = response.structuredContent || ParseToolText(response.content);
        if (response.isError) {
          const detail = data?.error || data;
          const code = /^[a-z_0-9-]{1,60}$/i.test(detail?.code) ? `（${detail.code}）` : "";
          const error = new Error(`Tripo MCP 拒绝了 ${tool}${code}。请检查 Studio 登录、权限和任务状态`);
          error.action = detail?.action || data?.action || "report";
          throw error;
        }
        if (!data) throw new Error("Tripo MCP 返回格式无法识别");
        return data;
      },
    };
  } catch (error) {
    Close();
    throw error;
  }
}

function ParseToolText(content) {
  try { return JSON.parse(content?.find(item => item.type === "text")?.text); } catch { return null; }
}

function HttpsUrl(value) {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password) throw new Error("Tripo 返回了无效的文件地址");
  return url;
}

async function Upload(call, image, signal, request) {
  const content_type = imageTypes[path.extname(image).toLowerCase()];
  const { size } = await fs.stat(image);
  if (!content_type || size < 1 || size > imageLimit) throw new Error("Tripo 参考图须为 20 MiB 以内的 PNG、JPEG 或 WebP");
  const bytes = await fs.readFile(image);
  const { upload_grant: grant } = await call("tripo_create_image_upload_grant", { content_type, size_bytes: bytes.length });
  const headers = new Headers(grant.required_headers);
  if (headers.has("content-type") && headers.get("content-type") !== content_type) throw new Error("Tripo 上传授权的 MIME 类型不匹配");
  headers.set("content-type", content_type);
  const result = await request(HttpsUrl(grant.upload_url), { method: "PUT", body: bytes, headers, redirect: "error", signal });
  await result.body?.cancel();
  if (!result.ok) throw new Error(`Tripo 参考图上传失败（HTTP ${result.status}）`);
  return grant.object_key;
}

async function Download(request, url, output, signal) {
  const result = await request(HttpsUrl(url), { redirect: "error", signal });
  if (!result.ok || !result.body || Number(result.headers.get("content-length")) > modelLimit) {
    await result.body?.cancel();
    throw new Error(`Tripo GLB 下载失败（HTTP ${result.status}）`);
  }
  const temporary = output + ".partial";
  let bytes = 0;
  try {
    await pipeline(Readable.fromWeb(result.body), async function* Limit(chunks) {
      for await (const chunk of chunks) {
        bytes += chunk.length;
        if (bytes > modelLimit) throw new Error("Tripo GLB 超过 256 MiB");
        yield chunk;
      }
    }, createWriteStream(temporary), { signal });
    const file = await fs.open(temporary, "r");
    try {
      const header = Buffer.alloc(20);
      const read = await file.read(header);
      const length = header.readUInt32LE(12);
      if (read.bytesRead !== 20 || header.toString("ascii", 0, 4) !== "glTF" || header.readUInt32LE(4) !== 2
          || header.readUInt32LE(8) !== bytes || header.toString("ascii", 16, 20) !== "JSON" || length > bytes - 20
          || length > 16 * 1024 * 1024) throw new Error("Tripo 返回的 GLB 文件不完整");
      const json = Buffer.alloc(length);
      await file.read(json, 0, length, 20);
      const model = JSON.parse(json.toString("utf8"));
      if (!model.meshes?.some(mesh => mesh.primitives?.some(primitive => Number.isInteger(primitive.attributes?.POSITION)))
          || [...(model.images || []), ...(model.buffers || [])].some(item => item.uri && !item.uri.startsWith("data:"))) {
        throw new Error("Tripo GLB 需要包含网格和内嵌资源");
      }
    } finally { await file.close(); }
    await fs.rename(temporary, output);
  } finally { await fs.rm(temporary, { force: true }); }
}

export async function GenerateTripoModel({ views, output, key, cwd, signal, progress = () => {} }, {
  connect = Connect, request = fetch, pollInterval = 5000,
} = {}) {
  signal = AbortSignal.any([...(signal ? [signal] : []), AbortSignal.timeout(30 * 60_000)]);
  const single = Object.hasOwn(views, "image");
  if (!single && (!views.front || !(views.left || views.right || views.back))) throw new Error("Tripo 多视图建模需要正面和至少一个侧面或背面");
  const tool = single ? "tripo_image_to_model" : "tripo_multiview_to_model";
  const journal = path.join(path.dirname(output), "Data_TripoStudio.json");
  await fs.mkdir(path.dirname(output), { recursive: true });
  async function Save(record) {
    await fs.writeFile(journal + ".tmp", JSON.stringify({ ...record, key, tool }));
    await fs.rename(journal + ".tmp", journal);
  }
  let record;
  try { record = JSON.parse(await fs.readFile(journal, "utf8")); }
  catch (error) { if (error.code !== "ENOENT") throw error; }
  if (record && (record.key !== key || record.tool !== tool)) throw new Error("Tripo 本地任务与本次参考图不匹配");
  if (record?.modelId) {
    const existing = await fs.stat(output).catch(error => { if (error.code !== "ENOENT") throw error; });
    if (existing?.isFile()) return { taskId: record.taskId, modelId: record.modelId };
  }
  let client;
  try {
    progress("正在连接 Tripo MCP");
    client = await connect(cwd, signal);
    const call = client.call;
    async function Recover() {
      const lookup = await call("tripo_get_model_task_by_idempotency_key", { creation_tool: tool, idempotency_key: key });
      if (lookup.admission_unconfirmed || !lookup.found || !lookup.task?.task_id) {
        throw new Error("Tripo 原任务是否受理仍待确认，已保留原提交记录");
      }
      return lookup.task;
    }
    let task;
    if (record?.taskId) {
      ({ task } = await call("tripo_get_model_task", { task_id: record.taskId }));
    } else if (record) {
      task = await Recover();
    } else {
      const args = { ...modelSettings, idempotency_key: key };
      for (const [view, image] of Object.entries(views)) {
        progress("正在上传本次选定的参考图至 Tripo");
        args[view === "image" ? "image_key" : view] = await Upload(call, image, signal, request);
      }
      await Save({});
      try {
        ({ task } = await call(tool, args));
      } catch (error) {
        if (error.action && error.action !== "recover_task") {
          await fs.rm(journal);
          throw error;
        }
        signal.throwIfAborted();
      }
      if (!task?.task_id) task = await Recover();
    }
    const taskId = task.task_id;
    await Save({ taskId });
    let lastStatus;
    while (!["success", "succeeded", "completed"].includes(task.status.toLowerCase())) {
      const status = task.status.toLowerCase();
      if (["failed", "failure", "canceled", "cancelled", "expired", "rejected", "banned", "error"].includes(status)) {
        throw new Error(`Tripo 任务结束（${status}，${taskId}）`);
      }
      if (status !== lastStatus) {
        progress(`Tripo 正在建模 · ${taskId}`);
        lastStatus = status;
      }
      await Delay(pollInterval, undefined, { signal });
      ({ task } = await call("tripo_get_model_task", { task_id: taskId }));
    }
    const modelId = task.model_ids?.[0];
    if (!modelId) throw new Error("Tripo 任务成功但未返回模型 ID");
    progress("正在下载并校验 Tripo GLB");
    const { model } = await call("tripo_get_model_asset", { model_id: modelId });
    if (!model?.model_url) throw new Error("Tripo 模型缺少 GLB 下载地址");
    await Download(request, model.model_url, output, signal);
    await Save({ taskId, modelId });
    return { taskId, modelId };
  } finally { client?.close(); }
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  try {
    const [image, output, key] = process.argv.slice(2);
    if (!image || !output || !key) throw new Error("需要输入图、目标 GLB 和任务标识");
    const result = await GenerateTripoModel({ views: { image }, output, key, cwd: process.cwd() });
    process.stdout.write(JSON.stringify(result));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
