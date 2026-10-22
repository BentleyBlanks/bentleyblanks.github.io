import * as THREE from 'three';

// The existing groom stores roots at glTF V=0. The texture's first image row
// contains those roots, so it must use glTF's unflipped image convention.
// This is a two-lobe, strand-tangent approximation, not a full Marschner solver.
// Reference: Epic, Photorealistic Character (Hair Textures / Tangent / Edge Mask).
// https://dev.epicgames.com/documentation/en-us/unreal-engine/photorealistic-character?application_version=4.27
export const PORTRAIT_HAIR_VERSION = 'ear051-portrait-20261022';

const preparedTextures = new WeakMap();

function HairTexture(texture) {
  if (!texture) return null;
  if (!preparedTextures.has(texture)) {
    const copy = texture.clone();
    copy.name = 'Texture_PortraitHairRootToTip';
    copy.flipY = false;
    copy.colorSpace = THREE.SRGBColorSpace;
    copy.wrapS = copy.wrapT = THREE.ClampToEdgeWrapping;
    copy.needsUpdate = true;
    preparedTextures.set(texture, copy);
  }
  return preparedTextures.get(texture);
}

function PrepareHairGeometry(geometry, kind) {
  const previous = geometry.userData.portraitHair;
  if (previous?.version === PORTRAIT_HAIR_VERSION && previous.kind === kind) return previous;
  const position = geometry.getAttribute('position'), uv = geometry.getAttribute('uv');
  if (!position || !uv) throw new Error('Portrait hair needs positions and the authored root-to-tip UVs.');
  const count = position.count, index = geometry.index;
  const parents = Int32Array.from({length: count}, (_, i) => i);
  const tangents = new Float32Array(count * 3), data = new Float32Array(count * 2);
  function Find(i) {
    while (parents[i] !== i) { parents[i] = parents[parents[i]]; i = parents[i]; }
    return i;
  }
  const p0 = new THREE.Vector3(), p1 = new THREE.Vector3(), p2 = new THREE.Vector3();
  const e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), tangent = new THREE.Vector3();
  const cross = new THREE.Vector3(), normal = new THREE.Vector3();
  let degenerateUvs = 0;
  for (let i = 0; i < (index?.count ?? count); i += 3) {
    const ids = [0, 1, 2].map(k => index ? index.getX(i + k) : i + k);
    parents[Find(ids[1])] = Find(ids[0]); parents[Find(ids[2])] = Find(ids[0]);
    p0.fromBufferAttribute(position, ids[0]); p1.fromBufferAttribute(position, ids[1]); p2.fromBufferAttribute(position, ids[2]);
    e1.subVectors(p1, p0); e2.subVectors(p2, p0);
    const u1 = uv.getX(ids[1]) - uv.getX(ids[0]), v1 = uv.getY(ids[1]) - uv.getY(ids[0]);
    const u2 = uv.getX(ids[2]) - uv.getX(ids[0]), v2 = uv.getY(ids[2]) - uv.getY(ids[0]);
    const determinant = u1 * v2 - u2 * v1;
    if (Math.abs(determinant) < 1e-10) { degenerateUvs++; continue; }
    // Area-weighted dP/dV provides a continuous, geometry-derived fallback at
    // nearly edge-on pixels, where screen-space UV derivatives become unstable.
    tangent.copy(e2).multiplyScalar(u1).addScaledVector(e1, -u2).divideScalar(determinant);
    if (tangent.lengthSq() < 1e-16) continue;
    tangent.normalize().multiplyScalar(cross.crossVectors(e1, e2).length());
    for (const id of ids) {
      tangents[id * 3] += tangent.x; tangents[id * 3 + 1] += tangent.y; tangents[id * 3 + 2] += tangent.z;
    }
  }
  const components = new Map();
  for (let i = 0; i < count; i++) {
    const root = Find(i); if (!components.has(root)) components.set(root, components.size);
  }
  const normals = geometry.getAttribute('normal');
  const authoredDepth = geometry.getAttribute('groomDepth') || geometry.getAttribute('_groomdepth') || geometry.getAttribute('_GROOMDEPTH');
  for (let i = 0; i < count; i++) {
    const component = components.get(Find(i));
    // An optional authoring attribute describes actual height in the groom.
    // Component order is deliberately not interpreted as a physical layer.
    const depth = kind === 'scalp' ? .16 : kind === 'wisps' ? 1 : authoredDepth ? THREE.MathUtils.clamp(authoredDepth.getX(i), 0, 1) : .78;
    // Decorrelate consecutive cards without randomness or animation.
    data[i * 2] = (Math.sin((component + 1) * 127.1) * 43758.5453) % 1;
    if (data[i * 2] < 0) data[i * 2] += 1;
    data[i * 2 + 1] = depth;
    tangent.fromArray(tangents, i * 3);
    if (normals) {
      normal.fromBufferAttribute(normals, i).normalize();
      tangent.addScaledVector(normal, -tangent.dot(normal));
    }
    if (tangent.lengthSq() < 1e-12) {
      tangent.set(0, -1, 0);
      if (normals && Math.abs(normal.y) > .96) tangent.set(1, 0, 0);
      if (normals) tangent.addScaledVector(normal, -tangent.dot(normal));
    }
    tangent.normalize().toArray(tangents, i * 3);
  }
  geometry.setAttribute('portraitHairTangent', new THREE.BufferAttribute(tangents, 3));
  geometry.setAttribute('portraitHairData', new THREE.BufferAttribute(data, 2));
  return geometry.userData.portraitHair = {version: PORTRAIT_HAIR_VERSION, kind, components: components.size, vertices: count, degenerateUvs, depthSource: authoredDepth ? 'authoredGroomDepth' : kind === 'cards' ? 'neutralCardDepth' : kind, geometryChanged: false};
}

const vertexDeclarations = `
attribute vec3 portraitHairTangent;
attribute vec2 portraitHairData;
varying vec2 vPortraitHairUv;
varying vec2 vPortraitHairData;
varying vec3 vPortraitHairTangent;
`;

const fragmentDeclarations = `
varying vec2 vPortraitHairUv;
varying vec2 vPortraitHairData;
varying vec3 vPortraitHairTangent;
float portraitHairSignal = 0.0;
float portraitHairVisibility = 1.0;
float portraitHairDepth = 1.0;
vec3 portraitHairDirection = vec3(0.0, 1.0, 0.0);
float PortraitHairStrand(vec2 uv) {
  float coordinate = uv.x * 72.0 + vPortraitHairData.x * 19.0
    + sin(uv.y * 6.0 + vPortraitHairData.x * 12.0) * .16;
  float resolved = 1.0 - smoothstep(.2, .65, fwidth(coordinate));
  return sin(coordinate * 6.2831853) * resolved;
}
float PortraitHairCoverage(vec2 uv, float textureAlpha) {
  #ifdef PORTRAIT_HAIR_SCALP
    return 1.0;
  #elif defined(PORTRAIT_HAIR_WISPS)
    // These ribbons are already a single subpixel hair wide. MSAA rounds off
    // their geometric coverage; multiplying a second across-card alpha profile
    // would turn continuous fine hair into isolated low-coverage dots.
    return 1.0 - smoothstep(.79, .87, uv.y);
  #else
    float root = mix(.74, 1.0, smoothstep(0.0, .045, uv.y));
    // The authored alpha already contains individual, irregular tapered tips.
    // Adding another broad V fade would chop whole cards into a comb edge.
    return textureAlpha * root;
  #endif
}
`;

function HairMapFragment(shadow = false) {
  return `
vec2 hairUv = vPortraitHairUv;
float hairTextureAlpha = 1.0;
#ifdef USE_MAP
  #ifdef PORTRAIT_HAIR_WISPS
    vec2 hairColorUv = vec2(.16 + vPortraitHairData.x * .64, hairUv.y);
  #else
    vec2 hairColorUv = vec2(.12 + vPortraitHairData.x * .56 + hairUv.x * .10, hairUv.y);
  #endif
  vec4 hairSample = texture2D(map, hairColorUv);
  hairTextureAlpha = texture2D(map, hairUv).a;
  ${shadow ? '' : `
  // Retain the real strand texture while compressing baked brightness and
  // removing its orange cast. This changes reflectance, never emitted light.
  float hairLuma = max(dot(hairSample.rgb, vec3(.2126, .7152, .0722)), .0001);
  float hairReflectance = clamp(.007 + .62 * pow(hairLuma, .84), .009, .085);
  vec3 hairAlbedo = mix(vec3(hairLuma), hairSample.rgb, .18) * hairReflectance / hairLuma;
  // The source contains bright fine filaments and dark inter-strand gaps.
  // Let that real coverage break up the lobe instead of lighting the entire
  // width of a card with a uniform, painted-looking stripe.
  portraitHairVisibility = mix(.16, 1.0, smoothstep(.004, .048, hairLuma));
  portraitHairSignal = PortraitHairStrand(hairUv) * .45
    + clamp(log2(hairLuma / .015) * .3, -.65, .65);
  portraitHairDepth = vPortraitHairData.y;
  float rootToTip = smoothstep(.02, .93, hairUv.y);
  float strandVariation = mix(.9, 1.08, vPortraitHairData.x) * (1.0 + portraitHairSignal * .035);
  float rootDepth = mix(.77, 1.05, rootToTip) * mix(.78, 1.0, portraitHairDepth);
  diffuseColor.rgb *= hairAlbedo * rootDepth * strandVariation;
  `}
#else
  ${shadow ? '' : 'diffuseColor.rgb *= vec3(.018, .017, .016); portraitHairDepth = vPortraitHairData.y;'}
#endif
diffuseColor.a *= PortraitHairCoverage(hairUv, hairTextureAlpha);
${shadow ? '' : `
#if !defined(PORTRAIT_HAIR_SCALP) && !defined(PORTRAIT_HAIR_WISPS)
  float hairFacing = abs(dot(normalize(vNormal), normalize(vViewPosition)));
  diffuseColor.a *= smoothstep(.025, .23, hairFacing);
#endif
`}
`;
}

const hairFrame = `
// Solve the actual screen-space dP/dV, not the card's U tangent. A bounded
// blend with the smooth vertex derivative removes triangle-scale jumps without
// inventing a fixed world direction or dividing by a nearly zero UV determinant.
vec3 hairDpDx = dFdx(-vViewPosition), hairDpDy = dFdy(-vViewPosition);
vec2 hairUvDx = dFdx(vPortraitHairUv), hairUvDy = dFdy(vPortraitHairUv);
float hairDet = hairUvDx.x * hairUvDy.y - hairUvDx.y * hairUvDy.x;
vec3 hairDerivative = hairDpDy * hairUvDx.x - hairDpDx * hairUvDy.x;
hairDerivative *= hairDet < 0.0 ? -1.0 : 1.0;
hairDerivative -= normal * dot(normal, hairDerivative);
vec3 hairSmooth = vPortraitHairTangent - normal * dot(normal, vPortraitHairTangent);
hairSmooth *= inversesqrt(max(dot(hairSmooth, hairSmooth), 1e-12));
float hairDerivativeLength = dot(hairDerivative, hairDerivative);
hairDerivative *= inversesqrt(max(hairDerivativeLength, 1e-12));
float hairAgreement = smoothstep(.35, .9, dot(hairSmooth, hairDerivative));
float hairReliable = smoothstep(1e-15, 1e-11, abs(hairDet)) * step(1e-14, hairDerivativeLength);
portraitHairDirection = -normalize(mix(hairSmooth, hairDerivative, .32 * hairReliable * hairAgreement));
`;

const hairLighting = `
uniform float portraitHairSpecularStrength;
uniform float portraitHairScatterStrength;
float PortraitHairLobe(vec3 strand, vec3 normal, vec3 halfDirection, float shift, float width) {
  vec3 shifted = normalize(strand + normal * shift);
  float longitudinal = dot(shifted, halfDirection);
  // A normalized longitudinal Gaussian is bounded even for very narrow cards.
  return exp(-.5 * longitudinal * longitudinal / (width * width)) / (2.5066283 * width);
}
void RE_Direct_PortraitHair(const in IncidentLight directLight, const in vec3 geometryPosition,
  const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal,
  const in PhysicalMaterial material, inout ReflectedLight reflectedLight) {
  vec3 lightDirection = directLight.direction;
  vec3 sumDirection = lightDirection + geometryViewDir;
  vec3 halfDirection = sumDirection * inversesqrt(max(dot(sumDirection, sumDirection), 1e-8));
  float dotNL = dot(geometryNormal, lightDirection);
  float strandLight = dot(portraitHairDirection, lightDirection);
  float cylinderLight = sqrt(max(0.0, 1.0 - strandLight * strandLight));
  float depth = mix(.48, 1.0, portraitHairDepth);
  float cuticle = (vPortraitHairData.x - .5) * .035 + portraitHairSignal * .014;
  float width = mix(.17, .135, portraitHairDepth) + material.roughness * .065;
  float primary = PortraitHairLobe(portraitHairDirection, geometryNormal, halfDirection, -.075 + cuticle, width);
  float secondary = PortraitHairLobe(portraitHairDirection, geometryNormal, halfDirection, .14 + cuticle, width * 1.75);
  vec3 fresnel = F_Schlick(material.specularColor, .6, saturate(dot(geometryViewDir, halfDirection)));
  vec3 secondaryTint = mix(vec3(.6), sqrt(max(material.diffuseColor, vec3(0.0))), .38);
  vec3 lobes = fresnel * (primary * .68 + secondary * .32 * secondaryTint);
  // Projected strand area and a soft card-facing term stop back-facing sheets
  // receiving the same reflection as their visible surface. Never add energy
  // after Three's shadow/spot/distance attenuation in directLight.color.
  float projectedArea = cylinderLight * mix(.28, 1.0, saturate(dotNL));
  vec3 specularResponse = min(lobes, vec3(.24)) * projectedArea * depth
    * portraitHairVisibility * .76 * portraitHairSpecularStrength;
  float diffuseResponse = mix(saturate(dotNL), cylinderLight * .5, .28);
  float thinScatter = pow(saturate(-dot(lightDirection, geometryViewDir)), 4.0)
    * cylinderLight * smoothstep(.25, 1.0, portraitHairDepth) * .075 * portraitHairScatterStrength;
  reflectedLight.directSpecular += directLight.color * specularResponse;
  reflectedLight.directDiffuse += directLight.color * BRDF_Lambert(material.diffuseContribution)
    * (diffuseResponse * .88 + thinScatter);
}
#undef RE_Direct
#define RE_Direct RE_Direct_PortraitHair
`;

function InstallHairShader(material, kind, shadow = false) {
  const defines = kind === 'scalp' ? '#define PORTRAIT_HAIR_SCALP\n' : kind === 'wisps' ? '#define PORTRAIT_HAIR_WISPS\n' : '';
  const uniforms = {specularStrength: {value: 1}, scatterStrength: {value: 1}};
  material.userData.portraitHairUniforms = uniforms;
  material.onBeforeCompile = shader => {
    shader.vertexShader = vertexDeclarations + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      vPortraitHairUv = uv;
      vPortraitHairData = portraitHairData;
      vPortraitHairTangent = mat3(modelViewMatrix) * portraitHairTangent;`);
    shader.fragmentShader = defines + fragmentDeclarations + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', HairMapFragment(shadow));
    if (!shadow && kind !== 'scalp') {
      shader.uniforms.portraitHairSpecularStrength = uniforms.specularStrength;
      shader.uniforms.portraitHairScatterStrength = uniforms.scatterStrength;
      shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n' + hairFrame);
      shader.fragmentShader = shader.fragmentShader.replace('#include <lights_physical_pars_fragment>', '#include <lights_physical_pars_fragment>\n' + hairLighting);
      // Environment reflection remains real PMREM lighting; keep the diffuse
      // environment and reduce the isotropic surface reflection of flat cards.
      shader.fragmentShader = shader.fragmentShader.replace('#include <lights_fragment_end>', '#include <lights_fragment_end>\nreflectedLight.indirectSpecular *= .42;');
    }
    material.userData.portraitHairCompiled = true;
  };
  material.customProgramCacheKey = () => `${PORTRAIT_HAIR_VERSION}:${kind}:${shadow ? 'shadow' : 'surface'}:4`;
}

/** Bind the existing scalp, alpha cards or wisps without moving any vertices.
 * kind: 'scalp' | 'cards' | 'wisps'. All are depth-writing masked materials.
 * Returns the assigned material; uniforms and a read-only probe are available
 * for isolated light-response validation in the existing debug scene.
 */
export function ApplyPortraitHair(mesh, {texture, kind = 'cards'} = {}) {
  if (!['scalp', 'cards', 'wisps'].includes(kind)) throw new Error(`Unknown portrait hair kind: ${kind}`);
  const geometryInfo = PrepareHairGeometry(mesh.geometry, kind);
  const map = HairTexture(texture), scalp = kind === 'scalp';
  const material = new THREE.MeshPhysicalMaterial({
    name: `Material_PortraitHair_${kind}`, map, color: 0xffffff,
    roughness: scalp ? 1 : kind === 'wisps' ? .46 : .43,
    metalness: 0, ior: 1.55, specularIntensity: scalp ? .12 : .82,
    anisotropy: 0, sheen: 0, clearcoat: 0,
    side: THREE.DoubleSide, shadowSide: THREE.DoubleSide,
    transparent: false, alphaTest: scalp ? 0 : .18,
    alphaToCoverage: !scalp, depthWrite: true, depthTest: true,
  });
  InstallHairShader(material, kind);
  material.userData.portraitHair = {...geometryInfo, tangent: 'screenUvDerivativeWithSmoothGeometryFallback', lobes: scalp ? 0 : 2, rootAtV: 0};
  mesh.material = material;
  mesh.castShadow = mesh.receiveShadow = true;
  if (!scalp) {
    // Match root, strand and tip coverage in both kinds of shadow maps. The
    // view-dependent edge fade is intentionally absent from the light's pass.
    mesh.customDepthMaterial = new THREE.MeshDepthMaterial({depthPacking: THREE.RGBADepthPacking, map, alphaTest: .18, side: THREE.DoubleSide});
    mesh.customDistanceMaterial = new THREE.MeshDistanceMaterial({map, alphaTest: .18, side: THREE.DoubleSide});
    InstallHairShader(mesh.customDepthMaterial, kind, true);
    InstallHairShader(mesh.customDistanceMaterial, kind, true);
  }
  mesh.userData.hairLayer = scalp ? 'opaqueScalp' : kind === 'wisps' ? 'silhouetteStrands' : 'regionalTexturedCards';
  return material;
}

export function PortraitHairProbe(mesh) {
  const material = mesh?.material, info = material?.userData.portraitHair;
  if (!info) return null;
  return {
    ...info, compiled: material.userData.portraitHairCompiled === true,
    roughness: material.roughness, anisotropy: material.anisotropy,
    alphaTest: material.alphaTest, alphaToCoverage: material.alphaToCoverage,
    depthWrite: material.depthWrite, transparent: material.transparent,
    textureFlipY: material.map?.flipY, emissive: material.emissive.toArray(),
    matchingShadowCoverage: info.kind === 'scalp' || !!(mesh.customDepthMaterial && mesh.customDistanceMaterial),
  };
}
