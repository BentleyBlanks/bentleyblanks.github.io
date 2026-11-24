// 构件库预览（Tool_PropLibrary.html）：只读可视化器，只在 AdvancedTool ControlCenter 里出现，游戏里不挂任何入口。
//
// 目录 = 构件目录 Script_PlaceableCatalog 的 tzm 模型（持续烟火归「特效预览」，不收）
//      + Script_ExternalProps 的外部 GLB 目录。三维台在 Script_PropLibraryStage，这里只管列表、筛选与读数。
// 自动化与验收用 window.PropLibrary（entries / Select / stage / selected / ready）。

import { MESHES } from "../Data_Meshes.mjs";
import { OPTIONAL_VEHICLE_ASSETS } from "../Data_VehicleAssets.mjs";
import { ExternalPropCatalog } from "../Script_ExternalProps.mjs";
import { PLACEABLE, PLACEABLE_CATEGORIES } from "./Script_PlaceableCatalog.mjs";
import { PropLibraryStage } from "./Script_PropLibraryStage.mjs";

const SOURCES = Object.freeze([
  { id: "all", label: "全部" },
  { id: "glb", label: "GLB" },
  { id: "tzm", label: "TZM" },
]);
const SOURCE_LABEL = { glb: "GLB", tzm: "TZM" };
const USE_LABEL = { ry: "朝向", w: "宽", d: "深", h: "高", scale: "缩放", damage: "破损" };
const number = new Intl.NumberFormat("zh-CN");
const ById = (id) => document.getElementById(id);
const Text = (id, value) => { ById(id).textContent = value; };
const Meters = (value) => value >= 10 ? value.toFixed(1) : value >= 1 ? value.toFixed(2) : value.toFixed(3);
function SetPressed(button, on) {
  button.setAttribute("aria-pressed", String(on));
  button.classList.toggle("on", on);
}
function Node(parent, tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text != null) element.textContent = text;
  parent.appendChild(element);
  return element;
}

/** tzm 的说明首句当显示名（「中正式。完整几何来自…」→「中正式」）；取不出像样的名字就用模型 id。 */
function ModelName(id) {
  const head = (MESHES[id]?.note || "").split(/[。；（(]/)[0].split("：").at(-1).trim();
  return head && head.length <= 16 && !/^源节点/.test(head) ? head : id;
}

/** 目录条目：tzm 来自 PLACEABLE，GLB 来自外部道具目录。 */
export function PropLibraryEntries() {
  const entries = PLACEABLE.filter((entry) => !entry.effect).map((entry) => ({
    ...entry,
    name: ModelName(entry.model),
    source: "tzm",
    file: `Model/${MESHES[entry.model]?.file || `Model_${entry.model}.tzm.json`}`,
    note: MESHES[entry.model]?.note || "",
  }));
  for (const item of ExternalPropCatalog()) {
    entries.push({
      id: `External_${item.id}`, name: item.label, cat: item.category, external: item.id,
      source: "glb", file: item.url.replace(/^\.\//, "").split("?")[0] + (item.node ? ` · ${item.node}` : ""),
      credit: item.sourceLabel || "", uses: [], defaults: {}, solid: item.solid,
    });
  }
  return entries;
}

const entries = PropLibraryEntries();
const categories = [
  ...PLACEABLE_CATEGORIES.filter((cat) => entries.some((entry) => entry.cat === cat)),
  ...new Set(entries.map((entry) => entry.cat).filter((cat) => !PLACEABLE_CATEGORIES.includes(cat))),
];
const entryById = new Map(entries.map((entry) => [entry.id, entry]));

const canvas = ById("view");
const list = ById("propList");
const search = ById("propSearch");
const status = ById("stageStatus");
const retry = ById("retryLoad");
const vehicleButtons = [...document.querySelectorAll("[data-demo]")];
const filter = { cat: "all", source: "all", query: "" };
let stage = null;
let visible = [];
let selected = new URLSearchParams(location.search).get("id");
if (!entryById.has(selected)) selected = categories.map((cat) => entries.find((entry) => entry.cat === cat)).find(Boolean)?.id ?? null;
let selectionVersion = 0;
let vehicle = null;

function Matches(entry, { cat = filter.cat, source = filter.source } = {}) {
  if (cat !== "all" && entry.cat !== cat) return false;
  if (source !== "all" && entry.source !== source) return false;
  if (!filter.query) return true;
  return [entry.id, entry.name, entry.file, entry.cat].some((field) => field?.toLocaleLowerCase().includes(filter.query));
}

function FillFilterRow(rowId, items, current, count, onPick) {
  const row = ById(rowId);
  row.replaceChildren();
  for (const item of items) {
    const button = Node(row, "button", "edChip filter-chip");
    button.type = "button";
    Node(button, "span", "", item.label);
    Node(button, "small", "", count(item.id));
    SetPressed(button, item.id === current);
    button.addEventListener("click", () => onPick(item.id));
  }
}

function RenderFilters() {
  FillFilterRow("sourceFilter", SOURCES, filter.source,
    (id) => entries.filter((entry) => Matches(entry, { source: id })).length,
    (id) => { filter.source = id; RenderCatalog(); });
  FillFilterRow("categoryFilter", [{ id: "all", label: "全部" }, ...categories.map((cat) => ({ id: cat, label: cat }))], filter.cat,
    (id) => entries.filter((entry) => Matches(entry, { cat: id })).length,
    (id) => { filter.cat = id; RenderCatalog(); });
}

function RenderCatalog() {
  RenderFilters();
  visible = [];
  list.replaceChildren();
  for (const cat of categories) {
    const rows = entries.filter((entry) => entry.cat === cat && Matches(entry));
    if (!rows.length) continue;
    const group = Node(list, "section", "prop-group");
    const head = Node(group, "h3", "", cat);
    Node(head, "small", "", rows.length);
    for (const entry of rows) {
      visible.push(entry.id);
      const row = Node(group, "button", "prop-row");
      row.type = "button";
      row.setAttribute("role", "option");
      row.dataset.prop = entry.id;
      row.title = entry.id;
      Node(row, "span", "prop-name", entry.name);
      Node(row, "span", `source-tag ${entry.source}`, SOURCE_LABEL[entry.source]);
      row.addEventListener("click", () => Select(entry.id));
    }
  }
  Text("catalogCount", visible.length === entries.length ? `${entries.length} 项` : `${visible.length} / ${entries.length}`);
  if (!visible.length) Node(list, "p", "search-empty", "没有匹配的构件");
  SyncSelection(false);
}

function SyncSelection(scroll = true) {
  let current = null;
  for (const row of list.querySelectorAll("[data-prop]")) {
    const on = row.dataset.prop === selected;
    row.setAttribute("aria-selected", String(on));
    if (on) current = row;
  }
  if (scroll && current) current.scrollIntoView({ block: "nearest" });
  const index = visible.indexOf(selected);
  Text("stepIndex", index >= 0 ? `${index + 1} / ${visible.length}` : `— / ${visible.length}`);
}

function Step(direction) {
  if (!visible.length) return;
  const index = visible.indexOf(selected);
  const next = index < 0 ? 0 : (index + direction + visible.length) % visible.length;
  Select(visible[next]);
}

function SetStatus(state, message = "", { progress = null, canRetry = false } = {}) {
  canvas.dataset.state = state;
  status.hidden = state === "ready";
  retry.hidden = !canRetry;
  Text("loadMessage", message);
  const bar = ById("loadBar");
  bar.parentElement.hidden = progress == null;
  if (progress != null) bar.style.width = `${Math.round(progress * 100)}%`;
}

function ShowFacts(entry, model) {
  Text("propName", entry.name);
  Text("propId", entry.id);
  Text("propCategory", entry.cat);
  const source = ById("propSource");
  source.textContent = SOURCE_LABEL[entry.source];
  source.className = `source-tag ${entry.source}`;
  Text("propFile", entry.file);
  Text("propUses", (entry.uses || []).map((key) => USE_LABEL[key] || key).join(" · ") || "固定尺寸");
  ById("propCreditRow").hidden = !entry.credit;
  Text("propCredit", entry.credit || "");
  ById("propNoteRow").hidden = !entry.note;
  Text("propNote", entry.note || "");
  const size = model?.size;
  Text("sizeX", size ? Meters(size.x) : "—");
  Text("sizeY", size ? Meters(size.y) : "—");
  Text("sizeZ", size ? Meters(size.z) : "—");
  Text("propTriangles", model ? number.format(model.triangles) : "—");
  Text("propMeshes", model ? number.format(model.meshes) : "—");
  Text("propColliders", !model ? "—" : entry.external ? (entry.solid ? "运行时按包围盒登记" : "仅视觉") : "无");
  const dims = ById("stageDims");
  dims.hidden = !size;
  if (size) dims.textContent = `${Meters(size.x)} × ${Meters(size.y)} × ${Meters(size.z)} m　·　米格 ${stage.gridStep >= 1 ? `${stage.gridStep} m` : `${stage.gridStep * 100} cm`}`;
}

function StopVehicle() {
  vehicle = null;
  stage?.SetTick(null);
  ById("vehicleSection").hidden = true;
  for (const button of vehicleButtons) SetPressed(button, button.dataset.demo === "stopped");
}

function SetVehicleDemo(mode) {
  if (!vehicle) return;
  vehicle.mode = mode;
  vehicle.time = 0;
  vehicle.motion.Reset();
  for (const button of vehicleButtons) SetPressed(button, button.dataset.demo === mode);
  stage.SetTick(mode === "stopped" ? null : (dt) => {
    vehicle.time += dt;
    const t = vehicle.time, all = mode === "all", motion = vehicle.motion;
    if (all || mode === "tracks") motion.Update(dt, 0.35, all ? 0.25 : 0.35);
    motion.SetPose({
      turretYaw: all || mode === "turret" ? t * 0.24 : 0,
      mainGunPitch: all || mode === "turret" ? 0.08 * Math.sin(t * 0.7) : 0,
      bowMachineGunYaw: all || mode === "machineGuns" ? 0.14 * Math.sin(t * 0.8) : 0,
      bowMachineGunPitch: all || mode === "machineGuns" ? 0.10 * Math.sin(t * 0.63) : 0,
      turretMachineGunYaw: all || mode === "machineGuns" ? 0.14 * Math.sin(t * 0.72 + 0.4) : 0,
      turretMachineGunPitch: all || mode === "machineGuns" ? 0.12 * Math.sin(t * 0.67) : 0,
    });
  });
}

async function AttachVehicle(entry, model, version) {
  const asset = OPTIONAL_VEHICLE_ASSETS.find((item) => item.catalogId === entry.external);
  if (asset?.id !== "Type89MediumTank") return;
  const [{ Type89Motion }, trackPath] = await Promise.all([
    import("../Model/Type89MediumTank/Script_Type89Motion.mjs"),
    fetch(asset.trackPathUrl).then((response) => {
      if (!response.ok) throw new Error(`履带路径 HTTP ${response.status}`);
      return response.json();
    }),
  ]);
  if (version !== selectionVersion) return;
  vehicle = { motion: new Type89Motion(model.root.children[0], trackPath), mode: "stopped", time: 0 };
  ById("vehicleSection").hidden = false;
  SetVehicleDemo("all");
}

async function Select(id) {
  const entry = entryById.get(id);
  if (!entry) return null;
  const version = ++selectionVersion;
  selected = id;
  SyncSelection();
  const url = new URL(location.href);
  url.searchParams.set("id", id);
  history.replaceState(null, "", url);
  StopVehicle();
  ShowFacts(entry, null);
  ById("resourceNote").hidden = true;
  if (!stage?.ready) return null;
  SetStatus("loading", `${entry.name} 载入中…`);
  stage.Show(null);
  ById("stageDims").hidden = true;
  try {
    const model = await stage.Build(entry);
    if (version !== selectionVersion) { stage.Release(model); return null; }
    stage.Show(model);
    ShowFacts(entry, model);
    SetStatus("ready");
    await AttachVehicle(entry, model, version).catch((error) => {
      ById("resourceNote").textContent = `可动件载入失败：${error.message}`;
      ById("resourceNote").hidden = false;
    });
    return model;
  } catch (error) {
    if (version === selectionVersion) {
      console.warn("[PropLibrary]", error);
      SetStatus("error", `载入失败：${error.message}`, { canRetry: true });
    }
    return null;
  }
}

function BindViewport() {
  for (const button of document.querySelectorAll("[data-view]")) {
    button.addEventListener("click", () => {
      stage.SetView(button.dataset.view);
      for (const item of document.querySelectorAll("[data-view]")) SetPressed(item, item === button);
    });
  }
  for (const button of document.querySelectorAll("[data-lens]")) {
    button.addEventListener("click", () => {
      stage.SetLens(button.dataset.lens);
      for (const item of document.querySelectorAll("[data-lens]")) SetPressed(item, item === button);
    });
  }
  const grid = ById("gridToggle"), person = ById("personToggle");
  grid.addEventListener("click", () => { stage.SetGridVisible(!stage.gridVisible); SetPressed(grid, stage.gridVisible); });
  person.addEventListener("click", () => { stage.SetPersonVisible(!stage.personVisible); SetPressed(person, stage.personVisible); });
  ById("refitButton").addEventListener("click", () => stage.Fit());
  for (const button of vehicleButtons) button.addEventListener("click", () => SetVehicleDemo(button.dataset.demo));

  let drag = null;
  canvas.addEventListener("pointerdown", (event) => {
    if (!stage.model || !event.isPrimary || (event.button !== 0 && event.button !== 2)) return;
    canvas.setPointerCapture(event.pointerId);
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY, pan: event.button === 2 || event.shiftKey };
  });
  canvas.addEventListener("pointermove", (event) => {
    if (!drag || event.pointerId !== drag.id) return;
    const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
    if (dx || dy) (drag.pan ? stage.Pan(dx, dy) : stage.Orbit(dx, dy));
    drag.x = event.clientX;
    drag.y = event.clientY;
  });
  canvas.addEventListener("lostpointercapture", () => { drag = null; });
  canvas.addEventListener("contextmenu", (event) => event.preventDefault());
  canvas.addEventListener("wheel", (event) => {
    if (!stage.model) return;
    event.preventDefault();
    const pixels = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? stage.height : 1);
    stage.Zoom(Math.exp(-pixels * 0.0014));
  }, { passive: false });
  const arrows = { ArrowLeft: [-13, 0], ArrowRight: [13, 0], ArrowUp: [0, -13], ArrowDown: [0, 13] };
  canvas.addEventListener("keydown", (event) => {
    if (!stage.model || event.ctrlKey || event.metaKey || event.altKey) return;
    if (Object.hasOwn(arrows, event.key)) (event.shiftKey ? stage.Pan(...arrows[event.key]) : stage.Orbit(...arrows[event.key]));
    else if (event.key === "+" || event.key === "=") stage.Zoom(1.25);
    else if (event.key === "-") stage.Zoom(0.8);
    else if (event.key === "Home") stage.Fit();
    else return;
    event.preventDefault();
  });
}

list.addEventListener("keydown", (event) => {
  const keys = { ArrowDown: 1, ArrowUp: -1, PageDown: 10, PageUp: -10 };
  if (!Object.hasOwn(keys, event.key)) return;
  event.preventDefault();
  const index = Math.max(0, visible.indexOf(selected));
  const next = Math.max(0, Math.min(visible.length - 1, index + keys[event.key]));
  if (visible[next]) Select(visible[next]);
});
ById("prevButton").addEventListener("click", () => Step(-1));
ById("nextButton").addEventListener("click", () => Step(1));
search.addEventListener("input", () => { filter.query = search.value.trim().toLocaleLowerCase(); RenderCatalog(); });

const back = ById("controlCenter");
back.addEventListener("click", (event) => {
  if (event.ctrlKey || event.metaKey || event.shiftKey) return;
  try {
    if (window.opener?.location.pathname !== new URL(back.href).pathname) return;
    window.opener.focus();
    window.close();
    event.preventDefault();
  } catch { /* 独立打开或跨源时走链接本身。 */ }
});

window.PropLibrary = {
  entries, categories, Select, Step,
  get stage() { return stage; }, get selected() { return selected; }, get visible() { return [...visible]; },
  get ready() { return !!stage?.ready; }, get vehicle() { return vehicle; },
};

RenderCatalog();
if (selected) ShowFacts(entryById.get(selected), null);
SetStatus("loading", "正在准备材质…", { progress: 0 });
try {
  stage = new PropLibraryStage(canvas);
  BindViewport();
  retry.addEventListener("click", () => Select(selected));
  const missing = await stage.Prepare((label, progress) => SetStatus("loading", label, { progress }));
  stage.ready = true;
  if (missing.length) console.warn(`[PropLibrary] 外部 PBR 没读到，退回程序化：${missing.join(", ")}`);
  if (selected) await Select(selected);
} catch (error) {
  console.warn("[PropLibrary]", error);
  SetStatus("error", `无法启动三维视口：${error.message}`);
}
