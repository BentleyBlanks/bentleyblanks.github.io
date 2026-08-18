// 《血战台儿庄》战场生成：一整座运河商镇，不是一条走廊。
//
// 对标 Easy Red 2 的第一件事就是**尺度**：开放战场、看得见远处的战线、
// 打的地方和看的地方是同一个地方。所以这里一次生成整座城，
// 而不是每关搭一小段街。
//
// 三条硬规矩：
//   1) 街巷宽度与房屋尺寸 **1:1 不缩**（主街 5 m、次巷 2.4 m、夹道 1.5 m，
//      院墙 2.2 m、檐口 2.6 m）。缩尺只缩街区数量 —— 巷战的体感全在
//      「门有多宽、墙有多高、隔一堵墙有多近」这一层，缩了就不是这仗了。
//   2) 破坏有**梯度**：日军从北面打进来，所以北边是废墟、南边还立着。
//      均匀撒破损 = 看不出战线在哪。
//   3) 生成必须**分帧**：一次性建完整座城会把主线程卡死十几秒，白屏就是这么来的。
//      BuildSteps 是个生成器，每 yield 一次交还主线程给加载条。

import * as THREE from "three";
import { Mulberry32, HashString, Clamp01, Clamp } from "./Script_Noise.mjs";
import { WORLD, TOWN, OBJECTIVES } from "./Data_Battle.mjs";
import {
  BuildSink, AddCompound, AddRampart, AddMosque, AddGatehouse, AddBarricade,
  AddTree, AddPole, AddWell, AddWall,
} from "./Script_World.mjs";
import {
  MakePlane, MakeBox, MakeInstanced, MakeRubbleField, CarveCraters,
  PlaceGeometry, MergeGeometries, TILE_METERS,
} from "./Script_Geo.mjs";

/** 街网：主街与次巷的中心线。数量比史实的八条街少，宽度一模一样。 */
const STREETS_NS = [-170, -85, 0, 85, 170];      // 南北向主街（x）
const STREETS_EW = [-140, -60, 25, 110];         // 东西向主街（z）
const MAIN_STREET_W = 5.2;
const ALLEY_W = 2.4;

/** 地标占位：这些格子不放普通院落。 */
const LANDMARKS = [
  { id: "Mosque", x: 46, z: -54, w: 34, d: 30 },
  { id: "GuandiTemple", x: 148, z: 96, w: 34, d: 28 },
  { id: "Station", x: -160, z: 140, w: 40, d: 24 },
  { id: "WenchangPavilion", x: -110, z: 20, w: 24, d: 22 },
];

function InLandmark(x, z, pad = 4) {
  for (const l of LANDMARKS) {
    if (Math.abs(x - l.x) < l.w / 2 + pad && Math.abs(z - l.z) < l.d / 2 + pad) return l.id;
  }
  return null;
}

/** 破坏梯度：越靠北、越靠近占领点，打得越烂。 */
function DamageAt(x, z, rnd) {
  const northness = Clamp01((-z + 190) / 380);          // 北边 1，南边 0
  let d = 0.14 + Math.pow(northness, 1.5) * 0.62;
  for (const o of OBJECTIVES) {
    const dist = Math.hypot(x - o.x, z - o.z);
    if (dist < o.radius * 2.4) d += (1 - dist / (o.radius * 2.4)) * 0.28;
  }
  return Clamp(d + (rnd() - 0.5) * 0.22, 0, 0.94);
}

export class Battlefield {
  constructor(scene, library, { quality = "high", seed = 19380324 } = {}) {
    this.scene = scene;
    this.library = library;
    this.quality = quality;
    this.seed = seed;
    this.sink = new BuildSink();
    this.meshes = [];
    this.colliders = [];
    this.covers = [];
    this.grid = new Map();           // 碰撞盒的空间散列，10 m 一格
    this.gridSize = 10;
    this.craters = [];
    this.groundMesh = null;
    this.objectives = OBJECTIVES.map((o) => ({ ...o, progress: o.owner === "nra" ? 1 : 0, contested: false }));
    this.bounds = { minX: WORLD.minX, maxX: WORLD.maxX, minZ: WORLD.minZ, maxZ: WORLD.maxZ };
    this.spawnPoints = { nra: [], ija: [] };
  }

  /** 分帧生成。用法：for (const step of bf.BuildSteps()) { 更新进度条; await raf; } */
  *BuildSteps() {
    const rnd = Mulberry32(this.seed);
    const sink = this.sink;

    yield { label: "夯地", progress: 0.02 };
    this.BuildGround(rnd);

    yield { label: "筑寨墙", progress: 0.12 };
    this.BuildRamparts(rnd);

    yield { label: "开城门", progress: 0.2 };
    this.BuildGates(rnd);

    // --- 院落：按街网切格 ---
    const cells = this.PlanCompounds(rnd);
    const total = cells.length;
    let done = 0;
    for (const cell of cells) {
      const detail = Math.hypot(cell.x, cell.z) < WORLD.detailRadius;
      if (detail) {
        AddCompound(sink, {
          x: cell.x, z: cell.z, ry: cell.ry, width: cell.w, depth: cell.d,
          seed: cell.seed, damage: cell.damage, burnt: cell.burnt,
        });
      } else {
        this.AddSilhouetteBlock(cell);
      }
      done += 1;
      if (done % 4 === 0) {
        yield { label: `盖房子 ${done}/${total}`, progress: 0.2 + 0.55 * (done / total) };
      }
    }

    yield { label: "清真寺", progress: 0.78 };
    AddMosque(sink, { x: 46, z: -54, ry: 0, damage: 0.5, seed: "mosque" });
    this.BuildTemple(rnd);
    this.BuildStation(rnd);
    this.BuildPavilion(rnd);

    yield { label: "街垒", progress: 0.85 };
    this.BuildBarricades(rnd);
    this.BuildProps(rnd);

    yield { label: "合批", progress: 0.92 };
    this.meshes = sink.Flush(this.scene, this.library);
    this.FlushProps();
    this.colliders = sink.colliders;
    this.covers = sink.covers;
    this.BuildCollisionGrid();

    yield { label: "就绪", progress: 1.0 };
  }

  // ---------------------------------------------------------------------
  BuildGround(rnd) {
    const size = WORLD.groundSize;
    const segments = this.quality === "low" ? 96 : 168;
    const geometry = MakePlane(size, size, TILE_METERS.ground, segments);
    // 弹坑：北边密、南边疏，占领点周围最密
    const craters = [];
    for (let i = 0; i < 130; i += 1) {
      const x = (rnd() - 0.5) * 460;
      const z = (rnd() - 0.5) * 420;
      const north = Clamp01((-z + 210) / 420);
      if (rnd() > 0.22 + north * 0.72) continue;
      craters.push({ x, z, radius: 1.8 + rnd() * 3.6, depth: 0.28 + rnd() * 0.62 });
    }
    for (const o of OBJECTIVES) {
      for (let i = 0; i < 8; i += 1) {
        const a = rnd() * Math.PI * 2, r = rnd() * o.radius * 1.6;
        craters.push({ x: o.x + Math.cos(a) * r, z: o.z + Math.sin(a) * r, radius: 2.2 + rnd() * 3.0, depth: 0.35 + rnd() * 0.6 });
      }
    }
    // 地面本身还有起伏 —— 一块绝对水平的地板是「网页 demo」最明显的破绽
    const position = geometry.attributes.position;
    for (let i = 0; i < position.count; i += 1) {
      const x = position.getX(i), z = position.getZ(i);
      const h = Math.sin(x * 0.021 + 1.3) * 0.24 + Math.cos(z * 0.017 - 0.7) * 0.28
        + Math.sin((x + z) * 0.008) * 0.34;
      position.setY(i, h);
    }
    CarveCraters(geometry, craters);
    this.craters = craters;
    const mesh = new THREE.Mesh(geometry, this.library.Get("GroundRubble"));
    mesh.receiveShadow = true;
    mesh.name = "Ground";
    this.scene.add(mesh);
    this.groundMesh = mesh;
    this.groundGeometry = geometry;
    this.groundSegments = segments;
    this.groundSize = size;
  }

  /** 地面高度：从生成时的解析式反推，不去查网格（查网格每帧几百次太贵）。 */
  GroundHeight(x, z) {
    let h = Math.sin(x * 0.021 + 1.3) * 0.24 + Math.cos(z * 0.017 - 0.7) * 0.28
      + Math.sin((x + z) * 0.008) * 0.34;
    for (const c of this.craters) {
      const d = Math.hypot(x - c.x, z - c.z);
      if (d > c.radius * 1.7) continue;
      const t = d / c.radius;
      h += -c.depth * Math.exp(-t * t * 2.2) + c.depth * 0.34 * Math.exp(-Math.pow(t - 1.05, 2) * 6.5);
    }
    return h;
  }

  BuildRamparts(rnd) {
    for (const r of TOWN.ramparts) {
      // 北墙上有两处缺口 —— 三月二十七日日军就是从这儿进来的
      const breach = r.id === "north" ? { at: 22, width: 18 } : null;
      AddRampart(this.sink, {
        x: r.x, z: r.z, length: r.length, ry: r.ry,
        height: TOWN.wallHeight, thickness: TOWN.wallThickness,
        seed: `rampart_${r.id}`, breach,
        ramp: r.ramps && r.ramps.length ? { at: r.ramps[0] } : null,
      });
      // 其余马道单独补
      for (let i = 1; i < (r.ramps?.length ?? 0); i += 1) {
        const at = r.ramps[i];
        const cos = Math.cos(r.ry), sin = Math.sin(r.ry);
        const rz = -(TOWN.wallThickness / 2 + 3.2);
        const rx2 = r.x + cos * at - sin * rz;
        const rz2 = r.z - sin * at - cos * rz;
        this.sink.Add("Ground", PlaceGeometry(
          MakeBox(3.0, TOWN.wallHeight, 7.0, TILE_METERS.ground, `ramp_${r.id}_${i}`),
          { x: rx2, y: TOWN.wallHeight / 2 - 0.6, z: rz2, ry: r.ry, rx: Math.atan2(TOWN.wallHeight, 7.0) }));
        this.sink.Solid(rx2, TOWN.wallHeight / 2 - 0.6, rz2, 1.8, TOWN.wallHeight / 2, 3.8, "ramp");
      }
    }
  }

  BuildGates(rnd) {
    for (const g of TOWN.gates) {
      // 两层门楼，高约七米：下面是能过大车的门洞，上面是岗楼
      const cos = Math.cos(g.ry), sin = Math.sin(g.ry);
      const damaged = g.id === "ZhongZheng" ? 0.65 : 0.25 + rnd() * 0.3;
      AddGatehouse(this.sink, { x: g.x, z: g.z, ry: g.ry, seed: `gate_${g.id}`, damage: damaged, openW: 3.4 });
      if (damaged < 0.55) {
        // 上层岗楼
        const y = 4.1;
        AddWall(this.sink, "BrickWall", {
          x: g.x, z: g.z - cos * 1.2, length: 7.0, height: 2.4, thickness: 0.5,
          ry: g.ry, ruin: damaged * 0.7, seed: `gt_${g.id}`, cope: false,
        });
        this.sink.Add("BrickWall", PlaceGeometry(
          MakeBox(7.0, 2.4, 4.2, TILE_METERS.brick, `gtower_${g.id}`),
          { x: g.x, y: y + 1.2, z: g.z, ry: g.ry }));
        this.sink.Solid(g.x, y + 1.2, g.z, 3.6, 1.2, 2.2, "gate");
        for (const s of [-1, 1]) {
          this.sink.Add("RoofTile", PlaceGeometry(
            MakeBox(8.2, 0.13, 2.8, TILE_METERS.roof, `gtroof_${g.id}${s}`),
            { x: g.x - sin * 0, y: y + 2.9, z: g.z - cos * s * 1.2, ry: g.ry, rx: -s * 0.44 }));
        }
      }
    }
  }

  /** 按街网切格，决定每个院落的位置与朝向。 */
  PlanCompounds(rnd) {
    const cells = [];
    const xs = [WORLD.minX + 14, ...STREETS_NS, WORLD.maxX - 14];
    const zs = [WORLD.minZ + 14, ...STREETS_EW, WORLD.maxZ - 14];
    for (let i = 0; i < xs.length - 1; i += 1) {
      for (let j = 0; j < zs.length - 1; j += 1) {
        const x0 = xs[i] + MAIN_STREET_W / 2, x1 = xs[i + 1] - MAIN_STREET_W / 2;
        const z0 = zs[j] + MAIN_STREET_W / 2, z1 = zs[j + 1] - MAIN_STREET_W / 2;
        const blockW = x1 - x0, blockD = z1 - z0;
        if (blockW < 16 || blockD < 16) continue;
        // 街区内按 20×18 左右切院落，中间留次巷
        const cols = Math.max(1, Math.floor(blockW / 22));
        const rows = Math.max(1, Math.floor(blockD / 20));
        const cw = (blockW - ALLEY_W * (cols - 1)) / cols;
        const cd = (blockD - ALLEY_W * (rows - 1)) / rows;
        for (let c = 0; c < cols; c += 1) {
          for (let r = 0; r < rows; r += 1) {
            const cx = x0 + c * (cw + ALLEY_W) + cw / 2;
            const cz = z0 + r * (cd + ALLEY_W) + cd / 2;
            if (InLandmark(cx, cz)) continue;
            if (Math.abs(cx) > 236 || Math.abs(cz) > 200) continue;
            const damage = DamageAt(cx, cz, rnd);
            cells.push({
              x: cx, z: cz, w: Math.min(cw, 24), d: Math.min(cd, 22),
              // 坐北朝南：门开在南面。整城朝向一致才像中国北方的镇子
              ry: 0,
              seed: `cp_${Math.round(cx)}_${Math.round(cz)}`,
              damage,
              burnt: damage > 0.55 && rnd() < 0.55,
            });
          }
        }
      }
    }
    return cells;
  }

  /** 远景院落：只出体块与屋顶剪影，省下 90% 的顶点。 */
  AddSilhouetteBlock(cell) {
    const rnd = Mulberry32(HashString(cell.seed + "sil"));
    const h = 2.4 + rnd() * 0.6;
    const mat = cell.burnt ? "BrickWallSooty" : "BrickWall";
    this.sink.Add(mat, PlaceGeometry(
      MakeBox(cell.w * 0.86, h, cell.d * 0.8, TILE_METERS.brick, cell.seed),
      { x: cell.x, y: h / 2, z: cell.z, ry: cell.ry }));
    this.sink.Solid(cell.x, h / 2, cell.z, cell.w * 0.43, h / 2, cell.d * 0.4, "wall");
    if (cell.damage < 0.6) {
      for (const s of [-1, 1]) {
        this.sink.Add("RoofTile", PlaceGeometry(
          MakeBox(cell.w * 0.92, 0.12, cell.d * 0.44, TILE_METERS.roof, `${cell.seed}r${s}`),
          { x: cell.x, y: h + 0.62, z: cell.z + s * cell.d * 0.2, ry: cell.ry, rx: -s * 0.44 }));
      }
    }
  }

  BuildTemple(rnd) {
    // 新关帝庙 / 山西会馆：池峰城的师指挥所。比清真寺更大更规整。
    const x = 148, z = 96;
    AddMosque(this.sink, { x, z, ry: Math.PI, damage: 0.3, seed: "guandi" });
    // 山西会馆的戏楼：一座两层的木构，是这一带最高的东西
    this.sink.Add("WoodBeam", PlaceGeometry(
      MakeBox(10, 0.4, 7, TILE_METERS.wood, "stage"), { x, y: 3.6, z: z + 9 }));
    for (let i = 0; i < 6; i += 1) {
      this.sink.Add("WoodBeam", PlaceGeometry(
        new THREE.CylinderGeometry(0.2, 0.22, 3.6, 8),
        { x: x - 4 + i * 1.6, y: 1.8, z: z + 6.2 }));
    }
  }

  BuildStation(rnd) {
    // 台儿庄站：清光绪二十五年建，一九三八年烧毁。做成烧过的砖砌站房 + 站台 + 断轨
    const x = -160, z = 140;
    AddWall(this.sink, "BrickWallSooty", {
      x, z: z - 8, length: 30, height: 4.2, thickness: 0.5, ry: 0,
      ruin: 0.55, seed: "station_n", plinth: "Stone",
    });
    AddWall(this.sink, "BrickWallSooty", {
      x, z: z + 6, length: 30, height: 3.6, thickness: 0.5, ry: 0,
      ruin: 0.7, seed: "station_s", plinth: "Stone",
    });
    for (const s of [-1, 1]) {
      AddWall(this.sink, "BrickWallSooty", {
        x: x + s * 15, z: z - 1, length: 14, height: 4.0, thickness: 0.5, ry: Math.PI / 2,
        ruin: 0.6, seed: `station_e${s}`, plinth: "Stone",
      });
    }
    // 站台与铁轨
    this.sink.Add("Stone", PlaceGeometry(MakeBox(44, 0.35, 4.5, TILE_METERS.stone, "platform"),
      { x, y: 0.18, z: z + 11 }));
    this.sink.Solid(x, 0.18, z + 11, 22, 0.18, 2.25, "prop");
    for (const rail of [-0.72, 0.72]) {
      this.sink.Add("Steel", PlaceGeometry(MakeBox(56, 0.14, 0.08, TILE_METERS.steel, `rail${rail}`),
        { x, y: 0.3, z: z + 16 + rail }));
    }
    for (let i = 0; i < 34; i += 1) {
      this.sink.Add("WoodBeam", PlaceGeometry(MakeBox(0.24, 0.14, 2.4, TILE_METERS.wood, `tie${i}`),
        { x: x - 27 + i * 1.65, y: 0.2, z: z + 16 }));
    }
  }

  BuildPavilion(rnd) {
    // 文昌阁：一座砖砌台基上的小楼。王冠五派特务连七十二人来复它。
    const x = -110, z = 20;
    this.sink.Add("Stone", PlaceGeometry(MakeBox(11, 1.5, 11, TILE_METERS.stone, "wc_base"),
      { x, y: 0.75, z }));
    this.sink.Solid(x, 0.75, z, 5.5, 0.75, 5.5, "wall");
    AddWall(this.sink, "BrickWallSooty", {
      x, z: z - 3.6, length: 8, height: 3.4, thickness: 0.45, ry: 0, ruin: 0.4,
      seed: "wc_n", plinth: null,
    });
    AddWall(this.sink, "BrickWallSooty", {
      x, z: z + 3.6, length: 8, height: 3.4, thickness: 0.45, ry: 0, ruin: 0.5,
      seed: "wc_s", plinth: null,
    });
    for (const s of [-1, 1]) {
      this.sink.Add("RoofTile", PlaceGeometry(MakeBox(10, 0.14, 4.6, TILE_METERS.roof, `wc_r${s}`),
        { x, y: 6.4, z: z + s * 2.0, rx: -s * 0.5 }));
    }
  }

  BuildBarricades(rnd) {
    // 街垒摆在占领点之间的主街上 —— 它标出战线在哪
    for (const o of OBJECTIVES) {
      const count = 2 + Math.floor(rnd() * 3);
      for (let i = 0; i < count; i += 1) {
        const a = rnd() * Math.PI * 2;
        const r = o.radius * (0.7 + rnd() * 0.6);
        const bx = o.x + Math.cos(a) * r, bz = o.z + Math.sin(a) * r;
        if (InLandmark(bx, bz, 2)) continue;
        AddBarricade(this.sink, {
          x: bx, z: bz, ry: rnd() * Math.PI, length: 4 + rnd() * 4,
          seed: `bar_${o.id}_${i}`, height: 1.0 + rnd() * 0.4,
        });
      }
    }
  }

  BuildProps(rnd) {
    // 电线杆：沿主街一路排下去。断掉的线是很强的战场符号。
    for (const x of STREETS_NS) {
      for (let z = WORLD.minZ + 30; z < WORLD.maxZ - 20; z += 46) {
        if (InLandmark(x + 2.8, z, 3)) continue;
        AddPole(this.sink, { x: x + 2.8, z, seed: `pole_${x}_${z}`, height: 6.0 + rnd() * 1.2 });
      }
    }
    // 树：杨柳，三四月枝条透光。街口与院外零星几棵。
    for (let i = 0; i < 34; i += 1) {
      const x = (rnd() - 0.5) * 460, z = (rnd() - 0.5) * 400;
      if (InLandmark(x, z, 6)) continue;
      AddTree(this.sink, { x, z, seed: `tree${i}`, scale: 0.85 + rnd() * 0.6 });
    }
    // 瓦砾：北边厚、南边薄
    const rubble = [];
    for (let i = 0; i < 4200; i += 1) {
      const x = (rnd() - 0.5) * 470, z = (rnd() - 0.5) * 420;
      const north = Clamp01((-z + 210) / 420);
      if (rnd() > 0.15 + north * 0.85) continue;
      rubble.push({ x, z, s: 0.06 + rnd() * 0.24, ry: rnd() * Math.PI * 2, rx: (rnd() - 0.5) * 0.7 });
    }
    this.sink.props.push({ kind: "rubbleScatter", list: rubble });
  }

  /** 把需要单独成 mesh 的东西（实例化的沙包、瓦砾）挂上去。 */
  FlushProps() {
    const dummy = new THREE.Object3D();
    const bagMatrices = [];
    const rubbleMatrices = [];
    for (const p of this.sink.props) {
      if (p.kind === "sandbags") { bagMatrices.push(...p.matrices); continue; }
      if (p.kind === "rubbleScatter") {
        for (const r of p.list) {
          dummy.position.set(r.x, this.GroundHeight(r.x, r.z) + r.s * 0.12, r.z);
          dummy.rotation.set(r.rx, r.ry, r.rx * 0.6);
          dummy.scale.set(r.s * 1.3, r.s * 0.55, r.s * 1.1);
          dummy.updateMatrix();
          rubbleMatrices.push(dummy.matrix.clone());
        }
        continue;
      }
      if (p.kind === "tree") AddTree(this.sink, p);
    }
    if (bagMatrices.length) {
      const mesh = MakeInstanced(MakeBox(0.62, 0.24, 0.34, TILE_METERS.sandbag, "bag"),
        this.library.Get("Sandbag"), bagMatrices);
      mesh.name = "Sandbags";
      this.scene.add(mesh);
      this.meshes.push(mesh);
    }
    if (rubbleMatrices.length) {
      const mesh = MakeInstanced(MakeBox(1, 1, 1, 0.32, "rubbleUnit"),
        this.library.Get("BrickWallSooty"), rubbleMatrices, { castShadow: false });
      mesh.name = "Rubble";
      this.scene.add(mesh);
      this.meshes.push(mesh);
    }
    this.sink.props.length = 0;
  }

  /** 空间散列：玩家/AI 每帧只查身边那一格的碰撞盒。 */
  BuildCollisionGrid() {
    this.grid.clear();
    const g = this.gridSize;
    for (const box of this.colliders) {
      const x0 = Math.floor(box.min[0] / g), x1 = Math.floor(box.max[0] / g);
      const z0 = Math.floor(box.min[2] / g), z1 = Math.floor(box.max[2] / g);
      for (let x = x0; x <= x1; x += 1) {
        for (let z = z0; z <= z1; z += 1) {
          const key = x * 100003 + z;
          if (!this.grid.has(key)) this.grid.set(key, []);
          this.grid.get(key).push(box);
        }
      }
    }
  }

  NearbyColliders(x, z, radius = 3) {
    const g = this.gridSize;
    const out = [];
    const x0 = Math.floor((x - radius) / g), x1 = Math.floor((x + radius) / g);
    const z0 = Math.floor((z - radius) / g), z1 = Math.floor((z + radius) / g);
    for (let gx = x0; gx <= x1; gx += 1) {
      for (let gz = z0; gz <= z1; gz += 1) {
        const list = this.grid.get(gx * 100003 + gz);
        if (list) for (const b of list) if (!out.includes(b)) out.push(b);
      }
    }
    return out;
  }

  /** 射线 vs 静态几何。用 AABB slab test，够快也够准（场景全是方料）。 */
  Raycast(origin, direction, maxDist = 200) {
    const g = this.gridSize;
    let best = null;
    // 沿射线走格子，只查经过的那些
    const steps = Math.ceil(maxDist / g) + 1;
    const seen = new Set();
    for (let i = 0; i <= steps; i += 1) {
      const t = (i / steps) * maxDist;
      const px = origin.x + direction.x * t, pz = origin.z + direction.z * t;
      const gx = Math.floor(px / g), gz = Math.floor(pz / g);
      for (let ox = -1; ox <= 1; ox += 1) {
        for (let oz = -1; oz <= 1; oz += 1) {
          const key = (gx + ox) * 100003 + (gz + oz);
          if (seen.has(key)) continue;
          seen.add(key);
          const list = this.grid.get(key);
          if (!list) continue;
          for (const box of list) {
            const hit = RayAabb(origin, direction, box, maxDist);
            if (hit !== null && (best === null || hit.t < best.t)) best = hit;
          }
        }
      }
      if (best && best.t < t) break;
    }
    return best;
  }

  Dispose() {
    for (const m of this.meshes) {
      this.scene.remove(m);
      m.geometry.dispose();
    }
    this.meshes.length = 0;
    if (this.groundMesh) { this.scene.remove(this.groundMesh); this.groundGeometry.dispose(); }
    this.grid.clear();
  }
}

/** 射线 vs 轴对齐盒（slab 法）。返回 { t, normal } 或 null。 */
export function RayAabb(origin, direction, box, maxDist) {
  let tmin = 0, tmax = maxDist;
  let axis = -1, sign = 1;
  const o = [origin.x, origin.y, origin.z];
  const d = [direction.x, direction.y, direction.z];
  for (let i = 0; i < 3; i += 1) {
    if (Math.abs(d[i]) < 1e-8) {
      if (o[i] < box.min[i] || o[i] > box.max[i]) return null;
      continue;
    }
    const inv = 1 / d[i];
    let t1 = (box.min[i] - o[i]) * inv;
    let t2 = (box.max[i] - o[i]) * inv;
    let s = -1;
    if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; s = 1; }
    if (t1 > tmin) { tmin = t1; axis = i; sign = s; }
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return null;
  }
  if (axis < 0) return null;
  const normal = [0, 0, 0];
  normal[axis] = sign;
  return { t: tmin, normal, box };
}
