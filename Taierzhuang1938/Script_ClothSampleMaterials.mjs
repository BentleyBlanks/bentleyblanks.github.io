// Private, deterministic PBR textures for the laboratory's additional fabric samples.
// No source GLB texture is reused. Each factory call owns three textures shared only
// by its front/back/binding materials; Dispose releases that entire set exactly once.
import * as THREE from 'three';

const Size = 512;
const Tau = Math.PI * 2;
const Recipe = '20261025ClothSamplesV1';
// These describe textile appearance, not the laboratory's separate physics presets.
const Fabrics = Object.freeze({
  muslin: { seed: 31415, color: [218, 211, 190], tileM: .12, yarns: 128,
    roughness: .91, normalScale: .46, specular: .22, sheen: .42, sheenColor: 0xd8d0bc, sheenRoughness: .88 },
  silk: { seed: 27182, color: [111, 28, 45], tileM: .12, yarns: 192,
    roughness: .28, normalScale: .30, specular: .52, sheen: .70, sheenColor: 0xb75c71, sheenRoughness: .32,
    anisotropy: .70, anisotropyRotation: Math.PI / 2 },
  canvas: { seed: 16180, color: [135, 126, 83], tileM: .18, yarns: 64,
    roughness: .96, normalScale: .88, specular: .18, sheen: .22, sheenColor: 0xa79e76, sheenRoughness: .92 },
  wool: { seed: 14142, color: [131, 94, 67], tileM: .18, yarns: 96,
    roughness: 1, normalScale: .68, specular: .16, sheen: .80, sheenColor: 0xb28b68, sheenRoughness: 1 },
});

function Clamp(value, low = 0, high = 1) { return Math.max(low, Math.min(high, value)); }
function Byte(value) { return Math.round(Clamp(value, 0, 255)); }
function Hash(x, y, seed) {
  let value = Math.imul(x ^ seed, 374761393) ^ Math.imul(y + seed, 668265263);
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967295;
}
function SmoothNoise(u, v, cells, seed) {
  const x = u * cells, y = v * cells, ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const a = Hash(ix % cells, iy % cells, seed), b = Hash((ix + 1) % cells, iy % cells, seed);
  const c = Hash(ix % cells, (iy + 1) % cells, seed), d = Hash((ix + 1) % cells, (iy + 1) % cells, seed);
  return (a + (b - a) * sx) * (1 - sy) + (c + (d - c) * sx) * sy;
}

function BakeFabric(kind, fabric) {
  const base = new Uint8Array(Size * Size * 4), normal = new Uint8Array(base.length), roughness = new Uint8Array(base.length);
  const heights = new Float32Array(Size * Size);
  for (let y = 0; y < Size; y++) for (let x = 0; x < Size; x++) {
    const i = y * Size + x, o = i * 4, u = x / Size, v = y / Size;
    const grain = Hash(x, y, fabric.seed) - .5;
    const broad = SmoothNoise(u, v, 8, fabric.seed + 1) - .5;
    const warpPhase = Tau * u * fabric.yarns, weftPhase = Tau * v * fabric.yarns;
    const warp = .5 + .5 * Math.cos(warpPhase), weft = .5 + .5 * Math.cos(weftPhase);
    const over = .5 + .5 * Math.sin(warpPhase * .5) * Math.sin(weftPhase * .5);
    let height, light, rough;
    if (kind === 'muslin') {
      // Small, rounded alternating over/under cotton yarns, with quiet colour variation.
      height = .42 * (warp * (.35 + .65 * over) + weft * (1 - .65 * over)) + grain * .016;
      light = (warp + weft - 1) * 3 + broad * 5 + grain * 2;
      rough = .96 + grain * .035 - (warp + weft - 1) * .018;
    } else if (kind === 'silk') {
      // Low relief with a strong warp direction. The standard physical material's
      // anisotropy supplies directional satin highlights; no custom shader is used.
      height = .070 * Math.cos(warpPhase) + .016 * Math.cos(Tau * v * 64) + grain * .004;
      light = 2.4 * Math.cos(warpPhase) + broad * 3 + grain;
      rough = .96 + .025 * Math.cos(warpPhase) + grain * .012;
    } else if (kind === 'canvas') {
      // Thicker, tightly interlaced warp/weft bundles and a little yarn twist.
      const weave = warp * (.25 + .75 * over) + weft * (1 - .75 * over);
      height = .76 * weave + .035 * Math.sin(Tau * (u * 256 + v * 4)) + grain * .028;
      light = (weave - .75) * 12 + broad * 7 + grain * 3;
      rough = .95 + grain * .045 - (weave - .75) * .035;
    } else {
      // Dense short fibres and irregular fine tufts, not embossed leather islands.
      // The high, broad sheen approximates the pile without transparent fibre cards.
      const tuft = SmoothNoise(u, v, 64, fabric.seed + 2) - .5;
      const fibre = Math.sin(Tau * (u * 173 + v * 13)) * Math.sin(Tau * (u * 11 - v * 71));
      height = tuft * .36 + grain * .12 + fibre * .055 + .025 * (warp + weft - 1);
      light = tuft * 8 + grain * 5 + fibre * 2 + broad * 3;
      rough = .985 + grain * .02 + tuft * .015;
    }
    heights[i] = height;
    base[o] = Byte(fabric.color[0] + light); base[o + 1] = Byte(fabric.color[1] + light);
    base[o + 2] = Byte(fabric.color[2] + light); base[o + 3] = 255;
    const roughByte = Byte(Clamp(rough) * 255);
    // MeshPhysicalMaterial samples G for roughness. Neutral R/B also make the
    // owned texture directly inspectable without a separate display conversion.
    roughness[o] = roughByte; roughness[o + 1] = roughByte; roughness[o + 2] = roughByte; roughness[o + 3] = 255;
  }
  // Wrapped central differences keep both the woven height field and its normals
  // seamless. DataTexture rows follow +V, so both tangent derivatives are negated.
  for (let y = 0; y < Size; y++) for (let x = 0; x < Size; x++) {
    const o = (y * Size + x) * 4;
    const dx = (heights[y * Size + (x + 1) % Size] - heights[y * Size + (x + Size - 1) % Size]) * .5;
    const dy = (heights[((y + 1) % Size) * Size + x] - heights[((y + Size - 1) % Size) * Size + x]) * .5;
    const inverse = 1 / Math.hypot(dx, dy, 1);
    normal[o] = Byte((-.5 * dx * inverse + .5) * 255);
    normal[o + 1] = Byte((-.5 * dy * inverse + .5) * 255);
    normal[o + 2] = Byte((.5 * inverse + .5) * 255); normal[o + 3] = 255;
  }
  return { base, normal, roughness };
}

function MakeTexture(kind, channel, pixels, fabric) {
  const texture = new THREE.DataTexture(pixels, Size, Size, THREE.RGBAFormat, THREE.UnsignedByteType);
  texture.name = `ClothLab_${kind}${channel[0].toUpperCase()}${channel.slice(1)}`;
  texture.colorSpace = channel === 'base' ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  // The shared neutral banner shell is 1.45 x 1.75 m. Its side strip is already
  // metre-scaled against these axes, so the binding keeps the same yarn spacing.
  texture.repeat.set(1.45 / fabric.tileM, 1.75 / fabric.tileM);
  texture.generateMipmaps = true; texture.minFilter = THREE.LinearMipmapLinearFilter; texture.magFilter = THREE.LinearFilter;
  texture.anisotropy = 4;
  texture.userData = { clothSampleKind: kind, clothSampleChannel: channel, textureRecipe: Recipe, tileSizeM: fabric.tileM };
  texture.needsUpdate = true;
  return texture;
}

/** Build three opaque physical materials; the caller owns and disposes this bundle. */
export function CreateClothSampleMaterials(kind, { wireframe = false } = {}) {
  const fabric = Object.hasOwn(Fabrics, kind) ? Fabrics[kind] : null;
  if (!fabric) throw new RangeError(`Unknown cloth sample material: ${String(kind)}`);
  const pixels = BakeFabric(kind, fabric);
  const textures = Object.fromEntries(Object.entries(pixels).map(([channel, bytes]) => [channel, MakeTexture(kind, channel, bytes, fabric)]));
  const materials = ['Front', 'Back', 'Binding'].map((side, index) => {
    const shade = index === 0 ? 1 : index === 1 ? .94 : .82;
    const material = new THREE.MeshPhysicalMaterial({
      name: `ClothLab_${kind}${side}`, color: new THREE.Color(shade, shade, shade),
      map: textures.base, normalMap: textures.normal, roughnessMap: textures.roughness,
      normalScale: new THREE.Vector2(fabric.normalScale, fabric.normalScale),
      roughness: fabric.roughness, metalness: 0, specularIntensity: fabric.specular,
      sheen: fabric.sheen, sheenColor: fabric.sheenColor, sheenRoughness: fabric.sheenRoughness,
      anisotropy: fabric.anisotropy || 0, anisotropyRotation: fabric.anisotropyRotation || 0,
      clearcoat: 0, transmission: 0, side: THREE.DoubleSide, transparent: false, opacity: 1, wireframe: !!wireframe,
    });
    material.userData = { clothSampleKind: kind, clothSampleSide: side.toLowerCase(), textureRecipe: Recipe, procedural: true };
    return material;
  });
  let disposed = false;
  return {
    materials,
    Dispose() {
      if (disposed) return;
      disposed = true;
      for (const material of materials) material.dispose();
      for (const texture of Object.values(textures)) texture.dispose();
    },
  };
}
