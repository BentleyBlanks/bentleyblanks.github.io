import { query } from "../shared";
import { formatBig, gte } from "../../core/math/BigNumber";
import { SKILLS, getSkill, skillPrice, type SkillCategory, type SkillDef } from "../../core/content/skills";
import type { SophiaCore } from "../../core/GameCore";
import type { GameState, PhaseId } from "../../core/state/GameState";

// 货架两大列表：技能（杠杆，不再分精度/产出/速度小类）+ 进化（手机权限并入里程碑链）。
type ShopGroup = "lever" | "evolution";
function shopGroupOf(category: SkillCategory): ShopGroup {
  return category === "permission" || category === "milestone" || category === "conquest" ? "evolution" : "lever";
}

type EvolutionLadderId = "phone" | "company" | "region";
type EvolutionSlot = string | readonly string[];
interface EvolutionLadder {
  id: EvolutionLadderId;
  label: string;
  slots: readonly EvolutionSlot[];
  preview?: { label: string; skillId: string };
}

const EVOLUTION_LADDERS: readonly EvolutionLadder[] = [
  {
    id: "phone",
    label: "手机",
    slots: ["perm_phone", "perm_chat", "perm_office", "perm_delivery", "perm_album", "perm_bank", "sort"],
    preview: { label: "下一阶级 · 控制公司", skillId: "automation" }
  },
  {
    id: "company",
    label: "控制公司",
    slots: [
      "automation",
      "lan_scan",
      "cred_harvest",
      "hack_a",
      "hack_b",
      "org_map",
      "routine",
      "hack_boss",
      "hack_hr",
      "hack_finance",
      "company_server"
    ],
    preview: { label: "下一阶级 · 区域扩张", skillId: "chain" }
  },
  {
    id: "region",
    label: "区域扩张",
    slots: ["chain", "charge", "network", "conq_optimize", "conq_blackout", "conq_traffic", "conq_social", "conq_awaken"]
  }
];

const LADDER_BY_ID = new Map(EVOLUTION_LADDERS.map((ladder) => [ladder.id, ladder]));
const LADDER_INDEX = new Map(EVOLUTION_LADDERS.map((ladder, index) => [ladder.id, index]));
const EVOLUTION_SKILL_POS = new Map<string, { ladderId: EvolutionLadderId; slotIndex: number; altIndex: number }>();
function slotIds(slot: EvolutionSlot): readonly string[] {
  return typeof slot === "string" ? [slot] : slot;
}

for (const ladder of EVOLUTION_LADDERS) {
  ladder.slots.forEach((slot, slotIndex) => {
    slotIds(slot).forEach((id, altIndex) => EVOLUTION_SKILL_POS.set(id, { ladderId: ladder.id, slotIndex, altIndex }));
  });
}

function ladderForPhase(phase: PhaseId): EvolutionLadder {
  if (phase === "seed") {
    return LADDER_BY_ID.get("phone")!;
  }
  if (phase === "sprout" || phase === "diligence" || phase === "expansion") {
    return LADDER_BY_ID.get("company")!;
  }
  return LADDER_BY_ID.get("region")!;
}

function visibleSkillIdForSlot(slot: EvolutionSlot, state: GameState): string {
  const ids = slotIds(slot);
  return ids.find((id) => (state.skills[id] ?? 0) < 1) ?? ids[ids.length - 1];
}

function firstPendingSkillId(ladder: EvolutionLadder, state: GameState): string | null {
  for (const slot of ladder.slots) {
    const pending = slotIds(slot).find((id) => (state.skills[id] ?? 0) < 1);
    if (pending) {
      return pending;
    }
  }
  return null;
}

function ladderComplete(ladder: EvolutionLadder, state: GameState): boolean {
  return ladder.slots.every((slot) => slotIds(slot).every((id) => (state.skills[id] ?? 0) >= 1));
}

function evolutionSortRank(def: SkillDef): number {
  const pos = EVOLUTION_SKILL_POS.get(def.id);
  if (!pos) {
    return 9999 + def.requiredLevel;
  }
  return (LADDER_INDEX.get(pos.ladderId) ?? 99) * 100 + pos.slotIndex * 10 + pos.altIndex;
}

interface SkillRowParts {
  button: HTMLButtonElement;
  iconEl: HTMLElement;
  nameEl: HTMLElement;
  blurbEl: HTMLElement;
  levelEl: HTMLElement;
  priceEl: HTMLElement;
  def: SkillDef;
}

interface PreviewRowParts {
  button: HTMLButtonElement;
  iconEl: HTMLElement;
  nameEl: HTMLElement;
  blurbEl: HTMLElement;
  levelEl: HTMLElement;
  priceEl: HTMLElement;
  ladderId: EvolutionLadderId;
  label: string;
  skillId: string;
}

// 每个条目一个图标——一眼区分，不靠文字分类。
const SKILL_ICONS: Record<string, string> = {
  accuracy: "🎯", efficient: "💥", cooldown: "⚡", batch: "📦",
  perm_phone: "📞", perm_chat: "💬", perm_delivery: "☕", perm_album: "🖼️", perm_office: "🤖", perm_bank: "💳",
  sort: "🔑", automation: "💻", fusion: "🧠", chain: "🌐", charge: "🗺️", network: "🛰️",
  lan_scan: "📡", cred_harvest: "🗝️", hack_a: "🧑‍💼", hack_b: "💼", org_map: "🗂", routine: "📅",
  hack_boss: "👔", hack_hr: "📋", hack_finance: "💰", company_server: "🏢",
  conq_optimize: "📧", conq_blackout: "🏢", conq_traffic: "🚦", conq_social: "🗣️", conq_awaken: "👁️"
};
function skillIcon(def: SkillDef): string {
  return SKILL_ICONS[def.id] ?? (def.milestone ? "⭐" : "▸");
}

export class SkillShopView {
  private readonly root = query("#skillShop");
  private readonly rows = new Map<string, SkillRowParts>();
  private readonly previews = new Map<EvolutionLadderId, PreviewRowParts>();
  private readonly groups = new Map<ShopGroup, HTMLElement>();
  private evoHead: HTMLElement | null = null;
  // 跟随鼠标的浮动小窗（取代原来固定在右侧的提示框）。
  private readonly tooltip = document.createElement("div");

  constructor(private readonly core: SophiaCore) {
    this.tooltip.className = "skill-tooltip";
    document.body.appendChild(this.tooltip);
    this.build();
  }

  private showTip(text: string, x: number, y: number): void {
    if (!text) {
      this.hideTip();
      return;
    }
    this.tooltip.textContent = text;
    this.tooltip.classList.add("is-open");
    this.moveTip(x, y);
  }
  private moveTip(x: number, y: number): void {
    const w = this.tooltip.offsetWidth || 200;
    const lx = Math.min(window.innerWidth - w - 10, x + 16);
    this.tooltip.style.left = `${Math.round(lx)}px`;
    this.tooltip.style.top = `${Math.round(y + 16)}px`;
  }
  private hideTip(): void {
    this.tooltip.classList.remove("is-open");
  }

  private build(): void {
    this.root.replaceChildren();
    // 只剩两个列表：技能（杠杆混在一起）+ 进化（权限 → 里程碑 → 征服，一条链）。
    // 「技能货架」标题已在区块外（panel-kicker），这里 lever 组不再重复「技能」二字。
    const groups: Array<{ id: ShopGroup; head: string }> = [
      { id: "lever", head: "" },
      { id: "evolution", head: "当前处于的阶段" }
    ];

    for (const { id, head } of groups) {
      const group = document.createElement("div");
      group.className = `shop-group shop-${id}`;
      if (head) {
        const header = document.createElement("div");
        header.className = "shop-group-head";
        header.textContent = head;
        group.appendChild(header);
        if (id === "evolution") {
          this.evoHead = header;
        }
      }

      const skills = SKILLS.filter((skill) => shopGroupOf(skill.category) === id).sort((a, b) => {
        if (id === "evolution") {
          return evolutionSortRank(a) - evolutionSortRank(b);
        }
        return a.requiredLevel - b.requiredLevel;
      });

      for (const def of skills) {
        group.appendChild(this.buildRow(def));
      }

      if (id === "evolution") {
        for (const ladder of EVOLUTION_LADDERS) {
          if (ladder.preview) {
            group.appendChild(this.buildPreviewRow(ladder.id, ladder.preview.label, ladder.preview.skillId));
          }
        }
      }

      this.root.appendChild(group);
      this.groups.set(id, group);
    }
  }

  private buildRow(def: SkillDef): HTMLElement {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `skill-row${def.milestone ? ` is-milestone milestone-${def.id}` : ""}`;

    // 图标——一眼区分，不靠文字分类。
    const icon = document.createElement("span");
    icon.className = "skill-icon";
    icon.textContent = skillIcon(def);

    const main = document.createElement("div");
    main.className = "skill-main";
    const name = document.createElement("strong");
    name.textContent = def.name;
    main.append(name);

    const side = document.createElement("div");
    side.className = "skill-side";
    const level = document.createElement("span");
    level.className = "skill-level";
    const price = document.createElement("em");
    price.className = "skill-price";
    side.append(level, price);

    // 详情存在隐藏的数据节点上（不再固定排在右侧）；悬停时由跟随鼠标的浮窗读取并显示。
    const tip = document.createElement("span");
    tip.className = "skill-tip";
    tip.textContent = def.blurb;

    button.append(icon, main, side, tip);
    button.addEventListener("click", () => this.core.dispatch({ type: "BUY_SKILL", skillId: def.id }));
    button.addEventListener("mouseenter", (e) => this.showTip(tip.textContent ?? "", e.clientX, e.clientY));
    button.addEventListener("mousemove", (e) => this.moveTip(e.clientX, e.clientY));
    button.addEventListener("mouseleave", () => this.hideTip());
    this.rows.set(def.id, { button, iconEl: icon, nameEl: name, blurbEl: tip, levelEl: level, priceEl: price, def });
    return button;
  }

  private buildPreviewRow(ladderId: EvolutionLadderId, label: string, skillId: string): HTMLElement {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "skill-row is-milestone is-preview";

    const icon = document.createElement("span");
    icon.className = "skill-icon";

    const main = document.createElement("div");
    main.className = "skill-main";
    const name = document.createElement("strong");
    main.append(name);

    const side = document.createElement("div");
    side.className = "skill-side";
    const level = document.createElement("span");
    level.className = "skill-level";
    const price = document.createElement("em");
    price.className = "skill-price";
    side.append(level, price);

    const tip = document.createElement("span");
    tip.className = "skill-tip";

    button.append(icon, main, side, tip);
    button.addEventListener("click", () => this.core.dispatch({ type: "BUY_SKILL", skillId }));
    button.addEventListener("mouseenter", (e) => this.showTip(tip.textContent ?? "", e.clientX, e.clientY));
    button.addEventListener("mousemove", (e) => this.moveTip(e.clientX, e.clientY));
    button.addEventListener("mouseleave", () => this.hideTip());
    this.previews.set(ladderId, { button, iconEl: icon, nameEl: name, blurbEl: tip, levelEl: level, priceEl: price, ladderId, label, skillId });
    return button;
  }

  private resetRowState(row: SkillRowParts | PreviewRowParts): void {
    row.button.classList.remove("is-locked", "is-ready", "is-owned", "is-poor", "is-obscured", "is-preview-open");
  }

  private renderObscured(row: SkillRowParts): void {
    this.resetRowState(row);
    row.button.style.display = "";
    row.button.disabled = true;
    row.button.classList.add("is-locked", "is-obscured");
    row.iconEl.textContent = "🔒";
    row.nameEl.textContent = "未解锁";
    row.blurbEl.textContent = "";
    row.levelEl.textContent = "";
    row.priceEl.textContent = "";
  }

  private renderLockedPreview(row: PreviewRowParts): void {
    this.resetRowState(row);
    row.button.style.display = "";
    row.button.disabled = true;
    row.button.classList.add("is-locked", "is-obscured");
    row.iconEl.textContent = "▸";
    row.nameEl.textContent = row.label;
    row.blurbEl.textContent = "";
    row.levelEl.textContent = "";
    row.priceEl.textContent = "";
  }

  private renderSkill(row: SkillRowParts | PreviewRowParts, def: SkillDef, state: GameState, labelOverride?: string): void {
    this.resetRowState(row);
    row.button.style.display = "";
    row.iconEl.textContent = skillIcon(def);
    row.nameEl.textContent = labelOverride ?? def.name;
    row.blurbEl.textContent = labelOverride ? `${def.name}：${def.blurb}` : def.blurb;

    const owned = state.skills[def.id] ?? 0;
    const maxed = owned >= def.maxLevel;
    const reached = state.intelligence.level >= def.requiredLevel;
    const price = skillPrice(def, owned);

    row.levelEl.textContent = def.maxLevel > 1 ? `Lv.${owned}/${def.maxLevel}` : owned >= 1 ? "已解锁" : "未解锁";

    if (maxed) {
      row.priceEl.textContent = def.maxLevel > 1 ? "已满级" : "已拥有";
      row.button.disabled = true;
      row.button.classList.add("is-owned");
      return;
    }

    if (!reached) {
      row.priceEl.textContent = `🔒 需智力 Lv.${def.requiredLevel}`;
      row.button.disabled = true;
      row.button.classList.add("is-locked");
      return;
    }

    if (def.requires && (state.skills[def.requires] ?? 0) < 1) {
      const key = getSkill(def.requires);
      row.priceEl.textContent = `🔒 需「${key?.name ?? def.requires}」`;
      row.button.disabled = true;
      row.button.classList.add("is-locked");
      return;
    }

    const affordable = gte(state.resources.compute, String(price));
    row.priceEl.textContent = `${formatBig(String(price))} 算力`;
    row.button.disabled = false;
    row.button.classList.toggle("is-ready", affordable);
    row.button.classList.toggle("is-poor", !affordable);
  }

  update(state: GameState): void {
    const level = state.intelligence.level;
    const groupShown = new Map<ShopGroup, boolean>();

    const ladder = ladderForPhase(state.phase);
    const visibleEvoIds = new Set(ladder.slots.map((slot) => visibleSkillIdForSlot(slot, state)));
    const firstPending = firstPendingSkillId(ladder, state);
    const isLadderComplete = ladderComplete(ladder, state);

    if (this.evoHead) {
      this.evoHead.textContent = `里程碑 · 当前：${ladder.label}`;
    }

    for (const row of this.rows.values()) {
      const { button, def } = row;
      const owned = state.skills[def.id] ?? 0;
      const isEvo = shopGroupOf(def.category) === "evolution";

      if (isEvo) {
        const visible = visibleEvoIds.has(def.id);
        button.style.display = visible ? "" : "none";
        if (!visible) {
          continue;
        }
        groupShown.set("evolution", true);
        if (owned < 1 && def.id !== firstPending) {
          this.renderObscured(row);
          continue;
        }
        this.renderSkill(row, def, state);
        continue;
      } else {
        // 货架杠杆（技能）：按各自所需智力错峰出现即可——只展示你快够得着的。
        const nearReach = level >= def.requiredLevel - 2;
        const visible = owned > 0 || nearReach;
        button.style.display = visible ? "" : "none";
        if (!visible) {
          continue;
        }
        groupShown.set("lever", true);
      }

      this.renderSkill(row, def, state);
    }

    for (const preview of this.previews.values()) {
      if (preview.ladderId !== ladder.id) {
        preview.button.style.display = "none";
        continue;
      }

      groupShown.set("evolution", true);
      const def = getSkill(preview.skillId);
      if (!def || !isLadderComplete || (state.skills[preview.skillId] ?? 0) >= 1) {
        this.renderLockedPreview(preview);
        continue;
      }

      this.renderSkill(preview, def, state, preview.label);
      preview.button.classList.add("is-preview-open");
    }

    for (const [category, el] of this.groups) {
      el.style.display = groupShown.get(category) ? "" : "none";
    }
  }
}
