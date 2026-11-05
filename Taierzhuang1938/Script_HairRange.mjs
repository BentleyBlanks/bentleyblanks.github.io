// 头发胡子测试场（?hair=1，docs/Data_HairSystem.md §6）：台座上的光头胸像 + 头发 / 胡子，轨道相机，三档对比。
// 只读 Hair/ 下的资产，不改任何关卡、人物；造型参数现场调不存盘。
import * as THREE from 'three';
import { ManagedGLTFLoader } from './Script_ModelImports.mjs';
import { LoadHairGroom, LoadHairAtlas, HairGroom, DisposeHairGroomAsset, HairAssetUrl } from './Script_HairGroom.mjs';
import { T } from './Script_Text.mjs';
import { Panel } from './Script_EditorUi.mjs';
import { HAIR_CAMERA as CAMERA } from './Data_Tuning_Hair.mjs';
import { HAIR_RANGE_ROWS, HAIR_RANGE_PEDESTAL } from './Data_HairRange.mjs';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const HAIR_ROOT = './Hair/';
const Style = `
#hair-range-ui{position:fixed;inset:0;z-index:24;pointer-events:none;font-size:13px;line-height:1.5}
#hair-range-panel.edPanel{position:fixed;left:14px;right:auto;top:14px;bottom:54px;width:360px;box-sizing:border-box;max-width:calc(100vw - 28px)}
#hair-range-panel[hidden]{display:none}
#hair-range-panel .edHead{padding:18px 18px 16px}
#hair-range-panel .edBody{padding:0 18px 18px}
#hair-range-panel .hair-buttons{display:flex;flex-wrap:wrap;gap:6px}
#hair-range-panel .hair-categories{display:grid;grid-template-columns:1fr 1fr;gap:6px}
#hair-range-panel .hair-views{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}
#hair-range-panel .hair-control{gap:8px;margin:9px 0}
#hair-range-panel .hair-control>.l{flex-basis:70px}
#hair-range-panel .hair-control>output{flex:0 0 48px;text-align:right;white-space:nowrap}
#hair-range-panel .hair-control input{display:block;width:100%}
#hair-range-panel select{width:100%;margin-top:9px}
#hair-range-panel p{font-size:12px;line-height:1.7;color:var(--ed-text-3);margin:9px 0}
#hair-range-panel .hair-stats{font:11px/1.7 var(--ui-mono),var(--ui-font);padding:10px;border:1px solid var(--ed-rule-2);background:var(--ed-field);margin-top:12px}
#hair-range-panel details{border-top:1px solid var(--ed-rule-2);margin-top:8px}
#hair-range-panel summary{cursor:pointer;padding:9px 0;color:var(--ed-text-2);letter-spacing:.08em;list-style:none;display:flex;justify-content:space-between}
#hair-range-panel summary::after{content:'+';color:var(--ed-gold)}
#hair-range-panel details[open]>summary{color:var(--ed-gold-text)}
#hair-range-panel details[open]>summary::after{content:'−'}
#hair-range-toggle{position:fixed;left:14px;bottom:14px;z-index:25;pointer-events:auto}
#hair-range-hint{position:fixed;right:14px;bottom:14px;z-index:23;max-width:calc(100vw - 170px);padding:7px 12px;background:var(--ed-panel);border:1px solid var(--ed-edge);font-size:12px;color:var(--ed-text-2);pointer-events:none}
#hair-range-labels,#hair-range-rows{position:fixed;inset:0;z-index:22;pointer-events:none}
#hair-range-labels button,#hair-range-rows .edChip{position:absolute;transform:translate(-50%,-100%);pointer-events:auto;background:var(--ed-black);white-space:nowrap}
#hair-range-rows .edChip{pointer-events:none}
#hair-range-labels button small{color:var(--ed-gold);margin-left:5px}
#hair-range-map{position:fixed;right:14px;top:58px;width:224px;pointer-events:auto;background:var(--ed-panel);border:1px solid var(--ed-edge);padding:10px 12px;box-sizing:border-box}
#hair-range-map summary{cursor:pointer;color:var(--ed-text-hi);letter-spacing:.1em;font-size:13px}
#hair-range-map button{display:grid;grid-template-columns:22px 1fr;gap:0 6px;width:100%;text-align:left;border:0;border-bottom:1px solid var(--ed-rule-2);padding:8px 0;background:transparent;color:var(--ed-text);font:inherit;cursor:pointer}
#hair-range-map button:hover,#hair-range-map button.on{color:var(--ed-gold)}
#hair-range-map button b{color:var(--ed-gold);font-weight:400}
#hair-range-map button small{grid-column:2;color:var(--ed-text-4);font-size:11px;line-height:1.5}
@media(max-width:700px){#hair-range-rows{display:none}#hair-range-panel.edPanel{width:calc(100vw - 16px);left:8px;top:auto;bottom:48px;max-width:none;max-height:48vh}#hair-range-map{right:8px;top:56px;width:170px}#hair-range-map button small{display:none}#hair-range-hint{display:none}#hair-range-toggle{left:8px;bottom:8px}}
`;

export class HairRange {
  constructor(host) {
    this.host = host; this.lightRig = host.ctx?.lights || null;
    this.root = new THREE.Group(); this.root.name = 'HairRangeSpecimens'; host.scene.add(this.root);
    this.keys = new Set();
    this.oldZoom = host.camera.zoom; this.lens = this.oldZoom;
    this.stations = []; this.assets = new Map(); this.heads = new Map(); this.listeners = [];
    this.ready = false; this.error = null; this.loaded = 0; this.total = 0;
    this.category = 'cast'; this.openSections = new Set(); this.canvasFocused = false; this.flySpeed = 1;
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
        const portrait = asset.header.portrait?.center;
        const center = portrait ? V(item.x + portrait[0], HAIR_RANGE_PEDESTAL.height + portrait[1], item.z + portrait[2])
          : V(item.x, HAIR_RANGE_PEDESTAL.height + (asset.header.hair?.bounds ? (asset.header.hair.bounds.min[1] + asset.header.hair.bounds.max[1]) * .5 : .18), item.z);
        this.stations.push({ row: item.row, groomId: item.groom, lod: item.lod || null, x: item.x, z: item.z, head, groom, meta, center });
      }
      this.selected = this.stations.findIndex(station => station.row === 'cast');
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
    this.MoveCamera(dt);
    const camera = this.host.camera, horizontal = this.radius * Math.cos(this.elevation);
    camera.zoom = this.lens;
    camera.position.set(this.target.x + Math.sin(this.azimuth) * horizontal, this.target.y + this.radius * Math.sin(this.elevation), this.target.z + Math.cos(this.azimuth) * horizontal);
    camera.lookAt(this.target); camera.updateMatrixWorld();
    const width = window.innerWidth, height = window.innerHeight;
    const panelRect = this.panelShown ? this.panel.getBoundingClientRect() : null;
    const panelWidth = panelRect && width > 700 ? panelRect.width + 28 : 0;
    const panelHeight = panelRect && width <= 700 ? panelRect.height + 48 : 0;
    if (camera.setViewOffset) camera.setViewOffset(width, height, -panelWidth / 2, panelHeight / 2, width, height);
    camera.updateProjectionMatrix?.();
    const renderer = this.host.renderer;
    for (const s of this.stations) s.groom.Update(dt, camera, renderer);
    this.PaintLabels(camera, width, height);
    if ((this.frame = (this.frame || 0) + 1) % 10 === 0) this.PaintStatus();
  }
  // ---- 操作
  Select(index) {
    if (!(index >= 0 && index < this.stations.length)) return false;
    this.selected = index; this.category = this.stations[index].row; this.PaintPanel(); return true;
  }
  Current() { return this.stations[this.selected] || null; }
  Camera(id = 'front') {
    this.view = id;
    this.lens = this.oldZoom;
    const s = this.Current();
    if (id === 'overview' || !s) { this.target.set(0, 1.3, 0.2); this.radius = CAMERA.overviewRadius * Math.max(1, 1.25 * innerHeight / innerWidth); this.azimuth = Math.PI * 0.86; this.elevation = CAMERA.overviewElevation; }
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
      this.azimuth = az; this.elevation = el;
      this.lens = this.oldZoom * CAMERA.portraitMagnification;
      this.radius = r * CAMERA.portraitMagnification;
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
    const limits = { clump: [0, 1], frizz: [0, 1.5], curlRadius: [0, 0.02], curlPitch: [0, 0.1], melanin: [0, 1], roughness: [0.1, 0.9], fraction: [0.05, 1] };
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
      sun: { ...this.sun }, camera: { position: this.host.camera.position.toArray(), flying:this.Flying(), speed:this.flySpeed, target: this.target.toArray(), radius: this.radius, azimuth: this.azimuth, elevation: this.elevation },
      stations: this.stations.map((s, i) => ({ index: i, row: s.row, groom: s.groomId, fixedLod: s.lod,
        reference: s.groom.asset.header.reference || null, ...s.groom.stats })),
    };
  }
  MoveCamera(dt) {
    if (!this.Flying() || this.host.CanUse?.() === false || document.hidden || this.EditingControl()) { this.keys.clear(); return; }
    const Has = (...codes) => codes.some(code => this.keys.has(code));
    const forward = Number(Has('KeyW','ArrowUp')) - Number(Has('KeyS','ArrowDown'));
    const right = Number(Has('KeyD','ArrowRight')) - Number(Has('KeyA','ArrowLeft'));
    const up = Number(Has('KeyE')) - Number(Has('KeyQ'));
    const motion = V(-Math.sin(this.azimuth)*Math.cos(this.elevation)*forward + Math.cos(this.azimuth)*right,
      -Math.sin(this.elevation)*forward + up,
      -Math.cos(this.azimuth)*Math.cos(this.elevation)*forward - Math.sin(this.azimuth)*right);
    if (!motion.lengthSq() || !(dt > 0)) return;
    const boost = Has('ShiftLeft','ShiftRight') ? CAMERA.boost : 1;
    this.target.addScaledVector(motion.normalize(), CAMERA.moveSpeed * this.flySpeed * boost * dt);
    this.view = 'free';
  }
  Flying() { return this.pointer?.mode === 'fly'; }
  EditingControl(target = document.activeElement) {
    return !!target?.closest?.('input,textarea,select,button,summary,[contenteditable="true"]');
  }
  FrameSelected() {
    const s = this.Current(); if (!s) return false;
    this.target.copy(s.center); this.radius = .62 * CAMERA.portraitMagnification;
    this.lens = this.oldZoom * CAMERA.portraitMagnification; this.view = 'free';
    this.Cut(); this.UpdateCamera(0); this.PaintPanel(); return true;
  }
  FrameRow(id) {
    const group = this.stations.filter(station => station.row === id); if (!group.length) return false;
    this.Select(this.stations.indexOf(group[0])); this.target.set(0,0,0);
    for (const station of group) this.target.add(station.center);
    this.target.multiplyScalar(1/group.length); this.lens = this.oldZoom;
    this.radius = Math.max(2.6, group.length * .72); this.azimuth = Math.PI; this.elevation = .22; this.view = 'row';
    this.Cut(); this.UpdateCamera(0); this.PaintPanel(); return true;
  }
  ResetAppearance() {
    const s = this.Current(), r = s?.groom.asset.hair?.render; if (!r) return;
    for (const [key,value] of Object.entries({clump:r.clump,frizz:r.frizz,curlRadius:r.curl[0],curlPitch:r.curl[1],melanin:r.color.melanin,roughness:r.roughness,fraction:1})) this.SetParam(key,value);
    s.params = {}; this.PaintPanel();
  }
  Pick(event) {
    const canvas = this.host.canvas || this.host.renderer.domElement, rect = canvas.getBoundingClientRect();
    const ray = new THREE.Raycaster(); ray.setFromCamera(new THREE.Vector2((event.clientX-rect.left)/rect.width*2-1,1-(event.clientY-rect.top)/rect.height*2),this.host.camera);
    const meshes=[]; this.root.traverse(object => {if(object.isMesh && !object.userData.hairGroom) meshes.push(object);});
    const hit = ray.intersectObjects(meshes,false)[0]; if (!hit) return false;
    let object=hit.object;
    while (object) { const index=this.stations.findIndex(station=>station.head===object); if(index>=0)return this.Select(index); object=object.parent; }
    return false;
  }
  EndNavigation() {
    const pointer=this.pointer; this.pointer=null; this.keys.clear();
    const canvas=this.host.canvas||this.host.renderer?.domElement;
    if(pointer && canvas?.hasPointerCapture?.(pointer.id))canvas.releasePointerCapture(pointer.id);
    if(canvas)canvas.style.cursor='';
  }
  // Unity Scene navigation. No real pointer lock: dragging stays inside the browser.
  BindCamera() {
    const canvas = this.host.canvas || this.host.renderer?.domElement; if (!canvas) return;
    const movementKeys = new Set(['KeyW','KeyA','KeyS','KeyD','KeyQ','KeyE','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','ShiftLeft','ShiftRight']);
    this.Listen(window,'keydown',event=>{
      if (!this.canvasFocused || this.EditingControl(event.target) || this.host.CanUse?.()===false || event.ctrlKey || event.metaKey || event.altKey) return;
      if(event.code==='Escape' && this.pointer){this.EndNavigation();event.preventDefault();event.stopImmediatePropagation();return;}
      if(event.code==='KeyF' && !event.repeat){this.FrameSelected();event.preventDefault();event.stopImmediatePropagation();return;}
      if(!this.Flying() || !movementKeys.has(event.code))return;
      this.keys.add(event.code);event.preventDefault();event.stopImmediatePropagation();
    },true);
    this.Listen(window,'keyup',event=>this.keys.delete(event.code),true);
    this.Listen(document,'visibilitychange',()=>{if(document.hidden)this.EndNavigation();});
    this.Listen(window,'blur',()=>{this.EndNavigation();this.canvasFocused=false;});
    this.Listen(canvas,'contextmenu',event=>event.preventDefault());
    this.Listen(canvas,'pointerdown',event=>{
      if(this.host.CanUse?.()===false)return;
      document.activeElement?.blur?.();this.canvasFocused=true;this.view='free';
      const mode=event.pointerType==='touch'?'orbit':event.button===1?'pan':event.altKey?(event.button===2?'zoom':'orbit'):event.button===2?'fly':'select';
      if(mode==='orbit' && this.Current()){
        const delta=this.host.camera.position.clone().sub(this.Current().center);this.target.copy(this.Current().center);
        this.radius=delta.length();this.azimuth=Math.atan2(delta.x,delta.z);this.elevation=Math.asin(THREE.MathUtils.clamp(delta.y/this.radius,-1,1));
      }
      this.pointer={id:event.pointerId,x:event.clientX,y:event.clientY,startX:event.clientX,startY:event.clientY,mode};
      canvas.setPointerCapture?.(event.pointerId);canvas.style.cursor=mode==='select'?'default':mode==='pan'?'grabbing':'move';event.preventDefault();
    });
    this.Listen(canvas,'pointermove',event=>{
      const p=this.pointer;if(!p||p.id!==event.pointerId)return;
      const dx=event.clientX-p.x,dy=event.clientY-p.y;p.x=event.clientX;p.y=event.clientY;
      if(p.mode==='fly' && !(event.buttons&2)){this.EndNavigation();return;}
      if(p.mode==='pan'){
        const distance=2*this.radius*Math.tan(THREE.MathUtils.degToRad(this.host.camera.fov/2))/this.lens/Math.max(1,canvas.clientHeight);
        this.target.addScaledVector(V(1,0,0).applyQuaternion(this.host.camera.quaternion),-dx*distance);
        this.target.addScaledVector(V(0,1,0).applyQuaternion(this.host.camera.quaternion),dy*distance);
      } else if(p.mode==='zoom')this.radius=THREE.MathUtils.clamp(this.radius*Math.exp((dx+dy)*CAMERA.zoom*4),CAMERA.min,CAMERA.max);
      else if(p.mode==='orbit'||p.mode==='fly'){
        const eye=this.host.camera.position.clone();
        this.azimuth-=dx*CAMERA.turn;this.elevation=THREE.MathUtils.clamp(this.elevation+dy*CAMERA.turn,-Math.PI*.49,Math.PI*.49);
        if(p.mode==='fly')this.target.copy(eye).sub(V(Math.sin(this.azimuth)*Math.cos(this.elevation),Math.sin(this.elevation),Math.cos(this.azimuth)*Math.cos(this.elevation)).multiplyScalar(this.radius));
      }
      this.UpdateCamera(0);
    });
    this.Listen(canvas,'pointerup',event=>{
      const p=this.pointer;if(p?.mode==='select'&&Math.hypot(event.clientX-p.startX,event.clientY-p.startY)<5)this.Pick(event);
      this.EndNavigation();
    });
    this.Listen(canvas,'pointercancel',()=>this.EndNavigation());
    this.Listen(canvas,'lostpointercapture',()=>this.EndNavigation());
    this.Listen(canvas,'dblclick',event=>{if(!event.altKey&&event.button===0){this.Pick(event);this.FrameSelected();}});
    this.Listen(canvas,'wheel',event=>{
      if(this.host.CanUse?.()===false)return;event.preventDefault();this.view='free';
      if(this.Flying())this.flySpeed=THREE.MathUtils.clamp(this.flySpeed*Math.exp(-event.deltaY*CAMERA.zoom),CAMERA.flySpeedMin,CAMERA.flySpeedMax);
      else this.radius=THREE.MathUtils.clamp(this.radius*Math.exp(event.deltaY*CAMERA.zoom),CAMERA.min,CAMERA.max);
    },{passive:false});
    this.oldTouchAction=canvas.style.touchAction;canvas.style.touchAction='none';
  }
  // ---- 面板
  MakePanel() {
    this.style = document.createElement('style'); this.style.textContent = Style; document.head.appendChild(this.style);
    this.uiRoot = document.createElement('div'); this.uiRoot.id = 'hair-range-ui'; this.uiRoot.className = 'uiToolSurface edThemedSurface'; document.body.appendChild(this.uiRoot);
    const panel = Panel({title: T('hair.title'), sub: T('hair.subtitle'), onClose: () => this.ShowPanel(false)});
    this.panel = panel.root; this.panel.id = 'hair-range-panel'; this.panel.setAttribute('aria-label', T('hair.title')); this.panelBody = panel.body; this.uiRoot.appendChild(this.panel);
    this.toggle = document.createElement('button'); this.toggle.id = 'hair-range-toggle'; this.toggle.className = 'edBtn'; this.toggle.textContent = T('hair.hide'); this.uiRoot.appendChild(this.toggle);
    this.hint = document.createElement('div'); this.hint.id = 'hair-range-hint'; this.hint.textContent = T('hair.instructions'); this.uiRoot.appendChild(this.hint);
    this.labelRoot = document.createElement('div'); this.labelRoot.id = 'hair-range-labels'; this.uiRoot.appendChild(this.labelRoot);
    this.rowRoot=document.createElement('div');this.rowRoot.id='hair-range-rows';this.uiRoot.appendChild(this.rowRoot);
    this.map=document.createElement('details');this.map.id='hair-range-map';this.map.open=innerWidth>700;this.narrow=innerWidth<=700;
    this.map.innerHTML=`<summary>${T('hair.map')}</summary>`+HAIR_RANGE_ROWS.map((row,i)=>`<button type="button" data-row="${row.id}"><b>${String(i+1).padStart(2,'0')}</b><span>${T(`hair.category.${row.id}`)}</span><small>${T(`hair.purpose.${row.id}`)}</small></button>`).join('');
    this.uiRoot.appendChild(this.map);
    this.Listen(window,'resize',()=>{
      const narrow=innerWidth<=700;
      if(narrow!==this.narrow){this.map.open=!narrow;this.narrow=narrow;}
      if(this.view==='overview')this.radius=CAMERA.overviewRadius*Math.max(1,1.25*innerHeight/innerWidth);
      this.Cut();
    });
    this.Listen(this.map,'pointerdown',()=>{this.canvasFocused=false;this.EndNavigation();});
    this.Listen(this.map,'click',event=>{const button=event.target.closest('[data-row]');if(button)this.FrameRow(button.dataset.row);});
    this.rowLabels=HAIR_RANGE_ROWS.map((row,i)=>{
      const button=document.createElement('div');button.className='edChip';button.textContent=`${String(i+1).padStart(2,'0')} · ${T(`hair.category.${row.id}`)}`;
      button.title=T(`hair.purpose.${row.id}`);this.rowRoot.appendChild(button);
      return {button,point:V(Math.min(...row.items.map(item=>item.x))-.6,.15,row.z),row:row.id};
    });
    this.Listen(this.toggle, 'click', () => this.ShowPanel(!this.panelShown));
    this.Listen(this.panel, 'pointerdown', (event) => {this.canvasFocused=false;this.EndNavigation();event.stopPropagation();});
    this.Listen(this.panel, 'keydown', (event) => { if (event.code !== 'Escape') event.stopPropagation(); });
    this.Listen(this.panel, 'click', (event) => {
      const b = event.target.closest('button'); if (!b) return;
      if (b.dataset.row) this.FrameRow(b.dataset.row);
      if (b.dataset.action === 'focus') this.FrameSelected();
      if (b.dataset.action === 'reset') this.ResetAppearance();
      if (b.dataset.station) { this.Select(Number(b.dataset.station)); this.Camera(this.view === 'overview' || this.view === 'walk' || this.view === 'free' ? 'front' : this.view); }
      if (b.dataset.view) this.Camera(b.dataset.view);
      if (b.dataset.lod) this.SetForce(b.dataset.lod);
      if (b.dataset.toggle) this.Toggle(b.dataset.toggle);
    });
    this.Listen(this.panel, 'input', (event) => {
      const el = event.target;
      if (el.hasAttribute('data-sample')) {this.Select(Number(el.value));this.Camera('front');}
      if (el.type === 'range') el.style.setProperty('--fill',`${(el.value-el.min)/(el.max-el.min)*100}%`);
      if (el.dataset.param) { this.SetParam(el.dataset.param, Number(el.value)); const out = this.panel.querySelector(`[data-out="${el.dataset.param}"]`); if (out) out.textContent = this.ParamValue(el.dataset.param,Number(el.value)); }
      if (el.dataset.sun) { const v = Number(el.value); this.SetSun(el.dataset.sun === 'azimuth' ? v : this.sun.azimuth, el.dataset.sun === 'elevation' ? v : this.sun.elevation);
        const out = this.panel.querySelector(`[data-out="sun-${el.dataset.sun}"]`); if (out) out.textContent = `${v}°`; }
    });
  }
  MakeLabels() {
    this.labelRoot.textContent = '';
    this.labels = this.stations.map((s, i) => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'edChip';
      b.innerHTML = '';
      b.append(document.createTextNode(s.meta.label));
      if (s.lod) { const small = document.createElement('small'); small.textContent = T(`hair.lodLabel.${s.lod}`); b.append(small); }
      b.hidden = true; this.labelRoot.appendChild(b);
      this.Listen(b, 'click', () => { this.Select(i); this.Camera('front'); });
      return { button: b, index: i, point: V(s.x, HAIR_RANGE_PEDESTAL.height + 0.42, s.z) };
    });
  }
  PaintLabels(camera, width, height) {
    const panelRect=this.panelShown?this.panel.getBoundingClientRect():null;
    for(const label of this.rowLabels||[]){
      const p=label.point.clone().project(camera),x=(p.x+1)*width/2,y=(1-p.y)*height/2;
      const obscured=panelRect&&x>panelRect.left-65&&x<panelRect.right+65&&y>panelRect.top&&y<panelRect.bottom+30;
      label.button.hidden=this.radius<2||p.z<-1||p.z>1||x<75||x>width-75||y<30||y>height-55||obscured;
      if(!label.button.hidden){label.button.style.left=`${x}px`;label.button.style.top=`${y}px`;}
    }
    for (const label of this.labels || []) {
      const p = label.point.clone().project(camera);
      // 名牌只给近处这一两排（全场远景里二十几个名牌叠成一团看不清）
      const near = label.point.distanceTo(camera.position) < 4.2;
      const compare = this.view === 'compareShort' ? label.index < 3 : this.view === 'compareLong' ? label.index >= 4 && label.index < 7 : true;
      const visible = this.showLabels && compare && near && this.radius * this.oldZoom / this.lens > 1.1 && p.z > -1 && p.z < 1 && Math.abs(p.x) < 1 && Math.abs(p.y) < 1;
      label.button.hidden = !visible;
      if (visible) { label.button.style.left = `${(p.x + 1) * width / 2}px`; label.button.style.top = `${(1 - p.y) * height / 2}px`; }
    }
  }
  ParamValue(key,value) {
    return key==='curlRadius'||key==='curlPitch' ? `${(value*1000).toFixed(1)} mm` : `${Math.round(value*100)}%`;
  }
  PaintPanel() {
    if (!this.panel || this.disposed) return;
    const scroll=this.panelBody.scrollTop;
    for(const fold of this.panelBody.querySelectorAll('[data-fold]')){
      if(fold.open)this.openSections.add(fold.dataset.fold);else this.openSections.delete(fold.dataset.fold);
    }
    const s=this.Current(),u=s?.groom.strandUniforms,p=s?.params||{};
    const Button=(attr,value,label,on=false)=>`<button type="button" class="edBtn${on?' on':''}" data-${attr}="${value}"${attr==='action'?'':` aria-pressed="${on}"`}>${Esc(label)}</button>`;
    const categories=['cast','length','beard','lod'].map(id=>Button('row',id,T(`hair.category.${id}`),this.category===id)).join('');
    const options=this.stations.map((st,i)=>st.row===this.category?`<option value="${i}" ${i===this.selected?'selected':''}>${Esc(st.meta.label)}${st.lod?` · ${T(`hair.lodLabel.${st.lod}`)}`:''}</option>`:'').join('');
    const views=['front','side','back','top'].map(id=>Button('view',id,T(`hair.view.${id}`),this.view===id)).join('')+Button('action','focus',T('hair.focus'))+Button('view','overview',T('hair.view.overview'),this.view==='overview');
    const toggles=[['hair',this.showHair],['beard',this.showBeard],['labels',this.showLabels]].map(([key,on])=>Button('toggle',key,T(`hair.toggle.${key}`),on)).join('');
    const Slider=(key,min,max,step,value)=>`<label class="edRow hair-control"><span class="l">${T(`hair.param.${key}`)}</span><span class="c"><input type="range" data-param="${key}" min="${min}" max="${max}" step="${step}" value="${value}" style="--fill:${(value-min)/(max-min)*100}%"></span><output class="edVal" data-out="${key}">${this.ParamValue(key,value)}</output></label>`;
    const basic=u?Slider('melanin',0,1,.01,p.melanin??s.groom.asset.hair.render.color.melanin)+Slider('frizz',0,1.5,.01,p.frizz??u.uFrizz.value)+Slider('clump',0,1,.01,p.clump??u.uClump.value)+`<button class="edBtn" type="button" data-action="reset">${T('hair.reset')}</button><p>${T('hair.session')}</p>`:`<p>${T('hair.noParams')}</p>`;
    const fine=u?Slider('curlRadius',0,.02,.0005,p.curlRadius??u.uCurl.value.x)+Slider('curlPitch',0,.1,.001,p.curlPitch??u.uCurl.value.y)+Slider('roughness',.1,.9,.01,p.roughness??s.groom.asset.hair.render.roughness)+Slider('fraction',.05,1,.01,p.fraction??1):'';
    const SunSlider=(key,min,max)=>`<label class="edRow hair-control"><span class="l">${T(`hair.light.${key}`)}</span><span class="c"><input type="range" data-sun="${key}" min="${min}" max="${max}" step="1" value="${this.sun[key]}" style="--fill:${(this.sun[key]-min)/(max-min)*100}%"></span><output class="edVal" data-out="sun-${key}">${this.sun[key]}°</output></label>`;
    const Section=(title,content)=>`<section class="edSection"><h3 class="h">${T(title)}</h3><div class="b">${content}</div></section>`;
    const Fold=(id,title,content)=>`<details data-fold="${id}"${this.openSections.has(id)?' open':''}><summary>${T(title)}</summary>${content}</details>`;
    const lod=['auto','strands','cards','shell','none'].map(mode=>Button('lod',mode,T(`hair.lod.${mode}`),this.force===mode)).join('');
    const comparison=['compareShort','compareLong','walk'].map(view=>Button('view',view,T(`hair.view.${view}`),this.view===view)).join('');
    this.panelBody.innerHTML=`
      ${this.error?`<p role="alert">${Esc(T('hair.error',{error:this.error}))}</p>`:''}
      ${!this.ready&&!this.error?`<p data-hair-loading role="status">${T('hair.loading',{done:this.loaded,total:this.total})}</p>`:''}
      ${Section('hair.browse',`<div class="hair-categories">${categories}</div><select data-sample aria-label="${T('hair.sample')}"${this.ready?'':' disabled'}>${options}</select><p>${T(`hair.purpose.${this.category}`)}</p>`)}
      ${Section('hair.view',`<div class="hair-views">${views}</div><div class="hair-buttons edBtns">${toggles}</div>`)}
      ${Fold('appearance','hair.appearance',basic)}
      ${Fold('light','hair.light',SunSlider('azimuth',-180,180)+SunSlider('elevation',-10,85))}
      ${Fold('advanced','hair.advanced',Section('hair.lodTitle',`<div class="hair-buttons">${lod}</div><p>${T('hair.lodNote')}</p><div class="hair-buttons">${comparison}</div>`)+fine+'<div data-hair-status class="hair-stats"></div>'+`<p>${T('hair.note')}</p><p>${T('hair.limit')}</p>`)}
      ${Fold('controls','hair.controls',`<p>${T('hair.guide')}</p><p>${T('hair.controlsDetail')}</p>`)}`;
    this.panelBody.scrollTop=scroll;
    for(const button of this.map?.querySelectorAll('[data-row]')||[]){button.classList.toggle('on',button.dataset.row===this.category);button.setAttribute('aria-pressed',String(button.dataset.row===this.category));}
    this.PaintStatus();
  }
  PaintStatus() {
    if (this.disposed) return;
    const loading=this.panel?.querySelector('[data-hair-loading]');if(loading)loading.textContent=T('hair.loading',{done:this.loaded,total:this.total});
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
    this.disposed = true; this.ready = false; this.EndNavigation();
    for (const remove of this.listeners) remove(); this.listeners.length = 0;
    for (const element of [this.panel, this.toggle, this.hint, this.labelRoot, this.rowRoot, this.map, this.style, this.uiRoot]) element?.remove();
    this.ReleaseAssets(); this.root.removeFromParent();
    this.host.camera.zoom = this.oldZoom; this.host.camera.clearViewOffset?.(); this.host.camera.updateProjectionMatrix?.();
    const canvas = this.host.canvas || this.host.renderer?.domElement; if (canvas) canvas.style.touchAction = this.oldTouchAction || '';
    this.host.SetViewmodelHidden?.(false);
  }
}
function DisposeHead(gltf) {
  const resources = new Set();
  gltf.scene.traverse((o) => { if (o.isMesh) { resources.add(o.geometry); for (const m of [o.material].flat()) { resources.add(m); for (const v of Object.values(m)) if (v?.isTexture) resources.add(v); } } });
  for (const resource of resources) resource.dispose();
}
function Esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
