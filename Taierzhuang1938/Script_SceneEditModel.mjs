// 场景编辑器的数据层（docs/Data_Scene.md §6）：一份场景文档 + 选中 + 撤销 / 重做。
//
// 纯模块：零 three、零 DOM，node 测试直接用。界面（Script_SceneEditor）只调这里的操作，不直接改 objects。
// 每个操作记一条撤销记录：按数组下标记「之前 / 之后」的物件快照（null = 那时没有），撤销倒着放回去，
// 所以加、删、改名、改字段都走同一条路，文件里物件的先后顺序也原样回来。

import { SCENE_ASSETS, SCENE_MATERIALS } from "./Data_SceneAssets.mjs";
import { ValidateScene } from "./Script_SceneDoc.mjs";

const Clone = (value) => JSON.parse(JSON.stringify(value));
const Round = (value, step) => Math.round(value / step) * step;
/** 位置、尺寸记到厘米，角度记到 0.01°（拖手柄出来的数不留一长串小数）。 */
export const SCENE_EDIT_PRECISION = Object.freeze({ posM: 0.01, sizeM: 0.01, yawDeg: 0.01, minSizeM: 0.02 });
const P = SCENE_EDIT_PRECISION;
const Fix = (value, step) => Number(Round(value, step).toFixed(6));

export class SceneEditModel {
  constructor(doc) {
    this.Load(doc);
  }

  /** 换一份文档（读盘 / 外部改过重读）：撤销记录清空、选中按 id 保留还在的。 */
  Load(doc) {
    const keep = this.selection ? [...this.selection] : [];
    this.doc = Clone(doc);
    this.undo = [];
    this.redo = [];
    // 每条改动一个编号；「现在」= 撤销栈顶那条的编号（空栈 0）。撤销再改出来的是新编号，不会撞上存盘时那个
    this.seq = this.seq || 0;
    this.savedState = 0;
    this.Reindex();
    this.selection = new Set(keep.filter(id => this.byId.has(id)));
  }

  Reindex() {
    this.byId = new Map(this.doc.objects.map((obj, i) => [obj.id, i]));
  }

  get objects() { return this.doc.objects; }
  get state() { return this.undo.length ? this.undo[this.undo.length - 1].sid : 0; }
  get dirty() { return this.state !== this.savedState; }
  MarkSaved() { this.savedState = this.state; }

  Find(id) {
    const i = this.byId.get(id);
    return i === undefined ? null : this.doc.objects[i];
  }

  /** 层级：group → 物件 id（组按名字排，组里按文件顺序）；没写 group 的归「（未分组）」。 */
  Groups() {
    const groups = new Map();
    for (const obj of this.doc.objects) {
      const key = obj.group || "（未分组）";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(obj.id);
    }
    return new Map([...groups].sort((a, b) => a[0].localeCompare(b[0], "zh-CN")));
  }

  /** 场景里出现过的信号（hideOn / showOn），排好序。 */
  Signals() {
    const set = new Set();
    for (const obj of this.doc.objects) { if (obj.hideOn) set.add(obj.hideOn); if (obj.showOn) set.add(obj.showOn); }
    return [...set].sort();
  }

  // ---------------------------------------------------------------- 选中

  Select(ids, { add = false, toggle = false } = {}) {
    if (!add && !toggle) this.selection.clear();
    for (const id of ids) {
      if (!this.byId.has(id)) continue;
      if (toggle && this.selection.has(id)) this.selection.delete(id);
      else this.selection.add(id);
    }
    return [...this.selection];
  }

  Selected() { return [...this.selection].map(id => this.Find(id)).filter(Boolean); }

  // ---------------------------------------------------------------- 改动（每个都进撤销）

  /** 记一条改动：changes = [{ index, before, after }]，按执行顺序。 */
  Push(label, changes) {
    if (!changes.length) return false;
    this.undo.push({ label, changes, sid: ++this.seq });
    if (this.undo.length > 400) this.undo.shift();
    this.redo = [];
    return true;
  }

  /** 原地改一批物件：fn(obj) 直接改传进去的副本；返回改了几个。 */
  Mutate(label, ids, fn) {
    const changes = [];
    for (const id of ids) {
      const index = this.byId.get(id);
      if (index === undefined) continue;
      const before = this.doc.objects[index];
      const after = Clone(before);
      fn(after);
      if (JSON.stringify(after) === JSON.stringify(before)) continue;
      this.doc.objects[index] = after;
      changes.push({ index, before, after });
    }
    this.Push(label, changes);
    return changes.length;
  }

  /** 平移（米）。y 为 null（落地）的物件竖直挪动时，groundY(obj) 给它此刻的底面高度，挪完就不再落地。 */
  MoveBy(ids, dx, dy, dz, { groundY = null, label = "移动" } = {}) {
    return this.Mutate(label, ids, (obj) => {
      obj.pos[0] = Fix(obj.pos[0] + dx, P.posM);
      obj.pos[2] = Fix(obj.pos[2] + dz, P.posM);
      if (dy !== 0) {
        const base = obj.pos[1] === null ? (groundY ? groundY(obj) : 0) : obj.pos[1];
        obj.pos[1] = Fix(base + dy, P.posM);
      }
    });
  }

  /** 绕竖轴转（度），围着 pivot（x, z）一起转；不给 pivot 就各转各的。 */
  RotateBy(ids, dYawDeg, pivot = null) {
    const rad = dYawDeg * Math.PI / 180, c = Math.cos(rad), s = Math.sin(rad);
    return this.Mutate("旋转", ids, (obj) => {
      const yaw = Fix(((obj.yawDeg || 0) + dYawDeg + 540) % 360 - 180, P.yawDeg);
      if (yaw === 0) delete obj.yawDeg; else obj.yawDeg = yaw;
      if (pivot) {
        // three 的 rotation.y：(x, z) 绕 y 转 θ → (x cosθ + z sinθ, −x sinθ + z cosθ)
        const x = obj.pos[0] - pivot.x, z = obj.pos[2] - pivot.z;
        obj.pos[0] = Fix(pivot.x + x * c + z * s, P.posM);
        obj.pos[2] = Fix(pivot.z - x * s + z * c, P.posM);
      }
    });
  }

  /** 改一个字段（value 为 undefined = 删掉这个字段）。pos / size 传整个数组。 */
  SetField(ids, key, value, label = `改 ${key}`) {
    return this.Mutate(label, ids, (obj) => {
      if (value === undefined) { delete obj[key]; return; }
      if (key === "pos") obj.pos = [Fix(value[0], P.posM), value[1] === null ? null : Fix(value[1], P.posM), Fix(value[2], P.posM)];
      else if (key === "size") obj.size = value.map(v => Math.max(P.minSizeM, Fix(v, P.sizeM)));
      else if (key === "yawDeg") { const yaw = Fix(((value % 360) + 540) % 360 - 180, P.yawDeg); if (yaw === 0) delete obj.yawDeg; else obj.yawDeg = yaw; }
      else obj[key] = Clone(value);
    });
  }

  /** 落地开关：on → y 写 null；off → y 写成此刻的底面高度（groundY 给）。 */
  SetGrounded(ids, on, groundY) {
    return this.Mutate(on ? "落地" : "取消落地", ids, (obj) => {
      if (on) obj.pos[1] = null;
      else if (obj.pos[1] === null) obj.pos[1] = Fix(groundY ? groundY(obj) : 0, P.posM);
    });
  }

  /** 不重名的 id：base 已经带数字尾巴就接着往上数。 */
  FreeId(base) {
    const stem = String(base || "Object").replace(/[^A-Za-z0-9_\-.]/g, "_").replace(/_?\d+$/, "") || "Object";
    if (!this.byId.has(base) && base) return base;
    for (let n = 1; ; n++) {
      const id = `${stem}_${String(n).padStart(2, "0")}`;
      if (!this.byId.has(id)) return id;
    }
  }

  /** 插入一批新物件（插在同组最后一个后面，组不存在就放最后）；返回新 id。 */
  Insert(label, objects) {
    const changes = [];
    const ids = [];
    for (const raw of objects) {
      const obj = Clone(raw);
      obj.id = this.FreeId(obj.id);
      let index = this.doc.objects.length;
      for (let i = this.doc.objects.length - 1; i >= 0; i--) if ((this.doc.objects[i].group || "") === (obj.group || "")) { index = i + 1; break; }
      this.doc.objects.splice(index, 0, obj);
      this.Reindex();
      changes.push({ index, before: null, after: obj });
      ids.push(obj.id);
    }
    this.Push(label, changes);
    return ids;
  }

  /** 从资产目录加一个新物件。 */
  Add(assetId, { pos, material, size = null, group, layer, params } = {}) {
    const asset = SCENE_ASSETS[assetId];
    if (!asset) throw new Error(`资产目录里没有 ${assetId}`);
    const obj = { id: assetId.split("/").pop(), asset: assetId };
    // 体块必须有材质（没给就取目录第一个）；道具、树的样子是模型，给了才写
    if (asset.kind === "box") obj.material = material && SCENE_MATERIALS[material] ? material : Object.keys(SCENE_MATERIALS)[0];
    else if (material && SCENE_MATERIALS[material]) obj.material = material;
    size = size || asset.size || [1, 1, 1];
    obj.pos = [Fix(pos?.[0] ?? 0, P.posM), pos?.[1] == null ? null : Fix(pos[1], P.posM), Fix(pos?.[2] ?? 0, P.posM)];
    if (asset.sized) obj.size = size.map(v => Math.max(P.minSizeM, Fix(v, P.sizeM)));
    if (asset.layer || layer) obj.layer = asset.layer || layer;
    if (group) obj.group = group;
    if (params || !asset.sized) obj.params = Clone(params || {});
    const [id] = this.Insert(`加 ${asset.label}`, [obj]);
    this.Select([id]);
    return id;
  }

  /** 复制选中的物件，平移 offset（米）。 */
  Duplicate(ids, offset = [1, 0, 1]) {
    const copies = ids.map(id => this.Find(id)).filter(Boolean).map(obj => {
      const copy = Clone(obj);
      copy.pos = [Fix(copy.pos[0] + offset[0], P.posM), copy.pos[1] === null ? null : Fix(copy.pos[1] + offset[1], P.posM), Fix(copy.pos[2] + offset[2], P.posM)];
      return copy;
    });
    const newIds = this.Insert("复制", copies);
    this.Select(newIds);
    return newIds;
  }

  Delete(ids) {
    const indices = ids.map(id => this.byId.get(id)).filter(i => i !== undefined).sort((a, b) => b - a);
    const changes = [];
    for (const index of indices) {
      const [before] = this.doc.objects.splice(index, 1);
      changes.push({ index, before, after: null });
    }
    this.Reindex();
    for (const id of ids) this.selection.delete(id);
    this.Push("删除", changes);
    return changes.length;
  }

  /** 改名：新名字已被占用 / 不合法时抛错，不改。 */
  Rename(id, newId) {
    if (id === newId) return false;
    if (typeof newId !== "string" || !/^[A-Za-z0-9_\-.]{1,96}$/.test(newId)) throw new Error("名字只能用字母、数字、_ - .，至多 96 字");
    if (this.byId.has(newId)) throw new Error(`${newId} 已经有了`);
    const index = this.byId.get(id);
    if (index === undefined) return false;
    const before = this.doc.objects[index];
    const after = { ...Clone(before), id: newId };
    this.doc.objects[index] = after;
    this.Reindex();
    if (this.selection.delete(id)) this.selection.add(newId);
    return this.Push("改名", [{ index, before, after }]);
  }

  // ---------------------------------------------------------------- 撤销 / 重做

  Apply(changes, backward) {
    const list = backward ? [...changes].reverse() : changes;
    for (const { index, before, after } of list) {
      const from = backward ? after : before, to = backward ? before : after;
      if (from && to) this.doc.objects[index] = Clone(to);
      else if (from && !to) this.doc.objects.splice(index, 1);
      else if (!from && to) this.doc.objects.splice(index, 0, Clone(to));
    }
    this.Reindex();
    for (const id of [...this.selection]) if (!this.byId.has(id)) this.selection.delete(id);
    return list.map(c => (backward ? c.before : c.after)?.id || (backward ? c.after : c.before)?.id);
  }

  Undo() {
    const step = this.undo.pop();
    if (!step) return null;
    this.redo.push(step);
    this.Apply(step.changes, true);
    return step.label;
  }

  Redo() {
    const step = this.redo.pop();
    if (!step) return null;
    this.undo.push(step);
    this.Apply(step.changes, false);
    return step.label;
  }

  ToDoc() { return Clone(this.doc); }
  Validate() { return ValidateScene(this.doc); }
}
