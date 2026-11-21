import * as THREE from "three";
import { WEAPONS } from "../Data_Weapons.mjs";
import { WeaponInspectionScene } from "./Script_WeaponInspectionScene.mjs";

const GROUPS = [
  ["枪械", ["boltRifle", "lmg", "hmg", "pistol"]],
  ["其他武器", ["throwable", "melee", "mortar"]],
  ["载具", ["vehicle"]],
];
const KIND = {
  boltRifle: "栓动步枪", lmg: "轻机枪", hmg: "重机枪", pistol: "手枪",
  throwable: "投掷物", melee: "刀具", mortar: "架设武器", vehicle: "战车",
};
const SIDE = { nra: "中方", ija: "日方", neutral: "待考" };
const VIEWS = { side: [0, 0], angle: [-.32, .28], top: [0, Math.PI / 2 - .001] };
const SCALE_METERS = [.005, .01, .02, .05, .1, .2, .5, 1, 2, 5, 10];
const number = new Intl.NumberFormat("zh-CN");
const ById = (id) => document.getElementById(id);
const Text = (id, value) => { ById(id).textContent = value; };
const SetPressed = (button, on) => button.setAttribute("aria-pressed", String(on));
const Kind = (weapon) => weapon.id === "MediumMortar" ? "迫击炮" : (KIND[weapon.kind] || weapon.kind);

function LabelNode(parent, tag, text) {
  const element = document.createElement(tag);
  element.textContent = text;
  parent.appendChild(element);
  return element;
}

const canvas = ById("view");
const list = ById("modelList");
const search = ById("modelSearch");
const status = ById("stageStatus");
const retry = ById("retryLoad");
const gridButton = ById("gridToggle");
const mountButton = ById("mountToggle");
const bladeButton = ById("bayonetToggle");
const scale = ById("viewScale");
const fitButton = ById("fitView");
const presets = [...document.querySelectorAll("[data-view]")];
const zoomButtons = [...document.querySelectorAll("[data-zoom]")];
const viewButtons = [...presets, ...zoomButtons, fitButton, gridButton, mountButton, bladeButton];
const dimensionIds = ["sizeX", "sizeY", "sizeZ"];
const mountLabels = [
  { key: "muzzle", label: ById("muzzleLabel") },
  { key: "grip", label: ById("gripLabel") },
];
const projected = new THREE.Vector3();

let stage;
let selected = "ZhongZheng";
let selectionVersion = 0;
let showMounts = false;

function SyncSelection() {
  for (const item of list.querySelectorAll("[data-model]")) {
    item.setAttribute("aria-current", String(item.dataset.model === selected));
  }
}

function FilterCatalog() {
  const query = search.value.trim().toLocaleLowerCase();
  const matches = Object.values(WEAPONS).filter((weapon) =>
    [weapon.id, weapon.name, weapon.fullName, Kind(weapon)].some((field) => field?.toLocaleLowerCase().includes(query)));
  list.replaceChildren();
  Text("catalogCount", matches.length);
  if (!matches.length) LabelNode(list, "p", "没有匹配的模型").className = "search-empty";
  for (const [name, kinds] of GROUPS) {
    const entries = matches.filter((weapon) => kinds.includes(weapon.kind));
    if (!entries.length) continue;
    const group = document.createElement("div");
    group.className = "model-group";
    list.appendChild(group);
    LabelNode(group, "h3", name);
    for (const weapon of entries) {
      const row = document.createElement("button");
      row.type = "button";
      row.className = "model-row";
      row.dataset.model = weapon.id;
      LabelNode(row, "span", weapon.name);
      LabelNode(row, "span", Kind(weapon));
      row.addEventListener("click", () => { if (selected !== weapon.id || canvas.dataset.state === "error") Select(weapon.id); });
      group.append(row);
    }
  }
  SyncSelection();
}

function DrawOverlays() {
  const model = stage.model;
  scale.hidden = !model;
  if (model) {
    const pixelsPerMeter = stage.height * stage.zoom / stage.span;
    const length = SCALE_METERS.find((value) => value * pixelsPerMeter >= 56) ?? SCALE_METERS.at(-1);
    scale.style.width = `${length * pixelsPerMeter}px`;
    Text("scaleValue", length < .01 ? `${length * 1000} mm` : length < 1 ? `${length * 100} cm` : `${length} m`);
  }
  for (const { key, label } of mountLabels) {
    label.hidden = true;
    if (!showMounts || !model?.[key]) continue;
    projected.copy(model[key]);
    model.pose.localToWorld(projected).project(stage.camera);
    if (Math.abs(projected.x) > .95 || Math.abs(projected.y) > .88 || Math.abs(projected.z) > 1) continue;
    label.hidden = false;
    label.style.left = `${(projected.x + 1) * 50}%`;
    label.style.top = `${(1 - projected.y) * 50}%`;
  }
}

function SetStatus(state, message = "", canRetry = false) {
  canvas.dataset.state = state;
  status.hidden = state === "ready";
  retry.hidden = !canRetry;
  Text("loadMessage", message);
  for (const button of viewButtons) button.disabled = state !== "ready";
}

async function Select(id, variant = 0) {
  if (!stage || !Object.hasOwn(WEAPONS, id)) return null;
  const version = ++selectionVersion;
  const weapon = WEAPONS[id];
  selected = id;
  SyncSelection();
  Text("modelName", weapon.name);
  Text("modelFullName", weapon.fullName === weapon.name ? "" : weapon.fullName);
  Text("modelId", weapon.id);
  Text("modelKind", Kind(weapon));
  Text("modelSide", SIDE[weapon.side] || "待考");
  for (const key of ["modelFile", "modelTriangles", ...dimensionIds]) Text(key, "—");
  SetPressed(bladeButton, false);
  bladeButton.hidden = true;
  ById("resourceNote").hidden = true;
  SetStatus("loading", "正在载入模型…");
  stage.Show(null);
  try {
    const model = await stage.Load(id, variant);
    if (selectionVersion !== version) {
      stage.Release(model);
      return null;
    }
    stage.Show(model);
    Text("modelFile", model.file);
    Text("modelTriangles", number.format(model.triangles));
    model.size.toArray().forEach((meters, i) => Text(dimensionIds[i], number.format(Math.round(meters * 1000))));
    SetStatus("ready");
    bladeButton.hidden = !model.blade;
    mountButton.hidden = !model.muzzle && !model.grip;
    const notes = [
      model.textureFallback && "部分检查贴图未载入，已使用备用材质。",
      model.missingBlade && "刺刀预览模型未载入。",
    ].filter(Boolean);
    Text("resourceNote", notes.join(" "));
    ById("resourceNote").hidden = !notes.length;
    return model;
  } catch (error) {
    if (selectionVersion === version) {
      console.warn("[WeaponInspection]", error);
      SetStatus("error", "模型载入失败", true);
    }
    return null;
  }
}

function BindViewport() {
  const panAxis = new THREE.Vector3();
  const SetView = (id) => {
    for (const button of presets) SetPressed(button, button.dataset.view === id);
    stage.SetView(...VIEWS[id]);
  };
  const Rotate = (dx, dy) => {
    for (const preset of presets) SetPressed(preset, false);
    stage.yaw -= dx * .009;
    const limit = Math.PI / 2 - .001;
    stage.pitch = Math.max(-limit, Math.min(limit, stage.pitch + dy * .009));
    stage.RequestDraw();
  };
  const Zoom = (factor) => {
    stage.zoom = Math.max(.38, Math.min(7, stage.zoom * factor));
    stage.RequestDraw();
  };
  const Pan = (dx, dy) => {
    const metersPerPixel = stage.span / (stage.zoom * stage.height);
    stage.center.addScaledVector(panAxis.setFromMatrixColumn(stage.camera.matrixWorld, 0), -dx * metersPerPixel);
    stage.center.addScaledVector(panAxis.setFromMatrixColumn(stage.camera.matrixWorld, 1), dy * metersPerPixel);
    stage.RequestDraw();
  };
  for (const button of presets) button.addEventListener("click", () => SetView(button.dataset.view));
  for (const button of zoomButtons) button.addEventListener("click", () => Zoom(button.dataset.zoom === "in" ? 1.25 : .8));
  fitButton.addEventListener("click", () => stage.Fit());
  gridButton.addEventListener("click", () => {
    stage.gridVisible = !stage.gridVisible;
    if (stage.grid) stage.grid.visible = stage.gridVisible;
    SetPressed(gridButton, stage.gridVisible);
    stage.RequestDraw();
  });
  mountButton.addEventListener("click", () => {
    showMounts = !showMounts;
    SetPressed(mountButton, showMounts);
    DrawOverlays();
  });
  bladeButton.addEventListener("click", () => {
    const blade = stage.model?.blade;
    if (!blade) return;
    blade.visible = !blade.visible;
    SetPressed(bladeButton, blade.visible);
    stage.Fit();
  });
  let drag = null;
  canvas.addEventListener("pointerdown", (event) => {
    if (!stage.model || !event.isPrimary || (event.button !== 0 && event.button !== 2)) return;
    canvas.setPointerCapture(event.pointerId);
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY, pan: event.button === 2 || event.shiftKey };
  });
  canvas.addEventListener("pointermove", (event) => {
    if (!drag || event.pointerId !== drag.id) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    if (dx || dy) (drag.pan ? Pan : Rotate)(dx, dy);
    drag.x = event.clientX;
    drag.y = event.clientY;
  });
  canvas.addEventListener("lostpointercapture", () => { drag = null; });
  canvas.addEventListener("contextmenu", (event) => { if (stage.model) event.preventDefault(); });
  canvas.addEventListener("wheel", (event) => {
    if (!stage.model) return;
    event.preventDefault();
    const pixels = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? stage.height : 1);
    Zoom(Math.exp(-pixels * .0014));
  }, { passive: false });
  const arrows = { ArrowLeft: [-13, 0], ArrowRight: [13, 0], ArrowUp: [0, -13], ArrowDown: [0, 13] };
  canvas.addEventListener("keydown", (event) => {
    if (!stage.model || event.ctrlKey || event.metaKey || event.altKey) return;
    if (Object.hasOwn(arrows, event.key)) (event.shiftKey ? Pan : Rotate)(...arrows[event.key]);
    else if (event.key === "+" || event.key === "=") Zoom(1.25);
    else if (event.key === "-") Zoom(.8);
    else if (event.key === "Home") stage.Fit();
    else return;
    event.preventDefault();
  });
  SetView("angle");
}

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

FilterCatalog();
search.addEventListener("input", FilterCatalog);
SetStatus("loading", "正在载入模型…");
try {
  stage = new WeaponInspectionScene(canvas, DrawOverlays);
  BindViewport();
  retry.addEventListener("click", () => { stage.Retry(); Select(selected); });
  // 本地验收与既有台架出图脚本共用当前模型和相机。
  window.WeaponInspection = { scene: stage, Select, get selected() { return selected; } };
  Select(selected);
} catch (error) {
  console.warn("[WeaponInspection]", error);
  SetStatus("error", "无法启动三维视口");
}
