import * as THREE from 'three';
import { BuildEar, MakeRng } from './Script_EarAnatomy.js?v=ear006-20260911';
import { PALETTE as P } from './Data_Palette.mjs?v=ear006-20260911';

const Mix = (a, b, t) => new THREE.Color(a).lerp(new THREE.Color(b), t);
const Clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));

// 观察窗只保留远侧内壁。所有接触位置仍来自同一条毫米制耳道，近侧皮肤不会挡住手指。
export function CreateChunkScene({ core }) {
  const { scene, camera } = core;
  const anatomy = BuildEar(null, { quality: 'low' });
  const canal = anatomy.canal;
  const root = new THREE.Group();
  scene.add(root);
  scene.background = new THREE.Color(P.mint);
  scene.add(new THREE.HemisphereLight(P.cream, P.peachDeep, 1.5));
  const key = new THREE.DirectionalLight(P.white, 2.0);
  key.position.set(-9, 12, 2); scene.add(key);
  const fill = new THREE.DirectionalLight(P.honey, 0.7);
  fill.position.set(8, 5, 14); scene.add(fill);
  core.setExposure(0.95);

  const focus = canal.CenterAt(5.0).clone();
  focus.y -= 0.4;
  camera.position.copy(focus).add(new THREE.Vector3(0, 18, -2));
  camera.up.set(0, 0, 1);
  camera.lookAt(focus);
  camera.updateMatrixWorld(true);
  const portraitRotation = camera.quaternion.clone();
  const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
  const up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
  const toward = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 2);
  const workingPlane = new THREE.Plane().setFromNormalAndCoplanarPoint(toward, focus);
  const ray = new THREE.Raycaster();
  let width = 1, height = 1, chunks = [];

  function Surface(depth, angle, lift = 0) {
    return canal.PointAt(depth, angle, -lift).clone();
  }
  const vertices = [], colors = [], indices = [];
  const depthSteps = 76, arcSteps = 64;
  for (let i = 0; i <= depthSteps; i++) {
    const d = i / depthSteps * 28;
    for (let j = 0; j <= arcSteps; j++) {
      const a = 1.45 + j / arcSteps * (Math.PI * 2 - 2.9);
      const v = Surface(d, a);
      vertices.push(v.x, v.y, v.z);
      const c = Mix(P.canalWall, P.blush, 0.25 + 0.10 * Math.pow(Math.sin(j / arcSteps * Math.PI), 2));
      colors.push(c.r, c.g, c.b);
      if (i < depthSteps && j < arcSteps) {
        const n = i * (arcSteps + 1) + j;
        indices.push(n, n + 1, n + arcSteps + 1, n + 1, n + arcSteps + 2, n + arcSteps + 1);
      }
    }
  }
  const wallGeo = new THREE.BufferGeometry();
  wallGeo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  wallGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  wallGeo.setIndex(indices); wallGeo.computeVertexNormals();
  const wall = new THREE.Mesh(wallGeo, new THREE.MeshPhysicalMaterial({
    vertexColors: true, side: THREE.DoubleSide, roughness: 0.54, clearcoat: 0.22,
  }));
  root.add(wall);
  const rimMat = new THREE.MeshStandardMaterial({ color: P.skinDeep, roughness: 0.62 });
  for (const a of [1.45, Math.PI * 2 - 1.45]) {
    const points = Array.from({ length: 60 }, (_, i) => Surface(i / 59 * 28, a));
    root.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 72, 0.18, 10, false), rimMat));
  }
  // 入口软骨弧线让近景保留耳道方向感，细纹只在边缘，避免杂线覆盖块体。
  for (const depth of [0.15]) {
    const points = Array.from({ length: 50 }, (_, i) => Surface(depth, 1.45 + i / 49 * 3.383));
    root.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 64, 0.15, 8, false), rimMat));
  }
  const tray = new THREE.Group(); scene.add(tray);
  tray.quaternion.copy(camera.quaternion);
  const dish = new THREE.Mesh(new THREE.CircleGeometry(1, 64), new THREE.MeshStandardMaterial({ color: P.ceramic, roughness: .4 }));
  dish.scale.set(4.3, 1.12, 1); tray.add(dish);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(1, .047, 10, 80), new THREE.MeshStandardMaterial({ color: P.white, roughness: .26 }));
  rim.scale.set(4.3, 1.12, .7); rim.position.z = .05; tray.add(rim);
  const inner = new THREE.Mesh(new THREE.TorusGeometry(1, .014, 6, 80), new THREE.MeshStandardMaterial({ color: P.mintDeep }));
  inner.scale.set(3.95, .84, 1); inner.position.z = .06; tray.add(inner);

  const tool = new THREE.Group(); scene.add(tool); tool.visible = false;
  tool.quaternion.copy(camera.quaternion);
  const steel = new THREE.MeshPhysicalMaterial({ color: P.steel, metalness: .38, roughness: .22, clearcoat: .6 });
  const bamboo = new THREE.MeshStandardMaterial({ color: P.bamboo, roughness: .45 });
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(.08, .14, 4.5, 12), bamboo);
  shaft.position.set(.85, -2.35, 0); shaft.rotation.z = .35; tool.add(shaft);
  const head = new THREE.Mesh(new THREE.SphereGeometry(.33, 24, 16), bamboo);
  head.scale.set(.73, 1.25, .26); head.position.set(0, -.19, .01); tool.add(head);
  const jawGeo = new THREE.CylinderGeometry(.035, .065, .8, 8);
  const jaws = [-1, 1].map(side => {
    const m = new THREE.Mesh(jawGeo, steel); m.position.set(side * .14, -.26, .05); tool.add(m); return m;
  });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(.95, .026, 8, 64), new THREE.MeshBasicMaterial({ color: P.white, transparent: true, opacity: .75 }));
  scene.add(ring); ring.quaternion.copy(camera.quaternion); ring.visible = false;
  const threadGroup = new THREE.Group(); scene.add(threadGroup);
  const droplet = new THREE.Mesh(new THREE.SphereGeometry(.16, 16, 12), new THREE.MeshPhysicalMaterial({ color: P.water, roughness: .12, clearcoat: 1 }));
  scene.add(droplet); droplet.visible = false;
  let dropAge = 1, dropTarget = null;
  const threads = Array.from({ length: 3 }, () => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(.035, .07, 1, 7), new THREE.MeshStandardMaterial({ color: P.waxGlow, roughness: .2 }));
    threadGroup.add(m); m.visible = false; return m;
  });

  function AtScreen(x, y, lift = 0) {
    ray.setFromCamera(new THREE.Vector2(x, y), camera);
    const result = new THREE.Vector3();
    ray.ray.intersectPlane(workingPlane, result);
    return result.addScaledVector(toward, lift);
  }
  function Resize() {
    const size = core.size;
    if (size.width === width && size.height === height) return;
    width = size.width; height = size.height;
    const aspect = width / height;
    const landscape = aspect > 1.65 && height < 400;
    const halfH = landscape ? 4.5 : Math.max(5.55, 4.6 / aspect);
    camera.quaternion.copy(portraitRotation);
    if (landscape) camera.rotateZ(-Math.PI / 2);
    camera.left = -halfH * aspect; camera.right = halfH * aspect;
    camera.top = halfH; camera.bottom = -halfH;
    camera.updateProjectionMatrix(); camera.updateMatrixWorld(true);
    right.setFromMatrixColumn(camera.matrixWorld, 0); up.setFromMatrixColumn(camera.matrixWorld, 1);
    ring.quaternion.copy(camera.quaternion);
    // 盘子位于独立下缘，和皮肤段之间有真实空间；飞行与落盘均在同一个 3D 场景。
    tray.position.copy(AtScreen(landscape ? .79 : 0, landscape ? 0 : -.80, 3.5));
    tray.quaternion.copy(camera.quaternion);
    if (landscape) tray.rotateZ(Math.PI / 2);
    const trayScale = landscape ? .79 : Math.min(1.05, halfH * aspect / 5);
    tray.scale.setScalar(trayScale);
    chunks.filter(c => c.state === 'collected').forEach(c => SetTrayPose(c));
  }

  function BuildChunk(rng, id, depth, angle, type) {
    const size = .66 + rng() * .2;
    const geo = new THREE.SphereGeometry(1, 36, 24);
    const p = geo.attributes.position;
    const seed = rng() * 6;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const a = Math.atan2(y, x);
      const edge = 1 + .085 * Math.sin(3 * a + seed) + .025 * Math.cos(7 * a + seed);
      p.setXYZ(i, x * size * edge, y * size * 1.17 * edge, z * (type === 'dry' ? .20 : .34) + .30 + (z > 0 ? .025 * Math.sin(x * 13 + seed) * Math.sin(y * 9) * z : 0));
    }
    geo.computeVertexNormals();
    const color = type === 'dry' ? P.waxDry : type === 'wet' ? P.waxWet : P.honeyDeep;
    const mesh = new THREE.Mesh(geo, new THREE.MeshPhysicalMaterial({ color, roughness: type === 'dry' ? .52 : .25, metalness: .02, clearcoat: type === 'dry' ? .16 : .85, clearcoatRoughness: .2 }));
    const normal = canal.NormalAt(depth, angle).clone().normalize();
    const tangent = canal.TangentAt(depth).clone().normalize();
    const xAxis = tangent.clone().cross(normal).normalize();
    const yAxis = normal.clone().cross(xAxis).normalize();
    mesh.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(xAxis, yAxis, normal));
    mesh.position.copy(Surface(depth, angle, .018));
    root.add(mesh);
    const mark = new THREE.Mesh(new THREE.CircleGeometry(size * .99, 40), new THREE.MeshBasicMaterial({ color: P.skinSheen, transparent: true, opacity: 0, depthWrite: false }));
    mark.position.copy(Surface(depth, angle, .03)); mark.quaternion.copy(mesh.quaternion); root.add(mark);
    const chunk = { id, type, depth, angle, size, state: 'attached', progress: 0, softened: 0, mesh, mark,
      origin: mesh.position.clone(), rotation: mesh.quaternion.clone(), original: p.array.slice(), normal, seed, slot: -1, fly: 0, held: 0 };
    mesh.userData.chunk = chunk;
    return chunk;
  }
  function Reset(seed) {
    for (const c of chunks) { root.remove(c.mesh, c.mark); c.mesh.geometry.dispose(); c.mesh.material.dispose(); c.mark.geometry.dispose(); c.mark.material.dispose(); }
    const rng = MakeRng(seed);
    chunks = Array.from({ length: 9 }, (_, i) => {
      const row = Math.floor(i / 3), col = i % 3;
      const type = i === 4 ? 'impacted' : (i + seed) % 3 === 0 ? 'wet' : 'dry';
      return BuildChunk(rng, i, 2.9 + row * 2.6 + (rng() - .5) * .32, 2.43 + col * .70 + (rng() - .5) * .07, type);
    });
    HideTool(); droplet.visible = false; dropTarget = null; return chunks;
  }
  function Project(position) {
    const v = position.clone().project(camera);
    return { x: (v.x + 1) * .5 * width, y: (1 - v.y) * .5 * height, z: v.z };
  }
  function Pick(x, y) {
    scene.updateMatrixWorld(true);
    ray.setFromCamera(new THREE.Vector2(x / width * 2 - 1, 1 - y / height * 2), camera);
    const hit = ray.intersectObjects(chunks.filter(c => c.state === 'attached').map(c => c.mesh))[0];
    if (hit) return hit.object.userData.chunk;
    // 小屏边缘容差只扩到最近的一块，不能把空白长按解释成远处接触。
    let nearest = null, distance = Math.min(30, width * .075);
    for (const c of chunks.filter(c => c.state === 'attached')) {
      const p = Project(c.mesh.position);
      const d = Math.hypot(x - p.x, y - p.y);
      if (d < distance) { nearest = c; distance = d; }
    }
    return nearest;
  }
  function Peel(c, progress, sideways = 0) {
    c.progress = progress;
    const curl = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), progress * -.85);
    c.mesh.quaternion.copy(c.rotation).multiply(curl);
    if (c.type === 'wet') {
      c.mesh.position.copy(c.origin).addScaledVector(c.normal, progress * 1.7).addScaledVector(up, -progress * .62).addScaledVector(right, sideways * .12);
    } else {
      // 远缘仍然粘在内壁上：围绕边缘撬起，最后一小段才整体抬离，避免变成悬浮拖拽物。
      const hinge = new THREE.Vector3(0, c.size * 1.07, .3);
      const offset = hinge.clone().sub(hinge.clone().applyQuaternion(curl)).applyQuaternion(c.rotation);
      c.mesh.position.copy(c.origin).add(offset).addScaledVector(c.normal, Math.max(0, progress - .82) * 1.8);
    }
    const p = c.mesh.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = c.original[i * 3], y = c.original[i * 3 + 1], z = c.original[i * 3 + 2];
      // 完整连通的薄片从近缘卷起；软块有轻微弹性鼓起，不裁三角面、不缩成屑。
      const lip = Clamp((-y / c.size + 1) * .5);
      p.setXYZ(i, x * (1 - progress * .05), y, z + progress * .36 * lip * lip);
    }
    p.needsUpdate = true; c.mesh.geometry.computeVertexNormals();
    c.mark.material.opacity = progress * .36;
    ring.visible = true; ring.position.copy(c.origin).addScaledVector(toward, .6); ring.scale.setScalar(c.size * (1.1 + progress * .12));
    for (let i = 0; i < threads.length; i++) {
      const t = threads[i]; t.visible = c.type === 'wet' && progress > .12;
      if (!t.visible) continue;
      const start = c.origin.clone().addScaledVector(right, (i - 1) * .19);
      const end = c.mesh.position.clone().addScaledVector(right, (i - 1) * .14);
      const delta = end.clone().sub(start);
      t.position.copy(start).add(end).multiplyScalar(.5);
      t.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.clone().normalize());
      t.scale.set(1 - progress * .6, delta.length(), 1 - progress * .6);
    }
  }
  function ShowTool(c, id, progress = 0) {
    tool.visible = true;
    tool.position.copy(c.mesh.position).addScaledVector(toward, .45).addScaledVector(up, -.35);
    tool.quaternion.copy(camera.quaternion);
    head.visible = id !== 'tweezers'; jaws.forEach(m => { m.visible = id === 'tweezers'; });
    shaft.material = id === 'tweezers' ? steel : bamboo;
    for (let i = 0; i < jaws.length; i++) jaws[i].position.x = (i ? 1 : -1) * (.19 - progress * .1);
  }
  function HideTool() { tool.visible = ring.visible = false; threads.forEach(t => { t.visible = false; }); }
  function TrayPosition(c) {
    const col = c.slot % 5, row = Math.floor(c.slot / 5);
    return new THREE.Vector3((col - 2) * 1.24 + (row ? .2 : 0), (row ? -.34 : .27), .2).multiplyScalar(tray.scale.x).applyQuaternion(tray.quaternion).add(tray.position);
  }
  function SetTrayPose(c) {
    c.mesh.position.copy(TrayPosition(c)); c.mesh.quaternion.copy(camera.quaternion);
    c.mesh.rotateZ(c.seed); c.mesh.scale.setScalar(.62 * tray.scale.x);
  }
  function Release(c, slot) {
    c.state = 'flying'; c.slot = slot; c.fly = 0;
    c.flyFrom = c.mesh.position.clone(); c.flyRotation = c.mesh.quaternion.clone();
    c.mark.material.opacity = .45;
    HideTool();
  }
  function Update(dt) {
    Resize();
    if (dropTarget && dropAge < .45) {
      dropAge += dt;
      const t = Math.min(1, dropAge / .45);
      droplet.position.copy(dropTarget).addScaledVector(up, (1 - t) * 1.4).addScaledVector(toward, .35);
      droplet.scale.set(1, 1 + (1 - t) * .55, 1);
      droplet.visible = t < 1;
    }
    const landed = [];
    for (const c of chunks) {
      if (c.state === 'returning') {
        const p = Math.max(0, c.progress - dt * 2.8); Peel(c, p);
        HideTool();
        if (!p) { c.state = 'attached'; c.mesh.position.copy(c.origin); }
      }
      if (c.state === 'flying') {
        c.fly += dt;
        const t = Clamp(c.fly / 1.0), ease = t * t * (3 - 2 * t);
        c.mesh.position.lerpVectors(c.flyFrom, TrayPosition(c), ease).addScaledVector(toward, Math.sin(t * Math.PI) * 3.0);
        c.mesh.quaternion.copy(c.flyRotation).slerp(camera.quaternion, ease);
        c.mesh.rotateZ(Math.sin(t * Math.PI) * .8);
        c.mesh.scale.setScalar(1 + Math.sin(t * Math.PI) * .22 - ease * (1 - .62 * tray.scale.x));
        if (t === 1) { c.state = 'collected'; c.landAge = 0; SetTrayPose(c); landed.push(c); }
      }
      if (c.state === 'collected') {
        c.landAge = Math.min(1, (c.landAge || 0) + dt);
        if (c.landAge < .65) {
          SetTrayPose(c);
          const bounce = Math.sin(Math.min(1, c.landAge / .55) * Math.PI) * Math.exp(-c.landAge * 4);
          c.mesh.position.addScaledVector(toward, bounce * .32);
          c.mesh.scale.z *= 1 - bounce * .22;
        }
        if (c.mark.material.opacity > 0) c.mark.material.opacity = Math.max(0, c.mark.material.opacity - dt * .16);
      }
    }
    return landed;
  }
  function Targets() { return chunks.map(c => ({ id: c.id, type: c.type, state: c.state, progress: c.progress, softened: c.softened, vertices: c.mesh.geometry.attributes.position.count, triangles: c.mesh.geometry.index.count / 3, position: c.mesh.position.toArray(), screen: Project(c.mesh.position) })); }
  return { canal, Reset, Pick, Peel, ShowTool, HideTool, Release, Update, Targets, Project, Resize,
    Drop(c) { dropTarget = c.mesh.position.clone(); dropAge = 0; droplet.visible = true; },
    get chunks() { return chunks; },
    Dispose() { anatomy.dispose(); root.traverse(n => { n.geometry?.dispose(); }); } };
}
