// Observes the production controller; never supplies movement velocities or physics.
import * as THREE from 'three';
import { PlayerMovementReference, StanceLabel } from './Script_Player.mjs';
import { TRAVERSAL } from './Data_Traversal.mjs';
import { MOVEMENT_RANGE_STATIONS, MOVEMENT_FIXTURES, MOVEMENT_RUNWAY } from './Data_MovementRange.mjs';
import { T } from './Script_Text.mjs';
// 动作种类的显示名。键的可变部分是 Player 那边的动作 id（jump / runJump / vault / mantle）。
const KindKey = kind => 'range.movement.kind.' + kind;
const M = n => Number.isFinite(n) ? n.toFixed(2) + ' m' : '—';
export class MovementRange {
  constructor(host) {
    this.host = host; this.references = PlayerMovementReference(); this.station = 'Jump'; this.history = []; this.best = {}; this.active = null; this.clock = 0;
    this.previous = this.Snapshot(); this.lastJump = host.player.jump.count; this.lastVault = host.player.vaultCount;
    this.markers = [];
    for (const color of [0x27a7d3, 0xf9da69, 0xf9da69]) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 0.016, 0.06), new THREE.MeshBasicMaterial({ color, depthWrite: false }));
      mesh.visible = false; host.scene.add(mesh); this.markers.push(mesh);
    }
    this.BuildPanel();
    this.OnKey = event => {
      if (!host.CanUse() || event.repeat || /INPUT|TEXTAREA|SELECT/.test(event.target?.tagName)) return;
      if (event.code === 'Home') { event.preventDefault(); this.GoTo(this.station); }
      if (event.code === 'PageDown' || event.code === 'PageUp') {
        event.preventDefault(); const i = MOVEMENT_RANGE_STATIONS.findIndex(s => s.id === this.station);
        this.GoTo(MOVEMENT_RANGE_STATIONS[(i + (event.code === 'PageDown' ? 1 : 4)) % 5].id);
      }
    };
    window.addEventListener('keydown', this.OnKey);
    this.api = { State: () => this.State(), GoTo: id => this.GoTo(id), Reset: () => this.GoTo(this.station),
      Clear: () => this.Clear(), Fixtures: () => structuredClone(MOVEMENT_FIXTURES),
      Stations: () => structuredClone(MOVEMENT_RANGE_STATIONS) };
  }
  Snapshot() {
    const p = this.host.player;
    return { x: p.position.x, y: p.position.y, z: p.position.z, grounded: p.grounded, stance: p.stance,
      speed: Math.hypot(p.velocity.x, p.velocity.z), stamina: p.stamina };
  }
  State() {
    return { environment: { external: this.host.battlefield.externalProps, trim: this.host.battlefield.trimProps }, station: this.station, live: this.Snapshot(), last: this.history.at(-1) || null,
      best: structuredClone(this.best), history: structuredClone(this.history),
      active: this.active ? structuredClone(this.active) : null, references: PlayerMovementReference(), traversal: { ...TRAVERSAL } };
  }
  GoTo(id) {
    const f = MOVEMENT_FIXTURES.find(f => f.id === id), s = MOVEMENT_RANGE_STATIONS.find(s => s.id === (f?.station || id));
    if (!s) return false;
    this.station = s.id; this.active = null;
    const p = this.host.player;
    // Spawn is the shared, collision-aware reset and restores health/stamina.
    p.Spawn(f ? f.x : s.x, f ? f.z + f.d / 2 + 1.5 : s.z, 0);
    p.sprint = 0; p.ads = 0; p.wantAds = false;
    this.previous = this.Snapshot(); this.lastJump = p.jump.count; this.lastVault = p.vaultCount;
    this.markers[0].visible = false; this.markers[1].visible = false;
    this.PaintPanel(); return true;
  }
  Clear() {
    this.history = []; this.best = {}; this.active = null;
    for (const marker of this.markers) marker.visible = false;
    this.previous = this.Snapshot(); this.PaintPanel();
  }
  Update(dt) {
    this.clock += dt;
    const p = this.host.player, now = this.Snapshot();
    this.panel.hidden = !this.host.CanUse();
    const nearest = MOVEMENT_RANGE_STATIONS.reduce((a, b) => Math.hypot(a.x - now.x, a.z - now.z) < Math.hypot(b.x - now.x, b.z - now.z) ? a : b);
    this.station = nearest.id;
    const newVault = p.vaultCount !== this.lastVault, newJump = p.jump.count !== this.lastJump;
    if (newVault || newJump) {
      const kind = newVault ? p.vault.kind : p.jump.runK > 0 ? 'runJump' : 'jump';
      const from = newVault ? { x: p._vaultFrom.x, y: p._vaultFrom.y, z: p._vaultFrom.z } : { ...this.previous };
      this.active = { kind, from, started: this.clock - dt, peakY: Math.max(from.y, now.y),
        obstacleHeightM: newVault ? p.vault.rise : null, takeoffSpeedMps: this.previous.speed,
        runK: newJump ? p.jump.runK : null, station: this.station,
        standard: !p.debug.fastMove && !p.debug.noCollision && p.carrySpeedScale === 1 };
      this.markers[0].position.set(from.x, from.y + 0.025, from.z); this.markers[0].scale.x = 2;
      this.markers[0].visible = true; this.markers[1].visible = false;
    }
    this.lastJump = p.jump.count; this.lastVault = p.vaultCount;
    if (this.active) {
      this.active.peakY = Math.max(this.active.peakY, now.y);
      this.active.standard &&= !p.debug.fastMove && !p.debug.noCollision && p.carrySpeedScale === 1;
      if (!p.alive || this.clock - this.active.started > 10) this.active = null;
      else if (now.grounded && !p.vault.active) this.Finish(now);
    }
    this.previous = now;
    if (this.clock >= (this.nextPaint || 0)) { this.nextPaint = this.clock + 0.1; this.PaintPanel(); }
  }
  Finish(now) {
    const a = this.active, distanceM = Math.hypot(now.x - a.from.x, now.z - a.from.z);
    const sameLevel = Math.abs(now.y - a.from.y) < 0.08;
    const crossed = MOVEMENT_FIXTURES.filter(f => f.kind === 'height'
      && a.from.z > f.z + f.d / 2 && now.z < f.z - f.d / 2
      && Math.abs(a.from.x - f.x) < f.w / 2 && Math.abs(now.x - f.x) < f.w / 2);
    const record = { kind: a.kind, riseM: Math.max(0, a.peakY - a.from.y), distanceM,
      obstacleHeightM: a.obstacleHeightM, crossedHeightM: crossed.length ? Math.max(...crossed.map(f => f.h)) : null,
      durationS: this.clock - a.started, takeoffSpeedMps: a.takeoffSpeedMps, runK: a.runK,
      from: a.from, to: { x: now.x, y: now.y, z: now.z }, sameLevel, standard: a.standard };
    this.history.push(record); if (this.history.length > 50) this.history.shift();
    if (a.standard) {
      const best = this.best[a.kind] ||= { riseM: 0, distanceM: 0, obstacleHeightM: 0, crossedHeightM: 0 };
      best.riseM = Math.max(best.riseM, record.riseM);
      best.obstacleHeightM = Math.max(best.obstacleHeightM, record.obstacleHeightM || 0);
      best.crossedHeightM = Math.max(best.crossedHeightM, record.crossedHeightM || 0);
      // Only flat, unobstructed runway landings enter the running-distance record.
      const r = MOVEMENT_RUNWAY;
      const inRunway = [a.from, now].every(v => Math.abs(v.x - r.x) < r.width / 2 && v.z >= r.endZ && v.z <= r.startZ && Math.abs(v.y) < 0.08);
      if (sameLevel && (a.kind !== 'runJump' || inRunway)) best.distanceM = Math.max(best.distanceM, distanceM);
      if (a.kind === 'runJump' && best.distanceM > 0) {
        const mark = this.markers[2]; mark.position.set(r.x, 0.045, r.zeroZ - best.distanceM);
        mark.scale.x = r.width; mark.visible = true;
      }
    }
    this.markers[1].position.set(now.x, now.y + 0.025, now.z); this.markers[1].scale.x = 2; this.markers[1].visible = true;
    this.active = null; this.PaintPanel();
  }
  BuildPanel() {
    this.style = document.createElement('style');
    this.style.textContent = '#movementRangePanel{position:fixed;z-index:35;right:18px;top:86px;width:292px;max-height:calc(100vh - 300px);overflow:auto;padding:14px;color:#e7eef0;background:rgba(24,36,45,.91);border:1px solid #91a2ad;border-radius:5px;font:13px/1.6 sans-serif;pointer-events:auto}#movementRangePanel[hidden],body:has(#menu.mnRoot:not(.off)) #movementRangePanel{display:none}#movementRangePanel summary{font-size:16px;font-weight:700;cursor:pointer}#movementRangePanel p{margin:7px 0}#movementRangePanel button{background:#394e5c;color:white;border:1px solid #718895;border-radius:3px;padding:4px 7px;margin:3px;font:inherit;cursor:pointer}#movementRangePanel .movementValues{font-variant-numeric:tabular-nums;color:#f6db93;white-space:pre-line}#movementRangePanel .movementHelp{color:#b6c5cc;font-size:12px}@media(max-width:700px){#movementRangePanel{right:8px;top:75px;width:235px;font-size:11px;padding:8px;max-height:36vh}}';
    document.head.append(this.style);
    this.panel = document.createElement('details'); this.panel.id = 'movementRangePanel'; this.panel.open = window.innerWidth > 700; this.panel.hidden = !this.host.CanUse();
    // `<br>` 是排版不是文案：四行分别登记，代码把它们串起来。
    const help = [T('range.movement.helpMove'), T('range.movement.helpStance'),
      T('range.movement.helpReset'), T('range.movement.helpAlt')].join('<br>');
    this.panel.innerHTML = `<summary>${T('range.movement.panelTitle')}</summary><p class="movementStation"></p><div class="movementValues"></div><p class="movementHelp">${help}</p><div class="movementStations"></div><button data-reset>${T('range.movement.btnReset')}</button><button data-clear>${T('range.movement.btnClear')}</button><p class="movementHelp">${T('range.movement.panelNote')}</p>`;
    const buttons = this.panel.querySelector('.movementStations');
    for (const s of MOVEMENT_RANGE_STATIONS) { const button = document.createElement('button'); button.textContent = s.name; button.dataset.station = s.id; button.onclick = () => { if (this.host.CanUse()) this.GoTo(s.id); button.blur(); }; buttons.append(button); }
    this.panel.querySelector('[data-reset]').onclick = () => { if (this.host.CanUse()) this.GoTo(this.station); };
    this.panel.querySelector('[data-clear]').onclick = () => { if (this.host.CanUse()) this.Clear(); };
    document.body.append(this.panel); this.PaintPanel();
  }
  PaintPanel() {
    const p = this.host.player, last = this.history.at(-1), ref = this.references;
    this.panel.querySelector('.movementStation').textContent = MOVEMENT_RANGE_STATIONS.find(s => s.id === this.station)?.name;
    // 每一行都是完整的一句进表：这里只把量好的数交进去，不在调用点接中文。
    const lines = [(p.debug.fastMove || p.debug.noCollision) ? T('range.movement.debugOn') : '',
      T('range.movement.live', { stance: StanceLabel(p.stance),
        speed: Math.hypot(p.velocity.x, p.velocity.z).toFixed(2), stamina: Math.round(p.stamina * 100) }),
      T('range.movement.eye', { eye: M(p.eyeHeight), foot: M(p.position.y) }),
      last ? T('range.movement.last', { kind: T(KindKey(last.kind)), rise: M(last.riseM), distance: M(last.distanceM) })
        : T('range.movement.prompt'),
      last?.obstacleHeightM ? T('range.movement.obstacle', { height: M(last.obstacleHeightM) }) : '',
      T('range.movement.bestRise', { standing: M(this.best.jump?.riseM), running: M(this.best.runJump?.riseM) }),
      T('range.movement.bestRun', { distance: M(this.best.runJump?.distanceM || undefined) }),
      T('range.movement.bestVault', { vault: M(this.best.vault?.obstacleHeightM || undefined),
        mantle: M(this.best.mantle?.obstacleHeightM || undefined) }),
      T('range.movement.crossed', { height: M(Math.max(this.best.jump?.crossedHeightM || 0,
        this.best.runJump?.crossedHeightM || 0) || undefined) }),
      T('range.movement.limits', { vault: M(TRAVERSAL.vaultMax), mantle: M(TRAVERSAL.mantleMax) }),
      T('range.movement.theory', { standing: M(ref.standingRiseM), running: M(ref.runningRiseM) })];
    this.panel.querySelector('.movementValues').textContent = lines.filter(Boolean).join('\n');
  }
  Dispose() {
    window.removeEventListener('keydown', this.OnKey); this.panel.remove(); this.style.remove();
    for (const marker of this.markers) { this.host.scene.remove(marker); marker.geometry.dispose(); marker.material.dispose(); }
  }
}
