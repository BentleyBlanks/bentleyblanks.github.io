# GravityTank — Agent Guide

Canonical play URL: `https://bentleyblanks.github.io/GravityTank/`  
Deploy branch: **`master` only**. Draft PR stacks do **not** ship.

This file is the agent map for GravityTank. Prefer it over dumping `Script_Game.mjs` (~7k lines). Root repo rules (naming, Sophia commits, Pages policy) live in `/AGENTS.md`.

---

## Ship workflow

1. Branch off `master`: `cursor/<short-kebab>-7bcb`
2. Commit with `GravityTank: short change summary` (no `feat:`/`fix:`, no trailing period)
3. Push → open PR → **for small/shippable asks, merge to `master` yourself**
4. Bump cache-bust `Script_Game.mjs?v=…` (and CSS `?v=` if style changed) in `index.html`
5. Confirm Pages build / live URL before treating the task as done

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
| `index.html` | Shell UI, RULE copy, logo/version, difficulty pick, cache-bust `?v=` |
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
| Easy seats (lives) | **5** | `PLAYER_LIVES_EASY` / `GetStartLives()` |
| Standard seats | **3** | `PLAYER_LIVES` |
| HP per seat | **3** | `PLAYER_MAX_HP` |
| Normal shell | −1 HP | `DamagePlayer` |
| Heavy / boss shell / bomb | oneshot | `IsHeavyIncoming` / `DamagePlayer({ heavy: true })` |
| Hit i-frames | 1.0 s | `HIT_IFRAME` |
| First death / stage | revive in place + 2 s shield | `stageReviveUsed`, `STAGE_REVIVE_PROTECT` |
| On death | keep firepower (−1 max) | `SoftenFirepowerOnDeath` / `KillPlayer` |
| Wipe upgrades | only on run fail | (not on seat loss) |

### Hull look by HP

Player sheet is classic yellow; draw remaps by remaining HP:

| HP | Look | Palette |
|----|------|---------|
| 3 | gold | `PLAYER_HP_PALETTE[3]` |
| 2 | orange | `PLAYER_HP_PALETTE[2]` |
| 1 | red | `PLAYER_HP_PALETTE[1]` |

Symbols: `BlitPlayerHpTinted`, `DrawTank` (player branch), overhead HP pips. Power tier still picks sheet row via `TankSheetOrigin` (`gy = (power-1)*2`). Enemy armor tanks use `BlitArmorTinted` + `ARMOR_HP_PALETTE` separately.

Difficulty copy: `BindDifficultyPick`, `SyncStageLabels`, `#difficultyHint` — say「座驾」+「每台 3 点生命」, not「双倍生命」.

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

When renaming a prize: update `ROULETTE_POOL` **and** matching `POWER_FX` label together.

---

## High-traffic symbols (`Script_Game.mjs`)

Grep these first:

| Area | Symbols |
|------|---------|
| Version | `GAME_VERSION` |
| Difficulty | `DIFFICULTY`, `IsEasy`, `GetStartLives`, `GetPowerDropRate`, `BindDifficultyPick` |
| Player HP / death | `DamagePlayer`, `KillPlayer`, `BlitPlayerHpTinted`, `stageReviveUsed`, `SoftenFirepowerOnDeath` |
| Draw | `DrawTank`, `TankSheetOrigin`, `BlitArmorTinted`, `BlitGrid` |
| Roulette | `ROULETTE_POOL`, `OpenRoulette`, `ResolveRoulette`, `DrawRoulette`, `DrawRoulettePlunger`, `ApplyPowerup`, `POWER_FX` |
| Fort / HQ | `FortifyBase`, `BreakBaseFort`, `GetBaseFortCells`, `StartEagleAlly`, `StartEagleStroll` |
| Barricades | `carryBlocks`, `carriedBlock`, `WantsInteract`, barricade teach stage id |
| Bosses | `UpdateBoss`, `UpdateTankKing`, `UpdateTankMan`, `ArmBossSkill` |
| Stages | `BuildStageMap`, `Data_Stages.mjs` exports |

---

## RULE / copy rules

- RULE panel = **rules only**, spaced; **no stage spoilers** (no「第N关 Boss名」dumps).
- Player-facing text may stay Chinese; code/asset names stay English PascalCase / category prefixes.
- Small copy/balance/bugfix asks: merge to `master` yourself (see Ship workflow).

---

## Quick checklists

### Changing lives / HP feel
1. Constants near top of `Script_Game.mjs` (`PLAYER_LIVES*`, `PLAYER_MAX_HP`, iframes)
2. `DamagePlayer` / `KillPlayer` / revive path
3. `BlitPlayerHpTinted` + pips if look changes
4. `BindDifficultyPick` / `SyncStageLabels` / `#difficultyHint` / RULE `<li>`
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
