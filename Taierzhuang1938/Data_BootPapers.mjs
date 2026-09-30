// Data_BootPapers.mjs — 加载画面上那张「战前报纸剪报」的清单。纯数据，零 three。
//
// 版式参考 Notion「加载界面｜战前报纸剪报方案与史料库」：黑底上一张带撕边与折痕的老报纸，
// 左下角是「史料摘录 | 《报名》 日期」加一句简述。这里只登记**Notion 里被标了颜色的那 20 期**
// （黄 = 重大事件，蓝 = 有助于理解滕县战前局势与军民处境），每次开机随机亮一张，
// 且不与上一次重复（Script_BootPaper）。
//
// 文本不在这里：名字 / 日期 / 简述都在 Data_Text_Boot 的 `boot.paper.<id>.name|date|dateCn|summary`，
// 简述是 Notion 里「加载页摘要」的原文（现代中文概括，战果与传闻保留“报纸称”）。
// 图是 Lovart 生的「博物馆文物摄影」式报纸（提示词与来源见 _import/Prompts/Texture_BootPaper.txt、Data_TextureManifest）。
// 图上的报头与标题是**为这一期写的**，不是原报扫描件；简述才是史料口径。

/** 图所在目录（相对 Taierzhuang1938/）。 */
export const BOOT_PAPER_DIR = "./Texture/Menu/BootPaper/";

/** 图的缓存戳。换图时改这里（贴图不进 import map）。 */
export const BOOT_PAPER_STAMP = "20260930";

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
  Object.freeze({ id: "NanYangShangBao19371108", file: "Texture_BootPaperNanYangShangBao19371108.webp" }),
  Object.freeze({ id: "NanYangShangBao19371110", file: "Texture_BootPaperNanYangShangBao19371110.webp" }),
  Object.freeze({ id: "NanYangShangBao19371113", file: "Texture_BootPaperNanYangShangBao19371113.webp" }),
  Object.freeze({ id: "NanYangShangBao19371214", file: "Texture_BootPaperNanYangShangBao19371214.webp" }),
  Object.freeze({ id: "NanYangShangBao19371229", file: "Texture_BootPaperNanYangShangBao19371229.webp" }),
  Object.freeze({ id: "NanYangShangBao19380112", file: "Texture_BootPaperNanYangShangBao19380112.webp" }),
  Object.freeze({ id: "NanYangShangBao19380204", file: "Texture_BootPaperNanYangShangBao19380204.webp" }),
  Object.freeze({ id: "NanYangShangBao19380305", file: "Texture_BootPaperNanYangShangBao19380305.webp" }),
  Object.freeze({ id: "NanYangShangBao19380307", file: "Texture_BootPaperNanYangShangBao19380307.webp" }),
]);

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
