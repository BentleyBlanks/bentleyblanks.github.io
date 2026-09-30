import assert from "node:assert/strict";
import { WHITEBOX_DEFAULTS, NormalizeWhiteboxConfig, WhiteboxPassPlan, ResolveGraphicsProfile,
  WhiteboxGraphicsOverrides, WHITEBOX_STORAGE_KEY, WHITEBOX_CARDS } from "./Data_Tuning_Whitebox.mjs";
import { LoadWhiteboxConfig, SaveWhiteboxConfig, LoadGraphicsProfile, CreateGraphicsProfileApi } from "./Script_GraphicsProfile.mjs";
import { LoadSavedGraphics } from "./Script_EditorSettings.mjs";

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
assert.equal(WhiteboxGraphicsOverrides({}).shadows, false);
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
memory.set("tengxian1938_graphics_v1", JSON.stringify({ taa: true, gi: true, profile: "high" }));
assert.equal(LoadGraphicsProfile(), "whitebox", "legacy graphics cannot change the new default");
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
globalThis.localStorage = { getItem() { throw new Error("denied"); }, setItem() { throw new Error("denied"); } };
assert.equal(LoadGraphicsProfile(), "whitebox");
assert.equal(SaveWhiteboxConfig({}), false);
console.log("PASS whitebox default, migration, schema, dependency plan, persistence and agent API");
