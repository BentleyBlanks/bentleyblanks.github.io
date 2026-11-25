// 独立场景文件加载器（纯模块，零 three、零 DOM，不依赖 Script_DevTools）。
//
// 让测试场与非编辑器关卡也能像 Unity / UE 一样直接挂接 Taierzhuang1938/Scenes/<Id>/Scene_<Id>.json：
//   · BuildField 在 new World(...) 之前 await phase.sceneAsset?.Prepare?.()；
//   · 每次进场实时读取场景 JSON（支持平地 terrain.kind="flat"、高度图 .height.bin、样条壕沟与 inherit）；
//   · 保留测试场自己的 phase.id / sky / zones / loadoutOverride / whitebox 开关，仅注入 sceneAsset.layout。

import { SceneDir, SceneFileName, BlockoutDocFromScene, ValidateScene } from "./Script_SceneDoc.mjs";
import { FetchResolvedScene } from "./Script_SceneInherit.mjs";
import { PrepareSceneTerrain } from "./Script_SceneTrenches.mjs";
import { LayoutFromSceneDoc } from "./Script_EditorBlockoutLevels.mjs";

/** 根据场景 ID 返回标准相对 URL。 */
export function SceneUrlFor(sceneId) {
  return `./${SceneDir(sceneId)}/${SceneFileName(sceneId)}`;
}

/**
 * 给一个 phase 挂接独立场景文件（返回浅拷贝的新 phase，不改动原冻结数据常量）。
 *
 * @param {object} basePhase 关卡 / 测试场基础 phase
 * @param {string} sceneId 场景目录 ID（须登记在 Data_SceneAssets.SCENE_LIST）
 * @param {{ syncBounds?: boolean, syncSpawn?: boolean, objectMarginM?: number, layoutTransform?: (layout, doc, plan) => object }} [options]
 */
export function AttachSceneAsset(basePhase, sceneId, options = {}) {
  const url = SceneUrlFor(sceneId);
  const phase = {
    ...basePhase,
    whitebox: basePhase.whitebox ? { ...basePhase.whitebox } : {},
  };
  const asset = {
    sceneId,
    url,
    doc: null,
    heights: null,
    trenchPlan: null,
    layout: null,
    error: null,
    SceneUrl() { return url; },
    async Prepare() {
      const resolved = await FetchResolvedScene(url, { bustCache: true });
      const check = ValidateScene(resolved.doc);
      if (!check.ok) throw new Error(`测试场景 ${sceneId} 校验失败：${check.errors.slice(0, 3).join("；")}`);
      const { heights, plan } = PrepareSceneTerrain(resolved.doc, resolved.heights, resolved.datumBytes);
      const blockoutDoc = BlockoutDocFromScene(resolved.doc, heights, {
        level: sceneId,
        objectMarginM: options.objectMarginM ?? 1,
        trenchPlan: plan,
      });
      let layout = LayoutFromSceneDoc(blockoutDoc);
      if (typeof options.layoutTransform === "function") {
        layout = options.layoutTransform(layout, resolved.doc, plan, resolved.heights, phase) || layout;
      }
      asset.doc = resolved.doc;
      asset.heights = heights;
      asset.trenchPlan = plan;
      asset.layout = layout;
      asset.error = null;
      phase.whitebox = { ...(phase.whitebox || {}), layout };
      if (options.syncBounds && resolved.doc.bounds) phase.bounds = { ...resolved.doc.bounds };
      if (options.syncSpawn && resolved.doc.spawn) {
        phase.spawn = {
          x: resolved.doc.spawn.x,
          z: resolved.doc.spawn.z,
          ry: (Number.isFinite(resolved.doc.spawn.yawDeg) ? resolved.doc.spawn.yawDeg : 0) * Math.PI / 180,
        };
      }
      return layout;
    },
  };
  phase.sceneAsset = asset;
  return phase;
}
