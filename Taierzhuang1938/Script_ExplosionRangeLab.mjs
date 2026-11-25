// 爆炸测试场的左侧控制面板（?explosions=1）。DOM 与事件纪律沿用 Script_ShellImpactLab / Script_MeleeLab：
//   · mousedown / mouseup / keydown / keyup 一律 stopPropagation，不让面板点击漏成开火/投弹；
//   · Alt 交还 Script_Main（按住释放指针锁点面板，松手回到游戏）；Escape 不拦（随时开暂停菜单）；
//   · 所有玩家可见文字走 T("range.explosion.…")（表在 Data_Text_Range.mjs），零硬编码中文。
import { T } from "./Script_Text.mjs";
import { TIMED_GRENADE } from "./Data_TimedGrenade.mjs";
import {
  EXPLOSION_VEHICLES, EXPLOSION_ENEMY_DISTANCES, EXPLOSION_ENEMY_MODES,
} from "./Data_ExplosionRange.mjs";

const EnemyModeLabel = (mode) => (
  mode === "evadeFire" ? T("range.explosion.enemyModeFire")
    : mode === "static" ? T("range.explosion.enemyModeStatic")
      : T("range.explosion.enemyModeHold")
);

export class ExplosionRangeLab {
  constructor(host) {
    this.host = host;
    document.body.classList.add("shellImpactActive", "explosionLabActive");
    this.root = document.createElement("section");
    this.root.className = "shellImpactLab explosionLab";
    this.root.setAttribute("aria-label", T("range.explosion.aria"));

    const fuseButtons = TIMED_GRENADE.fuseOptionsS.map((s) =>
      `<button type="button" class="siBtn exFuse" data-fuse="${s}">${T("range.explosion.fuseSec", { s: s.toFixed(1) })}</button>`
    ).join("");
    const modeButtons = EXPLOSION_ENEMY_MODES.map((m) =>
      `<button type="button" class="siBtn exEnemyMode" data-mode="${m}">${EnemyModeLabel(m)}</button>`
    ).join("");
    const distButtons = EXPLOSION_ENEMY_DISTANCES.map((m) =>
      `<button type="button" class="siBtn exEnemyDist" data-dist="${m}">${T("range.explosion.distM", { m })}</button>`
    ).join("");
    const vehicleButtons = `<button type="button" class="siBtn exVehicle" data-vehicle="">${T("range.explosion.vehNone")}</button>`
      + EXPLOSION_VEHICLES.map((v) =>
        `<button type="button" class="siBtn exVehicle" data-vehicle="${v.id}">${v.name}</button>`
      ).join("");

    this.root.innerHTML = `
      <div class="siHead">
        <b>${T("range.explosion.title")}</b>
        <span>${T("range.explosion.subtitle")}</span>
        <button type="button" class="siCollapse" aria-expanded="true">${T("range.explosion.collapse")}</button>
      </div>
      <div class="siBody">
        <h3>${T("range.explosion.group.timed")}</h3>
        <div class="siButtons siWrap exLoadouts">
          <button type="button" class="siBtn exLoadout" data-loadout="timed">${T("range.explosion.loadoutTimed")}</button>
          <button type="button" class="siBtn exLoadout" data-loadout="grenade">${T("range.explosion.loadoutGrenade")}</button>
          <button type="button" class="siBtn exLoadout" data-loadout="bundle">${T("range.explosion.loadoutBundle")}</button>
          <button type="button" class="siBtn exLoadout" data-loadout="rifle">${T("range.explosion.loadoutRifle")}</button>
        </div>
        <p class="siLabel">${T("range.explosion.fuseLabel")}</p>
        <div class="siButtons">${fuseButtons}</div>
        <button type="button" class="siSwitch exTimer" role="switch" aria-checked="true">${T("range.explosion.switchTimer")}</button>
        <button type="button" class="siSwitch exOvercook" role="switch" aria-checked="true">${T("range.explosion.switchOvercook")}</button>
        <div class="siRead exControls">${T("range.explosion.controlsText")}</div>

        <h3>${T("range.explosion.group.targets")}</h3>
        <div class="siButtons">
          <button type="button" class="siBtn siFire exSpawnEnemies">${T("range.explosion.btnSpawnEnemies")}</button>
          <button type="button" class="siBtn exClearEnemies">${T("range.explosion.btnClearEnemies")}</button>
        </div>
        <p class="siLabel">${T("range.explosion.enemyModeLabel")}</p>
        <div class="siButtons">${modeButtons}</div>
        <p class="siLabel">${T("range.explosion.enemyDistLabel")}</p>
        <div class="siButtons">${distButtons}</div>
        <button type="button" class="siSwitch exCover" role="switch" aria-checked="false">${T("range.explosion.switchCover")}</button>
        <button type="button" class="siSwitch exPatrol" role="switch" aria-checked="false">${T("range.explosion.switchPatrol")}</button>

        <h3>${T("range.explosion.group.heavy")}</h3>
        <p class="siLabel">${T("range.explosion.vehicleLabelPanel")}</p>
        <div class="siButtons siWrap exVehicles">${vehicleButtons}</div>
        <div class="siButtons">
          <button type="button" class="siBtn exFireVehicle">${T("range.explosion.btnFireVehicle")}</button>
          <button type="button" class="siBtn exReturn">${T("range.explosion.btnReturn")}</button>
        </div>
        <div class="siButtons">
          <button type="button" class="siBtn exBarrage">${T("range.explosion.btnBarrage")}</button>
          <button type="button" class="siBtn exAirstrike">${T("range.explosion.btnAirstrike")}</button>
        </div>
        <div class="siButtons">
          <button type="button" class="siBtn exRefill">${T("range.explosion.btnRefill")}</button>
          <button type="button" class="siBtn exReset">${T("range.explosion.btnReset")}</button>
        </div>

        <h3>${T("range.explosion.group.readout")}</h3>
        <div class="siRead exRead"></div>
      </div>`;
    document.body.append(this.root);

    const Click = (selector, action) => {
      for (const el of this.root.querySelectorAll(selector)) {
        el.onclick = (event) => {
          action(el);
          event.currentTarget.blur();
          this.host.host?.Focus?.();
        };
      }
    };

    Click(".exLoadout", (el) => this.host.SelectLoadout(el.dataset.loadout));
    Click(".exFuse", (el) => this.host.SetFuseDuration(Number(el.dataset.fuse)));
    Click(".exTimer", () => this.host.SetShowTimer());
    Click(".exOvercook", () => this.host.SetOvercookExplodes());
    Click(".exSpawnEnemies", () => this.host.SpawnEnemies());
    Click(".exClearEnemies", () => this.host.ClearEnemies());
    Click(".exEnemyMode", (el) => this.host.SetEnemyMode(el.dataset.mode));
    Click(".exEnemyDist", (el) => this.host.SetEnemyDistance(Number(el.dataset.dist)));
    Click(".exCover", () => this.host.SetCoverWall());
    Click(".exPatrol", () => this.host.SetPatrols());
    Click(".exVehicle", (el) => this.host.SetVehicle(el.dataset.vehicle || null));
    Click(".exFireVehicle", () => this.host.FireVehicle());
    Click(".exReturn", () => this.host.ThrowPracticeGrenade());
    Click(".exBarrage", () => this.host.StartBarrage());
    Click(".exAirstrike", () => this.host.StartAirstrike());
    Click(".exRefill", () => this.host.RefillThrowables());
    Click(".exReset", () => this.host.Reset());

    this.root.querySelector(".siCollapse").onclick = (event) => {
      const collapsed = this.root.classList.toggle("collapsed");
      event.currentTarget.setAttribute("aria-expanded", String(!collapsed));
      event.currentTarget.textContent = collapsed ? T("range.explosion.expand") : T("range.explosion.collapse");
      event.currentTarget.blur();
    };

    for (const type of ["mousedown", "mouseup"]) this.root.addEventListener(type, (e) => e.stopPropagation());
    for (const type of ["keydown", "keyup"]) this.root.addEventListener(type, (e) => {
      if (e.code === "AltLeft" || e.code === "AltRight") {
        if (type === "keyup") document.activeElement?.blur();
        return; // Alt 归 Script_Main 释放/收回指针锁
      }
      if (e.code !== "Escape") e.stopPropagation();
    });
  }

  Put(sel, text) {
    const el = typeof sel === "string" ? this.root.querySelector(sel) : sel;
    if (el && el.textContent !== text) el.textContent = text;
  }

  Flag(el, name, on) {
    if (el && el.classList.contains(name) !== !!on) el.classList.toggle(name, !!on);
  }

  Attr(el, name, val) {
    if (el && el.getAttribute(name) !== String(val)) el.setAttribute(name, String(val));
  }

  Update(state) {
    if (!state || !this.root) return;
    this.root.hidden = !!state.menu;

    for (const btn of this.root.querySelectorAll(".exLoadout")) {
      this.Flag(btn, "active", btn.dataset.loadout === state.activeLoadout);
    }
    for (const btn of this.root.querySelectorAll(".exFuse")) {
      this.Flag(btn, "active", Math.abs(Number(btn.dataset.fuse) - state.timed.fuseDurationS) < 0.05);
    }
    this.Attr(this.root.querySelector(".exTimer"), "aria-checked", state.timed.showTimer);
    this.Attr(this.root.querySelector(".exOvercook"), "aria-checked", state.timed.overcookExplodes);

    for (const btn of this.root.querySelectorAll(".exEnemyMode")) {
      this.Flag(btn, "active", btn.dataset.mode === state.enemyMode);
    }
    for (const btn of this.root.querySelectorAll(".exEnemyDist")) {
      this.Flag(btn, "active", Number(btn.dataset.dist) === state.enemyDistanceM);
    }
    this.Attr(this.root.querySelector(".exCover"), "aria-checked", state.coverWall);
    this.Attr(this.root.querySelector(".exPatrol"), "aria-checked", state.patrolsEnabled);

    for (const btn of this.root.querySelectorAll(".exVehicle")) {
      this.Flag(btn, "active", (btn.dataset.vehicle || null) === (state.activeVehicle || null));
    }

    const fireVehBtn = this.root.querySelector(".exFireVehicle");
    if (fireVehBtn) fireVehBtn.disabled = !state.activeVehicle;

    const barrageBtn = this.root.querySelector(".exBarrage");
    this.Flag(barrageBtn, "active", !!state.barrage);
    this.Put(barrageBtn, state.barrage ? T("range.explosion.barrageBusy") : T("range.explosion.btnBarrage"));

    const airBtn = this.root.querySelector(".exAirstrike");
    this.Flag(airBtn, "active", !!state.airstrike);
    this.Put(airBtn, state.airstrike ? T("range.explosion.airstrikeBusy") : T("range.explosion.btnAirstrike"));

    const t = state.timed;
    const statusText = !t.active ? T("range.explosion.readStowed")
      : t.state === "pulling" ? T("range.explosion.readPulling")
        : t.state === "cooking" ? T("range.explosion.readCooking", {
          cook: t.cookTimeS.toFixed(1), rem: t.remainingFuseS.toFixed(1),
        })
          : t.state === "throwing" ? T("range.explosion.readThrowing")
            : T("range.explosion.readReady", { fuse: t.fuseDurationS.toFixed(1) });

    const lines = [statusText];
    if (t.lastThrow) {
      const lt = t.lastThrow;
      if (lt.overcooked) {
        lines.push(T("range.explosion.readLastOvercook", { cook: lt.cookTimeS.toFixed(1) }));
      } else {
        const mode = lt.airburst
          ? T("range.explosion.readAirburst", { h: lt.detonateHeightM.toFixed(1) })
          : T("range.explosion.readGround");
        lines.push(T("range.explosion.readLastThrow", {
          cook: lt.cookTimeS.toFixed(1), rem: lt.releaseFuseS.toFixed(2), mode,
        }));
      }
    }
    const er = state.enemyReport;
    lines.push(T("range.explosion.readEnemies", {
      killed: er.killed, evaded: er.evaded, alive: er.alive,
    }));
    lines.push(T("range.explosion.readWorld", {
      craters: state.terrain?.impacts ?? 0,
      shells: state.shells?.length ?? 0,
      airbursts: t.airbursts,
    }));
    this.Put(".exRead", lines.join("\n"));
  }

  Dispose() {
    this.root?.remove();
    this.root = null;
    document.body.classList.remove("shellImpactActive", "explosionLabActive");
  }
}

export default ExplosionRangeLab;
