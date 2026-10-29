// 人物战场反应测试场的砖铺场院（2026-10-28）：一块贴着地形铺的青砖地，炸在上面的扬尘少，看得清人被冲击波推倒。
//
// 用户原话：「新增一块扬尘不大的地面（比如可以湿润一点、或者是那种砖块地），现在有扬尘不方便看到被推倒的效果」。
// 位置、尺寸、地面类型在 Data_BattleReactionRange.BATTLE_REACTION_PAVED。这里只管三件事：
//   1. 画：一张按地形起伏细分的平面，青砖错缝贴图（画布现画，不加载文件），比地面高 lift 防闪；
//   2. 落在里面的爆炸按砖地出尘（Vfx.SetGroundSurfaceResolver → GROUND_IMPACT_SURFACES.brick）；
//   3. 落在里面的爆炸不挖弹坑（TerrainDeformationView.noCraterAt；砖面是一张整片，挖下去会悬空，简化）。
// 离开本关由 BattleReactionRange.Dispose 调 Dispose 全部还原。
import * as THREE from "three";
import { Mulberry32 } from "./Script_Noise.mjs";
import { BATTLE_REACTION_PAVED, InPavedYard } from "./Data_BattleReactionRange.mjs";

/** 青砖错缝贴图：横 BRICKS_X 块 × 竖 ROWS 行，砖色在青灰里抖一点、少数偏红，灰缝浅灰。 */
const BRICKS_X = 8, ROWS = 16, SIZE = 512;
const MORTAR = [118, 112, 104];
const BRICK_TONES = [[86, 90, 94], [96, 99, 101], [78, 81, 84], [104, 100, 96], [112, 86, 74]];

function BrickTexture(seed = 1938) {
  const canvas = document.createElement("canvas");
  canvas.width = SIZE; canvas.height = SIZE;
  const g = canvas.getContext("2d"), rnd = Mulberry32(seed);
  g.fillStyle = `rgb(${MORTAR.join(",")})`;
  g.fillRect(0, 0, SIZE, SIZE);
  const bw = SIZE / BRICKS_X, bh = SIZE / ROWS, joint = 3;
  for (let row = 0; row < ROWS; row++) {
    const offset = row % 2 ? bw / 2 : 0;
    for (let i = -1; i <= BRICKS_X; i++) {
      const tone = BRICK_TONES[rnd() < 0.08 ? 4 : Math.floor(rnd() * 4)];
      const k = 0.88 + rnd() * 0.24;
      g.fillStyle = `rgb(${tone.map((c) => Math.round(c * k)).join(",")})`;
      g.fillRect(i * bw + offset + joint / 2, row * bh + joint / 2, bw - joint, bh - joint);
    }
  }
  // 磨损斑点：砖面不是一色平涂
  const img = g.getImageData(0, 0, SIZE, SIZE), d = img.data;
  for (let p = 0; p < d.length; p += 4) {
    const n = (rnd() - 0.5) * 18;
    d[p] = Math.max(0, Math.min(255, d[p] + n)); d[p + 1] = Math.max(0, Math.min(255, d[p + 1] + n)); d[p + 2] = Math.max(0, Math.min(255, d[p + 2] + n));
  }
  g.putImageData(img, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 8;
  return texture;
}

export class BattleReactionPavedYard {
  /** host：scene / battlefield / vfx（同 BattleReactionRange 的 host）。 */
  constructor(host, pad = BATTLE_REACTION_PAVED) {
    this.host = host;
    this.pad = pad;
    this.mesh = this.Build();
    host.scene.add(this.mesh);
    host.vfx?.SetGroundSurfaceResolver?.((x, z) => (InPavedYard(x, z, pad) ? pad.surface : null));
    this.deformation = host.battlefield?.deformation || null;
    if (this.deformation) this.deformation.noCraterAt = (x, z) => InPavedYard(x, z, pad);
    // 砖面比地表高 lift：落在上面的东西（震脱手的枪，Script_Main.LOOSE_GUN_WORLD）按砖面停，不埋进砖里
    if (host.battlefield) host.battlefield.overlayLiftAt = (x, z) => (InPavedYard(x, z, pad) ? pad.lift : 0);
  }

  Build() {
    const pad = this.pad, w = pad.halfX * 2, h = pad.halfZ * 2;
    // 一米一格：地形起伏跟得上，顶点也不多（61 × 61）
    const geometry = new THREE.PlaneGeometry(w, h, Math.ceil(w), Math.ceil(h));
    geometry.rotateX(-Math.PI / 2);
    const pos = geometry.attributes.position, ground = (x, z) => this.host.battlefield.GroundHeight(x, z);
    for (let i = 0; i < pos.count; i++) {
      const x = pad.x + pos.getX(i), z = pad.z + pos.getZ(i);
      pos.setXYZ(i, x, ground(x, z) + pad.lift, z);
    }
    pos.needsUpdate = true;
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    // 贴图一张 = 横 8 块砖 × 竖 16 行
    const uv = geometry.attributes.uv, tileX = BRICKS_X * pad.brickM[0], tileZ = ROWS * pad.brickM[1];
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w / tileX, uv.getY(i) * h / tileZ);
    uv.needsUpdate = true;
    this.texture = BrickTexture();
    const material = new THREE.MeshStandardMaterial({
      map: this.texture, roughness: 0.88, metalness: 0,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    });
    material.name = "BattleReactionPavedYard";
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = "BattleReactionPavedYard";
    mesh.receiveShadow = true;
    return mesh;
  }

  /** 取证：铺在哪、多大、地面类型。 */
  State() {
    const p = this.pad;
    return { id: p.id, x: p.x, z: p.z, halfX: p.halfX, halfZ: p.halfZ, surface: p.surface, visible: !!this.mesh?.parent };
  }

  Dispose() {
    this.host.vfx?.SetGroundSurfaceResolver?.(null);
    if (this.deformation) this.deformation.noCraterAt = null;
    if (this.host.battlefield?.overlayLiftAt) this.host.battlefield.overlayLiftAt = null;
    if (this.mesh) {
      this.mesh.removeFromParent();
      this.mesh.geometry.dispose(); this.mesh.material.dispose();
      this.mesh = null;
    }
    this.texture?.dispose(); this.texture = null;
  }
}

export default BattleReactionPavedYard;
