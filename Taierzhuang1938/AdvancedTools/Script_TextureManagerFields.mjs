// Inspector-only controls, grouped like the Unity Texture Importer.
const Fields = [
  ["textureType", "Texture Type · 纹理类型", [["inherit", "沿用当前用途"], ["default", "Default · 默认"], ["normal", "Normal Map · 法线"], ["gui", "Editor GUI · 界面"], ["single", "Single Channel · 单通道"]]],
  ["colorSpace", "sRGB · 颜色空间", [["inherit", "沿用清单"], ["srgb", "sRGB · 颜色"], ["linear", "Linear · 数据"]]],
  ["alphaSource", "Alpha Source · 来源", [["input", "Input Texture Alpha"], ["none", "None · 丢弃 Alpha"], ["grayscale", "From Gray Scale · RGB 平均值"]]],
  ["alphaTransparency", "Alpha Is Transparency · 透明边缘扩色", "checkbox"],
  ["singleChannel", "提取通道", ["r", "g", "b", "a"]],
  ["normalFromHeight", "Create From Grayscale · 高度转法线", "checkbox"],
  ["normalStrength", "Bumpiness · 凹凸强度", "number", 0, 10, 0.1],
  ["normalFilter", "法线生成过滤", [["smooth", "Smooth · 前向差分"], ["sharp", "Sharp · Sobel"]]],
  ["flipGreen", "Flip Green Channel · 翻转绿色", "checkbox"],
  ["npot", "Non Power of 2 · 非二次幂", [["none", "None · 保留"], ["nearest", "To Nearest · 最近"], ["larger", "To Larger · 向上"], ["smaller", "To Smaller · 向下"]]],
  ["readWrite", "Read/Write · 保留可读写像素副本", "checkbox"],
  ["wrapU", "Wrap U · 水平寻址", [["inherit", "沿用材质"], ["repeat", "Repeat"], ["clamp", "Clamp"], ["mirror", "Mirror"]]],
  ["wrapV", "Wrap V · 垂直寻址", [["inherit", "沿用材质"], ["repeat", "Repeat"], ["clamp", "Clamp"], ["mirror", "Mirror"]]],
  ["filterMode", "Filter Mode · 过滤", [["inherit", "沿用材质"], ["point", "Point"], ["bilinear", "Bilinear"], ["trilinear", "Trilinear"]]],
  ["anisotropy", "Aniso Level · 各向异性（0 沿用）", "number", 0, 16, 1],
  ["mipFilter", "Mipmap Filtering", [["box", "Box"], ["kaiser", "Kaiser"]]],
  ["mipBorder", "Replicate Border · 边界复制", "checkbox"],
  ["mipCoverage", "Preserve Coverage · 保持透明覆盖率", "checkbox"],
  ["alphaCutoff", "Alpha Cutoff · 透明裁剪阈值", "number", 0.01, 0.99, 0.01],
  ["mipFade", "Fadeout to Gray · 淡出为灰色", "checkbox"],
  ["mipFadeStart", "淡出起始 Mip", "number", 0, 14, 1],
  ["mipFadeEnd", "完全变灰 Mip", "number", 1, 15, 1],
];
const $ = id => document.getElementById(id);
function Select(parent, id, label, options) {
  const row = document.createElement("label"); row.textContent = label; const select = document.createElement("select"); select.id = id;
  for (const option of options) { const [value, text] = Array.isArray(option) ? option : [option, option.toUpperCase()]; select.add(new Option(text, value)); }
  row.append(select); parent.append(row); return select;
}
function Disabled(parent, label, reason, options) {
  const row = document.createElement("label"); row.className = "unsupported"; row.title = reason;
  row.append(document.createTextNode(label));
  const control = document.createElement(options ? "select" : "input");
  if (options) for (const text of options) control.add(new Option(text)); else control.type = "checkbox";
  control.disabled = true; row.append(control);
  const note = document.createElement("small"); note.textContent = reason; row.append(note); parent.append(row);
}
export function BuildTextureManagerFields() {
  $("quality").min = "0";
  $("format").options[0].after(new Option("RGBA32 · 无 GPU 压缩（PNG 传输）", "rgba32"));
  const batch = document.createElement("div"); batch.id = "batch";
  batch.innerHTML = '<div><button id="selectFiltered">选择筛选结果</button><button id="clearSelected">清空</button></div><button id="applySelected" disabled>应用当前全部设置到所选（0）</button>';
  $("list").before(batch);
  Select(document.querySelector(".preview-tools"), "mipLevel", "导入结果 Mip", [["0", "0 · 原始层"]]); $("mipLevel").disabled = true;
  $("maxSize").add(new Option("32", "32"), 1); $("maxSize").add(new Option("16384", "16384"));
  const common = document.createElement("details"); common.open = true; common.className = "import-group";
  common.innerHTML = "<summary>纹理类型与像素处理</summary>";
  $("settings").prepend(common);
  const advanced = document.createElement("details"); advanced.className = "import-group"; advanced.innerHTML = "<summary>Advanced · 高级像素设置</summary>";
  const sampler = document.createElement("details"); sampler.className = "import-group"; sampler.open = true; sampler.innerHTML = "<summary>采样与 Mipmap</summary>";
  $("mipmaps").parentElement.before(sampler); sampler.append($("mipmaps").parentElement);
  for (const [id, label, type, min, max, step] of Fields) {
    const parent = ["npot", "readWrite", "flipGreen"].includes(id) ? advanced : Fields.findIndex(field => field[0] === id) < 11 ? common : sampler;
    if (Array.isArray(type)) Select(parent, id, label, type);
    else { const row = document.createElement("label"), input = document.createElement("input"); row.textContent = label; input.id = id; input.type = type;
      if (type === "number") { input.min = min; input.max = max; input.step = step; } row.append(input); parent.append(row); }
  }
  const swizzle = document.createElement("div"); swizzle.className = "swizzle";
  const caption = document.createElement("div"); caption.textContent = "Swizzle · 通道重排"; advanced.append(caption);
  for (const channel of ["R", "G", "B", "A"]) Select(swizzle, `swizzle${channel}`, channel, ["r", "g", "b", "a", ["R", "1−R"], ["G", "1−G"], ["B", "1−B"], ["A", "1−A"], "0", "1"]);
  advanced.append(swizzle); common.append(advanced);
  Disabled(advanced, "Texture Shape", "当前游戏消费的是 sampler2D；其他形状需要独立材质和装载接口。", ["2D", "Cube", "2D Array", "3D"]);
  for (const label of ["Sprite (2D and UI)", "Cursor", "Cookie", "Lightmap", "Directional Lightmap", "Shadowmask"]) {
    const option = new Option(`${label} · 当前管线未接入`, label); option.disabled = true; $("textureType").add(option);
  }
  for (const id of ["wrapU", "wrapV"]) { const option = new Option("Mirror Once · WebGL 无直接支持", "mirror-once"); option.disabled = true; $(id).add(option); }
  const platform = document.createElement("details"); platform.open = true; platform.className = "import-group"; platform.innerHTML = "<summary>平台覆盖与压缩</summary>";
  $("maxSize").parentElement.before(platform);
  Select(platform, "platform", "Platform · 平台", [["default", "Default · 默认"], ["desktop", "Desktop · 桌面浏览器"], ["android", "Android · 浏览器"], ["ios", "iOS · 浏览器"]]);
  const override = document.createElement("label"); override.innerHTML = 'Override · 覆盖此平台 <input id="platformOverride" type="checkbox">'; platform.append(override);
  for (const id of ["maxSize", "format", "quality"]) platform.append($(id).parentElement);
  Select(platform, "resizeFilter", "Resize Algorithm · 缩放过滤", [["mitchell", "Mitchell"], ["lanczos3", "Lanczos 3"], ["linear", "Bilinear"], ["nearest", "Nearest"]]);
  for (const [value, label] of [["bc4", "BC4 · 单红通道"], ["bc5", "BC5 · 双通道法线"], ["bc6h", "BC6H · HDR"], ["astc6", "ASTC 6×6 / 8×8 / 10×10 / 12×12"], ["pvrtc", "PVRTC 2 / 4 bpp"], ["etc1", "ETC1 / Split Alpha"], ["packed", "RGB16 / RGBA16 / R8 / R16 / Half / Float"]]) {
    const option = new Option(`${label} · 当前编码/材质管线不支持`, value); option.disabled = true; option.dataset.unsupported = "true"; $("format").add(option);
  }
  const unsupported = document.createElement("details"); unsupported.className = "import-group unsupported-group"; unsupported.innerHTML = "<summary>Unity 扩展选项 · 当前不可用</summary>";
  $("settings").append(unsupported);
  for (const [label, reason, options] of [
    ["Virtual Texture Only", "需要虚拟纹理分页、反馈与纹理栈，当前 WebGL 管线未接入。"],
    ["Stream Mipmap Levels / Priority", "当前纹理整体上传；浏览器没有 Unity 的纹理流送预算系统。"],
    ["Mipmap Limit / Limit Group", "当前画质系统尚无按纹理组管理的全局 Mip 限制。"],
    ["Use Crunch Compression", "当前运行时使用 Basis 转码器，不包含 Unity Crunch 解码器。"],
    ["Split Alpha Channel", "现有材质使用一张 RGBA 贴图，没有双贴图透明通道合并接口。"],
    ["Ignore PNG Gamma / Remove PSD Matte", "当前解码器统一规范化图像；PSD 源文件不在本次独立图片清单内。"],
    ["Sprite Mode / Sprite Editor / Packing Tag", "依赖 Unity SpriteRenderer、精灵切片、图集和九宫格接口。", ["Single", "Multiple", "Polygon"]],
    ["Pixels Per Unit / Pivot / Mesh / Border", "精灵几何与物理形状数据尚无对应消费系统。"],
    ["Cubemap Mapping / Convolution / Seamless", "需要 Cube 采样器、环境卷积与专用预览。"],
    ["Array / 3D Columns / Rows", "当前独立图片消费方不接收切片数组或体纹理。"],
  ]) Disabled(unsupported, label, reason, options);
  const revert = document.createElement("button"); revert.type = "button"; revert.id = "revert"; revert.textContent = "Revert · 撤销此图未保存修改"; $("reset").after(revert);
}
export function ReadTextureManagerFields(previous) {
  const settings = {};
  for (const [id, , type] of Fields) settings[id] = $(id).disabled ? previous[id] : type === "checkbox" ? $(id).checked : type === "number" ? Number($(id).value) : $(id).value;
  settings.swizzle = ["R", "G", "B", "A"].map(channel => $(`swizzle${channel}`).value).join("");
  return settings;
}
export function SyncTextureManagerFields(settings, item, platform, overridden) {
  for (const [id, , type] of Fields) { if (type === "checkbox") $(id).checked = settings[id]; else $(id).value = String(settings[id]); $(id).disabled = false; }
  for (const [i, channel] of ["R", "G", "B", "A"].entries()) $(`swizzle${channel}`).value = settings.swizzle[i];
  for (const id of ["normalFromHeight", "normalStrength", "normalFilter"]) $(id).parentElement.hidden = settings.textureType !== "normal";
  $("singleChannel").parentElement.hidden = settings.textureType !== "single";
  $("normalStrength").disabled = $("normalFilter").disabled = !settings.normalFromHeight;
  $("alphaCutoff").disabled = !settings.mipCoverage;
  $("mipFadeStart").disabled = $("mipFadeEnd").disabled = !settings.mipFade;
  $("platformOverride").parentElement.hidden = platform === "default";
  $("platformOverride").checked = overridden; $("platform").disabled = !item.sampler;
  for (const id of ["colorSpace", "wrapU", "wrapV", "filterMode", "anisotropy", "mipFilter", "mipBorder", "mipCoverage", "mipFade", "readWrite"]) if (!item.sampler) $(id).disabled = true;
  if (settings.textureType === "normal" || settings.textureType === "single") { $("colorSpace").value = "linear"; $("colorSpace").disabled = true; }
  for (const id of ["mipFilter", "mipBorder", "mipCoverage", "mipFade"]) if (settings.mipmaps === false) $(id).disabled = true;
}
