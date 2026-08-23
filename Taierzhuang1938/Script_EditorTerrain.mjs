// 地形编辑器：从原来的“场景 / 地形”混合面板里单独拆出的地形职责。
//
// 它仍然复用 SceneEditor 的共享叠加文档、关卡搬家、解析高程补丁和网格笔刷，
// 但不暴露构件库、放置、挪动或删除入口。共享文档中的构件只作为贴地参照显示；
// 笔刷改变地高时，它们的可见节点即时抬升，松手后碰撞盒也按新高度重建。

import { SceneEditor } from "./Script_EditorScene.mjs";

export class TerrainEditor extends SceneEditor {
  static id = "terrain";
  static label = "地形编辑器";
  static hint = "专门抬高、压低、挖坑与抹平；放置物随地高同步";
  static panelTitle = "地形编辑器";
  static panelSub = "WASD+QE 飞 · 左键涂 · 右键转头";

  constructor(host) {
    super(host);
    this.supportsTerrain = true;
    this.mode = "terrain";
  }

  BuildUi(body) {
    this.BuildLevelUi(body);
    this.BuildCameraUi(body, ["terrain", "look"]);
    this.BuildTerrainUi(body);
    this.BuildStorageUi(body);
    this.BuildStatsUi(body);
  }
}

export default TerrainEditor;
