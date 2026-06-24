// ---------------------------------------------------------------------------
// Shared data-layer types. Per design §A.9 the data model is kept separate
// from the Pixi view objects.
// ---------------------------------------------------------------------------

/** Card tiers (§3) plus the "polluted" contamination layer. */
export type Tier = 'invalid' | 'normal' | 'high' | 'risk' | 'polluted';

/** The four furnace mouths (§2 AIChatBox 四区). */
export type SlotKind = 'valid' | 'invalid' | 'risk' | 'quarantine';

/** Static definition for a card tier (§3 + §6.3 fragility). */
export interface TierDef {
  tier: Tier;
  label: string;
  /** base 算力 at S1 (§3). */
  base: number;
  /** digest seconds in the furnace (§3). */
  digest: number;
  /** mouth this tier should be routed to (§3). */
  correctSlot: SlotKind;
  /** hallucination fragility coefficient (§6.3). */
  fragility: number;
  /** primary tint (hex). */
  color: number;
}

/** A spawned, in-flight card instance (the CardModel of §A.9). */
export interface CardModel {
  id: number;
  tier: Tier;
  appId: string;
  appEmoji: string;
  /** the text printed on the card face. */
  text: string;
  /** the (possibly hallucinated) text shown when contaminated. */
  glitchText: string;
  /** has this card already rolled a hallucination → became a 故障卡. */
  glitched: boolean;
  /** depth multiplier baked in at spawn (页面深度倍率, §3). */
  depthMul: number;
  /** app coefficient (App系数, §3). */
  appMul: number;
}

/** Definition for a buyable producer / auto-agent (§7). */
export interface ProducerDef {
  id: string;
  name: string;
  emoji: string;
  baseCost: number;
  /** what the producer does each tick. */
  desc: string;
}

/** Definition for a sticker-board upgrade (§6.2 / §5). */
export interface UpgradeDef {
  id: string;
  name: string;
  emoji: string;
  baseCost: number;
  maxLevel: number;
  costMul: number;
  desc: string;
}
