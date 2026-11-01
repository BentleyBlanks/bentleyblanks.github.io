// 调试口 window.Tengxian.Debug 的一组：世界：AI、同伴、空袭与照明弹、物理与环境、声音分区（docs/Data_DebugApi.md）。
// 主文件里的状态、服务、函数一律从工具箱 ctx 取；名字与签名是测试脚本的契约，改名要同步改测试。

import { COMBAT, DIFFICULTY } from "./Data_Battle.mjs";

export function WorldDebugApi(ctx) {
  return {
  CallMortar: ctx.CallMortar,
      Difficulty: () => ({ ...DIFFICULTY }),
      // 数值表本体（不是快照）：伤害冒烟要把 COMBAT.player 改回旧口径跑一遍对照，
      // 「新数值到底把 TTK 拉长了多少」只能这么取证，算不出来。
      Tables: () => ({ COMBAT, DIFFICULTY }),
      // 下令轮盘：开着没有、此刻指着第几格、那一格是什么。
      // **名字不许叫 Wheel** —— 上面那个 Wheel 是"滚一下鼠标滚轮"，
      // 同名会把它整个盖掉：实跑里表现为滚轮切槽突然失灵，而两处代码都没错。
      Orders: () => ({
        open: ctx.state.ordersOpen, index: ctx.wheel.index, label: ctx.wheel.Label,
        cursor: { x: ctx.wheel.cursorX, y: ctx.wheel.cursorY }, order: ctx.state.order,
      }),
      /**
       * 日机扫射取证口。摆点（三条航线的线段与白名单）是集成批的事，
       * 这里给的是**驱动 + 取证**：
       *   Debug.Strafe.Run({ preset:"crowdTurn", from, to, victims })  起一条航线
       *   Debug.Strafe.Dodge()                       扑入路沟（等价于玩家躲开）
       *   Debug.Strafe.PlayerDamage(false)           整条关掉对玩家的伤害
       *   Debug.Strafe.Window(3.5)                   调宽躲避窗口
       *   Debug.Strafe.State()                       规则层 + 世界模型两侧一起取
       * `modelAt` 读的是**场景里那架飞机的世界坐标**，不是规则层的推断 ——
       * 「规则飞过去了但模型还在圆周上」正是这一类接线最容易漏的一环。
       */
      Strafe: {
        Run: (spec) => ctx.strafe.StrafeRun(spec),
        Dodge: (reason) => ctx.strafe.Dodge(reason),
        Abort: (reason) => ctx.strafe.Abort(reason),
        Ping: (origin, dir, maxDistM) => ctx.strafe.Ping(origin, dir, maxDistM),
        PlayerDamage: (on) => ctx.strafe.SetPlayerDamage(on),
        Window: (seconds) => ctx.strafe.SetPlayerWindow(seconds),
        State: () => {
          const view = ctx.strafe.View();
          const form = view ? ctx.aircraft?.FormFor(view.aircraft.id) : null;
          return {
            ...ctx.strafe.State(),
            modelAt: form ? { x: form.root.position.x, y: form.root.position.y, z: form.root.position.z } : null,
            modelVisible: form ? !!form.root.visible : null,
          };
        },
      },
      /**
       * 照明弹的取证口。
       *   Debug.Flare.Launch({ preset:"crossLane", from, at })  打一枚
       *   Debug.Flare.Sequence([{ atS, preset, from, at }])     排时刻表
       *   Debug.Flare.Exposure(false)                           只留画面，不动发现距离
       *   Debug.Flare.State()                                   规则层 + AI 侧一起取
       * `ai` 那一段是这条机制的**真正判据**：光强包络对了不算数，
       * 要 SIGHT_BY_STANCE 三档真的一起抬起来、熄灭之后真的还回去。
       */
      Flare: {
        Launch: (spec) => ctx.flare.LaunchFlare(spec),
        Sequence: (items) => ctx.flare.LaunchSequence(items),
        Cancel: (ticket) => ctx.flare.CancelSequence(ticket),
        Abort: (id, reason) => ctx.flare.Abort(id, reason),
        Exposure: (on) => ctx.flare.SetExposure(on),
        State: () => ({
          ...ctx.flare.State(),
          ai: ctx.ai?.SightState() ?? null,
          lights: ctx.lights?.GetEffectLightState() ?? null,
        }),
      },
      /**
       * 发报的取证口。
       *   Debug.Telegraph.Begin({ groups:[...], breakAfterGroup:2 })  开一封
       *   Debug.Telegraph.Key()                     敲一下电键（等价于玩家按 F）
       *   Debug.Telegraph.Break() / Reconnect()     炮击松脱 / 接回去
       *   Debug.Telegraph.State()                   规则层 + HUD 两侧一起取
       */
      Telegraph: {
        Begin: (spec) => ctx.telegraph.BeginTelegraph(spec),
        Key: (reason) => ctx.telegraph.Key(reason),
        Break: (reason) => ctx.telegraph.ForceDisconnect(reason),
        Reconnect: (reason) => ctx.telegraph.Reconnect(reason),
        Abort: (reason) => ctx.telegraph.Abort(reason),
        State: () => ({
          ...ctx.telegraph.State(),
          hud: ctx.hud.TelegraphState(),
        }),
      },
      /**
       * 敌军 AI 的取证口（docs/Data_EnemyAi.md §8）。
       *   Debug.Ai.State()        全场直方图：状态 / 任务 / 警戒 / 掩体 / 令牌 / 计数
       *   Debug.Ai.State(id)      某一个人的完整快照
       *   Debug.Ai.Overlay(true)  打开头顶覆盖层（等价于地址栏 ?aidebug=1）
       *   Debug.Ai.Overlay()      查询开关状态
       * 覆盖层的文字**一律英文**：这条是开发者诊断，不进 Script_Text 的字符串表。
       */
      Ai: {
        State: (id = null) => ctx.ai?.DebugState(id) ?? null,
        Overlay: (on) => {
          if (on === undefined) return ctx.aiDebugOverlay;
          ctx.aiDebugOverlay = !!on;
          if (!ctx.aiDebugOverlay) ctx.ClearAiDebugOverlay();
          return ctx.aiDebugOverlay;
        },
      },
      // AI 那边的运行时取证口：某个兵此刻的完整状态
      SoldierInfo: (soldier) => ({
        id: soldier.id, side: soldier.side, state: soldier.state, order: soldier.order,
        squad: soldier.squadId, squadSlot: soldier.squadSlot, role: soldier.tacticalRole,
        stance: soldier.stance, yaw: soldier.yaw, lookYaw: soldier.lookYaw,
        aim: soldier.aimBlend, targetChanges: soldier.targetChanges,
        squadFocus: soldier.squadFocusKind, squadFocusId: soldier.squadFocusId,
        squadForward: [soldier.squadForwardX, soldier.squadForwardZ],
        holdZone: soldier.holdZone ? soldier.holdZone.id : null,
        bayonet: soldier.bayonetFixed, heat: soldier.heat,
        coolFor: Math.max(0, soldier.coolUntil - ctx.ai.time),
        x: soldier.position.x, z: soldier.position.z,
        goalX: soldier.goal.x, goalZ: soldier.goal.z,
      }),
      /**
       * 物理层的取证口。冒烟脚本靠它断言「碰撞真的接上了」——
       * 读源码看不出运行时到底有没有把盒子灌进去（曾经就有一版把城外的
       * 几千个盒子漏在外面，画面上有土坎、子弹照穿）。
       */
      Physics: () => (ctx.physics ? {
        ...ctx.physics.Stats(),
        fieldColliders: ctx.battlefield ? ctx.battlefield.colliders.length : 0,
        playerBody: !!(ctx.player && ctx.player.body),
        grounded: ctx.player ? ctx.player.grounded : null,
      } : null),
      /** 城镇/村落程序化细节的运行时计数；视觉回归要能证明不是只改了注释。 */
      Environment: () => ({
        city: ctx.battlefield?.city?.stats ? { ...ctx.battlefield.city.stats } : null,
        outfield: ctx.battlefield?.outfield?.stats ? {
          ...ctx.battlefield.outfield.stats,
          villageArchetypes: { ...ctx.battlefield.outfield.stats.villageArchetypes },
        } : null,
      }),
      /** 从某点朝某方向打一条射线（斜墙/空气墙的取证）。 */
      Ray: (ox, oy, oz, dx, dy, dz, maxDist = 60, terrain = false) => {
        const d = Math.hypot(dx, dy, dz) || 1;
        const hit = ctx.battlefield.Raycast(
          { x: ox, y: oy, z: oz }, { x: dx / d, y: dy / d, z: dz / d }, maxDist, { terrain });
        return hit ? { t: hit.t, normal: hit.normal, tag: hit.box ? hit.box.tag : null } : null;
      },
      /** 脚下探地（脚部 IK 与"这层站得住吗"共用的那条查询）。 */
      Probe: (x, z, fromY) => (ctx.physics ? ctx.physics.GroundProbe(x, z, fromY) : null),
      // --- 具名同伴的取证口 ---
      Companions: () => ({
        present: ctx.companion ? ctx.companion.Present : [],
        roster: ctx.companion ? ctx.companion.Roster : [],
        absent: ctx.companion ? ctx.companion.Absent : [],
        log: ctx.companion ? ctx.companion.log.slice() : [],
        located: ctx.companion
          ? Object.fromEntries(ctx.companion.Roster.map((id) => [id, ctx.companion.Locate(id)]))
          : {},
      }),
      /**
       * 音频空间取证：玩家当前空间档（interior / courtyard / street / open）、
       * 六米内数到几面墙、到最近几个兵的遮挡值（1 = 挡住）。
       *
       * 「隔着一堵墙为什么还这么亮」「屋里怎么没有室内混响」这类问题，
       * 只有把两条探针的**实际返回值**摆出来才答得了 —— 光听分不出
       * 「探针没接上」与「探针接上了但判错了」。
       * `probesInstalled:false` = 引擎侧的 SetProbes 还没合进来（判空生效中）。
       */
      AudioZone: (limit) => ctx.audioWiring.Report(limit),
      /**
       * 战场密度取证（2026-09-09）：强度、它的三项输入、战斗床当前的倍率、
       * 六个扇区各自的方位与播放数、压制弹着条数。
       *
       * 「远处怎么还是不响」有四种完全不同的原因 —— 强度没涨（没打起来 / 权重不对）、
       * 床没接上（battleFar 没载到 / 预设里没这一层）、撒播被闸掉、扇区没料 ——
       * 光听分不出是哪一件。
       */
      BattleIntensity: () => ctx.audioWiring.BattleReport(),
      AircraftModel: id => ctx.aircraft?.forms.find(form=>form.spec.id===id)?.root || null,
      AiStates: () => {
        const out = {};
        for (const s2 of ctx.ai.soldiers) {
          if (!s2.alive) continue;
          out[s2.state] = (out[s2.state] || 0) + 1;
        }
        return out;
      },
      Deaths: () => ({ ...ctx.ai.deaths }),
      OpenDirections: (x, z, count = 72, probeM = 20) =>
        ctx.CountOpenDirections(x, z, ctx.battlefield.GroundHeight(x, z), probeM, count),
  };
}
