// STUB：集成时由 C 包替换
//
// 白盒关卡编辑器的界面（docs/Data_EditorBlockout.md §4）的最小占位实现：接口与 §4 逐字相同，
// 样子从简（行内样式）。总控只认这些方法；C 包的正式版本合入时整个文件替换。
//
// 规矩照抄 §4：编辑器 DOM 上的 mousedown / wheel / keydown 一律 stopPropagation（否则会抢指针锁、
// 滚轮换枪）；指针锁定时界面可见但不可点（SetInteractive(false)）。

const STUB_STYLE_ID = "blockoutStubStyle";
// 编辑器模式隐藏的游戏 HUD（任务字、简报卡、字幕、旧小地图、人数池等）；保留准星、弹药、受伤反馈。
const STUB_CSS = `
body.blockoutMode .hudTop, body.blockoutMode .hudBrief, body.blockoutMode .hudSubtitle,
body.blockoutMode .hudMinimap, body.blockoutMode .hudForceStatus, body.blockoutMode .hudTitle,
body.blockoutMode .hudMissionGuide, body.blockoutMode .hudMarkers, body.blockoutMode .hudNote,
body.blockoutMode .hudObjective, body.blockoutMode .hudPhase { display: none !important; }
.bkPanel { position: fixed; background: rgba(13,16,17,.86); border: 1px solid rgba(196,198,187,.2); color: #d6d9d1;
  font: 13px/1.45 var(--ui-font, system-ui, sans-serif); pointer-events: auto; box-sizing: border-box; }
.bkPanel button { font: inherit; color: #d6d9d1; background: rgba(255,255,255,.04); border: 1px solid rgba(196,198,187,.25);
  padding: 2px 8px; cursor: pointer; }
.bkPanel button.on { border-color: #dfbd68; color: #f1dca0; }
.bkOff .bkPanel { pointer-events: none; }
`;

function El(tag, className = "", text = "") {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text) el.textContent = text;
  return el;
}

function Shield(el) {
  for (const type of ["mousedown", "wheel", "keydown", "keyup", "pointerdown", "contextmenu"]) {
    el.addEventListener(type, (event) => event.stopPropagation());
  }
}

export class BlockoutUi {
  constructor(root, handlers = {}) {
    this.handlers = handlers;
    if (!document.getElementById(STUB_STYLE_ID)) {
      const style = El("style");
      style.id = STUB_STYLE_ID;
      style.textContent = STUB_CSS;
      document.head.appendChild(style);
    }
    this.el = El("div", "blockoutUi");
    this.el.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:35;";
    root.appendChild(this.el);

    // 左上 · 关键帧卡片
    this.card = El("div", "bkPanel bkCard");
    this.card.style.cssText = "left:16px;top:40px;width:380px;padding:10px 12px;";
    this.cardTitle = El("div", "bkCardTitle");
    this.cardWhat = El("div", "bkCardWhat");
    this.cardNext = El("div", "bkCardNext");
    this.cardArrow = El("span", "bkArrow");
    this.cardArrow.style.cssText = "display:inline-block;width:0;height:0;margin:0 6px 0 2px;border-left:5px solid transparent;"
      + "border-right:5px solid transparent;border-bottom:10px solid #dfbd68;vertical-align:middle;";
    this.cardNextText = El("span");
    this.cardNext.append(El("span", "", "下一步 "), this.cardArrow, this.cardNextText);
    this.cardHow = El("div", "bkCardHow");
    this.cardHow.style.cssText = "color:#9aa097;font-size:12px;";
    this.saveButton = El("button", "bkSave", "记下当前机位");
    this.saveButton.type = "button";
    this.saveButton.style.cssText = "float:right;margin-left:8px;";
    this.saveButton.addEventListener("click", () => handlers.onSavePose?.());
    this.card.append(this.saveButton, this.cardTitle, this.cardWhat, this.cardNext, this.cardHow);
    Shield(this.card);
    this.el.appendChild(this.card);

    // 右上 · 关卡与图层
    this.top = El("div", "bkPanel bkTop");
    this.top.style.cssText = "right:64px;top:12px;padding:6px 8px;display:flex;gap:6px;align-items:center;";
    this.levelSelect = El("select", "bkLevel");
    this.levelSelect.addEventListener("change", () => handlers.onLevel?.(this.levelSelect.value));
    this.layerButtons = {};
    const layerLabels = { arcs: "射界", intents: "去向", labels: "标签", xray: "穿墙显示" };
    this.top.appendChild(this.levelSelect);
    for (const [name, label] of Object.entries(layerLabels)) {
      const button = El("button", "", label);
      button.type = "button";
      button.dataset.layer = name;
      button.addEventListener("click", () => {
        const current = this.layers?.[name];
        let next;
        if (name === "arcs") next = current === "default" ? "all" : current === "all" ? "off" : "default";
        else next = !current;
        handlers.onLayer?.(name, next);
      });
      this.layerButtons[name] = button;
      this.top.appendChild(button);
    }
    this.statusDot = El("i", "bkStatus");
    this.statusDot.style.cssText = "display:inline-block;width:10px;height:10px;border-radius:50%;background:#888;";
    this.top.appendChild(this.statusDot);
    Shield(this.top);
    this.el.appendChild(this.top);

    // 左下 · 小地图
    this.miniWrap = El("div", "bkPanel bkMini");
    this.miniWrap.style.cssText = "left:16px;bottom:16px;width:222px;height:222px;padding:0;";
    this.mini = El("canvas", "bkMiniCanvas");
    this.mini.style.cssText = "width:220px;height:220px;display:block;";
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.mini.width = Math.round(220 * dpr); this.mini.height = Math.round(220 * dpr);
    const miniHint = El("div", "", "M 展开");
    miniHint.style.cssText = "position:absolute;right:6px;bottom:4px;font-size:11px;color:#5c5a50;";
    this.miniWrap.append(this.mini, miniHint);
    this.miniWrap.addEventListener("click", () => handlers.onOpenMap?.());
    Shield(this.miniWrap);
    this.el.appendChild(this.miniWrap);

    // 底部 · 导航栏
    this.nav = El("div", "bkPanel bkNav");
    this.nav.style.cssText = "left:50%;bottom:14px;transform:translateX(-50%);width:min(1100px,62vw);padding:6px 10px;"
      + "display:flex;gap:10px;align-items:center;";
    this.prevButton = El("button", "bkPrev", "上一个");
    this.prevButton.type = "button";
    this.prevButton.addEventListener("click", () => handlers.onPrev?.());
    this.nextButton = El("button", "bkNext", "下一个");
    this.nextButton.type = "button";
    this.nextButton.addEventListener("click", () => handlers.onNext?.());
    this.track = El("div", "bkTrack");
    this.track.style.cssText = "flex:1;position:relative;height:22px;border-top:1px solid rgba(196,198,187,.3);";
    this.counter = El("div", "bkCounter");
    this.counter.style.cssText = "font-family:var(--ui-mono, monospace);min-width:72px;text-align:right;";
    const keys = El("div", "", ", . 切换　M 地图　Esc 鼠标");
    keys.style.cssText = "font-size:10px;color:#7c8079;white-space:nowrap;";
    this.nav.append(this.prevButton, this.track, this.nextButton, this.counter, keys);
    Shield(this.nav);
    this.el.appendChild(this.nav);

    // 全关总图
    this.full = El("div", "bkPanel bkFull");
    this.full.style.cssText = "left:4vw;top:6vh;width:92vw;height:88vh;display:none;padding:0;";
    this.fullCanvasEl = El("canvas", "bkFullCanvas");
    this.fullCanvasEl.style.cssText = "width:100%;height:100%;display:block;cursor:grab;";
    const close = El("button", "bkClose", "关闭");
    close.type = "button";
    close.style.cssText = "position:absolute;right:8px;top:8px;";
    close.addEventListener("click", () => handlers.onCloseMap?.());
    this.full.append(this.fullCanvasEl, close);
    Shield(this.full);
    this.el.appendChild(this.full);

    // 中上 · 提示条
    this.toast = El("div", "bkPanel bkToast");
    this.toast.style.cssText = "left:50%;top:14px;transform:translateX(-50%);padding:4px 14px;display:none;pointer-events:none;";
    this.el.appendChild(this.toast);

    this.keyframes = [];
    this.index = 0;
    this.layers = null;
  }

  SetLevels(levels, currentKey) {
    this.levelSelect.textContent = "";
    for (const level of levels) {
      const option = El("option", "", level.label);
      option.value = level.key;
      this.levelSelect.appendChild(option);
    }
    this.levelSelect.value = currentKey;
  }

  SetKeyframes(list, index) {
    this.keyframes = list || [];
    this.index = index;
    this.track.textContent = "";
    const n = this.keyframes.length;
    this.keyframes.forEach((kf, i) => {
      const tick = El("button", i === index ? "on" : "");
      tick.type = "button";
      tick.title = `${String(kf.stage).padStart(2, "0")} · ${kf.name}`;
      tick.dataset.index = String(i);
      tick.style.cssText = `position:absolute;top:2px;left:calc(${n > 1 ? (i / (n - 1)) * 100 : 50}% - 5px);width:10px;height:16px;padding:0;`
        + (i === index ? "background:#dfbd68;" : "");
      tick.addEventListener("click", () => this.handlers.onSeek?.(i));
      this.track.appendChild(tick);
    });
    const kf = this.keyframes[index];
    const inStage = kf ? this.keyframes.filter(k => k.stage === kf.stage) : [];
    this.counter.textContent = kf ? `${String(kf.stage).padStart(2, "0")} · ${inStage.indexOf(kf) + 1}/${inStage.length}` : "";
  }

  SetCard({ stage, stageTitle, name, what, next, how, notes, guessCount }) {
    this.cardTitle.textContent = `${String(stage ?? "").padStart(2, "0")} ${stageTitle || ""} · ${name || ""}`;
    this.cardWhat.textContent = what ? `此时　${what}` : "";
    if (next) {
      this.cardNext.style.display = "";
      const distance = Number.isFinite(next.distanceM) ? `　${Math.round(next.distanceM)} m` : "";
      this.cardNextText.textContent = `${next.text || ""}${distance}`;
      this.cardArrow.style.display = Number.isFinite(next.relYawDeg) ? "inline-block" : "none";
      if (Number.isFinite(next.relYawDeg)) this.cardArrow.style.transform = `rotate(${-next.relYawDeg}deg)`;
    } else this.cardNext.style.display = "none";
    const extra = [];
    if (how?.length) extra.push(how.join(" · "));
    if (notes) extra.push(notes);
    if (guessCount) extra.push(`${guessCount} 个位置是推测的`);
    this.cardHow.textContent = extra.join("　");
  }

  SetLayers(layers) {
    this.layers = { ...layers };
    for (const [name, button] of Object.entries(this.layerButtons)) {
      const value = layers[name];
      button.classList.toggle("on", name === "arcs" ? value !== "off" && value !== false : !!value);
      if (name === "arcs") button.textContent = value === "all" ? "射界（全部）" : value === "off" || value === false ? "射界（关）" : "射界";
    }
  }

  SetStatus({ state, message, writable, saveReason }) {
    const colors = { ok: "#7fb36a", synced: "#6aa6e0", error: "#d6604a", loading: "#9a9a8e" };
    this.statusDot.style.background = colors[state] || "#888";
    this.statusDot.title = [message, writable ? "可以直接写配置文件" : saveReason].filter(Boolean).join("\n");
    this.statusDot.dataset.state = state;
  }

  Toast(text, kind = "info") {
    const colors = { info: "#d6d9d1", ok: "#a9d68f", warn: "#e8c26a", error: "#ef8a75" };
    this.toast.textContent = text;
    this.toast.style.color = colors[kind] || colors.info;
    this.toast.style.display = "block";
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => { this.toast.style.display = "none"; }, 2500);
  }

  SetInteractive(on) {
    this.el.classList.toggle("bkOff", !on);
  }

  SetMapOpen(on) {
    this.full.style.display = on ? "block" : "none";
    if (on) {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const rect = this.fullCanvasEl.getBoundingClientRect();
      this.fullCanvasEl.width = Math.max(1, Math.round(rect.width * dpr));
      this.fullCanvasEl.height = Math.max(1, Math.round(rect.height * dpr));
    }
  }

  get miniCanvas() { return this.mini; }
  get fullCanvas() { return this.fullCanvasEl; }

  Dispose() {
    clearTimeout(this.toastTimer);
    this.el.remove();
    document.getElementById(STUB_STYLE_ID)?.remove();
  }
}
