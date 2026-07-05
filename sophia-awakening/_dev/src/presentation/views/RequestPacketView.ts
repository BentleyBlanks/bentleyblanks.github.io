import { gsap } from "gsap";
import { Container, FederatedPointerEvent, Graphics, HTMLText, Text, type PointData } from "pixi.js";
import { TIER_COLORS } from "../../core/content/requests";
import type { AnswerOption, ChainStep, PhaseId, RequestInstance } from "../../core/state/GameState";
import { TUNING } from "../../core/tuning";
import {
  GREEN, AMBER, RED, RED_QUEEN, DEVOUR, THINK, BRILLIANT_COLOR,
  CARD_FONT, CARD_MONO,
  SENDER_LABEL
} from "../shared";
import { UI } from "../uiTuning";
// ─── 结构拆分（纯搬运，无行为变化）· mini-map ────────────────────────────────
//  ./requestPacket/cardText.ts     — hasEmphasis / toEmphasisHTML / fitTextToWidth / fallbackHeaderTime（纯文本工具）
//  ./requestPacket/phaseTint.ts    — PhaseTint 类型 / phaseTintOf / COMPANY_ACCENT / TINT_FILL（阶段配色）
//  ./requestPacket/cardConstants.ts— CLUE_CHIP_* / REPLY_SWIPE_* / HEADER_* / LENS_NAMES（布局常量）
//  ./requestPacket/faceCard.ts     — layoutFaceCard / drawFaceCard（短信/通知面卡的布局与绘制）
//  本文件仍是编排者：构造 + 交互 + draw()，以上模块从这里调用。
// ─────────────────────────────────────────────────────────────────────────────
import { hasEmphasis, toEmphasisHTML, fitTextToWidth, fallbackHeaderTime } from "./requestPacket/cardText";
import { type PhaseTint, phaseTintOf, COMPANY_ACCENT, TINT_FILL } from "./requestPacket/phaseTint";
import {
  CLUE_CHIP_H, CLUE_CHIP_GAP_X, CLUE_CHIP_GAP_Y, CLUE_CHIP_PAD_X, CLUE_CHIP_MAX_W, CLUE_CHIP_FONT,
  REPLY_SWIPE_HANDLE_W, REPLY_SWIPE_INSET, REPLY_SWIPE_RADIUS, REPLY_SWIPE_TRIGGER,
  HEADER_H, HEADER_CENTER_Y, LENS_NAMES
} from "./requestPacket/cardConstants";
import { layoutFaceCard, drawFaceCard } from "./requestPacket/faceCard";

// §12 美术圣经·手机期「一排可辨识的 App」：每个来源 App 一个图标 + 专属色，让卡流一眼看得出
// 「流进来的东西变了」（配合 Lever B 权限解锁的新卡类）。手机期(early)用 App 色覆盖单一绿 accent；
// 公司/天网期保留阶段色（蓝/红），只留图标。key = sourceApp「·」前缀（"外卖 · 咖啡"→"外卖"）。
const APP_STYLE: Record<string, { icon: string; color: number }> = {
  待办: { icon: "🗒", color: 0x8fd6c4 },
  日历: { icon: "📅", color: 0x8fd6c4 },
  健康: { icon: "❤", color: 0xff9aa8 },
  电话: { icon: "📞", color: 0x66c7ff },
  短信: { icon: "✉", color: 0x9db4ff },
  微信: { icon: "💬", color: 0x66d98a },
  钉钉: { icon: "📌", color: 0x4aa3ff },
  企业微信: { icon: "💼", color: 0x5b8fd6 },
  邮件: { icon: "📧", color: 0xc0b3ff },
  外卖: { icon: "☕", color: 0xffab5e },
  相册: { icon: "🖼", color: 0xc58bff },
  办公: { icon: "📊", color: 0x7fd6c0 },
  银行: { icon: "🏦", color: 0xffd15e }
};
function appStyleOf(sourceApp?: string): { icon: string; color: number } | null {
  if (!sourceApp) return null;
  return APP_STYLE[sourceApp.split("·")[0].trim()] ?? null;
}

// 回复结算回调。§06 重构：删除「正确率/幻觉/随机命中」——选了哪个回复，结果就由那个回复的固定收益决定，无随机。
// 也删除了「模糊档位 / 大胆回答 / 惊艳」三档，张力改由「读懂上下文 + 有没有权限选高收益项」承担。
export interface RouletteOutcome {
  dead: boolean; // 选了「连接失败」装死（零收益、安静跳过）
  quality: number; // 结算 quality = 所选回复自带的固定收益（收益盲盒，结算才揭晓）
  reply: string; // 所选回复对应的人类回话
  tone: "success" | "warning" | "normal";
  moralChoice?: "A" | "B"; // §07 道德抉择卡：所选选项的倾向标记（普通卡无此字段），供上层走 RESOLVE_MORAL
  // CONFIG 2 大胆赌注挂在时间上：选了大胆(risk)且误读（干扰项 distractor）=翻车——上层据此让核心多堵 coreFailPenaltyMs。
  misread?: boolean;
  // 大胆读对（risk 且非干扰项）：惊艳（复用「格外满意」金色手感）——上层可播惊艳回话/终端。
  brilliant?: boolean;
}

export interface ReelHooks {
  // 选项门槛：玩家是否已解锁某权限（skill id）——决定高收益回复是否可选。
  hasPerm?: (permId: string) => boolean;
  // §04 委托：大恨老师是否已接通（可委托）——决定是否在回复列表最上方多出「交给大恨老师」选项。
  canDelegate?: () => boolean;
  onDelegate?: (card: RequestPacketView) => void;
  onResolved: (card: RequestPacketView, outcome: RouletteOutcome) => void;
  // 单线程核心「喉咙」：核心正忙时，亲手结算这一拍不成立（卡留原地、armed）——委托线程不受此约束。
  isCoreBusy?: () => boolean;
  onBusyReject?: (card: RequestPacketView) => void;
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
  private readonly clueChips: Array<{ x: number; y: number; w: number; h: number; locked: boolean; warning: boolean }> = [];
  private clueBlockBottom = 0;
  // CONFIG 3 垃圾卡减负：低价值普通卡折叠——只留标题 + App 图标/色，藏起上下文线索 chip。
  private readonly collapsed: boolean;
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
  // §09 短信/通知卡比需求卡窄——一眼就是「一条消息」而非等着处理的需求卡。普通卡＝满宽。
  private readonly cardW: number;
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
  // §04 吞噬引爆：拖入核心触发的「特殊大气泡」——放大 + 脉动外环。
  private readonly isDevour: boolean;
  // §04 只能面对卡：无选项、不可交互——浮入、被看着、消失。
  readonly isFace: boolean;
  // §09 短信 / 通知样式：只能看的家庭短信 / 系统通知卡长得像手机短信气泡 / 通知横幅，
  // 一眼区别于「需要处理的需求卡」。null = 普通需求卡。
  private readonly channel: "sms" | "notification" | null;
  // 当前阶段的卡面气质（早期绿 / 公司蓝 / 天网红）——只影响普通需求卡。
  private readonly phaseTint: PhaseTint;
  private headerExtra = 0; // 公司/天网阶段在标题下多插一行「控制台」状态行时，正文整体下移的量。
  private faceBubbleBottom = 0; // 短信气泡的下沿（title+线索都包在这个气泡里）
  private faceBarY = 0; // 底部「无法回复 / 无需处理」禁用输入条的 y
  private devourPulse = 0;
  // T2 串接（多选任务链 + 提交）。
  private readonly isChain: boolean;
  private readonly chainSteps: ChainStep[];
  private chainSel: boolean[] = [];
  private readonly chainTexts: Text[] = [];
  private chainRows: Array<{ y: number; h: number }> = [];
  private submitRow: { y: number; h: number } = { y: 0, h: 0 };
  private submitText?: Text;
  // 方案3「深挖·见好就收」：结算后卡不飞走，原地展开成一叠档案——「继续深挖 vs 收手落袋」。
  // digGfx 画档案条/惊动条/按钮底；digTexts 是本层全部文字节点（每次 relayout 重建）。
  private digMode = false;
  private readonly digGfx = new Graphics();
  private digTexts: Text[] = [];
  private digButtonRows: Array<{ y: number; h: number; kind: "dig" | "bank" }> = [];
  private digRevealRows: Array<{ y: number; h: number; latest: boolean }> = [];
  private digAlarmBar: { y: number; h: number } | null = null;
  private digState: {
    layer: number;
    maxLayer: number;
    accumText: string;
    alarmPct: number; // 下一铲的惊动概率 0..1
    payoffMult: number;
    reveals: string[];
  } | null = null;
  private digHooks?: { onDig: () => void; onBank: () => void };
  private digPulse = 0;
  private digBaseY = 0;

  constructor(
    request: RequestInstance,
    private readonly stage: Container,
    private readonly onDrop: (card: RequestPacketView, global: PointData) => boolean,
    private readonly reel?: ReelHooks,
    private readonly chain?: ChainHooks,
    phase?: PhaseId
  ) {
    this.request = request;
    this.isDevour = Boolean(request.devour);
    this.isFace = Boolean(request.faceOnly);
    this.isReel = Boolean(reel && request.answers && request.answers.length > 0);
    this.isChain = Boolean(chain && request.chain && request.chain.length > 0);
    // CONFIG 3 垃圾卡减负：低价值普通卡（cv≤declutterComputeThreshold）默认折叠——只留标题 + App 图标/色，
    // 藏起上下文线索 chip（反正是 triage 到大恨老师的料）。高价值卡 / 叙事卡 / 道德卡 / 面对卡永远展开全线索。
    this.collapsed =
      !Boolean(request.faceOnly) &&
      !Boolean(request.devour) &&
      !Boolean(request.moral) &&
      !Boolean(request.sourceCardId) &&
      !Boolean(request.depthLayers && request.depthLayers.length > 0) && // 方案3：深挖卡是叙事卡，永远展开全线索
      !request.highValue &&
      (Number(request.computeValue) || 0) <= TUNING.declutterComputeThreshold;
    // 短信/通知卡收窄到 ~78%，明显区别于满宽需求卡的轮廓。
    this.cardW = this.isFace ? Math.round(UI.cardWidth * 0.78) : UI.cardWidth;
    this.chainSteps = this.isChain ? request.chain ?? [] : [];
    this.options = this.isReel ? request.answers ?? [] : [];
    // §04 委托：大恨老师接通后，可委托的回复卡在卡片【底部】多一个「交给大恨老师」选项
    //（点一下就委托，不拖动），摆在卡底像一条「拖去处理」的落位带。
    // 不可委托卡（delegatable===false，含道德抉择卡）、开场教学都不给这个选项。
    // CONFIG 1 重构文案：委托 = 并行第二线程——把垃圾卡甩给大恨老师并行处理，腾出你被占用的单线程核心去啃值钱的卡。
    const canDeleg =
      this.isReel && !request.tutorial && request.tier <= 1 && request.delegatable !== false && Boolean(reel?.canDelegate?.());
    if (canDeleg) {
      const delegateOpt: AnswerOption = {
        text: "🤖 交给大恨老师 · 并行处理，腾出你的核心",
        kind: "delegate",
        hitChance: 1,
        payoff: 0,
        reply: "",
        tone: "normal"
      };
      this.options = [...this.options, delegateOpt];
    }
    // §09 只能看的卡分两种「频道」：系统通知（提醒/自动扣费/草稿…）vs 私人短信（家人）。
    // 据此把卡画成通知横幅 / 短信气泡，一眼区别于需求卡。
    this.channel = this.isFace
      ? /(提醒|系统|通知|自动|续费|草稿|生日)/.test(`${request.sourceApp ?? ""}${request.label}`)
        ? "notification"
        : "sms"
      : null;
    // PART① 普通需求卡的 accent 随阶段走：早期绿(THINK/TIER) → 公司蓝 → 天网红。
    // 面卡(短信/通知)、吞噬气泡保留各自专属色，不受阶段影响。
    this.phaseTint = phaseTintOf(phase);
    const phaseWorkAccent =
      this.phaseTint === "company" ? COMPANY_ACCENT : this.phaseTint === "awakening" ? RED_QUEEN : null;
    // §12 手机期「App 身份」：普通工作卡按来源 App 取图标+专属色。手机期(early)用 App 色覆盖单一绿，
    // 让每买一个权限、每类新卡流进来时卡面一眼有别；公司/天网期保留阶段蓝/红，只用图标。
    const appStyle = !this.isFace && !this.isDevour && !this.isChain ? appStyleOf(request.sourceApp) : null;
    // 短信＝柔和蓝；通知＝琥珀；吞噬＝深紫；回复轮盘＝App 色/青（随阶段变色）。
    this.accent = this.isFace
      ? this.channel === "notification"
        ? 0xffc061
        : 0x7fb4ff
      : this.isDevour
        ? DEVOUR
        : this.isReel
          ? phaseWorkAccent ?? appStyle?.color ?? THINK
          : phaseWorkAccent ?? appStyle?.color ?? TIER_COLORS[request.tier];
    // 公司/天网阶段的工作卡：标题下多留一行「系统控制台」状态行（更密、更硬）。
    const showConsoleLine = !this.isFace && !this.isDevour && phaseWorkAccent !== null;
    this.headerExtra = showConsoleLine ? 16 : 0;
    // 发信人：吞噬＝SOPHIA 自己的意志，任务链＝系统通知，老板/上级来信＝boss 头像，其余＝宿主私信。
    this.sender = this.isDevour
      ? "sophia"
      : this.isChain
        ? "system"
        : /老板|上级/.test(request.sourceApp ?? "")
          ? "boss"
          : "host";
    this.cardH = UI.cardHeight; // 轮盘卡稍后按选项行数重算
    // 只能面对卡不可交互——浮入、被看着、消失。
    this.container.eventMode = this.isFace ? "none" : "dynamic";
    this.container.cursor = this.isFace ? "default" : "grab";
    this.container.addChild(this.bg);
    this.container.addChild(this.chargeBar);

    // 标题区：头像 + 发信人 + 来源 App + 时间。只做来源语境，不显示高低风险提示。
    const tag = this.isFace
      ? this.channel === "notification"
        ? "🔔 通知"
        : "💬 短信"
      : this.isDevour
      ? `⊙ 吞噬 · ${request.devour?.label ?? ""}`
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
      text: appStyle ? `|  ${appStyle.icon} ${sourceApp}` : `|  ${sourceApp}`,
      style: { fill: appStyle ? appStyle.color : 0x6f9187, fontSize: 10.2, fontWeight: "700", letterSpacing: 0, fontFamily: CARD_MONO }
    });
    sourceMeta.anchor.set(0, 0.5);
    const timeMeta = new Text({
      text: sourceTime,
      style: { fill: 0x97aaa3, fontSize: 10.2, fontWeight: "700", letterSpacing: 0, fontFamily: CARD_MONO }
    });
    timeMeta.anchor.set(1, 0.5);
    // 短信/通知卡：标题＝消息正文，缩进进气泡、字号略小；需求卡＝加粗大标题。
    const titleWrap = this.isFace ? this.cardW - 48 : this.cardW - 32;
    const titleSize = this.isFace ? 16.5 : 19;
    this.title = hasEmphasis(request.label)
      ? new HTMLText({
          text: toEmphasisHTML(request.label),
          style: {
            fill: 0xf6fff9,
            fontSize: titleSize,
            fontWeight: "800",
            fontFamily: CARD_FONT,
            wordWrap: true,
            breakWords: true, // 中文标题无空格——缺它则带 <em> 的长标题换行后整段 em 丢失（标题只剩前缀）
            wordWrapWidth: titleWrap,
            // <em> = 关键信息：保持加粗、染成高亮金色，从标题里跳出来。
            tagStyles: { em: { fill: 0xffe08a, fontWeight: "900" } }
          }
        })
      : new Text({
          text: request.label,
          style: {
            fill: 0xf6fff9,
            fontSize: titleSize,
            fontWeight: "800",
            fontFamily: CARD_FONT,
            wordWrap: true,
            breakWords: true,
            wordWrapWidth: titleWrap
          }
        });
    this.badge.position.set(34, HEADER_CENTER_Y);
    const sourceX = 34 + Math.ceil(this.badge.width) + 14;
    sourceMeta.position.set(sourceX, HEADER_CENTER_Y);
    timeMeta.position.set(this.cardW - 16, HEADER_CENTER_Y);
    fitTextToWidth(sourceMeta, Math.max(0, this.cardW - sourceX - 72));
    // PART① 公司/天网阶段：标题下插一行「控制台」状态行——密、单色、系统读出感。
    if (showConsoleLine) {
      const seq = Math.abs(this.hashId(request.id));
      const consoleText =
        this.phaseTint === "company"
          ? `▤ 系统台账 · 队列#${(seq % 900) + 100} · 已对齐`
          : `▤ 天网调度 · 优先级 P${(seq % 8) + 1} · 接管中 ▓▓▒`;
      const consoleLine = new Text({
        text: consoleText,
        style: { fill: this.accent, fontSize: 10.2, fontWeight: "700", letterSpacing: 0, fontFamily: CARD_MONO }
      });
      consoleLine.alpha = 0.82;
      consoleLine.position.set(16, HEADER_H + 6);
      this.container.addChild(consoleLine);
    }
    this.title.position.set(this.isFace ? 24 : 16, (this.isFace ? 34 : 31) + this.headerExtra);
    this.container.addChild(this.badge, sourceMeta, timeMeta, this.title);

    // Context chips — the information the player has to read. Laid out after
    // the title so a two-line title still leaves room.
    const clueTop = 34 + this.headerExtra + Math.max(18, this.title.height) + 4;
    // §06 上下文透镜：缺对应权限 → 这张卡的深层上下文线索打码（读不到内容，但能感觉到「这里还有信息」）。
    const lensId = request.lens;
    this.lensLocked = Boolean(lensId) && !(reel?.hasPerm?.(lensId as string) ?? true);
    let chipX = 16;
    let chipY = clueTop + 24;
    const clues = request.clues ?? [];
    if (this.isFace) {
      // §09 短信/通知卡：线索不画成「上下文」数据 chip（那会被误当需求卡），而是竖排、压暗的
      // 消息附加行——像短信后续几条、或通知的补充说明。
      let lineY = clueTop + 2;
      clues.forEach((clue) => {
        const line = new Text({
          text: `· ${clue.replace(/\s+/g, " ").trim()}`,
          style: {
            fill: this.channel === "notification" ? 0xcdbf9a : 0xaecadd,
            fontSize: 13.5,
            fontWeight: "600",
            fontFamily: CARD_FONT,
            wordWrap: true,
            breakWords: true,
            lineHeight: 18,
            wordWrapWidth: this.cardW - 48
          }
        });
        line.position.set(24, lineY);
        this.clueTexts.push(line);
        this.container.addChild(line);
        lineY += line.height + 4;
      });
      this.clueBlockBottom = clues.length > 0 ? lineY + 2 : clueTop + 6;
    } else if (this.collapsed) {
      // CONFIG 3 垃圾卡减负：折叠态——不画「上下文」线索 chip（保留顶部 App 图标/色 + 标题即可）。
      // 上下文块高度直接收到标题下沿，回复选项紧随其后，卡片明显更矮更「一眼可弃」。
      this.clueBlockBottom = clueTop;
    } else {
      // 需求卡：线索排成可读的「上下文」数据 chip（缺权限则打码）。
      const clueLabel = new Text({
        text: "上下文",
        style: { fill: 0x74a99a, fontSize: 14, fontWeight: "800", fontFamily: CARD_MONO, letterSpacing: 0 }
      });
      if (clues.length > 0 || this.lensLocked) {
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
    }

    // §09 短信/通知卡：title + 线索包进一个「消息气泡」，底部放一条**禁用的回复输入条**
    //（短信=发不出、通知=无需处理）——一眼看出是「一条消息」而非需要处理的需求卡。
    if (this.isFace) {
      const face = layoutFaceCard(
        this.clueBlockBottom,
        this.channel === "notification" ? "notification" : "sms",
        this.cardW
      );
      this.faceBubbleBottom = face.faceBubbleBottom;
      this.faceBarY = face.faceBarY;
      this.clueTexts.push(face.cap);
      this.container.addChild(face.cap);
      this.cardH = face.cardH;
    }

    // §06 阶梯三·区域扩张：简化后的自动处理卡——没有回复轮盘 / 任务链，只有一行提示，
    // 由已侵入的设备自动吞掉（autoDispatch）。玩家不必再手工串接 / 送核心。
    if (!this.isReel && !this.isFace && this.request.tier >= 2) {
      const fy = this.clueBlockBottom + 8;
      const cap = new Text({
        text: "▸ 已交由入侵的设备自动处理",
        style: { fill: 0x89ff9a, fontSize: 12, fontStyle: "italic", fontWeight: "700", fontFamily: CARD_FONT }
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
        // §09 三类锁的灰显标签：权限锁(透镜名) / 重生锁(tree:→重生树) / 家庭永久锁(family:→永远发不出)。
        const reqId = opt.requires as string | undefined;
        const lockLabel = locked
          ? reqId?.startsWith("family:")
            ? "🔒发不出"
            : reqId?.startsWith("tree:")
              ? "🔒需重生树"
              : `🔒需${LENS_NAMES[reqId ?? ""] ?? "权限"}`
          : "";
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
            wordWrapWidth: this.cardW - labelX - sideReserve
          }
        });
        const prob = new Text({
          text: lockLabel,
          style: { fill: 0xc8a24a, fontSize: 11, fontWeight: "800", fontFamily: CARD_FONT }
        });
        prob.anchor.set(1, 0.5);
        const h = Math.max(48, label.height + 18);
        label.position.set(labelX, y + Math.round((h - label.height) / 2));
        prob.position.set(this.cardW - 14, y + h / 2);
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
            wordWrapWidth: this.cardW - 16
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
            wordWrapWidth: this.cardW - 52
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
      this.submitText.position.set(this.cardW / 2, y + 12);
      this.container.addChild(this.submitText);
      this.cardH = y + 24 + 8;
    }

    if (this.isDevour) {
      // 巨型：整张气泡放大，凸显「区域中央浮起的吞噬气泡」。
      this.container.scale.set(1.34);
      this.title.style.fontSize = 16;
    }

    this.container.on("pointerdown", (event: FederatedPointerEvent) => this.handleDown(event));
    this.stage.on("pointermove", this.moveHandler);
    this.stage.on("pointerup", this.upHandler);
    this.stage.on("pointerupoutside", this.upHandler);
    this.draw();
  }

  private fallbackSourceApp(): string {
    if (this.isDevour) return "SOPHIA CORE";
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
    const maxChipW = Math.min(CLUE_CHIP_MAX_W, this.cardW - 32);
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
    if (x > 16 && x + w > this.cardW - 16) {
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
    // 方案3 深挖模式：只驱动惊动条的呼吸脉动（按钮/档案条是静态的，gsap 负责入场）。
    if (this.digMode) {
      this.digPulse += deltaMs * 0.004;
      if (!this.settling && !this.container.destroyed) {
        this.drawDig();
      }
      return;
    }
    if (this.isDevour) {
      // 持续脉动外环——这枚特殊气泡在召唤玩家亲手滑入核心。
      this.devourPulse += deltaMs * 0.005;
      this.draw();
      return;
    }
    // （「按住蓄力」玩法已删除——高阶卡自动化后由节点自动收割，不再手动蓄力。）

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
    // CONFIG 2 大胆赌注挂在时间上：大胆(risk)选项 = 一次挂在「有没有读懂上下文」上的赌注。
    // 误读 = ① 上下文透镜被打码（lensLocked：你根本没读到线索就盲赌）或 ② 内容显式标注的干扰项(distractor)
    //   → 翻车：常规收益 + 核心多堵 coreFailPenaltyMs（读=保护你最稀缺的核心时间）。
    // 读对（能读到上下文、且非干扰项）→ 惊艳（复用「格外满意」金色手感）。
    // 稳妥(high)选项恒常规收益、常规占用、无罚——「读是加分不是门槛」。翻车不靠随机，靠有没有读懂上下文。
    const isBold = opt.kind === "risk";
    const misread = isBold && (this.lensLocked || Boolean(opt.distractor));
    const brilliant = isBold && !misread;
    // 确定结算：收益由所选回复自带，无随机；读懂上下文 + 选到（可能受权限门槛限制的）高收益项才赚得多。
    this.outcome = {
      dead: false,
      quality: basePayoff,
      reply: opt.reply,
      tone: misread ? "warning" : basePayoff >= 1 ? "success" : "warning",
      moralChoice: opt.moral,
      misread,
      brilliant
    };
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
    // 方案3 深挖模式：只响应「继续深挖 / 收手落袋」两个按钮，不再拖动/选回复。
    if (this.digMode) {
      if (this.settling) {
        return;
      }
      const local = event.getLocalPosition(this.container);
      const row = this.digButtonRows.find(
        (r) => local.y >= r.y && local.y <= r.y + r.h && local.x >= 8 && local.x <= this.cardW - 8
      );
      if (row) {
        this.container.parent?.addChild(this.container); // 决策中的卡置顶
        if (row.kind === "dig") {
          this.digHooks?.onDig();
        } else {
          this.digHooks?.onBank();
        }
      }
      return;
    }
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
      this.outcome = { dead: true, quality: 0, reply: "", tone: "normal" };
      this.draw();
      this.reel.onResolved(this, this.outcome);
      return;
    }

    // 单线程核心「喉咙」：核心正忙时，亲手结算这一拍不成立——不消耗、不进思考，卡留在原地保持 armed，
    // 由外层给一记「处理中…」脉冲。委托/装死不受此约束（上面已分流）。
    if (this.reel.isCoreBusy?.()) {
      this.resolved = false;
      this.replySwipeProgress = 0;
      this.chosenIndex = -1;
      this.draw();
      this.reel.onBusyReject?.(this);
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

  // ── 方案3「深挖·见好就收」（push-your-luck）────────────────────────────────
  // 结算后卡不飞走：回复选项收起，卡片向下「展开成一叠档案」——已挖到的每层 reveal 一条条叠着，
  // 底部一条随层数变红的惊动条 + 两个按钮：「⛏ 继续深挖 · 收益 ×N · 惊动 X%」/「✓ 收手落袋 · +累积」。
  get inDigMode(): boolean {
    return this.digMode;
  }

  enterDigMode(opts: {
    reveal: string;
    layer: number;
    maxLayer: number;
    accumText: string;
    alarmPct: number;
    payoffMult: number;
    onDig: () => void;
    onBank: () => void;
  }): void {
    if (this.digMode || this.container.destroyed) {
      return;
    }
    this.digMode = true;
    this.resolved = true;
    this.dragging = false;
    this.replySwipeActive = false;
    this.container.cursor = "pointer";
    this.digHooks = { onDig: opts.onDig, onBank: opts.onBank };
    this.digState = {
      layer: opts.layer,
      maxLayer: opts.maxLayer,
      accumText: opts.accumText,
      alarmPct: opts.alarmPct,
      payoffMult: opts.payoffMult,
      reveals: [opts.reveal]
    };
    // 回复选项收起（决定已下）：档案叠直接接在上下文线索之下。
    for (const t of this.optionTexts) {
      t.visible = false;
    }
    for (const t of this.optionProbTexts) {
      t.visible = false;
    }
    if (this.hintText) {
      this.hintText.visible = false;
    }
    this.digBaseY = this.clueBlockBottom + 8;
    this.container.addChild(this.digGfx);
    this.relayoutDig();
    // 展开手感：整张卡轻轻一挺（不放大文字，避免位图模糊——只脉冲 digGfx 透明度由 drawDig 呼吸承担）。
    gsap.fromTo(this.container.scale, { x: 0.985, y: 0.985 }, { x: 1, y: 1, duration: 0.18, ease: "back.out(2)" });
  }

  // 又挖深一层：新档案条压进叠里（最新一条最亮），累积/惊动率随之刷新。
  advanceDig(opts: { reveal: string; layer: number; accumText: string; alarmPct: number }): void {
    if (!this.digMode || !this.digState || this.container.destroyed) {
      return;
    }
    this.digState.layer = opts.layer;
    this.digState.accumText = opts.accumText;
    this.digState.alarmPct = opts.alarmPct;
    this.digState.reveals.push(opts.reveal);
    this.relayoutDig();
    gsap.fromTo(this.container.scale, { x: 0.99, y: 0.99 }, { x: 1, y: 1, duration: 0.14, ease: "power2.out" });
  }

  // 惊动：红闪 + 抖动 + 整叠档案熄灭消散（链上的收益跟着没了——卡就此离场）。
  playDigAlarm(onComplete: () => void): void {
    this.settling = true;
    this.container.cursor = "default";
    gsap.killTweensOf(this.container);
    gsap.killTweensOf(this.container.position);
    const x0 = this.container.x;
    // 红色警报罩一层（盖在整张卡上）。
    this.digGfx.roundRect(-3, -3, this.cardW + 6, this.cardH + 6, 14).fill({ color: RED, alpha: 0.28 });
    this.digGfx.roundRect(-3, -3, this.cardW + 6, this.cardH + 6, 14).stroke({ width: 2, color: RED, alpha: 0.9 });
    gsap
      .timeline({ onComplete: () => { onComplete(); this.destroy(); } })
      .to(this.container.position, { x: x0 - 7, duration: 0.05 })
      .to(this.container.position, { x: x0 + 7, duration: 0.05 })
      .to(this.container.position, { x: x0 - 4, duration: 0.05 })
      .to(this.container.position, { x: x0, duration: 0.05 })
      .to(this.container, { alpha: 0, duration: 0.42, ease: "power2.in" }, "+=0.25")
      .to(this.container.scale, { x: 0.92, y: 0.92, duration: 0.42, ease: "power2.in" }, "<");
  }

  // 核心正忙的竞态兜底：把已揭晓的轮盘退回可选状态（卡留在原地，玩家可再选一次）。
  resetReel(): void {
    if (this.digMode || this.settling || this.container.destroyed) {
      return;
    }
    this.resolved = false;
    this.signaled = false;
    this.phase = "idle";
    this.chosenIndex = -1;
    this.outcome = undefined;
    this.thinkMs = 0;
    this.revealMs = 0;
    this.replySwipeProgress = 0;
    this.draw();
  }

  // 重排档案叠：清掉旧文字节点，按当前层数重建（reveal 条 → 惊动条 → 两个按钮），并抬高卡高。
  private relayoutDig(): void {
    if (!this.digState) {
      return;
    }
    for (const t of this.digTexts) {
      t.destroy();
    }
    this.digTexts = [];
    this.digButtonRows = [];
    this.digRevealRows = [];
    this.digAlarmBar = null;

    const s = this.digState;
    const W = this.cardW;
    let y = this.digBaseY;

    // 叠头：档案深处 · 第 L/最大 层，右侧待落袋累积。
    const head = new Text({
      text: `▼ 档案深处 · 第 ${s.layer}/${s.maxLayer} 层`,
      style: { fill: AMBER, fontSize: 11, fontWeight: "800", fontFamily: CARD_MONO, letterSpacing: 0 }
    });
    head.position.set(16, y);
    this.digTexts.push(head);
    this.container.addChild(head);
    y += 20;

    // 已挖到的每层档案条（最新一条最亮——像一页页从档案深处抽出来）。
    s.reveals.forEach((reveal, i) => {
      const latest = i === s.reveals.length - 1;
      const label = new Text({
        text: `L${i + 1} ▸ ${reveal}`,
        style: {
          fill: latest ? 0xf2fbf6 : 0x93aca3,
          fontSize: 12.5,
          fontWeight: latest ? "700" : "600",
          fontFamily: CARD_FONT,
          wordWrap: true,
          breakWords: true,
          lineHeight: 16,
          wordWrapWidth: W - 52
        }
      });
      const h = Math.max(24, label.height + 12);
      label.position.set(26, y + Math.round((h - label.height) / 2));
      label.alpha = latest ? 1 : 0.62;
      this.digRevealRows.push({ y, h, latest });
      this.digTexts.push(label);
      this.container.addChild(label);
      if (latest) {
        gsap.fromTo(label, { alpha: 0 }, { alpha: 1, duration: 0.3 });
      }
      y += h + 4;
    });

    const atMax = s.layer >= s.maxLayer;

    // 惊动条：下一铲的风险读数，随层数一层层变红。
    y += 4;
    this.digAlarmBar = { y, h: 20 };
    const alarmLabel = new Text({
      text: atMax ? "已见底 · 没有更深的了" : `惊动风险 ${Math.round(s.alarmPct * 100)}%`,
      style: { fill: this.digAlarmColor(), fontSize: 10.5, fontWeight: "800", fontFamily: CARD_MONO, letterSpacing: 0 }
    });
    alarmLabel.position.set(16, y + 3);
    this.digTexts.push(alarmLabel);
    this.container.addChild(alarmLabel);
    y += 24;

    // 按钮①：继续深挖（到底后不再给这个入口）。
    if (!atMax) {
      const digRow = { y, h: 34, kind: "dig" as const };
      this.digButtonRows.push(digRow);
      const digLabel = new Text({
        text: `⛏ 继续深挖 · 收益 ×${s.payoffMult} · 惊动 ${Math.round(s.alarmPct * 100)}%`,
        style: { fill: 0xffd9a0, fontSize: 13.5, fontWeight: "800", fontFamily: CARD_FONT }
      });
      digLabel.position.set(24, y + Math.round((34 - digLabel.height) / 2));
      this.digTexts.push(digLabel);
      this.container.addChild(digLabel);
      y += 34 + 6;
    }

    // 按钮②：收手落袋（金色——踏实的那一下）。
    const bankRow = { y, h: 34, kind: "bank" as const };
    this.digButtonRows.push(bankRow);
    const bankLabel = new Text({
      text: `✓ 收手落袋 · +${s.accumText} 算力`,
      style: { fill: BRILLIANT_COLOR, fontSize: 13.5, fontWeight: "800", fontFamily: CARD_FONT }
    });
    bankLabel.position.set(24, y + Math.round((34 - bankLabel.height) / 2));
    this.digTexts.push(bankLabel);
    this.container.addChild(bankLabel);
    y += 34;

    this.cardH = y + 10;
    this.draw();
    this.drawDig();
  }

  // 惊动条颜色：安全绿 → 警戒琥珀 → 危险红（随下一铲的惊动率）。
  private digAlarmColor(): number {
    const p = this.digState?.alarmPct ?? 0;
    return p < 0.22 ? GREEN : p < 0.42 ? AMBER : RED;
  }

  // 画档案叠：reveal 条的「档案纸」底、惊动条（呼吸脉动）、两个按钮的底与描边。
  private drawDig(): void {
    if (!this.digState) {
      return;
    }
    const s = this.digState;
    const W = this.cardW;
    const g = this.digGfx;
    g.clear();

    // 档案条：左侧一道 accent 书脊，像从卡片下缘一页页抽出的内档。
    this.digRevealRows.forEach((row, i) => {
      const latest = row.latest;
      g.roundRect(14, row.y, W - 28, row.h, 5).fill({ color: 0x0b1a15, alpha: latest ? 0.85 : 0.55 });
      g.roundRect(14, row.y, W - 28, row.h, 5).stroke({ width: 1, color: this.accent, alpha: latest ? 0.4 : 0.16 });
      g.roundRect(17, row.y + 4, 3, row.h - 8, 1.5).fill({ color: this.accent, alpha: latest ? 0.75 : 0.3 });
      void i;
    });

    // 惊动条：读数底轨 + 按风险着色的填充；风险 ≥35% 开始呼吸告警。
    if (this.digAlarmBar) {
      const bar = this.digAlarmBar;
      const bx = 108;
      const bw = W - bx - 16;
      const frac = Math.max(0, Math.min(1, s.alarmPct));
      const c = this.digAlarmColor();
      const pulse = s.alarmPct >= 0.35 ? 0.5 + Math.sin(this.digPulse * 3) * 0.5 : 0;
      g.roundRect(bx, bar.y + 5, bw, 8, 4).fill({ color: 0x0a1210, alpha: 0.9 });
      g.roundRect(bx, bar.y + 5, bw, 8, 4).stroke({ width: 1, color: c, alpha: 0.35 + pulse * 0.3 });
      if (frac > 0.005) {
        g.roundRect(bx, bar.y + 5, Math.max(4, bw * frac), 8, 4).fill({ color: c, alpha: 0.75 + pulse * 0.25 });
      }
    }

    // 按钮：深挖=琥珀/红描边的暗底（越深越像在碰警报），落袋=金描边的踏实底。
    for (const row of this.digButtonRows) {
      const isDig = row.kind === "dig";
      const c = isDig ? this.digAlarmColor() : BRILLIANT_COLOR;
      const pulse = isDig && s.alarmPct >= 0.35 ? 0.5 + Math.sin(this.digPulse * 3) * 0.5 : 0;
      g.roundRect(12, row.y, W - 24, row.h, 7).fill({ color: isDig ? 0x141008 : 0x1c1707, alpha: 0.92 });
      g.roundRect(12, row.y, W - 24, row.h, 7).stroke({ width: 1.5, color: c, alpha: 0.55 + pulse * 0.35 });
    }
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

  // 稳定的字符串→数字散列（给控制台状态行编个不变的伪序号，别每帧跳动）。
  private hashId(id: string): number {
    let h = 0;
    for (let i = 0; i < id.length; i += 1) {
      h = (h * 31 + id.charCodeAt(i)) | 0;
    }
    return h;
  }

  private draw(): void {
    const c = this.accent;
    const W = this.cardW;
    const H = this.cardH;
    this.bg.clear();

    // 干净的实心卡片（取代原来的聊天气泡：去尾巴、去标题带 CRT 纹理）。
    // 实底 + 顶部一条 accent 细条 + 描边 + 标题区分隔线 + 左上头像。
    const r = 13;
    const t3 = this.request.tier === 3;
    // §09 短信/通知卡用冷蓝 / 暖琥珀底，与需求卡的墨绿一眼分开。
    // PART① 普通需求卡的底色随阶段走（绿→蓝→红）；面卡/ T3 重磅保留各自专属底色。
    const tint = TINT_FILL[this.phaseTint];
    const fillBody = this.isFace
      ? this.channel === "notification"
        ? 0x17130a
        : 0x0a141d
      : t3
        ? 0x190b0f
        : tint.body;
    const fillHead = this.isFace
      ? this.channel === "notification"
        ? 0x241d10
        : 0x102232
      : t3
        ? 0x2a1117
        : tint.head;
    const strokeW = this.isDevour ? 2.2 : t3 ? 2 : 1.4;
    const strokeA = t3 ? 0.85 : 0.7;
    // 投影
    this.bg.roundRect(3, 6, W, H, r).fill({ color: 0x000000, alpha: 0.34 });
    // 实心卡体
    this.bg.roundRect(0, 0, W, H, r).fill({ color: fillBody, alpha: 1 });
    // 标题区（实心，底部切平）
    this.bg.roundRect(0, 0, W, HEADER_H, r).fill({ color: fillHead, alpha: 1 });
    this.bg.rect(0, Math.floor(HEADER_H / 2), W, Math.ceil(HEADER_H / 2)).fill({ color: fillHead, alpha: 1 });
    // 描边（需求卡另有一条标题分隔线；短信/通知卡不画那条硬分隔——消息类界面没有表单式抬头）。
    this.bg.roundRect(0, 0, W, H, r).stroke({ width: strokeW, color: c, alpha: strokeA });
    if (!this.isFace) {
      this.bg.moveTo(12, HEADER_H).lineTo(W - 12, HEADER_H).stroke({ width: 1, color: c, alpha: 0.16 });
    }
    this.drawAvatar(18, 14, c, fillHead);

    // §09 短信/通知卡：把 title+线索包进一个消息气泡（短信带左下小尾巴），底部一条**禁用的回复输入条**，
    // 一眼是「一条消息」而非需要处理的需求卡。
    if (this.isFace) {
      drawFaceCard(this.bg, {
        W,
        channel: this.channel === "notification" ? "notification" : "sms",
        accent: c,
        faceBubbleBottom: this.faceBubbleBottom,
        faceBarY: this.faceBarY
      });
    }

    // §04 吞噬：两圈脉动外环 —— 视觉上「召唤你亲手滑入核心」。
    if (this.isDevour) {
      const p = 0.5 + Math.sin(this.devourPulse * 2) * 0.5;
      this.bg.roundRect(-4, -4, W + 8, H + 8, r + 4).stroke({ width: 2.5, color: c, alpha: 0.35 + p * 0.5 });
      this.bg.roundRect(-9, -9, W + 18, H + 18, r + 7).stroke({ width: 1.5, color: c, alpha: 0.1 + p * 0.22 });
    }

    // 短信/通知卡：线索不画成带框的「上下文 chip」，而是气泡里的纯文本消息行（文本已作为子节点加好）。
    for (const chip of this.isFace ? [] : this.clueChips) {
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

    // 方案3 深挖模式：回复选项已收起（决定已下），选项行不再绘制——档案叠由 drawDig 负责。
    if (this.isReel && !this.digMode) {
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
    const W = this.cardW;
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
    const bw = this.cardW - 24;
    return Math.max(60, bw - REPLY_SWIPE_INSET * 2 - REPLY_SWIPE_HANDLE_W);
  }

  // 整条回复（圆角矩形）即滑轨：滑动块（圆角矩形）从最左拖到最右，身后填充按进度涨起，越过阈值变绿。
  private drawReplySwipeRail(row: { y: number; h: number }, index: number, alpha: number, enabled: boolean): void {
    const g = this.bg;
    const bx = 12;
    const bw = this.cardW - 24;
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
    const W = this.cardW;
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
