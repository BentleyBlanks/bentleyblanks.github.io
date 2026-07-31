import { CHAPTERS, CACHE_BUST, FindHistoryCard } from "./Data_Story.mjs";
import {
  AdvanceBriefing,
  AdvanceOutro,
  CreateCampaignState,
  CreateInputState,
  LoadFromStorage,
  RestartChapter,
  SaveToStorage,
  StepPlay,
} from "./Script_Rules.mjs";

const $ = (id) => document.getElementById(id);

const canvas = $("GameCanvas");
const ctx = canvas.getContext("2d");

const images = {};
const IMAGE_LIST = [
  "Texture_TitleBackground.jpg",
  "Texture_BgVillage.jpg",
  "Texture_BgTunnel.jpg",
  "Texture_BgBlockhouse.jpg",
  "Texture_PortraitChuanbao.png",
  "Texture_PortraitLaozhong.png",
  "Texture_PortraitLinxia.png",
  "Texture_SocialPreview.jpg",
];

let state = CreateCampaignState(0);
let lastTs = 0;
let audioCtx = null;

function AssetUrl(name) {
  return `./${name}?v=${CACHE_BUST}`;
}

function LoadImages() {
  return Promise.all(
    IMAGE_LIST.map(
      (name) =>
        new Promise((resolve) => {
          const img = new Image();
          img.onload = () => {
            images[name] = img;
            resolve();
          };
          img.onerror = () => resolve();
          img.src = AssetUrl(name);
        }),
    ),
  );
}

function EnsureAudio() {
  if (audioCtx) return audioCtx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  audioCtx = new AC();
  return audioCtx;
}

function Beep(freq = 440, dur = 0.08, type = "square", gain = 0.03) {
  const ac = EnsureAudio();
  if (!ac) return;
  const o = ac.createOscillator();
  const g = ac.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.value = gain;
  o.connect(g);
  g.connect(ac.destination);
  o.start();
  g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + dur);
  o.stop(ac.currentTime + dur);
}

function Show(el, on) {
  if (!el) return;
  el.hidden = !on;
}

function SetModal(which) {
  const layer = $("ModalLayer");
  const map = {
    help: $("HelpModal"),
    history: $("HistoryModal"),
    pause: $("PauseModal"),
    fail: $("FailModal"),
  };
  const any = !!which;
  Show(layer, any);
  for (const [key, el] of Object.entries(map)) Show(el, which === key);
  state.pauseOpen = which === "pause";
}

function SyncTitle() {
  const progress = LoadFromStorage();
  const cont = $("ContinueButton");
  if (progress && progress.unlockedActs > 1) {
    Show(cont, true);
    cont.textContent = `继续 · 第 ${Math.min(progress.unlockedActs, CHAPTERS.length)} 幕附近`;
  } else {
    Show(cont, false);
  }
}

function SyncBriefing() {
  const chapter = CHAPTERS[state.chapterIndex];
  const beat = chapter.briefing[state.briefingIndex];
  $("BriefingKicker").textContent = `第${chapter.act}幕 · ${chapter.timeLabel}`;
  $("BriefingTitle").textContent = beat.title;
  $("BriefingBody").textContent = beat.body;
  $("BriefingPortrait").src = AssetUrl(chapter.portrait);
  $("BriefingPortrait").alt = chapter.title;
  const prog = $("BriefingProgress");
  prog.innerHTML = chapter.briefing.map((_, i) => `<i class="${i <= state.briefingIndex ? "on" : ""}"></i>`).join("");
}

function SyncOutro() {
  const chapter = CHAPTERS[state.chapterIndex];
  const beat = chapter.outro[state.outroIndex];
  $("OutroKicker").textContent = `第${chapter.act}幕 · 幕终`;
  $("OutroTitle").textContent = beat.title;
  $("OutroBody").textContent = beat.body;
  $("OutroPortrait").src = AssetUrl(chapter.portrait);
  const prog = $("OutroProgress");
  prog.innerHTML = chapter.outro.map((_, i) => `<i class="${i <= state.outroIndex ? "on" : ""}"></i>`).join("");
  $("OutroNextButton").querySelector("span").textContent =
    state.chapterIndex >= CHAPTERS.length - 1 && state.outroIndex >= chapter.outro.length - 1
      ? "终章"
      : "下一幕";
}

function GoalLabel(id) {
  const labels = {
    dig_links: "挖通地窖连线",
    talk_laozhong: "听取高老忠吩咐",
    open_hatch: "进入地道口",
    shelter_villagers: "护送乡亲入洞",
    ring_bell: "敲响村口警钟",
    survive_raid: "撑过夜袭这一拍",
    build_flip: "改建战斗翻口",
    expose_spy: "识破冒充特务",
    trap_spy: "用翻口制服特务",
    exit_shots: "从三处出击口开火",
    break_patrol: "打乱报复巡逻",
    keep_safe: "保全群众撤离窗口",
    dig_under: "挖到炮楼根基",
    plant_charge: "安放药室炸药",
    signal_assault: "发出总攻信号",
  };
  return labels[id] || id;
}

function SyncHud() {
  const chapter = CHAPTERS[state.chapterIndex];
  $("ChapterLabel").textContent = `第${chapter.act}幕`;
  $("ChapterTime").textContent = chapter.timeLabel;
  $("MissionTitle").textContent = chapter.title;
  $("ObjectiveText").textContent = chapter.objective;
  const list = $("GoalList");
  list.innerHTML = `<strong>本幕目标</strong>${Object.entries(state.goalsDone)
    .map(([id, done]) => `<li class="${done ? "done" : ""}">${done ? "✓" : "○"} ${GoalLabel(id)}</li>`)
    .join("")}`;

  const hp = $("HpRow");
  hp.innerHTML = [0, 1, 2].map((i) => `<i class="${i < state.player.hp ? "" : "off"}"></i>`).join("");

  if (state.subtitle) {
    Show($("SubtitlePanel"), true);
    $("SubtitleSpeaker").textContent = state.subtitle.speaker;
    $("SubtitleText").textContent = state.subtitle.text;
  } else {
    Show($("SubtitlePanel"), false);
  }

  if (state.interactHint) {
    Show($("InteractionPrompt"), true);
    $("InteractionLabel").textContent = state.interactHint;
    $("InteractKey").textContent = state.interactHint.includes("挖掘") ? "J" : "E";
  } else {
    Show($("InteractionPrompt"), false);
  }
}

function SyncPhaseUi() {
  const phase = state.phase;
  Show($("TitleScreen"), phase === "title");
  Show($("BriefingScreen"), phase === "briefing");
  Show($("OutroScreen"), phase === "outro");
  Show($("EndingScreen"), phase === "ending");
  Show($("GameHud"), phase === "play");
  if (phase === "briefing") SyncBriefing();
  if (phase === "outro") SyncOutro();
  if (phase === "play") SyncHud();
  if (phase === "title") SyncTitle();
  if (state.failed) SetModal("fail");
}

function BeginFrom(chapterIndex) {
  state = CreateCampaignState(chapterIndex, LoadFromStorage());
  state.phase = "briefing";
  state.briefingIndex = 0;
  SaveToStorage(state);
  SetModal(null);
  SyncPhaseUi();
  Beep(520, 0.06, "triangle", 0.04);
}

function Resize() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = canvas.clientWidth || window.innerWidth;
  const h = canvas.clientHeight || window.innerHeight;
  canvas.width = Math.floor(w * dpr);
  canvas.height = Math.floor(h * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function DrawSky(w, h, chapter) {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  if (chapter.layer === "tunnel") {
    g.addColorStop(0, "#2a2118");
    g.addColorStop(1, "#15110d");
  } else if (chapter.layer === "blockhouse") {
    g.addColorStop(0, "#1b2430");
    g.addColorStop(1, "#3a2a22");
  } else if (chapter.id === "act2_bell") {
    g.addColorStop(0, "#1a2230");
    g.addColorStop(1, "#3a2f28");
  } else {
    g.addColorStop(0, "#9eb4b8");
    g.addColorStop(0.55, "#d7c3a0");
    g.addColorStop(1, "#8a6b48");
  }
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

function DrawBackground(w, h, chapter, camX) {
  const key =
    chapter.layer === "tunnel"
      ? "Texture_BgTunnel.jpg"
      : chapter.layer === "blockhouse"
        ? "Texture_BgBlockhouse.jpg"
        : "Texture_BgVillage.jpg";
  const img = images[key];
  if (!img) return;
  const parallax = camX * 0.35;
  const scale = Math.max(w / img.width, h / img.height) * 1.05;
  const iw = img.width * scale;
  const ih = img.height * scale;
  ctx.globalAlpha = state.player.inTunnel && chapter.layer !== "tunnel" ? 0.25 : 0.55;
  ctx.drawImage(img, -parallax % iw, h - ih, iw, ih);
  ctx.drawImage(img, -parallax % iw + iw - 1, h - ih, iw, ih);
  ctx.globalAlpha = 1;
}

function WorldToScreen(x, y, camX, groundY, viewH) {
  const scale = viewH / 900;
  return {
    x: (x - camX) * scale,
    y: (y - 120) * scale,
    scale,
  };
}

function DrawDecor(level, camX, viewH, inTunnel) {
  for (const d of level.decor) {
    if (d.kind === "tunnel" && !inTunnel) continue;
    if (d.kind !== "tunnel" && inTunnel && d.kind !== "blockhouse") continue;
    const p = WorldToScreen(d.x, d.y, camX, level.surfaceFloor, viewH);
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.scale(p.scale, p.scale);
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#1c1712";
    if (d.kind === "house") {
      ctx.fillStyle = "#c4a27a";
      ctx.beginPath();
      ctx.moveTo(-50, 0);
      ctx.lineTo(-50, -70);
      ctx.lineTo(0, -105);
      ctx.lineTo(50, -70);
      ctx.lineTo(50, 0);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#6e2a1c";
      ctx.fillRect(-12, -40, 24, 40);
      ctx.strokeRect(-12, -40, 24, 40);
    } else if (d.kind === "tree") {
      ctx.fillStyle = "#5c4030";
      ctx.fillRect(-6, -90, 12, 90);
      ctx.fillStyle = "#5f6f4e";
      ctx.beginPath();
      ctx.arc(0, -110, 40, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    } else if (d.kind === "bell") {
      ctx.fillStyle = "#c9a45a";
      ctx.beginPath();
      ctx.moveTo(-16, -100);
      ctx.lineTo(16, -100);
      ctx.lineTo(22, -60);
      ctx.lineTo(0, -48);
      ctx.lineTo(-22, -60);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else if (d.kind === "well") {
      ctx.fillStyle = "#7a7264";
      ctx.fillRect(-18, -20, 36, 20);
      ctx.strokeRect(-18, -20, 36, 20);
    } else if (d.kind === "blockhouse") {
      ctx.fillStyle = "#5a5852";
      ctx.fillRect(-60, -140, 120, 140);
      ctx.fillStyle = "#3e3c38";
      ctx.fillRect(-40, -190, 80, 50);
      ctx.strokeRect(-60, -140, 120, 140);
      ctx.strokeRect(-40, -190, 80, 50);
      ctx.fillStyle = "#1c1712";
      ctx.fillRect(-12, -40, 24, 40);
    }
    ctx.restore();
  }
}

function DrawSolids(solids, camX, viewH, color) {
  for (const s of solids) {
    const p = WorldToScreen(s.x, s.y, camX, 0, viewH);
    ctx.fillStyle = color;
    ctx.strokeStyle = "#1c1712";
    ctx.lineWidth = 2;
    ctx.fillRect(p.x, p.y, s.w * p.scale, s.h * p.scale);
    ctx.strokeRect(p.x, p.y, s.w * p.scale, s.h * p.scale);
  }
}

function DrawEntity(ent, camX, viewH) {
  if (ent.hidden) return;
  const p = WorldToScreen(ent.x, ent.y, camX, 0, viewH);
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.scale(p.scale, p.scale);
  ctx.lineWidth = 3;
  ctx.strokeStyle = "#1c1712";

  const glow = () => {
    ctx.fillStyle = "rgba(201,164,90,.35)";
    ctx.beginPath();
    ctx.arc((ent.w || 20) / 2, -10, 22, 0, Math.PI * 2);
    ctx.fill();
  };

  if (ent.type === "talk" || ent.type === "spy_talk") {
    glow();
    ctx.fillStyle = ent.type === "spy_talk" ? "#6b7058" : "#4a5d4a";
    ctx.fillRect(0, -46, 28, 46);
    ctx.strokeRect(0, -46, 28, 46);
    ctx.fillStyle = "#e7d0b0";
    ctx.beginPath();
    ctx.arc(14, -56, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  } else if (ent.type === "shelter") {
    if (!ent.done) glow();
    ctx.fillStyle = ent.done ? "rgba(90,90,90,.4)" : "#c4a27a";
    ctx.fillRect(0, -40, 26, 40);
    ctx.strokeRect(0, -40, 26, 40);
  } else if (ent.type === "hatch") {
    glow();
    ctx.fillStyle = "#5c4030";
    ctx.fillRect(0, -8, 36, 10);
    ctx.strokeRect(0, -8, 36, 10);
  } else if (ent.type === "bell") {
    glow();
    ctx.fillStyle = ent.ringing ? "#f0c27a" : "#c9a45a";
    ctx.beginPath();
    ctx.moveTo(4, -90);
    ctx.lineTo(36, -90);
    ctx.lineTo(40, -50);
    ctx.lineTo(20, -38);
    ctx.lineTo(0, -50);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else if (ent.type === "flip_build" || ent.type === "flip_trap" || ent.type === "charge" || ent.type === "signal") {
    if (!ent.done) glow();
    ctx.fillStyle = ent.done ? "#7a7264" : "#a6452f";
    ctx.fillRect(0, -28, 40, 28);
    ctx.strokeRect(0, -28, 40, 28);
  } else if (ent.type === "shot_port") {
    if (!ent.cooled) glow();
    ctx.fillStyle = "#2f5d4a";
    ctx.fillRect(0, -24, 34, 24);
    ctx.strokeRect(0, -24, 34, 24);
  } else if (ent.type === "history") {
    if (!ent.done) glow();
    ctx.fillStyle = "#efe0c5";
    ctx.fillRect(0, -28, 24, 28);
    ctx.strokeRect(0, -28, 24, 28);
    ctx.fillStyle = "#a6452f";
    ctx.fillRect(4, -20, 16, 3);
  } else if (ent.type === "spy") {
    ctx.fillStyle = ent.trapped ? "#444" : "#5a4030";
    ctx.fillRect(0, -46, 28, 46);
    ctx.strokeRect(0, -46, 28, 46);
    ctx.fillStyle = "#e7d0b0";
    ctx.beginPath();
    ctx.arc(14, -56, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    if (ent.exposed && !ent.trapped) {
      ctx.fillStyle = "#a6452f";
      ctx.font = "bold 14px sans-serif";
      ctx.fillText("!", 10, -70);
    }
  } else if (ent.type === "patrol") {
    if (ent.broken) {
      ctx.globalAlpha = 0.35;
    }
    ctx.fillStyle = "#3e4638";
    ctx.fillRect(0, -46, 28, 46);
    ctx.strokeRect(0, -46, 28, 46);
    ctx.fillStyle = "#c9b89a";
    ctx.beginPath();
    ctx.arc(14, -56, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "rgba(155,47,47,.25)";
    ctx.beginPath();
    ctx.moveTo(14, -20);
    ctx.lineTo(90, -60);
    ctx.lineTo(90, 20);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

function DrawDigSpots(level, camX, viewH, inTunnel) {
  for (const dig of level.digSpots) {
    if (dig.done || dig.tunnel !== inTunnel) continue;
    const p = WorldToScreen(dig.x, dig.y, camX, 0, viewH);
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.scale(p.scale, p.scale);
    ctx.strokeStyle = "#c9a45a";
    ctx.lineWidth = 3;
    ctx.setLineDash([6, 4]);
    ctx.strokeRect(-20, -40, 40, 40);
    ctx.setLineDash([]);
    ctx.fillStyle = "rgba(201,164,90,.25)";
    ctx.fillRect(-20, -40, 40, 40);
    ctx.restore();
  }
}

function DrawPlayer(player, camX, viewH) {
  const h = player.crouching ? 34 : 46;
  const p = WorldToScreen(player.x, player.y, camX, 0, viewH);
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.scale(p.scale * player.facing, p.scale);
  if (player.invuln > 0 && Math.floor(player.invuln * 20) % 2 === 0) ctx.globalAlpha = 0.4;
  ctx.lineWidth = 3;
  ctx.strokeStyle = "#1c1712";
  ctx.fillStyle = "#4d6b57";
  ctx.fillRect(-14, -h, 28, h);
  ctx.strokeRect(-14, -h, 28, h);
  ctx.fillStyle = "#e7d0b0";
  ctx.beginPath();
  ctx.arc(0, -h - 10, 10, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  if (player.digging) {
    ctx.strokeStyle = "#8b6a45";
    ctx.beginPath();
    ctx.moveTo(14, -20);
    ctx.lineTo(34, -8);
    ctx.stroke();
    ctx.fillStyle = "#6e5a3a";
    ctx.fillRect(30, -12, 12, 10);
  }
  ctx.restore();
}

function DrawInkOutline() {
  // subtle vignette already in CSS; add comic panel corners
}

function Render() {
  const w = canvas.clientWidth || window.innerWidth;
  const h = canvas.clientHeight || window.innerHeight;
  const chapter = CHAPTERS[state.chapterIndex];
  DrawSky(w, h, chapter);

  if (state.phase === "play" || state.phase === "outro" || state.phase === "briefing") {
    const camX = state.cameraX || 0;
    DrawBackground(w, h, chapter, camX);
    if (state.phase === "play") {
      const level = state.level;
      const inTunnel = state.player.inTunnel;
      DrawDecor(level, camX, h, inTunnel);
      DrawSolids(inTunnel ? level.tunnelSolids : level.surfaceSolids, camX, h, inTunnel ? "#6a5138" : "#8a6b48");
      DrawDigSpots(level, camX, h, inTunnel);
      for (const ent of level.entities) {
        if (ent.requiresTunnel != null && !!inTunnel !== !!ent.requiresTunnel) {
          if (ent.type === "patrol" || ent.type === "spy") {
            // still draw surface actors when underground faintly? skip
          } else if (ent.type !== "patrol" && ent.type !== "spy") {
            continue;
          }
        }
        if ((ent.type === "patrol" || ent.type === "spy" || ent.type === "spy_talk" || ent.type === "shelter" || ent.type === "bell" || ent.type === "shot_port" || ent.type === "signal") && inTunnel) {
          if (ent.type !== "flip_trap" && ent.type !== "flip_build" && ent.type !== "charge" && ent.type !== "history") {
            // hide most surface props while underground
            if (!(ent.type === "spy" && ent.exposed)) continue;
          }
        }
        if ((ent.type === "flip_build" || ent.type === "flip_trap" || ent.type === "charge") && !inTunnel) continue;
        DrawEntity(ent, camX, h);
      }
      // always draw hatch on both layers
      for (const ent of level.entities) {
        if (ent.type === "hatch") DrawEntity(ent, camX, h);
      }
      DrawPlayer(state.player, camX, h);

      // dig progress bar
      if (state.player.digging) {
        const p = WorldToScreen(state.player.x, state.player.y - 70, camX, 0, h);
        ctx.fillStyle = "rgba(0,0,0,.45)";
        ctx.fillRect(p.x - 30, p.y, 60, 8);
        ctx.fillStyle = "#c9a45a";
        ctx.fillRect(p.x - 30, p.y, 60 * state.player.digProgress, 8);
      }

      // layer label
      ctx.fillStyle = "rgba(239,224,197,.85)";
      ctx.strokeStyle = "#1c1712";
      ctx.lineWidth = 2;
      const label = inTunnel ? "地道层" : "地面层";
      ctx.font = "600 14px IBM Plex Sans, sans-serif";
      ctx.fillText(label, 16, h - 24);
    }
  }

  DrawInkOutline();
}

function BindInput() {
  const setKey = (e, down) => {
    const input = state.input;
    const k = e.key.toLowerCase();
    if (["arrowleft", "a"].includes(k)) input.left = down;
    if (["arrowright", "d"].includes(k)) input.right = down;
    if (["arrowdown", "s"].includes(k)) input.crouch = down;
    if (["j", "shift"].includes(k)) input.dig = down;
    if (down && [" ", "w", "arrowup"].includes(k)) {
      input.jump = true;
      input.jumpPressed = true;
      e.preventDefault();
    }
    if (!down && [" ", "w", "arrowup"].includes(k)) input.jump = false;
    if (down && (k === "e" || k === "f" || k === "enter")) {
      input.interactPressed = true;
      if (state.phase === "briefing") {
        state = AdvanceBriefing(state);
        SaveToStorage(state);
        SyncPhaseUi();
        Beep(480, 0.05);
      } else if (state.phase === "outro") {
        state = AdvanceOutro(state);
        SaveToStorage(state);
        SyncPhaseUi();
        Beep(500, 0.05);
      }
    }
    if (down && k === "escape") {
      if (state.phase === "play") {
        if (state.pauseOpen) SetModal(null);
        else SetModal("pause");
      }
    }
  };
  window.addEventListener("keydown", (e) => setKey(e, true));
  window.addEventListener("keyup", (e) => setKey(e, false));

  for (const btn of document.querySelectorAll("[data-touch]")) {
    const kind = btn.getAttribute("data-touch");
    const on = (down) => {
      EnsureAudio();
      if (kind === "left") state.input.left = down;
      if (kind === "right") state.input.right = down;
      if (kind === "crouch") state.input.crouch = down;
      if (kind === "dig") state.input.dig = down;
      if (kind === "jump") {
        state.input.jump = down;
        if (down) state.input.jumpPressed = true;
      }
      if (kind === "interact" && down) {
        state.input.interactPressed = true;
      }
    };
    btn.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      btn.setPointerCapture(e.pointerId);
      on(true);
    });
    btn.addEventListener("pointerup", () => on(false));
    btn.addEventListener("pointercancel", () => on(false));
    btn.addEventListener("pointerleave", () => on(false));
  }
}

function BindUi() {
  $("BeginButton").addEventListener("click", () => {
    EnsureAudio();
    BeginFrom(0);
  });
  $("ContinueButton").addEventListener("click", () => {
    EnsureAudio();
    const progress = LoadFromStorage();
    const idx = Math.max(0, Math.min(CHAPTERS.length - 1, (progress?.unlockedActs || 1) - 1));
    BeginFrom(idx);
  });
  $("OpenHelpButton").addEventListener("click", () => SetModal("help"));
  $("CloseHelpButton").addEventListener("click", () => SetModal(null));
  $("OpenHistoryButton").addEventListener("click", () => SetModal("history"));
  $("CloseHistoryButton").addEventListener("click", () => SetModal(null));
  $("PauseButton").addEventListener("click", () => SetModal("pause"));
  $("ResumeButton").addEventListener("click", () => SetModal(null));
  $("RestartChapterButton").addEventListener("click", () => {
    state = RestartChapter(state);
    SetModal(null);
    SyncPhaseUi();
  });
  $("ExitTitleButton").addEventListener("click", () => {
    SaveToStorage(state);
    state.phase = "title";
    state.input = CreateInputState();
    SetModal(null);
    SyncPhaseUi();
  });
  $("FailRetryButton").addEventListener("click", () => {
    state = RestartChapter(state);
    SetModal(null);
    SyncPhaseUi();
  });
  $("BriefingNextButton").addEventListener("click", () => {
    EnsureAudio();
    state = AdvanceBriefing(state);
    SaveToStorage(state);
    SyncPhaseUi();
  });
  $("OutroNextButton").addEventListener("click", () => {
    EnsureAudio();
    state = AdvanceOutro(state);
    SaveToStorage(state);
    SyncPhaseUi();
  });
  $("ReplayButton").addEventListener("click", () => BeginFrom(0));
  $("EndingHomeButton").addEventListener("click", () => {
    state.phase = "title";
    SyncPhaseUi();
  });
}

let prevGoalSig = "";
let prevSubtitle = "";

function Frame(ts) {
  const dt = lastTs ? Math.min(0.05, (ts - lastTs) / 1000) : 0.016;
  lastTs = ts;

  if (state.phase === "play" && !state.pauseOpen && !state.failed) {
    const beforeFail = state.failed;
    StepPlay(state, dt);
    if (state.failed && !beforeFail) {
      Beep(120, 0.2, "sawtooth", 0.04);
      SetModal("fail");
    }
    const sig = JSON.stringify(state.goalsDone);
    if (sig !== prevGoalSig) {
      prevGoalSig = sig;
      Beep(660, 0.07, "triangle", 0.035);
      SaveToStorage(state);
    }
    if (state.completed) {
      SaveToStorage(state);
      SyncPhaseUi();
      Beep(784, 0.12, "triangle", 0.04);
    }
    if (state.subtitle?.text !== prevSubtitle) {
      prevSubtitle = state.subtitle?.text || "";
      if (state.subtitle) Beep(392, 0.04, "sine", 0.02);
    }
    SyncHud();
  }

  Render();
  requestAnimationFrame(Frame);
}

async function Main() {
  await LoadImages();
  Resize();
  window.addEventListener("resize", Resize);
  BindInput();
  BindUi();
  SyncPhaseUi();
  // warm history card lookup so bundlers keep export
  FindHistoryCard("card_tunnel_origin");
  requestAnimationFrame(Frame);
}

Main();

export { state as __debugState, BeginFrom as __debugBeginFrom };
