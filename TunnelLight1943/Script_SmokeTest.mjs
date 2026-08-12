// 《地道里的光》核心逻辑冒烟测试（横版 2.5D 版）：
// 1) 自动通关驱动器把全部八章从头打到尾（两条第六章分支都走一遍）——可完成性是硬门槛；
// 2) 横向视线、爬梯、烟推进等机制的定点断言。
// 运行：node TunnelLight1943/Script_SmokeTest.mjs

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import {
  CHAPTERS, SCENES, SCRIPTS, CreateGame, StepGame, GetBeatTarget, MakeChoice, CurrentBeatDef,
  SoldierSeesPlayer, SmokeCovers, VisionScale, ChapterBeatList, DebugJump, SplitPrompt,
  WINCH_HUB_Y, WINCH_CRANK_DX, WINCH_CRANK_R, WINCH_STAND_DX,
  SURFACE_Y, UNDER_Y, SCRIBE_CARD, PLANE_CARD, KNOT_CARD, SLING, SlingSolve,
  EdgeHint, BeatHintIcon, RAID_FORMATION, HouseSpan, IndoorOpen, PushingCart, CAM_CELLAR_PEEK, COVER_PAD,
  UnderSegments, AllRelics, PROLOGUE_SCRIPT, PROLOGUE_CLIPS, SkipPrologue,
  EnterPrologue, PLAY_PROLOGUE,
} from "./Script_Core.mjs";
import { CHAPTER_BGM } from "./Data_BgmConfig.mjs";
import { AUDIO_BUS_BASE, AUDIO_DEFAULT_LEVELS } from "./Data_AudioMix.mjs";
import { VaultLiftFor, VAULT_MAX_TOP, VAULT_MIN_TOP, BAND, ACTOR_Z, PlaceZ, RankDz } from "./Data_DepthSpec.mjs";
import { LightPath, MoodAt, DipAt, LIGHT_MOOD, LIGHT_DIP } from "./Data_DayCycle.mjs";

const DT = 1 / 30;

// ---------------------------------------------------------------------------
// 自动通关驱动器（一维行走 + 爬梯口换层）
// ---------------------------------------------------------------------------
function AutoPlay(state, routeChoice, { maxChapterSeconds = 900, log = false, choicePicks = {} } = {}) {
  let chapterT = 0;
  let lastChapter = state.chapterIndex;
  let lastBeat = -1;
  let tick = 0;             // 帧号：接绳那张卡要靠它数"松一帧再按下去"
  let winchRest = false;    // 满桶摇不动了就撒手喘一口（最优解，也免得在慢档上磨）

  const started = Date.now();
  let frame = 0;
  while (!state.done) {
    frame += 1;
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

    // 征夫告示阅读层要是被误开了（路过 noticeWall 时恰好按了 E），按一下合上——
    // 它会冻结全世界，不关的话超时的是整章
    if (state.noticeOpen) {
      input.interact = true;
      StepGame(state, input, DT);
      continue;
    }

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
      // routeChoice 只管第六章那道（tunnel/ground）；别的抉择按 choicePicks 点名，
      // 没点名的走 options[0]（与跳幕结算同一条默认）
      const opts = def?.options || [];
      const pick = opts.some((o) => o.key === routeChoice) ? routeChoice
        : (choicePicks[def?.id] ?? opts[0]?.key);
      MakeChoice(state, pick);
      continue;
    } else {
      const p = state.player;
      const scene = SCENES[CHAPTERS[state.chapterIndex].scene];
      const targetLevel = target.level || "surface";

      if (p.level !== targetLevel && p.climbT <= 0) {
        // 找可用爬梯口，走过去按 W/S
        const shafts = scene.shafts.filter((s) => !s.builtFlag || state.flags[s.builtFlag]);
        // 下窖要挑**通向目标那一段**的井口。地道没挖通之前自家窖和七叔家窖
        // 是两个腔：从七叔家窖口下去，到不了自家窖（真人也一样，得走回去）
        const segs = UnderSegments(scene, state.flags);
        const segOf = (wx) => segs.find(([a, b]) => wx >= a - 0.6 && wx <= b + 0.6);
        // 下去要挑通向目标那一段的井口；上来只能走**自己这一段**里的井口
        const want = segs.length > 1
          ? (targetLevel === "under" ? segOf(target.x) : segOf(p.x))
          : null;
        let best = null, bestD = Infinity;
        for (const s of shafts) {
          if (state.flags.entWBlocked && s.id === "entW") continue;
          if (want) { const sg = segOf(s.x); if (!sg || sg[0] !== want[0]) continue; }
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
        // 「走到多近算到了」不能写死。判定区是 `|dx| <= zone.w/2`，可驱动器一律
        // 走到 1.15 就撒腿——半宽比 1.15 还窄的区，人就停在区外，按住 E 也按不响。
        // 倒土那个 w:2.6 的猪圈（半宽 1.3）差一点点就栽在这上头，而它旁边
        // w:2.8 的扫帚步一直是过的，所以这坑埋了很久没响过。
        // reach 由 GetBeatTarget 从 zone 自己推出来；留 0.2 的余量踩稳在区里。
        const near = target.reach ? Math.min(1.15, Math.max(0.35, target.reach - 0.2)) : 1.15;
        if ((target.action === "walk" || Math.abs(dx) > near) && !laggard) {
          input.moveX = Math.sign(dx);
        }
        if (target.action === "interactAt" && Math.abs(dx) <= 1.35) input.interact = true;
        if (target.action === "crouchAt" && Math.abs(dx) <= 1.35) { input.crouch = true; input.moveX = 0; }
        // 投掷：走到投掷位、转过身，然后**真的把石子拽开再松手**。
        // 这一步没有按键后备（按一下就必中的那版已删），所以驱动器也只能走
        // 玩家那条路：按在手里那颗石子上攥住 → 把手拖到 SlingSolve 反推出来的
        // 那个点 → 松开。三帧一趟，跟真人的手完全同一套输入。
        if (target.action === "slingAt") {
          // 攥住之后一切以攥住那一刻的手为原点（sl.hx/hy）——拽开的方向会把人
          // 转过去，手却不会跟着换到另一侧，解弧线时不能用当帧朝向重算
          const ax = state.sling ? state.sling.hx : p.x + (p.heading || 1) * 0.24;
          const ay = state.sling ? state.sling.hy : SURFACE_Y + SLING.HAND_Y;
          const sol = state.thrown ? null : SlingSolve(ax, ay, target.aim.x, target.aim.y);
          // 站位容差 0.3：拽的向量是照着手的位置解的，站偏半米弧就带偏。
          // **不为转身多走一步**——为了转身挪那几厘米会在容差边上来回震荡，
          // 人永远出不了手（旧的按键版就为这个把容差放到 1.2）。朝向交给拽开的方向
          if (state.thrown) input.moveX = 0;
          else if (!state.sling && (Math.abs(dx) > 0.3 || !sol)) {
            input.moveX = Math.abs(dx) > 0.3 ? Math.sign(dx) : Math.sign(target.aim.x - p.x);
          } else {
            input.moveX = 0;
            if (!state.sling) { input.pointerHeld = true; input.pointerWorld = { x: ax, y: ay }; }
            else if (Math.hypot(state.sling.vx - sol.vx, state.sling.vy - sol.vy) > 0.25) {
              input.pointerHeld = true;
              input.pointerWorld = { x: ax - sol.vx / SLING.K, y: ay - sol.vy / SLING.K };
            }
            // 拽到位了：这一帧不按 = 松手出手
          }
        }
        // 推车：贴住车帮，按住 E 往推进方向使劲
        if (target.action === "pushAt") {
          if (Math.abs(dx) <= 2.2) { input.interactHeld = true; input.moveX = target.dir; }
          else input.moveX = Math.sign(dx);
        }
        // 辘轳打水的四道手，键盘各有各的开法：放绳按住 S；**墩桶得一下一下
        // 地敲 S**（按住不放不算——墩是"一下"，不是"一直"）；摇上来和最后
        // 把桶横拽到井沿都按住 W。
        // 满桶是力气活——手劲见底就撒开手喘一口（辘轳会往下坠一点，但缓过来
        // 之后摇得快得多，净赚）。这既是最优解，也免得驱动器在慢档上磨半天。
        if (target.action === "winchAt" && Math.abs(dx) <= 1.35) {
          const w = state.beat?.winch;
          const ph = w?.phase || (w?.filled ? "raise" : "lower");
          const stam = w?.stam ?? 1;
          if (ph === "lower") winchRest = false;
          else if (stam <= 0.04) winchRest = true;
          else if (stam >= 0.8) winchRest = false;
          if (ph === "dunk") input.climb = (frame % 6 < 3) ? 1 : 0;
          else input.climb = winchRest ? 0 : (ph === "lower" ? 1 : -1);
          input.moveX = 0;
        }
        // 划线：按住 E 的同时还得左右推，粉笔才走
        if (target.action === "scribeAt" && Math.abs(dx) <= 1.6) {
          input.interactHeld = true;
          input.moveX = 1;
        }
        // 刨料：驱动器只按键盘（CLAUDE.md 铁律），按住 E 就行——方向由节拍自己判。
        // 走位也由节拍接管（爹让开后柱子自动上前），驱动器不用管站位
        // 受伤版刨木（c1_repair）：手抖那口气没喘完就得松手，驱动器照着 rest 松
        if (target.action === "planeAt") input.interactHeld = !state.planing?.rest;
        // 按 E 的距离与上面「走到多近」用同一个数：两个门槛不一致，中间那条缝里
        // 驱动器既不再往前走、也还没开始按，就是死等（这次倒土栽的正是这条缝）
        const holdNear = target.reach ? near : 1.35;
        if (target.action === "holdAt" && Math.abs(dx) <= holdNear) {
          if (!(target.pauseOnQuake && state.beat.quakeActive)) input.interactHeld = true;
          input.moveX = 0;
        }
        // 接绳：没有长按后备了，驱动器得**真的在那张活卡上拖绳头**——攥住、
        // 塞进圈眼、从西边拽出来、再倒手拽三把勒死（见 KnotDrive）。
        // 这也是这条路径唯一的自动化验证：删后备就必须给驱动器一条真输入的路
        if (target.action === "knotAt" && Math.abs(dx) <= 1.35 && target.card) {
          input.moveX = 0;
          KnotDrive(state, input, target, tick);
        }
      }
    }

    // 可翻越物挡在去路上：提示一出来就按下去（翻越是主动动作，不再自动触发）
    if (state.vaultHint) input.interact = true;

    tick += 1;
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
  assert.equal(CHAPTERS.length, 8, "必须完整覆盖八个章节");
  const titles = CHAPTERS.map((c) => c.title).join("|");
  // 一二章按 Notion「剧本新生」（2026-08-11）；三章起仍是旧线，待逐章翻新
  for (const expected of ["善意的谎言", "地洞里的眼睛", "半袋烟的工夫", "最后一盏灯", "东口的铃", "没套的骡车", "地道里的光", "第二道刻痕"]) {
    assert.ok(titles.includes(expected), `缺少章节：${expected}`);
  }
  console.log("  ✓ 章节元数据对齐剧本新生（一二章）与旧档（三章起）");
}

function TestSingleChapterEntry() {
  for (let i = 0; i < CHAPTERS.length; i += 1) {
    const state = CreateGame(i);
    assert.equal(state.chapterIndex, i);
    // 序章不属于任何一章（见 PROLOGUE_SCRIPT），开局放不放由 PLAY_PROLOGUE 定：
    // 开着＝第一章之前直接进 playing 放序章，放完才亮「第一章」那张卡；
    // 关着＝一进来就是章节卡（2026-08-12 用户要求暂时关掉）。
    // 无论开关，**跳幕/从别的章进来一律不放**——它讲的是开场之前的事。
    if (i === 0 && PLAY_PROLOGUE) {
      assert.ok(state.inPrologue, "序章开着时，从头开局应当先进序章");
      assert.equal(state.phase, "playing");
      assert.equal(CurrentBeatDef(state).id, "prologue");
    } else {
      assert.ok(!state.inPrologue, `第 ${i + 1} 章不该放序章`);
      assert.equal(state.phase, "chapterCard");
    }
    StepGame(state, { moveX: 0, climb: 0, crouch: false, interact: false, interactHeld: false, advance: false }, DT);
  }
  console.log(`  ✓ 八个章节均可独立启动（序章${PLAY_PROLOGUE ? "开着：第一章之前先放" : "关着：开局直接上第一章的卡"}）`);
}

// 序章是**独立于八章之外**的一段（2026-08-12 从 SCRIPTS.c1 拆出）。拆之前它是
// c1 第 0 拍，玩家先看见「第一章」的卡、再看两分钟跟这一章无关的家史。
// 这条钉住三件事：c1 里不许再有它、放完要落到「第一章」的卡上、跳过也一样。
function TestPrologueStandsOutsideChapters() {
  assert.equal(PROLOGUE_SCRIPT.length, 1, "序章就一拍");
  assert.equal(PROLOGUE_SCRIPT[0].lines.length, 11, "序章 11 镜");
  assert.equal(PROLOGUE_CLIPS.length, 11, "11 镜各有一段短片");
  for (const [id, beats] of Object.entries(SCRIPTS)) {
    for (const def of beats) {
      assert.ok(!def.prologue, `${id} 里不该再有序章那一拍（${def.id}）`);
    }
  }
  // 跳过：整段结算掉，落到「第一章」的章节卡，当前拍变成 c1 的第 0 拍。
  // **手动进序章**再跳——PLAY_PROLOGUE 关着时开局不会自动进来，但这套机制
  // 仍要有人盯着：等哪天开回来，跳过与落点得还是好的
  const skipped = CreateGame(0);
  EnterPrologue(skipped);
  assert.ok(SkipPrologue(skipped), "序章应当可跳过");
  assert.ok(!skipped.inPrologue, "跳完就不在序章里了");
  assert.equal(skipped.phase, "chapterCard", "跳完亮「第一章」的卡");
  assert.equal(skipped.chapterIndex, 0);
  assert.equal(CurrentBeatDef(skipped).id, "c1_open", "卡之后接的是第一章开场");
  // 正片的过场不给整段跳
  skipped.phase = "playing";
  assert.ok(!SkipPrologue(skipped), "正片的过场不许整段跳");
  console.log("  ✓ 序章独立于八章之外（c1 无序章拍 · 跳过落回第一章卡）");
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

  // 站位按掩体自己的宽度算，别写死坐标：草垛收窄过一次（3.2→2.6m），
  // 写死的 70.2 当场落到掩体范围外，测试红了却跟"正反面"这条规矩毫无关系
  const hideAt = (c, side) => ({
    x: c.x + side * (c.w / 2 + COVER_PAD * 0.5), level: "surface", hidden: false, crouch: false,
  });
  const west = { x: hay.x - hay.w / 2 - 4.7, heading: 1, level: "surface" };   // 灯在草垛西边，朝东照
  const behind = hideAt(hay, 1);
  const front = hideAt(hay, -1);
  assert.ok(!SoldierSeesPlayer(scene, west, behind, 1), "站在草垛背光那一面应藏得住");
  assert.ok(SoldierSeesPlayer(scene, west, front, 1), "站在草垛迎光那一面应露馅——不然掩体就没有正反面");

  // 灯绕到东边：刚才安全的那一侧当场易手，这就是"跟着绕"
  const east = { x: hay.x + hay.w / 2 + 6.7, heading: -1, level: "surface" };
  assert.ok(SoldierSeesPlayer(scene, east, behind, 1), "灯绕到东边后，草垛东侧不再安全");
  assert.ok(!SoldierSeesPlayer(scene, east, front, 1), "灯绕到东边后，草垛西侧才是影子");

  // 矮掩体仍旧要蹲：站着挡不住
  const nearWood = hideAt(wood, 1);
  const woodLamp = { x: wood.x - wood.w / 2 - 3.1, heading: 1, level: "surface" };
  assert.ok(SoldierSeesPlayer(scene, woodLamp, nearWood, 1), "矮柴堆后面站着应被看见");
  assert.ok(!SoldierSeesPlayer(scene, woodLamp, { ...nearWood, crouch: true }, 1), "蹲在矮柴堆后面应藏得住");

  // 钻得进去的掩体（沟/庄稼地/灌木）没有正反面
  const fields = SCENES.fields;
  const inDitch = { x: 6, level: "surface", hidden: false, crouch: true };
  assert.ok(!SoldierSeesPlayer(fields, { x: 2, heading: 1, level: "surface" }, inDitch, 1), "沟里从西边看不见");
  assert.ok(!SoldierSeesPlayer(fields, { x: 12, heading: -1, level: "surface" }, inDitch, 1), "沟里从东边也看不见");
  console.log("  ✓ 掩体有正反面（高/矮 · 易手 · 钻进去的除外）");
}

// 地道不是一开局就通的（2026-08-10 用户退回："地洞从一开始就是通的七叔家，
// 那还挖个几把？"）。这条盯死三件事，别让它悄悄回去：
//   ① 开局：自家窖东壁到此为止，走不到七叔家
//   ② 第七场开工（digStarted）：掌子面推进，但仍然**不通**
//   ③ 第九场（tunnelDug）：连成一条，能一路走到七叔家窖口
function TestTunnelNotDugYet() {
  const v = SCENES.village;
  const g = v.underDig;
  assert.ok(g, "村子必须声明 underDig——没有它地下就是一条从头通到尾的走廊");

  const at = (flags) => UnderSegments(v, flags);
  const closed = at({});
  assert.equal(closed.length, 2, "没开挖之前地下是两个互不相通的腔");
  assert.ok(closed[0][1] <= g.wall + 0.01, `开局自家窖到 ${g.wall} 为止`);
  assert.ok(closed[1][0] >= g.far[0] - 0.01, "七叔家那头的窖是另一段");

  const digging = at({ digStarted: true });
  assert.equal(digging.length, 2, "开工只是掌子面推进，两头**还没通**");
  assert.ok(digging[0][1] > closed[0][1], "开工之后掌子面要往前推");
  assert.ok(digging[0][1] < digging[1][0], "还差最后一层土");

  const done = at({ digStarted: true, tunnelDug: true });
  assert.equal(done.length, 1, "挖通之后是一条");
  assert.ok(done[0][1] >= v.walk.under[1] - 0.01, "通了就能走到七叔家窖口");

  // 真按方向键走一遍：没挖通时人被实土挡住
  const state = CreateGame(0);
  let fwd = 0;
  while (state.phase !== "playing" || CurrentBeatDef(state)?.kind === "cinematic") {
    StepGame(state, { moveX: 0, climb: 0, crouch: false, interact: false, interactHeld: false, advance: true }, DT);
    if ((fwd += 1) > 10000) throw new Error("无法进入第一章玩法段");
  }
  const Walk = (steps) => {
    for (let i = 0; i < steps; i += 1) {
      state.player.cineWalk = null;
      StepGame(state, { moveX: 1, climb: 0, crouch: false, interact: false, interactHeld: false, advance: false }, DT);
    }
  };
  state.player.level = "under";
  state.player.x = 40;
  Walk(400);
  assert.ok(state.player.x <= g.wall + 0.05,
    `没开挖就往东走，应该被自家窖东壁挡住（到了 ${state.player.x.toFixed(2)}）`);
  state.flags.digStarted = true;
  Walk(400);
  assert.ok(state.player.x > g.wall && state.player.x <= g.face + 0.05,
    `开工之后走到掌子面为止（到了 ${state.player.x.toFixed(2)}）`);
  state.flags.tunnelDug = true;
  Walk(600);
  assert.ok(state.player.x > g.far[0], `挖通之后能走进七叔家窖（到了 ${state.player.x.toFixed(2)}）`);
  console.log("  ✓ 挖通之前地道不通：自家窖 →", g.wall, "掌子面 →", g.face, "通了 →", v.walk.under[1]);
}

function TestClimb() {
  const state = CreateGame(0); // 第一章村庄有地窖口
  // 推进到第一个可玩 beat（开场是 cinematic，期间不处理移动输入）
  let fwd = 0;
  while (state.phase !== "playing" || CurrentBeatDef(state)?.kind === "cinematic") {
    StepGame(state, { moveX: 0, climb: 0, crouch: false, interact: false, interactHeld: false, advance: true }, DT);
    if ((fwd += 1) > 10000) throw new Error("无法进入第一章玩法段");
  }
  // 梯子口的坐标从场景数据读，别写死——它挪过几回（27→37→29，最后挪进屋里）
  state.player.x = SCENES.village.shafts[0].x;
  state.player.level = "surface";
  // 开场那一拍给玩家挂了走位（c1_door 的过场），不清掉的话人会被一路拖离
  // 梯口，等爬梯锁定走完就够不着梯子了——这条验的是梯子，不是过场
  state.player.cineWalk = null;
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

  // 人不许瞬移：层数当帧就翻（碰撞按目的层算），但**渲染高度得一格一格挪下去**。
  // 老版本 `p.level="under"; p.climbT=0.55` 就翻了个层数，渲染层照 level 取地平线，
  // 人当场掉到井底、再在井底原地摆 0.55 秒爬梯姿势——玩家看见的就是"瞬移 + 没动作"。
  // 这里盯三件事：起手的渲染高度还在原来那层、中途是连续下降的、到点归零。
  {
    const s2 = CreateGame(0);
    let f2 = 0;
    while (s2.phase !== "playing" || CurrentBeatDef(s2)?.kind === "cinematic") {
      StepGame(s2, { moveX: 0, climb: 0, crouch: false, interact: false, interactHeld: false, advance: true }, DT);
      if ((f2 += 1) > 10000) throw new Error("无法进入第一章玩法段");
    }
    // 井口 x 从场景数据取，别写死——第一章改过一次布局，写死的 27 当场失效
    const sc2 = SCENES[CHAPTERS[s2.chapterIndex].scene];
    s2.player.x = sc2.shafts[0].x;
    s2.player.level = "surface";
    const idle2 = { moveX: 0, climb: 0, crouch: false, interact: false, interactHeld: false, advance: false };
    StepGame(s2, { ...idle2, climb: 1 }, DT);
    assert.equal(s2.player.level, "under", "层数当帧就翻");
    const RenderY = () => (s2.player.level === "under" ? UNDER_Y : SURFACE_Y) + (s2.player.lift || 0);
    assert.ok(Math.abs(RenderY() - SURFACE_Y) < 0.35,
      `刚下梯子那一下人还得在井口（现在渲染在 ${RenderY().toFixed(2)}，井口 ${SURFACE_Y}）`);
    assert.ok(s2.player.climbT > 1.0, "3.6 米的井不该 0.55 秒就下完——那是瞬移的时长");
    const ys = [RenderY()];
    let g2 = 0;
    while (s2.player.climbT > 0 && (g2 += 1) < 400) {
      StepGame(s2, idle2, DT);
      ys.push(RenderY());
    }
    // 一路只降不升，且真的走完了整口井
    for (let i = 1; i < ys.length; i += 1) {
      assert.ok(ys[i] <= ys[i - 1] + 1e-6, `下梯子的高度不许回弹（第 ${i} 帧 ${ys[i]} > ${ys[i - 1]}）`);
    }
    assert.ok(ys.filter((y, i) => i > 0 && y < ys[i - 1] - 1e-6).length > 20,
      "中间得有几十帧真的在往下挪，不是跳一下就到底");
    assert.ok(Math.abs(RenderY() - UNDER_Y) < 1e-6, "落地之后渲染高度要正好归到地道地平线");
    assert.equal(s2.player.lift, 0, "落地要把抬升清干净，不然后面的姿势全跟着飘");
  }

  // 镜头不许自己动（用户 2026-08-10：「目前我看不需要这个自动摇动镜头的功能，
  // 把这个开关/功能默认关闭吧」）。窖口探头的整套机制还在代码里，但总开关
  // CAM_CELLAR_PEEK 默认 false——这里盯死两件事：①开关确实是关的、真跑起来
  // 一帧都不沉；②让位判据 state.steadyCam 仍然成立（开关拨回来时才不会踩坑，
  // 以后新加的"镜头自己动"也都挂这一个判据）。
  {
    const s3 = CreateGame(0);
    let f3 = 0;
    while (s3.phase !== "playing" || CurrentBeatDef(s3)?.kind === "cinematic") {
      StepGame(s3, { moveX: 0, climb: 0, crouch: false, interact: false, interactHeld: false, advance: true }, DT);
      if ((f3 += 1) > 10000) throw new Error("无法进入第一章玩法段");
    }
    const sc3 = SCENES[CHAPTERS[s3.chapterIndex].scene];
    const idle3 = { moveX: 0, climb: 0, crouch: false, interact: false, interactHeld: false, advance: false };
    const At = (x, mutate) => {
      s3.player.x = x; s3.player.level = "surface"; s3.player.cineWalk = null;
      // 这条测的是镜头，不是剧情：探针撞进哪个触发区弹出的微过场一律掐掉
      //（微过场里玩法循环让位，steadyCam 那一块根本不跑）
      s3.microCine = null;
      mutate?.(s3);
      StepGame(s3, idle3, DT);
      s3.microCine = null;
      return s3;
    };
    const shaftX = sc3.shafts[0].x;
    assert.equal(CAM_CELLAR_PEEK, false, "自动摇镜头默认必须是关的（用户 2026-08-10 定）");
    for (const x of [shaftX, shaftX - 1.2, shaftX - 2.4, shaftX - 8]) {
      assert.equal(At(x).cellarPeek || 0, 0, `关掉之后，走到哪儿镜头都不许自己沉（x=${x}）`);
    }
    // 让位判据：推着车、被盯上、节拍声明，三条都得把 steadyCam 立起来
    assert.equal(At(shaftX).steadyCam, false, "平时不锁镜头");
    assert.equal(At(shaftX, (s) => { s.cart = { x: shaftX + 1.2, kind: "barrow" }; }).steadyCam, true,
      "推着车的时候必须锁住镜头——车是横着走的，镜头一沉车头和路一起出画");
    s3.cart = null;
    assert.equal(At(shaftX, (s) => { s.detection = { level: 0.9 }; }).steadyCam, true,
      "被盯上的时候必须锁住镜头（潜行规范第 2 条）");
    s3.detection = null;
    assert.equal(At(shaftX, (s) => { s.beat.steadyCam = true; }).steadyCam, true,
      "节拍声明 steadyCam 必须管用——这是给新玩法钉构图的那个开关");
    s3.beat.steadyCam = false;
  }
  console.log("  ✓ 爬梯口上下（层数当帧翻 / 人贴着梯子挪下去 / 落地归位 / 镜头不自己摇）");
}

function TestSmokeFront() {
  const state = CreateGame(3);
  state.smoke = { frontX: 100, speed: 1, ventAt: null, ventUntil: 0, active: true };
  assert.ok(SmokeCovers(state, 120), "front 以东应被烟覆盖");
  assert.ok(!SmokeCovers(state, 80), "front 以西不应被烟覆盖");
  console.log("  ✓ 烟的一维推进覆盖判定");
}

function TestDetectionReset() {
  // 新二章唯一开考的潜行段：舀水支线（其余拍都在窖里，noDetect 挡着）
  const state = CreateGame(1);
  const idx = ChapterBeatList(1).findIndex((b) => b.id === "c2_fetch");
  assert.ok(idx >= 0, "第二章得有舀水支线");
  DebugJump(state, 1, idx);
  assert.equal(CurrentBeatDef(state)?.id, "c2_fetch", "跳幕结算默认走「舀水」那一支（options[0]）");
  assert.ok(state.stealthActive, "梳篦扫荡在村，潜行必须激活");
  const soldier = state.actors.find((a) => (a.kind === "soldier" || a.kind === "puppet") && !a.decor && a.visible !== false);
  assert.ok(soldier, "舀水支线得有真参与判定的巡逻兵");
  const beforeResets = state.flags.resets;
  let guard = 0;
  while (state.flags.resets === beforeResets) {
    state.player.x = soldier.x + (soldier.heading || 1) * 4;
    state.player.level = "surface";
    StepGame(state, { moveX: 0, climb: 0, crouch: false, interact: false, interactHeld: false, advance: false }, DT);
    if ((guard += 1) > 3000) throw new Error("探测重置未触发");
  }
  assert.equal(state.flags.resets, beforeResets + 1, "被发现应触发一次重置");
  console.log("  ✓ 潜行探测与失败重置（舀水支线）");
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
    // 新二章的潜行只有舀水这一趟：被照见退回窖里（重置点在地下，
    // 任何人的视线都够不着），笨玩家一路直走也得能把水舀回来
    { chapter: 1, beat: "c2_fetch", label: "C2 舀水支线", budget: 120 },
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
        const targetLevel = target.level || "surface";
        if (state.player.level !== targetLevel && state.player.climbT <= 0) {
          // 笨玩家也会爬梯子：目标在另一层就先奔梯口。
          // 井口要挑**通向目标那一段**的（与主驱动器同一条规矩）：防兵洞
          // 没挖开之前自家窖和七叔家窖是两个腔，就近下错口就是死胡同
          const sc2 = SCENES[CHAPTERS[c.chapter].scene];
          const shafts = (sc2.shafts || []).filter((sh) => !sh.builtFlag || state.flags[sh.builtFlag]);
          const segs = UnderSegments(sc2, state.flags);
          const segOf = (wx) => segs.find(([a2, b2]) => wx >= a2 - 0.6 && wx <= b2 + 0.6);
          const want = segs.length > 1
            ? (targetLevel === "under" ? segOf(target.x) : segOf(state.player.x))
            : null;
          let best = null, bd = Infinity;
          for (const sh of shafts) {
            if (want) { const sg = segOf(sh.x); if (!sg || sg[0] !== want[0]) continue; }
            const d = Math.abs(state.player.x - sh.x);
            if (d < bd) { bd = d; best = sh; }
          }
          if (best) {
            if (Math.abs(state.player.x - best.x) > 0.9) input.moveX = Math.sign(best.x - state.player.x);
            else input.climb = targetLevel === "under" ? 1 : -1;
          }
        } else {
          const dx = target.x - state.player.x;
          if (target.action === "interactAt" && Math.abs(dx) <= 1.35) input.interact = true;
          else if (Math.abs(dx) > 0.6) input.moveX = Math.sign(dx);
        }
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

function TestVaultC1() {
  const NONE = { moveX: 0, climb: 0, crouch: false, interact: false, interactHeld: false, advance: false };
  const list = ChapterBeatList(0);
  // 新版第一章不教学翻越（关卡设计文档）：巷口那堵塌墙留给第二章正式复用，
  // 这里只借 c1_well 的自由活动验"翻越机制本身没坏"
  const cases = [
    { beat: "c1_well", from: 79, to: 92, top: 0.82, label: "塌进巷子的院墙（东行）" },
    { beat: "c1_well", from: 92, to: 79, top: 0.82, label: "塌进巷子的院墙（西行）" },
  ];
  for (const c of cases) {
    const state = CreateGame(0);
    DebugJump(state, 0, list.findIndex((b) => b.id === c.beat));
    state.player.x = c.from;
    state.player.item = null;   // 结算把水桶塞进手里：先撂下，翻越走标准档
    const dir = Math.sign(c.to - c.from);
    let peakLift = 0, sawPose = false, started = false, sawHint = false, blockedX = null;
    const cues = [];
    const liftTrace = [];
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
        liftTrace.push(state.player.lift || 0);
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
    // **这一条盯的是「翻」和「跳」的分水岭**：撑手翻越的高度曲线是带平台的
    // 梯形（手是支点，胯骑在顶沿上、腿从顶上扫过），跳跃是对称的抛物线。
    // 这个动作被退回过两次，两次都是因为用了正弦弧——所以直接量平台。
    assert.equal(peakLift.toFixed(3), VaultLiftFor(c.top).toFixed(3),
      `${c.label}：抬升峰值必须按规范算（VaultLiftFor＝顶沿+余量−站立胯高）`);
    const plateau = liftTrace.filter((v) => v > peakLift - 0.005).length;
    assert.ok(plateau / liftTrace.length > 0.25,
      `${c.label}：顶点只停了 ${(plateau / liftTrace.length * 100).toFixed(0)}% 的时长——`
      + "尖顶的弧就是抛物线，那是跳不是翻。撑手翻越必须在顶沿高度上停一段（腿扫过去）");
    // 落下要比撑起来快（松手之后是重力说了算），否则读起来还是"飘"下来的
    const up = Math.max(...liftTrace.map((v, i) => (i ? v - liftTrace[i - 1] : 0)));
    const down = Math.max(...liftTrace.map((v, i) => (i ? liftTrace[i - 1] - v : 0)));
    assert.ok(down > up * 0.9, `${c.label}：落下比撑起来还慢——松手之后该是重力接手`);
    assert.ok(cues.includes("vault") || cues.includes("vaultHeavy"), `${c.label}：缺起手音效`);
    assert.ok(cues.includes("vaultLand"), `${c.label}：缺落地音效`);
    assert.equal(state.player.lift || 0, 0, `${c.label}：翻完必须落回地面`);
    assert.ok(dir > 0 ? state.player.x >= c.to : state.player.x <= c.to,
      `${c.label}：翻完必须真的到了另一侧`);
  }

  // 翻越尺度规范（全作，不只第一章）：顶沿高过撑手的人的胯，「翻」就成了
  // 「攀」。上限以第一章那堵塌墙（0.82m）为基准定在 VAULT_MAX_TOP。
  // 加载期 Data_Scenes 已经会抛，这里再明写一遍——规范要看得见，不能只藏在校验里。
  {
    for (const [key, scene] of Object.entries(SCENES)) {
      for (const v of scene.vaults || []) {
        assert.ok(typeof v.top === "number", `${key} 的可翻越物 x=${v.x} 没写 top`);
        assert.ok(v.top <= VAULT_MAX_TOP,
          `${key} 的可翻越物 x=${v.x} 顶沿 ${v.top}m 超过上限 ${VAULT_MAX_TOP}m（高过胯就撑不住了）`);
        assert.ok(v.top >= VAULT_MIN_TOP,
          `${key} 的可翻越物 x=${v.x} 顶沿 ${v.top}m 低于下限 ${VAULT_MIN_TOP}m（一步就跨过去了）`);
      }
    }
    // 基准本身别被人悄悄改大：0.82 是第一章那堵墙，它就是这条规范的样板
    assert.ok(VAULT_MAX_TOP >= 0.82 && VAULT_MAX_TOP <= 0.90,
      `翻越上限 ${VAULT_MAX_TOP} 偏离了基准（第一章那堵塌墙 0.82m）`);
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
    DebugJump(state, 0, list.findIndex((b) => b.id === "c1_well"));
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
    DebugJump(state, 0, list.findIndex((b) => b.id === "c1_well"));
    state.player.item = null;
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
  const well = ChapterBeatList(0).find((b) => b.id === "c1_well");
  DebugJump(state, 0, well.index);
  const step = (input = {}, n = 1) => {
    for (let i = 0; i < n; i += 1) {
      StepGame(state, {
        moveX: 0, climb: 0, crouch: false, interact: false, interactHeld: false,
        throw: false, advance: false, ...input,
      }, DT);
    }
  };
  step({}, 1);
  // 新链第一步：从缸边把空桶拎起来（桶不再由上一拍塞进手里）
  state.player.x = 43.0; state.player.level = "surface";
  step({}, 6); step({ interact: true }); step({}, 2);
  assert.equal(state.player.item?.id, "bucket", "缸边的空桶必须拎得起来");
  // ★ 半路（院墙外）随手把桶撂下
  state.player.x = 45.6;
  step({}, 20); step({ interact: true });
  assert.equal(state.player.item, null, "半路应该放得下");
  assert.equal(state.groundItems.length, 1, "桶该躺在半路上");
  // 先把妹妹那步问完（talk 这会儿是当前步；她正往榆树跑，先钉到位）
  const sis = state.actors.find((a) => a.id === "sister");
  sis.cineTarget = null; sis.x = 55.4;
  state.player.x = sis.x; step({}, 3); step({ interact: true });
  for (let i = 0; i < 400 && state.microCine; i += 1) step({ advance: true });
  // 走到井台：这一步要桶——撂在半路的桶必须有气泡标着、提示也得说清缺什么
  state.player.x = SCENES.village.zones.well.x - 0.5; step({}, 6);
  assert.ok(state.prompt && /缺/.test(state.prompt),
    `空着手站上井台必须说缺什么，实为 ${JSON.stringify(state.prompt)}`);
  const marked = state.bubbles.some((b) => b.icon === "item:空水桶");
  assert.ok(marked, "撂在半路的桶必须挂气泡标出来");
  // 走回去真的能捡起来，链接着走
  const g = state.groundItems.find((it) => it.id === "bucket");
  state.player.x = g.x; step({}, 3); step({ interact: true });
  assert.equal(state.player.item?.id, "bucket", "撂在哪儿就该能从哪儿捡回来");
  console.log("  ✓ 链不怕半路撂东西：缺桶有提示、撂下的桶有气泡标着、捡得回来");
}

function TestGroundItems() {
  const state = CreateGame(0);
  const well = ChapterBeatList(0).find((b) => b.id === "c1_well");
  DebugJump(state, 0, well.index);
  const step = (input = {}, n = 1) => {
    for (let i = 0; i < n; i += 1) {
      StepGame(state, {
        moveX: 0, climb: 0, crouch: false, interact: false, interactHeld: false,
        throw: false, advance: false, ...input,
      }, DT);
    }
  };
  step({}, 1);
  // 新链第一步：从缸边把空桶拎起来
  state.player.x = 43.0; state.player.level = "surface";
  step({}, 6); step({ interact: true }); step({}, 2);
  assert.equal(state.player.item?.id, "bucket", "缸边的空桶必须拎得起来");
  // 站进 hayB 草垛掩体正中间放下：落点必须被推出掩体足迹。
  // 边界从场景数据取——草垛的宽度调过一次，写死的 65.9/70.1 会跟着失效
  const hayB = SCENES.village.covers.find((c) => c.id === "hayB");
  state.player.x = hayB.x;
  step({}, 14);
  step({ interact: true });
  assert.equal(state.player.item, null, "空地上按 E 要能自由放下");
  assert.equal(state.groundItems.length, 1, "放下后地上要有一件落地道具");
  const g = state.groundItems[0];
  assert.ok(Math.abs(g.x - hayB.x) >= hayB.w / 2 - 1e-6,
    `落点必须避开 hayB 掩体足迹（实际 x=${g.x}，垛 ${hayB.x}±${hayB.w / 2}）`);
  // 悬浮提示：附近要有它自己的小样气泡
  state.player.x = g.x - 1.2;
  step({});
  assert.ok(state.bubbles.some((b) => b.icon === "item:空水桶"), "落地道具头顶要挂小样气泡");
  // 走近拾回
  state.player.x = g.x;
  step({ interact: true });
  assert.equal(state.player.item?.id, "bucket", "走近按 E 要能拾回");
  assert.equal(state.groundItems.length, 0, "拾回后地上不该有残影");
  // 拾取后的保护窗：紧接着的 E 不许顺手把它又扔了
  step({ interact: true });
  assert.equal(state.player.item?.id, "bucket", "刚拿起的东西不许被同一串 E 顺手放下");
  console.log("  ✓ 落地道具：自由放下避开掩体足迹、悬浮气泡、拾回");
}

// 接绳＝**把绳头掖进圈眼里穿过去、再一把一把勒死**，不是绕圈（2026-08-08
// 用户退回：「链接麻绳为什么也是转圈圈？」），也不是在世界里描一条曲线
//（2026-08-10 用户退回：「谁看得出来这是打结」）。现在它长在一张铺满画框的
// 活卡上（state.knotCard），手落在**卡面**的哪儿说了算（pointerCard）。
//
// 这条盯六件事：①长按无效（用户明令删掉后备）②按下那一帧手必须落在绳头上
// ③得**真的从圈眼里穿**——绕着圈外面划到左边不算 ④穿过去之后要一把一把
// 拽，每拽紧一把都得倒手重抓 ⑤手甩得比绳快就脱手 ⑥不留 HUD 图标/按键提示。
//
// 驱动那张卡（自动通关与这几条单测共用）：攥住绳头 → 塞进圈眼 → 从西边拽
// 出来 → 倒手拽三把勒死。`tick` 是调用方自己数的帧号——没攥住的时候必须
// **先松一帧再按下去**，否则 state.ptrPressed 永远是假的（攥住只认按下那
// 一帧），驱动器会一直空转。
function KnotDrive(state, input, target, tick) {
  const A = target.aspect || 16 / 9;
  const Put = (x, y) => { input.pointerHeld = true; input.pointerCard = { u: x, v: y * A }; };
  const kc = state.knotCard;
  if (!kc) { Put(target.start.x, target.start.y); return; }
  if (!kc.grab) {
    // 松一帧 → 按一帧：这一下按在绳头上才攥得住
    if (tick % 2 === 0) { input.pointerHeld = false; input.pointerCard = null; return; }
    Put(kc.tip.x, kc.tip.y);
    return;
  }
  const aim = kc.phase === "cinch"
    ? { x: kc.tip.x + target.pull.x, y: kc.tip.y + target.pull.y }
    : (kc.inEye ? target.out : target.eye);
  const vx = aim.x - kc.tip.x, vy = aim.y - kc.tip.y;
  const d = Math.hypot(vx, vy) || 1;
  // 手只许比绳头领先这么一点：领先过头就是"甩脱了"，那条规矩这里不许绕开
  const step = Math.min(d, target.reachStep);
  Put(kc.tip.x + (vx / d) * step, kc.tip.y + (vy / d) * step);
}

/** 把整条接绳做完（链式测试与自动通关驱动共用同一条路），返回勒了几把 */
function DragKnotThrough(state, drive) {
  const t = GetBeatTarget(state);
  assert.equal(t?.action, "knotAt", "接绳那一步的驱动目标应该是拖绳头，不是长按");
  assert.ok(t.card && t.eye && t.pull, "驱动目标得把卡上的落点（圈眼/勒紧方向）交出来");
  for (let i = 0; i < 900 && state.knotCard; i += 1) {
    const input = {};
    KnotDrive(state, input, t, i);
    drive(input);
  }
  return state.beat.knotState?.pulls ?? 0;
}

function TestKnotIsThreadingNotCircling() {
  const Setup = () => {
    const state = CreateGame(0);
    const well = ChapterBeatList(0).find((b) => b.id === "c1_well");
    DebugJump(state, 0, well.index);
    // 直接把链推进到接绳那一步：桶已搁下、磨损处已折回（备用绳就在桶底）。
    // 新链在头里多了「拎起空桶」，接绳从第 3 步挪到第 4 步
    state.beat.stepIndex = 4;
    state.flags.wellRopeFixed = false;
    state.player.item = null;
    state.player.x = SCENES.village.zones.well.x;
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
  const L = KNOT_CARD;
  const card = (x, y) => ({ u: x, v: y * L.aspect });

  // ① 长按互动键：一点用都没有
  {
    const state = Setup();
    step(state, {}, 2);
    step(state, { interactHeld: true }, Math.ceil(6.0 / DT));
    assert.equal(state.beat.knotState?.pulls ?? 0, 0,
      "长按 E 居然把结勒上了——这条后备必须是死的");
    assert.ok(!state.beat.knotState?.threaded, "长按不该把绳头穿过圈眼");
    assert.ok(!state.flags.wellRopeFixed, "长按不该把井绳接好");
  }

  // ② 按下那一帧手没落在绳头上：攥不住，怎么拖都不动
  {
    const state = Setup();
    step(state, {}, 2);
    const start = { ...state.knotCard.tip };
    step(state, { pointerHeld: true, pointerCard: card(0.08, 0.48) }, 4);
    for (let i = 0; i < 60; i += 1) {
      step(state, { pointerHeld: true, pointerCard: card(0.08 + i * 0.012, 0.48 - i * 0.004) });
    }
    assert.ok(!state.knotCard.grab, "手没落在绳头上就按下去，不该攥得住");
    assert.ok(Math.hypot(state.knotCard.tip.x - start.x, state.knotCard.tip.y - start.y) < 0.02,
      "在卡上别处按下再拖，绳头不该动（这正是「不是 slider」的意思）");
  }

  // ③ 得**真的从圈眼里穿**：绕着圈的外面划到左边不算数
  {
    const state = Setup();
    step(state, {}, 2);
    // 攥住绳头，然后从圈的**上方**绕过去，一路划到圈心以西
    step(state, { pointerHeld: true, pointerCard: card(state.knotCard.tip.x, state.knotCard.tip.y) }, 2);
    assert.ok(state.knotCard.grab, "按在绳头上要攥得住");
    const way = [
      { x: 0.62, y: 0.06 }, { x: 0.46, y: 0.02 }, { x: 0.30, y: 0.03 }, { x: 0.18, y: 0.10 },
    ];
    for (const q of way) {
      for (let i = 0; i < 40; i += 1) {
        const tip = state.knotCard.tip;
        const vx = q.x - tip.x, vy = q.y - tip.y;
        const d = Math.hypot(vx, vy);
        if (d < 0.02) break;
        const s = Math.min(d, 0.1);
        step(state, { pointerHeld: true, pointerCard: card(tip.x + (vx / d) * s, tip.y + (vy / d) * s) });
      }
    }
    assert.ok(state.knotCard.tip.x < L.outX + 0.06, "绕上去这一路得真把绳头带到了圈西边");
    assert.equal(state.knotCard.phase, "tuck",
      "从圈**外面**绕过去不算穿过去——不进那个洞就不该算数");
  }

  // ④ 攥住绳头掖进圈眼、再倒手拽三把：井绳接好
  {
    const state = Setup();
    step(state, {}, 2);
    const pulls = DragKnotThrough(state, (inp) => step(state, inp));
    assert.ok(pulls >= L.pulls, `一把一把勒到底才算接上（只勒了 ${pulls} 把）`);
    assert.equal(state.player.item, null, "接绳全程两手都在绳上，物品栏得是空的");
    assert.equal(state.flags.wellRopeFixed, true, "勒死了＝井绳必须接好");
  }

  // ⑤ 手甩得比绳快：脱手，这一把当场作废
  {
    const state = Setup();
    step(state, {}, 2);
    step(state, { pointerHeld: true, pointerCard: card(state.knotCard.tip.x, state.knotCard.tip.y) }, 2);
    assert.ok(state.knotCard.grab, "这会儿手上还攥着绳头");
    const tip = state.knotCard.tip;
    step(state, { pointerHeld: true, pointerCard: card(tip.x - L.slipR - 0.12, tip.y + 0.10) }, 2);
    assert.ok(!state.knotCard.grab, "手甩出绳头够得着的范围必须脱手");
  }

  // ⑥ 不留 HUD 手势图标 / 按键提示：招呼玩家的是卡上那根绳头自己
  {
    const state = Setup();
    step(state, {}, 3);
    assert.ok(!state.gesture, "接绳那一拍不该再挂 HUD 手势图标");
    assert.ok(!state.prompt, `接绳那一拍不该出提示文案，实为「${state.prompt}」`);
    assert.ok(state.knotCard, "站定就该亮出那张接绳卡");
    assert.ok(!state.closeUp, "有活卡就不该再推世界里的特写（两个镜头打架）");
    assert.equal(EdgeHint(state, state.player.x, 12), null, "活卡上不该再挂画框边缘的路标");
  }
  console.log("  ✓ 接绳：穿过圈眼不是绕圈 / 长按无效 / 按不准攥不住 / 绕外面不算 / 甩快了脱手");
}

// 辘轳是个转盘，不是一根拉杆：鼠标绕**摇把轴销**转圈才走绳——顺时针放、
// 逆时针收、脱手倒转；上手的同时镜头必须推成井口特写。
//
// 2026-08-10 加的三条（用户：「放下水桶这个过程角色一点力好像都不需要用，
// 还可以坚持着不放下去」）：④桶吊着不放，手劲一路掉 ⑤掉光了辘轳自己往下溜
// ⑥满桶摇上来费力气、撒手能喘回来。另外⑦摇把必须在这孩子**够得着**的地方。
function TestWinchIsACrankNotALever() {
  const mk = () => {
    const state = CreateGame(0);
    const well = ChapterBeatList(0).find((b) => b.id === "c1_well");
    DebugJump(state, 0, well.index);
    // 直接把链推进到辘轳那一步：绳已接好、桶拾回在手里（新链整体 +1）
    state.beat.stepIndex = 7;
    state.flags.wellRopeFixed = true;
    state.player.item = { id: "bucket", label: "空水桶" };
    state.player.x = SCENES.village.zones.well.x;
    state.player.level = "surface";
    return state;
  };
  const stepOn = (state) => (input = {}, n = 1) => {
    for (let i = 0; i < n; i += 1) {
      StepGame(state, {
        moveX: 0, climb: 0, crouch: false, interact: false, interactHeld: false,
        throw: false, advance: false, ...input,
      }, DT);
    }
  };
  const wx = SCENES.village.zones.well.x;
  const hubY = WINCH_HUB_Y;            // SURFACE_Y = 0
  const crankX = wx + WINCH_CRANK_DX;  // 摇把轴销：钉在**西端面**，人这一侧
  const Hook = (state, step) => {
    step({}, 2);
    step({ interact: true });
    step({}, 2);
    return state.beat.winch;
  };
  // 二道手：**一下一下地敲 S** 把桶墩下去（按住不放不算）
  const KeyDunk = (state, step, n = 40) => {
    for (let i = 0; i < n && state.beat.winch?.phase === "dunk"; i += 1) {
      step({ climb: 1 });
      step({}, 4);
    }
  };

  // ── ①②③ 转盘本身：顺放逆收、特写、脱手倒转、键盘后备 ──
  {
    const state = mk();
    const step = stepOn(state);
    const w = Hook(state, step);
    assert.ok(w?.hooked, "拿着桶按 E 必须挂上辘轳");
    assert.ok(state.closeUp, "挂上辘轳后镜头必须推成井口特写");
    assert.ok(state.closeUp.hw < 4, `特写景别要真的近（实际 ${state.closeUp?.hw}）`);

    const circle = (dir, n) => {
      // dir=-1 顺时针（放绳）/ +1 逆时针（摇起）。步长 0.3rad/帧，半径 0.5
      for (let i = 0; i < n; i += 1) {
        const a = (state.beat.winch.prevA ?? 0) + dir * 0.3;
        step({ pointerHeld: true, pointerWorld: { x: crankX + Math.cos(a) * 0.5, y: hubY + Math.sin(a) * 0.5 } });
      }
    };
    // 顺时针绕圈：绳往下走
    step({ pointerHeld: true, pointerWorld: { x: crankX + 0.5, y: hubY } });   // 手搭上转盘
    const d0 = w.depth;
    circle(-1, 8);
    assert.ok(w.depth > d0 + 0.1, `顺时针转了两圈半，桶得实实在在往下走（${d0}→${w.depth}）`);
    assert.equal(state.gesture, undefined, "手势小黑饼已拆（2026-08-10 用户），方向由辘轳的引导圈说");
    // 逆时针倒着转不放绳
    const d1 = w.depth;
    circle(1, 6);
    assert.ok(w.depth <= d1 + 1e-9, "空桶阶段逆时针转不该把绳送下去");
    // 一路顺时针到底
    for (let i = 0; i < 90 && w.phase === "lower"; i += 1) circle(-1, 8);
    // ── 二道：墩桶 ──
    // 老版转到底就"咕咚一声灌满了"。**空木桶是浮着的**，不墩不吃水——
    // 这一道是四道手里唯一不靠转盘的动作，也是打水这件事真正的样子
    assert.equal(w.phase, "dunk", "桶碰着水不该直接满，得先墩");
    assert.equal(w.filled, false, "没墩过的空桶不许算满");
    // 井底那扇小窗：主相机看不到井口以下，这一拍全靠第二台相机演。
    // 它同时是"为什么要墩"唯一的说明——断了这条，二道手就成了没头没脑的
    assert.equal(state.pip?.kind, "wellBottom", "桶沉进井里就该开井底那扇小窗");
    assert.equal(state.pip.t, null, "这扇小窗由玩法自己收，不许几秒后自动关掉");
    assert.ok(state.pip.at && state.pip.at.y < -0.5,
      `小窗得真的架在井筒里（实际 y=${state.pip?.at?.y}）`);
    circle(-1, 30);
    assert.equal(w.filled, false, "墩桶这一道接着绕摇把是没用的——动作对不上事");
    // 攥住井绳往下拽：按下那一帧手得落在绳上（绳吊在井心，不是摇把那一侧）
    const DragRope = (fromY, toY, n = 10) => {
      step({ pointerHeld: true, pointerWorld: { x: wx, y: fromY } });
      for (let i = 1; i <= n; i += 1) {
        step({ pointerHeld: true, pointerWorld: { x: wx, y: fromY + (toY - fromY) * (i / n) } });
      }
      step({});
    };
    const dunks0 = w.dunks;
    step({ pointerHeld: true, pointerWorld: { x: wx + 1.4, y: 0.9 } });
    for (let i = 1; i <= 8; i += 1) step({ pointerHeld: true, pointerWorld: { x: wx + 1.4, y: 0.9 - i * 0.05 } });
    step({});
    assert.equal(w.dunks, dunks0, "手没落在井绳上，往下拽不算一墩");
    const tip0 = w.tip;
    DragRope(1.1, 0.75);
    assert.ok(w.tip > tip0, `攥住井绳往下墩，桶得往下扣（${tip0}→${w.tip}）`);
    let guard = 0;
    while (!w.filled && guard < 14) { step({}, 6); DragRope(1.1, 0.75); guard += 1; }
    assert.ok(w.filled, "墩够了桶必须吃满水");
    assert.equal(w.phase, "raise", "吃满水就该进摇上来那一道");
    // 逆时针往上摇
    const d2 = w.depth;
    circle(1, 10);
    assert.ok(w.depth < d2 - 0.02, `满桶逆时针摇，绳得往上收（${d2}→${w.depth}）`);
    assert.equal(state.gesture, undefined, "手势小黑饼已拆，摇起的方向由摇把与引导圈自己演");
    // 再摇上来一截，好让下面那一坠有地方可坠（一井绳现在长得多）
    circle(1, 60);
    const crankMid = w.crankA;
    // 脱手：过了棘齿宽限辘轳倒转，桶自己往下坠，摇把跟着倒着抡
    const d3 = w.depth;
    step({}, Math.ceil(1.6 / DT));
    assert.ok(w.depth > d3 + 0.15, "脱手过了宽限，辘轳必须倒转（桶坠回去）");
    assert.ok(w.crankA < crankMid, "倒转时摇把必须真的倒着转（crankA 回退）");
    // 键盘 W 仍是完整后备（费力气的活，不是指尖功夫）：一路摇到顶。
    // 力气见底也只是慢一档，绝不许把人卡死——自动通关全靠这条
    for (let i = 0; i < 40 && w.phase === "raise"; i += 1) {
      step({ climb: -1 }, Math.ceil(0.8 / DT));
      step({}, Math.ceil(0.5 / DT));   // 喘一口（撒手会坠一点，但缓过来摇得快）
    }
    // ── 四道：拽到井沿 ──
    // 摇到顶不等于到手：桶还悬在井口正当中，得横着拽过来搁到台沿上
    assert.equal(w.phase, "land", "摇到顶不算完——桶还吊在井口正当中");
    assert.equal(state.player.item?.id, undefined, "还没搁上井沿就不算到手");
    const by = 0.66;   // SURFACE_Y = 0；桶提到顶时的高度
    step({ pointerHeld: true, pointerWorld: { x: wx - 2.4, y: by } });
    step({ pointerHeld: true, pointerWorld: { x: wx - 0.7, y: by } }, 6);
    assert.ok(w.swing < 0.02, `没攥住桶就拖，桶不该动（swing=${w.swing}）`);
    step({});
    step({ climb: -1 }, Math.ceil(6.0 / DT));
    assert.equal(CurrentBeatDef(state)?.steps?.[state.beat.stepIndex]?.type === "winch", false,
      "键盘后备必须走得完四道手（力气见底只该变慢，不该卡死）");
    assert.equal(state.player.item?.id, "fullBucket", "四道手都走完，手里才是一桶水");
    assert.equal(state.pip, null, "打完水那扇井底小窗得跟着收走");
  }

  // ── ④⑤ 桶吊着不放：手劲一路掉，掉光了辘轳自己往下溜 ──
  // 用户点名的那条：「角色一点力好像都不需要用，还可以坚持着不放下去」
  {
    const state = mk();
    const step = stepOn(state);
    const w = Hook(state, step);
    assert.ok(state.stamina, "桶一挂上辘轳就该有一条手劲读数");
    const stam0 = state.stamina.v;
    step({}, Math.ceil(1.0 / DT));
    assert.ok(state.stamina.v < stam0 - 0.2,
      `撑着一只吊在半空的桶，手劲必须一直在掉（${stam0}→${state.stamina.v}）`);
    assert.ok(w.depth < 0.02, "还撑得住的时候，桶就该稳稳吊在那儿");
    step({}, Math.ceil(5.0 / DT));
    assert.ok(w.giveOut, "手劲掉光了就该撑不住");
    assert.ok(w.depth > 0.03,
      `撑不住之后桶必须自己往下溜（depth=${w.depth.toFixed(3)}）——"坚持着不放下去"不该是免费的`);
  }

  // ── ⑥ 满桶摇上来费力气，撒开手能喘回来 ──
  {
    const state = mk();
    const step = stepOn(state);
    const w = Hook(state, step);
    step({ climb: 1 }, Math.ceil(5.0 / DT));     // 放到底
    KeyDunk(state, step);                        // 一下一下墩，桶才吃水
    assert.ok(w.filled, "键盘放到底再墩几下，桶该吃满水");
    const stamFull = w.stam;
    step({ climb: -1 }, Math.ceil(1.2 / DT));
    assert.ok(w.stam < stamFull - 0.3, `满桶往上摇最费力气（${stamFull}→${w.stam}）`);

    assert.ok(state.stamina.low || w.stam < 0.5, "摇一阵之后手劲读数该报警了");
    const tired = w.stam;
    step({}, Math.ceil(0.6 / DT));
    assert.ok(w.stam > tired + 0.2, "撒开手就该喘回来一口");
  }

  // ── ⑦ 摇把得长在这孩子够得着的地方 ──
  // 老版轴心 1.43m，比第一章那个孩子的头顶（约 1.13m）还高 30 厘米，摇把画的
  // 圈他一辈子也够不着——画面上就是"人在旁边空划拉、辘轳自己在转"。
  // 这条按**站位 + 肩高 + 臂长**量：摇把绕一圈，全程都得在够得着的范围里。
  {
    const state = mk();
    const step = stepOn(state);
    const w = Hook(state, step);
    step({ climb: 1 }, 4);
    const wv = state.winchView;
    assert.ok(wv?.gripX !== undefined, "渲染层得知道握手此刻在哪儿（Rig 靠它反解前手）");
    assert.ok(Math.abs(state.player.x - (wx + WINCH_STAND_DX)) < 0.05,
      `摇的时候人必须钉在够得着的站位（实际 x=${state.player.x.toFixed(2)}）`);
    // 骨架量出来的数（第一章柱子的体型 0.80）：肩离地约 0.82m、比站位靠前
    // 0.05m（crank 姿势是**站直**的），一条胳膊伸直 (0.25+0.24)×0.80 = 0.392m。
    // 姿势里还有一档随摇把前后送的身位（Rig 的 crank：hipX ±0.06）。
    const SHOULDER_Y = 0.82, ARM = 0.392, LEAN = 0.06, HEAD_HW = 0.09;
    const sx = state.player.x + 0.05;
    let worst = 0;
    for (let i = 0; i < 24; i += 1) {
      const a = (i / 24) * Math.PI * 2;
      const gx = crankX + Math.cos(a) * WINCH_CRANK_R;
      const gy = hubY + Math.sin(a) * WINCH_CRANK_R;
      worst = Math.max(worst, Math.hypot(gx - sx, gy - SHOULDER_Y));
    }
    assert.ok(worst <= ARM + LEAN,
      `摇把转到最远的那一点离肩 ${worst.toFixed(2)}m，胳膊只有 ${ARM}m（身子还能送 ${LEAN}m）`
      + "——够不着的摇把，动画怎么做都是假的");
    // **圈不许扫过他的脸**：够得着了还不算完——摇把转到最左那一点如果压在
    // 脑袋上，那条胳膊就整个横在自己脸前，实拍裁下来是"一只手捂着脸"
    assert.ok(crankX - WINCH_CRANK_R >= sx + HEAD_HW,
      `摇把画的圈最左沿在 ${(crankX - WINCH_CRANK_R).toFixed(2)}，脑袋右缘在 `
      + `${(sx + HEAD_HW).toFixed(2)}——圈扫过脸，胳膊就会横在自己面前`);
  }
  console.log("  ✓ 辘轳四道手：顺放逆收 / 墩桶 / 拽到井沿 / 脱手倒转 / 手劲会耗尽 / 摇把够得着");
}

// 打水得**够长**。这一场老版拢共四圈半、键盘全速 4.5 秒就完（用户 2026-08-10
// 退回：「打水放水桶这个玩法也太短了 一点仪式感也没有 稍微长一点嘛 是现在的
// 3x 差不多了」）。长度是设计的一部分，不是可以随手调回去的手感参数——
// 所以钉一个下限在这儿，顺带钉住"四道手一道都不能少"。
function TestWinchIsLongEnough() {
  const state = CreateGame(0);
  DebugJump(state, 0, ChapterBeatList(0).find((b) => b.id === "c1_well").index);
  state.beat.stepIndex = 7;
  state.flags.wellRopeFixed = true;
  state.player.item = { id: "bucket", label: "空水桶" };
  state.player.x = SCENES.village.zones.well.x;
  state.player.level = "surface";
  const step = (input = {}, n = 1) => {
    for (let i = 0; i < n; i += 1) {
      StepGame(state, {
        moveX: 0, climb: 0, crouch: false, interact: false, interactHeld: false,
        throw: false, advance: false, ...input,
      }, DT);
    }
  };
  step({}, 2);
  step({ interact: true });
  const w = state.beat.winch;
  const seen = new Set();
  let frames = 0, rest = false;
  while (state.player.item?.id !== "fullBucket" && frames < 90 / DT) {
    const ph = w.phase;
    seen.add(ph);
    // 跟自动通关驱动器同一套开法：累了就撒手喘一口（那是最优解）
    if (ph === "lower") rest = false;
    else if (w.stam <= 0.04) rest = true;
    else if (w.stam >= 0.8) rest = false;
    if (ph === "dunk") step({ climb: (frames % 6 < 3) ? 1 : 0 });
    else step({ climb: rest ? 0 : (ph === "lower" ? 1 : -1) });
    frames += 1;
  }
  assert.equal(state.player.item?.id, "fullBucket", "键盘后备必须打得上水");
  const secs = frames * DT;
  // 老版键盘全速 4.5 秒（放 1.6s + 摇 2.9s）。3x 就是 13.5s 起
  assert.ok(secs >= 13.5, `打水得有仪式感：键盘全速也该 13.5 秒起（实际 ${secs.toFixed(1)}s）`);
  for (const ph of ["lower", "dunk", "raise", "land"]) {
    assert.ok(seen.has(ph), `四道手一道都不能少，缺了 ${ph}`);
  }
  console.log(`  ✓ 打水四道手全走一遍：键盘 ${secs.toFixed(1)}s（老版 4.5s）`);
}

// 石笔：玩家攥的是一支笔，不是一根滑块。
//
// 这一拍长在一张铺满画框的手绘特写卡上（state.scribeCard），手落在**卡面**
// 的哪儿说了算（pointerCard，u 沿卡宽 / v 沿卡高的归一化坐标）。世界坐标那条
// 老路子已经废了——世界里那支笔只有十来个像素，按不着。五条硬规矩各验一遍。
function TestChalkIsAPencilNotASlider() {
  // 攥石笔划线的拟物交互一头一尾各一次：第一章量身（c1_carve，爹的手按着、
  // 玩家攥笔）与第八章给妹妹刻痕（c8_carve）。机制细则在 c8 上验（selfMark 那
  // 版旗标齐全）；c1 那道由整章自动通关盯 flags.marked 兜底
  const carve = ChapterBeatList(7).find((b) => b.id === "c8_carve");
  const mk = () => {
    const state = CreateGame(7);
    DebugJump(state, 7, carve.index);
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
  const L = SCRIBE_CARD;
  // 笔尖在起点时，拳心（该按的那一点）落在这儿
  const GRIP = { u: L.u0 + L.gripDU, v: L.v + L.gripDV };

  // ① 手没落在笔上就按下去拖：笔不动（这正是"不是 slider"的意思）
  {
    const s = mk();
    step(s, {}, 2);
    for (let i = 0; i < 40; i += 1) {
      // 从画框左边一路拖到右边，全程避开那支笔
      step(s, { pointerHeld: true, pointerCard: { u: 0.06 + i * 0.02, v: L.v + 0.34 } });
    }
    assert.equal(s.beat.drawn, 0, "手没抓着笔，怎么拖都不该划出印子");
    assert.ok(!s.dragTrack, "划线这一拍绝不许有拖动轨道（slider）");
  }

  // ② 攥住笔再拉：印子跟着出来，且笔有摩擦——拉不过 SCRIBE_CARD.speed
  {
    const s = mk();
    step(s, {}, 2);
    step(s, { pointerHeld: true, pointerCard: { ...GRIP } });   // 落在拳心上=攥住
    assert.ok(s.beat.grabbed, "手落在笔身上按下去，必须攥得住");
    // 手瞬间甩到另一头：笔只能一寸一寸蹭过去，一帧绝不会到底
    step(s, { pointerHeld: true, pointerCard: { u: L.u1 + 0.1, v: GRIP.v } });
    assert.ok(s.beat.drawn > 0, "攥住往前拉，必须留下印子");
    assert.ok(s.beat.drawn < 0.2, `笔有摩擦，一帧不该窜到 ${s.beat.drawn}`);
    // 玩家要做的事，画面上事先不能已经做完了：第二道刻痕此刻必须还没有
    assert.ok(!s.flags.carved, "没划完之前，门框上不该已经有第二道刻痕");
    // 一直拉到底
    step(s, { pointerHeld: true, pointerCard: { u: L.u1 + 0.1, v: GRIP.v } }, 240);
    assert.notEqual(CurrentBeatDef(s)?.id, "c8_carve", "拉满一道线，这一拍必须过");
    assert.equal(s.flags.carved, true, "划完了，第二道刻痕才长在门框上");
    assert.equal(s.scribeCard, null, "划完了，那张卡必须收走");
  }

  // ③ 手飘离刻线：笔脱手，印子当场停住
  {
    const s = mk();
    step(s, {}, 2);
    step(s, { pointerHeld: true, pointerCard: { ...GRIP } });
    step(s, { pointerHeld: true, pointerCard: { u: GRIP.u + 0.08, v: GRIP.v } }, 4);
    const drawnBefore = s.beat.drawn;
    assert.ok(drawnBefore > 0, "先得划出一点");
    step(s, { pointerHeld: true, pointerCard: { u: L.u1, v: GRIP.v + L.slipV + 0.08 } }, 30);
    assert.equal(s.beat.grabbed, false, "手抬离刻线太远，笔必须脱手");
    assert.equal(s.beat.drawn, drawnBefore, "脱手之后印子不该再长");
  }

  // ④ 键盘后备仍在（自动通关测试与无鼠标的玩家都靠它）
  {
    const s = mk();
    step(s, {}, 2);
    step(s, { interactHeld: true, moveX: 1 }, 200);
    assert.notEqual(CurrentBeatDef(s)?.id, "c8_carve", "按住 E 往右推必须也能划完");
  }

  // ⑤ 这一拍不许出现任何 HUD 轨道：**用户反复要过的就是这一条**——
  // 画面里有一根可拖的条，玩家就永远去拖那根条，"攥住一支笔"当场作废。
  {
    const s = mk();
    step(s, {}, 2);
    assert.ok(s.scribeCard, "站定就该亮出那张特写卡");
    let moved = 0;
    for (let i = 0; i < 60 && CurrentBeatDef(s)?.id === "c8_carve"; i += 1) {
      step(s, { pointerHeld: true, pointerCard: { u: GRIP.u + i * 0.006, v: GRIP.v } });
      assert.ok(!s.dragTrack, "划线这一拍绝不许有拖动轨道（slider）");
      moved = Math.max(moved, s.scribeCard?.head || 0);
    }
    assert.ok(moved > 0, "卡上那支笔得真的跟着手走");
    assert.ok(!s.dragTrack, "划完之后也不许留下一根轨道");
  }
  console.log("  ✓ 石笔：长在特写卡上 / 抓不住就划不动 / 有摩擦 / 会脱手 / 无 slider / 键盘后备可用");
}

// 昼夜过渡得是**一条连续的曲线**，不是进拍即换（用户 2026-08-09：
// "24h切换现在太生硬，我需要你做的更自然一些"）。三条判据：
// ①白天奔夜里必须**经过黄昏**（中途是暖的），夜里奔白天经过拂晓；
// ②整条曲线上不许有跳变（相邻采样的浓淡与色相都得是小步）；
// ③重烘该藏在最暗那一刻（鼓包的顶点在中途，不在两头）。
function TestDayNightIsContinuous() {
  const warm = (hex) => ((hex >> 16) & 255) > (hex & 255);   // 红多于蓝＝暖
  // ① 路径：隔着一整个白天/黑夜的要插一档过渡
  assert.deepEqual(LightPath("day", "night"), ["day", "dusk", "night"], "白天奔夜里要经过黄昏");
  assert.deepEqual(LightPath("night", "day"), ["night", "dawn", "day"], "夜里奔白天要经过拂晓");
  assert.deepEqual(LightPath("dawn", "day"), ["dawn", "day"], "相邻两档直接过");
  assert.deepEqual(LightPath("night", "dawn"), ["night", "dawn"], "目标本身就是过渡档，不再插");
  assert.ok(warm(MoodAt("day", "night", 0.5).tint), "白天奔夜里，中途那一下必须是暖的（日头落下去）");
  assert.ok(!warm(MoodAt("day", "night", 1).tint), "落到夜里必须是冷的");

  // ② 连续性：整条曲线逐点比，一步都不许跳。0.02 的步长换到 2.6 秒的过渡
  // 里就是一帧多一点，跳变一眼看得出来的量级是 0.1 往上
  for (const [from, to] of [["day", "night"], ["night", "day"], ["dawn", "night"], ["day", "tunnel"]]) {
    let prev = MoodAt(from, to, 0);
    for (let t = 0.02; t <= 1.0001; t += 0.02) {
      const now = MoodAt(from, to, t);
      assert.ok(Math.abs(now.dark - prev.dark) < 0.05,
        `${from}→${to} 的浓淡在 t=${t.toFixed(2)} 跳了 ${(now.dark - prev.dark).toFixed(3)}`);
      for (const sh of [16, 8, 0]) {
        const d = Math.abs(((now.tint >> sh) & 255) - ((prev.tint >> sh) & 255));
        assert.ok(d < 24, `${from}→${to} 的色相在 t=${t.toFixed(2)} 跳了 ${d}`);
      }
      prev = now;
    }
    // 两头必须**正好**落在那一档上（过渡完还差一点点就是"永远不到位"）
    assert.equal(MoodAt(from, to, 1).dark, LIGHT_MOOD[to].dark, `${from}→${to} 走完得正好是 ${to}`);
    assert.equal(MoodAt(from, to, 0).dark, LIGHT_MOOD[from].dark, `${from}→${to} 起点得正好是 ${from}`);
  }

  // ③ 鼓包（重烘藏身处）：顶点在中途，两头归零
  assert.equal(DipAt(0), 0, "过渡起点不该额外压暗");
  assert.equal(DipAt(1), 0, "过渡走完必须把额外那层撤干净");
  assert.ok(DipAt(0.5) > DipAt(0.2) && DipAt(0.5) > DipAt(0.8), "最暗的那一刻该在中途");
  assert.ok(Math.abs(DipAt(0.5) - LIGHT_DIP) < 1e-6, "顶点就是 LIGHT_DIP");
  console.log("  ✓ 昼夜过渡：白天经黄昏落夜 / 曲线无跳变 / 重烘藏在最暗那一刻");
}

// 画框边缘的指路标（勇敢的心式）：目标出了画框且离得远 → 必须指、指对边；
// 目标就在画框里或人已到近旁 → 不指；特写里不指；目标在另一层 → 先指梯口。
function TestEdgeHintPointsOffscreenTargets() {
  const VIEW = 12.3;   // 地表玩法景别的画框宽（hw 6.15 × 2）
  // 第一章里找一幕带同层空间目标的玩法拍（剧本再改也不至于失效）
  let s = null, tg = null;
  const list = ChapterBeatList(0);
  for (let i = 0; i < list.length; i += 1) {
    const cand = CreateGame(0);
    DebugJump(cand, 0, i);
    if (cand.phase !== "playing") continue;
    const def = CurrentBeatDef(cand);
    if (!def || def.kind === "cinematic") continue;
    const t = GetBeatTarget(cand);
    if (t && typeof t.x === "number" && (t.level || "surface") === (cand.player.level || "surface")) {
      s = cand; tg = t; break;
    }
  }
  assert.ok(s, "第一章得有一幕带空间目标的玩法拍");
  const scene = SCENES[CHAPTERS[s.chapterIndex].scene];
  const rng = scene.walk[s.player.level] || scene.walk.surface;
  // 站到离目标 12m 开外（往走得开的那头挪）
  const dir = tg.x - rng[0] > rng[1] - tg.x ? -1 : 1;
  s.player.x = Math.max(rng[0], Math.min(rng[1], tg.x + dir * 12));
  const t2 = GetBeatTarget(s);   // 目标可能跟着演员挪，取此刻的
  const eh = EdgeHint(s, s.player.x, VIEW);
  assert.ok(eh, "目标出画框且远：必须给边缘指路标");
  assert.equal(eh.side, Math.sign(t2.x - s.player.x), "指路标必须指向目标那一侧");
  // 镜头对着目标：画框里的东西不用指
  assert.equal(EdgeHint(s, t2.x, VIEW), null, "目标在画框里就不指");
  // 特写里不指：手上的活正做到一半，别拿路标打岔
  s.closeUp = { x: s.player.x, y: 1.2, hw: 3 };
  assert.equal(EdgeHint(s, s.player.x, VIEW), null, "特写里不指");
  s.closeUp = null;
  // 人已经走到近旁：哪怕镜头甩开了也不指（免得边缘标来回闪）
  s.player.x = Math.max(rng[0], Math.min(rng[1], t2.x + 2));
  assert.equal(EdgeHint(s, t2.x + 40, VIEW), null, "人已到近旁就不指");

  // 跨层：全八章里找一幕"目标在另一层、人又离梯口够远"的，验梯口重定向
  let cross = null;
  for (let c = 0; c < CHAPTERS.length && !cross; c += 1) {
    const cl = ChapterBeatList(c);
    for (let i = 0; i < cl.length; i += 1) {
      const cand = CreateGame(0);
      DebugJump(cand, c, i);
      if (cand.phase !== "playing") continue;
      const def = CurrentBeatDef(cand);
      if (!def || def.kind === "cinematic") continue;
      const t = GetBeatTarget(cand);
      if (!t || typeof t.x !== "number") continue;
      if ((t.level || "surface") === (cand.player.level || "surface")) continue;
      const sc = SCENES[CHAPTERS[c].scene];
      const usable = (sc.shafts || []).filter((sh) => !sh.builtFlag || cand.flags[sh.builtFlag]);
      if (!usable.length) continue;
      const near = usable.reduce((m, sh) => Math.min(m, Math.abs(cand.player.x - sh.x)), Infinity);
      if (near < 6) continue;   // 站在梯口跟前轮不到边缘标，找个够远的
      cross = cand;
      break;
    }
  }
  if (cross) {
    const eh2 = EdgeHint(cross, cross.player.x, VIEW);
    assert.ok(eh2 && eh2.climb, "目标在另一层：边缘标得带竖向记号（先去梯口）");
  }
  console.log("  ✓ 边缘指路标：出框才指 / 指对边 / 近旁与特写不指" + (cross ? " / 跨层先指梯口" : ""));
}

// 边缘 HUD 的牌面（勇敢的心式）：方向归箭头，"接下来干嘛"归图。
// 硬门槛是**每一拍都推得出一张牌**，而且牌面跟着活儿变——全场只有一枚箭头，
// 那就退回成了"往这边走"，等于没说。
function TestEdgeHintIconTellsWhatsNext() {
  const KINDS = new Set([
    "person", "item", "hand", "listen", "crouch", "walk", "dig", "timber",
    "door", "knot", "winch", "cart", "throw", "map", "scribe", "lamp",
  ]);
  const seen = new Map();     // 牌面 → 头一次见到它的那一拍（顺带当去重清单）
  let beats = 0;
  for (let c = 0; c < CHAPTERS.length; c += 1) {
    const list = ChapterBeatList(c);
    for (let i = 0; i < list.length; i += 1) {
      const s = CreateGame(0);
      DebugJump(s, c, i);
      if (s.phase !== "playing") continue;
      const def = CurrentBeatDef(s);
      if (!def || def.kind === "cinematic" || def.kind === "choice") continue;
      const tg = GetBeatTarget(s);
      if (!tg || typeof tg.x !== "number") continue;
      beats += 1;
      const icon = BeatHintIcon(s);
      assert.ok(icon, `第${c + 1}章第${i}拍（${def.kind}）推不出牌面`);
      assert.ok(KINDS.has(icon.kind), `牌面种类 ${icon.kind} 没有画法（第${c + 1}章第${i}拍）`);
      // 找人得说清是谁、拿东西得说清是什么——空着的话渲染层只能画个默认，
      // 那就又回到"所有拍长一个样"
      if (icon.kind === "person") assert.ok(icon.who, `找人的牌面得带上是谁（第${c + 1}章第${i}拍）`);
      if (icon.kind === "item") assert.ok(icon.item, `拿东西的牌面得带上是什么（第${c + 1}章第${i}拍）`);
      const key = icon.kind + "|" + (icon.who || icon.item || icon.gesture || "");
      if (!seen.has(key)) seen.set(key, `${c + 1}-${i}`);
    }
  }
  assert.ok(beats > 20, `可指路的玩法拍太少（只找到 ${beats} 拍），这条测试没扫到东西`);
  assert.ok(seen.size >= 8, `牌面只有 ${seen.size} 种，太少了——不同的活儿该长得不一样`);
  // 全场不许退化成一枚"走过去"
  const walkOnly = [...seen.keys()].every((k) => k.startsWith("walk"));
  assert.ok(!walkOnly, "所有拍都推成了「走过去」，等于没给提示");
  // 定点：第一章那几件事各是各的牌面
  const c1 = SCRIPTS[CHAPTERS[0].id];
  const escortIdx = c1.findIndex((d) => d.kind === "escort" && d.follower === "sister");
  if (escortIdx >= 0) {
    const s = CreateGame(0);
    DebugJump(s, 0, escortIdx);
    const sister = s.actors.find((a) => a.id === "sister");
    if (sister && sister.visible && !sister.following) {
      const icon = BeatHintIcon(s);
      assert.equal(icon.kind, "person", "去带妹妹那一拍：牌上该是个人");
      assert.equal(icon.who, sister.kind, "牌上那个人得就是妹妹（衣色/侧脸按她的来）");
    }
  }
  const pickIdx = c1.findIndex((d) => d.kind === "chain" && d.steps?.[0]?.type === "pickup");
  if (pickIdx >= 0) {
    const s = CreateGame(0);
    DebugJump(s, 0, pickIdx);
    if ((s.beat.stepIndex || 0) === 0) {
      const icon = BeatHintIcon(s);
      assert.equal(icon.kind, "item", "去捡东西那一步：牌上该是那件东西");
      assert.equal(icon.item, c1[pickIdx].steps[0].item.label, "牌上得是这一步真要捡的那件");
    }
  }
  console.log(`  ✓ 边缘 HUD 牌面：${beats} 拍全推得出 / ${seen.size} 种图 / 找人认得出是谁、拿东西认得出是什么`);
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
    // 绕圈点：放到这儿就交叉淡回 cue。缺了它就会一路放进渐弱的尾奏，
    // 玩家听成"音乐停了半天又重新播放"（2026-08-10 用户报的那个 bug）
    assert.equal(code.loopEnd, item.loopEnd, `${item.id} loopEnd 不一致`);
    assert.ok(code.loopEnd > code.cue + 20,
      `${item.id} 的 loopEnd(${code.loopEnd}) 必须在 cue(${code.cue}) 之后足够远，不然一圈太短`);
    assert.ok(code.loopEnd <= item.duration - 3,
      `${item.id} 的 loopEnd(${code.loopEnd}) 必须早于曲尾(${item.duration})——尾奏是渐弱到静音的，放进去就等于音乐断了`);
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

function TestRelicsBag() {
  const all = AllRelics();
  assert.ok(all.length >= 9, `收藏品至少 9 件，现在 ${all.length}`);
  const ids = new Set(all.map((r) => r.id));
  assert.equal(ids.size, all.length, "收藏品 id 撞了");
  const artSrc = fs.readFileSync(
    path.join(path.dirname(fileURLToPath(import.meta.url)), "Script_Art.mjs"), "utf8");
  for (const r of all) {
    assert.ok(r.note.length >= 20, `${r.id} 的注解太短`);
    assert.ok(artSrc.includes(`case "${r.art}"`), `DrawRelic 缺 ${r.art} 的画法`);
  }
  // 前景草：art 覆盖 + 疑兵位（远离一切收藏品 3m 以上的草丛至少两处）
  let decoys = 0;
  for (const [key, sc] of Object.entries(SCENES)) {
    for (const f of sc.fore || []) {
      assert.ok(["grass", "stalks", "weeds"].includes(f.art), `fore 草 ${key}@${f.x} 的 art 没画法`);
      const nearRelic = (sc.relics || []).some((r) => Math.abs(r.x - f.x) < 3);
      if (!nearRelic) decoys += 1;
    }
  }
  assert.ok(decoys >= 3, "前景草全长在收藏品跟前——那就成了藏宝标记，要掺疑兵位");

  // 无头拾取：跳到第一章玩法拍，走到鸡窝那件跟前按 E
  const st = CreateGame(0);
  DebugJump(st, 0, ChapterBeatList(0).find((b) => b.id === "c1_well").index);
  const idle = { moveX: 0, climb: 0, crouch: false, interact: false, interactHeld: false, advance: false };
  StepGame(st, idle, DT);
  st.player.x = 66.3;
  st.player.level = "surface";
  st.player.cineWalk = null;
  StepGame(st, idle, DT);
  assert.equal(st.prompt, "E · 收进包袱", `站到收藏品跟前该出拾取提示，实际 ${JSON.stringify(st.prompt)}`);
  StepGame(st, { ...idle, interact: true }, DT);
  assert.ok(st.relicsGot.has("newsSheet"), "按 E 没收进包袱");
  assert.ok(st.relicCard && st.relicCard.id === "newsSheet", "拾取后要出包袱卡（Main 靠它存档+滑条）");
  StepGame(st, idle, DT);
  assert.notEqual(st.prompt, "E · 收进包袱", "收走了还出提示");
  // 包袱开着世界要冻住
  st.bagOpen = true;
  const beforeX = st.player.x;
  StepGame(st, { ...idle, moveX: 1 }, DT);
  assert.equal(st.player.x, beforeX, "包袱开着人还能走——世界没冻住");
  st.bagOpen = false;
  console.log(`  ✓ 收藏品：${all.length} 件老物件 / 注解齐 / 画法齐 / 疑兵草 ${decoys} 处 / 无头拾取通`);
}

function TestCliAnswersQuestions() {
  const cli = path.join(path.dirname(fileURLToPath(import.meta.url)), "Script_Cli.mjs");
  const run = (args) => execFileSync(process.execPath, [cli, ...args], { encoding: "utf8", timeout: 60000 });

  // ① where：索引里必须找得到各类东西，且答案带 文件:行
  const w = run(["where", "c1_well"]);
  assert.match(w, /c1_well\s+节拍/, "where 得认得节拍 id");
  assert.match(w, /Script_Core\.mjs:\d+/, "where 的答案必须带 文件:行，不然还得再 grep 一遍");
  assert.match(run(["where", "DrawHenCoop"]), /画笔.*Script_Art\.mjs:\d+/, "where 得认得画笔");
  assert.match(run(["where", "henCoop"]), /Data_PropArt\.json:\d+/, "where 得认得道具登记");

  // ② beats/beat：不读 Core 就能拿到一拍的全部
  assert.match(run(["beats", "c1"]), /c1_well/, "beats 得列全第一章");
  const b = run(["beat", "c1_well"]);
  assert.match(b, /步骤 9/, "beat 得把步骤数说清");
  assert.match(b, /needs="bucket"/, "beat 得说清这一步要什么");
  assert.match(b, /旗标\s+.*wellRopeFixed/, "beat 得扫出这一拍碰的旗标（且不许把后面几拍的算进来）");

  // ③ state：无头跑到任意一拍、喂真输入、把状态打出来——那 725 次探针脚本的替代品
  const s0 = run(["state", "c1_well", "--x", "43.0", "--json"]);
  const j0 = JSON.parse(s0);
  assert.equal(j0.beat.id, "c1_well");
  assert.match(j0.prompt || "", /空桶|拎/, "站到缸边必须给得出拎桶的提示");
  const j1 = JSON.parse(run(["state", "c1_well", "--x", "43.0", "--input", "e", "--json"]));
  assert.equal(j1.player.item, "bucket", "输入小语言得真的驱动得动玩法");

  // ④ --flag：手拨游戏里的是/否开关。没它就只能现写脚本——"拍没挖通/挖通了
  //    两张对比图"这种最常见的需求，正是 2026-08-10 补上这个开关的由头。
  //    顺带从第二个角度锁死防兵洞那条：同一拍、同样往东走，开关一翻结果就得变。
  const dug = (flag) => JSON.parse(run(["state", "c1_well", "--level", "under", "--x", "38",
    "--input", "d*300", ...(flag ? ["--flag", flag] : []), "--json"])).player.x;
  const wall = dug(null);
  const through = dug("tunnelDug=1");
  assert.ok(wall < 43, `没挖开就该被自家窖东壁挡住，却走到了 ${wall}`);
  assert.ok(through > 50, `--flag tunnelDug=1 应该让人走进七叔家窖，却停在 ${through}`);
  assert.ok(through - wall > 8, "开关没起作用：翻不翻都走到同一个地方");
  console.log(`  ✓ 命令行工作台：where 定位 / beat 拆解 / state 无头复现 / --flag 拨开关（${wall} → ${through}）`);
}

function TestGestureBlobStaysDead() {
  const dir = path.dirname(fileURLToPath(import.meta.url));
  const read = (f) => fs.readFileSync(path.join(dir, f), "utf8");
  assert.ok(!/state\.gesture\s*=/.test(read("Script_Core.mjs")),
    "state.gesture 通道已拆，Core 里不许再写它");
  assert.ok(!read("index.html").includes("gestureHint"), "index.html 里不许再有 #gestureHint 元素");
  const css = read("Style_Game.css");
  assert.ok(!/#gestureHint\s*\{/.test(css) && !/\.gDot/.test(css), "小黑饼的样式与圆点动画不许回来");
  assert.ok(!/ui\.gestureHint/.test(read("Script_Main.js")), "Main 里不许再同步小黑饼");
  console.log("  ✓ 手势小黑饼保持死亡：方向在文案里，招呼在实物上");
}

// 锄地轨道的三条铁律（2026-08-10 用户退回：「挥舞锄头的动作还是太蠢了」
// 「挥舞的时候为什么脚也会在y轴上漂移？」）。逐键盯死，退化立刻红：
//   ① 脚钉在地上：每个键都得带全六个腿关节，且踝的垂距 L(cos a + cos(a−b))
//      必须等于 BONE.hipY + hipY——胯沉腿不跟着解，脚就跟着胯在 y 轴上漂；
//   ② 脚也不许横滑：踝的水平位置逐键恒定；
//   ③ 锄板要真的够到土、扬要真的过肩：θ=armF+foreF 低点 ≤ −180（板到头后），
//      高点 ≥ −45（板咬进土），而且从扬到落必须是一记 0.4s 内 ≥120° 的抡劈——
//      没有这一下快慢对比，锄地就成了匀速划水。
function TestHoeingIsARealSwing() {
  const rigSrc = fs.readFileSync(
    path.join(path.dirname(fileURLToPath(import.meta.url)), "Script_Rig.mjs"), "utf8");
  const block = rigSrc.slice(rigSrc.indexOf("  hoeing: {"), rigSrc.indexOf("  scatterFeed: {"));
  assert.ok(block.length > 100, "找不到 hoeing 轨道");
  const keys = [...block.matchAll(/\{ t: [^}]*\}/g)].map((m) => new Function(`return (${m[0]})`)());
  assert.ok(keys.length >= 5, "hoeing 关键帧太少");
  const L = 0.31, HIP = 0.62;   // BONE.thigh / BONE.hipY（Rig 在 node 下拖不动 three，抄数值）
  const rad = (d) => (d * Math.PI) / 180;
  const ankles = { F: [], B: [] };
  for (const k of keys) {
    for (const leg of ["F", "B"]) {
      for (const j of [`thigh${leg}`, `shin${leg}`, `foot${leg}`]) {
        assert.ok(k[j] !== undefined, `t=${k.t} 的键缺 ${j}——腿不逐键解，脚就会跟着胯漂`);
      }
      const a = -k[`thigh${leg}`], b = k[`shin${leg}`];
      const drop = L * (Math.cos(rad(a)) + Math.cos(rad(a - b)));
      const need = HIP + k.hipY;
      assert.ok(Math.abs(drop - need) < 0.02,
        `t=${k.t} ${leg}腿踝距地 ${drop.toFixed(3)} ≠ 胯高 ${need.toFixed(3)}——脚要么悬空要么陷地`);
      ankles[leg].push(L * (Math.sin(rad(a)) + Math.sin(rad(a - b))) + k.hipX);
    }
  }
  for (const leg of ["F", "B"]) {
    const spread = Math.max(...ankles[leg]) - Math.min(...ankles[leg]);
    assert.ok(spread < 0.025, `${leg}脚在地上横滑了 ${(spread * 100).toFixed(1)}cm`);
  }
  const thetas = keys.map((k) => k.armF + k.foreF);
  assert.ok(Math.min(...thetas) <= -180, `扬锄必须过肩（θ 低点 ${Math.min(...thetas)} > -180，还是在身前举旗）`);
  assert.ok(Math.max(...thetas) >= -45, `落锄必须够到土（θ 高点 ${Math.max(...thetas)} < -45，锄板悬在半空）`);
  const whip = keys.some((k, i) => i > 0
    && Math.abs(thetas[i] - thetas[i - 1]) >= 120 && (k.t - keys[i - 1].t) <= 0.4);
  assert.ok(whip, "从扬到落必须是一记 0.4s 内 ≥120° 的抡劈——匀速划水不算锄地");
  console.log("  ✓ 锄地是一记真抡劈：脚钉在地上不漂不滑、扬过肩、锄板咬进土");
}

// 刨料这一拍是"手上真有活"的教学，几条硬约束：镜头必须推到台面上
// （老版是十几米外按 E 敲木楔，木楔只有几个像素）；**玩家攥的是那把刨子**，
// 不是一根滑块（用户明令禁止 slider——手得真落在刨子上才拖得动，dragTrack
// 已整根拆掉）；顺纹才吃木头、倒着拖不算；中间顿一下这一趟就不齐（刨花
// 短一截），但**永远不会卡死**——推够趟数就过。
// 做功那几拍的活卡**不许自带不透明底板**。
//
// 老版三张活卡都调 CardBase（一整块渐变色铺满画框），于是镜头一推近整个村子
// 就没了——用户 2026-08-10 的原话：「镜头在打刨花的时候 为什么后面的场景不
// 拍出来？搞的像在玩一个独立的游戏一样……你搞了个纯色背景算什么」。
// 现在底透明，背后那层真景由 World 的离屏虚化铺上去（Render 里的景深那一段）。
// 定格插卡（过场里那几张画）不在此列：它们本来就是一张画，铺满底板是对的。
function TestLiveCardsKeepTheWorldBehind() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const art = fs.readFileSync(path.join(here, "Script_Art.mjs"), "utf8");
  const LIVE = ["DrawPlaneCard", "DrawScribeCard", "DrawKnotCard"];
  for (const fn of LIVE) {
    const at = art.indexOf(`export function ${fn}(`);
    assert.ok(at > 0, `找不到活卡画笔 ${fn}`);
    // 取到下一个 export 为止，就是这支画笔的函数体
    const end = art.indexOf("\nexport ", at + 10);
    const body = art.slice(at, end < 0 ? art.length : end);
    assert.ok(/\bLiveCardBase\(/.test(body), `${fn} 必须走 LiveCardBase（透明底）`);
    assert.ok(!/\bCardBase\(/.test(body.replace(/LiveCardBase\(/g, "")),
      `${fn} 不许再铺 CardBase 那块不透明底板——那会把背后的村子整个盖掉`);
  }
  // 世界那边也得认得出"活卡在时要走虚化那条路"
  const world = fs.readFileSync(path.join(here, "Script_World.js"), "utf8");
  assert.ok(/dofOn\s*=\s*true/.test(world), "活卡挂上时必须打开离屏虚化那条路");
  assert.ok(/DOF_SCALE/.test(world) && /uStep/.test(world), "背景虚化的那两遍高斯不许拆掉");
  console.log("  ✓ 活卡的底是透明的：做功那几拍背后还是那个村子（散焦，不是色板）");
}

// 礅门轴那条轨道：**下半身在每一帧都必须是同一组数**，脚才不会在地上滑。
//
// 老版拿两个静态姿势来回切（kneel ⇄ swing，一个跪一个站，胯高差 44 厘米、
// hipX 差 0.12m），于是每 0.85 秒爹就从跪着弹起来再蹲回去，脚跟着横移——
// 用户 2026-08-10 的原话：「脚会位移」。这条断言按源码扫：malletTap 除了
// 第一帧，任何一帧都不许再声明胯与两条腿；位置也必须由 Core 每帧钉死。
// Script_Rig 依赖 three，node 里 import 不进来，所以只能这么扫源码。
function TestMalletTapDoesNotSlide() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const rig = fs.readFileSync(path.join(here, "Script_Rig.mjs"), "utf8");
  const at = rig.indexOf("malletTap: {");
  assert.ok(at > 0, "礅门轴的轨道 malletTap 必须在（爹的动作不许再借别处的静态姿势）");
  const body = rig.slice(at, rig.indexOf("\n  },", at));
  const keys = body.split(/\{\s*t:/).slice(1);
  assert.ok(keys.length >= 4, `malletTap 至少要有起手/举起/顿住/砸下四帧（实为 ${keys.length}）`);
  const LOWER = ["hipY", "hipX", "thighB", "shinB", "footB", "thighF", "shinF", "footF"];
  for (const j of LOWER) assert.ok(new RegExp(`\\b${j}:`).test(keys[0]), `第一帧得把 ${j} 定下来`);
  keys.slice(1).forEach((k, i) => {
    for (const j of LOWER) {
      assert.ok(!new RegExp(`\\b${j}:`).test(k),
        `malletTap 第 ${i + 2} 帧动了 ${j}——下半身一动脚就在地上滑（这条轨道的全部意义就是不滑）`);
    }
  });
  // 首尾必须是同一格：knockT 归零那一帧接得上，不然每敲一下闪一下
  const arm = (k) => (k.match(/armF:\s*(-?\d+)/) || [])[1];
  assert.equal(arm(keys[0]), arm(keys[keys.length - 1]), "malletTap 的首尾两帧必须重合（相位是循环的）");
  // Core 那边：相位由 knockT 喂，人钉在轴边不许挪
  const core = fs.readFileSync(path.join(here, "Script_Core.mjs"), "utf8");
  const hd = core.slice(core.indexOf('case "holdDoor"'), core.indexOf('case "throwHit"'));
  assert.ok(/name:\s*"malletTap",\s*t:\s*b\.knockT/.test(hd),
    "槌子的相位必须直接由 knockT 喂——声音、进度、落槌那一帧才对得上");
  assert.ok(/father\.x\s*=\s*dx\s*-/.test(hd), "爹要钉在门轴边上，不许在这一拍里挪位置");
  console.log("  ✓ 礅门轴：下半身钉死不滑脚 / 相位跟着 knockT / 人钉在轴边");
}

function TestModuleGraphIsCacheBusted() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const html = fs.readFileSync(path.join(here, "index.html"), "utf8");
  const map = JSON.parse(html.match(/<script type="importmap">([\s\S]*?)<\/script>/)[1]);
  const imports = map.imports || {};

  // 入口自己走 <script src>，其余全靠 import map
  const entry = html.match(/src="\.\/Script_Main\.js\?v=(\d+)"/);
  assert.ok(entry, "index.html 的入口 Script_Main.js 必须带 ?v= 版本戳");
  const ver = entry[1];

  // 浏览器真正跑的那些第一方模块：**从入口把模块图走一遍**自己数出来。
  // 原来这儿是一张手写的清单，于是它和 import map 是两份要同步的名单——
  // 2026-08-09 新增 Data_DayCycle 时就漏了：import map 加了、这张单子没加，
  // 测试照样绿。清单只该有一份（index.html 那张），这里负责去对它。
  const browserModules = (() => {
    const seen = new Set();
    const walk = (file) => {
      if (seen.has(file)) return;
      seen.add(file);
      const src = fs.readFileSync(path.join(here, file), "utf8");
      for (const m of src.matchAll(/(?:from|import\()\s*["']\.\/([A-Za-z_]+\.m?js)["']/g)) walk(m[1]);
    };
    walk("Script_Main.js");
    seen.delete("Script_Main.js");            // 入口自己走 <script src>
    return [...seen].sort();
  })();
  assert.ok(browserModules.length >= 12, `模块图只走出 ${browserModules.length} 个，正则怕是失灵了`);
  for (const m of browserModules) {
    assert.equal(imports[`./${m}`], `./${m}?v=${ver}`,
      `${m} 必须登记在 index.html 的 import map 里并盖上 ?v=${ver}——`
      + "漏掉的模块会独自留在手机缓存里，新壳配旧芯");
  }

  // 源码里不许再自己写版本戳：同一个模块两个 URL = 浏览器加载两份实例
  for (const f of fs.readdirSync(here).filter((n) => /^(Script|Data)_.*\.(js|mjs)$/.test(n))) {
    const src = fs.readFileSync(path.join(here, f), "utf8");
    for (const line of src.split("\n")) {
      if (!/^\s*(import|.*\bimport\()/.test(line)) continue;
      assert.ok(!/\.(mjs|js)\?v=/.test(line),
        `${f} 里不该自己写版本戳（交给 index.html 的 import map）：${line.trim()}`);
    }
  }
  console.log(`  ✓ 缓存版本戳盖满整张模块图（v=${ver}，${browserModules.length} 个模块）`);
}

function TestQuieterAudioMix() {
  assert.ok(AUDIO_BUS_BASE.sfx <= 0.68, "音效总线必须保持在降低后的基准");
  // 环境声（风）是从头响到尾的底噪，玩家反馈「太吵」——基准压到 0.34 以下。
  // 它跟「音效」滑杆共用一个电平，所以只能从基准压：压滑杆会把动作音一起带走
  assert.ok(AUDIO_BUS_BASE.amb <= 0.34, "环境声总线必须保持在降低后的基准");
  assert.ok(AUDIO_BUS_BASE.music <= 0.42, "配乐总线必须保持在降低后的基准");
  // 2026-08-12 用户：「先把音乐、音效默认关闭」——两路默认电平归零。
  // 环境声跟着「音效」滑杆走，所以风那条底噪也一并静了
  assert.equal(AUDIO_DEFAULT_LEVELS.sfx, 0, "音效默认关闭");
  assert.equal(AUDIO_DEFAULT_LEVELS.music, 0, "配乐默认关闭");
  assert.equal(AUDIO_DEFAULT_LEVELS.voice, 100, "关的是背景声，不是旁白");
  console.log("  ✓ 音效与环境声降噪混音契约（音乐/音效默认关闭）");
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
TestPrologueStandsOutsideChapters();
TestVision();
TestCoverIsDirectional();
TestClimb();
TestTunnelNotDugYet();
TestSmokeFront();
TestDetectionReset();
TestStealthEscapable();
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
  // 小黑饼已拆：方向必须写在提示文案里，抽象图形替不了字
  assert.equal(st.gesture, undefined, "手势小黑饼已拆（2026-08-10 用户）");
  // 「顶」这个动词自带方向（顶=向上使劲）；写成别的动词就得把「往上」补进文案
  assert.match(st.prompt || "", /往上|顶/, `方向得写进提示文案（实为 ${JSON.stringify(st.prompt)}）`);
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

// 进村的是一支队伍，不是两个人（用户拿景区实拍立的规矩）：
// 自行车伪军 + 挎斗摩托（驾驶+斗里的兵）+ 徒步纵队。潜行判定仍只有两个兵——
// 其余全 decor，否则考场没法玩。这条断言盯两头：队伍要在、考场不许变难。
function TestRaidColumn() {
  // 进村队列如今开在第二章开场（梳篦扫荡）：跳到 c2_open，把过场点到
  // 队伍生成那一行为止
  const state = CreateGame(1);
  const list = ChapterBeatList(1);
  DebugJump(state, 1, list.findIndex((b) => b.id === "c2_open"));
  const idleIn = { moveX: 0, climb: 0, crouch: false, interact: false, interactHeld: false, throw: false, advance: false };
  let g0 = 0;
  while (!state.actors.some((a) => a.kind === "soldier") && g0 < 600) {
    g0 += 1;
    StepGame(state, { ...idleIn, advance: true }, DT);
    StepGame(state, idleIn, DT);
  }
  const enemies = state.actors.filter((a) => (a.kind === "soldier" || a.kind === "puppet") && a.visible !== false);
  const active = enemies.filter((a) => !a.decor);
  assert.ok(enemies.length >= 10, `进村的得是一支队伍，现在只有 ${enemies.length} 个`);
  assert.equal(active.length, 2, `进院搜查的必须恰好两个兵，现在 ${active.length} 个`);
  assert.ok(enemies.some((a) => a.mount === "bicycle"), "队伍里得有骑车的伪军");
  assert.ok(enemies.some((a) => a.mount === "motorcycle"), "队伍里得有挎斗摩托");
  // 斗里坐的是**军官本人**（2026-08-10 用户定：太君坐斗、兵开车），
  // 交头接耳那一镜之后他才下车——进村这一拍必须还钉在车上
  const side = state.actors.find((a) => a.pinTo);
  assert.ok(side, "挎斗里得坐着人");
  assert.equal(side.id, "officer", "斗里坐的得是军官（太君坐斗、兵开车）");
  assert.equal(side.pose, "sitSide", "军官进村时得是坐在斗里的姿势");
  assert.ok(state.actors.some((a) => a.id === "baozhang" && a.carry === "名册"), "伪保长得夹着保甲册带路");
  // 钉在车上的兵要真的跟着车走
  const moto = state.actors.find((a) => a.id === "motoLead");
  moto.cineTarget = { x: moto.x - 6 };
  moto.cineSpeed = 3;
  const idle = { moveX: 0, climb: 0, crouch: false, interact: false, interactHeld: false, throw: false, advance: false };
  for (let i = 0; i < 90; i += 1) StepGame(state, idle, DT);
  assert.ok(Math.abs(side.x - (moto.x + side.pinTo.dx)) < 0.05, "挎斗里的兵没跟住车");
  console.log("  ✓ 清查队：自行车/挎斗摩托/纵队/伪保长在场，进院的只有两个兵");
}

// 队序：**徒步的大部队永远不许超过自行车和摩托**（用户 2026-08-08 退回）。
// 老版本给每个人各写一套起点/终点/速度，两个步兵起手就站在车前头，
// 整支队伍读出来是"步兵开路、车在后面追"。这条逐帧盯着整段行军的先后。
function TestConvoyKeepsFormation() {
  const idle = { moveX: 0, climb: 0, crouch: false, interact: false, interactHeld: false, throw: false, advance: false };
  const state = CreateGame(1);
  const beats = ChapterBeatList(1).map((b) => b.id);
  DebugJump(state, 1, beats.indexOf("c2_open"));
  // 把过场点到队伍生成那一行（梳篦扫荡的队列在 c2_open 第三行进场）
  let g0 = 0;
  while (!state.actors.some((a) => a.kind === "soldier") && g0 < 600) {
    g0 += 1;
    StepGame(state, { ...idle, advance: true }, DT);
    StepGame(state, idle, DT);
  }

  const At = (id) => state.actors.find((a) => a.id === id);
  const pups = state.actors.filter((a) => a.id.startsWith("c1pup")).map((a) => a.id);
  // 日军按「排」编队：id 是 c1jp{排}x{排内第几个}
  const rows = RAID_FORMATION.rows.map((n, r) =>
    Array.from({ length: n }, (_, c) => `c1jp${r}x${c}`));
  const jpAll = rows.flat();
  // 用户定的队形：**十个伪军打头**（2026-08-08），日军**2-3 人一排**殿后（2026-08-09）
  assert.equal(pups.length, 10, `打头的伪军该有十个，现在 ${pups.length} 个`);
  for (const row of rows) {
    assert.ok(row.length >= 2 && row.length <= 3,
      `一排该是 2-3 个人（用户原话），现在 ${row.length} 个`);
  }
  for (const id of pups) assert.equal(At(id).kind, "puppet", `${id} 该是伪军（打头的是他们）`);
  for (const id of jpAll) {
    assert.ok(At(id), `队形里的 ${id} 没被生成出来`);
    assert.equal(At(id).kind, "soldier", `${id} 该是日军`);
  }
  // 伪军也不许排成一条等距的线：十个人得挤成几堆（堆内并排、堆间松散）
  {
    const xs = pups.map((id) => At(id).x).sort((a, b) => a - b);
    const gaps = xs.slice(1).map((x, i) => x - xs[i]);
    assert.ok(gaps.some((g) => g < 0.8), "伪军里得有挤在同一堆并排走的（间距 <0.8m）");
    assert.ok(gaps.some((g) => g > 1.6), "伪军的堆与堆之间得松开（间距 >1.6m）");
  }

  // 队伍朝 -x 开进村：队头 x 最小。队序 = 自行车 → 十个伪军 → 摩托 → 日军各排。
  // 逐帧验整条队序不许换位——速度差一大，走上二十秒谁都能把谁套圈
  const order = ["bikeScout", ...pups, "motoLead", ...jpAll];
  for (let f = 0; f < 240; f += 1) {
    StepGame(state, idle, DT);
    const bike = At("bikeScout");
    if (!bike || bike.visible === false) break;
    for (let i = 1; i < order.length; i += 1) {
      const a = At(order[i - 1]);
      const b = At(order[i]);
      if (!a || !b || a.visible === false || b.visible === false) continue;
      assert.ok(a.x < b.x,
        `第 ${f} 帧：${order[i]} 超到 ${order[i - 1]} 前头了（${b.x.toFixed(1)} ≤ ${a.x.toFixed(1)}）`);
    }
    // **一排人不许被拉开**：这正是"2-3 人一排、不是一人一排线性移动"那条
    // 要求的判据。一排里的人错开半个身位（x）＋后排退一档深度（rank），
    // 两样缺一不可——只给深度在三十米开外等于完全重合，那就退回长蛇了
    rows.forEach((row, r) => {
      for (let c = 0; c < row.length; c += 1) {
        const a = At(row[c]);
        if (!a) continue;
        assert.equal(a.rank, c, `${row[c]} 该是这一排的第 ${c} 排（深度档靠它）`);
        if (c === 0) continue;
        const prev = At(row[c - 1]);
        const d = a.x - prev.x;
        assert.ok(Math.abs(d - RAID_FORMATION.stagger) < 0.06,
          `第 ${f} 帧：第 ${r} 排里 ${row[c]} 掉队了（错位 ${d.toFixed(2)}m，该是 ${RAID_FORMATION.stagger}m）`);
      }
      // 排与排之间必须明显比排内的错位大，"排"的边界才读得出来
      if (r === 0) return;
      const gap = At(row[0]).x - At(rows[r - 1][rows[r - 1].length - 1]).x;
      assert.ok(gap > RAID_FORMATION.stagger * 2.5,
        `第 ${f} 帧：第 ${r} 排贴上前一排了（间距 ${gap.toFixed(2)}m），排与排要分得开`);
    });
  }
  // 摩托紧贴着伪军队尾、又贴着日军队头：用户嫌"摩托和日军距离有点远"，
  // 这一档间距别再被人调回去
  const gapJp = At("c1jp0x0").x - At("motoLead").x;
  assert.ok(gapJp > 0 && gapJp < 8,
    `摩托到日军队头 ${gapJp.toFixed(1)}m——太远了（用户点名要"拉得近一点"）`);

  assert.ok(RankDz(1) < RankDz(0) && RankDz(2) < RankDz(1),
    "排与排的深度必须一档比一档远，后排才画得小一圈");
    console.log("  ✓ 队形：十个伪军三三两两打头 / 日军三人一排共三排 / 排内不掉队 / 队序全程不换位");
}

function TestCineActorsClearOfObstacles() {
  const NONE = { moveX: 0, climb: 0, crouch: false, interact: false, interactHeld: false, throw: false, advance: false };
  const state = CreateGame(1);
  const list = ChapterBeatList(1);
  DebugJump(state, 1, list.findIndex((b) => b.id === "c2_open"));
  const scene = SCENES.village;
  const bad = [];
  for (let i = 0; i < 3000; i += 1) {
    StepGame(state, { ...NONE, advance: false }, DT);
    for (const a of state.actors) {
      // 赶路中的（cineTarget 悬着）只是路过，不算"站在路障里"
      if (a.visible === false || a.level !== "surface" || a.decor || a.cineTarget) continue;
      for (const v of scene.vaults || []) {
        if (v.flag && !state.flags[v.flag]) continue;
        // 半宽 + 半个身位：贴着站没关系，压在正中间就是被吞
        const clear = (v.w || 1) / 2 + 0.35;
        if (Math.abs(a.x - v.x) < clear) bad.push(`${a.id}@${a.x.toFixed(1)} 压在路障 ${v.x} 上`);
      }
    }
    if (bad.length) break;
    if (state.phase !== "playing") break;
  }
  assert.equal(bad.length, 0, `过场演员被路障挡住：${bad.slice(0, 3).join("；")}`);
  console.log("  ✓ 过场演出不与路障同坐标（obstacle 带会把演员整个盖住）");
}

// 投掷：角度和劲都得自己调。这一步**没有**按键后备——曾经按 F 就照着靶心解一条
// 必中的弧，站位落在 3~10.5m 里就赢，等于整个玩法是假的（用户明令删掉）。
// 这条测试盯三件事：① 只有攥住手里那颗石子才起手；② 拽的方向和长短真的决定
// 弧线（同一个站位，拽错了就打不中）；③ 按键路径彻底没了，按 F 一颗石子也飞不出去。
// 命中后妹妹必须乐（cheerHop + 夸一句）——玩家的成功要有人接着。
// 剧本里写的每一个姿势名，Rig 里必须真的有那一支。
//
// 这条是补出来的：姿势名对不上不会报错，只会**静悄悄地不生效**——
// 落到姿势链的末尾，人照常站着，字幕替他把活干了。本项目已经栽过两次
// （`father.pose = "dig"` 根本不存在；地道里指洞顶差点又写成 "point"）。
// 靠源码互查，不需要把 Script_Rig 拉进 node（它 import three，跑不起来）。
function TestPoseNamesExist() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const rig = fs.readFileSync(path.join(here, "Script_Rig.mjs"), "utf8");
  const core = fs.readFileSync(path.join(here, "Script_Core.mjs"), "utf8");
  const handled = new Set([...rig.matchAll(/s\.pose === "([A-Za-z]+)"/g)].map((m) => m[1]));
  assert.ok(handled.size > 15, `Rig 里应当有一整套姿势，实测只认出 ${handled.size} 个`);
  const used = new Set([...core.matchAll(/\.pose = "([A-Za-z]+)"/g)].map((m) => m[1]));
  const bad = [...used].filter((n) => !handled.has(n));
  assert.deepEqual(bad, [], `剧本里这些姿势 Rig 不认识，写了等于没写：${bad.join("、")}`);
  console.log(`  ✓ 剧本用到的 ${used.size} 个姿势名 Rig 全都接得住（共 ${handled.size} 支）`);
}

function TestSlingThrow() {
  const idle = () => ({ moveX: 0, climb: 0, crouch: false, interact: false, interactHeld: false, throw: false, advance: false });
  const beats = ChapterBeatList(0).map((b) => b.id);
  const cloth = SCRIPTS.c1.find((b) => b.id === "c1_well");
  const thr = cloth.steps.find((x) => x.type === "throwHit");
  // 每次都从同一个站位重开：石子在手、面朝榆树、地上没别的东西搅判定
  const Setup = (dist = 4.6) => {
    const st = CreateGame(0);
    DebugJump(st, 0, beats.indexOf("c1_well"));
    StepGame(st, idle(), DT);
    st.beat.stepIndex = cloth.steps.indexOf(thr);
    st.groundItems.length = 0;
    st.player.item = { id: "stone", label: "石子", throwable: true };
    st.player.x = thr.target.x + dist;
    st.player.heading = -1;
    StepGame(st, idle(), DT);
    return st;
  };
  const Fly = (st, n = 200) => { let g = 0; while (st.thrown && g < n) { g += 1; StepGame(st, idle(), DT); } };

  // ① 按下那一帧手必须落在石子上——在别处按一律攥不住
  const st = Setup();
  StepGame(st, { ...idle(), pointerHeld: true, pointerWorld: { x: st.player.x - 3, y: SURFACE_Y + 1.1 } }, DT);
  assert.ok(!st.sling, "在别处按下不该攥住石子");
  StepGame(st, idle(), DT);   // 松开，重下

  // ② 攥住 + 往后下拽：蓄力姿势由拉弓量驱动，预览弧是同一套物理点列。
  //    往哪儿拽由 SlingSolve 现算——它就是这一步的「标准答案」，
  //    自动通关走的也是它（删了按键后备就必须给驱动器一条真输入的路）
  const hx = st.player.x + st.player.heading * 0.24;
  const hy = SURFACE_Y + SLING.HAND_Y;
  const sol = SlingSolve(hx, hy, thr.target.x, thr.target.y);
  assert.ok(sol, "站在石子堆这一侧必须解得出一条够得着的弧");
  assert.ok(sol.power > 0.55 && sol.power < 1,
    `这一步必须真使劲才够得着（实测要拽满的 ${(sol.power * 100).toFixed(0)}%）——拽两下就中等于没调劲`);
  StepGame(st, { ...idle(), pointerHeld: true, pointerWorld: { x: hx, y: hy } }, DT);
  assert.ok(st.sling, "按在石子上必须攥得住");
  const drag = { x: hx - sol.vx / SLING.K, y: hy - sol.vy / SLING.K };
  for (let i = 0; i < 3; i += 1) StepGame(st, { ...idle(), pointerHeld: true, pointerWorld: drag }, DT);
  assert.ok(st.throwAim?.pts?.length > 5, "拽开必须给出弹道预览点列");
  assert.ok(!st.throwAim.x1 && !st.throwAim.y1,
    "不许再画那条「站对位置就必中」的直线辅助——站位不是瞄准");
  assert.equal(st.player.pose, "throwWind", "拽着时必须是蓄力姿势");
  assert.ok(st.player.poseK > 0.4, "拉弓量必须驱动姿势");

  // ③ 松手出手 → 真弹道飞到命中；命中即链步推进 + 妹妹欢呼夸人
  StepGame(st, idle(), DT);
  assert.ok(st.thrown, "松手必须出手");
  assert.ok(st.thrown.vx < 0, "往后拽，石子必须朝前（榆树那边）飞");
  const idx0 = st.beat.stepIndex;
  Fly(st);
  assert.equal(st.flags.elmDown, true, "照着标准答案拽出去的弧必须打中榆钱枝");
  assert.ok(st.beat.stepIndex > idx0, "命中必须推进链步");
  const sis = st.actors.find((a) => a.id === "sister");
  assert.equal(sis?.track?.name, "cheerHop", "打中了妹妹必须拍手蹦");
  assert.ok(st.microCine, "妹妹必须开口夸哥");

  // ④ 劲不够就够不着：同一个角度只拽六成，石子必须落在树跟前，
  //    而且提示要说清楚差在哪一头（"再拽满些"），不能只说一句"擦着边过去了"
  const stWeak = Setup();
  StepGame(stWeak, { ...idle(), pointerHeld: true, pointerWorld: { x: hx, y: hy } }, DT);
  const weak = { x: hx - sol.vx / SLING.K * 0.6, y: hy - sol.vy / SLING.K * 0.6 };
  for (let i = 0; i < 3; i += 1) StepGame(stWeak, { ...idle(), pointerHeld: true, pointerWorld: weak }, DT);
  StepGame(stWeak, idle(), DT);
  Fly(stWeak);
  assert.ok(!stWeak.flags.elmDown, "只拽六成劲不该打中——劲不用调就不叫玩法");
  assert.ok(/拽得再满/.test(stWeak.toast?.text || ""),
    `没够着要说"再拽满些"，实测提示是：${stWeak.toast?.text}`);

  // ⑤ 角度不对也不行：劲一样，但压成平抛，石子必须从树冠底下擦过去
  const stFlat = Setup();
  StepGame(stFlat, { ...idle(), pointerHeld: true, pointerWorld: { x: hx, y: hy } }, DT);
  const speed = Math.hypot(sol.vx, sol.vy);
  const flat = { x: hx + speed * Math.cos(0.12) / SLING.K, y: hy - speed * Math.sin(0.12) / SLING.K };
  for (let i = 0; i < 3; i += 1) StepGame(stFlat, { ...idle(), pointerHeld: true, pointerWorld: flat }, DT);
  StepGame(stFlat, idle(), DT);
  assert.ok(stFlat.thrown, "压平了照样得出手（只是打不中）");
  Fly(stFlat);
  assert.ok(!stFlat.flags.elmDown, "同样的劲、平着甩出去不该打中——角度不用调就不叫玩法");

  // ⑥ 按键路径必须真的没了：手里攥着石子，按 F 按 E 都不许飞出去一颗
  const stKey = Setup();
  for (let i = 0; i < 6; i += 1) StepGame(stKey, { ...idle(), throw: true, interact: true }, DT);
  assert.ok(!stKey.thrown && !stKey.flags.elmDown,
    "投掷不许再有按键后备——按一下就必中的那版是被明令删掉的");
  assert.ok(!/F\b/.test(stKey.prompt || ""), `提示里不许再出现 F 键：${stKey.prompt}`);
  assert.equal(stKey.gesture, undefined, "手势小黑饼已拆，「往后拽」写在提示文案里");
  assert.match(stKey.prompt || "", /拽/, `拽开的招呼得在提示文案里（实为 ${JSON.stringify(stKey.prompt)}）`);
  assert.equal(stKey.player.pose, "throwWind", "手里攥着石子就该摆出架势——画面得先说他随时能扔");

  // ⑦ 判定圈钉在**画出来的那只手**上：渲染层每帧回填 state.handAt（HandPoint），
  //    Core 就得用它。第一章的柱子垂手拎石子的手在 0.47m，照写死的 1.1m 判定
  //    等于让玩家在空气里按——这条是 2026-08-10 在真浏览器里量出来的
  const stHand = Setup();
  stHand.handAt = { x: stHand.player.x - 0.2, y: SURFACE_Y + 0.47 };
  StepGame(stHand, { ...idle(), pointerHeld: true, pointerWorld: { x: stHand.player.x - 0.2, y: SURFACE_Y + 1.6 } }, DT);
  assert.ok(!stHand.sling, "手在 0.47m 的时候，按在 1.6m 的空气里不该攥住");
  StepGame(stHand, idle(), DT);
  StepGame(stHand, { ...idle(), pointerHeld: true, pointerWorld: { ...stHand.handAt } }, DT);
  assert.ok(stHand.sling, "按在渲染层回填的真挂点上必须攥得住");
  assert.ok(Math.abs(stHand.sling.hy - stHand.handAt.y) < 1e-6,
    "拽的原点就是那只手本身，不是写死的估算高度");
  console.log("  ✓ 投石：判定钉在真手上 / 劲和角度都得自己调 / 失败说得清差在哪 / 没有按键后备 / 妹妹接着乐");
}

// 打榆钱这一步得先有由头，不能一上来就把靶子拍脸上：
// 得先看见妹妹够不着（一个人干不成），再听见这一树榆钱顶什么用（分量），
// 最后才是那句请求。缺哪一样，玩家都只是在给一个不认识的人做一道题。
function TestElmSetupIsMotivated() {
  const cloth = SCRIPTS.c1.find((b) => b.id === "c1_well");
  // 新链第一步是拎桶；妹妹开口是紧随其后的 talk
  const talk = cloth.steps.find((s) => s.type === "talk");
  assert.ok(talk, "打榆钱之前必须有妹妹开口那一步");
  assert.equal(talk.actor, "sister", "开口的得是妹妹本人");
  const said = talk.lines.filter((l) => l.say);
  assert.ok(said.length >= 3, "一句话交代不完「谁 + 为什么 + 求你」，至少三句");
  const all = said.map((l) => `${l.who}:${l.say}`).join("|");
  assert.ok(said.every((l) => l.who === "妹妹"), "这几句都该由妹妹说，不能变成旁白");
  assert.ok(/哥/.test(all), "她得叫他一声哥——「这是妹妹」要靠戏里的人说出来");
  assert.ok(/够不着|蹦/.test(all), "得先摆出「她一个人干不成」这件事");
  assert.ok(/粮|糜子|顶/.test(all), "得交代这一树榆钱顶什么用，不然打它干什么");
  assert.ok(/你打|我捡/.test(all), "最后才是那句请求");
  const throwStep = cloth.steps.find((x) => x.type === "throwHit");
  assert.ok(cloth.steps.indexOf(talk) < cloth.steps.indexOf(throwStep), "请求必须排在投石之前");
  assert.ok(!/F/.test(throwStep.prompt || ""), "投石的提示里不许再有 F 键");
  console.log("  ✓ 打榆钱先有由头：够不着 → 顶十天口粮 → 你打我捡，然后才轮到玩家动手");
}

TestPromptsAreDeviceNeutral();
TestStrokeWork();
TestPoseNamesExist();
TestSlingThrow();
TestElmSetupIsMotivated();
TestVaultC1();
TestRaidColumn();
TestConvoyKeepsFormation();
TestCineActorsClearOfObstacles();
TestGroundItems();
TestChainSurvivesEarlyDrop();
TestRelicsBag();
TestCliAnswersQuestions();
TestGestureBlobStaysDead();
TestHoeingIsARealSwing();
TestKnotIsThreadingNotCircling();
TestWinchIsACrankNotALever();
TestWinchIsLongEnough();
TestChalkIsAPencilNotASlider();
TestLiveCardsKeepTheWorldBehind();
TestMalletTapDoesNotSlide();
TestDayNightIsContinuous();
TestEdgeHintPointsOffscreenTargets();
TestEdgeHintIconTellsWhatsNext();
TestInstrumentalBgmManifest();
TestModuleGraphIsCacheBusted();
TestQuieterAudioMix();

console.log("— 全流程自动通关（第六章走『地下进人』，第二章走『舀水』）—");
{
  const t0 = Date.now();
  const state = AutoPlay(CreateGame(0), "tunnel", { log: true, choicePicks: { c2_cough: "water" } });
  assert.equal(state.phase, "gameEnd", "全流程必须能打到终章");
  assert.equal(state.flags.route, "tunnel");
  // 正常打完一遍必须能推出"这是个套"。这条断言是补上的：门板那套机制曾经
  // 整个是死的——gotoSeq 收集的乡亲口信没有入账 notesSeen，于是互相矛盾的
  // 两条永远凑不齐，`deduced` 永远为假，"自己推出来"那一支从没上过场。
  // 机制悄悄失效不会让任何测试变红，只能靠这种断言盯住。
  assert.equal(state.flags.deduced, true, "第六章的情报推理必须走得通");
  // 谜题动词层的旗标：链走完了这些必须是真的。链的某一步悄悄断掉
  // （物品拿不到、投掷永远不中、正字划不上）不会让通关测试变红——
  // 自动驾驶会卡超时，但那个报错读不出是哪个动词坏了，这里点名盯住。
  // ——第一章（善意的谎言）——
  assert.equal(state.flags.shedSearched, true, "C1 西头那个牲口棚必须真翻过一遍（翻空是这一段的结果）");
  assert.equal(state.flags.jarDug, true, "C1 那个瓦罐必须在窖里的搁板上摸出来——不在院子的烧土里");
  assert.equal(state.flags.tallied, true, "C1 正字那一道必须亲手划上");
  assert.ok(state.flags.tallyAnswer, "C1 妹妹那一问必须选过答案");
  assert.equal(state.flags.wellRopeFixed, true, "C1 井绳必须缠好");
  assert.equal(state.flags.elmDown, true, "C1 投石必须真的把榆钱震下来");
  assert.equal(state.flags.waterFilled, true, "C1 打水的桶必须真的触过水");
  assert.equal(state.flags.vatFilled, true, "C1 打回来的水必须倒进缸里");
  assert.equal(state.flags.pitDug && state.flags.clothesBuried, true,
    "C1 夜里那个坑必须亲手刨开、那件衣裳必须亲手埋下");
  // ——第二章（地洞里的眼睛）——
  assert.equal(state.flags.lidShut, true, "C2 盖板必须从里头拉严过");
  assert.equal(state.flags.coughChoice, "water", "C2 这一趟点的是「上去舀水」那一支");
  assert.equal(state.flags.digStarted && state.flags.tunnelDug, true,
    "C2 防兵洞必须两轮笔画亲手挖开（underDig 的两面旗都得落）");
  console.log(`  ✓ 八章全通（${((Date.now() - t0) / 1000).toFixed(1)}s 实耗）`);
}

console.log("— 全流程自动通关（第六章走『地面佯动』，第二章走『忍着』）—");
{
  const state = AutoPlay(CreateGame(0), "ground", { choicePicks: { c2_cough: "endure" } });
  assert.equal(state.phase, "gameEnd");
  assert.equal(state.flags.route, "ground");
  assert.equal(state.flags.coughChoice, "endure", "C2 这一趟点的是「让他忍着」那一支");
  assert.equal(state.flags.digStarted && state.flags.tunnelDug, true, "忍着那一支也得挖开防兵洞");
  console.log("  ✓ 八章全通（地面分支 + 忍着分支）");
}

console.log("全部通过 ✓");
