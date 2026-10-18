// 白盒关卡编辑器的预演播放器（docs/Data_EditorBlockout.md §14.2）。
//
// 每个关键帧可以挂一段预演（Blockout/<Level>.previz.json，规则在 Script_EditorBlockoutPrevizPlan）：
//   · 从关键帧的布设起播（总控先 GoTo 直接到位）；按 SamplePrevizActor 每帧驱动 BlockoutPuppets 的演员
//     （位置 / 朝向 / 姿态 / 可见 / 开场动作库的片段；spawn 的人临时加，播完回收）；
//   · 相机归预演：Script_Main 在玩家相机写完之后调 ApplyCamera(camera)（→ true = 这一帧接管了）；
//   · 台词：清单（voice）里的句子按需解码进声库（audio.LoadVoices），DialoguePlayer 一句一场地放
//     （挂在说话人头上，找不到人就从玩家头上放）；字幕是这里自己的 DOM（编辑器模式隐藏游戏字幕的规则不动）；
//     嘴：有口型轨（faceTracks，按 mp3 sha256）用口型轨，否则用这句干声的包络；按预演时间取样，Seek 也对得上；
//   · 事件：白光 / 黑场 / 说明字（确定性遮罩）、爆炸 / 烟 / 枪口火（VfxSystem）、震屏、场景信号（播完 / 中断按 then 的关键帧恢复）、
//     音效（§14.3 别名 → 现有音频库的键，表在下面 PREVIZ_SFX；找不到记进 State().missingSfx）。
//   · 播完 / 中断：交还演员与相机，按 then 跳关键帧（直接到位）。
//
// Seek(t) 暂停在 t 秒并确定性求值（演员、镜头、遮罩、字幕、嘴、信号、持续的烟；一次性的爆炸 / 枪口火 / 音效不补放），
// 同一 t 两次截图一样，供验收。Debug.Blockout.Previz：Has / Play / Stop / Seek / Resume / State（+ Reload）。
//
// 按键：PREVIZ_KEY 播 / 中断（§14.2 原定 V，但 V 在 KEYMAP 里是白刃，按 §4 不能占，10-18 改成 N）；Esc 中断。
// 编辑器自用的界面文字是中文（Script_Editor* 不进文本门禁）。

import * as THREE from "three";
import {
  ValidateBlockoutPreviz, NormalizeBlockoutPreviz, PrevizSequenceFor, PrevizSequenceDuration, SamplePrevizActor, SamplePrevizCamera,
  PrevizOverlays, PrevizShakeOffset, PrevizActiveLines, PrevizSignalsAt, PREVIZ_EYE_HEIGHT, PREVIZ_DEFAULTS,
} from "./Script_EditorBlockoutPrevizPlan.mjs";
import { KeyframeIndex } from "./Script_EditorBlockoutConfig.mjs";
import { TankGroundY } from "./Script_EditorBlockoutPuppets.mjs";
import { DialoguePlayer } from "./Script_DialoguePlayer.mjs";
import { SampleSpeechEnvelope } from "./Script_SpeechEnvelope.mjs";
import { LoadFaceTracks, SampleLineFaceTrack } from "./Script_FaceTrack.mjs";
import { SOUND_NAMES } from "./Script_Audio.mjs";

export const PREVIZ_KEY = "KeyN";
export const PREVIZ_KEY_LABEL = "N";
/** 没有预演文件时多久再查一次（有文件时跟配置一起每 2 s 查）。 */
export const PREVIZ_ABSENT_RECHECK_S = 30;

/**
 * §14.3 音效别名 → 现有音频库（Script_Audio RECIPES / 采样）的键。
 * burst：连发几响（interval 秒一响，jitter 时略错开，像一排人各打各的）；deafen：耳鸣（audio.Deafen 的秒数），不是一个声音键。
 */
export const PREVIZ_SFX = Object.freeze({
  artilleryFar: { cue: "explosionFar" },
  artilleryNear: { cue: "explosionNear" },
  shellBlast: { cue: "shellImpact" },
  tinnitus: { deafen: 2.6 },
  mgBurstFar: { cue: "type11Far", burst: 6, interval: 0.11 },
  mgBurstNear: { cue: "zb26", burst: 6, interval: 0.11 },
  rifleVolley: { cue: "rifleNra", burst: 5, interval: 0.07, jitter: true },
  rifleShot: { cue: "rifleHanYang" },
  mortarPop: { cue: "launcherPop" },
  mortarImpact: { cue: "explosionMid" },
  grenadeBlast: { cue: "explosionNear" },
  tankTracks: { cue: "tankTracks" },
  tankGun: { cue: "tankCannon" },
  dirtFall: { cue: "debrisFall" },
  slap: { cue: "slap" },
  stab: { cue: "bayonetStabBody" },
  bodyFall: { cue: "bodyFall" },
});
const SMOKE_KIND = Object.freeze({ SmokeDust: "dust", SmokeWhite: "screen", SmokeBlack: "black" });
const SMOKE_DEFAULT_S = 6;
const EXPLOSION_KINDS = new Set(["grenade", "launcher", "shell", "tank", "bomb"]);
const DEG = Math.PI / 180;
const VOICE_KEY_PREFIX = "blockoutPreviz.";

function Fmt(t) { return `${Math.max(0, t).toFixed(1)} s`; }

export class BlockoutPreviz {
  /** @param {import("./Script_EditorBlockout.mjs").EditorBlockout} editor */
  constructor(editor) {
    this.editor = editor;
    this.doc = null;          // 归一化后的预演
    this.text = null;         // 原文（轮询比对）
    this.levelKey = null;
    this.present = false;     // 这一关有没有预演文件
    this.lastCheckMs = 0;
    this.validation = null;
    this.voice = null;        // 台词清单
    this.voiceUrl = null;
    this.lines = new Map();   // 句子 id → 清单里的句子
    this.loadedVoices = new Set();
    this.faceTracksLoaded = new Set();
    this.pendingDoc = null;   // 播放中读到的新预演：播完再换
    this.run = null;          // 正在播的这一段
    this.missingClips = new Set();
    this.missingLines = new Set();
    this.missingSfx = new Set();
    this._v = new THREE.Vector3();
    this._d = new THREE.Vector3();
    this.dialogue = null;
    this.BuildDom();
  }

  get host() { return this.editor.host; }
  get game() { return this.editor.game; }
  get playing() { return !!this.run; }
  get paused() { return !!this.run?.paused; }

  // -------------------------------------------------------------------------
  // 读文件

  /**
   * 读当前关卡的预演（./Blockout/<key>.previz.json）。404 = 这关没有预演。
   * force：不管原文变没变都重新归一化（配置换了，核对要重做）。→ 是否有预演。
   */
  async Load({ force = false } = {}) {
    const levelKey = this.editor.levelKey;
    if (levelKey !== this.levelKey) { this.levelKey = levelKey; this.text = null; this.doc = null; this.present = false; force = true; }
    this.lastCheckMs = performance.now();
    let result;
    try { result = await this.editor.store.Load(`${levelKey}.previz`, { knownText: force ? undefined : this.text ?? undefined }); }
    catch (error) { return this.present; }
    if (levelKey !== this.editor.levelKey) return false;
    if (result.state === "same") return this.present;
    if (result.state === "missing") { this.Swap(null, null); return false; }
    if (result.state !== "ok") {
      // 写了一半 / 网络抖：留着上一份能用的
      this.validation = { ok: false, errors: [result.message], warnings: [] };
      this.text = result.text ?? this.text;
      this.editor.OnPrevizStatus?.();
      return this.present;
    }
    await this.LoadVoiceManifest(result.doc?.voice);
    const check = ValidateBlockoutPreviz(result.doc, { config: this.editor.doc, voice: this.voice });
    this.validation = check;
    if (!check.ok) console.warn(`[BlockoutPreviz] ${levelKey}.previz.json 有 ${check.errors.length} 处错误：`, check.errors.slice(0, 6));
    // 有错也照播能播的（坏的轨道在取样里被跳过），错误进状态
    this.Swap(NormalizeBlockoutPreviz(result.doc), result.text);
    return true;
  }

  Swap(doc, text) {
    if (this.run) { this.pendingDoc = { doc, text }; return; }
    this.doc = doc;
    this.text = text;
    this.present = !!doc;
    this.editor.OnPrevizStatus?.();
  }

  /** 每 2 s（有文件时）/ 每 30 s（没有时）由总控的轮询调。 */
  Poll({ configChanged = false } = {}) {
    if (this.loading) return;
    const due = this.present || configChanged || performance.now() - this.lastCheckMs >= PREVIZ_ABSENT_RECHECK_S * 1000;
    if (!due) return;
    this.loading = true;
    this.Load({ force: configChanged }).finally(() => { this.loading = false; });
  }

  async LoadVoiceManifest(url) {
    if (typeof url !== "string" || !url) { this.voice = null; this.voiceUrl = null; this.lines = new Map(); return; }
    if (url === this.voiceUrl && this.voice) return;
    try {
      const response = await fetch(`${url}${url.includes("?") ? "&" : "?"}t=${Date.now()}`, { cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      this.voice = await response.json();
      this.voiceUrl = url;
    } catch (error) {
      console.warn("[BlockoutPreviz] 台词清单读不到：", url, error?.message || error);
      this.voice = null; this.voiceUrl = url;
    }
    this.lines = new Map();
    for (const scene of this.voice?.scenes || []) for (const line of scene?.lines || []) if (line?.id) this.lines.set(line.id, line);
  }

  LineDuration(id) {
    const line = this.lines.get(id);
    return Number.isFinite(line?.durationS) ? line.durationS : null;
  }

  // -------------------------------------------------------------------------
  // 查询

  KeyframeId(idOrIndex) {
    const doc = this.editor.doc;
    if (!doc) return null;
    const index = idOrIndex === undefined ? this.editor.index : KeyframeIndex(doc, idOrIndex);
    return doc.keyframes[index]?.id ?? null;
  }

  Sequence(idOrIndex) {
    const id = this.KeyframeId(idOrIndex);
    return id && this.doc ? PrevizSequenceFor(this.doc, id) : null;
  }

  Has(idOrIndex) { return !!this.Sequence(idOrIndex); }

  Duration(seq) { return PrevizSequenceDuration(seq, { lineDuration: id => this.LineDuration(id) }); }

  // -------------------------------------------------------------------------
  // 播

  /** 播某个关键帧的预演（缺省当前关键帧）。→ Promise（播完或中断后 resolve：true = 播完）。 */
  async Play(idOrIndex) {
    const seq = this.Sequence(idOrIndex);
    if (!seq) return false;
    if (this.run) this.Stop({ restore: false });
    const editor = this.editor;
    const index = KeyframeIndex(editor.doc, seq.keyframe);
    const token = (this.token = (this.token || 0) + 1);
    let started;
    this.starting = new Promise(resolve => { started = resolve; });
    // 从关键帧的布设起播：直接到位（过渡中被打断也一样）
    await editor.GoTo(index, { animate: false });
    this.ShowLoading(seq);
    try { await this.Prepare(seq); } catch (error) { console.warn("[BlockoutPreviz] prepare failed", error); }
    this.HideLoading();
    if (token !== this.token || editor.index !== index) { started(false); return false; }
    const durationS = this.Duration(seq);
    const kf = editor.doc.keyframes[index];
    const run = this.run = {
      seq, index, kf, durationS, t: 0, prevT: -1e-6, paused: false, smoke: new Map(), signals: null,
      units: new Map(kf.units.map(u => [u.id, u])), actors: [], done: null, finished: false, speaking: new Map(),
    };
    run.promise = new Promise(resolve => { run.done = resolve; });
    for (const entry of seq.actors) {
      if (entry.spawn) {
        const spawn = { id: entry.id, side: "nra", kind: "soldier", stance: "stand", yawDeg: 0, aim: false, state: "alive", ...entry.spawn };
        if (spawn.weapon === undefined) spawn.weapon = spawn.side === "ija" ? "Type38" : spawn.side === "nra" ? "HanYang" : null;
        editor.puppets.Spawn(spawn, editor._cam);
        run.units.set(entry.id, spawn);
      }
      if (run.units.has(entry.id)) run.actors.push(entry);
    }
    this.dialogue = new DialoguePlayer({ audio: this.host.audio, Clock: () => this.host.audio?.ctx?.currentTime ?? null });
    editor.ReleasePointerLock();
    this.host.SetViewmodelVisible?.(false);
    document.body.classList.add("blockoutPreviz");
    editor.OnPrevizStart(run);
    this.Evaluate(0, { fire: true });
    started(true);
    return run.promise;
  }

  /** 播之前：句子解码进声库、口型轨、开场动作库（这一段用到片段时）。 */
  async Prepare(seq) {
    const audio = this.host.audio;
    const jobs = [this.editor.puppets.PrepareCasts(seq.actors.filter(a => a.spawn).map(a => a.spawn))];
    const entries = [];
    for (const l of seq.lines) {
      const line = this.lines.get(l.line);
      if (!line) { this.missingLines.add(l.line); continue; }
      if (!line.file || this.loadedVoices.has(line.id)) continue;
      entries.push({ key: VOICE_KEY_PREFIX + line.id, file: line.file, kind: "story", version: (line.sha256 || "").slice(0, 12) || "1", analyzeSpeech: true });
    }
    if (entries.length && audio?.LoadVoices) {
      jobs.push(audio.LoadVoices("", entries).then(() => {
        for (const e of entries) if (audio.voiceBank?.get(e.key)) this.loadedVoices.add(e.key.slice(VOICE_KEY_PREFIX.length));
      }).catch(() => {}));
    }
    const faceUrl = this.doc?.faceTracks;
    if (faceUrl && !this.faceTracksLoaded.has(faceUrl)) {
      this.faceTracksLoaded.add(faceUrl);
      jobs.push(LoadFaceTracks(new URL(faceUrl, location.href).href).catch(() => 0));
    }
    if (seq.actors.some(a => a.keys.some(k => typeof k.clip === "string")) && !this.opening) {
      jobs.push((async () => {
        const api = await import("./Script_OpeningStoryboardAnimation.mjs");
        const library = await api.LoadOpeningStoryboardAnimation();
        this.opening = { api, library };
        this.editor.puppets.SetOpeningLibrary(this.opening);
      })().catch(error => console.warn("[BlockoutPreviz] 开场动作库读不到，片段退回原生动画", error)));
    }
    await Promise.all(jobs);
  }

  /** 中断 / 播完。restore：按 then 跳关键帧（直接到位）。 */
  Stop({ restore = true, finished = false } = {}) {
    const run = this.run;
    this.token = (this.token || 0) + 1;
    this.HideLoading();
    if (!run) return false;
    this.run = null;
    this.dialogue?.StopAll();
    this.dialogue = null;
    for (const handle of run.smoke.values()) { try { this.host.vfx?.RemoveSmokeSource(handle); } catch (error) { /* 已回收 */ } }
    run.smoke.clear();
    this.editor.puppets.ReleaseDrive();
    this.editor.SetPrevizSignals(null);
    this.host.SetViewmodelVisible?.(true);
    document.body.classList.remove("blockoutPreviz");
    this.RenderOverlays({ flash: 0, black: 0, captions: [] }, []);
    this.editor.OnPrevizEnd(run);
    if (restore) {
      const then = run.seq.then;
      const count = this.editor.doc?.keyframes.length ?? 0;
      let target = run.index;
      if (then === "next") target = Math.min(count - 1, run.index + 1);
      else if (then !== "stay") { const i = KeyframeIndex(this.editor.doc, then); if (i >= 0) target = i; }
      this.editor.GoTo(target, { animate: false });
    }
    if (this.pendingDoc) { const { doc, text } = this.pendingDoc; this.pendingDoc = null; this.Swap(doc, text); }
    run.done?.(finished);
    return true;
  }

  /** 暂停在 t 秒并确定性求值（截图用）。没在播时先从当前关键帧开播。→ Promise<State>。 */
  async Seek(t) {
    if (!this.run) {
      if (!this.Has()) return this.State();
      this.starting = null;
      this.Play();
      await new Promise(resolve => { const wait = () => (this.starting ? this.starting.then(resolve) : setTimeout(wait, 10)); wait(); });
      if (!this.run) return this.State();
    }
    const run = this.run;
    run.paused = true;
    this.dialogue?.StopAll();
    run.t = Math.max(0, Math.min(run.durationS, Number(t) || 0));
    run.prevT = run.t;
    this.Evaluate(run.t, { fire: false, seek: true });
    return this.State();
  }

  Resume() {
    if (!this.run) return false;
    this.run.paused = false;
    return true;
  }

  Toggle() { if (this.run) this.Stop(); else if (this.Has()) this.Play(); }

  // -------------------------------------------------------------------------
  // 每帧

  Update(dt) {
    const run = this.run;
    if (!run) return;
    if (!run.paused) {
      const prev = run.t;
      run.t = Math.min(run.durationS, run.t + dt);
      run.prevT = prev;
      this.dialogue?.Update(dt);
      this.Evaluate(run.t, { fire: true, from: prev });
      if (run.t >= run.durationS) { this.Stop({ restore: true, finished: true }); return; }
    } else {
      // 暂停时演员照摆（相机、遮罩不变）
      this.DriveActors(run.t);
    }
    this.editor.OnPrevizProgress(run);
  }

  /** t 秒时的一切（fire：跨过的一次性事件要放；seek：动作层连推几步收敛）。 */
  Evaluate(t, { fire = false, from = -1e-6, seek = false } = {}) {
    const run = this.run;
    if (!run) return;
    this.DriveActors(t);
    // 信号：关键帧的 + 事件改过的
    const overrides = PrevizSignalsAt(run.seq, t);
    this.editor.SetPrevizSignals(overrides.size ? overrides : null);
    // 持续的烟：在窗口里就有，不在就收
    run.seq.events.forEach((e, i) => {
      if (e.type !== "smoke") return;
      const live = t >= e.t && t < e.t + (Number.isFinite(e.dur) ? e.dur : SMOKE_DEFAULT_S);
      const handle = run.smoke.get(i);
      if (live && handle == null && this.host.vfx?.SmokeSource) {
        const y = this.editor.standAt(e.x, e.z);
        run.smoke.set(i, this.host.vfx.SmokeSource({ x: e.x, y, z: e.z }, { kind: SMOKE_KIND[e.kind] || "dust" }));
      } else if (!live && handle != null) { try { this.host.vfx.RemoveSmokeSource(handle); } catch (error) { /* */ } run.smoke.delete(i); }
    });
    if (fire) for (const e of run.seq.events) if (e.t > from && e.t <= t) this.FireEvent(e);
    if (fire) for (const l of run.seq.lines) if (l.t > from && l.t <= t) this.StartLine(l);
    const lines = PrevizActiveLines(run.seq, t, id => this.LineDuration(id) ?? 2);
    this.BindMouths(lines);
    if (seek) this.editor.puppets.Settle(10, 0.05, this.editor._cam);
    this.RenderOverlays(PrevizOverlays(run.seq, t), lines);
  }

  ResolveUnit(id) {
    if (id === "player") { const p = this.game.player?.position; return p ? { x: p.x, z: p.z } : null; }
    const live = this.editor.puppets.Get(id);
    return live ? { x: live.x, z: live.z } : null;
  }

  DriveActors(t) {
    const run = this.run, puppets = this.editor.puppets;
    const opts = {
      resolve: (id) => this.ResolveUnit(id),
      clipDuration: (clip) => this.opening?.api.OpeningClipMeta(clip)?.duration ?? null,
    };
    for (const entry of run.actors) {
      const state = SamplePrevizActor(entry, t, run.units.get(entry.id), opts);
      if (state.clip && this.opening && !this.opening.api.OpeningClipMeta(state.clip)) this.missingClips.add(state.clip);
      if (run.speaking.get(entry.id)) state.talking = true;
      puppets.Drive(entry.id, state);
    }
    // 片段不在这具骨架上：开场动作库自己记一份（console 一次 + window.__openingMissingClips）
    if (this.opening) for (const key of this.opening.api.OpeningMissingClips?.() || []) this.missingClips.add(key);
  }

  // -------------------------------------------------------------------------
  // 台词与嘴

  /** 这句的说话人：写了 actor 用它；没写 = 当前关键帧里 castId 等于这句 who 的单位；找不到 = null（从玩家头上放、不动嘴）。 */
  SpeakerOf(l) {
    const run = this.run;
    if (l.actor && l.actor !== "player") return run.units.has(l.actor) ? l.actor : null;
    if (l.actor === "player") return null;
    const who = this.lines.get(l.line)?.who;
    if (!who) return null;
    for (const [id, unit] of run.units) if (unit.castId === who) return id;
    return null;
  }

  StartLine(l) {
    const line = this.lines.get(l.line);
    if (!line) { this.missingLines.add(l.line); return; }
    const speaker = this.SpeakerOf(l);
    const puppet = speaker ? this.editor.puppets.Get(speaker) : null;
    const actor = puppet?.humans?.[0]?.actor || null;
    const key = this.loadedVoices.has(line.id) ? VOICE_KEY_PREFIX + line.id : null;
    this.dialogue?.Play({ id: `previz:${l.line}:${l.t}`, lines: [{
      id: line.id, index: 0, who: line.who || "previz", key, duration: line.durationS || 2, speaker: line.speaker || "", text: line.subtitle ?? line.text ?? "",
      sha256: line.sha256, subtitle: false, direction: actor ? {} : { spatial: "self" },
    }] }, { speakers: actor ? { [line.who || "previz"]: { actor } } : {} });
  }

  /** 嘴：按预演时间取口型轨 / 包络（确定性，Seek 也对得上）。 */
  BindMouths(lines) {
    const run = this.run;
    const speaking = new Map();
    for (const active of lines) {
      const speaker = this.SpeakerOf({ line: active.line, actor: active.actor, t: active.start });
      if (!speaker) continue;
      const line = this.lines.get(active.line);
      if (!line) continue;
      if (run.t < active.end) speaking.set(speaker, { line, start: active.start });
    }
    run.speaking = speaking;
    for (const [id] of run.units) {
      const puppet = this.editor.puppets.Get(id);
      for (const human of puppet?.humans || []) {
        const facial = human.actor.characterRig?.facial;
        if (!facial) continue;
        if (!human.facialBound) {
          human.facialBound = true;
          facial.source = () => this.SpeechFor(id);
        }
      }
    }
  }

  SpeechFor(id) {
    const run = this.run;
    const hit = run?.speaking.get(id);
    if (!hit) return null;
    const seconds = run.t - hit.start;
    const base = { active: true, who: hit.line.who, lineId: hit.line.id, cue: `previz:${hit.line.id}`, line: hit.line.id, sourceTime: seconds };
    const track = SampleLineFaceTrack({ id: hit.line.id, sha256: hit.line.sha256 }, seconds);
    if (track) return { ...base, level: track.jaw ?? 0, brightness: track.wide ?? 0, ...track };
    const envelope = this.host.audio?.voiceBank?.get(VOICE_KEY_PREFIX + hit.line.id)?.speechEnvelope;
    const e = envelope ? SampleSpeechEnvelope(envelope, seconds) : { level: 0, brightness: 0 };
    return { ...base, level: e.level || 0, brightness: e.brightness || 0 };
  }

  // -------------------------------------------------------------------------
  // 事件

  FireEvent(e) {
    const vfx = this.host.vfx, audio = this.host.audio;
    try {
      if (e.type === "explosion" && vfx) {
        const y = this.editor.standAt(e.x, e.z);
        vfx.Explosion(new THREE.Vector3(e.x, y + 0.3, e.z), { radius: Number.isFinite(e.radius) ? e.radius : 6,
          kind: EXPLOSION_KINDS.has(e.kind) ? e.kind : "shell", groundY: y });
      } else if (e.type === "muzzle" && vfx) {
        const count = Number.isInteger(e.count) ? e.count : 1, interval = Number.isFinite(e.interval) ? e.interval : 0.12;
        for (let i = 0; i < count; i++) setTimeout(() => { if (this.run) this.Muzzle(e); }, i * interval * 1000);
      } else if (e.type === "sfx") this.PlaySfx(e);
    } catch (error) { console.warn("[BlockoutPreviz] event failed", e.type, error); }
  }

  Muzzle(e) {
    const vfx = this.host.vfx;
    const puppet = typeof e.actor === "string" ? this.editor.puppets.Get(e.actor) : null;
    const actor = puppet?.humans?.[0]?.actor;
    if (actor?.MuzzleWorld) {
      actor.MuzzleWorld(this._v);
      actor.MuzzleDirection?.(this._d);
      const mg = /Type11|Zb26|Type92/.test(actor.weaponId || "");
      vfx.MuzzleFlash(this._v, this._d, { kind: mg ? "lmg" : "boltRifle" });
      return;
    }
    const at = puppet ? { x: puppet.x, z: puppet.z } : { x: e.x, z: e.z };
    if (!Number.isFinite(at.x)) return;
    const yaw = (puppet?.yawDeg ?? 0) * DEG;
    this._v.set(at.x, this.editor.standAt(at.x, at.z) + (Number.isFinite(e.h) ? e.h : 1.3), at.z);
    this._d.set(-Math.sin(yaw), 0, -Math.cos(yaw));
    vfx.MuzzleFlash(this._v, this._d, { kind: "lmg" });
  }

  PlaySfx(e) {
    const audio = this.host.audio;
    const spec = PREVIZ_SFX[e.name];
    if (!spec) { this.missingSfx.add(e.name); return; }
    if (spec.deafen) { if (audio?.ctx) audio.Deafen?.(spec.deafen); return; }
    if (!SOUND_NAMES.includes(spec.cue)) { this.missingSfx.add(`${e.name}→${spec.cue}`); return; }
    if (!audio?.ctx) return;
    const position = Number.isFinite(e.x) && Number.isFinite(e.z) ? { x: e.x, y: this.editor.standAt(e.x, e.z) + 1, z: e.z } : null;
    const volume = Number.isFinite(e.volume) ? e.volume : 1;
    const n = spec.burst || 1;
    for (let i = 0; i < n; i++) {
      const delay = i * (spec.interval || 0) + (spec.jitter && i ? ((i * 0.618) % 1) * 0.05 : 0);
      audio.Play(spec.cue, { position, volume, delay });
    }
  }

  // -------------------------------------------------------------------------
  // 相机（Script_Main 在玩家相机写完之后调）

  ResolveAnchor(anchor) {
    const editor = this.editor, player = this.game.player;
    if (anchor.actor === "player" || anchor.actor === undefined && anchor.eye) {
      const p = player?.position || { x: 0, y: 0, z: 0 };
      const off = anchor.offset || [0, 0, 0];
      return { x: p.x + off[0], y: p.y + off[1], z: p.z + off[2], yawDeg: (player?.yaw || 0) / DEG, pitchDeg: (player?.pitch || 0) / DEG };
    }
    if (typeof anchor.actor === "string") {
      const puppet = editor.puppets.Get(anchor.actor);
      const off = anchor.offset || [0, 0, 0];
      if (!puppet) return { x: off[0], y: off[1], z: off[2] };
      const ground = puppet.unit?.kind === "tank" ? TankGroundY(editor.standAt, puppet.x, puppet.z, puppet.yawDeg) : editor.standAt(puppet.x, puppet.z);
      return { x: puppet.x + off[0], y: ground + off[1], z: puppet.z + off[2] };
    }
    return { x: anchor.x, y: editor.standAt(anchor.x, anchor.z) + (Number.isFinite(anchor.h) ? anchor.h : PREVIZ_DEFAULTS.pointH), z: anchor.z };
  }

  /** → 这一帧的机位 {position, yawDeg, pitchDeg, fov}（含震屏）；没有镜头轨时 null。 */
  CameraPose(t = this.run?.t ?? 0) {
    const run = this.run;
    if (!run) return null;
    const shot = SamplePrevizCamera(run.seq.camera, t, (a) => this.ResolveAnchor(a));
    if (!shot) return null;
    const shake = Math.max(shot.shake || 0, PrevizOverlays(run.seq, t).shake);
    const o = PrevizShakeOffset(shake, t);
    return { position: { x: shot.position.x + o.x, y: shot.position.y + o.y, z: shot.position.z + o.z },
      yawDeg: shot.yawDeg + o.yawDeg, pitchDeg: shot.pitchDeg + o.pitchDeg, fov: shot.fov, index: shot.index, eye: shot.eye };
  }

  ApplyCamera(camera) {
    if (!this.run || !camera) return false;
    const pose = this.CameraPose();
    if (!pose) return false;
    camera.position.set(pose.position.x, pose.position.y, pose.position.z);
    camera.rotation.order = "YXZ";
    camera.rotation.set(pose.pitchDeg * DEG, pose.yawDeg * DEG, 0);
    if (Math.abs(camera.fov - pose.fov) > 1e-3) { camera.fov = pose.fov; camera.updateProjectionMatrix(); }
    camera.updateMatrixWorld(true);
    this.lastCamera = pose;
    return true;
  }

  // -------------------------------------------------------------------------
  // DOM：遮罩、说明字、字幕、准备中

  BuildDom() {
    const root = this.editor.ui.root;
    this.elOverlay = document.createElement("div");
    this.elOverlay.className = "boPrevizOverlay";
    this.elBlack = document.createElement("i"); this.elBlack.className = "boPrevizBlack";
    this.elFlash = document.createElement("i"); this.elFlash.className = "boPrevizFlash";
    this.elOverlay.append(this.elBlack, this.elFlash);
    root.insertBefore(this.elOverlay, root.firstChild);
    this.elCaption = document.createElement("div"); this.elCaption.className = "boPrevizCaption"; this.elCaption.hidden = true;
    this.elSubs = document.createElement("div"); this.elSubs.className = "boPrevizSubs"; this.elSubs.hidden = true;
    root.append(this.elCaption, this.elSubs);
    this.subsKey = "";
  }

  RenderOverlays(o, lines) {
    this.elFlash.style.opacity = o.flash > 0.001 ? o.flash.toFixed(3) : "0";
    this.elBlack.style.opacity = o.black > 0.001 ? o.black.toFixed(3) : "0";
    const caption = (o.captions || []).join("　");
    if (caption !== this.captionText) { this.captionText = caption; this.elCaption.textContent = caption; this.elCaption.hidden = !caption; }
    const rows = lines.map(l => this.lines.get(l.line)).filter(Boolean);
    const key = rows.map(r => r.id).join("|");
    if (key === this.subsKey) return;
    this.subsKey = key;
    this.elSubs.replaceChildren(...rows.map((r, i) => {
      const row = document.createElement("div");
      row.className = `boPrevizSub${i < rows.length - 1 ? " aside" : ""}`;
      if (r.speaker) { const who = document.createElement("span"); who.className = "boPrevizWho"; who.textContent = r.speaker; row.append(who); }
      const text = document.createElement("span"); text.className = "boPrevizText"; text.textContent = r.subtitle ?? r.text ?? "";
      row.append(text);
      return row;
    }));
    this.elSubs.hidden = !rows.length;
  }

  ShowLoading(seq) { this.loadingSeq = seq; this.editor.ui.SetPrevizPlaying?.({ active: true, title: seq.title || seq.keyframe, t: 0, durationS: 0, loading: true }); }
  HideLoading() { if (!this.loadingSeq) return; this.loadingSeq = null; if (!this.run) this.editor.ui.SetPrevizPlaying?.({ active: false }); }

  // -------------------------------------------------------------------------
  // 取证

  State() {
    const run = this.run;
    const lines = run ? PrevizActiveLines(run.seq, run.t, id => this.LineDuration(id) ?? 2).map(l => l.line) : [];
    return {
      present: this.present, playing: !!run, paused: !!run?.paused, keyframe: run?.seq.keyframe ?? null, title: run?.seq.title ?? null,
      t: run ? +run.t.toFixed(3) : 0, durationS: run ? +run.durationS.toFixed(3) : 0, then: run?.seq.then ?? null,
      sequences: this.doc ? this.doc.sequences.map(s => s.keyframe) : [], lines, subtitles: this.elSubs.hidden ? [] : [...this.elSubs.querySelectorAll(".boPrevizText")].map(e => e.textContent),
      camera: this.lastCamera && run ? { ...this.lastCamera, position: { ...this.lastCamera.position } } : null,
      missingClips: [...this.missingClips], missingLines: [...this.missingLines], missingSfx: [...this.missingSfx],
      errors: this.validation?.errors?.slice(0, 20) ?? [], warnings: this.validation?.warnings?.length ?? 0,
      voices: this.loadedVoices.size,
    };
  }

  Dispose() {
    this.Stop({ restore: false });
    this.elOverlay.remove(); this.elCaption.remove(); this.elSubs.remove();
  }
}

export { Fmt as PrevizTimeText, PREVIZ_EYE_HEIGHT };
