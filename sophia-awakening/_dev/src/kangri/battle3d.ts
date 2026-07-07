// 《烽火敌后》· 3D 战场（Three.js）。村庄场景 + 玩家操控的八路军战士 + 自动民兵防御 + 日军扫荡真开进村 + 子弹/中弹倒地/房屋燃烧。
// 战斗结果挂钩核心：日军烧掉的房子越多=损失越大；你/民兵击毙的日军越多=损失越小 + 缴获物资。
import * as THREE from "three";
import { Actor, makeHouse, makeTree, type Faction } from "./actor";

interface Bullet { mesh: THREE.Mesh; vx: number; vz: number; life: number; from: Faction; dmg: number; }
interface House { grp: THREE.Group; x: number; z: number; burning: number; burnt: boolean; fire: THREE.Mesh[]; }

export interface Battle3D {
  update: (dt: number) => void;
  triggerSweep: (count: number, onResolve: (r: { burned: number; total: number; killed: number }) => void) => void;
  resize: () => void;
  dispose: () => void;
  setKeys: (k: Record<string, boolean>) => void;
  fire: () => void;
  ok: boolean;
}

export function initBattle3D(canvas: HTMLCanvasElement): Battle3D {
  let renderer: THREE.WebGLRenderer;
  try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true }); }
  catch { return { update() {}, triggerSweep() {}, resize() {}, dispose() {}, setKeys() {}, fire() {}, ok: false }; }
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setClearColor(0x1a1c14);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x1a1c14, 26, 70);
  const cam = new THREE.PerspectiveCamera(52, 1, 0.1, 200);

  // 光：黄昏暖光 + 环境
  const sun = new THREE.DirectionalLight(0xffd9a0, 1.15);
  sun.position.set(-16, 24, 12); sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024); sun.shadow.camera.left = -26; sun.shadow.camera.right = 26;
  sun.shadow.camera.top = 26; sun.shadow.camera.bottom = -26; scene.add(sun);
  scene.add(new THREE.HemisphereLight(0xbfc7a0, 0x2a2818, 0.55));

  // 地面（黄土）
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), new THREE.MeshLambertMaterial({ color: 0x6a5c3a }));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
  // 田埂网格
  const grid = new THREE.GridHelper(120, 40, 0x4a4028, 0x4a4028);
  (grid.material as THREE.Material).opacity = 0.25; (grid.material as THREE.Material).transparent = true; scene.add(grid);

  // 村庄：房屋 + 树
  const houses: House[] = [];
  const layout: [number, number][] = [[-8, -6], [6, -8], [10, 2], [-10, 4], [2, 8], [-4, -2], [8, 9], [-9, -10]];
  for (const [x, z] of layout) {
    const grp = makeHouse(); grp.position.set(x, 0, z); grp.rotation.y = Math.random() * 6.28; scene.add(grp);
    houses.push({ grp, x, z, burning: 0, burnt: false, fire: [] });
  }
  for (let i = 0; i < 20; i++) { const t = makeTree(); t.position.set((Math.random() - 0.5) * 90, 0, (Math.random() - 0.5) * 90); scene.add(t); }
  // 根据地旗杆（村中心）
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 4), new THREE.MeshLambertMaterial({ color: 0x5a4a30 }));
  pole.position.set(0, 2, 0); scene.add(pole);
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.8), new THREE.MeshLambertMaterial({ color: 0xc8392e, side: THREE.DoubleSide }));
  flag.position.set(0.6, 3.4, 0); scene.add(flag);

  // 玩家（八路军战士）
  const player = new Actor("eighth");
  player.group.position.set(0, 0, 4); scene.add(player.group);

  const defenders: Actor[] = [];
  const enemies: Actor[] = [];
  const bullets: Bullet[] = [];
  let keys: Record<string, boolean> = {};
  let sweeping = false, sweepTimer = 0, sweepKilled = 0;
  let resolveCb: ((r: { burned: number; total: number; killed: number }) => void) | null = null;

  // 常驻几个民兵在村里巡逻/守备
  for (let i = 0; i < 5; i++) { const d = new Actor("villager"); d.group.position.set((Math.random() - 0.5) * 14, 0, (Math.random() - 0.5) * 14); scene.add(d.group); defenders.push(d); }

  const bulletMat = new THREE.MeshBasicMaterial({ color: 0xfff0a0 });
  const bulletMatJp = new THREE.MeshBasicMaterial({ color: 0xff8040 });
  function spawnBullet(from: Actor, tx: number, tz: number, faction: Faction, dmg: number): void {
    const px = from.group.position.x, pz = from.group.position.z;
    const dx = tx - px, dz = tz - pz, d = Math.hypot(dx, dz) || 1;
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.09, 5, 4), faction === "jp" ? bulletMatJp : bulletMat);
    b.position.set(px, 1.4, pz); scene.add(b);
    bullets.push({ mesh: b, vx: (dx / d) * 34, vz: (dz / d) * 34, life: 1.2, from: faction, dmg });
    from.fire();
    // 面向目标
    from.group.rotation.y = Math.atan2(dx, dz);
  }

  function nearest(from: Actor, arr: Actor[]): Actor | null {
    let best: Actor | null = null, bd = 1e9;
    for (const a of arr) { if (a.dead) continue; const d = (a.group.position.x - from.group.position.x) ** 2 + (a.group.position.z - from.group.position.z) ** 2; if (d < bd) { bd = d; best = a; } }
    return best;
  }

  function igniteHouse(h: House): void {
    if (h.burnt || h.burning > 0) return;
    h.burning = 0.001;
  }

  // 玩家射击（自动瞄准最近日军）
  function playerFire(): void {
    if (player.dead) return;
    const e = nearest(player, enemies);
    if (e) spawnBullet(player, e.group.position.x, e.group.position.z, "eighth", 0.6);
    else spawnBullet(player, player.group.position.x + Math.sin(player.group.rotation.y) * 10, player.group.position.z + Math.cos(player.group.rotation.y) * 10, "eighth", 0.6);
  }

  function triggerSweep(count: number, onResolve: (r: { burned: number; total: number; killed: number }) => void): void {
    if (sweeping) return;
    sweeping = true; sweepTimer = 0; sweepKilled = 0; resolveCb = onResolve;
    const n = Math.min(16, Math.max(3, Math.round(count)));
    for (let i = 0; i < n; i++) {
      const e = new Actor("jp");
      const ang = Math.PI * (0.15 + Math.random() * 0.7); // 从北边压进
      const r = 42 + Math.random() * 8;
      e.group.position.set(Math.cos(ang) * r, 0, -Math.abs(Math.sin(ang) * r) - 8);
      e.fireCd = 0.6 + Math.random(); scene.add(e.group); enemies.push(e);
    }
    // 扫荡时额外拉起民兵（你的兵员在守）
    while (defenders.filter((d) => !d.dead).length < 8) { const d = new Actor("eighth"); d.group.position.set((Math.random() - 0.5) * 10, 0, (Math.random() - 0.5) * 10 + 6); scene.add(d.group); defenders.push(d); }
  }

  let fireCd = 0;
  function update(dt: number): void {
    const t = performance.now() * 0.001;
    dt = Math.min(0.05, dt);

    // —— 玩家移动（WASD，相机相对：简化为世界轴）——
    let mx = 0, mz = 0;
    if (keys["w"] || keys["arrowup"]) mz -= 1;
    if (keys["s"] || keys["arrowdown"]) mz += 1;
    if (keys["a"] || keys["arrowleft"]) mx -= 1;
    if (keys["d"] || keys["arrowright"]) mx += 1;
    const ml = Math.hypot(mx, mz);
    const spd = 7;
    if (ml > 0 && !player.dead) {
      mx /= ml; mz /= ml;
      player.group.position.x += mx * spd * dt; player.group.position.z += mz * spd * dt;
      player.group.position.x = Math.max(-40, Math.min(40, player.group.position.x));
      player.group.position.z = Math.max(-40, Math.min(40, player.group.position.z));
      player.vx = mx * spd; player.vz = mz * spd;
      if (enemies.filter((e) => !e.dead).length === 0) player.group.rotation.y = Math.atan2(mx, mz);
    } else { player.vx = 0; player.vz = 0; }
    // 玩家自动开火（有敌人时按节拍，也可手动）
    fireCd -= dt;
    if (fireCd <= 0 && enemies.some((e) => !e.dead) && !player.dead) { playerFire(); fireCd = 0.32; }
    player.update(dt, t);

    // —— 民兵防御 AI ——
    for (const d of defenders) {
      if (d.dead) continue;
      const e = nearest(d, enemies);
      if (e) {
        const dx = e.group.position.x - d.group.position.x, dz = e.group.position.z - d.group.position.z; const dist = Math.hypot(dx, dz);
        if (dist > 12) { d.vx = (dx / dist) * 3; d.vz = (dz / dist) * 3; d.group.position.x += d.vx * dt; d.group.position.z += d.vz * dt; }
        else { d.vx = 0; d.vz = 0; d.fireCd -= dt; if (d.fireCd <= 0) { spawnBullet(d, e.group.position.x, e.group.position.z, "eighth", 0.5); d.fireCd = 0.7 + Math.random() * 0.5; } }
      } else { d.vx = 0; d.vz = 0; }
      d.update(dt, t);
    }

    // —— 日军 AI：压向村中心，路上打人烧房 ——
    for (const e of enemies) {
      if (e.dead) continue;
      // 目标：最近的房子或村中心
      let tx = 0, tz = 0, th: House | null = null, bd = 1e9;
      for (const h of houses) { if (h.burnt) continue; const dd = (h.x - e.group.position.x) ** 2 + (h.z - e.group.position.z) ** 2; if (dd < bd) { bd = dd; tx = h.x; tz = h.z; th = h; } }
      const dx = tx - e.group.position.x, dz = tz - e.group.position.z, dist = Math.hypot(dx, dz);
      const tgt = nearest(e, [player, ...defenders]);
      if (tgt && Math.hypot(tgt.group.position.x - e.group.position.x, tgt.group.position.z - e.group.position.z) < 14) {
        // 见人就打
        e.vx = 0; e.vz = 0; e.fireCd -= dt;
        if (e.fireCd <= 0) { spawnBullet(e, tgt.group.position.x, tgt.group.position.z, "jp", 0.5); e.fireCd = 0.8 + Math.random() * 0.6; }
      } else if (dist > 2.2) {
        e.vx = (dx / dist) * 3.2; e.vz = (dz / dist) * 3.2; e.group.position.x += e.vx * dt; e.group.position.z += e.vz * dt;
        e.group.rotation.y = Math.atan2(dx, dz);
      } else if (th) { igniteHouse(th); } // 到房子=放火
      e.update(dt, t);
    }

    // —— 子弹 ——
    for (let i = bullets.length - 1; i >= 0; i--) {
      const b = bullets[i]; b.mesh.position.x += b.vx * dt; b.mesh.position.z += b.vz * dt; b.life -= dt;
      let hitOne = false;
      const targets = b.from === "jp" ? [player, ...defenders] : enemies;
      for (const a of targets) {
        if (a.dead) continue;
        const dd = (a.group.position.x - b.mesh.position.x) ** 2 + (a.group.position.z - b.mesh.position.z) ** 2;
        if (dd < 0.6) { a.hit(b.dmg); hitOne = true; if (a.dead && b.from === "eighth" && enemies.includes(a)) sweepKilled += 1; break; }
      }
      if (hitOne || b.life <= 0) { scene.remove(b.mesh); b.mesh.geometry.dispose(); bullets.splice(i, 1); }
    }

    // —— 房屋燃烧 ——
    for (const h of houses) {
      if (h.burnt) continue;
      if (h.burning > 0) {
        h.burning += dt * 0.28;
        if (h.fire.length < 4 && h.burning < 0.7 && Math.random() < 0.3) {
          const f = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.7, 5), new THREE.MeshBasicMaterial({ color: 0xff6620 }));
          f.position.set(h.x + (Math.random() - 0.5), 1.4, h.z + (Math.random() - 0.5)); scene.add(f); h.fire.push(f);
        }
        for (const f of h.fire) { f.scale.y = 0.6 + Math.sin(t * 12 + f.position.x) * 0.4; f.position.y = 1.2 + Math.sin(t * 8) * 0.1; }
        if (h.burning >= 1) { // 烧塌
          h.burnt = true; h.grp.scale.y = 0.3; h.grp.traverse((o) => { if (o instanceof THREE.Mesh) (o.material as THREE.MeshLambertMaterial).color.setHex(0x2a221a); });
          for (const f of h.fire) { scene.remove(f); } h.fire = [];
        }
      }
    }

    // —— 扫荡结算 ——
    if (sweeping) {
      sweepTimer += dt;
      const aliveE = enemies.filter((e) => !e.dead).length;
      if ((aliveE === 0 && sweepTimer > 1) || sweepTimer > 42) {
        sweeping = false;
        const burned = houses.filter((h) => h.burnt).length, total = houses.length;
        resolveCb?.({ burned, total, killed: sweepKilled });
        resolveCb = null;
        // 清场：日军尸体渐隐移除，房屋慢慢重建
        setTimeout(() => { for (const e of enemies) scene.remove(e.group); enemies.length = 0; }, 2500);
        for (const h of houses) if (h.burnt) rebuildHouse(h);
      }
    }
    // 死者渐隐移除
    for (let i = enemies.length - 1; i >= 0; i--) { const e = enemies[i]; if (e.dead && e.deadT >= 1) { /* 留到清场 */ } }

    // —— 相机跟随玩家（第三人称肩后）——
    const px = player.group.position.x, pz = player.group.position.z;
    const camTarget = new THREE.Vector3(px - 6, 9, pz + 12);
    cam.position.lerp(camTarget, 1 - Math.pow(0.001, dt));
    cam.lookAt(px, 1.4, pz - 2);

    renderer.render(scene, cam);
  }

  function rebuildHouse(h: House): void {
    // 3 秒后原地重建（军民重建家园）
    setTimeout(() => {
      scene.remove(h.grp); const g = makeHouse(); g.position.set(h.x, 0, h.z); scene.add(g);
      h.grp = g; h.burnt = false; h.burning = 0;
    }, 3500);
  }

  function resize(): void {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix();
  }
  resize();

  return {
    ok: true, update, triggerSweep, resize,
    setKeys: (k) => { keys = k; },
    fire: () => playerFire(),
    dispose: () => { renderer.dispose(); }
  };
}
