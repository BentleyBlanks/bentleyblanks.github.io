import * as THREE from 'three';
import { PARTICLE_VOLUME_ASSETS } from '../Data_ParticleVolumeAssets.mjs';
import { El, ButtonRow } from '../Script_EditorUi.mjs';
import { EvaluateCurve, EvaluateGradient } from '../Script_ParticleModules.mjs';

const Clone = (value) => JSON.parse(JSON.stringify(value));
const FmtNum = (value) => (typeof value === 'number' && Number.isFinite(value) ? String(Number(value.toFixed(4))) : String(value));
let gradSvgSeq = 0;

/** 横向拖拽标签 / 轴标微调数值（Unity / UE / Blender 式 Scrub）。 */
export function BindScrub(handle, input, onValue, { min = -1000, max = 1000, step = 0.01 } = {}) {
  handle.dataset.scrub = '1';
  handle.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    const startX = event.clientX;
    const startVal = Number(input.value) || 0;
    const baseStep = Math.max(1e-4, Number(step) || 0.01);
    const digits = baseStep >= 1 ? 0 : Math.min(4, Math.max(1, Math.ceil(-Math.log10(baseStep))));
    handle.setPointerCapture?.(event.pointerId);
    const Move = (e) => {
      const mul = e.shiftKey ? 0.1 : e.altKey ? 5 : 1;
      const delta = (e.clientX - startX) * baseStep * mul * 0.5;
      const raw = Math.max(min, Math.min(max, startVal + delta));
      const snapped = Number((Math.round(raw / (baseStep * (e.shiftKey ? 0.1 : 1))) * (baseStep * (e.shiftKey ? 0.1 : 1))).toFixed(digits));
      const clamped = Math.max(min, Math.min(max, snapped));
      if (Number.isFinite(clamped) && String(clamped) !== input.value) {
        input.value = String(clamped);
        onValue(clamped);
      }
    };
    const End = () => {
      handle.removeEventListener('pointermove', Move);
      handle.removeEventListener('pointerup', End);
      handle.removeEventListener('pointercancel', End);
    };
    handle.addEventListener('pointermove', Move);
    handle.addEventListener('pointerup', End);
    handle.addEventListener('pointercancel', End);
  });
}

function RgbaPreview(color) {
  const r = Math.max(0, Number(color[0]) || 0);
  const g = Math.max(0, Number(color[1]) || 0);
  const b = Math.max(0, Number(color[2]) || 0);
  const a = Math.max(0, Math.min(1, Number(color[3] ?? 1)));
  const peak = Math.max(1, r, g, b);
  const toSrgb = (c) => Math.round(Math.pow(Math.min(1, c / peak), 1 / 2.2) * 255);
  return `rgba(${toSrgb(r)},${toSrgb(g)},${toSrgb(b)},${a.toFixed(3)})`;
}

export function GradientCss(keys) {
  if (!Array.isArray(keys) || !keys.length) return 'linear-gradient(90deg, #fff, #fff)';
  const sorted = [...keys].sort((a, b) => a[0] - b[0]);
  const stops = sorted.map(([t, col]) => `${RgbaPreview(col)} ${(Math.max(0, Math.min(1, t)) * 100).toFixed(1)}%`);
  return `linear-gradient(90deg, ${stops.join(', ')})`;
}

function PropRow(parent, label, ctrl, { compact = false, title = '' } = {}) {
  const row = El('div', `vfxProp${compact ? ' compact' : ''}`);
  const lbl = El('div', 'vfxPropLabel', label);
  if (title) lbl.title = title;
  const box = El('div', 'vfxPropCtrl');
  if (ctrl) box.appendChild(ctrl);
  row.append(lbl, box);
  parent.appendChild(row);
  return { row, label: lbl, ctrl: box };
}

function NumberField(parent, label, value, onChange, { min = -1000, max = 1000, step = 0.01, path = '' } = {}) {
  const input = El('input');
  input.type = 'number';
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  input.value = FmtNum(value);
  if (path) input.dataset.particleField = path;
  input.setAttribute('aria-label', label);
  const Commit = () => {
    const n = Number(input.value);
    if (Number.isFinite(n)) onChange(n);
  };
  input.addEventListener('change', Commit);
  const { label: lbl } = PropRow(parent, label, input);
  BindScrub(lbl, input, onChange, { min, max, step });
  return input;
}

function SelectField(parent, label, options, value, onChange, { path = '' } = {}) {
  const select = El('select');
  select.setAttribute('aria-label', label);
  if (path) select.dataset.particleField = path;
  for (const raw of options) {
    const opt = typeof raw === 'string' ? { value: raw, label: raw } : raw;
    const o = El('option', '', opt.label);
    o.value = String(opt.value);
    select.appendChild(o);
  }
  select.value = String(value ?? '');
  select.addEventListener('change', () => onChange(select.value));
  PropRow(parent, label, select);
  return select;
}

function Vector3Field(parent, label, values, onChange, { min = -1000, max = 1000, step = 0.01, paths = [] } = {}) {
  const vec = El('div', 'vfxVec');
  const tags = [['X', 'ax'], ['Y', 'ay'], ['Z', 'az']];
  for (let i = 0; i < 3; i += 1) {
    const axis = El('div', 'vfxAxis');
    const tag = El('span', `vfxAxisTag ${tags[i][1]}`, tags[i][0]);
    const input = El('input');
    input.type = 'number';
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.value = String(values[i]);
    if (paths[i]) input.dataset.particleField = paths[i];
    input.setAttribute('aria-label', `${label} ${tags[i][0]}`);
    const Update = (n) => onChange(i, n);
    input.addEventListener('change', () => { const n = Number(input.value); if (Number.isFinite(n)) Update(n); });
    BindScrub(tag, input, Update, { min, max, step });
    axis.append(tag, input);
    vec.appendChild(axis);
  }
  PropRow(parent, label, vec);
  return vec;
}

function CheckControl(parent, label, checked, onChange) {
  const wrap = El('label', 'vfxCheck');
  const input = El('input');
  input.type = 'checkbox';
  input.checked = !!checked;
  input.addEventListener('change', () => onChange(input.checked));
  wrap.append(input, document.createTextNode(label));
  parent.appendChild(wrap);
  return input;
}

function CurveGraph(parent, keys, onChange, { min = 0, max = 4, subLabel = '' } = {}) {
  const wrap = El('div', 'vfxCurveGraphWrap');
  if (subLabel) wrap.appendChild(El('div', 'vfxCurveSubLabel', subLabel));
  parent.appendChild(wrap);

  let points = Clone(keys);
  let selected = 0;
  const ns = 'http://www.w3.org/2000/svg';
  const gradId = `vfxCurveFill${++gradSvgSeq}`;
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 280 104');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', '生命周期曲线');
  svg.classList.add('vfxCurveSvg');
  wrap.appendChild(svg);

  const AutoRange = () => {
    const peak = Math.max(...points.map((p) => Math.abs(p[1])));
    const span = peak > 0 ? Math.max(0.01, peak * 1.25) : 1;
    return { high: Math.min(max, span), low: min < 0 ? Math.max(min, -span) : 0 };
  };
  let { low, high } = AutoRange();
  if (high <= low) high = low + 0.01;

  const padL = 10, padR = 10, padT = 10, padB = 16;
  const plotW = 280 - padL - padR;
  const plotH = 104 - padT - padB;
  const xy = (p) => [padL + p[0] * plotW, padT + plotH - ((p[1] - low) / (high - low)) * plotH];
  const At = (event) => {
    const r = svg.getBoundingClientRect();
    const sx = ((event.clientX - r.left) / Math.max(1, r.width)) * 280;
    const sy = ((event.clientY - r.top) / Math.max(1, r.height)) * 104;
    const tx = Math.max(0, Math.min(1, (sx - padL) / plotW));
    const ty = Math.max(low, Math.min(high, low + ((padT + plotH - sy) / plotH) * (high - low)));
    return [tx, ty];
  };

  function Draw() {
    svg.replaceChildren();
    const defs = document.createElementNS(ns, 'defs');
    const lg = document.createElementNS(ns, 'linearGradient');
    lg.setAttribute('id', gradId);
    lg.setAttribute('x1', '0'); lg.setAttribute('y1', '0'); lg.setAttribute('x2', '0'); lg.setAttribute('y2', '1');
    const s1 = document.createElementNS(ns, 'stop'); s1.setAttribute('offset', '0%'); s1.setAttribute('stop-color', '#edca83'); s1.setAttribute('stop-opacity', '0.26');
    const s2 = document.createElementNS(ns, 'stop'); s2.setAttribute('offset', '100%'); s2.setAttribute('stop-color', '#edca83'); s2.setAttribute('stop-opacity', '0.02');
    lg.append(s1, s2); defs.appendChild(lg); svg.appendChild(defs);

    // 4×4 细格
    for (let i = 0; i <= 4; i += 1) {
      const y = padT + (i * plotH) / 4;
      const x = padL + (i * plotW) / 4;
      const line = document.createElementNS(ns, 'path');
      line.setAttribute('d', `M${padL} ${y.toFixed(1)}H${padL + plotW} M${x.toFixed(1)} ${padT}V${padT + plotH}`);
      line.setAttribute('stroke', i === 0 || i === 4 ? '#2b302b' : '#1e221e');
      line.setAttribute('stroke-width', '1');
      svg.appendChild(line);
    }

    // 若包含 0 轴（正负范围），画零线
    if (low < 0 && high > 0) {
      const zy = xy([0, 0])[1];
      const zero = document.createElementNS(ns, 'line');
      zero.setAttribute('x1', String(padL)); zero.setAttribute('x2', String(padL + plotW));
      zero.setAttribute('y1', zy.toFixed(1)); zero.setAttribute('y2', zy.toFixed(1));
      zero.setAttribute('stroke', '#4a4c42'); zero.setAttribute('stroke-dasharray', '3 3');
      svg.appendChild(zero);
    }

    // 内置极简角标数值（替代冗余文字说明）
    const CornerText = (text, x, y, anchor = 'start') => {
      const t = document.createElementNS(ns, 'text');
      t.setAttribute('x', String(x)); t.setAttribute('y', String(y));
      t.setAttribute('text-anchor', anchor);
      t.setAttribute('fill', '#7d8074');
      t.setAttribute('font-size', '9');
      t.setAttribute('font-family', 'ui-monospace, Consolas, monospace');
      t.textContent = text;
      svg.appendChild(t);
    };
    CornerText(high.toFixed(2), padL + 3, padT + 9);
    CornerText(low.toFixed(2), padL + 3, padT + plotH - 3);
    CornerText('0%', padL, 101);
    CornerText('100%', padL + plotW, 101, 'end');

    const lineD = points.map((p, i) => (i ? 'L' : 'M') + xy(p).map((n) => n.toFixed(1)).join(' ')).join(' ');
    const area = document.createElementNS(ns, 'path');
    const firstX = xy(points[0])[0].toFixed(1);
    const lastX = xy(points[points.length - 1])[0].toFixed(1);
    const baseY = (padT + plotH).toFixed(1);
    area.setAttribute('d', `${lineD} L${lastX} ${baseY} L${firstX} ${baseY} Z`);
    area.setAttribute('fill', `url(#${gradId})`);
    svg.appendChild(area);

    const path = document.createElementNS(ns, 'path');
    path.setAttribute('d', lineD);
    path.setAttribute('stroke', '#edca83');
    path.setAttribute('stroke-width', '1.8');
    path.setAttribute('fill', 'none');
    svg.appendChild(path);

    points.forEach((point, index) => {
      const circle = document.createElementNS(ns, 'circle');
      const [cx, cy] = xy(point);
      circle.setAttribute('cx', cx.toFixed(1));
      circle.setAttribute('cy', cy.toFixed(1));
      circle.setAttribute('r', index === selected ? '5.2' : '4.5');
      circle.setAttribute('fill', index === selected ? '#fff1cc' : '#c49d56');
      circle.setAttribute('stroke', '#0a0b09');
      circle.setAttribute('stroke-width', '1.2');
      circle.style.cursor = 'grab';
      circle.dataset.curvePoint = String(index);
      svg.appendChild(circle);

      circle.addEventListener('pointerdown', (event) => {
        event.preventDefault();
        event.stopPropagation();
        selected = index;
        circle.setPointerCapture(event.pointerId);
        const Move = (e) => {
          const p = At(e);
          p[0] = index === 0 ? points[0][0]
            : index === points.length - 1 ? points.at(-1)[0]
            : Math.max(points[index - 1][0] + 0.005, Math.min(points[index + 1][0] - 0.005, p[0]));
          points[index] = p.map((n) => Number(n.toFixed(4)));
          const q = xy(points[index]);
          circle.setAttribute('cx', q[0].toFixed(1));
          circle.setAttribute('cy', q[1].toFixed(1));
          const updatedD = points.map((k, i) => (i ? 'L' : 'M') + xy(k).map((n) => n.toFixed(1)).join(' ')).join(' ');
          path.setAttribute('d', updatedD);
          area.setAttribute('d', `${updatedD} L${xy(points[points.length - 1])[0].toFixed(1)} ${baseY} L${xy(points[0])[0].toFixed(1)} ${baseY} Z`);
          onChange(Clone(points));
        };
        const End = () => {
          circle.removeEventListener('pointermove', Move);
          circle.removeEventListener('pointerup', End);
          circle.removeEventListener('pointercancel', End);
          Draw();
        };
        circle.addEventListener('pointermove', Move);
        circle.addEventListener('pointerup', End);
        circle.addEventListener('pointercancel', End);
      });
    });
  }

  svg.addEventListener('dblclick', (event) => {
    if (points.length >= 32) return;
    const p = At(event);
    if (points.some((k) => Math.abs(k[0] - p[0]) < 0.01)) return;
    points.push(p);
    points.sort((a, b) => a[0] - b[0]);
    selected = points.indexOf(p);
    onChange(Clone(points));
    Draw();
  });

  const bar = El('div', 'vfxCurveBar');
  const AddBarBtn = (label, title, onClick) => {
    const b = El('button', '', label);
    b.type = 'button';
    b.title = title;
    b.addEventListener('click', onClick);
    bar.appendChild(b);
  };
  AddBarBtn('+ 点', '添加控制点', () => {
    if (points.length >= 32) return;
    let gap = 0, at = 1;
    for (let i = 1; i < points.length; i += 1) {
      if (points[i][0] - points[i - 1][0] > gap) { gap = points[i][0] - points[i - 1][0]; at = i; }
    }
    const time = (points[at][0] + points[at - 1][0]) * 0.5;
    points.splice(at, 0, [time, EvaluateCurve(points, time)]);
    selected = at;
    onChange(Clone(points));
    Draw();
  });
  AddBarBtn('− 点', '删除选中控制点', () => {
    if (points.length <= 2 || selected === 0 || selected === points.length - 1) return;
    points.splice(selected, 1);
    selected = 0;
    onChange(Clone(points));
    Draw();
  });
  AddBarBtn('×2', '扩大纵轴范围', () => {
    high = Math.min(max, high * 2);
    if (low < 0) low = Math.max(min, low * 2);
    Draw();
  });
  AddBarBtn('适配', '自适应纵轴范围', () => {
    ({ low, high } = AutoRange());
    Draw();
  });
  wrap.appendChild(bar);
  Draw();
}

export function CurveField(parent, label, value, onChange, { min = 0, max = 4, step = 0.01, path = '' } = {}) {
  const box = El('div', 'vfxCurve');
  parent.appendChild(box);
  let current = Clone(value);
  const mode = typeof value === 'number' ? 'constant' : Array.isArray(value) ? 'curve' : value.mode;
  const ToKeys = () => (Array.isArray(current) ? current : current.curve || [[0, EvaluateCurve(current, 0)], [1, EvaluateCurve(current, 1)]]);
  const Set = (nextVal) => { current = nextVal; onChange(Clone(nextVal)); };

  const head = El('div', 'vfxCurveHead');
  const lbl = El('div', 'vfxPropLabel', label);
  const inline = El('div', 'vfxCurveInline');
  const modeSelect = El('select', 'vfxCurveMode');
  modeSelect.dataset.curveMode = path;
  modeSelect.setAttribute('aria-label', `${label} 模式`);
  for (const opt of [
    { value: 'constant', label: '常数' },
    { value: 'twoConstants', label: '区间' },
    { value: 'curve', label: '曲线' },
    { value: 'twoCurves', label: '双曲线' },
  ]) {
    const o = El('option', '', opt.label);
    o.value = opt.value;
    modeSelect.appendChild(o);
  }
  modeSelect.value = mode;
  head.append(lbl, inline, modeSelect);
  box.appendChild(head);

  const graphs = El('div');
  box.appendChild(graphs);

  const MakeNum = (val, onNum, fieldPath, aria) => {
    const input = El('input');
    input.type = 'number';
    input.min = String(min); input.max = String(max); input.step = String(step);
    input.value = FmtNum(val);
    if (fieldPath) input.dataset.particleField = fieldPath;
    input.setAttribute('aria-label', aria);
    input.addEventListener('change', () => { const n = Number(input.value); if (Number.isFinite(n)) onNum(n); });
    return input;
  };

  function Draw(kind) {
    inline.replaceChildren();
    graphs.replaceChildren();
    if (kind === 'constant') {
      const inp = MakeNum(current, Set, path, label);
      inline.appendChild(inp);
      BindScrub(lbl, inp, Set, { min, max, step });
    } else if (kind === 'twoConstants') {
      const minIn = MakeNum(current.min, (n) => Set({ ...current, min: n }), path ? `${path}.min` : '', `${label} 最小`);
      const maxIn = MakeNum(current.max, (n) => Set({ ...current, max: n }), path ? `${path}.max` : '', `${label} 最大`);
      inline.append(minIn, El('span', 'vfxDash', '–'), maxIn);
    } else if (kind === 'curve') {
      inline.appendChild(El('span', 'vfxCardSub', `${ToKeys().length} 点`));
      CurveGraph(graphs, ToKeys(), Set, { min, max });
    } else {
      inline.appendChild(El('span', 'vfxCardSub', '双曲线'));
      for (const key of ['min', 'max']) {
        const ks = Array.isArray(current[key]) ? current[key] : [[0, EvaluateCurve(current[key], 0)], [1, EvaluateCurve(current[key], 1)]];
        CurveGraph(graphs, ks, (keys) => Set({ ...current, [key]: keys }), { min, max, subLabel: key === 'min' ? '下限' : '上限' });
      }
    }
  }

  modeSelect.addEventListener('change', () => {
    const next = modeSelect.value;
    const middle = EvaluateCurve(current, 0.5);
    Set(next === 'constant' ? middle
      : next === 'twoConstants' ? { mode: next, min: Math.min(middle * 0.8, middle * 1.2), max: Math.max(middle * 0.8, middle * 1.2) }
      : next === 'curve' ? ToKeys()
      : { mode: next, min: ToKeys(), max: ToKeys() });
    Draw(next);
  });

  Draw(mode);
}

/** 单行 HDR 颜色控件：色块 + HDR 亮度 + Alpha。 */
export function ColorField(parent, label, color, onChange) {
  let value = [...color];
  let gain = Math.max(1, ...value.slice(0, 3));
  const row = El('div', 'vfxColorRow');

  const swatch = El('input', 'vfxColorSwatch');
  swatch.type = 'color';
  swatch.setAttribute('aria-label', label);
  swatch.value = '#' + new THREE.Color().fromArray(value.slice(0, 3).map((n) => n / gain)).getHexString();
  swatch.addEventListener('input', () => {
    value = [...new THREE.Color(swatch.value).toArray().map((n) => n * gain), value[3]];
    onChange([...value]);
  });

  const MakeMini = (tag, val, min, max, step, aria, onNum) => {
    const box = El('div', 'vfxMiniField');
    const lbl = El('span', '', tag);
    const input = El('input');
    input.type = 'number';
    input.min = String(min); input.max = String(max); input.step = String(step);
    input.value = String(Number(val.toFixed(3)));
    input.setAttribute('aria-label', aria);
    input.addEventListener('change', () => { const n = Number(input.value); if (Number.isFinite(n)) onNum(n); });
    BindScrub(lbl, input, onNum, { min, max, step });
    box.append(lbl, input);
    return box;
  };

  const gainBox = MakeMini('HDR', gain, 0.001, 32, 0.1, `${label} 亮度`, (n) => {
    const old = gain;
    gain = Math.max(0.001, n);
    value = value.map((v, i) => (i < 3 ? (v / old) * gain : v));
    onChange([...value]);
  });
  const alphaBox = MakeMini('α', value[3] ?? 1, 0, 1, 0.05, `${label} 透明度`, (n) => {
    value[3] = Math.max(0, Math.min(1, n));
    onChange([...value]);
  });

  row.append(swatch, gainBox, alphaBox);
  if (label) PropRow(parent, label, row);
  else parent.appendChild(row);
  return row;
}

export class ParticleInspector {
  constructor(parent, { Read, Patch }) {
    this.parent = parent;
    this.Read = Read;
    this.Patch = Patch;
    this.selectedStop = 0;
  }

  Show() {
    const openKeys = new Set([...this.parent.querySelectorAll('details[data-particle-module][open]')].map((el) => el.dataset.particleModule));
    this.parent.replaceChildren();
    const record = this.Read() || {};
    const { modules: m, profile } = record;
    const eventLayer = !!profile || record.name?.startsWith('RuntimeVolume/');
    if (!m) {
      this.parent.appendChild(El('div', 'vfxEmptyState', '选择或添加粒子层'));
      return;
    }

    const Patch = (module, key, value) => this.Patch({ [module]: { [key]: value } });
    const Card = (key, title, sub, { badge = '', grad = null } = {}) => {
      const details = El('details', 'vfxCard');
      details.dataset.particleModule = key;
      details.open = openKeys.size ? openKeys.has(key) : key === 'main';
      const hasEnable = 'enabled' in m[key];
      if (hasEnable && !m[key].enabled) details.classList.add('disabled');

      const summary = El('summary', 'vfxCardHead');
      summary.appendChild(El('span', 'vfxCardArrow', '▸'));
      if (hasEnable) {
        const chk = El('input', 'vfxCardCheck');
        chk.type = 'checkbox';
        chk.checked = !!m[key].enabled;
        chk.setAttribute('aria-label', `启用${title}`);
        chk.addEventListener('click', (e) => e.stopPropagation());
        chk.addEventListener('change', () => {
          details.classList.toggle('disabled', !chk.checked);
          Patch(key, 'enabled', chk.checked);
        });
        summary.appendChild(chk);
      }
      summary.append(El('span', 'vfxCardTitle', title), El('span', 'vfxCardSub', sub));
      let gradPreview = null;
      if (grad) {
        gradPreview = El('span', 'vfxCardGradPreview');
        gradPreview.style.background = GradientCss(grad);
        summary.appendChild(gradPreview);
      } else if (badge) {
        summary.appendChild(El('span', 'vfxCardBadge', badge));
      }
      details.appendChild(summary);
      const body = El('div', 'vfxCardBody');
      details.appendChild(body);
      this.parent.appendChild(details);
      return { body, gradPreview };
    };

    const Curve = (parent, module, key, label, options = {}) =>
      CurveField(parent, label, m[module][key], (value) => Patch(module, key, value), { ...options, path: `${module}.${key}` });
    const Num = (parent, module, key, label, options = {}) =>
      NumberField(parent, label, m[module][key], (value) => Patch(module, key, value), { ...options, path: `${module}.${key}` });

    // 1. Main
    const { body: main } = Card('main', '主模块', 'Main', { badge: eventLayer ? '事件倍率' : '' });
    Num(main, 'main', 'duration', '周期 (s)', { min: 0.05, max: 120, step: 0.1 });
    const flags = El('div', 'vfxCheckGrid');
    flags.style.margin = '0';
    CheckControl(flags, '循环', m.main.loop, (on) => Patch('main', 'loop', on));
    CheckControl(flags, '预热', m.main.prewarm, (on) => Patch('main', 'prewarm', on));
    PropRow(main, '播放选项', flags);
    Num(main, 'main', 'startDelay', '延迟 (s)', { min: 0, max: 120, step: 0.05 });
    Curve(main, 'main', 'startLifetime', eventLayer ? '寿命倍率' : '寿命 (s)', { min: 0.02, max: 120 });
    Curve(main, 'main', 'startSpeed', eventLayer ? '速度倍率' : '初速 (m/s)', { min: 0, max: 100 });
    Curve(main, 'main', 'startSize', eventLayer || m.renderer.mode === 'bakedVolume' ? '尺寸倍率' : '初始尺寸 (m)', { min: 0.001, max: 50 });
    Curve(main, 'main', 'startRotation', '初始旋转', { min: -6.28, max: 6.28 });
    ColorField(main, '起始颜色', m.main.startColor, (value) => Patch('main', 'startColor', value));
    Num(main, 'main', 'gravityModifier', '重力倍率', { min: -10, max: 10, step: 0.1 });
    Num(main, 'main', 'maxParticles', '最大粒子', { min: 1, max: this.Read().capacity || 4096, step: 1 });
    Num(main, 'main', 'randomSeed', '随机种子', { min: 0, max: 4294967295, step: 1 });
    SelectField(main, '模拟空间', [{ value: 'world', label: '世界' }, { value: 'local', label: '局部' }], m.main.simulationSpace, (value) => Patch('main', 'simulationSpace', value));

    // 2. Emission
    const { body: emission } = Card('emission', '发射', 'Emission', { badge: m.emission.bursts.length ? `${m.emission.bursts.length} 爆发` : '' });
    Curve(emission, 'emission', 'rateOverTime', '发射率 /s', { min: 0, max: 1000 });
    Num(emission, 'emission', 'rateOverDistance', '距离发射 /m', { min: 0, max: 1000, step: 1 });
    for (const [i, burst] of m.emission.bursts.entries()) {
      const card = El('div', 'vfxBurstCard');
      const head = El('div', 'vfxBurstHead');
      head.appendChild(El('span', '', `爆发 #${i + 1}`));
      const del = El('button', 'vfxMiniBtn', '×');
      del.type = 'button';
      del.title = '删除此爆发';
      del.addEventListener('click', () => {
        const bursts = Clone(this.Read().modules.emission.bursts);
        bursts.splice(i, 1);
        Patch('emission', 'bursts', bursts);
        this.Show();
      });
      head.appendChild(del);
      card.appendChild(head);
      const grid = El('div', 'vfxBurstGrid');
      const MiniNum = (tag, val, min, max, step, onNum) => {
        const wrap = El('div', 'vfxMiniField');
        const lbl = El('span', '', tag);
        const inp = El('input');
        inp.type = 'number'; inp.min = String(min); inp.max = String(max); inp.step = String(step); inp.value = String(val);
        inp.addEventListener('change', () => { const n = Number(inp.value); if (Number.isFinite(n)) onNum(n); });
        BindScrub(lbl, inp, onNum, { min, max, step });
        wrap.append(lbl, inp);
        grid.appendChild(wrap);
      };
      MiniNum('T', burst.time, 0, m.main.duration, 0.01, (n) => { const b = Clone(this.Read().modules.emission.bursts); b[i].time = n; Patch('emission', 'bursts', b); });
      MiniNum('次', burst.cycles || 1, 1, 100, 1, (n) => { const b = Clone(this.Read().modules.emission.bursts); b[i].cycles = n; Patch('emission', 'bursts', b); });
      MiniNum('隔', burst.repeatInterval || 0, 0, 120, 0.05, (n) => { const b = Clone(this.Read().modules.emission.bursts); b[i].repeatInterval = n; Patch('emission', 'bursts', b); });
      card.appendChild(grid);
      CurveField(card, '数量', burst.count, (n) => { const b = Clone(this.Read().modules.emission.bursts); b[i].count = n; Patch('emission', 'bursts', b); }, { min: 0, max: 4096, step: 1 });
      emission.appendChild(card);
    }
    ButtonRow(emission, [
      { label: '添加爆发', onClick: () => { Patch('emission', 'bursts', [...m.emission.bursts, { time: 0, count: 12 }]); this.Show(); } },
      { label: '清空爆发', onClick: () => { Patch('emission', 'bursts', []); this.Show(); } },
    ]);

    // 3. Shape（按形状类型仅展示有效几何参数，同 Unity）
    const { body: shape } = Card('shape', '形状', 'Shape', { badge: m.shape.type });
    SelectField(shape, '发射形状', ['point', 'circle', 'cone', 'sphere', 'box', 'beam'], m.shape.type, (value) => { Patch('shape', 'type', value); this.Show(); });
    if (['circle', 'cone', 'sphere', 'beam'].includes(m.shape.type)) {
      Num(shape, 'shape', 'radius', '半径 (m)', { min: 0, max: 50 });
    }
    if (m.shape.type === 'cone') {
      Num(shape, 'shape', 'angle', '锥角 (°)', { min: 0, max: 90, step: 1 });
    }
    if (m.shape.type === 'box') {
      Vector3Field(shape, '盒体 (m)', m.shape.box, (i, value) => {
        const box = [...this.Read().modules.shape.box]; box[i] = value; Patch('shape', 'box', box);
      }, { min: 0, max: 100 });
    }
    if (m.shape.type === 'beam') {
      Vector3Field(shape, '光束方向', m.shape.direction, (i, value) => {
        const dir = [...this.Read().modules.shape.direction]; dir[i] = value; Patch('shape', 'direction', dir);
      }, { min: -1, max: 1 });
    }

    // 4. Velocity over Lifetime
    const { body: velocity } = Card('velocityOverLifetime', '速度', 'Velocity');
    for (const axis of ['x', 'y', 'z']) Curve(velocity, 'velocityOverLifetime', axis, `${axis.toUpperCase()} (m/s)`, { min: -10, max: 10 });

    // 5. Force over Lifetime
    const { body: force } = Card('forceOverLifetime', '力与阻尼', 'Force');
    Vector3Field(force, '加速度', [m.forceOverLifetime.x, m.forceOverLifetime.y, m.forceOverLifetime.z], (i, value) => {
      Patch('forceOverLifetime', ['x', 'y', 'z'][i], value);
    }, { min: -100, max: 100, paths: ['forceOverLifetime.x', 'forceOverLifetime.y', 'forceOverLifetime.z'] });
    Num(force, 'forceOverLifetime', 'drag', '阻尼', { min: 0, max: 20 });

    // 6. Size over Lifetime
    const { body: size } = Card('sizeOverLifetime', '尺寸', 'Size');
    Curve(size, 'sizeOverLifetime', 'curve', '尺寸曲线', { min: 0, max: 4 });

    // 7. Color over Lifetime（Unity/UE 式实时可视化渐变条 + 色标编辑）
    const { body: color, gradPreview } = Card('colorOverLifetime', '颜色', 'Color', { grad: m.colorOverLifetime.gradient });
    const gradEditor = El('div', 'vfxGradEditor');
    color.appendChild(gradEditor);

    const RenderGradient = () => {
      gradEditor.replaceChildren();
      const keys = Clone(this.Read()?.modules?.colorOverLifetime?.gradient || m.colorOverLifetime.gradient);
      if (this.selectedStop >= keys.length) this.selectedStop = Math.max(0, keys.length - 1);
      const css = GradientCss(keys);
      if (gradPreview) gradPreview.style.background = css;

      const head = El('div', 'vfxGradHead');
      const barWrap = El('div', 'vfxGradBarWrap');
      const bar = El('div', 'vfxGradBar');
      bar.title = '点击渐变条添加色标';
      const fill = El('div', 'vfxGradBarFill');
      fill.style.background = css;
      bar.appendChild(fill);
      const pins = El('div', 'vfxGradPins');
      barWrap.append(bar, pins);

      bar.addEventListener('click', (event) => {
        if (keys.length >= 32) return;
        const r = bar.getBoundingClientRect();
        const t = Math.max(0.01, Math.min(0.99, Number(((event.clientX - r.left) / Math.max(1, r.width)).toFixed(3))));
        const next = Clone(keys);
        next.push([t, EvaluateGradient(next, t)]);
        next.sort((a, b) => a[0] - b[0]);
        this.selectedStop = next.findIndex((k) => k[0] === t);
        Patch('colorOverLifetime', 'gradient', next);
        RenderGradient();
      });

      keys.forEach((key, i) => {
        const pin = El('button', `vfxGradPin${i === this.selectedStop ? ' on' : ''}`);
        pin.type = 'button';
        pin.style.left = `${(Math.max(0, Math.min(1, key[0])) * 100).toFixed(1)}%`;
        pin.style.setProperty('--pin-color', RgbaPreview(key[1]));
        pin.title = `${Math.round(key[0] * 100)}%`;
        pin.addEventListener('click', (e) => { e.stopPropagation(); this.selectedStop = i; RenderGradient(); });
        pins.appendChild(pin);
      });

      const addBtn = El('button', 'vfxMiniBtn', '+ 色标');
      addBtn.type = 'button';
      addBtn.addEventListener('click', () => {
        if (keys.length >= 32) return;
        let idx = 1;
        for (let i = 2; i < keys.length; i += 1) if (keys[i][0] - keys[i - 1][0] > keys[idx][0] - keys[idx - 1][0]) idx = i;
        const t = Number(((keys[idx][0] + keys[idx - 1][0]) / 2).toFixed(3));
        const next = Clone(keys);
        next.splice(idx, 0, [t, EvaluateGradient(next, t)]);
        this.selectedStop = idx;
        Patch('colorOverLifetime', 'gradient', next);
        RenderGradient();
      });
      head.append(barWrap, addBtn);
      gradEditor.appendChild(head);

      // 当前选中色标的紧凑单行编辑器
      const selIdx = this.selectedStop;
      const sel = keys[selIdx];
      if (sel) {
        const stopBox = El('div', 'vfxGradStopEdit');
        const top = El('div', 'vfxGradStopTop');
        const posWrap = El('div', 'vfxMiniField');
        const posLbl = El('span', '', '位置');
        const posIn = El('input');
        posIn.type = 'number'; posIn.min = '0'; posIn.max = '1'; posIn.step = '0.01';
        posIn.value = String(Number(sel[0].toFixed(2)));
        posIn.setAttribute('aria-label', '寿命比例');
        const SetPos = (v) => {
          const next = Clone(this.Read().modules.colorOverLifetime.gradient);
          next[selIdx][0] = Math.max(0, Math.min(1, v));
          next.sort((a, b) => a[0] - b[0]);
          Patch('colorOverLifetime', 'gradient', next);
          if (gradPreview) gradPreview.style.background = GradientCss(next);
          fill.style.background = GradientCss(next);
        };
        posIn.addEventListener('change', () => { const n = Number(posIn.value); if (Number.isFinite(n)) { SetPos(n); RenderGradient(); } });
        BindScrub(posLbl, posIn, SetPos, { min: 0, max: 1, step: 0.01 });
        posWrap.append(posLbl, posIn);
        top.appendChild(posWrap);

        if (selIdx > 0 && selIdx < keys.length - 1) {
          const delBtn = El('button', 'vfxMiniBtn', '删除');
          delBtn.type = 'button';
          delBtn.addEventListener('click', () => {
            const next = Clone(this.Read().modules.colorOverLifetime.gradient);
            next.splice(selIdx, 1);
            this.selectedStop = Math.max(0, selIdx - 1);
            Patch('colorOverLifetime', 'gradient', next);
            RenderGradient();
          });
          top.appendChild(delBtn);
        }
        stopBox.appendChild(top);
        ColorField(stopBox, '', sel[1], (col) => {
          const next = Clone(this.Read().modules.colorOverLifetime.gradient);
          next[selIdx][1] = col;
          Patch('colorOverLifetime', 'gradient', next);
          const updatedCss = GradientCss(next);
          fill.style.background = updatedCss;
          if (gradPreview) gradPreview.style.background = updatedCss;
        });
        gradEditor.appendChild(stopBox);
      }
    };
    RenderGradient();

    // 8. Rotation over Lifetime
    const { body: rotation } = Card('rotationOverLifetime', '旋转', 'Rotation');
    Curve(rotation, 'rotationOverLifetime', 'angularVelocity', '角速度 (rad/s)', { min: -6.28, max: 6.28 });

    // 9. Noise
    const { body: noise } = Card('noise', '扰动', 'Noise');
    Curve(noise, 'noise', 'strength', '强度 (m)', { min: 0, max: 2 });
    Num(noise, 'noise', 'frequency', '频率', { min: 0.01, max: 20 });
    Num(noise, 'noise', 'scrollSpeed', '流速', { min: 0, max: 20 });

    // 10. Renderer
    const { body: renderer } = Card('renderer', '渲染', 'Renderer', { badge: m.renderer.mode === 'material' ? (profile || 'material') : m.renderer.mode });
    if (m.renderer.mode !== 'material') {
      SelectField(renderer, '模式', ['flame', 'smoke', 'ember', 'mote', 'windowMote', 'volume', 'bakedVolume'], m.renderer.mode, (value) => { Patch('renderer', 'mode', value); this.Show(); });
    }
    Num(renderer, 'renderer', 'aspect', '纵横比', { min: 0.1, max: 10 });
    Num(renderer, 'renderer', 'softRange', '软交界 (m)', { min: 0, max: 5 });
    if (['volume', 'bakedVolume'].includes(m.renderer.mode) || ['smoke', 'sourceSmoke', 'bombSmoke'].includes(profile)) {
      Num(renderer, 'renderer', 'density', '体积密度', { min: 0.01, max: 32 });
    }
    if (m.renderer.mode === 'volume') {
      SelectField(renderer, '密度场', [{ value: 'smoke', label: '卷曲烟团' }, { value: 'soil', label: '细土悬尘' }], m.renderer.densityStyle, (value) => Patch('renderer', 'densityStyle', value));
      Num(renderer, 'renderer', 'nearFade', '近处渐隐 (m)', { min: 0, max: 30 });
    }
    if (['mote', 'bakedVolume'].includes(m.renderer.mode)) {
      Vector3Field(renderer, '范围 (m)', m.renderer.bounds, (i, value) => {
        const bounds = [...this.Read().modules.renderer.bounds]; bounds[i] = value; Patch('renderer', 'bounds', bounds);
      }, { min: 0.01, max: 1000 });
    }
    if (m.renderer.mode === 'bakedVolume') {
      SelectField(renderer, '三维场', Object.keys(PARTICLE_VOLUME_ASSETS), m.renderer.volumeAsset, (value) => Patch('renderer', 'volumeAsset', value));
      Num(renderer, 'renderer', 'volumeSpeed', '播放速度', { min: 0, max: 8 });
      const volFlags = El('div', 'vfxCheckGrid');
      CheckControl(volFlags, '循环序列', m.renderer.volumeLoop, (value) => Patch('renderer', 'volumeLoop', value));
      renderer.appendChild(volFlags);
      Num(renderer, 'renderer', 'volumeYaw', '朝向 (rad)', { min: -6.28, max: 6.28 });
      Num(renderer, 'renderer', 'emissionStrength', '火焰发光', { min: 0, max: 100 });
      Num(renderer, 'renderer', 'flameExtinction', '热区消光', { min: 0, max: 100 });
    }
  }
}
