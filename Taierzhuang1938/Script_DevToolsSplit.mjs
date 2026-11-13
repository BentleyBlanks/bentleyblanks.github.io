// 开发工具拆分边界（游戏宿主那一半）：已拆进 AdvancedTools/ 的 15 个高级工具类的唯一入口。
//
// 游戏目录里的运行时代码只有这个模块可以 import ./AdvancedTools/（方向规则：AdvancedTools → 游戏，
// 不许反过来；index.html 的 import map 里登记它引到的模块）。Script_Editor 把这组类并进自己的菜单与互斥表，
// 游戏里的入口行为与拆分前一致。线上发布恒换成 Script_DevToolsSplitStub.mjs（空数组），这 15 项随之从菜单消失。
// 为什么分两个边界模块见 Data_DevToolsSplit.mjs。守门：Script_DevToolsIsolationTest.mjs。

import { SplineEntry, PropPcgEntry } from "./AdvancedTools/Script_EditorPcgEntry.mjs";
import { SceneEditorEntry } from "./AdvancedTools/Script_EditorSceneEntry.mjs";
import { LevelFlowEntry } from "./AdvancedTools/Script_EditorLevelFlow.mjs";
import { SquadMarchEditor } from "./AdvancedTools/Script_EditorSquadMarch.mjs";
import { ActorEditor } from "./AdvancedTools/Script_EditorActor.mjs";
import { FacialEditor } from "./AdvancedTools/Script_EditorFacial.mjs";
import { MixamoPreviewEditor } from "./AdvancedTools/Script_EditorMixamoPreview.mjs";
import { WeaponEditor } from "./AdvancedTools/Script_EditorWeapon.mjs";
import { FirstPersonEditor } from "./AdvancedTools/Script_EditorFirstPerson.mjs";
import { VfxEditor } from "./AdvancedTools/Script_EditorVfx.mjs";
import { AudioEditor } from "./AdvancedTools/Script_EditorAudio.mjs";
import { PropLibraryEditor } from "./AdvancedTools/Script_EditorPropLibrary.mjs";
import { AssetStandardsEditor } from "./AdvancedTools/Script_EditorAssetStandards.mjs";
import { TextureEditor } from "./AdvancedTools/Script_EditorTextures.mjs";

/** 已拆出去的工具类（id 与 Data_DevTools.TOOL_INFO 里 split: true 的条目一一对应）。剔除版是空数组。 */
export const SPLIT_TOOL_CLASSES = Object.freeze([
  SplineEntry, PropPcgEntry, SceneEditorEntry, LevelFlowEntry, SquadMarchEditor, ActorEditor, FacialEditor, MixamoPreviewEditor,
  WeaponEditor, FirstPersonEditor, VfxEditor, AudioEditor, PropLibraryEditor, AssetStandardsEditor, TextureEditor,
]);
