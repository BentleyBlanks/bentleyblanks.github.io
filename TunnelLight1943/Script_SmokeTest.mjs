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
  SoldierSeesPlayer, SmokeCovers, VisionScale, ChapterBeatList, DebugJump, SplitPrompt, StrokePrompt,
  WINCH_HUB_Y, WINCH_CRANK_DX, WINCH_CRANK_R, WINCH_STAND_DX,
  SURFACE_Y, UNDER_Y, SCRIBE_CARD, PLANE_CARD, KNOT_CARD, KnotCinchDir, FOLD_CARD,
  WRAP_CARD, SLING, SlingSolve, FORAGE, ForageMatEdge, ForageScoopDir,
  TEAR_CARD, SEW_CARD, SPLIT_CARD, LIVE_CARD_FIELDS, LiveCardOn,
  EdgeHint, BeatHintIcon, RAID_FORMATION, HouseSpan, IndoorOpen, PushingCart, CAM_CELLAR_PEEK, COVER_PAD,
  UnderSegments, AllRelics, RELICS_ON,
} from "./Script_Core.mjs";
import { CHAPTER_BGM } from "./Data_BgmConfig.mjs";
import { AUDIO_BUS_BASE, AUDIO_DEFAULT_LEVELS } from "./Data_AudioMix.mjs";
import { VaultLiftFor, VAULT_MAX_TOP, VAULT_MIN_TOP, BAND, ACTOR_Z, PlaceZ, RankDz } from "./Data_DepthSpec.mjs";
import { LightPath, MoodAt, DipAt, LIGHT_MOOD, LIGHT_DIP } from "./Data_DayCycle.mjs";
import { LADDER, LadderHolds } from "./Data_Ladder.mjs";
import { PlanClimb } from "./Script_Climb.mjs";

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
        + ` step=${state.beat?.stepIndex} player=(${state.player.x.toFixed(1)},${state.player.level})`
        + ` item=${state.player.item?.id || "-"} prompt=${JSON.stringify(state.prompt || null)}`
        + ` ground=${JSON.stringify(state.groundItems.map((g) => [g.id, g.x.toFixed(1), g.level || "surface"]))}`
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

      if (p.climb) {
        // 梯子上是自己爬的（2026-08-17：可停可掉头）——按住往目的层那头推，松手就停在
        // 半路。level 一按下就翻成目的层，所以"往目的层推"＝往 level 那头推
        input.climb = p.level === "under" ? 1 : -1;
      } else if (p.level !== targetLevel) {
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
        // 按 E 的门槛跟 reach 走（同 holdAt 那条注释的教训）：判定区半宽比 1.35
        // 还窄时（如攥土 w=2.6），在区外按 E 不但没反应，手里拎着的东西还会被
        // 自由放下吃掉——桶就是这么丢在地头上的（2026-08-13 自动通关抓的）
        const pressNear = target.reach ? near : 1.35;
        if (target.action === "interactAt" && Math.abs(dx) <= pressNear) input.interact = true;
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
          // 四动词（2026-08-16）：摇辘轳也收进 E ＋ 方向了，光按方向不走绳
          input.interactHeld = true;
          input.moveX = 0;
        }
        // 刨料：驱动器只按键盘（CLAUDE.md 铁律），按住 E 就行——方向由节拍自己判。
        // 走位也由节拍接管（爹让开后柱子自动上前），驱动器不用管站位
        // 受伤版刨木（c1_repair）：手抖那口气没喘完就得松手，驱动器照着 rest 松
        if (target.action === "planeAt") input.interactHeld = !state.planing?.rest;
        // 按 E 的距离与上面「走到多近」用同一个数：两个门槛不一致，中间那条缝里
        // 驱动器既不再往前走、也还没开始按，就是死等（这次倒土栽的正是这条缝）
        const holdNear = target.reach ? near : 1.35;
        if (target.action === "holdAt" && Math.abs(dx) <= holdNear) {
          // target.wait＝打盹门关着（匀稠的）：她在看，动手就被撞见——
          // 驱动器跟真人一样把手停住，等门再开
          const on = !(target.pauseOnQuake && state.beat.quakeActive) && !target.wait;
          if (on) input.interactHeld = true;
          input.moveX = 0;
          // 四动词（2026-08-16）：做功那一档光按住 E 不涨了，得**往做功的方向推**。
          // 驱动器与真人同一套输入；方向由 GetBeatTarget 报的 stroke 给（steady／
          // sustain／circle 报 null，那几档照旧只按 E）。走位不用管——按住 E 的
          // 那一帧 Core 会把方向键从走路上摘下来（workLock）
          if (on && target.stroke) {
            if (target.stroke === "up") input.climb = -1;
            else if (target.stroke === "down") input.climb = 1;
            else if (target.stroke === "left") input.moveX = -1;
            else if (target.stroke === "right") input.moveX = 1;
          }
        }
        // 接绳：没有长按后备了，驱动器得**真的在那张活卡上拖绳头**——攥住、
        // 塞进圈眼、从西边拽出来、再倒手拽三把勒死（见 KnotDrive）。
        // 这也是这条路径唯一的自动化验证：删后备就必须给驱动器一条真输入的路
        if (target.action === "knotAt" && Math.abs(dx) <= 1.35 && target.card) {
          input.moveX = 0;
          KnotDrive(state, input, target, tick);
        }
        // 叠衣裳同理：也没有长按后备，驱动器得真的把那个角一下一下拖过去。
        // **门槛用 near 不用 1.35**：卡只在判定区里立得起来（这一步的区半宽只有
        // 1.0），拿 1.35 当门槛人就停在区外拖一张不存在的卡，报出来是章节超时
        if (target.action === "foldAt" && Math.abs(dx) <= near && target.card) {
          input.moveX = 0;
          FoldDrive(state, input, target, tick);
        }
        // 找吃的三处、抠泥封、掰红薯干、撕布、划线（2026-08-17 四动词第二轮）：
        // 全部走上面那条 holdAt＋stroke / interactAt 的通用路，驱动器不再各配
        // 一条拖拽路——真人也没有那条路了。
        // 缝三针**保留原样**（用户同日：「缝针的这个交互保留」）：驱动器还是抓着卡上
        // 那根针，照 GetBeatTarget 交出来的 seq 一段一段拖
        if (target.action === "sewAt" && Math.abs(dx) <= near && target.card) {
          input.moveX = 0;
          CardSeqDrive(state, input, target, tick, state.sewCard);
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
  // 一章按第七稿（2026-08-13，「蓝底白花」）、二章按「剧本新生」；三章起仍是旧线
  for (const expected of ["蓝底白花", "地洞里的眼睛", "半袋烟的工夫", "最后一盏灯", "东口的铃", "没套的骡车", "地道里的光", "第二道刻痕"]) {
    assert.ok(titles.includes(expected), `缺少章节：${expected}`);
  }
  console.log("  ✓ 章节元数据对齐剧本新生（一二章）与旧档（三章起）");
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

// 爬梯的手脚是**钉在真横档上**的（2026-08-17 用户退回「爬楼梯怎么和楼梯一点关联
// 没有 就像是个平移一样」）。这条盯四件事，三种体型、上下两个方向都过一遍：
// ① 落稳的脚一定踩在落点表里的某一道横档/地面上，落稳的手一定扒在某一道横档上；
// ② 逐帧连续——手脚胯没有一帧跳一档（跳一档就是"瞬移"）；
// ③ 胯离最低那只脚不超过腿长（腿不许拉断）、手离肩不超过臂长（胳膊不许拉断）；
// ④ 真的一档一档换过：整趟下来每只脚/手换过的落点数与横档数一个量级。
function TestClimbPlanLocksToRungs() {
  const holds = LadderHolds(SURFACE_Y, UNDER_Y, "cellarHatch");
  assert.ok(holds.rungs.length >= 10, "3.6 米的井该有十来道横档");
  for (let i = 1; i < holds.rungs.length; i += 1) {
    const gap = holds.rungs[i - 1] - holds.rungs[i];
    assert.ok(Math.abs(gap - LADDER.pitch) <= LADDER.jitter * 2 + 1e-9, `横档间距 ${gap.toFixed(3)} 偏离 pitch`);
  }
  const ANKLE_UP = 0.085;
  const near = (list, y, tol) => list.some((v) => Math.abs(v - y) < tol);
  for (const bs of [0.60, 0.80, 0.93]) {
    for (const dir of [-1, 1]) {
      for (const oneHand of (bs >= 0.75 ? [false, true] : [false])) {   // 抱着孩子爬的只有柱子
        const span = SURFACE_Y - UNDER_Y;
        let prev = null;
        const holdsSeen = { fF: new Set(), fB: new Set(), hB: new Set() };
        const N = 600;
        for (let i = 0; i <= N; i += 1) {
          const k = i / N;
          const e = k * k * (3 - 2 * k);
          const base = dir < 0 ? SURFACE_Y - span * e : UNDER_Y + span * e;
          const p = PlanClimb({ holds, base, dir, bs, oneHand });
          const tag = `bs=${bs} dir=${dir} oneHand=${oneHand} k=${k.toFixed(2)}`;
          for (const [name, f] of Object.entries(p.feet)) {
            if (f.air < 0.02) {
              assert.ok(near(holds.feet, f.y - ANKLE_UP * bs, 1e-3), `${tag}：脚 ${name} 落稳了却不在任何一道横档上（y=${f.y.toFixed(3)}）`);
              holdsSeen["f" + name].add(f.hold);
            }
            const leg = Math.hypot(f.x - p.hip.x, f.y - ANKLE_UP * bs - p.hip.y);
            // 小身量并档步里后脚在上一档时膝盖要顶到胯，规划宁可让下面那条腿差几厘米（见 KNEE_ROOM）
            assert.ok(leg <= 0.62 * bs + (bs < 0.75 ? 0.07 : 0.02), `${tag}：胯到脚 ${name} ${leg.toFixed(3)} 超过腿长`);
            // **抬着的脚不许顶到胯**（2026-08-18 用户："像青蛙一样 / 反关节的脚"）：脚一到胯的高度，
            // 大腿就翻过水平线、膝盖翻到背后去
            assert.ok(f.y - ANKLE_UP * bs <= p.hip.y - 0.10 * bs, `${tag}：脚 ${name} 抬到胯上头去了（脚 ${(f.y - ANKLE_UP * bs).toFixed(2)} 胯 ${p.hip.y.toFixed(2)}）`);
          }
          const shoulderY = p.hip.y + 0.447 * bs;
          for (const [name, h] of Object.entries(p.hands)) {
            if (h.air < 0.02) {
              assert.ok(near(holds.hands, h.y, 1e-3), `${tag}：手 ${name} 扒稳了却不在任何一道横档上（y=${h.y.toFixed(3)}）`);
              if (name === "B") holdsSeen.hB.add(h.hold);
            }
            // 手的相位钉在脚上，高度只能按整档挑（见 PlanClimb 里 corr 那段），
            // 够到最高那一档时胳膊绷直还差三四厘米——反解伸直了去够，手离横档几厘米，
            // 屏幕上一两个像素；再宽就是真的够不着了
            const slack = 0.05;
            const arm = Math.hypot(h.x - p.hip.x, h.y - shoulderY);
            assert.ok(arm <= 0.49 * bs + slack, `${tag}：肩到手 ${name} ${arm.toFixed(3)} 超过臂长`);
          }
          const now = { hip: p.hip.y, fF: p.feet.F.y, fB: p.feet.B.y, hB: p.hands.B.y, hF: p.hands.F?.y ?? 0 };
          if (prev) {
            for (const key of Object.keys(now)) {
              assert.ok(Math.abs(now[key] - prev[key]) < 0.09, `${tag}：${key} 一帧跳了 ${(now[key] - prev[key]).toFixed(3)}m`);
            }
          }
          prev = now;
        }
        const nF = holds.feet.length;
        assert.ok(holdsSeen.fF.size >= nF / 2 - 1 && holdsSeen.fB.size >= nF / 2 - 1,
          `bs=${bs} dir=${dir}：整趟只换了 ${holdsSeen.fF.size}/${holdsSeen.fB.size} 次脚——不是一档一档爬的`);
        assert.ok(holdsSeen.hB.size >= holds.hands.length / 2 - 2,
          `bs=${bs} dir=${dir} oneHand=${oneHand}：手只换了 ${holdsSeen.hB.size} 次`);
      }
    }
  }
  console.log("  ✓ 爬梯规划：手脚钉在真横档上 / 逐帧连续 / 腿臂不拉断 / 一档一档换");
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
  // S 下地窖：**按住**——梯子上是自己爬的（2026-08-17 可停可掉头），松手就停在半路
  const HOLD_S = { moveX: 0, climb: 1, crouch: false, interact: false, interactHeld: false, advance: false };
  const HOLD_W = { moveX: 0, climb: -1, crouch: false, interact: false, interactHeld: false, advance: false };
  StepGame(state, HOLD_S, DT);
  assert.equal(state.player.level, "under", "在地窖口按 S 应下到地下");
  let guard = 0;
  // 下井 0.45 + 3.6/1.35 + 0.5 秒——上限留够
  while (state.player.climb && (guard += 1) < 300) StepGame(state, HOLD_S, DT);
  assert.ok(!state.player.climb, "按住 S 三百帧之内必须爬到底、盖上板");
  assert.equal(state.player.level, "under");
  // W 上来
  StepGame(state, HOLD_W, DT);
  assert.equal(state.player.level, "surface", "在梯口按 W 应回到地表");
  guard = 0;
  while (state.player.climb && (guard += 1) < 400) StepGame(state, HOLD_W, DT);
  assert.ok(!state.player.climb, "按住 W 四百帧之内必须爬到顶、盖上板");

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
    const holdS = { ...idle2, climb: 1 }, holdW = { ...idle2, climb: -1 };
    StepGame(s2, holdS, DT);
    assert.equal(s2.player.level, "under", "层数当帧就翻");
    const RenderY = () => (s2.player.level === "under" ? UNDER_Y : SURFACE_Y) + (s2.player.lift || 0);
    assert.ok(Math.abs(RenderY() - SURFACE_Y) < 0.35,
      `刚下梯子那一下人还得在井口（现在渲染在 ${RenderY().toFixed(2)}，井口 ${SURFACE_Y}）`);
    assert.ok(s2.player.climb, "按下 S 之后人在梯子上");
    const ys = [RenderY()];
    let g2 = 0;
    while (s2.player.climb && (g2 += 1) < 400) {
      StepGame(s2, holdS, DT);
      ys.push(RenderY());
    }
    // 一路只降不升，且真的走完了整口井
    for (let i = 1; i < ys.length; i += 1) {
      assert.ok(ys[i] <= ys[i - 1] + 1e-6, `下梯子的高度不许回弹（第 ${i} 帧 ${ys[i]} > ${ys[i - 1]}）`);
    }
    assert.ok(ys.filter((y, i) => i > 0 && y < ys[i - 1] - 1e-6).length > 20,
      "中间得有几十帧真的在往下挪，不是跳一下就到底");
    assert.ok(ys.length > 60, `3.6 米的井按住 S 至少两秒（现在 ${ys.length} 帧）——那才是一档一档爬的速度`);
    assert.ok(Math.abs(RenderY() - UNDER_Y) < 1e-6, "落地之后渲染高度要正好归到地道地平线");
    assert.equal(s2.player.lift, 0, "落地要把抬升清干净，不然后面的姿势全跟着飘");

    // **半路停下、掉头**（2026-08-17 用户："可以支持在半路停下的，就像勇敢的心那样"）：
    // 从井底按住 W 爬一秒，松手——人停在梯子上不动；再按 S 掉头往下、又按 W 接着上到顶
    StepGame(s2, holdW, DT);
    assert.equal(s2.player.level, "surface", "井底按 W 层数当帧翻回地表");
    for (let i = 0; i < 30; i += 1) StepGame(s2, holdW, DT);
    const midY = RenderY();
    assert.ok(midY > UNDER_Y + 0.3 && midY < SURFACE_Y - 0.3, `爬了一秒该在井中间（现在 ${midY.toFixed(2)}）`);
    for (let i = 0; i < 30; i += 1) StepGame(s2, idle2, DT);
    assert.ok(Math.abs(RenderY() - midY) < 0.05, `松手就得停在那一档上（停前 ${midY.toFixed(2)} 停后 ${RenderY().toFixed(2)}）`);
    assert.ok(s2.player.climb, "停着的时候人还在梯子上");
    for (let i = 0; i < 12; i += 1) StepGame(s2, holdS, DT);
    assert.ok(RenderY() < midY - 0.15, "按 S 能掉头往下");
    let g3 = 0;
    while (s2.player.climb && (g3 += 1) < 500) StepGame(s2, holdW, DT);
    assert.ok(!s2.player.climb && s2.player.level === "surface" && Math.abs(RenderY() - SURFACE_Y) < 1e-6,
      "接着按 W 得能爬到顶、出梯子");
    // 掉头爬回原来那头出去：层数要翻回来
    StepGame(s2, holdS, DT);
    assert.equal(s2.player.level, "under");
    for (let i = 0; i < 40; i += 1) StepGame(s2, holdS, DT);
    let g4 = 0;
    while (s2.player.climb && (g4 += 1) < 300) StepGame(s2, holdW, DT);
    assert.equal(s2.player.level, "surface", "下了一半又爬回井口出去，层数得翻回地表");
    assert.equal(s2.player.lift, 0);
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
        if (state.player.climb) {
          input.climb = state.player.level === "under" ? 1 : -1;     // 梯子上按住往目的层推
        } else if (state.player.level !== targetLevel) {
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
  // 拎桶那一步八稿挪进了去井台那一拍（c1_walk：「俺去打水。你跟紧。」）
  const field = ChapterBeatList(0).find((b) => b.id === "c1_walk");
  DebugJump(state, 0, field.index);
  const step = (input = {}, n = 1) => {
    for (let i = 0; i < n; i += 1) {
      StepGame(state, {
        moveX: 0, climb: 0, crouch: false, interact: false, interactHeld: false,
        throw: false, advance: false, ...input,
      }, DT);
    }
  };
  step({}, 1);
  // 链第一步：从缸边把空桶拎起来（桶不再由上一拍塞进手里）
  state.player.x = 43.0; state.player.level = "surface";
  step({}, 6); step({ interact: true }); step({}, 2);
  assert.equal(state.player.item?.id, "bucket", "缸边的空桶必须拎得起来");
  // ★ 半路（院墙外）随手把桶撂下
  state.player.x = 45.6;
  step({}, 20); step({ interact: true });
  assert.equal(state.player.item, null, "半路应该放得下");
  assert.equal(state.groundItems.length, 1, "桶该躺在半路上");
  // 走回去真的能捡起来，链接着走
  {
    const g = state.groundItems.find((it) => it.id === "bucket");
    state.player.x = g.x; step({}, 3); step({ interact: true });
    assert.equal(state.player.item?.id, "bucket", "撂在哪儿就该能从哪儿捡回来");
  }
  // ——缺件提示与气泡：在井台那拍验（「搁桶查井绳」needs=bucket）——
  const state2 = CreateGame(0);
  const wellBeat = ChapterBeatList(0).find((b) => b.id === "c1_well");
  DebugJump(state2, 0, wellBeat.index);
  const step2 = (input = {}, n = 1) => {
    for (let i = 0; i < n; i += 1) {
      StepGame(state2, {
        moveX: 0, climb: 0, crouch: false, interact: false, interactHeld: false,
        throw: false, advance: false, ...input,
      }, DT);
    }
  };
  step2({}, 2);
  // 结算把上一拍（去井台）的微过场留在场上了——先快进掉，它挡着自由放下
  for (let i = 0; i < 600 && state2.microCine; i += 1) step2({ advance: true });
  // 「搁桶查井绳」是第一步。结算会把手清空（SettleBeat 链尾的规矩），
  // 桶手动塞回来再撂在半路。
  // pickedT 给个负数：CanFreeDrop 的拾取保护窗（0.35s）别把这只手动塞的桶拦下。
  // 撂桶点选 96：躲开收藏品的拾取圈（140.6 有一枚石雷拉火管，会抢 E）
  const sis = state2.actors.find((a) => a.id === "sister");
  if (sis) { sis.following = false; sis.cineTarget = null; sis.x = 57.2; }
  state2.player.item = { id: "bucket", label: "挂着布兜的空桶", big: true, pickedT: -1 };
  state2.player.x = 96.0; state2.player.level = "surface";
  step2({}, 30); step2({ interact: true }); step2({}, 2);
  assert.equal(state2.player.item, null, "半路应该放得下");
  const dropped = state2.groundItems.find((it) => it.id === "bucket");
  assert.ok(dropped, "桶该躺在半路上");
  // 空着手站到井台：提示得说清缺什么、撂下的桶得有气泡标着
  state2.player.x = SCENES.village.zones.well.x; step2({}, 6);
  assert.ok(state2.prompt && /缺/.test(state2.prompt),
    `空着手站到井台必须说缺什么，实为 ${JSON.stringify(state2.prompt)}`);
  const marked = state2.bubbles.some((b) => b.icon && b.icon.startsWith("item:") && b.icon.includes("桶"));
  assert.ok(marked, "撂在半路的桶必须挂气泡标出来");
  console.log("  ✓ 链不怕半路撂东西：缺桶有提示、撂下的桶有气泡标着、捡得回来");
}

function TestGroundItems() {
  const state = CreateGame(0);
  // 拎桶那一步八稿挪进了去井台那一拍（c1_walk）
  const well = ChapterBeatList(0).find((b) => b.id === "c1_walk");
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
  // 打结那一路：按顺序奔下一道关口；挽完了就顺着 pull 一把拽到底
  const aim = kc.phase === "cinch"
    ? { x: kc.tip.x + target.pull.x, y: kc.tip.y + target.pull.y }
    : target.gates[Math.min(kc.gate, target.gates.length - 1)];
  const vx = aim.x - kc.tip.x, vy = aim.y - kc.tip.y;
  const d = Math.hypot(vx, vy) || 1;
  // 手只许比绳头领先这么一点：领先过头就是"甩脱了"，那条规矩这里不许绕开
  const step = Math.min(d, target.reachStep);
  Put(kc.tip.x + (vx / d) * step, kc.tip.y + (vy / d) * step);
}

// 揭草苫 · 叠衣裳（第一章夜里下窖）：同接绳，**没有长按后备**——乐趣就在手上
// 的活不给按键档（CLAUDE.md 拟物交互第 5 条）。所以驱动器只能真的在卡上把那个
// 角拈起来拖过去，一下一下做完四下手。删了后备就必须给驱动器这条路，漏了这
// 一步自动通关会当场卡死（接绳、投石都是这么栽过的）。
//
// tick 同 KnotDrive：没攥住的时候**先松一帧再按下去**，不然 state.ptrPressed
// 永远是假的（攥住只认按下那一帧），驱动器一直空转。
function FoldDrive(state, input, target, tick) {
  const A = target.aspect || 16 / 9;
  const Put = (x, y) => { input.pointerHeld = true; input.pointerCard = { u: x, v: y * A }; };
  const fc = state.foldCard;
  const seq = target.seq || [];
  // seq 空＝四下手做完了，卡正停在那两秒半的印子上：这时候手要撒开
  if (!fc || !seq.length) return;
  if (!fc.grab) {
    if (tick % 2 === 0) { input.pointerHeld = false; input.pointerCard = null; return; }
    Put(fc.tip.x, fc.tip.y);       // 按在那个角上才拈得起来
    return;
  }
  // 攥住了：朝这一下的落点挪，一帧只许领先布角这么一点（领先过头就是甩脱了）
  const leg = seq[0];
  const vx = leg.to.x - fc.tip.x, vy = leg.to.y - fc.tip.y;
  const d = Math.hypot(vx, vy) || 1;
  const step = Math.min(d, target.reachStep);
  Put(fc.tip.x + (vx / d) * step, fc.tip.y + (vy / d) * step);
}

// 撕布 / 缝三针（八稿）：通用的「抓着卡上那个点、照 seq[0] 拖」驱动——
// 卡的 view 里必须有 grab 和一个可抓的当前点（seq[0].from 就是它）。
// 没攥住时同 KnotDrive 的节拍：先松一帧再按下去（攥住只认按下那一帧）
function CardSeqDrive(state, input, target, tick, card) {
  const A = target.aspect || 16 / 9;
  const Put = (x, y) => { input.pointerHeld = true; input.pointerCard = { u: x, v: y * A }; };
  const seq = target.seq || [];
  if (!seq.length) return;
  const leg = seq[0];
  if (!card || !card.grab) {
    if (tick % 2 === 0) { input.pointerHeld = false; input.pointerCard = null; return; }
    Put(leg.from.x, leg.from.y);
    return;
  }
  const vx = leg.to.x - leg.from.x, vy = leg.to.y - leg.from.y;
  const d = Math.hypot(vx, vy) || 1;
  const step = Math.min(d, target.reachStep);
  Put(leg.from.x + (vx / d) * step, leg.from.y + (vy / d) * step);
}

/** 把整条接绳做完（链式测试与自动通关驱动共用同一条路），返回勒了几把 */
function DragKnotThrough(state, drive) {
  const t = GetBeatTarget(state);
  assert.equal(t?.action, "knotAt", "接绳那一步的驱动目标应该是拖绳头，不是长按");
  assert.ok(t.card && t.gates?.length && t.pull, "驱动目标得把卡上的落点（五道关口/勒紧方向）交出来");
  for (let i = 0; i < 900 && state.knotCard; i += 1) {
    const input = {};
    KnotDrive(state, input, t, i);
    drive(input);
  }
  return state.beat.knotState?.cinch ?? 0;
}

// 接绳打的是**单编结**，不是"把绳头塞进一个圈里再拽"。
// 用户 2026-08-10 退回过第三版：「井里绳子打结的打结玩法一点都不符合直觉
// 哪有打结是这样的」——说得对：穿一下再拽，一拉就出来了，什么也没打上。
// 现在五道关口按顺序过（塞进弯口 → 从两股中间钻出来 → 绕到背后 → 从底下
// 兜回来 → 从自己那股底下掖出去），再一把勒到底。这几条守着它别退化。
function TestKnotIsASheetBend() {
  const Setup = () => {
    const state = CreateGame(0);
    const well = ChapterBeatList(0).find((b) => b.id === "c1_well");
    DebugJump(state, 0, well.index);
    // 直接把链推进到接绳那一步：桶已搁下、磨损处已折回（备用绳就在桶底）。
    // 2026-08-12 打榆钱拆去了 c1_elm，井台这条链从查井绳起——接绳是第 2 步
    state.beat.stepIndex = 2;
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
  // 攥住绳头，再一小步一小步把它拖到 (x,y)——手不许比绳头领先太多（会脱手）
  const dragTo = (state, q, maxFrames = 90) => {
    for (let i = 0; i < maxFrames; i += 1) {
      const tip = state.knotCard?.tip;
      if (!tip) return;
      const vx = q.x - tip.x, vy = q.y - tip.y;
      const d = Math.hypot(vx, vy);
      if (d < 0.02) return;
      const s2 = Math.min(d, L.grabR);
      step(state, { pointerHeld: true, pointerCard: card(tip.x + (vx / d) * s2, tip.y + (vy / d) * s2) });
    }
  };
  const grabTip = (state) => {
    step(state, {});
    step(state, { pointerHeld: true, pointerCard: card(state.knotCard.tip.x, state.knotCard.tip.y) }, 2);
  };

  // ① 长按互动键：一点用都没有
  {
    const state = Setup();
    step(state, {}, 2);
    step(state, { interactHeld: true }, Math.ceil(6.0 / DT));
    assert.equal(state.beat.knotState?.gate ?? 0, 0, "长按 E 居然把结挽上了——这条后备必须是死的");
    assert.equal(state.beat.knotState?.cinch ?? 0, 0, "长按 E 不该把结勒紧");
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

  // ③ **跳着走不算数**。这一条是这次重做的题眼：绕过"背后"和"底下"两道，
  //    直接从弯口奔最后那道掖，那打出来的根本不是结——绳头虚搭在弯里，一拽就出来
  {
    const state = Setup();
    step(state, {}, 2);
    grabTip(state);
    assert.ok(state.knotCard.grab, "按在绳头上要攥得住");
    dragTo(state, L.gates[0]);                 // 第一道：塞进弯口
    assert.equal(state.beat.knotState.gate, 1, "塞进弯口该过第一道");
    dragTo(state, L.gates[4]);                 // 直奔最后一道
    assert.equal(state.beat.knotState.gate, 1,
      "跳过「绕背后」「兜底下」直接去掖——不该算数，那不是单编结");
    assert.ok(state.knotCard.wrong || state.beat.knotState.wrongT >= 0,
      "凑到还没轮到的那道关口上，卡上得有一下回话");
    assert.equal(state.beat.knotState.cinch, 0, "结都没挽上，勒紧无从谈起");
  }

  // ④ 五道关口按顺序走完，再一把勒到底：井绳接好
  {
    const state = Setup();
    step(state, {}, 2);
    grabTip(state);
    for (const g of L.gates) dragTo(state, g);
    assert.equal(state.beat.knotState.gate, L.gates.length, "顺着走完五道关口，结就挽上了");
    assert.equal(state.knotCard.phase, "cinch", "挽上了就该进勒紧那一下");
    // 勒紧是**一把拽到底**（不是倒手三次）：顺着 cinch 方向一路拖
    const u = KnotCinchDir();
    for (let i = 0; i < 200 && state.knotCard; i += 1) {
      const tip = state.knotCard.tip;
      step(state, { pointerHeld: true, pointerCard: card(tip.x + u.x * L.grabR, tip.y + u.y * L.grabR) });
    }
    assert.equal(state.flags.wellRopeFixed, true, "勒死了＝井绳必须接好");
    assert.equal(state.player.item, null, "接绳全程两手都在绳上，物品栏得是空的");
  }

  // ⑤ 勒到一半撒手：半截的结自己会松（进度往回泄）
  {
    const state = Setup();
    step(state, {}, 2);
    grabTip(state);
    for (const g of L.gates) dragTo(state, g);
    const u = KnotCinchDir();
    for (let i = 0; i < 24; i += 1) {
      const tip = state.knotCard.tip;
      step(state, { pointerHeld: true, pointerCard: card(tip.x + u.x * L.grabR, tip.y + u.y * L.grabR) });
    }
    const half = state.beat.knotState.cinch;
    assert.ok(half > 0.05 && half < 1, `这会儿该勒到一半（实际 ${half}）`);
    step(state, {}, Math.ceil(1.2 / DT));
    assert.ok(state.beat.knotState.cinch < half - 0.02,
      "撒手之后半截的结必须自己松回去一点");
  }

  // ⑥ 手甩得比绳快：脱手
  {
    const state = Setup();
    step(state, {}, 2);
    grabTip(state);
    assert.ok(state.knotCard.grab, "这会儿手上还攥着绳头");
    const tip = state.knotCard.tip;
    step(state, { pointerHeld: true, pointerCard: card(tip.x - L.slipR - 0.12, tip.y + 0.10) }, 2);
    assert.ok(!state.knotCard.grab, "手甩出绳头够得着的范围必须脱手");
  }

  // ⑦ 不留 HUD 手势图标 / 按键提示：招呼玩家的是卡上那根绳头自己
  {
    const state = Setup();
    step(state, {}, 3);
    assert.ok(!state.gesture, "接绳那一拍不该再挂 HUD 手势图标");
    assert.ok(!state.prompt, `接绳那一拍不该出提示文案，实为「${state.prompt}」`);
    assert.ok(state.knotCard, "站定就该亮出那张接绳卡");
    assert.ok(!state.closeUp, "有活卡就不该再推世界里的特写（两个镜头打架）");
    assert.equal(EdgeHint(state, state.player.x, 12), null, "活卡上不该再挂画框边缘的路标");
  }

  // ⑧ 自动通关那条路（驱动器照着五道关口真拖）也得走得通
  {
    const state = Setup();
    step(state, {}, 2);
    const cinch = DragKnotThrough(state, (inp) => step(state, inp));
    assert.ok(cinch >= 1 || state.flags.wellRopeFixed, `驱动器得把结挽上并勒死（cinch=${cinch}）`);
  }
  console.log("  ✓ 接绳＝单编结：五道关口按顺序过 / 跳着走不算 / 一把勒到底 / 撒手会松 / 长按无效");
}

// 叠衣裳那张活卡（FOLD_CARD/DrawFoldCard/foldCloth）第七稿起不再被第一章使用
//（夜·菜窖改成摸黑归置+整布，埋血衣整场删除）。机制与画笔保留待后续章节，
// 原 TestFoldIsHandsOnCloth 随玩法一起退役（2026-08-13）。

function TestGrabbablesAreBigEnoughToRead() {
  const VIEW_W = 8.7;           // 玩法景别画宽（Main 的 PLAY_HW.surfaceNight 4.35 ×2）
  const PX = 1600 / VIEW_W;     // 184 px/米
  const MIN_PX = 128;
  const items = [
    ["苫草（整片）", FORAGE.mat.half * 2],
    ["苫草（架起来的高度）", (FORAGE.mat.pivotY + Math.abs(Math.sin(FORAGE.mat.restA)) * FORAGE.mat.half) * 2.4],
    ["门板", FORAGE.plank.len],
    ["烧土堆", FORAGE.ash.half * 2],
  ];
  for (const [name, m] of items) {
    const px = m * PX;
    assert.ok(px >= MIN_PX,
      `「${name}」在玩法景别里只有 ${px.toFixed(0)}px（${m.toFixed(2)}m）——`
      + `低于 ${MIN_PX}px 玩家认不出这是能上手的东西，推镜头也治不好（CLAUDE.md 拟物交互第 4 条）`);
  }
  // 攥得住的判定圈也要够手指点：手机上 130px/米，0.44m ≈ 57px 直径，刚过拇指下限
  for (const [name, r] of [["苫草外沿", FORAGE.mat.grabR], ["门板头", FORAGE.plank.grabR], ["土堆", FORAGE.ash.grabR]]) {
    assert.ok(r * PX * 2 >= 44, `「${name}」的攥取判定圈只有 ${(r * PX * 2).toFixed(0)}px，手指点不着`);
  }
  console.log(`  ✓ 能上手的大件都认得出（最小 ${Math.min(...items.map(([, m]) => m * PX)).toFixed(0)}px ≥ ${MIN_PX}px）`);
}

// 找吃的三处 ＋ 抠泥封（2026-08-17 四动词第二轮）：全部只认「按住 E ＋ 方向」——
// 光按住 E 不涨、方向反了不涨、松手该塌的塌（苇席坠回、碗片压回）、该留的留
// （抠掉的泥、扒下去的土）。分量在时间里：硬土那一把比浮灰慢一倍多，第三把
// 拽到半道钉住、动词当场换成"顺着坛肩抹"。指针那条老路（pointerWorld /
// pointerCard）这几件东西一概不读了。
function TestForageIsFourVerbs() {
  const beat = SCRIPTS.c1.find((b) => b.id === "c1_forage");
  const SEARCH = beat.steps.find((s) => s.type === "searchAny");
  const SEARCH_I = beat.steps.indexOf(SEARCH);
  const Spot = (key) => SEARCH.spots.find((s) => s.key === key);
  // 三处任翻：没有全局的 stepIndex 可推，改成「把状态推到某一处的第几小步」
  const Setup = (key, sub = 0) => {
    const state = CreateGame(0);
    const idx = ChapterBeatList(0).find((b) => b.id === "c1_forage").index;
    DebugJump(state, 0, idx);
    state.beat.stepIndex = SEARCH_I;
    state.beat.search = { sub: { [key]: sub }, done: {}, idle: 0 };
    state.player.level = "surface";
    state.player.x = Spot(key).steps[sub].zone.x + 0.55;   // 判定区半宽 1.1，别站到区外
    return state;
  };
  const Sub = (state, key) => state.beat.search.sub[key] || 0;
  const Done = (state, key) => !!state.beat.search.done[key];
  const step = (state, input = {}, n = 1) => {
    for (let i = 0; i < n; i += 1) {
      StepGame(state, {
        moveX: 0, climb: 0, crouch: false, interact: false, interactHeld: false,
        advance: false, ...input,
      }, DT);
    }
  };
  const E_UP = { interactHeld: true, climb: -1 };
  const E_DOWN = { interactHeld: true, climb: 1 };
  const E_RIGHT = { interactHeld: true, moveX: 1 };
  const E_ONLY = { interactHeld: true, interact: true };
  const frames = (s) => Math.ceil(s / DT);
  // ① 这一场只有一件事：**在棚里翻东西吃**，三处各摆各的、顺序随玩家
  //（2026-08-15 用户退回推焦木：「太奇怪了 解密也不算 也很不直观 我都不知道
  // 要操作这里 只有一个 hint」——现在没有"剧本指定的那一下"了）
  {
    const verbs = beat.steps.map((s) => s.type).filter((t) => t !== "goto" && t !== "pickup");
    assert.deepEqual(verbs.filter((t, i) => !(t === "use" && i === verbs.length - 1)), ["searchAny"],
      "找吃的整场就是一步「翻三处」，别再排成一条直线");
    assert.deepEqual(SEARCH.spots.map((s) => s.key).sort(), ["ash", "reed", "trough"],
      "三处：翻倒的食槽 / 压着苇席的谷种 / 墙根发白的烧土");
    for (const sp of SEARCH.spots) {
      assert.ok(sp.note, `「${sp.key}」翻完要说一句翻着了什么——那是玩家"自己找到"的落点`);
      assert.ok(typeof sp.x === "number", `「${sp.key}」要有坐标：没进判定区时画框边那张牌照它指路`);
      for (const s of sp.steps) {
        assert.ok(!s.hold || s.stroke || s.steady,
          `「${s.prompt || s.type}」挂着裸 hold＝又变回长按进度环了`);
        assert.ok(s.zone, "每一小步都要有自己的判定区（玩家走开就什么也不发生）");
      }
    }
    assert.ok(SEARCH.idleNote, "站着不动久了要递一句「往哪儿翻」——这一场最容易迷路的就是这一刻");
    assert.ok(beat.forage, "三件东西的摆位要声明在 forage 上，渲染层照它画");
    for (const k of ["trough", "reed", "ash"]) {
      assert.ok(beat.forage[k] !== undefined, `「${k}」的摆位要声明在 forage 上`);
    }
    assert.ok(beat.forage.plank === undefined && beat.forage.mat === undefined,
      "焦木/苫草这一场已经不用了——声明了渲染层就会画一件没人碰的东西");
    const jarUp = beat.steps.find((s) => s.stroke === "up" && /抱起/.test(s.prompt || ""));
    const jarPickup = beat.steps.find((s) => s.type === "pickup" && s.item?.id === "driedYams");
    assert.ok(jarUp || jarPickup?.worldDrawn,
      "埋着的坛子不许预摆地面道具剧透（pickup 要 worldDrawn，或走 E＋↑ 的 use）");
  }

  // ② 光按住 E（不推方向）：三处一处都做不完；指针拖拽那条老路也死了
  for (const key of ["trough", "reed", "ash"]) {
    const state = Setup(key);
    step(state, {}, 2);
    const before = Sub(state, key);
    step(state, E_ONLY, frames(8));
    assert.equal(Sub(state, key), before, `光按住 E 居然把「${key}」做完了——做功要往方向上推`);
    step(state, { pointerHeld: true, pointerWorld: { x: beat.forage[key], y: 0.3 } }, frames(4));
    assert.equal(Sub(state, key), before, `「${key}」不该再认指针拖拽`);
    assert.ok(!state.dragTrack, "做功那一拍画面上不许有可拖的 HUD 轨道");
    // 键帽提示：E ＋ 一个方向（老版没有提示，玩家只看见一张要用手拖的卡/一件东西）
    step(state, {}, 1);
    const pr = SplitPrompt(state.prompt || "");
    assert.equal(pr.act, "interact", `「${key}」站到跟前要给键帽提示（实为 ${JSON.stringify(state.prompt)}）`);
    assert.ok(pr.hold && pr.dir, `「${key}」的提示得是「按住 E ＋ 方向」（实为 ${JSON.stringify(state.prompt)}）`);
  }

  // ③ 苇席：按住 E＋↑ 抬起来（有分量：一秒只抬 lift 那么多）、松手坠回、
  //    一直按住过了重心自己翻过去；按 ↓ 不动
  {
    const state = Setup("reed");
    step(state, {}, 2);
    const f = state.forage.reed;
    const L = FORAGE.reed;
    step(state, E_DOWN, frames(1));
    assert.ok(Math.abs(f.ang - L.restA) < 1e-6, "按住 E＋↓ 席子一动都不该动（方向要对）");
    step(state, E_UP, frames(0.5));
    assert.ok(f.ang > L.restA + 0.3 && f.ang < L.restA + L.lift * 0.5 + 0.05,
      `半秒只该抬 ${(L.lift * 0.5).toFixed(2)}rad（实为 ${(f.ang - L.restA).toFixed(2)}）——席子有分量`);
    assert.equal(SplitPrompt(state.prompt).dir, "up", "掀席子的键帽是 E ＋ ↑");
    const lifted = f.ang;
    step(state, {}, frames(1.2));
    assert.ok(f.ang < lifted - 0.2, "松手席子要自己坠回去");
    step(state, E_UP, frames(4));
    assert.ok(f.done, "一直按住 E＋↑，席子过了重心自己翻过去");
    for (let i = 0; i < 6 && Sub(state, "reed") === 0; i += 1) step(state, {});
    assert.equal(Sub(state, "reed"), 1, "席子翻过去，这一小步才算完");
  }

  // ④ 没进任何一处时，画框边那张牌得指向最近的一处
  //（正对着用户那句「我都不知道要操作这里」）
  {
    const state = Setup("trough");
    state.player.x = 13.0;                       // 棚门口，三处都没进
    step(state, {}, 2);
    const t = GetBeatTarget(state);
    assert.equal(t.action, "walk", "没进任何一处时，先把人往那处带");
    assert.ok(Math.abs(t.x - 11.6) < 0.01, `牌该指最近的那处（食槽 11.6），指的却是 ${t.x}`);
    assert.ok(BeatHintIcon(state), "牌面要有图——空着等于没提示");
  }

  // ⑤ 食槽：按住 E＋↓ 一把一把扫，三把才完（松手这一把作废）
  {
    const state = Setup("trough");
    step(state, {}, 2);
    const f = state.forage.trough;
    const L = FORAGE.trough;
    step(state, E_DOWN, frames(L.strokeS[0] * 0.6));
    assert.equal(f.done, 0, "一把没扫满不算一下");
    step(state, {}, 2);
    assert.equal(f.acc, 0, "扫到半道松手，这一把作废");
    step(state, E_DOWN, frames(L.strokeS[0] * 1.2));
    assert.equal(f.done, 1, "扫满一把算一下");
    step(state, E_DOWN, frames(L.strokeS[0] * 2.4));
    assert.ok(f.done >= L.strokes, `三把要扫完（done=${f.done}）`);
    for (let i = 0; i < 6 && Sub(state, "trough") === 0; i += 1) step(state, {});
    assert.equal(Sub(state, "trough"), 1, "槽底扫完这一小步才算完");
  }

  // ⑥ 灰堆的三层手感（2026-08-15 重做）：浮灰快、硬土慢，第三把拽到半道**手钉住**
  //   （指甲碰上坛肩，一个字不上屏）；钉住之后往怀里拽只有闷响，动词换成
  //   「顺着坛肩抹开」（键帽换成 ↔），横着抹三把，抹哪儿露哪儿
  {
    const state = Setup("ash");
    step(state, {}, 2);
    const L = FORAGE.ash;
    const f = state.forage.ash;
    let n1 = 0;
    while (f.done < 1 && n1 < 400) { n1 += 1; step(state, E_DOWN); }
    let n2 = 0;
    while (f.done < 2 && n2 < 400) { n2 += 1; step(state, E_DOWN); }
    assert.equal(f.done, 2, "头两把是真扒：浮灰一把、硬土一把");
    assert.ok(n2 > n1 * 1.8, `硬土那一把要比浮灰慢一倍多（浮灰 ${n1} 帧、硬土 ${n2} 帧）——分量在阻力里`);
    assert.ok(!f.caught, "还没碰着坛肩");
    assert.equal(SplitPrompt(state.prompt).dir, "down", "扒的键帽是 E ＋ ↓");
    step(state, E_DOWN, frames(L.strokeS[2] * L.catchAt + 0.1));
    assert.ok(f.caught, "第三把拽到半道要碰上坛肩——手钉住");
    assert.equal(f.done, 2, "钉住的那一把不算扒——它永远拉不完");
    assert.ok(!state.toast, "发现由手说：钉住那一下不许弹字（老版的 toast 是退回原因）");
    assert.equal(Sub(state, "ash"), 0, "光钉住这一步不算完");
    assert.equal(SplitPrompt(state.prompt).dir, "horiz", "钉住了动词就换：键帽变成 E ＋ ↔（顺着坛肩抹）");
    // 再犟：还是往怀里拽——只有闷响，坛肩一分不露
    step(state, E_DOWN, frames(1.6));
    assert.equal(f.clear, 0, "往怀里拽把坛肩拽不出来——这个方向已经死了");
    assert.ok(f.tug >= 1, `拽了又拽要记在归因账上（tug=${f.tug}）`);
    // 横着抹三把，一把露一段
    for (let w = 0; w < 3; w += 1) {
      const dir = w % 2 === 0 ? 1 : -1;
      step(state, { interactHeld: true, moveX: dir }, frames(L.wipeS * 1.05));
      assert.equal(f.wipesDone, w + 1, `顺着肩抹一把要露一段（第 ${w + 1} 把）`);
    }
    assert.ok(f.jar && f.clear >= 1, "三把抹完，坛肩整个出来");
    for (let i = 0; i < 8 && Sub(state, "ash") === 0; i += 1) step(state, {});
    assert.equal(Sub(state, "ash"), 1, "坛肩出来了这一小步才算完");
  }

  // ⑦ 抠泥封：按住 E＋↑ 三箍一段一段掉，同一个键继续把碗片揭开；
  //    按 ↓ 不涨；松手泥不长回去、碗片却压回去
  {
    const state = Setup("ash", 1);
    step(state, {}, 3);
    assert.ok(state.wrapCard, "站到罐跟前就该亮出那张活卡");
    assert.ok(!state.closeUp, "有活卡就不该再推世界里的特写");
    const L = WRAP_CARD;
    const pr = SplitPrompt(state.prompt || "");
    assert.equal(pr.dir, "up", `抠泥封的键帽是 E ＋ ↑（实为 ${JSON.stringify(state.prompt)}）`);
    step(state, E_DOWN, frames(1));
    assert.equal(state.wrapCard.laps, 0, "按 E＋↓ 泥一块都不该掉——方向要对");
    step(state, E_UP, frames(L.unwindS / L.laps + 0.05));
    assert.equal(state.wrapCard.laps, 1, "按住 E＋↑ 一段时间，第一箍泥掉了");
    const k1 = state.beat.wrap.k;
    step(state, {}, frames(1));
    assert.ok(Math.abs(state.beat.wrap.k - k1) < 1e-6, "松手泥不长回去（掉了就是掉了）");
    let nUp = 0;
    while (state.wrapCard?.phase === "unwind" && nUp < frames(L.unwindS + 1)) { nUp += 1; step(state, E_UP); }
    assert.equal(state.wrapCard?.phase, "peel", `三箍抠完才轮到揭碗片（laps=${state.beat.wrap.laps}）`);
    assert.ok(nUp * DT > L.unwindS * 0.5, `三箍有三箍的分量（剩下两箍花了 ${(nUp * DT).toFixed(1)}s）`);
    assert.equal(SplitPrompt(state.prompt).dir, "up", "揭碗片还是同一个键：E ＋ ↑");
    step(state, E_UP, frames(L.peelS * 0.5));
    assert.ok(state.wrapCard.open > 0.3 && state.wrapCard.open < 0.7, "碗片揭到一半");
    const half = state.wrapCard.open;
    step(state, {}, frames(0.4));
    assert.ok(state.wrapCard.open < half, "松手碗片自己压回去（有分量）");
    step(state, E_UP, frames(L.peelS + 0.3));
    assert.ok(Done(state, "ash"), "碗片揭开了，烧土这一处就该算翻完");
    assert.equal(state.wrapCard, null, "做完了活卡要收走");
  }
  console.log("  ✓ 找吃的＝翻三处（食槽/苇席/烧土，顺序随玩家） / 只认 E＋方向 / 光按住 E 与指针都不涨"
    + " / 席子有分量会坠回 / 三层手感·钉住不上屏·换 ↔ 抹三把才出坛 / 抠泥三箍＋揭碗片同一个 E＋↑");
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
    // 第九稿：修井绳那三步整段下线，井台只剩一步——辘轳就是第 0 步
    state.beat.stepIndex = 0;
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
    // ── 二道：摇上来（第九稿：墩桶与拽到井沿两道手下线）──
    // 空桶落到水面先横着漂一下、松一下让它扣过去吃水——这一下留在**画面**里
    // 演（桶自己一沉一斜），不再单开一道玩法。井台从四道手压成两道
    assert.equal(w.phase, "raise", "桶碰着水就该自己吃满、进摇上来那一道");
    assert.equal(w.filled, true, "第九稿：碰水即满（墩桶那一道已下线）");
    // 井底那扇小窗：主相机看不到井口以下，桶沉下去那一段全靠第二台相机演
    assert.equal(state.pip?.kind, "wellBottom", "桶沉进井里就该开井底那扇小窗");
    assert.equal(state.pip.t, null, "这扇小窗由玩法自己收，不许几秒后自动关掉");
    assert.ok(state.pip.at && state.pip.at.y < -0.5,
      `小窗得真的架在井筒里（实际 y=${state.pip?.at?.y}）`);
    // 逆时针往上摇
    const d2 = w.depth;
    circle(1, 10);
    assert.ok(w.depth < d2 - 0.02, `满桶逆时针摇，绳得往上收（${d2}→${w.depth}）`);
    assert.equal(state.gesture, undefined, "手势小黑饼已拆，摇起的方向由摇把与引导圈自己演");
    // 再摇上来一截，好让下面那一坠有地方可坠
    circle(1, 40);
    const crankMid = w.crankA;
    // 脱手：过了棘齿宽限辘轳倒转，桶自己往下坠，摇把跟着倒着抡
    const d3 = w.depth;
    step({}, Math.ceil(1.6 / DT));
    assert.ok(w.depth > d3 + 0.15, "脱手过了宽限，辘轳必须倒转（桶坠回去）");
    assert.ok(w.crankA < crankMid, "倒转时摇把必须真的倒着转（crankA 回退）");
    // **按住 E ＋ ↑** 是完整后备（费力气的活，不是指尖功夫）：一路摇到顶。
    // 力气见底也只是慢一档，绝不许把人卡死——自动通关全靠这条
    for (let i = 0; i < 40 && CurrentBeatDef(state)?.steps?.[state.beat.stepIndex]?.type === "winch"; i += 1) {
      step({ interactHeld: true, climb: -1 }, Math.ceil(0.8 / DT));
      step({}, Math.ceil(0.5 / DT));   // 喘一口（撒手会坠一点，但缓过来摇得快）
    }
    assert.equal(state.player.item?.id, "fullBucket", "摇到顶，手里就是一桶水");
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
    step({ interactHeld: true, climb: 1 }, Math.ceil(5.0 / DT));     // 放到底
    assert.ok(w.filled, "按住 E ＋ ↓ 放到底，桶碰着水就该吃满");
    const stamFull = w.stam;
    step({ interactHeld: true, climb: -1 }, Math.ceil(1.2 / DT));
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
    step({ interactHeld: true, climb: 1 }, 4);
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
  state.beat.stepIndex = 0;
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
    step({ interactHeld: true, climb: rest ? 0 : (ph === "lower" ? 1 : -1) });
    frames += 1;
  }
  assert.equal(state.player.item?.id, "fullBucket", "键盘后备必须打得上水");
  const secs = frames * DT;
  // 第九稿把四道手压成两道（放桶 / 摇上来），可"打水这件事要有分量"这条没变：
  // 一井三米六，放下去再摇上来，键盘全速也得七秒起（老版四道手是 13.5s）
  assert.ok(secs >= 7.0, `打水得有分量：键盘全速也该 7 秒起（实际 ${secs.toFixed(1)}s）`);
  for (const ph of ["lower", "raise"]) {
    assert.ok(seen.has(ph), `两道手一道都不能少，缺了 ${ph}`);
  }
  console.log(`  ✓ 打水两道手全走一遍：键盘 ${secs.toFixed(1)}s`);
}

// 石笔：按住 E ＋ → 笔才走，三趟才成一道（2026-08-17 四动词第二轮）。
//
// 这一拍长在一张铺满画框的手绘特写卡上（state.scribeCard）。老版攥的是卡上那支笔
//（pointerCard）外加一条光按住 E＋左右的后备、不给键帽提示——用户点名的「非按 E
// 的复杂交互」之一。现在四条：光按住 E 不走、按 ← 不走、按住 E＋→ 笔有摩擦地往前
// 蹭、一趟到头笔抬起来退回去再蹭，三趟印子一趟比一趟深。
function TestChalkIsThreePasses() {
  // 一头一尾各一次：序章画正字（c1_draw）与第八章给妹妹刻痕（c8_carve）。
  // 机制细则在 c8 上验（selfMark 那版旗标齐全）；c1 那道由整章自动通关兜底
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
  const E_RIGHT = { interactHeld: true, moveX: 1 };

  // ① 光按住 E、按 ←、在卡上拖指针：笔都不走（这正是"不是 slider"的意思）
  {
    const s = mk();
    step(s, {}, 2);
    assert.ok(s.scribeCard, "站定就该亮出那张特写卡");
    step(s, { interactHeld: true }, 40);
    step(s, { interactHeld: true, moveX: -1 }, 40);
    for (let i = 0; i < 40; i += 1) {
      step(s, { pointerHeld: true, pointerCard: { u: 0.06 + i * 0.02, v: L.v } });
    }
    assert.equal(s.beat.drawn, 0, "光按住 E / 按 ← / 拖指针，都不该划出印子");
    assert.ok(!s.dragTrack, "划线这一拍绝不许有拖动轨道（slider）");
    const pr = SplitPrompt(s.prompt || "");
    assert.equal(pr.dir, "right", `划线的键帽是 E ＋ →（实为 ${JSON.stringify(s.prompt)}）`);
  }

  // ② 按住 E＋→：印子跟着出来，且笔有摩擦——一趟按 def.speed 走，一帧绝不到底
  {
    const s = mk();
    step(s, {}, 2);
    step(s, E_RIGHT, 1);
    assert.ok(s.beat.drawn > 0, "按住 E＋→ 必须留下印子");
    assert.ok(s.beat.drawn < 0.2, `笔有摩擦，一帧不该窜到 ${s.beat.drawn}`);
    // 玩家要做的事，画面上事先不能已经做完了：第二道刻痕此刻必须还没有
    assert.ok(!s.flags.carved, "没划完之前，门框上不该已经有第二道刻痕");
    // 第一趟到头：笔抬起来退回去，印子只是浅白的一道
    while (s.beat.pass === 0) step(s, E_RIGHT);
    assert.equal(s.beat.pass, 1, "一趟到头算一趟");
    assert.ok(s.beat.press.every((v) => v <= L.passPress[0] + 1e-6), "第一趟只留浅白印");
    assert.ok(s.beat.lift > 0, "一趟到头笔要抬起来退回起点");
    assert.equal(CurrentBeatDef(s)?.id, "c8_carve", "一趟不算完，得三趟");
    // 一直按到底：三趟
    step(s, E_RIGHT, 600);
    assert.notEqual(CurrentBeatDef(s)?.id, "c8_carve", "三趟蹭完，这一拍必须过");
    assert.equal(s.flags.carved, true, "划完了，第二道刻痕才长在门框上");
    assert.equal(s.scribeCard, null, "划完了，那张卡必须收走");
  }

  // ③ 松手笔停住，印子不长也不退（石笔留下的是痕，不是可增可减的进度）
  {
    const s = mk();
    step(s, {}, 2);
    step(s, E_RIGHT, 8);
    const drawnBefore = s.beat.drawn;
    assert.ok(drawnBefore > 0, "先得划出一点");
    step(s, {}, 30);
    assert.equal(s.beat.drawn, drawnBefore, "松手之后印子不该再长，也不该退");
    assert.ok(!s.dragTrack, "划完之后也不许留下一根轨道");
  }
  console.log("  ✓ 石笔：长在特写卡上 / 只认 E＋→ / 有摩擦 / 三趟一趟比一趟深 / 无 slider");
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
  const VIEW = 8.7;    // 地表玩法景别的画框宽（Main 的 PLAY_HW.surfaceNight 4.35 × 2）
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

// 收藏品（老物件 + 包袱）2026-08-18 整套下线（Core 的 `RELICS_ON`，用户：「把现在的
// 道具收集功能都干掉 暂时不要这个玩法」）。所以这条测试分两半：
//   · **数据与画笔照旧逐条体检**——一个字都没删，将来翻开关就得能用；烂在抽屉里也是烂；
//   · **玩法按开关验**：关着就必须真关着（不出提示、不发卡），开着就照老样子走通。
// 这样恢复的时候不用回来改测试，翻一个布尔两条路都是绿的。
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

  // 无头走位：跳到第一章玩法拍，走到鸡窝那件（newsSheet）跟前按 E
  const st = CreateGame(0);
  DebugJump(st, 0, ChapterBeatList(0).find((b) => b.id === "c1_well").index);
  const idle = { moveX: 0, climb: 0, crouch: false, interact: false, interactHeld: false, advance: false };
  StepGame(st, idle, DT);
  st.player.x = 66.3;
  st.player.level = "surface";
  st.player.cineWalk = null;
  StepGame(st, idle, DT);
  if (RELICS_ON) {
    assert.equal(st.prompt, "E · 收进包袱", `站到收藏品跟前该出拾取提示，实际 ${JSON.stringify(st.prompt)}`);
    StepGame(st, { ...idle, interact: true }, DT);
    assert.ok(st.relicsGot.has("newsSheet"), "按 E 没收进包袱");
    assert.ok(st.relicCard && st.relicCard.id === "newsSheet", "拾取后要出包袱卡（Main 靠它存档+滑条）");
    StepGame(st, idle, DT);
    assert.notEqual(st.prompt, "E · 收进包袱", "收走了还出提示");
  } else {
    // 关着＝**一点痕迹都不许有**：不出提示（那句提示会顶掉这一拍真正的任务提示）、
    // 按 E 也收不走、更不许发包袱卡（Main 拿它弹 peek，弹出来就是通知一个不存在的玩法）
    assert.notEqual(st.prompt, "E · 收进包袱", "收藏品已下线，还在出「收进包袱」的提示");
    StepGame(st, { ...idle, interact: true }, DT);
    assert.ok(!st.relicsGot.has("newsSheet"), "收藏品已下线，按 E 还能收走");
    assert.ok(!st.relicCard, "收藏品已下线，还在发包袱卡");
  }
  // 包袱开着世界要冻住（机制留着——恢复那天这一条还得管用）
  st.bagOpen = true;
  const beforeX = st.player.x;
  StepGame(st, { ...idle, moveX: 1 }, DT);
  assert.equal(st.player.x, beforeX, "包袱开着人还能走——世界没冻住");
  st.bagOpen = false;
  console.log(`  ✓ 收藏品${RELICS_ON ? "" : "（已下线）"}：${all.length} 件老物件 / 注解齐 / 画法齐 / 疑兵草 ${decoys} 处 / ${RELICS_ON ? "无头拾取通" : "场上不出提示不发卡"}`);
}

function TestCliAnswersQuestions() {
  const cli = path.join(path.dirname(fileURLToPath(import.meta.url)), "Script_Cli.mjs");
  const run = (args) => execFileSync(process.execPath, [cli, ...args], { encoding: "utf8", timeout: 60000 });

  // ① where：索引里必须找得到各类东西，且答案带 文件:行
  const w = run(["where", "c1_well"]);
  assert.match(w, /c1_well\s+节拍/, "where 得认得节拍 id");
  assert.match(w, /Data_ScriptC1\.mjs:\d+/, "where 的答案必须带 文件:行，不然还得再 grep 一遍");
  assert.match(run(["where", "DrawHenCoop"]), /画笔.*Script_Art\.mjs:\d+/, "where 得认得画笔");
  assert.match(run(["where", "henCoop"]), /Data_PropArt\.json:\d+/, "where 得认得道具登记");

  // ② beats/beat：不读 Core 就能拿到一拍的全部
  assert.match(run(["beats", "c1"]), /c1_well/, "beats 得列全第一章");
  const b = run(["beat", "c1_well"]);
  // 第九稿：井台压成两道手（挂桶 → 放桶下去 → 摇上来），整拍只剩一个 winch 步骤
  assert.match(b, /步骤 1/, "beat 得把步骤数说清（第九稿井台只剩一步 winch）");
  assert.match(b, /needs="bucket"/, "beat 得说清这一步要什么");
  assert.match(b, /旗标\s+.*waterFilled/, "beat 得扫出这一拍碰的旗标（且不许把后面几拍的算进来）");

  // ③ state：无头跑到任意一拍、喂真输入、把状态打出来——那 725 次探针脚本的替代品
  //（拎桶那一步在 c1_walk 的头里：「俺去打水。你跟紧。」）
  const s0 = run(["state", "c1_walk", "--x", "43.0", "--json"]);
  const j0 = JSON.parse(s0);
  assert.equal(j0.beat.id, "c1_walk");
  assert.match(j0.prompt || "", /空桶|拎/, "站到缸边必须给得出拎桶的提示");
  const j1 = JSON.parse(run(["state", "c1_walk", "--x", "43.0", "--input", "e", "--json"]));
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
// 活卡上那个「能抓的点」必须**落在被抓的那件东西身上**，而且活卡亮着的时候
// 世界里的找路 UI 必须让位。
//
// 2026-08-14 用户在撕布那一拍报的原话：「到底怎么操作啊？完全不会 拖什么都
// 没反应」。查出来是两件事叠在一起，两件都是"名单没跟上"这一类：
//   ① `TEAR_CARD.corner` 的 y 是 0.19，而布的上沿在 0.205 ——**招呼玩家上手的
//      那团光整个浮在布外头的黑地上**。玩家去揪的自然是那一大片布，而按在布
//      身上原来一点回音都没有（没声音、没画面、没有一个字），读出来就是坏的。
//   ② `onLiveCard` 与 Main 的摇杆开关各自手抄了一份活卡名单，后加的
//      wrap/split/tear/sew 四张一张都没补上——于是整幅卡当中常驻着一句
//      「W · 上梯子」，玩家看见的唯一一句指示指的是另一件事。
// 这条断言把两样都钉住：抓取点在物体里、名单只有 LIVE_CARD_FIELDS 这一份。
function TestLiveCardGrabPointsSitOnTheThing() {
  // ① 抓取点必须在那件东西的轮廓里（外扩半个抓取半径都算不上"在上面"）
  const InRect = (p, r, pad = 0) => p.x > r.x0 - pad && p.x < r.x1 + pad
    && p.y > r.y - pad && p.y < r.y + r.h + pad;
  assert.ok(InRect(TEAR_CARD.corner, TEAR_CARD.cloth),
    `撕布的抓取点必须落在布身上（布 y ${TEAR_CARD.cloth.y}~${(TEAR_CARD.cloth.y + TEAR_CARD.cloth.h).toFixed(3)}，`
    + `角在 ${TEAR_CARD.corner.y}）——浮在布外头就是"招呼画在空气里"`);
  assert.ok(InRect(SEW_CARD.needle0, SEW_CARD.patch, SEW_CARD.grabR),
    "缝三针的针必须搁在布上（够得着的地方），不许浮在画框空处");

  // ② 名单只有一份，而且八张全在
  for (const k of ["scribeCard", "planeCard", "knotCard", "foldCard",
    "wrapCard", "splitCard", "tearCard", "sewCard"]) {
    assert.ok(LIVE_CARD_FIELDS.includes(k), `LIVE_CARD_FIELDS 漏了 ${k}`);
  }
  const st = CreateGame(0);
  assert.equal(LiveCardOn(st), false, "没卡的时候 LiveCardOn 必须是假");
  for (const k of LIVE_CARD_FIELDS) {
    st[k] = { any: 1 };
    assert.equal(LiveCardOn(st), true, `${k} 立起来时 LiveCardOn 必须为真`);
    st[k] = null;
  }
  // 别处不许再手抄名单：抄一份就漏一份（这个 bug 出过两回）
  const here = path.dirname(fileURLToPath(import.meta.url));
  const chapterFiles = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => `Data_ScriptC${n}.mjs`);
  for (const f of ["Script_Core.mjs", "Script_Main.js", "Script_Cli.mjs", ...chapterFiles]) {
    // 名单自己那份声明当然要跳过（它就是那唯一一份）
    const src = fs.readFileSync(path.join(here, f), "utf8")
      .replace(/export const LIVE_CARD_FIELDS = \[[\s\S]*?\];/, "");
    for (const line of src.split("\n")) {
      if (line.includes("LIVE_CARD_FIELDS")) continue;
      const n = ["scribeCard", "planeCard", "knotCard", "foldCard",
        "wrapCard", "splitCard", "tearCard", "sewCard"].filter((k) => line.includes(k)).length;
      assert.ok(n < 3,
        `${f} 里又手抄了一份活卡名单（一行点了 ${n} 张）——走 LiveCardOn / LIVE_CARD_FIELDS：\n    ${line.trim()}`);
    }
  }
  console.log("  ✓ 活卡的抓取点长在实物上；活卡名单只有 LIVE_CARD_FIELDS 一份");
}

// 撕布：三把全是按住 E ＋ ←（2026-08-17 四动词第二轮）——第一把只绷紧、第二把
// 裂口、第三把一路撕到头。前两把拽到头布弹回去缓一口，按住不放也是一把一把的。
// 光按住 E、按 → 都不动。**"按了没反应"比难更劝退**，所以卡一摆上来就说清、
// 每换一把都有一句话（同打水那几道手）。
function TestTearIsThreePulls() {
  const state = CreateGame(0);
  const rescue = ChapterBeatList(0).find((b) => b.id === "c1_rescue");
  DebugJump(state, 0, rescue.index);
  const L = TEAR_CARD;
  const Step = (inp = {}, n = 1) => {
    for (let i = 0; i < n; i += 1) {
      StepGame(state, {
        moveX: 0, climb: 0, crouch: false, interact: false, interactHeld: false, advance: false, ...inp,
      }, DT);
    }
  };
  const frames = (s) => Math.ceil(s / DT);
  const E_LEFT = { interactHeld: true, moveX: -1 };
  Step();
  for (let i = 0; i < 900 && state.microCine; i += 1) Step({ advance: true });
  state.beat.stepIndex = 2;                // 撕布那一步（喂水/摸血跳过）
  Step();
  const zone = CurrentBeatDef(state).steps[2].zone;
  state.player.x = zone.x;
  state.player.level = zone.level;
  state.player.cineWalk = null;
  Step({}, 8);                             // 站定、把卡摆上来
  assert.ok(state.tearCard, "撕布那一步必须把活卡摆上来");
  assert.equal(state.climbHint, "", "活卡亮着时脚底下那句「W · 上梯子」必须收掉");
  assert.ok(/撕|角/.test(state.toast?.text || ""), "卡一摆上来就得说清这一下要干嘛");
  const pr = SplitPrompt(state.prompt || "");
  assert.equal(pr.dir, "left", `撕布的键帽是 E ＋ ←（实为 ${JSON.stringify(state.prompt)}）`);
  assert.ok(pr.hold, "撕是按住做功，不是点一下");

  // ① 光按住 E、按 →、拖指针：布一动不动
  Step({ interactHeld: true }, frames(1));
  Step({ interactHeld: true, moveX: 1 }, frames(1));
  Step({ pointerHeld: true, pointerCard: { u: L.corner.x - 0.05, v: L.corner.y * L.aspect } }, frames(1));
  assert.equal(state.tearCard.pulls, 0, "光按住 E / 按 → / 拖指针，布都不该被拽动");
  assert.ok(state.tearCard.pull < 1e-6, "方向不对布角一寸都不该挪");

  // ② 第一把：拽紧到头——布只绷紧，弹回去
  Step(E_LEFT, frames(L.tautS * 0.5));
  assert.ok(state.tearCard.pull > 0 && state.tearCard.pull < L.tautLen, "拽到一半布角跟着挪了一截");
  assert.ok(state.tearCard.corner.x < L.corner.x, "布角要真的往回挪（画面上看得见）");
  Step(E_LEFT, frames(L.tautS * 0.6));
  assert.equal(state.tearCard.pulls, 1, "第一把拽到头：布只被拉紧");
  assert.ok(/绷紧|没撕动/.test(state.toast?.text || ""), "第一把要说清：绷紧了，没撕动");
  Step({}, frames(0.5));
  assert.ok(state.tearCard.pull < 0.02, "撒手绷紧的布要弹回去");

  // ③ 一直按住：第二把裂口、第三把撕到头（缓一口的那几眼不算，可按住不放也走得完）
  let n = 0;
  while (state.tearCard && n < 900) { n += 1; Step(E_LEFT); }
  assert.equal(state.flags.clothTorn, true, "按住 E＋← 三把之内必须撕下来");
  assert.ok(n * DT > L.tautS + L.recoilS + L.tearS - 0.2,
    `三把有三把的分量（实际 ${(n * DT).toFixed(1)}s）——不是一根越拽越长的条`);
  console.log("  ✓ 撕布：只认 E＋← / 第一把绷紧弹回 / 第二把裂口 / 第三把撕到头 / 每把都有话");
}

// 分红薯干（2026-08-17 四动词第二轮，照 Notion 关卡设计第 6 拍）：掰＝按住 E＋←/→
//（从你使劲那头断开，一长一短）、分进两只碗＝E（长的搁进她碗里）、她推回来之后
// 放回她碗里＝E（捞出来沥两滴再搁）。老版三段全是在卡上捏着拖，第三段连键盘都
// 走不通——用户点名的「非按 E 的复杂交互」之一。
function TestSplitIsBreakThenTwoPresses() {
  const state = CreateGame(0);
  const meal = ChapterBeatList(0).find((b) => b.id === "c1_meal");
  DebugJump(state, 0, meal.index);
  const L = SPLIT_CARD;
  const beat = SCRIPTS.c1.find((b) => b.id === "c1_meal");
  const splitI = beat.steps.findIndex((s) => s.type === "split");
  const Step = (inp = {}, n = 1) => {
    for (let i = 0; i < n; i += 1) {
      StepGame(state, {
        moveX: 0, climb: 0, crouch: false, interact: false, interactHeld: false, advance: false, ...inp,
      }, DT);
    }
  };
  const frames = (s) => Math.ceil(s / DT);
  const Skip = () => { for (let i = 0; i < 900 && state.microCine; i += 1) Step({ advance: true }); };
  Step();
  Skip();
  state.beat.stepIndex = splitI;
  const zone = beat.steps[splitI].zone;
  state.player.x = zone.x + 0.35;
  state.player.level = "surface";
  state.player.cineWalk = null;
  Step({}, 6);
  assert.ok(state.splitCard, "分食那一步必须把活卡摆上来");
  assert.equal(state.splitCard.phase, "break", "先掰");
  const pr = SplitPrompt(state.prompt || "");
  assert.equal(pr.dir, "horiz", `掰的键帽是 E ＋ ↔（左右都行；实为 ${JSON.stringify(state.prompt)}）`);

  // ① 光按住 E、按 ↑、拖指针：条不弯
  Step({ interactHeld: true }, frames(0.6));
  Step({ interactHeld: true, climb: -1 }, frames(0.6));
  Step({ pointerHeld: true, pointerCard: { u: L.strip.cx, v: L.strip.cy * L.aspect } }, frames(0.6));
  assert.equal(state.splitCard.bend, 0, "光按住 E / 按 ↑ / 拖指针，条一点都不该弯");
  // ② 按住 E＋→ 掰：弯到一半松手它直回来；掰到底断成两截——按右掐在偏右那点，右短左长
  Step({ interactHeld: true, moveX: 1 }, frames(L.bendS * 0.5));
  assert.ok(state.splitCard.bend > 0.3 * L.bendNeed && state.splitCard.bend < L.bendNeed, "掰到一半条弯着");
  assert.ok(state.splitCard.grabU > 0.5, "按 → 捏点在偏右那头（从你使劲那头断开）");
  Step({}, frames(0.6));
  assert.ok(state.splitCard.bend < 0.02, "松手条自己直回来");
  Step({ interactHeld: true, moveX: 1 }, frames(L.bendS + 0.2));
  assert.equal(state.splitCard.phase, "sort", "掰到底：断成两截");
  const pcs = state.splitCard.pieces;
  assert.equal(pcs.length, 2, "两截");
  assert.ok(pcs[0].len > pcs[1].len, "按 → 掰出来左长右短（一长一短是这场戏的题眼）");
  assert.equal(SplitPrompt(state.prompt || "").act, "interact", "分进两只碗＝按一下 E");
  assert.ok(!SplitPrompt(state.prompt || "").hold, "分进两只碗不是长按");
  // ③ 按 E：卡上一截一截搁进碗——长的进她碗（西），短的进他碗（东）
  Step({ interact: true });
  Step({}, frames(L.sortS * 0.5));
  assert.ok(state.splitCard.held >= 0, "搬的时候手里捏着那截（画面上看得见在搬）");
  Step({}, frames(L.sortS * 2 + 0.3));
  assert.ok(state.microCine, "分完两只碗接过场：她醒了、把长的推过来");
  assert.equal(state.beat.stepIndex, splitI + 1, "分完两只碗这一步才过");
  const longWasLeft = pcs[0].len > pcs[1].len;
  assert.ok(longWasLeft, "长的那截该搁进她碗里（西边那只）");
  Skip();
  // ④ 换回去：按 E，捞出来沥两滴再搁回她碗——一按到底，中间是卡上动画
  state.player.x = zone.x + 0.35;
  Step({}, 4);
  assert.equal(state.splitCard?.phase, "swap", "她推回来之后是「放回她碗里」那一段");
  assert.equal(SplitPrompt(state.prompt || "").act, "interact", "放回她碗里＝按一下 E");
  Step({ interact: true });
  Step({}, frames(L.swapS[0] + L.swapS[1] * 0.6));
  assert.ok(state.splitCard && state.splitCard.drips >= 1, "提在半空要沥水（滴出来才算沥过）");
  Step({}, frames(L.swapS[1] + L.swapS[2] + 0.4));
  assert.equal(state.flags.mealSplit, true, "搁回她碗里，这一场就成了（「吃你的。」）");
  assert.equal(state.splitCard, null, "做完了活卡要收走");
  console.log("  ✓ 分红薯干：掰＝E＋↔（掰哪儿断哪儿·松手直回）/ 分进两只碗＝E（长的给她）/ 放回她碗＝E（沥两滴）");
}

function TestLiveCardsKeepTheWorldBehind() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const art = fs.readFileSync(path.join(here, "Script_Art.mjs"), "utf8");
  const LIVE = ["DrawPlaneCard", "DrawScribeCard", "DrawKnotCard", "DrawFoldCard",
    "DrawTearCard", "DrawSewCard"];
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
      // [A-Za-z0-9_]：文件名里有数字（Data_ScriptC1.mjs），漏了数字就走不全模块图
      for (const m of src.matchAll(/(?:from|import\()\s*["']\.\/([A-Za-z0-9_]+\.m?js)["']/g)) walk(m[1]);
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

  // 执行器与章文件里写死的那些提示也过一遍同一把尺
  const here = path.dirname(fileURLToPath(import.meta.url));
  for (const f of ["Script_Core.mjs", ...[1, 2, 3, 4, 5, 6, 7, 8].map((n) => `Data_ScriptC${n}.mjs`)]) {
    const src = fs.readFileSync(path.join(here, f), "utf8");
    for (const m of src.matchAll(/state\.(?:prompt|climbHint)\s*=\s*"([^"]+)"/g)) {
      check(f, m[1]);
    }
  }

  assert.deepEqual(bad, [], "提示文案里不许直接写键名／不许写成一句话：\n  " + bad.join("\n  "));
  // 前缀本身必须还认得出来，否则徽章会集体退化成没有按钮的状态行
  assert.deepEqual(SplitPrompt("按住 E · 接绳"), { act: "interact", hold: true, dir: null, text: "接绳" });
  assert.deepEqual(SplitPrompt("F · 投"), { act: "throw", hold: false, dir: null, text: "投" });
  assert.deepEqual(SplitPrompt("跟上娘"), { act: null, hold: false, dir: null, text: "跟上娘" });
  // 四动词那一档：方向也在前缀里，正文照旧只剩动词（HUD 拿它画第二枚键帽）
  assert.deepEqual(SplitPrompt("按住 E ＋ ↑ · 掀开翻板"),
    { act: "interact", hold: true, dir: "up", text: "掀开翻板" });
  assert.equal(StrokePrompt("按住 E · 顶上撑木", "up"), "按住 E ＋ ↑ · 顶上撑木");
  assert.equal(StrokePrompt("撕开蓝布", "left"), "按住 E ＋ ← · 撕开蓝布");
  console.log("  ✓ 提示文案与设备无关（键名只在前缀里）");
}

// 第一章（含序）的字幕只许是真旁白（2026-08-14 用户退回换来的）
// ——「很多我剧本里单纯是用来描述场景、描述镜头动画的，结果做成旁白直接在
// 游戏里显示了」。剧本里的斜体（镜头／无声动作／音效）一律走 `act:`，它不上
// 字幕也不配音；`stage:` 从此专指真旁白。整章只有两句，就是这张白名单。
// c2 起还没按这个口径翻过，所以只钉 c1。
function TestChapterOneShowsOnlyRealNarration() {
  const VO = ["没人来叫。", "第三天。还是没人来叫。"];
  // 微过场的行是 `StartMicroCine(state, [...])` 里现写的，挂不到 def 上——
  // 所以这一条扫源码，玩法段插的那几镜才盖得住
  // 剧本按章拆了（2026-08-15）：第一章整个就是 Data_ScriptC1.mjs 这一个文件
  const here2 = path.dirname(fileURLToPath(import.meta.url));
  const src2 = fs.readFileSync(path.join(here2, "Data_ScriptC1.mjs"), "utf8");
  const from = src2.indexOf('id: "c1_thatday"');
  assert.ok(from > 0, "找不到第一章的源码范围");
  const chunk = src2.slice(from);
  const shown = [...chunk.matchAll(/\bstage: "([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(shown, VO,
    "第一章的字幕只许是那两句真旁白；描述请写成 act:\n  " + shown.join("\n  "));

  // 反过来也得成立：描述行确实还在，只是不进字幕通道了
  const acts = [...chunk.matchAll(/\bact: "([^"]*)"/g)].length;
  assert.ok(acts > 150, `第一章的演出说明不该凭空少掉（现在 ${acts} 行）`);
  // 运行期再确认一遍：这些行确实不带任何会上字幕的字段
  for (const def of SCRIPTS.c1 || []) {
    for (const l of def.lines || []) {
      if (typeof l.act !== "string") continue;
      assert.ok(!l.stage && !l.say, `${def.id} 的演出说明行不许同时带 stage/say：${l.act}`);
    }
  }
  console.log(`  ✓ 第一章只有 2 句真旁白上字幕（${acts} 行演出说明不出字幕）`);
}

// 序 · 那天的三条演出契约（2026-08-14 重做过场时立的，三条都被实拍抓过）：
//   ① 序的三拍**没有音乐**（剧本首句〔音〕「没有音乐。」）；
//   ② 左右分屏的两格**不许互相看见对方**——两台相机各拍半屏，画框一重叠，
//      同一个人就在左右各出现一次；
//   ③ 过场机位**不许沉到地平线以下**：窖顶(−1.55)与地表(0)之间是实心土
//      （近侧剖面只在窖室那块掏了洞），机位摆进去拍出来满屏是土。
function TestPrologueStaging() {
  const FOV = 30;
  const c1 = SCRIPTS.c1 || [];
  const byId = Object.fromEntries(c1.map((d) => [d.id, d]));
  for (const id of ["c1_thatday", "c1_descend", "c1_hide"]) {
    assert.ok(byId[id] && byId[id].bgm === null,
      `${id} 必须声明 bgm: null——序章不许有配乐（剧本首句：没有音乐）`);
  }

  // 扫源码：分屏与自由机位既写在节拍上，也写在微过场里（第一章＝Data_ScriptC1.mjs）
  const here3 = path.dirname(fileURLToPath(import.meta.url));
  const src3 = fs.readFileSync(path.join(here3, "Data_ScriptC1.mjs"), "utf8");
  const from = src3.indexOf('id: "c1_thatday"');
  const chunk = src3.slice(from);

  // ② 分屏两格的画框不许交叠。逐个 `left:`/`right:` 机位取"注视点所在平面上
  //    的半屏画宽"，两段区间不许有公共部分
  // 坐标可能写成 `UNDER_Y + 0.98`（窖底那一格）——不认它就会漏掉半个分屏
  const N = "(-?[\\d.]+|UNDER_Y *[-+] *[\\d.]+)";
  const Num = (t) => (t.includes("UNDER_Y")
    ? -3.6 + (t.includes("-") && t.indexOf("-") > t.indexOf("UNDER_Y") ? -1 : 1) * parseFloat(t.split(/[-+]/).pop())
    : parseFloat(t));
  const panes = [...chunk.matchAll(new RegExp(
    `(left|right): \\{ from: \\[${N}, *${N}, *${N}\\][\\s\\S]*?at: \\[${N}, *${N}\\]`, "g",
  ))].map((m) => {
    const [px, py, pz, tx, ty] = [m[2], m[3], m[4], m[5], m[6]].map(Num);
    const dist = Math.hypot(tx - px, ty - py, pz);
    // 半屏画幅（16:9 去掉中缝之后的一半）
    const half = dist * Math.tan((FOV * Math.PI / 180) / 2) * ((16 / 9) * 0.493);
    return { side: m[1], lo: tx - half, hi: tx + half, ty };
  });
  // 2026-08-16 照 Notion《过场分镜》改：**镜 01 从分屏改回单画幅**——分镜图上
  // 两个孩子是挤在一起的，画左整整小半幅是那扇门；分屏把这张图最要紧的两件事
  // （"两个人在一起"＋"他们盯着的那扇门"同框）都拆没了。序里现在只剩收尾那一处
  // 分屏（地表窄带＋窖底同框），它是"底下有人、上头空了"，分屏才成立。
  assert.ok(panes.length >= 2 && panes.length % 2 === 0,
    `序里的分屏要成对写（left→right），解析到 ${panes.length} 格`);
  // 镜 01 现在必须是**单画幅 + 门在画里**：门走前景框景（过场里第四堵墙不画，
  // 立面上那扇门给正脸就是个空门洞）
  assert.ok(/art: "doorSlab"/.test(chunk),
    "序的头一镜要有那扇门（doorSlab 前景板）——分镜图上它占掉画左小半幅");
  const splits = panes.length / 2;
  for (let i = 0; i < panes.length; i += 2) {
    const L = panes[i], R = panes[i + 1];
    assert.equal(`${L.side}${R.side}`, "leftright", "分屏要按 left → right 的顺序写");
    // 两格拍的是**同一层**时才要求 x 上分开；一上一下（窖底 vs 头顶那间屋）
    // 本来就隔着一层楼，x 重叠是对的——那正是"底下有人、上头空了"这张画
    const sameFloor = Math.abs(L.ty - R.ty) < 1.5;
    assert.ok(!sameFloor || L.hi < R.lo || R.hi < L.lo,
      `分屏两格的画框交叠了（左 ${L.lo.toFixed(2)}~${L.hi.toFixed(2)} / 右 ${R.lo.toFixed(2)}~${R.hi.toFixed(2)}）——同一个人会在两边各出现一次`);
  }

  // ③ 机位不许落在"窖顶与地表之间"那层实心土里
  let cams = 0, bad = [];
  for (const m of chunk.matchAll(new RegExp(`(?:from|to): \\[${N}, *${N}, *${N}\\]`, "g"))) {
    cams += 1;
    const y = Num(m[2]);
    if (y < -0.05 && y > -1.55) bad.push(y.toFixed(2));
  }
  assert.equal(bad.length, 0,
    `过场机位落进了地表与窖顶之间的实心土：y=${bad.join(",")}（要么在地面之上，要么下到窖里去）`);
  console.log(`  ✓ 序 · 那天：三拍无配乐 / ${splits} 处分屏两格不交叠 / ${cams} 个机位都不在土里`);
}

// ---------------------------------------------------------------------------
console.log("《地道里的光》冒烟测试（横版 2.5D）");
console.log("— 机制定点断言 —");
TestChapterMeta();
TestSingleChapterEntry();
TestVision();
TestCoverIsDirectional();
TestClimb();
TestClimbPlanLocksToRungs();
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
  // 方向进前缀不进正文（四动词：HUD 拿它画第二枚键帽）
  assert.equal(SplitPrompt(st.prompt || "").dir, "up",
    `提示前缀里得带方向（实为 ${JSON.stringify(st.prompt)}）`);
  // 松手泄劲
  const was = st.beat.holdP;
  for (let i = 0; i < 10; i += 1) StepGame(st, idle(), DT);
  assert.ok(st.beat.holdP < was, "松手功要慢慢泄掉");
  // **光按住 E 不算做功**（2026-08-16 四动词）：方向不推，一分都不涨
  const idleHold = st.beat.holdP;
  for (let i = 0; i < 30; i += 1) StepGame(st, { ...idle(), interactHeld: true }, DT);
  assert.equal(st.beat.holdP, idleHold, "光按住 E 不该涨——做功要往方向上推");
  // 按住 E ＋ ↑ 干完（键盘与摇杆同一条路；驱动器走的也是这条）
  let g1 = 0;
  while (st.beat.stepIndex === shore.steps.indexOf(upStep) && g1 < 400) {
    g1 += 1; StepGame(st, { ...idle(), interactHeld: true, climb: -1 }, DT);
  }
  assert.ok(g1 < 400, "按住 E ＋ ↑ 必须能把撑木顶上去");

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
  // 剧本按章拆了：姿势名既写在 Core 执行器里，也写在章文件的节拍上，一起扫
  const core = ["Script_Core.mjs", ...[1, 2, 3, 4, 5, 6, 7, 8].map((n) => `Data_ScriptC${n}.mjs`)]
    .map((f) => fs.readFileSync(path.join(here, f), "utf8")).join("\n");
  const handled = new Set([...rig.matchAll(/s\.pose === "([A-Za-z]+)"/g)].map((m) => m[1]));
  assert.ok(handled.size > 15, `Rig 里应当有一整套姿势，实测只认出 ${handled.size} 个`);
  const used = new Set([...core.matchAll(/\.pose = "([A-Za-z]+)"/g)].map((m) => m[1]));
  const bad = [...used].filter((n) => !handled.has(n));
  assert.deepEqual(bad, [], `剧本里这些姿势 Rig 不认识，写了等于没写：${bad.join("、")}`);
  console.log(`  ✓ 剧本用到的 ${used.size} 个姿势名 Rig 全都接得住（共 ${handled.size} 支）`);
}

// 动画索引 / 动画工作台（2026-08-17）：动画退回要**按名字点名**，所以索引必须把
// Rig 里的每一条轨道、每一支姿势、每一支步态分支都扫出来，且带行号与用法；
// 工作台的骨架（DOM id / 入口 / import map）在，CLI 的 anims/anim 答得上话。
// 索引是纯正则扫源码——Rig 的写法一变（缩进、`dur:` 的格式、if 链的形状）它就会
// 悄悄少扫一片，这里拿 Rig 自己的正则数一遍来对账。
async function TestAnimIndexIsComplete() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const read = (f) => { try { return fs.readFileSync(path.join(here, f), "utf8"); } catch { return null; } };
  const { ScanAnimIndex, LOCOMOTION, FormatRef, KIND_PRESETS } = await import("./Script_AnimIndex.mjs");
  const idx = ScanAnimIndex(read);
  const rig = read("Script_Rig.mjs");

  // ① 轨道：TRACKS 块里每一个二级键都得在，dur/loop/keys 读得出
  const trackBlock = rig.slice(rig.indexOf("export const TRACKS = {"), rig.indexOf("\n};", rig.indexOf("export const TRACKS = {")));
  const trackNames = [...trackBlock.matchAll(/^\s{2}([A-Za-z][A-Za-z0-9]*): \{\s*$/gm)].map((m) => m[1]);
  assert.ok(trackNames.length >= 40, `Rig 里该有几十条轨道，正则只数出 ${trackNames.length}`);
  for (const n of trackNames) {
    const t = idx.tracks[n];
    assert.ok(t, `索引漏掉了轨道 ${n}`);
    assert.ok(t.dur > 0 && typeof t.loop === "boolean", `轨道 ${n} 的 dur/loop 没读出来`);
    assert.ok(t.keys.length >= 2, `轨道 ${n} 只读出 ${t.keys.length} 帧`);
    assert.ok(t.keys.every((k) => typeof k.t === "number"), `轨道 ${n} 有关键帧没读到 t`);
    assert.ok(t.line > 0, `轨道 ${n} 没有行号`);
    assert.deepEqual(t.warnings, [], `轨道 ${n}：${t.warnings.join("；")}`);
  }
  // 多行写的关键帧也得整个读进来（malletTap 首帧写了三行、14 个字段）
  assert.ok(Object.keys(idx.tracks.malletTap.keys[0].values).length >= 14, "malletTap 首帧跨三行，字段必须读全");
  assert.match(idx.tracks.scoopChild.keys[1].note, /预备/, "关键帧行尾的注释要挂到那一帧上");

  // ② 姿势：PoseRig 里每个 s.pose === "x" 都得在，且带行号、说明
  const poseNames = new Set([...rig.matchAll(/s\.pose === "([A-Za-z0-9]+)"/g)].map((m) => m[1]));
  for (const n of poseNames) {
    assert.ok(idx.poses[n], `索引漏掉了姿势 ${n}`);
    assert.ok(idx.poses[n].line > 0, `姿势 ${n} 没有行号`);
  }
  assert.equal(idx.poses.planePush.progress, true, "planePush 读 s.poseK，得标成进度驱动");
  assert.equal(idx.poses.planePush.registeredProgress, true, "planePush 在 World.PoseProgress 里登记着");
  assert.equal(idx.poses.shelter.calmBreath, true, "shelter 在 CALM_BREATH 白名单里");
  assert.equal(idx.poses.sleep.lie, true, "sleep 是 LIE_POSES");
  assert.ok(idx.poses.crank.inputs.some((i) => i.key === "aimHand"), "crank 的输入里得有 aimHand");

  // ③ 步态：LOCOMOTION 表上每一条都得对上 Rig 里的分支（条件文字逐字相同）
  for (const L of idx.locomotion) assert.ok(L.line > 0, `步态 ${L.id}：${L.warnings.join("；") || "没对上分支"}`);
  assert.equal(idx.locomotion.length, LOCOMOTION.length);
  assert.ok(KIND_PRESETS.length >= 9, "换人预设要覆盖九种骨架");

  // ④ 用法：谁在哪一行挂了哪个名字——带 文件:行、节拍 id、是谁
  const su = idx.usages.scoopedUp || [];
  assert.ok(su.some((u) => u.file === "Data_ScriptC1.mjs" && u.beat === "c1_descend" && u.kind === "FlashTrack" && u.kindGuess === "sister"),
    `scoopedUp 的用法要扫出 c1_descend 里 FlashTrack(…, sis)：${JSON.stringify(su)}`);
  const sh = idx.usages.shelter || [];
  assert.ok(sh.some((u) => u.kind === "holdPose" && u.beat === "c1_bell"), "shelter 的 holdPose 用法要认成 holdPose（同一行还有 holdTrack）");
  const ref = FormatRef({ type: "track", ...idx.tracks.scoopChild });
  assert.match(ref, /^轨道 scoopChild · Script_Rig\.mjs:\d+ · 1\.45s 单次 · \d+ 帧 · 用于 c1_descend/, `引用行格式：${ref}`);

  // ⑤ 壳：入口在设置面板里、面板骨架在、模块登进 import map（版本戳那条另有测试盯）
  const html = read("index.html");
  for (const id of ["btnAnim", "animPanel", "animSearch", "animList", "animView", "animCanvas", "animOverlay", "animTransport", "animInfo", "animClose", "animStatus"]) {
    assert.ok(html.includes(`id="${id}"`), `index.html 缺 #${id}`);
  }
  assert.ok(/import \{[^}]*\bCreateAnimLab\b[^}]*\} from "\.\/Script_AnimLab\.mjs"/.test(read("Script_Main.js")), "Main 得接上动画工作台");
  // 人物美术样式浏览器的右栏借的是同一层小舞台：换人/换动作的壳得在
  assert.ok(/CreateRigStage\(\{ canvas: ui\.artRigCanvas/.test(read("Script_Main.js")), "人物美术样式浏览器要接上 CreateRigStage（整身·骨架实时）");
  for (const id of ["artRigCanvas", "artAnim", "artPlay", "artFlip", "artToLab", "artRigNote"]) assert.ok(html.includes(`id="${id}"`), `index.html 缺 #${id}`);
  assert.ok(/AnimLab: animLab/.test(read("Script_Main.js")), "TunnelLight.AnimLab 钩子要暴露给实拍/测试");

  // ⑥ CLI：anims / anim 答得上话
  const cli = path.join(here, "Script_Cli.mjs");
  const run = (args) => execFileSync(process.execPath, [cli, ...args], { encoding: "utf8", timeout: 60000 });
  assert.match(run(["anims", "scoop"]), /轨道 scoopChild\s+1\.45s 单次 6帧\s+Script_Rig\.mjs:\d+/, "anims 得列出 scoopChild 及其时长/帧数/行号");
  const one = run(["anim", "scoopChild"]);
  assert.match(one, /关键帧|#\s+t/, "anim 得打出关键帧表");
  assert.match(one, /Data_ScriptC1\.mjs:\d+\s+c1_descend/, "anim 得说清用在哪一拍");
  console.log(`  ✓ 动画索引：${trackNames.length} 轨道 / ${poseNames.size} 姿势 / ${idx.locomotion.length} 步态全扫到；用法带 文件:行 + 节拍 + 谁；工作台入口/骨架/CLI 齐`);
}

// 原 TestSlingThrow / TestElmSetupIsMotivated 随打榆钱一场退役（2026-08-13
// 八稿：村里的榆树全秃了，c1_elm 整拍删除）。投石机制（SlingSolve / 拽弓 /
// 无按键后备）仍在链外自由投掷里活着（潜行段的石子引开），throwHit 链步
// 暂无节拍使用——哪天再有"砸中什么"的戏，把这两条从 git 历史里捞回来改。

TestPromptsAreDeviceNeutral();
TestChapterOneShowsOnlyRealNarration();
TestPrologueStaging();
TestStrokeWork();
TestPoseNamesExist();
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
// TestKnotIsASheetBend();   // 第九稿：修井绳（接绳活卡）整段下线，机制留在 Core 里没人用
TestGrabbablesAreBigEnoughToRead();
TestForageIsFourVerbs();
TestWinchIsACrankNotALever();
TestWinchIsLongEnough();
TestChalkIsThreePasses();
TestLiveCardsKeepTheWorldBehind();
TestLiveCardGrabPointsSitOnTheThing();
TestTearIsThreePulls();
TestSplitIsBreakThenTwoPresses();
TestMalletTapDoesNotSlide();
TestDayNightIsContinuous();
TestEdgeHintPointsOffscreenTargets();
TestEdgeHintIconTellsWhatsNext();
TestInstrumentalBgmManifest();
TestModuleGraphIsCacheBusted();
TestQuieterAudioMix();
await TestAnimIndexIsComplete();

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
  // ——第一章（蓝底白花，第八稿）——
  assert.equal(state.flags.jarDug, true, "C1 刨灰堆必须刨出那个小口坛");
  assert.equal(state.flags.seedKept, true, "C1 谷种必须看过一眼又原样扎回去（饿着也不动留种，这一章最硬的一下）");
  assert.equal(state.flags.mealSplit, true, "C1 分食必须亲手掰过、又把长的那截搁回她碗里");
  assert.equal(state.flags.tallied, true, "C1 正字那一道必须真的画上（她自己的手，玩家抱着）");
  assert.equal(state.flags.bitterHerb, true, "C1 妹妹那棵苦菜必须入戏（「哥，大的。」）");
  assert.equal(state.flags.waterFilled, true, "C1 打水的桶必须真的触过水");
  assert.equal(state.flags.beansGiven, true, "C1 七叔那把黑豆必须塞到怀里（车铃一整场没被跳丢）");
  assert.equal(state.flags.vatFilled, true, "C1 打回来的水必须倒进缸里");
  assert.equal(state.flags.mealCooked, true, "C1 那顿热饭必须真的做出来（章目标：天黑前）");
  assert.equal(state.flags.shareDone, true, "C1 黄昏必须趁她打盹把稠的匀过去");
  assert.equal(state.flags.basketMoved, true, "C1 针线笸箩必须搁到梯子旁（缝那一场的伏笔）");
  assert.equal(state.flags.clothOut && state.flags.manFound, true,
    "C1 那块整布必须亲手掀出来、那只手必须抓住过他的手腕");
  assert.equal(state.flags.clothTorn, true, "C1 整布必须亲手撕开（绷紧/裂口/撕开三把）");
  assert.equal(state.flags.manBound, true, "C1 伤口必须亲手裹过两圈");
  assert.equal(state.flags.mended, true, "C1 袖口那三针必须亲手缝上");
  assert.equal(state.flags.jacketOn, true, "C1 接了袖的褂子必须给妹妹穿上（「我在」那一按）");
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
