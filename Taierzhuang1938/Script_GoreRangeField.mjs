// 断肢测试场实景院落（?gore=1）：1938 滕县城郊军事练兵靶场。
//
// 静态几何（砖石院墙、沙袋胸墙/防爆护堤、白刃反差白灰墙、青石步道、石灰环线、指挥观察坪）
// 与路牌锚点统一来自独立场景文件 Scenes/TestGore/Scene_TestGore.json；
// 军用漆模板字路牌通过一张合批 Canvas atlas 渲染。
import * as THREE from "three";
import { TestSceneField, AddAtlasSignToSink } from "./Script_TestSceneField.mjs";
import { T } from "./Script_Text.mjs";
import {
  GORE_RANGE_ID, GORE_RANGE_WORLD, GORE_RANGE_CAMERA_FAR, GORE_RANGE_STATIONS,
  GORE_RANGE_POSTS, GORE_LINE_RANGES, GORE_CRATER,
} from "./Data_GoreRange.mjs";

/** 路牌清单（军用漆板：一次 draw call 画完全场文字）。 */
export function GoreRangeSigns() {
  return [
    { id: "Welcome", text: T("range.gore.signWelcome"), sub: T("range.gore.signWelcomeSub") },
    ...GORE_RANGE_STATIONS.map((station) => ({
      id: station.id,
      text: station.name,
      sub: station.id === "GoreLine" ? T("range.gore.signLineSub")
        : station.id === "GoreCrater" ? T("range.gore.signCraterSub")
          : station.id === "GoreBlade" ? T("range.gore.signBladeSub")
            : T("range.gore.signDeckSub"),
    })),
    ...GORE_RANGE_POSTS.map((post) => ({
      id: post.id,
      text: post.id,
      sub: post.rangeM ? T("range.gore.signDistance", { value: post.rangeM })
        : post.ringM ? T("range.gore.signRing", { value: post.ringM })
          : T("range.gore.signBladePost"),
    })),
    ...GORE_CRATER.rings.map((ring) => ({
      id: `Ring${ring}`, text: T("range.gore.signRing", { value: ring }), sub: "",
    })),
    ...GORE_LINE_RANGES.map((range) => ({
      id: `Dist${range}`, text: T("range.gore.signDistance", { value: range }), sub: "",
    })),
    { id: "Centre", text: T("range.gore.signCentre"), sub: "" },
  ];
}

function MakeMilitarySignAtlas(signs) {
  const cols = 4, tileW = 768, tileH = 160, rows = Math.ceil(signs.length / cols);
  const canvas = document.createElement("canvas");
  canvas.width = cols * tileW; canvas.height = rows * tileH;
  const ctx = canvas.getContext("2d"), rects = new Map();
  ctx.fillStyle = "#1b1f1c";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  signs.forEach((sign, i) => {
    const x = (i % cols) * tileW, y = Math.floor(i / cols) * tileH;
    // 炭绿底 + 橄榄边框 + 左侧黄铜强调条（与 .shellImpactLab 面板视觉统一）
    ctx.fillStyle = "#1b1f1c";
    ctx.fillRect(x + 4, y + 4, tileW - 8, tileH - 8);
    ctx.strokeStyle = "rgba(193,189,171,0.38)";
    ctx.lineWidth = 4;
    ctx.strokeRect(x + 6, y + 6, tileW - 12, tileH - 12);
    ctx.fillStyle = "#d9bb7b";
    ctx.fillRect(x + 6, y + 6, 12, tileH - 12);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#ece9dc";
    ctx.font = "bold 46px serif";
    ctx.fillText(sign.text, x + tileW / 2 + 4, sign.sub ? y + 58 : y + 82, tileW - 56);
    if (sign.sub) {
      ctx.fillStyle = "#b8b49f";
      ctx.font = "25px sans-serif";
      ctx.fillText(sign.sub, x + tileW / 2 + 4, y + 118, tileW - 56);
    }
    rects.set(sign.id, {
      u0: (x + 4) / canvas.width, u1: (x + tileW - 4) / canvas.width,
      v0: 1 - (y + tileH - 4) / canvas.height, v1: 1 - (y + 4) / canvas.height,
    });
  });
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return { texture, rects };
}

export class GoreRangeField extends TestSceneField {
  constructor(scene, library, options = {}) {
    super(scene, library, {
      bounds: GORE_RANGE_WORLD,
      zones: GORE_RANGE_STATIONS,
      levelId: GORE_RANGE_ID,
      defaultSector: "GoreRange",
      defaultColliderTag: "goreFixture",
      defaultRoughness: 0.93,
      ...options,
    });
    this.worldLimits = GORE_RANGE_WORLD;
    this.cameraFar = GORE_RANGE_CAMERA_FAR;
    this.signManifest = GoreRangeSigns();
  }

  BuildExtraStructures(sink, materialMap) {
    const atlas = MakeMilitarySignAtlas(this.signManifest);
    this.ownedTextures.push(atlas.texture);
    const signMat = new THREE.MeshStandardMaterial({
      name: "GoreRangeSigns",
      map: atlas.texture,
      roughness: 0.78,
      metalness: 0.05,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    this.ownedMaterials.set("GoreRangeSigns", signMat);
    materialMap.set("GoreRangeSigns", signMat);
    sink.SetSector("GoreSigns");
    for (const marker of this.Markers((m) => !!m.meta?.signId)) {
      const { signId, w = 3.4, h = 0.72, ground = false } = marker.meta;
      AddAtlasSignToSink(sink, "GoreRangeSigns", atlas, signId,
        marker.x, marker.y ?? 0, marker.z, w, h, ground ? -Math.PI / 2 : 0, marker.ry || 0);
    }
  }

  *BuildSteps() {
    yield { label: T("range.build.goreStations"), progress: 0.3 };
    this.BuildGround();
    this.BuildStructures();
    for (const mesh of this.meshes) {
      if (mesh.material?.name === "GoreRangeSigns") mesh.castShadow = false;
    }
    this.BuildCollisionGrid();
    yield { label: T("range.build.goreReady"), progress: 1 };
  }
}

export default GoreRangeField;
