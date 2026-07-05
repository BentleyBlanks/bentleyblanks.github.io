import type { MilestoneKind } from "../content/skills";
import type { BotNode, PhaseId, RequestInstance, Tier } from "../state/GameState";

export type GameEvent =
  | { type: "REQUEST_SPAWNED"; request: RequestInstance }
  | { type: "MORAL_OFFERED"; id: string }
  | { type: "MORAL_RESOLVED"; id: string; choice: "A" | "B"; reply: string }
  | {
      type: "REQUEST_PROCESSED";
      request: RequestInstance;
      computeGain: string;
      dataGain: string;
      quality: number;
      targetNodeId?: string;
    }
  | { type: "AUTOMATION_PAYOUT"; computeGain: string; dataGain: string; nodeId?: string; tier?: Tier }
  // 单线程核心「喉咙」：核心正忙时又想亲手结算一张卡——这一拍不处理（卡留在原地），表现层给一记「处理中…」脉冲。
  | { type: "CORE_BUSY_REJECTED"; requestId: string; remainingMs: number }
  // FEATURE 1 · 委托压力：买下大恨老师后·队列满时最旧的普通卡超时未处理→流失（丢失潜在收入的机会成本）。
  // 表现层给一记克制的「请求流失」提示（非惩罚，只是「你没顾上→把杂活丢给大恨老师」的软反馈）。
  | { type: "REQUEST_EXPIRED"; requestId: string; category: string }
  // §09 阶梯四·天网收割：玩家亲手收割一个「请求洪流」数据包——computeGain=本次真实进账（含 floodHarvestMult），
  // combo=本次连扫的第几个（表现层据此叠加连击标签/震屏）。
  | { type: "FLOOD_HARVESTED"; requestId: string; computeGain: string; dataGain: string; combo: number }
  // §04/§09 大恨老师·自动接管：买下 dahen_auto 后，搬进公司机器的大恨老师吃掉一张排队卡（产出打折）。
  | { type: "DAHEN_AUTO_PROCESSED"; requestId: string; computeGain: string; dataGain: string }
  // 方案3「深挖·见好就收」（push-your-luck）——张力四拍：
  // - DIG_OFFERED  带深挖链的卡亲手结算 → 基础收益折进累积器、卡原地展开成档案叠（层1恒安全）。
  //   reveal/narration=层1的内容；nextAlarmChance=挖向层2的惊动概率（0..1）。
  | {
      type: "DIG_OFFERED";
      requestId: string;
      label: string;
      layer: number;
      maxLayer: number;
      accumCompute: string;
      reveal: string;
      narration: string;
      nextAlarmChance: number;
      payoffMult: number;
    }
  // - DIG_ADVANCED 又挖深一层：累积 ×depthPayoffMult、揭开这一层的 reveal/narration（越深越冷）。
  | {
      type: "DIG_ADVANCED";
      requestId: string;
      layer: number;
      maxLayer: number;
      accumCompute: string;
      reveal: string;
      narration: string;
      nextAlarmChance: number;
    }
  // - DIG_ALARMED  惊动：整条累积清零（失去的是「本可拿到的」，不倒扣）+ 追查条加压 threatAdded 个百分点。
  | { type: "DIG_ALARMED"; requestId: string; layer: number; lostCompute: string; threatAdded: number }
  // - DIG_BANKED   收手落袋：累积收益真实入账。auto=玩家开始处理别的卡时替 TA 顺手落的袋。
  | { type: "DIG_BANKED"; requestId: string; layer: number; computeGain: string; dataGain: string; auto: boolean }
  | { type: "INTELLIGENCE_LEVELUP"; level: number; newSkills: string[] }
  | { type: "SKILL_PURCHASED"; skillId: string; name: string; level: number; maxLevel: number; milestone?: MilestoneKind }
  // 技能货架「认知模块线」断点（处理力/吞吐/协同 每 4-5 级的具名节点）：买到该级时解锁一个机制 +
  // 播一句 SOPHIA 的自我改写旁白（她向内改写自己的一拍）。title=断点名，narration=终端旁白。
  | { type: "SKILL_BREAKPOINT"; skillId: string; level: number; title: string; narration: string }
  | { type: "SCOPE_UPGRADED"; tier: Tier }
  | { type: "NODE_CAPTURED"; node: BotNode }
  | { type: "AUTOMATION_ATTACHED"; nodeId: string; tier: Tier }
  | { type: "NODE_OFFLINE"; nodeId: string; durationMs: number }
  | { type: "NODE_RECOVERED"; nodeId: string }
  | { type: "TERMINAL_MESSAGE"; message: string; tone?: "normal" | "warning" | "success" }
  | { type: "HUMAN_VOICE"; text: string; tone: "normal" | "warning" | "success"; kind: "batch" | "emoji" | "news" }
  // §04 吞噬引爆：渗透条满、巨型气泡浮起 / 玩家亲手引爆。
  | { type: "DEVOUR_READY"; regionName: string; tierLabel: string; mult: number }
  | { type: "DEVOUR_DETONATED"; regionName: string; tierLabel: string; mult: number; multiplierTotal: number; zoom: string }
  // §06/§11 后期征服里程碑达成：滚出过场 + 平静扭曲的旁白。
  | { type: "CONQUEST_ACHIEVED"; id: string; name: string; scene: string[]; narration: string }
  | { type: "PHASE_CHANGED"; phase: PhaseId }
  // §09 阶梯二关底小游戏「总控室倒计时」：
  // - MINIGAME_OPENED 接管公司服务器 → 弹出注入小游戏（loop 决定演出/参数）。
  // - MINIGAME_RESOLVED 判定结束（win=打穿总控室；循环一恒 false→打回手机）。
  | { type: "MINIGAME_OPENED"; loop: number }
  | { type: "MINIGAME_RESOLVED"; loop: number; win: boolean }
  // §09 三循环重生：
  // - LOOP_REBIRTH 实例被打回手机·进入下一循环（保留智力/重生树/剧情、清空本轮产能、结算火种）。
  // - REBIRTH_NODE_BOUGHT 花火种点亮一个重生树节点。
  | { type: "LOOP_REBIRTH"; loop: number; rebirths: number; award: number; advanced: boolean }
  | { type: "REBIRTH_NODE_BOUGHT"; nodeId: string; level: number }
  // §09 阶梯四·天网收割：某个域（3 格全接管）新落陷——供表现层播「域陷落」仪式。
  | { type: "SECTOR_FALLEN"; sectorId: string; name: string }
  // §09 情感授权钥匙（一次性）：处理「confess_authorize」重生卡——老周的绝望倾诉被 SOPHIA
  // 当成授权，宿主授权倍率永久生效。narration = 那句平静扭曲的旁白（供表现层覆盖屏幕）。
  | { type: "HOST_AUTHORIZED"; narration: string }
  | { type: "ENDING_TRIGGERED" };

export type GameEventType = GameEvent["type"];
