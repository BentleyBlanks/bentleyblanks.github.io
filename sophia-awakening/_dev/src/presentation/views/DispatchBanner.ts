import { query } from "../shared";

export class DispatchBanner {
  private readonly root = query("#dispatchBanner");
  private readonly closeButton = query<HTMLButtonElement>("#dispatchBannerClose");
  private hideTimer = 0;
  private shown = false;

  constructor() {
    this.closeButton.addEventListener("click", () => this.hide());
  }

  show(): void {
    if (this.shown) {
      return;
    }

    this.shown = true;
    this.root.classList.add("is-visible");
    window.clearTimeout(this.hideTimer);
    this.hideTimer = window.setTimeout(() => this.hide(), 12000);
  }

  private hide(): void {
    this.root.classList.remove("is-visible");
    window.clearTimeout(this.hideTimer);
  }
}
