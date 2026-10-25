// An isolated lab: private rigs, cloned materials/geometry, no campaign writes.
import * as THREE from 'three';
import { ManagedGLTFLoader } from './Script_ModelImports.mjs';
import { CloneSkinnedRig } from './Script_SkinnedClone.mjs';
import { CloneShadedMaterial } from './Script_Materials.mjs';
import { BlanketClothRig } from './Script_BlanketCloth.mjs';
import { ApplyClothWind, ClothLabContactFriction } from './Script_ClothLabSimulation.mjs';
import { CreateClothSampleMaterials } from './Script_ClothSampleMaterials.mjs';
import { ClothBlood } from './Script_ClothBlood.mjs';
import { T } from './Script_Text.mjs';
import { CLOTH_LAB_ASSETS, CLOTH_LAB_PRESETS, CLOTH_LAB_CONTROLS, CLOTH_LAB_SIM as S, ClampClothParameter } from './Data_Tuning_ClothRange.mjs';
import { CLOTH_BLOOD_CONTROLS, CLOTH_BLOOD_SIM } from './Data_Tuning_ClothBlood.mjs';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const Version = '20261025ClothLab4';
const Style = `
#cloth-range-panel{position:fixed;left:16px;top:16px;bottom:52px;width:308px;z-index:24;background:rgba(25,29,29,.94);color:#e9e4d5;border:1px solid #727465;border-radius:8px;box-shadow:0 8px 32px #0005;font:13px/1.45 system-ui,sans-serif;overflow:auto;pointer-events:auto;padding:16px;box-sizing:border-box}
#cloth-range-panel *{box-sizing:border-box}#cloth-range-panel h2{font-size:19px;margin:0 0 3px;font-weight:650}#cloth-range-panel h3{font-size:12px;color:#bdbaab;font-weight:500;letter-spacing:.08em;margin:18px 0 8px}#cloth-range-panel p{font-size:12px;color:#c2c4b8;margin:7px 0}
#cloth-range-panel button,#cloth-range-panel select{background:#373d3b;border:1px solid #636b62;color:#e9e4d5;border-radius:4px;font:inherit;padding:7px 9px;cursor:pointer}#cloth-range-panel button:hover{background:#4d554c}#cloth-range-panel button[aria-pressed=true]{background:#d2bf85;color:#252922;border-color:#d2bf85}#cloth-range-panel button:disabled{opacity:.4;cursor:wait}
#cloth-range-panel .cloth-playback{position:sticky;top:-16px;z-index:2;background:#202827;padding:10px 0 12px;border-bottom:1px solid #69725e}#cloth-range-panel [data-cloth-playback]{color:#dcc487;font-weight:600;margin:6px 0}#cloth-range-panel .cloth-editing{font-weight:600;color:#e1d5ad}
#cloth-range-panel .cloth-blood{border-top:1px solid #7e645d;margin-top:14px;padding-top:3px;scroll-margin-top:110px}#cloth-range-panel .cloth-blood h3{color:#e2b2a0}#cloth-range-panel .cloth-blood button[aria-pressed=true]{background:#b66456;color:white;border-color:#db9e8c}#cloth-range-panel .cloth-blood details{margin:10px 0}#cloth-range-panel .cloth-blood summary{cursor:pointer;color:#ded1bc}#cloth-range-panel [data-blood-stats]{font-size:11px;color:#d7bdb2}#cloth-range-panel .cloth-blood input[type=range]{accent-color:#c17b68}
#cloth-range-panel .cloth-tabs{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:5px;margin:14px 0}#cloth-range-panel .cloth-tabs button{text-align:left}#cloth-range-panel .cloth-buttons{display:flex;flex-wrap:wrap;gap:5px}#cloth-range-panel select{width:100%}#cloth-range-panel .cloth-control{display:grid;grid-template-columns:1fr 100px;gap:2px 8px;margin:8px 0;align-items:center}#cloth-range-panel output{color:#dcc487;text-align:right;font-variant-numeric:tabular-nums}#cloth-range-panel input[type=range]{grid-column:1/3;width:100%;margin:3px 0;accent-color:#c8b77d;cursor:pointer}#cloth-range-panel .cloth-note{border-left:2px solid #c2ad74;padding-left:9px;margin-top:12px}#cloth-range-panel .cloth-limit{font-size:11px;color:#a5aaa0;border-top:1px solid #535a50;padding-top:10px}#cloth-range-panel [data-cloth-stats]{font:11px/1.5 ui-monospace,monospace;color:#bfc2af;margin:12px 0 5px}
#cloth-range-toggle{position:fixed;left:16px;bottom:16px;z-index:25;background:#252d29;color:#e7dfc9;border:1px solid #777c68;border-radius:4px;padding:7px 12px;font:12px system-ui;cursor:pointer}#cloth-range-hint{position:fixed;right:16px;bottom:16px;z-index:23;background:#202823bd;color:#eee8d5;padding:8px 14px;border-radius:4px;font:12px system-ui;pointer-events:none}
#cloth-range-labels{position:fixed;inset:0;z-index:22;pointer-events:none}#cloth-range-labels button{position:absolute;transform:translate(-50%,-100%);pointer-events:auto;background:#202823e0;color:#eee8d5;border:1px solid #9b9f83;border-radius:4px;padding:5px 9px;white-space:nowrap;font:12px system-ui;cursor:pointer}
@media(max-width:700px){#cloth-range-panel{width:256px;left:8px;top:8px;bottom:48px;padding:12px}#cloth-range-hint{max-width:45%;font-size:10px;right:8px}#cloth-range-toggle{left:8px;bottom:8px}}
`;

export class ClothRange {
  constructor(host) {
    this.host = host; this.items = []; this.selected = 'quilt'; this.ready = false; this.error = null;
    this.clock = 0; this.accumulator = 0; this.paused = false; this.stepFrames = 0; this.simMs = 0;
    this.panelShown = true; this.wireframe = false; this.disposed = false; this.listeners = [];
    this.bloodPlacing = false;
    this.target = V(-3, 0.65, 0); this.radius = 3.6; this.azimuth = 0.5; this.elevation = 0.56;
    this.root = new THREE.Group(); this.root.name = 'ClothRangeSamples'; host.scene.add(this.root);
    this.resources = new Set(); this.loadedResources = new Set(); this.materialBundles = new Set();
    this.MakeBody(); this.MakePanel(); this.BindCamera();
    host.SetViewmodelHidden?.(true);
    this.api = {
      State: () => this.State(), Select: id => this.Select(id), Preset: id => this.Preset(id), Set: (key, value) => this.Set(key, value),
      Reset: () => this.Reset(), Pause: on => this.Pause(on), Step: count => this.Step(count), Gust: () => this.Gust(),
      Action: id => this.Action(id), Camera: id => this.Camera(id), Export: () => this.Export(),
      ShowPanel: on => this.ShowPanel(on), Wireframe: on => this.Wireframe(on),
      Compare: () => this.Compare(),
      BloodInject: options => this.BloodInject(options), BloodFeed: (on, options) => this.BloodFeed(on, options),
      BloodSet: (key, value) => this.BloodSet(key, value), BloodClear: () => this.BloodClear(),
      BloodSeek: time => this.BloodSeek(time), BloodAdvance: seconds => this.BloodAdvance(seconds),
      BloodSource: source => this.BloodSource(source), BloodPlace: on => this.BloodPlace(on), BloodCompare: () => this.BloodCompare(),
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
      const loader = new ManagedGLTFLoader(), sources = new Map();
      for (const spec of CLOTH_LAB_ASSETS) {
        const url = `./Model/ClothLab/${spec.file}?v=${Version}`;
        if (!sources.has(spec.file)) sources.set(spec.file, loader.loadAsync(url));
        const asset = await sources.get(spec.file);
        asset.scene.traverse(o => { if (o.isMesh) { this.loadedResources.add(o.geometry); for (const m of Array.isArray(o.material) ? o.material : [o.material]) { this.loadedResources.add(m); for (const value of Object.values(m)) if (value?.isTexture) this.loadedResources.add(value); } } });
        if (this.disposed) { for (const resource of this.loadedResources) resource.dispose?.(); return; }
        const root = CloneSkinnedRig(asset.scene); root.name = `ClothLab_${spec.id}`;
        const bundle = spec.material ? CreateClothSampleMaterials(spec.material, { wireframe: this.wireframe }) : null;
        if (bundle) this.materialBundles.add(bundle);
        const meshes = [];
        root.traverse(o => {
          if (!o.isMesh) return;
          o.geometry = this.Own(o.geometry.clone());
          const materials = (Array.isArray(o.material) ? o.material : [o.material]).map(m => bundle
            ? bundle.materials[/Binding$/.test(m.name) ? 2 : /Back$/.test(m.name) ? 1 : 0]
            : this.Own(CloneShadedMaterial(m)));
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
          gustUntil: 0, pushStart: -Infinity, held: false, bloodSource: { u: .5, v: .5, side: 1 } };
        // Capture authored XZ and shell side before ApplyConfig changes thickness.
        // The shader varies over immutable material coordinates, before skinning.
        item.blood = new ClothBlood(root, { width: spec.width, length: spec.length,
          profile: spec.bloodProfile || (spec.id === 'quilt' || spec.id === 'curtain' ? 'quilt' : spec.id === 'wool' ? 'towel' : 'thin') });
        for (const entry of meshes) entry.materials = Array.isArray(entry.mesh.material) ? entry.mesh.material : [entry.mesh.material];
        item.friction = new ClothLabContactFriction(rig.cloth, { GetCoefficient: () => item.cfg.groundFriction });
        this.items.push(item); this.ApplyConfig(item); this.ResetItem(item);
      }
      this.ready = true;
      // Settle the default pose at a fixed rate before showing its first complete frame.
      for (let n = 0; n < 72; n++) this.Simulate(S.stepS);
      for (const item of this.items) item.blood.Clear();
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
    if (['slide', 'flat', 'fold'].includes(item.action) || (item.id !== 'quilt' && ['lift', 'drop'].includes(item.action))) {
      item.root.position.set(item.spec.x, item.rig.cloth.cfg.groundOffsetM, (item.spec.z || 0) + (item.action === 'slide' ? S.slideZ : 0));
      item.root.rotation.set(0, 0, 0);
      if (item.id === 'quilt') this.body.visible = false;
    } else if (item.id === 'quilt' && item.action !== 'inspect') {
      item.root.position.set(item.spec.x, item.action === 'drape' ? 1.05 : 0.7, 0);
      item.root.rotation.set(0, 0, 0); this.body.visible = item.action === 'drape';
    } else {
      item.root.position.set(item.spec.x, (item.spec.top || S.inspectTopM) - item.spec.length / 2, item.spec.z || 0);
      item.root.rotation.set(-Math.PI / 2, 0, Math.PI);
      if (item.id === 'quilt') this.body.visible = false;
    }
    item.root.updateMatrixWorld(true);
    const grid = item.rig.cloth;
    grid.Reset(item.rig.AssetToWorld());
    item.friction.Reset();
    grid.SampleGround(() => 0, true);
    if ((item.id !== 'quilt' && item.action === 'hang') || item.action === 'inspect') {
      for (let c = 0; c < grid.cols; c++) {
        const i = grid.Index(0, c); grid.SetPin(i, new THREE.Vector3().fromArray(grid.x, i * 3));
      }
    }
    if (item.action === 'slide') for (let i = 0; i < grid.n; i++) grid.v[i * 3] = S.slideSpeedMps;
    this.Pins(item); this.Colliders(item); item.rig.Apply(); this.Cut();
  }
  Pins(item) {
    const grid = item.rig.cloth;
    if (item.action === 'inspect') return;
    if (item.action === 'fold') {
      const width = item.spec.width, length = item.spec.length, z = item.spec.z || 0;
      for (const [key, side] of [['headL', 1], ['headR', -1]]) grid.SetPin(item.rig.corners[key], V(item.spec.x + side * width * .45, .8, z - length * .25));
      for (const [key, side] of [['tailL', 1], ['tailR', -1]]) grid.SetPin(item.rig.corners[key], V(item.spec.x + side * width * .45, .15, z - length * .45));
      return;
    }
    if (item.id !== 'quilt' && item.action === 'lift') {
      for (const [key, side] of [['headL', 1], ['headR', -1]]) grid.SetPin(item.rig.corners[key], V(item.spec.x + side * item.spec.width * .42, 1.65, (item.spec.z || 0) + item.spec.length * .32));
      return;
    }
    if (item.id !== 'quilt') return;
    const held = item.action === 'lift';
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
      const gust = Math.max(0, (item.gustUntil - this.clock) / S.gustS) * (item.spec.sample ? S.sampleGustMps : S.gustMps);
      ApplyClothWind(grid, item.cfg, this.clock, dt, gust);
      grid.Step(dt); item.rig.Apply();
      item.blood.Advance(dt);
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
  Compare() {
    if (!this.ready) return false;
    for (const item of this.items.filter(item => item.spec.sample)) {
      if (item.cfg.wind !== S.comparisonWindMps) item.preset = 'custom';
      item.cfg.wind = S.comparisonWindMps; item.rig.cloth.cfg.wind = S.comparisonWindMps;
      item.action = 'hang'; this.ResetItem(item); item.gustUntil = this.clock + S.gustS;
    }
    this.Select('muslin'); this.Pause(false); this.Camera('samples'); return true;
  }
  Action(id) {
    const item = this.Current(); if (!item) return false;
    if (['flat', 'fold'].includes(id) || (item.id !== 'quilt' && ['lift', 'drop'].includes(id))) {
      const held = ['lift', 'fold', 'inspect', 'hang'].includes(item.action);
      item.action = id;
      if (id === 'drop' && held) { item.rig.cloth.pins.clear(); item.rig.cloth.inv.fill(1); }
      else this.ResetItem(item);
      this.Camera(item.id); this.PaintValues(); return true;
    }
    if (id === 'preview') {
      item.action = item.id === 'quilt' ? 'drape' : 'hang'; this.ResetItem(item);
      if (item.id === 'curtain') item.pushStart = this.clock;
      if (item.id === 'banner' || item.spec.sample) item.gustUntil = this.clock + S.gustS;
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
      if (item.action === 'fold' || item.action === 'inspect') { item.rig.cloth.pins.clear(); item.rig.cloth.inv.fill(1); }
      item.action = id; this.body.visible = id === 'drape';
      if (id === 'drape') this.ResetItem(item); else { this.Pins(item); this.Colliders(item); }
      this.PaintValues(); return true;
    }
    return false;
  }
  BloodSource(source = {}) {
    const item = this.Current(); if (!item) return false;
    item.bloodSource = item.blood.Point({ ...item.bloodSource, ...source });
    if (item.blood.feed) item.blood.StartFeed(item.bloodSource);
    this.PaintBloodValues(); return { ...item.bloodSource };
  }
  BloodPlace(on = !this.bloodPlacing) {
    this.bloodPlacing = !!on; this.PaintBloodValues(); return this.bloodPlacing;
  }
  BloodInject(options = {}) {
    const item = this.Current(); if (!item) return false;
    const result = item.blood.Inject({ ...item.bloodSource, ...options }); this.PaintBloodValues(); this.Cut(); return result;
  }
  BloodFeed(on = true, options = {}) {
    const item = this.Current(); if (!item) return false;
    const result = on ? item.blood.StartFeed({ ...item.bloodSource, ...options }) : item.blood.StopFeed();
    this.PaintBloodValues(); return result;
  }
  BloodSet(key, value) {
    const item = this.Current(); if (!item) return false;
    const result = item.blood.Set(key, Number(value)); this.PaintBloodValues(); return result;
  }
  BloodClear() {
    const item = this.Current(); if (!item) return false;
    const result = item.blood.Clear(); this.PaintBloodValues(); this.Cut(); return result;
  }
  BloodSeek(timeS) {
    const item = this.Current(); if (!item) return false;
    this.Pause(true); const result = item.blood.Seek(Number(timeS)); this.PaintBloodValues(); this.Cut(); return result;
  }
  BloodAdvance(seconds = S.bloodAdvanceS) {
    const item = this.Current(); if (!item || !Number.isFinite(Number(seconds))) return false;
    this.Pause(true); const result = item.blood.Seek(Math.min(CLOTH_BLOOD_SIM.maxTimeS, item.blood.timeS + Math.max(0, Number(seconds))));
    this.PaintBloodValues(); this.Cut(); return result;
  }
  BloodCompare() {
    if (!this.ready) return false;
    const amountMl = this.Current()?.blood.params.amountMl || S.bloodCompareAmountMl;
    for (const item of this.items.filter(entry => entry.id === 'quilt' || entry.spec.bloodSample)) {
      item.blood.Clear(); item.blood.Inject({ u: .5, v: .5, side: 1, amountMl, ageS: 0 });
    }
    this.Pause(false); this.Camera('bloodCompare'); this.PaintBloodValues(); this.Cut(); return true;
  }
  Wireframe(on = !this.wireframe) { this.wireframe = !!on; for (const item of this.items) for (const entry of item.meshes) for (const material of entry.materials) material.wireframe = this.wireframe; this.Cut(); this.PaintValues(); return this.wireframe; }
  Export() { return { version: 3, scope: 'ClothRangeOnly', simulation: 'PBD', contactFriction: 'Coulomb', bloodSimulation: 'TwoLayerAbsorbentSheet', items: this.items.map(item => ({ id: item.id, preset: item.preset, parameters: { ...item.cfg }, blood: { profile: item.blood.profile, parameters: { ...item.blood.params }, source: { ...item.bloodSource } } })) }; }
  Download() {
    const blob = new Blob([JSON.stringify(this.Export(), null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob), link = document.createElement('a'); link.href = url; link.download = 'Data_ClothRangePreset.json'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  State() {
    return { ready: this.ready, error: this.error, selected: this.selected, paused: this.paused, clock: this.clock, simMs: this.simMs,
      panelShown: this.panelShown, wireframe: this.wireframe, bloodPlacing: this.bloodPlacing, items: this.items.map(item => {
        const cloth = item.rig.cloth; let checksum = 0, finite = true;
        for (let i = 0; i < cloth.x.length; i++) { checksum += cloth.x[i] * (i + 1); finite &&= Number.isFinite(cloth.x[i]); }
        return { id: item.id, cfg: { ...item.cfg }, preset: item.preset, action: item.action, asset: item.url,
          blood: item.blood.State(), bloodSource: { ...item.bloodSource },
          materialKind: item.spec.material || null, points: cloth.n, meshCount: item.meshes.length, skinnedCount: item.meshes.filter(e => e.mesh.isSkinnedMesh).length,
          materialCount: new Set(item.meshes.flatMap(e => e.materials)).size, stats: cloth.Stats(), friction: item.friction.Stats(), finite, poseChecksum: +checksum.toFixed(6),
          pins: [...cloth.pins].filter(([, pin]) => pin.k >= 1).map(([index, pin]) => ({ index, target: pin.target.toArray(),
            position: Array.from(cloth.x.slice(index * 3, index * 3 + 3)), gapM: pin.target.distanceTo(new THREE.Vector3().fromArray(cloth.x, index * 3)) })),
        };
      }) };
  }
  Camera(id = this.selected) {
    this.cameraView = id;
    if (id === 'overview') { this.target.set(0, 1.2, 1.7); this.radius = 12.5; this.azimuth = 0.32; this.elevation = 0.52; }
    else if (id === 'samples') { this.target.set(0, 1.7, 4.2); this.radius = 9.5; this.azimuth = 0; this.elevation = 0.08; }
    else if (id === 'bloodCompare') { this.target.set(-.75, 1.1, -2); this.radius = 8.6; this.azimuth = .78; this.elevation = .48; }
    else if (['front', 'back', 'close'].includes(id)) {
      const item = this.Current(); if (!item) return false;
      const grid = item.rig.cloth, { u, v } = item.bloodSource;
      const row = Math.max(1, Math.min(grid.rows - 2, Math.round((1 - v) * (grid.rows - 1))));
      const col = Math.max(1, Math.min(grid.cols - 2, Math.round((1 - u) * (grid.cols - 1))));
      const Point = (r, c) => new THREE.Vector3().fromArray(grid.x, grid.Index(r, c) * 3);
      this.target.copy(Point(row, col));
      const across = Point(row, col - 1).sub(Point(row, col + 1));
      const along = Point(row - 1, col).sub(Point(row + 1, col));
      const side = id === 'back' ? -1 : id === 'close' ? item.bloodSource.side : 1;
      const normal = along.cross(across).normalize().multiplyScalar(side);
      this.radius = id === 'close' ? 1.1 : 2.2;
      // A below-ground camera cannot reveal the back of a resting shell. Move
      // only this lab specimen to a readable hanging inspection pose first.
      if (side < 0 && item.action !== 'inspect' && (item.action === 'drape' || this.target.y + normal.y * this.radius < S.inspectCameraFloorM)) {
        item.action = 'inspect'; this.ResetItem(item); this.PaintValues(); return this.Camera(id);
      }
      this.azimuth = Math.atan2(normal.x, normal.z); this.elevation = Math.asin(Math.max(-.98, Math.min(.98, normal.y)));
    }
    else { const spec = CLOTH_LAB_ASSETS.find(entry => entry.id === id); if (!spec) return false;
      const action = this.items.find(item => item.id === id)?.action, sliding = action === 'slide', low = ['flat', 'fold', 'drop', 'slide'].includes(action);
      this.target.set(spec.x, low ? .3 : id === 'quilt' ? 0.65 : 1.55, (spec.z || 0) + (sliding ? S.slideZ : 0)); this.radius = low || id === 'quilt' ? 3.45 : 3.7;
      this.azimuth = low || id === 'quilt' ? 0.55 : 0.16; this.elevation = low || id === 'quilt' ? 0.58 : 0.12;
    }
    this.Cut(); this.UpdateCamera(); return true;
  }
  BindCamera() {
    const canvas = this.host.canvas || this.host.renderer?.domElement;
    if (!canvas) return;
    this.Listen(canvas, 'contextmenu', event => event.preventDefault());
    this.Listen(canvas, 'pointerdown', event => {
      if (this.host.CanUse?.() === false) return;
      if (event.button === 0 && (this.bloodPlacing || event.shiftKey)) {
        const bounds = canvas.getBoundingClientRect(), ray = new THREE.Raycaster();
        ray.setFromCamera(new THREE.Vector2((event.clientX - bounds.left) / bounds.width * 2 - 1, -(event.clientY - bounds.top) / bounds.height * 2 + 1), this.host.camera);
        for (const item of this.items) for (const entry of item.meshes) { entry.mesh.updateWorldMatrix(true, false); entry.mesh.skeleton?.update(); entry.mesh.computeBoundingSphere?.(); }
        const hit = ray.intersectObjects(this.items.flatMap(item => item.meshes.map(entry => entry.mesh)), false)[0];
        const item = hit && this.items.find(entry => entry.meshes.some(mesh => mesh.mesh === hit.object));
        const source = item?.blood.Hit(hit);
        if (source) {
          this.selected = item.id; this.BloodSource(source); this.bloodPlacing = false;
          if (event.shiftKey) item.blood.Inject(source);
          this.PaintPanel(); this.Cut();
        }
        event.preventDefault(); return;
      }
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
    for (const label of this.labels || []) {
      const point = label.point.clone().project(camera);
      const visible = ['overview', 'samples', 'bloodCompare'].includes(this.cameraView) && point.z > -1 && point.z < 1 && Math.abs(point.x) < 1 && Math.abs(point.y) < 1;
      label.button.hidden = !visible;
      if (visible) { label.button.style.left = `${(point.x + 1) * width / 2}px`; label.button.style.top = `${(1 - point.y) * height / 2}px`; }
    }
  }
  MakePanel() {
    this.style = document.createElement('style'); this.style.textContent = Style; document.head.appendChild(this.style);
    this.panel = document.createElement('section'); this.panel.id = 'cloth-range-panel'; this.panel.setAttribute('aria-label', T('cloth.title')); document.body.appendChild(this.panel);
    this.toggle = document.createElement('button'); this.toggle.id = 'cloth-range-toggle'; document.body.appendChild(this.toggle);
    this.hint = document.createElement('div'); this.hint.id = 'cloth-range-hint'; this.hint.textContent = T('cloth.instructions'); document.body.appendChild(this.hint);
    this.labelRoot = document.createElement('div'); this.labelRoot.id = 'cloth-range-labels'; document.body.appendChild(this.labelRoot);
    this.labels = CLOTH_LAB_ASSETS.filter(spec => spec.sample || spec.bloodSample || spec.id === 'quilt').map(spec => {
      const button = document.createElement('button'); button.type = 'button'; button.textContent = T(`cloth.${spec.id}`); button.hidden = true;
      this.labelRoot.appendChild(button); this.Listen(button, 'click', () => this.Select(spec.id));
      return { button, point: V(spec.x, (spec.top || 1) + 0.35, spec.z || 0) };
    });
    this.Listen(this.toggle, 'click', () => this.ShowPanel(!this.panelShown));
    this.Listen(this.panel, 'pointerdown', event => event.stopPropagation());
    this.Listen(this.panel, 'keydown', event => { if (event.code !== 'Escape') event.stopPropagation(); });
    this.Listen(this.panel, 'click', event => {
      const button = event.target.closest('button'); if (!button) return;
      if (button.dataset.clothSelect) this.Select(button.dataset.clothSelect);
      const bloodAction = button.dataset.bloodAction;
      if (bloodAction) {
        if (bloodAction === 'inject') this.BloodInject(); else if (bloodAction === 'feed') this.BloodFeed(true);
        else if (bloodAction === 'stop') this.BloodFeed(false); else if (bloodAction === 'clear') this.BloodClear();
        else if (bloodAction === 'place') this.BloodPlace(); else if (bloodAction === 'advance') this.BloodAdvance();
        else if (bloodAction === 'compare') this.BloodCompare();
        else if (bloodAction === 'panel') this.panel.querySelector('.cloth-blood')?.scrollIntoView({ block: 'start' });
        else if (bloodAction === 'replay') { this.BloodSeek(0); this.Pause(false); }
        return;
      }
      const action = button.dataset.clothAction; if (!action) return;
      if (action === 'reset') this.Reset(); else if (action === 'pause') this.Pause(); else if (action === 'step') this.Step();
      else if (action === 'restore') this.Preset(this.Current()?.spec.preset); else if (action === 'export') this.Download();
      else if (['overview', 'focus', 'front', 'back', 'close'].includes(action)) this.Camera(action === 'focus' ? this.selected : action);
      else if (action === 'compare') this.Compare();
      else if (action === 'wireframe') this.Wireframe(); else this.Action(action);
    });
    this.Listen(this.panel, 'input', event => {
      const key = event.target.dataset.clothParam; if (key) this.Set(key, event.target.value);
      const bloodKey = event.target.dataset.bloodParam; if (bloodKey) this.BloodSet(bloodKey, event.target.value);
      const sourceKey = event.target.dataset.bloodSource; if (sourceKey) this.BloodSource({ [sourceKey]: Number(event.target.value) });
      if (event.target.hasAttribute('data-blood-time')) {
        const out = this.panel.querySelector('[data-blood-time-value]');
        if (out) out.textContent = T('cloth.blood.time', { time: Number(event.target.value).toFixed(1), duration: this.Current().blood.durationS.toFixed(1) });
      }
    });
    this.Listen(this.panel, 'change', event => {
      if (event.target.hasAttribute('data-cloth-preset')) this.Preset(event.target.value);
      if (event.target.hasAttribute('data-blood-side')) this.BloodSource({ side: Number(event.target.value) });
      if (event.target.hasAttribute('data-blood-time')) this.BloodSeek(event.target.value);
    });
    this.PaintPanel(); this.ShowPanel(true);
  }
  Button(id, label = id) { return `<button type="button" data-cloth-action="${id}">${T(`cloth.${label}`)}</button>`; }
  BloodButton(id, label = id) { return `<button type="button" data-blood-action="${id}">${T(`cloth.blood.${label}`)}</button>`; }
  BloodPanel(item) {
    return `<section class="cloth-blood"><h3>${T('cloth.blood.title')}</h3><p>${T('cloth.blood.note')}</p>
      <div class="cloth-buttons">${['inject', 'feed', 'stop', 'place', 'clear'].map(id => this.BloodButton(id)).join('')}</div>
      <p data-blood-status></p><p data-blood-source-label></p>
      <details><summary>${T('cloth.blood.pickHint')}</summary>
        ${['u', 'v'].map(key => `<label class="cloth-control"><span>${T(`cloth.blood.source${key.toUpperCase()}`)}</span><output data-blood-source-value="${key}"></output><input aria-label="${T(`cloth.blood.source${key.toUpperCase()}`)}" data-blood-source="${key}" type="range" min="0.05" max="0.95" step="0.01" value="${item.bloodSource[key]}"></label>`).join('')}
        <select data-blood-side aria-label="${T('cloth.blood.side')}"><option value="1">${T('cloth.blood.front')}</option><option value="-1">${T('cloth.blood.back')}</option></select>
      </details>
      ${CLOTH_BLOOD_CONTROLS.map(control => `<label class="cloth-control"><span>${T(`cloth.blood.${control.key}`)}</span><output data-blood-value="${control.key}"></output><input aria-label="${T(`cloth.blood.${control.key}`)}" data-blood-param="${control.key}" type="range" min="${control.min}" max="${control.max}" step="${control.step}" value="${item.blood.params[control.key]}"></label>`).join('')}
      <h3>${T('cloth.blood.timeline')}</h3><label class="cloth-control"><span>${T('cloth.blood.timeline')}</span><output data-blood-time-value></output><input aria-label="${T('cloth.blood.timeline')}" data-blood-time type="range" min="0" max="0.1" step="0.1" value="0"></label>
      <div class="cloth-buttons">${this.BloodButton('replay')}${this.BloodButton('advance')}</div><p>${T('cloth.blood.timelineNote')}</p>
      <div class="cloth-buttons">${this.BloodButton('compare')}</div><p>${T('cloth.blood.compareNote')}</p>
      <p data-blood-stats></p><p class="cloth-limit">${T('cloth.blood.limit')}</p></section>`;
  }
  PaintPanel() {
    if (!this.panel || this.disposed) return;
    const item = this.Current();
    this.panel.innerHTML = `<h2>${T('cloth.title')}</h2><p>${T('cloth.subtitle')}</p><p>${T('cloth.independent')}</p>
      <div class="cloth-tabs">${CLOTH_LAB_ASSETS.map(spec => `<button type="button" data-cloth-select="${spec.id}" aria-pressed="${spec.id === this.selected}">${T(`cloth.${spec.id}`)}</button>`).join('')}</div>
      ${!this.ready ? `<p role="status">${T(this.error ? 'cloth.error' : 'cloth.loading')}</p>` : `
      <div class="cloth-playback"><p class="cloth-editing">${T('cloth.editing', { name: T(`cloth.${this.selected}`) })}</p><p data-cloth-playback></p><div class="cloth-buttons">${this.Button('pause')}${this.Button('step')}${this.Button('preview')}${this.BloodButton('panel', 'title')}</div></div>
      <div class="cloth-buttons">${this.Button('focus')}${this.Button('front')}${this.Button('back')}${this.Button('close')}${this.Button('overview')}${this.Button('wireframe')}${this.Button('compare')}</div>
      <p data-cloth-inspection hidden>${T('cloth.inspect')}</p>
      ${item?.spec.sample ? `<p>${T('cloth.compare.note')}</p>` : ''}
      <p class="cloth-note">${T(`cloth.${this.selected}.note`)}</p>
      <h3>${T('cloth.actions')}</h3><div class="cloth-buttons">${(this.selected === 'quilt' ? ['drape', 'lift', 'drop'] : item?.spec.bloodSample ? ['lift', 'drop', 'hang'] : this.selected === 'curtain' ? ['push', 'gust', 'hang'] : ['gust', 'hang']).map(id => this.Button(id)).join('')}${this.Button('flat')}${this.Button('fold')}${this.Button('slide')}${this.Button('reset')}</div><p>${T('cloth.contactHint')}</p>
      ${item ? this.BloodPanel(item) : ''}
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
    const inspection = this.panel.querySelector('[data-cloth-inspection]'); if (inspection) inspection.hidden = item.action !== 'inspect';
    for (const id of ['drape', 'lift', 'drop', 'slide', 'hang', 'wireframe']) this.panel.querySelector(`[data-cloth-action="${id}"]`)?.setAttribute('aria-pressed', String(id === 'wireframe' ? this.wireframe : item.action === id));
    for (const id of ['flat', 'fold']) this.panel.querySelector(`[data-cloth-action="${id}"]`)?.setAttribute('aria-pressed', String(item.action === id));
    this.PaintBloodValues();
  }
  PaintBloodValues() {
    const item = this.Current(); if (!item || !this.panel) return;
    const state = item.blood.State();
    for (const control of CLOTH_BLOOD_CONTROLS) {
      const input = this.panel.querySelector(`[data-blood-param="${control.key}"]`), out = this.panel.querySelector(`[data-blood-value="${control.key}"]`);
      if (input && input !== document.activeElement) input.value = state.params[control.key];
      if (out) out.textContent = `${+state.params[control.key].toFixed(2)} ${control.unit || ''}`;
    }
    for (const key of ['u', 'v']) {
      const input = this.panel.querySelector(`[data-blood-source="${key}"]`), out = this.panel.querySelector(`[data-blood-source-value="${key}"]`);
      if (input && input !== document.activeElement) input.value = item.bloodSource[key];
      if (out) out.textContent = item.bloodSource[key].toFixed(2);
    }
    const side = this.panel.querySelector('[data-blood-side]'); if (side) side.value = String(item.bloodSource.side);
    const label = this.panel.querySelector('[data-blood-source-label]');
    if (label) label.textContent = T('cloth.blood.source', { u: item.bloodSource.u.toFixed(2), v: item.bloodSource.v.toFixed(2), side: T(item.bloodSource.side > 0 ? 'cloth.blood.front' : 'cloth.blood.back') });
    const status = this.panel.querySelector('[data-blood-status]');
    if (status) status.textContent = T(state.capacityReached ? 'cloth.blood.capacity' : this.bloodPlacing ? 'cloth.blood.placing' : state.feeding ? 'cloth.blood.feeding' : 'cloth.blood.stopped');
    for (const id of ['place', 'feed']) this.panel.querySelector(`[data-blood-action="${id}"]`)?.setAttribute('aria-pressed', String(id === 'place' ? this.bloodPlacing : state.feeding));
    const stop = this.panel.querySelector('[data-blood-action="stop"]'); if (stop) stop.disabled = !state.feeding;
    const time = this.panel.querySelector('[data-blood-time]'), timeValue = this.panel.querySelector('[data-blood-time-value]');
    if (time) { time.max = Math.min(CLOTH_BLOOD_SIM.maxTimeS, Math.max(.1, state.durationS, state.timeS)); if (time !== document.activeElement) time.value = state.timeS; }
    if (timeValue) timeValue.textContent = T('cloth.blood.time', { time: time === document.activeElement ? Number(time.value).toFixed(1) : state.timeS.toFixed(1), duration: state.durationS.toFixed(1) });
    const stats = this.panel.querySelector('[data-blood-stats]');
    if (stats) stats.textContent = T('cloth.blood.stats', { amount: state.injectedMl.toFixed(1), front: (state.front.areaM2 * 10000).toFixed(0), back: (state.back.areaM2 * 10000).toFixed(0) });
    if (this.hint) this.hint.textContent = T(this.bloodPlacing ? 'cloth.blood.placing' : 'cloth.instructions');
  }
  PaintStats() {
    const out = this.panel?.querySelector('[data-cloth-stats]'), item = this.Current(); if (!out || !item) return;
    const stats = item.rig.cloth.Stats();
    out.textContent = T('cloth.stats', { points: item.rig.cloth.n, stretch: Math.max(0, (stats.maxStretch - 1) * 100).toFixed(1), contact: stats.contact, ms: this.simMs.toFixed(2) }) + ' · ' + T('cloth.clock', { time: this.clock.toFixed(1) });
    this.PaintBloodValues();
  }
  ShowPanel(on = true) { this.panelShown = !!on; if (this.panel) this.panel.hidden = !on; if (this.toggle) this.toggle.textContent = T(on ? 'cloth.hide' : 'cloth.show'); this.Cut(); return this.panelShown; }
  Dispose() {
    this.disposed = true; for (const remove of this.listeners) remove(); this.listeners.length = 0;
    for (const element of [this.panel, this.toggle, this.hint, this.labelRoot, this.style]) element?.remove();
    this.root.removeFromParent();
    for (const item of this.items) { item.friction.Dispose(); item.blood.Dispose(); }
    for (const bundle of this.materialBundles) bundle.Dispose();
    const skeletons = new Set(); this.root.traverse(o => { if (o.skeleton) skeletons.add(o.skeleton); }); for (const skeleton of skeletons) skeleton.dispose?.();
    for (const resource of new Set([...this.resources, ...this.loadedResources])) resource.dispose?.();
    this.host.camera.clearViewOffset?.(); const canvas = this.host.canvas || this.host.renderer?.domElement; if (canvas) canvas.style.touchAction = this.oldTouchAction || '';
    this.host.SetViewmodelHidden?.(false);
  }
}
