// ===========================================================================
// Script_BonePrune.mjs —— 渲染遍历跳过「下面什么都不画」的骨头子树
//
// 由头（2026-09-27 第一关全关实测）：可见链上 45% 的节点是骨头（一关里 900–1500 根：
// 兵、担架员、伤员、第一人称手臂），阴影两级、预通道、主场景、视模自阴影每一趟
// three 的 projectObject / 阴影 renderObject 都把它们挨个走一遍 —— 骨头从来不画。
// 把「整棵子树里没有任何可画物体」的最上层那根骨头设 visible = false：
//   · three 的 updateMatrixWorld 不看 visible：骨头矩阵照算，蒙皮、IK、挂点全不受影响；
//   · 各渲染趟遇到 visible = false 整棵跳过。
// 同页每两帧交替 A/B（与阴影远级轮换对齐）：渲染整条链 07 26.2→21.1 ms、
// 12 30.7→27.4 ms、02 26.5→25.4 ms；画面逐 draw 不变（被跳过的节点一个 draw 都没有）。
//
// 规矩：
//   1. **只动自己藏的骨头**。别人本来就藏着的骨头不碰；还原也只还原自己藏的。
//   2. **结构一变就重判那棵顶层子树**：任何节点 childadded / childremoved（枪挂到手骨、绷带挂到
//      胸骨、断肢件挂到骨头上、人被摘下 / 挂回场景）都把它所在的 scene 直接子节点标脏，
//      出画前重判，那条骨链当帧就恢复可见。监听装在每个扫到的节点上（同 PostPrepass 的做法）。
//      每棵顶层子树的判定互不相干，所以只重扫变了的那几棵，与整场重扫逐根相同
//      （Script_BonePruneTest 的随机增删对照）。
//   3. 判据只看子树里**有没有**可画物体（网格 / 线 / 点 / 精灵 / 灯 / LOD），不看它们此刻的
//      visible —— 藏着的枪显隐翻转不需要重判，也不会被这里误藏。
//   4. 这一帧没扫到的骨头（整个人被摘下场景）一律还原并忘掉：挂回来时会被重判，
//      不会出现「藏着的骨头下面刚挂了枪却没人来还原」。
// 调用点：Script_Main.RenderScene 的出画前接线（每条出画路径都经过那里）。
// 回归口：Script_BonePruneTest（纯 Node）；与挂点相关的整链见 MotionVectorContractTest。
// ===========================================================================

/** 会被渲染趟收进渲染表 / 灯表的东西：子树里有一个，这条骨链就不能剪。 */
function IsRenderable(object) {
  return !!(object.isMesh || object.isLine || object.isPoints || object.isSprite
    || object.isLight || object.isLOD);
}

export class BonePrune {
  constructor() {
    this.enabled = true;
    this.scene = null;
    this.dirty = true;               // 整场重判（首帧、换场景、开关、Invalidate）
    this.dirtyTops = new Set();      // 只重判这几棵顶层子树（scene 的直接子节点）
    this.tops = new Map();           // 顶层子树 → 这棵树里自己藏的骨头
    this.watched = new WeakSet();
    this.next = [];                  // 扫描复用
    this.stats = { roots: 0, scans: 0 };
    this._onStructure = (event) => this._Changed(event);
  }

  /** 自己藏的全部骨头（取证 / A/B 用；每次调用现拼）。 */
  get pruned() {
    const all = new Set();
    for (const bones of this.tops.values()) for (const bone of bones) all.add(bone);
    return all;
  }

  /** 下一次 Update 有没有要重判的。 */
  get Pending() { return this.dirty || this.dirtyTops.size > 0; }

  /** 关掉时立即把自己藏的骨头全部还原（A/B 与排障用）。 */
  SetEnabled(enabled) {
    this.enabled = enabled !== false;
    this.dirty = true;
    if (!this.enabled) this._RestoreAll();
  }

  /** 强制下一次 Update 重判（换关、外部大批改动之后）。 */
  Invalidate() { this.dirty = true; }

  /**
   * 结构事件落到哪一棵顶层子树。骨头能不能剪只看它自己的子树，而 scene 本身既不是骨头
   * 也不可画，所以每棵顶层子树的判定互不相干：一个人挂上枪、摘下场景，只重判这个人
   * （2026-09-27：开场近爆那几帧人进场、布景换态、炮弹挂上摘下，每次都把四千多个节点
   * 整场走一遍）。不在场景里的子树不管：它挂回场景那一刻整棵重判。
   */
  _Changed(event) {
    if (this.dirty || !this.scene) return;
    const scene = this.scene;
    let node = event.target;
    if (node === scene) { if (event.child) this.dirtyTops.add(event.child); return; }
    while (node && node.parent !== scene) node = node.parent;
    if (node) this.dirtyTops.add(node);
  }

  /**
   * 出画前调一次。结构没变就是一次布尔检查；变了只重判变了的那几棵顶层子树。
   * @returns {boolean} 这一帧有没有重判
   */
  Update(scene) {
    if (!scene) return false;
    if (!this.enabled) { if (this.tops.size) this._RestoreAll(); return false; }
    if (scene !== this.scene) { this._RestoreAll(); this.scene = scene; this.dirty = true; }
    if (!this.Pending) return false;
    this._Watch(scene);
    if (this.dirty) {
      this.dirty = false;
      this.dirtyTops.clear();
      for (const top of [...this.tops.keys()]) if (top.parent !== scene) this._ApplyTop(top, null);
      for (const top of scene.children) this._ScanTop(top);
    } else {
      const tops = [...this.dirtyTops];
      this.dirtyTops.clear();
      for (const top of tops) {
        if (top.parent === scene) this._ScanTop(top);
        else this._ApplyTop(top, null);
      }
    }
    let roots = 0;
    for (const bones of this.tops.values()) roots += bones.size;
    this.stats.roots = roots;
    this.stats.scans += 1;
    return true;
  }

  _Watch(object) {
    if (this.watched.has(object)) return;
    this.watched.add(object);
    object.addEventListener?.("childadded", this._onStructure);
    object.addEventListener?.("childremoved", this._onStructure);
  }

  /** 一棵顶层子树的剪法；顶层节点自己是整棵不可画的骨头时剪它本身。 */
  _ScanTop(top) {
    const next = this.next;
    next.length = 0;
    if (!this._Scan(top, next) && top.isBone) next.push(top);
    this._ApplyTop(top, next);
  }

  /** 按新的剪法藏 / 还原这棵树里的骨头。list 为 null：这棵树离开了场景，全部还原并忘掉。 */
  _ApplyTop(top, list) {
    const old = this.tops.get(top);
    const keep = new Set();
    if (list) for (const bone of list) {
      if (old?.has(bone)) {
        keep.add(bone);
        bone.visible = false;              // 自己的：别人中途打开过也收回来
      } else if (bone.visible !== false) {
        bone.visible = false;
        keep.add(bone);
      }                                    // 别人藏的，不碰
    }
    if (old) for (const bone of old) if (!keep.has(bone)) bone.visible = true;
    if (keep.size) this.tops.set(top, keep);
    else this.tops.delete(top);
  }

  /** 返回这棵子树里有没有可画物体；把「最上层、整棵不可画」的子骨头推进 out。 */
  _Scan(object, out) {
    this._Watch(object);
    let renderable = IsRenderable(object);
    let candidates = null;
    const children = object.children;
    for (let i = 0; i < children.length; i += 1) {
      const child = children[i];
      if (this._Scan(child, out)) renderable = true;
      else if (child.isBone) (candidates ??= []).push(child);
    }
    // 自己也是一整棵可剪的骨头时交给上一层：只剪最上层那一根。
    if (candidates && !(object.isBone && !renderable)) for (const bone of candidates) out.push(bone);
    return renderable;
  }

  /** 取证用：当前被跳过的节点总数（整棵子树都算）。 */
  PrunedNodeCount() {
    let n = 0;
    for (const bone of this.pruned) bone.traverse(() => { n += 1; });
    return n;
  }

  _RestoreAll() {
    for (const bones of this.tops.values()) for (const bone of bones) bone.visible = true;
    this.tops.clear();
    this.dirtyTops.clear();
    this.stats.roots = 0;
  }
}
