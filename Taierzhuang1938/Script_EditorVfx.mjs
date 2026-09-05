// 特效预览编辑器：直接驱动正片的 VfxSystem，不维护第二套“看起来差不多”的假预览。
// 持续效果来自 SCENE_EFFECTS，因而这里确认过的火/烟参数可以原样进场景关卡 JSON。

import * as THREE from "three";
import { Panel, Section, Slider, Toggle, ButtonRow, Facts, Note, ListBox }
  from "./Script_EditorUi.mjs";
import { SCENE_EFFECTS } from "./Script_Vfx.mjs";

const INSTANT_EFFECTS = [
  { id: "ExplosionGrenade", name: "爆炸 · 手榴弹", note: "半径 4 m", run: (v, s) => v.Explosion({ x: 0, y: 0.12, z: 0 }, { radius: 4 * s, kind: "grenade", groundY: 0 }) },
  { id: "ExplosionMortar", name: "爆炸 · 掷弹筒", note: "半径 7 m", run: (v, s) => v.Explosion({ x: 0, y: 0.16, z: 0 }, { radius: 7 * s, kind: "launcher", groundY: 0 }) },
  { id: "ExplosionShell", name: "爆炸 · 炮弹", note: "半径 11 m", run: (v, s) => v.Explosion({ x: 0, y: 0.18, z: 0 }, { radius: 11 * s, kind: "shell", groundY: 0 }) },
  { id: "MuzzleRifle", name: "枪口焰 · 步枪", note: "两帧焰 + 枪烟", run: (v, s) => v.MuzzleFlash(new THREE.Vector3(0, 1.05, 0), new THREE.Vector3(0, 0, -1), { scale: s, kind: "rifle" }) },
  { id: "MuzzleMg", name: "枪口焰 · 机枪", note: "连续武器单次反馈", run: (v, s) => v.MuzzleFlash(new THREE.Vector3(0, 1.05, 0), new THREE.Vector3(0, 0, -1), { scale: s, kind: "lmg" }) },
  { id: "ImpactBrick", name: "命中 · 砖墙", note: "砖粉、碎块与弹孔", run: (v) => v.Impact(new THREE.Vector3(0, 0.85, 0), new THREE.Vector3(0, 0, -1), "brick") },
  { id: "ImpactDirt", name: "命中 · 泥土", note: "土扬尘与碎块", run: (v) => v.Impact(new THREE.Vector3(0, 0.05, 0), new THREE.Vector3(0, 1, 0), "dirt") },
  { id: "ImpactWood", name: "命中 · 木材", note: "木屑与粉尘", run: (v) => v.Impact(new THREE.Vector3(0, 0.85, 0), new THREE.Vector3(0, 0, -1), "wood") },
  { id: "ImpactMetal", name: "命中 · 金属", note: "火星与跳弹", run: (v) => v.Impact(new THREE.Vector3(0, 0.85, 0), new THREE.Vector3(0, 0, -1), "metal") },
  { id: "Tracer", name: "曳光弹", note: "中方暖白弹道", run: (v) => v.Tracer(new THREE.Vector3(-4, 1.1, 0), new THREE.Vector3(4, 1.1, 0), { speed: 90, kind: "nra" }) },
  { id: "Blood", name: "血雾", note: "命中反馈：雾芯+溅射+血滴+地渍", run: (v, s) => v.Blood(new THREE.Vector3(0, 1.0, 0), new THREE.Vector3(0, 0, -1), s) },
  { id: "Incoming", name: "炮弹落点预警", note: "准星贴图 + 收缩环 + 落点尘", run: (v) => v.IncomingMarker(new THREE.Vector3(0, 0.03, 0), 2.6, { radius: 11 }) },
];

const CONTINUOUS = Object.entries(SCENE_EFFECTS).map(([id, effect]) => ({
  id, name: effect.name, note: effect.note, continuous: true,
}));
const ALL_EFFECTS = [...CONTINUOUS, ...INSTANT_EFFECTS];

export class VfxEditor {
  static id = "vfx";
  static label = "特效预览";
  static hint = "查看火焰、烟雾、爆炸、命中、枪口焰与曳光";

  constructor(host) {
    this.host = host;
    this.studio = host.studio;
    this.cameraMode = "studio";
    this.panel = null;
    this.effectId = "FireMedium";
    this.handle = 0;
    this.scale = 1;
    this.loop = true;
    this.loopInterval = 2.5;
    this.loopTimer = 0;
    this.playing = false;
    this.savedWind = null;
    this.savedVfxVisible = true;
    this.savedSources = null;
    this.savedNextSourceId = 1;
    this.savedParticles = null;
    this.savedDustVisible = null;
    this.wind = new THREE.Vector3();
  }

  Enter(root) {
    const vfx = this.host.vfx;
    this.savedWind = vfx.wind.clone();
    this.wind.copy(this.savedWind);
    this.savedVfxVisible = vfx.root.visible;
    // 预览必须是隔离的：现关烟柱不能在摄影棚期间偷偷推进，预览的弹孔/爆炸也
    // 不能关掉工具后留在正片原点。保存池与持续源，退出时逐字节还原。
    this.savedSources = vfx.smokeSources;
    this.savedNextSourceId = vfx.nextSourceId;
    this.savedParticles = this.CaptureParticles(vfx);
    for (const source of this.savedSources.values()) vfx.DetachSourceLight(source);
    vfx.smokeSources = new Map();
    for (const pool of Object.values(vfx.pools)) pool.Clear();
    vfx.debris.Clear();
    if (vfx.dust) {
      this.savedDustVisible = vfx.dust.mesh.visible;
      vfx.dust.mesh.visible = false;
    }
    this.studio.Open(this.host.hideInStudio);
    // WorldMask 会把场景直属的 VfxRoot 一起藏掉；预览器明确把它列为展品。
    vfx.root.visible = true;
    this.studio.SetGridVisible(true);
    this.studio.Frame(3.4, 8.5);
    this.panel = Panel({
      title: "特效预览编辑器", sub: "",
      variant: "work", onClose: () => this.host.Close(),
    });
    root.appendChild(this.panel.root);
    this.BuildUi(this.panel.body);
    this.Play();
    return this;
  }

  Exit() {
    this.Stop();
    const vfx = this.host.vfx;
    if (this.savedSources) {
      vfx.smokeSources = this.savedSources;
      for (const source of this.savedSources.values()) vfx.AttachSourceLight(source);
    }
    vfx.nextSourceId = this.savedNextSourceId;
    if (this.savedParticles) this.RestoreParticles(vfx, this.savedParticles);
    if (vfx.dust && this.savedDustVisible != null) vfx.dust.mesh.visible = this.savedDustVisible;
    if (this.savedWind) vfx.SetWind(this.savedWind);
    if (this.panel) this.panel.root.remove();
    this.panel = null;
    this.studio.Close();
    vfx.root.visible = this.savedVfxVisible;
    this.savedSources = null;
    this.savedParticles = null;
    this.savedDustVisible = null;
  }

  CaptureParticles(vfx) {
    const Capture = (pool) => ({
      cursor: pool.cursor,
      deathTime: pool.deathTime.slice(),
      arrays: Object.fromEntries(Object.entries(pool.arrays)
        .map(([name, array]) => [name, array.slice()])),
    });
    return {
      pools: Object.fromEntries(Object.entries(vfx.pools)
        .map(([name, pool]) => [name, Capture(pool)])),
      debris: Capture(vfx.debris),
      lastExplosionSprite: vfx.lastExplosionSprite,
      lastMuzzleProfile: vfx.lastMuzzleProfile,
    };
  }

  RestoreParticles(vfx, snapshot) {
    const Restore = (pool, saved) => {
      if (!pool || !saved) return;
      pool.cursor = saved.cursor;
      pool.deathTime.set(saved.deathTime);
      for (const [name, array] of Object.entries(saved.arrays)) pool.arrays[name]?.set(array);
      pool.dirtyMin = 0;
      pool.dirtyMax = pool.capacity - 1;
      pool.Flush(vfx.time);
    };
    for (const [name, saved] of Object.entries(snapshot.pools)) Restore(vfx.pools[name], saved);
    Restore(vfx.debris, snapshot.debris);
    vfx.lastExplosionSprite = snapshot.lastExplosionSprite;
    vfx.lastMuzzleProfile = snapshot.lastMuzzleProfile;
  }

  BuildUi(body) {
    const library = Section(body, "特效库");
    this.effectList = ListBox(library, {
      height: 260,
      onPick: (id) => { this.effectId = id; this.Play(); },
    });
    this.effectList.Fill(ALL_EFFECTS.map((effect) => ({
      id: effect.id, name: effect.name,
      tail: effect.continuous ? "持续" : "瞬时", title: effect.note,
    })));
    this.effectList.Select(this.effectId);

    const playback = Section(body, "播放与环境");
    const buttons = ButtonRow(playback, [
      { label: "播放", onClick: () => this.Play() },
      { label: "停止", onClick: () => this.Stop() },
    ]);
    if (buttons.children[0]) buttons.children[0].dataset.vfxAction = "play";
    if (buttons.children[1]) buttons.children[1].dataset.vfxAction = "stop";
    Toggle(playback, "瞬时效果自动循环", this.loop, (on) => { this.loop = on; this.loopTimer = 0; });
    Slider(playback, {
      label: "整体缩放", min: 0.25, max: 3, step: 0.05, value: this.scale,
      onInput: (value) => { this.scale = value; if (this.IsContinuous()) this.Play(); },
    });
    Slider(playback, {
      label: "循环间隔", min: 0.4, max: 8, step: 0.1, value: this.loopInterval,
      format: (value) => `${value.toFixed(1)} s`, onInput: (value) => { this.loopInterval = value; },
    });
    Slider(playback, {
      label: "风 X", min: -4, max: 4, step: 0.1, value: this.wind.x,
      format: (value) => value.toFixed(1), onInput: (value) => { this.wind.x = value; this.ApplyWind(); },
    });
    Slider(playback, {
      label: "风 Z", min: -4, max: 4, step: 0.1, value: this.wind.z,
      format: (value) => value.toFixed(1), onInput: (value) => { this.wind.z = value; this.ApplyWind(); },
    });
    Toggle(playback, "米格与地台", true, (on) => this.studio.SetGridVisible(on));

    const evidence = Section(body, "取证");
    this.facts = Facts(evidence, ["当前效果", "Vefects 纹理"]);

  }

  IsContinuous() { return !!SCENE_EFFECTS[this.effectId]; }

  ApplyWind() { this.host.vfx.SetWind(this.wind); }

  Stop() {
    if (this.handle) this.host.vfx.RemoveSceneEffect(this.handle);
    this.handle = 0;
    this.playing = false;
    this.loopTimer = 0;
  }

  Play() {
    this.Stop();
    const vfx = this.host.vfx;
    if (this.IsContinuous()) {
      this.handle = vfx.SceneEffect({ x: 0, y: 0.04, z: 0 }, this.effectId, { scale: this.scale });
      this.playing = !!this.handle;
    } else {
      const effect = INSTANT_EFFECTS.find((entry) => entry.id === this.effectId);
      if (effect) effect.run(vfx, this.scale);
      this.playing = !!effect;
    }
    this.loopTimer = 0;
  }

  Update(dt) {
    const step = Math.max(0, Math.min(0.1, dt || 0));
    if (!this.IsContinuous() && this.playing && this.loop) {
      this.loopTimer += step;
      if (this.loopTimer >= this.loopInterval) this.Play();
    }
    // 编辑器接管帧循环后，Main 不再更新特效；这里显式推进正片的同一个系统。
    this.host.vfx.Update(step, this.host.camera, this.host.vfx.time + step);
    this.facts.Set("当前效果", (ALL_EFFECTS.find((entry) => entry.id === this.effectId) || {}).name || this.effectId);
    this.facts.Set("Vefects 纹理", `${this.host.vfx.loadedVefectsMasks.size} / 5`,
      this.host.vfx.loadedVefectsMasks.size >= 4 ? "good" : "warn");
    this.facts.Set("持续源", this.handle ? `#${this.handle}` : "—");
    this.facts.Set("粒子预算", this.host.vfx.budget);
    this.facts.Set("风", `${this.wind.x.toFixed(1)}, ${this.wind.z.toFixed(1)} m/s`);
  }
}

export default VfxEditor;
