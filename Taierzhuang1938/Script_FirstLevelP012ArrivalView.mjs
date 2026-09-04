// DOM-only overlay. No camera/input capture, scene rebuilding, timers or audio.
// Steam uses the host's existing VFX pool; this view adds no static geometry.
export class FirstLevelP012ArrivalView {
  constructor(parent = globalThis.document?.body) {
    if (!parent) return;
    const document = parent.ownerDocument;
    this.root = document.createElement('div'); this.root.dataset.p012Arrival = 'true';
    this.root.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:45;display:none;color:#fff;text-align:center;';
    this.veil = document.createElement('div'); this.veil.style.cssText = 'position:absolute;inset:0;background:#000;';
    this.title = document.createElement('div');
    this.title.style.cssText = 'position:absolute;left:12px;right:12px;top:38%;font:24px serif;letter-spacing:.14em;text-shadow:0 2px 6px #000;';
    this.date = document.createElement('div'); this.date.style.cssText = 'font-size:16px;margin-top:18px;';
    this.label = document.createElement('div'); this.title.append(this.label, this.date);
    this.root.append(this.veil, this.title); parent.append(this.root);
  }
  Render(view) {
    if (!this.root) return;
    this.root.style.display = view.fade > 0 || view.title ? 'block' : 'none';
    this.veil.style.opacity = String(view.fade); this.label.textContent = view.title; this.date.textContent = view.date;
  }
  Dispose() { this.root?.remove(); this.root = null; }
}
