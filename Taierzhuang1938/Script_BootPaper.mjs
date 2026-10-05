// 《台儿庄：血战滕县》加载画面上的战前报纸剪报 —— **宿主**。清单在 Data_BootPapers.mjs。
//
// 版式参考 Notion「加载界面｜战前报纸剪报方案与史料库」：黑底上一张带撕边与折痕的老报纸，
// 左下角是「史料摘录 | 《报名》 日期」加一句简述。玩家在等的这段时间读到的是这一仗之前
// 的世道：卢沟桥、淞沪、南京、鲁南，一期一句。
//
// 原图先显示；对应 Normal / RoughnessMask 就绪后用 Worker 中的单 quad 叠上轻微纸面受光。
// 每次只下载抽中的一期；静止不重绘，隐藏即终止 Worker 释放 GL。失败保留原图与文字。
//
// 每次开机随机换一张，不与上一次重复（localStorage，读写都包 try：隐私模式会抛，抛了就当没有上一次）。
// **可以拖着倾斜**：按住鼠标 / 手指拖，纸在小范围里转（偏航 ±40°、俯仰 ±26°，不是翻面），松手缓缓回正。
// 转动写在外层 #bootPaperWrap 的 CSS 变量上，回正是 CSS 过渡（合成线程跑，主线程建关卡堵住时照样回得动）。
// 图没拉下来不影响文字：简述本身就是完整的一句话，图只是氛围。

import { ApplyTiltDrag, BOOT_PAPER_STORAGE_KEY, BOOT_PAPER_TILT, BootPaperUrl, PickBootPaper } from "./Data_BootPapers.mjs";
import { T } from "./Script_Text.mjs";
import { BootPaperSurface } from "./Script_BootPaperSurface.mjs";

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
    this.wrap = els.wrap ?? els.img.closest("#bootPaperWrap") ?? els.img.parentElement;
    this.tilt = { yaw: 0, pitch: 0 };
    this.pointerId = null;
    this.idleWaiters = new Set();
    this.lastX = 0;
    this.lastY = 0;
    if (this.wrap) this.BindDrag(this.wrap);
  }

  BindDrag(wrap) {
    this.dragEvents = new AbortController();
    const Listen = (target, type, handler) => target.addEventListener(type, handler, { signal: this.dragEvents.signal });
    wrap.style.setProperty("--bootPaperPerspective", `${BOOT_PAPER_TILT.perspectivePx}px`);
    wrap.style.setProperty("--bootPaperReturn", `${BOOT_PAPER_TILT.returnSeconds}s`);
    Listen(wrap, "pointerdown", (event) => {
      if (event.button !== 0 || this.pointerId !== null || !this.shown) return;
      this.pointerId = event.pointerId;
      this.lastX = event.clientX;
      this.lastY = event.clientY;
      wrap.classList.add("dragging");
      this.surface?.SetTilt(this.tilt);
      // 抓不到指针（指针已被别处接走 / 合成事件）不算错：少了捕获只是拖出纸外时收不到 move。
      try { wrap.setPointerCapture?.(event.pointerId); } catch { /* ignore */ }
    });
    Listen(wrap, "pointermove", (event) => {
      if (event.pointerId !== this.pointerId) return;
      this.tilt = ApplyTiltDrag(this.tilt, event.clientX - this.lastX, event.clientY - this.lastY);
      this.lastX = event.clientX;
      this.lastY = event.clientY;
      this.ApplyTilt();
    });
    const release = (event) => {
      if (event.pointerId !== this.pointerId) return;
      this.ReleaseDrag();
    };
    Listen(wrap, "pointerup", release);
    Listen(wrap, "pointercancel", release);
    Listen(wrap, "lostpointercapture", release);
    // Capture can fail on an interrupted gesture; a release outside the paper
    // must still unblock loading.
    this.onRelease = release;
    Listen(window, "pointerup", release);
    Listen(window, "pointercancel", release);
    this.onBlur = () => this.ReleaseDrag();
    this.onVisibility = () => { if (document.hidden) this.ReleaseDrag(); };
    Listen(window, "blur", this.onBlur);
    Listen(document, "visibilitychange", this.onVisibility);
  }

  /** Loading resumes on release, cancellation, loss of focus or Hide; never leave it held. */
  WaitForIdle() {
    if (this.pointerId === null || !this.shown) return Promise.resolve();
    return new Promise(resolve => this.idleWaiters.add(resolve));
  }

  ReleaseDrag() {
    const id = this.pointerId;
    this.pointerId = null;
    try { if (id !== null) this.wrap?.releasePointerCapture?.(id); } catch { /* ignore */ }
    this.wrap?.classList.remove("dragging");
    this.tilt = { yaw: 0, pitch: 0 };
    if (this.wrap) this.ApplyTilt(true);
    for (const resolve of this.idleWaiters) resolve();
    this.idleWaiters.clear();
  }

  ApplyTilt(returning = false) {
    this.wrap.style.setProperty("--bootPaperYaw", `${this.tilt.yaw.toFixed(2)}deg`);
    this.wrap.style.setProperty("--bootPaperPitch", `${this.tilt.pitch.toFixed(2)}deg`);
    this.surface?.SetTilt(this.tilt, returning);
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
    const reveal = () => {
      if (token !== this.token || !this.shown) return;
      img.classList.add("on");
      this.surface?.Dispose();
      this.surface = new BootPaperSurface(img, paper, this.tilt);
    };
    if (typeof img.decode === "function") img.decode().then(reveal, () => {});
    else img.addEventListener("load", reveal, { once: true });
  }

  Hide() {
    this.shown = false;
    this.surface?.Dispose();
    this.surface = null;
    this.ReleaseDrag();
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

  Dispose() {
    this.Hide();
    this.dragEvents?.abort();
    window.removeEventListener("blur", this.onBlur);
    window.removeEventListener("pointerup", this.onRelease);
    window.removeEventListener("pointercancel", this.onRelease);
    document.removeEventListener("visibilitychange", this.onVisibility);
  }
}
