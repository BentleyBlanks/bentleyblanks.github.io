// 特效预览独立窗口（Tool_VfxPreview.html）：火焰、烟雾、爆炸、命中、枪口焰、曳光、照明弹与落土。
//
// 装的东西只有三样：特效系统本身（Script_Vfx 及其粒子 / 照明弹 / 血迹 / 扬尘模块，这就是要预览的对象）、
// 中性预览台（Script_VfxPreviewStage：渲染器、轨道相机、HDR 输出变换、预览灯），
// 以及昼夜（Script_VfxPreviewEnvironment：读项目的环境预设，白天 / 黄昏 / 晚上取预设自带的 looks）。
// 不装游戏的灯光装置、后处理、天空、GI、材质库、场景与关卡。编辑器本体照旧是 Script_EditorVfx。
//
// 网址参数：effect=<效果 id>、flareCamera=<镜头>、env=<环境预设 id>、look=<day|dusk|night…>、quality=<画质档>、
// manual=1（时钟归测试，window.VfxPreview.StepFrames 推帧）。

import { VfxSystem } from "../Script_Vfx.mjs";
import { ViewportInput } from "../Script_EditorStage.mjs";
import { El } from "../Script_EditorUi.mjs";
import { LoadGraphicsProfile } from "../Script_GraphicsProfile.mjs";
import { SCALE_PRESETS } from "../Data_BattleScale.mjs";
import { VfxEditor } from "./Script_EditorVfx.mjs";
import { VfxPreviewStage } from "./Script_VfxPreviewStage.mjs";
import { PreviewEnvironment } from "./Script_VfxPreviewEnvironment.mjs";
import { ToolWindowShell } from "./Script_ToolWindowShell.mjs";

const FLAT_NORMAL = Object.freeze({ x: 0, y: 1, z: 0 });
const MAX_FRAME_DT = 0.1;

function FlatRaycast(from, direction, distance) {
  if (direction.y >= -1e-6) return null;
  const t = -from.y / direction.y;
  if (t < 0 || t > distance) return null;
  return { t, distance: t, point: { x: from.x + direction.x * t, y: 0, z: from.z + direction.z * t }, normal: FLAT_NORMAL, tag: "terrain" };
}

/** 菜单栏上的曝光补偿（EV）：输出曝光 = 环境预设的 exposure × 2^EV。 */
function ExposureControl(stage) {
  const root = El("div", "edVolume");
  root.title = "曝光补偿：在环境预设的曝光上加减（只影响这个预览窗口）";
  root.appendChild(El("span", "edVolumeValue", "曝光"));
  const range = El("input", "edVolumeRange");
  range.type = "range"; range.min = "-4"; range.max = "4"; range.step = "0.25"; range.value = "0";
  range.setAttribute("aria-label", "曝光补偿 EV");
  range.dataset.vfxExposure = "true";
  const value = El("output", "edVolumeValue", "±0 EV");
  root.append(range, value);
  const Sync = () => {
    const ev = Number(range.value);
    stage.SetExposureEv(ev);
    value.textContent = `${ev > 0 ? "+" : ev < 0 ? "" : "±"}${ev} EV`;
    range.style.setProperty("--fill", `${((ev + 4) / 8) * 100}%`);
  };
  range.addEventListener("input", Sync);
  Sync();
  return root;
}

async function Main() {
  const params = new URLSearchParams(location.search);
  const canvas = document.getElementById("view");
  const shell = ToolWindowShell({ title: "特效预览" });
  shell.SetStatus("正在读取环境预设……");
  const quality = LoadGraphicsProfile(location.search);
  const stage = new VfxPreviewStage(canvas, { quality });
  shell.root.querySelector(".edMenuBar").insertBefore(ExposureControl(stage), shell.root.querySelector(".edMenuMainMenu"));

  const environment = new PreviewEnvironment();
  await environment.Init(params.get("env"));
  if (params.get("look")) environment.SelectLook(params.get("look"));
  let vfx = null;
  const ApplyEnvironment = () => {
    stage.ApplyEnvironment(environment.env, environment.sunDirection, environment.flareSceneScale);
    vfx?.SetFog(environment.env.fog, environment.env.sunColor);
    vfx?.SetSun(stage.sunDirection);
  };
  environment.OnChange(ApplyEnvironment);

  vfx = new VfxSystem(stage.scene, stage.library, { quality, maxParticles: SCALE_PRESETS.medium.vfxBudget, lights: stage.lights });
  vfx.SetBloodSurface((from, direction, distance) => FlatRaycast(from, direction, distance));
  vfx.SetFallingSoilSurface({ groundAt: () => 0, raycast: (from, direction, distance) => FlatRaycast(from, direction, distance) });
  vfx.SetDepthSource(null);
  ApplyEnvironment();

  const host = {
    standalone: true,
    renderer: stage.renderer, scene: stage.scene, camera: stage.camera, canvas,
    library: stage.library, lights: stage.lights, vfx, post: null,
    previewEnvironment: {
      get presetId() { return environment.presetId; },
      get lookId() { return environment.lookId; },
      Options: () => environment.Options(),
      LookOptions: () => environment.LookOptions(),
      Looks: () => environment.Looks(),
      Select: (id, look) => environment.Select(id, look),
      SelectLook: (look) => !!environment.SelectLook(look),
    },
    studio: stage.studio, hideInStudio: [],
    Close: () => shell.Return(),
  };
  const editor = new VfxEditor(host);
  editor.Enter(shell.workHost);

  // 视口：左键转、右键平移、滚轮缩放（同摄影棚）；面板上的操作不进视口。
  const viewport = new ViewportInput(canvas);
  viewport.enabled = true;
  viewport.OnDrag = (dx, dy, button) => { if (editor.OnDrag) editor.OnDrag(dx, dy, button); else stage.studio.Drag(dx, dy, button); };
  viewport.OnWheel = (delta) => { if (editor.OnWheel) editor.OnWheel(delta); else stage.studio.Zoom(delta); };
  document.addEventListener("keydown", (event) => {
    if (event.code === "Escape" && !event.target.closest?.("input, textarea, select")) shell.Return();
  });

  const SyncStatus = () => {
    const state = environment.State();
    shell.SetStatus(`独立窗口 · ${state.preset} · ${environment.Looks().find((look) => look.id === state.look)?.label || state.look} ${String(state.hour).padStart(2, "0")}:00`);
  };
  const Step = (dt) => {
    editor.Update(dt);
    stage.Render();
    SyncStatus();
  };
  const manual = params.get("manual") === "1";
  let last = performance.now();
  const Loop = (now) => {
    requestAnimationFrame(Loop);
    const dt = Math.min(MAX_FRAME_DT, (now - last) / 1000);
    last = now;
    if (!manual) Step(dt);
  };
  requestAnimationFrame(Loop);
  window.VfxPreview = {
    ready: true, stage, vfx, editor, environment, host,
    StepFrames(count = 1, dt = 1 / 60) {
      const n = Math.max(0, Math.floor(count));
      for (let i = 0; i < n; i += 1) editor.Update(dt);
      stage.Render();
      SyncStatus();
    },
    Inspect: () => ({ environment: environment.State(), lights: stage.lights.Inspect(), exposure: stage.OutputExposure, editor: editor.Inspect() }),
  };
  document.body.classList.add("vfxPreviewReady");
}

if (typeof document !== "undefined" && document.getElementById("vfxPreviewPage")) {
  Main().catch((error) => {
    console.error("[VfxPreview] 启动失败", error);
    const note = document.getElementById("vfxBootError");
    if (note) { note.hidden = false; note.textContent = `启动失败：${error.message}`; }
  });
}
