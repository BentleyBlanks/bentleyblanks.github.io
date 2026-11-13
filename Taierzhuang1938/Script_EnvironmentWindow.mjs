// 独立环境参数窗口，共用原环境面板、组件视图和昼夜时间轴。
import { SCENE_LIST } from "./Data_SceneAssets.mjs";
import { ENV_LEVELS } from "./Data_EnvLevels.mjs";
import { FIRST_LEVEL_STAGES } from "./Data_FirstLevelMissionStages.mjs";
import { EnvironmentSystem } from "./Script_EnvSystem.mjs";
import { EnvironmentEditor } from "./Script_EditorEnvironment.mjs";

const root = document.getElementById("environmentRoot");
const select = document.getElementById("environmentTarget");
const message = document.getElementById("environmentMessage");
const targets = [
  ...SCENE_LIST.map((scene) => ({ kind: "scene", id: scene.id, label: scene.title })),
  ...[...new Set(Object.values(ENV_LEVELS))].map((id) => ({ kind: "level", id, label: `正片关卡 · ${id}` })),
];
for (const target of targets) {
  const option = document.createElement("option");
  option.value = `${target.kind}/${target.id}`;
  option.textContent = target.label;
  select.appendChild(option);
}
const params = new URLSearchParams(location.search);
const initial = `${params.get("kind") || "scene"}/${params.get("target") || SCENE_LIST[0].id}`;
select.value = targets.some((target) => `${target.kind}/${target.id}` === initial) ? initial : select.options[0].value;
let editor = null;
let live = null;
let switching = false;
const localSystem = new EnvironmentSystem();

function LiveContext() {
  try {
    const game = window.opener?.Tengxian || window.opener?.Taierzhuang;
    return game?.editor?.EnvironmentContext?.() || null;
  } catch { return null; }
}

async function LoadTarget() {
  if (switching) return;
  if (editor?.dirty.size) {
    message.textContent = "当前配置有未保存的改动，请先保存或重新读取";
    select.value = `${editor.targetKind}/${editor.sceneId}`;
    return;
  }
  switching = true;
  select.disabled = true;
  const [kind, id] = select.value.split("/");
  const target = { kind, id };
  try {
    editor?.Dispose();
    editor = null;
    const context = LiveContext();
    live = context?.environment?.system;
    if (live?.targetKind !== kind || live?.sceneId !== id) live = null;
    const system = live || localSystem;
    if (!live) localSystem.Clear();
    const Beat = () => {
      if (!live || live.sceneId !== id || live.targetKind !== kind) return null;
      const beat = context.environment.Beat?.();
      if (beat) return beat;
      const step = context.environment.FirstLevelStep?.();
      if (!step || kind !== "level") return null;
      return { kind: "stage", id: step, label: `任务步骤 ${step}`,
        order: FIRST_LEVEL_STAGES.flatMap((stage) => stage.steps), times: { ...(system.sceneDoc?.stages || {}) },
        write: (spec) => editor.EditScene(`${step} 修改时间`, (doc) => {
          doc.stages = doc.stages || {};
          if (spec) doc.stages[step] = { ...spec }; else delete doc.stages[step];
        }),
      };
    };
    editor = new EnvironmentEditor({
      post: null, camera: null, renderer: null,
      uiRoot: () => root, setRootClass: (name, on) => root.classList.toggle(name, !!on),
      target: () => live ? { kind: live.targetKind, id: live.sceneId } : target, isLocked: () => true, beat: Beat,
      fallbackSky: () => "firstLevelBattleDay",
    }, { system });
    await editor.Open();
    message.textContent = live ? "已连接当前场景" : "配置编辑";
    const url = new URL(location.href);
    url.searchParams.set("kind", kind);
    url.searchParams.set("target", id);
    history.replaceState(null, "", url);
    window.EnvironmentWindow = { ready: true, get editor() { return editor; }, get system() { return editor.system; }, LoadTarget };
  } catch (error) {
    editor?.Dispose();
    editor = null;
    window.EnvironmentWindow = { ready: false, error: error.message };
    message.textContent = `加载失败：${error.message}`;
    console.error(error);
  } finally {
    switching = false; select.disabled = false;
  }
}
select.addEventListener("change", LoadTarget);
window.addEventListener("beforeunload", (event) => { if (editor?.dirty.size) { event.preventDefault(); event.returnValue = ""; } });
window.addEventListener("pagehide", () => {
  editor?.Dispose();
  LiveContext()?.Close?.();
}, { once: true });
let last = performance.now();
function Frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (editor && !switching) {
    if (!live) editor.system.Update(dt, { x: 0, y: 0, z: 0 });
    editor.Update(dt);
    if (live && live.sceneId && !switching) select.value = `${live.targetKind}/${live.sceneId}`;
  }
  requestAnimationFrame(Frame);
}
requestAnimationFrame(Frame);
LoadTarget();
