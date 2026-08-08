import * as THREE from "../TunnelBell1942/vendor/three/build/three.module.mjs";
import { GetCinematicCue, GetVisualProfile, WorldScale } from "./Data_Scene3D.mjs?v=20260808z2";
import { CreateActor3D, UpdateActor3D, DisposeActor3D } from "./Script_Actor3D.mjs?v=20260808z2";
import { InstantiateSceneAsset3D } from "./Script_Assets3D.mjs?v=20260808z2";

function CreateRandom(seed) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

function CreateCanvasTexture(baseColor, fleckColor, seed = 1) {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext("2d");
  context.fillStyle = baseColor;
  context.fillRect(0, 0, 256, 256);
  const random = CreateRandom(seed);
  for (let index = 0; index < 2200; index += 1) {
    const alpha = 0.02 + random() * 0.12;
    const size = 0.4 + random() * 2.8;
    context.globalAlpha = alpha;
    context.fillStyle = random() > 0.56 ? fleckColor : "#0a0a08";
    context.fillRect(random() * 256, random() * 256, size, size);
  }
  context.globalAlpha = 1;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(8, 3);
  texture.anisotropy = 4;
  return texture;
}

function CreateWaterTexture(seed = 1) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 256;
  const context = canvas.getContext("2d");
  const random = CreateRandom(seed);
  context.fillStyle = "#777777";
  context.fillRect(0, 0, canvas.width, canvas.height);
  for (let band = 0; band < 58; band += 1) {
    const y = random() * canvas.height;
    const amplitude = 1.5 + random() * 5.5;
    const frequency = 0.012 + random() * 0.025;
    context.beginPath();
    for (let x = -8; x <= canvas.width + 8; x += 6) {
      const waveY = y + Math.sin(x * frequency + random() * 0.7) * amplitude;
      if (x < 0) context.moveTo(x, waveY);
      else context.lineTo(x, waveY);
    }
    const lightness = Math.round(104 + random() * 68);
    context.strokeStyle = `rgba(${lightness},${lightness},${lightness},${0.08 + random() * 0.2})`;
    context.lineWidth = 0.5 + random() * 2.1;
    context.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.NoColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(7.5, 4.5);
  texture.anisotropy = 4;
  return texture;
}

function CreateSkyTexture(profile, chapterId) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const context = canvas.getContext("2d");
  const palettes = {
    school: ["#071419", "#1c3437", "#5e5d4b", "#172825"],
    blockade: ["#04141b", "#15343a", "#53635d", "#122b2d"],
    ferry: ["#071620", "#263d47", "#645d4a", "#20383d"],
  };
  const colors = palettes[chapterId] || palettes.school;
  const gradient = context.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0, colors[0]);
  gradient.addColorStop(0.54, colors[1]);
  gradient.addColorStop(0.77, colors[2]);
  gradient.addColorStop(1, colors[3]);
  context.fillStyle = gradient;
  context.fillRect(0, 0, canvas.width, canvas.height);
  const random = CreateRandom(3401 + chapterId.length * 71);
  context.globalCompositeOperation = "screen";
  for (let index = 0; index < 18; index += 1) {
    const y = 54 + random() * 310;
    const x = random() * 512;
    const width = 120 + random() * 260;
    const cloud = context.createRadialGradient(x, y, 0, x, y, width * 0.52);
    cloud.addColorStop(0, `rgba(210,219,205,${0.018 + random() * 0.04})`);
    cloud.addColorStop(0.55, `rgba(190,203,192,${0.008 + random() * 0.018})`);
    cloud.addColorStop(1, "rgba(220,225,210,0)");
    context.fillStyle = cloud;
    const stretch = 0.18 + random() * 0.18;
    context.save();
    context.scale(1, stretch);
    context.fillRect(x - width, (y - width) / stretch, width * 2, width * 2 / stretch);
    context.restore();
  }
  context.globalCompositeOperation = "source-over";
  context.globalAlpha = 0.035;
  context.fillStyle = `#${new THREE.Color(profile.fog).getHexString()}`;
  for (let index = 0; index < 1700; index += 1) context.fillRect(random() * 512, random() * 512, 1, 1);
  context.globalAlpha = 1;
  const image = context.getImageData(0, 0, canvas.width, canvas.height);
  for (let index = 0; index < image.data.length; index += 4) {
    const dither = Math.floor(random() * 5) - 2;
    image.data[index] = Math.max(0, Math.min(255, image.data[index] + dither));
    image.data[index + 1] = Math.max(0, Math.min(255, image.data[index + 1] + dither));
    image.data[index + 2] = Math.max(0, Math.min(255, image.data[index + 2] + dither));
  }
  context.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function CreateChalkTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 256;
  const context = canvas.getContext("2d");
  context.fillStyle = "#1b2925";
  context.fillRect(0, 0, 512, 256);
  context.strokeStyle = "rgba(214,216,193,.09)";
  context.lineWidth = 2;
  for (let y = 20; y < 240; y += 22) {
    context.beginPath();
    context.moveTo(24, y);
    context.lineTo(488, y + Math.sin(y) * 2);
    context.stroke();
  }
  context.fillStyle = "rgba(226,221,198,.78)";
  context.font = "92px 'Songti SC', 'SimSun', serif";
  context.fillText("到", 210, 155);
  context.font = "28px 'Songti SC', 'SimSun', serif";
  context.fillText("麦子　杏花　小锁　春妮", 44, 218);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function CreateMaterial(color, options = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: options.roughness ?? 0.94,
    metalness: options.metalness ?? 0,
    flatShading: options.flatShading ?? false,
    transparent: Boolean(options.transparent),
    opacity: options.opacity ?? 1,
    side: options.side ?? THREE.FrontSide,
    emissive: options.emissive ?? 0x000000,
    emissiveIntensity: options.emissiveIntensity ?? 0,
    map: options.map || null,
    bumpMap: options.bumpMap || null,
    bumpScale: options.bumpScale ?? 0,
    roughnessMap: options.roughnessMap || null,
    alphaTest: options.alphaTest ?? 0,
    depthWrite: options.depthWrite ?? true,
    vertexColors: Boolean(options.vertexColors),
  });
}

function AddMesh(root, geometry, material, position, rotation = null, scale = null, shadows = true) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(position[0], position[1], position[2]);
  if (rotation) mesh.rotation.set(rotation[0], rotation[1], rotation[2]);
  if (scale) mesh.scale.set(scale[0], scale[1], scale[2]);
  mesh.castShadow = shadows;
  mesh.receiveShadow = true;
  root.add(mesh);
  return mesh;
}

function AddBox(root, size, position, material, rotation = null, shadows = true) {
  return AddMesh(root, new THREE.BoxGeometry(size[0], size[1], size[2]), material, position, rotation, null, shadows);
}

function AddBlenderAsset(root, name, options) {
  const asset = InstantiateSceneAsset3D(name, options);
  if (asset) root.add(asset);
  return asset;
}

function AddCylinder(root, radiusTop, radiusBottom, height, position, material, radialSegments = 8, rotation = null, shadows = true) {
  return AddMesh(root, new THREE.CylinderGeometry(radiusTop, radiusBottom, height, radialSegments), material, position, rotation, null, shadows);
}

function AddGableRoof(root, width, depth, height, position, material) {
  const halfWidth = width * 0.5;
  const halfDepth = depth * 0.5;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute([
    -halfWidth, 0, -halfDepth, halfWidth, 0, -halfDepth,
    -halfWidth, 0, halfDepth, halfWidth, 0, halfDepth,
    -halfWidth, height, 0, halfWidth, height, 0,
  ], 3));
  geometry.setIndex([
    0, 1, 5, 0, 5, 4,
    2, 4, 5, 2, 5, 3,
    0, 4, 2, 1, 3, 5,
    0, 2, 3, 0, 3, 1,
  ]);
  geometry.computeVertexNormals();
  return AddMesh(root, geometry, material, position);
}

function AddCrossBeam(root, x, y, z, width, material) {
  AddBox(root, [0.12, 2.25, 0.16], [x - width * 0.5, y, z], material);
  AddBox(root, [0.12, 2.25, 0.16], [x + width * 0.5, y, z], material);
  AddBox(root, [width + 0.2, 0.12, 0.18], [x, y + 1.02, z], material);
}

function BuildSkyBackdrop(root, profile, chapter, dynamic) {
  if (chapter.id === "tunnel") return;
  const texture = CreateSkyTexture(profile, chapter.id);
  const material = new THREE.MeshBasicMaterial({ map: texture, fog: false, depthWrite: false, side: THREE.DoubleSide });
  const width = Math.max(72, chapter.width * WorldScale + 34);
  const mesh = AddMesh(root, new THREE.PlaneGeometry(width, 22), material, [chapter.width * WorldScale * 0.5, 6.4, -27], null, null, false);
  mesh.renderOrder = -10;
  dynamic.ownedTextures.push(texture);
  dynamic.ownedMaterials.push(material);
}

function CreateMistTexture(profile, seed) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 128;
  const context = canvas.getContext("2d");
  const random = CreateRandom(seed);
  const fog = new THREE.Color(profile.fog);
  const color = `${Math.round(fog.r * 255)},${Math.round(fog.g * 255)},${Math.round(fog.b * 255)}`;
  const vertical = context.createLinearGradient(0, 0, 0, 128);
  vertical.addColorStop(0, `rgba(${color},0)`);
  vertical.addColorStop(0.34, `rgba(${color},0.22)`);
  vertical.addColorStop(0.72, `rgba(${color},0.15)`);
  vertical.addColorStop(1, `rgba(${color},0)`);
  context.fillStyle = vertical;
  context.fillRect(0, 0, 512, 128);
  for (let index = 0; index < 18; index += 1) {
    const x = random() * 512;
    const y = 30 + random() * 76;
    const width = 70 + random() * 150;
    const cloud = context.createRadialGradient(x, y, 0, x, y, width);
    cloud.addColorStop(0, `rgba(${color},${0.025 + random() * 0.055})`);
    cloud.addColorStop(1, `rgba(${color},0)`);
    context.fillStyle = cloud;
    context.fillRect(x - width, y - width * 0.35, width * 2, width * 0.7);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  return texture;
}

function BuildAtmosphericLayers(root, profile, chapter, dynamic) {
  if (chapter.id === "tunnel") return;
  const width = chapter.width * WorldScale + 26;
  for (let index = 0; index < 2; index += 1) {
    const texture = CreateMistTexture(profile, 7100 + chapter.id.length * 17 + index * 101);
    texture.repeat.set(index ? 1.7 : 1.15, 1);
    const material = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      opacity: index ? 0.42 : 0.58,
      depthWrite: false,
      fog: false,
      side: THREE.DoubleSide,
    });
    const mesh = AddMesh(root, new THREE.PlaneGeometry(width, index ? 5.2 : 4.1), material, [chapter.width * WorldScale * 0.5, index ? 2.45 : 1.62, index ? -11.6 : -5.4], null, null, false);
    mesh.renderOrder = index ? -6 : 1;
    dynamic.mistLayers.push(mesh);
    dynamic.ownedTextures.push(texture);
    dynamic.ownedMaterials.push(material);
  }
}

function GetTerrainY(chapter, worldX) {
  const gameX = worldX / WorldScale;
  const segment = chapter.terrain.find((item) => gameX >= item.x0 && gameX <= item.x1 && !item.dynamic);
  return (segment?.y || 0) * WorldScale;
}

function CreateReedMaterial(color) {
  const material = new THREE.MeshStandardMaterial({
    color: new THREE.Color(color).lerp(new THREE.Color(0xc0c6ab), 0.16),
    roughness: 1,
    metalness: 0,
    side: THREE.DoubleSide,
    vertexColors: true,
    flatShading: true,
  });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = { value: 0 };
    shader.uniforms.uWind = { value: 0.45 };
    shader.vertexShader = `uniform float uTime;\nuniform float uWind;\n${shader.vertexShader}`;
    shader.vertexShader = shader.vertexShader.replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>
       float reedPhase = position.y * 0.8;
       #ifdef USE_INSTANCING
         reedPhase += instanceMatrix[3].x * 1.7 + instanceMatrix[3].z * 1.1;
       #endif
       float reedBend = sin(uTime * 1.35 + reedPhase) * uWind * max(position.y, 0.0) * 0.075;
       transformed.x += reedBend;
       transformed.z += reedBend * 0.28;`
    );
    material.userData.shader = shader;
  };
  return material;
}

function CreateCrossedReedGeometry() {
  const geometry = new THREE.BufferGeometry();
  const positions = [];
  const colors = [];
  const indices = [];
  function PushVertex(x, y, z, color) {
    positions.push(x, y, z);
    colors.push(color[0], color[1], color[2]);
  }
  function PushQuad(vertices, color) {
    const start = positions.length / 3;
    for (const vertex of vertices) PushVertex(vertex[0], vertex[1], vertex[2], color);
    indices.push(start, start + 1, start + 2, start, start + 2, start + 3);
  }
  function PushTriangle(vertices, color) {
    const start = positions.length / 3;
    for (const vertex of vertices) PushVertex(vertex[0], vertex[1], vertex[2], color);
    indices.push(start, start + 1, start + 2);
  }
  const stemColor = [0.48, 0.56, 0.4];
  const leafColor = [0.58, 0.66, 0.47];
  const plumeColor = [0.52, 0.43, 0.28];
  PushQuad([[-0.015, 0, 0], [0.015, 0, 0], [0.006, 1.32, 0], [-0.006, 1.32, 0]], stemColor);
  PushQuad([[0, 0, -0.015], [0, 0, 0.015], [0, 1.32, 0.006], [0, 1.32, -0.006]], stemColor);
  PushTriangle([[-0.008, 0.5, 0], [0.02, 0.56, 0], [0.26, 0.92, 0]], leafColor);
  PushTriangle([[0.008, 0.72, 0.004], [-0.02, 0.78, 0.004], [-0.24, 1.08, 0.004]], leafColor);
  PushTriangle([[0, 0.61, -0.008], [0, 0.67, 0.02], [0, 1.01, 0.24]], leafColor);
  PushTriangle([[0.004, 0.82, 0.008], [0.004, 0.88, -0.018], [0.004, 1.15, -0.2]], leafColor);
  PushQuad([[-0.01, 1.24, 0], [0.01, 1.24, 0], [0.055, 1.4, 0], [0, 1.56, 0]], plumeColor);
  PushQuad([[0, 1.24, -0.01], [0, 1.24, 0.01], [0, 1.4, 0.055], [0, 1.56, 0]], plumeColor);
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function CreateReedField(root, chapter, x0, x1, count, z0, z1, material, seed = 1, heightScale = 1) {
  const geometry = CreateCrossedReedGeometry();
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  const random = CreateRandom(seed);
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const position = new THREE.Vector3();
  const scale = new THREE.Vector3();
  const color = new THREE.Color();
  for (let index = 0; index < count; index += 1) {
    const x = THREE.MathUtils.lerp(x0, x1, random());
    const z = THREE.MathUtils.lerp(z0, z1, random());
    const y = GetTerrainY(chapter, x) - 0.01;
    const height = heightScale * (0.56 + random() * 0.55);
    position.set(x, y, z);
    quaternion.setFromEuler(new THREE.Euler(0, random() * Math.PI, (random() - 0.5) * 0.07));
    scale.set(0.58 + random() * 0.38, height, 1);
    matrix.compose(position, quaternion, scale);
    mesh.setMatrixAt(index, matrix);
    color.setHSL(0.2 + random() * 0.075, 0.16 + random() * 0.13, 0.24 + random() * 0.11);
    mesh.setColorAt(index, color);
  }
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  mesh.frustumCulled = true;
  root.add(mesh);
  return mesh;
}

function CreateWaterRipples(root, x0, x1, z0, z1, count, material, seed = 1, waterY = -0.39) {
  const geometry = new THREE.PlaneGeometry(1, 1);
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  const random = CreateRandom(seed);
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI * 0.5, 0, 0));
  const scale = new THREE.Vector3();
  for (let index = 0; index < count; index += 1) {
    position.set(THREE.MathUtils.lerp(x0, x1, random()), waterY + random() * 0.012, THREE.MathUtils.lerp(z0, z1, random()));
    scale.set(0.28 + random() * 1.65, 0.008 + random() * 0.014, 1);
    matrix.compose(position, quaternion, scale);
    mesh.setMatrixAt(index, matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;
  mesh.renderOrder = 3;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  root.add(mesh);
  return mesh;
}

function SetInstance(mesh, index, position, rotation, scale, matrix) {
  const quaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(rotation[0], rotation[1], rotation[2]));
  matrix.compose(
    new THREE.Vector3(position[0], position[1], position[2]),
    quaternion,
    new THREE.Vector3(scale[0], scale[1], scale[2]),
  );
  mesh.setMatrixAt(index, matrix);
}

function CreateInstancedSilhouette(root, geometry, material, count) {
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.frustumCulled = true;
  root.add(mesh);
  return mesh;
}

function BuildDistantVillage(root, profile, material, seed, length, dynamic, chapterId) {
  const random = CreateRandom(seed);
  const matrix = new THREE.Matrix4();
  const farColor = new THREE.Color(profile.fog).multiplyScalar(chapterId === "ferry" ? 0.34 : 0.27);
  const middleColor = new THREE.Color(profile.plasterDark).multiplyScalar(0.42).lerp(new THREE.Color(profile.fog), 0.12);
  const silhouetteMaterial = new THREE.MeshBasicMaterial({ color: farColor, fog: true });
  const middleMaterial = new THREE.MeshBasicMaterial({ color: middleColor, fog: true, transparent: true, opacity: 0.7 });
  const arborealMaterial = new THREE.MeshBasicMaterial({
    color: middleColor.clone().multiplyScalar(0.88),
    fog: true,
    transparent: true,
    opacity: 0.64,
    depthWrite: false,
  });
  dynamic.ownedMaterials.push(silhouetteMaterial, middleMaterial, arborealMaterial);

  const landmarkVillage = AddBlenderAsset(root, "Asset_DistantVillageCluster", {
    position: [length * 0.76, -0.16, -11.8],
    rotation: [0, Math.PI, 0],
    scale: chapterId === "ferry" ? 0.74 : 0.68,
    castShadow: false,
    materialTint: profile.fog,
    tintAmount: 0.68,
  });
  if (landmarkVillage) dynamic.blenderAssets.push(landmarkVillage);

  // A single massive horizon is more convincing than dozens of equally sized
  // toy houses.  It also reduces the previous two draw calls per cottage to a
  // handful of instanced calls, leaving budget for foreground parallax.
  const hillGeometry = new THREE.IcosahedronGeometry(1, 1);
  const hills = CreateInstancedSilhouette(root, hillGeometry, silhouetteMaterial, 11);
  for (let index = 0; index < 11; index += 1) {
    const x = -12 + index * ((length + 24) / 10);
    SetInstance(hills, index, [x, -4.7 - random() * 0.5, -20 - random() * 8], [0, random() * Math.PI, 0], [7.5 + random() * 4.5, 1.5 + random() * 1.5, 4.8 + random() * 3], matrix);
  }
  hills.instanceMatrix.needsUpdate = true;
  dynamic.ownedGeometries.push(hillGeometry);

  const buildingCount = Math.max(16, Math.ceil(length / 1.65));
  const buildingGeometry = new THREE.BoxGeometry(1, 1, 1);
  const roofGeometry = new THREE.ConeGeometry(0.78, 0.62, 4);
  const buildings = CreateInstancedSilhouette(root, buildingGeometry, middleMaterial, buildingCount);
  const roofs = CreateInstancedSilhouette(root, roofGeometry, middleMaterial, buildingCount);
  for (let index = 0; index < buildingCount; index += 1) {
    const x = -5 + index * ((length + 10) / Math.max(1, buildingCount - 1)) + (random() - 0.5) * 1.2;
    const z = -9.6 - random() * 5.8;
    const width = 1.6 + random() * 3.2;
    const height = 1.25 + random() * 2.7;
    const depth = 1.25 + random() * 1.5;
    SetInstance(buildings, index, [x, height * 0.5 - 0.18, z], [0, (random() - 0.5) * 0.12, 0], [width, height, depth], matrix);
    SetInstance(roofs, index, [x, height + 0.08, z], [0, Math.PI * 0.25, 0], [width * 0.9, 0.62 + width * 0.12, depth * 0.92], matrix);
  }
  buildings.instanceMatrix.needsUpdate = true;
  roofs.instanceMatrix.needsUpdate = true;
  dynamic.ownedGeometries.push(buildingGeometry, roofGeometry);

  // Background trees read as masses with a visible branching rhythm rather
  // than a row of poles carrying detached low-poly gems.  All foliage remains
  // three instanced draw calls so the extra silhouette detail is effectively
  // free at runtime.
  const treeCount = Math.max(12, Math.ceil(length / 2.65));
  const trunkGeometry = new THREE.CylinderGeometry(0.075, 0.15, 1, 7);
  const crownGeometry = new THREE.SphereGeometry(1, 9, 7);
  const trunks = CreateInstancedSilhouette(root, trunkGeometry, arborealMaterial, treeCount);
  const branches = CreateInstancedSilhouette(root, trunkGeometry, arborealMaterial, treeCount * 4);
  const crowns = CreateInstancedSilhouette(root, crownGeometry, arborealMaterial, treeCount * 5);
  for (let index = 0; index < treeCount; index += 1) {
    const x = -6 + index * ((length + 12) / Math.max(1, treeCount - 1)) + (random() - 0.5) * 1.5;
    const z = -7.2 - random() * 5.8;
    const height = 3.15 + random() * 2.35;
    const crownWidth = 0.62 + random() * 0.52;
    const trunkLean = (random() - 0.5) * 0.08;
    SetInstance(trunks, index, [x, height * 0.5 - 0.18, z], [0, random() * 0.18, trunkLean], [0.9 + random() * 0.32, height, 0.9 + random() * 0.25], matrix);
    for (let branchIndex = 0; branchIndex < 4; branchIndex += 1) {
      const side = branchIndex % 2 ? 1 : -1;
      const branchY = height * (0.5 + branchIndex * 0.095);
      const branchLength = 0.72 + random() * 0.62;
      SetInstance(
        branches,
        index * 4 + branchIndex,
        [x + side * (0.12 + branchIndex * 0.035), branchY, z + (random() - 0.5) * 0.12],
        [(random() - 0.5) * 0.14, random() * 0.35, side * (0.64 + random() * 0.28)],
        [0.56 + random() * 0.24, branchLength, 0.56 + random() * 0.2],
        matrix,
      );
    }
    const crownCenterY = height * 0.79;
    const crownOffsets = [
      [-0.52, -0.18, 1.0, 0.78],
      [0.48, -0.12, 0.94, 0.82],
      [-0.18, 0.34, 0.88, 1.0],
      [0.32, 0.48, 0.74, 0.86],
      [0.02, -0.48, 1.08, 0.7],
    ];
    for (let crownIndex = 0; crownIndex < crownOffsets.length; crownIndex += 1) {
      const [offsetX, offsetY, widthScale, heightScale] = crownOffsets[crownIndex];
      SetInstance(
        crowns,
        index * crownOffsets.length + crownIndex,
        [x + offsetX * crownWidth + (random() - 0.5) * 0.12, crownCenterY + offsetY * crownWidth, z + (random() - 0.5) * 0.28],
        [random() * 0.16, random() * Math.PI, (random() - 0.5) * 0.12],
        [crownWidth * widthScale, crownWidth * heightScale, crownWidth * (0.7 + random() * 0.18)],
        matrix,
      );
    }
  }
  trunks.instanceMatrix.needsUpdate = true;
  branches.instanceMatrix.needsUpdate = true;
  crowns.instanceMatrix.needsUpdate = true;
  dynamic.ownedGeometries.push(trunkGeometry, crownGeometry);

  const infrastructureMaterial = new THREE.MeshBasicMaterial({ color: new THREE.Color(profile.plasterDark).multiplyScalar(0.3), fog: true });
  dynamic.ownedMaterials.push(infrastructureMaterial);
  const postGeometry = new THREE.BoxGeometry(1, 1, 1);
  const postCount = chapterId === "blockade" ? 8 : chapterId === "ferry" ? 5 : chapterId === "school" ? 1 : 4;
  const posts = CreateInstancedSilhouette(root, postGeometry, infrastructureMaterial, postCount * 2);
  for (let index = 0; index < postCount; index += 1) {
    const x = length * ((index + 0.45) / postCount);
    const height = chapterId === "blockade" ? 7.2 + (index % 3) * 1.6 : 4.8 + (index % 2) * 1.2;
    SetInstance(posts, index * 2, [x, height * 0.5, -6.15 - (index % 2) * 0.8], [0, 0, 0], [0.12, height, 0.12], matrix);
    SetInstance(posts, index * 2 + 1, [x, height - 0.55, -6.15 - (index % 2) * 0.8], [0, 0, 0], [chapterId === "blockade" ? 2.35 : 1.55, 0.13, 0.13], matrix);
  }
  posts.instanceMatrix.needsUpdate = true;
  dynamic.ownedGeometries.push(postGeometry);

  const horizonBand = AddBox(
    root,
    [length + 28, chapterId === "blockade" ? 1.25 : 0.72, 2.2],
    [length * 0.5, chapterId === "blockade" ? 0.24 : -0.02, -6.7],
    infrastructureMaterial,
    null,
    false,
  );
  horizonBand.receiveShadow = false;
}

function BuildNearScaleLayer(root, chapter, profile, dynamic) {
  if (chapter.id === "tunnel") return;
  const length = chapter.width * WorldScale;
  const random = CreateRandom(880 + chapter.id.length * 29);
  const stalkMaterial = new THREE.MeshBasicMaterial({
    color: new THREE.Color(profile.ground).multiplyScalar(0.28),
    fog: true,
    transparent: true,
    opacity: 0.5,
    depthWrite: false,
  });
  const leafMaterial = new THREE.MeshBasicMaterial({
    color: new THREE.Color(profile.reed).multiplyScalar(0.16),
    fog: true,
    transparent: true,
    opacity: 0.3,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const layer = new THREE.Group();
  layer.name = "ForegroundReedClusters";
  root.add(layer);
  const stalkGeometry = new THREE.CylinderGeometry(0.018, 0.034, 1, 5);
  const leafGeometry = new THREE.DodecahedronGeometry(1, 0);
  const count = Math.max(20, Math.ceil((length + 12) / 1.75));
  const stalks = CreateInstancedSilhouette(layer, stalkGeometry, stalkMaterial, count);
  const leaves = CreateInstancedSilhouette(layer, leafGeometry, leafMaterial, count * 2);
  const matrix = new THREE.Matrix4();
  for (let index = 0; index < count; index += 1) {
    const cluster = Math.floor(index / 4);
    const clusterCenter = -5.5 + cluster * ((length + 11) / Math.max(1, Math.ceil(count / 4) - 1));
    const x = clusterCenter + (random() - 0.5) * 0.75;
    const z = 2.75 + random() * 1.15;
    const height = 0.78 + random() * 1.48;
    const bend = (random() - 0.5) * 0.24;
    SetInstance(stalks, index, [x, -0.3 + height * 0.5, z], [0, random() * Math.PI, bend], [0.78 + random() * 0.34, height, 0.78 + random() * 0.34], matrix);
    const leafY = -0.32 + height * (0.68 + random() * 0.22);
    const leafTilt = index % 2 === 0 ? -0.82 : 0.82;
    SetInstance(leaves, index * 2, [x + Math.sin(leafTilt) * 0.11, leafY, z], [0, random() * Math.PI, leafTilt], [0.075 + random() * 0.035, 0.25 + random() * 0.12, 0.038], matrix);
    SetInstance(leaves, index * 2 + 1, [x - Math.sin(leafTilt) * 0.09, leafY - 0.22, z + 0.015], [0, random() * Math.PI, -leafTilt * 0.78], [0.06 + random() * 0.03, 0.2 + random() * 0.1, 0.034], matrix);
  }
  stalks.instanceMatrix.needsUpdate = true;
  leaves.instanceMatrix.needsUpdate = true;
  stalks.renderOrder = 5;
  leaves.renderOrder = 5;
  dynamic.ownedMaterials.push(stalkMaterial, leafMaterial);
  dynamic.ownedGeometries.push(stalkGeometry, leafGeometry);
  dynamic.nearScaleLayer = layer;
}

function BuildTunnelScaleLayer(root, chapter, materials, dynamic, profile) {
  const chamberMaterial = new THREE.MeshBasicMaterial({
    color: new THREE.Color(profile.earth).multiplyScalar(0.28),
    fog: true,
    side: THREE.DoubleSide,
  });
  const coldMaterial = new THREE.MeshBasicMaterial({ color: new THREE.Color(profile.moon).multiplyScalar(0.42), fog: true });
  dynamic.ownedMaterials.push(chamberMaterial, coldMaterial);
  // A buried brick-kiln chamber and two shafts continue well above the
  // playable crawlspace, making the children visibly small without changing
  // collision or the historical role of the early shelter.
  AddMesh(root, new THREE.TorusGeometry(4.8, 0.62, 10, 28, Math.PI), chamberMaterial, [16.4, 0.05, -5.8], [0, 0, 0], [1.38, 1.12, 1], false);
  AddBox(root, [13.2, 0.5, 1.1], [16.4, 4.18, -5.65], chamberMaterial, null, false);
  for (const shaftX of [5.9, 22.9]) {
    AddBox(root, [1.65, 7.8, 1.5], [shaftX, 5.95, -4.9], chamberMaterial, null, false);
    const shaftMouth = AddMesh(root, new THREE.CircleGeometry(0.72, 18), coldMaterial, [shaftX, 9.75, -4.12], [0, 0, 0], null, false);
    shaftMouth.renderOrder = 0;
  }
  const layerGeometry = new THREE.PlaneGeometry(40, 9, 34, 8);
  const layerVertices = layerGeometry.getAttribute("position");
  for (let index = 0; index < layerVertices.count; index += 1) {
    const x = layerVertices.getX(index);
    const y = layerVertices.getY(index);
    layerVertices.setZ(index, Math.sin(x * 0.31) * 0.24 + Math.cos(y * 0.76) * 0.16);
  }
  layerGeometry.computeVertexNormals();
  AddMesh(root, layerGeometry, chamberMaterial, [chapter.width * WorldScale * 0.5, 5.0, -7.4], null, null, false);
  dynamic.ownedGeometries.push(layerGeometry);
}

function BuildTerrain(root, chapter, materials, dynamic) {
  const terrainDepth = chapter.id === "tunnel" ? 4.75 : 4.1;
  const terrainZ = chapter.id === "tunnel" ? -1.88 : -1.65;
  const terrainThickness = chapter.id === "tunnel" ? 0.22 : 0.3;
  const terrainSkin = [materials.terrainSide, materials.terrainSide, materials.ground, materials.terrainSide, materials.terrainSide, materials.terrainSide];
  for (const segment of chapter.terrain) {
    const width = (segment.x1 - segment.x0) * WorldScale;
    const x = (segment.x0 + segment.x1) * 0.5 * WorldScale;
    const y = segment.y * WorldScale;
    const mesh = AddBox(root, [width + 0.03, terrainThickness, terrainDepth], [x, y - terrainThickness * 0.5, terrainZ], segment.dynamic ? materials.wood : terrainSkin);
    if (segment.dynamic) {
      mesh.visible = false;
      dynamic.bridge = mesh;
    }
  }
}

function BuildForegroundFraming(root, chapter, materials, dynamic) {
  if (chapter.id === "tunnel") return;
  const length = chapter.width * WorldScale;
  const padding = 10;
  const span = length + padding * 2;
  const segments = Math.max(64, Math.ceil(span / 0.42));
  const positions = [];
  const indices = [];
  for (let index = 0; index <= segments; index += 1) {
    const x = -padding + span * index / segments;
    const topY = GetTerrainY(chapter, x) - 1.02 + Math.sin(index * 1.71) * 0.045 + Math.sin(index * 0.37) * 0.065;
    const z = 2.18 + Math.sin(index * 0.29) * 0.08;
    positions.push(x, topY, z, x, topY - 1.9, z + 0.03);
    if (index < segments) {
      const base = index * 2;
      indices.push(base, base + 1, base + 2, base + 2, base + 1, base + 3);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const material = new THREE.MeshBasicMaterial({
    color: new THREE.Color(materials.terrainSide.color).multiplyScalar(0.72),
    transparent: true,
    opacity: 0.34,
    depthWrite: false,
    fog: true,
    side: THREE.DoubleSide,
  });
  const mesh = AddMesh(root, geometry, material, [0, 0, 0], null, null, false);
  mesh.renderOrder = 4;
  const rockGeometry = new THREE.IcosahedronGeometry(1, 2);
  const rockCount = Math.max(5, Math.ceil(length / 6.2));
  const rocks = CreateInstancedSilhouette(root, rockGeometry, material, rockCount);
  const rockMatrix = new THREE.Matrix4();
  for (let index = 0; index < rockCount; index += 1) {
    const x = -2.5 + index * ((length + 5) / Math.max(1, rockCount - 1)) + Math.sin(index * 4.13) * 0.55;
    const randomScale = 0.72 + (index * 0.37 % 1) * 0.5;
    SetInstance(rocks, index, [x, GetTerrainY(chapter, x) - 0.84, 2.24 + (index % 3) * 0.1], [0, index * 0.73, (index % 2 ? 1 : -1) * 0.08], [0.38 * randomScale, 0.14 * randomScale, 0.58 * randomScale], rockMatrix);
  }
  rocks.instanceMatrix.needsUpdate = true;
  rocks.renderOrder = 4;
  dynamic.ownedGeometries.push(geometry);
  dynamic.ownedGeometries.push(rockGeometry);
  dynamic.ownedMaterials.push(material);
  dynamic.foreground = mesh;
  dynamic.foregroundRocks = rocks;
}

function BuildSchool(root, chapter, materials, dynamic, profile, density) {
  const courtyardVista = AddBlenderAsset(root, "Asset_SchoolCourtyardVista", {
    position: [9.4, -0.08, -5.15],
    scale: 0.56,
    castShadow: false,
  });
  if (courtyardVista) dynamic.blenderAssets.push(courtyardVista);
  const building = new THREE.Group();
  building.name = "Schoolhouse";
  root.add(building);
  const detailedSchool = AddBlenderAsset(root, "Asset_SchoolFacade", {
    position: [4.2, -0.02, -3.22],
    scale: 0.68,
  });
  if (detailedSchool) dynamic.blenderAssets.push(detailedSchool);
  if (!detailedSchool) {
    AddBox(building, [5.8, 0.22, 3.0], [4.2, 2.28, -2.25], materials.roof, [0, 0, -0.035]);
    AddGableRoof(building, 5.95, 3.15, 0.62, [4.2, 2.3, -2.25], materials.roof);
    AddBox(building, [5.55, 2.32, 0.18], [4.2, 1.08, -3.15], materials.plaster);
    AddBox(building, [0.18, 2.25, 2.75], [1.45, 1.06, -1.78], materials.plaster);
    AddBox(building, [0.18, 2.25, 2.75], [6.95, 1.06, -1.78], materials.plaster);
    AddBox(building, [2.25, 0.92, 0.22], [2.63, 0.46, -0.42], materials.plasterDark);
    AddBox(building, [1.25, 1.45, 0.18], [6.25, 0.72, -0.42], materials.plasterDark);
  }
  const chalkTexture = CreateChalkTexture();
  dynamic.ownedTextures.push(chalkTexture);
  const chalkMaterial = new THREE.MeshStandardMaterial({ map: chalkTexture, roughness: 1, emissive: 0x111a16, emissiveIntensity: 0.35 });
  dynamic.ownedMaterials.push(chalkMaterial);
  AddBox(building, [2.4, 1.18, 0.07], [3.85, 1.18, -3.02], chalkMaterial, null, false);
  for (let index = 0; index < 5; index += 1) {
    const deskX = 2.2 + index * 0.85;
    AddBox(building, [0.62, 0.07, 0.52], [deskX, 0.52, -1.8 + (index % 2) * 0.5], materials.wood);
    AddBox(building, [0.06, 0.48, 0.06], [deskX - 0.22, 0.26, -1.8 + (index % 2) * 0.5], materials.wood);
    AddBox(building, [0.06, 0.48, 0.06], [deskX + 0.22, 0.26, -1.8 + (index % 2) * 0.5], materials.wood);
  }
  const papers = new THREE.MeshStandardMaterial({ color: 0xbeb79a, roughness: 1, side: THREE.DoubleSide });
  dynamic.ownedMaterials.push(papers);
  AddMesh(building, new THREE.PlaneGeometry(0.28, 0.36), papers, [3.3, 0.69, -1.45], [-Math.PI * 0.5, 0, 0.2], null, false);
  AddCylinder(building, 0.055, 0.08, 0.22, [3.08, 0.78, -1.3], materials.metal, 8);
  const lampGlass = AddMesh(building, new THREE.SphereGeometry(0.072, 10, 7), materials.lampGlow, [3.08, 0.94, -1.3], null, [1, 1.35, 1], false);
  lampGlass.renderOrder = 3;
  const registerLight = new THREE.PointLight(profile.accent, 18, 4.8, 1.8);
  registerLight.position.set(3.08, 1.08, -0.82);
  registerLight.castShadow = false;
  building.add(registerLight);

  const detailedTower = AddBlenderAsset(root, "Asset_CheckpointWatchtower", {
    position: [17.1, 0, -1.6],
    scale: 0.82,
  });
  if (detailedTower) dynamic.blenderAssets.push(detailedTower);
  else {
    const tower = new THREE.Group();
    tower.position.set(17.1, 0, -1.6);
    root.add(tower);
    for (const x of [-0.52, 0.52]) for (const z of [-0.45, 0.45]) AddBox(tower, [0.13, 4.3, 0.13], [x, 2.15, z], materials.wood);
    AddBox(tower, [1.5, 0.18, 1.35], [0, 3.45, 0], materials.wood);
    AddBox(tower, [1.8, 0.16, 1.65], [0, 4.35, 0], materials.roof, [0, 0, 0.03]);
    for (let y = 0.35; y < 3.3; y += 0.34) AddBox(tower, [0.75, 0.055, 0.055], [-0.65, y, 0.52], materials.wood);
    AddBox(tower, [0.07, 3.15, 0.07], [-0.98, 1.82, 0.52], materials.wood);
    AddBox(tower, [0.07, 3.15, 0.07], [-0.32, 1.82, 0.52], materials.wood);
  }

  const blind = new THREE.Group();
  blind.position.set(9.0, 0, 0.3);
  for (let index = 0; index < 22; index += 1) AddBox(blind, [0.035, 1.48, 0.035], [(index - 11) * 0.12, 0.74, 0], materials.reed, [0, 0, (index % 3 - 1) * 0.025], false);
  blind.visible = false;
  root.add(blind);
  dynamic.requires.set("dropBlind", blind);

  const wall = new THREE.Group();
  wall.position.set(20.0, 0, -0.05);
  for (let index = 0; index < 10; index += 1) AddBox(wall, [0.42 + (index % 2) * 0.12, 0.52 + (index % 3) * 0.18, 0.82], [(index - 5) * 0.46, 0.3, (index % 2) * 0.08], materials.plasterDark, [0.03 * (index % 2), 0.04, (index - 4) * 0.02]);
  root.add(wall);

  let cart = AddBlenderAsset(root, "Asset_WoodenHandcart", {
    position: [chapter.cart.startX * WorldScale, 0, 0],
    scale: 0.58,
  });
  if (cart) dynamic.blenderAssets.push(cart);
  else {
    cart = new THREE.Group();
    const cartBody = AddBox(cart, [1.08, 0.62, 0.75], [0, 0.72, 0], materials.wood);
    cartBody.rotation.z = -0.035;
    for (const z of [-0.43, 0.43]) {
      const wheel = AddCylinder(cart, 0.36, 0.36, 0.08, [-0.32, 0.35, z], materials.woodDark, 14, [Math.PI * 0.5, 0, 0]);
      AddCylinder(wheel, 0.05, 0.05, 0.12, [0, 0, 0], materials.metal, 8, [Math.PI * 0.5, 0, 0]);
    }
    AddBox(cart, [1.35, 0.07, 0.08], [0.92, 0.83, -0.3], materials.wood, [0, 0, -0.22]);
    AddBox(cart, [1.35, 0.07, 0.08], [0.92, 0.83, 0.3], materials.wood, [0, 0, -0.22]);
    cart.position.x = chapter.cart.startX * WorldScale;
    root.add(cart);
  }
  dynamic.cart = cart;

  CreateReedField(root, chapter, 21.6, 29.5, Math.round(120 * density), 0.9, 3.8, materials.reedSway, 14, 0.82);
  CreateReedField(root, chapter, -1.5, 31, Math.round(70 * density), -6.2, -3.6, materials.reedSway, 15, 1.05);
}

function BuildBlockade(root, chapter, materials, dynamic, profile, density) {
  const blockadeVista = AddBlenderAsset(root, "Asset_BlockadeVista", {
    position: [16.7, -0.18, -6.6],
    scale: 0.66,
    castShadow: false,
  });
  if (blockadeVista) dynamic.blenderAssets.push(blockadeVista);
  const water = AddMesh(root, new THREE.PlaneGeometry(10.6, 7.5, 18, 4), materials.water, [20.4, -0.62, -0.25], [-Math.PI * 0.5, 0, 0], null, false);
  dynamic.water = water;
  const farWater = AddMesh(root, new THREE.PlaneGeometry(42, 12), materials.waterFar, [16.5, -0.43, -8], [-Math.PI * 0.5, 0, 0], null, false);
  dynamic.farWater = farWater;
  dynamic.waterRipples = CreateWaterRipples(root, 15.2, 25.7, -3.5, 3.25, Math.round(34 * density), materials.waterRipple, 190, -0.59);
  const shed = new THREE.Group();
  shed.position.set(10.1, 0, -0.7);
  AddBox(shed, [2.2, 0.16, 1.6], [0, 1.62, 0], materials.roof, [0, 0, -0.06]);
  AddGableRoof(shed, 2.35, 1.74, 0.38, [0, 1.61, 0], materials.roof);
  for (const x of [-0.9, 0.9]) AddBox(shed, [0.12, 1.65, 0.12], [x, 0.82, 0.42], materials.wood);
  root.add(shed);
  const shedLamp = AddMesh(shed, new THREE.SphereGeometry(0.058, 9, 6), materials.lampGlow, [0.72, 1.12, 0.5], null, [1, 1.3, 1], false);
  shedLamp.renderOrder = 3;
  const shedLight = new THREE.PointLight(profile.accent, 12, 4.2, 1.8);
  shedLight.position.set(0.72, 1.12, 0.48);
  shed.add(shedLight);

  let emptyBoat = AddBlenderAsset(root, "Asset_CivilianSampan", {
    position: [11.2, -0.45, 0.25],
    scale: 0.38,
  });
  if (emptyBoat) dynamic.blenderAssets.push(emptyBoat);
  else {
    emptyBoat = new THREE.Group();
    emptyBoat.position.set(11.2, -0.18, 0.25);
    AddBox(emptyBoat, [1.65, 0.18, 0.72], [0, 0.03, 0], materials.wood, [0, 0, 0.02]);
    AddBox(emptyBoat, [1.5, 0.32, 0.08], [0, 0.18, -0.36], materials.wood);
    AddBox(emptyBoat, [1.5, 0.32, 0.08], [0, 0.18, 0.36], materials.wood);
    AddBox(emptyBoat, [0.07, 0.07, 2.1], [0.5, 0.25, 0.25], materials.wood, [0, 0.22, 0.18]);
    root.add(emptyBoat);
  }
  dynamic.emptyBoat = emptyBoat;

  const sluice = AddBlenderAsset(root, "Asset_WaterSluice", {
    position: [17.35, -0.12, -1.45],
    scale: 0.63,
    materialTint: profile.plasterDark,
    tintAmount: 0.12,
  }) || new THREE.Group();
  if (sluice.userData.blenderAsset) dynamic.blenderAssets.push(sluice);
  else {
    sluice.position.set(17.35, 0, -0.1);
    AddBox(sluice, [0.34, 2.8, 0.42], [-0.85, 1.38, 0], materials.stone);
    AddBox(sluice, [0.34, 2.8, 0.42], [0.85, 1.38, 0], materials.stone);
    AddBox(sluice, [2.25, 0.34, 0.55], [0, 2.58, 0], materials.stone);
    AddBox(sluice, [1.42, 1.5, 0.16], [0, 0.78, 0], materials.woodDark);
    root.add(sluice);
  }
  const leverPivot = new THREE.Group();
  leverPivot.position.set(sluice.userData.blenderAsset ? 16.72 : -0.74, sluice.userData.blenderAsset ? 2.12 : 2.12, sluice.userData.blenderAsset ? -0.72 : 0.38);
  AddBox(leverPivot, [2.55, 0.12, 0.12], [1.1, 0, 0], materials.wood, [0, 0, 0.2]);
  if (sluice.userData.blenderAsset) root.add(leverPivot);
  else sluice.add(leverPivot);
  dynamic.sluiceLever = leverPivot;

  const bridge = new THREE.Group();
  bridge.position.set(20.4, -0.52, 0.18);
  for (let index = 0; index < 12; index += 1) AddBox(bridge, [0.31, 0.08, 1.05], [(index - 5.5) * 0.34, Math.sin(index) * 0.015, 0], materials.wood, [0, 0, (index % 2 ? 1 : -1) * 0.025]);
  AddBox(bridge, [4.2, 0.06, 0.06], [0, -0.08, -0.42], materials.rope, null, false);
  AddBox(bridge, [4.2, 0.06, 0.06], [0, -0.08, 0.42], materials.rope, null, false);
  bridge.visible = false;
  root.add(bridge);
  dynamic.bridge = bridge;

  CreateReedField(root, chapter, 0, 17.7, Math.round(185 * density), -2.6, -0.85, materials.reedSway, 31, 0.95);
  CreateReedField(root, chapter, 22.4, 34.6, Math.round(150 * density), -2.6, -0.85, materials.reedSway, 32, 0.98);
  CreateReedField(root, chapter, -2, 36, Math.round(135 * density), -6.1, -3.25, materials.reedSway, 33, 1.18);
  CreateReedField(root, chapter, -2, 36, Math.round(16 * density), 4.35, 6.4, materials.reedSway, 34, 1.05);
}

function BuildSmokeParticles(root, materials, dynamic, count = 100) {
  const positions = new Float32Array(count * 3);
  const random = CreateRandom(92);
  for (let index = 0; index < count; index += 1) {
    positions[index * 3] = -12 + random() * 16;
    positions[index * 3 + 1] = random() * 2.2;
    positions[index * 3 + 2] = (random() - 0.5) * 3;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const material = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uOpacity: { value: 0.18 } },
    vertexShader: `
      uniform float uTime;
      varying float vFade;
      void main() {
        vec3 p = position;
        p.x += sin(uTime * 0.42 + position.y * 2.7 + position.z) * 0.34;
        p.y += sin(uTime * 0.63 + position.x * 1.8) * 0.17 + mod(uTime * 0.08 + position.x * 0.03, 0.42);
        p.z += cos(uTime * 0.35 + position.x) * 0.22;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = clamp(150.0 / max(1.0, -mv.z), 3.5, 14.0);
        vFade = 0.45 + 0.55 * fract(position.x * 3.17 + position.y * 2.31);
      }
    `,
    fragmentShader: `
      uniform float uOpacity;
      varying float vFade;
      void main() {
        vec2 p = gl_PointCoord - 0.5;
        float soft = smoothstep(0.5, 0.06, length(p));
        gl_FragColor = vec4(vec3(0.46, 0.44, 0.38), soft * uOpacity * vFade);
        #include <colorspace_fragment>
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.NormalBlending,
  });
  const points = new THREE.Points(geometry, material);
  points.position.set(29, -0.1, -0.1);
  root.add(points);
  dynamic.ownedMaterials.push(material);
  dynamic.ownedGeometries.push(geometry);
  dynamic.smoke = points;
}

function BuildTunnel(root, chapter, materials, dynamic, profile, density, dustCount) {
  const tunnelVista = AddBlenderAsset(root, "Asset_TunnelShaftVista", {
    position: [15.0, -0.24, -3.7],
    scale: 0.96,
    castShadow: false,
  });
  if (tunnelVista) dynamic.blenderAssets.push(tunnelVista);
  AddBox(root, [32, 0.65, 4.8], [15, 2.52, -2.0], materials.earth, null, false);
  AddBox(root, [32, 4.8, 0.75], [15, 0.35, -3.55], materials.earth, null, false);
  AddBox(root, [32, 0.16, 0.42], [15, -0.18, 0.18], materials.earthDark, null, false);
  AddBox(root, [32, 1.02, 0.12], [15, -1.22, 1.02], materials.terrainSide, null, false);
  for (const x of [8.0, 22.2]) {
    const tunnelKit = AddBlenderAsset(root, "Asset_TunnelInteriorKit", {
      position: [x, -0.12, -0.35],
      scale: 0.67,
      castShadow: true,
    });
    if (tunnelKit) dynamic.blenderAssets.push(tunnelKit);
  }
  const wallRandom = CreateRandom(1942);
  const wallGeometry = new THREE.PlaneGeometry(32, 4.4, 64, 12);
  const wallVertices = wallGeometry.getAttribute("position");
  for (let index = 0; index < wallVertices.count; index += 1) {
    const x = wallVertices.getX(index);
    const y = wallVertices.getY(index);
    const relief = Math.sin(x * 1.13 + y * 2.7) * 0.055 + Math.cos(x * 0.43 - y * 4.1) * 0.035 + (wallRandom() - 0.5) * 0.055;
    wallVertices.setZ(index, relief);
  }
  wallGeometry.computeVertexNormals();
  const wallSurface = AddMesh(root, wallGeometry, materials.earthDark, [15, 0.35, -3.08], null, null, false);
  wallSurface.receiveShadow = true;
  const wallMatrix = new THREE.Matrix4();
  const wallPosition = new THREE.Vector3();
  const wallQuaternion = new THREE.Quaternion();
  const wallScale = new THREE.Vector3();
  const ceilingGeometry = new THREE.IcosahedronGeometry(0.72, 1);
  const ceilingLumps = new THREE.InstancedMesh(ceilingGeometry, materials.earthDark, 18);
  for (let index = 0; index < 18; index += 1) {
    wallPosition.set(0.4 + wallRandom() * 29.2, 2.18 + wallRandom() * 0.26, -0.55 + (wallRandom() - 0.5) * 2.4);
    wallQuaternion.setFromEuler(new THREE.Euler(wallRandom(), wallRandom(), wallRandom()));
    wallScale.set(0.75 + wallRandom() * 1.15, 0.18 + wallRandom() * 0.2, 0.62 + wallRandom() * 1.0);
    wallMatrix.compose(wallPosition, wallQuaternion, wallScale);
    ceilingLumps.setMatrixAt(index, wallMatrix);
  }
  ceilingLumps.instanceMatrix.needsUpdate = true;
  ceilingLumps.castShadow = false;
  ceilingLumps.receiveShadow = true;
  root.add(ceilingLumps);
  for (let x = 2.4; x < 30; x += 3.1) AddCrossBeam(root, x, 0.82, -0.12, 2.35, materials.wood);
  for (let index = 0; index < 32; index += 1) {
    const x = 0.55 + index * 0.94;
    const row = index % 3;
    AddBox(root, [0.72 + (index % 2) * 0.11, 0.23, 0.09], [x, 0.18 + row * 0.29, -3.12], materials.plasterDark, [0, 0, (index % 5 - 2) * 0.018], false);
  }
  for (const low of chapter.lowCeilings || []) {
    const x = (low.x0 + low.x1) * 0.5 * WorldScale;
    const width = (low.x1 - low.x0) * WorldScale;
    AddBox(root, [width, 0.55, 2.5], [x, 1.98, -1.05], materials.earthDark, [0, 0, (low.x0 % 3 - 1) * 0.025]);
  }
  for (const x of [5.9, 22.9]) {
    AddMesh(root, new THREE.TorusGeometry(0.58, 0.16, 7, 16), materials.earthDark, [x, 2.18, -0.18], [Math.PI * 0.5, 0, 0], null, false);
    const shaftVolume = AddMesh(root, new THREE.ConeGeometry(0.9, 3, 24, 1, true), materials.shaftGlow, [x, 0.8, -0.12], null, null, false);
    shaftVolume.renderOrder = 3;
    const shaftPool = AddMesh(root, new THREE.CircleGeometry(0.88, 28), materials.shaftPool, [x, GetTerrainY(chapter, x) + 0.015, -0.1], [-Math.PI * 0.5, 0, 0], [1.2, 0.56, 1], false);
    shaftPool.renderOrder = 3;
    const shaftLight = new THREE.PointLight(profile.moon, x < 10 ? 20 : 14, 5.8, 1.75);
    shaftLight.position.set(x, 2.3, -0.2);
    root.add(shaftLight);
    dynamic.shaftLights.push(shaftLight);
    dynamic.shaftVolumes.push({ volume: shaftVolume, pool: shaftPool });
  }
  for (let x = 7.8; x < 26; x += 4.7) {
    const lamp = new THREE.PointLight(profile.accent, 14, 4.0, 1.8);
    lamp.position.set(x, 0.82, -1.3);
    root.add(lamp);
    AddCylinder(root, 0.065, 0.085, 0.19, [x, 0.46, -1.25], materials.metal, 8);
    const lampFlame = AddMesh(root, new THREE.SphereGeometry(0.045, 8, 6), materials.lampGlow, [x, 0.62, -1.22], null, [0.75, 1.5, 0.75], false);
    lampFlame.renderOrder = 4;
  }
  for (let x = 3.1; x < 30; x += 5.4) {
    AddCylinder(root, 0.018, 0.035, 0.65 + (x % 1.1), [x, 2.1, 0.7], materials.earthDark, 6, [0, 0, 0.08 + (x % 0.2)], false);
  }
  AddBox(root, [1.35, 0.08, 0.65], [16.2, 0.12, -0.9], materials.cloth, [0.03, 0.08, 0.05]);
  AddBox(root, [0.7, 0.48, 0.55], [19.8, 0.18, -0.5], materials.reed);
  BuildSmokeParticles(root, materials, dynamic, dustCount);
}

function BuildFerry(root, chapter, materials, dynamic, profile, density) {
  const riverbankVista = AddBlenderAsset(root, "Asset_FerryRiverbankVista", {
    position: [18.2, -0.62, -18.5],
    scale: 0.46,
    castShadow: false,
    materialTint: new THREE.Color(profile.ground).multiplyScalar(0.42),
    tintAmount: 0.64,
  });
  if (riverbankVista) dynamic.blenderAssets.push(riverbankVista);
  const water = AddMesh(root, new THREE.PlaneGeometry(18, 13, 24, 6), materials.water, [32.3, -0.42, -0.8], [-Math.PI * 0.5, 0, 0], null, false);
  dynamic.water = water;
  const farWater = AddMesh(root, new THREE.PlaneGeometry(48, 13), materials.waterFar, [18, -0.48, -8.5], [-Math.PI * 0.5, 0, 0], null, false);
  dynamic.farWater = farWater;
  dynamic.waterRipples = CreateWaterRipples(root, 23.4, 40.8, -4.2, 3.9, Math.round(44 * density), materials.waterRipple, 291, -0.39);
  const screen = new THREE.Group();
  screen.position.set(13.45, 0, 0.28);
  for (let index = 0; index < 32; index += 1) AddBox(screen, [0.032, 1.62, 0.03], [(index - 15.5) * 0.11, 0.81, 0], materials.reed, [0, 0, (index % 4 - 1.5) * 0.018], false);
  AddBox(screen, [3.7, 0.06, 0.06], [0, 0.48, 0.03], materials.rope, null, false);
  screen.visible = false;
  root.add(screen);
  dynamic.requires.set("raiseScreen", screen);

  const signal = new THREE.Group();
  signal.position.set(20.7, 0, -0.1);
  AddBox(signal, [0.09, 3.2, 0.09], [0, 1.6, 0], materials.wood);
  const clothMaterial = new THREE.MeshStandardMaterial({ color: 0xa9a38e, roughness: 1, side: THREE.DoubleSide });
  dynamic.ownedMaterials.push(clothMaterial);
  const cloth = AddMesh(signal, new THREE.PlaneGeometry(0.82, 0.5, 4, 2), clothMaterial, [0.45, 2.58, 0.05], [0, 0, -0.08], null, false);
  cloth.visible = false;
  dynamic.signalCloth = cloth;
  root.add(signal);

  let ferry = AddBlenderAsset(root, "Asset_CivilianSampan", {
    position: [33.1, -0.38, 0.08],
    scale: 0.62,
  });
  if (ferry) dynamic.blenderAssets.push(ferry);
  else {
    ferry = new THREE.Group();
    ferry.position.set(33.1, -0.24, 0.08);
    AddBox(ferry, [3.15, 0.22, 1.12], [0, 0.04, 0], materials.wood, [0, 0, 0.018]);
    AddBox(ferry, [2.95, 0.42, 0.09], [0, 0.24, -0.54], materials.wood);
    AddBox(ferry, [2.95, 0.42, 0.09], [0, 0.24, 0.54], materials.wood);
    for (let x = -1.2; x <= 1.2; x += 0.6) AddBox(ferry, [0.08, 0.12, 1.0], [x, 0.19, 0], materials.woodDark);
    AddBox(ferry, [0.08, 0.08, 3.6], [1.05, 0.52, 0.55], materials.wood, [0, 0.12, -0.18]);
    root.add(ferry);
  }
  dynamic.ferry = ferry;
  dynamic.ferryHome = ferry.position.clone();

  // The finale pulls far enough back that six fully articulated child rigs
  // would spend hundreds of draw calls on details smaller than a pixel.  A
  // two-draw instanced huddle keeps the authored 2x3 silhouette while the
  // close boarding shots continue to use the complete rigs.
  const huddleBodyGeometry = new THREE.CylinderGeometry(0.14, 0.2, 0.6, 8);
  const huddleHeadGeometry = new THREE.SphereGeometry(0.12, 10, 7);
  const huddleArmGeometry = new THREE.CylinderGeometry(0.032, 0.043, 0.36, 7);
  const huddleBodyMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 1,
    metalness: 0,
    vertexColors: true,
    emissive: 0x11130f,
    emissiveIntensity: 0.32,
  });
  const huddleSkinMaterial = new THREE.MeshStandardMaterial({ color: 0x9f8463, roughness: 1, metalness: 0 });
  const huddleBodies = new THREE.InstancedMesh(huddleBodyGeometry, huddleBodyMaterial, 6);
  const huddleKnees = new THREE.InstancedMesh(huddleHeadGeometry, huddleBodyMaterial, 6);
  const huddleHeads = new THREE.InstancedMesh(huddleHeadGeometry, huddleSkinMaterial, 6);
  const huddleHair = new THREE.InstancedMesh(huddleHeadGeometry, materials.woodDark, 6);
  const huddleArms = new THREE.InstancedMesh(huddleArmGeometry, huddleBodyMaterial, 12);
  const huddleColors = [0x4c4b3e, 0x424b42, 0x51473d, 0x3e4745, 0x554d41, 0x44473b];
  huddleColors.forEach((color, index) => {
    huddleBodies.setColorAt(index, new THREE.Color(color));
    huddleKnees.setColorAt(index, new THREE.Color(color));
    huddleArms.setColorAt(index * 2, new THREE.Color(color));
    huddleArms.setColorAt(index * 2 + 1, new THREE.Color(color));
  });
  if (huddleBodies.instanceColor) huddleBodies.instanceColor.needsUpdate = true;
  if (huddleKnees.instanceColor) huddleKnees.instanceColor.needsUpdate = true;
  if (huddleArms.instanceColor) huddleArms.instanceColor.needsUpdate = true;
  huddleBodies.castShadow = false;
  huddleBodies.receiveShadow = true;
  huddleKnees.castShadow = false;
  huddleKnees.receiveShadow = true;
  huddleHeads.castShadow = false;
  huddleHeads.receiveShadow = true;
  huddleHair.castShadow = false;
  huddleHair.receiveShadow = true;
  huddleArms.castShadow = false;
  huddleArms.receiveShadow = true;
  const ferryHuddle = new THREE.Group();
  ferryHuddle.name = "FerryChildrenHuddleLod";
  ferryHuddle.visible = false;
  ferryHuddle.add(huddleBodies, huddleKnees, huddleHeads, huddleHair, huddleArms);
  root.add(ferryHuddle);
  dynamic.ownedGeometries.push(huddleBodyGeometry, huddleHeadGeometry, huddleArmGeometry);
  dynamic.ownedMaterials.push(huddleBodyMaterial, huddleSkinMaterial);
  dynamic.ferryHuddle = {
    group: ferryHuddle,
    bodies: huddleBodies,
    knees: huddleKnees,
    heads: huddleHeads,
    hair: huddleHair,
    arms: huddleArms,
    matrix: new THREE.Matrix4(),
    position: new THREE.Vector3(),
    quaternion: new THREE.Quaternion(),
    scale: new THREE.Vector3(1, 1, 1),
  };

  const motherLantern = new THREE.Group();
  AddCylinder(motherLantern, 0.055, 0.08, 0.2, [0, 0, 0], materials.metal, 8, null, false);
  const motherFlame = AddMesh(motherLantern, new THREE.SphereGeometry(0.055, 9, 6), materials.lampGlow, [0, 0.15, 0], null, [0.8, 1.45, 0.8], false);
  motherFlame.renderOrder = 4;
  const motherLight = new THREE.PointLight(profile.accent, 3.6, 2.8, 2);
  motherLight.position.set(0, 0.18, 0.12);
  motherLantern.add(motherLight);
  motherLantern.visible = false;
  root.add(motherLantern);
  dynamic.motherLantern = motherLantern;
  dynamic.motherLanternLight = motherLight;

  CreateReedField(root, chapter, -1, 30.8, Math.round(210 * density), -2.45, -0.75, materials.reedSway, 61, 0.98);
  CreateReedField(root, chapter, 34, 39, Math.round(75 * density), -1.8, 0.4, materials.reedSway, 62, 1.08);
  CreateReedField(root, chapter, -2, 39, Math.round(155 * density), -6.5, -3.25, materials.reedSway, 63, 1.25);
  CreateReedField(root, chapter, -2, 39, Math.round(14 * density), 4.6, 6.5, materials.reedSway, 64, 1.08);
}

function BuildCoverProps(root, chapter, materials, dynamic) {
  for (const cover of chapter.covers || []) {
    if (["schoolWall", "reedBlind", "collapsedWall", "underground", "tallReeds", "reedBank", "ferryShade", "reedScreen", "sluiceWall", "boatShed"].includes(cover.kind)) continue;
    const x = (cover.x0 + cover.x1) * 0.5 * WorldScale;
    const width = (cover.x1 - cover.x0) * WorldScale;
    const y = GetTerrainY(chapter, x);
    const group = new THREE.Group();
    group.position.set(x, y, 0.1);
    if (cover.kind === "willows") {
      for (let treeIndex = 0; treeIndex < 2; treeIndex += 1) {
        const treeX = (treeIndex - 0.5) * width * 0.42;
        const height = 2.65 + treeIndex * 0.4;
        AddCylinder(group, 0.1, 0.18, height, [treeX, height * 0.5, -0.25], materials.woodDark, 9, [0, 0, treeIndex ? -0.08 : 0.1]);
        for (let crownIndex = 0; crownIndex < 5; crownIndex += 1) {
          const crown = AddMesh(group, new THREE.IcosahedronGeometry(0.58 + (crownIndex % 2) * 0.15, 1), materials.foliage, [treeX + (crownIndex - 2) * 0.36, height - 0.25 + Math.sin(crownIndex) * 0.28, -0.32 + (crownIndex % 2) * 0.22], null, [1.15, 0.72, 0.9]);
          crown.castShadow = true;
        }
        for (let branchIndex = 0; branchIndex < 4; branchIndex += 1) {
          AddCylinder(group, 0.018, 0.035, 1.2 + branchIndex * 0.12, [treeX + (branchIndex - 1.5) * 0.28, height - 0.9, 0.05], materials.foliage, 6, [0, 0, (branchIndex - 1.5) * 0.11], false);
        }
      }
    } else if (["haystack", "reedStack"].includes(cover.kind)) {
      for (let index = 0; index < 8; index += 1) AddCylinder(group, width * (0.34 + index * 0.015), width * (0.38 + index * 0.012), 0.22, [(index % 2 - 0.5) * width * 0.18, 0.12 + index * 0.16, (index % 3 - 1) * 0.14], materials.reed, 9, [0, 0, Math.PI * 0.5]);
    } else if (["bank", "dike"].includes(cover.kind)) {
      const count = Math.max(5, Math.ceil(width / 0.48));
      AddBox(group, [width, 0.34, 0.9], [0, 0.08, -0.08], materials.earthDark, [0, 0, cover.kind === "dike" ? -0.025 : 0.018]);
      const geometry = new THREE.IcosahedronGeometry(0.28, 2);
      const stones = new THREE.InstancedMesh(geometry, materials.earth, count);
      const matrix = new THREE.Matrix4();
      const position = new THREE.Vector3();
      const quaternion = new THREE.Quaternion();
      const scale = new THREE.Vector3();
      for (let index = 0; index < count; index += 1) {
        const t = count === 1 ? 0.5 : index / (count - 1);
        position.set((t - 0.5) * width, 0.26 + Math.sin(index * 1.73) * 0.035, (index % 3 - 1) * 0.11);
        quaternion.setFromEuler(new THREE.Euler(index * 0.31, index * 0.57, index * 0.19));
        scale.set(0.72 + (index % 3) * 0.11, 0.48 + (index % 2) * 0.12, 0.78 + (index % 4) * 0.06);
        matrix.compose(position, quaternion, scale);
        stones.setMatrixAt(index, matrix);
      }
      stones.instanceMatrix.needsUpdate = true;
      stones.castShadow = true;
      stones.receiveShadow = true;
      group.add(stones);
    } else if (cover.kind === "ditch") {
      const lipWidth = Math.min(0.48, width * 0.24);
      AddBox(group, [lipWidth, 0.24, 1.15], [-width * 0.5 + lipWidth * 0.5, 0.05, 0], materials.earth, [0, 0, 0.08]);
      AddBox(group, [lipWidth, 0.2, 1.05], [width * 0.5 - lipWidth * 0.5, 0.02, 0.04], materials.earthDark, [0, 0, -0.06]);
    } else {
      const height = 0.68;
      AddBox(group, [width, height, cover.kind === "ditch" ? 1.8 : 1.05], [0, height * 0.5, 0], cover.kind === "boatShed" ? materials.woodDark : materials.earth);
    }
    root.add(group);
    if (cover.requires) {
      group.visible = false;
      dynamic.requires.set(cover.requires, group);
    }
  }
}

function CreateActionCues(root, chapter, materials, dynamic) {
  for (const action of chapter.actions) {
    if (action.special === "cart") continue;
    const group = new THREE.Group();
    const y = GetTerrainY(chapter, action.x * WorldScale) + 0.42;
    group.position.set(action.x * WorldScale, y, 0.62);
    const core = AddMesh(group, new THREE.OctahedronGeometry(0.038, 0), materials.cue, [0, 0, 0], null, null, false);
    core.renderOrder = 5;
    root.add(group);
    dynamic.actionCues.set(action.id, group);
  }
}

function CreateMaterials(profile, dynamic, chapterId) {
  const earthTexture = CreateCanvasTexture("#5a4934", "#8b7655", 81);
  const plasterTexture = CreateCanvasTexture("#777665", "#a9a38b", 82);
  const waterTexture = CreateWaterTexture(1942 + chapterId.length * 31);
  dynamic.ownedTextures.push(earthTexture, plasterTexture, waterTexture);
  const tunnel = chapterId === "tunnel";
  const materials = {
    ground: CreateMaterial(profile.ground, { map: earthTexture, bumpMap: earthTexture, bumpScale: 0.075, emissive: tunnel ? 0x1b1008 : 0x000000, emissiveIntensity: tunnel ? 0.8 : 0 }),
    terrainSide: CreateMaterial(new THREE.Color(profile.ground).multiplyScalar(tunnel ? 0.5 : 0.42), { map: earthTexture, bumpMap: earthTexture, bumpScale: 0.055, emissive: tunnel ? 0x120a05 : 0x050706, emissiveIntensity: tunnel ? 0.42 : 0.16 }),
    earth: CreateMaterial(profile.earth, { map: earthTexture, bumpMap: earthTexture, bumpScale: 0.09, emissive: tunnel ? 0x160d07 : 0x000000, emissiveIntensity: tunnel ? 0.4 : 0 }),
    earthDark: CreateMaterial(new THREE.Color(profile.earth).multiplyScalar(0.55), { map: earthTexture, bumpMap: earthTexture, bumpScale: 0.065, emissive: tunnel ? 0x120b06 : 0x000000, emissiveIntensity: tunnel ? 0.3 : 0 }),
    plaster: CreateMaterial(profile.plaster, { map: plasterTexture, bumpMap: plasterTexture, bumpScale: 0.035 }),
    plasterDark: CreateMaterial(profile.plasterDark, { map: plasterTexture, bumpMap: plasterTexture, bumpScale: 0.025 }),
    wood: CreateMaterial(profile.wood, { emissive: tunnel ? 0x120a04 : 0x000000, emissiveIntensity: tunnel ? 0.22 : 0 }),
    woodDark: CreateMaterial(new THREE.Color(profile.wood).multiplyScalar(0.56)),
    roof: CreateMaterial(new THREE.Color(profile.plasterDark).multiplyScalar(0.62)),
    stone: CreateMaterial(new THREE.Color(profile.plaster).multiplyScalar(0.68)),
    reed: CreateMaterial(profile.reed),
    rope: CreateMaterial(0x716044),
    metal: CreateMaterial(0x30332f, { roughness: 0.68, metalness: 0.32 }),
    cloth: CreateMaterial(0x5d5747),
    foliage: CreateMaterial(new THREE.Color(profile.reed).multiplyScalar(0.78), { roughness: 1 }),
    cue: new THREE.MeshBasicMaterial({ color: profile.accent, transparent: true, opacity: 0.48, depthWrite: false }),
    lampGlow: new THREE.MeshBasicMaterial({ color: profile.accent, transparent: true, opacity: 0.94, depthWrite: false }),
    shaftGlow: new THREE.MeshBasicMaterial({ color: profile.moon, transparent: true, opacity: 0.065, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }),
    shaftPool: new THREE.MeshBasicMaterial({ color: profile.moon, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }),
    waterRipple: new THREE.MeshBasicMaterial({ color: profile.moon, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }),
    water: new THREE.MeshPhysicalMaterial({ color: profile.water, roughness: 0.24, metalness: 0.04, transparent: true, opacity: 0.9, clearcoat: 0.72, clearcoatRoughness: 0.3, bumpMap: waterTexture, bumpScale: 0.075, side: THREE.DoubleSide, emissive: new THREE.Color(profile.water).multiplyScalar(0.08), emissiveIntensity: 0.2 }),
    waterFar: new THREE.MeshStandardMaterial({ color: new THREE.Color(profile.water).multiplyScalar(0.82), roughness: 0.28, metalness: 0.03, transparent: true, opacity: 0.86, bumpMap: waterTexture, bumpScale: 0.045, side: THREE.DoubleSide, emissive: new THREE.Color(profile.water).multiplyScalar(0.055), emissiveIntensity: 0.16 }),
    reedSway: CreateReedMaterial(profile.reed),
  };
  materials.water.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = { value: 0 };
    shader.vertexShader = `uniform float uTime;\n${shader.vertexShader}`;
    shader.vertexShader = shader.vertexShader.replace("#include <begin_vertex>", `#include <begin_vertex>
      transformed.z += (sin(position.x * 1.8 + uTime * 0.8) + cos(position.y * 2.3 - uTime * 0.56)) * 0.035;`);
    materials.water.userData.shader = shader;
  };
  dynamic.ownedMaterials.push(...Object.values(materials));
  return materials;
}

export function CreateChapterScene3D(chapter, renderProfile) {
  const profile = GetVisualProfile(chapter.id);
  const root = new THREE.Group();
  root.name = `Chapter_${chapter.id}`;
  const dynamic = {
    requires: new Map(),
    actionCues: new Map(),
    ownedMaterials: [],
    ownedTextures: [],
    ownedGeometries: [],
    blenderAssets: [],
    shaftLights: [],
    shaftVolumes: [],
    mistLayers: [],
    foreground: null,
    bridge: null,
    bridgeRaise: 0,
    cart: null,
    water: null,
    waterRipples: null,
    farWater: null,
    emptyBoat: null,
    emptyBoatRelease: 0,
    sluiceLever: null,
    smoke: null,
    signalCloth: null,
    ferry: null,
    ferryHome: null,
    motherLantern: null,
    motherLanternLight: null,
  };
  const materials = CreateMaterials(profile, dynamic, chapter.id);
  BuildSkyBackdrop(root, profile, chapter, dynamic);
  BuildAtmosphericLayers(root, profile, chapter, dynamic);
  BuildTerrain(root, chapter, materials, dynamic);
  if (chapter.id !== "tunnel") BuildDistantVillage(root, profile, materials.plasterDark, 7 + chapter.id.length, chapter.width * WorldScale, dynamic, chapter.id);
  const density = renderProfile.reedDensity;
  if (chapter.id === "school") BuildSchool(root, chapter, materials, dynamic, profile, density);
  if (chapter.id === "blockade") BuildBlockade(root, chapter, materials, dynamic, profile, density);
  if (chapter.id === "tunnel") BuildTunnel(root, chapter, materials, dynamic, profile, density, renderProfile.dustCount);
  if (chapter.id === "ferry") BuildFerry(root, chapter, materials, dynamic, profile, density);
  if (chapter.id === "tunnel") BuildTunnelScaleLayer(root, chapter, materials, dynamic, profile);
  BuildCoverProps(root, chapter, materials, dynamic);
  BuildForegroundFraming(root, chapter, materials, dynamic);
  BuildNearScaleLayer(root, chapter, profile, dynamic);
  CreateActionCues(root, chapter, materials, dynamic);

  const actors = {
    player: CreateActor3D("player"),
    followers: Array.from({ length: 6 }, (_, index) => CreateActor3D("child", index)),
    mother: CreateActor3D("mother"),
  };
  root.add(actors.player, actors.mother, ...actors.followers);
  actors.mother.visible = chapter.id === "ferry";

  function Update(state, deltaTime, time, windStrength, cinematicFrame = null) {
    const cueState = state.cinematicCue;
    const cueAge = cueState && Number.isFinite(cueState.startedAt) ? state.elapsed - cueState.startedAt : Infinity;
    const cueLive = Boolean(cueState && cueAge >= 0 && cueAge <= (cueState.duration || 0));
    const cartPushing = chapter.cart && !state.completed.has("cartPlaced") && state.cartX !== null
      && Math.abs(state.player.x - state.cartX) < 92 && Math.abs(state.player.vx || 0) > 0.5;
    const playerActionId = state.activeActionId || (cartPushing ? "cartPlaced" : cueLive ? cueState.actionId : null);
    const playerCue = playerActionId ? GetCinematicCue(playerActionId) : null;
    const playerActionTime = state.activeActionId ? state.actionProgress : cueLive ? cueAge : 0;
    const activeAction = playerActionId ? chapter.actions.find((action) => action.id === playerActionId) : null;
    const playerActionDuration = state.activeActionId ? Math.max(0.35, activeAction?.seconds || 0.8) : Math.max(0.35, playerCue?.duration || 1.4);
    const followerActionId = cueLive ? cueState.actionId : state.activeActionId;
    const followerCue = followerActionId ? GetCinematicCue(followerActionId) : null;
    const directorActors = cinematicFrame?.actors;
    const directorEffects = cinematicFrame?.effects || {};
    const playerAction = directorActors?.player || playerCue?.pose || null;
    const followerAction = directorActors?.followers || followerCue?.followerPose || null;
    const directorActionTime = cinematicFrame ? cinematicFrame.segmentProgress : null;
    const registerSequence = cinematicFrame?.id || "";
    const registerProgress = Number(cinematicFrame?.progress || 0);
    const playerHasRegister = ["ferryOpening", "tunnelRollCall", "ferryRollCall", "endingDeparture"].includes(registerSequence)
      || (registerSequence === "registerHandoff" && registerProgress >= 0.23)
      || (registerSequence === "motherHandoff" && (registerProgress < 0.2 || registerProgress >= 0.72));
    const motherHasRegister = registerSequence === "schoolOpening"
      || (registerSequence === "registerHandoff" && registerProgress < 0.23)
      || (registerSequence === "motherHandoff" && registerProgress >= 0.2 && registerProgress < 0.72);
    const boarding = Number(cinematicFrame?.effects?.boarding || 0);
    const playerBoarding = Number(cinematicFrame?.effects?.playerBoarding || 0);
    const ferryDeparture = Number(cinematicFrame?.effects?.ferryDeparture || 0);
    let ferryX = dynamic.ferryHome?.x ?? 33.1;
    let ferryY = dynamic.ferryHome?.y ?? -0.38;
    let ferryZ = dynamic.ferryHome?.z ?? 0.08;
    if (dynamic.ferry && dynamic.ferryHome) {
      ferryX = dynamic.ferryHome.x + ferryDeparture * 5.2;
      ferryY = dynamic.ferryHome.y + Math.sin(time * 0.9) * 0.035 - ferryDeparture * 0.08;
      ferryZ = dynamic.ferryHome.z - ferryDeparture * 3.4;
      dynamic.ferry.position.set(ferryX, ferryY, ferryZ);
      dynamic.ferry.rotation.z = Math.sin(time * 0.72) * (0.018 + ferryDeparture * 0.012);
      dynamic.ferry.rotation.y = -ferryDeparture * 0.055;
    }
    const playerBoardBlend = THREE.MathUtils.clamp(playerBoarding, 0, 1);
    const useFerryHuddle = Boolean(dynamic.ferryHuddle && state.followers.length >= 4);
    if (dynamic.ferryHuddle) {
      const huddle = dynamic.ferryHuddle;
      huddle.group.visible = useFerryHuddle;
      if (useFerryHuddle) {
        for (let index = 0; index < 6; index += 1) {
          const row = Math.floor(index / 3);
          const column = index % 3;
          const follower = state.followers[index];
          const boardThreshold = (index + 1) / 7;
          const followerBoardBlend = cinematicFrame?.id === "endingDeparture"
            ? THREE.MathUtils.clamp((boarding - boardThreshold) * 7.5, 0, 1)
            : 0;
          const detailedAnchor = index === 0 || index === 2;
          const lodScale = detailedAnchor ? 0 : 1;
          const ferryChildX = ferryX - 0.88 + column * 0.62 + row * 0.28;
          const huddleBreath = Math.sin(time * 1.55 + index * 0.92) * 0.015;
          const ferryChildY = ferryY + 0.75 + row * 0.05 + huddleBreath;
          const ferryChildZ = ferryZ + 0.32 - row * 0.72;
          const shoreChildX = (follower?.x ?? state.player.x) * WorldScale;
          const shoreChildY = (follower?.y ?? state.player.y) * WorldScale + 0.62;
          const shoreChildZ = 0.2 - index * 0.035;
          const childX = THREE.MathUtils.lerp(shoreChildX, ferryChildX, followerBoardBlend);
          const childY = THREE.MathUtils.lerp(shoreChildY, ferryChildY, followerBoardBlend);
          const childZ = THREE.MathUtils.lerp(shoreChildZ, ferryChildZ, followerBoardBlend);
          huddle.position.set(childX, childY, childZ);
          huddle.quaternion.setFromEuler(new THREE.Euler(0, 0, -0.1 + column * 0.025));
          huddle.scale.setScalar(lodScale);
          huddle.matrix.compose(huddle.position, huddle.quaternion, huddle.scale);
          huddle.bodies.setMatrixAt(index, huddle.matrix);
          huddle.position.set(childX + 0.13, childY - 0.37, childZ);
          huddle.quaternion.identity();
          huddle.scale.set(1.38 * lodScale, 0.74 * lodScale, 1.05 * lodScale);
          huddle.matrix.compose(huddle.position, huddle.quaternion, huddle.scale);
          huddle.knees.setMatrixAt(index, huddle.matrix);
          huddle.position.set(childX + 0.055, childY + 0.49, childZ);
          huddle.quaternion.identity();
          huddle.scale.setScalar(lodScale);
          huddle.matrix.compose(huddle.position, huddle.quaternion, huddle.scale);
          huddle.heads.setMatrixAt(index, huddle.matrix);
          huddle.position.set(childX - 0.005, childY + 0.54, childZ - 0.008);
          huddle.scale.set(0.9 * lodScale, 0.88 * lodScale, 0.92 * lodScale);
          huddle.matrix.compose(huddle.position, huddle.quaternion, huddle.scale);
          huddle.hair.setMatrixAt(index, huddle.matrix);
          for (let armIndex = 0; armIndex < 2; armIndex += 1) {
            const side = armIndex === 0 ? -1 : 1;
            const finalEmbrace = cinematicFrame?.id === "endingDeparture" && cinematicFrame.segmentIndex === 4 ? 1 : 0;
            huddle.position.set(childX + side * 0.135, childY + 0.08, childZ + 0.015);
            huddle.quaternion.setFromEuler(new THREE.Euler(0.08 * row, 0, side * (0.2 + finalEmbrace * (0.2 + (index % 2) * 0.08))));
            huddle.scale.setScalar(lodScale);
            huddle.matrix.compose(huddle.position, huddle.quaternion, huddle.scale);
            huddle.arms.setMatrixAt(index * 2 + armIndex, huddle.matrix);
          }
        }
        huddle.bodies.instanceMatrix.needsUpdate = true;
        huddle.knees.instanceMatrix.needsUpdate = true;
        huddle.heads.instanceMatrix.needsUpdate = true;
        huddle.hair.instanceMatrix.needsUpdate = true;
        huddle.arms.instanceMatrix.needsUpdate = true;
      }
    }
    const playerGround = state.player.y * WorldScale;
    const motherHandoffActive = registerSequence === "motherHandoff";
    const authoredPlayerX = motherHandoffActive ? 18.46 : state.player.x * WorldScale;
    const schoolHandoffActive = ["schoolOpening", "registerHandoff"].includes(registerSequence);
    UpdateActor3D(actors.player, {
      x: THREE.MathUtils.lerp(authoredPlayerX, ferryX + 1.02, playerBoardBlend),
      y: THREE.MathUtils.lerp(playerGround, ferryY + 0.34, playerBoardBlend),
      z: THREE.MathUtils.lerp(0.36, ferryZ + 0.3, playerBoardBlend),
      velocity: playerBoardBlend > 0.8 ? ferryDeparture * 0.5 : state.player.vx * WorldScale,
      facing: schoolHandoffActive ? -1 : state.player.facing,
      crouching: state.player.crouching,
      carrying: state.player.carrying,
      alert: state.suspicion > 0.25,
      fear: state.suspicion,
      grounded: state.player.grounded,
      verticalVelocity: state.player.vy * WorldScale,
      lookOffset: state.suspicion > 0.18 ? Math.sin(time * 2.1) * 0.055 : 0,
      action: playerAction,
      registerBook: playerHasRegister,
      actionTime: directorActionTime ?? playerActionTime,
      actionDuration: cinematicFrame ? 1 : playerActionDuration,
      positionSnap: playerBoardBlend > 0 || motherHandoffActive,
      time,
    }, deltaTime);
    for (let index = 0; index < actors.followers.length; index += 1) {
      const actor = actors.followers[index];
      const follower = state.followers[index];
      if (!follower) {
        actor.visible = false;
        continue;
      }
      const boardThreshold = (index + 1) / 7;
      const detailedHuddleAnchor = useFerryHuddle && (index === 0 || index === 2);
      if (detailedHuddleAnchor && !actor.userData.finalLodShadowDisabled) {
        actor.traverse((object) => { if (object.isMesh) object.castShadow = false; });
        actor.userData.finalLodShadowDisabled = true;
      }
      const followerBoardBlend = THREE.MathUtils.clamp((boarding - boardThreshold) * 7.5, 0, 1);
      const ferryRow = Math.floor(index / 3);
      const ferryColumn = index % 3;
      const followerTargetX = ferryX - 0.88 + ferryColumn * 0.62 + ferryRow * 0.28;
      const followerTargetY = ferryY + 0.32 + ferryRow * 0.07;
      const followerTargetZ = ferryZ + 0.32 - ferryRow * 0.72;
      UpdateActor3D(actor, {
        x: THREE.MathUtils.lerp(follower.x * WorldScale, followerTargetX, followerBoardBlend),
        y: THREE.MathUtils.lerp(follower.y * WorldScale, followerTargetY, followerBoardBlend),
        z: THREE.MathUtils.lerp(0.2 - index * 0.035, followerTargetZ, followerBoardBlend),
        velocity: followerBoardBlend > 0.75 ? ferryDeparture * 0.5 : state.followersHolding ? 0 : (follower.vx ?? state.player.vx * 0.82) * WorldScale,
        facing: follower.facing,
        crouching: state.followersHolding || state.player.crouching,
        holding: state.followersHolding,
        alert: state.suspicion > 0.22,
        fear: Math.min(1, state.suspicion + index * 0.025),
        grounded: true,
        lookOffset: state.followersHolding ? (index % 2 ? -0.12 : 0.1) : Math.sin(time * 0.72 + index * 1.31) * 0.06,
        action: followerAction,
        actionTime: cinematicFrame
          ? Math.max(0, cinematicFrame.segmentProgress - index * Number(directorActors?.followerStagger || 0))
          : cueLive ? cueAge + index * 0.1 : state.actionProgress + index * 0.1,
        actionDuration: cinematicFrame ? 1 : Math.max(0.35, followerCue?.duration || activeAction?.seconds || 1.4),
        positionSnap: followerBoardBlend > 0,
        visible: !useFerryHuddle || detailedHuddleAnchor,
        time,
        phase: index * 0.61,
      }, deltaTime);
    }
    if (chapter.id === "ferry") {
      const signaled = state.completed.has("motherSignal");
      const motherTargetX = motherHandoffActive ? 19.22 : signaled ? 23.4 : 20.2;
      dynamic.motherX = THREE.MathUtils.lerp(dynamic.motherX ?? motherTargetX, motherTargetX, 1 - Math.exp(-(motherHandoffActive ? 8 : 0.62) * deltaTime));
      UpdateActor3D(actors.mother, {
        x: dynamic.motherX,
        y: 0,
        z: 0.08,
        velocity: motherHandoffActive ? 0 : signaled ? 0.42 : 0,
        facing: motherHandoffActive ? -1 : signaled ? 1 : -1,
        action: directorActors?.mother || (cueLive && cueState.actionId === "motherSignal" ? "signal" : null),
        registerBook: motherHasRegister,
        actionTime: directorActionTime ?? (cueLive ? cueAge : 0),
        actionDuration: cinematicFrame ? 1 : Math.max(0.35, playerCue?.duration || 1.65),
        time,
        alert: signaled,
        fear: signaled ? 0.52 : 0.12,
        grounded: true,
        lookOffset: signaled ? -0.2 : 0.08,
      }, deltaTime);
      const finaleVisible = cinematicFrame?.id === "endingDeparture";
      actors.mother.visible = !state.endingReady || finaleVisible;
      if (dynamic.signalCloth) {
        dynamic.signalCloth.visible = signaled;
        const signalWind = Number(cinematicFrame?.effects?.signalWind ?? (signaled ? 0.65 : 0));
        dynamic.signalCloth.rotation.z = -0.08 + Math.sin(time * 3.1) * (0.025 + signalWind * 0.06);
        dynamic.signalCloth.scale.x = 1 + Math.sin(time * 4.3 + 0.7) * signalWind * 0.08;
      }
      if (dynamic.motherLantern) {
        dynamic.motherLantern.visible = state.completed.has("meetMother") && (!state.endingReady || finaleVisible);
        dynamic.motherLantern.position.set(dynamic.motherX - 0.22, 0.62 + Math.sin(time * 2.1) * 0.025, 0.44);
        dynamic.motherLanternLight.intensity = signaled ? 5.2 : 3.6;
      }
    } else if (chapter.id === "school") {
      const teacherActive = Boolean(directorActors?.mother && ["schoolOpening", "registerHandoff"].includes(cinematicFrame?.id));
      actors.mother.visible = teacherActive;
      if (teacherActive) {
        const registerHandoff = cinematicFrame?.id === "registerHandoff";
        UpdateActor3D(actors.mother, {
          x: registerHandoff ? 2.48 : 2.38,
          y: 0,
          z: -0.02,
          velocity: 0,
          facing: 1,
          action: directorActors.mother,
          registerBook: motherHasRegister,
          actionTime: directorActionTime,
          actionDuration: 1,
          time,
          alert: false,
          fear: 0.08,
          grounded: true,
          lookOffset: directorActors.mother === "write" ? 0.08 : -0.1,
          positionSnap: true,
        }, deltaTime);
      }
    } else {
      actors.mother.visible = false;
    }
    for (const [requirement, object] of dynamic.requires) {
      const complete = state.completed.has(requirement);
      const effectKey = requirement === "dropBlind" ? "blindDrop" : requirement === "raiseScreen" ? "screenRaise" : "";
      const authoredProgress = effectKey ? Number(directorEffects[effectKey]) : Number.NaN;
      object.visible = complete || Number.isFinite(authoredProgress);
      if (Number.isFinite(authoredProgress)) {
        object.scale.y = Math.max(0.04, authoredProgress);
      } else if (complete && (requirement === "dropBlind" || requirement === "raiseScreen")) {
        object.scale.y = THREE.MathUtils.lerp(object.scale.y, 1, 1 - Math.exp(-3.2 * deltaTime));
      } else if (!complete && (requirement === "dropBlind" || requirement === "raiseScreen")) object.scale.y = 0.04;
    }
    for (const action of chapter.actions) {
      const cue = dynamic.actionCues.get(action.id);
      if (!cue) continue;
      const requirementsMet = (action.requires || []).every((id) => state.completed.has(id));
      const distanceToPlayer = Math.abs(state.player.x - action.x) * WorldScale;
      cue.visible = !state.completed.has(action.id) && requirementsMet && distanceToPlayer < 1.25;
      cue.position.y = GetTerrainY(chapter, action.x * WorldScale) + 0.52 + Math.sin(time * 2.2 + action.x) * 0.045;
      cue.rotation.y = time * 0.65;
    }
    if (dynamic.cart && state.cartX !== null) {
      dynamic.cart.position.x = state.cartX * WorldScale;
      dynamic.cart.rotation.z = Math.sin(state.cartX * 0.08) * 0.015;
    }
    if (dynamic.bridge) {
      const raised = state.completed.has("raiseSluice");
      const authoredBridgeRaise = Number(directorEffects.bridgeRaise);
      dynamic.bridgeRaise = Number.isFinite(authoredBridgeRaise)
        ? THREE.MathUtils.lerp(dynamic.bridgeRaise, authoredBridgeRaise, 1 - Math.exp(-4.8 * deltaTime))
        : state.mode === "paused"
          ? (raised ? 1 : 0)
          : THREE.MathUtils.lerp(dynamic.bridgeRaise, raised ? 1 : 0, 1 - Math.exp(-1.45 * deltaTime));
      dynamic.bridge.visible = raised || dynamic.bridgeRaise > 0.02;
      dynamic.bridge.position.y = THREE.MathUtils.lerp(-0.52, -0.08, dynamic.bridgeRaise);
    }
    if (dynamic.sluiceLever) dynamic.sluiceLever.rotation.z = THREE.MathUtils.lerp(dynamic.sluiceLever.rotation.z, state.completed.has("raiseSluice") ? -0.78 : 0, 1 - Math.exp(-4 * deltaTime));
    if (dynamic.emptyBoat) {
      const released = state.completed.has("releaseBoat");
      const authoredBoatRelease = Number(directorEffects.emptyBoatRelease);
      const releaseTarget = Number.isFinite(authoredBoatRelease) ? authoredBoatRelease : released ? 1 : 0;
      dynamic.emptyBoatRelease = THREE.MathUtils.lerp(dynamic.emptyBoatRelease, releaseTarget, 1 - Math.exp(-(Number.isFinite(authoredBoatRelease) ? 3.2 : 0.72) * deltaTime));
      dynamic.emptyBoat.position.x = THREE.MathUtils.lerp(11.2, 8.4 + Math.sin(time * 0.32) * 0.25, dynamic.emptyBoatRelease);
      dynamic.emptyBoat.rotation.z = Math.sin(time * 0.7) * 0.04 * dynamic.emptyBoatRelease;
    }
    if (dynamic.water) {
      dynamic.water.position.y = chapter.id === "blockade" ? -0.62 + state.waterLevel * 0.54 : -0.42;
      dynamic.water.position.z = -0.25 + Math.sin(time * 0.22) * 0.035;
      dynamic.water.rotation.z = Math.sin(time * 0.16) * 0.003;
    }
    if (dynamic.waterRipples) dynamic.waterRipples.position.y = chapter.id === "blockade" ? state.waterLevel * 0.54 : 0;
    if (dynamic.farWater) dynamic.farWater.position.y = -0.46 + Math.sin(time * 0.18) * 0.012;
    if (dynamic.smoke) {
      const authoredSmokeRetreat = Number(directorEffects.smokeRetreat);
      const showingAuthoredRetreat = Number.isFinite(authoredSmokeRetreat);
      dynamic.smoke.visible = showingAuthoredRetreat ? authoredSmokeRetreat < 0.985 : !state.completed.has("sealEastCrack");
      dynamic.smoke.position.x = (state.smokeFrontX || chapter.smoke.startX) * WorldScale + (showingAuthoredRetreat ? authoredSmokeRetreat * 5.8 : 0);
      dynamic.smoke.position.y = -0.1 + Math.sin(time * 0.45) * 0.08;
      dynamic.smoke.rotation.y = time * 0.025;
      dynamic.smoke.material.uniforms.uTime.value = time;
      dynamic.smoke.material.uniforms.uOpacity.value = showingAuthoredRetreat
        ? THREE.MathUtils.lerp(0.13, 0.018, authoredSmokeRetreat)
        : state.completed.has("openWellVent") ? 0.075 : 0.13;
    }
    if (chapter.id === "tunnel" && dynamic.shaftLights.length) {
      const authoredVentOpening = Number(directorEffects.ventOpening);
      const ventOpen = Number.isFinite(authoredVentOpening) ? authoredVentOpening : state.completed.has("openWellVent") ? 1 : 0.18;
      dynamic.shaftLights[0].intensity = THREE.MathUtils.lerp(3.6, 20, ventOpen);
      const firstShaft = dynamic.shaftVolumes[0];
      if (firstShaft) {
        const openingWidth = THREE.MathUtils.lerp(0.32, 1, ventOpen);
        const openingHeight = THREE.MathUtils.lerp(0.52, 1, ventOpen);
        firstShaft.volume.scale.set(openingWidth, openingHeight, openingWidth);
        firstShaft.pool.scale.set(1.2 * openingWidth, 0.56 * openingWidth, 1);
      }
    }
    const trimOpeningActors = cinematicFrame?.id === "schoolOpening";
    for (const actor of [actors.player, actors.mother]) {
      for (const optionalMesh of actor.userData.lodOptional || []) optionalMesh.visible = !trimOpeningActors;
    }
    if (dynamic.foregroundRocks) {
      dynamic.foregroundRocks.visible = !cinematicFrame?.camera || Number(cinematicFrame.camera.viewDistance || 99) >= 11;
    }
    const reedShader = materials.reedSway.userData.shader;
    if (reedShader) {
      reedShader.uniforms.uTime.value = time;
      reedShader.uniforms.uWind.value = 0.32 + windStrength * 0.92;
    }
    const waterShader = materials.water.userData.shader;
    if (waterShader) waterShader.uniforms.uTime.value = time;
    if (materials.water.bumpMap) {
      materials.water.bumpMap.offset.x = (time * 0.006) % 1;
      materials.water.bumpMap.offset.y = (time * -0.0035) % 1;
    }
  }

  function Dispose() {
    root.traverse((object) => {
      if ((object.isMesh || object.isPoints) && !object.userData.actorMesh && !object.userData.blenderAssetMesh) object.geometry?.dispose?.();
    });
    DisposeActor3D(actors.player);
    DisposeActor3D(actors.mother);
    actors.followers.forEach(DisposeActor3D);
    for (const material of new Set(dynamic.ownedMaterials)) material.dispose?.();
    for (const texture of new Set(dynamic.ownedTextures)) texture.dispose?.();
    for (const geometry of new Set(dynamic.ownedGeometries)) geometry.dispose?.();
  }

  return { root, profile, materials, dynamic, actors, Update, Dispose };
}
