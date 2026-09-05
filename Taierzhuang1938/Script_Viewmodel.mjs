// 《血战台儿庄》第一人称视图模型：双手 + 枪，以及它们的全部"手感"。
//
// 玩家 80% 的时间在看这只手和这支枪，所以这个文件里几乎每个数字都是手感数字，
// 不是造型数字。造型照 Data_Weapons + docs/Data_HistoryMaterial.md 的考据尺寸做。
//
// --- 调用方必须知道的三件事（错一条就是黑屏或穿墙）-------------------------
// 1) `viewmodel.root` 要挂到**相机**下：`camera.add(vm.root)`。
//    three 的铁律：相机本身不在 scene 图里的话，挂在相机下的子物体不会被渲染。
//    所以调用方还得 `scene.add(camera)` —— 这是最常见的"我明明加了枪却看不见"。
// 2) 相机近裁面建议 ≤ 0.05。本模型压缩后最近的部件（袖口/手腕）在 0.08—0.12 m。
//    枪托本来就在眼睛后面（z > 0），被近裁切掉是**正常且必要**的，别去"修"它。
// 3) 整棵树（含蒙皮双臂）都要经 `Script_Post.MarkForegroundPrepass` 接进深度法线
//    预通道：写**真法线** + 一个常数近景深度标签。别再用 MarkNoPrepass —— 那不是
//    "不进预通道"，只是"不换材质"，物体照样被画进去、写的是自己的光照颜色。
//    覆盖材质带 skinning chunk，蒙皮不会塌到原点（Script_ActorDepthTest 守着同一条）。
//
// --- 视图模型 FOV：为什么是非等比缩放 ---------------------------------------
// 广角下枪会畸变成香蕉，所以视图模型要用更窄的 FOV。但这里没有第二个 pass 可用
// （PostPipeline 的帧结构是固定的，插一层 clearDepth 重画会把 SSAO/泛光的输入搞脏），
// 只能在同一台相机下"伪造"窄 FOV。
//   关键推导：**绕相机原点的等比缩放不改变画面一个像素**（透视投影对 t·p 与 p 同解）。
//   所以想改变观感 FOV，只能改**深度方向相对于横向的比例**。
//   设 k = tan(fovVm/2) / tan(fovWorld/2)，把 z 拉伸 1/k（物体推远、深度也拉长同倍），
//   横向尺寸不动 —— 屏幕占比不变、而前后面的发散比变成窄镜头的比值。这就是窄 FOV 的观感。
// 又因为等比缩放免费（画面不变），我们再整体乘一个 s < 1 把整支枪"缩到眼前"，
// 让最深的枪口落在 depthBudget 之内 —— **画面一模一样，但枪不再插进墙里**。
//
// --- 确定性 -----------------------------------------------------------------
// 后坐偏航、抛壳轨迹、枪焰旋转全部由"第几发"派生（Mulberry32(HashString(...))），
// 不用 Math.random。视觉审查靠逐轮截图比对，画面自己在抖就没法判断版本好坏。

import * as THREE from "three";
import { SampleMeleeFirstPerson } from "./Script_MeleeAnimation.mjs";
import { CloneGrenadeAsset } from "./Script_GrenadeAsset.mjs";
import { WEAPONS, GUN_MELEE } from "./Data_Weapons.mjs";
import { Mulberry32, HashString, Clamp, Clamp01, Mix } from "./Script_Noise.mjs";
import { MakeBox, MergeGeometries } from "./Script_Geo.mjs";
import { MarkForegroundPrepass } from "./Script_Post.mjs";
import { InstantiateModel } from "./Script_MeshLoad.mjs";
import { WEAPON_MESH_BY_ID, WeaponMeshId, BAYONET_MESH_BY_WEAPON } from "./Data_Meshes.mjs";
import { FpsArmRig } from "./Script_RiggedModel.mjs";
import { FpsArmPose } from "./Data_FpsArmPoses.mjs";
import { FirstPersonBody } from "./Script_FirstPersonBody.mjs";
import { FrameQuaternion } from "./Script_FpsAnatomy.mjs";

const DEG = Math.PI / 180;

// 贴图密度。Script_Geo 的 TILE_METERS 是给建筑调的（砖墙一格 1.2 m），
// 一支枪只有房子的十分之一大，直接套过来一整支枪只吃到贴图的三十分之一，
// 木纹会糊成一片色块。这里另立一套"枪械尺度"的格距。
//
// 事故（第 1 轮视觉审查抓到的）：这三个数原本是 0.30 / 0.34 / 0.16，
// 机匣长 0.245 m ÷ 0.30 = UV 跨度 0.817，而 BakeSteel 的凹坑场是 12 格/UV，
// 沿枪长正好摊成 10 个凹坑；在 1600×900 上每个凹坑 50 px 宽 —— 机匣读成
// "带半球凸点的防滑铁板"，不是金属。要的是"一格贴图 = 几毫米的机加工痕"，
// 所以格距得按**毫米级**给，不是按厘米级。0.055 m 让机匣吃到 4.5 个 UV 跨度、
// 约 54 个凹坑，缩到 5 px 一个，才读成细密的加工纹。
// 注意别去动 BuildMaterials 里的 repeat：UV 已经由 MakeBox/ScaleUvInPlace
// 按世界尺寸算过一遍了，repeat 是在那之上再乘一次，不是这里的旋钮。
// steel 再从 0.055 收到 0.030：0.055 已经让机匣读成"喷砂混凝土"级的均匀细麻点，
// 密度对了但颗粒还是太大。0.030 让机匣吃到约 8 个 UV 跨度、每个凹坑缩到 3 px 以内，
// 才读成机加工的细纹而不是砂面。
const VM_TILE = { steel: 0.030, wood: 0.085, cloth: 0.045 };

// 眼睛到照门的距离。真实据枪约 8—12 cm，但那样照门会顶到近裁面，
// 而且遮掉大半个屏幕；15.5 cm 是"看得清缺口又不挡视野"的折中。
// 眼睛到照门的距离。
//
// **原来是 0.155 —— 那是真人据枪的实际距离，但游戏不是用肉眼在看。**
// 开镜时世界 FOV 收到 40.7°，而人眼水平视野约 120°：同一个物体在屏幕上被放大
// 了将近三倍。于是"物理正确"的 15.5 cm 渲出来是：φ27 mm 的枪管套筒张 14°，
// 占掉 40.7° 画面的三分之一 —— 用户截图里正中那块盖住整个下半屏的黑板就是它。
// 照门座（30 mm 宽）张 11°，比目标还大。
//
// 0.30 m 是把这个放大倍数抵消掉的距离：套筒退到 5.9°、照门座 5.5°，
// 剩下的画面才是"沿着枪管看出去"。**枪并没有变小**，只是不再怼在眼球上 ——
// 前后照门仍然共轴、仍然落在画面正中（那是解出来的，不受这个距离影响）。
// 这是所有 FPS 都在用的那一手；ER2 的铁瞄画面同样不是按 15 cm 摆的。
const SIGHT_EYE_DISTANCE = 0.300;

// 编辑器用的 900p 基准像素 → 照门局部米数。正常玩法的覆盖值恒为 null，
// 因而仍严格落在屏幕中心；只有枪械校准器会临时写入，退出/换枪立即清掉。
const SIGHT_CALIBRATION_PER_PX = 2.30e-4;

// ---------------------------------------------------------------------------
// 小工具
// ---------------------------------------------------------------------------

/**
 * 二阶弹簧。后坐回位、开镜过冲、落地下沉全用它。
 * 为什么不用 lerp：lerp 是指数衰减，永远不会过冲，也就永远没有"重量"。
 * damping < 2√k 时欠阻尼 —— 那一下回弹过头才是手感的来源。
 */
class Spring {
  constructor(stiffness, dampingRatio, value = 0) {
    this.stiffness = stiffness;
    this.damping = 2 * dampingRatio * Math.sqrt(stiffness);
    this.value = value;
    this.velocity = 0;
  }

  /** 峰值 A 需要多大冲量：欠阻尼弹簧近似 A ≈ v/ω。 */
  Impulse(amplitude) {
    this.velocity += amplitude * Math.sqrt(this.stiffness);
    return this;
  }

  Step(dt, target) {
    // 定步长子步进：帧率掉到 20fps 时单步显式欧拉会直接发散（枪飞出屏幕）
    const steps = Math.min(6, Math.max(1, Math.ceil(dt / 0.008)));
    const h = dt / steps;
    for (let i = 0; i < steps; i += 1) {
      const a = -this.stiffness * (this.value - target) - this.damping * this.velocity;
      this.velocity += a * h;
      this.value += this.velocity * h;
    }
    return this.value;
  }

  Set(value) { this.value = value; this.velocity = 0; return this; }
}

/** 从"回位时间"反推弹簧参数：recoverS 越短越硬。 */
function SpringFromRecover(recoverS, dampingRatio = 0.62) {
  const omega = 5.4 / Math.max(0.05, recoverS);
  return new Spring(omega * omega, dampingRatio);
}

const Ease = {
  InOut: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  Out: (t) => 1 - Math.pow(1 - t, 3),
  In: (t) => t * t * t,
  /** 一段区间内的 0→1，区间外夹住。做关键帧用。 */
  Seg: (t, a, b) => Clamp01((t - a) / (b - a || 1e-6)),
  /** 冲—回：0→1→0，用于突刺、拍弹匣这种"去了又回"的动作。 */
  Pulse: (t) => Math.sin(Clamp01(t) * Math.PI),
};

/** 就地缩放 UV（合并前用；合并后属性是拼起来的，改不动单块）。 */
function ScaleUvInPlace(geometry, su, sv) {
  const uv = geometry.attributes.uv;
  for (let i = 0; i < uv.count; i += 1) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
  uv.needsUpdate = true;
  return geometry;
}

/** 就地摆放一块几何（不 clone —— 这些几何都是现建的，clone 一遍等于白扔一份）。 */
function Place(geometry, pose = {}) {
  const { x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1 } = pose;
  const matrix = new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, "YXZ")),
    new THREE.Vector3(sx, sy, sz));
  geometry.applyMatrix4(matrix);
  return geometry;
}

/** 方料。seed 让同规格的复制件错开 UV，避免一眼看穿是同一块。 */
function Box(w, h, d, tile, seed, pose) {
  return Place(MakeBox(w, h, d, tile, seed), pose);
}

/** 低面数椭球。手掌/关节不能再用方料；但细分数也只给到一眼读不出棱的程度。 */
function Ellipsoid(rx, ry, rz, tile, pose = {}) {
  const geometry = new THREE.SphereGeometry(1, 10, 7);
  ScaleUvInPlace(geometry, (2 * Math.PI * Math.max(rx, rz)) / tile, (Math.PI * ry) / tile);
  return Place(geometry, { ...pose, sx: rx, sy: ry, sz: rz });
}

/** 圆管/圆柱，轴沿 Z（枪管、弹体、握把都是这个朝向）。 */
function Tube(rTop, rBottom, len, segments, tile, pose) {
  const geometry = new THREE.CylinderGeometry(rTop, rBottom, len, segments, 1, false);
  const r = Math.max(rTop, rBottom);
  ScaleUvInPlace(geometry, (2 * Math.PI * r) / tile, len / tile);
  geometry.rotateX(Math.PI / 2);
  return Place(geometry, pose);
}

/** group.add 的安全版：MakePart 对空桶返回 null，直接 add(null) 会抛。 */
function AddPart(group, mesh) {
  if (mesh) group.add(mesh);
  return mesh;
}

/** 把一组几何合成一个可独立运动的部件，pivot 是它自己的旋转轴心。空桶返回 null。 */
function MakePart(geometries, material, pivot = { x: 0, y: 0, z: 0 }) {
  if (!geometries || geometries.length === 0) return null;   // 见下方 AddPart
  const merged = MergeGeometries(geometries);
  merged.translate(-pivot.x, -pivot.y, -pivot.z);
  const mesh = new THREE.Mesh(merged, material);
  mesh.position.set(pivot.x, pivot.y, pivot.z);
  // 视图模型不投影：一支贴在镜头上的枪投出来的影子会是一面墙那么大的黑块
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  // 包围球算在相机空间里、又被非等比缩放过，交给 three 剔除容易误剔（枪突然消失一帧）
  mesh.frustumCulled = false;
  return mesh;
}

// ---------------------------------------------------------------------------
// 材质
// ---------------------------------------------------------------------------

/**
 * 取材质，取不到就退化成纯色。
 * 为什么要兜底：MaterialLibrary.Get 在配方没烘完时直接 throw，
 * 而视图模型经常在加载条还没跑完时就被 Equip 一次（换弹演示、菜单预览）。
 * 手上没枪比抛异常黑屏好。
 */
/**
 * 烘焙好的贴图上再套一层染色，**必须先除以配方的基色**。
 *
 * 事故（这一轮抓到的，比"荧光橙的手"更糟）：手的材质从 Plain 换成
 * `library.Get("ClothNra", { color: 0x9c6f4a })`，以为这样能借布料的高度场当皮肤。
 * 可 material.color 是**乘在贴图上的**，而 ClothNra 烘出来是灰蓝的 (104,110,116)。
 * 灰蓝 × 土黄 = 一块又暗又脏的灰褐色 —— 出图上手成了两块砖，比橙色更假。
 * 要得到目标色就得除回去：multiplier = target / base（在线性空间里除，
 * THREE.Color 的分量本来就是浮点、不钳到 1，所以大于 1 的分量是合法的）。
 *
 * @param {number[]} base   配方烘焙时的基色（0—255 的 sRGB，抄自 Script_TexBake 的 hue）
 * @param {number}   target 想要的最终颜色
 */
function TintTo(base, target) {
  const b = new THREE.Color().setRGB(base[0] / 255, base[1] / 255, base[2] / 255, THREE.SRGBColorSpace);
  const t = new THREE.Color(target);
  return new THREE.Color(
    Clamp(t.r / Math.max(b.r, 0.004), 0.04, 4),
    Clamp(t.g / Math.max(b.g, 0.004), 0.04, 4),
    Clamp(t.b / Math.max(b.b, 0.004), 0.04, 4));
}

/** ClothNra 烘焙时的基色（Script_TexBake.BakeCloth 的 hue 默认值）。 */
const CLOTH_NRA_BASE = [104, 110, 116];

/** Steel 烘焙时的基色（Script_TexBake.BakeSteel 的 base 默认值）。 */
const STEEL_BASE = [58, 60, 64];

function SafeMaterial(library, name, options, fallback) {
  try {
    return library.Get(name, options);
  } catch (error) {
    return library.Plain(`vmFallback${name}`, fallback);
  }
}

function BuildMaterials(library) {
  return {
    // normalScale 跟着 VM_TILE 一起收：格距缩到 1/5.5 之后，同一张法线图在屏幕上
    // 的坡度会陡 5.5 倍，0.8 会把机加工纹重新打成浮雕。metalness 也从 1.0 退到 0.84 ——
    // 纯金属没有漫反射项，暗部会塌成纯黑底 + 一排高光点（P1 的 lo 像素 3.4% 就是它）；
    // 留一点非金属分量，暗部才看得出材质。roughness 提到 0.46 是 1938 年发蓝钢的手感，
    // 0.62 太哑，反不出拉丝。
    // 【两个会话独立修同一个 bug，这里是合稿】
    //
    // 病根是 **F0 写错**：金属没有漫反射项，albedo 直接就是 F0。BakeSteel 的 base
    // 是 [58,60,64]，线性化后 albedo 均值只有 0.044；乘上 ORM 的 metal 均值 0.956、
    // 生效 metalness 0.80 之后，F0 ≈ 0.043、漫反射 ≈ 0.009 —— 总反射率 4—5%。
    // 实测机匣/枪管区线性亮度 0.190（第五关），周围街景 0.409。
    // base 的来历是「照片里发蓝钢看起来的样子」，但发蓝钢在照片里暗，是因为它是
    // 一面粗糙的镜子照着一间暗屋子 —— 不是因为它只反 4% 的光。
    //
    // **不去改 BakeSteel 的共用 base**：那张贴图是共用的，SteelHelmet 走
    // Script_Actor.mjs 的 metalness 0.04 —— 在那里同一份 albedo 是当**漫反射**用的，
    // 抬高共用 base 会把钢盔和全世界的钢件一起提亮，是七关范围的观感改动，
    // 不该混进一个 bug 修复。所以只给视图模型加一层 tint，把生效 albedo 抬到
    // 线性 ≈0.17（sRGB 0x72767c），F0 落到 0.14 左右。
    // （我一度绕过这条论证直接改了 BakeSteel 的 base，实拍是机匣**过曝成白板**，
    //   比原来的黑板还糟。已撤回。）
    //
    // roughness 取 **0.88**（另一个会话量出来的，比我原来那版的 0.58 更对）：
    // BakeSteel 的粗糙度图本身偏光滑（按 polish 0.35 烘的，均值约 0.45），
    // 标量是**乘**在图上的 —— 0.58 乘完只剩 0.26，仍然是镜面；据枪时机匣顶面正对天空，
    // 整块反成一张没有细节的浅灰板，读作桌面不是钢件。0.88 乘完落到约 0.40，
    // 才是 1938 年发蓝钢该有的半哑光。
    steel: SafeMaterial(library, "Steel",
      {
        repeat: 1, roughness: 0.78, metalness: 0.62, normalScale: 0.28,
        color: TintTo(STEEL_BASE, 0x858a92), tintId: "vmSteelPbr",
        envMapIntensity: 1.45,
      },
      { color: 0x858a92, roughness: 0.78, metalness: 0.62 }),
    // 宽刀面不能沿用带锈斑与凹坑的枪钢贴图。纯净 basecolor 保留真实 PBR 反光，
    // 由几何棱线与环境光写出钢感，不再靠脏纹理冒充细节。
    blade: library.Plain("VmDadaoBlade", { color: 0x929aa2, roughness: 0.30, metalness: 0.96 }),
    grip: library.Plain("VmDadaoGrip", { color: 0x8f7c61, roughness: 0.76, metalness: 0 }),
    dadao: SafeMaterial(library, "DadaoPbr",
      { repeat: 1, roughness: 1, metalness: 1, normalScale: 1, envMapIntensity: 1 },
      { color: 0x77736f, roughness: 0.58, metalness: 0.72 }),
    // 枪托是打磨过的胡桃木/榆木，比门板亮一档；normalScale 压到 0.24，
    // 同理：木纹格距从 0.34 收到 0.085 之后，0.6 的法线强度会把木纹凿成沟
    wood: SafeMaterial(library, "WoodStock", { repeat: 1, roughness: 0.72, metalness: 0, normalScale: 0.32 },
      { color: 0x6d4a2c, roughness: 0.7, metalness: 0 }),
    cloth: SafeMaterial(library, "ClothNra", { repeat: 1, roughness: 0.95, metalness: 0 },
      { color: 0x6e7684, roughness: 0.95, metalness: 0 }),
    // 土黄肤色。北方农家子弟常年日晒，不是白手，也不该是橙色的塑料手。
    //
    // 从 Plain（纯色无贴图）换成借布料的高度场：手是全屏**最近**的物体，纯色面
    // 意味着离镜头三十厘米的东西反而是整幅画里最糊的一个，一眼就把观感拉到塑料。
    // 布的法线在这个尺度上读出来正好是指缝与掌骨的层次（不是布纹 —— VM_TILE.cloth
    // 的格距只有 4.5 cm，一只手吃不到两格，看到的是低频起伏而不是织纹）。
    // 颜色同时退饱和：实测原来渲出来约 (240,175,125)、色相 24° 饱和 48%，
    // 在夜战的深蓝底上直接爆成贴纸；0x9c6f4a 落到约 (200,150,110) / 饱和 32%。
    // tintId 只是为了让 Get 的缓存键分得开：Get 用 JSON.stringify(options) 做键，
    // 而 THREE.Color.toJSON() 返回 getHex()，会把大于 1 的染色分量钳到 0xff，
    // 两个不同的亮色染色会撞成同一份材质。
    skin: SafeMaterial(library, "ClothNra",
      {
        repeat: 1, roughness: 0.72, metalness: 0, normalScale: 0.35,
        color: TintTo(CLOTH_NRA_BASE, 0x9c6f4a), tintId: "vmSkin",
      },
      { color: 0x9c6f4a, roughness: 0.74, metalness: 0 }),
    skinDark: SafeMaterial(library, "ClothNra",
      {
        repeat: 1, roughness: 0.76, metalness: 0, normalScale: 0.35,
        color: TintTo(CLOTH_NRA_BASE, 0x7d5a3c), tintId: "vmSkinDark",
      },
      { color: 0x7d5a3c, roughness: 0.78, metalness: 0 }),
    brass: library.Plain("VmBrass", { color: 0xb08a3c, roughness: 0.34, metalness: 0.95 }),
    // 【2026-08-20 修「枪是一块黑板」】上面那段注释里写明的教训（纯金属没有漫反射项）
    // 当时只改了 steel，隔四行的 blued 漏掉了 —— 于是全屏最黑的东西是枪机、弹匣、桥夹。
    //
    // 病根不是后处理，是 PBR 参数写错了：Plain() 一张贴图都不挂（Script_Materials.mjs:135），
    // 所以 metalness 就是字面的 1.0，漫反射项恒等于 0，color **整个被当成金属 F0**。
    // 0x2b2e31 线性化后是 (0.0242, 0.0273, 0.0307)，即「反射率 2.7% 的金属」——
    // 自然界没有这种东西（铁的 F0 ≈ 0.56，连塑料这类电介质都有 0.04）。
    // 实测：枪机区线性亮度 0.0141，比周围街景（0.409）暗 29 倍，8-bit 上是 2–3/255。
    // 七关都黑，第五关只是把它推到极致 —— L5 出生点背对太阳（elev 45°/azim 226°），
    // 连那几个「碰巧把太阳镜射进眼睛」的面都没了，于是整支枪塌成纯黑。
    //
    // 对照组说明为什么墙没事：BrickWall 也写 metalness: 1，但它走 library.Get()、
    // 带 ORM，而 ORM 的 metal 通道均值 0.000，把 metalness 乘成了 0。
    // Get() 靠 ORM 抵消，Plain() 没有 ORM 可抵消 —— 同一个 1.0 在墙上无害、在枪上致命。
    //
    // 改法照 steel 的先例：metalness 退到 0.80 留一点漫反射（暗部才看得出材质），
    // color 抬到线性 ≈ 0.20（sRGB 0x7a7d82）。发蓝钢真值 F0 更高，但它是**烤蓝氧化层**
    // 且这支枪在战场上滚了半个月，抬到物理真值会变成镀铬件；0.20 是「暗但有形」的落点。
    blued: library.Plain("VmBlued", { color: 0x7a7d82, roughness: 0.44, metalness: 0.80 }),
    leather: library.Plain("VmLeather", { color: 0x3a2c22, roughness: 0.86, metalness: 0 }),
    lqWaltherP38: SafeMaterial(library, "LugouqiaoWaltherP38", {}, 0x595d64),
    lqBrowningTripod: SafeMaterial(library, "Steel", {}, 0x555960),
    lqUnidentifiedMunition: SafeMaterial(library, "LugouqiaoUnidentifiedMunition", {}, 0x68625a),
    lqUnidentifiedBoltActionRifle: SafeMaterial(library, "LugouqiaoUnidentifiedBoltActionRifle", {}, 0x6b5642),
    lqOfficerSword: SafeMaterial(library, "LugouqiaoOfficerSword", {}, 0x68635c),
    lqRingPommelDagger: SafeMaterial(library, "LugouqiaoRingPommelDagger", {}, 0x605b52),
    lqUnidentifiedAntiaircraftMetal: SafeMaterial(library, "LugouqiaoUnidentifiedAntiaircraftMetal", {}, 0x565a60),
    lqUnidentifiedAntiaircraftWood: SafeMaterial(library, "LugouqiaoUnidentifiedAntiaircraftWood", {}, 0x6b4c32),
    lqLightMortar: SafeMaterial(library, "LugouqiaoLightMortar", {}, 0x5d5e58),
    lqType11AmmoBox: SafeMaterial(library, "LugouqiaoType11AmmoBox", {}, 0x5e5b4e),
    lqType11Body: SafeMaterial(library, "LugouqiaoType11Body", {}, 0x575a55),
    lqType11BodyAlt: SafeMaterial(library, "LugouqiaoType11BodyAlt", {}, 0x575a55),
    lqType11Fore: SafeMaterial(library, "LugouqiaoType11Fore", {}, 0x67513a),
    lqMauser96: SafeMaterial(library, "LugouqiaoMauser96", {}, 0x5a4c3e),
    lqMediumMortar: SafeMaterial(library, "Steel", {}, 0x555960),
    lqKarabiner98k: SafeMaterial(library, "LugouqiaoKarabiner98k", {}, 0x5d4a38),
    lqWeaponPlain: SafeMaterial(library, "Steel", {}, 0x555960),
    // 刀柄缠的红布：全场唯二的高饱和点之一（另一个是青天白日帽徽）
    redCloth: library.Plain("VmRedCloth", { color: 0x8e2b22, roughness: 0.92, metalness: 0 }),
    flash: library.Plain("VmMuzzleFlash", {
      color: 0x000000, emissive: 0xffc266, emissiveIntensity: 7.5,
      roughness: 1, metalness: 0, transparent: true, opacity: 0.92, depthWrite: false,
    }),
  };
}

// ---------------------------------------------------------------------------
// 手
// ---------------------------------------------------------------------------

/**
 * 一只低模手，**原点就是握持点**（被握住的那根"棍"的轴心，棍沿局部 X）。
 * 把原点放在握持点上，装配时只要"把手放到握把上、转个角度"就完事，
 * 不用再算掌心到手腕的偏移 —— 这是能一天试完二十个手位的关键。
 *
 * 手指按要求合并成两段（近节 + 远节）+ 一根拇指。手腕外面必有军装袖口，
 * 没袖口的话就是一只从虚空里伸出来的手，观感立刻掉档。
 *
 * @param {number} side +1 右手 / -1 左手（沿 X 镜像）
 */
function BuildHandGeometry(side, key) {
  const skin = [];
  const cloth = [];
  const S = side;

  // 握持轴 = 手局部的 **X 轴**（前护木、枪颈都是沿 X 穿过手心的一根圆柱），
  // 所以手指在 YZ 平面里绕着它卷，掌心朝 -Y，指根在 +Z 一侧。
  //
  // 上一版是"四根方料排一排 + 每根再摆一块远节"：两节各自按固定 z 摆、各自转各自的
  // 角，**两节根本不相接**，中间飘着一道缝；四根一样粗、一样长、平行伸出去，
  // 侧面看是一把耙子。掌、掌沿、腕、袖口也都是轴对齐的方盒，没有一处收锥。
  //
  // 这一版两条原则：
  //   1) **手指是链，不是零件堆。** 每根三节，后一节从前一节的**末端**接着长，
  //      角度累加。接缝在数学上就闭合，不靠调坐标去凑。
  //   2) **圆的东西用圆的画。** 指节、腕、袖口全换成收锥的圆管（Tube 支持两端
  //      不同半径）。一根 φ14 mm 的六边形管在屏幕上就是手指；一块 15×25 mm 的
  //      方料，转到任何角度都是一块方料。
  const TIP = VM_TILE.cloth;

  /** 一根手指：从指根出发，逐节累加角度，每节都接在上一节末端。 */
  const Finger = (x, base, lens, radii, bend, ry = 0) => {
    let py = base.y, pz = base.z, ang = base.a;
    let px = x;
    for (let i = 0; i < lens.length; i += 1) {
      ang += bend[i];
      const dy = -Math.sin(ang), dz = Math.cos(ang);
      const len = lens[i];
      // ry 只是让整根指往外斜一点（拇指走虎口），链的闭合仍然只由 ang 决定
      const dx = Math.sin(ry) * dz;
      skin.push(Tube(radii[i + 1], radii[i], len, 9, TIP,
        { x: px + dx * len * 0.5, y: py + dy * len * 0.5, z: pz + dz * len * 0.5, rx: ang, ry }));
      px += dx * len; py += dy * len; pz += dz * len;
    }
    // 指尖收个圆头，免得看到一个平切面
    skin.push(Tube(radii[radii.length - 1] * 0.55, radii[radii.length - 1], 0.006, 9, TIP,
      { x: px, y: py, z: pz, rx: ang, ry }));
  };

  // 掌：两块交叠椭球做出「指根宽、掌根窄」的连续轮廓。上一版虽然拆成
  // 两块收锥，本质仍是两只长方体；近镜头下掌沿那道 90° 硬折与反腕叠在一起，
  // 看起来就是一把折断的木夹子。椭球仍是低面数，但掌背到大/小鱼际已经是圆转的。
  skin.push(Ellipsoid(0.037, 0.018, 0.030, VM_TILE.cloth,
    { x: 0, y: -0.024, z: 0.006, rx: 0.10 }));
  skin.push(Ellipsoid(0.031, 0.017, 0.027, VM_TILE.cloth,
    { x: 0, y: -0.029, z: -0.031, rx: 0.06 }));
  // 掌指关节那一排：握拳时最先顶出来的一条横棱，做成圆的
  skin.push(Tube(0.012, 0.012, 0.070, 9, TIP, { x: 0, y: -0.016, z: 0.028, rx: 0, ry: Math.PI / 2 }));
  // 小鱼际（小指侧掌沿）：手不是左右对称的板，这一坨让它有握持的厚度
  skin.push(Tube(0.013, 0.010, 0.060, 9, TIP,
    { x: -S * 0.031, y: -0.028, z: -0.008, rx: 0.08, ry: 0.10 * S }));

  // 四指。i=0 是食指侧：最长、卷得最少；到小指逐根变短变细、卷得更深 ——
  // 握住圆柱时四指本来就不齐，这一点差异就是"手"和"梳子"的分界。
  const pitch = 0.0175;
  for (let i = 0; i < 4; i += 1) {
    const x = (i - 1.5) * pitch * S;
    const k = 1 - i * 0.075;                       // 逐根变短
    const r0 = 0.0072 * (1 - i * 0.05);            // 逐根变细
    Finger(
      x,
      { y: -0.014 - i * 0.0015, z: 0.030, a: 0.10 + i * 0.05 },
      [0.030 * k, 0.022 * k, 0.015 * k],
      [r0, r0 * 0.94, r0 * 0.86, r0 * 0.78],
      [0.62 + i * 0.05, 0.78 + i * 0.04, 0.70 + i * 0.03],
    );
  }

  // 拇指：同样走链，但**往 +Y 卷**（起始角取负），从虎口爬上握持轴上方再压平。
  // 上一版是按绝对坐标摆两节：坐标一路往 +Y 走、旋转角却指着 -Y，两者打架，
  // 渲出来是一根从手背竖着支出去的角。
  Finger(
    S * 0.030,
    { y: -0.030, z: -0.020, a: -1.05 },
    [0.034, 0.026],
    [0.0112, 0.0098, 0.0082],
    [0.36, 0.34],
    -S * 0.30,
  );

  // **腕、袖口、小臂不在这里。** 它们归 MakeSleeve，见下面那段抬头：
  // 手的朝向是按"握住这根棍"解出来的，小臂跟着它走必然指错方向。
  return { skin, cloth };
}

// ---------------------------------------------------------------------------
// 小臂与袖口
// ---------------------------------------------------------------------------
//
// **事故：袖子曾经长在手上。**
//
// 旧版把腕 + 袖口 + 小臂那三根管子直接摆进 BuildHandGeometry 的 z < 0 一侧，
// 于是小臂方向 = 手的局部 -Z，完全由 hands.right/left 那几个欧拉角决定。
// 而那几个角是按**握持**调出来的（"手要以这个姿态卡在枪颈上"），小臂指向哪儿
// 只是副产品 —— 三支步枪的 ry 都是 0，小臂于是顺着武器的 -Z **朝枪口伸**。
// 玩家看到的就是：机匣上方糊着一坨蓝灰色的多面体，看不出是什么东西。
// （用户 2026-08-29 的截图；射线取证打到的是 HandRight 的 cloth 网格。）
// 大刀那一条早就发现了这个毛病，办法是给 handRot 加 ry = π —— 但那是把整只手
// 连着手指一起翻过去，只是碰巧刀柄两头对称才看不出来，步枪上一翻手就背过去了。
//
// 正确的拆法：**手只管握，小臂只管从肘伸到腕。** 小臂自己是一节挂在 armAnchor
// （相机稳定层）下的锥管，每帧从肘锚点朝当前手位对准、按距离拉长。手怎么转、
// 枪怎么摆、投弹时左手飞到哪儿，小臂都还是从画面下沿伸上来的那一条。
//
// 肘锚点落在视锥下沿之外（视场 52°，前方 d 米处画面下沿 y ≈ -0.49 d）：
// 于是画面里永远只有袖口和拳头，看不到肘、更看不到大臂。
//
// 两个数都是量出来的，不是猜的：肘要摆在**手的下方**，不是摆在身体两侧。
// 第一人称的枪端在身前偏右（腰射时右手落在眼前 (0.10, -0.14, -0.32)、
// 左手托在护木上 (0.13, -0.14, -0.74)，都在中线**右侧**），左肘照人体常识写在
// 身体左边（x = -0.165）的话，左小臂就要从画面左下角斜穿到右前方的护木 ——
// 一根横贯整个下半屏的蓝管子，比它替换掉的那坨还难看。
// 端枪的人本来就是把左肘**收到枪下面**顶住肋骨的，所以左肘写在 x ≈ 0。
const ELBOW_ANCHOR = {
  right: new THREE.Vector3(0.260, -0.360, -0.060),
  left: new THREE.Vector3(0.020, -0.360, -0.500),
};
// 手的原点是「被握住的棍的轴心」，**不是腕关节**。掌根在手局部的
// z < 0 一侧；袖管若直接追原点，袖口就会卡在枪上，拳头却在另一边，
// 画面上读成「前臂接在手背/拇指上，腕子反折」。这个点取自 BuildHandGeometry
// 里 palmB 的掌根与旧腕管的交叠中心，必须跟着 handGroup 旋转；不能把它当成
// 枪局部或 armAnchor 里的固定偏移。
const HAND_WRIST_LOCAL = new THREE.Vector3(0, -0.040, -0.058);
// 小臂末端停在离解剖腕点这么远的地方；剩下一截由 cap 里的皮肤腕管接上。
const WRIST_INSET = 0.052;
// setFromUnitVectors 的起始轴：小臂几何是按 +Z 建的
const SLEEVE_FORWARD = new THREE.Vector3(0, 0, 1);

/**
 * 一条小臂：局部 +Z 朝手（长度 1，靠 shaft.scale.z 拉到实际长度）。
 * 袖口翻边与露出来的一小截腕跟着 cap 一起挪到远端，不吃拉伸。
 */
function MakeSleeve(materials, side) {
  const group = new THREE.Group();
  group.name = side > 0 ? "SleeveRight" : "SleeveLeft";
  // 单位长的锥管：z=0 是肘（粗）、z=1 是腕（细）
  // 半径沿用旧袖子那一套（腕 32 / 肘 38 mm）。**别按真人尺寸放大**：这套视图模型
  // 是按小手做的，一条真实粗细（φ95 mm）的小臂在 52° 视场里有 130 px 宽，
  // 等于用袖子把下半屏糊掉一条。
  const shaft = MakePart(
    [Tube(0.032, 0.038, 1, 10, VM_TILE.cloth, { z: 0.5 })], materials.cloth);
  shaft.name = `${group.name}Shaft`;
  group.add(shaft);

  const cap = new THREE.Group();
  cap.name = `${group.name}Cap`;
  // 袖口翻边：比袖管粗一圈的一道薄环，军装袖子的收口就是这么一条
  const cuff = MakePart(
    [Tube(0.037, 0.037, 0.016, 10, VM_TILE.cloth, { z: -0.006 })], materials.cloth);
  cuff.name = `${group.name}Cuff`;
  // 袖口到掌根之间露出来的那一截腕（皮肤）。两头都往里插一点，接缝靠**交叠**
  // 闭合，不靠坐标凑 —— 手会随动作在腕轴上小幅前后动，留缝就会被看见。
  const wrist = MakePart(
    [Tube(0.026, 0.030, 0.056, 10, VM_TILE.cloth, { z: 0.024 })], materials.skin);
  wrist.name = `${group.name}Wrist`;
  cap.add(cuff);
  cap.add(wrist);
  group.add(cap);

  return { group, shaft, cap, meshes: [shaft, cuff, wrist] };
}

/** 组装一只手为 Group（原点 = 握持点），返回 { group, meshes }。 */
function MakeHand(materials, side, key) {
  const parts = BuildHandGeometry(side, key);
  const group = new THREE.Group();
  group.name = side > 0 ? "HandRight" : "HandLeft";
  // cloth 桶现在恒为空（袖子搬去 MakeSleeve 了），MakePart 对空桶返回 null
  const meshes = [
    MakePart(parts.skin, materials.skin),
    MakePart(parts.cloth, materials.cloth),
  ].filter(Boolean);
  for (const mesh of meshes) group.add(mesh);
  return { group, meshes };
}

// ---------------------------------------------------------------------------
// 武器造型
// ---------------------------------------------------------------------------
//
// 统一局部坐标：**原点 = 右手握持点**，-Z 朝枪口，+Y 朝机匣上方，+X 朝右。
// 原点放在握把上而不是枪托底，是因为所有姿势（腰射/开镜/冲刺）都是绕着握持手转的。

/**
 * 三支栓动步枪共用一套骨架，差别全在这张表里。
 * 长度都对得上 Data_Weapons：中正式 1.110 / 汉阳造 1.250 / 三八式 1.276。
 */
const RIFLE_SPECS = {
  ZhongZheng: {
    boreY: 0.052, buttZ: 0.2925, muzzleZ: -0.8175,
    barrelR: 0.0086, jacketR: 0,
    rearSightZ: -0.2715, frontSightZ: -0.7750,   // 瞄准基线 503.5 mm（考据值）
    forend: [-0.200, -0.615], handguard: [-0.225, -0.560],
    bands: [-0.440, -0.600], dustCover: false,
    bayonetZ: -0.800, bayonetLen: 0.395,
  },
  HanYang: {
    boreY: 0.052, buttZ: 0.2925, muzzleZ: -0.9575,
    barrelR: 0.0080, jacketR: 0.0136,            // "老套筒"：枪管外的薄套筒 = 它的剪影
    rearSightZ: -0.2800, frontSightZ: -0.9050,
    forend: [-0.200, -0.700], handguard: [-0.225, -0.640],
    bands: [-0.470, -0.690], dustCover: false,
    bayonetZ: -0.940, bayonetLen: 0.395,
  },
  Type38: {
    boreY: 0.050, buttZ: 0.2925, muzzleZ: -0.9835,
    barrelR: 0.0079, jacketR: 0,
    rearSightZ: -0.3000, frontSightZ: -0.9450,
    forend: [-0.200, -0.720], handguard: [-0.230, -0.680],
    bands: [-0.480, -0.700], dustCover: true,     // 三八"大盖"：拉栓时随之前后滑
    bayonetZ: -0.965, bayonetLen: 0.510,
  },
};

function BuildBoltRifle(materials, weapon, key) {
  const spec = RIFLE_SPECS[key] || RIFLE_SPECS.ZhongZheng;
  const bore = spec.boreY;
  const steel = [];
  const wood = [];
  const strap = [];
  // near* 三桶 = **开镜时整块藏掉**的零件：它们全都落在眼睛后面或 6.6 cm 近裁面
  // 死区里，画出来只会被切成一片穿帮的截面。分桶而不是按包围盒判 —— 木件/钢件
  // 各自是一个合并网格，按包围盒会把整支枪连照门一起藏掉（这条教训写在
  // _CollectAdsHideParts 的注释里，这里只是把它执行到底）。
  const nearSteel = [];
  const nearWood = [];
  const nearStrap = [];

  // --- 机匣 -----------------------------------------------------------------
  // 高度 50 → 38 mm（真毛瑟机匣外径约 35 mm），中心再下压 2 mm：顶面落到
  // bore+0.017，比瞄准基线（bore+0.032）低 15 mm。**这一条是开镜穿模的正根**：
  // 原来顶面 bore+0.025、基线 bore+0.026 —— 眼睛贴着机匣顶面飞，只高出 1.0 mm，
  // 稍微一晃相机就钻进机匣里，近裁面从机匣正中切一刀，出图上就是准星下方
  // 十几像素处那一大块黑色方料（用户截图里的那团）。
  //
  // 机匣同时进 nearSteel 桶：开镜时眼睛在 rig z=-0.14 上下，机匣前端才到 -0.2175，
  // 也就是整条机匣**几乎全部落在 6.6 cm 的近裁面死区里**，露出来的只有十几毫米
  // 一道被切开的截面。真枪据枪时也看不见机匣（它在视线下方、脸颊后面）。
  steel.push(Box(0.030, 0.038, 0.245, VM_TILE.steel, `${key}rec`, { x: 0, y: bore - 0.002, z: -0.095 }));
  // 机匣环（枪管接进机匣的那一段粗箍），毛瑟系的特征。
  // 也进 near 桶：它后端在 rig z=-0.170，开镜时离眼只有 2.3 cm，被近裁面
  // 从中间切一刀，露出来的是个圆环截面 —— 挂在准星下方十二度处的一个黑圈。
  steel.push(Tube(0.0175, 0.0175, 0.052, 12, VM_TILE.steel, { x: 0, y: bore, z: -0.196 }));

  // --- 枪管 -----------------------------------------------------------------
  const barrelLen = Math.abs(spec.muzzleZ + 0.2175);
  const barrelMidZ = -0.2175 - barrelLen / 2;
  // 20 段而不是 12：枪管是全画面离相机最近的圆柱，12 边形在近端每面宽 50 px，
  // 明暗台阶一眼能数出来 —— 读成方钢不是圆管。多出来的三角形不到 100 个
  steel.push(Tube(spec.barrelR, spec.barrelR * 1.32, barrelLen, 20, VM_TILE.steel,
    { x: 0, y: bore, z: barrelMidZ }));
  if (spec.jacketR > 0) {
    // 汉阳造的薄套筒：包住枪管前 3/4，尾端留出机匣环
    const jacketLen = barrelLen - 0.09;
    steel.push(Tube(spec.jacketR, spec.jacketR, jacketLen, 20, VM_TILE.steel,
      { x: 0, y: bore, z: -0.2575 - jacketLen / 2 }));
  }
  // 枪口帽/护圈
  steel.push(Tube(spec.barrelR * 1.5, spec.barrelR * 1.5, 0.024, 20, VM_TILE.steel,
    { x: 0, y: bore, z: spec.muzzleZ + 0.012 }));

  // --- 木件：护木 + 上护盖 + 枪颈 + 枪托 ------------------------------------
  const forendLen = spec.forend[0] - spec.forend[1];
  wood.push(Box(0.044, 0.050, forendLen, VM_TILE.wood, `${key}fore`,
    { x: 0, y: bore - 0.036, z: (spec.forend[0] + spec.forend[1]) / 2 }));
  // 上护盖的**后端必须在照门前面**。原来三支枪都是 -0.225/-0.230，比照门还靠后
  // 47—70 mm，也就是开镜时它的后端离眼睛只有 6.5—8.8 cm —— 顶面比基线低 4 mm，
  // 在 6.5 cm 处张成 3.5°，往下整个下半屏全是这块木头（用户截图里准星下方那块）。
  // 挪到照门前 45 mm 之后，后端离眼 17 cm 以上，同样 4 mm 的落差只张成 1.3°，
  // 退成基线下方一道朝枪口收拢的窄楔形 —— 那才是据枪时该看到的样子。
  const guardBackZ = Math.min(spec.handguard[0], spec.rearSightZ - 0.045);
  const guardLen = guardBackZ - spec.handguard[1];
  // 上护盖顶面必须**低于瞄准基线**（基线 = bore + 0.026，照门缺口与准星尖都在那儿）。
  // 原来是 y = bore + 0.020、厚 0.020，顶面 bore + 0.030 —— 比基线还高 4 mm。
  // 4 mm 在腰射时看不出来，开镜时护盖近端离眼睛只有 7.7 cm，那 4 mm 张成
  // 整整半个屏幕高：出图上就是横在准星上方、把目标全糊掉的一块木板（实测顶边
  // 落在 y=393 px，而画面中心是 450）。压到 bore + 0.013、厚 0.018，顶面
  // bore + 0.022 —— 比基线低 4 mm，护盖就退成基线下方那道朝枪口收拢的楔形。
  wood.push(Box(0.032, 0.018, guardLen, VM_TILE.wood, `${key}guard`,
    { x: 0, y: bore + 0.013, z: (guardBackZ + spec.handguard[1]) / 2 }));
  // 枪颈（握持处）：从机匣后下方斜向枪托。**在眼睛后面**，开镜时藏。
  nearWood.push(Box(0.038, 0.058, 0.185, VM_TILE.wood, `${key}wrist`, { x: 0, y: bore - 0.040, z: 0.105, rx: 0.055 }));
  // 托底：略下垂 + 加厚，这是"抵肩"的形
  nearWood.push(Box(0.046, 0.106, 0.135, VM_TILE.wood, `${key}butt`,
    { x: 0, y: bore - 0.062, z: spec.buttZ - 0.062, rx: 0.055 }));
  // 托底钢板
  nearSteel.push(Box(0.048, 0.118, 0.010, VM_TILE.steel, `${key}plate`,
    { x: 0, y: bore - 0.065, z: spec.buttZ, rx: 0.055 }));

  // --- 箍、扳机、弹仓 -------------------------------------------------------
  for (let i = 0; i < spec.bands.length; i += 1) {
    steel.push(Box(0.048, 0.058, 0.016, VM_TILE.steel, `${key}band${i}`, { x: 0, y: bore - 0.012, z: spec.bands[i] }));
  }
  nearSteel.push(Box(0.030, 0.010, 0.090, VM_TILE.steel, `${key}tg`, { x: 0, y: bore - 0.072, z: -0.020 }));
  nearSteel.push(Box(0.010, 0.022, 0.010, VM_TILE.steel, `${key}trig`, { x: 0, y: bore - 0.062, z: -0.004 }));
  nearSteel.push(Box(0.038, 0.030, 0.098, VM_TILE.steel, `${key}mag`, { x: 0, y: bore - 0.048, z: -0.100 }));

  // --- 照门与准星（开镜要真的对准画面中心，所以这两个必须共轴）--------------
  // 基线从 bore+0.026 抬到 bore+0.032：机匣压薄之后要把这 6 mm 还给"眼睛离
  // 机匣顶面的余量"，否则压薄的好处又被基线吃回去。真枪的照门缺口本来也在
  // 机匣顶面上方一节（立框表尺的底座有厚度）。
  const sightY = bore + 0.040;
  steel.push(Box(0.030, 0.024, 0.062, VM_TILE.steel, `${key}rsBase`, { x: 0, y: bore + 0.022, z: spec.rearSightZ }));
  // 缺口做成两块小块中间留缝：真的能"看见"缺口，不是一块实心方料
  for (const s of [-1, 1]) {
    steel.push(Box(0.010, 0.014, 0.010, VM_TILE.steel, `${key}rsL${s}`,
      { x: s * 0.0075, y: sightY - 0.002, z: spec.rearSightZ - 0.020 }));
  }
  steel.push(Box(0.005, 0.016, 0.007, VM_TILE.steel, `${key}fs`, { x: 0, y: sightY - 0.003, z: spec.frontSightZ }));
  steel.push(Box(0.026, 0.020, 0.020, VM_TILE.steel, `${key}fsBase`, { x: 0, y: bore + 0.018, z: spec.frontSightZ }));
  // 准星护耳：两片，防止逆光时准星糊在天空里看不见
  for (const s of [-1, 1]) {
    steel.push(Box(0.004, 0.020, 0.018, VM_TILE.steel, `${key}fsEar${s}`,
      { x: s * 0.011, y: sightY - 0.004, z: spec.frontSightZ }));
  }

  // --- 背带（挂在下箍与枪颈之间，垂一小段）---------------------------------
  strap.push(Box(0.026, 0.006, 0.090, VM_TILE.cloth, `${key}sling`, { x: 0, y: bore - 0.060, z: spec.bands[1] + 0.05, rx: -0.5 }));
  nearStrap.push(Box(0.026, 0.006, 0.120, VM_TILE.cloth, `${key}sling2`, { x: 0, y: bore - 0.090, z: -0.30, rx: 0.15 }));

  // --- 可动件：枪机 ---------------------------------------------------------
  // 枪机抬到 bore+0.010：机匣顶面在 bore+0.017，枪机顶就露出 3.5 mm。
  // 原来枪机圆心与膛线轴同高，整根埋在机匣里 —— 开镜时机匣顶是一块光板，
  // 读不出这是栓动枪（真枪的枪机就是压在机匣顶的机槽里、露出上半个圆）。
  const boltPivot = { x: 0, y: bore + 0.010, z: -0.055 };
  const boltGeo = [];
  boltGeo.push(Tube(0.0105, 0.0105, 0.170, 10, VM_TILE.steel, { x: 0, y: bore + 0.010, z: -0.055 }));
  boltGeo.push(Tube(0.0135, 0.0135, 0.022, 10, VM_TILE.steel, { x: 0, y: bore + 0.010, z: 0.038 }));  // 保险/击针尾
  // 拉机柄：斜向右下，这样右手抬手就能抓到（毛瑟直柄、三八式也是直柄）
  boltGeo.push(Box(0.040, 0.012, 0.014, VM_TILE.steel, `${key}bhStem`, { x: 0.020, y: bore + 0.012, z: 0.008, rz: -0.30 }));
  boltGeo.push(Tube(0.011, 0.011, 0.016, 10, VM_TILE.steel, { x: 0.042, y: bore, z: 0.008, rx: Math.PI / 2 }));
  const bolt = MakePart(boltGeo, materials.blued, boltPivot);

  // --- 可动件：三八式防尘盖 -------------------------------------------------
  let dustCover = null;
  if (spec.dustCover) {
    const coverGeo = [Box(0.030, 0.010, 0.150, VM_TILE.steel, `${key}dust`, { x: 0, y: bore + 0.027, z: -0.100 })];
    dustCover = MakePart(coverGeo, materials.steel, { x: 0, y: bore + 0.027, z: -0.100 });
  }

  // --- 刺刀（默认收起）-----------------------------------------------------
  // 为什么默认不挂：上了刺刀全长 1.66 m，枪尖会戳出深度预算之外，走廊里天天插墙。
  // 只在拼刺那一下亮出来，反而更有戏。
  const bayoGeo = [];
  bayoGeo.push(Box(0.014, 0.026, spec.bayonetLen * 0.86, VM_TILE.steel, `${key}blade`,
    { x: 0, y: bore - 0.020, z: spec.bayonetZ - spec.bayonetLen * 0.43 }));
  bayoGeo.push(Box(0.016, 0.030, 0.048, VM_TILE.steel, `${key}bhilt`, { x: 0, y: bore - 0.018, z: spec.bayonetZ + 0.010 }));
  bayoGeo.push(Tube(0.012, 0.012, 0.030, 10, VM_TILE.steel, { x: 0, y: bore, z: spec.bayonetZ + 0.012 }));
  const bayonet = MakePart(bayoGeo, materials.steel, { x: 0, y: bore, z: spec.bayonetZ });
  bayonet.visible = false;

  const group = new THREE.Group();
  AddPart(group, MakePart(steel, materials.steel));
  AddPart(group, MakePart(wood, materials.wood));
  AddPart(group, MakePart(strap, materials.cloth));
  // 眼后那三块单独成网格：腰射时照常画（多 3 个 draw call），
  // 开镜时整块 visible=false（那时反而**省**掉它们）
  const nearParts = [
    MakePart(nearSteel, materials.steel),
    MakePart(nearWood, materials.wood),
    MakePart(nearStrap, materials.cloth),
  ];
  for (const mesh of nearParts) AddPart(group, mesh);
  group.add(bolt);
  if (dustCover) group.add(dustCover);
  group.add(bayonet);

  return {
    group,
    parts: { bolt, dustCover, bayonet },
    // 枪机与防尘盖**不藏**：眼睛退到 30 cm 之后它们落在机匣顶面上、视线正下方，
    // 是据枪画面里唯一能读出"栓动"的细节。藏了机匣顶就成了一块没东西的铁板。
    adsHide: nearParts.filter(Boolean),
    boltTravel: 0.078,
    ejectAt: new THREE.Vector3(0.024, bore + 0.012, -0.030),
    clipSeat: new THREE.Vector3(0, bore + 0.030, -0.150),
    muzzle: new THREE.Vector3(0, bore, spec.muzzleZ - 0.006),
    sight: new THREE.Vector3(0, sightY, spec.rearSightZ - 0.020),
    hands: {
      // 右手在枪颈上（原点附近），左手托前护木
      right: { x: 0.004, y: bore - 0.052, z: 0.010, rx: 0.10, ry: 0.0, rz: -1.52 },
      left: { x: -0.004, y: bore - 0.040, z: (spec.forend[1] + spec.forend[0]) / 2 - 0.02, rx: 0.05, ry: 0.0, rz: 1.60 },
    },
    boltHandle: new THREE.Vector3(0.048, bore - 0.004, 0.008),
  };
}

function BuildZb26(materials, weapon, key) {
  const bore = 0.048;
  const steel = [];
  const wood = [];

  // 机匣（比步枪高，因为要容纳上插弹匣的供弹口）
  steel.push(Box(0.042, 0.062, 0.310, VM_TILE.steel, `${key}rec`, { x: 0, y: bore, z: -0.115 }));
  // 枪管：602 mm，尾段有散热片
  steel.push(Tube(0.0105, 0.0125, 0.602, 12, VM_TILE.steel, { x: 0, y: bore, z: -0.270 - 0.301 }));
  for (let i = 0; i < 6; i += 1) {
    steel.push(Tube(0.0175, 0.0175, 0.008, 12, VM_TILE.steel, { x: 0, y: bore, z: -0.300 - i * 0.026 }));
  }
  // 锥形消焰器
  steel.push(Tube(0.020, 0.013, 0.040, 12, VM_TILE.steel, { x: 0, y: bore, z: -0.850 }));
  // 枪管上方提把（快换枪管用）—— ZB-26 的第二剪影特征
  steel.push(Box(0.020, 0.022, 0.115, VM_TILE.steel, `${key}handleA`, { x: 0, y: bore + 0.034, z: -0.330 }));
  steel.push(Box(0.018, 0.050, 0.026, VM_TILE.steel, `${key}handleB`, { x: 0, y: bore + 0.052, z: -0.286, rx: -0.25 }));

  // 上插弹匣：20 发弧形弹匣**从上方**插入（做成下插就全错了）
  const magGeo = [];
  for (let i = 0; i < 4; i += 1) {
    // 弧度靠 4 段递增倾角堆出来，比真弯管便宜得多，剪影一样是弧的
    magGeo.push(Box(0.026, 0.046, 0.036, VM_TILE.steel, `${key}mag${i}`,
      { x: 0, y: bore + 0.070 + i * 0.045, z: -0.160 - i * 0.009 - i * i * 0.004, rx: -0.055 - i * 0.03 }));
  }
  const magazine = MakePart(magGeo, materials.blued, { x: 0, y: bore + 0.062, z: -0.158 });

  // 照门/准星在**左侧**偏置 —— 因为弹匣占了机匣正上方。
  // 结果是开镜时整支枪偏在画面右边，这不是 bug，是捷克式的真实据枪姿态。
  const sightX = -0.030;
  const sightY = bore + 0.058;
  steel.push(Box(0.024, 0.030, 0.040, VM_TILE.steel, `${key}rs`, { x: sightX, y: bore + 0.036, z: -0.290 }));
  steel.push(Box(0.006, 0.018, 0.008, VM_TILE.steel, `${key}fs`, { x: sightX, y: sightY - 0.004, z: -0.690 }));
  steel.push(Box(0.020, 0.026, 0.016, VM_TILE.steel, `${key}fsBase`, { x: sightX, y: bore + 0.036, z: -0.690 }));

  // 握把 + 扳机 + 枪托：全在眼睛后面（开镜时眼在 rig z≈+0.02），进 near 桶。
  // 不分桶的话这一串会从 z=+0.30 一直伸到相机后面 30 cm，被近裁面从中间切开 ——
  // 出图上就是画面下半部那一大块穿帮的木头（跟栓动步枪那三支是同一个病）。
  const nearSteel = [];
  const nearWood = [];
  nearWood.push(Box(0.034, 0.100, 0.046, VM_TILE.wood, `${key}grip`, { x: 0, y: bore - 0.088, z: 0.010, rx: 0.20 }));
  nearSteel.push(Box(0.030, 0.010, 0.080, VM_TILE.steel, `${key}tg`, { x: 0, y: bore - 0.044, z: -0.030 }));
  // 枪托：ZB-26 的托是直的，托底还有个可折的托肩板
  nearWood.push(Box(0.040, 0.062, 0.230, VM_TILE.wood, `${key}stock`, { x: 0, y: bore - 0.020, z: 0.185 }));
  nearSteel.push(Box(0.046, 0.090, 0.012, VM_TILE.steel, `${key}plate`, { x: 0, y: bore - 0.026, z: 0.300 }));

  // 两脚架：折叠状态贴在枪管下方（巷战里没人架着两脚架跑）
  for (const s of [-1, 1]) {
    steel.push(Box(0.010, 0.010, 0.210, VM_TILE.steel, `${key}bip${s}`,
      { x: s * 0.016, y: bore - 0.026, z: -0.640, ry: s * 0.05 }));
    steel.push(Box(0.026, 0.008, 0.014, VM_TILE.steel, `${key}foot${s}`, { x: s * 0.018, y: bore - 0.030, z: -0.745 }));
  }
  steel.push(Box(0.040, 0.026, 0.030, VM_TILE.steel, `${key}bipMount`, { x: 0, y: bore - 0.020, z: -0.545 }));

  // 拉机柄在右侧
  const boltGeo = [Box(0.030, 0.016, 0.030, VM_TILE.steel, `${key}charge`, { x: 0.030, y: bore - 0.008, z: -0.020 })];
  const bolt = MakePart(boltGeo, materials.blued, { x: 0.030, y: bore - 0.008, z: -0.020 });

  const group = new THREE.Group();
  AddPart(group, MakePart(steel, materials.steel));
  AddPart(group, MakePart(wood, materials.wood));
  const nearParts = [MakePart(nearSteel, materials.steel), MakePart(nearWood, materials.wood)];
  for (const mesh of nearParts) AddPart(group, mesh);
  group.add(magazine);
  group.add(bolt);

  return {
    group,
    parts: { bolt, magazine, dustCover: null, bayonet: null },
    adsHide: nearParts.filter(Boolean),
    boltTravel: 0.062,
    // 抛壳口在下方（这是捷克式的又一个考据点）
    ejectAt: new THREE.Vector3(0.010, bore - 0.048, -0.120),
    clipSeat: new THREE.Vector3(0, bore + 0.075, -0.160),
    muzzle: new THREE.Vector3(0, bore, -0.868),
    sight: new THREE.Vector3(sightX, sightY, -0.290),
    hands: {
      right: { x: 0.004, y: bore - 0.076, z: 0.012, rx: 0.20, ry: 0, rz: -1.52 },
      left: { x: -0.004, y: bore - 0.062, z: -0.330, rx: 0.05, ry: 0, rz: 1.60 },
    },
    boltHandle: new THREE.Vector3(0.046, bore - 0.008, -0.020),
    magPivot: new THREE.Vector3(0, bore + 0.062, -0.158),
  };
}

function BuildMauser96(materials, weapon, key) {
  const bore = 0.045;
  const steel = [];
  const wood = [];

  // 方机匣 —— C96 最醒目的形
  steel.push(Box(0.030, 0.056, 0.180, VM_TILE.steel, `${key}rec`, { x: 0, y: bore, z: -0.058 }));
  steel.push(Box(0.026, 0.026, 0.070, VM_TILE.steel, `${key}recTop`, { x: 0, y: bore + 0.030, z: -0.020 }));
  // 枪管
  steel.push(Tube(0.0068, 0.0090, 0.140, 10, VM_TILE.steel, { x: 0, y: bore, z: -0.202 }));
  // 弹仓在扳机**前方** —— C96 的结构特征，做到扳机后面就成了普通手枪
  steel.push(Box(0.028, 0.064, 0.036, VM_TILE.steel, `${key}magbox`, { x: 0, y: bore - 0.048, z: -0.052 }));
  steel.push(Box(0.030, 0.010, 0.058, VM_TILE.steel, `${key}tg`, { x: 0, y: bore - 0.036, z: -0.008 }));
  steel.push(Box(0.008, 0.020, 0.008, VM_TILE.steel, `${key}trig`, { x: 0, y: bore - 0.028, z: -0.004 }));
  // 击锤（外露）
  steel.push(Box(0.010, 0.024, 0.014, VM_TILE.steel, `${key}hammer`, { x: 0, y: bore + 0.032, z: 0.024, rx: -0.25 }));

  // 扫帚把握把
  wood.push(Box(0.032, 0.098, 0.048, VM_TILE.wood, `${key}grip`, { x: 0, y: bore - 0.072, z: 0.026, rx: 0.22 }));
  wood.push(Box(0.036, 0.024, 0.036, VM_TILE.wood, `${key}gripCap`, { x: 0, y: bore - 0.120, z: 0.038, rx: 0.22 }));

  // 表尺照门 + 准星
  const sightY = bore + 0.030;
  steel.push(Box(0.018, 0.014, 0.048, VM_TILE.steel, `${key}rs`, { x: 0, y: bore + 0.020, z: -0.100 }));
  steel.push(Box(0.005, 0.012, 0.006, VM_TILE.steel, `${key}fs`, { x: 0, y: sightY - 0.004, z: -0.264 }));

  const group = new THREE.Group();
  AddPart(group, MakePart(steel, materials.steel));
  AddPart(group, MakePart(wood, materials.wood));

  // 套筒（射击时后座）
  const slideGeo = [Box(0.026, 0.024, 0.090, VM_TILE.steel, `${key}slide`, { x: 0, y: bore + 0.014, z: -0.120 })];
  const bolt = MakePart(slideGeo, materials.blued, { x: 0, y: bore + 0.014, z: -0.120 });
  group.add(bolt);

  return {
    group,
    parts: { bolt, dustCover: null, bayonet: null },
    boltTravel: 0.020,
    ejectAt: new THREE.Vector3(0.014, bore + 0.026, -0.070),
    clipSeat: new THREE.Vector3(0, bore + 0.040, -0.060),
    muzzle: new THREE.Vector3(0, bore, -0.276),
    sight: new THREE.Vector3(0, sightY, -0.100),
    hands: {
      right: { x: 0.004, y: bore - 0.060, z: 0.024, rx: 0.22, ry: 0, rz: -1.52 },
      // 驳壳枪单手打是真的（敢死队近战就这么用），但双手托更稳也更好看
      left: { x: -0.030, y: bore - 0.066, z: -0.010, rx: 0.20, ry: 0.35, rz: 1.35 },
    },
    boltHandle: new THREE.Vector3(0.020, bore + 0.026, -0.078),
  };
}

/** 向一个几何桶加入一颗去柄前的铸铁弹体。 */
function AddGrenadeBody(steel, key, x = 0, y = 0, z = -0.055) {
  steel.push(Tube(0.029, 0.029, 0.090, 12, VM_TILE.steel, { x, y, z, rx: 0 }));
  // 巩式质量参差，弹体常见竖向铸造纹（不是德式那种规整滚花）
  for (let i = 0; i < 6; i += 1) {
    const a = (i / 6) * Math.PI * 2;
    steel.push(Box(0.005, 0.005, 0.086, VM_TILE.steel, `${key}rib${i}`,
      { x: x + Math.cos(a) * 0.029, y: y + Math.sin(a) * 0.029, z }));
  }
}

/** 木柄手榴弹：铸铁弹体 φ58×90 + 木柄 φ29×128，全长 220 mm（考据值）。 */
function BuildGrenadeProp(materials, key, grenadeAsset = null) {
  const imported = CloneGrenadeAsset(grenadeAsset, { firstPerson: true });
  if (imported) return imported;
  const steel = [];
  const wood = [];
  AddGrenadeBody(steel, key);
  wood.push(Tube(0.0145, 0.0145, 0.128, 10, VM_TILE.wood, { x: 0, y: 0, z: 0.054 }));
  steel.push(Tube(0.016, 0.016, 0.012, 10, VM_TILE.steel, { x: 0, y: 0, z: 0.112 }));

  const group = new THREE.Group();
  AddPart(group, MakePart(steel, materials.steel));
  AddPart(group, MakePart(wood, materials.wood));
  return group;
}

function BuildGrenade(materials, weapon, key, grenadeAsset = null) {
  const group = new THREE.Group();
  const prop = BuildGrenadeProp(materials, key, grenadeAsset);
  // 握在木柄中段，弹体朝前上方
  prop.position.set(0, 0.02, -0.02);
  prop.rotation.set(-0.35, 0, 0);
  group.add(prop);

  return {
    group,
    parts: { bolt: null, dustCover: null, bayonet: null, grenade: prop },
    boltTravel: 0,
    ejectAt: new THREE.Vector3(0, 0, 0),
    clipSeat: new THREE.Vector3(0, 0, 0),
    muzzle: new THREE.Vector3(0, 0.06, -0.10),
    sight: null,
    hands: {
      right: { x: 0.0, y: -0.008, z: 0.030, rx: 0.30, ry: 0, rz: -1.52 },
      // 左手拉火绳
      left: { x: -0.055, y: -0.030, z: 0.090, rx: 0.10, ry: 0.5, rz: 1.30 },
    },
    boltHandle: new THREE.Vector3(0, 0, 0),
  };
}

/**
 * 集束手榴弹：一枚完整木柄弹作引信，六枚去柄弹围成一圈，再用两道麻绳扎紧。
 *
 * 台儿庄的记录是「五至七枚去柄捆在一枚带柄弹周围」，因此不能只是把普通
 * 手榴弹放大；第一人称和飞行中的剪影都必须看得出是能打战车的集束。
 */
function BuildGrenadeBundle(materials, weapon, key) {
  const steel = [];
  const wood = [];
  AddGrenadeBody(steel, `${key}core`);
  wood.push(Tube(0.0145, 0.0145, 0.128, 10, VM_TILE.wood, { x: 0, y: 0, z: 0.054 }));
  steel.push(Tube(0.016, 0.016, 0.012, 10, VM_TILE.steel, { x: 0, y: 0, z: 0.112 }));
  for (let i = 0; i < 6; i += 1) {
    const a = (i / 6) * Math.PI * 2;
    AddGrenadeBody(steel, `${key}satellite${i}`, Math.cos(a) * 0.057, Math.sin(a) * 0.057, -0.055);
  }

  const group = new THREE.Group();
  AddPart(group, MakePart(steel, materials.steel));
  AddPart(group, MakePart(wood, materials.wood));
  // 两道结实的麻绳压住六颗去柄弹；用木材质比另开一套视图模型材质更稳。
  for (const z of [-0.080, -0.030]) {
    const rope = new THREE.Mesh(new THREE.TorusGeometry(0.088, 0.005, 6, 18), materials.wood);
    rope.position.z = z;
    group.add(rope);
  }
  // 七枚实际叠在一起的横向体积远大于一颗普通弹；第一人称等比缩小并后移，
  // 仍保留捆扎结构，同时不把准星与正前方目标压没。
  group.scale.setScalar(0.62);
  group.position.set(0.050, -0.030, -0.140);
  group.rotation.set(-0.35, 0, 0);

  return {
    group,
    parts: { bolt: null, dustCover: null, bayonet: null, grenade: group },
    boltTravel: 0,
    ejectAt: new THREE.Vector3(0, 0, 0),
    clipSeat: new THREE.Vector3(0, 0, 0),
    muzzle: new THREE.Vector3(0, 0.06, -0.12),
    sight: null,
    hands: {
      right: { x: 0.0, y: -0.008, z: 0.030, rx: 0.30, ry: 0, rz: -1.52 },
      left: { x: -0.075, y: -0.035, z: 0.090, rx: 0.10, ry: 0.5, rz: 1.30 },
    },
    boltHandle: new THREE.Vector3(0, 0, 0),
  };
}

/** 大刀后备几何：右侧参考型，宽刃、短吞口、带孔全茎柄。主路径读取 TZM 模型。 */
function BuildDadao(materials, weapon, key) {
  const blade = [];
  const grip = [];
  const cloth = [];

  // 刀身：从护手处 40 mm 渐宽到前段 68 mm，刀尖斜切并保留钝口。
  const segments = 5;
  const bladeLen = 0.595;
  for (let i = 0; i < segments; i += 1) {
    const t0 = i / segments;
    const width = Mix(0.040, 0.068, Math.pow(t0, 0.72));
    const segLen = bladeLen / segments;
    blade.push(Box(0.0058, width, segLen * 1.02, VM_TILE.steel, `${key}blade${i}`,
      { x: 0, y: -0.003 - i * 0.005, z: -0.115 - segLen * (i + 0.5) }));
  }
  // 斜切刀尖
  blade.push(Box(0.0052, 0.052, 0.070, VM_TILE.steel, `${key}tip`, { x: 0, y: -0.030, z: -0.740, rx: 0.30 }));
  // 刀背加厚（5—6 mm，宽厚是西北军大刀的特征，不做薄片）
  blade.push(Box(0.0075, 0.010, bladeLen, VM_TILE.steel, `${key}spine`, { x: 0, y: 0.025, z: -0.115 - bladeLen / 2 }));

  // 短吞口 + 宽全茎；Torus 与宽柄尾重叠，视觉上是一只穿孔。
  blade.push(Box(0.014, 0.055, 0.018, VM_TILE.steel, `${key}guard`, { x: 0, y: 0, z: -0.106 }));
  blade.push(Box(0.010, 0.050, 0.255, VM_TILE.steel, `${key}tang`, { x: 0, y: 0, z: 0.030 }));

  grip.push(Box(0.014, 0.040, 0.185, VM_TILE.wood, `${key}grip`, { x: 0, y: 0, z: 0.020 }));
  blade.push(new THREE.TorusGeometry(0.017, 0.005, 6, 14).rotateY(Math.PI / 2).translate(0, 0, 0.145));
  cloth.push(Box(0.016, 0.048, 0.014, VM_TILE.cloth, `${key}wrap`, { x: 0, y: 0, z: -0.092 }));

  const group = new THREE.Group();
  AddPart(group, MakePart(blade, materials.blade));
  AddPart(group, MakePart(grip, materials.grip));
  AddPart(group, MakePart(cloth, materials.redCloth));

  return {
    group,
    parts: { bolt: null, dustCover: null, bayonet: null },
    boltTravel: 0,
    ejectAt: new THREE.Vector3(0, 0, 0),
    clipSeat: new THREE.Vector3(0, 0, 0),
    muzzle: new THREE.Vector3(0, 0.01, -0.70),
    sight: null,
    hands: {
      // 双手握柄：右手在上（靠护手），左手在下（靠铁环）。
      // ry = π 与 Data_FpsArmPoses 的大刀接触轴一致：小臂要顺着刀柄往身体方向
      // 伸，不能顺着刀身伸。这条是模型读不到时的退路，两边得给同一个手位。
      right: { x: 0, y: 0, z: -0.055, rx: 0, ry: Math.PI, rz: -1.52 },
      left: { x: 0, y: 0, z: 0.055, rx: 0, ry: Math.PI, rz: 1.60 },
    },
    boltHandle: new THREE.Vector3(0, 0, 0),
  };
}

const BUILDERS = {
  ZhongZheng: BuildBoltRifle,
  HanYang: BuildBoltRifle,
  Type38: BuildBoltRifle,
  Zb26: BuildZb26,
  Mauser96: BuildMauser96,
  ServicePistol: BuildMauser96,
  Grenade: BuildGrenade,
  GrenadeBundle: BuildGrenadeBundle,
  Dadao: BuildDadao,
};

// ---------------------------------------------------------------------------
// 用 Blender 出的 TZM 模型当第一人称的枪身
//
// **哪些枪能换、哪些不能，是由模型的结构决定的，不是懒。**
// _blender 出的武器模型 joints 全是 0（见 Data_Meshes 的 MESHES 表），也就是说
// 整把枪烘成一块静态几何，拉机柄是**焊死在钢件里**的。第一人称的栓动步枪
// （中正式 / 汉阳造 / 三八式）、捷克式、驳壳枪都有一个会动的枪机：每打一发，
// bolt 这个 Group 要后拉 boltTravel、从 ejectAt 抛一枚壳出去，三八式还要滑开防尘盖。
// 换成模型 = 这些全没了，而且模型自带的那个拉机柄还会跟我们的枪机重叠成两个手柄。
// 大刀没有可动件，换过去零损失。普通手榴弹改走 Script_GrenadeAsset 的 CC-BY
// GLB（加载失败才退回 BuildGrenade 的程序化形），不能再被旧 Grenade.tzm 覆盖。
// 中正式 / 汉阳造 / 驳壳枪走导入的
// 历史枪模：剪影对了，拉栓动画暂时没有（模型 joints 仍是 0）。
const MODEL_FP = new Set([
  "Dadao",
  "ZhongZheng", "HanYang", "Type38", "Zb26", "Mauser96", "ServicePistol",
  "Type11", "Type92Hmg", "WaltherP38", "Karabiner98k", "UnidentifiedBoltActionRifle",
  "OfficerSwordSet", "RingPommelDagger", "UnidentifiedAntiaircraftGun",
]);

/** 模型里的材质名 -> 视图模型这套材质。加载器不造材质，名字得在这里落地。 */
const VM_MATERIAL_BY_MESH = {
  steel: "steel", blade: "blade", grip: "grip", dadao: "dadao", wood: "wood", accessory: "cloth", red: "redCloth",
  leather: "leather", uniform: "cloth", skin: "skin", helmet: "steel",
  accentA: "redCloth", accentB: "brass", shoe: "leather",
  lqWaltherP38: "lqWaltherP38", lqBrowningTripod: "lqBrowningTripod",
  lqUnidentifiedMunition: "lqUnidentifiedMunition", lqUnidentifiedBoltActionRifle: "lqUnidentifiedBoltActionRifle",
  lqOfficerSword: "lqOfficerSword", lqRingPommelDagger: "lqRingPommelDagger",
  lqUnidentifiedAntiaircraftMetal: "lqUnidentifiedAntiaircraftMetal", lqUnidentifiedAntiaircraftWood: "lqUnidentifiedAntiaircraftWood",
  lqLightMortar: "lqLightMortar", lqType11AmmoBox: "lqType11AmmoBox", lqType11Body: "lqType11Body",
  lqType11BodyAlt: "lqType11BodyAlt", lqType11Fore: "lqType11Fore", lqMauser96: "lqMauser96",
  lqMediumMortar: "lqMediumMortar", lqKarabiner98k: "lqKarabiner98k", lqWeaponPlain: "lqWeaponPlain",
};

// Physical iron sight repairs for source meshes whose authored mount sits above
// the actual front blade. Each post extends from its existing metal base; the
// rear has a real open notch. Both share one horizontal sight plane, so aiming
// does not depend on a HUD dot or a made-up invisible mount.
const IRON_SIGHT_REPAIRS = {
  ZhongZheng: { x: 0, y: 0.072, frontZ: -0.8355, frontBase: 0.048, rearZ: -0.2804, rearBase: 0.048 },
  HanYang: { x: 0, y: 0.072, frontZ: -0.9603, frontBase: 0.049, rearZ: -0.3506, rearBase: 0.057 },
  Type38: { x: 0, y: 0.070, frontZ: -0.9882, frontBase: 0.052, rearZ: -0.310, rearBase: 0.050 },
  Zb26: { x: -0.0234, y: 0.095, frontZ: -0.7616, frontBase: 0.060, rearZ: -0.205, rearBase: 0.061 },
  Mauser96: { x: 0, y: 0.055, frontZ: -0.2274, frontBase: 0.038, rearZ: -0.0415, rearBase: 0.043 },
  ServicePistol: { x: 0, y: 0.052, frontZ: -0.164, frontBase: 0.044, rearZ: 0.014, rearBase: 0.046 },
  WaltherP38: { x: 0, y: 0.055, frontZ: -0.161, frontBase: 0.037, rearZ: 0.021, rearBase: 0.037 },
  Karabiner98k: { x: 0, y: 0.074, frontZ: -0.8321, frontBase: 0.050, sourceCeiling: 0.060, rearZ: -0.270, rearBase: 0.049 },
  UnidentifiedBoltActionRifle: { x: 0, y: 0.074, frontZ: -0.840, frontBase: 0.046, rearZ: -0.260, rearBase: 0.036 },
  Type11: { x: 0.00145, y: 0.157, frontZ: -0.7426, frontBase: 0.102, rearZ: -0.2022, rearBase: 0.129 },
  Type92Hmg: { replaceBlade: true, x: 0, y: 0.104, frontZ: -0.5901, frontBase: 0.076, rearZ: -0.1718, rearBase: 0.080 },
};

function RepairIronSights(group, materials, key, sight) {
  const spec = IRON_SIGHT_REPAIRS[key];
  if (!spec || !sight) return null;
  const width = key === "Type11" ? 0.004 : 0.003;
  const AddPart = (name, x, y, z, sx, sy, sz) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), materials.steel);
    mesh.name = `VmIronSight_${name}`;
    mesh.position.set(x, y, z);
    group.add(mesh);
    return mesh;
  };
  const sourceFront = [];
  let sourceTop = -Infinity;
  group.traverse((mesh) => {
    if (!mesh.isMesh || !mesh.geometry?.attributes.position) return;
    const pos = mesh.geometry.attributes.position;
    for (let i = 0; i < pos.count; i += 1) {
      if (Math.abs(pos.getX(i) - spec.x) <= 0.004
        && Math.abs(pos.getZ(i) - spec.frontZ) <= 0.016
        && pos.getY(i) > spec.frontBase && pos.getY(i) < (spec.sourceCeiling || Infinity)) {
        sourceTop = Math.max(sourceTop, pos.getY(i));
        sourceFront.push({ mesh, index: i });
      }
    }
  });
  const frontMeshes = new Set();
  const topXs = sourceFront.filter(({ mesh, index }) => mesh.geometry.attributes.position.getY(index) >= sourceTop - 0.00005)
    .map(({ mesh, index }) => mesh.geometry.attributes.position.getX(index));
  const bladeCenter = topXs.length ? (Math.min(...topXs) + Math.max(...topXs)) / 2 : spec.x;
  if (!spec.replaceBlade && sourceFront.length && sourceTop > spec.frontBase + 0.001) {
    // Stretch only the authored blade above its metal foot. Private geometry
    // keeps third-person instances and their shared loader cache untouched.
    for (const { mesh, index } of sourceFront) {
      if (!frontMeshes.has(mesh)) { mesh.geometry = mesh.geometry.clone(); frontMeshes.add(mesh); }
      const pos = mesh.geometry.attributes.position;
      const heightFraction = pos.getY(index) >= sourceTop - 0.00005 ? 1
        : (pos.getY(index) - spec.frontBase) / (sourceTop - spec.frontBase);
      pos.setX(index, pos.getX(index) + (spec.x - bladeCenter) * heightFraction);
      pos.setY(index, spec.frontBase + heightFraction * (spec.y - spec.frontBase));
      pos.needsUpdate = true;
    }
    for (const mesh of frontMeshes) { mesh.geometry.computeVertexNormals(); mesh.geometry.computeBoundingBox(); mesh.geometry.computeBoundingSphere(); }
  } else {
    // Type92 has no solid central blade in the imported sight crown. Complete
    // a missing surface with a post on its metal foot.
    frontMeshes.add(AddPart("FrontBlade", spec.x, (spec.y + spec.frontBase) / 2, spec.frontZ,
      width, spec.y - spec.frontBase, 0.004));
  }
  const front = [...frontMeshes];
  // A narrow notch lets the front blade and daylight on both sides remain visible.
  const gap = 0.0045;
  const rearWidth = 0.005;
  const rear = [-1, 1].map((side) => AddPart(side < 0 ? "RearLeft" : "RearRight",
    spec.x + side * (gap + rearWidth) / 2, (spec.y + spec.rearBase) / 2,
    spec.rearZ, rearWidth, spec.y - spec.rearBase, 0.005));
  const notchDepth = 0.003;
  AddPart("RearBase", spec.x, (spec.rearBase + spec.y - notchDepth) / 2, spec.rearZ,
    gap + rearWidth * 2, spec.y - spec.rearBase - notchDepth, 0.009);
  sight.set(spec.x, spec.y, sight.z);
  return { front, rear, frontRegion: { x: spec.x, z: spec.frontZ, base: spec.frontBase } };
}

/**
 * 拿一个 TZM 文档搭第一人称的 rig。契约与 BuildBoltRifle 那几个完全一致，
 * 所以 Equip / 开镜 / 枪口焰 / 深度预算一行都不用改。读不到就返回 null，
 * 调用方退回手搭的 rig —— 少一个模型不能让人空着手。
 */
function BuildFromModel(materials, weapon, key, doc) {
  const armPose = FpsArmPose(key);
  if (!armPose) throw new Error(`缺少逐枪第一人称姿势数据：${key}`);
  const table = {};
  for (const [meshName, vmName] of Object.entries(VM_MATERIAL_BY_MESH)) {
    if (materials[vmName]) table[meshName] = materials[vmName];
  }
  let built = null;
  try {
    // Keep model-node boundaries in the first-person rig.  World actors can
    // batch by material, but this rig needs the Type 38 `adsNear` child to
    // remain independently visible so ADS can hide it without losing the
    // actual sight and barrel.
    built = InstantiateModel(doc, { materials: table, batch: false });
  } catch (error) {
    console.warn(`[Viewmodel] ${key} 模型实例化失败：${String(error).slice(0, 160)}`);
    return null;
  }
  if (!built || !built.nodes.has("muzzle")) return null;

  const group = new THREE.Group();
  group.name = `VmModel_${key}`;
  built.root.position.set(0, 0, 0);
  built.root.rotation.set(0, 0, 0);
  group.add(built.root);
  // group 还没进场景，它的 matrixWorld 就是单位阵 —— 于是挂点的 matrixWorld
  // 读出来正好是 rig 局部坐标，正是 muzzle / hands 要的那个空间。
  group.updateMatrixWorld(true);
  const Mount = (name, fallback) => {
    const node = built.nodes.get(name);
    if (!node) return fallback || null;
    return new THREE.Vector3().setFromMatrixPosition(node.matrixWorld);
  };
  const gripR = Mount("gripR", new THREE.Vector3());
  const gripL = Mount("gripL", gripR.clone());
  const sight = Mount("sight", null);
  if (key === "UnidentifiedBoltActionRifle") {
    // The imported MA1 stock is 27 mm left of the bore, and a disconnected
    // 747-triangle exhibition lever/knob survives the source object's assembled-state filter.
    // Repair only this private first-person geometry; retain the real bolt,
    // trigger, barrel and stock instead of masking the assembled gun.
    built.root.traverse((mesh) => {
      if (!mesh.isMesh || !mesh.geometry?.attributes.position) return;
      mesh.geometry = mesh.geometry.clone();
      if (mesh.name.includes("lqUnidentifiedBoltActionRifle")) {
        mesh.geometry.translate(0.027055, 0, 0);
      } else {
        const pos = mesh.geometry.attributes.position;
        const index = mesh.geometry.index;
        const retained = [];
        for (let i = 0; i < index.count; i += 3) {
          const tri = [index.getX(i), index.getX(i + 1), index.getX(i + 2)];
          // Quantized-coordinate edge analysis finds the whole display assembly
          // in three connected islands, all wholly left of x=-24 mm.  The real
          // receiver, bolt body and sights cross that boundary or remain centred.
          const exhibitionLever = tri.every((v) => pos.getX(v) < -0.024);
          if (!exhibitionLever) retained.push(...tri);
        }
        mesh.geometry.setIndex(retained);
      }
      mesh.geometry.computeBoundingBox();
      mesh.geometry.computeBoundingSphere();
    });
  }
  if (key === "Type11") {
    // Imported source was offset from its grip/bore mounts: measure the muzzle
    // ring centre, then move only the private mesh geometry back onto that frame.
    built.root.traverse((mesh) => {
      if (!mesh.isMesh || !mesh.geometry) return;
      mesh.geometry = mesh.geometry.clone();
      mesh.geometry.translate(-0.06315, -0.146, 0);
    });
  }
  if (key === "Type92Hmg") {
    // Lower the upright range ladder to its folded battle-sight position.
    built.root.traverse((mesh) => {
      if (!mesh.isMesh || !mesh.geometry?.attributes.position) return;
      mesh.geometry = mesh.geometry.clone();
      const pos = mesh.geometry.attributes.position;
      for (let i = 0; i < pos.count; i += 1) {
        if (pos.getY(i) > 0.100 && pos.getZ(i) > -0.190 && pos.getZ(i) < -0.070
          && Math.abs(pos.getX(i)) < 0.040) {
          const height = pos.getY(i) - 0.100;
          pos.setY(i, 0.084 + (pos.getZ(i) + 0.130) * 0.12);
          pos.setZ(i, -0.130 - height);
        }
      }
      pos.needsUpdate = true;
      mesh.geometry.computeVertexNormals();
      mesh.geometry.computeBoundingBox();
      mesh.geometry.computeBoundingSphere();
    });
  }
  const ironSights = RepairIronSights(group, materials, key, sight);
  const magazine = Mount("magazine", new THREE.Vector3(0, 0, -0.08));
  // Imported historical guns normally merge every steel/wood face per
  // material.  Some assets expose an `adsNear` node for the rear receiver and
  // stock: those faces cross the camera near plane once the sight is centered,
  // so retain them at hip but hide them during ADS instead of drawing a clipped
  // rectangular cross-section across the sight picture.
  const adsHide = [];
  const adsNear = built.nodes.get("adsNear");
  if (adsNear) {
    adsNear.traverse((child) => { if (child.isMesh) adsHide.push(child); });
  }
  const isBoltRifle = weapon?.kind === "boltRifle";
  // 导入枪模把整支枪合成了一个网格，没有独立 bolt joint。仍给动作层一个代理节点：
  // 它让栓动链完整跑起来（右手离开握把、抓机柄、整枪受力、抛壳），而不是枪响后
  // 只退 FOV、手和枪都不动。下次重建模型把枪机拆成 joint 时，只需把这里换成真实节点。
  const boltProxy = isBoltRifle ? new THREE.Object3D() : null;
  if (boltProxy) {
    boltProxy.name = `VmBoltProxy_${key}`;
    group.add(boltProxy);
  }
  const boltHandle = sight
    ? sight.clone().add(new THREE.Vector3(0.046, -0.010, 0.135))
    : new THREE.Vector3(0.046, 0.035, -0.04);
  const ejectAt = sight
    ? sight.clone().add(new THREE.Vector3(0.026, 0.004, 0.055))
    : new THREE.Vector3(0.026, 0.035, -0.06);
  const clipSeat = magazine.clone();
  // Box magazines enter at the grip heel; stripper clips enter above the action.
  if (!armPose.actions.reload?.handPath) clipSeat.y += 0.045;
  const hr = armPose.contacts.right;
  const hl = armPose.contacts.left;

  return {
    group,
    parts: { bolt: boltProxy, dustCover: null, bayonet: null },
    boltTravel: isBoltRifle ? 0.078 : 0,
    ejectAt,
    clipSeat,
    muzzle: Mount("muzzle", new THREE.Vector3(0, 0, -0.2)),
    // 大刀与手榴弹的模型没有 sight，仍会退化成“举到眼前”；导入枪模则必须读取
    // 已经写进 TZM 的 sight 挂点。过去这里硬编码 null，三把新枪都丢了铁瞄。
    sight,
    hands: {
      right: { x: hr.position[0], y: hr.position[1], z: hr.position[2], rx: hr.rotation[0], ry: hr.rotation[1], rz: hr.rotation[2] },
      left: { x: hl.position[0], y: hl.position[1], z: hl.position[2], rx: hl.rotation[0], ry: hl.rotation[1], rz: hl.rotation[2] },
    },
    boltHandle,
    adsHide,
    ironSights,
    source: "model",
  };
}

// 上刺刀那套动作用到的几个数（口径见 docs/Data_Bayonet.md「动画」一节）。
//
// SHEATH_HAND：左手离开护木、下探取刀那一下的手位（枪局部坐标，原点是右手握把）。
//   **不能真摆到腰上**：整副手臂是挂在枪身下面的（没有躯干可参照），把手位摆到
//   腰的高度就等于摆到相机前 20 cm —— 出图上是一只手糊满半个屏幕、腕子还被近裁面
//   切开。所以这一下只是"从护木上松开、往下沉一截"，落点仍在枪的前下方。
// BAYONET_SLIDE_Z：**左手到不了枪口，所以最后一段由刀自己走。**
//   实测这副手臂 bicep→forearm→wrist 一共 0.624 m，而枪口离左肩 1.0 m 上下。
//   试过把左肩再往枪口送（送 0.08 m 就够手摸到枪口了），代价是蒙皮把肩到大臂
//   那一段拉出一片鱼鳍横在画面左边缘 —— 这副手臂没有躯干，肩一挪就露馅。
//   于是口径定成：手推到伸得到的最前面（枪管中段），刀从那儿沿枪管滑进枪口环，
//   读起来是"手把刀往枪口一推、咔哒一声扣住"。别再去挪肩，出图会告诉你为什么。
// BAYONET_CARRY：上了刺刀之后改端"刺杀预备"（只加在腰射姿态上）。
//
//   **这一条是"上了刺刀枪却一点变化都没有"的解，而且它必须给这么大。**
//   刀是顺着枪管指出去的，而腰射时枪管几乎就顺着视线方向 —— 半米长的刀在屏幕上
//   被自己的枪管挡得一干二净。逐档量过（涂红刀件数可见像素，见 docs/Data_Bayonet.md
//   「为什么姿态要动这么大」）：腰射 1 px、开镜 0、冲刺 0、劈刺出招 0 —— 也就是说
//   在**任何**姿态下玩家都看不见自己上了刺刀。而这条曲线不是线性的，是一道坎：
//     ry 0.15→7 px，0.30→4，0.45→23，0.52→26，**0.55→91，0.60→224**
//   —— 刀身要么整条藏在枪管剪影后面，要么整条露出来，中间没有"露一半"这一档。
//   所以给不到 0.55 就等于没给。抬高枪口（rx）同理：0.20→12、0.30 配 0.55→239。
//
//   这也正是端着刺刀的兵真实的持枪法：刺杀预备是把枪斜端在身前、枪口朝左上，
//   不是端平了顺着自己的视线。**代价**是枪口离准心远了：腰射时枪口在准心左上约
//   250 px。这是自觉的取舍 —— 上不上刺刀是玩家自己按 X 决定的，
//   而开镜姿态一个数都没动（照门落屏幕正中那条恒等式还是恒等式）。
//   出招那一下（melee）会把这份姿态压掉大半，枪重新对着准心捅出去。
const SHEATH_HAND = new THREE.Vector3(0.010, -0.150, -0.470);
// 刀扣上去的最后一段行程（米，沿枪管往前滑）。
const BAYONET_SLIDE_Z = 0.145;
const BAYONET_CARRY = { px: -0.015, py: 0.016, pz: 0.035, rx: 0.275, ry: 0.575, rz: 0.100 };
// 出招时把"刺杀预备"压掉多少（0 = 完全压平）。留一点点斜度，收招回位才不生硬。
const BAYONET_CARRY_STRIKE = 0.22;

function PoseKindOf(weapon) {
  if (!weapon) return "rifle";
  if (weapon.kind === "lmg" || weapon.kind === "hmg") return "lmg";
  if (weapon.kind === "pistol") return "pistol";
  if (weapon.kind === "throwable") return "throwable";
  if (weapon.kind === "melee") return "melee";
  return "rifle";
}

// ---------------------------------------------------------------------------
// 主体
// ---------------------------------------------------------------------------

export class Viewmodel {
  /**
   * @param {MaterialLibrary} library Script_Materials 的材质库（已 Prepare）
   * @param {object} options fov 视图模型的观感 FOV；depthBudget 允许伸出眼前多少米
   */
  constructor(library, {
    fov = 55, depthBudget = 0.90, autoBolt = true, seed = "viewmodel", meshDocs = null,
    riggedAssets = null, grenadeAsset = null,
  } = {}) {
    this.library = library;
    // 解码好的 TZM 文档（ActorFactory.PreloadMeshes 已经拉过一遍，这里复用同一份，
    // 不再自己 fetch —— 同一个模型解码两次是白花的内存与开机时间）。
    this.meshDocs = meshDocs;
    this.grenadeAsset = grenadeAsset;
    this.rigSource = "box";
    this.materials = BuildMaterials(library);
    this.fov = fov;
    this.depthBudget = depthBudget;
    this.autoBolt = autoBolt;
    this.seed = seed;

    // --- 层级：每一层只负责一件事，调试时能单独关掉任意一层 ------------------
    this.root = new THREE.Group();
    // 视图模型用自己的 FOV 缩放摆在近裁面内，它的深度不是世界深度：真按它的视深
    // 写进预通道，开镜近景 DOF 会把正在瞄的枪糊掉、运动模糊按 0.2 m 的视差把枪拖花。
    //
    // 但**不能因此把它从预通道里划掉**。以前这里调 MarkNoPrepass，那只是"不换材质"，
    // 枪照样被画进 rtNormalDepth，写的是自己的光照颜色（当法线用是垃圾）——
    // Debug Rendering 的法线/视深/AO 于是要么一团噪声要么一片空洞。
    // 现在交给 Script_Post.MarkForegroundPrepass：真法线 + 常数近景深度标签。
    //
    // 只遍历 this.root 就够，但**必须在 Equip 之后调**：构造完成时树里只有抛壳池
    // 和弹夹道具，手、枪身、枪口焰要到 Equip() 里才建出来。Equip() 末尾自己会再调
    // 一次，调用方怎么调都不会漏。
    //（顺带修掉一个隐患：老写法遍历 this.materials，而那张表里的
    // `library.Get(name, {})` 是**与世界共用的同一个实例** —— 给它标上
    // allowOverride=false，世界里用同一份材质的物件会一起掉出预通道。）
    this.markForegroundPrepass = () => {
      // 同一趟顺手把第一人称树里的**外来 GLB**（手榴弹）接进材质库：它的
      // MeshStandardMaterial 是 GLTFLoader 造的，metallicFactor 缺省是 1，
      // 而且没注入 SSAO/GI 就意味着 Debug Rendering 的材质/光照组画不到它。
      // 双臂在 FpsArmRig 构造时已经接过一次，ConfigureExternalPbr 是幂等的。
      this.root.traverse((object) => {
        if (!object.isMesh || !object.userData.firstPersonExternalGlb) return;
        object.userData.firstPersonPbrSurface = true;
        library?.ConfigureExternalPbr?.(object.material, { metalness: 0, minRoughness: 0.55 });
      });
      return MarkForegroundPrepass(this.root);
    };
    this.root.name = "Viewmodel";
    // 自由瞄准那一段偏移就画在 root 自己身上（原点＝相机原点，绕它转 θ
    // 等于整把枪在画面里挪过 θ 个视场角）。它必须在 fovRig **之上**：
    // fovRig 带一个非等比的深度压缩，转在它下面会把枪拧变形；
    // 而 MuzzleWorld / 抛壳都是走 root 的 world<->local 往返，挂在 root 上
    // 它们自动跟着偏 —— 枪口焰、弹壳、弹着点这才是同一个方向。
    this.fovRig = new THREE.Group();           // FOV 伪造 + 深度压缩（非等比缩放）
    this.swayPivot = new THREE.Group();        // 鼠标摇摆（滞后 + 过冲）
    this.bobPivot = new THREE.Group();         // 步伐晃动
    this.statePivot = new THREE.Group();       // 落地 / 腾空 / 掏枪 / 蹲
    this.actionPivot = new THREE.Group();      // 拉栓 / 突刺 / 投弹的整枪位移
    this.recoilPivot = new THREE.Group();      // 后坐
    this.weaponMount = new THREE.Group();      // 腰射↔开镜↔冲刺的姿态插值
    // Reload is articulated around the hand still supporting the gun, below
    // its holding pose. The camera-origin action layer would orbit the entire
    // gun and both shoulders left when yawing to expose the loading port.
    this.reloadPivot = new THREE.Group();
    this.reloadPivot.name = "ReloadSupportPivot";
    this.reloadAnchor = new THREE.Vector3();
    // 绕**握把**转的那一层。上面每一层的原点都在相机原点，绕它们转只会把武器
    // 整个平移过屏幕、朝向几乎不变 —— 那是"端着枪走位"，不是"抡刀"。
    // 挥刀要的是刀身自己绕手转过一百多度，只有原点落在握把上的这一层能做到
    // （weaponMount 的原点就是 rig 的原点，也就是模型规范里的右手握持点）。
    this.swingPivot = new THREE.Group();
    // 导入手臂的挂点。**它挂在 recoilPivot 上，不挂在枪上**：肩膀属于人，
    // 不属于武器。挂在武器下面的那一版里，肩要跟着腰射/开镜/冲刺/挥砍的每一次
    // 姿态旋转一起转 —— 大刀的腰射姿态绕刀身自转 88°，整副手臂就跟着侧翻到
    // 画面正中糊成一坨（玩家报的"持刀的手完全坏了"）。挂在这一层，手臂照样跟着
    // 摇摆/步伐/落地/后坐一起动，但武器自己怎么摆都不再牵动肩。
    // 手仍然严格扣在枪上：那是 FpsArmRig 用 IK 追 handRight/handLeft 做到的。
    this.armAnchor = new THREE.Group();
    this.armAnchor.name = "ArmAnchor";
    this.root.add(this.fovRig);
    this.fovRig.add(this.swayPivot);
    this.swayPivot.add(this.bobPivot);
    this.bobPivot.add(this.statePivot);
    this.statePivot.add(this.actionPivot);
    this.actionPivot.add(this.recoilPivot);
    this.recoilPivot.add(this.weaponMount);
    this.recoilPivot.add(this.armAnchor);
    this.weaponMount.add(this.reloadPivot);
    this.reloadPivot.add(this.swingPivot);

    // --- 弹簧 ---------------------------------------------------------------
    // 阻尼比 0.42：明显欠阻尼，鼠标停下后枪还会甩过去一点再回来 —— 这就是"重量"
    this.swayYaw = new Spring(115, 0.42);
    this.swayPitch = new Spring(115, 0.42);
    this.swayRoll = new Spring(80, 0.55);
    // 开镜带一点点过冲（0.72 阻尼比），到位那一下有"顿"感；再低就晃得看不清准星
    this.adsSpring = new Spring(240, 0.72);
    this.sprintSpring = new Spring(90, 0.95);
    // 白刃期间把冲刺姿态"静音"的权重（0 = 冲刺姿态照常，1 = 完全按腰射姿态挥）。
    // 它不是弹簧：这条曲线不许过冲，过冲会让刀在收招时越过腰射姿态弹一下。见 Update。
    this.meleeSprintMute = 0;
    this.landSpring = new Spring(150, 0.38);
    this.crouchSpring = new Spring(110, 0.9);
    this.equipSpring = new Spring(90, 0.85, 1);
    this.recoilKick = SpringFromRecover(0.4);
    this.recoilRise = SpringFromRecover(0.4);
    this.recoilPitchSpring = SpringFromRecover(0.4);
    this.recoilYawSpring = SpringFromRecover(0.4);

    // --- 状态 ---------------------------------------------------------------
    this.weaponId = null;
    this.weapon = null;
    this.rig = null;
    this.action = null;
    // 刺刀是否装在枪上。逻辑归 Main 的 state 管，这里只是渲染侧镜像：
    // Equip 重建 rig 后靠它恢复可见性，深度预算也按它给刀身留量。
    this.bayonetFixed = false;
    // 刀件的静止变换（装上之后它就该老实待在枪口环上）。装/卸动画会把它拿到
    // 左手上走一段，每帧归位靠这一份，见 _ResetAnimatedParts。
    this.bayonetHome = null;
    // 上刺刀持枪姿态的权重（0 没刀 / 1 上着刀）。用指数逼近而不是弹簧：
    // 这条曲线不许过冲，过冲会让枪在装完那一下往回甩一眼可见的一下。
    this.bayonetCarry = 0;
    this.carryOverride = null;   // 装/卸动画期间由 _AnimFixBayonet 每帧写
    this.adsSuppress = 1;      // 拉栓/装填时枪离开瞄准线的程度，相机 FOV 也读它
    this.bobPhase = 0;
    this.elapsed = 0;
    this.shotIndex = 0;
    this.boltOpen = false;
    this.pendingHoldOpen = false;
    this.pendingBoltAt = -1;
    this.muzzleAnchor = null;
    this.prevGrounded = true;
    this.airTime = 0;
    this.compensation = new THREE.Vector3(1, 1, 1);
    this.worldFovBase = 0;
    // 开镜时要藏掉的部件（见 _CollectAdsHideParts）。带迟滞，别在阈值上抖。
    this.adsHideParts = [];
    this.adsHidden = false;
    this.adsOffset = new THREE.Vector3();      // 满开镜照门中心误差（必须恒为零），取证用
    this.ironSightOffsetOverride = null;       // 编辑器临时覆盖（900p 基准像素）
    this.cameraKick = new THREE.Vector2();
    this.cameraKickTaken = new THREE.Vector2();

    /** 回调钩子：调用方拿去生成世界里的枪焰光、烟、弹道、抛出的手榴弹实体。 */
    this.onFire = null;
    this.onEject = null;
    this.onThrowRelease = null;
    this.onActionEnd = null;

    // --- 手 -----------------------------------------------------------------
    this.handRight = MakeHand(this.materials, 1, "hr");
    this.handLeft = MakeHand(this.materials, -1, "hl");
    this.riggedArms = null;
    this.body = riggedAssets?.fpsBody ? new FirstPersonBody(riggedAssets.fpsBody, library) : null;
    if (riggedAssets && riggedAssets.fpsArms) {
      try {
        // 第二参是**材质库**，不是本地材质表：GLB 自带的 MeshStandardMaterial 要走
        // ConfigureExternalPbr 才能接进 SSAO/GI 注入链与 Debug Rendering 的假彩色
        //（以前这里传 this.materials，签名根本不收，等于什么都没接）。
        this.riggedArms = new FpsArmRig(riggedAssets.fpsArms, library);
      } catch (error) {
        console.warn(`[Viewmodel] FPS 手臂实例化失败，退回旧手模：${String(error).slice(0, 180)}`);
      }
    }
    this.handBase = { right: new THREE.Vector3(), left: new THREE.Vector3() };
    this.handBaseRot = { right: new THREE.Euler(), left: new THREE.Euler() };
    this.gripContactRight = new THREE.Object3D();
    this.gripContactRight.name = "FpsGripContactRight";
    this.gripContactLeft = new THREE.Object3D();
    this.gripContactLeft.name = "FpsGripContactLeft";
    this.armPose = null;
    this.actionSpec = null;
    // 小臂挂 armAnchor（相机稳定层），不挂枪 —— 理由同 armAnchor 那段抬头：
    // 肩肘属于人，武器怎么摆都不该牵着它转。导入整臂启用时这两条让位给它。
    this.sleeveRight = MakeSleeve(this.materials, 1);
    this.sleeveLeft = MakeSleeve(this.materials, -1);
    // 骨骼双臂在跑时这两条只作隐藏动画靶；Attach 在网格层永久藏住它们，冲刺也
    // 不再闪切第二套手。GLB/骨链读取失败时 riggedArms 不构造，才显示这条兜底。
    this.armAnchor.add(this.sleeveRight.group);
    this.armAnchor.add(this.sleeveLeft.group);
    this._sleeveTmp = { a: new THREE.Vector3(), b: new THREE.Vector3(), q: new THREE.Quaternion() };

    // --- 枪口焰 -------------------------------------------------------------
    this.flash = this._BuildFlash();
    this.flashTime = 999;

    // --- 抛壳 / 抛桥夹的小道具池 ---------------------------------------------
    this.debris = this._BuildDebrisPool(6);

    // --- 手榴弹（副手投弹用，平时藏着）---------------------------------------
    this.offhandGrenade = BuildGrenadeProp(this.materials, "offhand", this.grenadeAsset);
    this.offhandGrenade.visible = false;
    this.handLeft.group.add(this.offhandGrenade);
    this.offhandGrenade.position.set(0, 0.01, 0.0);
    this.offhandGrenade.rotation.set(-0.4, 0, 0);

    // --- 桥夹道具（装填用）---------------------------------------------------
    this.clipProp = this._BuildClipProp();
    this.clipProp.visible = false;
    this.reloadPivot.add(this.clipProp);

    this._geometries = new Set();
    this._tmpVec = new THREE.Vector3();
    this._tmpVec2 = new THREE.Vector3();
    this._tmpVec3 = new THREE.Vector3();
    this._tmpQuat = new THREE.Quaternion();
  }

  // -------------------------------------------------------------------------
  // 构建辅助
  // -------------------------------------------------------------------------

  /**
   * 枪口焰：三片交叉薄片（星芒）+ 一个短锥。自发光，不放实光源 —— 实光源交给
   * 调用方的 LightRig.AddFire 之类去做，视图模型自己点灯会把整条阴影链子拖垮。
   * 三片合并成一个网格：这东西一帧最多亮 45 ms，不值得占三个 draw call。
   */
  _BuildFlash() {
    const group = new THREE.Group();
    const petals = [];
    for (let i = 0; i < 3; i += 1) {
      const petal = new THREE.PlaneGeometry(0.20, 0.085);
      petal.rotateY(Math.PI / 2);
      petal.rotateZ((i / 3) * Math.PI);
      petals.push(petal);
    }
    const cone = new THREE.ConeGeometry(0.030, 0.10, 8, 1, true);
    cone.rotateX(-Math.PI / 2);
    cone.translate(0, 0, -0.05);
    petals.push(cone);
    const mesh = new THREE.Mesh(MergeGeometries(petals), this.materials.flash);
    mesh.frustumCulled = false;
    mesh.castShadow = false;
    group.add(mesh);
    group.visible = false;
    return group;
  }

  /** 抛壳/抛桥夹的小道具：共用一个池子，最多同时 6 个飞在画面里。 */
  _BuildDebrisPool(count) {
    const pool = [];
    const shellGeometry = new THREE.CylinderGeometry(0.0040, 0.0046, 0.057, 6, 1);
    shellGeometry.rotateX(Math.PI / 2);
    for (let i = 0; i < count; i += 1) {
      const mesh = new THREE.Mesh(shellGeometry, this.materials.brass);
      mesh.visible = false;
      mesh.frustumCulled = false;
      mesh.castShadow = false;
      // 打个标：调用方（和景深自检）要能把飞出去的壳从"视图模型本体"里摘出去
      mesh.userData.debris = true;
      this.root.add(mesh);
      pool.push({
        mesh, alive: 0, life: 0,
        velocity: new THREE.Vector3(), spin: new THREE.Vector3(),
      });
    }
    return pool;
  }

  /**
   * 5 发桥夹：一条钢夹 + 并排 5 发弹。压弹时弹头整体下沉、空夹被抽走。
   * 弹头轴向必须沿 -Z（枪膛方向）—— 装填时是"顺着枪管压进去"，
   * 早先我把它们做成竖着的，一插进导槽就成了五根立着的柱子，一眼假。
   * 五发合并成一个网格：它们是一起动的，没必要各占一个 draw call。
   */
  _BuildClipProp() {
    const group = new THREE.Group();
    const clipBody = new THREE.Mesh(
      Box(0.062, 0.011, 0.016, VM_TILE.steel, "clipBody", { x: 0, y: 0, z: 0.010 }),
      this.materials.blued);
    clipBody.frustumCulled = false;

    const roundGeometries = [];
    for (let i = 0; i < 5; i += 1) {
      const x = (i - 2) * 0.0115;
      roundGeometries.push(Tube(0.0044, 0.0046, 0.048, 6, VM_TILE.steel, { x, y: 0.014, z: 0 }));
      // 弹尖朝 -Z：Tube 的 rTop 对应 +Z 端，所以尖头要放在 rBottom 上
      roundGeometries.push(Tube(0.0044, 0.0006, 0.020, 6, VM_TILE.steel, { x, y: 0.014, z: -0.034 }));
    }
    const rounds = new THREE.Mesh(MergeGeometries(roundGeometries), this.materials.brass);
    rounds.frustumCulled = false;

    group.add(clipBody);
    group.add(rounds);
    group.userData.rounds = rounds;
    group.userData.body = clipBody;
    return group;
  }

  // -------------------------------------------------------------------------
  // 装备
  // -------------------------------------------------------------------------

  /** @param {string|null} weaponId Data_Weapons.WEAPONS 的 id；null = 空手 */
  Equip(weaponId, variant = 0) {
    this._ClearRig();
    this.ironSightOffsetOverride = null;
    this.weaponId = weaponId || null;
    this.weaponVariant = Number.isInteger(variant) && variant > 0 ? variant : 0;
    this.weapon = weaponId ? WEAPONS[weaponId] || null : null;
    this.action = null;
    this.carryOverride = null;
    this.bayonetCarry = this.bayonetFixed && this.weapon?.bayonet ? 1 : 0;
    this.boltOpen = false;
    this.pendingHoldOpen = false;
    this.flashTime = 999;
    this.flash.visible = false;
    this.clipProp.visible = false;
    this.offhandGrenade.visible = false;
    if (!this.weapon) {
      this.rig = null;
      this.equipSpring.Set(1);
      this.compensation.set(1, 1, 1);
      this.fovRig.scale.set(1, 1, 1);
      for (const pivot of [this.weaponMount, this.reloadPivot, this.swingPivot, this.actionPivot]) {
        pivot.position.set(0, 0, 0); pivot.quaternion.identity();
      }
      this.armAnchor.add(this.handRight.group, this.handLeft.group, this.gripContactRight, this.gripContactLeft);
      this._UpdateUnarmedHands(0, 0, 0);
      this.riggedArms?.Attach(this.armAnchor, this.handRight.group, this.handLeft.group,
        this.gripContactRight, this.gripContactLeft,
        [this.handRight, this.handLeft, this.sleeveRight, this.sleeveLeft], null);
      this.markForegroundPrepass();
      return this;
    }

    // 先试 TZM 模型（MODEL_FP 里的几把），读不到或没登记就退回手搭 rig。
    // 所有可持枪械优先走 TZM：三八式防尘盖、捷克式上插直匣等识别细节已在模型里。
    const meshId = MODEL_FP.has(weaponId) ? WeaponMeshId(weaponId, this.weaponVariant) : null;
    const doc = meshId && this.meshDocs ? this.meshDocs.get(meshId) : null;
    this.rig = doc ? BuildFromModel(this.materials, this.weapon, weaponId, doc) : null;
    if (!this.rig) {
      const builder = BUILDERS[weaponId] || BuildBoltRifle;
      this.rig = builder(this.materials, this.weapon, weaponId, this.grenadeAsset);
    }
    this.armPose = FpsArmPose(weaponId);
    if (!this.armPose) throw new Error(`缺少逐枪第一人称姿势数据：${weaponId}`);
    this.actionSpec = this.armPose.actions;
    for (const [side, contact] of Object.entries(this.armPose.contacts)) {
      this.rig.hands[side] = {
        x: contact.position[0], y: contact.position[1], z: contact.position[2],
        rx: contact.rotation[0], ry: contact.rotation[1], rz: contact.rotation[2],
      };
    }
    this.rigSource = this.rig.source === "model" ? "model" : "box";
    this.swingPivot.add(this.rig.group);
    this.rig.group.add(this.handRight.group);
    this.rig.group.add(this.handLeft.group);

    // 手位：hands 里给的就是"握持点在武器局部的位置"，直接赋值即可
    const hr = this.rig.hands.right;
    const hl = this.rig.hands.left;
    this.handRight.group.position.set(hr.x, hr.y, hr.z);
    this.handRight.group.rotation.set(hr.rx, hr.ry, hr.rz, "YXZ");
    this.handLeft.group.position.set(hl.x, hl.y, hl.z);
    this.handLeft.group.rotation.set(hl.rx, hl.ry, hl.rz, "YXZ");
    this.handBase.right.copy(this.handRight.group.position);
    this.handBase.left.copy(this.handLeft.group.position);
    this.handBaseRot.right.copy(this.handRight.group.rotation);
    this.handBaseRot.left.copy(this.handLeft.group.rotation);
    this.gripContactRight.position.copy(this.handBase.right);
    this.gripContactRight.rotation.copy(this.handBaseRot.right);
    this.gripContactLeft.position.copy(this.handBase.left);
    this.gripContactLeft.rotation.copy(this.handBaseRot.left);
    this.rig.group.add(this.gripContactRight, this.gripContactLeft);

    // 骨骼双臂用两骨 IK 追随上面两只旧手的握持坐标系。旧手只当隐藏动画靶，既有
    // 每把枪的拉栓/压桥夹/换匣/投弹轨迹因此可以原样复用；真实 Hand 骨和十指负责
    // 最终位置、朝向与轮廓，不再拿一个静态手掌网格中心去“差不多贴上”。
    // 挂点给的是 armAnchor（相机稳定）而不是 rig.group，理由见 armAnchor 那段抬头。
    if (this.riggedArms) {
      this.riggedArms.Attach(this.armAnchor, this.handRight.group, this.handLeft.group,
        this.gripContactRight, this.gripContactLeft,
        [this.handRight, this.handLeft, this.sleeveRight, this.sleeveLeft], weaponId);
      this.rigSource = `${this.rigSource}+riggedArms`;
    }

    // 枪口焰锚点
    this.muzzleAnchor = new THREE.Object3D();
    this.muzzleAnchor.position.copy(this.rig.muzzle);
    this.rig.group.add(this.muzzleAnchor);
    this.muzzleAnchor.add(this.flash);

    // 后坐弹簧按这支枪的 recoverS 重建（栓动枪回位慢而重，捷克式快而碎）
    const recover = (this.weapon.recoil && this.weapon.recoil.recoverS) || 0.4;
    this.recoilKick = SpringFromRecover(recover, 0.58);
    this.recoilRise = SpringFromRecover(recover, 0.55);
    this.recoilPitchSpring = SpringFromRecover(recover, 0.52);
    this.recoilYawSpring = SpringFromRecover(recover * 1.2, 0.6);

    // 上刺刀：独立的 Bayonet*.tzm 按 socket 挂点扣到枪口。手搭兜底 rig 自带
    // 盒状刺刀件（parts.bayonet 非空）就不重复挂；导入枪模默认没有（BuildFromModel
    // 里 bayonet: null），从这里补上真模型。
    if (!this.rig.parts.bayonet && this.weapon.bayonet) {
      const prop = this._BuildBayonetProp(weaponId);
      if (prop) {
        this.rig.group.add(prop);
        this.rig.parts.bayonet = prop;
      }
    }
    // 刺刀可见性跟着装配状态走（换枪重建 rig，可见性得重新种一遍）
    if (this.rig.parts.bayonet) {
      this.rig.parts.bayonet.visible = this.bayonetFixed && !!this.weapon.bayonet;
      this.bayonetHome = {
        position: this.rig.parts.bayonet.position.clone(),
        rotation: this.rig.parts.bayonet.rotation.clone(),
      };
    } else {
      this.bayonetHome = null;
    }

    // 姿态表
    const kind = PoseKindOf(this.weapon);
    this.hipPose = this._PoseFromSpec(this.armPose.hip.weapon);
    this.adsPose = this._MakeAdsPose(kind, this.armPose.ads.weapon);
    this.sprintPose = this._PoseFromSpec(this.armPose.sprint.weapon);

    this._CollectAdsHideParts();

    // 深度预算：整体等比缩 s（画面不变，但枪不再插墙）
    this._RecomputeCompensation(60);

    // 掏枪动画
    this.equipSpring.Set(0);
    // 每次换枪都会重建整棵 rig：新建出来的网格必须重新接进前景预通道口径。
    // 漏了的后果不是“预通道多画一遍”那么轻：枪把自己 0.1—0.9 m 的真实深度
    // 写进法线深度图，SSAO 就在枪所在的那块屏幕区域算出几乎全遮蔽，
    // 而枪自己的材质又正好采样那张图（MaterialLibrary 给每份材质都注了 SSAO）——
    // 于是整支枪的间接光被乘成 0，画面下方就是一坨黑。
    // 常数近景深度标签正是冲这件事去的（见 Script_Post.FOREGROUND_VIEW_DEPTH）。
    if (this.markForegroundPrepass) this.markForegroundPrepass();
    return this;
  }

  /**
   * 收集"开镜时必须藏掉"的部件。
   *
   * 为什么需要这个：开镜姿态的数学本身是**对的** —— 实测 ads=1 时照门落在相机空间
   * (−0.5 mm, −0.3 mm, −141 mm)，正中且共轴。挡住画面的是几何跨过近裁面：
   * 相机就架在握持点后面 14 cm，而右小臂的袖口（cuffA/cuffB/fore 三块）在
   * rig 局部 z ∈ [−0.218, −0.042]，也就是横跨眼位、在相机前 6.6 cm 处被 near=0.06
   * 切开 —— 出图上就是画面正中下方那一大团橙色。右手掌本身更是整个落在相机**后面**，
   * 一个像素都用不上，白占两个 draw call。
   *
   * 为什么不用"包围盒 max.z 大于阈值就藏"那种通用规则：rig 的木件/钢件各自是一个
   * **合并网格**（护木 + 上护盖 + 枪颈 + 枪托合成一块），包围盒 max.z 是枪托底板，
   * 按那个规则会把整支枪连照门准星一起藏掉。所以这里按"角色"点名，不按包围盒。
   *
   * 只在有照门的武器上生效：大刀/手榴弹的"开镜"是个举到眼前的预备姿势，
   * 右手是主体，藏了就是一把悬空的刀。
   */
  _CollectAdsHideParts() {
    this._RestoreAdsHideParts();
    this.adsHideParts = [];
    if (!this.rig || !this.rig.sight) return;
    // 导入整臂启用时，旧手模只是 IK 动画靶，不能再交给 ADS 显隐逻辑。
    // 旧代码把它塞进 adsHideParts 后，_RestoreAdsHideParts 会把 Attach() 刚藏掉的
    // 旧手重新打开，结果腰射时新旧两套手同时在画。兜底只在骨骼 rig 构造失败时启用。
    if (!this.riggedArms) {
      for (const mesh of this.handRight.meshes) this.adsHideParts.push(mesh);
      // 右手藏了袖子也得藏，否则开镜时机匣旁边还挂着半截空袖管
      for (const mesh of this.sleeveRight.meshes) this.adsHideParts.push(mesh);
    }
    // rig 自己报的那一份（枪身上落在眼后 / 近裁面死区里的零件）。
    // 由建 rig 的那个函数点名，因为只有它知道哪块料是机匣、哪块是枪托 ——
    // 这里拿包围盒猜必然连照门一起藏掉。
    if (Array.isArray(this.rig.adsHide)) {
      for (const mesh of this.rig.adsHide) if (mesh) this.adsHideParts.push(mesh);
    }
  }

  /** 把藏起来的部件放回来（换枪、腰射时都要走一趟，不然枪换了手还是隐形的）。 */
  _RestoreAdsHideParts() {
    for (const mesh of this.adsHideParts) mesh.visible = true;
    this.adsHidden = false;
  }

  /**
   * 开镜姿态。核心要求：**照门必须落在画面正中**。
   * 所以位置是解出来的（rigPos = 目标点 - 照门局部坐标），不是手调的。
   * 没有照门的武器（大刀、手榴弹）退化成一个"举到眼前"的准备姿态。
   */
  _PoseFromSpec(spec) {
    if (!spec || spec.mode !== "fixed") return null;
    return {
      px: spec.position[0], py: spec.position[1], pz: spec.position[2],
      rx: spec.rotation[0], ry: spec.rotation[1], rz: spec.rotation[2],
    };
  }

  _MakeAdsPose(kind, spec = this.armPose?.ads?.weapon) {
    if (spec?.mode === "fixed") {
      this.adsOffset.set(0, 0, 0);
      return this._PoseFromSpec(spec);
    }
    if (!this.rig || !this.rig.sight) {
      throw new Error(`${this.weaponId || kind} 的 ADS 姿势要求 sight，但模型没有 sight`);
    }
    const s = this.rig.sight;
    // 正常玩法没有 override，照门仍严格解到相机中心。编辑器可临时把枪挪开，
    // 用红色弹道中心反查模型在实际 ADS FOV 下应当修多少。
    const offset = this.ironSightOffsetOverride || { x: 0, y: 0 };
    this.adsOffset.set(
      offset.x * SIGHT_CALIBRATION_PER_PX,
      offset.y * SIGHT_CALIBRATION_PER_PX,
      0);
    return {
      px: -s.x + this.adsOffset.x + (spec?.offset?.[0] || 0),
      py: -s.y + this.adsOffset.y + (spec?.offset?.[1] || 0),
      pz: -(spec?.eyeDistance ?? SIGHT_EYE_DISTANCE) - s.z + (spec?.offset?.[2] || 0),
      rx: spec?.rotation?.[0] || 0, ry: spec?.rotation?.[1] || 0, rz: spec?.rotation?.[2] || 0,
    };
  }

  /** 当前编辑器临时偏移；正常玩法与未选中的枪一律是零。 */
  GetIronSightOffsetPixels(weaponId = this.weaponId) {
    if (weaponId !== this.weaponId || !this.ironSightOffsetOverride) return { x: 0, y: 0 };
    return { x: this.ironSightOffsetOverride.x, y: this.ironSightOffsetOverride.y };
  }

  /** 实时移动开镜铁瞄；不写存档、不改变标准 FPS 的默认零偏心。 */
  SetIronSightOffsetPixels(x, y) {
    if (!this.weapon || !this.rig || !this.rig.sight) return false;
    const ClampPixel = (value) => Math.max(-32, Math.min(32, Number(value) || 0));
    this.ironSightOffsetOverride = { x: ClampPixel(x), y: ClampPixel(y) };
    this.adsPose = this._MakeAdsPose(PoseKindOf(this.weapon), this.armPose?.ads?.weapon);
    return true;
  }

  /** 清除编辑器临时值，恢复照门与屏幕中心严格共轴。 */
  ResetIronSightOffsetPixels() {
    this.ironSightOffsetOverride = null;
    if (this.weapon && this.rig) this.adsPose = this._MakeAdsPose(PoseKindOf(this.weapon), this.armPose?.ads?.weapon);
    return { x: 0, y: 0 };
  }

  /**
   * 求整体缩放：让最深的部件落在 depthBudget 内。
   * 绕相机原点的等比缩放不改变画面，所以这一步是"白拿"的防穿墙。
   */
  _RecomputeCompensation(worldFov) {
    const stretch = this._DepthStretch(worldFov);
    let deepest = 0.35;
    if (this.rig) {
      // 最深点 = 腰射姿态下的枪口（开镜时枪会往回收，只会更浅）
      deepest = Math.abs(this.hipPose.pz + this.rig.muzzle.z) + 0.04;
      if (this.rig.parts.bayonet) {
        // 上了刺刀整支枪长出一截刀身，深度预算得把它算进去（否则刀尖天天插墙）；
        // 没上时只留 2 cm 余量给动作里的亮刀瞬间
        deepest += this.bayonetFixed && this.weapon?.bayonet
          ? (this.weapon.bayonetLengthM || 0.4) * 0.85
          : 0.02;
      }
    }
    const scale = Clamp(this.depthBudget / Math.max(0.2, deepest * stretch), 0.55, 1.0);
    this.compensation.set(scale, scale, scale * stretch);
    this.fovRig.scale.copy(this.compensation);
  }

  /**
   * 深度拉伸倍率 = 1/k，k = tan(fovVm/2)/tan(fovWorld/2)。
   * 开镜时调用方会把世界 FOV 收窄，如果这里还按固定 fovVm 算，
   * 拉伸倍率会反向变化、正好抵消掉那次缩放 —— 结果是"开了镜准星却没变大"。
   * 所以视图模型 FOV 要按世界 FOV 的**比例**跟着收。
   */
  _DepthStretch(worldFov) {
    if (!worldFov || worldFov <= 1) return 1;
    if (!this.worldFovBase) this.worldFovBase = worldFov;
    const vmFov = Clamp(this.fov * (worldFov / this.worldFovBase), 8, 120);
    const k = Math.tan(vmFov * 0.5 * DEG) / Math.tan(worldFov * 0.5 * DEG);
    return Clamp(1 / Math.max(0.2, k), 0.7, 1.45);
  }

  /**
   * 实例化这支枪的刺刀模型（Bayonet*.tzm），按 socket 挂点摆到枪口上。
   * socket 是枪口环中心：环套住枪口（再往后坐 12 mm，环箍贴枪口帽），
   * 刃沿枪管前伸、柄贴护木下的刺刀座 —— 三个关系一次到位，不用逐枪调表。
   */
  _BuildBayonetProp(weaponId) {
    const meshId = BAYONET_MESH_BY_WEAPON[weaponId];
    const doc = meshId && this.meshDocs ? this.meshDocs.get(meshId) : null;
    if (!doc || !this.rig || !this.rig.muzzle) return null;
    const table = {};
    for (const [meshName, vmName] of Object.entries(VM_MATERIAL_BY_MESH)) {
      if (this.materials[vmName]) table[meshName] = this.materials[vmName];
    }
    let built = null;
    try {
      built = InstantiateModel(doc, { materials: table, batch: false });
    } catch (error) {
      console.warn(`[Viewmodel] ${meshId} 实例化失败：${String(error).slice(0, 160)}`);
      return null;
    }
    const group = new THREE.Group();
    group.name = `VmBayonet_${weaponId}`;
    group.add(built.root);
    group.updateMatrixWorld(true);
    const socketNode = built.nodes.get("socket");
    const socket = socketNode
      ? new THREE.Vector3().setFromMatrixPosition(socketNode.matrixWorld)
      : new THREE.Vector3();
    const muzzle = this.rig.muzzle;
    group.position.set(muzzle.x - socket.x, muzzle.y - socket.y,
      muzzle.z - socket.z + 0.012);
    return group;
  }

  _ClearRig() {
    if (this.riggedArms) this.riggedArms.Detach();
    if (this.muzzleAnchor) {
      this.muzzleAnchor.remove(this.flash);
      this.muzzleAnchor = null;
    }
    if (this.rig) {
      this.rig.group.remove(this.handRight.group);
      this.rig.group.remove(this.handLeft.group);
      this.swingPivot.remove(this.rig.group);
      this.rig.group.traverse((node) => {
        if (node.isMesh && node.geometry) node.geometry.dispose();
      });
      this.rig = null;
    }
    this.handRight.group.removeFromParent(); this.handLeft.group.removeFromParent();
    this.gripContactRight.removeFromParent(); this.gripContactLeft.removeFromParent();
  }

  // -------------------------------------------------------------------------
  // 触发
  // -------------------------------------------------------------------------

  /** 开火：后坐冲量 + 枪焰 + 抛壳（自动武器）。返回枪口世界位置，方便直接生成弹道。 */
  TriggerFire() {
    if (!this.weapon || !this.rig) return null;
    // 大刀和手榴弹没有"开火"。不挡住的话大刀会喷枪焰，这种 bug 一上截图就要返工
    if (this.weapon.kind === "melee" || this.weapon.kind === "throwable") return null;
    this.shotIndex += 1;
    const recoil = this.weapon.recoil || { pitch: 2.0, yaw: 0.4, kick: 0.03 };
    // 每一发的偏航从"第几发"派生：确定性，但连发时不会两发一样
    const rnd = Mulberry32(HashString(`${this.seed}:shot:${this.shotIndex}`));
    const yawSign = rnd() < 0.5 ? -1 : 1;
    const yawAmount = recoil.yaw * DEG * (0.45 + rnd() * 0.9) * yawSign;
    // 开镜时抵肩更实，后坐观感减到六成（真实原因是身体姿态，这里用一个系数糊过去）
    //
    // 【2026-08-20 拆成两个系数】原来这一个 adsScale 同时乘在**枪**和**相机**上。
    // 战地压的只有瞄准：DICE 的原话是把后坐支点挪到照门，"so we don't mess with
    // the players aim" —— 压的是准星被顶走多少，枪该怎么跳还怎么跳。
    // 一起压的后果是开镜之后连枪的视觉后坐都缩水，那正是「开镜之后这枪没劲了」的来源。
    //
    // 顺带修一处比例反了的地方：实测相机峰值 1.595°、枪 1.489°，相机比枪还大 7%。
    // 战地是相机小、枪大。相机侧从 0.55 收到 0.46，枪侧不动 ——
    // 改完相机/枪 ≈ 0.89，枪重新变成画面上跳得最凶的那个东西。
    const adsAim = Mix(1.0, 0.6, Clamp01(this.adsSpring.value));   // 只压准星
    const adsGun = 1;                                              // 枪自己该跳多少就跳多少

    this.recoilKick.Impulse(recoil.kick * adsGun);
    this.recoilRise.Impulse(recoil.kick * 0.35 * adsGun);
    this.recoilPitchSpring.Impulse(recoil.pitch * DEG * adsGun);
    this.recoilYawSpring.Impulse(yawAmount * adsGun);

    // 相机踢动交给调用方（视图模型自己转是不够的，准星必须真的被顶上去）
    this.cameraKick.x += recoil.pitch * DEG * 0.46 * adsAim;
    this.cameraKick.y += yawAmount * 0.5 * adsAim;

    // 枪焰：旋转按发数派生，连发时每一发的形状不同
    this.flashTime = 0;
    this.flash.rotation.z = rnd() * Math.PI * 2;
    const size = Mix(0.85, 1.25, rnd());
    this.flash.scale.set(size, size, size);
    this.flash.visible = true;

    // 半自动/全自动当场抛壳；栓动枪的壳是拉栓时才出来的
    if (this.weapon.kind !== "boltRifle") this._SpawnShell(rnd);

    if (this.weapon.kind === "boltRifle" && this.autoBolt) {
      // 打完这一发自动上膛。最后一发（lowAmmo）时栓停在后面不推回 —— 玩家一眼看见"没子弹了"
      this.pendingBoltAt = 0.20;
    }

    const out = new THREE.Vector3();
    this.MuzzleWorld(out);
    if (this.onFire) this.onFire(out, this.shotIndex);
    return out;
  }

  /** 拉栓。栓动枪专用；其他枪调用等于空操作。 */
  TriggerBolt() {
    if (!this.weapon || !this.rig || !this.rig.parts.bolt) return false;
    if (this.weapon.kind !== "boltRifle") return false;
    if (this.IsBusy()) return false;
    this.pendingBoltAt = -1;
    this._StartAction("bolt", this.weapon.boltTimeS || 1.05);
    return true;
  }

  /** 装填。按 reloadKind 分支：桥夹 / 上插弹匣 / 漏斗。 */
  TriggerReload() {
    if (!this.weapon || !this.rig) return false;
    if (this.IsBusy()) return false;
    const kind = this.weapon.reloadKind;
    if (!kind) return false;
    this.pendingBoltAt = -1;
    this._StartAction("reload", this.weapon.reloadTimeS || 3.0);
    this.action.reloadKind = kind;
    return true;
  }

  /**
   * 白刃出招。mode：
   *   "slash"  大刀劈砍（melee 类武器）
   *   "cut"    上了刺刀的枪：挥砍（点按，快而浅）
   *   "thrust" 上了刺刀的枪：蓄力劈刺（按住松手），power 0..1 决定突刺深度
   *   "bash"   没上刺刀：枪托砸（蓄力只加 power）
   * 不传 mode 按持械状态推：大刀→slash，已上刺刀→thrust，否则→bash
   * （兼容既有调用）。从 meleeWind（蓄力）切入是合法转换，不算 Busy。
   */
  TriggerMelee(mode = null, power = 1) {
    if (!this.weapon || !this.rig) return false;
    const winding = !!(this.action && this.action.kind === "meleeWind");
    if (!winding && this.IsBusy()) return false;
    const isBlade = this.weapon.kind === "melee";
    const fixed = this.bayonetFixed && !!this.weapon.bayonet;
    if (!mode) mode = isBlade ? "slash" : (fixed ? "thrust" : "bash");
    const spec = GUN_MELEE[mode === "cut" ? "slash" : mode];
    const duration = isBlade ? (this.weapon.swingTimeS || 0.62) : (spec?.timeS || 0.55);
    const a = this._StartAction("melee", duration);
    a.melee = mode;
    a.power = Clamp01(power);
    // 蓄力段已经把「后拉」演完了，出招直接从爆发段接上，不再抬一次手
    if (winding) a.t = mode === "thrust" ? 0.22 : 0.14;
    return true;
  }

  /**
   * 白刃蓄力：按住（V 或空枪左键）那一段的持续姿态。
   * 松手时调用方按住了多久决定挥砍还是劈刺，再走 TriggerMelee(mode, power)。
   * 大刀不蓄力（swingTimeS 里自带 90 ms 短蓄），投掷物走 cook，不进这里。
   */
  BeginMeleeCharge() {
    if (!this.weapon || !this.rig) return false;
    if (this.weapon.kind === "melee" || this.weapon.kind === "throwable") return false;
    if (this.IsBusy()) return false;
    const a = this._StartAction("meleeWind", GUN_MELEE.chargeMaxS);
    a.fixed = this.bayonetFixed && !!this.weapon.bayonet;
    return true;
  }

  /** 取消蓄力（换枪、死亡、菜单）。不出招，姿态自然回位。 */
  CancelMeleeCharge() {
    if (this.action && this.action.kind === "meleeWind") this.action = null;
  }

  /**
   * 装/卸刺刀。fix = 目标状态。逻辑状态立刻翻（深度预算、后续出招按新状态走），
   * 可见性等动画中段左手真的够到枪口那一下再翻，"咔哒"才落在点上。
   */
  TriggerFixBayonet(fix) {
    if (!this.weapon || !this.rig || !this.weapon.bayonet) return false;
    if (!this.rig.parts.bayonet) return false;
    if (this.IsBusy()) return false;
    const a = this._StartAction("fixBayonet", 0.95);
    a.fix = !!fix;
    this.bayonetFixed = !!fix;
    this._RecomputeCompensation(this._lastWorldFov || 60);
    return true;
  }

  /** 直接同步刺刀状态（换枪/重生时用；带动画的路径走 TriggerFixBayonet）。 */
  SetBayonetFixed(fixed) {
    this.bayonetFixed = !!fixed;
    if (this.rig && this.rig.parts.bayonet) {
      this.rig.parts.bayonet.visible = this.bayonetFixed && !!(this.weapon && this.weapon.bayonet);
    }
    this._RecomputeCompensation(this._lastWorldFov || 60);
  }

  /** 投弹。power 0..1 是蓄力（只影响出手速度与摆幅，不影响时长）。 */
  TriggerThrow(power = 1) {
    // 其余 Trigger* 都有这道闸，只有这个漏了：空手时 _StepAction 会直接 return，
    // action 的 t 永远推不到 1，onThrowRelease / onActionEnd 一次都不触发，
    // 这一发就被静默吞掉了。
    if (!this.rig) return false;
    if (this.IsBusy()) return false;
    this._StartAction("throw", 0.82);
    this.action.power = Clamp01(power);
    // 手里已经是手榴弹就用它自己；否则左手掏一颗出来（步枪单手垂下）
    this.action.offhand = !this.weapon || this.weapon.kind !== "throwable";
    if (this.action.offhand) this.offhandGrenade.visible = true;
    return true;
  }

  IsBusy() {
    if (!this.action) return false;
    return this.action.kind === "bolt" || this.action.kind === "reload"
      || this.action.kind === "melee" || this.action.kind === "meleeWind"
      || this.action.kind === "fixBayonet";
  }

  /** 枪口世界坐标。注意要反解掉 FOV/深度压缩，否则弹道会从"缩小后的假位置"射出。 */
  MuzzleWorld(target = new THREE.Vector3()) {
    if (!this.muzzleAnchor) return target.set(0, 0, 0);
    this.root.updateWorldMatrix(true, false);
    this.muzzleAnchor.updateWorldMatrix(true, false);
    this.muzzleAnchor.getWorldPosition(target);
    this.root.worldToLocal(target);
    target.divide(this.compensation);
    this.root.localToWorld(target);
    return target;
  }

  /** 枪口指向（世界方向，已归一化）。 */
  MuzzleForward(target = new THREE.Vector3()) {
    if (!this.muzzleAnchor) return target.set(0, 0, -1);
    this.muzzleAnchor.getWorldQuaternion(this._tmpQuat);
    return target.set(0, 0, -1).applyQuaternion(this._tmpQuat).normalize();
  }

  /** 取走自上次调用以来累积的相机踢动（弧度）。调用方把它加到自己的 pitch/yaw 上。 */
  ConsumeCameraKick(target = new THREE.Vector2()) {
    target.set(this.cameraKick.x - this.cameraKickTaken.x, this.cameraKick.y - this.cameraKickTaken.y);
    this.cameraKickTaken.copy(this.cameraKick);
    return target;
  }

  _StartAction(kind, duration) {
    this.action = { kind, t: 0, duration: Math.max(0.05, duration), stage: 0 };
    return this.action;
  }

  // -------------------------------------------------------------------------
  // 每帧
  // -------------------------------------------------------------------------

  /**
   * @param {number} dt 秒
   * @param {object} input { moveSpeed, strafe, grounded, verticalVelocity, sprint, ads,
   *                         lookDeltaYaw, lookDeltaPitch, freeAimYaw, freeAimPitch,
   *                         crouch, elapsed, lowAmmo, wallDistance }
   */
  Update(dt, input = {}) {
    // 掉帧保护：dt 大到 0.2 s 时弹簧不炸也会把枪甩到画面外
    const step = Clamp(dt || 0, 0, 0.05);
    this.elapsed = input.elapsed != null ? input.elapsed : this.elapsed + step;

    const moveSpeed = Clamp01(input.moveSpeed ?? 0);
    const strafe = Clamp(input.strafe ?? 0, -1, 1);
    const grounded = input.grounded !== false;
    const verticalVelocity = Clamp(input.verticalVelocity ?? 0, -14, 6);
    const jumpRise = grounded ? 0 : Clamp01(verticalVelocity / 4.65);
    const jumpFall = grounded ? 0 : Clamp01(-verticalVelocity / 8);
    const sprint = Clamp01(input.sprint ?? 0);
    const crouch = Clamp01(input.crouch ?? 0);
    const lowAmmo = !!input.lowAmmo;

    // 世界 FOV 从父相机上读（调用方开镜时会改它），读不到就沿用上次
    const parent = this.root.parent;
    const worldFov = parent && parent.isPerspectiveCamera ? parent.fov : (this.worldFovBase || 65);

    // --- 动作推进 -----------------------------------------------------------
    this._StepAction(step, lowAmmo);
    // QTE 是临时高优先级动作层，覆盖既有拉栓/挥刀残留，但不另起自己的计时器；
    // 规则控制器给的 pose 同时驱动 HUD、敌人骨架与这一双第一人称手臂。
    if (input.meleeCombat) this._AnimMeleeBaked(input.meleeCombat);

    // 装填/拉栓/劈砍时强制脱离瞄准：手都离开握把了还能瞄才是穿帮
    const actionBlend = this.action ? Ease.Pulse(Clamp01(this.action.t)) : 0;
    // 这一份要给相机看：相机的 FOV 也得跟着枪一起离开瞄准线，
    // 否则枪都甩出画面了视野还是窄的 —— 玩家读到的是「视野卡住」而不是「在拉栓」。
    // 让相机读这条曲线（而不是自己另起一个定时器 snap 出去再 snap 回来），
    // 因果才是对的：**视野丢失是因为枪动了**，两者本来就该是同一条曲线。
    this.adsSuppress = 1 - Clamp01(actionBlend * 1.4);
    const adsInput = Clamp01(input.ads ?? 0) * this.adsSuppress * (1 - sprint * 0.9);

    // --- 弹簧 ---------------------------------------------------------------
    const ads = Clamp(this.adsSpring.Step(step, adsInput), -0.2, 1.2);
    // 两个阈值分开 = 迟滞。用同一个值的话，弹簧那点过冲会让右手在阈值上每帧闪一下。
    if (this.adsHideParts.length) {
      if (!this.adsHidden && ads > 0.55) {
        for (const mesh of this.adsHideParts) mesh.visible = false;
        this.adsHidden = true;
      } else if (this.adsHidden && ads < 0.45) {
        this._RestoreAdsHideParts();
      }
    }
    const sprintSpringValue = this.sprintSpring.Step(step, sprint * (1 - adsInput) * (grounded ? 1 : 0));

    // --- 冲刺姿态的白刃静音 --------------------------------------------------
    // 冲刺姿态是"把刀压到画面右下角、让出视野"，这条本身没错；错的是挥刀也从那儿起手。
    // 实测（大刀 Shift+W 冲刺中挥一刀）刀尖的 NDC 轨迹：静止就在 (0.87, −0.54)，
    // 蓄力顶点冲到 (1.60, −1.09) —— 整条刀弧在画面外走完，玩家只看到手抖了一下。
    // 所以挥刀期间把冲刺姿态按下去，刀回到腰射姿态劈完，收招后再让它自己压回去。
    //
    // 静音的是**姿态**，不是冲刺本身：脚下照跑、体力照扣、步伐晃动（bob/cadence 读的是
    // 原始 sprint）也照旧。"边跑边挥刀"要的就是这个 —— 停下来才能挥的刀不是大刀。
    // 蓄力（meleeWind）与装刺刀也算白刃期：这两段同样不能从冲刺姿态起手
    const meleeing = (!!input.meleeCombat && input.meleeCombat.state !== "idle") || !!(this.action && (this.action.kind === "melee"
      || this.action.kind === "meleeWind" || this.action.kind === "fixBayonet"));
    // 起 30 / 落 8：劈砍的蓄力段只有 90 ms，姿态必须在蓄力里就让出来，否则出刀那一下
    // 还有半个冲刺姿态压着。收招慢一倍，免得刀"啪"地弹回冲刺位置。
    this.meleeSprintMute += ((meleeing ? 1 : 0) - this.meleeSprintMute)
      * (1 - Math.exp(-step * (meleeing ? 30 : 8)));
    const sprintValue = sprintSpringValue * (1 - this.meleeSprintMute);

    // 骨骼双臂覆盖整条冲刺姿态；这里绝不再切回第二套手，避免显隐闪帧和腕位跳变。
    const crouchValue = this.crouchSpring.Step(step, crouch);
    const equip = Clamp01(this.equipSpring.Step(step, 1));

    // 落地检测：滞空越久，落地那一下越沉
    if (!grounded) this.airTime += step;
    if (grounded && !this.prevGrounded) {
      this.landSpring.Impulse(-Clamp(this.airTime, 0.05, 0.7) * 3.2);
      this.airTime = 0;
    }
    this.prevGrounded = grounded;
    const land = this.landSpring.Step(step, grounded ? 0 : 0.35);

    // 自定义自由瞄准值仍可驱动枪体，但默认三档均为 0：标准 FPS 下鼠标直接转相机，
    // HUD、弹道与机械瞄具共用屏幕中心，不再让枪口先在画面里游动。
    const freeAimYaw = Clamp(input.freeAimYaw ?? 0, -0.25, 0.25);
    const freeAimPitch = Clamp(input.freeAimPitch ?? 0, -0.25, 0.25);
    this.root.rotation.set(freeAimPitch, freeAimYaw, 0, "YXZ");

    // --- 摇摆：枪滞后于视线，停下后过冲一点再回来 ---------------------------
    // 传进来的是"这一帧转了多少弧度"，先换算成角速度，否则帧率一变手感就变
    const rate = step > 1e-5 ? 1 / step : 0;
    const yawRate = (input.lookDeltaYaw || 0) * rate;
    const pitchRate = (input.lookDeltaPitch || 0) * rate;
    const adsVisual = Clamp01(ads);
    const swayGain = (this.weapon ? this.weapon.swayScale ?? 1 : 1) * (1 - adsVisual);
    const yawTarget = Clamp(-yawRate * 0.030, -0.22, 0.22) * swayGain;
    const pitchTarget = Clamp(pitchRate * 0.026, -0.18, 0.18) * swayGain;
    const rollTarget = (Clamp(-yawRate * 0.012, -0.10, 0.10) - strafe * 0.045) * swayGain;
    const swayYaw = this.swayYaw.Step(step, yawTarget);
    const swayPitch = this.swayPitch.Step(step, pitchTarget);
    const swayRoll = this.swayRoll.Step(step, rollTarget);

    this.swayPivot.rotation.set(swayPitch, swayYaw, swayRoll, "YXZ");
    // 转身时枪不只是转，还会被甩开一点，横向位移比纯旋转更能读出"沉"
    this.swayPivot.position.set(swayYaw * -0.075, swayPitch * -0.055, 0);

    // --- 步伐晃动：走 / 跑 / 蹲三档 -----------------------------------------
    const gait = Math.max(moveSpeed, sprint);
    // 频率：走 1.55 Hz，冲刺 2.5 Hz，蹲下拖慢到 0.78
    const cadence = Mix(1.55, 2.50, sprint) * Mix(1.0, 0.78, crouchValue) * Math.PI * 2;
    this.bobPhase += step * cadence * (0.25 + gait * 0.75);
    if (this.bobPhase > Math.PI * 200) this.bobPhase -= Math.PI * 200;   // 别让 float 精度慢慢烂掉
    const bobScale = gait * (1 - adsVisual) * Mix(1, 0.55, crouchValue);
    const ampX = Mix(0.013, 0.030, sprint) * bobScale;
    const ampY = Mix(0.009, 0.020, sprint) * bobScale;
    const phase = this.bobPhase;
    // 8 字：横向一倍频、纵向二倍频；再叠一个 |sin| 的落脚下沉
    const bobX = Math.sin(phase) * ampX;
    const bobY = Math.sin(phase * 2) * ampY * 0.5 - Math.abs(Math.sin(phase)) * ampY;
    // 站着不动时的呼吸：幅度只有走路的十分之一，但没有它枪就是"钉死"的
    const idle = (1 - gait) * (1 - adsVisual);
    const breathY = Math.sin(this.elapsed * 1.15) * 0.0026 * idle;
    const breathX = Math.sin(this.elapsed * 0.73 + 1.3) * 0.0020 * idle;

    this.bobPivot.position.set(bobX + breathX, bobY + breathY, 0);
    this.bobPivot.rotation.set(
      Math.sin(phase * 2) * 0.010 * bobScale,
      Math.sin(phase) * 0.014 * bobScale,
      -Math.sin(phase) * 0.018 * bobScale);

    // --- 状态层：起跳收枪 / 滞空换重心 / 落地下沉 / 蹲低 / 掏枪 / 贴墙收枪 ---
    // 上升段枪口略压、枪身贴胸；越过最高点以后手臂开始向前接落地。
    // 这里读竖直速度而不是只读 grounded，同一次滞空才会有清楚的两段动作。
    let stateY = land * 0.055 - jumpRise * 0.026 + jumpFall * 0.014
      + crouchValue * -0.012 + (1 - equip) * -0.26;
    let stateZ = jumpRise * 0.030 - jumpFall * 0.012 + crouchValue * 0.010;
    let stateRx = land * 0.16 - jumpRise * 0.13 + jumpFall * 0.09 + (1 - equip) * -0.55;
    const wall = input.wallDistance;
    if (wall != null && wall < 0.9) {
      // 贴墙收枪：不做的话枪管会从墙那边捅出去，这是单场景视图模型唯一的解
      const near = 1 - Clamp01((wall - 0.35) / 0.55);
      stateRx += near * -0.60;
      stateZ += near * 0.075;
      stateY += near * -0.030;
    }
    this.statePivot.position.set(0, stateY, stateZ);
    this.statePivot.rotation.set(stateRx, (1 - equip) * 0.35, (1 - equip) * -0.25, "YXZ");

    // --- 后坐 ---------------------------------------------------------------
    const kick = this.recoilKick.Step(step, 0);
    const rise = this.recoilRise.Step(step, 0);
    const rPitch = this.recoilPitchSpring.Step(step, 0);
    const rYaw = this.recoilYawSpring.Step(step, 0);
    this.recoilPivot.position.set(rYaw * 0.20, rise, kick);
    this.recoilPivot.rotation.set(rPitch, rYaw, rYaw * 0.85, "YXZ");

    // --- 姿态插值：腰射 → 开镜 → 冲刺 ---------------------------------------
    // 上了刺刀先给腰射姿态加一份"端刺刀"的增量（见 BAYONET_CARRY 的抬头）。
    // 只加在腰射上：开镜姿态是解出来让照门落在屏幕正中的，动一个数就歪。
    // 出招那一下压平（见 BAYONET_CARRY_STRIKE）：斜端着的枪要先摆正才谈得上
    // "照着准心捅出去"。蓄力段不压 —— 那一段本来就是把枪往后拉的预备姿态。
    const striking = !!(this.action && this.action.kind === "melee");
    // 装/卸刺刀那 0.95 s 里不走这条：那段动画自己就在转枪（ry 0.34），
    // 再叠一份 0.575 等于把枪甩出画面左上角。那段由动画自己给权重（carryOverride），
    // 末段与抬枪交接，读起来正好是"扣上刀之后把枪端稳"。
    const fixing = !!(this.action && this.action.kind === "fixBayonet");
    const carryTarget = this.bayonetFixed && this.weapon && this.weapon.bayonet && !fixing
      ? (striking ? BAYONET_CARRY_STRIKE : 1) : 0;
    // 装/卸刺刀期间由动画自己说了算（this.carryOverride）：那 0.95 s 里枪本来就在
    // 转，交给指数逼近会先回一趟腰射姿态再斜端起来，画面上是明显的一下回弹。
    if (fixing && this.carryOverride != null) this.bayonetCarry = this.carryOverride;
    this.bayonetCarry += (carryTarget - this.bayonetCarry) * (1 - Math.exp(-step * 7));
    if (this.rig) {
      const hip = this.bayonetCarry > 1e-3
        ? this._AddPose(this.hipPose, BAYONET_CARRY, this.bayonetCarry)
        : this.hipPose;
      const pose = this._MixPose(hip, this.adsPose, ads);
      const finalPose = this._MixPose(pose, this.sprintPose, Clamp01(sprintValue));
      this.weaponMount.position.set(finalPose.px, finalPose.py, finalPose.pz);
      this.weaponMount.rotation.set(finalPose.rx, finalPose.ry, finalPose.rz, "YXZ");
    }

    // --- FOV 补偿（世界 FOV 变了要重算）-------------------------------------
    if (Math.abs(worldFov - (this._lastWorldFov || 0)) > 0.05) {
      this._lastWorldFov = worldFov;
      if (adsInput < 0.02) this.worldFovBase = worldFov;   // 只在没开镜时校准基准
      this._RecomputeCompensation(worldFov);
    }

    // --- 枪焰 / 碎屑 ---------------------------------------------------------
    this._StepFlash(step);
    this._StepDebris(step);
    if (this.riggedArms) {
      this.armAnchor.quaternion.identity();
      if (!this.weapon) this._UpdateUnarmedHands(gait, sprint, grounded ? 1 : 0);
      else this.riggedArms.SetPoseState({ ads: Clamp01(ads), sprint: Clamp01(sprintValue),
        reload: this.action?.kind === "reload", reloadBlend: this.reloadBlend, melee: !!input.meleeCombat });
      this.riggedArms.Update(step);
    }
    if (!this.weapon && !this.riggedArms) this._UpdateUnarmedHands(gait, sprint, grounded ? 1 : 0);
    this.body?.Update(step, input.carryBodyVisible ? { ...input, playerYaw: input.carryBodyYaw ?? input.playerYaw,
      crouch: Math.max(input.crouch || 0, input.carryBodyCrouch || 0) } : input,
      parent, (this.root.visible || !!input.carryBodyVisible) && !(input.meleeCameraDrop > 0.05));
    this._UpdateSleeves();
  }

  _UpdateUnarmedHands(gait, sprint, grounded) {
    const amplitude = gait * grounded;
    if (this.riggedArms) {
      this.riggedArms.poseState.sprint = sprint;
      this.riggedArms.poseState.ads = 0;
    }
    for (const [side, sign, hand, contact] of [["r", 1, this.handRight.group, this.gripContactRight], ["l", -1, this.handLeft.group, this.gripContactLeft]]) {
      const swing = Math.sin(this.bobPhase + (side === "l" ? Math.PI : 0)) * amplitude;
      hand.position.set(sign * (0.19 - 0.025 * swing), -0.27 + amplitude * 0.19 + swing * (0.025 + sprint * 0.04), -0.45 - swing * (0.030 + sprint * 0.045));
      hand.quaternion.copy(FrameQuaternion(new THREE.Vector3(-sign*0.10, 0.60, -0.80), new THREE.Vector3(sign, 0, 0)));
      contact.position.copy(hand.position); contact.quaternion.copy(hand.quaternion);
    }
  }

  /**
   * 把两条小臂从肘锚点对准当前手位。**每帧都要做**：手位被拉栓/装填/投弹/
   * 上刺刀那几条动画每帧改写（见 _ResetAnimatedParts 之后那一串 _Anim*），
   * Equip 时摆一次是不够的。
   *
   * 读手位前必须先 updateMatrixWorld：这一帧的 weaponMount / recoilPivot 姿态
   * 刚在上面几行写完，矩阵还是上一帧的。armAnchor 与手同在 root 这条链上，
   * 所以即便相机本身的世界矩阵还没更新，两者之间的**相对**变换也是对的。
   */
  _UpdateSleeves() {
    const on = !!this.rig || !this.weapon;
    this.sleeveRight.group.visible = on;
    this.sleeveLeft.group.visible = on;
    if (!on) return;
    this.root.updateMatrixWorld(true);
    this._AimSleeve(this.sleeveRight, this.handRight.group, ELBOW_ANCHOR.right);
    this._AimSleeve(this.sleeveLeft, this.handLeft.group, ELBOW_ANCHOR.left);
  }

  _AimSleeve(sleeve, handGroup, elbow) {
    const { a, b, q } = this._sleeveTmp;
    // 把手掌后方的真正腕点换算到 armAnchor 空间。这里不能再用
    // handGroup.getWorldPosition：那是枪的握持轴心，正是上一版「反关节」的病根。
    handGroup.localToWorld(a.copy(HAND_WRIST_LOCAL));
    this.armAnchor.worldToLocal(a);
    const dir = b.copy(a).sub(elbow);
    const reach = dir.length();
    if (reach < 1e-4) return;
    dir.divideScalar(reach);
    sleeve.group.position.copy(elbow);
    // 手搓四元数而不是 lookAt：lookAt 读父级的世界矩阵，这一帧它未必是新的
    sleeve.group.quaternion.copy(q.setFromUnitVectors(SLEEVE_FORWARD, dir));
    // 腕停在握持点之前 WRIST_INSET 处；手位再近也不许把袖子压成负长度
    sleeve.shaft.scale.z = Math.max(0.04, reach - WRIST_INSET);
    sleeve.cap.position.z = sleeve.shaft.scale.z;
  }

  /** 姿态 + 增量×权重。上刺刀的"端刺刀"姿态就是这么叠上去的。 */
  _AddPose(a, delta, w) {
    return {
      px: a.px + delta.px * w, py: a.py + delta.py * w, pz: a.pz + delta.pz * w,
      rx: a.rx + delta.rx * w, ry: a.ry + delta.ry * w, rz: a.rz + delta.rz * w,
    };
  }

  _MixPose(a, b, t) {
    return {
      px: Mix(a.px, b.px, t), py: Mix(a.py, b.py, t), pz: Mix(a.pz, b.pz, t),
      rx: Mix(a.rx, b.rx, t), ry: Mix(a.ry, b.ry, t), rz: Mix(a.rz, b.rz, t),
    };
  }

  // -------------------------------------------------------------------------
  // 动作
  // -------------------------------------------------------------------------

  _StepAction(dt, lowAmmo) {
    // 开火后自动上膛的排队（栓动枪）
    if (this.pendingBoltAt > 0) {
      if (!this.weapon || !this.rig) this.pendingBoltAt = -1;   // 排队期间换了枪
      this.pendingBoltAt -= dt;
      if (this.pendingBoltAt <= 0 && !this.IsBusy() && this.weapon) {
        this.pendingBoltAt = -1;
        this.pendingHoldOpen = lowAmmo;
        this._StartAction("bolt", this.weapon.boltTimeS || 1.05);
      }
    }

    // 每帧先归位，再让当前动作去改 —— 不归位的话上一个动作的残留会越积越歪
    this._ResetAnimatedParts();

    if (!this.action || !this.rig) return;
    const a = this.action;
    a.t += dt / a.duration;
    if (a.kind === "meleeWind") {
      a.t = Math.min(a.t, 1);      // 蓄力顶满就停住，出招由松手驱动，不自动结束
    } else if (a.t >= 1) {
      this._EndAction(a);
      return;
    }
    switch (a.kind) {
      case "bolt": this._AnimBolt(a.t, this.pendingHoldOpen); break;
      case "reload": this._AnimReload(a.t, a.reloadKind); break;
      case "melee": this._AnimMelee(a.t, a.melee, a.power); break;
      case "meleeWind": this._AnimMeleeWind(a.t, a.fixed); break;
      case "fixBayonet": this._AnimFixBayonet(a.t, a); break;
      case "throw": this._AnimThrow(a.t, a.power, a.offhand); break;
      default: break;
    }
  }

  _EndAction(a) {
    if (a.kind === "bolt") {
      // 打空时枪机留在后方：这一下必须让玩家看见（配合 HUD 的"空仓"提示）
      this.boltOpen = !!this.pendingHoldOpen;
      if (this.boltOpen && this.rig.parts.bolt) {
        this.rig.parts.bolt.position.z = this.rig.boltTravel;
        this.rig.parts.bolt.rotation.z = -1.35;
        if (this.rig.parts.dustCover) this.rig.parts.dustCover.position.z = this.rig.boltTravel;
      }
    }
    if (a.kind === "reload") {
      this.boltOpen = false;
      this.pendingHoldOpen = false;
      this.clipProp.visible = false;
    }
    // 收招只把**没装配**的刺刀收回去；上了刺刀的枪收招后刀还在枪上
    if (a.kind === "melee" && this.rig.parts.bayonet && !this.bayonetFixed) {
      this.rig.parts.bayonet.visible = false;
    }
    // 动画被打断（换枪等）也得落在目标状态上，不能停在半装半卸
    if (a.kind === "fixBayonet" && this.rig.parts.bayonet) {
      this.rig.parts.bayonet.visible = !!a.fix && !!(this.weapon && this.weapon.bayonet);
    }
    if (a.kind === "throw") this.offhandGrenade.visible = false;
    this.action = null;
    if (this.onActionEnd) this.onActionEnd(a.kind);
  }

  /** 把所有会被动画改动的东西恢复到静止姿态。 */
  _ResetAnimatedParts() {
    this.actionPivot.position.set(0, 0, 0);
    this.actionPivot.rotation.set(0, 0, 0);
    this.reloadPivot.position.set(0, 0, 0);
    this.reloadPivot.rotation.set(0, 0, 0);
    this.reloadBlend = 0;
    this.swingPivot.rotation.set(0, 0, 0);
    this.carryOverride = null;   // 装/卸刺刀动画每帧自己写，见 _AnimFixBayonet
    if (!this.rig) return;
    this.handRight.group.position.copy(this.handBase.right);
    this.handRight.group.rotation.copy(this.handBaseRot.right);
    this.handLeft.group.position.copy(this.handBase.left);
    this.handLeft.group.rotation.copy(this.handBaseRot.left);
    if (this.riggedArms) {
      this.riggedArms.SetContactWeight("r", 1);
      this.riggedArms.SetContactWeight("l", 1);
    }
    const bolt = this.rig.parts.bolt;
    if (bolt && !this.boltOpen) { bolt.position.z = 0; bolt.rotation.z = 0; }
    const cover = this.rig.parts.dustCover;
    if (cover && !this.boltOpen) cover.position.z = 0;
    const mag = this.rig.parts.magazine;
    if (mag) { mag.position.set(0, 0, 0); mag.visible = true; }
    // 刀件：装/卸刺刀那一段会把它挪走，其余任何一帧都必须是静止值
    const bayonet = this.rig.parts.bayonet;
    if (bayonet && this.bayonetHome) {
      bayonet.position.copy(this.bayonetHome.position);
      bayonet.rotation.copy(this.bayonetHome.rotation);
    }
    if (!this.action || this.action.kind !== "reload") this.clipProp.visible = false;
  }

  /**
   * 拉栓：抬柄 → 后拉（抛壳）→ 推回 → 压柄。
   * 右手真的离开握把去抓机柄 —— 手不动只有枪机在动是最出戏的偷懒做法。
   */
  _AnimBolt(t, holdOpen) {
    const rig = this.rig;
    const bolt = rig.parts.bolt;
    if (!bolt) return;
    const travel = rig.boltTravel;

    const timing = this.actionSpec?.bolt?.timing || [0.22, 0.52, 0.82];
    const [liftEnd, backEnd, forwardEnd] = timing;
    const lift = Ease.InOut(Ease.Seg(t, 0.00, liftEnd));
    const back = Ease.InOut(Ease.Seg(t, Math.max(0, liftEnd - 0.02), backEnd));
    const fwd = holdOpen ? 0 : Ease.InOut(Ease.Seg(t, Math.min(0.95, backEnd + 0.03), forwardEnd));
    const drop = holdOpen ? 0 : Ease.InOut(Ease.Seg(t, Math.max(0, forwardEnd - 0.02), 1.00));

    const slide = (back - fwd) * travel;
    bolt.rotation.z = -1.35 * (lift - drop);
    bolt.position.z = slide;
    if (rig.parts.dustCover) rig.parts.dustCover.position.z = slide;   // 三八大盖随栓前后滑

    // 抛壳：栓刚拉过一半时弹壳跳出来
    if (t >= 0.34 && this.action && !this.action.ejected) {
      this.action.ejected = true;
      this._SpawnShell(Mulberry32(HashString(`${this.seed}:eject:${this.shotIndex}`)));
    }

    // 右手：握把 → 机柄 → 跟着栓走 → 回握把
    const handle = rig.boltHandle;
    const reach = Ease.InOut(Ease.Seg(t, 0.02, 0.20));
    const ret = Ease.InOut(Ease.Seg(t, 0.82, 1.00));
    const attach = Clamp01(reach - ret);
    this.riggedArms?.SetContactWeight("r", 1 - attach);
    const target = this._tmpVec.set(handle.x, handle.y, handle.z + slide);
    this.handRight.group.position.lerpVectors(this.handBase.right, target, attach);
    this.handRight.group.rotation.set(
      Mix(this.handBaseRot.right.x, -0.25, attach),
      Mix(this.handBaseRot.right.y, 0.55, attach),
      Mix(this.handBaseRot.right.z, -0.55, attach), "YXZ");

    // 整枪：拉栓时枪身会被带得往右后仰一点（右手在使劲）
    const load = Ease.Pulse(t);
    this.actionPivot.position.set(load * 0.012, load * 0.010, load * 0.016);
    this.actionPivot.rotation.set(load * 0.055, load * -0.10, load * 0.075, "YXZ");
  }

  _AnimReload(t, kind) {
    const family = this.actionSpec?.reload?.family || kind;
    if (family === "topMag") return this._AnimReloadTopMag(t);
    if (family === "hopper") return this._AnimReloadHopper(t);
    if (family === "boxMag") return this._AnimReloadBoxMag(t);
    return this._AnimReloadStripper(t);
  }

  /** Rotate the weapon around its supporting palm, keeping shoulders stable. */
  _PoseReload(support, weight, x, y, z, rx, ry, rz) {
    this.reloadBlend = weight;
    const pivot = this.reloadPivot;
    const anchor = this.handBase[support];
    pivot.rotation.set(rx * weight, ry * weight, rz * weight, "YXZ");
    // R(v - anchor) + anchor + authored lift. This is a real pivot change,
    // not a screen-space clamp; long and short guns retain their own geometry.
    this.reloadAnchor.copy(anchor).applyQuaternion(pivot.quaternion);
    pivot.position.copy(anchor).sub(this.reloadAnchor);
    pivot.position.x += x * weight;
    pivot.position.y += y * weight;
    pivot.position.z += z * weight;
  }

  /**
   * 桥夹装填（中正式 / 汉阳造 / 三八式 / 驳壳枪）：
   * 开栓 → 右手从腰间取桥夹 → 插进桥夹导槽 → **拇指一推 5 发** → 抽出空夹丢掉 → 闭栓。
   * 一发一发往里塞是错的（史料明确写了是桥夹压入）。
   */
  _AnimReloadStripper(t) {
    const rig = this.rig;
    const bolt = rig.parts.bolt;
    const travel = rig.boltTravel;

    // 左掌支撑护木，枪围绕它抬起露出机匣；肩膀不随枪绕相机横移。
    const raise = Ease.InOut(Ease.Seg(t, 0.00, 0.18)) - Ease.InOut(Ease.Seg(t, 0.88, 1.00));
    this._PoseReload("left", raise, -0.055, 0.045, 0.055, 0.10, 0.40, -0.55);

    if (bolt) {
      const open = this.boltOpen ? 1 : Ease.InOut(Ease.Seg(t, 0.10, 0.26));
      const close = Ease.InOut(Ease.Seg(t, 0.78, 0.92));
      bolt.rotation.z = -1.35 * Clamp01(open - Ease.InOut(Ease.Seg(t, 0.86, 1.00)));
      bolt.position.z = travel * Clamp01(open - close);
      if (rig.parts.dustCover) rig.parts.dustCover.position.z = bolt.position.z;
    }

    // 桥夹：从画面右下（腰间弹袋）升上来，坐进导槽
    const seat = rig.clipSeat;
    const bring = Ease.Out(Ease.Seg(t, 0.26, 0.50));
    const press = Ease.InOut(Ease.Seg(t, 0.50, 0.64));
    const pull = Ease.In(Ease.Seg(t, 0.66, 0.76));
    if (t > 0.24 && t < 0.78) {
      this.clipProp.visible = true;
      const from = this._tmpVec.set(seat.x + 0.14, seat.y - 0.26, seat.z + 0.16);
      const to = this._tmpVec2.set(seat.x, seat.y + 0.010, seat.z);
      this.clipProp.position.lerpVectors(from, to, bring);
      this.clipProp.position.y -= press * 0.022;      // 压弹：整条往下沉
      this.clipProp.position.y += pull * 0.16;        // 抽夹：往上抽走
      this.clipProp.position.x += pull * 0.05;
      this.clipProp.rotation.set(Mix(0.5, 0.0, bring), 0, Mix(0.7, 0.0, bring), "YXZ");
      // 5 发压进弹仓：弹头逐颗沉下去
      const rounds = this.clipProp.userData.rounds;
      rounds.position.y = -press * 0.030;
      rounds.visible = press < 0.98;
    } else {
      this.clipProp.visible = false;
      if (t >= 0.78 && this.action && !this.action.tossed) {
        this.action.tossed = true;
        this._SpawnClipToss();
      }
    }

    // 右手：握把 → 腰间 → 托着桥夹 → 拇指压 → 回握把
    const away = Ease.InOut(Ease.Seg(t, 0.06, 0.24));
    const home = Ease.InOut(Ease.Seg(t, 0.80, 1.00));
    const off = Clamp01(away - home);
    this.riggedArms?.SetContactWeight("r", 1 - off);
    const handTarget = this._tmpVec.set(seat.x + 0.02, seat.y + 0.05, seat.z + 0.06);
    handTarget.lerp(this.handBase.right, this.weaponId === "Type38" ? 0.35 : 0.15);
    this.handRight.group.position.lerpVectors(this.handBase.right, handTarget, off);
    this.handRight.group.position.y -= (1 - bring) * off * 0.20;
    this.handRight.group.position.z += (1 - bring) * off * 0.10;
    this.handRight.group.rotation.set(
      Mix(this.handBaseRot.right.x, -0.55, off),
      Mix(this.handBaseRot.right.y, 0.30, off),
      Mix(this.handBaseRot.right.z, -1.10, off), "YXZ");
  }

  /**
   * 捷克式：20 发弧形弹匣**从上方**拔出、再从上方插入。
   * 做成下插就把这支枪最强的剪影特征毁了。
   */
  _AnimReloadTopMag(t) {
    const rig = this.rig;
    const mag = rig.parts.magazine;
    const seat = rig.clipSeat;

    const tilt = Ease.InOut(Ease.Seg(t, 0.00, 0.15)) - Ease.InOut(Ease.Seg(t, 0.88, 1.00));
    this._PoseReload("left", tilt, -0.045, 0.030, 0.050, 0.06, 0.34, -0.42);

    if (mag) {
      const outUp = Ease.In(Ease.Seg(t, 0.15, 0.32));       // 空匣往上拔
      const gone = Ease.Seg(t, 0.30, 0.36);
      const inDown = 1 - Ease.Out(Ease.Seg(t, 0.55, 0.76)); // 新匣从上方压下去
      if (t < 0.34) {
        mag.position.set(0, outUp * 0.20, -outUp * 0.05);
        mag.visible = gone < 1;
      } else if (t < 0.55) {
        mag.visible = false;
        if (this.action && !this.action.tossed) {
          this.action.tossed = true;
          this._SpawnClipToss(true);
        }
      } else {
        mag.visible = true;
        mag.position.set(0, inDown * 0.24, -inDown * 0.06);
      }
    }

    // 右手：上去拔匣 → 下去取新匣 → 压新匣 → 拍一下 → 拉机柄
    const seatPos = this._tmpVec.set(seat.x + 0.02, seat.y + 0.06, seat.z);
    const grabA = Clamp01(Ease.InOut(Ease.Seg(t, 0.04, 0.16)) - Ease.InOut(Ease.Seg(t, 0.30, 0.40)));
    const grabB = Clamp01(Ease.InOut(Ease.Seg(t, 0.52, 0.62)) - Ease.InOut(Ease.Seg(t, 0.80, 0.96)));
    const grab = Math.max(grabA, grabB);
    this.riggedArms?.SetContactWeight("r", 1 - grab);
    this.handRight.group.position.lerpVectors(this.handBase.right, seatPos, grab);
    this.handRight.group.position.y += grabA * Ease.Seg(t, 0.16, 0.32) * 0.16;
    this.handRight.group.position.y -= (1 - Ease.Seg(t, 0.52, 0.66)) * grabB * 0.22;
    this.handRight.group.rotation.set(
      Mix(this.handBaseRot.right.x, -0.30, grab),
      Mix(this.handBaseRot.right.y, 0.20, grab),
      Mix(this.handBaseRot.right.z, -0.90, grab), "YXZ");

    // 拉机柄（右侧）：最后 12% 拉一下再松开
    const charge = Ease.Pulse(Ease.Seg(t, 0.80, 0.96));
    if (rig.parts.bolt) rig.parts.bolt.position.z = charge * rig.boltTravel;
  }

  /** 驳壳枪以外的手枪：底部退匣 → 腰间取新匣 → 插匣 → 拉套筒。 */
  _AnimReloadBoxMag(t) {
    const seat = this.rig.clipSeat || this._tmpVec.set(0, -0.04, -0.02);
    const tilt = Ease.InOut(Ease.Seg(t, 0.00, 0.16)) - Ease.InOut(Ease.Seg(t, 0.84, 1.00));
    this._PoseReload("right", tilt, -0.025, 0.025, 0.035, 0.08, 0.22, -0.28);
    const handPath = this.actionSpec?.reload?.handPath;
    const leave = Ease.InOut(Ease.Seg(t, handPath ? 0.03 : 0.08, handPath ? 0.12 : 0.25));
    const returnHome = Ease.InOut(Ease.Seg(t, handPath ? 0.92 : 0.78, handPath ? 1 : 0.98));
    const off = Clamp01(leave - returnHome);
    const insert = Ease.InOut(Ease.Seg(t, 0.48, 0.72));
    const target = this._tmpVec2.set(seat.x - 0.018, seat.y - 0.055 + insert * 0.050, seat.z + 0.020);
    // The firing hand keeps the pistol grip; the support hand leaves for the
    // magazine well. C96 remains in its separate right-hand stripper family.
    if (handPath?.length) {
      let next = handPath.findIndex((point) => point.at >= t);
      if (next < 0) next = handPath.length - 1;
      const end = handPath[next];
      const start = handPath[Math.max(0, next - 1)];
      target.fromArray(start.position).lerp(this._tmpVec.fromArray(end.position),
        Ease.InOut(Ease.Seg(t, start.at, end.at)));
    } else target.lerp(this.handBase.left, 0.45);
    this.handLeft.group.position.lerpVectors(this.handBase.left, target, off);
    this.handLeft.group.rotation.set(
      Mix(this.handBaseRot.left.x, -0.34, off),
      Mix(this.handBaseRot.left.y, -0.18, off),
      Mix(this.handBaseRot.left.z, 0.92, off), "YXZ");
    this.riggedArms?.SetContactWeight("l", 1 - off);
    const rack = Ease.Pulse(Ease.Seg(t, 0.78, 0.96));
    if (this.rig.parts.bolt) this.rig.parts.bolt.position.z = rack * this.rig.boltTravel;
  }

  /** 十一年式漏斗：把 6 个桥夹压进左侧弹斗、盖上压弹板。玩家一般用不到，留给 AI 展示。 */
  _AnimReloadHopper(t) {
    const raise = Ease.Pulse(t);
    this._PoseReload("left", raise, -0.05, 0.03, 0.05, 0.05, 0.5, -0.5);
    const off = Ease.Pulse(Ease.Seg(t, 0.1, 0.9));
    this.riggedArms?.SetContactWeight("r", 1 - off);
    this.handRight.group.position.x = this.handBase.right.x - off * 0.045;
    this.handRight.group.position.y = this.handBase.right.y + off * 0.055;
  }

  /**
   * 白刃蓄力（按住那段）的持续姿态：枪往右后收、刀尖微抬，蓄满带一点绷着的抖。
   * fixed=true 的终点 ≈ thrust 的 pull 顶点、否则 ≈ bash 的后抡预备 ——
   * 松手接 _AnimMelee 时衔接在同一姿态附近，不跳帧。
   */
  _AnimMeleeWind(t, fixed) {
    const pull = Ease.Out(Ease.Seg(t, 0.00, 0.35));
    const deep = Ease.InOut(Ease.Seg(t, 0.35, 1.00));
    const w = pull * (0.85 + 0.35 * deep);
    // 蓄满后的抖：幅度很小、频率高 —— 是"绷着"，不是"晃"
    const shake = deep * 0.004 * Math.sin(this.elapsed * 34);
    if (fixed) {
      this.actionPivot.position.set(-0.06 * w + shake, 0.03 * w, 0.11 * w);
      this.actionPivot.rotation.set(0.10 * w + shake * 2, 0.16 * w, -0.10 * w, "YXZ");
    } else {
      this.actionPivot.position.set(-0.10 * w + shake, 0.04 * w, 0.06 * w);
      this.actionPivot.rotation.set(0.12 * w, -0.30 * w, 0.30 * w + shake * 2, "YXZ");
    }
  }

  /**
   * 装/卸刺刀。**一整套双手动作**，不是"枪自己抬一下"：
   *
   *   0.00—0.22  枪往回带、枪口抬起转向左前 —— 把要装的那一头转到看得见的位置
   *   0.10—0.46  左手离开护木往下一沉（取刀）
   *   0.34—0.58  左手沿枪身往前推；刀沿枪管滑进枪口环，0.58 到位（"咔哒"在这一帧）
   *   0.56—0.76  左手在枪身上按实一下（整枪跟着轻轻一沉；卸刀没有这一下）
   *   0.58—1.00  抬枪退场、"刺杀预备"进场，两条曲线叠着走，中间不回腰射
   *
   * 卸刀是同一条时间轴反过来读：手推上去、0.52 起把刀往后拔、0.80 收起不见。
   *
   * 手为什么不摸到枪口：见 BAYONET_SLIDE_Z 的抬头 —— 胳膊就是不够长，
   * 而把肩挪过去会在画面左边缘拉出一片鱼鳍。最后那一段交给刀自己走。
   */
  _AnimFixBayonet(t, a) {
    const fix = !!a.fix;
    const bayonet = this.rig.parts.bayonet;

    // --- 枪：端回胸前、枪口转向左前 -----------------------------------------
    const raise = Ease.InOut(Ease.Seg(t, 0.00, 0.22)) - Ease.InOut(Ease.Seg(t, 0.70, 1.00));
    // 末段把"刺杀预备"接上：抬枪在 0.70—1.00 退场，端刺刀姿态在 0.58—1.00 进场，
    // 两条曲线叠着走，枪从"举在面前上刀"直接转进"斜端着"，中间不回腰射。
    this.carryOverride = fix
      ? Ease.InOut(Ease.Seg(t, 0.58, 1.00))
      : 1 - Ease.InOut(Ease.Seg(t, 0.00, 0.34));
    // 扣上那一下整枪一沉（卸刀是往外拔，没有这一沉）
    const settle = fix ? Ease.Pulse(Ease.Seg(t, 0.56, 0.76)) : 0;
    this.actionPivot.position.set(-0.030 * raise, 0.042 * raise - 0.014 * settle, 0.090 * raise);
    // ry > 0 把枪口扫向画面左侧：枪身横过来，玩家才看得见自己在枪口上装东西。
    // 0.34 是上限附近 —— 再大枪口就撞出画面左上角（0.42 那一版实拍是飞出去的）。
    this.actionPivot.rotation.set(0.22 * raise + 0.05 * settle, 0.34 * raise,
      -0.24 * raise, "YXZ");

    // --- 左手：护木 → 下沉取刀 → 枪管前段 ----------------------------------
    const dip = Ease.InOut(Ease.Seg(t, 0.10, 0.32)) - Ease.InOut(Ease.Seg(t, 0.32, 0.48));
    const mount = Ease.InOut(Ease.Seg(t, 0.34, 0.56)) - Ease.InOut(Ease.Seg(t, 0.68, 0.92));
    this.riggedArms?.SetContactWeight("l", 1 - Math.max(dip, mount));
    const muzzle = this.rig.muzzle;
    // 手只推到臂长允许的枪管前段；余下距离由刀沿枪管滑入枪口环。
    const hold = this._tmpVec2.set(this.handBase.left.x - 0.035,
      this.handBase.left.y + 0.014, this.handBase.left.z + 0.005);
    const hand = this._tmpVec.copy(this.handBase.left);
    hand.lerp(SHEATH_HAND, dip);          // 先松开、往下沉一截（取刀）
    hand.lerp(hold, mount);               // 再沿枪身往前推
    this.handLeft.group.position.copy(hand);
    // 手腕跟着翻：探刀时手心向下，扣刀时虎口朝枪口
    this.handLeft.group.rotation.set(
      this.handBaseRot.left.x + 0.55 * dip - 0.30 * mount,
      this.handBaseRot.left.y - 0.35 * dip + 0.45 * mount,
      this.handBaseRot.left.z + 0.40 * dip + 0.20 * mount, "YXZ");

    // --- 刀：沿枪管滑上枪口环 / 拔下来 --------------------------------------
    if (bayonet && this.bayonetHome) {
      // slide = 1 刀还在后面（手推的位置），0 已经扣进枪口环
      const slide = fix
        ? 1 - Ease.Out(Ease.Seg(t, 0.44, 0.58))       // 装：0.58 到位，"咔哒"
        : Ease.In(Ease.Seg(t, 0.52, 0.72));           // 卸：往后拔出来
      const show = fix ? t >= 0.42 : t < 0.80;
      bayonet.visible = show && !!(this.weapon && this.weapon.bayonet);
      bayonet.position.set(this.bayonetHome.position.x,
        this.bayonetHome.position.y - 0.004 * slide,
        this.bayonetHome.position.z + BAYONET_SLIDE_Z * slide);
      // 滑上去的时候刀身略歪一点，到位那一下正过来（"咔哒"卡进环里的感觉）
      bayonet.rotation.set(this.bayonetHome.rotation.x - 0.05 * slide,
        this.bayonetHome.rotation.y + 0.06 * slide,
        this.bayonetHome.rotation.z + 0.04 * slide, "YXZ");
    }
  }

  /** 近战：刺刀劈刺（thrust）/ 刺刀挥砍（cut）/ 大刀劈砍（slash）/ 枪托砸（bash）。 */
  _AnimMelee(t, mode, power = 1) {
    this.riggedArms?.SetContactWeight("r", 1);
    this.riggedArms?.SetContactWeight("l", 0);
    const actionPulse = Ease.Pulse(t);
    const dadaoRegrip = this.weaponId === "Dadao";
    const regrip = actionPulse * (dadaoRegrip ? 1.00 : 0.72);
    this.handLeft.group.position.lerp(this.handBase.right, regrip);
    // 大刀爆发帧不能把双掌压在刀柄同一点：那会迫使左肩横跨身体追右手，
    // 即使掌心 residual 很小，左肘/腕仍已越过人体可达域。左手脱握时沿柄侧
    // 留出 30 mm 的独立再握位置；它只在 contactWeight=0 的动作层生效，收招
    // 随 Pulse 回到逐枪静态接触点，不篡改基础 grip frame。
    if (dadaoRegrip) this.handLeft.group.position.x += 0.030 * actionPulse;
    if (mode === "slash") {
      // 大刀：只蓄 90 ms，随后约 110 ms 内完成爆发斜劈。旧版 0.62 s 的
      // 前 24% 都在慢慢举、后 50% 又在慢慢回，真正的走刀只有约 160 ms，读起来
      // 像端着刀做广播体操。现在整刀 0.50 s，爆发段更短，弧度从 135°放到约 175°。
      const windUp = Ease.Out(Ease.Seg(t, 0.00, 0.18));
      const release = Ease.In(Ease.Seg(t, 0.18, 0.40));
      const recover = Ease.Out(Ease.Seg(t, 0.43, 0.82));
      const wind = windUp - release;
      const chop = release - recover;

      // 整把刀绕握把走完整劈砍平面。蓄力顶点与落点相差约 172°；
      // 这是对着上屏轨迹定的角，不是只看欧拉角猜。刀在右手边的斜举姿态已经带了
      // 三轴旋转，局部 X 的正负与屏幕上的顺/逆时针不能直接画等号。
      this.swingPivot.rotation.set(-1.00 * wind + 2.00 * chop, -0.24 * wind - 0.34 * chop,
        0.14 * wind + 0.24 * chop, "YXZ");

      // 肩、胸和双手一起送出去：不是只有刀片绕轴自转。劈到最深处时明显下压并前送，
      // 回收在 82% 就结束，余下几帧稳住，避免动作末尾突然弹回预备姿势。
      this.actionPivot.position.set(
        0.055 * wind - 0.180 * chop,
        0.060 * wind - 0.320 * chop,
        0.055 * wind - 0.220 * chop);
      this.actionPivot.rotation.set(
        -0.12 * wind + 0.34 * chop,
        0.12 * wind + 0.30 * chop,
        -0.35 * wind - 1.25 * chop, "YXZ");
      return;
    }
    if (mode === "cut") {
      // 上了刺刀的枪：挥砍。刀刃从右上抡向左下的一道短弧 —— 幅度比大刀小
      // （枪沉、双手握持点分得开，抡不出 175°），但爆发段同样短促。
      const windUp = Ease.Out(Ease.Seg(t, 0.00, 0.16));
      const release = Ease.In(Ease.Seg(t, 0.16, 0.42));
      const recover = Ease.Out(Ease.Seg(t, 0.46, 0.88));
      const wind = windUp - release;
      const chop = release - recover;
      this.swingPivot.rotation.set(-0.50 * wind + 0.90 * chop, -0.16 * wind - 0.55 * chop,
        0.10 * wind + 0.30 * chop, "YXZ");
      this.actionPivot.position.set(
        0.045 * wind - 0.120 * chop,
        0.040 * wind - 0.150 * chop,
        0.050 * wind - 0.160 * chop);
      this.actionPivot.rotation.set(
        -0.10 * wind + 0.22 * chop,
        0.10 * wind + 0.28 * chop,
        -0.20 * wind - 0.55 * chop, "YXZ");
      return;
    }
    if (mode === "thrust") {
      // 拼刺：先后撤蓄力再直捅出去。蓄力越足（power）捅得越深。
      const pull = Ease.Out(Ease.Seg(t, 0.00, 0.22));
      const push = Ease.In(Ease.Seg(t, 0.22, 0.45));
      const back = Ease.Out(Ease.Seg(t, 0.50, 1.00));
      const reach = (push - back) * Mix(0.80, 1.25, Clamp01(power));
      this.actionPivot.position.set(-0.06 * pull + 0.05 * reach, 0.03 * pull + 0.02 * reach, 0.11 * pull - 0.34 * reach);
      this.actionPivot.rotation.set(0.10 * pull - 0.06 * reach, 0.16 * pull - 0.14 * reach, -0.10 * pull, "YXZ");
      return;
    }
    // 枪托砸：短促的横向弧线。蓄力只放大力道，不拖时间
    const hit = Ease.Pulse(t) * Mix(0.85, 1.25, Clamp01(power));
    this.actionPivot.position.set(-0.16 * hit, 0.06 * hit, -0.12 * hit);
    this.actionPivot.rotation.set(0.20 * hit, -0.70 * hit, 0.55 * hit, "YXZ");
  }

  /** Source channels are baked in Blender; existing grip/arm IK follows the animated weapon. */
  _AnimMeleeBaked(pose) {
    const frame = SampleMeleeFirstPerson(pose);
    if (!frame || !this.rig) return;
    this.actionPivot.position.set(frame[0], frame[1], frame[2]);
    this.actionPivot.rotation.set(frame[3], frame[4], frame[5], "YXZ");
    this.swingPivot.rotation.set(frame[6] || 0, frame[7] || 0, frame[8] || 0, "YXZ");
    if (pose.state === "qte") {
      const struggle = 1 - pose.progress;
      this.actionPivot.position.z += struggle * 0.12;
      this.actionPivot.position.y += Math.sin(this.elapsed * 43) * (0.003 + struggle * 0.008);
    }
    this.lastMeleeClip = pose.clip;
  }

  /**
   * 投弹：抡臂 → 出手 → 跟随。
   * offhand=true 时是"左手掏一颗、右手把枪垂下"，这才是端着步枪扔手榴弹的样子。
   */
  _AnimThrow(t, power, offhand) {
    const cock = Ease.Out(Ease.Seg(t, 0.00, 0.32));
    const whip = Ease.In(Ease.Seg(t, 0.32, 0.48));
    const follow = Ease.Out(Ease.Seg(t, 0.48, 1.00));
    const amp = Mix(0.65, 1.0, Clamp01(power));

    if (offhand) {
      this.riggedArms?.SetContactWeight("l", 0);
      // 步枪单手垂到右下，视野让出来
      const lower = Clamp01(cock - follow * 0.9);
      this.actionPivot.position.set(0.04 * lower, -0.12 * lower, 0.05 * lower);
      this.actionPivot.rotation.set(-0.45 * lower, 0.25 * lower, 0.30 * lower, "YXZ");
      const hand = this.handLeft.group;
      const swing = (cock * -1 + whip * 2.2 - follow * 1.1) * amp;
      hand.position.set(
        this.handBase.left.x - 0.10 * cock * amp + 0.05 * whip,
        this.handBase.left.y + 0.06 * cock * amp + 0.16 * whip * amp - 0.10 * follow,
        this.handBase.left.z + 0.22 * cock * amp - 0.40 * whip * amp + 0.10 * follow);
      hand.rotation.set(
        this.handBaseRot.left.x + swing * 0.8,
        this.handBaseRot.left.y - swing * 0.4,
        this.handBaseRot.left.z, "YXZ");
    } else {
      const swing = (cock * -1 + whip * 2.4 - follow * 1.2) * amp;
      this.actionPivot.position.set(
        -0.04 * cock + 0.06 * whip,
        0.10 * cock * amp + 0.18 * whip * amp - 0.12 * follow,
        0.26 * cock * amp - 0.46 * whip * amp + 0.14 * follow);
      this.actionPivot.rotation.set(swing * 0.9, -0.35 * cock + 0.30 * whip, 0.25 * cock, "YXZ");
    }

    // 出手：0.48 那一帧脱手
    if (t >= 0.48 && this.action && !this.action.released) {
      this.action.released = true;
      if (offhand) this.offhandGrenade.visible = false;
      else if (this.rig.parts.grenade) this.rig.parts.grenade.visible = false;
      if (this.onThrowRelease) {
        const out = new THREE.Vector3();
        (offhand ? this.handLeft.group : this.weaponMount).getWorldPosition(out);
        this.root.worldToLocal(out);
        out.divide(this.compensation);
        this.root.localToWorld(out);
        this.onThrowRelease(out, power);
      }
    }
    if (t > 0.85 && this.rig.parts.grenade) this.rig.parts.grenade.visible = true;
  }

  // -------------------------------------------------------------------------
  // 特效
  // -------------------------------------------------------------------------

  _StepFlash(dt) {
    if (!this.flash.visible) return;
    this.flashTime += dt;
    // 45 ms：比一帧长一点点，60fps 下必定被看到 2—3 帧，但不会拖成"手电筒"
    const life = Clamp01(this.flashTime / 0.045);
    if (life >= 1) { this.flash.visible = false; return; }
    const shrink = 1 - life * life;
    this.flash.scale.setScalar(Mix(0.4, 1.35, shrink));
    this.flash.rotation.z += dt * 6;
  }

  _SpawnShell(rnd) {
    if (!this.rig) return;
    const slot = this.debris.find((d) => d.alive <= 0);
    if (!slot) return;                          // 池子满了就不抛 —— 宁可少一个壳，不要爆内存
    this.rig.group.updateWorldMatrix(true, false);
    const local = this._tmpVec.copy(this.rig.ejectAt);
    this.rig.group.localToWorld(local);
    this.root.worldToLocal(local);
    slot.mesh.position.copy(local);
    slot.mesh.visible = true;
    // 碎屑挂在 root 上（没被 fovRig 压缩），所以要手动补上同一个缩放，
    // 否则弹壳会比它刚从里面跳出来的那支枪大三成
    slot.mesh.scale.setScalar(this.compensation.x);
    slot.alive = 1;
    slot.life = 0;
    // 抛壳方向：右上前方，速度带一点确定性抖动
    slot.velocity.set(1.9 + rnd() * 0.8, 1.4 + rnd() * 0.7, -0.3 + rnd() * 0.5);
    slot.spin.set(12 + rnd() * 10, 6 + rnd() * 8, 9 + rnd() * 6);
    if (this.onEject) this.onEject(local);
  }

  _SpawnClipToss(isMagazine = false) {
    const slot = this.debris.find((d) => d.alive <= 0);
    if (!slot) return;
    const rnd = Mulberry32(HashString(`${this.seed}:clip:${this.shotIndex}`));
    this.rig.group.updateWorldMatrix(true, false);
    const local = this._tmpVec.copy(this.rig.clipSeat);
    this.rig.group.localToWorld(local);
    this.root.worldToLocal(local);
    slot.mesh.position.copy(local);
    slot.mesh.visible = true;
    // 空桥夹/空弹匣比弹壳大：借同一个网格放大，省一份几何
    const c = this.compensation.x;
    slot.mesh.scale.set(c * (isMagazine ? 3.2 : 2.0), c * (isMagazine ? 3.6 : 1.4), c * (isMagazine ? 1.6 : 1.1));
    slot.alive = 1;
    slot.life = 0;
    slot.velocity.set(0.9 + rnd() * 0.5, 0.9 + rnd() * 0.4, 0.4 + rnd() * 0.4);
    slot.spin.set(5 + rnd() * 4, 3 + rnd() * 3, 7 + rnd() * 4);
  }

  /**
   * 碎屑在 root（相机）空间里飞。
   * 这是个明知的近似：严格说弹壳应该留在世界里，但视图模型没有世界的引用，
   * 而 0.6 秒的生命期里玩家根本分辨不出它有没有跟着镜头走。
   * 真要世界里的弹壳，用 onEject 回调在外面生成。
   */
  _StepDebris(dt) {
    for (const slot of this.debris) {
      if (slot.alive <= 0) continue;
      slot.life += dt;
      if (slot.life > 0.62) { slot.alive = 0; slot.mesh.visible = false; continue; }
      slot.velocity.y -= 9.8 * dt;
      slot.mesh.position.addScaledVector(slot.velocity, dt);
      slot.mesh.rotation.x += slot.spin.x * dt;
      slot.mesh.rotation.y += slot.spin.y * dt;
      slot.mesh.rotation.z += slot.spin.z * dt;
    }
  }

  // -------------------------------------------------------------------------

  Dispose() {
    this._ClearRig();
    if (this.riggedArms) this.riggedArms.Dispose();
    this.body?.Dispose();
    const seen = new Set();
    this.root.traverse((node) => {
      if (node.isMesh && node.geometry && !seen.has(node.geometry)) {
        seen.add(node.geometry);
        node.geometry.dispose();
      }
    });
    for (const hand of [this.handRight, this.handLeft, this.sleeveRight, this.sleeveLeft]) {
      for (const mesh of hand.meshes) if (mesh.geometry) mesh.geometry.dispose();
    }
    if (this.root.parent) this.root.parent.remove(this.root);
    // 材质是从 MaterialLibrary 里借的（共享），由 library.Dispose() 统一释放，这里不动
    this.debris.length = 0;
  }
}

export default Viewmodel;
