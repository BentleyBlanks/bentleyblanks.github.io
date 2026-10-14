// Soft-paper reader for archival scans. StPageFlip is loaded only for a document.
// A clearly modern flyleaf keeps odd printed pages on the right; no source page is
// synthesized. Only the current spread and its immediate reverse sheets get URLs.
// The pinned renderer's stop() extension is essential: closing a book must release RAF.
import { T } from "./Script_Text.mjs";
import { HISTORY_BOOK_TUNING as Tune } from "./Data_HistoryCodex.mjs";

const Clamp = (n, min, max) => Math.max(min, Math.min(max, n));
let library;
const LoadLibrary = () => library ||= import("./vendor/page-flip/page-flip.module.js");

export class HistoryBook {
  constructor(panel, { entry, page, title, subtitle, caption, imageAlt, onChange }) {
    Object.assign(this, { panel, entry, page, title, subtitle, caption, imageAlt, onChange });
    this.viewport = panel.querySelector(".hcBookViewport");
    this.host = panel.querySelector(".hcBookHost");
    this.lens = panel.querySelector(".hcBookLens");
    this.abort = new AbortController();
    this.dead = false;
    this.scale = 1; this.x = 0; this.y = 0;
    this.reduced = matchMedia("(prefers-reduced-motion: reduce)");
    this.ready = this.Start().catch(error => {
      if (!this.dead) { this.panel.querySelector(".hcBookFailure").hidden = false; console.error("History book failed", error); }
    });
  }

  async Start() {
    const { PageFlip } = await LoadLibrary();
    if (this.dead) return;
    const flyleaf = document.createElement("div");
    flyleaf.className = "hcBookPage hcBookFlyleaf";
    const imprint = document.createElement("div"); imprint.className = "hcBookFlyleafContent"; flyleaf.append(imprint);
    for (const [tag, text] of [["small", T("menu.codex.bookFacsimile")], ["h3", this.title], ["p", this.subtitle], ["small", this.caption]]) {
      const node = document.createElement(tag); node.textContent = text; imprint.append(node);
    }
    this.host.append(flyleaf);
    this.entry.pages.forEach((url, index) => {
      const leaf = document.createElement("div"), img = document.createElement("img"), error = document.createElement("p");
      leaf.className = "hcBookPage"; leaf.dataset.sourcePage = index;
      img.alt = this.imageAlt; img.draggable = false; img.decoding = "async"; img.dataset.sourcePage = index;
      error.className = "hcBookPageError"; error.textContent = T("menu.codex.imageError"); error.hidden = true;
      leaf.append(img, error); this.host.append(leaf);
    });
    this.flip = new PageFlip(this.host, {
      width: Tune.pageWidth, height: Tune.pageHeight, size: "stretch",
      minWidth: Tune.minPageWidth, maxWidth: Tune.maxPageWidth, minHeight: 100, maxHeight: 2000,
      autoSize: false, showCover: false, drawShadow: true, maxShadowOpacity: Tune.shadowOpacity,
      flippingTime: Tune.turnMs, usePortrait: true, useMouseEvents: false, showPageCorners: !this.reduced.matches,
      disableFlipByClick: false, startPage: this.page + 1,
    });
    this.flip.on("flip", () => this.Sync());
    this.flip.on("changeState", event => {
      if (this.dead) return;
      this.panel.dataset.bookState = event.data;
      this.Warm();
      this.flip.getRender().request();
    });
    this.flip.on("changeOrientation", () => this.Sync());
    this.flip.loadFromHTML(this.host.querySelectorAll(".hcBookPage"));
    this.Bind();
    this.observer = new ResizeObserver(() => {
      if (this.dead) return;
      this.CancelDrag(); this.flip.update(); this.Sync(); this.FitLens();
    });
    this.observer.observe(this.viewport);
    this.Sync();
  }

  get VisiblePages() {
    if (!this.flip) return [this.page];
    const first = this.flip.getCurrentPageIndex(), count = this.flip.getOrientation() === "landscape" ? 2 : 1;
    return Array.from({ length: count }, (_, i) => first + i - 1).filter(i => i >= 0 && i < this.entry.pages.length);
  }
  CanTurn(direction) {
    if (!this.flip || this.lens.open || this.entry.pages.length < 2) return false;
    const index = this.flip.getCurrentPageIndex(), portrait = this.flip.getOrientation() === "portrait";
    return direction < 0 ? index > (portrait ? 1 : 0) : index + (portrait ? 1 : 2) < this.entry.pages.length + 1;
  }
  Warm(target = this.flip?.getCurrentPageIndex() ?? this.page + 1) {
    for (const img of this.host.querySelectorAll("img[data-source-page]")) {
      const index = Number(img.dataset.sourcePage);
      if (img.hasAttribute("src") || Math.abs(index + 1 - target) > Tune.warmRadius) continue;
      img.addEventListener("error", () => { img.hidden = true; img.nextElementSibling.hidden = false; }, { once: true });
      img.src = this.entry.pages[index];
    }
  }
  Sync() {
    if (this.dead || !this.flip?.getPageCount()) return;
    const pages = this.VisiblePages;
    this.page = pages[0] ?? 0;
    this.Warm(); this.onChange(this.page, pages);
    this.panel.dataset.bookReady = "true";
    this.panel.dataset.bookState = this.flip.getState();
    this.panel.dataset.bookOrientation = this.flip.getOrientation();
    this.flip.getRender().request();
    const printed = pages.map(index => this.entry.firstPrintedPage === undefined ? index + 1 : this.entry.firstPrintedPage + index);
    const label = printed.length > 1 ? `${printed[0]}–${printed.at(-1)}` : String(printed[0] ?? "");
    this.panel.querySelector(".hcBookFolio").textContent = pages.length
      ? T(this.entry.firstPrintedPage === undefined ? "menu.codex.scanPage" : "menu.codex.printedPage", { page: label })
      : T("menu.codex.bookFacsimile");
    this.panel.querySelector('[data-hc-action="previous"]').disabled = !this.CanTurn(-1);
    this.panel.querySelector('[data-hc-action="next"]').disabled = !this.CanTurn(1);
    const rect = this.flip.getBoundsRect(), portrait = this.flip.getOrientation() === "portrait";
    const board = this.panel.querySelector(".hcBookBoard");
    Object.assign(board.style, { left: `${rect.left + (portrait ? rect.pageWidth : 0)}px`, top: `${rect.top}px`,
      width: `${rect.pageWidth * (portrait ? 1 : 2)}px`, height: `${rect.height}px` });
  }
  Position(event) {
    const box = this.flip.getUI().getDistElement().getBoundingClientRect();
    return { x: event.clientX - box.left, y: event.clientY - box.top };
  }
  Direction(pos) {
    const rect = this.flip.getBoundsRect();
    return pos.x < rect.left + rect.pageWidth + (this.flip.getOrientation() === "portrait" ? rect.width / 5 : 0) ? -1 : 1;
  }
  InPaper(pos) {
    const r = this.flip.getBoundsRect(), left = r.left + (this.flip.getOrientation() === "portrait" ? r.pageWidth : 0);
    return pos.x >= left && pos.x <= r.left + r.width && pos.y >= r.top && pos.y <= r.top + r.height;
  }
  InCorner(pos, direction) {
    const r = this.flip.getBoundsRect(), portrait = this.flip.getOrientation() === "portrait";
    const edge = direction > 0 ? r.left + r.width : r.left + (portrait ? r.pageWidth : 0);
    const distance = Math.min(r.pageWidth, r.height) * Tune.cornerFraction;
    return Math.abs(pos.x - edge) < distance && (pos.y - r.top < distance || r.top + r.height - pos.y < distance);
  }
  Bind() {
    const signal = this.abort.signal;
    this.viewport.addEventListener("pointerdown", event => {
      if (event.button !== 0 || !event.isPrimary || this.lens.open || this.Settling) return;
      const pos = this.Position(event);
      if (!this.InPaper(pos) || !this.CanTurn(this.Direction(pos))) return;
      this.drag = { id: event.pointerId, start: pos, last: pos, moved: false, direction: this.Direction(pos) };
      this.viewport.setPointerCapture(event.pointerId); this.flip.startUserTouch(pos);
      this.viewport.focus({ preventScroll: true });
    }, { signal });
    this.viewport.addEventListener("pointermove", event => {
      const pos = this.Position(event);
      if (this.drag?.id === event.pointerId) {
        this.drag.moved ||= Math.hypot(pos.x - this.drag.start.x, pos.y - this.drag.start.y) > Tune.dragThreshold;
        this.drag.last = pos; this.flip.userMove(pos, true);
      } else if (!this.drag && event.pointerType === "mouse" && this.flip.getState() !== "flipping") {
        this.flip.userMove(this.InPaper(pos) && this.CanTurn(this.Direction(pos)) ? pos : { x: -1000, y: -1000 }, false);
      }
    }, { signal });
    this.viewport.addEventListener("pointerup", event => {
      if (this.drag?.id !== event.pointerId) return;
      const drag = this.drag; this.drag = null;
      const pos = this.Position(event);
      // Handle taps ourselves: the library's two-page corner test does not include
      // the visible left corner in portrait. Center double-clicks remain magnifiers.
      if (!drag.moved) {
        this.flip.userStop(pos, true);
        if (this.InCorner(pos, drag.direction)) this.Turn(drag.direction);
        if (this.viewport.hasPointerCapture(event.pointerId)) this.viewport.releasePointerCapture(event.pointerId);
        return;
      }
      const swipe = event.pointerType === "touch" && drag.moved && this.flip.getOrientation() === "portrait"
        && (drag.start.x - pos.x) * drag.direction > this.flip.getBoundsRect().pageWidth * Tune.swipeCommitFraction;
      this.flip.userStop(pos, swipe);
      if (swipe) this.flip.getFlipController().stopMove(true);
      if (this.reduced.matches) this.flip.getRender().finishAnimation();
      if (this.viewport.hasPointerCapture(event.pointerId)) this.viewport.releasePointerCapture(event.pointerId);
    }, { signal });
    for (const name of ["pointercancel", "lostpointercapture"]) this.viewport.addEventListener(name, () => this.CancelDrag(), { signal });
    this.viewport.addEventListener("pointerleave", () => {
      if (!this.drag && this.flip.getState() !== "flipping") this.flip.userMove({ x: -1000, y: -1000 }, false);
    }, { signal });
    this.viewport.addEventListener("dblclick", event => {
      const pos = this.Position(event);
      if (!this.InPaper(pos)) return;
      const r = this.flip.getBoundsRect(), current = this.flip.getCurrentPageIndex();
      const index = current - 1 + (this.flip.getOrientation() === "landscape" && pos.x >= r.left + r.pageWidth ? 1 : 0);
      if (index >= 0 && index < this.entry.pages.length) { event.preventDefault(); this.OpenLens(index); }
    }, { signal });
    this.lens.addEventListener("cancel", event => { event.preventDefault(); this.CloseLens(); }, { signal });
    this.lens.querySelector(".hcBookLensClose").addEventListener("click", () => this.CloseLens(), { signal });
    const stage = this.lens.querySelector(".hcBookLensViewport");
    stage.addEventListener("wheel", event => {
      event.preventDefault(); this.scale = Clamp(this.scale + (event.deltaY < 0 ? Tune.zoomStep : -Tune.zoomStep), 1, Tune.zoomMax); this.TransformLens();
    }, { passive: false, signal });
    stage.addEventListener("dblclick", () => { this.scale = this.scale > 1 ? 1 : Tune.doubleZoom; this.TransformLens(); }, { signal });
    stage.addEventListener("pointerdown", event => {
      if (event.button !== 0 || this.scale <= 1) return;
      this.pan = { id: event.pointerId, x: event.clientX, y: event.clientY, baseX: this.x, baseY: this.y };
      stage.setPointerCapture(event.pointerId); event.preventDefault();
    }, { signal });
    stage.addEventListener("pointermove", event => {
      if (this.pan?.id !== event.pointerId) return;
      this.x = this.pan.baseX + event.clientX - this.pan.x; this.y = this.pan.baseY + event.clientY - this.pan.y; this.TransformLens();
    }, { signal });
    for (const name of ["pointerup", "pointercancel", "lostpointercapture"]) stage.addEventListener(name, () => { this.pan = null; }, { signal });
  }
  CancelDrag() {
    if (!this.drag || !this.flip) return;
    const drag = this.drag; this.drag = null;
    if (drag.moved) this.flip.userMove(drag.start, true);
    this.flip.userStop(drag.start, !drag.moved);
    if (this.reduced.matches) this.flip.getRender().finishAnimation();
  }
  get Settling() { return this.flip && (this.flip.getState() === "flipping" || (this.flip.getRender().animation && this.flip.getState() !== "fold_corner")); }
  Turn(direction) {
    if (!this.CanTurn(direction) || this.Settling) return;
    this.CancelDrag();
    if (this.reduced.matches) direction > 0 ? this.flip.turnToNextPage() : this.flip.turnToPrevPage();
    else {
      // Upstream flipPrev assumes x=10 and both helpers omit the vertical offset.
      // A fitted, centered book needs its actual paper corner in wrapper coordinates.
      const r = this.flip.getBoundsRect(), portrait = this.flip.getOrientation() === "portrait";
      this.flip.getFlipController().flip({ x: direction > 0 ? r.left + r.width - 8 : r.left + (portrait ? r.pageWidth : 0) + 8, y: r.top + r.height - 8 });
    }
    this.Warm(this.flip.getCurrentPageIndex() + direction * 2);
  }
  GoTo(page) {
    this.CancelDrag();
    this.page = Clamp(page, 0, this.entry.pages.length - 1);
    if (!this.flip) return;
    this.flip.getRender().finishAnimation(); this.Warm(this.page + 1);
    this.flip.turnToPage(this.page + 1); this.Sync();
  }
  OpenLens(page = this.VisiblePages[0] ?? 0) {
    this.CancelDrag(); this.flip?.getRender().finishAnimation();
    this.lensPage = page; this.scale = 1; this.x = this.y = 0;
    const img = this.lens.querySelector("img");
    img.alt = this.imageAlt; img.onload = () => this.FitLens(); img.src = this.entry.pages[page];
    if (!this.lens.open) this.lens.showModal();
    this.FitLens(); this.lens.querySelector("button").focus();
  }
  CloseLens() {
    if (!this.lens.open) return false;
    this.lens.close(); this.pan = null; this.viewport.focus({ preventScroll: true }); return true;
  }
  FitLens() {
    if (!this.lens.open) return;
    const img = this.lens.querySelector("img"), stage = img.parentElement;
    if (!img.naturalWidth) return;
    const ratio = Math.min(stage.clientWidth / img.naturalWidth, stage.clientHeight / img.naturalHeight);
    this.width = img.naturalWidth * ratio; this.height = img.naturalHeight * ratio;
    img.style.width = `${this.width}px`; img.style.height = `${this.height}px`; this.TransformLens();
  }
  TransformLens() {
    const img = this.lens.querySelector("img"), stage = img.parentElement;
    const maxX = Math.max(0, (this.width * this.scale - stage.clientWidth) / 2), maxY = Math.max(0, (this.height * this.scale - stage.clientHeight) / 2);
    this.x = Clamp(this.x, -maxX, maxX); this.y = Clamp(this.y, -maxY, maxY);
    img.style.transform = `translate(${this.x}px,${this.y}px) scale(${this.scale})`;
    stage.classList.toggle("zoomed", this.scale > 1);
  }
  Destroy() {
    this.dead = true; this.abort.abort(); this.observer?.disconnect();
    if (this.lens.open) this.lens.close();
    this.flip?.getRender().stop(); this.flip?.destroy(); this.flip = null;
  }
}
