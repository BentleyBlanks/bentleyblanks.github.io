// 场景资产目录（docs/Data_Scene.md §3）：场景文件里的物件只写资产编号，编号 → 这是什么、怎么画、在哪个文件，查这张表。
//
// 为什么不直接写文件路径：改文件名、换模型只改这里一行，几千行场景不用动（Unity 的场景存的也是资产的 GUID，不是路径）。
// 编号一旦被场景用上就别改名；要废弃就留着编号、改 note。
//
// 纯数据，零 three。白盒体块的样子由材质决定：白盒场景引用 Whitebox/* 材质，正式场景以后引用 PBR 材质。

/** 资产：kind 决定读取器怎么把它交给建场（sized = 用 size [w, h, d] 定大小）；layer = 只能放在哪一层。 */
export const SCENE_ASSETS = Object.freeze({
  "Whitebox/Box": Object.freeze({ kind: "box", sized: true, label: "白盒体块", note: "米制长方体；样子看 material，碰撞看 solid" }),
  "Backdrop/Box": Object.freeze({ kind: "backdropBox", layer: "backdrop", label: "远景盒子", note: "房墙、屋顶、院墙；params: w d h lift color" }),
  "Backdrop/Blob": Object.freeze({ kind: "backdropBlob", layer: "backdrop", label: "远景树冠", note: "椭球；params: rx rz h lift color" }),
  "Backdrop/Hill": Object.freeze({ kind: "backdropHill", layer: "backdrop", label: "远景低山", note: "params: rx rz h color topColor" }),
  "Backdrop/Tree": Object.freeze({ kind: "backdropTree", layer: "backdrop", label: "远景枯树", note: "params: h" }),
});

/** 白盒材质：编号 → 语义（建场用的材质槽）。颜色在关卡的 semanticColors 里。 */
export const SCENE_MATERIALS = Object.freeze({
  "Whitebox/EarthDark": Object.freeze({ semantic: "earthDark", label: "深土" }),
  "Whitebox/Step": Object.freeze({ semantic: "step", label: "台阶 / 踏脚" }),
  "Whitebox/Timber": Object.freeze({ semantic: "timber", label: "木头" }),
  "Whitebox/Cover": Object.freeze({ semantic: "cover", label: "掩体" }),
  "Whitebox/Plaster": Object.freeze({ semantic: "plaster", label: "土墙 / 抹灰" }),
  "Whitebox/Foliage": Object.freeze({ semantic: "foliage", label: "植物" }),
  "Whitebox/Canvas": Object.freeze({ semantic: "canvas", label: "布 / 席" }),
  "Whitebox/AirWall": Object.freeze({ semantic: "airWall", label: "隐形墙" }),
  "Whitebox/Roof": Object.freeze({ semantic: "roof", label: "屋顶" }),
  "Whitebox/Structure": Object.freeze({ semantic: "structure", label: "建筑结构" }),
  "Whitebox/Water": Object.freeze({ semantic: "water", label: "水" }),
  "Whitebox/Danger": Object.freeze({ semantic: "danger", label: "危险区" }),
  "Whitebox/Metal": Object.freeze({ semantic: "metal", label: "铁件" }),
  "Whitebox/Void": Object.freeze({ semantic: "void", label: "门窗洞暗面" }),
  "Whitebox/Coping": Object.freeze({ semantic: "coping", label: "墙头压顶" }),
});

const SEMANTIC_TO_MATERIAL = Object.freeze(Object.fromEntries(
  Object.entries(SCENE_MATERIALS).map(([id, material]) => [material.semantic, id])));

/** 语义 → 白盒材质编号；没登记的语义返回 null。 */
export function WhiteboxMaterialFor(semantic) {
  return SEMANTIC_TO_MATERIAL[semantic] || null;
}
