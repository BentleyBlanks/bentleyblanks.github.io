// 断肢**规则层**：判定、顶点分类、index 过滤、预算环。
//
// 纯 Node、零 three、零 Math.random（契约 2 与项目纪律）：随机一律由调用方交进来
// （正片是 `Soldier.rnd()`，那是每个兵自带的 Mulberry32），所以同一个种子重放
// 出同一次断肢。数字全部在 `Data_Tuning_Gore.mjs`，这里一个常数都不写。
//
// 口径文档：docs/Data_Dismemberment.md §4。直测入口：`Script_DismembermentTest.mjs`。
//
// 【为什么切身体走「重建 index」而不是 shader mask】本项目影子走 customDepthMaterial、
// 深度法线预通道走 scene.overrideMaterial，片元 discard 管不到这两条 pass ——
// 用 mask 藏肢体的话，人身上没有胳膊了，地上的影子里还有。CPU 只删三角形，
// 三条 pass 读的是同一份 index，天然一致，而且零新 program。

import { ENABLED, LIMBS, SEVER_RULES, KIND_ALIASES, LIMB_POOLS } from "./Data_Tuning_Gore.mjs";

/** 冻结的肢体 id 数组（顺序即编码顺序，见 CodeForLimb）。 */
export const LIMB_IDS = Object.freeze(Object.keys(LIMBS));

/** 顶点分类用的编码：0 = 躯干/不切，1..N 对应 LIMB_IDS。Uint8Array 装得下。 */
const CODE_BY_LIMB = new Map(LIMB_IDS.map((id, i) => [id, i + 1]));

export function CodeForLimb(limbId) { return CODE_BY_LIMB.get(limbId) || 0; }
export function LimbForCode(code) { return LIMB_IDS[(code | 0) - 1] || null; }

/**
 * 运行时开关。三者任一关闭就整套不做事：
 *   `Data_Tuning_Gore.ENABLED`（内容总闸） / `?gore=0` / `Debug.Gore.SetEnabled(false)`。
 * 后两者走这里的覆盖位 —— 常量导出改不了，而测试与调试口要能真的关掉它。
 */
let enabledOverride = null;
export function SetGoreEnabled(value) { enabledOverride = value == null ? null : !!value; }
export function IsGoreEnabled() { return enabledOverride == null ? !!ENABLED : enabledOverride; }

/**
 * 肢体深度：被别人 contains 的更深。顶点归属取**最深**的那一段，
 * 否则前臂顶点会被上臂的正则先吃掉（两条正则是包含关系）。
 */
const DEPTH_BY_LIMB = (() => {
  const depth = new Map(LIMB_IDS.map((id) => [id, 0]));
  // contains 只有一层（上臂→前臂、大腿→小腿），跑两遍足够收敛，多跑一遍不花钱。
  for (let pass = 0; pass < 2; pass += 1) {
    for (const id of LIMB_IDS) {
      for (const child of LIMBS[id].contains || []) {
        depth.set(child, Math.max(depth.get(child) || 0, (depth.get(id) || 0) + 1));
      }
    }
  }
  return depth;
})();

/** 含 contains 递归展开的子树（含自己），顺序稳定。 */
export function LimbSubtree(limbId) {
  const out = [];
  const walk = (id) => {
    if (!LIMBS[id] || out.includes(id)) return;
    out.push(id);
    for (const child of LIMBS[id].contains || []) walk(child);
  };
  walk(limbId);
  return out;
}

/** a 与 b 是不是同一条肢体上的两段（卸了大腿就不该再卸同一条腿的小腿）。 */
function Conflicts(a, b) {
  if (a === b) return true;
  return LimbSubtree(a).includes(b) || LimbSubtree(b).includes(a);
}

/**
 * 骨名 → 肢体 id（取匹配到的最深一段）；躯干以外、表里没有的骨返回 null。
 *
 * **名字要先归一化**：源 GLB 里这批关节叫 `Bip001 L Forearm`（有空格），但
 * GLTFLoader 会走 `PropertyBinding.sanitizeNodeName` 把空白换成下划线、并删掉
 * 保留字符（点号那条账见 `gltfloader-strips-dot-in-bone-names`）——
 * 运行时读到的是 `Bip001_L_Forearm`。数据表按**源名**写（可读、与清单一致），
 * 匹配之前在这里把下划线/点号/连续空白统一成单个空格。
 * 不做这一步的症状：切了半天一个三角形都没少，人还站着，断面凭空盖在关节上。
 */
export function LimbForBone(boneName) {
  const name = String(boneName || "").replace(/[_.\s]+/g, " ").trim();
  if (!name) return null;
  let best = null, bestDepth = -1;
  for (const id of LIMB_IDS) {
    if (!LIMBS[id].bones.test(name)) continue;
    const depth = DEPTH_BY_LIMB.get(id) || 0;
    if (depth > bestDepth) { best = id; bestDepth = depth; }
  }
  return best;
}

/** skinIndex / skinWeight 既可能是扁平 TypedArray，也可能是 three 的 BufferAttribute。 */
function Component(source, vertex, k) {
  if (!source) return 0;
  if (typeof source.getComponent === "function") return source.getComponent(vertex, k);
  return source[vertex * 4 + k] || 0;
}

/**
 * 每个顶点属于哪一段肢体。
 *
 * 取**权重最大**的那根骨：蒙皮在关节附近是混合的，按加权和分类会让断口糊成一片
 * 锯齿；取主导骨得到的是一条沿着关节走的干净边界（断面盖正好盖住它）。
 *
 * @param {string[]} boneNames  骨骼数组的名字（下标 = skinIndex 的取值）
 * @param {ArrayLike<number>|object} skinIndex  每顶点 4 个骨号
 * @param {ArrayLike<number>|object} skinWeight 每顶点 4 个权重
 * @param {number} vertexCount
 * @returns {Uint8Array} 每顶点一个编码，0 = 躯干/不切
 */
export function ClassifyVertices(boneNames, skinIndex, skinWeight, vertexCount) {
  const count = Math.max(0, vertexCount | 0);
  const out = new Uint8Array(count);
  if (!count || !skinIndex || !skinWeight) return out;
  const codeByBone = new Map();
  for (let i = 0; i < count; i += 1) {
    let bestBone = -1, bestWeight = 0;
    for (let k = 0; k < 4; k += 1) {
      const weight = Component(skinWeight, i, k);
      if (weight > bestWeight) { bestWeight = weight; bestBone = Component(skinIndex, i, k) | 0; }
    }
    if (bestBone < 0 || !(bestWeight > 0)) continue;
    let code = codeByBone.get(bestBone);
    if (code === undefined) {
      code = CodeForLimb(LimbForBone(boneNames[bestBone]));
      codeByBone.set(bestBone, code);
    }
    out[i] = code;
  }
  return out;
}

/**
 * 按已卸掉的肢体重建 index。
 *
 *   · 三个顶点都不属于被卸集合 → 留在身体上；
 *   · 三个顶点都属于**同一段被卸肢体**（含它的 contains 子树）→ 进那一段的肢块；
 *   · 其余（跨断口、跨两段被卸肢体）→ 丢弃，断面盖负责遮住这条缝。
 *
 * 三条加起来一定等于原三角数 —— Script_DismembermentTest 有一条守恒断言。
 *
 * @param {ArrayLike<number>|null} index 原 index（null = 非索引几何，按顺序算）
 * @param {Uint8Array} vertexLimb ClassifyVertices 的结果
 * @param {Iterable<string>} severedLimbIds 已卸掉的肢体（根段，不必展开）
 * @returns {{ body: Uint32Array, parts: Map<string, Uint32Array>, dropped: number }}
 */
export function FilterIndex(index, vertexLimb, severedLimbIds) {
  const rootByCode = new Map();
  for (const root of severedLimbIds || []) {
    if (!LIMBS[root]) continue;
    for (const id of LimbSubtree(root)) rootByCode.set(CodeForLimb(id), root);
  }
  const total = index ? index.length : vertexLimb.length;
  const body = [];
  const parts = new Map();
  for (const root of new Set(rootByCode.values())) parts.set(root, []);
  let dropped = 0;
  for (let t = 0; t + 2 < total; t += 3) {
    const a = index ? index[t] : t;
    const b = index ? index[t + 1] : t + 1;
    const c = index ? index[t + 2] : t + 2;
    const ra = rootByCode.get(vertexLimb[a]);
    const rb = rootByCode.get(vertexLimb[b]);
    const rc = rootByCode.get(vertexLimb[c]);
    if (ra === undefined && rb === undefined && rc === undefined) {
      body.push(a, b, c);
    } else if (ra !== undefined && ra === rb && rb === rc) {
      parts.get(ra).push(a, b, c);
    } else {
      dropped += 1;
    }
  }
  const partsOut = new Map();
  for (const [root, list] of parts) partsOut.set(root, Uint32Array.from(list));
  return { body: Uint32Array.from(body), parts: partsOut, dropped };
}

/** 爆炸没给 shapeId 时的挑选权重：贴地炸先卸腿（爆心通常在脚边）。 */
const BLAST_WEIGHT = Object.freeze({ thighL: 2, thighR: 2, calfL: 2, calfR: 2 });

function WeightedPick(pool, roll) {
  if (!pool.length) return null;
  let total = 0;
  for (const id of pool) total += BLAST_WEIGHT[id] || 1;
  let r = Math.min(0.999999, Math.max(0, roll)) * total;
  for (const id of pool) {
    r -= BLAST_WEIGHT[id] || 1;
    if (r < 0) return id;
  }
  return pool[pool.length - 1];
}

/** shapeId / part 交出来的东西未必是肢体（躯干也会被打中）。 */
function LimbFromHit(shapeId, part) {
  if (shapeId && LIMBS[shapeId]) return shapeId;
  if (part === "head" && LIMBS.head) return "head";
  return null;
}

/**
 * 没有命中体 id 时从哪几段里挑：规则自己指定的 pool（大刀 = 两条胳膊）优先，
 * 其次按粗部位（AI 打 AI 抽到的 "arm" / "leg"），都没有就八段全选（头永远不在
 * 随机池里 —— 头只在命中体真的报 head 时才按 head 那一档骰）。
 */
function RandomPool(rule, part) {
  const named = rule?.pool && LIMB_POOLS[rule.pool];
  if (named?.length) return named;
  const byPart = part && LIMB_POOLS[part];
  if (byPart?.length) return byPart;
  return LIMB_IDS.filter((id) => id !== "head");
}

/** 爆炸按 falloff 分档（Data_Tuning_Gore.SEVER_RULES.blast.tiers）；没分档表就用规则顶层的数。 */
function TierFor(rule, falloff) {
  const value = Number(falloff);
  if (Array.isArray(rule?.tiers) && Number.isFinite(value)) {
    for (const tier of rule.tiers) if (value >= tier.minFalloff) return tier;
    return { maxLimbs: 1, extraLimbChance: 0 };
  }
  return { maxLimbs: rule?.maxLimbs || 1, extraLimbChance: rule?.extraLimbChance ?? 0 };
}

/**
 * 白刃接触时挑「劈中了哪一段」：命中体里离攻击者视线最近的那一段。
 *
 * 白刃判定是扇形（Script_Combat.Melee / Script_MeleeCombat），本来不做射线，
 * 所以没有 shapeId；但劈砍的走向是确定的 —— 从攻击者眼位朝目标挥过去，
 * 离这条线最近的那条胳膊就是挨刀的。纯几何，不 import three，命中体从
 * `characterRig.GetHitboxes()` 拿（sphere/ellipsoid 有 center，capsule 有 start/end）。
 *
 * @param {{x:number,y:number,z:number}} origin 攻击者眼位（世界）
 * @param {{x:number,y:number,z:number}} direction 挥砍方向（世界，不必归一）
 * @param {Array<{id:string,type:string,center?:object,start?:object,end?:object}>} shapes
 * @param {Iterable<string>} poolIds 只在这几段里挑（默认 LIMB_POOLS.blade）
 * @returns {string|null}
 */
export function PickMeleeShape(origin, direction, shapes, poolIds = LIMB_POOLS.blade) {
  if (!origin || !direction || !shapes?.length) return null;
  const pool = new Set(poolIds || []);
  const dx = direction.x || 0, dy = direction.y || 0, dz = direction.z || 0;
  const len = Math.hypot(dx, dy, dz);
  if (!(len > 1e-9)) return null;
  const ux = dx / len, uy = dy / len, uz = dz / len;
  let best = null, bestDistance = Infinity;
  for (const shape of shapes) {
    if (!shape || !pool.has(shape.id)) continue;
    let cx, cy, cz;
    if (shape.center) { cx = shape.center.x; cy = shape.center.y; cz = shape.center.z; }
    else if (shape.start && shape.end) {
      cx = (shape.start.x + shape.end.x) * 0.5;
      cy = (shape.start.y + shape.end.y) * 0.5;
      cz = (shape.start.z + shape.end.z) * 0.5;
    } else continue;
    const rx = cx - origin.x, ry = cy - origin.y, rz = cz - origin.z;
    const along = rx * ux + ry * uy + rz * uz;
    if (along < 0) continue;                   // 在攻击者身后的段不算
    const px = rx - ux * along, py = ry - uy * along, pz = rz - uz * along;
    const distance = Math.hypot(px, py, pz);
    if (distance < bestDistance) { bestDistance = distance; best = shape.id; }
  }
  return best;
}

/** 不断的那一路统一从这里出：形状与真断了那一路完全一致，调用方不用分两种写法。 */
function Empty(reason, kind = null) { return { limbs: [], forceKill: false, reason, kind }; }

/**
 * 这一发要不要卸肢、卸哪几段。
 *
 * @param {object} hit
 *   part      —— 伤害口径的粗分类（head/torso/limb）
 *   shapeId   —— 命中体 id（`Data_CharacterHitbox` 的 shape.id），子弹链才有
 *   kind      —— bullet / hmg / blast / blade / thrust / bash / vehicle / debug
 *   weaponId  —— 只记账，不参与判定
 *   mode      —— 白刃动作（slash / cut / thrust / bash）
 *   damage    —— 这一发**乘过部位倍率之后**落到身上的伤害
 *   wouldDie  —— 这一发本来就打死了人
 *   falloff   —— 爆炸的距离衰减（1 = 爆心）
 *   force     —— 无视骰子（Debug.Gore.SetForce / Debug.Gore.Sever 用）
 *   rng       —— 确定性随机源，一次调用最多消耗 8 次
 * @returns {{ limbs: string[], forceKill: boolean, reason: string, kind: string|null }}
 */
export function ResolveSever(hit = {}) {
  if (!IsGoreEnabled()) return Empty("disabled");
  const rng = typeof hit.rng === "function" ? hit.rng : null;
  if (!rng) return Empty("noRng");
  const kind = KIND_ALIASES[hit.kind] || hit.kind || "bullet";
  const force = !!hit.force;
  const rule = SEVER_RULES[kind] || (force ? SEVER_RULES.bullet : null);
  if (!rule) return Empty("noRule", kind);
  if (!force) {
    if (rule.requiresKill && !hit.wouldDie) return Empty("notLethal", kind);
    if (rule.minDamage != null && !(Number(hit.damage) >= rule.minDamage)) return Empty("lowDamage", kind);
    if (rule.minFalloff != null && !(Number(hit.falloff) >= rule.minFalloff)) return Empty("falloff", kind);
    if (rule.modes && hit.mode && !rule.modes.includes(hit.mode)) return Empty("mode", kind);
  }

  // 固定 8 次抽取：r0 主段骰子 / r1 主段挑选 / (r2,r3)(r4,r5)(r6,r7) 三次追加段。
  // 固定次数是为了可回放 —— 同一个 Soldier.rnd 序列在同一场战斗里要能重现。
  const r = [rng(), rng(), rng(), rng(), rng(), rng(), rng(), rng()];

  const hitLimb = LimbFromHit(hit.shapeId, hit.part);
  const isHead = hitLimb === "head";
  const chance = isHead ? (rule.chance?.head ?? 0) : (rule.chance?.limb ?? 0);
  if (!force && !(r[0] < chance)) return Empty("chance", kind);

  const pool = RandomPool(rule, hit.part);
  const primary = hitLimb || WeightedPick(pool, r[1]);
  if (!primary) return Empty("noLimb", kind);
  const limbs = [primary];

  // 追加段只在爆炸那一档出现，段数与概率按 falloff 分档（近炸四段、三米外一段）。
  // 追加段从八段全池里挑（不限 pool：爆心在脚边也炸得到胳膊），头永远不在里面。
  const tier = TierFor(rule, hit.falloff);
  const maxLimbs = Math.max(1, tier.maxLimbs || 1);
  if (maxLimbs > 1) {
    const extraPool = LIMB_IDS.filter((id) => id !== "head");
    for (let i = 0; i < 3 && limbs.length < maxLimbs; i += 1) {
      if (!(r[2 + i * 2] < (tier.extraLimbChance ?? 0))) continue;
      const free = extraPool.filter((id) => !limbs.some((chosen) => Conflicts(chosen, id)));
      const extra = WeightedPick(free, r[3 + i * 2]);
      if (extra) limbs.push(extra);
    }
  }

  // **断肢不改生死**：六类来源全部 requiresKill，能走到这里的正片命中本来就是致死的。
  // 唯一的例外是 Debug.Gore 的 force 通道（测试场的「下一发必断」按钮）：那一发若本来
  // 没打死人，就抬成致死 —— 没有「活着缺胳膊」的动画素材，AI 状态机也不为此扩。
  const forceKill = !hit.wouldDie && force;
  return { limbs, forceKill, reason: "sever", kind };
}

/**
 * 同屏肢块的 FIFO 预算环。
 *
 * 满了就把**最老的**那一条挤出去交给调用方释放 —— 不是拒绝新的：刚被打飞的
 * 那一段是玩家正在看的，压在最老的那一段之后没有意义。
 */
export class GoreBudget {
  constructor(max = 1) {
    this.max = Math.max(1, max | 0);
    this.records = [];
  }

  get size() { return this.records.length; }

  /** @returns {*|null} 被挤出去的旧记录（调用方负责 Dispose），没有则 null。 */
  Acquire(record) {
    this.records.push(record);
    if (this.records.length <= this.max) return null;
    return this.records.shift();
  }

  Release(record) {
    const i = this.records.indexOf(record);
    if (i >= 0) this.records.splice(i, 1);
  }

  Clear() { this.records.length = 0; }

  SetMax(max) {
    this.max = Math.max(1, max | 0);
    const evicted = [];
    while (this.records.length > this.max) evicted.push(this.records.shift());
    return evicted;
  }
}
