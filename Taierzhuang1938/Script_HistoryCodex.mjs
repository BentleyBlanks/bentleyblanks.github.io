import { T, Localize } from "./Script_Text.mjs";
import { HISTORY_CODEX_ENTRIES, HISTORY_CODEX_CATEGORIES, HISTORY_CODEX_TUNING } from "./Data_HistoryCodex.mjs";
import { HistoryBook } from "./Script_HistoryBook.mjs";

const Escape = value => String(value ?? "").replace(/[&<>"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
const Clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const Content = (entry, key) => Localize(`historyCodex.${entry.id}.${key}`, String(key.split(".").reduce((value, field) => value?.[field], entry) ?? ""));
const Copy = (entry, key) => Escape(Content(entry, key));
const Category = id => T(`menu.codex.category.${id}`);

/** A DOM archive shared by the standalone title screen and the in-game pause menu. */
export class HistoryCodex {
  constructor({ onExit, restorationHtml }) {
    this.onExit = onExit;
    this.restorationHtml = restorationHtml;
    this.root = document.createElement("section");
    this.root.className = "hcRoot";
    this.root.addEventListener("click", event => this.Click(event));
    this.filter = "all";
    this.entryId = null;
    this.page = 0;
    this.stage = 2;
    this.scrollTop = 0;
    this.root.addEventListener("focusin", event => {
      const card = event.target.closest?.(".hcCard");
      if (card) {
        this.root.querySelectorAll(".hcCard").forEach(node => node.classList.toggle("selected", node === card));
        this.selectedId = card.dataset.hcId;
      }
    });
  }

  get Entry() { return HISTORY_CODEX_ENTRIES.find(entry => entry.id === this.entryId); }
  get Entries() { return HISTORY_CODEX_ENTRIES.filter(entry => this.filter === "all" || entry.category === this.filter); }
  Open() { this.filter = "all"; this.entryId = null; this.restoration = false; this.scrollTop = 0; this.Render('[data-hc-action="open"]'); }
  Hide() { this.DestroyReader(); this.CloseSources(); this.root.replaceChildren(); }
  DestroyReader() { this.book?.Destroy(); this.book = null; this.resizeObserver?.disconnect(); this.resizeObserver = null; this.reader = null; this.drag = null; }

  Image(entry, className = "") {
    return `<img class="${className}" src="${Escape(entry.image)}" alt="${Copy(entry, "imageAlt")}" loading="lazy" decoding="async">`;
  }

  Map(entry, small = false) {
    const labels = entry.mapLabels.map((_, i) => `<g><circle cx="183" cy="${47 + i * 77}" r="${i === 1 ? 9 : 6}" fill="${i === 1 ? "#e1c17e" : "#3d3c30"}" stroke="#e3d6b3" stroke-width="2"/><text x="207" y="${54 + i * 77}" fill="#eee9d9" font-size="20">${Copy(entry, `mapLabels.${i}`)}</text></g>`).join("");
    return `<svg class="hcMap${small ? " small" : ""}" viewBox="0 0 390 330" role="img" aria-label="${Copy(entry, "imageAlt")}" xmlns="http://www.w3.org/2000/svg">
      <rect width="390" height="330" fill="#534b37"/><g fill="none" stroke="#b4a281" stroke-width="1" opacity=".3">
      <path d="M-20 35Q70 90 127 31T310 40T450 80M-20 48Q70 105 130 44T320 52T450 92M-20 60Q70 117 134 55T330 68T460 109M-15 207Q45 155 98 196T241 215T420 182M-15 221Q45 169 98 210T241 229T420 195M-15 235Q45 183 98 224T241 243T420 209M9 291Q91 250 143 280T308 290T430 267"/></g>
      <path d="M370 12Q296 63 338 120T270 198T340 330M0 118Q74 89 103 139T169 177" fill="none" stroke="#718587" stroke-width="6" opacity=".7"/>
      <path d="M178 8V319M188 8V319" fill="none" stroke="#191d18" stroke-width="3"/>
      <path d="M171 8V319" fill="none" stroke="#d5c6a7" stroke-width="29" stroke-dasharray="2 8" opacity=".7"/>
      <path d="M178 8V319M188 8V319" fill="none" stroke="#191d18" stroke-width="2"/>${labels}
      <path d="M60 35L65 57L60 53L55 57Z" fill="#eee9d9"/><text x="30" y="310" fill="#dbcfb7" font-size="13">${Escape(T("menu.codex.map"))}</text>
    </svg>`;
  }

  Card(entry, index) {
    const art = entry.image ? this.Image(entry) : this.Map(entry, true);
    return `<button type="button" class="hcCard${index === 0 ? " selected" : ""}" data-hc-action="open" data-hc-id="${entry.id}" aria-label="${Escape(T("menu.codex.openEntry", {title: Content(entry, "title")}))}">
      <span class="hcCardArt">${art}</span><span class="hcCardCopy"><span class="hcKicker">${Escape(Category(entry.category))}</span>
      <span class="hcCardTitle">${Copy(entry, "title")}</span><span class="hcCardDate">${Copy(entry, "subtitle")}</span>
      <span class="hcCardSummary">${Copy(entry, "summary")}</span><span class="hcCardCaption">${Copy(entry, "caption")}</span></span></button>`;
  }

  Sections(entry) {
    return (entry.sections || []).map((_, i) => `<section class="hcSection"><h3>${Copy(entry, `sections.${i}.title`)}</h3><p>${Copy(entry, `sections.${i}.text`)}</p></section>`).join("");
  }

  Related(entry) {
    if (!entry.related?.length) return "";
    return `<div class="hcRelated"><h3>${Escape(T("menu.codex.related"))}</h3>${entry.related.map(id => {
      const target = HISTORY_CODEX_ENTRIES.find(item => item.id === id);
      return `<button data-hc-action="related" data-hc-id="${id}">${Copy(target, "title")} <span aria-hidden="true">›</span></button>`;
    }).join("")}</div>`;
  }

  Timeline(entry, interactive = false) {
    return `<div class="hcTimeline${interactive ? " interactive" : ""}">${entry.timeline.map((_, i) => {
      const inner = `<i aria-hidden="true"></i><span>${Copy(entry, `timeline.${i}.date`)}</span><small>${Copy(entry, `timeline.${i}.title`)}</small>`;
      return interactive ? `<button data-hc-action="stage" data-hc-index="${i}" class="${i === this.stage ? "selected" : ""}" aria-pressed="${i === this.stage}">${inner}</button>` : `<div>${inner}</div>`;
    }).join("")}</div>`;
  }

  Reader(entry) {
    const image = entry.pages?.[this.page] || entry.image;
    return `<div class="hcReader"><div class="hcViewport" data-hc-viewport tabindex="0" role="region" aria-label="${Escape(T("menu.codex.imageViewer"))}">
      <img class="hcScan" src="${Escape(image)}" alt="${Copy(entry, "imageAlt")}" draggable="false" decoding="async"><p class="hcImageError" hidden>${Escape(T("menu.codex.imageError"))}</p></div>
      <div class="hcReaderTools"><button data-hc-action="zoomOut" aria-label="${Escape(T("menu.codex.zoomOut"))}">−</button><output class="hcZoom" aria-live="polite">100%</output>
      <button data-hc-action="zoomIn" aria-label="${Escape(T("menu.codex.zoomIn"))}">+</button><button data-hc-action="fit">${Escape(T("menu.codex.fit"))}</button>
      <button data-hc-action="expand">${Escape(T("menu.codex.expand"))}</button>
      ${entry.pages ? `<span class="hcPaging"><button data-hc-action="previous" ${this.page === 0 ? "disabled" : ""} aria-label="${Escape(T("menu.codex.previousPage"))}">‹</button><output>${String(this.page + 1).padStart(2, "0")} / ${entry.pages.length}</output><button data-hc-action="next" ${this.page === entry.pages.length - 1 ? "disabled" : ""} aria-label="${Escape(T("menu.codex.nextPage"))}">›</button></span>` : ""}</div>
      <small class="hcReaderHint">${Escape(entry.pages ? T("menu.codex.printedPage", {page: entry.firstPrintedPage + this.page}) : T("menu.codex.zoomHint"))}</small></div>`;
  }

  Book(entry) {
    return `<div class="hcReader hcBookReader"><div class="hcBookViewport" data-hc-viewport tabindex="0" role="region" aria-label="${Escape(T("menu.codex.bookViewer"))}">
      <div class="hcBookBoard" aria-hidden="true"></div><div class="hcBookHost"></div>
      <p class="hcBookFailure" hidden>${Escape(T("menu.codex.imageError"))}</p></div>
      <div class="hcBookFoot"><button class="hcBookKey" data-hc-action="previous" aria-label="${Escape(T("menu.codex.previousPage"))}">‹</button>
      <span class="hcBookGesture">${Escape(T(entry.pages.length > 1 ? "menu.codex.bookHint" : "menu.codex.bookSingleHint"))}</span><output class="hcBookFolio" aria-live="polite"></output>
      <button class="hcBookKey" data-hc-action="next" aria-label="${Escape(T("menu.codex.nextPage"))}">›</button></div>
      <dialog class="hcBookLens" aria-label="${Escape(T("menu.codex.imageViewer"))}"><button class="hcBookLensClose">${Escape(T("menu.codex.returnBook"))}</button>
      <div class="hcBookLensViewport"><img draggable="false" alt="${Copy(entry, "imageAlt")}"></div><small>${Escape(T("menu.codex.bookZoomHint"))}</small></dialog></div>`;
  }

  Detail(entry) {
    const title = `<h2>${Copy(entry, "title")}</h2><p class="hcSubtitle">${Copy(entry, "subtitle")}</p>`;
    let content;
    if (entry.category === "people") {
      content = `<figure class="hcPortrait">${this.Image(entry)}<figcaption>${Copy(entry, "caption")}</figcaption></figure><article class="hcArticle"><div class="hcBiographyCopy">${title}<p class="hcRole">${Copy(entry, "role")}</p>${this.Sections(entry)}${this.Timeline(entry)}</div>${this.Related(entry)}</article>`;
    } else if (entry.category === "history") {
      content = `<div class="hcBattleVisual">${entry.image ? this.Image(entry, "hcContextScan") : this.Map(entry)}<small>${Copy(entry, "caption")}</small>${this.Timeline(entry, true)}<div class="hcStage" aria-live="polite"><h3>${Copy(entry, `timeline.${this.stage}.date`)} ${Copy(entry, `timeline.${this.stage}.title`)}</h3><p>${Copy(entry, `timeline.${this.stage}.text`)}</p></div></div><article class="hcArticle">${title}${this.Sections(entry)}${this.Related(entry)}</article>`;
    } else if (entry.category === "documents") {
      content = `${this.Book(entry)}<article class="hcArticle">${title}<div class="hcReadTabs" role="tablist" aria-label="${Escape(T("menu.codex.documentTabs"))}">${["summary", "sourceInfo"].map(id => `<button role="tab" aria-selected="${this.readTab === id}" data-hc-action="readTab" data-hc-id="${id}" class="${this.readTab === id ? "selected" : ""}">${Escape(T(`menu.codex.${id}`))}</button>`).join("")}</div>
      ${this.readTab === "sourceInfo" ? `<div class="hcSourceInfo">${this.SourceList(entry)}</div>` : `${this.Sections(entry)}<nav class="hcContents" aria-label="${Escape(T("menu.codex.contents"))}">${entry.contents.map((item, i) => `<button data-hc-action="page" data-hc-index="${item.page}" class="${this.page === item.page ? "selected" : ""}">${Copy(entry, `contents.${i}.title`)}</button>`).join("")}</nav>`}<p class="hcSourceNote">${Copy(entry, "sourceNote")}</p></article>`;
    } else if (entry.category === "press") {
      content = `${this.Reader(entry)}<article class="hcArticle">${title}<h3 class="hcHeadline">${Copy(entry, "headline")}</h3><p class="hcSourceNote">${Copy(entry, "caption")}</p><section class="hcSection"><h3>${Escape(T("menu.codex.excerpt"))}</h3><blockquote>${Copy(entry, "excerpt")}</blockquote></section>${this.Sections(entry)}<p class="hcSourceNote">${Copy(entry, "sourceNote")}</p></article>`;
    } else {
      content = `${this.Reader(entry)}<article class="hcArticle">${title}<p class="hcDescription">${Copy(entry, "description")}</p><dl class="hcMetadata">${entry.metadata.map((_, i) => `<dt>${Copy(entry, `metadata.${i}.title`)}</dt><dd>${Copy(entry, `metadata.${i}.text`)}</dd>`).join("")}</dl><p class="hcSourceNote">${Copy(entry, "sourceNote")}</p>${this.Related(entry)}</article>`;
    }
    return `<section class="hcDetail"><div class="hcDetailHead"><button data-hc-action="back">‹ ${Escape(T("menu.codex.backList"))}</button><span>${Escape(Category(entry.category))} / ${Copy(entry, "title")}</span></div><div class="hcDetailBody hcKind-${entry.category}">${content}</div></section>`;
  }

  SourceList(entry) {
    return `<ul class="hcSourceList">${entry.sources.map((source, i) => `<li><a href="${Escape(source.url)}" target="_blank" rel="noopener noreferrer">${Copy(entry, `sources.${i}.title`)} <span aria-hidden="true">↗</span></a><p>${Copy(entry, `sources.${i}.note`)}</p></li>`).join("")}</ul>`;
  }

  Render(focus = null) {
    this.DestroyReader();
    const entry = this.Entry, activeCategory = entry?.category || this.filter;
    const nav = ["all", ...HISTORY_CODEX_CATEGORIES].map(id => `<button type="button" role="tab" aria-selected="${id === activeCategory}" data-hc-action="category" data-hc-id="${id}" class="${id === activeCategory ? "selected" : ""}">${Escape(Category(id))}</button>`).join("");
    const body = this.restoration ? `<section class="hcRestoration"><button data-hc-action="back">‹ ${Escape(T("menu.codex.backList"))}</button><h2>${Escape(T("menu.codex.restoration"))}</h2>${this.restorationHtml()}</section>`
      : entry ? this.Detail(entry) : `<div class="hcGrid${this.filter === "all" ? " all" : ""}">${this.Entries.map((item, i) => this.Card(item, i)).join("")}</div>`;
    this.root.innerHTML = `<header class="hcHeader"><p>${Escape(T("menu.codex.gameTitle"))}</p><h1>${Escape(T("menu.codex.title"))}</h1></header>
      <nav class="hcCategories" role="tablist" aria-label="${Escape(T("menu.codex.categories"))}">${nav}</nav>
      <div class="hcScroll">${body}</div><footer class="hcFooter"><button data-hc-action="back">Esc ${Escape(T(entry || this.restoration ? "menu.codex.backList" : "menu.back"))}</button>
      <span class="hcKeyHint">${entry ? "" : Escape(T("menu.codex.browseKeys"))}</span><span class="hcFooterEnd"><button data-hc-action="restoration">${Escape(T("menu.codex.restoration"))}</button>${entry ? `<button data-hc-action="sources">R ${Escape(T("menu.codex.sources"))}</button>` : ""}</span></footer>
      <dialog class="hcSources" aria-labelledby="HistorySourcesTitle"></dialog>`;
    this.root.querySelectorAll("img:not(.hcScan)").forEach(img => img.addEventListener("error", () => {
      img.classList.add("hcBroken"); img.alt = T("menu.codex.imageError");
    }));
    if (!entry && !this.restoration) this.root.querySelector(".hcScroll").scrollTop = this.scrollTop;
    if (entry?.category === "documents" && !this.restoration) this.book = new HistoryBook(this.root.querySelector(".hcBookReader"), {
      entry, page: this.page, title: Content(entry, "title"), subtitle: Content(entry, "subtitle"), caption: Content(entry, "caption"), imageAlt: Content(entry, "imageAlt"),
      onChange: (page, visible) => { this.page = page; this.root.querySelectorAll('[data-hc-action="page"]').forEach(button => button.classList.toggle("selected", visible.includes(Number(button.dataset.hcIndex)))); },
    });
    else if (entry && ["press", "photos"].includes(entry.category) && !this.restoration) this.BindReader();
    const dialog = this.root.querySelector(".hcSources");
    dialog.addEventListener("cancel", event => {event.preventDefault(); this.CloseSources();});
    dialog.addEventListener("click", event => {if (event.target === dialog) this.CloseSources();});
    if (focus) (this.root.querySelector(focus) || this.root.querySelector('[data-hc-action="open"]'))?.focus({preventScroll: true});
    this.root.querySelector('.hcCategories [aria-selected="true"]')?.scrollIntoView({block: "nearest", inline: "nearest"});
  }

  OpenEntry(id) {
    if (!HISTORY_CODEX_ENTRIES.some(entry => entry.id === id)) return;
    if (!this.entryId) this.scrollTop = this.root.querySelector(".hcScroll")?.scrollTop || 0;
    this.entryId = id; this.page = 0; this.stage = 2; this.readTab = "summary"; this.restoration = false;
    this.Render('[data-hc-action="back"]');
  }

  Back() {
    if (this.root.querySelector(".hcSources")?.open) {this.CloseSources(); return;}
    if (this.book?.CloseLens()) return;
    if (this.reader?.panel.classList.contains("expanded")) {this.ToggleExpanded(); return;}
    if (this.restoration) {this.restoration = false; this.Render('[data-hc-action="restoration"]'); return;}
    if (this.entryId) {
      const id = this.entryId; this.entryId = null;
      this.Render(`[data-hc-action="open"][data-hc-id="${id}"]`); return;
    }
    this.onExit();
  }

  ShowSources() {
    const entry = this.Entry; if (!entry) return;
    const dialog = this.root.querySelector(".hcSources"); if (dialog.open) return;
    this.sourceFocus = document.activeElement;
    dialog.innerHTML = `<div class="hcSourcesInner"><div class="hcSourcesHead"><h2 id="HistorySourcesTitle">${Escape(T("menu.codex.sources"))} · ${Copy(entry, "title")}</h2><button data-hc-action="closeSources" aria-label="${Escape(T("menu.codex.close"))}">×</button></div>${this.SourceList(entry)}<button data-hc-action="closeSources">${Escape(T("menu.codex.close"))}</button></div>`;
    dialog.showModal(); dialog.querySelector("button").focus();
  }
  CloseSources() { const dialog = this.root.querySelector(".hcSources"); if (dialog?.open) {dialog.close(); this.sourceFocus?.focus({preventScroll: true});} }

  ChangePage(page) {
    if (!this.Entry?.pages) return;
    if (this.book) { this.book.GoTo(page); return; }
    this.page = Clamp(page, 0, this.Entry.pages.length - 1);
    this.Render('[data-hc-viewport]');
  }

  Click(event) {
    const button = event.target.closest?.("[data-hc-action]"); if (!button || button.disabled) return;
    const action = button.dataset.hcAction;
    if (action === "category") {this.filter = button.dataset.hcId; this.entryId = null; this.restoration = false; this.scrollTop = 0; this.Render(`[data-hc-action="category"][data-hc-id="${this.filter}"]`);}
    else if (action === "open" || action === "related") this.OpenEntry(button.dataset.hcId);
    else if (action === "back") this.Back();
    else if (action === "sources") this.ShowSources();
    else if (action === "closeSources") this.CloseSources();
    else if (action === "restoration") {this.restoration = true; this.Render('[data-hc-action="back"]');}
    else if (action === "stage") {this.stage = Number(button.dataset.hcIndex); this.Render(`[data-hc-action="stage"][data-hc-index="${this.stage}"]`);}
    else if (action === "readTab") {this.readTab = button.dataset.hcId; this.Render(`[data-hc-action="readTab"][data-hc-id="${this.readTab}"]`);}
    else if (action === "page") this.ChangePage(Number(button.dataset.hcIndex));
    else if (action === "previous" || action === "next") { if (this.book) this.book.Turn(action === "next" ? 1 : -1); else this.ChangePage(this.page + (action === "next" ? 1 : -1)); }
    else if (action === "zoomIn" || action === "zoomOut") this.Zoom((this.reader?.scale || 1) + (action === "zoomIn" ? 1 : -1) * HISTORY_CODEX_TUNING.zoomStep);
    else if (action === "fit") {if (this.reader) {this.reader.x = this.reader.y = 0; this.Zoom(1);}}
    else if (action === "expand") this.ToggleExpanded();
  }

  BindReader() {
    const panel = this.root.querySelector(".hcReader"), viewport = panel.querySelector(".hcViewport"), image = panel.querySelector(".hcScan");
    const reader = this.reader = {panel, viewport, image, scale: 1, x: 0, y: 0, width: 0, height: 0};
    const Fit = () => {
      if (this.reader !== reader || !image.naturalWidth) return;
      const fit = Math.min(viewport.clientWidth / image.naturalWidth, viewport.clientHeight / image.naturalHeight);
      reader.width = image.naturalWidth * fit; reader.height = image.naturalHeight * fit;
      image.style.width = `${reader.width}px`; image.style.height = `${reader.height}px`; this.Transform();
    };
    image.addEventListener("load", Fit);
    image.addEventListener("error", () => {panel.querySelector(".hcImageError").hidden = false; image.hidden = true;});
    this.resizeObserver = new ResizeObserver(Fit); this.resizeObserver.observe(viewport); Fit();
    viewport.addEventListener("wheel", event => {event.preventDefault(); this.Zoom(reader.scale + (event.deltaY < 0 ? 1 : -1) * HISTORY_CODEX_TUNING.wheelStep);}, {passive: false});
    viewport.addEventListener("pointerdown", event => {
      if (reader.scale <= 1 || event.button !== 0) return;
      event.preventDefault(); viewport.setPointerCapture(event.pointerId);
      this.drag = {id: event.pointerId, x: event.clientX, y: event.clientY, baseX: reader.x, baseY: reader.y};
    });
    viewport.addEventListener("pointermove", event => {
      if (this.drag?.id !== event.pointerId) return;
      reader.x = this.drag.baseX + event.clientX - this.drag.x; reader.y = this.drag.baseY + event.clientY - this.drag.y; this.Transform();
    });
    const Release = () => {this.drag = null;};
    viewport.addEventListener("pointerup", Release); viewport.addEventListener("pointercancel", Release); viewport.addEventListener("lostpointercapture", Release);
  }

  Zoom(scale) {if (!this.reader) return; this.reader.scale = Clamp(scale, HISTORY_CODEX_TUNING.zoomMin, HISTORY_CODEX_TUNING.zoomMax); this.Transform();}
  Transform() {
    const r = this.reader; if (!r) return;
    const maxX = Math.max(0, (r.width * r.scale - r.viewport.clientWidth) / 2), maxY = Math.max(0, (r.height * r.scale - r.viewport.clientHeight) / 2);
    r.x = Clamp(r.x, -maxX, maxX); r.y = Clamp(r.y, -maxY, maxY);
    r.image.style.transform = `translate(${r.x}px, ${r.y}px) scale(${r.scale})`;
    r.viewport.style.touchAction = r.scale > 1 ? "none" : "pan-y";
    r.viewport.classList.toggle("zoomed", r.scale > 1);
    r.panel.querySelector(".hcZoom").textContent = `${Math.round(r.scale * 100)}%`;
    r.panel.querySelector('[data-hc-action="zoomOut"]').disabled = r.scale <= HISTORY_CODEX_TUNING.zoomMin;
    r.panel.querySelector('[data-hc-action="zoomIn"]').disabled = r.scale >= HISTORY_CODEX_TUNING.zoomMax;
  }
  ToggleExpanded() {
    if (this.book) { if (!this.book.CloseLens()) this.book.OpenLens(); return; }
    if (!this.reader) return;
    const expanded = this.reader.panel.classList.toggle("expanded");
    this.reader.panel.querySelector('[data-hc-action="expand"]').textContent = T(expanded ? "menu.codex.collapse" : "menu.codex.expand");
  }

  Key(event) {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.key === "Escape") {event.preventDefault(); event.stopPropagation(); if (!event.repeat) this.Back(); return;}
    if (this.root.querySelector(".hcSources")?.open) return;
    if (this.book?.lens.open) return;
    if (event.code === "KeyR" && this.Entry && !event.repeat) {event.preventDefault(); this.ShowSources(); return;}
    if (event.code === "KeyF" && (this.reader || this.book) && !event.repeat) {event.preventDefault(); this.ToggleExpanded(); return;}
    if (this.book && ["PageDown", "PageUp", "ArrowRight", "ArrowLeft"].includes(event.key) && !event.target.closest?.('[data-hc-action="category"]')) {
      event.preventDefault(); if (!event.repeat) this.book.Turn(["PageDown", "ArrowRight"].includes(event.key) ? 1 : -1); return;
    }
    if (this.Entry?.pages && ["PageDown", "PageUp"].includes(event.key)) {event.preventDefault(); this.ChangePage(this.page + (event.key === "PageDown" ? 1 : -1)); return;}
    const nav = event.target.closest?.('[data-hc-action="category"]');
    if (nav && ["ArrowLeft", "ArrowRight"].includes(event.key)) {
      const tabs = [...this.root.querySelectorAll('[data-hc-action="category"]')], index = tabs.indexOf(nav);
      event.preventDefault(); tabs[(index + (event.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length].click(); return;
    }
    if (!this.Entry && !this.restoration && ["ArrowDown", "ArrowUp"].includes(event.key)) {
      const cards = [...this.root.querySelectorAll(".hcCard")], current = cards.indexOf(document.activeElement);
      const next = current < 0 ? 0 : (current + (event.key === "ArrowDown" ? 1 : cards.length - 1)) % cards.length;
      event.preventDefault(); cards[next]?.focus({preventScroll: true}); cards[next]?.scrollIntoView({block: "nearest"});
    }
  }
}
