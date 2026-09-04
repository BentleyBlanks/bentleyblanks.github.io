# GravityTank — Agent Guide

Canonical play URL: `https://bentleyblanks.github.io/GravityTank/`  
Deploy branch: **`master` only**. Draft PR stacks do **not** ship.

This file is the agent map for GravityTank. Prefer it over dumping `Script_Game.mjs` (~7k lines). Root repo rules (naming, commit message format, Pages policy) live in `/AGENTS.md`.

---

## Ship workflow

1. Create an isolated worktree from current `origin/master`; never edit or switch the shared main checkout.
2. Commit with `<AgentName> GravityTank: short change summary` (no `feat:`/`fix:`, no trailing period).
3. Fetch/rebase current `origin/master`, then fast-forward push `HEAD:master` without force.
4. Bump cache-bust `Script_Game.mjs?v=…` (and CSS `?v=` if style changed) in `index.html`.
5. Confirm Pages build / live URL, then remove the clean task worktree and branch.

Larger multi-feature stacks may stay on PRs for review, but unique shippable work must still reach `master` (port/merge), not rot on stacked drafts.

---

## Version & cache

| What | Where |
|------|--------|
| Build id | `GAME_VERSION` / `GAME_VERSION_LABEL` in `Script_Game.mjs` |
| Logo badge | `#gameVersion` in `index.html` |
| Credit line | `#creditVersion` in `index.html` |
| Cache-bust | `index.html` → `Script_Game.mjs?v=…` / `Style_Game.css?v=…` |

Bump constant + visible `vX.Y` text **together** when cutting a player-facing version. Always bump `?v=` when scripts/assets change so Pages does not serve stale modules.

---

## File map (touch the smallest owner)

| Path | Owns |
|------|------|
| `index.html` | Shell UI, RULE copy, logo/version, easy/standard mode selector, cache-bust `?v=` |
| `Style_Game.css` | Layout, RULE list, logo badge, touch HUD, overlays |
| `Script_Game.mjs` | Runtime loop, tanks, bullets, roulette, bosses, FX, HUD |
| `Data_Stages.mjs` | Stage maps, enemy counts, barricade teach, HQ flip helpers |
| `Data_Upgrades.mjs` | Upgrade card pools + recommend flags |
| `Script_GenerateUpgradeArt.mjs` | Offline icon generator (not loaded by the game page) |
| `Script_GenerateCardFrames.mjs` | Offline card-frame generator |
| `assets/` | `Texture_*`, `Icon_*`, `Audio*`, fonts — naming per root `AGENTS.md` |

**Do:** `rg` / grep a symbol or stage id before reading large chunks of `Script_Game.mjs`.  
**Don’t:** casually split `Script_Game.mjs` mid-hotfix — splits need import wiring + Pages smoke. Optional future seams (behavior-identical extract only): `Script_Roulette.mjs`, `Script_Bosses.mjs`, `Script_Barricade.mjs`, `Script_PowerFx.mjs`.

---

## Player durability (current contract)

| Knob | Value | Symbol |
|------|--------|--------|
| Lives (both modes) | **3** | `PLAYER_LIVES` / `GetStartLives()` |
| Unprotected hit (normal / heavy / boss / bomb) | lose **1 life** immediately; no hull HP | `DamagePlayer` / `KillPlayer` |
| Armor-hit protection | 1.0 s | `HIT_IFRAME` |
| Revive presentation | 1.25 s ring / beam / particles | `respawnFx`, `StartRespawnFx`, `DrawRespawnFx` |
| Death presentation | 0.85 s slow motion + 3.2 s incident report | `deathSlowTimer`, `StartIncidentReport`, `DrawIncidentSlowFx` |
| On death | keep firepower (−1 max) | `SoftenFirepowerOnDeath` / `KillPlayer` |
| HQ durability | **3 HP** | `BASE_MAX_HP`, `DamageBase` |
| Mission failure | restore mission-start checkpoint | `RestoreStageCheckpoint` |

### Mode and life display

The title screen defaults to **简易模式**: player shells pass through the player and their carried shield without consuming armor, including shells left over from an earlier life. **标准模式** retains armed-shell self-hits; its `noSelfHit` upgrade remains available. Easy mode excludes this redundant upgrade from card offers. Enemy fire and HQ damage are unchanged.

Player hulls keep the fixed gold `PLAYER_PALETTE` via `BlitPlayerTinted`. There are no hull HP pips, HP-based colors, or separate player HP counter. Desktop and mobile LIFE show only the remaining life count. Power tier still picks the sprite row via `TankSheetOrigin`; enemy armor HP rendering remains separate.

`SetDifficulty` / `SyncStageLabels` keep the selector and mode explanation aligned. A checkpoint records `difficulty`; retry/CONTINUE restore it. Older saves without a mode use easy and discard old player HP. The campaign starts at mission 1; the old tutorial remains legacy/debug-only. There is no free first-death revive.

Focused campaign progression: **9 missions in 3 acts**, with data ids `[1, 2, 3, 4, 5, 6, 7, 8, 15]` (`CAMPAIGN_STAGE_IDS`). Stage 6 flows through `barricadeTeach`, then stage 7. All 15 legacy definitions remain selectable through Debug, but ids 9–14 are not on the default route. Main-route Bosses are ids 3, 6, and 15.

Every normal mission supports continuous firing through the standard active-bullet cap. There is no ammo pickup, shell recovery, enemy ammo theft, front-hit immunity, or mission-specific shell mode. Stage 14 `noFire` / `enemyOnlyCrossfire` intentionally locks the player cannon and retires its last survivor so it cannot softlock. Anchor tanks (`anchorTank`) ignore bullet gravity and push carryable barricades.

Enemy friendly fire is active throughout ordinary play. Enemy-caused kills increment `stageCrossfireKills` but never grant player score. `BuildStageClearReport` scores HQ durability, player kills, and clear time.

Armor is explicit only: upgrade cards and roulette powers may add `absorbHits`; there is no XP or automatic level-up armor.

Checkpoint contract: `SaveStageCheckpoint` captures difficulty, score, lives, base firepower, armor, temporary next-mission card, and permanent Boss perks at mission start. Failure and the title-screen CONTINUE action restore that snapshot from `gravitytank_campaign_v09`; final victory clears it.

---

## Roulette & power names

Pool: `ROULETTE_POOL` via `MakeSeg(kind, label, tier)`. Tier colors: green=good / gold=ultra / red=bad (`TIER_PALETTE`).

**Keep these restored display names** (do not “plain-Chinese away”):

| Kind | Label |
|------|--------|
| `eagleAlly` | 鹰援 |
| `ghost` | 幽灵 |
| `giant` | 巨大 |
| `steelRain` | 钢雨 |
| `apocalypse` | 天罚 |

Other labels should stay short plain Chinese (what it does). `fortress` display is **加钢墙** (not a misleading「铁壁」that reads like HQ door break).

Spin UX: right-side **pinball pull-arc** (`RouletteReleasePlunger`) — not wheel-drag. Flow: fly-in → spin → resolve → fly-out → fullscreen FX when applicable (`OpenRoulette`, `ResolveRoulette`, `ApplyPowerup`, `POWER_FX`, `DrawRoulette`).

Drop contract: at most **2 roulette tokens per mission**, mission 1 guarantees one carrier, and every seven-wedge wheel contains exactly **4 green + 2 gold + 1 red** choices. Boss-safe filtering may change prize identities, never the tier counts.

When renaming a prize: update `ROULETTE_POOL` **and** matching `POWER_FX` label together.

---

## High-traffic symbols (`Script_Game.mjs`)

Grep these first:

| Area | Symbols |
|------|---------|
| Version | `GAME_VERSION` |
| Balance / difficulty | `SetDifficulty`, `GetStartLives`, `GetPowerDropRate`, `SyncStageLabels` |
| Player HP / death | `DamagePlayer`, `KillPlayer`, `StartIncidentReport`, `BlitPlayerTinted`, `SoftenFirepowerOnDeath` |
| Draw | `DrawTank`, `DrawTankBarrel`, `DrawBossBarrels`, `TankSheetOrigin`, `BlitArmorTinted`, `BlitGrid` |
| Roulette | `ROULETTE_POOL`, `OpenRoulette`, `ResolveRoulette`, `DrawRoulette`, `DrawRoulettePlunger`, `ApplyPowerup`, `POWER_FX` |
| Fort / HQ | `DamageBase`, `DestroyBase`, `FortifyBase`, `BreakBaseFort`, `GetBaseFortCells`, `StartEagleAlly`, `StartEagleStroll` |
| Eagle ally | `steelShield`, `BulletHitEagleAlly`, `DrawEagleAlly` — enemy shells deflect; never destroy HQ |
| Barricades | `carryBlocks`, `carriedBlock`, `WantsInteract`, barricade teach stage id |
| Bosses | `UpdateBoss`, `UpdateTankKing`, `RecoverBossMovement`, `UpdateTankMan`, `UpdatePrismTank`, `UpdateGravityWarden`, `ArmBossSkill`; route HP scaling is `stageData.bossHpMul` |
| Campaign | `CAMPAIGN_STAGE_IDS`, `GetCampaignStagePosition`, `GetNextCampaignStageId`, `IsFinalCampaignStage` |
| Checkpoint | `ReadStageCheckpoint`, `SaveStageCheckpoint`, `ContinueCampaign`, `RestoreStageCheckpoint` |
| Legacy stages | `STAGE_COUNT` (15), `BuildStageMap`, `Data_Stages.mjs`; Debug retains every definition |

---

## RULE / copy rules

- RULE panel = **rules only**, spaced; **no stage spoilers** (no「第N关 Boss名」dumps).
- Player-facing text may stay Chinese; code/asset names stay English PascalCase / category prefixes.
- Small copy/balance/bugfix asks: merge to `master` yourself (see Ship workflow).

---

## Quick checklists

### Changing lives / HP feel
1. Constants near top of `Script_Game.mjs` (`PLAYER_LIVES`, armor iframes); player hull HP was removed in v0.10
2. `DamagePlayer` / `KillPlayer` / mission checkpoint retry path
3. `BlitPlayerTinted` and desktop/mobile LIFE count if look changes
4. `SyncStageLabels` / `#difficultyHint` / RULE `<li>`
5. Cache-bust `?v=`

### Changing a roulette prize
1. `POWER` id (if new)
2. `ROULETTE_POOL` label + tier
3. `POWER_FX` entry
4. `ApplyPowerup` branch
5. RULE only if the **rule** changed (still no spoilers)

### Touching visuals / Pages
1. Edit owner file
2. Bump `?v=`
3. Merge `master` + smoke `https://bentleyblanks.github.io/GravityTank/`

### Easy mode / lives regression
Run `node GravityTank/Script_EasyModeTest.mjs` after changes to self-hit collision, lives, damage, or mode checkpoint handling. Also preview the title selector and gameplay at desktop and mobile sizes.
