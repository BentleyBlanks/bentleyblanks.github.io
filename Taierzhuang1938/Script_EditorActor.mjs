// 人物动作编辑器：把 Script_Actor 的姿态系统单独拎到摄影棚里看。
//
// ## 这个项目没有「动画剪辑」这种东西
// Actor 是**程序化姿态**：没有骨骼动画、没有 AnimationClip、没有关键帧文件。
// 每一帧的姿势由 Actor.Update(dt, state) 里那个 state 对象算出来 ——
//   moveSpeed / strafe / crouch / prone / aim / firing / throwing / melee /
//   hurt / dying / dead / lookYaw / lookPitch
// 十三个连续量的组合就是全部「动作」。
//
// 所以这个编辑器的「动作列表」不是资产清单，是**驱动量的配方表**（CLIPS）：
// 每条 clip 就是一个 t → state 的函数。这才是这套系统里可预览的真实单位；
// 列一堆并不存在的 .anim 名字才是骗人。
//
// ## 能读出什么
//   · 换模有没有真的生效（meshSource=model 还是 box —— 静默退回是最常见的事故）
//   · 步频与步幅对不对（1 m 米格 + 支撑相不打滑）
//   · 持枪挂点、贴腮、拉栓时右手的行程
//   · 五个 kind 站一排时的身高差（1.60—1.68 m）与装具差

import * as THREE from "three";
import { Panel, Section, Slider, Chips, Select, Toggle, ButtonRow, Facts, Note, ListBox }
  from "./Script_EditorUi.mjs";
import { WEAPONS } from "./Data_Weapons.mjs";

/** 人物 kind → 中文名。KIND_SPEC 的键在 Script_Actor 里，这里只做展示名。 */
const KINDS = [
  { id: "nra", name: "川军步兵", note: "布军帽 + 青天白日帽徽，无钢盔，绑腿 + 露趾草鞋" },
  { id: "nraDare", name: "敢死队", note: "白毛巾 + 背后大刀 + 腰间手榴弹" },
  { id: "nraOfficer", name: "川军军官", note: "武装带 + 枪套，不背枪（过场里的师长／参谋长／长官）" },
  { id: "ija", name: "日军步兵", note: "昭五式立领 + 九〇式钢盔，1938 年 3—4 月无屁帘" },
  { id: "ijaOfficer", name: "日军军官", note: "军帽 + 驳壳枪（本作用它代指指挥角色）" },
  { id: "civilian", name: "百姓", note: "包头巾、布鞋、无武器" },
];

const DEFAULT_WEAPON_BY_KIND = {
  nra: "ZhongZheng", nraDare: "HanYang", nraOfficer: null,
  ija: "Type38", ijaOfficer: "Mauser96", civilian: null,
};

/** 一个周期性的 0→1→0 脉冲（投弹 / 白刃 / 中弹这类一次性动作靠它循环演示）。 */
function Pulse(t, period, rise = 0.18, hold = 0.10) {
  const k = t % period;
  if (k < rise) return k / rise;
  if (k < rise + hold) return 1;
  const fall = Math.min(period - rise - hold, 0.45);
  if (k < rise + hold + fall) return 1 - (k - rise - hold) / fall;
  return 0;
}

/**
 * 动作配方表。make(t, ctx) 返回**要盖到基础 state 上的那几项**。
 * ctx = { weapon }，射击周期要按这把枪的 fireIntervalS 走。
 */
const CLIPS = [
  { id: "idle", name: "立正 · 待机", make: () => ({}) },
  { id: "look", name: "张望", make: (t) => ({ lookYaw: Math.sin(t * 0.7) * 1.0, lookPitch: Math.sin(t * 0.43) * 0.35 }) },
  { id: "walk", name: "行进", make: () => ({ moveSpeed: 0.34 }) },
  { id: "trot", name: "小跑", make: () => ({ moveSpeed: 0.62 }) },
  { id: "run", name: "冲锋", make: () => ({ moveSpeed: 1.0 }) },
  { id: "strafe", name: "横移", make: (t) => ({ moveSpeed: 0.42, strafe: Math.sin(t * 1.1) }) },
  { id: "crouch", name: "蹲姿", make: () => ({ crouch: 1 }) },
  { id: "crouchWalk", name: "猫腰前进", make: () => ({ crouch: 1, moveSpeed: 0.26 }) },
  { id: "prone", name: "卧倒", make: () => ({ prone: 1 }) },
  { id: "crawl", name: "匍匐前进", make: () => ({ prone: 1, moveSpeed: 0.12 }) },
  { id: "aim", name: "据枪（贴腮）", make: () => ({ aim: 1 }) },
  {
    id: "fire", name: "据枪射击 + 拉栓",
    make: (t, ctx) => {
      const interval = (ctx.weapon && ctx.weapon.fireIntervalS) || 1.25;
      return { aim: 1, firing: (t % interval) < 0.05 };
    },
  },
  { id: "aimProne", name: "卧姿据枪", make: () => ({ prone: 1, aim: 0.9 }) },
  { id: "throw", name: "投弹", make: (t) => ({ throwing: Pulse(t, 2.6, 0.55, 0.12) }) },
  { id: "melee", name: "白刃突刺 / 劈砍", make: (t) => ({ melee: Pulse(t, 1.8, 0.22, 0.06) }) },
  { id: "hurt", name: "中弹踉跄", make: (t) => ({ hurt: Pulse(t, 2.2, 0.08, 0.16), moveSpeed: 0.1 }) },
  { id: "dying", name: "濒死下沉", make: (t) => ({ dying: Math.min(1, (t % 4) / 2.2) }) },
  { id: "dead", name: "倒地（0.8 s 姿态过渡）", dead: true, make: () => ({ dead: true }) },
];

export class ActorEditor {
  static id = "actor";
  static label = "人物动作";
  static hint = "预览六种人物的全部驱动量组合";

  constructor(host) {
    this.host = host;
    this.studio = host.studio;
    this.panel = null;
    this.cameraMode = "studio";

    this.kind = "nra";
    this.weaponId = "ZhongZheng";
    this.clipId = "idle";
    this.seed = 3;
    this.speed = 1;
    this.playing = true;
    this.lineup = false;      // 五个 kind 站一排
    this.towel = null;        // null = 按 kind 的默认
    this.manual = false;
    this.time = 0;

    this.actors = [];
    this.manualState = {
      moveSpeed: 0, strafe: 0, crouch: 0, prone: 0, aim: 0,
      throwing: 0, melee: 0, hurt: 0, dying: 0, lookYaw: 0, lookPitch: 0, firing: false,
    };
    this.sliders = {};
  }

  // -------------------------------------------------------------------------
  // 生命周期
  // -------------------------------------------------------------------------

  Enter(root) {
    this.studio.Open(this.host.hideInStudio);
    this.studio.Frame(1.7, 3.4);
    this.panel = Panel({
      title: "人物动作编辑器", sub: "Script_Actor",
      variant: "work", onClose: () => this.host.Close(),
    });
    root.appendChild(this.panel.root);
    this.BuildUi(this.panel.body);
    this.Rebuild();
    return this;
  }

  Exit() {
    this.DisposeActors();
    if (this.panel) this.panel.root.remove();
    this.panel = null;
    this.studio.Close();
  }

  // -------------------------------------------------------------------------
  // 界面
  // -------------------------------------------------------------------------

  BuildUi(body) {
    // --- 人物 ---
    const who = Section(body, "人物");
    this.kindList = ListBox(who, {
      height: 136,
      onPick: (id) => {
        this.kind = id;
        this.weaponId = DEFAULT_WEAPON_BY_KIND[id] ?? null;
        if (this.weaponSelect) this.weaponSelect.Set(this.weaponId || "");
        this.Rebuild();
      },
    });
    this.kindList.Fill(KINDS.map((k) => ({ id: k.id, name: k.name, tail: k.id, title: k.note })));
    this.kindList.Select(this.kind);
    this.kindNote = Note(who, KINDS[0].note);

    this.weaponSelect = Select(who, "武器",
      [{ value: "", label: "（空手）" },
        ...Object.keys(WEAPONS).map((id) => ({ value: id, label: `${WEAPONS[id].name}  ${id}` }))],
      this.weaponId, (v) => { this.weaponId = v || null; this.Rebuild(); });

    Slider(who, {
      label: "个体种子", min: 0, max: 40, step: 1, value: this.seed,
      format: (v) => v.toFixed(0),
      onInput: (v) => { this.seed = v; this.Rebuild(); },
    });
    const opts = document.createElement("div");
    opts.className = "edBtns";
    who.appendChild(opts);
    Toggle(opts, "白毛巾", false, (on) => { this.towel = on; this.ApplyTowel(); });
    Toggle(opts, "六人对比", false, (on) => { this.lineup = on; this.Rebuild(); });
    Toggle(opts, "米格", true, (on) => this.studio.SetGridVisible(on));

    // --- 动作 ---
    const act = Section(body, "动作（驱动量配方）");
    this.clipList = ListBox(act, {
      height: 168,
      onPick: (id) => this.SetClip(id),
    });
    this.clipList.Fill(CLIPS.map((c) => ({ id: c.id, name: c.name })));
    this.clipList.Select(this.clipId);

    ButtonRow(act, [
      { label: "▶ / ⏸", onClick: () => { this.playing = !this.playing; } },
      { label: "重演", onClick: () => this.Rebuild() },
      { label: "单帧", onClick: () => { this.playing = false; this.Step(1 / 30); } },
    ]);
    Slider(act, {
      label: "播放速度", min: 0.05, max: 2, step: 0.05, value: 1,
      onInput: (v) => { this.speed = v; },
    });

    // --- 手动调参 ---
    const man = Section(body, "手动调参");
    Chips(man, [{ value: "clip", label: "按配方" }, { value: "manual", label: "手动" }],
      "clip", (v) => { this.manual = v === "manual"; });
    const S = (key, label, min, max) => {
      this.sliders[key] = Slider(man, {
        label, min, max, step: 0.01, value: this.manualState[key],
        onInput: (v) => { this.manualState[key] = v; },
      });
    };
    S("moveSpeed", "移动", 0, 1);
    S("strafe", "横移", -1, 1);
    S("crouch", "下蹲", 0, 1);
    S("prone", "卧倒", 0, 1);
    S("aim", "据枪", 0, 1);
    S("throwing", "投弹", 0, 1);
    S("melee", "白刃", 0, 1);
    S("hurt", "中弹", 0, 1);
    S("dying", "濒死", 0, 1);
    S("lookYaw", "看 · 偏航", -1.4, 1.4);
    S("lookPitch", "看 · 俯仰", -1.0, 0.9);
    Toggle(man, "扣扳机", false, (on) => { this.manualState.firing = on; });

    // --- 读数 ---
    const info = Section(body, "取证");
    this.facts = Facts(info);
    Note(info, "meshSource=box = 模型没读到、退回了方块几何。换模后先看这行。", true);
  }

  SetClip(id) {
    const clip = CLIPS.find((c) => c.id === id);
    this.clipId = id;
    this.time = 0;
    // 倒地是一次性状态机（Actor 内部有 ragdollState），换到它要重建才能从头演
    if (clip && clip.dead) this.Rebuild();
  }

  ApplyTowel() {
    if (this.towel == null) return;
    for (const actor of this.actors) actor.SetTowel(this.towel);
  }

  // -------------------------------------------------------------------------
  // 展台
  // -------------------------------------------------------------------------

  DisposeActors() {
    for (const actor of this.actors) {
      if (actor.root.parent) actor.root.parent.remove(actor.root);
      actor.Dispose();
    }
    this.actors.length = 0;
  }

  Rebuild() {
    this.DisposeActors();
    this.studio.ClearStand();
    this.time = 0;
    const factory = this.host.actorFactory;
    if (!factory) return;
    const list = this.lineup ? KINDS.map((k) => k.id) : [this.kind];
    const span = 1.15;
    list.forEach((kind, i) => {
      const weapon = this.lineup ? undefined : (this.weaponId || null);
      const actor = factory.Create(kind, { seed: this.seed + i * 7, weapon });
      actor.root.position.x = (i - (list.length - 1) / 2) * span;
      this.studio.stand.add(actor.root);
      this.actors.push(actor);
    });
    if (this.towel != null) this.ApplyTowel();
    const entry = KINDS.find((k) => k.id === this.kind);
    if (this.kindNote && entry) this.kindNote.textContent = entry.note;
    this.studio.Frame(1.75, this.lineup ? 7.4 : 3.4);
    this.Step(0);
  }

  /** 推一帧姿态。playing=false 时 Update(dt) 里只走这一条（供单帧按钮用）。 */
  Step(dt) {
    this.time += dt;
    const clip = CLIPS.find((c) => c.id === this.clipId) || CLIPS[0];
    const ctx = { weapon: this.weaponId ? WEAPONS[this.weaponId] : null };
    for (let i = 0; i < this.actors.length; i += 1) {
      const actor = this.actors[i];
      const base = {
        moveSpeed: 0, strafe: 0, crouch: 0, prone: 0, aim: 0,
        throwing: 0, melee: 0, hurt: 0, dying: 0, firing: false,
        lookYaw: 0, lookPitch: 0, elapsed: this.time,
      };
      // 一排人时给每个人一点相位差，不然五个人像广播体操
      const local = this.time + (this.lineup ? i * 0.37 : 0);
      const state = this.manual
        ? { ...base, ...this.manualState, elapsed: local }
        : { ...base, ...clip.make(local, ctx), elapsed: local };
      actor.Update(dt, state);
    }
  }

  Update(dt) {
    const step = this.playing ? dt * this.speed : 0;
    this.Step(step);
    // 阴影框跟着展台走：不挪的话太阳的正交框还钉在玩家上一次站的地方，
    // 摄影棚里一个影子都没有（而这恰恰是判断姿态对不对最有用的一条线索）
    if (this.host.lights) {
      this.host.lights.UpdateShadowFrustum(
        new THREE.Vector3(0, 0.9, 0),
        new THREE.Vector3(0, 0, -1));
    }
    this.RefreshFacts();
  }

  RefreshFacts() {
    const actor = this.actors[0];
    if (!actor || !this.facts) return;
    let meshes = 0;
    let triangles = 0;
    actor.root.traverse((o) => {
      if (!o.isMesh || !o.geometry) return;
      meshes += 1;
      const index = o.geometry.index;
      const position = o.geometry.attributes.position;
      triangles += (index ? index.count : (position ? position.count : 0)) / 3;
    });
    const weapon = this.weaponId ? WEAPONS[this.weaponId] : null;
    const built = this.weaponId && this.host.actorFactory
      ? this.host.actorFactory.WeaponGeometry(this.weaponId) : null;
    this.facts.Set("kind", actor.kind);
    this.facts.Set("身高", `${actor.height.toFixed(3)} m`);
    this.facts.Set("meshSource", actor.meshSource, actor.usingModel ? "good" : "bad");
    this.facts.Set("网格 / 三角", `${meshes} / ${Math.round(triangles)}`);
    this.facts.Set("武器", weapon ? `${weapon.name}（${weapon.kind}）` : "空手");
    if (built) this.facts.Set("武器几何", built.source, built.source === "model" ? "good" : "bad");
    this.facts.Set("动作", this.manual ? "手动" : this.clipId);
    this.facts.Set("时间", `${this.time.toFixed(2)} s`);
  }
}

export default ActorEditor;
