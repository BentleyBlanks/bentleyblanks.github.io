// 「手」：把手指/鼠标的动作翻译成工具在耳道里的精细运动。
//
// 这是全作手感的核心，所以把设计讲清楚：
//
// ── 坐标系 ──
// 工具尖的位置用耳道的两个参数描述：`depth`（沿管壁走多远）与 `angle`（绕管壁转到几点钟）。
// 半径不用玩家管——工具尖**永远贴着管壁**，因为真实的采耳就是把器械贴着壁刮的。
// 于是玩家手上只有两个自由度，加上「压」「转」「拧」三个修饰量，共五个：
//
//   depth    纵向拖拽（屏幕向上 = 往耳道深处）
//   angle    横向拖拽（屏幕向右 = 绕管壁顺时针）
//   pressure 按住动作键下压；不按时只有很轻的静重力
//   spin     双指拧 / Q E 键 = 工具自转（决定勺口朝哪、镊口能不能夹住）
//   action   按住动作键 = 该工具的本职动作（夹合/捏球/滴液/吸水/敲音叉）
//
// ── 为什么深度和角度分开 ──
// 真实采耳最难的就是「沿着壁走一圈、每一处都刮到」，而不是往深处捅。把绕圈做成
// 独立的一根轴，玩家才能体会到「这一圈还剩三点钟方向没刮」这种细腻的活儿。
//
// ── 朝向 ──
// 工具局部约定：+Z 指向耳道深处，+Y 是「工作面」（勺口朝向 / 镊口张开方向）。
// 工作面必须对着管壁才刮得下东西；`spin` 转错了就只是在壁上蹭——这一条是
// 「专业手法」在游戏里最直接的体现，也是玩家最先学会的一课。

import * as THREE from "three";
import { AngleDelta, Clamp, Damp, Smooth, TAU } from "./Script_Util.js";

/** 一次整屏拖拽对应的进深跨度（mm）。耳道全长 28，所以一屏多一点能走完全程。 */
const DEPTH_PER_SCREEN = 26;
/** 一次整屏横向拖拽对应的绕圈量（弧度）。1.25 圈，手感上刚好能精细定位。 */
const ANGLE_PER_SCREEN = TAU * 1.25;

/** mechanic → 动作键语义 */
const ACTION_BEHAVIOUR = {
  scoop: { label: "下压", press: 0.42, note: "按住把它压实一点，再慢慢带走" },
  rake: { label: "下压", press: 0.36, note: "轻轻耙松，别硬拽" },
  pinch: { label: "夹合", press: 0.0, note: "按住夹住，松开前先退出来" },
  wipe: { label: "压擦", press: 0.30, note: "贴着壁打圈擦，别往里推" },
  sweep: { label: "加压扫", press: 0.16, note: "按住会扫得更密" },
  vibrate: { label: "敲响", press: 0.0, note: "点一下让音叉响起来，再贴上去" },
  spray: { label: "滴液", press: 0.0, note: "按住挤一滴，等它渗开" },
  irrigate: { label: "冲洗", press: 0.0, note: "按住出水，温水会把它冲出来" },
  vacuum: { label: "吸", press: 0.0, note: "按住吸走碎屑" },
  light: { label: "调亮", press: 0.0, note: "按住看得更清楚" },
};

export function CreateHand({ canal, core } = {}) {
  const scene = core?.scene;
  const tmpV = new THREE.Vector3();
  const tmpV2 = new THREE.Vector3();
  const tmpWall = new THREE.Vector3();
  const tmpNormal = new THREE.Vector3();
  const tmpTangent = new THREE.Vector3();
  const tmpUp = new THREE.Vector3();
  const tmpQ = new THREE.Quaternion();
  const basis = new THREE.Matrix4();

  const state = {
    toolId: null,
    // 开局停在 9mm 而不是 2mm：镜头在工具尖后方约 7mm 处，工具尖要够深才留得出
    // 「相机在管腔里」的空间，否则相机只能退到耳道口外，画面就成了一片耳廓特写。
    depth: 9,
    angle: Math.PI * 0.5,          // 从下方（耳道下壁）开局，那里最安全也最好刮
    spin: 0,
    pressure01: 0,
    action01: 0,                    // 动作键的按下程度（0→1 有起落，不是布尔）
    actionHeld: false,
    contact01: 0,                   // 是否真的贴着东西（由 Probe 回填）
    speed: 0,
    spinRate: 0,
    angleError01: 0,
    speedError01: 0,
    tipWorld: new THREE.Vector3(),
    tipNormal: new THREE.Vector3(0, -1, 0),
    lift: 1,                        // 0 = 完全贴壁，1 = 抬离（换工具时抬起）
    vibration01: 0,                 // 音叉余振
    clipKeep: 26,                   // 工具只画到尖端往后这么多毫米（由相机设定）
    _prevDepth: 9,
    _prevAngle: Math.PI * 0.5,
    _prevSpin: 0,
    _dwell: 0,
  };

  let tool = null;                  // { group, spec, tip, axis, Update }
  let toolClipPlane = null;

  function Attach(nextTool) {
    if (tool?.group?.parent) tool.group.parent.remove(tool.group);
    tool = nextTool || null;
    if (!tool) return;
    if (scene) scene.add(tool.group);
  }

  function SetTool(nextTool) {
    if (!nextTool) return;
    // 换工具时把工具抬起来，避免瞬间「跳」到新位置穿模
    state.lift = 1;
    state.spin = 0;
    Attach(nextTool);
    state.toolId = nextTool.spec?.id || null;
    // 工具只渲染前端一段（见下），不这么做的话 150mm 的杆会从相机旁边擦过去
    toolClipPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
    if (core?.renderer) core.renderer.localClippingEnabled = true;
    tool.group.traverse((node) => {
      if (!node.material) return;
      const list = Array.isArray(node.material) ? node.material : [node.material];
      for (const mat of list) {
        mat.clippingPlanes = [toolClipPlane];
        mat.clipShadows = false;
        mat.needsUpdate = true;
      }
    });
    tool.group.visible = true;
  }

  const spec = () => tool?.spec || {};

  function Action() {
    const mech = spec().mechanic || "scoop";
    return ACTION_BEHAVIOUR[mech] || ACTION_BEHAVIOUR.scoop;
  }

  /** 面板/教程用：当前工具的动作键叫什么、提示是什么 */
  function ActionHint() {
    const s = spec();
    const beh = Action();
    return { label: beh.label, note: beh.note, mechanic: s.mechanic || "scoop" };
  }

  /**
   * 每帧推进：吃 Consume() 出来的输入，产出这一帧的工具状态。
   * 返回的对象直接喂给 Wax.Probe() 与 Session.Update()。
   */
  function Update(dt, input = {}, opts = {}) {
    state.updateCalls = (state.updateCalls || 0) + 1;
    const s = spec();
    const length = canal?.length || 28;
    const locked = opts.locked === true;

    // ── 抬离/贴壁的过渡：换工具、视角切换、结算时把工具抽出去 ──
    const wantLift = locked ? 1 : 0;
    state.lift = Damp(state.lift, wantLift, 0.28, dt);

    // ── 深度 ──
    // 屏幕向上（dragY < 0）等于往耳道深处。这是「直接操纵」：手指往上，
    // 画面里的东西就往里走，不需要玩家在脑子里做一次坐标变换。
    const depthDelta = -input.dragY * DEPTH_PER_SCREEN;
    let wantDepth = state.depth + depthDelta;
    // 工具自身的长度决定它最深能到哪（真实里就是「杆不够长了」）
    const maxDepth = Math.min(length - 1.2, (s.idealDepthRange?.[1] ?? 24) + 6);
    wantDepth = Clamp(wantDepth, 0, maxDepth);
    // 拨到危险区时给一点阻尼，让「进去」变难——手感上的警告比文字有效
    if (wantDepth > 21) {
      const overshoot = wantDepth - 21;
      wantDepth = 21 + overshoot * (input.fine ? 0.45 : 0.7);
    }
    state.depth = Damp(state.depth, wantDepth, input.fine ? 0.05 : 0.05, dt);

    // ── 绕圈 ──
    state.angle += input.dragX * ANGLE_PER_SCREEN;
    state.angle = ((state.angle % TAU) + TAU) % TAU;

    // ── 陀螺仪微调：只在开启时叠加，比例压得很小，做「最后 0.1mm」的活 ──
    if (input.gyroX || input.gyroY) {
      state.angle += input.gyroX * dt * 0.55;
      state.depth = Clamp(state.depth - input.gyroY * dt * 0.9, 0, maxDepth);
      state.angle = ((state.angle % TAU) + TAU) % TAU;
    }

    // ── 自转（工作面朝向）──
    const spinDelta = (input.twist || 0) * 2.4;
    state.spin += spinDelta;
    state.spin = ((state.spin % TAU) + TAU) % TAU;

    // ── 动作键 ──
    const held = locked ? false : !!input.actionHeld;
    state.actionHeld = held;
    state.action01 = Damp(state.action01, held ? 1 : 0, held ? 0.06 : 0.16, dt);

    // ── 压力 ──
    // 三个来源：静重力（贴着壁就有一点点）、动作键下压、推进的速度。
    // 速度贡献是刻意的：真实里「捅得快」就等于「用力大」。
    const beh = Action();
    const pressFromAction = state.action01 * (beh.press || 0);
    const prevDepth = state._prevDepth;
    const prevAngle = state._prevAngle;
    const dDepth = Math.abs(state.depth - prevDepth);
    const dAngle = Math.abs(AngleDelta(prevAngle, state.angle)) * (canal?.RadiusAt?.(state.depth, state.angle) || 4);
    const pathLen = Math.hypot(dDepth, dAngle);
    const rawSpeed = dt > 0 ? pathLen / dt : 0;
    state.speed = Smooth(state.speed, rawSpeed, 0.07, dt);

    const velPressure = Clamp(rawSpeed / (s.idealSpeedRange?.[1] ?? 14) / 2.4, 0, 0.75);
    const wantPressure = clamped01(0.06 + pressFromAction + velPressure * 0.55);
    state.pressure01 = Smooth(state.pressure01, wantPressure, 0.05, dt);

    // ── 相对管壁的角度误差：工作面 vs 管壁外法线 ──
    // 把差值折算成 0..1，spec.faceSensitivity 高的工具（勺子、镊子）对朝向挑剔，
    // 鹅毛这种无所谓。
    const faceSens = s.faceSensitivity ?? DefaultFaceSensitivity(s.mechanic);
    let faceErr = 0;
    if (faceSens > 0.01) {
      // 工作面 = 旋转 spin 之后的「朝向管壁」方向；理想是正对壁面。
      // 管壁那一侧的方向在参数域里永远等价于 spin = 0，所以误差就是 spin 折到 ±90° 的偏移。
      const folded = Math.abs(AngleDelta(0, state.spin * 2) ) / Math.PI;   // 0..1
      faceErr = Clamp(folded, 0, 1);
    }
    state.angleError01 = Smooth(state.angleError01, faceErr, 0.12, dt);
    state.speedError01 = s.idealSpeedRange
      ? SpeedError(state.speed, s.idealSpeedRange)
      : 0;

    // ── 音叉余振 ──
    state.vibration01 = Math.max(0, state.vibration01 - dt * 0.35);

    state.spinRate = Smooth(state.spinRate, dt > 0 ? AngleDelta(state._prevSpin, state.spin) / dt : 0, 0.08, dt);
    state._prevDepth = state.depth;
    state._prevAngle = state.angle;
    state._prevSpin = state.spin;
    state._dwell = rawSpeed < 1.2 ? state._dwell + dt : 0;

    Place(dt);

    // 工具自己的动态部件（羽毛摆动、镊子开合、音叉抖动）
    tool?.Update?.(dt, {
      active01: state.lift < 0.5 ? 1 : 0,
      vibration01: state.vibration01,
      squeeze01: state.action01,
      speed01: Clamp(state.speed / 20, 0, 1),
      pressure01: state.pressure01,
    });

    return {
      depth: state.depth,
      angle: state.angle,
      spin: state.spin,
      pressure01: state.pressure01,
      action01: state.action01,
      actionHeld: held,
      speed: state.speed,
      spinRate: state.spinRate,
      angleError01: state.angleError01,
      speedError01: state.speedError01,
      tipWorld: state.tipWorld,
      tipNormal: state.tipNormal,
      dwell: state._dwell,
      tool,
      spec: s,
    };
  }

  /**
   * 把工具摆到 (depth, angle) 对应的管壁位置上。
   *
   * 工具尖在世界里的落点 = 管壁上那一点 + 内法线 × (tipRadius + 抬离量)。
   * 朝向用一个显式基：+Z = 耳道切线（指向深处），+Y = 工作面（对着管壁，
   * 被 spin 转过），X = Y × Z。这样朝向完全由物理量决定，不依赖工具网格
   * 在建模时的朝向——换一把工具不会突然变成横的。
   */
  function Place(dt) {
    state.placeCalls = (state.placeCalls || 0) + 1;
    if (!tool?.group) { state.placeSkipped = (state.placeSkipped || 0) + 1; return; }
    const R = (p, a) => (canal?.RadiusAt ? canal.RadiusAt(p, a) : 4);
    const tipR = tool.tipRadius ?? spec().tipRadiusMm ?? 0.6;

    // canal 的这四个函数返回的是**它自己的缓存向量**，不是新建对象。也就是说
    // 后一次调用会把前一次的结果就地改掉。所以这里必须立刻拷进本地向量，
    // 不能直接持有返回值——否则 wallPoint 会在下一次 canal 调用后变成别的东西。
    if (canal?.PointAt) tmpWall.copy(canal.PointAt(state.depth, state.angle, 0));
    else tmpWall.set(0, 0, 0);
    if (canal?.NormalAt) tmpNormal.copy(canal.NormalAt(state.depth, state.angle));
    else tmpNormal.set(0, -1, 0);        // 内法线：从壁指向管腔中心
    const wallPoint = tmpWall;
    const normal = tmpNormal;

    // 抬离：换工具时抽出来，避免新工具凭空出现在壁里
    const gap = tipR + state.lift * Math.max(3.5, R(state.depth, state.angle) * 0.9);
    const tipPos = state.tipWorld.copy(wallPoint).addScaledVector(normal, gap);

    // 最小痕迹：Place 每一步的中间量。存成裸数字（不是向量引用），所以即使
    // canal 的实现返回共享缓存也trace是准的。「工具不见了」这类问题没有它
    // 只能靠猜——内窥视角里工具消失过一次，代价就是这一行。
    state.lastPlace = {
      depth: N(state.depth), angle: N(state.angle), lift: N(state.lift),
      wall: [N(wallPoint.x), N(wallPoint.y), N(wallPoint.z)],
      normal: [N(normal.x), N(normal.y), N(normal.z)],
      gap: N(gap), tipR: N(tipR), radius: N(R(state.depth, state.angle)),
      tip: [N(tipPos.x), N(tipPos.y), N(tipPos.z)],
    };

    const frame = canal?.FrameAt ? canal.FrameAt(state.depth) : null;
    if (frame?.tangent) tmpTangent.copy(frame.tangent); else tmpTangent.set(0, 0, 1);
    if (frame?.up) tmpUp.copy(frame.up); else tmpUp.set(0, 1, 0);
    const tangent = tmpTangent;
    const frameUp = tmpUp;

    // 工作面：对着管壁（= 内法线的反方向），再被 spin 绕切线转过去
    const face = normal.clone().negate();
    const spinQ = new THREE.Quaternion().setFromAxisAngle(tangent, state.spin);
    face.applyQuaternion(spinQ);
    // 正交化：face 可能与 tangent 有微小夹角，去掉切向分量
    face.addScaledVector(tangent, -face.dot(tangent));
    if (face.lengthSq() < 1e-6) face.copy(frameUp);
    face.normalize();

    const xAxis = new THREE.Vector3().crossVectors(face, tangent).normalize();
    basis.makeBasis(xAxis, face, tangent);
    tmpQ.setFromRotationMatrix(basis);
    tool.group.quaternion.copy(tmpQ);

    // tip 在模型里未必在原点，按它的局部位置把整把工具反推回去
    if (tool.tip) {
      tool.tip.updateMatrix();
      const localTip = new THREE.Vector3().setFromMatrixPosition(tool.tip.matrix);
      tool.group.position.copy(tipPos).sub(localTip.clone().applyQuaternion(tmpQ));
    } else {
      tool.group.position.copy(tipPos);
    }

    state.tipNormal.copy(face);

    // 工具只画到尖端往后 `clipKeep` 毫米：更远的部分会从内窥相机旁边擦过去，
    // 直接穿模。这个值由相机每帧告诉它（相机在管腔里，只有它知道自己在哪）。
    if (toolClipPlane) {
      const keepBack = state.clipKeep;
      toolClipPlane.normal.copy(tangent);
      toolClipPlane.constant = -tangent.dot(tmpV.copy(tipPos).addScaledVector(tangent, -keepBack));
    }
  }

  /**
   * 告诉「手」只渲染工具前多少毫米。
   * 内窥相机的近平面是 0.05mm，一把 150mm 的器械会从相机旁边（甚至相机位置）
   * 穿过去，画面上就是一根糊满屏幕的柱子。裁在相机前面一点，看起来就像器械
   * 从画面侧边伸进来——这正是真实可视采耳的样子。
   */
  function SetClipKeep(mm) {
    state.clipKeep = Clamp(mm, 3, 400);
  }

  /** 结算/开场用：把工具完全抽出来并停用 */
  function Retract() { state.lift = 1; }
  function Engage() { state.lift = 0; }

  function Reset() {
    state.depth = 9;
    state.angle = Math.PI * 0.5;
    state.spin = 0;
    state.speed = 0;
    state._prevDepth = state.depth;
    state._prevAngle = state.angle;
    state._prevSpin = 0;
    state._dwell = 0;
    state.vibration01 = 0;
  }

  /** 动作键按下瞬间：音叉要「敲」、滴耳液要「挤一滴」，这类是一次性事件 */
  function OnActionStart() {
    const mech = spec().mechanic;
    if (mech === "vibrate") state.vibration01 = 1;
    return mech;
  }

  return {
    state, SetTool, Update, Reset, Retract, Engage, ActionHint, OnActionStart, SetClipKeep,
    get tool() { return tool; },
    get spec() { return spec(); },
    get tip() { return state.tipWorld; },
    get clipPlane() { return toolClipPlane; },
  };
}

function clamped01(v) { return Clamp(v, 0, 1); }

/** 痕迹里一律保留 3 位小数：NaN 会如实变成字符串 "NaN"，比 JSON 的 null 好认 */
function N(v) { return typeof v === "number" ? Number(v.toFixed(3)) : String(v); }

function DefaultFaceSensitivity(mech) {
  switch (mech) {
    case "scoop": return 0.85;
    case "rake": return 0.7;
    case "pinch": return 0.95;
    case "wipe": return 0.4;
    case "sweep": return 0.12;
    case "vibrate": return 0.2;
    case "vacuum": return 0.3;
    default: return 0.25;
  }
}

/** 偏离理想速度范围多少（0 = 正好，1 = 完全跑偏） */
function SpeedError(speed, range) {
  const [lo, hi] = range;
  if (speed < lo) return Clamp((lo - speed) / Math.max(1, lo), 0, 1);
  if (speed > hi) return Clamp((speed - hi) / Math.max(1, hi), 0, 1);
  return 0;
}
