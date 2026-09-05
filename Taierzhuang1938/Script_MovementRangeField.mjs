// Whitebox fixtures, paint and readable metre rulers share one batched geometry source.
import * as THREE from "three";
import { RangeField } from "./Script_RangeField.mjs";
import { BuildSink } from "./Script_World.mjs";
import { MakeBox, PlaceGeometry } from "./Script_Geo.mjs";
import { TRAVERSAL } from "./Data_Traversal.mjs";
import { PlayerMovementReference } from "./Script_Player.mjs";
import { MOVEMENT_RANGE_ID, MOVEMENT_RANGE_WORLD, MOVEMENT_RANGE_STATIONS,
  MOVEMENT_FIXTURES, MOVEMENT_RUNWAY } from "./Data_MovementRange.mjs";

const PALETTE = { Floor: 0xabb2b7, White: 0xdce0e1, Ink: 0x303d48, Grid: 0x929da5,
  Blue: 0x267abd, Green: 0x419165, Orange: 0xce843a, Purple: 0x8266b0, Cyan: 0x368c99, Red: 0xb75051 };
const Metres = value => value.toFixed(2) + ' m';
export function MovementRangeSigns() {
  const ref = PlayerMovementReference();
  return [
    { id: 'Welcome', text: '操作交互测试场', sub: '单位 m · Home 复位 · PgUp / PgDn 切区' },
    ...MOVEMENT_RANGE_STATIONS.map(s => ({ id: s.id, text: s.name,
      sub: s.id === 'RunJump' ? 'Shift + W 助跑 → Space 起跳' : s.id === 'Vault' ? '贴近后 Space · 橙翻越 / 紫攀爬 / 红超限'
        : s.id === 'Jump' ? '提前起跳测障碍 · 贴近 Space 会优先翻越'
          : s.id === 'Crouch' ? 'C 蹲起 · W / A / S / D · 低顶下切姿态'
            : 'Z 趴下 · W / A / S / D · Shift 快速匍匐' })),
    ...MOVEMENT_FIXTURES.map(f => ({ id: f.id,
      text: (f.kind === 'tunnel' ? '净空 ' + Metres(f.clearance) : '高度 ' + Metres(f.h)),
      sub: f.kind === 'tunnel' ? '长 7 m · 入内 / 起身 / 退回' :
        f.h > TRAVERSAL.mantleMax ? '超过攀爬上限 · 阻挡对照' :
        f.h === TRAVERSAL.mantleMax ? '攀爬最高档' :
        f.h === TRAVERSAL.vaultMax ? '翻越最高档' :
        f.h <= TRAVERSAL.stepMax ? '可自动跨步 · 不能当跳跃成绩' : '以实测动作类型判定' })),
    { id: 'JumpReference', text: '空地跃起理论参考', sub: '原地 ' + Metres(ref.standingRiseM) + ' / 满助跑 ' + Metres(ref.runningRiseM) },
    { id: 'JumpLimit', text: '跳跃设计上限 ' + Metres(TRAVERSAL.jumpRiseMax), sub: '红线为参数限值 · 实际峰值看记录' },
    { id: 'VaultReference', text: '翻越 ' + Metres(TRAVERSAL.vaultMax) + ' / 攀爬 ' + Metres(TRAVERSAL.mantleMax),
      sub: '水平位移：翻越 ' + Metres(TRAVERSAL.vaultReachM) + ' / 攀爬 ' + Metres(TRAVERSAL.mantleReachM) },
    { id: 'RunZero', text: '0 m · 起跳参考线', sub: '成绩按真实起跳 → 落地点计算' },
    { id: 'RunBest', text: '会话最远跑跳', sub: '黄线 = 从 0 m 投影的实测最佳距离' },
    ...Array.from({ length: 17 }, (_, i) => ({ id: 'Distance' + i, text: Metres(i / 2), sub: '' })),
    ...Array.from({ length: 7 }, (_, i) => ({ id: 'Height' + i, text: Metres(i / 2), sub: '脚底基准 0 m' })),
  ];
}
function MakeAtlas(signs) {
  const cols = 4, tileW = 768, tileH = 160, rows = Math.ceil(signs.length / cols);
  const canvas = document.createElement('canvas'); canvas.width = cols * tileW; canvas.height = rows * tileH;
  const ctx = canvas.getContext('2d'), rects = new Map();
  ctx.fillStyle = '#edf1f2'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  signs.forEach((sign, i) => {
    const x = i % cols * tileW, y = Math.floor(i / cols) * tileH;
    ctx.fillStyle = '#263f50'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = 'bold 49px sans-serif'; ctx.fillText(sign.text, x + tileW / 2, y + 57, tileW - 30);
    ctx.font = '27px sans-serif'; ctx.fillText(sign.sub, x + tileW / 2, y + 121, tileW - 30);
    rects.set(sign.id, { u0: (x + 2) / canvas.width, u1: (x + tileW - 2) / canvas.width,
      v0: 1 - (y + tileH - 2) / canvas.height, v1: 1 - (y + 2) / canvas.height });
  });
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 8;
  return { texture, rects };
}
export class MovementRangeField extends RangeField {
  constructor(scene, library, options = {}) {
    super(scene, library, { bounds: MOVEMENT_RANGE_WORLD, zones: MOVEMENT_RANGE_STATIONS, levelId: MOVEMENT_RANGE_ID, ...options });
    this.worldLimits = MOVEMENT_RANGE_WORLD; this.cameraFar = 160; this.generatedExternalProps = [];
    this.materials = new Map(Object.entries(PALETTE).map(([name, color]) => [name,
      new THREE.MeshStandardMaterial({ name: 'MovementRange' + name, color, roughness: 0.92 })]));
    this.signManifest = MovementRangeSigns();
  }
  Block(sink, name, id, x, y, z, w, h, d, solid = false) {
    sink.Add(name, PlaceGeometry(MakeBox(w, h, d, 1, id), { x, y, z }));
    if (solid) sink.Solid(x, y, z, w / 2, h / 2, d / 2, 'movementFixture');
    this.stats.structures++;
  }
  Sign(sink, id, x, y, z, w = 3.6, h = 0.75, ground = false) {
    const g = new THREE.PlaneGeometry(w, h), uv = g.getAttribute('uv'), rect = this.atlas.rects.get(id);
    for (let i = 0; i < uv.count; i++) uv.setXY(i, rect.u0 + uv.getX(i) * (rect.u1 - rect.u0), rect.v0 + uv.getY(i) * (rect.v1 - rect.v0));
    sink.Add('Signs', PlaceGeometry(g, { x, y, z, rx: ground ? -Math.PI / 2 : 0 }));
  }
  Ruler(sink, x, z, maxY) {
    this.Block(sink, 'White', 'RulerBack', x, maxY / 2, z, 1.7, maxY + 0.15, 0.12);
    for (let i = 0; i <= Math.round(maxY * 10); i++) {
      this.Block(sink, 'Ink', 'RulerTick' + i, x - 0.6, i / 10, z + 0.07, i % 5 === 0 ? 0.45 : 0.23, 0.012, 0.012);
      if (i % 5 === 0) this.Sign(sink, 'Height' + i / 5, x + 0.24, Math.max(0.10, i / 10), z + 0.08, 0.85, 0.19);
    }
  }
  *BuildSteps() {
    yield { label: '操作白盒：五区工位与标尺', progress: 0.3 };
    const sink = new BuildSink(), b = this.bounds, r = MOVEMENT_RUNWAY;
    this.atlas = MakeAtlas(this.signManifest);
    this.materials.set('Signs', new THREE.MeshBasicMaterial({ name: 'MovementRangeSigns', map: this.atlas.texture, side: THREE.DoubleSide, toneMapped: false }));
    sink.SetSector('MovementFloor');
    this.Block(sink, 'Floor', 'Floor', (b.minX + b.maxX) / 2, -0.1, (b.minZ + b.maxZ) / 2, b.maxX - b.minX, 0.2, b.maxZ - b.minZ);
    this.stats.groundChunks = 1; this.stats.groundTris = 12;
    for (let x = b.minX + 2; x < b.maxX; x += 2) this.Block(sink, 'Grid', 'GridX' + x, x, 0.003, (b.minZ + b.maxZ) / 2, 0.015, 0.006, b.maxZ - b.minZ);
    for (let z = b.minZ + 2; z < b.maxZ; z += 2) this.Block(sink, 'Grid', 'GridZ' + z, (b.minX + b.maxX) / 2, 0.003, z, b.maxX - b.minX, 0.006, 0.015);
    for (const x of [b.minX, b.maxX]) this.Block(sink, 'Ink', 'BoundaryX' + x, x, 1.6, (b.minZ+b.maxZ)/2, 0.3, 3.2, b.maxZ-b.minZ, true);
    for (const z of [b.minZ, b.maxZ]) this.Block(sink, 'Ink', 'BoundaryZ' + z, (b.minX+b.maxX)/2, 1.6, z, b.maxX-b.minX, 3.2, 0.3, true);
    this.Sign(sink, 'Welcome', 3183, 2.8, 3182, 7, 1.45);
    for (const s of MOVEMENT_RANGE_STATIONS) {
      sink.SetSector('Movement' + s.id);
      this.Block(sink, s.color, s.id + 'Start', s.x, 0.012, s.z, 3, 0.024, 0.16);
      this.Sign(sink, s.id, s.x, 3.0, s.z - 5.5, 5, 1.04);
      // Overhead headers leave the eye-level approach unobstructed; floor copy stays readable.
      this.Sign(sink, s.id, s.x, 0.026, s.z + 1.4, 5, 1.04, true);
    }
    for (const f of MOVEMENT_FIXTURES) {
      sink.SetSector('Movement' + f.station);
      if (f.kind === 'height') {
        this.Block(sink, f.color, f.id, f.x, f.h / 2, f.z, f.w, f.h, f.d, true);
        this.Block(sink, 'White', f.id + 'Top', f.x, f.h - 0.012, f.z, f.w, 0.024, f.d);
        this.Sign(sink, f.id, f.x, 1.9 + f.h * 0.25, f.z - 0.4, 3.4, 0.71);
        this.Ruler(sink, f.x + f.w / 2 + 1.0, f.z, Math.ceil(f.h * 2) / 2);
      } else {
        for (const side of [-1, 1]) this.Block(sink, f.color, f.id + 'Side' + side,
          f.x + side * (f.w / 2 + 0.1), (f.clearance + 0.2) / 2, f.z, 0.2, f.clearance + 0.2, f.d, true);
        this.Block(sink, 'White', f.id + 'Roof', f.x, f.clearance + 0.1, f.z, f.w, 0.2, f.d, true);
        this.Sign(sink, f.id, f.x, f.clearance + 0.9, f.z + f.d / 2, 3.4, 0.71);
        for (let i = 0; i <= 10; i++) this.Block(sink, f.color, f.id + 'Metre' + i, f.x, 0.014, f.z + 5 - i, f.w, 0.028, i % 5 ? 0.035 : 0.09);
        this.Sign(sink, 'Distance0', f.x, 0.03, f.z + 5.4, 1.5, 0.4, true);
        this.Sign(sink, 'Distance10', f.x, 0.03, f.z + 0.4, 1.5, 0.4, true);
      }
    }
    sink.SetSector('MovementJump');
    this.Ruler(sink, 3173, 3201, 1.5);
    const ref = PlayerMovementReference();
    for (const [id, h, color] of [['Standing', ref.standingRiseM, 'Blue'], ['Running', ref.runningRiseM, 'Green'], ['Limit', TRAVERSAL.jumpRiseMax, 'Red']])
      this.Block(sink, color, id + 'HeightLine', 3173, h, 3201.09, 1.7, 0.014, 0.015);
    this.Sign(sink, 'JumpReference', 3164, 2.6, 3184, 6, 1.25);
    this.Sign(sink, 'JumpLimit', 3164, 1.2, 3184, 6, 1.25);
    this.Sign(sink, 'VaultReference', 3220, 2.6, 3182, 8, 1.65);
    sink.SetSector('MovementRunJump');
    for (const side of [-1, 1]) this.Block(sink, 'Green', 'RunLane' + side, r.x + side * r.width / 2, 0.016,
      (r.startZ + r.endZ) / 2, 0.09, 0.032, r.startZ - r.endZ);
    for (let i = 0; i <= 32; i++) {
      const d = i / 4, z = r.zeroZ - d;
      this.Block(sink, i === 0 ? 'Green' : 'White', 'RunTick' + i, r.x, 0.016, z, r.width, 0.032, i % 4 === 0 ? 0.09 : 0.028);
      if (i % 2 === 0) this.Sign(sink, 'Distance' + i / 2, r.x + r.width / 2 + 1.2, 0.033, z, 1.7, 0.4, true);
    }
    this.Sign(sink, 'RunZero', r.x, 0.035, r.zeroZ + 0.85, 4.5, 0.94, true);
    this.Sign(sink, 'RunBest', r.x + 6.7, 1.6, r.zeroZ - 3, 4.5, 0.94);
    for (const mesh of sink.Flush(this.scene, { Get: name => this.materials.get(name) })) {
      if (mesh.material === this.materials.get('Signs')) mesh.castShadow = false;
      this.meshes.push(mesh);
    }
    this.colliders = sink.colliders; this.BuildCollisionGrid();
    yield { label: '操作白盒：物理与测量就绪', progress: 1 };
  }
  Dispose() {
    super.Dispose(); for (const m of this.materials.values()) m.dispose(); this.materials.clear(); this.atlas?.texture.dispose();
  }
}
