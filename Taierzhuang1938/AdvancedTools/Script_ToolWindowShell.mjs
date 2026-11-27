// 独立窗口工具的页面外壳：顶部菜单栏（工具名 + 状态字 + 高级工具音量 + 返回控制中心）。
//
// 只用编辑器共用的界面件（Script_EditorUi / Script_EditorVolume 与 Style_Editor 的 #edRoot 样式），
// 不碰游戏运行时。工具的面板照旧是 Panel({variant:"work"})，由 #edRoot 的样式停靠到右侧。

import { El } from "../Script_EditorUi.mjs";
import { LoadToolsVolume, ToolsVolumeControl, ToolsVolumeLevel } from "../Script_EditorVolume.mjs";
import { CONTROL_CENTER_URL } from "./Data_AdvancedTools.mjs";

/**
 * @param {object} options
 *   title   菜单栏左侧的工具名
 *   audio   有 SetMasterVolume 的独立工具音频引擎时挂音量条（读写工具自己的存储键，不碰游戏「声音」设置）
 * → { root, workHost, SetStatus(text), Return() }
 */
export function ToolWindowShell({ title, audio = null } = {}) {
  const root = El("div", "toolsOpen");
  root.id = "edRoot";
  document.body.appendChild(root);
  document.body.classList.add("edToolsOpen", "edHideHud");
  const NativeActivation = (event) => {
    if ((event.key === " " || event.key === "Enter") && event.target.closest?.("button, input, select, textarea")) event.stopPropagation();
  };
  root.addEventListener("keydown", NativeActivation);

  const bar = El("div", "edMenuBar");
  bar.setAttribute("role", "menubar");
  bar.setAttribute("aria-label", title);
  bar.appendChild(El("div", "edMenuBrand", title));
  const status = El("div", "edMenuStatus");
  status.setAttribute("role", "status");
  bar.appendChild(status);

  if (audio?.SetMasterVolume) {
    const volume = LoadToolsVolume(audio.masterVolume ?? 1);
    const Sync = () => audio.SetMasterVolume(ToolsVolumeLevel(volume));
    const control = ToolsVolumeControl(volume, Sync);
    bar.appendChild(control.root);
    Sync();
  }

  const Return = () => window.location.assign(new URL(CONTROL_CENTER_URL, document.baseURI));
  const back = El("button", "edMenuMainMenu", "返回控制中心");
  back.type = "button";
  back.title = "返回 AdvancedTool ControlCenter";
  back.dataset.action = "control-center";
  back.addEventListener("click", Return);
  bar.appendChild(back);
  root.appendChild(bar);

  const workHost = El("div");
  root.appendChild(workHost);
  return {
    root, workHost, Return,
    SetStatus(text) { if (status.textContent !== text) status.textContent = text; },
  };
}
