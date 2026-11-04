// 头发胡子测试场（?hair=1，docs/Data_HairSystem.md §6）：台座上的光头胸像 + 头发 / 胡子，轨道相机，三档对比。
// 只读 Hair/ 下的资产，不改任何关卡、人物；造型参数现场调不存盘。
import * as THREE from 'three';
import { ManagedGLTFLoader } from './Script_ModelImports.mjs';
import { LoadHairGroom, LoadHairAtlas, HairGroom, DisposeHairGroomAsset, HairAssetUrl } from './Script_HairGroom.mjs';
import { T } from './Script_Text.mjs';
import { HAIR_RANGE_ROWS, HAIR_RANGE_PEDESTAL } from './Data_HairRange.mjs';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const HAIR_ROOT = './Hair/';
const Style = `
#hair-range-panel{position:fixed;left:16px;top:16px;bottom:52px;width:312px;z-index:24;background:rgba(25,27,29,.94);color:#e9e4d5;border:1px solid #6f7366;border-radius:8px;box-shadow:0 8px 32px #0005;font:13px/1.45 system-ui,sans-serif;overflow:auto;pointer-events:auto;padding:16px;box-sizing:border-box}
#hair-range-panel *{box-sizing:border-box}#hair-range-panel h2{font-size:19px;margin:0 0 3px;font-weight:650}#hair-range-panel h3{font-size:12px;color:#bdbaab;font-weight:500;letter-spacing:.08em;margin:16px 0 7px}#hair-range-panel p{font-size:12px;color:#c2c4b8;margin:7px 0}
#hair-range-panel button{background:#373b3d;border:1px solid #63676b;color:#e9e4d5;border-radius:4px;font:inherit;font-size:12px;padding:6px 8px;cursor:pointer}#hair-range-panel button:hover{background:#4d5254}#hair-range-panel button[aria-pressed=true]{background:#d2bf85;color:#252922;border-color:#d2bf85}
#hair-range-panel .hair-buttons{display:flex;flex-wrap:wrap;gap:5px}#hair-range-panel .hair-list{display:grid;grid-template-columns:1fr;gap:3px}#hair-range-panel .hair-list button{text-align:left}
#hair-range-panel .hair-control{display:grid;grid-template-columns:1fr 80px;gap:2px 8px;margin:6px 0;align-items:center}#hair-range-panel output{color:#dcc487;text-align:right;font-variant-numeric:tabular-nums}#hair-range-panel input[type=range]{grid-column:1/3;width:100%;margin:2px 0;accent-color:#c8b77d;cursor:pointer}
#hair-range-panel .hair-stats{font:11px/1.5 ui-monospace,monospace;color:#bfc2af;margin:8px 0}#hair-range-panel .hair-note{border-left:2px solid #c2ad74;padding-left:9px;margin-top:12px}#hair-range-panel .hair-limit{font-size:11px;color:#a5aaa0;border-top:1px solid #535a50;padding-top:10px}
#hair-range-toggle{position:fixed;left:16px;bottom:16px;z-index:25;background:#252a2d;color:#e7dfc9;border:1px solid #777c68;border-radius:4px;padding:7px 12px;font:12px system-ui;cursor:pointer}#hair-range-hint{position:fixed;right:16px;bottom:16px;z-index:23;background:#202426bd;color:#eee8d5;padding:8px 14px;border-radius:4px;font:12px system-ui;pointer-events:none}
#hair-range-labels{position:fixed;inset:0;z-index:22;pointer-events:none}#hair-range-labels button{position:absolute;transform:translate(-50%,-100%);pointer-events:auto;background:#202426e0;color:#eee8d5;border:1px solid #9b9f83;border-radius:4px;padding:3px 7px;white-space:nowrap;font:11px system-ui;cursor:pointer}#hair-range-labels button small{color:#d2bf85;margin-left:4px}
@media(max-width:700px){#hair-range-panel{width:250px;left:8px;top:8px;bottom:48px;padding:12px}#hair-range-hint{max-width:45%;font-size:10px;right:8px}#hair-range-toggle{left:8px;bottom:8px}}
`;
const CAMERA = Object.freeze({ turn: 0.0055, pan: 0.0011, zoom: 0.0011, min: 0.18, max: 40 });

export class HairRange {
  constructor(host) {
    this.host = host; this.lightRig = host.ctx?.lights || null;
    this.root = new THREE.Group(); this.root.name = 'HairRangeSpecimens'; host.scene.add(this.root);
    this.stations = []; this.assets = new Map(); this.heads = new Map(); this.listeners = [];
    this.ready = false; this.error = null; this.loaded = 0; this.total = 0;
    this.force = 'auto'; this.showHair = true; this.showBeard = true; this.showLabels = true; this.panelShown = true;
    this.selected = 0; this.view = 'overview'; this.walkT = 0; this.fps = 60; this.disposed = false;
    this.target = V(0, 1.4, 0); this.radius = 7.5; this.azimuth = Math.PI * 0.86; this.elevation = 0.28;
    this.sun = { azimuth: 35, elevation: 38 };
    host.SetViewmodelHidden?.(true);
    this.MakePanel(); this.BindCamera(); this.Camera('overview');
    this.api = {
      State: () => this.State(), Select: (i) => this.Select(i), Camera: (id) => this.Camera(id), Lod: (mode) => this.SetForce(mode),
      Set: (key, value) => this.SetParam(key, value), Sun: (az, el) => this.SetSun(az, el), ShowPanel: (on) => this.ShowPanel(on),
      Toggle: (key, on) => this.Toggle(key, on), Stations: () => this.stations.map((s, i) => ({ index: i, row: s.row, groom: s.groomId, lod: s.lod, x: s.x, z: s.z })),
      Focus: (i, view) => { this.Select(i); return this.Camera(view || 'front'); },
    };
    this.loading = this.Load();
  }
  Listen(target, name, fn, options) { target.addEventListener(name, fn, options); this.listeners.push(() => target.removeEventListener(name, fn, options)); }
  Cut() { this.host.post?.NotifyCameraCut?.(); }
  async Load() {
    try {
      const response = await fetch(HairAssetUrl(`${HAIR_ROOT}Data_HairGrooms.json`));
      if (!response.ok) throw new Error(`Hair manifest: HTTP ${response.status}`);
      const manifest = await response.json();
      if (this.disposed) return;
      const groomById = new Map(manifest.grooms.map((g) => [g.id, g]));
      const items = HAIR_RANGE_ROWS.flatMap((row) => row.items.map((item) => ({ row: row.id, z: row.z, ...item })));
      const groomIds = [...new Set(items.map((i) => i.groom))];
      const headIds = [...new Set(groomIds.map((id) => groomById.get(id)?.head).filter(Boolean))];
      this.total = groomIds.length + headIds.length + 1; this.PaintPanel();
      // A load can finish after leaving the lab. Its owner must still release it.
      const Keep = async (promise, store, dispose) => {
        const asset = await promise;
        if (this.disposed) { dispose(asset); return; }
        store(asset); this.loaded++; this.PaintStatus();
      };
      const Batch = async (promises) => {
        const results = await Promise.allSettled(promises);
        const failed = results.find((r) => r.status === 'rejected');
        if (failed) throw failed.reason;
      };
      await Keep(LoadHairAtlas(`${HAIR_ROOT}${manifest.atlas.file}`), (atlas) => { this.atlas = atlas; }, (atlas) => atlas.dispose());
      if (this.disposed) return;
      const loader = new ManagedGLTFLoader();
      await Batch(headIds.map((id) => Keep(loader.loadAsync(HairAssetUrl(`${HAIR_ROOT}${manifest.heads[id].file}`)), (head) => this.heads.set(id, head), DisposeHead)));
      if (this.disposed) return;
      await Batch(groomIds.map(async (id) => {
        const g = groomById.get(id);
        if (!g) throw new Error(`Data_HairGrooms.json 没有 ${id}`);
        await Keep(LoadHairGroom(`${HAIR_ROOT}${g.file}`), (asset) => this.assets.set(id, asset), DisposeHairGroomAsset);
      }));
      if (this.disposed) return;
      for (const item of items) {
        const asset = this.assets.get(item.groom), meta = groomById.get(item.groom);
        const gltf = this.heads.get(asset.head);
        const head = gltf.scene.clone(true);
        head.name = `HairHead_${item.row}_${item.groom}`;
        head.position.set(item.x, HAIR_RANGE_PEDESTAL.height, item.z);
        head.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
        const groom = new HairGroom(asset, { atlas: this.atlas, lightRig: this.lightRig, lod: item.lod || this.force, name: `${item.row}_${item.groom}` });
        head.add(groom.root);
        this.root.add(head);
        this.stations.push({ row: item.row, groomId: item.groom, lod: item.lod || null, x: item.x, z: item.z, head, groom, meta,
          center: V(item.x, HAIR_RANGE_PEDESTAL.height + (asset.header.hair?.bounds ? (asset.header.hair.bounds.min[1] + asset.header.hair.bounds.max[1]) * 0.5 : 0.18), item.z) });
      }
      this.MakeLabels();
      this.ready = true; this.SetSun(this.sun.azimuth, this.sun.elevation);
      this.PaintPanel(); this.Cut();
    } catch (error) {
      this.ReleaseAssets();
      if (!this.disposed) { this.error = String(error.message || error); console.error('[HairRange]', error); this.PaintPanel(); }
    }
  }
  Update(dt) {
    const now = performance.now(), elapsed = now - (this.frameTime ?? now);
    if (elapsed > 0) this.fps = this.fps * 0.92 + (1000 / Math.max(elapsed, 1)) * 0.08;
    this.frameTime = now;
    if (this.view === 'walk') this.walkT += dt;
  }
  UpdateCamera(dt = 0) {
    if (this.disposed) return;
    if (this.view === 'walk' && this.stations.length) {
      const s = this.stations.find((st) => st.lod === 'auto') || this.stations[0];
      const k = 0.5 - 0.5 * Math.cos((this.walkT / 14) * Math.PI * 2);
      this.target.copy(s.center); this.radius = 0.55 * Math.pow(50, k); this.azimuth = Math.PI * 0.92; this.elevation = 0.06;
    }
    const camera = this.host.camera, horizontal = this.radius * Math.cos(this.elevation);
    camera.position.set(this.target.x + Math.sin(this.azimuth) * horizontal, Math.max(0.12, this.target.y + this.radius * Math.sin(this.elevation)), this.target.z + Math.cos(this.azimuth) * horizontal);
    camera.lookAt(this.target); camera.updateMatrixWorld();
    const width = window.innerWidth, height = window.innerHeight;
    const panelWidth = this.panelShown ? (width <= 700 ? 258 : 344) : 0;
    if (camera.setViewOffset) camera.setViewOffset(width, height, -panelWidth / 2, 0, width, height);
    camera.updateProjectionMatrix?.();
    const renderer = this.host.renderer;
    for (const s of this.stations) s.groom.Update(dt, camera, renderer);
    this.PaintLabels(camera, width, height);
    if ((this.frame = (this.frame || 0) + 1) % 10 === 0) this.PaintStatus();
  }
  // ---- 操作
  Select(index) {
    if (!(index >= 0 && index < this.stations.length)) return false;
    this.selected = index; this.PaintPanel(); return true;
  }
  Current() { return this.stations[this.selected] || null; }
  Camera(id = 'front') {
    this.view = id;
    const s = this.Current();
    if (id === 'overview' || !s) { this.target.set(0, 1.3, 0.2); this.radius = 8.2; this.azimuth = Math.PI * 0.86; this.elevation = 0.36; }
    else if (id === 'walk') { this.walkT = 0; this.selected = Math.max(0, this.stations.findIndex((station) => station.lod === 'auto')); }
    else if (id === 'compareShort' || id === 'compareLong') {
      const group = this.stations.slice(id === 'compareShort' ? 0 : 4, id === 'compareShort' ? 3 : 7);
      this.selected = id === 'compareShort' ? 0 : 4;
      this.target.set(0, 0, 0); for (const station of group) this.target.add(station.center);
      this.target.multiplyScalar(1 / group.length); this.radius = 1.65; this.azimuth = Math.PI; this.elevation = 0.04;
    }
    else {
      this.target.copy(s.center);
      const views = { front: [Math.PI, 0.05, 0.62], side: [Math.PI * 0.5, 0.05, 0.62], back: [0, 0.12, 0.62], top: [Math.PI * 0.85, 1.25, 0.6], close: [Math.PI * 1.15, 0.12, 0.34] };
      const [az, el, r] = views[id] || views.front;
      this.azimuth = az; this.elevation = el; this.radius = r;
    }
    this.Cut(); this.UpdateCamera(0); this.PaintPanel(); return true;
  }
  SetForce(mode) {
    if (!['auto', 'strands', 'cards', 'shell', 'none'].includes(mode)) return false;
    this.force = mode;
    for (const s of this.stations) if (!s.lod) s.groom.SetLod(mode);
    this.PaintPanel(); return true;
  }
  Toggle(key, on) {
    if (key === 'hair') { this.showHair = on ?? !this.showHair; for (const s of this.stations) s.groom.SetHairVisible(this.showHair); }
    if (key === 'beard') { this.showBeard = on ?? !this.showBeard; for (const s of this.stations) s.groom.SetBeardVisible(this.showBeard); }
    if (key === 'labels') this.showLabels = on ?? !this.showLabels;
    this.PaintPanel(); return true;
  }
  SetParam(key, value) {
    if (!Number.isFinite(value)) return false;
    const limits = { clump: [0, 1], frizz: [0, 1.5], curlRadius: [0, 0.02], curlPitch: [0.005, 0.1], melanin: [0, 1], roughness: [0.1, 0.9], fraction: [0.05, 1] };
    if (!limits[key]) return false;
    value = THREE.MathUtils.clamp(value, ...limits[key]);
    const s = this.Current(); if (!s) return false;
    if (key === 'fraction') s.groom.strandFractionOverride = value >= 0.999 ? null : value;
    else s.groom.SetStrandParam(key, value);
    (s.params ||= {})[key] = value;
    this.Cut(); return true;
  }
  SetSun(azimuthDeg, elevationDeg) {
    this.sun = { azimuth: azimuthDeg, elevation: elevationDeg };
    const rig = this.lightRig; if (!rig) return false;
    const a = THREE.MathUtils.degToRad(azimuthDeg), e = THREE.MathUtils.degToRad(elevationDeg);
    // 方位 0 = 从正前方（-Z，人脸朝向）照过来
    rig.sunDirection.set(Math.sin(a) * Math.cos(e), Math.sin(e), -Math.cos(a) * Math.cos(e)).normalize();
    rig.csm?.ForceUpdate?.();
    return true;
  }
  ShowPanel(on = true) { this.panelShown = !!on; this.panel.hidden = !on; this.toggle.textContent = T(on ? 'hair.hide' : 'hair.show'); this.Cut(); return this.panelShown; }
  State() {
    return {
      ready: this.ready, error: this.error, loaded: this.loaded, total: this.total, force: this.force, view: this.view, selected: this.selected,
      sun: { ...this.sun }, camera: { target: this.target.toArray(), radius: this.radius, azimuth: this.azimuth, elevation: this.elevation },
      stations: this.stations.map((s, i) => ({ index: i, row: s.row, groom: s.groomId, fixedLod: s.lod, ...s.groom.stats })),
    };
  }
  // ---- 相机输入
  BindCamera() {
    const canvas = this.host.canvas || this.host.renderer?.domElement;
    if (!canvas) return;
    this.Listen(canvas, 'contextmenu', (event) => event.preventDefault());
    this.Listen(canvas, 'pointerdown', (event) => {
      if (this.host.CanUse?.() === false) return;
      if (this.view === 'walk') this.view = 'free';
      this.pointer = { id: event.pointerId, x: event.clientX, y: event.clientY, pan: event.button === 2 || event.shiftKey };
      canvas.setPointerCapture?.(event.pointerId); event.preventDefault();
    });
    this.Listen(canvas, 'pointermove', (event) => {
      const p = this.pointer; if (!p || p.id !== event.pointerId) return;
      const dx = event.clientX - p.x, dy = event.clientY - p.y; p.x = event.clientX; p.y = event.clientY;
      if (p.pan) { const right = V(1, 0, 0).applyQuaternion(this.host.camera.quaternion); this.target.addScaledVector(right, -dx * this.radius * CAMERA.pan); this.target.y += dy * this.radius * CAMERA.pan; }
      else { this.azimuth -= dx * CAMERA.turn; this.elevation = Math.max(-0.5, Math.min(1.45, this.elevation + dy * CAMERA.turn)); }
    });
    const End = () => { this.pointer = null; };
    this.Listen(canvas, 'pointerup', End); this.Listen(canvas, 'pointercancel', End); this.Listen(window, 'blur', End);
    this.Listen(canvas, 'wheel', (event) => {
      if (this.host.CanUse?.() === false) return; event.preventDefault();
      if (this.view === 'walk') this.view = 'free';
      this.radius = Math.max(CAMERA.min, Math.min(CAMERA.max, this.radius * Math.exp(event.deltaY * CAMERA.zoom)));
    }, { passive: false });
    this.oldTouchAction = canvas.style.touchAction; canvas.style.touchAction = 'none';
  }
  // ---- 面板
  MakePanel() {
    this.style = document.createElement('style'); this.style.textContent = Style; document.head.appendChild(this.style);
    this.panel = document.createElement('section'); this.panel.id = 'hair-range-panel'; this.panel.setAttribute('aria-label', T('hair.title')); document.body.appendChild(this.panel);
    this.toggle = document.createElement('button'); this.toggle.id = 'hair-range-toggle'; this.toggle.textContent = T('hair.hide'); document.body.appendChild(this.toggle);
    this.hint = document.createElement('div'); this.hint.id = 'hair-range-hint'; this.hint.textContent = T('hair.instructions'); document.body.appendChild(this.hint);
    this.labelRoot = document.createElement('div'); this.labelRoot.id = 'hair-range-labels'; document.body.appendChild(this.labelRoot);
    this.Listen(this.toggle, 'click', () => this.ShowPanel(!this.panelShown));
    this.Listen(this.panel, 'pointerdown', (event) => event.stopPropagation());
    this.Listen(this.panel, 'keydown', (event) => { if (event.code !== 'Escape') event.stopPropagation(); });
    this.Listen(this.panel, 'click', (event) => {
      const b = event.target.closest('button'); if (!b) return;
      if (b.dataset.station) { this.Select(Number(b.dataset.station)); this.Camera(this.view === 'overview' || this.view === 'walk' || this.view === 'free' ? 'front' : this.view); }
      if (b.dataset.view) this.Camera(b.dataset.view);
      if (b.dataset.lod) this.SetForce(b.dataset.lod);
      if (b.dataset.toggle) this.Toggle(b.dataset.toggle);
    });
    this.Listen(this.panel, 'input', (event) => {
      const el = event.target;
      if (el.dataset.param) { this.SetParam(el.dataset.param, Number(el.value)); const out = this.panel.querySelector(`[data-out="${el.dataset.param}"]`); if (out) out.textContent = Number(el.value).toFixed(3); }
      if (el.dataset.sun) { const v = Number(el.value); this.SetSun(el.dataset.sun === 'azimuth' ? v : this.sun.azimuth, el.dataset.sun === 'elevation' ? v : this.sun.elevation);
        const out = this.panel.querySelector(`[data-out="sun-${el.dataset.sun}"]`); if (out) out.textContent = `${v}°`; }
    });
  }
  MakeLabels() {
    this.labelRoot.textContent = '';
    this.labels = this.stations.map((s, i) => {
      const b = document.createElement('button'); b.type = 'button';
      b.innerHTML = '';
      b.append(document.createTextNode(s.meta.label));
      if (s.lod) { const small = document.createElement('small'); small.textContent = T(`hair.lodLabel.${s.lod}`); b.append(small); }
      b.hidden = true; this.labelRoot.appendChild(b);
      this.Listen(b, 'click', () => { this.Select(i); this.Camera('front'); });
      return { button: b, index: i, point: V(s.x, HAIR_RANGE_PEDESTAL.height + 0.42, s.z) };
    });
  }
  PaintLabels(camera, width, height) {
    for (const label of this.labels || []) {
      const p = label.point.clone().project(camera);
      // 名牌只给近处这一两排（全场远景里二十几个名牌叠成一团看不清）
      const near = label.point.distanceTo(camera.position) < 4.2;
      const compare = this.view === 'compareShort' ? label.index < 3 : this.view === 'compareLong' ? label.index >= 4 && label.index < 7 : true;
      const visible = this.showLabels && compare && near && this.radius > 1.1 && p.z > -1 && p.z < 1 && Math.abs(p.x) < 1 && Math.abs(p.y) < 1;
      label.button.hidden = !visible;
      if (visible) { label.button.style.left = `${(p.x + 1) * width / 2}px`; label.button.style.top = `${(1 - p.y) * height / 2}px`; }
    }
  }
  PaintPanel() {
    if (!this.panel || this.disposed) return;
    const s = this.Current();
    const rows = HAIR_RANGE_ROWS.map((row) => {
      const list = this.stations.map((st, i) => (st.row === row.id ? `<button data-station="${i}" aria-pressed="${i === this.selected}">${Esc(st.meta.label)}${st.lod ? ` · ${T(`hair.lodLabel.${st.lod}`)}` : ''}</button>` : '')).join('');
      return `<h3>${T(`hair.row.${row.id}`)}</h3><div class="hair-list">${list}</div>`;
    }).join('');
    const lodButtons = ['auto', 'strands', 'cards', 'shell', 'none'].map((m) => `<button data-lod="${m}" aria-pressed="${this.force === m}">${T(`hair.lod.${m}`)}</button>`).join('');
    const views = ['overview', 'compareShort', 'compareLong', 'front', 'side', 'back', 'top', 'close', 'walk'].map((v) => `<button data-view="${v}" aria-pressed="${this.view === v}">${T(`hair.view.${v}`)}</button>`).join('');
    const toggles = [['hair', this.showHair], ['beard', this.showBeard], ['labels', this.showLabels]].map(([k, on]) => `<button data-toggle="${k}" aria-pressed="${on}">${T(`hair.toggle.${k}`)}</button>`).join('');
    const u = s?.groom.strandUniforms, p = s?.params || {};
    const Slider = (key, min, max, step, value) => `<label class="hair-control"><span>${T(`hair.param.${key}`)}</span><output data-out="${key}">${Number(value).toFixed(3)}</output><input type="range" data-param="${key}" min="${min}" max="${max}" step="${step}" value="${value}"></label>`;
    const params = u ? [
      Slider('clump', 0, 1, 0.01, p.clump ?? u.uClump.value), Slider('frizz', 0, 1.5, 0.01, p.frizz ?? u.uFrizz.value),
      Slider('curlRadius', 0, 0.02, 0.0005, p.curlRadius ?? u.uCurl.value.x), Slider('curlPitch', 0.005, 0.1, 0.001, p.curlPitch ?? u.uCurl.value.y),
      Slider('melanin', 0, 1, 0.01, p.melanin ?? s.asset?.hair?.render.color.melanin ?? s.groom.asset.hair.render.color.melanin),
      Slider('roughness', 0.1, 0.9, 0.01, p.roughness ?? s.groom.asset.hair.render.roughness),
      Slider('fraction', 0.05, 1, 0.01, p.fraction ?? 1),
    ].join('') : '';
    const SunSlider = (key, min, max) => `<label class="hair-control"><span>${T(`hair.light.${key}`)}</span><output data-out="sun-${key}">${this.sun[key]}°</output><input type="range" data-sun="${key}" min="${min}" max="${max}" step="1" value="${this.sun[key]}"></label>`;
    this.panel.innerHTML = `<h2>${T('hair.title')}</h2><p>${T('hair.subtitle')}</p>
      <div data-hair-status class="hair-stats"></div>
      ${this.error ? `<p>${Esc(T('hair.error', { error: this.error }))}</p>` : ''}
      <h3>${T('hair.view')}</h3><div class="hair-buttons">${views}</div>
      <h3>${T('hair.lodTitle')}</h3><div class="hair-buttons">${lodButtons}</div><p>${T('hair.lodNote')}</p>
      <h3>${T('hair.toggles')}</h3><div class="hair-buttons">${toggles}</div>
      <h3>${T('hair.light')}</h3>${SunSlider('azimuth', -180, 180)}${SunSlider('elevation', -10, 85)}
      ${params ? `<h3>${T('hair.params')}</h3>${params}` : ''}
      ${rows}
      <p class="hair-note">${T('hair.note')}</p><p class="hair-limit">${T('hair.limit')}</p>`;
    this.PaintStatus();
  }
  PaintStatus() {
    if (this.disposed) return;
    const out = this.panel?.querySelector('[data-hair-status]'); if (!out) return;
    if (!this.ready) { out.textContent = T('hair.loading', { done: this.loaded, total: this.total }); return; }
    const s = this.Current();
    let tris = 0; for (const st of this.stations) tris += st.groom.stats.triangles || 0;
    const info = this.host.renderer?.info?.render;
    const lines = [];
    if (s) {
      const m = s.meta;
      lines.push(T('hair.selected', { label: m.label }));
      lines.push(T('hair.selectedLod', { lod: T(`hair.lod.${s.groom.stats.lod || 'none'}`), px: s.groom.stats.screenPx }));
      lines.push(T('hair.stats', { strands: m.strands, guides: m.guides, cards: m.cardTriangles, shell: m.shellTriangles, mb: (m.bytes / 1e6).toFixed(2) }));
    }
    lines.push(T('hair.scene', { tris: (tris / 1e4).toFixed(1), calls: info?.calls ?? 0, fps: Math.round(this.fps) }));
    out.textContent = lines.join('\n');
    out.style.whiteSpace = 'pre-line';
  }
  ReleaseAssets() {
    for (const s of this.stations) s.groom.Dispose();
    this.stations.length = 0; this.root.clear();
    for (const asset of this.assets.values()) DisposeHairGroomAsset(asset);
    this.assets.clear();
    this.atlas?.dispose(); this.atlas = null;
    for (const gltf of this.heads.values()) DisposeHead(gltf);
    this.heads.clear();
  }
  Dispose() {
    if (this.disposed) return;
    this.disposed = true; this.ready = false;
    for (const remove of this.listeners) remove(); this.listeners.length = 0;
    for (const element of [this.panel, this.toggle, this.hint, this.labelRoot, this.style]) element?.remove();
    this.ReleaseAssets(); this.root.removeFromParent();
    this.host.camera.clearViewOffset?.(); const canvas = this.host.canvas || this.host.renderer?.domElement; if (canvas) canvas.style.touchAction = this.oldTouchAction || '';
    this.host.SetViewmodelHidden?.(false);
  }
}
function DisposeHead(gltf) {
  const resources = new Set();
  gltf.scene.traverse((o) => { if (o.isMesh) { resources.add(o.geometry); for (const m of [o.material].flat()) { resources.add(m); for (const v of Object.values(m)) if (v?.isTexture) resources.add(v); } } });
  for (const resource of resources) resource.dispose();
}
function Esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
