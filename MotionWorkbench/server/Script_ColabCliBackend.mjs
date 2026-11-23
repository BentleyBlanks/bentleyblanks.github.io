import { execFile, spawn } from "node:child_process";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RUNNER_SCRIPT = path.resolve(__dirname, "..", "cloud", "colab_gemx_runner.py");
const DEFAULT_COLAB_CLI = path.join(os.homedir(), ".local", "bin", "colab.exe");

const idleStopTimers = new Map();
const activeSessionNames = new Set();

function resolveColabExe(config) {
  const candidates = [config?.colabCliPath, DEFAULT_COLAB_CLI].filter(Boolean);
  for (const c of candidates) {
    if (path.isAbsolute(c) && fs.existsSync(c)) return c;
  }
  return null;
}

function runColabCmd(exe, args, { timeoutMs = 15000 } = {}) {
  return new Promise((resolve, reject) => {
    execFile(
      exe,
      args,
      {
        timeout: timeoutMs,
        maxBuffer: 10 * 1024 * 1024,
        windowsHide: true,
        env: { ...process.env, NO_COLOR: "1", RICH_DISABLE: "1" },
      },
      (err, stdout, stderr) => {
        const out = `${stdout || ""}\n${stderr || ""}`.trim();
        if (err) {
          const e = new Error(out || err.message);
          e.killed = err.killed;
          e.code = err.code;
          return reject(e);
        }
        resolve(out);
      }
    );
  });
}

function parseSessionsOutput(text) {
  const sessions = [];
  for (const line of String(text || "").split(/\r?\n/)) {
    const clean = line.replace(/[│┃┌┐└┘├┤─━]/g, " ").trim();
    if (!clean || /^name\b/i.test(clean) || /^active\b/i.test(clean) || /^no active/i.test(clean)) continue;
    const m = /^([a-zA-Z0-9_.-]+)\s+(.+)$/.exec(clean);
    if (m) sessions.push({ name: m[1], detail: m[2].trim() });
  }
  return sessions;
}

function parseUsageOutput(text) {
  const str = String(text || "");
  const balMatch = /balance[:\s]+([0-9]+(?:\.[0-9]+)?)/i.exec(str) || /([0-9]+(?:\.[0-9]+)?)\s*compute\s*units/i.exec(str);
  const rateMatch = /rate[:\s]+([0-9]+(?:\.[0-9]+)?)/i.exec(str) || /([0-9]+(?:\.[0-9]+)?)\s*\/\s*h/i.exec(str);
  return {
    balance: balMatch ? Number(balMatch[1]) : null,
    hourlyRate: rateMatch ? Number(rateMatch[1]) : null,
    raw: str.slice(0, 400),
  };
}

function hasSavedColabToken() {
  // Check whether keyring / settings indicates prior OAuth or ADC login without popping up a browser
  const cfgDir = path.join(os.homedir(), ".config", "colab-cli");
  try {
    const files = fs.readdirSync(cfgDir);
    if (files.some((f) => /token|cred|oauth/i.test(f))) return true;
  } catch {
    // ignore
  }
  return false;
}

export async function checkColabCliHealth(config) {
  const exe = resolveColabExe(config);
  if (!exe) {
    return {
      backend: "colab_cli",
      configured: false,
      installed: false,
      loggedIn: false,
      online: false,
      activeJobs: 0,
      activeSessions: [],
      message: "未检出 colab CLI（uv tool install google-colab-cli）",
    };
  }

  let version = null;
  try {
    const vOut = await runColabCmd(exe, ["version"], { timeoutMs: 5000 });
    version = vOut.replace(/^Version:\s*/i, "").trim();
  } catch {
    version = "installed";
  }

  // Only call `colab sessions` / `colab usage` if the user has authorized or enabled probe,
  // using a short timeout so an unauthenticated OAuth prompt cannot hang the server.
  if (!config?.colabAuthorized && !hasSavedColabToken()) {
    return {
      backend: "colab_cli",
      configured: true,
      installed: true,
      loggedIn: false,
      online: false,
      version,
      cliPath: exe,
      activeJobs: 0,
      activeSessions: [],
      balance: null,
      hourlyRate: null,
      message: "Colab CLI 已装好，点击「一键登录 Colab」完成首次 Google 授权即可直连 Pro+ 算力",
    };
  }

  const t0 = Date.now();
  try {
    const [sessOut, usageOut] = await Promise.all([
      runColabCmd(exe, ["sessions"], { timeoutMs: 8000 }),
      runColabCmd(exe, ["usage"], { timeoutMs: 8000 }).catch(() => ""),
    ]);
    const sessions = parseSessionsOutput(sessOut);
    const usage = parseUsageOutput(usageOut);
    return {
      backend: "colab_cli",
      configured: true,
      installed: true,
      loggedIn: true,
      online: true,
      version,
      cliPath: exe,
      latencyMs: Date.now() - t0,
      activeJobs: sessions.length,
      activeSessions: sessions,
      balance: usage.balance,
      hourlyRate: usage.hourlyRate,
      message:
        usage.balance != null
          ? `Colab Pro+ 已连 · 余 ${usage.balance} 算力单元`
          : `Colab CLI 已连接（${sessions.length} 个活跃会话）`,
    };
  } catch (err) {
    return {
      backend: "colab_cli",
      configured: true,
      installed: true,
      loggedIn: false,
      online: false,
      version,
      cliPath: exe,
      activeJobs: 0,
      activeSessions: [],
      message: err.killed
        ? "等待首次 Google 授权，请点击「一键登录 Colab」"
        : `Colab CLI 待授权：${String(err.message || "").slice(0, 120)}`,
    };
  }
}

export function launchColabInteractiveLogin(config) {
  const exe = resolveColabExe(config);
  if (!exe) throw new Error("未找到 colab.exe，请先执行 uv tool install google-colab-cli");
  if (process.platform === "win32") {
    const psCmd = `& '${exe.replace(/'/g, "''")}' usage; Write-Host ''; Write-Host '登录完成后关闭此窗口，回到工作台点击「刷新」即可。' -ForegroundColor Green; Pause`;
    spawn("powershell.exe", ["-NoProfile", "-Command", `Start-Process powershell -ArgumentList '-NoProfile','-Command','${psCmd.replace(/'/g, "''")}'`], {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    }).unref();
    return { started: true, exe };
  }
  throw new Error("请在终端手动运行 colab usage 完成 OAuth 登录");
}

function clearIdleStopTimer(sessionName) {
  const t = idleStopTimers.get(sessionName);
  if (t) {
    clearTimeout(t);
    idleStopTimers.delete(sessionName);
  }
}

function scheduleIdleStop(exe, sessionName, autoStopSec, onLog) {
  clearIdleStopTimer(sessionName);
  const sec = Number(autoStopSec ?? 180);
  if (sec <= 0) {
    runColabCmd(exe, ["stop", "-s", sessionName], { timeoutMs: 20000 })
      .then(() => {
        activeSessionNames.delete(sessionName);
        onLog?.(`[Colab CLI] 已立即释放会话 ${sessionName}（零闲置扣费）`);
      })
      .catch(() => {});
    return;
  }
  onLog?.(`[Colab CLI] 任务完成，会话 ${sessionName} 将热保留 ${sec} 秒以加速下一条视频，超时自动停机释放算力`);
  const timer = setTimeout(() => {
    idleStopTimers.delete(sessionName);
    runColabCmd(exe, ["stop", "-s", sessionName], { timeoutMs: 20000 })
      .then(() => {
        activeSessionNames.delete(sessionName);
        onLog?.(`[Colab CLI] 空闲超时，已自动释放会话 ${sessionName}`);
      })
      .catch(() => {});
  }, sec * 1000);
  idleStopTimers.set(sessionName, timer);
}

export async function stopWorkbenchColabSessions(config) {
  const exe = resolveColabExe(config);
  if (!exe) return { stopped: [] };
  const stopped = [];
  const targets = new Set([...activeSessionNames, "mw_l4", "mw_a100"]);
  for (const name of targets) {
    clearIdleStopTimer(name);
    try {
      await runColabCmd(exe, ["stop", "-s", name], { timeoutMs: 15000 });
      stopped.push(name);
      activeSessionNames.delete(name);
    } catch {
      // session might not exist
    }
  }
  return { stopped };
}

export async function runColabMocapJob({
  config,
  videoPath,
  stem,
  precisionPreset = "standard_l4",
  outDir,
  onProgress,
  onTelemetry,
  onLog,
}) {
  const exe = resolveColabExe(config);
  if (!exe) throw new Error("未找到 colab.exe，请先安装 google-colab-cli");

  const isA100 = precisionPreset === "high_a100";
  const gpuVariant = isA100 ? "A100" : "L4";
  const sessionName = isA100 ? "mw_a100" : "mw_l4";

  clearIdleStopTimer(sessionName);
  await fsp.mkdir(outDir, { recursive: true });

  onProgress?.(5, `检查 Colab ${gpuVariant} 会话（${sessionName}）…`);
  let hasWarm = false;
  try {
    const sessOut = await runColabCmd(exe, ["sessions"], { timeoutMs: 12000 });
    const list = parseSessionsOutput(sessOut);
    hasWarm = list.some((s) => s.name === sessionName);
  } catch (err) {
    throw new Error(`Colab CLI 未授权或网络不可达，请先在「系统与资源」点击「一键登录 Colab」：${err.message}`);
  }

  if (hasWarm) {
    onLog?.(`[Colab CLI] 复用热机 ${gpuVariant} 会话：${sessionName}`);
  } else {
    onProgress?.(10, `正在申请 Colab ${gpuVariant} GPU 运行时…`);
    onLog?.(`[Colab CLI] colab new --gpu ${gpuVariant} -s ${sessionName}`);
    const newArgs = ["new", "--gpu", gpuVariant, "-s", sessionName];
    if (isA100) newArgs.push("--high-mem");
    await runColabCmd(exe, newArgs, { timeoutMs: 120000 });
    activeSessionNames.add(sessionName);
  }

  try {
    onProgress?.(16, "上传视频到 Colab 运行时（免 Google Drive）…");
    onLog?.(`[Colab CLI] colab upload ${path.basename(videoPath)} -> /content/mw_input.mp4`);
    await runColabCmd(exe, ["upload", videoPath, "/content/mw_input.mp4", "-s", sessionName], { timeoutMs: 180000 });

    onProgress?.(20, "启动远端 GEM-X 77 关节骨骼提取…");
    await new Promise((resolve, reject) => {
      const proc = spawn(
        exe,
        [
          "exec",
          "-s",
          sessionName,
          "-f",
          RUNNER_SCRIPT,
          "--timeout",
          "0",
          "--env",
          "GEMX_INPUT_MP4=/content/mw_input.mp4",
          "--env",
          "GEMX_OUTPUT_ZIP=/content/mw_output.zip",
          "--env",
          `GEMX_STEM=${stem}`,
          "--env",
          `GEMX_PRECISION=${precisionPreset}`,
        ],
        {
          windowsHide: true,
          env: { ...process.env, NO_COLOR: "1", RICH_DISABLE: "1" },
        }
      );

      let buf = "";
      const handleLine = (line) => {
        const trimmed = line.trim();
        if (!trimmed) return;
        if (trimmed.startsWith("[PROGRESS] ")) {
          const rest = trimmed.slice(11);
          const sep = rest.indexOf("|");
          if (sep > 0) {
            const pct = Number(rest.slice(0, sep));
            const lbl = rest.slice(sep + 1).trim();
            if (Number.isFinite(pct)) onProgress?.(pct, lbl);
          }
          return;
        }
        if (trimmed.startsWith("[TELEMETRY] ")) {
          try {
            onTelemetry?.(JSON.parse(trimmed.slice(12)));
          } catch {
            // ignore malformed json
          }
          return;
        }
        onLog?.(trimmed);
      };

      const feed = (chunk) => {
        buf += chunk.toString("utf8");
        const parts = buf.split(/\r?\n/);
        buf = parts.pop() || "";
        for (const p of parts) handleLine(p);
      };
      proc.stdout.on("data", feed);
      proc.stderr.on("data", feed);
      proc.on("error", reject);
      proc.on("close", (code) => {
        if (buf.trim()) handleLine(buf);
        if (code === 0) resolve();
        else reject(new Error(`Colab 远端 GEM-X 提骨退出异常 (code=${code})`));
      });
    });

    onProgress?.(94, "回传骨骼产物到本地工作区…");
    const zipPath = path.join(outDir, "mw_output.zip");
    await runColabCmd(exe, ["download", "/content/mw_output.zip", zipPath, "-s", sessionName], { timeoutMs: 180000 });

    onProgress?.(97, "解压并索引 GLB / FBX / BVH / USD…");
    await new Promise((resolve, reject) => {
      execFile(
        "powershell.exe",
        [
          "-NoProfile",
          "-Command",
          `Expand-Archive -LiteralPath '${zipPath.replace(/'/g, "''")}' -DestinationPath '${outDir.replace(/'/g, "''")}' -Force`,
        ],
        { windowsHide: true, timeout: 60000 },
        (err) => (err ? reject(err) : resolve())
      );
    });
    await fsp.rm(zipPath, { force: true }).catch(() => {});

    // Collect extracted files
    const files = {};
    const walk = async (dir) => {
      const entries = await fsp.readdir(dir, { withFileTypes: true });
      for (const e of entries) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) await walk(full);
        else {
          const rel = path.relative(outDir, full).replaceAll("\\", "/");
          const st = await fsp.stat(full);
          files[rel] = { relPath: rel, localPath: full, sizeBytes: st.size };
        }
      }
    };
    await walk(outDir);

    let summary = null;
    if (files["run_summary.json"]) {
      try {
        summary = JSON.parse(await fsp.readFile(files["run_summary.json"].localPath, "utf-8"));
      } catch {
        // ignore
      }
    }
    return { files, summary, sessionName, gpuVariant };
  } finally {
    scheduleIdleStop(exe, sessionName, config.colabAutoStopSec ?? 180, onLog);
  }
}
