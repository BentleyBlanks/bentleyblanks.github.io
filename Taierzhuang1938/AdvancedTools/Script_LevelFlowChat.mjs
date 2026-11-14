import { Marked } from "./vendor/marked.mjs";
import DOMPurify from "./vendor/purify.mjs";
import { ValidateScreenshot } from "./Script_LevelFlowDocument.mjs";
import { ReadUnitsAttachment, UnitsLabel } from "./Script_LevelFlowUnits.mjs";

const Element = id => document.getElementById(id);
const API = "/__encounter/codex";

const markdown = new Marked({ gfm: true, breaks: true });

function RenderMarkdown(bubble, text) {
  // Sanitize before attaching any markup, including HTML embedded in a reply.
  const content = DOMPurify.sanitize(markdown.parse(text), {
    ALLOWED_TAGS: ["p", "br", "h1", "h2", "h3", "h4", "h5", "h6", "strong", "em", "del",
      "blockquote", "ul", "ol", "li", "pre", "code", "hr", "table", "thead", "tbody", "tr", "th", "td", "a", "img", "input"],
    ALLOWED_ATTR: ["href", "title", "src", "alt", "start", "align", "type", "checked", "disabled"],
    ALLOW_DATA_ATTR: false,
    RETURN_DOM_FRAGMENT: true,
  });
  for (const link of content.querySelectorAll("a[href]")) {
    link.target = "_blank";
    link.rel = "noopener noreferrer";
  }
  for (const input of content.querySelectorAll("input")) {
    input.type = "checkbox";
    input.disabled = true;
  }
  for (const table of content.querySelectorAll("table")) {
    const scroller = document.createElement("div");
    scroller.className = "lfChatTableScroll";
    scroller.tabIndex = 0;
    scroller.setAttribute("role", "region");
    scroller.setAttribute("aria-label", "表格");
    table.replaceWith(scroller);
    scroller.append(table);
  }
  for (const pre of content.querySelectorAll("pre")) pre.tabIndex = 0;
  bubble.classList.add("lfChatMarkdown");
  bubble.replaceChildren(content);
}

function ContextLabel(context) {
  return `${context.beat.toUpperCase()} · ${context.time.toFixed(2)} s · 玩家 X ${context.player[0].toFixed(1)} / Z ${context.player[1].toFixed(1)}`;
}

async function Request(route, options) {
  const response = await fetch(`${API}${route}`, options);
  const result = await response.json().catch(() => ({ error: "本地预览服务需要更新，请重新打开 AdvancedTool ControlCenter" }));
  if (!response.ok) throw new Error(result.error || "本机会话服务不可用");
  return result;
}

function BlobDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("截图读取失败"));
    reader.readAsDataURL(blob);
  });
}

function DrawUnitList(element, units, remove = null, disabled = false) {
  element.replaceChildren();
  const sides = { player: "玩家", friend: "我方", enemy: "日军", civilian: "平民" };
  const poses = { dead: "阵亡", burn: "燃烧", run: "跑动", walk: "行进", shoot: "射击", kneel: "低姿态", melee: "近战", drag: "拖行", down: "倒地", stand: "站立", idle: "待机" };
  for (const unit of units) {
    const row = document.createElement("div"); row.className = "lfUnitRow"; row.dataset.unitId = unit.id;
    const content = document.createElement("div"), name = document.createElement("strong"), info = document.createElement("small");
    name.textContent = `${unit.name} · ${sides[unit.side] || unit.side}`;
    info.textContent = `${unit.id} · ${unit.status || poses[unit.pose] || unit.pose} · X ${unit.position.x.toFixed(1)} / Y ${unit.position.y.toFixed(1)} / Z ${unit.position.z.toFixed(1)}${unit.groupId ? ` · ${unit.group?.label || unit.groupId}` : ""}`;
    content.append(name, info); row.append(content);
    if (remove) {
      const button = document.createElement("button"); button.type = "button"; button.textContent = "×";
      button.setAttribute("aria-label", `取消选择 ${unit.name}`); button.disabled = disabled;
      button.onclick = () => remove(unit.id); row.append(button);
    }
    element.append(row);
  }
}

export class EncounterChat {
  constructor({ snapshot, openScreenshot, editScreenshot, openUnits, setUnitMode, removeUnit, clearUnits }) {
    this.snapshot = snapshot;
    this.editScreenshot = editScreenshot;
    this.sessions = [];
    this.deletedSessions = [];
    this.showDeleted = false;
    this.managing = null;
    this.current = null;
    this.pendingImage = null;
    this.pendingLocation = null;
    this.pendingUnits = null;
    this.unitActions = { openUnits, setUnitMode, removeUnit, clearUnits };
    this.drafts = new Map();
    this.available = false;
    this.loading = false;
    this.sending = false;
    this.stopping = null;
    this.selectionVersion = 0;
    this.BindInspectorResize();
    Element("toggleCodexSessions").onclick = () => {
      const button = Element("toggleCodexSessions");
      const open = button.getAttribute("aria-expanded") !== "true";
      button.setAttribute("aria-expanded", String(open));
      button.setAttribute("aria-label", open ? "收起会话列表" : "展开会话列表");
      Element("codexChatSidebar").hidden = !open;
      Element("chatPane").dataset.listOpen = String(open);
    };
    Element("newCodexChat").onclick = () => this.New();
    Element("toggleDeletedCodexChats").onclick = () => { this.showDeleted = !this.showDeleted; this.DrawList(); };
    Element("interruptCodexChat").onclick = () => this.Interrupt();
    Element("attachCodexScreenshot").onclick = openScreenshot;
    Element("attachCodexLocation").onclick = () => {
      this.pendingLocation = structuredClone(this.snapshot());
      this.RefreshContext();
    };
    Element("attachCodexUnits").onclick = () => this.OpenUnits();
    Element("selectSingleUnit").onclick = () => setUnitMode(false);
    Element("selectMultipleUnits").onclick = () => setUnitMode(true);
    Element("clearSelectedUnits").onclick = clearUnits;
    Element("closeUnitSelection").onclick = () => { Element("unitSelection").hidden = true; };
    Element("attachSelectedUnits").onclick = () => {
      try {
        this.pendingUnits = ReadUnitsAttachment(this.selectedUnits);
        this.DrawUnitsAttachment(); Element("unitSelection").hidden = true;
      } catch (error) { this.Error(error.message); }
    };
    Element("removeCodexUnits").onclick = () => { this.pendingUnits = null; this.DrawUnitsAttachment(); };
    Element("removeCodexLocation").onclick = () => { this.pendingLocation = null; this.RefreshContext(); };
    Element("editCodexImage").onclick = () => this.editScreenshot(this.pendingImage);
    Element("removeCodexImage").onclick = () => { this.pendingImage = null; this.DrawAttachment(); };
    Element("codexPrompt").addEventListener("input", () => this.UpdateSend());
    Element("codexPrompt").addEventListener("keydown", event => {
      if ((event.ctrlKey || event.metaKey) && event.key === "Enter") { event.preventDefault(); Element("codexComposer").requestSubmit(); }
    });
    Element("codexComposer").onsubmit = event => { event.preventDefault(); this.Send(); };
    this.Connect();
    Element("codexContextSummary").parentElement.addEventListener("toggle", () => this.RefreshContext());
    // Polling also restores runs after a browser reload. Background sessions remain in the list.
    this.timer = setInterval(() => this.Poll(), 2000);
    window.addEventListener("pagehide", () => clearInterval(this.timer), { once: true });
  }

  BindInspectorResize() {
    const handle = Element("inspectorResizeHandle");
    const workspace = document.querySelector(".lfWorkspace");
    const inspector = document.querySelector(".lfInspector");
    const key = "tengxian1938_encounter_sidebar_width_v1";
    let preferred = 390, drag = null;
    try { preferred = Number(localStorage.getItem(key)) || preferred; } catch { /* Storage is optional. */ }
    const SetWidth = (width, persist = false) => {
      preferred = Math.max(280, Math.min(720, Math.round(width)));
      const maximum = Math.max(280, Math.min(720, window.innerWidth - 300));
      const actual = Math.min(preferred, maximum);
      workspace.style.setProperty("--lf-inspector-width", `${actual}px`);
      handle.setAttribute("aria-valuemin", "280");
      handle.setAttribute("aria-valuemax", String(maximum));
      handle.setAttribute("aria-valuenow", String(actual));
      if (persist) { try { localStorage.setItem(key, String(preferred)); } catch { /* Keep this window's width. */ } }
    };
    handle.addEventListener("pointerdown", event => {
      if (event.button !== 0) return;
      event.preventDefault();
      drag = { x: event.clientX, width: inspector.getBoundingClientRect().width };
      handle.setPointerCapture(event.pointerId);
      document.body.classList.add("lfResizingInspector");
    });
    handle.addEventListener("pointermove", event => { if (drag) SetWidth(drag.width + drag.x - event.clientX); });
    const Finish = () => {
      if (!drag) return;
      drag = null; SetWidth(preferred, true);
      document.body.classList.remove("lfResizingInspector");
    };
    handle.addEventListener("pointerup", Finish);
    handle.addEventListener("pointercancel", Finish);
    handle.addEventListener("lostpointercapture", Finish);
    handle.addEventListener("keydown", event => {
      if (!["ArrowLeft", "ArrowRight", "Home"].includes(event.key)) return;
      event.preventDefault(); event.stopPropagation();
      SetWidth(event.key === "Home" ? 390 : inspector.getBoundingClientRect().width + (event.key === "ArrowLeft" ? 20 : -20), true);
    });
    window.addEventListener("resize", () => SetWidth(preferred));
    SetWidth(preferred);
  }

  Error(message = "") {
    Element("codexChatError").textContent = message;
    Element("codexChatError").hidden = !message;
  }

  async Connect() {
    try {
      const { sessions, deletedSessions = [], model, effort } = await Request("/sessions");
      this.model = model; this.effort = effort;
      this.sessions = sessions;
      this.deletedSessions = deletedSessions;
      this.available = true;
      if (this.connectionError) { this.connectionError = ""; this.Error(this.current?.error || ""); }
      this.DrawConnection();
      this.DrawList();
    } catch (error) {
      this.available = false;
      this.connectionError = error.message;
      Element("codexConnection").textContent = "本机服务未连接";
      this.Error(error.message);
    }
    this.UpdateSend();
  }

  SaveDraft() {
    this.drafts.set(this.current?.id || "new", { prompt: Element("codexPrompt").value, image: this.pendingImage, location: this.pendingLocation, units: this.pendingUnits });
  }

  RestoreDraft() {
    const draft = this.drafts.get(this.current?.id || "new");
    Element("codexPrompt").value = draft?.prompt || "";
    this.pendingImage = draft?.image || null;
    this.pendingLocation = draft?.location || null;
    if (!draft && !this.current) this.pendingLocation = structuredClone(this.snapshot());
    this.pendingUnits = draft?.units || null;
    this.DrawAttachment();
    this.DrawUnitsAttachment();
    this.RefreshContext();
  }

  New() {
    if (this.sending || this.managing) return;
    this.showDeleted = false;
    this.SaveDraft();
    this.selectionVersion++;
    this.current = null;
    this.loading = false;
    this.RestoreDraft();
    this.Error(); this.Draw();
    Element("codexPrompt").focus();
  }

  async Select(id) {
    if (this.sending || this.managing || id === this.current?.id) return;
    this.SaveDraft();
    const version = ++this.selectionVersion;
    this.loading = true; this.UpdateSend();
    try {
      const session = await Request(`/sessions/${id}`);
      if (version !== this.selectionVersion) return;
      this.current = session;
      this.RestoreDraft(); this.Error(); this.Draw();
    } catch (error) { if (version === this.selectionVersion) this.Error(error.message); }
    finally { if (version === this.selectionVersion) { this.loading = false; this.UpdateSend(); } }
  }

  async SetDeleted(id, deleted) {
    if (this.sending || this.managing) return;
    this.SaveDraft();
    this.selectionVersion++;
    this.loading = false;
    this.managing = id;
    this.Error(); this.UpdateSend(); this.DrawList();
    try {
      const session = await Request(`/sessions/${id}${deleted ? "" : "/restore"}`, { method: deleted ? "DELETE" : "POST" });
      if (this.current?.id === id) {
        this.current = deleted ? null : session;
        this.RestoreDraft();
      }
      if (!deleted) this.showDeleted = false;
      await this.Connect();
      this.Draw();
    } catch (error) { this.Error(error.message); }
    finally { this.managing = null; this.UpdateSend(); this.DrawList(); }
  }

  RefreshContext() {
    Element("codexPendingLocation").hidden = !this.pendingLocation;
    if (!this.pendingLocation) return;
    const { frame, location } = this.pendingLocation;
    Element("codexContextSummary").textContent = `定位 · ${frame.context.time.toFixed(2)} s`;
    Element("codexContextSummary").title = ContextLabel(frame.context);
    const details = Element("codexContextDetail");
    const content = JSON.stringify(location, null, 2);
    if (details.textContent !== content) details.textContent = content;
  }

  OpenUnits() {
    if (this.sending || this.current?.deletedAt || this.managing) return;
    for (const details of Element("codexComposer").querySelectorAll("details")) details.open = false;
    Element("unitSelection").hidden = false;
    this.unitActions.openUnits();
  }

  UpdateUnits(attachment, multiple) {
    const disabled = this.sending || !!this.current?.deletedAt || !!this.managing;
    const key = JSON.stringify([attachment, multiple, disabled]);
    if (key === this.unitSelectionKey) return;
    this.unitSelectionKey = key;
    this.selectedUnits = attachment;
    Element("unitSelectionCount").textContent = attachment.units.length ? `已选 ${attachment.units.length} 个单位` : "选择单位";
    Element("unitSelectionHint").textContent = multiple ? "多选模式 · 点击单位增减选择。" : "点击画面中的单位，Ctrl / Shift + 点击可增减选择。";
    Element("unitSelectionHint").hidden = attachment.units.length > 0;
    Element("selectSingleUnit").setAttribute("aria-pressed", String(!multiple));
    Element("selectMultipleUnits").setAttribute("aria-pressed", String(multiple));
    DrawUnitList(Element("selectedUnits"), attachment.units, this.unitActions.removeUnit, disabled);
    Element("attachSelectedUnits").disabled = disabled || !attachment.units.length;
    Element("clearSelectedUnits").disabled = disabled || !attachment.units.length;
    Element("attachSelectedUnits").textContent = attachment.units.length ? `附加 ${attachment.units.length} 个单位` : "附加单位";
  }

  DrawUnitsAttachment() {
    Element("codexPendingUnits").hidden = !this.pendingUnits;
    Element("codexUnitsSummary").textContent = this.pendingUnits ? UnitsLabel(this.pendingUnits) : "单位";
    DrawUnitList(Element("codexUnitsList"), this.pendingUnits?.units || []);
    Element("codexUnitsDetail").textContent = this.pendingUnits ? JSON.stringify(this.pendingUnits, null, 2) : "";
  }

  async Attach(editor) {
    const image = await BlobDataUrl(await editor.Blob());
    this.pendingImage = { image, frame: editor.Packet(), capture: editor.capture, marks: structuredClone(editor.marks) };
    this.DrawAttachment();
  }

  async OpenScreenshot(message, button) {
    if (this.sending) return;
    const version = this.selectionVersion;
    const screenshotVersion = this.screenshotVersion = (this.screenshotVersion || 0) + 1;
    button.disabled = true;
    button.setAttribute("aria-busy", "true");
    try {
      const frame = await Request(message.screenshotUrl.slice(API.length).replace(/Screenshot\.png$/, "ScreenshotFrame.json"));
      const screenshot = frame.screenshot ? ValidateScreenshot(frame.screenshot) : null;
      const image = new Image();
      image.src = screenshot?.image || message.screenshotUrl;
      await image.decode();
      if (version !== this.selectionVersion || screenshotVersion !== this.screenshotVersion || this.sending) return;
      const capture = document.createElement("canvas");
      capture.width = image.naturalWidth;
      capture.height = image.naturalHeight;
      capture.getContext("2d").drawImage(image, 0, 0);
      this.Error();
      this.editScreenshot({ capture, frame, marks: screenshot?.marks || [] });
    } catch (error) {
      if (version === this.selectionVersion && screenshotVersion === this.screenshotVersion) this.Error(`截图打开失败 · ${error.message}`);
    } finally {
      button.disabled = false;
      button.removeAttribute("aria-busy");
    }
  }

  DrawAttachment() {
    Element("codexPendingImage").hidden = !this.pendingImage;
    Element("codexImagePreview").src = this.pendingImage?.image || "";
    Element("codexImageLabel").textContent = "截图";
    Element("editCodexImage").title = this.pendingImage ? ContextLabel(this.pendingImage.frame.context) : "继续标注";
  }

  UpdateSend() {
    const running = ["running", "interrupting"].includes(this.current?.status);
    const stopping = this.stopping === this.current?.id || this.current?.status === "interrupting";
    const busy = this.sending || this.loading || stopping || !!this.managing;
    const deleted = !!this.current?.deletedAt;
    Element("sendCodexChat").disabled = !this.available || busy || deleted || !Element("codexPrompt").value.trim();
    Element("sendCodexChat").textContent = this.sending ? "提交中…" : running ? "补充要求" : "发送";
    Element("interruptCodexChat").hidden = !running;
    Element("interruptCodexChat").disabled = stopping || this.sending;
    Element("interruptCodexChat").textContent = stopping ? "中断中…" : "中断";
    Element("codexPrompt").readOnly = this.sending || deleted || !!this.managing;
    for (const id of ["attachCodexScreenshot", "attachCodexLocation", "removeCodexLocation", "editCodexImage", "removeCodexImage",
      "attachCodexUnits", "removeCodexUnits", "selectSingleUnit", "selectMultipleUnits"]) Element(id).disabled = this.sending || deleted || !!this.managing;
    Element("newCodexChat").disabled = this.sending || !!this.managing;
    if (this.selectedUnits) this.UpdateUnits(this.selectedUnits, Element("selectMultipleUnits").getAttribute("aria-pressed") === "true");
  }

  DrawList() {
    const list = Element("codexSessions");
    list.replaceChildren();
    Element("newCodexChat").classList.toggle("selected", !this.current);
    Element("toggleDeletedCodexChats").textContent = this.showDeleted ? "返回会话" : `已删除 (${this.deletedSessions.length})`;
    Element("toggleDeletedCodexChats").setAttribute("aria-pressed", String(this.showDeleted));
    for (const session of this.showDeleted ? this.deletedSessions : this.sessions) {
      const row = document.createElement("div"); row.className = "lfChatSessionRow";
      const button = document.createElement("button");
      button.className = "lfChatSession";
      button.disabled = this.sending || !!this.managing;
      button.title = session.title;
      button.classList.toggle("selected", session.id === this.current?.id);
      button.setAttribute("aria-current", String(session.id === this.current?.id));
      const title = document.createElement("span"), status = document.createElement("small");
      title.textContent = session.title;
      const labels = { running: "正在执行", interrupting: "中断中", interrupted: "已中断", failed: "需要处理", completed: "已完成" };
      status.textContent = session.status === "running" ? session.progress?.activity || labels.running : labels[session.status] || "已完成";
      status.title = session.progress?.text || status.textContent;
      button.append(title, status);
      button.onclick = () => this.Select(session.id);
      const action = document.createElement("button"); action.type = "button"; action.className = "lfChatSessionAction";
      action.textContent = this.showDeleted ? "还原" : "删除";
      action.setAttribute("aria-label", `${action.textContent}会话 · ${session.title}`);
      action.title = this.showDeleted ? "还原到会话列表" : "移入已删除列表，保留本机 Codex 记录";
      action.disabled = this.sending || !!this.managing;
      action.onclick = () => this.SetDeleted(session.id, !session.deletedAt);
      row.append(button, action); list.append(row);
    }
  }

  DrawConnection() {
    const model = this.current ? this.current.model || "旧会话沿用原配置" : this.model;
    const effort = this.current ? this.current.effort : this.effort;
    Element("codexConnection").textContent = ["本机 Codex CLI", model, effort].filter(Boolean).join(" · ");
  }

  DrawProgress() {
    const pending = Element("codexProgress");
    if (!pending || this.current?.status !== "running") return;
    const progress = this.current.progress;
    const seconds = Math.max(0, Math.floor((Date.now() - Date.parse(progress?.updatedAt || this.current.updatedAt)) / 1000));
    pending.querySelector("strong").textContent = progress?.activity || (this.current.model ? "正在连接本机 Codex" : "旧版 CLI 正在执行");
    pending.querySelector("p").textContent = progress?.text || "";
    pending.querySelector("small").textContent = Number.isFinite(seconds) ? `最后更新 ${seconds} 秒前` : "等待进度同步";
  }

  Draw() {
    this.DrawList();
    this.DrawConnection();
    Element("codexChatTitle").textContent = this.current?.title || "新会话";
    const log = Element("codexMessages");
    log.replaceChildren();
    for (const message of this.current?.messages || []) {
      const row = document.createElement("article"); row.className = `lfChatMessage ${message.role}`;
      const label = document.createElement("span"); label.className = "lfChatAuthor";
      label.textContent = message.role === "user" ? "你" : "Codex";
      const bubble = document.createElement("div"); bubble.className = "lfChatBubble";
      if (message.role === "assistant") RenderMarkdown(bubble, message.text);
      else bubble.textContent = message.text;
      row.append(label, bubble);
      if (message.units) {
        const details = document.createElement("details"); details.className = "lfChatContext lfChatFrame";
        const summary = document.createElement("summary"), list = document.createElement("div"), link = document.createElement("a");
        summary.textContent = UnitsLabel(message.units); list.className = "lfSelectedUnits";
        DrawUnitList(list, message.units.units);
        link.textContent = "打开单位信息 JSON"; link.href = message.unitsUrl; link.target = "_blank"; link.rel = "noopener";
        details.append(summary, list, link); row.append(details);
      }
      if (message.frame) {
        const attachment = document.createElement("a"); attachment.className = "lfChatFrame";
        attachment.textContent = `定位 · ${message.frame.time.toFixed(2)} s`;
        attachment.title = ContextLabel(message.frame);
        attachment.href = message.locationUrl; attachment.target = "_blank"; attachment.rel = "noopener";
        row.append(attachment);
      }
      if (message.screenshotUrl) {
        const link = document.createElement("button"), image = document.createElement("img");
        link.type = "button"; link.className = "lfChatScreenshot";
        link.title = "打开截图并继续标注";
        link.setAttribute("aria-label", `编辑标注截图 · ${ContextLabel(message.screenshotFrame)}`);
        link.onclick = () => this.OpenScreenshot(message, link);
        image.src = message.screenshotUrl; image.alt = `标注截图 · ${ContextLabel(message.screenshotFrame)}`;
        link.append(image); row.append(link);
      }
      log.append(row);
    }
    if (["running", "interrupting", "interrupted"].includes(this.current?.status)) {
      const pending = document.createElement("div"); pending.className = "lfChatWaiting";
      if (this.current.status === "running") {
        const row = document.createElement("article"); row.className = "lfChatMessage";
        const label = document.createElement("span"); label.className = "lfChatAuthor";
        label.textContent = "Codex";
        pending.classList.add("lfChatBubble");
        pending.id = "codexProgress"; pending.setAttribute("role", "status");
        pending.append(document.createElement("strong"), document.createElement("p"), document.createElement("small"));
        row.append(label, pending); log.append(row); this.DrawProgress();
      } else {
        pending.textContent = this.current.status === "interrupting" ? "正在中断…" : "已中断";
        log.append(pending);
      }
    }
    if (this.current?.error) this.Error(this.current.error);
    this.UpdateSend();
    log.scrollTop = log.scrollHeight;
  }

  async Send() {
    if (Element("sendCodexChat").disabled) return;
    const { frame = null, location = null } = this.pendingLocation || {};
    const body = { sessionId: this.current?.id, steer: this.current?.status === "running", prompt: Element("codexPrompt").value, frame, location, units: this.pendingUnits,
      screenshot: this.pendingImage ? { image: this.pendingImage.image, frame: this.pendingImage.frame } : null };
    const content = JSON.stringify(body);
    if (this.lastSubmission?.content !== content) this.lastSubmission = { content, requestId: crypto.randomUUID() };
    body.requestId = this.lastSubmission.requestId;
    this.selectionVersion++;
    this.sending = true; this.Error(); this.UpdateSend();
    try {
      this.current = await Request("/turns", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      this.lastSubmission = null;
      this.drafts.delete(body.sessionId || "new");
      Element("codexPrompt").value = ""; this.pendingImage = null; this.DrawAttachment();
      this.pendingLocation = null; this.RefreshContext();
      this.pendingUnits = null; this.DrawUnitsAttachment();
      this.sessions = [this.current, ...this.sessions.filter(item => item.id !== this.current.id)];
      this.Draw();
    } catch (error) { this.Error(error.message); }
    finally { this.sending = false; this.UpdateSend(); }
  }

  async Interrupt() {
    const id = this.current?.id;
    if (!id || this.stopping || !["running", "interrupting"].includes(this.current.status)) return;
    this.stopping = id;
    this.Error(); this.UpdateSend();
    try {
      const session = await Request(`/sessions/${id}/interrupt`, { method: "POST", signal: AbortSignal.timeout(25000) });
      this.sessions = this.sessions.map(item => item.id === id ? session : item);
      if (this.current?.id === id) { this.current = session; this.Draw(); }
      else this.DrawList();
    } catch (error) { if (this.current?.id === id) this.Error(error.message); }
    finally { this.stopping = null; this.UpdateSend(); }
  }

  async Poll() {
    this.RefreshContext();
    this.DrawProgress();
    if (this.polling || this.sending || this.loading || this.managing) return;
    this.polling = true;
    const version = this.selectionVersion;
    try {
      const { sessions, deletedSessions = [], model, effort } = await Request("/sessions");
      this.model = model; this.effort = effort;
      this.available = true;
      if (this.connectionError) { this.connectionError = ""; this.Error(this.current?.error || ""); }
      this.DrawConnection();
      if (this.current && !this.sending) {
        const session = await Request(`/sessions/${this.current.id}`);
        if (version === this.selectionVersion && !this.sending && JSON.stringify(session) !== JSON.stringify(this.current)) {
          this.current = session; this.Draw();
        }
      }
      if (version === this.selectionVersion && !this.sending) { this.sessions = sessions; this.deletedSessions = deletedSessions; this.DrawList(); }
    } catch (error) {
      this.available = false;
      this.connectionError = error.message;
      Element("codexConnection").textContent = "本机服务未连接";
      this.Error(error.message);
    } finally { this.polling = false; this.UpdateSend(); }
  }
}
