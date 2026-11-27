import { OpenScreenshot } from "./Script_ModelWorkbenchMarkup.mjs?v=20261122";

const $ = id => document.getElementById(id);
const api = "/__model-workbench/tasks";
const labels = {
  draft: "待准备参考图", preparing: "参考图准备中", refsReady: "参考图待验收",
  refsApproved: "参考图已通过", building: "建模中", candidate: "模型待独立验收",
  reviewing: "独立验收中", needsRevision: "模型返修中", modelReady: "模型待你验收", complete: "已验收",
  externalIteration: "原会话迭代中",
};
const types = { concept: "原画局部", research: "自行搜集", imported: "已接入的任务记录" };
const checks = { silhouette: "轮廓", proportion: "比例", structure: "结构", material: "材质", details: "细节" };
const drafts = new Map();
let tasks = [], task, activeId, stage = "references", viewpoint, selectedSet, selectedModel, selectedSession;
let providerOptions = {}, openAiReady = false, listStamp = "", updatedTask = "", chatStamp = "", requestBusy = false;
let referenceInputs = [], uploading = false, disconnect = "", notificationIds = new Set();

function El(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function Button(text, action, className = "") {
  const button = El("button", className, text);
  button.type = "button";
  button.onclick = action;
  return button;
}

function Status(element, message = "") {
  element.textContent = message;
  element.hidden = !message;
}

function Draft() {
  if (!drafts.has(activeId)) {
    let draft;
    try { draft = JSON.parse(localStorage.getItem(`ModelWorkbenchDraft:${activeId}`)); } catch { /* Ignore unreadable saved drafts. */ }
    drafts.set(activeId, draft && Array.isArray(draft.attachments) ? draft : { text: "", attachments: [] });
  }
  return drafts.get(activeId);
}

function StoreDraft(owner = activeId) {
  const draft = drafts.get(owner);
  try {
    const key = `ModelWorkbenchDraft:${owner}`;
    if (draft?.text || draft?.attachments.length) localStorage.setItem(key, JSON.stringify(draft));
    else localStorage.removeItem(key);
  } catch { /* The current draft stays usable in this tab. */ }
}

function Asset(id, owner = activeId) {
  return `${api}/${owner}/assets/${id}`;
}

async function Request(url, options) {
  const response = await fetch(url, { cache: "no-store", ...options });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data) throw Error(data?.error || "请通过本地预览服务打开工作台");
  return data;
}

function Post(url, body) {
  return Request(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}

function Upload(file, name, owner = activeId) {
  return Request(`${api}/${owner}/upload?name=${encodeURIComponent(name)}`, { method: "POST", body: file });
}

function PopulateProviders() {
  for (const select of document.querySelectorAll(".providerSelect")) {
    const key = select.value || "openai";
    select.replaceChildren(...Object.entries(providerOptions).map(([value, title]) => new Option(title, value)));
    select.value = key;
  }
}

function JobStatus(job) {
  return job.failure ? "需要处理" : labels[job.state];
}

function RenderJobs() {
  const query = $("search").value.trim().toLocaleLowerCase();
  const jobs = tasks.filter(item => item.title.toLocaleLowerCase().includes(query));
  const focused = document.activeElement?.dataset.job;
  $("jobs").replaceChildren(...jobs.map(job => {
    const card = Button("", () => SelectTask(job.id), "mwJob");
    card.dataset.job = job.id;
    if (job.id === activeId) card.setAttribute("aria-current", "true");
    const head = El("span", "mwJobHead");
    const status = El("span", "mwStatus", JobStatus(job));
    status.dataset.state = job.failure ? "failed" : job.state;
    head.append(El("strong", "", job.title), status);
    const track = El("span", "mwTrack");
    const states = job.state === "externalIteration" ? ["waiting", "current"] : job.approved
      ? ["done", job.failure ? "failed" : job.state === "complete" ? "done" : "current"]
      : [job.failure ? "failed" : "current", "waiting"];
    for (const [index, label] of ["参考图", "模型"].entries()) {
      const node = El("span", "mwNode");
      node.dataset.state = states[index];
      node.append(El("span", "mwNodeMark", { done: "✓", failed: "×" }[states[index]]), El("span", "", label));
      track.append(node);
    }
    card.append(head, track);
    return card;
  }));
  if (!jobs.length) $("jobs").append(El("small", "", query ? "没有匹配的任务" : "暂无任务"));
  if (focused) $("jobs").querySelector(`[data-job="${focused}"]`)?.focus({ preventScroll: true });
}

function Notify() {
  const ready = tasks.filter(job => job.state === "modelReady");
  $("notifications").hidden = !ready.length && (!("Notification" in window) || Notification.permission !== "default");
  $("notifications").textContent = ready.length ? `待验收 ${ready.length}` : "验收通知";
  $("notifications").title = ready.length ? "查看待验收模型" : "允许浏览器通知";
  for (const job of ready) {
    if (!notificationIds.has(job.id) && "Notification" in window && Notification.permission === "granted") {
      const notice = new Notification("模型待验收", { body: job.title, tag: job.id });
      notice.onclick = () => { window.focus(); SelectTask(job.id); notice.close(); };
    }
  }
  notificationIds = new Set(ready.map(job => job.id));
}

async function Refresh() {
  try {
    const list = await Request(api);
    if (JSON.stringify(list.providers) !== JSON.stringify(providerOptions)) {
      providerOptions = list.providers;
      PopulateProviders();
    }
    openAiReady = list.openAiReady;
    disconnect = "";
    $("newTask").disabled = $("welcomeCreate").disabled = false;
    tasks = list.tasks;
    const nextStamp = JSON.stringify(tasks);
    if (nextStamp !== listStamp) { listStamp = nextStamp; RenderJobs(); Notify(); }
    if (!activeId && tasks.length) await SelectTask(tasks[0].id, false);
    if (activeId) {
      const current = activeId;
      const detail = await Request(`${api}/${current}`);
      if (current === activeId) UpdateTask(detail);
    }
    RenderChat();
  } catch (error) {
    disconnect = error.message;
    $("newTask").disabled = $("welcomeCreate").disabled = true;
    RenderChat();
  }
}

async function SelectTask(id, fetchDetail = true) {
  activeId = id;
  task = null;
  viewpoint = selectedSet = selectedModel = selectedSession = undefined;
  updatedTask = chatStamp = "";
  const url = new URL(location.href);
  url.searchParams.set("task", id);
  history.replaceState(null, "", url);
  if (matchMedia("(max-width: 850px)").matches) TogglePanel("Rail", false);
  RenderJobs();
  $("message").value = Draft().text;
  Status($("chatNotice"));
  if (!fetchDetail) return;
  try {
    const detail = await Request(`${api}/${id}`);
    if (id === activeId) UpdateTask(detail);
  } catch (error) { Status($("chatNotice"), error.message); }
}

function UpdateTask(detail) {
  if (task && detail.revision < task.revision) return;
  if (!task || (!task.approved && detail.approved) || (task.state !== "modelReady" && detail.state === "modelReady")) {
    stage = detail.approved ? "model" : "references";
  }
  task = detail;
  const stamp = JSON.stringify([task.id, task.revision, task.active, task.failure]);
  if (stamp !== updatedTask) {
    updatedTask = stamp;
    RenderStage();
  }
  RenderChat();
}

async function Act(action, payload = {}) {
  if (!task || requestBusy) throw Error("任务正在更新");
  requestBusy = true;
  const id = task.id;
  try {
    const detail = await Post(`${api}/${id}/action`, { action, revision: task.revision, ...payload });
    if (id === activeId) UpdateTask(detail);
    const next = tasks.find(item => item.id === id);
    if (next) Object.assign(next, { state: detail.state, active: Boolean(detail.active), approved: Boolean(detail.approved), failure: Boolean(detail.failure) });
    RenderJobs();
    Notify();
    return detail;
  } finally { requestBusy = false; }
}

function StageAction(action, payload) {
  return Act(action, payload).catch(error => Status($("stageError"), error.message));
}

function Empty(title, detail) {
  const panel = El("div", "mwEmpty");
  panel.append(El("strong", "", title), El("p", "", detail));
  return panel;
}

function SourceLink(source) {
  try {
    const href = new URL(source);
    if (!["http:", "https:"].includes(href.protocol)) return null;
    const link = El("a", "", "来源 ↗");
    link.href = href.href; link.target = "_blank"; link.rel = "noopener noreferrer";
    return link;
  } catch { return null; }
}

function Figure(item, title, extra, owner = activeId) {
  const figure = El("figure");
  const image = El("img");
  image.src = Asset(item.id, owner);
  image.alt = title;
  image.loading = "lazy";
  const view = Button("", () => OpenPhoto(item.id, title, owner), "mwImage");
  view.setAttribute("aria-label", `查看${title}`);
  view.append(image);
  const caption = El("figcaption");
  caption.append(El("strong", "", title));
  if (extra) caption.append(extra);
  figure.append(view, caption);
  return figure;
}

function Gallery(title, items) {
  const section = El("section");
  const head = El("header", "mwSectionHead");
  head.append(El("h2", "", title), El("small", "", `${items.length} 张`));
  const gallery = El("div", "mwGallery");
  for (const item of items) {
    const meta = El("small", "", item.width ? `${item.width} × ${item.height}` : "");
    const link = SourceLink(item.source);
    if (link) meta.append(" · ", link);
    else if (item.source) meta.append(" · ", item.source);
    gallery.append(Figure(item, item.label || item.name, meta));
  }
  section.append(head, gallery);
  return section;
}

function Details(title, content) {
  const details = El("details", "mwDetails");
  details.append(El("summary", "", title), typeof content === "string" ? El("p", "", content) : content);
  return details;
}

function HistorySelect(sets, selected, label, onChange) {
  const select = El("select");
  select.setAttribute("aria-label", label);
  sets.forEach((item, index) => select.add(new Option(`${label} ${index + 1}${index === sets.length - 1 ? " · 最新" : ""}`, item.id)));
  select.value = selected;
  select.onchange = () => { onChange(select.value); RenderStage(); };
  return select;
}

function RenderStage() {
  if (!task) return;
  $("welcome").hidden = true;
  $("taskHead").hidden = $("steps").hidden = $("stage").hidden = false;
  $("taskTitle").textContent = task.title;
  $("taskType").textContent = types[task.type];
  $("taskStatus").textContent = JobStatus(task);
  $("taskStatus").dataset.state = task.failure ? "failed" : task.state;
  document.querySelectorAll("[data-step]").forEach(button => {
    if (button.dataset.step === stage) button.setAttribute("aria-current", "step");
    else button.removeAttribute("aria-current");
  });
  Status($("brief"), task.brief);
  Status($("progress"), task.active?.detail);
  Status($("stageError"), task.failure);
  const actions = $("stageActions"), materials = $("materials");
  const previousDetails = new Set([...materials.querySelectorAll("details[open]")].map(node => node.querySelector("summary").textContent));
  actions.replaceChildren();
  materials.replaceChildren();
  if (task.workspace) {
    const folder = task.workspace;
    const copy = Button("复制任务目录", async () => {
      try { await navigator.clipboard.writeText(folder); copy.textContent = "已复制任务目录"; }
      catch { copy.textContent = "目录复制失败"; }
    });
    copy.title = folder;
    actions.append(copy);
  }
  if (task.original) {
    const original = El("a", "", "打开原 Codex 会话");
    original.href = `codex://threads/${task.original.threadId}`;
    actions.append(original);
    if (stage === "references") {
      materials.append(Gallery("原会话的反馈截图", task.sessions[0].messages[0].attachments));
    } else {
      const files = El("ul");
      for (const { name, file } of task.original.files) {
        const item = El("li", "", `${name} · `);
        item.append(El("code", "", file));
        files.append(item);
      }
      materials.append(Details("原工程与已有产物路径", files));
      if (task.original.evidence.length) materials.append(Gallery("原会话的模型对照", task.original.evidence));
    }
    return;
  }
  if (!task.active && task.retry && task.retry !== "chat") actions.append(Button("重试上次操作", () => StageAction("retry"), "primary"));
  if (stage === "references") {
    const newest = task.referenceSets.at(-1);
    const set = task.referenceSets.find(item => item.id === selectedSet) || newest;
    if (!task.active && ["draft", "refsReady"].includes(task.state)) {
      actions.append(Button(newest ? "返修参考图" : task.type === "research" ? "搜集参考图" : "准备参考图", OpenReferences, newest ? "" : "primary"));
    }
    if (!task.active && task.retry !== "references" && task.state === "refsReady" && set === newest) {
      actions.append(Button("通过参考图并开始建模", () => StageAction("approveReferences", { referenceSet: set.id }), "primary"));
      if (set.tripoReady) actions.append(Button("通过参考图并用 Tripo MCP 建模（消耗积分）",
        () => StageAction("approveReferences", { referenceSet: set.id, buildProvider: "tripo" })));
    }
    if (task.referenceSets.length > 1) actions.append(HistorySelect(task.referenceSets, set.id, "参考图版本", value => { selectedSet = value; }));
    if (set) {
      if (set.decision) materials.append(El("p", "mwBrief", set.decision));
      materials.append(Gallery(task.approved === set.id ? "已批准参考图" : "待验收参考图", set.views));
    } else materials.append(Empty("等待参考图", task.type === "concept" ? "添加原画、局部截图或圈注，生成正面、左侧和背面。" : "Agent 会搜集多角度参考图并说明是否需要补三视图。"));
    if (task.sources.length) materials.append(Gallery("原画与输入图", task.sources));
  } else {
    const newest = task.candidates.at(-1);
    const candidate = task.candidates.find(item => item.id === selectedModel) || newest;
    if (!candidate) {
      materials.append(Empty(task.approved ? "等待模型渲染" : "待批准参考图", task.approved
        ? "建模会话会按批准的参考图逐一对齐并提交渲染。"
        : "请在参考图步骤查看并确认制作依据。"));
    } else {
      if (task.candidates.length > 1) actions.append(HistorySelect(task.candidates, candidate.id, "模型版本", value => { selectedModel = value; }));
      actions.append(Button("查看 3D 模型", () => OpenModel(candidate)));
      for (const [id, title, filename] of [[candidate.model, "下载 GLB", "Model.glb"], [candidate.rebuild, "下载重建脚本", "Rebuild.py"]]) {
        const link = El("a", "", title);
        link.href = Asset(id); link.download = filename;
        actions.append(link);
      }
      if (!task.active && task.state === "modelReady" && candidate === newest) {
        actions.append(Button("模型验收通过", () => StageAction("accept", { candidate: candidate.id }), "primary"));
        actions.append(Button("按会话草稿返修", () => Revise(candidate)));
      }
      const refs = task.referenceSets.find(item => item.id === candidate.approved).views;
      const index = Math.max(0, refs.findIndex(item => item.id === viewpoint));
      const image = refs[index], render = candidate.views.find(item => item.referenceId === image.id);
      const viewRow = El("div", "mwViewRow");
      viewRow.setAttribute("aria-label", "对照视角");
      for (const view of refs) {
        const button = Button(view.label, () => { viewpoint = view.id; RenderStage(); });
        button.setAttribute("aria-pressed", String(view === image));
        viewRow.append(button);
      }
      const compare = El("div", "mwCompare");
      compare.append(Figure(image, `参考图 · ${image.label}`, SourceLink(image.source)), Figure(render, "同视角模型渲染"));
      materials.append(viewRow, compare);
      const evidence = El("ul");
      evidence.append(El("li", "", `相机与构图 · ${render.camera}`));
      for (const [key, title] of Object.entries(checks)) evidence.append(El("li", "", `${title} · ${render.checks[key]}`));
      materials.append(Details("建模自检", evidence));
      if (candidate.review) {
        const note = candidate.review.checks.find(check => check.referenceId === image.id)?.note;
        materials.append(Details("独立验收记录", [candidate.review.notes, note].filter(Boolean).join("\n\n")));
        if (candidate.review.attachments.length) materials.append(Gallery("验收标注", candidate.review.attachments));
      }
    }
  }
  for (const details of materials.querySelectorAll("details")) details.open = previousDetails.has(details.querySelector("summary").textContent);
}

function OpenPhoto(id, title, owner = activeId) {
  $("photoTitle").textContent = title;
  $("photo").src = Asset(id, owner);
  $("photo").alt = title;
  delete $("photo").dataset.native;
  $("photoDialog").showModal();
}

async function OpenModel(candidate) {
  const dialog = $("modelDialog"), container = $("viewer");
  dialog.showModal();
  $("viewerStatus").textContent = "正在载入 GLB…";
  const controller = new AbortController();
  const close = () => controller.abort();
  dialog.addEventListener("close", close, { once: true });
  try {
    const { OpenViewer } = await import("./Script_ModelWorkbenchViewer.mjs?v=20261122");
    await OpenViewer(container, Asset(candidate.model), controller.signal);
    if (!controller.signal.aborted) $("viewerStatus").textContent = "拖动旋转 · 滚轮缩放";
  } catch (error) {
    if (!controller.signal.aborted) $("viewerStatus").textContent = `无法预览模型 · ${error.message}`;
  }
}

function RenderChips(container, items, remove) {
  container.replaceChildren(...items.map((item, index) => {
    const chip = El("span", "mwChip");
    chip.append(Button(item.name, () => OpenPhoto(item.id, item.name)));
    if (remove) {
      const button = Button("×", () => remove(index));
      button.setAttribute("aria-label", `移除${item.name}`);
      chip.append(button);
    }
    return chip;
  }));
}

function RenderChat() {
  const sessions = task?.sessions || [];
  const session = selectedSession === "" ? undefined
    : sessions.find(item => item.id === selectedSession) || sessions.at(-1);
  const enabled = Boolean(task && !disconnect && !task.original);
  $("newChat").disabled = !enabled;
  for (const id of ["sessions", "message", "markScreenshot", "send"]) $(id).disabled = !enabled;
  $("stop").hidden = !task?.active;
  $("composer").hidden = Boolean(task?.original);
  $("connection").textContent = disconnect || (task?.original ? "原会话记录" : session ? `${session.model.replace("gpt-", "")} · ${session.effort}` : "本机 Codex");
  const stamp = JSON.stringify([task?.id, sessions.map(item => [item.id, item.messages.length]), session?.id, task?.active?.sessionId, enabled]);
  if (stamp === chatStamp) return;
  chatStamp = stamp;
  const options = sessions.map(item => new Option(item.title, item.id));
  $("sessions").replaceChildren(...(task?.original ? options : [new Option("新会话", ""), ...options]));
  $("sessions").value = session?.id || "";
  $("thread").replaceChildren(...(session?.messages || []).map(message => {
    const article = El("article", "mwMessage");
    article.dataset.role = message.role;
    article.append(El("p", "mwSender", { user: "你", agent: "Codex", system: "工作台" }[message.role]));
    if (message.text) article.append(El("p", "mwBubble", message.text));
    if (message.attachments.length) {
      const clips = El("div", "mwAttachments");
      RenderChips(clips, message.attachments);
      article.append(clips);
    }
    return article;
  }));
  if (!session) $("thread").append(El("small", "", task ? "选择制作会话，或发送一条新需求。" : "选中任务后查看会话。"));
  $("chatScroll").scrollTop = $("chatScroll").scrollHeight;
  RenderDraft();
}

function RenderDraft() {
  RenderChips($("attached"), task ? Draft().attachments : [], index => {
    Draft().attachments.splice(index, 1);
    StoreDraft();
    RenderDraft();
  });
}

function SaveDraft(text, owner) {
  const draft = drafts.get(owner);
  draft.text = text;
  draft.attachments = [];
  StoreDraft(owner);
  if (owner === activeId) { $("message").value = text; RenderDraft(); }
}

async function SendChat(event) {
  event.preventDefault();
  const current = activeId, draft = Draft();
  if (!draft.text.trim() && !draft.attachments.length) return;
  try {
    const sessionId = $("sessions").value;
    await Act("chat", { text: draft.text, attachments: draft.attachments, sessionId: sessionId || undefined, newSession: !sessionId });
    if (selectedSession === "") selectedSession = undefined;
    SaveDraft("", current);
    Status($("chatNotice"));
    RenderChat();
  } catch (error) { Status($("chatNotice"), error.message); }
}

async function Revise(candidate) {
  const current = activeId, draft = Draft();
  if (!draft.text.trim() && !draft.attachments.length) {
    TogglePanel("Chat", true);
    $("message").focus();
    Status($("chatNotice"), "写下返修说明或附加截图，再点「按会话草稿返修」。");
    return;
  }
  const result = await StageAction("reviseModel", { candidate: candidate.id, text: draft.text, attachments: draft.attachments });
  if (result) SaveDraft("", current);
}

function CapturePair() {
  const images = [...document.querySelectorAll(".mwCompare img")].filter(image => image.complete && image.naturalWidth);
  if (!images.length) return null;
  const canvas = El("canvas");
  const width = 1120, height = 840, label = 35;
  canvas.width = width * images.length;
  canvas.height = height + label;
  const context = canvas.getContext("2d");
  context.fillStyle = "#202119";
  context.fillRect(0, 0, canvas.width, canvas.height);
  for (const [index, image] of images.entries()) {
    const scale = Math.min(width / image.naturalWidth, height / image.naturalHeight, 1);
    const w = image.naturalWidth * scale, h = image.naturalHeight * scale;
    context.fillStyle = "#deddd2";
    context.font = "18px sans-serif";
    context.fillText(image.alt, width * index + 12, 24);
    context.drawImage(image, width * index + (width - w) / 2, label + (height - h) / 2, w, h);
  }
  return canvas;
}

function Mark(image, destination = "chat") {
  if (!task) return;
  const owner = activeId;
  $("attachScreenshot").textContent = destination === "references" ? "添加为参考输入" : "附加到会话";
  OpenScreenshot(image, async blob => {
    const item = await Upload(blob, destination === "references" ? "圈注参考.png" : "标注截图.png", owner);
    return () => {
      if (destination === "references") {
        referenceInputs = [item, ...referenceInputs].slice(0, 6);
        RenderReferenceInputs();
      } else if (owner === activeId) {
        Draft().attachments.push(item);
        StoreDraft();
        TogglePanel("Chat", true);
        RenderDraft();
      }
    };
  });
}

function RenderReferenceInputs() {
  RenderChips($("referenceInputs"), referenceInputs, index => {
    referenceInputs.splice(index, 1);
    RenderReferenceInputs();
  });
  $("runReference").disabled = uploading;
}

function OpenReferences() {
  const form = $("referenceForm");
  referenceInputs = [...task.sources];
  form.reset();
  form.elements.provider.value = task.provider;
  Status($("referenceError"));
  RenderReferenceInputs();
  $("referenceTitle").textContent = task.type === "research" ? "搜集多角度参考图" : "生成原画局部三视图";
  $("referenceDialog").showModal();
}

function TogglePanel(panel, visible) {
  const cls = `hide${panel}`, workspace = $("workspace");
  const show = visible ?? workspace.classList.contains(cls);
  workspace.classList.toggle(cls, !show);
  $(panel === "Rail" ? "navToggle" : "chatToggle").setAttribute("aria-expanded", String(show));
  if (show && matchMedia("(max-width: 850px)").matches) TogglePanel(panel === "Rail" ? "Chat" : "Rail", false);
}

function Resize(id, prop, side, width) {
  const handle = $(id);
  function Apply(size) {
    $("workspace").style.setProperty(prop, `${size}px`);
    localStorage.setItem(prop, String(size));
  }
  const saved = Number(localStorage.getItem(prop));
  if (saved > 0) Apply(saved);
  handle.onpointerdown = event => { if (event.button === 0) handle.setPointerCapture(event.pointerId); };
  handle.onpointermove = event => {
    if (handle.hasPointerCapture(event.pointerId)) Apply(Math.max(150, side === 1 ? event.clientX : innerWidth - event.clientX));
  };
  handle.onkeydown = event => {
    const current = $(side === 1 ? "sidebar" : "chatPanel").offsetWidth;
    const step = { ArrowLeft: -12, ArrowRight: 12 }[event.key];
    if (step || event.key === "Home") { event.preventDefault(); Apply(step ? current + step * side : width); }
  };
}

$("newTask").onclick = $("welcomeCreate").onclick = () => {
  $("createForm").reset();
  Status($("createError"));
  $("createDialog").showModal();
};
$("createForm").onsubmit = async event => {
  event.preventDefault();
  const button = event.submitter;
  button.disabled = true;
  try {
    const created = await Post(api, Object.fromEntries(new FormData(event.currentTarget)));
    tasks.unshift(created);
    $("createDialog").close();
    await SelectTask(created.id);
    if (task?.id === created.id) OpenReferences();
  } catch (error) { Status($("createError"), error.message); }
  finally { button.disabled = false; }
};
$("cancelCreate").onclick = () => $("createDialog").close();
$("cancelReference").onclick = () => $("referenceDialog").close();
$("sourceFiles").onchange = async event => {
  const files = [...event.target.files];
  event.target.value = "";
  if (referenceInputs.length + files.length > 6) return Status($("referenceError"), "最多添加 6 张原画");
  uploading = true;
  RenderReferenceInputs();
  try {
    for (const file of files) referenceInputs.push(await Upload(file, file.name));
    Status($("referenceError"));
  } catch (error) { Status($("referenceError"), error.message); }
  finally { uploading = false; RenderReferenceInputs(); }
};
$("referenceForm").onsubmit = async event => {
  event.preventDefault();
  const payload = Object.fromEntries(new FormData(event.currentTarget));
  if (payload.provider === "openai" && task.type === "concept" && !openAiReady) {
    return Status($("referenceError"), "本机服务缺少 OPENAI_API_KEY");
  }
  $("runReference").disabled = true;
  try {
    await Act("references", { ...payload, attachments: referenceInputs });
    selectedSet = undefined;
    $("referenceDialog").close();
  } catch (error) { Status($("referenceError"), error.message); }
  finally { $("runReference").disabled = uploading; }
};
$("navToggle").onclick = () => TogglePanel("Rail");
$("chatToggle").onclick = () => TogglePanel("Chat");
$("search").oninput = RenderJobs;
$("steps").onclick = event => {
  if (event.target.dataset.step) { stage = event.target.dataset.step; RenderStage(); }
};
$("sessions").onchange = event => { selectedSession = event.target.value; RenderChat(); };
$("newChat").onclick = () => { selectedSession = ""; RenderChat(); $("message").focus(); };
$("composer").onsubmit = SendChat;
$("message").oninput = event => { Draft().text = event.target.value; StoreDraft(); };
$("message").onkeydown = event => {
  if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) { event.preventDefault(); $("composer").requestSubmit(); }
};
$("stop").onclick = () => Act("stop").catch(error => Status($("chatNotice"), error.message));
$("markScreenshot").onclick = () => Mark(CapturePair());
$("markSource").onclick = async () => {
  let image;
  if (referenceInputs[0]) {
    image = new Image();
    image.src = Asset(referenceInputs[0].id);
    try { await image.decode(); } catch { image = null; }
  }
  Mark(image, "references");
};
$("closePhoto").onclick = () => $("photoDialog").close();
$("photo").onclick = () => { $("photo").dataset.native = $("photo").dataset.native === "true" ? "false" : "true"; };
$("markPhoto").onclick = () => {
  const context = $("referenceDialog").open ? "references" : "chat";
  const image = $("photo");
  $("photoDialog").close();
  Mark(image.complete && image.naturalWidth ? image : null, context);
};
$("closeModel").onclick = () => $("modelDialog").close();
$("notifications").onclick = () => {
  const ready = tasks.find(item => item.state === "modelReady");
  if (ready) SelectTask(ready.id);
  if ("Notification" in window && Notification.permission === "default") Notification.requestPermission().then(Notify);
};

Resize("resizeSidebar", "--rail-width", 1, 246);
Resize("resizeChat", "--talk-width", -1, 328);
if (matchMedia("(max-width: 850px)").matches) { TogglePanel("Rail", false); TogglePanel("Chat", false); }
$("newTask").disabled = $("welcomeCreate").disabled = true;
const initialTask = new URLSearchParams(location.search).get("task");
if (initialTask && /^[a-f0-9-]{36}$/.test(initialTask)) {
  try { await Request(`${api}/${initialTask}`); await SelectTask(initialTask, false); } catch { /* A stale link can fall back to the task list. */ }
}
await Refresh();
async function Poll() {
  if (!requestBusy) await Refresh();
  setTimeout(Poll, task?.active ? 1800 : 4200);
}
setTimeout(Poll, 2200);
