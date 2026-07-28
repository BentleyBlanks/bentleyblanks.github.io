import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const pageDirectory = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(pageDirectory, "index.html"), "utf8");
const css = readFileSync(join(pageDirectory, "Style_Game.css"), "utf8");
const gameScript = readFileSync(join(pageDirectory, "Script_Game.mjs"), "utf8");

const tests = [];

function Test(name, callback) {
  tests.push({ name, callback });
}

function ExtractFunction(source, functionName) {
  const startPattern = new RegExp(`(?:^|\\n)function\\s+${functionName}\\s*\\(`);
  const match = startPattern.exec(source);
  assert.ok(match, `缺少函数 ${functionName}`);
  const start = match.index + (match[0].startsWith("\n") ? 1 : 0);
  const nextFunction = source.indexOf("\nfunction ", start + 1);
  return source.slice(start, nextFunction < 0 ? source.length : nextFunction);
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

function ExtractRuleBodies(source, selectorPattern) {
  const bodies = [];
  const pattern = new RegExp(`${selectorPattern}\\s*\\{([^{}]*)\\}`, "g");
  let match;
  while ((match = pattern.exec(source)) !== null) {
    bodies.push(match[1]);
  }
  return bodies;
}

function PixelValuesForProperty(ruleBodies, propertyName) {
  const pattern = new RegExp(`${propertyName}\\s*:\\s*(\\d+(?:\\.\\d+)?)px`, "g");
  return ruleBodies.flatMap((body) => {
    const values = [];
    let match;
    while ((match = pattern.exec(body)) !== null) {
      values.push(Number(match[1]));
    }
    return values;
  });
}

Test("页面保留移动 viewport，并统一使用 20260728e 缓存标识", () => {
  assert.ok(
    /<meta\s+name=["']viewport["'][^>]*content=["'][^"']*width=device-width[^"']*viewport-fit=cover[^"']*["']/i.test(html),
    "缺少含 viewport-fit=cover 的移动 viewport",
  );
  assert.ok(/Style_Game\.css\?v=20260728e/.test(html), "CSS 缓存标识不是 20260728e");
  assert.ok(/Script_Game\.mjs\?v=20260728e/.test(html), "游戏脚本缓存标识不是 20260728e");
  assert.ok(/Script_Rules\.mjs\?v=20260728e/.test(gameScript), "规则脚本缓存标识不是 20260728e");
  assert.ok(
    !/(?:Style_Game\.css|Script_Game\.mjs)\?v=20260727/i.test(html),
    "HTML 仍引用 20260727 的旧缓存标识",
  );
});

Test("四向安全区被声明，并用于移动顶栏、命令坞和页面横向留白", () => {
  for (const side of ["top", "right", "bottom", "left"]) {
    assert.match(css, new RegExp(`safe-area-inset-${side}`), `缺少 ${side} 安全区`);
  }
  assert.match(
    css,
    /\.warLedger[\s\S]{0,1800}(?:safe-area-inset-top|var\(--[\w-]*safe[\w-]*top)/i,
    "移动顶栏没有消费顶部安全区",
  );
  assert.match(
    css,
    /\.commandDock[\s\S]{0,1800}(?:safe-area-inset-bottom|var\(--[\w-]*safe[\w-]*bottom)/i,
    "固定命令坞没有消费底部安全区",
  );
  assert.match(
    css,
    /(?:safe-area-inset-left|var\(--[\w-]*safe[\w-]*left)[\s\S]{0,500}(?:safe-area-inset-right|var\(--[\w-]*safe[\w-]*right)/i,
    "横屏左右安全区没有成对使用",
  );
});

Test("移动端命令坞为两个按钮和安全区预留足够短屏高度", () => {
  const mobileCss = ExtractBalancedBlock(
    css,
    /@media\s*\(max-width:\s*1024px\)/,
    "max-width: 1024px 移动布局",
  );
  const dockHeightDeclaration = mobileCss.match(
    /--bottomDockHeight\s*:\s*(?:calc\(\s*)?(\d+(?:\.\d+)?)px/i,
  );
  assert.ok(dockHeightDeclaration, "移动布局缺少可静态验证的命令坞高度");
  const commandActionBodies = ExtractRuleBodies(mobileCss, String.raw`\.commandActions`);
  assert.ok(commandActionBodies.length > 0, "移动布局缺少 .commandActions 样式");
  const horizontalActions = commandActionBodies.some((body) =>
    /grid-template-columns\s*:\s*(?!1fr\s*;)[^;]*\s+[^;]+;/i.test(body)
  );
  assert.ok(
    Number(dockHeightDeclaration[1]) >= (horizontalActions ? 70 : 122),
    `命令坞基础高度 ${dockHeightDeclaration[1]}px 与按钮排布不相容`,
  );
  assert.ok(horizontalActions, "移动命令按钮仍纵向堆叠，短屏会溢出固定命令坞");
  assert.match(
    mobileCss,
    /--bottomDockHeight\s*:[^;]*(?:safe-area-inset-bottom|var\(--[\w-]*safe[\w-]*bottom)/i,
    "命令坞高度未计入底部安全区",
  );
  assert.match(
    mobileCss,
    /\.gameShell[\s\S]{0,500}padding-bottom\s*:\s*var\(--bottomDockHeight\)/,
    "页面底部补偿没有跟随固定命令坞高度",
  );
  const shortPortraitCss = ExtractBalancedBlock(
    css,
    /@media\s*\(max-width:\s*640px\)\s*and\s*\(max-height:\s*700px\)/,
    "窄屏低高度布局",
  );
  assert.match(shortPortraitCss, /\.mapPanel[\s\S]*?100dvh/);
  const shortLandscapeCss = ExtractBalancedBlock(
    css,
    /@media\s*\(max-width:\s*1024px\)\s*and\s*\(max-height:\s*520px\)\s*and\s*\(orientation:\s*landscape\)/,
    "移动横屏低高度布局",
  );
  assert.match(
    shortLandscapeCss,
    /\.commandDock[\s\S]*?position\s*:\s*relative/,
    "极矮横屏没有把固定命令坞恢复到文档流",
  );
});

Test("长战报和终局弹窗从顶部开启且聚焦不会拉动滚动", () => {
  const focusHelper = ExtractFunction(gameScript, "FocusWithoutScroll");
  const openModal = ExtractFunction(gameScript, "OpenModal");
  const showTurnReport = ExtractFunction(gameScript, "ShowTurnReport");
  const showOutcome = ExtractFunction(gameScript, "ShowOutcome");

  assert.match(focusHelper, /\.focus\(\s*\{\s*preventScroll\s*:\s*true\s*\}\s*\)/);
  assert.match(openModal, /modal\.scrollTop\s*=\s*0/);
  assert.match(showTurnReport, /reportModal\.scrollTop\s*=\s*0/);
  assert.match(showTurnReport, /FocusWithoutScroll\(\s*ui\.reportModal\s*\)/);
  assert.doesNotMatch(showTurnReport, /reportContinueButton\?*\.focus\(/);
  assert.match(showOutcome, /outcomeModal\.scrollTop\s*=\s*0/);
  assert.match(showOutcome, /FocusWithoutScroll\(\s*ui\.outcomeModal\s*\)/);
  assert.doesNotMatch(showOutcome, /restartButton\?*\.focus\(/);
});

Test("pointercancel 只清理手势，不会触发地块选择", () => {
  assert.match(
    gameScript,
    /addEventListener\(\s*["']pointercancel["']\s*,\s*HandleMapPointerUp\s*\)/,
  );
  const pointerUp = ExtractFunction(gameScript, "HandleMapPointerUp");
  const guardedCancel = /event\.type\s*!==\s*["']pointercancel["']/.test(pointerUp)
    || /if\s*\(\s*event\.type\s*===\s*["']pointercancel["'][\s\S]*?return\s*;/.test(pointerUp);
  assert.ok(guardedCancel, "pointercancel 没有被排除在点选判定之外");
  assert.match(pointerUp, /if\s*\(\s*shouldSelect\s*\)[\s\S]*?SelectHex\(/);
});

Test("旅行返回按钮在基础样式中即满足 44px 触控尺寸", () => {
  const travelBodies = ExtractRuleBodies(css, String.raw`\.travelUnitCard\s+button`);
  assert.ok(travelBodies.length > 0, "缺少 .travelUnitCard button 样式");
  const heights = PixelValuesForProperty(travelBodies, "min-height");
  assert.ok(heights.length > 0, "旅行返回按钮缺少 min-height");
  assert.ok(
    heights.every((height) => height >= 44),
    `旅行返回按钮仍存在小于 44px 的高度：${heights.join(", ")}`,
  );
});

Test("Canvas 地块命中半径在任意缩放下至少保持 22 CSS px", () => {
  const pickHex = ExtractFunction(gameScript, "PickHex");
  assert.match(pickHex, /const\s+scale\s*=\s*Math\.max\(\s*0\.001\s*,/);
  assert.match(
    pickHex,
    /hitRadius\s*=\s*Math\.max\([^;]*,\s*22\s*\/\s*scale\s*\)/,
    "地块命中半径没有 22 CSS px 下限",
  );
  assert.match(pickHex, /distance\s*<\s*hitRadius/);
});

Test("已有存档时开始新战局必须经过覆盖确认", () => {
  const bindEvents = ExtractFunction(gameScript, "BindStaticEvents");
  const hasValidSave = ExtractFunction(gameScript, "HasValidSave");
  const requestStart = ExtractFunction(gameScript, "RequestStartNewGame");

  assert.match(
    bindEvents,
    /startButton\?*\.addEventListener\(\s*["']click["']\s*,\s*RequestStartNewGame\s*\)/,
  );
  assert.doesNotMatch(
    bindEvents,
    /startButton\?*\.addEventListener\(\s*["']click["']\s*,\s*StartNewGame\s*\)/,
  );
  assert.match(hasValidSave, /localStorage\.getItem\(\s*saveKey\s*\)/);
  assert.match(requestStart, /if\s*\(\s*!HasValidSave\(\)\s*\)/);
  assert.match(requestStart, /OpenStandardModal\(/);
  assert.match(requestStart, /覆盖/);
  assert.match(requestStart, /StartNewGame\(\)/);
});

Test("移动页面不会制造根级横向滚动，短屏抽屉给命令坞留出空间", () => {
  assert.match(css, /html\s*\{[^}]*min-width\s*:\s*0\s*;/s);
  assert.match(
    css,
    /\.openingScreen\s*\{[^}]*overflow-x\s*:\s*hidden\s*;/s,
    "开场装饰仍可能制造横向滚动条",
  );
  assert.match(css, /\.skipLink\s*\{[^}]*min-height\s*:\s*44px\s*;/s);
  const shortPortraitCss = ExtractBalancedBlock(
    css,
    /@media\s*\(max-width:\s*640px\)\s*and\s*\(max-height:\s*700px\)/,
    "短屏竖屏布局",
  );
  assert.match(
    shortPortraitCss,
    /minmax\(\s*230px\s*,\s*calc\([^;]*-\s*312px\s*\)\s*\)/,
    "短屏地图没有完整避让抽屉把手和命令坞",
  );
});

Test("进入战局重置页面位置，重启取消会恢复到可见菜单焦点", () => {
  const boot = ExtractFunction(gameScript, "Boot");
  const enterGame = ExtractFunction(gameScript, "EnterGame");
  const closeModal = ExtractFunction(gameScript, "CloseModal");
  const confirmRestart = ExtractFunction(gameScript, "ConfirmRestart");

  assert.match(boot, /history\.scrollRestoration\s*=\s*["']manual["']/);
  assert.match(enterGame, /window\.scrollTo\(\s*0\s*,\s*0\s*\)/);
  assert.match(enterGame, /FocusWithoutScroll\(\s*ui\.mapCanvas\s*\)/);
  assert.match(closeModal, /lastFocusElement\.isConnected/);
  assert.match(closeModal, /fallbackFocusTarget[\s\S]*ui\.menuButton/);
  assert.match(confirmRestart, /FocusWithoutScroll\(\s*ui\.menuButton\s*\)/);
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

console.log(`\nEnemyRear1941 mobile smoke: ${passed}/${tests.length} passed`);

if (failures.length > 0) {
  process.exitCode = 1;
}
