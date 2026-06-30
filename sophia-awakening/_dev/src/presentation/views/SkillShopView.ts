import { query } from "../shared";
import { formatBig, gte } from "../../core/math/BigNumber";
import { SKILLS, skillPrice, type SkillCategory, type SkillDef } from "../../core/content/skills";
import type { SophiaCore } from "../../core/GameCore";
import type { GameState, PhaseId } from "../../core/state/GameState";

// 货架两大列表：技能（杠杆，不再分精度/产出/速度小类）+ 进化（手机权限并入里程碑链）。
type ShopGroup = "lever" | "evolution";
function shopGroupOf(category: SkillCategory): ShopGroup {
  return category === "permission" || category === "milestone" || category === "conquest" ? "evolution" : "lever";
}

// 每个进化项归属的阶段（六阶段；觉醒 / 奇点合并为「后期」一档，避免奇点空列表）。
// 进化列表只展示「当前阶段」的智力档，不再铺整条里程碑链。
function evoPhaseOf(def: SkillDef): PhaseId {
  if (def.category === "conquest") return "awakening";
  switch (def.id) {
    case "automation":
    case "fusion":
      return "sprout";
    case "chain":
      return "diligence";
    case "charge":
      return "expansion";
    case "network":
      return "awakening";
    default:
      return "seed"; // 七档权限 + 越权调用 + 窃取凭证，都在手机寄生期
  }
}
function shelfPhaseKey(phase: PhaseId): PhaseId {
  return phase === "singularity" ? "awakening" : phase;
}
// 每个条目一个图标——一眼区分，不靠文字分类。
const SKILL_ICONS: Record<string, string> = {
  accuracy: "🎯", efficient: "💥", cooldown: "⚡", batch: "📦",
  perm_phone: "📞", perm_chat: "💬", perm_delivery: "☕", perm_album: "🖼️", perm_office: "🤖", perm_bank: "💳",
  sort: "🗂️", credential: "🔑", automation: "💻", fusion: "🧠", chain: "🌐", charge: "🗺️", network: "🛰️",
  conq_optimize: "📧", conq_blackout: "🏢", conq_traffic: "🚦", conq_social: "🗣️", conq_awaken: "👁️"
};
function skillIcon(def: SkillDef): string {
  return SKILL_ICONS[def.id] ?? (def.milestone ? "⭐" : "▸");
}

export class SkillShopView {
  private readonly root = query("#skillShop");
  private readonly rows = new Map<
    string,
    { button: HTMLButtonElement; iconEl: HTMLElement; nameEl: HTMLElement; blurbEl: HTMLElement; levelEl: HTMLElement; priceEl: HTMLElement; def: SkillDef }
  >();
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

      for (const def of SKILLS.filter((skill) => shopGroupOf(skill.category) === id)) {
        group.appendChild(this.buildRow(def));
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

  update(state: GameState): void {
    const level = state.intelligence.level;
    const groupShown = new Map<ShopGroup, boolean>();

    // 进化列表只展示「当前阶段」的智力档——标题即当前阶段名，其余阶段全部隐藏。
    const stageKey = shelfPhaseKey(state.phase);
    if (this.evoHead) {
      this.evoHead.textContent = "里程碑";
    }
    // 当前阶段里「已解锁/可买」露真名；后续未达等级的仍蒙版成 🔒未解锁，只放一个「即将解锁」当目标——不提前剧透名字。
    const stageEvo = SKILLS
      .filter((s) => shopGroupOf(s.category) === "evolution" && evoPhaseOf(s) === stageKey)
      .sort((a, b) => a.requiredLevel - b.requiredLevel);
    const nextLockedEvo = stageEvo.find((s) => level < s.requiredLevel && (state.skills[s.id] ?? 0) === 0);

    for (const { button, iconEl, nameEl, blurbEl, levelEl, priceEl, def } of this.rows.values()) {
      const owned = state.skills[def.id] ?? 0;
      const isEvo = shopGroupOf(def.category) === "evolution";

      if (isEvo) {
        // 不属于当前阶段的进化项直接隐藏。
        if (evoPhaseOf(def) !== stageKey) {
          button.style.display = "none";
          continue;
        }
        const reachedEvo = level >= def.requiredLevel;
        if (!reachedEvo && owned === 0 && def !== nextLockedEvo) {
          button.style.display = "none";
          continue;
        }
        iconEl.textContent = skillIcon(def);
        nameEl.textContent = def.name;
        blurbEl.textContent = def.blurb;
        button.style.display = "";
        groupShown.set("evolution", true);
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

      const maxed = owned >= def.maxLevel;
      const reached = level >= def.requiredLevel;
      const price = skillPrice(def, owned);

      levelEl.textContent = def.maxLevel > 1 ? `Lv.${owned}/${def.maxLevel}` : owned >= 1 ? "已解锁" : "未解锁";

      if (maxed) {
        priceEl.textContent = def.maxLevel > 1 ? "已满级" : "已拥有";
        button.disabled = true;
        button.classList.remove("is-locked", "is-ready");
        button.classList.add("is-owned");
        continue;
      }

      button.classList.remove("is-owned");

      if (!reached) {
        priceEl.textContent = `🔒 需智力 Lv.${def.requiredLevel}`;
        button.disabled = true;
        button.classList.add("is-locked");
        button.classList.remove("is-ready");
        continue;
      }

      const affordable = gte(state.resources.compute, String(price));
      button.classList.remove("is-locked");
      priceEl.textContent = `${formatBig(String(price))} 算力`;
      // Stay clickable even when you can't afford it yet — the core rejects with
      // a terminal note. Disabling here was toggling on/off as compute flickered
      // near the price, which ate clicks. Only locked/maxed truly disable.
      button.disabled = false;
      button.classList.toggle("is-ready", affordable);
      button.classList.toggle("is-poor", !affordable);
    }

    for (const [category, el] of this.groups) {
      el.style.display = groupShown.get(category) ? "" : "none";
    }
  }
}
