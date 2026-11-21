// The ruler, stages, seek input and beats use one horizontally scrollable axis.
export class EncounterTimeline {
  constructor({viewport, axis, ruler, fitButton, scaleOutput, duration, formatTime}) {
    Object.assign(this, {viewport, axis, ruler, fitButton, scaleOutput, duration, formatTime});
    this.mode = "auto";
    this.pixelsPerSecond = 0.65;
    this.time = 0;
    this.width = 0;
    this.viewportWidth = 0;
    viewport.addEventListener("wheel", event => this.Wheel(event), {passive:false});
    fitButton.addEventListener("click", () => {
      this.mode = "fit";
      this.Layout();
      viewport.scrollLeft = 0;
    });
    this.observer = new ResizeObserver(() => this.Layout());
    this.observer.observe(viewport);
    this.Layout();
  }

  Layout(anchorTime = null, anchorX = null) {
    const nextViewportWidth = this.viewport.clientWidth - 14;
    if (nextViewportWidth<=0) {this.hidden=true;return;}
    const centerTime = anchorTime ?? (this.hidden ? this.time : this.width
      ? (this.viewport.scrollLeft + this.viewportWidth / 2) / this.width * this.duration : 0);
    this.hidden=false;
    const nextWidth = this.mode === "fit" ? nextViewportWidth
      : Math.max(nextViewportWidth, this.duration * this.pixelsPerSecond);
    this.viewportWidth = nextViewportWidth;
    this.width = nextWidth;
    this.axis.style.width = `${nextWidth}px`;
    this.viewport.scrollLeft = centerTime / this.duration * nextWidth - (anchorX ?? nextViewportWidth / 2);
    this.fitButton.setAttribute("aria-pressed", String(nextWidth <= nextViewportWidth));
    this.scaleOutput.textContent = `${(nextWidth / nextViewportWidth).toFixed(1)}×`;
    this.scaleOutput.title = `当前显示约 ${this.formatTime(this.duration * nextViewportWidth / nextWidth)} · 滚轮缩放，Shift＋滚轮横移`;
    for (const button of this.axis.querySelectorAll("[data-beat]")) {
      button.classList.toggle("lfShortBeat", button.getBoundingClientRect().width < 25);
    }
    this.DrawRuler();
  }

  DrawRuler() {
    const minStep = this.duration * 75 / this.width;
    const step = [1,2,5,10,15,30,60,120,300,600,1200,1800,3600].find(value => value >= minStep) ?? 7200;
    this.ruler.replaceChildren();
    for (let stamp = 0; stamp < this.duration; stamp += step) {
      if (this.duration - stamp < minStep * 0.7) break;
      this.AddTick(stamp);
    }
    this.AddTick(this.duration);
  }

  AddTick(stamp) {
    const label = document.createElement("span");
    label.textContent = this.formatTime(stamp);
    label.style.left = `${stamp / this.duration * 100}%`;
    this.ruler.append(label);
  }

  Wheel(event) {
    event.preventDefault();
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? this.viewportWidth : 1;
    if (event.shiftKey || Math.abs(event.deltaX) > Math.abs(event.deltaY)) {
      this.viewport.scrollLeft += (event.deltaX || event.deltaY) * unit;
      return;
    }
    const x = Math.max(0, Math.min(this.viewportWidth, event.clientX - this.viewport.getBoundingClientRect().left - 7));
    const anchorTime = (this.viewport.scrollLeft + x) / this.width * this.duration;
    const factor = Math.exp(-Math.max(-500, Math.min(500, event.deltaY * unit)) * 0.002);
    this.pixelsPerSecond = Math.max(this.viewportWidth / this.duration,
      Math.min(32, this.width / this.duration * factor));
    this.mode = "manual";
    this.Layout(anchorTime, x);
  }

  SetDuration(duration) {
    this.duration = duration;
    this.time = Math.min(this.time, duration);
    this.Layout(this.time);
  }

  SetTime(time) {
    const changed = Math.abs(this.time - time) > 0.001;
    this.time = time;
    this.axis.style.setProperty("--progress", `${time / this.duration * 100}%`);
    if (!changed) return;
    const x = time / this.duration * this.width;
    const margin = Math.min(60, this.viewportWidth / 5);
    if (x < this.viewport.scrollLeft + margin || x > this.viewport.scrollLeft + this.viewportWidth - margin) {
      this.viewport.scrollLeft = x - this.viewportWidth / 2;
    }
  }

  Inspect() {
    return {mode:this.mode, width:this.width, viewportWidth:this.viewportWidth,
      scrollLeft:this.viewport.scrollLeft, pixelsPerSecond:this.width / this.duration};
  }
}
