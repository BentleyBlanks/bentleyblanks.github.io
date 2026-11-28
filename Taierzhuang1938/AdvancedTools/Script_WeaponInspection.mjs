import * as THREE from "three";
import { INSPECTION_MODELS, WeaponInspectionScene } from "./Script_WeaponInspectionScene.mjs";
import { ShowWeaponModelInspector } from "./Script_WeaponModelInspector.mjs";
import { BindWeaponReferenceViewport } from "./Script_WeaponReferenceViewport.mjs";

const GROUPS = [
  ["枪械", ["boltRifle", "lmg", "hmg", "pistol"]],
  ["其他武器", ["throwable", "melee", "mortar"]],
  ["载具", ["vehicle"]],
];
const KIND = {
  boltRifle: "栓动步枪", lmg: "轻机枪", hmg: "重机枪", pistol: "手枪",
  throwable: "投掷物", melee: "刀具", mortar: "架设武器", vehicle: "战车",
};
const HELD_FIREARM_KINDS = new Set(["boltRifle", "lmg", "pistol"]);
const SIDE = { nra: "中方", ija: "日方", neutral: "待考" };
const SCALE_METERS = [.001, .002, .005, .01, .02, .05, .1, .2, .5, 1, 2, 5, 10];
const MIN_SCALE_WIDTH = 56;
const CLOSEUP_SCALE_WIDTH = 80;
const number = new Intl.NumberFormat("zh-CN");
const ById = (id) => document.getElementById(id);
const Text = (id, value) => { ById(id).textContent = value; };
function SetPressed(button, on) {
  button.setAttribute("aria-pressed", String(on));
  button.classList.toggle("on", on);
}
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
const inspector = ById("modelInspector");
const status = ById("stageStatus");
const retry = ById("retryLoad");
const gridButton = ById("gridToggle");
const wireframeButton = ById("wireframeToggle");
const mountButton = ById("mountToggle");
const bladeButton = ById("bayonetToggle");
const orbitPreset = ById("orbitPreset");
const firstPersonPreset = ById("firstPersonPreset");
const firstPersonInfo = ById("firstPersonInfo");
const environmentLight = ById("environmentLight");
const viewHint = ById("viewHint");
const scale = ById("viewScale");
const channelButtons = [...document.querySelectorAll("[data-channel]")];
const viewButtons = [...channelButtons, gridButton, wireframeButton, mountButton, bladeButton];
const dimensionIds = ["sizeX", "sizeY", "sizeZ"];
const mountLabels = [
  { key: "muzzle", label: ById("muzzleLabel") },
  { key: "grip", label: ById("gripLabel") },
];
const projected = new THREE.Vector3();
const orbitLabel = canvas.getAttribute("aria-label");

let stage;
let selected = "ZhongZheng";
let selectionVersion = 0;
let showMounts = false;
let firstPersonRequested = false;
let firstPersonRevision = 0;
let firstPersonLoad = null;

function SyncSelection() {
  for (const item of list.querySelectorAll("[data-model]")) {
    item.setAttribute("aria-current", String(item.dataset.model === selected));
  }
}

function FilterCatalog() {
  const query = search.value.trim().toLocaleLowerCase();
  const matches = Object.values(INSPECTION_MODELS).filter((weapon) =>
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
  scale.hidden = !model || firstPersonRequested;
  if (!scale.hidden) {
    const pixelsPerMeter = stage.height * stage.zoom / stage.span;
    const length = SCALE_METERS.find((value) => value * pixelsPerMeter >= MIN_SCALE_WIDTH) ?? SCALE_METERS.at(-1);
    scale.style.width = `${length * pixelsPerMeter}px`;
    Text("scaleValue", length < .01 ? `${length * 1000} mm` : length < 1 ? `${length * 100} cm` : `${length} m`);
  }
  for (const { key, label } of mountLabels) {
    label.hidden = true;
    if (firstPersonRequested || !showMounts || !model?.[key]) continue;
    projected.copy(model[key]);
    model.pose.localToWorld(projected).project(stage.camera);
    if (Math.abs(projected.x) > .95 || Math.abs(projected.y) > .88 || Math.abs(projected.z) > 1) continue;
    label.hidden = false;
    label.style.left = `${(projected.x + 1) * 50}%`;
    label.style.top = `${(1 - projected.y) * 50}%`;
  }
}

function CanPreviewFirstPerson() {
  return HELD_FIREARM_KINDS.has(INSPECTION_MODELS[selected]?.kind);
}

function SyncViewControls() {
  const ready = canvas.dataset.state === "ready";
  SetPressed(orbitPreset, !firstPersonRequested);
  SetPressed(firstPersonPreset, firstPersonRequested);
  firstPersonPreset.disabled = !ready || !CanPreviewFirstPerson();
  firstPersonPreset.title = CanPreviewFirstPerson() ? "站立持枪的游戏视角" : "当前模型没有手持枪械视角";
  for (const button of viewButtons) button.disabled = !ready || firstPersonRequested;
  environmentLight.disabled = !ready;
  viewHint.hidden = firstPersonRequested;
  canvas.setAttribute("aria-label", firstPersonRequested ? "第一人称站立持枪预览" : orbitLabel);
}

function ShowOrbit() {
  firstPersonRequested = false;
  firstPersonRevision += 1;
  firstPersonInfo.hidden = true;
  stage?.SetFirstPerson(null);
  SyncViewControls();
}

async function ShowFirstPerson() {
  const { model } = stage;
  if (!model || !CanPreviewFirstPerson()) return;
  const revision = ++firstPersonRevision;
  firstPersonRequested = true;
  firstPersonInfo.hidden = false;
  Text("firstPersonInfo", "正在读取持枪姿势…");
  SyncViewControls();
  stage.RequestDraw();
  try {
    firstPersonLoad ??= import("./Script_WeaponInspectionFirstPerson.mjs")
      .then(({ WeaponInspectionFirstPerson }) => WeaponInspectionFirstPerson.Create(stage))
      .catch((error) => { firstPersonLoad = null; throw error; });
    const preview = await firstPersonLoad;
    if (revision !== firstPersonRevision || model !== stage.model) return;
    preview.Equip(model);
    stage.SetFirstPerson(preview);
    Text("firstPersonInfo", `FOV ${number.format(preview.camera.fov)}° · 16:9`);
  } catch (error) {
    if (revision !== firstPersonRevision || model !== stage.model) return;
    console.warn("[WeaponInspection]", error);
    ShowOrbit();
    firstPersonInfo.hidden = false;
    Text("firstPersonInfo", "持枪预览载入失败");
  }
}

function SetStatus(state, message = "", canRetry = false) {
  canvas.dataset.state = state;
  status.hidden = state === "ready";
  retry.hidden = !canRetry;
  Text("loadMessage", message);
  SyncViewControls();
}

async function Select(id, variant = 0) {
  if (!stage || !Object.hasOwn(INSPECTION_MODELS, id)) return null;
  const version = ++selectionVersion;
  const weapon = INSPECTION_MODELS[id];
  selected = id;
  if (firstPersonRequested && !CanPreviewFirstPerson()) ShowOrbit();
  firstPersonInfo.hidden = true;
  SyncSelection();
  Text("modelName", weapon.name);
  Text("modelFullName", weapon.fullName === weapon.name ? "" : weapon.fullName);
  Text("modelId", weapon.id);
  Text("modelKind", Kind(weapon));
  Text("modelSide", SIDE[weapon.side] || "待考");
  for (const key of ["modelFile", "modelTriangles", ...dimensionIds]) Text(key, "—");
  ShowWeaponModelInspector(inspector, null);
  inspector.closest(".details").scrollTop = 0;
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
    ShowWeaponModelInspector(inspector, model, stage);
    SetStatus("ready");
    bladeButton.hidden = !model.blade;
    mountButton.hidden = !model.muzzle && !model.grip;
    const notes = [
      model.textureFallback && "部分检查贴图未载入，已使用备用材质。",
      model.missingBlade && "刺刀预览模型未载入。",
    ].filter(Boolean);
    Text("resourceNote", notes.join(" "));
    ById("resourceNote").hidden = !notes.length;
    if (firstPersonRequested) void ShowFirstPerson();
    return model;
  } catch (error) {
    if (selectionVersion === version) {
      console.warn("[WeaponInspection]", error);
      if (firstPersonRequested) ShowOrbit();
      SetStatus("error", "模型载入失败", true);
    }
    return null;
  }
}

function BindViewport() {
  const SyncEnvironmentLight = () => {
    const percent = `${environmentLight.value}%`;
    environmentLight.setAttribute("aria-valuetext", percent);
    Text("environmentLightValue", percent);
    stage.SetEnvironmentLight(environmentLight.valueAsNumber / 100);
  };
  SyncEnvironmentLight();
  environmentLight.addEventListener("input", SyncEnvironmentLight);
  const panAxis = new THREE.Vector3();
  const Rotate = (dx, dy) => {
    stage.yaw -= dx * .009;
    const limit = Math.PI / 2 - .001;
    stage.pitch = Math.max(-limit, Math.min(limit, stage.pitch + dy * .009));
    stage.RequestDraw();
  };
  const Zoom = (factor, offsetX = 0, offsetY = 0) => {
    const before = stage.span / (stage.zoom * stage.height);
    const maxZoom = Math.max(7, stage.span * CLOSEUP_SCALE_WIDTH / (stage.height * SCALE_METERS[0]));
    stage.zoom = THREE.MathUtils.clamp(stage.zoom * factor, .38, maxZoom);
    const shift = before - stage.span / (stage.zoom * stage.height);
    if (shift && (offsetX || offsetY)) {
      stage.center.addScaledVector(panAxis.setFromMatrixColumn(stage.camera.matrixWorld, 0), offsetX * shift);
      stage.center.addScaledVector(panAxis.setFromMatrixColumn(stage.camera.matrixWorld, 1), -offsetY * shift);
    }
    stage.RequestDraw();
  };
  const Pan = (dx, dy) => {
    const metersPerPixel = stage.span / (stage.zoom * stage.height);
    stage.center.addScaledVector(panAxis.setFromMatrixColumn(stage.camera.matrixWorld, 0), -dx * metersPerPixel);
    stage.center.addScaledVector(panAxis.setFromMatrixColumn(stage.camera.matrixWorld, 1), dy * metersPerPixel);
    stage.RequestDraw();
  };
  orbitPreset.addEventListener("click", ShowOrbit);
  firstPersonPreset.addEventListener("click", () => { if (!firstPersonRequested) void ShowFirstPerson(); });
  for (const button of channelButtons) {
    button.addEventListener("click", () => {
      stage.SetChannel(button.dataset.channel);
      for (const item of channelButtons) SetPressed(item, item === button);
    });
  }
  gridButton.addEventListener("click", () => {
    stage.gridVisible = !stage.gridVisible;
    if (stage.grid) stage.grid.visible = stage.gridVisible;
    SetPressed(gridButton, stage.gridVisible);
    stage.RequestDraw();
  });
  wireframeButton.addEventListener("click", () => {
    stage.SetWireframe(!stage.wireframe);
    SetPressed(wireframeButton, stage.wireframe);
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
  const touches = new Map();
  let pinch = null;
  let tap = null;
  let lastTap = null;
  const Pinch = () => {
    if (touches.size !== 2) return null;
    const [a, b] = [...touches.values()];
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, d: Math.max(Math.hypot(a.x - b.x, a.y - b.y), 1) };
  };
  const TouchStart = (event) => {
    canvas.setPointerCapture(event.pointerId);
    touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
    pinch = Pinch();
    tap = touches.size === 1 ? { time: event.timeStamp, x: event.clientX, y: event.clientY } : null;
    if (touches.size > 1) lastTap = null;
  };
  const TouchMove = (event) => {
    const point = touches.get(event.pointerId);
    if (!point) return;
    const dx = event.clientX - point.x;
    const dy = event.clientY - point.y;
    point.x = event.clientX;
    point.y = event.clientY;
    if (tap && Math.hypot(point.x - tap.x, point.y - tap.y) >= 10) tap = null;
    if (touches.size === 1) {
      if (dx || dy) Rotate(dx, dy);
    } else if (pinch) {
      const next = Pinch();
      const rect = canvas.getBoundingClientRect();
      Pan(next.x - pinch.x, next.y - pinch.y);
      Zoom(next.d / pinch.d, next.x - rect.left - rect.width / 2, next.y - rect.top - rect.height / 2);
      pinch = next;
    }
  };
  const TouchEnd = (event) => {
    if (!touches.delete(event.pointerId)) return;
    pinch = Pinch();
    if (event.type !== "pointerup" || !tap || event.timeStamp - tap.time >= 250) {
      tap = null;
      return;
    }
    if (lastTap && tap.time - lastTap.time < 300 && Math.hypot(tap.x - lastTap.x, tap.y - lastTap.y) < 10) {
      lastTap = null;
      stage.Fit();
    } else {
      lastTap = tap;
    }
    tap = null;
  };
  canvas.addEventListener("pointerdown", (event) => {
    if (!stage.model || firstPersonRequested) return;
    if (event.pointerType === "touch") {
      TouchStart(event);
      return;
    }
    if (!event.isPrimary || (event.button !== 0 && event.button !== 2)) return;
    canvas.setPointerCapture(event.pointerId);
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY, pan: event.button === 2 || event.shiftKey };
  });
  canvas.addEventListener("pointerup", TouchEnd);
  canvas.addEventListener("pointercancel", TouchEnd);
  canvas.addEventListener("pointermove", (event) => {
    if (firstPersonRequested) return;
    if (event.pointerType === "touch") {
      TouchMove(event);
      return;
    }
    if (!drag || event.pointerId !== drag.id) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    if (dx || dy) (drag.pan ? Pan : Rotate)(dx, dy);
    drag.x = event.clientX;
    drag.y = event.clientY;
  });
  canvas.addEventListener("lostpointercapture", (event) => {
    if (event.pointerType === "touch") TouchEnd(event);
    else drag = null;
  });
  canvas.addEventListener("contextmenu", (event) => { if (stage.model) event.preventDefault(); });
  canvas.addEventListener("wheel", (event) => {
    if (!stage.model || firstPersonRequested) return;
    event.preventDefault();
    const pixels = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? stage.height : 1);
    const rect = canvas.getBoundingClientRect();
    Zoom(Math.exp(-pixels * .0014), event.clientX - rect.left - rect.width / 2, event.clientY - rect.top - rect.height / 2);
  }, { passive: false });
  const arrows = { ArrowLeft: [-13, 0], ArrowRight: [13, 0], ArrowUp: [0, -13], ArrowDown: [0, 13] };
  canvas.addEventListener("keydown", (event) => {
    if (!stage.model || firstPersonRequested || event.ctrlKey || event.metaKey || event.altKey) return;
    if (Object.hasOwn(arrows, event.key)) (event.shiftKey ? Pan : Rotate)(...arrows[event.key]);
    else if (event.key === "+" || event.key === "=") Zoom(1.25);
    else if (event.key === "-") Zoom(.8);
    else if (event.key === "Home") stage.Fit();
    else return;
    event.preventDefault();
  });
  stage.SetView(-.32, .28);
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
BindWeaponReferenceViewport();
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
