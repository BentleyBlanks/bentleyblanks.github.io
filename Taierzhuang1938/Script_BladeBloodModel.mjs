// Deterministic blade blood state & physics rule layer (pure Node, zero three.js imports).
// Tracks per-blade accumulation, edge/spatter distribution, coagulation/drying, gravity rivulet
// creep, swelling pendant droplet lifecycle, detachment events, and rapid-swing centrifugal fling.

import { BLADE_BLOOD_DYNAMICS as D, BLADE_BLOOD_HITS as H, BLADE_PROFILES as P } from "./Data_Tuning_BladeBlood.mjs";

const Clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const Clamp01 = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x);
const Mix = (a, b, t) => a + (b - a) * t;

/** Resolve the physical blade profile key for a weapon id and optional source kind. */
export function ResolveBladeProfileKey(weaponId, { bayonet = false, procedural = false } = {}) {
  if (!weaponId) return null;
  if (bayonet) {
    if (weaponId === "HanYang") return "BayonetHanYang";
    if (weaponId === "ZhongZheng") return "BayonetZhongZheng";
    if (weaponId === "Type38") return "BayonetType38";
    return "BayonetHanYang";
  }
  if (weaponId === "Dadao") return procedural ? "DadaoBox" : "Dadao";
  if (weaponId === "OfficerSwordSet") return "OfficerSwordSet";
  return null;
}

/** Return the persistent state key shared across weapon switches for a given weapon/bayonet. */
export function BladeStateKey(weaponId, { bayonet = false } = {}) {
  if (!weaponId) return null;
  if (bayonet) return `Bayonet:${weaponId}`;
  if (weaponId === "Dadao" || weaponId === "OfficerSwordSet") return weaponId;
  return null;
}

/** Normalize melee hit descriptor into one of BLADE_BLOOD_HITS keys. */
export function ResolveHitProfile(kind = "light", { bayonet = false, kill = false, corpse = false } = {}) {
  if (bayonet) {
    if (kind === "heavy" || kill || kind === "bayonetHeavy") return H.bayonetHeavy;
    return H.bayonetLight;
  }
  if (H[kind]) {
    if (kill && (kind === "light" || kind === "heavy")) return H.kill;
    return H[kind];
  }
  if (corpse) return H.corpse;
  if (kill) return H.kill;
  return H.light;
}

function FreshState(key) {
  return {
    key,
    coverage: 0,       // 0..1 overall blood film coverage on blade flat
    edge: 0,           // 0..1 concentrated thick blood along sharp cutting edge / tip
    spatter: 0,        // 0..1 fine arterial splatter higher up blade & near guard
    wetness: 0,        // 0..1 fresh glossy liquid vs dark matte coagulated blood
    thickness: 0,      // 0..1 optical depth / meniscus relief thickness
    lengthReach: 0,    // 0..1 how far back from tip toward guard the stain reaches
    sideBias: 0,       // -1..+1 slight asymmetry between left/right blade faces from sweep direction
    flowOffset: 0,     // accumulated downward gravity rivulet creep (0..flowMaxOffset)
    dryAgeS: 0,        // seconds since last fresh blood soak
    hitCount: 0,       // cumulative flesh cuts/stabs on this blade
    dripsEmitted: 0,   // total individual gravity drops fallen from this blade
    flingsEmitted: 0,  // total swing-fling droplets cast off this blade
    dripCharge: 0,     // 0..1 available loose liquid charge supporting dripping
    flingCooldown: 0,  // seconds until next swing-fling burst
    // Per-pendant swelling droplets clinging to the lowest blade edge points.
    pendants: Array.from({ length: D.pendantCount }, (_, index) => ({
      index,
      progress: 0,     // 0..1 swelling toward critical mass; detaches at >= 1
      phaseBias: index === 0 ? 1.0 : 0.72,
      anchorIndex: 0,
      radiusM: 0,
      elongation: 1,
      active: false,
    })),
  };
}

/**
 * Pure simulation model for blade blood across all player melee/bayonet weapons.
 * Zero Three.js dependencies; fully unit-testable in Node.
 */
export class BladeBloodModel {
  constructor() {
    this.states = new Map();
    this.time = 0;
  }

  /** Get or create persistent blood state for a weapon key (e.g. "Dadao", "Bayonet:HanYang"). */
  Ensure(key) {
    if (!key) return null;
    let state = this.states.get(key);
    if (!state) {
      state = FreshState(key);
      this.states.set(key, state);
    }
    return state;
  }

  /** Read-only snapshot of one blade's blood state. */
  Snapshot(key) {
    const s = this.states.get(key);
    if (!s) {
      const empty = FreshState(key || "");
      return {
        key: empty.key, coverage: 0, edge: 0, spatter: 0, wetness: 0, thickness: 0,
        lengthReach: 0, sideBias: 0, flowOffset: 0, dryAgeS: 0, hitCount: 0,
        dripsEmitted: 0, flingsEmitted: 0, dripCharge: 0,
        pendants: empty.pendants.map((p) => ({ ...p })),
      };
    }
    return {
      key: s.key,
      coverage: s.coverage,
      edge: s.edge,
      spatter: s.spatter,
      wetness: s.wetness,
      thickness: s.thickness,
      lengthReach: s.lengthReach,
      sideBias: s.sideBias,
      flowOffset: s.flowOffset,
      dryAgeS: s.dryAgeS,
      hitCount: s.hitCount,
      dripsEmitted: s.dripsEmitted,
      flingsEmitted: s.flingsEmitted,
      dripCharge: s.dripCharge,
      pendants: s.pendants.map((p) => ({ ...p })),
    };
  }

  /**
   * Record a flesh hit / cut / stab / lodge / yank / rip on a blade weapon.
   * Returns { state, flingBurst } where flingBurst is an immediate spray count off the blade.
   */
  RecordHit(key, { kind = "light", bayonet = false, kill = false, corpse = false, sweep = 0, intensity = 1 } = {}) {
    const s = this.Ensure(key);
    if (!s) return null;
    const hit = ResolveHitProfile(kind, { bayonet, kill, corpse });
    const k = Clamp(Number.isFinite(intensity) ? intensity : 1, 0.25, 1.5);

    // Multi-hit realistic accumulation: 1st light cut coats edge + front half;
    // subsequent cuts and heavy chops/rips build toward full glossy crimson saturation.
    const BlendUp = (cur, target, boost) => Clamp01(Math.max(cur, target * k) + (1 - Math.max(cur, target * k)) * cur * boost);
    s.coverage = BlendUp(s.coverage, hit.coverage, 0.32);
    s.edge = BlendUp(s.edge, hit.edge, 0.38);
    s.spatter = BlendUp(s.spatter, hit.spatter, 0.30);
    s.thickness = BlendUp(s.thickness, hit.thickness, 0.35);
    s.lengthReach = Clamp01(Math.max(s.lengthReach, hit.lengthReach * Math.min(1.08, 0.85 + 0.15 * k)));
    // Fresh blood immediately re-wets older partially coagulated film on the steel.
    s.wetness = Clamp01(Math.max(s.wetness, hit.wetness * Math.min(1.0, k)));
    s.dripCharge = Clamp01(Math.max(s.dripCharge, hit.dripCharge * k) + 0.18 * (s.hitCount > 0 ? 1 : 0));
    s.dryAgeS = 0;
    s.hitCount += 1;

    // Slight face asymmetry from slash sweep direction (keeps both faces stained, leading face slightly heavier).
    if (sweep) {
      const sign = sweep > 0 ? 1 : -1;
      s.sideBias = Clamp(s.sideBias * 0.55 + sign * 0.28, -0.45, 0.45);
    }

    // Prime primary pendant drop so first hanging blood bead becomes visibly noticeable quickly after a cut.
    if (s.pendants[0] && s.wetness >= D.dripMinWetness) {
      s.pendants[0].progress = Math.max(s.pendants[0].progress, 0.32);
      s.pendants[0].active = true;
    }

    const flingBurst = Math.max(0, Math.round((hit.flingBurst || 0) * Math.min(1.25, k)));
    s.flingsEmitted += flingBurst;
    return { state: this.Snapshot(key), flingBurst };
  }

  /**
   * Advance coagulation, gravity rivulet creep, swelling hanging droplets, and swing-fling detection.
   *
   * @param {number} dt seconds
   * @param {object} [active] optional active equipped blade kinematics:
   *   {
   *     key: string,
   *     profileKey?: string,
   *     tipSpeedMps?: number,       // blade tip linear speed (world m/s) for jolt/fling
   *     gravityDownAlign?: number,  // 0..1 how strongly blade is tilted downward/vertical (affects flow rate)
   *     stowed?: boolean,           // true when weapon is not currently held in hand
   *   }
   * @returns {{ drips: Array<{pendantIndex:number, wetness:number, radiusM:number}>, flings: number }}
   */
  Step(dt, active = null) {
    const step = Clamp(Number.isFinite(dt) ? dt : 0, 0, 0.1);
    const events = { drips: [], flings: 0 };
    if (step <= 0) return events;
    this.time += step;

    for (const s of this.states.values()) {
      if (s.coverage <= 1e-4 && s.edge <= 1e-4 && s.spatter <= 1e-4) continue;

      const isActive = !!(active && !active.stowed && active.key === s.key);
      s.dryAgeS += step;
      if (s.flingCooldown > 0) s.flingCooldown = Math.max(0, s.flingCooldown - step);

      // 1. Coagulation & drying: fresh glossy liquid thickens toward dark oxidized dried stain.
      if (s.wetness > D.minWetResidue) {
        const excess = s.wetness - D.minWetResidue;
        s.wetness = D.minWetResidue + excess * Math.exp(-step / D.wetDecayTauS);
      }
      // Very gradual long-term wear after stainHoldS (never vanishes abruptly).
      if (s.dryAgeS > D.stainHoldS) {
        const fade = Math.exp(-step / D.stainDecayTauS);
        s.coverage *= fade;
        s.edge *= fade;
        s.spatter *= fade;
        s.thickness *= fade;
        if (s.coverage < 0.005 && s.edge < 0.005) {
          s.coverage = 0; s.edge = 0; s.spatter = 0; s.thickness = 0; s.wetness = 0; s.dripCharge = 0;
        }
      }

      // 2. Gravity-driven rivulet creep on blade surface while still liquid.
      const liquidMobility = Clamp01((s.wetness - 0.10) / 0.90);
      if (liquidMobility > 0.001 && s.flowOffset < D.flowMaxOffset) {
        const align = isActive ? Clamp(active.gravityDownAlign ?? 0.75, 0.25, 1.0) : 0.35;
        s.flowOffset = Math.min(D.flowMaxOffset, s.flowOffset + D.flowSpeedPerS * liquidMobility * align * step);
      }

      // 3. Drip charge decays slowly alongside wetness so dripping tapers naturally.
      s.dripCharge = Clamp01(Math.min(s.dripCharge, s.wetness * 1.15));

      // Inactive/stowed weapons still dry & creep slightly, but do not spawn foreground 3D drops.
      if (!isActive) {
        for (const p of s.pendants) {
          p.active = false;
          p.progress = Math.max(0, p.progress - step * 0.5);
          p.radiusM = 0;
        }
        continue;
      }

      const tipSpeed = Math.max(0, Number(active.tipSpeedMps) || 0);

      // 4. Rapid swing / flick centrifugal blood fling (振刀甩血).
      // Wait flingPostHitGraceS after impact so follow-through of the strike itself does not strip fresh wetness.
      if (tipSpeed >= D.flingSpeedThresholdMps && s.flingCooldown <= 0
          && s.dryAgeS >= (D.flingPostHitGraceS || 0)
          && s.wetness >= D.flingMinWetness && s.coverage >= D.dripMinCoverage) {
        const speedNorm = Clamp01((tipSpeed - D.flingSpeedThresholdMps) / 5.5);
        const rawCount = Mix(D.flingDropsMin, D.flingDropsMax, speedNorm) * Clamp01(s.wetness * 1.15);
        const count = Math.max(1, Math.round(rawCount));
        events.flings += count;
        s.flingsEmitted += count;
        s.flingCooldown = D.flingCooldownS;
        // Shaking loose blood reduces excess wetness & resets half-formed pendant droplets.
        s.wetness = Math.max(D.minWetResidue, s.wetness - D.flingWetCost * (0.55 + 0.45 * speedNorm));
        s.dripCharge = Math.max(0, s.dripCharge - D.flingWetCost * 1.3);
        for (const p of s.pendants) p.progress *= 0.25;
      }

      // 5. Swelling 3D hanging droplets & gravity detachment.
      const canDrip = s.wetness >= D.dripMinWetness && s.coverage >= D.dripMinCoverage && s.dripCharge > 0.04;
      const wetnessNorm = Clamp01((s.wetness - D.dripMinWetness) / (1 - D.dripMinWetness));
      const intervalS = Mix(D.dripMaxIntervalS, D.dripMinIntervalS, Math.pow(wetnessNorm, 0.72));

      for (let i = 0; i < s.pendants.length; i += 1) {
        const p = s.pendants[i];
        // Second hanging drop only activates on heavier wet soak (> 0.45 wetness & > 0.45 coverage).
        const allowed = canDrip && (i === 0 || (s.wetness >= 0.44 && s.coverage >= 0.42));
        if (!allowed) {
          p.progress = Math.max(0, p.progress - step * 0.85);
          p.active = p.progress > 0.08;
        } else {
          p.active = true;
          const rate = (1 / Math.max(0.15, intervalS)) * p.phaseBias;
          p.progress += rate * step;
          const joltDetach = tipSpeed >= D.joltSpeedThresholdMps && p.progress >= D.joltDetachProgress;
          if (p.progress >= 1.0 || joltDetach) {
            const releaseScale = Clamp(0.72 + 0.28 * p.progress, 0.65, 1.0);
            const dropRadius = Mix(D.pendantMinRadiusM, D.pendantMaxRadiusM, releaseScale);
            events.drips.push({
              pendantIndex: i,
              wetness: s.wetness,
              radiusM: dropRadius,
              jolt: joltDetach,
            });
            s.dripsEmitted += 1;
            s.wetness = Math.max(D.minWetResidue, s.wetness - D.dripWetCost);
            s.dripCharge = Math.max(0, s.dripCharge - D.dripWetCost * 1.35);
            // Residual film leaves a tiny nucleation bead (0.04..0.12) that starts swelling again.
            p.progress = 0.04 + (i * 0.07);
          }
        }
        // Compute current visible teardrop radius & gravity neck elongation from progress.
        if (p.active) {
          const swell = Math.pow(Clamp01(p.progress), 0.65);
          p.radiusM = Mix(D.pendantMinRadiusM, D.pendantMaxRadiusM, swell);
          const neck = Clamp01((p.progress - D.pendantNeckStart) / Math.max(0.05, 1 - D.pendantNeckStart));
          p.elongation = Mix(1.15, D.pendantElongation, swell * 0.55 + neck * neck * 0.45);
        } else {
          p.radiusM = 0;
          p.elongation = 1;
        }
      }
    }
    return events;
  }

  /** Clean a single weapon or all blades (e.g. respawn, scenario restart, level load). */
  Reset(key = null) {
    if (key) {
      this.states.delete(key);
    } else {
      this.states.clear();
    }
  }
}

/**
 * Given candidate mesh-local drip points and world Y heights, choose the lowest bloody
 * points along the blade edge/tip where gravity naturally pools droplets.
 */
export function SelectLowestDripIndices(profileKey, lengthReach, worldYs, count = D.pendantCount) {
  const profile = P[profileKey] || P.Dadao;
  const pts = profile.dripPoints || [];
  if (!pts.length) return [];
  const maxAlong = Math.max(0.18, Clamp01(lengthReach));
  const ranked = [];
  for (let i = 0; i < pts.length; i += 1) {
    const along = pts[i][3];
    if (along > maxAlong + 0.08) continue;
    const wy = Number.isFinite(worldYs?.[i]) ? worldYs[i] : 0;
    // Slight preference for tip/front edge where blood runs first, dominated by actual world low point.
    ranked.push({ index: i, score: wy + along * 0.018 });
  }
  if (!ranked.length) ranked.push({ index: 0, score: worldYs?.[0] ?? 0 });
  ranked.sort((a, b) => a.score - b.score);
  const picked = [];
  for (const item of ranked) {
    if (picked.length >= count) break;
    // Keep second pendant drop spaced from first so two droplets don't overlap on the exact same vertex.
    if (picked.length > 0 && Math.abs(item.index - picked[0]) < 2 && ranked.length > 2) continue;
    picked.push(item.index);
  }
  while (picked.length < Math.min(count, ranked.length)) {
    const next = ranked.find((r) => !picked.includes(r.index));
    if (!next) break;
    picked.push(next.index);
  }
  return picked;
}
