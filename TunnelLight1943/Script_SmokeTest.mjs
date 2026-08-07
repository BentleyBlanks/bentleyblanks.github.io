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
  WINCH_HUB_Y, SURFACE_Y, UNDER_Y,
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
        // 刨料：驱动器只按键盘（CLAUDE.md 铁律），按住 E 就行——方向由节拍自己判。
        // 走位也由节拍接管（爹让开后柱子自动上前），驱动器不用管站位
        if (target.action === "planeAt") input.interactHeld = true;
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
  // 96→100 这一段两头都不挨掩体（hayC 收在 89.4，ruinWall 起于 103.6）
  const soldier = { x: 96, heading: 1, level: "surface" };
  assert.ok(SoldierSeesPlayer(scene, soldier, { x: 100, level: "surface", hidden: false, crouch: false }), "面朝方向 4m 的空地应被看见");
  assert.ok(!SoldierSeesPlayer(scene, soldier, { x: 92, level: "surface", hidden: false, crouch: false }), "背后不应被看见");
  assert.ok(!SoldierSeesPlayer(scene, soldier, { x: 100, level: "surface", hidden: true, crouch: true }), "躲藏状态不应被看见");
  assert.ok(!SoldierSeesPlayer(scene, soldier, { x: 130, level: "surface", hidden: false, crouch: false }), "超出视距不应被看见");
  assert.ok(!SoldierSeesPlayer(scene, soldier, { x: 100, level: "under", hidden: false, crouch: false }), "不同层不应被看见");
  // 房屋挡视线：柱子家在 x=34 (w=20)，士兵在西、玩家在东
  const s2 = { x: 20, heading: 1, level: "surface" };
  assert.ok(!SoldierSeesPlayer(SCENES.village, s2, { x: 47, level: "surface", hidden: false, crouch: false }), "房屋应挡住视线");
  console.log("  ✓ 横向视线：朝向 / 层 / 躲藏 / 房屋遮挡");
}

// 藏 = 站到掩体**背光的那一面**。
//
// 这条是第二章躲避玩法重做的地基：老版只要走进掩体范围就隐身，于是"找到掩体"
// 之后这一段再没有可做的事（用户原话「一点策略也没有」）。现在草垛挡的是从它
// 另一侧照过来的光——兵绕过去，你就得跟着绕。
function TestCoverIsDirectional() {
  const scene = SCENES.village;
  const hay = scene.covers.find((c) => c.id === "hayB");     // 高掩体：草垛 x=68
  const wood = scene.covers.find((c) => c.id === "woodB");   // 矮掩体：柴堆 x=78
  assert.ok(hay?.tall && !wood?.tall, "断言依赖 hayB 是高掩体、woodB 是矮掩体");

  const west = { x: 62, heading: 1, level: "surface" };      // 灯在草垛西边，朝东照
  const behind = { x: 70.2, level: "surface", hidden: false, crouch: false };
  const front = { x: 66.2, level: "surface", hidden: false, crouch: false };
  assert.ok(!SoldierSeesPlayer(scene, west, behind, 1), "站在草垛背光那一面应藏得住");
  assert.ok(SoldierSeesPlayer(scene, west, front, 1), "站在草垛迎光那一面应露馅——不然掩体就没有正反面");

  // 灯绕到东边：刚才安全的那一侧当场易手，这就是"跟着绕"
  const east = { x: 76, heading: -1, level: "surface" };
  assert.ok(SoldierSeesPlayer(scene, east, behind, 1), "灯绕到东边后，草垛东侧不再安全");
  assert.ok(!SoldierSeesPlayer(scene, east, front, 1), "灯绕到东边后，草垛西侧才是影子");

  // 矮掩体仍旧要蹲：站着挡不住
  const nearWood = { x: 79.6, level: "surface", hidden: false, crouch: false };
  assert.ok(SoldierSeesPlayer(scene, { x: 74, heading: 1, level: "surface" }, nearWood, 1), "矮柴堆后面站着应被看见");
  assert.ok(!SoldierSeesPlayer(scene, { x: 74, heading: 1, level: "surface" }, { ...nearWood, crouch: true }, 1), "蹲在矮柴堆后面应藏得住");

  // 钻得进去的掩体（沟/庄稼地/灌木）没有正反面
  const fields = SCENES.fields;
  const inDitch = { x: 6, level: "surface", hidden: false, crouch: true };
  assert.ok(!SoldierSeesPlayer(fields, { x: 2, heading: 1, level: "surface" }, inDitch, 1), "沟里从西边看不见");
  assert.ok(!SoldierSeesPlayer(fields, { x: 12, heading: -1, level: "surface" }, inDitch, 1), "沟里从东边也看不见");
  console.log("  ✓ 掩体有正反面（高/矮 · 易手 · 钻进去的除外）");
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
    { chapter: 1, beat: "c2_mother", startX: 50, label: "C2 掩体推进", budget: 120 },
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
    const budget = c.budget ?? 60;
    let t = 0;
    for (let i = 0; i < budget * 30 && state.beatIndex === startBeat; i += 1) {
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
      `${c.label}：一路直走 ${budget} 秒也没过去（被抓 ${state.flags.resets} 次）——这段跑不掉`);
    console.log(`  ✓ ${c.label} 可逃脱（笨玩家 ${t.toFixed(1)}s，被抓 ${state.flags.resets} 次）`);
  }
}

// 第二章躲避段重做的三条断言（三条都是用户当场退回来的意见换的）：
//   ①「哪里按住了？」——"娘按住你"必须真的发生：她扑回来、手落在肩上（pose
//     "press"）、玩家的操作被拿走那一下，而且确实因此没被照见；
//   ②「娘自己不用遮蔽？」——她被灯照到时必须自己躲进掩体背面（或蹲下）；
//   ③「就不能马车从远处开过来 直接从左侧出现吗」——板车单向：从画框左外
//     驶入、往东出画，绝不在两点之间来回横推。
function TestC2Evasion() {
  const state = CreateGame(1);
  const idx = ChapterBeatList(1).findIndex((b) => b.id === "c2_mother");
  DebugJump(state, 1, idx);
  const def = CurrentBeatDef(state);
  assert.equal(def.id, "c2_mother");
  assert.ok(!JSON.stringify(def).includes("按住"), "「娘按住你」不许再作为提示文案出现——它得是动作，不是字幕");

  const scene = SCENES.village;
  const mother = state.actors.find((a) => a.id === "mother");
  const sweep1 = state.actors.find((a) => a.id === "sweep1");
  assert.ok(mother && sweep1);
  assert.ok(sweep1.scanEvery > 0, "巡逻必须会停下回头扫，否则掩体背面一藏就是一劳永逸");

  // ① 把玩家丢在灯里站着，娘应当扑过来把他按下去
  state.player.x = 62; state.player.level = "surface"; state.player.crouch = false;
  mother.x = 66;
  sweep1.x = 71; sweep1.heading = -1; sweep1.patrol = null; sweep1.scanEvery = 0;
  let pressed = false, motherPose = null;
  for (let i = 0; i < 120 && !pressed; i += 1) {
    StepGame(state, { moveX: 0, climb: 0, crouch: false, interact: false, interactHeld: false, throw: false, advance: false }, DT);
    if (state.pressHold) { pressed = true; motherPose = mother.pose; }
  }
  assert.ok(pressed, "站在灯里，娘应该扑回来把柱子按下去（不是屏幕下方写一行字）");
  assert.equal(motherPose, "press", "按住的那一下娘必须有对应姿势——不许人站着不动、字幕替她做");
  const heldX = state.player.x;
  StepGame(state, { moveX: 1, climb: 0, crouch: false, interact: false, interactHeld: false, throw: false, advance: false }, DT);
  assert.ok(Math.abs(state.player.x - heldX) < 0.02, "被按住的那一下推方向键也走不动——「按住」得真的按得住");
  assert.ok(state.player.crouch && state.player.hidden, "被按下去就该藏住了：这一下必须真的管用");

  // ② 娘自己也得躲：等按住结束、灯还在，她应当退到掩体背面（或蹲下）
  let guard = 0;
  while (state.pressHold && (guard += 1) < 200) {
    StepGame(state, { moveX: 0, climb: 0, crouch: false, interact: false, interactHeld: false, throw: false, advance: false }, DT);
  }
  state.player.x = 70; state.player.crouch = true;          // 玩家自己藏好，别再触发救援
  sweep1.x = 62; sweep1.heading = 1;                        // 灯从西边照过来，冲着娘
  mother.x = 66;
  let motherSafe = false;
  for (let i = 0; i < 300 && !motherSafe; i += 1) {
    StepGame(state, { moveX: 0, climb: 0, crouch: true, interact: false, interactHeld: false, throw: false, advance: false }, DT);
    motherSafe = !SoldierSeesPlayer(scene, sweep1,
      { x: mother.x, level: "surface", hidden: false, crouch: !!mother.crouch }, VisionScale(state));
  }
  assert.ok(motherSafe, "灯扫过来时娘必须自己找掩体——她不能站在亮地里不眨眼");

  // ③ 板车：单向。从玩家西边（画框左外）驶入，一路往东出画，再从西边重来
  const state2 = CreateGame(1);
  DebugJump(state2, 1, idx);
  state2.player.x = 90;                                     // 走到长空地跟前，发车
  const cv = CurrentBeatDef(state2).convoy;
  assert.ok(cv.spawn < cv.exit, "板车必须从西往东单向走");
  let sawSpawn = false, sawExit = false, lastX = null, reversed = false, spawnedWestOfPlayer = false;
  for (let i = 0; i < 60 * 30; i += 1) {
    StepGame(state2, { moveX: 0, climb: 0, crouch: false, interact: false, interactHeld: false, throw: false, advance: false }, DT);
    const x = state2.cart ? state2.cart.x : null;
    if (x !== null && lastX === null) {
      sawSpawn = true;
      if (x < state2.player.x - 6) spawnedWestOfPlayer = true;   // 从远处、画框左外进来
    }
    if (x === null && lastX !== null) sawExit = true;
    if (x !== null && lastX !== null && x < lastX - 1e-6) reversed = true;
    lastX = x;
  }
  assert.ok(sawSpawn && spawnedWestOfPlayer, "板车要从玩家西边的远处驶来（画框左外），不是就地出现");
  assert.ok(sawExit, "板车要开出画去，不是停在原地");
  assert.ok(!reversed, "板车绝不许倒着走——来回横推就成了「等一辆来回开的公交车」");

  // ④ 石子换窗口：石子落在灯的**背后**，他就得把脸转过去，玩家当场脱离照射。
  // 规则是"扔过他头顶"——投掷平飞 7.5m，而站着的视距 10.8m，所以想扔到他背后
  // 就得先蹲着摸近（蹲着的视距只有 7m）。只让他"走到响动跟前"是不够的：石子
  // 落在他脚边时他几乎不挪窝，脸还冲着原来那一头，那颗石子就白扔了。
  const st3 = CreateGame(1);
  DebugJump(st3, 1, idx);
  const g = (id) => st3.actors.find((a) => a.id === id);
  const lamp = g("sweep1");
  lamp.x = 79.5; lamp.heading = -1; lamp.patrolDir = -1; lamp.scanEvery = 0; lamp.patrol = null;
  g("sweep2").visible = false; g("searcher").x = 40;
  st3.player.x = CurrentBeatDef(st3).stonePile.x;
  const none = () => ({ moveX: 0, climb: 0, crouch: false, interact: false, interactHeld: false, throw: false, advance: false });
  const seen = () => SoldierSeesPlayer(scene, lamp,
    { x: st3.player.x, level: "surface", hidden: false, crouch: st3.player.crouch }, VisionScale(st3));
  for (let i = 0; i < 4; i += 1) StepGame(st3, { ...none(), interact: true }, DT);
  assert.equal(st3.player.item?.id, "stone", "潜行段路边该有一堆石子捡得起来");
  assert.ok(seen(), "布置有误：扔石子之前玩家本该在灯里");
  for (let i = 0; i < 3; i += 1) StepGame(st3, { ...none(), moveX: 1 }, DT);   // 面朝东
  StepGame(st3, { ...none(), throw: true }, DT);
  let freed = 0;
  for (let i = 0; i < 150; i += 1) { StepGame(st3, none(), DT); if (!seen()) freed += 1; }
  assert.ok(freed > 90, `石子该把灯引开三秒以上（实测 ${(freed * DT).toFixed(1)}s）——引不开就不算一条出路`);
  console.log("  ✓ 二章躲避：娘真的按住你 / 娘自己躲掩体 / 板车从远处单向驶来 / 石子引得开灯");
}

// 翻越：三处可翻越物都得真的翻得过去——而且是"翻"，不是换个姿势平移过去。
// 这条断言是补出来的：翻越以前只有一个静止姿势 + 一条直线位移，人从不离地，
// 玩起来就跟没做一样（关卡设计文档里它一直挂着"待实装"）。
function TestVaultC1() {
  const NONE = { moveX: 0, climb: 0, crouch: false, interact: false, interactHeld: false, advance: false };
  const list = ChapterBeatList(0);
  const cases = [
    { beat: "c1_cloth", from: 79, to: 92, top: 0.82, label: "塌进巷子的院墙（教学）" },
    { beat: "c1_cloth", from: 92, to: 79, top: 0.82, label: "塌进巷子的院墙（回程复用）" },
    { beat: "c1_hide", from: 42, to: 32, top: 0.72, label: "倒塌的柴垛（扫荡压力下）" },
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
    // 髋必须真的越过顶沿，又不许飞到齐胸——「翻」既不能是平移，也不能是腾空。
    // 用髋的绝对高度判，不再挂在某个倍率上：换了障碍高度这条断言照样成立。
    const hipRest = 0.62 * 0.80;                 // 柱子在第一章是 0.80 的体型
    const hipPeak = hipRest + peakLift;
    assert.ok(hipPeak > c.top + 0.05,
      `${c.label}：髋顶到 ${hipPeak.toFixed(2)}，没越过 ${c.top} 的顶沿——那是平移不是翻`);
    assert.ok(hipPeak < c.top + 0.45,
      `${c.label}：髋顶到 ${hipPeak.toFixed(2)}，比顶沿高出太多——腾空了，撑手就按不住墙头`);
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

// 落地道具：自由放下（落点避开掩体足迹）→ 悬浮气泡 → 拾回。
// 掩体带的 z 专职挡人，桶落进草垛=凭空消失——DropSpot 必须把落点推出去。
// 半路把东西撂下，链不许卡死。
// 「手里的东西随时能放下」和链里那句「必须从手里放在这儿」不接上的话，
// 只要玩家在走到木料堆之前随手放下水桶，链就永远停在那一步：没有提示、
// 后面那截绳头捡不起来、按 E 毫无反应——玩家只会以为游戏坏了。
function TestChainSurvivesEarlyDrop() {
  const state = CreateGame(0);
  const water = ChapterBeatList(0).find((b) => b.id === "c1_water");
  DebugJump(state, 0, water.index);
  const step = (input = {}, n = 1) => {
    for (let i = 0; i < n; i += 1) {
      StepGame(state, {
        moveX: 0, climb: 0, crouch: false, interact: false, interactHeld: false,
        throw: false, advance: false, ...input,
      }, DT);
    }
  };
  // 开拍娘的派活 micro-cine 在第一帧起——先推完
  step({}, 1);
  for (let i = 0; i < 300 && state.microCine; i += 1) step({ advance: true });
  // 拎桶 → 挂井绳（发现绳断）
  state.player.x = 31; state.player.level = "surface";
  step({}, 3); step({ interact: true });
  assert.equal(state.player.item?.id, "bucket", "先得拎起桶");
  state.player.x = SCENES.village.zones.well.x; step({}, 3); step({ interact: true });
  assert.equal(state.flags.wellRopeBroken, true, "挂桶必须发现绳断了");
  // ★ 半路（不在木料堆）随手把桶撂下
  state.player.x = 50; step({}, 24); step({ interact: true });
  assert.equal(state.player.item, null, "半路应该放得下");
  assert.equal(state.groundItems.length, 1, "桶该躺在半路上");
  // 走到绳头：这一截必须捡得起来，不能没反应
  state.player.x = 70; step({}, 6);
  assert.ok(state.prompt && state.prompt.includes("绳"),
    `站到绳头处必须给得出提示，实为 ${JSON.stringify(state.prompt)}`);
  step({ interact: true });
  assert.equal(state.player.item?.id, "rope", "半路撂过桶，也必须捡得起绳头");
  // 接着把绳接上，链就走到「折回取桶」——这时撂在远处的桶必须被标出来，
  // 否则玩家根本不知道自己把它扔哪儿了
  state.player.x = SCENES.village.zones.well.x;
  step({}, 3);
  step({ interactHeld: true }, Math.ceil(6 / DT));
  assert.equal(state.flags.wellRopeBroken, false, "绳该接好了");
  step({}, 3);
  const marked = state.bubbles.some((b) => b.icon === "item:空水桶");
  assert.ok(marked, "折回取桶时，撂在远处的桶必须挂气泡");
  // 走回去真的能捡起来
  const g = state.groundItems.find((it) => it.id === "bucket");
  state.player.x = g.x; step({}, 3); step({ interact: true });
  assert.equal(state.player.item?.id, "bucket", "撂在哪儿就该能从哪儿捡回来");
  console.log("  ✓ 链不怕半路撂东西：绳头照样捡得起，撂下的桶有气泡标着、捡得回来");
}

function TestGroundItems() {
  const state = CreateGame(0);
  const water = ChapterBeatList(0).find((b) => b.id === "c1_water");
  DebugJump(state, 0, water.index);
  const step = (input = {}, n = 1) => {
    for (let i = 0; i < n; i += 1) {
      StepGame(state, {
        moveX: 0, climb: 0, crouch: false, interact: false, interactHeld: false,
        throw: false, advance: false, ...input,
      }, DT);
    }
  };
  // 开拍娘先喊一嗓子派活（micro-cine 在第一帧起）——推完再开始拎桶
  step({}, 1);
  for (let i = 0; i < 300 && state.microCine; i += 1) step({ advance: true });
  // 链步骤一：拎起屋里的水桶
  state.player.x = 31;
  state.player.level = "surface";
  step({}, 2);
  step({ interact: true });
  assert.equal(state.player.item?.id, "bucket", "链步骤一：要能拎起水桶");
  // 拾取后的保护窗：紧接着的 E 不许顺手把它又扔了
  step({ interact: true });
  assert.equal(state.player.item?.id, "bucket", "刚拿起的东西不许被同一串 E 顺手放下");
  // 站进 hayB 草垛掩体（x=68, w=3.2）正中间放下：落点必须被推出掩体足迹
  state.player.x = 68;
  step({}, 14);
  step({ interact: true });
  assert.equal(state.player.item, null, "空地上按 E 要能自由放下");
  assert.equal(state.groundItems.length, 1, "放下后地上要有一件落地道具");
  const g = state.groundItems[0];
  assert.ok(g.x <= 65.9 + 1e-6 || g.x >= 70.1 - 1e-6,
    `落点必须避开 hayB 掩体足迹（实际 x=${g.x}）`);
  // 悬浮提示：附近要有它自己的小样气泡
  state.player.x = g.x - 1.2;
  step({});
  assert.ok(state.bubbles.some((b) => b.icon === "item:空水桶"), "落地道具头顶要挂小样气泡");
  // 走近拾回
  state.player.x = g.x;
  step({ interact: true });
  assert.equal(state.player.item?.id, "bucket", "走近按 E 要能拾回");
  assert.equal(state.groundItems.length, 0, "拾回后地上不该有残影");
  console.log("  ✓ 落地道具：自由放下避开掩体足迹、悬浮气泡、拾回");
}

// 接绳打结（键盘后备路径）：按住 E 缠满一圈再收紧，井绳必须接好
function TestKnotKeyboardFallback() {
  const state = CreateGame(0);
  const water = ChapterBeatList(0).find((b) => b.id === "c1_water");
  DebugJump(state, 0, water.index);
  const step = (input = {}, n = 1) => {
    for (let i = 0; i < n; i += 1) {
      StepGame(state, {
        moveX: 0, climb: 0, crouch: false, interact: false, interactHeld: false,
        throw: false, advance: false, ...input,
      }, DT);
    }
  };
  // 直接把链推进到接绳那一步：桶已放下、绳已在手
  state.beat.stepIndex = 4;
  state.flags.wellRopeBroken = true;
  state.flags.bucketAt = 70.1;
  state.groundItems.push({ uid: "gT", id: "bucket", label: "空水桶", x: 70.1, level: "surface" });
  state.player.item = { id: "rope", label: "麻绳" };
  state.player.x = SCENES.village.zones.well.x;
  state.player.level = "surface";
  step({ interactHeld: true }, Math.ceil(3.0 / DT));
  assert.ok(state.beat.knotState?.t >= 1, "按住 E 必须能把绳缠满");
  step({ interactHeld: true }, Math.ceil(1.2 / DT));
  assert.equal(state.flags.wellRopeBroken, false, "收紧后井绳必须接好");
  assert.equal(state.player.item, null, "麻绳缠上去就离手了");
  console.log("  ✓ 接绳打结：键盘后备路径能缠满并勒紧");
}

// 辘轳是个转盘，不是一根拉杆：鼠标绕轴心转圈才走绳——顺时针放、逆时针收、
// 脱手倒转；上手的同时镜头必须推成井口特写（不在大全景下摇转盘）。
function TestWinchIsACrankNotALever() {
  const state = CreateGame(0);
  const water = ChapterBeatList(0).find((b) => b.id === "c1_water");
  DebugJump(state, 0, water.index);
  const step = (input = {}, n = 1) => {
    for (let i = 0; i < n; i += 1) {
      StepGame(state, {
        moveX: 0, climb: 0, crouch: false, interact: false, interactHeld: false,
        throw: false, advance: false, ...input,
      }, DT);
    }
  };
  // 直接把链推进到辘轳那一步：绳已接好、桶在手里
  state.beat.stepIndex = 6;
  state.flags.wellRopeBroken = false;
  state.player.item = { id: "bucket", label: "空水桶" };
  const wx = SCENES.village.zones.well.x;
  state.player.x = wx;
  state.player.level = "surface";
  step({}, 2);
  step({ interact: true });   // 挂上辘轳
  const w = state.beat.winch;
  assert.ok(w?.hooked, "拿着桶按 E 必须挂上辘轳");
  step({});
  assert.ok(state.closeUp, "挂上辘轳后镜头必须推成井口特写");
  assert.ok(state.closeUp.hw < 4, `特写景别要真的近（实际 ${state.closeUp?.hw}）`);

  const hubY = WINCH_HUB_Y;   // SURFACE_Y = 0
  const circle = (dir, n) => {
    // dir=-1 顺时针（放绳）/ +1 逆时针（摇起）。步长 0.3rad/帧，半径 0.5
    for (let i = 0; i < n; i += 1) {
      const a = (state.beat.winch.prevA ?? 0) + dir * 0.3;
      step({ pointerHeld: true, pointerWorld: { x: wx + Math.cos(a) * 0.5, y: hubY + Math.sin(a) * 0.5 } });
    }
  };
  // 顺时针绕圈：绳往下走
  step({ pointerHeld: true, pointerWorld: { x: wx + 0.5, y: hubY } });   // 手搭上转盘
  const d0 = w.depth;
  circle(-1, 8);
  assert.ok(w.depth > d0 + 0.1, `顺时针转了两圈半，桶得实实在在往下走（${d0}→${w.depth}）`);
  assert.equal(state.gesture?.kind, "crankDown", "放绳阶段的手势提示是顺时针转圈");
  // 逆时针倒着转不放绳
  const d1 = w.depth;
  circle(1, 6);
  assert.ok(w.depth <= d1 + 1e-9, "空桶阶段逆时针转不该把绳送下去");
  // 一路顺时针到触水
  circle(-1, 60);
  assert.ok(w.filled, "转到底桶必须触水灌满");
  // 逆时针往上摇
  const d2 = w.depth;
  circle(1, 10);
  assert.ok(w.depth < d2 - 0.08, `满桶逆时针摇，绳得往上收（${d2}→${w.depth}）`);
  assert.equal(state.gesture?.kind, "crankUp", "摇起阶段的手势提示是逆时针转圈");
  const crankMid = w.crankA;
  // 脱手：过了棘齿宽限辘轳倒转，桶自己往下坠，摇把跟着倒着抡
  const d3 = w.depth;
  step({}, Math.ceil(1.2 / DT));
  assert.ok(w.depth > d3 + 0.15, "脱手过了宽限，辘轳必须倒转（桶坠回去）");
  assert.ok(w.crankA < crankMid, "倒转时摇把必须真的倒着转（crankA 回退）");
  // 键盘 W 仍是完整后备：一路摇到顶
  step({ climb: -1 }, Math.ceil(4.2 / DT));
  assert.equal(CurrentBeatDef(state)?.steps?.[state.beat.stepIndex]?.type === "winch", false,
    "键盘 W 摇到顶必须能收完这一步");
  assert.equal(state.player.item?.id, "fullBucket", "摇上来手里必须是一桶水");
  console.log("  ✓ 辘轳转盘：顺放逆收 / 特写推近 / 脱手倒转 / 键盘后备");
}

// 石笔：玩家攥的是一支笔，不是一根滑块。三条硬规矩各验一遍。
function TestChalkIsAPencilNotASlider() {
  const carve = ChapterBeatList(0).find((b) => b.id === "c1_carve");
  const mk = () => {
    const state = CreateGame(0);
    DebugJump(state, 0, carve.index);
    state.player.x = 34;
    state.player.level = "surface";
    return state;
  };
  const step = (state, input = {}, n = 1) => {
    for (let i = 0; i < n; i += 1) {
      StepGame(state, {
        moveX: 0, climb: 0, crouch: false, interact: false, interactHeld: false,
        throw: false, advance: false, ...input,
      }, DT);
    }
  };
  const LINE_Y = 1.28;          // c1_carve 的 markY
  const X0 = 34 - 0.52, X1 = 34 + 0.52;

  // ① 手没落在笔上就按下去拖：笔不动（这正是"不是 slider"的意思）
  {
    const s = mk();
    step(s, {}, 2);
    for (let i = 0; i < 40; i += 1) {
      step(s, { pointerHeld: true, pointerWorld: { x: X0 + 0.9 + i * 0.01, y: LINE_Y } });
    }
    assert.equal(s.beat.drawn, 0, "手没抓着笔，怎么拖都不该划出印子");
  }

  // ② 攥住笔再拉：印子跟着出来，且笔有摩擦——拉不过 CHALK_SPEED
  {
    const s = mk();
    step(s, {}, 2);
    step(s, { pointerHeld: true, pointerWorld: { x: X0, y: LINE_Y } });   // 落在笔尖上=攥住
    assert.ok(s.beat.grabbed, "手落在笔身上按下去，必须攥得住");
    // 手瞬间甩到另一头：笔只能一寸一寸蹭过去，一帧绝不会到底
    step(s, { pointerHeld: true, pointerWorld: { x: X1, y: LINE_Y } });
    assert.ok(s.beat.drawn > 0, "攥住往前拉，必须留下印子");
    assert.ok(s.beat.drawn < 0.2, `笔有摩擦，一帧不该窜到 ${s.beat.drawn}`);
    // 玩家要做的事，画面上事先不能已经做完了：门框此刻必须还是空的
    assert.equal(s.flags.marked, false, "没划完之前，门框上不该已经有那道刻痕");
    // 一直拉到底
    step(s, { pointerHeld: true, pointerWorld: { x: X1, y: LINE_Y } }, 120);
    assert.notEqual(CurrentBeatDef(s)?.id, "c1_carve", "拉满一道线，这一拍必须过");
    assert.equal(s.flags.marked, true, "划完了，刻痕才长在门框上");
  }

  // ③ 手飘离刻线：笔脱手，印子当场停住
  {
    const s = mk();
    step(s, {}, 2);
    step(s, { pointerHeld: true, pointerWorld: { x: X0, y: LINE_Y } });
    // 只拖 4 帧：DT=1/30 下笔速 0.62m/s，帧数多了 15 公分的线会直接划完、
    // 节拍推进，脱手就没得验了
    step(s, { pointerHeld: true, pointerWorld: { x: X0 + 0.3, y: LINE_Y } }, 4);
    const drawnBefore = s.beat.drawn;
    assert.ok(drawnBefore > 0, "先得划出一点");
    step(s, { pointerHeld: true, pointerWorld: { x: X1, y: LINE_Y + 0.9 } }, 30);
    assert.equal(s.beat.grabbed, false, "手抬离刻线太远，笔必须脱手");
    assert.equal(s.beat.drawn, drawnBefore, "脱手之后印子不该再长");
  }

  // ④ 键盘后备仍在（自动通关测试与无鼠标的玩家都靠它）
  {
    const s = mk();
    step(s, {}, 2);
    step(s, { interactHeld: true, moveX: 1 }, 200);
    assert.notEqual(CurrentBeatDef(s)?.id, "c1_carve", "按住 E 往右推必须也能划完");
  }
  console.log("  ✓ 石笔：抓不住就划不动 / 有摩擦 / 会脱手 / 键盘后备可用");
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
  // 开拍娘先直起腰喊人（micro-cine 派活），喊完 tick 会把她放回锄地——
  // 先把这句喊话推完再验工位
  const m2 = state.actors.find((a) => a.id === "mother");
  assert.ok(state.microCine, "打水开拍娘必须喊一嗓子派活");
  assert.equal(m2?.track, null, "喊话的娘得直起腰，不能一边锄地一边喊");
  for (let i = 0; i < 300 && state.microCine; i += 1) StepGame(state, { ...idle, advance: true }, DT);
  StepGame(state, idle, DT);
  assert.equal(state.actors.find((a) => a.id === "father")?.track?.name, "sawing", "打水时爹必须在拉锯");
  assert.equal(m2?.track?.name, "hoeing", "喊完话娘必须回去锄地");
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

  // 爹的示范 + 柱子自己上前接手。**这一段绝不许在测试里挪 player.x**——
  // 上一版每处断言都先 `state.player.x = workX` 把人瞬移到工位，正好跳过了
  // "玩家怎么走到工位"这一整段；线上示范一完人站在判定圈外，屏幕上什么都不出，
  // 全绿的测试一个字都没提。凡是"玩家自己要走到某处"的节拍，测试必须走真实路径。
  const workX = def.zone.x - 0.55;
  for (let i = 0; i < 200; i += 1) StepGame(state, idle(), DT);
  assert.ok(state.planing, "刨料期间台面上必须有那块料");
  assert.ok(Math.abs(state.player.x - workX) < 0.06,
    `示范完必须由节拍把柱子送到工位（现在停在 ${state.player.x.toFixed(2)}，工位 ${workX}）`);
  assert.ok(state.dragTrack && state.dragTrack.drag, "站到工位就必须亮出拖动轨道，玩家不该猜该干什么");

  // ① 按住 A/D 不许把人走开——这一拍人钉在台前（上一版按住 D 能一路散步）
  for (let i = 0; i < 40; i += 1) StepGame(state, { ...idle(), moveX: 1 }, DT);
  assert.ok(Math.abs(state.player.x - workX) < 0.06, "刨料时走路输入不该把人挪走");
  // 键盘后备（CLAUDE.md：鼠标玩法必须留等价按键路径，否则自动通关卡死）：
  // 光按住 E 就推得动，而且**不掺 A/D**——方向由这一趟的状态给
  const beforeKb = state.planing.u;
  for (let i = 0; i < 12; i += 1) StepGame(state, { ...idle(), interactHeld: true }, DT);
  assert.ok(state.planing.u > beforeKb, "按住 E 必须能把刨子推出去（键盘后备）");

  // ② 倒着拖不吃木头
  const before = state.planing.smooth;
  for (let i = 0; i < 20; i += 1) StepGame(state, { ...idle(), dragX: -0.05 }, DT);
  assert.equal(state.planing.smooth, before, "回程不该刨掉木头");

  // ③ 一趟推到底：刨花出来、木头亮一分
  let guard = 0;
  while (state.planing && state.planing.smooth === before && guard < 400) {
    guard += 1;
    StepGame(state, { ...idle(), dragX: 0.05 }, DT);
  }
  assert.ok(state.planing === null || state.planing.smooth > before, "一趟推到底必须刨掉一层");
  assert.ok(state.flags.planedOnce, "第一趟推完必须落旗");

  // ④ 中间顿一下：这一趟不齐，刨花短一截（但仍然算数，不会卡死）
  const s2 = CreateGame(0);
  DebugJump(s2, 0, beats.indexOf("c1_tenon"));
  for (let i = 0; i < 200; i += 1) StepGame(s2, idle(), DT);
  for (let i = 0; i < 6; i += 1) StepGame(s2, { ...idle(), dragX: 0.05 }, DT);
  for (let i = 0; i < 20; i += 1) StepGame(s2, idle(), DT);          // 停在半道
  let g2 = 0, curlLen = null;
  while (s2.planing && g2 < 400) {
    g2 += 1;
    StepGame(s2, { ...idle(), dragX: 0.05 }, DT);
    if (s2.planeCurl && curlLen === null) { curlLen = s2.planeCurl.len; break; }
  }
  assert.ok(curlLen !== null && curlLen < 1, "顿过的那一趟，刨花必须短一截");

  // ⑤ 自动通关能过（不会卡在"推到头忘了拖回来"）
  const s3 = CreateGame(0);
  DebugJump(s3, 0, beats.indexOf("c1_tenon"));
  let g3 = 0;
  while (CurrentBeatDef(s3)?.id === "c1_tenon" && g3 < 3000) {
    g3 += 1;
    const t = GetBeatTarget(s3);
    const inp = idle();
    if (t?.action === "planeAt") inp.dragX = t.back ? -0.05 : 0.05;
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
TestCoverIsDirectional();
TestClimb();
TestSmokeFront();
TestDetectionReset();
TestStealthEscapable();
TestC2Evasion();
// 拟物做功（CLAUDE.md「拟物交互」）：长做功不许是进度条——手真的动，功才涨。
// 三条硬断言：①对的方向的笔画涨、错的方向不涨；②绕圈真的要绕（指针停着不涨）；
// ③键盘按住 E 仍是完整后备（自动通关只按键盘）。
function TestStrokeWork() {
  const idle = () => ({ moveX: 0, climb: 0, crouch: false, interact: false, interactHeld: false, throw: false, advance: false });
  const beats4 = ChapterBeatList(3).map((b) => b.id);

  // — c4_shore 顶撑木（stroke:"up"）—
  const st = CreateGame(3);
  DebugJump(st, 3, beats4.indexOf("c4_shore"));
  const shore = SCRIPTS.c4.find((b) => b.id === "c4_shore");
  const upStep = shore.steps.find((x) => x.stroke === "up");
  assert.ok(upStep, "撑木必须声明向上的笔画");
  StepGame(st, idle(), DT);              // 先让链初始化（onStart / holdP 建账）
  st.beat.stepIndex = shore.steps.indexOf(upStep);
  st.player.item = { id: "prop", label: "撑木", big: true };
  st.player.x = upStep.zone.x; st.player.level = "under";
  StepGame(st, idle(), DT);
  // 往下拽（错方向）：不涨
  for (let i = 0; i < 20; i += 1) StepGame(st, { ...idle(), pullHeld: true, pull: 0.05 }, DT);
  assert.equal(st.beat.holdP, 0, "撑木往下拽不该涨（方向要对）");
  // 往上顶：涨
  for (let i = 0; i < 12; i += 1) StepGame(st, { ...idle(), pullHeld: true, pull: -0.05 }, DT);
  assert.ok(st.beat.holdP > 0, "往上顶必须做得上功");
  assert.equal(st.gesture?.kind, "pullUp", "HUD 得提示往上顶");
  // 松手泄劲
  const was = st.beat.holdP;
  for (let i = 0; i < 10; i += 1) StepGame(st, idle(), DT);
  assert.ok(st.beat.holdP < was, "松手功要慢慢泄掉");
  // 键盘后备干完
  let g1 = 0;
  while (st.beat.stepIndex === shore.steps.indexOf(upStep) && g1 < 400) {
    g1 += 1; StepGame(st, { ...idle(), interactHeld: true }, DT);
  }
  assert.ok(g1 < 400, "键盘按住 E 必须能把撑木顶上去");

  // — c5 拴铃（stroke:"circle"）：指针停着不涨，绕着圈走才涨 —
  const beats5 = ChapterBeatList(4).map((b) => b.id);
  const s5 = CreateGame(4);
  const bellBeat = SCRIPTS.c5.findIndex((b) => b.steps?.some((x) => x.stroke === "circle"));
  assert.ok(bellBeat >= 0, "c5 必须有绕圈的笔画（拴绳/拴铃）");
  DebugJump(s5, 4, bellBeat);
  const chain5 = SCRIPTS.c5[bellBeat];
  const circStep = chain5.steps.find((x) => x.stroke === "circle");
  StepGame(s5, idle(), DT);              // 同上：先初始化链
  s5.beat.stepIndex = chain5.steps.indexOf(circStep);
  s5.player.item = { id: circStep.needs, label: "麻绳" };
  s5.player.x = circStep.zone.x; s5.player.level = circStep.zone.level || "under";
  const baseY = (circStep.zone.level === "under" || s5.player.level === "under") ? UNDER_Y : SURFACE_Y;
  const cy = baseY + (circStep.gestureY ?? 1.25);
  // 指针钉在一个点上：不涨
  for (let i = 0; i < 20; i += 1) {
    StepGame(s5, { ...idle(), pointerHeld: true, pointerWorld: { x: circStep.zone.x + 0.8, y: cy } }, DT);
  }
  assert.equal(s5.beat.holdP, 0, "指针停着不动，圈就没绕，不该涨");
  // 真的绕圈：涨（先只绕小半圈采样——绕满一圈这步就干完了，holdP 会归零）
  const stepIdx = s5.beat.stepIndex;
  for (let i = 0; i < 9; i += 1) {
    const a = i * 0.3;
    StepGame(s5, { ...idle(), pointerHeld: true, pointerWorld: {
      x: circStep.zone.x + Math.cos(a) * 0.8, y: cy + Math.sin(a) * 0.8,
    } }, DT);
  }
  assert.ok(s5.beat.holdP > 0, "绕着圈走必须做得上功");
  // 接着绕到头：这一步必须真的能绕完
  let g2c = 0;
  while (s5.beat.stepIndex === stepIdx && g2c < 300) {
    g2c += 1;
    const a = (9 + g2c) * 0.3;
    StepGame(s5, { ...idle(), pointerHeld: true, pointerWorld: {
      x: circStep.zone.x + Math.cos(a) * 0.8, y: cy + Math.sin(a) * 0.8,
    } }, DT);
  }
  assert.ok(g2c < 300, "绕圈必须能把绳拴完");
  console.log("  ✓ 拟物做功：方向要对 / 圈要真绕 / 松手泄劲 / 键盘后备");
}

TestPromptsAreDeviceNeutral();
TestStrokeWork();
TestWorkStations();
TestVaultC1();
TestGroundItems();
TestChainSurvivesEarlyDrop();
TestKnotKeyboardFallback();
TestWinchIsACrankNotALever();
TestChalkIsAPencilNotASlider();
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
