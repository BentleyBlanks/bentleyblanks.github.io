// 《滕县 一九三八》可被炸中的场景物件登记表。
//
// **纯规则，不 import three。** 这一层只回答一句话：
// 「刚才那一炸，打着了哪几件**摆点层摆下去的东西**。」
//
// ── 为什么要有它 ────────────────────────────────────────────────────────────
// 二关阶段③的殉爆倒计时（掷弹筒命中弹药箱 → 冒烟 4—6 s → 拖出 6 m 算救下）
// 一直落空，原因写在 docs/Data_MissionRemake.md §10.7 的施工单上：
//
//   「现在的箱子是交互点 + 搬运态，场上没有一只掷弹筒打得中的实体。
//     要它得先有一类『可被伤害的场景物件』，那是 destruction 层的活。」
//
// destruction 那一层管的是**场景几何**（碰撞盒 → 耐久 → 破口 → 碎片 → 重烘导航），
// 它认的是 battlefield.colliders 里的盒子。摆点层摆的那几件东西
//（Script_Main 的 MakeSetpieceProp）**故意不进碰撞、不进导航、不进流送** ——
// 它们是看的，不是撞的。于是两边谁也够不着谁：
//   · 让摆件进碰撞 = 把「同一个院子越来越破」那条运行时轻量摆件口变成布设层，
//   · 让摆点层自己算爆炸 = 第二套伤害判定（摆点层三条纪律的第二条明令禁止）。
//
// 这张表就是两边中间那一格：**destruction 报事实，摆点层认领后果。**
//   · `Script_Destruction.Blast()` 每炸一次，把（位置、半径、能量、种类）喂进来；
//   · 摆点层在 Setup 里 `Register` 自己摆的那几件，在回调里决定「炸了之后怎样」。
// 表本身不知道什么是弹药箱，也不放烟、不扣血 —— 那都是认领方的事。
//
// ── 为什么不是一个注入的 host 回调 ──────────────────────────────────────────
// 因为两头都不在装配层手里：DestructionSystem 由 Script_Main 建、
// MissionSetpieceDirector 也由 Script_Main 建，但两者的窄接口里都没有对方。
// 走一张**纯模块级登记表**的代价是一个共享单例；换来的是 destruction 不必知道
// 有摆点层这回事，摆点层也不必 import three（`Script_MissionSetpiecesTest`
// 仍然是纯 Node、毫秒级）。清账的责任在登记方：一律带 `tag`，换关按 tag 清。

/**
 * 数只在这里（AGENTS 硬规矩 12）。
 *
 * reachScale   有效外沿相对爆炸半径的倍数。**照抄 Script_Destruction.Blast 的
 *              `radius * 1.25`** —— 一只箱子与它旁边那堵墙该在同一次爆炸里
 *              同时被算到，两处用不同的外沿就会出现「墙破了、贴着墙的箱子没事」。
 * bulletScale  子弹直接打中时的伤害折扣（步枪打不炸一箱手榴弹，但打多了会）。
 * defaultHp    一件物件的默认耐久。一发掷弹筒（Data_Battle 的 launcher damage）
 *              足够一次打穿，一颗手榴弹在三米外不够。
 * defaultRadiusM 物件自己的半径：命中距离先减掉它，再算衰减。
 */
export const BLAST_TARGET_TUNING = Object.freeze({
  reachScale: 1.25,
  bulletScale: 0.12,
  defaultHp: 55,
  defaultRadiusM: 0.55,
});

const Num = (value, fallback = 0) => {
  const v = Number(value);
  return Number.isFinite(v) ? v : fallback;
};

const Clamp01 = (v) => Math.max(0, Math.min(1, v));

export class BlastTargetRegistry {
  constructor(tuning = {}) {
    this.tuning = { ...BLAST_TARGET_TUNING, ...tuning };
    /** id → target */
    this.targets = new Map();
    /** 取证：登记过几件、挨过几次、炸掉几件。 */
    this.stats = { registered: 0, hits: 0, destroyed: 0 };
    this.log = [];
  }

  get Count() { return this.targets.size; }

  /**
   * 登记一件可被炸中的物件。
   *
   * @param {object} spec
   *   id          必填，登记方自己的名字（与它摆的那件 Prop 同名最省事）
   *   tag         归属（一律写本章 levelId）。换关按 tag 清。
   *   x / y / z   世界坐标（y 不给按 0 算，只影响立体距离）
   *   radius      物件自己的半径（默认 defaultRadiusM）
   *   hp          耐久（默认 defaultHp）
   *   OnHit(info)      每次挨炸都调（还没坏）
   *   OnDestroyed(info) 耐久见底那一次调，**只调一次**
   * @returns {string|null} id；重名或缺 id 返回 null（不覆盖已有的那件）
   */
  Register(spec = {}) {
    const id = spec.id != null ? String(spec.id) : null;
    if (!id || this.targets.has(id)) return null;
    const target = {
      id,
      tag: spec.tag ?? null,
      x: Num(spec.x), y: Num(spec.y), z: Num(spec.z),
      radius: Math.max(0, Num(spec.radius, this.tuning.defaultRadiusM)),
      hp: Math.max(1, Num(spec.hp, this.tuning.defaultHp)),
      damage: 0,
      destroyed: false,
      hits: 0,
      OnHit: typeof spec.OnHit === "function" ? spec.OnHit : null,
      OnDestroyed: typeof spec.OnDestroyed === "function" ? spec.OnDestroyed : null,
      payload: spec.payload ?? null,
    };
    this.targets.set(id, target);
    this.stats.registered += 1;
    return id;
  }

  Get(id) { return this.targets.get(String(id)) || null; }

  /** 挪一件（被玩家拖走的那只箱子仍然可以被打中 —— 它就在玩家怀里）。 */
  MoveTo(id, x, z, y = null) {
    const target = this.targets.get(String(id));
    if (!target) return false;
    target.x = Num(x, target.x);
    target.z = Num(z, target.z);
    if (y !== null) target.y = Num(y, target.y);
    return true;
  }

  Remove(id) { return this.targets.delete(String(id)); }

  /** 换关/收摊。`tag` 不给就清空整张表。 */
  Clear(tag = null) {
    if (tag == null) {
      const n = this.targets.size;
      this.targets.clear();
      return n;
    }
    let n = 0;
    for (const [id, target] of [...this.targets]) {
      if (target.tag !== tag) continue;
      this.targets.delete(id);
      n += 1;
    }
    return n;
  }

  /**
   * 一次爆炸。**由 Script_Destruction.Blast 调**，别的地方不要调
   * —— 两处调等于同一次爆炸算两遍伤害。
   *
   * @param {{x:number,y?:number,z:number}} position
   * @param {number} radius  爆炸半径（与 destruction 同一个参数）
   * @param {number} energy  爆炸能量（与 destruction 同一个参数）
   * @param {string} kind    "grenade" / "shell" / "launcher" / "tank" / "bullet"
   * @returns {{hit:number, destroyed:string[]}}
   */
  Blast(position, radius, energy, kind = "grenade") {
    const out = { hit: 0, destroyed: [] };
    if (!position || !this.targets.size) return out;
    if (!(radius > 0) || !(energy > 0)) return out;
    const px = Num(position.x);
    const py = Num(position.y);
    const pz = Num(position.z);
    const reach = radius * this.tuning.reachScale;
    const scale = kind === "bullet" ? this.tuning.bulletScale : 1;
    for (const target of this.targets.values()) {
      if (target.destroyed) continue;
      const surface = Math.max(0,
        Math.hypot(target.x - px, target.y - py, target.z - pz) - target.radius);
      if (surface > reach) continue;
      const falloff = Clamp01(1 - surface / reach);
      const applied = energy * falloff * falloff * scale;
      if (!(applied > 0)) continue;
      target.damage += applied;
      target.hits += 1;
      this.stats.hits += 1;
      out.hit += 1;
      const info = {
        id: target.id, tag: target.tag, kind, energy: applied,
        at: { x: px, y: py, z: pz }, where: { x: target.x, y: target.y, z: target.z },
        ratio: target.damage / target.hp,
      };
      this._Safe(target.OnHit, info, `OnHit:${target.id}`);
      if (target.damage < target.hp) continue;
      target.destroyed = true;
      this.stats.destroyed += 1;
      out.destroyed.push(target.id);
      this._Safe(target.OnDestroyed, info, `OnDestroyed:${target.id}`);
    }
    return out;
  }

  _Safe(fn, info, where) {
    if (!fn) return;
    // 认领方的回调炸了不该把一次爆炸带走（destruction 还要接着改拓扑）。
    try { fn(info); } catch (err) {
      this.log.push({ where, why: String((err && err.message) || err) });
    }
  }

  /** 取证口（Debug.BlastTargets）。 */
  State() {
    return {
      count: this.targets.size,
      stats: { ...this.stats },
      targets: [...this.targets.values()].map((t) => ({
        id: t.id, tag: t.tag, x: +t.x.toFixed(1), z: +t.z.toFixed(1),
        hp: t.hp, damage: +t.damage.toFixed(1), hits: t.hits, destroyed: t.destroyed,
      })),
      log: this.log.slice(-8),
    };
  }
}

/**
 * 全局那一份。**登记方负责清账**：一律带 tag，换关 `Clear(levelId)`。
 * 出图、靶场、纯规则测试里它就是一张空表，`Blast` 直接返回 —— 一分钱开销都没有。
 */
export const BLAST_TARGETS = new BlastTargetRegistry();

export default BLAST_TARGETS;
