// 白盒米格线（程序化，不要贴图 / UV；缩放过的实例、合批也对）：白盒场景的材质与场景编辑器共用。
// 远处一格小于一个像素时按导数淡掉，不闪。只经 Script_MaterialPatches 注册表插 GLSL（项目契约 11）。

import * as THREE from "three";
import { MakePatch } from "./Script_MaterialPatches.mjs";

/** @param {{ gridSize: number, gridLineWidth: number, gridColor: string }} config 格距 / 线宽（米）/ 线色 */
export function MakeWhiteboxGridPatch(config) {
  return MakePatch({
    key: "whiteboxGrid1",
    uniforms: (uniforms) => Object.assign(uniforms, {
      uWhiteboxGridSize: { value: config.gridSize },
      uWhiteboxGridWidth: { value: config.gridLineWidth },
      uWhiteboxGridColor: { value: new THREE.Color(config.gridColor) },
    }),
    vertex: [
      ["#include <common>", "varying vec3 vWhiteboxPosition;"],
      ["#include <project_vertex>", `
        vec4 whiteboxPosition = vec4(transformed, 1.0);
        #ifdef USE_BATCHING
          whiteboxPosition = batchingMatrix * whiteboxPosition;
        #endif
        #ifdef USE_INSTANCING
          whiteboxPosition = instanceMatrix * whiteboxPosition;
        #endif
        vWhiteboxPosition = (modelMatrix * whiteboxPosition).xyz;
      `],
    ],
    fragment: [
      ["#include <common>", `
        varying vec3 vWhiteboxPosition;
        uniform float uWhiteboxGridSize;
        uniform float uWhiteboxGridWidth;
        uniform vec3 uWhiteboxGridColor;
        float WhiteboxGrid(vec2 position) {
          vec2 cell = position / uWhiteboxGridSize;
          vec2 footprint = max(fwidth(cell), vec2(0.00001));
          vec2 distanceToLine = abs(fract(cell + 0.5) - 0.5);
          float halfWidth = min(uWhiteboxGridWidth / uWhiteboxGridSize * 0.5, 0.1);
          vec2 line = 1.0 - smoothstep(vec2(halfWidth), vec2(halfWidth) + footprint, distanceToLine);
          line *= 1.0 - smoothstep(vec2(0.25), vec2(0.5), footprint);
          return max(line.x, line.y);
        }
      `],
      ["#include <color_fragment>", `
        vec3 gridNormal = abs(cross(dFdx(vWhiteboxPosition), dFdy(vWhiteboxPosition)));
        gridNormal /= max(max(gridNormal.x, gridNormal.y), max(gridNormal.z, 0.000001));
        vec3 gridWeight = pow(gridNormal, vec3(8.0));
        gridWeight /= max(dot(gridWeight, vec3(1.0)), 0.000001);
        float gridLine = dot(gridWeight, vec3(WhiteboxGrid(vWhiteboxPosition.yz),
          WhiteboxGrid(vWhiteboxPosition.xz), WhiteboxGrid(vWhiteboxPosition.xy)));
        diffuseColor.rgb = mix(diffuseColor.rgb, uWhiteboxGridColor, gridLine);
      `],
    ],
  });
}
