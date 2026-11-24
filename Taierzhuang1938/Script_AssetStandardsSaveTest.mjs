// Script_AssetStandardsSaveTest.mjs —— 资产规范配置器存盘口的闸门（纯 Node，秒级）
//
// 端点在 scripts/Script_LocalPreview.mjs：
//   GET  /__assetStandards/status → { writable, root, file, revision: sha1 | null }
//   POST /__assetStandards/save   { doc, revision } → 原子写 Taierzhuang1938/AssetPipeline/Data_AssetStandards.json（FormatAssetStandardsJson）
//
// 起一次真的 `Script_LocalPreview --root=<临时目录>`（里面放 AssetPipeline/ 的副本），验证：
//   ① status：本机可写、版本号 = 盘上原始字节的 sha1、外来 Host 报不可写；
//   ② 保存：写成 FormatAssetStandardsJson 的样子、回新版本号；
//   ③ 拒绝：版本号不符 409 / 没带 revision 400 / 坏规范 400 / 错 Content-Type 415 / 外来 Origin、Host 403 / GET 405 / 超大 body 413
//      —— 每一条之后盘上逐字节不变、没有 .tmp；
//   ④ 仓库里的 AssetPipeline/ 在测试前后逐字节相同。
//
// 跑法：node Taierzhuang1938/Script_AssetStandardsSaveTest.mjs

import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { ASSET_STANDARDS_REPO_PATH, FormatAssetStandardsJson, ValidateAssetStandards } from "./AssetPipeline/Script_AssetStandards.mjs";

const projectDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(projectDir, "..");
const previewScript = path.join(rootDir, "scripts", "Script_LocalPreview.mjs");
const repoPipeline = path.join(projectDir, "AssetPipeline");

let checks = 0;
const Check = (ok, message) => { assert.ok(ok, message); checks++; };
const Sha1 = (bytes) => crypto.createHash("sha1").update(bytes).digest("hex");

function Snapshot(dir, base = dir, out = new Map()) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const at = path.join(dir, entry.name);
    if (entry.isDirectory()) Snapshot(at, base, out);
    else out.set(path.relative(base, at), fs.readFileSync(at));
  }
  return out;
}
const Same = (a, b) => a.size === b.size && [...a].every(([k, v]) => b.has(k) && Buffer.compare(v, b.get(k)) === 0);

function StartPreview(root, port) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [previewScript, `--root=${root}`, "--no-open", String(port)], { cwd: root, stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    const timer = setTimeout(() => { child.kill(); reject(new Error(`预览服没起来：${out}`)); }, 20000);
    child.stdout.on("data", (chunk) => {
      out += chunk.toString("utf8");
      const match = /http:\/\/127\.0\.0\.1:(\d+)\/__preview\//.exec(out);
      if (!match) return;
      clearTimeout(timer);
      resolve({ port: Number(match[1]), Stop: () => new Promise((done) => { if (child.exitCode !== null) done(); else { child.once("close", done); child.kill(); } }) });
    });
    child.stderr.on("data", (chunk) => { out += chunk.toString("utf8"); });
    child.on("error", (error) => { clearTimeout(timer); reject(error); });
  });
}

function Request(port, { method = "GET", route, headers = {}, body = null }) {
  return new Promise((resolve, reject) => {
    const data = body === null ? null : Buffer.isBuffer(body) ? body : Buffer.from(body, "utf8");
    const sent = { ...(data ? { "Content-Length": data.length } : {}), ...headers };
    for (const key of Object.keys(sent)) if (sent[key] === null) delete sent[key];
    const request = http.request({ host: "127.0.0.1", port, method, path: route, headers: sent, timeout: 60000 }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => {
        const raw = Buffer.concat(chunks);
        let json = null;
        try { json = JSON.parse(raw.toString("utf8")); } catch { /* 不是 JSON */ }
        resolve({ status: response.statusCode, json, raw });
      });
    });
    request.on("timeout", () => request.destroy(new Error(`${method} ${route} 超时`)));
    request.on("error", (error) => (error.code === "ECONNRESET" || error.code === "EPIPE" ? resolve({ status: 0, json: null, raw: Buffer.alloc(0) }) : reject(error)));
    request.end(data ?? undefined);
  });
}

const Save = (port, payload, { headers = {}, raw = null } = {}) => Request(port, {
  method: "POST", route: "/__assetStandards/save",
  headers: { "Content-Type": "application/json", Origin: `http://127.0.0.1:${port}`, ...headers },
  body: raw ?? JSON.stringify(payload),
});

// ------------------------------------------------------------------- 准备
const repoBefore = Snapshot(repoPipeline);
const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "tz-assetstd-"));
const serveRoot = path.join(workDir, "tree");
fs.mkdirSync(path.join(serveRoot, "Taierzhuang1938"), { recursive: true });
fs.cpSync(repoPipeline, path.join(serveRoot, "Taierzhuang1938", "AssetPipeline"), { recursive: true });
fs.writeFileSync(path.join(serveRoot, "index.html"), "<!doctype html><title>t</title>\n", "utf8");
const specFile = path.join(serveRoot, ASSET_STANDARDS_REPO_PATH);
const servedPipeline = path.join(serveRoot, "Taierzhuang1938", "AssetPipeline");
const doc0 = JSON.parse(fs.readFileSync(specFile, "utf8"));
Check(ValidateAssetStandards(doc0).ok, "仓库里的规范本身过校验");

const preview = await StartPreview(serveRoot, 8300 + Math.floor(Math.random() * 600));
const port = preview.port;
try {
  // ① status
  const status = await Request(port, { route: "/__assetStandards/status" });
  Check(status.status === 200 && status.json?.writable === true && status.json.file === ASSET_STANDARDS_REPO_PATH
    && status.json.revision === Sha1(fs.readFileSync(specFile)), `status 本机可写、版本号 = 盘上 sha1：${status.raw.toString("utf8").slice(0, 200)}`);
  const foreign = await Request(port, { route: "/__assetStandards/status", headers: { Host: "evil.example" } });
  Check(foreign.status === 200 && foreign.json?.writable === false, "外来 Host：报不可写");

  // ② 保存
  const doc1 = JSON.parse(JSON.stringify(doc0));
  doc1.sceneRenderLimits.drawCalls += 1;
  doc1.externalGlb[0].note = `${doc1.externalGlb[0].note}（存盘测试）`;
  const rev0 = Sha1(fs.readFileSync(specFile));
  const ok = await Save(port, { doc: doc1, revision: rev0 });
  const written = fs.readFileSync(specFile);
  Check(ok.status === 200 && ok.json?.ok && ok.json.file === ASSET_STANDARDS_REPO_PATH, `保存 200：${ok.raw.toString("utf8").slice(0, 200)}`);
  Check(written.toString("utf8") === FormatAssetStandardsJson(doc1), "盘上写成 FormatAssetStandardsJson 的样子");
  Check(ok.json.revision === Sha1(written), "回的版本号 = 新文件的 sha1");

  // ③ 拒绝：每一条之后盘上逐字节不变
  const before = Snapshot(servedPipeline);
  const rev1 = ok.json.revision;
  const bad = JSON.parse(JSON.stringify(doc1)); bad.triangleRules.weapon.limit = -1;
  const duplicate = JSON.parse(JSON.stringify(doc1)); duplicate.externalGlb.push({ ...duplicate.externalGlb[0] });
  const cases = [
    ["版本号不符", Save(port, { doc: doc1, revision: rev0 }), 409],
    ["没带 revision", Save(port, { doc: doc1 }), 400],
    ["坏规范（负的分类上限）", Save(port, { doc: bad, revision: rev1 }), 400],
    ["坏规范（外部 GLB 编号重复）", Save(port, { doc: duplicate, revision: rev1 }), 400],
    ["错 Content-Type", Save(port, { doc: doc1, revision: rev1 }, { headers: { "Content-Type": "text/plain" } }), 415],
    ["外来 Origin", Save(port, { doc: doc1, revision: rev1 }, { headers: { Origin: "http://evil.example" } }), 403],
    ["外来 Host", Save(port, { doc: doc1, revision: rev1 }, { headers: { Host: "evil.example" } }), 403],
    ["坏 JSON", Save(port, null, { raw: "{" }), 400],
    ["GET", Request(port, { route: "/__assetStandards/save" }), 405],
    ["超大 body", Save(port, null, { raw: Buffer.alloc(3 * 1024 * 1024, 32) }), 413],
  ];
  for (const [name, pending, want] of cases) {
    const res = await pending;
    Check(res.status === want || (want === 413 && res.status === 0), `${name} → ${want}（实际 ${res.status} ${res.raw.toString("utf8").slice(0, 120)}）`);
    Check(Same(before, Snapshot(servedPipeline)), `${name}：盘上逐字节不变、没有 .tmp`);
  }
  const conflict = await Save(port, { doc: doc1, revision: rev0 });
  Check(conflict.json?.revision === rev1, "409 回当前版本号（配置器拿它提示重新读取）");
} finally {
  await preview.Stop();
  fs.rmSync(workDir, { recursive: true, force: true });
}
Check(Same(repoBefore, Snapshot(repoPipeline)), "仓库里的 AssetPipeline/ 前后逐字节相同");
console.log(`资产规范存盘口测试全过（${checks} 项）`);
