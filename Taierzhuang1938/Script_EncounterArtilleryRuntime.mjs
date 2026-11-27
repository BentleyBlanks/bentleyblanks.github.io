// 第一关 EncounterPlay / 战役 3D 实时北方远距炮击运行时控制器。
// 按节拍时间与玩家推进距离触发真实抛物线炮弹（Combat.FireShell）+ 地面落点提示圈（Vfx.IncomingMarker）
// + HUD 边缘预警（Combat.GrenadeThreats）+ 友军 AI 避弹姿态；重试或切段时彻底清零。

import * as THREE from "three";
import { FLOW_ARTILLERY_CONFIG } from "./Scenes/FirstLevelEncounter/Data_LevelFlowArtillery.mjs";

export class EncounterArtilleryRuntime {
  constructor(host, variant, { groundAt } = {}) {
    this.host = host;
    this.variant = variant;
    this.groundAt = groundAt || null;
    this.schedule = variant?.artillery || [];
    this.fired = new Set();
    this.active = [];
    this.beatClock = new Map();
    this.lastBeatId = null;
  }

  SetVariant(variant) {
    this.variant = variant;
    this.schedule = variant?.artillery || [];
    this.Reset();
  }

  Reset() {
    this.fired.clear();
    this.active.length = 0;
    this.beatClock.clear();
    this.lastBeatId = null;
  }

  GroundY(x, z) {
    if (this.groundAt) return this.groundAt(x, z);
    return this.host?.battlefield?.GroundHeight?.(x, z) ?? 0;
  }

  Update(dt, frame, { playerPos = null, stealthActive = false } = {}) {
    if (dt > 0) {
      const blastS = FLOW_ARTILLERY_CONFIG.blastVisualS ?? 1.6;
      for (let i = this.active.length - 1; i >= 0; i--) {
        this.active[i].elapsed += dt;
        if (this.active[i].elapsed > this.active[i].warnS + blastS) {
          this.active.splice(i, 1);
        }
      }
    }
    if (!frame?.beat || stealthActive || !(dt > 0) || !this.schedule.length) return;
    const beatId = frame.beat.id;
    const prevElapsed = this.beatClock.get(beatId) || 0;
    const beatElapsed = prevElapsed + dt;
    this.beatClock.set(beatId, beatElapsed);
    this.lastBeatId = beatId;

    for (const strike of this.schedule) {
      if (strike.beat !== beatId || this.fired.has(strike.id)) continue;
      const trig = strike.playTrigger || {};
      const maxBehindZ = trig.maxBehindZ ?? 16;
      // 玩家若已大幅南撤甩开该落点，跳过陈旧炮弹，避免在身后几十米无意义炸响
      if (playerPos && (playerPos.z - strike.p[1]) > maxBehindZ) {
        this.fired.add(strike.id);
        continue;
      }
      const warnOffset = Math.max(0.5, strike.at - strike.warnS);
      const minBeatS = trig.minBeatS ?? Math.max(1, warnOffset * 0.65);
      const nearM = trig.nearM ?? (strike.role === "dodge" ? 24 : 45);
      const dist = playerPos
        ? Math.hypot(playerPos.x - strike.p[0], playerPos.z - strike.p[1])
        : Infinity;
      if (beatElapsed >= warnOffset || (beatElapsed >= minBeatS && dist <= nearM)) {
        this.Launch(strike);
      }
    }
  }

  Launch(strike) {
    this.fired.add(strike.id);
    const tx = strike.p[0], tz = strike.p[1];
    const ty = this.GroundY(tx, tz);
    const target = new THREE.Vector3(tx, ty, tz);
    const fx = strike.from?.[0] ?? (tx + (strike.fromDx ?? 0));
    const fz = strike.from?.[1] ?? (tz - (FLOW_ARTILLERY_CONFIG.originNorthOffsetZ ?? 165));
    const flight = strike.warnS;
    const baseHeight = FLOW_ARTILLERY_CONFIG.arcApexHeightM ?? 48;

    let from = new THREE.Vector3(fx, ty + baseHeight, fz);
    const combat = this.host?.combat;
    // 若北方高坡或建筑半途挡住抛物线，则逐档抬高来弹发射仰角，确保真实落点与落点提示圈一致
    if (combat?.PredictShellImpact) {
      for (const extraY of [0, 28, 60, 96]) {
        const candidate = new THREE.Vector3(fx, ty + baseHeight + extraY, fz);
        const predicted = combat.PredictShellImpact(candidate, target, { flight });
        if (!predicted || Math.hypot(predicted.x - tx, predicted.z - tz) <= 3.5) {
          from = candidate;
          break;
        }
      }
    }

    const is50mm = strike.caliber === "50mm";
    const kind = is50mm ? "Launcher50" : "Shell75";
    const dmgTable = FLOW_ARTILLERY_CONFIG.playDamage || {};
    const damage = strike.role === "dodge"
      ? (is50mm ? (dmgTable.dodge50mm ?? 44) : (dmgTable.dodge75mm ?? 52))
      : (dmgTable.suppress75mm ?? 34);

    combat?.FireShell?.(from, target, {
      flight,
      kind,
      radius: strike.radius,
      damage,
      incoming: true,
      report: !is50mm,
      occludedSuppression: true,
      warn: strike.role === "dodge",
      warnRadius: strike.radius * 1.45,
      npcDamageScale: FLOW_ARTILLERY_CONFIG.playNpcDamageScale ?? 0.15,
    });

    if (is50mm && this.host?.audio) {
      const popPos = new THREE.Vector3(
        tx + (fx - tx) * 0.35,
        this.GroundY(tx + (fx - tx) * 0.35, tz + (fz - tz) * 0.35) + 0.6,
        tz + (fz - tz) * 0.35,
      );
      this.host.audio.Play("launcherPop", { position: popPos, volume: 0.85 });
    }

    // 地面收缩落点提示圈（dodge 必显；suppress 也在中近距提供清晰视觉落点）
    this.host?.vfx?.IncomingMarker?.(target, flight, { radius: strike.radius });

    this.active.push({
      id: strike.id,
      beat: strike.beat,
      role: strike.role,
      caliber: strike.caliber || "75mm",
      label: strike.label,
      dodgeHint: strike.dodgeHint || "",
      p: [tx, tz],
      from: [fx, fz],
      radius: strike.radius,
      warnS: flight,
      elapsed: 0,
    });
  }

  /** 返回某位置在当前是否受到需躲避来袭炮弹的近距威胁（供友军 AI 主动伏低侧避）。 */
  EvasionFor(position) {
    if (!position || !this.active.length) return null;
    const pad = FLOW_ARTILLERY_CONFIG.evadeMaxDistancePadM ?? 4.5;
    for (const item of this.active) {
      if (item.role !== "dodge" || item.elapsed >= item.warnS) continue;
      const dx = position.x - item.p[0];
      const dz = position.z - item.p[1];
      const dist = Math.hypot(dx, dz);
      if (dist > item.radius + pad) continue;
      const len = Math.max(0.01, dist);
      return {
        id: item.id,
        away: [dx / len, dz / len],
        distance: dist,
        remainingS: Math.max(0, item.warnS - item.elapsed),
      };
    }
    return null;
  }

  State() {
    const blastS = FLOW_ARTILLERY_CONFIG.blastVisualS ?? 1.6;
    return this.active.map((item) => {
      const warning = item.elapsed < item.warnS;
      return {
        id: item.id,
        beat: item.beat,
        role: item.role,
        caliber: item.caliber,
        label: item.label,
        dodgeHint: item.dodgeHint,
        p: item.p,
        from: item.from,
        radius: item.radius,
        warnS: item.warnS,
        elapsed: item.elapsed,
        remainingS: warning ? Math.max(0, item.warnS - item.elapsed) : 0,
        progress: warning
          ? Math.min(1, item.elapsed / Math.max(0.001, item.warnS))
          : Math.min(1, (item.elapsed - item.warnS) / Math.max(0.1, blastS)),
        phase: warning ? "warn" : "blast",
      };
    });
  }
}
