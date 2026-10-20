// 白盒关卡编辑器的远景层（docs/Data_EditorBlockout.md §2.2 backdrop / §6.3，2026-10-20）。
//
// 场景文件写了 backdrop 的关卡（01–05 坑北第三版：场地外的田、路、四个村子、东边低山），这里把它画出来：只看不走——
// 不进 battlefield（不碰撞、不进寻路、不进 colliders），玩家能走的范围（bounds）不变；相机远平面由 Script_EditorBlockoutLevels
// 的 ApplyLayout 拉到 backdrop.far。没写 backdrop 的关卡这里什么都不建。
//
//   · 远景地面：围着场地一圈圈往外的环形网格（最里一圈在场地边里 1.5 m、比场地低 skirtDropM，垫在场地底下；第二圈正好在场地边上、
//     高度 = 场地网格在边上的高），往外按 BackdropGroundSampler 从场地边的高过渡到 ground.y、顶点色从场地的高度色带过渡到 ground.color。
//     backdrop.paint（田块 rects、路、村里的地）在 JS 里画成一张图（Script_EditorBlockoutLevels.RasterizeBackdropPaint），着色器按世界 (x, z)
//     取图、按覆盖度盖在顶点色上；再叠编辑器同一套米格线（场地地面那套，远了自己淡掉），接缝两边颜色、高度、格线都接得上。
//   · 体块：box（房墙 / 屋顶 / 院墙）、blob（树冠团，低多边形椭球）、hill（低山包，极坐标网格，顶点色从 color 到 topColor）各合成一个网格；
//     tree 不在这里画，交给 Script_EditorBlockoutTrees（同场地里的树一个 InstancedMesh）。
//   · 远处变淡：所有远景材质在出色之后按离相机的距离往 haze.color 混（smoothstep(fromM, toM) × max），场地本身不混；
//     fromM 取得比场地边到常用机位的距离远，接缝上是 0。
// 网格都标 userData.whiteboxTerrain：白盒画质（保留地形贴图）原样画，不刷成灰网格。
// ===========================================================================
import * as THREE from "three";
import { BlockoutTintColor, BackdropBlend, RasterizeBackdropPaint, BLOCKOUT_BACKDROP_TEXTURE } from "./Script_EditorBlockoutLevels.mjs";
import { ApplyPatches, MakePatch } from "./Script_MaterialPatches.mjs";

export const BLOCKOUT_BACKDROP_VIEW = Object.freeze({
  /** 环形网格：每圈离场地边的距离（米，负 = 场地里面垫底的那一圈），最外一圈 = ground.radiusM。 */
  rings: Object.freeze([-1.5, 0, 1, 3, 6, 10, 16, 25, 40, 60, 90, 130, 180, 250, 350, 500, 700, 1000, 1400, 2000, 2800, 4000]),
  /** 环上顶点沿场地边的间距（米）。 */
  edgeStepM: 2,
  /** 垫底那一圈比场地低多少（米）：场地边上万一有缝，透出来的是远景地面不是天。 */
  skirtDropM: 0.4,
  /** 接缝那一圈比场地网格低一点点（米），两张面重合时让场地赢。 */
  seamDropM: 0.01,
  blob: Object.freeze({ seg: 8, rings: 5 }),
  hill: Object.freeze({ rings: 12, seg: 36, sinkM: 0.6 }),
  /** 远景地面贴图的各向异性过滤上限。 */
  anisotropy: 8,
});

const SRGB = (hex, out = new THREE.Color()) => out.set(hex);   // THREE.Color.set("#rrggbb") 按 sRGB 解，存线性

function HazeUniforms(haze) {
  const color = new THREE.Color(haze?.color || "#adb8c2");
  return {
    uBdHazeColor: { value: color },
    // x = fromM、y = toM、z = max（没写 haze = 不混）
    uBdHaze: { value: new THREE.Vector3(haze ? haze.fromM : 1e9, haze ? haze.toM : 2e9, haze ? haze.max : 0) },
  };
}

function MakeBackdropPatch(uniforms, textured) {
  return MakePatch({
    key: textured ? "blockoutBackdropGround1" : "blockoutBackdropHaze1",
    uniforms: (u) => Object.assign(u, uniforms),
    vertex: [
      ["#include <common>", "varying vec3 vBdWorld;"],
      ["#include <project_vertex>", "vBdWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;"],
    ],
    fragment: [
      ["#include <common>", `
        varying vec3 vBdWorld;
        uniform vec3 uBdHazeColor;
        uniform vec3 uBdHaze;
        ${textured ? "uniform sampler2D uBdPaint;\n        uniform vec4 uBdRect;" : ""}
      `],
      ...(textured ? [["#include <color_fragment>", `
        vec4 bdPaint = texture2D(uBdPaint, (vBdWorld.xz - uBdRect.xy) * uBdRect.zw);
        diffuseColor.rgb = mix(diffuseColor.rgb, bdPaint.rgb, bdPaint.a);
      `]] : []),
      ["#include <opaque_fragment>", `
        float bdHaze = uBdHaze.z * smoothstep(uBdHaze.x, uBdHaze.y, distance(vBdWorld, cameraPosition));
        gl_FragColor.rgb = mix(gl_FragColor.rgb, uBdHazeColor, bdHaze);
      `],
    ],
  });
}

/** 环上第 i 个点（共 2·(nx + nz) 个，从西北角顺着北、东、南、西四条边走一圈）。o = 离场地边多远。 */
function RingPoint(b, o, nx, nz, i, out) {
  const x0 = b.minX - o, x1 = b.maxX + o, z0 = b.minZ - o, z1 = b.maxZ + o;
  if (i < nx) { out.x = x0 + (x1 - x0) * i / nx; out.z = z0; return out; }
  i -= nx;
  if (i < nz) { out.x = x1; out.z = z0 + (z1 - z0) * i / nz; return out; }
  i -= nz;
  if (i < nx) { out.x = x1 - (x1 - x0) * i / nx; out.z = z1; return out; }
  i -= nx;
  out.x = x0; out.z = z1 - (z1 - z0) * i / nz; return out;
}

/** 远景地面网格（场地边往外一圈圈）：position / normal / color（线性）。 */
export function BuildBackdropGroundGeometry(layout) {
  const V = BLOCKOUT_BACKDROP_VIEW, bd = layout.backdrop, b = layout.bounds;
  const sampler = layout.terrainSampler, groundAt = layout.backdropGroundAt;
  const tint = layout.heightTint || { lo: -4, hi: 6 };
  const rings = [...V.rings.filter((o) => o < bd.ground.radiusM), bd.ground.radiusM];
  const nx = Math.max(1, Math.ceil((b.maxX - b.minX) / V.edgeStepM)), nz = Math.max(1, Math.ceil((b.maxZ - b.minZ) / V.edgeStepM));
  const N = 2 * (nx + nz);
  const positions = new Float32Array(rings.length * N * 3), colors = new Float32Array(rings.length * N * 3);
  const p = { x: 0, z: 0 }, rgb = [0, 0, 0], c = new THREE.Color();
  const hex = parseInt(bd.ground.color.slice(1), 16), farRgb = [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];   // sRGB
  let v = 0;
  for (const o of rings) {
    for (let i = 0; i < N; i++, v++) {
      RingPoint(b, o, nx, nz, i, p);
      const cx = Math.max(b.minX, Math.min(b.maxX, p.x)), cz = Math.max(b.minZ, Math.min(b.maxZ, p.z));
      const edge = sampler(cx, cz);
      const y = o < 0 ? sampler(p.x, p.z) - V.skirtDropM : o === 0 ? edge - V.seamDropM : groundAt(p.x, p.z);
      positions[v * 3] = p.x; positions[v * 3 + 1] = y; positions[v * 3 + 2] = p.z;
      // 顶点色：接缝上 = 场地的高度色带（按边上那点的高），往外过渡到 ground.color（sRGB 里混，再换线性）
      BlockoutTintColor(edge, tint, rgb);
      const k = o <= 0 ? 0 : BackdropBlend(Math.hypot(p.x - cx, p.z - cz), bd.ground.blendM);
      c.setRGB(rgb[0] + (farRgb[0] - rgb[0]) * k, rgb[1] + (farRgb[1] - rgb[1]) * k, rgb[2] + (farRgb[2] - rgb[2]) * k, THREE.SRGBColorSpace);
      colors[v * 3] = c.r; colors[v * 3 + 1] = c.g; colors[v * 3 + 2] = c.b;
    }
  }
  const index = [];
  for (let r = 0; r + 1 < rings.length; r++) {
    for (let i = 0; i < N; i++) {
      const a = r * N + i, bb = r * N + (i + 1) % N, cc = (r + 1) * N + i, d = (r + 1) * N + (i + 1) % N;
      index.push(a, bb, cc, bb, d, cc);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.setIndex(index.length > 65535 ? new THREE.Uint32BufferAttribute(index, 1) : new THREE.Uint16BufferAttribute(index, 1));
  geometry.computeVertexNormals();
  // 卷绕方向：法线要朝上；朝下就把三角形反过来
  const normals = geometry.getAttribute("normal");
  if (normals.getY(N * 3) < 0) {
    const ix = geometry.index.array;
    for (let t = 0; t < ix.length; t += 3) { const tmp = ix[t + 1]; ix[t + 1] = ix[t + 2]; ix[t + 2] = tmp; }
    geometry.index.needsUpdate = true;
    geometry.computeVertexNormals();
  }
  geometry.computeBoundingSphere();
  return geometry;
}

/** 把 box / blob / hill 合成三份几何（顶点色线性）。→ { box, blob, hill }（没有的是 null）+ counts。 */
export function BuildBackdropShapeGeometry(layout) {
  const V = BLOCKOUT_BACKDROP_VIEW, bd = layout.backdrop, groundAt = layout.backdropGroundAt;
  const acc = { box: { p: [], n: [], c: [], i: [] }, blob: { p: [], n: [], c: [], i: [] }, hill: { p: [], n: [], c: [], i: [] } };
  const counts = { box: 0, blob: 0, hill: 0, tree: 0 };
  const col = new THREE.Color(), col2 = new THREE.Color();
  for (const sh of bd.shapes) {
    counts[sh.kind] = (counts[sh.kind] || 0) + 1;
    if (sh.kind === "tree") continue;
    const base = groundAt(sh.x, sh.z) + (Number.isFinite(sh.lift) ? sh.lift : 0);
    const ry = sh.ry || 0, cr = Math.cos(ry), sr = Math.sin(ry);
    // 本地 (u, v) → 世界：同 three 的 rotation.y（x' = u·cos + v·sin，z' = −u·sin + v·cos）
    const W = (u, v) => [sh.x + u * cr + v * sr, sh.z - u * sr + v * cr];
    SRGB(sh.color, col);
    if (sh.kind === "box") {
      const A = acc.box, hw = sh.w / 2, hd = sh.d / 2;
      // 六个面各 4 个点（平直法线）：底面不画（坐在地上）
      const faces = [
        [[0, 1, 0], [[-hw, sh.h, -hd], [-hw, sh.h, hd], [hw, sh.h, hd], [hw, sh.h, -hd]]],
        [[0, 0, 1], [[-hw, 0, hd], [hw, 0, hd], [hw, sh.h, hd], [-hw, sh.h, hd]]],
        [[0, 0, -1], [[hw, 0, -hd], [-hw, 0, -hd], [-hw, sh.h, -hd], [hw, sh.h, -hd]]],
        [[1, 0, 0], [[hw, 0, hd], [hw, 0, -hd], [hw, sh.h, -hd], [hw, sh.h, hd]]],
        [[-1, 0, 0], [[-hw, 0, -hd], [-hw, 0, hd], [-hw, sh.h, hd], [-hw, sh.h, -hd]]],
      ];
      for (const [nrm, quad] of faces) {
        const at = A.p.length / 3;
        for (const [u, y, v] of quad) { const [x, z] = W(u, v); A.p.push(x, base + y - (y === 0 ? 0.3 : 0), z); A.c.push(col.r, col.g, col.b); }
        const nxw = nrm[0] * cr + nrm[2] * sr, nzw = -nrm[0] * sr + nrm[2] * cr;
        for (let k = 0; k < 4; k++) A.n.push(nxw, nrm[1], nzw);
        A.i.push(at, at + 1, at + 2, at, at + 2, at + 3);
      }
      continue;
    }
    if (sh.kind === "blob") {
      const A = acc.blob, rx = sh.rx, rz = sh.rz || sh.rx, ry2 = sh.h / 2, cy = base + ry2;
      const { seg, rings } = V.blob;
      const at = A.p.length / 3;
      // 两极 + (rings − 1) 圈
      const Push = (ux, uy, uz) => {
        const [x, z] = W(ux * rx, uz * rz);
        A.p.push(x, cy + uy * ry2, z);
        const nx = ux / rx, ny = uy / ry2, nz = uz / rz, len = Math.hypot(nx, ny, nz) || 1;
        const nxw = (nx * cr + nz * sr) / len, nzw = (-nx * sr + nz * cr) / len;
        A.n.push(nxw, ny / len, nzw);
        // 底下暗一点（树冠底面背光）
        const k = 0.78 + 0.22 * (uy * 0.5 + 0.5);
        A.c.push(col.r * k, col.g * k, col.b * k);
      };
      Push(0, 1, 0);
      for (let r = 1; r < rings; r++) {
        const phi = Math.PI * r / rings, sy = Math.cos(phi), sxz = Math.sin(phi);
        for (let s = 0; s < seg; s++) { const th = 2 * Math.PI * s / seg; Push(Math.cos(th) * sxz, sy, Math.sin(th) * sxz); }
      }
      Push(0, -1, 0);
      const last = at + 1 + (rings - 1) * seg;
      for (let s = 0; s < seg; s++) A.i.push(at, at + 1 + (s + 1) % seg, at + 1 + s);
      for (let r = 0; r < rings - 2; r++) for (let s = 0; s < seg; s++) {
        const a = at + 1 + r * seg + s, b2 = at + 1 + r * seg + (s + 1) % seg, c2 = a + seg, d = b2 + seg;
        A.i.push(a, b2, c2, b2, d, c2);
      }
      for (let s = 0; s < seg; s++) { const a = at + 1 + (rings - 2) * seg + s, b2 = at + 1 + (rings - 2) * seg + (s + 1) % seg; A.i.push(a, b2, last); }
      continue;
    }
    if (sh.kind === "hill") {
      const A = acc.hill, rx = sh.rx, rz = sh.rz || sh.rx, { rings, seg, sinkM } = V.hill;
      SRGB(sh.topColor || sh.color, col2);
      const at = A.p.length / 3;
      // 高度剖面：(1 − r²)²，再叠一点按角度的起伏（不是一个正圆馒头）；底圈压进地面 sinkM
      const seed = (sh.id.length * 7 + sh.x * 0.013 + sh.z * 0.017) % (2 * Math.PI);
      const H = (r, th) => {
        const k = 1 - r * r;
        const lump = 1 + 0.18 * Math.sin(2 * th + seed) * r + 0.1 * Math.sin(3 * th + seed * 1.7) * r;
        return k > 0 ? sh.h * k * k * lump : 0;
      };
      const PushH = (r, th) => {
        const u = Math.cos(th) * r * rx, v = Math.sin(th) * r * rz, [x, z] = W(u, v);
        const y = H(r, th);
        A.p.push(x, base + y - (r >= 1 ? sinkM : 0), z);
        const t = Math.min(1, y / sh.h);
        A.c.push(col.r + (col2.r - col.r) * t, col.g + (col2.g - col.g) * t, col.b + (col2.b - col.b) * t);
        A.n.push(0, 1, 0);
      };
      PushH(0, 0);
      for (let r = 1; r <= rings; r++) for (let s = 0; s < seg; s++) PushH(r / rings, 2 * Math.PI * s / seg);
      for (let s = 0; s < seg; s++) A.i.push(at, at + 1 + (s + 1) % seg, at + 1 + s);
      for (let r = 0; r < rings - 1; r++) for (let s = 0; s < seg; s++) {
        const a = at + 1 + r * seg + s, b2 = at + 1 + r * seg + (s + 1) % seg, c2 = a + seg, d = b2 + seg;
        A.i.push(a, b2, c2, b2, d, c2);
      }
    }
  }
  const Geo = (A, smooth) => {
    if (!A.p.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(A.p, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(A.n, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(A.c, 3));
    g.setIndex(A.p.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(A.i, 1) : new THREE.Uint16BufferAttribute(A.i, 1));
    if (smooth) g.computeVertexNormals();
    g.computeBoundingSphere();
    return g;
  };
  return { box: Geo(acc.box, false), blob: Geo(acc.blob, false), hill: Geo(acc.hill, true), counts };
}

export class BlockoutBackdrop {
  /** @param {{ scene: THREE.Scene, renderer?: THREE.WebGLRenderer, patches?: object[] }} options  patches：地面再叠的补丁（编辑器的米格线） */
  constructor({ scene, renderer = null, patches = [] }) {
    this.scene = scene;
    this.renderer = renderer;
    this.patches = patches;
    this.root = new THREE.Group();
    this.root.name = "BlockoutBackdrop";
    scene?.add(this.root);
    this.layout = null;
    this.meshes = [];
    this.textures = [];
    this.materials = [];
    this.stats = { built: false };
  }

  /** 每帧调：布局换了就重建（没有 backdrop 的布局只清空）。 */
  Sync(layout) {
    if (layout === this.layout) return false;
    this.layout = layout;
    this._Clear();
    if (layout?.backdrop && layout.backdropGroundAt && layout.terrainSampler) this._Build(layout);
    return true;
  }

  _Build(layout) {
    const t0 = performance.now();
    const bd = layout.backdrop;
    const hazeUniforms = HazeUniforms(bd.haze);
    // 地面图
    const maxTex = this.renderer?.capabilities?.maxTextureSize || 4096;
    const t1 = performance.now();
    const ras = RasterizeBackdropPaint(bd, { maxPx: Math.min(BLOCKOUT_BACKDROP_TEXTURE.maxPx, maxTex) });
    const rasterMs = performance.now() - t1;
    let texture = null;
    if (ras) {
      texture = new THREE.DataTexture(ras.data, ras.width, ras.height, THREE.RGBAFormat, THREE.UnsignedByteType);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
      texture.magFilter = THREE.LinearFilter;
      texture.minFilter = THREE.LinearMipmapLinearFilter;
      texture.generateMipmaps = true;
      texture.anisotropy = Math.min(BLOCKOUT_BACKDROP_VIEW.anisotropy, this.renderer?.capabilities?.getMaxAnisotropy?.() || 1);
      texture.flipY = false;
      texture.needsUpdate = true;
      this.textures.push(texture);
    }
    const groundUniforms = {
      ...hazeUniforms,
      uBdPaint: { value: texture },
      // 世界 (x, z) → 图上 (u, v)：(x − minX) / (宽 · texel)（像素中心对齐）
      uBdRect: { value: ras ? new THREE.Vector4(ras.minX, ras.minZ, 1 / (ras.width * ras.texelM), 1 / (ras.height * ras.texelM)) : new THREE.Vector4(0, 0, 0, 0) },
    };
    // 地面
    const groundGeo = BuildBackdropGroundGeometry(layout);
    const groundMat = new THREE.MeshStandardMaterial({ name: "BlockoutBackdropGround", vertexColors: true, roughness: 1, metalness: 0 });
    ApplyPatches(groundMat, ras ? [MakeBackdropPatch(groundUniforms, true), ...this.patches] : [MakeBackdropPatch(hazeUniforms, false), ...this.patches]);
    this._Add(new THREE.Mesh(groundGeo, groundMat), "BlockoutBackdrop_Ground", { receiveShadow: true });
    this.materials.push(groundMat);
    // 体块
    const shapes = BuildBackdropShapeGeometry(layout);
    const shapeMat = new THREE.MeshStandardMaterial({ name: "BlockoutBackdropShapes", vertexColors: true, roughness: 1, metalness: 0 });
    ApplyPatches(shapeMat, [MakeBackdropPatch(hazeUniforms, false)]);
    this.materials.push(shapeMat);
    for (const kind of ["box", "blob", "hill"]) if (shapes[kind]) this._Add(new THREE.Mesh(shapes[kind], shapeMat), `BlockoutBackdrop_${kind}`);
    this.root.updateMatrixWorld(true);
    let vertices = 0, triangles = 0;
    for (const m of this.meshes) { vertices += m.geometry.getAttribute("position").count; triangles += m.geometry.index.count / 3; }
    this.stats = {
      built: true, far: bd.far, meshes: this.meshes.length, vertices, triangles, shapes: { ...shapes.counts },
      texture: ras ? { width: ras.width, height: ras.height, texelM: Math.round(ras.texelM * 1000) / 1000, minX: ras.minX, minZ: ras.minZ, painted: ras.painted } : null,
      rasterMs: Math.round(rasterMs), buildMs: Math.round(performance.now() - t0),
    };
  }

  _Add(mesh, name, { receiveShadow = false } = {}) {
    mesh.name = name;
    mesh.frustumCulled = false;
    mesh.castShadow = false;
    mesh.receiveShadow = receiveShadow;
    mesh.matrixAutoUpdate = false;
    // 白盒画质：按地形对待（保留自己的颜色，不刷成灰网格）
    mesh.userData.whiteboxTerrain = true;
    mesh.userData.blockoutBackdrop = true;
    this.root.add(mesh);
    this.meshes.push(mesh);
  }

  _Clear() {
    for (const m of this.meshes) { m.removeFromParent(); m.geometry.dispose(); }
    for (const t of this.textures) t.dispose();
    for (const mat of this.materials) mat.dispose();
    this.meshes = []; this.textures = []; this.materials = [];
    this.stats = { built: false };
  }

  Stats() { return { ...this.stats, shapes: this.stats.shapes ? { ...this.stats.shapes } : undefined, texture: this.stats.texture ? { ...this.stats.texture } : null }; }

  Dispose() {
    this._Clear();
    this.root.removeFromParent();
  }
}
