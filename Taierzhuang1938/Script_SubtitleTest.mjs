// 对话字幕栈的单测 —— 纯 Node，秒级。
//
// 这一层管三件在画面上很容易被"看着差不多"糊过去的事：
//   1. **叠放**：同屏两三条，最新的在最下面，旧的被推上去而不是被顶掉；
//   2. **留白**：数据写 0.6 s 的短句在屏幕上挂得住（按字数算可读下限，再加 hold）；
//   3. **补间**：进退场的位移与透明度由**游戏时钟**算，与墙上时钟、与步进方式无关。
// 第 3 条是出图管线的硬要求：Script_CutsceneShot 一口气 StepFrames 到第 t 秒再截图，
// 换成 CSS transition 就会截出一片透明。这里用一个只记录写入的假 DOM 把它钉住。

import assert from "node:assert/strict";
import {
  SubtitleStack, SUBTITLE_TUNING, SpeakerTone, MinReadSeconds, SUBTITLE_CSS, EnsureSubtitleStyle,
} from "./Script_Subtitle.mjs";
import { MinReadSeconds as CheckMinReadSeconds } from "./Script_CutsceneCheck.mjs";

// --- 可读下限 ---------------------------------------------------------------
assert.equal(MinReadSeconds("不怕！"), 3 * 0.22 + 1.2, "每字 0.22 s + 1.2 s");
assert.equal(MinReadSeconds("不怕！", 9), 9, "数据写得更长时以数据为准");
assert.equal(MinReadSeconds("不 怕 ！"), MinReadSeconds("不怕！"), "空白不计入字数");
assert.equal(CheckMinReadSeconds("不怕！"), MinReadSeconds("不怕！"),
  "自检与运行时共用同一条可读下限，不许两边各写一份系数");

// --- 共用样式不许碰宿主的定位 -----------------------------------------------
// 这份样式是运行时 append 到 head 的，排在 Style_Game.css 之后；`.sbtStack` 与
// `.hudSubtitle` 同为单类选择器，谁在后面谁赢。曾经在这儿写过 position:relative，
// 结果把 `.hudSubtitle` 的 absolute 顶掉，整摞字幕跑到屏幕上沿之外（y=−114）。
assert.ok(!/\.sbtStack\b/.test(SUBTITLE_CSS), "共用样式不给宿主定任何规则");
assert.ok(!/position\s*:\s*(relative|static|fixed)/.test(SUBTITLE_CSS),
  "共用样式里只有条目自己的 position:absolute，不许出现别的定位");

// --- 说话人定色 -------------------------------------------------------------
assert.equal(SpeakerTone("squadLeader"), SpeakerTone("squadLeader"), "同一个人每次同一个色");
assert.notEqual(SpeakerTone("squadLeader"), SpeakerTone("youngDispatch"), "登记过的角色互不撞色");
// 新序章镜 6 是一问一答，这两条一定会同屏叠着 —— 撞色就白叠了
assert.notEqual(SpeakerTone("squadLeader"), SpeakerTone("squad"), "问与答两个声部必须分得开");
assert.match(SpeakerTone("没登记的人"), /^#[0-9a-f]{6}$/, "没登记的角色也落在调色板里");
assert.equal(SpeakerTone("没登记的人"), SpeakerTone("没登记的人"), "兜底也是确定性的，不碰 Math.random");

// --- 纯模型：叠放顺序与排布 --------------------------------------------------
const stack = new SubtitleStack({ rowPx: 30, gapPx: 4 });
stack.Push({ who: "班长", whoId: "squadLeader", text: "去死，怕不怕？", seconds: 0.6 });
stack.Update(1.0);
stack.Push({ who: "众人", whoId: "squad", text: "不怕！", seconds: 0.6 });
stack.Update(0.5);
assert.deepEqual(stack.Lines.map((line) => line.text), ["去死，怕不怕？", "不怕！"], "最旧在前，最新在后");
assert.equal(stack.Lines.at(-1).offset, 0, "最新的一条贴在栈底");
assert.equal(stack.Lines[0].offset, 34, "上一条被推高整整一行（行高 30 + 行距 4）");
assert.equal(stack.Lines[0].tone, SpeakerTone("squadLeader"), "名字的颜色跟着角色走");

// 数据只给了 0.6 s，但屏幕上要挂到「可读下限 + 留白」
const shortLife = MinReadSeconds("不怕！") + SUBTITLE_TUNING.hold;
stack.Update(shortLife - 0.5 - 0.05);
assert.equal(stack.Lines.filter((line) => !line.leaving).length, 1, "0.6 s 的短句还没到期");
stack.Update(0.1);
assert.equal(stack.Lines.filter((line) => !line.leaving).length, 0, "到期后进入退场，而不是当帧消失");
stack.Update(SUBTITLE_TUNING.fadeOut + 0.01);
assert.equal(stack.Lines.length, 0, "退场补间走完才真的摘掉");

// --- 上限：满了要挤掉最旧的一条，且走退场补间 --------------------------------
const capped = new SubtitleStack({ rowPx: 30 });
for (let i = 0; i < SUBTITLE_TUNING.max + 1; i += 1) {
  capped.Push({ who: `甲${i}`, whoId: `who${i}`, text: `第${i}句`, seconds: 6 });
  capped.Update(1 / 60);
}
assert.equal(capped.LiveCount, SUBTITLE_TUNING.max, "活着的不超过上限");
assert.equal(capped.Lines.length, SUBTITLE_TUNING.max + 1, "被挤掉的那条还在，正在淡出");
assert.equal(capped.Lines[0].leaving, true, "挤掉的是最旧的一条");
assert.ok(capped.Lines[0].alpha > 0, "挤掉的那一帧还看得见，不是瞬间消失");

// --- 补间由游戏时钟驱动 ------------------------------------------------------
const timed = new SubtitleStack({});
timed.Push({ who: "班长", whoId: "squadLeader", text: "好样的。", seconds: 3 });
assert.equal(timed.Lines[0].alpha, 0, "刚进场是全透明");
const alphas = [];
for (let i = 0; i < 4; i += 1) { timed.Update(1 / 60); alphas.push(timed.Lines[0].alpha); }
for (let i = 1; i < alphas.length; i += 1) {
  assert.ok(alphas[i] > alphas[i - 1], `进场逐帧变亮：${alphas.join(" → ")}`);
}
assert.ok(alphas.at(-1) < 1, "进场没有一帧到位");
// 同样的步进量，无论分几次推，落点必须一致（出图管线会一口气推很多帧）
const bulk = new SubtitleStack({});
bulk.Push({ who: "班长", whoId: "squadLeader", text: "好样的。", seconds: 3 });
bulk.Update(4 / 60);
assert.equal(bulk.Lines[0].alpha, alphas.at(-1), "一次推四帧与推四次结果相同");

// --- FadeAll / Clear --------------------------------------------------------
const fading = new SubtitleStack({});
fading.Push({ who: "班长", whoId: "squadLeader", text: "前头就是滕县。", seconds: 6 });
fading.Update(0.5);
fading.FadeAll();
assert.equal(fading.Lines[0].leaving, true, "FadeAll 让在场的都开始退场");
fading.Update(SUBTITLE_TUNING.fadeOut + 0.01);
assert.equal(fading.Lines.length, 0, "退完就摘掉");
fading.Push({ who: "班长", whoId: "squadLeader", text: "都把东西带好。", seconds: 6 });
fading.Clear();
assert.equal(fading.Lines.length, 0, "Clear 立刻清空，不留补间");

// --- 有 DOM 时：真的写 transform/opacity，且不写 transition -------------------
// 只实现堆栈用得到的那几个成员。用真 jsdom 会给一个纯 Node 秒级测试拖进几百个包。
class FakeElement {
  constructor(doc, tag) {
    this.ownerDocument = doc;
    this.tagName = tag;
    this.className = "";
    this.innerHTML = "";
    this.style = {};
    this.children = [];
    this.parentNode = null;
    this.offsetHeight = 0;
    this.classList = {
      add: (name) => { if (!this.className.split(" ").includes(name)) this.className = `${this.className} ${name}`.trim(); },
    };
  }
  appendChild(child) { child.parentNode = this; this.children.push(child); return child; }
  removeChild(child) { this.children = this.children.filter((c) => c !== child); child.parentNode = null; return child; }
}
class FakeDocument {
  constructor() { this.head = new FakeElement(this, "head"); this.byId = new Map(); }
  createElement(tag) { return new FakeElement(this, tag); }
  getElementById(id) { return this.byId.get(id) || null; }
}

const doc = new FakeDocument();
const host = new FakeElement(doc, "div");
const domStack = new SubtitleStack({ doc, host, skin: "hud", rowPx: 26 });
assert.ok(host.className.includes("sbtStack"), "宿主挂上堆栈类名");
assert.equal(doc.head.children.length, 1, "样式只装一次");
assert.equal(doc.head.children[0].textContent, SUBTITLE_CSS);
doc.byId.set("subtitleStackStyle", doc.head.children[0]);
EnsureSubtitleStyle(doc);
assert.equal(doc.head.children.length, 1, "重复调用不再装第二份");

domStack.Push({ who: "班长", whoId: "squadLeader", text: "跟紧了。", seconds: 3 });
domStack.Push({ who: "众人", whoId: "squad", text: "晓得！", seconds: 3, variant: "shout" });
domStack.Update(1 / 60);
assert.equal(host.children.length, 2, "两条都进了 DOM");
assert.ok(host.children[0].className.includes("sbtLine") && host.children[0].className.includes("hud"),
  "皮肤类名跟着挂上");
assert.ok(host.children[1].className.includes("shout"), "变体类名落在行上，不在宿主上");
assert.match(host.children[1].innerHTML, /class="sbtWho" style="color:#/, "名字带着这个角色的颜色");
assert.match(host.children[0].style.transform, /^translateY\(-?\d+(\.\d+)?px\)$/, "位移写死成像素，不留 CSS 过渡");
assert.equal(host.children[0].style.transition, undefined, "这一层不许自己写 transition");
assert.ok(Number(host.children[0].style.opacity) > 0, "透明度是当帧算出来的具体值");

// 旁白（没有说话人）不打名字
domStack.Clear();
domStack.Push({ text: "这一天，川军三个师在正面兵力上占优。", seconds: 4 });
assert.ok(host.children[0].className.includes("narr"), "旁白走 narr 皮肤");
assert.ok(!host.children[0].innerHTML.includes("sbtWho"), "旁白不打名字");

// 台词是数据，不是标记
domStack.Clear();
domStack.Push({ who: "<b>班长</b>", whoId: "squadLeader", text: "六颗，<img src=x>一颗都别掉。", seconds: 3 });
assert.ok(!host.children[0].innerHTML.includes("<img"), "文本里的标签被转义");
assert.ok(!host.children[0].innerHTML.includes("<b>"), "名字里的标签被转义");

domStack.Clear();
assert.equal(host.children.length, 0, "清空把 DOM 一并摘干净");

console.log("Subtitle stack tests passed: stacking order, readable floor + hold, cap eviction, "
  + "game-clock tweens, speaker tones, DOM mount/unmount, escaping");
