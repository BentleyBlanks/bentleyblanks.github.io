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
//     2026-10-18 第三轮：默认白盒画质（特效关）把 VfxSystem 整棵藏掉，爆炸看不见 —— 这时由 Script_EditorBlockoutPrevizFx
//     在调试叠加层里另画一份简易爆炸（火光 + 土柱 / 烟尘 + 尘环，按 t 求值，Seek 也看得见）；演员键 throw 的手榴弹飞行
//     （抛物线 + 拖尾）也由它画，任何画质都画。游戏本身的爆炸表现不动。同一轮补了烟（smoke 事件）与枪口火（muzzle 事件），
//     同爆炸只在白盒特效关时画，Seek 也看得见。
//   · 播完 / 中断：交还演员与相机，按 then 跳关键帧（直接到位）。
//   · 2026-10-19：飞机（段里的 aircraft[]，Script_EditorBlockoutPrevizAircraft：借游戏机队的模型克隆、按 PrevizPlan 的纯函数取样摆位、
//     引擎声 MoveVoice 跟着机身、扫射的弹着点交给简易特效当土点画）与慢动作（段里的 slowmo[]：预演时钟按 PrevizTimeScale 走，
//     人物、片段、特效、飞机、镜头都按预演时间 t 求值所以一起慢；台词照常速；音效照常；进度条按预演时间）。
//
//   · 2026-10-20：音效别名可以直接指一个音频文件（PREVIZ_SFX 里写 { url }，如 babyCry → Audio/BlockoutPreviz/Sfx_BabyCry.mp3）：
//     Prepare 时按这一段用到的别名把文件解码进游戏音频引擎的声库（audio.LoadVoices，键 blockoutPrevizSfx.<别名>），
//     放的时候走 audio.Play("voice.blockoutPrevizSfx.<别名>")，所以照样按事件的 x / z 定位、volume 起作用；
//     文件读不到只警告一次、记进 State().missingSfx（别名→url），预演照常播。
//
//   · 2026-10-21：能转头不能走（镜头 eye.free，§14.1）：眼睛钉在写的位置、默认视线照写的放；玩家一动鼠标或按方向键
//     （← → ↑ ↓），这一段 free 眼睛剩下的时间视线归玩家（WASD 本来就不起作用），下一条不一样的镜头开始时收回；
//     Seek / 没人碰鼠标时就是默认视线（确定性，截图、测试都按它）。鼠标走这里自己挂的 mousemove（Script_Main 那条链在预演中
//     把位移扔了，不抢指针锁）。Debug.Blockout.Previz.Look(dx, dy) 给测试喂位移；State().freeLook 报现在能不能转、转到哪了。
//
// Seek(t) 暂停在 t 秒并确定性求值（演员、镜头、遮罩、字幕、嘴、信号、持续的烟；一次性的爆炸 / 枪口火 / 音效不补放），
// 同一 t 两次截图一样，供验收。Debug.Blockout.Previz：Has / Play / Stop / Seek / Resume / State（+ Reload）。
//
// 按键：PREVIZ_KEY 播 / 中断（§14.2 原定 V，但 V 在 KEYMAP 里是白刃，按 §4 不能占，10-18 改成 N）；Esc 中断。
// 编辑器自用的界面文字是中文（Script_Editor* 不进文本门禁）。

import * as THREE from "three";
import {
  ValidateBlockoutPreviz, NormalizeBlockoutPreviz, PrevizSequenceFor, PrevizSequenceDuration, SamplePrevizActor, SamplePrevizCamera,
  PrevizOverlays, PrevizShakeOffset, PrevizActiveLines, PrevizSignalsAt, PREVIZ_EYE_HEIGHT, PREVIZ_DEFAULTS, PrevizTimeScale, PrevizWallTime,
  PREVIZ_FREE_LOOK, PrevizFreeLookSegment, WrapDeg,
} from "./Script_EditorBlockoutPrevizPlan.mjs";
import { BlockoutPrevizAircraft } from "./Script_EditorBlockoutPrevizAircraft.mjs";
import { KeyframeIndex } from "./Script_EditorBlockoutConfig.mjs";
import { TankGroundY } from "./Script_EditorBlockoutPuppets.mjs";
import { DialoguePlayer } from "./Script_DialoguePlayer.mjs";
import { SampleSpeechEnvelope } from "./Script_SpeechEnvelope.mjs";
import { LoadFaceTracks, SampleLineFaceTrack } from "./Script_FaceTrack.mjs";
import { SOUND_NAMES } from "./Script_Audio.mjs";
import { BlockoutPrevizFx } from "./Script_EditorBlockoutPrevizFx.mjs";
import { BLOCKOUT_PREVIZ_CLIP_LIBRARIES, PREVIZ_WEAPON_SLUNG } from "./Data_BlockoutPrevizClips.mjs";

export const PREVIZ_KEY = "KeyN";
export const PREVIZ_KEY_LABEL = "N";
/** 没有预演文件时多久再查一次（有文件时跟配置一起每 2 s 查）。 */
export const PREVIZ_ABSENT_RECHECK_S = 30;

/**
 * §14.3 音效别名 → 现有音频库（Script_Audio RECIPES / 采样）的键，或（2026-10-20）直接一个音频文件 { url }。
 * burst：连发几响（interval 秒一响，jitter 时略错开，像一排人各打各的）；deafen：耳鸣（audio.Deafen 的秒数），不是一个声音键。
 * url：相对页面的音频文件地址（Audio/BlockoutPreviz/ 下，代理 S 产的占位音效）；Prepare 时解码进声库，放的时候同样按 x / z 定位。
 * 两张表（这里与 Script_EditorBlockoutPrevizPlan.PREVIZ_SFX_ALIASES）要一致（PrevizPlanTest 核对）。
 */
/** url 音效文件的缓存戳（文件重做了就抬）。 */
export const PREVIZ_SFX_URL_VERSION = "20261020010000";
const URL_CUE_PREFIX = "blockoutPrevizSfx.";
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
  // 2026-10-19（12–18 空袭）：飞机远远嗡嗡、俯冲下来、扫射一串打在土里
  planeDrone: { cue: "planeDrone" },
  planeDive: { cue: "planeDive" },
  strafeNear: { cue: "strafeNear" },
  strafeFar: { cue: "strafeFar" },
  strafeDirt: { cue: "strafeDirt" },
  // 2026-10-20（06–10 耿家庄）：婴儿哭、窖里压着嗓子的哭、枪托砸门、陶罐摔碎 —— 直接放文件
  babyCry: { url: "./Audio/BlockoutPreviz/Sfx_BabyCry.mp3" },
  cellarSob: { url: "./Audio/BlockoutPreviz/Sfx_CellarSob.mp3" },
  gateSmash: { url: "./Audio/BlockoutPreviz/Sfx_GateSmash.mp3" },
  jarShatter: { url: "./Audio/BlockoutPreviz/Sfx_JarShatter.mp3" },
});
const SMOKE_KIND = Object.freeze({ SmokeDust: "dust", SmokeWhite: "screen", SmokeBlack: "black" });
const SMOKE_DEFAULT_S = 6;
const EXPLOSION_KINDS = new Set(["grenade", "launcher", "shell", "tank", "bomb"]);
const DEG = Math.PI / 180;
const VOICE_KEY_PREFIX = "blockoutPreviz.";
/** 能转头不能走的看键（2026-10-21）：方向键，按住按 PREVIZ_FREE_LOOK.keyDegPerS 转。 */
const FREE_LOOK_KEYS = Object.freeze({ ArrowLeft: [1, 0], ArrowRight: [-1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] });

function Fmt(t) { return `${Math.max(0, t).toFixed(1)} s`; }

export class BlockoutPreviz {
  /** @param {import("./Script_EditorBlockout.mjs").EditorBlockout} editor */
  constructor(editor) {
    this.editor = editor;
    // 镜头：缺省切镜（运镜直接切到落幅，§14.2）；?previzCamera=move 看照写的运镜
    this.cameraMode = editor.params?.get?.("previzCamera") === "move" ? "move" : "cut";
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
    this.urlCues = new Map();     // 别名 → { state: "loading" | "ok" | "failed" | "noAudio", key, promise }（2026-10-20 url 音效）
    this.urlSfxPlayed = 0;
    this._v = new THREE.Vector3();
    this._d = new THREE.Vector3();
    this.dialogue = null;
    this.fx = null;
    try { this.fx = new BlockoutPrevizFx({ post: editor.host.post, scene: editor.host.scene }); }
    catch (error) { console.warn("[BlockoutPreviz] 简易爆炸层建不起来", error); }
    // 飞机（2026-10-19）：模型借游戏机队，声音走 PREVIZ_SFX 别名表（planeDrone 是持续声，起一条 voice 逐帧搬）
    this.air = null;
    try {
      this.air = new BlockoutPrevizAircraft({
        scene: editor.host.scene, aircraft: () => this.host.aircraft,
        sfx: {
          Play: (name, at) => this.PlayCue(name, at ? this.CuePosition(at) : null, 1),
          StartLoop: (name, at) => this.StartLoopCue(name, this.CuePosition(at)),
          MoveLoop: (voice, at, velocity) => { this.host.audio?.MoveVoice?.(voice, this.CuePosition(at), { velocity }); },
          StopLoop: (voice) => { this.host.audio?.StopVoice?.(voice, 1.0); },
        },
      });
    } catch (error) { console.warn("[BlockoutPreviz] 飞机层建不起来", error); }
    // 能转头不能走（2026-10-21，§14.1 eye.free）：segment = 现在这一段 free 眼睛的第一条镜头下标（-1 = 不在 free 眼睛里）；
    // active = 玩家已经接手；yawDeg / pitchDeg = 玩家转到的视线；defaultYaw / defaultPitch = 这一帧的默认视线（接手那一刻从它起算）
    this.freeLook = { segment: -1, active: false, yawDeg: 0, pitchDeg: 0, defaultYaw: 0, defaultPitch: 0, keys: new Set(), nudges: 0 };
    this.BindFreeLook();
    this.BuildDom();
  }

  // -------------------------------------------------------------------------
  // 能转头不能走（2026-10-21）

  BindFreeLook() {
    this.onFreeMouse = (event) => {
      if (!this.FreeLookAvailable()) return;
      const dx = event.movementX || 0, dy = event.movementY || 0;
      if (Math.abs(dx) > 400 || Math.abs(dy) > 400) return;   // 浏览器偶发的上千像素假位移（同 Script_Main 的尖刺闸门）
      this.Look(dx, dy);
    };
    this.onFreeKeyDown = (event) => {
      if (!FREE_LOOK_KEYS[event.code] || event.ctrlKey || event.metaKey || event.altKey) return;
      if (!this.FreeLookAvailable()) return;
      event.preventDefault();
      this.freeLook.keys.add(event.code);
    };
    this.onFreeKeyUp = (event) => { this.freeLook.keys.delete(event.code); };
    this.onFreeBlur = () => { this.freeLook.keys.clear(); };
    document.addEventListener("mousemove", this.onFreeMouse);
    document.addEventListener("keydown", this.onFreeKeyDown);
    document.addEventListener("keyup", this.onFreeKeyUp);
    window.addEventListener("blur", this.onFreeBlur);
  }

  UnbindFreeLook() {
    document.removeEventListener("mousemove", this.onFreeMouse);
    document.removeEventListener("keydown", this.onFreeKeyDown);
    document.removeEventListener("keyup", this.onFreeKeyUp);
    window.removeEventListener("blur", this.onFreeBlur);
  }

  /** 这一帧的镜头是不是能转头的眼睛（正在播、没暂停、当前镜头写了 eye.free）。 */
  FreeLookAvailable() { return !!this.run && !this.run.paused && this.lastCamera?.free === true; }

  /** 玩家转头（像素位移：右 +dx、下 +dy；方向键也换算成像素喂进来）。第一次接手从这一帧的默认视线起算。 */
  Look(dx, dy) {
    if (!this.FreeLookAvailable()) return false;
    const fl = this.freeLook;
    if (!fl.active) { fl.active = true; fl.yawDeg = fl.defaultYaw; fl.pitchDeg = fl.defaultPitch; }
    fl.yawDeg = WrapDeg(fl.yawDeg - dx * PREVIZ_FREE_LOOK.degPerPx);
    fl.pitchDeg = Math.max(-PREVIZ_FREE_LOOK.pitchMaxDeg, Math.min(PREVIZ_FREE_LOOK.pitchMaxDeg, fl.pitchDeg - dy * PREVIZ_FREE_LOOK.degPerPx));
    fl.nudges += 1;
    return true;
  }

  /** 收回（新一段开播、中断、Seek、离开 free 眼睛）。 */
  ResetFreeLook() { const fl = this.freeLook; fl.segment = -1; fl.active = false; fl.nudges = 0; }

  /** 每帧：按住的方向键按角速度转；镜头换了一段就收回（在 ApplyCamera 里按 PrevizFreeLookSegment 判断）。 */
  UpdateFreeLook(dt) {
    const fl = this.freeLook;
    if (!fl.keys.size || !this.FreeLookAvailable()) return;
    let kx = 0, ky = 0;
    for (const code of fl.keys) { const [x, y] = FREE_LOOK_KEYS[code] || [0, 0]; kx += x; ky += y; }
    if (!kx && !ky) return;
    const px = PREVIZ_FREE_LOOK.keyDegPerS * dt / PREVIZ_FREE_LOOK.degPerPx;
    this.Look(-kx * px, -ky * px);
  }

  /** 音效位置：{x,y,z} 直接用；{x,z,ground:true} = 地面 + 0.2（弹着点）；{x,z} = 地面 + 1。 */
  CuePosition(at) {
    if (!at || !Number.isFinite(at.x) || !Number.isFinite(at.z)) return null;
    if (Number.isFinite(at.y) && !at.ground) return { x: at.x, y: at.y, z: at.z };
    return { x: at.x, y: this.editor.standAt(at.x, at.z) + (at.ground ? 0.2 : 1), z: at.z };
  }

  /** 预演时钟此刻走多快（慢动作里 < 1）；没在播 = 1。演员层按它缩 dt（Script_EditorBlockout.Update）。 */
  TimeScale() { return this.run ? PrevizTimeScale(this.run.seq, this.run.t) : 1; }

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
    if (!this.openingLoading && !this.opening) this.EnsureOpening();
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
      timeScale: 1, wallT: 0,
    };
    run.promise = new Promise(resolve => { run.done = resolve; });
    this.air?.Begin(seq);
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
    this.ResetFreeLook();
    this.lastCamera = null;
    editor.ReleasePointerLock();
    this.host.SetViewmodelVisible?.(false);
    document.body.classList.add("blockoutPreviz");
    editor.OnPrevizStart(run);
    this.Evaluate(0, { fire: true });
    started(true);
    return run.promise;
  }

  /**
   * 开场库读完之后：按 Data_BlockoutPrevizClips 逐个读预演用的动作库（清单 + TengxianNra02 那份记录），
   * 用 AddOpeningClipLibrary 并进开场库（骨名一致的每具骨架都并）。某个库读不到（还没烘出来，404）就跳过，只警告一次；
   * 预演照常播，那些片段退回原生动画（missingClips 照常记）。
   */
  async LoadExtraClipLibraries(api) {
    if (typeof api?.AddOpeningClipLibrary !== "function") return;
    this.clipLibrariesWarned ||= new Set();
    // 2026-10-19：片段自带的掷弹筒 / 弹 / 手榴弹捆道具轨要有网格（开场道具层只认识开场那几样）
    let previzProps = null;
    try {
      const [props, mod] = await Promise.all([import("./Script_OpeningProps.mjs"), import("./Script_EditorBlockoutPrevizProps.mjs")]);
      previzProps = mod;
      previzProps.RegisterPrevizProps(props.RegisterOpeningProp);
    } catch (error) { console.warn("[BlockoutPreviz] 预演道具网格登记失败", error); }
    const Read = async (url) => {
      const response = await fetch(url);
      if (!response.ok) throw Error(`${response.status}`);
      return response.json();
    };
    const Warn = (name, why) => {
      if (this.clipLibrariesWarned.has(name)) return;
      this.clipLibrariesWarned.add(name);
      console.warn(`[BlockoutPreviz] 动作库 ${name} 读不到（${why}），它的片段退回原生动画`);
    };
    // 并行下载，按表的顺序并库：同名片段表里靠前的赢（2026-10-20 起 PrevizKimodo 排第一，顶掉手 K 的同名片段；
    // 生成器 PrevizClipMeta 与各 PrevizTest 读清单也是表里靠前的赢）
    const loaded = await Promise.all(BLOCKOUT_PREVIZ_CLIP_LIBRARIES.map(async (lib) => {
      try {
        const v = `?v=${encodeURIComponent(lib.version)}`;
        const config = await Read(lib.base + lib.manifest + v);
        const row = (config.models || []).find(m => m.id === "TengxianNra02") || config.models?.[0];
        if (!row?.file) throw Error("清单里没有骨架记录");
        return { config, record: await Read(lib.base + row.file + v) };
      } catch (error) { Warn(lib.name, String(error?.message || error).slice(0, 120)); return null; }
    }));
    for (const lib of loaded) {
      if (!lib) continue;
      api.AddOpeningClipLibrary(lib.config, lib.record, { weaponSlung: PREVIZ_WEAPON_SLUNG });
      previzProps?.SetPrevizPropScales?.(lib.config.props);   // 清单 props.<名>.scale（掷弹筒按真实全长放大 1.4699）
    }
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
    // 2026-10-20：这一段用到的 url 音效先解码进声库（读不到只警告一次）
    jobs.push(this.LoadUrlCues(seq.events.filter(e => e.type === "sfx" && PREVIZ_SFX[e.name]?.url).map(e => e.name)));
    const faceUrl = this.doc?.faceTracks;
    if (faceUrl && !this.faceTracksLoaded.has(faceUrl)) {
      this.faceTracksLoaded.add(faceUrl);
      jobs.push(LoadFaceTracks(new URL(faceUrl, location.href).href).catch(() => 0));
    }
    if (seq.actors.some(a => a.keys.some(k => typeof k.clip === "string"))) jobs.push(this.EnsureOpening());
    await Promise.all(jobs);
  }

  /**
   * 开场动作库 + 预演额外动作库（只下一次，交给演员层）。2026-10-20 起编辑器一开就在后台下：关键帧里拿步枪、
   * 不戒备、蹲着不动的兵要播歇着的片段（Script_EditorBlockoutPuppets._RestDrive），不等第一次播预演。读不到只警告。
   */
  EnsureOpening() {
    if (this.opening) return Promise.resolve(this.opening);
    return this.openingLoading ||= (async () => {
      const api = await import("./Script_OpeningStoryboardAnimation.mjs");
      const library = await api.LoadOpeningStoryboardAnimation();
      await this.LoadExtraClipLibraries(api);
      this.opening = { api, library };
      this.editor.puppets.SetOpeningLibrary(this.opening);
      return this.opening;
    })().catch(error => { this.openingLoading = null; console.warn("[BlockoutPreviz] 开场动作库读不到，片段退回原生动画", error); return null; });
  }

  /** 中断 / 播完。restore：按 then 跳关键帧（直接到位）。 */
  Stop({ restore = true, finished = false } = {}) {
    const run = this.run;
    this.token = (this.token || 0) + 1;
    this.HideLoading();
    if (!run) return false;
    this.run = null;
    this.ResetFreeLook();
    this.dialogue?.StopAll();
    this.dialogue = null;
    for (const handle of run.smoke.values()) { try { this.host.vfx?.RemoveSmokeSource(handle); } catch (error) { /* 已回收 */ } }
    run.smoke.clear();
    this.editor.puppets.ReleaseDrive();
    this.fx?.Clear();
    this.air?.Clear();
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
    this.ResetFreeLook();   // Seek 按默认视线求值（确定性）
    this.dialogue?.StopAll();
    run.t = Math.max(0, Math.min(run.durationS, Number(t) || 0));
    run.prevT = run.t;
    run.wallT = PrevizWallTime(run.seq, run.t);
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
      // 慢动作：预演时钟按这一刻的倍率走（人物 / 片段 / 特效 / 飞机 / 镜头都按预演时间求值，一起慢）；台词照常速
      const scale = PrevizTimeScale(run.seq, run.t);
      run.timeScale = scale;
      run.t = Math.min(run.durationS, run.t + dt * scale);
      run.wallT += dt;
      run.prevT = prev;
      this.dialogue?.Update(dt);
      this.UpdateFreeLook(dt);
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
    // 飞机：摆位 + 引擎声跟着走 + 跨过的一次性声音（Seek 不放）
    try { this.air?.Update(t, { fire, from, groundAt: this.editor.standAt, listener: this.editor._cam }); }
    catch (error) { console.warn("[BlockoutPreviz] aircraft failed", error); }
    this.UpdateFx(t);
    this.RenderOverlays(PrevizOverlays(run.seq, t), lines);
  }

  /** 简易爆炸（白盒特效关时）与飞行中的手榴弹：按 t 求值。飞机扫射的弹着点也从这里当土点画。 */
  UpdateFx(t) {
    const run = this.run;
    if (!this.fx || !run) return;
    try {
      this.fx.Update(run.seq, t, {
        standAt: this.editor.standAt, baseOf: (id) => run.units.get(id),
        drawBlasts: BlockoutPrevizFx.BlastsHidden(this.host.post),
        actorOpts: { resolve: (id) => this.ResolveUnit(id), clipDuration: (clip) => this.ClipDuration(clip) },
        muzzleAt: (e) => this.MuzzleAt(e),
        extraBlasts: this.air?.Blasts() || null,
      });
    } catch (error) { console.warn("[BlockoutPreviz] fx failed", error); }
  }

  /**
   * 片段时长给 SamplePrevizActor（过了时长：clipHold 停在末帧，否则清掉回原生动画）。循环片段（清单 loop: true）
   * 返回 null = 一直循环到下一个 clip 键（说话、包扎这类循环片段常常要放得比一轮长）。
   * 带停住段的不循环片段（holdLoop，如 PvStandPointL）照旧按时长：要停住就写 clipHold。
   */
  ClipDuration(clip) {
    const meta = this.opening?.api.OpeningClipMeta(clip);
    if (!meta || meta.loop === true) return null;
    return meta.duration ?? null;
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
      clipDuration: (clip) => this.ClipDuration(clip),
    };
    for (const entry of run.actors) {
      const state = SamplePrevizActor(entry, t, run.units.get(entry.id), opts);
      if (state.clip && this.opening && !this.opening.api.OpeningClipMeta(state.clip)) this.missingClips.add(state.clip);
      if (run.speaking.get(entry.id)) state.talking = true;
      puppets.Drive(entry.id, state);
    }
    // 片段不在这具骨架上：开场动作库自己记一份（console 一次 + window.__openingMissingClips）
    if (this.opening) for (const key of this.opening.api.OpeningMissingClips?.() || []) this.missingClips.add(key);
    for (const key of puppets.missingClips || []) this.missingClips.add(key);
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
        // h（2026-10-18 第三轮，可选）：爆点离地高（炸在车尾铁板上这种）；缺省 0.3 同原来
        const lift = Number.isFinite(e.h) ? e.h : 0.3;
        vfx.Explosion(new THREE.Vector3(e.x, y + lift, e.z), { radius: Number.isFinite(e.radius) ? e.radius : 6,
          kind: EXPLOSION_KINDS.has(e.kind) ? e.kind : "shell", groundY: y });
      } else if (e.type === "muzzle" && vfx) {
        const count = Number.isInteger(e.count) ? e.count : 1, interval = Number.isFinite(e.interval) ? e.interval : 0.12;
        for (let i = 0; i < count; i++) setTimeout(() => { if (this.run) this.Muzzle(e); }, i * interval * 1000);
      } else if (e.type === "sfx") this.PlaySfx(e);
    } catch (error) { console.warn("[BlockoutPreviz] event failed", e.type, error); }
  }

  /** 枪口火的世界位置（简易枪口火用）：演员枪口 → 演员身上 + h → 事件点；找不到 null。 */
  MuzzleAt(e) {
    if (e.actor === "player") return null;   // 顺子自己开枪：镜头就在枪后头，不画
    const puppet = typeof e.actor === "string" ? this.editor.puppets.Get(e.actor) : null;
    const actor = puppet?.humans?.[0]?.actor;
    if (actor?.MuzzleWorld && puppet.visible !== false) { actor.MuzzleWorld(this._v); return { x: this._v.x, y: this._v.y, z: this._v.z }; }
    const at = puppet ? { x: puppet.x, z: puppet.z } : { x: e.x, z: e.z };
    if (!Number.isFinite(at.x) || !Number.isFinite(at.z)) return null;
    return { x: at.x, y: this.editor.standAt(at.x, at.z) + (Number.isFinite(e.h) ? e.h : 1.3), z: at.z };
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
    const position = Number.isFinite(e.x) && Number.isFinite(e.z) ? { x: e.x, y: this.editor.standAt(e.x, e.z) + 1, z: e.z } : null;
    this.PlayCue(e.name, position, Number.isFinite(e.volume) ? e.volume : 1);
  }

  /**
   * url 音效（PREVIZ_SFX 里写 { url } 的别名）：把文件解码进游戏音频引擎的声库（audio.LoadVoices，键 blockoutPrevizSfx.<别名>）。
   * 每个别名只装一次；读不到 / 解不开只警告一次并记进 missingSfx（别名→url）。没有音频上下文（audio=0）记 noAudio、不报。→ Promise
   */
  async LoadUrlCues(names) {
    const audio = this.host.audio;
    const jobs = [];
    for (const name of new Set(names || [])) {
      const spec = PREVIZ_SFX[name];
      if (!spec?.url || this.urlCues.has(name)) continue;
      const key = URL_CUE_PREFIX + name;
      if (!audio?.ctx || typeof audio.LoadVoices !== "function") { this.urlCues.set(name, { state: "noAudio", key, promise: Promise.resolve() }); continue; }
      const entry = { state: "loading", key, promise: null };
      entry.promise = audio.LoadVoices("", [{ key, file: spec.url, kind: "story", version: PREVIZ_SFX_URL_VERSION }]).then(() => {
        if (audio.voiceBank?.get(key)) { entry.state = "ok"; return; }
        entry.state = "failed";
        this.missingSfx.add(`${name}→${spec.url}`);
        console.warn(`[BlockoutPreviz] 音效文件读不到：${name} → ${spec.url}（这条音效跳过）`);
      }).catch((error) => {
        entry.state = "failed";
        this.missingSfx.add(`${name}→${spec.url}`);
        console.warn(`[BlockoutPreviz] 音效文件读不到：${name} → ${spec.url}`, error?.message || error);
      });
      this.urlCues.set(name, entry);
      jobs.push(entry.promise);
    }
    await Promise.all(jobs);
  }

  /** 放一条 url 音效：装好了直接放；还在装就等装好再放（这时预演还在播才放）。→ voice | null（等装的那次返回 null）。 */
  PlayUrlCue(name, spec, position, volume) {
    const audio = this.host.audio;
    if (!audio?.ctx) return null;
    let entry = this.urlCues.get(name);
    if (!entry) { this.LoadUrlCues([name]); entry = this.urlCues.get(name); }
    if (!entry || entry.state === "failed" || entry.state === "noAudio") return null;
    const Fire = () => {
      if (entry.state !== "ok") return null;
      const voice = audio.Play("voice." + entry.key, { position, volume }) || null;
      if (voice) this.urlSfxPlayed += 1;
      return voice;
    };
    if (entry.state === "ok") return Fire();
    entry.promise?.then(() => { if (this.run) Fire(); });
    return null;
  }

  /** 别名 → 现有音频库的键，按 PREVIZ_SFX 放（burst 连发；deafen 耳鸣；url 直接放文件）。position 可空（居中）。→ 第一条 voice | null。 */
  PlayCue(name, position, volume = 1) {
    const audio = this.host.audio;
    const spec = PREVIZ_SFX[name];
    if (!spec) { this.missingSfx.add(name); return null; }
    if (spec.url) return this.PlayUrlCue(name, spec, position, volume);
    if (spec.deafen) { if (audio?.ctx) audio.Deafen?.(spec.deafen); return null; }
    if (!SOUND_NAMES.includes(spec.cue)) { this.missingSfx.add(`${name}→${spec.cue}`); return null; }
    if (!audio?.ctx) return null;
    const n = spec.burst || 1;
    let first = null;
    for (let i = 0; i < n; i++) {
      const delay = i * (spec.interval || 0) + (spec.jitter && i ? ((i * 0.618) % 1) * 0.05 : 0);
      const voice = audio.Play(spec.cue, { position, volume, delay });
      first ||= voice || null;
    }
    return first;
  }

  /** 持续声（飞机引擎 planeDrone）：起一条 voice 交给调用方逐帧 MoveVoice。没有音频 / 键不在 → null。 */
  StartLoopCue(name, position) {
    const audio = this.host.audio;
    const spec = PREVIZ_SFX[name];
    // url 音效当持续声：装好了才起（没装好这一次就不响）
    if (spec?.url) { const e = this.urlCues.get(name); return e?.state === "ok" && audio?.ctx && position ? (audio.Play("voice." + e.key, { position, volume: 0.9 }) || null) : null; }
    if (!spec?.cue || !SOUND_NAMES.includes(spec.cue)) { this.missingSfx.add(name); return null; }
    if (!audio?.ctx || !position) return null;
    try { return audio.Play(spec.cue, { position, volume: 0.9 }) || null; }
    catch (error) { console.warn("[BlockoutPreviz] loop cue failed", name, error); return null; }
  }

  // -------------------------------------------------------------------------
  // 相机（Script_Main 在玩家相机写完之后调）

  ResolveAnchor(anchor) {
    const editor = this.editor, player = this.game.player;
    if (typeof anchor.aircraft === "string") {
      // 飞机锚（2026-10-19）：机身位置 + 世界轴偏移；这一段里没有这架 → 原点（校验已拦）
      const pose = this.air?.PoseOf(anchor.aircraft);
      const off = anchor.offset || [0, 0, 0];
      if (!pose) return { x: off[0], y: off[1], z: off[2] };
      return { x: pose.x + off[0], y: pose.y + off[1], z: pose.z + off[2] };
    }
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
    const shot = SamplePrevizCamera(run.seq.camera, t, (a) => this.ResolveAnchor(a), { cuts: this.cameraMode === "cut" });
    if (!shot) return null;
    const shake = Math.max(shot.shake || 0, PrevizOverlays(run.seq, t).shake);
    const o = PrevizShakeOffset(shake, t);
    return { position: { x: shot.position.x + o.x, y: shot.position.y + o.y, z: shot.position.z + o.z },
      yawDeg: shot.yawDeg + o.yawDeg, pitchDeg: shot.pitchDeg + o.pitchDeg, fov: shot.fov, index: shot.index, eye: shot.eye, free: shot.free === true,
      shake: o };
  }

  /** "cut"（缺省，切镜）/ "move"（照写的运镜）。 */
  SetCameraMode(mode) { this.cameraMode = mode === "move" ? "move" : "cut"; return this.cameraMode; }

  ApplyCamera(camera) {
    if (!this.run || !camera) return false;
    const pose = this.CameraPose();
    if (!pose) return false;
    // 能转头不能走：这一帧是 free 眼睛就记下默认视线；玩家已经接手（同一段里）就用他转到的方向（震屏照加）。暂停 / Seek 时不接手
    const fl = this.freeLook;
    if (pose.free && !this.run.paused) {
      const segment = PrevizFreeLookSegment(this.run.seq.camera, pose.index);
      if (segment !== fl.segment) { fl.segment = segment; fl.active = false; }
      fl.defaultYaw = pose.yawDeg - pose.shake.yawDeg;
      fl.defaultPitch = pose.pitchDeg - pose.shake.pitchDeg;
      if (fl.active) { pose.yawDeg = fl.yawDeg + pose.shake.yawDeg; pose.pitchDeg = fl.pitchDeg + pose.shake.pitchDeg; }
    } else if (fl.segment !== -1) this.ResetFreeLook();
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
      cameraMode: this.cameraMode,
      sequences: this.doc ? this.doc.sequences.map(s => s.keyframe) : [], lines, subtitles: this.elSubs.hidden ? [] : [...this.elSubs.querySelectorAll(".boPrevizText")].map(e => e.textContent),
      camera: this.lastCamera && run ? { ...this.lastCamera, position: { ...this.lastCamera.position } } : null,
      missingClips: [...this.missingClips], missingLines: [...this.missingLines], missingSfx: [...this.missingSfx],
      errors: this.validation?.errors?.slice(0, 20) ?? [], warnings: this.validation?.warnings?.length ?? 0,
      voices: this.loadedVoices.size,
      fx: this.fx ? { ...this.fx.stats, blastsDrawn: BlockoutPrevizFx.BlastsHidden(this.host.post) } : null,
      // 2026-10-19：慢动作倍率与墙上时间、飞机
      timeScale: run ? +(run.timeScale ?? PrevizTimeScale(run.seq, run.t)).toFixed(3) : 1,
      wallT: run ? +run.wallT.toFixed(3) : 0,
      aircraft: this.air ? this.air.State() : [],
      missingModels: this.air ? [...this.air.missingModels] : [],
      // 2026-10-20：url 音效装了哪些 / 坏了哪些 / 放过几次；音频上下文状态（null = audio=0）
      urlSfx: {
        loaded: [...this.urlCues].filter(([, e]) => e.state === "ok").map(([n]) => n),
        failed: [...this.urlCues].filter(([, e]) => e.state === "failed").map(([n]) => n),
        loading: [...this.urlCues].filter(([, e]) => e.state === "loading").map(([n]) => n),
        played: this.urlSfxPlayed,
      },
      audioState: this.host.audio?.ctx?.state ?? null,
      // 2026-10-21：能转头不能走 —— available：这一帧的镜头是 free 眼睛；active：玩家已经接手；yaw / pitch：接手后的视线（没接手 = 默认视线）
      freeLook: {
        available: this.FreeLookAvailable(), active: this.freeLook.active, nudges: this.freeLook.nudges,
        yawDeg: +(this.freeLook.active ? this.freeLook.yawDeg : this.freeLook.defaultYaw).toFixed(3),
        pitchDeg: +(this.freeLook.active ? this.freeLook.pitchDeg : this.freeLook.defaultPitch).toFixed(3),
      },
    };
  }

  Dispose() {
    this.Stop({ restore: false });
    this.UnbindFreeLook();
    this.fx?.Dispose();
    this.air?.Dispose();
    this.elOverlay.remove(); this.elCaption.remove(); this.elSubs.remove();
  }
}

export { Fmt as PrevizTimeText, PREVIZ_EYE_HEIGHT };
