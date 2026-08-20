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
// 3) 不许骨骼蒙皮。深度法线预通道用 scene.overrideMaterial 覆盖全场，
//    SkinnedMesh 在那一 pass 会塌到原点，AO 直接变乱码。手指全是 Object3D 层级。
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
import { WEAPONS } from "./Data_Weapons.mjs";
import { Mulberry32, HashString, Clamp, Clamp01, Mix } from "./Script_Noise.mjs";
import { MakeBox, MergeGeometries } from "./Script_Geo.mjs";
import { MarkNoPrepass } from "./Script_Post.mjs";
import { DIFFICULTY } from "./Data_Battle.mjs";
import { InstantiateModel } from "./Script_MeshLoad.mjs";
import { WEAPON_MESH_BY_ID } from "./Data_Meshes.mjs";

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

/**
 * 铁瞄偏心。ER2 的作者 Marco 亲自回帖确认过：**照门不落在屏幕正中是故意的**。
 * 我们原来的 _MakeAdsPose 是 px:-s.x, py:-s.y —— 把照门精确平移到屏幕几何中心，
 * 也就是"开了镜就等于有准星"，那"没有准星"这条设定就没有物理支撑了。
 *
 * 单位换算（别拍脑袋填米）：开镜时世界 FOV 约 55°×0.72 ≈ 39.6°，900 px 高的屏幕上
 * 一个像素 = 39.6/900 度；照门离眼 SIGHT_EYE_DISTANCE = 0.300 m，
 * 于是 1 px 屏幕当量 = tan(39.6/900 °) × 0.300 ≈ 2.30e-4 m。
 * **这个数跟着眼距走**：眼距从 0.155 改到 0.300 时它没跟着改的话，
 * 偏心量会凭空缩一半（同样的米数在两倍远处只有一半的角）。
 * 幅度取 4—8 px：汉阳造是老套筒，枪龄大、膛线磨得厉害，偏得比中正式明显。
 * 只给横向留大头、纵向只有 2 px —— 纵向偏多了上护盖会爬进画面挡住准星。
 */
const SIGHT_OFFSET_PER_PX = 2.30e-4;
const IRON_SIGHT_OFFSET_PX = {
  ZhongZheng: { x: 4, y: 2 },
  HanYang: { x: 8, y: 2 },
  Zb26: { x: 5, y: 1 },
  Mauser96: { x: 6, y: 2 },
  Type38: { x: 5, y: 2 },
};
const IRON_SIGHT_OFFSET_DEFAULT = { x: 5, y: 2 };

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
        repeat: 1, roughness: 0.88, metalness: 0.84, normalScale: 0.20,
        color: TintTo(STEEL_BASE, 0x72767c), tintId: "vmSteel",
      },
      { color: 0x72767c, roughness: 0.88, metalness: 0.84 }),
    // 枪托是打磨过的胡桃木/榆木，比门板亮一档；normalScale 压到 0.24，
    // 同理：木纹格距从 0.34 收到 0.085 之后，0.6 的法线强度会把木纹凿成沟
    wood: SafeMaterial(library, "WoodStock", { repeat: 1, roughness: 0.68, metalness: 0, normalScale: 0.24 },
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
      skin.push(Tube(radii[i + 1], radii[i], len, 6, TIP,
        { x: px + dx * len * 0.5, y: py + dy * len * 0.5, z: pz + dz * len * 0.5, rx: ang, ry }));
      px += dx * len; py += dy * len; pz += dz * len;
    }
    // 指尖收个圆头，免得看到一个平切面
    skin.push(Tube(radii[radii.length - 1] * 0.55, radii[radii.length - 1], 0.006, 6, TIP,
      { x: px, y: py, z: pz, rx: ang, ry }));
  };

  // 掌：两段收锥（指根宽、腕端窄）。一整块 76×82 的板是"手是方料"的头号来源
  skin.push(Box(0.076, 0.028, 0.046, VM_TILE.cloth, `${key}palmA`, { x: 0, y: -0.024, z: 0.008, rx: 0.10 }));
  skin.push(Box(0.062, 0.026, 0.044, VM_TILE.cloth, `${key}palmB`, { x: 0, y: -0.030, z: -0.032, rx: 0.06 }));
  // 掌指关节那一排：握拳时最先顶出来的一条横棱，做成圆的
  skin.push(Tube(0.013, 0.013, 0.072, 6, TIP, { x: 0, y: -0.016, z: 0.028, rx: 0, ry: Math.PI / 2 }));
  // 小鱼际（小指侧掌沿）：手不是左右对称的板，这一坨让它有握持的厚度
  skin.push(Tube(0.014, 0.011, 0.062, 6, TIP,
    { x: -S * 0.031, y: -0.028, z: -0.008, rx: 0.08, ry: 0.10 * S }));

  // 四指。i=0 是食指侧：最长、卷得最少；到小指逐根变短变细、卷得更深 ——
  // 握住圆柱时四指本来就不齐，这一点差异就是"手"和"梳子"的分界。
  const pitch = 0.0182;
  for (let i = 0; i < 4; i += 1) {
    const x = (i - 1.5) * pitch * S;
    const k = 1 - i * 0.075;                       // 逐根变短
    const r0 = 0.0078 * (1 - i * 0.05);            // 逐根变细
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

  // 腕：收锥的圆管接进袖口，不再是一块 50×46×52 的方盒
  skin.push(Tube(0.026, 0.030, 0.058, 8, TIP, { x: 0, y: -0.048, z: -0.056, rx: 0.28 }));

  // 袖口（军装布料）：圆的，比腕粗一圈，翻边做成一道薄环。
  // 原来是三个方盒，其中 cuffA 有 64×62 mm —— 比手腕粗一倍，像戴了个纸箱。
  cloth.push(Tube(0.034, 0.031, 0.090, 8, VM_TILE.cloth, { x: 0, y: -0.062, z: -0.112, rx: 0.28 }));
  cloth.push(Tube(0.037, 0.037, 0.014, 8, VM_TILE.cloth, { x: 0, y: -0.055, z: -0.076, rx: 0.28 }));
  // 小臂只露一小截：再长就会在开镜时糊住半个屏幕
  cloth.push(Tube(0.033, 0.031, 0.078, 8, VM_TILE.cloth, { x: 0, y: -0.078, z: -0.182, rx: 0.30 }));

  return { skin, cloth };
}

/** 组装一只手为 Group（原点 = 握持点），返回 { group, meshes }。 */
function MakeHand(materials, side, key) {
  const parts = BuildHandGeometry(side, key);
  const group = new THREE.Group();
  group.name = side > 0 ? "HandRight" : "HandLeft";
  const meshes = [
    MakePart(parts.skin, materials.skin),
    MakePart(parts.cloth, materials.cloth),
  ];
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

/** 木柄手榴弹：铸铁弹体 φ58×90 + 木柄 φ29×128，全长 220 mm（考据值）。 */
function BuildGrenadeProp(materials, key) {
  const steel = [];
  const wood = [];
  steel.push(Tube(0.029, 0.029, 0.090, 12, VM_TILE.steel, { x: 0, y: 0, z: -0.055, rx: 0 }));
  // 巩式质量参差，弹体常见竖向铸造纹（不是德式那种规整滚花）
  for (let i = 0; i < 6; i += 1) {
    const a = (i / 6) * Math.PI * 2;
    steel.push(Box(0.005, 0.005, 0.086, VM_TILE.steel, `${key}rib${i}`,
      { x: Math.cos(a) * 0.029, y: Math.sin(a) * 0.029, z: -0.055 }));
  }
  wood.push(Tube(0.0145, 0.0145, 0.128, 10, VM_TILE.wood, { x: 0, y: 0, z: 0.054 }));
  steel.push(Tube(0.016, 0.016, 0.012, 10, VM_TILE.steel, { x: 0, y: 0, z: 0.112 }));

  const group = new THREE.Group();
  AddPart(group, MakePart(steel, materials.steel));
  AddPart(group, MakePart(wood, materials.wood));
  return group;
}

function BuildGrenade(materials, weapon, key) {
  const group = new THREE.Group();
  const prop = BuildGrenadeProp(materials, key);
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

/** 大刀：全长 900 / 刃长 595 / 最宽 57、最窄 38 / 柄尾铁环 φ76（考据值）。 */
function BuildDadao(materials, weapon, key) {
  const steel = [];
  const cloth = [];

  // 刀身：从护手处 38 mm 渐宽到前段 57 mm，刀尖斜切（雁翎过渡，不是日式弧刃）
  const segments = 5;
  const bladeLen = 0.595;
  for (let i = 0; i < segments; i += 1) {
    const t0 = i / segments;
    const width = Mix(0.040, 0.058, Math.pow(t0, 0.7));
    const segLen = bladeLen / segments;
    steel.push(Box(0.0058, width, segLen * 1.02, VM_TILE.steel, `${key}blade${i}`,
      { x: 0, y: 0.006 + width * 0.02, z: -0.115 - segLen * (i + 0.5) }));
  }
  // 斜切刀尖
  steel.push(Box(0.0058, 0.052, 0.070, VM_TILE.steel, `${key}tip`, { x: 0, y: 0.004, z: -0.740, rx: 0.30 }));
  // 刀背加厚（5—6 mm，宽厚是西北军大刀的特征，不做薄片）
  steel.push(Box(0.0075, 0.010, bladeLen, VM_TILE.steel, `${key}spine`, { x: 0, y: 0.028, z: -0.115 - bladeLen / 2 }));

  // 护手：一小片铁，不是圆盘
  steel.push(Box(0.014, 0.090, 0.024, VM_TILE.steel, `${key}guard`, { x: 0, y: 0.004, z: -0.106 }));

  // 柄 215 mm，缠布
  cloth.push(Tube(0.017, 0.017, 0.200, 10, VM_TILE.cloth, { x: 0, y: 0, z: 0.005 }));
  for (let i = 0; i < 7; i += 1) {
    cloth.push(Box(0.037, 0.037, 0.006, VM_TILE.cloth, `${key}wrap${i}`, { x: 0, y: 0, z: -0.080 + i * 0.028, rz: 0.25 }));
  }
  // 柄尾铁环 —— 大刀必有，缺了就不是西北军的刀
  steel.push(new THREE.TorusGeometry(0.036, 0.0055, 6, 14).rotateY(Math.PI / 2).translate(0, 0, 0.132));

  const group = new THREE.Group();
  AddPart(group, MakePart(steel, materials.steel));
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
      // ry = π 的理由与 MODEL_FP_TWEAK.Dadao 那条一样：小臂要顺着刀柄往身体方向
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
  Grenade: BuildGrenade,
  GrenadeBundle: BuildGrenade,
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
// 大刀 / 手榴弹没有可动件，换过去零损失。中正式 / 汉阳造 / 驳壳枪走导入的
// 历史枪模：剪影对了，拉栓动画暂时没有（模型 joints 仍是 0）。
const MODEL_FP = new Set(["Dadao", "Grenade", "GrenadeBundle", "ZhongZheng", "HanYang", "Mauser96"]);

/** 模型里的材质名 -> 视图模型这套材质。加载器不造材质，名字得在这里落地。 */
const VM_MATERIAL_BY_MESH = {
  steel: "steel", wood: "wood", accessory: "cloth", red: "redCloth",
  leather: "leather", uniform: "cloth", skin: "skin", helmet: "steel",
  accentA: "redCloth", accentB: "brass", shoe: "leather",
};

/**
 * 每把枪在**第一人称手里**的摆法。模型的规范系是"右手握把 = 原点、刃/柄朝 -Z"，
 * 而第一人称要把它端到眼前、稍微立起来一点，所以这里给一层姿态修正。
 * 手的**朝向**推不出来（挂点只有位置没有旋转），沿用手搭 rig 里调好的那几个角。
 */
const MODEL_FP_TWEAK = {
  Dadao: {
    pose: { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0 },
    // ry = π：**小臂朝哪边伸**。手的局部 -Z 是小臂方向（袖口/前臂那三根管子都摆在
    // z < 0 一侧，见 BuildHandGeometry），原来 ry = 0 让小臂顺着武器的 -Z 伸出去 ——
    // 那是刀身的方向。旧姿态里刀平举向前，小臂跟着指向画面深处还看不出毛病；
    // 新姿态把刀立起来之后，两条小臂就变成两截灰盒子横在刀身上，把刀刃挡掉一半。
    // 加 π 之后小臂改朝武器 +Z（刀柄、柄尾环那一侧），也就是顺着握把往下、往画外
    // 伸回身体 —— 这才是双手握刀该有的样子，画面里也只剩下拳头。
    handRot: { right: [0, Math.PI, -1.52], left: [0, Math.PI, 1.60] },
  },
  Grenade: {
    // 弹体朝前上方：跟手搭 rig 里 prop.rotation.x = -0.35 是同一个角
    pose: { x: 0, y: 0.02, z: -0.02, rx: -0.35, ry: 0, rz: 0 },
    handRot: { right: [0.30, 0, -1.52], left: [0.10, 0.5, 1.30] },
  },
  ZhongZheng: {
    pose: { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0 },
    handRot: { right: [0.08, 0, -1.52], left: [0.18, 0.35, 1.35] },
  },
  HanYang: {
    pose: { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0 },
    handRot: { right: [0.08, 0, -1.52], left: [0.18, 0.35, 1.35] },
  },
  Mauser96: {
    pose: { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0 },
    handRot: { right: [0.12, 0, -1.50], left: [0.10, 0.4, 1.30] },
  },
};

/**
 * 拿一个 TZM 文档搭第一人称的 rig。契约与 BuildBoltRifle 那几个完全一致，
 * 所以 Equip / 开镜 / 枪口焰 / 深度预算一行都不用改。读不到就返回 null，
 * 调用方退回手搭的 rig —— 少一个模型不能让人空着手。
 */
function BuildFromModel(materials, weapon, key, doc) {
  const tweak = MODEL_FP_TWEAK[key] || MODEL_FP_TWEAK[key.replace("Bundle", "")]
    || { pose: { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0 }, handRot: { right: [0, 0, -1.5], left: [0, 0, 1.6] } };
  const table = {};
  for (const [meshName, vmName] of Object.entries(VM_MATERIAL_BY_MESH)) {
    if (materials[vmName]) table[meshName] = materials[vmName];
  }
  let built = null;
  try {
    built = InstantiateModel(doc, { materials: table });
  } catch (error) {
    console.warn(`[Viewmodel] ${key} 模型实例化失败：${String(error).slice(0, 160)}`);
    return null;
  }
  if (!built || !built.nodes.has("muzzle")) return null;

  const group = new THREE.Group();
  group.name = `VmModel_${key}`;
  built.root.position.set(tweak.pose.x, tweak.pose.y, tweak.pose.z);
  built.root.rotation.set(tweak.pose.rx, tweak.pose.ry, tweak.pose.rz, "XYZ");
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
  const magazine = Mount("magazine", new THREE.Vector3(0, 0, -0.08));
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
  clipSeat.y += 0.045;
  const hr = tweak.handRot.right;
  const hl = tweak.handRot.left;

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
      right: { x: gripR.x, y: gripR.y, z: gripR.z, rx: hr[0], ry: hr[1], rz: hr[2] },
      left: { x: gripL.x, y: gripL.y, z: gripL.z, rx: hl[0], ry: hl[1], rz: hl[2] },
    },
    boltHandle,
    source: "model",
  };
}

/**
 * 各武器的腰射姿态（枪在画面里的位置）。
 * 这张表是最该反复调的东西：枪压得越低越"沉"，越靠右越像端着走。
 */
// 事故：rifle 原本 pz = -0.095，机匣后端面（局部 z = -0.095 + 0.245/2）停在离
// 相机 6.75 cm 的地方，机匣在 1600×900 上有 243 px 高 —— 一根横穿右半屏的钢梁。
// 3A 的第一人称枪机匣在这个分辨率上通常是 110—140 px。把 pz 推到 -0.320
// （后端面退到 ~29 cm）才落回那个区间。注意**只有 pz 改画面**：整体缩放绕相机
// 原点是等比的，改 depthBudget 一个像素都不动，它管的是"枪会不会插进墙里"。
const HIP_POSES = {
  rifle: { px: 0.100, py: -0.142, pz: -0.320, rx: 0.045, ry: -0.060, rz: 0.028 },
  lmg: { px: 0.100, py: -0.165, pz: -0.300, rx: 0.070, ry: -0.090, rz: 0.045 },
  pistol: { px: 0.055, py: -0.090, pz: -0.140, rx: 0.030, ry: -0.050, rz: 0.020 },
  throwable: { px: 0.130, py: -0.150, pz: -0.130, rx: 0.150, ry: -0.250, rz: 0.100 },
  // 大刀。**上一版这一行等于"没拿刀"**：pz = -0.130 把刀柄摆在眼前 13 cm，
  // 而 py = -0.165 —— 也就是握把在视线下方 atan(0.165/0.130) = 52°，而半视场只有
  // 27.5°。整只手连同刀柄全部落在画面下沿之外；刀身又几乎顺着视线方向指出去
  // （rx 只有 -0.18，等于平举向前），60 cm 的刀身在屏幕上是一条端面朝人的细线，
  // 剩下那一点点还正好被右下角的小地图盖住。逐顶点投影的取证：整把刀只有刀身
  // 那一块有 21% 的顶点落在 1600×900 里，而且全挤在 x>1217、y>755 的那个角上，
  // 手是 0%。玩家报的"拿着大刀但基本上看不到"就是这么来的，不是亮度问题
  // ——同一帧同一光照下汉阳造是看得见的。
  //
  // 这一版按"能看见"反解：
  //   · pz 从 -0.130 推到 -0.500 —— 刀是 0.9 m 的长家伙，握把离眼 13 cm 时
  //     刀身张角超过整个视场，必然要么怼脸要么出框。半米才是"举在身前"的距离。
  //     （只有 pz/px/py 的**比值**改画面：整体等比缩放绕相机原点不动一个像素，
  //     深度预算会自己把总尺度收回 0.9 m 以内，见 _RecomputeCompensation。）
  //   · rx +0.75 / ry -0.75 把刀身从"指着前方"抬成"斜举于右前"，刀尖落在
  //     画面右上（约 x1350 y240），刀柄在右下角出框 —— 一条完整的斜线。
  //   · rz +1.54 是绕刀身自转：仍让 57 mm 的刀面侧对镜头（刃朝镜头时只剩
  //     5.4 mm 厚的一条线），但把正刃转到实际挥砍的前缘。
  // 把刀沿自身轴翻到正刃在前：上一版 rz=-1.60 虽然让刀面可见，却把刀背
  // 摆在挥砍的前缘，第一眼就是反刃握刀。+1.54 保留同样的宽刃剪影，但正刃朝向
  // 下一刀真正落下的方向；同时把刀略往中线收，蓄力时才有空间继续往右上拉。
  melee: { px: 0.235, py: -0.195, pz: -0.520, rx: 0.720, ry: -0.620, rz: 1.540 },
};

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
  } = {}) {
    this.library = library;
    // 解码好的 TZM 文档（ActorFactory.PreloadMeshes 已经拉过一遍，这里复用同一份，
    // 不再自己 fetch —— 同一个模型解码两次是白花的内存与开机时间）。
    this.meshDocs = meshDocs;
    this.rigSource = "box";
    this.materials = BuildMaterials(library);
    this.fov = fov;
    this.depthBudget = depthBudget;
    this.autoBolt = autoBolt;
    this.seed = seed;

    // --- 层级：每一层只负责一件事，调试时能单独关掉任意一层 ------------------
    this.root = new THREE.Group();
    // 视图模型用自己的 FOV 缩放摆在近裁面内，它的深度不是世界深度。
    // 让它进深度法线预通道，SSAO 会在枪身边缘挖一圈黑边、运动模糊会把枪一起糊。
    // 这里在 Equip 之后统一把整棵树的材质标成 allowOverride = false。
    // 注意：**不能**遍历 this.root —— 构造完成时树里只有抛壳池和弹夹道具，
    // 手、枪身、枪口焰要到 Equip() 里才建出来并挂进去。主程序又习惯在
    // Equip 之前就调一次，结果是一个都没标上。所以这里遍历材质表（那才是全集），
    // 并且 Equip() 末尾会自己再调一次，调用方怎么调都不会漏。
    this.markNoPrepass = () => {
      for (const m of Object.values(this.materials)) MarkNoPrepass(m);
      this.root.traverse((o) => { if (o.material) MarkNoPrepass(o.material); });
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
    this.actionPivot = new THREE.Group();      // 拉栓 / 装填 / 突刺 / 投弹的整枪位移
    this.recoilPivot = new THREE.Group();      // 后坐
    this.weaponMount = new THREE.Group();      // 腰射↔开镜↔冲刺的姿态插值
    // 绕**握把**转的那一层。上面每一层的原点都在相机原点，绕它们转只会把武器
    // 整个平移过屏幕、朝向几乎不变 —— 那是"端着枪走位"，不是"抡刀"。
    // 挥刀要的是刀身自己绕手转过一百多度，只有原点落在握把上的这一层能做到
    // （weaponMount 的原点就是 rig 的原点，也就是模型规范里的右手握持点）。
    this.swingPivot = new THREE.Group();
    this.root.add(this.fovRig);
    this.fovRig.add(this.swayPivot);
    this.swayPivot.add(this.bobPivot);
    this.bobPivot.add(this.statePivot);
    this.statePivot.add(this.actionPivot);
    this.actionPivot.add(this.recoilPivot);
    this.recoilPivot.add(this.weaponMount);
    this.weaponMount.add(this.swingPivot);

    // --- 弹簧 ---------------------------------------------------------------
    // 阻尼比 0.42：明显欠阻尼，鼠标停下后枪还会甩过去一点再回来 —— 这就是"重量"
    this.swayYaw = new Spring(115, 0.42);
    this.swayPitch = new Spring(115, 0.42);
    this.swayRoll = new Spring(80, 0.55);
    // 开镜带一点点过冲（0.72 阻尼比），到位那一下有"顿"感；再低就晃得看不清准星
    this.adsSpring = new Spring(240, 0.72);
    this.sprintSpring = new Spring(90, 0.95);
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
    this.adsOffset = new THREE.Vector3();      // 本支枪的铁瞄偏心量（米），取证用
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
    this.handBase = { right: new THREE.Vector3(), left: new THREE.Vector3() };
    this.handBaseRot = { right: new THREE.Euler(), left: new THREE.Euler() };

    // --- 枪口焰 -------------------------------------------------------------
    this.flash = this._BuildFlash();
    this.flashTime = 999;

    // --- 抛壳 / 抛桥夹的小道具池 ---------------------------------------------
    this.debris = this._BuildDebrisPool(6);

    // --- 手榴弹（副手投弹用，平时藏着）---------------------------------------
    this.offhandGrenade = BuildGrenadeProp(this.materials, "offhand");
    this.offhandGrenade.visible = false;
    this.handLeft.group.add(this.offhandGrenade);
    this.offhandGrenade.position.set(0, 0.01, 0.0);
    this.offhandGrenade.rotation.set(-0.4, 0, 0);

    // --- 桥夹道具（装填用）---------------------------------------------------
    this.clipProp = this._BuildClipProp();
    this.clipProp.visible = false;
    this.weaponMount.add(this.clipProp);

    this._geometries = new Set();
    this._tmpVec = new THREE.Vector3();
    this._tmpVec2 = new THREE.Vector3();
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
  Equip(weaponId) {
    this._ClearRig();
    this.weaponId = weaponId || null;
    this.weapon = weaponId ? WEAPONS[weaponId] || null : null;
    this.action = null;
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
      return this;
    }

    // 先试 TZM 模型（MODEL_FP 里的几把），读不到或没登记就退回手搭 rig。
    // 三八式 / 捷克式仍走手搭：外部免费模要 Sketchfab 登录，且程序化剪影（防尘盖、上插直匣）不能错。
    const meshId = MODEL_FP.has(weaponId) ? WEAPON_MESH_BY_ID[weaponId] : null;
    const doc = meshId && this.meshDocs ? this.meshDocs.get(meshId) : null;
    this.rig = doc ? BuildFromModel(this.materials, this.weapon, weaponId, doc) : null;
    if (!this.rig) {
      const builder = BUILDERS[weaponId] || BuildBoltRifle;
      this.rig = builder(this.materials, this.weapon, weaponId);
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

    // 姿态表
    const kind = PoseKindOf(this.weapon);
    this.hipPose = { ...HIP_POSES[kind] };
    this.adsPose = this._MakeAdsPose(kind);
    this.sprintPose = this._MakeSprintPose(kind);

    this._CollectAdsHideParts();

    // 深度预算：整体等比缩 s（画面不变，但枪不再插墙）
    this._RecomputeCompensation(60);

    // 掏枪动画
    this.equipSpring.Set(0);
    // 每次换枪都会重建整棵 rig：新建出来的材质必须重新退出深度法线预通道。
    // 漏了的后果不是“预通道多画一遍”那么轻：枪把自己 0.1—0.9 m 的深度
    // 写进法线深度图，SSAO 就在枪所在的那块屏幕区域算出几乎全遮蔽，
    // 而枪自己的材质又正好采样那张图（MaterialLibrary 给每份材质都注了 SSAO）——
    // 于是整支枪的间接光被乘成 0，画面下方就是一坨黑。
    if (this.markNoPrepass) this.markNoPrepass();
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
    for (const mesh of this.handRight.meshes) this.adsHideParts.push(mesh);
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
  _MakeAdsPose(kind) {
    if (!this.rig || !this.rig.sight) {
      this.adsOffset.set(0, 0, 0);
      // 大刀的"开镜"是架刀预备：双手把刀提到胸前、刀身更竖更靠中线，
      // 刀尖压进画面上沿以内。**不能沿用旧的那组数**（pz -0.055 把刀柄贴在眼球上，
      // 和旧腰射姿态一样整只手都在画外），理由见 HIP_POSES.melee 那段账。
      if (kind === "melee") return { px: 0.175, py: -0.170, pz: -0.470, rx: 0.900, ry: -0.540, rz: -1.500 };
      return { px: 0.045, py: -0.055, pz: -0.070, rx: 0.28, ry: -0.10, rz: 0.05 };
    }
    const s = this.rig.sight;
    // 偏心量挂难度（体验档 0 = 照门回到正中，写实档 1.4 倍）
    const px = IRON_SIGHT_OFFSET_PX[this.weaponId] || IRON_SIGHT_OFFSET_DEFAULT;
    const gain = SIGHT_OFFSET_PER_PX * (DIFFICULTY.ironSightOffset ?? 1);
    this.adsOffset.set(px.x * gain, px.y * gain, 0);
    return {
      px: -s.x + this.adsOffset.x,
      py: -s.y + this.adsOffset.y,
      pz: -SIGHT_EYE_DISTANCE - s.z,
      rx: 0, ry: 0, rz: 0,
    };
  }

  /** 冲刺：枪斜向下约 40°，同时向右外侧甩开，视野让出来。 */
  _MakeSprintPose(kind) {
    const base = HIP_POSES[kind];
    // 大刀不能套这组绝对角：rx/ry/rz 是照着"枪口朝前"写的，把它们盖到刀上等于
    // 把刀重新平举回视线方向 —— 又变回看不见的那一版。刀的冲刺是"刀锋压低、
    // 往右外侧带"，所以从它自己的腰射姿态上做增量。
    if (kind === "melee") {
      return {
        px: base.px + 0.020,
        py: base.py - 0.030,
        pz: base.pz + 0.020,
        // 刀尖从"斜举"压到略低于水平（rx 0.75 -> -0.10），整把刀落到画面右下角，
        // 中间那块视野让出来。压过头（试过 -0.52 那一版）刀会整个沉出下沿，
        // 冲刺时又变成"手里没东西"——这正是这轮要修的毛病，不能在冲刺上重犯。
        rx: base.rx - 0.85,
        ry: base.ry + 0.10,
        rz: base.rz + 0.35,
      };
    }
    return {
      px: base.px + 0.045,
      py: base.py - 0.055,
      pz: base.pz + 0.055,
      rx: -0.70,          // -Z 前向绕 +X 转负角 = 枪口下压，约 40°
      ry: 0.44,
      rz: 0.30,
    };
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
      if (this.rig.parts.bayonet) deepest += 0.02;
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

  _ClearRig() {
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

  /** 近战：有刺刀的枪突刺，大刀劈砍，其余用枪托/枪管砸。 */
  TriggerMelee() {
    if (!this.weapon || !this.rig) return false;
    if (this.IsBusy()) return false;
    const isBlade = this.weapon.kind === "melee";
    const duration = isBlade ? (this.weapon.swingTimeS || 0.62) : 0.55;
    this._StartAction("melee", duration);
    this.action.melee = isBlade ? "slash" : (this.weapon.bayonet ? "thrust" : "bash");
    if (this.rig.parts.bayonet) this.rig.parts.bayonet.visible = true;
    return true;
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
    return this.action.kind === "bolt" || this.action.kind === "reload" || this.action.kind === "melee";
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
    const sprintValue = this.sprintSpring.Step(step, sprint * (1 - adsInput) * (grounded ? 1 : 0));
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

    // --- 自由瞄准：枪口偏离视线中心的那一段，**画出来** ---------------------
    // 这条以前一行都没有：Script_Player 里 aimYaw/aimPitch 一直在动（弹道也照它走），
    // 可相机只读 yaw/pitch、视图模型只读帧间增量，于是 2° 以内推鼠标画面上
    // 一动不动 —— 本作又**没有准星**，等于小幅移动完全没有反馈。
    // 枪就是准星：绕相机原点转同样的角度，枪在画面里挪过的正好是弹道偏离的角度
    // （55° 视场 1080 p 上 1° ≈ 20 px，一个鼠标计数 ≈ 2.5 px，看得见）。
    // 开镜时不衰减：那时自由瞄准本来就只剩 0.56°，衰减掉就等于铁瞄在骗人。
    const freeAimYaw = Clamp(input.freeAimYaw ?? 0, -0.25, 0.25);
    const freeAimPitch = Clamp(input.freeAimPitch ?? 0, -0.25, 0.25);
    this.root.rotation.set(freeAimPitch, freeAimYaw, 0, "YXZ");

    // --- 摇摆：枪滞后于视线，停下后过冲一点再回来 ---------------------------
    // 传进来的是"这一帧转了多少弧度"，先换算成角速度，否则帧率一变手感就变
    const rate = step > 1e-5 ? 1 / step : 0;
    const yawRate = (input.lookDeltaYaw || 0) * rate;
    const pitchRate = (input.lookDeltaPitch || 0) * rate;
    const swayGain = (this.weapon ? this.weapon.swayScale ?? 1 : 1) * Mix(1, 0.35, ads);
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
    const bobScale = gait * Mix(1, 0.15, Clamp01(ads)) * Mix(1, 0.55, crouchValue);
    const ampX = Mix(0.013, 0.030, sprint) * bobScale;
    const ampY = Mix(0.009, 0.020, sprint) * bobScale;
    const phase = this.bobPhase;
    // 8 字：横向一倍频、纵向二倍频；再叠一个 |sin| 的落脚下沉
    const bobX = Math.sin(phase) * ampX;
    const bobY = Math.sin(phase * 2) * ampY * 0.5 - Math.abs(Math.sin(phase)) * ampY;
    // 站着不动时的呼吸：幅度只有走路的十分之一，但没有它枪就是"钉死"的
    const idle = (1 - gait) * Mix(1, 0.25, Clamp01(ads));
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
    if (this.rig) {
      const pose = this._MixPose(this.hipPose, this.adsPose, ads);
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
    if (a.t >= 1) {
      this._EndAction(a);
      return;
    }
    switch (a.kind) {
      case "bolt": this._AnimBolt(a.t, this.pendingHoldOpen); break;
      case "reload": this._AnimReload(a.t, a.reloadKind); break;
      case "melee": this._AnimMelee(a.t, a.melee); break;
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
    if (a.kind === "melee" && this.rig.parts.bayonet) this.rig.parts.bayonet.visible = false;
    if (a.kind === "throw") this.offhandGrenade.visible = false;
    this.action = null;
    if (this.onActionEnd) this.onActionEnd(a.kind);
  }

  /** 把所有会被动画改动的东西恢复到静止姿态。 */
  _ResetAnimatedParts() {
    this.actionPivot.position.set(0, 0, 0);
    this.actionPivot.rotation.set(0, 0, 0);
    this.swingPivot.rotation.set(0, 0, 0);
    if (!this.rig) return;
    this.handRight.group.position.copy(this.handBase.right);
    this.handRight.group.rotation.copy(this.handBaseRot.right);
    this.handLeft.group.position.copy(this.handBase.left);
    this.handLeft.group.rotation.copy(this.handBaseRot.left);
    const bolt = this.rig.parts.bolt;
    if (bolt && !this.boltOpen) { bolt.position.z = 0; bolt.rotation.z = 0; }
    const cover = this.rig.parts.dustCover;
    if (cover && !this.boltOpen) cover.position.z = 0;
    const mag = this.rig.parts.magazine;
    if (mag) { mag.position.set(0, 0, 0); mag.visible = true; }
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

    const lift = Ease.InOut(Ease.Seg(t, 0.00, 0.22));
    const back = Ease.InOut(Ease.Seg(t, 0.20, 0.52));
    const fwd = holdOpen ? 0 : Ease.InOut(Ease.Seg(t, 0.55, 0.82));
    const drop = holdOpen ? 0 : Ease.InOut(Ease.Seg(t, 0.80, 1.00));

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
    if (kind === "topMag") return this._AnimReloadTopMag(t);
    if (kind === "hopper") return this._AnimReloadHopper(t);
    return this._AnimReloadStripper(t);
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

    // 枪抬到胸前偏左，机匣朝上 —— 真人装填就是这个角度，也让玩家看得见弹仓
    const raise = Ease.InOut(Ease.Seg(t, 0.00, 0.18)) - Ease.InOut(Ease.Seg(t, 0.88, 1.00));
    this.actionPivot.position.set(-0.055 * raise, 0.045 * raise, 0.055 * raise);
    this.actionPivot.rotation.set(0.10 * raise, 0.40 * raise, -0.55 * raise, "YXZ");

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
    const handTarget = this._tmpVec.set(seat.x + 0.02, seat.y + 0.05, seat.z + 0.06);
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
    this.actionPivot.position.set(-0.045 * tilt, 0.030 * tilt, 0.050 * tilt);
    this.actionPivot.rotation.set(0.06 * tilt, 0.34 * tilt, -0.42 * tilt, "YXZ");

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

  /** 十一年式漏斗：把 6 个桥夹压进左侧弹斗、盖上压弹板。玩家一般用不到，留给 AI 展示。 */
  _AnimReloadHopper(t) {
    const raise = Ease.Pulse(t);
    this.actionPivot.position.set(-0.05 * raise, 0.03 * raise, 0.05 * raise);
    this.actionPivot.rotation.set(0.05 * raise, 0.5 * raise, -0.5 * raise, "YXZ");
    const off = Ease.Pulse(Ease.Seg(t, 0.1, 0.9));
    this.handRight.group.position.x = this.handBase.right.x - off * 0.10;
    this.handRight.group.position.y = this.handBase.right.y + off * 0.12;
  }

  /** 近战：刺刀突刺 / 大刀劈砍 / 枪托砸。 */
  _AnimMelee(t, mode) {
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
    if (mode === "thrust") {
      // 拼刺：先后撤蓄力再直捅出去。刺刀只在这一下亮出来（平时收起，见 BuildBoltRifle 注释）
      const pull = Ease.Out(Ease.Seg(t, 0.00, 0.22));
      const push = Ease.In(Ease.Seg(t, 0.22, 0.45));
      const back = Ease.Out(Ease.Seg(t, 0.50, 1.00));
      const reach = push - back;
      this.actionPivot.position.set(-0.06 * pull + 0.05 * reach, 0.03 * pull + 0.02 * reach, 0.11 * pull - 0.34 * reach);
      this.actionPivot.rotation.set(0.10 * pull - 0.06 * reach, 0.16 * pull - 0.14 * reach, -0.10 * pull, "YXZ");
      return;
    }
    // 枪托砸：短促的横向弧线
    const hit = Ease.Pulse(t);
    this.actionPivot.position.set(-0.16 * hit, 0.06 * hit, -0.12 * hit);
    this.actionPivot.rotation.set(0.20 * hit, -0.70 * hit, 0.55 * hit, "YXZ");
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
    const seen = new Set();
    this.root.traverse((node) => {
      if (node.isMesh && node.geometry && !seen.has(node.geometry)) {
        seen.add(node.geometry);
        node.geometry.dispose();
      }
    });
    for (const hand of [this.handRight, this.handLeft]) {
      for (const mesh of hand.meshes) if (mesh.geometry) mesh.geometry.dispose();
    }
    if (this.root.parent) this.root.parent.remove(this.root);
    // 材质是从 MaterialLibrary 里借的（共享），由 library.Dispose() 统一释放，这里不动
    this.debris.length = 0;
  }
}

export default Viewmodel;
