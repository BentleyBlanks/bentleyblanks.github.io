// 《地道里的光》——过场时间轴（调试面板，2026-08-17）
//
// 干什么用：**把"过场演到哪儿"变成一个可以指着说的东西**。改一段过场，
// 用户与 agent 之间原来只能"截图 + 文字描述"——哪一拍、第几句、第几秒，
// 全靠猜；现在底栏拉出一条 Unity Timeline 式的时间轴：
//
//   · 台词 / 镜头 / on() / 框景 / 音效 / 微过场 六条轨，一句一块；
//   · 拖播放头到任意一格 → 游戏真的推到那儿并冻住（渲染照跑，镜头缓动追上来）；
//   · 右侧检视器给出这一格的全部（句、镜头参数、台上每个人在哪、姿势/轨道）；
//   · 「复制定位」拿到的就是 `shot` 子命令吃的那一串 `c1_thatday@line=5,at=1.20`
//     ——粘给 agent，它就能用 `node Script_Cli.mjs shot "…"` 拍到**同一格**。
//
// 三条边界（别把它做成第二个引擎）：
//   1. 时间的口径只有一个：Core 的 CineTimeTable / CineLocator（起点＝前面各句
//      时长之和，时长走 LineDuration）。面板上的秒数是它折算的，拖回去也先换算
//      成 (line, at) 再推 StepGame——与 CLI 的 `@line=N,at=T` 逐字对得上。
//   2. 往回拖＝重跳这一拍（JumpToBeat 结算前序）再往前推；往前拖只推不跳。
//      推的时候台词的自动前进按静音的时长走（不等配音），音效 cue 顺手收进
//      音效轨、并从 state.cues 里清掉——不清的话下一帧会一口气全响。
//   3. 只做"看"与"定位"，**不改剧本**：这不是编辑器的编辑一半，改台词仍去
//      Data_ScriptC*.mjs。面板上没有任何一个会写回剧本的控件。
//
// 入口：F3 / `?cine=1` / 设置 → 「过场时间轴」。键：空格 播放/暂停，
// ← → 逐帧（Shift ×10），[ ] 上一句/下一句，Home/End 段首/段末。

import {
  CHAPTERS, ChapterBeatList, CurrentBeatDef, StepGame, LineDuration,
  CineTimeTable, CineLocator, CineLocatorString,
} from "./Script_Core.mjs";

const IDLE = { moveX: 0, climb: 0, crouch: false, interact: false, interactHeld: false, advance: false };
const DT = 1 / 30;
const LANES = [
  { key: "lines", name: "台词" },
  { key: "cam", name: "镜头" },
  { key: "on", name: "on()" },
  { key: "fg", name: "框景" },
  { key: "cue", name: "音效" },
  { key: "micro", name: "微过场" },
];
const SPEEDS = [0.25, 0.5, 1, 2, 4];
const PAD = 10;              // 轨道左侧留白（像素）
const MIN_PPS = 6, MAX_PPS = 480;

function El(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}
function Fmt(t) {
  if (!(t >= 0)) t = 0;
  const m = Math.floor(t / 60), s = t - m * 60;
  return `${String(m).padStart(2, "0")}:${s.toFixed(2).padStart(5, "0")}`;
}
function Brief(v, depth = 0) {
  if (v === null || v === undefined) return String(v);
  if (typeof v === "function") return "ƒ";
  if (Array.isArray(v)) return depth > 1 ? `[${v.length}]` : `[${v.map((x) => Brief(x, depth + 1)).join(",")}]`;
  if (typeof v === "object") {
    const parts = Object.entries(v).filter(([, x]) => x !== undefined).map(([k, x]) => `${k}:${Brief(x, depth + 1)}`);
    return `{${parts.join(" ")}}`;
  }
  if (typeof v === "string") return v.length > 40 ? JSON.stringify(v.slice(0, 38) + "…") : JSON.stringify(v);
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : v.toFixed(2);
  return String(v);
}
function LineText(l) {
  if (!l) return "";
  if (l.say) return `${l.who ? l.who + "：" : ""}${l.say}`;
  if (l.stage) return `旁白：${l.stage}`;
  if (l.act) return `〔演〕${l.act}`;
  return l.d ? "（空）" : "";
}
function LineFg(l) { return (l && ((l.cam && l.cam.fg) || l.fg)) || null; }
function LineKind(l) { return l?.say ? "say" : l?.stage ? "stage" : l?.act ? "act" : "blank"; }
function CamLabel(cam) {
  if (!cam) return "follow";
  switch (cam.kind) {
    case "close": return `close·${cam.on || "player"}${cam.dist ? " d" + cam.dist : ""}`;
    case "ots": return `ots·${cam.subject}/${cam.other}`;
    case "shot": return `shot·x${cam.x}${cam.dist ? " d" + cam.dist : ""}`;
    case "wide": return `wide·x${cam.x}`;
    case "insert": return `insert·x${cam.x}`;
    case "insertCard": return `卡·${cam.card}#${cam.seg ?? 0}`;
    case "insertVideo": return `片·${cam.clip}`;
    case "free": return "free";
    case "split": return "split";
    case "dark": return "dark";
    default: return cam.kind || "follow";
  }
}

export function CreateCineTimeline(host) {
  // host: getState / JumpToBeat / Freeze / IsFrozen / MenuFrozen / SetSpeed / GetSpeed
  //       / Settle / world / canvas / getCam
  const root = document.getElementById("cinePanel");
  if (!root) return { Toggle() {}, IsOpen: () => false, Frame() {}, OnKey: () => false, Locator: () => "" };

  // ── 状态 ────────────────────────────────────────────────────────────
  let open = false, minimized = false;
  let pps = 40;                  // 每秒像素
  let fitPending = true;         // 换了拍就按宽度铺满一次
  let builtKey = "";             // 轨道内容的指纹（换拍/换行数/换缩放才重建）
  let table = { rows: [], total: 0 };
  let curLines = [];
  let cues = [];                 // [{t, name}] 本拍收到的音效
  let cueKeys = new Set();
  let cueBeatKey = "";
  let dragging = false, pendingSeek = null, seekRaf = 0;
  let loopLine = false;
  let statusT = 0;
  let inspT = 0;
  let lastLocKey = "";
  let loopAt = { line: -1, beat: "" };

  // ── DOM ─────────────────────────────────────────────────────────────
  root.innerHTML = "";
  const bar = El("div", "ctBar");
  const title = El("b", "ctTitle", "过场时间轴");
  const selCh = El("select", "ctSel ctChapter");
  const selBeat = El("select", "ctSel ctBeat");
  const trans = El("span", "ctTransport");
  const bFirst = El("button", "ctBtn", "⏮"); bFirst.title = "段首 (Home)";
  const bPrev = El("button", "ctBtn", "◀|"); bPrev.title = "上一句 ([)";
  const bBack = El("button", "ctBtn", "‹"); bBack.title = "退一帧 (←)";
  const bPlay = El("button", "ctBtn ctPlay", "▶"); bPlay.title = "播放/暂停 (空格)";
  const bFwd = El("button", "ctBtn", "›"); bFwd.title = "进一帧 (→)";
  const bNext = El("button", "ctBtn", "|▶"); bNext.title = "下一句 (])";
  const bLast = El("button", "ctBtn", "⏭"); bLast.title = "段末 (End)";
  const bLoop = El("button", "ctBtn ctToggle", "⟲句"); bLoop.title = "循环当前这一句";
  for (const b of [bFirst, bPrev, bBack, bPlay, bFwd, bNext, bLast, bLoop]) { b.type = "button"; trans.appendChild(b); }
  const selSpeed = El("select", "ctSel ctSpeed");
  for (const s of SPEEDS) { const o = El("option", "", `${s}×`); o.value = String(s); if (s === 1) o.selected = true; selSpeed.appendChild(o); }
  const timeOut = El("span", "ctTime", "00:00.00 / 00:00.00");
  const locOut = El("code", "ctLoc", "—");
  locOut.title = "shot 子命令吃的定位串（点一下也复制）";
  const bCopy = El("button", "ctBtn ctCopy", "复制定位"); bCopy.type = "button"; bCopy.title = "把这一格的定位串＋台上状态复制到剪贴板，粘给 agent";
  const bShot = El("button", "ctBtn", "拍这一格"); bShot.type = "button"; bShot.title = "抓一帧存到 _shots/（本地 DevServer）或下载";
  const noteIn = El("input", "ctNote"); noteIn.type = "text"; noteIn.placeholder = "备注（一起复制）"; noteIn.spellcheck = false;
  const zoomBox = El("span", "ctZoom");
  const bZoomOut = El("button", "ctBtn", "−"); bZoomOut.type = "button"; bZoomOut.title = "缩小 (Ctrl+滚轮)";
  const bZoomFit = El("button", "ctBtn", "适配"); bZoomFit.type = "button"; bZoomFit.title = "整段铺满";
  const bZoomIn = El("button", "ctBtn", "+"); bZoomIn.type = "button"; bZoomIn.title = "放大 (Ctrl+滚轮)";
  zoomBox.append(bZoomOut, bZoomFit, bZoomIn);
  const status = El("span", "ctStatus", "");
  const bMin = El("button", "ctBtn ctMin", "▁"); bMin.type = "button"; bMin.title = "收起/展开";
  const bClose = El("button", "ctBtn ctClose", "×"); bClose.type = "button"; bClose.title = "关闭 (F3)";
  bar.append(title, selCh, selBeat, trans, selSpeed, timeOut, locOut, bCopy, bShot, noteIn, zoomBox, status, bMin, bClose);

  const body = El("div", "ctBody");
  const tracks = El("div", "ctTracks");
  const head = El("div", "ctHead");
  const headRuler = El("div", "ctHeadRow ctHeadRuler", "秒");
  head.appendChild(headRuler);
  const laneHeads = {};
  for (const L of LANES) { const h = El("div", "ctHeadRow", L.name); h.dataset.lane = L.key; head.appendChild(h); laneHeads[L.key] = h; }
  const scroll = El("div", "ctScroll");
  const inner = El("div", "ctInner");
  const ruler = El("div", "ctRuler");
  inner.appendChild(ruler);
  const lanes = {};
  for (const L of LANES) { const d = El("div", "ctLane"); d.dataset.lane = L.key; inner.appendChild(d); lanes[L.key] = d; }
  const playhead = El("div", "ctPlayhead");
  const playheadCap = El("i", "ctPlayheadCap");
  playhead.appendChild(playheadCap);
  inner.appendChild(playhead);
  scroll.appendChild(inner);
  tracks.append(head, scroll);
  const insp = El("aside", "ctInspect");
  body.append(tracks, insp);
  // 顶边一条抓手：拖着改面板高度（记在本地）
  const grip = El("div", "ctGrip");
  grip.title = "拖动改高度";
  root.append(grip, bar, body);
  // 面板多高，字幕/提示就往上让多少（CSS 读 --cine-h；关着是 0）
  const PublishHeight = () => {
    const h = open ? Math.round(root.getBoundingClientRect().height) : 0;
    document.documentElement.style.setProperty("--cine-h", `${h}px`);
  };
  if (typeof ResizeObserver === "function") new ResizeObserver(PublishHeight).observe(root);
  const HEIGHT_KEY = "tunnelLight1943.cineH";
  try { const h = Number(localStorage.getItem(HEIGHT_KEY)); if (h >= 120) root.style.height = `${h}px`; } catch (ignored) { /* 无存储 */ }
  grip.addEventListener("pointerdown", (e) => {
    const y0 = e.clientY, h0 = root.getBoundingClientRect().height;
    const move = (ev) => {
      const h = Math.max(120, Math.min(window.innerHeight * 0.85, h0 + (y0 - ev.clientY)));
      root.style.height = `${h}px`;
      builtKey = "";
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      try { localStorage.setItem(HEIGHT_KEY, String(Math.round(root.getBoundingClientRect().height))); } catch (ignored) { /* */ }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    e.preventDefault();
  });

  // ── 小工具 ───────────────────────────────────────────────────────────
  const S = () => host.getState();
  const Say = (msg, ms = 2600) => { status.textContent = msg; statusT = performance.now() + ms; };
  const Loc = () => CineLocator(S());
  const InCine = (L) => !!(L && L.line !== null);
  // 微过场当主轨：这一拍不是 cinematic、只有链里起的微过场在跑——那就把它的
  // 几句直接铺在台词/镜头轨上，播放头按它走（它回不去，只能往前推）。
  // 拍本身是 cinematic 时微过场退到自己那条轨（罕见，两套时间各走各的）。
  const MicroPrimary = (L) => !!(L && L.micro && !(S() && CurrentBeatDef(S())?.kind === "cinematic"));
  // 主轨上"现在演到哪句"：微过场当主轨时是它的句号，否则是拍自己的
  const MainLine = (L) => {
    if (!L) return null;
    if (L.micro && !MicroPrimary(L)) { const b = S()?.beat; return b ? { line: b.lineIndex, lineT: b.lineT || 0 } : null; }
    if (!InCine(L)) return null;
    return { line: L.line, lineT: L.lineT || 0 };
  };
  const NowTime = (L) => {
    const m = MainLine(L);
    if (!m) return 0;
    const r = table.rows[m.line];
    return (r ? r.start : table.total) + Math.min(m.lineT || 0, r ? r.d : 0);
  };
  const X = (t) => PAD + t * pps;
  const T = (x) => Math.max(0, (x - PAD) / pps);
  const IsPlaying = () => !host.IsFrozen() && !host.MenuFrozen();

  // ── 章/拍下拉 ────────────────────────────────────────────────────────
  function FillChapters() {
    selCh.innerHTML = "";
    CHAPTERS.forEach((ch, i) => {
      const o = El("option", "", `${i + 1} · ${ch.title}`);
      o.value = String(i);
      selCh.appendChild(o);
    });
  }
  function FillBeats(ci) {
    selBeat.innerHTML = "";
    for (const b of ChapterBeatList(ci)) {
      const cine = b.kind === "cinematic";
      const o = El("option", "", `${cine ? "●" : "○"} ${String(b.index + 1).padStart(2, "0")} ${b.id} · ${b.label}`);
      o.value = String(b.index);
      o.title = `${b.kind} · ${b.label}`;
      if (!cine) o.className = "dim";
      selBeat.appendChild(o);
    }
  }
  let selKey = "";
  function SyncSelects() {
    const st = S();
    const ci = st ? st.chapterIndex : 0;
    const bi = st ? st.beatIndex : -1;
    const key = `${ci}/${bi}`;
    if (key === selKey) return;
    selKey = key;
    if (String(ci) !== selCh.value) { selCh.value = String(ci); FillBeats(ci); }
    if (!selBeat.options.length) FillBeats(ci);
    selBeat.value = bi >= 0 ? String(bi) : "";
  }
  FillChapters();
  FillBeats(0);
  selCh.addEventListener("change", () => { FillBeats(Number(selCh.value)); selBeat.selectedIndex = 0; GoBeat(); });
  selBeat.addEventListener("change", GoBeat);
  function GoBeat() {
    const ci = Number(selCh.value), bi = Number(selBeat.value);
    if (!(bi >= 0)) return;
    host.JumpToBeat(ci, bi);
    host.Freeze(true);
    ResetCues();
    fitPending = true;
    selKey = "";
    Refresh(true);
    Say(`跳到 ${ChapterBeatList(ci)[bi]?.id || bi}，已冻住——按空格播放`);
  }

  // ── 音效轨：收 cue ───────────────────────────────────────────────────
  function ResetCues() { cues = []; cueKeys = new Set(); RebuildCues(); }
  function Harvest(st, L) {
    if (!st?.cues?.length) return;
    const t = NowTime(L);
    for (const c of st.cues) {
      const name = typeof c === "string" ? c : c?.name;
      if (!name) continue;
      const k = `${name}@${t.toFixed(2)}`;
      if (cueKeys.has(k)) continue;
      cueKeys.add(k);
      cues.push({ t, name });
    }
  }
  function RebuildCues() {
    const lane = lanes.cue;
    lane.innerHTML = "";
    for (const c of cues) AppendCue(c);
  }
  function AppendCue(c) {
    const m = El("i", "ctMark cue");
    m.style.left = `${X(c.t)}px`;
    m.title = `${c.name} @ ${c.t.toFixed(2)}s`;
    m.dataset.t = String(c.t);
    lanes.cue.appendChild(m);
  }

  // ── 推到某一格 ───────────────────────────────────────────────────────
  // (line, at) 是唯一口径。往回＝重跳这一拍再推；往前＝接着推。推的每一帧
  // 把 cue 收进音效轨并清掉（不然下一帧一口气全响），台词按静音时长自动前进
  //（不等配音，`advance` 由这儿按 LineDuration 亲手喂）。
  function SeekLineAt(line, at, opts = {}) {
    const st0 = S();
    const L0 = Loc();
    if (!st0) return;
    // 定位的是**眼下这一拍**（换拍走 GoBeat，它会先跳过去）——别读下拉框，
    // 面板没刷新的那一帧里下拉框可能还指着上一拍
    const ci = st0.chapterIndex, bi = st0.beatIndex;
    // 表要跟拍：外头（TunnelLight.JumpToBeat / GoBeat）刚换了拍、面板还没刷新时先刷一次
    if (cueBeatKey !== `${ci}/${bi}`) Refresh(true);
    const wantTime = (table.rows[line]?.start || 0) + at;
    if (MicroPrimary(L0)) {
      // 链里起的微过场：没有"重跳"这回事——只能往前推
      if (NowTime(L0) > wantTime + 1e-4) { Say("微过场回不去（它是链里起的），只能往前推"); return; }
      host.Freeze(true);
      let n = 0;
      while (n++ < 20000) {
        const L = Loc();
        if (!L?.micro) break;
        if (L.line > line || (L.line === line && L.lineT + 1e-6 >= at)) break;
        const cur = L.lines[L.line];
        const d = cur ? LineDuration(cur) : 0;
        StepGame(st0, { ...IDLE, advance: cur ? (L.lineT + DT >= d - 1e-6) : false }, DT);
        Harvest(st0, Loc());
        if (st0.cues) st0.cues.length = 0;
      }
      if (opts.settle) host.Settle(opts.settle);
      RebuildCues();
      Refresh(true);
      return;
    }
    const same = st0.chapterIndex === ci && st0.beatIndex === bi && InCine(L0) && !L0.micro;
    if (!same || NowTime(L0) > wantTime + 1e-4) {
      host.JumpToBeat(ci, bi);
      if (!(cueBeatKey === `${ci}/${bi}`)) ResetCues();
    }
    host.Freeze(true);
    const st = S();
    const guard = 20000;
    let n = 0;
    const step = () => {
      const L = Loc();
      if (!InCine(L) || L.micro) return false;
      const cur = L.lines[L.line];
      const d = cur ? LineDuration(cur) : 0;
      // 到点自己翻页：静音时长走完这句就 advance（跟 StepCinematic 里 LineHeld 的静音分支一样）
      const adv = cur ? (L.lineT + DT >= d - 1e-6) : false;
      StepGame(st, { ...IDLE, advance: adv }, DT);
      Harvest(st, Loc());
      if (st.cues) st.cues.length = 0;
      return true;
    };
    while (n++ < guard) {
      const L = Loc();
      if (!InCine(L) || L.micro || st.chapterIndex !== ci || st.beatIndex !== bi) break;
      if (L.line > line) break;
      if (L.line === line && L.lineT + 1e-6 >= at) break;
      if (!step()) break;
    }
    if (opts.settle) host.Settle(opts.settle);
    RebuildCues();
    Refresh(true);
  }
  function SeekTime(t) {
    const st = S();
    if (st && cueBeatKey !== `${st.chapterIndex}/${st.beatIndex}`) Refresh(true);
    if (!table.rows.length) return;
    t = Math.max(0, Math.min(table.total - 1e-3, t));
    let i = table.rows.findIndex((r) => t < r.start + r.d);
    if (i < 0) i = table.rows.length - 1;
    const at = Math.max(0, t - table.rows[i].start);
    SeekLineAt(i, at);
  }
  function StepFrames(n) {
    const st = S();
    if (!st) return;
    host.Freeze(true);
    if (n > 0) {
      for (let i = 0; i < n; i += 1) {
        StepGame(st, IDLE, DT);
        Harvest(st, Loc());
        if (st.cues) st.cues.length = 0;
      }
      RebuildCues();
      Refresh(true);
    } else if (n < 0) {
      const L = Loc();
      if (!InCine(L) || L.micro) return;
      SeekTime(NowTime(L) + n * DT);
    }
  }
  function ToLine(delta) {
    const L = Loc();
    if (!InCine(L)) return;
    const i = Math.max(0, Math.min(table.rows.length - 1, L.line + delta));
    SeekLineAt(i, 0);
  }
  function Play(v) {
    const st = S();
    if (!st) { Say("还没开局——先在上面选一拍"); return; }
    if (v === undefined) v = !IsPlaying();
    host.Freeze(!v);
    Refresh(true);
  }

  // ── 轨道内容 ─────────────────────────────────────────────────────────
  function Rebuild(L) {
    for (const k of ["lines", "cam", "on", "fg"]) lanes[k].innerHTML = "";
    ruler.innerHTML = "";
    const width = Math.max(scroll.clientWidth, X(table.total) + 40);
    inner.style.width = `${width}px`;
    // 刻度：按缩放挑步长（每 ≥70px 一个大格）
    const stepS = [0.25, 0.5, 1, 2, 5, 10, 15, 30, 60].find((s) => s * pps >= 70) || 60;
    for (let t = 0; t <= table.total + stepS; t += stepS) {
      const tick = El("i", "ctTick" + (Math.abs(t / stepS - Math.round(t / stepS)) < 1e-6 ? " major" : ""));
      tick.style.left = `${X(t)}px`;
      const lab = El("b", "", t % 1 === 0 ? `${t}s` : `${t.toFixed(2)}s`);
      tick.appendChild(lab);
      ruler.appendChild(tick);
      if (stepS >= 1) {
        // 小格
        const sub = stepS >= 5 ? stepS / 5 : stepS / 2;
        for (let u = t + sub; u < t + stepS && u <= table.total + stepS; u += sub) {
          const m = El("i", "ctTick minor");
          m.style.left = `${X(u)}px`;
          ruler.appendChild(m);
        }
      }
    }
    curLines.forEach((l, i) => {
      const r = table.rows[i];
      const left = X(r.start), w = Math.max(3, r.d * pps - 1);
      const kind = LineKind(l);
      const c = El("div", `ctClip ${kind}`);
      c.style.left = `${left}px`; c.style.width = `${w}px`;
      c.dataset.line = String(i);
      const txt = LineText(l);
      c.appendChild(El("span", "", `${i}. ${txt}`));
      c.title = `#${i} [${r.start.toFixed(2)}s +${r.d.toFixed(2)}]${l.d !== r.d ? `（剧本 d=${l.d}，配音撑到 ${r.d.toFixed(2)}）` : ""}\n${txt}`;
      lanes.lines.appendChild(c);
      const cam = l.cam || { kind: "follow" };
      const cc = El("div", `ctClip cam k-${cam.kind || "follow"}${cam.cut ? " cut" : ""}`);
      cc.style.left = `${left}px`; cc.style.width = `${w}px`;
      cc.dataset.line = String(i);
      cc.appendChild(El("span", "", CamLabel(cam) + (cam.trans ? ` ⟂${cam.trans}` : "")));
      cc.title = `#${i} cam=${Brief(cam)}`;
      lanes.cam.appendChild(cc);
      if (l.on) {
        const m = El("i", "ctMark on"); m.style.left = `${left}px`; m.title = `#${i} 行首 on() 走位/姿势`; m.dataset.line = String(i);
        lanes.on.appendChild(m);
      }
      const fg = LineFg(l);
      if (fg && fg.length) {
        const m = El("i", "ctMark fg"); m.style.left = `${left}px`; m.style.width = `${w}px`;
        m.title = `#${i} 框景 ${fg.length} 块：${fg.map((f) => f.art).join(" ")}`; m.dataset.line = String(i);
        m.appendChild(El("b", "", String(fg.length)));
        lanes.fg.appendChild(m);
      }
    });
    RebuildCues();
    RebuildMicro(L, true);
  }
  let microKey = "";
  function RebuildMicro(L, force) {
    const st = S();
    const mc = st?.microCine && !MicroPrimary(L) ? st.microCine : null;
    const key = mc ? `${mc.lines.length}|${mc.i}|${pps}` : "";
    if (!force && key === microKey) { if (mc) PositionMicro(L); return; }
    microKey = key;
    lanes.micro.innerHTML = "";
    if (!mc) return;
    const tt = CineTimeTable(mc.lines);
    mc.lines.forEach((l, i) => {
      const c = El("div", `ctClip micro ${LineKind(l)}${i === mc.i ? " now" : ""}`);
      c.dataset.rel = String(tt.rows[i].start);
      c.dataset.i = String(i);
      c.style.width = `${Math.max(3, tt.rows[i].d * pps - 1)}px`;
      c.appendChild(El("span", "", `${i}. ${LineText(l)}`));
      c.title = `微过场 #${i} [+${tt.rows[i].start.toFixed(2)}s ${tt.rows[i].d.toFixed(2)}]  cam=${Brief(l.cam || { kind: "close" })}\n${LineText(l)}`;
      lanes.micro.appendChild(c);
    });
    PositionMicro(L);
  }
  // 微过场的时间是自己的：按"这一句此刻在播放头下"倒推它的起点
  function PositionMicro(L) {
    const st = S();
    const mc = st?.microCine;
    if (!mc || MicroPrimary(L)) return;
    const tt = CineTimeTable(mc.lines);
    const anchor = NowTime(L) - (tt.rows[mc.i]?.start || 0) - (mc.t || 0);
    for (const c of lanes.micro.children) {
      c.style.left = `${X(anchor + Number(c.dataset.rel))}px`;
      c.classList.toggle("now", Number(c.dataset.i) === mc.i);
    }
  }

  // ── 检视器 ───────────────────────────────────────────────────────────
  function Row(k, v, cls) {
    const r = El("div", "ctRow" + (cls ? " " + cls : ""));
    r.appendChild(El("b", "", k));
    const val = El("span", "");
    val.textContent = v;
    r.appendChild(val);
    return r;
  }
  function Inspect(L) {
    const st = S();
    insp.innerHTML = "";
    if (!st) { insp.appendChild(El("p", "ctEmpty", "未开局。上面选一章一拍即从那里开始（前序按脚本结算）。")); return; }
    const def = CurrentBeatDef(st);
    const ch = CHAPTERS[st.chapterIndex];
    const h = El("h4", "", `${ch.id} · 第 ${st.beatIndex + 1} 拍 · ${def?.id || st.phase}`);
    insp.appendChild(h);
    insp.appendChild(Row("kind", `${def?.kind || "-"}${def?.timeOfDay ? " · " + def.timeOfDay : ""}${st.phase !== "playing" ? " · phase=" + st.phase : ""}`));
    if (InCine(L)) {
      const l = L.lines[L.line];
      const r = table.rows[L.line] || { start: 0, d: LineDuration(l || { d: 0 }) || 0 };
      const dur = L.micro ? (l ? LineDuration(l) : 0) : r.d;
      insp.appendChild(Row(L.micro ? "微过场" : "句", `#${L.line} / ${L.lines.length}  ${L.lineT.toFixed(2)} / ${dur.toFixed(2)}s`, "hi"));
      const bar = El("div", "ctProg"); const fill = El("i", ""); fill.style.width = `${Math.min(100, dur > 0 ? L.lineT / dur * 100 : 0)}%`; bar.appendChild(fill); insp.appendChild(bar);
      const txt = El("p", `ctText ${LineKind(l)}`, LineText(l) || "（这句没有文本）");
      insp.appendChild(txt);
      const cam = l?.cam || { kind: L.micro ? "close" : "follow" };
      insp.appendChild(Row("cam", Brief(cam)));
      const flags = [];
      if (l?.on) flags.push("on()");
      if (LineFg(l)?.length) flags.push(`fg×${LineFg(l).length}`);
      if (cam.cut) flags.push("cut");
      if (cam.trans) flags.push("trans=" + cam.trans);
      if (l?.d !== undefined && r.d !== l.d) flags.push(`d=${l.d}→${r.d.toFixed(2)}(配音)`);
      if (l?.bgm !== undefined) flags.push(`bgm=${l.bgm}`);
      insp.appendChild(Row("标记", flags.join(" · ") || "—"));
    } else {
      insp.appendChild(Row("过场", def?.kind === "cinematic" ? "（本拍已演完）" : "这一拍不是过场；链里起的微过场跑起来会出现在「微过场」轨", "dim"));
      if (st.prompt) insp.appendChild(Row("prompt", String(st.prompt)));
      if (def?.steps && st.beat) insp.appendChild(Row("步骤", `${st.beat.stepIndex ?? 0} / ${def.steps.length}`));
    }
    // 台上的人
    const p = st.player;
    const who = (a) => `${a.x.toFixed(2)}${a.level === "under" ? " ▽" : ""} ${a.heading >= 0 ? "→" : "←"}${a.pose ? " " + a.pose : ""}${a.track ? " ⟳" + a.track.name : ""}${a.lift ? " ↑" + a.lift.toFixed(2) : ""}${a.carry ? " 持" + a.carry : ""}${a.mood ? " ☁" + a.mood : ""}`;
    const list = El("div", "ctActors");
    list.appendChild(Row("player", who(p), "actor"));
    for (const a of st.actors || []) {
      if (a.visible === false) continue;
      list.appendChild(Row(a.id, who(a), "actor"));
    }
    insp.appendChild(list);
    const cam = host.getCam?.();
    if (cam) insp.appendChild(Row("相机", `x${cam.x.toFixed(2)} y${cam.y.toFixed(2)} hw${cam.hw.toFixed(2)}`));
    insp.appendChild(Row("光", `${st.lightOverride || def?.timeOfDay || ch.light || "-"}`));
    const near = cues.filter((c) => Math.abs(c.t - NowTime(L)) <= 0.6).map((c) => c.name);
    if (near.length) insp.appendChild(Row("音效±0.6s", [...new Set(near)].join(" ")));
    const on = Object.entries(st.flags || {}).filter(([, v]) => v === true).map(([k]) => k);
    if (on.length) { const f = Row("旗标", on.join(" ")); f.classList.add("flags"); insp.appendChild(f); }
  }

  // ── 复制定位 / 拍这一格 ───────────────────────────────────────────────
  function LocatorText() {
    const st = S();
    const L = Loc();
    if (!st || !L?.id) return "";
    const ch = CHAPTERS[st.chapterIndex];
    const loc = CineLocatorString(st);
    const lines = [`【过场定位】${loc}`];
    let head = `${ch.id} 第 ${st.beatIndex + 1} 拍 ${L.id}（${L.kind}）`;
    if (InCine(L)) {
      const l = L.lines[L.line];
      const dur = L.micro ? LineDuration(l) : (table.rows[L.line]?.d || 0);
      head += ` · ${L.micro ? "微过场" : ""}第 ${L.line + 1}/${L.lines.length} 句 · 句内 ${L.lineT.toFixed(2)}/${(dur || 0).toFixed(2)}s`;
      if (!L.micro) head += ` · 全段 ${NowTime(L).toFixed(2)}/${table.total.toFixed(2)}s`;
      lines.push(head);
      const cam = l?.cam || { kind: L.micro ? "close" : "follow" };
      lines.push(`句：${LineText(l) || "（无文本）"} · cam=${Brief(cam)}${l?.on ? " · on()" : ""}${LineFg(l)?.length ? " · fg×" + LineFg(l).length : ""}${cam.cut ? " · cut" : ""}`);
    } else {
      lines.push(head + (st.prompt ? ` · prompt=${st.prompt}` : ""));
    }
    lines.push(`实拍：node TunnelLight1943/Script_Cli.mjs shot "${loc}"`);
    const p = st.player;
    const one = (a) => `${a.id || "player"} x=${a.x.toFixed(2)}${a.level === "under" ? "(under)" : ""}${a.pose ? " pose=" + a.pose : ""}${a.track ? " track=" + a.track.name : ""}`;
    const cast = [one({ ...p, id: "player" })].concat((st.actors || []).filter((a) => a.visible !== false).slice(0, 8).map(one));
    lines.push(`台上：${cast.join("；")}`);
    const cam = host.getCam?.();
    if (cam) lines.push(`相机：x${cam.x.toFixed(2)} y${cam.y.toFixed(2)} hw${cam.hw.toFixed(2)}${st.lightOverride ? " · 光=" + st.lightOverride : ""}`);
    if (noteIn.value.trim()) lines.push(`备注：${noteIn.value.trim()}`);
    return lines.join("\n");
  }
  async function CopyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (e) {
      const ta = document.createElement("textarea");
      ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.select();
      let ok = false;
      try { ok = document.execCommand("copy"); } catch (e2) { ok = false; }
      ta.remove();
      return ok;
    }
  }
  async function DoCopy() {
    const text = LocatorText();
    if (!text) { Say("没有可定位的东西（先开局）"); return; }
    const ok = await CopyText(text);
    Say(ok ? "已复制：" + text.split("\n")[0] : "复制失败（浏览器不给剪贴板）——检视器里可以手选");
    if (!ok) { insp.prepend(El("pre", "ctPre", text)); }
  }
  async function DoShot() {
    const st = S();
    if (!st) { Say("先开局"); return; }
    const loc = CineLocatorString(st) || "shot";
    const name = ("cine_" + loc).replace(/[^A-Za-z0-9_-]/g, "_").replace(/_+/g, "_").slice(0, 80);
    // 画布不留后备缓冲：先渲一帧，同一任务里马上取
    host.world.Render();
    let url;
    try { url = host.canvas.toDataURL("image/jpeg", 0.92); } catch (e) { Say("抓帧失败：" + e.message); return; }
    try {
      const r = await fetch(`/__shot?name=${encodeURIComponent(name)}`, { method: "POST", body: url });
      if (r.ok) {
        const text = LocatorText() + `\n截图：TunnelLight1943/_shots/${name}.jpg`;
        await CopyText(text);
        Say(`已存 _shots/${name}.jpg（定位＋路径已复制）`);
        return;
      }
    } catch (e) { /* 不在本地 DevServer 上：退到下载 */ }
    const a = document.createElement("a");
    a.href = url; a.download = `${name}.jpg`;
    document.body.appendChild(a); a.click(); a.remove();
    Say(`已下载 ${name}.jpg（线上没有回写口）`);
  }

  // ── 缩放 / 拖拽 ─────────────────────────────────────────────────────
  function Fit() {
    const w = Math.max(200, scroll.clientWidth - PAD * 2 - 24);
    pps = table.total > 0 ? Math.max(MIN_PPS, Math.min(MAX_PPS, w / table.total)) : 40;
    builtKey = "";
  }
  function Zoom(k, anchorX) {
    const rect = scroll.getBoundingClientRect();
    const ax = anchorX === undefined ? rect.width / 2 : anchorX - rect.left;
    const tAt = T(scroll.scrollLeft + ax);
    pps = Math.max(MIN_PPS, Math.min(MAX_PPS, pps * k));
    builtKey = "";
    Refresh(true);
    scroll.scrollLeft = Math.max(0, X(tAt) - ax);
  }
  scroll.addEventListener("wheel", (e) => {
    if (e.ctrlKey || e.metaKey) { e.preventDefault(); Zoom(e.deltaY < 0 ? 1.25 : 0.8, e.clientX); }
    else if (Math.abs(e.deltaY) > Math.abs(e.deltaX) && !e.shiftKey) { scroll.scrollLeft += e.deltaY; e.preventDefault(); }
  }, { passive: false });
  bZoomIn.addEventListener("click", () => Zoom(1.4));
  bZoomOut.addEventListener("click", () => Zoom(1 / 1.4));
  bZoomFit.addEventListener("click", () => { Fit(); Refresh(true); });

  function ScrubTo(clientX) {
    const rect = inner.getBoundingClientRect();
    pendingSeek = T(clientX - rect.left);
    if (!seekRaf) seekRaf = requestAnimationFrame(() => {
      seekRaf = 0;
      if (pendingSeek === null) return;
      const t = pendingSeek; pendingSeek = null;
      SeekTime(t);
    });
  }
  const scrubTargets = [ruler, lanes.lines, lanes.cam, lanes.on, lanes.fg, lanes.cue, lanes.micro];
  inner.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    if (!scrubTargets.some((el) => el === e.target || el.contains(e.target))) return;
    const st = S();
    if (!st) { Say("先在上面选一拍"); return; }
    if (!table.rows.length) { Say("这一拍没有台词轨可拖（不是过场）"); return; }
    dragging = true;
    try { inner.setPointerCapture(e.pointerId); } catch (ignored) { /* 合成事件 */ }
    // 拖到哪一句：点在句块上按句块的时间算，点在空处按位置算——两者其实同一把尺
    ScrubTo(e.clientX);
    e.preventDefault();
  });
  inner.addEventListener("pointermove", (e) => { if (dragging) ScrubTo(e.clientX); });
  const EndDrag = (e) => {
    if (!dragging) return;
    dragging = false;
    try { inner.releasePointerCapture(e.pointerId); } catch (ignored) { /* */ }
    // 松手把渲染侧推够（镜头缓动/立面淡出/光照换挡），随手拍图才是这一格
    host.Settle(24);
    Refresh(true);
  };
  inner.addEventListener("pointerup", EndDrag);
  inner.addEventListener("pointercancel", EndDrag);
  // 双击句块＝钉到句首并暂停
  lanes.lines.addEventListener("dblclick", (e) => {
    const c = e.target.closest(".ctClip");
    if (!c) return;
    SeekLineAt(Number(c.dataset.line), 0, { settle: 24 });
  });
  lanes.cam.addEventListener("dblclick", (e) => {
    const c = e.target.closest(".ctClip");
    if (!c) return;
    SeekLineAt(Number(c.dataset.line), 0, { settle: 24 });
  });

  // ── 按钮 ─────────────────────────────────────────────────────────────
  bPlay.addEventListener("click", () => Play());
  bFirst.addEventListener("click", () => SeekLineAt(0, 0, { settle: 24 }));
  bLast.addEventListener("click", () => { const n = table.rows.length; if (n) SeekLineAt(n - 1, Math.max(0, table.rows[n - 1].d - DT), { settle: 24 }); });
  bPrev.addEventListener("click", () => ToLine(-1));
  bNext.addEventListener("click", () => ToLine(1));
  bBack.addEventListener("click", () => StepFrames(-1));
  bFwd.addEventListener("click", () => StepFrames(1));
  bLoop.addEventListener("click", () => { loopLine = !loopLine; bLoop.setAttribute("aria-pressed", loopLine ? "true" : "false"); });
  selSpeed.addEventListener("change", () => host.SetSpeed(Number(selSpeed.value)));
  bCopy.addEventListener("click", DoCopy);
  locOut.addEventListener("click", DoCopy);
  bShot.addEventListener("click", DoShot);
  bMin.addEventListener("click", () => { minimized = !minimized; root.classList.toggle("min", minimized); bMin.textContent = minimized ? "▔" : "▁"; if (!minimized) { fitPending = true; } PublishHeight(); });
  bClose.addEventListener("click", () => Toggle(false));
  // 面板里敲键盘归面板（备注框里打字不许把 E/B/M 漏给游戏）
  for (const el of [noteIn, selCh, selBeat, selSpeed]) {
    el.addEventListener("keydown", (e) => { if (e.key !== "Escape") e.stopPropagation(); });
    el.addEventListener("keyup", (e) => e.stopPropagation());
  }
  noteIn.addEventListener("keydown", (e) => { if (e.key === "Enter") { DoCopy(); e.preventDefault(); } });

  // ── 每帧 ─────────────────────────────────────────────────────────────
  function Refresh(force) {
    const st = S();
    const L = Loc();
    if (st) Harvest(st, L);
    // 表：当前拍的行
    const microPrimary = MicroPrimary(L);
    const lines = microPrimary ? L.lines
      : (InCine(L) && !L.micro ? L.lines
        : (st && CurrentBeatDef(st)?.kind === "cinematic" ? (st.beatLines || CurrentBeatDef(st).lines || []) : []));
    curLines = lines;
    table = CineTimeTable(lines);
    if (fitPending && !minimized && !root.hidden && scroll.clientWidth > 0) { Fit(); fitPending = false; }
    const key = `${st ? st.chapterIndex + "/" + st.beatIndex : "-"}|${microPrimary ? "m" : ""}${lines.length}|${table.total.toFixed(2)}|${pps.toFixed(2)}|${scroll.clientWidth}`;
    const bk = st ? `${st.chapterIndex}/${st.beatIndex}` : "";
    if (bk !== cueBeatKey) { cueBeatKey = bk; ResetCues(); }
    if (key !== builtKey) { builtKey = key; Rebuild(L); }
    else if (cues.length !== lanes.cue.children.length) RebuildCues();
    RebuildMicro(L, false);
    // 播放头
    const t = NowTime(L);
    playhead.style.left = `${X(t)}px`;
    const ml = MainLine(L);
    playhead.classList.toggle("off", !ml);
    for (const c of lanes.lines.children) c.classList.toggle("now", !!ml && Number(c.dataset.line) === ml.line);
    for (const c of lanes.cam.children) c.classList.toggle("now", !!ml && Number(c.dataset.line) === ml.line);
    lanes.lines.classList.toggle("microPrimary", microPrimary);
    laneHeads.lines.textContent = microPrimary ? "微过场" : "台词";
    // 播放中让播放头待在视野里
    if (IsPlaying() && !dragging) {
      const px = X(t) - scroll.scrollLeft;
      if (px > scroll.clientWidth - 60) scroll.scrollLeft = X(t) - scroll.clientWidth * 0.3;
      else if (px < 0) scroll.scrollLeft = Math.max(0, X(t) - 40);
    }
    // 读数
    timeOut.textContent = `${Fmt(t)} / ${Fmt(table.total)}`;
    const locStr = st ? CineLocatorString(st) : "";
    locOut.textContent = locStr || "—";
    const playing = IsPlaying();
    bPlay.textContent = playing ? "❚❚" : "▶";
    bPlay.classList.toggle("on", playing);
    if (host.GetSpeed && String(host.GetSpeed()) !== selSpeed.value) selSpeed.value = String(host.GetSpeed());
    SyncSelects();
    // 循环这一句：越过句尾就退回句首
    if (loopLine && playing && InCine(L) && !L.micro && L.line !== loopAt.line) {
      if (loopAt.line >= 0 && loopAt.beat === bk && L.line > loopAt.line) { SeekLineAt(loopAt.line, 0); host.Freeze(false); return; }
    }
    if (InCine(L) && !L.micro) loopAt = { line: L.line, beat: bk };
    else if (!InCine(L)) loopAt = { line: -1, beat: "" };
    // 检视器 ~10Hz 或状态换了
    const now = performance.now();
    const locKey = `${locStr}|${playing}|${st?.actors?.length}`;
    if (force || now - inspT > 100 || locKey !== lastLocKey) { inspT = now; lastLocKey = locKey; Inspect(L); }
    if (statusT && now > statusT) { status.textContent = ""; statusT = 0; }
  }

  function Toggle(force) {
    open = force === undefined ? !open : !!force;
    root.hidden = !open;
    document.body.classList.toggle("cineOpen", open);
    PublishHeight();
    if (open) {
      selKey = ""; builtKey = ""; fitPending = true;
      const st = S();
      if (st) { selCh.value = String(st.chapterIndex); FillBeats(st.chapterIndex); selBeat.value = String(st.beatIndex); }
      Refresh(true);
      Say("拖播放头定位；空格播放；「复制定位」粘给 agent");
    } else {
      // 关面板不许把游戏冻在那儿
      host.Freeze(false);
      host.SetSpeed(1);
      selSpeed.value = "1";
    }
    return open;
  }
  function OnKey(e, k) {
    if (!open || minimized) return false;
    const tag = (e.target && e.target.tagName) || "";
    if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return false;
    switch (k) {
      case " ": Play(); e.preventDefault(); return true;
      case "arrowleft": StepFrames(e.shiftKey ? -10 : -1); e.preventDefault(); return true;
      case "arrowright": StepFrames(e.shiftKey ? 10 : 1); e.preventDefault(); return true;
      case "[": ToLine(-1); e.preventDefault(); return true;
      case "]": ToLine(1); e.preventDefault(); return true;
      case "home": SeekLineAt(0, 0, { settle: 24 }); e.preventDefault(); return true;
      case "end": { const n = table.rows.length; if (n) SeekLineAt(n - 1, Math.max(0, table.rows[n - 1].d - DT), { settle: 24 }); e.preventDefault(); return true; }
      default: return false;
    }
  }

  return {
    Toggle,
    IsOpen: () => open,
    // 每帧（RunFrame 里、soundtrack.Step 之前——它会把 cues 清掉）
    Frame: () => { if (open) Refresh(false); },
    OnKey,
    Locator: () => LocatorText(),
    Seek: (line, at = 0) => SeekLineAt(line, at, { settle: 24 }),
    SeekTime,
  };
}
