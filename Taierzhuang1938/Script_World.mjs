// 《血战台儿庄》场景搭建：鲁南民居、寨墙、清真寺、街垒。
//
// 尺寸全部照 docs/Data_HistoryMaterial.md 的考据来（那份文件里带出处）：
//   寨墙高 4 m（不是明清府城的 10 m），门楼 7 m；
//   单开间面阔 3.0—3.6 m，三开间正房 9—11 m，进深 4.5—6 m；
//   檐口高 2.4—2.8 m，脊高 4.0—4.8 m，硬山坡度 26°—29°；
//   院墙 2.0—2.5 m（成年人踮脚能扒），门楼 3.5—4.5 m；
//   主街 4—6 m，次巷 2—3 m，夹道 1.2—1.8 m。
//
// **最重要的一条形制规矩：鲁南民居对外不开窗，窗全朝院里开。**
// 所以街两侧是连续实墙、视野封闭；破门破墙进了院子，窗廊屋顶的射界才一下子打开。
// 这不是省事，这是台儿庄巷战之所以那样打的物理原因。
//
// 性能：所有静态几何按材质合并成少数几个大网格（合并前先 applyMatrix4），
// 一关的 draw call 控制在 30 以内。碰撞另出一张 AABB 表，不用几何体做物理。

import * as THREE from "three";
import { Mulberry32, HashString, Clamp } from "./Script_Noise.mjs";
import {
  MakeBox, MakePlane, MergeGeometries, PlaceGeometry, CarveCraters,
  MakeRubbleField, MakeInstanced, TILE_METERS, BRICK_UV_GRID,
} from "./Script_Geo.mjs";
import { ColliderDestructionData } from "./Data_Destruction.mjs";
import { AddCourtyardLife } from "./Script_LivedInProps.mjs";

/** 建造过程中的收集器：按材质名分桶攒几何体，最后一次性合并。 */
export class BuildSink {
  constructor() {
    this.buckets = new Map();     // "sector|materialName" -> geometry[]
    this.colliders = [];          // { min:[x,y,z], max:[x,y,z], tag }
    this.breakables = [];         // 可凿的墙面 { x,y,z, nx,nz, w,h, wallId }
    this.covers = [];             // AI 掩体点 { x, z, height, faceX, faceZ }
    this.props = [];              // 需要单独成 mesh 的东西（半透明、动的）
    this.sector = "";             // 见 SetSector
  }

  /**
   * 分区键。之后 Add 进来的东西按「分区 + 材质」分桶。
   *
   * 为什么要有这一层：整座城按材质合批 = 三十来个横跨全城的巨型网格，
   * draw call 很漂亮，但**视锥剔除彻底失效** —— 站在西门外也照样把东关整片
   * 送进管线，而深度预通道 + 阴影 + 主通道要各画一遍。滕县实测到 300 万三角，
   * 逼近旧版三角面红线。按 150 m 见方切区之后 draw call 涨到两三百（离 5000 还很远），
   * 换来的是绝大多数分区被视锥直接剔掉。
   *
   * 不调它就是原来的行为（sector 为空串），台儿庄那边一个字不用改。
   */
  SetSector(key) {
    this.sector = key ? `${key}|` : "";
    return this;
  }

  Add(materialName, geometry) {
    if (!geometry) return;
    const key = this.sector + materialName;
    if (!this.buckets.has(key)) this.buckets.set(key, []);
    this.buckets.get(key).push(geometry);
  }

  /**
   * 记一个碰撞盒（中心 + 半长 + **绕 Y 的朝向**）。
   *
   * ry 这个参数是这一轮补上的，而它是「整个碰撞完全不对」的正解。
   * 以前只有轴对齐盒，斜着摆的墙/房/路基只能**再套一个轴对齐包围盒**登记 ——
   * 一段 20 m 长、0.4 m 厚的 45° 斜墙会变成 14×14 m 的实心方块，
   * 于是空地上有隐形墙、子弹打在空气上、贴着墙根本走不过去。
   *
   * 两份数据同时留着，各有各的用处：
   *   · c/h/ry  —— **真实朝向的长方体**，交给 Script_Physics 建 Rapier 碰撞体
   *   · min/max —— 仍然是那个轴对齐包围盒。AI 找掩体、导航位图、编辑器拾取
   *                这些「粗筛」照旧读它，一个字都不用改（ry=0 时两者完全等价）。
   */
  Solid(cx, cy, cz, hx, hy, hz, tag = "wall", ry = 0) {
    const ax = Math.abs(Math.cos(ry)) * hx + Math.abs(Math.sin(ry)) * hz;
    const az = Math.abs(Math.sin(ry)) * hx + Math.abs(Math.cos(ry)) * hz;
    this.colliders.push({
      min: [cx - ax, cy - hy, cz - az],
      max: [cx + ax, cy + hy, cz + az],
      c: [cx, cy, cz],
      h: [hx, hy, hz],
      ry,
      tag,
      destruction: ColliderDestructionData(tag),
    });
  }

  Cover(x, z, height, faceX = 0, faceZ = 1) {
    this.covers.push({ x, z, height, faceX, faceZ });
  }

  /**
   * 把攒的东西合成网格挂进场景。
   *
   * resolve：桶名 → 材质的解析函数，默认就是 library.Get(name)。
   * 滕县那一套要的是**同一张烘焙贴图的不同调色**（城砖 #7A7F84 / 民居青砖 #7E8388 /
   * 条石 #B0ADA3 / 夯土芯 #A38F6C 都得从既有配方染出来，因为 Script_TexBake 不归这一轮改），
   * 于是桶名必须能是「逻辑材质名」而不是配方名。给个钩子比在这里写死一张映射表干净：
   * 台儿庄那边一个字不用改，滕县那边把自己的调色表传进来。
   */
  Flush(scene, library, { castShadow = true, receiveShadow = true, resolve = null } = {}) {
    const meshes = [];
    const pick = resolve || ((name) => library.Get(name));
    for (const [key, list] of this.buckets) {
      const geometry = MergeGeometries(list);
      if (!geometry.attributes.position || geometry.attributes.position.count === 0) continue;
      const bar = key.indexOf("|");
      const name = bar < 0 ? key : key.slice(bar + 1);
      const baseMaterial = pick(name, library);
      const mesh = new THREE.Mesh(geometry,
        typeof library.Static === "function" ? library.Static(baseMaterial) : baseMaterial);
      mesh.castShadow = castShadow;
      mesh.receiveShadow = receiveShadow;
      // 主材质把洞裁掉，阴影 pass 也必须吃同一只 OBB；否则破口仍投一块完整墙影。
      if (castShadow && typeof library.StaticDepth === "function") {
        mesh.customDepthMaterial = library.StaticDepth();
      }
      // 深度法线预通道用 scene.overrideMaterial。那一趟所有物体共用一份材质，
      // 必须只在本只静态网格 draw 的前后开关裁切；不复位的话，随后经过洞口的演员
      // 会在预通道里缺一块，主画面却完整，SSAO/雾就出现人形黑边。
      mesh.onBeforeRender = (_renderer, _scene, _camera, _geometry, material) => {
        const enabled = material && material.userData && material.userData.damageObjectEnabled;
        if (enabled) enabled.value = 1;
      };
      mesh.onAfterRender = (_renderer, _scene, _camera, _geometry, material) => {
        const enabled = material && material.userData && material.userData.damageObjectEnabled;
        if (enabled) enabled.value = 0;
      };
      mesh.name = `Static_${key}`;
      scene.add(mesh);
      meshes.push(mesh);
    }
    this.buckets.clear();
    return meshes;
  }
}

// ---------------------------------------------------------------------------
// 基础构件
// ---------------------------------------------------------------------------

/** 一段墙。ruin>0 时墙头被打成参差的。 */
export function AddWall(sink, material, {
  x, z, length, height, thickness, ry = 0, ruin = 0, seed = "w",
  tile = TILE_METERS.brick, plinth = null, cope = false, solid = true,
}) {
  const rnd = Mulberry32(HashString(seed));
  const slices = Math.max(2, Math.round(length / 0.85));
  const sliceW = length / slices;
  // 砖墙这一段一段地错开图案（整砖对齐 + 约一半镜像），相邻墙段就不会是同一套明暗排列。
  // 走 UV 而不是给每段克隆材质：静态几何是按材质名合并成一个大网格的，
  // 每段一份材质 = 每段一个 draw call，几千段墙会直接把 5000 的红线撞穿。
  const grid = String(material).startsWith("BrickWall") ? BRICK_UV_GRID : null;
  for (let i = 0; i < slices; i += 1) {
    const t = i / (slices - 1 || 1);
    const edge = Math.min(t, 1 - t) * 2;
    const bite = ruin * (0.3 + 0.7 * rnd()) * (1 - edge * 0.4);
    const h = Math.max(0.18, height * (1 - bite));
    const lx = -length / 2 + sliceW * (i + 0.5);
    sink.Add(material, PlaceGeometry(
      MakeBox(sliceW * 1.03, h, thickness, tile, `${seed}:${i}`, grid),
      { x: x + Math.cos(ry) * lx, y: h / 2, z: z - Math.sin(ry) * lx, ry }));
    // 破损墙头必须让压顶跟着每一段落下。此前连续一整根瓦压顶悬在
    // 被炮火削低的墙段上方，在方形炮楼院里读成了一条凭空飘着的长条。
    if (cope && ruin < 0.35) {
      sink.Add("RoofTile", PlaceGeometry(
        MakeBox(sliceW * 1.05, 0.09, thickness + 0.16, TILE_METERS.roof, `${seed}:cp${i}`),
        { x: x + Math.cos(ry) * lx, y: h + 0.045, z: z - Math.sin(ry) * lx, ry }));
    }
  }
  // 碱脚：旧砖墙下面那两三皮总是深色的条石/糙砖，缺了这一笔墙就"浮"着
  if (plinth) {
    sink.Add(plinth, PlaceGeometry(
      MakeBox(length + 0.06, 0.42, thickness + 0.07, TILE_METERS.stone, `${seed}:pl`),
      { x, y: 0.21, z, ry }));
  }
  if (solid) {
    sink.Solid(x, height / 2, z, length / 2, height / 2, thickness / 2, "wall", ry);
    sink.Cover(x, z, height * (1 - ruin * 0.5), Math.sin(ry), Math.cos(ry));
  }
}

/**
 * 一面**开了洞的墙**的碰撞：砖砌到哪儿，碰撞就登记到哪儿。
 *
 * 为什么要有这一层：门窗洞在本作里是**真的不砌那一段**（墙由若干条水平带叠成，
 * 洞那一条是空的），而碰撞长期只登记「整开间通高一只盒」。两者对不上就是两种病：
 *
 *   · 窗洞被堵死 —— 看得见的是个洞，手榴弹却弹回来、子弹打在空气上。
 *     玩家实测：车站的窗扔不进手榴弹。全城几百扇格子窗都是这样。
 *   · 门楣以上穿得过去 —— 门洞按通高掏碰撞，门头上那块砖就成了「有渲染无碰撞」。
 *     （同一个错在门洞下半截犯过一次，见 AddRoomBlock 里 WP-D1 那条注。）
 *
 * 洞口按**沿墙方向的局部偏移 c**（与 AddWall 的 length 同一个轴）与 y 区间给。
 * 本函数先按所有洞的上下沿把墙横切成若干条带，再在每条带里按当前这一层
 * 活着的洞纵切成实心段 —— 于是「窗台以下」「窗楣以上」「门垛之间」自动都对。
 *
 * 导航不受影响：NavGrid.Refresh 与 AiDirector.Blocked 都会跳过**底面高过脚下
 * 1.6 m** 的盒子，所以门楣、窗楣那几条带登记了也不会把门口刷成死路。
 *
 * @param {object} spec x,z,ry 墙心与朝向；length 沿墙长；y0/y1 墙底墙顶；
 *   thickness 墙厚；openings [{ c, w, y0, y1 }]；tag 碰撞标签
 */
export function SolidWithOpenings(sink, {
  x, z, ry = 0, length, y0, y1, thickness, tag = "wall", openings = [],
}) {
  if (y1 - y0 < 0.02 || length < 0.06) return;
  const cuts = new Set([y0, y1]);
  for (const o of openings) {
    if (o.y1 <= y0 || o.y0 >= y1) continue;
    cuts.add(Clamp(o.y0, y0, y1));
    cuts.add(Clamp(o.y1, y0, y1));
  }
  const levels = [...cuts].sort((a, b) => a - b);
  const cos = Math.cos(ry), sin = Math.sin(ry);
  for (let i = 0; i < levels.length - 1; i += 1) {
    const a = levels[i], b = levels[i + 1];
    if (b - a < 0.02) continue;
    const mid = (a + b) / 2;
    const holes = openings
      .filter((o) => o.y0 < mid && o.y1 > mid)
      .map((o) => [o.c - o.w / 2, o.c + o.w / 2])
      .sort((p, q) => p[0] - q[0]);
    let cursor = -length / 2;
    const runs = [];
    for (const [p, q] of holes) {
      if (p > cursor) runs.push([cursor, Math.min(p, length / 2)]);
      cursor = Math.max(cursor, q);
    }
    if (cursor < length / 2) runs.push([cursor, length / 2]);
    for (const [p, q] of runs) {
      if (q - p < 0.06) continue;                    // 洞挤到墙角：那一小段不登记
      const off = (p + q) / 2;
      sink.Solid(x + cos * off, mid, z - sin * off,
        (q - p) / 2, (b - a) / 2, thickness / 2, tag, ry);
    }
  }
}

/**
 * 硬山山墙的三件饰件：**搏风带 + 山尖圆气孔 + 条石碱脚**。
 *
 * 为什么单独拆出来：山墙本体（城内 `AddHardMountainRoof`、城外
 * `AddVillageRoof`）都是拿若干段等宽方盒逼近三角形的，**阶梯边缘**在 20 m 内
 * 一眼就是锯齿。真实鲁南硬山民居在两道坡沿上砌一条高出屋面的砖脊（搏风带），
 * 它本来就比墙身厚 —— 于是这条压边**同时**是正确的形制和挡住阶梯的那块板：
 * 轮廓变成一条直斜边，不用把山墙改成自定义三角网格（那要另写一套 UV）。
 *
 * 三件的依据都在 1938 年滕县城墙那张照片里：城墙外侧紧贴的两栋民居，山墙沿
 * 两坡各一道压边、山尖正中一个圆气孔、墙脚一圈浅色石碱脚。三件缺一件，白盒
 * 里的房子就退回「带坡顶的方盒子」。
 *
 * 坐标：`x/z` 是**山墙面中心的世界坐标**（调用处自己把 ±width/2 折算进去），
 * 局部 z 沿进深、y 向上，整组只受 `ry` 一次偏航。全组关于 z=0 对称，所以不依赖
 * 调用处的局部 z 正负号约定 —— 城内城外两套相反的 Frame 都能直接用。
 *
 * 纯装饰，不登记碰撞：山墙本体已经有（或本来就不需要）自己的碰撞盒，这里再补
 * 一层只会让墙变厚。
 */
export function AddGableTrim(sink, {
  x, z, ry = 0, depth, eaveY, ridgeY, seed = "gt",
  copingMaterial = "RoofTile", plinthMaterial = "DryStone", ventMaterial = "WoodDoor",
  wallThickness = 0.30, coping = true, vent = true, plinth = true,
  baseY = 0, far = false,
}) {
  const rise = Math.max(0.05, ridgeY - eaveY);
  const halfDepth = depth / 2;
  const angle = Math.atan2(rise, halfDepth);
  const slopeLen = Math.hypot(halfDepth, rise);
  // 压边比墙身厚 0.14 m：两侧各挑出 0.07 m，正好把阶梯边缘盖死。
  const copeW = wallThickness + 0.14;
  const copeH = far ? 0.14 : 0.18;
  const pieces = [];

  if (coping) {
    for (const s of [-1, 1]) {
      // 沿坡的一条：中点在半坡处，绕局部 x 轴倾斜。两端各留 0.12 m 出头 ——
      // 檐口那头压过檐、脊那头在正脊下交汇，不留断口。
      pieces.push(PlaceGeometry(
        MakeBox(copeW, copeH, slopeLen + 0.24, TILE_METERS.roof, `${seed}:cope${s}`),
        { y: eaveY + rise / 2, z: s * (halfDepth / 2), rx: -s * angle }));
    }
    // 脊端那颗压头：两条坡沿在山尖交汇处的一小块，避免两根斜盒子对顶出尖角。
    pieces.push(PlaceGeometry(
      MakeBox(copeW, copeH * 1.5, copeW, TILE_METERS.roof, `${seed}:copeTop`),
      { y: ridgeY + copeH * 0.35, z: 0 }));
  }
  if (pieces.length) {
    sink.Add(copingMaterial, PlaceGeometry(MergeGeometries(pieces), { x, y: 0, z, ry }));
  }

  // 山尖圆气孔：真是个洞，所以用一段**比墙厚一点**的深色圆柱穿过去 —— 白盒阶段
  // 不给土坯/砖山墙掏洞（掏洞要把山墙拆成上下两段，中景看不出来还贵）。
  if (vent && !far) {
    const g = new THREE.CylinderGeometry(0.17, 0.17, wallThickness + 0.06, 12);
    g.rotateZ(Math.PI / 2);                                  // 轴线转成沿局部 x（穿墙）
    sink.Add(ventMaterial, PlaceGeometry(g, {
      x, y: eaveY + rise * 0.62, z, ry,
    }));
  }

  // 条石碱脚：墙脚一圈浅色过墙石。照片里它是山墙上明度最高的一条，
  // 也是「这堵墙站在地上」的唯一交代。
  if (plinth) {
    sink.Add(plinthMaterial, PlaceGeometry(
      MakeBox(wallThickness + 0.08, 0.42, depth + 0.1, TILE_METERS.stone, `${seed}:plinth`),
      { x, y: baseY + 0.21, z, ry }));
  }
}

/**
 * 硬山屋顶：两坡瓦面 + 正脊 + 出檐 + 两端高出屋面的山墙。
 * 坡度 26°—29°，出檐 0.45 m —— 檐口那一圈阴影是"中式房子"最强的识别特征。
 */
export function AddHardMountainRoof(sink, {
  x, z, width, depth, eaveY, ridgeY, ry = 0, seed = "r", ruined = false, burnt = false,
  rafters = true, baseY = 0,
}) {
  // baseY：山墙从哪一层砌起。坡面与正脊本来就吃绝对的 eaveY/ridgeY，只有山墙
  // 是「从 0 一路砌到山尖」的整块——放到城墙顶上时它会一直垂到地面。
  const rise = ridgeY - eaveY;
  const halfDepth = depth / 2;
  const slopeLen = Math.hypot(halfDepth, rise);
  const angle = Math.atan2(rise, halfDepth);
  const overhang = 0.45;
  const tileMat = burnt ? "BrickWallSooty" : "RoofTile";

  if (!ruined) {
    for (const s of [-1, 1]) {
      const g = MakeBox(width + overhang * 2, 0.12, slopeLen + overhang, TILE_METERS.roof, `${seed}:s${s}`);
      const cy = eaveY + rise / 2;
      const cz = s * (halfDepth / 2);
      sink.Add(tileMat, PlaceGeometry(g, {
        x: x + Math.cos(ry) * 0 - Math.sin(ry) * cz,
        y: cy,
        z: z - Math.sin(ry) * 0 - Math.cos(ry) * cz,
        ry, rx: -s * angle,
      }));
      // 檐口下的椽子：一排小方料，逆光时是一条整齐的锯齿阴影
      const rafterCount = Math.max(4, Math.round(width / 0.42));
      const rafterLen = overhang * 1.1;
      for (let i = 0; rafters && i < rafterCount; i += 1) {
        const lx = -width / 2 + (i + 0.5) * (width / rafterCount);
        // 椽头压在瓦檐下，不再越过屋面轮廓刺到墙外。
        const ez = s * (halfDepth + 0.02);
        sink.Add("WoodBeam", PlaceGeometry(
          MakeBox(0.07, 0.09, rafterLen, TILE_METERS.wood, `${seed}:rf${s}${i}`),
          {
            x: x + Math.cos(ry) * lx - Math.sin(ry) * ez,
            y: eaveY - 0.06,
            z: z - Math.sin(ry) * lx - Math.cos(ry) * ez,
            ry, rx: -s * angle * 0.85,
          }));
      }
    }
    // 正脊：小青瓦逐层叠砌，做成一条略高的带 + 两端微微起翘
    sink.Add(tileMat, PlaceGeometry(
      MakeBox(width + overhang * 2, 0.2, 0.36, TILE_METERS.roof, `${seed}:ridge`),
      { x, y: ridgeY + 0.06, z, ry }));
  } else {
    // 塌掉的屋面：只剩几根焦黑的梁架横在山墙之间
    const rnd = Mulberry32(HashString(`${seed}:col`));
    for (let i = 0; i < 5; i += 1) {
      const lx = -width / 2 + (i + 0.5) * (width / 5);
      const drop = 0.3 + rnd() * 0.8;
      sink.Add("WoodBeam", PlaceGeometry(
        MakeBox(0.16, 0.14, depth * (0.5 + rnd() * 0.5), TILE_METERS.wood, `${seed}:bm${i}`),
        {
          x: x + Math.cos(ry) * lx, y: ridgeY - drop, z: z - Math.sin(ry) * lx,
          ry, rx: (rnd() - 0.5) * 0.5, rz: (rnd() - 0.5) * 0.35,
        }));
    }
  }

  // 山墙：硬山的两端墙体高出屋面，这是"硬山"二字的由来
  for (const s of [-1, 1]) {
    const gable = [];
    const steps = 6;
    for (let i = 0; i < steps; i += 1) {
      const t0 = i / steps, t1 = (i + 1) / steps;
      const zc = (t0 + t1) * 0.5;
      const topY = eaveY + rise * (1 - Math.abs(zc * 2 - 1)) * 0 + rise * (1 - Math.abs((t0 + t1) - 1));
      const hh = Math.max(0.12, topY - baseY);
      const segD = depth / steps;
      gable.push(PlaceGeometry(
        MakeBox(0.30, hh, segD, TILE_METERS.brick, `${seed}:g${s}${i}`),
        { x: 0, y: baseY + hh / 2, z: -depth / 2 + segD * (i + 0.5) }));
    }
    const merged = MergeGeometries(gable);
    const gx = s * (width / 2 + 0.15);
    const gwx = x + Math.cos(ry) * gx;
    const gwz = z - Math.sin(ry) * gx;
    sink.Add(burnt ? "BrickWallSooty" : "BrickWall", PlaceGeometry(merged, {
      x: gwx, y: 0, z: gwz, ry,
    }));
    // 搏风带 / 气孔 / 碱脚。塌顶的房子压边照样在（砖脊比瓦面耐炸），
    // 但不给它气孔 —— 山墙已经缺了口，再穿一个圆洞就成筛子了。
    AddGableTrim(sink, {
      x: gwx, z: gwz, ry, depth, eaveY, ridgeY, baseY, seed: `${seed}:gt${s}`,
      wallThickness: 0.30, vent: !ruined,
      copingMaterial: burnt ? "BrickWallSooty" : "RoofTile",
      plinthMaterial: "CrossStone",
    });
  }
}

/**
 * 四合院。街上看过去只有一圈实墙和一座门楼；进了门才是院子。
 * @param {object} spec x, z, ry, width, depth, seed, damage 0..1, burnt
 */
export function AddCompound(sink, spec) {
  const {
    x, z, ry = 0, width = 16, depth = 14, seed = "c", damage = 0, burnt = false,
    gateSide = "south",
  } = spec;
  const rnd = Mulberry32(HashString(seed));
  const wallMat = burnt ? "BrickWallSooty" : (rnd() < 0.42 ? "Adobe" : "BrickWall");
  const courtWallH = 2.0 + rnd() * 0.5;              // 院墙 2.0—2.5 m
  const cos = Math.cos(ry), sin = Math.sin(ry);
  const L = (lx, lz) => [x + cos * lx - sin * lz, z - sin * lx - cos * lz];

  // --- 院墙四面 ---
  const sides = [
    { lx: 0, lz: -depth / 2, len: width, rot: 0 },        // 北
    { lx: 0, lz: depth / 2, len: width, rot: 0 },         // 南（开门那面）
    { lx: -width / 2, lz: 0, len: depth, rot: Math.PI / 2 },
    { lx: width / 2, lz: 0, len: depth, rot: Math.PI / 2 },
  ];
  sides.forEach((s, i) => {
    const [wx, wz] = L(s.lx, s.lz);
    const isGate = (gateSide === "south" && i === 1);
    if (isGate) {
      // 门楼两侧各留一段墙，中间是门洞
      const openW = 1.5;
      const segLen = (s.len - openW) / 2;
      for (const side of [-1, 1]) {
        const off = side * (openW / 2 + segLen / 2);
        const [sx, sz] = L(s.lx + off, s.lz);
        AddWall(sink, wallMat, {
          x: sx, z: sz, length: segLen, height: courtWallH, thickness: 0.35,
          ry: ry + s.rot, ruin: damage * 0.7, seed: `${seed}:w${i}${side}`,
          tile: wallMat === "Adobe" ? TILE_METERS.adobe : TILE_METERS.brick,
          plinth: wallMat === "Adobe" ? null : "Stone", cope: true,
        });
      }
      AddGatehouse(sink, { x: wx, z: wz, ry, seed: `${seed}:gh`, damage, burnt, openW });
    } else {
      AddWall(sink, wallMat, {
        x: wx, z: wz, length: s.len, height: courtWallH, thickness: 0.35,
        ry: ry + s.rot, ruin: damage * 0.8, seed: `${seed}:w${i}`,
        tile: wallMat === "Adobe" ? TILE_METERS.adobe : TILE_METERS.brick,
        plinth: wallMat === "Adobe" ? null : "Stone", cope: true,
      });
    }
  });

  // --- 正房（北，三开间）---
  const mainW = Math.min(width - 2.4, 9 + rnd() * 2);   // 三开间面阔 9—11 m
  const mainD = 4.6 + rnd() * 1.2;                       // 进深 4.5—6 m
  const eave = 2.45 + rnd() * 0.3;                       // 檐口 2.4—2.8 m
  const ridge = eave + mainD * 0.5 * Math.tan(THREE.MathUtils.degToRad(27.5));
  const [mx, mz] = L(0, -depth / 2 + mainD / 2 + 0.4);
  AddRoomBlock(sink, {
    x: mx, z: mz, ry, width: mainW, depth: mainD, eaveY: eave, ridgeY: ridge,
    seed: `${seed}:main`, damage, burnt, facing: 1, bays: 3,
  });

  // --- 厢房（东西各一，矮一档）---
  for (const side of [-1, 1]) {
    if (rnd() < 0.25) continue;                          // 有的院子只有一侧厢房
    const wingW = 3.4 + rnd() * 0.8;
    const wingD = Math.min(depth - mainD - 3.0, 5.5 + rnd());
    if (wingD < 3) continue;
    const wingEave = 2.2 + rnd() * 0.2;
    const wingRidge = wingEave + wingW * 0.5 * Math.tan(THREE.MathUtils.degToRad(27));
    const [wx2, wz2] = L(side * (width / 2 - wingW / 2 - 0.5), -depth / 2 + mainD + 1.0 + wingD / 2);
    AddRoomBlock(sink, {
      x: wx2, z: wz2, ry: ry + Math.PI / 2 * side, width: wingD, depth: wingW,
      eaveY: wingEave, ridgeY: wingRidge, seed: `${seed}:wing${side}`,
      damage: Clamp(damage + rnd() * 0.2, 0, 1), burnt, facing: side, bays: 2,
    });
  }

  // --- 院里的家什 ---
  const yardZ = depth / 2 - 2.6;
  if (rnd() < 0.55) AddWell(sink, ...L((rnd() - 0.5) * width * 0.4, yardZ - rnd() * 2));
  if (rnd() < 0.45) AddMillstone(sink, ...L((rnd() - 0.5) * width * 0.5, yardZ - 1 - rnd() * 2), `${seed}:ms`);
  if (rnd() < 0.4) AddWaterVat(sink, ...L(width / 2 - 1.2, yardZ - 0.6), `${seed}:vat`);
  // 井/磨盘/水缸只能说明“这里有三个功能点”，不能说明“这里有人过日子”。
  // 另补靠墙储物、篮筐陶缸、柴垛/晒架/桌凳等组合与被踩实的院心。
  const [lifeX, lifeZ] = L(0, yardZ - 2.0);
  const householdProps = AddCourtyardLife(sink, {
    x: lifeX, z: lifeZ, ry, baseY: 0, seed: `${seed}:life`,
    width: Math.max(6, width - 3.0), depth: Math.max(4.5, depth - mainD - 1.0), damage,
  });
  // 影壁：门内一堵挡视线的短墙，进院第一眼看到的就是它。
  //
  // 概率从 0.5 提到必有（形制上本来也是四合院的标配）。理由不只是考据：
  // 影壁是**从街上透过门洞唯一能看见的一片受光面**。有它，门洞里是一堵晒着的砖墙；
  // 没它，门洞里是院子的空气加上被墙挡住的天光 —— 出图上就是纯黑。
  // 它站在门内 2.0 m、宽 2.4 m > 门净宽 1.5 m，正好把门洞填满。
  if (gateSide === "south") {
    const [px, pz] = L(0, depth / 2 - 2.0);
    AddWall(sink, "BrickWall", {
      x: px, z: pz, length: 2.4, height: 1.9, thickness: 0.28, ry,
      ruin: damage * 0.6, seed: `${seed}:screen`, plinth: "Stone", cope: true,
    });
  }
  return { householdProps };
}

/** 一栋房：四面墙 + 门 + 朝院子的格子窗 + 硬山瓦顶。 */
export function AddRoomBlock(sink, spec) {
  const {
    x, z, ry, width, depth, eaveY, ridgeY, seed, damage = 0, burnt = false,
    facing = 1, bays = 3, roofRafters = true,
    // 门板："random" 抽签（旧行为）｜"shut" 恒关｜"none" 恒开。
    // 可进入的屋子必须传 "none"：抽中关门时门板无碰撞，人穿板而过（WP-D2 取证）。
    doorLeaf = "random",
  } = spec;
  const rnd = Mulberry32(HashString(`${seed}:rb`));
  const wallMat = burnt ? "BrickWallSooty" : "BrickWall";
  const cos = Math.cos(ry), sin = Math.sin(ry);
  const L = (lx, lz) => [x + cos * lx - sin * lz, z - sin * lx - cos * lz];
  const collapsed = damage > 0.62;

  // 四面墙：面朝院子那一面（+z * facing）开门窗，其余三面实墙
  const faces = [
    { lx: 0, lz: -depth / 2, len: width, rot: 0, open: facing < 0 },
    { lx: 0, lz: depth / 2, len: width, rot: 0, open: facing > 0 },
    { lx: -width / 2, lz: 0, len: depth, rot: Math.PI / 2, open: false },
    { lx: width / 2, lz: 0, len: depth, rot: Math.PI / 2, open: false },
  ];
  for (let i = 0; i < faces.length; i += 1) {
    const f = faces[i];
    const [fx, fz] = L(f.lx, f.lz);
    if (!f.open) {
      // ruin 只作用在山墙（i>=2）：檐墙的墙头顶着 eaveY 起坡的屋面，
      // 被 ruin 削低后墙头与瓦面之间是一排刺眼的天光条（WP-D1 取证 §5-3）。
      AddWall(sink, wallMat, {
        x: fx, z: fz, length: f.len, height: eaveY, thickness: 0.36,
        ry: ry + f.rot, ruin: i >= 2 ? damage * 0.85 : 0, seed: `${seed}:f${i}`,
        plinth: "Stone",
      });
      // 山墙顶上的小「口眼」（通风口）——两山墙才有
      if (i >= 2 && !collapsed && rnd() < 0.7) {
        const [ox, oz] = L(f.lx * 1.02, 0);
        sink.Add("WoodBeam", PlaceGeometry(
          MakeBox(0.06, 0.34, 0.34, TILE_METERS.wood, `${seed}:eye${i}`),
          { x: ox, y: eaveY + 0.35, z: oz, ry: ry + f.rot }));
      }
      continue;
    }
    // 朝院一面：门 + 两侧格子窗（明间开门，次间开窗）
    const bayW = f.len / bays;
    for (let b = 0; b < bays; b += 1) {
      const lx = f.lx + (-f.len / 2 + bayW * (b + 0.5)) * Math.cos(f.rot);
      const lz2 = f.lz + (-f.len / 2 + bayW * (b + 0.5)) * -Math.sin(f.rot);
      const [bx, bz] = L(lx, lz2);
      const isDoor = b === Math.floor(bays / 2);
      // 门/窗两侧的墙垛
      const pierW = (bayW - (isDoor ? 1.25 : 1.05)) / 2;
      for (const s2 of [-1, 1]) {
        const off = s2 * (bayW / 2 - pierW / 2);
        const [px, pz] = L(lx + off * Math.cos(f.rot), lz2 + off * -Math.sin(f.rot));
        // 墙垛也在檐口线上，同理不吃 ruin（战损仍由山墙/屋面/塌房表达）
        AddWall(sink, wallMat, {
          x: px, z: pz, length: pierW, height: eaveY, thickness: 0.36,
          ry: ry + f.rot, ruin: 0, seed: `${seed}:p${i}${b}${s2}`, plinth: "Stone",
        });
      }
      if (isDoor) {
        const doorH = 2.0;
        // 门上过梁 + 门板
        sink.Add("WoodBeam", PlaceGeometry(MakeBox(1.45, 0.18, 0.4, TILE_METERS.wood, `${seed}:lt${b}`),
          { x: bx, y: doorH + 0.09, z: bz, ry: ry + f.rot }));
        // （此处原有一句忘删的 AddWall：AddWall 的每片墙从 y=0 起砌，本该在门楣以上的
        //  那段墙被它砌在了门洞下半截 —— 全城每一栋房的门都被 1.1 m 的
        //  「有渲染无碰撞」砖墙堵住，WP-D1 取证后删除。真正的门楣上墙是下面这块。）
        // 上半段墙要垫高
        if (damage < 0.5) {
          const upH = eaveY - doorH - 0.18;
          sink.Add(wallMat, PlaceGeometry(
            MakeBox(1.25, upH, 0.36, TILE_METERS.brick, `${seed}:up${b}`),
            { x: bx, y: doorH + 0.18 + upH / 2, z: bz, ry: ry + f.rot }));
          // 门楣上这块砖也要有碰撞，否则子弹与手榴弹从门头上穿墙而过。
          // 底面在 2.18 m，高过导航与 AI 的 1.6 m 净空线，门口照旧走得通。
          if (upH > 0.1) {
            sink.Solid(bx, doorH + 0.18 + upH / 2, bz, 0.7, upH / 2, 0.25, "wall", ry + f.rot);
          }
        }
        // 同门楼：给屋门也做出进深。f.lz 是这面墙在房子局部坐标里的位置，
        // lz<0 那一面的"里"在反方向，所以要多转 180°，不然门槛与墁地会跑到街上去
        AddDoorReveal(sink, {
          x: bx, z: bz, ry: ry + f.rot + (f.lz >= 0 ? 0 : Math.PI),
          openW: 1.25, openH: doorH, depth: 1.5, seed: `${seed}:rv${b}`,
        });
        // 抽签照旧消耗一次 rnd —— doorLeaf 非 random 时也要保持随机流不变，
        // 否则同 seed 的房子在别处（山墙口眼等）会整体换样。
        const leafRoll = rnd();
        const leafShut = doorLeaf === "shut" || (doorLeaf === "random" && leafRoll < 0.55);
        if (leafShut) {
          for (const s3 of [-1, 1]) {
            sink.Add("WoodDoor", PlaceGeometry(
              MakeBox(0.60, doorH, 0.05, TILE_METERS.wood, `${seed}:dr${b}${s3}`),
              {
                x: bx + s3 * 0.31 * Math.cos(f.rot + ry), y: doorH / 2,
                z: bz - s3 * 0.31 * Math.sin(f.rot + ry), ry: ry + f.rot,
              }));
          }
        }
      } else {
        // 格子窗：窗台 0.9 m，窗高 1.1 m，木棂做成井字
        const sillY = 0.92, winH = 1.06;
        sink.Add(wallMat, PlaceGeometry(MakeBox(1.05, sillY, 0.36, TILE_METERS.brick, `${seed}:sl${b}`),
          { x: bx, y: sillY / 2, z: bz, ry: ry + f.rot }));
        sink.Add(wallMat, PlaceGeometry(
          MakeBox(1.05, Math.max(0.1, eaveY - sillY - winH), 0.36, TILE_METERS.brick, `${seed}:hd${b}`),
          { x: bx, y: sillY + winH + Math.max(0.1, eaveY - sillY - winH) / 2, z: bz, ry: ry + f.rot }));
        if (damage < 0.55) {
          const frame = [];
          frame.push(PlaceGeometry(MakeBox(1.05, 0.08, 0.1, TILE_METERS.wood, `${seed}:wf1${b}`), { y: 0 }));
          frame.push(PlaceGeometry(MakeBox(1.05, 0.08, 0.1, TILE_METERS.wood, `${seed}:wf2${b}`), { y: winH }));
          for (let m = 0; m <= 3; m += 1) {
            frame.push(PlaceGeometry(MakeBox(0.05, winH, 0.08, TILE_METERS.wood, `${seed}:wm${b}${m}`),
              { x: -0.5 + m * 0.333, y: winH / 2 }));
          }
          for (let m = 1; m <= 2; m += 1) {
            frame.push(PlaceGeometry(MakeBox(1.05, 0.05, 0.08, TILE_METERS.wood, `${seed}:wh${b}${m}`),
              { y: winH * (m / 3) }));
          }
          sink.Add("WoodDoor", PlaceGeometry(MergeGeometries(frame),
            { x: bx, y: sillY, z: bz, ry: ry + f.rot }));
        }
        // 碰撞只登记**砌了砖的那两条带**：槛墙（0—窗台）与窗楣以上。
        // 旧版在这里登记一只通高盒，于是全城每一扇格子窗都是「看得见的洞 +
        // 摸得着的墙」：手榴弹弹回来、子弹打在空气上（玩家在车站实测到）。
        // ry 也补上了 —— 原来漏传，转了 90° 的房子那只盒子连朝向都是错的。
        const rot2 = ry + f.rot;
        sink.Solid(bx, sillY / 2, bz, 0.6, sillY / 2, 0.25, "wall", rot2);
        const headY = sillY + winH;
        if (eaveY - headY > 0.1) {
          sink.Solid(bx, (headY + eaveY) / 2, bz, 0.6, (eaveY - headY) / 2, 0.25, "wall", rot2);
        }
      }
    }
  }

  AddHardMountainRoof(sink, {
    x, z, width, depth, eaveY, ridgeY, ry, seed: `${seed}:roof`,
    ruined: collapsed, burnt, rafters: roofRafters,
  });

  // 塌了的房子脚下有一堆瓦砾，没有的话看起来像被橡皮擦掉的
  if (collapsed) {
    sink.props.push({ kind: "rubblePile", x, z, radius: Math.max(width, depth) * 0.45, seed: `${seed}:rp` });
  }
}

/**
 * 门洞的"里子"：门槛石 + 门道墁地 + 木门框 + 门道内壁。
 *
 * 为什么单独抽出来：鲁南民居对外不开窗，**门洞是街上唯一的开口** ——
 * 它在每一张街景截图里都是唯一的深色块，眼睛必然落上去。而原来这里
 * 什么都没有：墙上挖个洞，洞里是院子/屋里的空气，出图上就是一个纯黑方块，
 * 一眼假（视觉审查连着两轮点名）。
 *
 * 一个真门洞被眼睛读作"有进深"，靠的是三条**亮**的线，不是靠里面亮：
 *   ① 门槛石高出地面一指，顶面接天光 —— 门洞底下那条亮边；
 *   ② 门道墁的青砖比土路浅，从洞口往里能看到一小片地；
 *   ③ 木门框把洞口框出两条竖亮线 + 一条横亮线。
 * 有了这三条，中间那块黑就读作"里面是暗的"，而不是"这里没有东西"。
 *
 * @param {object} spec x,z,ry 门洞中心与朝向（+z 局部轴指向"里"）；
 *        openW 净宽；openH 净高；depth 门道进深；jamb 是否上木门框
 */
export function AddDoorReveal(sink, {
  x, z, ry, openW = 1.5, openH = 2.15, depth = 1.9, seed = "dv",
  jamb = true, paving = "Stone", sill = "Stone",
}) {
  const cos = Math.cos(ry), sin = Math.sin(ry);
  // 局部 +z 轴（PlaceGeometry 绕 Y 转 ry 之后）指向世界 (sin, cos)：门道朝里的方向
  const At = (lx, lz) => ({ x: x + cos * lx + sin * lz, z: z - sin * lx + cos * lz });

  // ① 门槛石：高出地面 0.13 m。它同时也是"人要抬腿跨进去"的形制交代
  const sillPos = At(0, 0);
  sink.Add(sill, PlaceGeometry(
    MakeBox(openW + 0.14, 0.16, 0.46, TILE_METERS.stone, `${seed}:sill`),
    { x: sillPos.x, y: 0.07, z: sillPos.z, ry }));

  // ② 门道墁地：一片比土路浅得多的石／砖地，从门槛往里铺。
  //    厚 0.10、顶面在 +0.04，压在地面网格上面一点，不会被地形起伏吃掉
  const pavePos = At(0, depth / 2 + 0.2);
  sink.Add(paving, PlaceGeometry(
    MakeBox(openW + 0.05, 0.1, depth, TILE_METERS.stone, `${seed}:pave`),
    { x: pavePos.x, y: -0.01, z: pavePos.z, ry }));

  // ③ 木门框：两根立柱 + 一根上槛，缩在洞口里 0.24 m，
  //    所以正面看是"框在黑洞外面的一圈亮木头"，侧面看是门道的厚度
  if (jamb) {
    for (const s of [-1, 1]) {
      const p = At(s * (openW / 2 - 0.05), 0.24);
      sink.Add("WoodBeam", PlaceGeometry(
        MakeBox(0.11, openH, 0.13, TILE_METERS.wood, `${seed}:jamb${s}`),
        { x: p.x, y: openH / 2 + 0.14, z: p.z, ry }));
    }
    const head = At(0, 0.24);
    sink.Add("WoodBeam", PlaceGeometry(
      MakeBox(openW + 0.02, 0.13, 0.13, TILE_METERS.wood, `${seed}:head`),
      { x: head.x, y: openH + 0.14, z: head.z, ry }));
  }
}

/** 门楼：3.5—4.5 m，双扇木门 + 门墩石 + 小瓦顶。街上唯一的开口。 */
export function AddGatehouse(sink, { x, z, ry, seed, damage = 0, burnt = false, openW = 1.5 }) {
  const h = 3.6;
  const mat = burnt ? "BrickWallSooty" : "BrickWall";
  const cos = Math.cos(ry), sin = Math.sin(ry);
  // 两根门垛
  for (const s of [-1, 1]) {
    const lx = s * (openW / 2 + 0.28);
    sink.Add(mat, PlaceGeometry(MakeBox(0.56, h, 0.72, TILE_METERS.brick, `${seed}:pier${s}`),
      { x: x + cos * lx, y: h / 2, z: z - sin * lx, ry }));
    sink.Solid(x + cos * lx, h / 2, z - sin * lx, 0.32, h / 2, 0.4, "wall", ry);
    // 门墩石
    sink.Add("Stone", PlaceGeometry(MakeBox(0.42, 0.52, 0.42, TILE_METERS.stone, `${seed}:dun${s}`),
      { x: x + cos * (lx + s * 0.16), y: 0.26, z: z - sin * (lx + s * 0.16), ry }));
  }
  // 门额与小瓦顶
  sink.Add("WoodBeam", PlaceGeometry(MakeBox(openW + 1.2, 0.26, 0.8, TILE_METERS.wood, `${seed}:lin`),
    { x, y: 2.32, z, ry }));
  sink.Add(mat, PlaceGeometry(MakeBox(openW + 1.2, h - 2.58, 0.62, TILE_METERS.brick, `${seed}:up`),
    { x, y: 2.58 + (h - 2.58) / 2, z, ry }));
  if (damage < 0.6) {
    for (const s of [-1, 1]) {
      sink.Add(burnt ? "BrickWallSooty" : "RoofTile", PlaceGeometry(
        MakeBox(openW + 2.0, 0.11, 0.62, TILE_METERS.roof, `${seed}:rf${s}`),
        { x, y: h + 0.28, z: z - cos * s * 0.28, ry, rx: -s * 0.46 }));
    }
    sink.Add("RoofTile", PlaceGeometry(MakeBox(openW + 2.1, 0.16, 0.24, TILE_METERS.roof, `${seed}:rdg`),
      { x, y: h + 0.5, z, ry }));
  }
  // 门洞的里子：门槛 + 门道墁地 + 木框。没有它，门楼在街景里就是一个纯黑方块
  AddDoorReveal(sink, { x, z, ry, openW, openH: 2.18, depth: 2.1, seed: `${seed}:rv` });
  // 门板（一扇歪着，一扇掉了——打了半个月的镇子不会有齐整的门）
  if (damage < 0.75) {
    sink.Add("WoodDoor", PlaceGeometry(MakeBox(openW / 2 - 0.04, 2.15, 0.07, TILE_METERS.wood, `${seed}:d0`),
      { x: x + cos * (-openW / 4), y: 1.08, z: z - sin * (-openW / 4), ry }));
    if (damage < 0.35) {
      sink.Add("WoodDoor", PlaceGeometry(MakeBox(openW / 2 - 0.04, 2.15, 0.07, TILE_METERS.wood, `${seed}:d1`),
        { x: x + cos * (openW / 4), y: 1.08, z: z - sin * (openW / 4), ry: ry + 0.55 }));
    }
  }
}

/**
 * 砖墩敞口门房（铺房）。
 *
 * 依据 1938 年滕县城墙那张照片正中、紧挨城楼小亭立在墙上的那一栋：单开间，
 * 前檐**不落在墙上而是落在两根粗方砖墩上**，墩间是敞口（或一对板门），檐下椽头
 * 外露成一排扇形；两侧是整面砖砌硬山山墙，山墙沿坡有压边、墙脚有浅色碱脚。
 *
 * 为什么值得单独做一件：kit 里原有的七种村屋原型全是**四面围合的方盒 + 坡顶**，
 * `FarmShed` 虽然敞口，却是三根细木柱的草棚，轮廓和这个「两根重砖墩托着一片深
 * 出檐」完全不是一回事。城墙上的值房、村口门房、院落过道楼都是这一形，缺了它，
 * 白盒里的城墙顶除了垛口就什么都没有。
 *
 * 局部朝向：`ry=0` 时正面（砖墩与门口那一面）朝 **+z**，屋脊沿 x。
 *
 * `tag`：碰撞体标签。默认 `"wall"`（城内语义）。**摆到城外必须传 `"villageWall"`**
 * —— `JieheTerrainTest` 的贴地审计把 `wall` 归进「底面必须贴着高度图（≤0.08 m）」的
 * groundTags，而村屋的室内坪是**故意**抬到石基础顶上的（`SampleVillageFoundation`
 * 取足印内最高点），坡地上一栋房子就能差出一米。村屋自己因此一直用 `villageWall`。
 *
 * @param {object} spec x, z, ry, width 面阔, depth 主体进深, porchDepth 前檐挑出,
 *   eaveY 檐口, baseY 基面（放城墙顶时传墙顶高）, damage 0..1, burnt, doors 是否装板门
 */
export function AddPierPorchHouse(sink, {
  x, z, ry = 0, width = 4.2, depth = 3.4, porchDepth = 1.5, eaveY = 3.1,
  baseY = 0, seed = "pph", damage = 0, burnt = false, doors = true, tag = "wall",
}) {
  const cos = Math.cos(ry), sin = Math.sin(ry);
  // 标准 Y 旋转：`ry=0` 时 +lz 落到世界 +z（南）。**这一份的 lz 符号必须和
  // `CityBlockKit.Frame` / `TengxianOutfield.VillagePoint` 一致**，因为村屋的正面
  // 全在 +lz 一侧；如果照抄 AddHardMountainRoof 内部坡面那一套（lz 取负），
  // 这栋门房会背对南面站着，整条村道上只有它一栋是反的。
  // AddHardMountainRoof 自己不受影响：它的坡面/山墙关于 z 对称，只吃屋面中心。
  const L = (lx, lz) => ({ x: x + cos * lx + sin * lz, z: z - sin * lx + cos * lz });
  const wallMat = burnt ? "BrickWallSooty" : "BrickWall";
  const t = 0.34;
  const bodyH = eaveY - baseY;
  // 屋面盖住主体 + 前檐，所以坡的进深是两者之和；屋脊随之往前挪半个挑出。
  const roofDepth = depth + porchDepth;
  const roofCz = porchDepth / 2;
  const ridgeY = eaveY + roofDepth * 0.5 * Math.tan(THREE.MathUtils.degToRad(27.5));

  // 墙段自己砌，不走 AddWall —— AddWall 一律从 y=0 起，而这一形制最常见的位置
  // 恰恰是**城墙顶**（照片里那一栋就立在墙上）。多一个 baseY 就够了，不值得为它
  // 去改所有 AddWall 调用处的签名。
  const Slab = (p, len, h, thick, rot, tag) => {
    sink.Add(wallMat, PlaceGeometry(
      MakeBox(len, h, thick, TILE_METERS.brick, `${seed}:${tag}`, BRICK_UV_GRID),
      { x: p.x, y: baseY + h / 2, z: p.z, ry: ry + rot }));
    sink.Solid(p.x, baseY + h / 2, p.z, len / 2, h / 2, thick / 2, tag, ry + rot);
    // 过墙石碱脚：照片里山墙上明度最高的一条，也是墙脚唯一的交代。
    sink.Add("CrossStone", PlaceGeometry(
      MakeBox(len, 0.34, thick + 0.06, TILE_METERS.stone, `${seed}:${tag}:plinth`),
      { x: p.x, y: baseY + 0.17, z: p.z, ry: ry + rot }));
  };

  // --- 后墙与两侧山墙（主体三面实墙，鲁南民居对外不开窗）---
  const solidWalls = [
    { lx: 0, lz: -depth / 2, len: width, rot: 0 },
    { lx: -width / 2, lz: 0, len: depth, rot: Math.PI / 2 },
    { lx: width / 2, lz: 0, len: depth, rot: Math.PI / 2 },
  ];
  for (let i = 0; i < solidWalls.length; i += 1) {
    const w = solidWalls[i];
    Slab(L(w.lx, w.lz), w.len, bodyH * (1 - damage * 0.35), t, w.rot, `w${i}`);
  }

  // --- 两根方砖墩：前檐的全部支承，也是这一形制最强的识别特征 ---
  // 墩比墙厚得多（0.62 见方 vs 墙 0.34），照片里它们粗得像两截塔。
  const pierSide = width / 2 - 0.31;
  const pierZ = depth / 2 + porchDepth - 0.31;
  for (const s of [-1, 1]) {
    const p = L(s * pierSide, pierZ);
    sink.Add(wallMat, PlaceGeometry(
      MakeBox(0.62, bodyH, 0.62, TILE_METERS.brick, `${seed}:pier${s}`, BRICK_UV_GRID),
      { x: p.x, y: baseY + bodyH / 2, z: p.z, ry }));
    sink.Solid(p.x, baseY + bodyH / 2, p.z, 0.31, bodyH / 2, 0.31, tag, ry);
    // 墩顶的石压顶：砖墩与木额枋之间那块过渡石，也让墩头不是一刀切。
    sink.Add("CrossStone", PlaceGeometry(
      MakeBox(0.74, 0.14, 0.74, TILE_METERS.stone, `${seed}:pierCap${s}`),
      { x: p.x, y: baseY + bodyH + 0.07, z: p.z, ry }));
  }
  // 墩间的额枋：一根通长木梁把两墩连起来，檐口的重量由它转到墩上。
  const beam = L(0, pierZ);
  sink.Add("WoodBeam", PlaceGeometry(
    MakeBox(width, 0.26, 0.30, TILE_METERS.wood, `${seed}:archi`),
    { x: beam.x, y: baseY + bodyH + 0.21, z: beam.z, ry }));

  // --- 正面：门洞两侧各一段短墙 + 门楣，门洞净宽 1.5 m ---
  const openW = Math.min(1.6, width - 1.4);
  const segLen = (width - openW) / 2;
  const doorH = 2.15;
  if (segLen > 0.12) {
    for (const s of [-1, 1]) {
      Slab(L(s * (openW / 2 + segLen / 2), depth / 2), segLen,
        bodyH * (1 - damage * 0.35), t, 0, `f${s}`);
    }
  }
  const head = L(0, depth / 2);
  sink.Add("WoodBeam", PlaceGeometry(
    MakeBox(openW + 0.5, 0.22, t + 0.06, TILE_METERS.wood, `${seed}:lintel`),
    { x: head.x, y: baseY + doorH + 0.11, z: head.z, ry }));
  const overH = Math.max(0.1, bodyH - doorH - 0.22);
  sink.Add(wallMat, PlaceGeometry(
    MakeBox(openW, overH, t, TILE_METERS.brick, `${seed}:overDoor`, BRICK_UV_GRID),
    { x: head.x, y: baseY + doorH + 0.22 + overH / 2, z: head.z, ry }));
  sink.Solid(head.x, baseY + doorH + 0.22 + overH / 2, head.z,
    openW / 2, overH / 2, t / 2, tag, ry);
  // 门道的里子。**要转 180°**：AddDoorReveal 把墁地往它自己的 +lz 铺（「朝里」），
  // 而这里的门开在 +lz 那一面，朝里是 −lz。不转的话门槛石和墁地会铺到门外的檐下。
  // 门槛与墁地都吃绝对 y（0.07 / −0.01），所以只在落地时装 —— 摆到城墙顶上时
  // 它会留在地面，那时这栋房子本来也不该有门道墁地。
  if (Math.abs(baseY) < 0.05) {
    AddDoorReveal(sink, {
      x: head.x, z: head.z, ry: ry + Math.PI, openW, openH: doorH, depth: t + 0.5,
      seed: `${seed}:rv`, paving: "CrossStone", sill: "CrossStone",
    });
  }
  if (doors && damage < 0.7) {
    for (const s of [-1, 1]) {
      const p = L(s * openW / 4, depth / 2 - 0.04);
      sink.Add("WoodDoor", PlaceGeometry(
        MakeBox(openW / 2 - 0.03, doorH - 0.05, 0.07, TILE_METERS.wood, `${seed}:leaf${s}`),
        { x: p.x, y: baseY + (doorH - 0.05) / 2, z: p.z, ry: ry + (s > 0 ? 0.42 * damage : 0) }));
    }
  }

  // --- 屋面：连山墙压边一起走共用的硬山构件；椽头那一排照片里非常显眼，开着 ---
  const roofCenter = L(0, roofCz);
  AddHardMountainRoof(sink, {
    x: roofCenter.x, z: roofCenter.z, width, depth: roofDepth,
    eaveY, ridgeY, ry, baseY, seed: `${seed}:roof`,
    ruined: damage > 0.7, burnt, rafters: true,
  });
  return { ridgeY, eaveY };
}

/** 水井：石砌井口，井栏外径 0.8—1.0 m、高 0.4—0.6 m。 */
export function AddWell(sink, x, z) {
  const g = new THREE.CylinderGeometry(0.48, 0.52, 0.52, 20, 1, true);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i += 1) uv.setXY(i, uv.getX(i) * 2.2, uv.getY(i) * 0.4);
  sink.Add("Stone", PlaceGeometry(g, { x, y: 0.26, z }));
  const lip = new THREE.TorusGeometry(0.5, 0.055, 6, 18);
  lip.rotateX(Math.PI / 2);
  sink.Add("Stone", PlaceGeometry(lip, { x, y: 0.52, z }));
  sink.Solid(x, 0.26, z, 0.55, 0.26, 0.55, "prop");
  sink.Cover(x, z, 0.52, 0, 1);
}

export function AddMillstone(sink, x, z, seed = "ms") {
  const base = new THREE.CylinderGeometry(0.52, 0.55, 0.18, 18);
  sink.Add("Stone", PlaceGeometry(base, { x, y: 0.09, z }));
  const top = new THREE.CylinderGeometry(0.44, 0.44, 0.16, 18);
  sink.Add("Stone", PlaceGeometry(top, { x, y: 0.26, z, ry: HashString(seed) % 100 / 100 }));
  sink.Solid(x, 0.17, z, 0.55, 0.17, 0.55, "prop");
}

export function AddWaterVat(sink, x, z, seed = "vat") {
  const g = new THREE.CylinderGeometry(0.42, 0.34, 0.78, 16, 1, true);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i += 1) uv.setXY(i, uv.getX(i) * 2.0, uv.getY(i) * 0.7);
  sink.Add("Stone", PlaceGeometry(g, { x, y: 0.39, z }));
  sink.Solid(x, 0.39, z, 0.44, 0.39, 0.44, "prop");
  sink.Cover(x, z, 0.78, 0, 1);
}

/**
 * 寨墙。高 4 m、砖包夯土、上砌垛口；内侧有马道上墙。
 * 这是台儿庄的"城"——不是明清府城，玩家站在墙上能看清街内。
 */
export function AddRampart(sink, {
  x, z, length, ry = 0, seed = "rp", height = 4.0, thickness = 2.2,
  breach = null, merlons = true,
}) {
  const cos = Math.cos(ry), sin = Math.sin(ry);
  const segs = Math.max(4, Math.round(length / 2.2));
  const segLen = length / segs;
  for (let i = 0; i < segs; i += 1) {
    const lx = -length / 2 + segLen * (i + 0.5);
    let h = height;
    if (breach) {
      const d = Math.abs(lx - breach.at);
      if (d < breach.width / 2) {
        // 缺口：中间几乎塌平，边缘参差
        const t = d / (breach.width / 2);
        h = height * (0.18 + 0.82 * Math.pow(t, 1.7));
      }
    }
    sink.Add("BrickWall", PlaceGeometry(
      MakeBox(segLen * 1.02, h, thickness, TILE_METERS.brick, `${seed}:s${i}`),
      { x: x + cos * lx, y: h / 2, z: z - sin * lx, ry }));
    if (h > height * 0.9) {
      sink.Solid(x + cos * lx, h / 2, z - sin * lx, segLen / 2, h / 2, thickness / 2, "rampart", ry);
    }
    // 垛口：一段实、一段空，实的高 1.1 m
    if (merlons && h > height * 0.9) {
      const per = Math.max(1, Math.round(segLen / 1.4));
      for (let m = 0; m < per; m += 1) {
        if ((i + m) % 2 === 1) continue;
        const mlx = lx - segLen / 2 + (m + 0.5) * (segLen / per);
        const mz = thickness / 2 - 0.28;
        sink.Add("BrickWall", PlaceGeometry(
          MakeBox(segLen / per * 0.62, 1.05, 0.5, TILE_METERS.brick, `${seed}:m${i}${m}`),
          { x: x + cos * mlx - sin * mz, y: height + 0.52, z: z - sin * mlx - cos * mz, ry }));
        sink.Cover(x + cos * mlx - sin * mz, z - sin * mlx - cos * mz, height + 1.05, sin, cos);
      }
    }
  }
  // 马道由调用方单独建（AddRampWay）：它要知道坡脚的地面高程，而这里查不到地形。
}

/**
 * 马道（上墙的坡道）。**必须一级一级地建，不能建成一块斜着的板。**
 *
 * 原来那版是一块旋转过的长方体 + 一个 3.6×2.8×7.6 的实心碰撞盒：画面上是坡，
 * 碰撞上是一堵 3.4 m 高的墙。玩家撞上去就停住，AI 的 Blocked() 也直接判死。
 * 于是「城墙是台儿庄的主战场」这句话在运行时是假的 —— 谁也上不去。
 *
 * 现在拆成 RAMP_STEPS 级台阶，每级抬 (墙顶 − 坡脚地面) / RAMP_STEPS，
 * 压在玩家 MoveWithCollision 与 AI Blocked() 那条 0.56 m 的自动抬腿线以下，
 * 于是两边都是「走上去」而不是「被挡住」。
 *
 * **baseY 必须是坡脚那儿的真实地面高程，不能当成 0。** 第一版就是这么错的：
 * 台阶按绝对高度砌（0.5 / 1.0 / …），而北墙内侧的地面在 −0.7 m，
 * 于是第一级相对脚下就有 1.2 m —— 越过抬腿线，人在坡底原地顶着，
 * 实跑量到玩家爬到 2.86 m 就再也上不去。地形是起伏的，这个数每条马道都不一样。
 *
 * 台阶盒一律从地面以下砌满（不是悬空的一片），这样从侧面撞过来是一堵矮墙，
 * 从下往上走才是台阶 —— 悬空片会让人从坡底钻进坡肚子里。
 */
export const RAMP_STEPS = 10;
export const RAMP_RUN_M = 1.2;
export const RAMP_WIDTH_M = 2.4;

export function AddRampWay(sink, {
  x, z, at = 0, ry = 0, height = 4.0, thickness = 2.2, baseY = 0, seed = "ramp",
}) {
  const cos = Math.cos(ry), sin = Math.sin(ry);
  // 局部坐标：lx 沿墙，lz 往城里为负（与 AddRampart 其余部分同一套约定）
  const L = (lx, lz) => [x + cos * lx - sin * lz, z - sin * lx - cos * lz];
  const bottom = baseY - 1.4;                     // 砌到地面以下，免得坡底露出缝
  const rise = (height - baseY) / RAMP_STEPS;
  const hx = RAMP_WIDTH_M / 2;
  const hz = RAMP_RUN_M / 2;
  for (let i = 0; i < RAMP_STEPS; i += 1) {
    // i = 0 是最高的一级（顶面正好齐墙顶），越往城里越矮
    const top = height - rise * i;
    const lz = -(thickness / 2 + RAMP_RUN_M * (i + 0.5));
    const [sx, sz] = L(at, lz);
    const h = top - bottom;
    sink.Add("Ground", PlaceGeometry(
      MakeBox(RAMP_WIDTH_M, h, RAMP_RUN_M * 1.02, TILE_METERS.ground, `${seed}:s${i}`),
      { x: sx, y: bottom + h / 2, z: sz, ry }));
    sink.Solid(sx, bottom + h / 2, sz, hx, h / 2, hz, "ramp", ry);
  }
}

/**
 * 清真寺（1938 年的样子）：门楼 + 卷棚顶礼拜堂 + 讲堂 + 配房，中式硬山低矮院落群。
 * **不要做阿拉伯式穹顶尖塔**；那座 28 m 的望月楼是 1942 年重修才加的。
 * 大战中这里是第 31 师 186 团的指挥所，双方拉锯七天七夜。
 */
export function AddMosque(sink, { x, z, ry = 0, seed = "mq", damage = 0.4 }) {
  const cos = Math.cos(ry), sin = Math.sin(ry);
  const L = (lx, lz) => [x + cos * lx - sin * lz, z - sin * lx - cos * lz];
  const W = 30, D = 26;

  // 院墙（弹孔墙：这面墙每平方米上百个弹孔，靠 BrickWallSooty 的剥落 + 后面撒弹孔贴花表达）
  const walls = [
    { lx: 0, lz: -D / 2, len: W, rot: 0 },
    { lx: -W / 2, lz: 0, len: D, rot: Math.PI / 2 },
    { lx: W / 2, lz: 0, len: D, rot: Math.PI / 2 },
  ];
  for (let i = 0; i < walls.length; i += 1) {
    const w = walls[i];
    const [wx, wz] = L(w.lx, w.lz);
    AddWall(sink, "BrickWallSooty", {
      x: wx, z: wz, length: w.len, height: 2.7, thickness: 0.45,
      ry: ry + w.rot, ruin: damage * 0.55, seed: `${seed}:w${i}`, plinth: "Stone", cope: true,
    });
  }
  // 南面：门楼居中，两侧短墙
  const gateW = 3.2;
  for (const s of [-1, 1]) {
    const segLen = (W - gateW) / 2;
    const [sx, sz] = L(s * (gateW / 2 + segLen / 2), D / 2);
    AddWall(sink, "BrickWallSooty", {
      x: sx, z: sz, length: segLen, height: 2.7, thickness: 0.45,
      ry, ruin: damage * 0.5, seed: `${seed}:ws${s}`, plinth: "Stone", cope: true,
    });
  }
  const [gx, gz] = L(0, D / 2);
  AddGatehouse(sink, { x: gx, z: gz, ry, seed: `${seed}:gate`, damage: damage * 0.6, openW: gateW });

  // 礼拜堂（北，最大的一进；卷棚顶做成两坡但脊部略平）
  const [hx, hz] = L(0, -D / 2 + 7.5);
  AddRoomBlock(sink, {
    x: hx, z: hz, ry, width: 18, depth: 11, eaveY: 3.4, ridgeY: 6.1,
    seed: `${seed}:hall`, damage: damage * 0.7, facing: 1, bays: 5, roofRafters: false,
  });
  // 讲堂（西）与配房（东）
  const [jx, jz] = L(-W / 2 + 4.2, 2.0);
  AddRoomBlock(sink, {
    x: jx, z: jz, ry: ry + Math.PI / 2, width: 10, depth: 5.6,
    eaveY: 2.7, ridgeY: 4.4, seed: `${seed}:jiang`, damage: damage * 0.9, facing: 1, bays: 3, roofRafters: false,
  });
  const [ex, ez] = L(W / 2 - 4.2, 2.0);
  AddRoomBlock(sink, {
    x: ex, z: ez, ry: ry - Math.PI / 2, width: 10, depth: 5.0,
    eaveY: 2.6, ridgeY: 4.2, seed: `${seed}:pei`, damage: damage * 0.8, facing: 1, bays: 3, roofRafters: false,
  });

  // 院里的老树与石阶
  const [tx, tz] = L(-5.5, 4.0);
  sink.props.push({ kind: "tree", x: tx, z: tz, seed: `${seed}:tree`, scale: 1.3 });
  const [stx, stz] = L(0, -D / 2 + 13.4);
  sink.Add("Stone", PlaceGeometry(MakeBox(19, 0.28, 1.6, TILE_METERS.stone, `${seed}:step`),
    { x: stx, y: 0.14, z: stz, ry }));
}

/** 街垒：门板、水缸、粮包、独轮车、沙包 —— 就便器材，不是工事教科书。 */
export function AddBarricade(sink, { x, z, ry = 0, length = 5, seed = "bar", height = 1.15 }) {
  const rnd = Mulberry32(HashString(seed));
  const cos = Math.cos(ry), sin = Math.sin(ry);
  const bags = [];
  const dummy = new THREE.Object3D();
  const rows = Math.max(2, Math.round(height / 0.24));
  for (let row = 0; row < rows; row += 1) {
    const rowLen = length * (1 - row * 0.06);
    const n = Math.max(2, Math.round(rowLen / 0.6));
    for (let i = 0; i < n; i += 1) {
      const lx = -rowLen / 2 + (i + 0.5) * (rowLen / n);
      const lz = (rnd() - 0.5) * 0.12;
      dummy.position.set(x + cos * lx - sin * lz, 0.12 + row * 0.225, z - sin * lx - cos * lz);
      dummy.rotation.set((rnd() - 0.5) * 0.1, ry + (rnd() - 0.5) * 0.28, (rnd() - 0.5) * 0.1);
      dummy.scale.set(1, 0.95 + rnd() * 0.14, 1);
      dummy.updateMatrix();
      bags.push(dummy.matrix.clone());
    }
  }
  sink.props.push({ kind: "sandbags", matrices: bags });
  sink.Solid(x, height / 2, z, length / 2 + 0.15, height / 2, 0.3, "barricade", ry);
  sink.Cover(x, z, height, sin, cos);

  // 掺进去的就便器材：门板斜靠、水缸、独轮车
  if (rnd() < 0.7) {
    const lx = (rnd() - 0.5) * length * 0.6;
    sink.Add("WoodDoor", PlaceGeometry(MakeBox(1.0, 1.9, 0.06, TILE_METERS.wood, `${seed}:pl`),
      { x: x + cos * lx, y: 0.85, z: z - sin * lx - cos * 0.35, ry, rx: 0.42 }));
  }
  if (rnd() < 0.5) AddWaterVat(sink, x + cos * (length / 2 + 0.5), z - sin * (length / 2 + 0.5), `${seed}:v`);
}

// 三月的乔木没有树叶可帮忙遮形，树干与枝桠本身必须读得出树形。这里不再用
// "一根杆 + 一圈十字枝"：每根大枝从树干生出、折向天空，再分出细枝；根颈由
// 加粗的下段主干承托。所有点都在本地坐标系里算，最后才一次性平移到世界坐标，避免
// 旧版二级枝被 x/z 平移两次而漂到树干外。
const TREE_UP = new THREE.Vector3(0, 1, 0);

function ApplyTreeBarkUv(geometry, length, offset = 0) {
  const uv = geometry.attributes.uv;
  for (let index = 0; index < uv.count; index += 1) {
    uv.setXY(index, uv.getX(index) * 1.55 + offset, uv.getY(index) * length / 0.45);
  }
  uv.needsUpdate = true;
  return geometry;
}

/** 一截连接两点的锥形枝干。Cylinder 的两端严格贴在 from / to，绝不悬枝。 */
function MakeTreeLimb(from, to, baseRadius, tipRadius, sides = 6, uvOffset = 0) {
  const direction = to.clone().sub(from);
  const length = direction.length();
  if (length < 0.001) return null;
  const geometry = ApplyTreeBarkUv(
    new THREE.CylinderGeometry(tipRadius, baseRadius, length, sides, 1), length, uvOffset,
  );
  const rotation = new THREE.Quaternion().setFromUnitVectors(TREE_UP, direction.normalize());
  const midpoint = from.clone().add(to).multiplyScalar(0.5);
  geometry.applyMatrix4(new THREE.Matrix4().compose(
    midpoint, rotation, new THREE.Vector3(1, 1, 1),
  ));
  return geometry;
}

function StemPoint(points, height, t) {
  const y = t * height;
  for (let index = 0; index < points.length - 1; index += 1) {
    const from = points[index];
    const to = points[index + 1];
    if (y <= to.y || index === points.length - 2) {
      const span = Math.max(0.001, to.y - from.y);
      return from.clone().lerp(to, Math.max(0, Math.min(1, (y - from.y) / span)));
    }
  }
  return points[points.length - 1].clone();
}

/**
 * 造一棵落叶乔木的骨架。profile 只控制树种剪影；枝条层级、树干弯曲与根部都由
 * seed 固定，出图与编辑器每次重建都会得到同一棵树。
 */
function AddLeaflessTree(sink, {
  x, z, seed, scale, material, height, baseY,
}, profile) {
  const rnd = Mulberry32(HashString(seed));
  const h = height > 0 ? height : (profile.heightMin + rnd() * profile.heightRange) * scale;
  const shapeScale = h / profile.referenceHeight;
  const baseRadius = profile.baseRadius * shapeScale;
  const branchScale = h * profile.branchScale;
  const trunkLean = profile.trunkLean * shapeScale;
  const geometries = [];
  const addLimb = (from, to, base, tip, sides = 6) => {
    const limb = MakeTreeLimb(from, to, base, tip, sides, rnd() * 3);
    if (limb) geometries.push(limb);
  };

  // 四段主干让树有重量和生长方向，而不是一根笔直的电线杆。
  const stem = [
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3((rnd() - 0.5) * trunkLean * 0.45, h * 0.28,
      (rnd() - 0.5) * trunkLean * 0.45),
    new THREE.Vector3((rnd() - 0.5) * trunkLean, h * 0.58,
      (rnd() - 0.5) * trunkLean),
    new THREE.Vector3((rnd() - 0.5) * trunkLean * 1.35, h * 0.79,
      (rnd() - 0.5) * trunkLean * 1.35),
    new THREE.Vector3((rnd() - 0.5) * trunkLean * 1.6, h,
      (rnd() - 0.5) * trunkLean * 1.6),
  ];
  // 加宽第一截的根颈。横向根须在当前低机位会与地表形成黑色十字，不如让体量
  // 留在真正可读的树干上。
  const stemRadii = [baseRadius * 1.30, baseRadius * 0.88, baseRadius * 0.56,
    baseRadius * 0.34, baseRadius * 0.12];
  for (let index = 0; index < stem.length - 1; index += 1) {
    addLimb(stem[index], stem[index + 1], stemRadii[index], stemRadii[index + 1], 8);
  }

  // 大枝不按一层等高的轮生排布：每一根先拱出去，再向上分叉。远中景读到的
  // 是一个有呼吸的枝网，而不是路牌上的十字架。
  const branchCount = profile.branchCount + Math.floor(rnd() * profile.branchJitter);
  const crownTop = 0.91 + rnd() * 0.05;
  const crownSpan = crownTop - profile.crownStart;
  const spin = rnd() * Math.PI * 2;
  for (let index = 0; index < branchCount; index += 1) {
    const tier = branchCount > 1 ? index / (branchCount - 1) : 0;
    const t = profile.crownStart + crownSpan * tier + (rnd() - 0.5) * 0.075;
    const anchor = StemPoint(stem, h, Math.max(profile.crownStart, Math.min(crownTop, t)));
    const angle = spin + index / branchCount * Math.PI * 2 + (rnd() - 0.5) * 0.56;
    const horizontal = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
    const len = branchScale * (profile.branchMin + rnd() * (profile.branchMax - profile.branchMin));
    const rise = len * (profile.riseMin + rnd() * (profile.riseMax - profile.riseMin));
    const knee = anchor.clone()
      .addScaledVector(horizontal, len * (0.42 + rnd() * 0.10))
      .add(new THREE.Vector3((rnd() - 0.5) * len * 0.12, rise * 0.44,
        (rnd() - 0.5) * len * 0.12));
    const tip = anchor.clone().addScaledVector(horizontal, len)
      .add(new THREE.Vector3(0, rise, 0));
    const limbRadius = baseRadius * (0.36 + rnd() * 0.14);
    addLimb(anchor, knee, limbRadius, limbRadius * 0.68, 6);
    addLimb(knee, tip, limbRadius * 0.68, limbRadius * 0.34, 6);

    // 每根大枝的两条二级枝形成真正的分叉节奏；顶端再留一根短梢，保持三月
    // "枝条透光"，却不退回到稀疏杆状物。
    for (let childIndex = 0; childIndex < 2; childIndex += 1) {
      const along = 0.30 + childIndex * 0.36 + rnd() * 0.12;
      const childStart = anchor.clone().lerp(tip, along);
      const side = childIndex === 0 ? -1 : 1;
      const childAngle = angle + side * (0.48 + rnd() * 0.38);
      const childHorizontal = new THREE.Vector3(Math.cos(childAngle), 0, Math.sin(childAngle));
      const childLength = len * (0.38 + rnd() * 0.17);
      const childTip = childStart.clone().addScaledVector(childHorizontal, childLength)
        .add(new THREE.Vector3(0, childLength * (0.28 + rnd() * 0.24), 0));
      const childBase = limbRadius * (0.42 + rnd() * 0.10);
      addLimb(childStart, childTip, childBase, childBase * 0.35, 5);

      const twigAngle = childAngle + (rnd() - 0.5) * 0.72;
      const twigLength = childLength * (0.36 + rnd() * 0.14);
      const twigTip = childTip.clone().add(
        new THREE.Vector3(Math.cos(twigAngle) * twigLength, twigLength * (0.30 + rnd() * 0.25),
          Math.sin(twigAngle) * twigLength),
      );
      addLimb(childTip, twigTip, childBase * 0.34, Math.max(0.009, childBase * 0.13), 4);
    }
    const leaderAngle = angle + (rnd() - 0.5) * 0.44;
    const leaderLength = len * (0.24 + rnd() * 0.12);
    addLimb(tip, tip.clone().add(new THREE.Vector3(
      Math.cos(leaderAngle) * leaderLength, leaderLength * (0.50 + rnd() * 0.18),
      Math.sin(leaderAngle) * leaderLength,
    )), limbRadius * 0.30, Math.max(0.008, limbRadius * 0.09), 4);
  }

  sink.Add(material, PlaceGeometry(MergeGeometries(geometries), { x, y: baseY, z }));
  sink.Solid(x, baseY + h / 2, z, baseRadius * 1.45, h / 2, baseRadius * 1.45, "prop");
}

/** 杨树/柳树：三四月枝条透光、新叶尚未展开，靠真实分叉而非一团假树冠读形。 */
export function AddTree(sink, {
  x, z, seed = "t", scale = 1, material = "TreeBark", height = 0, baseY = 0,
}) {
  AddLeaflessTree(sink, { x, z, seed, scale, material, height, baseY }, {
    heightMin: 5.5, heightRange: 3.0, referenceHeight: 7.0,
    baseRadius: 0.22, branchScale: 1,
    trunkLean: 0.28, crownStart: 0.46,
    branchCount: 7, branchJitter: 3,
    branchMin: 0.17, branchMax: 0.30,
    riseMin: 0.16, riseMax: 0.38,
  });
}

/**
 * 侧柏（柏树）：鲁南坟地与寺庙旁的常绿树，三月照旧墨绿 ——
 * 是无叶季节里唯一成片不透光的竖向剪影，坟地读图信号的一半靠它。
 * 树冠用三段叠锥，每段沿一个方向歪一点，避免「圣诞树」式的机械对称。
 */
export function AddCypress(sink, {
  x, z, seed = "cypress", scale = 1, height = 0, baseY = 0,
  material = "Cypress",
}) {
  const rnd = Mulberry32(HashString(seed));
  const h = height > 0 ? height : (4.6 + rnd() * 2.6) * scale;
  const trunkH = h * 0.16;
  const trunk = new THREE.CylinderGeometry(0.07 * scale, 0.13 * scale, trunkH, 7);
  sink.Add("TreeBark", PlaceGeometry(trunk, { x, y: baseY + trunkH / 2, z }));
  // 三段树冠：下宽上尖，每段的轴都偏出一点、歪出一点
  const layers = [];
  const tiers = [
    { t: 0.10, span: 0.46, r: 0.30 }, { t: 0.42, span: 0.34, r: 0.24 },
    { t: 0.70, span: 0.26, r: 0.17 },
  ];
  for (const tier of tiers) {
    const coneH = h * tier.span;
    const cone = new THREE.ConeGeometry(tier.r * scale * (0.9 + rnd() * 0.2), coneH, 9);
    const pos = cone.attributes.position;
    // 锥面轻微起伏：把每一列顶点沿径向抖一点，轮廓不再是正多边形
    for (let i = 0; i < pos.count; i += 1) {
      const a = Math.atan2(pos.getZ(i), pos.getX(i));
      if (Math.abs(pos.getY(i)) < coneH / 2 - 0.01) {
        const wob = 1 + Math.sin(a * 5 + rnd()) * 0.09;
        pos.setX(i, pos.getX(i) * wob);
        pos.setZ(i, pos.getZ(i) * wob);
      }
    }
    cone.computeVertexNormals();
    layers.push(PlaceGeometry(cone, {
      x: (rnd() - 0.5) * 0.12 * scale, y: h * tier.t + coneH / 2,
      z: (rnd() - 0.5) * 0.12 * scale, rz: (rnd() - 0.5) * 0.08,
    }));
  }
  sink.Add(material, PlaceGeometry(MergeGeometries(layers), { x, y: baseY, z }));
  sink.Solid(x, baseY + h / 2, z, 0.32 * scale, h / 2, 0.32 * scale, "prop");
}

/**
 * 杨树：直干高挑、净杆到顶、枝条一律朝上 —— 与柳树的横向披挂正好相反。
 * 鲁南行道树与田间防风带的主力，沿路成行栽。
 */
export function AddPoplar(sink, {
  x, z, seed = "poplar", scale = 1, height = 0, baseY = 0,
  material = "TreeBark",
}) {
  AddLeaflessTree(sink, { x, z, seed, scale, material, height, baseY }, {
    heightMin: 8.5, heightRange: 3.5, referenceHeight: 10.0,
    baseRadius: 0.19, branchScale: 1,
    // 杨树的净杆长、主干直；枝网收在顶端并向上抽，不拿柳树的横向披挂来套。
    trunkLean: 0.09, crownStart: 0.62,
    branchCount: 6, branchJitter: 3,
    branchMin: 0.12, branchMax: 0.20,
    riseMin: 0.34, riseMax: 0.62,
  });
}

/**
 * 果树（修剪过的梨/柿）：鲁南农家院旁一排矮壮果树。
 * 冬季修剪痕很明显：主杆矮、三四根骨架枝张开成碗口，枝端平齐 —— 一眼是人为的。
 */
export function AddOrchardTree(sink, {
  x, z, seed = "orchard", scale = 1, height = 0, baseY = 0,
  material = "Willow",
}) {
  const rnd = Mulberry32(HashString(seed));
  const h = height > 0 ? height : (2.9 + rnd() * 1.1) * scale;
  const boleH = h * 0.45;
  const trunk = new THREE.CylinderGeometry(0.11 * scale, 0.17 * scale, boleH, 8);
  sink.Add("TreeBark", PlaceGeometry(trunk, { x, y: baseY + boleH / 2, z }));
  const branches = [];
  const arms = 3 + Math.floor(rnd() * 2);
  for (let i = 0; i < arms; i += 1) {
    const a = (i / arms) * Math.PI * 2 + rnd() * 0.7;
    const tilt = 0.62 + rnd() * 0.38;
    const len = (1.1 + rnd() * 0.7) * scale;
    branches.push(PlaceGeometry(
      PlaceGeometry(new THREE.CylinderGeometry(0.03 * scale, 0.08 * scale, len, 6),
        { y: len / 2 }),
      { y: boleH, ry: a, rz: tilt }));
    // 骨架枝中前段再分两根短结果枝（挂点沿骨架枝方向算，别悬在半空）
    for (let j = 0; j < 2; j += 1) {
      const sub = (0.4 + rnd() * 0.3) * scale;
      const f = 0.55 + j * 0.25;
      branches.push(PlaceGeometry(PlaceGeometry(
        new THREE.CylinderGeometry(0.014 * scale, 0.03 * scale, sub, 4),
        { y: sub / 2, ry: rnd() * Math.PI * 2, rz: 0.5 + rnd() * 0.5 }),
        {
          // branches 是本地几何，树整体会在 sink.Add 时平移到 x/z/baseY。
          // 这里再塞世界坐标会把二级枝挪两次，果树就像爆炸了一样散开。
          x: -Math.sin(tilt) * Math.cos(a) * len * f,
          y: boleH + Math.cos(tilt) * len * f,
          z: Math.sin(tilt) * Math.sin(a) * len * f,
        }));
    }
  }
  sink.Add(material, PlaceGeometry(MergeGeometries(branches), { x, y: baseY, z }));
  sink.Solid(x, baseY + boleH / 2, z, 0.22 * scale, boleH / 2, 0.22 * scale, "prop");
}

/** 电线杆 + 断掉的电话线：镇子有电报电话，线被打断垂下来是很强的战场符号。 */
export function AddPole(sink, { x, z, seed = "pole", height = 6.5 }) {
  sink.Add("WoodBeam", PlaceGeometry(
    new THREE.CylinderGeometry(0.09, 0.13, height, 8), { x, y: height / 2, z }));
  sink.Add("WoodBeam", PlaceGeometry(
    MakeBox(1.5, 0.09, 0.09, TILE_METERS.wood, `${seed}:arm`), { x, y: height - 0.5, z }));
  sink.Solid(x, height / 2, z, 0.16, height / 2, 0.16, "prop");
}

// ===========================================================================
// 滕县构件（1938 年 3 月）
//
// 以下全部是**滕县专用**，与上面台儿庄那一套并存、不互相替换：
// 台儿庄的 AddRampart（4 m 民防寨墙）、AddGatehouse（7 m 寨门）、AddMosque
// 在滕县一律不用 —— 11.5 m 的包砖县城墙与 4 m 的寨墙差一个量级，改皮复用是错的。
// 但鲁南民居那一套（AddCompound / AddRoomBlock / AddHardMountainRoof / AddWall /
// AddDoorReveal / AddWell / AddMillstone / AddWaterVat / AddTree / AddPole）
// 滕县与台儿庄同属鲁南，硬山小青瓦、四合院、对外不开窗、过墙石都成立，直接搬。
//
// 材质名在这里写的是**逻辑名**（CityBrick / Ashlar / RammedEarth / TubeTile …），
// 由 Script_TengxianCity 的 resolve 表映射到既有烘焙配方 + 调色。
// 这样 Script_TexBake 一个字不用改，也不必给滕县单开一套贴图。
// ===========================================================================

/** 城墙的默认规格。数字的出处与推定标注见 Data_Tengxian.mjs。 */
export const CITY_WALL = {
  height: 11.5, parapet: 1.6, topWidth: 5.0, baseWidth: 10.0, plinth: 1.8,
  courses: 4, sliceLen: 8.0, merlonPeriod: 1.7, merlonWidth: 1.15, merlonThickness: 0.55,
  innerParapetH: 0.9, innerParapetT: 0.45,
};

/**
 * 一段城墙（墙身 11.5 m + 女墙 1.6 m + 顶宽 5 / 底宽 10 的收分）。
 *
 * 局部坐标：+x 沿墙展开，+z 指向**城外**，ry 是「这面墙朝外」的方向。
 *
 * 三条形制必须同时成立，少一条这面墙就不是 1938 年的滕县城：
 *   ① 自下而上分层：条石勒脚 1.8 m → 青砖 → 民国碎砖补丁。
 *      条石那条灰白带是滕县区别于纯砖城镇的最强读图信号（鲁南是石灰岩产区）。
 *   ② 收分：底 10 m 收到顶 5 m。墙脚看过去是外倾的，不是一块竖板。
 *   ③ **缺口断面必须露夯土芯**：砖包夯土，轰塌之后露出来的是黄土不是砖。
 *      少了这一笔，缺口读作「贴图破了」而不是「城墙被打开了」。
 *
 * 性能：整段墙按 sliceLen 切片，全部并进 CityBrick / Ashlar 两个桶，
 * 2.44 km 周长约 300 片 × 十来个盒子 —— 合批之后是两个 draw call。
 */
export function AddCityWall(sink, {
  x, z, ry = 0, length, baseY = 0, seed = "cityWall",
  height = CITY_WALL.height, parapet = CITY_WALL.parapet,
  topWidth = CITY_WALL.topWidth, baseWidth = CITY_WALL.baseWidth,
  plinth = CITY_WALL.plinth, courses = CITY_WALL.courses, sliceLen = CITY_WALL.sliceLen,
  gaps = [], breaches = [], innerGaps = [], merlons = true, innerParapet = true,
  brick = "CityBrick", stone = "Ashlar", core = "RammedEarth",
}) {
  const cos = Math.cos(ry), sin = Math.sin(ry);
  const L = (lx, lz) => ({ x: x + cos * lx + sin * lz, z: z - sin * lx + cos * lz });
  const rnd = Mulberry32(HashString(seed));
  const detailRnd = Mulberry32(HashString(`${seed}:wallDetails`));
  const top = baseY + height;
  let detailCount = 0;
  // 某个高度上的墙厚（线性收分）
  const widthAt = (y) => baseWidth + (topWidth - baseWidth) * ((y - baseY) / height);
  // 这个位置的墙头在哪：null = 门洞／完全没墙；否则返回绝对高度
  const crestAt = (lx) => {
    for (const g of gaps) if (Math.abs(lx - g.at) < g.width / 2) return null;
    let h = height;
    for (const b of breaches) {
      const half = b.width / 2;
      const signed = (lx - b.at) / half;
      const d = Math.abs(lx - b.at);
      if (d >= half) continue;
      // 缺口剖面：中间压到可跨越的残砖高度，左右肩用不同幂次长回墙顶，再叠两档
      // 确定性崩边。参考图里的破口不是对称抛物线，更不是三块八米宽的楼梯盒。
      const t = d / half;
      const floor = b.floor ?? 0.04;
      const power = signed < 0 ? (b.leftPower ?? 1.28) : (b.rightPower ?? 1.52);
      const shoulder = floor + (1 - floor) * Math.pow(t, power);
      const phase = b.phase ?? 0;
      const chip = (Math.sin((lx - b.at) * 1.71 + phase) * 0.055
        + Math.sin((lx - b.at) * 3.83 + phase * 0.63) * 0.026)
        * (0.35 + t * 0.65) * (1 - Math.pow(t, 5));
      h = Math.min(h, height * Clamp(shoulder + chip, floor, 1));
    }
    return baseY + h;
  };

  // 完整墙仍按约八米合批；只在破口及其两肩细分到约一米。这样不会把整圈城墙
  // 的几何量翻八倍，却能让 17—26 m 的破口真正出现十几级不规则断肩。
  const coarseSlices = Math.max(2, Math.round(length / sliceLen));
  const coarseLen = length / coarseSlices;
  const segments = [];
  for (let coarse = 0; coarse < coarseSlices; coarse += 1) {
    const coarseStart = -length / 2 + coarseLen * coarse;
    const coarseCenter = coarseStart + coarseLen / 2;
    const nearby = breaches.filter((b) => Math.abs(coarseCenter - b.at) < b.width / 2 + coarseLen);
    const targetLen = nearby.length
      ? Math.min(...nearby.map((b) => b.detailLen ?? 1.15)) : coarseLen;
    const subdivisions = Math.max(1, Math.ceil(coarseLen / targetLen));
    const segmentLength = coarseLen / subdivisions;
    for (let sub = 0; sub < subdivisions; sub += 1) {
      segments.push({
        lx: coarseStart + segmentLength * (sub + 0.5),
        segLen: segmentLength,
      });
    }
  }
  for (let i = 0; i < segments.length; i += 1) {
    const { lx, segLen } = segments[i];
    const crest = crestAt(lx);
    if (crest === null) continue;
    const intact = crest >= top - 0.05;

    // ① 条石勒脚
    const plinthTop = Math.min(crest, baseY + plinth);
    if (plinthTop > baseY + 0.05) {
      const w = widthAt((baseY + plinthTop) / 2);
      const p = L(lx, 0);
      sink.Add(stone, PlaceGeometry(
        MakeBox(segLen * 1.02, plinthTop - baseY, w, TILE_METERS.stone, `${seed}:pl${i}`),
        { x: p.x, y: (baseY + plinthTop) / 2, z: p.z, ry }));
    }
    // ② 青砖墙身，逐层收分
    const bodyBottom = baseY + plinth;
    for (let c = 0; c < courses; c += 1) {
      const y0 = bodyBottom + (top - bodyBottom) * (c / courses);
      const y1 = bodyBottom + (top - bodyBottom) * ((c + 1) / courses);
      const yTop = Math.min(y1, crest);
      if (yTop <= y0 + 0.05) break;
      const w = widthAt((y0 + yTop) / 2);
      const p = L(lx, 0);
      // 民国碎砖／水泥乱砌补丁：约一成的砖层换成风化更重的那张贴图
      const mat = rnd() < 0.11 ? `${brick}Worn` : brick;
      sink.Add(mat, PlaceGeometry(
        MakeBox(segLen * 1.02, yTop - y0, w, TILE_METERS.brick, `${seed}:b${i}${c}`, BRICK_UV_GRID),
        { x: p.x, y: (y0 + yTop) / 2, z: p.z, ry }));
      // 分段包砖的竖向砌筑缝：每约五十米一条，按各收分层贴住墙皮，避免做成
      // 从上到下悬空的一块黑板。它不是凸出的扶壁，不改变墙体轮廓与碰撞。
      if (intact && i % 6 === 0) {
        const joint = L(lx - segLen * 0.47, w / 2 + 0.034);
        sink.Add("CityBrickPatch", PlaceGeometry(
          MakeBox(0.11, (yTop - y0) * 0.94, 0.048, TILE_METERS.brick,
            `${seed}:joint${i}${c}`, BRICK_UV_GRID),
          { x: joint.x, y: (y0 + yTop) / 2, z: joint.z, ry }));
        detailCount += 1;
      }
    }
    // ③ 缺口断面：砖皮没了，露出来的是夯土芯
    if (!intact) {
      const coreTop = Math.min(top - 0.4, crest + 0.6 + rnd() * 1.6);
      if (coreTop > crest + 0.2) {
        const w = widthAt(crest) * 0.62;
        const p = L(lx, (rnd() - 0.5) * 0.6);
        sink.Add(core, PlaceGeometry(
          MakeBox(segLen * 0.96, coreTop - crest, w, TILE_METERS.adobe, `${seed}:core${i}`),
          { x: p.x, y: (crest + coreTop) / 2, z: p.z, ry }));
      }
    }

    if (intact) {
      // 墙顶马道不是一条裸露的青砖盒盖：用浅灰铺砖分段压住顶面，近看能读出
      // 一块块修补过的走道，远看也能把墙顶与墙身分开。
      const deck = L(lx, 0);
      sink.Add("WallPaving", PlaceGeometry(
        MakeBox(segLen * 0.995, 0.07, topWidth * 0.91, TILE_METERS.stone,
          `${seed}:paving${i}`),
        { x: deck.x, y: top + 0.035, z: deck.z, ry }));
      detailCount += 1;

      // 女墙脚下的连续压顶线，把墙身、墙顶和垛口三层明确分开。
      const corniceY = top - 0.30;
      const cornice = L(lx, widthAt(corniceY) / 2 + 0.10);
      sink.Add("WallPaving", PlaceGeometry(
        MakeBox(segLen * 0.995, 0.17, 0.24, TILE_METERS.stone, `${seed}:cornice${i}`),
        { x: cornice.x, y: corniceY, z: cornice.z, ry }));
      detailCount += 1;

      // 外墙面上不规则的旧砖修补。另起一套随机源，避免新增细节改变原有墙身损伤分布。
      if (i % 4 === 1) {
        const patchY = baseY + 3.0 + (i % 3) * 2.15 + detailRnd() * 0.45;
        const patchW = segLen * (0.28 + detailRnd() * 0.20);
        const patchH = 0.66 + detailRnd() * 0.46;
        const patchX = lx + (detailRnd() - 0.5) * segLen * 0.25;
        // 三排错缝补砖做出参差边界，避免修补层读成贴在墙上的深色广告牌。
        for (let row = 0; row < 3; row += 1) {
          const rowY = patchY + (row - 1) * patchH / 3;
          const rowW = patchW * (0.62 + detailRnd() * 0.30);
          const rowX = patchX + (detailRnd() - 0.5) * (patchW - rowW) * 0.72;
          const face = L(rowX, widthAt(rowY) / 2 + 0.035);
          sink.Add("CityBrickPatch", PlaceGeometry(
            MakeBox(rowW, patchH / 3 * 1.06, 0.052, TILE_METERS.brick,
              `${seed}:repair${i}${row}`, BRICK_UV_GRID),
            { x: face.x, y: rowY, z: face.z, ry }));
          detailCount += 1;
        }
      }

      // 城墙排水/泄水小孔：在墙顶下方形成一排稀疏暗点，打破六百米整墙的空白。
      if (i % 5 === 3) {
        const drainY = top - 1.18 - detailRnd() * 0.34;
        const face = L(lx, widthAt(drainY) / 2 + 0.045);
        sink.Add("Charred", PlaceGeometry(
          MakeBox(0.46, 0.29, 0.045, TILE_METERS.stone, `${seed}:drain${i}`),
          { x: face.x, y: drainY, z: face.z, ry }));
        const sill = L(lx, widthAt(drainY) / 2 + 0.13);
        sink.Add("WallPaving", PlaceGeometry(
          MakeBox(0.58, 0.09, 0.26, TILE_METERS.stone, `${seed}:drainSill${i}`),
          { x: sill.x, y: drainY - 0.18, z: sill.z, ry }));
        const streakY = drainY - 1.05;
        const streak = L(lx + (detailRnd() - 0.5) * 0.12,
          widthAt(streakY) / 2 + 0.038);
        sink.Add("CityBrickPatch", PlaceGeometry(
          MakeBox(0.22, 1.65, 0.045, TILE_METERS.brick, `${seed}:rainStreak${i}`,
            BRICK_UV_GRID),
          { x: streak.x, y: streakY, z: streak.z, ry }));
        detailCount += 3;
      }

      // 稀疏守城物资：只靠宇墙内侧放低矮木箱，不占马道中线，也不登记碰撞。
      if (i % 13 === 5) {
        const crate = L(lx - segLen * 0.18, -topWidth * 0.23);
        sink.Add("WoodDoor", PlaceGeometry(
          MakeBox(0.82, 0.46, 0.62, TILE_METERS.wood, `${seed}:crate${i}`),
          { x: crate.x, y: top + 0.23, z: crate.z, ry: ry + 0.08 }));
        const box = L(lx + segLen * 0.12, -topWidth * 0.25);
        sink.Add("WoodDoor", PlaceGeometry(
          MakeBox(0.58, 0.34, 0.52, TILE_METERS.wood, `${seed}:box${i}`),
          { x: box.x, y: top + 0.17, z: box.z, ry: ry - 0.11 }));
        detailCount += 2;
      }
    }

    // 碰撞：下半段按墙脚宽（外面撞上去是一堵斜墙），上半段按墙顶宽（人在顶上走的是 5 m）
    const p = L(lx, 0);
    const midW = widthAt(baseY + height * 0.3);
    const lowTop = Math.min(crest, baseY + height * 0.6);
    sink.Solid(p.x, (baseY - 1.5 + lowTop) / 2, p.z,
      segLen / 2, (lowTop - baseY + 1.5) / 2, midW / 2, "cityWall", ry);
    if (intact) {
      sink.Solid(p.x, (lowTop + top) / 2, p.z,
        segLen / 2, (top - lowTop) / 2, topWidth / 2, "cityWall", ry);
    }
  }

  // 一处缺口只生成一片程序化散砖底层；大轮廓、断肩和双向坍塌扇由 Blender Prop
  // 负责。若跟着细分片逐段撒，一处破口会膨胀到数百块散砖，反而糊掉通行口。
  for (let index = 0; index < breaches.length; index += 1) {
    const breach = breaches[index];
    const foot = L(breach.at, widthAt(baseY) / 2 + 1.8);
    sink.props.push({
      kind: "breachSpill", x: foot.x, z: foot.z,
      radius: Math.max(4.8, breach.width * 0.34), seed: `${seed}:sp${index}`,
    });
  }

  // 女墙与垛口。周期沿整段墙连续算，切片边界上不会错半个垛口
  if (merlons || innerParapet) {
    const period = CITY_WALL.merlonPeriod;
    const n = Math.max(2, Math.round(length / period));
    for (let m = 0; m < n; m += 1) {
      const lx = -length / 2 + (m + 0.5) * (length / n);
      const crest = crestAt(lx);
      if (crest === null || crest < top - 0.05) continue;
      if (merlons && m % 2 === 0) {
        const lz = topWidth / 2 - CITY_WALL.merlonThickness / 2;
        const p = L(lx, lz);
        sink.Add(brick, PlaceGeometry(
          MakeBox(CITY_WALL.merlonWidth, parapet, CITY_WALL.merlonThickness, TILE_METERS.brick,
            `${seed}:mer${m}`, BRICK_UV_GRID),
          { x: p.x, y: top + parapet / 2, z: p.z, ry }));
        sink.Add("WallPaving", PlaceGeometry(
          MakeBox(CITY_WALL.merlonWidth + 0.12, 0.09, CITY_WALL.merlonThickness + 0.14,
            TILE_METERS.stone, `${seed}:merCap${m}`),
          { x: p.x, y: top + parapet + 0.045, z: p.z, ry }));
        detailCount += 1;
        if (m % 6 === 0) {
          const slit = L(lx, topWidth / 2 + 0.018);
          sink.Add("Charred", PlaceGeometry(
            MakeBox(0.22, 0.34, 0.035, TILE_METERS.stone, `${seed}:merSlit${m}`),
            { x: slit.x, y: top + parapet * 0.56, z: slit.z, ry }));
          detailCount += 1;
        }
        sink.Solid(p.x, top + parapet / 2,
          p.z, 0.6, parapet / 2, 0.28, "parapet", ry);
        sink.Cover(p.x, p.z, top + parapet, sin, cos);
      }
      // innerGaps：宇墙在上城道到顶的那一段必须断开。
      // 不断开的话马道爬到 11.5 m 之后，正前方是一道 0.9 m 的宇墙挡着 ——
      // 画面上看得见路、碰撞上上不了墙，正是台儿庄那次的翻版事故。
      let innerBlocked = false;
      for (const g of innerGaps) if (Math.abs(lx - g.at) < g.width / 2) innerBlocked = true;
      if (innerParapet && !innerBlocked) {
        // 宇墙：内侧那道矮墙。没有它，城墙顶在画面上是一条没有边的板
        const lz = -(topWidth / 2 - CITY_WALL.innerParapetT / 2);
        const p = L(lx, lz);
        sink.Add(brick, PlaceGeometry(
          MakeBox(length / n * 1.02, CITY_WALL.innerParapetH, CITY_WALL.innerParapetT,
            TILE_METERS.brick, `${seed}:inn${m}`, BRICK_UV_GRID),
          { x: p.x, y: top + CITY_WALL.innerParapetH / 2, z: p.z, ry }));
        sink.Add("WallPaving", PlaceGeometry(
          MakeBox(length / n * 1.02, 0.075, CITY_WALL.innerParapetT + 0.12,
            TILE_METERS.stone, `${seed}:innerCap${m}`),
          { x: p.x, y: top + CITY_WALL.innerParapetH + 0.038, z: p.z, ry }));
        detailCount += 1;
        sink.Solid(p.x, top + CITY_WALL.innerParapetH / 2, p.z, (length / n) / 2, CITY_WALL.innerParapetH / 2, 0.24, "parapet", ry);
      }
    }
  }
  return { detailCount };
}

/**
 * 马面／敌台：凸出墙外 4 m、面宽 8 m 的方台，供侧射。
 * 志载「24 个城堡」是数量，形制与尺寸**全部为推定**（见 Data_Tengxian.PRESUMED）。
 * 它们把一条 610 m 的直墙切成六段，每段都有两侧的交叉火力 —— 明清城防的常规做法。
 */
export function AddBastion(sink, {
  x, z, ry = 0, baseY = 0, seed = "bastion",
  out = 4.0, width = 8.0, height = CITY_WALL.height, parapet = CITY_WALL.parapet,
  wallBaseWidth = CITY_WALL.baseWidth, wallTopWidth = CITY_WALL.topWidth,
  plinth = CITY_WALL.plinth, brick = "CityBrick", stone = "Ashlar",
}) {
  const cos = Math.cos(ry), sin = Math.sin(ry);
  const L = (lx, lz) => ({ x: x + cos * lx + sin * lz, z: z - sin * lx + cos * lz });
  const top = baseY + height;
  // 台身跟着主墙一起收分，凸出量也跟着收（顶上凸出略少）
  const courses = 5;
  for (let c = 0; c < courses; c += 1) {
    const y0 = baseY + (height * c) / courses;
    const y1 = baseY + (height * (c + 1)) / courses;
    const t = ((y0 + y1) / 2 - baseY) / height;
    const outAt = out * (1 - t * 0.18);
    const wAt = width * (1 - t * 0.10);
    const wallFace = (wallBaseWidth + (wallTopWidth - wallBaseWidth) * t) / 2;
    const depth = outAt + 1.2;                       // 往墙里咬 1.2 m，接缝不露天
    const lz = wallFace + outAt - depth / 2;
    const p = L(0, lz);
    const mat = (y1 <= baseY + plinth) ? stone : brick;
    sink.Add(mat, PlaceGeometry(
      MakeBox(wAt, y1 - y0, depth, mat === stone ? TILE_METERS.stone : TILE_METERS.brick,
        `${seed}:c${c}`, mat === stone ? null : BRICK_UV_GRID),
      { x: p.x, y: (y0 + y1) / 2, z: p.z, ry }));
    if (c === 0) {
      sink.Solid(p.x, (baseY - 1 + y1) / 2, p.z, wAt / 2, (y1 - baseY + 1) / 2, depth / 2, "cityWall", ry);
    }
  }
  // 台顶三面垛口：马面的价值全在这三面能打出去
  const faceZ = wallTopWidth / 2 + out * 0.82;
  const wTop = width * 0.9;
  for (let i = 0; i < 5; i += 1) {
    const lx = -wTop / 2 + (i + 0.5) * (wTop / 5);
    if (i % 2 === 1) continue;
    const p = L(lx, faceZ - 0.3);
    sink.Add(brick, PlaceGeometry(
      MakeBox(1.05, parapet, 0.55, TILE_METERS.brick, `${seed}:m${i}`, BRICK_UV_GRID),
      { x: p.x, y: top + parapet / 2, z: p.z, ry }));
    sink.Cover(p.x, p.z, top + parapet, sin, cos);
  }
  for (const s of [-1, 1]) {
    const p = L(s * (wTop / 2 - 0.28), (wallTopWidth / 2 + faceZ) / 2);
    sink.Add(brick, PlaceGeometry(
      MakeBox(0.55, parapet, out * 0.85, TILE_METERS.brick, `${seed}:ms${s}`, BRICK_UV_GRID),
      { x: p.x, y: top + parapet / 2, z: p.z, ry }));
  }
  // 台顶铺面（人能站上去）
  const pTop = L(0, (wallTopWidth / 2 + faceZ) / 2);
  sink.Add(stone, PlaceGeometry(
    MakeBox(wTop, 0.24, out * 0.9, TILE_METERS.stone, `${seed}:deck`),
    { x: pTop.x, y: top - 0.12, z: pTop.z, ry }));
  sink.Solid(pTop.x, top - 0.6, pTop.z, wTop / 2, 0.6, out * 0.45, "cityWall", ry);
}

/**
 * 望角楼：四角各一座（志载 + 日方「東南角望楼」双源吻合，形制尺寸推定）。
 * 做成城墙拐角上的一座小方亭：砖台 + 四柱 + 四坡瓦顶，不做重檐（重檐留给城楼）。
 */
export function AddCornerTower(sink, {
  x, z, baseY = 0, seed = "corner", size = 6.0, height = CITY_WALL.height,
  parapet = CITY_WALL.parapet, brick = "CityBrick", stone = "Ashlar",
}) {
  const top = baseY + height;
  let detailCount = 0;
  // 拐角平台：把两面墙的墙顶连成一块带台明的方台，两向马道在这里转弯。
  const deckSize = CITY_WALL.topWidth + size * 0.66;
  sink.Add(stone, PlaceGeometry(
    MakeBox(deckSize, 0.30, deckSize,
      TILE_METERS.stone, `${seed}:deck`), { x, y: top - 0.15, z }));
  sink.Solid(x, top - 1.2, z, deckSize / 2, 1.2, deckSize / 2, "cityWall");
  sink.Add("WallPaving", PlaceGeometry(
    MakeBox(deckSize * 0.94, 0.08, deckSize * 0.94, TILE_METERS.stone, `${seed}:deckPaving`),
    { x, y: top + 0.04, z }));
  const floor = top + 0.34;
  sink.Add(stone, PlaceGeometry(
    MakeBox(size + 0.72, 0.34, size + 0.72, TILE_METERS.stone, `${seed}:plinth`),
    { x, y: top + 0.17, z }));
  detailCount += 3;

  // 亭身：八根檐柱 + 低槛墙 + 连续额枋。东南/东北等四角自动把通向城内的
  // 两面明间留空，墙顶回廊能在亭内转九十度，不再是一圈无门的栏板。
  const span = size * 0.37;
  const colH = 3.25;
  const eave = floor + colH;
  const columns = [
    [-span, -span], [0, -span], [span, -span],
    [-span, 0], [span, 0],
    [-span, span], [0, span], [span, span],
  ];
  for (let i = 0; i < columns.length; i += 1) {
    const [cx, cz] = columns[i];
    sink.Add("PaintRed", PlaceGeometry(
      MakeBox(0.28, colH, 0.28, TILE_METERS.wood, `${seed}:col${i}`),
      { x: x + cx, y: floor + colH / 2, z: z + cz }));
    sink.Add("PaintGreen", PlaceGeometry(
      MakeBox(0.54, 0.22, 0.54, TILE_METERS.wood, `${seed}:bracket${i}`),
      { x: x + cx, y: eave - 0.20, z: z + cz }));
    detailCount += 2;
  }
  for (const side of [-1, 1]) {
    sink.Add("PaintGreen", PlaceGeometry(
      MakeBox(span * 2 + 0.54, 0.34, 0.28, TILE_METERS.wood, `${seed}:beamZ${side}`),
      { x, y: eave - 0.42, z: z + side * span }));
    sink.Add("PaintGreen", PlaceGeometry(
      MakeBox(0.28, 0.34, span * 2 + 0.54, TILE_METERS.wood, `${seed}:beamX${side}`),
      { x: x + side * span, y: eave - 0.42, z }));
    detailCount += 2;
  }

  const innerX = -Math.sign(x || 1);
  const innerZ = -Math.sign(z || 1);
  const sillH = 0.82;
  const doorW = 2.10;
  const AddSillFace = (axis, side, open) => {
    const wallLength = span * 2;
    const AddSegment = (center, length, tag) => {
      if (axis === "x") {
        sink.Add(brick, PlaceGeometry(
          MakeBox(length, sillH, 0.28, TILE_METERS.brick, `${seed}:${tag}`, BRICK_UV_GRID),
          { x: x + center, y: floor + sillH / 2, z: z + side * span }));
      } else {
        sink.Add(brick, PlaceGeometry(
          MakeBox(0.28, sillH, length, TILE_METERS.brick, `${seed}:${tag}`, BRICK_UV_GRID),
          { x: x + side * span, y: floor + sillH / 2, z: z + center }));
      }
      detailCount += 1;
    };
    if (!open) { AddSegment(0, wallLength, `sill${axis}${side}`); return; }
    const segment = (wallLength - doorW) / 2;
    for (const half of [-1, 1]) {
      AddSegment(half * (doorW / 2 + segment / 2), segment,
        `sill${axis}${side}${half}`);
    }
  };
  for (const side of [-1, 1]) {
    AddSillFace("x", side, side === innerZ);
    AddSillFace("z", side, side === innerX);
  }

  // 闭合歇山/四坡屋面：顶面、底皮和檐口共用顶点，彻底替换旧的四块交叉板。
  const eaveOut = 1.05;
  const rise = 1.72;
  const cornerLift = 0.18;
  const roofW = size + 0.25;
  const roofD = size + 0.25;
  const halfW = roofW / 2 + eaveOut;
  const halfD = roofD / 2 + eaveOut;
  const ridgeHalf = Math.max(roofW * 0.24, halfW - halfD * 0.78);
  const EaveY = (lx) => {
    const t = Math.max(0, (Math.abs(lx) - ridgeHalf) / Math.max(0.01, halfW - ridgeHalf));
    return cornerLift * t * t;
  };
  const PlaceRoof = (material, geometry) => sink.Add(material,
    PlaceGeometry(geometry, { x, y: eave, z }));
  PlaceRoof("TubeTile", MakeGateRoofShell(roofW, roofD, {
    eaveOut, rise, cornerLift, thickness: 0.15, seed: `${seed}:roofShell`,
  }));
  detailCount += 1;

  // 四面连续檐枋。
  const cuts = [-halfW, -ridgeHalf, 0, ridgeHalf, halfW];
  for (const side of [-1, 1]) {
    for (let i = 0; i < cuts.length - 1; i += 1) {
      const a = cuts[i], b = cuts[i + 1];
      PlaceRoof("PaintGreen", MakeBeamBetween(
        [a, EaveY(a) - 0.17, side * halfD], [b, EaveY(b) - 0.17, side * halfD],
        0.17, TILE_METERS.wood, `${seed}:fascia${side}${i}`));
      detailCount += 1;
    }
    PlaceRoof("PaintRed", MakeBeamBetween(
      [side * halfW, EaveY(halfW) - 0.22, -halfD],
      [side * halfW, EaveY(halfW) - 0.22, halfD],
      0.16, TILE_METERS.wood, `${seed}:sideFascia${side}`));
    detailCount += 1;
  }

  // 筒瓦垄、正脊与四条戗脊都贴着同一张壳，逆光轮廓不会再裂开。
  const tileRows = 11;
  for (const side of [-1, 1]) {
    for (let i = 0; i <= tileRows; i += 1) {
      const lx = -halfW + (halfW * 2 * i) / tileRows;
      const ridgeX = Math.max(-ridgeHalf, Math.min(ridgeHalf, lx));
      PlaceRoof("TubeTile", MakeBeamBetween(
        [lx, EaveY(lx) + 0.07, side * halfD], [ridgeX, rise + 0.07, 0],
        0.065, TILE_METERS.roof, `${seed}:tile${side}${i}`));
      detailCount += 1;
    }
  }
  PlaceRoof("TubeTile", MakeBeamBetween(
    [-ridgeHalf - 0.24, rise + 0.12, 0], [ridgeHalf + 0.24, rise + 0.12, 0],
    0.27, TILE_METERS.roof, `${seed}:ridge`));
  detailCount += 1;
  for (const sideX of [-1, 1]) {
    for (const sideZ of [-1, 1]) {
      PlaceRoof("TubeTile", MakeBeamBetween(
        [sideX * ridgeHalf, rise + 0.09, 0],
        [sideX * halfW, EaveY(halfW) + 0.09, sideZ * halfD],
        0.19, TILE_METERS.roof, `${seed}:hip${sideX}${sideZ}`));
      detailCount += 1;
    }
    PlaceRoof("TubeTile", PlaceGeometry(
      MakeBox(0.34, 0.58, 0.34, TILE_METERS.roof, `${seed}:ridgeBeast${sideX}`),
      { x: sideX * (ridgeHalf + 0.16), y: rise + 0.36, z: 0 }));
    detailCount += 1;
  }
  sink.Cover(x, z, top + 1.0, 0, 1);
  void parapet;
  return { detailCount };
}

/**
 * 上城道（马道）—— **全城只有四条，每座城门内侧旁一条**。
 *
 * 这条规则是滕县全局最重要的空间约束：城墙是一条只有四个出入口的高空回廊。
 * 所以这一段代码必须在**碰撞上真的成立** —— 台儿庄那次的教训是马道做成了
 * 一块斜板 + 一个实心大盒子，画面上是坡、碰撞上是墙，谁也上不去。
 * 这里一级一级砌，每级抬高压在 0.56 m 的自动抬腿线以下。
 *
 * 走向：沿墙**平行**爬升（与史实的马道一致），踏面宽 2.4 m。
 * 墙内面是收分的，所以每一级的横向位置跟着那一级的高度往外挪 ——
 * 顶上最后一级正好接到 5 m 宽的墙顶走道，不留缝。
 */
export function AddCityRamp(sink, {
  x, z, ry = 0, at = 0, baseY = 0, topY, seed = "ramp",
  width = 2.4, run = 1.0, landingAt = 13, landingRun = 2.0,
  wallCenterOffset = CITY_WALL.baseWidth / 2, wallTopOffset = CITY_WALL.topWidth / 2,
  material = "Ashlar", dir = 1,
}) {
  const cos = Math.cos(ry), sin = Math.sin(ry);
  const L = (lx, lz) => ({ x: x + cos * lx + sin * lz, z: z - sin * lx + cos * lz });
  const rise = 0.46;
  const steps = Math.max(4, Math.ceil((topY - baseY) / rise));
  const stepRise = (topY - baseY) / steps;
  let along = 0;
  for (let i = 0; i < steps; i += 1) {
    const yTop = baseY + stepRise * (i + 1);
    const t = (yTop - baseY) / (topY - baseY);
    // 那一级所在高度上的墙内面位置（收分：底 -5、顶 -2.5）
    const face = -(wallCenterOffset + (wallTopOffset - wallCenterOffset) * t);
    // face 是负的（墙内面在城心侧），踏面要**继续往城里**让，所以是减不是加。
    // 写成 face + width/2 的话整条马道嵌进墙肚子里：画面上看不见，碰撞上也上不去。
    const lz = face - width / 2;
    const thisRun = (i === landingAt) ? landingRun : run;
    const lx = at + dir * (along + thisRun / 2);
    const p = L(lx, lz);
    const h = yTop - (baseY - 1.6);   // 砌到地面以下，侧面撞过来是一堵矮墙不是悬空片
    sink.Add(material, PlaceGeometry(
      MakeBox(thisRun * 1.02, h, width, TILE_METERS.stone, `${seed}:s${i}`),
      { x: p.x, y: yTop - h / 2, z: p.z, ry }));
    sink.Solid(p.x, yTop - h / 2, p.z, thisRun / 2, h / 2, width / 2, "ramp", ry);
    along += thisRun;
  }
  // 外侧的挡墙：没有它，人从马道上一步就掉到 11 m 底下
  const guardH = 0.85;
  const nSeg = Math.max(2, Math.round(along / 2.0));
  for (let i = 0; i < nSeg; i += 1) {
    const a0 = (along * i) / nSeg, a1 = (along * (i + 1)) / nSeg;
    const t = ((a0 + a1) / 2) / along;
    const yMid = baseY + (topY - baseY) * t;
    const face = -(wallCenterOffset + (wallTopOffset - wallCenterOffset) * t);
    const lz = face - width - 0.16;
    const p = L(at + dir * (a0 + a1) / 2, lz);
    sink.Add(material, PlaceGeometry(
      MakeBox((a1 - a0) * 1.02, guardH, 0.32, TILE_METERS.stone, `${seed}:g${i}`),
      { x: p.x, y: yMid + guardH / 2, z: p.z, ry }));
  }
}

/**
 * 墙脚防空洞：城墙内侧墙根，每 40 m 一个。
 * 「守城部队在城墙脚下的防空洞内隐蔽、休息，待敌冲锋爬城时再迅速登城抵抗」——
 * 存在为主流记载，尺寸推定。做成券洞口 + 一段深色进深，不做可进入空间。
 */
export function AddDugout(sink, {
  x, z, ry = 0, seed = "dugout", width = 1.2, height = 1.6, depth = 3.0,
  baseY = 0, frame = "Ashlar",
}) {
  const cos = Math.cos(ry), sin = Math.sin(ry);
  const L = (lx, lz) => ({ x: x + cos * lx + sin * lz, z: z - sin * lx + cos * lz });
  // 洞口两侧的石砌门框 + 过梁：三条亮线把黑洞框出来（同 AddDoorReveal 的道理）
  for (const s of [-1, 1]) {
    const p = L(s * (width / 2 + 0.16), 0);
    sink.Add(frame, PlaceGeometry(
      MakeBox(0.3, height, 0.5, TILE_METERS.stone, `${seed}:j${s}`),
      { x: p.x, y: baseY + height / 2, z: p.z, ry }));
  }
  const head = L(0, 0);
  sink.Add(frame, PlaceGeometry(
    MakeBox(width + 0.62, 0.3, 0.5, TILE_METERS.stone, `${seed}:h`),
    { x: head.x, y: baseY + height + 0.15, z: head.z, ry }));
  // 洞里：一块深色的挡板，读作「里面是暗的」而不是「这里没有东西」
  const back = L(0, -depth * 0.5);
  sink.Add("CityBrickWorn", PlaceGeometry(
    MakeBox(width, height, 0.4, TILE_METERS.brick, `${seed}:back`),
    { x: back.x, y: baseY + height / 2, z: back.z, ry }));
  // 洞口外堆的土
  const spoil = L(0, depth * 0.42);
  sink.Add("RammedEarth", PlaceGeometry(
    MakeBox(width + 1.4, 0.42, 1.1, TILE_METERS.adobe, `${seed}:spoil`),
    { x: spoil.x, y: baseY + 0.2, z: spoil.z, ry }));
  sink.Cover(spoil.x, spoil.z, 0.6, sin, cos);
}

/**
 * 枪眼 —— **滕县巷战的第一视觉符号**。
 *
 * 日方战详报反复点名：「敌一步一步利用房屋的枪眼，对道路纵射或侧射」。
 * 家家在临街墙上新掏铳眼，**新掏的孔边缘发白**（砖被凿开露出的断口比风化面亮两档）。
 * 所以这里的做法是：一圈发白的边 + 中间一个深色的洞。少了发白那一圈，
 * 它读作「墙上有个脏印子」；少了深色的洞，它读作「墙上贴了块白瓷砖」。
 *
 * @param {object} spec x,z 墙面中心；ry 墙的朝向（局部 +z 指向街）；ys 一组高度
 */
export function AddLoopholes(sink, {
  x, z, ry = 0, ys = [1.15], count = 2, spread = 2.4, seed = "lp",
  size = 0.24, wallFace = 0.18, rim = "LoopholeRim",
}) {
  const cos = Math.cos(ry), sin = Math.sin(ry);
  const L = (lx, lz) => ({ x: x + cos * lx + sin * lz, z: z - sin * lx + cos * lz });
  const rnd = Mulberry32(HashString(seed));
  for (let i = 0; i < count; i += 1) {
    const lx = count === 1 ? 0 : -spread / 2 + (spread * i) / (count - 1) + (rnd() - 0.5) * 0.4;
    const y = ys[i % ys.length] + (rnd() - 0.5) * 0.16;
    const p = L(lx, wallFace + 0.01);
    // 白茬的边：一圈略大的浅色薄片，压在墙面外一点。
    // 1.85 倍太宽，出图上读成「墙上贴了块白瓷砖／开关面板」；1.45 倍才是凿出来的茬口。
    sink.Add(rim, PlaceGeometry(
      MakeBox(size * 1.45, size * 1.45, 0.05, TILE_METERS.stone, `${seed}:r${i}`),
      { x: p.x, y, z: p.z, ry }));
    // 洞：压在白边**前**0.01 m 的深色方孔。旧写法把洞缩进 wallFace-0.12，
    // 结果凡是半厚 ≥0.08 的墙（即全城所有墙）洞都整个埋进墙体，
    // 枪眼实拍只剩一块白斑（WP-A1 取证）。深色要可见就必须在白边之前。
    const q = L(lx, wallFace + 0.02);
    sink.Add("Charred", PlaceGeometry(
      MakeBox(size, size, 0.05, TILE_METERS.stone, `${seed}:h${i}`),
      { x: q.x, y, z: q.z, ry }));
  }
}

/**
 * 一块放射形券砖。旧城门用几层横盒阶梯逼近半圆，近看会露出明显锯齿；这里把
 * 每一块券石做成真正的环形楔块并沿门道进深挤出，正面、背面与券洞内壁都连续。
 */
function MakeGateVoussoir(innerR, outerR, a0, a1, depth, tile, seed) {
  const positions = [];
  const uvs = [];
  const seedOffset = (HashString(seed) % 977) / 977 * 2.5;
  const point = (radius, angle, z) => [Math.cos(angle) * radius, Math.sin(angle) * radius, z];
  const pushVertex = (p, sideUv = false) => {
    positions.push(p[0], p[1], p[2]);
    uvs.push(
      (sideUv ? p[2] : p[0]) / tile + seedOffset,
      p[1] / tile + seedOffset * 0.37,
    );
  };
  const pushQuad = (a, b, c, d, sideUv = false) => {
    for (const p of [a, b, c, a, c, d]) pushVertex(p, sideUv);
  };
  const z0 = -depth / 2, z1 = depth / 2;
  const i0 = point(innerR, a0, z1), i1 = point(innerR, a1, z1);
  const o0 = point(outerR, a0, z1), o1 = point(outerR, a1, z1);
  const bi0 = point(innerR, a0, z0), bi1 = point(innerR, a1, z0);
  const bo0 = point(outerR, a0, z0), bo1 = point(outerR, a1, z0);
  pushQuad(o0, o1, i1, i0);                    // 外立面
  pushQuad(bo1, bo0, bi0, bi1);                // 内立面
  pushQuad(i0, i1, bi1, bi0, true);            // 券洞内壁
  pushQuad(o1, o0, bo0, bo1, true);            // 外缘
  pushQuad(o0, i0, bi0, bo0, true);            // 两条灰缝侧面
  pushQuad(i1, o1, bo1, bi1, true);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  geometry.userData.gateVoussoir = { innerR, outerR, a0, a1, depth };
  return geometry;
}

/**
 * 城门 —— 内外二门 + **半圆形瓮城** + 重檐亭阁式城楼。
 *
 * 志载：「城门皆有内外两门，外门呈半圆形称关门，两门之间俗称瓮城，
 * 内门上有方砖铺平台、以石围栏之城楼，叠脊筒瓦，重檐翘厦，雕梁画栋，俨若亭阁。」
 * **半圆瓮城是滕县的特征点，不做方瓮城。**
 *
 * 1938 年的门禁状态由 blocked 决定：
 *   "full"    土袋堵死（南门迎薰门、北门望阙门）
 *   "partial" 土袋半堵（东门宗鲁门）
 *   "slit"    只剩一人宽（西门怀古门 —— 唯一的活口，也是落城时的死亡瓶颈）
 *
 * 局部坐标：+z 指向城外，+x 沿墙。
 */
export function AddGateComplex(sink, spec) {
  const {
    x, z, ry = 0, baseY = 0, seed = "gate",
    blockWidth = 22, wallHeight = CITY_WALL.height, parapet = CITY_WALL.parapet,
    topWidth = CITY_WALL.topWidth, baseWidth = CITY_WALL.baseWidth, plinth = CITY_WALL.plinth,
    innerW = 3.8, innerH = 5.6, outerW = 3.4, outerH = 5.0,
    barbicanRadius = 18, barbicanH = 9.0, barbicanT = 4.0,
    blocked = "none", slitWidth = 0.9, sidework = null, tower = true,
    plaqueInner = "", plaqueOuter = "",
  } = spec;
  const cos = Math.cos(ry), sin = Math.sin(ry);
  const L = (lx, lz) => ({ x: x + cos * lx + sin * lz, z: z - sin * lx + cos * lz });
  const top = baseY + wallHeight;
  const widthAt = (y) => baseWidth + (topWidth - baseWidth) * ((y - baseY) / wallHeight);
  const AddArchRing = ({ width, springY, depth, lz = 0, tag, segments = 17 }) => {
    const innerR = width / 2;
    const outerR = innerR + 0.48;
    const mortarGap = 0.014;
    const center = L(0, lz);
    for (let i = 0; i < segments; i += 1) {
      const a0 = (Math.PI * i) / segments + mortarGap;
      const a1 = (Math.PI * (i + 1)) / segments - mortarGap;
      sink.Add("GateBrickWorn", PlaceGeometry(
        MakeGateVoussoir(innerR, outerR, a0, a1, depth, TILE_METERS.brick,
          `${seed}:${tag}:${i}`),
        { x: center.x, y: springY, z: center.z, ry }));
    }
    return outerR;
  };

  // --- 门洞两侧的墙墩（就是城墙本身，只是在这一段里绕开门洞）---
  const pierW = (blockWidth - innerW) / 2;
  for (const s of [-1, 1]) {
    const lx = s * (innerW / 2 + pierW / 2);
    AddCityWall(sink, {
      ...L(lx, 0), ry, length: pierW, baseY, seed: `${seed}:pier${s}`,
      height: wallHeight, parapet, topWidth, baseWidth, plinth, sliceLen: 4.5,
      merlons: true, innerParapet: true, brick: "GateBrick",
    });
  }
  // --- 门洞上方的墙体 ---
  const innerArchOuterR = innerW / 2 + 0.48;
  const archTop = baseY + innerH + innerArchOuterR;
  const above = L(0, 0);
  sink.Add("GateBrick", PlaceGeometry(
    MakeBox(innerW + 0.1, top - archTop, widthAt((archTop + top) / 2), TILE_METERS.brick,
      `${seed}:above`, BRICK_UV_GRID),
    { x: above.x, y: (archTop + top) / 2, z: above.z, ry }));
  AddArchRing({ width: innerW, springY: baseY + innerH, depth: baseWidth + 0.12, tag: "innerArch" });
  // 门道墁地
  const pave = L(0, 0);
  sink.Add("Ashlar", PlaceGeometry(
    MakeBox(innerW + 0.3, 0.16, baseWidth + 1.0, TILE_METERS.stone, `${seed}:pave`),
    { x: pave.x, y: baseY + 0.06, z: pave.z, ry }));
  // 内外两块石刻门额（内门额与外门额字不同，是很强的符号）
  for (const [s, text] of [[-1, plaqueInner], [1, plaqueOuter]]) {
    if (!text) continue;
    const p = L(0, s * (baseWidth / 2 - 0.2));
    sink.Add("Ashlar", PlaceGeometry(
      MakeBox(2.3, 0.72, 0.16, TILE_METERS.stone, `${seed}:plq${s}`),
      { x: p.x, y: baseY + innerH + 0.75, z: p.z, ry }));
  }
  // 包铁大门：两扇。堵死的门后面看不见；只剩一人宽的西门也不挂 ——
  // 门板转出来正好横在那条唯一的通视轴线上（z=0 走廊）。
  if (blocked === "none" || blocked === "partial") {
    for (const s of [-1, 1]) {
      const p = L(s * innerW / 4, -baseWidth / 2 + 0.35);
      const leafRy = ry + s * 0.5;
      sink.Add("GatePaintRed", PlaceGeometry(
        MakeBox(innerW / 2 - 0.06, innerH - 0.1, 0.14, TILE_METERS.wood, `${seed}:leaf${s}`),
        { x: p.x, y: baseY + (innerH - 0.1) / 2, z: p.z, ry: leafRy }));
      // 三道横向熟铁门箍与铸钉。细节跟门扇一起转，开门时不会悬在原来的平面上。
      const leafCos = Math.cos(leafRy), leafSin = Math.sin(leafRy);
      const leafPoint = (lx, y) => ({
        x: p.x + leafCos * lx + leafSin * 0.09,
        y,
        z: p.z - leafSin * lx + leafCos * 0.09,
      });
      for (let band = 0; band < 3; band += 1) {
        const q = leafPoint(0, baseY + 0.95 + band * 1.55);
        sink.Add("IronPlate", PlaceGeometry(
          MakeBox(innerW / 2 - 0.16, 0.13, 0.055, TILE_METERS.wood,
            `${seed}:leafBand${s}${band}`),
          { x: q.x, y: q.y, z: q.z, ry: leafRy }));
      }
      for (let row = 0; row < 4; row += 1) {
        for (let col = 0; col < 4; col += 1) {
          const lx = -(innerW / 4 - 0.18) + (innerW / 2 - 0.36) * col / 3;
          const q = leafPoint(lx, baseY + 0.62 + row * 1.24);
          sink.Add("IronPlate", PlaceGeometry(
            new THREE.CylinderGeometry(0.045, 0.052, 0.055, 8),
            { x: q.x, y: q.y, z: q.z, rx: Math.PI / 2, ry: leafRy }));
        }
      }
    }
  }

  // --- 土袋堵门 ---
  if (blocked !== "none") {
    AddSandbagPlug(sink, {
      x, z, ry, baseY, seed: `${seed}:plug`,
      openW: innerW, openH: innerH, depth: baseWidth,
      mode: blocked, slitWidth,
    });
    if (blocked === "full") {
      // 南、北两门封死后在袋墙背面再加两根交叉木撑；从门洞缝隙能读出这是临战
      // 封堵，不是程序生成的一堵规则沙包墙。
      for (const s of [-1, 1]) {
        sink.Add("WoodBeam", PlaceGeometry(
          MakeBeamBetween(
            [-innerW * 0.43, 0.72, -baseWidth * 0.18],
            [innerW * 0.43, innerH - 0.62, -baseWidth * 0.18],
            0.18, TILE_METERS.wood, `${seed}:brace${s}`),
          { x, y: baseY, z, ry: ry + (s < 0 ? Math.PI : 0) }));
      }
    }
  }

  // --- 半圆瓮城 ---
  // 半圆的圆心落在城墙外脚的门轴上，半径 18 m，墙厚 4 m。
  const rMid = barbicanRadius - barbicanT / 2;
  const foot = baseWidth / 2;
  const segs = 26;
  const halfGateAngle = Math.asin(Math.min(0.9, (outerW / 2 + 0.9) / rMid));
  for (let i = 0; i < segs; i += 1) {
    const a0 = -Math.PI / 2 + (Math.PI * i) / segs;
    const a1 = -Math.PI / 2 + (Math.PI * (i + 1)) / segs;
    const am = (a0 + a1) / 2;
    if (Math.abs(am) < halfGateAngle) continue;      // 外门洞的位置留空
    const chord = rMid * (a1 - a0) * 1.06;
    const lx = Math.sin(am) * rMid;
    const lz = foot + Math.cos(am) * rMid;
    const p = L(lx, lz);
    // 瓮城墙也分层：条石勒脚 + 青砖
    sink.Add("Ashlar", PlaceGeometry(
      MakeBox(chord, plinth, barbicanT + 0.2, TILE_METERS.stone, `${seed}:bp${i}`),
      { x: p.x, y: baseY + plinth / 2, z: p.z, ry: ry + am }));
    sink.Add("GateBrick", PlaceGeometry(
      MakeBox(chord, barbicanH - plinth, barbicanT, TILE_METERS.brick, `${seed}:bb${i}`, BRICK_UV_GRID),
      { x: p.x, y: baseY + plinth + (barbicanH - plinth) / 2, z: p.z, ry: ry + am }));
    // 垛口
    if (i % 2 === 0) {
      sink.Add("GateBrick", PlaceGeometry(
        MakeBox(chord * 0.62, parapet, 0.5, TILE_METERS.brick, `${seed}:bm${i}`, BRICK_UV_GRID),
        {
          x: p.x + Math.sin(ry + am) * (barbicanT / 2 - 0.25),
          y: baseY + barbicanH + parapet / 2,
          z: p.z + Math.cos(ry + am) * (barbicanT / 2 - 0.25), ry: ry + am,
        }));
      sink.Cover(p.x, p.z, baseY + barbicanH + parapet, Math.sin(ry + am), Math.cos(ry + am));
    }
    sink.Solid(p.x, baseY + barbicanH / 2, p.z,
      chord / 2, barbicanH / 2 + 1, barbicanT / 2, "cityWall", ry + am);
  }
  // 外门（关门）：券洞
  {
    const lz = foot + rMid;
    const p = L(0, lz);
    const oPierW = 2 * (rMid * Math.sin(halfGateAngle)) - outerW / 2;
    for (const s of [-1, 1]) {
      const q = L(s * (outerW / 2 + oPierW / 2), lz);
      sink.Add("GateBrick", PlaceGeometry(
        MakeBox(oPierW, barbicanH, barbicanT, TILE_METERS.brick, `${seed}:op${s}`, BRICK_UV_GRID),
        { x: q.x, y: baseY + barbicanH / 2, z: q.z, ry }));
      sink.Solid(q.x, baseY + barbicanH / 2, q.z, oPierW / 2, barbicanH / 2, barbicanT / 2, "cityWall", ry);
    }
    const outerArchOuterR = outerW / 2 + 0.48;
    const oArch = baseY + outerH + outerArchOuterR;
    sink.Add("GateBrick", PlaceGeometry(
      MakeBox(outerW + 0.1, barbicanH - (oArch - baseY), barbicanT, TILE_METERS.brick,
        `${seed}:oa`, BRICK_UV_GRID),
      { x: p.x, y: (oArch + baseY + barbicanH) / 2, z: p.z, ry }));
    AddArchRing({
      width: outerW, springY: baseY + outerH, depth: barbicanT + 0.12,
      lz, tag: "outerArch", segments: 15,
    });
    if (plaqueOuter) {
      const q = L(0, lz + barbicanT / 2 - 0.1);
      sink.Add("Ashlar", PlaceGeometry(
        MakeBox(2.0, 0.66, 0.14, TILE_METERS.stone, `${seed}:oplq`),
        { x: q.x, y: baseY + outerH + 0.7, z: q.z, ry }));
    }
  }

  // 瓮城门道里两道浅车辙与门脚碎砖：读出几十年车马磨损和战时匆忙封门。
  // 所有碎砖都退到门轴两侧 2.5 m 以外，西门历史机枪通视轴保持净空。
  const yardCenterZ = foot + rMid * 0.52;
  for (const lx of [-0.78, 0.78]) {
    const p = L(lx, yardCenterZ);
    sink.Add("RoadWear", PlaceGeometry(
      MakeBox(0.28, 0.025, rMid * 1.18, TILE_METERS.ground, `${seed}:rut${lx}`),
      { x: p.x, y: baseY + 0.095, z: p.z, ry }));
  }
  const debrisRnd = Mulberry32(HashString(`${seed}:gateDebris`));
  for (let i = 0; i < 14; i += 1) {
    const side = i % 2 ? -1 : 1;
    const lx = side * (2.5 + debrisRnd() * 3.4);
    const lz = foot + 1.5 + debrisRnd() * (rMid * 1.25);
    const p = L(lx, lz);
    sink.Add(i % 4 === 0 ? "Ashlar" : "GateBrickWorn", PlaceGeometry(
      MakeBox(0.18 + debrisRnd() * 0.25, 0.10 + debrisRnd() * 0.18,
        0.22 + debrisRnd() * 0.34, TILE_METERS.brick, `${seed}:debris${i}`),
      { x: p.x, y: baseY + 0.08 + debrisRnd() * 0.09, z: p.z,
        ry: ry + (debrisRnd() - 0.5) * 1.4,
        rx: (debrisRnd() - 0.5) * 0.22, rz: (debrisRnd() - 0.5) * 0.18 }));
  }

  // --- 城楼（重檐亭阁式，坐在内门之上）---
  if (tower) {
    AddGateTower(sink, { x, z, ry, baseY: top, seed: `${seed}:tower` });
  }

  // --- 东门侧防机关：凸出的、带射孔的高台 ---
  // 日方原文「最モ堅固ナル東門側防機関ノ直下ニアリテ瞰制セラレ」——
  // 位置高、能俯瞰城外突破口、还在手榴弹投掷距离内。这是东门打不进去的直接原因。
  if (sidework) {
    const lx = sidework.offset;
    const p = L(lx, foot + sidework.out / 2);
    const h = sidework.height;
    sink.Add("Ashlar", PlaceGeometry(
      MakeBox(sidework.width, plinth, sidework.out + 2.0, TILE_METERS.stone, `${seed}:sw0`),
      { x: p.x, y: baseY + plinth / 2, z: p.z, ry }));
    sink.Add("GateBrick", PlaceGeometry(
      MakeBox(sidework.width, h - plinth, sidework.out + 2.0, TILE_METERS.brick, `${seed}:sw1`, BRICK_UV_GRID),
      { x: p.x, y: baseY + plinth + (h - plinth) / 2, z: p.z, ry }));
    sink.Solid(p.x, baseY + h / 2, p.z, sidework.width / 2, h / 2, (sidework.out + 2) / 2, "cityWall", ry);
    // 射孔：三层，朝城外与朝瓮城各一组
    for (let k = 0; k < 3; k += 1) {
      const y = baseY + 3.2 + k * 2.6;
      AddLoopholes(sink, {
        x: p.x, z: p.z, ry, ys: [y], count: 3, spread: sidework.width * 0.62,
        seed: `${seed}:swlp${k}`, wallFace: (sidework.out + 2.0) / 2 + 0.03, size: 0.3,
      });
    }
    // 台顶垛口
    for (let i = 0; i < 5; i += 2) {
      const q = L(lx - sidework.width / 2 + (i + 0.5) * (sidework.width / 5), foot + sidework.out);
      sink.Add("GateBrick", PlaceGeometry(
        MakeBox(1.0, parapet, 0.5, TILE_METERS.brick, `${seed}:swm${i}`, BRICK_UV_GRID),
        { x: q.x, y: baseY + h + parapet / 2, z: q.z, ry }));
      sink.Cover(q.x, q.z, baseY + h + parapet, sin, cos);
    }
  }
}

/**
 * 土袋堵门。史料：东、北、南三门以土袋封堵（另一说封南北两门），
 * 西门被土袋挤成「只留一人能通过的通路」—— 落城时士兵争相涌向脱出口，
 * 「外门与内门之间完全是人的漩涡」（日军第九中队安田少尉手记）。
 *
 * mode: full 堵死 / partial 堵到一半 / slit 只剩一人宽（缺口居中，让门轴线仍然通视）
 */
export function AddSandbagPlug(sink, {
  x, z, ry = 0, baseY = 0, seed = "plug", openW = 3.8, openH = 5.6, depth = 10,
  mode = "full", slitWidth = 0.9,
}) {
  const cos = Math.cos(ry), sin = Math.sin(ry);
  const L = (lx, lz) => ({ x: x + cos * lx + sin * lz, z: z - sin * lx + cos * lz });
  const rnd = Mulberry32(HashString(seed));
  const fillH = mode === "full" ? openH : (mode === "partial" ? openH * 0.62 : openH * 0.9);
  const rows = Math.max(3, Math.round(fillH / 0.26));
  const matrices = [];
  const dummy = new THREE.Object3D();
  for (let r = 0; r < rows; r += 1) {
    const y = baseY + 0.13 + r * 0.26;
    const n = Math.max(3, Math.round(openW / 0.62));
    for (let i = 0; i < n; i += 1) {
      const lx = -openW / 2 + (i + 0.5) * (openW / n);
      // slit：中间留一条一人宽的缝 —— 这条缝就是 1938 年 3 月 17 日夜里全城唯一的出口
      if (mode === "slit" && Math.abs(lx) < slitWidth / 2) continue;
      for (const lz of [-depth * 0.3, 0, depth * 0.3]) {
        dummy.position.set(...(() => { const p = L(lx + (rnd() - 0.5) * 0.1, lz); return [p.x, y, p.z]; })());
        dummy.rotation.set((rnd() - 0.5) * 0.12, ry + (rnd() - 0.5) * 0.3, (rnd() - 0.5) * 0.12);
        dummy.scale.set(1, 0.95 + rnd() * 0.14, 1);
        dummy.updateMatrix();
        matrices.push(dummy.matrix.clone());
      }
    }
  }
  sink.props.push({ kind: "sandbags", matrices });
  // 碰撞：堵死的整片挡住，留缝的分两块挡住缝的两侧
  if (mode === "slit") {
    for (const s of [-1, 1]) {
      const segW = (openW - slitWidth) / 2;
      const p = L(s * (slitWidth / 2 + segW / 2), 0);
      sink.Solid(p.x, baseY + fillH / 2, p.z, segW / 2, fillH / 2, depth / 2, "sandbagPlug", ry);
    }
  } else {
    sink.Solid(x, baseY + fillH / 2, z, openW / 2, fillH / 2, depth / 2, "sandbagPlug", ry);
  }
  sink.Cover(x, z, fillH, sin, cos);
}

/**
 * 低矮的野战掩体：前沿一排沙袋 + 两侧短翼，后方敞开供补位和撤退。
 *
 * 它和 AddSandbagPlug 的用途不同：堵门是连续实体，这里是东关白盒里的
 * 投弹位、机枪位和预备队院落掩体。仍然复用同一套实例化沙袋，避免为几
 * 个固定战位引入新的材质或 draw call。
 */
export function AddSandbagEmplacement(sink, {
  x, z, ry = 0, baseY = 0, seed = "emplacement",
  length = 7.0, depth = 2.6, height = 0.72,
}) {
  const cos = Math.cos(ry), sin = Math.sin(ry);
  const L = (lx, lz) => ({ x: x + cos * lx + sin * lz, z: z - sin * lx + cos * lz });
  const bagW = 0.62, bagH = 0.24, bagD = 0.34;
  const rows = Math.max(1, Math.ceil(height / bagH));
  const segments = [
    { axis: "x", lx: 0, lz: depth / 2, len: length },
    { axis: "z", lx: -length / 2 + bagD / 2, lz: 0, len: depth },
    { axis: "z", lx: length / 2 - bagD / 2, lz: 0, len: depth },
  ];
  const matrices = [];
  const dummy = new THREE.Object3D();
  const rnd = Mulberry32(HashString(seed));
  for (let row = 0; row < rows; row += 1) {
    const rowOffset = row % 2 ? bagW * 0.5 : 0;
    for (const segment of segments) {
      const count = Math.max(1, Math.ceil(segment.len / bagW));
      for (let i = 0; i < count; i += 1) {
        const along = -segment.len / 2 + (i + 0.5) * segment.len / count + rowOffset;
        const p = L(segment.lx + (segment.axis === "x" ? along : 0),
          segment.lz + (segment.axis === "z" ? along : 0));
        const axisRy = segment.axis === "x" ? ry : ry + Math.PI / 2;
        dummy.position.set(p.x, baseY + bagH * (row + 0.5), p.z);
        dummy.rotation.set((rnd() - 0.5) * 0.10, axisRy + (rnd() - 0.5) * 0.18, (rnd() - 0.5) * 0.10);
        dummy.scale.set(1, 0.94 + rnd() * 0.12, 1);
        dummy.updateMatrix();
        matrices.push(dummy.matrix.clone());
      }
    }
  }
  sink.props.push({ kind: "sandbags", matrices });
  const solidH = rows * bagH;
  for (const segment of segments) {
    const p = L(segment.lx, segment.lz);
    const alongHalf = segment.len / 2;
    const axisAlignedRy = segment.axis === "x" ? ry : ry + Math.PI / 2;
    sink.Solid(p.x, baseY + solidH / 2, p.z, alongHalf, solidH / 2, bagD / 2,
      "sandbagEmplacement", axisAlignedRy);
    sink.Cover(p.x, p.z, baseY + solidH, Math.sin(axisAlignedRy), Math.cos(axisAlignedRy));
  }
}

/**
 * 城楼歇山顶的一整张薄壳。
 *
 * 旧实现拿四块倾斜 BoxGeometry 交叉成屋顶。四块板既没有共同檐口，也没有共同脊线，
 * 从城外的菜单长焦机位看过去就变成两只黑色「蝴蝶结」。这里把前后坡、两片撒头和
 * 屋面底皮做成一张闭合网格：所有坡面共用同一条正脊与四条戗脊，轮廓不会再互相穿插。
 * 角部单独抬高一点，保留「翘厦」的剪影，但不夸张成影视城飞檐。
 */
function MakeGateRoofShell(width, depth, {
  eaveOut = 1.6, rise = 1.55, cornerLift = 0.26, thickness = 0.14,
  tile = TILE_METERS.roof, seed = "gateRoof",
} = {}) {
  const halfW = width / 2 + eaveOut;
  const halfD = depth / 2 + eaveOut;
  const ridgeHalf = Math.max(width * 0.24, halfW - halfD * 0.78);
  const positions = [];
  const uvs = [];
  const seedOffset = (HashString(seed) % 997) / 997 * 3;
  const P = (x, y, z) => [x, y, z];
  const EaveY = (x) => {
    const t = Math.max(0, (Math.abs(x) - ridgeHalf) / Math.max(0.01, halfW - ridgeHalf));
    return cornerLift * t * t;
  };
  const PushTriangle = (a, b, c) => {
    for (const p of [a, b, c]) {
      positions.push(p[0], p[1], p[2]);
      uvs.push(p[0] / tile + seedOffset, (p[2] + p[1] * 0.65) / tile + seedOffset * 0.5);
    }
  };
  const PushFace = (points) => {
    for (let i = 1; i < points.length - 1; i += 1) PushTriangle(points[0], points[i], points[i + 1]);
  };

  const frontFaces = [
    [P(-halfW, EaveY(-halfW), halfD), P(-ridgeHalf, 0, halfD), P(-ridgeHalf, rise, 0)],
    [P(-ridgeHalf, 0, halfD), P(0, 0, halfD), P(0, rise, 0), P(-ridgeHalf, rise, 0)],
    [P(0, 0, halfD), P(ridgeHalf, 0, halfD), P(ridgeHalf, rise, 0), P(0, rise, 0)],
    [P(ridgeHalf, 0, halfD), P(halfW, EaveY(halfW), halfD), P(ridgeHalf, rise, 0)],
  ];
  const topFaces = [
    ...frontFaces,
    ...frontFaces.map((face) => face.map((p) => P(p[0], p[1], -p[2])).reverse()),
    [P(halfW, EaveY(halfW), halfD), P(halfW, EaveY(halfW), -halfD), P(ridgeHalf, rise, 0)],
    [P(-halfW, EaveY(-halfW), -halfD), P(-halfW, EaveY(-halfW), halfD), P(-ridgeHalf, rise, 0)],
  ];
  for (const face of topFaces) PushFace(face);

  // 屋面底皮：从墙顶和月台仰看也必须是一整片屋面，不能因为单面材质突然消失。
  for (const face of topFaces) {
    PushFace(face.map((p) => P(p[0], p[1] - thickness, p[2])).reverse());
  }

  // 檐口封边。前后檐分四段，角部抬升后仍保持连续，不再出现悬空板角。
  const cuts = [-halfW, -ridgeHalf, 0, ridgeHalf, halfW];
  for (let i = 0; i < cuts.length - 1; i += 1) {
    const a = cuts[i], b = cuts[i + 1];
    PushFace([
      P(a, EaveY(a), halfD), P(a, EaveY(a) - thickness, halfD),
      P(b, EaveY(b) - thickness, halfD), P(b, EaveY(b), halfD),
    ]);
    PushFace([
      P(b, EaveY(b), -halfD), P(b, EaveY(b) - thickness, -halfD),
      P(a, EaveY(a) - thickness, -halfD), P(a, EaveY(a), -halfD),
    ]);
  }
  PushFace([
    P(halfW, EaveY(halfW), -halfD), P(halfW, EaveY(halfW) - thickness, -halfD),
    P(halfW, EaveY(halfW) - thickness, halfD), P(halfW, EaveY(halfW), halfD),
  ]);
  PushFace([
    P(-halfW, EaveY(-halfW), halfD), P(-halfW, EaveY(-halfW) - thickness, halfD),
    P(-halfW, EaveY(-halfW) - thickness, -halfD), P(-halfW, EaveY(-halfW), -halfD),
  ]);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  geometry.userData.gateRoof = { halfW, halfD, ridgeHalf, rise, cornerLift };
  return geometry;
}

/** 在两点之间架一根方截面构件；用于戗脊、瓦垄与连续檐枋。 */
function MakeBeamBetween(a, b, thickness, tile, seed) {
  const start = new THREE.Vector3(...a);
  const end = new THREE.Vector3(...b);
  const delta = end.clone().sub(start);
  const length = Math.max(0.01, delta.length());
  const geometry = MakeBox(length, thickness, thickness, tile, seed);
  const rotation = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(1, 0, 0), delta.normalize());
  const matrix = new THREE.Matrix4().compose(
    start.add(end).multiplyScalar(0.5), rotation, new THREE.Vector3(1, 1, 1));
  geometry.applyMatrix4(matrix);
  return geometry;
}

/**
 * 城楼：内门之上的重檐亭阁。
 *
 * 志载「内门上有方砖铺平台、以石围栏之城楼，叠脊筒瓦，重檐翘厦，雕梁画栋，俨若亭阁」。
 * 关键词是「俨若亭阁」—— 体量不大，是亭子不是箭楼；下面必须先有一层**露明的方砖月台
 * 加石栏**，城楼坐在月台上。彩画在 1938 年应严重褪色、蒙尘、局部剥落，
 * 所以红绿两色都往灰里压（PALETTE.paintRed 用的是褪色值 #9A6A55 不是新漆的 #8C3A2E）。
 */
export function AddGateTower(sink, {
  x, z, ry = 0, baseY = 0, seed = "gateTower",
  terraceW = 17, terraceD = 11, terraceH = 0.45,
  bodyW = 11.4, bodyD = 7.2, columnH = 4.4, upperH = 3.0, eaveOut = 1.6,
}) {
  const cos = Math.cos(ry), sin = Math.sin(ry);
  const L = (lx, lz) => ({ x: x + cos * lx + sin * lz, z: z - sin * lx + cos * lz });

  // --- 方砖月台 ---
  sink.Add("Ashlar", PlaceGeometry(
    MakeBox(terraceW, terraceH, terraceD, TILE_METERS.stone, `${seed}:terrace`),
    { x, y: baseY + terraceH / 2, z, ry }));
  sink.Solid(x, baseY + terraceH / 2 - 0.6, z, terraceW / 2, terraceH / 2 + 0.6, terraceD / 2, "tower", ry);
  const deck = baseY + terraceH;

  // --- 石围栏：望柱 + 通透寻杖栏杆 ---
  const railH = 0.95;
  const posts = 9;
  // walkGap：墙顶走道从月台上穿过去的那一段（净宽 5 m 的墙顶 + 一点余量）。
  // 与墙垂直的那两道栏杆必须在这里断开 —— 城墙顶是一条只有四个出入口的
  // 高空回廊，栏杆横在走道上等于把这条回廊掐成四段。
  const walkGap = CITY_WALL.topWidth / 2 + 0.4;
  for (let side = 0; side < 4; side += 1) {
    const alongX = side < 2;
    const len = alongX ? terraceW : terraceD;
    const off = (alongX ? terraceD : terraceW) / 2 - 0.14;
    const s = side % 2 === 0 ? -1 : 1;
    for (let i = 0; i <= posts; i += 1) {
      const t = -len / 2 + (len * i) / posts;
      if (!alongX && Math.abs(t) < walkGap) continue;
      const p = alongX ? L(t, s * off) : L(s * off, t);
      sink.Add("Ashlar", PlaceGeometry(
        MakeBox(0.22, railH, 0.22, TILE_METERS.stone, `${seed}:post${side}${i}`),
        { x: p.x, y: deck + railH / 2, z: p.z, ry }));
      sink.Add("Ashlar", PlaceGeometry(
        MakeBox(0.34, 0.12, 0.34, TILE_METERS.stone, `${seed}:postCap${side}${i}`),
        { x: p.x, y: deck + railH + 0.02, z: p.z, ry }));
    }
    if (alongX) {
      const p = L(0, s * off);
      sink.Add("Ashlar", PlaceGeometry(
        MakeBox(len, 0.14, 0.14, TILE_METERS.stone, `${seed}:railBase${side}`),
        { x: p.x, y: deck + 0.18, z: p.z, ry }));
      sink.Add("Ashlar", PlaceGeometry(
        MakeBox(len, 0.15, 0.24, TILE_METERS.stone, `${seed}:railCap${side}`),
        { x: p.x, y: deck + railH - 0.08, z: p.z, ry }));
      const balusters = Math.max(4, Math.round(len / 0.72));
      for (let i = 0; i <= balusters; i += 1) {
        const t = -len / 2 + len * i / balusters;
        const q = L(t, s * off);
        sink.Add("Ashlar", PlaceGeometry(
          new THREE.CylinderGeometry(0.055, 0.075, railH - 0.30, 7),
          { x: q.x, y: deck + 0.18 + (railH - 0.30) / 2, z: q.z, ry }));
      }
    } else {
      for (const half of [-1, 1]) {
        const segLen = len / 2 - walkGap;
        if (segLen < 0.4) continue;
        const p = L(s * off, half * (walkGap + segLen / 2));
        sink.Add("Ashlar", PlaceGeometry(
          MakeBox(0.14, 0.14, segLen, TILE_METERS.stone, `${seed}:railBase${side}${half}`),
          { x: p.x, y: deck + 0.18, z: p.z, ry }));
        sink.Add("Ashlar", PlaceGeometry(
          MakeBox(0.24, 0.15, segLen, TILE_METERS.stone, `${seed}:railCap${side}${half}`),
          { x: p.x, y: deck + railH - 0.08, z: p.z, ry }));
        const balusters = Math.max(2, Math.round(segLen / 0.72));
        for (let i = 0; i <= balusters; i += 1) {
          const localZ = half * (walkGap + segLen * i / balusters);
          const q = L(s * off, localZ);
          sink.Add("Ashlar", PlaceGeometry(
            new THREE.CylinderGeometry(0.055, 0.075, railH - 0.30, 7),
            { x: q.x, y: deck + 0.18 + (railH - 0.30) / 2, z: q.z, ry }));
        }
      }
    }
  }

  // 月台四角泄水石槽。伸出围栏的短挑嘴把雨水导离砖墙，也给大块月台盒子一个
  // 可读的排水逻辑；位置避开墙顶通道。
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const p = L(sx * (terraceW / 2 - 0.65), sz * (terraceD / 2 + 0.18));
      sink.Add("Ashlar", PlaceGeometry(
        MakeBox(0.30, 0.16, 0.82, TILE_METERS.stone, `${seed}:scupper${sx}${sz}`),
        { x: p.x, y: deck - 0.04, z: p.z, ry }));
    }
  }

  // --- 楼身：台明 + 十二根柱 + 彩画额枋 ---
  sink.Add("Ashlar", PlaceGeometry(
    MakeBox(bodyW + 1.0, 0.34, bodyD + 1.0, TILE_METERS.stone, `${seed}:base`),
    { x, y: deck + 0.17, z, ry }));
  const floor = deck + 0.34;      // 0.34 m 一级，压在 0.56 m 抬腿线以下，走得上去
  for (let cx = 0; cx < 4; cx += 1) {
    for (let cz = 0; cz < 2; cz += 1) {
      const lx = -bodyW / 2 + (bodyW * cx) / 3;
      const lz = -bodyD / 2 + bodyD * cz;
      const p = L(lx, lz);
      sink.Add("GatePaintRed", PlaceGeometry(
        new THREE.CylinderGeometry(0.18, 0.215, columnH, 12),
        { x: p.x, y: floor + columnH / 2, z: p.z, ry }));
      sink.Add("Ashlar", PlaceGeometry(
        new THREE.CylinderGeometry(0.29, 0.34, 0.22, 12),
        { x: p.x, y: floor + 0.11, z: p.z, ry }));
    }
  }
  // 额枋（彩画那一条）：褪色的青绿 + 一条红
  for (const s of [-1, 1]) {
    const p = L(0, s * bodyD / 2);
    sink.Add("GatePaintGreen", PlaceGeometry(
      MakeBox(bodyW + 0.5, 0.42, 0.3, TILE_METERS.wood, `${seed}:arc${s}`),
      { x: p.x, y: floor + columnH - 0.3, z: p.z, ry }));
    sink.Add("GatePaintRed", PlaceGeometry(
      MakeBox(bodyW + 0.5, 0.18, 0.34, TILE_METERS.wood, `${seed}:arcr${s}`),
      { x: p.x, y: floor + columnH - 0.66, z: p.z, ry }));
    const q = L(s * bodyW / 2, 0);
    sink.Add("GatePaintGreen", PlaceGeometry(
      MakeBox(0.3, 0.42, bodyD + 0.5, TILE_METERS.wood, `${seed}:arcx${s}`),
      { x: q.x, y: floor + columnH - 0.3, z: q.z, ry }));
  }
  // 下层槛墙：只砌半人高，上面是敞的（亭阁，不是碉楼）。
  // 与墙垂直的那两面各留一个门洞：墙顶走道从楼里穿过去。
  for (const s of [-1, 1]) {
    const p = L(0, s * (bodyD / 2 - 0.05));
    sink.Add("GateBrick", PlaceGeometry(
      MakeBox(bodyW, 1.15, 0.28, TILE_METERS.brick, `${seed}:sill${s}`, BRICK_UV_GRID),
      { x: p.x, y: floor + 0.58, z: p.z, ry }));
    sink.Solid(p.x, floor + 0.58, p.z, bodyW / 2, 0.58, 0.2, "tower", ry);
    for (const half of [-1, 1]) {
      const segLen = bodyD / 2 - walkGap;
      if (segLen < 0.4) continue;
      const q = L(s * (bodyW / 2 - 0.05), half * (walkGap + segLen / 2));
      sink.Add("GateBrick", PlaceGeometry(
        MakeBox(0.28, 1.15, segLen, TILE_METERS.brick, `${seed}:sillx${s}${half}`, BRICK_UV_GRID),
        { x: q.x, y: floor + 0.58, z: q.z, ry }));
      sink.Solid(q.x, floor + 0.58, q.z, 0.2, 0.58, segLen / 2, "tower", ry);
    }
  }
  sink.Cover(x, z, floor + 1.15, sin, cos);

  // 格扇与门框：旧楼身只有柱和矮槛墙，近看像施工中的木架。两侧次间补木格扇，
  // 明间保留 2.3 m 净门洞，墙顶回廊仍能从城外侧一路穿到城内侧。
  const AddLatticeScreen = ({ lx, lz, y0, w, h, tag, vertical = 3, horizontal = 2 }) => {
    const frameT = 0.12;
    for (const side of [-1, 1]) {
      const p = L(lx + side * w / 2, lz);
      sink.Add("GatePaintRed", PlaceGeometry(
        MakeBox(frameT, h, 0.14, TILE_METERS.wood, `${seed}:${tag}:jamb${side}`),
        { x: p.x, y: y0 + h / 2, z: p.z, ry }));
    }
    for (const side of [0, 1]) {
      const p = L(lx, lz);
      sink.Add("GatePaintGreen", PlaceGeometry(
        MakeBox(w, frameT, 0.16, TILE_METERS.wood, `${seed}:${tag}:rail${side}`),
        { x: p.x, y: y0 + side * h, z: p.z, ry }));
    }
    for (let i = 1; i <= vertical; i += 1) {
      const p = L(lx - w / 2 + (w * i) / (vertical + 1), lz);
      sink.Add("GatePaintGreen", PlaceGeometry(
        MakeBox(0.065, h - frameT * 2, 0.11, TILE_METERS.wood, `${seed}:${tag}:v${i}`),
        { x: p.x, y: y0 + h / 2, z: p.z, ry }));
    }
    for (let i = 1; i <= horizontal; i += 1) {
      const p = L(lx, lz);
      sink.Add("GatePaintGreen", PlaceGeometry(
        MakeBox(w - frameT * 2, 0.065, 0.11, TILE_METERS.wood, `${seed}:${tag}:h${i}`),
        { x: p.x, y: y0 + (h * i) / (horizontal + 1), z: p.z, ry }));
    }
  };
  const lowerScreenY = floor + 1.18;
  const lowerScreenH = columnH - 1.82;
  const bayW = bodyW / 3;
  for (const face of [-1, 1]) {
    for (const bay of [-1, 1]) {
      AddLatticeScreen({
        lx: bay * bayW, lz: face * (bodyD / 2 - 0.09), y0: lowerScreenY,
        w: bayW - 0.42, h: lowerScreenH, tag: `lowerScreen${face}${bay}`,
      });
    }
    // 明间门框：门洞本身保持全空，既有纵深，也不偷改唯一四条上城道的通行性。
    for (const jamb of [-1, 1]) {
      const p = L(jamb * 1.17, face * (bodyD / 2 - 0.10));
      sink.Add("GatePaintRed", PlaceGeometry(
        MakeBox(0.16, lowerScreenH, 0.18, TILE_METERS.wood,
          `${seed}:doorJamb${face}${jamb}`),
        { x: p.x, y: lowerScreenY + lowerScreenH / 2, z: p.z, ry }));
    }
    const head = L(0, face * (bodyD / 2 - 0.10));
    sink.Add("GatePaintGreen", PlaceGeometry(
      MakeBox(2.5, 0.20, 0.20, TILE_METERS.wood, `${seed}:doorHead${face}`),
      { x: head.x, y: lowerScreenY + lowerScreenH - 0.10, z: head.z, ry }));
  }

  // 斗拱和雀替：远景里它们是檐下连续的一条彩色阴影，也是「亭阁」而不是脚手架的关键。
  const AddBracketSets = (y, w, d, tag, xCount = 4) => {
    for (const side of [-1, 1]) {
      for (let i = 0; i < xCount; i += 1) {
        const lx = -w / 2 + (w * i) / Math.max(1, xCount - 1);
        const p = L(lx, side * d / 2);
        sink.Add("GatePaintGreen", PlaceGeometry(
          MakeBox(0.62, 0.22, 0.96, TILE_METERS.wood, `${seed}:${tag}dg${side}${i}`),
          { x: p.x, y: y - 0.20, z: p.z, ry }));
        sink.Add("GatePaintRed", PlaceGeometry(
          MakeBox(0.38, 0.34, 0.54, TILE_METERS.wood, `${seed}:${tag}blk${side}${i}`),
          { x: p.x, y: y - 0.43, z: p.z, ry }));
      }
      for (let i = 1; i < 3; i += 1) {
        const lz = -d / 2 + (d * i) / 3;
        const p = L(side * w / 2, lz);
        sink.Add("GatePaintGreen", PlaceGeometry(
          MakeBox(0.96, 0.22, 0.62, TILE_METERS.wood, `${seed}:${tag}sideDg${side}${i}`),
          { x: p.x, y: y - 0.20, z: p.z, ry }));
      }
    }
  };

  // --- 下檐（重檐的第一层）：闭合歇山顶、筒瓦垄、戗脊和吻兽 ---
  const eave1 = floor + columnH;
  const AddRoof = (yEave, w, d, tag, detailScale = 1) => {
    const rise = Math.max(1.12, Math.min(w, d) * 0.22);
    const cornerLift = 0.26 * detailScale;
    const halfW = w / 2 + eaveOut;
    const halfD = d / 2 + eaveOut;
    const ridgeHalf = Math.max(w * 0.24, halfW - halfD * 0.78);
    const EaveY = (lx) => {
      const t = Math.max(0, (Math.abs(lx) - ridgeHalf) / Math.max(0.01, halfW - ridgeHalf));
      return cornerLift * t * t;
    };
    const PlaceLocal = (material, geometry) => sink.Add(material,
      PlaceGeometry(geometry, { x, y: yEave, z, ry }));

    PlaceLocal("GateRoofTile", MakeGateRoofShell(w, d, {
      eaveOut, rise, cornerLift, thickness: 0.15, seed: `${seed}:${tag}:shell`,
    }));

    // 连续檐枋：四边真正首尾相接；前后檐的末段随翼角一起抬高。
    const cuts = [-halfW, -ridgeHalf, 0, ridgeHalf, halfW];
    for (const side of [-1, 1]) {
      for (let i = 0; i < cuts.length - 1; i += 1) {
        const a = cuts[i], b = cuts[i + 1];
        PlaceLocal("GatePaintGreen", MakeBeamBetween(
          [a, EaveY(a) - 0.17, side * halfD], [b, EaveY(b) - 0.17, side * halfD],
          0.18, TILE_METERS.wood, `${seed}:${tag}:fascia${side}${i}`));
      }
      PlaceLocal("GatePaintRed", MakeBeamBetween(
        [side * halfW, EaveY(halfW) - 0.23, -halfD],
        [side * halfW, EaveY(halfW) - 0.23, halfD],
        0.16, TILE_METERS.wood, `${seed}:${tag}:sideFascia${side}`));
    }

    // 筒瓦垄：不是贴图上的线，而是沿坡面铺的细实体，逆光时仍能读出屋面尺度。
    const tileRows = Math.max(9, Math.round((w + eaveOut * 2) / 0.72));
    for (const side of [-1, 1]) {
      for (let i = 0; i <= tileRows; i += 1) {
        const lx = -halfW + (halfW * 2 * i) / tileRows;
        const ridgeX = Math.max(-ridgeHalf, Math.min(ridgeHalf, lx));
        PlaceLocal("GateRoofTile", MakeBeamBetween(
          [lx, EaveY(lx) + 0.08, side * halfD], [ridgeX, rise + 0.08, 0],
          0.075 * detailScale, TILE_METERS.roof, `${seed}:${tag}:tile${side}${i}`));
      }
    }

    // 正脊、四条戗脊与脊端吻兽，合起来把原来最明显的「交叉板」轮廓彻底换掉。
    //
    // 正脊分**脊座 + 花砖**两层：1938 年那张「日寇攻占的滕县城楼」里，正脊是一条
    // 能透光的**镂空花砖脊**（长焦下看得清一排菱形空当），不是一根实心方梁。
    // 逆光时这一排空当会把正脊剪影切成断续的齿——那正是地方性城楼与官式箭楼
    // 最好认的一处差别，实心梁把它抹平了。
    PlaceLocal("GateRoofTile", MakeBeamBetween(
      [-ridgeHalf - 0.36, rise + 0.10, 0], [ridgeHalf + 0.36, rise + 0.10, 0],
      0.26 * detailScale, TILE_METERS.roof, `${seed}:${tag}:mainRidge`));
    const flowerSpan = (ridgeHalf + 0.30) * 2;
    const flowerCount = Math.max(6, Math.round(flowerSpan / (0.46 * detailScale)));
    for (let i = 0; i < flowerCount; i += 1) {
      // 立砖之间留出约等宽的空当，就是「镂空」那一半。
      const lx = -flowerSpan / 2 + flowerSpan * (i + 0.5) / flowerCount;
      PlaceLocal("GateRoofTile", PlaceGeometry(
        MakeBox(0.13 * detailScale, 0.30 * detailScale, 0.16 * detailScale,
          TILE_METERS.roof, `${seed}:${tag}:flower${i}`),
        { x: lx, y: rise + 0.30, z: 0 }));
    }
    // 花砖上面再压一条细脊，把一排立砖收住，不让它散成一行牙签。
    PlaceLocal("GateRoofTile", MakeBeamBetween(
      [-ridgeHalf - 0.30, rise + 0.48, 0], [ridgeHalf + 0.30, rise + 0.48, 0],
      0.17 * detailScale, TILE_METERS.roof, `${seed}:${tag}:ridgeCap`));
    for (const sideX of [-1, 1]) {
      for (const sideZ of [-1, 1]) {
        PlaceLocal("GateRoofTile", MakeBeamBetween(
          [sideX * ridgeHalf, rise + 0.11, 0],
          [sideX * halfW, EaveY(halfW) + 0.11, sideZ * halfD],
          0.22 * detailScale, TILE_METERS.roof, `${seed}:${tag}:hip${sideX}${sideZ}`));
        for (const t of [0.48, 0.68]) {
          const bx = sideX * (ridgeHalf + (halfW - ridgeHalf) * t);
          const bz = sideZ * halfD * t;
          const by = rise * (1 - t) + EaveY(halfW) * t + 0.25;
          PlaceLocal("GateRoofTile", PlaceGeometry(
            MakeBox(0.22 * detailScale, 0.30 * detailScale, 0.22 * detailScale,
              TILE_METERS.roof, `${seed}:${tag}:beast${sideX}${sideZ}${t}`),
            { x: bx, y: by, z: bz }));
        }
      }
      PlaceLocal("GateRoofTile", PlaceGeometry(
        MakeBox(0.44 * detailScale, 0.72 * detailScale, 0.42 * detailScale,
          TILE_METERS.roof, `${seed}:${tag}:chiwen${sideX}`),
        { x: sideX * (ridgeHalf + 0.24), y: rise + 0.44, z: 0 }));
      PlaceLocal("GateRoofTile", PlaceGeometry(
        MakeBox(0.36 * detailScale, 0.20 * detailScale, 0.62 * detailScale,
          TILE_METERS.roof, `${seed}:${tag}:chiwenNose${sideX}`),
        { x: sideX * (ridgeHalf + 0.42), y: rise + 0.57, z: 0 }));
    }
  };
  AddBracketSets(eave1, bodyW, bodyD, "lowerBracket", 4);
  AddRoof(eave1, bodyW, bodyD, "r1", 1);

  // --- 上层：矮一圈的楼身 + 上檐 ---
  const upW = bodyW * 0.74, upD = bodyD * 0.74;
  const upFloor = eave1 + 0.9;
  for (let cx = 0; cx < 4; cx += 1) {
    for (let cz = 0; cz < 2; cz += 1) {
      const lx = -upW / 2 + (upW * cx) / 3;
      const lz = -upD / 2 + upD * cz;
      const p = L(lx, lz);
      sink.Add("GatePaintRed", PlaceGeometry(
        new THREE.CylinderGeometry(0.145, 0.175, upperH, 10),
        { x: p.x, y: upFloor + upperH / 2, z: p.z, ry }));
      sink.Add("Ashlar", PlaceGeometry(
        new THREE.CylinderGeometry(0.23, 0.26, 0.16, 10),
        { x: p.x, y: upFloor + 0.08, z: p.z, ry }));
    }
  }
  for (const s of [-1, 1]) {
    const p = L(0, s * upD / 2);
    sink.Add("GatePaintGreen", PlaceGeometry(
      MakeBox(upW + 0.4, 0.34, 0.26, TILE_METERS.wood, `${seed}:uarc${s}`),
      { x: p.x, y: upFloor + upperH - 0.25, z: p.z, ry }));
    sink.Add("GateBrick", PlaceGeometry(
      MakeBox(upW, 0.9, 0.24, TILE_METERS.brick, `${seed}:usill${s}`, BRICK_UV_GRID),
      { x: p.x, y: upFloor + 0.45, z: p.z, ry }));
  }
  // 上层三间格扇。上楼没有玩家通路要求，可以完整收住立面，让第二层不再是八根孤柱。
  const upperBayW = upW / 3;
  for (const face of [-1, 1]) {
    for (const bay of [-1, 0, 1]) {
      AddLatticeScreen({
        lx: bay * upperBayW, lz: face * (upD / 2 - 0.08), y0: upFloor + 0.92,
        w: upperBayW - 0.32, h: upperH - 1.38, tag: `upperScreen${face}${bay}`,
        vertical: 2, horizontal: 2,
      });
    }
  }
  AddBracketSets(upFloor + upperH, upW, upD, "upperBracket", 4);
  AddRoof(upFloor + upperH, upW, upD, "r2", 0.84);
}

/**
 * 县衙 —— 城内**唯一有实物可参照的建筑**（旧县衙大堂尚存，2006 年省级文保，
 * 认定为典型明代建筑；正堂五间面阔约 22 m 就是照它做的）。
 *
 * 轴线自南（大门）向北：坊枕街（题「善国」）→ 大门带谯楼 → 仪门 → 戒石亭 →
 * 正堂五间 → 琴堂。堂左幕厅，右銮驾库、甲杖库；东西六房 30 间。
 *
 * **不要照抄 2007 年后复建的仪门与谯楼门细部** —— 那不是原物。
 * 这里只做体量与轴线关系，不做斗拱与雕饰。
 *
 * 局部坐标：+z 指向**北**（往院子深处），大门在 z=0。
 */
export function AddYamen(sink, { x, z, ry = 0, w = 90, d = 140, seed = "yamen", damage = 0.25 }) {
  const cos = Math.cos(ry), sin = Math.sin(ry);
  // 局部 +z 往里（北）。世界里 z 负方向是北，所以这里的 L 把局部 +z 映射到世界 -z
  const L = (lx, lz) => ({ x: x + cos * lx + sin * -lz, z: z - sin * lx + cos * -lz });
  const wallH = 3.2;

  // --- 院墙一圈 ---
  const gateW = 6.0;
  for (const s of [-1, 1]) {
    const segLen = (w - gateW) / 2;
    const p = L(s * (gateW / 2 + segLen / 2), 0);
    AddWall(sink, "HouseBrick", {
      x: p.x, z: p.z, length: segLen, height: wallH, thickness: 0.5, ry,
      ruin: damage * 0.5, seed: `${seed}:ws${s}`, plinth: "CrossStone", cope: true,
    });
  }
  {
    const p = L(0, d);
    AddWall(sink, "HouseBrick", {
      x: p.x, z: p.z, length: w, height: wallH, thickness: 0.5, ry,
      ruin: damage * 0.5, seed: `${seed}:wn`, plinth: "CrossStone", cope: true,
    });
  }
  for (const s of [-1, 1]) {
    const p = L(s * w / 2, d / 2);
    AddWall(sink, "HouseBrick", {
      x: p.x, z: p.z, length: d, height: wallH, thickness: 0.5, ry: ry + Math.PI / 2,
      ruin: damage * 0.5, seed: `${seed}:we${s}`, plinth: "CrossStone", cope: true,
    });
  }

  // --- 坊枕街（题「善国」）：跨在街上的一座牌坊，在大门之外 ---
  const fang = L(0, -9);
  AddPaifang(sink, { x: fang.x, z: fang.z, ry, span: 9, seed: `${seed}:fang` });

  // --- 大门带谯楼 ---
  const gate = L(0, 0);
  AddRoomBlock(sink, {
    x: gate.x, z: gate.z, ry, width: gateW + 6, depth: 6.5,
    eaveY: 4.2, ridgeY: 6.4, seed: `${seed}:gate`, damage: damage * 0.6, facing: 1, bays: 3,
  });
  // 谯楼：大门之上的一层小楼（形制只做体量，细部无实据）
  const qiao = L(0, 0);
  sink.Add("HouseBrick", PlaceGeometry(
    MakeBox(gateW + 2.4, 2.6, 4.4, TILE_METERS.brick, `${seed}:qiao`, BRICK_UV_GRID),
    { x: qiao.x, y: 6.6, z: qiao.z, ry }));
  AddHardMountainRoof(sink, {
    x: qiao.x, z: qiao.z, width: gateW + 3.2, depth: 5.0, eaveY: 9.2, ridgeY: 10.9,
    ry, seed: `${seed}:qiaoRoof`,
  });

  // --- 仪门 ---
  const yi = L(0, 32);
  AddRoomBlock(sink, {
    x: yi.x, z: yi.z, ry, width: 14, depth: 5.5, eaveY: 3.6, ridgeY: 5.4,
    seed: `${seed}:yimen`, damage: damage * 0.7, facing: 1, bays: 3,
  });

  // --- 东西六房（30 间）：仪门与正堂之间的两列廊房 ---
  for (const s of [-1, 1]) {
    for (let k = 0; k < 3; k += 1) {
      const p = L(s * (w / 2 - 9), 44 + k * 12);
      AddRoomBlock(sink, {
        x: p.x, z: p.z, ry: ry + (s > 0 ? -Math.PI / 2 : Math.PI / 2),
        width: 11, depth: 5.2, eaveY: 2.9, ridgeY: 4.5,
        seed: `${seed}:liufang${s}${k}`, damage: damage * 0.8, facing: 1, bays: 3,
      });
    }
  }

  // --- 戒石亭：正堂之前、仪门之后的一座小亭，石刻「尔俸尔禄，民膏民脂……」---
  const jie = L(0, 58);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const p = L(sx * 1.6, 58 + sz * 1.6);
      sink.Add("WoodBeam", PlaceGeometry(
        MakeBox(0.24, 2.7, 0.24, TILE_METERS.wood, `${seed}:jcol${sx}${sz}`),
        { x: p.x, y: 1.35, z: p.z, ry }));
    }
  }
  sink.Add("CrossStone", PlaceGeometry(
    MakeBox(0.5, 2.0, 1.3, TILE_METERS.stone, `${seed}:jstele`), { x: jie.x, y: 1.0, z: jie.z, ry }));
  for (let k = 0; k < 4; k += 1) {
    const a = (k * Math.PI) / 2;
    sink.Add("RoofTile", PlaceGeometry(
      MakeBox(4.6, 0.12, 2.6, TILE_METERS.roof, `${seed}:jrf${k}`),
      { x: jie.x + Math.sin(a) * 1.0, y: 3.1, z: jie.z + Math.cos(a) * 1.0, ry: ry + a, rx: -0.55 }));
  }

  // --- 正堂五间（面阔约 22 m，照现存明代大堂实物）---
  const hall = L(0, 80);
  sink.Add("CrossStone", PlaceGeometry(
    MakeBox(26, 0.9, 16, TILE_METERS.stone, `${seed}:hallBase`), { x: hall.x, y: 0.45, z: hall.z, ry }));
  AddRoomBlock(sink, {
    x: hall.x, z: hall.z, ry, width: 22, depth: 12.5, eaveY: 5.6, ridgeY: 9.2,
    seed: `${seed}:hall`, damage: damage * 0.4, facing: 1, bays: 5,
  });
  // 月台前的踏跺
  const step = L(0, 71.5);
  sink.Add("CrossStone", PlaceGeometry(
    MakeBox(9, 0.9, 3.0, TILE_METERS.stone, `${seed}:hallStep`), { x: step.x, y: 0.45, z: step.z, ry }));

  // --- 琴堂（正堂之后）---
  const qin = L(0, 104);
  AddRoomBlock(sink, {
    x: qin.x, z: qin.z, ry, width: 16, depth: 9, eaveY: 3.9, ridgeY: 6.2,
    seed: `${seed}:qintang`, damage: damage * 0.6, facing: 1, bays: 3,
  });

  // --- 堂左幕厅；堂右銮驾库、甲杖库（面南时左为东）---
  const mu = L(-20, 80);
  AddRoomBlock(sink, {
    x: mu.x, z: mu.z, ry: ry + Math.PI / 2, width: 12, depth: 6.5, eaveY: 3.2, ridgeY: 5.0,
    seed: `${seed}:muting`, damage: damage * 0.7, facing: 1, bays: 3,
  });
  for (let k = 0; k < 2; k += 1) {
    const p = L(21, 74 + k * 12);
    AddRoomBlock(sink, {
      x: p.x, z: p.z, ry: ry - Math.PI / 2, width: 10, depth: 6.0, eaveY: 3.1, ridgeY: 4.8,
      seed: `${seed}:ku${k}`, damage: damage * 0.7, facing: 1, bays: 2,
    });
  }
}

/**
 * 牌坊。西门里街上的龙家牌坊、北门里街东侧坐东朝西的铁牌坊、
 * 城南驿道上的「善国门」（**那是牌坊式阁门楼，不是第五座城门**）都用这一个。
 * 四柱三间，两层小檐；形制尺寸全为推定（只有街名与朝向有记载）。
 */
export function AddPaifang(sink, {
  x, z, ry = 0, span = 9, seed = "paifang", height = 7.2, iron = false, arch = false,
}) {
  const cos = Math.cos(ry), sin = Math.sin(ry);
  const L = (lx, lz) => ({ x: x + cos * lx + sin * lz, z: z - sin * lx + cos * lz });
  const post = iron ? "IronPlate" : "CrossStone";
  const beam = iron ? "IronPlate" : "PaintRed";
  // 四柱：中间两根高，边上两根矮
  for (const [lx, h] of [[-span / 2, height * 0.78], [-span / 6, height],
    [span / 6, height], [span / 2, height * 0.78]]) {
    const p = L(lx, 0);
    sink.Add(post, PlaceGeometry(
      MakeBox(0.42, h, 0.42, TILE_METERS.stone, `${seed}:p${lx}`),
      { x: p.x, y: h / 2, z: p.z, ry }));
    sink.Solid(p.x, h / 2, p.z, 0.3, h / 2, 0.3, "prop", ry);
    // 夹杆石
    sink.Add("CrossStone", PlaceGeometry(
      MakeBox(0.8, 1.0, 0.8, TILE_METERS.stone, `${seed}:d${lx}`),
      { x: p.x, y: 0.5, z: p.z, ry }));
  }
  // 额枋两道 + 匾心
  for (const [y, w] of [[height * 0.66, span + 0.9], [height * 0.80, span * 0.42]]) {
    const p = L(0, 0);
    sink.Add(beam, PlaceGeometry(
      MakeBox(w, 0.52, 0.34, TILE_METERS.wood, `${seed}:b${y}`),
      { x: p.x, y, z: p.z, ry }));
  }
  const plaque = L(0, 0.02);
  sink.Add("CrossStone", PlaceGeometry(
    MakeBox(span * 0.3, 0.78, 0.12, TILE_METERS.stone, `${seed}:plq`),
    { x: plaque.x, y: height * 0.73, z: plaque.z, ry }));
  // 小檐（三重）
  for (const [lx, w, y] of [[-span / 3, span / 2.4, height * 0.84],
    [0, span * 0.5, height * 0.94], [span / 3, span / 2.4, height * 0.84]]) {
    for (const s of [-1, 1]) {
      const p = L(lx, s * 0.42);
      sink.Add("TubeTile", PlaceGeometry(
        MakeBox(w, 0.12, 1.15, TILE_METERS.roof, `${seed}:rf${lx}${s}`),
        { x: p.x, y, z: p.z, ry, rx: s * 0.5 }));
    }
  }
  // 阁门楼式的（善国门）：柱间加一道券洞墙
  if (arch) {
    for (const s of [-1, 1]) {
      const p = L(s * (span / 3), 0);
      sink.Add("HouseBrick", PlaceGeometry(
        MakeBox(span / 3, height * 0.6, 1.2, TILE_METERS.brick, `${seed}:aw${s}`, BRICK_UV_GRID),
        { x: p.x, y: height * 0.3, z: p.z, ry }));
    }
  }
}

/**
 * 警报楼（西门里街 x=-200，高 9 m）。街名与「有警报楼」有记载，
 * 形制无任何资料 —— 做成一座砖砌方塔，顶上一圈敞开的观察层加一口钟架，全为推定。
 */
export function AddAlarmTower(sink, { x, z, ry = 0, height = 9, seed = "alarm", side = 4.0 }) {
  const cos = Math.cos(ry), sin = Math.sin(ry);
  const L = (lx, lz) => ({ x: x + cos * lx + sin * lz, z: z - sin * lx + cos * lz });
  const bodyH = height - 2.4;
  sink.Add("CrossStone", PlaceGeometry(
    MakeBox(side + 0.7, 0.8, side + 0.7, TILE_METERS.stone, `${seed}:base`), { x, y: 0.4, z, ry }));
  sink.Add("HouseBrick", PlaceGeometry(
    MakeBox(side, bodyH, side, TILE_METERS.brick, `${seed}:body`, BRICK_UV_GRID),
    { x, y: 0.8 + bodyH / 2, z, ry }));
  sink.Solid(x, (0.8 + bodyH) / 2, z, side / 2 + 0.35, (0.8 + bodyH) / 2, side / 2 + 0.35, "wall");
  // 观察层：四根柱 + 一圈栏
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const p = L(sx * side * 0.42, sz * side * 0.42);
      sink.Add("WoodBeam", PlaceGeometry(
        MakeBox(0.22, 2.0, 0.22, TILE_METERS.wood, `${seed}:c${sx}${sz}`),
        { x: p.x, y: 0.8 + bodyH + 1.0, z: p.z, ry }));
    }
  }
  for (const s of [-1, 1]) {
    const p = L(0, s * side * 0.44);
    sink.Add("HouseBrick", PlaceGeometry(
      MakeBox(side * 0.9, 0.75, 0.22, TILE_METERS.brick, `${seed}:rl${s}`, BRICK_UV_GRID),
      { x: p.x, y: 0.8 + bodyH + 0.38, z: p.z, ry }));
    const q = L(s * side * 0.44, 0);
    sink.Add("HouseBrick", PlaceGeometry(
      MakeBox(0.22, 0.75, side * 0.9, TILE_METERS.brick, `${seed}:rlx${s}`, BRICK_UV_GRID),
      { x: q.x, y: 0.8 + bodyH + 0.38, z: q.z, ry }));
  }
  // 四坡小顶
  for (let k = 0; k < 4; k += 1) {
    const a = (k * Math.PI) / 2;
    sink.Add("RoofTile", PlaceGeometry(
      MakeBox(side * 1.5, 0.12, side * 0.72, TILE_METERS.roof, `${seed}:rf${k}`),
      {
        x: x + Math.sin(a) * side * 0.3, y: height + 0.55,
        z: z + Math.cos(a) * side * 0.3, ry: ry + a, rx: 0.6,
      }));
  }
  // 枪眼：这种高的砖楼在巷战里一定被守军用上
  AddLoopholes(sink, {
    x, z, ry, ys: [3.2, 5.4], count: 2, spread: side * 0.5,
    seed: `${seed}:lp`, wallFace: side / 2 + 0.03,
  });
}

/**
 * 四方城（北门里街东侧）。只有名字与大致方位有记载，形制、性质一概无资料 ——
 * 按字面做成一座方形的小围子：一圈 3 m 高的砖墙，南面一个门洞，里面几间房。
 * **整体为推定。**
 */
export function AddSquareFort(sink, { x, z, ry = 0, w = 32, d = 32, seed = "sqfort", damage = 0.3 }) {
  const cos = Math.cos(ry), sin = Math.sin(ry);
  const L = (lx, lz) => ({ x: x + cos * lx + sin * lz, z: z - sin * lx + cos * lz });
  const h = 3.1;
  const gateW = 2.6;
  for (const s of [-1, 1]) {
    const segLen = (w - gateW) / 2;
    const p = L(s * (gateW / 2 + segLen / 2), d / 2);
    AddWall(sink, "HouseBrick", {
      x: p.x, z: p.z, length: segLen, height: h, thickness: 0.6, ry,
      ruin: damage, seed: `${seed}:s${s}`, plinth: "CrossStone", cope: true,
    });
  }
  const gp = L(0, d / 2);
  AddGatehouse(sink, { x: gp.x, z: gp.z, ry, seed: `${seed}:gate`, damage: damage * 0.7, openW: gateW });
  const rest = [
    { lx: 0, lz: -d / 2, len: w, rot: 0 },
    { lx: -w / 2, lz: 0, len: d, rot: Math.PI / 2 },
    { lx: w / 2, lz: 0, len: d, rot: Math.PI / 2 },
  ];
  rest.forEach((r, i) => {
    const p = L(r.lx, r.lz);
    AddWall(sink, "HouseBrick", {
      x: p.x, z: p.z, length: r.len, height: h, thickness: 0.6, ry: ry + r.rot,
      ruin: damage, seed: `${seed}:w${i}`, plinth: "CrossStone", cope: true,
    });
    AddLoopholes(sink, {
      x: p.x, z: p.z, ry: ry + r.rot, ys: [1.25], count: 3, spread: r.len * 0.5,
      seed: `${seed}:lp${i}`, wallFace: 0.33,
    });
  });
  const inner = L(0, -d / 2 + 6);
  AddRoomBlock(sink, {
    x: inner.x, z: inner.z, ry, width: w * 0.55, depth: 7, eaveY: 3.0, ridgeY: 4.8,
    seed: `${seed}:hall`, damage: damage * 0.9, facing: 1, bays: 3,
  });
}

/**
 * 天主堂（德式小堂）。
 *
 * **形制、规模、有无钟楼一概无资料**，做最保守的单钟塔小堂：
 * 清水砖砌、单中厅、陡坡瓦顶、山面一座方钟塔加锥顶、券顶窗。
 * 它在剧情上重要：日军接到「保护外国权益」的命令，十六日因此不敢彻底破坏城内建筑，
 * 十七日才改为焦土方针 —— 一座德国教堂在战术上短暂地庇护了一段城墙。
 *
 * 位置两说（日方记城内近内城墙、中方记南关）无法判定，各建一处不合并。
 */
export function AddChurch(sink, {
  x, z, ry = 0, nave = [11, 24], towerH = 16, seed = "church", damage = 0.15,
}) {
  const [w, d] = nave;
  const cos = Math.cos(ry), sin = Math.sin(ry);
  const L = (lx, lz) => ({ x: x + cos * lx + sin * lz, z: z - sin * lx + cos * lz });
  const eave = 7.4, ridge = 11.6;

  // 中厅四壁（清水砖，砌到檐口）
  const sides = [
    { lx: 0, lz: -d / 2, len: w, rot: 0 },
    { lx: 0, lz: d / 2, len: w, rot: 0 },
    { lx: -w / 2, lz: 0, len: d, rot: Math.PI / 2 },
    { lx: w / 2, lz: 0, len: d, rot: Math.PI / 2 },
  ];
  sides.forEach((s, i) => {
    const p = L(s.lx, s.lz);
    AddWall(sink, "HouseBrick", {
      x: p.x, z: p.z, length: s.len, height: eave, thickness: 0.55, ry: ry + s.rot,
      ruin: damage * 0.5, seed: `${seed}:w${i}`, plinth: "CrossStone",
    });
    // 券顶窗：一排竖长的浅色石套，德式清水砖立面靠这一排线脚才立得住
    if (i >= 2) {
      const n = 5;
      for (let k = 0; k < n; k += 1) {
        const along = -s.len / 2 + (s.len * (k + 0.5)) / n;
        const q = L(s.lx + (s.rot === 0 ? along : 0), s.lz + (s.rot === 0 ? 0 : -along));
        sink.Add("CrossStone", PlaceGeometry(
          MakeBox(0.9, 3.0, 0.62, TILE_METERS.stone, `${seed}:win${i}${k}`),
          { x: q.x, y: 3.6, z: q.z, ry: ry + s.rot }));
        sink.Add("Charred", PlaceGeometry(
          MakeBox(0.62, 2.5, 0.66, TILE_METERS.stone, `${seed}:winh${i}${k}`),
          { x: q.x, y: 3.6, z: q.z, ry: ry + s.rot }));
      }
    }
  });
  AddHardMountainRoof(sink, {
    x, z, width: w, depth: d, eaveY: eave, ridgeY: ridge, ry, seed: `${seed}:roof`, rafters: false,
  });

  // 钟塔：山面一座方塔 + 四坡锥顶
  const tw = 4.6;
  const tp = L(0, d / 2 + tw / 2 - 0.4);
  sink.Add("CrossStone", PlaceGeometry(
    MakeBox(tw + 0.8, 1.0, tw + 0.8, TILE_METERS.stone, `${seed}:tbase`),
    { x: tp.x, y: 0.5, z: tp.z, ry }));
  sink.Add("HouseBrick", PlaceGeometry(
    MakeBox(tw, towerH - 1.0, tw, TILE_METERS.brick, `${seed}:tower`, BRICK_UV_GRID),
    { x: tp.x, y: 1.0 + (towerH - 1.0) / 2, z: tp.z, ry }));
  sink.Solid(tp.x, towerH / 2, tp.z, tw / 2 + 0.4, towerH / 2, tw / 2 + 0.4, "wall");
  // 钟层的券洞
  for (const s of [-1, 1]) {
    const p = L(s * (tw / 2 - 0.02), d / 2 + tw / 2 - 0.4);
    sink.Add("Charred", PlaceGeometry(
      MakeBox(0.2, 2.4, 1.5, TILE_METERS.stone, `${seed}:bell${s}`),
      { x: p.x, y: towerH - 2.6, z: p.z, ry }));
  }
  // 锥顶
  const spire = new THREE.ConeGeometry(tw * 0.78, 4.6, 4);
  const uv = spire.attributes.uv;
  for (let i = 0; i < uv.count; i += 1) uv.setXY(i, uv.getX(i) * 3, uv.getY(i) * 3);
  sink.Add("TubeTile", PlaceGeometry(spire, { x: tp.x, y: towerH + 2.3, z: tp.z, ry: ry + Math.PI / 4 }));
  // 大门
  const door = L(0, d / 2 + tw - 0.42);
  AddDoorReveal(sink, {
    x: door.x, z: door.z, ry: ry + Math.PI, openW: 1.9, openH: 3.0, depth: 1.4,
    seed: `${seed}:door`, paving: "CrossStone", sill: "CrossStone",
  });
}

/**
 * 龙泉塔 —— **城东郊、荆河西岸，不在城内**。八角九级砖塔。
 *
 * 1938 年 3 月的状态必须做残的：**塔刹已倾毁、顶层塔室部分倾塌、挑檐斗拱脱落**。
 *（今天完整的宝葫芦塔刹是 1984 年新装的；照今塔做就是错的。）
 * 三月十七日十时被日军观测班占领作炮兵观测所，从 30 m 高处逐一报告城内弹着点 ——
 * 城之所以在十七日下午被精确轰开，是因为这座塔。日方只登到 30 m 而非全高，
 * 也侧证顶层当时已不可用。
 *
 * 始建年代四说互斥、形制两说互斥（密檐式／楼阁式）、高度三说 —— 台词与 UI 不能说死。
 */
export function AddPagoda(sink, {
  x, z, tiers = 9, seed = "pagoda", baseY = 0, baseRadius = 4.3, topRadius = 2.1,
}) {
  const rnd = Mulberry32(HashString(seed));
  // 台基
  const plinthG = new THREE.CylinderGeometry(baseRadius + 1.5, baseRadius + 1.9, 1.6, 8);
  ScalePagodaUv(plinthG, 3.0, 1.2);
  sink.Add("Ashlar", PlaceGeometry(plinthG, { x, y: baseY + 0.8, z }));
  sink.Solid(x, baseY + 0.8, z, baseRadius + 1.9, 0.8, baseRadius + 1.9, "prop");

  let y = baseY + 1.6;
  for (let t = 0; t < tiers; t += 1) {
    const f0 = t / tiers, f1 = (t + 1) / tiers;
    const r0 = baseRadius + (topRadius - baseRadius) * f0;
    const r1 = baseRadius + (topRadius - baseRadius) * f1;
    // 层高逐级递减：九级到顶约 34 m（残塔），日方能登到的第八级顶正好在 30 m 上下
    const h = 5.0 - t * 0.32;
    const broken = t === tiers - 1;          // 顶层塔室部分倾塌
    const bodyH = broken ? h * 0.45 : h;
    const shaft = new THREE.CylinderGeometry(r1, r0, bodyH, 8);
    ScalePagodaUv(shaft, 3.2, bodyH / 1.2);
    sink.Add(t < 2 ? "CityBrick" : "CityBrickWorn", PlaceGeometry(shaft, { x, y: y + bodyH / 2, z }));
    if (t === 0) sink.Solid(x, y + bodyH / 2, z, r0, bodyH / 2, r0, "wall");

    // 券门：八面里的四面开门（每层错开半角是楼阁式砖塔的常规做法）
    if (!broken) {
      for (let k = 0; k < 4; k += 1) {
        const a = (k * Math.PI) / 2 + (t % 2) * (Math.PI / 4);
        sink.Add("Charred", PlaceGeometry(
          MakeBox(0.9, Math.min(2.2, bodyH * 0.5), 0.5, TILE_METERS.stone, `${seed}:d${t}${k}`),
          { x: x + Math.sin(a) * (r0 - 0.15), y: y + bodyH * 0.32, z: z + Math.cos(a) * (r0 - 0.15), ry: a }));
      }
    }
    // 挑檐：1938 年**檐角斗拱有脱落**，所以逐层随机缺角，不做齐整的八角檐
    const eaveR = r1 + (broken ? 0.5 : 1.15);
    const eaveG = new THREE.CylinderGeometry(r1 + 0.15, eaveR, 0.3, 8);
    ScalePagodaUv(eaveG, 3.4, 0.5);
    sink.Add("TubeTile", PlaceGeometry(eaveG, { x, y: y + bodyH + 0.15, z }));
    if (!broken) {
      for (let k = 0; k < 8; k += 1) {
        if (rnd() < 0.28) continue;         // 掉了的那几个斗拱
        const a = (k * Math.PI) / 4 + Math.PI / 8;
        sink.Add("WoodBeam", PlaceGeometry(
          MakeBox(0.22, 0.24, 0.85, TILE_METERS.wood, `${seed}:br${t}${k}`),
          { x: x + Math.sin(a) * (r1 + 0.5), y: y + bodyH - 0.18, z: z + Math.cos(a) * (r1 + 0.5), ry: a }));
      }
    }
    y += bodyH + 0.3;
  }
  // **不装塔刹**：1938 年 3 月它已经倾毁。顶上留一圈参差的断砖。
  for (let k = 0; k < 6; k += 1) {
    const a = rnd() * Math.PI * 2;
    const r = topRadius * (0.3 + rnd() * 0.6);
    sink.Add("CityBrickWorn", PlaceGeometry(
      MakeBox(0.6 + rnd() * 0.5, 0.35 + rnd() * 0.5, 0.5, TILE_METERS.brick, `${seed}:stub${k}`),
      { x: x + Math.sin(a) * r, y: y + 0.2, z: z + Math.cos(a) * r, ry: a, rz: (rnd() - 0.5) * 0.4 }));
  }
}

/** 圆柱面 UV 按世界米数重算（塔身是 30 m 高的砖面，默认 0..1 的 UV 会把砖拉成竖条纹）。 */
function ScalePagodaUv(geometry, uScale, vScale) {
  const uv = geometry.attributes.uv;
  if (!uv) return geometry;
  for (let i = 0; i < uv.count; i += 1) uv.setXY(i, uv.getX(i) * uScale, uv.getY(i) * vScale);
  uv.needsUpdate = true;
  return geometry;
}

// 关厢寨墙（AddZhaiWall）已迁到样条围墙管线：Script_WallSpline.BuildWallSpline
// （逐模块贴地 + InstancedMesh），调用点在 Script_TengxianCity 的东关段。
