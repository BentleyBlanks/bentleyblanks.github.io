// 白刃战全身动画库的加载器：把 Animation/Melee/*.json 拉下来灌进 Data_MeleeAnimationSets
// 的表头对象（原地灌、不换引用，Script_MeleeAnimation 里持有的引用照旧有效）。
//
// 时机：Script_Main 在主菜单出现后调 LoadMeleeAnimations()（不 await），白刃实验室
// （?melee=1）与相关测试则在开机时 await 它，保证摆姿势时数据已在。
// 采样函数在数据没到之前也会顺手调一次 —— 玩家真在数据到来前进了白刃，人物停在
// 绑定姿态几秒，不报错；这是 2026-09-07 拆包时接受的退化。
//
// Node 侧（测试/脚本）没有 fetch(file://)：用 InstallMeleeAnimations(set, json) 自己
// 读文件灌入。对账规则在 InstallMeleeAnimations 里，两条路共用。
import { MELEE_ANIMATION_SETS } from "./Data_MeleeAnimationSets.mjs";

const pending = new WeakMap();

/** 把一份 json 库灌进表头对象；表头与 json 对不上视为事故（导出脚本或表头改了一边）。 */
export function InstallMeleeAnimations(set, library) {
  const problems = [];
  if (library.faction !== set.faction) problems.push(`faction ${library.faction} ≠ ${set.faction}`);
  if (library.schema !== set.schema) problems.push(`schema ${library.schema} ≠ ${set.schema}`);
  if (library.frames !== set.frames) problems.push(`frames ${library.frames} ≠ ${set.frames}`);
  if (!Array.isArray(library.parts) || library.parts.length !== set.parts.length
    || library.parts.some((part, i) => part !== set.parts[i])) problems.push("parts 列表与 Data_MeleeAnimationSets 不一致");
  if (problems.length) throw new Error(`[MeleeAnimationData] ${set.url} 与表头对不上：${problems.join("；")}`);
  for (const key of Object.keys(set.clips)) delete set.clips[key];
  Object.assign(set.clips, library.clips);
  set.loaded = true;
  return set;
}

async function FetchSet(set) {
  const url = new URL(set.url, import.meta.url);
  const response = await fetch(url, { credentials: "same-origin" });
  if (!response.ok) throw new Error(`[MeleeAnimationData] ${set.url} HTTP ${response.status}`);
  return InstallMeleeAnimations(set, await response.json());
}

/** 加载一份（默认全部）动画库；同一份只拉一次，失败的那份下次调用会重试。 */
export function LoadMeleeAnimations(sets = MELEE_ANIMATION_SETS) {
  return Promise.all(sets.map((set) => {
    if (set.loaded) return set;
    let task = pending.get(set);
    if (!task) {
      task = FetchSet(set).catch((error) => {
        pending.delete(set);
        console.warn(`[MeleeAnimationData] ${set.faction} 动画库没读到，白刃战人物退回绑定姿态：${String(error).slice(0, 200)}`);
        return set;
      });
      pending.set(set, task);
    }
    return task;
  }));
}

export function MeleeAnimationsLoaded(sets = MELEE_ANIMATION_SETS) {
  return sets.every((set) => set.loaded);
}
