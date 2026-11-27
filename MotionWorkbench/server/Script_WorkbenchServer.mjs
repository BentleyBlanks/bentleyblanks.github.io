import { execFile } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  createAndQuoteImageNode,
  createAndQuoteVideoNode,
  ensureWorkbenchCanvas,
  getDreaminaStatus,
  runAndDownloadNode,
  startDreaminaProfileLogin,
  uploadLocalResource,
} from "./Script_DreaminaBridge.mjs";
import {
  detectImageProviders,
  generateImageWithExternalProvider,
} from "./Script_ImageProviderBridge.mjs";
import {
  checkModalHealth,
  downloadModalJobArtifacts,
  pollModalMocapJob,
  submitModalMocapJob,
} from "./Script_MocapBackend.mjs";
import {
  checkColabCliHealth,
  runColabMiniMaxH3Job,
  runColabMocapJob,
  startColabOAuthFlow,
  stopWorkbenchColabSessions,
  submitColabAuthCode,
} from "./Script_ColabCliBackend.mjs";
import {
  launchRefinementCommand,
  writeRefinementBrief,
} from "./Script_BlenderRefineBridge.mjs";
import {
  buildLevel01Scene01Catalog,
  LIMB_COLOR_SUIT_RULE,
  SCENE_01_FLOORPLAN,
  WORKBENCH_CHARACTERS,
} from "./Data_Level01Scene01Catalog.mjs";
import { retargetSomaGlbToMixamo } from "./Script_SomaToMixamo.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKBENCH_ROOT = path.resolve(__dirname, "..");
const REPO_ROOT = path.resolve(WORKBENCH_ROOT, "..");
const WEB_DIR = path.join(WORKBENCH_ROOT, "web");
const WORKSPACE_DIR = path.join(WORKBENCH_ROOT, "_workspace");
const CONFIG_PATH = path.join(WORKSPACE_DIR, "config.json");
const TASKS_PATH = path.join(WORKSPACE_DIR, "tasks.json");
const SCHEDULE_PATH = path.join(WORKSPACE_DIR, "schedule.json");

const CASCADE_SCHEDULE_SLOTS = ["04:00", "06:00", "08:00", "12:00", "14:00", "16:00"];

const DEFAULT_SCHEDULE = {
  enabled: true,
  runTime: "04:00", // 默认从凌晨 04:00 起跑，失败沿 04:00→06:00→08:00→12:00→14:00→16:00 一路顺延
  cascadeSlots: [...CASCADE_SCHEDULE_SLOTS],
  fallbackRunTime: "16:00",
  autoDeferToAfternoon: true,
  autoStopAfterBatch: true,
  lastTriggeredDate: null,
  lastTriggeredSlots: {},
  runningBatch: false,
  items: [],
};

const rawPort = Number(
  process.env.WORKBENCH_PORT || (/^\d+$/.test(process.argv[2] || "") ? process.argv[2] : "") || 8788
);
const PORT = Number.isFinite(rawPort) && rawPort > 0 ? rawPort : 8788;
const HOST = "127.0.0.1";

const DEFAULT_CONFIG = {
  mocapBackend: "colab_cli", // "colab_cli" | "modal_serverless"
  colabCliPath: path.join(os.homedir(), ".local", "bin", "colab.exe"),
  colabAutoStopSec: 180,
  colabAuthorized: false,
  modalBaseUrl: "",
  modalApiToken: "",
  dreaminaCliPath: "C:\\Users\\admin\\bin\\dreamina-canvas.exe",
  dreaminaProfile: "default",
  dreaminaCanvasId: "338c67f0-ad69-483d-931e-b02b07dc2391",
  dreaminaCanvasIds: { default: "338c67f0-ad69-483d-931e-b02b07dc2391" },
  dreaminaCanvasUrl: "https://jimeng.jianying.com/ai-tool/ai-canvas/338c67f0-ad69-483d-931e-b02b07dc2391",
  exportMirrorDir: "C:\\Users\\Bentl\\OneDrive\\Sync\\饮河\\FPS\\视频转骨骼",
  refineCommandTemplate: 'codex exec "请严格按以下任务单操控 BlenderMCP 完成逐帧骨骼修缮：{{BRIEF_FILE}}"',
  defaultVideoModel: "seedance_2.5_flash",
  defaultVideoResolution: "480p",
  defaultVideoDuration: 10,
  storyboardImageProvider: "seedream",
  seedreamModel: "high_aes_general_v50_flash",
  seedreamResolution: "2K",
  cursorCliPath: "C:\\Users\\admin\\AppData\\Local\\cursor-agent\\agent.ps1",
  cursorGrokModel: "grok-4.7-xhigh",
  codexCliPath: "codex",
  codexModel: "",
  openaiApiKey: "",
  openaiBaseUrl: "https://api.openai.com",
  openaiImageModel: "gpt-image-1",
};

const recentLogs = [];
function pushSystemLog(line) {
  const ts = new Date().toTimeString().slice(0, 8);
  recentLogs.push(`[${ts}] ${line}`);
  if (recentLogs.length > 160) recentLogs.splice(0, recentLogs.length - 160);
}

async function checkActiveCloudHealth() {
  if (state.config.mocapBackend === "modal_serverless") {
    const m = await checkModalHealth(state.config.modalBaseUrl, state.config.modalApiToken);
    return { backend: "modal_serverless", ...m };
  }
  return checkColabCliHealth(state.config);
}

let probeCache = { dreamina: null, cloud: null, imageProviders: [], updatedAt: 0 };
let probeInflight = null;
async function getCachedProbes(forceRefresh = false) {
  const fresh = Date.now() - probeCache.updatedAt < 45_000 && probeCache.dreamina;
  if (!forceRefresh && fresh) return probeCache;
  if (probeInflight && !forceRefresh) return probeInflight;
  probeInflight = (async () => {
    const [dreamina, cloud] = await Promise.all([
      getDreaminaStatus(state.config.dreaminaCliPath, state.config.dreaminaProfile || "default"),
      checkActiveCloudHealth(),
    ]);
    const imageProviders = await detectImageProviders(state.config, dreamina);
    probeCache = { dreamina, cloud, imageProviders, updatedAt: Date.now() };
    return probeCache;
  })().finally(() => {
    probeInflight = null;
  });
  return probeInflight;
}

function sanitizeConfigForClient(cfg) {
  return {
    ...cfg,
    openaiApiKey: "",
    hasOpenaiApiKey: Boolean((cfg.openaiApiKey || "").trim() || (process.env.OPENAI_API_KEY || "").trim()),
    modalApiToken: cfg.modalApiToken ? "••••••••" : "",
    hasModalApiToken: Boolean((cfg.modalApiToken || "").trim()),
  };
}

let state = {
  config: { ...DEFAULT_CONFIG },
  tasks: [],
  schedule: { ...DEFAULT_SCHEDULE, items: [] },
};

const activePollers = new Map();
const activeJobs = new Map();

function mimeTypeOf(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const map = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".mjs": "application/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".mp4": "video/mp4",
    ".webm": "video/webm",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".glb": "model/gltf-binary",
    ".fbx": "application/octet-stream",
    ".bvh": "text/plain; charset=utf-8",
    ".usd": "application/octet-stream",
    ".md": "text/markdown; charset=utf-8",
    ".woff2": "font/woff2",
    ".svg": "image/svg+xml",
    ".wasm": "application/wasm",
  };
  return map[ext] || "application/octet-stream";
}

async function saveConfig(cfg) {
  state.config = { ...DEFAULT_CONFIG, ...cfg };
  await fsp.mkdir(WORKSPACE_DIR, { recursive: true });
  await fsp.writeFile(CONFIG_PATH, JSON.stringify(state.config, null, 2), "utf-8");
}

async function saveSchedule() {
  await fsp.mkdir(WORKSPACE_DIR, { recursive: true });
  await fsp.writeFile(SCHEDULE_PATH, JSON.stringify(state.schedule, null, 2), "utf-8");
}

function localDateKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function localTimeHHMM(d = new Date()) {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function parseHHMMToMinutes(str, fallbackMin = 360) {
  const [hh, mm] = String(str || "").split(":").map(Number);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return fallbackMin;
  return hh * 60 + mm;
}

function getOrderedScheduleSlots(sch) {
  const base = Array.isArray(sch?.cascadeSlots) && sch.cascadeSlots.length
    ? sch.cascadeSlots
    : CASCADE_SCHEDULE_SLOTS;
  const set = new Set(base.filter((s) => /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(String(s || ""))));
  if (sch?.runTime && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(sch.runTime)) {
    set.add(sch.runTime);
  }
  return [...set].sort((a, b) => parseHHMMToMinutes(a) - parseHHMMToMinutes(b));
}

function getNearestUpcomingSlot(sch, now = new Date()) {
  const slots = getOrderedScheduleSlots(sch);
  if (!slots.length) return sch?.runTime || "06:00";
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const today = localDateKey(now);
  const triggeredSlots = sch?.lastTriggeredSlots || {};
  for (const slot of slots) {
    const slotMin = parseHHMMToMinutes(slot, -1);
    if (slotMin > nowMin && triggeredSlots[slot] !== today) {
      return slot;
    }
  }
  // All today's slots have passed -> wrap to tomorrow's earliest slot (04:00)
  return slots[0];
}

function computeNextRunText(sch) {
  if (!sch.enabled) return "已暂停自动触发（仍可手动点「立即执行队列」）";
  const pendingItems = (sch.items || []).filter((x) => x.status === "pending");
  if (sch.runningBatch) return "正在执行错峰队列…";
  const now = new Date();
  const today = localDateKey(now);
  const triggeredSlots = sch.lastTriggeredSlots || {};
  if (!pendingItems.length) {
    const nearest = getNearestUpcomingSlot(sch, now);
    const [hh, mm] = String(nearest).split(":").map(Number);
    const target = new Date(now);
    target.setHours(Number.isFinite(hh) ? hh : 4, Number.isFinite(mm) ? mm : 0, 0, 0);
    if (target.getTime() <= now.getTime() || triggeredSlots[nearest] === today) {
      target.setDate(target.getDate() + 1);
    }
    const diffMin = Math.max(1, Math.round((target.getTime() - now.getTime()) / 60000));
    const dh = Math.floor(diffMin / 60);
    const dm = diffMin % 60;
    const isToday = target.getDate() === now.getDate();
    return `最近档位：${isToday ? "今天" : "明天"} ${nearest}（约 ${dh > 0 ? `${dh} 小时 ` : ""}${dm} 分钟后，队列当前为空）`;
  }
  const slotMap = new Map();
  for (const it of pendingItems) {
    const slot = it.scheduledTime || getNearestUpcomingSlot(sch, now);
    slotMap.set(slot, (slotMap.get(slot) || 0) + 1);
  }

  let best = null;
  for (const [slot, cnt] of slotMap.entries()) {
    const [hh, mm] = String(slot).split(":").map(Number);
    const target = new Date(now);
    target.setHours(Number.isFinite(hh) ? hh : 6, Number.isFinite(mm) ? mm : 0, 0, 0);
    const alreadyTriggeredToday =
      triggeredSlots[slot] === today || (!Object.keys(triggeredSlots).length && slot === sch.runTime && sch.lastTriggeredDate === today);
    if (target.getTime() <= now.getTime() || alreadyTriggeredToday) {
      target.setDate(target.getDate() + 1);
    }
    if (!best || target.getTime() < best.target.getTime()) {
      best = { slot, cnt, target };
    }
  }
  const diffMin = Math.max(1, Math.round((best.target.getTime() - now.getTime()) / 60000));
  const dh = Math.floor(diffMin / 60);
  const dm = diffMin % 60;
  const isToday = best.target.getDate() === now.getDate();
  const hasDeferred = pendingItems.some((x) => (x.scheduledTime || sch.runTime) === best.slot && x.deferredFrom);
  return `下次触发：${isToday ? "今天" : "明天"} ${best.slot}（约 ${dh > 0 ? `${dh} 小时 ` : ""}${dm} 分钟后，待跑 ${best.cnt} 项${hasDeferred ? " · 含顺延" : ""}）`;
}

function hydrateScheduleForClient() {
  const nearestSlot = getNearestUpcomingSlot(state.schedule);
  return {
    ...state.schedule,
    nearestSlot,
    nextRunText: computeNextRunText(state.schedule),
    pendingCount: (state.schedule.items || []).filter((x) => x.status === "pending").length,
    serverTime: localTimeHHMM(),
  };
}

const ONE_TAKE_VIDEO_GUARD =
  "【硬性镜头约束】全程一镜到底（single continuous unbroken take），固定三脚架机位绝不移动，严禁切镜头、严禁分镜跳转、严禁转场与景别突变，保证角色动作全程连贯衔接。";

function enforceOneTakeVideoPrompt(rawPrompt) {
  const base = String(rawPrompt || "").trim();
  if (!base) return ONE_TAKE_VIDEO_GUARD;
  if (/一镜到底|严禁切镜头|unbroken take/i.test(base)) return base;
  return `${ONE_TAKE_VIDEO_GUARD}${base}`;
}

function launchMiniMaxH3Take(task, { resolution, duration, prompt } = {}) {
  const shots = task.storyboard?.shots || [];
  const readyShots = shots.filter((s) => s.status === "succeeded" && s.localPath);
  const startShot = readyShots.find((s) => s.lockRole === "start") || readyShots[0] || null;
  const endShot = readyShots.find((s) => s.lockRole === "end") || null;
  const dur = Number(duration || task.durationSec || 6);
  const resVal = resolution || task.storyboard?.qualityPreset || "720p";

  const takeId = `take_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`;
  const takeNum = (task.stage3?.takes?.length || 0) + 1;
  const outPath = path.join(WORKSPACE_DIR, "tasks", task.id, "videos", `${task.id}_h3_take${takeNum}.mp4`);
  const nowMs = Date.now();
  const appendTakeLog = (entry, rawLine) => {
    const line = String(rawLine || "").trim();
    if (!line) return;
    const ts = new Date().toTimeString().slice(0, 8);
    const formatted = /^\[\d\d:\d\d:\d\d\]/.test(line) ? line : `[${ts}] ${line}`;
    entry.logs = entry.logs || [];
    if (entry.logs[entry.logs.length - 1] !== formatted) {
      entry.logs.push(formatted);
      if (entry.logs.length > 160) entry.logs.splice(0, entry.logs.length - 160);
    }
    entry.updatedAt = Date.now();
  };
  const updateH3Progress = (entry, text) => {
    const s = String(text || "");
    const prev = Number(entry.progress || 5);
    let next = prev;
    if (/排队|等待上一条|申请.*GPU|colab new/i.test(s)) next = Math.max(next, 8);
    else if (/已分配|复用热机|上传首帧|上传尾帧/i.test(s)) next = Math.max(next, 16);
    else if (/下载|aria2|safetensors|权重/i.test(s)) {
      const mPct = /\((\d{1,3})%\)/.exec(s);
      if (mPct) {
        const dlPct = Math.max(0, Math.min(100, Number(mPct[1])));
        next = Math.max(next, Math.round(20 + dlPct * 0.36));
      } else {
        next = Math.max(next, 24);
      }
    } else if (/ComfyUI|推理|采样|denois|sampler|加载模型|FL2V|Turbo/i.test(s)) {
      const mStep = /(\d+)\s*\/\s*(\d+)/.exec(s);
      if (mStep && Number(mStep[2]) > 0 && Number(mStep[2]) <= 100) {
        const r = Math.max(0, Math.min(1, Number(mStep[1]) / Number(mStep[2])));
        next = Math.max(next, Math.round(58 + r * 28));
      } else {
        next = Math.max(next, 62);
      }
    } else if (/超分|RealESRGAN|upscale|1080p/i.test(s)) next = Math.max(next, 88);
    else if (/回传|下载成片|download/i.test(s)) next = Math.max(next, 94);
    entry.progress = Math.min(99, next);
  };
  const takeEntry = {
    id: takeId,
    label: `Take #${takeNum} · MiniMax-H3 (G4 96G) ${resVal} ${dur}s`,
    model: "minimax_h3_colab",
    resolution: resVal,
    duration: dur,
    status: "running",
    progress: 6,
    progressText: "正在通过 Colab CLI 启动 96G G4…",
    logs: [],
    createdAt: nowMs,
    updatedAt: nowMs,
  };
  appendTakeLog(
    takeEntry,
    `[MiniMax-H3] 提交任务 ${task.beatCode} · ${resVal} · ${dur}s · ${startShot && endShot ? "首尾帧 FL2V" : startShot ? "首帧 I2V" : "文生视频 T2V"}`
  );
  task.stage3.takes.unshift(takeEntry);
  task.updatedAt = nowMs;

  const donePromise = runColabMiniMaxH3Job({
    config: state.config,
    prompt: enforceOneTakeVideoPrompt(prompt || task.stage1.videoPrompt),
    duration: dur,
    resolution: resVal,
    startImagePath: startShot?.localPath || null,
    endImagePath: endShot && endShot !== startShot ? endShot.localPath : null,
    outMp4Path: outPath,
    onProgress: (msg) => {
      takeEntry.progressText = msg;
      updateH3Progress(takeEntry, msg);
      appendTakeLog(takeEntry, `[MiniMax-H3] ${msg}`);
    },
    onLog: (line) => {
      updateH3Progress(takeEntry, line);
      appendTakeLog(takeEntry, line);
      pushSystemLog(line);
    },
  })
    .then(async (resH3) => {
      takeEntry.status = "succeeded";
      takeEntry.progress = 100;
      takeEntry.localPath = resH3.localPath;
      takeEntry.sizeBytes = resH3.sizeBytes;
      takeEntry.progressText = "MiniMax-H3 成片已回传本地";
      takeEntry.finishedAt = Date.now();
      appendTakeLog(takeEntry, `[完成] MiniMax-H3 成片已回传本地 (${Math.round((resH3.sizeBytes || 0) / 1024)} KB)`);
      task.stage3.selectedTakeId = takeEntry.id;
      task.updatedAt = Date.now();
      await saveTasks();
      return takeEntry;
    })
    .catch(async (err) => {
      takeEntry.status = "failed";
      takeEntry.error = err.message;
      takeEntry.progressText = `失败: ${err.message}`;
      takeEntry.finishedAt = Date.now();
      appendTakeLog(takeEntry, `[失败] ${err.message}`);
      task.updatedAt = Date.now();
      await saveTasks();
      throw err;
    });

  return { takeEntry, donePromise };
}

function launchColabMocapRun(task, { take, precisionPreset = "standard_l4" }) {
  const jobId = `colab_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`;
  const outDir = path.join(WORKSPACE_DIR, "tasks", task.id, "mocap", jobId);
  const stem = path.basename(take.localPath, path.extname(take.localPath));
  const gpuLabel = precisionPreset === "high_a100" ? "A100" : "L4";

  const run = {
    jobId,
    backend: "colab_cli",
    takeId: take.id,
    status: "running",
    stage: "starting_gpu",
    stageLabel: `正在通过 Colab CLI 申请 ${gpuLabel} GPU…`,
    progress: 4,
    createdAt: Date.now(),
    files: {},
    telemetry: null,
    containerState: "starting_gpu",
    logs: [`[Colab CLI] 提交 ${path.basename(take.localPath)} -> ${gpuLabel} (${precisionPreset})`],
  };
  task.stage4.runs.unshift(run);
  task.stage4.activeRunId = run.jobId;
  task.updatedAt = Date.now();

  const donePromise = runColabMocapJob({
    config: state.config,
    videoPath: take.localPath,
    stem,
    precisionPreset,
    outDir,
    onProgress: (pct, label) => {
      run.progress = pct;
      run.stageLabel = label;
    },
    onTelemetry: (tm) => {
      run.telemetry = tm;
      run.containerState = "running";
    },
    onLog: (line) => {
      run.logs.push(line);
      if (run.logs.length > 140) run.logs.splice(0, run.logs.length - 140);
      pushSystemLog(line);
    },
  })
    .then(async (resJob) => {
      run.status = "succeeded";
      run.stage = "done";
      run.progress = 100;
      run.finishedAt = Date.now();
      run.files = resJob.files;
      run.summary = resJob.summary;
      run.containerState = "scaled_to_zero";
      run.stageLabel = `已完成（Colab ${resJob.gpuVariant} · GEM-X 77 骨）`;
      try {
        ensureMixamoRetargetForTask(task);
      } catch (reErr) {
        run.logs.push(`[Retarget] 自动重定向警告：${reErr.message}`);
      }
      task.updatedAt = Date.now();
      await saveTasks();
      return run;
    })
    .catch(async (err) => {
      run.status = "failed";
      run.stage = "failed";
      run.stageLabel = `失败：${err.message}`;
      run.containerState = "scaled_to_zero";
      run.logs.push(`[Colab CLI 失败] ${err.message}`);
      task.updatedAt = Date.now();
      await saveTasks();
      throw err;
    });

  return { run, donePromise };
}

async function runScheduledBatch(triggerReason = "定时触发", { targetSlot = null } = {}) {
  if (state.schedule.runningBatch) return { started: false, reason: "定时队列已在执行中" };
  const defaultSlot = state.schedule.runTime || "06:00";
  const pendingAll = (state.schedule.items || []).filter((x) => {
    if (x.status !== "pending") return false;
    if (!targetSlot) return true;
    return (x.scheduledTime || defaultSlot) === targetSlot;
  });
  if (!pendingAll.length) return { started: false, reason: "队列中没有等待执行的任务" };

  const slotsOrder = Array.isArray(state.schedule.cascadeSlots) && state.schedule.cascadeSlots.length
    ? state.schedule.cascadeSlots
    : CASCADE_SCHEDULE_SLOTS;
  const findNextCascadeSlot = (item) => {
    if (state.schedule.autoDeferToAfternoon === false) return null;
    const itemSlot = targetSlot || item.scheduledTime || defaultSlot;
    const itemMin = parseHHMMToMinutes(itemSlot, 4 * 60);
    const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
    const minCutoff = Math.max(itemMin, nowMin);
    const next = slotsOrder.find((s) => parseHHMMToMinutes(s, -1) > minCutoff);
    return next || null;
  };
  const deferItemToNextSlot = (item, nextSlot, reasonText) => {
    const prevSlot = targetSlot || item.scheduledTime || defaultSlot;
    item.status = "pending";
    item.deferredFrom = prevSlot;
    item.deferHistory = [...(item.deferHistory || []), prevSlot];
    item.scheduledTime = nextSlot;
    item.deferredAt = Date.now();
    item.finishedAt = null;
    item.message = `${prevSlot} 重试 3 次仍失败，已自动顺延至今日 ${nextSlot} 队列（已顺延 ${item.deferHistory.length} 次 · ${String(reasonText || "").slice(0, 110)}）`;
    pushSystemLog(`[错峰定时队列] ${item.beatCode} (${item.kind}) 在 ${prevSlot} 批次失败，已自动顺延至今日 ${nextSlot} 队列`);
  };

  state.schedule.runningBatch = true;
  await saveSchedule();
  pushSystemLog(`[错峰定时队列] ${triggerReason}：开始执行 ${pendingAll.length} 项任务（按 MiniMax-H3 → Colab 提骨分组复用热机）`);

  (async () => {
    const deferredH3SlotByTask = new Map();
    try {
      // Phase 1: All MiniMax-H3 video tasks together (reuse warm G4 96G weights across the entire batch)
      const h3Items = pendingAll.filter((x) => x.kind === "stage3_h3");
      for (const item of h3Items) {
        if (item.status !== "pending") continue;
        const task = state.tasks.find((t) => t.id === item.taskId);
        if (!task) {
          item.status = "failed";
          item.message = "对应动作任务不存在";
          item.finishedAt = Date.now();
          await saveSchedule();
          continue;
        }
        item.status = "running";
        item.startedAt = Date.now();
        item.message = "正在 Colab 96G G4 生成 MiniMax-H3 视频…";
        await saveSchedule();
        try {
          const { donePromise } = launchMiniMaxH3Take(task, {
            resolution: item.resolution || task.storyboard?.qualityPreset || "720p",
            duration: item.duration || task.durationSec || 6,
          });
          await saveTasks();
          await donePromise;
          item.status = "succeeded";
          item.message = "MiniMax-H3 视频已生成并回传本地";
          item.finishedAt = Date.now();
        } catch (err) {
          const errMsg = String(err?.message || err);
          const nextSlot = findNextCascadeSlot(item);
          if (nextSlot) {
            deferItemToNextSlot(item, nextSlot, errMsg);
            deferredH3SlotByTask.set(item.taskId, nextSlot);
          } else {
            item.status = "failed";
            item.message = `已顺延至末班 ${slotsOrder[slotsOrder.length - 1]} 且重试 3 次仍失败：${errMsg.slice(0, 180)}`;
            item.finishedAt = Date.now();
          }
        }
        await saveSchedule();
      }

      // Stop G4 immediately before starting Stage 04 mocap so 96G G4 never sits idle billing 10 units/hr
      if (h3Items.length && state.schedule.autoStopAfterBatch) {
        pushSystemLog("[错峰定时队列] MiniMax-H3 批次结束，立即停机释放 Colab G4 显卡…");
        await stopWorkbenchColabSessions(state.config, (l) => pushSystemLog(l)).catch(() => {});
      }

      // Phase 2: All Stage 04 mocap tasks together (reuse warm L4/A100 across the batch)
      const mocapItems = pendingAll.filter((x) => x.kind === "stage4_mocap");
      for (const item of mocapItems) {
        if (item.status !== "pending") continue;
        const task = state.tasks.find((t) => t.id === item.taskId);
        if (!task) {
          item.status = "failed";
          item.message = "对应动作任务不存在";
          item.finishedAt = Date.now();
          await saveSchedule();
          continue;
        }
        const take =
          task.stage3?.takes?.find((t) => t.id === task.stage3.selectedTakeId && t.status === "succeeded") ||
          task.stage3?.takes?.find((t) => t.status === "succeeded");
        if (!take?.localPath) {
          const depNext = deferredH3SlotByTask.get(item.taskId) || findNextCascadeSlot(item);
          if (deferredH3SlotByTask.has(item.taskId) && depNext) {
            deferItemToNextSlot(item, depNext, `依赖的 MiniMax-H3 视频已顺延至今日 ${depNext}，提骨同步顺延`);
          } else {
            item.status = "failed";
            item.message = "该任务尚无可用成片视频，跳过提骨";
            item.finishedAt = Date.now();
          }
          await saveSchedule();
          continue;
        }
        item.status = "running";
        item.startedAt = Date.now();
        item.message = "正在 Colab 云端执行 GEM-X 77 骨提取…";
        await saveSchedule();
        try {
          const { donePromise } = launchColabMocapRun(task, {
            take,
            precisionPreset: item.precisionPreset || task.stage4?.precisionPreset || "standard_l4",
          });
          await saveTasks();
          await donePromise;
          item.status = "succeeded";
          item.message = "GEM-X 77 骨提取与 Mixamo 重定向已完成（Colab）";
          item.finishedAt = Date.now();
        } catch (err) {
          const errMsg = String(err?.message || err);
          let handledByModal = false;
          if (item.fallbackToModal && /503|暂不可用|满载|Service Unavailable|超时/i.test(errMsg) && state.config.modalBaseUrl) {
            pushSystemLog(`[错峰定时队列] ${item.beatCode} Colab 满载，自动回退至 Modal Serverless GPU…`);
            item.message = "Colab 满载，已自动切换 Modal Serverless GPU 提交提骨…";
            await saveSchedule();
            try {
              const submitted = await submitModalMocapJob({
                modalBaseUrl: state.config.modalBaseUrl,
                apiToken: state.config.modalApiToken,
                videoPath: take.localPath,
                cameraMode: "static",
                useContactIk: true,
                exportFbxAndGlb: true,
              });
              const mRun = {
                jobId: submitted.jobId,
                backend: "modal_serverless",
                takeId: take.id,
                status: "queued",
                stage: "queued",
                stageLabel: "Colab 满载已自动回退至 Modal Serverless GPU，正在按需冷启…",
                progress: 4,
                createdAt: Date.now(),
                files: {},
                telemetry: null,
                containerState: "starting_gpu",
                logs: [`[错峰回退 Modal] ${path.basename(take.localPath)} -> Modal Job ${submitted.jobId}`],
              };
              task.stage4.runs.unshift(mRun);
              task.stage4.activeRunId = mRun.jobId;
              task.updatedAt = Date.now();
              await saveTasks();
              startModalPoller(task, mRun);
              item.status = "succeeded";
              item.message = `Colab 满载，已自动回退提交至 Modal (${submitted.jobId})`;
              item.finishedAt = Date.now();
              handledByModal = true;
            } catch (mErr) {
              pushSystemLog(`[错峰定时队列] ${item.beatCode} Modal 回退失败：${mErr.message}`);
            }
          }
          if (!handledByModal) {
            const nextSlot = findNextCascadeSlot(item);
            if (nextSlot) {
              deferItemToNextSlot(item, nextSlot, errMsg);
            } else {
              item.status = "failed";
              item.message = `已顺延至末班 ${slotsOrder[slotsOrder.length - 1]} 且重试 3 次仍失败：${errMsg.slice(0, 180)}`;
              item.finishedAt = Date.now();
            }
          }
        }
        await saveSchedule();
      }
    } finally {
      if (state.schedule.autoStopAfterBatch) {
        pushSystemLog("[错峰定时队列] 整批任务执行完毕，立即执行 colab stop 停表释放算力");
        await stopWorkbenchColabSessions(state.config, (l) => pushSystemLog(l)).catch(() => {});
      }
      state.schedule.runningBatch = false;
      await saveSchedule();
    }
  })();

  return { started: true, count: pendingAll.length };
}

let scheduleTickerStarted = false;
function startScheduleTicker() {
  if (scheduleTickerStarted) return;
  scheduleTickerStarted = true;
  setInterval(() => {
    const sch = state.schedule;
    if (!sch?.enabled || sch.runningBatch) return;
    const pendingItems = (sch.items || []).filter((x) => x.status === "pending");
    if (!pendingItems.length) return;
    const now = new Date();
    const today = localDateKey(now);
    const nowMin = now.getHours() * 60 + now.getMinutes();
    sch.lastTriggeredSlots = sch.lastTriggeredSlots || {};
    const defaultSlot = sch.runTime || "06:00";

    const slots = [...new Set(pendingItems.map((x) => x.scheduledTime || defaultSlot))];
    for (const slot of slots) {
      const targetMin = parseHHMMToMinutes(slot, 360);
      const alreadyTriggeredToday =
        sch.lastTriggeredSlots[slot] === today ||
        (!Object.keys(sch.lastTriggeredSlots).length && slot === defaultSlot && sch.lastTriggeredDate === today);
      // 15-minute grace window so a brief timer drift or wake-up at 06:01 / 14:01 still fires reliably
      if (nowMin >= targetMin && nowMin < targetMin + 15 && !alreadyTriggeredToday) {
        sch.lastTriggeredDate = today;
        sch.lastTriggeredSlots[slot] = today;
        saveSchedule().catch(() => {});
        runScheduledBatch(`定时 ${slot} 自动触发`, { targetSlot: slot }).catch((err) => {
          pushSystemLog(`[错峰定时队列] ${slot} 触发异常：${err.message}`);
        });
        break;
      }
    }
  }, 15_000);
}

async function saveTasks() {
  await fsp.mkdir(WORKSPACE_DIR, { recursive: true });
  await fsp.writeFile(TASKS_PATH, JSON.stringify(state.tasks, null, 2), "utf-8");
}

function toWorkspaceUrl(absPath) {
  if (!absPath) return null;
  const rel = path.relative(WORKSPACE_DIR, absPath);
  if (rel.startsWith("..")) return null;
  return "workspace/" + rel.split(path.sep).map(encodeURIComponent).join("/");
}

async function copyIfExists(src, dst) {
  try {
    const st = await fsp.stat(src);
    if (!st.isFile()) return null;
    await fsp.mkdir(path.dirname(dst), { recursive: true });
    await fsp.copyFile(src, dst);
    return { localPath: dst, sizeBytes: st.size };
  } catch {
    return null;
  }
}

function ensureMixamoRetargetForTask(task) {
  if (task.routeType === "mixamo") return false;
  const activeRun =
    (task.stage4?.runs || []).find((r) => r.jobId === task.stage4?.activeRunId && r.status === "succeeded") ||
    (task.stage4?.runs || []).find((r) => r.status === "succeeded");
  if (!activeRun?.files) return false;
  const somaFile = Object.values(activeRun.files).find((f) => f.relPath.endsWith(".glb") && f.localPath);
  if (!somaFile || !fs.existsSync(somaFile.localPath)) return false;

  const retargetDir = path.join(WORKSPACE_DIR, "tasks", task.id, "retarget", activeRun.jobId);
  const baseStem = path.basename(somaFile.localPath, ".glb").replace(/_soma77$/i, "");
  const outGlbPath = path.join(retargetDir, `${baseStem}_mixamo_xbot.glb`);

  if (
    task.stage5?.mixamoGlb?.localPath === outGlbPath &&
    task.stage5?.mixamoGlb?.sourceRunId === activeRun.jobId &&
    fs.existsSync(outGlbPath) &&
    task.stage5?.qa?.frames > 10 &&
    task.stage5?.qa?.retargetVersion === 3
  ) {
    return false;
  }

  const res = retargetSomaGlbToMixamo({
    somaGlbPath: somaFile.localPath,
    outGlbPath,
    clipName: baseStem,
  });
  task.stage5 = {
    status: task.stage5?.status === "approved" ? "approved" : "pending_review",
    characterId: task.stage5?.characterId || task.characterId || "xbot",
    mixamoGlb: {
      sourceRunId: activeRun.jobId,
      localPath: res.outPath,
      fileName: path.basename(res.outPath),
      sizeBytes: res.sizeBytes,
      source: "soma77_retargeted",
    },
    qa: res.qa,
  };
  return true;
}

async function syncLevel01Scene01Catalog() {
  const catalog = buildLevel01Scene01Catalog();
  const scratchRoot = "C:\\Users\\admin\\.gemini\\antigravity\\brain\\97aa5ad9-af97-4ae4-827d-82094ac3bd80\\scratch";
  const verifiedMedia = {
    task_l01_01_donggua: {
      srcVideo: path.join(scratchRoot, "L01_01_Donggua_PackStrapAndHeightGesture_10s.mp4"),
      srcOutDir: path.join(scratchRoot, "colab_outputs", "L01_01_Donggua_PackStrapAndHeightGesture_10s"),
      stem: "L01_01_Donggua_PackStrapAndHeightGesture_10s",
    },
    task_l01_02_luo: {
      srcVideo: path.join(scratchRoot, "L01_02_Luo_CaveOrderPointAndWave_10s.mp4"),
      srcOutDir: path.join(scratchRoot, "colab_outputs", "L01_02_Luo_CaveOrderPointAndWave_10s"),
      stem: "L01_02_Luo_CaveOrderPointAndWave_10s",
    },
  };

  const existingById = new Map(state.tasks.map((t) => [t.id, t]));
  const merged = [];
  let changed = false;

  for (const tpl of catalog) {
    const prev = existingById.get(tpl.id);
    const task = prev
      ? {
          ...tpl,
          ...prev,
          // Always ensure new 6-stage schema fields exist while keeping user media/runs
          sceneId: tpl.sceneId,
          chapter: tpl.chapter,
          sceneLabel: tpl.sceneLabel,
          beatCode: tpl.beatCode,
          title: tpl.title,
          routeType: tpl.routeType,
          routeReason: tpl.routeReason,
          characterId: prev.characterId || tpl.characterId,
          actorFloorId: tpl.actorFloorId,
          durationSec: tpl.durationSec,
          conceptCoverUrl: prev.conceptCoverUrl || tpl.conceptCoverUrl,
          conceptCaption: tpl.conceptCaption,
          whitebox: prev.whitebox || tpl.whitebox,
          storyboard: prev.storyboard || tpl.storyboard,
          stage1: {
            ...tpl.stage1,
            ...(prev.stage1 || {}),
            videoPrompt: tpl.stage1.videoPrompt || prev.stage1?.videoPrompt || "",
            cameraRule: tpl.stage1.cameraRule || prev.stage1?.cameraRule || "",
          },
          stage2: prev.stage2 || tpl.stage2,
          stage3: { ...tpl.stage3, ...(prev.stage3 || {}) },
          stage4: { ...tpl.stage4, ...(prev.stage4 || {}) },
          // Migrate legacy 5-stage stage5.issues -> stage6.issues if needed
          stage5:
            prev.stage5 && ("mixamoGlb" in prev.stage5 || "characterId" in prev.stage5)
              ? { ...tpl.stage5, ...prev.stage5 }
              : { ...tpl.stage5 },
          stage6:
            prev.stage6 ||
            (prev.stage5 && Array.isArray(prev.stage5.issues)
              ? { issues: prev.stage5.issues, briefPath: prev.stage5.briefPath || null, runs: prev.stage5.runs || [] }
              : { ...tpl.stage6 }),
        }
      : tpl;

    if (!prev || prev.title !== tpl.title) changed = true;

    // Recover orphaned `running`/`queued` entries left behind by a previous server restart
    for (const sh of task.storyboard?.shots || []) {
      if (sh.status === "running") {
        sh.status = "failed";
        sh.progressText = "服务重启中断，可重抽";
        changed = true;
      }
    }
    for (const tk of task.stage3?.takes || []) {
      if (tk.status === "running") {
        tk.status = "failed";
        tk.error = "服务重启中断，请删除或重新抽卡";
        tk.progressText = "服务重启中断";
        changed = true;
      }
    }
    for (const r of task.stage4?.runs || []) {
      if (r.status === "running" || r.status === "queued") {
        r.status = "failed";
        r.stage = "failed";
        r.stageLabel = "失败：服务重启中断，请重新提交提骨";
        changed = true;
      }
    }

    // Seed verified L01_01 / L01_02 media + GEM-X v5 outputs if absent
    const vm = verifiedMedia[task.id];
    if (vm && (!task.stage3?.takes?.length || !task.stage4?.runs?.length)) {
      const taskDir = path.join(WORKSPACE_DIR, "tasks", task.id);
      const vidDst = path.join(taskDir, "videos", `${vm.stem}.mp4`);
      const copiedVid = await copyIfExists(vm.srcVideo, vidDst);
      if (copiedVid) {
        const mocapDir = path.join(taskDir, "mocap", "seed_gemx_v5");
        const files = {};
        const expected = [
          `${vm.stem}_soma77.glb`,
          `${vm.stem}_soma77.fbx`,
          `${vm.stem}_soma77.bvh`,
          `${vm.stem}_soma77.usd`,
          "run_summary.json",
          "render/overlay.mp4",
          "render/world.mp4",
        ];
        for (const rel of expected) {
          const src = path.join(vm.srcOutDir, ...rel.split("/"));
          const dst = path.join(mocapDir, ...rel.split("/"));
          const c = await copyIfExists(src, dst);
          if (c) files[rel] = { relPath: rel, localPath: c.localPath, sizeBytes: c.sizeBytes };
        }
        let summary = null;
        if (files["run_summary.json"]) {
          try {
            summary = JSON.parse(await fsp.readFile(files["run_summary.json"].localPath, "utf-8"));
          } catch {}
        }
        if (!task.stage3.takes.length) {
          task.stage3.takes.push({
            id: "take_1",
            label: "Take #1 · Seedance 2.5 Flash 480p 10s",
            model: "seedance_2.5_flash",
            resolution: "480p",
            duration: 10,
            status: "succeeded",
            localPath: copiedVid.localPath,
            sizeBytes: copiedVid.sizeBytes,
            createdAt: task.createdAt,
          });
          task.stage3.selectedTakeId = "take_1";
        }
        if (!task.stage4.runs.length && Object.keys(files).length) {
          task.stage4.runs.push({
            jobId: "seed_gemx_v5",
            backend: "colab_imported",
            takeId: "take_1",
            status: "succeeded",
            stage: "done",
            stageLabel: "已完成（GEM-X Native77 · 77关节含十指 · v5 校验通过）",
            progress: 100,
            createdAt: task.createdAt + 120_000,
            finishedAt: task.createdAt + 300_000,
            summary,
            files,
            telemetry: {
              gpuName: "NVIDIA L4 (24 GB)",
              gpuVramUsedGb: 0,
              gpuVramTotalGb: 22.5,
              gpuUtilPct: 0,
              ramUsedGb: 2.4,
              ramTotalGb: 53.0,
              diskUsedGb: 1.8,
              diskTotalGb: 235.7,
              containerState: "scaled_to_zero",
            },
            logs: ["[已导入] L4 GPU 跑通并逐帧验收的 77 关节骨骼产物（USD/BVH/FBX/GLB + Overlay/World）。"],
          });
          task.stage4.activeRunId = "seed_gemx_v5";
        }
        changed = true;
      }
    }

    // Automatically run SOMA-77 -> Mixamo X Bot retargeting whenever a succeeded Stage 04 run exists
    try {
      if (ensureMixamoRetargetForTask(task)) changed = true;
    } catch (err) {
      console.error(`[Retarget] Failed for ${task.id}:`, err.message);
    }

    merged.push(task);
  }

  // Keep any extra custom tasks that aren't part of the 01 catalog
  for (const prev of state.tasks) {
    if (!catalog.some((c) => c.id === prev.id)) merged.push(prev);
  }

  state.tasks = merged;
  if (changed || !fs.existsSync(TASKS_PATH)) {
    await saveTasks();
  }
}

function hydrateTaskForClient(task) {
  const clone = JSON.parse(JSON.stringify(task));
  const selectedTake = (clone.stage3?.takes || []).find((t) => t.id === clone.stage3?.selectedTakeId);
  clone.selectedVideoPath = selectedTake?.localPath || null;

  for (const sh of clone.storyboard?.shots || []) {
    if (sh.localPath) sh.url = toWorkspaceUrl(sh.localPath);
  }
  for (const kf of clone.stage2?.keyframes || []) {
    kf.url = toWorkspaceUrl(kf.localPath);
  }
  for (const tk of clone.stage3?.takes || []) {
    tk.url = toWorkspaceUrl(tk.localPath);
  }
  for (const run of clone.stage4?.runs || []) {
    for (const key of Object.keys(run.files || {})) {
      run.files[key].url = toWorkspaceUrl(run.files[key].localPath);
    }
  }
  if (clone.stage5?.mixamoGlb?.localPath) {
    clone.stage5.mixamoGlb.url = toWorkspaceUrl(clone.stage5.mixamoGlb.localPath);
  } else if (typeof clone.stage5?.mixamoGlb?.url === "string" && clone.stage5.mixamoGlb.url.startsWith("/")) {
    clone.stage5.mixamoGlb.url = clone.stage5.mixamoGlb.url.slice(1);
  }
  if (clone.retargetCoverPath && fs.existsSync(clone.retargetCoverPath)) {
    const v = clone.retargetCoverVersion || 1;
    clone.retargetCoverUrl = `${toWorkspaceUrl(clone.retargetCoverPath)}?v=${v}`;
  } else {
    clone.retargetCoverUrl = null;
  }
  const firstShot = (clone.storyboard?.shots || []).find((s) => s.status === "succeeded" && s.url);
  clone.storyboardCoverUrl = firstShot?.url || null;
  return clone;
}

async function mirrorOutputsIfConfigured(task, run) {
  const mirrorRoot = String(state.config.exportMirrorDir || "").trim();
  if (!mirrorRoot) return;
  try {
    const st = await fsp.stat(mirrorRoot).catch(() => null);
    if (!st || !st.isDirectory()) return;
    const dstDir = path.join(mirrorRoot, "Models", "GEMX_Workbench", `${task.id}_${run.jobId}`);
    await fsp.mkdir(dstDir, { recursive: true });
    for (const info of Object.values(run.files || {})) {
      const dst = path.join(dstDir, ...info.relPath.split("/"));
      await fsp.mkdir(path.dirname(dst), { recursive: true });
      await fsp.copyFile(info.localPath, dst);
    }
    run.mirroredTo = dstDir;
  } catch {
    // Non-fatal if OneDrive path isn't present on this machine
  }
}

function startModalPoller(task, run) {
  if (activePollers.has(run.jobId)) return;
  const timer = setInterval(async () => {
    try {
      const remote = await pollModalMocapJob({
        modalBaseUrl: state.config.modalBaseUrl,
        apiToken: state.config.modalApiToken,
        jobId: run.jobId,
      });
      run.status = remote.status;
      run.stage = remote.stage;
      run.stageLabel = remote.stageLabel;
      run.progress = remote.progress ?? run.progress;
      run.telemetry = remote.telemetry || run.telemetry;
      run.containerState = remote.containerState || run.containerState;
      run.logs = remote.logs || run.logs;
      run.summary = remote.summary || run.summary;
      run.error = remote.error || null;
      task.updatedAt = Date.now();
      await saveTasks();

      if (remote.status === "succeeded") {
        clearInterval(timer);
        activePollers.delete(run.jobId);
        run.stageLabel = "正在自动下载 77 关节产物（GLB/FBX/BVH/USD/预览视频）到本地...";
        await saveTasks();
        const targetDir = path.join(WORKSPACE_DIR, "tasks", task.id, "mocap", run.jobId);
        const downloaded = await downloadModalJobArtifacts({
          modalBaseUrl: state.config.modalBaseUrl,
          apiToken: state.config.modalApiToken,
          jobId: run.jobId,
          filesMap: remote.summary?.files_bytes || {},
          targetDir,
          onProgress: (msg) => {
            run.logs = [...(run.logs || []), `[本地同步] ${msg}`].slice(-80);
          },
        });
        run.files = downloaded;
        run.finishedAt = Date.now();
        run.stageLabel = "完成！产物已拉回本地并自动重定向至 Mixamo X Bot，云端 GPU 60 秒后休眠";
        run.containerState = "scaled_to_zero";
        try {
          ensureMixamoRetargetForTask(task);
        } catch (err) {
          run.logs = [...(run.logs || []), `[重定向警告] ${err.message}`].slice(-80);
        }
        await mirrorOutputsIfConfigured(task, run);
        await saveTasks();
      } else if (remote.status === "failed") {
        clearInterval(timer);
        activePollers.delete(run.jobId);
        run.finishedAt = Date.now();
        await saveTasks();
      }
    } catch (err) {
      run.logs = [...(run.logs || []), `[轮询警告] ${err.message}`].slice(-80);
    }
  }, 2500);
  activePollers.set(run.jobId, timer);
}

async function readJsonBody(req, limitBytes = 20 * 1024 * 1024) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > limitBytes) throw new Error("Request body too large");
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf-8").trim();
  return raw ? JSON.parse(raw) : {};
}

async function readRawBody(req, limitBytes = 200 * 1024 * 1024) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > limitBytes) throw new Error("Upload too large (max 200MB)");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(body);
}

function serveFileWithRange(req, res, filePath, forceDownload = false) {
  if (!fs.existsSync(filePath)) {
    res.writeHead(404);
    res.end("Not found");
    return;
  }
  const stat = fs.statSync(filePath);
  const total = stat.size;
  const mime = mimeTypeOf(filePath);
  const range = req.headers.range;
  const baseHeaders = {
    "Content-Type": mime,
    "Accept-Ranges": "bytes",
    "Cache-Control": "no-store",
  };
  if (forceDownload) {
    baseHeaders["Content-Disposition"] = `attachment; filename*=UTF-8''${encodeURIComponent(path.basename(filePath))}`;
  }

  if (range) {
    const m = /bytes=(\d*)-(\d*)/.exec(range);
    const start = m && m[1] ? Number(m[1]) : 0;
    const end = m && m[2] ? Math.min(Number(m[2]), total - 1) : total - 1;
    if (start >= total || start > end) {
      res.writeHead(416, { "Content-Range": `bytes */${total}` });
      res.end();
      return;
    }
    res.writeHead(206, {
      ...baseHeaders,
      "Content-Range": `bytes ${start}-${end}/${total}`,
      "Content-Length": end - start + 1,
    });
    fs.createReadStream(filePath, { start, end }).pipe(res);
  } else {
    res.writeHead(200, { ...baseHeaders, "Content-Length": total });
    fs.createReadStream(filePath).pipe(res);
  }
}

function findTask(id) {
  const t = state.tasks.find((x) => x.id === id);
  if (!t) {
    const e = new Error("Task not found");
    e.status = 404;
    throw e;
  }
  return t;
}

async function handleApi(req, res, urlObj) {
  const p = urlObj.pathname;
  const method = req.method;

  if (method === "GET" && p === "/api/bootstrap") {
    const forceRefresh = urlObj.searchParams.get("refresh") === "1";
    const { dreamina, cloud, imageProviders } = await getCachedProbes(forceRefresh);
    return sendJson(res, 200, {
      ok: true,
      config: sanitizeConfigForClient(state.config),
      tasks: state.tasks.map(hydrateTaskForClient),
      characters: WORKBENCH_CHARACTERS,
      floorplan: SCENE_01_FLOORPLAN,
      dreamina,
      cloud,
      imageProviders,
      schedule: hydrateScheduleForClient(),
      recentLogs: recentLogs.slice(-60),
      host: {
        hostname: os.hostname(),
        ramTotalGb: +(os.totalmem() / 1024 ** 3).toFixed(1),
        ramFreeGb: +(os.freemem() / 1024 ** 3).toFixed(1),
        workspaceDir: WORKSPACE_DIR,
      },
    });
  }

  // Off-peak Scheduled Batch Queue API (default 06:00 Beijing time for US Colab off-peak window)
  if (method === "GET" && p === "/api/schedule") {
    return sendJson(res, 200, { ok: true, schedule: hydrateScheduleForClient() });
  }
  if (method === "POST" && p === "/api/schedule/config") {
    const body = await readJsonBody(req);
    if (typeof body.enabled === "boolean") state.schedule.enabled = body.enabled;
    if (typeof body.autoStopAfterBatch === "boolean") state.schedule.autoStopAfterBatch = body.autoStopAfterBatch;
    if (typeof body.autoDeferToAfternoon === "boolean") state.schedule.autoDeferToAfternoon = body.autoDeferToAfternoon;
    if (typeof body.runTime === "string") {
      const t = body.runTime.trim();
      if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(t)) {
        return sendJson(res, 400, { ok: false, error: "时间格式无效，请使用 HH:MM（如 06:00）" });
      }
      state.schedule.runTime = t;
      state.schedule.lastTriggeredDate = null;
      state.schedule.lastTriggeredSlots = { ...(state.schedule.lastTriggeredSlots || {}) };
      delete state.schedule.lastTriggeredSlots[t];
      // Also reschedule all currently pending items to the newly selected slot so clicking 04:00 / 06:00 / etc. takes immediate effect!
      if (body.reschedulePending !== false) {
        for (const it of state.schedule.items || []) {
          if (it.status === "pending") {
            it.scheduledTime = t;
            it.message = `等待 ${t} 错峰自动启动`;
            delete it.deferredFrom;
            delete it.deferHistory;
          }
        }
      }
    }
    await saveSchedule();
    return sendJson(res, 200, { ok: true, schedule: hydrateScheduleForClient() });
  }
  if (method === "POST" && p === "/api/schedule/items") {
    const body = await readJsonBody(req);
    const added = [];
    const addOne = (task, kind, opts = {}) => {
      if (!task) return;
      const dup = (state.schedule.items || []).find(
        (x) => x.taskId === task.id && x.kind === kind && (x.status === "pending" || x.status === "running")
      );
      if (dup) return;
      const targetSlot = opts.scheduledTime || getNearestUpcomingSlot(state.schedule);
      const item = {
        id: `sch_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
        taskId: task.id,
        beatCode: task.beatCode || task.id,
        taskTitle: task.title || task.id,
        kind,
        resolution: opts.resolution || task.storyboard?.qualityPreset || "720p",
        duration: Number(opts.duration || task.durationSec || 6),
        precisionPreset: opts.precisionPreset || task.stage4?.precisionPreset || "standard_l4",
        fallbackToModal: Boolean(opts.fallbackToModal),
        scheduledTime: targetSlot,
        status: "pending",
        message: `等待 ${targetSlot} 错峰自动启动`,
        createdAt: Date.now(),
        startedAt: null,
        finishedAt: null,
      };
      state.schedule.items.push(item);
      added.push(item);
    };

    if (body.batchMode === "all_pending_h3") {
      for (const t of state.tasks) {
        if (t.route === "mixamo") continue;
        const hasShot = (t.storyboard?.shots || []).some((s) => s.status === "succeeded" && s.localPath);
        const hasVideo = (t.stage3?.takes || []).some((tk) => tk.status === "succeeded" && tk.localPath);
        if (hasShot && !hasVideo) addOne(t, "stage3_h3");
      }
    } else if (body.batchMode === "all_pending_mocap") {
      for (const t of state.tasks) {
        if (t.route === "mixamo") continue;
        const hasVideo = (t.stage3?.takes || []).some((tk) => tk.status === "succeeded" && tk.localPath);
        const hasMocap = (t.stage4?.runs || []).some((r) => r.status === "succeeded");
        if (hasVideo && !hasMocap) addOne(t, "stage4_mocap");
      }
    } else {
      const task = findTask(String(body.taskId || ""));
      const kind = body.kind === "stage4_mocap" ? "stage4_mocap" : "stage3_h3";
      addOne(task, kind, body);
    }

    await saveSchedule();
    return sendJson(res, 200, { ok: true, addedCount: added.length, schedule: hydrateScheduleForClient() });
  }
  const mDelSch = /^\/api\/schedule\/items\/([^/]+)$/.exec(p);
  if (mDelSch && method === "DELETE") {
    const id = decodeURIComponent(mDelSch[1]);
    state.schedule.items = (state.schedule.items || []).filter((x) => x.id !== id || x.status === "running");
    await saveSchedule();
    return sendJson(res, 200, { ok: true, schedule: hydrateScheduleForClient() });
  }
  if (method === "DELETE" && p === "/api/schedule/items") {
    const scope = urlObj.searchParams.get("scope") || "done";
    if (scope === "all") {
      state.schedule.items = (state.schedule.items || []).filter((x) => x.status === "running");
    } else {
      state.schedule.items = (state.schedule.items || []).filter((x) => x.status === "pending" || x.status === "running");
    }
    await saveSchedule();
    return sendJson(res, 200, { ok: true, schedule: hydrateScheduleForClient() });
  }
  if (method === "POST" && p === "/api/schedule/run-now") {
    const resRun = await runScheduledBatch("手动立即执行");
    return sendJson(res, 200, { ok: true, ...resRun, schedule: hydrateScheduleForClient() });
  }

  if (method === "POST" && p === "/api/config") {
    const body = await readJsonBody(req);
    const nextCfg = { ...state.config, ...body };
    // Preserve existing secrets if masked or omitted
    if (body.openaiApiKey === "" || body.openaiApiKey === undefined || /^•+$/.test(String(body.openaiApiKey))) {
      nextCfg.openaiApiKey = state.config.openaiApiKey || "";
    }
    if (body.modalApiToken === "" || body.modalApiToken === undefined || /^•+$/.test(String(body.modalApiToken))) {
      nextCfg.modalApiToken = state.config.modalApiToken || "";
    }
    if (body.clearOpenaiApiKey) nextCfg.openaiApiKey = "";
    delete nextCfg.hasOpenaiApiKey;
    delete nextCfg.hasModalApiToken;
    delete nextCfg.clearOpenaiApiKey;
    await saveConfig(nextCfg);
    const { dreamina, cloud, imageProviders } = await getCachedProbes(true);
    return sendJson(res, 200, {
      ok: true,
      config: sanitizeConfigForClient(state.config),
      dreamina,
      cloud,
      imageProviders,
    });
  }

  if (method === "GET" && p === "/api/cloud/health") {
    const cloud = await checkActiveCloudHealth();
    return sendJson(res, 200, { ok: true, cloud });
  }

  if (method === "POST" && p === "/api/cloud/colab/login") {
    const flow = await startColabOAuthFlow(state.config);
    if (flow.alreadyLoggedIn) {
      await saveConfig({ ...state.config, colabAuthorized: true });
      const { cloud } = await getCachedProbes(true);
      return sendJson(res, 200, { ok: true, alreadyLoggedIn: true, cloud });
    }
    pushSystemLog("[Colab CLI] 已生成 Google OAuth 授权链接，请在浏览器同意后回填授权码");
    return sendJson(res, 200, { ok: true, alreadyLoggedIn: false, authUrl: flow.authUrl });
  }

  if (method === "POST" && p === "/api/cloud/colab/auth-code") {
    const body = await readJsonBody(req);
    await submitColabAuthCode(body.code);
    await saveConfig({ ...state.config, colabAuthorized: true });
    pushSystemLog("[Colab CLI] Google 账号授权成功，已保存至本机凭据库");
    const { cloud } = await getCachedProbes(true);
    return sendJson(res, 200, { ok: true, cloud });
  }

  if (method === "POST" && p === "/api/cloud/colab/stop") {
    const resStop = await stopWorkbenchColabSessions(state.config);
    pushSystemLog(`[Colab CLI] 已主动释放 GPU 会话：${resStop.stopped.join(", ") || "无活跃会话"}`);
    const { cloud } = await getCachedProbes(true);
    return sendJson(res, 200, { ok: true, stopped: resStop.stopped, cloud });
  }

  if (method === "GET" && p === "/api/dreamina/status") {
    const dreamina = await getDreaminaStatus(state.config.dreaminaCliPath, state.config.dreaminaProfile || "default");
    return sendJson(res, 200, { ok: true, dreamina });
  }

  if (method === "POST" && p === "/api/dreamina/profile") {
    const body = await readJsonBody(req);
    const profile = String(body.profile || "default").trim() || "default";
    await saveConfig({ ...state.config, dreaminaProfile: profile });
    const { dreamina, imageProviders } = await getCachedProbes(true);
    pushSystemLog(`[即梦] 已切换账号档案：${profile} (${dreamina.loggedIn ? dreamina.displayName : "未登录"})`);
    return sendJson(res, 200, { ok: true, config: sanitizeConfigForClient(state.config), dreamina, imageProviders });
  }

  if (method === "POST" && p === "/api/dreamina/login") {
    const body = await readJsonBody(req);
    const profile = String(body.profile || state.config.dreaminaProfile || "default").trim() || "default";
    const started = startDreaminaProfileLogin(state.config.dreaminaCliPath, profile);
    pushSystemLog(`[即梦] 已为档案 ${profile} 拉起浏览器登录授权，完成后点击「刷新」`);
    return sendJson(res, 200, { ok: true, ...started });
  }

  if (method === "GET" && p === "/api/tasks") {
    return sendJson(res, 200, { ok: true, tasks: state.tasks.map(hydrateTaskForClient) });
  }

  if (method === "POST" && p === "/api/tasks") {
    const body = await readJsonBody(req);
    const id = `task_${Date.now().toString(36)}_${crypto.randomBytes(2).toString("hex")}`;
    const task = {
      id,
      title: String(body.title || "未命名动作任务").trim(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      stage1: {
        character: String(body.character || ""),
        beat: String(body.beat || ""),
        cameraRule:
          body.cameraRule ||
          "45°斜向半俯视固定机位 · 极浅哑光冷灰(#e6e8eb)无缝背景 · 全程头脚完整入画 · 裸手清晰十指",
        description: String(body.description || ""),
        videoPrompt: String(body.videoPrompt || ""),
      },
      stage2: { keyframes: [], selectedKeyframeId: null },
      stage3: { takes: [], selectedTakeId: null },
      stage4: { runs: [], activeRunId: null },
      stage5: { issues: [], briefPath: null, runs: [] },
    };
    state.tasks.unshift(task);
    await saveTasks();
    return sendJson(res, 200, { ok: true, task: hydrateTaskForClient(task) });
  }

  const mTask = /^\/api\/tasks\/([^/]+)$/.exec(p);
  if (mTask) {
    const id = decodeURIComponent(mTask[1]);
    if (method === "GET") {
      return sendJson(res, 200, { ok: true, task: hydrateTaskForClient(findTask(id)) });
    }
    if (method === "PATCH") {
      const task = findTask(id);
      const body = await readJsonBody(req);
      if (body.title !== undefined) task.title = String(body.title);
      if (body.stage1) task.stage1 = { ...task.stage1, ...body.stage1 };
      if (body.whitebox) task.whitebox = { ...(task.whitebox || {}), ...body.whitebox };
      if (body.storyboard) task.storyboard = { ...(task.storyboard || {}), ...body.storyboard };
      if (body.selectedKeyframeId !== undefined) task.stage2.selectedKeyframeId = body.selectedKeyframeId;
      if (body.selectedTakeId !== undefined) task.stage3.selectedTakeId = body.selectedTakeId;
      if (body.modelPreset !== undefined) task.stage3.modelPreset = body.modelPreset;
      if (body.activeRunId !== undefined) task.stage4.activeRunId = body.activeRunId;
      if (body.precisionPreset !== undefined) task.stage4.precisionPreset = body.precisionPreset;
      if (body.stage4Approved !== undefined) task.stage4.approved = Boolean(body.stage4Approved);
      if (body.retargetCharacterId !== undefined) {
        task.stage5 = { ...(task.stage5 || {}), characterId: body.retargetCharacterId };
      }
      if (body.retargetStatus !== undefined) {
        task.stage5 = { ...(task.stage5 || {}), status: body.retargetStatus };
      }
      if (body.issues !== undefined) {
        task.stage6 = { ...(task.stage6 || { briefPath: null, runs: [] }), issues: body.issues };
      }
      task.updatedAt = Date.now();
      await saveTasks();
      return sendJson(res, 200, { ok: true, task: hydrateTaskForClient(task) });
    }
    if (method === "DELETE") {
      state.tasks = state.tasks.filter((x) => x.id !== id);
      await saveTasks();
      return sendJson(res, 200, { ok: true });
    }
  }

  // Save retargeted 3D animation cover snapshot captured from RetargetViewer
  const mCover = /^\/api\/tasks\/([^/]+)\/cover$/.exec(p);
  if (mCover && method === "POST") {
    const task = findTask(decodeURIComponent(mCover[1]));
    const body = await readJsonBody(req);
    const dataUrl = String(body.dataUrl || "");
    const mData = /^data:image\/(jpeg|jpg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
    if (!mData) return sendJson(res, 400, { ok: false, error: "Invalid cover image dataUrl" });
    const ext = mData[1] === "png" ? "png" : mData[1] === "webp" ? "webp" : "jpg";
    const coverPath = path.join(WORKSPACE_DIR, "tasks", task.id, `cover_retarget.${ext}`);
    await fsp.mkdir(path.dirname(coverPath), { recursive: true });
    await fsp.writeFile(coverPath, Buffer.from(mData[2], "base64"));
    task.retargetCoverPath = coverPath;
    task.retargetCoverVersion = Number(body.version || 2);
    task.updatedAt = Date.now();
    await saveTasks();
    return sendJson(res, 200, { ok: true, task: hydrateTaskForClient(task) });
  }

  // Stage 1: Approve whitebox blocking
  const mS1App = /^\/api\/tasks\/([^/]+)\/stage1\/approve$/.exec(p);
  if (mS1App && method === "POST") {
    const task = findTask(decodeURIComponent(mS1App[1]));
    const body = await readJsonBody(req);
    task.whitebox = {
      ...(task.whitebox || {}),
      status: body.status || "approved",
      approvedAt: Date.now(),
    };
    task.updatedAt = Date.now();
    await saveTasks();
    return sendJson(res, 200, { ok: true, task: hydrateTaskForClient(task) });
  }

  // Stage 2: Per-shot movie storyboard generation (quote / run across 4 image providers)
  const mShot = /^\/api\/tasks\/([^/]+)\/stage2\/shot\/([^/]+)\/(quote|run)$/.exec(p);
  if (mShot && method === "POST") {
    const task = findTask(decodeURIComponent(mShot[1]));
    const shotId = decodeURIComponent(mShot[2]);
    const action = mShot[3];
    const shot = (task.storyboard?.shots || []).find((s) => s.id === shotId);
    if (!shot) return sendJson(res, 404, { ok: false, error: "分镜格不存在" });

    const body = await readJsonBody(req);
    const provider = body.provider || state.config.storyboardImageProvider || "seedream";
    const rawPrompt = body.prompt || shot.prompt || task.stage1.videoPrompt;
    const prompt =
      rawPrompt.includes("解剖左右分色") || rawPrompt.includes("左右分色")
        ? rawPrompt
        : `${rawPrompt}。${LIMB_COLOR_SUIT_RULE}，人物全身头顶至双脚完整入画，头脚留白充足，四肢清晰无遮挡。`;

    if (action === "quote") {
      if (provider === "seedream") {
        const canvas = await ensureWorkbenchCanvas(state.config, saveConfig);
        const quote = await createAndQuoteImageNode({
          cliPath: state.config.dreaminaCliPath,
          profile: canvas.profile,
          projectId: canvas.projectId,
          title: `${task.beatCode || task.id}_${shot.code}_${shot.role}`,
          prompt,
          model: body.model || state.config.seedreamModel || "high_aes_general_v50_flash",
          resolution: body.resolution || state.config.seedreamResolution || "2K",
          ratio: body.ratio || "16:9",
        });
        pushSystemLog(`[Seedream] 报价 ${task.beatCode} ${shot.code}: ${quote.model} ${quote.resolution} -> ${quote.maxCredits} 积分`);
        return sendJson(res, 200, { ok: true, provider, quote, shotId });
      }
      return sendJson(res, 200, {
        ok: true,
        provider,
        shotId,
        quote: {
          external: true,
          provider,
          maxCredits: 0,
          confirmationRequired: false,
          ratio: body.ratio || "16:9",
        },
      });
    }

    const outPath = path.join(WORKSPACE_DIR, "tasks", task.id, "storyboard", `${shot.id}_${Date.now().toString(36)}.png`);

    if (provider === "seedream") {
      const canvas = await ensureWorkbenchCanvas(state.config, saveConfig);
      shot.nodeId = body.nodeId;
      shot.provider = "seedream";
      shot.providerLabel = "Seedream";
      shot.model = body.model || state.config.seedreamModel || "high_aes_general_v50_flash";
      shot.status = "running";
      shot.progressText = "Seedream 生图中…";
      task.updatedAt = Date.now();
      await saveTasks();
      pushSystemLog(`[Seedream] 开始生成 ${task.beatCode} ${shot.code} (node=${body.nodeId})`);

      runAndDownloadNode({
        cliPath: state.config.dreaminaCliPath,
        profile: canvas.profile,
        projectId: canvas.projectId,
        nodeId: body.nodeId,
        creditCeiling: Number(body.creditCeiling),
        outputPath: outPath,
        onProgress: (msg) => {
          shot.progressText = msg;
        },
      })
        .then(async (resDl) => {
          shot.status = "succeeded";
          shot.localPath = resDl.localPath;
          shot.sizeBytes = resDl.sizeBytes;
          shot.resourceId = resDl.resourceId;
          shot.progressText = "已生成";
          task.updatedAt = Date.now();
          pushSystemLog(`[Seedream] 完成 ${task.beatCode} ${shot.code} (${Math.round(resDl.sizeBytes / 1024)} KB)`);
          await saveTasks();
        })
        .catch(async (err) => {
          shot.status = "failed";
          shot.progressText = `失败: ${err.message}`;
          task.updatedAt = Date.now();
          pushSystemLog(`[Seedream] 失败 ${task.beatCode} ${shot.code}: ${err.message}`);
          await saveTasks();
        });

      return sendJson(res, 200, { ok: true, task: hydrateTaskForClient(task) });
    }

    // External image providers: cursor_grok | codex_imagegen | openai_api
    shot.nodeId = null;
    shot.resourceId = null;
    shot.provider = provider;
    shot.providerLabel =
      provider === "cursor_grok" ? "Cursor+Grok" : provider === "codex_imagegen" ? "Codex+Img" : "OpenAI";
    shot.status = "running";
    shot.progressText = `${shot.providerLabel} 生图中…`;
    task.updatedAt = Date.now();
    await saveTasks();

    generateImageWithExternalProvider({
      provider,
      config: state.config,
      prompt,
      outPath,
      onProgress: (msg) => {
        shot.progressText = msg;
      },
      onLog: (msg) => pushSystemLog(msg),
    })
      .then(async (resImg) => {
        shot.status = "succeeded";
        shot.localPath = resImg.localPath;
        shot.sizeBytes = resImg.sizeBytes;
        shot.provider = resImg.provider;
        shot.providerLabel = resImg.providerLabel;
        shot.model = resImg.model;
        shot.progressText = "已生成";
        task.updatedAt = Date.now();
        await saveTasks();
      })
      .catch(async (err) => {
        shot.status = "failed";
        shot.progressText = `失败: ${err.message}`;
        task.updatedAt = Date.now();
        pushSystemLog(`[${shot.providerLabel}] 失败 ${task.beatCode} ${shot.code}: ${err.message}`);
        await saveTasks();
      });

    return sendJson(res, 200, { ok: true, task: hydrateTaskForClient(task) });
  }

  // Stage 2: Approve storyboard (ready to feed directly into Seedance)
  const mS2App = /^\/api\/tasks\/([^/]+)\/stage2\/approve$/.exec(p);
  if (mS2App && method === "POST") {
    const task = findTask(decodeURIComponent(mS2App[1]));
    const body = await readJsonBody(req);
    task.storyboard = {
      ...(task.storyboard || {}),
      approved: body.approved !== false,
      qualityPreset: body.qualityPreset || task.storyboard?.qualityPreset || "720p",
    };
    task.updatedAt = Date.now();
    await saveTasks();
    return sendJson(res, 200, { ok: true, task: hydrateTaskForClient(task) });
  }

  // Delete a specific Stage 3 take from a task's take history
  const mDelTake = /^\/api\/tasks\/([^/]+)\/stage3\/takes\/([^/]+)$/.exec(p);
  if (mDelTake && method === "DELETE") {
    const task = findTask(decodeURIComponent(mDelTake[1]));
    const takeId = decodeURIComponent(mDelTake[2]);
    task.stage3.takes = (task.stage3?.takes || []).filter((t) => t.id !== takeId);
    if (task.stage3.selectedTakeId === takeId) {
      const nextOk = task.stage3.takes.find((t) => t.status === "succeeded");
      task.stage3.selectedTakeId = nextOk?.id || null;
    }
    task.updatedAt = Date.now();
    await saveTasks();
    return sendJson(res, 200, { ok: true, task: hydrateTaskForClient(task) });
  }

  // Stage 2: Keyframe quote & run via Dreamina CLI
  const mS2 = /^\/api\/tasks\/([^/]+)\/stage2\/(quote|run)$/.exec(p);
  if (mS2 && method === "POST") {
    const task = findTask(decodeURIComponent(mS2[1]));
    const action = mS2[2];
    const body = await readJsonBody(req);
    const canvas = await ensureWorkbenchCanvas(state.config, saveConfig);

    if (action === "quote") {
      const quote = await createAndQuoteImageNode({
        cliPath: state.config.dreaminaCliPath,
        projectId: canvas.projectId,
        title: `${task.title}_关键帧_${(task.stage2.keyframes.length || 0) + 1}`,
        prompt: body.prompt,
        ratio: body.ratio || "16:9",
      });
      return sendJson(res, 200, { ok: true, quote, canvasUrl: canvas.webUrl });
    }

    // Run confirmed image generation asynchronously
    const kfId = `kf_${Date.now().toString(36)}`;
    const outPath = path.join(WORKSPACE_DIR, "tasks", task.id, "keyframes", `${kfId}.png`);
    const kfEntry = {
      id: kfId,
      nodeId: body.nodeId,
      label: `分镜 #${task.stage2.keyframes.length + 1}`,
      prompt: body.prompt || "",
      status: "running",
      progressText: "正在提交即梦生图...",
      createdAt: Date.now(),
    };
    task.stage2.keyframes.unshift(kfEntry);
    task.updatedAt = Date.now();
    await saveTasks();

    runAndDownloadNode({
      cliPath: state.config.dreaminaCliPath,
      profile: canvas.profile,
      projectId: canvas.projectId,
      nodeId: body.nodeId,
      creditCeiling: Number(body.creditCeiling),
      outputPath: outPath,
      onProgress: (msg) => {
        kfEntry.progressText = msg;
      },
    })
      .then(async (resDl) => {
        kfEntry.status = "succeeded";
        kfEntry.localPath = resDl.localPath;
        kfEntry.sizeBytes = resDl.sizeBytes;
        kfEntry.resourceId = resDl.resourceId;
        kfEntry.progressText = "生成完成";
        task.stage2.selectedKeyframeId = kfEntry.id;
        task.updatedAt = Date.now();
        await saveTasks();
      })
      .catch(async (err) => {
        kfEntry.status = "failed";
        kfEntry.error = err.message;
        kfEntry.progressText = `失败: ${err.message}`;
        task.updatedAt = Date.now();
        await saveTasks();
      });

    return sendJson(res, 200, { ok: true, task: hydrateTaskForClient(task) });
  }

  // Stage 3: Video quote, run, or direct local MP4 upload
  const mS3 = /^\/api\/tasks\/([^/]+)\/stage3\/(quote|run|upload)$/.exec(p);
  if (mS3 && method === "POST") {
    const task = findTask(decodeURIComponent(mS3[1]));
    const action = mS3[2];

    if (action === "upload") {
      const filename = path.basename(decodeURIComponent(urlObj.searchParams.get("filename") || "uploaded.mp4"));
      const buf = await readRawBody(req);
      const takeId = `take_${Date.now().toString(36)}`;
      const dst = path.join(WORKSPACE_DIR, "tasks", task.id, "videos", `${takeId}_${filename}`);
      await fsp.mkdir(path.dirname(dst), { recursive: true });
      await fsp.writeFile(dst, buf);
      const take = {
        id: takeId,
        label: `本地导入 · ${filename}`,
        model: "local_upload",
        resolution: "source",
        duration: null,
        status: "succeeded",
        localPath: dst,
        sizeBytes: buf.length,
        createdAt: Date.now(),
      };
      task.stage3.takes.unshift(take);
      task.stage3.selectedTakeId = take.id;
      task.updatedAt = Date.now();
      await saveTasks();
      return sendJson(res, 200, { ok: true, task: hydrateTaskForClient(task) });
    }

    const body = await readJsonBody(req);
    const chosenModel = body.model || task.stage3?.modelPreset || state.config.defaultVideoModel;

    // MiniMax-H3 (Colab 96G G4 + ComfyUI + RealESRGAN_x2plus) — zero Dreamina credits
    if (chosenModel === "minimax_h3_colab") {
      const shots = task.storyboard?.shots || [];
      const readyShots = shots.filter((s) => s.status === "succeeded" && s.localPath);
      const startShot = readyShots.find((s) => s.lockRole === "start") || readyShots[0] || null;
      const endShot = readyShots.find((s) => s.lockRole === "end") || null;
      const duration = Number(body.duration || task.durationSec || 6);
      const resolution = body.resolution || task.storyboard?.qualityPreset || "720p";

      if (action === "quote") {
        return sendJson(res, 200, {
          ok: true,
          quote: {
            external: true,
            model: "minimax_h3_colab",
            mode: startShot && endShot ? "fl2v" : startShot ? "i2v" : "t2v",
            refCount: (startShot ? 1 : 0) + (endShot && endShot !== startShot ? 1 : 0),
            resolution,
            duration,
            maxCredits: 0,
            confirmationRequired: false,
          },
        });
      }

      const takeId = `take_${Date.now().toString(36)}`;
      const takeNum = task.stage3.takes.length + 1;
      const outPath = path.join(WORKSPACE_DIR, "tasks", task.id, "videos", `${task.id}_h3_take${takeNum}.mp4`);
      const nowMs = Date.now();
      const appendTakeLog = (entry, rawLine) => {
        const line = String(rawLine || "").trim();
        if (!line) return;
        const ts = new Date().toTimeString().slice(0, 8);
        const formatted = /^\[\d\d:\d\d:\d\d\]/.test(line) ? line : `[${ts}] ${line}`;
        entry.logs = entry.logs || [];
        if (entry.logs[entry.logs.length - 1] !== formatted) {
          entry.logs.push(formatted);
          if (entry.logs.length > 160) entry.logs.splice(0, entry.logs.length - 160);
        }
        entry.updatedAt = Date.now();
      };
      const updateH3Progress = (entry, text) => {
        const s = String(text || "");
        const prev = Number(entry.progress || 5);
        let next = prev;
        if (/排队|等待上一条|申请.*GPU|colab new/i.test(s)) next = Math.max(next, 8);
        else if (/已分配|复用热机|上传首帧|上传尾帧/i.test(s)) next = Math.max(next, 16);
        else if (/下载|aria2|safetensors|权重/i.test(s)) {
          const mPct = /\((\d{1,3})%\)/.exec(s);
          if (mPct) {
            const dlPct = Math.max(0, Math.min(100, Number(mPct[1])));
            next = Math.max(next, Math.round(20 + dlPct * 0.36));
          } else {
            next = Math.max(next, 24);
          }
        } else if (/ComfyUI|推理|采样|denois|sampler|加载模型|FL2V/i.test(s)) {
          const mStep = /(\d+)\s*\/\s*(\d+)/.exec(s);
          if (mStep && Number(mStep[2]) > 0 && Number(mStep[2]) <= 100) {
            const r = Math.max(0, Math.min(1, Number(mStep[1]) / Number(mStep[2])));
            next = Math.max(next, Math.round(58 + r * 28));
          } else {
            next = Math.max(next, 62);
          }
        } else if (/超分|RealESRGAN|upscale|1080p/i.test(s)) next = Math.max(next, 88);
        else if (/回传|下载成片|download/i.test(s)) next = Math.max(next, 94);
        entry.progress = Math.min(99, next);
      };
      const takeEntry = {
        id: takeId,
        label: `Take #${takeNum} · MiniMax-H3 (G4 96G) ${resolution} ${duration}s`,
        model: "minimax_h3_colab",
        resolution,
        duration,
        status: "running",
        progress: 6,
        progressText: "正在通过 Colab CLI 启动 96G G4…",
        logs: [],
        createdAt: nowMs,
        updatedAt: nowMs,
      };
      appendTakeLog(takeEntry, `[MiniMax-H3] 提交任务 ${task.beatCode} · ${resolution} · ${duration}s · ${startShot && endShot ? "首尾帧 FL2V" : startShot ? "首帧 I2V" : "文生视频 T2V"}`);
      task.stage3.takes.unshift(takeEntry);
      task.updatedAt = nowMs;
      await saveTasks();

      runColabMiniMaxH3Job({
        config: state.config,
        prompt: enforceOneTakeVideoPrompt(body.prompt || task.stage1.videoPrompt),
        duration,
        resolution,
        startImagePath: startShot?.localPath || null,
        endImagePath: endShot && endShot !== startShot ? endShot.localPath : null,
        outMp4Path: outPath,
        onProgress: (msg) => {
          takeEntry.progressText = msg;
          updateH3Progress(takeEntry, msg);
          appendTakeLog(takeEntry, `[MiniMax-H3] ${msg}`);
        },
        onLog: (line) => {
          updateH3Progress(takeEntry, line);
          appendTakeLog(takeEntry, line);
          pushSystemLog(line);
        },
      })
        .then(async (resH3) => {
          takeEntry.status = "succeeded";
          takeEntry.progress = 100;
          takeEntry.localPath = resH3.localPath;
          takeEntry.sizeBytes = resH3.sizeBytes;
          takeEntry.progressText = "MiniMax-H3 成片已回传本地";
          takeEntry.finishedAt = Date.now();
          appendTakeLog(takeEntry, `[完成] MiniMax-H3 成片已回传本地 (${Math.round((resH3.sizeBytes || 0) / 1024)} KB)`);
          task.stage3.selectedTakeId = takeEntry.id;
          task.updatedAt = Date.now();
          await saveTasks();
        })
        .catch(async (err) => {
          takeEntry.status = "failed";
          takeEntry.error = err.message;
          takeEntry.progressText = `失败: ${err.message}`;
          takeEntry.finishedAt = Date.now();
          appendTakeLog(takeEntry, `[失败] ${err.message}`);
          task.updatedAt = Date.now();
          await saveTasks();
        });

      return sendJson(res, 200, { ok: true, task: hydrateTaskForClient(task) });
    }

    const canvas = await ensureWorkbenchCanvas(state.config, saveConfig);

    if (action === "quote") {
      const refEntries = [];
      const shots = task.storyboard?.shots || [];
      const readyShots = shots.filter((s) => s.status === "succeeded" && (s.nodeId || s.resourceId || s.localPath));
      const orderedLocked = [];
      const startShot = readyShots.find((s) => s.lockRole === "start");
      const endShot = readyShots.find((s) => s.lockRole === "end");
      const midShots = readyShots.filter((s) => s.lockRole === "ref");
      if (startShot) orderedLocked.push(startShot);
      for (const m of midShots) orderedLocked.push(m);
      if (endShot) orderedLocked.push(endShot);

      let uploadedAny = false;
      for (const sh of orderedLocked) {
        if (sh.nodeId) {
          refEntries.push({ type: "node", id: sh.nodeId });
        } else if (sh.resourceId) {
          refEntries.push({ type: "res", id: sh.resourceId });
        } else if (sh.localPath && fs.existsSync(sh.localPath)) {
          pushSystemLog(`[Dreamina] 自动托管外部分镜 ${task.beatCode} ${sh.code} 至画布…`);
          const up = await uploadLocalResource({
            cliPath: state.config.dreaminaCliPath,
            profile: canvas.profile,
            projectId: canvas.projectId,
            filePath: sh.localPath,
            name: `${task.beatCode}_${sh.code}_${sh.providerLabel || "ext"}.png`,
          });
          sh.resourceId = up.resourceId;
          uploadedAny = true;
          refEntries.push({ type: "res", id: up.resourceId });
        }
      }
      if (uploadedAny) await saveTasks();

      if (!refEntries.length && body.useSelectedKeyframe && task.stage2.selectedKeyframeId) {
        const kf = task.stage2.keyframes.find((k) => k.id === task.stage2.selectedKeyframeId);
        if (kf?.nodeId && kf.status === "succeeded") refEntries.push({ type: "node", id: kf.nodeId });
      }

      const quote = await createAndQuoteVideoNode({
        cliPath: state.config.dreaminaCliPath,
        profile: canvas.profile,
        projectId: canvas.projectId,
        title: `${task.title}_Take${task.stage3.takes.length + 1}`,
        prompt: enforceOneTakeVideoPrompt(body.prompt || task.stage1.videoPrompt),
        model: body.model || task.stage3?.modelPreset || state.config.defaultVideoModel,
        resolution: body.resolution || task.storyboard?.qualityPreset || state.config.defaultVideoResolution,
        ratio: body.ratio || "16:9",
        duration: Number(body.duration || task.durationSec || state.config.defaultVideoDuration),
        refEntries,
      });
      return sendJson(res, 200, { ok: true, quote, canvasUrl: canvas.webUrl });
    }

    // Run confirmed Seedance video take asynchronously
    const takeId = `take_${Date.now().toString(36)}`;
    const takeNum = task.stage3.takes.length + 1;
    const outPath = path.join(WORKSPACE_DIR, "tasks", task.id, "videos", `${task.id}_take${takeNum}.mp4`);
    const nowMs = Date.now();
    const appendSeedanceLog = (entry, rawLine) => {
      const line = String(rawLine || "").trim();
      if (!line) return;
      const ts = new Date().toTimeString().slice(0, 8);
      const formatted = /^\[\d\d:\d\d:\d\d\]/.test(line) ? line : `[${ts}] ${line}`;
      entry.logs = entry.logs || [];
      if (entry.logs[entry.logs.length - 1] !== formatted) {
        entry.logs.push(formatted);
        if (entry.logs.length > 160) entry.logs.splice(0, entry.logs.length - 160);
      }
      entry.updatedAt = Date.now();
    };
    const updateSeedanceProgress = (entry, msg) => {
      const s = String(msg || "");
      const prev = Number(entry.progress || 8);
      let next = prev;
      const mPct = /(\d{1,3})%/.exec(s);
      if (mPct) {
        next = Math.max(next, Math.min(95, Number(mPct[1])));
      } else if (/下载|download/i.test(s)) {
        next = Math.max(next, 88);
      } else if (/渲染|生成中|running|processing/i.test(s)) {
        next = Math.max(next, 48);
      } else if (/已受理|submitId|排队|queued/i.test(s)) {
        next = Math.max(next, 22);
      }
      entry.progress = Math.min(98, next);
    };
    const takeEntry = {
      id: takeId,
      nodeId: body.nodeId,
      label: `Take #${takeNum} · ${body.model || "seedance_2.5_flash"} ${body.resolution || "480p"} ${body.duration || 10}s`,
      model: body.model || "seedance_2.5_flash",
      resolution: body.resolution || "480p",
      duration: Number(body.duration || 10),
      status: "running",
      progress: 10,
      progressText: "已提交即梦云端生成...",
      logs: [],
      createdAt: nowMs,
      updatedAt: nowMs,
    };
    appendSeedanceLog(takeEntry, `[Seedance] 已提交即梦画布节点 ${body.nodeId || "—"} · ${takeEntry.model} · ${takeEntry.resolution} · ${takeEntry.duration}s`);
    task.stage3.takes.unshift(takeEntry);
    task.updatedAt = nowMs;
    await saveTasks();

    runAndDownloadNode({
      cliPath: state.config.dreaminaCliPath,
      profile: canvas.profile,
      projectId: canvas.projectId,
      nodeId: body.nodeId,
      creditCeiling: Number(body.creditCeiling),
      outputPath: outPath,
      onProgress: (msg) => {
        takeEntry.progressText = msg;
        updateSeedanceProgress(takeEntry, msg);
        appendSeedanceLog(takeEntry, `[Seedance] ${msg}`);
      },
    })
      .then(async (resDl) => {
        takeEntry.status = "succeeded";
        takeEntry.progress = 100;
        takeEntry.localPath = resDl.localPath;
        takeEntry.sizeBytes = resDl.sizeBytes;
        takeEntry.sha256 = resDl.sha256;
        takeEntry.resourceId = resDl.resourceId;
        takeEntry.mediaMeta = resDl.mediaMeta;
        takeEntry.progressText = "成片已下载到本地";
        takeEntry.finishedAt = Date.now();
        appendSeedanceLog(takeEntry, `[完成] 成片已下载到本地 (${Math.round((resDl.sizeBytes || 0) / 1024)} KB)`);
        task.stage3.selectedTakeId = takeEntry.id;
        task.updatedAt = Date.now();
        await saveTasks();
      })
      .catch(async (err) => {
        takeEntry.status = "failed";
        takeEntry.error = err.message;
        takeEntry.progressText = `失败: ${err.message}`;
        takeEntry.finishedAt = Date.now();
        appendSeedanceLog(takeEntry, `[失败] ${err.message}`);
        task.updatedAt = Date.now();
        await saveTasks();
      });

    return sendJson(res, 200, { ok: true, task: hydrateTaskForClient(task) });
  }

  // Stage 4: Submit selected Take to Colab CLI (default) or Modal Serverless GPU
  const mS4 = /^\/api\/tasks\/([^/]+)\/stage4\/submit$/.exec(p);
  if (mS4 && method === "POST") {
    const task = findTask(decodeURIComponent(mS4[1]));
    const body = await readJsonBody(req);
    const takeId = body.takeId || task.stage3.selectedTakeId;
    const take = task.stage3.takes.find((t) => t.id === takeId && t.status === "succeeded");
    if (!take?.localPath) {
      return sendJson(res, 400, { ok: false, error: "请先在第 3 阶段生成或上传并选定一条成功的视频" });
    }

    const precisionPreset = body.precisionPreset || task.stage4?.precisionPreset || "standard_l4";
    const backend =
      precisionPreset === "modal_l4"
        ? "modal_serverless"
        : precisionPreset === "standard_l4" || precisionPreset === "high_a100"
        ? state.config.mocapBackend === "modal_serverless" && state.config.modalBaseUrl
          ? "modal_serverless"
          : "colab_cli"
        : state.config.mocapBackend || "colab_cli";

    if (backend === "modal_serverless" && !state.config.modalBaseUrl) {
      return sendJson(res, 400, {
        ok: false,
        error: "Modal Serverless 网关地址尚未配置。请先完成一次 modal deploy 并在「系统 → 高级设置」填入 Modal 网关地址。",
      });
    }

    if (backend === "colab_cli") {
      const jobId = `colab_${Date.now().toString(36)}`;
      const outDir = path.join(WORKSPACE_DIR, "tasks", task.id, "mocap", jobId);
      const stem = path.basename(take.localPath, path.extname(take.localPath));
      const gpuLabel = precisionPreset === "high_a100" ? "A100" : "L4";

      const run = {
        jobId,
        backend: "colab_cli",
        takeId: take.id,
        status: "running",
        stage: "starting_gpu",
        stageLabel: `正在通过 Colab CLI 申请 ${gpuLabel} GPU…`,
        progress: 4,
        createdAt: Date.now(),
        files: {},
        telemetry: null,
        containerState: "starting_gpu",
        logs: [`[Colab CLI] 提交 ${path.basename(take.localPath)} -> ${gpuLabel} (${precisionPreset})`],
      };
      task.stage4.runs.unshift(run);
      task.stage4.activeRunId = run.jobId;
      task.updatedAt = Date.now();
      await saveTasks();

      runColabMocapJob({
        config: state.config,
        videoPath: take.localPath,
        stem,
        precisionPreset,
        outDir,
        onProgress: (pct, label) => {
          run.progress = pct;
          run.stageLabel = label;
        },
        onTelemetry: (tm) => {
          run.telemetry = tm;
          run.containerState = "running";
        },
        onLog: (line) => {
          run.logs.push(line);
          if (run.logs.length > 140) run.logs.splice(0, run.logs.length - 140);
          pushSystemLog(line);
        },
      })
        .then(async (resJob) => {
          run.status = "succeeded";
          run.stage = "done";
          run.progress = 100;
          run.finishedAt = Date.now();
          run.files = resJob.files;
          run.summary = resJob.summary;
          run.containerState = "scaled_to_zero";
          run.stageLabel = `已完成（Colab ${resJob.gpuVariant} · GEM-X 77 骨）`;
          try {
            ensureMixamoRetargetForTask(task);
          } catch (reErr) {
            run.logs.push(`[Retarget] 自动重定向警告：${reErr.message}`);
          }
          task.updatedAt = Date.now();
          await saveTasks();
        })
        .catch(async (err) => {
          run.status = "failed";
          run.stage = "failed";
          run.stageLabel = `失败：${err.message}`;
          run.containerState = "scaled_to_zero";
          run.logs.push(`[Colab CLI 失败] ${err.message}`);
          task.updatedAt = Date.now();
          await saveTasks();
        });

      return sendJson(res, 200, { ok: true, run, task: hydrateTaskForClient(task) });
    }

    const submitted = await submitModalMocapJob({
      modalBaseUrl: state.config.modalBaseUrl,
      apiToken: state.config.modalApiToken,
      videoPath: take.localPath,
      cameraMode: body.cameraMode || "static",
      useContactIk: body.useContactIk !== false,
      exportFbxAndGlb: body.exportFbxAndGlb !== false,
      clipStartSec: Number(body.clipStartSec || 0),
      clipDurationSec: Number(body.clipDurationSec || 0),
    });

    const run = {
      jobId: submitted.jobId,
      backend: "modal_serverless",
      takeId: take.id,
      status: "queued",
      stage: "queued",
      stageLabel: "已提交至 Modal Serverless GPU，正在按需冷启 L4（约 10–25 秒）...",
      progress: 4,
      createdAt: Date.now(),
      files: {},
      telemetry: null,
      containerState: "starting_gpu",
      logs: [`[本地提交] 已上传 ${path.basename(take.localPath)} -> Modal Job ${submitted.jobId}`],
    };
    task.stage4.runs.unshift(run);
    task.stage4.activeRunId = run.jobId;
    task.updatedAt = Date.now();
    await saveTasks();
    startModalPoller(task, run);
    return sendJson(res, 200, { ok: true, run, task: hydrateTaskForClient(task) });
  }

  // Stage 4: Approve raw skeleton & automatically trigger Stage 5 SOMA-77 -> Mixamo X Bot retarget
  const mS4App = /^\/api\/tasks\/([^/]+)\/stage4\/approve$/.exec(p);
  if (mS4App && method === "POST") {
    const task = findTask(decodeURIComponent(mS4App[1]));
    task.stage4.approved = true;
    try {
      ensureMixamoRetargetForTask(task);
    } catch (err) {
      return sendJson(res, 500, { ok: false, error: `重定向失败：${err.message}` });
    }
    task.updatedAt = Date.now();
    await saveTasks();
    return sendJson(res, 200, { ok: true, task: hydrateTaskForClient(task) });
  }

  // Stage 5: Dedicated Retargeting (SOMA-77 -> Mixamo X Bot 65 bones) & secondary QA decision
  const mS5Ret = /^\/api\/tasks\/([^/]+)\/stage5\/(retarget|approve)$/.exec(p);
  if (mS5Ret && method === "POST") {
    const task = findTask(decodeURIComponent(mS5Ret[1]));
    const action = mS5Ret[2];
    const body = await readJsonBody(req);
    if (action === "retarget") {
      // Force re-run retarget from active Stage 04 GLB
      if (task.stage5?.mixamoGlb) task.stage5.mixamoGlb.sourceRunId = null;
      const ok = ensureMixamoRetargetForTask(task);
      if (!ok && task.routeType !== "mixamo") {
        return sendJson(res, 400, { ok: false, error: "当前任务尚未完成第 4 阶段提骨，暂无 SOMA-77 源骨骼" });
      }
      if (body.characterId) task.stage5.characterId = body.characterId;
      task.updatedAt = Date.now();
      await saveTasks();
      return sendJson(res, 200, { ok: true, task: hydrateTaskForClient(task) });
    }
    task.stage5 = {
      ...(task.stage5 || {}),
      status: body.status || "approved",
      characterId: body.characterId || task.stage5?.characterId || task.characterId || "xbot",
      approvedAt: Date.now(),
    };
    task.updatedAt = Date.now();
    await saveTasks();
    return sendJson(res, 200, { ok: true, task: hydrateTaskForClient(task) });
  }

  // Stage 6 (also aliased at /stage5/brief|dispatch for compatibility): BlenderMCP refinement brief / dispatch
  const mS6 = /^\/api\/tasks\/([^/]+)\/stage(?:5|6)\/(brief|dispatch)$/.exec(p);
  if (mS6 && method === "POST") {
    const task = findTask(decodeURIComponent(mS6[1]));
    const action = mS6[2];
    const hydrated = hydrateTaskForClient(task);
    const activeRun =
      task.stage4.runs.find((r) => r.jobId === task.stage4.activeRunId) ||
      task.stage4.runs.find((r) => r.status === "succeeded");
    if (!activeRun) {
      return sendJson(res, 400, { ok: false, error: "请先完成第 4 阶段骨骼提取后再发起修缮" });
    }
    const taskDir = path.join(WORKSPACE_DIR, "tasks", task.id);
    const { briefPath, briefText, refineDir } = await writeRefinementBrief(hydrated, activeRun, taskDir, REPO_ROOT);
    task.stage6 = task.stage6 || { issues: [], briefPath: null, runs: [] };
    task.stage6.briefPath = briefPath;
    task.updatedAt = Date.now();
    await saveTasks();

    if (action === "brief") {
      return sendJson(res, 200, { ok: true, briefPath, briefText, task: hydrateTaskForClient(task) });
    }

    const body = await readJsonBody(req);
    const cmdTemplate = body.commandTemplate || state.config.refineCommandTemplate;
    const refineId = `refine_${Date.now().toString(36)}`;
    const refineRun = {
      id: refineId,
      status: "running",
      commandTemplate: cmdTemplate,
      briefPath,
      startedAt: Date.now(),
      logs: [],
    };
    task.stage6.runs.unshift(refineRun);
    await saveTasks();

    const child = launchRefinementCommand({
      commandTemplate: cmdTemplate,
      briefPath,
      refineDir,
      cwd: REPO_ROOT,
      onLog: (line) => {
        refineRun.logs.push(line);
        if (refineRun.logs.length > 200) refineRun.logs.shift();
      },
      onExit: async (code) => {
        refineRun.status = code === 0 ? "succeeded" : "failed";
        refineRun.exitCode = code;
        refineRun.finishedAt = Date.now();
        activeJobs.delete(refineId);
        await saveTasks();
      },
    });
    activeJobs.set(refineId, child);
    return sendJson(res, 200, { ok: true, refineRun, briefText, task: hydrateTaskForClient(task) });
  }

  if (method === "POST" && p === "/api/open-folder") {
    const body = await readJsonBody(req);
    const target = String(body.path || WORKSPACE_DIR);
    if (process.platform === "win32") {
      execFile("explorer.exe", [target], { windowsHide: true }, () => {});
    }
    return sendJson(res, 200, { ok: true });
  }

  return sendJson(res, 404, { ok: false, error: `Unknown API route: ${method} ${p}` });
}

let bootPromise = null;
async function ensureWorkbenchBooted() {
  if (!bootPromise) {
    bootPromise = (async () => {
      await fsp.mkdir(WORKSPACE_DIR, { recursive: true });
      try {
        const loaded = JSON.parse(await fsp.readFile(CONFIG_PATH, "utf-8"));
        if (!loaded.cursorGrokModel || loaded.cursorGrokModel === "grok") {
          loaded.cursorGrokModel = "grok-4.7-xhigh";
        }
        state.config = { ...DEFAULT_CONFIG, ...loaded };
      } catch {
        await saveConfig(DEFAULT_CONFIG);
      }
      try {
        state.tasks = JSON.parse(await fsp.readFile(TASKS_PATH, "utf-8"));
      } catch {
        state.tasks = [];
      }
      await syncLevel01Scene01Catalog();

      // Resume any unfinished Modal jobs across local server restarts
      for (const task of state.tasks) {
        for (const run of task.stage4?.runs || []) {
          if (run.backend === "modal_serverless" && (run.status === "queued" || run.status === "running")) {
            startModalPoller(task, run);
          }
        }
      }
      // Load persisted off-peak scheduled queue and start 15s ticker
      try {
        const loadedSch = JSON.parse(await fsp.readFile(SCHEDULE_PATH, "utf-8"));
        state.schedule = {
          ...DEFAULT_SCHEDULE,
          ...loadedSch,
          runningBatch: false,
          items: Array.isArray(loadedSch.items) ? loadedSch.items : [],
        };
        let resetAny = false;
        for (const it of state.schedule.items) {
          if (it.status === "running") {
            it.status = "pending";
            it.message = `上次服务重启中断，已重回 ${state.schedule.runTime} 等待队列`;
            resetAny = true;
          }
        }
        if (resetAny) await saveSchedule();
      } catch {
        state.schedule = { ...DEFAULT_SCHEDULE, items: [] };
      }
      startScheduleTicker();
      getCachedProbes(true).catch(() => {});
    })();
  }
  return bootPromise;
}

export async function HandleMotionWorkbenchRequest(req, res, { basePrefix = "" } = {}) {
  await ensureWorkbenchBooted();
  try {
    const rawUrl = new URL(req.url, `http://${HOST}:${PORT}`);
    let pathname = rawUrl.pathname;
    if (basePrefix && pathname.startsWith(basePrefix)) {
      pathname = pathname.slice(basePrefix.length) || "/";
    }
    const urlObj = new URL(pathname + rawUrl.search, `http://${HOST}:${PORT}`);

    if (urlObj.pathname.startsWith("/api/")) {
      return await handleApi(req, res, urlObj);
    }
    if (urlObj.pathname.startsWith("/fonts/")) {
      const fontDir = path.join(REPO_ROOT, "Taierzhuang1938", "Font");
      const safeName = path.basename(decodeURIComponent(urlObj.pathname.slice("/fonts/".length)));
      const absFont = path.resolve(fontDir, safeName);
      if (!absFont.startsWith(fontDir)) {
        res.writeHead(403);
        return res.end("Forbidden");
      }
      return serveFileWithRange(req, res, absFont, false);
    }
    if (urlObj.pathname.startsWith("/three/")) {
      const threeRoot = path.join(REPO_ROOT, "Taierzhuang1938", "vendor", "three");
      const rel = urlObj.pathname.slice("/three/".length).split("/").map(decodeURIComponent).join(path.sep);
      const abs = path.resolve(threeRoot, rel);
      if (!abs.startsWith(threeRoot)) {
        res.writeHead(403);
        return res.end("Forbidden");
      }
      return serveFileWithRange(req, res, abs, false);
    }
    if (urlObj.pathname.startsWith("/game-assets/")) {
      const relParts = urlObj.pathname.slice("/game-assets/".length).split("/").map(decodeURIComponent);
      const top = relParts[0];
      if (top !== "Model" && top !== "Animation") {
        res.writeHead(403);
        return res.end("Forbidden");
      }
      const gameRoot = path.join(REPO_ROOT, "Taierzhuang1938");
      const abs = path.resolve(gameRoot, ...relParts);
      if (!abs.startsWith(gameRoot)) {
        res.writeHead(403);
        return res.end("Forbidden");
      }
      return serveFileWithRange(req, res, abs, false);
    }
    if (urlObj.pathname.startsWith("/workspace/")) {
      const rel = urlObj.pathname
        .slice("/workspace/".length)
        .split("/")
        .map(decodeURIComponent)
        .join(path.sep);
      const abs = path.resolve(WORKSPACE_DIR, rel);
      if (!abs.startsWith(WORKSPACE_DIR)) {
        res.writeHead(403);
        return res.end("Forbidden");
      }
      const dl = urlObj.searchParams.get("download") === "1";
      return serveFileWithRange(req, res, abs, dl);
    }
    let relWeb = urlObj.pathname === "/" ? "index.html" : urlObj.pathname.replace(/^\/+/, "");
    const absWeb = path.resolve(WEB_DIR, relWeb);
    if (!absWeb.startsWith(WEB_DIR)) {
      res.writeHead(403);
      return res.end("Forbidden");
    }
    return serveFileWithRange(req, res, absWeb, false);
  } catch (err) {
    const status = err.status || 500;
    sendJson(res, status, { ok: false, error: err.message });
  }
}

async function bootStandalone() {
  await ensureWorkbenchBooted();
  const server = http.createServer((req, res) => HandleMotionWorkbenchRequest(req, res, { basePrefix: "" }));
  server.listen(PORT, HOST, () => {
    console.log(`[MotionWorkbench] Ready at http://${HOST}:${PORT}/`);
    console.log(`[MotionWorkbench] Workspace: ${WORKSPACE_DIR}`);
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  bootStandalone();
}
