import { execFile } from "node:child_process";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";

export const IMAGE_PROVIDER_DEFS = [
  {
    id: "seedream",
    code: "01",
    name: "Seedream",
    shortName: "Seedream",
    engine: "即梦画布 · 直连 Seedance",
    needsCreditQuote: true,
  },
  {
    id: "cursor_grok",
    code: "02",
    name: "CursorCLI + Grok",
    shortName: "Cursor+Grok",
    engine: "本机 Cursor Agent CLI",
    needsCreditQuote: false,
  },
  {
    id: "codex_imagegen",
    code: "03",
    name: "CodexCLI + Imagegen",
    shortName: "Codex+Img",
    engine: "codex exec 内置生图",
    needsCreditQuote: false,
  },
  {
    id: "openai_api",
    code: "04",
    name: "OpenAI APIKey",
    shortName: "OpenAI API",
    engine: "Images API 直调",
    needsCreditQuote: false,
  },
];

function whereBinary(cmd) {
  return new Promise((resolve) => {
    if (!cmd) return resolve(null);
    if (path.isAbsolute(cmd) && fs.existsSync(cmd)) return resolve(cmd);
    execFile("where.exe", [cmd], { timeout: 4000, windowsHide: true }, (err, stdout) => {
      if (err || !stdout) return resolve(null);
      const first = stdout
        .split(/\r?\n/)
        .map((l) => l.trim())
        .find(Boolean);
      resolve(first || null);
    });
  });
}

async function resolveCursorCli(config) {
  const candidates = [
    config.cursorCliPath,
    path.join(process.env.LOCALAPPDATA || "", "cursor-agent", "agent.ps1"),
    path.join(process.env.LOCALAPPDATA || "", "cursor-agent", "cursor-agent.ps1"),
    "cursor-agent",
    "agent",
  ].filter(Boolean);
  for (const c of candidates) {
    const found = await whereBinary(c);
    if (found) return found;
  }
  return null;
}

async function resolveCodexCli(config) {
  const candidates = [config.codexCliPath, "codex", "codex.cmd", "codex.exe"].filter(Boolean);
  for (const c of candidates) {
    const found = await whereBinary(c);
    if (found) return found;
  }
  return null;
}

export function normalizeCursorGrokModel(raw) {
  const v = String(raw || "").trim();
  if (!v || /^grok$/i.test(v) || /^(cursor[\s_-]*)?grok[\s_-]*(4\.7[\s_-]*)?xhigh$/i.test(v)) {
    return "grok-4.7-xhigh";
  }
  if (/^(cursor[\s_-]*)?grok[\s_-]*4\.6[\s_-]*xhigh$/i.test(v)) {
    return "cursor-grok-4.6-xhigh";
  }
  return v.replace(/\s+/g, "-");
}

export async function detectImageProviders(config, dreaminaStatus) {
  const [cursorBin, codexBin] = await Promise.all([
    resolveCursorCli(config),
    resolveCodexCli(config),
  ]);
  const hasOpenAiKey = Boolean((config.openaiApiKey || "").trim() || (process.env.OPENAI_API_KEY || "").trim());
  const seedreamModel = config.seedreamModel || "high_aes_general_v50_flash";
  const seedreamModelLabel =
    seedreamModel === "high_aes_general_v50_flash"
      ? "5.0 Flash"
      : seedreamModel === "seedream_5.0_pro"
      ? "5.0 Pro"
      : seedreamModel === "seedream_5.5"
      ? "5.5"
      : seedreamModel;
  const grokModel = normalizeCursorGrokModel(config.cursorGrokModel);

  return [
    {
      ...IMAGE_PROVIDER_DEFS[0],
      ready: Boolean(dreaminaStatus?.installed && dreaminaStatus?.loggedIn),
      modelLabel: `${seedreamModelLabel} · ${config.seedreamResolution || "2K"}`,
      statusText: dreaminaStatus?.loggedIn ? "已就绪" : "即梦未登录",
      detail: dreaminaStatus?.loggedIn
        ? `积分 ${dreaminaStatus.availableCredits ?? "--"} · 画布节点直喂 Seedance`
        : "需先登录 dreamina-canvas",
    },
    {
      ...IMAGE_PROVIDER_DEFS[1],
      ready: Boolean(cursorBin),
      modelLabel: grokModel,
      statusText: cursorBin ? "已检出" : "未找到 CLI",
      detail: cursorBin ? `CLI: ${path.basename(cursorBin)} · ${grokModel}` : "未检出 cursor-agent / agent.ps1",
      resolvedPath: cursorBin,
    },
    {
      ...IMAGE_PROVIDER_DEFS[2],
      ready: Boolean(codexBin),
      modelLabel: config.codexModel || "内置 imagegen",
      statusText: codexBin ? "已检出" : "未安装 CLI",
      detail: codexBin ? `CLI: ${path.basename(codexBin)} · 出图自动上传画布` : "PATH 中未检出 codex，可在管线配置指定路径",
      resolvedPath: codexBin,
    },
    {
      ...IMAGE_PROVIDER_DEFS[3],
      ready: hasOpenAiKey,
      modelLabel: config.openaiImageModel || "gpt-image-1",
      statusText: hasOpenAiKey ? "密钥就绪" : "待填密钥",
      detail: hasOpenAiKey
        ? `${config.openaiBaseUrl || "https://api.openai.com"} · 直调生图`
        : "在「系统 → 管线配置」填写 OpenAI API Key 或设置 OPENAI_API_KEY",
    },
  ];
}

function runCommandAsync(exe, args, { cwd, timeoutMs = 240000 } = {}) {
  return new Promise((resolve, reject) => {
    execFile(
      exe,
      args,
      { cwd, timeout: timeoutMs, maxBuffer: 20 * 1024 * 1024, windowsHide: true },
      (err, stdout, stderr) => {
        if (err) {
          let raw = (stderr || stdout || err.message || "命令执行失败").trim();
          if (/Available models:/i.test(raw)) {
            raw = raw.split(/Available models:/i)[0].trim() + "（请在「系统 → 管线配置」下拉选择有效模型）";
          }
          return reject(new Error(raw.slice(0, 220)));
        }
        resolve({ stdout: (stdout || "").trim(), stderr: (stderr || "").trim() });
      }
    );
  });
}

async function verifyGeneratedImage(outPath) {
  try {
    const st = await fsp.stat(outPath);
    if (st.isFile() && st.size > 2048) return st.size;
  } catch {
    // check sibling fallback names
  }
  const dir = path.dirname(outPath);
  const stem = path.basename(outPath, path.extname(outPath));
  const files = await fsp.readdir(dir).catch(() => []);
  for (const f of files) {
    if (f.startsWith(stem) && /\.(png|jpg|jpeg|webp)$/i.test(f)) {
      const full = path.join(dir, f);
      const st = await fsp.stat(full);
      if (st.isFile() && st.size > 2048) {
        if (full !== outPath) await fsp.copyFile(full, outPath);
        return st.size;
      }
    }
  }
  throw new Error("执行完成但目标路径未检出有效图片文件（>2KB）");
}

export async function generateImageWithExternalProvider({
  provider,
  config,
  prompt,
  outPath,
  onProgress,
  onLog,
}) {
  await fsp.mkdir(path.dirname(outPath), { recursive: true });
  const outDir = path.dirname(outPath);

  if (provider === "openai_api") {
    const apiKey = (config.openaiApiKey || "").trim() || (process.env.OPENAI_API_KEY || "").trim();
    if (!apiKey) throw new Error("未配置 OpenAI API Key，请在右上角「系统 → 管线配置」填写");
    const baseUrl = (config.openaiBaseUrl || "https://api.openai.com").replace(/\/+$/, "");
    const model = (config.openaiImageModel || "gpt-image-1").trim();

    onProgress?.(`正在调用 OpenAI ${model} 生成分镜图…`);
    onLog?.(`[OpenAI] POST ${baseUrl}/v1/images/generations (model=${model}, 1536x1024)`);

    const resp = await fetch(`${baseUrl}/v1/images/generations`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        prompt,
        n: 1,
        size: "1536x1024",
        quality: "medium",
      }),
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      const msg = data?.error?.message || `HTTP ${resp.status}`;
      throw new Error(`OpenAI 生图失败：${msg}`);
    }
    const item = data?.data?.[0];
    if (!item) throw new Error("OpenAI 未返回图片数据");

    if (item.b64_json) {
      await fsp.writeFile(outPath, Buffer.from(item.b64_json, "base64"));
    } else if (item.url) {
      const imgResp = await fetch(item.url);
      if (!imgResp.ok) throw new Error(`下载 OpenAI 图片失败：HTTP ${imgResp.status}`);
      const buf = Buffer.from(await imgResp.arrayBuffer());
      await fsp.writeFile(outPath, buf);
    } else {
      throw new Error("OpenAI 响应中既无 b64_json 也无 url");
    }

    const sizeBytes = await verifyGeneratedImage(outPath);
    onLog?.(`[OpenAI] 已落盘 ${path.basename(outPath)} (${Math.round(sizeBytes / 1024)} KB)`);
    return { localPath: outPath, sizeBytes, provider: "openai_api", providerLabel: "OpenAI", model };
  }

  if (provider === "cursor_grok") {
    const cli = await resolveCursorCli(config);
    if (!cli) throw new Error("未检出 Cursor CLI（agent.ps1 / cursor-agent），请在「系统 → 管线配置」指定路径");
    const model = normalizeCursorGrokModel(config.cursorGrokModel);
    const taskPrompt = `请直接调用 GenerateImage 工具生成一张 16:9 电影分镜参考图，并将生成结果保存到绝对路径：${outPath}。不要改动工作区其他文件。画面描述：${prompt}`;

    onProgress?.(`正在通过 CursorCLI (${model}) 生图…`);
    onLog?.(`[Cursor+Grok] 启动 ${path.basename(cli)} --model ${model}`);

    const isPs1 = cli.toLowerCase().endsWith(".ps1");
    const exe = isPs1 ? "powershell.exe" : cli;
    const args = isPs1
      ? ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", cli, "-p", "--trust", "--force", "--model", model, "--workspace", outDir, taskPrompt]
      : ["-p", "--trust", "--force", "--model", model, "--workspace", outDir, taskPrompt];

    const res = await runCommandAsync(exe, args, { cwd: outDir, timeoutMs: 240000 });
    if (res.stdout) onLog?.(`[Cursor+Grok] ${res.stdout.slice(0, 320)}`);
    const sizeBytes = await verifyGeneratedImage(outPath);
    onLog?.(`[Cursor+Grok] 已落盘 ${path.basename(outPath)} (${Math.round(sizeBytes / 1024)} KB)`);
    return { localPath: outPath, sizeBytes, provider: "cursor_grok", providerLabel: "Cursor+Grok", model };
  }

  if (provider === "codex_imagegen") {
    const cli = await resolveCodexCli(config);
    if (!cli) throw new Error("未检出 codex CLI，请在「系统 → 管线配置」填写 codex 可执行路径");
    const logPath = outPath.replace(/\.[^.]+$/, "_codex.log");
    const taskPrompt = `请仅使用内置 image_gen__imagegen 生成一张 16:9 电影分镜参考图（禁止调用 Lovart 或外部付费 API），并将成品直接保存到绝对路径：${outPath}，完成后汇报输出路径。画面描述：${prompt}`;

    onProgress?.("正在通过 CodexCLI 内置 imagegen 生图…");
    onLog?.(`[Codex+Imagegen] 启动 ${path.basename(cli)} exec`);

    const args = ["exec", "--skip-git-repo-check", "-s", "workspace-write", "-C", outDir, "-o", logPath];
    if ((config.codexModel || "").trim()) {
      args.splice(1, 0, "-m", config.codexModel.trim());
    }
    args.push(taskPrompt);

    const res = await runCommandAsync(cli, args, { cwd: outDir, timeoutMs: 240000 });
    if (res.stdout) onLog?.(`[Codex+Imagegen] ${res.stdout.slice(0, 320)}`);
    const sizeBytes = await verifyGeneratedImage(outPath);
    onLog?.(`[Codex+Imagegen] 已落盘 ${path.basename(outPath)} (${Math.round(sizeBytes / 1024)} KB)`);
    return {
      localPath: outPath,
      sizeBytes,
      provider: "codex_imagegen",
      providerLabel: "Codex+Img",
      model: config.codexModel || "imagegen",
    };
  }

  throw new Error(`未知分镜图来源：${provider}`);
}
