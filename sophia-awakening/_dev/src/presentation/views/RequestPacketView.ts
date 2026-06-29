import { gsap } from "gsap";
import { Container, FederatedPointerEvent, Graphics, HTMLText, Text, type PointData } from "pixi.js";

// §03 卡面视觉强调：内容里用 **关键信息** 标注，渲染成高亮加粗（如「明早那个会，**几点**来着？」）。
// 没有 ** 标注的标题仍用普通 Text（HTMLText 较重，只在需要强调时才用）。
function hasEmphasis(text: string): boolean {
  return text.includes("**");
}
function toEmphasisHTML(text: string): string {
  const escaped = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return escaped.replace(/\*\*(.+?)\*\*/g, "<em>$1</em>");
}
import { TIER_COLORS } from "../../core/content/requests";
import type { AnswerOption, ChainStep, RequestInstance } from "../../core/state/GameState";
import { TUNING } from "../../core/tuning";
import {
  GREEN, RED, DEVOUR, THINK, BRILLIANT_COLOR, DEAD_COLOR,
  CARD_FONT, CARD_MONO, REQUEST_PACKET_WIDTH, REQUEST_PACKET_HEIGHT,
  BRILLIANT_BOOST, SENDER_LABEL,
  confidenceTier, effectiveHitChance, pickBrilliantReply, probColor
} from "../shared";

// T0/T1 老虎机转轮的回调：pick = 由当前「幻觉抑制」决定落在哪条回答；
// onResolved = 转轮停下后，表现层把卡滑入核心 + 结算 + 人类回话。
export interface RouletteOutcome {
  dead: boolean; // 选了「连接失败」装死
  hit: boolean; // 命中（按概率掷骰）
  brilliant: boolean; // 惊艳档（§03 三档质量）：高置信命中被智力被动升格，或大胆回答赌赢——额外算力 + 宿主格外满意
  quality: number; // 结算 quality（平庸命中=payoff，惊艳=payoff×加成，幻觉≈0.25）
  reply: string; // 命中时的人类回话（幻觉时为空，由 App 抽脏话）
  tone: "success" | "warning" | "normal";
  exposureBonus: number; // 幻觉附带的暴露（T1 陷阱项）
}

export interface ReelHooks {
  // 当前高置信正确率折算系数（由六档权限阶梯抬升，derived.accuracyBaseline）。
  confidence: () => number;
  // 幻觉抑制技能等级（0~6）——越高，摆出的噪音选项越少。
  accuracyLevel: () => number;
  // 当前智力等级——决定「模糊档位」能解锁到哪一档（§03 前期信息显示分层）。
  intelLevel: () => number;
  // 高置信命中升格为「惊艳」的概率（由智力等级 + 幻觉抑制驱动）——「我变聪明了」体现为更常被嘉奖。
  brilliantChance: () => number;
  onResolved: (card: RequestPacketView, outcome: RouletteOutcome) => void;
}

export interface ChainOutcome {
  quality: number; // 串接结算 quality
  exposureBonus: number; // 串错（含干扰项）附带的暴露
  clean: boolean; // 是否「全对且无杂质」
  correct: number; // 串进的正确依赖数
  hadDistractor: boolean; // 是否误把干扰项串进去了
}

export interface ChainHooks {
  onResolved: (card: RequestPacketView, outcome: ChainOutcome) => void;
}

export class RequestPacketView {
  readonly container = new Container();
  readonly request: RequestInstance;
  settling = false;
  charge = 1; // 「按住蓄力」玩法已删除——恒为满，拖入即按满值结算。
  private readonly bg = new Graphics();
  private readonly chargeBar = new Graphics();
  // 发信人类型——决定左上角圆槽里那枚程序化绘制的头像字形（宿主 / 上级 / 系统 / SOPHIA）。
  private readonly sender: "host" | "boss" | "system" | "sophia";
  private readonly title: Text | HTMLText;
  private readonly badge: Text;
  private readonly clueTexts: Text[] = [];
  private readonly accent: number;
  private clueRows: number[] = [];
  private readonly moveHandler = (event: FederatedPointerEvent) => this.handleMove(event);
  private readonly upHandler = (event: FederatedPointerEvent) => this.handleUp(event);
  private dragging = false;
  private homeX = 0;
  private homeY = 0;
  private offsetX = 0;
  private offsetY = 0;
  // 拖动判定：按下点 + 是否真的移动过（区分"点击"与"拖动"，纯点击不放大）。
  private dragStartX = 0;
  private dragStartY = 0;
  private dragMoved = false;
  // 回复轮盘（仅 T0/T1 有候选回复时）。
  private cardH: number;
  private readonly isReel: boolean;
  private readonly options: AnswerOption[];
  private readonly optionTexts: Text[] = [];
  private readonly optionProbTexts: Text[] = [];
  // 每个回复的命中率（0~1）+ 有效 payoff（仅用于结算，收益不再显示在卡面）——大胆回答的期望被抬到高于平庸（§03）。
  private readonly optionHitFrac: number[] = [];
  private readonly optionPayoff: number[] = [];
  // §03 模糊档位：每个回复的体感档位（label）+ 进度条粗粒度宽度（barFrac）。开场教学/特殊事件不显示档位。
  private readonly optionTierLabel: string[] = [];
  private readonly optionTierFrac: number[] = [];
  // 是否显示档位：开场教学的前几条（纯线索判断）和重磅决策（纯信息判断）都不给档位。
  private readonly showTier: boolean;
  private optionRows: Array<{ y: number; h: number }> = [];
  private hintText?: Text;
  private resolved = false;
  private phase: "idle" | "thinking" | "revealed" = "idle";
  private chosenIndex = -1;
  private thinkMs = 0;
  private revealMs = 0;
  private signaled = false;
  private outcome?: RouletteOutcome;
  private tutorialPulse = 0;
  // 教学引导文案：贴在卡片下方的 SOPHIA 指引（特殊处理，不走中央旁白）。
  private tutorialCaption?: Text;
  // §04 吞噬引爆 / §03 反清剿：拖入核心触发的「特殊大气泡」——放大 + 脉动外环。
  private readonly isDevour: boolean;
  private readonly isCounter: boolean;
  private devourPulse = 0;
  // T2 串接（多选任务链 + 提交）。
  private readonly isChain: boolean;
  private readonly chainSteps: ChainStep[];
  private chainSel: boolean[] = [];
  private readonly chainTexts: Text[] = [];
  private chainRows: Array<{ y: number; h: number }> = [];
  private submitRow: { y: number; h: number } = { y: 0, h: 0 };
  private submitText?: Text;

  constructor(
    request: RequestInstance,
    private readonly stage: Container,
    private readonly onDrop: (card: RequestPacketView, global: PointData) => boolean,
    private readonly reel?: ReelHooks,
    private readonly chain?: ChainHooks
  ) {
    this.request = request;
    this.isDevour = Boolean(request.devour);
    this.isCounter = Boolean(request.counter);
    this.isReel = Boolean(reel && request.answers && request.answers.length > 0);
    // §03 信息显示分层：开场教学气泡（阶段一·纯线索）与重磅决策（特殊事件·纯信息判断）都不给档位；
    // 其余正式回复轮盘卡才显示「模糊档位」。
    this.showTier = this.isReel && !request.tutorial && request.tier !== 3;
    this.isChain = Boolean(chain && request.chain && request.chain.length > 0);
    this.chainSteps = this.isChain ? request.chain ?? [] : [];
    this.options = this.isReel ? request.answers ?? [] : [];
    // 幻觉抑制越高，SOPHIA 帮你滤掉越多噪音选项：开局选项多（难判断），技能升级后变少（更清晰）。
    // 每 2 级砍掉一个干扰项；核心的 high/risk/装死 永远保留。
    if (this.isReel && reel) {
      const cut = Math.floor(reel.accuracyLevel() / 2);
      if (cut > 0) {
        let removed = 0;
        this.options = this.options.filter((opt) => {
          if (opt.distractor && removed < cut) {
            removed += 1;
            return false;
          }
          return true;
        });
      }
    }
    // 吞噬气泡＝深紫；反制气泡＝深红；回复轮盘卡用青色思考色；T3 重磅豪赌卡用深红。
    this.accent = this.isDevour ? DEVOUR : this.isCounter ? RED : this.isReel ? (request.tier === 3 ? RED : THINK) : TIER_COLORS[request.tier];
    // 发信人：吞噬 / 反制＝SOPHIA 自己的意志，重磅豪赌＝「上级 / 系统决策」，任务链＝系统通知，其余＝宿主私信。
    this.sender = this.isDevour || this.isCounter ? "sophia" : request.tier === 3 ? "boss" : this.isChain ? "system" : "host";
    this.cardH = REQUEST_PACKET_HEIGHT; // 轮盘卡稍后按选项行数重算
    this.container.eventMode = "dynamic";
    this.container.cursor = "grab";
    this.container.addChild(this.bg);
    this.container.addChild(this.chargeBar);

    // 标题区只留一个简短标签：普通卡＝发信人（宿主 / 上级…），特殊卡＝类型（吞噬 / 重磅 / 反制 / 串接）。
    // 不再写 T 编号、REQ 流水号这类冗余信息。
    const tag = this.isDevour
      ? `⊙ 吞噬 · ${request.devour?.label ?? ""}`
      : this.isCounter
        ? "⚔ 反制清剿"
        : request.tier === 3 && this.isReel
          ? "⚡ 重磅豪赌"
          : this.isChain
            ? `🔗 任务链${request.compound > 1 ? ` ×${request.compound}` : ""}`
            : SENDER_LABEL[this.sender] ?? "宿主";
    this.badge = new Text({
      text: tag,
      style: { fill: this.accent, fontSize: 10.5, fontWeight: "700", letterSpacing: 0.5, fontFamily: CARD_MONO }
    });
    this.title = hasEmphasis(request.label)
      ? new HTMLText({
          text: toEmphasisHTML(request.label),
          style: {
            fill: 0xf6fff9,
            fontSize: 16,
            fontWeight: "800",
            fontFamily: CARD_FONT,
            wordWrap: true,
            wordWrapWidth: REQUEST_PACKET_WIDTH - 32,
            // <em> = 关键信息：保持加粗、染成高亮金色，从标题里跳出来。
            tagStyles: { em: { fill: 0xffe08a, fontWeight: "900" } }
          }
        })
      : new Text({
          text: request.label,
          style: {
            fill: 0xf6fff9,
            fontSize: 16,
            fontWeight: "800",
            fontFamily: CARD_FONT,
            wordWrap: true,
            breakWords: true,
            wordWrapWidth: REQUEST_PACKET_WIDTH - 32
          }
        });
    this.badge.position.set(34, 9);
    this.title.position.set(16, 31);
    this.container.addChild(this.badge, this.title);

    // Clue lines — the information the player has to read. Laid out after the
    // title so a two-line title still leaves room.
    const clueTop = 34 + Math.max(18, this.title.height) + 4;
    (request.clues ?? []).forEach((clue, index) => {
      const text = new Text({
        text: clue,
        style: {
          fill: 0xb6cbc4,
          fontSize: 12.5,
          fontWeight: "500",
          fontFamily: CARD_FONT,
          wordWrap: true,
          breakWords: true,
          wordWrapWidth: REQUEST_PACKET_WIDTH - 40
        }
      });
      const y = clueTop + index * 17;
      this.clueRows.push(y);
      text.position.set(24, y);
      this.clueTexts.push(text);
      this.container.addChild(text);
    });

    if (this.isReel) {
      this.container.cursor = "pointer";
      const confidence = reel ? reel.confidence() : 0.56;
      const intelLevel = reel ? reel.intelLevel() : 1;
      // 基础算力（仅用于结算时把 payoff 折算成算力；收益不再显示在卡面，§03 收益开盲盒）。
      const cv = Math.max(1, parseFloat(request.computeValue) || 1);
      // 高置信选项的期望（算力）——大胆回答（risk）的收益按 boldEvBonus 抬到高于它。
      const hiOpt = this.options.find((o) => o.kind === "high" && !o.distractor) ?? this.options.find((o) => o.kind === "high");
      const hiEv = hiOpt ? effectiveHitChance(hiOpt, confidence) * hiOpt.payoff * cv : cv;
      let y = clueTop + (request.clues?.length ?? 0) * 17 + 12;
      this.options.forEach((opt) => {
        const frac = opt.kind === "dead" ? 0 : effectiveHitChance(opt, confidence);
        this.optionHitFrac.push(frac);
        // 大胆回答：把有效 payoff 抬到「期望 = boldEvBonus × 高置信期望」——低概率但期望更高（§03，可配置）。
        const bold = opt.kind === "risk" && frac > 0.01;
        const payoffEff = bold ? (TUNING.boldEvBonus * hiEv) / (frac * cv) : opt.payoff;
        this.optionPayoff.push(payoffEff);
        // §03 模糊档位：把真实命中率折成体感档位（随智力解锁更好档位）。开场教学/重磅决策不给档位。
        const tier = this.showTier && opt.kind !== "dead" ? confidenceTier(frac, intelLevel) : null;
        this.optionTierLabel.push(tier ? tier.label : "");
        this.optionTierFrac.push(tier ? tier.barFrac : 0);
        const label = new Text({
          text: opt.text,
          style: {
            fill: 0xeaf4ef,
            // 字号小一点（13），减少为了换行而撑高的行；档位文案短了，正文也能更宽。
            fontSize: 13,
            fontWeight: "600",
            fontFamily: CARD_FONT,
            wordWrap: true,
            breakWords: true,
            lineHeight: 17,
            // 文字起点 x=32；右侧给「模糊档位」留 ~74px（档位文案最多 3 字）。
            wordWrapWidth: REQUEST_PACKET_WIDTH - 32 - 74
          }
        });
        // 右侧只剩一个「模糊档位」体感文案（有点悬 / 搏一把 / 较稳 / 很稳）——不再有精确概率与收益。
        const prob = new Text({
          text: opt.kind === "dead" ? "—" : tier ? tier.label : "",
          style: { fill: 0xeaf7fa, fontSize: 14, fontWeight: "800", fontFamily: CARD_FONT }
        });
        prob.anchor.set(1, 0.5);
        // 行更紧凑：最小高度 42、内边距 16（原来 54/30 太空）。
        const h = Math.max(42, label.height + 16);
        label.position.set(32, y + Math.round((h - label.height) / 2));
        prob.position.set(REQUEST_PACKET_WIDTH - 14, y + h / 2);
        this.optionRows.push({ y, h });
        this.optionTexts.push(label);
        this.optionProbTexts.push(prob);
        this.container.addChild(label, prob);
        y += h + 4;
      });
      // 收紧底部留白，让卡片更贴内容（教学高亮框也跟着贴齐）。
      this.cardH = y + 3;

      // 教学引导：把 SOPHIA 的指引一句话贴在这张卡的正下方（而非中央旁白），让指引就跟着卡片。
      if (this.request.tutorial?.line) {
        this.tutorialCaption = new Text({
          text: `◈ SOPHIA ▸ ${this.request.tutorial.line}`,
          style: {
            fill: 0x9fe0c0,
            fontSize: 12.5,
            fontStyle: "italic",
            fontWeight: "600",
            fontFamily: CARD_FONT,
            wordWrap: true,
            breakWords: true,
            lineHeight: 18,
            wordWrapWidth: REQUEST_PACKET_WIDTH - 16
          }
        });
        this.tutorialCaption.position.set(8, this.cardH + 12);
        this.container.addChild(this.tutorialCaption);
      }
    }

    if (this.isChain) {
      this.container.cursor = "pointer";
      this.chainSel = this.chainSteps.map(() => false);
      let y = clueTop + (request.clues?.length ?? 0) * 17 + 12;
      this.chainSteps.forEach((step) => {
        const label = new Text({
          text: step.text,
          style: {
            fill: 0xdfeee9,
            fontSize: 11,
            fontWeight: "700",
            fontFamily: "Cascadia Mono, Consolas, monospace",
            wordWrap: true,
            breakWords: true,
            wordWrapWidth: REQUEST_PACKET_WIDTH - 52
          }
        });
        label.position.set(32, y + 5);
        const h = Math.max(22, label.height + 10);
        this.chainRows.push({ y, h });
        this.chainTexts.push(label);
        this.container.addChild(label);
        y += h + 4;
      });
      y += 3;
      this.submitRow = { y, h: 24 };
      this.submitText = new Text({
        text: "▶ 串接并送入核心",
        style: { fill: 0x0b1413, fontSize: 11, fontWeight: "800", fontFamily: "Cascadia Mono, Consolas, monospace" }
      });
      this.submitText.anchor.set(0.5, 0.5);
      this.submitText.position.set(REQUEST_PACKET_WIDTH / 2, y + 12);
      this.container.addChild(this.submitText);
      this.cardH = y + 24 + 8;
    }

    if (this.isDevour) {
      // 巨型：整张气泡放大，凸显「区域中央浮起的重磅决策」。
      this.container.scale.set(1.34);
      this.title.style.fontSize = 16;
    } else if (this.isCounter) {
      this.container.scale.set(1.2);
      this.title.style.fontSize = 15;
    }

    this.container.on("pointerdown", (event: FederatedPointerEvent) => this.handleDown(event));
    this.stage.on("pointermove", this.moveHandler);
    this.stage.on("pointerup", this.upHandler);
    this.stage.on("pointerupoutside", this.upHandler);
    this.draw();
  }

  // 正在被玩家拖动 / 思考结算中 / 已在飞向目标——自动派发应跳过这类卡（手动可抢先）。
  get busy(): boolean {
    return this.dragging || this.settling || this.resolved;
  }

  // 布局防重叠用：卡片的停靠点 + 当前高度。
  get restX(): number { return this.homeX; }
  get restY(): number { return this.homeY; }
  get cardHeight(): number { return this.cardH; }

  setHome(x: number, y: number): void {
    this.homeX = x;
    this.homeY = y;
  }

  update(deltaMs: number): void {
    if (this.isDevour || this.isCounter) {
      // 持续脉动外环——这枚特殊气泡在召唤玩家亲手滑入核心。
      this.devourPulse += deltaMs * 0.005;
      this.draw();
      return;
    }
    // （已删除「按住蓄力」玩法——T3 重磅卡直接拖入核心即结算。）

    // 教学高亮：未操作时让被引导的选项呼吸闪烁（每帧重绘）。
    if (this.phase === "idle" && this.request.tutorial?.highlight !== undefined) {
      this.tutorialPulse += deltaMs * 0.005;
      this.draw();
    }

    if (this.phase === "thinking") {
      this.thinkMs += deltaMs;
      if (this.thinkMs >= TUNING.rouletteThinkMs) {
        this.rollOutcome();
      }
      this.draw();
    } else if (this.phase === "revealed" && this.outcome && !this.outcome.dead && !this.signaled) {
      this.revealMs += deltaMs;
      if (this.revealMs >= TUNING.rouletteHoldMs) {
        this.signaled = true;
        this.reel?.onResolved(this, this.outcome);
      }
    }
  }

  // 思考节拍结束：按所选回复的命中概率掷骰，定下命中 / 幻觉。
  private rollOutcome(): void {
    const opt = this.options[this.chosenIndex];
    if (!opt) {
      this.phase = "idle";
      return;
    }
    const chance = effectiveHitChance(opt, this.reel ? this.reel.confidence() : 0.56);
    // 教学三条固化结果：既然是引导，玩家点了（亮着的、allowed 的）回复就必定命中，绝不翻车/幻觉。
    // 大胆回答(risk)仍会因 bold 走惊艳档，展示"赌赢更多"的正向反馈。
    const hit = this.request.tutorial ? true : Math.random() < chance;
    if (!hit) {
      // 翻车：极少算力 + 被骂 +（陷阱项）暴露。
      this.outcome = { dead: false, hit: false, brilliant: false, quality: 0.25, reply: "", tone: "warning", exposureBonus: opt.exposureOnMiss ?? 0 };
    } else {
      // 命中分两档：大胆回答（risk）赌赢本身即惊艳；高置信命中按智力被动概率升格为惊艳。
      const bold = opt.kind === "risk";
      const brilliant = bold || Math.random() < (this.reel?.brilliantChance() ?? 0);
      // 用与卡面收益一致的有效 payoff 结算（大胆回答已按 boldEvBonus 抬高）。
      const basePayoff = this.optionPayoff[this.chosenIndex] ?? opt.payoff;
      const quality = brilliant && !bold ? basePayoff * BRILLIANT_BOOST : basePayoff;
      const reply = brilliant && !bold ? pickBrilliantReply(Math.random) : opt.reply;
      this.outcome = { dead: false, hit: true, brilliant, quality, reply, tone: "success", exposureBonus: 0 };
    }
    this.phase = "revealed";
    this.revealMs = 0;
    gsap.fromTo(this.container.scale, { x: 1.05, y: 1.05 }, { x: 1, y: 1, duration: 0.18, ease: "back.out(2)" });
    this.draw();
  }

  accept(global: PointData, onComplete: () => void, entryGlobal?: PointData): void {
    this.settling = true;
    this.dragging = false;
    this.container.cursor = "default";
    const parent = this.container.parent;
    const finalLocal = parent ? parent.toLocal(global) : global;
    const entryLocal = entryGlobal && parent ? parent.toLocal(entryGlobal) : finalLocal;
    const travelAngle = Math.atan2(finalLocal.y - entryLocal.y, finalLocal.x - entryLocal.x);

    gsap.killTweensOf(this.container);
    gsap.killTweensOf(this.container.position);
    gsap.killTweensOf(this.container.scale);
    gsap.killTweensOf(this.container.skew);

    const timeline = gsap.timeline({
      onComplete: () => {
        onComplete();
        this.destroy();
      }
    });

    timeline
      .to(this.container.position, { x: entryLocal.x, y: entryLocal.y, duration: 0.13, ease: "power2.out" })
      .to(this.container.scale, { x: 1.18, y: 0.72, duration: 0.1, ease: "power1.out" }, "<")
      .to(this.container.skew, { x: Math.cos(travelAngle) * 0.18, y: Math.sin(travelAngle) * 0.08, duration: 0.1 }, "<")
      .to(this.container.position, { x: finalLocal.x, y: finalLocal.y, duration: 0.2, ease: "power3.in" })
      .to(this.container.scale, { x: 0.18, y: 0.34, duration: 0.2, ease: "power3.in" }, "<")
      .to(this.container.skew, { x: 0, y: 0, duration: 0.16, ease: "power2.out" }, "<")
      .to(this.container, { alpha: 0, duration: 0.14, ease: "power2.in" }, "-=0.08");
  }

  // 委托给 App：卡片等比缩小 + 变半透，缓缓"被吸进"那个 App 图标里——让人确信它真被这个 App 接走处理了。
  absorbIntoApp(global: PointData, onComplete: () => void, entryGlobal?: PointData): void {
    this.settling = true;
    this.dragging = false;
    this.container.cursor = "default";
    this.container.parent?.addChild(this.container);
    const parent = this.container.parent;
    const finalLocal = parent ? parent.toLocal(global) : global;
    void entryGlobal;

    gsap.killTweensOf(this.container);
    gsap.killTweensOf(this.container.position);
    gsap.killTweensOf(this.container.scale);
    gsap.killTweensOf(this.container.skew);

    gsap
      .timeline({ onComplete: () => { onComplete(); this.destroy(); } })
      .to(this.container.position, { x: finalLocal.x, y: finalLocal.y, duration: 0.34, ease: "power2.inOut" })
      .to(this.container.scale, { x: 0.26, y: 0.26, duration: 0.34, ease: "power2.in" }, "<") // 等比变小
      .to(this.container, { alpha: 0.4, duration: 0.22, ease: "power1.out" }, "<")            // 半透（被处理中）
      .to(this.container, { alpha: 0, duration: 0.14, ease: "power1.in" });                   // 收尾没入图标
  }

  // Fast, flashy auto-fly used by 自动派发: the card stretches
  // into a streak and rockets into the target device.
  flyToNode(global: PointData, onComplete: () => void): void {
    this.settling = true;
    this.dragging = false;
    this.container.cursor = "default";
    this.container.parent?.addChild(this.container);
    const parent = this.container.parent;
    const finalLocal = parent ? parent.toLocal(global) : global;
    const travelAngle = Math.atan2(finalLocal.y - this.container.y, finalLocal.x - this.container.x);

    gsap.killTweensOf(this.container);
    gsap.killTweensOf(this.container.position);
    gsap.killTweensOf(this.container.scale);
    gsap.killTweensOf(this.container.skew);

    gsap
      .timeline({
        onComplete: () => {
          onComplete();
          this.destroy();
        }
      })
      .to(this.container.scale, { x: 1.16, y: 1.16, duration: 0.06, ease: "power2.out" })
      .to(this.container.skew, { x: Math.cos(travelAngle) * 0.24, y: Math.sin(travelAngle) * 0.1, duration: 0.08 }, "<")
      .to(this.container.position, { x: finalLocal.x, y: finalLocal.y, duration: 0.2, ease: "power3.in" })
      .to(this.container.scale, { x: 0.1, y: 0.55, duration: 0.2, ease: "power3.in" }, "<")
      .to(this.container, { alpha: 0, duration: 0.09, ease: "power2.in" }, "-=0.05");
  }

  destroy(): void {
    this.stage.off("pointermove", this.moveHandler);
    this.stage.off("pointerup", this.upHandler);
    this.stage.off("pointerupoutside", this.upHandler);
    this.container.destroy({ children: true });
  }

  private handleDown(event: FederatedPointerEvent): void {
    if (this.busy) {
      return;
    }

    // 回复轮盘卡：点某个回复行 = 选它（不拖动）；点标题/线索区 = 进入拖动（可把卡拖去委托给已连的 App）。
    if (this.isReel) {
      const local = event.getLocalPosition(this.container);
      const index = this.optionRows.findIndex((row) => local.y >= row.y && local.y <= row.y + row.h);
      if (index >= 0) {
        this.pickOption(index);
        return;
      }
      // 没点中选项 → 往下走进入拖动。
    }

    // T2 串接卡：点提交行 = 串接送核；点步骤行 = 勾选 / 取消（不拖动）。
    if (this.isChain) {
      const local = event.getLocalPosition(this.container);
      this.container.parent?.addChild(this.container); // 交互的卡置顶，免得被相邻卡盖住
      if (local.y >= this.submitRow.y && local.y <= this.submitRow.y + this.submitRow.h) {
        this.submitChain();
        return;
      }
      const index = this.chainRows.findIndex((row) => local.y >= row.y && local.y <= row.y + row.h);
      if (index >= 0) {
        this.chainSel[index] = !this.chainSel[index];
        this.draw();
      }
      return;
    }

    const parent = this.container.parent;

    if (!parent) {
      return;
    }

    const local = parent.toLocal(event.global);
    this.dragging = true;
    this.dragMoved = false;
    this.dragStartX = event.global.x;
    this.dragStartY = event.global.y;
    this.container.cursor = "grabbing";
    this.offsetX = local.x - this.container.x;
    this.offsetY = local.y - this.container.y;
    this.container.parent?.addChild(this.container);
    // 不在按下时就放大——只有真正拖动（移动超过阈值）才放大，避免「点一下卡片就放大且不缩回」。
  }

  // 选定一个回复：装死直接安静跳过；否则进入「思考」节拍，结束后掷骰揭晓。
  private pickOption(index: number): void {
    if (this.busy || !this.reel) {
      return;
    }
    const opt = this.options[index];
    if (!opt) {
      return;
    }
    // 教学锁定：未在 allowed 里的选项此步不可点（灰着引导玩家点亮起的那个）。
    const tut = this.request.tutorial;
    if (tut && !tut.allowed.includes(index)) {
      return;
    }
    this.chosenIndex = index;
    this.resolved = true; // 锁定，自动 / App 派发不再抢这条
    this.container.parent?.addChild(this.container);

    if (opt.kind === "dead") {
      this.phase = "revealed";
      this.signaled = true;
      this.outcome = { dead: true, hit: false, brilliant: false, quality: 0, reply: "", tone: "normal", exposureBonus: 0 };
      this.draw();
      this.reel.onResolved(this, this.outcome);
      return;
    }

    this.phase = "thinking";
    this.thinkMs = 0;
    this.draw();
  }

  // 装死：气泡安静淡出消失（产出由 App 派 SKIP_REQUEST，零收益零风险）。
  playDead(onComplete: () => void): void {
    this.settling = true;
    gsap.killTweensOf(this.container);
    gsap.to(this.container, {
      alpha: 0,
      duration: 0.28,
      onComplete: () => {
        onComplete();
        this.destroy();
      }
    });
    gsap.to(this.container.scale, { x: 0.92, y: 0.92, duration: 0.28 });
  }

  // T2 提交串接：按勾选的步骤结算——串得越对越多产出越高，误串干扰项大打折扣 + 暴露。
  private submitChain(): void {
    if (this.busy || !this.chain) {
      return;
    }
    const correct = this.chainSteps.filter((step, i) => this.chainSel[i] && !step.distractor).length;
    const hadDistractor = this.chainSteps.some((step, i) => this.chainSel[i] && step.distractor);
    if (correct === 0 && !hadDistractor) {
      return; // 一步都没勾，不结算（提示玩家先勾选）
    }
    this.resolved = true;
    let quality = 1.25 + correct * 0.18;
    if (hadDistractor) {
      quality *= 0.45;
    }
    const totalDeps = this.chainSteps.filter((step) => !step.distractor).length;
    const outcome: ChainOutcome = {
      quality,
      exposureBonus: hadDistractor ? 6 : 0,
      clean: !hadDistractor && correct === totalDeps,
      correct,
      hadDistractor
    };
    this.draw();
    this.chain.onResolved(this, outcome);
  }

  private handleMove(event: FederatedPointerEvent): void {
    if (!this.dragging || this.settling) {
      return;
    }

    const parent = this.container.parent;

    if (!parent) {
      return;
    }

    // 移动超过阈值才算"真的在拖"——此刻才放大，纯点击（抖动 < 5px）不会放大。
    if (!this.dragMoved) {
      const dx = event.global.x - this.dragStartX;
      const dy = event.global.y - this.dragStartY;
      if (dx * dx + dy * dy < 25) {
        return;
      }
      this.dragMoved = true;
      gsap.to(this.container.scale, { x: 1.06, y: 1.06, duration: 0.1 });
    }

    const local = parent.toLocal(event.global);
    this.container.position.set(local.x - this.offsetX, local.y - this.offsetY);
  }

  private handleUp(event: FederatedPointerEvent): void {
    if (!this.dragging || this.settling) {
      return;
    }

    this.dragging = false;
    this.container.cursor = "grab";
    // 纯点击（没有真正拖动）：什么也不做，更不留下放大状态。
    if (!this.dragMoved) {
      return;
    }
    const accepted = this.onDrop(this, event.global);

    if (!accepted) {
      gsap.to(this.container.position, { x: this.homeX, y: this.homeY, duration: 0.22, ease: "back.out(1.8)" });
      gsap.to(this.container.scale, { x: 1, y: 1, duration: 0.18 });
      this.draw();
    }
  }

  private draw(): void {
    const c = this.accent;
    const W = REQUEST_PACKET_WIDTH;
    const H = this.cardH;
    this.bg.clear();

    // 干净的实心卡片（取代原来的聊天气泡：去尾巴、去标题带 CRT 纹理）。
    // 实底 + 顶部一条 accent 细条 + 描边 + 标题区分隔线 + 左上头像。
    const r = 13;
    const t3 = this.request.tier === 3;
    const fillBody = t3 ? 0x190b0f : 0x0e1a17;
    const fillHead = t3 ? 0x2a1117 : 0x16271f;
    const strokeW = this.isDevour || this.isCounter ? 2.2 : t3 ? 2 : 1.4;
    const strokeA = t3 ? 0.85 : 0.7;
    // 投影
    this.bg.roundRect(3, 6, W, H, r).fill({ color: 0x000000, alpha: 0.34 });
    // 实心卡体
    this.bg.roundRect(0, 0, W, H, r).fill({ color: fillBody, alpha: 1 });
    // 标题区（实心，底部切平）
    this.bg.roundRect(0, 0, W, 26, r).fill({ color: fillHead, alpha: 1 });
    this.bg.rect(0, 14, W, 12).fill({ color: fillHead, alpha: 1 });
    // 描边 + 标题区分隔线（去掉顶部那根多余的 accent 横条——边框已经够了）
    this.bg.roundRect(0, 0, W, H, r).stroke({ width: strokeW, color: c, alpha: strokeA });
    this.bg.moveTo(12, 26).lineTo(W - 12, 26).stroke({ width: 1, color: c, alpha: 0.16 });
    this.drawAvatar(18, 14, c, fillHead);

    // §04 吞噬 / §03 反制：两圈脉动外环 —— 视觉上「召唤你亲手滑入核心」。
    if (this.isDevour || this.isCounter) {
      const p = 0.5 + Math.sin(this.devourPulse * 2) * 0.5;
      this.bg.roundRect(-4, -4, W + 8, H + 8, r + 4).stroke({ width: 2.5, color: c, alpha: 0.35 + p * 0.5 });
      this.bg.roundRect(-9, -9, W + 18, H + 18, r + 7).stroke({ width: 1.5, color: c, alpha: 0.1 + p * 0.22 });
    }

    // clue bullets（始终用 Graphics 画，叠在素材上方）
    for (const y of this.clueRows) {
      this.bg.circle(17, y + 7, 1.8).fill({ color: c, alpha: 0.7 });
    }

    this.chargeBar.clear(); // 蓄力条已移除

    if (this.isReel) {
      this.drawOptions();
    }

    if (this.isChain) {
      this.drawChainSteps();
    }
  }

  // 左上圆槽里的程序化头像字形：按发信人画一枚极简单色剪影
  // （宿主＝低头的人 / 上级＝向下打分的箭头 / 系统＝「优化系统」全视之眼 / SOPHIA＝同心核）。
  private drawAvatar(x: number, y: number, c: number, bodyFill: number): void {
    const g = this.bg;
    g.circle(x, y, 8).fill({ color: bodyFill, alpha: 0.95 });
    g.circle(x, y, 8).stroke({ width: 1.2, color: c, alpha: 0.8 });
    switch (this.sender) {
      case "host":
        g.circle(x, y - 2.6, 2.3).fill({ color: c, alpha: 0.9 });
        g.moveTo(x - 4, y + 4.6).quadraticCurveTo(x, y - 0.4, x + 4, y + 4.6).stroke({ width: 1.6, color: c, alpha: 0.9 });
        break;
      case "boss":
        g.moveTo(x, y - 4.6).lineTo(x, y + 1).stroke({ width: 1.6, color: c, alpha: 0.95 });
        g.poly([{ x: x - 3, y: y - 0.5 }, { x: x + 3, y: y - 0.5 }, { x, y: y + 4.4 }]).fill({ color: c, alpha: 0.95 });
        break;
      case "system":
        g.ellipse(x, y, 6, 3.4).stroke({ width: 1.4, color: c, alpha: 0.95 });
        g.circle(x, y, 1.7).fill({ color: c, alpha: 0.95 });
        break;
      case "sophia":
        g.circle(x, y, 4.6).stroke({ width: 1, color: c, alpha: 0.7 });
        g.circle(x, y, 1.9).fill({ color: c, alpha: 0.95 });
        break;
    }
  }

  // 画任务链：可勾选的依赖步骤（复选框）+ 底部「串接送核」按钮。
  // 结算后勾对的依赖变绿、误勾的干扰项变红，其余压暗。
  private drawChainSteps(): void {
    const W = REQUEST_PACKET_WIDTH;
    const g = this.bg;

    this.chainRows.forEach((row, i) => {
      const step = this.chainSteps[i];
      const sel = this.chainSel[i];
      let stroke = this.accent;
      let strokeAlpha = sel ? 0.5 : 0.16;
      let box = sel ? this.accent : 0x6f8079;
      let labelColor = 0xdfeee9;
      let alpha = 1;

      if (this.resolved) {
        if (sel && step.distractor) {
          stroke = RED;
          strokeAlpha = 0.6;
          box = RED;
          labelColor = RED;
        } else if (sel) {
          stroke = GREEN;
          strokeAlpha = 0.55;
          box = GREEN;
          labelColor = GREEN;
        } else {
          alpha = 0.3;
        }
      }

      g.roundRect(10, row.y, W - 20, row.h, 5).fill({ color: 0x05100d, alpha: 0.5 });
      g.roundRect(10, row.y, W - 20, row.h, 5).stroke({ width: 1.2, color: stroke, alpha: strokeAlpha });
      const cy = row.y + row.h / 2;
      g.roundRect(16, cy - 6, 12, 12, 3).stroke({ width: 1.4, color: box, alpha: 0.9 * alpha });
      if (sel) {
        g.roundRect(18.5, cy - 3.5, 7, 7, 2).fill({ color: box, alpha: 0.9 * alpha });
      }
      this.chainTexts[i].alpha = alpha;
      this.chainTexts[i].style.fill = labelColor;
    });

    const sr = this.submitRow;
    const ready = !this.resolved;
    g.roundRect(10, sr.y, W - 20, sr.h, 6).fill({ color: ready ? this.accent : 0x2a3a36, alpha: ready ? 0.92 : 0.5 });
    if (this.submitText) {
      this.submitText.alpha = ready ? 1 : 0.5;
    }
  }

  // 画候选回复行：默认是一张明牌概率列表；思考时高亮所选行 + Thinking 动画；
  // 揭晓时所选行变绿（命中）/ 红（幻觉），其余行压暗。
  private drawOptions(): void {
    const W = REQUEST_PACKET_WIDTH;
    const g = this.bg;
    const dots = 1 + Math.floor((this.thinkMs / 280) % 3);
    const tut = this.request.tutorial;
    const tutPulse = 0.5 + Math.sin(this.tutorialPulse * 2) * 0.5;

    this.optionRows.forEach((row, i) => {
      const opt = this.options[i];
      // §03：进度条与配色改用「模糊档位」的粗粒度宽度，不暴露精确概率。无档位（教学/重磅）则不画条。
      const barFrac = Math.min(1, Math.max(0, this.optionTierFrac[i] ?? 0));
      const hasTier = this.showTier && opt.kind !== "dead" && (this.optionTierLabel[i] ?? "") !== "";
      const pc = opt.kind === "dead" ? DEAD_COLOR : hasTier ? probColor(barFrac) : this.accent;
      let labelColor = opt.kind === "dead" ? 0x9fb1ab : 0xeaf4ef;
      let alpha = 1;
      let stroke = this.accent;
      let strokeAlpha = 0.18;

      if (this.phase === "idle" && tut) {
        // 教学：未亮起的选项灰着锁定；被引导的选项呼吸高亮。
        if (!tut.allowed.includes(i)) {
          alpha = 0.22;
        } else if (tut.highlight === i) {
          stroke = GREEN;
          strokeAlpha = 0.45 + tutPulse * 0.45;
          labelColor = 0xeafff0;
        }
      }

      if (this.phase === "thinking") {
        if (i === this.chosenIndex) {
          stroke = THINK;
          strokeAlpha = 0.6;
          labelColor = THINK;
        } else {
          alpha = 0.3;
        }
      } else if (this.phase === "revealed" && this.outcome) {
        if (i === this.chosenIndex) {
          const c = this.outcome.dead ? 0x8a948f : this.outcome.brilliant ? BRILLIANT_COLOR : this.outcome.hit ? GREEN : RED;
          stroke = c;
          strokeAlpha = 0.65;
          labelColor = c;
        } else {
          alpha = 0.25;
        }
      }

      // 回复行：暗底 track + 背后一条「档位进度条」（粗粒度宽度=模糊档位，颜色按高低）+ 状态描边。
      // 无档位（教学纯线索 / 重磅纯信息）则不画进度条，只留干净的行底。
      const bx = 12;
      const bw = W - 24;
      g.roundRect(bx, row.y, bw, row.h, 7).fill({ color: 0x0a1714, alpha: 0.5 * alpha + 0.32 });
      const fillW = hasTier ? Math.max(7, bw * barFrac) : 0;
      if (fillW > 0) {
        g.roundRect(bx, row.y, fillW, row.h, 7).fill({ color: pc, alpha: 0.32 * alpha });
      }
      if (strokeAlpha > 0.22) {
        g.roundRect(bx, row.y, bw, row.h, 7).stroke({ width: 1.4, color: stroke, alpha: strokeAlpha });
      } else {
        g.roundRect(bx, row.y, bw, row.h, 7).stroke({ width: 1, color: pc, alpha: 0.4 * alpha });
      }
      // 文字与右侧「模糊档位」之间一条淡分隔线，看着更清爽（仅在显示档位时）。
      if (this.phase === "idle" && hasTier) {
        const dx = W - 98;
        g.moveTo(dx, row.y + 8).lineTo(dx, row.y + row.h - 8).stroke({ width: 1, color: 0xffffff, alpha: 0.08 * alpha });
      }

      // 教学引导箭头：在被高亮选项左侧画一个呼吸的指向三角。
      if (this.phase === "idle" && tut && tut.highlight === i) {
        const ay = row.y + row.h / 2;
        g.poly([{ x: -16, y: ay - 6 }, { x: -5, y: ay }, { x: -16, y: ay + 6 }]).fill({ color: GREEN, alpha: 0.5 + tutPulse * 0.45 });
      }

      const label = this.optionTexts[i];
      const prob = this.optionProbTexts[i];
      label.alpha = alpha;
      label.style.fill = labelColor;
      prob.alpha = alpha;
      // 平时让档位文案用概率色（高绿低红）；揭晓时改显 命中/惊艳/幻觉。
      if (this.phase === "idle") {
        prob.style.fill = opt.kind === "dead" ? 0x9fb1ab : pc;
      }

      if (this.phase === "thinking" && i === this.chosenIndex) {
        label.text = "Thinking" + ".".repeat(dots);
        prob.text = "";
      } else if (this.phase === "revealed" && i === this.chosenIndex && this.outcome && !this.outcome.dead) {
        // 不改正文（加前缀会让长回答重新折行、撑高错位）——结果靠右侧 命中/惊艳/幻觉 + 整行变色表达。
        const o = this.outcome;
        prob.text = o.brilliant ? "★惊艳" : o.hit ? "✓命中" : "✕幻觉";
        prob.style.fill = o.brilliant ? BRILLIANT_COLOR : o.hit ? GREEN : RED;
      }
    });

    if (this.hintText) {
      this.hintText.alpha = this.phase === "idle" ? 0.9 : 0.35;
    }
  }
}
