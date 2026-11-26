import assert from "node:assert/strict";
import net from "node:net";
import path from "node:path";
import { spawn, execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { DEFAULT_TEST_TTL_MS, FormatDuration, ParseTtlMs } from "./Script_LocalPreview.mjs";

const SCRIPT_PATH = fileURLToPath(new URL("./Script_LocalPreview.mjs", import.meta.url));
const REPO_ROOT = path.resolve(path.dirname(SCRIPT_PATH), "..");

function GetFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

async function WaitForPing(port, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/__preview/ping`, { signal: AbortSignal.timeout(500) });
      if (res.ok) return await res.json();
    } catch { /* wait */ }
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error(`端口 :${port} 在 ${timeoutMs}ms 内未就绪`);
}

function WaitForExit(child, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    if (child.exitCode !== null) { resolve(child.exitCode); return; }
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`子进程未在 ${timeoutMs}ms 内退出`));
    }, timeoutMs);
    child.once("exit", (code) => { clearTimeout(timer); resolve(code); });
  });
}

function SpawnPreview(args) {
  const child = spawn(process.execPath, [SCRIPT_PATH, ...args], {
    cwd: REPO_ROOT,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => { stdout += chunk.toString("utf8"); });
  child.stderr.on("data", (chunk) => { stderr += chunk.toString("utf8"); });
  return { child, getStdout: () => stdout, getStderr: () => stderr };
}

function RunCli(args) {
  return execFileSync(process.execPath, [SCRIPT_PATH, ...args], {
    cwd: REPO_ROOT,
    encoding: "utf8",
  });
}

async function RunTests() {
  // 1. ParseTtlMs & FormatDuration
  assert.equal(DEFAULT_TEST_TTL_MS, 2 * 60 * 60 * 1000);
  assert.equal(ParseTtlMs("2h"), 2 * 60 * 60 * 1000);
  assert.equal(ParseTtlMs("1.5h"), 90 * 60 * 1000);
  assert.equal(ParseTtlMs("30m"), 30 * 60 * 1000);
  assert.equal(ParseTtlMs("45s"), 45 * 1000);
  assert.equal(ParseTtlMs("120"), 120 * 1000);
  assert.equal(ParseTtlMs("250ms"), 250);
  assert.equal(ParseTtlMs("0"), null);
  assert.equal(ParseTtlMs("off"), null);
  assert.equal(ParseTtlMs("none"), null);
  assert.throws(() => ParseTtlMs("abc"));
  assert.throws(() => ParseTtlMs("-5m"));
  assert.equal(FormatDuration(2 * 60 * 60 * 1000), "2 小时");
  assert.equal(FormatDuration(30 * 60 * 1000), "30 分钟");
  assert.equal(FormatDuration(null), "不自动关闭");

  // 2. 默认测试服带 2 小时 TTL，且 --stop 只关同根目录服务
  {
    const port = await GetFreePort();
    const proc = SpawnPreview([String(port), "--no-open"]);
    try {
      const info = await WaitForPing(port);
      assert.equal(info.ttlMs, DEFAULT_TEST_TTL_MS);
      assert.equal(typeof info.startedAt, "number");
      assert.equal(info.expiresAt, info.startedAt + DEFAULT_TEST_TTL_MS);

      // 传不同的 --root 执行 --stop，不应误关当前服务
      const otherRoot = path.join(REPO_ROOT, "scripts");
      const noopOut = RunCli([String(port), "--stop", `--root=${otherRoot}`]);
      assert.match(noopOut, /未发现本目录正在运行的本地预览服/);
      const stillAlive = await WaitForPing(port, 1000);
      assert.equal(stillAlive.port, port);

      // 用同目录 --stop 平滑关闭
      const stopOut = RunCli([String(port), "--stop"]);
      assert.match(stopOut, new RegExp(`已关闭本目录预览服：:${port}`));
      const exitCode = await WaitForExit(proc.child);
      assert.equal(exitCode, 0);
    } finally {
      if (proc.child.exitCode === null) proc.child.kill("SIGKILL");
    }
  }

  // 3. --ttl 到期自动平滑退出
  {
    const port = await GetFreePort();
    const proc = SpawnPreview([String(port), "--no-open", "--ttl=350ms"]);
    try {
      const info = await WaitForPing(port);
      assert.equal(info.ttlMs, 350);
      const exitCode = await WaitForExit(proc.child, 4000);
      assert.equal(exitCode, 0);
      assert.match(proc.getStdout(), /已到达定时停服时间（350ms），本地预览平滑退出/);
    } finally {
      if (proc.child.exitCode === null) proc.child.kill("SIGKILL");
    }
  }

  // 4. --desktop 默认不定时关闭（ttlMs === null）
  {
    const port = await GetFreePort();
    const proc = SpawnPreview([String(port), "--desktop", "--no-open"]);
    try {
      const info = await WaitForPing(port);
      assert.equal(info.ttlMs, null);
      assert.equal(info.expiresAt, null);
      RunCli([String(port), "--stop"]);
      const exitCode = await WaitForExit(proc.child);
      assert.equal(exitCode, 0);
    } finally {
      if (proc.child.exitCode === null) proc.child.kill("SIGKILL");
    }
  }

  // 5. --no-ttl 显式禁用定时关闭
  {
    const port = await GetFreePort();
    const proc = SpawnPreview([String(port), "--no-open", "--no-ttl"]);
    try {
      const info = await WaitForPing(port);
      assert.equal(info.ttlMs, null);
      assert.equal(info.expiresAt, null);
      RunCli([String(port), "--stop"]);
      const exitCode = await WaitForExit(proc.child);
      assert.equal(exitCode, 0);
    } finally {
      if (proc.child.exitCode === null) proc.child.kill("SIGKILL");
    }
  }

  console.log("Script_LocalPreviewTest: 全部 5 组测试通过");
}

RunTests().catch((error) => {
  console.error("Script_LocalPreviewTest 失败：", error);
  process.exitCode = 1;
});
