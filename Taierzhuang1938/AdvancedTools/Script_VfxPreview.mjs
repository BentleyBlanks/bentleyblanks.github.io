// 特效预览独立窗口（Tool_VfxPreview.html）：火焰、烟雾、爆炸、命中、枪口焰、曳光、照明弹与落土。
//
// 装的东西只有三样：特效系统本身（Script_Vfx 及其粒子 / 照明弹 / 血迹 / 扬尘模块，这就是要预览的对象）、
// 校准测试场（Script_VfxPreviewStage：渲染器、轨道相机、HDR 输出变换、预览灯、测试场建筑参照与抗锯齿网格），
// 以及昼夜（Script_VfxPreviewEnvironment：读项目的环境预设，白天 / 黄昏 / 晚上取预设自带的 looks）。
// 不装游戏的灯光装置、后处理、天空、GI、材质库、场景与关卡。编辑器本体照旧是 Script_EditorVfx。
//
// 网址参数：effect=<效果 id>、flareCamera=<镜头>、env=<环境预设 id>、look=<day|dusk|night…>、quality=<画质档>、
// manual=1（时钟归测试，window.VfxPreview.StepFrames 推帧）。

import { VfxSystem } from "../Script_Vfx.mjs";
import { ViewportInput } from "../Script_EditorStage.mjs";
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

async function Main() {
  const params = new URLSearchParams(location.search);
  const canvas = document.getElementById("view");
  const shell = ToolWindowShell({ title: "特效预览" });
  const quality = LoadGraphicsProfile(location.search);
  const stage = new VfxPreviewStage(canvas, { quality });

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
  vfx.SetDepthSource(stage.post.NormalDepthTexture, stage.post.width, stage.post.height, stage.post.SceneDepthTexture);
  ApplyEnvironment();

  const host = {
    standalone: true,
    renderer: stage.renderer, scene: stage.scene, camera: stage.camera, canvas,
    library: stage.library, lights: stage.lights, vfx, post: stage.post,
    previewEnvironment: {
      get presetId() { return environment.presetId; },
      get lookId() { return environment.lookId; },
      Options: () => environment.Options(),
      LookOptions: () => environment.LookOptions(),
      Looks: () => environment.Looks(),
      Select: (id, look) => environment.Select(id, look),
      SelectLook: (look) => !!environment.SelectLook(look),
    },
    previewStage: {
      get exposureEv() { return stage.exposureEv; },
      SetExposureEv: (ev) => stage.SetExposureEv(ev),
      get arenaMode() { return stage.arena.mode; },
      SetArenaMode: (mode) => stage.SetArenaMode(mode),
      SetArenaEffect: (id, flags) => stage.SetArenaEffect(id, flags),
      Resize: () => { stage.Resize(); stage.Render(); },
    },
    studio: stage.studio, hideInStudio: [],
    Close: () => shell.Return(),
  };
  const editor = new VfxEditor(host);
  editor.Enter(shell.workHost);
  stage.Resize();

  // 视口：左键转、右键平移、滚轮缩放（同摄影棚）；面板上的操作不进视口。
  const viewport = new ViewportInput(canvas);
  viewport.enabled = true;
  viewport.OnDrag = (dx, dy, button) => { if (editor.OnDrag) editor.OnDrag(dx, dy, button); else stage.studio.Drag(dx, dy, button); };
  viewport.OnWheel = (delta) => { if (editor.OnWheel) editor.OnWheel(delta); else stage.studio.Zoom(delta); };
  document.addEventListener("keydown", (event) => {
    if (event.code === "Escape" && !event.target.closest?.("input, textarea, select")) shell.Return();
  });

  const RenderStage = (dt) => {
    vfx.SetDepthSource(stage.post.NormalDepthTexture, stage.post.width, stage.post.height, stage.post.SceneDepthTexture);
    stage.post.SetGroundDustSource?.(vfx.dustFields || null);
    stage.Render(dt);
  };
  const Step = (dt) => {
    editor.Update(dt);
    RenderStage(dt);
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
      RenderStage(dt);
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
