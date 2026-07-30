# MountainEmber1941 agent guide

Canonical path: `/MountainEmber1941/`

`MountainEmber1941` is an original Three.js real-time-with-pause squad tactics campaign set in a fictionalized 1941 North China enemy-rear area. It borrows the genre language of squad stealth games, but must not copy characters, mission layouts, art, UI, icons, dialogue, or progression from any reference title.

## Design pillars

1. Limited information: enemies perceive sight and sound events, retain an uncertain last known position, and do not read the player's live position after contact is lost.
2. Rural environment as a tactical system: sorghum, dry ditches, stone walls, local alarms, telephone lines, and a quarry rockfall all change sight, sound, access, or reinforcement timing.
3. Distinct cooperation: reconnaissance, engineering, casualty care, and suppressive command have different costs and failure modes.
4. Break contact: recovering the document and disabling communications should lead to withdrawal, not clearing the map.
5. People first: kills never score. Civilian harm, displacement, and risk are a cost ledger and never become resources or bonuses.
6. Persistent resistance: three rotating operations change the required objectives in the same county; wounds, permanent losses, fatigue, clinic, workshop, intelligence, and training all carry into the next deployment.

## Historical boundary

- The location, characters, unit layout, and action are fictional composites. They do not represent a particular real village or battle.
- The player changes one local action, not the outcome of the war. Japan's 1945 surrender is an unchangeable historical endpoint.
- Do not fabricate quotations from historical figures.
- Do not loot civilian homes or convert seed grain, casualties, displacement, or suffering into resources.
- Use period-plausible plain clothing, weapons, hand-cranked telephone equipment, rough timber poles, pack carts, and rural production spaces. Avoid modern tactical equipment and tourist-town signifiers.

## Runtime contract

- No runtime CDN. Three.js is vendored under `vendor/three/`.
- `Script_Rules.mjs` and `Script_Ai.mjs` must remain usable in Node without DOM or WebGL side effects.
- Simulation uses a fixed 30 Hz step. Enemy AI updates at 10 Hz.
- Sound events are bounded and expire after 2.5 seconds.
- Player command queues contain at most four commands.
- Tactical pause may queue abilities, but no ability may spend ammunition, charges, cooldowns, health, suppression, or sound events until simulation resumes. Each queued ability settles once.
- Planned movement paths reuse the same A* clearance and waypoints as execution. Sound previews sample the real route rather than a straight-line shortcut.
- Enemy intelligence has five states: `unknown`, `discovered`, `lastKnown`, `tracked`, and `current`. Unknown enemies never expose live models, cones, alert bars, or pick targets; a last-known marker freezes at the observed position and expires after 12 seconds.
- Paused rendering may idle at 12 fps only while the view is fully static. Camera input, command editing, zoom, and transient effects must request a short full-frame render burst.
- `StartMission`'s 60-unit first-zone focus is a local tactical composition, not an overview request. On 390x844 it must frame the squad and nearest authored patrol at no more than 136 world units; manual zoom-out remains the only transition to the bounds-fitted full-map overview. Renderer stats expose `framingMode`, `tacticalDistance`, `tacticalActorSpan`, and `overviewFitDistance`.
- `performance.framePacingP95` measures browser scheduling cadence. Use `totalWorkP95`, `simulationWorkP95`, `renderWorkP95`, and `hudWorkP95` to diagnose game CPU cost instead of attributing display or browser scheduling jitter to simulation.
- Firearms must emit one visual impact for each resolved outcome: body hits trigger the actor reaction once, while blocked shots use the first obstacle's authored earth, wood, metal, or stone material.
- Carried documents and supplies only count if their carrier leaves the map. A dead carrier drops them at the death position.
- Campaign advancement requires a completed operation; failures repeat the current operation. Facility development must have an observable next-mission effect.
- A baseline mission with no transient effects should remain below 100 renderer calls on desktop and 90 on the mobile quality profile.
- Save key: `mountainember1941_campaign_v1`; settings key: `mountainember1941_settings_v1`.
- Player-facing copy may be Chinese. Project-owned file/function names are English and follow repository naming rules.

## Art asset contract

- Blender source is `Models/Model_SourceMountainEmberArtPass.blend`; regenerate owned assets with `Tools/Script_BuildBlenderAssets.py` through Blender rather than hand-editing exported GLB files.
- The operation environment mapping is fixed: `infiltrateSignalStation` → `Model_EnvironmentCounty.glb`, `nightRendezvous` → `Model_EnvironmentNorthVillage.glb`, and `quarryInterdiction` → `Model_EnvironmentQuarrySlope.glb`. Runtime must request only the active operation's environment GLB.
- Every environment GLB must remain one mesh with material slots. The north-village asset owns the five obstacle-aligned buildings, walls, rain cart, creek, millrace, and irrigation sluice. The quarry asset owns its obstacle-aligned office/sheds/blockhouse, retaining walls, five authored elevation benches, worker sheds, ore-cart track and carts, rockfall timbers, and telephone poles.
- Each operation keeps its own procedural fallback visible until that operation's GLB has loaded successfully. A failed or mismatched request must never hide blockers, waterworks, quarry track, or objective landmarks.
- `Tools/Script_BuildBlenderAssets.py` derives `ProjectRoot` from its own `__file__`; never commit a worktree-specific absolute path. Character GLBs must keep the four named pivots containing `Arm_L_Pivot`, `Arm_R_Pivot`, `Leg_L_Pivot`, and `Leg_R_Pivot` while staying at five render meshes per character.
- Character colors are baked to the `Color` vertex attribute before export. Runtime tinting for last-known intelligence multiplies those colors and must restore the authored colors when the enemy becomes current again.
- GLB loading is an enhancement path, not a boot dependency: failed environment or character requests must retain the procedural fallback and report the failed asset in renderer debug stats.
- Keep the Blender-generated PBR textures under `Textures/`; do not add runtime CDN texture or model requests.

## Operation data contract

- The three campaign operations live in `Data_Operations.mjs` and are selected by completed mission count. `Script_Game.mjs`, `Script_World.mjs`, `Script_Ai.mjs`, and `Script_Rules.mjs` must consume the active layout rather than importing a fixed mission singleton.
- Stateful environment consequences, civilian routes, carried objectives, dropped items, reinforcement gates, and patrol overrides flow through `Script_OperationFlow.mjs`. Do not duplicate one-off flags in UI code.
- Every operation needs distinct bounds, player spawns, camera framing, obstacle geometry, patrols, objectives, extraction choices, and at least one interaction whose consequence changes movement, sight, sound, or reinforcement timing.

## Verification

Run after any change:

```powershell
node MountainEmber1941/Script_SmokeTest.mjs
```

Also run a local browser capture at 1920x1080 and 390x844. Check that the squad, nearest patrol/vision cone, and telephone exchange are readable in that order; the HUD does not cover the central battlefield; the pause state freezes simulation; all mandatory objectives can be completed; and mission results can enter the camp screen.

For art and operation changes, also run:

```powershell
node MountainEmber1941/Script_TacticalDepthTest.mjs
node MountainEmber1941/Script_LevelSmokeTest.mjs
```

For runtime, rendering, or asset-lifetime changes, also run:

```powershell
node MountainEmber1941/Script_PerformanceContractTest.mjs
```
