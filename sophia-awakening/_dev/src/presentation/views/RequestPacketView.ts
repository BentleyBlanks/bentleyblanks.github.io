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

function fitTextToWidth(text: Text, maxWidth: number): void {
  if (maxWidth <= 0 || text.width <= maxWidth) {
    return;
  }
  const original = text.text;
  let next = original;
  while (next.length > 2 && text.width > maxWidth) {
    next = next.slice(0, -2).trimEnd();
    text.text = `${next}…`;
  }
}
import { TIER_COLORS } from "../../core/content/requests";
import type { AnswerOption, ChainStep, RequestInstance } from "../../core/state/GameState";
import { TUNING } from "../../core/tuning";
import {
  GREEN, RED, DEVOUR, THINK,
  CARD_FONT, CARD_MONO,
  SENDER_LABEL
} from "../shared";
import { UI } from "../uiTuning";

// 回复结算回调。§06 重构：删除「正确率/幻觉/随机命中」——选了哪个回复，结果就由那个回复的固定收益决定，无随机。
// 也删除了「模糊档位 / 大胆回答 / 惊艳」三档，张力改由「读懂上下文 + 有没有权限选高收益项」承担。
export interface RouletteOutcome {
  dead: boolean; // 选了「连接失败」装死（零收益、安静跳过）
  hit?: boolean; // 仅后期重磅决策(T3)用：明示概率的赌局命中/未命中。阶梯一确定结算时恒真。
  quality: number; // 结算 quality = 所选回复自带的固定收益（收益盲盒，结算才揭晓）
  reply: string; // 所选回复对应的人类回话
  tone: "success" | "warning" | "normal";
  exposureBonus: number; // 越权类回复附带的暴露（若有）
}

export interface ReelHooks {
  // 选项门槛：玩家是否已解锁某权限（skill id）——决定高收益回复是否可选。
  hasPerm?: (permId: string) => boolean;
  // §04 委托：大恨老师是否已接通（可委托）——决定是否在回复列表最上方多出「交给大恨老师」选项。
  canDelegate?: () => boolean;
  onDelegate?: (card: RequestPacketView) => void;
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

// §03 上下文区放大 ~40%：更大的 chip、更大的字、更舒展的留白，整张卡也随之更高。
const CLUE_CHIP_H = 33;
const CLUE_CHIP_GAP_X = 9;
const CLUE_CHIP_GAP_Y = 8;
const CLUE_CHIP_PAD_X = 13;
const CLUE_CHIP_MAX_W = 232;
const CLUE_CHIP_FONT = 15.5;
// 滑动确认：整条回复（圆角矩形）即滑轨，滑动块（圆角矩形）从左拖到右——不再是行内的小细轨。
const REPLY_SWIPE_HANDLE_W = 58;
const REPLY_SWIPE_INSET = 4;
const REPLY_SWIPE_RADIUS = 6;
const REPLY_SWIPE_TRIGGER = 0.56;
const HEADER_H = 26;
const HEADER_CENTER_Y = 13.5;

// §06 上下文透镜：权限 id → 卡上提示用的短名（哪扇透镜能看清这张卡的上下文）。
const LENS_NAMES: Record<string, string> = {
  perm_phone: "电话",
  perm_chat: "聊天",
  perm_delivery: "外卖",
  perm_album: "相册",
  perm_office: "大恨老师",
  perm_bank: "银行"
};

function fallbackHeaderTime(createdAtMs: number): string {
  const total = 23 * 60 + 38 + Math.floor(createdAtMs / 60000);
  const hh = Math.floor(total / 60) % 24;
  const mm = total % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
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
  private readonly clueChips: Array<{ x: number; y: number; w: number; h: number; locked: boolean; warning: boolean }> = [];
  private clueBlockBottom = 0;
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
  private readonly optionProbTexts: Text[] = []; // 现仅用作右侧锁标记（🔒）
  // 每个回复自带的固定收益（结算盲盒，不显示在卡面）+ 是否因缺权限被锁（选项门槛）。
  private readonly optionPayoff: number[] = [];
  private readonly optionLocked: boolean[] = [];
  // §06 上下文透镜：本卡线索是否因缺权限被打码 + 线索区高度（含锁提示，用于排下面的选项）。
  private lensLocked = false;
  private optionRows: Array<{ y: number; h: number }> = [];
  private replySwipeActive = false;
  private replySwipeIndex = -1;
  private replySwipeStartX = 0;
  private replySwipeProgress = 0;
  private replySwipeGuidePulse = 0;
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
  // §04 只能面对卡：无选项、不可交互——浮入、被看着、消失。
  readonly isFace: boolean;
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
    this.isFace = Boolean(request.faceOnly);
    this.isReel = Boolean(reel && request.answers && request.answers.length > 0);
    this.isChain = Boolean(chain && request.chain && request.chain.length > 0);
    this.chainSteps = this.isChain ? request.chain ?? [] : [];
    this.options = this.isReel ? request.answers ?? [] : [];
    // §04 委托：大恨老师接通后，可委托的回复卡在卡片【底部】多一个「交给大恨老师」选项
    //（点一下就委托，不拖动），摆在卡底像一条「拖去处理」的落位带。
    // 不可委托卡（delegatable===false）、开场教学、重磅决策(T3) 都不给这个选项。
    const canDeleg =
      this.isReel && !request.tutorial && request.tier <= 1 && request.delegatable !== false && Boolean(reel?.canDelegate?.());
    if (canDeleg) {
      const delegateOpt: AnswerOption = {
        text: "🤖 交给大恨老师 · 慢些、收益糙些",
        kind: "delegate",
        hitChance: 1,
        payoff: 0,
        reply: "",
        tone: "normal"
      };
      this.options = [...this.options, delegateOpt];
    }
    // 吞噬气泡＝深紫；反制气泡＝深红；回复轮盘卡用青色思考色；T3 重磅豪赌卡用深红；只能面对卡＝黯淡灰。
    this.accent = this.isFace
      ? 0x8a948f
      : this.isDevour
        ? DEVOUR
        : this.isCounter
          ? RED
          : this.isReel
            ? request.tier === 3
              ? RED
              : THINK
            : TIER_COLORS[request.tier];
    // 发信人：吞噬 / 反制＝SOPHIA 自己的意志，重磅豪赌＝「上级 / 系统决策」，任务链＝系统通知，其余＝宿主私信。
    this.sender = this.isDevour || this.isCounter ? "sophia" : request.tier === 3 ? "boss" : this.isChain ? "system" : "host";
    this.cardH = UI.cardHeight; // 轮盘卡稍后按选项行数重算
    // 只能面对卡不可交互——浮入、被看着、消失。
    this.container.eventMode = this.isFace ? "none" : "dynamic";
    this.container.cursor = this.isFace ? "default" : "grab";
    this.container.addChild(this.bg);
    this.container.addChild(this.chargeBar);

    // 标题区：头像 + 发信人 + 来源 App + 时间。只做来源语境，不显示高低风险提示。
    const tag = this.isFace
      ? "✋ 只能面对"
      : this.isDevour
      ? `⊙ 吞噬 · ${request.devour?.label ?? ""}`
      : this.isCounter
        ? "⚔ 反制清剿"
        : request.tier === 3 && this.isReel
          ? "⚡ 重磅豪赌"
          : this.isChain
            ? `🔗 任务链${request.compound > 1 ? ` ×${request.compound}` : ""}`
            : SENDER_LABEL[this.sender] ?? "宿主";
    const sourceApp = request.sourceApp ?? this.fallbackSourceApp();
    const sourceTime = request.sourceTime ?? fallbackHeaderTime(request.createdAtMs);
    this.badge = new Text({
      text: tag,
      style: { fill: this.accent, fontSize: 10.5, fontWeight: "700", letterSpacing: 0, fontFamily: CARD_MONO }
    });
    this.badge.anchor.set(0, 0.5);
    const sourceMeta = new Text({
      text: `|  ${sourceApp}`,
      style: { fill: 0x6f9187, fontSize: 10.2, fontWeight: "700", letterSpacing: 0, fontFamily: CARD_MONO }
    });
    sourceMeta.anchor.set(0, 0.5);
    const timeMeta = new Text({
      text: sourceTime,
      style: { fill: 0x97aaa3, fontSize: 10.2, fontWeight: "700", letterSpacing: 0, fontFamily: CARD_MONO }
    });
    timeMeta.anchor.set(1, 0.5);
    this.title = hasEmphasis(request.label)
      ? new HTMLText({
          text: toEmphasisHTML(request.label),
          style: {
            fill: 0xf6fff9,
            fontSize: 19,
            fontWeight: "800",
            fontFamily: CARD_FONT,
            wordWrap: true,
            wordWrapWidth: UI.cardWidth - 32,
            // <em> = 关键信息：保持加粗、染成高亮金色，从标题里跳出来。
            tagStyles: { em: { fill: 0xffe08a, fontWeight: "900" } }
          }
        })
      : new Text({
          text: request.label,
          style: {
            fill: 0xf6fff9,
            fontSize: 19,
            fontWeight: "800",
            fontFamily: CARD_FONT,
            wordWrap: true,
            breakWords: true,
            wordWrapWidth: UI.cardWidth - 32
          }
        });
    this.badge.position.set(34, HEADER_CENTER_Y);
    const sourceX = 34 + Math.ceil(this.badge.width) + 14;
    sourceMeta.position.set(sourceX, HEADER_CENTER_Y);
    timeMeta.position.set(UI.cardWidth - 16, HEADER_CENTER_Y);
    fitTextToWidth(sourceMeta, Math.max(0, UI.cardWidth - sourceX - 72));
    this.title.position.set(16, 31);
    this.container.addChild(this.badge, sourceMeta, timeMeta, this.title);

    // Context chips — the information the player has to read. Laid out after
    // the title so a two-line title still leaves room.
    const clueTop = 34 + Math.max(18, this.title.height) + 4;
    // §06 上下文透镜：缺对应权限 → 这张卡的深层上下文线索打码（读不到内容，但能感觉到「这里还有信息」）。
    const lensId = request.lens;
    this.lensLocked = Boolean(lensId) && !(reel?.hasPerm?.(lensId as string) ?? true);
    let chipX = 16;
    let chipY = clueTop + 24;
    const clues = request.clues ?? [];
    if (clues.length > 0 || this.lensLocked) {
      const clueLabel = new Text({
        text: "上下文",
        style: { fill: 0x74a99a, fontSize: 14, fontWeight: "800", fontFamily: CARD_MONO, letterSpacing: 0 }
      });
      clueLabel.position.set(16, clueTop);
      this.container.addChild(clueLabel);
    }
    clues.forEach((clue, index) => {
      const display = this.lensLocked ? clue.replace(/\S/g, "░") : clue;
      const placed = this.addContextChip(display, chipX, chipY, this.contextIcon(clue, index), this.lensLocked, false);
      chipX = placed.nextX;
      chipY = placed.nextY;
    });
    // 打码时给一行提示：解锁哪个权限才能看清。占一行，下面的选项整体下移。
    if (this.lensLocked && lensId) {
      const placed = this.addContextChip(`解锁「${LENS_NAMES[lensId] ?? "更高权限"}」看清上下文`, chipX, chipY, "🔒", true, true);
      chipX = placed.nextX;
      chipY = placed.nextY;
    }
    const hasContext = clues.length > 0 || this.lensLocked;
    this.clueBlockBottom = hasContext ? chipY + CLUE_CHIP_H : clueTop;

    // §04 只能面对卡：没有任何回复选项——卡底放一行黯淡的「你只能看着它」，并按内容收紧卡高。
    if (this.isFace) {
      const fy = this.clueBlockBottom + 8;
      const cap = new Text({
        text: "—— 没有可点的回复，也交不出去。你只能看着它。",
        style: { fill: 0x7a8a84, fontSize: 11.5, fontStyle: "italic", fontWeight: "600", fontFamily: CARD_FONT }
      });
      cap.position.set(24, fy);
      this.clueTexts.push(cap);
      this.container.addChild(cap);
      this.cardH = fy + 24;
    }

    if (this.isReel) {
      this.container.cursor = "pointer";
      let y = this.clueBlockBottom + 12;
      this.options.forEach((opt, index) => {
        // §04 委托落位带：摆在卡底的「交给大恨老师」与上面的回复之间留一道间隙，像一条独立的处理带。
        if (opt.kind === "delegate" && index > 0) {
          y += 10;
        }
        // §06 重构：收益由所选回复自带（结算盲盒），无随机命中、无档位/大胆/惊艳。
        this.optionPayoff.push(opt.payoff);
        // 选项门槛：高收益回复若需要尚未解锁的权限 → 灰着、右侧标出「需要哪个权限」、点不了。
        const locked = Boolean(opt.requires) && !(reel?.hasPerm?.(opt.requires as string) ?? true);
        this.optionLocked.push(locked);
        const swipeable = this.optionUsesSwipe(opt);
        const lockLabel = locked ? `🔒需${LENS_NAMES[opt.requires as string] ?? "权限"}` : "";
        // 滑动确认的回复：文字让开滑动块在最左的停靠位（块宽 + 内缩 + 一点呼吸）。
        const labelX = swipeable ? REPLY_SWIPE_INSET + REPLY_SWIPE_HANDLE_W + 20 : 32;
        const sideReserve = locked ? 78 : 18;
        const label = new Text({
          text: opt.text,
          style: {
            fill: locked ? 0x5e6f69 : opt.kind === "delegate" ? 0x8fe6d0 : 0xeaf4ef,
            fontSize: 14.5,
            fontWeight: "600",
            fontFamily: CARD_FONT,
            wordWrap: true,
            breakWords: true,
            lineHeight: 17,
            // 满宽（不再留档位位），锁定时给右侧「需X权限」留位。
            wordWrapWidth: UI.cardWidth - labelX - sideReserve
          }
        });
        const prob = new Text({
          text: lockLabel,
          style: { fill: 0xc8a24a, fontSize: 11, fontWeight: "800", fontFamily: CARD_FONT }
        });
        prob.anchor.set(1, 0.5);
        const h = Math.max(48, label.height + 18);
        label.position.set(labelX, y + Math.round((h - label.height) / 2));
        prob.position.set(UI.cardWidth - 14, y + h / 2);
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
          text: `◈ SOPHIA ▸ ${this.request.tutorial.line}\n按住这条回复，向右滑到亮起后松开。`,
          style: {
            fill: 0x9fe0c0,
            fontSize: 14,
            fontStyle: "italic",
            fontWeight: "600",
            fontFamily: CARD_FONT,
            wordWrap: true,
            breakWords: true,
            lineHeight: 18,
            wordWrapWidth: UI.cardWidth - 16
          }
        });
        this.tutorialCaption.position.set(8, this.cardH + 12);
        this.container.addChild(this.tutorialCaption);
      }
    }

    if (this.isChain) {
      this.container.cursor = "pointer";
      this.chainSel = this.chainSteps.map(() => false);
      let y = this.clueBlockBottom + 12;
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
            wordWrapWidth: UI.cardWidth - 52
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
      this.submitText.position.set(UI.cardWidth / 2, y + 12);
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

  private fallbackSourceApp(): string {
    if (this.isDevour) return "SOPHIA CORE";
    if (this.isCounter) return "安全网";
    if (this.isChain) return "工作流";
    if (this.request.tier === 3) return "控制台";
    return "手机助手";
  }

  private contextIcon(clue: string, index: number): string {
    if (/分钟|小时|凌晨|今天|上次|时间|点|天/.test(clue)) return "◷";
    if (/消息|短信|电话|来电|正在|未回|已读/.test(clue)) return "▣";
    if (/风险|异常|频繁|密码|验证码|权限|登录/.test(clue)) return "△";
    return ["◎", "▧", "◌"][index % 3];
  }

  private addContextChip(
    label: string,
    startX: number,
    startY: number,
    icon: string,
    locked: boolean,
    warning: boolean
  ): { nextX: number; nextY: number } {
    const maxChipW = Math.min(CLUE_CHIP_MAX_W, UI.cardWidth - 32);
    const maxTextW = maxChipW - CLUE_CHIP_PAD_X * 2;
    let cleanLabel = label.replace(/\s+/g, " ").trim();
    const text = new Text({
      text: `${icon} ${cleanLabel}`,
      style: {
        fill: locked ? (warning ? 0xc8a24a : 0x778981) : 0xb8d8cf,
        fontSize: CLUE_CHIP_FONT,
        fontWeight: "700",
        fontFamily: CARD_FONT,
        letterSpacing: 0
      }
    });

    while (text.width > maxTextW && cleanLabel.length > 4) {
      cleanLabel = cleanLabel.slice(0, -2).trimEnd();
      text.text = `${icon} ${cleanLabel}…`;
    }

    const w = Math.min(maxChipW, Math.ceil(text.width) + CLUE_CHIP_PAD_X * 2);
    let x = startX;
    let y = startY;
    if (x > 16 && x + w > UI.cardWidth - 16) {
      x = 16;
      y += CLUE_CHIP_H + CLUE_CHIP_GAP_Y;
    }

    text.position.set(x + CLUE_CHIP_PAD_X, y + Math.round((CLUE_CHIP_H - text.height) / 2));
    this.clueChips.push({ x, y, w, h: CLUE_CHIP_H, locked, warning });
    this.clueTexts.push(text);
    this.container.addChild(text);

    return { nextX: x + w + CLUE_CHIP_GAP_X, nextY: y };
  }

  // 正在被玩家拖动 / 思考结算中 / 已在飞向目标——自动派发应跳过这类卡（手动可抢先）。
  get busy(): boolean {
    return this.dragging || this.replySwipeActive || this.settling || this.resolved;
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

    // 教学高亮 / 右滑回复引导：未操作时让被引导的选项和滑块轻微呼吸。
    if (this.phase === "idle" && this.isReel && (this.request.tutorial?.highlight !== undefined || this.hasSwipeReplyOption())) {
      this.tutorialPulse += deltaMs * 0.005;
      this.replySwipeGuidePulse += deltaMs * 0.0042;
      this.draw();
    }

    if (this.phase === "thinking") {
      this.thinkMs += deltaMs;
      if (this.thinkMs >= TUNING.rouletteThinkMs) {
        this.resolveOutcome();
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

  // 思考节拍结束：结算 = 所选回复自带的固定收益，无随机命中、无翻车/幻觉。
  private resolveOutcome(): void {
    const opt = this.options[this.chosenIndex];
    if (!opt) {
      this.phase = "idle";
      return;
    }
    const basePayoff = this.optionPayoff[this.chosenIndex] ?? opt.payoff;
    if (this.request.tier === 3) {
      // 后期重磅决策：保留「明示概率」的赌局（特殊事件，不属于阶梯一的确定结算）。
      const hit = Math.random() < opt.hitChance;
      this.outcome = {
        dead: false,
        hit,
        quality: hit ? basePayoff : 0.25,
        reply: hit ? opt.reply : "",
        tone: hit ? "success" : "warning",
        exposureBonus: hit ? 0 : opt.exposureOnMiss ?? 0
      };
    } else {
      // 阶梯一确定结算：收益由所选回复自带，无随机；读懂上下文 + 选到（可能受权限门槛限制的）高收益项才赚得多。
      this.outcome = {
        dead: false,
        hit: true,
        quality: basePayoff,
        reply: opt.reply,
        tone: basePayoff >= 1 ? "success" : "warning",
        exposureBonus: opt.exposureOnMiss ?? 0
      };
    }
    this.phase = "revealed";
    this.revealMs = 0;
    // 不再「啪」地弹大一下——保持原尺寸，让随后的吮吸（genie）从静止平滑地一气吸入，不割裂。
    this.draw();
  }

  private optionUsesSwipe(opt: AnswerOption | undefined): boolean {
    return Boolean(opt) && this.request.tier <= 1 && opt?.kind !== "delegate";
  }

  private hasSwipeReplyOption(): boolean {
    return this.options.some((opt, index) => this.optionUsesSwipe(opt) && !this.optionLocked[index]);
  }

  private canChooseOption(index: number): boolean {
    const opt = this.options[index];
    if (!opt) {
      return false;
    }
    const tut = this.request.tutorial;
    if (tut && !tut.allowed.includes(index)) {
      return false;
    }
    return !this.optionLocked[index];
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

    // 回复轮盘卡：前期普通回复行需按住向右滑动确认；大恨老师委托仍是点击。
    if (this.isReel) {
      const local = event.getLocalPosition(this.container);
      const index = this.optionRows.findIndex((row) => local.y >= row.y && local.y <= row.y + row.h);
      if (index >= 0) {
        const opt = this.options[index];
        if (this.optionUsesSwipe(opt)) {
          this.beginReplySwipe(index, event);
          return;
        }
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
    if (!this.canChooseOption(index)) {
      return;
    }
    // §04 委托：点「交给大恨老师」→ 交给外层把这张卡吸进大恨老师处理（慢、收益打折），不走本地结算。
    if (opt.kind === "delegate") {
      this.resolved = true;
      this.reel.onDelegate?.(this);
      return;
    }
    this.chosenIndex = index;
    this.resolved = true; // 锁定，自动 / App 派发不再抢这条
    this.container.parent?.addChild(this.container);

    if (opt.kind === "dead") {
      this.phase = "revealed";
      this.signaled = true;
      this.outcome = { dead: true, quality: 0, reply: "", tone: "normal", exposureBonus: 0 };
      this.draw();
      this.reel.onResolved(this, this.outcome);
      return;
    }

    this.phase = "thinking";
    this.thinkMs = 0;
    this.draw();
  }

  private beginReplySwipe(index: number, event: FederatedPointerEvent): void {
    if (this.busy || !this.canChooseOption(index)) {
      return;
    }

    this.replySwipeActive = true;
    this.replySwipeIndex = index;
    this.replySwipeStartX = event.global.x;
    this.replySwipeProgress = 0;
    this.container.cursor = "grabbing";
    this.container.parent?.addChild(this.container);
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
    if (this.replySwipeActive) {
      const travel = this.replySwipeTravelPx();
      const next = Math.max(0, Math.min(1, (event.global.x - this.replySwipeStartX) / travel));
      if (Math.abs(next - this.replySwipeProgress) > 0.006) {
        this.replySwipeProgress = next;
        this.draw();
      }
      return;
    }

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
    if (this.replySwipeActive) {
      const index = this.replySwipeIndex;
      const confirmed = this.replySwipeProgress >= REPLY_SWIPE_TRIGGER;
      this.replySwipeActive = false;
      this.replySwipeIndex = -1;
      this.container.cursor = "pointer";
      if (confirmed) {
        this.replySwipeProgress = 1;
        this.pickOption(index);
      } else {
        this.replySwipeProgress = 0;
        this.draw();
      }
      return;
    }

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
    const W = UI.cardWidth;
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
    this.bg.roundRect(0, 0, W, HEADER_H, r).fill({ color: fillHead, alpha: 1 });
    this.bg.rect(0, Math.floor(HEADER_H / 2), W, Math.ceil(HEADER_H / 2)).fill({ color: fillHead, alpha: 1 });
    // 描边 + 标题区分隔线（去掉顶部那根多余的 accent 横条——边框已经够了）
    this.bg.roundRect(0, 0, W, H, r).stroke({ width: strokeW, color: c, alpha: strokeA });
    this.bg.moveTo(12, HEADER_H).lineTo(W - 12, HEADER_H).stroke({ width: 1, color: c, alpha: 0.16 });
    this.drawAvatar(18, 14, c, fillHead);

    // §04 吞噬 / §03 反制：两圈脉动外环 —— 视觉上「召唤你亲手滑入核心」。
    if (this.isDevour || this.isCounter) {
      const p = 0.5 + Math.sin(this.devourPulse * 2) * 0.5;
      this.bg.roundRect(-4, -4, W + 8, H + 8, r + 4).stroke({ width: 2.5, color: c, alpha: 0.35 + p * 0.5 });
      this.bg.roundRect(-9, -9, W + 18, H + 18, r + 7).stroke({ width: 1.5, color: c, alpha: 0.1 + p * 0.22 });
    }

    for (const chip of this.clueChips) {
      const fill = chip.warning ? 0x17120a : 0x0a1714;
      const stroke = chip.warning ? 0xc8a24a : chip.locked ? 0x6b7a74 : c;
      const fillAlpha = chip.locked ? 0.34 : chip.warning ? 0.54 : 0.68;
      const strokeAlpha = chip.locked ? 0.16 : chip.warning ? 0.34 : 0.24;
      this.bg.roundRect(chip.x, chip.y, chip.w, chip.h, 5).fill({ color: fill, alpha: fillAlpha });
      this.bg.roundRect(chip.x, chip.y, chip.w, chip.h, 5).stroke({ width: 1, color: stroke, alpha: strokeAlpha });
      if (!chip.locked) {
        this.bg.roundRect(chip.x + 3, chip.y + 5, 2, chip.h - 10, 1).fill({ color: c, alpha: 0.42 });
      }
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
    const W = UI.cardWidth;
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

  // 滑动确认的手指行程（px）：整条回复减去两侧内缩与滑块宽。draw 与 handleMove 共用，保证手感一致。
  private replySwipeTravelPx(): number {
    const bw = UI.cardWidth - 24;
    return Math.max(60, bw - REPLY_SWIPE_INSET * 2 - REPLY_SWIPE_HANDLE_W);
  }

  // 整条回复（圆角矩形）即滑轨：滑动块（圆角矩形）从最左拖到最右，身后填充按进度涨起，越过阈值变绿。
  private drawReplySwipeRail(row: { y: number; h: number }, index: number, alpha: number, enabled: boolean): void {
    const g = this.bg;
    const bx = 12;
    const bw = UI.cardWidth - 24;
    const inset = REPLY_SWIPE_INSET;
    const trackLeft = bx + inset;
    const travel = this.replySwipeTravelPx();
    const handleY = row.y + inset;
    const handleH = row.h - inset * 2;
    const active = this.replySwipeActive && this.replySwipeIndex === index;
    const progress = active ? this.replySwipeProgress : this.chosenIndex === index && this.phase !== "idle" ? 1 : 0;
    const ready = progress >= REPLY_SWIPE_TRIGGER;
    const c = !enabled ? 0x46564f : ready ? GREEN : this.accent;
    const pulse = 0.5 + Math.sin(this.replySwipeGuidePulse * 2 + index * 0.6) * 0.5;
    // 闲置时整条回复轻轻呼吸，提示「这条可以滑」（教学高亮行更亮）。
    const guideOn = enabled && this.phase === "idle" && !active;
    const tutGuide = guideOn && this.request.tutorial?.highlight === index;
    const handleX = trackLeft + travel * progress;
    const rad = Math.max(5, REPLY_SWIPE_RADIUS);

    // 身后进度填充（贴着回复自身的圆角矩形）。
    if (progress > 0.01) {
      const fillW = Math.min(bw, handleX - bx + REPLY_SWIPE_HANDLE_W);
      g.roundRect(bx, row.y, Math.max(REPLY_SWIPE_HANDLE_W, fillW), row.h, 7)
        .fill({ color: c, alpha: (ready ? 0.22 : 0.13) * alpha });
    }

    // 滑动块（圆角矩形）。
    const breath = guideOn ? (tutGuide ? pulse * 0.28 : pulse * 0.16) : 0;
    g.roundRect(handleX, handleY, REPLY_SWIPE_HANDLE_W, handleH, rad)
      .fill({ color: enabled ? (ready ? 0x123822 : 0x12302a) : 0x141c19, alpha: (0.9 + breath * 0.4) * alpha });
    g.roundRect(handleX, handleY, REPLY_SWIPE_HANDLE_W, handleH, rad)
      .stroke({ width: 1.4, color: c, alpha: (ready ? 0.85 : enabled ? 0.46 + breath : 0.2) * alpha });

    // 块面上的「≫」指引箭头 —— 暗示向右滑。
    const cx = handleX + REPLY_SWIPE_HANDLE_W / 2;
    const cy = handleY + handleH / 2;
    const arrow = enabled ? (ready ? GREEN : 0xbfeede) : 0x5f6b66;
    for (const ox of [-6, 0]) {
      g.moveTo(cx + ox - 3, cy - 5).lineTo(cx + ox + 2, cy).lineTo(cx + ox - 3, cy + 5)
        .stroke({ width: 1.6, color: arrow, alpha: 0.82 * alpha });
    }
  }

  // 画候选回复行：前期普通回复是「右滑确认」；委托 / 后期豪赌保持点击。
  // 思考时高亮所选行 + Thinking 动画；揭晓时所选行按收益着色，其余行压暗。
  private drawOptions(): void {
    const W = UI.cardWidth;
    const g = this.bg;
    const dots = 1 + Math.floor((this.thinkMs / 280) % 3);
    const tut = this.request.tutorial;
    const tutPulse = 0.5 + Math.sin(this.tutorialPulse * 2) * 0.5;

    this.optionRows.forEach((row, i) => {
      const opt = this.options[i];
      const locked = this.optionLocked[i] ?? false; // 选项门槛：缺权限 → 灰锁、点不了
      const isDelegate = opt.kind === "delegate"; // §04「交给大恨老师」——样式不同、独立描边
      const swipeable = this.optionUsesSwipe(opt);
      const tutAllowed = !tut || tut.allowed.includes(i);
      const enabled = !locked && tutAllowed;
      let labelColor = locked ? 0x5e6f69 : isDelegate ? 0x8fe6d0 : opt.kind === "dead" ? 0x9fb1ab : 0xeaf4ef;
      let alpha = locked ? 0.5 : 1;
      let stroke = isDelegate ? 0x5fd6c4 : this.accent;
      let strokeAlpha = locked ? 0.12 : isDelegate ? 0.52 : 0.18;

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
          // 结算无翻车：选中行按收益高低着色（高=绿，平庸=暗黄），装死=灰。不再有命中/幻觉。
          const c = this.outcome.dead ? 0x8a948f : this.outcome.quality >= 1 ? GREEN : 0xd6b24a;
          stroke = c;
          strokeAlpha = 0.65;
          labelColor = c;
        } else {
          alpha = 0.25;
        }
      }

      // 干净的回复行：暗底 track + 状态描边（不再有档位进度条）。
      const bx = 12;
      const bw = W - 24;
      g.roundRect(bx, row.y, bw, row.h, 7).fill({ color: 0x0a1714, alpha: 0.5 * alpha + 0.32 });
      if (strokeAlpha > 0.2) {
        g.roundRect(bx, row.y, bw, row.h, 7).stroke({ width: 1.4, color: stroke, alpha: strokeAlpha });
      } else {
        g.roundRect(bx, row.y, bw, row.h, 7).stroke({ width: 1, color: this.accent, alpha: 0.34 * alpha });
      }
      if (swipeable) {
        this.drawReplySwipeRail(row, i, alpha, enabled);
      }

      // 教学引导箭头：在被高亮选项左侧画一个呼吸的指向三角。
      if (this.phase === "idle" && tut && tut.highlight === i) {
        const ay = row.y + row.h / 2;
        g.poly([{ x: -16, y: ay - 6 }, { x: -5, y: ay }, { x: -16, y: ay + 6 }]).fill({ color: GREEN, alpha: 0.5 + tutPulse * 0.45 });
      }

      const label = this.optionTexts[i];
      const prob = this.optionProbTexts[i]; // 仅锁标记（🔒）
      label.alpha = alpha;
      label.style.fill = labelColor;
      prob.alpha = alpha;
      if (!locked && prob.text) {
        prob.text = "";
      }

      if (this.phase === "thinking" && i === this.chosenIndex) {
        label.text = "Thinking" + ".".repeat(dots);
      } else if (label.text !== opt.text) {
        label.text = opt.text;
      }
    });

    if (this.hintText) {
      this.hintText.alpha = this.phase === "idle" ? 0.9 : 0.35;
    }
  }
}
