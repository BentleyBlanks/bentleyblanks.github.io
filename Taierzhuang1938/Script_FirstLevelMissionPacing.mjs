// Pure pacing decisions. The runtime supplies actual actor/column receipts.
export function TransferBeatReady(beat, {seconds, loaded, previousClearedAt}) {
  return seconds >= beat.earliestS && previousClearedAt != null &&
    seconds - previousClearedAt >= beat.restS &&
    (loaded >= beat.loaded || seconds >= beat.latestS);
}
export function GuardCrossingPair(guards, size) {
  const first=guards.findIndex(guard=>!guard.safe && guard.alive);
  if(first<0)return [];
  const start=Math.floor(first/size)*size;
  return guards.slice(start,start+size).filter(guard=>guard.alive && !guard.safe).map(guard=>guard.id);
}
export function FrontReplacementSlots({alive, queued, spawned}, tuning) {
  return Math.max(0,Math.min(tuning.waveSquadSize,tuning.waveBudget-spawned-queued,tuning.waveAliveCap-alive-queued));
}
