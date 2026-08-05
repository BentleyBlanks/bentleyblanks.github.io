// 《地道里的光》核心逻辑冒烟测试（横版 2.5D 版）：
// 1) 自动通关驱动器把全部八章从头打到尾（两条第六章分支都走一遍）——可完成性是硬门槛；
// 2) 横向视线、爬梯、烟推进等机制的定点断言。
// 运行：node TunnelLight1943/Script_SmokeTest.mjs

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  CHAPTERS, SCENES, CreateGame, StepGame, GetBeatTarget, MakeChoice, CurrentBeatDef,
  SoldierSeesPlayer, SmokeCovers, VisionScale, ChapterBeatList, DebugJump,
} from "./Script_Core.mjs";
import { CHAPTER_BGM } from "./Data_BgmConfig.mjs";

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
        if (target.action === "holdAt" && Math.abs(dx) <= 1.35) {
          if (!(target.pauseOnQuake && state.beat.quakeActive)) input.interactHeld = true;
          input.moveX = 0;
        }
      }
    }

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
      StepGame(state, input, DT);   // 不钳 detection：真失败就让它失败
    }
    assert.notEqual(state.beatIndex, startBeat,
      `${c.label}：一路直走 60 秒也没过去（被抓 ${state.flags.resets} 次）——这段跑不掉`);
    console.log(`  ✓ ${c.label} 可逃脱（笨玩家 ${t.toFixed(1)}s，被抓 ${state.flags.resets} 次）`);
  }
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
  console.log("  ✓ 八章纯器乐 BGM 清单 / 文件 / 淘汰规则");
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
TestInstrumentalBgmManifest();

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
