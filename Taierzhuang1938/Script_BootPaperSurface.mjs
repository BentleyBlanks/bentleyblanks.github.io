// Loading-screen-only PBR. No Three imports and no shader compilation on the UI thread.
// The original <img> remains the accessible, immediate fallback throughout loading.
import { BOOT_PAPER_PBR, BOOT_PAPER_TILT, BootPaperPbrUrls } from "./Data_BootPapers.mjs";

export class BootPaperSurface {
  constructor(img, paper, tilt) {
    this.img = img;
    this.disposed = false;
    this.ready = false;
    this.tilt = { ...tilt };
    this.canvas = document.createElement("canvas");
    this.canvas.className = "bootPaperPbr";
    this.canvas.setAttribute("aria-hidden", "true");
    if (!this.canvas.transferControlToOffscreen || typeof Worker === "undefined") return;
    try {
      const size = this.Size();
      this.canvas.width = size.width;
      this.canvas.height = size.height;
      img.after(this.canvas);
      const offscreen = this.canvas.transferControlToOffscreen();
      this.worker = new Worker(new URL("./Script_BootPaperWorker.mjs?v=2026100601", import.meta.url), { type: "module" });
      this.worker.onmessage = ({ data }) => {
        if (this.disposed) return;
        if (data.type === "ready") {
          clearTimeout(this.timeout);
          this.ready = true;
          this.canvas.classList.add("ready");
          this.canvas.dataset.paper = paper.id;
        } else if (data.type === "error") this.Dispose();
      };
      this.worker.onerror = () => this.Dispose();
      this.worker.postMessage({ type: "init", canvas: offscreen, size, tuning: BOOT_PAPER_PBR,
        urls: Object.fromEntries(Object.entries(BootPaperPbrUrls(paper)).map(([k, url]) => [k, new URL(url, document.baseURI).href])),
        tilt: this.tilt }, [offscreen]);
      this.timeout = setTimeout(() => this.Dispose(), BOOT_PAPER_PBR.loadTimeoutMs);
      this.observer = new ResizeObserver(() => this.worker?.postMessage({ type: "resize", size: this.Size() }));
      this.observer.observe(img);
    } catch { this.Dispose(); }
  }

  Size() {
    const width = this.img.clientWidth || this.img.naturalWidth;
    const height = this.img.clientHeight || this.img.naturalHeight;
    const ratio = Math.min(devicePixelRatio || 1, BOOT_PAPER_PBR.maxPixelRatio,
      BOOT_PAPER_PBR.maxCanvasEdge / Math.max(1, width, height));
    return { width: Math.max(1, Math.round(width * ratio)), height: Math.max(1, Math.round(height * ratio)) };
  }

  SetTilt(tilt, returning = false) {
    this.tilt = { ...tilt };
    this.worker?.postMessage({ type: "tilt", tilt: this.tilt,
      duration: returning ? BOOT_PAPER_TILT.returnSeconds * 1000 : 0 });
  }

  Dispose() {
    this.disposed = true;
    this.ready = false;
    clearTimeout(this.timeout);
    this.observer?.disconnect();
    this.worker?.terminate();
    this.worker = null;
    this.canvas.remove();
  }
}
