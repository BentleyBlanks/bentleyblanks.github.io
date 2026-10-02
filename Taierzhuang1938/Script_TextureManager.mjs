import { TextureCatalog, IMPORT_DEFAULTS, ValidateImportDocument, NormalizeImportSettings } from "./Script_TextureImportRules.mjs";
import { RECIPES } from "./Script_TexBake.mjs";

const $ = id => document.getElementById(id), catalog = TextureCatalog();
const procedural = [...Object.keys(RECIPES), "DetailNormal", "SkinLut"];
const draftKey = `TengxianTextureImporter:${location.host}${location.pathname}`;
let config = { version: 1, textures: {} }, saved = JSON.stringify(config), revision, writable = false;
let mode = "ordinary", selected, images = [], worker, requestId = 0, busy = false;
const Bytes = n => n >= 1048576 ? `${(n / 1048576).toFixed(2)} MiB` : `${(n / 1024).toFixed(1)} KiB`;
function Status(text, error = false) { $("status").textContent = text; $("status").classList.toggle("error", error); }
function Dirty() {
  const dirty = JSON.stringify(config) !== saved;
  $("dirty").textContent = dirty ? `${Object.keys(config.textures).length} 张覆盖设置 · 有未保存修改` : `${Object.keys(config.textures).length} 张覆盖设置 · 已同步`;
  $("save").disabled = !writable || busy || !dirty;
  try { if (dirty) localStorage.setItem(draftKey, JSON.stringify({ config, revision })); else localStorage.removeItem(draftKey); } catch {}
}
async function Json(url, body) {
  const response = await fetch(url, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : { cache: "no-store" });
  const data = await response.json(); if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`); return data;
}
async function Load() {
  let draft; try { draft = JSON.parse(localStorage.getItem(draftKey)); } catch {}
  try {
    const state = await Json("/__textures/status");
    config = ValidateImportDocument(state.document); revision = state.revision; writable = state.writable;
    Status(`本地配置：${state.root} · 保存后随下次发布生效`);
  } catch {
    config = ValidateImportDocument(await Json("./Data_TextureImportSettings.json")); writable = false;
    Status("在线浏览模式：可编辑、导入／导出配置和预览程序化贴图。实际压缩预览与保存请从本地预览服务打开。");
  }
  saved = JSON.stringify(config);
  if (draft) {
    try { config = ValidateImportDocument(draft.config); if (draft.revision) revision = draft.revision; Status("已恢复未保存草稿；保存时会检查仓库配置是否发生冲突。"); } catch {}
  }
  Dirty(); List(); await Select(selected || catalog[0].file);
}
function List() {
  const query = $("search").value.trim().toLowerCase();
  const filtered = mode === "ordinary" ? catalog.filter(item => `${item.file} ${item.set} ${item.kind} ${item.channel}`.toLowerCase().includes(query))
    : procedural.filter(name => name.toLowerCase().includes(query));
  $("count").textContent = mode === "ordinary" ? `${filtered.length} / ${catalog.length} 张独立图片` : `${filtered.length} 项 · 50 套配方 + 2 张全局图`;
  $("list").replaceChildren();
  for (const item of filtered) {
    const name = typeof item === "string" ? item : item.file;
    const button = document.createElement("button"); button.className = "asset"; button.classList.toggle("active", name === selected);
    button.dataset.name = name; button.role = "option"; button.setAttribute("aria-selected", String(name === selected));
    const title = document.createElement("span"); title.textContent = name.replace(/^Texture_/, ""); button.append(title);
    const small = document.createElement("small"); small.textContent = typeof item === "string" ? "按需生成 · 只读预览" : `${item.width} × ${item.height} · ${item.channel} · ${item.tier}${config.textures[name] ? " · 已配置" : ""}`;
    button.append(small); button.onclick = () => Select(name); $("list").append(button);
  }
}
function Settings() { return mode === "ordinary" ? { ...IMPORT_DEFAULTS, ...config.textures[selected] } : null; }
function SyncForm() {
  const item = catalog.find(item => item.file === selected), settings = Settings();
  const ordinary = mode === "ordinary";
  $("settings").hidden = !ordinary;
  $("scope").textContent = ordinary ? "保存发布设置后，每次发布从源图重新导入。" : "程序化贴图来自运行时配方；此处只预览，不保存压缩设置，也不改变游戏。";
  $("procSizeLabel").hidden = $("generate").hidden = ordinary;
  if (!ordinary || !item) return;
  for (const name of ["maxSize", "format", "quality", "mipmaps"]) $(name).value = String(settings[name]);
  $("qualityValue").textContent = settings.quality;
  for (const option of $("format").options) option.disabled = option.value.startsWith("ktx2") && !item.gpu
    || option.value === "jpeg" && (item.colorSpace !== "srgb" || !/\.jpe?g$/i.test(item.file));
  $("mipmaps").disabled = !item.sampler;
  $("quality").disabled = ["source", "png", "webp-lossless"].includes(settings.format);
  $("restriction").textContent = item.restriction;
  $("formatHint").textContent = settings.format.startsWith("ktx2")
    ? "KTX2 在设备上转为支持的 GPU 格式。Mipmap 开启时离线生成完整层级；沿用当前材质默认生成。"
    : settings.format === "source" ? "无尺寸限制时直接保留原始文件；设置尺寸上限后按源格式缩小。Mipmap 在 GPU 上传时应用。"
    : "尺寸保持比例，只缩小不放大。质量影响有损编码；法线与数据图建议使用无损或 UASTC。";
  $("preview").disabled = busy || !writable;
}
async function Select(name) {
  selected = name; const id = ++requestId; worker?.terminate(); worker = null;
  images = []; $("previews").replaceChildren(); $("result").textContent = "";
  $("name").textContent = name; List(); SyncForm();
  if (mode === "procedural") {
    $("kind").textContent = "PROCEDURAL"; $("metadata").textContent = "独立工作线程生成预览；仅处理当前选中的配方。";
    await Generate(); return;
  }
  const item = catalog.find(item => item.file === name);
  $("kind").textContent = `${item.kind} / ${item.channel}`;
  $("metadata").textContent = `${item.width} × ${item.height} · ${item.colorSpace} · ${item.consumers.join("，")}`;
  try {
    const response = await fetch(`./Texture/${name}`), blob = await response.blob();
    if (!response.ok) throw new Error(`源图读取失败：${response.status}`);
    const bitmap = await createImageBitmap(blob, { premultiplyAlpha: "none", colorSpaceConversion: "none" });
    if (id !== requestId) { bitmap.close(); return; }
    images = [Pixels(bitmap, "源图", Bytes(blob.size))]; bitmap.close(); Draw();
  } catch (error) { if (id === requestId) Status(error.message, true); }
}
function Pixels(image, name, caption = "") {
  const canvas = document.createElement("canvas"); canvas.width = image.width; canvas.height = image.height;
  const context = canvas.getContext("2d", { willReadFrequently: true }); context.drawImage(image, 0, 0);
  return { name, caption, width: image.width, height: image.height, data: context.getImageData(0, 0, image.width, image.height).data };
}
function Draw() {
  $("previews").replaceChildren(); const channel = $("channel").value;
  for (const image of images) {
    const card = document.createElement("div"); card.className = "preview-card";
    const title = document.createElement("h3"); title.textContent = image.name;
    const wrap = document.createElement("div"); wrap.className = "canvas-wrap";
    const canvas = document.createElement("canvas"); canvas.width = image.width; canvas.height = image.height;
    const bytes = new Uint8ClampedArray(image.data);
    for (let i = 0; i < bytes.length; i += 4) {
      if (channel === "rgba") continue;
      if (channel !== "rgb") { const value = bytes[i + { r: 0, g: 1, b: 2, a: 3 }[channel]]; bytes[i] = bytes[i + 1] = bytes[i + 2] = value; }
      bytes[i + 3] = 255;
    }
    canvas.getContext("2d").putImageData(new ImageData(bytes, image.width, image.height), 0, 0);
    const caption = document.createElement("div"); caption.className = "caption"; caption.textContent = `${image.width} × ${image.height} · ${image.caption || channel.toUpperCase()}`;
    wrap.append(canvas); card.append(title, wrap, caption); $("previews").append(card);
  }
}
async function Generate() {
  if (mode !== "procedural") return;
  worker?.terminate(); const id = ++requestId, name = selected;
  $("result").textContent = "正在生成当前配方…";
  worker = new Worker(new URL("./Script_TexturePreviewWorker.mjs?v=2026100301", import.meta.url), { type: "module" });
  worker.onmessage = ({ data }) => {
    if (data.id !== requestId) return;
    if (data.error) Status(data.error, true);
    else { images = data.images; Draw(); $("result").textContent = `${name} · 预览完成，游戏运行时配置未变更`; }
    worker.terminate(); worker = null;
  };
  worker.onerror = error => { Status(error.message, true); worker?.terminate(); worker = null; };
  worker.postMessage({ id, name, size: Number($("procSize").value) });
}
async function Preview() {
  const id = requestId, name = selected, settings = Settings(); busy = true; SyncForm(); Dirty();
  Status("正在使用发布编码器重新导入当前贴图…");
  try {
    const result = await Json("/__textures/preview", { file: name, settings });
    let image;
    if (result.format.startsWith("ktx2")) {
      const THREE = await import("three"), { KTX2Loader } = await import("./vendor/three/examples/jsm/loaders/KTX2Loader.js");
      const renderer = new THREE.WebGLRenderer({ alpha: true, preserveDrawingBuffer: true });
      const loader = new KTX2Loader().setTranscoderPath("./vendor/three/examples/jsm/libs/basis/").setWorkerLimit(1).detectSupport(renderer);
      let texture, geometry, material;
      try {
        texture = await loader.loadAsync(result.url);
        renderer.setSize(result.width, result.height); renderer.outputColorSpace = result.colorSpace === "srgb" ? THREE.SRGBColorSpace : THREE.LinearSRGBColorSpace;
        const scene = new THREE.Scene(), camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 2); camera.position.z = 1;
        geometry = new THREE.PlaneGeometry(2, 2); material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, toneMapped: false });
        scene.add(new THREE.Mesh(geometry, material)); renderer.render(scene, camera);
        const formats = { [THREE.RGBA_BPTC_Format]: "BC7", [THREE.RGBA_S3TC_DXT5_Format]: "BC3", [THREE.RGB_S3TC_DXT1_Format]: "BC1",
          [THREE.RGBA_ASTC_4x4_Format]: "ASTC 4×4", [THREE.RGBA_ETC2_EAC_Format]: "ETC2 RGBA", [THREE.RGB_ETC2_Format]: "ETC2 RGB", [THREE.RGBAFormat]: "RGBA8" };
        const gpuBytes = texture.mipmaps.reduce((n, mip) => n + mip.data.byteLength, 0);
        image = Pixels(renderer.domElement, "导入结果", `${Bytes(result.bytes)} · ${result.mipLevels} 层 mip · ${formats[texture.format] || "GPU 压缩"} · 显存 ${Bytes(gpuBytes)}`);
      } finally { texture?.dispose(); geometry?.dispose(); material?.dispose(); loader.dispose(); renderer.dispose(); renderer.forceContextLoss(); }
    } else {
      const bitmap = await createImageBitmap(await (await fetch(result.url)).blob(), { premultiplyAlpha: "none", colorSpaceConversion: "none" });
      image = Pixels(bitmap, "导入结果", Bytes(result.bytes)); bitmap.close();
    }
    if (id !== requestId || mode !== "ordinary" || name !== selected) return;
    images = [images[0], image].filter(Boolean); Draw();
    const delta = (result.bytes / result.sourceBytes - 1) * 100;
    $("result").textContent = `源文件 ${Bytes(result.sourceBytes)} → ${Bytes(result.bytes)}（${delta > 0 ? "增加" : "减少"} ${Math.abs(delta).toFixed(1)}%） · ${result.width} × ${result.height} · ${result.format}`;
    Status("预览已完成。点击“保存发布配置”，使这组设置随下次发布生效。");
  } catch (error) { Status(error.message, true); }
  finally { busy = false; SyncForm(); Dirty(); }
}
$("settings").oninput = () => {
  if (mode !== "ordinary") return;
  const mip = $("mipmaps").value;
  config.textures[selected] = NormalizeImportSettings({ maxSize: Number($("maxSize").value), format: $("format").value,
    quality: Number($("quality").value), mipmaps: mip === "inherit" ? mip : mip === "true" }, catalog.find(item => item.file === selected));
  if (images.length > 1) images = images.slice(0, 1);
  $("result").textContent = "设置已修改，重新导入可查看实际结果。";
  requestId++; SyncForm(); Dirty(); List(); Draw();
};
$("settings").onsubmit = event => event.preventDefault();
$("reset").onclick = () => { delete config.textures[selected]; requestId++; images = images.slice(0, 1); $("result").textContent = "已恢复默认设置；保存后发布生效。"; SyncForm(); Dirty(); List(); Draw(); };
$("save").onclick = async () => { try { const result = await Json("/__textures/save", { document: config, revision }); config = result.document; revision = result.revision; saved = JSON.stringify(config); Dirty(); Status("已保存到仓库 Data_TextureImportSettings.json，下次发布自动应用。"); } catch (error) { Status(error.message, true); } };
$("export").onclick = () => { const url = URL.createObjectURL(new Blob([JSON.stringify(config, null, 2) + "\n"], { type: "application/json" })); const a = document.createElement("a"); a.href = url; a.download = "Data_TextureImportSettings.json"; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); };
$("import").onchange = async event => { try { config = ValidateImportDocument(JSON.parse(await event.target.files[0].text())); SyncForm(); List(); Dirty(); Status("配置已导入为草稿，保存后才会用于发布。"); } catch (error) { Status(error.message, true); } event.target.value = ""; };
$("reload").onclick = () => { if (JSON.stringify(config) !== saved && !confirm("丢弃未保存修改并重新读取仓库配置？")) return; localStorage.removeItem(draftKey); Load().catch(error => Status(error.message, true)); };
for (const next of ["ordinary", "procedural"]) $(next).onclick = () => { mode = next; selected = null; for (const name of ["ordinary", "procedural"]) $(name).classList.toggle("active", name === mode); $("search").value = ""; Select(mode === "ordinary" ? catalog[0].file : procedural[0]); };
$("search").oninput = List; $("channel").onchange = Draw; $("zoom").onchange = () => $("previews").classList.toggle("pixel", $("zoom").checked);
$("preview").onclick = Preview; $("generate").onclick = Generate; $("procSize").onchange = Generate;
window.addEventListener("beforeunload", event => { if (JSON.stringify(config) !== saved) { event.preventDefault(); event.returnValue = ""; } });
window.addEventListener("pagehide", () => worker?.terminate());
Load().catch(error => Status(error.message, true));
