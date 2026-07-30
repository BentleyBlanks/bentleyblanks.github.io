# Mountain Ember operation integration contract

The files in this pass are an additive level-data layer. They do not mutate the current
`Data_Mission.mjs` singleton and can therefore be integrated without changing simulation rules first.

## Selection

1. Import `GetOperationLayoutByCampaignIndex` from `Data_Operations.mjs`.
2. At deployment, select the layout with `campState.completedMissions`.
3. Create its causal state with `CreateOperationRuntime(layout.id)` from
   `Script_OperationFlow.mjs`.
4. Use `GetOperationIntegrationSnapshot(runtime).missionDefinition` as the per-deployment
   replacement for the legacy `missionDefinition`.

The three layouts are not objective variants:

- `infiltrateSignalStation` is a west-to-east split-ravine infiltration with a nested telephone
  compound and a dawn visibility deadline.
- `nightRendezvous` is a north-to-south village protection mission with two civilian flows,
  rain/water sound masking, dark-lane rerouting, and an escort-centric success condition.
- `quarryInterdiction` is a three-elevation quarry with a worker evacuation gate, two different
  road-blocking methods, dust concealment, and upper/lower enemy routes.

## World and simulation adapters

- Geometry consumes `bounds`, `zones`, `lightingZones`, `obstacles`, `interactables`,
  `extractionZones`, and `camera` exactly as the legacy mission singleton does.
- Spawn and AI initialization consume `playerSpawns`, `enemies`, and `patrols`.
- Patrol entries with `activeWhen` are authored alternates. The base enemy remains on its initial
  route until `runtime.patrolRouteOverrides[enemyId]` names the alternate.
- Lighting must hide or disable every identifier in `runtime.disabledLighting`.
- Pathfinding must treat `runtime.blockedRoutes` as navigation-cost or traversal updates. Authored
  route IDs are stable gameplay tags, not mesh names.
- Sound propagation applies the existing zone multiplier plus any active identifier in
  `runtime.soundMasks`.
- Temporary concealment volumes such as `rockfallDust` are spawned for the existing effect
  duration when their identifiers enter `runtime.concealmentZones`.
- Reinforcement scheduling reads the layout's `reinforcementRoutes`, then applies disabled/enabled
  IDs and `reinforcementDelaySeconds`.

## Interaction settlement

1. Tactical pause queues the interaction command only.
2. On simulation resume and after approach/duration completes, call
   `ResolveOperationInteraction(runtime, interactionId, actorId)` once.
3. Replace the old runtime only when `result.ok` is true.
4. Do not separately reapply `effects`; the returned state already contains flags, objectives,
   patrol changes, lighting, routes, reinforcements, events, and ledger costs.
5. A civilian route is completed by world simulation through
   `CompleteCivilianRoute(runtime, routeId)`. This is how the quarry sets
   `quarryWorkersClear`; starting evacuation is deliberately not enough.
6. For interactions with `startCarryItems`, pass a real unit ID. Collection only assigns a carrier.
   Call `ExtractOperationCarrier(runtime, unitId)` on successful extraction, or
   `DropOperationCarrierItems(runtime, unitId, position)` when that unit falls. A carried objective
   is not complete merely because it was picked up. A surviving teammate can recover it through
   `PickUpDroppedOperationItem(runtime, itemId, unitId)`.

`triggerSafeRockfall` and `triggerUnsafeRockfall` share the same world interactable. The available
interaction is selected by flags. The unsafe version completes the road objective but adds permanent
ledger cost. It never creates a score or resource bonus.

## Narrative and atmosphere

- Use `layout.narrativeRefs` to retrieve storylets through `GetOperationStorylet`.
- Resolve storylet `variants` in order; `always` is the fallback.
- Dialogue is authored as subtitles/log entries. Do not stall simulation for mandatory cinematic
  delivery during detection or combat.
- `GetAtmospherePalette(layout.id)` supplies prop, sound, and color direction. These strings are art
  direction, not runtime asset paths.
- Every named civilian is an original composite. The historical boundaries in
  `Data_HistoricalAtmosphere.mjs` must stay visible in credits/help and should be summarized on the
  campaign title screen.

## Civilian-cost invariant

- The only mutable civilian outcome is `runtime.civilianCostLedger` with non-negative `risk`,
  `harm`, and `displacement`.
- No operation interaction has a `reward`, `score`, `resource`, or morale-gain effect derived from
  civilians.
- Civilian-owned seed records, animals, and tools are returned or left in place. They never enter
  camp inventory.
- Mission evaluation may lower or cap a grade from ledger cost. It must never award points for
  exposing civilians to risk or exchange their harm for objective completion.

## Verification

Run:

```powershell
node MountainEmber1941/Script_LevelSmokeTest.mjs
node MountainEmber1941/Script_SmokeTest.mjs
```

The level smoke test checks data shape, spatial differentiation, causal interactions, safe/unsafe
rockfall paths, deferred evacuation, scheduled events, extraction changes, and the absence of
civilian-derived rewards.
