import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";

export const VIEW_LABELS = { front: "正面", side: "左侧", back: "背面" };

export function TripoViews(views) {
  const directions = {
    "正面": "front", front: "front",
    "左侧": "left", "左侧面": "left", left: "left",
    "右侧": "right", "右侧面": "right", right: "right",
    "背面": "back", back: "back",
  };
  const selected = new Map();
  for (const view of views) {
    const label = view.label.trim().toLowerCase();
    if (Object.hasOwn(directions, label)) selected.set(directions[label], view);
  }
  return selected.has("front") && selected.size > 1 ? Object.fromEntries(selected) : null;
}

export const PROVIDERS = {
  openai: "OpenAI API · GPT-Image-2.6",
  lovart: "Lovart",
  imagegen: "内置 imagegen",
  seedream: "Seedream",
};

const imageModel = "gpt-image-2.6-sunburst";
const quality = "max";
const size = "2048x2048";

export function ThreeViewPrompt(task) {
  return [
    `制作「${task.title}」的正面、左侧和背面三张独立正交参考图。`,
    task.brief,
    "输入有圈注时只提取标记内的对象，保留对象完整轮廓，去掉红色标注、背景和无关内容。",
    "一致保留比例、部件位置、结构、材质色与独有细节。各视图比例、朝向、高度及取景一致，完整入画，背景用中性灰，无透视、文字、标尺、水印和装饰。",
    "不可见部位按现有依据合理推断。交代推断项，供用户审批。",
  ].filter(Boolean).join("\n");
}

export async function GenerateOpenAiViews(task, sources, folder, { signal, progress, request = fetch }) {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) throw new Error("本机预览服务缺少 OPENAI_API_KEY，请配置后重启服务。");
  const cacheKey = createHash("sha256").update(JSON.stringify({
    prompt: ThreeViewPrompt(task), imageModel, quality, size, ids: sources.map(source => source.id),
  })).digest("hex");
  const cache = path.join(folder, cacheKey);
  await fs.mkdir(cache, { recursive: true });
  const references = [];
  for (const [view, label] of Object.entries(VIEW_LABELS)) {
    signal.throwIfAborted();
    const file = path.join(cache, `Reference_${view}.png`);
    const receipt = path.join(cache, `Request_${view}.json`);
    let requestId;
    try {
      requestId = JSON.parse(await fs.readFile(receipt, "utf8")).requestId;
      await fs.access(file);
    } catch {
      progress(`OpenAI 正在生成${label} · 2048 × 2048 · Max`);
      const form = new FormData();
      for (const [name, value] of Object.entries({
        model: imageModel, quality, size, complexity: "high", output_format: "png", background: "opaque",
        prompt: `${ThreeViewPrompt(task)}\n本次只输出${label}单图，之前的生成图用于保持对象一致。`,
      })) form.append(name, value);
      const inputs = [...sources.map(source => source.path), ...references.map(reference => reference.path)];
      for (const input of inputs) {
        const name = path.basename(input);
        const type = /\.jpe?g$/i.test(name) ? "image/jpeg" : /\.webp$/i.test(name) ? "image/webp" : "image/png";
        form.append("image[]", new Blob([await fs.readFile(input)], { type }), name);
      }
      const response = await request("https://api.openai.com/v1/images/edits", {
        method: "POST", headers: { Authorization: `Bearer ${key}` }, body: form, redirect: "error",
        signal: AbortSignal.any([signal, AbortSignal.timeout(20 * 60_000)]),
      });
      requestId = response.headers.get("x-request-id");
      if (!response.ok) {
        const error = await response.json().catch(() => null);
        const code = error?.error?.code;
        throw new Error(`OpenAI Image API HTTP ${response.status}${code ? `（${code}）` : ""}${requestId ? ` · ${requestId}` : ""}`);
      }
      const bytes = Buffer.from((await response.json()).data?.[0]?.b64_json ?? "", "base64");
      if (bytes.length < 33 || bytes.toString("hex", 0, 8) !== "89504e470d0a1a0a"
        || bytes.readUInt32BE(16) !== 2048 || bytes.readUInt32BE(20) !== 2048) {
        throw new Error(`OpenAI 返回的${label}图片缺失或原生规格不符`);
      }
      await fs.writeFile(file, bytes);
      await fs.writeFile(receipt, JSON.stringify({ requestId, model: imageModel, quality, size, inputs }, null, 2));
    }
    references.push({ view, label, path: file, source: PROVIDERS.openai, requestId, generated: true });
  }
  return references;
}

export function AlternateProviderInstructions(provider) {
  return {
    lovart: '仅使用官方 Lovart Agent OpenAPI skill 的 agent_skill.py。查找 lovart-skill 或 lovart-api，优先使用 MODEL_WORKBENCH_LOVART_CLI 指定的入口。通过官方 upload 和 chat 命令附带输入图，下载原生 2K 或更高的成品。若缺少工具、密钥或需额外确认，写明阻塞并停止。',
    imagegen: '只调用 Codex 内置 imagegen 工具，传入提供的原始图像路径并保存工具返回的原图。为每个视角请求原生 2K 或以上的最高可用质量。若工具或分辨率不可用，写明阻塞并停止。',
    seedream: '只用即梦的 dreamina image2image 对输入图进行生成，先看本地 CLI 帮助，使用 Seedream 5.0Pro、2k 或更高，下载原图。用 submit ID 查询同一任务。也可使用 MODEL_WORKBENCH_SEEDREAM_CLI 指定的 dreamina 入口。工具、账号或权限不可用时写明阻塞并停止。',
  }[provider];
}
