import * as THREE from 'three';

// Six sparse shells share the collision-deformed feather mesh and one shader program.
export const FEATHER_FUR_LENGTH = .024;
export const FEATHER_FUR_PASSES = 6;
export function PrepareFeatherStrands(geometry) {
  // Each authored barb is a connected tube with six rings. Use its own direction,
  // rather than world-space noise, to keep the secondary fibers combed root to tip.
  const positions = geometry.attributes.position, indices = geometry.index;
  const parents = Array.from({ length: positions.count }, (_, i) => i);
  const Find = i => { while (parents[i] !== i) { parents[i] = parents[parents[i]]; i = parents[i]; } return i; };
  for (let i = 0; i < indices.count; i += 3) {
    const root = Find(indices.getX(i));
    parents[Find(indices.getX(i + 1))] = root;
    parents[Find(indices.getX(i + 2))] = root;
  }
  const strands = new Map();
  for (let i = 0; i < positions.count; i++) {
    const key = Find(i);
    if (!strands.has(key)) strands.set(key, []);
    strands.get(key).push(i);
  }
  const uv = new Float32Array(positions.count * 3), tangents = new Float32Array(positions.count * 3);
  const contactRings = [];
  const Comb = point => { const radius = Math.hypot(point.x, point.z);point.y -= .55 * radius * radius / (1 + radius);return point; };
  let strandId = 0;
  for (const vertices of strands.values()) {
    const rings = new Map();
    for (const i of vertices) {
      const key = Math.round(positions.getY(i) * 100000);
      if (!rings.has(key)) rings.set(key, { center: new THREE.Vector3(), vertices: [] });
      const ring = rings.get(key);
      ring.center.add(new THREE.Vector3().fromBufferAttribute(positions, i));ring.vertices.push(i);
    }
    const ordered = [...rings.values()];
    ordered.forEach(ring => ring.center.divideScalar(ring.vertices.length));
    ordered.sort((a, b) => b.center.y - a.center.y);
    ordered.forEach(ring => Comb(ring.center));
    ordered.forEach((ring, j) => {
      contactRings.push(ring.vertices);
      const tangent = ordered[Math.min(j + 1, ordered.length - 1)].center.clone().sub(ordered[Math.max(0, j - 1)].center).normalize();
      for (const i of ring.vertices) {
        uv.set([j / Math.max(1, ordered.length - 1), Math.atan2(positions.getZ(i) - ring.center.z, positions.getX(i) - ring.center.x) / (Math.PI * 2), strandId], i * 3);
        tangents.set(tangent.toArray(), i * 3);
      }
    });
    strandId++;
  }
  const point = new THREE.Vector3();
  for (let i = 0; i < positions.count; i++) {
    Comb(point.fromBufferAttribute(positions, i));positions.setXYZ(i, point.x, point.y, point.z);
  }
  positions.needsUpdate = true;
  geometry.computeVertexNormals();geometry.computeBoundingBox();geometry.computeBoundingSphere();
  geometry.setAttribute('featherUv', new THREE.BufferAttribute(uv, 3));
  geometry.setAttribute('featherTangent', new THREE.BufferAttribute(tangents, 3));
  geometry.userData.featherRings = contactRings;
}
export function ClearFeatherFur(part, dispose = true) {
  for (const shell of [...part.children]) if (shell.userData.featherShell) {
    part.remove(shell);
    if (dispose) shell.material.dispose(); // Geometry belongs to the parent feather.
  }
}
export function AddFeatherFur(part, createMaterial, clippingPlanes) {
  for (let i = 1; i <= FEATHER_FUR_PASSES; i++) {
    const material = createMaterial(), compile = material.onBeforeCompile;
    material.name = 'Material_FeatherFurShell';
    material.clippingPlanes = clippingPlanes;
    material.alphaToCoverage = true;
    material.alphaTest = .02;
    material.onBeforeCompile = shader => {
      compile(shader);
      shader.uniforms.furLayer = { value: i / FEATHER_FUR_PASSES };
      shader.uniforms.furLength = { value: FEATHER_FUR_LENGTH };
      shader.vertexShader = 'attribute vec3 featherUv;uniform float furLayer;uniform float furLength;varying vec3 furStrand;\n' + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        furStrand=featherUv;
        float groomTip=smoothstep(0.0,.22,featherUv.x)*(1.0-smoothstep(.84,1.0,featherUv.x));
        transformed+=normalize(normal*.8+featherTangent*furLayer*.6)*furLength*furLayer*groomTip;
      `);
      shader.fragmentShader = 'uniform float furLayer;varying vec3 furStrand;\n' + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace('#include <alphatest_fragment>', `
        float cord=furStrand.y*10.0+furStrand.z*.618+sin(furStrand.x*2.6+furStrand.z)*.10;
        float edge=abs(fract(cord)-.5),aa=max(fwidth(cord),.035);
        float coverage=1.0-smoothstep(.12-furLayer*.055-aa,.29-furLayer*.055+aa,edge);
        coverage=mix(coverage,.22,smoothstep(.3,.9,fwidth(cord)));
        coverage*=smoothstep(0.0,.12,furStrand.x)*(1.0-smoothstep(.82,1.0,furStrand.x));
        diffuseColor.a*=coverage*(.88-furLayer*.3);
        diffuseColor.rgb*=mix(.93,1.0,furLayer);
        #include <alphatest_fragment>
      `);
    };
    material.customProgramCacheKey = () => 'FeatherCombedShellFurV2';
    const shell = new THREE.Mesh(part.geometry, material);
    shell.name = 'Model_FeatherFurShell_' + i;
    shell.userData.featherShell = true;
    shell.frustumCulled = false;
    part.add(shell);
  }
}
