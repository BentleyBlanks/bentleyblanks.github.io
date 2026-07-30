import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const pageDirectory = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(pageDirectory, "index.html"), "utf8");
const css = readFileSync(join(pageDirectory, "Style_Game.css"), "utf8");
const gameScript = readFileSync(join(pageDirectory, "Script_Game.mjs"), "utf8");
const worldScript = readFileSync(join(pageDirectory, "Script_World3D.mjs"), "utf8");

const tests = [];

function Test(name, callback) {
  tests.push({ name, callback });
}

function ExtractFunction(source, functionName) {
  const startPattern = new RegExp(`(?:^|\\n)function\\s+${functionName}\\s*\\(`);
  const match = startPattern.exec(source);
  assert.ok(match, `缺少函数 ${functionName}`);
  const start = match.index + (match[0].startsWith("\n") ? 1 : 0);
  const openingBrace = source.indexOf("{", start);
  assert.notEqual(openingBrace, -1, `${functionName} 缺少左花括号`);
  let depth = 0;
  for (let index = openingBrace; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  assert.fail(`${functionName} 缺少右花括号`);
}

function ExtractBalancedBlock(source, startPattern, description) {
  const match = startPattern.exec(source);
  assert.ok(match, `缺少 ${description}`);
  const openingBrace = source.indexOf("{", match.index + match[0].length);
  assert.notEqual(openingBrace, -1, `${description} 缺少左花括号`);
  let depth = 0;
  for (let index = openingBrace; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(openingBrace + 1, index);
    }
  }
  assert.fail(`${description} 缺少右花括号`);
}

function ReadPixelValue(source, pattern, description) {
  const match = pattern.exec(source);
  assert.ok(match, `缺少 ${description}`);
  return Number(match[1]);
}

Test("页面只声明标准桌面 viewport，并提供明确的中文桌面门禁", () => {
  assert.match(
    html,
    /<meta\s+name=["']viewport["'][^>]*content=["']width=device-width,\s*initial-scale=1["']/i,
  );
  assert.doesNotMatch(html, /viewport-fit\s*=\s*cover/i);
  assert.match(html, /id=["']desktopGate["']/);
  assert.match(html, /id=["']desktopGateTitle["'][^>]*>请使用桌面设备</);
  assert.match(html, /至少\s*1280\s*×\s*720/);
});

Test("不足 1280×720 时 CSS 只显示桌面门禁", () => {
  assert.match(css, /@media\s*\(max-width:\s*1279px\)\s*,\s*\(max-height:\s*719px\)/);
  assert.match(
    css,
    /body\s*>\s*:not\(\.desktopGate\):not\(script\)\s*\{[^}]*display:\s*none\s*!important/s,
  );
  assert.match(
    css,
    /@media\s*\(max-width:\s*1279px\)[\s\S]*?\.desktopGate\s*\{[\s\S]*?display:\s*grid/,
  );
  assert.match(css, /\.desktopGate\s*\{\s*display:\s*none/);
});

Test("手机、平板与横屏自适应布局已完全移除", () => {
  assert.doesNotMatch(css, /@media\s*\(max-width:\s*(?:1180|1024|640)px\)/);
  assert.doesNotMatch(css, /orientation:\s*(?:portrait|landscape)/i);
  assert.doesNotMatch(css, /safe-area-inset-/i);
  assert.doesNotMatch(css, /touch-action|-webkit-tap-highlight-color/i);
  assert.doesNotMatch(css, /Tablet and mobile|portrait reference/i);
  assert.doesNotMatch(html, /双指|单指|触控/);
  assert.doesNotMatch(gameScript, /pinchDistance|双指|单指|键盘与触控/);
});

Test("1280×720 最低桌面尺寸为核心沙盘保留至少 720×390", () => {
  const desktopCss = ExtractBalancedBlock(
    css,
    /@media\s*\(max-width:\s*1500px\)/,
    "中等桌面布局",
  );
  const topBarHeight = ReadPixelValue(desktopCss, /--topBarHeight:\s*(\d+)px/, "桌面顶栏高度");
  const bottomDockHeight = ReadPixelValue(desktopCss, /--bottomDockHeight:\s*(\d+)px/, "桌面命令坞高度");
  const leftRailWidth = ReadPixelValue(desktopCss, /--leftRailWidth:\s*(\d+)px/, "左栏宽度");
  const rightRailWidth = ReadPixelValue(desktopCss, /--rightRailWidth:\s*(\d+)px/, "右栏宽度");
  const battlefieldGap = ReadPixelValue(
    desktopCss,
    /\.battlefieldGrid\s*\{[^}]*gap:\s*(\d+)px/s,
    "战场栏间距",
  );
  const battlefieldPadding = ReadPixelValue(
    desktopCss,
    /\.battlefieldGrid\s*\{[^}]*padding:\s*(\d+)px/s,
    "战场边距",
  );
  const mapHeaderHeight = ReadPixelValue(
    desktopCss,
    /\.mapHeader\s*\{[^}]*min-height:\s*(\d+)px/s,
    "地图标题栏高度",
  );
  const navigatorHeight = ReadPixelValue(
    desktopCss,
    /\.hexNavigator\s*\{[^}]*min-height:\s*(\d+)px/s,
    "地块导航高度",
  );
  const mapWidth = 1280 - (battlefieldPadding * 2) - (battlefieldGap * 2)
    - leftRailWidth - rightRailWidth;
  const mapHeight = 720 - topBarHeight - bottomDockHeight - (battlefieldPadding * 2)
    - mapHeaderHeight - navigatorHeight;
  assert.ok(mapWidth >= 720, `最低桌面沙盘宽度仅 ${mapWidth}px`);
  assert.ok(mapHeight >= 390, `最低桌面沙盘高度仅 ${mapHeight}px`);
});

Test("不足桌面尺寸时 Boot 在绑定游戏交互前停止", () => {
  const supported = ExtractFunction(gameScript, "IsDesktopViewportSupported");
  const boot = ExtractFunction(gameScript, "Boot");
  assert.match(supported, /window\.innerWidth\s*>=\s*1280/);
  assert.match(supported, /window\.innerHeight\s*>=\s*720/);
  assert.match(boot, /if\s*\(\s*!IsDesktopViewportSupported\(\)\s*\)\s*(?:\{[\s\S]*?)?return\s*;/);
  assert.ok(
    boot.indexOf("IsDesktopViewportSupported") < boot.indexOf("BindStaticEvents"),
    "桌面尺寸门禁必须先于 BindStaticEvents 执行",
  );
});

Test("Three.js 只保留一个最高画质配置", () => {
  assert.match(worldScript, /World3DQualityProfile\s*=\s*Object\.freeze\s*\(\s*\{/);
  assert.match(worldScript, /dprCap:\s*2\b/);
  assert.match(worldScript, /shadowMapSize:\s*4096\b/);
  assert.match(worldScript, /targetFps:\s*60\b/);
  assert.match(worldScript, /paperTextureSize:\s*2048\b/);
  assert.doesNotMatch(
    worldScript,
    /narrow(?:Width|DprCap|TargetFps)|desktopTargetFps|reducedMotionTargetFps|runtimePaperTextureSize|disabled-narrow/,
  );
});

Test("阴影、60 FPS 和完整地表纹理不会按窗口宽度降级", () => {
  assert.match(worldScript, /renderer\.shadowMap\.enabled\s*=\s*true/);
  const shadowAssignments = [...worldScript.matchAll(/renderer\.shadowMap\.enabled\s*=\s*([^;\n]+)/g)]
    .map((match) => match[1].trim());
  assert.ok(
    shadowAssignments.every((value) => value === "true"),
    `阴影开关出现非最高画质赋值：${shadowAssignments.join(", ")}`,
  );
  assert.match(worldScript, /function\s+GetTargetFrameRate\s*\(\s*\)[\s\S]*?return\s+World3DQualityProfile\.targetFps/);
  assert.doesNotMatch(worldScript, /GetTargetFrameRate\s*\([^)]*(?:width|reducedMotion)/);
  assert.doesNotMatch(worldScript, /loadedTexture[\s\S]{0,900}drawImage\s*\(/);
  assert.match(worldScript, /texture\.generateMipmaps\s*=\s*true/);
});

Test("页面没有可切换画质的控件", () => {
  assert.doesNotMatch(html, /<(?:button|select|input)\b[^>]*(?:quality|画质)/i);
  assert.doesNotMatch(html, /data-quality|qualitySelector|qualityOption/i);
});

Test("地块导航保留左右浏览按钮并绑定完整滚动状态更新", () => {
  assert.match(
    html,
    /id=["']hexScrollLeftButton["'][^>]*aria-controls=["']hexNavigator["']/,
  );
  assert.match(
    html,
    /id=["']hexScrollRightButton["'][^>]*aria-controls=["']hexNavigator["']/,
  );
  assert.match(
    gameScript,
    /"hexScrollLeftButton",\s*"hexScrollRightButton",\s*"worldModeBadge"/,
  );
  const bindStaticEvents = ExtractFunction(gameScript, "BindStaticEvents");
  assert.match(
    bindStaticEvents,
    /ui\.hexScrollLeftButton\?\.addEventListener\("click",\s*\(\)\s*=>\s*ScrollHexNavigator\(-1\)\)/,
  );
  assert.match(
    bindStaticEvents,
    /ui\.hexScrollRightButton\?\.addEventListener\("click",\s*\(\)\s*=>\s*ScrollHexNavigator\(1\)\)/,
  );
  assert.match(
    bindStaticEvents,
    /ui\.hexNavigator\?\.addEventListener\("scroll",\s*UpdateHexNavigatorScrollState/,
  );
  assert.match(
    ExtractFunction(gameScript, "RenderHexNavigator"),
    /window\.requestAnimationFrame\(UpdateHexNavigatorScrollState\)/,
  );
});

Test("ScrollHexNavigator 与边界状态函数会真实驱动左右按钮", () => {
  const updateSource = ExtractFunction(gameScript, "UpdateHexNavigatorScrollState");
  const scrollSource = ExtractFunction(gameScript, "ScrollHexNavigator");
  const scrollCalls = [];
  const uiMock = {
    hexNavigator: {
      scrollWidth: 1200,
      clientWidth: 500,
      scrollLeft: 0,
      scrollBy(options) {
        scrollCalls.push(options);
      },
    },
    hexScrollLeftButton: { disabled: false },
    hexScrollRightButton: { disabled: false },
  };
  let reducedMotion = false;
  const windowMock = {
    matchMedia() {
      return { matches: reducedMotion };
    },
  };
  const createNavigatorFunctions = new Function(
    "ui",
    "window",
    `${updateSource}\n${scrollSource}\nreturn { UpdateHexNavigatorScrollState, ScrollHexNavigator };`,
  );
  const navigatorFunctions = createNavigatorFunctions(uiMock, windowMock);

  navigatorFunctions.UpdateHexNavigatorScrollState();
  assert.equal(uiMock.hexScrollLeftButton.disabled, true, "起点必须禁用左移按钮");
  assert.equal(uiMock.hexScrollRightButton.disabled, false, "起点必须允许右移按钮");

  navigatorFunctions.ScrollHexNavigator(1);
  assert.deepEqual(scrollCalls.at(-1), { left: 360, behavior: "smooth" });

  uiMock.hexNavigator.scrollLeft = 700;
  navigatorFunctions.UpdateHexNavigatorScrollState();
  assert.equal(uiMock.hexScrollLeftButton.disabled, false, "终点必须允许左移按钮");
  assert.equal(uiMock.hexScrollRightButton.disabled, true, "终点必须禁用右移按钮");

  reducedMotion = true;
  navigatorFunctions.ScrollHexNavigator(-1);
  assert.deepEqual(scrollCalls.at(-1), { left: -360, behavior: "auto" });
});

Test("战报关闭后会把真实伏击与破袭命令交给三维战斗特效", () => {
  const capture = ExtractFunction(gameScript, "CaptureWorldActionEffects");
  const playback = ExtractFunction(gameScript, "PlayPendingWorldActionEffects");
  const continueAfterReport = ExtractFunction(gameScript, "ContinueAfterReport");
  assert.match(capture, /\["ambush",\s*"sabotage"\]\.includes/);
  assert.match(capture, /targetHexId:\s*order\.targetHexId\s*\?\?\s*order\.hexId/);
  assert.match(capture, /sourceHexId:\s*actingUnit\?\.hexId\s*\?\?\s*null/);
  assert.match(playback, /PlayActionEffects\?\.\(effects\)/);
  assert.match(continueAfterReport, /PlayPendingWorldActionEffects\(\)/);
});

let passed = 0;
const failures = [];

for (const { name, callback } of tests) {
  try {
    callback();
    passed += 1;
    console.log(`✓ ${name}`);
  } catch (error) {
    failures.push({ name, error });
    console.error(`✗ ${name}`);
    console.error(`  ${error instanceof Error ? error.message : String(error)}`);
  }
}

console.log(`\nEnemyRear1941 desktop smoke: ${passed}/${tests.length} passed`);

if (failures.length > 0) {
  process.exitCode = 1;
}
