import fs from "node:fs/promises";
import path from "node:path";

function normalizeBaseUrl(url) {
  return String(url || "").trim().replace(/\/+$/, "");
}

function authHeaders(token) {
  const t = String(token || "").trim();
  return t ? { Authorization: `Bearer ${t}` } : {};
}

export async function checkModalHealth(modalBaseUrl, apiToken = "") {
  const base = normalizeBaseUrl(modalBaseUrl);
  if (!base) {
    return {
      configured: false,
      online: false,
      message: "尚未配置 Modal Serverless URL（运行 MotionWorkbench/cloud/Script_DeployModal.ps1 获取）",
    };
  }
  const t0 = Date.now();
  try {
    const res = await fetch(`${base}/health`, {
      headers: authHeaders(apiToken),
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) {
      return {
        configured: true,
        online: false,
        httpStatus: res.status,
        message: `HTTP ${res.status}`,
      };
    }
    const data = await res.json();
    return {
      configured: true,
      online: true,
      latencyMs: Date.now() - t0,
      ...data,
    };
  } catch (err) {
    return {
      configured: true,
      online: false,
      message: err.message,
    };
  }
}

export async function submitModalMocapJob({
  modalBaseUrl,
  apiToken = "",
  videoPath,
  cameraMode = "static",
  useContactIk = true,
  exportFbxAndGlb = true,
  clipStartSec = 0,
  clipDurationSec = 0,
}) {
  const base = normalizeBaseUrl(modalBaseUrl);
  if (!base) {
    throw new Error("未配置 Modal Serverless URL，请先在右上角「云端 GPU 配置」填写并测试连接。");
  }
  const bytes = await fs.readFile(videoPath);
  const form = new FormData();
  form.append("video", new Blob([bytes], { type: "video/mp4" }), path.basename(videoPath));
  form.append("cameraMode", String(cameraMode));
  form.append("useContactIk", String(Boolean(useContactIk)));
  form.append("exportFbxAndGlb", String(Boolean(exportFbxAndGlb)));
  form.append("clipStartSec", String(Number(clipStartSec) || 0));
  form.append("clipDurationSec", String(Number(clipDurationSec) || 0));

  const res = await fetch(`${base}/jobs`, {
    method: "POST",
    headers: authHeaders(apiToken),
    body: form,
    signal: AbortSignal.timeout(120000),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`提交 Modal 任务失败 (HTTP ${res.status}): ${txt.slice(0, 300)}`);
  }
  return await res.json();
}

export async function pollModalMocapJob({ modalBaseUrl, apiToken = "", jobId }) {
  const base = normalizeBaseUrl(modalBaseUrl);
  const res = await fetch(`${base}/jobs/${encodeURIComponent(jobId)}`, {
    headers: authHeaders(apiToken),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    throw new Error(`查询任务失败 (HTTP ${res.status})`);
  }
  const data = await res.json();
  return data.job;
}

export async function downloadModalJobArtifacts({
  modalBaseUrl,
  apiToken = "",
  jobId,
  filesMap,
  targetDir,
  onProgress,
}) {
  const base = normalizeBaseUrl(modalBaseUrl);
  await fs.mkdir(targetDir, { recursive: true });
  const downloaded = {};
  const entries = Object.keys(filesMap || {}).filter((rel) => rel !== "motion.pt");
  for (let i = 0; i < entries.length; i++) {
    const rel = entries[i];
    onProgress?.(`正在自动拉回结果文件 (${i + 1}/${entries.length}): ${rel}`);
    const res = await fetch(`${base}/jobs/${encodeURIComponent(jobId)}/files/${rel}`, {
      headers: authHeaders(apiToken),
      signal: AbortSignal.timeout(120000),
    });
    if (!res.ok) continue;
    const buf = Buffer.from(await res.arrayBuffer());
    const dst = path.join(targetDir, ...rel.split("/"));
    await fs.mkdir(path.dirname(dst), { recursive: true });
    await fs.writeFile(dst, buf);
    downloaded[rel] = {
      relPath: rel,
      localPath: dst,
      sizeBytes: buf.length,
    };
  }
  return downloaded;
}
