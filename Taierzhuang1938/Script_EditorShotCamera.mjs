// 出图机位：给出图脚本与浏览器测试用的「定住镜头」小工具，不进菜单栏、没有面板内容。
//
// ## 为什么留着它
// 2026-10-31 用户要求删掉旧的场景关卡 / 地形 / 完整场景预览 / 采样点四个工具。
// 采样点编辑器当年顺带担着另一份差事：出图脚本（第一关空间图、白盒 0518 机位、壕沟参考图等）
// 打开它来「暂停玩法 + 接管相机 + 藏视图模型」，再调它的 ApplyPose 把镜头摆到指定位姿；
// 好几支浏览器测试也靠它把玩法停住。这些脚本都还在用，所以只把这一小块留下，其余随采样点一起删。
//
// ## 它做什么
//   · 打开 = 自由飞行相机接管（玩法暂停，同其它高级工具）+ 视图模型藏起来；
//   · ApplyPose(pose) = 把 `{ x, z, y | h, yaw, pitch, fov?, far? }` 原样装到相机上并交回实际落下的数；
//   · 关闭 = 相机投影与视图模型由 FlyCam / 套件还回去。
// 位姿口径与旧采样点编辑器逐字一致：y 是绝对高度，没写 y 就用 地高 + h；yaw 0 朝北（-Z）；
// 没写 fov 退回画质档的出厂值，没写 far 退回 620 m，不沿用上一次改过的那份
//（拍一批图时顺序依赖会让整批不可比）。
//
// 它不是给人用的工具：不列在 Script_Editor 的 TOOL_MENUS 里，只能走
// `Debug.OpenEditor("shotCamera")` 或 `editor.Open("shotCamera")` 打开。

import { Panel, Note } from "./Script_EditorUi.mjs";

/** 位姿里没写 far 时用的远裁剪面（米），与旧采样点编辑器的缺省一致。 */
const DEFAULT_FAR = 620;

export class ShotCameraEditor {
  static id = "shotCamera";
  static label = "出图机位";
  static hint = "出图脚本与测试用：定住相机、藏视图模型、按位姿摆镜头（不在菜单里）";

  constructor(host) {
    this.host = host;
    this.cameraMode = "fly";
    this.panel = null;
  }

  Enter(root) {
    this.host.flycam.Open();
    this.host.SetViewmodelVisible(false);
    this.panel = Panel({
      title: "出图机位",
      sub: "出图脚本与测试专用",
      variant: "work",
      onClose: () => this.host.Close(),
    });
    root.appendChild(this.panel.root);
    Note(this.panel.body, "镜头由脚本调 ApplyPose 摆放；这里没有可调项。");
    return this;
  }

  Exit() {
    this.host.flycam.Close();
    this.host.SetViewmodelVisible(true);
    if (this.panel) this.panel.root.remove();
    this.panel = null;
  }

  Update(dt) {
    this.host.flycam.Update(dt);
    // 换关装配的一环会把视图模型重新点亮
    if (this.host.viewmodel?.root?.visible) this.host.SetViewmodelVisible(false);
  }

  GroundAt(x, z) {
    const field = this.host.game.battlefield;
    const y = field && field.GroundHeight ? field.GroundHeight(x, z) : null;
    return Number.isFinite(y) ? y : 0;
  }

  /**
   * 把一份位姿装到相机上。
   * @param {{id?: string, x: number, z: number, y?: number|null, h?: number|null,
   *   yaw: number, pitch: number, fov?: number|null, far?: number|null,
   *   phase?: *, sky?: *}} pose
   * @returns 真正落到相机上的那几个数（出图清单里要记下来）
   */
  ApplyPose(pose) {
    const camera = this.host.camera;
    const ground = pose.y != null ? null : this.GroundAt(pose.x, pose.z);
    const y = pose.y != null ? pose.y : ground + pose.h;
    camera.position.set(pose.x, y, pose.z);
    this.host.flycam.yaw = pose.yaw;
    this.host.flycam.pitch = pose.pitch;
    camera.rotation.set(pose.pitch, pose.yaw, 0, "YXZ");
    camera.fov = pose.fov != null ? pose.fov : (this.host.game.graphics?.fov ?? 55);
    camera.far = pose.far != null ? pose.far : DEFAULT_FAR;
    camera.updateProjectionMatrix();
    return {
      id: pose.id, x: pose.x, y, z: pose.z,
      yaw: pose.yaw, pitch: pose.pitch,
      fov: camera.fov, far: camera.far, ground,
      phase: pose.phase ?? null, sky: pose.sky || null,
    };
  }
}

export default ShotCameraEditor;
