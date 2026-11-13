import { AddPngFrameMetadata, DownloadBlob } from "./Script_LevelFlowDocument.mjs";

const Element = (id) => document.getElementById(id);
const COLOR = "#ed5145";

export class ScreenshotAnnotations {
  constructor(onAttach) {
    this.dialog = Element("annotationDialog");
    this.canvas = Element("annotationCanvas");
    this.stage = Element("annotationStage");
    this.tool = "arrow";
    this.marks = [];
    this.selected = -1;
    this.undo = [];
    this.redo = [];
    this.textStyle = { fontFamily: "Microsoft YaHei", fontSize: 24, color: COLOR, bold: false, italic: false, underline: false, outline: false, background: false };
    for (const [id, key] of [["screenshotFont", "fontFamily"], ["screenshotSize", "fontSize"], ["screenshotColor", "color"]]) {
      Element(id).addEventListener("change", event => {
        const value = key === "fontSize" ? Math.max(8, Math.min(200, Number(event.target.value) || 24)) : event.target.value;
        this.ChangeTextStyle(key, value);
      });
    }
    for (const key of ["bold", "italic", "underline", "outline", "background"]) {
      Element(`screenshot${key[0].toUpperCase()}${key.slice(1)}`).onclick = () => this.ChangeTextStyle(key, !this.textStyle[key]);
    }
    for (const button of this.dialog.querySelectorAll("[data-mark-tool]")) button.onclick = () => this.SetTool(button.dataset.markTool);
    Element("closeAnnotations").onclick = () => this.dialog.close();
    Element("undoAnnotation").onclick = () => this.History(this.undo, this.redo);
    Element("redoAnnotation").onclick = () => this.History(this.redo, this.undo);
    Element("deleteScreenshotAnnotation").onclick = () => {
      this.CommitText();
      if (this.selected < 0) return;
      this.Save();
      this.marks.splice(this.selected, 1);
      this.selected = -1;
      this.Draw();
    };
    Element("screenshotText").addEventListener("input", event => {
      const mark = this.marks[this.selected];
      if (mark?.kind !== "text") return;
      mark.text = event.target.value;
      this.Draw();
    });
    Element("screenshotText").addEventListener("blur", event => {
      if (!event.relatedTarget?.closest(".lfAnnotationTools")) this.CommitText();
    });
    Element("screenshotText").addEventListener("keydown", event => {
      event.stopPropagation();
      if (event.key === "Escape") { event.preventDefault(); this.CommitText(false); this.canvas.focus(); }
      if ((event.ctrlKey || event.metaKey) && event.key === "Enter") { event.preventDefault(); this.CommitText(); this.canvas.focus(); }
    });
    Element("copyScreenshot").onclick = () => this.Copy();
    Element("exportFrame").onclick = () => this.Export();
    Element("attachScreenshot").onclick = async () => {
      const button = Element("attachScreenshot"); button.disabled = true;
      try { await onAttach(); }
      catch (error) { Element("annotationStatus").textContent = error.message; }
      finally { button.disabled = false; }
    };
    this.canvas.addEventListener("pointerdown", event => this.Begin(event));
    this.canvas.addEventListener("dblclick", () => {
      if (this.marks[this.selected]?.kind === "text") this.EditText();
    });
    this.canvas.addEventListener("pointermove", event => this.Move(event));
    this.canvas.addEventListener("pointerup", () => this.End());
    this.canvas.addEventListener("pointercancel", () => this.Cancel());
    this.canvas.addEventListener("lostpointercapture", () => this.Cancel());
    this.dialog.addEventListener("close", () => { this.CommitText(); this.Cancel(); });
    this.dialog.addEventListener("keydown", event => {
      event.stopPropagation();
      if (event.target.matches("input,textarea")) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        event.shiftKey ? this.History(this.redo, this.undo) : this.History(this.undo, this.redo);
      }
      if (event.key === "Delete" || event.key === "Backspace") { event.preventDefault(); Element("deleteScreenshotAnnotation").click(); }
    });
    new ResizeObserver(() => this.Fit()).observe(this.stage);
  }

  Open(capture, packet, marks = []) {
    this.CommitText();
    this.Cancel();
    this.capture = capture;
    this.packet = structuredClone(packet);
    delete this.packet.screenshot;
    this.marks = structuredClone(marks);
    this.undo = []; this.redo = []; this.selected = -1;
    this.canvas.width = capture.width; this.canvas.height = capture.height;
    Element("annotationHeading").textContent = `${packet.context.beat.toUpperCase()} · ${packet.context.title} · ${packet.context.time.toFixed(2)} s`;
    Element("screenshotText").value = "";
    this.SetTool("arrow");
    if (!this.dialog.open) this.dialog.showModal();
    this.Fit(); this.Draw();
    this.canvas.focus();
  }

  Fit() {
    if (!this.capture || !this.dialog.open) return;
    const ratio = Math.min((this.stage.clientWidth - 32) / this.canvas.width, (this.stage.clientHeight - 32) / this.canvas.height, 1);
    this.canvas.style.width = `${Math.max(1, this.canvas.width * ratio)}px`;
    this.canvas.style.height = `${Math.max(1, this.canvas.height * ratio)}px`;
    this.PositionTextEditor();
  }

  SetTool(tool) {
    this.CommitText();
    this.tool = tool;
    for (const button of this.dialog.querySelectorAll("[data-mark-tool]")) button.setAttribute("aria-pressed", String(button.dataset.markTool === tool));
    this.canvas.dataset.tool = tool;
  }

  Save() {
    this.undo.push(structuredClone(this.marks));
    if (this.undo.length > 40) this.undo.shift();
    this.redo = [];
  }

  History(source, destination) {
    this.CommitText();
    this.Cancel();
    if (!source.length) return;
    destination.push(structuredClone(this.marks));
    this.marks = source.pop(); this.selected = -1;
    this.Draw();
  }

  Point(event) {
    const rect = this.canvas.getBoundingClientRect();
    return [Math.max(0, Math.min(this.canvas.width, (event.clientX - rect.left) * this.canvas.width / rect.width)),
      Math.max(0, Math.min(this.canvas.height, (event.clientY - rect.top) * this.canvas.height / rect.height))];
  }

  Begin(event) {
    if (event.button !== 0) return;
    this.CommitText();
    event.preventDefault(); this.canvas.focus();
    this.canvas.setPointerCapture(event.pointerId);
    const point = this.Point(event), context = this.canvas.getContext("2d");
    const tolerance = Math.max(10, this.canvas.width / this.canvas.clientWidth * 7);
    const selected = this.marks[this.selected];
    if (selected?.kind === "text") {
      const layout = this.TextLayout(context, selected);
      const corner = [selected.a[0] + layout.width, selected.a[1] + layout.height];
      if (Math.abs(point[0] - corner[0]) < tolerance && Math.abs(point[1] - corner[1]) < tolerance) {
        this.drag = { start: point, before: structuredClone(this.marks), existing: true, resize: true };
        return;
      }
    }
    const hit = this.marks.findLastIndex(mark => {
      if (mark.kind === "text") {
        const layout = this.TextLayout(context, mark);
        return point[0] >= mark.a[0] - tolerance && point[0] <= mark.a[0] + layout.width + tolerance
          && point[1] >= mark.a[1] - tolerance && point[1] <= mark.a[1] + layout.height + tolerance;
      }
      const [ax, ay] = mark.a, [bx, by] = mark.b;
      if (mark.kind === "rect") return point[0] >= Math.min(ax, bx) - tolerance && point[0] <= Math.max(ax, bx) + tolerance
        && point[1] >= Math.min(ay, by) - tolerance && point[1] <= Math.max(ay, by) + tolerance
        && Math.min(Math.abs(point[0] - ax), Math.abs(point[0] - bx), Math.abs(point[1] - ay), Math.abs(point[1] - by)) < tolerance;
      const length = (bx - ax) ** 2 + (by - ay) ** 2;
      const fraction = length ? Math.max(0, Math.min(1, ((point[0] - ax) * (bx - ax) + (point[1] - ay) * (by - ay)) / length)) : 0;
      return Math.hypot(point[0] - ax - fraction * (bx - ax), point[1] - ay - fraction * (by - ay)) < tolerance;
    });
    this.drag = { start: point, before: structuredClone(this.marks), existing: hit >= 0 };
    this.selected = hit;
    if (hit < 0) {
      this.selected = this.marks.length;
      this.marks.push({ kind: this.tool, a: point, b: [...point], text: "" });
      if (this.tool === "text") {
        Object.assign(this.marks[this.selected], this.textStyle, { width: Math.max(40, Math.min(400, this.canvas.width - point[0] - 8)) });
        const before = this.drag.before;
        this.drag = null;
        this.EditText(before);
        return;
      }
    }
    this.SyncTextStyle();
    this.Draw();
  }

  Move(event) {
    if (!this.drag) return;
    const point = this.Point(event), mark = this.marks[this.selected];
    if (this.drag.resize) {
      mark.width = Math.max(40, Math.min(this.canvas.width - mark.a[0], point[0] - mark.a[0]));
    } else if (this.drag.existing) {
      const original = this.drag.before[this.selected], delta = point.map((value, index) => value - this.drag.start[index]);
      mark.a = original.a.map((value, index) => value + delta[index]);
      mark.b = original.b.map((value, index) => value + delta[index]);
    } else mark.b = point;
    this.Draw();
  }

  End() {
    if (!this.drag) return;
    const mark = this.marks[this.selected], before = this.drag.before;
    if (!this.drag.existing && mark.kind !== "text" && Math.hypot(mark.a[0] - mark.b[0], mark.a[1] - mark.b[1]) < 4) {
      this.Cancel(); return;
    }
    if (JSON.stringify(before) !== JSON.stringify(this.marks)) {
      this.undo.push(before); if (this.undo.length > 40) this.undo.shift(); this.redo = [];
    }
    this.drag = null; this.Draw();
  }

  Cancel() {
    if (!this.drag) return;
    this.marks = this.drag.before; this.drag = null; this.selected = -1; this.Draw();
  }

  FontSize() { return Math.max(18, Math.round(this.canvas.width / 65)); }

  TextLayout(context, mark) {
    const size = mark.fontSize || this.FontSize();
    const family = mark.fontFamily || "Microsoft YaHei";
    const bold = mark.bold ?? true;
    context.font = `${mark.italic ? "italic " : ""}${bold ? "700" : "400"} ${size}px "${family}", sans-serif`;
    const width = mark.width || Math.max(size, ...mark.text.split("\n").map(line => context.measureText(line).width));
    const lines = [];
    for (const paragraph of mark.text.split("\n")) {
      let line = "";
      for (const character of paragraph) {
        if (line && context.measureText(line + character).width > width) { lines.push(line); line = ""; }
        line += character;
      }
      lines.push(line);
    }
    return { size, family, bold, width, lines, lineHeight: size * 1.3, height: Math.max(1, lines.length) * size * 1.3 };
  }

  SyncTextStyle() {
    const mark = this.marks[this.selected];
    if (mark?.kind === "text") {
      this.textStyle = { fontSize: mark.fontSize || this.FontSize(), fontFamily: mark.fontFamily || "Microsoft YaHei",
        color: mark.color || COLOR, bold: mark.bold ?? true, italic: !!mark.italic, underline: !!mark.underline,
        outline: !!mark.outline, background: mark.background ?? true };
    }
    Element("screenshotFont").value = this.textStyle.fontFamily;
    Element("screenshotSize").value = this.textStyle.fontSize;
    Element("screenshotColor").value = this.textStyle.color;
    for (const key of ["bold", "italic", "underline", "outline", "background"]) {
      Element(`screenshot${key[0].toUpperCase()}${key.slice(1)}`).setAttribute("aria-pressed", String(this.textStyle[key]));
    }
  }

  ChangeTextStyle(key, value) {
    const mark = this.marks[this.selected];
    if (mark?.kind === "text") {
      if (!this.textBefore) this.Save();
      Object.assign(mark, this.textStyle, { [key]: value });
    }
    this.textStyle[key] = value;
    this.SyncTextStyle(); this.Draw();
  }

  EditText(before = structuredClone(this.marks)) {
    this.textBefore = before;
    const input = Element("screenshotText");
    input.value = this.marks[this.selected].text;
    input.hidden = false;
    this.SyncTextStyle(); this.Draw(); input.focus();
  }

  CommitText(accept = true) {
    if (!this.textBefore) return;
    const before = this.textBefore;
    this.textBefore = null;
    Element("screenshotText").hidden = true;
    if (!accept) this.marks = before;
    else {
      if (!this.marks[this.selected]?.text.trim()) this.marks.splice(this.selected, 1);
      if (JSON.stringify(before) !== JSON.stringify(this.marks)) {
        this.undo.push(before); if (this.undo.length > 40) this.undo.shift(); this.redo = [];
      }
    }
    if (!this.marks[this.selected]) this.selected = -1;
    this.Draw();
  }

  PositionTextEditor() {
    if (!this.textBefore || !this.capture) return;
    const mark = this.marks[this.selected];
    const layout = this.TextLayout(this.canvas.getContext("2d"), mark);
    const ratio = this.canvas.clientWidth / this.canvas.width;
    Object.assign(Element("screenshotText").style, {
      left: `${mark.a[0] * ratio}px`, top: `${mark.a[1] * ratio}px`, width: `${layout.width * ratio}px`,
      height: `${layout.height * ratio + 2}px`, font: `${mark.italic ? "italic " : ""}${layout.bold ? "700" : "400"} ${layout.size * ratio}px "${layout.family}", sans-serif`,
      lineHeight: "1.3", color: mark.color || COLOR, textDecoration: mark.underline ? "underline" : "none",
      background: (mark.background ?? true) ? "#151912dd" : "transparent",
      webkitTextStroke: mark.outline ? `${Math.max(1, layout.size / 12) * ratio}px #fff` : "0px",
    });
  }

  DrawMarks(context, selected = -1) {
    const size = this.FontSize();
    context.lineWidth = Math.max(3, this.canvas.width / 500); context.strokeStyle = COLOR; context.fillStyle = COLOR;
    context.font = `600 ${size}px "Microsoft YaHei", sans-serif`; context.textBaseline = "top"; context.lineJoin = "round";
    for (const [index, mark] of this.marks.entries()) {
      const [ax, ay] = mark.a, [bx, by] = mark.b;
      context.save();
      context.strokeStyle = COLOR; context.fillStyle = COLOR;
      context.shadowColor = "#fff9"; context.shadowBlur = 2;
      if (mark.kind === "rect") context.strokeRect(ax, ay, bx - ax, by - ay);
      else if (mark.kind === "text") {
        const layout = this.TextLayout(context, mark);
        context.shadowBlur = 0;
        if (!(this.textBefore && selected === index)) {
          if (mark.background ?? true) {
            context.fillStyle = "#151912dd"; context.fillRect(ax - 4, ay - 2, layout.width + 8, layout.height + 4);
          }
          context.fillStyle = mark.color || COLOR;
          for (const [line, text] of layout.lines.entries()) {
            const y = ay + line * layout.lineHeight;
            if (mark.outline) { context.strokeStyle = "#fff"; context.lineWidth = Math.max(2, layout.size / 6); context.strokeText(text, ax, y); }
            context.fillText(text, ax, y);
            if (mark.underline) context.fillRect(ax, y + layout.size * 1.1, context.measureText(text).width, Math.max(1, layout.size / 16));
          }
        }
      } else {
        const angle = Math.atan2(by - ay, bx - ax), head = size * 0.8;
        context.beginPath(); context.moveTo(ax, ay); context.lineTo(bx, by);
        context.moveTo(bx - head * Math.cos(angle - Math.PI / 6), by - head * Math.sin(angle - Math.PI / 6));
        context.lineTo(bx, by); context.lineTo(bx - head * Math.cos(angle + Math.PI / 6), by - head * Math.sin(angle + Math.PI / 6)); context.stroke();
      }
      context.restore();
      if (index === selected) {
        context.fillStyle = "#fff2cb"; context.strokeStyle = COLOR;
        context.fillRect(ax - 4, ay - 4, 8, 8); context.strokeRect(ax - 4, ay - 4, 8, 8);
        context.fillStyle = COLOR;
        if (mark.kind === "text" && !this.textBefore) {
          const layout = this.TextLayout(context, mark);
          context.strokeStyle = "#fff2cb"; context.lineWidth = 1;
          context.strokeRect(ax - 3, ay - 3, layout.width + 6, layout.height + 6);
          context.fillStyle = "#fff2cb"; context.fillRect(ax + layout.width - 4, ay + layout.height - 4, 8, 8);
        }
      }
    }
  }

  Draw() {
    if (!this.capture) return;
    const context = this.canvas.getContext("2d");
    context.clearRect(0, 0, this.canvas.width, this.canvas.height);
    context.drawImage(this.capture, 0, 0); this.DrawMarks(context, this.selected);
    Element("undoAnnotation").disabled = !this.undo.length;
    Element("redoAnnotation").disabled = !this.redo.length;
    Element("deleteScreenshotAnnotation").disabled = this.selected < 0;
    this.PositionTextEditor();
    Element("annotationStatus").textContent = `${this.marks.length} 处标记 · ${this.canvas.width} × ${this.canvas.height}`;
  }

  Packet() {
    return { ...structuredClone(this.packet), screenshot: { version: 1, width: this.capture.width, height: this.capture.height,
      image: this.capture.toDataURL("image/png"), marks: structuredClone(this.marks) } };
  }

  async Blob() {
    this.CommitText();
    this.Cancel();
    const output = document.createElement("canvas");
    output.width = this.canvas.width; output.height = this.canvas.height;
    const context = output.getContext("2d"); context.drawImage(this.capture, 0, 0); this.DrawMarks(context);
    const packet = this.Packet();
    const blob = await new Promise(resolve => output.toBlob(resolve, "image/png"));
    if (!blob) throw new Error("截图生成失败");
    return new Blob([AddPngFrameMetadata(await blob.arrayBuffer(), packet)], { type: "image/png" });
  }

  async Copy() {
    const button = Element("copyScreenshot"); button.disabled = true;
    try {
      if (!navigator.clipboard?.write || !window.ClipboardItem) throw new Error("当前浏览器不支持复制图片，请使用导出 PNG");
      await navigator.clipboard.write([new ClipboardItem({ "image/png": this.Blob() })]);
      Element("annotationStatus").textContent = "已复制标记截图";
    } catch (error) { Element("annotationStatus").textContent = `复制失败 · ${error.message}`; }
    finally { button.disabled = false; }
  }

  async Export() {
    const button = Element("exportFrame"); button.disabled = true;
    try {
      DownloadBlob(await this.Blob(), `${this.packet.frameId}.png`);
      Element("annotationStatus").textContent = "已导出标记 PNG";
    } catch (error) { Element("annotationStatus").textContent = error.message; }
    finally { button.disabled = false; }
  }
}
