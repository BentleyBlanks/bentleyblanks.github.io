// ===========================================================================
// Script_EditorBlockoutSaveTest.mjs —— 白盒关卡编辑器存档口的闸门（纯 Node，秒级）
//
// 契约：docs/Data_EditorBlockout.md §7、§10 第 2 行。端点在 scripts/Script_LocalPreview.mjs：
//   GET  /__blockout/status → { writable, root, revisions: { <Level>: sha1 | null } }
//   POST /__blockout/save   { level, doc, revision } → 原子写 Taierzhuang1938/Blockout/<Level>.json
//
// 起一次真的 `Script_LocalPreview --root=<临时目录>`（里面放 Blockout/ 与配置模块的副本），验证：
//   ① status：本机可写、版本号 = 盘上原始字节的 sha1、外来 Host 报不可写；
//   ② 别的口没受影响：/__preview/ping、/__tuning/status、静态读配置；
//   ③ 保存：写对文件（2 空格缩进 + 末尾换行）、回新版本号、新建文件只认 revision: null；
//   ④ 拒绝：坏 level / `..` / 超大 body / 坏配置 / 嵌套 20 万层（服务不能挂）/ GET / 错 Content-Type /
//      外来 Origin / 外来 Host / 版本号不符……每一条之后盘上逐字节不变、没有 .tmp；
//   ⑤ 非回环 socket（--lan，Host 伪造成 127.0.0.1）也被拒；拿不到局域网地址时跳过；
//   ⑥ 仓库里的 Blockout/ 在测试前后逐字节相同（端点只打临时目录）。
//
// 跑法：node Taierzhuang1938/Script_EditorBlockoutSaveTest.mjs
// ===========================================================================

import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

import { BLOCKOUT_LEVEL_KEYS, BlockoutConfigPath, ValidateBlockout } from "./Script_EditorBlockoutConfig.mjs";

const projectDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(projectDir, "..");
const previewScript = path.join(rootDir, "scripts", "Script_LocalPreview.mjs");
const repoBlockoutDir = path.join(projectDir, "Blockout");

let checks = 0;
function Check(condition, message) {
  assert.ok(condition, message);
  checks += 1;
}

const Sha1 = (bytes) => crypto.createHash("sha1").update(bytes).digest("hex");
const Clone = (value) => JSON.parse(JSON.stringify(value));

/** 目录下每个文件的相对路径 → 字节。 */
function SnapshotDir(dir, base = dir, out = new Map()) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const at = path.join(dir, entry.name);
    if (entry.isDirectory()) SnapshotDir(at, base, out);
    else out.set(path.relative(base, at).split(path.sep).join("/"), fs.readFileSync(at));
  }
  return out;
}

/** 两份快照的差异（空数组 = 逐字节相同）。 */
function SnapshotDiff(before, after) {
  const diff = [];
  for (const [name, bytes] of before) {
    if (!after.has(name)) diff.push(`少了 ${name}`);
    else if (Buffer.compare(bytes, after.get(name)) !== 0) diff.push(`变了 ${name}`);
  }
  for (const name of after.keys()) if (!before.has(name)) diff.push(`多了 ${name}`);
  return diff;
}

/** 目录里有没有留下 .tmp（原子写失手的唯一痕迹）。 */
function TempLeftovers(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const at = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...TempLeftovers(at));
    else if (entry.name.endsWith(".tmp")) out.push(at);
  }
  return out;
}

/** 起一次真的本地预览服，根指向 root；返回 { port, Stop() }。 */
function StartPreview(root, port, extra = []) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [previewScript, `--root=${root}`, "--no-open", String(port), ...extra],
      { cwd: root, stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    const timer = setTimeout(() => { child.kill(); reject(new Error(`预览服没起来：${out}`)); }, 20000);
    child.stdout.on("data", (chunk) => {
      out += chunk.toString("utf8");
      const match = /http:\/\/127\.0\.0\.1:(\d+)\/__preview\//.exec(out);
      if (!match) return;
      clearTimeout(timer);
      let stopping = null;
      resolve({
        port: Number(match[1]),
        // 可以调两次（正常路径停一次、finally 兜底再停一次），第二次直接拿第一次的结果。
        Stop: () => (stopping ??= new Promise((done) => {
          if (child.exitCode !== null || child.signalCode !== null) { done(); return; }
          child.once("close", done);
          child.kill();
        })),
      });
    });
    child.stderr.on("data", (chunk) => { out += chunk.toString("utf8"); });
    child.on("error", (error) => { clearTimeout(timer); reject(error); });
  });
}

/**
 * 用 node:http 直接发请求：fetch 不让改 Host 头，而外来 Host 正是要测的一条。
 * headers 里值为 null 的键会被删掉（用来测「不带 Origin」「不带 Content-Type」）。
 */
function Request(port, { method = "GET", route, headers = {}, body = null, address = "127.0.0.1" }) {
  return new Promise((resolve, reject) => {
    const data = body === null ? null : Buffer.isBuffer(body) ? body : Buffer.from(body, "utf8");
    const sent = { ...(data ? { "Content-Length": data.length } : {}), ...headers };
    for (const key of Object.keys(sent)) if (sent[key] === null) delete sent[key];
    const request = http.request({ host: address, port, method, path: route, headers: sent, timeout: 30000 }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => {
        const raw = Buffer.concat(chunks);
        let json = null;
        try { json = JSON.parse(raw.toString("utf8")); } catch { /* 静态 404 页之类不是 JSON */ }
        resolve({ status: response.statusCode, headers: response.headers, raw, json });
      });
    });
    request.on("timeout", () => request.destroy(new Error(`${method} ${route} 超时`)));
    request.on("error", reject);
    request.end(data ?? undefined);
  });
}

function Save(port, payload, { headers = {}, raw = null, address } = {}) {
  return Request(port, {
    method: "POST",
    route: "/__blockout/save",
    // 浏览器同源 POST 会带 Origin；默认按浏览器的样子发。
    headers: { "Content-Type": "application/json", Origin: `http://127.0.0.1:${port}`, ...headers },
    body: raw ?? JSON.stringify(payload),
    address,
  });
}

// ------------------------------------------------------------------- 准备
for (const level of BLOCKOUT_LEVEL_KEYS) {
  const file = path.join(rootDir, BlockoutConfigPath(level));
  Check(fs.existsSync(file), `仓库里有 ${BlockoutConfigPath(level)}`);
  const result = ValidateBlockout(JSON.parse(fs.readFileSync(file, "utf8")));
  Check(result.ok, `仓库里的 ${level} 配置本身过校验（否则「保存成功」那几条测不了）：${result.errors.slice(0, 3).join("；")}`);
}

const repoBefore = SnapshotDir(repoBlockoutDir);
const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "tz-blockout-"));
const serveRoot = path.join(workDir, "tree");
const serveProject = path.join(serveRoot, "Taierzhuang1938");
const serveBlockout = path.join(serveProject, "Blockout");
fs.mkdirSync(serveProject, { recursive: true });
fs.cpSync(repoBlockoutDir, serveBlockout, { recursive: true });
fs.copyFileSync(path.join(projectDir, "Script_EditorBlockoutConfig.mjs"), path.join(serveProject, "Script_EditorBlockoutConfig.mjs"));
fs.writeFileSync(path.join(serveRoot, "index.html"), "<!doctype html><title>t</title>\n", "utf8");

const fileOf = (level) => path.join(serveRoot, BlockoutConfigPath(level));
const docOf = (level) => JSON.parse(fs.readFileSync(fileOf(level), "utf8"));
const diskRevision = (level) => (fs.existsSync(fileOf(level)) ? Sha1(fs.readFileSync(fileOf(level))) : null);

// 8300–8899：避开 8080（用户自己的预览服）与 Chromium 的受限端口段。
const preview = await StartPreview(serveRoot, 8300 + Math.floor(Math.random() * 600));
const port = preview.port;
try {
  // ======================================================== ① status
  {
    const status = await Request(port, { route: "/__blockout/status" });
    const json = status.json;
    Check(status.status === 200 && json?.writable === true && path.resolve(json.root) === path.resolve(serveRoot),
      `GET /__blockout/status → ${status.status} ${status.raw.toString("utf8").slice(0, 200)}`);
    Check(/application\/json/.test(status.headers["content-type"]) && status.headers["cache-control"] === "no-store",
      "status 是不缓存的 JSON");
    Check(JSON.stringify(Object.keys(json.revisions).sort()) === JSON.stringify([...BLOCKOUT_LEVEL_KEYS].sort()),
      `revisions 列的正好是 BLOCKOUT_LEVEL_KEYS：${Object.keys(json.revisions).join(", ")}`);
    for (const level of BLOCKOUT_LEVEL_KEYS) {
      Check(json.revisions[level] === diskRevision(level), `${level} 的版本号 = 盘上原始字节的 sha1`);
    }

    const viaLocalhost = await Request(port, { route: "/__blockout/status", headers: { Host: `localhost:${port}` } });
    Check(viaLocalhost.json?.writable === true, "用 localhost 打开也报可写");
    for (const host of [`evil.example:${port}`, `127.0.0.1.evil.example:${port}`, `192.168.1.20:${port}`]) {
      const foreign = await Request(port, { route: "/__blockout/status", headers: { Host: host } });
      Check(foreign.status === 200 && foreign.json?.writable === false && typeof foreign.json.reason === "string" && foreign.json.reason,
        `Host=${host} 时 status 报不可写并给出原因：${JSON.stringify(foreign.json)}`);
    }
    const postStatus = await Request(port, { method: "POST", route: "/__blockout/status", headers: { "Content-Type": "application/json" }, body: "{}" });
    Check(postStatus.status === 405, `status 只收 GET（POST → ${postStatus.status}）`);
    console.log("ok  ① status：本机可写、版本号 = sha1(原始字节)、外来 Host 报不可写、只收 GET");
  }

  // =============================================== ② 别的口没受影响
  {
    const ping = await Request(port, { route: "/__preview/ping" });
    Check(ping.json?.app === "BlanksLocalPreview" && path.resolve(ping.json.root) === path.resolve(serveRoot), "索引页 ping 没受影响");
    const tuning = await Request(port, { route: "/__tuning/status" });
    Check(tuning.status === 200 && tuning.json?.writable === true, `调参口没被新路由挤掉：${JSON.stringify(tuning.json)}`);
    const page = await Request(port, { route: "/index.html" });
    Check(page.status === 200 && page.headers["cache-control"] === "no-store", "静态路由与响应头没受影响");
    const config = await Request(port, { route: "/Taierzhuang1938/Blockout/FirstLevel.json?t=1" });
    Check(config.status === 200 && /application\/json/.test(config.headers["content-type"])
      && Buffer.compare(config.raw, fs.readFileSync(fileOf("FirstLevel"))) === 0,
      "编辑器读配置走的静态路由照旧（逐字节等于盘上的文件）");
    console.log("ok  ② /__preview/ping、/__tuning/status、静态读配置都照旧");
  }

  // ============================================================ ③ 保存
  const firstRevision0 = diskRevision("FirstLevel");
  let firstRevision1 = null;
  {
    // 「记下当前机位」= 改第一个关键帧的 player 再整份存回去。
    const doc = docOf("FirstLevel");
    doc.keyframes[0].player = { ...doc.keyframes[0].player, x: doc.keyframes[0].player.x + 1.25, yawDeg: 12.5, stance: "crouch" };
    const saved = await Save(port, { level: "FirstLevel", doc, revision: firstRevision0 });
    Check(saved.status === 200 && saved.json?.ok === true && saved.json.level === "FirstLevel"
      && saved.json.file === "Taierzhuang1938/Blockout/FirstLevel.json" && Array.isArray(saved.json.warnings),
      `POST /__blockout/save → ${saved.status} ${saved.raw.toString("utf8").slice(0, 300)}`);
    const text = fs.readFileSync(fileOf("FirstLevel"), "utf8");
    Check(text === `${JSON.stringify(doc, null, 2)}\n`, "盘上的文件 = JSON.stringify(doc, null, 2) + 换行，一个字不差");
    Check(!text.includes("\r"), "写出来的是 LF，不带 CR");
    Check(ValidateBlockout(JSON.parse(text)).ok, "落盘的配置读回来仍过校验");
    Check(saved.json.revision === diskRevision("FirstLevel") && saved.json.revision !== firstRevision0,
      "回来的新版本号 = 新文件字节的 sha1");
    Check(TempLeftovers(serveRoot).length === 0, "成功那一次没留下 .tmp");
    firstRevision1 = saved.json.revision;

    const status = await Request(port, { route: "/__blockout/status" });
    Check(status.json?.revisions?.FirstLevel === firstRevision1, "status 立刻报新版本号");
    const read = await Request(port, { route: "/Taierzhuang1938/Blockout/FirstLevel.json?t=2" });
    Check(Sha1(read.raw) === firstRevision1, "编辑器下一次轮询读到的就是刚存的那份");

    // 用 localhost 打开的页面（Origin 跟着 Host 走）也能存；不带 Origin 的本机工具（curl / agent）也能存。
    const viaLocalhost = Clone(doc);
    viaLocalhost.keyframes[0].player.pitchDeg = -4;
    const second = await Save(port, { level: "FirstLevel", doc: viaLocalhost, revision: firstRevision1 },
      { headers: { Host: `localhost:${port}`, Origin: `http://localhost:${port}` } });
    Check(second.status === 200 && second.json?.revision === diskRevision("FirstLevel"),
      `localhost 同源页面能存：${second.status} ${JSON.stringify(second.json)}`);
    firstRevision1 = second.json.revision;

    const noOrigin = Clone(viaLocalhost);
    noOrigin.keyframes[0].what = "很长的一句话".repeat(20);
    const third = await Save(port, { level: "FirstLevel", doc: noOrigin, revision: firstRevision1 }, { headers: { Origin: null } });
    Check(third.status === 200 && third.json?.warnings?.some((line) => /what/.test(line)),
      `不带 Origin 的本机请求能存，超长文字只回警告不拒绝：${JSON.stringify(third.json?.warnings)}`);
    firstRevision1 = third.json.revision;
    Check(firstRevision1 === diskRevision("FirstLevel"), "三次保存后版本号仍与盘上一致");
  }
  {
    // 新建文件：只认 revision: null；文件在的时候 null 不算数。
    const secondDoc = docOf("SecondLevel");
    const oldRevision = diskRevision("SecondLevel");
    const frozen = SnapshotDir(serveBlockout);
    const nullOnExisting = await Save(port, { level: "SecondLevel", doc: secondDoc, revision: null });
    Check(nullOnExisting.status === 409 && nullOnExisting.json?.revision === oldRevision,
      `文件存在时 revision:null 回 409 并带上当前版本号：${nullOnExisting.status}`);
    Check(SnapshotDiff(frozen, SnapshotDir(serveBlockout)).length === 0, "那次 409 一个字节都没写");

    fs.rmSync(fileOf("SecondLevel"));
    const status = await Request(port, { route: "/__blockout/status" });
    Check(status.json?.revisions?.SecondLevel === null, "文件不在时 status 的版本号是 null");
    const staleOnMissing = await Save(port, { level: "SecondLevel", doc: secondDoc, revision: oldRevision });
    Check(staleOnMissing.status === 409 && staleOnMissing.json?.revision === null && !fs.existsSync(fileOf("SecondLevel")),
      `文件已被删掉时带旧版本号回 409、不新建：${staleOnMissing.status}`);
    const created = await Save(port, { level: "SecondLevel", doc: secondDoc, revision: null });
    Check(created.status === 200 && fs.existsSync(fileOf("SecondLevel")) && created.json.revision === diskRevision("SecondLevel"),
      `文件不在时 revision:null 新建成功：${created.status} ${JSON.stringify(created.json)}`);
    Check(fs.readFileSync(fileOf("SecondLevel"), "utf8") === `${JSON.stringify(secondDoc, null, 2)}\n`, "新建的文件内容对");
  }
  console.log("ok  ③ 保存：写对文件、回新版本号、status 与静态读立刻跟上、新建只认 revision:null");

  // =========================================================== ④ 拒绝
  {
    const goodDoc = docOf("FirstLevel");
    const current = diskRevision("FirstLevel");
    const frozen = SnapshotDir(serveProject);
    const cases = [];
    const Expect = async (name, wanted, promise) => {
      const result = await promise;
      cases.push(`${name} → ${result.status}`);
      Check(result.status === wanted && result.json?.ok === false && typeof result.json.error === "string",
        `${name}：期望 ${wanted}，实际 ${result.status} ${result.raw.toString("utf8").slice(0, 200)}`);
      const diff = SnapshotDiff(frozen, SnapshotDir(serveProject));
      Check(diff.length === 0, `${name} 被拒后盘上一个字节都没变：${diff.join("；")}`);
      Check(TempLeftovers(serveRoot).length === 0, `${name} 被拒后没留下 .tmp`);
      return result;
    };

    // 坏 level（含 ..、场景文件、大小写变体、Windows 保留名、非字符串）
    for (const level of ["../x", "..", "", "First Level", "FirstLevel/../..", "a/b", "..\\FirstLevel", "ThirdLevel",
      "CON", "firstlevel", "FirstLevel.json", "SecondLevel.scene", 42, null]) {
      await Expect(`level=${JSON.stringify(level)}`, 403, Save(port, { level, doc: goodDoc, revision: current }));
    }

    // 超大 body（> 4 MB，内容本身是合法 JSON）
    await Expect("超过 4 MB 的 body", 413, Save(port, null, {
      raw: JSON.stringify({ level: "FirstLevel", doc: goodDoc, revision: current, pad: "x".repeat(4 * 1024 * 1024 + 1024) }),
    }));

    // 坏配置 → 400 + details 点名路径
    const empty = await Expect("keyframes 为空", 400, Save(port, { level: "FirstLevel", doc: { ...goodDoc, keyframes: [] }, revision: current }));
    Check(Array.isArray(empty.json.details) && empty.json.details.some((line) => /keyframes/.test(line)), `details 点名 keyframes：${JSON.stringify(empty.json.details)}`);
    const broken = Clone(goodDoc);
    broken.keyframes[0].player.x = "东边";
    broken.keyframes[0].units = [{ id: "u1", side: "martian", x: 0, z: 0 }];
    const brokenResult = await Expect("坐标不是数、阵营不认识", 400, Save(port, { level: "FirstLevel", doc: broken, revision: current }));
    Check(brokenResult.json.details.some((line) => line.includes("keyframes[0].player"))
      && brokenResult.json.details.some((line) => line.includes("keyframes[0].units[0].side")),
      `details 带路径：${JSON.stringify(brokenResult.json.details)}`);
    await Expect("没有 doc", 400, Save(port, { level: "FirstLevel", revision: current }));
    await Expect("schema 不对", 400, Save(port, { level: "FirstLevel", doc: { ...goodDoc, schema: "tengxian-blockout/0" }, revision: current }));
    await Expect("配置里的 level 与请求不一致", 400, Save(port, { level: "FirstLevel", doc: docOf("SecondLevel"), revision: current }));
    await Expect("body 不是 JSON", 400, Save(port, null, { raw: "level=FirstLevel" }));
    await Expect("body 是数组", 400, Save(port, null, { raw: "[]" }));

    // 嵌套极深（20 万层，约 0.4 MB）：JSON.parse 收得下；校验器不看的字段要到 JSON.stringify 才栈溢出，
    // 校验器回显的字段（schema / side / kind）也不能整个 stringify。都得是 400 JSON，而且预览服务还活着
    // （它同时在服务所有 worktree，带倒一次所有页面一起断）。payload 只能手拼：这边 stringify 一样会栈溢出。
    const DEEP = `${"[".repeat(200000)}${"]".repeat(200000)}`;
    const DeepBody = (doc) => `{"level":"FirstLevel","revision":${JSON.stringify(current)},"doc":${JSON.stringify(doc).replace('"__DEEP__"', DEEP)}}`;
    const deepExtra = await Expect("doc 里多一个嵌套 20 万层的字段（校验器不看它）", 400,
      Save(port, null, { raw: DeepBody({ ...goodDoc, extra: "__DEEP__" }) }));
    Check(Array.isArray(deepExtra.json.details) && deepExtra.json.details.length > 0,
      `嵌套太深也带 details：${JSON.stringify(deepExtra.json.details)}`);
    await Expect("schema 是嵌套 20 万层的数组", 400, Save(port, null, { raw: DeepBody({ ...goodDoc, schema: "__DEEP__" }) }));
    const deepUnit = Clone(goodDoc);
    deepUnit.keyframes[0].units = [{ id: "deep", side: "__DEEP__", x: 0, z: 0 }];
    await Expect("单位的 side 是嵌套 20 万层的数组", 400, Save(port, null, { raw: DeepBody(deepUnit) }));
    const alive = await Request(port, { route: "/__preview/ping" });
    Check(alive.status === 200 && alive.json?.app === "BlanksLocalPreview", `嵌套极深的请求之后预览服务还活着：/__preview/ping → ${alive.status}`);
    const aliveStatus = await Request(port, { route: "/__blockout/status" });
    Check(aliveStatus.json?.revisions?.FirstLevel === current, "之后 status 照常回、版本号没变");

    // 方法
    await Expect("GET 保存口", 405, Request(port, { route: "/__blockout/save" }));
    await Expect("PUT 保存口", 405, Request(port, {
      method: "PUT", route: "/__blockout/save", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ level: "FirstLevel", doc: goodDoc, revision: current }),
    }));

    // Content-Type（text/plain 是浏览器跨站「简单请求」的样子）
    for (const type of ["text/plain", "application/x-www-form-urlencoded", "multipart/form-data; boundary=x", null]) {
      await Expect(`Content-Type=${type}`, 415, Save(port, { level: "FirstLevel", doc: goodDoc, revision: current }, { headers: { "Content-Type": type } }));
    }

    // Origin：外站、沙箱 iframe 的 "null"、同主机不同端口、Host 与 Origin 对不上
    for (const origin of ["http://evil.example", "null", "http://127.0.0.1:1", `http://localhost:${port}`, "not a url"]) {
      await Expect(`Origin=${origin}`, 403, Save(port, { level: "FirstLevel", doc: goodDoc, revision: current }, { headers: { Origin: origin } }));
    }

    // Host：DNS rebinding 的样子（socket 是回环，Host 是别人的域名，Origin 跟着它走所以「同源」）。
    // 不带 Host 的 HTTP/1.1 请求 node 自己就回 400，到不了端点，这里不测。
    for (const host of [`evil.example:${port}`, `127.0.0.1.evil.example:${port}`, `192.168.1.20:${port}`]) {
      await Expect(`Host=${host}`, 403, Save(port, { level: "FirstLevel", doc: goodDoc, revision: current },
        { headers: { Host: host, Origin: `http://${host}` } }));
    }

    // 版本号
    const stale = await Expect("过时的版本号", 409, Save(port, { level: "FirstLevel", doc: goodDoc, revision: firstRevision0 }));
    Check(stale.json.revision === current, "409 带回当前版本号，编辑器好提示「先重新读取」");
    await Expect("瞎编的版本号", 409, Save(port, { level: "FirstLevel", doc: goodDoc, revision: "0".repeat(40) }));
    await Expect("文件在时 revision:null", 409, Save(port, { level: "FirstLevel", doc: goodDoc, revision: null }));
    await Expect("不带 revision", 400, Save(port, { level: "FirstLevel", doc: goodDoc }));
    await Expect("revision 是数字", 400, Save(port, { level: "FirstLevel", doc: goodDoc, revision: 123 }));

    // 外部改了文件（人或 AI 直接改 JSON）之后，编辑器手里的旧版本号必须撞 409。
    const external = `${fs.readFileSync(fileOf("FirstLevel"), "utf8").trimEnd()}\n\n`;
    fs.writeFileSync(fileOf("FirstLevel"), external, "utf8");
    const afterExternal = await Save(port, { level: "FirstLevel", doc: goodDoc, revision: current });
    Check(afterExternal.status === 409 && afterExternal.json?.revision === Sha1(Buffer.from(external, "utf8"))
      && fs.readFileSync(fileOf("FirstLevel"), "utf8") === external,
      `文件被外部改过后旧版本号回 409、外部改动原样保留：${afterExternal.status}`);

    Check(!fs.existsSync(path.join(serveProject, "Blockout", "ThirdLevel.json")) && !fs.existsSync(path.join(serveRoot, "x.json")),
      "被拒的 level 没有在任何地方建出文件");
    console.log(`ok  ④ 拒绝：${cases.length} 种请求全被拒（坏 level / 超大 / 坏配置 / 嵌套太深 / 方法 / Content-Type / Origin / Host / 版本号），`
      + "每一条之后盘上逐字节不变、没有 .tmp");
  }
  await preview.Stop();

  // ================================== ⑤ 非回环 socket（起一次 --lan，从本机的局域网 IP 打过去）
  // Host 头可以伪造成 127.0.0.1，socket 地址伪造不了 —— 两道闸缺一不可。
  // 拿不到局域网地址（或者被防火墙挡住）时跳过：这条是环境相关的。
  const lanIp = Object.values(os.networkInterfaces()).flat()
    .find((net) => net && net.family === "IPv4" && !net.internal)?.address;
  if (!lanIp) {
    console.log("skip ⑤ 非回环拒绝：这台机器没有局域网 IPv4");
  } else {
    const lan = await StartPreview(serveRoot, 8300 + Math.floor(Math.random() * 600), ["--lan"]);
    try {
      const frozen = SnapshotDir(serveProject);
      const forged = { Host: `127.0.0.1:${lan.port}`, Origin: `http://127.0.0.1:${lan.port}` };
      let status;
      try {
        status = await Request(lan.port, { route: "/__blockout/status", address: lanIp, headers: forged });
      } catch (error) {
        console.log(`skip ⑤ 非回环拒绝：局域网口打不通（${String(error.message || error).slice(0, 80)}）`);
      }
      if (status) {
        Check(status.json?.writable === false, `非回环 socket 上 status 报不可写（哪怕 Host 写成 127.0.0.1）：${JSON.stringify(status.json)}`);
        const doc = docOf("FirstLevel");
        const save = await Save(lan.port, { level: "FirstLevel", doc, revision: diskRevision("FirstLevel") }, { address: lanIp, headers: forged });
        Check(save.status === 403 && save.json?.ok === false, `非回环 socket 上保存被拒：${save.status}`);
        Check(SnapshotDiff(frozen, SnapshotDir(serveProject)).length === 0 && TempLeftovers(serveRoot).length === 0,
          "非回环那次一个字节都没写、没有 .tmp");
        console.log(`ok  ⑤ 非回环拒绝：从 ${lanIp} 打过来（Host 伪造成 127.0.0.1）status 报不可写、保存 403`);
      }
    } finally {
      await lan.Stop();
    }
  }
} finally {
  await preview.Stop();
  fs.rmSync(workDir, { recursive: true, force: true });
}

// ================================================= ⑥ 仓库没被碰过
Check(!fs.existsSync(workDir), "临时目录清干净了");
const repoDiff = SnapshotDiff(repoBefore, SnapshotDir(repoBlockoutDir));
Check(repoDiff.length === 0, `仓库里的 Blockout/ 在测试前后逐字节相同：${repoDiff.join("；")}`);
Check(TempLeftovers(repoBlockoutDir).length === 0, "仓库里的 Blockout/ 没有 .tmp");
console.log("ok  ⑥ 仓库里的 Blockout/ 前后逐字节相同");

console.log(`\nEditorBlockoutSaveTest 通过：${checks} 条断言`);
