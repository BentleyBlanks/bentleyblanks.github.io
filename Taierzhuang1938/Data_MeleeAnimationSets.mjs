// 白刃战全身动画库的**表头**。帧数据本体在 Animation/Melee/*.json（每阵营 7.7 MB），
// 由 Script_MeleeAnimationData 在主菜单出现后异步拉取并原地灌进 `clips`。
//
// 为什么拆开（2026-09-07）：这两份数据原先是 Data_MeleeNraAnimations.mjs /
// Data_MeleeIjaAnimations.mjs 两个 ES 模块，直接进了开机模块图。Pages 打包后它们
// 占了入口 bundle 7.57 MB（gzip 后）里的 6.5 MB，任何一行代码执行之前浏览器都得先
// 把它们拉完 —— 线上前 25 秒一片空白的病根就是这个。本地 localhost 感觉不到。
//
// 契约：
//   - 这里的 `parts` / `frames` / `schema` 必须与 json 里的一致，加载器会对账，
//     对不上按事故报（console.error）并拒绝灌入。
//   - `clips` 在加载完成前是空表；Script_MeleeAnimation 的采样函数拿不到 clip 一律
//     返回 null（沿用原有的「缺 clip 就不摆」退路），人物停在绑定姿态、不报错。
//   - 导出脚本 _import/Script_MeleeVideoBodyExport.py 只写 json，不碰这张表；
//     改了骨骼列表（parts）两边都要改。
//   - json 的 `?v=` 戳与其它资产一样写在这里（不是模块，不归 import map 管）。

const MELEE_PARTS = Object.freeze([
  "Pelvis", "Spine", "Spine1", "Spine2", "Neck", "Head", "L Clavicle", "R Clavicle",
  "L UpperArm", "L Forearm", "L Hand", "R UpperArm", "R Forearm", "R Hand",
  "L Thigh", "L Calf", "L Foot", "R Thigh", "R Calf", "R Foot",
  "L Finger0", "L Finger01", "L Finger02", "L Finger1", "L Finger11", "L Finger12",
  "L Finger2", "L Finger21", "L Finger22", "L Finger3", "L Finger31", "L Finger32",
  "L Finger4", "L Finger41", "L Finger42",
  "R Finger0", "R Finger01", "R Finger02", "R Finger1", "R Finger11", "R Finger12",
  "R Finger2", "R Finger21", "R Finger22", "R Finger3", "R Finger31", "R Finger32",
  "R Finger4", "R Finger41", "R Finger42",
]);

function MeleeAnimationSet(faction, url) {
  return {
    faction, frames: 30, schema: 2, parts: MELEE_PARTS, url,
    source: "BlenderMCP / original bind skeleton; melee attacks and parries from GVHMR video",
    /** 加载完成后为 true；之前 `clips` 为空表。 */
    loaded: false,
    clips: {},
  };
}

export const MELEE_NRA_ANIMATIONS = MeleeAnimationSet("Nra", "./Animation/Melee/Data_MeleeNraAnimations.json?v=202609071900");
export const MELEE_IJA_ANIMATIONS = MeleeAnimationSet("Ija", "./Animation/Melee/Data_MeleeIjaAnimations.json?v=202609071900");
export const MELEE_ANIMATION_SETS = Object.freeze([MELEE_NRA_ANIMATIONS, MELEE_IJA_ANIMATIONS]);
