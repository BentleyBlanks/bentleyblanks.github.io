// 正片关卡里的环境面板（docs/Data_Environment.md §8.7）：高级工具 → 场景 → 「环境」，在 Data_EnvLevels 登记过区域文件的关卡
//（第一关《往南的路》）里打开的是这个叠加层；白盒编辑器里同一个菜单项开的是白盒编辑器自己的面板。
//
// 面板就是 Script_EditorEnvironment 那一个（总览 / 区域 / 预设 / 组件 / 时间轴，撤销重做、存盘、外部改动同步都一样），
// 这里只给游戏这一边的宿主适配器：
//   · 区域文件是 Environment/Level_<Id>.json（kind "level"，存盘口 /__environment/save 认它）；
//   · 「这一拍」是第一关的任务步骤（missionRuntime.flow.phase.id）：写进区域文件的 stages（进撤销栈，点保存落盘），
//     后面的步骤不写沿用前面的（Script_Main.ApplyStageTime 换步骤时按它拨钟）；
//   · 没有飞行观察，不显示「飞过去看」；面板放左边，不压高级工具右侧的 Inspector。
// 叠加层不暂停玩法、不接管相机；keepOnClose：退出高级工具菜单栏后面板还在，边打边调。

import { EnvironmentEditor } from "./Script_EditorEnvironment.mjs";
import { FIRST_LEVEL_STAGES } from "./Data_FirstLevelMissionStages.mjs";

const STEP_ORDER = FIRST_LEVEL_STAGES.flatMap((stage) => stage.steps);

export class EnvironmentGameOverlay {
  static id = "environmentGame";
  static label = "环境";
  static hint = "这一关的区域、预设与昼夜（正片关卡；白盒编辑器里用它自己的环境面板）";
  static keepOnClose = true;

  /** 这一关有没有环境系统可编（区域文件读进来了）。 */
  static Available(host) { return !!host?.environment?.system?.active; }

  constructor(host) {
    this.host = host;
    this.root = null;
    this.editor = null;
  }

  Enter() {
    const env = this.host.environment;
    if (!env?.system?.active) throw new Error("这一关没有登记区域文件（Data_EnvLevels），没有环境可编");
    const game = this.host.game;
    this.root = document.createElement("div");
    this.root.className = "boRoot envGameRoot";
    document.body.appendChild(this.root);
    this.editor = new EnvironmentEditor({
      post: this.host.post, camera: this.host.camera, renderer: this.host.renderer,
      uiRoot: () => this.root,
      setRootClass: (name, on) => this.root.classList.toggle(name, !!on),
      groundAt: (x, z) => game.battlefield?.GroundHeight?.(x, z) ?? 0,
      isLocked: () => !!env.PointerLocked?.(),
      target: () => (env.system.active ? { kind: env.system.targetKind, id: env.system.sceneId } : null),
      fallbackSky: () => game.PHASES?.[game.state?.phaseIndex]?.sky,
      beat: () => {
        const step = env.FirstLevelStep?.();
        if (!step || env.system.targetKind !== "level") return null;
        return {
          kind: "stage", id: step, label: `任务步骤 ${step}`, order: STEP_ORDER, times: { ...(env.system.sceneDoc?.stages || {}) },
          write: (spec) => this.editor.EditScene(spec ? `${step} 写进时间` : `${step} 去掉时间`, (doc) => {
            doc.stages = doc.stages || {};
            if (spec) doc.stages[step] = { ...spec }; else delete doc.stages[step];
          }),
        };
      },
    }, env);
    this.api = this.editor.api;
    this.editor.EnsureLoaded().then(() => this.editor.Open()).catch((error) => console.error("[Environment] 面板读不进来", error));
    return this;
  }

  Update(dt) { this.editor?.Update(dt); }

  Exit() {
    this.editor?.Dispose();
    this.root?.remove();
    this.editor = null;
    this.root = null;
  }
}
