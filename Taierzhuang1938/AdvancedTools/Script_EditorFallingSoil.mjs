import * as THREE from 'three';
import { El } from '../Script_EditorUi.mjs';
import { BindScrub, CurveField, ColorField } from './Script_EditorParticleInspector.mjs';
import { PreviewSink, PreviewSurfaceMaterial } from './Script_VfxPreviewSurfaces.mjs';
import { NormalizeFallingSoil, NormalizeSoilPreview } from '../Script_FallingSoilRules.mjs';
import { FALLING_SOIL_SCHEMA as SCHEMA, FALLING_SOIL_STAGE as STAGE, FALLING_SOIL_PRESETS as PRESETS } from '../Data_Tuning_FallingSoil.mjs';

const Clone = (value) => JSON.parse(JSON.stringify(value));
const ShortLabel = (label) => String(label || '').replace(/（[^）]*）/g, '').replace(/\s*\/\s*米每秒²/, ' (m/s²)').replace(/\s*\/\s*米每秒/, ' (m/s)').replace(/\s*\/\s*弧度每秒/, ' (rad/s)').replace(/\s*\/\s*米/, ' (m)').replace(/\s*\/\s*秒/, ' (s)').replace(/\s*\/\s*弧度/, ' (rad)').replace(/\s*\/\s*像素/, ' (px)').trim();

// Only UI + studio reference surfaces. All emission/collision/rendering is the
// production ParticleEffects.FallingSoil implementation.
export class FallingSoilInspector {
  constructor(editor, parent) {
    this.editor = editor;
    this.parent = parent;
    this.configs = new Map();
    this.stage = Clone(STAGE);
    this.id = null;
  }

  get api() { return this.editor.host.vfx.particles.FallingSoil; }
  get selected() { return Object.hasOwn(PRESETS, this.editor.effectId); }
  Config() {
    const key = this.editor.effectId;
    if (!this.configs.has(key)) this.configs.set(key, NormalizeFallingSoil({}, key));
    return this.configs.get(key);
  }

  Show() {
    const open = new Set([...this.parent.querySelectorAll('details[open]')].map((el) => el.dataset.soilGroup));
    this.parent.replaceChildren();
    if (!this.selected) {
      const empty = El('div', 'vfxEmptyState');
      empty.appendChild(El('div', '', '当前非落土效果'));
      const btn = El('button', 'edBtn', '切到洞顶震落');
      btn.type = 'button';
      btn.style.marginTop = '10px';
      btn.addEventListener('click', () => this.editor.SelectEffect('SoilCeilingShake'));
      empty.appendChild(btn);
      this.parent.appendChild(empty);
      return;
    }

    const config = this.Config();
    const top = El('div', 'vfxSoilTop');
    const presetSel = El('select');
    presetSel.dataset.soilPreset = 'true';
    presetSel.setAttribute('aria-label', '落土预设');
    for (const [value, spec] of Object.entries(PRESETS)) {
      const opt = El('option', '', spec.label);
      opt.value = value;
      presetSel.appendChild(opt);
    }
    presetSel.value = this.editor.effectId;
    presetSel.addEventListener('change', () => this.editor.SelectEffect(presetSel.value));
    top.appendChild(presetSel);

    const btns = El('div', 'vfxSoilBtns');
    for (const [label, fn] of [
      ['自然收尾', () => { if (this.id) { this.api.Stop(this.id); this.editor.paused = false; } }],
      ['土流近景', () => this.Frame('flow')],
      ['检查土块', () => this.Frame(true)],
      ['全景', () => this.Frame(false)],
    ]) {
      const b = El('button', 'edBtn', label);
      b.type = 'button';
      b.addEventListener('click', fn);
      btns.appendChild(b);
    }
    top.appendChild(btns);
    this.parent.appendChild(top);

    for (const [group, { label, fields }] of Object.entries(SCHEMA)) {
      const hasEnable = Object.hasOwn(fields, 'enabled');
      const details = El('details', 'vfxCard');
      details.dataset.soilGroup = group;
      details.open = open.size ? open.has(group) : ['emitter', 'timing'].includes(group);
      if (hasEnable && !config[group].enabled) details.classList.add('disabled');

      const summary = El('summary', 'vfxCardHead');
      summary.appendChild(El('span', 'vfxCardArrow', '▸'));
      if (hasEnable) {
        const chk = El('input', 'vfxCardCheck');
        chk.type = 'checkbox';
        chk.checked = !!config[group].enabled;
        chk.dataset.soilField = `${group}.enabled`;
        chk.setAttribute('aria-label', fields.enabled.label);
        chk.addEventListener('click', (e) => e.stopPropagation());
        chk.addEventListener('change', () => {
          details.classList.toggle('disabled', !chk.checked);
          this.Edit({ [group]: { enabled: chk.checked } });
        });
        summary.appendChild(chk);
      }
      const [shortTitle] = label.split(' · ');
      summary.append(El('span', 'vfxCardTitle', shortTitle), El('span', 'vfxCardSub', group));
      details.appendChild(summary);

      const body = El('div', 'vfxCardBody');
      details.appendChild(body);
      this.parent.appendChild(details);

      for (const [key, schema] of Object.entries(fields)) {
        if (key === 'enabled' && hasEnable) continue;
        const path = `${group}.${key}`;
        const value = config[group][key];
        const Patch = (n) => this.Edit({ [group]: { [key]: n } });
        if (schema.type === 'number') this.Number(body, schema.label, value, Patch, { ...schema, path });
        else if (schema.type === 'boolean') this.Bool(body, schema.label, value, Patch, path);
        else if (schema.type === 'enum') this.Enum(body, schema.label, schema.options, value, Patch, path);
        else if (schema.type === 'curve') CurveField(body, schema.label, value, Patch, { ...schema, path: `soil.${path}` });
        else if (schema.type === 'color') {
          const box = El('div');
          box.dataset.soilField = path;
          body.appendChild(box);
          ColorField(box, schema.label, value, Patch);
        } else if (schema.type === 'vector') {
          this.Vector(body, schema.label, value, (i, n) => {
            const values = [...this.Config()[group][key]];
            values[i] = n;
            Patch(values);
          }, { ...schema, path });
        }
      }
    }

    // 摄影棚参照物（紧凑手风琴卡片，零说明文字）
    const stageCard = El('details', 'vfxCard');
    stageCard.dataset.soilGroup = 'stage';
    stageCard.open = open.has('stage');
    const stageHead = El('summary', 'vfxCardHead');
    stageHead.append(El('span', 'vfxCardArrow', '▸'), El('span', 'vfxCardTitle', '测试参照'), El('span', 'vfxCardSub', 'Stage'));
    stageCard.appendChild(stageHead);
    const stageBody = El('div', 'vfxCardBody');
    stageCard.appendChild(stageBody);
    this.parent.appendChild(stageCard);

    const Rebuild = () => this.Replay();
    const toggles = El('div', 'vfxCheckGrid');
    for (const [lbl, val, set] of [
      ['顶缝来源', this.stage.sourceReference, (on) => { this.stage.sourceReference = on; Rebuild(); }],
      ['暗色背板', this.stage.backdrop, (on) => { this.stage.backdrop = on; Rebuild(); }],
      ['横木碰撞', this.stage.beam.enabled, (on) => { this.stage.beam.enabled = on; Rebuild(); }],
      ['运动宿主', this.stage.followMotion, (on) => { this.stage.followMotion = on; Rebuild(); }],
    ]) {
      const wrap = El('label', 'vfxCheck');
      const chk = El('input');
      chk.type = 'checkbox'; chk.checked = !!val;
      chk.addEventListener('change', () => set(chk.checked));
      wrap.append(chk, document.createTextNode(lbl));
      toggles.appendChild(wrap);
    }
    stageBody.appendChild(toggles);
    this.Number(stageBody, '地面高度', this.stage.groundY, (n) => { this.stage.groundY = n; Rebuild(); }, { min: -3, max: 3, step: 0.05, path: 'stage.groundY' });
    this.Vector(stageBody, '横木位置', [this.stage.beam.x, this.stage.beam.y, this.stage.beam.z], (i, n) => {
      this.stage.beam[['x', 'y', 'z'][i]] = n; Rebuild();
    }, { min: -4, max: 6, step: 0.02, paths: ['stage.beam.x', 'stage.beam.y', 'stage.beam.z'] });
    this.Vector(stageBody, '横木尺寸', [this.stage.beam.width, this.stage.beam.height, this.stage.beam.depth], (i, n) => {
      this.stage.beam[['width', 'height', 'depth'][i]] = n; Rebuild();
    }, { min: 0.03, max: 6, step: 0.02, paths: ['stage.beam.width', 'stage.beam.height', 'stage.beam.depth'] });
  }

  Bool(parent, label, value, onChange, path) {
    const row = El('div', 'vfxProp');
    const lbl = El('div', 'vfxPropLabel', ShortLabel(label));
    lbl.title = label;
    const ctrl = El('div', 'vfxPropCtrl');
    const chk = El('input');
    chk.type = 'checkbox';
    chk.checked = !!value;
    chk.dataset.soilField = path;
    chk.setAttribute('aria-label', label);
    chk.style.accentColor = 'var(--ed-gold)';
    chk.addEventListener('change', () => onChange(chk.checked));
    ctrl.appendChild(chk);
    row.append(lbl, ctrl);
    parent.appendChild(row);
  }

  Enum(parent, label, options, value, onChange, path) {
    const row = El('div', 'vfxProp');
    const lbl = El('div', 'vfxPropLabel', ShortLabel(label));
    lbl.title = label;
    const ctrl = El('div', 'vfxPropCtrl');
    const sel = El('select');
    sel.dataset.soilField = path;
    sel.setAttribute('aria-label', label);
    for (const [val, text] of Object.entries(options)) {
      const o = El('option', '', text); o.value = val; sel.appendChild(o);
    }
    sel.value = String(value);
    sel.addEventListener('change', () => onChange(sel.value));
    ctrl.appendChild(sel);
    row.append(lbl, ctrl);
    parent.appendChild(row);
  }

  Vector(parent, label, values, onChange, { min = -10, max = 10, step = 0.01, path = '', paths = null } = {}) {
    const row = El('div', 'vfxProp');
    const lbl = El('div', 'vfxPropLabel', ShortLabel(label));
    lbl.title = label;
    const ctrl = El('div', 'vfxPropCtrl');
    const vec = El('div', 'vfxVec');
    const tags = [['X', 'ax'], ['Y', 'ay'], ['Z', 'az']];
    for (let i = 0; i < 3; i += 1) {
      const axis = El('div', 'vfxAxis');
      const tag = El('span', `vfxAxisTag ${tags[i][1]}`, tags[i][0]);
      const input = El('input');
      input.type = 'number';
      input.min = String(min); input.max = String(max); input.step = String(step);
      input.value = String(values[i]);
      input.dataset.soilField = paths ? paths[i] : `${path}.${i}`;
      input.setAttribute('aria-label', `${label} ${tags[i][0]}`);
      const Update = (n) => this.editor.Try(() => onChange(i, n));
      input.addEventListener('change', () => { const n = Number(input.value); if (Number.isFinite(n)) Update(n); });
      BindScrub(tag, input, Update, { min, max, step });
      axis.append(tag, input);
      vec.appendChild(axis);
    }
    ctrl.appendChild(vec);
    row.append(lbl, ctrl);
    parent.appendChild(row);
  }

  Number(parent, label, value, onChange, { min = 0, max = 1, step = 0.01, path = '' } = {}) {
    if (Math.abs((value - min) / step - Math.round((value - min) / step)) > 1e-6) step = Math.min(step, 0.001);
    const row = El('div', 'vfxProp');
    const lbl = El('div', 'vfxPropLabel', ShortLabel(label));
    lbl.title = label;
    const ctrl = El('div', 'vfxPropCtrl');
    if (max - min <= 1000) {
      const input = El('input');
      input.type = 'range';
      input.min = String(min); input.max = String(max); input.step = String(step);
      input.value = String(value);
      input.dataset.soilField = path;
      input.setAttribute('aria-label', label);
      const val = El('span', 'vfxPropVal');
      const Sync = () => {
        const n = parseFloat(input.value);
        val.textContent = Math.abs(n) >= 100 ? n.toFixed(0) : step < 0.01 ? n.toFixed(3) : n.toFixed(2);
        const t = max > min ? (n - min) / (max - min) : 0;
        input.style.setProperty('--fill', `${(Math.max(0, Math.min(1, t)) * 100).toFixed(1)}%`);
      };
      Sync();
      input.addEventListener('input', () => { Sync(); this.editor.Try(() => onChange(parseFloat(input.value))); });
      ctrl.append(input, val);
    } else {
      const input = El('input');
      input.type = 'number';
      input.min = String(min); input.max = String(max); input.step = String(step);
      input.value = String(value);
      input.dataset.soilField = path;
      input.setAttribute('aria-label', label);
      input.addEventListener('change', () => this.editor.Try(() => onChange(Number(input.value))));
      BindScrub(lbl, input, (n) => this.editor.Try(() => onChange(n)), { min, max, step });
      ctrl.appendChild(input);
    }
    row.append(lbl, ctrl);
    parent.appendChild(row);
  }

  Edit(patch) {
    const previous = this.Config();
    const next = NormalizeFallingSoil({
      ...previous,
      ...Object.fromEntries(Object.entries(patch).map(([key, value]) => [key, { ...previous[key], ...value }])),
    }, this.editor.effectId);
    this.configs.set(this.editor.effectId, next);
    if (patch.emitter?.seed !== undefined) {
      this.editor.seed = next.emitter.seed;
      const field = this.editor.panel.root.querySelector('[data-vfx-seed]');
      if (field) field.value = String(this.editor.seed);
    }
    this.Replay();
    return Clone(next);
  }

  Replay() {
    const time = this.editor.previewTime;
    const paused = this.editor.paused;
    this.editor.Seek(time);
    this.editor.paused = paused;
    return this.Inspect();
  }

  Begin() {
    this.End();
    if (!this.selected) return;
    this.savedPadVisible = this.editor.studio.pad.visible;
    this.editor.studio.pad.visible = false;
    const c = this.Config();
    c.emitter.seed = this.editor.seed;
    this.BuildStage(c);
    const host = { groundAt: () => this.stage.groundY, raycast: (from, dir, distance) => this.Raycast(from, dir, distance) };
    if (this.stage.followMotion) host.transformAt = (time) => ({ position: [Math.sin(time * 0.9) * 0.7, 0, 0], rotation: [0, Math.sin(time * 0.5) * 0.12, 0] });
    this.id = this.api.Create({ preset: this.editor.effectId, config: c }, host).id;
    this.api.solidRoot.visible = true;
    this.Update(0);
  }

  End() {
    if (this.id && this.api.entries.has(this.id)) this.api.Remove(this.id);
    this.id = null;
    if (this.savedPadVisible !== undefined) {
      this.editor.studio.pad.visible = this.savedPadVisible;
      this.savedPadVisible = undefined;
    }
    if (this.root) {
      this.root.traverse((object) => { object.geometry?.dispose(); });
      this.root.removeFromParent();
      this.root = null;
    }
    for (const material of this.materials || []) material.dispose();
    this.materials = [];
  }

  BuildStage(c) {
    this.root = new THREE.Group();
    this.root.name = 'FallingSoilPreviewReferences';
    this.editor.studio.stand.add(this.root);
    const library = this.editor.host.library;
    const ground = PreviewSurfaceMaterial(library, 'Ground', { color: 0x9a8c76, roughness: 1 });
    const earth = PreviewSurfaceMaterial(library, 'Ground', { color: 0x947354, roughness: 1 });
    const wood = library?.baked?.has('WoodBeam') && library.CloneShaded ? library.CloneShaded('WoodBeam') : new THREE.MeshStandardMaterial({ color: 0x735638, roughness: 0.94 });
    const backdrop = new THREE.MeshStandardMaterial({ color: 0x20241f, roughness: 1 });
    this.materials = [ground, earth, wood, backdrop];
    const sink = new PreviewSink();
    sink.SetSector('FallingSoilPreview');
    const box = (target, key, w, h, d, x, y, z) => {
      const geo = new THREE.BoxGeometry(w, h, d);
      const uv = geo.attributes.uv;
      for (let i = 0; i < uv.count; i += 1) uv.setXY(i, uv.getX(i) * Math.max(1, w), uv.getY(i) * Math.max(1, d));
      geo.translate(x, y, z);
      target.Add(key, geo);
    };
    box(sink, 'ground', 6, 0.035, 5, 0, this.stage.groundY - 0.0175, 0);
    const b = this.stage.beam;
    if (b.enabled) box(sink, 'wood', b.width, b.height, b.depth, b.x, b.y, b.z);
    if (this.stage.backdrop) {
      const h = Math.max(2, c.emitter.position[1] - this.stage.groundY + 1.2);
      box(sink, 'backdrop', Math.max(6, c.emitter.width + 2), h, 0.06, c.emitter.position[0], this.stage.groundY + h * 0.5, c.emitter.position[2] + c.emitter.length * 0.5 + 1.2);
    }
    sink.Flush(this.root, { Get: (key) => (key === 'ground' ? ground : key === 'wood' ? wood : backdrop) }, { castShadow: false });
    this.source = new THREE.Group();
    this.root.add(this.source);
    this.source.visible = this.stage.sourceReference;
    const source = new PreviewSink();
    source.SetSector('SoilSource');
    const w = Math.max(0.4, c.emitter.width);
    const d = Math.max(0.4, c.emitter.length);
    if (c.emitter.shape === 'line') {
      const seam = Math.max(0.015, c.emitter.length);
      box(source, 'wood', w + 0.25, 0.08, 0.32, 0, 0.04, -0.16 - seam * 0.5);
      box(source, 'wood', w + 0.25, 0.08, 0.32, 0, 0.04, 0.16 + seam * 0.5);
      box(source, 'earth', w + 0.25, 0.22, 0.75, 0, 0.19, 0);
    } else {
      const edge = c.emitter.distribution === 'edge';
      const extra = edge ? 0.04 : 0.6;
      box(source, 'earth', w + extra, 0.3, d + extra, 0, 0.15, 0);
      box(source, 'wood', w + 0.5, 0.12, 0.14, 0, -0.06, -d * 0.5 - 0.12);
      box(source, 'wood', w + 0.5, 0.12, 0.14, 0, -0.06, d * 0.5 + 0.12);
    }
    source.Flush(this.source, { Get: (key) => (key === 'earth' ? earth : wood) }, { castShadow: false });
  }

  Raycast(from, dir, distance) {
    const b = this.stage.beam;
    if (!b.enabled) return null;
    const box = new THREE.Box3(
      new THREE.Vector3(b.x - b.width * 0.5, b.y - b.height * 0.5, b.z - b.depth * 0.5),
      new THREE.Vector3(b.x + b.width * 0.5, b.y + b.height * 0.5, b.z + b.depth * 0.5),
    );
    const ray = new THREE.Ray(new THREE.Vector3(from.x, from.y, from.z), new THREE.Vector3(dir.x, dir.y, dir.z));
    const point = ray.intersectBox(box, new THREE.Vector3());
    if (!point) return null;
    const t = point.distanceTo(ray.origin);
    if (t > distance) return null;
    const normal = [0, 0, 0];
    const coordinates = point.toArray();
    let best = Infinity;
    for (let i = 0; i < 3; i += 1) {
      for (const [side, value] of [[-1, box.min.toArray()[i]], [1, box.max.toArray()[i]]]) {
        const d = Math.abs(coordinates[i] - value);
        if (d < best) { best = d; normal.fill(0); normal[i] = side; }
      }
    }
    return { t, normal };
  }

  Update(time) {
    if (!this.source || !this.id) return;
    const p = this.api.Get(this.id).simulation.Pose(time);
    this.source.position.fromArray(p.position);
    this.source.rotation.set(...p.rotation);
    if (p.hostRotation) this.source.quaternion.premultiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(...p.hostRotation)));
  }

  Frame(near = false) {
    if (!this.selected) return;
    const c = this.Config();
    const p = c.emitter.position;
    const isClod = near === true;
    const isFlow = near === 'flow';
    this.editor.studio.maxDistance = 40;
    this.editor.studio.Frame(Math.max(3, c.emitter.position[1] + 0.5), isClod ? 0.85 : isFlow ? 2.8 : Math.max(5.6, p[1] * 1.75));
    const middle = (p[1] + this.stage.groundY) * 0.5;
    const clod = isClod && this.id
      ? this.api.Samples(this.id, 'clods', 48).sort((a, b) => Math.abs(a.position[1] - middle) - Math.abs(b.position[1] - middle))[0]
      : null;
    if (clod) this.editor.studio.orbit.target.fromArray(clod.position);
    else this.editor.studio.orbit.target.set(p[0], isFlow ? this.stage.groundY + 0.85 : Math.max(0.4, middle), p[2]);
    const orbit = this.editor.studio.orbit;
    orbit.pitch = isClod ? 0.22 : 0.08;
    if (!isClod) orbit.target.addScaledVector(new THREE.Vector3(Math.cos(orbit.yaw), 0, -Math.sin(orbit.yaw)), orbit.dist * 0.1);
    if (clod) {
      for (const yaw of [orbit.yaw, orbit.yaw + Math.PI, orbit.yaw + Math.PI * 0.5, orbit.yaw - Math.PI * 0.5]) {
        const target = orbit.target;
        const eye = new THREE.Vector3(target.x + Math.sin(yaw) * Math.cos(orbit.pitch) * orbit.dist, target.y + Math.sin(orbit.pitch) * orbit.dist, target.z + Math.cos(yaw) * Math.cos(orbit.pitch) * orbit.dist);
        const dir = target.clone().sub(eye).normalize();
        const hit = this.Raycast(eye, dir, orbit.dist);
        if (!hit || hit.t > orbit.dist - 0.05) { orbit.yaw = yaw; break; }
      }
    }
    this.editor.studio.ApplyCamera();
    this.editor.host.post?.NotifyCameraCut();
  }

  Inspect() { return this.id && this.api.entries.has(this.id) ? this.api.Inspect(this.id) : null; }
  Export() { return this.selected ? { version: 1, kind: 'TengxianFallingSoil', preset: this.editor.effectId, config: Clone(this.Config()), preview: Clone(this.stage) } : undefined; }
  Import(data) {
    if (data?.version !== 1 || data.kind !== 'TengxianFallingSoil' || data.preset !== this.editor.effectId) throw new Error('落土预设无效');
    this.configs.set(data.preset, NormalizeFallingSoil(data.config, data.preset));
    this.stage = NormalizeSoilPreview(data.preview);
  }
}
