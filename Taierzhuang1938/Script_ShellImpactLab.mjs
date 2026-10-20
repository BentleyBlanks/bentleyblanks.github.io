// 炮击扬尘测试场的左侧面板（?impacts=1）。DOM 与事件纪律照 Script_GoreLab / Script_MeleeLab：
//   · mousedown / mouseup / keydown / keyup 一律 stopPropagation —— 不然面板上的按钮会把左键与 F 吞掉，或者反过来漏进游戏；
//   · Alt 交还给 Script_Main（它负责放开指针锁让鼠标点面板，松手再收回去）；
//   · Escape 不拦（暂停菜单永远打得开）。
// 样式取设置页口径（Style_Game.css 里 .shellImpactLab：深色渐变底、象牙字、橄榄细线、金色左边选中条、衬线标题、直角控件）。
// 每一句都走 `T("shellImpact.…")`（表在 Data_Text_ShellImpact.mjs），代码里不写玩家可见的中文。
import { T, HasText } from "./Script_Text.mjs";
import {
  SHELL_IMPACT_TARGETS, SHELL_IMPACT_MUNITIONS, SHELL_IMPACT_CAMERAS, SHELL_IMPACT_BARRAGE, SHELL_IMPACT_TIME_SCALES,
} from "./Data_ShellImpactRange.mjs";

const MunitionKey = (id) => `shellImpact.munition.${id}`;
const TargetKey = (id) => `shellImpact.target.${id}`;
const CameraKey = (id) => `shellImpact.camera.${id}`;
/** 键没登记就退回 id（画面上看得见是哪一个没进表，不静默空白）。 */
const Name = (key, id) => (HasText(key) ? T(key) : id);
const Kg = (value) => String(+value.toFixed(3));

export class ShellImpactLab {
  constructor(host) {
    this.host = host;
    document.body.classList.add("shellImpactActive");
    this.root = document.createElement("section");
    this.root.className = "shellImpactLab";
    this.root.setAttribute("aria-label", T("shellImpact.aria"));
    const munitionRows = SHELL_IMPACT_MUNITIONS.map((spec) => {
      const angle = spec.delivery === "hand" ? T("shellImpact.munition.hand")
        : spec.delivery === "direct" ? T("shellImpact.munition.flat") : T("shellImpact.munition.angle", { deg: spec.angleDeg });
      return `<button type="button" class="siRow siMunition" data-munition="${spec.id}">
        <span class="siName">${Name(MunitionKey(spec.id), spec.id)}</span>
        <span class="siMeta">${T("shellImpact.munition.charge", { kg: Kg(spec.fillingKg) })} · ${angle}</span></button>`;
    }).join("");
    const targetRows = SHELL_IMPACT_TARGETS.map((target) => `<button type="button" class="siRow siTarget" data-target="${target.id}">
        <span class="siName">${Name(TargetKey(target.id), target.id)}</span></button>`).join("");
    const cameraButtons = SHELL_IMPACT_CAMERAS.map((preset) => `<button type="button" class="siBtn siCamera" data-camera="${preset.id}">${Name(CameraKey(preset.id), preset.id)}</button>`).join("")
      + `<button type="button" class="siBtn siCamera" data-camera="player">${T("shellImpact.camera.player")}</button>`;
    const scaleButtons = SHELL_IMPACT_TIME_SCALES.map((scale) => `<button type="button" class="siBtn siScale" data-scale="${scale}">${T("shellImpact.time.scale", { scale })}</button>`).join("");
    this.root.innerHTML = `
      <div class="siHead"><b>${T("shellImpact.title")}</b><span>${T("shellImpact.subtitle")}</span>
        <button type="button" class="siCollapse" aria-expanded="true">${T("shellImpact.collapse")}</button></div>
      <div class="siBody">
        <h3>${T("shellImpact.group.munition")}</h3><div class="siList">${munitionRows}</div>
        <h3>${T("shellImpact.group.target")}</h3><div class="siList siGrid">${targetRows}
          <button type="button" class="siRow siPick"><span class="siName">${T("shellImpact.target.pick")}</span></button></div>
        <output class="siTargetRead" aria-live="polite"></output>
        <h3>${T("shellImpact.group.fire")}</h3>
        <div class="siButtons"><button type="button" class="siBtn siFire">${T("shellImpact.fire.single")}</button>
          <button type="button" class="siBtn siBarrage">${T("shellImpact.fire.barrage", { count: SHELL_IMPACT_BARRAGE.count })}</button>
          <button type="button" class="siBtn siClear">${T("shellImpact.fire.clear")}</button></div>
        <h3>${T("shellImpact.group.time")}</h3>
        <div class="siButtons"><button type="button" class="siBtn siPause">${T("shellImpact.time.pause")}</button>
          <button type="button" class="siBtn siStep">${T("shellImpact.time.step")}</button></div>
        <div class="siButtons">${scaleButtons}</div>
        <button type="button" class="siSwitch siFlightFast" role="switch" aria-checked="true">${T("shellImpact.time.flightFast")}</button>
        <h3>${T("shellImpact.group.camera")}</h3>
        <div class="siButtons siWrap">${cameraButtons}</div>
        <p class="siHint">${T("shellImpact.camera.hint")}</p>
        <h3>${T("shellImpact.group.dust")}</h3>
        <div class="siButtons"><button type="button" class="siBtn siDust" data-dust="new">${T("shellImpact.dust.new")}</button>
          <button type="button" class="siBtn siDust" data-dust="old">${T("shellImpact.dust.old")}</button></div>
        <button type="button" class="siSwitch siMarker" role="switch" aria-checked="true">${T("shellImpact.marker.show")}</button>
        <h3>${T("shellImpact.group.readout")}</h3>
        <div class="siRead"></div>
      </div>`;
    document.body.append(this.root);

    const Click = (selector, action) => {
      for (const element of this.root.querySelectorAll(selector)) {
        element.onclick = (event) => {
          action(element);
          event.currentTarget.blur();
          this.host.host.Focus?.();
        };
      }
    };
    Click(".siMunition", (el) => this.host.SelectMunition(el.dataset.munition));
    Click(".siTarget", (el) => this.host.SetTarget(el.dataset.target));
    Click(".siPick", () => this.host.TogglePick());
    Click(".siFire", () => this.host.Fire());
    Click(".siBarrage", () => this.host.Barrage());
    Click(".siClear", () => this.host.Clear());
    Click(".siPause", () => this.host.Pause());
    Click(".siStep", () => this.host.Step());
    Click(".siScale", (el) => this.host.SetTimeScale(Number(el.dataset.scale)));
    Click(".siFlightFast", () => this.host.SetFlightFast());
    Click(".siCamera", (el) => this.host.Camera(el.dataset.camera));
    Click(".siDust", (el) => this.host.SetDust(el.dataset.dust === "new"));
    Click(".siMarker", () => this.host.ShowMarker());
    this.root.querySelector(".siCollapse").onclick = (event) => {
      const collapsed = this.root.classList.toggle("collapsed");
      event.currentTarget.setAttribute("aria-expanded", String(!collapsed));
      event.currentTarget.textContent = collapsed ? T("shellImpact.expand") : T("shellImpact.collapse");
      event.currentTarget.blur();
    };
    for (const type of ["mousedown", "mouseup"]) this.root.addEventListener(type, (e) => e.stopPropagation());
    for (const type of ["keydown", "keyup"]) this.root.addEventListener(type, (e) => {
      if (e.code === "AltLeft" || e.code === "AltRight") {
        if (type === "keyup") document.activeElement?.blur();
        return;                       // Alt 归 Script_Main：松手要把相机还给游戏。
      }
      if (e.code !== "Escape") e.stopPropagation();
    });
    this.cache = new Map();
  }

  /** 只在文字 / 属性变了才写 DOM（面板 10 Hz 重画，不能每次都动布局）。 */
  Put(element, text) { if (element && element.textContent !== text) element.textContent = text; }
  Flag(element, name, on) { if (element && element.classList.contains(name) !== !!on) element.classList.toggle(name, !!on); }
  Attr(element, name, value) { if (element && element.getAttribute(name) !== String(value)) element.setAttribute(name, String(value)); }

  Update(state) {
    if (!state || !this.root) return;
    const root = this.root;
    document.body.classList.toggle("shellImpactFree", state.camera.mode === "free");
    root.classList.toggle("hiddenPanel", !state.panel);
    for (const row of root.querySelectorAll(".siMunition")) {
      const on = row.dataset.munition === state.munition;
      this.Flag(row, "selected", on); this.Attr(row, "aria-pressed", on);
    }
    for (const row of root.querySelectorAll(".siTarget")) {
      const on = !state.target.picked && row.dataset.target === state.target.id;
      this.Flag(row, "selected", on); this.Attr(row, "aria-pressed", on);
    }
    const pick = root.querySelector(".siPick");
    this.Flag(pick, "selected", state.target.picked || state.picking);
    this.Put(pick.querySelector(".siName"), state.picking ? T("shellImpact.target.picking")
      : state.target.picked ? T("shellImpact.target.picked") : T("shellImpact.target.pick"));
    const targetName = state.target.picked ? T("shellImpact.target.picked") : Name(TargetKey(state.target.id), state.target.id);
    this.Put(root.querySelector(".siTargetRead"), T("shellImpact.target.at", {
      name: targetName, x: state.target.local.x.toFixed(1), z: state.target.local.z.toFixed(1), y: state.target.y.toFixed(2),
    }));
    this.Put(root.querySelector(".siPause"), state.paused ? T("shellImpact.time.resume") : T("shellImpact.time.pause"));
    this.Flag(root.querySelector(".siPause"), "active", state.paused);
    for (const button of root.querySelectorAll(".siScale")) this.Flag(button, "active", !state.paused && Number(button.dataset.scale) === state.timeScale);
    this.Attr(root.querySelector(".siFlightFast"), "aria-checked", state.flightFast);
    this.Attr(root.querySelector(".siMarker"), "aria-checked", state.marker);
    for (const button of root.querySelectorAll(".siCamera")) {
      const on = button.dataset.camera === "player" ? state.camera.mode === "player" : state.camera.mode === "free" && button.dataset.camera === state.camera.preset;
      this.Flag(button, "active", on);
    }
    for (const button of root.querySelectorAll(".siDust")) this.Flag(button, "active", (button.dataset.dust === "new") === state.dust);
    const last = state.last;
    const lines = [
      last ? T("shellImpact.read.last", {
        name: Name(MunitionKey(last.munition), last.munition),
        target: last.targetId ? Name(TargetKey(last.targetId), last.targetId) : T("shellImpact.target.picked"),
        angle: last.angleDeg == null ? "—" : last.angleDeg.toFixed(0), flight: last.flightS.toFixed(1),
      }) : T("shellImpact.read.idle"),
      T("shellImpact.read.flight", { shells: state.shells.length + state.bombs.length, queued: state.queued }),
      T("shellImpact.read.craters", { count: state.craters }),
      T("shellImpact.read.time", { state: state.paused ? T("shellImpact.read.timePaused") : T("shellImpact.read.timeScale", { scale: state.timeScale }) }),
      T("shellImpact.read.camera", { mode: state.camera.mode === "free" ? T("shellImpact.camera.free") : T("shellImpact.camera.playerView") }),
    ];
    this.Put(root.querySelector(".siRead"), lines.join("\n"));
  }

  Dispose() {
    this.root?.remove();
    this.root = null;
    document.body.classList.remove("shellImpactActive", "shellImpactFree");
  }
}

export default ShellImpactLab;
