// Data_BootPapers.mjs — 加载画面上那张「战前报纸剪报」的清单。纯数据，零 three。
//
// 版式参考 Notion「加载界面｜战前报纸剪报方案与史料库」：黑底上一张带撕边与折痕的老报纸，
// 左下角是「史料摘录 | 《报名》 日期」加一句简述。这里只登记**Notion 里被标了颜色、且贴着原图的那 11 期**
// （黄 = 重大事件，蓝 = 有助于理解滕县战前局势与军民处境），每次开机随机亮一张，
// 且不与上一次重复（Script_BootPaper）。没有原图的条目（页尾「其他已定位报纸」）不收：
// 报纸上的内容必须与 Notion 里贴的原图一致，不许自己写标题。
//
// 文本不在这里：名字 / 日期 / 简述都在 Data_Text_Boot 的 `boot.paper.<id>.name|date|dateCn|summary`，
// 简述是 Notion 里「加载页摘要」的原文（现代中文概括，战果与传闻保留“报纸称”）。
// 画刊的刊名是《战事画刊》（Notion 第四节的说明，馆藏介绍页写的）。
//
// **图是原图印在空白做旧纸上，不是 AI 重画的**：纸底是 Lovart 出的、没有任何印刷的空白纸，
// 原图逐像素正片叠底上去（合成脚本 _import/Script_ComposeBootPaper.py），所以报头、标题、照片
// 与 Notion 上那张完全一致。原图自带的水印（第三方转载站、馆藏红字）不属于史料内容，红色馆藏水印在合成时被淡出，
// 转载站的小水印无法干净去除，原样保留。来源与提示词见 _import/Prompts/Texture_BootPaper.txt。

/** 图所在目录（相对 Taierzhuang1938/）。 */
export const BOOT_PAPER_DIR = "./Texture/Menu/BootPaper/";

/** 图的缓存戳。换图时改这里（贴图不进 import map）。 */
export const BOOT_PAPER_STAMP = "20261002050000";

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

/** 随机抽一张，尽量不与 lastId 重复。rand 默认 Math.random，测试里可注入。 */
export function PickBootPaper(lastId = null, rand = Math.random) {
  const pool = BOOT_PAPERS.length > 1 ? BOOT_PAPERS.filter((paper) => paper.id !== lastId) : BOOT_PAPERS;
  return pool[Math.min(pool.length - 1, Math.floor(rand() * pool.length))];
}

export function BootPaperUrl(paper) {
  return `${BOOT_PAPER_DIR}${paper.file}?v=${BOOT_PAPER_STAMP}`;
}

/**
 * 一次拖拽位移加到当前倾角上，返回新倾角（度）。纯函数，测试直接断言上限。
 * 越接近上限衰减越多（橡皮筋手感），永远不会超过 max。
 */
export function ApplyTiltDrag(current, dx, dy, tuning = BOOT_PAPER_TILT) {
  const step = (value, delta, max) => {
    if (delta === 0) return value;
    const toward = Math.sign(delta) === Math.sign(value) || value === 0;
    const room = toward ? Math.max(0, 1 - Math.abs(value) / max) : 1;
    const gain = toward ? tuning.edgeSoftness + (1 - tuning.edgeSoftness) * room : 1;
    return Math.max(-max, Math.min(max, value + delta * gain));
  };
  return {
    yaw: step(current.yaw, dx * tuning.yawDegPerPx, tuning.maxYawDeg),
    pitch: step(current.pitch, -dy * tuning.pitchDegPerPx, tuning.maxPitchDeg),
  };
}
