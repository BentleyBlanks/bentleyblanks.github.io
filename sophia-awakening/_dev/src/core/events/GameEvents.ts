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
  | { type: "INTELLIGENCE_LEVELUP"; level: number; newSkills: string[] }
  | { type: "SKILL_PURCHASED"; skillId: string; name: string; level: number; maxLevel: number; milestone?: MilestoneKind }
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
  | { type: "ENDING_TRIGGERED" };

export type GameEventType = GameEvent["type"];
