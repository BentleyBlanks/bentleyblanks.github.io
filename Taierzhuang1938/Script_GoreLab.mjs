// 断肢测试场的左上角面板（?gore=1）。DOM 与事件纪律照 Script_MeleeLab：
//   · mousedown / mouseup / keydown / keyup 一律 stopPropagation —— 不然面板上的
//     按钮会把左键与 F 吞掉，或者反过来漏进游戏；
//   · Alt 交还给 Script_Main（它负责放开指针锁让鼠标点面板，松手再收回去）；
//   · Escape 不拦（暂停菜单永远打得开）。
// 每一句都走 `T("range.gore.…")`（表在 Data_Text_Range.mjs），代码里不写玩家可见的中文。
import { T, HasText } from "./Script_Text.mjs";
import { GORE_LIMB_BUTTONS, GORE_SLOW_MOTION } from "./Data_GoreRange.mjs";

/** 肢体名按 id 拼键（DYNAMIC_PREFIXES 已登记）；没登记的原样显示 id，不静默空白。 */
const LimbKey = (id) => "range.gore.limb." + id;
const LimbName = (id) => (HasText(LimbKey(id)) ? T(LimbKey(id)) : id);

export class GoreLab {
  constructor(host) {
    this.host = host;
    document.body.classList.add("goreLabActive");
    this.root = document.createElement("section");
    this.root.className = "goreLab";
    this.root.setAttribute("aria-label", T("range.gore.aria"));
    const limbs = GORE_LIMB_BUTTONS
      .map((id) => `<button class="glLimb" data-limb="${id}">${LimbName(id)}</button>`).join("");
    this.root.innerHTML = `<div class="glHeading"><b>${T("range.gore.title")}</b><span>${T("range.gore.subtitle")}</span></div>
      <div class="glButtons"><button class="glForce">${T("range.gore.btnForceOff")}</button><button class="glReset">${T("range.gore.btnReset")}</button></div>
      <div class="glButtons"><button class="glDetonate">${T("range.gore.btnDetonate")}</button><button class="glSlow">${T("range.gore.btnSlowOff", { scale: GORE_SLOW_MOTION })}</button></div>
      <div class="glButtons"><button class="glRandom">${T("range.gore.btnRandom")}</button></div>
      <p class="glLimbLabel">${T("range.gore.limbsLabel")}</p><div class="glLimbs">${limbs}</div>
      <output class="glStatus" aria-live="polite"></output><div class="glMeters"></div><div class="glPosts"></div>
      <p class="glControls">${T("range.gore.controls")}</p>`;
    document.body.append(this.root);

    const Click = (selector, action) => {
      this.root.querySelector(selector).onclick = (event) => {
        action();
        event.currentTarget.blur();
        this.host.Focus?.();
      };
    };
    Click(".glForce", () => this.host.SetForce(this.host.force ? null : "bullet"));
    Click(".glReset", () => this.host.Reset());
    Click(".glDetonate", () => this.host.Detonate());
    Click(".glSlow", () => this.host.SetSlowMotion());
    Click(".glRandom", () => this.host.SeverRandom());
    for (const button of this.root.querySelectorAll(".glLimb")) {
      button.onclick = (event) => {
        this.host.SeverLimb(button.dataset.limb);
        event.currentTarget.blur();
        this.host.Focus?.();
      };
    }
    for (const type of ["mousedown", "mouseup"]) this.root.addEventListener(type, (e) => e.stopPropagation());
    for (const type of ["keydown", "keyup"]) this.root.addEventListener(type, (e) => {
      if (e.code === "AltLeft" || e.code === "AltRight") {
        if (type === "keyup") document.activeElement?.blur();
        return;                       // Alt 归 Script_Main：松手要把相机还给战斗。
      }
      if (e.code !== "Escape") e.stopPropagation();
    });
  }

  Update(state) {
    if (!state) return;
    const Put = (selector, text) => {
      const el = this.root.querySelector(selector);
      if (el && el.textContent !== text) el.textContent = text;
    };
    Put(".glForce", state.force ? T("range.gore.btnForceOn") : T("range.gore.btnForceOff"));
    Put(".glSlow", state.slowMotion ? T("range.gore.btnSlowOn")
      : T("range.gore.btnSlowOff", { scale: state.timeScale === 1 ? GORE_SLOW_MOTION : state.timeScale }));
    Put(".glStatus", !state.ready ? T("range.gore.readWaiting")
      : T("range.gore.readQuality", {
        quality: state.quality ?? "—",
        enabled: state.enabled ? T("range.gore.on") : T("range.gore.off"),
      }));
    Put(".glMeters", [
      T("range.gore.readParts", { live: state.live, max: state.max, caps: state.caps, spurts: state.spurts }),
      T("range.gore.readCalls", { delta: state.drawCalls, ms: state.frameMs.toFixed(1) }),
      T("range.gore.readTarget", {
        target: state.target ? `${state.target.id} · ${state.target.distance.toFixed(1)} m`
          : T("range.gore.readNone"),
      }),
    ].join("\n"));
    const cut = state.posts.filter((post) => post.severed.length);
    Put(".glPosts", cut.length
      ? cut.map((post) => T("range.gore.readSevered", {
        id: post.id, list: post.severed.map(LimbName).join(" "),
      })).join("\n")
      : T("range.gore.readIntact", { count: state.posts.filter((post) => post.alive).length }));
  }

  Dispose() {
    this.root.remove();
    document.body.classList.remove("goreLabActive");
  }
}

export default GoreLab;
