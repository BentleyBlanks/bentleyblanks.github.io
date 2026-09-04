// Shared live-grenade reach/fuse contract. F claims the actual projectile; its
// original fuse keeps burning during the short pickup and the return flight.
import { GRENADE_RETURN } from "./Data_Explosives.mjs";

export function FindReturnableGrenade(projectiles, player, Visible = () => true) {
  if (!player?.Alive) return null;
  return projectiles.filter((p) => p.alive && !p.returning && p.fuse > GRENADE_RETURN.minFuseS
    && p.age >= GRENADE_RETURN.releaseGraceS
    && Math.abs(p.position.y - player.position.y) <= GRENADE_RETURN.heightM
    && Math.hypot(p.position.x - player.position.x, p.position.z - player.position.z) <= GRENADE_RETURN.reachM
    && Visible(p)).sort((a, b) => a.fuse - b.fuse)[0] || null;
}

export function RegisterGrenadeReturn(interact, combat, player, { CanUse = () => true, OnPickup = () => {} } = {}) {
  return interact.Register({ id: "LiveGrenadeReturn", tag: "SharedGrenadeReturn", kind: "grenade", once: false,
    priority: 1000, facingDot: null, reachM: GRENADE_RETURN.reachM, heightM: GRENADE_RETURN.heightM,
    Anchor: () => combat.ReturnCandidate()?.position || null,
    Enabled: () => CanUse() && !combat.Returning && !!combat.ReturnCandidate(),
    label: () => `拾起并掷回 · ${Math.max(0, combat.ReturnCandidate()?.fuse || 0).toFixed(1)}秒`,
    OnComplete: () => { const result = combat.BeginReturn(); if (result) OnPickup(); return result; },
  });
}
