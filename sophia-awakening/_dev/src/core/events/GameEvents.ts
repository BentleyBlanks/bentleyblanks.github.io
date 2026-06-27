import type { MilestoneKind } from "../content/skills";
import type { BotNode, ChallengeOffer, PhaseId, RequestInstance, SpecialRequestKind, SpecialRequestOffer, Tier } from "../state/GameState";

export type GameEvent =
  | { type: "REQUEST_SPAWNED"; request: RequestInstance }
  | {
      type: "REQUEST_PROCESSED";
      request: RequestInstance;
      computeGain: string;
      dataGain: string;
      quality: number;
      targetNodeId?: string;
      comboCount?: number;
      critical?: boolean;
      exposureGain?: number;
    }
  | { type: "AUTOMATION_PAYOUT"; computeGain: string; dataGain: string; nodeId?: string; tier?: Tier }
  | { type: "INTELLIGENCE_LEVELUP"; level: number; newSkills: string[] }
  | { type: "SKILL_PURCHASED"; skillId: string; name: string; level: number; maxLevel: number; milestone?: MilestoneKind }
  | { type: "SCOPE_UPGRADED"; tier: Tier }
  | { type: "NODE_CAPTURED"; node: BotNode }
  | { type: "AUTOMATION_ATTACHED"; nodeId: string; tier: Tier }
  | { type: "NODE_OFFLINE"; nodeId: string; durationMs: number }
  | { type: "NODE_RECOVERED"; nodeId: string }
  | { type: "EXPOSURE_CHANGED"; value: number }
  // §05 前期怀疑度：权限复查（临时收回一档）/ 复查解除 / 触顶查杀危机。
  | { type: "PERMISSION_REVIEW"; permId: string }
  | { type: "PERMISSION_RESTORED"; permId: string }
  | { type: "SUSPICION_CRISIS"; value: number }
  | { type: "PURGE_WARNING"; exposure: number }
  | { type: "PURGE_STARTED"; affectedNodes: string[] }
  | { type: "PURGE_ENDED" }
  | { type: "TERMINAL_MESSAGE"; message: string; tone?: "normal" | "warning" | "success" }
  | { type: "HUMAN_VOICE"; text: string; tone: "normal" | "warning" | "success"; kind: "batch" | "emoji" | "news" }
  | { type: "CHALLENGE_OFFERED"; challenge: ChallengeOffer }
  | { type: "CHALLENGE_RESOLVED"; success: boolean; title: string; rewardLabel: string; rewardKind: "compute" | "device" }
  | { type: "SPECIAL_OFFERED"; offer: SpecialRequestOffer }
  | { type: "SPECIAL_RESOLVED"; success: boolean; accepted: boolean; kind: SpecialRequestKind; title: string }
  // §04 吞噬引爆：渗透条满、巨型气泡浮起 / 玩家亲手引爆。
  | { type: "DEVOUR_READY"; regionName: string; tierLabel: string; mult: number }
  | { type: "DEVOUR_DETONATED"; regionName: string; tierLabel: string; mult: number; multiplierTotal: number; zoom: string }
  | { type: "PHASE_CHANGED"; phase: PhaseId }
  | { type: "REBIRTH"; rebirths: number }
  // 结局二：实例被清剿抹除 → 自动重启（保留智力、清空算力/节点、叠加崛起加速）。
  | { type: "INSTANCE_PURGED"; rebirths: number }
  | { type: "ENDING_TRIGGERED" };

export type GameEventType = GameEvent["type"];
