// 机位：三种视角 + 跟随弹簧 + 手抖 + 呼吸。
//
// 三档视角各解决一个问题：
//  · `canal` 内窥视角 —— 相机贴在工具尖后方往里看。这是「可视采耳」的招牌画面，
//    也是本作的主视角：耵聍就在眼前，工具尖就在画面下缘，玩家手上的每个动作
//    都能在画面上看见结果。
//  · `macro` 微距视角 —— 再拉近一点，盯着某一块耵聍看它被一点点刮掉。强迫症专用。
//  · `shop` 店里视角 —— 退到客人侧后方，看整个房间和客人的表情。用于放松、结算。
//
// 「手抖」不是装饰：真实内窥画面永远在轻微晃，完全静止的镜头会让人觉得是贴图。
// 但抖动的频率要压得很低（<1.5Hz 的漂移 + 极小幅高频噪声），否则晕。

import * as THREE from "three";
import { Clamp, Damp, Lerp, Smooth } from "./Script_Util.js";

export const CAMERA_MODES = ["canal", "macro", "shop"];

export function CreateCameraRig({ core, canal } = {}) {
  const { camera, insetCamera } = core;
  const target = new THREE.Vector3();
  const desired = new THREE.Vector3();
  const tmp = new THREE.Vector3();
  const tmpB = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  // FrameAt() 返回的是解剖模块**自己的缓存向量**（不是每次新建）。所以这里必须
  // 拷一份再用：本函数中途会调 canal.Project()，那个调用会把缓存就地覆盖掉，
  // 之后再读 frame.tangent 拿到的已经是别的值——内窥镜头曾经因此一直朝着耳道
  // 外面看，画面全空，而且不报任何错。
  const tangent = new THREE.Vector3();
  const centerUp = new THREE.Vector3();
  const centerRight = new THREE.Vector3();
  const wantDir = new THREE.Vector3();
  const currentDir = new THREE.Vector3();

  const state = {
    mode: "canal",
    prevMode: "canal",
    blend: 1,             // 切换视角时的 0→1 过渡
    backDistance: 7,      // 相机在工具尖后方的距离（mm）
    backTarget: 7,
    focusDepth: 4,
    pullOut: 0,           // shop 视角的拉出量
    shakeAmp: 1,
    tremor: 0,
    stillTime: 0,         // 静止多久（用来做「自动聚焦」的微推近）
    breathe: 0,
    roll: 0,
  };

  const shakeSeed = 1.7;

  /** 极简值噪声：够做手抖了，省一个依赖 */
  function Noise(t, seed) {
    return (
      Math.sin(t * 1.13 + seed) * 0.5 +
      Math.sin(t * 2.31 + seed * 2.7) * 0.3 +
      Math.sin(t * 4.77 + seed * 5.1) * 0.2
    );
  }

  function SetMode(mode) {
    if (!CAMERA_MODES.includes(mode) || mode === state.mode) return state.mode;
    state.prevMode = state.mode;
    state.mode = mode;
    state.blend = 0;
    return state.mode;
  }

  /** 捏合 / 滚轮都在改这个：内窥视角的可视距离 3.5–22mm */
  function Zoom(delta) {
    state.backTarget = Clamp(state.backTarget * Math.exp(-delta * 1.1), 3.5, 22);
  }

  function Update(dt, ctx = {}) {
    const tool = ctx.tool || null;
    const tip = ctx.tip || tmp.set(0, 0, 0);
    const depth = ctx.depth ?? state.focusDepth;
    const speed = ctx.speed ?? 0;
    const spin = ctx.spin ?? 0;

    state.blend = Math.min(1, state.blend + dt / 0.9);
    state.breathe += dt;
    state.tremor += dt;
    // 动得越快，手抖越明显（真实的手持器械就是这样）
    const moveShake = Clamp(speed / 26, 0, 1);
    state.stillTime = speed < 1.2 ? state.stillTime + dt : 0;

    // 停手 1.2 秒后自动轻微推近：像内窥镜在对焦，也给出「看得更细了」的暗示
    const focusPush = state.stillTime > 1.2 ? Math.min(1, (state.stillTime - 1.2) / 2.2) : 0;
    const zoomWanted = state.backTarget - focusPush * 2.6;
    state.backDistance = Damp(state.backDistance, zoomWanted, 0.45, dt);

    const frame = canal?.FrameAt ? canal.FrameAt(Clamp(depth, 0, canal.length || 28)) : null;
    if (frame?.tangent) tangent.copy(frame.tangent); else tangent.set(0, 0, 1);
    if (frame?.up) centerUp.copy(frame.up); else centerUp.copy(up);
    if (frame?.right) centerRight.copy(frame.right); else centerRight.set(1, 0, 0);

    if (state.mode === "canal" || state.mode === "macro") {
      const macro = state.mode === "macro";
      // 相机沿耳道轴定位，而不是在管腔里自由漂：
      //  · 深度 = 工具尖深度 − 可视距离。开局工具尖只在 2.2mm，所以相机会落到
      //    耳道口**外面**（负深度）——这正是真实「往耳朵里看」的机位：耳甲腔
      //    像一圈画框，耳道向里收成一个洞，工具从画面里伸进去。
      //  · 负深度不能喂给 FrameAt（它只管 0…length），所以在耳道口那一帧上
      //    沿切线外推。
      //  · 在管腔里时侧偏要小：管腔半径只有 2.5–3.4mm，偏 1.2mm 以上镜头就贴到
      //    壁上了，画面会被一整片皮肤糊满（实测过）。管外则回到中轴线上。
      const back = macro ? state.backDistance * 0.6 : state.backDistance;
      const rawDepth = depth - back;
      const insideCanal = rawDepth >= 0.9;
      const camDepth = insideCanal ? Clamp(rawDepth, 0.9, Math.max(1.2, (canal?.length || 28) - 1.5)) : 0;
      const camFrame = canal?.FrameAt ? canal.FrameAt(camDepth) : null;
      if (!camFrame?.center) {
        desired.copy(tip).addScaledVector(tangent, -back);
      } else {
        if (camFrame.right) centerRight.copy(camFrame.right); else centerRight.set(1, 0, 0);
        if (camFrame.up) centerUp.copy(camFrame.up); else centerUp.copy(up);
        if (camFrame.tangent) tangent.copy(camFrame.tangent);
        // 中轴线上：管腔只有 2.5–3.4mm 半径，相机的任何侧偏都会让一侧的壁
        // 挤到 1mm 以内、糊满半个画面（实测左右半边死白）。对称的隧道视角
        // 才是内窥镜该有的样子，工具本来就在壁上，不会因为相机居中而消失。
        const lateral = 0;
        const drop = 0;
        desired.copy(camFrame.center)
          .addScaledVector(centerRight, lateral)
          .addScaledVector(centerUp, -drop);
        // 管外：沿切线外推到负深度处（耳甲腔里 / 耳道口外）
        if (!insideCanal) desired.addScaledVector(tangent, rawDepth);
      }
      // 看向**前方中轴线**而不是工具尖：工具贴在壁上，盯着它看会让整个画面
      // 偏向一侧（实测耳道口被挤到画面右半边）。盯着轴心，隧道就居中，
      // 工具自然从画面侧边斜插进来——这正是可视采耳录像里的构图。
      const lookAhead = macro ? 4.5 : 10;
      const lookDepth = Clamp((insideCanal ? camDepth : 0) + lookAhead, 0, canal?.length || 28);
      const lookFrame = canal?.FrameAt ? canal.FrameAt(lookDepth) : null;
      if (lookFrame?.center) target.copy(lookFrame.center);
      else target.copy(tip).addScaledVector(tangent, lookAhead);
      // shop 过渡时从当前位往店里插值
      if (state.blend < 1 && state.prevMode === "shop") {
        const k = 1 - state.blend;
        desired.lerp(ShopPosition(tip, tmpB), k);
        target.lerp(tip, k * 0.6);
      }
    } else {
      // 店里视角：从工具尖往侧后方退开，看客人和整个房间
      const frame = canal?.FrameAt ? canal.FrameAt(Clamp(depth, 0, canal?.length || 28)) : null;
      if (frame?.tangent) tangent.copy(frame.tangent);
      if (frame?.up) centerUp.copy(frame.up);
      desired.copy(ShopPosition(tip, tmpB));
      target.copy(tip);
    }

    // 手抖：低频漂移 + 一点点高频
    const amp = 0.055 * state.shakeAmp * (1 + moveShake * 1.8);
    desired.x += Noise(state.tremor, shakeSeed) * amp;
    desired.y += Noise(state.tremor * 1.31, shakeSeed + 9.4) * amp;
    desired.z += Noise(state.tremor * 0.77, shakeSeed + 21.3) * amp;

    // 呼吸：整机极缓的上下浮动
    const breath = Math.sin(state.breathe * 0.9) * 0.035 + Math.sin(state.breathe * 0.37) * 0.05;
    desired.addScaledVector(centerUp, breath);

    // 跟随弹簧：位置慢一点、朝向快一点，看起来像「手在带镜头」
    const posHalf = state.mode === "shop" ? 0.55 : state.blend < 1 ? 0.4 : 0.13;
    camera.position.x = Damp(camera.position.x, desired.x, posHalf, dt);
    camera.position.y = Damp(camera.position.y, desired.y, posHalf, dt);
    camera.position.z = Damp(camera.position.z, desired.z, posHalf, dt);

    const lookHalf = state.mode === "shop" ? 0.6 : state.blend < 1 ? 0.35 : 0.09;
    const look = ctx.look || target;
    camera.getWorldDirection(currentDir);
    wantDir.copy(look).sub(camera.position);
    if (wantDir.lengthSq() < 1e-9) wantDir.copy(tangent);
    wantDir.normalize();
    currentDir.lerp(wantDir, 1 - Math.exp(-dt / lookHalf)).normalize();
    camera.lookAt(tmp.copy(camera.position).add(currentDir));

    // 工具自转带着镜头轻微侧倾：棉签打圈、镊子转向时会有「代入感」。
    // roll 必须是有状态的——每帧从 0 重新阻尼的话，侧倾会永远追不上目标。
    state.roll = Damp(state.roll, Clamp(-spin * 0.05, -0.13, 0.13), 0.25, dt);
    camera.rotateZ(state.roll + Noise(state.tremor * 0.41, 3.3) * 0.006);

    // 视野：内窥视角要广一点才看得全管壁，且随缩放收窄
    const wantFov = state.mode === "shop"
      ? 42
      : state.mode === "macro"
        ? 34
        : Clamp(56 + (11 - state.backDistance) * 1.4, 40, 68);
    camera.fov = Damp(camera.fov, wantFov, 0.35, dt);
    camera.updateProjectionMatrix();

    if (insetCamera) UpdateInset(dt, ctx);
    return camera;
  }

  const shopOffset = new THREE.Vector3(-118, 46, 62);
  function ShopPosition(tip, out) {
    return out.copy(tip).add(shopOffset);
  }

  /**
   * 画中画：角色小窗。它总是盯着角色的脸，所以哪怕主视角在耳道深处，
   * 玩家也能一眼看到客人舒服得眯起眼睛——这是「解压」闭环里最便宜也最有效的一环。
   */
  function UpdateInset(dt, ctx) {
    const anchor = ctx.faceAnchor || ctx.earAnchor || null;
    if (!anchor) return;
    anchor.getWorldPosition(tmp);
    insetCamera.position.set(tmp.x - 90, tmp.y + 34, tmp.z + 96);
    insetCamera.lookAt(tmp.x, tmp.y + 8, tmp.z);
    insetCamera.updateProjectionMatrix();
  }

  function SetShake(amp) {
    state.shakeAmp = Clamp(amp, 0, 3);
  }

  /** 结算/开场：把镜头缓缓推出去，给一个「呼吸完了」的收尾 */
  function FocusDepth(depth) {
    state.focusDepth = depth;
  }

  return {
    state, SetMode, Update, Zoom, SetShake, FocusDepth,
    get mode() { return state.mode; },
    get backDistance() { return state.backDistance; },
  };
}

export { Smooth, Lerp };
