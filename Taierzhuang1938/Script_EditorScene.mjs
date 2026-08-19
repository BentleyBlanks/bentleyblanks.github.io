// 场景编辑器：在**正在跑的这一关**里飞、摆、挖。
//
// ## 它编辑的是什么
// 滕县的城不是摆出来的资产，是 Script_TengxianCity 按 Data_Tengxian 的图纸
// **现生成**的（城墙、街、院落、地形全是程序化）。所以这个编辑器不去改那座城 ——
// 改它要改图纸与生成规则，那是源码层的事。
//
// 它做的是**叠加层**：
//   · 放置层：把 Script_World 里那批已经封装好的构件（院落、门楼、牌坊、警报楼、
//     沙包、防空洞、寨墙段…）与 Model/*.tzm 里那几个模型摆到地上；
//   · 地形层：一支笔刷，抬高 / 压低 / 挖坑 / 抹平。
// 两层都能存成 JSON 带走 —— 这是把「在现场调出来的位置」搬回图纸的通道。
//
// ## 地形笔刷改的是两样东西，必须同时改
//   1. 网格顶点（看得见的地）；
//   2. **解析高程 GroundHeight**（脚踩的地）。
// 只改前者的下场是「看着是个坑，人在坑口上平地走过去」——
// 城内地坪那 190 个弹坑现在就是这个状态（Script_TengxianCity 里写了这条账）。
// 所以这里把 field.GroundHeight 包一层，叠上笔刷的高程场。
//
// ## 一条纪律
// 放置层的碰撞盒是**真的**推进 city.colliders 的（否则摆出来的墙人能穿过去）。
// 退出编辑器时按 id 摘干净 —— 摘不干净的表现是「玩着玩着撞到空气」。

import * as THREE from "three";
import {
  Panel, Section, Slider, Chips, Toggle, Button, ButtonRow, Facts, Note, ListBox, TextArea, El,
} from "./Script_EditorUi.mjs";
import { PickWorld, ScreenRay } from "./Script_EditorStage.mjs";
import {
  BuildSink, AddTree, AddPole, AddWell, AddMillstone, AddWaterVat, AddBarricade,
  AddCompound, AddRoomBlock, AddGatehouse, AddRampart, AddDugout, AddPaifang,
  AddAlarmTower, AddSquareFort, AddChurch, AddMosque, AddSandbagPlug,
} from "./Script_World.mjs";
import { ResolveTengxianMaterial } from "./Script_TengxianCity.mjs";
import { MakeBox, MakeInstanced, TILE_METERS } from "./Script_Geo.mjs";
import { Mulberry32, HashString } from "./Script_Noise.mjs";
import { MESHES, MeshUrl, MeshIds } from "./Data_Meshes.mjs";
import { LoadDocument, InstantiateModel } from "./Script_MeshLoad.mjs";
import { PHASES } from "./Data_Battle.mjs";

const SAVE_KEY = "tengxian1938_sceneedit_v1";

/**
 * 可放置的东西。
 *   uses     这一条用得上哪几个参数（界面只画这几根滑杆）
 *   defaults 这一条的出厂参数
 *   build    (sink, item) → void。**用世界坐标建**，只有 y 由外面补
 *            （构件全部以 y=0 起砌，濠外原野在 -1.2，所以整组再往下挪一点）
 */
const PLACEABLE = [
  {
    id: "Tree", name: "树", cat: "景观", uses: ["scale"], defaults: { scale: 1.1 },
    build: (sink, it) => AddTree(sink, { x: it.x, z: it.z, seed: it.seed, scale: it.scale }),
  },
  {
    id: "Pole", name: "电线杆", cat: "景观", uses: ["h"], defaults: { h: 6.5 },
    build: (sink, it) => AddPole(sink, { x: it.x, z: it.z, seed: it.seed, height: it.h }),
  },
  {
    id: "Well", name: "水井", cat: "院落小件", uses: [], defaults: {},
    build: (sink, it) => AddWell(sink, it.x, it.z),
  },
  {
    id: "Millstone", name: "石磨", cat: "院落小件", uses: [], defaults: {},
    build: (sink, it) => AddMillstone(sink, it.x, it.z, it.seed),
  },
  {
    id: "WaterVat", name: "水缸", cat: "院落小件", uses: [], defaults: {},
    build: (sink, it) => AddWaterVat(sink, it.x, it.z, it.seed),
  },
  {
    id: "Barricade", name: "沙包路障", cat: "工事", uses: ["ry", "w", "h"],
    defaults: { w: 5, h: 1.15 },
    build: (sink, it) => AddBarricade(sink, {
      x: it.x, z: it.z, ry: it.ry, length: it.w, height: it.h, seed: it.seed,
    }),
  },
  {
    id: "SandbagPlug", name: "沙包封门", cat: "工事", uses: ["ry", "w", "h"],
    defaults: { w: 3.8, h: 2.6 },
    build: (sink, it) => AddSandbagPlug(sink, {
      x: it.x, z: it.z, ry: it.ry, openW: it.w, openH: it.h, depth: 2.4,
      seed: it.seed, mode: "partial",
    }),
  },
  {
    id: "Dugout", name: "防空洞口", cat: "工事", uses: ["ry", "w", "h", "d"],
    defaults: { w: 1.2, h: 1.6, d: 3.0 },
    build: (sink, it) => AddDugout(sink, {
      x: it.x, z: it.z, ry: it.ry, width: it.w, height: it.h, depth: it.d, seed: it.seed,
    }),
  },
  {
    id: "Rampart", name: "寨墙段", cat: "工事", uses: ["ry", "w", "h", "d"],
    defaults: { w: 24, h: 4.0, d: 2.2 },
    build: (sink, it) => AddRampart(sink, {
      x: it.x, z: it.z, ry: it.ry, length: it.w, height: it.h, thickness: it.d, seed: it.seed,
    }),
  },
  {
    id: "Compound", name: "四合院", cat: "建筑", uses: ["ry", "w", "d", "damage"],
    defaults: { w: 16, d: 14, damage: 0.2 },
    build: (sink, it) => AddCompound(sink, {
      x: it.x, z: it.z, ry: it.ry, width: it.w, depth: it.d, damage: it.damage, seed: it.seed,
    }),
  },
  {
    id: "RoomBlock", name: "房屋（单体）", cat: "建筑", uses: ["ry", "w", "d", "h", "damage"],
    defaults: { w: 9, d: 6, h: 3.0, damage: 0.15 },
    build: (sink, it) => AddRoomBlock(sink, {
      x: it.x, z: it.z, ry: it.ry, width: it.w, depth: it.d,
      eaveY: it.h, ridgeY: it.h * 1.7, seed: it.seed, damage: it.damage, facing: 1, bays: 3,
    }),
  },
  {
    id: "Gatehouse", name: "院门楼", cat: "建筑", uses: ["ry", "w", "damage"],
    defaults: { w: 1.5, damage: 0.1 },
    build: (sink, it) => AddGatehouse(sink, {
      x: it.x, z: it.z, ry: it.ry, seed: it.seed, damage: it.damage, openW: it.w,
    }),
  },
  {
    id: "Paifang", name: "牌坊", cat: "地标", uses: ["ry", "w", "h"],
    defaults: { w: 9, h: 7.2 },
    build: (sink, it) => AddPaifang(sink, {
      x: it.x, z: it.z, ry: it.ry, span: it.w, height: it.h, seed: it.seed,
    }),
  },
  {
    id: "AlarmTower", name: "警报楼", cat: "地标", uses: ["ry", "w", "h"],
    defaults: { w: 4.0, h: 9 },
    build: (sink, it) => AddAlarmTower(sink, {
      x: it.x, z: it.z, ry: it.ry, height: it.h, side: it.w, seed: it.seed,
    }),
  },
  {
    id: "SquareFort", name: "方形炮楼院", cat: "地标", uses: ["ry", "w", "d", "damage"],
    defaults: { w: 32, d: 32, damage: 0.3 },
    build: (sink, it) => AddSquareFort(sink, {
      x: it.x, z: it.z, ry: it.ry, w: it.w, d: it.d, damage: it.damage, seed: it.seed,
    }),
  },
  {
    id: "Church", name: "天主堂", cat: "地标", uses: ["ry", "w", "d", "h", "damage"],
    defaults: { w: 11, d: 24, h: 16, damage: 0.15 },
    build: (sink, it) => AddChurch(sink, {
      x: it.x, z: it.z, ry: it.ry, nave: [it.w, it.d], towerH: it.h,
      seed: it.seed, damage: it.damage,
    }),
  },
  {
    id: "Mosque", name: "清真寺", cat: "地标", uses: ["ry", "damage"], defaults: { damage: 0.4 },
    build: (sink, it) => AddMosque(sink, {
      x: it.x, z: it.z, ry: it.ry, seed: it.seed, damage: it.damage,
    }),
  },
];

/** Model/*.tzm.json 里那几个可以当道具摆的（人物模型不进这张表 —— 摆一个不动的兵是穿帮）。 */
const MODEL_PLACEABLE = MeshIds().filter((id) => {
  const entry = MESHES[id];
  return entry && (entry.category === "prop" || entry.category === "weapon");
});

for (const id of MODEL_PLACEABLE) {
  PLACEABLE.push({
    id: `Model_${id}`, name: MESHES[id].note ? `${id}` : id, cat: "模型",
    model: id, uses: ["ry", "scale", "h"], defaults: { scale: 1, h: 0 },
  });
}

const CATS = ["景观", "院落小件", "工事", "建筑", "地标", "模型"];

/** 笔刷的落差场：中间满、边缘平滑到 0（余弦），不是硬圆盘。 */
function BrushFalloff(distance, radius) {
  if (distance >= radius) return 0;
  return 0.5 + 0.5 * Math.cos((distance / radius) * Math.PI);
}

export class SceneEditor {
  static id = "scene";
  static label = "场景 / 地形";
  static hint = "自由飞行、摆构件、挖地形，可存成 JSON";

  constructor(host) {
    this.host = host;
    this.panel = null;
    this.cameraMode = "fly";

    this.items = [];
    this.nextId = 1;
    this.selected = null;
    this.paletteId = PLACEABLE[0].id;
    this.cat = "景观";
    this.mode = "look";         // look | place | move | terrain
    this.brush = { radius: 8, strength: 0.6, kind: "raise" };
    this.terrainOps = [];
    this.root = new THREE.Group();
    this.root.name = "EditorScenePlacements";
    this.ownedGeometries = [];
    this.colliderTag = "editorPlacement";
    this.modelDocs = new Map();
    this.normalsDirty = new Set();
    this.normalsTimer = 0;
    this.groundPatched = null;
    this.measure = { calls: 0, triangles: 0 };
    this.paramSliders = {};
  }

  get field() { return this.host.game.battlefield; }

  // -------------------------------------------------------------------------
  // 生命周期
  // -------------------------------------------------------------------------

  Enter(root) {
    this.host.scene.add(this.root);
    this.host.flycam.Open();
    this.host.SetViewmodelVisible(false);
    this.panel = Panel({
      title: "场景 / 地形编辑器", sub: "WASD+QE 飞 · 左键拖转头",
      variant: "work wide", onClose: () => this.host.Close(),
    });
    root.appendChild(this.panel.root);
    this.BuildUi(this.panel.body);
    this.PatchGround();
    this.LoadModels();
    // draw call 要按整帧量（一帧十几个 pass），关掉自动清零、每帧自己读自己清
    this.host.renderer.info.autoReset = false;
    this.Restore();
    return this;
  }

  Exit() {
    this.ClearBuilt();
    this.host.scene.remove(this.root);
    this.UnpatchGround();
    this.host.renderer.info.autoReset = true;
    this.host.flycam.Close();
    this.host.SetViewmodelVisible(true);
    if (this.panel) this.panel.root.remove();
    this.panel = null;
  }

  async LoadModels() {
    for (const id of MODEL_PLACEABLE) {
      if (this.modelDocs.has(id)) continue;
      const doc = await LoadDocument(MeshUrl(id));
      if (doc) this.modelDocs.set(id, doc);
    }
    // 载入前就摆下的模型这时候才补建出来
    if (this.items.some((it) => this.Entry(it.type) && this.Entry(it.type).model)) this.RebuildAll();
  }

  // -------------------------------------------------------------------------
  // 界面
  // -------------------------------------------------------------------------

  BuildUi(body) {
    const level = Section(body, "关卡切片");
    this.levelList = ListBox(level, {
      height: 132,
      onPick: (id) => {
        const index = PHASES.findIndex((p) => p.id === id);
        if (index >= 0) this.host.game.JumpToLevel(index);
      },
    });
    this.levelList.Fill(PHASES.map((p) => ({
      id: p.id, name: p.label, tail: p.date || "", title: p.brief || "",
    })));
    this.levelFacts = Facts(level);

    const cam = Section(body, "相机");
    Chips(cam, [
      { value: "look", label: "看" },
      { value: "place", label: "放置" },
      { value: "move", label: "挪动所选" },
      { value: "terrain", label: "地形笔刷" },
    ], this.mode, (v) => this.SetMode(v));
    Slider(cam, {
      label: "飞行速度", min: 1, max: 80, step: 1, value: 14,
      format: (v) => `${v.toFixed(0)} m/s`,
      onInput: (v) => { this.host.flycam.speed = v; },
    });
    ButtonRow(cam, [
      { label: "回到玩家", onClick: () => this.GoToPlayer() },
      { label: "把玩家挪来", onClick: () => this.BringPlayer() },
      { label: "俯瞰全城", onClick: () => this.TopDown() },
    ]);

    const put = Section(body, "构件库");
    Chips(put, CATS, this.cat, (v) => { this.cat = v; this.FillPalette(); });
    this.palette = ListBox(put, { height: 150, onPick: (id) => this.SetPalette(id) });
    this.FillPalette();
    this.paramBox = El("div", "b");
    put.appendChild(this.paramBox);
    this.BuildParams();

    const list = Section(body, "已放置");
    this.placedList = ListBox(list, {
      height: 120,
      onPick: (id) => { this.selected = this.items.find((it) => String(it.id) === String(id)) || null; },
    });
    ButtonRow(list, [
      { label: "撤销最后一个", onClick: () => this.Undo() },
      { label: "删除所选", onClick: () => this.DeleteSelected(), cls: "danger" },
      { label: "清空", onClick: () => this.ClearAll(), cls: "danger" },
    ]);
    const solid = El("div", "edBtns");
    list.appendChild(solid);
    this.solidToggle = Toggle(solid, "碰撞盒生效", true, () => this.RebuildAll());

    const terrain = Section(body, "地形笔刷");
    Chips(terrain, [
      { value: "raise", label: "抬高" },
      { value: "lower", label: "压低" },
      { value: "crater", label: "弹坑" },
      { value: "flatten", label: "抹平" },
    ], this.brush.kind, (v) => { this.brush.kind = v; });
    Slider(terrain, {
      label: "半径", min: 1, max: 40, step: 0.5, value: this.brush.radius,
      format: (v) => `${v.toFixed(1)} m`,
      onInput: (v) => { this.brush.radius = v; },
    });
    Slider(terrain, {
      label: "力度", min: 0.05, max: 3, step: 0.05, value: this.brush.strength,
      format: (v) => `${v.toFixed(2)} m/s`,
      onInput: (v) => { this.brush.strength = v; },
    });
    ButtonRow(terrain, [
      { label: "撤销一笔", onClick: () => this.UndoTerrain() },
      { label: "全部还原", onClick: () => this.ResetTerrain(), cls: "danger" },
    ]);
    Note(terrain, "笔刷同时改**网格顶点**与**解析高程**：看得见的地和踩得到的地一起变。"
      + "只改前者的话，人会在坑口上平地走过去。", true);

    const io = Section(body, "存取");
    ButtonRow(io, [
      { label: "存到本地", onClick: () => this.Save() },
      { label: "读回", onClick: () => this.Restore(true) },
      { label: "导出到框里", onClick: () => { this.io.value = JSON.stringify(this.Serialize()); } },
      { label: "从框里导入", onClick: () => this.Import(this.io.value) },
    ]);
    this.io = TextArea(io, { rows: 3, placeholder: "{ \"v\":1, \"items\":[…], \"terrain\":[…] }" });
    this.ioNote = Note(io, `本地存档键：${SAVE_KEY}`);

    const stats = Section(body, "取证");
    this.facts = Facts(stats);
  }

  Entry(id) { return PLACEABLE.find((p) => p.id === id) || null; }

  FillPalette() {
    const items = PLACEABLE.filter((p) => p.cat === this.cat);
    this.palette.Fill(items.map((p) => ({
      id: p.id, name: p.name, tail: p.model ? "tzm" : "程序化",
      title: p.model && MESHES[p.model] ? MESHES[p.model].note : "",
    })));
    if (items.length && !items.some((p) => p.id === this.paletteId)) this.SetPalette(items[0].id);
    this.palette.Select(this.paletteId);
  }

  SetPalette(id) {
    this.paletteId = id;
    this.BuildParams();
  }

  /** 参数滑杆按当前构件重画 —— 只画它用得上的那几根。 */
  BuildParams() {
    if (!this.paramBox) return;
    this.paramBox.innerHTML = "";
    this.paramSliders = {};
    const entry = this.Entry(this.paletteId);
    if (!entry) return;
    const uses = entry.model ? ["ry", "scale", "h"] : entry.uses;
    const spec = {
      ry: { label: "朝向", min: 0, max: 6.283, step: 0.02, def: 0, fmt: (v) => `${(v * 57.3).toFixed(0)}°` },
      w: { label: "宽 / 长", min: 0.5, max: 60, step: 0.1, def: 8 },
      d: { label: "深 / 厚", min: 0.5, max: 60, step: 0.1, def: 6 },
      h: { label: "高", min: 0, max: 24, step: 0.1, def: 3 },
      scale: { label: "缩放", min: 0.2, max: 4, step: 0.05, def: 1 },
      damage: { label: "破损", min: 0, max: 1, step: 0.02, def: 0.2 },
    };
    this.paramValues = { ry: 0, seed: `e${this.nextId}` };
    for (const key of uses) {
      const s = spec[key];
      if (!s) continue;
      const value = entry.defaults[key] != null ? entry.defaults[key] : s.def;
      this.paramValues[key] = value;
      this.paramSliders[key] = Slider(this.paramBox, {
        label: s.label, min: s.min, max: s.max, step: s.step, value,
        format: s.fmt || null,
        onInput: (v) => {
          this.paramValues[key] = v;
          // 选中了某一个就实时改它 —— 「摆好了再调一版」是最常用的动作
          if (this.selected && this.selected.type === this.paletteId) {
            this.selected[key] = v;
            this.RebuildAll();
          }
        },
      });
    }
    Slider(this.paramBox, {
      label: "种子", min: 0, max: 60, step: 1, value: 0,
      format: (v) => v.toFixed(0),
      onInput: (v) => { this.paramValues.seed = `e${v}`; },
    });
  }

  SetMode(mode) {
    this.mode = mode;
    this.host.SetCrosshair(mode === "place" || mode === "move" || mode === "terrain");
    const text = {
      look: "",
      place: "左键点地面放一个；右键拖动转视角",
      move: "先在「已放置」里选一个，再左键点目标位置",
      terrain: "左键按住涂；Shift 反向",
    }[mode];
    this.host.SetHint(text);
  }

  // -------------------------------------------------------------------------
  // 相机
  // -------------------------------------------------------------------------

  GoToPlayer() {
    const player = this.host.game.player;
    if (!player) return;
    const camera = this.host.camera;
    camera.position.copy(player.EyePosition ? player.EyePosition : player.position);
    this.host.flycam.yaw = player.yaw || 0;
    this.host.flycam.pitch = 0;
  }

  BringPlayer() {
    const player = this.host.game.player;
    const camera = this.host.camera;
    if (!player || !player.Spawn) return;
    player.Spawn(camera.position.x, camera.position.z, this.host.flycam.yaw);
    this.host.SetHint("玩家已挪到当前机位");
  }

  TopDown() {
    const camera = this.host.camera;
    const bounds = this.field ? this.field.bounds : { minX: -300, maxX: 300, minZ: -300, maxZ: 300 };
    const cx = (bounds.minX + bounds.maxX) / 2;
    const cz = (bounds.minZ + bounds.maxZ) / 2;
    const span = Math.max(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ);
    camera.position.set(cx, span * 0.75 + 60, cz + span * 0.35);
    this.host.flycam.yaw = 0;
    this.host.flycam.pitch = -0.9;
  }

  // -------------------------------------------------------------------------
  // 视口交互（由 EditorSuite 转发）
  // -------------------------------------------------------------------------

  Pick(event) {
    const camera = this.host.camera;
    const direction = ScreenRay(camera, this.host.canvas, event.clientX, event.clientY);
    return PickWorld(this.field, camera.position, direction, { maxDist: 600 });
  }

  OnClick(event, button) {
    if (button !== 0) return;
    const hit = this.Pick(event);
    if (!hit) { this.host.SetHint("这个方向上没有地面"); return; }
    if (this.mode === "place") this.Place(hit.x, hit.z);
    else if (this.mode === "move" && this.selected) {
      this.selected.x = hit.x; this.selected.z = hit.z;
      this.RebuildAll();
    }
  }

  OnPaint(event, button) {
    if (this.mode !== "terrain" || button !== 0) return;
    const hit = this.Pick(event);
    if (!hit) return;
    this.PaintTerrain(hit.x, hit.z, event.shiftKey);
  }

  // -------------------------------------------------------------------------
  // 放置
  // -------------------------------------------------------------------------

  Place(x, z) {
    const entry = this.Entry(this.paletteId);
    if (!entry) return;
    const item = {
      id: this.nextId, type: entry.id, x, z,
      ry: this.paramValues.ry || 0,
      seed: this.paramValues.seed || `e${this.nextId}`,
    };
    this.nextId += 1;
    for (const key of ["w", "d", "h", "scale", "damage"]) {
      if (this.paramValues[key] != null) item[key] = this.paramValues[key];
    }
    this.items.push(item);
    this.selected = item;
    this.RebuildAll();
  }

  Undo() {
    this.items.pop();
    this.selected = null;
    this.RebuildAll();
  }

  DeleteSelected() {
    if (!this.selected) return;
    this.items = this.items.filter((it) => it !== this.selected);
    this.selected = null;
    this.RebuildAll();
  }

  ClearAll() {
    this.items = [];
    this.selected = null;
    this.RebuildAll();
  }

  /** 把本层建过的东西全拆掉（几何是我们自己合批出来的，必须 dispose）。 */
  ClearBuilt() {
    for (let i = this.root.children.length - 1; i >= 0; i -= 1) this.root.remove(this.root.children[i]);
    for (const geometry of this.ownedGeometries) geometry.dispose();
    this.ownedGeometries.length = 0;
    this.DropColliders();
  }

  DropColliders() {
    const field = this.field;
    if (!field || !field.city) return;
    const before = field.city.colliders.length;
    const kept = field.city.colliders.filter((box) => box.tag !== this.colliderTag);
    if (kept.length !== before) {
      field.city.colliders.length = 0;
      field.city.colliders.push(...kept);
      field.city.BuildCollisionGrid();
    }
  }

  RebuildAll() {
    this.ClearBuilt();
    const library = this.host.library;
    const field = this.field;
    const addColliders = !this.solidToggle || this.solidToggle.value;
    const colliders = [];
    for (const item of this.items) {
      const entry = this.Entry(item.type);
      if (!entry) continue;
      const groundY = field ? field.GroundHeight(item.x, item.z) : 0;
      const node = new THREE.Group();
      node.name = `Placed_${item.type}_${item.id}`;
      node.position.y = groundY;
      if (entry.model) {
        this.BuildModelItem(node, entry, item);
      } else {
        const sink = new BuildSink();
        try {
          entry.build(sink, item);
        } catch (error) {
          console.warn(`[SceneEditor] ${entry.id} 建不出来：${String(error).slice(0, 160)}`);
        }
        FlushSinkProps(sink, node, library, this.ownedGeometries);
        for (const mesh of sink.Flush(node, library, { resolve: ResolveTengxianMaterial })) {
          this.ownedGeometries.push(mesh.geometry);
        }
        if (addColliders) {
          for (const box of sink.colliders) {
            colliders.push({
              min: [box.min[0], box.min[1] + groundY, box.min[2]],
              max: [box.max[0], box.max[1] + groundY, box.max[2]],
              tag: this.colliderTag,
            });
          }
        }
      }
      this.root.add(node);
      item.node = node;
    }
    if (colliders.length && field && field.city) {
      field.city.colliders.push(...colliders);
      field.city.BuildCollisionGrid();
    }
    this.RefreshPlacedList();
  }

  BuildModelItem(node, entry, item) {
    const doc = this.modelDocs.get(entry.model);
    if (!doc) return;
    const spec = MESHES[entry.model];
    const materials = {};
    for (const name of spec.materials) materials[name] = ResolveTengxianMaterial(name, this.host.library);
    // 枪的材质名（steel / wood）不在城的材质表里，退回材质库的同名配方
    const built = InstantiateModel(doc, { materials });
    built.root.position.set(item.x, item.h || 0, item.z);
    built.root.rotation.y = item.ry || 0;
    const scale = item.scale || 1;
    built.root.scale.setScalar(scale);
    node.add(built.root);
  }

  RefreshPlacedList() {
    if (!this.placedList) return;
    this.placedList.Fill(this.items.map((it) => ({
      id: String(it.id),
      name: `${(this.Entry(it.type) || {}).name || it.type}`,
      tail: `${it.x.toFixed(0)}, ${it.z.toFixed(0)}`,
    })));
    if (this.selected) this.placedList.Select(String(this.selected.id));
  }

  // -------------------------------------------------------------------------
  // 地形
  // -------------------------------------------------------------------------

  /** 把 field.GroundHeight 包一层，叠上笔刷的高程场。 */
  PatchGround() {
    const field = this.field;
    if (!field || this.groundPatched === field) return;
    const base = field.GroundHeight.bind(field);
    field.GroundHeight = (x, z) => base(x, z) + this.TerrainDelta(x, z);
    field.__editorBaseGroundHeight = base;
    this.groundPatched = field;
  }

  UnpatchGround() {
    const field = this.groundPatched;
    if (!field) return;
    if (field.__editorBaseGroundHeight) {
      field.GroundHeight = field.__editorBaseGroundHeight;
      delete field.__editorBaseGroundHeight;
    }
    this.groundPatched = null;
  }

  TerrainDelta(x, z) {
    let delta = 0;
    for (const op of this.terrainOps) {
      const distance = Math.hypot(x - op.x, z - op.z);
      if (distance >= op.r) continue;
      delta += op.amount * BrushFalloff(distance, op.r);
    }
    return delta;
  }

  PaintTerrain(x, z, invert) {
    const kind = this.brush.kind;
    const radius = this.brush.radius;
    let amount = this.brush.strength * (1 / 30);   // 一「笔」≈ 一帧的量
    if (kind === "lower" || invert) amount = -Math.abs(amount);
    if (kind === "raise" && !invert) amount = Math.abs(amount);
    if (kind === "crater") {
      // 弹坑是一次成型的：一笔挖到位，再点一次是第二个坑，不是越挖越深
      amount = -this.brush.strength;
      this.terrainOps.push({ x, z, r: radius, amount, once: true });
      this.ApplyTerrainToMesh(x, z, radius, amount);
      return;
    }
    if (kind === "flatten") {
      // 抹平：把这一片的**编辑量**按比例收回去，回到原始地形
      const before = this.TerrainDelta(x, z);
      if (Math.abs(before) < 1e-4) return;
      const back = -before * 0.12;
      this.terrainOps.push({ x, z, r: radius, amount: back });
      this.ApplyTerrainToMesh(x, z, radius, back);
      return;
    }
    this.terrainOps.push({ x, z, r: radius, amount });
    this.ApplyTerrainToMesh(x, z, radius, amount);
  }

  /**
   * 把这一笔的位移写进地面网格。
   *
   * 只动名字叫 CityPlatform / OuterGround 的两张网格 —— 它们是**世界坐标直存**的
   * （没有父变换），position 属性里的 x/z 就是世界 x/z，可以直接比距离。
   * 法线重算很贵（城外那张有十几万顶点），所以攒着，停笔 0.2 秒之后再算一次。
   */
  ApplyTerrainToMesh(x, z, radius, amount) {
    const field = this.field;
    if (!field || !field.city) return;
    for (const mesh of field.city.meshes) {
      if (mesh.name !== "CityPlatform" && mesh.name !== "OuterGround") continue;
      const position = mesh.geometry.attributes.position;
      let touched = false;
      for (let i = 0; i < position.count; i += 1) {
        const vx = position.getX(i);
        const vz = position.getZ(i);
        const distance = Math.hypot(vx - x, vz - z);
        if (distance >= radius) continue;
        position.setY(i, position.getY(i) + amount * BrushFalloff(distance, radius));
        touched = true;
      }
      if (touched) {
        position.needsUpdate = true;
        mesh.geometry.computeBoundingSphere();
        this.normalsDirty.add(mesh);
        this.normalsTimer = 0.2;
      }
    }
  }

  UndoTerrain() {
    const op = this.terrainOps.pop();
    if (!op) return;
    this.ApplyTerrainToMesh(op.x, op.z, op.r, -op.amount);
  }

  ResetTerrain() {
    for (const op of this.terrainOps) this.ApplyTerrainToMesh(op.x, op.z, op.r, -op.amount);
    this.terrainOps.length = 0;
  }

  // -------------------------------------------------------------------------
  // 存取
  // -------------------------------------------------------------------------

  Serialize() {
    return {
      v: 1,
      level: PHASES[this.host.game.state.phaseIndex] ? PHASES[this.host.game.state.phaseIndex].id : null,
      items: this.items.map((it) => {
        const copy = { ...it };
        delete copy.node;
        return copy;
      }),
      terrain: this.terrainOps.map((op) => ({ ...op })),
    };
  }

  Save() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(this.Serialize()));
      this.ioNote.textContent = `已存：${this.items.length} 个构件 / ${this.terrainOps.length} 笔地形`;
    } catch (error) {
      this.ioNote.textContent = `存不进去：${String(error).slice(0, 80)}`;
    }
  }

  Restore(loud = false) {
    let raw = null;
    try { raw = localStorage.getItem(SAVE_KEY); } catch (error) { raw = null; }
    if (!raw) { if (loud) this.ioNote.textContent = "本地没有存档"; return; }
    this.Import(raw, loud);
  }

  Import(text, loud = true) {
    let data = null;
    try { data = JSON.parse(text); } catch (error) { data = null; }
    if (!data || !Array.isArray(data.items)) {
      if (loud) this.ioNote.textContent = "读不出来：JSON 不对";
      return;
    }
    this.ResetTerrain();
    this.items = data.items.map((it) => ({ ...it }));
    this.nextId = this.items.reduce((a, it) => Math.max(a, (it.id || 0) + 1), 1);
    this.selected = null;
    this.RebuildAll();
    for (const op of data.terrain || []) {
      this.terrainOps.push({ ...op });
      this.ApplyTerrainToMesh(op.x, op.z, op.r, op.amount);
    }
    this.ioNote.textContent = `读回：${this.items.length} 个构件 / ${this.terrainOps.length} 笔地形`
      + (data.level ? `（存的是 ${data.level}）` : "");
  }

  // -------------------------------------------------------------------------
  // 每帧
  // -------------------------------------------------------------------------

  Update(dt) {
    this.host.flycam.Update(dt);

    // 关卡切片换过之后：包过的 GroundHeight、放置层的碰撞盒、地形的顶点位移
    // 三样都还挂在**上一份** city 上，得整套搬到新的那一份上去。
    //
    // **时机只能是 state.ready 重新变回 true 的那一刻**，不能是「battlefield 变了」
    // 那一刻。BuildField 一进门就把新的 TengxianField 赋上了，而它的 BuildSteps
    // 走到最后会 `this.colliders = sink.colliders.concat(farSink.colliders)` ——
    // **整根换掉那个数组**。在那之前推进去的碰撞盒会被连锅端走；
    // 地形位移更早，那时候地面网格连建都还没建。
    // 症状是「换完关，摆的院子还在但人从墙中间走过去，坑只剩解析高程没有形」。
    if (this.field && this.host.game.state.ready && this.groundPatched !== this.field) {
      this.UnpatchGround();
      this.PatchGround();
      this.RebuildAll();
      for (const op of this.terrainOps) this.ApplyTerrainToMesh(op.x, op.z, op.r, op.amount);
    }

    if (this.normalsTimer > 0) {
      this.normalsTimer -= dt;
      if (this.normalsTimer <= 0) {
        for (const mesh of this.normalsDirty) mesh.geometry.computeVertexNormals();
        this.normalsDirty.clear();
      }
    }

    if (this.host.lights) {
      const camera = this.host.camera;
      const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
      this.host.lights.UpdateShadowFrustum(camera.position, forward);
    }

    // 上一帧整帧的绘制量（autoReset 已关，这里读完自己清）
    const info = this.host.renderer.info;
    this.measure.calls = info.render.calls;
    this.measure.triangles = info.render.triangles;
    info.reset();

    this.RefreshFacts();
  }

  RefreshFacts() {
    const f = this.facts;
    const field = this.field;
    if (!f) return;
    const phase = PHASES[this.host.game.state.phaseIndex];
    const camera = this.host.camera;
    if (phase && this.levelList) this.levelList.Select(phase.id);
    if (this.levelFacts && phase) {
      this.levelFacts.Set("当前关", `${phase.id} · ${phase.label}`);
      this.levelFacts.Set("切片", `X ${phase.bounds.minX}…${phase.bounds.maxX}  `
        + `Z ${phase.bounds.minZ}…${phase.bounds.maxZ}`);
      this.levelFacts.Set("天光", phase.sky);
    }
    f.Set("机位", `${camera.position.x.toFixed(1)}, ${camera.position.y.toFixed(1)}, `
      + `${camera.position.z.toFixed(1)}`);
    f.Set("脚下地高", field ? `${field.GroundHeight(camera.position.x, camera.position.z).toFixed(2)} m` : "—");
    f.Set("draw call", this.measure.calls, this.measure.calls > 1400 ? "bad" : "good");
    f.Set("三角", `${(this.measure.triangles / 1000).toFixed(0)}k`,
      this.measure.triangles > 3200000 ? "bad" : "good");
    f.Set("城的网格", field ? field.meshes.length : 0);
    f.Set("碰撞盒", field && field.city ? field.city.colliders.length : 0);
    f.Set("放置 / 地形", `${this.items.length} 个 / ${this.terrainOps.length} 笔`);
    f.Set("选中", this.selected
      ? `${(this.Entry(this.selected.type) || {}).name} @ ${this.selected.x.toFixed(1)}, ${this.selected.z.toFixed(1)}`
      : "（无）");
  }
}

/**
 * 把 sink.props 里那几种「不能合批的东西」就地展开成几何。
 *
 * TengxianCity 有自己的 FlushProps（沙包走 InstancedMesh、瓦砾堆走另一个），
 * 那一份和城的生命周期绑在一起，这里不能借。**不展开的后果不是难看，是消失** ——
 * AddBarricade 整条沙包墙都在 props 里，不展开的话点了「沙包路障」什么也不出现。
 */
function FlushSinkProps(sink, target, library, owned) {
  const matrices = [];
  for (const prop of sink.props) {
    if (prop.kind === "sandbags") { matrices.push(...prop.matrices); continue; }
    if (prop.kind === "tree") { AddTree(sink, prop); continue; }
    if (prop.kind === "rubblePile" || prop.kind === "breachSpill") {
      const rnd = Mulberry32(HashString(prop.seed || "pile"));
      const n = prop.kind === "breachSpill" ? 26 : 34;
      for (let i = 0; i < n; i += 1) {
        const a = rnd() * Math.PI * 2;
        const r = rnd() * (prop.radius || 3);
        const s = 0.16 + rnd() * 0.5;
        // 瓦砾用普通盒子并进砖桶：编辑器里几十块碎砖不值得再起一个 InstancedMesh
        sink.Add("CityBrickWorn",
          MakeBox(s * 1.4, s * 0.6, s * 1.2, 0.32, `r${i}`)
            .translate(prop.x + Math.cos(a) * r, s * 0.3, prop.z + Math.sin(a) * r));
      }
      continue;
    }
  }
  sink.props.length = 0;
  if (matrices.length) {
    const geometry = MakeBox(0.62, 0.24, 0.34, TILE_METERS.sandbag, "bag");
    const mesh = MakeInstanced(geometry, ResolveTengxianMaterial("Sandbag", library), matrices);
    mesh.name = "PlacedSandbags";
    target.add(mesh);
    owned.push(geometry);
  }
}

export default SceneEditor;
