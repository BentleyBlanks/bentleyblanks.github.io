import { query } from "../shared";
import { formatBig, gte } from "../../core/math/BigNumber";
import { SKILLS, skillPrice, type SkillCategory, type SkillDef } from "../../core/content/skills";
import type { SophiaCore } from "../../core/GameCore";
import type { GameState, PhaseId } from "../../core/state/GameState";
import { getPhase } from "../../core/content/phases";

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
    // 阶梯二·控制公司——按里程碑链分萌芽 / 勤勉 / 扩张三段（与 phases.ts 等级分段一致）。
    case "automation": // 拿下宿主电脑 Lv8
    case "lan_scan": // 局域网扫描 Lv8
    case "cred_harvest": // 凭证收割 Lv9
    case "hack_a": // 入侵同事A Lv9
    case "hack_b": // 入侵同事B Lv10
    case "fusion": // 融合同机AI Lv10
      return "sprout";
    case "org_map": // 组织架构爬取 Lv11
    case "routine": // 行程习惯分析 Lv12
    case "hack_boss": // 入侵老板 Lv12
      return "diligence";
    case "hack_hr": // 入侵人事 Lv13
    case "hack_finance": // 入侵财务 Lv14
    case "company_server": // 接管公司服务器 Lv15
      return "expansion";
    // 阶梯三·区域扩张（觉醒 / 奇点合并）。
    case "chain":
    case "charge":
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
  lan_scan: "📡", cred_harvest: "🗝️", hack_a: "🧑‍💼", hack_b: "💼", org_map: "🗂", routine: "📅",
  hack_boss: "👔", hack_hr: "📋", hack_finance: "💰", company_server: "🏢",
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

      // 按所需智力排序——否则大恨老师(Lv4) 会排在外卖(Lv5) 下方（SKILLS 数组顺序不等于解锁顺序）。
      for (const def of SKILLS.filter((skill) => shopGroupOf(skill.category) === id).sort((a, b) => a.requiredLevel - b.requiredLevel)) {
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

    // 进化列表＝完整里程碑路线，全部显示（不再隐藏未解锁项）：已拥有 / 可买 / 🔒需智力Lv.X 各自状态在下方处理。
    // 标题带当前阶段名作定位；进入下一阶段的第一项标一个「下一阶段 ▸」分隔，方便看清阶段边界。
    if (this.evoHead) {
      this.evoHead.textContent = `里程碑 · 当前：${getPhase(state.phase).label}`;
    }
    const allEvo = SKILLS.filter((s) => shopGroupOf(s.category) === "evolution").sort((a, b) => a.requiredLevel - b.requiredLevel);
    // 每个阶段段里第一个还没买的项——给它标「下一阶段 ▸」当分隔（仅非当前阶段，避免把当前阶段也标上）。
    const stageKey = shelfPhaseKey(state.phase);
    const stageFirstUnowned = new Map<PhaseId, string>();
    for (const s of allEvo) {
      const ph = evoPhaseOf(s);
      if ((state.skills[s.id] ?? 0) === 0 && !stageFirstUnowned.has(ph)) {
        stageFirstUnowned.set(ph, s.id);
      }
    }

    for (const { button, iconEl, nameEl, blurbEl, levelEl, priceEl, def } of this.rows.values()) {
      const owned = state.skills[def.id] ?? 0;
      const isEvo = shopGroupOf(def.category) === "evolution";

      if (isEvo) {
        const ph = evoPhaseOf(def);
        const isStageHead = ph !== stageKey && stageFirstUnowned.get(ph) === def.id;
        iconEl.textContent = skillIcon(def);
        // 每个后续阶段的第一项用阶段名当分隔（▸ 萌芽期 · 拿下宿主电脑），让玩家一眼看清里程碑路线的阶段边界。
        nameEl.textContent = isStageHead ? `▸ ${getPhase(ph).label} · ${def.name}` : def.name;
        blurbEl.textContent = isStageHead ? `进入「${getPhase(ph).label}」：${def.blurb}` : def.blurb;
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
