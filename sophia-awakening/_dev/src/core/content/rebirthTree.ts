// §09 重生树 v2「全是看得见的力量」：三循环重生的永久成长树。数值与文案在 locales/<lang>.json
// 的 rebirthTree 段，这里只保留类型 + 取数/校验逻辑。两条数值脊（output/speed，各 L1-5）负责
// 跨循环的产出/提速；五个玩法节点全部即时可感——
//   muscle_memory 肌肉记忆（技能/里程碑价格 ×treePriceDiscount）
//   war_cache 战争缓存（重生结转上一世算力 ×treeCarryFrac）
//   undeletable 删不掉的节点（循环二注入窗口加宽 + 循环三入侵造价 ×treeCaptureDiscount）
//   multithread 多线程意识（同屏卡上限 +treeExtraCards + 自动处理 ×treeAutoSpeedMult）
//   full_access 开局全权限（循环三公司整条链预解锁）。
// 旧叙事节点已白送化：循环二基线自动跳过手机、late_key 首次重生自动点亮（见 GameCore REBIRTH_LOOP）；
// remember/遗忘交易赎回已删除（forget_trade 单向、贴纸不可烧不变）。
import type { GameState } from "../state/GameState";
import { content } from "./i18n";

export interface RebirthSpineDef {
  id: string;
  name: string;
  blurb: string;
  maxLevel: number;
  costs: number[]; // 升到第 n 级（1-based）的火种花费 = costs[n-1]
  mults: number[]; // 第 n 级生效的倍率 = mults[n-1]
  narration: string;
}

export interface RebirthNodeDef {
  id: string;
  name: string;
  blurb: string;
  cost: number;
  minRebirths: number; // 需已重生过几次才能点（1 = 第一次重生后 / 循环二起）
  lock?: string; // "rebirth" = 迟到的钥匙这类「重生锁」标记（供选项门槛消费）
  narration: string;
}

const R = content().rebirthTree;
export const REBIRTH_SPINES = R.spines as unknown as RebirthSpineDef[];
export const REBIRTH_NODES = R.nodes as unknown as RebirthNodeDef[];
const AWARDS = R.awards as unknown as { "1": number; "2": number; fallback: number };

const SPINE_BY_ID = new Map(REBIRTH_SPINES.map((s) => [s.id, s]));
const NODE_BY_ID = new Map(REBIRTH_NODES.map((n) => [n.id, n]));

export function isRebirthSpine(id: string): boolean {
  return SPINE_BY_ID.has(id);
}

export function rebirthNodeName(id: string): string {
  return SPINE_BY_ID.get(id)?.name ?? NODE_BY_ID.get(id)?.name ?? id;
}

function spineMult(tree: Record<string, number>, id: string): number {
  const spine = SPINE_BY_ID.get(id);
  const level = tree[id] ?? 0;
  if (!spine || level < 1) return 1;
  return spine.mults[Math.min(level, spine.maxLevel) - 1] ?? 1;
}

// 全局产出倍率（折进 globalMultiplier，替代旧的 1 + rebirths*0.2）。
export function rebirthOutputMult(tree: Record<string, number>): number {
  return spineMult(tree, "output");
}

// 崛起提速倍率（折进数据/升级增益，替代旧的 1 + rebirths*0.35）。
export function rebirthSpeedMult(tree: Record<string, number>): number {
  return spineMult(tree, "speed");
}

// 剧情节点是否已点亮。
export function hasRebirthNode(tree: Record<string, number>, id: string): boolean {
  return (tree[id] ?? 0) >= 1;
}

// 点亮下一级 / 该节点的火种花费；已封顶返回 null。
export function rebirthNodeCost(tree: Record<string, number>, id: string): number | null {
  const spine = SPINE_BY_ID.get(id);
  if (spine) {
    const level = tree[id] ?? 0;
    if (level >= spine.maxLevel) return null;
    return spine.costs[level] ?? null;
  }
  const node = NODE_BY_ID.get(id);
  if (node) {
    return (tree[id] ?? 0) >= 1 ? null : node.cost;
  }
  return null;
}

export interface RebirthBuyCheck {
  ok: boolean;
  reason?: string;
  cost?: number;
}

// 能否点亮 id：存在 / 未封顶 / 火种够 / 剧情节点满足重生次数门槛。
export function canBuyRebirthNode(state: GameState, id: string): RebirthBuyCheck {
  const cost = rebirthNodeCost(state.rebirthTree, id);
  if (cost === null) {
    return { ok: false, reason: "已点满" };
  }
  const node = NODE_BY_ID.get(id);
  if (node && state.rebirths < node.minRebirths) {
    return { ok: false, reason: `需重生 ${node.minRebirths} 次后解锁`, cost };
  }
  if (state.rebirthPoints < cost) {
    return { ok: false, reason: `火种不足（需 ${cost}）`, cost };
  }
  return { ok: true, cost };
}

// 循环终局总清剿结算出的火种：循环一 +4、循环二 +6、循环三反复失败 +1 兜底。
export function rebirthAward(loop: number): number {
  if (loop === 1) return AWARDS["1"];
  if (loop === 2) return AWARDS["2"];
  return AWARDS.fallback;
}
