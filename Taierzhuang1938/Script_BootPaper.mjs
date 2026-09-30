// 《台儿庄：血战滕县》加载画面上的战前报纸剪报 —— **宿主**。清单在 Data_BootPapers.mjs。
//
// 版式参考 Notion「加载界面｜战前报纸剪报方案与史料库」：黑底上一张带撕边与折痕的老报纸，
// 左下角是「史料摘录 | 《报名》 日期」加一句简述。玩家在等的这段时间读到的是这一仗之前
// 的世道：卢沟桥、淞沪、南京、鲁南，一期一句。
//
// 为什么是一张静图而不是原来那台能转的道具展示台：展示台要起 worker、拉一件 TZM 模型、
// 起一台小 WebGLRenderer，加载最忙的那几秒它自己就在争主线程与显存；一张 ~200 KB 的 webp
// 什么都不争，只在开机时按需拉一张（其余十九张一个字节都不下）。
//
// 每次开机随机换一张，不与上一次重复（localStorage，读写都包 try：隐私模式会抛，抛了就当没有上一次）。
// 图没拉下来不影响文字：简述本身就是完整的一句话，图只是氛围。

import { BOOT_PAPER_STORAGE_KEY, BootPaperUrl, PickBootPaper } from "./Data_BootPapers.mjs";
import { T } from "./Script_Text.mjs";

const Key = (paper, field) => `boot.paper.${paper.id}.${field}`;

/** 一张报纸在画面上要写的几行字。Script_BootPaperTest 逐张核对每一项都有文本。 */
export function PaperCard(paper) {
  const name = T(Key(paper, "name"));
  const date = T(Key(paper, "date"));
  return {
    id: paper.id,
    name,
    date,
    kicker: T("boot.paper.kicker"),
    summary: T("boot.paper.summaryLine", { summary: T(Key(paper, "summary")) }),
    subtitle: T("boot.paper.subtitle", { date: T(Key(paper, "dateCn")) }),
    alt: T("boot.paper.alt", { name, date }),
  };
}

function ReadLast() {
  try { return localStorage.getItem(BOOT_PAPER_STORAGE_KEY); } catch { return null; }
}
function WriteLast(id) {
  try { localStorage.setItem(BOOT_PAPER_STORAGE_KEY, id); } catch { /* 隐私模式：下次可能重复，无妨 */ }
}

export class BootPaper {
  /** @param {{ img: HTMLImageElement, sub?: HTMLElement, name?: HTMLElement, note?: HTMLElement }} els */
  constructor(els) {
    this.img = els.img;
    this.subEl = els.sub ?? null;
    this.nameEl = els.name ?? null;
    this.noteEl = els.note ?? null;
    this.current = null;
    this.shown = false;
    this.token = 0;
  }

  /** 露面：换一张、写字、淡入。已经亮着就不再换（同一次加载里纸不许来回变）。 */
  Show() {
    if (this.shown) return;
    this.shown = true;
    const paper = PickBootPaper(ReadLast());
    this.current = paper;
    WriteLast(paper.id);
    this.WriteCard(PaperCard(paper));
    const token = ++this.token;
    const img = this.img;
    img.classList.remove("on");
    img.alt = T("boot.paper.alt", { name: T(Key(paper, "name")), date: T(Key(paper, "date")) });
    img.src = BootPaperUrl(paper);
    // decode 完再淡入：避免图一行行刷出来。decode 失败（图丢了）就保持隐藏，字照常。
    const reveal = () => { if (token === this.token && this.shown) img.classList.add("on"); };
    if (typeof img.decode === "function") img.decode().then(reveal, () => {});
    else img.addEventListener("load", reveal, { once: true });
  }

  Hide() {
    this.shown = false;
    this.token++;
    this.img.classList.remove("on");
  }

  WriteCard(card) {
    if (this.subEl) this.subEl.textContent = card.subtitle;
    if (this.nameEl) {
      const kicker = document.createElement("span");
      kicker.className = "kicker";
      kicker.textContent = card.kicker;
      const rule = document.createElement("i");
      const title = document.createElement("b");
      title.textContent = card.name;
      const date = document.createElement("span");
      date.className = "date";
      date.textContent = card.date;
      this.nameEl.replaceChildren(kicker, rule, title, date);
    }
    if (this.noteEl) this.noteEl.textContent = card.summary;
  }

  Dispose() { this.Hide(); }
}
