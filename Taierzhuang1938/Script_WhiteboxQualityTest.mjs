import assert from "node:assert/strict";
import { WHITEBOX_DEFAULTS, NormalizeWhiteboxConfig, WhiteboxPassPlan, ResolveGraphicsProfile,
  WhiteboxGraphicsOverrides, WHITEBOX_STORAGE_KEY, GRAPHICS_PROFILE_STORAGE_KEY, WHITEBOX_CARDS } from "./Data_Tuning_Whitebox.mjs";
import { LoadWhiteboxConfig, SaveWhiteboxConfig, LoadGraphicsProfile, CreateGraphicsProfileApi } from "./Script_GraphicsProfile.mjs";
import { LoadSavedGraphics } from "./Script_EditorSettings.mjs";
import { SandboxUrl } from "./Data_StartupRouting.mjs";
import { WhiteboxSceneRenderer } from "./Script_WhiteboxRendering.mjs";
import * as THREE from "three";

assert.equal(ResolveGraphicsProfile(null, null), "whitebox");
assert.equal(ResolveGraphicsProfile("high", "whitebox"), "high");
assert.equal(ResolveGraphicsProfile(null, "ultra"), "ultra");
assert.equal(ResolveGraphicsProfile("bad", "bad"), "whitebox");
assert.deepEqual(WhiteboxPassPlan(), ["main", "wireframe", "debugOverlay", "whiteboxOutput"]);
assert.deepEqual(NormalizeWhiteboxConfig({ terrainTextures: "false", ssr: 1, renderScale: NaN,
  surfaceColor: "invalid", unexpected: true }), WHITEBOX_DEFAULTS);
assert.equal(NormalizeWhiteboxConfig({ renderScale: 99 }).renderScale, 1.6);
assert.ok(WhiteboxPassPlan({ ssr: true }).includes("prepass"));
assert.ok(WhiteboxPassPlan({ ssr: true }).includes("hzb"));
assert.ok(WhiteboxPassPlan({ interiorSky: true }).includes("gtao"));
assert.ok(WhiteboxPassPlan({ lensFlare: true }).includes("bloom"));
assert.ok(!WhiteboxPassPlan({ bloom: true }).includes("whiteboxOutput"));
assert.ok(WhiteboxPassPlan({ volumetrics: true }).includes("volumetricInject"));
assert.equal(WhiteboxGraphicsOverrides({}).shadows, true, "whitebox draws the level sun's cascaded shadows by default");
assert.equal(WhiteboxGraphicsOverrides({ shadows: false }).shadows, false);
assert.equal(WhiteboxGraphicsOverrides({}).taa, false);
assert.equal(WHITEBOX_DEFAULTS.characterTextures, true);
assert.equal(WHITEBOX_DEFAULTS.assetTextures, false);
assert.equal(WHITEBOX_DEFAULTS.cardTextures, true, "alpha-cut cards (foliage, grass) keep their texture colour in whitebox: no white-spike fields");
assert.equal(NormalizeWhiteboxConfig({ cardTextures: false }).cardTextures, false, "the card switch can be turned off (back to the flat surface colour)");
assert.ok(WHITEBOX_CARDS.desaturate >= 0 && WHITEBOX_CARDS.desaturate <= 0.8 && WHITEBOX_CARDS.brightness > 0.2 && WHITEBOX_CARDS.brightness < 1, "card tint numbers stay in a sane range");
assert.match(WHITEBOX_CARDS.fallbackColor, /^#[\da-f]{6}$/i);
{
  // 卡片色不能比中性光下的白盒地面还亮（白刺）：fallback 暗橄榄的亮度低于表面色。
  const luma = (hex) => { const n = parseInt(hex.slice(1), 16); return 0.2126 * (n >> 16) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255); };
  assert.ok(luma(WHITEBOX_CARDS.fallbackColor) < luma(WHITEBOX_DEFAULTS.surfaceColor), "the fallback card colour is darker than the grey surface colour");
}
assert.equal(WHITEBOX_DEFAULTS.grid, true);
assert.equal(NormalizeWhiteboxConfig({ gridSize: 0, gridLineWidth: 99 }).gridSize, 0.1);
assert.equal(NormalizeWhiteboxConfig({ gridLineWidth: 99 }).gridLineWidth, 0.05);
assert.equal(NormalizeWhiteboxConfig({ gridColor: "invalid" }).gridColor, WHITEBOX_DEFAULTS.gridColor);
const memory = new Map();
globalThis.localStorage = { getItem: (k) => memory.get(k), setItem: (k, v) => memory.set(k, v) };
memory.set(WHITEBOX_STORAGE_KEY, JSON.stringify({ surfaceColor: "#d8dadd", assetTextures: false }));
assert.equal(LoadWhiteboxConfig().surfaceColor, WHITEBOX_DEFAULTS.surfaceColor);
assert.equal(LoadWhiteboxConfig().characterTextures, true);
memory.set(WHITEBOX_STORAGE_KEY, JSON.stringify({ surfaceColor: "#123456" }));
assert.equal(LoadWhiteboxConfig().surfaceColor, "#123456");
// 2026-10-02 shadows 默认开：旧口径的存档把 shadows:false 写死了（每个默认值都存），按旧默认迁移；
// 新口径（schema 2）里存着的 false 是玩家自己关的，保留。
memory.set(WHITEBOX_STORAGE_KEY, JSON.stringify({ grid: true, shadows: false, taa: false }));
assert.equal(LoadWhiteboxConfig().shadows, true, "a pre-schema save's shadows:false was the old default");
memory.set(WHITEBOX_STORAGE_KEY, JSON.stringify({ grid: true, shadows: false, schema: 2 }));
assert.equal(LoadWhiteboxConfig().shadows, false, "a schema-2 save keeps the player's own shadows:false");
SaveWhiteboxConfig({ shadows: false });
assert.equal(JSON.parse(memory.get(WHITEBOX_STORAGE_KEY)).schema, WHITEBOX_DEFAULTS.schema, "saves are stamped with the current schema");
assert.equal(LoadWhiteboxConfig().shadows, false);
memory.set("tengxian1938_graphics_v1", JSON.stringify({ taa: true, gi: true, profile: "high" }));
assert.equal(LoadGraphicsProfile(), "whitebox", "legacy graphics cannot change the new default");
// Cloth is a material inspection scene. Its local fallback must not rewrite the
// user's global presentation or whitebox options, including when entered from a menu.
for (const [saved, query, expected] of [
  [null, "?cloth=1", "high"], ["whitebox", "?cloth=1", "high"],
  ["low", "?cloth=1", "low"], ["medium", "?cloth=1", "medium"],
  ["high", "?cloth=1", "high"], ["ultra", "?cloth=1", "ultra"],
  ["whitebox", "?cloth=1&quality=low", "low"], ["medium", "?cloth=1&quality=whitebox", "whitebox"],
  ["whitebox", "?cloth=1&quality=invalid", "high"],
  [null, "", "whitebox"], ["whitebox", "?weapons=1", "whitebox"],
  ["whitebox", "?cloth=0", "whitebox"], ["medium", "?range=1", "medium"],
]) {
  if (saved === null) memory.delete(GRAPHICS_PROFILE_STORAGE_KEY);
  else memory.set(GRAPHICS_PROFILE_STORAGE_KEY, JSON.stringify(saved));
  const before = [...memory];
  assert.equal(LoadGraphicsProfile(query), expected, `scene profile saved=${saved} query=${query}`);
  assert.deepEqual([...memory], before, "resolving a scene profile never writes storage");
}
memory.set(GRAPHICS_PROFILE_STORAGE_KEY, "corrupt");
assert.equal(LoadGraphicsProfile("?cloth=1"), "high");
assert.equal(LoadGraphicsProfile(), "whitebox");
memory.delete(GRAPHICS_PROFILE_STORAGE_KEY);
const clothEntry = SandboxUrl("https://example.test/?quality=whitebox", "cloth");
assert.equal(new URL(clothEntry).search, "?cloth=1");
assert.equal(new URL(SandboxUrl(clothEntry, "weapons")).search, "?weapons=1", "Leaving the lab does not carry a temporary high override into another scene");
assert.equal(new URL(SandboxUrl("https://example.test/?quality=low", "cloth")).search, "?quality=low&cloth=1");
assert.equal(new URL(SandboxUrl("https://example.test/?quality=whitebox", "weapons")).search, "?quality=whitebox&weapons=1");
const graphics = { profile: "whitebox", taa: false, gi: false };
assert.equal(LoadSavedGraphics(graphics), 0);
assert.equal(graphics.taa, false);
const art = { profile: "high", taa: false, gi: false };
LoadSavedGraphics(art); assert.equal(art.taa, true); assert.equal(art.profile, "high");
SaveWhiteboxConfig({ assetTextures: true });
assert.equal(LoadWhiteboxConfig().assetTextures, true);
const api = CreateGraphicsProfileApi({ profile: "whitebox", config: LoadWhiteboxConfig(), post: { quality: "high" } });
assert.throws(() => api.ConfigureWhitebox({ unknown: true }), /Unknown/);
assert.throws(() => api.ConfigureWhitebox({ ssao: "yes" }), /Invalid/);
assert.equal(api.ConfigureWhitebox({ taa: true }).reloadRequired, true);
assert.equal(LoadWhiteboxConfig().taa, true);
api.ConfigureWhitebox({ characterTextures: false, gridSize: 2, gridColor: "#334455" });
assert.equal(LoadWhiteboxConfig().characterTextures, false);
assert.equal(LoadWhiteboxConfig().gridSize, 2);
assert.equal(LoadWhiteboxConfig().gridColor, "#334455");
memory.set(WHITEBOX_STORAGE_KEY, "corrupt");
assert.deepEqual(LoadWhiteboxConfig(), WHITEBOX_DEFAULTS);
{
  // Exercise the actual cached Begin/restore path: the source material is restored
  // after each draw, so inspecting it alone used to miss an inert wireframe toggle.
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera();
  const source = new THREE.MeshStandardMaterial({ wireframe: false });
  const geometry = new THREE.BoxGeometry(), mesh = new THREE.Mesh(geometry, source);
  scene.add(mesh);
  const whitebox = new WhiteboxSceneRenderer(scene, { ...WHITEBOX_DEFAULTS });
  try {
    let restore = whitebox.Begin(scene, camera);
    const cached = mesh.material;
    assert.notEqual(cached, source); assert.equal(cached.wireframe, false); restore();
    assert.equal(mesh.material, source);
    source.wireframe = true;
    restore = whitebox.Begin(scene, camera);
    assert.equal(mesh.material, cached, "wireframe toggles reuse the cached whitebox material");
    assert.equal(mesh.material.wireframe, true, "the actual draw material follows wireframe on"); restore();
    source.wireframe = false;
    restore = whitebox.Begin(scene, camera);
    assert.equal(mesh.material.wireframe, false, "the same cached draw material follows wireframe off"); restore();
  } finally { whitebox.Dispose(); geometry.dispose(); source.dispose(); }
}
globalThis.localStorage = { getItem() { throw new Error("denied"); }, setItem() { throw new Error("denied"); } };
assert.equal(LoadGraphicsProfile(), "whitebox");
assert.equal(LoadGraphicsProfile("?cloth=1"), "high", "cloth remains textured when storage is unavailable");
assert.equal(LoadGraphicsProfile("?cloth=1&quality=whitebox"), "whitebox");
assert.equal(SaveWhiteboxConfig({}), false);
console.log("PASS whitebox defaults, cloth route isolation, cached wireframe, migration, persistence and agent API");
