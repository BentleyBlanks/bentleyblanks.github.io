// 《地道里的光》核心逻辑冒烟测试（横版 2.5D 版）：
// 1) 自动通关驱动器把全部八章从头打到尾（两条第六章分支都走一遍）——可完成性是硬门槛；
// 2) 横向视线、爬梯、烟推进等机制的定点断言。
// 运行：node TunnelLight1943/Script_SmokeTest.mjs

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  CHAPTERS, SCENES, SCRIPTS, CreateGame, StepGame, GetBeatTarget, MakeChoice, CurrentBeatDef,
  SoldierSeesPlayer, SmokeCovers, VisionScale, ChapterBeatList, DebugJump, SplitPrompt,
} from "./Script_Core.mjs";
import { CHAPTER_BGM } from "./Data_BgmConfig.mjs";
import { AUDIO_BUS_BASE, AUDIO_DEFAULT_LEVELS } from "./Data_AudioMix.mjs";

const DT = 1 / 30;

// ---------------------------------------------------------------------------
// 自动通关驱动器（一维行走 + 爬梯口换层）
// ---------------------------------------------------------------------------
function AutoPlay(state, routeChoice, { maxChapterSeconds = 900, log = false } = {}) {
  let chapterT = 0;
  let lastChapter = state.chapterIndex;
  let lastBeat = -1;

  const started = Date.now();
  while (!state.done) {
    if (Date.now() - started > 120000) throw new Error("AutoPlay 真实耗时超过 120s，疑似死循环");
    chapterT += DT;
    if (state.chapterIndex !== lastChapter) { chapterT = 0; lastChapter = state.chapterIndex; }
    if (chapterT > maxChapterSeconds) {
      const tg = GetBeatTarget(state);
      throw new Error(`章节 ${CHAPTERS[state.chapterIndex].id} 超时于 beat=${CurrentBeatDef(state)?.id}`
        + ` player=(${state.player.x.toFixed(1)},${state.player.level})`
        + ` target=${JSON.stringify(tg)}`
        + ` followers=${JSON.stringify(state.actors.filter((a) => a.following).map((a) => [a.id, a.x.toFixed(1)]))}`);
    }
    if (log && state.beatIndex !== lastBeat && state.phase === "playing") {
      lastBeat = state.beatIndex;
      console.log(`  [${CHAPTERS[state.chapterIndex].id}] beat ${CurrentBeatDef(state)?.id}`);
    }

    const input = { moveX: 0, climb: 0, crouch: false, interact: false, interactHeld: false, throw: false, advance: false };

    if (state.phase === "chapterCard" || state.phase === "chapterEnd") {
      input.advance = true;
      StepGame(state, input, DT);
      continue;
    }
    if (state.phase === "gameEnd") break;

    // 微过场：按时自动推进
    if (state.microCine) { StepGame(state, input, DT); continue; }

    const target = GetBeatTarget(state);
    const def = CurrentBeatDef(state);
    if (!target) { StepGame(state, input, DT); continue; }

    // 探杆预兆/响动时立定
    if (def?.kind === "rescueLoop" && (state.beat.quakeWarn || state.beat.quakeActive)) {
      StepGame(state, input, DT);
      if (state.detection.level > 0.9) state.detection.level = 0.9;
      continue;
    }

    if (target.action === "advance") {
      input.advance = true;
    } else if (target.action === "choice") {
      MakeChoice(state, routeChoice);
      continue;
    } else {
      const p = state.player;
      const scene = SCENES[CHAPTERS[state.chapterIndex].scene];
      const targetLevel = target.level || "surface";

      if (p.level !== targetLevel && p.climbT <= 0) {
        // 找可用爬梯口，走过去按 W/S
        const shafts = scene.shafts.filter((s) => !s.builtFlag || state.flags[s.builtFlag]);
        let best = null, bestD = Infinity;
        for (const s of shafts) {
          if (state.flags.entWBlocked && s.id === "entW") continue;
          const d = Math.abs(p.x - s.x);
          if (d < bestD) { bestD = d; best = s; }
        }
        if (best) {
          if (Math.abs(p.x - best.x) > 0.9) {
            input.moveX = Math.sign(best.x - p.x);
          } else {
            input.climb = targetLevel === "under" ? 1 : -1;
          }
        }
      } else {
        const dx = target.x - p.x;
        const laggard = state.actors.some((a) => a.following && a.visible && Math.abs(a.x - p.x) > 4.6);
        if ((target.action === "walk" || Math.abs(dx) > 1.15) && !laggard) {
          input.moveX = Math.sign(dx);
        }
        if (target.action === "interactAt" && Math.abs(dx) <= 1.35) input.interact = true;
        if (target.action === "crouchAt" && Math.abs(dx) <= 1.35) { input.crouch = true; input.moveX = 0; }
        // 投掷：走到投掷位、面朝目标方向，然后 F
        if (target.action === "throwAt") {
          if (Math.abs(dx) > 0.6) input.moveX = Math.sign(dx);
          else if ((p.heading || 1) !== (target.face || 1)) input.moveX = target.face || 1;
          else if (!state.thrown) { input.throw = true; input.moveX = 0; }
          else input.moveX = 0;
        }
        // 推车：贴住车帮，按住 E 往推进方向使劲
        if (target.action === "pushAt") {
          if (Math.abs(dx) <= 2.2) { input.interactHeld = true; input.moveX = target.dir; }
          else input.moveX = Math.sign(dx);
        }
        // 辘轳：没灌满一直往下放（S），灌满了一直往上摇（W）
        if (target.action === "winchAt" && Math.abs(dx) <= 1.35) {
          const w = state.beat?.winch;
          input.climb = w?.filled ? -1 : 1;
          input.moveX = 0;
        }
        // 划线：按住 E 的同时还得左右推，粉笔才走
        if (target.action === "scribeAt" && Math.abs(dx) <= 1.6) {
          input.interactHeld = true;
          input.moveX = 1;
        }
        // 刨料：站到工位上按住 E 一趟趟推；推到头了掉头把刨子拖回来
        if (target.action === "planeAt") {
          if (Math.abs(dx) > 0.6) input.moveX = Math.sign(dx);
          else { input.interactHeld = true; input.moveX = target.back ? -1 : 1; }
        }
        if (target.action === "holdAt" && Math.abs(dx) <= 1.35) {
          if (!(target.pauseOnQuake && state.beat.quakeActive)) input.interactHeld = true;
          input.moveX = 0;
        }
      }
    }

    // 可翻越物挡在去路上：提示一出来就按下去（翻越是主动动作，不再自动触发）
    if (state.vaultHint) input.interact = true;

    StepGame(state, input, DT);
    // 驱动器不做真人级躲藏走位：钳制探测避免无限重置（探测机制单测另行覆盖）
    if (state.detection.level > 0.9) state.detection.level = 0.9;
  }
  return state;
}

// ---------------------------------------------------------------------------
// 机制定点断言
// ---------------------------------------------------------------------------
function TestChapterMeta() {
  assert.equal(CHAPTERS.length, 8, "必须完整覆盖文档中的八个章节");
  const titles = CHAPTERS.map((c) => c.title).join("|");
  for (const expected of ["门框上的刻痕", "灯停住了", "半袋烟的工夫", "最后一盏灯", "东口的铃", "没套的骡车", "地道里的光", "第二道刻痕"]) {
    assert.ok(titles.includes(expected), `缺少章节：${expected}`);
  }
  console.log("  ✓ 章节元数据对齐关卡设计文档");
}

function TestSingleChapterEntry() {
  for (let i = 0; i < CHAPTERS.length; i += 1) {
    const state = CreateGame(i);
    assert.equal(state.chapterIndex, i);
    assert.equal(state.phase, "chapterCard");
    StepGame(state, { moveX: 0, climb: 0, crouch: false, interact: false, interactHeld: false, advance: false }, DT);
  }
  console.log("  ✓ 八个章节均可独立启动");
}

function TestVision() {
  const scene = SCENES.village;
  const soldier = { x: 100, heading: 1, level: "surface" };
  assert.ok(SoldierSeesPlayer(scene, soldier, { x: 108, level: "surface", hidden: false, crouch: false }), "面朝方向 8m 应被看见");
  assert.ok(!SoldierSeesPlayer(scene, soldier, { x: 90, level: "surface", hidden: false, crouch: false }), "背后不应被看见");
  assert.ok(!SoldierSeesPlayer(scene, soldier, { x: 108, level: "surface", hidden: true, crouch: true }), "躲藏状态不应被看见");
  assert.ok(!SoldierSeesPlayer(scene, soldier, { x: 130, level: "surface", hidden: false, crouch: false }), "超出视距不应被看见");
  assert.ok(!SoldierSeesPlayer(scene, soldier, { x: 108, level: "under", hidden: false, crouch: false }), "不同层不应被看见");
  // 房屋挡视线：柱子家在 x=34 (w=20)，士兵在西、玩家在东
  const s2 = { x: 20, heading: 1, level: "surface" };
  assert.ok(!SoldierSeesPlayer(SCENES.village, s2, { x: 47, level: "surface", hidden: false, crouch: false }), "房屋应挡住视线");
  console.log("  ✓ 横向视线：朝向 / 层 / 躲藏 / 房屋遮挡");
}

function TestClimb() {
  const state = CreateGame(0); // 第一章村庄有地窖口
  // 推进到第一个可玩 beat（开场是 cinematic，期间不处理移动输入）
  let fwd = 0;
  while (state.phase !== "playing" || CurrentBeatDef(state)?.kind === "cinematic") {
    StepGame(state, { moveX: 0, climb: 0, crouch: false, interact: false, interactHeld: false, advance: true }, DT);
    if ((fwd += 1) > 10000) throw new Error("无法进入第一章玩法段");
  }
  state.player.x = 27;
  state.player.level = "surface";
  // S 下地窖
  StepGame(state, { moveX: 0, climb: 1, crouch: false, interact: false, interactHeld: false, advance: false }, DT);
  assert.equal(state.player.level, "under", "在地窖口按 S 应下到地下");
  // 爬梯锁定时间过后，W 上来
  let guard = 0;
  while (state.player.climbT > 0 && (guard += 1) < 100) {
    StepGame(state, { moveX: 0, climb: 0, crouch: false, interact: false, interactHeld: false, advance: false }, DT);
  }
  StepGame(state, { moveX: 0, climb: -1, crouch: false, interact: false, interactHeld: false, advance: false }, DT);
  assert.equal(state.player.level, "surface", "在梯口按 W 应回到地表");
  console.log("  ✓ 爬梯口上下");
}

function TestSmokeFront() {
  const state = CreateGame(3);
  state.smoke = { frontX: 100, speed: 1, ventAt: null, ventUntil: 0, active: true };
  assert.ok(SmokeCovers(state, 120), "front 以东应被烟覆盖");
  assert.ok(!SmokeCovers(state, 80), "front 以西不应被烟覆盖");
  console.log("  ✓ 烟的一维推进覆盖判定");
}

function TestDetectionReset() {
  const state = CreateGame(1);
  let guard = 0;
  while (state.phase !== "playing" || CurrentBeatDef(state)?.kind === "cinematic") {
    StepGame(state, { moveX: 0, climb: 0, crouch: false, interact: false, interactHeld: false, advance: true }, DT);
    if ((guard += 1) > 10000) throw new Error("无法进入第二章玩法段");
  }
  assert.ok(state.stealthActive, "第二章夜巡应激活潜行");
  const soldier = state.actors.find((a) => a.kind === "soldier" || a.kind === "puppet");
  assert.ok(soldier, "第二章应有巡逻的敌人");
  const beforeResets = state.flags.resets;
  guard = 0;
  while (state.flags.resets === beforeResets) {
    state.player.x = soldier.x + (soldier.heading || 1) * 4;
    state.player.level = "surface";
    StepGame(state, { moveX: 0, climb: 0, crouch: false, interact: false, interactHeld: false, advance: false }, DT);
    if ((guard += 1) > 3000) throw new Error("探测重置未触发");
  }
  assert.equal(state.flags.resets, beforeResets + 1, "被发现应触发一次重置");
  console.log("  ✓ 潜行探测与失败重置");
}

// 潜行段必须真的跑得掉。
//
// 这条断言是拿真事故换来的：第一章考场的巡逻带压在了玩家的重置点上，被发现
// 一次之后，退回原地 = 退回敌人脸前，立刻再被发现——「永远也跑不掉」。
// 自动通关测试抓不到它，因为驱动器把 detection 钳在 0.9 从不真的失败。
//
// 所以这里两头都验：① 重置点不能在任何人的视线里（死循环的充分条件）；
// ② 一个不读视线、不蹲、不投石的「笨玩家」一路直走要能过去。
function TestStealthEscapable() {
  const CASES = [
    { chapter: 0, beat: "c1_hide", startX: 42.3, label: "C1 带妹妹躲进地窖" },
    { chapter: 1, beat: "c2_escape1", label: "C2 东行第一段" },
    { chapter: 1, beat: "c2_escape2", label: "C2 东行第二段" },
  ];
  for (const c of CASES) {
    const state = CreateGame(c.chapter);
    const script = ChapterBeatList(c.chapter);
    const idx = script.findIndex((b) => b.id === c.beat);
    assert.ok(idx >= 0, `找不到 beat ${c.beat}`);
    DebugJump(state, c.chapter, idx);
    // 跳幕落点未必等于实战落点（过场结算不搬人）：按实战起点摆，连 snapshot 一起改
    if (c.startX !== undefined) {
      state.player.x = c.startX;
      state.beat.snapshot.player.x = c.startX;
      const sis = state.actors.find((a) => a.id === "sister");
      if (sis) {
        sis.x = c.startX + 0.6;
        const snap = state.beat.snapshot.actors.find((a) => a.id === "sister");
        if (snap) snap.x = sis.x;
      }
    }

    const scene = SCENES[CHAPTERS[c.chapter].scene];
    const spotters = state.actors.filter((a) => (a.kind === "soldier" || a.kind === "puppet")
      && a.visible !== false && !a.decor
      && SoldierSeesPlayer(scene, a, state.player, VisionScale(state)));
    assert.equal(spotters.length, 0,
      `${c.label}：重置点就在 ${spotters.map((a) => a.id).join(",")} 的视线里——被抓一次就再也跑不掉`);

    const startBeat = state.beatIndex;
    let t = 0;
    for (let i = 0; i < 60 * 30 && state.beatIndex === startBeat; i += 1) {
      t += DT;
      const target = GetBeatTarget(state);
      const input = { moveX: 0, climb: 0, crouch: false, interact: false, interactHeld: false, throw: false, advance: false };
      if (target && target.x !== undefined) {
        const dx = target.x - state.player.x;
        if (target.action === "interactAt" && Math.abs(dx) <= 1.35) input.interact = true;
        else if (Math.abs(dx) > 0.6) input.moveX = Math.sign(dx);
        else if (target.level && target.level !== state.player.level) input.climb = target.level === "under" ? 1 : -1;
      }
      // 挡在路上的可翻越物：屏幕上写着「翻过去」，笨玩家也会照着按
      if (state.vaultHint) input.interact = true;
      StepGame(state, input, DT);   // 不钳 detection：真失败就让它失败
    }
    assert.notEqual(state.beatIndex, startBeat,
      `${c.label}：一路直走 60 秒也没过去（被抓 ${state.flags.resets} 次）——这段跑不掉`);
    console.log(`  ✓ ${c.label} 可逃脱（笨玩家 ${t.toFixed(1)}s，被抓 ${state.flags.resets} 次）`);
  }
}

// 翻越：三处可翻越物都得真的翻得过去——而且是"翻"，不是换个姿势平移过去。
// 这条断言是补出来的：翻越以前只有一个静止姿势 + 一条直线位移，人从不离地，
// 玩起来就跟没做一样（关卡设计文档里它一直挂着"待实装"）。
function TestVaultC1() {
  const NONE = { moveX: 0, climb: 0, crouch: false, interact: false, interactHeld: false, advance: false };
  const list = ChapterBeatList(0);
  const cases = [
    { beat: "c1_cloth", from: 79, to: 92, top: 1.24, label: "路边的柴垛（教学）" },
    { beat: "c1_cloth", from: 92, to: 79, top: 1.24, label: "路边的柴垛（回程复用）" },
    { beat: "c1_hide", from: 42, to: 32, top: 1.08, label: "倒塌的柴垛（扫荡压力下）" },
  ];
  for (const c of cases) {
    const state = CreateGame(0);
    DebugJump(state, 0, list.findIndex((b) => b.id === c.beat));
    state.player.x = c.from;
    const dir = Math.sign(c.to - c.from);
    let peakLift = 0, sawPose = false, started = false, sawHint = false, blockedX = null;
    const cues = [];
    for (let i = 0; i < 900; i += 1) {
      // 只走路：先确认它真的**挡住**了（走 3 秒都过不去），再按键翻
      const press = i > 180 && state.vaultHint;
      if (state.vaultHint) { sawHint = true; if (blockedX === null) blockedX = state.player.x; }
      StepGame(state, { ...NONE, moveX: dir, interact: !!press }, 1 / 60);
      for (const cue of state.cues) cues.push(cue.name);
      state.cues.length = 0;
      if (i === 179) {
        assert.ok(!started, `${c.label}：没按键就翻过去了——翻越必须是玩家主动按的`);
        assert.ok(sawHint, `${c.label}：走到跟前必须出「翻过去」的提示`);
      }
      if (state.player.vaultT > 0) {
        started = true;
        peakLift = Math.max(peakLift, state.player.lift || 0);
        if (state.player.pose === "vault" || state.player.pose === "clamber") sawPose = true;
      }
      if (dir > 0 ? state.player.x >= c.to : state.player.x <= c.to) break;
    }
    assert.ok(sawHint, `${c.label}：走到跟前必须出「翻过去」的提示`);
    assert.ok(started, `${c.label}：按下互动键必须起手翻越`);
    assert.ok(sawPose, `${c.label}：翻越过程中必须有翻越姿势`);
    // 抬升峰值取障碍高度的七成上下——人必须真的离地，不能是平移
    assert.ok(peakLift > c.top * 0.6, `${c.label}：抬升峰值 ${peakLift.toFixed(2)} 太低，人没离地`);
    assert.ok(peakLift < c.top * 1.1, `${c.label}：抬升峰值 ${peakLift.toFixed(2)} 过头了`);
    assert.ok(cues.includes("vault") || cues.includes("vaultHeavy"), `${c.label}：缺起手音效`);
    assert.ok(cues.includes("vaultLand"), `${c.label}：缺落地音效`);
    assert.equal(state.player.lift || 0, 0, `${c.label}：翻完必须落回地面`);
    assert.ok(dir > 0 ? state.player.x >= c.to : state.player.x <= c.to,
      `${c.label}：翻完必须真的到了另一侧`);
  }

  // 摆位铁律：跑腿路线（院子 31~70：水桶、木料、独轮车都在这一段）上
  // 一块可翻越物都不许有。玩家的原话是"提着水桶扛着木头的途中居然要翻越"。
  // 带旗标的不算——倒塌的柴垛只在扫荡开始后才存在，那会儿家务早结束了，
  // 手里空着；反过来说，**它也必须带着旗标**，否则就压在打水那条路上。
  {
    const always = SCENES.village.vaults.filter((v) => !v.flag);
    const errand = always.filter((v) => v.x > 30 && v.x < 72);
    assert.equal(errand.length, 0,
      `跑腿路线上不该有常驻的可翻越物，却有 ${errand.map((v) => v.x).join(",")}`);
    for (const v of SCENES.village.vaults) {
      if (v.x > 30 && v.x < 72) {
        assert.equal(v.flag, "raidStarted", `院子里的可翻越物 ${v.x} 必须只在扫荡后出现`);
      }
    }
  }

  // 扛着大件是另一档：更慢、另一套姿势（clamber）
  {
    const state = CreateGame(0);
    DebugJump(state, 0, list.findIndex((b) => b.id === "c1_cloth"));
    state.player.x = 79;
    state.player.item = { id: "plankA", label: "木料", big: true };
    let heavy = false, dur = 0;
    for (let i = 0; i < 900; i += 1) {
      StepGame(state, { ...NONE, moveX: 1, interact: !!state.vaultHint }, 1 / 60);
      state.cues.length = 0;
      if (state.player.pose === "clamber") heavy = true;
      if (state.player.vaultT > 0) dur = Math.max(dur, state.player.vaultDur);
      if (state.player.x >= 92) break;
    }
    assert.ok(heavy, "扛着木料翻越必须走 clamber 那一档");
    assert.ok(dur > 0.9, "扛着东西翻越必须更慢");
  }

  // 推着车不翻：提示都不该出（车是从旁边推过去的，不是被抱过垛顶的）
  {
    const state = CreateGame(0);
    DebugJump(state, 0, list.findIndex((b) => b.id === "c1_cloth"));
    state.cart = { x: 84.4, kind: "barrow" };
    state.player.x = 82.6;
    let vaulted = false;
    for (let i = 0; i < 120; i += 1) {
      StepGame(state, { ...NONE, moveX: 1, interact: true }, 1 / 60);
      state.cues.length = 0;
      if (state.player.vaultT > 0) vaulted = true;
      state.cart.x = state.player.x + 1.7;
    }
    assert.ok(!vaulted, "推着车时不该触发翻越");
  }
  console.log("  ✓ 翻越：挡路+按键才翻 / 不占跑腿路线 / 抬升弧 / 扛大件变奏 / 推车不触发");
}

function TestInstrumentalBgmManifest() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const manifestPath = path.join(here, "Audio", "Bgm", "Data_BgmManifest.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  assert.equal(manifest.policy.instrumentalOnly, true, "正式 BGM 必须启用纯器乐政策");
  assert.equal(manifest.policy.allowSinging, false, "不得允许演唱");
  assert.equal(manifest.policy.allowVocalTextures, false, "不得允许人声氛围音色");
  assert.equal(manifest.tracks.length, CHAPTERS.length, "八章应各有一首 BGM");
  assert.equal(CHAPTER_BGM.length, CHAPTERS.length, "代码映射应覆盖八章");
  for (let i = 0; i < manifest.tracks.length; i += 1) {
    const item = manifest.tracks[i];
    const code = CHAPTER_BGM[i];
    assert.equal(item.chapter, i + 1, `BGM 清单第 ${i + 1} 项章节号错误`);
    assert.equal(item.hasVocals, false, `${item.id} 不得带人声`);
    assert.equal(code.hasVocals, false, `${code.id} 代码配置不得带人声`);
    assert.equal(code.id, item.id, `第 ${i + 1} 章曲目 ID 不一致`);
    assert.equal(code.cue, item.cue, `${item.id} cue 不一致`);
    assert.equal(code.gain, item.gain, `${item.id} gain 不一致`);
    assert.equal(path.basename(code.file), item.file, `${item.id} 文件名不一致`);
    const audioPath = path.join(here, "Audio", "Bgm", item.file);
    assert.ok(fs.existsSync(audioPath), `${item.file} 必须存在`);
    assert.ok(fs.statSync(audioPath).size > 100000, `${item.file} 不应是空壳文件`);
  }
  assert.ok(manifest.rejectedCandidates.some((item) => item.id === "whatWeDontSay"),
    "含人声的 What We Don't Say 必须留在淘汰记录中");
  assert.ok(!manifest.tracks.some((item) => item.id === "whatWeDontSay"),
    "含人声曲目不得进入正式清单");
  for (const rejectedId of ["nightFalls", "huabeiVillageDawn"]) {
    assert.ok(manifest.rejectedCandidates.some((item) => item.id === rejectedId),
      `${rejectedId} 必须留在用户试听淘汰记录中`);
    assert.ok(!manifest.tracks.some((item) => item.id === rejectedId),
      `${rejectedId} 不得进入正式清单`);
  }
  console.log("  ✓ 八章纯器乐 BGM 清单 / 文件 / 淘汰规则");
}

// 跑腿的时候家里人都得在干活（爹拉锯、娘锄地），不许站着围观；
// 桶灌满娘要有反应（后果小窗 + 停锄望井台）。这些全是"悄悄断了也没测试红"的
// 表演层状态机，得点名盯住。
function TestWorkStations() {
  const idle = { moveX: 0, climb: 0, crouch: false, interact: false, interactHeld: false, throw: false, advance: false };
  const beats = ChapterBeatList(0).map((b) => b.id);
  const state = CreateGame(0);

  DebugJump(state, 0, beats.indexOf("c1_barrow"));
  StepGame(state, idle, DT);   // 第一帧跑 onStart：各就各位
  const father = state.actors.find((a) => a.id === "father");
  const mother = state.actors.find((a) => a.id === "mother");
  assert.equal(father?.track?.name, "sawing", "运木料时爹必须在拉锯");
  assert.equal(father?.carry, "锯", "拉锯的爹手上必须有锯");
  assert.ok(mother?.cineTarget || mother?.track, "运木料时娘必须动身去菜畦或已在干活");

  DebugJump(state, 0, beats.indexOf("c1_water"));
  StepGame(state, idle, DT);
  assert.equal(state.actors.find((a) => a.id === "father")?.track?.name, "sawing", "打水时爹必须在拉锯");
  const m2 = state.actors.find((a) => a.id === "mother");
  assert.equal(m2?.track?.name, "hoeing", "打水时娘必须在菜畦锄地");
  assert.equal(m2?.carry, "锄头", "锄地的娘手上必须有锄头");

  // 桶触水：娘停锄、后果小窗开
  const water = SCRIPTS.c1.find((b) => b.id === "c1_water");
  const winch = water.steps.find((s) => s.type === "winch");
  winch.onFilled(state);
  assert.equal(state.flags.waterFilled, true);
  assert.ok(state.pip && state.pip.who === "mother", "桶灌满必须开一扇看娘的后果小窗");
  assert.equal(m2.track, null, "听见咕咚声，娘得停下锄头");
  // 小窗到时自己收，onEnd 别把锄地误恢复（水已经打上来了）
  StepGame(state, idle, state.pip.t + 0.1);
  assert.equal(state.pip, null, "后果小窗必须到时收起");
  assert.equal(m2.track, null, "水打上来之后娘不该再回去锄地");
  console.log("  ✓ 干活的家人（爹拉锯/娘锄地）与后果小窗");
}

// 刨料这一拍是"手上真有活"的教学，几条硬约束：镜头必须推到台面上
// （老版是十几米外按 E 敲木楔，木楔只有几个像素）；顺纹才吃木头、倒着拖不算；
// 中间顿一下这一趟就不齐（刨花短一截），但**永远不会卡死**——推够趟数就过。
function TestPlaneBeat() {
  const idle = () => ({ moveX: 0, climb: 0, crouch: false, interact: false, interactHeld: false, throw: false, advance: false });
  const beats = ChapterBeatList(0).map((b) => b.id);
  const state = CreateGame(0);
  DebugJump(state, 0, beats.indexOf("c1_tenon"));
  const def = CurrentBeatDef(state);
  assert.equal(def.kind, "plane", "合榫那一拍已经换成刨料");
  assert.ok(def.cam && def.cam.dist <= 3.2, "刨料必须把镜头推到台面上（≤3.2m 半宽）");

  // 爹的示范先走完
  for (let i = 0; i < 150; i += 1) StepGame(state, idle(), DT);
  assert.ok(state.planing, "刨料期间台面上必须有那块料");
  const workX = def.zone.x - 0.55;
  state.player.x = workX;

  // ① 倒着拖不吃木头
  const before = state.planing.smooth;
  for (let i = 0; i < 20; i += 1) StepGame(state, { ...idle(), interactHeld: true, moveX: -1 }, DT);
  assert.equal(state.planing.smooth, before, "回程不该刨掉木头");

  // ② 一趟推到底：刨花出来、木头亮一分
  let guard = 0;
  while (state.planing && state.planing.smooth === before && guard < 400) {
    guard += 1;
    StepGame(state, { ...idle(), interactHeld: true, moveX: 1 }, DT);
  }
  assert.ok(state.planing === null || state.planing.smooth > before, "一趟推到底必须刨掉一层");
  assert.ok(state.flags.planedOnce, "第一趟推完必须落旗");

  // ③ 中间顿一下：这一趟不齐，刨花短一截（但仍然算数，不会卡死）
  const s2 = CreateGame(0);
  DebugJump(s2, 0, beats.indexOf("c1_tenon"));
  for (let i = 0; i < 150; i += 1) StepGame(s2, idle(), DT);
  s2.player.x = def.zone.x - 0.55;
  for (let i = 0; i < 14; i += 1) StepGame(s2, { ...idle(), interactHeld: true, moveX: 1 }, DT);
  for (let i = 0; i < 20; i += 1) StepGame(s2, idle(), DT);          // 停在半道
  let g2 = 0, curlLen = null;
  while (s2.planing && g2 < 400) {
    g2 += 1;
    StepGame(s2, { ...idle(), interactHeld: true, moveX: 1 }, DT);
    if (s2.planeCurl && curlLen === null) curlLen = s2.planeCurl.len;
    if (curlLen !== null) break;
  }
  assert.ok(curlLen !== null && curlLen < 1, "顿过的那一趟，刨花必须短一截");

  // ④ 自动通关能过（不会卡在"推到头忘了拖回来"）
  const s3 = CreateGame(0);
  DebugJump(s3, 0, beats.indexOf("c1_tenon"));
  let g3 = 0;
  while (CurrentBeatDef(s3)?.id === "c1_tenon" && g3 < 3000) {
    g3 += 1;
    const t = GetBeatTarget(s3);
    const inp = idle();
    if (t?.action === "planeAt") {
      const d = t.x - s3.player.x;
      if (Math.abs(d) > 0.6) inp.moveX = Math.sign(d);
      else { inp.interactHeld = true; inp.moveX = t.back ? -1 : 1; }
    }
    StepGame(s3, inp, DT);
  }
  assert.notEqual(CurrentBeatDef(s3)?.id, "c1_tenon", "刨料必须能推完（驱动器不许卡死）");
  console.log("  ✓ 刨料：镜头推近 / 顺纹才吃木 / 顿一下刨花短 / 推得完");
}

function TestQuieterAudioMix() {
  assert.ok(AUDIO_BUS_BASE.sfx <= 0.68, "音效总线必须保持在降低后的基准");
  // 环境声（风）是从头响到尾的底噪，玩家反馈「太吵」——基准压到 0.34 以下。
  // 它跟「音效」滑杆共用一个电平，所以只能从基准压：压滑杆会把动作音一起带走
  assert.ok(AUDIO_BUS_BASE.amb <= 0.34, "环境声总线必须保持在降低后的基准");
  assert.ok(AUDIO_BUS_BASE.music <= 0.42, "配乐总线必须保持在降低后的基准");
  assert.equal(AUDIO_DEFAULT_LEVELS.sfx, 80, "新玩家的默认音效应为 80%");
  assert.equal(AUDIO_DEFAULT_LEVELS.voice, 100, "降低背景声不应压低旁白");
  assert.ok(AUDIO_DEFAULT_LEVELS.music <= 60, "新玩家的默认配乐不应高于 60%");
  console.log("  ✓ 音效与环境声降噪混音契约");
}

// 提示的写法：键名只许出现在 `E · ` 这个前缀里，由 HUD 按输入设备翻成
// 键帽或触屏图标。文案（动词、hint、objective、toast）里但凡还写着"按 E"
// "按住 E""（C）"，手机玩家读到的就是一句废话——这条断言就是盯这个的。
function TestPromptsAreDeviceNeutral() {
  const bad = [];
  const KEY_IN_TEXT = /(按住?\s*[EFCWS]\b)|([（(]\s*[EFCWS]\s*[)）])|(\b[EFCWS]\s*(键|让|招呼|一条条))/;

  const check = (label, raw) => {
    if (typeof raw !== "string" || !raw) return;
    const pr = SplitPrompt(raw);
    // 前缀之后剩下的那部分才是玩家读到的字
    if (KEY_IN_TEXT.test(pr.text)) bad.push(`${label}: ${raw}`);
    // 动词要短：一眼扫过去就懂。超过 6 个字的多半是把说明写进了徽章——
    // 为什么、怎么做交给画面、气泡和手记条，徽章上只留"做什么"
    if (pr.act && pr.text.length > 6) bad.push(`${label}（动词过长 ${pr.text.length} 字）: ${raw}`);
  };

  const walk = (node, trail) => {
    if (Array.isArray(node)) { node.forEach((v, i) => walk(v, `${trail}[${i}]`)); return; }
    if (!node || typeof node !== "object") return;
    for (const [k, v] of Object.entries(node)) {
      if (typeof v === "string" && /prompt|hint|objective|note|label/i.test(k)) check(`${trail}.${k}`, v);
      else if (v && typeof v === "object") walk(v, `${trail}.${k}`);
    }
  };
  for (const [ch, beats] of Object.entries(SCRIPTS)) walk(beats, ch);

  // 执行器里写死的那些提示也过一遍同一把尺
  const here = path.dirname(fileURLToPath(import.meta.url));
  const src = fs.readFileSync(path.join(here, "Script_Core.mjs"), "utf8");
  for (const m of src.matchAll(/state\.(?:prompt|climbHint)\s*=\s*"([^"]+)"/g)) {
    check("Core", m[1]);
  }

  assert.deepEqual(bad, [], "提示文案里不许直接写键名／不许写成一句话：\n  " + bad.join("\n  "));
  // 前缀本身必须还认得出来，否则徽章会集体退化成没有按钮的状态行
  assert.deepEqual(SplitPrompt("按住 E · 接绳"), { act: "interact", hold: true, text: "接绳" });
  assert.deepEqual(SplitPrompt("F · 投"), { act: "throw", hold: false, text: "投" });
  assert.deepEqual(SplitPrompt("跟上娘"), { act: null, hold: false, text: "跟上娘" });
  console.log("  ✓ 提示文案与设备无关（键名只在前缀里）");
}

// ---------------------------------------------------------------------------
console.log("《地道里的光》冒烟测试（横版 2.5D）");
console.log("— 机制定点断言 —");
TestChapterMeta();
TestSingleChapterEntry();
TestVision();
TestClimb();
TestSmokeFront();
TestDetectionReset();
TestStealthEscapable();
TestPromptsAreDeviceNeutral();
TestWorkStations();
TestVaultC1();
TestPlaneBeat();
TestInstrumentalBgmManifest();
TestQuieterAudioMix();

console.log("— 全流程自动通关（第六章走『地下进人』）—");
{
  const t0 = Date.now();
  const state = AutoPlay(CreateGame(0), "tunnel", { log: true });
  assert.equal(state.phase, "gameEnd", "全流程必须能打到终章");
  assert.equal(state.flags.route, "tunnel");
  // 正常打完一遍必须能推出"这是个套"。这条断言是补上的：门板那套机制曾经
  // 整个是死的——gotoSeq 收集的乡亲口信没有入账 notesSeen，于是互相矛盾的
  // 两条永远凑不齐，`deduced` 永远为假，"自己推出来"那一支从没上过场。
  // 机制悄悄失效不会让任何测试变红，只能靠这种断言盯住。
  assert.equal(state.flags.deduced, true, "第六章的情报推理必须走得通");
  // 谜题动词层的旗标：链走完了这些必须是真的。链的某一步悄悄断掉
  // （物品拿不到、投掷永远不中、狗喂不上）不会让通关测试变红——
  // 自动驾驶会卡超时，但那个报错读不出是哪个动词坏了，这里点名盯住。
  assert.equal(state.flags.clothDown, true, "C1 投掷教学必须真的把布巾打下来");
  assert.equal(state.flags.barrowHome, true, "C1 独轮车必须把木料推到爹跟前");
  assert.equal(state.flags.henFlew, true, "C1 扛第二根木料必须惊走那只母鸡");
  assert.equal(state.flags.wellRopeBroken, false, "C1 打水链走完，井绳必须是接好的");
  assert.equal(state.flags.raidStarted, true, "C1 扫荡的考场布防必须落旗");
  assert.equal(state.flags.waterFilled, true, "C1 打水链的桶必须真的触过水");
  assert.equal(state.flags.pipShown, true, "C1 后果小窗（娘听见桶灌满）必须开过");
  assert.equal(state.flags.dogFed, true, "C2 的狗必须喂得上");
  assert.equal(state.flags.lanternOut, true, "C2 的马灯必须打得灭");
  assert.equal(state.flags.trapBuilt, true, "C5 翻口链必须走得通");
  assert.equal(state.flags.hiddenBuilt, true, "C5 新暗口链必须走得通");
  assert.equal(state.flags.bellBuilt, true, "C5 预警铃链必须走得通");
  assert.equal(state.flags.dogFed2, true, "C5 猪圈的狗必须喂得上");
  console.log(`  ✓ 八章全通（${((Date.now() - t0) / 1000).toFixed(1)}s 实耗）`);
}

console.log("— 全流程自动通关（第六章走『地面佯动』）—");
{
  const state = AutoPlay(CreateGame(0), "ground");
  assert.equal(state.phase, "gameEnd");
  assert.equal(state.flags.route, "ground");
  console.log("  ✓ 八章全通（地面分支）");
}

console.log("全部通过 ✓");
