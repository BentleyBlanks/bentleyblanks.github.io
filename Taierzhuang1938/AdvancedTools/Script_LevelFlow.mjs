import { FLOW_ZOOM } from "../Data_Tuning_LevelFlow.mjs";
import { Clamp } from "./Script_LevelFlowModel.mjs";
import { GroupPath } from "./Script_LevelFlowEncounter.mjs";
import {
  ENCOUNTER_DEFAULT_VARIANT_ID, ENCOUNTER_LEVELS, ENCOUNTER_VARIANTS,
  CompileEncounterVariant, FormatFlowTime,
} from "../Script_EncounterVariants.mjs";
import { SetEncounterDuskRange } from "./Script_LevelFlowSkyBlend.mjs";
import { EncounterDocument, CreateFramePacket } from "./Script_LevelFlowDocument.mjs";
import { LoadEncounterMap } from "./Script_LevelFlowMap.mjs";
import { EncounterViewports } from "./Script_LevelFlowViewports.mjs";
import { ScreenshotAnnotations } from "./Script_LevelFlowAnnotations.mjs";
import { EncounterChat } from "./Script_LevelFlowChat.mjs";
import { CreateUnitsAttachment } from "./Script_LevelFlowUnits.mjs";
import { FormatSourcePassage, CreateLocationText } from "./Script_LevelFlowPresentation.mjs";
import { EncounterSceneControls } from "./Script_LevelFlowControls.mjs";
import { LevelFlowPlay } from "./Script_LevelFlowPlay.mjs";
import { LevelFlowDebug } from "./Script_LevelFlowDebug.mjs";
import { EncounterTimeline } from "./Script_LevelFlowTimeline.mjs";
import { PreloadEncounterTerrainLayers } from "./Script_LevelFlowGpuRaster.mjs";

const Element = (id) => document.getElementById(id);
let canvas, workspace, navigation, annotationEditor, chat, gamePlay, timeline, previewDebug;
let storage;
try { storage = window.localStorage; } catch { storage = null; }

const params = new URLSearchParams(location.search);
let activeVariant = CompileEncounterVariant(params.get("variant") || ENCOUNTER_DEFAULT_VARIANT_ID);
SetEncounterDuskRange(activeVariant.spec.duskBlendZ);

function MakeProject(variant) {
  return new EncounterDocument(variant.defaultDocument, variant.timeline, storage, {
    storageKey: variant.spec.storageKey,
    legacyStorageKey: variant.spec.legacyStorageKey,
  });
}

let project = MakeProject(activeVariant);
const loadedMaps = new Map();
let mapData = null, variantSwitchSeq = 0;

let map, time = 0, playing = false, mode = "select", selection = null;
let navigationTool = "select";
let selectedUnitIds = [], multipleUnits = false;
let frame = activeVariant.evaluate(0, project.value), shownStage = "", shownBeat = "", lastTimestamp = 0, pointer = null, draft = null;
let toastTimer = 0, renderPending = false;
let inspectorCollapsed = false, inspectorTab = "chat";
let timelineCollapsed = false;
const INSPECTOR_COLLAPSED_KEY = "tengxian1938_encounter_sidebar_collapsed_v1";
const TIMELINE_COLLAPSED_KEY = "tengxian1938_encounter_timeline_collapsed_v1";

function Toast(message, persistent = false) {
  clearTimeout(toastTimer); Element("flowError").textContent = message; Element("flowError").hidden = false;
  if (!persistent) toastTimer = setTimeout(() => { Element("flowError").hidden = true; }, 5000);
}
function SetPlaying(value) {
  playing = value; lastTimestamp = performance.now();
  Element("playFlow").textContent = value ? "暂停" : "播放";
  Element("playFlow").setAttribute("aria-pressed", String(value));
  RequestRender();
}
function SetMode(value) {
  mode = value;
  for (const entry of workspace.Visible()) entry.canvas.dataset.mode = value;
  for (const button of document.querySelectorAll("[data-mode]")) button.classList.toggle("selected", button.dataset.mode === value);
  if (value !== "select") SetPlaying(false);
}
function SetNavigationTool(value) {
  navigation.Clear();
  CancelPointer();
  navigationTool = value;
  SetMode("select");
  for (const entry of workspace.entries) {
    entry.canvas.dataset.navigationTool = value;
    delete entry.canvas.dataset.unitHover;
    entry.map.hoveredActorId = null;
  }
  for (const button of document.querySelectorAll("button[data-navigation-tool]")) {
    button.setAttribute("aria-pressed", String(button.dataset.navigationTool === value));
  }
  Element("mapTooltip").hidden = true;
  RequestRender();
}
function SetInspectorCollapsed(collapsed, persist = true) {
  inspectorCollapsed = collapsed;
  document.querySelector(".lfWorkspace").dataset.inspectorCollapsed = String(collapsed);
  const button = Element("toggleInspector"), label = collapsed ? "展开右侧栏" : "收起右侧栏";
  button.setAttribute("aria-expanded", String(!collapsed));
  button.setAttribute("aria-label", label); button.title = label;
  Element("inspectorResizeHandle").hidden = collapsed;
  for (const name of ["chat", "script"]) Element(`${name}Pane`).hidden = collapsed || name !== inspectorTab;
  if (persist) { try { storage?.setItem(INSPECTOR_COLLAPSED_KEY, String(collapsed)); } catch { /* Keep this window's layout. */ } }
  RequestRender();
}
function SetTimelineCollapsed(collapsed, persist = true) {
  timelineCollapsed = collapsed;
  Element("flowTimeline").hidden = collapsed;
  Element("flowTimeline").parentElement.dataset.collapsed = String(collapsed);
  const button = Element("toggleTimeline");
  const label = collapsed ? "展开 Timeline" : "收起 Timeline";
  button.setAttribute("aria-expanded", String(!collapsed));
  button.setAttribute("aria-label", label);
  button.title = label;
  if (persist) {
    try { storage?.setItem(TIMELINE_COLLAPSED_KEY, String(collapsed)); }
    catch { /* Keep this window's layout. */ }
  }
  if (gamePlay?.active && !gamePlay.paused && gamePlay.state?.ready) gamePlay.frame?.focus();
  RequestRender();
}
function ShowTab(value) {
  if (value === "notes") {
    OpenAnnotations(); Element("legacyAnnotations").open = true; Element("notesPane").hidden = false; return;
  }
  inspectorTab = value; SetInspectorCollapsed(false);
  for (const button of document.querySelectorAll("[data-tab]")) button.classList.toggle("selected", button.dataset.tab === value);
  UpdateAnnotations(); Render();
}
function Apply(edit) {
  try { project.Change(edit); Changed(); return true; }
  catch (error) { Toast(error.message); return false; }
}
function Changed() {
  UpdateAnnotations(); Render();
  Element("saveStatus").textContent = project.warning ? "当前窗口草稿" : "本机已保存";
  if (project.warning) Toast(project.warning, true);
}
function SelectedObject() {
  return selection?.type === "trigger" ? project.value.triggers.find((item) => item.id === selection.id)
    : selection?.type === "group" ? project.value.groups.find((item) => item.id === selection.id) : null;
}
function Select(value, { additive = false } = {}) {
  if (value?.type === "actor") {
    if (!frame.actors.some((actor) => actor.id === value.id) || chat?.sending) return;
    SetPlaying(false);
    selectedUnitIds = additive || multipleUnits
      ? selectedUnitIds.includes(value.id) ? selectedUnitIds.filter((id) => id !== value.id) : [...selectedUnitIds, value.id]
      : [value.id];
    selection = selectedUnitIds.length ? { type: "actor", id: selectedUnitIds.at(-1), ids: [...selectedUnitIds] } : null;
    chat?.OpenUnits(); ShowTab("chat");
  } else { selection = value; selectedUnitIds = []; }
  if (value?.type === "group" || value?.type === "trigger") { SetMode("select"); }
  if (value?.type === "annotation") { ShowTab("notes"); Element("annotationText").value = project.value.annotations.find((item) => item.id === value.id)?.text || ""; }
  Render();
}
function SetUnitSelectionMode(multiple) {
  multipleUnits = multiple;
  if (!multiple && selectedUnitIds.length > 1) {
    selectedUnitIds = [selectedUnitIds.at(-1)];
    selection = { type: "actor", id: selectedUnitIds[0], ids: [...selectedUnitIds] };
  }
  Render();
}
function StageBounds() {
  const points = frame.stage.beats.flatMap((beat) => beat.p);
  if (Number(frame.stage.id) <= 2) points.push([0, -10], [76, 82]);
  if (frame.stage.id === "05") points.push([88, 112], [92, 98]);
  for (const group of frame.groups.filter((item) => item.beat.slice(0, 2) === frame.stage.id)) {
    points.push(group.area.center, ...group.route);
    for (let index = 0; index < (group.memberPlans?.length || 0); index++) points.push(...GroupPath(group, index));
  }
  const xs = points.map((point) => point[0]), zs = points.map((point) => point[1]);
  return [Math.min(...xs) - 14, Math.max(...xs) + 14, Math.min(...zs) - 14, Math.max(...zs) + 14];
}
function Seek(value, { fit = false } = {}) {
  const previousStage = frame.stage.id;
  lastTimestamp = performance.now();
  time = Clamp(Number(value) || 0, 0, activeVariant.duration);
  frame = activeVariant.evaluate(time, project.value);
  if (previousStage !== frame.stage.id) { selection = null; selectedUnitIds = []; }
  if (map && (fit || previousStage !== frame.stage.id)) workspace.FrameStage();
  draft = null; Render();
}
function JumpBeat(id) {
  const beat = activeVariant.BeatById(String(id).toLowerCase()) || activeVariant.BeatById(id);
  if (beat) Seek(beat.start, { fit: workspace?.active?.mode === "stage" });
}
function StepBeat(direction) {
  const tl = activeVariant.timeline;
  const index = tl.indexOf(frame.beat);
  JumpBeat(tl[Clamp(index + direction, 0, tl.length - 1)].id);
}
function Button(text, action) { const button = document.createElement("button"); button.type = "button"; button.textContent = text; button.addEventListener("click", action); return button; }

function PopulateVariantPicker() {
  const picker = Element("variantPicker");
  if (!picker) return;
  const spec = activeVariant.spec;
  const currentLevel = ENCOUNTER_LEVELS.find((lvl) => lvl.id === spec.level) || ENCOUNTER_LEVELS[0];
  picker.dataset.forked = String(!spec.isBaseline);
  Element("variantLevelCode").textContent = currentLevel.code;
  Element("variantCurrentTitle").textContent = spec.title;
  const badge = Element("variantCurrentBadge");
  badge.textContent = spec.badge;
  badge.dataset.kind = spec.isBaseline ? "base" : "fork";

  const sceneLink = Element("openInSceneEditor");
  sceneLink.href = `./SceneEditor.html?scene=${encodeURIComponent(spec.scene)}`;
  sceneLink.title = `在场景编辑器中打开 ${spec.scene}`;

  const levelBar = Element("variantLevels");
  levelBar.replaceChildren();
  for (const lvl of ENCOUNTER_LEVELS) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.role = "tab";
    btn.disabled = !lvl.available;
    btn.setAttribute("aria-selected", String(lvl.id === currentLevel.id));
    btn.classList.toggle("selected", lvl.id === currentLevel.id);
    btn.title = lvl.note || lvl.title;
    btn.textContent = lvl.title;
    if (!lvl.available) {
      const tag = document.createElement("span");
      tag.className = "lfSoonTag";
      tag.textContent = "待建";
      btn.append(tag);
    }
    levelBar.append(btn);
  }

  const graph = Element("variantList");
  graph.replaceChildren();
  const variants = ENCOUNTER_VARIANTS.filter((v) => v.level === currentLevel.id);
  const compiledList = variants.map((item) => ({ item, compiled: CompileEncounterVariant(item.id) }));
  const sharedStages = new Set(variants[0]?.sharedStages || []);
  const sharedTrackLabel = variants[0]?.tracks?.find((t) => t.shared)?.label || "01–07 共用主干";
  const lastSharedStage = compiledList[0]?.compiled.stages.filter((s) => sharedStages.has(s.id)).at(-1);
  const sharedDuration = lastSharedStage?.end ?? 0;
  const forkStageCode = lastSharedStage?.id || "07";
  const forkTooltip = variants.find((v) => v.forkNote)?.forkNote || `分叉点 ${forkStageCode} 末`;

  const ROW_H = 66, ROW_GAP = 10;
  const totalH = variants.length * ROW_H + Math.max(0, variants.length - 1) * ROW_GAP;
  const midY = totalH / 2;
  const SVG_NS = "http://www.w3.org/2000/svg";
  const SvgEl = (tag, attrs = {}) => {
    const el = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
    return el;
  };

  // Column 1: Single shared trunk (01-07) — physically drawn ONCE for all branches
  const trunk = document.createElement("div");
  trunk.className = "lfDagTrunk";
  trunk.title = forkTooltip;
  const trunkSvg = SvgEl("svg", { class: "lfDagTrunkSvg", viewBox: `0 0 152 ${totalH}`, preserveAspectRatio: "none" });
  trunkSvg.append(
    SvgEl("line", { x1: 8, y1: midY, x2: 152, y2: midY, stroke: "#6fa8b8", "stroke-width": 2.6, "stroke-linecap": "round" }),
    SvgEl("circle", { cx: 8, cy: midY, r: 4, fill: "#101517", stroke: "#89c4d4", "stroke-width": 2 }),
  );
  const trunkLabel = document.createElement("span");
  trunkLabel.className = "lfDagTrunkLabel";
  trunkLabel.textContent = sharedTrackLabel;
  const trunkMeta = document.createElement("span");
  trunkMeta.className = "lfDagTrunkMeta";
  trunkMeta.textContent = FormatFlowTime(sharedDuration);
  trunk.append(trunkSvg, trunkLabel, trunkMeta);

  // Column 2: Smooth Git-style Bezier fork curves from the single fork node (0, midY)
  const connector = SvgEl("svg", { class: "lfDagConnector", width: 46, height: totalH, viewBox: `0 0 46 ${totalH}` });
  const defs = SvgEl("defs");
  const grad = SvgEl("linearGradient", { id: "lfDagActiveGrad", x1: "0%", y1: "0%", x2: "100%", y2: "0%" });
  grad.append(
    SvgEl("stop", { offset: "0%", "stop-color": "#6fa8b8" }),
    SvgEl("stop", { offset: "100%", "stop-color": "#e2c375" }),
  );
  defs.append(grad);
  connector.append(defs);

  const curveById = new Map();
  const inactiveCurves = [], activeCurves = [];
  compiledList.forEach(({ item }, index) => {
    const rowY = index * (ROW_H + ROW_GAP) + ROW_H / 2;
    const isActive = item.id === activeVariant.id;
    const path = SvgEl("path", {
      class: "lfDagCurve",
      d: `M 0 ${midY} C 24 ${midY}, 20 ${rowY}, 46 ${rowY}`,
      "data-variant-id": item.id,
      "data-active": String(isActive),
      "data-hovered": "false",
    });
    curveById.set(item.id, path);
    if (isActive) activeCurves.push(path);
    else inactiveCurves.push(path);
  });
  for (const p of [...inactiveCurves, ...activeCurves]) connector.append(p);

  const forkGroup = SvgEl("g", { class: "lfDagForkNode" });
  const forkTitle = SvgEl("title");
  forkTitle.textContent = forkTooltip;
  forkGroup.append(
    forkTitle,
    SvgEl("circle", { cx: 0, cy: midY, r: 6, fill: "#101517", stroke: "#8cc8d8", "stroke-width": 2.2 }),
    SvgEl("circle", { cx: 0, cy: midY, r: 2.3, fill: "#e6cb81" }),
  );
  const forkTag = SvgEl("text", { class: "lfDagForkTag", x: 0, y: midY + 17 });
  forkTag.textContent = forkStageCode;
  forkGroup.append(forkTag);
  connector.append(forkGroup);

  // Column 3: Branch rows with proportional commit rails
  const branchesEl = document.createElement("div");
  branchesEl.className = "lfDagBranches";
  const maxForkDur = Math.max(1, ...compiledList.map(({ compiled }) => Math.max(1, compiled.duration - sharedDuration)));

  for (const { item, compiled } of compiledList) {
    const isActive = item.id === activeVariant.id;
    const row = document.createElement("button");
    row.type = "button";
    row.className = "lfBranchRow";
    row.dataset.variantId = item.id;
    row.dataset.forked = String(!item.isBaseline);
    row.setAttribute("aria-pressed", String(isActive));
    row.title = item.summary;
    row.addEventListener("pointerenter", () => {
      const curve = curveById.get(item.id);
      if (curve && !isActive) {
        curve.setAttribute("data-hovered", "true");
        connector.insertBefore(curve, forkGroup);
      }
    });
    row.addEventListener("pointerleave", () => {
      const curve = curveById.get(item.id);
      if (curve) curve.setAttribute("data-hovered", "false");
    });
    row.addEventListener("click", () => {
      picker.open = false;
      SwitchVariant(item.id);
    });

    const head = document.createElement("div");
    head.className = "lfBranchHead";
    const nameWrap = document.createElement("span");
    nameWrap.className = "lfBranchNameWrap";
    const name = document.createElement("span");
    name.className = "lfBranchName";
    name.textContent = item.title;
    const tag = document.createElement("span");
    tag.className = "lfVariantBadge";
    tag.dataset.kind = item.isBaseline ? "base" : "fork";
    tag.textContent = item.badge;
    nameWrap.append(name, tag);
    if (isActive) {
      const headTag = document.createElement("span");
      headTag.className = "lfBranchHeadTag";
      headTag.textContent = "HEAD";
      nameWrap.append(headTag);
    }

    const meta = document.createElement("span");
    meta.className = "lfBranchMeta";
    const sceneSpan = document.createElement("span");
    sceneSpan.textContent = item.sceneLabel || item.scene;
    const durStrong = document.createElement("strong");
    durStrong.textContent = FormatFlowTime(compiled.duration);
    meta.append(sceneSpan, document.createTextNode("·"), durStrong);
    head.append(nameWrap, meta);

    const rail = document.createElement("div");
    rail.className = "lfBranchRail";
    const forkDur = Math.max(1, compiled.duration - sharedDuration);
    const railPct = Math.round(58 + 42 * (forkDur / maxForkDur));
    rail.style.width = `${railPct}%`;
    for (const seg of (item.tracks || []).filter((t) => !t.shared)) {
      const node = document.createElement("span");
      node.className = "lfCommitNode";
      const dot = document.createElement("i");
      node.append(dot, document.createTextNode(seg.label));
      rail.append(node);
    }

    row.append(head, rail);
    branchesEl.append(row);
  }

  graph.append(trunk, connector, branchesEl);
}

function PopulateTimeline() {
  const stagesEl = Element("timelineStages"), beatsEl = Element("timelineBeats");
  stagesEl.replaceChildren();
  beatsEl.replaceChildren();
  stagesEl.dataset.forked = String(!activeVariant.spec.isBaseline);
  const sharedStages = new Set(activeVariant.spec.sharedStages || []);
  const duration = activeVariant.duration;

  for (const stage of activeVariant.stages) {
    const isShared = sharedStages.has(stage.id);
    const button = Button(`${stage.id} ${stage.title}`, () => { workspace.active.mode = "stage"; Seek(stage.start, { fit: true }); });
    button.dataset.stage = stage.id;
    button.dataset.shared = String(isShared);
    const shareSuffix = activeVariant.spec.isBaseline ? "" : (isShared ? " · 🔗 与基线共用段" : " · ✦ 本变体分叉段");
    button.title = `${stage.status} · ${FormatFlowTime(stage.start)}—${FormatFlowTime(stage.end)}${shareSuffix}`;
    button.style.left = `${stage.start / duration * 100}%`;
    button.style.width = `${(stage.end - stage.start) / duration * 100}%`;
    button.classList.toggle("draft", stage.status === "草稿");
    stagesEl.append(button);
  }
  for (const beat of activeVariant.timeline) {
    const cinematic = activeVariant.cinematics.includes(beat.id);
    const button = Button(beat.id.toUpperCase(), () => JumpBeat(beat.id));
    button.setAttribute("aria-label", `${beat.id.toUpperCase()} ${beat.title}`);
    button.dataset.beat = beat.id;
    button.style.left = `${beat.start / duration * 100}%`;
    button.style.width = `${beat.duration / duration * 100}%`;
    button.classList.toggle("cinematic", cinematic);
    button.title = `${beat.id.toUpperCase()} · ${FormatFlowTime(beat.start)} · ${beat.title}${cinematic ? " · 镜头动画段" : ""}`;
    beatsEl.append(button);
  }
  if (!timeline) {
    timeline = new EncounterTimeline({
      viewport: Element("timelineScroll"), axis: Element("timelineAxis"),
      ruler: Element("timelineRuler"), fitButton: Element("timelineFit"), scaleOutput: Element("timelineScale"),
      duration, formatTime: FormatFlowTime,
    });
  } else {
    timeline.SetDuration(duration);
  }
  Element("flowSeek").max = String(duration);
  Element("sourceLink").href = activeVariant.sourceInfo.url;
  shownStage = "";
  shownBeat = "";
}

async function EnsureVariantMap(variant, focus) {
  const sceneId = variant.spec.scene;
  if (loadedMaps.has(sceneId)) return loadedMaps.get(sceneId);
  const loaded = await LoadEncounterMap({ sceneId, variantSpec: variant.spec, focus });
  loadedMaps.set(sceneId, loaded);
  return loaded;
}

async function SwitchVariant(variantId) {
  const target = CompileEncounterVariant(variantId);
  if (target.id === activeVariant.id) return activeVariant.id;
  const seq = ++variantSwitchSeq;
  if (gamePlay?.active) gamePlay.Stop();
  gamePlay?.DropHost();
  SetPlaying(false);
  CancelPointer();
  selection = null;
  selectedUnitIds = [];

  const prevShared = new Set(activeVariant.spec.sharedStages || []);
  const targetShared = new Set(target.spec.sharedStages || []);
  const keepSharedBeat = prevShared.has(frame.stage.id) && targetShared.has(frame.stage.id)
    ? target.BeatById(frame.beat.id)
    : null;
  const forkBeatId = `${target.spec.forkAtStage || activeVariant.spec.forkAtStage || "08"}a`;
  const fallbackBeat = target.BeatById(forkBeatId) || target.timeline[0];
  const nextTime = keepSharedBeat
    ? keepSharedBeat.start + frame.progress * keepSharedBeat.duration
    : fallbackBeat.start;

  const nextProject = MakeProject(target);
  const focus = target.evaluate(nextTime, nextProject.value).player;
  const sceneChanged = target.spec.scene !== activeVariant.spec.scene;
  if (sceneChanged) {
    Element("mapLoading").textContent = `切换空间底图 · ${target.spec.title}…`;
    Element("mapLoading").hidden = false;
  }
  let nextMap;
  try {
    nextMap = await EnsureVariantMap(target, focus);
  } catch (error) {
    if (seq === variantSwitchSeq) {
      Element("mapLoading").hidden = true;
      Toast(`变体场景载入失败 · ${error.message}`, true);
    }
    throw error;
  }
  if (seq !== variantSwitchSeq) return activeVariant.id;

  activeVariant = target;
  project = nextProject;
  SetEncounterDuskRange(activeVariant.spec.duskBlendZ);
  PopulateVariantPicker();
  PopulateTimeline();

  if (nextMap !== mapData) {
    mapData = nextMap;
    workspace.SetMapData(mapData);
  }
  Element("mapLoading").hidden = true;

  const nextUrl = new URL(location.href);
  if (activeVariant.id === ENCOUNTER_DEFAULT_VARIANT_ID) nextUrl.searchParams.delete("variant");
  else nextUrl.searchParams.set("variant", activeVariant.id);
  history.replaceState(null, "", nextUrl);

  time = Clamp(nextTime, 0, activeVariant.duration);
  frame = activeVariant.evaluate(time, project.value);
  workspace.FrameStage();
  UpdateAnnotations();
  Changed();
  return activeVariant.id;
}

function UpdateTimeline() {
  gamePlay?.SetCursorTime(time);
  if (shownStage !== frame.stage.id) {
    shownStage = frame.stage.id;
    for (const button of document.querySelectorAll("[data-stage]")) button.classList.toggle("selected", button.dataset.stage === shownStage);
  }
  if (shownBeat !== frame.beat.id) {
    shownBeat = frame.beat.id;
    const isCinematic = activeVariant.cinematics.includes(frame.beat.id);
    Element("timelineMode").hidden = !isCinematic;
    Element("timelineMode").textContent = `${frame.beat.id.toUpperCase()} 镜头动画`;
    Element("beatId").textContent = frame.beat.id.toUpperCase();
    Element("beatTitle").textContent = frame.beat.title;
    Element("stageStatus").textContent = frame.stage.status;
    FormatSourcePassage(Element("sourcePassage"), activeVariant.sourceExcerpts[frame.beat.id]);
    Element("planningNote").hidden = !frame.beat.planning;
    Element("planningNote").textContent = frame.beat.planning ? `当前编排 · ${frame.beat.planning}` : "";
    for (const button of document.querySelectorAll("[data-beat]")) button.classList.toggle("selected", button.dataset.beat === shownBeat);
    Element("frameHeading").textContent = `${frame.stage.id} ${frame.stage.title} / ${frame.beat.id.toUpperCase()}`;
  }
  const timeText = `${FormatFlowTime(time)} / ${FormatFlowTime(activeVariant.duration)}`;
  if (Element("flowTime").textContent !== timeText) Element("flowTime").textContent = timeText;
  Element("flowSeek").value = String(time);
  timeline.SetTime(time);
  Element("flowSeek").setAttribute("aria-valuetext", `${FormatFlowTime(time)} · ${frame.beat.id.toUpperCase()} ${frame.beat.title}`);
}
function UpdateAnnotations() {
  Element("legacyAnnotations").hidden = !project.value.annotations.length;
  const list = Element("annotationFrames"); list.replaceChildren();
  const times = [...new Set(project.value.annotations.map((item) => item.time))].sort((a, b) => a - b);
  for (const stamp of times) {
    const notes = project.value.annotations.filter((item) => item.time === stamp), beat = activeVariant.evaluate(stamp, project.value).beat;
    const button = Button(`${FormatFlowTime(stamp)} · ${beat.id.toUpperCase()} · ${notes.length} 处`, () => {
      SetPlaying(false); Seek(stamp);
      if (notes[0].viewports) { workspace.Restore(notes[0].viewports); Element("viewportLayout").value = String(workspace.count); }
      else { workspace.SetType(0, "plan"); workspace.Activate(0); const view = notes[0].view; if (view) RestoreView(view, notes[0].viewport); }
      Render();
    }); button.className = "lfFrameBookmark"; button.dataset.annotationTime = String(stamp); list.append(button);
  }
}
function RequestRender() { renderPending = true; }
function Render(tick = null) {
  if (!map || !workspace) return;
  renderPending = false;
  fpsMeter.rendered = true;
  const debug = !gamePlay?.active && (previewDebug?.profiler?.recording || previewDebug?.capture.state === "armed") ? previewDebug : null;
  let failure = null;
  debug?.BeginFrame(tick?.time ?? performance.now(), tick);
  try {
    debug?.BeginCpu("encounterTimeline");
    const previousStage = frame.stage.id;
    debug?.BeginCpu("encounterTimeline/EvaluateFlow");
    frame = activeVariant.evaluate(time, project.value);
    debug?.EndCpu("encounterTimeline/EvaluateFlow");
    debug?.BeginCpu("encounterTimeline/UpdateTimeline");
    if (tick?.advancing && previousStage !== frame.stage.id) workspace.FrameStage();
    UpdateTimeline();
    debug?.EndCpu("encounterTimeline/UpdateTimeline");
    debug?.SetFrameContext(frame);
    debug?.BeginCpu("encounterTimeline/UpdateUnits");
    selectedUnitIds = selectedUnitIds.filter((id) => frame.actors.some((actor) => actor.id === id));
    if (selection?.type === "actor") selection = selectedUnitIds.length ? { type: "actor", id: selectedUnitIds.at(-1), ids: [...selectedUnitIds] } : null;
    chat?.UpdateUnits(CreateUnitsAttachment(frame, workspace, selectedUnitIds, project.value), multipleUnits);
    debug?.EndCpu("encounterTimeline/UpdateUnits");
    debug?.EndCpu("encounterTimeline");
    workspace.Draw(frame, null, selection, project.value.annotations, draft, project.value, debug);
  } catch (error) { failure = error; throw error; }
  finally { debug?.EndFrame(failure); }
}
function Hit(point, view = map) {
  const priority = { annotationHandle: 6, annotation: 5, actor: 3, group: 2, trigger: 1 };
  const DistanceTo = (item) => Math.hypot(item.screen[0] - point[0], item.screen[1] - point[1]);
  const candidates = view.hits.filter((item) => (item.type !== "actor" || !view.PickActor) && DistanceTo(item) <= item.radius);
  const body = view.PickActor?.(point);
  if (body) candidates.push(body);
  return candidates.sort((a, b) => (priority[b.type] || 0) - (priority[a.type] || 0) || DistanceTo(a) - DistanceTo(b))[0];
}

function LocalPoint(event, surface = canvas) { const rect = surface.getBoundingClientRect(); return [event.clientX - rect.left, event.clientY - rect.top]; }
function Packet() {
  const rect = canvas.getBoundingClientRect();
  const packet = CreateFramePacket(project.value, frame, map, { width: rect.width, height: rect.height }, {
    scene: activeVariant.spec.scene,
    variant: activeVariant.id,
  });
  packet.context.viewports = workspace.Serialize(); packet.context.selection = structuredClone(selection); return packet;
}

function RestoreView(view, viewport) {
  map.center = [...view.center];
  const rect = canvas.getBoundingClientRect();
  const ratio = viewport ? Math.min(rect.width / viewport.width, rect.height / viewport.height) : 1;
  map.scale = Clamp(view.scale * ratio, FLOW_ZOOM.minScale, FLOW_ZOOM.maxScale); workspace.active.mode = "manual";
}

function CancelPointer() {
  if (pointer?.action === "edit") project.value = pointer.original;
  pointer = null; draft = null;
}

function BindMap(entry) {
  const surface = entry.canvas;
  const HoverUnit = (hit = null) => {
    const id = navigationTool === "select" && mode === "select" && hit?.type === "actor" ? hit.id : null;
    if (id) surface.dataset.unitHover = id;
    else delete surface.dataset.unitHover;
    if (entry.map.hoveredActorId === id) return;
    entry.map.hoveredActorId = id;
    RequestRender();
  };
  surface.addEventListener("contextmenu", (event) => event.preventDefault());
  surface.addEventListener("pointerdown", (event) => {
    HoverUnit(); Element("mapTooltip").hidden = true;
    if (navigation.TouchBegin(entry, event)) { CancelPointer(); RequestRender(); return; }
    if (navigation.Begin(entry, event, { forcePan: navigationTool === "hand" && mode === "select" })) return;
    if (event.button !== 0) return;
    workspace.Activate(entry.index);
    surface.focus(); surface.setPointerCapture(event.pointerId);
    const screen = LocalPoint(event), hit = Hit(screen);
    const action = mode !== "select" ? "annotate" : hit?.type === "annotationHandle" ? "edit" : entry.map.type ? "select" : "pan";
    const world = action === "annotate" || action === "pan" ? map.ToWorld(screen) : null;
    pointer = { pointerId: event.pointerId, screen, world, center: [...map.center], hit, action, moved: false, original: project.value, viewport: entry.index, yaw: map.yaw || 0, rotate: map.type === "eye" || event.altKey, additive: event.ctrlKey || event.metaKey || event.shiftKey };
    if (action === "annotate") {
      const rect = canvas.getBoundingClientRect();
      draft = { id: `Note_${Date.now()}`, kind: mode, time: Math.round(time * 100) / 100, a: world, b: [...world], text: "", view: { center: [...map.center], scale: map.scale }, viewport: { width: rect.width, height: rect.height }, viewports: workspace.Serialize() };
      if (mode === "text") draft.text = "文字";
    }
  });
  surface.addEventListener("pointermove", (event) => {
    if (navigation.TouchMove(entry, event)) return;
    if (navigation.Move(entry, event)) return;
    if (pointer && pointer.pointerId !== event.pointerId) return;
    const screen = LocalPoint(event, surface);
    if (pointer && pointer.viewport === entry.index) {
      const dx = screen[0] - pointer.screen[0], dy = screen[1] - pointer.screen[1]; if (Math.hypot(dx, dy) > 3) pointer.moved = true;
      if (pointer.action === "pan" && pointer.moved) {
        if (pointer.rotate && map.type) map.yaw = pointer.yaw - dx * 0.007;
        else {
          workspace.active.mode = "manual";
          const current = map.ToWorld(screen);
          map.center = map.center.map((value, index) => value + pointer.world[index] - current[index]);
        }
      }
      if (pointer.action === "annotate") draft.b = entry.map.ToWorld(screen);
      if (pointer.action === "edit") {
        const world = entry.map.ToWorld(screen);
        const candidate = structuredClone(pointer.original), hit = pointer.hit;
        const target = candidate.annotations.find((item) => item.id === hit.id);
        target[hit.handle] = world;
        project.value = candidate;
      }
      Element("mapTooltip").hidden = true; RequestRender(); return;
    }
    const hit = Hit(screen, entry.map), tip = Element("mapTooltip");
    if (navigationTool === "hand") { HoverUnit(); tip.hidden = true; return; }
    HoverUnit(hit); tip.hidden = !hit?.text;
    if (hit?.text) { tip.textContent = hit.text; const grid = Element("viewportGrid").getBoundingClientRect(), rect = surface.getBoundingClientRect(); tip.style.left = `${Clamp(rect.x - grid.x + screen[0] + 14, 5, grid.width - 270)}px`; tip.style.top = `${Clamp(rect.y - grid.y + screen[1] + 15, 5, grid.height - 50)}px`; }
  });
  surface.addEventListener("pointerup", (event) => {
    if (navigation.TouchEnd(entry, event)) return;
    if (navigation.End(entry)) return;
    if (!pointer || pointer.viewport !== entry.index || pointer.pointerId !== event.pointerId) return;
    const action = pointer.action;
    if (action === "edit") { const candidate = project.value; project.value = pointer.original; try { project.Replace(candidate); Changed(); } catch (error) { Toast(error.message); } }
    if (action === "annotate" && draft && (pointer.moved || draft.kind === "text")) {
      const annotation = draft; draft = null; Apply((document) => document.annotations.push(annotation)); Select({ type: "annotation", id: annotation.id });
      if (annotation.kind === "text") { Element("annotationText").focus(); Element("annotationText").select(); }
    }
    if (["pan", "select"].includes(action) && !pointer.moved) {
      const hit = pointer.hit;
      if (hit) Select({ type: hit.type, id: hit.id }, { additive: pointer.additive });
      else if (!pointer.additive && !multipleUnits) Select(null);
    }
    pointer = null; draft = null; Render();
  });
  surface.addEventListener("pointercancel", () => { HoverUnit(); navigation.Clear(); CancelPointer(); Render(); });
  surface.addEventListener("lostpointercapture", (event) => {
    if (navigation.TouchLost(event) || pointer?.pointerId === event.pointerId) { CancelPointer(); RequestRender(); }
    navigation.End(entry);
  });
  surface.addEventListener("wheel", (event) => { HoverUnit(); Element("mapTooltip").hidden = true; navigation.Wheel(entry, event); }, { passive: false });
  surface.addEventListener("pointerleave", () => { HoverUnit(); Element("mapTooltip").hidden = true; });
  surface.addEventListener("blur", () => HoverUnit());
}

function OpenAnnotations() {
  navigation.Clear(); SetPlaying(false); SetMode("select"); Render();
  annotationEditor.Open(workspace.Capture(), Packet());
}

function BindControls() {
  window.addEventListener("blur", () => { CancelPointer(); RequestRender(); });
  const picker = Element("variantPicker");
  if (picker) {
    document.addEventListener("pointerdown", (event) => {
      if (picker.open && !event.target.closest("#variantPicker")) picker.open = false;
    });
    picker.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && picker.open) {
        event.preventDefault(); event.stopPropagation();
        picker.open = false; Element("variantSummary")?.focus();
      }
    });
  }
  Element("toggleInspector").onclick = () => SetInspectorCollapsed(!inspectorCollapsed);
  Element("toggleTimeline").onclick = () => SetTimelineCollapsed(!timelineCollapsed);
  let collapsed = false, timelineHidden = false;
  try {
    collapsed = storage?.getItem(INSPECTOR_COLLAPSED_KEY) === "true";
    timelineHidden = storage?.getItem(TIMELINE_COLLAPSED_KEY) === "true";
  } catch { /* Storage is optional. */ }
  SetInspectorCollapsed(collapsed, false);
  SetTimelineCollapsed(timelineHidden, false);
  for (const button of document.querySelectorAll("button[data-navigation-tool]")) button.onclick = () => {
    SetNavigationTool(button.dataset.navigationTool); workspace.active.canvas.focus();
  };
  for (const button of document.querySelectorAll("[data-tab]")) button.onclick = () => ShowTab(button.dataset.tab);
  for (const button of document.querySelectorAll("[data-mode]")) button.onclick = () => SetMode(button.dataset.mode);
  Element("playFlow").onclick = () => { if (time >= activeVariant.duration) Seek(0); SetMode("select"); SetPlaying(!playing); };
  Element("previousBeat").onclick = () => StepBeat(-1); Element("nextBeat").onclick = () => StepBeat(1);
  Element("flowSeek").oninput = (event) => Seek(Number(event.target.value));
  Element("viewportLayout").onchange = (event) => { const count = Number(event.target.value); if (gamePlay?.SetLayout(count)) return; workspace.SetLayout(count); Render(); };
  Element("annotationText").onchange = (event) => { if (selection?.type === "annotation") Apply((document) => { document.annotations.find((item) => item.id === selection.id).text = event.target.value; }); };
  Element("deleteAnnotation").onclick = () => { if (selection?.type === "annotation") { Apply((document) => { document.annotations = document.annotations.filter((item) => item.id !== selection.id); }); selection = null; Element("annotationText").value = ""; Render(); } };
  document.addEventListener("keydown", (event) => {
    if (gamePlay?.active) return;
    if (event.target.matches("input,select,textarea,button,a,summary")) return;
    if (navigation.Key(event)) return;
    if (!event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey && ["KeyQ", "KeyW"].includes(event.code)) {
      event.preventDefault(); SetNavigationTool(event.code === "KeyQ" ? "hand" : "select"); return;
    }
    if (event.code === "KeyF") {
      event.preventDefault(); const object = SelectedObject(), actor = frame.actors.find((item) => selection?.type === "actor" && item.id === selection.id);
      const note = project.value.annotations.find((item) => selection?.type === "annotation" && item.id === selection.id);
      navigation.Focus(object?.area.center || actor?.p || note?.b || frame.player, object ? Math.max(...object.area.size) / 2 : 6); return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") { event.preventDefault(); event.shiftKey ? project.Redo() : project.Undo(); Changed(); return; }
    if (event.code === "Space") { event.preventDefault(); SetMode("select"); SetPlaying(!playing); }
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") { event.preventDefault(); Seek(time + (event.key === "ArrowRight" ? 1 : -1) * (event.shiftKey ? 5 : 1)); }
    if (event.key === "[") StepBeat(-1); if (event.key === "]") StepBeat(1);
    if (event.key === "Escape") { SetNavigationTool("select"); Render(); }
  });
}
const fpsMeter = { frames: 0, windowStart: 0, text: "", level: "", rendered: false };
function CountFpsFrame(timestamp, forceCount) {
  const meter = fpsMeter;
  if (meter.rendered || forceCount) meter.frames++;
  meter.rendered = false;
  if (!meter.windowStart) { meter.windowStart = timestamp; return; }
  const windowMs = timestamp - meter.windowStart;
  if (windowMs < 500) return;
  const frames = meter.frames;
  meter.frames = 0; meter.windowStart = timestamp;
  const level = !frames ? "idle" : frames * 1000 / windowMs >= 50 ? "good" : frames * 1000 / windowMs >= 30 ? "warn" : "bad";
  const text = frames ? `${Math.round(frames * 1000 / windowMs)} FPS · ${(windowMs / frames).toFixed(1)} ms` : "静止";
  const output = Element("fpsStatus");
  if (meter.text !== text) { meter.text = text; output.textContent = text; }
  if (meter.level !== level) { meter.level = level; output.dataset.level = level; }
}
function Tick(timestamp) {
  CountFpsFrame(timestamp, !!gamePlay?.active);
  if (gamePlay?.active) { lastTimestamp = timestamp; requestAnimationFrame(Tick); return; }
  const elapsed = lastTimestamp ? Math.max(0, (timestamp - lastTimestamp) / 1000) : 0;
  const measuring = !!previewDebug.profiler?.recording;
  const beforeUpdate = measuring ? performance.now() : 0;
  previewDebug.Update(Math.min(elapsed, 1));
  const beforeNavigation = measuring ? performance.now() : 0;
  const navigated = !Element("annotationDialog").open && navigation.Tick(Math.min(0.1, elapsed));
  const beforeRender = measuring ? { debugUpdateMs: beforeNavigation - beforeUpdate, navigationMs: performance.now() - beforeNavigation } : null;
  if (playing && lastTimestamp) {
    // Frames sample an absolute-time plan. Dropping elapsed time on a slow
    // render makes 1x playback (and every actor's metres/second) run too slowly.
    const delta = elapsed * Number(Element("flowSpeed").value);
    const end = Element("loopStage").checked ? frame.stage.end : activeVariant.duration;
    if (time + delta >= end) {
      if (Element("loopStage").checked) {
        const duration = end - frame.stage.start;
        time = frame.stage.start + (time + delta - frame.stage.start) % duration;
      } else { time = activeVariant.duration; SetPlaying(false); }
    } else time += delta;
    Render({ time: timestamp, previous: lastTimestamp, advancing: true, beforeRender });
  }
  else if (navigated || renderPending) Render({ time: timestamp, previous: lastTimestamp, beforeRender });
  lastTimestamp = timestamp; requestAnimationFrame(Tick);
}

async function Start() {
  PopulateVariantPicker();
  PopulateTimeline();
  const [loadedMap] = await Promise.all([
    EnsureVariantMap(activeVariant, frame.player),
    PreloadEncounterTerrainLayers(() => {
      if (!workspace) return;
      for (const entry of workspace.entries) { entry.map.baseKey = ""; entry.map.staticKey = ""; }
      RequestRender();
    }),
  ]);
  mapData = loadedMap;
  workspace = new EncounterViewports(Element("viewportGrid"), mapData, {
    activate: (entry) => { map = entry.map; canvas = entry.canvas; canvas.dataset.mode = mode; canvas.dataset.navigationTool = navigationTool; },
    change: () => Render(), bounds: StageBounds, bind: BindMap, storage,
  });
  navigation = new EncounterSceneControls(workspace, RequestRender);
  for (const entry of workspace.entries) navigation.BindGizmo(entry);
  previewDebug = new LevelFlowDebug({ requestRender: RequestRender, renderFrame: () => Render(), toast: Toast, visible: () => workspace.Visible() });
  gamePlay = new LevelFlowPlay({
    getVariant: () => activeVariant,
    snapshot: () => ({ time, document: structuredClone(project.value), viewports: workspace.Serialize(), selection: structuredClone(selection) }),
    pause: () => { SetPlaying(false); navigation.Clear(); },
    restore: (saved) => { Element("playStatus").hidden = true; selection = saved.selection; Seek(saved.time); workspace.Restore(saved.viewports); Render(); },
    showSource: () => ShowTab("script"),
    onState: (state) => {
      time = state.timelineTime; frame = activeVariant.evaluate(time, project.value); UpdateTimeline();
      Element("playStatus").hidden = false;
      Element("playStatusTitle").textContent = (state.paused ? "已暂停 · " : "") + (state.hints?.title || "");
      Element("playStatusTask").textContent = state.hints?.task || "";
      Element("playStatusHint").textContent = state.hints?.hint || "";
    },
    toast: Toast,
    previewDebug,
  });
  annotationEditor = new ScreenshotAnnotations(async () => {
    await chat.Attach(annotationEditor); annotationEditor.dialog.close(); ShowTab("chat");
  });
  chat = new EncounterChat({
    snapshot: () => ({ frame: Packet(), location: JSON.parse(CreateLocationText(frame, workspace, selection, project.value)) }),
    openScreenshot: OpenAnnotations,
    editScreenshot: (image) => { if (image) annotationEditor.Open(image.capture, image.frame, image.marks); },
    openUnits: () => { SetNavigationTool("select"); SetPlaying(false); ShowTab("chat"); },
    setUnitMode: SetUnitSelectionMode,
    removeUnit: (id) => Select({ type: "actor", id }, { additive: true }),
    clearUnits: () => Select(null),
    resizeViewports: (resizing) => workspace.SetResizing(resizing),
  });
  Element("mapLoading").hidden = true;
  BindControls();
  window.LevelFlow = {
    Seek, JumpBeat, SetPlaying, Select, Packet, SetMode, SwitchVariant,
    Variant: () => ({ id: activeVariant.id, level: activeVariant.spec.level, scene: activeVariant.spec.scene, title: activeVariant.spec.title, badge: activeVariant.spec.badge, duration: activeVariant.duration, forked: !activeVariant.spec.isBaseline }),
    Variants: () => ENCOUNTER_VARIANTS.map((v) => ({ id: v.id, level: v.level, title: v.title, badge: v.badge, scene: v.scene })),
    Timeline: () => timeline.Inspect(),
    Play: { Start: (mode) => gamePlay.Start(mode), Pause: (on) => gamePlay.Pause(on), Stop: () => gamePlay.Stop(), SetLayout: (count) => gamePlay.SetLayout(count), State: () => gamePlay.Inspect() },
    Evaluate: (value) => activeVariant.evaluate(value, project.value),
    Stealth: () => structuredClone(frame.stealth),
    Inspect: () => ({ variant: activeVariant.id, scene: activeVariant.spec.scene, time, playing, stage: frame.stage.id, beat: frame.beat.id, duration: activeVariant.duration, actors: frame.actors, effects: frame.effects, dialogue: frame.dialogue, stretchersPassed: frame.stretchersPassed, task: frame.beat.task, speechBubbles: workspace.Visible().map((entry) => entry.map.InspectSpeech?.() || entry.map.speechBubbles || []), layers: { ...workspace.active.layers }, view: { center: [...map.center], scale: map.scale }, viewports: workspace.Serialize(), rendering: workspace.Visible().map((entry) => entry.map.Diagnostics?.() || null), mapObjects: mapData.objects.length, terrainBuild: mapData.terrain.buildInfo, groups: frame.groups, triggers: frame.triggers, document: structuredClone(project.value) }),
    ToScreen: (point, index = workspace.activeIndex) => workspace.entries[index].map.ToScreen(point),
    SetLayout: (count) => { workspace.SetLayout(count); Element("viewportLayout").value = String(count); },
    SetViewType: (index, type) => workspace.SetType(index, type),
    ActivateView: (index) => workspace.Activate(index),
    RestoreViewports: (layout) => { workspace.Restore(layout); Element("viewportLayout").value = String(workspace.count); Render(); },
  };
  const stage = activeVariant.stages.find((item) => item.id === params.get("stage")?.padStart(2, "0"));
  if (params.has("beat")) JumpBeat(params.get("beat")); else Seek(params.has("t") ? Number(params.get("t")) : stage?.start || 0, { fit: true });
  if (["x", "z", "zoom"].every((key) => params.has(key) && Number.isFinite(Number(params.get(key))))) {
    map.center = [Number(params.get("x")), Number(params.get("z"))]; map.scale = Clamp(Number(params.get("zoom")), FLOW_ZOOM.minScale, FLOW_ZOOM.maxScale); workspace.active.mode = "manual";
    if (map.type === "scene") {
      const distance = Clamp(map.focal / map.scale, 4, map.far / 2), target = [map.center[0], map.Ground(map.center) + 0.8, map.center[1]];
      map.freeCamera.eye = target.map((value, axis) => value - map.forward[axis] * distance); map.focusDistance = distance;
    }
  }
  if (project.warning) Toast(project.warning, true);
  UpdateAnnotations(); Render(); chat.RestoreDraft(); requestAnimationFrame(Tick);
}
Start().catch((error) => { Element("mapLoading").textContent = error.message; Toast(error.message, true); console.error(error); });
