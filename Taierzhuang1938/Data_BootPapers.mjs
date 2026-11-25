// Data_BootPapers.mjs — 加载画面上那张「战前报纸剪报」的清单。纯数据，零 three。
//
// 版式参考 Notion「加载界面｜战前报纸剪报方案与史料库」：黑底上一张带撕边与折痕的老报纸，
// 左下角是「史料摘录 | 《报名》 日期」加一句简述。这里只登记**Notion 里被标了颜色、且贴着原图的那 11 期**
// （黄 = 重大事件，蓝 = 有助于理解滕县战前局势与军民处境），每次开机随机亮一张，
// 且不与上一次重复（Script_BootPaper）。没有原图的条目（页尾「其他已定位报纸」）不收：
// 版面与照片来自实际史料，同一期可采用核对过的无水印扫描或照片。
//
// 文本不在这里：名字 / 日期 / 简述都在 Data_Text_Boot 的 `boot.paper.<id>.name|date|dateCn|summary`，
// 简述是 Notion 里「加载页摘要」的原文（现代中文概括，战果与传闻保留“报纸称”）。
// 画刊的刊名是《战事画刊》（Notion 第四节的说明，馆藏介绍页写的）。
//
// 真实图文逐像素印到空白做旧纸上，照片与报头均取自对应的史料。
// 2026-11-26 三张替换成无水印图文，纸面沿用参考的折脊、卷角和掠射光。
// 来源与合成记录见 _import/Prompts/Texture_BootPaper.txt。

/** 图所在目录（相对 Taierzhuang1938/）。 */
export const BOOT_PAPER_DIR = "./Texture/Menu/BootPaper/";

/** 图的缓存戳。换图时改这里（贴图不进 import map）。 */
export const BOOT_PAPER_STAMP = "2026112601";

/** Matched, linear data maps; only the selected paper's pair is requested. */
export const BOOT_PAPER_PBR_STAMP = "2026112601";
export const BOOT_PAPER_PBR = Object.freeze({
  normalScale: 0.85,
  maxCanvasEdge: 1400,
  maxPixelRatio: 1.5,
  loadTimeoutMs: 15000,
  ambient: 0.38,
  direct: 0.85,
  specular: 0.32,
  light: Object.freeze([-0.55, 0.65, 0.82]),
});

export const BOOT_PAPERS = Object.freeze([
  Object.freeze({ id: "LiBao19370709", file: "Texture_BootPaperLiBao19370709.webp" }),
  Object.freeze({ id: "ShenBao19370731", file: "Texture_BootPaperShenBao19370731.webp" }),
  Object.freeze({ id: "WenHui19380125", file: "Texture_BootPaperWenHui19380125.webp" }),
  Object.freeze({ id: "ZhanShiHuaKan19370820", file: "Texture_BootPaperZhanShiHuaKan19370820.webp" }),
  Object.freeze({ id: "ZhanShiHuaKan19370906", file: "Texture_BootPaperZhanShiHuaKan19370906.webp" }),
  Object.freeze({ id: "ZhanShiHuaKan19370911", file: "Texture_BootPaperZhanShiHuaKan19370911.webp" }),
  Object.freeze({ id: "ZhanShiHuaKan19371001", file: "Texture_BootPaperZhanShiHuaKan19371001.webp" }),
  Object.freeze({ id: "ZhanShiHuaKan19371106", file: "Texture_BootPaperZhanShiHuaKan19371106.webp" }),
  Object.freeze({ id: "ZhanShiHuaKan19371111", file: "Texture_BootPaperZhanShiHuaKan19371111.webp" }),
  Object.freeze({ id: "JiuGuoShiBao19371220", file: "Texture_BootPaperJiuGuoShiBao19371220.webp" }),
  Object.freeze({ id: "ChinaWeeklyReview19371106", file: "Texture_BootPaperChinaWeeklyReview19371106.webp" }),
]);

/**
 * 拖拽倾斜的口径。纸只许在一个小范围里转（不是 180° 翻面）：
 * 偏航（横拖）±40°、俯仰（竖拖）±26°，到头有阻尼；松手后用 CSS 过渡缓缓回正。
 * degPerPx：每像素鼠标位移转多少度。perspectivePx：透视距离，越小近大远小越明显。
 */
export const BOOT_PAPER_TILT = Object.freeze({
  maxYawDeg: 40,
  maxPitchDeg: 26,
  yawDegPerPx: 0.2,
  pitchDegPerPx: 0.15,
  edgeSoftness: 0.35,     // 接近上限时的衰减：剩余余量越小，同样的位移转得越少
  perspectivePx: 1500,
  returnSeconds: 0.9,
});

/** 上一次亮的是哪张：存 localStorage，下次开机换一张。 */
export const BOOT_PAPER_STORAGE_KEY = "tzBootPaperLast";

