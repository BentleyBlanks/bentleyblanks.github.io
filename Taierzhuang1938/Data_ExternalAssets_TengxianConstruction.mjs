// 滕县县城与外围战场的自制构件包。
//
// 六件网格由 _blender/Script_BuildTengxianConstructionKit.py 以 Blender
// 程序化生成，并保留 Scene_TengxianConstructionKit.blend 作为可复现源文件。
// 历史照片与 imagegen 概念板只在项目外的临时工作目录中作形制参考，均未打包；
// GLB 内不含第三方几何或贴图，运行时统一重绑项目 PBR 材质。
//
// 这些条目刻意没有进入 Script_ExternalProps.PLACEMENTS。构件库会收录整个
// catalog，关卡布设则必须另行经历史、性能与战术审查。

export const PACK = Object.freeze({
  id: "TengxianConstructionKit",
  url: "./Model/Model_TengxianConstructionKit.glb?v=1",
});

export const ASSETS = Object.freeze({
  tengxianShopFacade: {
    label: "滕县临街铺面", node: "TengxianShopFacade", materialMap: true,
    tag: "wall", category: "建筑",
  },
  tengxianCourtyardHouse: {
    label: "滕县一进院落", node: "TengxianCourtyardHouse", materialMap: true,
    tag: "wall", category: "建筑",
  },
  tengxianCountyOfficeGatehouse: {
    label: "滕县县署门楼", node: "TengxianCountyOfficeGatehouse", materialMap: true,
    tag: "wall", category: "建筑",
  },
  tengxianCityGateTower: {
    label: "滕县城门楼", node: "TengxianCityGateTower", materialMap: true,
    tag: "wall", category: "建筑",
  },
  tengxianRailwayStation: {
    label: "津浦铁路三等站（推定）", node: "TengxianRailwayStation", materialMap: true,
    tag: "wall", category: "建筑",
  },
  tengxianOutfieldDefenseKit: {
    label: "城外防御工事组合", node: "TengxianOutfieldDefenseKit", materialMap: true,
    tag: "barricade", category: "工事",
  },
});
