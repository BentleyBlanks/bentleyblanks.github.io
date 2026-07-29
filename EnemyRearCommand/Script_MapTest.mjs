import assert from "node:assert/strict";
import {
  CanonicalHexEdge,
  HexDistanceKeys,
  ParseHexKey,
} from "./Script_Hex.mjs";
import {
  BuildFrontLines,
  BuildLattice,
  ComputeMapSupplyReach,
  GenerateMap,
  ValidateMap,
} from "./Script_MapGen.mjs";

const seeds = [1, 7, 42, 1937, 20260729, 88888, 0xffffffff];
let assertions = 0;

function Check(condition, message) {
  assertions += 1;
  assert.ok(condition, message);
}

// 边级图层必须能稳定去重。
{
  const a = ParseHexKey("4,2");
  const b = ParseHexKey("5,2");
  const forward = CanonicalHexEdge(a, b);
  const reverse = CanonicalHexEdge(b, a);
  Check(forward?.key === reverse?.key, "CanonicalHexEdge 正反向未归一");
}

for (const seed of seeds) {
  const map = GenerateMap(seed, 26, 20);
  const repeat = GenerateMap(seed, 26, 20);
  const validation = ValidateMap(map);

  Check(validation.ok, `seed ${seed} 地图自检失败：${validation.issues.join("；")}`);
  Check(JSON.stringify(map) === JSON.stringify(repeat), `seed ${seed} 全图 JSON 不可复现`);

  const contactKey = map.initialContactKey;
  Check(Boolean(contactKey && map.hexes[contactKey]), `seed ${seed} 缺少开局接触点`);
  Check(HexDistanceKeys(map.startKey, contactKey) === 2, `seed ${seed} 开局接触点不在第二环`);
  Check(map.hexes[contactKey].explored, `seed ${seed} 开局接触点不可见`);
  Check(map.hexes[contactKey].initialObjective, `seed ${seed} 开局接触点未标为目标`);
  Check(
    map.strongholdSeeds.some((entry) => entry.key === contactKey && entry.era === "Opening"),
    `seed ${seed} 接触点不是开局敌据点`,
  );

  Check(map.frontLines.length > 0 && map.frontSegments.length > 0, `seed ${seed} 动态战线为空`);
  Check(
    map.frontLines.every((edge) => edge.fromKey === edge.a && edge.toKey === edge.b && edge.keys?.[0] === edge.a && edge.keys?.[1] === edge.b),
    `seed ${seed} 战线边缺少渲染兼容契约`,
  );
  Check(map.transportCorridors.length >= 2, `seed ${seed} 交通走廊不足`);
  Check(map.chokePoints.length > 0, `seed ${seed} 缺少咽喉点`);
  Check(map.encirclementSpaces.length > 0, `seed ${seed} 缺少包围候选`);
  Check(
    map.supplyNodes.some((node) => node.camp === "Resistance") &&
      map.supplyNodes.some((node) => node.camp === "Enemy"),
    `seed ${seed} 双方补给节点不齐`,
  );
  const enemySources = map.supplyNodes.filter((node) => node.camp === "Enemy" && node.isSource === true);
  Check(enemySources.length >= 1 && enemySources.length <= 2, `seed ${seed} 敌方外部补给源数量失控：${enemySources.length}`);
  Check(map.supplyNodes.some((node) => node.relayOnly === true), `seed ${seed} 缺少接力节点`);

  for (const edge of map.transportEdges) {
    const forward = map.hexes[edge.a].transportConnections.some(
      (connection) => connection.toKey === edge.b && connection.kind === edge.kind,
    );
    const reverse = map.hexes[edge.b].transportConnections.some(
      (connection) => connection.toKey === edge.a && connection.kind === edge.kind,
    );
    Check(forward && reverse, `seed ${seed} 交通边 ${edge.id} 不是双向`);
  }

  const before = JSON.stringify(map);
  const reach = ComputeMapSupplyReach(map, null, { camp: "Resistance" });
  Check(reach.suppliedKeys.includes(map.startKey), `seed ${seed} 前指未获补给`);
  Check(Object.keys(reach.predecessorByKey).length > 0, `seed ${seed} 补给网未展开`);
  Check(JSON.stringify(map) === before, `seed ${seed} 补给计算修改了输入地图`);

  // control 改变后战线可以独立重算，且不修改 control。
  const lattice = BuildLattice(map.width, map.height);
  const control = Object.fromEntries(map.order.map((key) => [key, map.hexes[key].control]));
  const controlBefore = JSON.stringify(control);
  control[map.startKey] = "Enemy";
  const dynamicFront = BuildFrontLines(lattice, control);
  Check(dynamicFront.edges.length > 0, `seed ${seed} 动态战线重算为空`);
  control[map.startKey] = map.hexes[map.startKey].control;
  Check(JSON.stringify(control) === controlBefore, `seed ${seed} 战线计算修改了 control`);
}

console.log(`EnemyRearCommand 地图测试通过：${assertions} 项断言，${seeds.length} 个种子。`);
