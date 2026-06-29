import { query } from "../shared";

// §07 里程碑横幅：重大进化时全屏扫过的「章节点」横幅。比终端机播报高一级，只给里程碑级进化用。
export class MilestoneBannerView {
  private readonly root = query("#milestoneBanner");
  private readonly nameEl = query("#milestoneBannerName");
  private readonly subEl = query("#milestoneBannerSub");
  private hideTimer = 0;

  show(name: string, sub: string): void {
    this.nameEl.textContent = name;
    this.subEl.textContent = sub;
    this.root.classList.remove("is-active");
    // 强制 reflow，让动画从头重放（连续里程碑也能各扫一次）。
    void (this.root as HTMLElement).offsetWidth;
    this.root.classList.add("is-active");
    window.clearTimeout(this.hideTimer);
    this.hideTimer = window.setTimeout(() => this.root.classList.remove("is-active"), 2200);
  }
}
