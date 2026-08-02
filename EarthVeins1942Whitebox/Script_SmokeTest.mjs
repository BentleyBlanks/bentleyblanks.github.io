import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { actorProfiles, campaignData, actorHeightRange, cinematicSequences } from "./Data_WhiteboxCampaign.mjs";

const rootDirectory = dirname(fileURLToPath(import.meta.url));
const [html, css, script] = await Promise.all([
  readFile(join(rootDirectory, "index.html"), "utf8"),
  readFile(join(rootDirectory, "Style_Whitebox.css"), "utf8"),
  readFile(join(rootDirectory, "Script_Whitebox.mjs"), "utf8")
]);

assert.equal(campaignData.length, 7, "序章加六章应为七段流程");
assert.equal(campaignData.filter((chapter) => chapter.number !== "序章").length, 6, "正式章节应为六章");

const actions = campaignData.flatMap((chapter) => chapter.actions);
assert.equal(actions.length, 40, "扩写序章后总计应为四十个互动");
assert.equal(campaignData[0].actions.length, 10, "序章应包含十个完整叙事与玩法节点");
assert.equal(actions.filter((action) => action.puzzle).length, 7, "序章与六个正式章节应各有一个选择谜题");
assert.ok(campaignData[0].actions.some((action) => action.dialogue.includes("往后的形势只会更加困难")), "序章应保留获准使用的核心台词");

const cinematicEntries = Object.entries(cinematicSequences);
const cinematicBeats = cinematicEntries.flatMap(([, beats]) => beats);
const cinematicDuration = cinematicBeats.reduce((sum, beat) => sum + beat.duration, 0);
assert.equal(cinematicEntries.length, 10, "序章应包含十段镜头调度");
assert.equal(cinematicBeats.length, 27, "序章镜头段应包含二十七个节拍");
assert.ok(cinematicDuration >= 60, "镜头总时长应足以承载完整序章节奏");
assert.ok(cinematicSequences[campaignData[0].introCinematic], "序章开场镜头必须存在");
campaignData[0].actions.filter((action) => action.cinematicAfter).forEach((action) => {
  assert.ok(cinematicSequences[action.cinematicAfter], `互动 ${action.id} 引用的镜头段必须存在`);
});

const actorHeights = Object.values(actorProfiles).map((profile) => profile.height);
const minimumHeight = Math.min(...actorHeights);
const maximumHeight = Math.max(...actorHeights);
assert.equal(actorHeightRange.minimum, minimumHeight, "导出最小身高应与角色配置一致");
assert.equal(actorHeightRange.maximum, maximumHeight, "导出最大身高应与角色配置一致");
assert.ok(maximumHeight / minimumHeight <= 1.1, "角色最大与最小身高比不得超过 1.10");

const combinedSource = `${html}\n${css}\n${script}`;
assert.doesNotMatch(combinedSource, /three(?:\.min)?\.js|THREE\./i, "纯 2D 白盒不得引入 Three.js");
assert.doesNotMatch(html, /<(?:img|audio|video|source)\b/i, "页面不得加载图片、音频或视频素材");
assert.doesNotMatch(combinedSource, /https?:\/\//i, "白盒不得加载外部 URL");
assert.doesNotMatch(combinedSource, /\.(?:png|jpe?g|webp|gif|svg|mp3|wav|ogg|mp4|webm)(?:[?"'`)]|$)/i, "白盒不得引用媒体资产");

assert.match(css, /user-select:\s*none/i, "移动控件必须禁止文本选择");
assert.match(css, /touch-action:\s*none/i, "移动控件必须接管触摸手势");
assert.match(css, /-webkit-touch-callout:\s*none/i, "移动控件必须禁止系统长按菜单");
assert.match(script, /setPointerCapture/, "长按移动必须捕获指针");
assert.match(script, /preventDefault/, "触摸事件必须阻止浏览器默认行为");
for (const eventName of ["pointercancel", "lostpointercapture", "selectstart", "contextmenu"]) {
  assert.ok(script.includes(eventName), `缺少 ${eventName} 输入守卫`);
}

const styleVersion = html.match(/Style_Whitebox\.css\?v=([A-Za-z0-9]+)/)?.[1];
const scriptVersion = html.match(/Script_Whitebox\.mjs\?v=([A-Za-z0-9]+)/)?.[1];
assert.ok(styleVersion, "样式表应带缓存版本");
assert.equal(scriptVersion, styleVersion, "样式与脚本缓存版本必须一致");
assert.match(script, /state\.mode = "panel"/, "章节菜单必须暂停游戏状态");
assert.match(script, /CloseNavigationPanel/, "章节菜单必须能恢复来源状态");
assert.match(html, /id="cinematicCaption"/, "页面必须提供电影字幕层");
assert.match(html, /id="skipCinematic"/, "镜头段必须允许跳过");
assert.match(script, /function UpdateCinematic/, "必须实现逐帧镜头调度");
assert.match(script, /cameraZoom/, "镜头系统必须支持变焦");
assert.match(script, /cameraShakeX/, "镜头系统必须支持震动反馈");
assert.match(script, /DrawCinematicForeground/, "镜头系统必须包含前景视差层");
assert.match(script, /DrawCinematicEffects/, "镜头系统必须包含场景化镜头效果");
assert.match(script, /HoldCinematicBeatForQa/, "视觉审查必须能锁定指定镜头节拍");
assert.match(script, /exposureGrace/, "镜头结束后必须提供短暂的暴露保护时间");

console.log(`EarthVeins1942Whitebox smoke test passed: ${campaignData.length} sequences, ${actions.length} actions, ${cinematicBeats.length} cinematic beats (${cinematicDuration.toFixed(1)}s), actor ratio ${(maximumHeight / minimumHeight).toFixed(3)}.`);
