import { execFile, spawn } from "node:child_process";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RUNNER_SCRIPT = path.resolve(__dirname, "..", "cloud", "colab_gemx_runner.py");
const H3_RUNNER_SCRIPT = path.resolve(__dirname, "..", "cloud", "colab_minimax_h3_runner.py");
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

function runColabCmd(exe, args, { timeoutMs = 15000, envExtra = null } = {}) {
  return new Promise((resolve, reject) => {
    execFile(
      exe,
      args,
      {
        timeout: timeoutMs,
        maxBuffer: 10 * 1024 * 1024,
        windowsHide: true,
        env: {
          ...process.env,
          NO_COLOR: "1",
          RICH_DISABLE: "1",
          PYTHONUNBUFFERED: "1",
          PYTHONUTF8: "1",
          ...(envExtra || {}),
        },
      },
      (err, stdout, stderr) => {
        const out = `${stdout || ""}\n${stderr || ""}`.trim();
        if (err) {
          const msg = err.killed
            ? `Colab 命令执行超时（已等待 ${Math.round(timeoutMs / 1000)} 秒，通常是当前 GPU 排队拥挤或代理波动；可重试或切换 L4/A100）。最后输出：${out || "无"}`
            : out || err.message;
          const e = new Error(msg);
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

let pendingAuthProc = null;
let pendingAuthUrl = null;

export function startColabOAuthFlow(config) {
  const exe = resolveColabExe(config);
  if (!exe) throw new Error("未找到 colab.exe，请先执行 uv tool install google-colab-cli");

  if (pendingAuthProc) {
    try { pendingAuthProc.kill(); } catch {}
    pendingAuthProc = null;
    pendingAuthUrl = null;
  }

  return new Promise((resolve, reject) => {
    const proc = spawn(exe, ["usage"], {
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, NO_COLOR: "1", RICH_DISABLE: "1", BROWSER: "echo" },
    });
    pendingAuthProc = proc;

    let settled = false;
    let buf = "";
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        reject(new Error("等待 Colab 授权链接超时，请重试"));
      }
    }, 15000);

    const onData = (chunk) => {
      buf += chunk.toString("utf8");
      const m = /(https:\/\/accounts\.google\.com\/o\/oauth2\/auth\S+)/.exec(buf);
      if (m && !settled) {
        settled = true;
        clearTimeout(timer);
        pendingAuthUrl = m[1].trim();
        resolve({ alreadyLoggedIn: false, authUrl: pendingAuthUrl });
      }
    };

    proc.stdout.on("data", onData);
    proc.stderr.on("data", onData);
    proc.on("error", (err) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        pendingAuthProc = null;
        reject(err);
      }
    });
    proc.on("close", (code) => {
      if (pendingAuthProc === proc) pendingAuthProc = null;
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        if (code === 0) {
          resolve({ alreadyLoggedIn: true, output: buf.trim() });
        } else {
          reject(new Error(buf.trim().slice(0, 200) || `colab usage 退出 (${code})`));
        }
      }
    });
  });
}

export function submitColabAuthCode(code) {
  const clean = String(code || "").trim();
  if (!clean) throw new Error("请粘贴 Google 页面显示的授权码");
  if (!pendingAuthProc || pendingAuthProc.killed) {
    throw new Error("授权会话已过期，请重新点击「登录 Colab」获取新链接");
  }
  const proc = pendingAuthProc;
  return new Promise((resolve, reject) => {
    let out = "";
    const timer = setTimeout(() => {
      reject(new Error("提交授权码超时，请重试"));
    }, 25000);
    const onData = (chunk) => {
      out += chunk.toString("utf8");
    };
    proc.stdout.on("data", onData);
    proc.stderr.on("data", onData);
    proc.once("close", (exitCode) => {
      clearTimeout(timer);
      if (pendingAuthProc === proc) pendingAuthProc = null;
      pendingAuthUrl = null;
      if (exitCode === 0) {
        resolve({ ok: true, output: out.trim() });
      } else {
        reject(new Error(out.trim().slice(0, 220) || `授权失败 (code=${exitCode})`));
      }
    });
    proc.stdin.write(`${clean}\n`);
    proc.stdin.end();
  });
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
  const targets = new Set([...activeSessionNames, "mw_l4", "mw_a100", "mw_h3_g4"]);
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
  const gpuChain = isA100 ? ["A100", "G4", "L4"] : ["L4", "A100", "G4"];
  let activeGpu = gpuChain[0];
  let sessionName = `mw_${activeGpu.toLowerCase()}`;

  await fsp.mkdir(outDir, { recursive: true });

  onProgress?.(5, "检查云端 GPU 会话");
  let existingSessions = [];
  try {
    const sessOut = await runColabCmd(exe, ["sessions"], { timeoutMs: 12000 });
    existingSessions = parseSessionsOutput(sessOut);
  } catch (err) {
    const raw = String(err?.message || "");
    if (/Enter the authorization code|accounts\.google\.com\/o\/oauth2|not authorized|credentials/i.test(raw)) {
      onLog?.(`[Colab CLI] 原始鉴权提示: ${raw.slice(0, 260)}`);
      throw new Error("Colab CLI 尚未完成 Google 授权，请点击「去登录 Colab」完成首次授权后再重试。");
    }
    throw new Error(`Colab CLI 连接失败（请检查网络或代理）：${raw.slice(0, 200)}`);
  }

  // Prefer any existing warm session matching our GPU chain
  const warmHit = gpuChain
    .map((g) => ({ gpu: g, name: `mw_${g.toLowerCase()}` }))
    .find((cand) => existingSessions.some((s) => s.name === cand.name));

  if (warmHit) {
    activeGpu = warmHit.gpu;
    sessionName = warmHit.name;
    clearIdleStopTimer(sessionName);
    onProgress?.(14, `复用热机 ${activeGpu} GPU`);
    onLog?.(`[Colab CLI] 复用热机 ${activeGpu} 会话：${sessionName}`);
  } else {
    let allocated = false;
    let lastAllocErr = "";
    for (let i = 0; i < gpuChain.length; i++) {
      const tryGpu = gpuChain[i];
      const trySession = `mw_${tryGpu.toLowerCase()}`;
      clearIdleStopTimer(trySession);
      onProgress?.(8 + i * 2, `申请 Colab ${tryGpu} GPU`);
      onLog?.(`[Colab CLI] colab new --gpu ${tryGpu} -s ${trySession}`);
      const newArgs = ["new", "--gpu", tryGpu, "-s", trySession];
      if (tryGpu === "A100") newArgs.push("--high-mem");
      try {
        await runColabCmd(exe, newArgs, {
          timeoutMs: 150000,
          envExtra: { COLAB_CLI_ASSIGN_RETRIES: "1", COLAB_CLI_RETRY_BACKOFF: "5" },
        });
        activeGpu = tryGpu;
        sessionName = trySession;
        activeSessionNames.add(sessionName);
        onLog?.(`[Colab CLI] 已分配 ${tryGpu} GPU 运行时 (${trySession})`);
        allocated = true;
        break;
      } catch (err) {
        const cleanErr = String(err?.message || "").replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "");
        const is503 = /Service Unavailable|503|Allocation refused|412|no quota|rejected accelerator|超时/i.test(cleanErr);
        const errTail = cleanErr.split(/\r?\n/).filter((l) => l.trim() && !/^[┌┐└┘│─\s]+$/.test(l)).slice(-2).join(" ");
        lastAllocErr = errTail || cleanErr.slice(0, 180);
        onLog?.(`[Colab CLI] ${tryGpu} 暂不可用 (${is503 ? "机房暂满/503" : "分配失败"}): ${lastAllocErr.slice(0, 160)}`);
        if (i + 1 < gpuChain.length) {
          onLog?.(`[Colab CLI] 自动切换备选 GPU → ${gpuChain[i + 1]}…`);
        }
      }
    }
    if (!allocated) {
      throw new Error(`Google Colab 当前 ${gpuChain.join("/")} GPU 均暂不可用（机房 503 满载），请稍后重试。详情：${lastAllocErr.slice(0, 180)}`);
    }
  }

  const jobKey = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  const remoteIn = `/content/mw_${jobKey}_input.mp4`;
  const remoteOut = `/content/mw_${jobKey}_output.zip`;

  try {
    onProgress?.(16, `上传视频到 ${activeGpu} 运行时`);
    onLog?.(`[Colab CLI] colab upload ${path.basename(videoPath)} -> ${remoteIn}`);
    await runColabCmd(exe, ["upload", videoPath, remoteIn, "-s", sessionName], { timeoutMs: 180000 });

    onProgress?.(20, "启动远端 GEM-X 77 骨推理");
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
          `GEMX_INPUT_MP4=${remoteIn}`,
          "--env",
          `GEMX_OUTPUT_ZIP=${remoteOut}`,
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

      const stripAnsi = (s) => String(s || "").replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "");
      let buf = "";
      let sawDone = false;
      let lastPyErr = "";
      const handleLine = (line) => {
        const trimmed = stripAnsi(line).trim();
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
        if (trimmed.startsWith("[DONE] ")) {
          sawDone = true;
          return;
        }
        if (/^(RuntimeError|FileNotFoundError|ModuleNotFoundError|ImportError|ValueError|OSError|CalledProcessError|CUDA out of memory|torch\.OutOfMemoryError)\b/i.test(trimmed)) {
          lastPyErr = trimmed;
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
        if (code === 0 && sawDone) resolve();
        else if (lastPyErr) reject(new Error(`云端 GEM-X 执行出错：${lastPyErr}`));
        else reject(new Error(`Colab 远端 GEM-X 提骨异常结束 (code=${code})，请展开日志查看详情`));
      });
    });

    onProgress?.(94, "回传骨骼产物到本地工作区");
    const zipPath = path.join(outDir, "mw_output.zip");
    await runColabCmd(exe, ["download", remoteOut, zipPath, "-s", sessionName], { timeoutMs: 180000 });

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
    return { files, summary, sessionName, gpuVariant: activeGpu };
  } finally {
    scheduleIdleStop(exe, sessionName, config.colabAutoStopSec ?? 180, onLog);
  }
}

let h3QueueTail = Promise.resolve();

export function runColabMiniMaxH3Job(opts) {
  const prev = h3QueueTail;
  let release;
  h3QueueTail = new Promise((r) => {
    release = r;
  });
  return (async () => {
    if (prev) {
      opts.onProgress?.("排队等待前一条 Colab G4 任务完成（完成后自动复用热机 61GB 权重）…");
      await prev.catch(() => {});
    }
    try {
      return await _runColabMiniMaxH3JobInner(opts);
    } finally {
      release();
    }
  })();
}

async function _runColabMiniMaxH3JobInner({
  config,
  prompt,
  duration = 6,
  resolution = "720p",
  startImagePath = null,
  endImagePath = null,
  outMp4Path,
  onProgress,
  onTelemetry,
  onLog,
}) {
  const exe = resolveColabExe(config);
  if (!exe) throw new Error("未找到 colab.exe，请先安装 google-colab-cli");

  const sessionName = "mw_h3_g4";
  clearIdleStopTimer(sessionName);
  await fsp.mkdir(path.dirname(outMp4Path), { recursive: true });

  onProgress?.("检查 Colab 96G G4 会话（mw_h3_g4）…");
  let hasWarm = false;
  try {
    const sessOut = await runColabCmd(exe, ["sessions"], { timeoutMs: 12000 });
    hasWarm = parseSessionsOutput(sessOut).some((s) => s.name === sessionName);
  } catch (err) {
    const raw = String(err?.message || "");
    if (/Enter the authorization code|accounts\.google\.com\/o\/oauth2|not authorized|credentials/i.test(raw)) {
      onLog?.(`[MiniMax-H3] 原始鉴权提示: ${raw.slice(0, 260)}`);
      throw new Error("Colab CLI 尚未完成 Google 授权，请点击「去登录 Colab」完成首次授权后再重试。");
    }
    throw new Error(`Colab CLI 连接失败：${raw.slice(0, 200)}`);
  }

  if (hasWarm) {
    onLog?.("[MiniMax-H3] 复用热机 Colab 96G G4 会话：mw_h3_g4");
  } else {
    onProgress?.("申请 Colab 96G G4 GPU 运行时…");
    onLog?.("[MiniMax-H3] colab new --gpu G4 -s mw_h3_g4");
    await runColabCmd(exe, ["new", "--gpu", "G4", "-s", sessionName], { timeoutMs: 240000 });
    activeSessionNames.add(sessionName);
  }

  try {
    const remoteStart = "/content/mw_h3_start.png";
    const remoteEnd = "/content/mw_h3_end.png";
    const envs = [
      `H3_PROMPT=${String(prompt || "").replace(/\r?\n/g, " ")}`,
      `H3_DURATION=${duration}`,
      `H3_RESOLUTION=${resolution}`,
      "H3_OUTPUT_MP4=/content/mw_h3_out.mp4",
      "H3_UPSCALE=1",
    ];
    if (startImagePath && fs.existsSync(startImagePath)) {
      onProgress?.("上传首帧分镜图到 G4 运行时…");
      await runColabCmd(exe, ["upload", startImagePath, remoteStart, "-s", sessionName], { timeoutMs: 120000 });
      envs.push(`H3_START_IMG=${remoteStart}`);
    }
    if (endImagePath && fs.existsSync(endImagePath)) {
      onProgress?.("上传尾帧分镜图到 G4 运行时…");
      await runColabCmd(exe, ["upload", endImagePath, remoteEnd, "-s", sessionName], { timeoutMs: 120000 });
      envs.push(`H3_END_IMG=${remoteEnd}`);
    }

    onProgress?.("启动 ComfyUI + MiniMax-H3 (44GB) 推理…");
    await new Promise((resolve, reject) => {
      const args = ["exec", "-s", sessionName, "-f", H3_RUNNER_SCRIPT, "--timeout", "0"];
      for (const kv of envs) args.push("--env", kv);
      const proc = spawn(exe, args, {
        windowsHide: true,
        env: { ...process.env, NO_COLOR: "1", RICH_DISABLE: "1" },
      });

      let buf = "";
      const handleLine = (line) => {
        const t = line.trim();
        if (!t) return;
        if (t.startsWith("[PROGRESS] ")) {
          const rest = t.slice(11);
          const sep = rest.indexOf("|");
          if (sep > 0) onProgress?.(rest.slice(sep + 1).trim());
          return;
        }
        if (t.startsWith("[TELEMETRY] ")) {
          try { onTelemetry?.(JSON.parse(t.slice(12))); } catch {}
          return;
        }
        onLog?.(t);
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
        else reject(new Error(`MiniMax-H3 (G4) 执行退出异常 (code=${code})`));
      });
    });

    onProgress?.("回传 MiniMax-H3 视频到本地…");
    await runColabCmd(exe, ["download", "/content/mw_h3_out.mp4", outMp4Path, "-s", sessionName], { timeoutMs: 180000 });
    const st = await fsp.stat(outMp4Path);
    return { localPath: outMp4Path, sizeBytes: st.size };
  } finally {
    // Release G4 immediately (or after idle window) so zero compute units are wasted
    scheduleIdleStop(exe, sessionName, config.colabAutoStopSec ?? 0, onLog);
  }
}
