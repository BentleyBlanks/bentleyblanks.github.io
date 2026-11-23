// Stub replacing Script_ArchivedP012Split.mjs in Pages (--deploy) and --strip-dev-tools bundles.
// Keeps the exact same export surface while excluding the archived ?whitebox=p012-archive fixture graph.

export const ARCHIVED_P012_PHASE = null;
export class FirstLevelP012Debug {
  State() { return null; }
  Next() { return null; }
}
export class FirstLevelP012Director {}
export class FirstLevelP012Runtime {}
export class FirstLevelP012Resting {}
export class FirstLevelP012CarryView {}
export class FirstLevelP012Binoculars {}
export class FirstLevelP012StageZero {}
export function AllowP012InfiniteAmmo({ enabled }) { return !!enabled; }
export function SyncP012ActiveMagazine() {}
export function RestoreP012ManualReload() {}
export function P012BinocularLensContains() { return false; }
export function P012SouthPoint() { return { x: 0, z: 0 }; }
export function InstallP012OpeningPose() {}
export function InstallP012ActorMotion() {}
export function SelectP012CompanionCast() { return null; }
export function SelectP012RecruitCast(_i, identity) { return identity || {}; }
export function P012SegmentClear() { return true; }
