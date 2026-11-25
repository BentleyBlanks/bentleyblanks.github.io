// 断肢测试场左侧面板（?gore=1）与底部演示提示条。
//
// 2026-11-25 迭代：统一采用 .shellImpactLab 面板设计体系（深炭橄榄渐变、象牙字、
// 橄榄细线、黄铜金左强调条、衬线标题、可收起顶栏、直角按钮 + 底部 .mlGuideHud 实时指引条）。
// DOM 契约保持向后兼容：.goreLab / body.goreLabActive / .glLimb[data-limb] /
// .glForce / .glReset / .glDetonate / .glSlow / .glRandom / .glStatus / .glMeters / .glPosts。
// 玩家可见文案全部走 T("range.gore.*")（Data_Text_Range.mjs），本文件零中文可见字面量。

import { T, HasText } from "./Script_Text.mjs";
import { GORE_LIMB_BUTTONS, GORE_SLOW_MOTION, GORE_TIME_SCALES } from "./Data_GoreRange.mjs";

const LimbKey = (id) => "range.gore.limb." + id;
const LimbName = (id) => (HasText(LimbKey(id)) ? T(LimbKey(id)) : id);

function DemoGuideText(demoId) {
  if (demoId === "bladeDecap") return T("range.gore.guideDemoBladeDecap");
  if (demoId === "bladeArm") return T("range.gore.guideDemoBladeArm");
  if (demoId === "blastCrater") return T("range.gore.guideDemoBlast");
  if (demoId === "gunfireBurst") return T("range.gore.guideDemoGunfire");
  if (demoId === "headBurst") return T("range.gore.guideDemoHeadBurst");
  if (demoId === "helmetPop") return T("range.gore.guideDemoHelmet");
  return T("range.gore.guideIdle");
}

export class GoreLab {
  constructor(host) {
    this.host = host;
    this.collapsed = false;
    document.body.classList.add("goreLabActive");

    this.root = document.createElement("section");
    this.root.className = "shellImpactLab goreLab";
    this.root.setAttribute("aria-label", T("range.gore.aria"));

    const limbs = GORE_LIMB_BUTTONS
      .map((id) => `<button class="siBtn glLimb" data-limb="${id}">${LimbName(id)}</button>`).join("");
    const scales = GORE_TIME_SCALES
      .map((s) => `<button class="siBtn glScale" data-scale="${s}">${s}×</button>`).join("");

    this.root.innerHTML = `
      <div class="siHead">
        <b>${T("range.gore.title")}</b>
        <span>${T("range.gore.subtitle")}</span>
        <button class="siCollapse glCollapse" type="button">${T("range.gore.collapse")}</button>
      </div>
      <div class="siBody">
        <h3>${T("range.gore.group.demos")}</h3>
        <div class="glDemoGrid">
          <button class="siBtn siFire glDemo" data-demo="bladeDecap">${T("range.gore.demoBladeDecap")}</button>
          <button class="siBtn siFire glDemo" data-demo="blastCrater">${T("range.gore.demoBlast")}</button>
          <button class="siBtn siFire glDemo" data-demo="gunfireBurst">${T("range.gore.demoGunfire")}</button>
          <button class="siBtn glDemo" data-demo="bladeArm">${T("range.gore.demoBladeArm")}</button>
          <button class="siBtn glDemo" data-demo="headBurst">${T("range.gore.demoHeadBurst")}</button>
          <button class="siBtn glDemo" data-demo="helmetPop">${T("range.gore.demoHelmet")}</button>
        </div>

        <h3>${T("range.gore.group.weapons")}</h3>
        <div class="siButtons">
          <button class="siBtn glWeapon" data-weapon="HanYang">${T("range.gore.weaponRifle")}</button>
          <button class="siBtn glWeapon" data-weapon="Zb26">${T("range.gore.weaponLmg")}</button>
          <button class="siBtn glWeapon" data-weapon="Dadao">${T("range.gore.weaponBlade")}</button>
          <button class="siBtn glWeapon" data-weapon="Grenade">${T("range.gore.weaponGrenade")}</button>
        </div>
        <button class="siSwitch glForce" role="switch" aria-checked="false">${T("range.gore.btnForceOff")}</button>
        <button class="siSwitch glModel" role="switch" aria-checked="true">${T("range.gore.btnModelCut")}</button>
        <div class="siButtons">
          <button class="siBtn glDetonate">${T("range.gore.btnDetonate")}</button>
          <button class="siBtn glReset">${T("range.gore.btnReset")}</button>
        </div>

        <h3>${T("range.gore.group.view")}</h3>
        <div class="siButtons">
          <button class="siBtn glSlow">${T("range.gore.btnSlowOff", { scale: GORE_SLOW_MOTION })}</button>
          <button class="siBtn glPause">${T("range.gore.btnPause")}</button>
          <button class="siBtn glStep">${T("range.gore.btnStep")}</button>
        </div>
        <div class="siButtons">${scales}</div>
        <div class="siButtons">
          <button class="siBtn glCamMode" data-cam="player">${T("range.gore.camFirst")}</button>
          <button class="siBtn glCamMode" data-cam="free">${T("range.gore.camFree")}</button>
        </div>
        <div class="siButtons">
          <button class="siBtn glCamPreset" data-preset="bladeClose">${T("range.gore.camBlade")}</button>
          <button class="siBtn glCamPreset" data-preset="craterClose">${T("range.gore.camCrater")}</button>
          <button class="siBtn glCamPreset" data-preset="lineClose">${T("range.gore.camLine")}</button>
        </div>

        <h3>${T("range.gore.group.limbs")}</h3>
        <div class="glLimbs">${limbs}</div>
        <div class="siButtons">
          <button class="siBtn glRandom">${T("range.gore.btnRandom")}</button>
        </div>

        <h3>${T("range.gore.group.readout")}</h3>
        <output class="glStatus" aria-live="polite"></output>
        <div class="siRead glMeters"></div>
        <div class="glPosts"></div>
        <p class="glControls">${T("range.gore.controls")}</p>
      </div>`;
    document.body.append(this.root);

    // 底部实时演示说明栏（复用 .mlGuideHud 风格，不遮准星与主体）
    this.guide = document.createElement("aside");
    this.guide.className = "mlGuideHud";
    this.guide.innerHTML = `<div class="mlGuideTop"><span class="mlGuideMode glGuideTag"></span><span class="mlGuideMeta glGuideMeta"></span></div><div class="mlGuideStep glGuideStep"></div>`;
    document.body.append(this.guide);

    const Bind = (selector, action, keepCursor = false) => {
      const el = this.root.querySelector(selector);
      if (!el) return;
      el.onclick = (event) => {
        action(event.currentTarget);
        event.currentTarget.blur();
        if (!keepCursor && this.host.cameraMode !== "free") this.host.Focus?.();
      };
    };

    Bind(".glCollapse", (btn) => {
      this.collapsed = !this.collapsed;
      this.root.classList.toggle("collapsed", this.collapsed);
      btn.textContent = this.collapsed ? T("range.gore.expand") : T("range.gore.collapse");
    }, true);

    Bind(".glForce", () => this.host.SetForce(this.host.force ? null : "bullet"), true);
    Bind(".glModel", () => this.host.SetCutModel(!this.host.useCutModel), true);
    Bind(".glReset", () => this.host.Reset(), true);
    Bind(".glDetonate", () => this.host.Detonate(), true);
    Bind(".glSlow", () => this.host.SetSlowMotion(), true);
    Bind(".glPause", () => this.host.SetPaused(!this.host.paused), true);
    Bind(".glStep", () => this.host.StepFrame(), true);
    Bind(".glRandom", () => this.host.SeverRandom(), true);

    for (const button of this.root.querySelectorAll(".glDemo")) {
      button.onclick = (event) => {
        this.host.PlayDemo(button.dataset.demo);
        event.currentTarget.blur();
      };
    }
    for (const button of this.root.querySelectorAll(".glWeapon")) {
      button.onclick = (event) => {
        this.host.EquipWeapon(button.dataset.weapon);
        event.currentTarget.blur();
        if (this.host.cameraMode !== "free") this.host.Focus?.();
      };
    }
    for (const button of this.root.querySelectorAll(".glScale")) {
      button.onclick = (event) => {
        this.host.SetTimeScale(Number(button.dataset.scale));
        event.currentTarget.blur();
      };
    }
    for (const button of this.root.querySelectorAll(".glCamMode")) {
      button.onclick = (event) => {
        this.host.SetCameraMode(button.dataset.cam);
        event.currentTarget.blur();
        if (button.dataset.cam === "player") this.host.Focus?.();
      };
    }
    for (const button of this.root.querySelectorAll(".glCamPreset")) {
      button.onclick = (event) => {
        this.host.FocusPreset(button.dataset.preset);
        event.currentTarget.blur();
      };
    }
    for (const button of this.root.querySelectorAll(".glLimb")) {
      button.onclick = (event) => {
        this.host.SeverLimb(button.dataset.limb);
        event.currentTarget.blur();
      };
    }

    for (const type of ["mousedown", "mouseup"]) this.root.addEventListener(type, (e) => e.stopPropagation());
    for (const type of ["keydown", "keyup"]) this.root.addEventListener(type, (e) => {
      if (e.code === "AltLeft" || e.code === "AltRight") {
        if (type === "keyup") document.activeElement?.blur();
        return;
      }
      if (e.code !== "Escape") e.stopPropagation();
    });
  }

  Update(state) {
    if (!state) return;
    this.root.hidden = !!state.menuOpen;
    if (this.guide) this.guide.hidden = !!state.menuOpen;
    document.body.classList.toggle("goreLabFree", state.cameraMode === "free");
    const Put = (selector, text) => {
      const el = this.root.querySelector(selector);
      if (el && el.textContent !== text) el.textContent = text;
    };

    const forceEl = this.root.querySelector(".glForce");
    if (forceEl) {
      forceEl.setAttribute("aria-checked", state.force ? "true" : "false");
      forceEl.textContent = state.force ? T("range.gore.btnForceOn") : T("range.gore.btnForceOff");
    }
    const modelEl = this.root.querySelector(".glModel");
    if (modelEl) {
      modelEl.setAttribute("aria-checked", state.useCutModel ? "true" : "false");
      modelEl.textContent = state.useCutModel ? T("range.gore.btnModelCut") : T("range.gore.btnModelLegacy");
    }

    Put(".glSlow", state.slowMotion ? T("range.gore.btnSlowOn")
      : T("range.gore.btnSlowOff", { scale: GORE_SLOW_MOTION }));
    this.root.querySelector(".glSlow")?.classList.toggle("active", !!state.slowMotion);

    Put(".glPause", state.paused ? T("range.gore.btnResume") : T("range.gore.btnPause"));
    this.root.querySelector(".glPause")?.classList.toggle("active", !!state.paused);

    for (const el of this.root.querySelectorAll(".glScale")) {
      el.classList.toggle("active", !state.paused && Math.abs(Number(el.dataset.scale) - state.timeScale) < 1e-3);
    }
    for (const el of this.root.querySelectorAll(".glCamMode")) {
      el.classList.toggle("active", el.dataset.cam === state.cameraMode);
    }
    for (const el of this.root.querySelectorAll(".glCamPreset")) {
      el.classList.toggle("active", state.cameraMode === "free" && el.dataset.preset === state.cameraPreset);
    }
    for (const el of this.root.querySelectorAll(".glDemo")) {
      el.classList.toggle("active", el.dataset.demo === state.activeDemo);
    }
    for (const el of this.root.querySelectorAll(".glWeapon")) {
      el.classList.toggle("active", el.dataset.weapon === state.activeWeapon);
    }

    const modelTag = state.useCutModel ? T("range.gore.modelTagCut") : T("range.gore.modelTagLegacy");
    Put(".glStatus", !state.ready ? T("range.gore.readWaiting")
      : T("range.gore.readQuality", {
        quality: state.quality ?? "—",
        enabled: state.enabled ? T("range.gore.on") : T("range.gore.off"),
        model: modelTag,
      }));
    Put(".glMeters", [
      T("range.gore.readParts", {
        live: state.live, max: state.max, caps: state.caps,
        helmets: state.helmets ?? 0, gibs: state.gibs ?? 0, spurts: state.spurts,
      }),
      T("range.gore.readCalls", {
        delta: state.drawCalls, ms: state.frameMs.toFixed(1),
        scale: state.paused ? "0" : String(state.timeScale),
      }),
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
      : T("range.gore.readIntact", {
        count: state.posts.filter((post) => post.alive).length,
        pbr: state.pbrCapsReady ? T("range.gore.on") : T("range.gore.off"),
      }));

    if (this.guide) {
      const tag = state.activeDemo ? T("range.gore.guideTagDemo")
        : state.cameraMode === "free" ? T("range.gore.guideTagFree")
          : T("range.gore.guideTagFirst");
      const meta = `${modelTag} · ${state.paused ? "0×" : state.timeScale + "×"}`;
      const tagEl = this.guide.querySelector(".glGuideTag");
      const metaEl = this.guide.querySelector(".glGuideMeta");
      const stepEl = this.guide.querySelector(".glGuideStep");
      if (tagEl && tagEl.textContent !== tag) tagEl.textContent = tag;
      if (metaEl && metaEl.textContent !== meta) metaEl.textContent = meta;
      const stepText = DemoGuideText(state.activeDemo);
      if (stepEl && stepEl.textContent !== stepText) stepEl.textContent = stepText;
      this.guide.classList.toggle("active", !!state.activeDemo);
    }
  }

  Dispose() {
    this.root.remove();
    this.guide?.remove();
    document.body.classList.remove("goreLabActive", "goreLabFree");
  }
}

export default GoreLab;
