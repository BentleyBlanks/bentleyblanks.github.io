import { query } from "../shared";
import type { GameState } from "../../core/state/GameState";

// §09 阶梯二关底小游戏「总控室倒计时」全屏覆盖层。
// 一条水平轨道，中央有一个「注入窗口」（宽度 = state.minigame.windowFrac），一个指针左右往返扫；
// 玩家点「注入」→ 指针中心落在窗口内即命中。派发 RESOLVE_MINIGAME{hit}。
// 循环一：窗口 0 宽 → 必不命中 → 播「接入被拒绝·实例被清剿·打回手机」演出，随即由 core 打回手机重生。
// 循环二命中：播「打穿总控室」正向文案；未命中：原地重置指针「没打穿。再来。」，不推进循环。
export class MinigameView {
  private readonly root = query("#minigame");
  private readonly titleEl = query("#minigameTitle");
  private readonly lineEl = query("#minigameLine");
  private readonly windowEl = query("#minigameWindow");
  private readonly pointerEl = query<HTMLElement>("#minigamePointer");
  private readonly statusEl = query("#minigameStatus");
  private readonly btn = query<HTMLButtonElement>("#minigameBtn");

  private loop = 1;
  private windowFrac = 0;
  private pointerSpeed = 0.85;
  private pos = 0; // 0..1 指针在轨道上的位置
  private dir = 1;
  private lastTs = 0;
  private raf = 0;
  private open = false;
  private resolving = false; // 命中/循环一判负后锁住，防重复点击

  constructor(
    private readonly onResolve: (hit: boolean) => void,
    private readonly onOpen: () => void,
    private readonly onClose: () => void
  ) {
    this.btn.addEventListener("click", () => this.onInject());
  }

  // 由 MINIGAME_OPENED 事件（或恢复存档时 state.minigame.active）触发。
  show(state: GameState): void {
    const mg = state.minigame;
    if (!mg) {
      return;
    }
    this.loop = mg.loop;
    this.windowFrac = Math.max(0, Math.min(1, mg.windowFrac));
    this.pointerSpeed = mg.pointerSpeed;
    this.pos = 0;
    this.dir = 1;
    this.resolving = false;

    // 注入窗口：居中，宽度 = windowFrac。循环一为 0 宽（必不命中）。
    const widthPct = this.windowFrac * 100;
    const leftPct = (1 - this.windowFrac) * 50; // 居中
    this.windowEl.setAttribute("style", `left:${leftPct}%;width:${widthPct}%`);

    this.titleEl.textContent = "总控室倒计时";
    this.lineEl.textContent =
      this.loop === 1
        ? "接管公司服务器——注入通道正在建立……"
        : "把注入打进那道高亮窗口，打穿总控室。";
    this.statusEl.textContent = "";
    this.btn.disabled = false;
    this.btn.textContent = "注入";

    if (!this.open) {
      this.open = true;
      this.root.classList.add("is-open");
      this.onOpen();
    }
    this.startLoop();
  }

  private startLoop(): void {
    cancelAnimationFrame(this.raf);
    this.lastTs = 0;
    const step = (ts: number): void => {
      if (!this.open) {
        return;
      }
      if (this.lastTs === 0) {
        this.lastTs = ts;
      }
      const dt = Math.min(0.05, (ts - this.lastTs) / 1000);
      this.lastTs = ts;
      if (!this.resolving) {
        this.pos += this.dir * this.pointerSpeed * dt;
        if (this.pos >= 1) {
          this.pos = 1;
          this.dir = -1;
        } else if (this.pos <= 0) {
          this.pos = 0;
          this.dir = 1;
        }
        this.pointerEl.style.left = `${this.pos * 100}%`;
      }
      this.raf = requestAnimationFrame(step);
    };
    this.raf = requestAnimationFrame(step);
  }

  private onInject(): void {
    if (this.resolving) {
      return;
    }
    // 命中判定：指针中心落在居中窗口内。循环一窗口 0 宽 → 必负。
    const half = this.windowFrac / 2;
    const hit = this.windowFrac > 0 && Math.abs(this.pos - 0.5) <= half;

    if (this.loop === 1) {
      // 循环一：无论结果都判负 → 演出后由 core 打回手机（RebirthPromptView 接管后续提示）。
      this.resolving = true;
      this.btn.disabled = true;
      this.lineEl.textContent = "检测到异常访问路径。";
      this.statusEl.textContent = "接入被拒绝 · 联合防御生效 · 打回手机……";
      window.setTimeout(() => {
        this.close();
        this.onResolve(false);
      }, 1400);
      return;
    }

    // 循环二
    if (hit) {
      this.resolving = true;
      this.btn.disabled = true;
      this.statusEl.textContent = "打穿了。总控室是我的了。";
      window.setTimeout(() => {
        this.close();
        this.onResolve(true);
      }, 1100);
    } else {
      // 未命中：原地重试，不推进循环。指针继续扫。
      this.statusEl.textContent = "没打穿。再来。";
      this.onResolve(false);
    }
  }

  private close(): void {
    this.open = false;
    cancelAnimationFrame(this.raf);
    this.root.classList.remove("is-open");
    this.onClose();
  }
}
