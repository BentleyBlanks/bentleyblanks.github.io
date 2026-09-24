// ===========================================================================
// Script_FirstLevelQuietMarch.mjs —— 15A 沟口收拢 + 15B 换手抬运，沿墙缓行
//
// Notion（docs/Data_FirstLevelRebuildSource20260919.md 的 15A / 15B）：
// 这是空袭之后**第一次降压**，整段没有战斗。追兵由转运点的警戒人员在车路方向
// 接住，沟壁折角切断直射；玩家这一段的活是「把队伍收拢起来再走」。
//
// 这里只写编排（谁在哪儿、什么时候说话、什么时候算数）。距离门一律走
// `runtime.GateNear(fact)`（点与半径在 Data_FirstLevelMissionGates），
// 数值走 Data_Tuning_FirstLevelEnd，玩家可见中文一个字都不许进来。
//
// 零 three：本模块可以在 node 里直接 import（Script_FirstLevelEndTest 就这么测）。
// ===========================================================================
import { END_TUNING as E } from "./Data_Tuning_FirstLevelEnd.mjs";
import { MISSION_ANCHORS as A, MISSION_PLACEMENT as P, MISSION_ROUTES } from "./Data_FirstLevelMissionLayout.mjs";
import { MISSION_STAGE_ROUTES, MISSION_REAR_ROUTES } from "./Data_FirstLevelMissionTopology.mjs";
import { MISSION_ENCOUNTERS } from "./Data_FirstLevelMission.mjs";
import { EndFacing, EndProjectOnto, EndRouteLength, EndRoutePoint } from "./Script_FirstLevelEndCast.mjs";

const Distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const PICKET_IDS = Object.freeze(["PicketLeft", "PicketCentre", "PicketRight"]);
/** 空袭之后从村东压过来的那一组：15A 的遮挡判据只看他们。 */
const PURSUIT_IDS = Object.freeze(MISSION_ENCOUNTERS.air.map(spec => spec.id));
const WALL_PATH = MISSION_STAGE_ROUTES.wallPath;
const WALL_PATH_LENGTH = EndRouteLength(WALL_PATH);
/** 从沟内收拢点走完退沟折角后再接夹道；叙事夹道进度仍只读 WALL_PATH。 */
export function WallPathGuideRoute() {
  return [...MISSION_REAR_ROUTES.evacuation.slice(2, 6), ...MISSION_STAGE_ROUTES.wallPath]
    .map(point => ({ ...point }));
}
/** 15B 掉队伤员：读 MISSION_PLACEMENT.wallPath.stragglers，投影回夹道中线再用。 */
const STRAGGLERS = Object.freeze(P.wallPath.stragglers.map((point, index) => {
  const on = EndProjectOnto(WALL_PATH, point);
  return Object.freeze({ id: `WallStraggler${index}`, tender: `WallTender${index}`, progress: on.progress });
}));

export class FirstLevelQuietMarch {
  constructor(runtime) {
    this.runtime = runtime;
    this.Reset();
  }
  Reset() {
    this.regroup = null;
    this.wall = null;
  }

  // -------------------------------------------------------------------------
  // 进入步骤
  // -------------------------------------------------------------------------
  Enter(step) {
    const r = this.runtime;
    if (step === "Regroup") {
      // 飞机声远去：沟里的环境声换成南段那条（远炮 + 脚步，没有近距离枪火）。
      r.audio.Ambience("firstLevelSouth");
      this.regroup = { sheltered: false, checkStarted: false, headcountStarted: false, cartAsked: false, speaking: null };
      for (const [index, id] of PICKET_IDS.entries())
        r.extras.Spawn(id, E.picketPosts[index], { weapon: "HanYang", squadId: "MissionTransferPicket", stance: 1 });
    }
    if (step === "WallPath") {
      this.wall = {
        swapOffered: false, bumpSaid: false, bumpAt: null, shakeSaid: false,
        silent: 0, silentDistanceM: 0, silenceDone: false, tended: false,
        stragglers: STRAGGLERS.map(entry => ({ ...entry, tenderProgress: Math.max(0, entry.progress - 9) })),
      };
      // 15B 全程无敌人：15A 的警戒兵留在沟口那一头，队伍已经走过去了。
      r.extras.Keep([]);
    }
  }

  // -------------------------------------------------------------------------
  // 15A 沟口收拢
  // -------------------------------------------------------------------------
  /** Hold the actual column at the rally until it has regrouped; allow only the witnessed restart. */
  ColumnLimit() {
    const r = this.runtime;
    if (r.flow.stage.id !== "Regroup") return Infinity;
    const rally = EndProjectOnto(r.column.route, A.retreatA).progress;
    return rally + (r.Has("headcountDone") && r.Has("litterRemanned") ? E.columnMovingM : 0);
  }

  UpdateRegroup(dt) {
    const r = this.runtime, state = this.regroup;
    if (!state) return;
    const column = r.column, zhou = column.zhou;
    // 1. 警戒兵：站在车路方向的射位上真开火（追兵沿 MISSION_PURSUIT_ROUTE 压过来）。
    for (const [index, id] of PICKET_IDS.entries())
      r.extras.Hold(id, E.picketPosts[index], { yaw: E.picketPosts[index].yaw, stance: 1, fight: true, radiusM: 1.4 });

    // 2. 幺娃真的走到担架边上才检查老周。
    const yaowa = r.companion.Handle("yaowa");
    if (yaowa?.alive && !r.Has("zhouChecked")) {
      if (Distance(yaowa.position, zhou) > E.zhouCheckReachM) {
        r.MoveActor(yaowa, { x: zhou.x - Math.sin(zhou.yaw || 0) * 1.3, z: zhou.z - Math.cos(zhou.yaw || 0) * 1.3 },
          E.zhouCheckApproachMps);
      } else {
        r.MoveActor(yaowa, yaowa.position, 0);
        r.ai.SetStance(yaowa, 1, 1, true);
        yaowa.yaw = EndFacing(yaowa.position, zhou);
        if (!state.checkStarted) { state.checkStarted = true; r.Say("ZhouCheck"); }
      }
    }

    // 3. 何有田点人：被点到的三个人都得在场（喊得到、看得见），逐句对着真人。
    const he = r.companion.Handle("heyoutian");
    const named = ["liuwencai", "yaowa", "shunzi"];
    if (he?.alive && r.Has("zhouChecked") && !state.headcountStarted) {
      const present = named.every(id => id === "shunzi"
        ? Distance(he.position, r.player.position) <= E.headcountReachM
        : (() => { const actor = r.companion.Handle(id); return !!actor?.alive && Distance(he.position, actor.position) <= E.headcountReachM; })());
      if (present) { state.headcountStarted = true; r.Say("Headcount"); }
    }
    // 点名那几句里，说话的人与何有田互相转过去（Line 事件写 state.speaking）。
    if (state.speaking && he?.alive) {
      const who = state.speaking;
      const target = who === "heyoutian" ? this.HeadcountTarget() : he.position;
      const actor = who === "heyoutian" ? he : (who === "shunzi" ? null : r.companion.Handle(who));
      if (actor?.alive && target) {
        const goal = EndFacing(actor.position, target);
        const gap = Math.atan2(Math.sin(goal - actor.yaw), Math.cos(goal - actor.yaw));
        actor.yaw += Math.max(-E.headcountTurnRadPerS * dt, Math.min(E.headcountTurnRadPerS * dt, gap));
      }
      if (who !== "heyoutian") {
        const speaker = who === "shunzi" ? r.player.position : r.companion.Handle(who)?.position;
        if (speaker) {
          const goal = EndFacing(he.position, speaker);
          const gap = Math.atan2(Math.sin(goal - he.yaw), Math.cos(goal - he.yaw));
          if (!he.target) he.yaw += Math.max(-E.headcountTurnRadPerS * dt, Math.min(E.headcountTurnRadPerS * dt, gap));
        }
      }
    }

    // 4. 顺子问赶车人（走到车边才问）。
    //
    // **只认「走到车边」这一条。** 原来还压了一条 `headcountDone` 前置 —— 那把这句话
    // 变成了实际上说不出口的台词：点名一完，`litterRemanned` / `columnMoving` 紧跟着
    // 就齐了，15A 在几秒内换步，而赶车人在 28 m 外的沟口。实拍 2026-09-20
    // （`--stage-from=15`）连跑两趟：人赶到车边时目标已经是「沿院墙夹道继续南行」，
    // 还挨了一条「你已偏离行动路线」。采用稿对这一句只写了「玩家走到赶车人跟前才问」。
    if (!state.cartAsked
      && Distance(r.player.position, E.droverPost) <= E.cartAbandonReachM) {
      state.cartAsked = true;
      r.Say("CartAbandon");
    }

    // 5. 幸存者进沟内遮挡：全部活人都贴着撤离线、且此刻车路方向的追兵谁也看不见他们
    //（沟壁折角切断直射就是这一条的几何依据）。
    if (!state.sheltered) {
      const living = [...column.litters, ...column.walkers].filter(entry => entry.visible && entry.health > 0 && !entry.evacuated);
      state.sheltered = living.length > 0 && living.every(entry =>
        EndProjectOnto(MISSION_ROUTES.evacuation, entry).distance <= E.ditchShelterM
        && !r.Threatens(entry, PURSUIT_IDS));
      if (state.sheltered) r.Record("survivorsSheltered", { survivors: living.length });
    }

    // 6. 担架两端重新有人：走真实的替补流程（民夫真的走过去接手），不是定时器。
    let remanned = state.sheltered;
    for (const litter of column.litters.filter(entry => entry.health > 0 && entry.visible)) {
      const short = column.BearerShort(litter);
      if (litter.state === "fallen" && !short) litter.state = "waiting";
      if (short || litter.state === "fallen") remanned = false;
    }
    const lead = Math.max(0, ...column.litters.filter(entry => entry.health > 0).map(entry => entry.joinProgress || 0));
    if (remanned && zhou.bearers.every(health => health > 0) && !r.Has("litterRemanned")) {
      state.leadAtReman = lead;
      r.Record("litterRemanned", {
        litters: column.litters.filter(entry => entry.health > 0).length,
        replacements: column.replacements,
      });
    }

    // 7. 队首真的开始移动：重新成形**之后**又走出一个担架间距（不是「站在沟里就算」）。
    if (r.Has("litterRemanned") && lead >= (state.leadAtReman ?? 0) + E.columnMovingM)
      r.Record("columnMoving", { lead, since: state.leadAtReman ?? 0 });
  }
  HeadcountTarget() {
    // 何有田喊名字时看着被叫的人；最后两句转向顺子。
    const r = this.runtime, line = this.regroup?.lastLine;
    if (!line) return null;
    if (line.index >= 4) return r.player.position;
    const who = line.index === 0 ? "liuwencai" : "yaowa";
    return r.companion.Handle(who)?.position || null;
  }
  /** 播放器每句发的 Line 事件（运行时转过来）。 */
  OnLine(cueId, detail) {
    if (cueId !== "Headcount" || !this.regroup) return;
    this.regroup.speaking = detail?.who || null;
    this.regroup.lastLine = detail || null;
  }

  // -------------------------------------------------------------------------
  // 15B 换手抬运，沿墙缓行
  // -------------------------------------------------------------------------
  UpdateWallPath(dt) {
    const r = this.runtime, state = this.wall;
    if (!state) return;
    const zhou = r.column.zhou;
    const zhouOn = EndProjectOnto(WALL_PATH, zhou);

    // 1. 后抬手体力不支 → 担架停下等顺子接手（不叫民夫替补：ambushHold 就是那把闸）。
    if (!state.swapOffered && !r.Has("carryHandover") && zhouOn.progress >= E.carrySwapProgressM) {
      state.swapOffered = true;
      zhou.ambushHold = true;
      // Unlike the ordinary one-bearer fallback, this vacant handle is waiting
      // for the player's authored F handoff and must not drift away while the
      // player approaches it.  Keep this separate from the older room-ambush
      // replacement lock so Carry/Dive/rescue retain their existing semantics.
      zhou.scriptedHandoffHold = true;
      zhou.bearers[0] = 0;
      zhou.state = "waiting";
      r.Record("carrySwapOffered", { x: zhou.x, z: zhou.z, progress: zhouOn.progress });
      r.Say("CarrySwap");
    }
    // 顺子接过之后后端就是他：把槽位填回去，解开替补闸。
    if (r.Has("carryHandover") && zhou.ambushHold) {
      zhou.ambushHold = false;
      zhou.scriptedHandoffHold = false;
      zhou.bearers[0] = Math.max(zhou.bearers[0], 75);
    }

    // 2. 过坎：抬着人走到那一处 0.22 m 的坎上。
    const carrying = r.carry?.KindId === "stretcher";
    if (!state.bumpSaid && carrying && Distance(zhou, E.roadBump) <= E.roadBumpReachM) {
      state.bumpSaid = true;
      state.bumpAt = zhouOn.progress;
      r.Record("roadBumpCrossed", { x: E.roadBump.x, z: E.roadBump.z });
      r.Say("RoadBump");
    }
    // 3. 幺娃看见顺子的手（过坎之后再走一段）。
    if (state.bumpSaid && !state.shakeSaid && zhouOn.progress >= state.bumpAt + E.handsShakeAfterBumpM) {
      state.shakeSaid = true;
      r.Say("HandsShake");
    }

    // 4. 无对白行走：手抖那一段说完之后（或者玩家已经走进夹道末段）不再起任何 cue，
    //    量「**一边走一边**静了多久」—— 站着不动不算，那是发呆不是行走。
    const playerOn = EndProjectOnto(WALL_PATH, r.player.position);
    const previousProgress = state.lastProgress ?? playerOn.progress;
    const advancedM = Math.max(0, playerOn.progress - previousProgress);
    state.lastProgress = Math.max(previousProgress, playerOn.progress);
    const quietLeg = state.shakeSaid || playerOn.progress >= E.silenceFromProgressM;
    if (quietLeg && advancedM > 1e-4 && !r.voice.current) {
      state.silent += dt;
      state.silentDistanceM += advancedM;
      if (!state.silenceDone && state.silentDistanceM >= E.silenceWalkM) {
        state.silenceDone = true;
        r.Record("quietWalkObserved", {
          seconds: Number(state.silent.toFixed(2)),
          distanceM: Number(state.silentDistanceM.toFixed(1)),
          toM: Number(playerOn.progress.toFixed(1)),
        });
      }
    } else if (quietLeg && r.voice.current) {
      // “连续无对白”不能把两段被台词隔开的碎片相加冒充。台词一旦起头，
      // 这一扇静默窗口从零重新量；站着不动仍然不会累计。
      state.silent = 0;
      state.silentDistanceM = 0;
    }

    // 5. 掉队的步行伤员与照应他们的人。
    let tended = state.stragglers.length > 0;
    for (const straggler of state.stragglers) {
      straggler.progress = Math.min(WALL_PATH_LENGTH, straggler.progress + dt * E.stragglerWalkMps);
      const at = EndRoutePoint(WALL_PATH, straggler.progress);
      straggler.x = at.x; straggler.z = at.z; straggler.yaw = at.yaw;
      // 照应的人从后头赶上来；赶上了就并排走（并排＝沿路同一里程、横向让开半个身位）。
      const gap = straggler.progress - straggler.tenderProgress;
      const caught = gap <= E.stragglerTendReachM;
      straggler.tenderProgress = caught ? straggler.progress
        : Math.min(straggler.progress, straggler.tenderProgress + dt * E.tenderApproachMps);
      const tenderAt = EndRoutePoint(WALL_PATH, straggler.tenderProgress);
      const side = caught ? E.stragglerLateralM : 0;
      straggler.tenderX = tenderAt.x + Math.cos(tenderAt.yaw) * side;
      straggler.tenderZ = tenderAt.z - Math.sin(tenderAt.yaw) * side;
      straggler.tenderYaw = tenderAt.yaw;
      straggler.tended = Math.hypot(straggler.tenderX - straggler.x, straggler.tenderZ - straggler.z) <= E.stragglerTendReachM;
      if (!straggler.tended) tended = false;
    }
    if (tended && !state.tended) {
      state.tended = true;
      r.Record("stragglersTended", { tended: state.stragglers.length });
    }
  }

  // -------------------------------------------------------------------------
  // 布景
  // -------------------------------------------------------------------------
  Dress(step) {
    const r = this.runtime, dressing = r.dressing;
    if (step === "Regroup" && this.regroup) {
      // 丢下的那辆车与蹲在车边的赶车人。
      const cart = E.droverCart, ground = r.battlefield.GroundHeight(cart.x, cart.z);
      dressing.Prop("cart", cart.x, ground + 1, cart.z, cart.yaw);
      for (const side of [-1, 1]) for (const end of [-1, 1])
        dressing.Prop("wheel", cart.x + Math.cos(cart.yaw) * side * 1.55 - Math.sin(cart.yaw) * end * 1.8,
          ground + 0.49, cart.z - Math.sin(cart.yaw) * side * 1.55 - Math.cos(cart.yaw) * end * 1.8,
          cart.yaw, [1, 1, 1], 0, Math.PI / 2);
      const facing = Distance(r.player.position, E.droverPost) <= E.cartAbandonReachM * 1.6
        ? EndFacing(E.droverPost, r.player.position) : E.droverPost.yaw;
      dressing.Person("TransferDrover", E.droverPost.x, E.droverPost.z, facing, { kind: "civilian" });
    }
    if (step === "WallPath" && this.wall) {
      for (const straggler of this.wall.stragglers) {
        dressing.Person(straggler.id, straggler.x, straggler.z, straggler.yaw, { kind: "wounded", moving: true });
        dressing.Person(straggler.tender, straggler.tenderX, straggler.tenderZ, straggler.tenderYaw,
          { kind: "civilian", moving: true });
      }
    }
  }

  Update(dt, step) {
    if (step === "Regroup") this.UpdateRegroup(dt);
    // WallPath 的步骤边界在夹道折点，连续无对白路段则一直延伸到院门盘问前。
    if (["WallPath", "ReceptionGate"].includes(step)) this.UpdateWallPath(dt);
    this.Dress(step);
  }
  /** 夹道末段正在量连续静默；带路短命令此时应让路，剧情对白仍按正常优先级播放。 */
  QuietWindowActive() {
    if (!this.wall || this.runtime.Has("quietWalkObserved")
      || !["WallPath", "ReceptionGate"].includes(this.runtime.flow.stage.id)) return false;
    const progress = EndProjectOnto(WALL_PATH, this.runtime.player.position).progress;
    return this.wall.shakeSaid && progress >= E.silenceFromProgressM;
  }
  State() {
    return {
      regroup: this.regroup && { sheltered: this.regroup.sheltered, cartAsked: this.regroup.cartAsked },
      wallPath: this.wall && {
        swapOffered: this.wall.swapOffered, bump: this.wall.bumpSaid, shake: this.wall.shakeSaid,
        silentSeconds: Number(this.wall.silent.toFixed(2)),
        silentDistanceM: Number(this.wall.silentDistanceM.toFixed(2)), tended: this.wall.tended,
        stragglers: this.wall.stragglers.map(entry => ({ id: entry.id, tended: !!entry.tended })),
      },
    };
  }
}

export const QUIET_MARCH_PICKETS = PICKET_IDS;
export const QUIET_MARCH_STRAGGLERS = STRAGGLERS;
export const QUIET_MARCH_WALL_LENGTH = WALL_PATH_LENGTH;
