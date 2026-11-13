// 独立 PCG 验证宿主。仅装配场地、渲染与生产布设接口。
import { LoadGraphicsProfile } from "../Script_GraphicsProfile.mjs";
import { PHASES } from "../Data_Battle.mjs";
import { FIRST_LEVEL_MISSION_PHASE } from "../Data_FirstLevelMission.mjs";
import { TengxianField } from "../Script_TengxianField.mjs";
import { FirstLevelWhiteboxField } from "../Script_FirstLevelWhiteboxField.mjs";
import { AddExternalProps } from "../Script_ExternalProps.mjs";
import { CreateStudioBase, MAX_FRAME_DT } from "./Script_ToolStudioRenderBase.mjs";
import { ToolStudio } from "./Script_ToolStudio.mjs";
import { SplineEditor } from "./Script_EditorSplines.mjs";
import { PropPcgEditor } from "./Script_EditorPropPcg.mjs";

async function Main() {
  const params = new URLSearchParams(location.search);
  const tool = params.get("tool") === "splines" ? "splines" : "propPcg";
  const whitebox = params.get("whitebox") === "p012" || (!params.has("phase") && tool === "splines");
  const phaseIndex = Math.max(0, Math.min(PHASES.length - 1, Number(params.get("phase") || 5) || 0));
  const phase = whitebox ? FIRST_LEVEL_MISSION_PHASE : PHASES[phaseIndex];
  const step = document.getElementById("pcgBootStep");
  const SetStep = (label, progress = 0) => {
    step.textContent = label;
    document.getElementById("pcgBootBar").style.width = `${Math.round(progress * 100)}%`;
  };
  try {
    const base = await CreateStudioBase({ canvas: document.getElementById("view"), onStep: SetStep });
    base.viewmodel.root.visible = false;
    base.ApplySkyPreset(phase.sky);
    const World = whitebox ? FirstLevelWhiteboxField : TengxianField;
    const field = new World(base.scene, base.library, {
      quality: LoadGraphicsProfile(location.search), seed: 19380317,
      bounds: phase.bounds, zones: phase.zones,
      foci: phase.zones.map((zone) => [zone.x, zone.z]),
      levelId: phase.fieldFrom || phase.id, whiteboxLayout: phase.whitebox?.layout,
      detailRadius: phase.detailRadius ?? 100, midRadius: phase.midRadius ?? 210,
    });
    await field.PrepareAssets?.();
    for (const item of field.BuildSteps()) {
      SetStep(item.label, item.progress);
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    field.propPcgBlockers = field.colliders.slice();
    if (!whitebox) {
      const external = await AddExternalProps({
        scene: base.scene, library: base.library, phaseId: phase.fieldFrom || phase.id,
        bounds: phase.bounds, groundAt: (x, z) => field.GroundHeight(x, z),
        blockers: field.propPcgBlockers, cells: field.city?.cells || [],
        generatedPlacements: field.generatedExternalProps || [],
      });
      field.externalStreamer = external.streamer;
    }
    const game = {
      PHASES: [phase], state: { builtPhase: 0, phaseIndex: 0 }, battlefield: field,
      graphics: base.graphics, ApplyGraphics: base.ApplyGraphics,
      GetEnvironmentState: base.GetEnvironmentState,
      ApplyEnvironment: base.ApplySkyPreset, RestoreEnvironmentState: base.RestoreEnvironmentState,
    };
    const studio = new ToolStudio(base, { editors: [SplineEditor, PropPcgEditor], game });
    const select = document.createElement("select");
    select.className = "envSelect";
    select.setAttribute("aria-label", "验证场地");
    for (const [value, label] of [["p012", FIRST_LEVEL_MISSION_PHASE.label], ...PHASES.map((entry, index) => [String(index), entry.label])]) {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = label;
      select.appendChild(option);
    }
    select.value = whitebox ? "p012" : String(phaseIndex);
    select.addEventListener("change", () => {
      const selectedTool = studio.activeId || tool;
      studio.CloseTool();
      const url = new URL(location.href);
      url.searchParams.set("tool", selectedTool);
      url.searchParams.delete("whitebox");
      url.searchParams.delete("phase");
      url.searchParams.set(select.value === "p012" ? "whitebox" : "phase", select.value);
      location.assign(url);
    });
    studio.menuBar.insertBefore(select, studio.status);
    const spawn = phase.spawn || phase.zones[0];
    base.camera.position.set(spawn.x, field.GroundHeight(spawn.x, spawn.z) + 30, spawn.z + 35);
    studio.flycam.pitch = -0.6;
    studio.flycam.yaw = 0;
    base.camera.rotation.set(-0.6, 0, 0, "YXZ");
    const Step = (dt) => {
      studio.Update(dt);
      field.externalStreamer?.Update(base.camera.position.x, base.camera.position.z);
      base.Frame(dt);
    };
    const api = {
      ready: true, base, studio, game, battlefield: field,
      get editor() { return studio.active; },
      Open: (id) => studio.Open(id), Close: () => studio.CloseTool(),
      StepFrames(count = 1, dt = 1 / 60) { for (let i = 0; i < count; i += 1) Step(dt); },
    };
    const active = studio.Open(tool);
    if (!active) throw new Error(`工具无法打开：${tool}`);
    window.PcgTool = api;
    document.getElementById("pcgBoot").classList.add("gone");
    let last = performance.now();
    const Frame = (now) => {
      const dt = Math.min(MAX_FRAME_DT, (now - last) / 1000);
      last = now;
      if (params.get("manual") !== "1") Step(dt);
      requestAnimationFrame(Frame);
    };
    requestAnimationFrame(Frame);
    window.addEventListener("pagehide", () => { studio.Dispose(); field.Dispose(); }, { once: true });
  } catch (error) {
    SetStep(`启动失败：${error.message}`);
    console.error(error);
  }
}
Main();
