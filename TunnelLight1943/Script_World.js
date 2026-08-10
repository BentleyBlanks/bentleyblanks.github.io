// 《地道里的光》 —— Three.js 2D 渲染层（正交相机 + 手绘贴图精灵）。
// 画面是纯 2D：所有形体由 Script_Art 的手绘矢量画笔烘到离屏 canvas，
// 再作为带透明通道的平面贴图挂进 Three 场景。留在 Three 里是为了保留
// 混合模式、加色光晕、暗场遮罩与后续着色器的自由度。
//
// 层次（z 越小越远）：远山 -30 / 远房 -20 / 近树 -12 / 玩法层 0 / 前景 +6 / 过肩前景 +9
// 视差：正交投影下由渲染层每帧按 parallax 系数手动偏移各层容器。

import * as THREE from "three";
import { SCENES, CHAPTERS, SURFACE_Y, UNDER_Y, CurrentBeatDef, GetBeatTarget, EdgeHint, SmokeCovers, TunnelPosture, POSTURE_HEAD, VISION_RANGE, VisionScale, COVER_PAD, WINCH_HUB_Y, WINCH_CRANK_R, WINCH_REST_A, HouseSpan, IndoorOpen } from "./Script_Core.mjs";
import * as ART from "./Script_Art.mjs";
import { CreateRig, PoseRig, HandPoint, ElbowPoint, ShoulderPoint, LimbTips, BODY_SCALE } from "./Script_Rig.mjs";
import { BuildOccluder, CreateOccludedLight, SceneOccluders } from "./Script_Light.mjs";
import { CreateTunnelFluid } from "./Script_Fluid.mjs";
import { MoodAt, DipAt, LIGHT_FADE } from "./Data_DayCycle.mjs";
import {
  BAND, ACTOR_Z, ACTOR_SHADOW_Z, CARRY_Z, NEAR_CLUTTER, RankDz,
  CheckBandZ, DepthViolations, PlaceZ, CAM_FOV,
} from "./Data_DepthSpec.mjs";
// 物体的坐标/尺寸来自 Data_Scenes.json，贴图与深度带来自 Data_PropArt.json；
// 这里只负责"照着数据把它烘出来放好"，不再自己写死尺寸与 z
import { PPM, SS, SpriteOf, CoverBandOf } from "./Data_Scenes.mjs";

const PROP_SS = SS.prop;     // 道具/遮蔽物的贴图超采样倍率（特写不糊）
const DETAIL_SS = SS.detail; // 塌方堆、油灯这类会被特写到的小件
// 世界内提示（气泡/目标标 / 人字标 / 楔子特写）：它们巴掌大，却总在过肩特写
// 里出镜——3.2m 景别下画面密度到 600px/米，1x 烘出来必糊，一律走这个倍率
// （档位数值在 Data_Scenes.mjs 的 SS.hint，实测 12 才顶得住特写）
const HINT_SS = SS.hint;
// 石笔那一拍是 2.9m 的特写（屏幕密度 ~330px/米，是 48px/米 标尺的七倍），
// 笔与刻痕都得按这个密度烘，否则一放大就是两团糊的白斑
const CHALK_SS = 8;
const SCRIBE_SS = 3;
// 石笔的世界尺寸：26×30 的贴图 ×0.22 ≈ 12×14cm 的画布，里面那支笔约 9cm 长——
// 巴掌里攥得住的东西。别再让它长回 40cm。
const CHALK_SCALE = 0.22;
// 定向绳的半宽（米）：真麻绳才两三厘米，但那在屏幕上不到两个像素，趴在土路上
// 根本看不见。7 厘米粗是"看得出是绳"的下限，同辘轳井绳一个量级
const ROPE_HALF = 0.035;
// 人物要顶得住特写：按 2.6 倍超采样烘焙，世界尺寸不变，只是贴图更密


// ---------------------------------------------------------------------------
// 贴图烘焙
// ---------------------------------------------------------------------------
function MakeCanvas(w, h) {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return c;
}

function CanvasTexture(canvas) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 4;
  return tex;
}

// 把一段绘制烘成 sprite：drawFn(ctx, originX, groundY) 以 (originX, groundY) 为地面锚点
// blur：假景深——越远的层烘焙时糊得越厉害，前景也糊一点
// ss：超采样倍率。调用处仍按 48px/米 标注尺寸，内部把画布加密 ss 倍，
// 世界尺寸不变、贴图密度变高 —— 特写推到 480px/米 也不糊。
function BakeSprite(wPx, hPx, anchorX, groundYPx, drawFn, blur = 0, ss = 1, haze = null) {
  const canvas = MakeCanvas(wPx * ss, hPx * ss);
  const ctx = canvas.getContext("2d");
  ctx.scale(ss, ss);
  if (blur > 0) ctx.filter = `blur(${blur}px)`;
  drawFn(ctx, anchorX, groundYPx);
  ctx.filter = "none";
  // 空气透视：只染这一张精灵本身（source-atop），不是往画面上盖一层雾
  if (haze && haze.amount > 0) {
    ctx.globalCompositeOperation = "source-atop";
    ctx.globalAlpha = haze.amount;
    ctx.fillStyle = haze.color;
    ctx.fillRect(0, 0, wPx, hPx);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  }
  const tex = CanvasTexture(canvas);
  const geo = new THREE.PlaneGeometry(wPx / PPM, hPx / PPM);
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false });
  const mesh = new THREE.Mesh(geo, mat);
  // 让世界坐标 (x, y) 对应贴图里的 (anchorX, groundYPx)
  mesh.userData.offset = {
    x: (wPx / 2 - anchorX) / PPM,
    y: (groundYPx - hPx / 2) / PPM,
  };
  return mesh;
}

// 摇辘轳那一拍：摇把握手的**世界坐标** → 骨架**局部坐标**（Rig 拿它反解前手）。
// 骨架挂在 (p.x, 地平线+lift) 上、整体缩放 bodyScale、朝向 −1 时整组镜像，
// 所以换算要除以缩放、再按朝向翻 x。三条输入路（鼠标绕圈/键盘/脱手倒转）
// 共用 Core 算好的那一份 gripX/gripY，World 绝不另算一遍摇把在哪儿。
function CrankAimLocal(state, p, bs) {
  const wv = state.winchView;
  if (!wv || !wv.hooked || p.pose !== "crank" || !bs) return null;
  const groundY = (p.level === "under" ? UNDER_Y : SURFACE_Y) + (p.lift || 0);
  return {
    x: ((wv.gripX - p.x) / bs) * (p.heading >= 0 ? 1 : -1),
    y: (wv.gripY - groundY) / bs,
  };
}

function PlaceSprite(mesh, x, y, z) {
  mesh.position.set(x + mesh.userData.offset.x, y + mesh.userData.offset.y, z);
  mesh.userData.anchor = { x, y, z };
}

// 会掉头的贴图（独轮车这类有正反的家伙）：dir<0 时整张左右翻。
// 镜像是绕**网格中心**发生的，所以锚点相对中心的偏移也得跟着翻号，
// 否则车把一翻面、车身就整体平移出去半米。
function PlaceSpriteFlip(mesh, x, y, z, dir) {
  const s = dir < 0 ? -1 : 1;
  mesh.scale.x = s;
  mesh.position.set(x + mesh.userData.offset.x * s, y + mesh.userData.offset.y, z);
  mesh.userData.anchor = { x, y, z };
}

// 缩放时保持地面锚点不动（否则远景会整体浮起来）
function ScaleKeepGround(mesh, sx, sy = sx) {
  mesh.scale.set(sx, sy, 1);
  const h = mesh.geometry.parameters.height;
  const w = mesh.geometry.parameters.width;
  const a = mesh.userData.anchor;
  mesh.position.set(
    a.x + mesh.userData.offset.x * sx + (w / 2) * 0 ,
    a.y + mesh.userData.offset.y * sy,
    a.z,
  );
  // offset.y 是"锚点到中心"的距离，按 sy 缩放后即可保持贴地
  void h;
}

// 同一只桶，一路上换了好几个叫法：链上是「空水桶」→「一桶水」，娘手里那只
// 叫「桶」。哪张表漏认一个，桶就会被当成木料——横长条画布裁掉半只，还扛到肩上
// 顶在脑袋上。所以只此一处列全，画布与挂点都从这里取。
const BUCKETS = ["水桶", "空水桶", "桶", "空桶", "满桶水", "一桶水"];

// 长家伙：也在手上，只是贴图要顺着前臂转（手臂一伸一屈，锯就一进一出）
const ALONG_ARM = ["锯", "锄头", "步枪", "扫帚", "军刀", "木槌"];
// 长家伙不都跟前臂**共线**：扫帚攥在手心里是斜的——柄比前臂平一档，帚苗才够得
// 着身前的地。共线的话柄的上半截就叠在小臂上直戳脑袋，看着是根倚在身上的杆子。
// 偏角（弧度）绕握点转，握点仍钉在手心；朝向翻转时符号跟着翻
const ARM_TOOL_TILT = { "扫帚": 0.42 };
// 提在手里 vs 扛在肩上：贴图挂点（HandPoint/ShoulderPoint）与姿势（Rig 的
// hold/carry 两支）都看它，一处判定两处用，免得挂点和姿势各说各话。
const HAND_HELD = [...BUCKETS, ...ALONG_ARM, "刨子", "石子", "窝头", "铃铛", "柴刀",
  "麻绳", "绳头", "花布巾", "鞭炮", "一挂鞭炮", "铁皮桶",
  "土筐", "粮袋", "种子粮", "名册", "保甲册", "木楔"];
// 襁褓不在 HAND_HELD 里：抱在怀里走 carry（肩挂）那一档，贴身而不是拎着晃
// 手里那件有多沉：0=拎块石子（几乎还是空手走），1=满满一桶水（人是另一个样子）。
// Rig 的 hold 姿势按它插值——不列的按小件算。
const HOLD_WEIGHT = {
  "满桶水": 1, "一桶水": 1, "桶": 0.9, "铁皮桶": 0.55,
  "水桶": 0.5, "空水桶": 0.42, "空桶": 0.42,
  "锄头": 0.45, "锯": 0.4, "步枪": 0.4, "扫帚": 0.3, "刨子": 0.3, "麻绳": 0.25, "柴刀": 0.2,
  "绳头": 0.12,          // 手里只有一截绳梢，绳的分量在地上那一长条上，不在手上
  "军刀": 0.25, "木槌": 0.3,
  "土筐": 0.8, "粮袋": 0.7, "种子粮": 0.7, "名册": 0.15, "保甲册": 0.15, "木楔": 0.05,
};
const IsHandHeld = (label) => !!label && HAND_HELD.includes(label);
// 姿势进度（Rig 的 poseK）由**姿势名**挑驱动它的那个字段，不许拿 ?? 串下来：
// vaultT/vaultK 一落地就停在 0，而 `0 ?? x` 取的正是 0——串起来的话，
// 刨料的推程（poseU）和投石的拉弓量（poseK）永远传不到画面上，
// 两个"由进度驱动"的姿势都被钉死在起手那一格。这条坑过一次，别再改回去。
function PoseProgress(o) {
  if (o.pose === "vault" || o.pose === "clamber") return o.vaultK;
  // 刨料的推程 / 摇辘轳的摇把相位 / 接绳的拽劲，都走 poseU
  if (o.pose === "planePush" || o.pose === "crank" || o.pose === "knotPull") return o.poseU;
  return o.poseK;
}
const HoldWeight = (label) => HOLD_WEIGHT[label] ?? 0.15;

// ---------------------------------------------------------------------------
// 人物精灵图集：每种角色一条横向帧带（8 走 + 站 + 蹲）
// ---------------------------------------------------------------------------
// 扛着的物件（单独一张小贴图，跟着手走）
function MakeCarryMesh(label) {
  // 木料/门板/顶木是横长条；桶是小方块；长家伙（锯/锄头）竖着画（顺前臂方向）；
  // 其余小件给一块方画布免得圆形图案被裁
  const ROUND = ["石子", "窝头", "铃铛", "柴刀", "麻绳", "绳头", "花布巾", "鞭炮", "一挂鞭炮",
    ...BUCKETS, "棉被", "湿棉被", "铁皮桶", "刨子"];
  // 收窄后的画幅，别再给一根柱子留地方。
  // **锚点在画布正中**（BakeSprite 传的是 wPx/2, hPx/2），所以画布必须比
  // "握点到最远端 × 2" 还高，否则画笔画出界被裁。步枪的握点在护木上，
  // 刺刀尖离握点 1.18m＝56.6px，所以半高至少 57 → 120。
  const TALL = { "锯": [52, 80], "锄头": [48, 100], "步枪": [46, 120], "扫帚": [44, 92], "军刀": [34, 72], "木槌": [24, 60] };
  const wPx = TALL[label]?.[0] ?? (label === "水桶" ? 46 : ROUND.includes(label) ? 90 : 120);
  const hPx = TALL[label]?.[1] ?? (label === "水桶" ? 42 : ROUND.includes(label) ? 76 : 30);
  return BakeSprite(wPx, hPx, wPx / 2, hPx / 2, (ctx, ax, ay) => {
    ART.DrawCarry(ctx, ax, ay - (label === "水桶" ? 8 : 0), 1.5, 1, label);
  }, 0, DETAIL_SS);
}

// 落地道具：同一支 DrawCarry 画笔，但锚点必须真的踩在贴图内容的最低像素上
// ——每种道具画的高矮不一样，靠扫 alpha 找底边，落地才不会悬空/陷土
//（深度规范：落地物贴图底边=地平线，y 不许为了好看手动抬）。
function MakeGroundItemMesh(label) {
  const wPx = 96, hPx = 84, ss = DETAIL_SS;
  const canvas = MakeCanvas(wPx * ss, hPx * ss);
  const ctx = canvas.getContext("2d");
  ctx.scale(ss, ss);
  ART.DrawCarry(ctx, wPx / 2, hPx * 0.58, 2.0, 1, label);
  // 扫内容底边（隔行抽样够用：只是找最低的不透明行）
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  let bottomPx = hPx * ss;
  for (let y = canvas.height - 1; y >= 0; y -= 1) {
    let hit = false;
    for (let x = 0; x < canvas.width; x += 3) {
      if (data[(y * canvas.width + x) * 4 + 3] > 14) { hit = true; break; }
    }
    if (hit) { bottomPx = y + 1; break; }
  }
  const tex = CanvasTexture(canvas);
  const geo = new THREE.PlaneGeometry(wPx / PPM, hPx / PPM);
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false });
  const mesh = new THREE.Mesh(geo, mat);
  // 世界锚点 (x, y) 对准贴图 (wPx/2, 内容底边)
  mesh.userData.offset = { x: 0, y: (bottomPx / ss - hPx / 2) / PPM };
  return mesh;
}

// 独轮车上的一车料怎么摆：前两件是旧门板（平摞），第三件是枣木杠（圆杠压顶）
const BarrowLoad = (n) => ({ planks: Math.min(2, n), pole: n >= 3 });

// ---------------------------------------------------------------------------
export function CreateWorld(canvasEl) {
  const renderer = new THREE.WebGLRenderer({ canvas: canvasEl, antialias: true, alpha: false });
  // 浏览器直接播放的 MP4 是 BT.709/sRGB 显示内容。序章把同一帧上传成
  // VideoTexture 时也必须显式声明 sRGB；否则 Three 会把它当线性数据再做一次
  // 输出变换，网页里的对比度和独立播放原片就会明显不同。
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  const scene = new THREE.Scene();
  // 小视角透视相机：画面元素全是 2D 贴图，但分布在不同 z 上——
  // 近大远小、地面向后退、视差随镜头推拉变化，2.5D 的纵深感由此而来。
  const FOV = CAM_FOV;
  const camera = new THREE.PerspectiveCamera(FOV, 16 / 9, 0.5, 400);
  // 参考机位距离：各层贴图按 (D_REF + z深度)/D_REF 预放大，保证默认景别下比例正确
  const D_REF = 24;

  // 视差层容器
  const layers = {
    sky: new THREE.Group(),        // 天光
    ridge: new THREE.Group(),      // 最远的山脊（糊得最厉害）
    hills: new THREE.Group(),      // 远山
    farTown: new THREE.Group(),    // 远处的村落
    midTrees: new THREE.Group(),   // 中景树列
    nearTrees: new THREE.Group(),  // 近景树
    play: new THREE.Group(),       // 玩法层（清晰）
    fore: new THREE.Group(),       // 前景（掠过镜头，微糊）
    fx: new THREE.Group(),
    ots: new THREE.Group(),        // 过肩前景
  };
  const LAYER_Z = {
    sky: -150, ridge: -62, hills: -44, farTown: -26, midTrees: -15,
    nearTrees: -7.5, play: 0, fore: 3.4, fx: 0, ots: 12,
  };
  // 透视补偿：整层按 (D_REF - z)/D_REF 放大，于是每个元素仍落在作者标注的
  // 世界坐标与尺寸上，只是移动速率按透视自然变慢——经典视差，且随推拉变化
  const LAYER_COMP = {};
  for (const k of Object.keys(LAYER_Z)) LAYER_COMP[k] = (D_REF - LAYER_Z[k]) / D_REF;
  // 假景深：离玩法层越远，烘焙时越糊
  const LAYER_BLUR = { ridge: 3.2, hills: 2.2, farTown: 1.3, midTrees: 0.7, nearTrees: 0.25, fore: 1.6 };
  // 空气透视：越远越向雾色靠拢——在烘焙时染进贴图，见 BakeSprite 的 haze 参数
  const LAYER_FADE = { ridge: 0.62, hills: 0.48, farTown: 0.34, midTrees: 0.20, nearTrees: 0.09, play: 0, fore: 0.26 };
  let hazeColor = "#e2d8bc";
  const HazeFor = (key) => (LAYER_FADE[key] ? { color: hazeColor, amount: LAYER_FADE[key] } : null);
  // **空气透视只许用染色，不许用半透明。** haze 是 source-atop 染在精灵自己
  // 身上的，颜色推向雾色而精灵仍是实心；material.opacity 则让身后的东西透过来——
  // 远村的房子里透出一座炮楼、炮楼里透出一间房，糊成一坨（2026-08-07 用户截图）。
  // 旧的 (opacity a, haze f) 折算成等效的纯染色：f' = f + (1-a)(1-f)。
  const HazeSolid = (key, oldAlpha = 1, scale = 1) => {
    const f = Math.min(0.95, (LAYER_FADE[key] || 0) * scale);
    const amount = Math.min(0.88, f + (1 - oldAlpha) * (1 - f));
    return amount > 0.001 ? { color: hazeColor, amount } : null;
  };

  for (const k of Object.keys(layers)) {
    layers[k].position.z = LAYER_Z[k];
    layers[k].scale.setScalar(LAYER_COMP[k]);
    scene.add(layers[k]);
  }

  // ===========================================================================
  // Z 轴分配规范（唯一事实来源）
  //
  // 画面全是半透明贴图、都不写深度缓冲，先后完全由绘制顺序决定。绘制顺序 =
  // renderOrder（层基数 + 层内深度），不再依赖 three.js 按中心点的自动排序，
  // 免得同层元素在镜头推拉时前后翻面。
  //
  // 层间：见 LAYER_ORDER。层内（play 层，世界单位，+ 为靠近镜头）：
  //   -6.0 ~ -1.0   大体量背景建筑（房屋/牢房/炮楼/围墙/树）
  //   -0.9 ~ -0.2   紧贴行走线之后的物件（门框/庄稼/灯杆/柴垛/井台/磨盘）
  //    0.0          行走线：地面、地道剖面、固定在地上的道具
  //   +0.3          落地/待拾的活动道具（放下的桶、链上的待拾物）：压在行走
  //                 线道具之前、演员之后——玩家放下的东西必须永远看得见
  //   +0.6          演员：玩家与所有 NPC —— 永远在行走线物件之前
  //   +0.8          演员携带物（木料/水桶），跟着演员走
  //   +1.2 ~ +2.4   有意遮挡演员的近处物件；硬性约束：只允许 ≤1.2m 的矮物件
  //                 进这一段，高过腰的东西（草垛/断墙/树丛）一律退到负值，
  //                 否则会把人整个吞掉。
  //   ≥ +3.4        fore 层：真前景，成片掠过镜头
  //
  // **带号是绘制顺序，不是位置。** 平视镜头下每一档 z 都有自己的地平线，
  // 所以行走线上的一切（演员/影子/携带物/放下的东西/推的车/钉在地上的道具）
  // 摆位时一律经 `PlaceZ()` 压回 z=0，只有真的站在别的纵深上的东西
  //（负号的背景带、正号的前景掩体）才保留自己的 z。见 Data_DepthSpec 的
  // 「地平线规范」——那里有各档地平线差多少像素的实测表。
  // ===========================================================================
  // 深度带的数值来自 Data_DepthSpec.mjs，物体用哪个带来自 Data_PropArt.json；
  // 这里只保留层间的绘制序表。
  const LAYER_ORDER = {
    sky: 0, ridge: 1000, hills: 2000, farTown: 3000, midTrees: 4000,
    nearTrees: 5000, play: 6000, fx: 7000, fore: 8000, ots: 9000,
  };
  const ORDER_DARK = 8500, ORDER_GLOW = 8600, ORDER_INSERT = 9500;
  // 层内深度 → 绘制序号。z 越大（越近）画得越晚，压在上面。
  const DepthOrder = (layerKey, z) =>
    (LAYER_ORDER[layerKey] ?? 6000) + Math.round((Math.max(-12, Math.min(12, z)) + 12) * 20);
  // 给一个动态对象（演员骨架、携带物、掉落物）派发 play 层的绘制序号。
  // 骨架内部各骨头共用同一序号，彼此的前后仍由各自的局部 z 决定。
  // 钉死一个元素的绘制序号：既写进 userData（ApplyDepthOrder 重跑时不会被
  // 覆盖），也立刻生效——懒创建的元素（流体、标记）等不到下一趟派发。
  function FixOrder(obj, order) {
    obj.userData.fixedOrder = order;
    obj.renderOrder = order;
    return obj;
  }

  // 背景层里也有演员（远处那条街上干活的乡亲）：同一套深度带，只是层基数不同
  function SetLayerOrder(obj, layerKey, z, tag = layerKey) {
    CheckBandZ(tag, z);
    const order = DepthOrder(layerKey, z);
    obj.traverse((o) => { if (o.isMesh) { o.renderOrder = order; o.userData.fixedOrder = order; } });
  }

  function SetPlayOrder(obj, z, tag = "SetPlayOrder") {
    CheckBandZ(tag, z);
    const order = DepthOrder("play", z);
    // 同时写进 userData：BuildEnvironment 重建后 ApplyDepthOrder 重跑派发时，
    // 不至于改按 position.z 重新猜（动态物的 position.z 与深度带曾经不一致，
    // 「桶忽前忽后」就是这么来的）。对骨架尤其致命：骨头各自的**局部** z 全是
    // 0，重派一次整个人就被打回行走线那一档，沉到房子立面后头去，而手上提的
    // 桶是层的直接子物、局部 z 就是 CARRY_Z，照旧浮在墙外。
    obj.traverse((o) => { if (o.isMesh) { o.renderOrder = order; o.userData.fixedOrder = order; } });
  }

  // 给整层里所有还没被显式钉住的元素派发绘制序号
  function ApplyDepthOrder() {
    for (const key of Object.keys(layers)) {
      layers[key].traverse((o) => {
        if (!o.isMesh) return;
        if (o.userData.fixedOrder !== undefined) { o.renderOrder = o.userData.fixedOrder; return; }
        o.renderOrder = DepthOrder(key, o.position.z);
      });
    }
  }

  // -------------------------------------------------------------------------
  // 昼夜过渡：曲线本身（每档的浓淡与色相、白天奔夜里怎么经过黄昏、重烘该藏在
  // 哪一帧）全在 Data_DayCycle——那是纯数据纯函数，好进 node 冒烟测试。
  // 这儿只剩"眼下按哪一档烘环境"这个渲染层自己的状态机。
  // -------------------------------------------------------------------------
  let lightShown = null;         // 画面上正用着的档（＝已经烘出来的那一档）
  let lightFrom = null, lightTo = null;
  let lightMix = 1, lightSwapped = true;

  /** 眼下该按哪一档烘环境（＝过渡里已经切过去的那一档） */
  function ShownLight(state) {
    const ch0 = CHAPTERS[state.chapterIndex];
    const want = state.lightOverride || ch0.light;
    if (lightShown === null) { lightShown = want; lightFrom = want; lightTo = want; }
    return lightShown;
  }

  // 暗场遮罩（乘算）与光晕（加色）
  // 全屏压暗罩：绝不能参与深度，否则会把后画的灯光晕整片剔掉
  const darkMat = new THREE.MeshBasicMaterial({
    color: 0x000000, transparent: true, opacity: 0, depthWrite: false, depthTest: false,
  });
  const darkPlane = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), darkMat);
  darkPlane.position.z = 8;
  darkPlane.renderOrder = ORDER_DARK;
  scene.add(darkPlane);

  const glowTex = (() => {
    const c = MakeCanvas(128, 128);
    const g = c.getContext("2d");
    const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, "rgba(255,220,150,1)");
    grad.addColorStop(0.35, "rgba(255,180,90,0.42)");
    grad.addColorStop(1, "rgba(255,160,70,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
    return CanvasTexture(c);
  })();

  let occluder = null;

  // 灯：走遮挡光照着色器——照不穿土层与墙，能顺着竖井漏下去
  function MakeGlow(radius, color = 0xffc878, opacity = 1) {
    if (!occluder) {
      // 掩码还没烘好时退回普通加色晕，避免首帧崩
      const mat = new THREE.MeshBasicMaterial({
        map: glowTex, transparent: true, blending: THREE.AdditiveBlending,
        depthWrite: false, depthTest: false, color, opacity,
      });
      const m = new THREE.Mesh(new THREE.PlaneGeometry(radius * 2, radius * 2), mat);
      m.renderOrder = ORDER_GLOW;
      m.position.z = 0.4;
      m.userData.SetLight = (x, y) => m.position.set(x, y, 0.4);
      m.userData.SetIntensity = (v) => { mat.opacity = v; };
      m.userData.SetBlockers = () => {};
      return m;
    }
    const m = CreateOccludedLight(occluder, { radius, color, intensity: opacity });
    m.renderOrder = ORDER_GLOW;
    return m;
  }

  const actorSprites = new Map();
  // 这一帧场上所有会挡光的人体，交给每盏灯做遮挡查询（见 Script_Light 的 uBlockers）。
  // 只取躯干那一柱，不是整个人的包围盒——太宽的话人自己就先被自己的影子吃掉了。
  const bodyBlockers = [];
  // 这一帧场上所有的光源（提灯 / 玩家的煤油灯 / 地道油灯），用来定影子的方向
  const lightSources = [];
  const glows = [];
  let builtKey = "";
  let sceneLights = [];   // 静态灯位 {x,y,r,mesh}
  let fluid = null, fluidKey = "", fluidMesh = null, fluidCanvas = null, fluidCtx = null, fluidImage = null;
  let probeMeshes = [];
  let itemLabel = null;
  let scribeMesh = null, scribeCanvas = null, scribeCtx = null, scribeLastT = 0, scribeTip = null;
  let scribeDust = null;   // 笔尖扬起的粉末（只有真在蹭木头才有）
  let markerMesh = null, markerCanvas = null, markerCtx = null;
  let collapseMeshes = {};
  let itemMeshes = [];
  let carveState = { marked: false, carved: false }, carveRebuild = null;
  let otsMesh = null;
  let otsHiddenId = null;
  let vignetteAlpha = 0;
  let dustMotes = [];
  let lampMeshes = [];
  // 谜题动词层的动态元素：驴车、飞着的石子、探照灯光带、狗叫气泡、链上的待拾物
  let cartMesh = null, cartWheel = null;
  let thrownMesh = null;
  let winchRope = null, winchBucket = null, winchCrank = null, winchGuide = null;
  // 拉绳定向的绳：ribbon 网格（形状来自 Core 的 verlet 点串）＋锚点那盘没放完的绳
  let ropeLineMesh = null, ropeCoilMesh = null;
  let homeFacade = null, homeRange = null;

  // 走进自家门里的 NPC：立面还合着的时候，屋里本来就看不见——人跟着立面一起
  // 隐去（娘接过桶进屋倒水缸就是这一下）。玩家跟进来立面淡出，她又在屋里露出来。
  // 只管 NPC：玩家自己进门时立面正在淡，拿他当判据会闪一下。
  const IndoorHidden = (x, level) => !!homeFacade && !!homeRange
    && (homeFacade.material.opacity ?? 1) > 0.5
    && level === "surface" && x > homeRange.x0 && x < homeRange.door;
  let coneMeshes = [], coneTex = null;
  let shadeMeshes = [], shadeTex = null;   // 掩体背光那一侧的影子（"安全在哪儿"要画出来）
  let lightStrip = null, lightBeam = null, lightKey = "";
  let barkMesh = null;
  let chainItemMeshes = [];   // 链上还没捡的东西，一件一个槽（全都摆在场上）
  // 第一章重做的动态件：独轮车、引导气泡、投掷弧线、小活物、木楔、失败「！」
  let barrowMesh = null, barrowWheel = null;
  // 坐骑（骑车的伪军、挎斗摩托）：actorId → 车的贴图。车与骑手分开——
  // 骑手是正常演员（pose/lift 由 Core 给），车只是一张跟着他走的贴图
  const mountMeshes = new Map();
  // 自由放下的落地道具：uid → mesh（uid 在 Core 里随放下动作分配）
  const groundItemMeshes = new Map();
  let bubbleMeshes = [];
  const bubbleTex = new Map();
  let throwAimLine = null;
  let critterMesh = null, critterCanvas = null, critterCtx = null;
  let dustMesh = null, dustCanvas = null, dustCtx = null;
  // 刨料那一拍：台面上的料、骑在手上的刨子、飘落的刨花、地上的刨花堆
  let doorLeafPivot = null, doorLeafMesh = null, doorLeafLoose = null;
  let planeBoardMesh = null, planeBoardCanvas = null, planeBoardCtx = null;
  let planeToolMesh = null;
  let planeHandRig = null;      // 刨子挂在谁手上：示范时是爹，之后是柱子
  let planeCurlMesh = null, planeCurlCanvas = null, planeCurlCtx = null;
  let planePileMesh = null, planePileCanvas = null, planePileCtx = null;
  let spotFlashMesh = null;
  // 移动掩体（板车/独轮车）的深度：NEAR_CLUTTER 区间内的固定一档
  const CART_COVER_Z = 1.5;

  // 清空一层。标了 persist 的（演员骨架、影子、手里的东西）留下来并且
  // **绝不 dispose**：骨架的几何体与贴图是 rigCache 里所有角色共用的
  // （CreateRig 只克隆材质），销毁一具就等于销毁了全场的人。
  function ClearGroup(g) {
    const keep = [];
    while (g.children.length) {
      const c = g.children.pop();
      if (c.userData.persist) { keep.push(c); continue; }
      c.geometry?.dispose?.();
      if (c.material?.map && c.material.map !== glowTex) c.material.map.dispose?.();
      c.material?.dispose?.();
      g.remove(c);
    }
    for (const k of keep) g.add(k);
  }

  // BuildEnvironment 会把各层整个清掉重建，缓存在闭包里的那些懒创建网格
  // （标记、探杆、油灯、流体面、车、石子…）也一并没了，可变量还指着已经
  // dispose 的对象——于是 `if (!markerMesh)` 之类的判断全部落空，那些东西
  // 再也不会回来。重建时把引用一起清零。
  function InvalidateSceneCaches() {
    probeMeshes = [];
    lampMeshes = [];
    itemMeshes = [];
    itemLabel = null;
    markerMesh = null; markerCanvas = null; markerCtx = null;
    scribeMesh = null; scribeCanvas = null; scribeCtx = null; scribeLastT = 0; scribeTip = null;
    scribeDust = null;
    collapseMeshes = {};
    fluid = null; fluidKey = ""; fluidMesh = null;
    fluidCanvas = null; fluidCtx = null; fluidImage = null;
    cartMesh = null; cartWheel = null;
    thrownMesh = null;
    winchRope = null; winchBucket = null; winchCrank = null; winchGuide = null;
    ropeLineMesh = null; ropeCoilMesh = null;
    homeFacade = null; homeRange = null;
    coneMeshes = [];
    shadeMeshes = [];
    lightStrip = null; lightBeam = null; lightKey = "";
    barkMesh = null;
    chainItemMeshes = [];
    barrowMesh = null; barrowWheel = null;
    mountMeshes.clear();
    groundItemMeshes.clear();
    bubbleMeshes = [];
    bubbleTex.clear();
    throwAimLine = null;
    critterMesh = null; critterCanvas = null; critterCtx = null;
    dustMesh = null; dustCanvas = null; dustCtx = null;
    planeBoardMesh = null; planeBoardCanvas = null; planeBoardCtx = null;
    doorLeafPivot = null; doorLeafMesh = null; doorLeafLoose = null;
    planeToolMesh = null; planeHandRig = null;
    planeCurlMesh = null; planeCurlCanvas = null; planeCurlCtx = null;
    planePileMesh = null; planePileCanvas = null; planePileCtx = null;
    spotFlashMesh = null;
  }

  // -------------------------------------------------------------------------
  // 场景搭建
  // -------------------------------------------------------------------------
  function AddStrip(group, xFrom, xTo, topY, botY, colors, id) {
    // 一条横向色带（地表/天空），带手绘边缘
    const wPx = Math.ceil((xTo - xFrom) * PPM);
    const hPx = Math.ceil((topY - botY) * PPM);
    const mesh = BakeSprite(wPx, hPx, 0, hPx, (ctx) => {
      const grad = ctx.createLinearGradient(0, 0, 0, hPx);
      grad.addColorStop(0, colors[0]);
      grad.addColorStop(1, colors[1] || colors[0]);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, wPx, hPx);
    });
    PlaceSprite(mesh, xFrom, botY, 0);
    group.add(mesh);
    return mesh;
  }

  // ---------------------------------------------------------------------------
  // 纵深带（配合顶部 Z 轴分配规范使用）
  //
  // 相机永远平视（lookAt 与机位等高），所以地面在画面上是随纵深收缩的：
  // 深度 z 处的地面，屏幕高度 ∝ -camY / (dist - z)。z 越负（越远），它的地平线
  // 在画面上就越高。这是正确的透视，不是 bug——但如果那条地平线看不见，
  // 站在远处的房子就会读成"浮在半空"。
  //
  // 所以：**落地物件一律把贴图底边放在所在层的地平线上（地面 y=0、地道
  // y=UNDER_Y），y 永远不要为了"看起来贴地"而手动抬高**；纵深靠 z 表达，
  // 而每一条纵深带都由 AddBandEdge 画出一道实际躺在该深度地面上的沿线
  // （田埂 / 路沿 / 墙根），让眼睛读得出"它站在更靠后的地面上"。
  //
  // 反过来也成立：**没打算站在别的纵深上的东西，就不许用别的 z**。行走线上
  // 的道具与演员之间那 0.6m 曾经是没人声明过的——结果人的脚比车轮低十来个
  // 像素，读出来就是"车和人不在一条水平线上"。现在摆位统一走 PlaceZ()。
  //
  // 摆道具时从 Data_DepthSpec.mjs 的 BAND 表里挑 z，不要另取数值
  //（表已含 backdrop/building/yard/nearBack/walk/loose/facade/clutter 八档）。
  // 在某条纵深带的地面上画一道沿线：真正躺平在 y=地平线、深度 z 处，
  // 于是它的投影就精确落在那条带的地平线上。
  function AddBandEdge(group, xFrom, xTo, z, light, id) {
    const wPx = 1024, hPx = 64;
    const canvas = MakeCanvas(wPx, hPx);
    const g = canvas.getContext("2d");
    const ink = light === "night" || light === "dark" ? "rgba(18,20,26,0.55)" : "rgba(74,58,38,0.45)";
    const grd = g.createLinearGradient(0, 0, 0, hPx);
    grd.addColorStop(0, "rgba(0,0,0,0)");
    grd.addColorStop(0.45, ink);
    grd.addColorStop(0.62, ink);
    grd.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = grd;
    g.fillRect(0, 0, wPx, hPx);
    // 沿线不是直的：踩出来的土棱会起伏
    g.strokeStyle = ink;
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(0, hPx * 0.5);
    for (let px = 0; px <= wPx; px += 32) g.lineTo(px, hPx * 0.5 + (ART.Hash(id + px) - 0.5) * 9);
    g.stroke();
    const tex = CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.repeat.set(Math.max(1, Math.round((xTo - xFrom) / 26)), 1);
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(xTo - xFrom, 0.85),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0.9 }),
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set((xFrom + xTo) / 2, SURFACE_Y + 0.012, z);
    FixOrder(mesh, LAYER_ORDER.play - 25 + Math.round(z));
    group.add(mesh);
    return mesh;
  }

  function AddGroundBand(group, xFrom, xTo, groundY, light, id, depthM = 3.2) {
    const wPx = Math.ceil((xTo - xFrom) * PPM);
    const hPx = Math.round(depthM * PPM);
    const colors = light === "day" ? ART.PAL.earthDay
      : light === "dawn" || light === "dusk" ? ART.PAL.earthDawn
        : light === "night" ? ART.PAL.earthNight : ["#5a4a34", "#3d3123"];
    const grassColor = light === "night" ? ART.PAL.grassNight : ART.PAL.grass;
    const mesh = BakeSprite(wPx, hPx, 0, 6, (ctx) => {
      const grad = ctx.createLinearGradient(0, 0, 0, hPx);
      grad.addColorStop(0, colors[0]);
      grad.addColorStop(1, colors[1]);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 6, wPx, hPx - 6);
      // 地表线（手绘起伏）
      ctx.beginPath();
      ctx.moveTo(0, 6);
      for (let px = 0; px <= wPx; px += 40) {
        ctx.lineTo(px, 6 + (ART.Hash(id + px) - 0.5) * 4);
      }
      ctx.strokeStyle = ART.IN.ink;
      ctx.lineWidth = 2.6;
      ctx.stroke();
      // 草簇与车辙
      for (let i = 0; i < wPx / 34; i += 1) {
        const gx = ART.Hash(id + "g" + i) * wPx;
        ctx.strokeStyle = grassColor;
        ctx.lineWidth = 1.5;
        for (let b = 0; b < 3; b += 1) {
          ctx.beginPath();
          ctx.moveTo(gx + b * 2.5, 7);
          ctx.lineTo(gx + b * 2.5 + (ART.Hash(id + i + b) - 0.5) * 7, 7 - 5 - ART.Hash(id + "h" + i + b) * 6);
          ctx.stroke();
        }
      }
      ART.Speckle(ctx, 0, 8, wPx, hPx - 10, id + "sp", { count: Math.round(wPx / 26), alpha: 0.12, size: 2 });
      // 土路的实况（用户 2026-08-09："地面太现代了"）：1943 年冀中的村道是
      // 独轮车和大车碾出来的，没有路沿、没有铺装——只有两道深深的车辙、
      // 旱得裂开的泥皮、被踩塌的坑，和一层碾碎的料礓石。
      // 全部画在**近处这一带**（y 8..40px），远了就成了噪点。
      ctx.save();
      // ① 两道车辙：顺路方向的长条压暗，深浅不匀（走一段就浅一段）
      for (const [ry, alpha] of [[13, 0.16], [21, 0.11]]) {
        ctx.strokeStyle = `rgba(58,44,28,${alpha})`;
        ctx.lineWidth = 3.4;
        ctx.beginPath();
        let drawing = false;
        for (let px = 0; px <= wPx; px += 12) {
          const on = ART.Hash(id + "rut" + ry + Math.floor(px / 96)) > 0.22;
          const yy = ry + (ART.Hash(id + "rw" + ry + px) - 0.5) * 2.2;
          if (on && !drawing) { ctx.moveTo(px, yy); drawing = true; }
          else if (on) ctx.lineTo(px, yy);
          else drawing = false;
        }
        ctx.stroke();
      }
      // ② 旱裂的泥皮：短短的折线，横七竖八
      ctx.strokeStyle = "rgba(70,54,34,0.16)";
      ctx.lineWidth = 1.1;
      for (let i = 0; i < wPx / 30; i += 1) {
        const cx = ART.Hash(id + "ck" + i) * wPx;
        const cy = 9 + ART.Hash(id + "cy" + i) * 26;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        for (let k = 1; k <= 3; k += 1) {
          ctx.lineTo(cx + (ART.Hash(id + "cx" + i + k) - 0.5) * 16,
            cy + (ART.Hash(id + "cz" + i + k) - 0.5) * 9);
        }
        ctx.stroke();
      }
      // ③ 踩塌的浅坑：贴地的小椭圆，边上一圈亮、里头一层暗
      for (let i = 0; i < wPx / 150; i += 1) {
        const hx = ART.Hash(id + "ho" + i) * wPx;
        const hy = 12 + ART.Hash(id + "hy" + i) * 16;
        const hr = 7 + ART.Hash(id + "hr" + i) * 11;
        ctx.fillStyle = "rgba(56,42,26,0.13)";
        ctx.beginPath();
        ctx.ellipse(hx, hy, hr, hr * 0.42, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      // ④ 碾碎的料礓石子：一层细碎的亮点
      for (let i = 0; i < wPx / 18; i += 1) {
        const sx = ART.Hash(id + "gv" + i) * wPx;
        const sy = 8 + ART.Hash(id + "gy" + i) * 24;
        ctx.fillStyle = ART.Hash(id + "gc" + i) > 0.5
          ? "rgba(154,140,112,0.30)" : "rgba(96,80,58,0.24)";
        ctx.fillRect(sx, sy, 1.6 + ART.Hash(id + "gs" + i) * 1.8, 1.4);
      }
      // ⑤ 糠秕与麦秸碎：碾道、场院、门口一层细碎亮屑，被风吹成条状积在
      //    坑洼的背风侧。这一层是"农村"与"空地"的分界
      for (let i = 0; i < wPx / 26; i += 1) {
        const cx3 = ART.Hash(id + "cf" + i) * wPx;
        const cy3 = 9 + ART.Hash(id + "cfy" + i) * 22;
        ctx.strokeStyle = "rgba(176,158,112,0.34)";
        ctx.lineWidth = 0.9;
        ctx.beginPath();
        ctx.moveTo(cx3, cy3);
        ctx.lineTo(cx3 + 2 + ART.Hash(id + "cfl" + i) * 5, cy3 + (ART.Hash(id + "cfa" + i) - 0.5) * 2);
        ctx.stroke();
      }
      // ⑥ 粪蛋与扫街攒的粪土：**沿墙根一线**（路当中会被车碾平），
      //    灰褐色小堆。一个没有粪的华北村子等于没有农业
      for (let i = 0; i < wPx / 210; i += 1) {
        const dx3 = ART.Hash(id + "dg" + i) * wPx;
        const dy3 = 7 + ART.Hash(id + "dgy" + i) * 7;
        ctx.fillStyle = "rgba(84,70,48,0.42)";
        for (let k = 0; k < 4; k += 1) {
          ctx.beginPath();
          ctx.ellipse(dx3 + k * 3.4 + ART.Hash(id + "dk" + i + k) * 3, dy3 + ART.Hash(id + "dky" + i + k) * 3,
            1.9, 1.4, 0, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();
    });
    PlaceSprite(mesh, xFrom, groundY, 0);
    // 地表带钉在行走线**之下**：不钉的话它跟 walk 带道具同一个绘制序号，
    // 房子的接地投影（AddGroundShadow）会被这张大贴图整个盖掉——
    // 全画面一个暗部都没有，"干净得像小康村"有一半是这么来的
    FixOrder(mesh, DepthOrder("play", BAND.walk) - 4);
    group.add(mesh);
  }

  // 真正的水平地面：其余元素都是竖直广告牌，只有这块是躺平的几何。
  // 相机在 y≈2.7 平视，于是它自然向地平线收敛 —— 垄沟与车辙的收敛线
  // 就是 2.5D 纵深最强的读法，是此前一直缺的那一块。
  function AddGroundPlane(group, length, light, id) {
    const nearZ = 2.5, farZ = -72;
    const depth = nearZ - farZ;
    const wWorld = length + 220;
    // 贴图：u 沿 x，v 沿纵深；沿 x 等距的线在透视下会收敛
    const wPx = 1400, hPx = 900;
    const canvas = MakeCanvas(wPx, hPx);
    const ctx = canvas.getContext("2d");
    const pal = {
      day: ["#c6a86c", "#a98c58"], dawn: ["#b09a7c", "#8f7c62"],
      night: ["#3f4756", "#2e3542"], tunnel: ["#3a3229", "#2b251d"], dark: ["#251f1a", "#181410"],
    }[light] || ["#c6a86c", "#a98c58"];
    const g = ctx.createLinearGradient(0, 0, 0, hPx);
    g.addColorStop(0, pal[1]);   // 远端更暗（空气透视）
    g.addColorStop(1, pal[0]);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, wPx, hPx);
    // 庄稼：村子外头那一大片是**地**，不是空场。1943 年春的冀中，去年秋播的
    // 冬麦已经返青——远处该是一块块青的。只铺在纵深的远半段（贴图上半部），
    // 近处那一条留给村道与院子，不然人就走在麦田里了
    const crop = {
      day: ["#8d9a58", "#a8bf6a"], dawn: ["#7b8560", "#8f9c6b"],
      night: ["#39434a", "#414d52"], tunnel: ["#35362a", "#3c3d2f"], dark: ["#23241c", "#282920"],
    }[light] || ["#8d9a58", "#a8bf6a"];
    ctx.save();
    for (let row = 0; row < 5; row += 1) {
      // 行高按透视收：越远越扁
      const v0 = (row / 5) ** 1.5, v1 = ((row + 1) / 5) ** 1.5;
      const y0 = v0 * hPx * 0.62, y1 = v1 * hPx * 0.62;
      let x = -ART.Hash(id + "fo" + row) * 200;
      let i = 0;
      while (x < wPx) {
        const bw = 90 + ART.Hash(id + "fw" + row + i) * 190;
        if (ART.Hash(id + "fc" + row + i) > 0.4) {
          ctx.globalAlpha = 0.34 + row * 0.07;      // 越近越实
          ctx.fillStyle = ART.Hash(id + "fk" + row + i) > 0.5 ? crop[0] : crop[1];
          ctx.fillRect(x, y0, bw, y1 - y0 + 1);
        }
        // 田埂：地块之间踩出来的土脊
        ctx.globalAlpha = 0.24;
        ctx.fillStyle = "#5b4a32";
        ctx.fillRect(x, y0, 2.4, y1 - y0);
        x += bw;
        i += 1;
      }
    }
    ctx.restore();
    // 垄沟：沿纵深方向的长线，透视里会收敛到消失点
    ctx.save();
    ctx.globalAlpha = 0.30;
    ctx.strokeStyle = "#5b4a32";
    for (let i = 0; i < 46; i += 1) {
      const x = (i / 46) * wPx + ART.Hash(id + i) * 12;
      ctx.lineWidth = 1.6 + ART.Hash(id + "w" + i) * 2.6;
      ctx.beginPath();
      ctx.moveTo(x, hPx);
      for (let t = 1; t <= 8; t += 1) {
        ctx.lineTo(x + (ART.Hash(id + i + t) - 0.5) * 10, hPx - (t / 8) * hPx);
      }
      ctx.stroke();
    }
    // 横向的田埂与车辙
    ctx.globalAlpha = 0.22;
    for (let j = 0; j < 9; j += 1) {
      const y = hPx - Math.pow(j / 9, 1.7) * hPx;
      ctx.lineWidth = 2 + (8 - j) * 0.5;
      ctx.beginPath();
      ctx.moveTo(0, y);
      for (let t = 0; t <= 14; t += 1) ctx.lineTo((t / 14) * wPx, y + (ART.Hash(id + "h" + j + t) - 0.5) * 7);
      ctx.stroke();
    }
    ctx.restore();
    ART.Speckle(ctx, 0, 0, wPx, hPx, id + "sp", { count: 520, alpha: 0.10, size: 3, color: "#3d3020" });

    // 村道本身（贴图最下面那一条＝玩家脚下这一带）。老版这儿是一块平涂的土色，
    // 干干净净——1943 年冀中的村道是独轮车和大车碾出来的：没有铺装、没有路沿，
    // 只有两道深车辙、旱裂的泥皮、踩塌的坑，和一层碾碎的料礓石子
    //（用户 2026-08-09："地面之类的太现代了"）。
    // 只画贴图下缘 22% —— 再往上就是纵深里的田，不是路。
    ctx.save();
    const roadTop = hPx * 0.78;
    // ① 路面比田里的土再压一档：常年碾压，颜色比生土深
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = "#6b573a";
    ctx.fillRect(0, roadTop, wPx, hPx - roadTop);
    // ② 两道车辙：顺路方向的长条，走一段浅一段（车轮跳过去了）
    ctx.globalAlpha = 1;
    for (const [vy, alpha, lw] of [[0.30, 0.26, 9], [0.62, 0.20, 8]]) {
      const ry = roadTop + (hPx - roadTop) * vy;
      ctx.strokeStyle = `rgba(64,49,30,${alpha})`;
      ctx.lineWidth = lw;
      ctx.lineCap = "round";
      let drawing = false;
      ctx.beginPath();
      for (let px = 0; px <= wPx; px += 14) {
        const on = ART.Hash(id + "rut" + vy + Math.floor(px / 120)) > 0.18;
        const yy = ry + (ART.Hash(id + "rw" + vy + px) - 0.5) * 7;
        if (on && !drawing) { ctx.moveTo(px, yy); drawing = true; }
        else if (on) ctx.lineTo(px, yy);
        else drawing = false;
      }
      ctx.stroke();
    }
    // ③ 旱裂的泥皮
    ctx.strokeStyle = "rgba(74,57,35,0.24)";
    ctx.lineWidth = 1.6;
    for (let i = 0; i < 130; i += 1) {
      const cx = ART.Hash(id + "ck" + i) * wPx;
      const cy = roadTop + ART.Hash(id + "cy" + i) * (hPx - roadTop);
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      for (let k = 1; k <= 3; k += 1) {
        ctx.lineTo(cx + (ART.Hash(id + "cx" + i + k) - 0.5) * 34,
          cy + (ART.Hash(id + "cz" + i + k) - 0.5) * 16);
      }
      ctx.stroke();
    }
    // ④ 踩塌的浅坑
    for (let i = 0; i < 26; i += 1) {
      const hx = ART.Hash(id + "ho" + i) * wPx;
      const hy = roadTop + ART.Hash(id + "hy" + i) * (hPx - roadTop);
      const hr = 14 + ART.Hash(id + "hr" + i) * 26;
      ctx.fillStyle = "rgba(60,45,27,0.16)";
      ctx.beginPath();
      ctx.ellipse(hx, hy, hr, hr * 0.34, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // ⑤ 碾碎的料礓石子
    for (let i = 0; i < 420; i += 1) {
      const sx = ART.Hash(id + "gv" + i) * wPx;
      const sy = roadTop + ART.Hash(id + "gy" + i) * (hPx - roadTop);
      ctx.fillStyle = ART.Hash(id + "gc" + i) > 0.5
        ? "rgba(168,152,120,0.30)" : "rgba(92,74,50,0.26)";
      ctx.fillRect(sx, sy, 2 + ART.Hash(id + "gs" + i) * 3, 1.8);
    }
    ctx.restore();

    const tex = CanvasTexture(canvas);
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(wWorld, depth),
      new THREE.MeshBasicMaterial({ map: tex, transparent: false, depthWrite: true }),
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(length / 2, SURFACE_Y - 0.02, (nearZ + farZ) / 2);
    FixOrder(mesh, LAYER_ORDER.play - 40);   // 地面躺在整个玩法层之下
    group.add(mesh);
    return mesh;
  }

  // 地平线那两条远带。**这是冀中平原，不是山区**——地道战打的就是无险可守的
  // 大平原（正因为一马平川，才只能往地下挖）。所以起伏一律压到几个像素：
  // 剩下的纵深不靠山脊，靠一层层雾、地里的树行、和远处村落的剪影。
  // 原来 amp 给到 40/26，画出来是两道山梁——地理错了，故事也就跟着不成立。
  function AddRidgeBand(group, length, color, id, { amp = 5, base = 34, blur = 2.2, lift = 0.6, haze = 0.4, rows = 0 } = {}) {
    const worldW = length * 0.5 + 90;
    const wPx = Math.ceil(worldW * PPM * 0.34);
    const hPx = 180;
    const mesh = BakeSprite(wPx, hPx, 0, hPx, (ctx) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(0, hPx);
      for (let px = 0; px <= wPx; px += 22) {
        // 平原的地平线不是一把尺子：留一点极缓的起伏（田块与土路的高差）
        const y = hPx - base - Math.sin(px * 0.006 + ART.Hash(id) * 6) * amp - Math.sin(px * 0.017) * (amp * 0.5);
        ctx.lineTo(px, y);
      }
      ctx.lineTo(wPx, hPx);
      ctx.closePath();
      ctx.fill();
      // 平原的纵深全靠地平线上那一排小东西：防风林的树行、几户人家的屋脊。
      // 跟带子同色同一张贴图里画完，不额外增加网格
      // 比带子本身深一档：同色画上去等于没画（用户："背景里有一些山看不清"）
      ctx.fillStyle = Darken(color, 0.82);
      for (let i = 0; i < rows; i += 1) {
        const px = (i + 0.5) * (wPx / rows) + ART.Hash(id + "r" + i) * 60 - 30;
        const top = hPx - base - 2;
        if (ART.Hash(id + "k" + i) > 0.45) {
          // 树行：几团挨着的圆冠，一带就是一道防风林
          const n = 3 + Math.floor(ART.Hash(id + "n" + i) * 4);
          for (let t = 0; t < n; t += 1) {
            const tx = px + t * 9 - n * 4.5;
            const r = 4.5 + ART.Hash(id + "t" + i + t) * 3;
            ctx.beginPath();
            ctx.ellipse(tx, top - r * 0.5, r, r * 0.9, 0, 0, Math.PI * 2);
            ctx.fill();
          }
        } else {
          // 远处的一户：矮墙 + 一道屋脊
          const w2 = 14 + ART.Hash(id + "w" + i) * 12;
          ctx.fillRect(px - w2 / 2, top - 7, w2, 8);
          ctx.beginPath();
          ctx.moveTo(px - w2 / 2 - 3, top - 7);
          ctx.lineTo(px, top - 13);
          ctx.lineTo(px + w2 / 2 + 3, top - 7);
          ctx.closePath();
          ctx.fill();
        }
      }
      // 平原的地平线本来就淡，再叠一层半透明就整个化进天里读不出来了——
      // 这两条带子也一律实心，退感只由染色量给（用户："背景里有一些山看不清"）
    }, blur, 1, { color: hazeColor, amount: haze });
    PlaceSprite(mesh, -30, SURFACE_Y + lift, 0);
    ScaleKeepGround(mesh, 2.9, 1);
    group.add(mesh);
  }

  // 地平线上的炮楼。1942-43 年的冀中，日军「囚笼政策」把平原用公路、封锁沟和
  // **每隔几里一座的炮楼**割成小块——站在村里往哪边看都能看见一两座，
  // 这就是"敌后"两个字的字面意思。所以它们不是布景，是这一章的处境本身。
  //
  // 摆在 hills/farTown 层：一律**只画剪影**（层的糊与雾色会把细节吃掉，
  // 画细了是白费）。夜里楼顶点一粒灯——这游戏讲的就是灯。
  // 把远景带的颜色压深一档：炮楼是这片空地上唯一的硬边，跟地平线同色就白摆了
  const Darken = (hex, k) => {
    const n = parseInt(hex.slice(1), 16);
    const f = (v) => Math.max(0, Math.round(v * k));
    return `rgb(${f((n >> 16) & 255)},${f((n >> 8) & 255)},${f(n & 255)})`;
  };

  function AddHorizonForts(list, pal, night, ruined) {
    for (const spec of list || []) {
      const key = spec.layer;
      const group = layers[key];
      if (!group) continue;
      const hM = spec.h || 12;                   // 炮楼一般十来米，平原上老远就看得见
      const wPx = 150, hPx = Math.ceil(hM * PPM * 0.42) + 40;
      // 糊与雾都只给该层的一半：一片空地上竖着的砖石塔，本来就比田野的
      // 轮廓硬、比远村的色深。按整层的量去糊，它就化进地平线里没了
      const mesh = BakeSprite(wPx, hPx, wPx / 2, hPx - 6, (ctx, ax, ay) => {
        ART.DrawHorizonFort(ctx, ax, ay, hM * PPM * 0.42, spec.id,
          { color: Darken(pal, night ? 0.82 : 0.72), lit: night && !ruined });
      }, (LAYER_BLUR[key] || 0) * 0.45, 1, HazeSolid(key, key === "hills" ? 0.95 : 0.88, 0.5));
      PlaceSprite(mesh, spec.x, SURFACE_Y - 0.1, 0);
      // 层的补偿只服务于铺满画框的背景板；离散的建筑要按透视自然变小
      ScaleKeepGround(mesh, 1 / LAYER_COMP[key]);
      group.add(mesh);
    }
  }

  // 前景：掠过镜头的草丛与枝条，微糊，压暗——一点点就够
  function AddForeground(group, length, night, id) {
    for (let x = 6; x < length; x += 15 + ART.Hash(id + x) * 14) {
      // 前景：镜头推近之后画框空，需要有东西从边缘掠过带出纵深。
      // 上缘垂枝、下缘草丛、偶尔一段篱笆——都压暗微糊，只当框景用。
      const h0 = ART.Hash(id + "k" + x);
      const kind = h0 > 0.62 ? "branch" : (h0 > 0.3 ? "grass" : "fence");
      const wPx = kind === "branch" ? 340 : 220;
      const hPx = kind === "branch" ? 200 : 150;
      const mesh = BakeSprite(wPx, hPx, wPx / 2, hPx - 4, (ctx, ax, ay) => {
        const tint = night ? "#0f1218" : "#3d3524";
        if (kind === "grass") {
          for (let i = 0; i < 22; i += 1) {
            const gx = ax - 90 + ART.Hash(id + x + i) * 180;
            const gh = 40 + ART.Hash(id + "h" + x + i) * 78;
            ctx.beginPath();
            ctx.moveTo(gx, ay);
            ctx.quadraticCurveTo(gx + (ART.Hash(id + "c" + i) - 0.5) * 26, ay - gh * 0.6,
              gx + (ART.Hash(id + "t" + i) - 0.5) * 52, ay - gh);
            ctx.strokeStyle = tint;
            ctx.lineWidth = 3.4;
            ctx.lineCap = "round";
            ctx.stroke();
          }
        } else if (kind === "fence") {
          // 一段矮篱笆横在镜头前
          for (let i = 0; i < 7; i += 1) {
            const fx = ax - 140 + i * 46;
            ctx.beginPath();
            ctx.moveTo(fx, ay);
            ctx.lineTo(fx + (ART.Hash(id + "f" + i) - 0.5) * 12, ay - 60 - ART.Hash(id + "fh" + i) * 26);
            ctx.strokeStyle = tint;
            ctx.lineWidth = 9;
            ctx.lineCap = "round";
            ctx.stroke();
          }
          for (let r = 0; r < 2; r += 1) {
            ctx.beginPath();
            ctx.moveTo(ax - 150, ay - 26 - r * 26);
            for (let t = 0; t <= 8; t += 1) {
              ctx.lineTo(ax - 150 + t * 40, ay - 26 - r * 26 + (ART.Hash(id + "r" + r + t) - 0.5) * 9);
            }
            ctx.strokeStyle = tint;
            ctx.lineWidth = 7;
            ctx.stroke();
          }
        } else {
          // 从画框上缘垂下来的一枝
          ctx.beginPath();
          ctx.moveTo(ax - 150, 6);
          ctx.quadraticCurveTo(ax, 40, ax + 150, 16);
          ctx.strokeStyle = tint;
          ctx.lineWidth = 7;
          ctx.stroke();
          for (let i = 0; i < 12; i += 1) {
            const t = i / 12;
            const lx = ax - 150 + t * 300;
            const ly = 12 + Math.sin(t * Math.PI) * 26;
            ctx.beginPath();
            ctx.ellipse(lx, ly + 12, 13, 7, ART.Hash(id + i) * 2, 0, Math.PI * 2);
            ctx.fillStyle = tint;
            ctx.fill();
          }
        }
      }, LAYER_BLUR.fore, 1, HazeFor("fore"));
      // 压到画框下缘/上缘之外，只让边角掠过——一点点就够
      PlaceSprite(mesh, x, kind === "branch" ? SURFACE_Y + 6.6 : SURFACE_Y - 4.4, 0);
      ScaleKeepGround(mesh, 1.5 / LAYER_COMP.fore);
      mesh.material.opacity = night ? 0.34 : 0.2;
      group.add(mesh);
    }
  }

  // 空气里的浮尘：光束里看得见的那种
  function AddDust(count, night) {
    const dust = [];
    const tex = (() => {
      const c = MakeCanvas(32, 32);
      const g = c.getContext("2d");
      const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16);
      grad.addColorStop(0, "rgba(255,236,196,0.9)");
      grad.addColorStop(1, "rgba(255,220,160,0)");
      g.fillStyle = grad;
      g.fillRect(0, 0, 32, 32);
      return CanvasTexture(c);
    })();
    for (let i = 0; i < count; i += 1) {
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(0.055, 0.055),
        new THREE.MeshBasicMaterial({
          map: tex, transparent: true, depthWrite: false,
          blending: THREE.AdditiveBlending, opacity: night ? 0.22 : 0.09,
        }),
      );
      m.userData = {
        seed: Math.random() * 100,
        vy: 0.05 + Math.random() * 0.12,
        vx: (Math.random() - 0.5) * 0.14,
      };
      layers.fx.add(m);
      dust.push(m);
    }
    return dust;
  }

  function AddParallaxTown(group, xFrom, xTo, color, id, { ruined = false, objScale = 1, opacity = 0.62 } = {}) {
    for (let x = xFrom; x < xTo; x += 9 + ART.Hash(id + x) * 9) {
      const w = 9 + ART.Hash(id + "w" + x) * 7;
      const h = 2.6 + ART.Hash(id + "h" + x) * 1.6;
      const wPx = Math.ceil((w + 4) * PPM), hPx = Math.ceil((h + 1.6) * PPM);
      const mesh = BakeSprite(wPx, hPx, wPx / 2, hPx, (ctx, ax, ay) => {
        const W = w * PPM, H = h * PPM;
        // 远景屋：墙 + 出檐坡顶 + 一点窗，比纯剪影耐看
        ART.InkFill(ctx, ART.Rect(ax - W / 2, ay - H, W, H), id + x, color,
          { amp: 1.6, lw: 1.6, line: "rgba(43,31,22,0.35)" });
        ART.InkFill(ctx, [
          [ax - W / 2 - 10, ay - H], [ax - W * 0.26, ay - H - 26],
          [ax + W * 0.26, ay - H - 26], [ax + W / 2 + 10, ay - H],
        ], id + "r" + x, color, { amp: 1.4, lw: 1.6, line: "rgba(43,31,22,0.35)", shade: "rgba(0,0,0,0.12)" });
        ctx.globalAlpha = 0.5;
        ctx.fillStyle = "rgba(30,22,16,0.6)";
        ctx.fillRect(ax - W * 0.2, ay - H * 0.62, W * 0.16, H * 0.2);
        ctx.globalAlpha = 1;
        // 院落配件：矮院墙、柴垛、井架、旗杆——远处也要有生活痕迹
        const v = ART.Hash(id + "v" + x);
        ART.InkFill(ctx, ART.Rect(ax - W / 2 - 34, ay - 26, 34, 26), id + "yard" + x, color,
          { amp: 1.4, lw: 1.4, line: "rgba(43,31,22,0.3)" });
        if (v > 0.72) {
          // 井架
          ART.InkFill(ctx, ART.Rect(ax + W / 2 + 10, ay - 46, 5, 46), id + "wp" + x, color, { amp: 1, lw: 1.2, line: null });
          ART.InkFill(ctx, ART.Rect(ax + W / 2 + 30, ay - 46, 5, 46), id + "wq" + x, color, { amp: 1, lw: 1.2, line: null });
          ART.InkFill(ctx, ART.Rect(ax + W / 2 + 6, ay - 52, 33, 6), id + "wt" + x, color, { amp: 1, lw: 1.2, line: null });
        } else if (v > 0.46) {
          // 柴垛
          for (let k = 0; k < 3; k += 1) {
            ART.InkFill(ctx, ART.Rect(ax + W / 2 + 8, ay - 12 - k * 10, 30 - k * 6, 10),
              id + "wd" + x + k, color, { amp: 1.2, lw: 1.2, line: null });
          }
        } else if (v > 0.3) {
          // 旗杆
          ART.InkFill(ctx, ART.Rect(ax - W / 2 - 18, ay - 74, 4, 74), id + "fp" + x, color, { amp: 1, lw: 1, line: null });
        }
        if (ruined) {
          ctx.globalCompositeOperation = "destination-out";
          ctx.fillRect(ax - W * 0.1, ay - H - 30, W * 0.5, H * 0.55);
          ctx.globalCompositeOperation = "source-over";
        }
      }, LAYER_BLUR.farTown, 1, HazeSolid("farTown", opacity));
      PlaceSprite(mesh, x, SURFACE_Y - 0.2, 0);
      // 层的补偿只服务于"铺满画框的背景板"；离散的房子要按透视自然变小
      ScaleKeepGround(mesh, objScale * (0.86 + ART.Hash(id + "s" + x) * 0.4));
      group.add(mesh);
    }
  }

  // ---------------------------------------------------------------------------
  // 背景里的乡亲：远处那条街上也有人在过日子
  //
  // **不能拿一张静止贴图平移**——那正是"翻越做了等于没做"的老毛病，一眼看出是
  // 块滑动的板子。这里用的是跟前景一模一样的骨架：远处的人真的在迈腿、真的在
  // 一下一下落锄。代价是每人十来个小网格，几个人的量换得起。
  //
  // 摆位/缩放/隐没三件事都跟着所在层走：
  //   · 层已经整体放大了 LAYER_COMP，离散物件要按 1/COMP 抵消回去，
  //     人才会按透视自然变小（跟 AddParallaxTrees 的 scale 是同一回事）；
  //   · 不透明度 = (1 - 该层空气透视量) × 该层树的不透明度，
  //     人就跟树一起往雾色里退——背景层的糊是烘进贴图的，骨架糊不了，
  //     只能靠这个把他们"推远"；
  //   · 绘制序号走 ACTOR_Z，于是本层的人永远站在本层的树之前。
  // ---------------------------------------------------------------------------
  let backdropFolk = [];

  // 各层树列用的不透明度（AddParallaxTrees 的 opacity）——背景里的人跟着树走，
  // 一层里的东西该有一样的"实"度
  const LAYER_TREE_ALPHA = { midTrees: 0.86, nearTrees: 0.96 };

  // 干什么活 → 用哪条循环轨道、手里拿什么、朝哪边。走动的另给 from/to
  const FOLK_ACT = {
    hoe: { track: "hoeing", carry: "锄头" },
    saw: { track: "sawing", carry: "锯" },
    sweep: { track: "sweeping", carry: "扫帚" },
    feed: { track: "scatterFeed", carry: null },
    walk: { track: null, carry: null },
    haul: { track: null, carry: "木料" },   // 扛着木料走的：carry 姿势 + 走路
  };

  function ClearBackdropFolk() {
    // 骨架的 group 是 THREE.Group，ClearGroup 只 dispose 直接子级里的 Mesh，
    // 碰不到它们——材质是 CloneMesh 克隆出来的（贴图共享，不能动），自己收
    for (const f of backdropFolk) {
      f.rig.group.traverse((o) => { if (o.isMesh) o.material.dispose(); });
    }
    backdropFolk = [];
  }

  function AddBackdropFolk(sceneDef, ch, night) {
    const list = sceneDef.backdropFolk || [];
    // 天黑了乡亲都在屋里（第二章是夜里的扫荡，街上只该有灯和兵）
    if (night || !list.length) return;
    for (const spec of list) {
      const key = spec.layer;
      const host = layers[key];
      if (!host) continue;
      const act = FOLK_ACT[spec.act];
      if (!act) continue;
      const kind = spec.kind || "villager";
      // 骨架也走**染色**不走半透明：CreateRig 收一份雾量，按它单独烘一套零件
      // （缓存键带雾量，一种角色最多多一两套）。半透明的人身上会透出树和炮楼。
      // 系数比树再重半档——树是一团色块，人有一圈墨线，同样的量下人显得更"实"
      const rig = CreateRig(kind, HazeSolid(key, LAYER_TREE_ALPHA[key] ?? 0.9, 1.5));
      host.add(rig.group);
      SetLayerOrder(rig.group, key, ACTOR_Z, "folk:" + key);
      const scale = (BODY_SCALE[kind] ?? 1) / LAYER_COMP[key];
      const f = {
        rig, layerKey: key, bodyScale: scale, scale,
        x: spec.x, from: spec.from, to: spec.to,
        speed: spec.speed || 0.9, dir: spec.heading ?? 1,
        heading: spec.heading ?? (spec.act === "hoe" || spec.act === "saw" ? -1 : 1),
        track: act.track, trackT: ART.Hash(spec.id) * 2.4,   // 错开相位，免得几个人同手同脚
        carryLabel: act.carry, shoulder: spec.act === "haul",
        phase: ART.Hash(spec.id + "p") * 6, idleT: ART.Hash(spec.id + "i") * 6,
        carryMesh: null, carryLabel0: null,
        // 警讯响了要收工回屋，事后（重玩本章）还得能复原：原样存一份
        track0: act.track, carry0: act.carry,
        fleeDir: ART.Hash(spec.id + "f") < 0.5 ? -1 : 1,
        flee: null,
      };
      rig.group.position.set(f.x, SURFACE_Y, 0);
      backdropFolk.push(f);
    }
  }

  // 背景乡亲收工的行程：撂下家伙、扭头小跑两秒半、进门没影
  const FOLK_FLEE_T = 2.5, FOLK_FLEE_SPEED = 2.9;

  function StepBackdropFolk(dt, state) {
    // 警讯（民兵报信 / 村口喊声）一响，**背景层这一排也得收工进屋**。
    // 只收前景那四个是不够的：远处照样在锄地扫院，"街上转眼就空了"
    // 那句字幕当场被画面拆穿（用户 2026-08-08 报的）。
    // 走 visible 切换，不进 builtKey——重建一次整场就是一个卡顿。
    const alarm = !!state?.flags?.villageAlarm;
    for (const f of backdropFolk) {
      if (alarm && !f.flee) {
        // 撂下手里的活：轨道停、家伙收进屋（SyncCarry 见 label 为空就摘网格）
        f.flee = { t: 0 };
        f.track = null;
        f.carryLabel = null;
        f.from = undefined; f.to = undefined;   // 来回踱步的也改成一头走
      } else if (!alarm && f.flee) {
        // 重玩本章：旗清了，人回到地里接着干活
        f.flee = null;
        f.track = f.track0;
        f.carryLabel = f.carry0;
        f.rig.group.visible = true;
      }
      if (f.flee) {
        f.flee.t += dt;
        if (f.flee.t >= FOLK_FLEE_T) { f.rig.group.visible = false; continue; }
        f.rig.group.visible = true;
        f.x += f.fleeDir * FOLK_FLEE_SPEED * dt;
        f.heading = f.fleeDir;
        f.rig.group.position.x = f.x;
        f.phase += FOLK_FLEE_SPEED * dt * 3.4;
        f.idleT += dt * 1.4;
        PoseRig(f.rig, { phase: f.phase, breath: f.idleT, moving: true }, dt);
        f.rig.group.scale.set((f.heading >= 0 ? 1 : -1) * f.scale, f.scale, 1);
        if (f.carryMesh) SyncCarry(f, null, f.heading);   // 家伙已经撂下了
        continue;
      }
      let moved = 0;
      if (f.from !== undefined && f.to !== undefined) {
        const nx = f.x + f.dir * f.speed * dt;
        if (nx >= f.to) { f.x = f.to; f.dir = -1; }
        else if (nx <= f.from) { f.x = f.from; f.dir = 1; }
        else { moved = Math.abs(nx - f.x); f.x = nx; }
        f.heading = f.dir;
        f.rig.group.position.x = f.x;
      }
      const moving = moved > 1e-4;
      f.phase += moving ? moved * 3.4 : dt * 2.2;
      f.idleT += dt * 1.4;
      if (f.track) f.trackT += dt;
      PoseRig(f.rig, {
        phase: f.phase, breath: f.idleT, moving,
        carry: f.shoulder, track: f.track, trackT: f.trackT,
      }, dt);
      f.rig.group.scale.set((f.heading >= 0 ? 1 : -1) * f.scale, f.scale, 1);
      if (f.carryLabel) SyncCarry(f, f.carryLabel, f.heading);
    }
  }

  function AddParallaxTrees(group, xFrom, xTo, night, id, { blur = 0, scale = 0.72, opacity = 0.85, step = 19, hazeOpt = null } = {}) {
    for (let x = xFrom; x < xTo; x += step + ART.Hash(id + x) * 16) {
      const wPx = 150, hPx = 200;
      const mesh = BakeSprite(wPx, hPx, wPx / 2, hPx - 4, (ctx, ax, ay) => {
        ART.DrawTree(ctx, ax, ay, id + x, { big: false, night });
      }, blur, 1, hazeOpt);
      PlaceSprite(mesh, x, SURFACE_Y - 0.1, 0);
      if (scale !== 1) ScaleKeepGround(mesh, scale);
      group.add(mesh);
    }
  }

  // 落地投影：没有影子的物件永远像浮在地面线上
  // 光向：太阳偏在画面左后方，影子朝右前方斜出去
  const SUN = { dx: 0.85, dz: 1.0 };

  // 方向性投影：一片躺在地平面上的影子（随地面一起透视），
  // 不再是贴在物件脚下的一团。有了它，东西才真的"站"在地上。
  function MakeFlatShadow(lengthM, widthM, strength) {
    const wPx = 256, hPx = 256;
    const canvas = MakeCanvas(wPx, hPx);
    const ctx = canvas.getContext("2d");
    const g = ctx.createRadialGradient(wPx * 0.5, hPx * 0.32, 0, wPx * 0.5, hPx * 0.5, hPx * 0.5);
    g.addColorStop(0, `rgba(28,20,12,${strength})`);
    g.addColorStop(0.55, `rgba(28,20,12,${strength * 0.5})`);
    g.addColorStop(1, "rgba(28,20,12,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, wPx, hPx);
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(widthM, lengthM),
      new THREE.MeshBasicMaterial({ map: CanvasTexture(canvas), transparent: true, depthWrite: false }),
    );
    mesh.rotation.x = -Math.PI / 2;
    FixOrder(mesh, LAYER_ORDER.play - 20);  // 投影压在地面上、在所有立面之下
    return mesh;
  }

  // 灯打出来的影子：从脚下往背光方向拖一条，近端浓、远端散开。
  // 贴图的 u=0 一端是脚下，靠 scale.x 的正负决定往哪边拖。
  function MakeCastShadow(strength) {
    const wPx = 256, hPx = 128;
    const canvas = MakeCanvas(wPx, hPx);
    const ctx = canvas.getContext("2d");
    const gx = ctx.createLinearGradient(0, 0, wPx, 0);
    gx.addColorStop(0, `rgba(20,14,8,${strength})`);
    gx.addColorStop(0.42, `rgba(20,14,8,${strength * 0.55})`);
    gx.addColorStop(1, "rgba(20,14,8,0)");
    ctx.fillStyle = gx;
    ctx.fillRect(0, 0, wPx, hPx);
    // 纵向收成一条从脚下张开的椭圆，边缘不留硬口
    ctx.globalCompositeOperation = "destination-in";
    ctx.save();
    ctx.translate(0, hPx / 2);
    ctx.scale(wPx, hPx / 2);
    const gy = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    gy.addColorStop(0, "rgba(0,0,0,1)");
    gy.addColorStop(0.6, "rgba(0,0,0,0.92)");
    gy.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = gy;
    ctx.fillRect(-1, -1, 2, 2);
    ctx.restore();
    ctx.globalCompositeOperation = "source-over";
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ map: CanvasTexture(canvas), transparent: true, depthWrite: false }),
    );
    mesh.rotation.x = -Math.PI / 2;   // 躺在地面上，长边沿世界 X
    FixOrder(mesh, LAYER_ORDER.play - 19);
    return mesh;
  }

  function AddGroundShadow(group, x, halfW, strength = 0.28, z = 0) {
    const w = halfW * 2.3;
    const len = halfW * 3.0;
    const mesh = MakeFlatShadow(len, w, strength);
    // 沿光向偏出去一段，影子才是"投"出来的而不是垫在脚下
    mesh.position.set(x + SUN.dx * halfW * 0.7, SURFACE_Y + 0.015, PlaceZ(z) + SUN.dz * len * 0.34);
    FixOrder(mesh, DepthOrder("play", BAND.walk) - 2);   // 压在地表带之上、道具之下
    group.add(mesh);
  }

  // 摆一件场景物体。**尺寸、锚点、深度带、投影强度全部来自数据**
  //（Data_Scenes.json 说它在哪，Data_PropArt.json 说它长什么样、埋多深）；
  // 这里只剩"怎么画"那几笔——条件绘制的部分（断了的井绳、露出的绳头、
  // 烧过的屋子）才是真正的代码。想挪一个东西、换一张贴图、改一档深度，
  // 都不该动这个文件。
  function AddProp(group, p, light, ruined, sceneKey, state) {
    const night = light === "night" || light === "tunnel" || light === "dark";
    // 旗标门（扫荡后才出现的柴垛石堆 / 被拿走就消失的母鸡顶针）：**一律先建出来**，
    // 之后由 UpdateProps 每帧切 visible。以前这两个旗标编在 builtKey 里，于是
    // "捡一枚顶针" ＝ 整个场景重建：几十张超采样贴图重烘，实测 931ms 的一卡。
    // 出没是每帧状态，不该惊动环境构建。
    const meshFrom = group.children.length;
    const S = SpriteOf(p.kind, p);
    if (!S) return;    // drawnBy：地道剖面 / 动态件自己画，这里不管
    CheckBandZ("prop:" + p.kind, S.z);
    // 落地：贴图底边踩在所在层的地平线上（yOffset 只给挂在树上的东西用）
    const gy = (p.level === "under" ? UNDER_Y : SURFACE_Y) + S.yOffset;
    const gx = S.placeAt === "left" ? p.x - (p.w || 0) / 2 : p.x;
    // 摆位走 PlaceZ、排序走 DepthOrder：行走线上的道具（walk/loose/facade）
    // 一律压回地平面 z=0，与演员踩同一条地平线；深度带只剩绘制顺序这一个职责
    //（见 Data_DepthSpec 的「地平线规范」）。
    const mk = (fn, { z = S.z, x = gx, y = gy } = {}) => {
      const mesh = BakeSprite(S.w, S.h, S.ax, S.ay, fn, 0, S.ss);
      PlaceSprite(mesh, x, y, PlaceZ(z));
      FixOrder(mesh, DepthOrder("play", z));
      mesh.userData.kind = p.kind;
      group.add(mesh);
      return mesh;
    };
    if (S.shadow) AddGroundShadow(group, p.x, (p.w || 2.4) / 2 + 0.6, S.shadow, S.z);
    switch (p.kind) {
      case "mapBoard": {
        // 卸下来的旧门板，斜靠在歇脚点：第六章把情报一条条钉上去
        const { w: bw, h: bh } = S.drawSize;
        mk((ctx, ax, ay) => ART.DrawMapBoard(ctx, ax, ay, bw * PPM, bh * PPM, p.id,
          { pinned: pinnedNotes }));
        break;
      }
      case "house": {
        const W = p.w * PPM, H = p.h * PPM;
        // 可进入的屋子：里外两层。室内剖面画在建筑带上，立面盖在 facade 带
        //（家具之上、演员之下）；人走进门里，UpdateProps 把立面淡出——
        // 勇敢的心式的里外切换。两个带都由 Data_PropArt 的 variants.interior 声明。
        const V2 = S.variants?.interior;
        if (V2 && p.interior && !(ruined && p.burnable)) {
          mk((ctx, ax, ay) => ART.DrawHomeInterior(ctx, ax, ay, W, H, p.id, { night }),
            { z: BAND[V2.innerBand] });
          homeFacade = mk((ctx, ax, ay) => ART.DrawHouse(ctx, ax, ay, W, H, p.id, { burnt: false, night, door: true }),
            { z: BAND[V2.facadeBand] });
          // 屋子占的那段街由 Core 的 HouseSpan 给（判定与画面共用一份边界）。
          // door：门洞中线的世界坐标（DrawHouse 把门开在东头，右缘缩进 10px、
          // 洞宽 30px）——那是画笔的事，留在这儿。NPC 得走到门口才消失在
          // 屋里，不能一挨着东墙就没影
          homeRange = { ...HouseSpan(p), door: p.x + p.w / 2 - 25 / PPM };
          break;
        }
        mk((ctx, ax, ay) => ART.DrawHouse(ctx, ax, ay, W, H, p.id, { burnt: ruined && p.burnable, night, slogan: p.slogan }));
        break;
      }
      case "doorframe": {
        const mesh = mk((ctx, ax, ay) => ART.DrawDoorframe(ctx, ax, ay, p.id, carveState));
        // 两道刻痕分别由 flags.marked / flags.carved 把门，划完才长出来
        carveRebuild = (marks) => {
          const c = mesh.material.map.image;
          const ctx = c.getContext("2d");
          // 就地重绘这张贴图：清空要按画布真实像素（含超采样），
          // 画笔的锚点则用贴图坐标（S.ax/S.ay），不能写死数字
          ctx.save();
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.clearRect(0, 0, c.width, c.height);
          ctx.restore();
          ART.DrawDoorframe(ctx, S.ax, S.ay, p.id, marks);
          mesh.material.map.needsUpdate = true;
        };
        break;
      }
      case "bench": mk((ctx, ax, ay) => ART.DrawBench(ctx, ax, ay, p.id)); break;
      case "stool": mk((ctx, ax, ay) => ART.DrawStool(ctx, ax, ay, p.id)); break;
      case "wallSeg": mk((ctx, ax, ay) => ART.DrawWall(ctx, ax, ay, p.w * PPM, (p.h || 1.8) * PPM, p.id, { burnt: ruined })); break;
      // 码好的柴垛：可翻越物的轮廓样板（肩高、顶沿磨亮、缺一角）
      case "woodStack": mk((ctx, ax, ay) => ART.DrawWoodStack(ctx, ax, ay, p.w * PPM, (p.h || 1.24) * PPM, p.id)); break;
      // 塌进巷子的院墙（可翻越）：宽高从场景数据来，画法见 DrawBrokenWall
      case "brokenWall": mk((ctx, ax, ay) => ART.DrawBrokenWall(ctx, ax, ay, p.w * PPM, (p.h || 0.82) * PPM, p.id)); break;
      case "hatch": mk((ctx, ax, ay) => ART.DrawHatch(ctx, ax, ay, p.id, { open: true })); break;
      case "well": {
        // 第一章：井绳断了半截——辘轳上垂着一小截断头，毛茬朝下。
        // 断没断只改这一张贴图，所以它走 propRedraw 单张重烘，不进 builtKey。
        // 摇把同理：摇辘轳那一拍 World 会在轴心贴一只**会转的**摇把，
        // 静态贴图上那只必须让位——否则同一根轴上叉着两把手。
        const Paint = (ctx, ax, ay, st) => ART.DrawWell(ctx, ax, ay, p.id, {
          night,
          broken: sceneKey === "village" && !!st?.flags.wellRopeBroken,
          crank: !st?.winchView,
        });
        const wellMesh = mk((ctx, ax, ay) => Paint(ctx, ax, ay, state));
        propRedraw.push({
          read: (st) => `${!!st.flags.wellRopeBroken}|${!!st.winchView}`,
          last: `${!!state?.flags.wellRopeBroken}|${!!state?.winchView}`,
          run: (st) => RedrawProp(wellMesh, S, (ctx, ax, ay) => Paint(ctx, ax, ay, st)),
        });
        break;
      }
      case "millstone": mk((ctx, ax, ay) => ART.DrawMillstone(ctx, ax, ay, p.id)); break;
      case "woodpile": {
        // 第一章打水链：麻绳绳头从堆里露出一截（目标同屏露一角），拿走就没了
        const Paint = (ctx, ax, ay, taken) => {
          ART.DrawWoodpile(ctx, ax, ay, p.id);
          if (sceneKey !== "village" || taken) return;
          ctx.strokeStyle = "#9a7d4f";
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(ax + 18, ay - 34);
          ctx.quadraticCurveTo(ax + 34, ay - 40, ax + 40, ay - 26);
          ctx.quadraticCurveTo(ax + 44, ay - 16, ax + 38, ay - 12);
          ctx.stroke();
          ART.InkLine(ctx, ax + 38, ay - 12, ax + 44, ay - 6, p.id + "ropeTip", { lw: 2.4, color: "#8a6a45" });
        };
        const pileMesh = mk((ctx, ax, ay) => Paint(ctx, ax, ay, !!state?.flags.ropeTaken));
        if (sceneKey === "village") {
          propRedraw.push({ flag: "ropeTaken", last: !!state?.flags.ropeTaken,
            run: (st) => RedrawProp(pileMesh, S, (ctx, ax, ay) => Paint(ctx, ax, ay, !!st.flags.ropeTaken)) });
        }
        break;
      }
      // 母鸡蹲在那根待搬的木料上：爪子抬到 0.5m，让她整个落在木料上沿之上。
      // 原来是 16px（0.33m），正好和木料重叠——同一条深度带谁先谁后全看进场
      // 顺序，于是她时不时被自己蹲的那根木料盖住。分开画就没有先后可争。
      // 栖高只属于蹲在木料堆上的那只（perch）；院里啄食的鸡贴地站。
      // 夜里散养的鸡都回窝了——第二章的夜街上不该站着两只发呆的鸡
      case "hen": {
        if (night && !p.perch) break;
        mk((ctx, ax, ay) => ART.DrawHen(ctx, ax, ay - (p.perch ? 13 : 0), p.id));
        break;
      }
      case "ridge": mk((ctx, ax, ay) => ART.DrawRidge(ctx, ax, ay, (p.w || 3) * PPM, p.id)); break;
      case "fallenWood": mk((ctx, ax, ay) => ART.DrawFallenWood(ctx, ax, ay, p.id)); break;
      case "thimble": mk((ctx, ax, ay) => ART.DrawThimble(ctx, ax, ay, p.id)); break;
      case "tree": mk((ctx, ax, ay) => ART.DrawTree(ctx, ax, ay, p.id, { big: p.big, stripped: !!p.stripped, night, bare: ruined })); break;
      case "lamppost": mk((ctx, ax, ay) => ART.DrawLamppost(ctx, ax, ay, p.id, { lit: night })); break;
      case "ditch": mk((ctx, ax, ay) => ART.DrawDitch(ctx, ax, ay, p.w * PPM, p.id)); break;
      case "crops": mk((ctx, ax, ay) => ART.DrawCrops(ctx, ax, ay, p.w * PPM, p.id, { night, veggie: !!p.veggie })); break;
      case "fortWall": mk((ctx, ax, ay) => ART.DrawFortWall(ctx, ax, ay, p.w * PPM, p.h * PPM, p.id)); break;
      case "fortGate": {
        mk((ctx, ax, ay) => {
          ART.DrawFortWall(ctx, ax - 56, ay, 34, 116, p.id + "l");
          ART.DrawFortWall(ctx, ax + 56, ay, 34, 116, p.id + "r");
          ART.DrawLamppost(ctx, ax, ay, p.id + "lamp", { lit: true });
        });
        break;
      }
      case "blockhouse": mk((ctx, ax, ay) => ART.DrawBlockhouse(ctx, ax, ay, p.id, { lit: true })); break;
      case "prison": mk((ctx, ax, ay) => ART.DrawPrison(ctx, ax, ay, p.id, { night: true })); break;
      case "fortSilhouette": {
        mk((ctx) => {
          const W2 = S.w;
          const base = S.ay;
          // 围墙 + 垛口起伏
          ctx.fillStyle = "#2f2921";
          ctx.fillRect(0, base - 96, W2, 96);
          for (let i = 0; i * 34 < W2; i += 1) {
            const hh = 16 + ART.Hash(p.id + "cr" + i) * 12;
            ctx.fillRect(i * 34, base - 96 - hh, 19, hh);
          }
          // 铁丝网
          ctx.save();
          ctx.globalAlpha = 0.55;
          ctx.strokeStyle = "#3d3730";
          ctx.lineWidth = 2;
          for (let r = 0; r < 3; r += 1) {
            ctx.beginPath();
            ctx.moveTo(0, base - 122 - r * 8);
            for (let t = 0; t <= 24; t += 1) {
              ctx.lineTo((W2 * t) / 24, base - 122 - r * 8 + (ART.Hash(p.id + "w" + r + t) - 0.5) * 9);
            }
            ctx.stroke();
          }
          ctx.restore();
          // 院里错落的房脊
          for (let i = 0; i < 5; i += 1) {
            const rx = W2 * (0.12 + ART.Hash(p.id + "rx" + i) * 0.7);
            const rw = 60 + ART.Hash(p.id + "rw" + i) * 70;
            const rh = 34 + ART.Hash(p.id + "rh" + i) * 26;
            ctx.fillStyle = "#332d25";
            ctx.beginPath();
            ctx.moveTo(rx - rw / 2, base - 96);
            ctx.lineTo(rx - rw * 0.3, base - 96 - rh);
            ctx.lineTo(rx + rw * 0.3, base - 96 - rh);
            ctx.lineTo(rx + rw / 2, base - 96);
            ctx.closePath();
            ctx.fill();
          }
          // 炮楼与探照灯杆
          ART.DrawBlockhouse(ctx, W2 * 0.74, base, p.id, { lit: false });
          ctx.fillStyle = "#2b261f";
          ctx.fillRect(W2 * 0.28, base - 200, 5, 104);
          ctx.beginPath();
          ctx.arc(W2 * 0.28 + 2, base - 204, 10, 0, Math.PI * 2);
          ctx.fill();
        });
        break;
      }
      case "dog": mk((ctx, ax, ay) => ART.DrawDog(ctx, ax, ay, p.id)); break;
      // 村里不许有狗：1939 年冀中区党委统一"打狗"（狗叫会暴露夜间行动，
      // 回忆材料原话「出进村庄无犬吠声」）。DrawDog 只留给据点那一侧
      case "emptyKennel": mk((ctx, ax, ay) => ART.DrawEmptyKennel(ctx, ax, ay, p.id)); break;
      case "dungHeap": mk((ctx, ax, ay) => ART.DrawDungHeap(ctx, ax, ay, p.id, { street: !!p.street })); break;
      case "stalkFence": mk((ctx, ax, ay) => ART.DrawStalkFence(ctx, ax, ay, (p.w || 5) * PPM, p.id)); break;
      case "stonePile": mk((ctx, ax, ay) => ART.DrawStonePile(ctx, ax, ay, p.id)); break;
      case "hangLantern":
        mk((ctx, ax, ay) =>
          ART.DrawHangLantern(ctx, ax, ay, p.id, { lit: night && !state?.flags.lanternOut }));
        break;
      case "cloth": {
        // 打没打下来由 hideFlag(clothDown) 走 flagProps 切 visible——命中那一帧
        // 不重建（重建=打中卡一顿）。二章起 clothDown 已在结算里落真，自然不显示；
        // 重玩一章由 StartChapter 把旗清回假，布巾重新挂上树
        mk((ctx, ax, ay) => ART.DrawCloth(ctx, ax, ay, p.id));
        break;
      }
      case "doorLeaf": mk((ctx, ax, ay) => ART.DrawDoorLeaf(ctx, ax, ay, p.id)); break;
      case "vat": mk((ctx, ax, ay) => ART.DrawVat(ctx, ax, ay, p.id)); break;
      case "tuberPile": mk((ctx, ax, ay) => ART.DrawTuberPile(ctx, ax, ay, p.id)); break;
      case "cellarShelf": mk((ctx, ax, ay) => ART.DrawCellarShelf(ctx, ax, ay, p.id)); break;
      case "shed": mk((ctx, ax, ay) => ART.DrawShed(ctx, ax, ay, p.id)); break;
      case "oldDoors": mk((ctx, ax, ay) => ART.DrawOldDoors(ctx, ax, ay, p.id)); break;
      case "cartShafts": mk((ctx, ax, ay) => ART.DrawCartShafts(ctx, ax, ay, p.id)); break;
      case "wallNotice": mk((ctx, ax, ay) => ART.DrawNoticeWall(ctx, ax, ay, p.w * PPM, p.id)); break;
      case "pigpen": mk((ctx, ax, ay) => ART.DrawPigpen(ctx, ax, ay, p.id)); break;
      case "nook": {
        // 藏口的三态（敞着 / 塞了粮袋 / 上了覆土板）跟着旗标走，
        // 单张重烘——藏粮那一拍不该触发整个场景重建
        const Paint = (ctx, ax, ay, st) => ART.DrawNook(ctx, ax, ay, p.id, {
          grain: !!st?.flags.grainHidden && !st?.flags.nookClosed,
          closed: !!st?.flags.nookClosed,
        });
        const nookMesh = mk((ctx, ax, ay) => Paint(ctx, ax, ay, state));
        propRedraw.push({
          read: (st) => `${!!st.flags.grainHidden}|${!!st.flags.nookClosed}`,
          last: `${!!state?.flags.grainHidden}|${!!state?.flags.nookClosed}`,
          run: (st) => RedrawProp(nookMesh, S, (ctx, ax, ay) => Paint(ctx, ax, ay, st)),
        });
        break;
      }
      case "yardWall": mk((ctx, ax, ay) => ART.DrawYardWall(ctx, ax, ay, p.w * PPM, p.id, { gate: p.gate !== false, slogan: p.slogan })); break;
      case "henCoop": mk((ctx, ax, ay) => ART.DrawHenCoop(ctx, ax, ay, p.id)); break;
      case "clothesline": mk((ctx, ax, ay) => ART.DrawClothesline(ctx, ax, ay, p.id)); break;
      case "pump": {
        mk((ctx, ax, ay) => {
          // 水泵/风箱：日军灌烟灌水用的家伙
          ART.InkFill(ctx, ART.Rect(ax - 44, ay - 46, 88, 46), p.id, "#5f5a4a",
            { amp: 1.4, lw: 2.4, shade: "rgba(0,0,0,0.24)" });
          ART.InkFill(ctx, ART.Rect(ax - 12, ay - 74, 24, 30), p.id + "t", "#6b6555", { amp: 1.1, lw: 2.2 });
          ART.InkLine(ctx, ax + 40, ay - 30, ax + 78, ay - 8, p.id + "hose", { lw: 5, color: "#3e372c", amp: 3 });
          ART.InkLine(ctx, ax - 30, ay - 50, ax - 52, ay - 74, p.id + "handle", { lw: 4, color: "#7a5433" });
        });
        break;
      }
      default: break;
    }
    // 这个道具建了哪几个网格（含 AddGroundShadow 的影子）：从记号往后都是它的
    if (p.showFlag || p.hideFlag) flagProps.push({ p, meshes: group.children.slice(meshFrom) });
  }

  function AddCover(group, c, light, ruinedScene = false) {
    const night = light === "night" || light === "dark" || light === "tunnel";
    const gy = SURFACE_Y;
    // 深度按"这东西有多高"来定，不能抽签：高过腰的掩体一旦落到人前面，
    // 就会把角色连人带扛的木料整个吞掉（见 Data_DepthSpec 的 Z 轴规范）。
    // 判定规则（哪些算高、高的退到哪两个带里）写在 Data_PropArt 的 coverBands。
    const cz = CoverBandOf(c, ART.Hash("cz" + c.id));
    CheckBandZ("cover:" + c.kind, cz);
    const S = SpriteOf(c.kind, c, { cover: true });
    if (!S) return;     // ditch：由 props 里的同名物体画，掩体项只管躲藏判定
    AddGroundShadow(group, c.x, (c.w || 2) / 2 + 0.5, 0.22, cz);
    const mk = (fn) => {
      const mesh = BakeSprite(S.w, S.h, S.ax, S.ay, fn, 0, S.ss);
      PlaceSprite(mesh, c.x, gy, cz);
      mesh.userData.kind = c.kind;
      group.add(mesh);
    };
    switch (c.kind) {
      case "haystack": mk(
        (ctx, ax, ay) => {
          if (ruinedScene) {
            // 烧塌的草垛：只剩一圈焦黑的底与几根残秆
            ART.InkFill(ctx, [[ax - c.w * PPM * 0.5, ay], [ax - c.w * PPM * 0.3, ay - 22],
              [ax + c.w * PPM * 0.28, ay - 16], [ax + c.w * PPM * 0.5, ay]],
              c.id + "burn", "#3a332a", { amp: 2.4, lw: 2.2, shade: "rgba(0,0,0,0.3)" });
            for (let i = 0; i < 5; i += 1) {
              ART.InkLine(ctx, ax - 20 + i * 10, ay - 8, ax - 26 + i * 12, ay - 34 - ART.Hash(c.id + i) * 18,
                c.id + "st" + i, { lw: 2, color: "#241f18" });
            }
          } else ART.DrawHaystack(ctx, ax, ay, c.w * PPM, c.id, { night, raided: !!c.raided });
        }); break;
      case "firewood": mk((ctx, ax, ay) => ART.DrawFirewood(ctx, ax, ay, c.w * PPM, c.id)); break;
      case "wallSeg": mk((ctx, ax, ay) => ART.DrawWall(ctx, ax, ay, c.w * PPM, S.drawHeightPx, c.id, { burnt: false })); break;
      case "bush": mk((ctx, ax, ay) => ART.DrawBush(ctx, ax, ay, c.w * PPM, c.id, { night })); break;
      case "ridge": mk((ctx, ax, ay) => ART.DrawRidge(ctx, ax, ay, c.w * PPM, c.id)); break;
      case "crops": mk((ctx, ax, ay) => ART.DrawCrops(ctx, ax, ay, c.w * PPM, c.id, { night })); break;
      default: break;
    }
  }

  // 地下剖面：一整条烘成大贴图（含土层/空腔/支撑木/洞室/竖井）
  function AddUnderground(group, sceneDef, state, sceneKey) {
    const range = sceneDef.walk.under;
    if (!range) return;
    // 地道不是一张平贴图：近侧土层剖面掏空 → 看进去是后退的地面 →
    // 尽头是后壁；支撑木分布在不同 z 上，人从木柱之间穿过去。
    const NEAR_Z = 2.2;     // 近侧剖面（被切开的那一刀）
    const BACK_Z = -5.5;    // 地道后壁
    const TUN_TOP = UNDER_Y + 2.05;   // 参考里的坑道能直腰走，窄段才猫腰

    const x0 = Math.min(range[0] - 6, -20);
    const x1 = Math.max(range[1] + 6, sceneDef.length + 20);
    const wPx = Math.ceil((x1 - x0) * PPM);
    const topWorld = SURFACE_Y;
    const botWorld = UNDER_Y - 2.6;
    const hPx = Math.ceil((topWorld - botWorld) * PPM);
    const toPx = (wx) => (wx - x0) * PPM;
    const toPy = (wy) => (topWorld - wy) * PPM;
    const tunTop = toPy(TUN_TOP);
    const tunBot = toPy(UNDER_Y);

    // 洞顶跟着各段净高走：该爬的地方顶就压下来。玩法、美术、光照都从
    // TunnelPosture 取同一个值，免得"画得能站、走起来却要爬"
    const CeilY = (wx) => toPy(UNDER_Y + POSTURE_HEAD[TunnelPosture(sceneDef, wx)])
      + ART.CavityProfile(wx, sceneKey + "cav", 0, 0).top * 0.5;

    // 井筒的形状只算一次：掏土、描洞沿、井壁贴片三处都得用同一条轮廓，
    // 各画各的就又会出现"三个宽度不一样的矩形套在一起"
    const SHAFT_R = 0.86;                    // 井筒半径（米）：够一个人带着筐上下
    const shaftGeom = (sceneDef.shafts || [])
      .filter((s) => !s.builtFlag || state.flags[s.builtFlag])
      .map((s) => {
        const yTop = toPy(SURFACE_Y) - 0.10 * PPM;             // 井口啃掉地面一线
        const yBot = Math.max(tunTop, CeilY(s.x)) + 0.12 * PPM; // 一直掏进走廊顶
        const span = Math.max(1, yBot - yTop);
        const half = (y) => {
          const u = Math.max(0, Math.min(1, (y - yTop) / span));
          // 井口塌出一圈、井底张成喇叭并进洞顶；中段两壁只有手挖的起伏
          const flare = 1
            + 0.55 * (u > 0.78 ? ((u - 0.78) / 0.22) ** 2 : 0)
            + 0.34 * (u < 0.14 ? ((0.14 - u) / 0.14) ** 2 : 0);
          const wob = Math.sin(y * 0.05 + ART.Hash(s.id) * 9) * 0.055
            + Math.sin(y * 0.017 + ART.Hash(s.id + "b") * 6) * 0.045;
          return (SHAFT_R + wob) * flare * PPM;
        };
        return { id: s.id, wx: s.x, x: toPx(s.x), yTop, yBot, half };
      });

    // —— 1) 近侧土层剖面：把地道那一块真正掏成透明，才看得进去
    const face = BakeSprite(wPx, hPx, 0, toPy(SURFACE_Y), (ctx) => {
      ART.DrawEarthStrata(ctx, 0, wPx, toPy(SURFACE_Y), hPx, sceneKey + "earth");
      // 土体整体压暗：参考里的地下几乎是纯黑，细节只留在洞沿一圈
      ctx.save();
      ctx.globalCompositeOperation = "source-atop";
      const dk = ctx.createLinearGradient(0, toPy(SURFACE_Y), 0, hPx);
      dk.addColorStop(0, "rgba(12,9,5,0.44)");
      dk.addColorStop(0.35, "rgba(10,7,4,0.80)");
      dk.addColorStop(1, "rgba(6,4,2,0.92)");
      ctx.fillStyle = dk;
      ctx.fillRect(0, toPy(SURFACE_Y), wPx, hPx);
      ctx.restore();
      ctx.save();
      ctx.globalCompositeOperation = "destination-out";
      // 走廊：沿 x 按起伏掏出来，边缘是波浪的土沿而不是直线
      ctx.beginPath();
      ctx.moveTo(toPx(range[0]), CeilY(range[0]));
      for (let wx = range[0]; wx <= range[1]; wx += 0.8) ctx.lineTo(toPx(wx), CeilY(wx));
      for (let wx = range[1]; wx >= range[0]; wx -= 1.2) {
        ctx.lineTo(toPx(wx), tunBot + ART.CavityProfile(wx, sceneKey + "cav", 0, 0).bot);
      }
      ctx.closePath();
      ctx.fill();
      // 洞室 / 旁洞：直得起腰的地方。顶要拱起来，不能是个平顶方盒——
      // 走廊只有一米多，旁边突然接一个三米的方箱子，读起来像贴图错位
      const Dome = (cx, halfW, topY) => {
        ctx.beginPath();
        ctx.moveTo(toPx(cx - halfW), tunBot);
        ctx.bezierCurveTo(toPx(cx - halfW * 0.72), topY, toPx(cx + halfW * 0.72), topY, toPx(cx + halfW), tunBot);
        ctx.closePath();
        ctx.fill();
      };
      const domes = [];
      for (const p of sceneDef.props) {
        if (p.kind === "chamber") { Dome(p.x, p.w / 2, toPy(UNDER_Y + 2.5)); domes.push([p.x, p.w / 2, toPy(UNDER_Y + 2.5)]); }
        else if (p.kind === "pocket") { Dome(p.x, 2.8, toPy(UNDER_Y + 2.2)); domes.push([p.x, 2.8, toPy(UNDER_Y + 2.2)]); }
      }
      // 翻口：地道在这一段往下沉一个 U 形弯，得跟走廊一样从土里掏出来
      for (const p of sceneDef.props) {
        if (p.kind !== "waterTrap") continue;
        if (p.builtFlag && !state.flags[p.builtFlag]) continue;
        const tw = 3.4 * PPM, td = 1.05 * PPM;
        ctx.beginPath();
        ctx.moveTo(toPx(p.x) - tw / 2, tunBot);
        ctx.bezierCurveTo(toPx(p.x) - tw * 0.28, tunBot + td,
          toPx(p.x) + tw * 0.28, tunBot + td, toPx(p.x) + tw / 2, tunBot);
        ctx.closePath();
        ctx.fill();
      }
      // 竖井：一条**掏出来**的井筒，不是拿方框抠的洞。
      // 老写法是一句 fillRect——笔直两壁、方角、井底与走廊硬碰硬地对接，
      // 再加上 DrawShaft 里那根比洞还窄的浅色"井筒"贴片，三个宽度不一样的
      // 矩形套在一起，看着就是贴图破了（用户原话：像 bug）。
      // 现在：两壁带起伏、井口啃出一圈、井底张成喇叭口并进走廊顶，
      // 而且**掏到本段走廊真正的洞顶**——窄段的顶比 TUN_TOP 低一米，
      // 按 TUN_TOP 截会在井底与走廊之间留一块没挖通的土。
      for (const g of shaftGeom) {
        ctx.beginPath();
        ctx.moveTo(g.x - g.half(g.yTop), g.yTop);
        for (let y = g.yTop; y <= g.yBot; y += 5) ctx.lineTo(g.x - g.half(y), y);
        for (let y = g.yBot; y >= g.yTop; y -= 5) ctx.lineTo(g.x + g.half(y), y);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
      // 洞沿：一圈粗墨线 + 往土里晕开的暗，让"掏出来的洞"读得出来
      ctx.globalCompositeOperation = "source-over";
      ctx.beginPath();
      ctx.moveTo(toPx(range[0]), CeilY(range[0]));
      for (let wx = range[0]; wx <= range[1]; wx += 0.8) ctx.lineTo(toPx(wx), CeilY(wx));
      ctx.strokeStyle = "rgba(24,17,10,0.75)";
      ctx.lineWidth = 7;
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(toPx(range[0]), tunBot);
      for (let wx = range[0]; wx <= range[1]; wx += 1.2) {
        ctx.lineTo(toPx(wx), tunBot + ART.CavityProfile(wx, sceneKey + "cav", 0, 0).bot);
      }
      ctx.strokeStyle = "rgba(24,17,10,0.6)";
      ctx.lineWidth = 5;
      ctx.stroke();
      // 洞室的穹顶也要有洞沿：走廊的墨线只描到 CeilY，洞室那一段是
      // destination-out 掏出来的光边——没有这一圈，穹顶读起来像贴图漏了一块
      for (const [cx, halfW, topY] of domes) {
        ctx.beginPath();
        ctx.moveTo(toPx(cx - halfW), tunBot);
        ctx.bezierCurveTo(toPx(cx - halfW * 0.72), topY, toPx(cx + halfW * 0.72), topY, toPx(cx + halfW), tunBot);
        ctx.strokeStyle = "rgba(24,17,10,0.7)";
        ctx.lineWidth = 6;
        ctx.stroke();
      }
      // 井壁也要洞沿：走廊、洞室都描了，唯独竖井没有，于是井口那一圈成了
      // 土层贴图被裁掉的直边——"像 bug"最直接的一笔就是这里。
      // 描到喇叭口就收（再往下就横在洞顶上了），并在井口啃一圈碎土
      for (const g of shaftGeom) {
        const stopY = g.yBot - 0.42 * PPM;
        for (const side of [-1, 1]) {
          ctx.beginPath();
          ctx.moveTo(g.x + side * g.half(g.yTop), g.yTop);
          for (let y = g.yTop; y <= stopY; y += 5) ctx.lineTo(g.x + side * g.half(y), y);
          ctx.strokeStyle = "rgba(24,17,10,0.62)";
          ctx.lineWidth = 5.5;
          ctx.stroke();
        }
        // 井口一圈翻出来的碎土：把地面那条直边啃断
        for (let i = 0; i < 9; i += 1) {
          const t = i / 8;
          const px = g.x - g.half(g.yTop) * 1.16 + t * g.half(g.yTop) * 2.32;
          const r = (3.4 + ART.Hash(g.id + "cr" + i) * 5.2);
          ctx.beginPath();
          ctx.arc(px, g.yTop + (ART.Hash(g.id + "cy" + i) - 0.35) * 7, r, 0, Math.PI * 2);
          ctx.fillStyle = i % 2 ? "rgba(58,44,28,0.85)" : "rgba(78,60,38,0.8)";
          ctx.fill();
        }
      }
    });
    PlaceSprite(face, x0, SURFACE_Y, NEAR_Z);
    group.add(face);

    // 洞口内侧的暗角：顶沿最重、往下渐收。"往里看"的纵深靠它。
    // 高度要盖满这一段最高的空腔——村里的地窖直得起腰（2.5m 穹顶），
    // 还按地道走廊的 1.55m 烘的话，暗角在窖里拦腰一道硬缝
    const vignH = sceneDef.props.some((p) => p.kind === "chamber") ? 2.55 : 1.55;
    const vign = BakeSprite(
      Math.ceil((range[1] - range[0] + 4) * PPM), Math.ceil(vignH * PPM),
      0, Math.ceil(vignH * PPM),
      (ctx) => {
        const w = Math.ceil((range[1] - range[0] + 4) * PPM);
        const h = Math.ceil(vignH * PPM);
        const grd = ctx.createLinearGradient(0, 0, 0, h);
        grd.addColorStop(0, "rgba(18,13,8,0.72)");
        grd.addColorStop(0.42, "rgba(18,13,8,0.18)");
        grd.addColorStop(1, "rgba(18,13,8,0.30)");
        ctx.fillStyle = grd;
        ctx.fillRect(0, 0, w, h);
      });
    PlaceSprite(vign, range[0] - 2, UNDER_Y, NEAR_Z - 0.4);
    vign.material.depthWrite = false;
    group.add(vign);

    // —— 2) 地道地面：躺平的几何，从近侧一直铺到后壁，会向纵深收
    const floorTex = (() => {
      const c = MakeCanvas(1200, 400);
      const g = c.getContext("2d");
      const grd = g.createLinearGradient(0, 0, 0, 400);
      grd.addColorStop(0, "#4a3722");    // 远端（后壁根）更暗
      grd.addColorStop(1, "#8a6b46");    // 近端
      g.fillStyle = grd;
      g.fillRect(0, 0, 1200, 400);
      // 踩出来的一条路，和几道拖痕
      g.save();
      g.globalAlpha = 0.30;
      g.strokeStyle = "#6b5236";
      for (let i = 0; i < 24; i += 1) {
        const y = 40 + ART.Hash(sceneKey + "fl" + i) * 320;
        g.lineWidth = 2 + ART.Hash(sceneKey + "fw" + i) * 5;
        g.beginPath();
        g.moveTo(0, y);
        for (let t = 0; t <= 12; t += 1) g.lineTo((t / 12) * 1200, y + (ART.Hash(sceneKey + "f" + i + t) - 0.5) * 12);
        g.stroke();
      }
      g.restore();
      ART.Speckle(g, 0, 0, 1200, 400, sceneKey + "fsp", { count: 300, alpha: 0.14, size: 3, color: "#3a2c1c" });
      return CanvasTexture(c);
    })();
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(range[1] - range[0] + 4, NEAR_Z - BACK_Z),
      new THREE.MeshBasicMaterial({ map: floorTex }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.set((range[0] + range[1]) / 2, UNDER_Y, (NEAR_Z + BACK_Z) / 2);
    FixOrder(floor, LAYER_ORDER.play - 30);
    group.add(floor);

    // —— 3) 后壁：地道尽头那面土墙，带镐痕
    const backW = range[1] - range[0] + 4;
    const back = BakeSprite(Math.ceil(backW * PPM), Math.ceil(3.6 * PPM), 0, Math.ceil(3.6 * PPM), (ctx) => {
      const w = Math.ceil(backW * PPM), h = Math.ceil(3.6 * PPM);
      const grd = ctx.createLinearGradient(0, 0, 0, h);
      grd.addColorStop(0, "#3a2c1c");
      grd.addColorStop(1, "#5c4630");
      ctx.fillStyle = grd;
      ctx.fillRect(0, 0, w, h);
      // 镐痕：一道道弧
      ctx.save();
      ctx.globalAlpha = 0.26;
      ctx.strokeStyle = "#2b2015";
      ctx.lineWidth = 3;
      for (let i = 0; i < w / 26; i += 1) {
        const px = i * 26 + ART.Hash(sceneKey + "pk" + i) * 14;
        const py = 20 + ART.Hash(sceneKey + "pky" + i) * (h - 40);
        ctx.beginPath();
        ctx.arc(px, py, 12 + ART.Hash(sceneKey + "pr" + i) * 10, 0.6, 2.4);
        ctx.stroke();
      }
      ctx.restore();
      ART.Speckle(ctx, 0, 0, w, h, sceneKey + "bsp", { count: Math.round(w / 12), alpha: 0.18, size: 3, color: "#241a10" });
    });
    PlaceSprite(back, range[0] - 2, UNDER_Y, BACK_Z);
    group.add(back);

    // —— 4) 支撑木：分布在不同 z 上，人从木柱之间穿过去
    const beamZ = [BACK_Z + 1.2, -2.4, -0.3, 1.6];
    let bi = 0;
    for (let x = range[0] + 3; x < range[1] - 2; x += 2.8 + ART.Hash(sceneKey + "gap" + Math.round(x)) * 3.4) {
      const z = beamZ[bi % beamZ.length];
      bi += 1;
      const beamH = Math.ceil((TUN_TOP - UNDER_Y) * PPM);
      const beam = BakeSprite(170, beamH + 14, 85, beamH + 6, (ctx, ax, ay) => {
        ART.DrawCrudeTimber(ctx, ax, 6, ay, sceneKey + "bm" + Math.round(x));
      }, 0, 3);
      PlaceSprite(beam, x, UNDER_Y, z);
      // 越近越亮越大（挡在人前面），越远越暗越小 —— 前后关系就读出来了
      const t = (z - BACK_Z) / (NEAR_Z - BACK_Z);          // 0 远 → 1 近
      const tint = 0.74 + t * 0.42;
      beam.material.color.setRGB(tint, tint * 0.97, tint * 0.92);
      beam.material.opacity = 0.9 + t * 0.1;
      group.add(beam);
    }

    // —— 4.5) 井筒内壁：**掏开的洞得看得见里面**。
    // 原先近侧剖面一挖穿，井口那一截就直接露出后面的背景，一片平色，
    // 所以那个洞读起来是"贴图漏了"。这里在演员之后补一张井筒的后壁：
    // 竖着的镐痕、越深越黑，井口再落一线天光下来——这作品叫《地道里的光》，
    // 从井口漏下来的那一道就该是它最认得出的一张脸。
    // **摆在哪一层是有讲究的**：近侧剖面在 NEAR_Z=2.2，比玩家近两米多，
    // 所以透过它看出去的那个"窗口"被透视放大了一截。井壁要是跟地道后壁一样
    // 摆到 BACK_Z 附近，它被缩得比窗口还小，四周就漏出后面的浅色——那正是
    // 这个洞看着像"贴图漏了"的原因。井壁贴到玩家背后一点点（SHAFT_BACK_Z），
    // 再按玩法机位的视差比放大，才刚好把窗口填满。
    const SHAFT_BACK_Z = BAND.nearBack;   // 紧贴行走线之后那一档（不许写裸 z）
    // ≈ (机位距 + 0.9) / (机位距 − NEAR_Z)。玩法机位画宽 12.3~16m 时是 1.21~1.29，
    // 取 1.40 留点余量——多出来的部分被不透明的近侧剖面挡着，不露；少了才会漏白边
    const SHAFT_FILL = 1.40;
    for (const g of shaftGeom) {
      // 井壁只画到走廊洞顶为止，不跟着喇叭口一起张开——张开了就会在地道里
      // 糊出一块带硬边的黑斑（走廊自己的后壁从那儿接手）
      const yWallBot = g.yBot - 0.34 * PPM;
      // 只夹住井底那个喇叭口（1.36 比井口的张度 1.34 略大，所以井口不被夹——
      // 夹到井口，两边就会漏出一条亮土的窄缝，看着又像贴图没对齐）
      const halfW = (y) => Math.min(g.half(y), SHAFT_R * 1.36 * PPM) * SHAFT_FILL;
      const hM = ((yWallBot - g.yTop) / PPM) * SHAFT_FILL;
      const wM = (halfW(g.yTop) * 2.5) / PPM;
      const wp = Math.ceil(wM * PPM), hp = Math.ceil(hM * PPM);
      // 井壁按井筒的轮廓剪出来（不是一块方贴片）：外面透明，
      // 所以就算画大了也只在洞口里露出来，不会在地道里糊成一个黑方块
      const Silhouette = (ctx) => {
        const k = hp / Math.max(1, yWallBot - g.yTop);
        ctx.beginPath();
        ctx.moveTo(wp / 2 - halfW(g.yTop), 0);
        for (let y = g.yTop; y <= yWallBot; y += 5) ctx.lineTo(wp / 2 - halfW(y), (y - g.yTop) * k);
        for (let y = yWallBot; y >= g.yTop; y -= 5) ctx.lineTo(wp / 2 + halfW(y), (y - g.yTop) * k);
        ctx.closePath();
      };
      const wall = BakeSprite(wp, hp, wp / 2, hp, (ctx) => {
        ctx.save();
        Silhouette(ctx);
        ctx.clip();
        const grd = ctx.createLinearGradient(0, 0, 0, hp);
        grd.addColorStop(0, "#6b5236");        // 井口：还沾着点天光
        grd.addColorStop(0.38, "#33271a");
        grd.addColorStop(1, "#170f09");        // 井底最黑
        ctx.fillStyle = grd;
        ctx.fillRect(0, 0, wp, hp);
        // 竖着一道道的镐痕：井是往下掏的，痕迹就该是竖的（走廊那面是横的）
        ctx.globalAlpha = 0.34;
        ctx.strokeStyle = "#120d08";
        for (let i = 0; i < 11; i += 1) {
          const px = 6 + ART.Hash(g.id + "pk" + i) * (wp - 12);
          const py = 8 + ART.Hash(g.id + "py" + i) * hp * 0.72;
          ctx.lineWidth = 2 + ART.Hash(g.id + "pw" + i) * 3;
          ctx.beginPath();
          ctx.moveTo(px, py);
          ctx.lineTo(px + (ART.Hash(g.id + "pd" + i) - 0.5) * 9, py + 24 + ART.Hash(g.id + "pl" + i) * 46);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
        ART.Speckle(ctx, 0, 0, wp, hp, g.id + "sp", { count: Math.round(hp / 6), alpha: 0.2, size: 3, color: "#0d0906" });
        ctx.restore();
      });
      PlaceSprite(wall, g.wx, UNDER_Y + (g.yBot - yWallBot) / PPM, SHAFT_BACK_Z);
      group.add(wall);

      // 井口漏下来的一线光：上宽下窄，落到地道口就散了。
      // 这作品叫《地道里的光》——从井口斜下来的那一道，就该是它最认得出的一张脸
      const beam = BakeSprite(wp, hp, wp / 2, hp, (ctx) => {
        ctx.save();
        Silhouette(ctx);
        ctx.clip();
        const grd = ctx.createLinearGradient(0, 0, 0, hp);
        grd.addColorStop(0, "rgba(255,236,186,0.50)");
        grd.addColorStop(0.5, "rgba(255,228,170,0.16)");
        grd.addColorStop(1, "rgba(255,220,160,0)");
        ctx.fillStyle = grd;
        ctx.beginPath();
        ctx.moveTo(wp * 0.30, 0);
        ctx.lineTo(wp * 0.72, 0);
        ctx.lineTo(wp * 0.62, hp);
        ctx.lineTo(wp * 0.40, hp);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      });
      PlaceSprite(beam, g.wx, UNDER_Y + (g.yBot - yWallBot) / PPM, SHAFT_BACK_Z + 0.05);
      beam.material.blending = THREE.AdditiveBlending;
      beam.material.depthWrite = false;
      // 夜里井口没有天光，只剩一点点月色；白天才是那道亮的
      beam.material.opacity = (CHAPTERS[state.chapterIndex].light === "day" ? 1 : 0.3);
      group.add(beam);
    }

    // —— 5) 竖井与洞里的零件（贴在中景，人可以从它前后经过）
    for (const shaft of sceneDef.shafts) {
      if (shaft.builtFlag && !state.flags[shaft.builtFlag]) continue;
      const sh = BakeSprite(90, Math.ceil((SURFACE_Y - UNDER_Y + 0.6) * PPM), 45,
        Math.ceil((SURFACE_Y - UNDER_Y + 0.6) * PPM), (ctx, ax, ay) => {
          // 梯脚落在地道地面上（ay 就是地平线），梯头露出井口一点
          ART.DrawShaft(ctx, ax, 0.32 * PPM, ay - 1, shaft.id);
        }, 0, 2);
      // 梯子必须看得见——它是玩家判断"这儿能上下"的唯一依据。绘制序号排在
      // loose 带（行走线道具之前、演员之后），免得被洞口、磨盘这些中景件压掉；
      // 位置照旧压在地平面上（原来这里写的是裸 z=0.45，梯子因此比洞口高半拃）
      PlaceSprite(sh, shaft.x, UNDER_Y, PlaceZ(BAND.loose));
      FixOrder(sh, DepthOrder("play", BAND.loose));
      group.add(sh);
    }
    for (const p of sceneDef.props) {
      if (p.kind === "waterTrap") {
        // 挖好之前地上什么也没有——第四章那场烟正是因为还没有它
        if (p.builtFlag && !state.flags[p.builtFlag]) continue;
        const tw = 3.4;
        const t = BakeSprite(Math.ceil(tw * PPM) + 24, 130, Math.ceil(tw * PPM) / 2 + 12, 8,
          (ctx, ax, ay) => ART.DrawWaterTrap(ctx, ax, ay, tw * PPM, p.id), 0, PROP_SS);
        // 近侧那一刀土在 z=2.2；弯要画在它之前，不然连同水一起被土盖掉
        PlaceSprite(t, p.x, UNDER_Y, 2.0);
        group.add(t);
      } else if (p.kind === "vent") {
        const v = BakeSprite(60, Math.ceil((SURFACE_Y - TUN_TOP + 0.4) * PPM), 30,
          Math.ceil((SURFACE_Y - TUN_TOP + 0.4) * PPM), (ctx, ax, ay) => {
            ART.DrawVentPipe(ctx, ax, 4, ay, p.id);
          }, 0, 2);
        PlaceSprite(v, p.x, TUN_TOP, -2.0);
        group.add(v);
      } else if (p.kind === "bell") {
        const b = BakeSprite(80, 90, 40, 78, (ctx, ax, ay) => ART.DrawBell(ctx, ax, ay - 40, p.id, {}), 0, 3);
        PlaceSprite(b, p.x, TUN_TOP - 0.7, -1.0);
        group.add(b);
      } else if (p.kind === "chamber" || p.kind === "pocket") {
        // 洞室的后壁再退一层，读出"这里更深"
        const cw = (p.kind === "chamber" ? p.w : 5.6);
        const cb = BakeSprite(Math.ceil(cw * PPM), Math.ceil(3.4 * PPM), 0, Math.ceil(3.4 * PPM), (ctx) => {
          const w = Math.ceil(cw * PPM), h = Math.ceil(3.4 * PPM);
          const grd = ctx.createLinearGradient(0, 0, 0, h);
          grd.addColorStop(0, "#2e2317");
          grd.addColorStop(1, "#4a3a26");
          ctx.fillStyle = grd;
          ctx.fillRect(0, 0, w, h);
          ART.Speckle(ctx, 0, 0, w, h, p.id + "sp", { count: 90, alpha: 0.2, size: 3, color: "#1e1710" });
        });
        PlaceSprite(cb, p.x - cw / 2, UNDER_Y, BACK_Z - 2.5);
        group.add(cb);
      }
    }
  }

  function AddCollapses(group, sceneDef) {
    collapseMeshes = {};
    for (const p of sceneDef.props) {
      if (p.kind !== "collapse") continue;
      const mesh = BakeSprite(130, 110, 65, 104, (ctx, ax, ay) => ART.DrawCollapsePile(ctx, ax, ay, 1, p.id), 0, DETAIL_SS);
      PlaceSprite(mesh, p.x, UNDER_Y, 0);
      group.add(mesh);
      collapseMeshes[p.id] = mesh;
    }
  }

  // -------------------------------------------------------------------------
  let pinnedNotes = 0;

  // 只随旗标"出没"的道具（建一次，切 visible）与"只改画法"的道具（只重烘自己那张）
  let flagProps = [];
  let propRedraw = [];

  // 重烘一张道具贴图。BakeSprite 按 ss 给画布加了密，重画得把缩放补回去
  function RedrawProp(mesh, S, drawFn) {
    const canvas = mesh?.material?.map?.image;
    if (!canvas?.getContext) return;
    const ctx = canvas.getContext("2d");
    ctx.setTransform(S.ss, 0, 0, S.ss, 0, 0);
    ctx.clearRect(0, 0, S.w, S.h);
    drawFn(ctx, S.ax, S.ay);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    mesh.material.map.needsUpdate = true;
  }

  function BuildEnvironment(state) {
    // 门板上的纸条是烘进贴图的，钉一条就得重烘一次
    const pins = state.beat?.pinned || 0;
    if (pins !== pinnedNotes) { pinnedNotes = pins; builtKey = ""; }
    const ch0 = CHAPTERS[state.chapterIndex];
    // 光照档取**画面上正用着的那一档**（ShownLight），不是 beat 想要的那一档：
    // 换挡时整村要重烘一遍，那一下推迟到过渡最暗处再做（见 LIGHT_MOOD 那一段）
    const ch = { ...ch0, light: ShownLight(state) };
    const f = state.flags;
    const key = `${ch.scene}:${ch.light}:${f.ruined ? 1 : 0}:${f.hiddenBuilt ? 1 : 0}`
      + `:${state.chapterIndex}:${f.lanternOut ? 1 : 0}:${f.quiltPlugged ? 1 : 0}:${f.trapBuilt ? 1 : 0}`;
    // henFlew / thimbleFound / raidStarted / clothDown 只决定某个道具在不在
    //（flagProps 切 visible），ropeTaken / wellRopeBroken 只改一张贴图的画法
    //（propRedraw 单张重烘）——一个都不进 builtKey。进了就是"捡个顶针卡一下"
    //（clothDown 就犯过：石子打中头巾那一帧整场重建，正打中的高兴劲卡个顿）。
    if (key === builtKey) return;
    builtKey = key;
    flagProps = [];
    propRedraw = [];
    carveState = { marked: !!state.flags.marked, carved: !!state.flags.carved };
    carveRebuild = null;
    ClearBackdropFolk();   // 骨架的材质 ClearGroup 收不到，得先自己收
    for (const k of Object.keys(layers)) if (k !== "ots") ClearGroup(layers[k]);
    InvalidateSceneCaches();
    dustMotes = [];
    for (const g of glows) scene.remove(g);
    glows.length = 0;
    sceneLights = [];

    const sceneDef = SCENES[ch.scene];
    const L = sceneDef.length;
    const night = ch.light === "night" || ch.light === "dark" || ch.light === "tunnel";
    hazeColor = {
      day: "#e2d8bc", dawn: "#d8c6a8", dusk: "#c9a077", night: "#2a3752", tunnel: "#2c2318", dark: "#171310",
    }[ch.light] || "#e2d8bc";

    // 遮挡掩码：土是实心的，地道/洞室/竖井是掏出来的空气
    const occ = SceneOccluders(sceneDef, state, SURFACE_Y, UNDER_Y);
    occluder = BuildOccluder(occ.bounds, occ.solids, occ.air);

    // 天空
    const skyColors = {
      day: ["#cfd8dc", "#e6dcc0"], night: ["#0e1424", "#1e2740"],
      dawn: ["#8f8fa6", "#e0bc92"], dusk: ["#6b5f78", "#dfa671"], tunnel: ["#141a26", "#2a2418"], dark: ["#0a0d14", "#181410"],
    }[ch.light] || ["#cfd8dc", "#e6dcc0"];
    {
      const skyW = Math.ceil((L + 160) * PPM * 0.14);
      const skyH = 520;
      const skyMesh = BakeSprite(skyW, skyH, 0, skyH, (ctx) => {
        const g = ctx.createLinearGradient(0, 0, 0, skyH);
        g.addColorStop(0, skyColors[0]);
        g.addColorStop(1, skyColors[1] || skyColors[0]);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, skyW, skyH);
        ART.DrawSky(ctx, skyW, skyH, ch.light, ch.scene + "sky");
      });
      PlaceSprite(skyMesh, -80, -14, 0);
      ScaleKeepGround(skyMesh, 7.2, (26 + 14) / (skyH / PPM));
      layers.sky.add(skyMesh);
    }
    // 地平线暖雾：把天和地缝起来，也是纵深的一部分
    {
      const hazeColor = {
        day: "rgba(214,190,148,0.55)", dawn: "rgba(226,186,142,0.6)",
        night: "rgba(58,68,96,0.5)", tunnel: "rgba(52,44,32,0.5)", dark: "rgba(30,26,22,0.5)",
      }[ch.light] || "rgba(214,190,148,0.5)";
      const wPx = Math.ceil((L + 160) * PPM * 0.2);
      const hPx = 200;
      const haze = BakeSprite(wPx, hPx, 0, hPx, (ctx) => {
        const g = ctx.createLinearGradient(0, 0, 0, hPx);
        g.addColorStop(0, "rgba(0,0,0,0)");
        g.addColorStop(1, hazeColor);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, wPx, hPx);
      }, 2);
      PlaceSprite(haze, -80, SURFACE_Y - 0.5, 0);
      ScaleKeepGround(haze, 5, 1);
      layers.hills.add(haze);
    }

    // 远景分层（越远越糊越淡：假景深）
    const pal = {
      day: { ridge: "#a1957a", hill: "#8a7850", town: "#96836a" },
      dawn: { ridge: "#968a79", hill: "#7c7364", town: "#8a7e6f" },
      night: { ridge: "#2a3244", hill: "#212938", town: "#39415a" },
      tunnel: { ridge: "#2a2a30", hill: "#232227", town: "#33313a" },
      dark: { ridge: "#1c1c22", hill: "#17171c", town: "#24232a" },
    }[ch.light] || { ridge: "#b6ab90", hill: "#a08e6a", town: "#a8967a" };

    // 平原：起伏压到几个像素，纵深交给雾、树行与远村的剪影（见 AddRidgeBand）
    AddRidgeBand(layers.ridge, L, pal.ridge, ch.scene + "ridge",
      { amp: 6, base: 30, blur: LAYER_BLUR.ridge, lift: 1.6, haze: 0.5, rows: 26 });
    AddRidgeBand(layers.hills, L, pal.hill, ch.scene + "hill",
      { amp: 4, base: 18, blur: LAYER_BLUR.hills, lift: 0.7, haze: 0.3, rows: 34 });
    // 地平线上的炮楼：每隔几里一座，站在村里往哪边看都能看见
    AddHorizonForts(sceneDef.horizonForts, pal.hill, night, state.flags.ruined);

    // 各深度层各铺一条地面：透视下它们逐级收向地平线，地就"退"出去了
    const farEarth = {
      day: ["#c0a675", "#ad9260"], dawn: ["#ab9880", "#94826c"],
      night: ["#3f4757", "#333b4a"], tunnel: ["#3a352c", "#2e2a22"], dark: ["#26231e", "#1d1b17"],
    }[ch.light] || ["#c0a675", "#ad9260"];
    // 田块的三种颜色：返青的冬麦 / 留茬翻过的地 / 田埂。
    // 1943 春的冀中，麦子是去年秋播、开春返青的——地里该是绿的，不是荒的
    const cropPal = {
      day: { wheat: "#8d9a58", stubble: "#b79a67", ridge: "rgba(96,74,46,0.5)" },
      dawn: { wheat: "#7d8760", stubble: "#a38f72", ridge: "rgba(84,68,48,0.5)" },
      night: { wheat: "#39485044", stubble: "#3a4250", ridge: "rgba(22,28,38,0.55)" },
      tunnel: { wheat: "#35362a", stubble: "#37332a", ridge: "rgba(24,20,14,0.5)" },
      dark: { wheat: "#23241c", stubble: "#24221d", ridge: "rgba(16,14,10,0.5)" },
    }[ch.light] || { wheat: "#8d9a58", stubble: "#b79a67", ridge: "rgba(96,74,46,0.5)" };
    for (const [key, tint, depth] of [
      ["hills", 0.55, 9], ["farTown", 0.72, 7], ["midTrees", 0.85, 6], ["nearTrees", 1, 5],
    ]) {
      if (ch.scene === "tunnelFort" && key !== "nearTrees") continue;
      const wPx = Math.ceil((L + 160) * PPM);
      const hPx = Math.round(depth * PPM);
      const band = BakeSprite(wPx, hPx, 0, 4, (ctx) => {
        const g = ctx.createLinearGradient(0, 0, 0, hPx);
        g.addColorStop(0, farEarth[0]);
        g.addColorStop(1, farEarth[1]);
        ctx.fillStyle = g;
        ctx.fillRect(0, 4, wPx, hPx - 4);
        // 冀中平原一眼望去全是耕地——地不能是一条纯色板
        ART.PaintFarmland(ctx, wPx, hPx, key + "farm", {
          wheat: cropPal.wheat, stubble: cropPal.stubble, ridge: cropPal.ridge,
          // 越远的带子块越碎、垄沟越细（近处那条才看得出一垄一垄）
          strips: depth >= 8 ? 26 : depth >= 7 ? 22 : 18, furrow: depth <= 6,
        });
        ctx.strokeStyle = "rgba(43,31,22,0.5)";
        ctx.lineWidth = 2.4;
        ctx.beginPath();
        ctx.moveTo(0, 4);
        for (let px = 0; px <= wPx; px += 44) ctx.lineTo(px, 4 + (ART.Hash(key + px) - 0.5) * 5);
        ctx.stroke();
        // 雾量只取该层本来的空气透视值：这点带压带的半透明原本混的是同为
        // 土色的下一条带，不是天——照 HazeSolid 折算会把整块地洗成天色，
        // 田块和麦子全看不见了
      }, LAYER_BLUR[key] || 0, 1, HazeSolid(key, 1, 0.65));
      PlaceSprite(band, -80, SURFACE_Y, 0);
      layers[key].add(band);
    }
    if (ch.scene === "village" || ch.scene === "tunnelVillage") {
      AddParallaxTown(layers.farTown, -10, L + 10,
        state.flags.ruined && ch.light !== "night" ? "#7d7466" : pal.town,
        ch.scene + "town", { ruined: state.flags.ruined, objScale: 1 / LAYER_COMP.farTown,
          // 站在村街上，身后就是全村的房——村庄场景的远景要密一档、实一档，
          // 不然中景一空整个画面只剩天和地两条色带
          opacity: 0.78 });
    }
    if (ch.scene !== "tunnelFort") {
      const dense = ch.scene === "village" || ch.scene === "tunnelVillage";
      AddParallaxTrees(layers.midTrees, -4, L + 8, night, ch.scene + "mtree",
        { blur: LAYER_BLUR.midTrees, scale: 1 / LAYER_COMP.midTrees,
          step: dense ? 16 : 24, hazeOpt: HazeSolid("midTrees", 0.86) });
      AddParallaxTrees(layers.nearTrees, 4, L - 8, night, ch.scene + "ptree",
        { blur: LAYER_BLUR.nearTrees, scale: 1 / LAYER_COMP.nearTrees,
          ...(dense ? { step: 14 } : {}), hazeOpt: HazeSolid("nearTrees", 0.96) });
      AddForeground(layers.fore, L, night, ch.scene + "fg");
    }
    // 背景层的乡亲最后放：他们要挂在已经建好的树列之间
    AddBackdropFolk(sceneDef, ch, night);

    // 真正的地面（躺平的几何，向地平线收敛）
    AddGroundPlane(layers.play, L, ch.light, ch.scene + "gp");
    // 第八章：院子一带留下焦土
    if (state.flags.ruined) {
      for (const bx of [30, 62, 92]) {
        const scorch = MakeFlatShadow(9, 16, 0.34);
        scorch.position.set(bx, SURFACE_Y + 0.02, -1.2);
        layers.play.add(scorch);
      }
    }
    // 近处的断面带：把玩法线前缘收住，也遮住地平面的近端接缝
    AddGroundBand(layers.play, -30, L + 30, SURFACE_Y, ch.light, ch.scene + "ground",
      sceneDef.walk.under ? 3.2 : 16);

    // 地下剖面
    // 每条纵深带一道看得见的地平线：远处的房子/树才有"地"可站
    if (!sceneDef.underOnly) {
      for (const z of [BAND.backdrop, BAND.building, BAND.yard]) {
        AddBandEdge(layers.play, -30, L + 30, z, ch.light, ch.scene + "be" + z);
      }
    }

    AddUnderground(layers.play, sceneDef, state, ch.scene);
    AddCollapses(layers.play, sceneDef);

    // 地表道具与遮蔽
    for (const p of sceneDef.props) {
      if (["chamber", "pocket", "vent", "waterTrap", "bell", "collapse"].includes(p.kind)) continue;
      AddProp(layers.play, p, ch.light, state.flags.ruined, ch.scene, state);
    }
    for (const c of sceneDef.covers) AddCover(layers.play, c, ch.light, state.flags.ruined);

    // 可翻越物的顶沿缺口：统一轮廓语法的记号——肩高、顶沿磨亮/有缺口。
    // 无按键交互的可读性全靠这一笔
    for (const v of sceneDef.vaults || []) {
      if (v.flag && !state.flags[v.flag]) continue;
      const n = BakeSprite(50, 30, 25, 22, (ctx, ax, ay) => ART.DrawVaultNotch(ctx, ax, ay, "vn" + v.x), 0, DETAIL_SS);
      PlaceSprite(n, v.x, SURFACE_Y + (v.top ?? 1.6), PlaceZ(BAND.loose));
      layers.play.add(n);
    }

    // 第四章堵在东段卡口的湿棉被：堵上之后一直留在剖面里
    if (ch.scene === "tunnelVillage" && state.flags.quiltPlugged) {
      const m = BakeSprite(120, 130, 60, 118, (ctx, ax, ay) => ART.DrawCarry(ctx, ax, ay, 3.6, 1, "湿棉被"), 0, DETAIL_SS);
      PlaceSprite(m, 124, UNDER_Y + 0.6, PlaceZ(BAND.loose));
      layers.play.add(m);
    }

    // 静态灯位
    const lampSpots = [];
    for (const p of sceneDef.props) {
      if (p.kind === "lamppost" && night) lampSpots.push({ x: p.x, y: 1.6, r: 4.5, i: 0.9 });
      if (p.kind === "hangLantern" && night && !state.flags.lanternOut) lampSpots.push({ x: p.x + 0.5, y: 2.2, r: 4.6, i: 0.95 });
      if (p.kind === "fortGate") lampSpots.push({ x: p.x, y: 2.6, r: 5.5, i: 1.0 });
      if (p.kind === "blockhouse") lampSpots.push({ x: p.x, y: 6.4, r: 7, i: 1.1 });
      if (p.kind === "prison") lampSpots.push({ x: p.x, y: 1.5, r: 4, i: 0.75 });
      if (p.kind === "chamber" && ch.scene === "tunnelVillage") lampSpots.push({ x: p.x, y: UNDER_Y + 1.5, r: 4.2, i: 1.0 });
    }
    for (const spot of lampSpots) {
      const g = MakeGlow(spot.r, 0xffc878, spot.i);
      g.userData.SetLight(spot.x, spot.y);
      scene.add(g);
      glows.push(g);
      sceneLights.push(spot);
    }

    // 浮尘
    for (const d of dustMotes) layers.fx.remove(d);
    dustMotes = AddDust(ch.scene === "tunnelFort" ? 26 : 18, night);

    // 最后统一派发绘制序号：层间靠基数、层内靠深度，先后关系从此确定，
    // 不再受 three.js 按中心点自动排序的影响（镜头推拉时不会前后翻面）
    ApplyDepthOrder();
  }

  // -------------------------------------------------------------------------
  // 角色
  // -------------------------------------------------------------------------
  function EnsureActorSprite(id, kind) {
    let s = actorSprites.get(id);
    if (!s) {
      // 骨骼装配：每块骨头一张贴图，逐帧只转关节
      const rig = CreateRig(kind);
      rig.group.userData.persist = true;   // 见 ClearGroup：骨架资源是全场共享的
      layers.play.add(rig.group);
      SetPlayOrder(rig.group, ACTOR_Z);
      const shadow = MakeFlatShadow(1.9, 1.15, 0.30);
      shadow.userData.persist = true;
      layers.play.add(shadow);
      SetPlayOrder(shadow, ACTOR_SHADOW_Z, "actorShadow");
      // 灯打出来的那条长影子，跟脚下那团分开管：一个说"他站在地上"，
      // 一个说"光在他左边"。同时在的时候两条一起读，才像真的有盏灯
      const castShadow = MakeCastShadow(0.42);
      castShadow.visible = false;
      layers.play.add(castShadow);
      s = {
        rig, mesh: rig.group, prevX: null, phase: 0, kind, carryMesh: null, glow: null,
        shadow, castShadow, idleT: Math.random() * 6, bodyScale: BODY_SCALE[kind] ?? 1,
      };
      actorSprites.set(id, s);
    }
    return s;
  }


  // held 收的是**标签**不是布尔：扛在肩上还是提在手里，姿势与挂点都得看它是什么
  function UpdateOne(s, x, level, heading, crouch, dt, held = null, extra = {}) {
    const ground = level === "under" ? UNDER_Y : SURFACE_Y;
    s.ground = ground;                   // 供 PlayerLimbTips 量"手脚离地多高"
    // 翻越时人真的离地（Core 算的抬升弧）；影子留在地上，只是缩小、变淡
    const lift = extra.lift || 0;
    const y = ground + lift;
    const moved = s.prevX === null ? 0 : Math.abs(x - s.prevX);
    const movedY = s.prevY === null || s.prevY === undefined ? 0 : Math.abs(y - s.prevY);
    s.prevX = x;
    s.prevY = y;
    // 步频跟着实际位移走（不是定速循环），停下就自然收回站姿
    const isMoving = moved > 0.006;
    // 爬梯的倒手频率跟着**竖着挪过的距离**走，和走路跟着横向位移是一个道理。
    // 之前它落在下面那条"原地动作"的定速相位上：2.2/秒，下一趟井（1.5 秒）
    // 才够半个循环——手只抬了一下，看着像挂在梯子上不动。
    if (extra.climbing) s.phase += movedY * 4.5;
    else if (isMoving) s.phase += moved * 3.4;
    else s.phase += dt * 2.2;      // 挖土这类原地动作也要有相位
    s.idleT += dt * 1.4;

    const holding = IsHandHeld(held);
    PoseRig(s.rig, {
      phase: s.phase, breath: s.idleT, moving: isMoving, crouch,
      carry: !!held && !holding, hold: holding, holdW: holding ? HoldWeight(held) : 0,
      climbing: extra.climbing, digging: extra.digging, posture: extra.posture, pose: extra.pose,
      poseK: extra.poseK, poseStrain: extra.poseStrain, aimHand: extra.aimHand,
      track: extra.track, trackT: extra.trackT,
    }, dt);

    // 队列的后几排整体后移（人/影子/家伙一起走，见 Data_DepthSpec 的 RankDz）。
    // 绘制顺序是 SetPlayOrder 钉死的，所以档位一变就得重新钉一次——
    // 不重钉的话后排的人会画在前排之前，两个人叠成一个。
    const dz = extra.rankDz || 0;
    if (s.rankDz !== dz) {
      s.rankDz = dz;
      SetPlayOrder(s.rig.group, ACTOR_Z + dz);
      if (s.shadow) SetPlayOrder(s.shadow, ACTOR_SHADOW_Z + dz, "actorShadow");
      if (s.carryMesh) SetPlayOrder(s.carryMesh, CARRY_Z + dz, "carry");
    }
    // 位置压回地平面：演员脚下这条线必须与行走线道具（井台/磨盘/车）是同一条。
    // 后一排（rankDz 是负的）是**有意**站在更靠后的地面上，PlaceZ 会原样放行——
    // 那点抬高正是"两人并排"读得出来的原因。
    s.mesh.position.set(x, y, PlaceZ(ACTOR_Z + dz));
    const bs = extra.bodyScale || s.bodyScale || 1;
    s.mesh.scale.set((heading >= 0 ? 1 : -1) * bs, bs, 1);
    if (s.shadow) {
      // 地下没有太阳，脚下这团只负责"他确实站在地上"
      const under = level === "under";
      // 人离地了影子就该缩、该淡——这是"他真的上去了"最便宜也最有效的一笔
      const air = Math.min(1, lift / 1.1);
      s.shadow.visible = true;
      s.shadow.scale.set(bs * (1 - air * 0.42), bs * (under ? 0.55 : 1) * (1 - air * 0.42), 1);
      s.shadow.position.set(
        x + (under ? 0 : SUN.dx * 0.55) * bs,
        ground + 0.015,
        PlaceZ(ACTOR_Z + dz) - 0.05 + (under ? 0.12 : SUN.dz * 0.62) * bs,
      );
      s.shadow.material.opacity = (under ? 0.5 : 1) * (1 - air * 0.55);
    }
    // 灯打出来的长影子：背着最近那盏灯拖出去，离得越远越长越淡
    if (s.castShadow) {
      const lit = extra.light;
      if (lit) {
        const dx = x - lit.x;
        const dist = Math.abs(dx);
        const dir = dx >= 0 ? 1 : -1;
        // 灯低、人高 → 影子被拉得比人还长；这里按距离线性放，够读就行
        const len = Math.min(6.4, (0.9 + dist * 0.78)) * bs;
        const wid = (0.85 + dist * 0.10) * bs;
        s.castShadow.visible = true;
        s.castShadow.scale.set(dir * len, wid, 1);
        s.castShadow.position.set(x + dir * len * 0.5, y + 0.02, PlaceZ(ACTOR_Z + dz) - 0.04);
        // 站在灯正下方没有影子可言；出了灯的照射范围也就没影子了
        const near = Math.min(1, dist / 0.75);
        const far = 1 - Math.min(1, Math.max(0, (dist - lit.r * 0.55) / (lit.r * 0.5)));
        s.castShadow.material.opacity = near * far * (lit.i ?? 1);
      } else {
        s.castShadow.visible = false;
      }
    }
    return { x, y, isMoving };
  }

  // 手里/肩上的东西。原先只有玩家有，于是"梁木匠把刨子放下"这种戏只能靠
  // 字幕说——演员手上空空。现在所有演员共用这一套。
  // s.layerKey 缺省是 play；背景层的乡亲把自己那层的名字带进来，
  // 手上的家伙就跟着挂到同一层（不然锄头会留在前景，隔着十几米跟着人走）
  // 坐骑：车是一张贴图，骑手是正常演员。自行车摆在骑手**身后**（细钢管架，
  // 人要整个压在车上才读得出"骑"）；挎斗摩托摆在**身前**（近侧的斗得盖住
  // 斗里那个兵的下半身，他才是"坐在斗里"而不是"蹲在车顶上"）。
  // 画笔一律画朝 -x（车头在左），朝 +x 走时整张镜像。
  function SyncMount(a, show) {
    let m = mountMeshes.get(a.id);
    if (!a.mount || !show) {
      if (m) m.visible = false;
      return;
    }
    if (!m || m.userData.mountKind !== a.mount) {
      if (m) layers.play.remove(m);
      m = a.mount === "bicycle"
        ? BakeSprite(130, 64, 65, 58, (ctx, ax, ay) => ART.DrawBicycle(ctx, ax, ay, a.id + "bike"), 0, PROP_SS)
        : BakeSprite(160, 74, 80, 68, (ctx, ax, ay) => ART.DrawMotorcycle(ctx, ax, ay, a.id + "moto"), 0, PROP_SS);
      m.userData.mountKind = a.mount;
      SetPlayOrder(m, a.mount === "bicycle" ? BAND.loose : CARRY_Z, "mount:" + a.mount);
      layers.play.add(m);
      mountMeshes.set(a.id, m);
    }
    m.visible = true;
    // 车的贴图中心不是**座位**：自行车的鞍座画在中心偏后 9px、摩托偏后 1px。
    // 演员站在自己的 x 上，所以车要往前挪那么多，人才是「坐在座上」而不是
    // 「站在车头边推着走」（实拍抓到的就是这个）。朝向翻转时偏移也跟着翻
    const seatDx = (a.mount === "bicycle" ? 9 : 1) / PPM;
    const dir = a.heading > 0 ? -1 : 1;
    PlaceSprite(m, a.x - seatDx * dir, SURFACE_Y, PlaceZ(a.mount === "bicycle" ? BAND.loose : CARRY_Z));
    m.scale.x = Math.abs(m.scale.x) * (a.heading > 0 ? -1 : 1);
  }

  function SyncCarry(s, label, heading) {
    const layerKey = s.layerKey || "play";
    const host = layers[layerKey];
    if (label && (!s.carryMesh || s.carryLabel !== label)) {
      if (s.carryMesh) host.remove(s.carryMesh);
      s.carryMesh = MakeCarryMesh(label);
      // 前景演员的家伙要挺过环境重建（人是 persist 的）；背景乡亲整批随层重建，
      // 标了 persist 反而会剩一把没人的锄头浮在那儿
      if (layerKey === "play") s.carryMesh.userData.persist = true;
      s.carryLabel = label;
      host.add(s.carryMesh);
      // 后一排的人手里那把枪也得跟着退一档（rankDz 由 UpdateOne 先一步定好）
      SetLayerOrder(s.carryMesh, layerKey, CARRY_Z + (s.rankDz || 0), "carry:" + layerKey);
    } else if (!label && s.carryMesh) {
      host.remove(s.carryMesh);
      s.carryMesh = null;
      s.carryLabel = null;
    }
    if (!s.carryMesh) return;
    s.carryMesh.visible = true;   // 人从屋里出来了：手上那件跟着回到画面
    // 小件提在手上，大件（木料/门板/顶木/棉被…）扛在肩上——挂点不同。
    // 长家伙（锯/锄头）也在手上，但要顺着前臂的方向摆：手臂一伸一屈，
    // 锯就一进一出；锄扬过肩、落进土——工具的动作全从手臂动作里来。
    const alongArm = ALONG_ARM.includes(label);
    const inHand = IsHandHeld(label);
    // HandPoint/ShoulderPoint 给的是**世界**坐标；背景层带着自己的缩放与 z 偏移，
    // 直接拿去当局部坐标，锄头会飞到十几米外。换算回本层的局部系再摆
    const ToLocal = (v) => (layerKey === "play" ? v : host.worldToLocal(v));
    const anchor = ToLocal(inHand ? HandPoint(s.rig) : ShoulderPoint(s.rig));
    const bs = s.bodyScale || 1;
    // 提在手里的：贴图中心就是桶沿，挂在拳头底下一点点就够了。原先垂 0.20m 是
    // 迁就旧的"扛"姿势（手抬在肩上），现在 hold 已经把胳膊坠直——再垂那么多，
    // 柱子（才一米出头）手里的桶就杵在地上了。
    // 侧视里手臂垂在身体正中，桶又整个盖在人身上——再往前挪一掌，剪影才分得开
    const forward = inHand && !alongArm ? (heading >= 0 ? 1 : -1) * 0.11 : 0;
    s.carryMesh.position.set(anchor.x + forward,
      anchor.y + (alongArm ? 0 : inHand ? -0.05 : 0.10), PlaceZ(CARRY_Z + (s.rankDz || 0)));
    // 顺前臂摆的长家伙**不做镜像**：朝向已经由世界系的旋转决定了，再乘一个
    // scale.x=-1 等于先翻再转，两者打架——人一朝左，锯就指到天上去。
    // （锯和锄本来就绕柄对称，不镜像也看不出来。）
    s.carryMesh.scale.set((alongArm || heading >= 0 ? 1 : -1) * bs, bs, 1);
    if (alongArm) {
      // 贴图里工具沿"手向下"画；把"下"转到前臂方向（肘→手）上，
      // 再加上这件工具在手心里的固有偏角（扫帚不与前臂共线，见 ARM_TOOL_TILT）
      const elbow = ToLocal(ElbowPoint(s.rig));
      s.carryMesh.rotation.z = Math.atan2(anchor.x - elbow.x, -(anchor.y - elbow.y))
        + (ARM_TOOL_TILT[label] || 0) * (heading >= 0 ? 1 : -1);
    } else {
      s.carryMesh.rotation.z = inHand ? 0 : (heading >= 0 ? -0.14 : 0.14);
    }
  }

  // 夜戏里人得从背景里读得出来。全屏压暗罩会把演员和土墙一起压成一团，
  // 在手机那种小屏 + 低亮度上就成了"人都看不见"。做法跟《勇敢的心》一样：
  // 把演员本身提亮，让他们始终比环境亮一档——主角比配角再亮一点。
  const NIGHT_LIFT = { day: 1, dawn: 1.06, night: 1.34, tunnel: 1.30, dark: 1.42 };
  function LiftActor(s, light, isPlayer) {
    const lift = (NIGHT_LIFT[light] ?? 1) * (isPlayer ? 1.08 : 1);
    if (s.liftApplied === lift) return;
    s.liftApplied = lift;
    s.mesh.traverse((o) => { if (o.isMesh && o.material?.color) o.material.color.setScalar(lift); });
  }

  // 手里的灯：一盏实物挂在手上，光晕从它的火心发出去（不是人整个在发光）
  const LAMP_W = 46, LAMP_H = 46;    // 贴图画幅（像素，PPM 密度）
  const LAMP_AX = 18, LAMP_AY = 15;  // 握点在画幅里的位置
  const LAMP_S = 0.92;               // DrawHandLamp 的绘制单位 → 贴图像素
  function SyncHandLamp(s, on, kind, heading, hand, bs) {
    if (!on || !hand) {
      if (s.lampMesh) s.lampMesh.visible = false;
      return null;
    }
    if (!s.lampMesh || s.lampKind !== kind) {
      if (s.lampMesh) layers.play.remove(s.lampMesh);
      // 灯会被特写扫到（"灯停住了"那一镜），按细节件的密度烘
      s.lampMesh = BakeSprite(LAMP_W, LAMP_H, LAMP_AX, LAMP_AY, (ctx, ax, ay) => {
        ART.DrawHandLamp(ctx, ax, ay, LAMP_S, kind);
      }, 0, DETAIL_SS * 2);
      s.lampKind = kind;
      layers.play.add(s.lampMesh);
      SetPlayOrder(s.lampMesh, CARRY_Z);
    }
    s.lampMesh.visible = true;
    const dir = heading >= 0 ? 1 : -1;
    s.lampMesh.scale.set(dir * bs, bs, 1);
    s.lampMesh.position.set(
      hand.x + dir * s.lampMesh.userData.offset.x * bs,
      hand.y + s.lampMesh.userData.offset.y * bs,
      PlaceZ(CARRY_Z),
    );
    // 火心的世界坐标：光就从这儿发出去（画布 y 向下，世界 y 向上）
    const f = ART.HAND_LAMP_FLAME[kind] || ART.HAND_LAMP_FLAME.hurricane;
    return {
      x: hand.x + dir * (f.x * LAMP_S / PPM) * bs,
      y: hand.y - (f.y * LAMP_S / PPM) * bs,
    };
  }

  function UpdateActors(state, time, dt) {
    const ch = CHAPTERS[state.chapterIndex];
    const sceneDef = SCENES[ch.scene];
    const seen = new Set(["player"]);
    const p = state.player;
    planeHandRig = null;   // 这一帧谁在推刨子（UpdateProps 拿它挂刨子）
    const ps = EnsureActorSprite("player", "player");
    const def = CurrentBeatDef(state);
    const LevelYOf = (lv) => (lv === "under" ? UNDER_Y : SURFACE_Y);

    // ① 先把这一帧的光源点清出来：影子朝哪边拖、谁挡谁的光，都要先知道灯在哪
    lightSources.length = 0;
    if (p.lamp) lightSources.push({ x: p.x + p.heading * 0.42, y: LevelYOf(p.level) + 0.95, r: 6.5, i: 1.1 });
    for (const a of state.actors) {
      if (!a.lantern || a.visible === false) continue;
      lightSources.push({ x: a.x + (a.heading || 1) * 0.42, y: LevelYOf(a.level) + 0.95, r: 4.6, i: 1 });
    }
    for (const l of state.lamps || []) if (l.lit) lightSources.push({ x: l.x, y: UNDER_Y + 1.4, r: 3.4, i: 0.8 });
    for (const l of sceneLights) lightSources.push({ x: l.x, y: l.y, r: l.r, i: l.i });

    // 离 x 最近、且还照得到的那盏灯负责投影（同一个人身上叠两条影子会很脏）
    const NearestLight = (x, y) => {
      let best = null, bestD = Infinity;
      for (const l of lightSources) {
        if (Math.abs(l.y - y) > 4) continue;             // 不是同一层的灯别管
        const d = Math.abs(l.x - x);
        if (d > l.r || d > bestD) continue;
        bestD = d; best = l;
      }
      return best;
    };

    // ② 挡光的人体：只取躯干那一柱（半宽 0.17m），细长一条影子比一整块黑更像人
    bodyBlockers.length = 0;
    const PushBlocker = (x, level, crouch, bs) => {
      const h = (crouch ? 0.62 : 0.92) * bs;
      bodyBlockers.push({ x, y: LevelYOf(level) + h, hw: 0.20 * bs, hh: h });
    };
    // 施工中=长按进度在涨。原来看提示文案里有没有"%"，但百分比已经改画成
    // 进度环、不进文案了——判据换成 promptFill 本身
    const digging = !!(state.beat && !state.beat.quakeActive
      && ((def?.kind === "digSeq" && state.beat.digIndex !== undefined)
        || def?.kind === "buildSpots" || def?.kind === "hold" || def?.kind === "chain")
      && (state.promptFill || 0) > 0.001);
    // 柱子在第一章还是个半大孩子，第二章起抽条；妹妹一直矮一头多
    const boyScale = state.chapterIndex === 0 ? 0.80 : 0.93;
    PushBlocker(p.x, p.level, p.crouch, boyScale);
    for (const a of state.actors) {
      if (a.visible === false) continue;
      PushBlocker(a.x, a.level || "surface", false, BODY_SCALE[a.kind] ?? 1);
    }

    // 手里那一格（谜题链的物品）和肩上扛的木料一样要摆出携带姿势
    const held = p.carry || (p.item ? p.item.label : null);
    UpdateOne(ps, p.x, p.level, p.heading, p.crouch, dt, held,
      {
        climbing: p.climbT > 0, digging, bodyScale: boyScale, posture: p.posture, pose: p.pose,
        // 翻越：抬升与动作进度都由 Core 算，渲染层只负责把人抬起来、把姿势推到那一格
        // poseK = 0..1 的动作进度，Rig 里所有被进度驱动的姿势共用这一个参数：
        // 翻越取 vaultK、刨料取 poseU（推程）、投石取 poseK（拉弓量），见 PoseProgress
        lift: p.lift || 0, poseK: PoseProgress(p),
        // 摇辘轳：把摇把握手的世界坐标换算成骨架局部坐标交给 Rig 反解——
        // 手是真的攥在那根把手上，不是照着一条相位在半空画圈
        poseStrain: p.poseStrain,
        aimHand: CrankAimLocal(state, p, boyScale),
        track: p.track?.name, trackT: p.track?.t,
        // 自己提着灯也照样有影子——灯在身前，影子就甩在身后
        light: NearestLight(p.x, LevelYOf(p.level)),
      });
    ps.mesh.visible = otsHiddenId !== "player";
    // 手在世界里的真位置，回填给玩法层。投石要求"按在手里那颗石子上"才攥得住，
    // 判定圈就必须钉在**画出来的那只手**上——照 p.x + 朝向×0.24 估一个高度，
    // 姿势一换（垂手 / 蓄力）手就差出大半米，玩家等于在空气里按。
    // 同刨子那条：挂点由渲染层给，玩法层不自己猜。
    {
      const hp = HandPoint(ps.rig);
      state.handAt = { x: hp.x, y: hp.y };
    }
    if (p.pose === "planePush") planeHandRig = ps.rig;
    LiftActor(ps, ch.light, true);

    SyncCarry(ps, held, p.heading);
    UpdatePlayerTag(state, ps, p, boyScale, time, dt);

    // 煤油灯
    if (p.lamp) {
      if (!ps.glow || ps.glowKey !== builtKey) {
        if (ps.glow) scene.remove(ps.glow);
        ps.glow = MakeGlow(6.5, 0xffb85c, 1.25);
        ps.glowKey = builtKey;
        scene.add(ps.glow);
        // 暗适应：一圈很弱的大范围光，让走廊轮廓读得出，不至于是个黑洞
        if (ps.adapt) scene.remove(ps.adapt);
        ps.adapt = MakeGlow(17, 0xc9a878, 0.30);
        scene.add(ps.adapt);
      }
      if (ps.adapt) ps.adapt.userData.SetLight(p.x, LevelYOf(p.level) + 1.0);
      // 灯挂在手上，光从火心出去；SetLight 必须走 userData（着色器要拿 uLightPos，
      // 直接改 mesh.position 的话灯的位置还留在世界原点，整片光会被距离判定丢掉）
      const hand = HandPoint(ps.rig);
      const flame = SyncHandLamp(ps, true, "hurricane", p.heading, hand, boyScale)
        || { x: p.x + p.heading * 0.3, y: LevelYOf(p.level) + 1.05 };
      ps.glow.userData.SetLight(flame.x, flame.y);
      ps.glow.userData.SetIntensity(1.15 + Math.sin(time * 9.7) * 0.12 + Math.sin(time * 23) * 0.05);
    } else if (ps.glow) {
      SyncHandLamp(ps, false);
      scene.remove(ps.glow);
      if (ps.adapt) { scene.remove(ps.adapt); ps.adapt = null; }
      ps.glow = null;
    }

    for (const a of state.actors) {
      seen.add(a.id);
      const s = EnsureActorSprite(a.id, a.kind);
      // 跟着走的人（妹妹）不算"进屋"：玩家在地窖口下梯子的那一两秒她还在地面上，
      // 按屋里算会让她凭空消失一下
      s.mesh.visible = a.visible !== false && otsHiddenId !== a.id
        && !(!a.following && IndoorHidden(a.x, a.level || "surface"));
      if (!s.mesh.visible) {
        // 人不在画面里，跟着他的那几件也得一起收：影子、手上提的、提着的灯。
        // 不这么写，娘走进屋之后墙上会剩一只浮着的桶、门口留一团没人的影子
        for (const m of [s.shadow, s.castShadow, s.carryMesh, s.lampMesh]) if (m) m.visible = false;
        SyncMount(a, false);
        continue;
      }
      // 坐骑（自行车/挎斗摩托）：车跟人走，人骑在车上（pose + lift 是 Core 给的）
      SyncMount(a, true);
      const sisterScale = a.id === "sister" ? (state.chapterIndex <= 1 ? 0.60 : 0.68) : null;
      // 走廊里净高一米五，NPC 也得猫腰；洞室与旁洞才直得起腰。
      // 村里的地下（两窖之间那条新掏的短通道）同一套规矩——tight 段得爬
      const underTunnel = (a.level === "under")
        && (ch.scene === "tunnelVillage" || ch.scene === "tunnelFort"
          || (ch.scene === "village" && sceneDef.tight?.length));
      // NPC 跟玩家走同一段净高：一群人猫着腰、里头一个直着腰，立刻出戏
      const posture = underTunnel ? TunnelPosture(sceneDef, a.x) : "stand";
      const bs = sisterScale || BODY_SCALE[a.kind] || 1;
      UpdateOne(s, a.x, a.level || "surface", a.heading,
        posture === "squat" || posture === "crawl" || !!a.crouch, dt, a.carry || null,
        {
          posture, pose: a.pose, track: a.track?.name, trackT: a.track?.t,
          // 干活的乡亲也用得上躬身施工那套（原来只有玩家能挖）——
          // 掌子面上抡站姿锄头，在净高只够爬的新掏段里一眼就假
          digging: !!a.digging,
          // 跟着走的人翻的是同一垛柴：抬升与动作进度都按位置连续算（Core/StepFollowers）
          // 下地道也一样：玩家在梯子上她就也在梯子上（a.climbing）
          lift: a.lift || 0, poseK: PoseProgress(a), climbing: !!a.climbing,
          // 队列里的第几排：横版里"并排"只能靠深度演（见 RankDz 的注释）
          rankDz: RankDz(a.rank || 0),
          ...(sisterScale ? { bodyScale: sisterScale } : {}),
          light: NearestLight(a.x, LevelYOf(a.level)),
        });
      if (a.pose === "planePush") planeHandRig = s.rig;
      // 兵手里默认有枪。剧本不必给每一处敌人写 carry——枪是他们的常态，
      // 而且必须是**真握在手里**的物件：抡枪托那一下砸下来的就是它
      const carry = a.carry ?? ((a.kind === "soldier" || a.kind === "puppet") ? "步枪" : null);
      SyncCarry(s, carry, a.heading);
      LiftActor(s, ch.light, false);
      // 提灯：先把灯挂到手上，光晕再从灯的火心发出去
      const lampKind = a.lantern ? (a.lanternKind || (a.kind === "puppet" ? "lantern" : "hurricane")) : null;
      const hand = a.lantern ? HandPoint(s.rig) : null;
      const flame = SyncHandLamp(s, !!a.lantern, lampKind, a.heading, hand, bs);
      if (a.lantern) {
        if (!s.glow || s.glowKey !== builtKey) {
          if (s.glow) scene.remove(s.glow);
          s.glow = MakeGlow(4.6, 0xffc878, 0.85);
          s.glowKey = builtKey;
          scene.add(s.glow);
        }
        s.glow.userData.SetLight(flame.x, flame.y);
        // 油灯的火苗自己在抖，光斑也跟着抖
        s.glow.userData.SetIntensity(0.85 + Math.sin(time * 8.3 + a.x) * 0.08 + Math.sin(time * 19.7) * 0.035);
        s.glow.visible = true;
      } else if (s.glow) {
        s.glow.visible = false;
      }
    }

    // ③ 每盏灯认领离自己最近的几个人体做遮挡：人挡在灯前，墙上、地上才有影子
    for (const [, s] of actorSprites) {
      if (s.glow?.visible) s.glow.userData.SetBlockers(bodyBlockers);
    }
    for (const g of glows) if (g.visible) g.userData.SetBlockers?.(bodyBlockers);
    for (const m of lampMeshes) if (m.glow?.visible) m.glow.userData.SetBlockers?.(bodyBlockers);

    // 人没了车也得收（SpawnRaidSoldiers 会整批换敌人）
    for (const [id, m] of mountMeshes) {
      if (!seen.has(id)) { layers.play.remove(m); mountMeshes.delete(id); }
    }

    for (const [id, s] of actorSprites) {
      if (id !== "player" && !seen.has(id)) {
        layers.play.remove(s.rig ? s.rig.group : s.mesh);
        if (s.shadow) layers.play.remove(s.shadow);
        if (s.castShadow) layers.play.remove(s.castShadow);
        if (s.glow) scene.remove(s.glow);
        if (s.carryMesh) layers.play.remove(s.carryMesh);
        if (s.lampMesh) layers.play.remove(s.lampMesh);
        actorSprites.delete(id);
      } else if (id !== "player") {
        const a = state.actors.find((x) => x.id === id);
        if (!a || a.visible === false) {
          if (s.glow) s.glow.visible = false;
          if (s.lampMesh) s.lampMesh.visible = false;
          if (s.castShadow) s.castShadow.visible = false;
        }
      }
    }
  }

  // 「你控制的是哪一个」：夜里三个同样身高的土布短褂站在村道上，玩家分不出自己。
  // 常驻一枚很淡的人字标（不是黄三角，那是指路的），刚接手 / 站着不动 / 刚被抓回来
  // 的时候亮一下，一走起来就退回几乎看不见——不抢画面，但永远能找到自己。
  let tagT = 0, tagKey = "", tagLevel = 0;
  function UpdatePlayerTag(state, ps, p, bs, time, dt) {
    if (!ps.tagMesh) {
      const canvas = MakeCanvas(48 * HINT_SS, 32 * HINT_SS);
      ps.tagCtx = canvas.getContext("2d");
      ps.tagMesh = new THREE.Mesh(
        new THREE.PlaneGeometry(48 / PPM * 0.72, 32 / PPM * 0.72),
        new THREE.MeshBasicMaterial({ map: CanvasTexture(canvas), transparent: true, depthWrite: false }),
      );
      FixOrder(ps.tagMesh, LAYER_ORDER.fx + 280);
      layers.fx.add(ps.tagMesh);
    }
    const def = CurrentBeatDef(state);
    const inCine = def?.kind === "cinematic" || !!state.microCine;
    const key = `${state.chapterIndex}/${state.beatIndex}/${state.flags.resets}`;
    if (key !== tagKey) { tagKey = key; tagT = 0; }
    tagT += dt;
    const moving = Math.abs(p.x - (ps.tagPrevX ?? p.x)) > 0.002;
    ps.tagPrevX = p.x;
    // 刚接手这一幕的前 3.2 秒、或者站着发呆超过 2.5 秒 → 亮起来
    if (!moving) tagLevel += dt * 0.4; else tagLevel = 0;
    // 近景里不要它：这枚标是给"夜里三个同样身高的短褂站在村道上"认人用的，
    // 镜头推到 5 米以内时画面上就那么一两个人，它只会盖住真正在演的东西
    //（划线那一拍它正好压在石笔上）
    const closeUp = viewW < 5.0;
    const want = inCine || closeUp || otsHiddenId === "player" ? 0
      : (tagT < 3.2 ? 1 : (tagLevel > 2.5 ? 0.85 : 0.24));
    ps.tagAlpha = (ps.tagAlpha ?? 0) + (want - (ps.tagAlpha ?? 0)) * Math.min(1, dt * 4);
    ps.tagMesh.visible = ps.tagAlpha > 0.02;
    if (!ps.tagMesh.visible) return;
    ps.tagCtx.setTransform(HINT_SS, 0, 0, HINT_SS, 0, 0);
    ps.tagCtx.clearRect(0, 0, 48, 32);
    ART.DrawPlayerTag(ps.tagCtx, 24, 18, time);
    ps.tagMesh.material.map.needsUpdate = true;
    ps.tagMesh.material.opacity = ps.tagAlpha;
    // 贴着头顶上方一点点：再高就飘成 HUD 了，那是另一种出戏
    // （用骨架实际的头顶高度，不是 POSTURE_HEAD——那量的是地道净空）
    const TAG_HEAD = { stand: 1.35, stoop: 1.10, squat: 0.92, crawl: 0.62 };
    const head = TAG_HEAD[p.posture] ?? (p.crouch ? 0.95 : 1.35);
    ps.tagMesh.position.set(p.x, (p.level === "under" ? UNDER_Y : SURFACE_Y) + head * bs + 0.18, 0.62);
  }

  // -------------------------------------------------------------------------
  // 特效层
  // -------------------------------------------------------------------------
  function UpdateProps(state, time, dt) {
    const ch = CHAPTERS[state.chapterIndex];
    const sceneDef = SCENES[ch.scene];
    const def = CurrentBeatDef(state);

    // 旗标门的道具：只切显隐，不重建世界（顶针、母鸡、扫荡后的柴垛石堆）
    for (const fp of flagProps) {
      const on = (!fp.p.showFlag || !!state.flags[fp.p.showFlag])
        && (!fp.p.hideFlag || !state.flags[fp.p.hideFlag]);
      for (const m of fp.meshes) m.visible = on;
    }
    StepBackdropFolk(dt, state);
    // 画法随状态变的那几张（井绳断口、木料堆里露出的绳头、井上让位给会转的摇把）：
    // 只重烘自己那一张。r.flag 是单个旗标的简写，r.read 是任意状态摘要
    for (const r of propRedraw) {
      const v = r.read ? r.read(state) : !!state.flags[r.flag];
      if (r.last === v) continue;
      r.last = v;
      r.run(state);
    }

    // 可拾取物件
    if (def?.kind === "collect" && state.beat.itemStates) {
      // 贴图是按 label 烘的。上一拍搬木料、这一拍提水桶时，网格如果沿用
      // 就会拿木料的贴图去当水桶——所以 label 一变就整批重建。
      if (itemLabel !== def.carryLabel) {
        for (const m of itemMeshes) layers.play.remove(m);
        itemMeshes = [];
        itemLabel = def.carryLabel;
      }
      while (itemMeshes.length < state.beat.itemStates.length) {
        const m = MakeCarryMesh(itemLabel);
        layers.play.add(m);
        // 地上的待拾物走 loose 带：压在行走线道具之前、玩家之后
        SetPlayOrder(m, BAND.loose, "collectItem");
        itemMeshes.push(m);
      }
      const bucket = def.carryLabel === "水桶";
      let stacked = 0;
      state.beat.itemStates.forEach((it, i) => {
        const m = itemMeshes[i];
        m.visible = !it.carried;
        if (it.delivered) {
          // 放下的东西要留在原地看得见——堆在交付点上，一件一件摞起来。
          // 原来一交付就整个隐藏，玩家会觉得自己刚放下的木料凭空没了。
          //（y 的抬升是"摞"的表达，不是为了贴地——贴地由贴图锚点负责）
          m.position.set(def.deliver.x + (stacked % 2) * 0.5 - 0.25,
            SURFACE_Y + (bucket ? 0.32 : 0.16) + Math.floor(stacked / 2) * 0.2, PlaceZ(BAND.loose));
          m.rotation.z = bucket ? 0 : (stacked % 2 ? 0.05 : -0.04);
          stacked += 1;
        } else {
          m.position.set(it.x, SURFACE_Y + (bucket ? 0.32 : 0.22 + i * 0.16), PlaceZ(BAND.loose));
          m.rotation.z = 0;
        }
      });
    } else if (itemMeshes.length) {
      for (const m of itemMeshes) layers.play.remove(m);
      itemMeshes = [];
      itemLabel = null;
    }

    // 划线：石笔真的在木头上蹭出一道印——不是一个变长的纯色片。
    // 一张画布贴在门框那一段上，手每推进一点就往画布上补几粒粉痕：
    // 颗粒、断续、深浅不匀，全是石笔蹭木纹该有的样子。手可以往回蹭，
    // 已经划下的印子不会消失（Core 里 drawn 只进不退）。
    if (state.scribe) {
      const sc = state.scribe;
      const spanW = (sc.x1 - sc.x0) + 0.36;
      if (!scribeMesh) {
        // 这道印子只在 2.9m 的特写里出镜，屏幕密度约 330px/米——按 48px/米
        // 的标尺烘出来要放大七倍。画布加密 SCRIBE_SS 倍，逻辑坐标不变。
        scribeCanvas = MakeCanvas(288 * SCRIBE_SS, 44 * SCRIBE_SS);
        scribeCtx = scribeCanvas.getContext("2d");
        scribeLastT = 0;
        const tex = CanvasTexture(scribeCanvas);
        tex.generateMipmaps = false;
        tex.minFilter = THREE.LinearFilter;
        scribeMesh = new THREE.Mesh(
          new THREE.PlaneGeometry(spanW, 0.22),
          new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }),
        );
        // 深度规范：刻痕压在门框（walk）之前、划线的人（actor）之后
        FixOrder(scribeMesh, DepthOrder("play", BAND.loose) + 2);
        layers.play.add(scribeMesh);
        // 石笔：一支巴掌里攥得住的东西——**约 9 厘米长**。
        // 它以前是 40 厘米的一根大白棍：当装饰没人看，可当玩家真去攥它，
        // 尺寸不对整件事就假了。世界尺寸由 CHALK_SCALE 定，贴图照旧高密度烘。
        scribeTip = BakeSprite(26, 30, 13, 15, (ctx, ax, ay) => {
          ctx.save();
          ctx.translate(ax, ay);
          ctx.fillStyle = "#e8dbba";
          ctx.strokeStyle = "rgba(60,45,25,0.85)";
          ctx.lineWidth = 1.4;
          // 笔身：上粗下细，磨秃的尖朝下
          ctx.beginPath();
          ctx.moveTo(-3.4, -11); ctx.lineTo(3.4, -11);
          ctx.lineTo(2.2, 7); ctx.lineTo(1.1, 11.5);
          ctx.lineTo(-1.1, 11.5); ctx.lineTo(-2.2, 7);
          ctx.closePath(); ctx.fill(); ctx.stroke();
          // 侧面一道阴影，读得出是根柱子不是片纸
          ctx.globalAlpha = 0.22;
          ctx.fillStyle = "#6b5636";
          ctx.beginPath();
          ctx.moveTo(1.2, -11); ctx.lineTo(3.4, -11); ctx.lineTo(2.2, 7); ctx.lineTo(1.0, 7);
          ctx.closePath(); ctx.fill();
          ctx.restore();
        }, 0, CHALK_SS);
        scribeTip.scale.setScalar(CHALK_SCALE);
        FixOrder(scribeTip, DepthOrder("play", BAND.loose) + 3);
        layers.play.add(scribeTip);
      }
      // 章节重开（进度回到 0）：擦掉画布重来
      if (sc.t < scribeLastT - 0.01) {
        scribeCtx.setTransform(1, 0, 0, 1, 0, 0);
        scribeCtx.clearRect(0, 0, scribeCanvas.width, scribeCanvas.height);
        scribeLastT = 0;
      }
      // 把新推进的那一小段补上粉痕。手越慢压得越实——同一支笔，快划是虚的，
      // 慢慢蹭才留得下深痕，于是"划得好不好"看得见
      if (sc.t > scribeLastT) {
        // 逻辑坐标恒为 288×44，画布本身加密了 SCRIBE_SS 倍
        scribeCtx.setTransform(SCRIBE_SS, 0, 0, SCRIBE_SS, 0, 0);
        const W = 288, H = 44;
        const pad = (0.18 / spanW) * W;
        const usable = W - pad * 2;
        const press = 1 - Math.min(0.55, (sc.speed || 0) * 0.9);   // 慢=1，快≈0.45
        scribeCtx.fillStyle = "#f2e6c4";
        for (let u = scribeLastT; u < sc.t; u += 0.008) {
          const px = pad + u * usable;
          const wob = Math.sin(u * 61.7) * 1.7 + Math.sin(u * 23.3 + 1.2) * 1.1;
          // 断续：偶尔跳过一粒，石笔蹭过木纹的坑（划得快，跳得多）
          if (Math.sin(u * 197.3) > 0.60 + press * 0.28) continue;
          const alpha = (0.5 + Math.abs(Math.sin(u * 83.1)) * 0.45) * press;
          scribeCtx.globalAlpha = alpha;
          scribeCtx.fillRect(px, H / 2 + wob - 1.6, 2.6, 3.2 * (0.7 + press * 0.3));
          if (Math.sin(u * 311.9) > 0.3) {           // 掉下来的粉屑
            scribeCtx.globalAlpha = alpha * 0.35;
            scribeCtx.fillRect(px + 0.8, H / 2 + wob + 3.5, 1.2, 1.2);
          }
        }
        scribeCtx.globalAlpha = 1;
        scribeMesh.material.map.needsUpdate = true;
        scribeLastT = sc.t;
      }
      scribeMesh.visible = true;
      scribeMesh.position.set((sc.x0 + sc.x1) / 2, sc.y, PlaceZ(BAND.loose));
      if (scribeTip) {
        // 那支笔本身就是这一拍的全部 UI：攥住了就压进木头、随手劲倾斜；
        // 没攥住就浮起来轻轻晃——招呼玩家"来拿我"，不需要一行字
        scribeTip.visible = true;
        const hx = sc.x0 + (sc.head ?? sc.t) * (sc.x1 - sc.x0);
        const wob = (sc.idle || sc.reaching) && !sc.gripped
          ? Math.sin(time * (sc.reaching ? 13 : 4.2)) * (sc.reaching ? 0.018 : 0.010)
          : 0;
        const lift = sc.gripped ? 0 : 0.022;          // 没压着木头就抬起来一点
        // 笔尖落在刻线上：贴图中心要抬起「半支笔」那么高
        scribeTip.position.set(hx + wob, sc.y + 0.046 + lift, PlaceZ(BAND.loose));
        // 倾斜：压着走的时候笔杆往后倒（手在推），抬手就立回来
        const lean = sc.gripped ? -0.12 - Math.min(0.22, (sc.speed || 0) * 0.4) : 0.06;
        scribeTip.rotation.z += (lean - scribeTip.rotation.z) * Math.min(1, dt * 12);
        // 笔尖的粉尘：只有真在蹭木头才扬起来，手停就散
        if (!scribeDust) {
          scribeDust = BakeSprite(22, 22, 11, 11, (ctx, ax, ay) => {
            for (let i = 0; i < 7; i += 1) {
              const a = i * 1.7;
              ctx.globalAlpha = 0.5 - i * 0.05;
              ctx.fillStyle = "#f2e6c4";
              ctx.fillRect(ax + Math.cos(a) * (2 + i), ay + Math.sin(a) * (1.5 + i * 0.8), 1.6, 1.6);
            }
            ctx.globalAlpha = 1;
          }, 0, DETAIL_SS);
          FixOrder(scribeDust, DepthOrder("play", BAND.loose) + 4);
          scribeDust.scale.setScalar(0.28);   // 一小撮粉末，不是一团烟
          layers.play.add(scribeDust);
        }
        const dustWant = sc.gripped ? Math.min(0.85, (sc.speed || 0) * 1.9) : 0;
        scribeDust.material.opacity = (scribeDust.material.opacity ?? 0)
          + (dustWant - (scribeDust.material.opacity ?? 0)) * Math.min(1, dt * 9);
        scribeDust.visible = scribeDust.material.opacity > 0.02;
        scribeDust.position.set(hx, sc.y - 0.03 + Math.sin(time * 9) * 0.008, PlaceZ(BAND.loose));
      }
    } else {
      if (scribeMesh) scribeMesh.visible = false;
      if (scribeTip) scribeTip.visible = false;
      if (scribeDust) scribeDust.visible = false;
    }

    // 烟与水：真解算（半拉格朗日平流 + 压力投影），固体边界就是地道剖面
    const wantsFluid = !!(state.smoke?.active || state.flood?.active);
    if (wantsFluid && sceneDef.walk.under) {
      const range = sceneDef.walk.under;
      if (!fluid || fluidKey !== builtKey) {
        fluid = CreateTunnelFluid({
          x0: range[0] - 3, x1: range[1] + 3,
          yBottom: UNDER_Y - 0.15, yTop: UNDER_Y + 3.1,
          cols: 200, rows: 26,
        });
        const occ = SceneOccluders(sceneDef, state, SURFACE_Y, UNDER_Y);
        fluid.SetAirRects(occ.air);
        fluid.SetVents(sceneDef.props.filter((pp) => pp.kind === "vent").map((pp) => pp.x));
        // 翻口是水封：挖好之后，模拟出来的烟也必须在这儿停住，
        // 否则一维的烟锋停了、画面上的烟还在往西飘，两套说法对不上
        fluid.SetBarriers(sceneDef.props
          .filter((pp) => pp.kind === "waterTrap" && (!pp.builtFlag || state.flags[pp.builtFlag]))
          .map((pp) => pp.x));
        fluidKey = builtKey;
        fluidCanvas = MakeCanvas(fluid.cols, fluid.rows);
        fluidCtx = fluidCanvas.getContext("2d");
        fluidImage = fluidCtx.createImageData(fluid.cols, fluid.rows);
        const tex = CanvasTexture(fluidCanvas);
        tex.minFilter = THREE.LinearFilter;
        tex.generateMipmaps = false;
        const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false });
        if (fluidMesh) layers.fx.remove(fluidMesh);
        fluidMesh = new THREE.Mesh(new THREE.PlaneGeometry(
          fluid.x1 - fluid.x0, fluid.yTop - fluid.yBottom), mat);
        fluidMesh.position.set((fluid.x0 + fluid.x1) / 2, (fluid.yBottom + fluid.yTop) / 2, 0.35);
        FixOrder(fluidMesh, LAYER_ORDER.fx + 220);
        layers.fx.add(fluidMesh);
      }
      // 灌烟口/灌水口持续注入
      if (state.smoke?.active) {
        const src = state.smoke.sourceX ?? (sceneDef.shafts[0]?.x ?? fluid.x1 - 4);
        fluid.Emit(src, UNDER_Y + 1.05, { smoke: 30 * Math.min(0.05, dt), vx: -2.6, vy: 0.15, radius: 1.15 });
      }
      if (state.flood?.active) {
        const src = state.flood.sourceX ?? (sceneDef.shafts[0]?.x ?? fluid.x1 - 4);
        fluid.Emit(src, UNDER_Y + 2.0, { water: 34 * Math.min(0.05, dt), vx: -0.8, vy: -1.6, radius: 0.8 });
      }
      fluid.Step(dt);
      fluid.Paint(fluidImage);
      fluidCtx.putImageData(fluidImage, 0, 0);
      fluidMesh.material.map.needsUpdate = true;
      fluidMesh.visible = true;
      // 把解算出来的烟前锋回灌给玩法层，玩法与画面是同一件事。
      // 只在解算确实有烟时才接管，否则保留核心层的解析推进——
      // 玩法判定不能因为解算抽风就失效。
      if (state.smoke?.active) {
        const f = fluid.SmokeFrontX();
        if (f < fluid.x1 - 1.5) state.smoke.frontX = Math.min(state.smoke.frontX, f);
      }
      if (state.flood?.active) state.floodDepth = fluid.WaterDepthAt(state.player.x);
    } else if (fluidMesh) {
      fluidMesh.visible = false;
    }

    // 探杆
    const quakeOn = state.beat && (state.beat.quakeWarn || state.beat.quakeActive)
      && (def?.kind === "digSeq" || def?.kind === "rescueLoop");
    if (quakeOn) {
      if (!probeMeshes.length) {
        for (let i = 0; i < 3; i += 1) {
          const m = BakeSprite(40, 200, 20, 0, () => {});
          m.userData.canvas = m.material.map.image;
          layers.fx.add(m);
          probeMeshes.push(m);
        }
      }
      probeMeshes.forEach((m, i) => {
        m.visible = true;
        const jab = state.beat.quakeActive ? Math.abs(Math.sin(time * 5 + i * 1.7)) : 0.15;
        const c = m.userData.canvas;
        const ctx = c.getContext("2d");
        ctx.clearRect(0, 0, c.width, c.height);
        ART.DrawProbeRod(ctx, 20, 6, 88, "rod" + i, { jab });
        m.material.map.needsUpdate = true;
        m.position.set(state.player.x - 3.2 + i * 3.1 + Math.sin(i * 7) * 1.1,
          SURFACE_Y - (200 / 2 - 6) / PPM, 0.5);
      });
    } else {
      for (const m of probeMeshes) m.visible = false;
    }

    // 地道油灯：熄灯那一段，灯是一盏盏灭下去的
    if (state.lamps) {
      while (lampMeshes.length < state.lamps.length) {
        const i = lampMeshes.length;
        const body = BakeSprite(46, 60, 23, 54, (ctx, ax, ay) => {
          ART.InkFill(ctx, [[ax - 11, ay], [ax + 11, ay], [ax + 8, ay - 16], [ax - 8, ay - 16]],
            "lampBody" + i, "#8a6a45", { amp: 1, lw: 2.2, shade: "rgba(0,0,0,0.2)" });
          ART.InkFill(ctx, [[ax - 7, ay - 16], [ax + 7, ay - 16], [ax + 5, ay - 30], [ax - 5, ay - 30]],
            "lampGlass" + i, "#d8c58a", { amp: 0.9, lw: 2 });
          ART.InkLine(ctx, ax, ay - 30, ax, ay - 40, "lampWire" + i, { lw: 1.6, color: "#6b5a3f" });
        }, 0, DETAIL_SS);
        layers.play.add(body);
        SetPlayOrder(body, BAND.walk);
        const glow = MakeGlow(3.4, 0xffc06a, 1.0);
        scene.add(glow);
        lampMeshes.push({ body, glow });
      }
      state.lamps.forEach((l, i) => {
        const m = lampMeshes[i];
        if (!m) return;
        PlaceSprite(m.body, l.x, UNDER_Y + 1.5, PlaceZ(BAND.loose));
        m.body.visible = true;
        m.glow.visible = l.lit;
        m.glow.userData.SetLight(l.x, UNDER_Y + 1.4);
        m.body.material.opacity = l.lit ? 1 : 0.55;
      });
      for (let i = state.lamps.length; i < lampMeshes.length; i += 1) {
        lampMeshes[i].body.visible = false;
        lampMeshes[i].glow.visible = false;
      }
    } else if (lampMeshes.length) {
      for (const m of lampMeshes) { m.body.visible = false; m.glow.visible = false; }
    }

    // 刻痕
    {
      const marks = { marked: !!state.flags.marked, carved: !!state.flags.carved };
      if (marks.marked !== carveState.marked || marks.carved !== carveState.carved) {
        carveState = marks;
        carveRebuild?.(marks);
      }
    }

    // —— 谜题动词层的动态元素 ——
    // 驴车（第三章推车/跟车）与独轮车（第一章运木料）：kind 决定画哪一种。
    // 车画在演员前面一点，贴着车走就是躲进车影
    if (state.cart) {
      const cartKind = state.cart.kind || "cart";
      // 玩家**推着**的独轮车（第一章）走 pushCart 带：人在近侧握着车把，
      // 身子和手得画在车前面（所以在演员 0.6 之后）；但它是**街面上**的东西，
      // 推着从自家屋前过的时候不能被立面(0.4)吃掉——夹在两者之间的 0.5 是
      // 唯一同时成立的位置。第三章那辆驴车是**移动掩体**，得挡住人，留在
      // CART_COVER_Z——两种角色，两个深度。
      const pushed = cartKind === "barrow";
      const cz = pushed ? BAND.pushCart : CART_COVER_Z;
      // 新版第一章是空车推去、装上料再推回来——车上装了几件就画几件，
      // 装载数进 key，变了才重烘（三件是「两块门板 + 一根枣木杠」，
      // 第三件必须画成杠：截成 min(2) 的话「放上车」那一下画面毫无变化）
      const loadNow = state.flags.barrowHome ? 0 : (state.flags.barrowPlanks || 0);
      const cartKey = cartKind + ":" + (pushed ? loadNow : "");
      if (!cartMesh || cartMesh.userData.cartKind !== cartKey) {
        if (cartMesh) layers.play.remove(cartMesh);
        if (cartWheel) { layers.play.remove(cartWheel); cartWheel = null; }
        cartMesh = pushed
          ? BakeSprite(140, 80, 62, 72, (ctx, ax, ay) => ART.DrawBarrow(ctx, ax, ay, "pushBarrow", BarrowLoad(loadNow)), 0, PROP_SS)
          : BakeSprite(200, 120, 100, 110, (ctx, ax, ay) => ART.DrawCart(ctx, ax, ay, "cart"), 0, PROP_SS);
        cartMesh.userData.cartKind = cartKey;
        layers.play.add(cartMesh);
        SetPlayOrder(cartMesh, cz, "cart(" + cartKind + ")");
        if (pushed) {
          // 轮子单开一张，绕轮心转——车走多远轮转多少弧长，不是"贴图在平移"
          const R = ART.BARROW_WHEEL_R;
          cartWheel = BakeSprite(R * 2 + 12, R * 2 + 12, R + 6, R + 6,
            (ctx, ax, ay) => ART.DrawCartWheel(ctx, ax, ay, R, "pushWheel"), 0, PROP_SS);
          layers.play.add(cartWheel);
          SetPlayOrder(cartWheel, cz, "cartWheel");
        }
      }
      cartMesh.visible = true;
      // 独轮车有正反：画笔画的是**往左推**的姿态（轮在前、两根车把伸向右手边
      // 的人）。往右推就得整张翻过来，否则人在车尾、手却够不着车把——
      // 回程那一趟正是这么穿帮的。驴车是侧面对称的景，不翻。
      if (pushed) {
        const pushDir = state.cart.dir || -1;            // 车往哪边走
        PlaceSpriteFlip(cartMesh, state.cart.x, SURFACE_Y, PlaceZ(cz),
          pushDir === ART.BARROW_ART_DIR ? 1 : -1);
      } else PlaceSprite(cartMesh, state.cart.x, SURFACE_Y, PlaceZ(cz));
      if (cartWheel) {
        cartWheel.visible = true;
        const R = ART.BARROW_WHEEL_R / PPM;              // 轮半径（米）
        cartWheel.position.set(state.cart.x, SURFACE_Y + ART.BARROW_WHEEL_Y / PPM, PlaceZ(cz));
        // 滚过的弧长 = 走过的路程：θ = -s/R（往前走轮子顺时针转）
        cartWheel.rotation.z = -((state.cart.roll || 0) / R);
      }
    } else {
      if (cartMesh) cartMesh.visible = false;
      if (cartWheel) cartWheel.visible = false;
    }

    // 独轮车（不在推的时候是静物）：装了几根木料照几根；推到家就停在爹跟前
    {
      const wantBarrow = ch.scene === "village" && state.chapterIndex === 0 && !state.cart;
      const load = state.flags.barrowHome ? 0 : (state.flags.barrowPlanks || 0);
      if (wantBarrow) {
        const key = "b" + load;
        if (!barrowMesh || barrowMesh.userData.k !== key) {
          if (barrowMesh) layers.play.remove(barrowMesh);
          if (barrowWheel) { layers.play.remove(barrowWheel); barrowWheel = null; }
          barrowMesh = BakeSprite(140, 80, 62, 72, (ctx, ax, ay) => ART.DrawBarrow(ctx, ax, ay, "barrowP", BarrowLoad(load)), 0, PROP_SS);
          barrowMesh.userData.k = key;
          layers.play.add(barrowMesh);
          SetPlayOrder(barrowMesh, BAND.walk);
          // 停着的车轮子也单开一张（不转，但得跟推着的那辆长一个样）
          const R = ART.BARROW_WHEEL_R;
          barrowWheel = BakeSprite(R * 2 + 12, R * 2 + 12, R + 6, R + 6,
            (ctx, ax, ay) => ART.DrawCartWheel(ctx, ax, ay, R, "parkWheel"), 0, PROP_SS);
          layers.play.add(barrowWheel);
          SetPlayOrder(barrowWheel, BAND.walk);
        }
        barrowMesh.visible = true;
        if (barrowWheel) {
          barrowWheel.visible = true;
          barrowWheel.position.set(state.flags.barrowHome ? 41.6 : 19.8,
            SURFACE_Y + ART.BARROW_WHEEL_Y / PPM, PlaceZ(BAND.walk));
        }
        // 平时停在西头磨盘旁（新剧本：村里几户合用的车就搁在磨盘边）；
        // 拉完料停在工作台西边一步，别压着院里的水缸（43.4）
        // 停着的车也有正反：西头那辆是等着人往左推走的（贴图原样）；
        // 拉完料停在家门口的这辆是刚往右推回来的，车把自然朝西——翻过来
        PlaceSpriteFlip(barrowMesh, state.flags.barrowHome ? 41.6 : 19.8, SURFACE_Y,
          PlaceZ(BAND.walk), state.flags.barrowHome ? -1 : 1);
      } else {
        if (barrowMesh) barrowMesh.visible = false;
        if (barrowWheel) barrowWheel.visible = false;
      }
    }

    // 落地道具：手里放下的东西（自由放下 + 链里的「放下换手」共用一套）。
    // 深度带 loose：压在行走线道具之前、演员之后——放下的东西永远看得见
    {
      const items = state.groundItems || [];
      const live = new Set();
      for (const g of items) {
        live.add(g.uid);
        let m = groundItemMeshes.get(g.uid);
        if (!m) {
          m = MakeGroundItemMesh(g.label);
          layers.play.add(m);
          SetPlayOrder(m, BAND.loose, "groundItem");
          groundItemMeshes.set(g.uid, m);
        }
        m.visible = true;
        PlaceSprite(m, g.x, g.level === "under" ? UNDER_Y : SURFACE_Y, PlaceZ(BAND.loose));
      }
      for (const [uid, m] of groundItemMeshes) {
        if (!live.has(uid)) { layers.play.remove(m); groundItemMeshes.delete(uid); }
      }
    }

    // 引导图形气泡（「我缺什么」）＋一次性气泡（？/石子提示）
    {
      const wants = [];
      for (const b of state.bubbles || []) wants.push(b);
      if (state.bubbleFlash) wants.push(state.bubbleFlash);
      while (bubbleMeshes.length < wants.length) {
        const m = new THREE.Mesh(
          new THREE.PlaneGeometry(56 / PPM, 48 / PPM),
          new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false }),
        );
        FixOrder(m, LAYER_ORDER.fx + 320);
        layers.fx.add(m);
        bubbleMeshes.push(m);
      }
      bubbleMeshes.forEach((m, i) => {
        const b = wants[i];
        if (!b) { m.visible = false; return; }
        if (!bubbleTex.has(b.icon)) {
          // HINT_SS 超采样：气泡常被镜头推近，1x 烘出来一放大就糊
          const c = MakeCanvas(56 * HINT_SS, 48 * HINT_SS);
          const g = c.getContext("2d");
          g.scale(HINT_SS, HINT_SS);
          // "item:标签" = 落地道具的悬浮提示：空气泡里画一枚道具本身的小样
          const itemIcon = b.icon.startsWith("item:") ? b.icon.slice(5) : null;
          ART.DrawIconBubble(g, 28, 44, itemIcon ? "" : b.icon, "bub" + b.icon);
          if (itemIcon) ART.DrawCarry(g, 28, 44 - 28 * 0.58 - 4, 0.9, 1, itemIcon);
          bubbleTex.set(b.icon, CanvasTexture(c));
        }
        if (m.material.map !== bubbleTex.get(b.icon)) {
          m.material.map = bubbleTex.get(b.icon);
          m.material.needsUpdate = true;
        }
        let bx = b.x, by = b.y;
        if (b.who) {
          const a = b.who === "player" ? state.player : state.actors.find((x) => x.id === b.who);
          if (!a || a.visible === false) { m.visible = false; return; }
          bx = a.x;
          by = (a.level === "under" ? UNDER_Y : SURFACE_Y) + 2.15;
        }
        m.visible = true;
        m.material.opacity = 0.8 + Math.sin(time * 5.2) * 0.12;
        m.position.set(bx, (by ?? SURFACE_Y + 2.1) + Math.sin(time * 2.6) * 0.05, 0.62);
      });
    }

    // 投掷弧线预览：点列由 Core 用**和真石子同一套**弹道物理跑出来，预览即所得。
    // 灰/亮只说"够不够劲出手"，打不打得中要玩家自己看那条弧穿没穿进冠里——
    // 这里曾经还有一条"站位够了就画直线连到靶心"的分支，那是按键必中版的遗物，
    // 已随 StartThrow 一起删掉：站位不是瞄准
    if (state.throwAim) {
      const ta = state.throwAim;
      if (!throwAimLine) {
        const geo = new THREE.BufferGeometry();
        geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(3 * 22), 3));
        throwAimLine = new THREE.Line(geo, new THREE.LineDashedMaterial({
          color: 0xffffff, transparent: true, opacity: 0.55, dashSize: 0.28, gapSize: 0.2, depthWrite: false,
        }));
        FixOrder(throwAimLine, LAYER_ORDER.fx + 240);
        layers.fx.add(throwAimLine);
      }
      const pos = throwAimLine.geometry.attributes.position;
      // 点列是世界坐标（Core 从攥住那一刻手的绝对高度积出来的），别再加一次地面高
      for (let i = 0; i < 22; i += 1) {
        const src = ta.pts[Math.min(ta.pts.length - 1, Math.round(i / 21 * (ta.pts.length - 1)))];
        pos.setXYZ(i, src[0], src[1], 0.55);
      }
      pos.needsUpdate = true;
      throwAimLine.computeLineDistances();
      throwAimLine.material.color.setHex(ta.ok ? 0xffe9b0 : 0x9a9a92);
      throwAimLine.material.opacity = ta.ok ? 0.85 : 0.4;
      throwAimLine.material.dashSize = ta.ok ? 10 : 0.28;   // 实线=一段拉满的 dash
      throwAimLine.visible = true;
    } else if (throwAimLine) throwAimLine.visible = false;

    // 惊飞的麻雀 / 扑棱下地的母鸡 / 蹿走的田鼠：一张小画布逐帧重画。
    //
    // 画布挂在 SURFACE_Y + CRITTER_LIFT 上，**世界地面在画布里是 CG**，不是画布
    // 底边。原来几个 y 是写死的像素（母鸡 118→166、田鼠 186），换算过来是
    // 母鸡落到地下 0.38m、田鼠一路在地下 0.8m 跑——"扑棱下地"成了钻地。
    // 一律按"离地多少米"算。
    const CRITTER_LIFT = 1.0;
    const CG = 100 + CRITTER_LIFT * PPM;      // 地平线在这块画布里的 y
    const AtY = (m) => CG - m * PPM;          // 离地 m 米 → 画布 y
    {
      const fx = state.sparrowBurst || state.henFlee || state.mouseFlee || state.elmRain;
      if (fx) {
        if (!critterMesh) {
          critterCanvas = MakeCanvas(320 * 2, 200 * 2);   // 小活物动得快，2x 就够
          critterCtx = critterCanvas.getContext("2d");
          const tex = CanvasTexture(critterCanvas);
          critterMesh = new THREE.Mesh(
            new THREE.PlaneGeometry(320 / PPM, 200 / PPM),
            new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }),
          );
          // 小活物是玩法层里的东西，得和人、车、柴堆一起按深度排。挂在 fx 层
          // （基序号比 play 高一整档）＝永远压在所有人前面：母鸡会从柱子脸前飞过去。
          // loose 带正好是"看得见但不挡人"，比演员靠后一档。
          layers.play.add(critterMesh);
          SetPlayOrder(critterMesh, BAND.loose, "critter");
        }
        const c = critterCtx;
        c.setTransform(2, 0, 0, 2, 0, 0);
        c.clearRect(0, 0, 320, 200);
        c.save();
        if (state.sparrowBurst) {
          const t = state.sparrowBurst.t;
          c.globalAlpha = Math.max(0, 1 - t / 2.0);
          for (let i = 0; i < 4; i += 1) {
            const dir = i % 2 ? 1 : -1;
            const sx = 160 + dir * (14 + t * (34 + i * 15));
            // 从落石处炸窝：贴着地起飞，各自窜上去
            const sy = AtY(0.18 + t * (1.38 + i * 0.46)) + Math.sin(t * 9 + i) * 6;
            ART.DrawSparrow(c, sx, sy, "sp" + i, (t * 5 + i * 0.3) % 1);
          }
        } else if (state.henFlee) {
          const t = state.henFlee.t;
          c.globalAlpha = Math.max(0, 1 - Math.max(0, t - 1.4));
          // 从木料上（0.42m）扑棱到地面（0.06m），一路小跑着走开
          const hx = 160 + t * 62;
          const hy = AtY(0.27 - Math.min(1, t / 0.5) * 0.21) + Math.sin(t * 16) * 3;
          ART.DrawHen(c, hx, hy, "fleeHen");
          // 扑棱的翅
          ART.InkLine(c, hx - 2, hy - 12, hx - 12, hy - 22 - Math.sin(t * 22) * 6, "henWing",
            { lw: 3, color: "#8d6a3c", amp: 1 });
        } else if (state.mouseFlee) {
          const t = state.mouseFlee.t;
          c.globalAlpha = Math.max(0, 1 - t / 1.1);
          ART.DrawMouse(c, 160 - t * 150, AtY(0.05) + Math.sin(t * 30) * 2, "fleeMouse");
        } else if (state.elmRain) {
          // 榆钱雨：一把青黄的小圆片从冠里簌簌往下飘，左摇右摆地落
          const t = state.elmRain.t;
          c.globalAlpha = Math.max(0, 1 - Math.max(0, t - 1.6) / 0.6);
          for (let i = 0; i < 14; i += 1) {
            const h0 = 1.9 + ART.Hash("er" + i) * 0.5;                    // 各自的起飞高度
            const fall = Math.max(0, t - ART.Hash("ed" + i) * 0.5);       // 错峰往下掉
            const y = Math.max(0.05, h0 - fall * 1.1);
            const sx = 160 + (ART.Hash("ex" + i) - 0.5) * 66
              + Math.sin(fall * 5 + i) * 9;                               // 边落边打摆
            const sy = AtY(y);
            c.save();
            c.translate(sx, sy);
            c.rotate(Math.sin(fall * 6 + i * 2) * 0.9);
            c.beginPath();
            c.ellipse(0, 0, 3.4, 2.4, 0, 0, Math.PI * 2);
            c.fillStyle = i % 2 ? "#aebf72" : "#c2cf8a";
            c.fill();
            c.strokeStyle = "rgba(90,110,50,0.7)";
            c.lineWidth = 0.8;
            c.stroke();
            c.restore();
          }
        }
        c.restore();
        critterMesh.material.map.needsUpdate = true;
        critterMesh.visible = true;
        const baseX = state.sparrowBurst?.x ?? state.henFlee?.x ?? state.mouseFlee?.x ?? state.elmRain?.x;
        critterMesh.position.set(baseX, SURFACE_Y + CRITTER_LIFT, PlaceZ(BAND.loose));
      } else if (critterMesh) critterMesh.visible = false;
    }

    // 翻越落地扬起的干土：半秒就散，但没有它落地就是"啪"一声没有画面
    {
      const vd = state.vaultDust;
      if (vd && vd.t < 0.62) {
        if (!dustMesh) {
          dustCanvas = MakeCanvas(160, 90);
          dustCtx = dustCanvas.getContext("2d");
          dustMesh = new THREE.Mesh(
            new THREE.PlaneGeometry(160 / PPM, 90 / PPM),
            new THREE.MeshBasicMaterial({ map: CanvasTexture(dustCanvas), transparent: true, depthWrite: false }),
          );
          FixOrder(dustMesh, LAYER_ORDER.fx + 250);
          layers.fx.add(dustMesh);
        }
        const c = dustCtx;
        c.clearRect(0, 0, 160, 90);
        const t = vd.t;
        c.globalAlpha = Math.max(0, 1 - t / 0.62) * 0.55;
        for (let i = 0; i < 5; i += 1) {
          const dir = i % 2 ? 1 : -1;
          const px = 80 + dir * (6 + t * (46 + i * 12));
          const py = 78 - t * (14 + i * 5);
          c.beginPath();
          c.arc(px, py, 5 + t * (13 + i * 2), 0, Math.PI * 2);
          c.fillStyle = i % 2 ? "rgba(196,178,140,0.75)" : "rgba(172,152,116,0.65)";
          c.fill();
        }
        dustMesh.material.map.needsUpdate = true;
        dustMesh.visible = true;
        dustMesh.position.set(vd.x, SURFACE_Y + 0.42, 0.52);
      } else if (dustMesh) dustMesh.visible = false;
    }

    // 刨料：台面上那块毛料 + 骑在手上的刨子 + 打着卷落下来的刨花 + 地上那堆。
    // 这一拍镜头推到 2.9m，木头是主角——料的毛面要能看出一趟趟被削平。
    // 那扇会晃的家门：整扇挂在**上门轴**上，转的是挂它的那个 Group——
    // 于是"绕上轴摆"这件事由场景图负责，画笔（ART.DrawHungDoor）只管把门
    // 从轴那一点往下画一扇，不必知道角度。
    if (state.doorLeaf) {
      const dl = state.doorLeaf;
      if (!doorLeafPivot || doorLeafLoose !== !!dl.loose) {
        if (doorLeafPivot) layers.play.remove(doorLeafPivot);
        doorLeafLoose = !!dl.loose;
        doorLeafPivot = new THREE.Group();
        doorLeafMesh = BakeSprite(ART.HUNG_DOOR_W + 24, ART.HUNG_DOOR_H + 16, 20, 8,
          (ctx, ax, ay) => ART.DrawHungDoor(ctx, ax, ay, "homeDoor", { loose: doorLeafLoose }),
          0, PROP_SS);
        // 贴图锚点＝上门轴：把网格按 BakeSprite 算好的锚点偏移摆进 Group，
        // Group 的原点就落在门轴上，转 Group 就是绕轴摆。
        //（偏移的 x 不能取负——PlaceSprite 用的就是 +offset.x，取负会让整扇门
        //  往左错半个锚点差，门就挂到门框外面去了。）
        doorLeafMesh.position.set(doorLeafMesh.userData.offset.x, doorLeafMesh.userData.offset.y, 0);
        doorLeafPivot.add(doorLeafMesh);
        // 门扇压在门框之前、演员之后：它是玩家要伸手按住的东西，不能被人挡住
        SetPlayOrder(doorLeafPivot, BAND.loose, "doorLeaf");
        layers.play.add(doorLeafPivot);
      }
      doorLeafPivot.visible = true;
      doorLeafPivot.position.set(dl.x, SURFACE_Y + (dl.hingeY ?? 1.95), BAND.loose);
      // 世界里 +lean 是"往外（+x）坠"，屏幕上就是顺时针 → 绕 z 负向转。
      // strain（攥着它较劲时才有）在渲染层抖那一丝——两只手对着一扇门的分量，
      // 谁也压不死谁。判定用的 lean 不掺这份演出（Core 只算物理）。
      const trem = (dl.strain || 0) * 0.008 * Math.sin(time * 34);
      doorLeafPivot.rotation.z = -((dl.lean || 0) + trem);
    } else if (doorLeafPivot) doorLeafPivot.visible = false;

    if (state.planing) {
      const pl = state.planing;
      const boardW = pl.span + 0.26;
      if (!planeBoardMesh) {
        const wPx = Math.round(boardW * PPM);
        planeBoardCanvas = MakeCanvas(wPx * PROP_SS, 40 * PROP_SS);
        planeBoardCtx = planeBoardCanvas.getContext("2d");
        planeBoardCtx.scale(PROP_SS, PROP_SS);
        planeBoardMesh = new THREE.Mesh(
          new THREE.PlaneGeometry(boardW, 40 / PPM),
          new THREE.MeshBasicMaterial({ map: CanvasTexture(planeBoardCanvas), transparent: true, depthWrite: false }),
        );
        layers.play.add(planeBoardMesh);
        // 料搁在台面上：压在行走线道具（台子）之前、演员之后 —— 正是 loose 带
        SetPlayOrder(planeBoardMesh, BAND.loose, "planeBoard");
        planeBoardMesh.userData.k = "";
        // 刨子本体：真家伙就巴掌长（≈0.34m）。S=0.74 让 DrawCarry 的 22S 像素
        // 正好落在这个尺寸上——上一版按 S=1.9 画，一把刨子有 0.9m 长
        planeToolMesh = BakeSprite(26, 20, 13, 14,
          (ctx, ax, ay) => ART.DrawCarry(ctx, ax, ay, 0.74, 1, "刨子"), 0, DETAIL_SS * 4);
        layers.play.add(planeToolMesh);
        SetPlayOrder(planeToolMesh, CARRY_Z, "planeTool");   // 攥在手里，与其它手持物同一层
        // 地上的刨花堆
        planePileCanvas = MakeCanvas(64 * PROP_SS, 26 * PROP_SS);
        planePileCtx = planePileCanvas.getContext("2d");
        planePileCtx.scale(PROP_SS, PROP_SS);
        planePileMesh = new THREE.Mesh(
          new THREE.PlaneGeometry(64 / PPM, 26 / PPM),
          new THREE.MeshBasicMaterial({ map: CanvasTexture(planePileCanvas), transparent: true, depthWrite: false }),
        );
        layers.play.add(planePileMesh);
        SetPlayOrder(planePileMesh, BAND.loose, "planePile");   // 落在台子这一侧的地上
        planePileMesh.userData.k = -1;
      }
      // 毛面按 12 档重画（连续重画一块 PROP_SS 的画布太亏）
      const bucket = Math.round(pl.smooth * 12);
      if (planeBoardMesh.userData.k !== bucket) {
        planeBoardMesh.userData.k = bucket;
        const wPx = Math.round(boardW * PPM);
        planeBoardCtx.clearRect(0, 0, wPx, 40);
        ART.DrawPlaneBoard(planeBoardCtx, wPx / 2, 14, pl.span * PPM, bucket / 12, "c1board");
        planeBoardMesh.material.map.needsUpdate = true;
      }
      planeBoardMesh.visible = true;
      // 料的上沿画在画布 y=14，网格中心是 y=20。画布 y 向下、世界 y 向上，
      // 所以中心要落在上沿**之下** 6px——符号写反的话料就飘在台面上方
      planeBoardMesh.position.set(pl.x, SURFACE_Y + pl.y - (20 - 14) / PPM, PlaceZ(BAND.loose));

      // 刨子：**挂在推刨那个人的手上**。位置不另算一份——手在哪它就在哪，
      // 手是姿势给的、姿势是推程给的，于是"手推多远、刨子走多远"天然成立。
      // （另算一份 u→x 的话，两条线迟早对不上，刨子就飘在手外面了。）
      // 世界里这一份是替补：玩家真正操作的是铺满画框的那张刨料卡
      //（Art.DrawPlaneCard），卡永远盖着它，只有卡没画出来时才露脸。
      const hand = planeHandRig ? HandPoint(planeHandRig) : null;
      planeToolMesh.visible = !!hand;
      if (hand) planeToolMesh.position.set(hand.x + 0.02, hand.y - 0.05, CARRY_Z);

      if (planePileMesh.userData.k !== pl.pile) {
        planePileMesh.userData.k = pl.pile;
        planePileCtx.clearRect(0, 0, 64, 26);
        ART.DrawShavingPile(planePileCtx, 32, 22, pl.pile, "c1pile");
        planePileMesh.material.map.needsUpdate = true;
      }
      planePileMesh.visible = pl.pile > 0;
      planePileMesh.position.set(pl.x + pl.span / 2 + 0.22, SURFACE_Y + 13 / PPM, PlaceZ(BAND.loose));
    } else {
      if (planeBoardMesh) planeBoardMesh.visible = false;
      if (planeToolMesh) planeToolMesh.visible = false;
      if (planePileMesh) planePileMesh.visible = false;
    }

    // 刚削下来的那条刨花：从刨刃口弹出来，打着旋儿飘到地上
    if (state.planeCurl) {
      const cu = state.planeCurl;
      if (!planeCurlMesh) {
        planeCurlCanvas = MakeCanvas(26 * PROP_SS, 26 * PROP_SS);
        planeCurlCtx = planeCurlCanvas.getContext("2d");
        planeCurlCtx.scale(PROP_SS, PROP_SS);
        planeCurlMesh = new THREE.Mesh(
          new THREE.PlaneGeometry(26 / PPM, 26 / PPM),
          new THREE.MeshBasicMaterial({ map: CanvasTexture(planeCurlCanvas), transparent: true, depthWrite: false }),
        );
        FixOrder(planeCurlMesh, LAYER_ORDER.fx + 200);   // 飞在空中的刨花：fx 层例外（见 CLAUDE.md 词汇表）
        layers.fx.add(planeCurlMesh);
        planeCurlMesh.userData.k = -1;
      }
      const lb = Math.round(cu.len * 4);
      if (planeCurlMesh.userData.k !== lb) {
        planeCurlMesh.userData.k = lb;
        planeCurlCtx.clearRect(0, 0, 26, 26);
        ART.DrawShaving(planeCurlCtx, 13, 13, 0.4, Math.max(0.3, lb / 4), "curl" + lb);
        planeCurlMesh.material.map.needsUpdate = true;
      }
      // 自由落体 + 空气里打旋：飘得越久转得越慢
      const t = cu.t;
      const fall = 0.35 * t + 0.9 * t * t;
      planeCurlMesh.visible = t < 1.6;
      planeCurlMesh.material.opacity = Math.max(0, 1 - Math.max(0, t - 1.0) / 0.6);
      planeCurlMesh.rotation.z = t * 3.4 * (0.4 + cu.len);
      planeCurlMesh.position.set(
        cu.x + 0.12 + Math.sin(t * 4.1) * 0.06,
        Math.max(SURFACE_Y + 0.06, SURFACE_Y + cu.y - fall),
        0.6,
      );
    } else if (planeCurlMesh) planeCurlMesh.visible = false;

    // 潜行失败的视觉复盘：谁看见的，头顶亮一记「！」（首败不给文字，给这个）
    if (state.spotFlash) {
      if (!spotFlashMesh) {
        spotFlashMesh = BakeSprite(48, 60, 24, 52, (ctx, ax, ay) => {
          ctx.strokeStyle = "rgba(20,12,6,0.7)";
          ctx.lineWidth = 7;
          ctx.lineCap = "round";
          ctx.beginPath(); ctx.moveTo(ax, ay - 40); ctx.lineTo(ax, ay - 16); ctx.stroke();
          ctx.beginPath(); ctx.arc(ax, ay - 5, 3.6, 0, Math.PI * 2); ctx.stroke();
          ctx.strokeStyle = "#ffd98a";
          ctx.lineWidth = 4;
          ctx.beginPath(); ctx.moveTo(ax, ay - 40); ctx.lineTo(ax, ay - 16); ctx.stroke();
          ctx.fillStyle = "#ffd98a";
          ctx.beginPath(); ctx.arc(ax, ay - 5, 2.6, 0, Math.PI * 2); ctx.fill();
        }, 0, HINT_SS);
        layers.fx.add(spotFlashMesh);
        FixOrder(spotFlashMesh, LAYER_ORDER.fx + 340);
      }
      spotFlashMesh.visible = Math.sin(time * 16) > -0.5;
      spotFlashMesh.material.opacity = Math.min(1, state.spotFlash.t / 0.4);
      spotFlashMesh.position.set(state.spotFlash.x, SURFACE_Y + state.spotFlash.y, 0.66);
    } else if (spotFlashMesh) spotFlashMesh.visible = false;

    // 敌人视线可见化：每个巡逻兵面前一片**躺在地上的光池**，长度就是探测
    // 逻辑用的视距（同一个数，画出来的和判出来的必须是同一条线）。
    // 平铺而不是立一堵光墙——立着的光带会把夜里整条街的地面观感改掉；
    // 躺平的光池只是"灯照到了这片地"，和影子同一种语言。
    // 过场里也画：第二章教学幕全靠这片光扫过草垛来演示规则。
    {
      const showCones = state.stealthActive && state.phase === "playing";
      const enemies = showCones
        ? state.actors.filter((a) => (a.kind === "soldier" || a.kind === "puppet") && a.visible !== false && !a.decor)
        : [];
      if (enemies.length && !coneTex) {
        // 一张横向渐变：靠人最亮，往视距尽头收干净；纵向（进深）也柔掉
        const c = MakeCanvas(160, 40);
        const cctx = c.getContext("2d");
        const gh = cctx.createLinearGradient(0, 0, 160, 0);
        gh.addColorStop(0, "rgba(255,224,150,1)");
        gh.addColorStop(0.5, "rgba(255,224,150,0.55)");
        gh.addColorStop(1, "rgba(255,224,150,0)");
        cctx.fillStyle = gh;
        cctx.fillRect(0, 0, 160, 40);
        cctx.globalCompositeOperation = "destination-in";
        const gv = cctx.createLinearGradient(0, 0, 0, 40);
        gv.addColorStop(0, "rgba(0,0,0,0)");
        gv.addColorStop(0.5, "rgba(0,0,0,1)");
        gv.addColorStop(1, "rgba(0,0,0,0)");
        cctx.fillStyle = gv;
        cctx.fillRect(0, 0, 160, 40);
        coneTex = CanvasTexture(c);
        coneTex.generateMipmaps = false;
        coneTex.minFilter = THREE.LinearFilter;
      }
      while (coneMeshes.length < enemies.length) {
        // 贴地矮光带：竖片但只有 0.6m 高、下沿贴着地面、上沿在贴图里柔掉。
        // 平视机位下躺平的光池会投影成几像素的细缝（和影子一样），根本读不出；
        // 而 1.2m 的光墙又会把整条夜街的地面观感改掉——0.6m 是两头都留住的高度。
        const m = new THREE.Mesh(
          new THREE.PlaneGeometry(1, 0.6),
          new THREE.MeshBasicMaterial({
            map: coneTex, transparent: true, opacity: 0.2,
            blending: THREE.AdditiveBlending, depthWrite: false,
            // 朝西的光带靠负缩放翻贴图，绕序跟着翻——单面材质会把它整个剔除，
            // 于是"面朝西的兵没有视线光"这种只在一半情况出现的隐形 bug
            side: THREE.DoubleSide,
          }),
        );
        FixOrder(m, LAYER_ORDER.fx + 206);
        layers.fx.add(m);
        coneMeshes.push(m);
      }
      coneMeshes.forEach((m, i) => {
        const a = enemies[i];
        if (!a) { m.visible = false; return; }
        const range = VISION_RANGE * VisionScale(state);
        const dir = (a.heading || 1) >= 0 ? 1 : -1;
        m.visible = true;
        m.scale.set(dir * range, 1, 1);
        m.position.set(a.x + dir * range / 2,
          (a.level === "under" ? UNDER_Y : SURFACE_Y) + 0.28, 0.2);
        // 夜里灯就是主角，光带要一眼读得出——白天淡一点（是"视线"不是灯）
        const night2 = CHAPTERS[state.chapterIndex].light === "night" || CHAPTERS[state.chapterIndex].light === "dark";
        // 夜里这一片光就是玩法本身（照到哪儿=不能站哪儿），得一眼读得出
        const base = night2 ? 0.52 : 0.16;
        // 举灯预兆（要回头扫了）：光收紧、亮一档——危险先看得见再生效
        const lift = a.scanLift || 0;
        m.material.opacity = base * (1 + lift * 0.9) + Math.sin(time * 2.6 + i * 1.9) * 0.04;
      });

      // 掩体的**影子**：这一段路真正的玩法长在这上面。
      //
      // 藏 = 站到掩体背光的那一面，所以"安全在哪儿"必须画出来，不能靠玩家
      // 猜。每处被灯照到的掩体，在它背光的一侧铺一条暗带——那条暗带的长短
      // 与判定用的余量（COVER_PAD）是同一个数，站进去就是藏住了。灯绕到另一
      // 边，影子当场换头，玩家看见的就是"该挪窝了"。
      {
        const scene = SCENES[CHAPTERS[state.chapterIndex].scene];
        const covers = (showCones ? scene.covers : null) || [];
        const range = VISION_RANGE * VisionScale(state);
        const shades = [];
        for (const c of covers) {
          // 谁在照它——取最近的那个，影子只有一条（一维里也只可能有一条主光）
          let lit = null, bestD = Infinity;
          for (const a of enemies) {
            const dx = c.x - a.x;
            if (Math.sign(dx) !== Math.sign(a.heading || 1)) continue;
            const d = Math.abs(dx);
            if (d > range + c.w / 2 || d >= bestD) continue;
            bestD = d; lit = a;
          }
          if (!lit) continue;
          const side = Math.sign(c.x - lit.x) || 1;      // 背光那一头
          const x0 = c.x + side * (c.w / 2 - 0.15);
          const x1 = c.x + side * (c.w / 2 + COVER_PAD);
          shades.push({ x: (x0 + x1) / 2, w: Math.abs(x1 - x0), dir: side, tall: !!c.tall });
        }
        if (shades.length && !shadeTex) {
          // 一张"贴着垛根最深、往外化开"的软影：硬边的方块读起来是 UI，
          // 不是影子。横向从掩体那一头浓到淡，纵向两头收干净——和光池同一种语言
          const c = MakeCanvas(96, 40);
          const cctx = c.getContext("2d");
          const gh = cctx.createLinearGradient(0, 0, 96, 0);
          gh.addColorStop(0, "rgba(6,10,20,1)");
          gh.addColorStop(0.45, "rgba(6,10,20,0.72)");
          gh.addColorStop(1, "rgba(6,10,20,0)");
          cctx.fillStyle = gh;
          cctx.fillRect(0, 0, 96, 40);
          cctx.globalCompositeOperation = "destination-in";
          const gv = cctx.createLinearGradient(0, 0, 0, 40);
          gv.addColorStop(0, "rgba(0,0,0,0)");
          gv.addColorStop(0.62, "rgba(0,0,0,1)");
          gv.addColorStop(1, "rgba(0,0,0,0.35)");
          cctx.fillStyle = gv;
          cctx.fillRect(0, 0, 96, 40);
          shadeTex = CanvasTexture(c);
          shadeTex.generateMipmaps = false;
          shadeTex.minFilter = THREE.LinearFilter;
        }
        while (shadeMeshes.length < shades.length) {
          const m = new THREE.Mesh(
            new THREE.PlaneGeometry(1, 0.72),
            new THREE.MeshBasicMaterial({
              map: shadeTex, transparent: true, opacity: 0.3, depthWrite: false,
              side: THREE.DoubleSide,          // 朝西的影子靠负缩放翻贴图，绕序跟着翻
            }),
          );
          FixOrder(m, LAYER_ORDER.fx + 205);            // 压在光池之下：影子是被光衬出来的
          layers.fx.add(m);
          shadeMeshes.push(m);
        }
        shadeMeshes.forEach((m, i) => {
          const s = shades[i];
          if (!s) { m.visible = false; return; }
          m.visible = true;
          m.scale.set(s.dir * s.w, 1, 1);               // 浓的那一端贴着垛根
          m.position.set(s.x, SURFACE_Y + 0.30, 0.19);
          // 高掩体的影子实、矮掩体的虚一档——"这个得蹲下去"也在画面里说了
          m.material.opacity = (s.tall ? 0.72 : 0.42) + Math.sin(time * 1.7 + i) * 0.04;
        });
      }
    }

    // 室内外切换：人走进门，立面淡出、屋里亮出来；走出去又合上。
    // 演员本来就画在立面之前，所以只需要动立面这一张的透明度
    if (homeFacade && homeRange) {
      // 进没进屋由 Core 判（IndoorOpen）：位置只是必要条件——推着独轮车的人
      // 走的是屋外那条道，车进不了堂屋
      const inside = IndoorOpen(state, homeRange.x0, homeRange.x1);
      // 戏在屋里演（爹修门那一场）：玩家还在门外，可墙合着的话他连爹在哪
      // 都看不见——只看得见一双脚从墙根底下漏出来（用户 2026-08-09 报的）。
      // 节拍声明 indoorScene 就把立面半隐掉：看得见屋里，也还看得出有堵墙。
      const def = CurrentBeatDef(state);
      const staged = !!(def?.indoorScene || state.beat?.indoorScene);
      const goal = inside ? 0.07 : (staged ? 0.16 : 1);
      const cur = homeFacade.material.opacity ?? 1;
      if (Math.abs(cur - goal) > 0.005) {
        homeFacade.material.transparent = true;
        homeFacade.material.opacity = cur + (goal - cur) * Math.min(1, dt * 5.5);
      }
      // 屋里的地窖口/梯子**不做隐现**：它们画在 loose(0.3) 带、立面在
      // facade(0.4) 带——墙本来就排在它们前面，合着的时候地面以上那一截
      // 自然被墙挡住，地面以下那一截照常露着。于是从院里看过去就是
      // 「地窖在屋子底下」——位置对了，画面自己说清楚了。
      // 2026-08-09 那次「地窖怎么在家门口外面」的根因是**位置**（窖口摆在
      // 院子里 x=37、根本不在屋子足迹内），不是画法；当时补的那层
      // 「跟立面反着隐现」是治错了症：它把地下那截也一起灭了，玩家在院里
      // 完全看不到自家地窖口，非得走进屋一米半才冒出来
      //（用户 2026-08-10：「家里的地道为什么我在攀爬之前都是隐藏状态」）。
    }

    // 辘轳打水：井绳与桶跟着玩家的操作升降。绳从辘轳轴心垂到桶梁，
    // 桶沉下井口、灌满、再一把一把摇上来——全程看得见。
    // 转盘是真的在转：摇把角度由 Core 从绳的行程反推（crankA），
    // 鼠标绕圈、键盘、脱手倒转三条路在画面上是同一根摇把在抡。
    if (state.winchView) {
      const wv = state.winchView;
      if (!winchRope) {
        winchRope = new THREE.Mesh(
          new THREE.PlaneGeometry(0.045, 1),
          new THREE.MeshBasicMaterial({ color: 0x8a7350, transparent: true, opacity: 0.95, depthWrite: false }),
        );
        // 深度规范：绳与桶走 loose 带——压在井台（walk）之前、摇辘轳的人之后
        FixOrder(winchRope, DepthOrder("play", BAND.loose));
        layers.play.add(winchRope);
        winchBucket = BakeSprite(50, 46, 25, 23, (ctx, ax, ay) => ART.DrawCarry(ctx, ax, ay - 8, 1.5, 1, "水桶"), 0, DETAIL_SS);
        FixOrder(winchBucket, DepthOrder("play", BAND.loose) + 1);
        layers.play.add(winchBucket);
        // 摇把：轴销在画布正中，柄伸向 +x、末端一枚握手——旋转轴就是轴销。
        // **柄长必须等于 Core 的 WINCH_CRANK_R**，画面里那个圈就是
        // 判定用的那个圈，也是 Rig 反解前手的那个圈；三处对不上，手就抓空了。
        const armPx = WINCH_CRANK_R * PPM;
        winchCrank = BakeSprite(34, 34, 17, 17, (ctx, ax, ay) => {
          ctx.strokeStyle = "rgba(43,31,22,0.9)";
          ctx.lineCap = "round";
          // 柄臂
          ctx.lineWidth = 6.2;
          ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(ax + armPx, ay); ctx.stroke();
          ctx.strokeStyle = "#7a5a33";
          ctx.lineWidth = 4.0;
          ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(ax + armPx, ay); ctx.stroke();
          // 握手：一节磨亮的木柄。**它要比周围亮一档**——整根摇把上只有它绕着
          // 圈跑，玩家的眼睛盯的就是这一点（手攥在这儿，手也压在它后头）
          ctx.strokeStyle = "rgba(38,26,14,0.95)";
          ctx.lineWidth = 9.2;
          ctx.beginPath(); ctx.moveTo(ax + armPx, ay - 5.6); ctx.lineTo(ax + armPx, ay + 5.6); ctx.stroke();
          ctx.strokeStyle = "#c79a5c";
          ctx.lineWidth = 6.0;
          ctx.beginPath(); ctx.moveTo(ax + armPx, ay - 4.8); ctx.lineTo(ax + armPx, ay + 4.8); ctx.stroke();
          // 轴销：**一枚铁销子，3 厘米**。第一版画了 3.4px＝7 厘米半径，排到人
          // 之前以后就是一枚糊在脸上的大灰垫圈（实拍抓出来的）
          ctx.fillStyle = "#4a3b2a";
          ctx.strokeStyle = "rgba(26,18,10,0.9)";
          ctx.lineWidth = 1.2;
          ctx.beginPath(); ctx.arc(ax, ay, 1.7, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        }, 0, HINT_SS);
        // 摇把**排在人之前**（位置仍在井那条线上，只有绘制顺序往前提）：
        // 排在人之后的话，他一伸手就把整根摇把盖住了——屏幕上又成了"空划拉"。
        // 手落在握手上、握手压住手，读出来正好是"攥着把手"。
        FixOrder(winchCrank, DepthOrder("play", BAND.obstacle));
        layers.play.add(winchCrank);
        // 引导圈：没上手时绕轴心一圈虚线——「转这里」。同打结的引导圈一种语汇
        const geo = new THREE.BufferGeometry();
        geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(3 * 48), 3));
        winchGuide = new THREE.Line(geo, new THREE.LineDashedMaterial({
          color: 0xbfb49a, transparent: true, opacity: 0.5, dashSize: 0.11, gapSize: 0.09, depthWrite: false,
        }));
        FixOrder(winchGuide, DepthOrder("play", BAND.loose) + 3);
        layers.play.add(winchGuide);
      }
      const hubY = SURFACE_Y + WINCH_HUB_Y;                // 辘轳轴心（井架横杆中线）
      // 摇到顶＝桶提到井口沿上（伸手就够得着），往下一路沉进井里。
      // 沉多深不要按"井有多深"给——按**看得见多久**给：桶在头一小半程里
      // 一直看得见，之后才淡进井筒的黑里（第一版 0.70−1.30d 走到两成深度
      // 桶就没影了，玩家会以为它掉了）
      const bucketY = SURFACE_Y + 0.66 - wv.depth * 1.25;
      // 绳只画到井口沿为止：再往下它就该钻进井筒的黑里了。不夹的话，桶沉到
      // 底时会有一根木色的长条从辘轳一直拖到地面、还压在井台之前——读出来是
      // "绳挂在井外面"，不是"桶下到井里去了"
      const ropeBottom = Math.max(bucketY, SURFACE_Y + 0.62);
      winchRope.visible = true;
      winchRope.scale.set(1, Math.max(0.05, hubY - ropeBottom), 1);
      winchRope.position.set(wv.x, (hubY + ropeBottom) / 2, PlaceZ(BAND.loose));
      // 桶沉到井台沿以下就淡进井口那团黑里——它画在井台**之前**（loose 带），
      // 不淡的话整只桶会浮在石头台面上往下滑，读出来是"桶在井外掉"
      winchBucket.visible = wv.hooked && bucketY > 0.05;
      winchBucket.material.opacity = Math.max(0, Math.min(1, (bucketY - 0.05) / 0.30));
      winchBucket.material.transparent = true;
      winchBucket.position.set(wv.x, bucketY, PlaceZ(BAND.loose));
      // 灌满了桶身压得低一点
      winchBucket.rotation.z = wv.filled ? 0 : Math.sin(state.time * 2.1) * 0.08;
      winchCrank.visible = wv.hooked;
      // 手上吃劲，摇把也跟着抖一丝——判定的 crankA 不掺演出，抖只加在画面上
      const strain = wv.hooked ? Math.max(0, 1 - (wv.stam ?? 1) / 0.5) : 0;
      const shake = strain * 0.012 * Math.sin(state.time * 34);
      winchCrank.position.set(wv.crankX ?? wv.x, hubY + shake, PlaceZ(BAND.loose));
      // 歇息角：静止时摇把斜垂着，别跟横杆平行混成一根木头（角度由 Core 定，
      // 因为 gripX/gripY 与 Rig 的反解都照着同一个数算）
      winchCrank.rotation.z = (wv.crankA || 0) + WINCH_REST_A;
      // 引导圈只在挂好桶、手还没搭上去时呼吸；上手了就让开画面。
      // 半径贴着摇把画的那个圈——「手绕这儿转」得指的是真的那一圈
      const showGuide = wv.hooked && !wv.engaged;
      winchGuide.visible = showGuide;
      if (showGuide) {
        const pos = winchGuide.geometry.attributes.position;
        const R = WINCH_CRANK_R * 1.25;
        const gx = wv.crankX ?? wv.x;
        for (let i = 0; i < 48; i += 1) {
          const a = (i / 47) * Math.PI * 2;
          pos.setXYZ(i, gx + Math.cos(a) * R, hubY + Math.sin(a) * R, PlaceZ(BAND.loose));
        }
        pos.needsUpdate = true;
        winchGuide.computeLineDistances();
        winchGuide.material.opacity = 0.3 + Math.sin(state.time * 3.2) * 0.15;
      }
    } else if (winchRope) {
      winchRope.visible = false;
      winchBucket.visible = false;
      winchCrank.visible = false;
      winchGuide.visible = false;
    }

    // 拉绳定向（c1_ropeline）：一根**真的**麻绳。形状全由 Core.StepRopeLine 的
    // verlet 质点链给（ropeLine.pts），这里只把点串成一条有宽度的带子。
    //
    // 为什么是 ribbon 而不是别的两种画法：THREE.Line 的 linewidth 多数平台直接
    // 吃掉，绳永远只有一个像素（CLAUDE.md 立过这条规矩）；逐帧重画的 canvas 那
    // 套是给打结用的——18 米长的绳按 48px/米要三千多像素宽的画布，不可能。
    // ribbon 有真几何宽度：垂、拖地、绷直、抽回去都画得出来。
    {
      const rl = state.ropeLine;
      const pts = rl?.pts;
      if (rl && pts && pts.length > 1) {
        const n = pts.length;
        if (!ropeLineMesh || ropeLineMesh.userData.n !== n) {
          if (ropeLineMesh) layers.play.remove(ropeLineMesh);
          const geo = new THREE.BufferGeometry();
          geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(n * 2 * 3), 3));
          const idx = [];
          for (let i = 0; i < n - 1; i += 1) {
            const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
            idx.push(a, b, c, b, d, c);
          }
          geo.setIndex(idx);
          ropeLineMesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
            color: 0x8a7350, transparent: true, opacity: 0.97, depthWrite: false, side: THREE.DoubleSide,
          }));
          ropeLineMesh.frustumCulled = false;   // 包围球不逐帧重算，剔除会把它整条抹掉
          ropeLineMesh.userData.n = n;
          FixOrder(ropeLineMesh, DepthOrder("play", BAND.loose));
          layers.play.add(ropeLineMesh);
        }
        ropeLineMesh.visible = true;
        // 绳梢接到**真拳头**上。Core 的解算只认身位（那边写了为什么：手心是姿势
        // 的产物，拿它当绳端会绕成"绳→姿势→手心→绳"的闭环，人会被自己的胳膊
        // 卡住），所以"长在手上"这件事在画面这一侧办：把末尾三个点朝手心挪，
        // 越靠末端挪得越多，收出一个不打折的弯。
        let tip = null;
        if (rl.inHand) {
          const ps = actorSprites.get("player");
          if (ps) {
            const hp = HandPoint(ps.rig);
            const last = pts[n - 1];
            tip = { dx: hp.x - last.x, dy: hp.y - last.y };
          }
        }
        const TIP_W = [0.22, 0.55, 1];       // 末尾三点各吃多少修正
        const draw = (i) => {
          const q = pts[i];
          const k = tip ? (TIP_W[i - (n - TIP_W.length)] ?? 0) : 0;
          return k ? { x: q.x + tip.dx * k, y: q.y + tip.dy * k } : q;
        };
        const pos = ropeLineMesh.geometry.attributes.position;
        for (let i = 0; i < n; i += 1) {
          const q = draw(i);
          const a = draw(Math.max(0, i - 1)), b = draw(Math.min(n - 1, i + 1));
          let tx = b.x - a.x, ty = b.y - a.y;
          const tl = Math.hypot(tx, ty) || 1e-6;
          tx /= tl; ty /= tl;
          // 绷直的时候略细一点：麻绳吃上劲会抻细，松着堆在地上显得粗
          const half = ROPE_HALF * (1 - 0.18 * (rl.taut || 0));
          pos.setXYZ(i * 2, q.x - ty * half, q.y + tx * half, PlaceZ(BAND.loose));
          pos.setXYZ(i * 2 + 1, q.x + ty * half, q.y - tx * half, PlaceZ(BAND.loose));
        }
        pos.needsUpdate = true;
        // 锚点那头的绳盘：放出去多少，盘就小多少——"绳是从这儿放出来的"
        if (!ropeCoilMesh) {
          ropeCoilMesh = MakeGroundItemMesh("麻绳");
          layers.play.add(ropeCoilMesh);
          SetPlayOrder(ropeCoilMesh, BAND.loose, "ropeCoil");
        }
        const remain = Math.max(0, 1 - (rl.pay || 0) / (rl.L || 1));
        ropeCoilMesh.visible = remain > 0.06;
        if (ropeCoilMesh.visible) {
          const s = 0.4 + 0.6 * remain;
          ropeCoilMesh.scale.set(s, s, 1);
          // 贴地锚点得跟着缩：贴图绕中心缩，偏移量不缩的话盘子会浮起来
          const off = ropeCoilMesh.userData.offset;
          ropeCoilMesh.position.set(rl.x0 + off.x * s, SURFACE_Y + off.y * s, PlaceZ(BAND.loose));
        }
      } else {
        if (ropeLineMesh) ropeLineMesh.visible = false;
        if (ropeCoilMesh) ropeCoilMesh.visible = false;
      }
    }


    // 飞出去的石子：一维横轴上的一道小弧线
    if (state.thrown) {
      if (!thrownMesh) {
        thrownMesh = BakeSprite(16, 16, 8, 8, (ctx, ax, ay) => {
          ctx.fillStyle = "#8b857a";
          ctx.strokeStyle = "rgba(0,0,0,0.6)";
          ctx.lineWidth = 1.4;
          ctx.beginPath(); ctx.arc(ax, ay, 4.4, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        }, 0, DETAIL_SS);
        layers.fx.add(thrownMesh);
        FixOrder(thrownMesh, LAYER_ORDER.fx + 320);
      }
      // 真弹道：Core 每帧积分出 (x,y)，这里只把石子摆上去——飞哪儿是瞄出来的
      const th = state.thrown;
      thrownMesh.visible = true;
      thrownMesh.position.set(th.x, SURFACE_Y + th.y, 0.6);
    } else if (thrownMesh) thrownMesh.visible = false;

    // 探照灯 / 马灯光带：亮的时候一条光落在地上，节奏一目了然
    if (state.searchlight) {
      const sl = state.searchlight;
      const kkey = `${sl.x0}:${sl.x1}:${sl.src ? sl.src.x : "n"}`;
      if (!lightStrip || lightKey !== kkey) {
        if (lightStrip) layers.fx.remove(lightStrip);
        if (lightBeam) layers.fx.remove(lightBeam);
        lightKey = kkey;
        lightStrip = new THREE.Mesh(
          new THREE.PlaneGeometry(sl.x1 - sl.x0, 1.6),
          new THREE.MeshBasicMaterial({
            color: 0xffe9b0, transparent: true, opacity: 0.22,
            blending: THREE.AdditiveBlending, depthWrite: false,
          }),
        );
        lightStrip.position.set((sl.x0 + sl.x1) / 2, SURFACE_Y + 0.8, 0.3);
        FixOrder(lightStrip, LAYER_ORDER.fx + 210);
        layers.fx.add(lightStrip);
        lightBeam = null;
        if (sl.src) {
          const geo = new THREE.BufferGeometry();
          geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array([
            sl.src.x, sl.src.y, 0.28,
            sl.x0, SURFACE_Y + 0.15, 0.28,
            sl.x1, SURFACE_Y + 0.15, 0.28,
          ]), 3));
          lightBeam = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
            color: 0xffe9b0, transparent: true, opacity: 0.1,
            blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
          }));
          FixOrder(lightBeam, LAYER_ORDER.fx + 205);
          layers.fx.add(lightBeam);
        }
      }
      lightStrip.visible = sl.lit;
      if (lightBeam) lightBeam.visible = sl.lit;
      if (sl.lit) {
        const flick = 0.85 + Math.sin(time * 13) * 0.1;
        lightStrip.material.opacity = 0.22 * flick;
        if (lightBeam) lightBeam.material.opacity = 0.1 * flick;
      }
    } else if (lightStrip) {
      lightStrip.visible = false;
      if (lightBeam) lightBeam.visible = false;
    }

    // 狗叫：头顶蹦出来的"汪！"
    if (state.dogBark) {
      if (!barkMesh) {
        barkMesh = BakeSprite(96, 64, 48, 54, (ctx, ax, ay) => {
          ctx.font = "700 30px 'Noto Serif SC', serif";
          ctx.textAlign = "center";
          ctx.fillStyle = "#e8dcbc";
          ctx.strokeStyle = "rgba(0,0,0,0.75)";
          ctx.lineWidth = 5;
          ctx.strokeText("汪！", ax, ay - 16);
          ctx.fillText("汪！", ax, ay - 16);
        }, 0, DETAIL_SS);
        layers.fx.add(barkMesh);
        FixOrder(barkMesh, LAYER_ORDER.fx + 330);
      }
      barkMesh.visible = Math.sin(time * 14) > -0.4;
      barkMesh.position.set(state.dogBark.x + 0.8, SURFACE_Y + 1.9 + Math.sin(time * 7) * 0.08, 0.6);
    } else if (barkMesh) barkMesh.visible = false;

    // 链上的待拾物：**这条链里还没捡的东西全都摆在那儿**。
    // 原来只画"当前这一步"要捡的那一件，于是院子里那两根木料一次只出现一根：
    // 扛走第一根，第二根才凭空冒出来——连带蹲在第二根上的母鸡也蹲在空气里。
    // 东西本来就该在那儿，是玩家还没走到而已。
    const chainPickups = [];
    if (def?.kind === "chain" && state.beat) {
      const from = state.beat.stepIndex || 0;
      for (let i = from; i < def.steps.length; i += 1) {
        const st = def.steps[i];
        if (st?.type === "pickup") chainPickups.push(st);
      }
    }
    while (chainItemMeshes.length < chainPickups.length) chainItemMeshes.push({ mesh: null, label: null });
    chainItemMeshes.forEach((slot, i) => {
      const st = chainPickups[i];
      if (!st) { if (slot.mesh) slot.mesh.visible = false; return; }
      if (!slot.mesh || slot.label !== st.item.label) {
        if (slot.mesh) layers.play.remove(slot.mesh);
        slot.label = st.item.label;
        slot.mesh = MakeGroundItemMesh(slot.label);
        layers.play.add(slot.mesh);
        // loose+1：待拾物与放下物挤在同一处时（木料堆上的绳头 vs 搁下的桶），
        // 要捡的那件永远在上面
        FixOrder(slot.mesh, DepthOrder("play", BAND.loose) + 1);
      }
      slot.mesh.visible = true;
      PlaceSprite(slot.mesh, st.x, st.level === "under" ? UNDER_Y : SURFACE_Y, PlaceZ(BAND.loose));
    });

    // 目标指示
    const target = state.phase === "playing" ? GetBeatTarget(state) : null;
    // 同人字标：指路的箭头在特写里没有意义——你已经站在它跟前了
    const showMarker = target && target.x !== undefined && def?.kind !== "cinematic"
      && !state.microCine && viewW >= 5.0;
    if (showMarker) {
      if (!markerMesh) {
        markerCanvas = MakeCanvas(48 * HINT_SS, 48 * HINT_SS);
        markerCtx = markerCanvas.getContext("2d");
        const tex = CanvasTexture(markerCanvas);
        markerMesh = new THREE.Mesh(
          new THREE.PlaneGeometry(48 / PPM, 48 / PPM),
          new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }),
        );
        FixOrder(markerMesh, LAYER_ORDER.fx + 300);
        layers.fx.add(markerMesh);
      }
      markerMesh.visible = true;
      markerCtx.setTransform(HINT_SS, 0, 0, HINT_SS, 0, 0);
      markerCtx.clearRect(0, 0, 48, 48);
      // 目标出了画框：同一块路标滑到画框边缘、掉头指向框外（勇敢的心式）。
      // 该不该指、指哪边由 Core.EdgeHint 判（跨层的先指梯口）；这里只管摆位。
      // camera/viewW 是上一帧镜头的（UpdateProps 先于 ApplyCamera 跑），差一帧看不出来。
      const eh = EdgeHint(state, camera.position.x, viewW);
      if (eh) {
        ART.DrawMarker(markerCtx, 24, 30, time, { dir: eh.side, climb: eh.climb });
        const py = (state.player.level === "under" ? UNDER_Y : SURFACE_Y);
        markerMesh.position.set(camera.position.x + eh.side * (viewW / 2 - 0.9), py + 2.35, 0.6);
      } else {
        ART.DrawMarker(markerCtx, 24, 30, time);
        const by = (target.level === "under" ? UNDER_Y : SURFACE_Y);
        markerMesh.position.set(target.x, by + 2.5, 0.6);
      }
      markerMesh.material.map.needsUpdate = true;
    } else if (markerMesh) {
      markerMesh.visible = false;
    }
  }

  // 暗场：地道章节压暗，灯光晕负责照明；昼夜换挡在这儿连续推进
  function UpdateAtmosphere(state, viewW, viewH, camX, camY, dist, dt = 1 / 60) {
    const ch0 = CHAPTERS[state.chapterIndex];
    const want = state.lightOverride || ch0.light;
    if (lightShown === null) { lightShown = want; lightFrom = want; lightTo = want; }
    if (want !== lightTo) {
      // 新目标：从**画面现在的样子**出发（半路又换目标也接得上）
      lightFrom = lightShown === lightTo ? lightShown : lightFrom;
      lightTo = want;
      lightMix = 0;
      lightSwapped = false;
    }
    if (lightMix < 1) {
      lightMix = Math.min(1, lightMix + dt / LIGHT_FADE);
      // 走到一半（罩子最浓的那一刻）才把整村换成新档：接缝藏在这一帧里
      if (!lightSwapped && lightMix >= 0.5) { lightShown = lightTo; lightSwapped = true; }
    }
    const mood = MoodAt(lightFrom, lightTo, lightMix);
    // 换挡途中多压一档（正弦鼓包）：重烘那一帧的调色板跳变被它盖住
    const dip = DipAt(lightMix);
    // 呛烟时压得更暗一点
    const choke = (state.smoke?.active && SmokeCovers(state, state.player.x)) ? 0.18 : 0;
    const base = mood.dark + dip;
    vignetteAlpha += ((base + choke) - vignetteAlpha) * 0.08;
    darkMat.opacity = vignetteAlpha;
    // 罩子是**有颜色的**：夜里泛蓝、黄昏泛橙、地道泛土黑。纯黑罩子压出来的
    // "夜"只是把白天调暗，看着像蒙了层灰
    darkMat.color.setHex(mood.tint);
    // 暗场贴在相机前 3m，按该距离处的视口尺寸铺满
    const planeZ = dist - 3;
    const k = 3 / dist;
    darkPlane.scale.set(viewW * k * 1.2, viewH * k * 1.2, 1);
    darkPlane.position.set(camX, camY, planeZ);
  }

  // 插入特写卡：镜头真正要看的那个细节，另画一张铺满画框
  const insertCards = new Map();
  let insertMesh = null;
  let insertCardName = null, insertCardT = 0;

  // 序章的插卡改成了即梦生成的过场短片（Video/Pro_NN.mp4，一行旁白一段）。
  // 手绘卡没删——片子还没缓冲好就先顶上去，画面永远不会空一拍。
  const insertVideos = new Map();
  let insertVideoList = [];
  let insertVideoName = null;
  let insertVideoLive = false;      // 本段片子出过第一帧没有（出过就不再退回手绘卡）
  let insertIsVideo = false;

  function GetInsertVideo(name) {
    let v = insertVideos.get(name);
    if (v) return v;
    const el = document.createElement("video");
    el.src = new URL(`./Video/${name}.mp4?v=051`, import.meta.url).href;
    // 静音是浏览器允许自动播放的前提；这些片子烘的时候本来也去掉了音轨
    el.muted = true;
    el.defaultMuted = true;
    el.playsInline = true;
    el.preload = "auto";
    const tex = new THREE.VideoTexture(el);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearFilter;   // 视频贴图不能开 mipmap
    tex.generateMipmaps = false;
    v = { el, tex };
    insertVideos.set(name, v);
    return v;
  }

  // 片单只用来做"下一段提前拉"，切镜时才不会黑一下
  function SetInsertVideoList(names) {
    insertVideoList = names || [];
    if (insertVideoList.length) GetInsertVideo(insertVideoList[0]);
  }

  // name=手绘卡名（兜底），video=片名，lineT=这一行已经走了多久
  function SetInsertCard(name, video, lineT) {
    if (!name && !video) {
      if (insertMesh) insertMesh.visible = false;
      if (insertVideoName) { insertVideos.get(insertVideoName)?.el.pause(); insertVideoName = null; }
      insertCardName = null;
      insertVideoLive = false;
      insertIsVideo = false;
      return;
    }
    // 定格画片的慢推（Ken Burns）：换一张卡从头推，同一张卡持续累积
    if (name !== insertCardName) { insertCardName = name; insertCardT = 0; }
    else insertCardT += 1 / 60;

    let tex = null;
    insertIsVideo = false;
    if (video) {
      const v = GetInsertVideo(video);
      if (video !== insertVideoName) {
        if (insertVideoName) insertVideos.get(insertVideoName)?.el.pause();
        insertVideoName = video;
        insertVideoLive = false;
        try { v.el.currentTime = 0; } catch { /* 还没 metadata，等就绪后由对时补上 */ }
        v.el.play().catch(() => { /* 自动播放被拦就一直用手绘卡 */ });
        const i = insertVideoList.indexOf(video);
        if (i >= 0 && i + 1 < insertVideoList.length) GetInsertVideo(insertVideoList[i + 1]);
      }
      const el = v.el;
      // 出过第一帧就认了，之后不再回退到手绘卡：seek 会把 readyState 打回 1，
      // 那时候切回卡片就是card/视频来回闪——贴图里存着的仍是最后一帧，稳得很。
      if (!insertVideoLive && el.readyState >= 2) insertVideoLive = true;
      if (insertVideoLive) {
        // 对时只管真跑偏（暂停、切后台、?fast=1 快进）。起播本来就比旁白慢小半秒，
        // 死区给窄了就会每帧 seek 一次，每次 seek 都是一下卡顿。
        const want = Math.min(lineT || 0, Math.max(0, (el.duration || 0) - 0.05));
        if (!el.seeking && Number.isFinite(want) && Math.abs(el.currentTime - want) > 1.0) el.currentTime = want;
        if (el.paused && !el.seeking) el.play().catch(() => {});
        // three 的 VideoTexture 靠 video.requestVideoFrameCallback 置 needsUpdate，
        // 而它和 rAF 一样，页面不可见时根本不触发 —— 贴图于是一次都没上传过。
        // 本项目的画面验证（DebugShot / ShotTest / cine-audit）全是在这个状态下
        // 手动驱动渲染的，不补这一下，序章截出来永远是兜底手绘卡，还看不出错在哪。
        // 只在 hidden 时补：正常游玩仍走 rVFC，不做多余的每帧上传。
        if (document.hidden) v.tex.needsUpdate = true;
        tex = v.tex;
        insertIsVideo = true;
      }
    } else if (insertVideoName) {
      insertVideos.get(insertVideoName)?.el.pause();
      insertVideoName = null;
    }

    if (!tex) {
      if (!name) { if (insertMesh) insertMesh.visible = false; return; }
      if (!insertCards.has(name)) {
        const W = 1280, H = 720;
        const canvas = MakeCanvas(W, H);
        ART.DrawInsertCard(canvas.getContext("2d"), W, H, name);
        insertCards.set(name, CanvasTexture(canvas));
      }
      tex = insertCards.get(name);
    }
    if (!insertMesh) {
      insertMesh = new THREE.Mesh(
        new THREE.PlaneGeometry(1, 1),
        new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, depthTest: false, toneMapped: false }),
      );
      insertMesh.renderOrder = ORDER_INSERT;
      scene.add(insertMesh);
    }
    insertMesh.material.map = tex;
    insertMesh.material.needsUpdate = true;
    insertMesh.visible = true;
  }

  function PlaceInsertCard(camX, camY, viewW, viewH, dist) {
    if (!insertMesh?.visible) return;
    const z = dist - 2;
    const k = 2 / dist;
    // 按画框比例铺满：宽高取大者，保证不露边
    const cw = viewW * k, chh = viewH * k;
    const aspect = 1280 / 720;
    // 慢推：十秒推 6%——定格画片不是幻灯片，镜头永远在呼吸。
    // 但片子自己已经在推/横移了，再叠一层就是两个镜头打架，只留一点点安全溢出。
    // 活卡（划线）不推：玩家的手正按在上面，画面一动手就跟着偏。
    const kb = (insertIsVideo || liveCardOn) ? 1.015 : 1.015 + Math.min(0.06, insertCardT * 0.006);
    const w = Math.max(cw, chh * aspect) * kb;
    insertMesh.scale.set(w, w / aspect, 1);
    insertMesh.position.set(camX, camY, z);
    // 屏幕 ↔ 卡面的换算：卡与画框同在 z 平面上、同一个中心，于是屏幕上
    // 的一段比例就是卡上的一段比例，只差画框与卡的尺寸比。ScreenToCard 靠它。
    cardFrac.w = cw / w;
    cardFrac.h = chh / (w / aspect);
  }

  // -------------------------------------------------------------------------
  // 活卡：和插入特写卡同一个景别、同一块铺满画框的画布，区别是它每帧重画，
  // 而且玩家的手就按在上面（划线那一拍——攥着画面里那支石笔拖）。
  // 复用 insertMesh 的摆位，所以"铺满画框"这件事只有一份实现。
  // -------------------------------------------------------------------------
  let liveCanvas = null, liveCtx = null, liveTex = null, liveCardOn = false, liveT = 0;
  const cardFrac = { w: 1, h: 1 };

  // spec = { kind: "scribe" | "plane", view, layout }。做功的那几拍都长在这张
  // 铺满画框的活卡上，画笔按 kind 分派。
  const LIVE_CARD_ART = { scribe: ART.DrawScribeCard, plane: ART.DrawPlaneCard, knot: ART.DrawKnotCard };

  function SetLiveCard(spec, dt) {
    const view = spec?.view;
    const layout = spec?.layout;
    const draw = LIVE_CARD_ART[spec?.kind];
    if (!view || !layout || !draw) {
      // 只收自己那一张：同一帧里若已经换上了定格卡/过场片，别把人家关掉
      if (liveCardOn) {
        liveCardOn = false;
        liveT = 0;
        if (insertMesh && insertMesh.material.map === liveTex) insertMesh.visible = false;
      }
      return;
    }
    if (!liveCanvas) {
      // 玩家会盯着笔尖/刨口看，这张卡烘得比定格卡密一档
      liveCanvas = MakeCanvas(1600, 900);
      liveCtx = liveCanvas.getContext("2d");
      liveTex = CanvasTexture(liveCanvas);
      liveTex.generateMipmaps = false;
      liveTex.minFilter = THREE.LinearFilter;
    }
    liveT += Math.min(0.05, dt || 1 / 60);
    liveCardOn = true;
    insertIsVideo = false;
    insertCardName = null;
    liveCtx.setTransform(1, 0, 0, 1, 0, 0);
    liveCtx.clearRect(0, 0, liveCanvas.width, liveCanvas.height);
    draw(liveCtx, liveCanvas.width, liveCanvas.height, view, layout, liveT);
    liveTex.needsUpdate = true;
    if (!insertMesh) {
      insertMesh = new THREE.Mesh(
        new THREE.PlaneGeometry(1, 1),
        new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, depthTest: false }),
      );
      insertMesh.renderOrder = ORDER_INSERT;
      scene.add(insertMesh);
    }
    insertMesh.material.map = liveTex;
    insertMesh.material.needsUpdate = true;
    insertMesh.visible = true;
  }

  // 屏幕坐标 → 卡面归一化坐标（u 沿卡宽、v 沿卡高，0..1；画框裁掉的部分会出界）。
  // 攥住画面里那支笔靠它——世界坐标在这一拍没有意义，玩家按的是卡。
  function ScreenToCard(clientX, clientY) {
    const rect = renderer.domElement.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    const sx = (clientX - rect.left) / rect.width - 0.5;
    const sy = (clientY - rect.top) / rect.height - 0.5;
    return { u: 0.5 + sx * cardFrac.w, v: 0.5 + sy * cardFrac.h };
  }

  // 过肩前景：把某个角色的剪影放在画面边缘（正反打用）
  function SetOverShoulder(state, spec) {
    if (!spec) {
      if (otsMesh) otsMesh.visible = false;
      otsHiddenId = null;
      return;
    }
    // 被越过的那个人由前景剪影代表，本体要藏起来，否则画面里会出现两个他
    otsHiddenId = spec.id;
    const a = spec.id === "player" ? { kind: "player" } : state.actors.find((x) => x.id === spec.id);
    if (!a) { if (otsMesh) otsMesh.visible = false; return; }
    const kind = spec.id === "player" ? "player" : a.kind;
    if (!otsMesh || otsMesh.userData.kind !== kind) {
      if (otsMesh) layers.ots.remove(otsMesh);
      // 专画一张高分辨率头肩剪影：全身图集放大后会糊成一根柱子
      otsMesh = BakeSprite(560, 460, 280, 400, (ctx, ax, ay) => {
        ART.DrawShoulder(ctx, ax, ay - 210, 1.35, kind, "ots" + kind);
      });
      otsMesh.userData.kind = kind;
      otsMesh.material.opacity = 0.97;
      layers.ots.add(otsMesh);
    }
    otsMesh.visible = true;
    otsMesh.scale.set((spec.facing || 1) * 1.9, 1.9, 1);
    otsMesh.userData.place = spec;
  }

  function PlaceOverShoulder(camX, camY, viewW, viewH) {
    if (!otsMesh?.visible) return;
    const spec = otsMesh.userData.place;
    const side = spec.side || -1;
    const comp = LAYER_COMP.ots;        // 层被整体缩放过，位置要换算回局部坐标
    const dist = camera.userData.dist || 24;
    const otsZ = layers.ots.position.z;
    // 该层比玩法层离相机近，投影会放大 M 倍；构图偏移与体量都要按 M 折算
    const M = dist / Math.max(0.5, dist - otsZ);
    // 剪影在屏幕上应占约 72% 画宽（实拍标定：层缩放 comp 又吃掉一档，
    // 按 0.55 反解出来上屏只有三成半，小得读不出是个人）
    const spriteW = otsMesh.geometry.parameters.width;
    const S = (viewW * 0.72) / (M * spriteW);
    otsMesh.scale.set((spec.facing || 1) * S, S, 1);
    // 头肩落在画框一侧、**肩膀压出画框下缘**，说话的人留在另一侧。
    // 0.62 那一版把锚点摆在画框下缘之上半米——剪影整个浮在半空，脚下还露着
    // 路面，于是它既不是前景也不是布景，读出来就是"右边一坨奇怪的椭球"
    //（用户 2026-08-09 原话）。过肩前景的定义就是**被画框切掉**：切掉了，
    // 大脑才把它读成"贴着镜头的那个人"。0.95 让肩线落到下缘略外侧。
    const worldX = camX + side * (viewW / 2) * 0.58 / M;
    const worldY = camY - (viewH / 2) * 0.95 / M + otsMesh.userData.offset.y * S;
    otsMesh.position.set(worldX / comp, worldY / comp, 0);
  }

  // -------------------------------------------------------------------------
  let viewW = 20, viewH = 11.25;

  function ApplyCamera(camX, camY, halfWidth) {
    const aspect = camera.userData.aspect || 16 / 9;
    // 由目标景别反推机位距离：视差与地面退缩随之自然发生
    const dist = halfWidth / (Math.tan((FOV * Math.PI / 180) / 2) * aspect);
    viewW = halfWidth * 2;
    viewH = viewW / aspect;
    camera.aspect = aspect;
    camera.position.set(camX, camY, dist);
    camera.lookAt(camX, camY, 0);   // 永远正视，不旋转
    camera.updateProjectionMatrix();
    camera.userData.dist = dist;

    // 特写时机位很近（hw=2.2 → dist≈4.6m），固定 z 的前景层与过肩层会跑到
    // 相机背后直接消失。把这两层的深度改成随机位距离浮动，始终在相机与
    // 玩法层之间，正反打的过肩剪影才不会丢。
    const otsZ = Math.min(12, dist * 0.5);
    LAYER_COMP.ots = (D_REF - otsZ) / D_REF;
    layers.ots.position.z = otsZ;
    layers.ots.scale.setScalar(LAYER_COMP.ots);
    // 前景只服务于中远景；特写/插入/过肩本来就不该有枝叶糊在镜头前
    layers.fore.visible = dist > 7;
    // 浮尘在画框内循环飘
    for (const d of dustMotes) {
      const u = d.userData;
      u.seed += 0.0016;
      const wrapW = viewW * 1.1, wrapH = viewH * 1.1;
      const bx = ((u.seed * 37 + d.id) % 1);
      d.position.set(
        camX - wrapW / 2 + ((bx * wrapW + u.vx * u.seed * 260) % wrapW),
        camY - wrapH / 2 + (((u.seed * 53) % 1) * wrapH + u.vy * u.seed * 180) % wrapH,
        0.45,
      );
    }
    PlaceOverShoulder(camX, camY, viewW, viewH);
    PlaceInsertCard(camX, camY, viewW, viewH, dist);
    return { viewW, viewH, dist };
  }

  let rendererCssW = 0, rendererCssH = 0;
  function Resize(width, height) {
    renderer.setSize(width, height, false);
    camera.userData.aspect = width / height;
    rendererCssW = width;
    rendererCssH = height;
  }

  function Render() { renderer.render(scene, camera); }

  // -------------------------------------------------------------------------
  // 后果小窗（勇敢的心式画中画）：主画面渲染完后，用第二台相机把同一个世界
  // 的另一处再画进角落的一块剪裁区。视差层都锚在世界坐标上，第二台相机
  // 看过去透视自然成立，不用为它做任何搬动。
  // -------------------------------------------------------------------------
  const pipCamera = new THREE.PerspectiveCamera(FOV, 1, 0.5, 400);
  let pipShot = null;
  function SetPip(spec) { pipShot = spec; }

  // rect：小窗在画布上的位置（CSS 像素，左上原点）——与 DOM 相框的内窗对齐
  function RenderPip(rect) {
    if (!pipShot || !rect || rect.w < 8 || rect.h < 8 || !rendererCssW) return;
    const aspect = rect.w / rect.h;
    const dist = pipShot.hw / (Math.tan((FOV * Math.PI / 180) / 2) * aspect);
    pipCamera.aspect = aspect;
    pipCamera.position.set(pipShot.x, pipShot.y, dist);
    pipCamera.lookAt(pipShot.x, pipShot.y, 0);
    pipCamera.updateProjectionMatrix();
    const yUp = rendererCssH - rect.y - rect.h;   // WebGL 视口原点在左下
    renderer.setScissorTest(true);
    renderer.setScissor(rect.x, yUp, rect.w, rect.h);
    renderer.setViewport(rect.x, yUp, rect.w, rect.h);
    renderer.render(scene, pipCamera);
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, rendererCssW, rendererCssH);
  }

  // 屏幕坐标 → 玩法层（z=0 平面）的世界坐标。沉浸式手势（打结绕圈、
  // 拖绳）要知道手真的搭在画面里的哪个位置，不只是位移量
  function ScreenToWorld(clientX, clientY) {
    const rect = renderer.domElement.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    const nx = ((clientX - rect.left) / rect.width) * 2 - 1;
    const ny = -((clientY - rect.top) / rect.height) * 2 + 1;
    const v = new THREE.Vector3(nx, ny, 0.5).unproject(camera);
    const dir = v.sub(camera.position).normalize();
    if (Math.abs(dir.z) < 1e-6) return null;
    const t = (0 - camera.position.z) / dir.z;
    return { x: camera.position.x + dir.x * t, y: camera.position.y + dir.y * t };
  }

  return {
    THREE, renderer, scene, camera,
    BuildEnvironment, UpdateActors, UpdateProps, UpdateAtmosphere,
    SetOverShoulder, SetInsertCard, SetInsertVideoList, SetLiveCard, ApplyCamera, Resize, Render,
    SetPip, RenderPip, ScreenToWorld, ScreenToCard,
    // 卡面↔画框的尺寸比（测试要把卡上的坐标换回屏幕像素去点）
    __cardFrac: () => ({ ...cardFrac }),
    // 过场短片在放没放，截图上看不出来（兜底手绘卡长得也像回事）——只能问它
    __insertVideo() {
      if (!insertVideoName) return null;
      const el = insertVideos.get(insertVideoName)?.el;
      return {
        name: insertVideoName, live: insertIsVideo, readyState: el?.readyState ?? -1,
        paused: el?.paused ?? true, t: +(el?.currentTime ?? 0).toFixed(2), d: el?.duration || 0,
      };
    },
    // 背景乡亲动没动，截图上不好逐帧比——问它
    __folk: () => backdropFolk.map((f) => ({
      x: +f.x.toFixed(2), act: f.track || (f.shoulder ? "haul" : "walk"),
      t: +f.trackT.toFixed(2), phase: +f.phase.toFixed(2), layer: f.layerKey,
    })),
    get __fluid() { return fluid; },
    // 供 Script_DepthAudit.mjs 做落地体检；DepthViolations = 深度规范校验的告警单
    debugLayers: () => ({ layers, SURFACE_Y, UNDER_Y, THREE, camera }),
    DepthViolations,
    // 主角四肢末端离地多高（米，正=悬空/负=陷进地里）。姿势"像不像"靠眼睛，
    // "手脚有没有落在地上"是可以量的——爬行那一拍就是这么修出来的
    PlayerLimbTips: () => {
      const ps = actorSprites.get("player");
      if (!ps?.rig || ps.ground === undefined) return null;
      const ground = ps.ground;
      const tips = LimbTips(ps.rig);
      const out = {};
      for (const k of Object.keys(tips)) out[k] = +(tips[k].y - ground).toFixed(3);
      return out;
    },
    get viewSize() { return { w: viewW, h: viewH }; },
  };
}
