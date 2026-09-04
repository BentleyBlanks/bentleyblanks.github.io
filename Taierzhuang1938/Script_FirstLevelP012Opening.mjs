// P012 player issue policy. Pure rules; Main owns equipment, input and HUD.
// A saved global debug preference must not manufacture rounds during the issue
// sequence. Only a normal reload with real reserve, completed by the viewmodel,
// unlocks that preference. Ordinary deaths retain this receipt; a new run does
// not. Checkpoint restoration must restore the receipt and both magazine ledgers.
export function AllowP012InfiniteAmmo({ enabled = false, isP012 = false, manualReloadCompleted = false } = {}) {
  return enabled === true && (!isP012 || manualReloadCompleted === true);
}

export function SyncP012ActiveMagazine(state) {
  const slot = state?.activeSlot;
  if (!state?.mags || !["primary", "secondary"].includes(slot)) return false;
  state.mags[slot] = { ammo: state.ammo, clips: state.clips };
  return true;
}

// Call only when the actual pending weapon animation has finished, not on R down.
export function CompleteP012ManualReload(runtime) {
  if (!runtime?.manualReloadPending) return false;
  runtime.manualReloadCompleted = true;
  runtime.manualReloadPending = false;
  return true;
}

export function RestoreP012ManualReload(runtime, snapshot = null) {
  if (!runtime) return;
  runtime.manualReloadCompleted = snapshot?.manualReloadCompleted === true;
  runtime.manualReloadPending = false;
  runtime.weaponActionPending = false;
}
