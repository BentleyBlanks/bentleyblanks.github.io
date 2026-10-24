// An isolated lab: private rigs, cloned materials/geometry, no campaign writes.
import * as THREE from 'three';
import { ManagedGLTFLoader } from './Script_ModelImports.mjs';
import { CloneSkinnedRig } from './Script_SkinnedClone.mjs';
import { CloneShadedMaterial } from './Script_Materials.mjs';
import { BlanketClothRig } from './Script_BlanketCloth.mjs';
import { ApplyClothWind, ClothLabContactFriction } from './Script_ClothLabSimulation.mjs';
import { T } from './Script_Text.mjs';
import { CLOTH_LAB_ASSETS, CLOTH_LAB_PRESETS, CLOTH_LAB_CONTROLS, CLOTH_LAB_SIM as S, ClampClothParameter } from './Data_Tuning_ClothRange.mjs';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const Version = '20261025ClothLab4';
const Style = `
#cloth-range-panel{position:fixed;left:16px;top:16px;bottom:52px;width:308px;z-index:24;background:rgba(25,29,29,.94);color:#e9e4d5;border:1px solid #727465;border-radius:8px;box-shadow:0 8px 32px #0005;font:13px/1.45 system-ui,sans-serif;overflow:auto;pointer-events:auto;padding:16px;box-sizing:border-box}
#cloth-range-panel *{box-sizing:border-box}#cloth-range-panel h2{font-size:19px;margin:0 0 3px;font-weight:650}#cloth-range-panel h3{font-size:12px;color:#bdbaab;font-weight:500;letter-spacing:.08em;margin:18px 0 8px}#cloth-range-panel p{font-size:12px;color:#c2c4b8;margin:7px 0}
#cloth-range-panel button,#cloth-range-panel select{background:#373d3b;border:1px solid #636b62;color:#e9e4d5;border-radius:4px;font:inherit;padding:7px 9px;cursor:pointer}#cloth-range-panel button:hover{background:#4d554c}#cloth-range-panel button[aria-pressed=true]{background:#d2bf85;color:#252922;border-color:#d2bf85}#cloth-range-panel button:disabled{opacity:.4;cursor:wait}
#cloth-range-panel .cloth-playback{position:sticky;top:-16px;z-index:2;background:#202827;padding:10px 0 12px;border-bottom:1px solid #69725e}#cloth-range-panel [data-cloth-playback]{color:#dcc487;font-weight:600;margin:6px 0}#cloth-range-panel .cloth-editing{font-weight:600;color:#e1d5ad}
#cloth-range-panel .cloth-tabs{display:grid;gap:5px;margin:14px 0}#cloth-range-panel .cloth-tabs button{text-align:left}#cloth-range-panel .cloth-buttons{display:flex;flex-wrap:wrap;gap:5px}#cloth-range-panel select{width:100%}#cloth-range-panel .cloth-control{display:grid;grid-template-columns:1fr 100px;gap:2px 8px;margin:8px 0;align-items:center}#cloth-range-panel output{color:#dcc487;text-align:right;font-variant-numeric:tabular-nums}#cloth-range-panel input[type=range]{grid-column:1/3;width:100%;margin:3px 0;accent-color:#c8b77d;cursor:pointer}#cloth-range-panel .cloth-note{border-left:2px solid #c2ad74;padding-left:9px;margin-top:12px}#cloth-range-panel .cloth-limit{font-size:11px;color:#a5aaa0;border-top:1px solid #535a50;padding-top:10px}#cloth-range-panel [data-cloth-stats]{font:11px/1.5 ui-monospace,monospace;color:#bfc2af;margin:12px 0 5px}
#cloth-range-toggle{position:fixed;left:16px;bottom:16px;z-index:25;background:#252d29;color:#e7dfc9;border:1px solid #777c68;border-radius:4px;padding:7px 12px;font:12px system-ui;cursor:pointer}#cloth-range-hint{position:fixed;right:16px;bottom:16px;z-index:23;background:#202823bd;color:#eee8d5;padding:8px 14px;border-radius:4px;font:12px system-ui;pointer-events:none}
@media(max-width:700px){#cloth-range-panel{width:256px;left:8px;top:8px;bottom:48px;padding:12px}#cloth-range-hint{max-width:45%;font-size:10px;right:8px}#cloth-range-toggle{left:8px;bottom:8px}}
`;

export class ClothRange {
  constructor(host) {
    this.host = host; this.items = []; this.selected = 'quilt'; this.ready = false; this.error = null;
    this.clock = 0; this.accumulator = 0; this.paused = false; this.stepFrames = 0; this.simMs = 0;
    this.panelShown = true; this.wireframe = false; this.disposed = false; this.listeners = [];
    this.target = V(-3, 0.65, 0); this.radius = 3.6; this.azimuth = 0.5; this.elevation = 0.56;
    this.root = new THREE.Group(); this.root.name = 'ClothRangeSamples'; host.scene.add(this.root);
    this.resources = new Set(); this.loadedResources = new Set();
    this.MakeBody(); this.MakePanel(); this.BindCamera();
    host.SetViewmodelHidden?.(true);
    this.api = {
      State: () => this.State(), Select: id => this.Select(id), Preset: id => this.Preset(id), Set: (key, value) => this.Set(key, value),
      Reset: () => this.Reset(), Pause: on => this.Pause(on), Step: count => this.Step(count), Gust: () => this.Gust(),
      Action: id => this.Action(id), Camera: id => this.Camera(id), Export: () => this.Export(),
      ShowPanel: on => this.ShowPanel(on), Wireframe: on => this.Wireframe(on),
    };
    this.loading = this.Load();
  }
  Listen(target, name, fn, options) { target.addEventListener(name, fn, options); this.listeners.push(() => target.removeEventListener(name, fn, options)); }
  Own(resource) { this.resources.add(resource); return resource; }
  Cut() { this.host.post?.NotifyCameraCut?.(); this.host.NotifyCameraCut?.(); }
  MakeBody() {
    this.body = new THREE.Group(); this.body.name = 'ClothLabContactDummy'; this.body.position.x = -3;
    const material = this.Own(new THREE.MeshStandardMaterial({ color: 0x65584a, roughness: 0.94 }));
    const Make = (geometry, x, y, z, rx = 0) => {
      const mesh = new THREE.Mesh(this.Own(geometry), material); mesh.position.set(x, y, z); mesh.rotation.x = rx;
      mesh.castShadow = true; mesh.receiveShadow = true; this.body.add(mesh); return mesh;
    };
    Make(new THREE.CapsuleGeometry(S.bodyRadius, 0.47, 5, 16), 0, S.bodyY, 0.05, Math.PI / 2);
    Make(new THREE.SphereGeometry(0.17, 16, 12), 0, 0.47, 0.84);
    for (const side of [-1, 1]) Make(new THREE.CapsuleGeometry(0.105, 0.48, 4, 10), side * 0.14, 0.27, -0.62, Math.PI / 2);
    this.root.add(this.body);
    this.bodyColliders = [
      { a: V(-3, S.bodyY, -0.185), b: V(-3, S.bodyY, 0.285), r: S.bodyRadius },
      ...[-1, 1].map(side => ({ a: V(-3 + side * 0.14, 0.27, -0.86), b: V(-3 + side * 0.14, 0.27, -0.38), r: 0.105 })),
      { a: V(-3, 0.47, 0.84), b: V(-3, 0.47, 0.84), r: 0.17 },
    ];
    this.pusher = new THREE.Mesh(this.Own(new THREE.SphereGeometry(0.24, 20, 12)),
      this.Own(new THREE.MeshStandardMaterial({ color: 0xa98756, roughness: 0.8 })));
    this.pusher.name = 'ClothLabDoorPusher'; this.pusher.visible = false; this.pusher.castShadow = true; this.root.add(this.pusher);
  }
  async Load() {
    try {
      const loader = new ManagedGLTFLoader();
      for (const spec of CLOTH_LAB_ASSETS) {
        const url = `./Model/ClothLab/${spec.file}?v=${Version}`;
        const asset = await loader.loadAsync(url);
        asset.scene.traverse(o => { if (o.isMesh) { this.loadedResources.add(o.geometry); for (const m of Array.isArray(o.material) ? o.material : [o.material]) { this.loadedResources.add(m); for (const value of Object.values(m)) if (value?.isTexture) this.loadedResources.add(value); } } });
        if (this.disposed) { for (const resource of this.loadedResources) resource.dispose?.(); return; }
        const root = CloneSkinnedRig(asset.scene); root.name = `ClothLab_${spec.id}`;
        const meshes = [];
        root.traverse(o => {
          if (!o.isMesh) return;
          o.geometry = this.Own(o.geometry.clone());
          const materials = (Array.isArray(o.material) ? o.material : [o.material]).map(m => this.Own(CloneShadedMaterial(m)));
          o.material = Array.isArray(o.material) ? materials : materials[0];
          o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false;
          meshes.push({ mesh: o, base: Float32Array.from(o.geometry.attributes.position.array),
            baseNormal: o.geometry.attributes.normal && Float32Array.from(o.geometry.attributes.normal.array),
            baseTangent: o.geometry.attributes.tangent && Float32Array.from(o.geometry.attributes.tangent.array), materials });
        });
        this.root.add(root);
        const cfg = { ...CLOTH_LAB_PRESETS[spec.preset] };
        const rig = new BlanketClothRig(root, { ...cfg, tether: 0, iterations: S.iterations, maxSpeedMps: S.maxSpeedMps });
        const item = { id: spec.id, spec, url, root, rig, meshes, cfg, preset: spec.preset, action: spec.id === 'quilt' ? 'drape' : 'hang',
          gustUntil: 0, pushStart: -Infinity, held: false };
        item.friction = new ClothLabContactFriction(rig.cloth, { GetCoefficient: () => item.cfg.groundFriction });
        this.items.push(item); this.ApplyConfig(item); this.ResetItem(item);
      }
      this.ready = true;
      // Settle the default pose at a fixed rate before showing its first complete frame.
      for (let n = 0; n < 72; n++) this.Simulate(S.stepS);
      this.clock = 0; this.Camera(this.selected); this.PaintPanel(); this.Cut();
    } catch (error) {
      this.error = String(error.message || error); console.error('[ClothRange]', error); this.PaintPanel();
    }
  }
  ApplyConfig(item) {
    const { cfg, rig } = item;
    Object.assign(rig.cloth.cfg, cfg, { groundOffsetM: cfg.thickness * 0.55 + 0.008, bodyMarginM: cfg.thickness * 0.55 + 0.012,
      tether: item.id === 'quilt' ? 0.8 : 0, tetherSlack: 1.025, tetherSlackFar: 1.025, maxSpeedMps: S.maxSpeedMps });
    const ratio = cfg.thickness / item.spec.thickness;
    for (const entry of item.meshes) {
      const geometry = entry.mesh.geometry, pos = geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) pos.setY(i, entry.base[i * 3 + 1] * ratio);
      pos.needsUpdate = true;
      // Transform the authored tangent frame analytically. Recomputing normals alone
      // leaves stale tangents; recomputing tangents loses the binding's UV seams.
      const normal = geometry.attributes.normal, tangent = geometry.attributes.tangent;
      if (normal && entry.baseNormal) {
        for (let i = 0; i < normal.count; i++) {
          const j = i * 3, nx = entry.baseNormal[j], ny = entry.baseNormal[j + 1] / ratio, nz = entry.baseNormal[j + 2];
          const length = Math.hypot(nx, ny, nz) || 1; normal.setXYZ(i, nx / length, ny / length, nz / length);
        }
        normal.needsUpdate = true;
      }
      if (tangent && entry.baseTangent) {
        for (let i = 0; i < tangent.count; i++) {
          const j = i * 4;
          let tx = entry.baseTangent[j], ty = entry.baseTangent[j + 1] * ratio, tz = entry.baseTangent[j + 2];
          if (normal) {
            const nx = normal.getX(i), ny = normal.getY(i), nz = normal.getZ(i), dot = tx * nx + ty * ny + tz * nz;
            tx -= nx * dot; ty -= ny * dot; tz -= nz * dot;
            // Quantized GLB frames need re-orthogonalizing when a 2.5 mm sample
            // is expanded to 120 mm; preserve handedness, including UV seams.
            if (Math.hypot(tx, ty, tz) < 1e-8) {
              const ax = Math.abs(nx) < 0.8 ? 1 : 0, ay = ax ? 0 : 1, projection = ax * nx + ay * ny;
              tx = ax - nx * projection; ty = ay - ny * projection; tz = -nz * projection;
            }
          }
          const length = Math.hypot(tx, ty, tz) || 1; tangent.setXYZW(i, tx / length, ty / length, tz / length, entry.baseTangent[j + 3]);
        }
        tangent.needsUpdate = true;
      }
      geometry.computeBoundingSphere();
      for (const material of entry.materials) { material.roughness = cfg.roughness; material.wireframe = this.wireframe; }
    }
  }
  ResetItem(item) {
    item.gustUntil = 0; item.pushStart = -Infinity;
    if (item.action === 'slide') {
      item.root.position.set(item.spec.x, item.rig.cloth.cfg.groundOffsetM, S.slideZ);
      item.root.rotation.set(0, 0, 0);
      if (item.id === 'quilt') this.body.visible = false;
    } else if (item.id === 'quilt') {
      item.root.position.set(item.spec.x, item.action === 'drape' ? 1.05 : 0.7, 0);
      item.root.rotation.set(0, 0, 0); this.body.visible = item.action === 'drape';
    } else {
      item.root.position.set(item.spec.x, item.spec.top - item.spec.length / 2, 0);
      item.root.rotation.set(-Math.PI / 2, 0, Math.PI);
    }
    item.root.updateMatrixWorld(true);
    const grid = item.rig.cloth;
    grid.Reset(item.rig.AssetToWorld());
    item.friction.Reset();
    grid.SampleGround(() => 0, true);
    if (item.id !== 'quilt' && item.action !== 'slide') {
      for (let c = 0; c < grid.cols; c++) {
        const i = grid.Index(0, c); grid.SetPin(i, new THREE.Vector3().fromArray(grid.x, i * 3));
      }
    }
    if (item.action === 'slide') for (let i = 0; i < grid.n; i++) grid.v[i * 3] = S.slideSpeedMps;
    this.Pins(item); this.Colliders(item); item.rig.Apply(); this.Cut();
  }
  Pins(item) {
    if (item.id !== 'quilt') return;
    const grid = item.rig.cloth, held = item.action === 'lift';
    for (const [key, side] of [['headL', 1], ['headR', -1]]) {
      grid.SetPin(item.rig.corners[key], held ? V(item.spec.x + side * 0.59, 1.42, 0.62) : null);
      // A small gathered grip spreads the force over the edge instead of making a rubber point.
      const index = grid.Index(1, side === 1 ? 0 : grid.cols - 1);
      grid.SetPin(index, held ? V(item.spec.x + side * 0.57, 1.32, 0.59) : null, 0.25, true);
    }
  }
  Colliders(item, dt = S.stepS) {
    if (item.id === 'quilt') item.friction.SetColliders(item.action === 'drape' ? this.bodyColliders : [], dt);
    else if (item.id === 'curtain') {
      const t = this.clock - item.pushStart;
      const active = t >= 0 && t < 2.4;
      this.pusher.visible = active;
      if (active) {
        // Advance through the curtain, then withdraw; the fabric returns under gravity.
        const z = -0.7 + Math.sin(Math.PI * t / 2.4) * 1.5;
        this.pusher.position.set(item.spec.x, 1.25, z);
        item.friction.SetColliders([{ id: 'Pusher', a: this.pusher.position, b: this.pusher.position, r: 0.24 }], dt);
      } else item.friction.SetColliders([], dt);
    }
  }
  Simulate(dt) {
    this.clock += dt;
    for (const item of this.items) {
      const grid = item.rig.cloth;
      this.Pins(item); this.Colliders(item, dt); grid.SampleGround(() => 0);
      const gust = Math.max(0, (item.gustUntil - this.clock) / S.gustS) * S.gustMps;
      ApplyClothWind(grid, item.cfg, this.clock, dt, gust);
      grid.Step(dt); item.rig.Apply();
    }
  }
  Update(dt) {
    if (!this.ready || this.disposed || this.host.CanUse?.() === false) return;
    const start = performance.now();
    if (this.paused) {
      const steps = Math.min(this.stepFrames, S.maxSteps); this.stepFrames -= steps;
      for (let n = 0; n < steps; n++) this.Simulate(S.stepS);
    } else {
      this.accumulator = Math.min(this.accumulator + Math.max(0, dt), S.stepS * S.maxSteps);
      while (this.accumulator >= S.stepS) { this.Simulate(S.stepS); this.accumulator -= S.stepS; }
    }
    this.simMs = this.simMs * 0.9 + (performance.now() - start) * 0.1;
    if (!this.lastPaint || performance.now() - this.lastPaint > 200) { this.PaintStats(); this.lastPaint = performance.now(); }
  }
  Current() { return this.items.find(item => item.id === this.selected); }
  Select(id) { if (!CLOTH_LAB_ASSETS.some(item => item.id === id)) return false; this.selected = id; this.PaintPanel(); this.Camera(id); return true; }
  Preset(id) {
    const item = this.Current(), preset = CLOTH_LAB_PRESETS[id]; if (!item || !preset) return false;
    item.cfg = { ...preset }; item.preset = id; this.ApplyConfig(item); this.ResetItem(item); this.PaintPanel(); return true;
  }
  Set(key, value) {
    const item = this.Current(), bounded = ClampClothParameter(key, Number(value));
    if (!item || bounded === null) return false;
    item.cfg[key] = bounded; item.preset = 'custom';
    if (key === 'thickness' || key === 'roughness') { this.ApplyConfig(item); this.Cut(); }
    else Object.assign(item.rig.cloth.cfg, item.cfg);
    this.PaintValues(); return bounded;
  }
  Reset() { const item = this.Current(); if (!item) return false; this.ResetItem(item); this.PaintStats(); return true; }
  Pause(on = !this.paused) { this.paused = !!on; this.accumulator = 0; this.stepFrames = 0; this.PaintValues(); return this.paused; }
  Step(count = 1) { this.paused = true; this.stepFrames += Math.min(120, Math.max(1, Math.floor(Number(count) || 1))); this.PaintValues(); return this.stepFrames; }
  Gust() { const item = this.Current(); if (!item) return false; item.gustUntil = this.clock + S.gustS; return true; }
  Action(id) {
    const item = this.Current(); if (!item) return false;
    if (id === 'preview') {
      item.action = item.id === 'quilt' ? 'drape' : 'hang'; this.ResetItem(item);
      if (item.id === 'curtain') item.pushStart = this.clock;
      if (item.id === 'banner') item.gustUntil = this.clock + S.gustS;
      this.Pause(false); this.Camera(item.id); this.PaintValues(); return true;
    }
    if (id === 'slide' || (id === 'hang' && item.id !== 'quilt')) {
      item.action = id; this.ResetItem(item); this.Camera(item.id); this.PaintValues(); return true;
    }
    if (id === 'gust') return this.Gust();
    if (id === 'push' && item.id === 'curtain') {
      if (item.action !== 'hang') { item.action = 'hang'; this.ResetItem(item); this.Camera(item.id); }
      item.pushStart = this.clock; this.PaintValues(); return true;
    }
    if (item.id === 'quilt' && ['drape', 'lift', 'drop'].includes(id)) {
      item.action = id; this.body.visible = id === 'drape';
      if (id === 'drape') this.ResetItem(item); else { this.Pins(item); this.Colliders(item); }
      this.PaintValues(); return true;
    }
    return false;
  }
  Wireframe(on = !this.wireframe) { this.wireframe = !!on; for (const item of this.items) for (const entry of item.meshes) for (const material of entry.materials) material.wireframe = this.wireframe; this.Cut(); this.PaintValues(); return this.wireframe; }
  Export() { return { version: 2, scope: 'ClothRangeOnly', simulation: 'PBD', contactFriction: 'Coulomb', items: this.items.map(item => ({ id: item.id, preset: item.preset, parameters: { ...item.cfg } })) }; }
  Download() {
    const blob = new Blob([JSON.stringify(this.Export(), null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob), link = document.createElement('a'); link.href = url; link.download = 'Data_ClothRangePreset.json'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  State() {
    return { ready: this.ready, error: this.error, selected: this.selected, paused: this.paused, clock: this.clock, simMs: this.simMs,
      panelShown: this.panelShown, wireframe: this.wireframe, items: this.items.map(item => {
        const cloth = item.rig.cloth; let checksum = 0, finite = true;
        for (let i = 0; i < cloth.x.length; i++) { checksum += cloth.x[i] * (i + 1); finite &&= Number.isFinite(cloth.x[i]); }
        return { id: item.id, cfg: { ...item.cfg }, preset: item.preset, action: item.action, asset: item.url,
          points: cloth.n, meshCount: item.meshes.length, skinnedCount: item.meshes.filter(e => e.mesh.isSkinnedMesh).length,
          materialCount: new Set(item.meshes.flatMap(e => e.materials)).size, stats: cloth.Stats(), friction: item.friction.Stats(), finite, poseChecksum: +checksum.toFixed(6),
          pins: [...cloth.pins].filter(([, pin]) => pin.k >= 1).map(([index, pin]) => ({ index, target: pin.target.toArray(),
            position: Array.from(cloth.x.slice(index * 3, index * 3 + 3)), gapM: pin.target.distanceTo(new THREE.Vector3().fromArray(cloth.x, index * 3)) })),
        };
      }) };
  }
  Camera(id = this.selected) {
    if (id === 'overview') { this.target.set(0, 1.2, 0); this.radius = 9.2; this.azimuth = 0.16; this.elevation = 0.34; }
    else { const spec = CLOTH_LAB_ASSETS.find(entry => entry.id === id); if (!spec) return false;
      const sliding = this.items.find(item => item.id === id)?.action === 'slide';
      this.target.set(spec.x, sliding ? 0.15 : id === 'quilt' ? 0.65 : 1.55, sliding ? S.slideZ : 0); this.radius = sliding || id === 'quilt' ? 3.45 : 3.7;
      this.azimuth = sliding || id === 'quilt' ? 0.55 : 0.16; this.elevation = sliding || id === 'quilt' ? 0.58 : 0.12;
    }
    this.Cut(); this.UpdateCamera(); return true;
  }
  BindCamera() {
    const canvas = this.host.canvas || this.host.renderer?.domElement;
    if (!canvas) return;
    this.Listen(canvas, 'contextmenu', event => event.preventDefault());
    this.Listen(canvas, 'pointerdown', event => {
      if (this.host.CanUse?.() === false) return;
      this.pointer = { id: event.pointerId, x: event.clientX, y: event.clientY, pan: event.button === 2 || event.shiftKey };
      canvas.setPointerCapture?.(event.pointerId); event.preventDefault();
    });
    this.Listen(canvas, 'pointermove', event => {
      const p = this.pointer; if (!p || p.id !== event.pointerId) return;
      const dx = event.clientX - p.x, dy = event.clientY - p.y; p.x = event.clientX; p.y = event.clientY;
      if (p.pan) { const right = V(1, 0, 0).applyQuaternion(this.host.camera.quaternion); this.target.addScaledVector(right, -dx * this.radius * S.cameraPan); this.target.y += dy * this.radius * S.cameraPan; }
      else { this.azimuth -= dx * S.cameraTurn; this.elevation = Math.max(-0.12, Math.min(1.45, this.elevation + dy * S.cameraTurn)); }
    });
    const End = () => { this.pointer = null; };
    this.Listen(canvas, 'pointerup', End); this.Listen(canvas, 'pointercancel', End); this.Listen(window, 'blur', End);
    this.Listen(canvas, 'wheel', event => { if (this.host.CanUse?.() === false) return; event.preventDefault(); this.radius = Math.max(S.cameraMin, Math.min(S.cameraMax, this.radius * Math.exp(event.deltaY * S.cameraZoom))); }, { passive: false });
    this.oldTouchAction = canvas.style.touchAction; canvas.style.touchAction = 'none';
  }
  UpdateCamera() {
    if (this.disposed) return;
    const camera = this.host.camera, horizontal = this.radius * Math.cos(this.elevation);
    camera.position.set(this.target.x + Math.sin(this.azimuth) * horizontal, Math.max(0.16, this.target.y + this.radius * Math.sin(this.elevation)), this.target.z + Math.cos(this.azimuth) * horizontal);
    camera.lookAt(this.target); camera.updateMatrixWorld();
    const width = window.innerWidth, height = window.innerHeight;
    const panelWidth = this.panelShown ? (width <= 700 ? 264 : 340) : 0;
    if (camera.setViewOffset) camera.setViewOffset(width, height, -panelWidth / 2, 0, width, height);
  }
  MakePanel() {
    this.style = document.createElement('style'); this.style.textContent = Style; document.head.appendChild(this.style);
    this.panel = document.createElement('section'); this.panel.id = 'cloth-range-panel'; this.panel.setAttribute('aria-label', T('cloth.title')); document.body.appendChild(this.panel);
    this.toggle = document.createElement('button'); this.toggle.id = 'cloth-range-toggle'; document.body.appendChild(this.toggle);
    this.hint = document.createElement('div'); this.hint.id = 'cloth-range-hint'; this.hint.textContent = T('cloth.instructions'); document.body.appendChild(this.hint);
    this.Listen(this.toggle, 'click', () => this.ShowPanel(!this.panelShown));
    this.Listen(this.panel, 'pointerdown', event => event.stopPropagation());
    this.Listen(this.panel, 'keydown', event => { if (event.code !== 'Escape') event.stopPropagation(); });
    this.Listen(this.panel, 'click', event => {
      const button = event.target.closest('button'); if (!button) return;
      if (button.dataset.clothSelect) this.Select(button.dataset.clothSelect);
      const action = button.dataset.clothAction; if (!action) return;
      if (action === 'reset') this.Reset(); else if (action === 'pause') this.Pause(); else if (action === 'step') this.Step();
      else if (action === 'restore') this.Preset(this.Current()?.spec.preset); else if (action === 'export') this.Download();
      else if (action === 'overview' || action === 'focus') this.Camera(action === 'overview' ? action : this.selected);
      else if (action === 'wireframe') this.Wireframe(); else this.Action(action);
    });
    this.Listen(this.panel, 'input', event => { const key = event.target.dataset.clothParam; if (key) this.Set(key, event.target.value); });
    this.Listen(this.panel, 'change', event => { if (event.target.hasAttribute('data-cloth-preset')) this.Preset(event.target.value); });
    this.PaintPanel(); this.ShowPanel(true);
  }
  Button(id, label = id) { return `<button type="button" data-cloth-action="${id}">${T(`cloth.${label}`)}</button>`; }
  PaintPanel() {
    if (!this.panel || this.disposed) return;
    const item = this.Current();
    this.panel.innerHTML = `<h2>${T('cloth.title')}</h2><p>${T('cloth.subtitle')}</p><p>${T('cloth.independent')}</p>
      <div class="cloth-tabs">${CLOTH_LAB_ASSETS.map(spec => `<button type="button" data-cloth-select="${spec.id}" aria-pressed="${spec.id === this.selected}">${T(`cloth.${spec.id}`)}</button>`).join('')}</div>
      ${!this.ready ? `<p role="status">${T(this.error ? 'cloth.error' : 'cloth.loading')}</p>` : `
      <div class="cloth-playback"><p class="cloth-editing">${T('cloth.editing', { name: T(`cloth.${this.selected}`) })}</p><p data-cloth-playback></p><div class="cloth-buttons">${this.Button('pause')}${this.Button('step')}${this.Button('preview')}</div></div>
      <div class="cloth-buttons">${this.Button('focus')}${this.Button('overview')}${this.Button('wireframe')}</div>
      <p class="cloth-note">${T(`cloth.${this.selected}.note`)}</p>
      <h3>${T('cloth.actions')}</h3><div class="cloth-buttons">${(this.selected === 'quilt' ? ['drape', 'lift', 'drop'] : this.selected === 'curtain' ? ['push', 'gust', 'hang'] : ['gust', 'hang']).map(id => this.Button(id)).join('')}${this.Button('slide')}${this.Button('reset')}</div><p>${T('cloth.contactHint')}</p>
      <h3>${T('cloth.presets')}</h3><select data-cloth-preset aria-label="${T('cloth.presets')}">${Object.keys(CLOTH_LAB_PRESETS).map(id => `<option value="${id}">${T(`cloth.${['thin', 'cotton'].includes(id) ? id : `preset.${id}`}`)}</option>`).join('')}<option value="custom" disabled>${T('cloth.custom')}</option></select>
      <h3>${T('cloth.parameters')}</h3>${CLOTH_LAB_CONTROLS.map(control => `<label class="cloth-control"><span>${T(`cloth.${control.key}`)}</span><output data-cloth-value="${control.key}"></output><input aria-label="${T(`cloth.${control.key}`)}" data-cloth-param="${control.key}" type="range" min="${control.min}" max="${control.max}" step="${control.step}" value="${item?.cfg[control.key] ?? control.min}"></label>`).join('')}
      <div class="cloth-buttons">${this.Button('restore')}${this.Button('export')}</div><div data-cloth-stats></div><p class="cloth-limit">${T('cloth.limit')}</p>`}`;
    this.PaintValues(); this.PaintStats();
  }
  PaintValues() {
    const item = this.Current(); if (!item || !this.panel) return;
    const select = this.panel.querySelector('[data-cloth-preset]'); if (select) select.value = item.preset;
    for (const control of CLOTH_LAB_CONTROLS) {
      const input = this.panel.querySelector(`[data-cloth-param="${control.key}"]`), out = this.panel.querySelector(`[data-cloth-value="${control.key}"]`);
      if (input && input !== document.activeElement) input.value = item.cfg[control.key];
      if (out) out.textContent = `${+(item.cfg[control.key] * (control.scale || 1)).toFixed(control.scale ? 0 : 3)} ${control.unit || ''}`;
    }
    const pause = this.panel.querySelector('[data-cloth-action="pause"]'); if (pause) pause.textContent = T(this.paused ? 'cloth.play' : 'cloth.pause');
    const playback = this.panel.querySelector('[data-cloth-playback]'); if (playback) playback.textContent = T(this.paused ? 'cloth.paused' : 'cloth.running');
    for (const id of ['drape', 'lift', 'drop', 'slide', 'hang', 'wireframe']) this.panel.querySelector(`[data-cloth-action="${id}"]`)?.setAttribute('aria-pressed', String(id === 'wireframe' ? this.wireframe : item.action === id));
  }
  PaintStats() {
    const out = this.panel?.querySelector('[data-cloth-stats]'), item = this.Current(); if (!out || !item) return;
    const stats = item.rig.cloth.Stats();
    out.textContent = T('cloth.stats', { points: item.rig.cloth.n, stretch: Math.max(0, (stats.maxStretch - 1) * 100).toFixed(1), contact: stats.contact, ms: this.simMs.toFixed(2) }) + ' · ' + T('cloth.clock', { time: this.clock.toFixed(1) });
  }
  ShowPanel(on = true) { this.panelShown = !!on; if (this.panel) this.panel.hidden = !on; if (this.toggle) this.toggle.textContent = T(on ? 'cloth.hide' : 'cloth.show'); this.Cut(); return this.panelShown; }
  Dispose() {
    this.disposed = true; for (const remove of this.listeners) remove(); this.listeners.length = 0;
    for (const element of [this.panel, this.toggle, this.hint, this.style]) element?.remove();
    this.root.removeFromParent();
    for (const item of this.items) item.friction.Dispose();
    const skeletons = new Set(); this.root.traverse(o => { if (o.skeleton) skeletons.add(o.skeleton); }); for (const skeleton of skeletons) skeleton.dispose?.();
    for (const resource of new Set([...this.resources, ...this.loadedResources])) resource.dispose?.();
    this.host.camera.clearViewOffset?.(); const canvas = this.host.canvas || this.host.renderer?.domElement; if (canvas) canvas.style.touchAction = this.oldTouchAction || '';
    this.host.SetViewmodelHidden?.(false);
  }
}
