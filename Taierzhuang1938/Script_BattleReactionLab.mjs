// 人物战场反应测试场的左侧面板（?reactions=1）。DOM 与事件纪律照 Script_ShellImpactLab：
//   · mousedown / mouseup / keydown / keyup 一律 stopPropagation（面板按钮不吞左键与 F，也不漏进游戏）；
//   · Alt 交还给 Script_Main（放开指针锁让鼠标点面板，松手再收回去）；Escape 不拦（暂停菜单永远打得开）。
// 样式沿用炮击扬尘测试场那一套（.shellImpactLab：设置页口径），这里只补方位九宫格与距离一排（.battleReactionLab）。
// 每一句都走 T("battleReaction.…")（Data_Text_BattleReaction.mjs）；弹种名借 shellImpact.munition.<id>。
import { T, HasText } from "./Script_Text.mjs";
import {
  BATTLE_REACTION_MUNITION_SPECS, BATTLE_REACTION_DISTANCES, BATTLE_REACTION_BEARINGS, BATTLE_REACTION_STANDS,
  BATTLE_REACTION_BARRAGE, BATTLE_REACTION_TIME_SCALES,
} from "./Data_BattleReactionRange.mjs";

const Name = (key, id) => (HasText(key) ? T(key) : id);
const MunitionName = (id) => Name(`shellImpact.munition.${id}`, id);
const Kg = (value) => String(+value.toFixed(3));
const Fix = (value, digits = 2) => (Number.isFinite(value) ? value.toFixed(digits) : "—");

export class BattleReactionLab {
  constructor(host) {
    this.host = host;
    document.body.classList.add("shellImpactActive");
    this.root = document.createElement("section");
    this.root.className = "shellImpactLab battleReactionLab";
    this.root.setAttribute("aria-label", T("battleReaction.aria"));
    const munitionRows = BATTLE_REACTION_MUNITION_SPECS.map((spec) => `<button type="button" class="siRow brMunition" data-munition="${spec.id}">
        <span class="siName">${MunitionName(spec.id)}</span>
        <span class="siMeta">${T("battleReaction.munition.charge", { kg: Kg(spec.fillingKg) })}</span></button>`).join("");
    const distanceButtons = BATTLE_REACTION_DISTANCES.map((m) => `<button type="button" class="siBtn brDistance" data-m="${m}">${T("battleReaction.distance.m", { m })}</button>`).join("");
    const bearingButtons = BATTLE_REACTION_BEARINGS.map((entry) => `<button type="button" class="siBtn brBearing" data-bearing="${entry.id}">${Name(`battleReaction.bearing.${entry.id}`, entry.id)}</button>`).join("");
    const standButtons = BATTLE_REACTION_STANDS.map((stand) => `<button type="button" class="siBtn brStand" data-stand="${stand.id}">${Name(`battleReaction.stand.${stand.id}`, stand.id)}</button>`).join("");
    const scaleButtons = BATTLE_REACTION_TIME_SCALES.map((scale) => `<button type="button" class="siBtn brScale" data-scale="${scale}">${T("battleReaction.time.scale", { scale })}</button>`).join("");
    this.root.innerHTML = `
      <div class="siHead"><b>${T("battleReaction.title")}</b><span>${T("battleReaction.subtitle")}</span>
        <button type="button" class="siCollapse" aria-expanded="true">${T("battleReaction.collapse")}</button></div>
      <div class="siBody">
        <h3>${T("battleReaction.group.munition")}</h3><div class="siList">${munitionRows}</div>
        <h3>${T("battleReaction.group.distance")}</h3><div class="siButtons siWrap brDistances">${distanceButtons}</div>
        <h3>${T("battleReaction.group.bearing")}</h3><div class="brCompass">${bearingButtons}</div>
        <h3>${T("battleReaction.group.fire")}</h3>
        <div class="siButtons"><button type="button" class="siBtn siFire brFire">${T("battleReaction.fire.single")}</button>
          <button type="button" class="siBtn brBarrage">${T("battleReaction.fire.barrage", { count: BATTLE_REACTION_BARRAGE.count })}</button>
          <button type="button" class="siBtn brClear">${T("battleReaction.fire.clear")}</button></div>
        <h3>${T("battleReaction.group.stand")}</h3><div class="siButtons">${standButtons}</div>
        <h3>${T("battleReaction.group.switch")}</h3>
        <button type="button" class="siSwitch brReaction" role="switch" aria-checked="true">${T("battleReaction.switch.reaction")}</button>
        <div class="siButtons"><button type="button" class="siBtn brEar" data-ear="trauma">${T("battleReaction.switch.earNew")}</button>
          <button type="button" class="siBtn brEar" data-ear="legacy">${T("battleReaction.switch.earOld")}</button></div>
        <div class="siButtons"><button type="button" class="siBtn brDust" data-dust="new">${T("battleReaction.switch.dustNew")}</button>
          <button type="button" class="siBtn brDust" data-dust="old">${T("battleReaction.switch.dustOld")}</button></div>
        <button type="button" class="siSwitch brMarker" role="switch" aria-checked="true">${T("battleReaction.switch.marker")}</button>
        <h3>${T("battleReaction.group.time")}</h3><div class="siButtons">${scaleButtons}</div>
        <p class="siHint">${T("battleReaction.hint")}</p>
        <h3>${T("battleReaction.group.readout")}</h3>
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
    Click(".brMunition", (el) => this.host.SetMunition(el.dataset.munition));
    Click(".brDistance", (el) => this.host.SetDistance(Number(el.dataset.m)));
    Click(".brBearing", (el) => this.host.SetBearing(el.dataset.bearing));
    Click(".brFire", () => this.host.Fire());
    Click(".brBarrage", () => this.host.Barrage());
    Click(".brClear", () => this.host.Clear());
    Click(".brStand", (el) => this.host.Stand(el.dataset.stand));
    Click(".brReaction", () => this.host.SetReaction());
    Click(".brEar", (el) => this.host.SetEarModel(el.dataset.ear));
    Click(".brDust", (el) => { this.host.impact.SetDust(el.dataset.dust === "new"); this.host.Paint(); });
    Click(".brMarker", () => { this.host.impact.ShowMarker(); this.host.UpdateMarker(); this.host.Paint(); });
    Click(".brScale", (el) => this.host.SetTimeScale(Number(el.dataset.scale)));
    this.root.querySelector(".siCollapse").onclick = (event) => {
      const collapsed = this.root.classList.toggle("collapsed");
      event.currentTarget.setAttribute("aria-expanded", String(!collapsed));
      event.currentTarget.textContent = collapsed ? T("battleReaction.expand") : T("battleReaction.collapse");
      event.currentTarget.blur();
    };
    for (const type of ["mousedown", "mouseup"]) this.root.addEventListener(type, (e) => e.stopPropagation());
    for (const type of ["keydown", "keyup"]) this.root.addEventListener(type, (e) => {
      if (e.code === "AltLeft" || e.code === "AltRight") {
        if (type === "keyup") document.activeElement?.blur();
        return;                       // Alt 归 Script_Main：松手要把指针还给游戏。
      }
      if (e.code !== "Escape") e.stopPropagation();
    });
  }

  /** 只在文字 / 属性变了才写 DOM（面板 10 Hz 重画，不能每次都动布局）。 */
  Put(element, text) { if (element && element.textContent !== text) element.textContent = text; }
  Flag(element, name, on) { if (element && element.classList.contains(name) !== !!on) element.classList.toggle(name, !!on); }
  Attr(element, name, value) { if (element && element.getAttribute(name) !== String(value)) element.setAttribute(name, String(value)); }

  Update(state) {
    if (!state || !this.root) return;
    const root = this.root;
    root.classList.toggle("hiddenPanel", !state.panel);
    for (const row of root.querySelectorAll(".brMunition")) {
      const on = row.dataset.munition === state.munition;
      this.Flag(row, "selected", on); this.Attr(row, "aria-pressed", on);
    }
    for (const button of root.querySelectorAll(".brDistance")) this.Flag(button, "active", Number(button.dataset.m) === state.distanceM);
    for (const button of root.querySelectorAll(".brBearing")) this.Flag(button, "active", button.dataset.bearing === state.bearing);
    for (const button of root.querySelectorAll(".brStand")) this.Flag(button, "active", button.dataset.stand === state.stand);
    for (const button of root.querySelectorAll(".brEar")) this.Flag(button, "active", button.dataset.ear === state.earModel);
    for (const button of root.querySelectorAll(".brDust")) this.Flag(button, "active", (button.dataset.dust === "new") === state.dust);
    for (const button of root.querySelectorAll(".brScale")) this.Flag(button, "active", Number(button.dataset.scale) === state.timeScale);
    this.Attr(root.querySelector(".brReaction"), "aria-checked", state.reaction);
    this.Attr(root.querySelector(".brMarker"), "aria-checked", state.marker);
    this.Put(root.querySelector(".siRead"), this.Lines(state).join("\n"));
  }

  Lines(state) {
    const lines = [];
    const last = state.last;
    if (!last) lines.push(T("battleReaction.read.idle"));
    else {
      const side = Number.isFinite(last.bearingDeg)
        ? `${last.bearingDeg > 0 ? "+" : ""}${Math.round(last.bearingDeg)}°` : "—";
      lines.push(T("battleReaction.read.last", { name: MunitionName(last.munition), m: last.distanceM, side }));
      const e = last.exposure;
      if (!e) lines.push(T("battleReaction.read.pending"));
      else {
        lines.push(T("battleReaction.read.pressure", { kpa: Fix(e.kPa, 1), db: Fix(e.db, 0), left: Fix(e.dbLeft, 0), right: Fix(e.dbRight, 0),
          cover: e.occluded ? T("battleReaction.read.cover") : T("battleReaction.read.open") }));
        lines.push(T("battleReaction.read.strength", { blink: Fix(e.blink), flinch: Fix(e.flinch), squeeze: Fix(e.squeeze), daze: Fix(e.daze), tremor: Fix(e.tremor) }));
        lines.push(T("battleReaction.read.tinnitus", { left: Fix(e.tinnitusLeft), right: Fix(e.tinnitusRight) }));
      }
      const p = state.peak;
      if (!state.reaction) lines.push(T("battleReaction.read.off"));
      else if (p) lines.push(T("battleReaction.read.peak", { yaw: Fix(p.yaw, 0), pitch: Fix(p.pitch, 0), roll: Fix(p.roll, 0), drop: Fix(p.drop, 0), eye: Fix(p.eye * 100, 0) }));
    }
    const f = state.flinch;
    if (f && state.reaction) {
      lines.push(T("battleReaction.read.now", { eye: Fix(f.eyeClosure * 100, 0), bpm: f.heartBpm > 0 ? Fix(f.heartBpm, 0) : "—", breath: Fix(f.breathless, 1) }));
    }
    const ears = state.ears;
    if (ears?.installed) {
      for (const [side, ear] of [[T("battleReaction.read.earLeft"), ears.left], [T("battleReaction.read.earRight"), ears.right]]) {
        lines.push(T("battleReaction.read.ear", { side, hz: Fix(Math.min(ear.lowHz ?? 20000, 20000), 0), db: Fix(ear.gainDb, 1), ring: Fix(ear.ring * 1000, 1) }));
      }
    } else lines.push(ears?.model === "trauma" ? T("battleReaction.read.earPending") : T("battleReaction.read.earOff"));
    lines.push(T("battleReaction.read.flight", { count: state.flying, queued: state.queued, scale: state.timeScale }));
    return lines;
  }

  Dispose() {
    this.root?.remove();
    this.root = null;
    document.body.classList.remove("shellImpactActive");
  }
}

export default BattleReactionLab;
