// 《烽火敌后》· 程序化低模角色（无图片资产：盒子人 + 程序骨骼动画）。
// 八路军(土黄灰) / 日军(土黄绿+钢盔) / 村民。动画：待机呼吸、走路摆臂迈腿、开枪后坐、中弹倒地。
import * as THREE from "three";

export type Faction = "eighth" | "jp" | "villager";

const MAT = (hex: number): THREE.MeshLambertMaterial => new THREE.MeshLambertMaterial({ color: hex });
function box(w: number, h: number, d: number, mat: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z); m.castShadow = true; return m;
}

export class Actor {
  group = new THREE.Group();
  faction: Faction;
  private torso: THREE.Object3D;
  private head: THREE.Object3D;
  private armL: THREE.Object3D; private armR: THREE.Object3D;
  private legL: THREE.Object3D; private legR: THREE.Object3D;
  private rifle?: THREE.Object3D;
  phase = Math.random() * 6.28;
  fireT = 0; // 开枪后坐余量
  fireCd = 0; // 开火冷却（AI 用）
  hitT = 0; // 中弹抖动
  dead = false; deadT = 0;
  hp = 1;
  vx = 0; vz = 0; // 当前移动速度（驱动走路动画）

  constructor(faction: Faction) {
    this.faction = faction;
    const skin = 0xcaa27a;
    let cloth = 0x8a7d55, cap = 0x6f6540, hasRifle = true, scale = 1;
    if (faction === "jp") { cloth = 0x6b6b3a; cap = 0x55552c; }
    else if (faction === "villager") { cloth = 0x9a8a68; cap = 0x7a6a48; hasRifle = false; scale = 0.94; }

    const g = this.group;
    // 腿（枢轴在髋部，绕 x 摆动）
    this.legL = new THREE.Group(); this.legL.position.set(-0.16, 0.72, 0);
    this.legL.add(box(0.24, 0.72, 0.26, MAT(cloth), 0, -0.36, 0));
    this.legR = new THREE.Group(); this.legR.position.set(0.16, 0.72, 0);
    this.legR.add(box(0.24, 0.72, 0.26, MAT(cloth), 0, -0.36, 0));
    g.add(this.legL, this.legR);
    // 躯干
    this.torso = box(0.62, 0.78, 0.36, MAT(cloth), 0, 1.12, 0);
    g.add(this.torso);
    // 头 + 帽/盔
    this.head = new THREE.Group(); this.head.position.set(0, 1.72, 0);
    this.head.add(box(0.34, 0.34, 0.34, MAT(skin)));
    if (faction === "jp") { // 钢盔 + 屁帘
      this.head.add(box(0.4, 0.16, 0.4, MAT(cap), 0, 0.2, 0));
      this.head.add(box(0.38, 0.14, 0.06, MAT(cap), 0, 0.02, -0.2));
    } else { // 八路/村民 布军帽
      this.head.add(box(0.38, 0.14, 0.38, MAT(cap), 0, 0.16, 0));
      this.head.add(box(0.3, 0.04, 0.12, MAT(cap), 0, 0.09, 0.22));
    }
    g.add(this.head);
    // 手臂（枢轴在肩，绕 x 摆动）
    this.armL = new THREE.Group(); this.armL.position.set(-0.4, 1.48, 0);
    this.armL.add(box(0.18, 0.66, 0.2, MAT(cloth), 0, -0.33, 0));
    this.armR = new THREE.Group(); this.armR.position.set(0.4, 1.48, 0);
    this.armR.add(box(0.18, 0.66, 0.2, MAT(cloth), 0, -0.33, 0));
    g.add(this.armL, this.armR);
    // 步枪（架在右臂前）
    if (hasRifle) {
      this.rifle = new THREE.Group();
      this.rifle.add(box(0.06, 0.06, 1.0, MAT(0x3a2f22), 0, 0, 0.4)); // 枪身
      this.rifle.add(box(0.05, 0.2, 0.18, MAT(0x2a2018), 0, -0.06, -0.02)); // 枪托
      this.armR.add(this.rifle); this.rifle.position.set(0, -0.5, 0.1);
    }
    g.scale.setScalar(scale);
  }

  fire(): void { this.fireT = 1; }
  hit(dmg = 0.34): void { this.hitT = 1; this.hp -= dmg; if (this.hp <= 0 && !this.dead) { this.dead = true; this.deadT = 0; } }

  update(dt: number, t: number): void {
    if (this.dead) {
      this.deadT = Math.min(1, this.deadT + dt * 2.4);
      const e = this.deadT;
      this.group.rotation.z = -e * 1.4; // 倒地
      this.group.position.y = -e * 0.4;
      (this.group as unknown as { userData: Record<string, number> }).userData.fade = 1 - e;
      return;
    }
    this.phase += dt;
    const spd = Math.hypot(this.vx, this.vz);
    const moving = spd > 0.15;
    // 走路：腿手交替摆动，幅度随速度
    const w = t * 9 + this.phase;
    const amp = moving ? Math.min(0.9, spd * 0.5) : 0.06;
    const swing = Math.sin(w) * amp;
    this.legL.rotation.x = swing; this.legR.rotation.x = -swing;
    this.armL.rotation.x = -swing * 0.8;
    // 右臂端枪，抬平；开枪后坐
    this.fireT = Math.max(0, this.fireT - dt * 5);
    this.armR.rotation.x = -1.3 + this.fireT * 0.5 + (moving ? swing * 0.2 : 0);
    // 待机呼吸
    this.torso.position.y = 1.12 + Math.sin(t * 2 + this.phase) * 0.015;
    this.head.rotation.z = Math.sin(t * 1.3 + this.phase) * 0.03;
    // 中弹抖
    this.hitT = Math.max(0, this.hitT - dt * 4);
    if (this.hitT > 0) { this.group.position.x += (Math.random() - 0.5) * 0.06 * this.hitT; }
  }
}

// 房屋（可燃烧倒塌）+ 简单树
export function makeHouse(burnt = false): THREE.Group {
  const g = new THREE.Group();
  const wall = burnt ? 0x3a3228 : 0xb8a878, roof = burnt ? 0x2a221a : 0x7a5a3a;
  g.add(box(1.8, 1.2, 1.6, MAT(wall), 0, 0.6, 0));
  const r = new THREE.Mesh(new THREE.ConeGeometry(1.5, 0.9, 4), MAT(roof));
  r.position.y = 1.65; r.rotation.y = Math.PI / 4; r.castShadow = true; g.add(r);
  return g;
}
export function makeTree(): THREE.Group {
  const g = new THREE.Group();
  g.add(box(0.2, 1.0, 0.2, MAT(0x4a3826), 0, 0.5, 0));
  const c = new THREE.Mesh(new THREE.SphereGeometry(0.7, 6, 5), MAT(0x4a5a2a));
  c.position.y = 1.4; c.castShadow = true; g.add(c);
  return g;
}
