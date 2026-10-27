// Check the exported asset, not the Blender recipe. --browser additionally
// loads it through the real GLTFLoader and compiles/renders its PBR materials.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import * as THREE from "./vendor/three/build/three.module.js";
import { LoadGlb, ReadAccessor } from "./_import/Script_LugouGlbPose.mjs";
import { KAWASAKI_TYPE88_ASSET as Asset } from "./Data_KawasakiType88.mjs";
import { BindKawasakiType88 } from "./Script_KawasakiType88Motion.mjs";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.dirname(projectRoot);
const file = path.join(projectRoot, Asset.url.replace(/^\.\//, "").replace(/\?.*$/, ""));
let checks = 0;
function Check(ok, message) {
  checks++;
  if (!ok) throw new Error(message);
}
const bytes = fs.readFileSync(file), glb = LoadGlb(file), g = glb.json;
const nodes = g.nodes.map(node => {
  const object = new THREE.Object3D();
  object.name = node.name || "";
  object.userData = { ...node.extras };
  if (node.matrix) new THREE.Matrix4().fromArray(node.matrix).decompose(object.position, object.quaternion, object.scale);
  else {
    if (node.translation) object.position.fromArray(node.translation);
    if (node.rotation) object.quaternion.fromArray(node.rotation);
    if (node.scale) object.scale.fromArray(node.scale);
  }
  return object;
});
g.nodes.forEach((node, index) => (node.children || []).forEach(child => nodes[index].add(nodes[child])));
const root = new THREE.Group();
for (const index of g.scenes[g.scene || 0].nodes) root.add(nodes[index]);
root.updateMatrixWorld(true);
const metadata = root.getObjectByName("KawasakiType88Root").userData;
Check(Asset.version === metadata.buildVersion + metadata.surfaceSourceVersion.replace(/^\d{8}/, ""), "Runtime version does not identify the actual geometry and surface build");
Check(metadata.referenceRudderDegrees === Asset.referenceRudderDegrees, "Declared photograph pose differs from the actual rudder metadata");
const tailAssembly = root.getObjectByName("TailplaneReferenceAssembly");
Check(Math.abs(root.getObjectByName("KawasakiType88Root").userData.tailplaneReferenceYawDegrees - Asset.referenceTailplaneYawDegrees) < .000001, "Tailplane declaration differs from the actual fixed assembly");
Check(tailAssembly?.userData.animatedControl === false && !Object.values(Asset.controls).includes(tailAssembly?.name), "Fixed reference alignment became an extra animated control");
const tailYaw = Asset.referenceTailplaneYawDegrees * Math.PI / 180;
const elevatorAxis = new THREE.Vector3(Math.cos(tailYaw), 0, -Math.sin(tailYaw));
for (const name of [Asset.controls.elevatorLeft, Asset.controls.elevatorRight]) {
  Check(Math.abs(root.getObjectByName(name).getWorldPosition(new THREE.Vector3()).y - Asset.referenceTailplaneHeightM) < .00001, `${name} height differs from the installed plane`);
  Check(new THREE.Vector3(1, 0, 0).transformDirection(root.getObjectByName(name).matrixWorld).dot(elevatorAxis) > .999999, `${name} axis does not follow the installed tailplane`);
}
const geometryCache = new Map();
function LocalPoints(name) {
  if (geometryCache.has(name)) return geometryCache.get(name);
  const index = g.nodes.findIndex(node => node.name === name);
  Check(index >= 0 && g.nodes[index].mesh != null, `Missing mesh ${name}`);
  const unique = new Map();
  for (const primitive of g.meshes[g.nodes[index].mesh].primitives) {
    const p = ReadAccessor(glb, primitive.attributes.POSITION);
    for (let i = 0; i < p.data.length; i += 3) {
      const point = new THREE.Vector3(p.data[i], p.data[i + 1], p.data[i + 2]);
      unique.set(point.toArray().map(value => Math.round(value * 1e6)).join(","), point);
    }
  }
  const points = [...unique.values()];
  geometryCache.set(name, points);
  return points;
}
function WorldPoints(name) {
  const object = root.getObjectByName(name);
  return LocalPoints(name).map(point => point.clone().applyMatrix4(object.matrixWorld));
}
function Caps(name) {
  const points = LocalPoints(name), mean = new THREE.Vector3();
  for (const p of points) mean.add(p);
  mean.multiplyScalar(1 / points.length);
  const cov = new Array(9).fill(0);
  for (const p of points) {
    const q = p.clone().sub(mean).toArray();
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) cov[r * 3 + c] += q[r] * q[c];
  }
  let axis = new THREE.Vector3(1, 1, 1).normalize();
  for (let i = 0; i < 24; i++) {
    const [x, y, z] = axis.toArray();
    axis.set(cov[0] * x + cov[1] * y + cov[2] * z, cov[3] * x + cov[4] * y + cov[5] * z, cov[6] * x + cov[7] * y + cov[8] * z).normalize();
  }
  const projections = points.map(p => p.dot(axis)), lo = Math.min(...projections), hi = Math.max(...projections);
  const matrix = root.getObjectByName(name).matrixWorld;
  return [lo, hi].map(value => {
    const ring = points.filter((_, i) => Math.abs(projections[i] - value) < 1e-5);
    return ring.reduce((sum, p) => sum.add(p), new THREE.Vector3()).multiplyScalar(1 / ring.length).applyMatrix4(matrix);
  });
}
let triangles = 0, vertices = 0;
const bounds = new THREE.Box3();
for (let index = 0; index < g.nodes.length; index++) {
  const node = g.nodes[index];
  if (node.mesh == null) continue;
  for (const primitive of g.meshes[node.mesh].primitives) {
    const p = ReadAccessor(glb, primitive.attributes.POSITION);
    Check([...p.data].every(Number.isFinite), `${node.name} has non-finite vertices`);
    Check(primitive.attributes.NORMAL != null && primitive.attributes.TEXCOORD_0 != null, `${node.name} lacks normals or authored UV`);
    vertices += p.count;
    triangles += primitive.indices != null ? g.accessors[primitive.indices].count / 3 : p.count / 3;
    for (let i = 0; i < p.data.length; i += 3) bounds.expandByPoint(new THREE.Vector3(p.data[i], p.data[i + 1], p.data[i + 2]).applyMatrix4(nodes[index].matrixWorld));
  }
}
Check(triangles === Asset.triangles && triangles <= Asset.triangleBudget, `Triangle count ${triangles}`);
const dimensions = bounds.getSize(new THREE.Vector3());
for (const [actual, expected] of [[dimensions.x, Asset.dimensionsM.wingspan], [dimensions.y, Asset.dimensionsM.height], [dimensions.z, Asset.dimensionsM.length]]) {
  Check(Math.abs(actual - expected) < .004, `Metric extent ${actual} differs from ${expected}`);
}
Check(!g.cameras?.length && !g.extensions?.KHR_lights_punctual, "Acceptance lights or cameras leaked into the asset");
const tail = JSON.parse(fs.readFileSync(path.join(path.dirname(file), "Data_KawasakiType88Tail.json"), "utf8"));
const rudderPoints = WorldPoints("Rudder");
Check(rudderPoints.some(point => point.y > tail.verticalTail.fixedTopHeightM + .05 && point.z < tail.rudderMechanics.hingeAftM - .25), "The upper forward rudder balance is missing from the moving mesh");
const fixedFinPoints = WorldPoints("TypeIITallFixedFin");
Check(Math.max(...fixedFinPoints.map(point => point.y)) <= tail.verticalTail.fixedTopHeightM + .001, "The moving upper balance was incorrectly filled by the fixed fin");
const tailInverse = tailAssembly.matrixWorld.clone().invert();
const tailCentre = new THREE.Vector3(0, tail.frame.midHeightM, tail.frame.centreAftM);
for (const side of ["Left", "Right"]) {
  Check(WorldPoints(`Elevator${side}`).map(point => point.applyMatrix4(tailInverse).add(tailCentre)).some(point => Math.abs(point.x) > tail.frame.hornSplitSpanM && point.z < tail.frame.hingeAxisAftM - .1), `${side} outer forward elevator balance is missing from the moving mesh`);
}
const paint = JSON.parse(fs.readFileSync(path.join(path.dirname(file), "Data_KawasakiType88Paint.json"), "utf8"));
Check(paint.finExtraction.connectedComponents === 7 && paint.finMarks.length === 14 && paint.finMarks.every(mark => mark.uv0.length >= 3 && mark.uv0.every(point => point.every(value => value > 0 && value < 1))), "The two-side tail ink contours or their provenance are incomplete");
Check(g.images.length === Asset.pbr.images && g.materials.length === Asset.pbr.materials && g.images.every(image => image.bufferView != null && image.mimeType === "image/webp"), "Expected the complete embedded WebP PBR set");
let normalMaterials = 0;
for (const material of g.materials) {
  if (material.normalTexture) {
    normalMaterials++;
    Check(material.normalTexture.texCoord === 1, `${material.name} lost actual-scale detail UV1`);
    Check(material.pbrMetallicRoughness.baseColorTexture && material.pbrMetallicRoughness.metallicRoughnessTexture, `${material.name} lost base or metallic/roughness`);
  }
  if (material.name === "Material_Type88Glass") {
    Check(!material.occlusionTexture && material.extensions?.KHR_materials_transmission?.transmissionFactor > 0,
      "Transparent glass must retain transmission without opaque assembly AO");
  } else {
    Check(material.occlusionTexture?.texCoord === 2, `${material.name} lost baked assembly AO UV2`);
  }
}
Check(normalMaterials === Asset.pbr.detailedMaterials, "Main physical materials lost PBR normal detail");
const packing = JSON.parse(fs.readFileSync(path.join(path.dirname(file), "Data_KawasakiType88Packing.json"), "utf8"));
Check(packing.outputSha256 === crypto.createHash("sha256").update(bytes).digest("hex"), "Packing audit does not identify this GLB");
Check(packing.images.every(image => image.pixelExact && image.sourcePixelsSha256 === image.decodedPixelsSha256), "Lossless image verification failed");
const driver = BindKawasakiType88(root), rodLengths = {};
for (const degrees of [-18, -12, -6, 0, 6, 12, 18]) {
  const angle = degrees * Math.PI / 180;
  driver.SetPose({ aileronRadians: angle, rudderRadians: angle, elevatorRadians: angle, propellerRadians: angle });
  for (const side of ["Left", "Right"]) {
    const rod = Caps(`AileronExternalPushrod${side}`);
    const lower = Caps(`LowerAileronLinkHorn${side}`), upper = Caps(`UpperAileronLinkHorn${side}`);
    Check(Math.min(...rod.flatMap(end => lower.map(point => point.distanceTo(end)))) < .0001, `${side} lower pushrod detached at ${degrees}`);
    Check(Math.min(...rod.flatMap(end => upper.map(point => point.distanceTo(end)))) < .0001, `${side} upper pushrod detached at ${degrees}`);
    const length = rod[0].distanceTo(rod[1]);
    rodLengths[side] ??= length;
    Check(Math.abs(length - rodLengths[side]) < 1e-5, `${side} pushrod stretches`);
  }
  Check(nodes.every(node => node.scale.distanceTo(new THREE.Vector3(1, 1, 1)) < 1e-6), "Pose scales an exported part");
}
driver.Reset();
const bottom = WorldPoints("RubberTyreLeft").sort((a, b) => a.y - b.y)[0];
const localBottom = bottom.clone().applyMatrix4(root.getObjectByName("RubberTyreLeft").matrixWorld.clone().invert());
driver.SetPose({ wheelTravelM: .001 });
root.position.z = -.001;
root.updateMatrixWorld(true);
const rolled = localBottom.clone().applyMatrix4(root.getObjectByName("RubberTyreLeft").matrixWorld);
Check(Math.abs(rolled.z - bottom.z) < 2e-6, "Wheel rotation opposes the required rolling direction or uses the wrong radius");
root.position.z = 0; driver.Reset();
console.log(`PASS KawasakiType88AssetTest: ${checks} checks; ${triangles} triangles, ${g.meshes.length} meshes, ${g.images.length} images, metric ${dimensions.toArray().map(v => v.toFixed(3)).join(" / ")} m`);

if (process.argv.includes("--browser")) {
  const { ServeRoot } = await import("./Script_DevServer.mjs");
  const { LaunchBrowser } = await import("../PrairieFire1937/Script_BrowserTestKit.mjs");
  const folder = path.join(repoRoot, "tmp/KawasakiType88Audit");
  fs.mkdirSync(folder, { recursive: true });
  fs.writeFileSync(path.join(folder, "index.html"), `<!doctype html><meta charset="utf-8"><script type="importmap">{"imports":{"three":"/Taierzhuang1938/vendor/three/build/three.module.js"}}</script><script type="module">
import * as T from 'three';import {GLTFLoader} from '/Taierzhuang1938/vendor/three/examples/jsm/loaders/GLTFLoader.js';import {BindKawasakiType88} from '/Taierzhuang1938/Script_KawasakiType88Motion.mjs';
const r=new T.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});r.setSize(640,480);r.setClearColor(0x778899);document.body.append(r.domElement);const s=new T.Scene();s.add(new T.HemisphereLight(0xffffff,0x666666,2));const l=new T.DirectionalLight(0xffffff,2);l.position.set(-5,9,-4);s.add(l);const a=(await new GLTFLoader().loadAsync('/Taierzhuang1938/Model/KawasakiType88/Model_KawasakiType88.glb')).scene;s.add(a);const d=BindKawasakiType88(a);for(const x of [-.3,0,.3])d.SetPose({aileronRadians:x,rudderRadians:x,elevatorRadians:x,wheelTravelM:x,propellerRadians:x});d.Reset();const c=new T.PerspectiveCamera(38,640/480,.1,100);c.position.set(15,9,-18);c.lookAt(0,1.7,0);const mats=new Set();a.traverse(o=>{if(o.isMesh)mats.add(o.material)});await r.compileAsync(s,c);r.render(s,c);const gl=r.getContext(),pixels=new Uint8Array(640*480*4);gl.readPixels(0,0,640,480,gl.RGBA,gl.UNSIGNED_BYTE,pixels);let changed=0;for(let i=0;i<pixels.length;i+=4)if(Math.abs(pixels[i]-119)+Math.abs(pixels[i+1]-136)+Math.abs(pixels[i+2]-153)>20)changed++;window.result={error:gl.getError(),triangles:r.info.render.triangles,pixels:changed,materials:[...mats].map(m=>({name:m.name,base:!!m.map,normal:m.normalMap?.channel,ao:m.aoMap?.channel,color:m.map?.colorSpace,normalColor:m.normalMap?.colorSpace})),controls:Object.keys(d.controls)};
</script>`);
  const server = await ServeRoot(repoRoot), browser = await LaunchBrowser({ extraArgs: ["--mute-audio"] });
  try {
    const page = await browser.newPage({ viewport: { width: 1000, height: 800 } });
    const errors = [];
    page.on("pageerror", error => errors.push(String(error)));
    await page.goto(`http://127.0.0.1:${server.address().port}/tmp/KawasakiType88Audit/index.html`);
    await page.waitForFunction(() => window.result, null, { timeout: 60000 });
    const result = await page.evaluate(() => window.result);
    Check(errors.length === 0 && result.error === 0 && result.pixels > 1000 && result.triangles >= Asset.triangles, `Real GLTF PBR render failed: ${JSON.stringify({ errors, result })}`);
    Check(result.controls.length === 10, "Real loader lost control nodes");
    Check(result.materials.filter(m => m.normal != null).every(m => m.normal === 1 && m.ao === 2 && m.color === "srgb" && m.normalColor === ""), "Real loader changed PBR UV or colour-space bindings");
    fs.writeFileSync(path.join(folder, "Data_BrowserResult.json"), JSON.stringify({ checks, result, errors }, null, 2));
    console.log(`PASS KawasakiType88BrowserTest: actual GLTF PBR, ${result.controls.length} controls, ${result.pixels} rendered pixels`);
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
}
