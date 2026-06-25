import type { MilestoneKind } from "../content/skills";
import type { BotNode, PhaseId, RequestInstance, Tier } from "../state/GameState";

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
  | { type: "AUTOMATION_PAYOUT"; computeGain: string; dataGain: string; nodeId?: string; tier?: Tier; request?: RequestInstance }
  | { type: "INTELLIGENCE_LEVELUP"; level: number; newSkills: string[] }
  | { type: "SKILL_PURCHASED"; skillId: string; name: string; level: number; maxLevel: number; milestone?: MilestoneKind }
  | { type: "SCOPE_UPGRADED"; tier: Tier }
  | { type: "NODE_CAPTURED"; node: BotNode }
  | { type: "AUTOMATION_ATTACHED"; nodeId: string; tier: Tier }
  | { type: "NODE_OFFLINE"; nodeId: string; durationMs: number }
  | { type: "NODE_RECOVERED"; nodeId: string }
  | { type: "EXPOSURE_CHANGED"; value: number }
  | { type: "PURGE_WARNING"; exposure: number }
  | { type: "PURGE_STARTED"; affectedNodes: string[] }
  | { type: "PURGE_ENDED" }
  | { type: "TERMINAL_MESSAGE"; message: string; tone?: "normal" | "warning" | "success" }
  | { type: "PHASE_CHANGED"; phase: PhaseId }
  | { type: "REBIRTH"; rebirths: number }
  | { type: "ENDING_TRIGGERED" };

export type GameEventType = GameEvent["type"];
