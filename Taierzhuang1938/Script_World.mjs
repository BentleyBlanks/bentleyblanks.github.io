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
    this.externalProps = [];      // 交给 Script_ExternalProps 实例化/流送的下载模型摆位
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

  External(placement) {
    if (placement) this.externalProps.push(placement);
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
  const sliceH = new Array(slices).fill(height);
  for (let i = 0; i < slices; i += 1) {
    const t = i / (slices - 1 || 1);
    const edge = Math.min(t, 1 - t) * 2;
    const bite = ruin * (0.3 + 0.7 * rnd()) * (1 - edge * 0.4);
    const h = Math.max(0.18, height * (1 - bite));
    sliceH[i] = h;
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
    // 碰撞高度**跟着画出来的那一片走**，不再一整段登记一只通高盒。
    //
    // 通高盒的后果：被炮火削低的那一片，墙头上方是看得见天光的缺口，人却撞在
    // 空气上。ColliderTest 一直把这类缺口当「破损墙头」豁免（缺口一路通到盒顶），
    // 直到屋面改成举折曲面、檐口略微下探把缺口的顶盖住 —— 缺口不再触顶，
    // 判据立刻把它算成「看得见的洞、摸得着的墙」。那是判据对了，不是判据坏了。
    //
    // 相邻高度接近的片合并成一只盒（±0.05 m）：完好的墙 ruin=0，所有片等高，
    // 合出来仍是原来那一只，碰撞体数量不变；只有真被削过的墙才会多出几只。
    const MERGE = 0.05;
    let runStart = 0;
    for (let i = 1; i <= slices; i += 1) {
      if (i < slices && Math.abs(sliceH[i] - sliceH[runStart]) <= MERGE) continue;
      const runLen = sliceW * (i - runStart);
      const runH = sliceH[runStart];
      const runMid = -length / 2 + sliceW * (runStart + (i - runStart) / 2);
      sink.Solid(x + Math.cos(ry) * runMid, runH / 2, z - Math.sin(ry) * runMid,
        runLen / 2, runH / 2, thickness / 2, "wall", ry);
      runStart = i;
    }
    sink.Cover(x, z, height * (1 - ruin * 0.5), Math.sin(ry), Math.cos(ry));
  }
}

/**
 * 构件库两档预建模战损的近景细节层。
 *
 * 主体建筑仍由各自的正式生成器按 damage 改轮廓；这一层只补那些不能靠一根
 * 0..1 数值自然长出来的局部证据：凹进去的弹着中心、崩开的砖圈、放射裂缝、
 * 墙脚落砖，以及严重档的断梁、散瓦和墙角残砖。全部继续进入 BuildSink 材质桶，
 * 不为每一块碎砖新开 Mesh / draw call；seed 相同就逐顶点相同。
 */
export function AddBuildingDamageDetails(sink, {
  x, z, ry = 0, width = 9, depth = 6, height = 4, seed = "damage", stage = "early",
} = {}) {
  const severe = stage === "severe";
  const w = Clamp(Math.abs(width) || 9, 2.4, 34);
  const d = Clamp(Math.abs(depth) || 6, 1.0, 28);
  const h = Clamp(Math.abs(height) || 4, 2.4, 10);
  const cos = Math.cos(ry), sin = Math.sin(ry);
  const At = (lx, lz) => ({ x: x + cos * lx - sin * lz, z: z - sin * lx - cos * lz });
  const surfaceOffset = Clamp(Math.min(w, d) * 0.025, 0.22, 0.38);
  const facadeZ = d / 2 + surfaceOffset;
  const faceRy = ry + Math.PI;
  const detail = {
    stage, lineageKey: `${seed}:damageDetail`, impactMarks: 0, fractureBricks: 0,
    crackSegments: 0, looseBricks: 0, exposedBeams: 0, roofFragments: 0,
  };

  const AddImpact = (index, lx, cy, radius) => {
    // 按弹点拆随机流：严重档扩大前两处再补两处，旧弹点不会因为换档而跳位置。
    const rnd = Mulberry32(HashString(`${seed}:damageDetail:impact:${index}`));
    const center = At(lx, facadeZ + 0.025);
    const core = new THREE.CircleGeometry(radius * (severe ? 0.46 : 0.32), severe ? 18 : 14);
    sink.Add("Charred", PlaceGeometry(core, { x: center.x, y: cy, z: center.z, ry: faceRy }));
    detail.impactMarks += 1;

    const ringCount = severe ? 17 : 13;
    const missingRun = Math.floor(rnd() * ringCount);
    for (let i = 0; i < ringCount; i += 1) {
      const distance = Math.min((i - missingRun + ringCount) % ringCount,
        (missingRun - i + ringCount) % ringCount);
      if (distance <= (severe ? 2 : 1)) continue;
      const a = (i / ringCount) * Math.PI * 2 + rnd() * 0.08;
      const rr = radius * (0.66 + rnd() * 0.12);
      const p = At(lx + Math.cos(a) * rr, facadeZ + 0.055 + rnd() * 0.025);
      const bw = radius * (severe ? 0.34 : 0.28) * (0.78 + rnd() * 0.36);
      const bh = radius * (severe ? 0.16 : 0.13) + radius * rnd() * 0.06;
      sink.Add("CityBrickWorn", PlaceGeometry(
        MakeBox(bw, bh, 0.12 + rnd() * 0.08, TILE_METERS.brick, `${seed}:impact${index}:brick${i}`),
        { x: p.x, y: cy + Math.sin(a) * rr, z: p.z, ry: faceRy, rz: a + Math.PI / 2 },
      ));
      detail.fractureBricks += 1;
    }

    const arms = severe ? 7 : 5;
    const segments = severe ? 3 : 2;
    for (let arm = 0; arm < arms; arm += 1) {
      const a = (arm / arms) * Math.PI * 2 + (rnd() - 0.5) * 0.55;
      for (let part = 0; part < segments; part += 1) {
        const r0 = radius * (0.42 + part * 0.33);
        const seg = radius * (0.34 + rnd() * 0.18);
        const bend = a + (rnd() - 0.5) * 0.28;
        const p = At(lx + Math.cos(bend) * r0, facadeZ + 0.012);
        sink.Add("Charred", PlaceGeometry(
          MakeBox(0.028 + rnd() * 0.018, seg, 0.018, TILE_METERS.wood,
            `${seed}:impact${index}:crack${arm}:${part}`),
          { x: p.x, y: cy + Math.sin(bend) * r0, z: p.z, ry: faceRy, rz: Math.PI / 2 - bend },
        ));
        detail.crackSegments += 1;
      }
    }
  };

  const impactCount = severe ? 4 : 2;
  const impactBands = [-0.28, 0.22, -0.04, 0.38];
  for (let i = 0; i < impactCount; i += 1) {
    const rnd = Mulberry32(HashString(`${seed}:damageDetail:position:${i}`));
    const lx = impactBands[i] * w + (rnd() - 0.5) * w * 0.035;
    const cy = h * (0.40 + (i % 2) * 0.18 + (rnd() - 0.5) * 0.08);
    const radius = severe ? 0.56 + rnd() * 0.26 : 0.36 + rnd() * 0.16;
    AddImpact(i, lx, cy, radius);
  }

  const looseCount = severe ? 34 : 14;
  const looseRnd = Mulberry32(HashString(`${seed}:damageDetail:loose`));
  for (let i = 0; i < looseCount; i += 1) {
    const inherited = i < 14;
    const lx = (looseRnd() - 0.5) * w * (inherited ? 0.52 : 0.76);
    const outward = 0.18 + Math.pow(looseRnd(), 1.7) * (inherited ? 0.95 : 1.9);
    const p = At(lx, d / 2 + outward);
    const bw = 0.19 + looseRnd() * 0.28;
    const bh = 0.10 + looseRnd() * 0.16;
    sink.Add(i % 5 === 0 ? "CrossStone" : "CityBrickWorn", PlaceGeometry(
      MakeBox(bw, bh, 0.18 + looseRnd() * 0.30, 0.34, `${seed}:loose${i}`),
      { x: p.x, y: bh / 2 + looseRnd() * 0.06, z: p.z,
        ry: ry + looseRnd() * Math.PI, rz: (looseRnd() - 0.5) * 0.45 },
    ));
    detail.looseBricks += 1;
  }

  const roofCount = severe ? 22 : 6;
  const roofRnd = Mulberry32(HashString(`${seed}:damageDetail:roof`));
  for (let i = 0; i < roofCount; i += 1) {
    const inherited = i < 6;
    const p = At((roofRnd() - 0.5) * w * 0.68,
      d / 2 + 0.35 + roofRnd() * (inherited ? 0.95 : 1.6));
    sink.Add(severe && i % 5 === 0 ? "Charred" : "RoofTile", PlaceGeometry(
      MakeBox(0.16 + roofRnd() * 0.26, 0.055 + roofRnd() * 0.055, 0.22 + roofRnd() * 0.33,
        TILE_METERS.roof, `${seed}:roofFrag${i}`),
      { x: p.x, y: 0.05 + roofRnd() * 0.08, z: p.z,
        ry: ry + roofRnd() * Math.PI, rz: (roofRnd() - 0.5) * 0.45 },
    ));
    detail.roofFragments += 1;
  }

  if (severe) {
    const beamRnd = Mulberry32(HashString(`${seed}:damageDetail:beams`));
    for (let i = 0; i < 3; i += 1) {
      const lx = (-0.26 + i * 0.26) * w + (beamRnd() - 0.5) * 0.30;
      const beamLen = Clamp(h * (0.54 + beamRnd() * 0.20), 1.8, 5.4);
      const p = At(lx, d / 2 + 0.28 + beamRnd() * 0.38);
      sink.Add(i === 1 ? "Charred" : "WoodBeam", PlaceGeometry(
        MakeBox(0.16 + beamRnd() * 0.07, beamLen, 0.18 + beamRnd() * 0.07,
          TILE_METERS.wood, `${seed}:fallenBeam${i}`),
        { x: p.x, y: beamLen * 0.42, z: p.z, ry: faceRy,
          rz: (i - 1) * 0.30 + (beamRnd() - 0.5) * 0.18 },
      ));
      detail.exposedBeams += 1;
    }

    const toothRnd = Mulberry32(HashString(`${seed}:damageDetail:teeth`));
    for (const side of [-1, 1]) {
      for (let course = 0; course < 5; course += 1) {
        if (course === (side > 0 ? 1 : 3)) continue;
        const p = At(side * (w / 2 - 0.10 - (course % 2) * 0.11), facadeZ + 0.09);
        sink.Add("CityBrickWorn", PlaceGeometry(
          MakeBox(0.34, 0.15, 0.30, TILE_METERS.brick, `${seed}:tooth${side}:${course}`),
          { x: p.x, y: 0.55 + course * 0.17, z: p.z, ry: faceRy,
            rz: (toothRnd() - 0.5) * 0.14 },
        ));
        detail.fractureBricks += 1;
      }
    }
  }

  return detail;
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
 * 硬山屋面的**举折剖面 + 生起**采样器。
 *
 * 中式坡屋顶不是直坡。参考三视图里两件事一眼可辨，而我方原来一件都没有：
 *   ① **举折**：从正脊到檐口是一条凹弧 —— 脊部陡、檐口缓，檐口末端还略微反翘。
 *      直坡屋面在正交立面上是一条死直的斜边，那是仓房不是民居。
 *   ② **生起**：檐口线不是水平直线，两端向上微扬（参考图侧视图里檐口中段下沉、
 *      两端翘起）。少了它，檐口在立面上是一根尺子画出来的横线。
 *
 * 返回 `YAt(u, lx)`：u 沿坡从 0（正脊）到 1（檐口外缘，**含出檐**），lx 是沿面阔的
 * 局部坐标。同一个采样器同时供屋面、山墙顶边和搏风带用 —— 三者必须严格同一条线，
 * 各算各的就会互相穿插。
 */
export function HardRoofSampler({ width, halfDepth, overhang, eaveY, ridgeY }) {
  const rise = Math.max(0.05, ridgeY - eaveY);
  const zEave = halfDepth + overhang;
  const halfW = width / 2 + overhang;
  // 直坡基准：过 (halfDepth, eaveY) 那条线延到檐口外缘
  const riseTot = rise * (zEave / halfDepth);
  // 幅度对着参考图收过：第一版 0.16/0.10/0.14 太猛 —— 山尖成了尖角、檐口甩得
  // 老高，像庙不像民居。参考图那条是**很缓**的凹弧 + 檐口一点点外挑。
  const camber = rise * 0.085;       // 举折下凹量
  const eaveLift = rise * 0.055;     // 檐口反翘
  const endLift = rise * 0.075;      // 生起（两端）
  const EndLift = (lx) => {
    const t = Math.max(0, (Math.abs(lx) - halfW * 0.55) / (halfW * 0.45));
    return endLift * t * t;
  };
  const YAt = (u, lx = 0) => ridgeY
    - riseTot * u
    - camber * Math.sin(Math.PI * Math.max(0, Math.min(1, u)))
    + eaveLift * Math.pow(Math.max(0, u), 3.2)
    + EndLift(lx) * u * u;
  return { YAt, zEave, halfW, rise, riseTot };
}

/**
 * 举折屋面的一片瓦面（含底皮与三条封边）。局部系：x 沿面阔、z 沿进深、y 向上；
 * `side` = +1 / −1 决定往哪一坡铺。整片只受调用处一次 ry。
 */
function MakeHardRoofShell(sampler, {
  width, overhang, side, thickness, tile, seed, cellVisible = null,
  segmentsX = null, segmentsU = null,
}) {
  const { YAt, zEave, halfW } = sampler;
  const NX = segmentsX || Math.max(3, Math.round(width / 2.4));
  const NU = segmentsU || 6;
  const pos = [], uv = [], idxTri = [];
  const jitter = (HashString(seed) % 89) / 89 * 0.27;
  const Push = (a, b, c) => {
    for (const p of [a, b, c]) {
      pos.push(p[0], p[1], p[2]);
      uv.push(p[0] / tile + jitter, (p[2] * side) / tile + jitter);
    }
  };
  const Quad = (a, b, c, d) => { Push(a, b, c); Push(a, c, d); };
  const DoubleEdge = (a, b, a2, b2) => {
    Quad(a, b, b2, a2);
    Quad(a2, b2, b, a);
  };
  const Pt = (i, j, drop = 0) => {
    const lx = -halfW + (halfW * 2 * i) / NX;
    const u = j / NU;
    return [lx, YAt(u, lx) - drop, side * zEave * u];
  };
  const Visible = (i, j) => !cellVisible || cellVisible(i, j, NX, NU);
  for (let i = 0; i < NX; i += 1) {
    for (let j = 0; j < NU; j += 1) {
      if (!Visible(i, j)) continue;
      const a = Pt(i, j), b = Pt(i + 1, j), c = Pt(i + 1, j + 1), d = Pt(i, j + 1);
      if (side > 0) Quad(a, b, c, d); else Quad(a, d, c, b);
      const a2 = Pt(i, j, thickness), b2 = Pt(i + 1, j, thickness);
      const c2 = Pt(i + 1, j + 1, thickness), d2 = Pt(i, j + 1, thickness);
      if (side > 0) Quad(a2, d2, c2, b2); else Quad(a2, b2, c2, d2);
      // 战损坡面每个缺格都补出真实厚度的断口边；边缘双面，侧后视不会因绕到
      // 背面就突然消失。完整屋面不走这里，保持原模型三角形数与外观不变。
      if (cellVisible) {
        if (j > 0 && !Visible(i, j - 1)) DoubleEdge(a, b, a2, b2);
        if (j + 1 < NU && !Visible(i, j + 1)) DoubleEdge(c, d, c2, d2);
        if (i > 0 && !Visible(i - 1, j)) DoubleEdge(d, a, d2, a2);
        if (i + 1 < NX && !Visible(i + 1, j)) DoubleEdge(b, c, b2, c2);
      }
    }
    // 檐口封边（沿坡的斜面，不是竖板 —— 竖板会被 ColliderTest 判成「摸不着的墙」）
    if (Visible(i, NU - 1)) {
      const e0 = Pt(i, NU), e1 = Pt(i + 1, NU);
      const f0 = Pt(i, NU, thickness), f1 = Pt(i + 1, NU, thickness);
      if (side > 0) Quad(e0, e1, f1, f0); else Quad(e0, f0, f1, e1);
    }
  }
  // 两端封边
  for (const i of [0, NX]) {
    const cellI = i === 0 ? 0 : NX - 1;
    for (let j = 0; j < NU; j += 1) {
      if (!Visible(cellI, j)) continue;
      const a = Pt(i, j), b = Pt(i, j + 1);
      const a2 = Pt(i, j, thickness), b2 = Pt(i, j + 1, thickness);
      if (i === 0) Quad(a, b, b2, a2); else Quad(a, a2, b2, b);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

/**
 * 硬山山墙的墙体本身：一片**五边形棱柱**（下方矩形 + 上方三角山尖）。
 *
 * 取代原来「若干段等宽方盒逼近三角形」的做法。那一版在正交侧视图上就是一排
 * 台阶：段数再多也只是把台阶变细，而山尖附近每段的高度差最大，恰恰是最显眼的
 * 地方。搏风带能压住一部分，压不住的仍从压边上沿冒出来。
 *
 * 局部系：厚度沿 x（±thickness/2），进深沿 z（±depth/2），y 向上。
 * UV 一律取 (z, y)/tile —— 山墙是薄片，侧面窄到看不出拉伸，砖缝尺度与
 * 同场景其它砖墙一致（这是 Script_Geo 那条「全场砖缝一样大」的口径）。
 */
export function MakeGablePrism(depth, baseY, eaveY, ridgeY, thickness, tile, seed = "gp",
  zMin = null, zMax = null, topAt = null) {
  const hd = depth / 2, ht = thickness / 2;
  // zMin/zMax：只砌这一段 z。默认整片（−hd…+hd）。
  //
  // 门房那一类「屋面挑出去盖住敞口前廊」的形制要从前檐那头切掉一截，而**切**
  // 和**整体平移**不是一回事：平移会把山尖挪到正脊底下之外，山墙于是从屋面里
  // 斜插出来。切法保持顶边始终贴着同一条屋面剖面 —— 山尖若被切掉，剩下的就是
  // 一段单斜边，这也正是真实做法（前廊那头山墙到此为止，屋面继续挑出去）。
  const z0 = Math.max(-hd, zMin === null ? -hd : zMin);
  const z1 = Math.min(hd, zMax === null ? hd : zMax);
  // topAt：顶边采样。不传就是老的直线剖面；传了就跟着屋面的举折弧走 ——
  // 山墙高出屋面是硬山的定义，那么它的顶边必须**逐点**贴着屋面那条弧，
  // 不能一边是弧一边是直线，否则山墙不是啃进瓦面就是浮在瓦面上方。
  const TopAt = topAt || ((zz) => eaveY + (ridgeY - eaveY) * (1 - Math.abs(zz) / hd));
  const STEPS = topAt ? 14 : 0;                     // 直线剖面不需要细分
  const outline = [[z0, baseY], [z1, baseY]];
  if (STEPS) {
    for (let i = 0; i <= STEPS; i += 1) {
      const zz = z1 + (z0 - z1) * (i / STEPS);
      outline.push([zz, TopAt(zz)]);
    }
  } else {
    outline.push([z1, TopAt(z1)]);
    if (z0 < 0 && z1 > 0) outline.push([0, ridgeY]);
    outline.push([z0, TopAt(z0)]);
  }
  const pos = [], uv = [], nrm = [];
  const jitter = (HashString(seed) % 97) / 97 * 0.31;      // 与邻墙错开砖缝起点
  const U = (z, y) => [z / tile + jitter, y / tile + jitter];
  const Tri = (a, b, c, n) => {
    for (const p of [a, b, c]) {
      pos.push(p[0], p[1], p[2]);
      const t = U(p[2], p[1]);
      uv.push(t[0], t[1]);
      nrm.push(n[0], n[1], n[2]);
    }
  };
  // 两片端面。**不用扇形三角化** —— 顶边跟着举折弧细分之后这个多边形不再是凸的，
  // 扇形会翻面。改成「沿 z 逐段的梯形带」：每一段都是 (z_i,base)-(z_{i+1},base)-
  // (z_{i+1},top)-(z_i,top)，对任何单值顶边剖面都成立。
  const tops = outline.slice(2);                    // 顶边点（按 z 从 z1 到 z0）
  for (const side of [1, -1]) {
    const xs = side * ht;
    for (let i = 0; i < tops.length - 1; i += 1) {
      const zA = tops[i][0], yA = tops[i][1];
      const zB = tops[i + 1][0], yB = tops[i + 1][1];
      const a = [xs, baseY, zA], b = [xs, baseY, zB];
      const c = [xs, yB, zB], d = [xs, yA, zA];
      if (side > 0) { Tri(a, b, c, [1, 0, 0]); Tri(a, c, d, [1, 0, 0]); }
      else { Tri(a, c, b, [-1, 0, 0]); Tri(a, d, c, [-1, 0, 0]); }
    }
  }
  // 侧棱面（底、两竖边、顶边逐段）
  const rim = [[z0, baseY], [z1, baseY], ...tops];
  for (let i = 0; i < rim.length; i += 1) {
    const p0 = rim[i], p1 = rim[(i + 1) % rim.length];
    const dz = p1[0] - p0[0], dy = p1[1] - p0[1];
    const len = Math.hypot(dz, dy) || 1;
    const n = [0, dz / len, -dy / len];
    const a = [ht, p0[1], p0[0]], b = [ht, p1[1], p1[0]];
    const c = [-ht, p1[1], p1[0]], d = [-ht, p0[1], p0[0]];
    Tri(a, b, c, n); Tri(a, c, d, n);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(nrm, 3));
  return g;
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
  baseY = 0, far = false, copeCut = 0, topAt = null, copeScale = 1,
}) {
  // copeCut：山墙被切掉的那一截（前廊那一头）。压边只铺山墙还在的部分，
  // 碱脚同理 —— 否则会有一条压边悬在敞口前廊的空气里。
  const rise = Math.max(0.05, ridgeY - eaveY);
  const halfDepth = depth / 2;
  const angle = Math.atan2(rise, halfDepth);
  const slopeLen = Math.hypot(halfDepth, rise);
  // 压边比墙身厚 0.14 m：两侧各挑出 0.07 m，正好把阶梯边缘盖死。
  const copeW = wallThickness + 0.14;
  // 民居那条压边很肥；门房／铺房那一类参考图里是很细的一道，靠 copeScale 分开。
  const copeH = (far ? 0.16 : 0.26) * copeScale;
  const pieces = [];

  if (coping) {
    // 沿举折弧**扫掠**出一条压边。参考图里这条是一条光滑的厚瓦带，顺着山墙顶边的
    // 凹弧一路下来、到檐口处外挑。
    // **不要拿一段段旋转的方盒去拼**（第一版就是）：相邻盒子的角互相戳出来，
    // 正交立面上是一排锯齿，跟「光滑厚带」正相反。
    const SEG = 18;
    const hd = halfDepth;
    const Top = topAt || ((zz) => eaveY + rise * (1 - Math.abs(zz) / hd));
    const hw = copeW / 2, hh = copeH / 2;
    const Sweep = (s) => {
      const pos = [], uvA = [];
      const Ring = (t) => {
        const zz = s * hd * t * 1.045;                 // 末端略微出挑
        return { z: zz, y: Top(s * hd * Math.min(1, t)) + hh * 0.7 };
      };
      const Quad = (a, b, c, d) => {
        for (const q of [[a, b, c], [a, c, d]]) {
          for (const v of q) { pos.push(v[0], v[1], v[2]); uvA.push(v[2] / TILE_METERS.roof, v[1] / TILE_METERS.roof); }
        }
      };
      for (let i = 0; i < SEG; i += 1) {
        const r0 = Ring(i / SEG), r1 = Ring((i + 1) / SEG);
        // 四个角：±x（厚度）× ±y（高度）
        const A0 = [-hw, r0.y + hh, r0.z], B0 = [hw, r0.y + hh, r0.z];
        const C0 = [hw, r0.y - hh, r0.z], D0 = [-hw, r0.y - hh, r0.z];
        const A1 = [-hw, r1.y + hh, r1.z], B1 = [hw, r1.y + hh, r1.z];
        const C1 = [hw, r1.y - hh, r1.z], D1 = [-hw, r1.y - hh, r1.z];
        Quad(A0, B0, B1, A1);                          // 顶
        Quad(D0, D1, C1, C0);                          // 底
        Quad(A0, A1, D1, D0);                          // 外侧
        Quad(B0, C0, C1, B1);                          // 内侧
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute("uv", new THREE.Float32BufferAttribute(uvA, 2));
      g.computeVertexNormals();
      return g;
    };
    for (const s of [-1, 1]) {
      if (copeCut > 0.05 && s > 0) continue;
      pieces.push(Sweep(s));
      // 檐口那一头的挑头 + **墀头**。
      // 参考图里这块收头不是悬空的：它坐在一段自墙面逐皮外挑的砖上（墀头），
      // 三皮砖一皮比一皮出挑，把收头接回墙身。没有墀头，收头在正交立面上就是
      // 一块飘在墙角外的砖 —— 我的前一版正是这样。
      const zT = s * hd * 1.045, yT = Top(s * hd);
      for (let k = 0; k < 3; k += 1) {
        pieces.push(PlaceGeometry(
          MakeBox(wallThickness + 0.03 + 0.05 * k, 0.13, 0.26 + 0.09 * k,
            TILE_METERS.brick, `${seed}:chitou${s}${k}`),
          { y: yT - 0.07 - 0.13 * (2 - k), z: s * hd + s * 0.03 * k }));
      }
      pieces.push(PlaceGeometry(
        MakeBox(copeW + 0.14, copeH * 1.25, 0.30, TILE_METERS.roof, `${seed}:copeEnd${s}`),
        { y: yT + copeH * 0.6, z: zT + s * 0.06 }));
    }
  }
  if (pieces.length) {
    sink.Add(copingMaterial, PlaceGeometry(MergeGeometries(pieces), { x, y: 0, z, ry }));
  }

  // 山尖圆气孔：真是个洞，所以用一段**比墙厚一点**的深色圆柱穿过去 —— 白盒阶段
  // 不给土坯/砖山墙掏洞（掏洞要把山墙拆成上下两段，中景看不出来还贵）。
  if (vent && !far) {
    const g = new THREE.CylinderGeometry(0.17, 0.17, wallThickness + 0.06, 12);
    g.rotateZ(Math.PI / 2);                                  // 轴线转成沿局部 x（穿墙）
    const topMid = (topAt ? topAt(0) : ridgeY);
    sink.Add(ventMaterial, PlaceGeometry(g, {
      x, y: eaveY + (topMid - eaveY) * 0.55, z, ry,
    }));
  }

  // 条石碱脚：墙脚一圈浅色过墙石。照片里它是山墙上明度最高的一条，
  // 也是「这堵墙站在地上」的唯一交代。
  if (plinth) {
    // 剩下那一段的中心在局部 z = −copeCut/2，标准旋转后是世界 (−sin, −cos)·(cut/2)。
    const pd = Math.max(0.2, depth - copeCut);
    sink.Add(plinthMaterial, PlaceGeometry(
      MakeBox(wallThickness + 0.08, 0.42, pd + 0.1, TILE_METERS.stone, `${seed}:plinth`),
      {
        x: x - Math.sin(ry) * (copeCut / 2), y: baseY + 0.21,
        z: z - Math.cos(ry) * (copeCut / 2), ry,
      }));
  }
}

/**
 * 硬山屋顶：两坡瓦面 + 正脊 + 出檐 + 两端高出屋面的山墙。
 * 坡度 26°—29°，出檐 0.45 m —— 檐口那一圈阴影是"中式房子"最强的识别特征。
 */
export function AddHardMountainRoof(sink, {
  x, z, width, depth, eaveY, ridgeY, ry = 0, seed = "r", ruined = false, burnt = false,
  rafters = true, baseY = 0, overhang = 0.45, gableDepth = null, copeScale = 1,
  gableVent = true,
}) {
  // gableDepth：山墙只砌这么深，默认与屋面同深。门房那一类「屋面挑出去盖住
  // 敞口前廊、廊两侧是通透的」的形制，山墙**不能**跟着屋面一路包到前檐 ——
  // 包过去前廊就成了封闭房间，参考图里那根独立砖墩也就无处可站。
  // baseY：山墙从哪一层砌起。坡面与正脊本来就吃绝对的 eaveY/ridgeY，只有山墙
  // 是「从 0 一路砌到山尖」的整块——放到城墙顶上时它会一直垂到地面。
  //
  // overhang 从写死改成参数：门房那一类「深挑檐落在砖墩上」的形制，出檐是它
  // 最强的识别特征，0.45 m 撑不起来。
  //
  // 屋面厚度：0.12 m 的瓦板在正交立面上只是一条线，屋面读不出厚度。加厚到 0.26。
  // **不要改回「檐口挂一条竖直封边板」那个做法** —— 试过，ColliderTest 直接红：
  // 那是一块竖直的、檐口高度的、没有碰撞体的板，正中「看得见的墙、摸不着」。
  // 屋面坡板同样没有碰撞却不报，因为它是斜面；判据看的是竖面。
  const rise = ridgeY - eaveY;
  const halfDepth = depth / 2;
  const slopeLen = Math.hypot(halfDepth, rise);
  const angle = Math.atan2(rise, halfDepth);
  const tileMat = burnt ? "BrickWallSooty" : "RoofTile";
  const partialRuin = ruined === "partial";

  const sampler = HardRoofSampler({ width, halfDepth, overhang, eaveY, ridgeY });
  if (!ruined) {
    for (const side of [-1, 1]) {
      sink.Add(tileMat, PlaceGeometry(
        MakeHardRoofShell(sampler, {
          width, overhang, side, thickness: 0.26,
          tile: TILE_METERS.roof, seed: `${seed}:s${side}`,
        }),
        { x, y: 0, z, ry }));
      // 檐口下的椽子：一排小方料，逆光时是一条整齐的锯齿阴影。
      // 椽头跟着举折走，不再按一个固定倾角摆 —— 直坡时代那个角度在弧面下会翘起来。
      const rafterCount = Math.max(4, Math.round(width / 0.42));
      const uA = (halfDepth * 0.86) / sampler.zEave;
      const uB = (halfDepth * 1.02) / sampler.zEave;
      for (let i = 0; rafters && i < rafterCount; i += 1) {
        const lx = -width / 2 + (i + 0.5) * (width / rafterCount);
        const yA = sampler.YAt(uA, lx), yB = sampler.YAt(uB, lx);
        const zA = side * sampler.zEave * uA, zB = side * sampler.zEave * uB;
        const len = Math.hypot(zB - zA, yB - yA);
        const cxl = lx, cyl = (yA + yB) / 2 - 0.10, czl = (zA + zB) / 2;
        sink.Add("WoodBeam", PlaceGeometry(
          MakeBox(0.07, 0.09, len, TILE_METERS.wood, `${seed}:rf${side}${i}`),
          {
            x: x + Math.cos(ry) * cxl + Math.sin(ry) * czl,
            y: cyl,
            z: z - Math.sin(ry) * cxl + Math.cos(ry) * czl,
            ry, rx: Math.atan2(yB - yA, Math.abs(zB - zA)) * -side,
          }));
      }
    }
    // 瓦垄：参考图侧视图上一排竖向的垄非常清楚，只靠贴图读不出来。
    // 沿举折弧铺细棱，每根两段（一段的话中段会离开弧面）。
    if (rafters) {
      const rows = Math.max(5, Math.round(width / 0.48));
      for (const side of [-1, 1]) {
        for (let i = 0; i <= rows; i += 1) {
          const lx = -sampler.halfW + (sampler.halfW * 2 * i) / rows;
          const At = (u) => {
            const zz = side * sampler.zEave * u;
            return [x + Math.cos(ry) * lx + Math.sin(ry) * zz,
              sampler.YAt(u, lx) + 0.10,
              z - Math.sin(ry) * lx + Math.cos(ry) * zz];
          };
          // 檐口瓦头（滴水）：参考图檐口下缘是一排小圆头，不是一条光边。
          const tip = At(1);
          sink.Add(tileMat, PlaceGeometry(
            MakeBox(0.115, 0.10, 0.13, TILE_METERS.roof, `${seed}:瓦头${side}${i}`),
            { x: tip[0], y: tip[1] - 0.035, z: tip[2], ry }));
          for (let k = 0; k < 2; k += 1) {
            const a = At(k / 2), b = At((k + 1) / 2);
            sink.Add(tileMat, PlaceGeometry(
              MakeBox(0.07, 0.065, Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]),
                TILE_METERS.roof, `${seed}:垄${side}${i}${k}`),
              {
                x: (a[0] + b[0]) / 2, y: (a[1] + b[1]) / 2, z: (a[2] + b[2]) / 2, ry,
                // rx 是 **+side**：这里的 At() 走标准映射（+sin·zz），不是屋面壳内部
                // 那套负号映射。取反会让垄朝反方向倾，在山墙外戳成一排尖刺。
                rx: side * Math.atan2(a[1] - b[1], Math.hypot(b[0] - a[0], b[2] - a[2])),
              }));
          }
        }
      }
    }
    // 正脊：小青瓦逐层叠砌，做成一条略高的带
    sink.Add(tileMat, PlaceGeometry(
      MakeBox(width + overhang * 2, 0.22, 0.38, TILE_METERS.roof, `${seed}:ridge`),
      { x, y: ridgeY + 0.07, z, ry }));
  } else if (partialRuin) {
    // 预建模严重档只掀掉一坡：另一坡与两山墙仍保留，玩家才能
    // 一眼认出这是原来那栋房，而不是切状态时换了一只废墟模型。
    const survivingSide = (HashString(`${seed}:survivingSlope`) & 1) ? 1 : -1;
    const missingSide = -survivingSide;
    sink.Add(tileMat, PlaceGeometry(
      MakeHardRoofShell(sampler, {
        width, overhang, side: survivingSide, thickness: 0.26,
        tile: TILE_METERS.roof, seed: `${seed}:partialSlope`,
      }),
      { x, y: 0, z, ry },
    ));
    sink.Add(tileMat, PlaceGeometry(
      MakeHardRoofShell(sampler, {
        width, overhang, side: missingSide, thickness: 0.26,
        tile: TILE_METERS.roof, seed: `${seed}:damagedSlope`, segmentsX: 12, segmentsU: 10,
        cellVisible: (i, j, nx, nu) => {
          const ax = ((i + 0.5) / nx) * 2 - 1;
          const au = (j + 0.5) / nu;
          const holeA = ((ax + 0.18) / 0.60) ** 2 + ((au - 0.46) / 0.38) ** 2 < 1;
          const holeB = ((ax - 0.58) / 0.43) ** 2 + ((au - 0.78) / 0.29) ** 2 < 1;
          const holeC = ((ax + 0.72) / 0.30) ** 2 + ((au - 0.16) / 0.21) ** 2 < 1;
          return !(holeA || holeB || holeC);
        },
      }),
      { x, y: 0, z, ry },
    ));

    // 破坡下的断椽必须仍沿同一条举折曲线。旧版把几根长盒子放在屋心、再给一个
    // 经验旋角：每根都会跨过 z=0，另一端从幸存瓦面里穿出来。这里从缺失坡上的
    // 两个采样端点反求中心和倾角，且整体下沉到瓦皮以下；不再生成会横切弧面的
    // “断脊盒”，脊上的残瓦由战损细节层的 roofFragments 表达。
    const rnd = Mulberry32(HashString(`${seed}:partialRafters`));
    const rafterCount = Math.max(4, Math.round(width / 1.7));
    for (let i = 0; i < rafterCount; i += 1) {
      const lx = -width * 0.43 + (i + 0.5) * (width * 0.86 / rafterCount);
      const uA = 0.05 + rnd() * 0.08;
      const uB = 0.68 + rnd() * 0.24;
      const zA = missingSide * sampler.zEave * uA;
      const zB = missingSide * sampler.zEave * uB;
      const yA = sampler.YAt(uA, lx) - 0.18;
      const yB = sampler.YAt(uB, lx) - 0.18;
      const len = Math.hypot(zB - zA, yB - yA);
      const cz = (zA + zB) / 2;
      sink.Add(i % 3 === 2 ? "Charred" : "WoodBeam", PlaceGeometry(
        MakeBox(0.14, 0.12, len, TILE_METERS.wood, `${seed}:partialBeam${i}`),
        {
          x: x + Math.cos(ry) * lx + Math.sin(ry) * cz,
          y: (yA + yB) / 2,
          z: z - Math.sin(ry) * lx + Math.cos(ry) * cz,
          ry,
          rx: Math.atan2(yB - yA, Math.abs(zB - zA)) * -missingSide,
        },
      ));
    }
  } else {
    // 塌掉的屋面：梁架从墙头向屋内/地面倾倒。旧版把中心钉在 ridgeY 附近，
    // 墙已经削低、梁却整根悬在空中；这里让每根至少有一端落到残墙高度。
    const rnd = Mulberry32(HashString(`${seed}:col`));
    for (let i = 0; i < 5; i += 1) {
      const lx = -width / 2 + (i + 0.5) * (width / 5);
      const beamLen = depth * (0.5 + rnd() * 0.5);
      const fall = (rnd() - 0.5) * 0.92;
      sink.Add("WoodBeam", PlaceGeometry(
        MakeBox(0.16, 0.14, beamLen, TILE_METERS.wood, `${seed}:bm${i}`),
        {
          x: x + Math.cos(ry) * lx, y: eaveY * (0.52 + rnd() * 0.24),
          z: z - Math.sin(ry) * lx, ry, rx: fall, rz: (rnd() - 0.5) * 0.28,
        }));
    }
  }

  // 山墙：硬山的两端墙体高出屋面，这是"硬山"二字的由来。
  // 一整片五边形棱柱，不再拿方盒堆台阶（见 MakeGablePrism 头注）。
  for (const s of [-1, 1]) {
    const gd = Math.min(depth, gableDepth || depth);
    // 山墙比屋面浅时，它靠**后**对齐（前廊那一头让开）：局部 z 取负是「朝前」，
    // 所以山墙中心要往 −z 之外、也就是世界侧的 +cos(ry) 方向挪半个差值。
    // 前廊那一头把山墙切掉 cut 米。
    // **注意别跟着坡面盒那套走**：坡面盒用的是内部的负号映射 (−sin·cz, −cos·cz)，
    // 而山墙棱柱是整片只吃一次 ry 的标准旋转，它的局部 +z 就是调用方的 +z ——
    // 也就是前廊那一头。所以切的是 **zMax**。
    const cut = depth - gd;
    const gx = s * (width / 2 + 0.15);
    // 山墙顶边逐点贴着屋面那条举折弧（在山墙自己那个 x 上取样，生起也一并吃到）。
    const gTop = (zz) => sampler.YAt(Math.abs(zz) / sampler.zEave, gx) + 0.02;
    const merged = MakeGablePrism(depth, baseY, eaveY, ridgeY, 0.30,
      TILE_METERS.brick, `${seed}:g${s}`, -depth / 2, depth / 2 - cut, gTop);
    const gwx = x + Math.cos(ry) * gx;
    const gwz = z - Math.sin(ry) * gx;
    sink.Add(burnt ? "BrickWallSooty" : "BrickWall", PlaceGeometry(merged, {
      x: gwx, y: 0, z: gwz, ry,
    }));
    // 搏风带 / 气孔 / 碱脚。塌顶的房子压边照样在（砖脊比瓦面耐炸），
    // 但不给它气孔 —— 山墙已经缺了口，再穿一个圆洞就成筛子了。
    AddGableTrim(sink, {
      x: gwx, z: gwz, ry, depth, eaveY, ridgeY, baseY, seed: `${seed}:gt${s}`,
      topAt: gTop, copeScale,
      // 前廊那一头山墙被切掉了，压边也跟着只铺剩下的那一坡。
      copeCut: cut > 0.05 ? cut : 0,
      wallThickness: 0.30, vent: gableVent && !ruined,
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
    gateSide = "south", damageProfile = null,
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
      AddGatehouse(sink, {
        x: wx, z: wz, ry, seed: `${seed}:gh`, damage, burnt, damageProfile, openW,
      });
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
  // 体量档与 CityBlockKit 的 HOUSE_DEPTH_K / HOUSE_EAVE_LIFT 一致：照 AI 还原
  // 三视图那栋「进深约 4.2、檐高约 3.15 的小高房」。两边必须同调 —— 同一条街上
  // 一半院子是 AddCompound 建的、一半是 CityBlockKit 建的。
  const mainD = (4.6 + rnd() * 1.2) * 0.85;              // 进深收到 3.9—4.9 m
  const eave = 2.45 + rnd() * 0.3 + 0.58;                // 檐口抬到 3.0—3.3 m
  const ridge = eave + mainD * 0.5 * Math.tan(THREE.MathUtils.degToRad(34));
  const [mx, mz] = L(0, -depth / 2 + mainD / 2 + 0.4);
  AddRoomBlock(sink, {
    x: mx, z: mz, ry, width: mainW, depth: mainD, eaveY: eave, ridgeY: ridge,
    seed: `${seed}:main`, damage, burnt, damageProfile, facing: 1, bays: 3,
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
      damage: Clamp(damage + rnd() * 0.2, 0, 1), burnt, damageProfile, facing: side, bays: 2,
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
    facing = 1, bays = 3, roofRafters = true, damageProfile = null,
    // 门板："random" 抽签（旧行为）｜"shut" 恒关｜"none" 恒开。
    // 可进入的屋子必须传 "none"：抽中关门时门板无碰撞，人穿板而过（WP-D2 取证）。
    doorLeaf = "random",
  } = spec;
  const rnd = Mulberry32(HashString(`${seed}:rb`));
  const wallMat = burnt ? "BrickWallSooty" : "BrickWall";
  const cos = Math.cos(ry), sin = Math.sin(ry);
  const L = (lx, lz) => [x + cos * lx - sin * lz, z - sin * lx - cos * lz];
  const collapsed = damage > 0.62;
  const catastrophic = damage > 0.94 && !damageProfile;
  // 严重档固定打掉朝院立面的一侧窗间墙。避开明间门洞，否则“多一个洞”只会
  // 落在本来就是空的地方，轮廓几乎不变；左右由 seed 决定，同一建筑不会跳变。
  const breachBay = bays > 1
    ? (HashString(`${seed}:facadeBreach`) & 1 ? 0 : bays - 1)
    : 0;

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
        ry: ry + f.rot,
        ruin: i >= 2 ? damage * (catastrophic ? 0.98 : 0.85) : (collapsed ? damage * (catastrophic ? 0.90 : 0.72) : 0),
        seed: `${seed}:f${i}`,
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
      // 初损保留上一版的一侧破口；新严重档把两侧次间都打穿，形成真正的双缺口。
      const breachThisBay = collapsed && !isDoor && (catastrophic || b === breachBay);
      // 门/窗两侧的墙垛
      const pierW = (bayW - (isDoor ? 1.25 : 1.05)) / 2;
      for (const s2 of [-1, 1]) {
        // 只拿掉靠外的一根墙垛，另一根仍保留齿状断边；整开间全删会像布尔切出的方洞。
        if (breachThisBay && s2 === (breachBay === 0 ? -1 : 1)) continue;
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
        if (!breachThisBay) {
          sink.Add(wallMat, PlaceGeometry(MakeBox(1.05, sillY, 0.36, TILE_METERS.brick, `${seed}:sl${b}`),
            { x: bx, y: sillY / 2, z: bz, ry: ry + f.rot }));
          sink.Add(wallMat, PlaceGeometry(
            MakeBox(1.05, Math.max(0.1, eaveY - sillY - winH), 0.36, TILE_METERS.brick, `${seed}:hd${b}`),
            { x: bx, y: sillY + winH + Math.max(0.1, eaveY - sillY - winH) / 2, z: bz, ry: ry + f.rot }));
        }
        if (damage < 0.55 && !breachThisBay) {
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
        if (!breachThisBay) {
          const rot2 = ry + f.rot;
          sink.Solid(bx, sillY / 2, bz, 0.6, sillY / 2, 0.25, "wall", rot2);
          const headY = sillY + winH;
          if (eaveY - headY > 0.1) {
            sink.Solid(bx, (headY + eaveY) / 2, bz, 0.6, (eaveY - headY) / 2, 0.25, "wall", rot2);
          }
        }
      }
    }
  }

  AddHardMountainRoof(sink, {
    x, z, width, depth, eaveY, ridgeY, ry, seed: `${seed}:roof`,
    ruined: damageProfile === "severe" ? "partial" : collapsed,
    burnt, rafters: roofRafters,
  });

  // 塌了的房子脚下有一堆瓦砾，没有的话看起来像被橡皮擦掉的
  if (collapsed) {
    sink.props.push({ kind: "rubblePile", x, z,
      radius: Math.max(width, depth) * (damageProfile === "severe" ? 0.32 : 0.45),
      seed: `${seed}:rp` });
    if (catastrophic) {
      const [spillX, spillZ] = L(width * 0.22, depth * facing * 0.38);
      sink.props.push({ kind: "rubblePile", x: spillX, z: spillZ,
        radius: Math.max(width, depth) * 0.34, seed: `${seed}:rpSecond` });
    }
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
export function AddGatehouse(sink, {
  x, z, ry, seed, damage = 0, burnt = false, damageProfile = null, openW = 1.5,
}) {
  const h = 3.6;
  const mat = burnt ? "BrickWallSooty" : "BrickWall";
  const cos = Math.cos(ry), sin = Math.sin(ry);
  const rnd = Mulberry32(HashString(`${seed}:gateDamage`));
  const collapsed = damage > 0.62;
  const catastrophic = damage > 0.94;
  // 两根门垛
  for (const s of [-1, 1]) {
    const lx = s * (openW / 2 + 0.28);
    const pierH = catastrophic
      ? h * (0.30 + rnd() * 0.22)
      : (collapsed ? h * (0.54 + rnd() * 0.22) : h);
    sink.Add(mat, PlaceGeometry(MakeBox(0.56, pierH, 0.72, TILE_METERS.brick, `${seed}:pier${s}`),
      { x: x + cos * lx, y: pierH / 2, z: z - sin * lx, ry, rz: collapsed ? s * 0.025 : 0 }));
    sink.Solid(x + cos * lx, pierH / 2, z - sin * lx, 0.32, pierH / 2, 0.4, "wall", ry);
    // 门墩石
    sink.Add("Stone", PlaceGeometry(MakeBox(0.42, 0.52, 0.42, TILE_METERS.stone, `${seed}:dun${s}`),
      { x: x + cos * (lx + s * 0.16), y: 0.26, z: z - sin * (lx + s * 0.16), ry }));
  }
  // 门额与小瓦顶
  if (!collapsed) {
    sink.Add("WoodBeam", PlaceGeometry(MakeBox(openW + 1.2, 0.26, 0.8, TILE_METERS.wood, `${seed}:lin`),
      { x, y: 2.32, z, ry }));
    sink.Add(mat, PlaceGeometry(MakeBox(openW + 1.2, h - 2.58, 0.62, TILE_METERS.brick, `${seed}:up`),
      { x, y: 2.58 + (h - 2.58) / 2, z, ry }));
  } else {
    // 门额不是整根蒸发：一截还卡在门垛上，一截斜落下来，砖额只剩一侧断块。
    for (const s of [-1, 1]) {
      sink.Add(s > 0 ? "Charred" : "WoodBeam", PlaceGeometry(
        MakeBox(openW * 0.56, 0.22, 0.52, TILE_METERS.wood, `${seed}:brokenLin${s}`),
        { x: x + cos * s * openW * 0.25, y: 2.12 - (s > 0 ? 0.36 : 0),
          z: z - sin * s * openW * 0.25, ry, rz: s * (0.16 + rnd() * 0.12) },
      ));
    }
    if (!catastrophic) {
      const upperX = x + cos * -openW * 0.30;
      const upperZ = z - sin * -openW * 0.30;
      sink.Add(mat, PlaceGeometry(
        MakeBox(openW * 0.62, 0.62, 0.62, TILE_METERS.brick, `${seed}:upperRemnant`),
        { x: upperX, y: 2.68, z: upperZ, ry, rz: -0.08 },
      ));
    }
  }
  if (damage < 0.6 || damageProfile === "severe") {
    const roofY = damageProfile === "severe" ? h * 0.78 : h + 0.28;
    for (const s of [-1, 1]) {
      if (damageProfile === "severe" && s > 0) continue;
      sink.Add(burnt ? "BrickWallSooty" : "RoofTile", PlaceGeometry(
        MakeBox(openW + 2.0, 0.11, 0.62, TILE_METERS.roof, `${seed}:rf${s}`),
        { x, y: roofY, z: z - cos * s * 0.28, ry, rx: -s * 0.46 }));
    }
    if (damageProfile !== "severe") {
      sink.Add("RoofTile", PlaceGeometry(MakeBox(openW + 2.1, 0.16, 0.24, TILE_METERS.roof, `${seed}:rdg`),
        { x, y: h + 0.5, z, ry }));
    }
  }
  // 门洞的里子：门槛 + 门道墁地 + 木框。没有它，门楼在街景里就是一个纯黑方块
  AddDoorReveal(sink, {
    x, z, ry, openW, openH: 2.18, depth: 2.1, seed: `${seed}:rv`, jamb: !collapsed,
  });
  // 门板（一扇歪着，一扇掉了——打了半个月的镇子不会有齐整的门）
  if (damage < 0.75) {
    sink.Add("WoodDoor", PlaceGeometry(MakeBox(openW / 2 - 0.04, 2.15, 0.07, TILE_METERS.wood, `${seed}:d0`),
      { x: x + cos * (-openW / 4), y: 1.08, z: z - sin * (-openW / 4), ry }));
    if (damage < 0.35) {
      sink.Add("WoodDoor", PlaceGeometry(MakeBox(openW / 2 - 0.04, 2.15, 0.07, TILE_METERS.wood, `${seed}:d1`),
        { x: x + cos * (openW / 4), y: 1.08, z: z - sin * (openW / 4), ry: ry + 0.55 }));
    }
  }
  if (catastrophic) {
    sink.props.push({ kind: "rubblePile", x, z, radius: openW * 1.25, seed: `${seed}:gateCollapse` });
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
  const ridgeY = eaveY + roofDepth * 0.5 * Math.tan(THREE.MathUtils.degToRad(34));

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
    // 墩础：一块比墩大一圈的石座。参考图里砖墩上下各一块石头，正交平光下
    // 「墩」与身后同色的砖墙全靠这一深一浅两条边分开 —— 没有它两者糊成一片。
    sink.Add("CrossStone", PlaceGeometry(
      MakeBox(0.78, 0.30, 0.78, TILE_METERS.stone, `${seed}:pierBase${s}`),
      { x: p.x, y: baseY + 0.15, z: p.z, ry }));
    sink.Add("CrossStone", PlaceGeometry(
      MakeBox(0.74, 0.14, 0.74, TILE_METERS.stone, `${seed}:pierCap${s}`),
      { x: p.x, y: baseY + bodyH + 0.07, z: p.z, ry }));
  }
  // 墩间的额枋：一根木梁把两墩连起来，檐口的重量由它转到墩上。
  // **只跨在两墩之间**，不通到山墙外 —— 旧版是一根通宽大木板横在檐下，正交
  // 正视图上像给房子系了条腰带，参考图那里是一根收在墩内的梁。
  const beamSpan = pierSide * 2 + 0.62;
  const beam = L(0, pierZ);
  sink.Add("WoodBeam", PlaceGeometry(
    MakeBox(beamSpan, 0.24, 0.28, TILE_METERS.wood, `${seed}:archi`),
    { x: beam.x, y: baseY + bodyH + 0.20, z: beam.z, ry }));
  // 墩顶斗块：额枋与檐口之间的一对方块。参考图正视图里，墩头到檐口不是一刀切，
  // 中间垫着一层比墩窄、比枋厚的墩子，出檐才「有东西托着」。
  for (const s of [-1, 1]) {
    const p = L(s * pierSide, pierZ);
    sink.Add("WoodBeam", PlaceGeometry(
      MakeBox(0.46, 0.24, 0.46, TILE_METERS.wood, `${seed}:dou${s}`),
      { x: p.x, y: baseY + bodyH + 0.44, z: p.z, ry }));
  }

  // --- 正面：门洞占满两墩之间 ---
  //
  // 旧版门洞净宽写死 1.6 m，于是 4.4 m 面阔的门房正视图变成「一大片砖墙中间
  // 开个小门」，而参考图是 **墩 ｜ 大门洞 ｜ 墩**：两墩之间几乎全是洞，车马从
  // 中间过。这一形制的门房本来就是过道，不是住人的屋子。
  // 门洞正好占满两墩之间：openW = width − 2×墩宽。留宽了，墩后那截退进去的墙会
  // 从墩边露出来，正视图上两侧就成了「一大片灰砖」而不是「一根墩」。
  const openW = Math.max(1.4, width - 1.24);
  const segLen = (width - openW) / 2;
  const doorH = Math.max(2.15, bodyH - 0.45);
  if (segLen > 0.12) {
    for (const s of [-1, 1]) {
      Slab(L(s * (openW / 2 + segLen / 2), depth / 2), segLen,
        bodyH * (1 - damage * 0.35), t, 0, `f${s}`);
    }
  }
  const head = L(0, depth / 2);
  sink.Add("WoodBeam", PlaceGeometry(
    MakeBox(openW + 0.4, 0.24, t + 0.06, TILE_METERS.wood, `${seed}:lintel`),
    { x: head.x, y: baseY + doorH + 0.12, z: head.z, ry }));
  const overH = Math.max(0.08, bodyH - doorH - 0.24);
  if (overH > 0.1) {
    sink.Add(wallMat, PlaceGeometry(
      MakeBox(openW, overH, t, TILE_METERS.brick, `${seed}:overDoor`, BRICK_UV_GRID),
      { x: head.x, y: baseY + doorH + 0.24 + overH / 2, z: head.z, ry }));
    sink.Solid(head.x, baseY + doorH + 0.24 + overH / 2, head.z,
      openW / 2, overH / 2, t / 2, tag, ry);
  }
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
    // 深挑檐是这一形制的命根子：檐口要越过砖墩挑出去，正面才读成「墩托着一片
    // 大屋檐」而不是「墙上盖了块板」。0.45 m 的通用出檐在这里明显不够。
    overhang: 0.72,
    // 山墙只砌主体那一段，前廊两侧敞着 —— 参考图侧视图里那根砖墩是独立站在
    // 山墙之外的，山墙若跟着屋面包过去，前廊就变成了封闭房间。
    gableDepth: depth,
    // 这一形制的山墙压边比民居细得多（参考三视图侧视图里只是一道薄边），
    // 而且**没有圆气孔** —— 铺房那张参考图的山墙是素的，气孔是民居的做法。
    copeScale: 0.62,
    gableVent: false,
  });
  return { ridgeY, eaveY };
}

/** 水井：石砌井口，井栏外径 0.8—1.0 m、高 0.4—0.6 m。 */
export function AddWell(sink, x, z) {
  // 井筒故意是开口几何；WellStone 材质为双面，确保从井口往下看时内壁不会
  // 因背面剔除消失。井圈补一只实体 torus，把零厚度的圆柱边缘藏起来。
  const g = new THREE.CylinderGeometry(0.48, 0.52, 0.52, 24, 1, true);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i += 1) uv.setXY(i, uv.getX(i) * 2.2, uv.getY(i) * 0.4);
  sink.Add("WellStone", PlaceGeometry(g, { x, y: 0.26, z }));
  const lip = new THREE.TorusGeometry(0.5, 0.055, 8, 24);
  lip.rotateX(Math.PI / 2);
  sink.Add("WellStone", PlaceGeometry(lip, { x, y: 0.52, z }));
  const depth = new THREE.CircleGeometry(0.405, 24);
  depth.rotateX(-Math.PI / 2);
  sink.Add("WellDepth", PlaceGeometry(depth, { x, y: 0.08, z }));
  sink.Solid(x, 0.26, z, 0.55, 0.26, 0.55, "prop");
  sink.Cover(x, z, 0.52, 0, 1);
}

export function AddMillstone(sink, x, z, seed = "ms") {
  const base = new THREE.CylinderGeometry(0.52, 0.55, 0.18, 18);
  sink.Add("Millstone", PlaceGeometry(base, { x, y: 0.09, z }));
  const top = new THREE.CylinderGeometry(0.44, 0.44, 0.16, 18);
  sink.Add("Millstone", PlaceGeometry(top, { x, y: 0.26, z, ry: HashString(seed) % 100 / 100 }));
  sink.Solid(x, 0.17, z, 0.55, 0.17, 0.55, "prop");
}

export function AddWaterVat(sink, x, z, seed = "vat") {
  // 水缸是敞口旋转体，不是上下一样粗的管子。材质为双面、口沿为实体，镜头
  // 从缸口上方或旋到背后都能读到内壁；水面把空心圆筒底下的地面遮住。
  const profile = [
    new THREE.Vector2(0.33, 0.00),
    new THREE.Vector2(0.38, 0.08),
    new THREE.Vector2(0.45, 0.28),
    new THREE.Vector2(0.46, 0.56),
    new THREE.Vector2(0.42, 0.72),
    new THREE.Vector2(0.40, 0.78),
  ];
  const g = new THREE.LatheGeometry(profile, 24);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i += 1) uv.setXY(i, uv.getX(i) * 2.0, uv.getY(i) * 0.7);
  sink.Add("WaterVatCeramic", PlaceGeometry(g, { x, y: 0, z, ry: HashString(seed) % 100 / 100 }));
  const lip = new THREE.TorusGeometry(0.405, 0.045, 8, 24);
  lip.rotateX(Math.PI / 2);
  sink.Add("WaterVatCeramic", PlaceGeometry(lip, { x, y: 0.78, z }));
  const water = new THREE.CircleGeometry(0.345, 24);
  water.rotateX(-Math.PI / 2);
  sink.Add("VatWater", PlaceGeometry(water, { x, y: 0.66, z }));
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
  // 编辑器的严重档必须跨过房屋生成器的塌顶阈值；旧倍率把 0.88 压成 0.616，
  // 结果整座礼拜堂仍是一栋齐顶房，只是贴图变黑。普通历史缺省仍沿用旧倍率。
  const severe = damage > 0.72;
  const gateDamage = severe ? damage : damage * 0.6;
  const hallDamage = severe ? damage : damage * 0.7;

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
  AddGatehouse(sink, { x: gx, z: gz, ry, seed: `${seed}:gate`, damage: gateDamage, openW: gateW });

  // 礼拜堂（北，最大的一进；卷棚顶做成两坡但脊部略平）
  const [hx, hz] = L(0, -D / 2 + 7.5);
  AddRoomBlock(sink, {
    x: hx, z: hz, ry, width: 18, depth: 11, eaveY: 3.4, ridgeY: 6.1,
    seed: `${seed}:hall`, damage: hallDamage, facing: 1, bays: 5, roofRafters: false,
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

/**
 * 外部战场包里的三种沙袋组合件。
 *
 * 这三件不是 0.62 m 的程序化单袋，而是约 1.9—2.0 m 宽的一小段袋墙；构建器按
 * 目标槽宽等比缩放后拼排。尺寸来自 Model_BattlefieldPack.glb 的实测包围盒，既
 * 决定相邻件间距，也让 01/02/03 的原始比例保持不变。
 */
export const EXTERNAL_SANDBAG_ASSET_IDS = Object.freeze([
  "battlefieldSandbag01", "battlefieldSandbag02", "battlefieldSandbag03",
]);

export const EXTERNAL_SANDBAG_METRICS = Object.freeze({
  battlefieldSandbag01: Object.freeze({ width: 1.926, height: 0.426, depth: 0.866 }),
  battlefieldSandbag02: Object.freeze({ width: 2.017, height: 0.426, depth: 1.303 }),
  battlefieldSandbag03: Object.freeze({ width: 1.883, height: 0.533, depth: 0.936 }),
});
// 堆垛参数只在这里定一份：层距必须小于三种模型缩放后的最低袋高，奇偶层错缝；
// 纵深三道互相压叠。否则包围盒看似相交，袋端的收尖轮廓仍会在斜视图里露出贯通空洞。
export const EXTERNAL_SANDBAG_PACKING = Object.freeze({
  slot: 1.48,
  layerStep: 0.225,
  nominalHeight: 0.28,
  laneStep: 0.52,
  oddRowInset: 0.14,
  rowTaper: 0.018,
  rowShift: 0.30,
});

function ExternalSandbagRows(height, minimum = 2) {
  const { layerStep, nominalHeight } = EXTERNAL_SANDBAG_PACKING;
  return Math.max(minimum,
    Math.round(Math.max(0, height - nominalHeight) / layerStep) + 1);
}

function ExternalSandbagRowSpan(span, row) {
  const packing = EXTERNAL_SANDBAG_PACKING;
  const taper = Math.min(span.width * 0.11, row * packing.rowTaper);
  const oddInset = row % 2 ? Math.min(packing.oddRowInset, span.width * 0.09) : 0;
  const width = Math.max(span.width * 0.64, span.width - taper * 2 - oddInset * 2);
  const direction = Math.floor(row / 2) % 2 ? -1 : 1;
  const shift = row % 2
    ? direction * Math.min(packing.rowShift, span.width * 0.085)
    : 0;
  return { center: span.center + shift, width };
}

function ExternalSandbagLanes(depth) {
  const step = Math.min(EXTERNAL_SANDBAG_PACKING.laneStep, Math.max(0.24, depth * 0.24));
  return [-step, 0, step];
}

/** 固定种子洗牌袋：每连续三件必含 01/02/03 各一件，但次序随构件 seed 改变。 */
function MakeExternalSandbagPicker(rnd) {
  let deck = [];
  return () => {
    if (!deck.length) {
      deck = [...EXTERNAL_SANDBAG_ASSET_IDS];
      for (let index = deck.length - 1; index > 0; index -= 1) {
        const swap = Math.floor(rnd() * (index + 1));
        [deck[index], deck[swap]] = [deck[swap], deck[index]];
      }
    }
    return deck.pop();
  };
}

function PushExternalSandbag(sink, placements, pick, rnd, {
  x, y, z, ry, slotWidth = EXTERNAL_SANDBAG_PACKING.slot,
}) {
  const asset = pick();
  const metrics = EXTERNAL_SANDBAG_METRICS[asset];
  // 袋体略宽于槽位：软袋落下会相互挤压，不能像木箱一样边贴边仍留下笔直暗缝。
  const scale = (slotWidth * (1.08 + (rnd() - 0.5) * 0.08)) / metrics.width;
  placements.push({
    asset, x, y, z, ry, scale, solid: false,
    generatedSandbag: true,
  });
}

function PushExternalSandbagGroup(sink, placements) {
  if (placements.length) sink.props.push({ kind: "externalSandbags", placements });
}

/** 街垒：门板、水缸、粮包、独轮车、沙包 —— 就便器材，不是工事教科书。 */
export function AddBarricade(sink, { x, z, ry = 0, length = 5, seed = "bar", height = 1.15 }) {
  const rnd = Mulberry32(HashString(seed));
  const cos = Math.cos(ry), sin = Math.sin(ry);
  const placements = [];
  const pick = MakeExternalSandbagPicker(rnd);
  const rows = ExternalSandbagRows(height);
  for (let row = 0; row < rows; row += 1) {
    const rowLen = length * (1 - row * 0.055);
    const n = Math.max(2, Math.ceil(rowLen / EXTERNAL_SANDBAG_PACKING.slot));
    const slotWidth = rowLen / n;
    for (let i = 0; i < n; i += 1) {
      const lx = -rowLen / 2 + (i + 0.5) * (rowLen / n);
      const lz = (rnd() - 0.5) * 0.12;
      PushExternalSandbag(sink, placements, pick, rnd, {
        x: x + cos * lx - sin * lz,
        y: row * EXTERNAL_SANDBAG_PACKING.layerStep,
        z: z - sin * lx - cos * lz,
        ry: ry + (rnd() - 0.5) * 0.20,
        slotWidth,
      });
    }
  }
  PushExternalSandbagGroup(sink, placements);
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
function AddProceduralLeaflessTree(sink, {
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

/**
 * Sketchfab 的三种无叶树共用 7 m 高的离线规格。模型选择和朝向只读 seed，
 * 因而同一布设点跨关、跨 LOD、跨重载都不会换树；视觉本体交给外部摆件层做
 * GPU 实例化与距离流送，碰撞仍留在 BuildSink，绝不随视觉流送增删。
 */
export const EXTERNAL_LEAFLESS_TREE_ASSET_IDS = Object.freeze([
  "leaflessTreeOak", "leaflessTree01", "leaflessTreeLowPoly",
]);
const EXTERNAL_LEAFLESS_TREE_REFERENCE_HEIGHT = 7.0;

function AddLeaflessTree(sink, {
  x, z, seed, scale, material, height, baseY,
}, profile) {
  // 非正式 BuildSink（少量老测试/工具桩）没有外部模型槽时保留程序化兜底。
  if (typeof sink.External !== "function") {
    AddProceduralLeaflessTree(sink,
      { x, z, seed, scale, material, height, baseY }, profile);
    return;
  }
  const heightRnd = Mulberry32(HashString(seed));
  const h = height > 0 ? height : (profile.heightMin + heightRnd() * profile.heightRange) * scale;
  const modelRnd = Mulberry32(HashString(`${seed}:leaflessTreeModel`));
  const asset = EXTERNAL_LEAFLESS_TREE_ASSET_IDS[
    Math.floor(modelRnd() * EXTERNAL_LEAFLESS_TREE_ASSET_IDS.length)
  ];
  sink.External({
    asset, x, y: baseY, z, ry: modelRnd() * Math.PI * 2,
    scale: h / EXTERNAL_LEAFLESS_TREE_REFERENCE_HEIGHT,
    solid: false, generatedTree: true,
  });

  const shapeScale = h / profile.referenceHeight;
  const colliderHeight = h * (profile.colliderHeightRatio ?? 1);
  const colliderRadius = profile.colliderRadiusScale == null
    ? profile.baseRadius * shapeScale * 1.45
    : profile.colliderRadiusScale * scale;
  sink.Solid(x, baseY + colliderHeight / 2, z,
    colliderRadius, colliderHeight / 2, colliderRadius, "prop");
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
function AddProceduralOrchardTree(sink, {
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

export function AddOrchardTree(sink, {
  x, z, seed = "orchard", scale = 1, height = 0, baseY = 0,
  material = "Willow",
}) {
  if (typeof sink.External !== "function") {
    AddProceduralOrchardTree(sink, { x, z, seed, scale, height, baseY, material });
    return;
  }
  AddLeaflessTree(sink, { x, z, seed, scale, height, baseY, material }, {
    heightMin: 2.9, heightRange: 1.1, referenceHeight: 3.4,
    baseRadius: 0.17, colliderHeightRatio: 0.45, colliderRadiusScale: 0.22,
  });
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
  const pick = MakeExternalSandbagPicker(rnd);
  const fillH = mode === "full" ? openH : (mode === "partial" ? openH * 0.62 : openH * 0.9);
  const rows = ExternalSandbagRows(fillH, 3);
  const placements = [];
  for (let r = 0; r < rows; r += 1) {
    const y = baseY + r * EXTERNAL_SANDBAG_PACKING.layerStep;
    const spans = mode === "slit"
      ? [
        { center: -(openW + slitWidth) / 4, width: (openW - slitWidth) / 2 },
        { center: (openW + slitWidth) / 4, width: (openW - slitWidth) / 2 },
      ]
      : [{ center: 0, width: openW }];
    for (const span of spans) {
      const rowSpan = ExternalSandbagRowSpan(span, r);
      const n = Math.max(1, Math.ceil(rowSpan.width / EXTERNAL_SANDBAG_PACKING.slot));
      const slotWidth = rowSpan.width / n;
      for (let i = 0; i < n; i += 1) {
        const lx = rowSpan.center - rowSpan.width / 2 + (i + 0.5) * slotWidth;
        const lanes = ExternalSandbagLanes(depth);
        for (let lane = 0; lane < lanes.length; lane += 1) {
          const settle = (r % 2 ? 1 : -1) * (lane - 1) * 0.025;
          const p = L(lx + (rnd() - 0.5) * 0.07, lanes[lane] + settle);
          PushExternalSandbag(sink, placements, pick, rnd, {
            x: p.x, y, z: p.z,
            ry: ry + (rnd() - 0.5) * 0.22,
            slotWidth,
          });
        }
      }
    }
  }
  PushExternalSandbagGroup(sink, placements);
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
 * 投弹位、机枪位和预备队院落掩体。画面复用外部战场包的 01/02/03 三种
 * 沙袋组合件；碰撞仍是一段一盒，不随外部网格的细碎轮廓改变。
 */
export function AddSandbagEmplacement(sink, {
  x, z, ry = 0, baseY = 0, seed = "emplacement",
  length = 7.0, depth = 2.6, height = 0.72,
}) {
  const cos = Math.cos(ry), sin = Math.sin(ry);
  const L = (lx, lz) => ({ x: x + cos * lx + sin * lz, z: z - sin * lx + cos * lz });
  const bagW = EXTERNAL_SANDBAG_PACKING.slot;
  const bagH = EXTERNAL_SANDBAG_PACKING.layerStep, bagD = 0.72;
  const rows = ExternalSandbagRows(height, 1);
  const segments = [
    { axis: "x", lx: 0, lz: depth / 2, len: length },
    { axis: "z", lx: -length / 2 + bagD / 2, lz: 0, len: depth },
    { axis: "z", lx: length / 2 - bagD / 2, lz: 0, len: depth },
  ];
  const placements = [];
  const rnd = Mulberry32(HashString(seed));
  const pick = MakeExternalSandbagPicker(rnd);
  for (let row = 0; row < rows; row += 1) {
    const rowOffset = row % 2 ? bagW * 0.5 : 0;
    for (const segment of segments) {
      const count = Math.max(1, Math.ceil(segment.len / bagW));
      const slotWidth = segment.len / count;
      for (let i = 0; i < count; i += 1) {
        const along = -segment.len / 2 + (i + 0.5) * segment.len / count + rowOffset;
        const p = L(segment.lx + (segment.axis === "x" ? along : 0),
          segment.lz + (segment.axis === "z" ? along : 0));
        const axisRy = segment.axis === "x" ? ry : ry + Math.PI / 2;
        PushExternalSandbag(sink, placements, pick, rnd, {
          x: p.x, y: baseY + bagH * row, z: p.z,
          ry: axisRy + (rnd() - 0.5) * 0.16,
          slotWidth,
        });
      }
    }
  }
  PushExternalSandbagGroup(sink, placements);
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
 * 歇山「撒头顶边／山花底边」的相对高度（占举高的比例）。
 *
 * 山花底角必须落在主坡侧边那条线上（z = halfD×(1−y/rise)），所以山花的半宽
 * 由它唯一决定：gz = halfD × (1 − GATE_HIP_TOP)。0.45 时山花横跨屋面进深的
 * 55%，举高一提就成了一整片大三角——参考图里山花是**顶上一小块**，撒头才是大面。
 *
 * **这个数散在壳、山花板、垂脊、脊兽、瓦垄五处用**，必须是同一个常量：
 * 各写各的 0.45 就是上一版山花与撒头裂缝的来路。
 */
const GATE_HIP_TOP = 0.62;

/**
 * 城楼屋面的举折量。壳（MakeGateRoofShell）与壳外的瓦垄／垂脊／脊兽都要吃
 * **同一条**曲线，否则脊和垄会浮在瓦面上方 —— 硬山那边已经踩过一次。
 *
 * v：沿坡从 0（正脊）到 1（檐口）。返回相对直坡的 y 偏移。
 */
export function GateRoofDy(v, rise) {
  const t = Math.max(0, Math.min(1, v));
  // 0.19/0.07 试过，太深：中段掉下去把屋面压成一条扁带。参考图那条弧很含蓄。
  return -rise * 0.085 * Math.sin(Math.PI * t)     // 举折：中段下凹，脊陡檐缓
    + rise * 0.035 * Math.pow(t, 3.4);             // 檐口末端反翘
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
  eaveOut = 1.6, rise = 1.55, cornerLift = 0.70, thickness = 0.14,
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
  // 举折位移：按 |z|/halfD 沿坡取样。**每个顶点都要过这一道**，包括底皮与封边，
  // 不然瓦面弯了、底皮还是平的。
  const Displace = (p) => [p[0], p[1] + GateRoofDy(Math.abs(p[2]) / halfD, rise), p[2]];
  const PushTriangle = (a0, b0, c0) => {
    for (const p0 of [a0, b0, c0]) {
      const p = Displace(p0);
      positions.push(p[0], p[1], p[2]);
      uvs.push(p[0] / tile + seedOffset, (p[2] + p[1] * 0.65) / tile + seedOffset * 0.5);
    }
  };
  // 面要先**细分**再位移：整块平面四边形只挪四个角是挪不出弧的，只会把平面
  // 换个角度摆。四边形走双线性网格，三角形当成退化四边形一起走。
  const SUB = 4;
  const Lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t];
  const PushFace = (points) => {
    const q = points.length >= 4
      ? [points[0], points[1], points[2], points[3]]
      : [points[0], points[1], points[2], points[2]];
    for (let i = 0; i < SUB; i += 1) {
      for (let j = 0; j < SUB; j += 1) {
        const u0 = i / SUB, u1 = (i + 1) / SUB, v0 = j / SUB, v1 = (j + 1) / SUB;
        const At = (u, v) => Lerp(Lerp(q[0], q[1], u), Lerp(q[3], q[2], u), v);
        const a = At(u0, v0), b = At(u1, v0), c = At(u1, v1), d = At(u0, v1);
        PushTriangle(a, b, c); PushTriangle(a, c, d);
      }
    }
    // 多于四点的面（当前没有）退回扇形，保底
    for (let i = 4; i < points.length; i += 1) PushTriangle(points[0], points[i - 1], points[i]);
  };

  // --- 歇山，不是四坡 ---
  //
  // 旧版两端直接从檐口三角收到正脊端点，那是**庑殿（四坡）**。参考三视图与
  // 1938 年那张照片都是歇山：正脊两端下方先是一小片竖直的山花，山花底下才继续
  // 是撒头那一坡。少了这一块，侧立面读成四坡攒尖，「重檐歇山」只剩「重檐」。
  //
  // hipTop 是撒头的顶边高度；zg 取 halfD*(1−hipTop/rise) 不是随手拍的：主坡在
  // x=±ridgeHalf 处的侧边就是 z = halfD*(1−y/rise) 这条线，把山花底角**摁在这条
  // 线上**，山花的两条上边就正好与主坡侧边重合 —— 不留缝，也不用再补过渡面。
  const hipTop = rise * GATE_HIP_TOP;
  const zg = halfD * (1 - hipTop / rise);
  const frontFaces = [
    [P(-halfW, EaveY(-halfW), halfD), P(-ridgeHalf, 0, halfD), P(-ridgeHalf, hipTop, zg)],
    [P(-ridgeHalf, 0, halfD), P(0, 0, halfD), P(0, rise, 0), P(-ridgeHalf, rise, 0)],
    [P(0, 0, halfD), P(ridgeHalf, 0, halfD), P(ridgeHalf, rise, 0), P(0, rise, 0)],
    [P(ridgeHalf, 0, halfD), P(halfW, EaveY(halfW), halfD), P(ridgeHalf, hipTop, zg)],
  ];
  // 撒头：两端从檐口两角升到山花底边（四边形，不再收成一个点）。
  // 山花本身**不并进这张壳** —— 它是木板不是瓦面，由 AddGateTower 用木材质单独
  // 贴一片填这个洞；并进来会被当成瓦，也会跟木板打 z-fighting。
  const topFaces = [
    ...frontFaces,
    ...frontFaces.map((face) => face.map((p) => P(p[0], p[1], -p[2])).reverse()),
    [P(halfW, EaveY(halfW), halfD), P(halfW, EaveY(halfW), -halfD),
      P(ridgeHalf, hipTop, -zg), P(ridgeHalf, hipTop, zg)],
    [P(-halfW, EaveY(-halfW), -halfD), P(-halfW, EaveY(-halfW), halfD),
      P(-ridgeHalf, hipTop, zg), P(-ridgeHalf, hipTop, -zg)],
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
  geometry.userData.gateRoof = { halfW, halfD, ridgeHalf, rise, cornerLift, hipTop, zg };
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
  bodyW = 11.4, bodyD = 7.2, columnH = 4.4, upperH = 3.0, eaveOut = 2.6,
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
  // 下层柱列：一排 8 根，不是 4 根。参考三视图的下层是一道**密柱廊**（十来根
  // 细柱贴着墙前站成一排），4 根粗柱读出来是亭子的四角，不是城楼的檐廊。
  const LOWER_COLS = 8;
  for (let cx = 0; cx < LOWER_COLS; cx += 1) {
    for (let cz = 0; cz < 2; cz += 1) {
      const lx = -bodyW / 2 + (bodyW * cx) / (LOWER_COLS - 1);
      const lz = -bodyD / 2 + bodyD * cz;
      const p = L(lx, lz);
      sink.Add("GatePaintRed", PlaceGeometry(
        new THREE.CylinderGeometry(0.15, 0.18, columnH, 12),
        { x: p.x, y: floor + columnH / 2, z: p.z, ry }));
      sink.Add("Ashlar", PlaceGeometry(
        new THREE.CylinderGeometry(0.25, 0.29, 0.20, 12),
        { x: p.x, y: floor + 0.10, z: p.z, ry }));
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
  // 下层：**柱廊背后一道通高实砖墙，明间开门**。
  // 旧版只砌半人高槛墙、上面全是格扇，正交立面与参考三视图并排一比，下层读成
  // 一圈通透的敞廊；参考图（与 1938 年那张照片）的下层是实砖墙，柱子贴在墙前
  // 站成一排，只有明间一个门洞。城楼是要守的，不是观景亭。
  //
  // 与墙垂直的那两面仍各留门洞：墙顶走道从楼里穿过去，这条通行性不许动。
  const LOWER_DOOR_W = 2.4;
  const lowerWallH = columnH - 0.30;
  for (const s of [-1, 1]) {
    const segLen = (bodyW - LOWER_DOOR_W) / 2;
    for (const half of [-1, 1]) {
      // 墙退到柱列**之后** 0.42 m。参考图里柱子明显站在墙前、柱侧有阴影缝；
      // 齐平的话柱与墙糊成一片，柱廊就没了。
      const p = L(half * (LOWER_DOOR_W / 2 + segLen / 2), s * (bodyD / 2 - 0.42));
      sink.Add("GateBrick", PlaceGeometry(
        MakeBox(segLen, lowerWallH, 0.28, TILE_METERS.brick,
          `${seed}:lw${s}${half}`, BRICK_UV_GRID),
        { x: p.x, y: floor + lowerWallH / 2, z: p.z, ry }));
      sink.Solid(p.x, floor + lowerWallH / 2, p.z, segLen / 2, lowerWallH / 2, 0.2, "tower", ry);
    }
    // 明间门楣以上仍是墙
    const headP = L(0, s * (bodyD / 2 - 0.42));
    const headH = Math.max(0.2, lowerWallH - 2.35);
    sink.Add("GateBrick", PlaceGeometry(
      MakeBox(LOWER_DOOR_W, headH, 0.28, TILE_METERS.brick,
        `${seed}:lwHead${s}`, BRICK_UV_GRID),
      { x: headP.x, y: floor + 2.35 + headH / 2, z: headP.z, ry }));
    // 与城墙垂直的那两面同样砌到通高，只在 walkGap 处让开墙顶走道。
    // 这两面若还留半人高槛墙，屋面抬高之后侧立面下层就空出一大片，
    // 整座楼读成「四根柱子顶着两层屋顶」。
    for (const half of [-1, 1]) {
      const segLen = bodyD / 2 - walkGap;
      if (segLen < 0.4) continue;
      const q = L(s * (bodyW / 2 - 0.05), half * (walkGap + segLen / 2));
      sink.Add("GateBrick", PlaceGeometry(
        MakeBox(0.28, lowerWallH, segLen, TILE_METERS.brick,
          `${seed}:sillx${s}${half}`, BRICK_UV_GRID),
        { x: q.x, y: floor + lowerWallH / 2, z: q.z, ry }));
      sink.Solid(q.x, floor + lowerWallH / 2, q.z, 0.2, lowerWallH / 2, segLen / 2, "tower", ry);
    }
    // 走道穿过的那一段：门楣以上补墙，人还是过得去（净高 2.35 m）。
    const gq = L(s * (bodyW / 2 - 0.05), 0);
    const gh = Math.max(0.2, lowerWallH - 2.35);
    sink.Add("GateBrick", PlaceGeometry(
      MakeBox(0.28, gh, walkGap * 2, TILE_METERS.brick,
        `${seed}:sillxHead${s}`, BRICK_UV_GRID),
      { x: gq.x, y: floor + 2.35 + gh / 2, z: gq.z, ry }));
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
  // 下层不再有格扇（墙已经砌实），只保留明间的木门框与门楣。
  // 门洞本身保持全空：既有纵深，也不偷改唯一四条上城道的通行性。
  const lowerDoorH = 2.35;
  for (const face of [-1, 1]) {
    for (const jamb of [-1, 1]) {
      const p = L(jamb * (LOWER_DOOR_W / 2 - 0.05), face * (bodyD / 2 - 0.10));
      sink.Add("GatePaintRed", PlaceGeometry(
        MakeBox(0.16, lowerDoorH, 0.18, TILE_METERS.wood,
          `${seed}:doorJamb${face}${jamb}`),
        { x: p.x, y: floor + lowerDoorH / 2, z: p.z, ry }));
    }
    const head = L(0, face * (bodyD / 2 - 0.10));
    sink.Add("GatePaintGreen", PlaceGeometry(
      MakeBox(LOWER_DOOR_W + 0.3, 0.22, 0.20, TILE_METERS.wood, `${seed}:doorHead${face}`),
      { x: head.x, y: floor + lowerDoorH + 0.11, z: head.z, ry }));
  }

  // 斗拱和雀替：远景里它们是檐下连续的一条彩色阴影，也是「亭阁」而不是脚手架的关键。
  /**
   * 檐下斗拱带。
   *
   * 旧版是「贴在楼身边缘的一串小方块」：出檐加大到 2.6 m 之后它们离檐口还有
   * 两米多，整条埋在屋面底下，正交立面上几乎读不出来。参考三视图里这条是
   * **又深又密的一整条**，把檐口线加厚一大截，是「这是座官式楼」最强的信号之一。
   *
   * 现在的做法：一条通长檐枋打底 + 每攒向外挑出的华栱与叠斗，攒距约 0.9 m。
   * 挑出量 reach 取出檐的六成 —— 斗拱本来就是把檐口的重量转回柱头的那截悬臂。
   */
  const AddBracketSets = (y, w, d, tag, xCount = 4) => {
    const reach = Math.min(1.5, eaveOut * 0.6);
    for (const side of [-1, 1]) {
      // 通长檐枋：先有一条连续的带，攒与攒之间才不会散成孤立的方块
      const arc = L(0, side * (d / 2 + 0.12));
      sink.Add("GatePaintRed", PlaceGeometry(
        MakeBox(w + 0.6, 0.34, 0.30, TILE_METERS.wood, `${seed}:${tag}arch${side}`),
        { x: arc.x, y: y - 0.52, z: arc.z, ry }));
      for (let i = 0; i < xCount; i += 1) {
        const lx = -w / 2 + (w * i) / Math.max(1, xCount - 1);
        const p = L(lx, side * (d / 2 + reach * 0.45));
        // 华栱：往外挑
        sink.Add("GatePaintGreen", PlaceGeometry(
          MakeBox(0.20, 0.20, reach, TILE_METERS.wood, `${seed}:${tag}gong${side}${i}`),
          { x: p.x, y: y - 0.24, z: p.z, ry }));
        // 叠斗：两层，越往上越靠外
        for (let k = 0; k < 2; k += 1) {
          const q = L(lx, side * (d / 2 + reach * (0.18 + 0.55 * k)));
          sink.Add("GatePaintRed", PlaceGeometry(
            MakeBox(0.34 - 0.06 * k, 0.20, 0.34 - 0.06 * k, TILE_METERS.wood,
              `${seed}:${tag}dou${side}${i}${k}`),
            { x: q.x, y: y - 0.40 + k * 0.17, z: q.z, ry }));
        }
        // 令栱：横向一小段，把相邻两攒在视觉上连起来
        const r = L(lx, side * (d / 2 + reach * 0.78));
        sink.Add("GatePaintGreen", PlaceGeometry(
          MakeBox(0.78, 0.17, 0.20, TILE_METERS.wood, `${seed}:${tag}ling${side}${i}`),
          { x: r.x, y: y - 0.10, z: r.z, ry }));
      }
      // 两山同样来一条，不然侧立面檐下是空的
      const zCount = Math.max(3, Math.round(d / 1.1));
      const sArc = L(side * (w / 2 + 0.12), 0);
      sink.Add("GatePaintRed", PlaceGeometry(
        MakeBox(0.30, 0.34, d + 0.6, TILE_METERS.wood, `${seed}:${tag}sArch${side}`),
        { x: sArc.x, y: y - 0.52, z: sArc.z, ry }));
      for (let i = 0; i < zCount; i += 1) {
        const lz = -d / 2 + (d * i) / Math.max(1, zCount - 1);
        const p = L(side * (w / 2 + reach * 0.45), lz);
        sink.Add("GatePaintGreen", PlaceGeometry(
          MakeBox(reach, 0.20, 0.20, TILE_METERS.wood, `${seed}:${tag}sGong${side}${i}`),
          { x: p.x, y: y - 0.24, z: p.z, ry }));
        const r = L(side * (w / 2 + reach * 0.78), lz);
        sink.Add("GatePaintGreen", PlaceGeometry(
          MakeBox(0.20, 0.17, 0.78, TILE_METERS.wood, `${seed}:${tag}sLing${side}${i}`),
          { x: r.x, y: y - 0.10, z: r.z, ry }));
      }
    }
  };

  // --- 下檐（重檐的第一层）：闭合歇山顶、筒瓦垄、戗脊和吻兽 ---
  const eave1 = floor + columnH;
  const AddRoof = (yEave, w, d, tag, detailScale = 1) => {
    // 屋面举高。0.22 的系数在 7.2 m 进深上只有 1.58 m —— 正交立面上两层屋面
    // 读成两块平板贴在楼身上。参考三视图里上檐从檐口到正脊约占整座楼身的三分之一，
    // 屋面是有体量的一大块，不是一块板。0.40 对应约 30°，是北方官式常见坡度。
    // 0.22 太扁（读成两块平板），0.40 仍不够：并排量过，参考图侧视里屋面
    // 宽/高约 3.1，0.40 只给到 4.3。0.55 正好对上。
    const rise = Math.max(1.6, Math.min(w, d) * 0.55);
    // 翼角起翘。旧值 0.26 是「不夸张成影视城飞檐」的克制取值，但正交立面与
    // 参考三视图并排一比就看得出：那一版四条檐口是**直的**，读成硬山盝顶而不是
    // 歇山翘厦。参考图（与 1938 年那张照片）的翼角翘得很明显，是这座楼最强的
    // 识别特征之一。0.95 m 在 11.4 m 面阔上约合 1/12，属于北方官式的常见幅度。
    // 幅度是并排比出来的：0.26 只是末端一个小折角（读成庑殿盝顶），
    // 1.55 又过头 —— 角尖甩得比正脊还张扬、屋面中段塌下去，整个读成
    // 「两只翘起的翅膀中间夹条缝」。0.70 在 11.4 m 面阔上约合 1/16。
    const cornerLift = 0.90 * detailScale;
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
    const hipTopT = rise * GATE_HIP_TOP;
    const zgT = halfD * (1 - hipTopT / rise);
    for (const side of [-1, 1]) {
      for (let i = 0; i <= tileRows; i += 1) {
        const lx = -halfW + (halfW * 2 * i) / tileRows;
        const inner = Math.abs(lx) <= ridgeHalf;
        const ridgeX = Math.max(-ridgeHalf, Math.min(ridgeHalf, lx));
        // 歇山之后，正脊两端外侧的瓦面是**撒头**，顶边在 (±ridgeHalf, hipTop, ±zg)。
        // 这一段的瓦垄仍按老写法收到正脊端点的话，会整排飞在撒头上方 ——
        // 正交立面与俯视图上是从脊端射出的一把扇子。
        const top = inner
          ? [ridgeX, rise + 0.08, 0]
          : [ridgeX, hipTopT + 0.08, side * zgT];
        const foot = [lx, EaveY(lx) + 0.08, side * halfD];
        // 瓦垄必须**沿弧分段**。壳已经举折了，这里再拉一根直梁，中段就会离开
        // 瓦面 rise×0.19（rise 3 m 时约 0.6 m）—— 一排垄整个浮在屋面上方。
        const SEGS = 3;
        const Along = (t) => {
          const px = top[0] + (foot[0] - top[0]) * t;
          const py = top[1] + (foot[1] - top[1]) * t;
          const pz = top[2] + (foot[2] - top[2]) * t;
          return [px, py + GateRoofDy(Math.abs(pz) / halfD, rise), pz];
        };
        for (let k = 0; k < SEGS; k += 1) {
          PlaceLocal("GateRoofTile", MakeBeamBetween(
            Along(k / SEGS), Along((k + 1) / SEGS),
            0.075 * detailScale, TILE_METERS.roof, `${seed}:${tag}:tile${side}${i}:${k}`));
        }
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
        // 垂脊从**山花底角**起，不是从正脊端点起 —— 歇山改造之后那一段瓦面
        // 已经不在了，仍按老起点画会有一条脊悬在撒头上方，两边露白缝。
        const hipTop0 = rise * GATE_HIP_TOP;
        const zg0 = halfD * (1 - hipTop0 / rise);
        const hA = [sideX * ridgeHalf, hipTop0 + 0.10, sideZ * zg0];
        const hB = [sideX * halfW, EaveY(halfW) + 0.11, sideZ * halfD];
        const HAlong = (t) => {
          const pz = hA[2] + (hB[2] - hA[2]) * t;
          return [hA[0] + (hB[0] - hA[0]) * t,
            hA[1] + (hB[1] - hA[1]) * t + GateRoofDy(Math.abs(pz) / halfD, rise), pz];
        };
        for (let k = 0; k < 3; k += 1) {
          PlaceLocal("GateRoofTile", MakeBeamBetween(HAlong(k / 3), HAlong((k + 1) / 3),
            0.22 * detailScale, TILE_METERS.roof, `${seed}:${tag}:hip${sideX}${sideZ}:${k}`));
        }
        for (const t of [0.48, 0.68]) {
          const hipTop1 = rise * GATE_HIP_TOP;
          const zg1 = halfD * (1 - hipTop1 / rise);
          const bx = sideX * (ridgeHalf + (halfW - ridgeHalf) * t);
          const bz = sideZ * (zg1 + (halfD - zg1) * t);
          const by = hipTop1 * (1 - t) + EaveY(halfW) * t + 0.25
            + GateRoofDy(Math.abs(bz) / halfD, rise);
          PlaceLocal("GateRoofTile", PlaceGeometry(
            MakeBox(0.22 * detailScale, 0.30 * detailScale, 0.22 * detailScale,
              TILE_METERS.roof, `${seed}:${tag}:beast${sideX}${sideZ}${t}`),
            { x: bx, y: by, z: bz }));
        }
      }
      // 正吻：参考图（与 1938 年那张照片）两端是**向内卷**的吻兽，不是方块。
      // 用四小块沿一段圆弧摆出卷势 —— 白盒不做雕饰，但「卷」这个势必须有，
      // 它是屋脊两端最强的剪影信号。
      // 六小块、半径收到 0.26、块间重叠 —— 第一版半径 0.42 且只有四块，
      // 块与块之间断开，正交立面上读成几粒飘在脊端上方的碎渣。
      const ds = detailScale;
      const N = 6, rr = 0.26 * ds;
      for (let k = 0; k < N; k += 1) {
        const t = k / (N - 1);
        const ang = t * 2.0;
        PlaceLocal("GateRoofTile", PlaceGeometry(
          MakeBox(0.26 * ds, 0.26 * ds, 0.32 * ds,
            TILE_METERS.roof, `${seed}:${tag}:chiwen${sideX}${k}`),
          {
            x: sideX * (ridgeHalf + 0.14 + rr * Math.sin(ang)),
            y: rise + 0.30 + rr * (1 - Math.cos(ang)) + t * 0.34 * ds,
            z: 0, rz: -sideX * ang * 0.45,
          }));
      }
      // 吻座
      PlaceLocal("GateRoofTile", PlaceGeometry(
        MakeBox(0.40 * ds, 0.34 * ds, 0.44 * ds,
          TILE_METERS.roof, `${seed}:${tag}:chiwenBase${sideX}`),
        { x: sideX * (ridgeHalf + 0.12), y: rise + 0.20, z: 0 }));

      // --- 歇山山花 ---
      // 少了这一块，正脊两端就直接四面落坡，侧立面读成四坡攒尖而不是歇山。
      // 山花是一片**竖立**的三角板，坐在正脊端头下方；它下面才继续是撒头那一坡。
      // 参考三视图与 1938 年那张照片的两层屋面都是歇山，这是「重檐歇山」四个字
      // 里「歇山」的那一半，之前整个没做。
      // 尺寸必须与 MakeGateRoofShell 里留的那个洞**逐字一致**，否则不是露缝
      // 就是穿出瓦面。两处都用 hipTop = rise*0.45、zg = halfD*(1−hipTop/rise)。
      const hipTop = rise * GATE_HIP_TOP;
      const gz = halfD * (1 - hipTop / rise);
      // 山花底边要跟着壳的举折一起降。壳里每个顶点都过了 GateRoofDy，撒头顶边
      // （z=±zg）因此下沉了 rise×0.085 左右；山花板在壳**外**单独贴，不补这一下
      // 就会和撒头之间裂一条白缝 —— 侧立面上屋面读成「上下两片中间透光」。
      // 再往下压 0.12 m 留搭接：撒头顶边是弧的，山花底边是直的，两端对齐则中间差一丝。
      const gBase = hipTop + GateRoofDy(gz / halfD, rise) - 0.12;
      const panel = MakeGablePrism(gz * 2, gBase, gBase, rise,
        0.14 * detailScale, TILE_METERS.wood, `${seed}:${tag}:gable${sideX}`);
      panel.translate(sideX * ridgeHalf, 0, 0);
      PlaceLocal("GatePaintRed", panel);
      // 博脊：山花两条斜边上的压边，把板与瓦面接住
      const gh = rise - gBase;
      const gAngle = Math.atan2(gh, gz);
      for (const sz of [-1, 1]) {
        PlaceLocal("GateRoofTile", PlaceGeometry(
          MakeBox(0.26 * detailScale, 0.16 * detailScale,
            Math.hypot(gz, gh) + 0.1, TILE_METERS.roof,
            `${seed}:${tag}:bo${sideX}${sz}`),
          {
            x: sideX * ridgeHalf, y: gBase + gh / 2, z: sz * (gz / 2),
            rx: sz * gAngle,
          }));
      }
    }
  };
  AddBracketSets(eave1, bodyW, bodyD, "lowerBracket", 11);
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
  // 上层格扇：6 间。参考三视图上层是一排细密的格窗（六七间），3 间大格扇
  // 会把上层读成一间大敞厅。
  const UPPER_BAYS = 6;
  const upperBayW = upW / UPPER_BAYS;
  for (const face of [-1, 1]) {
    for (let i = 0; i < UPPER_BAYS; i += 1) {
      AddLatticeScreen({
        lx: -upW / 2 + upperBayW * (i + 0.5), lz: face * (upD / 2 - 0.08),
        y0: upFloor + 0.92, w: upperBayW - 0.16, h: upperH - 1.38,
        tag: `upperScreen${face}${i}`, vertical: 2, horizontal: 2,
      });
    }
  }
  // 上层两侧（±x 面）此前完全空着：侧立面上二层读成「两根柱子撑着屋顶」。
  // 与 ±z 面同样处理 —— 砖槛墙打底，上面一整片格扇。
  for (const sx of [-1, 1]) {
    const q = L(sx * (upW / 2 - 0.06), 0);
    sink.Add("GateBrick", PlaceGeometry(
      MakeBox(0.24, 0.9, upD, TILE_METERS.brick, `${seed}:usillx${sx}`, BRICK_UV_GRID),
      { x: q.x, y: upFloor + 0.45, z: q.z, ry }));
    const sh = upperH - 1.38;
    for (const half of [-1, 1]) {
      const segD = upD / 2;
      const c = L(sx * (upW / 2 - 0.06), half * segD / 2);
      // 沿 z 排的格扇：把 AddLatticeScreen 的局部 x 轴转 90° 用
      sink.Add("GatePaintRed", PlaceGeometry(
        MakeBox(0.12, sh, 0.12, TILE_METERS.wood, `${seed}:uxJamb${sx}${half}`),
        { x: c.x, y: upFloor + 0.92 + sh / 2, z: c.z, ry }));
      for (let i = 0; i < 3; i += 1) {
        const m = L(sx * (upW / 2 - 0.06), half * (segD * (i + 0.5) / 3));
        sink.Add("GatePaintGreen", PlaceGeometry(
          MakeBox(0.10, sh - 0.16, 0.06, TILE_METERS.wood, `${seed}:uxV${sx}${half}${i}`),
          { x: m.x, y: upFloor + 0.92 + sh / 2, z: m.z, ry }));
      }
    }
    for (const rail of [0, 1]) {
      sink.Add("GatePaintGreen", PlaceGeometry(
        MakeBox(0.14, 0.10, upD, TILE_METERS.wood, `${seed}:uxRail${sx}${rail}`),
        { x: q.x, y: upFloor + 0.92 + rail * sh, z: q.z, ry }));
    }
  }
  AddBracketSets(upFloor + upperH, upW, upD, "upperBracket", 9);
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
  damageProfile = null,
}) {
  const [w, d] = nave;
  const cos = Math.cos(ry), sin = Math.sin(ry);
  const L = (lx, lz) => ({ x: x + cos * lx + sin * lz, z: z - sin * lx + cos * lz });
  const eave = 7.4, ridge = 11.6;
  const collapsed = damage > 0.62;
  const catastrophic = damage > 0.94;
  const rnd = Mulberry32(HashString(`${seed}:churchDamage`));

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
      ruin: damage * (catastrophic ? 0.78 : 0.5), seed: `${seed}:w${i}`, plinth: "CrossStone",
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
    x, z, width: w, depth: d, eaveY: eave, ridgeY: ridge, ry, seed: `${seed}:roof`,
    ruined: damageProfile === "severe" ? "partial" : collapsed,
    burnt: false, rafters: false,
  });

  // 钟塔：山面一座方塔 + 四坡锥顶
  const tw = 4.6;
  const tp = L(0, d / 2 + tw / 2 - 0.4);
  sink.Add("CrossStone", PlaceGeometry(
    MakeBox(tw + 0.8, 1.0, tw + 0.8, TILE_METERS.stone, `${seed}:tbase`),
    { x: tp.x, y: 0.5, z: tp.z, ry }));
  const towerTop = catastrophic
    ? towerH * (0.40 + rnd() * 0.10)
    : (collapsed ? towerH * (0.64 + rnd() * 0.08) : towerH);
  const towerBodyH = towerTop - 1.0;
  sink.Add(collapsed ? "BrickWallSooty" : "HouseBrick", PlaceGeometry(
    MakeBox(tw, towerBodyH, tw, TILE_METERS.brick, `${seed}:tower`, BRICK_UV_GRID),
    { x: tp.x, y: 1.0 + towerBodyH / 2, z: tp.z, ry, rz: collapsed ? 0.018 : 0 }));
  sink.Solid(tp.x, towerTop / 2, tp.z, tw / 2 + 0.4, towerTop / 2, tw / 2 + 0.4, "wall");
  // 钟层的券洞
  for (const s of [-1, 1]) {
    const p = L(s * (tw / 2 - 0.02), d / 2 + tw / 2 - 0.4);
    if (!collapsed) {
      sink.Add("Charred", PlaceGeometry(
        MakeBox(0.2, 2.4, 1.5, TILE_METERS.stone, `${seed}:bell${s}`),
        { x: p.x, y: towerH - 2.6, z: p.z, ry }));
    }
  }
  // 锥顶
  if (!collapsed) {
    const spire = new THREE.ConeGeometry(tw * 0.78, 4.6, 4);
    const uv = spire.attributes.uv;
    for (let i = 0; i < uv.count; i += 1) uv.setXY(i, uv.getX(i) * 3, uv.getY(i) * 3);
    sink.Add("TubeTile", PlaceGeometry(spire,
      { x: tp.x, y: towerH + 2.3, z: tp.z, ry: ry + Math.PI / 4 }));
  } else {
    // 钟塔顶部留下能读出原锥顶结构的断木，不用“整座塔被水平裁短”代替坍塌。
    const rafterCount = catastrophic ? 3 : 5;
    for (let i = 0; i < rafterCount; i += 1) {
      const a = (i / rafterCount) * Math.PI * 2 + rnd() * 0.25;
      sink.Add(i === 0 ? "Charred" : "WoodBeam", PlaceGeometry(
        MakeBox(0.18, 2.3 + rnd() * 1.2, 0.18, TILE_METERS.wood, `${seed}:spireRafter${i}`),
        { x: tp.x + Math.sin(a) * 0.75, y: towerTop + 0.7, z: tp.z + Math.cos(a) * 0.75,
          ry: a, rz: (rnd() - 0.5) * 0.55 },
      ));
    }
    sink.props.push({ kind: "rubblePile", x: tp.x, z: tp.z,
      radius: tw * (catastrophic ? 1.05 : 0.72), seed: `${seed}:towerFall` });
    if (catastrophic) {
      const spill = L(-tw * 0.72, d / 2 + tw * 0.75);
      sink.props.push({ kind: "rubblePile", x: spill.x, z: spill.z,
        radius: tw * 0.68, seed: `${seed}:towerFallSecond` });
    }
  }
  // 大门
  const door = L(0, d / 2 + tw - 0.42);
  AddDoorReveal(sink, {
    x: door.x, z: door.z, ry: ry + Math.PI, openW: 1.9, openH: 3.0, depth: 1.4,
    seed: `${seed}:door`, paving: "CrossStone", sill: "CrossStone", jamb: !collapsed,
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
