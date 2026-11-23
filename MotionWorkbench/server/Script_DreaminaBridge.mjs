import { execFile, spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

const DEFAULT_CLI_PATH = process.env.DREAMINA_CLI_PATH || "C:\\Users\\admin\\bin\\dreamina-canvas.exe";

function runCli(args, { cliPath = DEFAULT_CLI_PATH, profile = "default", timeoutMs = 60000 } = {}) {
  const fullArgs = ["--format", "json"];
  if (profile && profile !== "default") fullArgs.push("--profile", profile);
  fullArgs.push(...args);
  return new Promise((resolve, reject) => {
    execFile(
      cliPath,
      fullArgs,
      { timeout: timeoutMs, maxBuffer: 20 * 1024 * 1024, windowsHide: true },
      (err, stdout, stderr) => {
        const text = (stdout || "").trim();
        let parsed = null;
        if (text) {
          const lines = text.split(/\r?\n/).filter((l) => l.trim().startsWith("{"));
          for (let i = lines.length - 1; i >= 0; i--) {
            try {
              parsed = JSON.parse(lines[i]);
              break;
            } catch {
              // continue
            }
          }
        }
        if (parsed) {
          if (parsed.ok) return resolve(parsed);
          const msg =
            parsed.error?.diagnostics?.[0]?.detail ||
            parsed.error?.message ||
            `dreamina-canvas error code ${parsed.error?.code}`;
          const e = new Error(msg);
          e.payload = parsed;
          return reject(e);
        }
        if (err) {
          return reject(new Error(stderr?.trim() || err.message || "dreamina-canvas execution failed"));
        }
        resolve({ ok: true, raw: text });
      }
    );
  });
}

export async function getDreaminaStatus(cliPath = DEFAULT_CLI_PATH, profile = "default") {
  try {
    const status = await runCli(["auth", "status"], { cliPath, profile, timeoutMs: 15000 });
    const loggedIn = Boolean(status.data?.loggedIn);
    let account = null;
    if (loggedIn) {
      const acc = await runCli(["auth", "account"], { cliPath, profile, timeoutMs: 15000 }).catch(() => null);
      account = acc?.data || null;
    }
    return {
      installed: true,
      cliPath,
      profile: profile || "default",
      loggedIn,
      version: status.data?.version || null,
      displayName: account?.displayName || null,
      availableCredits: account?.availableCredits ?? null,
      isVip: Boolean(account?.isVip),
    };
  } catch (err) {
    return {
      installed: false,
      cliPath,
      profile: profile || "default",
      loggedIn: false,
      error: err.message,
    };
  }
}

export function startDreaminaProfileLogin(cliPath = DEFAULT_CLI_PATH, profile = "default") {
  const args = [];
  if (profile && profile !== "default") args.push("--profile", profile);
  args.push("auth", "login");
  // dreamina-canvas auth login automatically opens the system browser to complete QR/account login
  spawn(cliPath, args, { detached: true, stdio: "ignore", windowsHide: true }).unref();
  return { started: true, profile: profile || "default" };
}

export async function listDreaminaModels(type = "video", cliPath = DEFAULT_CLI_PATH, profile = "default") {
  const res = await runCli(["model", "list", "--type", type], { cliPath, profile, timeoutMs: 20000 });
  return res.data?.items || [];
}

export async function ensureWorkbenchCanvas(config, saveConfig) {
  const cliPath = config.dreaminaCliPath || DEFAULT_CLI_PATH;
  const profile = config.dreaminaProfile || "default";
  const map = { ...(config.dreaminaCanvasIds || {}) };
  if (profile === "default" && config.dreaminaCanvasId && !map.default) {
    map.default = config.dreaminaCanvasId;
  }
  if (map[profile]) {
    return {
      projectId: map[profile],
      profile,
      webUrl: `https://jimeng.jianying.com/ai-tool/ai-canvas/${map[profile]}`,
    };
  }
  const created = await runCli(["canvas", "create", "动作管线工作台", "--use"], { cliPath, profile, timeoutMs: 25000 });
  const project = created.data.project;
  map[profile] = project.projectId;
  config.dreaminaCanvasIds = map;
  if (profile === "default") {
    config.dreaminaCanvasId = project.projectId;
    config.dreaminaCanvasUrl = project.webUrl;
  }
  await saveConfig(config);
  return { projectId: project.projectId, profile, webUrl: project.webUrl };
}

export async function uploadLocalResource({
  cliPath = DEFAULT_CLI_PATH,
  profile = "default",
  projectId,
  filePath,
  name = null,
  importKind = "external_generated",
}) {
  const args = [
    "resource", "upload",
    "--project-id", projectId,
    "--file", filePath,
    "--import-kind", importKind,
  ];
  if (name) args.push("--name", name);
  const res = await runCli(args, { cliPath, profile, timeoutMs: 90000 });
  const resourceId =
    res.data?.resource?.resourceId ||
    res.data?.resourceId ||
    res.data?.items?.[0]?.resourceId ||
    null;
  if (!resourceId) throw new Error("上传外部图片到即梦画布失败：未返回 resourceId");
  return { resourceId, raw: res.data };
}

export async function createAndQuoteVideoNode({
  cliPath = DEFAULT_CLI_PATH,
  profile = "default",
  projectId,
  title,
  prompt,
  model = "seedance_2.5_flash",
  resolution = "480p",
  ratio = "16:9",
  duration = 10,
  refNodeId = null,
  refNodeIds = null,
  refEntries = null,
}) {
  const refs = [];
  if (Array.isArray(refEntries) && refEntries.length) {
    for (const r of refEntries) {
      if (r && r.id) refs.push({ type: r.type === "res" ? "res" : "node", id: r.id });
    }
  } else if (Array.isArray(refNodeIds) && refNodeIds.length) {
    for (const id of refNodeIds.filter(Boolean)) refs.push({ type: "node", id });
  } else if (refNodeId) {
    refs.push({ type: "node", id: refNodeId });
  }

  const mode = refs.length === 0 ? "t2v" : refs.length <= 2 ? "first_last_frame" : "m2v";
  let finalPrompt = prompt;
  if (mode === "m2v" && !/\{\{(node|res):/.test(prompt)) {
    const refTags = refs.map((r, i) => `分镜${i + 1}{{${r.type}:${r.id}}}`).join("、");
    finalPrompt = `严格依次过渡参考${refTags}的起止姿态与视角。${prompt}`;
  }
  const args = [
    "node", "create", "video",
    "--project-id", projectId,
    "--title", title,
    "--mode", mode,
    "--model", model,
    "--ratio", ratio,
    "--resolution", resolution,
    "--duration", String(duration),
    "--count", "1",
    "--prompt", finalPrompt,
  ];
  for (const r of refs) {
    args.push("--ref", `${r.type}:${r.id}`);
  }
  const created = await runCli(args, { cliPath, profile, timeoutMs: 30000 });
  const nodeId = created.data.node.nodeId;
  const quoted = await runCli(["node", "quote", "--project-id", projectId, "--node-id", nodeId], {
    cliPath,
    profile,
    timeoutMs: 20000,
  });
  return {
    nodeId,
    mode,
    refCount: refs.length,
    model,
    resolution,
    ratio,
    duration,
    maxCredits: quoted.data.totalMaxCredits,
    confirmationRequired: Boolean(quoted.data.confirmationRequired),
  };
}

export async function createAndQuoteImageNode({
  cliPath = DEFAULT_CLI_PATH,
  profile = "default",
  projectId,
  title,
  prompt,
  model = "high_aes_general_v50_flash",
  resolution = "2K",
  ratio = "16:9",
}) {
  let chosenModel = model;
  if (!chosenModel) {
    const models = await listDreaminaModels("image", cliPath, profile);
    const preferred =
      models.find((m) => /high_aes_general_v50_flash/i.test(m.model)) ||
      models.find((m) => /seedream/i.test(m.model)) ||
      models[0];
    if (!preferred) throw new Error("即梦当前无可用图片模型");
    chosenModel = preferred.model;
  }
  const args = [
    "node", "create", "image",
    "--project-id", projectId,
    "--title", title,
    "--mode", "t2i",
    "--model", chosenModel,
    "--resolution", resolution || "2K",
    "--ratio", ratio,
    "--count", "1",
    "--prompt", prompt,
  ];
  const created = await runCli(args, { cliPath, profile, timeoutMs: 30000 });
  const nodeId = created.data.node.nodeId;
  const quoted = await runCli(["node", "quote", "--project-id", projectId, "--node-id", nodeId], {
    cliPath,
    profile,
    timeoutMs: 20000,
  });
  return {
    nodeId,
    model: chosenModel,
    resolution: resolution || "2K",
    ratio,
    maxCredits: quoted.data.totalMaxCredits,
    confirmationRequired: Boolean(quoted.data.confirmationRequired),
  };
}

export async function runAndDownloadNode({
  cliPath = DEFAULT_CLI_PATH,
  profile = "default",
  projectId,
  nodeId,
  creditCeiling,
  outputPath,
  onProgress,
}) {
  onProgress?.("正在批准积分上限并提交云端生成...");
  const confirm = await runCli(
    ["node", "confirm", "--project-id", projectId, "--node-id", nodeId, "--credit-ceiling", String(creditCeiling)],
    { cliPath, profile, timeoutMs: 25000 }
  );
  const token = confirm.data.creditConfirmationToken;
  const submitId = crypto.randomUUID();
  const runRes = await runCli(
    [
      "node", "run",
      "--project-id", projectId,
      "--node-id", nodeId,
      "--submit-id", submitId,
      "--credit-token", token,
    ],
    { cliPath, profile, timeoutMs: 30000 }
  );
  const resourceId = runRes.data?.items?.[0]?.resources?.[0]?.resourceId || null;
  onProgress?.(`已受理（submitId=${submitId.slice(0, 8)}），等待即梦云端渲染完成...`);

  const waited = await runCli(
    ["operation", "wait", submitId, "--project-id", projectId, "--timeout", "10m", "--interval", "5s"],
    { cliPath, profile, timeoutMs: 630000 }
  );
  const finalResId = waited.data?.resources?.[0]?.resourceId || resourceId;
  if (!finalResId) {
    throw new Error("生成完成但未返回 resourceId");
  }

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  onProgress?.("渲染完成，正在下载到本地工作区...");
  const dl = await runCli(
    ["resource", "download", finalResId, "--project-id", projectId, "--output", outputPath],
    { cliPath, profile, timeoutMs: 120000 }
  );
  const meta = await runCli(["resource", "get", finalResId, "--project-id", projectId], {
    cliPath,
    profile,
    timeoutMs: 20000,
  }).catch(() => null);

  return {
    submitId,
    resourceId: finalResId,
    localPath: dl.data.path,
    sizeBytes: dl.data.size,
    sha256: dl.data.sha256,
    mediaMeta: meta?.data?.video || meta?.data?.image || null,
  };
}
