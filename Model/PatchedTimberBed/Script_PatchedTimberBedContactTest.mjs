// Independent GLB -> world-space vertical surface intersections -> 42 contacts.
// No Blender, Three.js, render shadows, producer receipt or source .blend needed.
// node Model/PatchedTimberBed/Script_PatchedTimberBedContactTest.mjs --comparison
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const argumentsList = process.argv.slice(2);
function Option(name, fallback) { return argumentsList.find(item => item.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback; }
const sampleXs = [-.9, -.6, -.3, 0, .3, .6];
const sampleZs = [-.43, -.38, -.25, 0, .25, .38, .43];
const gapLimit = .002;
const penetrationLimit = .002;
const intendedMicroOverlap = .0005;
const upperSurfaceClearance = .001;
const reportFile = path.resolve(repositoryRoot, Option('report', 'tmp/BedBnBsAcceptance/Data_ContactReview.json'));

function Identity() { return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]; }
function Multiply(a, b) {
  const result = new Array(16).fill(0);
  for (let column = 0; column < 4; column++) for (let row = 0; row < 4; row++) for (let k = 0; k < 4; k++) result[column * 4 + row] += a[k * 4 + row] * b[column * 4 + k];
  return result;
}
function NodeMatrix(node) {
  if (node.matrix) return node.matrix;
  const [x, y, z, w] = node.rotation ?? [0, 0, 0, 1], [sx, sy, sz] = node.scale ?? [1, 1, 1];
  const [tx, ty, tz] = node.translation ?? [0, 0, 0];
  return [(1 - 2 * (y * y + z * z)) * sx, 2 * (x * y + z * w) * sx, 2 * (x * z - y * w) * sx, 0,
    2 * (x * y - z * w) * sy, (1 - 2 * (x * x + z * z)) * sy, 2 * (y * z + x * w) * sy, 0,
    2 * (x * z + y * w) * sz, 2 * (y * z - x * w) * sz, (1 - 2 * (x * x + y * y)) * sz, 0, tx, ty, tz, 1];
}
function ReadGlb(bytes) {
  assert.equal(bytes.toString('ascii', 0, 4), 'glTF', 'GLB magic');
  assert.equal(bytes.readUInt32LE(4), 2, 'GLB version');
  assert.equal(bytes.readUInt32LE(8), bytes.length, 'GLB length');
  let document, binary;
  for (let offset = 12; offset < bytes.length;) {
    const length = bytes.readUInt32LE(offset), type = bytes.readUInt32LE(offset + 4);
    assert.ok(offset + 8 + length <= bytes.length && length % 4 === 0, 'valid GLB chunk');
    if (type === 0x4e4f534a) document = JSON.parse(bytes.subarray(offset + 8, offset + 8 + length).toString('utf8').trim());
    if (type === 0x004e4942) binary = bytes.subarray(offset + 8, offset + 8 + length);
    offset += 8 + length;
  }
  assert.ok(document && binary, 'GLB JSON and BIN');
  assert.equal(document.buffers.length, 1, 'one embedded geometry buffer');
  assert.ok(!document.buffers[0].uri, 'no external geometry');
  return { document, binary };
}
function Accessor(document, binary, index) {
  const item = document.accessors[index];
  assert.ok(item && item.bufferView !== undefined && !item.sparse, `dense accessor ${index}`);
  const view = document.bufferViews[item.bufferView];
  const components = { SCALAR: 1, VEC3: 3 }[item.type];
  const layouts = { 5121: [1, Uint8Array, 'readUInt8'], 5123: [2, Uint16Array, 'readUInt16LE'], 5125: [4, Uint32Array, 'readUInt32LE'], 5126: [4, Float32Array, 'readFloatLE'] };
  const [width, TypedArray, method] = layouts[item.componentType] ?? [];
  assert.ok(components && width && !item.normalized, `supported position/index accessor ${index}`);
  const stride = view.byteStride ?? width * components;
  const localStart = (view.byteOffset ?? 0) + (item.byteOffset ?? 0);
  const end = (item.byteOffset ?? 0) + Math.max(0, item.count - 1) * stride + width * components;
  assert.ok(end <= view.byteLength && (view.byteOffset ?? 0) + view.byteLength <= binary.length, `accessor ${index} fits binary`);
  if (stride === width * components && (binary.byteOffset + localStart) % width === 0) {
    return { values: new TypedArray(binary.buffer, binary.byteOffset + localStart, item.count * components), count: item.count, components };
  }
  const values = new Float64Array(item.count * components);
  for (let row = 0; row < item.count; row++) for (let component = 0; component < components; component++) values[row * components + component] = binary[method](localStart + row * stride + component * width);
  return { values, count: item.count, components };
}
function RoleOf(nodeName, materialName, baseline) {
  if (baseline) {
    if (/^R(?:80|159)\b/.test(materialName)) return 'quilt';
    if (/^(?:MAT_C_|C35 seated subdued head-end primary reeds|C18 dark worn major reed bindings|C28 weathered split reed fibers|R97 (?:packed straw|narrow straw binding))/.test(materialName)) return 'support';
  }
  if (/^(?:Quilt|BS[_ ]?FootCloth)(?:[._ ]|$)/i.test(nodeName) || /^(?:Material_BedQuilt|BS[_ ]?FootCloth)(?:[._ ]|$)/i.test(materialName)) return 'quilt';
  if (/^(?:Straw|StrawContactCore)(?:[._ ]|$)/i.test(nodeName) || /ContactCore/i.test(nodeName) || /^Material_BedStraw(?:[._ ]|$)/i.test(materialName)) return 'support';
  return null;
}
function Deduplicate(hits) {
  const sorted = hits.slice().sort((a, b) => a.y - b.y), result = [];
  for (const hit of sorted) {
    const previous = result.at(-1);
    if (previous && Math.abs(hit.y - previous.y) < .00001) {
      previous.minNormalY = Math.min(previous.minNormalY, hit.normalY);
      previous.maxNormalY = Math.max(previous.maxNormalY, hit.normalY);
      previous.coincidentFaces++;
    } else result.push({ ...hit, minNormalY: hit.normalY, maxNormalY: hit.normalY, coincidentFaces: 1 });
  }
  return result;
}
function EvaluateSample(sample) {
  const quilt = Deduplicate(sample.quilt), support = Deduplicate(sample.support);
  const lower = quilt[0], upper = quilt.at(-1), strawTop = support.at(-1);
  const lowerCertified = !!lower && (lower.minNormalY < -.08 || (quilt.length >= 2 && lower.maxNormalY > .08 && upper.minNormalY < -.08 && upper.y - lower.y > .002));
  const gap = lowerCertified && strawTop ? lower.y - strawTop.y : null;
  const rawLowestGap = lower && strawTop ? lower.y - strawTop.y : null;
  const violations = [];
  if (!lower) violations.push('MissingQuilt');
  else if (!lowerCertified) violations.push('MissingOrUnprovenLowerShell');
  if (!strawTop) violations.push('MissingStrawSupport');
  if (gap !== null && gap > gapLimit) violations.push('FloatingGapOver2mm');
  if (gap !== null && gap < -penetrationLimit) violations.push('PenetrationOver2mm');
  // A top-only ray must never pass merely because a filler rose to the top face.
  if (strawTop && upper && strawTop.y > upper.y - upperSurfaceClearance) violations.push('SupportReachesVisibleUpperShell');
  return { x: sample.x, z: sample.z, result: violations.length ? 'FAIL' : 'PASS', violations, lowerCertified,
    gapM: gap, gapMm: gap === null ? null : gap * 1000, rawLowestGapM: rawLowestGap,
    deviationFromIntendedOverlapM: gap === null ? null : gap + intendedMicroOverlap,
    quiltLowerY: lowerCertified ? lower.y : null, quiltUpperY: upper?.y ?? null,
    rawQuiltLowestY: lower?.y ?? null, supportTopY: strawTop?.y ?? null,
    shellThicknessM: lowerCertified && upper ? upper.y - lower.y : null,
    quiltIntersections: quilt, supportIntersections: support };
}
function Median(values) { if (!values.length) return null; const sorted = values.slice().sort((a, b) => a - b); return (sorted[Math.floor((sorted.length - 1) / 2)] + sorted[Math.ceil((sorted.length - 1) / 2)]) / 2; }

async function Inspect(file, baseline) {
  const bytes = await fs.readFile(file), { document, binary } = ReadGlb(bytes);
  const samples = sampleZs.flatMap(z => sampleXs.map(x => ({ x, z, quilt: [], support: [] })));
  const groups = { quilt: { triangles: 0, primitives: 0 }, support: { triangles: 0, primitives: 0 } };
  const selected = [];
  function Visit(nodeIndex, parentMatrix, ancestry = new Set()) {
    assert.ok(!ancestry.has(nodeIndex), 'node graph has no cycles');
    const nextAncestry = new Set(ancestry).add(nodeIndex), node = document.nodes[nodeIndex];
    const matrix = Multiply(parentMatrix, NodeMatrix(node)); assert.ok(matrix.every(Number.isFinite), 'finite node matrix');
    if (node.mesh !== undefined) for (const [primitiveIndex, primitive] of document.meshes[node.mesh].primitives.entries()) {
      const material = document.materials[primitive.material], role = RoleOf(node.name ?? '', material?.name ?? '', baseline);
      if (!role) continue;
      assert.equal(primitive.mode ?? 4, 4, 'triangle mesh');
      const positions = Accessor(document, binary, primitive.attributes.POSITION);
      assert.equal(positions.components, 3, '3D positions');
      const indices = primitive.indices === undefined ? { values: Uint32Array.from({ length: positions.count }, (_, index) => index), count: positions.count } : Accessor(document, binary, primitive.indices);
      assert.equal(indices.count % 3, 0, 'complete triangles');
      const world = new Float64Array(positions.count * 3);
      for (let index = 0; index < positions.count; index++) {
        const offset = index * 3, x = positions.values[offset], y = positions.values[offset + 1], z = positions.values[offset + 2];
        for (let axis = 0; axis < 3; axis++) {
          const value = matrix[axis] * x + matrix[axis + 4] * y + matrix[axis + 8] * z + matrix[axis + 12];
          assert.ok(Number.isFinite(value), 'finite transformed positions'); world[offset + axis] = value;
        }
      }
      groups[role].primitives++; groups[role].triangles += indices.count / 3;
      selected.push({ role, node: node.name, material: material?.name, primitive: primitiveIndex, triangles: indices.count / 3 });
      // Exact projected-triangle/ray tests. Join all 42 fixed rays to a triangle
      // in one pass instead of allocating an approximate raster or using bounds
      // as a contact proxy. XZ AABBs only reject; barycentric geometry decides.
      for (let offset = 0; offset < indices.count; offset += 3) {
        const ia = indices.values[offset], ib = indices.values[offset + 1], ic = indices.values[offset + 2];
        assert.ok(Number.isInteger(ia) && Number.isInteger(ib) && Number.isInteger(ic) && ia >= 0 && ib >= 0 && ic >= 0 && ia < positions.count && ib < positions.count && ic < positions.count, 'valid triangle indices');
        const a = ia * 3, b = ib * 3, c = ic * 3;
        const ax = world[a], ay = world[a + 1], az = world[a + 2];
        const ux = world[b] - ax, uy = world[b + 1] - ay, uz = world[b + 2] - az;
        const vx = world[c] - ax, vy = world[c + 1] - ay, vz = world[c + 2] - az;
        const determinant = ux * vz - uz * vx;
        if (Math.abs(determinant) < 1e-15) continue;
        const minX = Math.min(ax, world[b], world[c]), maxX = Math.max(ax, world[b], world[c]);
        const minZ = Math.min(az, world[b + 2], world[c + 2]), maxZ = Math.max(az, world[b + 2], world[c + 2]);
        for (let zIndex = 0; zIndex < sampleZs.length; zIndex++) {
          const z = sampleZs[zIndex]; if (z < minZ - 1e-9 || z > maxZ + 1e-9) continue;
          for (let xIndex = 0; xIndex < sampleXs.length; xIndex++) {
            const x = sampleXs[xIndex]; if (x < minX - 1e-9 || x > maxX + 1e-9) continue;
            const alpha = ((x - ax) * vz - (z - az) * vx) / determinant;
            const beta = (ux * (z - az) - uz * (x - ax)) / determinant;
            if (alpha < -1e-8 || beta < -1e-8 || alpha + beta > 1.00000001) continue;
            const y = ay + alpha * uy + beta * vy;
            const normalY = -determinant / Math.hypot(uy * vz - uz * vy, -determinant, ux * vy - uy * vx);
            samples[zIndex * sampleXs.length + xIndex][role].push({ y, normalY, node: node.name, material: material?.name, primitive: primitiveIndex, triangle: offset / 3 });
          }
        }
      }
    }
    for (const child of node.children ?? []) Visit(child, matrix, nextAncestry);
  }
  for (const nodeIndex of document.scenes[document.scene ?? 0].nodes) Visit(nodeIndex, Identity());
  assert.ok(groups.quilt.triangles > 0 && groups.support.triangles > 0, 'identify real quilt and straw geometry');
  const points = samples.map(EvaluateSample), gaps = points.filter(item => item.gapM !== null).map(item => item.gapM);
  const failures = points.filter(item => item.result !== 'PASS');
  return { result: failures.length ? 'FAIL' : 'PASS', file: path.relative(repositoryRoot, file).replaceAll('\\', '/'), bytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'), coordinateSystem: 'glTF world metres: X long, Y up, Z width; same fixed points for both models',
    geometrySelection: baseline ? 'Original R80/R159 quilt and authored MAT_C/C18/C28/C35/R97 straw materials' : 'Final Quilt/BS_FootCloth and Straw/StrawContactCore node or material roles',
    groups, selectedPrimitives: selected, points,
    summary: { points: points.length, passing: points.length - failures.length, failures: failures.length,
      certifiedLowerShells: points.filter(item => item.lowerCertified).length,
      floating: points.filter(item => item.violations.includes('FloatingGapOver2mm')).length,
      overPenetrating: points.filter(item => item.violations.includes('PenetrationOver2mm')).length,
      missingLowerShells: points.filter(item => item.violations.includes('MissingOrUnprovenLowerShell')).length,
      minGapMm: gaps.length ? Math.min(...gaps) * 1000 : null, medianGapMm: Median(gaps) === null ? null : Median(gaps) * 1000, maxGapMm: gaps.length ? Math.max(...gaps) * 1000 : null },
    failedPoints: failures.map(({ x, z, violations, gapMm, rawLowestGapM, quiltLowerY, quiltUpperY, supportTopY }) => ({ x, z, violations, gapMm, rawLowestGapM, quiltLowerY, quiltUpperY, supportTopY })) };
}
function SelfTest() {
  const Hit = (y, normalY) => ({ y, normalY, node: 'SyntheticKnownPlane', material: 'Test', primitive: 0, triangle: 0 });
  const sample = { x: 0, z: 0, quilt: [Hit(.6, -1), Hit(.7, 1)], support: [Hit(.55, -1), Hit(.6005, 1)] };
  const contact = EvaluateSample(sample); assert.equal(contact.result, 'PASS'); assert.ok(Math.abs(contact.gapM + .0005) < 1e-12);
  assert.ok(EvaluateSample({ ...sample, support: [Hit(.5979, 1)] }).violations.includes('FloatingGapOver2mm'));
  assert.ok(EvaluateSample({ ...sample, support: [Hit(.6021, 1)] }).violations.includes('PenetrationOver2mm'));
  const topOnly = EvaluateSample({ ...sample, quilt: [Hit(.7, 1)], support: [Hit(.7005, 1)] });
  assert.ok(topOnly.violations.includes('MissingOrUnprovenLowerShell')); assert.ok(topOnly.violations.includes('SupportReachesVisibleUpperShell'));
  const duplicate = EvaluateSample({ ...sample, quilt: [...sample.quilt, Hit(.600000001, -1)] }); assert.equal(duplicate.quiltIntersections.length, 2);
  assert.equal(EvaluateSample({ ...sample, quilt: [Hit(.6, 1), Hit(.7, -1)] }).result, 'PASS', 'inverted closed shell still has a lower surface');
  const transform = NodeMatrix({ translation: [2, 3, 4], scale: [2, 3, 4] }); assert.deepEqual(Multiply(Identity(), transform), transform);
  console.log(JSON.stringify({ result: 'PASS', selfTest: true, unchangedGapLimitM: gapLimit, penetrationLimitM: penetrationLimit, rejectsTopOnlyFakeContact: true }));
}
async function Main() {
  if (argumentsList.includes('--self-test')) return SelfTest();
  const final = await Inspect(path.resolve(repositoryRoot, Option('model', 'Model/PatchedTimberBed/Model_PatchedTimberBed.glb')), false);
  const original = argumentsList.includes('--comparison') ? await Inspect(path.resolve(repositoryRoot, Option('original', 'tmp/BedBnBsAcceptance/Model_OriginalBed.glb')), true) : null;
  const report = { result: final.result, method: 'Independent dense-GLB decode, float64 node transforms, exact projected-triangle vertical intersections; geometric winding certifies lower shell',
    limits: { maximumFloatingGapM: gapLimit, maximumPenetrationM: penetrationLimit, intendedMicroOverlapM: intendedMicroOverlap,
      interpretation: 'The 2 mm absolute contact limit is unchanged. Intended 0.5 mm overlap is inside that limit; interpolation error receives no additional slack.', upperSurfaceClearanceM: upperSurfaceClearance },
    final, ...(original ? { original, baselineFailureDoesNotRelaxFinalGate: true, comparison: final.points.map((point, index) => ({ x: point.x, z: point.z, finalGapMm: point.gapMm, originalGapMm: original.points[index].gapMm, finalStatus: point.result, originalStatus: original.points[index].result })) } : {}),
    limitation: 'Forty-two exact contact probes establish sampled support, not a global proof against every intersection; inspect full views and conservative lower-shell hole diagnostics too.' };
  await fs.mkdir(path.dirname(reportFile), { recursive: true }); await fs.writeFile(reportFile, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ result: report.result, sha256: final.sha256, summary: final.summary, ...(original ? { originalSummary: original.summary } : {}), failedPoints: final.failedPoints, reportFile }, null, 2));
  if (report.result !== 'PASS') process.exitCode = 1;
}
Main().catch(async error => { await fs.mkdir(path.dirname(reportFile), { recursive: true }); await fs.writeFile(reportFile, `${JSON.stringify({ result: 'FAIL', error: error.stack }, null, 2)}\n`); console.error(error.stack); process.exitCode = 1; });
