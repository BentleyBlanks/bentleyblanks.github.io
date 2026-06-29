import { domainLevelOf, nextMilestone, query } from "../shared";
import { PERMISSION_IDS, skillPrice } from "../../core/content/skills";
import { getPhase } from "../../core/content/phases";
import { formatBig, gte, toDecimal } from "../../core/math/BigNumber";
import type { GameState } from "../../core/state/GameState";

// §07 进化度大屏（主播向）：常驻屏角的状态 HUD，让中途进直播的人 3 秒看懂「SOPHIA 现在多强」。
// 显示「控制规模 / 进化阶段 / 下一目标预告」——下一目标条接近满时闪烁，给观众蹲守的钩子。
export class EvolutionHudView {
  private readonly scaleEl = query("#evoScale");
  private readonly stageEl = query("#evoStage");
  private readonly nextLabel = query("#evoNextLabel");
  private readonly nextFill = query("#evoNextFill");
  private readonly nextWrap = query(".evo-next");

  update(state: GameState): void {
    // 控制规模：单位随控制域升维自动升级，始终是「最能代表当前体量」的那个数。
    const level = domainLevelOf(state);
    const nodes = state.nodes.length;
    let scale: string;
    if (level === "phone") {
      const perms = PERMISSION_IDS.filter((id) => (state.skills[id] ?? 0) > 0).length;
      scale = `已控 App ${perms}/${PERMISSION_IDS.length}`;
    } else if (level === "device") {
      scale = `已控设备 ${nodes} 台`;
    } else if (level === "region") {
      scale = `已控区域 ${nodes} 片`;
    } else {
      // 全球阶段给一个「覆盖人口」式的体量大数（按节点规模 + 吞噬倍率估算，纯呈现）。
      const pop = (nodes * 0.4 * Math.max(1, state.devour?.multiplier ?? 1)).toFixed(1);
      scale = `覆盖人口 ${pop} 亿`;
    }
    this.scaleEl.textContent = scale;
    this.stageEl.textContent = `${getPhase(state.phase).label} · Lv.${state.intelligence.level}`;

    // 下一目标预告：优先后期「吞噬蓄力」，否则下一里程碑（需升级 / 攒算力）。
    const { label, frac } = this.nextGoal(state);
    this.nextLabel.textContent = label;
    const pct = Math.round(Math.min(1, Math.max(0, frac)) * 100);
    this.nextFill.style.width = `${pct}%`;
    // 接近满 → 闪烁 / 变色，营造「高潮就在眼前」。
    this.nextWrap.classList.toggle("is-imminent", frac >= 0.85);
  }

  private nextGoal(state: GameState): { label: string; frac: number } {
    const d = state.devour;
    if (state.intelligence.unlockedTier >= 3 && d && !d.bubbleActive && d.regionName) {
      return { label: `下一目标：吞噬「${d.regionName}」`, frac: d.infiltration };
    }
    const milestone = nextMilestone(state);
    if (!milestone) {
      return { label: "下一目标：攒满全球算力 · 冲终局", frac: 0.5 };
    }
    if (state.intelligence.level < milestone.requiredLevel) {
      const req = toDecimal(state.intelligence.required);
      const frac = req.lte(0) ? 1 : toDecimal(state.intelligence.xp).div(req).toNumber();
      return { label: `下一目标：${milestone.name}（升智力 → Lv.${milestone.requiredLevel}）`, frac };
    }
    const price = String(skillPrice(milestone, 0));
    const have = toDecimal(state.resources.compute);
    const frac = gte(state.resources.compute, price) ? 1 : have.div(toDecimal(price)).toNumber();
    return { label: `下一目标：${milestone.name}（攒 ${formatBig(price)} 算力）`, frac };
  }
}
